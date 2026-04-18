/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDispatcher } from '@adapter/state/dispatcher';
import { bindActions } from '@adapter/ui/action-binder';
import { render, renderContextMenu } from '@adapter/ui/renderer';
import type { Container } from '@core/model/container';

/**
 * Polish — Escape key dismisses the custom right-click context menu
 * (2026-04-14, selected from USER_REQUEST_LEDGER §4).
 *
 * Background: Escape handler in action-binder was wired for every
 * other transient overlay (ShellMenu / ShortcutHelp / StorageProfile
 * / TextlogPreview / TextToTextlog / AssetPicker / AssetAutocomplete
 * / SlashMenu) but the custom context menu had no Esc path. The fix
 * adds a single branch at the very top of the Escape cascade so the
 * topmost transient closes first — users can now reach for Esc as
 * the universal "cancel this popup" gesture.
 *
 * Contract:
 *   - Context menu DOM node carries `data-pkc-region="context-menu"`.
 *   - `dismissContextMenu` inside action-binder removes the node.
 *   - Esc must call it BEFORE any other overlay's close path fires
 *     so "click then change mind" is a single-key action.
 */

function makeContainer(): Container {
  return {
    meta: {
      container_id: 'test-cid',
      title: 'Test',
      created_at: '2026-04-01T00:00:00.000Z',
      updated_at: '2026-04-01T00:00:00.000Z',
      schema_version: 1,
    },
    entries: [
      {
        lid: 'e1',
        title: 'Entry One',
        body: 'body one',
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
  root = document.createElement('div');
  root.id = 'pkc-root';
  document.body.appendChild(root);
});

afterEach(() => {
  if (cleanup) {
    cleanup();
    cleanup = null;
  }
  document.body.removeChild(root);
});

describe('Escape closes the custom context menu', () => {
  it('removes the context menu node when Esc is pressed', () => {
    const dispatcher = createDispatcher();
    dispatcher.onState((s) => render(s, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    cleanup = bindActions(root, dispatcher);
    render(dispatcher.getState(), root);

    // Simulate what handleContextMenu does: append the menu directly.
    const menu = renderContextMenu('e1', 100, 100, {
      archetype: 'text',
      canEdit: true,
      hasParent: false,
    });
    root.appendChild(menu);
    expect(root.querySelector('[data-pkc-region="context-menu"]')).toBeTruthy();

    // User presses Escape at the document level.
    const evt = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.dispatchEvent(evt);

    // Menu is gone.
    expect(root.querySelector('[data-pkc-region="context-menu"]')).toBeNull();
  });

  it('closes ONLY the context menu when a shell menu is also visible', () => {
    // Parity test: the Esc cascade picks context menu first because
    // it's the topmost transient. Shell menu (the real one emitted
    // by renderer.ts at `data-pkc-region="shell-menu"`) stays open.
    const dispatcher = createDispatcher();
    dispatcher.onState((s) => render(s, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    cleanup = bindActions(root, dispatcher);
    render(dispatcher.getState(), root);

    // Open the shell menu via state dispatch.
    dispatcher.dispatch({ type: 'TOGGLE_MENU' });
    render(dispatcher.getState(), root);
    let shell = root.querySelector<HTMLElement>('[data-pkc-region="shell-menu"]');
    expect(shell).toBeTruthy();
    expect(shell!.style.display).not.toBe('none');

    // Open context menu on top.
    const menu = renderContextMenu('e1', 100, 100, {
      archetype: 'text',
      canEdit: true,
      hasParent: false,
    });
    root.appendChild(menu);

    // Esc #1 → context menu closes, shell menu stays visible.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(root.querySelector('[data-pkc-region="context-menu"]')).toBeNull();
    shell = root.querySelector<HTMLElement>('[data-pkc-region="shell-menu"]');
    expect(shell!.style.display).not.toBe('none');

    // Esc #2 → now the shell menu closes (existing behaviour preserved).
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(dispatcher.getState().menuOpen).toBe(false);
  });

  it('does NOT dispatch DESELECT_ENTRY when closing only the context menu', () => {
    // Regression guard: before the fix Esc would fall through to the
    // selection-clearing branch, so right-click → Esc would lose the
    // current selection. After the fix the first Esc only closes the
    // menu.
    const dispatcher = createDispatcher();
    dispatcher.onState((s) => render(s, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    cleanup = bindActions(root, dispatcher);
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    render(dispatcher.getState(), root);

    expect(dispatcher.getState().selectedLid).toBe('e1');

    const menu = renderContextMenu('e1', 100, 100, {
      archetype: 'text',
      canEdit: true,
      hasParent: false,
    });
    root.appendChild(menu);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));

    expect(root.querySelector('[data-pkc-region="context-menu"]')).toBeNull();
    // Selection preserved.
    expect(dispatcher.getState().selectedLid).toBe('e1');
  });
});
