/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher as _createRawDispatcher } from '@adapter/state/dispatcher';
import { render } from '@adapter/ui/renderer';
import { registerPresenter } from '@adapter/ui/detail-presenter';
import { attachmentPresenter } from '@adapter/ui/attachment-presenter';
import { textlogPresenter } from '@adapter/ui/textlog-presenter';
import { parseTodoBody } from '@features/todo/todo-body';
import type { Container } from '@core/model/container';
import type { DomainEvent } from '@core/action/domain-event';

// Register the textlog presenter once so the renderer can draw textlog entries
// during these tests. Registration is idempotent.
registerPresenter('textlog', textlogPresenter);
registerPresenter('attachment', attachmentPresenter);

const mockContainer: Container = {
  meta: {
    container_id: 'test-id',
    title: 'Test',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    schema_version: 1,
  },
  entries: [
    {
      lid: 'e1',
      title: 'Entry One',
      body: 'Body one',
      archetype: 'text',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ],
  relations: [],
  revisions: [],
  assets: {},
};

let root: HTMLElement;
let cleanup: () => void;

// --- Stale-listener prevention infrastructure ---
// Every dispatcher.onState / onEvent subscription is auto-tracked here.
// The beforeEach teardown calls all accumulated unsubscribe functions,
// ensuring no stale listener can render into a subsequent test's root.
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

beforeEach(() => {
  root = document.createElement('div');
  root.id = 'pkc-root';
  document.body.appendChild(root);
  return () => {
    cleanup?.();
    for (const fn of _trackedUnsubs) fn();
    _trackedUnsubs.length = 0;
    root.remove();
  };
});

// NOTE: `setup()` helper is not used in this file — keyboard-navigation
// describes bootstrap their own dispatcher + render fixture inline. The
// shared `root` / `cleanup` / `_trackedUnsubs` scaffolding remains useful.

// ─── Keyboard Navigation Phase 1: Arrow Up / Down ─────────────
describe('Keyboard navigation: Arrow Up / Down (Phase 1)', () => {
  const navContainer: Container = {
    meta: mockContainer.meta,
    entries: [
      { lid: 'n1', title: 'Alpha', body: 'a', archetype: 'text', created_at: '2026-01-01T00:01:00Z', updated_at: '2026-01-01T00:01:00Z' },
      { lid: 'n2', title: 'Beta', body: 'b', archetype: 'text', created_at: '2026-01-01T00:02:00Z', updated_at: '2026-01-01T00:02:00Z' },
      { lid: 'n3', title: 'Gamma', body: 'c', archetype: 'text', created_at: '2026-01-01T00:03:00Z', updated_at: '2026-01-01T00:03:00Z' },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };

  function pressArrow(key: 'ArrowDown' | 'ArrowUp') {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  }

  function setupNav(container?: Container) {
    const dispatcher = createDispatcher();
    const events: DomainEvent[] = [];
    dispatcher.onEvent((e) => events.push(e));
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: container ?? navContainer });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);
    return { dispatcher, events };
  }

  // ── Integration ──

  it('Arrow Down selects next entry', () => {
    const { dispatcher } = setupNav();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'n1' });
    render(dispatcher.getState(), root);

    pressArrow('ArrowDown');

    expect(dispatcher.getState().selectedLid).toBe('n2');
  });

  it('Arrow Up selects previous entry', () => {
    const { dispatcher } = setupNav();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'n2' });
    render(dispatcher.getState(), root);

    pressArrow('ArrowUp');

    expect(dispatcher.getState().selectedLid).toBe('n1');
  });

  it('Arrow Down at end is no-op', () => {
    const { dispatcher } = setupNav();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'n3' });
    render(dispatcher.getState(), root);

    pressArrow('ArrowDown');

    expect(dispatcher.getState().selectedLid).toBe('n3');
  });

  it('Arrow Up at start is no-op', () => {
    const { dispatcher } = setupNav();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'n1' });
    render(dispatcher.getState(), root);

    pressArrow('ArrowUp');

    expect(dispatcher.getState().selectedLid).toBe('n1');
  });

  it('Arrow Down with no selection selects first entry', () => {
    const { dispatcher } = setupNav();
    render(dispatcher.getState(), root);
    expect(dispatcher.getState().selectedLid).toBeNull();

    pressArrow('ArrowDown');

    expect(dispatcher.getState().selectedLid).toBe('n1');
  });

  it('Arrow Up with no selection selects first entry', () => {
    const { dispatcher } = setupNav();
    render(dispatcher.getState(), root);
    expect(dispatcher.getState().selectedLid).toBeNull();

    pressArrow('ArrowUp');

    expect(dispatcher.getState().selectedLid).toBe('n1');
  });

  it('follows visible order when search filter is active', () => {
    const { dispatcher } = setupNav();
    // Filter so only 'Beta' and 'Gamma' are visible
    dispatcher.dispatch({ type: 'SET_SEARCH_QUERY', query: 'a' });
    render(dispatcher.getState(), root);

    // Verify sidebar shows filtered results
    const sidebar = root.querySelector('[data-pkc-region="sidebar"]')!;
    const items = sidebar.querySelectorAll('[data-pkc-action="select-entry"]');
    const visibleLids = Array.from(items).map((el) => el.getAttribute('data-pkc-lid'));

    // Select the first visible entry
    if (visibleLids.length >= 2) {
      dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: visibleLids[0]! });
      pressArrow('ArrowDown');
      expect(dispatcher.getState().selectedLid).toBe(visibleLids[1]);
    }
  });

  it('selects first when selectedLid is filtered out', () => {
    const { dispatcher } = setupNav();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'n2' });

    // Filter to show only entries matching 'Alpha' — n2 becomes hidden
    dispatcher.dispatch({ type: 'SET_SEARCH_QUERY', query: 'Alpha' });
    render(dispatcher.getState(), root);

    const sidebar = root.querySelector('[data-pkc-region="sidebar"]')!;
    const items = sidebar.querySelectorAll('[data-pkc-action="select-entry"]');
    if (items.length > 0) {
      pressArrow('ArrowDown');
      // Should select first visible entry since n2 is not in visible list
      expect(dispatcher.getState().selectedLid).toBe(items[0]!.getAttribute('data-pkc-lid'));
    }
  });

  // ── Guards ──

  it('does not fire during editing', () => {
    const { dispatcher } = setupNav();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'n1' });
    dispatcher.dispatch({ type: 'BEGIN_EDIT', lid: 'n1' });

    pressArrow('ArrowDown');

    // Should still be n1 (editing phase blocks arrow navigation)
    expect(dispatcher.getState().selectedLid).toBe('n1');
  });

  it('does not fire when textarea has focus', () => {
    const { dispatcher } = setupNav();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'n1' });

    // Create and focus a textarea
    const ta = document.createElement('textarea');
    root.appendChild(ta);
    ta.focus();
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

    expect(dispatcher.getState().selectedLid).toBe('n1');
    ta.remove();
  });

  it('does not fire when input has focus', () => {
    const { dispatcher } = setupNav();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'n1' });

    const input = document.createElement('input');
    input.type = 'text';
    root.appendChild(input);
    input.focus();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

    expect(dispatcher.getState().selectedLid).toBe('n1');
    input.remove();
  });

  it('no-op when visible entries is 0', () => {
    const emptyContainer: Container = {
      meta: mockContainer.meta,
      entries: [],
      relations: [],
      revisions: [],
      assets: {},
    };
    const { dispatcher } = setupNav(emptyContainer);

    pressArrow('ArrowDown');

    expect(dispatcher.getState().selectedLid).toBeNull();
  });

  // ── Regression ──

  it('regression: Escape cascade still works', () => {
    const { dispatcher, events } = setupNav();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'n1' });

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(events.some((e) => e.type === 'ENTRY_DESELECTED')).toBe(true);
  });

  it('regression: click selection still works', () => {
    const { dispatcher } = setupNav();
    const item = root.querySelector('[data-pkc-action="select-entry"][data-pkc-lid="n2"]');
    item!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(dispatcher.getState().selectedLid).toBe('n2');
  });

  it('regression: multi-select Ctrl+click still works', () => {
    const { dispatcher } = setupNav();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'n1' });
    const item = root.querySelector('[data-pkc-action="select-entry"][data-pkc-lid="n2"]');
    item!.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));

    expect(dispatcher.getState().multiSelectedLids).toContain('n1');
    expect(dispatcher.getState().multiSelectedLids).toContain('n2');
  });
});

// ─── Listener isolation (stale-listener prevention) ─────────────
describe('Listener isolation', () => {
  it('stale dispatcher does not render into subsequent test root', () => {
    // Simulate cross-test contamination scenario:
    // 1. Create dispatcherA with a render listener on the shared root
    const containerA: Container = {
      meta: mockContainer.meta,
      entries: [
        { lid: 'stale1', title: 'Stale', body: '', archetype: 'text', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ],
      relations: [], revisions: [], assets: {},
    };
    const dispatcherA = createDispatcher();
    dispatcherA.onState((state) => render(state, root));
    dispatcherA.dispatch({ type: 'SYS_INIT_COMPLETE', container: containerA });
    render(dispatcherA.getState(), root);

    // Verify stale1 is rendered
    expect(root.querySelector('[data-pkc-lid="stale1"]')).not.toBeNull();

    // 2. Manually unsubscribe all tracked listeners (simulates beforeEach teardown)
    for (const fn of _trackedUnsubs) fn();
    _trackedUnsubs.length = 0;

    // 3. Now set up a "new test" scenario with dispatcherB and different entries
    const containerB: Container = {
      meta: mockContainer.meta,
      entries: [
        { lid: 'fresh1', title: 'Fresh', body: '', archetype: 'text', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ],
      relations: [], revisions: [], assets: {},
    };
    const dispatcherB = createDispatcher();
    dispatcherB.onState((state) => render(state, root));
    dispatcherB.dispatch({ type: 'SYS_INIT_COMPLETE', container: containerB });
    render(dispatcherB.getState(), root);

    expect(root.querySelector('[data-pkc-lid="fresh1"]')).not.toBeNull();
    expect(root.querySelector('[data-pkc-lid="stale1"]')).toBeNull();

    // 4. Fire dispatcherA — its listener should be unsubscribed, so root stays clean
    dispatcherA.dispatch({ type: 'CREATE_ENTRY', archetype: 'text', title: 'Ghost' });

    // Root must still show only fresh1 — no contamination from dispatcherA.
    // Scope to `.pkc-entry-item` so the Recent Entries pane's duplicate
    // rows don't inflate the lid inventory.
    expect(root.querySelector('.pkc-entry-item[data-pkc-lid="fresh1"]')).not.toBeNull();
    expect(root.querySelector('.pkc-entry-item[data-pkc-lid="stale1"]')).toBeNull();
    const allLids = Array.from(root.querySelectorAll('.pkc-entry-item[data-pkc-lid]')).map((el) => el.getAttribute('data-pkc-lid'));
    expect(allLids).toEqual(['fresh1']);
  });

  it('_trackedUnsubs accumulates and drains correctly', () => {
    const d = createDispatcher();

    // Each onState/onEvent call should add to _trackedUnsubs
    const before = _trackedUnsubs.length;
    d.onState(() => {});
    d.onEvent(() => {});
    expect(_trackedUnsubs.length).toBe(before + 2);

    // Drain
    for (const fn of _trackedUnsubs) fn();
    _trackedUnsubs.length = 0;

    // Verify listeners are actually removed: dispatch should not notify
    let called = false;
    d.onState(() => { called = true; });
    // Drain the one we just added
    const unsub = _trackedUnsubs.pop()!;
    unsub();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: mockContainer });
    expect(called).toBe(false);
  });
});

// ─── Keyboard Navigation Phase 2: Enter ─────────────────────────
describe('Keyboard navigation: Enter (Phase 2)', () => {
  const enterContainer: Container = {
    meta: mockContainer.meta,
    entries: [
      { lid: 'k1', title: 'Alpha', body: 'a', archetype: 'text', created_at: '2026-01-01T00:01:00Z', updated_at: '2026-01-01T00:01:00Z' },
      { lid: 'k2', title: 'Beta', body: 'b', archetype: 'text', created_at: '2026-01-01T00:02:00Z', updated_at: '2026-01-01T00:02:00Z' },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };

  function pressEnter(opts?: KeyboardEventInit) {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, ...opts }));
  }

  function setupEnter() {
    const dispatcher = createDispatcher();
    const events: DomainEvent[] = [];
    dispatcher.onEvent((e) => events.push(e));
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: enterContainer });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);
    return { dispatcher, events };
  }

  it('Enter opens edit mode for selected entry', () => {
    const { dispatcher } = setupEnter();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'k1' });
    render(dispatcher.getState(), root);

    pressEnter();

    expect(dispatcher.getState().phase).toBe('editing');
    expect(dispatcher.getState().editingLid).toBe('k1');
  });

  it('Enter does nothing when no selection', () => {
    const { dispatcher } = setupEnter();
    expect(dispatcher.getState().selectedLid).toBeNull();

    pressEnter();

    expect(dispatcher.getState().phase).toBe('ready');
    expect(dispatcher.getState().editingLid).toBeNull();
  });

  it('Enter blocked during editing phase', () => {
    const { dispatcher } = setupEnter();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'k1' });
    dispatcher.dispatch({ type: 'BEGIN_EDIT', lid: 'k1' });
    render(dispatcher.getState(), root);
    expect(dispatcher.getState().phase).toBe('editing');

    pressEnter();

    // Still editing k1 — Enter did not dispatch a second BEGIN_EDIT
    expect(dispatcher.getState().phase).toBe('editing');
    expect(dispatcher.getState().editingLid).toBe('k1');
  });

  it('Enter blocked when textarea is focused', () => {
    const { dispatcher } = setupEnter();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'k1' });
    render(dispatcher.getState(), root);

    const ta = document.createElement('textarea');
    root.appendChild(ta);
    ta.focus();
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(dispatcher.getState().phase).toBe('ready');
    ta.remove();
  });

  it('Enter blocked when input is focused', () => {
    const { dispatcher } = setupEnter();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'k1' });
    render(dispatcher.getState(), root);

    const input = document.createElement('input');
    input.type = 'text';
    root.appendChild(input);
    input.focus();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(dispatcher.getState().phase).toBe('ready');
    input.remove();
  });

  it('Enter blocked when select is focused', () => {
    const { dispatcher } = setupEnter();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'k1' });
    render(dispatcher.getState(), root);

    const sel = document.createElement('select');
    root.appendChild(sel);
    sel.focus();
    sel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(dispatcher.getState().phase).toBe('ready');
    sel.remove();
  });

  it('Enter blocked with Ctrl modifier', () => {
    const { dispatcher } = setupEnter();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'k1' });
    render(dispatcher.getState(), root);

    pressEnter({ ctrlKey: true });

    expect(dispatcher.getState().phase).toBe('ready');
  });

  it('Enter blocked with Shift modifier', () => {
    const { dispatcher } = setupEnter();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'k1' });
    render(dispatcher.getState(), root);

    pressEnter({ shiftKey: true });

    expect(dispatcher.getState().phase).toBe('ready');
  });

  it('Enter blocked with Alt modifier', () => {
    const { dispatcher } = setupEnter();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'k1' });
    render(dispatcher.getState(), root);

    pressEnter({ altKey: true });

    expect(dispatcher.getState().phase).toBe('ready');
  });

  // ── Regression ──

  it('regression: Escape then Enter round-trip', () => {
    const { dispatcher } = setupEnter();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'k1' });
    render(dispatcher.getState(), root);

    // Enter → editing
    pressEnter();
    expect(dispatcher.getState().phase).toBe('editing');

    // Escape → back to ready
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(dispatcher.getState().phase).toBe('ready');
    expect(dispatcher.getState().selectedLid).toBe('k1');

    // Enter again → editing again
    pressEnter();
    expect(dispatcher.getState().phase).toBe('editing');
    expect(dispatcher.getState().editingLid).toBe('k1');
  });

  it('regression: Arrow then Enter selects and edits', () => {
    const { dispatcher } = setupEnter();
    // Start with no selection
    expect(dispatcher.getState().selectedLid).toBeNull();

    // Arrow Down → selects first entry
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(dispatcher.getState().selectedLid).toBe('k1');

    // Enter → edit that entry
    pressEnter();
    expect(dispatcher.getState().phase).toBe('editing');
    expect(dispatcher.getState().editingLid).toBe('k1');
  });

  it('Enter is blocked in readonly mode (reducer guard)', () => {
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: enterContainer, readonly: true });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);

    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'k1' });
    render(dispatcher.getState(), root);

    pressEnter();

    // BEGIN_EDIT is blocked by reducer in readonly mode
    expect(dispatcher.getState().phase).toBe('ready');
    expect(dispatcher.getState().editingLid).toBeNull();
  });
});

// ─── Keyboard Navigation Phase 3: Arrow Left / Right (tree) ────
describe('Keyboard navigation: Arrow Left / Right (Phase 3)', () => {
  const treeContainer: Container = {
    meta: mockContainer.meta,
    entries: [
      { lid: 'f1', title: 'Folder A', body: '', archetype: 'folder', created_at: '2026-01-01T00:01:00Z', updated_at: '2026-01-01T00:01:00Z' },
      { lid: 'c1', title: 'Child 1', body: '', archetype: 'text', created_at: '2026-01-01T00:02:00Z', updated_at: '2026-01-01T00:02:00Z' },
      { lid: 'c2', title: 'Child 2', body: '', archetype: 'text', created_at: '2026-01-01T00:03:00Z', updated_at: '2026-01-01T00:03:00Z' },
      { lid: 't1', title: 'Top-level text', body: '', archetype: 'text', created_at: '2026-01-01T00:04:00Z', updated_at: '2026-01-01T00:04:00Z' },
    ],
    relations: [
      { id: 'r1', from: 'f1', to: 'c1', kind: 'structural', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      { id: 'r2', from: 'f1', to: 'c2', kind: 'structural', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    ],
    revisions: [],
    assets: {},
  };

  function pressArrowLR(key: 'ArrowLeft' | 'ArrowRight') {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  }

  function setupTree() {
    const dispatcher = createDispatcher();
    const events: DomainEvent[] = [];
    dispatcher.onEvent((e) => events.push(e));
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: treeContainer });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);
    return { dispatcher, events };
  }

  // ── Integration ──

  it('Arrow Left collapses an expanded folder', () => {
    const { dispatcher } = setupTree();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'f1' });
    render(dispatcher.getState(), root);

    // Folder starts expanded (not in collapsedFolders)
    expect(dispatcher.getState().collapsedFolders).not.toContain('f1');

    pressArrowLR('ArrowLeft');

    expect(dispatcher.getState().collapsedFolders).toContain('f1');
  });

  it('Arrow Right expands a collapsed folder', () => {
    const { dispatcher } = setupTree();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'f1' });
    // Collapse first
    dispatcher.dispatch({ type: 'TOGGLE_FOLDER_COLLAPSE', lid: 'f1' });
    render(dispatcher.getState(), root);
    expect(dispatcher.getState().collapsedFolders).toContain('f1');

    pressArrowLR('ArrowRight');

    expect(dispatcher.getState().collapsedFolders).not.toContain('f1');
  });

  it('Arrow Left on already collapsed folder is no-op', () => {
    const { dispatcher } = setupTree();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'f1' });
    dispatcher.dispatch({ type: 'TOGGLE_FOLDER_COLLAPSE', lid: 'f1' });
    render(dispatcher.getState(), root);
    expect(dispatcher.getState().collapsedFolders).toContain('f1');

    pressArrowLR('ArrowLeft');

    // Still collapsed — not toggled back to expanded
    expect(dispatcher.getState().collapsedFolders).toContain('f1');
  });

  it('Arrow Right on already expanded folder is no-op', () => {
    const { dispatcher } = setupTree();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'f1' });
    render(dispatcher.getState(), root);
    expect(dispatcher.getState().collapsedFolders).not.toContain('f1');

    pressArrowLR('ArrowRight');

    // Still expanded — not toggled to collapsed
    expect(dispatcher.getState().collapsedFolders).not.toContain('f1');
  });

  it('Arrow Left/Right on non-folder entry is no-op', () => {
    const { dispatcher } = setupTree();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    render(dispatcher.getState(), root);

    pressArrowLR('ArrowLeft');
    pressArrowLR('ArrowRight');

    // No change — text entry is not a folder
    expect(dispatcher.getState().collapsedFolders).toEqual([]);
    expect(dispatcher.getState().selectedLid).toBe('t1');
  });

  it('Arrow Left/Right with no selection is no-op', () => {
    const { dispatcher } = setupTree();
    expect(dispatcher.getState().selectedLid).toBeNull();

    pressArrowLR('ArrowLeft');
    pressArrowLR('ArrowRight');

    expect(dispatcher.getState().collapsedFolders).toEqual([]);
  });

  it('children are hidden in sidebar after Arrow Left collapse', () => {
    const { dispatcher } = setupTree();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'f1' });
    render(dispatcher.getState(), root);

    // Scope to `.pkc-entry-item` so the Recent Entries pane's duplicate
    // rows don't mask the tree's collapse semantics.
    const tree = () => root.querySelector('[data-pkc-region="sidebar"] ul.pkc-entry-list')!;
    // Children visible in sidebar tree before collapse
    expect(tree().querySelector('[data-pkc-lid="c1"]')).not.toBeNull();
    expect(tree().querySelector('[data-pkc-lid="c2"]')).not.toBeNull();

    pressArrowLR('ArrowLeft');

    // Children hidden in sidebar tree after collapse (renderer skips them)
    expect(tree().querySelector('[data-pkc-lid="c1"]')).toBeNull();
    expect(tree().querySelector('[data-pkc-lid="c2"]')).toBeNull();
  });

  it('children reappear in sidebar after Arrow Right expand', () => {
    const { dispatcher } = setupTree();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'f1' });
    dispatcher.dispatch({ type: 'TOGGLE_FOLDER_COLLAPSE', lid: 'f1' });
    render(dispatcher.getState(), root);

    const tree = () => root.querySelector('[data-pkc-region="sidebar"] ul.pkc-entry-list')!;
    // Children hidden in sidebar tree
    expect(tree().querySelector('[data-pkc-lid="c1"]')).toBeNull();

    pressArrowLR('ArrowRight');

    // Children visible again in sidebar tree
    expect(tree().querySelector('[data-pkc-lid="c1"]')).not.toBeNull();
    expect(tree().querySelector('[data-pkc-lid="c2"]')).not.toBeNull();
  });

  // ── Guard ──

  it('blocked during editing', () => {
    const { dispatcher } = setupTree();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'f1' });
    dispatcher.dispatch({ type: 'BEGIN_EDIT', lid: 'f1' });
    render(dispatcher.getState(), root);

    pressArrowLR('ArrowLeft');

    expect(dispatcher.getState().collapsedFolders).toEqual([]);
  });

  it('blocked when textarea is focused', () => {
    const { dispatcher } = setupTree();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'f1' });
    render(dispatcher.getState(), root);

    const ta = document.createElement('textarea');
    root.appendChild(ta);
    ta.focus();
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));

    expect(dispatcher.getState().collapsedFolders).toEqual([]);
    ta.remove();
  });

  it('blocked when input is focused', () => {
    const { dispatcher } = setupTree();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'f1' });
    render(dispatcher.getState(), root);

    const input = document.createElement('input');
    input.type = 'text';
    root.appendChild(input);
    input.focus();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

    expect(dispatcher.getState().collapsedFolders).toEqual([]);
    input.remove();
  });

  it('blocked with Ctrl modifier', () => {
    const { dispatcher } = setupTree();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'f1' });
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', ctrlKey: true, bubbles: true }));

    expect(dispatcher.getState().collapsedFolders).toEqual([]);
  });

  it('allowed in readonly mode', () => {
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: treeContainer, readonly: true });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);

    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'f1' });
    render(dispatcher.getState(), root);

    pressArrowLR('ArrowLeft');

    // Collapse works in readonly — it's runtime UI state, not data
    expect(dispatcher.getState().collapsedFolders).toContain('f1');
  });

  // ── Regression ──

  it('regression: Arrow Up/Down still works', () => {
    const { dispatcher } = setupTree();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'f1' });
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

    expect(dispatcher.getState().selectedLid).toBe('c1');
  });

  it('regression: Enter still works', () => {
    const { dispatcher } = setupTree();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'f1' });
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(dispatcher.getState().phase).toBe('editing');
    expect(dispatcher.getState().editingLid).toBe('f1');
  });

  it('regression: Escape cascade still works', () => {
    const { dispatcher } = setupTree();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'f1' });

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(dispatcher.getState().selectedLid).toBeNull();
  });

  it('regression: click toggle still works', () => {
    const { dispatcher } = setupTree();
    render(dispatcher.getState(), root);

    const toggle = root.querySelector('[data-pkc-action="toggle-folder-collapse"][data-pkc-lid="f1"]');
    expect(toggle).not.toBeNull();
    toggle!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(dispatcher.getState().collapsedFolders).toContain('f1');
  });

  it('selection is preserved after collapse/expand', () => {
    const { dispatcher } = setupTree();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'f1' });
    render(dispatcher.getState(), root);

    pressArrowLR('ArrowLeft');
    expect(dispatcher.getState().selectedLid).toBe('f1');

    pressArrowLR('ArrowRight');
    expect(dispatcher.getState().selectedLid).toBe('f1');
  });
});

// ─── Keyboard Navigation Phase 4: Arrow Left → Parent ──────────
describe('Keyboard navigation: Arrow Left → parent (Phase 4)', () => {
  // Nested tree: root-folder > child-folder > grandchild text
  const nestedContainer: Container = {
    meta: mockContainer.meta,
    entries: [
      { lid: 'rf', title: 'Root Folder', body: '', archetype: 'folder', created_at: '2026-01-01T00:01:00Z', updated_at: '2026-01-01T00:01:00Z' },
      { lid: 'cf', title: 'Child Folder', body: '', archetype: 'folder', created_at: '2026-01-01T00:02:00Z', updated_at: '2026-01-01T00:02:00Z' },
      { lid: 'gc', title: 'Grandchild', body: '', archetype: 'text', created_at: '2026-01-01T00:03:00Z', updated_at: '2026-01-01T00:03:00Z' },
      { lid: 'top', title: 'Top-level', body: '', archetype: 'text', created_at: '2026-01-01T00:04:00Z', updated_at: '2026-01-01T00:04:00Z' },
    ],
    relations: [
      { id: 'r1', from: 'rf', to: 'cf', kind: 'structural', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      { id: 'r2', from: 'cf', to: 'gc', kind: 'structural', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    ],
    revisions: [],
    assets: {},
  };

  function pressLeft() {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  }

  function setupNested() {
    const dispatcher = createDispatcher();
    const events: DomainEvent[] = [];
    dispatcher.onEvent((e) => events.push(e));
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: nestedContainer });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);
    return { dispatcher, events };
  }

  // ── Integration ──

  it('expanded folder: Arrow Left collapses (Phase 3 behavior)', () => {
    const { dispatcher } = setupNested();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'rf' });
    render(dispatcher.getState(), root);
    expect(dispatcher.getState().collapsedFolders).not.toContain('rf');

    pressLeft();

    expect(dispatcher.getState().collapsedFolders).toContain('rf');
    expect(dispatcher.getState().selectedLid).toBe('rf');
  });

  it('collapsed child folder: Arrow Left selects parent', () => {
    const { dispatcher } = setupNested();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'cf' });
    dispatcher.dispatch({ type: 'TOGGLE_FOLDER_COLLAPSE', lid: 'cf' });
    render(dispatcher.getState(), root);
    expect(dispatcher.getState().collapsedFolders).toContain('cf');

    pressLeft();

    expect(dispatcher.getState().selectedLid).toBe('rf');
  });

  it('collapsed root folder: Arrow Left is no-op', () => {
    const { dispatcher } = setupNested();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'rf' });
    dispatcher.dispatch({ type: 'TOGGLE_FOLDER_COLLAPSE', lid: 'rf' });
    render(dispatcher.getState(), root);

    pressLeft();

    // Still selected, no parent to move to
    expect(dispatcher.getState().selectedLid).toBe('rf');
  });

  it('non-folder selected: Arrow Left is no-op', () => {
    const { dispatcher } = setupNested();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'top' });
    render(dispatcher.getState(), root);

    pressLeft();

    expect(dispatcher.getState().selectedLid).toBe('top');
  });

  it('double Arrow Left: collapse then move to parent', () => {
    const { dispatcher } = setupNested();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'cf' });
    render(dispatcher.getState(), root);
    // cf starts expanded
    expect(dispatcher.getState().collapsedFolders).not.toContain('cf');

    // First Left: collapse cf
    pressLeft();
    expect(dispatcher.getState().collapsedFolders).toContain('cf');
    expect(dispatcher.getState().selectedLid).toBe('cf');

    // Second Left: move to parent rf
    pressLeft();
    expect(dispatcher.getState().selectedLid).toBe('rf');
  });

  it('collapse state preserved after parent move', () => {
    const { dispatcher } = setupNested();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'cf' });
    dispatcher.dispatch({ type: 'TOGGLE_FOLDER_COLLAPSE', lid: 'cf' });
    render(dispatcher.getState(), root);

    pressLeft(); // Move to parent

    // cf is still collapsed after we moved away from it
    expect(dispatcher.getState().collapsedFolders).toContain('cf');
    expect(dispatcher.getState().selectedLid).toBe('rf');
  });

  // ── Guard ──

  it('blocked during editing', () => {
    const { dispatcher } = setupNested();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'cf' });
    dispatcher.dispatch({ type: 'TOGGLE_FOLDER_COLLAPSE', lid: 'cf' });
    dispatcher.dispatch({ type: 'BEGIN_EDIT', lid: 'cf' });
    render(dispatcher.getState(), root);

    pressLeft();

    // Still editing cf, not moved to parent
    expect(dispatcher.getState().selectedLid).toBe('cf');
    expect(dispatcher.getState().phase).toBe('editing');
  });

  it('blocked when textarea is focused', () => {
    const { dispatcher } = setupNested();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'cf' });
    dispatcher.dispatch({ type: 'TOGGLE_FOLDER_COLLAPSE', lid: 'cf' });
    render(dispatcher.getState(), root);

    const ta = document.createElement('textarea');
    root.appendChild(ta);
    ta.focus();
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));

    expect(dispatcher.getState().selectedLid).toBe('cf');
    ta.remove();
  });

  it('blocked with Ctrl modifier', () => {
    const { dispatcher } = setupNested();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'cf' });
    dispatcher.dispatch({ type: 'TOGGLE_FOLDER_COLLAPSE', lid: 'cf' });
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', ctrlKey: true, bubbles: true }));

    expect(dispatcher.getState().selectedLid).toBe('cf');
  });

  it('allowed in readonly mode', () => {
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: nestedContainer, readonly: true });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);

    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'cf' });
    dispatcher.dispatch({ type: 'TOGGLE_FOLDER_COLLAPSE', lid: 'cf' });
    render(dispatcher.getState(), root);

    pressLeft();

    expect(dispatcher.getState().selectedLid).toBe('rf');
  });

  // ── Regression ──

  it('regression: Arrow Right expand still works', () => {
    const { dispatcher } = setupNested();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'rf' });
    dispatcher.dispatch({ type: 'TOGGLE_FOLDER_COLLAPSE', lid: 'rf' });
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

    expect(dispatcher.getState().collapsedFolders).not.toContain('rf');
  });

  it('regression: Arrow Up/Down still works', () => {
    const { dispatcher } = setupNested();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'rf' });
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

    expect(dispatcher.getState().selectedLid).toBe('cf');
  });

  it('regression: Enter still works', () => {
    const { dispatcher } = setupNested();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'rf' });
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(dispatcher.getState().phase).toBe('editing');
  });

  it('regression: Escape cascade still works', () => {
    const { dispatcher } = setupNested();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'rf' });

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(dispatcher.getState().selectedLid).toBeNull();
  });

  it('regression: click toggle still works', () => {
    const { dispatcher } = setupNested();
    render(dispatcher.getState(), root);

    const toggle = root.querySelector('[data-pkc-action="toggle-folder-collapse"][data-pkc-lid="rf"]');
    expect(toggle).not.toBeNull();
    toggle!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(dispatcher.getState().collapsedFolders).toContain('rf');
  });
});

// ─── Keyboard Navigation Phase 5: Arrow Right → First Child ──────────
describe('Keyboard navigation: Arrow Right → first child (Phase 5)', () => {
  // Tree: root-folder > child-folder > grandchild text
  //        root-folder > child-text
  //        empty-folder (no children)
  //        standalone text
  const treeContainer: Container = {
    meta: mockContainer.meta,
    entries: [
      { lid: 'rf', title: 'Root Folder', body: '', archetype: 'folder', created_at: '2026-01-01T00:01:00Z', updated_at: '2026-01-01T00:01:00Z' },
      { lid: 'cf', title: 'Child Folder', body: '', archetype: 'folder', created_at: '2026-01-01T00:02:00Z', updated_at: '2026-01-01T00:02:00Z' },
      { lid: 'ct', title: 'Child Text', body: '', archetype: 'text', created_at: '2026-01-01T00:03:00Z', updated_at: '2026-01-01T00:03:00Z' },
      { lid: 'gc', title: 'Grandchild', body: '', archetype: 'text', created_at: '2026-01-01T00:04:00Z', updated_at: '2026-01-01T00:04:00Z' },
      { lid: 'ef', title: 'Empty Folder', body: '', archetype: 'folder', created_at: '2026-01-01T00:05:00Z', updated_at: '2026-01-01T00:05:00Z' },
      { lid: 'top', title: 'Top-level', body: '', archetype: 'text', created_at: '2026-01-01T00:06:00Z', updated_at: '2026-01-01T00:06:00Z' },
    ],
    relations: [
      { id: 'r1', from: 'rf', to: 'cf', kind: 'structural', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      { id: 'r2', from: 'rf', to: 'ct', kind: 'structural', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      { id: 'r3', from: 'cf', to: 'gc', kind: 'structural', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    ],
    revisions: [],
    assets: {},
  };

  function pressRight() {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  }

  function setupTree() {
    const dispatcher = createDispatcher();
    const events: DomainEvent[] = [];
    dispatcher.onEvent((e) => events.push(e));
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: treeContainer });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);
    return { dispatcher, events };
  }

  // ── Integration ──

  it('expanded folder: Arrow Right selects first child', () => {
    const { dispatcher } = setupTree();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'rf' });
    render(dispatcher.getState(), root);
    // rf is expanded (default) and has children cf, ct
    expect(dispatcher.getState().collapsedFolders).not.toContain('rf');

    pressRight();

    expect(dispatcher.getState().selectedLid).toBe('cf'); // first child
  });

  it('expanded folder with no children: Arrow Right is no-op', () => {
    const { dispatcher } = setupTree();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'ef' });
    render(dispatcher.getState(), root);
    expect(dispatcher.getState().collapsedFolders).not.toContain('ef');

    pressRight();

    expect(dispatcher.getState().selectedLid).toBe('ef'); // unchanged
  });

  it('collapsed folder: Arrow Right expands (Phase 3 regression)', () => {
    const { dispatcher } = setupTree();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'rf' });
    dispatcher.dispatch({ type: 'TOGGLE_FOLDER_COLLAPSE', lid: 'rf' });
    render(dispatcher.getState(), root);
    expect(dispatcher.getState().collapsedFolders).toContain('rf');

    pressRight();

    expect(dispatcher.getState().collapsedFolders).not.toContain('rf');
    expect(dispatcher.getState().selectedLid).toBe('rf'); // still on folder
  });

  it('double Arrow Right: expand then select first child', () => {
    const { dispatcher } = setupTree();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'rf' });
    dispatcher.dispatch({ type: 'TOGGLE_FOLDER_COLLAPSE', lid: 'rf' });
    render(dispatcher.getState(), root);

    // First Right: expand rf
    pressRight();
    expect(dispatcher.getState().collapsedFolders).not.toContain('rf');
    expect(dispatcher.getState().selectedLid).toBe('rf');

    // Second Right: select first child cf
    pressRight();
    expect(dispatcher.getState().selectedLid).toBe('cf');
  });

  it('nested navigation: Right into child folder then Right into grandchild', () => {
    const { dispatcher } = setupTree();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'rf' });
    render(dispatcher.getState(), root);

    // Right on expanded rf → select cf
    pressRight();
    expect(dispatcher.getState().selectedLid).toBe('cf');

    // cf is expanded by default, Right → select gc
    pressRight();
    expect(dispatcher.getState().selectedLid).toBe('gc');
  });

  it('Left-Right symmetry: Right into child, Left back to parent', () => {
    const { dispatcher } = setupTree();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'rf' });
    render(dispatcher.getState(), root);

    // Right → cf (first child)
    pressRight();
    expect(dispatcher.getState().selectedLid).toBe('cf');

    // Collapse cf first, then Left → parent rf
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    // cf collapses
    expect(dispatcher.getState().collapsedFolders).toContain('cf');
    expect(dispatcher.getState().selectedLid).toBe('cf');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    // cf is collapsed, Left → parent rf
    expect(dispatcher.getState().selectedLid).toBe('rf');
  });

  // ── Guard ──

  it('blocked during editing', () => {
    const { dispatcher } = setupTree();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'rf' });
    dispatcher.dispatch({ type: 'BEGIN_EDIT', lid: 'rf' });
    render(dispatcher.getState(), root);

    pressRight();

    expect(dispatcher.getState().selectedLid).toBe('rf');
    expect(dispatcher.getState().phase).toBe('editing');
  });

  it('blocked when textarea is focused', () => {
    const { dispatcher } = setupTree();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'rf' });
    render(dispatcher.getState(), root);

    const ta = document.createElement('textarea');
    root.appendChild(ta);
    ta.focus();
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

    expect(dispatcher.getState().selectedLid).toBe('rf');
    ta.remove();
  });

  it('blocked with Ctrl modifier', () => {
    const { dispatcher } = setupTree();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'rf' });
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', ctrlKey: true, bubbles: true }));

    expect(dispatcher.getState().selectedLid).toBe('rf');
  });

  it('non-folder selected: Arrow Right is no-op', () => {
    const { dispatcher } = setupTree();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'top' });
    render(dispatcher.getState(), root);

    pressRight();

    expect(dispatcher.getState().selectedLid).toBe('top');
  });

  it('allowed in readonly mode', () => {
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: treeContainer, readonly: true });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);

    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'rf' });
    render(dispatcher.getState(), root);

    pressRight();

    expect(dispatcher.getState().selectedLid).toBe('cf');
  });

  // ── Regression ──

  it('regression: Arrow Left collapse still works', () => {
    const { dispatcher } = setupTree();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'rf' });
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));

    expect(dispatcher.getState().collapsedFolders).toContain('rf');
  });

  it('regression: Arrow Up/Down still works', () => {
    const { dispatcher } = setupTree();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'rf' });
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

    expect(dispatcher.getState().selectedLid).not.toBe('rf');
  });

  it('regression: Enter still dispatches BEGIN_EDIT', () => {
    const { dispatcher } = setupTree();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'rf' });
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(dispatcher.getState().phase).toBe('editing');
  });

  it('regression: Escape clears selection', () => {
    const { dispatcher } = setupTree();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'rf' });

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(dispatcher.getState().selectedLid).toBeNull();
  });
});

// ─── Keyboard Navigation Phase 6: Non-folder Arrow Left → Parent ──────────
describe('Keyboard navigation: non-folder Arrow Left → parent (Phase 6)', () => {
  // Tree: root-folder > child-folder > grandchild text
  //        root-folder > child-text
  //        standalone text (no parent)
  const treeContainer: Container = {
    meta: mockContainer.meta,
    entries: [
      { lid: 'rf', title: 'Root Folder', body: '', archetype: 'folder', created_at: '2026-01-01T00:01:00Z', updated_at: '2026-01-01T00:01:00Z' },
      { lid: 'cf', title: 'Child Folder', body: '', archetype: 'folder', created_at: '2026-01-01T00:02:00Z', updated_at: '2026-01-01T00:02:00Z' },
      { lid: 'ct', title: 'Child Text', body: '', archetype: 'text', created_at: '2026-01-01T00:03:00Z', updated_at: '2026-01-01T00:03:00Z' },
      { lid: 'gc', title: 'Grandchild', body: '', archetype: 'text', created_at: '2026-01-01T00:04:00Z', updated_at: '2026-01-01T00:04:00Z' },
      { lid: 'top', title: 'Top-level', body: '', archetype: 'text', created_at: '2026-01-01T00:05:00Z', updated_at: '2026-01-01T00:05:00Z' },
    ],
    relations: [
      { id: 'r1', from: 'rf', to: 'cf', kind: 'structural', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      { id: 'r2', from: 'rf', to: 'ct', kind: 'structural', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      { id: 'r3', from: 'cf', to: 'gc', kind: 'structural', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    ],
    revisions: [],
    assets: {},
  };

  function pressLeft() {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  }

  function setupTree() {
    const dispatcher = createDispatcher();
    const events: DomainEvent[] = [];
    dispatcher.onEvent((e) => events.push(e));
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: treeContainer });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);
    return { dispatcher, events };
  }

  // ── Integration ──

  it('non-folder child: Arrow Left selects parent folder', () => {
    const { dispatcher } = setupTree();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'ct' });
    render(dispatcher.getState(), root);

    pressLeft();

    expect(dispatcher.getState().selectedLid).toBe('rf');
  });

  it('deeply nested non-folder: Arrow Left selects immediate parent', () => {
    const { dispatcher } = setupTree();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'gc' });
    render(dispatcher.getState(), root);

    pressLeft();

    expect(dispatcher.getState().selectedLid).toBe('cf');
  });

  it('root-level non-folder: Arrow Left is no-op', () => {
    const { dispatcher } = setupTree();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'top' });
    render(dispatcher.getState(), root);

    pressLeft();

    expect(dispatcher.getState().selectedLid).toBe('top');
  });

  it('non-folder: Arrow Right is no-op', () => {
    const { dispatcher } = setupTree();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'ct' });
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

    expect(dispatcher.getState().selectedLid).toBe('ct');
  });

  it('allowed in readonly mode', () => {
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: treeContainer, readonly: true });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);

    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'ct' });
    render(dispatcher.getState(), root);

    pressLeft();

    expect(dispatcher.getState().selectedLid).toBe('rf');
  });

  // ── Guard ──

  it('blocked during editing', () => {
    const { dispatcher } = setupTree();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'ct' });
    dispatcher.dispatch({ type: 'BEGIN_EDIT', lid: 'ct' });
    render(dispatcher.getState(), root);

    pressLeft();

    expect(dispatcher.getState().selectedLid).toBe('ct');
    expect(dispatcher.getState().phase).toBe('editing');
  });

  it('blocked when textarea is focused', () => {
    const { dispatcher } = setupTree();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'ct' });
    render(dispatcher.getState(), root);

    const ta = document.createElement('textarea');
    root.appendChild(ta);
    ta.focus();
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));

    expect(dispatcher.getState().selectedLid).toBe('ct');
    ta.remove();
  });

  it('blocked with Ctrl modifier', () => {
    const { dispatcher } = setupTree();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'ct' });
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', ctrlKey: true, bubbles: true }));

    expect(dispatcher.getState().selectedLid).toBe('ct');
  });

  // ── Regression ──

  it('regression: folder Arrow Left collapse still works', () => {
    const { dispatcher } = setupTree();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'rf' });
    render(dispatcher.getState(), root);

    pressLeft();

    expect(dispatcher.getState().collapsedFolders).toContain('rf');
    expect(dispatcher.getState().selectedLid).toBe('rf');
  });

  it('regression: folder collapsed Arrow Left → parent still works', () => {
    const { dispatcher } = setupTree();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'cf' });
    dispatcher.dispatch({ type: 'TOGGLE_FOLDER_COLLAPSE', lid: 'cf' });
    render(dispatcher.getState(), root);

    pressLeft();

    expect(dispatcher.getState().selectedLid).toBe('rf');
  });

  it('regression: folder Arrow Right child select still works', () => {
    const { dispatcher } = setupTree();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'rf' });
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

    expect(dispatcher.getState().selectedLid).toBe('cf');
  });

  it('regression: Arrow Up/Down still works', () => {
    const { dispatcher } = setupTree();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'rf' });
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

    expect(dispatcher.getState().selectedLid).not.toBe('rf');
  });

  it('regression: Enter still dispatches BEGIN_EDIT', () => {
    const { dispatcher } = setupTree();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'ct' });
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(dispatcher.getState().phase).toBe('editing');
  });

  it('regression: Escape clears selection', () => {
    const { dispatcher } = setupTree();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'ct' });

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(dispatcher.getState().selectedLid).toBeNull();
  });
});

// ─── Kanban Keyboard Navigation Phase 1 ──────────
describe('Kanban keyboard navigation (Phase 1)', () => {
  // open: t1 (Task A), t2 (Task B), t3 (Task C)
  // done: t4 (Task D), t5 (Task E)
  // archived: excluded from kanban
  // non-todo text entry: excluded from kanban
  const kanbanContainer: Container = {
    meta: mockContainer.meta,
    entries: [
      { lid: 't1', title: 'Task A', body: '{"status":"open","description":"A"}', archetype: 'todo', created_at: '2026-01-01T00:01:00Z', updated_at: '2026-01-01T00:01:00Z' },
      { lid: 't2', title: 'Task B', body: '{"status":"open","description":"B"}', archetype: 'todo', created_at: '2026-01-01T00:02:00Z', updated_at: '2026-01-01T00:02:00Z' },
      { lid: 't3', title: 'Task C', body: '{"status":"open","description":"C"}', archetype: 'todo', created_at: '2026-01-01T00:03:00Z', updated_at: '2026-01-01T00:03:00Z' },
      { lid: 't4', title: 'Task D', body: '{"status":"done","description":"D"}', archetype: 'todo', created_at: '2026-01-01T00:04:00Z', updated_at: '2026-01-01T00:04:00Z' },
      { lid: 't5', title: 'Task E', body: '{"status":"done","description":"E"}', archetype: 'todo', created_at: '2026-01-01T00:05:00Z', updated_at: '2026-01-01T00:05:00Z' },
      { lid: 'tx', title: 'Text Entry', body: 'plain text', archetype: 'text', created_at: '2026-01-01T00:06:00Z', updated_at: '2026-01-01T00:06:00Z' },
      { lid: 'ta', title: 'Archived', body: '{"status":"done","description":"X","archived":true}', archetype: 'todo', created_at: '2026-01-01T00:07:00Z', updated_at: '2026-01-01T00:07:00Z' },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };

  function setupKanban() {
    const dispatcher = createDispatcher();
    const events: DomainEvent[] = [];
    dispatcher.onEvent((e) => events.push(e));
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: kanbanContainer });
    dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'kanban' });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);
    return { dispatcher, events };
  }

  // ── Integration: Arrow Up / Down (within column) ──

  it('Arrow Down moves to next card in same column', () => {
    const { dispatcher } = setupKanban();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

    expect(dispatcher.getState().selectedLid).toBe('t2');
  });

  it('Arrow Down at end of column is no-op', () => {
    const { dispatcher } = setupKanban();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't3' }); // last in open
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

    expect(dispatcher.getState().selectedLid).toBe('t3');
  });

  it('Arrow Up moves to previous card in same column', () => {
    const { dispatcher } = setupKanban();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't2' });
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));

    expect(dispatcher.getState().selectedLid).toBe('t1');
  });

  it('Arrow Up at start of column is no-op', () => {
    const { dispatcher } = setupKanban();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' }); // first in open
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));

    expect(dispatcher.getState().selectedLid).toBe('t1');
  });

  it('Arrow Up/Down works in done column', () => {
    const { dispatcher } = setupKanban();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't4' }); // first in done
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(dispatcher.getState().selectedLid).toBe('t5');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(dispatcher.getState().selectedLid).toBe('t4');
  });

  it('selectedLid not visible in kanban → Arrow Down selects open column first', () => {
    const { dispatcher } = setupKanban();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'tx' }); // text entry, not in kanban
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

    expect(dispatcher.getState().selectedLid).toBe('t1');
  });

  it('no selection → Arrow Up selects open column first', () => {
    const { dispatcher } = setupKanban();
    render(dispatcher.getState(), root);
    expect(dispatcher.getState().selectedLid).toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));

    expect(dispatcher.getState().selectedLid).toBe('t1');
  });

  // ── Integration: Arrow Left / Right (cross-column) ──

  it('Arrow Right moves from open to done at same index', () => {
    const { dispatcher } = setupKanban();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' }); // open[0]
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

    expect(dispatcher.getState().selectedLid).toBe('t4'); // done[0]
  });

  it('Arrow Left moves from done to open at same index', () => {
    const { dispatcher } = setupKanban();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't4' }); // done[0]
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));

    expect(dispatcher.getState().selectedLid).toBe('t1'); // open[0]
  });

  it('Arrow Left at leftmost column is no-op', () => {
    const { dispatcher } = setupKanban();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' }); // open column (leftmost)
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));

    expect(dispatcher.getState().selectedLid).toBe('t1');
  });

  it('Arrow Right at rightmost column is no-op', () => {
    const { dispatcher } = setupKanban();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't4' }); // done column (rightmost)
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

    expect(dispatcher.getState().selectedLid).toBe('t4');
  });

  it('Arrow Right clamps index when target column is shorter', () => {
    const { dispatcher } = setupKanban();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't3' }); // open[2], done has only 2 items
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

    expect(dispatcher.getState().selectedLid).toBe('t5'); // done[1] (last)
  });

  it('Arrow Left/Right no-op when target column is empty', () => {
    // Container with only open todos (done column empty)
    const openOnlyContainer: Container = {
      meta: mockContainer.meta,
      entries: [
        { lid: 'o1', title: 'Open 1', body: '{"status":"open","description":"A"}', archetype: 'todo', created_at: '2026-01-01T00:01:00Z', updated_at: '2026-01-01T00:01:00Z' },
      ],
      relations: [],
      revisions: [],
      assets: {},
    };
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: openOnlyContainer });
    dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'kanban' });
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'o1' });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

    expect(dispatcher.getState().selectedLid).toBe('o1'); // can't move to empty done
  });

  // ── Guard ──

  it('non-kanban viewMode: Arrow keys use sidebar handler', () => {
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: kanbanContainer });
    // viewMode is 'detail' (default) — sidebar includes ALL entries (not just todos)
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);

    // Select last todo, then Arrow Down — sidebar shows non-todo 'tx' next,
    // but kanban has no entry after the last open todo
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't5' });
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

    // In detail mode, sidebar navigates to next visible entry (tx or ta)
    // which are NOT in kanban. This proves sidebar handler is used.
    const selected = dispatcher.getState().selectedLid;
    expect(selected).not.toBe('t5'); // moved somewhere
    expect(selected).not.toBeNull();
  });

  it('blocked during editing', () => {
    const { dispatcher } = setupKanban();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    dispatcher.dispatch({ type: 'BEGIN_EDIT', lid: 't1' });
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

    expect(dispatcher.getState().selectedLid).toBe('t1');
    expect(dispatcher.getState().phase).toBe('editing');
  });

  it('blocked when textarea is focused', () => {
    const { dispatcher } = setupKanban();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    render(dispatcher.getState(), root);

    const ta = document.createElement('textarea');
    root.appendChild(ta);
    ta.focus();
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

    expect(dispatcher.getState().selectedLid).toBe('t1');
    ta.remove();
  });

  it('blocked with Ctrl modifier', () => {
    const { dispatcher } = setupKanban();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', ctrlKey: true, bubbles: true }));

    expect(dispatcher.getState().selectedLid).toBe('t1');
  });

  it('allowed in readonly mode', () => {
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: kanbanContainer, readonly: true });
    dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'kanban' });
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

    expect(dispatcher.getState().selectedLid).toBe('t2');
  });

  // ── Regression ──

  it('regression: detail mode sidebar Arrow Up/Down unchanged', () => {
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: kanbanContainer });
    // detail mode (default)
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

    // Should select first sidebar item
    expect(dispatcher.getState().selectedLid).not.toBeNull();
  });

  it('regression: detail mode Arrow Left/Right tree ops unchanged', () => {
    // Use a container with a folder to test tree ops
    const folderContainer: Container = {
      meta: mockContainer.meta,
      entries: [
        { lid: 'f1', title: 'Folder', body: '', archetype: 'folder', created_at: '2026-01-01T00:01:00Z', updated_at: '2026-01-01T00:01:00Z' },
        { lid: 'c1', title: 'Child', body: '', archetype: 'text', created_at: '2026-01-01T00:02:00Z', updated_at: '2026-01-01T00:02:00Z' },
      ],
      relations: [
        { id: 'r1', from: 'f1', to: 'c1', kind: 'structural', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ],
      revisions: [],
      assets: {},
    };
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: folderContainer });
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'f1' });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);

    // Arrow Left collapses folder
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(dispatcher.getState().collapsedFolders).toContain('f1');
  });

  it('regression: Enter dispatches BEGIN_EDIT in kanban mode', () => {
    const { dispatcher } = setupKanban();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(dispatcher.getState().phase).toBe('editing');
  });

  it('regression: Escape clears selection in kanban mode', () => {
    const { dispatcher } = setupKanban();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(dispatcher.getState().selectedLid).toBeNull();
  });

  it('regression: click selection works in kanban mode', () => {
    const { dispatcher } = setupKanban();
    render(dispatcher.getState(), root);

    const card = root.querySelector('[data-pkc-lid="t2"]');
    expect(card).not.toBeNull();
    card!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(dispatcher.getState().selectedLid).toBe('t2');
  });
});

// ─── Kanban Keyboard Phase 2: Space Status Toggle ──────────
describe('Kanban keyboard Phase 2 — Space status toggle', () => {
  // Reuse kanban container: open=[t1,t2,t3], done=[t4,t5], text=tx, archived=ta
  const kanbanContainer: Container = {
    meta: mockContainer.meta,
    entries: [
      { lid: 't1', title: 'Task A', body: '{"status":"open","description":"A"}', archetype: 'todo', created_at: '2026-01-01T00:01:00Z', updated_at: '2026-01-01T00:01:00Z' },
      { lid: 't2', title: 'Task B', body: '{"status":"open","description":"B"}', archetype: 'todo', created_at: '2026-01-01T00:02:00Z', updated_at: '2026-01-01T00:02:00Z' },
      { lid: 't3', title: 'Task C', body: '{"status":"open","description":"C"}', archetype: 'todo', created_at: '2026-01-01T00:03:00Z', updated_at: '2026-01-01T00:03:00Z' },
      { lid: 't4', title: 'Task D', body: '{"status":"done","description":"D"}', archetype: 'todo', created_at: '2026-01-01T00:04:00Z', updated_at: '2026-01-01T00:04:00Z' },
      { lid: 't5', title: 'Task E', body: '{"status":"done","description":"E"}', archetype: 'todo', created_at: '2026-01-01T00:05:00Z', updated_at: '2026-01-01T00:05:00Z' },
      { lid: 'tx', title: 'Text Entry', body: 'plain text', archetype: 'text', created_at: '2026-01-01T00:06:00Z', updated_at: '2026-01-01T00:06:00Z' },
      { lid: 'ta', title: 'Archived', body: '{"status":"done","description":"X","archived":true}', archetype: 'todo', created_at: '2026-01-01T00:07:00Z', updated_at: '2026-01-01T00:07:00Z' },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };

  function setupKanban() {
    const dispatcher = createDispatcher();
    const events: DomainEvent[] = [];
    dispatcher.onEvent((e) => events.push(e));
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: kanbanContainer });
    dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'kanban' });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);
    return { dispatcher, events };
  }

  // ── Integration ──

  it('Space toggles open → done', () => {
    const { dispatcher } = setupKanban();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));

    const entry = dispatcher.getState().container!.entries.find((e) => e.lid === 't1')!;
    expect(parseTodoBody(entry.body).status).toBe('done');
  });

  it('Space toggles done → open', () => {
    const { dispatcher } = setupKanban();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't4' });
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));

    const entry = dispatcher.getState().container!.entries.find((e) => e.lid === 't4')!;
    expect(parseTodoBody(entry.body).status).toBe('open');
  });

  it('Space preserves selectedLid', () => {
    const { dispatcher } = setupKanban();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));

    expect(dispatcher.getState().selectedLid).toBe('t1');
  });

  it('Space preserves description and other fields', () => {
    const { dispatcher } = setupKanban();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));

    const entry = dispatcher.getState().container!.entries.find((e) => e.lid === 't1')!;
    const todo = parseTodoBody(entry.body);
    expect(todo.description).toBe('A');
    expect(todo.status).toBe('done');
  });

  // ── Guard ──

  it('no-op in non-kanban view', () => {
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: kanbanContainer });
    // detail mode (default)
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));

    const entry = dispatcher.getState().container!.entries.find((e) => e.lid === 't1')!;
    expect(parseTodoBody(entry.body).status).toBe('open'); // unchanged
  });

  it('no-op during editing', () => {
    const { dispatcher } = setupKanban();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    dispatcher.dispatch({ type: 'BEGIN_EDIT', lid: 't1' });
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));

    const entry = dispatcher.getState().container!.entries.find((e) => e.lid === 't1')!;
    expect(parseTodoBody(entry.body).status).toBe('open'); // unchanged
  });

  it('no-op when textarea is focused', () => {
    const { dispatcher } = setupKanban();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    render(dispatcher.getState(), root);

    const ta = document.createElement('textarea');
    root.appendChild(ta);
    ta.focus();
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));

    const entry = dispatcher.getState().container!.entries.find((e) => e.lid === 't1')!;
    expect(parseTodoBody(entry.body).status).toBe('open'); // unchanged
    ta.remove();
  });

  it('no-op with Ctrl modifier', () => {
    const { dispatcher } = setupKanban();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', ctrlKey: true, bubbles: true }));

    const entry = dispatcher.getState().container!.entries.find((e) => e.lid === 't1')!;
    expect(parseTodoBody(entry.body).status).toBe('open'); // unchanged
  });

  it('no-op with Shift modifier', () => {
    const { dispatcher } = setupKanban();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', shiftKey: true, bubbles: true }));

    const entry = dispatcher.getState().container!.entries.find((e) => e.lid === 't1')!;
    expect(parseTodoBody(entry.body).status).toBe('open'); // unchanged
  });

  it('no-op for non-todo entry', () => {
    const { dispatcher } = setupKanban();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'tx' }); // text entry
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));

    const entry = dispatcher.getState().container!.entries.find((e) => e.lid === 'tx')!;
    expect(entry.body).toBe('plain text'); // unchanged
  });

  it('no-op when no selection', () => {
    const { dispatcher } = setupKanban();
    render(dispatcher.getState(), root);
    expect(dispatcher.getState().selectedLid).toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));

    // All entries unchanged
    const t1 = dispatcher.getState().container!.entries.find((e) => e.lid === 't1')!;
    expect(parseTodoBody(t1.body).status).toBe('open');
  });

  // ── Regression ──

  it('regression: Arrow navigation still works after Space toggle', () => {
    const { dispatcher } = setupKanban();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    render(dispatcher.getState(), root);

    // Toggle t1 to done
    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    render(dispatcher.getState(), root);

    // Arrow Down should still work (t1 moved to done column, navigate within it)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

    expect(dispatcher.getState().selectedLid).not.toBeNull();
  });

  it('regression: Enter still dispatches BEGIN_EDIT', () => {
    const { dispatcher } = setupKanban();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(dispatcher.getState().phase).toBe('editing');
  });

  it('regression: Escape still clears selection', () => {
    const { dispatcher } = setupKanban();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(dispatcher.getState().selectedLid).toBeNull();
  });

  it('regression: click toggle-todo-status still works', () => {
    const { dispatcher } = setupKanban();
    render(dispatcher.getState(), root);

    const btn = root.querySelector('[data-pkc-action="toggle-todo-status"][data-pkc-lid="t1"]');
    expect(btn).not.toBeNull();
    btn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const entry = dispatcher.getState().container!.entries.find((e) => e.lid === 't1')!;
    expect(parseTodoBody(entry.body).status).toBe('done');
  });
});

// ─── Kanban Keyboard Phase 3 — Ctrl+Arrow status move ──────────
describe('Kanban keyboard Phase 3 — Ctrl+Arrow status move', () => {
  const kanbanContainer: Container = {
    meta: mockContainer.meta,
    entries: [
      { lid: 't1', title: 'Task A', body: '{"status":"open","description":"A"}', archetype: 'todo', created_at: '2026-01-01T00:01:00Z', updated_at: '2026-01-01T00:01:00Z' },
      { lid: 't2', title: 'Task B', body: '{"status":"open","description":"B"}', archetype: 'todo', created_at: '2026-01-01T00:02:00Z', updated_at: '2026-01-01T00:02:00Z' },
      { lid: 't4', title: 'Task D', body: '{"status":"done","description":"D"}', archetype: 'todo', created_at: '2026-01-01T00:04:00Z', updated_at: '2026-01-01T00:04:00Z' },
      { lid: 'tx', title: 'Text Entry', body: 'plain text', archetype: 'text', created_at: '2026-01-01T00:06:00Z', updated_at: '2026-01-01T00:06:00Z' },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };

  function setupKanban() {
    const dispatcher = createDispatcher();
    const events: DomainEvent[] = [];
    dispatcher.onEvent((e) => events.push(e));
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: kanbanContainer });
    dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'kanban' });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);
    return { dispatcher, events };
  }

  // ── Integration ──

  it('Ctrl+Right moves open → done', () => {
    const { dispatcher } = setupKanban();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', ctrlKey: true, bubbles: true }));

    const entry = dispatcher.getState().container!.entries.find((e) => e.lid === 't1')!;
    expect(parseTodoBody(entry.body).status).toBe('done');
  });

  it('Ctrl+Left moves done → open', () => {
    const { dispatcher } = setupKanban();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't4' });
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', ctrlKey: true, bubbles: true }));

    const entry = dispatcher.getState().container!.entries.find((e) => e.lid === 't4')!;
    expect(parseTodoBody(entry.body).status).toBe('open');
  });

  it('Ctrl+Left on open entry (leftmost) is no-op', () => {
    const { dispatcher } = setupKanban();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', ctrlKey: true, bubbles: true }));

    const entry = dispatcher.getState().container!.entries.find((e) => e.lid === 't1')!;
    expect(parseTodoBody(entry.body).status).toBe('open'); // unchanged
  });

  it('Ctrl+Right on done entry (rightmost) is no-op', () => {
    const { dispatcher } = setupKanban();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't4' });
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', ctrlKey: true, bubbles: true }));

    const entry = dispatcher.getState().container!.entries.find((e) => e.lid === 't4')!;
    expect(parseTodoBody(entry.body).status).toBe('done'); // unchanged
  });

  it('selectedLid is maintained after status move', () => {
    const { dispatcher } = setupKanban();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', ctrlKey: true, bubbles: true }));

    expect(dispatcher.getState().selectedLid).toBe('t1');
  });

  it('preserves description and other body fields', () => {
    const { dispatcher } = setupKanban();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', ctrlKey: true, bubbles: true }));

    const entry = dispatcher.getState().container!.entries.find((e) => e.lid === 't1')!;
    const todo = parseTodoBody(entry.body);
    expect(todo.description).toBe('A');
    expect(todo.status).toBe('done');
  });

  it('Cmd (metaKey) also works', () => {
    const { dispatcher } = setupKanban();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', metaKey: true, bubbles: true }));

    const entry = dispatcher.getState().container!.entries.find((e) => e.lid === 't1')!;
    expect(parseTodoBody(entry.body).status).toBe('done');
  });

  // ── Guard ──

  it('no-op in non-kanban view', () => {
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: kanbanContainer });
    // detail mode (default)
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', ctrlKey: true, bubbles: true }));

    const entry = dispatcher.getState().container!.entries.find((e) => e.lid === 't1')!;
    expect(parseTodoBody(entry.body).status).toBe('open'); // unchanged
  });

  it('no-op during editing', () => {
    const { dispatcher } = setupKanban();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    dispatcher.dispatch({ type: 'BEGIN_EDIT', lid: 't1' });
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', ctrlKey: true, bubbles: true }));

    const entry = dispatcher.getState().container!.entries.find((e) => e.lid === 't1')!;
    expect(parseTodoBody(entry.body).status).toBe('open'); // unchanged
  });

  it('no-op when textarea is focused', () => {
    const { dispatcher } = setupKanban();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    render(dispatcher.getState(), root);

    const ta = document.createElement('textarea');
    root.appendChild(ta);
    ta.focus();
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', ctrlKey: true, bubbles: true }));

    const entry = dispatcher.getState().container!.entries.find((e) => e.lid === 't1')!;
    expect(parseTodoBody(entry.body).status).toBe('open'); // unchanged
    ta.remove();
  });

  it('no-op in readonly mode', () => {
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: kanbanContainer, readonly: true });
    dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'kanban' });
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', ctrlKey: true, bubbles: true }));

    const entry = dispatcher.getState().container!.entries.find((e) => e.lid === 't1')!;
    expect(parseTodoBody(entry.body).status).toBe('open'); // unchanged
  });

  it('no-op for non-todo entry', () => {
    const { dispatcher } = setupKanban();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'tx' });
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', ctrlKey: true, bubbles: true }));

    const entry = dispatcher.getState().container!.entries.find((e) => e.lid === 'tx')!;
    expect(entry.body).toBe('plain text'); // unchanged
  });

  it('no-op when no selection', () => {
    const { dispatcher } = setupKanban();
    render(dispatcher.getState(), root);
    expect(dispatcher.getState().selectedLid).toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', ctrlKey: true, bubbles: true }));

    const t1 = dispatcher.getState().container!.entries.find((e) => e.lid === 't1')!;
    expect(parseTodoBody(t1.body).status).toBe('open');
  });

  it('no-op with Shift modifier', () => {
    const { dispatcher } = setupKanban();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', ctrlKey: true, shiftKey: true, bubbles: true }));

    const entry = dispatcher.getState().container!.entries.find((e) => e.lid === 't1')!;
    expect(parseTodoBody(entry.body).status).toBe('open'); // unchanged
  });

  it('no-op with Alt modifier', () => {
    const { dispatcher } = setupKanban();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', ctrlKey: true, altKey: true, bubbles: true }));

    const entry = dispatcher.getState().container!.entries.find((e) => e.lid === 't1')!;
    expect(parseTodoBody(entry.body).status).toBe('open'); // unchanged
  });

  // ── Regression ──

  it('regression: plain Arrow Left/Right still navigates columns', () => {
    const { dispatcher } = setupKanban();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    render(dispatcher.getState(), root);

    // Plain ArrowRight moves selection to done column (Phase 1 navigation)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

    // selectedLid should change (not t1 anymore — moved to done column)
    const newLid = dispatcher.getState().selectedLid;
    expect(newLid).not.toBeNull();
    // t1 body should be unchanged (status still open — plain Arrow is navigation, not status move)
    const entry = dispatcher.getState().container!.entries.find((e) => e.lid === 't1')!;
    expect(parseTodoBody(entry.body).status).toBe('open');
  });

  it('regression: Space toggle still works', () => {
    const { dispatcher } = setupKanban();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));

    const entry = dispatcher.getState().container!.entries.find((e) => e.lid === 't1')!;
    expect(parseTodoBody(entry.body).status).toBe('done');
  });

  it('regression: Escape still clears selection', () => {
    const { dispatcher } = setupKanban();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(dispatcher.getState().selectedLid).toBeNull();
  });
});

// ─── Calendar Keyboard Navigation Phase 1 ──────────
describe('Calendar keyboard navigation (Phase 1)', () => {
  // April 2026 calendar: starts on Wednesday
  // Dates with todos:
  //   Apr 1 (Wed): c1 (open)
  //   Apr 3 (Fri): c2 (open), c6 (done) — two todos same date
  //   Apr 10 (Fri): c4 (open)
  //   Apr 15 (Wed): c3 (open) — gap on Apr 8 to test week-skip
  //   Apr 22 (Wed): c5 (open)
  // Non-calendar entries:
  //   cx: text entry (not a todo)
  //   ca: archived todo (hidden when showArchived=false)
  const calendarContainer: Container = {
    meta: mockContainer.meta,
    entries: [
      { lid: 'c1', title: 'Todo Apr1', body: '{"status":"open","description":"A","date":"2026-04-01"}', archetype: 'todo', created_at: '2026-01-01T00:01:00Z', updated_at: '2026-01-01T00:01:00Z' },
      { lid: 'c2', title: 'Todo Apr3a', body: '{"status":"open","description":"B","date":"2026-04-03"}', archetype: 'todo', created_at: '2026-01-01T00:02:00Z', updated_at: '2026-01-01T00:02:00Z' },
      { lid: 'c3', title: 'Todo Apr15', body: '{"status":"open","description":"C","date":"2026-04-15"}', archetype: 'todo', created_at: '2026-01-01T00:03:00Z', updated_at: '2026-01-01T00:03:00Z' },
      { lid: 'c4', title: 'Todo Apr10', body: '{"status":"open","description":"D","date":"2026-04-10"}', archetype: 'todo', created_at: '2026-01-01T00:04:00Z', updated_at: '2026-01-01T00:04:00Z' },
      { lid: 'c5', title: 'Todo Apr22', body: '{"status":"open","description":"E","date":"2026-04-22"}', archetype: 'todo', created_at: '2026-01-01T00:05:00Z', updated_at: '2026-01-01T00:05:00Z' },
      { lid: 'c6', title: 'Todo Apr3b', body: '{"status":"done","description":"F","date":"2026-04-03"}', archetype: 'todo', created_at: '2026-01-01T00:06:00Z', updated_at: '2026-01-01T00:06:00Z' },
      { lid: 'cx', title: 'Text Entry', body: 'plain text', archetype: 'text', created_at: '2026-01-01T00:07:00Z', updated_at: '2026-01-01T00:07:00Z' },
      { lid: 'ca', title: 'Archived', body: '{"status":"done","description":"X","archived":true,"date":"2026-04-05"}', archetype: 'todo', created_at: '2026-01-01T00:08:00Z', updated_at: '2026-01-01T00:08:00Z' },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };

  function setupCalendar() {
    const dispatcher = createDispatcher();
    const events: DomainEvent[] = [];
    dispatcher.onEvent((e) => events.push(e));
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: calendarContainer });
    dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'calendar' });
    dispatcher.dispatch({ type: 'SET_CALENDAR_MONTH', year: 2026, month: 4 });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);
    return { dispatcher, events };
  }

  // ── Integration: Arrow Left / Right (day move, skip empty dates) ──

  it('Arrow Right moves to next date with todos', () => {
    const { dispatcher } = setupCalendar();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'c1' }); // Apr 1
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

    // Apr 2 has no todo → skipped. Apr 3 has c2, c6.
    expect(dispatcher.getState().selectedLid).toBe('c2');
  });

  it('calendar Arrow nav does NOT unfold sidebar ancestors (PR-ε₂ lockdown)', () => {
    // Calendar keyboard navigation must leave `state.collapsedFolders`
    // alone: the user is working inside the calendar view and any
    // folded sidebar branches should survive the keystroke. This is
    // a regression guard on the `revealInSidebar`-less default path.
    const { dispatcher } = setupCalendar();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'c1', revealInSidebar: true });
    // Now fold a folder that is NOT an ancestor of any currently-
    // selected calendar todo so the fold is unambiguously a
    // user-initiated one.
    dispatcher.dispatch({ type: 'TOGGLE_FOLDER_COLLAPSE', lid: 'cf1' });
    const beforeFolded = dispatcher.getState().collapsedFolders;
    expect(beforeFolded).toContain('cf1');
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

    // Reference-equal: the reducer saw no revealInSidebar flag, so
    // collapsedFolders was never replaced with a filtered copy.
    expect(dispatcher.getState().collapsedFolders).toBe(beforeFolded);
  });

  it('Arrow Left moves to previous date with todos', () => {
    const { dispatcher } = setupCalendar();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'c4' }); // Apr 10
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));

    // Apr 9-4 empty → Apr 3 has c2, c6
    expect(dispatcher.getState().selectedLid).toBe('c2');
  });

  it('Arrow Right at last date with todos is no-op', () => {
    const { dispatcher } = setupCalendar();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'c5' }); // Apr 22, last date with todos
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

    expect(dispatcher.getState().selectedLid).toBe('c5');
  });

  it('Arrow Left at first date with todos is no-op', () => {
    const { dispatcher } = setupCalendar();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'c1' }); // Apr 1, first date with todos
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));

    expect(dispatcher.getState().selectedLid).toBe('c1');
  });

  it('Arrow Right skips multiple empty dates', () => {
    const { dispatcher } = setupCalendar();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'c2' }); // Apr 3
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

    // Apr 4-9 have no todos → Apr 10 has c4
    expect(dispatcher.getState().selectedLid).toBe('c4');
  });

  // ── Integration: Arrow Up / Down (week move, ±7 days) ──

  it('Arrow Down moves to same weekday +1 week', () => {
    const { dispatcher } = setupCalendar();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'c2' }); // Apr 3 (Fri)
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

    // Apr 10 (Fri) has c4
    expect(dispatcher.getState().selectedLid).toBe('c4');
  });

  it('Arrow Up moves to same weekday -1 week', () => {
    const { dispatcher } = setupCalendar();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'c4' }); // Apr 10 (Fri)
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));

    // Apr 3 (Fri) has c2, c6
    expect(dispatcher.getState().selectedLid).toBe('c2');
  });

  it('Arrow Down skips weeks without todos', () => {
    const { dispatcher } = setupCalendar();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'c1' }); // Apr 1 (Wed)
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

    // Apr 8 (Wed) has NO todo → skip. Apr 15 (Wed) has c3.
    expect(dispatcher.getState().selectedLid).toBe('c3');
  });

  it('Arrow Up skips weeks without todos', () => {
    const { dispatcher } = setupCalendar();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'c3' }); // Apr 15 (Wed)
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));

    // Apr 8 (Wed) has NO todo → skip. Apr 1 (Wed) has c1.
    expect(dispatcher.getState().selectedLid).toBe('c1');
  });

  it('Arrow Down at month boundary is no-op', () => {
    const { dispatcher } = setupCalendar();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'c5' }); // Apr 22 (Wed)
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

    // Apr 29 has no todo, May 6 not in month → no-op
    expect(dispatcher.getState().selectedLid).toBe('c5');
  });

  it('Arrow Up at month boundary is no-op', () => {
    const { dispatcher } = setupCalendar();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'c1' }); // Apr 1 (Wed)
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));

    // Mar 25 not in April calendar → no-op
    expect(dispatcher.getState().selectedLid).toBe('c1');
  });

  it('Arrow Down from Friday — month boundary no-op', () => {
    const { dispatcher } = setupCalendar();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'c4' }); // Apr 10 (Fri)
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

    // Apr 17 no todo, Apr 24 no todo, May 1 not in month → no-op
    expect(dispatcher.getState().selectedLid).toBe('c4');
  });

  // ── Fallback: selectedLid not visible in calendar ──

  it('selectedLid not in calendar → Arrow Down selects first calendar todo', () => {
    const { dispatcher } = setupCalendar();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'cx' }); // text entry, not in calendar
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

    expect(dispatcher.getState().selectedLid).toBe('c1'); // first todo chronologically
  });

  it('no selection → Arrow Up selects first calendar todo', () => {
    const { dispatcher } = setupCalendar();
    render(dispatcher.getState(), root);
    expect(dispatcher.getState().selectedLid).toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));

    expect(dispatcher.getState().selectedLid).toBe('c1');
  });

  it('selectedLid not in calendar → Arrow Left is no-op', () => {
    const { dispatcher } = setupCalendar();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'cx' }); // text entry
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));

    expect(dispatcher.getState().selectedLid).toBe('cx');
  });

  it('selectedLid not in calendar → Arrow Right is no-op', () => {
    const { dispatcher } = setupCalendar();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'cx' }); // text entry
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

    expect(dispatcher.getState().selectedLid).toBe('cx');
  });

  // ── Guard ──

  it('non-calendar viewMode: Arrow keys use sidebar handler', () => {
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: calendarContainer });
    // viewMode is 'detail' (default) — sidebar includes ALL entries
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);

    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'c5' });
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

    // In detail mode, sidebar navigates to next entry (c6 or beyond),
    // not calendar navigation
    const selected = dispatcher.getState().selectedLid;
    expect(selected).not.toBe('c5'); // moved somewhere
    expect(selected).not.toBeNull();
  });

  it('blocked during editing', () => {
    const { dispatcher } = setupCalendar();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'c1' });
    dispatcher.dispatch({ type: 'BEGIN_EDIT', lid: 'c1' });
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

    expect(dispatcher.getState().selectedLid).toBe('c1');
    expect(dispatcher.getState().phase).toBe('editing');
  });

  it('blocked when textarea is focused', () => {
    const { dispatcher } = setupCalendar();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'c1' });
    render(dispatcher.getState(), root);

    const ta = document.createElement('textarea');
    root.appendChild(ta);
    ta.focus();
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

    expect(dispatcher.getState().selectedLid).toBe('c1');
    ta.remove();
  });

  it('blocked with Ctrl modifier', () => {
    const { dispatcher } = setupCalendar();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'c1' });
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', ctrlKey: true, bubbles: true }));

    expect(dispatcher.getState().selectedLid).toBe('c1');
  });

  it('allowed in readonly mode', () => {
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: calendarContainer, readonly: true });
    dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'calendar' });
    dispatcher.dispatch({ type: 'SET_CALENDAR_MONTH', year: 2026, month: 4 });
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'c1' });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

    expect(dispatcher.getState().selectedLid).toBe('c2');
  });

  // ── Regression ──

  it('regression: detail mode sidebar Arrow Up/Down unchanged', () => {
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: calendarContainer });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

    expect(dispatcher.getState().selectedLid).not.toBeNull();
  });

  it('regression: Enter dispatches BEGIN_EDIT in calendar mode', () => {
    const { dispatcher } = setupCalendar();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'c1' });
    render(dispatcher.getState(), root);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(dispatcher.getState().phase).toBe('editing');
  });

  it('regression: Escape clears selection in calendar mode', () => {
    const { dispatcher } = setupCalendar();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'c1' });

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(dispatcher.getState().selectedLid).toBeNull();
  });

  it('regression: click selection works in calendar mode', () => {
    const { dispatcher } = setupCalendar();
    render(dispatcher.getState(), root);

    const item = root.querySelector('[data-pkc-lid="c4"]');
    expect(item).not.toBeNull();
    item!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(dispatcher.getState().selectedLid).toBe('c4');
  });
});

// ─── Shortcut-help toggle (Ctrl+?) ────────────────────────────
describe('Shortcut help overlay: Ctrl+? toggle', () => {
  function setupHelp() {
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: mockContainer });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);
    return { dispatcher };
  }

  function overlay() {
    return root.querySelector<HTMLElement>('[data-pkc-region="shortcut-help"]');
  }

  it('bare `?` does NOT open the shortcut help overlay', () => {
    const { dispatcher } = setupHelp();
    expect(overlay()).toBeNull();
    expect(dispatcher.getState().shortcutHelpOpen).toBe(false);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }));

    // still closed — plain `?` must not disturb typing
    expect(overlay()).toBeNull();
    expect(dispatcher.getState().shortcutHelpOpen).toBe(false);
  });

  it('Ctrl+? opens the overlay, Ctrl+? again closes it', () => {
    const { dispatcher } = setupHelp();
    expect(overlay()).toBeNull();

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: '?', ctrlKey: true, shiftKey: true, bubbles: true }),
    );
    expect(dispatcher.getState().shortcutHelpOpen).toBe(true);
    expect(overlay()).not.toBeNull();

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: '?', ctrlKey: true, shiftKey: true, bubbles: true }),
    );
    expect(dispatcher.getState().shortcutHelpOpen).toBe(false);
    expect(overlay()).toBeNull();
  });

  it('⌘+? opens the overlay (mac)', () => {
    const { dispatcher } = setupHelp();
    expect(overlay()).toBeNull();

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: '?', metaKey: true, shiftKey: true, bubbles: true }),
    );
    expect(dispatcher.getState().shortcutHelpOpen).toBe(true);
    expect(overlay()).not.toBeNull();
  });

  it('Ctrl+? is inert while in editing phase (keeps typing uninterrupted)', () => {
    const { dispatcher } = setupHelp();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    dispatcher.dispatch({ type: 'BEGIN_EDIT', lid: 'e1' });
    render(dispatcher.getState(), root);
    expect(dispatcher.getState().phase).toBe('editing');

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: '?', ctrlKey: true, shiftKey: true, bubbles: true }),
    );

    expect(dispatcher.getState().shortcutHelpOpen).toBe(false);
    expect(overlay()).toBeNull();
  });
});
