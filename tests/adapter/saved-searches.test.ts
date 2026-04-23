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
  it('Save button → prompt → SAVE_SEARCH dispatch', () => {
    const dispatcher = setup();
    // Put something in the search state so the save has content.
    dispatcher.dispatch({ type: 'SET_SEARCH_QUERY', query: 'hello' });
    render(dispatcher.getState(), root);

    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('My Query');
    try {
      const btn = root.querySelector<HTMLElement>('[data-pkc-action="save-search"]')!;
      btn.click();
    } finally {
      promptSpy.mockRestore();
    }

    const saved = dispatcher.getState().container!.meta.saved_searches ?? [];
    expect(saved).toHaveLength(1);
    expect(saved[0]!.name).toBe('My Query');
    expect(saved[0]!.search_query).toBe('hello');
  });

  it('Save button → prompt cancel (null) → no dispatch', () => {
    const dispatcher = setup();
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue(null);
    try {
      const btn = root.querySelector<HTMLElement>('[data-pkc-action="save-search"]')!;
      btn.click();
    } finally {
      promptSpy.mockRestore();
    }
    const saved = dispatcher.getState().container!.meta.saved_searches ?? [];
    expect(saved).toHaveLength(0);
  });

  it('Save button → empty whitespace name → no dispatch', () => {
    const dispatcher = setup();
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('   ');
    try {
      const btn = root.querySelector<HTMLElement>('[data-pkc-action="save-search"]')!;
      btn.click();
    } finally {
      promptSpy.mockRestore();
    }
    const saved = dispatcher.getState().container!.meta.saved_searches ?? [];
    expect(saved).toHaveLength(0);
  });

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

  it('Slice F-4: existing ★ (save-search) flow is unchanged — name comes from prompt', () => {
    const dispatcher = setup();
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('Named');
    try {
      root.querySelector<HTMLElement>('[data-pkc-action="save-search"]')!.click();
    } finally {
      promptSpy.mockRestore();
    }
    // The explicit prompt-based name survives — quick-save's default
    // name format ("Saved <datetime>") is NOT applied to the ★ path.
    const saved = dispatcher.getState().container!.meta.saved_searches ?? [];
    expect(saved.map((s) => s.name)).toEqual(['Named']);
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
});
