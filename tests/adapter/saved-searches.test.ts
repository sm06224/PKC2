/**
 * @vitest-environment happy-dom
 *
 * Saved Searches v1 — E2E action-binder behavior.
 * Spec: docs/development/saved-searches-v1.md §5 / §6
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher as _createRawDispatcher } from '@adapter/state/dispatcher';
import { render } from '@adapter/ui/renderer';
import type { Container } from '@core/model/container';
import type { SavedSearch } from '@core/model/saved-search';

function mkContainer(saved: SavedSearch[] = []): Container {
  return {
    meta: {
      container_id: 'ss-e2e',
      title: 'Saved E2E',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      schema_version: 1,
      saved_searches: saved,
    },
    entries: [
      {
        lid: 'a',
        title: 'A',
        body: '',
        archetype: 'text',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };
}

function mkSaved(id: string, name: string, overrides: Partial<SavedSearch> = {}): SavedSearch {
  return {
    id,
    name,
    created_at: '2026-04-21T00:00:00Z',
    updated_at: '2026-04-21T00:00:00Z',
    search_query: '',
    archetype_filter: [],
    tag_filter: null,
    sort_key: 'created_at',
    sort_direction: 'desc',
    show_archived: false,
    ...overrides,
  };
}

let root: HTMLElement;
let cleanup: () => void;
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

function setup(initialContainer: Container = mkContainer()) {
  const dispatcher = createDispatcher();
  dispatcher.onState((state) => render(state, root));
  dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: initialContainer });
  render(dispatcher.getState(), root);
  cleanup = bindActions(root, dispatcher);
  return dispatcher;
}

describe('Saved Searches v1 — click behavior (§5 / §6)', () => {
  // 2026-04-26 sidebar audit: the prompt-based ★ "Save current
  // search" button was removed from the search row because two
  // adjacent star icons (★ and ★+) confused users. Only the
  // quick-save flow remains in the UI; the previous tests for the
  // prompt path were tied to a UI button that no longer exists.
  // The `save-search` action handler in action-binder is left in
  // place for now in case any external code dispatches it, but
  // there is no UI route for end users.

  it('apply click restores the 6 AppState fields', () => {
    const saved = mkSaved('s-apply', 'Apply Me', {
      search_query: 'restored',
      sort_key: 'title',
      sort_direction: 'asc',
      show_archived: true,
    });
    const dispatcher = setup(mkContainer([saved]));

    const item = root.querySelector<HTMLElement>(
      '[data-pkc-action="apply-saved-search"][data-pkc-saved-id="s-apply"]',
    )!;
    item.click();

    const state = dispatcher.getState();
    expect(state.searchQuery).toBe('restored');
    expect(state.sortKey).toBe('title');
    expect(state.sortDirection).toBe('asc');
    expect(state.showArchived).toBe(true);
  });

  // ── W1 Slice F-4: Quick-save shortcut ──

  it('Slice F-4: quick-save button captures current filter state with a default name', () => {
    const dispatcher = setup();
    dispatcher.dispatch({ type: 'SET_SEARCH_QUERY', query: 'hello' });
    render(dispatcher.getState(), root);

    const btn = root.querySelector<HTMLElement>('[data-pkc-action="quick-save-search"]');
    expect(btn).not.toBeNull();
    btn!.click();

    const saved = dispatcher.getState().container!.meta.saved_searches ?? [];
    expect(saved).toHaveLength(1);
    // Default name starts with "Saved " and is non-empty beyond the prefix.
    expect(saved[0]!.name.startsWith('Saved ')).toBe(true);
    expect(saved[0]!.name.length).toBeGreaterThan('Saved '.length);
    // Filter state is captured (round-trip via applySavedSearchFields).
    expect(saved[0]!.search_query).toBe('hello');
  });

  it('Slice F-4: quick-save captures the Tag filter axis into tag_filter_v2', () => {
    const dispatcher = setup();
    dispatcher.dispatch({ type: 'TOGGLE_TAG_FILTER', tag: 'urgent' });
    dispatcher.dispatch({ type: 'TOGGLE_TAG_FILTER', tag: 'review' });
    render(dispatcher.getState(), root);

    root.querySelector<HTMLElement>('[data-pkc-action="quick-save-search"]')!.click();

    const saved = dispatcher.getState().container!.meta.saved_searches ?? [];
    expect(saved).toHaveLength(1);
    const tags = saved[0]!.tag_filter_v2 ?? [];
    // Order within a Set is insertion order, so both values round-trip.
    expect([...tags].sort()).toEqual(['review', 'urgent']);
  });

  it('Slice F-4: quick-save captures Tag + categorical peer together on a single row', () => {
    const dispatcher = setup();
    dispatcher.dispatch({ type: 'TOGGLE_TAG_FILTER', tag: 'urgent' });
    dispatcher.dispatch({ type: 'SET_CATEGORICAL_PEER_FILTER', peerLid: 'peer-lid-xyz' });
    render(dispatcher.getState(), root);

    root.querySelector<HTMLElement>('[data-pkc-action="quick-save-search"]')!.click();

    const saved = dispatcher.getState().container!.meta.saved_searches ?? [];
    expect(saved).toHaveLength(1);
    expect(saved[0]!.tag_filter_v2).toEqual(['urgent']);
    expect(saved[0]!.categorical_peer_filter).toBe('peer-lid-xyz');
  });

  it('Slice F-4: quick-save does NOT prompt the user (dispatch is synchronous)', () => {
    const dispatcher = setup();
    const promptSpy = vi.spyOn(window, 'prompt');
    try {
      root.querySelector<HTMLElement>('[data-pkc-action="quick-save-search"]')!.click();
    } finally {
      promptSpy.mockRestore();
    }
    expect(promptSpy).not.toHaveBeenCalled();
    const saved = dispatcher.getState().container!.meta.saved_searches ?? [];
    expect(saved).toHaveLength(1);
  });

  it('delete × button removes the saved search and does NOT fire apply', () => {
    const saved = [
      mkSaved('keep', 'Keep'),
      mkSaved('del', 'Delete Me', { search_query: 'should-not-apply' }),
    ];
    const dispatcher = setup(mkContainer(saved));

    const delBtn = root.querySelector<HTMLElement>(
      '[data-pkc-action="delete-saved-search"][data-pkc-saved-id="del"]',
    )!;
    delBtn.click();

    const state = dispatcher.getState();
    const remaining = state.container!.meta.saved_searches ?? [];
    expect(remaining.map((s) => s.id)).toEqual(['keep']);
    // Apply must NOT have run — searchQuery is still the initial empty string.
    expect(state.searchQuery).toBe('');
  });

  // 2026-04-26 follow-up to the sidebar audit: the legacy
  // prompt-based ★ button was dropped, so the rename affordance now
  // lives on the saved-search row itself. Click → window.prompt →
  // RENAME_SAVED_SEARCH dispatch, with the same `stopPropagation`
  // guard the delete × button uses so the parent row's
  // `apply-saved-search` does not fire alongside.

  it('rename ✏ button opens a prompt seeded with the current name and dispatches RENAME', () => {
    const dispatcher = setup(
      mkContainer([
        mkSaved('keep', 'Keep'),
        mkSaved('me', 'Old Name', { search_query: 'should-not-apply' }),
      ]),
    );

    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('New Name');
    let calls: unknown[];
    try {
      root.querySelector<HTMLElement>(
        '[data-pkc-action="rename-saved-search"][data-pkc-saved-id="me"]',
      )!.click();
      // Snapshot the spy call list BEFORE `mockRestore` runs in
      // the finally block — vitest clears the recorded calls when
      // the mock is restored, so any assertion that runs after it
      // would see zero invocations.
      calls = [...promptSpy.mock.calls];
    } finally {
      promptSpy.mockRestore();
    }

    expect(calls).toEqual([['保存検索の新しい名前:', 'Old Name']]);
    const state = dispatcher.getState();
    const me = state.container!.meta.saved_searches!.find((s) => s.id === 'me');
    expect(me!.name).toBe('New Name');
    // Apply guard: the surrounding row carries `apply-saved-search`,
    // so without `stopPropagation` the click would also restore the
    // saved query into AppState.
    expect(state.searchQuery).toBe('');
  });

  it('rename ✏ prompt cancel (null) does not dispatch', () => {
    const dispatcher = setup(mkContainer([mkSaved('me', 'Old')]));
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue(null);
    try {
      root.querySelector<HTMLElement>(
        '[data-pkc-action="rename-saved-search"][data-pkc-saved-id="me"]',
      )!.click();
    } finally {
      promptSpy.mockRestore();
    }
    expect(dispatcher.getState().container!.meta.saved_searches![0]!.name).toBe('Old');
  });

  it('rename ✏ empty / whitespace name is a silent no-op', () => {
    const dispatcher = setup(mkContainer([mkSaved('me', 'Old')]));
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('   ');
    try {
      root.querySelector<HTMLElement>(
        '[data-pkc-action="rename-saved-search"][data-pkc-saved-id="me"]',
      )!.click();
    } finally {
      promptSpy.mockRestore();
    }
    expect(dispatcher.getState().container!.meta.saved_searches![0]!.name).toBe('Old');
  });
});
