/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach } from 'vitest';
import { reduce, createInitialState, type AppState } from '@adapter/state/app-state';
import { createDispatcher } from '@adapter/state/dispatcher';
import { render } from '@adapter/ui/renderer';
import { SETTINGS_LID } from '@core/model/record';
import {
  SETTINGS_DEFAULTS,
  resolveSettingsPayload,
  type SystemSettingsPayload,
} from '@core/model/system-settings-payload';
import type { Container } from '@core/model/container';

/**
 * C11 §4.6 — prefs 単体インポート / エクスポート導線。
 *
 * 契約:
 *   - IMPORT_SETTINGS: uiPrefs は key 単位 merge(削除しない)、
 *     theme / display / locale は上書き。readonly は blocked
 *   - ⚙ Settings(shell menu)に Settings File section が出る。
 *     import ボタンは readonly で disabled、export は常に enabled
 */

const T = '2026-07-22T00:00:00Z';

function makeContainer(): Container {
  return {
    meta: { container_id: 'c-p3', title: 't', created_at: T, updated_at: T, schema_version: 1 },
    entries: [],
    relations: [],
    revisions: [],
    assets: {},
  };
}

function readyState(overrides: Partial<AppState> = {}): AppState {
  return { ...createInitialState(), phase: 'ready', container: makeContainer(), ...overrides };
}

const importedPayload: SystemSettingsPayload = {
  ...SETTINGS_DEFAULTS,
  theme: { ...SETTINGS_DEFAULTS.theme, mode: 'dark' },
  uiPrefs: { 'pkc2.editMode': 'window', 'pkc2.new': 'x' },
};

describe('IMPORT_SETTINGS reducer', () => {
  it('theme 等は上書き、uiPrefs は merge、SETTINGS_CHANGED を emit', () => {
    const base = reduce(readyState(), {
      type: 'SET_UI_PREFS',
      values: { 'pkc2.editMode': 'inline', 'pkc2.keep': 'kept' },
    }).state;
    const { state: next, events } = reduce(base, {
      type: 'IMPORT_SETTINGS',
      settings: importedPayload,
    });
    expect(next.settings!.theme.mode).toBe('dark');
    // merge: import 側が勝ち、import に無い既存 key は残る
    expect(next.settings!.uiPrefs).toEqual({
      'pkc2.editMode': 'window',
      'pkc2.keep': 'kept',
      'pkc2.new': 'x',
    });
    expect(events.some((e) => e.type === 'SETTINGS_CHANGED')).toBe(true);
    const entry = next.container!.entries.find((e) => e.lid === SETTINGS_LID)!;
    expect(resolveSettingsPayload(entry.body).uiPrefs['pkc2.keep']).toBe('kept');
  });

  it('現在の設定と同一なら identity 保存・event なし', () => {
    const s1 = reduce(readyState(), {
      type: 'IMPORT_SETTINGS',
      settings: importedPayload,
    }).state;
    const { state: s2, events } = reduce(s1, {
      type: 'IMPORT_SETTINGS',
      settings: s1.settings!,
    });
    expect(s2).toBe(s1);
    expect(events).toHaveLength(0);
  });

  it('readonly では blocked(state 不変)', () => {
    const state = readyState({ readonly: true });
    const { state: next, events } = reduce(state, {
      type: 'IMPORT_SETTINGS',
      settings: importedPayload,
    });
    expect(next).toBe(state);
    expect(events).toHaveLength(0);
  });
});

describe('⚙ Settings の Settings File section', () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement('div');
    root.id = 'pkc-root';
    document.body.appendChild(root);
    return () => {
      root.remove();
    };
  });

  function renderMenu(opts: { readonly?: boolean } = {}): void {
    const d = createDispatcher();
    d.dispatch({
      type: 'SYS_INIT_COMPLETE',
      container: makeContainer(),
      readonly: opts.readonly,
    });
    d.dispatch({ type: 'TOGGLE_MENU' });
    render(d.getState(), root);
  }

  it('export / import ボタンが描画される', () => {
    renderMenu();
    const region = root.querySelector('[data-pkc-region="shell-menu-prefs-file"]');
    expect(region).not.toBeNull();
    const exportBtn = region!.querySelector<HTMLButtonElement>('[data-pkc-action="prefs-export"]');
    const importBtn = region!.querySelector<HTMLButtonElement>('[data-pkc-action="prefs-import"]');
    expect(exportBtn).not.toBeNull();
    expect(importBtn).not.toBeNull();
    expect(exportBtn!.disabled).toBe(false);
    expect(importBtn!.disabled).toBe(false);
  });

  it('readonly では import が disabled、export は enabled', () => {
    renderMenu({ readonly: true });
    const region = root.querySelector('[data-pkc-region="shell-menu-prefs-file"]');
    expect(region).not.toBeNull();
    const exportBtn = region!.querySelector<HTMLButtonElement>('[data-pkc-action="prefs-export"]');
    const importBtn = region!.querySelector<HTMLButtonElement>('[data-pkc-action="prefs-import"]');
    expect(exportBtn!.disabled).toBe(false);
    expect(importBtn!.disabled).toBe(true);
  });
});
