/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, __resetEntryRowMemoForTest } from '@adapter/ui/renderer';
import { computeRenderScope } from '@adapter/ui/render-scope';
import { createInitialState, reduce } from '@adapter/state/app-state';
import type { AppState } from '@adapter/state/app-state';
import type { Container } from '@core/model/container';

/**
 * L1 #693 integration contract for the `'selection'` render scope.
 *
 * SELECT_ENTRY is the most frequent navigation. Before #693 it fell to a
 * full-shell rebuild that discarded and recreated the O(N) sidebar tree.
 * The `'selection'` scope moves the sidebar highlight in place and swaps
 * only the small selectedLid-dependent regions (center / meta / headers).
 *
 * Pinned invariants:
 *   - the resulting DOM equals a full render of the SAME state (no stale
 *     pane) — the design's primary safety guarantee.
 *   - the sidebar element AND its row nodes keep identity (NOT rebuilt)
 *     — this is where the win comes from.
 *   - the center pane element is replaced.
 *   - the selection highlight moves to exactly the new row.
 *   - the meta pane appears / disappears with selection.
 */

const T = '2026-04-27T00:00:00.000Z';

function fixture(): Container {
  return {
    meta: { container_id: 'cid', title: 't', created_at: T, updated_at: T, schema_version: 1 },
    entries: [
      { lid: 'a1', title: 'Alpha note', archetype: 'text', body: 'first', created_at: T, updated_at: T },
      { lid: 'a2', title: 'Beta note', archetype: 'text', body: 'second', created_at: T, updated_at: T },
      { lid: 'a3', title: 'Gamma note', archetype: 'text', body: 'third', created_at: T, updated_at: T },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };
}

function readyState(container: Container): AppState {
  const initial = createInitialState();
  return reduce(initial, { type: 'SYS_INIT_COMPLETE', container }).state;
}

function select(state: AppState, lid: string): AppState {
  return reduce(state, { type: 'SELECT_ENTRY', lid }).state;
}

/**
 * Serialize an element with attributes sorted, so the comparison is
 * insensitive to attribute *order*. The selection path re-applies
 * `data-pkc-selected` after a row is built, so it serializes last —
 * a benign ordering difference from the full path that sets it during
 * construction. Attribute presence / value and tree structure must
 * still match exactly.
 */
function normalize(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const attrs = [...el.attributes]
    .map((a) => `${a.name}=${JSON.stringify(a.value)}`)
    .sort()
    .join(' ');
  const kids = [...el.childNodes]
    .map((n) =>
      n.nodeType === 1
        ? normalize(n as Element)
        : n.nodeType === 3
          ? JSON.stringify(n.textContent)
          : '',
    )
    .join('');
  return `<${tag} ${attrs}>${kids}</${tag}>`;
}

let root: HTMLElement;

beforeEach(() => {
  __resetEntryRowMemoForTest();
  root = document.createElement('div');
  root.id = 'pkc-root';
  document.body.appendChild(root);
  return () => {
    root.remove();
    __resetEntryRowMemoForTest();
  };
});

describe('render scope=selection — detection', () => {
  it('classifies a plain SELECT_ENTRY navigation as "selection"', () => {
    const selA = select(readyState(fixture()), 'a1');
    const selB = select(selA, 'a2');
    expect(computeRenderScope(selB, selA)).toBe('selection');
  });
});

describe('render scope=selection — full-render parity', () => {
  it('produces DOM equal to a full render of the same state', () => {
    const selA = select(readyState(fixture()), 'a1');
    const selB = select(selA, 'a2');

    // Reference: full render of selB into a separate root. Memo reset so it
    // builds its own row nodes (the entryRow WeakMap is shared module state).
    const refRoot = document.createElement('div');
    refRoot.id = root.id; // match the harness mount-point attribute
    document.body.appendChild(refRoot);
    __resetEntryRowMemoForTest();
    render(selB, refRoot); // prev=null ⇒ scope='full'

    // Actual: full render of selA, then the 'selection' short-circuit to selB.
    __resetEntryRowMemoForTest();
    render(selA, root);
    expect(computeRenderScope(selB, selA)).toBe('selection');
    render(selB, root, selA);

    // Attribute-order-insensitive structural equality (see `normalize`).
    expect(normalize(root)).toBe(normalize(refRoot));
    refRoot.remove();
  });
});

describe('render scope=selection — region preservation', () => {
  it('reuses the sidebar element and its row nodes, but replaces the center', () => {
    const selA = select(readyState(fixture()), 'a1');
    const selB = select(selA, 'a2');

    render(selA, root);
    const sidebarBefore = root.querySelector('[data-pkc-region="sidebar"]');
    const rowBefore = root.querySelector('[data-pkc-region="entry-list"] li[data-pkc-lid]');
    const centerBefore = root.querySelector('[data-pkc-region="center"]');

    render(selB, root, selA);
    const sidebarAfter = root.querySelector('[data-pkc-region="sidebar"]');
    const rowAfter = root.querySelector('[data-pkc-region="entry-list"] li[data-pkc-lid]');
    const centerAfter = root.querySelector('[data-pkc-region="center"]');

    expect(sidebarAfter).toBe(sidebarBefore); // ← NOT rebuilt (the win)
    expect(rowAfter).toBe(rowBefore);         // ← row nodes reused
    expect(centerAfter).not.toBe(centerBefore); // ← center swapped
  });

  it('moves the selection highlight to exactly the new row', () => {
    const selA = select(readyState(fixture()), 'a1');
    const selB = select(selA, 'a2');

    render(selA, root);
    render(selB, root, selA);

    const sidebar = root.querySelector<HTMLElement>('[data-pkc-region="sidebar"]')!;
    const selected = sidebar.querySelectorAll('[data-pkc-region="entry-list"] li[data-pkc-selected="true"]');
    expect(selected.length).toBe(1);
    expect(selected[0]!.getAttribute('data-pkc-lid')).toBe('a2');
  });
});

describe('render scope=selection — meta pane appear / disappear', () => {
  it('removes the meta pane (+ right resize handle) when selection clears', () => {
    const selA = select(readyState(fixture()), 'a1');
    render(selA, root);
    expect(root.querySelector('[data-pkc-region="meta"]')).not.toBeNull();
    expect(root.querySelector('[data-pkc-resize="right"]')).not.toBeNull();

    const desel = reduce(selA, { type: 'DESELECT_ENTRY' }).state;
    expect(computeRenderScope(desel, selA)).toBe('selection');
    render(desel, root, selA);

    expect(root.querySelector('[data-pkc-region="meta"]')).toBeNull();
    expect(root.querySelector('[data-pkc-resize="right"]')).toBeNull();
  });

  it('inserts the meta pane (+ right resize handle) when a selection appears', () => {
    const base = readyState(fixture());
    render(base, root);
    expect(root.querySelector('[data-pkc-region="meta"]')).toBeNull();

    const selA = select(base, 'a1');
    expect(computeRenderScope(selA, base)).toBe('selection');
    render(selA, root, base);

    expect(root.querySelector('[data-pkc-region="meta"]')).not.toBeNull();
    expect(root.querySelector('[data-pkc-resize="right"]')).not.toBeNull();
  });
});
