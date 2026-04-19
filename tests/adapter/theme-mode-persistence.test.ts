/**
 * FI-Settings v1 follow-up (2026-04-18): theme mode persistence.
 *
 * Covers the UI wiring fix: `set-theme` must dispatch SET_THEME_MODE
 * (previously it only mutated DOM attributes, so theme changes were
 * visual-only and lost on reload). Also covers the UI ↔ payload
 * vocabulary mapping: UI uses `'system'`, payload uses `'auto'`.
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher } from '@adapter/state/dispatcher';
import { render } from '@adapter/ui/renderer';
import { SETTINGS_LID } from '@core/model/record';
import { resolveSettingsPayload } from '@core/model/system-settings-payload';
import type { Container } from '@core/model/container';
import type { DomainEvent } from '@core/action/domain-event';

const mockContainer: Container = {
  meta: {
    container_id: 'test-id',
    title: 'Test',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    schema_version: 1,
  },
  entries: [],
  relations: [],
  revisions: [],
  assets: {},
};

let root: HTMLElement;
let cleanup: (() => void) | null = null;

beforeEach(() => {
  root = document.createElement('div');
  root.id = 'pkc-root';
  document.body.appendChild(root);
  return () => {
    cleanup?.();
    cleanup = null;
    root.remove();
  };
});

function setup() {
  const dispatcher = createDispatcher();
  const events: DomainEvent[] = [];
  dispatcher.onEvent((e) => events.push(e));
  dispatcher.onState((state) => render(state, root));

  dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: mockContainer });
  render(dispatcher.getState(), root);
  cleanup = bindActions(root, dispatcher);

  return { dispatcher, events };
}

function clickThemeButton(mode: 'light' | 'dark' | 'system'): void {
  const btn = root.querySelector<HTMLElement>(
    `[data-pkc-action="set-theme"][data-pkc-theme-mode="${mode}"]`,
  );
  expect(btn).not.toBeNull();
  btn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

describe('set-theme click dispatches SET_THEME_MODE', () => {
  it('light button → mode "light" in state + settings', () => {
    const { dispatcher, events } = setup();
    clickThemeButton('light');
    expect(dispatcher.getState().settings?.theme.mode).toBe('light');
    expect(events.some((e) => e.type === 'SETTINGS_CHANGED')).toBe(true);
  });

  it('dark button → mode "dark" in state + settings', () => {
    const { dispatcher } = setup();
    clickThemeButton('dark');
    expect(dispatcher.getState().settings?.theme.mode).toBe('dark');
  });

  it('system button → maps to payload mode "auto"', () => {
    // UI label is "System" but the SystemSettingsPayload uses "auto"
    // (follows prefers-color-scheme). The action-binder must translate
    // at the UI boundary — otherwise the reducer rejects the unknown
    // mode and nothing persists.
    const { dispatcher } = setup();
    // Start from an explicit mode so the system click produces a visible delta.
    clickThemeButton('dark');
    expect(dispatcher.getState().settings?.theme.mode).toBe('dark');
    clickThemeButton('system');
    expect(dispatcher.getState().settings?.theme.mode).toBe('auto');
  });
});

describe('theme mode → __settings__ upsert', () => {
  it('click writes theme.mode into the persisted __settings__ entry body', () => {
    const { dispatcher } = setup();
    clickThemeButton('dark');
    const entry = dispatcher
      .getState()
      .container!.entries.find((e) => e.lid === SETTINGS_LID);
    expect(entry).toBeDefined();
    expect(entry!.archetype).toBe('system-settings');
    const payload = resolveSettingsPayload(entry!.body);
    expect(payload.theme.mode).toBe('dark');
  });

  it('multiple theme changes only upsert one __settings__ entry', () => {
    const { dispatcher } = setup();
    clickThemeButton('light');
    clickThemeButton('dark');
    clickThemeButton('system');
    const matches = dispatcher
      .getState()
      .container!.entries.filter((e) => e.lid === SETTINGS_LID);
    expect(matches).toHaveLength(1);
    const payload = resolveSettingsPayload(matches[0]!.body);
    expect(payload.theme.mode).toBe('auto');
  });
});

describe('theme mode DOM attribute sync', () => {
  it('light click → data-pkc-theme="light"', () => {
    setup();
    clickThemeButton('light');
    expect(root.getAttribute('data-pkc-theme')).toBe('light');
  });

  it('dark click → data-pkc-theme="dark"', () => {
    setup();
    clickThemeButton('dark');
    expect(root.getAttribute('data-pkc-theme')).toBe('dark');
  });

  it('system click → data-pkc-theme attribute is removed (CSS falls back to prefers-color-scheme)', () => {
    setup();
    clickThemeButton('dark');
    expect(root.getAttribute('data-pkc-theme')).toBe('dark');
    clickThemeButton('system');
    expect(root.hasAttribute('data-pkc-theme')).toBe(false);
  });
});

describe('theme mode restore on boot', () => {
  it('RESTORE_SETTINGS with mode "dark" → DOM reflects it on next render', () => {
    const { dispatcher } = setup();
    dispatcher.dispatch({
      type: 'RESTORE_SETTINGS',
      settings: {
        format: 'pkc2-system-settings',
        version: 1,
        theme: {
          mode: 'dark',
          scanline: false,
          accentColor: null,
          borderColor: null,
          backgroundColor: null,
          uiTextColor: null,
          bodyTextColor: null,
        },
        display: { preferredFont: null, fontDirectInput: null },
        locale: { language: null, timezone: null },
      },
    });
    expect(dispatcher.getState().settings?.theme.mode).toBe('dark');
    expect(root.getAttribute('data-pkc-theme')).toBe('dark');
  });

  it('RESTORE_SETTINGS does NOT emit SETTINGS_CHANGED (boot replay, not a user modification)', () => {
    const { dispatcher, events } = setup();
    const before = events.filter((e) => e.type === 'SETTINGS_CHANGED').length;
    dispatcher.dispatch({
      type: 'RESTORE_SETTINGS',
      settings: {
        format: 'pkc2-system-settings',
        version: 1,
        theme: {
          mode: 'light',
          scanline: false,
          accentColor: null,
          borderColor: null,
          backgroundColor: null,
          uiTextColor: null,
          bodyTextColor: null,
        },
        display: { preferredFont: null, fontDirectInput: null },
        locale: { language: null, timezone: null },
      },
    });
    const after = events.filter((e) => e.type === 'SETTINGS_CHANGED').length;
    expect(after).toBe(before);
  });
});
