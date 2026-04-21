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
