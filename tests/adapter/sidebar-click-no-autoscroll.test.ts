/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach } from 'vitest';
import { createDispatcher } from '@adapter/state/dispatcher';
import { bindActions } from '@adapter/ui/action-binder';
import { render } from '@adapter/ui/renderer';
import type { Container } from '@core/model/container';

/**
 * 2026-04-27 user audit:
 *   「左ペインがスクロールオンするほどのエントリが大量にある状態で、
 *    エントリを選択すると、エントリがスクロール表示域の下端になる
 *    ように勝手にずれる。これにより、ユーザーはダブルクリックしたい
 *    のに別のエントリを選択するという動作になっている」
 *
 * The post-render `scrollSelectedSidebarNodeIntoView` helper used to
 * fire on every selection change, including clicks that originated
 * from the sidebar itself — where the row is by definition already
 * visible. `scrollIntoView({block:'nearest'})` on a partially-clipped
 * row tugs the row up to align its bottom with the viewport edge,
 * which silently shifts the cursor onto a different entry. When the
 * user follows up with a second click intending a double-click, the
 * second click lands on the wrong row.
 *
 * Fix: when `SELECT_ENTRY` originates from a click INSIDE the
 * sidebar, pre-write the renderer's `data-pkc-last-scrolled-lid`
 * memo so the post-render auto-scroll helper short-circuits. Other
 * surfaces (breadcrumb, recent pane, calendar/kanban, search-result
 * row, entry-ref link) still benefit from the auto-scroll.
 */

const T = '2026-04-27T00:00:00.000Z';

function manyEntriesContainer(count: number): Container {
  const entries = Array.from({ length: count }, (_, i) => ({
    lid: `e${i}`,
    title: `Entry ${i}`,
    archetype: 'text' as const,
    body: `body ${i}`,
    created_at: T,
    updated_at: T,
  }));
  return {
    meta: { container_id: 'big', title: 'Big', created_at: T, updated_at: T, schema_version: 1 },
    entries,
    relations: [],
    revisions: [],
    assets: {},
  };
}

let root: HTMLElement;
let cleanup: (() => void) | undefined;

beforeEach(() => {
  root = document.createElement('div');
  root.id = 'pkc-root';
  document.body.appendChild(root);
  return () => {
    cleanup?.();
    cleanup = undefined;
    root.remove();
  };
});

function setup(count: number) {
  const dispatcher = createDispatcher();
  dispatcher.onState((state) => render(state, root));
  dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: manyEntriesContainer(count) });
  render(dispatcher.getState(), root);
  cleanup = bindActions(root, dispatcher);
  return dispatcher;
}

describe('sidebar click does not trigger redundant scrollIntoView', () => {
  it('clicking an entry inside the sidebar pre-arms the last-scrolled memo so the post-render helper is a no-op', () => {
    setup(50);
    const calls: string[] = [];
    const orig = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = function (this: HTMLElement) {
      calls.push(this.getAttribute('data-pkc-lid') ?? '<no-lid>');
    };
    try {
      const row = root.querySelector<HTMLElement>(
        '.pkc-entry-list li.pkc-entry-item[data-pkc-lid="e7"]',
      );
      expect(row).not.toBeNull();
      row!.click();

      // The renderer's helper short-circuits because the action-
      // binder pre-wrote `data-pkc-last-scrolled-lid` to "e7".
      expect(root.dataset.pkcLastScrolledLid).toBe('e7');
      expect(calls.filter((lid) => lid === 'e7')).toEqual([]);
    } finally {
      HTMLElement.prototype.scrollIntoView = orig;
    }
  });

  it('selection from outside the sidebar (programmatic SELECT_ENTRY without sidebar-click) DOES trigger the auto-scroll helper', () => {
    const dispatcher = setup(50);
    const calls: string[] = [];
    const orig = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = function (this: HTMLElement) {
      calls.push(this.getAttribute('data-pkc-lid') ?? '<no-lid>');
    };
    try {
      // Simulate a non-sidebar SELECT_ENTRY (e.g. breadcrumb,
      // calendar tap, entry-ref link). The action-binder is not
      // involved, so the memo is not pre-written.
      delete root.dataset.pkcLastScrolledLid;
      dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e42' });
      expect(calls.includes('e42')).toBe(true);
      expect(root.dataset.pkcLastScrolledLid).toBe('e42');
    } finally {
      HTMLElement.prototype.scrollIntoView = orig;
    }
  });

  it('breadcrumb click in the center pane (also `data-pkc-action="select-entry"`) still auto-scrolls', () => {
    const dispatcher = setup(50);
    // Pre-select e30 so a breadcrumb / center-pane select-entry has
    // somewhere to navigate from.
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e30' });
    delete root.dataset.pkcLastScrolledLid;

    const calls: string[] = [];
    const orig = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = function (this: HTMLElement) {
      calls.push(this.getAttribute('data-pkc-lid') ?? '<no-lid>');
    };
    try {
      // Synthesize a select-entry click from the center pane (no
      // ancestor with `data-pkc-region="sidebar"`).
      const fakeBreadcrumb = document.createElement('span');
      fakeBreadcrumb.setAttribute('data-pkc-action', 'select-entry');
      fakeBreadcrumb.setAttribute('data-pkc-lid', 'e10');
      const center = root.querySelector<HTMLElement>('.pkc-center-content')
        ?? root.querySelector<HTMLElement>('.pkc-shell')
        ?? root;
      center.appendChild(fakeBreadcrumb);

      const evt = new MouseEvent('click', { bubbles: true, cancelable: true });
      fakeBreadcrumb.dispatchEvent(evt);

      expect(calls.includes('e10')).toBe(true);
      expect(root.dataset.pkcLastScrolledLid).toBe('e10');
    } finally {
      HTMLElement.prototype.scrollIntoView = orig;
    }
  });
});
