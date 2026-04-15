/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDispatcher } from '@adapter/state/dispatcher';
import { bindActions } from '@adapter/ui/action-binder';
import { render } from '@adapter/ui/renderer';
import {
  PANE_PREFS_STORAGE_KEY,
  __resetPanePrefsCacheForTest,
} from '@adapter/platform/pane-prefs';
import type { Container } from '@core/model/container';

/**
 * USER_REQUEST_LEDGER S-19 (H-7, 2026-04-14) — end-to-end pane
 * state persistence. Pins the behaviour the user actually touches:
 *
 *   1. Renderer honours the persisted prefs on the first render
 *      (no collapsed-to-expanded flash on reload).
 *   2. Clicking / shortcutting a tray toggle persists the new
 *      collapsed state and updates the DOM synchronously.
 *   3. A re-render (from any unrelated dispatch) preserves the
 *      toggled state (the renderer re-reads prefs each pass).
 *   4. Malformed stored prefs fall back to defaults without
 *      throwing.
 */

function makeContainer(): Container {
  return {
    meta: {
      container_id: 'pane-cid',
      title: 'Pane persist fixture',
      created_at: '2026-04-01T00:00:00.000Z',
      updated_at: '2026-04-01T00:00:00.000Z',
      schema_version: 1,
    },
    entries: [
      {
        lid: 'e1',
        title: 'Selected entry',
        body: 'body',
        archetype: 'text',
        created_at: '2026-04-01T00:00:00.000Z',
        updated_at: '2026-04-01T00:00:00.000Z',
      },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };
}

let root: HTMLElement;
let cleanup: (() => void) | null = null;

beforeEach(() => {
  __resetPanePrefsCacheForTest();
  localStorage.clear();
  root = document.createElement('div');
  root.id = 'pkc-root';
  document.body.appendChild(root);
});

afterEach(() => {
  cleanup?.();
  cleanup = null;
  document.body.removeChild(root);
  __resetPanePrefsCacheForTest();
  localStorage.clear();
});

function seedPrefs(sidebar: boolean, meta: boolean): void {
  localStorage.setItem(
    PANE_PREFS_STORAGE_KEY,
    JSON.stringify({ sidebar, meta }),
  );
}

function boot(selectEntry = true): ReturnType<typeof createDispatcher> {
  const dispatcher = createDispatcher();
  dispatcher.onState((s) => render(s, root));
  dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
  cleanup = bindActions(root, dispatcher);
  if (selectEntry) {
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
  }
  render(dispatcher.getState(), root);
  return dispatcher;
}

describe('pane persistence — initial render honours stored prefs', () => {
  it('defaults to expanded when no prefs are stored', () => {
    boot();
    expect(
      root.querySelector('[data-pkc-region="sidebar"]')!.hasAttribute('data-pkc-collapsed'),
    ).toBe(false);
    expect(
      root.querySelector('[data-pkc-region="meta"]')!.hasAttribute('data-pkc-collapsed'),
    ).toBe(false);
    expect(
      (root.querySelector('[data-pkc-region="tray-left"]') as HTMLElement).style.display,
    ).toBe('none');
  });

  it('reflects stored sidebar=collapsed on the very first render', () => {
    seedPrefs(true, false);
    boot();
    const sidebar = root.querySelector('[data-pkc-region="sidebar"]')!;
    expect(sidebar.getAttribute('data-pkc-collapsed')).toBe('true');
    const leftTray = root.querySelector<HTMLElement>('[data-pkc-region="tray-left"]')!;
    expect(leftTray.style.display).toBe('');
    const leftHandle = root.querySelector('[data-pkc-resize="left"]')!;
    expect(leftHandle.getAttribute('data-pkc-collapsed')).toBe('true');
  });

  it('reflects stored meta=collapsed on the very first render', () => {
    seedPrefs(false, true);
    boot(true);
    const meta = root.querySelector('[data-pkc-region="meta"]')!;
    expect(meta.getAttribute('data-pkc-collapsed')).toBe('true');
    const rightTray = root.querySelector<HTMLElement>('[data-pkc-region="tray-right"]')!;
    expect(rightTray.style.display).toBe('');
  });

  it('does not surface meta tray when no entry is selected, even if prefs say meta collapsed', () => {
    seedPrefs(false, true);
    boot(/* selectEntry */ false);
    // Meta pane is absent when no entry is selected.
    expect(root.querySelector('[data-pkc-region="meta"]')).toBeNull();
    // Right tray stays hidden (no one to toggle to).
    const rightTray = root.querySelector<HTMLElement>('[data-pkc-region="tray-right"]')!;
    expect(rightTray.style.display).toBe('none');
  });

  it('falls back to defaults when stored JSON is malformed', () => {
    localStorage.setItem(PANE_PREFS_STORAGE_KEY, 'not-json');
    boot();
    expect(
      root.querySelector('[data-pkc-region="sidebar"]')!.hasAttribute('data-pkc-collapsed'),
    ).toBe(false);
  });
});

describe('pane persistence — toggle click persists + re-render preserves state', () => {
  it('clicking the sidebar tray collapses sidebar AND writes prefs', () => {
    boot();
    // User clicks the "toggle sidebar" tray bar (the left tray
    // starts hidden; a click on the sidebar's active toggle control
    // — whichever drives togglePane — persists). We go through the
    // shortcut because the tray is hidden by default.
    const evt = new KeyboardEvent('keydown', {
      key: '\\',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(evt);
    const sidebar = root.querySelector('[data-pkc-region="sidebar"]')!;
    expect(sidebar.getAttribute('data-pkc-collapsed')).toBe('true');
    const stored = JSON.parse(localStorage.getItem(PANE_PREFS_STORAGE_KEY)!);
    expect(stored).toEqual({ sidebar: true, meta: false });
  });

  it('after a toggle, an unrelated dispatch re-renders WITHOUT losing the collapsed state', () => {
    const dispatcher = boot();
    // Collapse sidebar via shortcut.
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: '\\', ctrlKey: true, bubbles: true, cancelable: true }),
    );
    expect(
      root.querySelector('[data-pkc-region="sidebar"]')!.getAttribute('data-pkc-collapsed'),
    ).toBe('true');
    // Any dispatch triggers a re-render. Pick something that produces
    // a state change so onState fires.
    dispatcher.dispatch({ type: 'SET_SEARCH_QUERY', query: 'x' });
    // Sidebar still collapsed after the re-render.
    expect(
      root.querySelector('[data-pkc-region="sidebar"]')!.getAttribute('data-pkc-collapsed'),
    ).toBe('true');
  });

  it('Ctrl+Shift+\\ collapses meta AND persists', () => {
    boot();
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: '\\',
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(
      root.querySelector('[data-pkc-region="meta"]')!.getAttribute('data-pkc-collapsed'),
    ).toBe('true');
    const stored = JSON.parse(localStorage.getItem(PANE_PREFS_STORAGE_KEY)!);
    expect(stored).toEqual({ sidebar: false, meta: true });
  });

  it('toggling twice returns to expanded AND the stored value matches', () => {
    boot();
    // Collapse then expand.
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: '\\', ctrlKey: true, bubbles: true, cancelable: true }),
    );
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: '\\', ctrlKey: true, bubbles: true, cancelable: true }),
    );
    expect(
      root.querySelector('[data-pkc-region="sidebar"]')!.hasAttribute('data-pkc-collapsed'),
    ).toBe(false);
    const stored = JSON.parse(localStorage.getItem(PANE_PREFS_STORAGE_KEY)!);
    expect(stored).toEqual({ sidebar: false, meta: false });
  });
});
