/**
 * Phase γ-A2(A2-1):shell 編集モード foundation。
 *
 * 3 点を検証する:
 *   - AppState `editMode` field(初期値 undefined = 従来 inline 編集)
 *   - `SET_EDIT_MODE` reducer(reduceReady 内、純粋 state mutation)
 *   - Tier 0 flag `shell.edit_mode_enabled`(default false)
 *
 * UI / wiring は γ-A2 で接続する。本 PR は foundation のみで consumer を
 * 持たないため、reform-2026-05 Phase 8「state mutation → consumer
 * behavior」end-to-end parity test は consumer が出来る γ-A2 で添付する。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { Container } from '@core/model/container';
import { reduce, createInitialState } from '@adapter/state/app-state';
import type { AppState } from '@adapter/state/app-state';
import { createDispatcher } from '@adapter/state/dispatcher';
import {
  __resetRegistry,
  __resetUrlCache,
  setContainerFlagSource,
} from '@adapter/flags';
import { shellEditModeEnabled } from '@adapter/ui/shell-flags';

function mkContainer(): Container {
  const ts = '2026-01-01T00:00:00Z';
  return {
    meta: {
      container_id: 'c1',
      title: 'test',
      created_at: ts,
      updated_at: ts,
      schema_version: 1,
    },
    entries: [],
    relations: [],
    revisions: [],
    assets: {},
  };
}

/** SET_EDIT_MODE は reduceReady 内なので phase='ready' の state が要る。 */
function readyState(overrides: Partial<AppState> = {}): AppState {
  return {
    ...createInitialState(),
    phase: 'ready',
    container: mkContainer(),
    ...overrides,
  };
}

describe('SET_EDIT_MODE reducer (Phase γ-A2 A2-1 foundation)', () => {
  it('createInitialState: editMode は undefined(従来 inline 編集 = 後方互換)', () => {
    expect(createInitialState().editMode).toBeUndefined();
  });

  it("undefined → 'window'", () => {
    const { state: after } = reduce(readyState(), {
      type: 'SET_EDIT_MODE',
      mode: 'window',
    });
    expect(after.editMode).toBe('window');
  });

  it("undefined → 'inline'", () => {
    const { state: after } = reduce(readyState(), {
      type: 'SET_EDIT_MODE',
      mode: 'inline',
    });
    expect(after.editMode).toBe('inline');
  });

  it("'window' → 'inline' で上書きされる", () => {
    const s1 = reduce(readyState(), { type: 'SET_EDIT_MODE', mode: 'window' }).state;
    expect(s1.editMode).toBe('window');
    const s2 = reduce(s1, { type: 'SET_EDIT_MODE', mode: 'inline' }).state;
    expect(s2.editMode).toBe('inline');
  });

  it('events は空(副作用なしの pure state mutation)', () => {
    const { events } = reduce(readyState(), { type: 'SET_EDIT_MODE', mode: 'window' });
    expect(events).toEqual([]);
  });

  it('phase / selectedLid / editingLid / container を変更しない', () => {
    const before = readyState({ selectedLid: 'e1', editingLid: 'e1' });
    const { state: after } = reduce(before, { type: 'SET_EDIT_MODE', mode: 'window' });
    expect(after.phase).toBe('ready');
    expect(after.selectedLid).toBe('e1');
    expect(after.editingLid).toBe('e1');
    expect(after.container).toBe(before.container);
  });

  it('新しい state object を返し、元 state は不変(immutability)', () => {
    const before = readyState();
    const { state: after } = reduce(before, { type: 'SET_EDIT_MODE', mode: 'window' });
    expect(after).not.toBe(before);
    expect(before.editMode).toBeUndefined();
  });

  it('initializing phase では blocked(reduceReady 限定、副作用なし)', () => {
    const initState = createInitialState();
    expect(initState.phase).toBe('initializing');
    const { state: after } = reduce(initState, { type: 'SET_EDIT_MODE', mode: 'window' });
    expect(after.editMode).toBeUndefined();
  });

  it('dispatcher 経由で getState に反映される', () => {
    const dispatcher = createDispatcher();
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: mkContainer() });
    dispatcher.dispatch({ type: 'SET_EDIT_MODE', mode: 'window' });
    expect(dispatcher.getState().editMode).toBe('window');
  });
});

describe('shell.edit_mode_enabled flag (Phase γ-A2 A2-1 foundation)', () => {
  beforeEach(() => {
    __resetRegistry();
    delete (globalThis as { __PKC_FLAGS_URL__?: Record<string, string> })
      .__PKC_FLAGS_URL__;
    __resetUrlCache();
  });

  it('default は false(OFF で従来 inline 編集のみ)', () => {
    expect(shellEditModeEnabled()).toBe(false);
  });

  it('container source で true に切替', () => {
    setContainerFlagSource({ 'shell.edit_mode_enabled': true });
    expect(shellEditModeEnabled()).toBe(true);
  });

  it('container source で明示 false を指定しても false', () => {
    setContainerFlagSource({ 'shell.edit_mode_enabled': false });
    expect(shellEditModeEnabled()).toBe(false);
  });

  it('URL source(?pkc-flag)で true に切替', () => {
    (globalThis as { __PKC_FLAGS_URL__?: Record<string, string> })
      .__PKC_FLAGS_URL__ = { 'shell.edit_mode_enabled': 'true' };
    __resetUrlCache();
    expect(shellEditModeEnabled()).toBe(true);
  });
});
