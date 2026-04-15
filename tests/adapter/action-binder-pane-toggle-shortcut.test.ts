/**
 * @vitest-environment happy-dom
 *
 * Slice 6: pane re-toggle keyboard shortcuts.
 *
 * Ctrl/⌘+\         → toggle sidebar (left pane)
 * Ctrl+Shift+\     → toggle meta pane (right pane)
 *
 * These piggy-back on the same `togglePane` helper that powers the
 * existing tray-icon `data-pkc-action="toggle-sidebar"` / `toggle-meta`
 * buttons — the shortcut is a keyboard surface, not a new state
 * machine. Tests therefore assert the observable DOM side-effect
 * (`data-pkc-collapsed` attribute) rather than dispatcher output.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher as _createRawDispatcher } from '@adapter/state/dispatcher';
import { render } from '@adapter/ui/renderer';
import { __resetPanePrefsCacheForTest } from '@adapter/platform/pane-prefs';
import type { Container } from '@core/model/container';

const baseContainer: Container = {
  meta: {
    container_id: 'test-id',
    title: 'Test',
    created_at: '2026-04-13T00:00:00Z',
    updated_at: '2026-04-13T00:00:00Z',
    schema_version: 1,
  },
  entries: [
    {
      lid: 'e1',
      title: 'Sample',
      body: 'body',
      archetype: 'text',
      created_at: '2026-04-13T00:00:00Z',
      updated_at: '2026-04-13T00:00:00Z',
    },
  ],
  relations: [],
  revisions: [],
  assets: {},
};

const _trackedUnsubs: (() => void)[] = [];
function createDispatcher() {
  const d = _createRawDispatcher();
  return {
    ...d,
    onState(listener: Parameters<typeof d.onState>[0]) {
      const unsub = d.onState(listener);
      _trackedUnsubs.push(unsub);
      return unsub;
    },
    onEvent(listener: Parameters<typeof d.onEvent>[0]) {
      const unsub = d.onEvent(listener);
      _trackedUnsubs.push(unsub);
      return unsub;
    },
  };
}

let root: HTMLElement;
let cleanup: (() => void) | undefined;

function bootstrap(selectLid: string | null = 'e1') {
  const dispatcher = createDispatcher();
  dispatcher.onState((state) => render(state, root));
  dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: baseContainer });
  render(dispatcher.getState(), root);
  cleanup = bindActions(root, dispatcher);
  if (selectLid) {
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: selectLid });
    render(dispatcher.getState(), root);
  }
  return { dispatcher };
}

function keydown(opts: { key: string; ctrl?: boolean; meta?: boolean; shift?: boolean; target?: EventTarget }): KeyboardEvent {
  const e = new KeyboardEvent('keydown', {
    key: opts.key,
    ctrlKey: !!opts.ctrl,
    metaKey: !!opts.meta,
    shiftKey: !!opts.shift,
    bubbles: true,
    cancelable: true,
  });
  (opts.target ?? document).dispatchEvent(e);
  return e;
}

function sidebar(): HTMLElement | null {
  return root.querySelector<HTMLElement>('[data-pkc-region="sidebar"]');
}
function metaPane(): HTMLElement | null {
  return root.querySelector<HTMLElement>('[data-pkc-region="meta"]');
}

beforeEach(() => {
  // S-19 (2026-04-14): reset pane-prefs cache + localStorage between
  // tests. The renderer now reads persisted prefs on the first
  // render (so toggles survive re-renders and reloads), which means
  // a previous test's toggle-to-collapsed can leak into the next
  // test's boot state if we don't clear both.
  __resetPanePrefsCacheForTest();
  localStorage.clear();
  root = document.createElement('div');
  root.id = 'pkc-root';
  document.body.appendChild(root);
  return () => {
    cleanup?.();
    cleanup = undefined;
    for (const fn of _trackedUnsubs) fn();
    _trackedUnsubs.length = 0;
    root.remove();
    __resetPanePrefsCacheForTest();
    localStorage.clear();
  };
});

describe('Slice 6: pane re-toggle shortcut', () => {
  it('Ctrl+\\ toggles the sidebar (collapse → expand → collapse)', () => {
    bootstrap();
    const sb = sidebar();
    expect(sb).not.toBeNull();
    // Initial: not collapsed.
    expect(sb!.getAttribute('data-pkc-collapsed')).toBeNull();

    keydown({ key: '\\', ctrl: true });
    expect(sb!.getAttribute('data-pkc-collapsed')).toBe('true');

    keydown({ key: '\\', ctrl: true });
    expect(sb!.getAttribute('data-pkc-collapsed')).toBeNull();
  });

  it('⌘+\\ (macOS) also toggles the sidebar', () => {
    bootstrap();
    const sb = sidebar();
    keydown({ key: '\\', meta: true });
    expect(sb!.getAttribute('data-pkc-collapsed')).toBe('true');
  });

  it('Ctrl+Shift+\\ toggles the meta pane (right)', () => {
    bootstrap();
    const mp = metaPane();
    expect(mp).not.toBeNull();
    expect(mp!.getAttribute('data-pkc-collapsed')).toBeNull();

    keydown({ key: '\\', ctrl: true, shift: true });
    expect(mp!.getAttribute('data-pkc-collapsed')).toBe('true');

    // Sidebar was NOT flipped.
    expect(sidebar()!.getAttribute('data-pkc-collapsed')).toBeNull();

    keydown({ key: '\\', ctrl: true, shift: true });
    expect(mp!.getAttribute('data-pkc-collapsed')).toBeNull();
  });

  it('shortcut is suppressed when typing in a textarea (literal \\ stays in the value)', () => {
    bootstrap();
    const ta = document.createElement('textarea');
    root.appendChild(ta);
    ta.focus();
    const sb = sidebar();
    const before = sb!.getAttribute('data-pkc-collapsed');
    const evt = keydown({ key: '\\', ctrl: true, target: ta });
    // No preventDefault → the browser default (insert literal) runs.
    expect(evt.defaultPrevented).toBe(false);
    expect(sb!.getAttribute('data-pkc-collapsed')).toBe(before);
  });

  it('shortcut is suppressed when typing in a text input', () => {
    bootstrap();
    const input = document.createElement('input');
    input.type = 'text';
    root.appendChild(input);
    input.focus();
    const evt = keydown({ key: '\\', ctrl: true, target: input });
    expect(evt.defaultPrevented).toBe(false);
    expect(sidebar()!.getAttribute('data-pkc-collapsed')).toBeNull();
  });

  it('shortcut is suppressed inside a contenteditable region', () => {
    bootstrap();
    const div = document.createElement('div');
    div.setAttribute('contenteditable', 'true');
    root.appendChild(div);
    div.focus();
    const evt = keydown({ key: '\\', ctrl: true, target: div });
    expect(evt.defaultPrevented).toBe(false);
    expect(sidebar()!.getAttribute('data-pkc-collapsed')).toBeNull();
  });

  it('plain \\ without modifier does NOT toggle', () => {
    bootstrap();
    keydown({ key: '\\' });
    expect(sidebar()!.getAttribute('data-pkc-collapsed')).toBeNull();
    expect(metaPane()!.getAttribute('data-pkc-collapsed')).toBeNull();
  });

  it('Ctrl+? (help) still works — not clobbered by the new handler', () => {
    bootstrap();
    const help = root.querySelector<HTMLElement>('[data-pkc-region="shortcut-help"]');
    expect(help).not.toBeNull();
    expect(help!.style.display).toBe('none');
    keydown({ key: '?', ctrl: true });
    expect(help!.style.display).not.toBe('none');
  });

  it('help overlay lists the new pane shortcuts', () => {
    bootstrap();
    const help = root.querySelector<HTMLElement>('[data-pkc-region="shortcut-help"]');
    expect(help?.textContent).toContain('Toggle sidebar');
    expect(help?.textContent).toContain('Toggle meta pane');
    expect(help?.textContent).toContain('Ctrl+\\');
  });
});
