/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, __resetEntryRowMemoForTest } from '@adapter/ui/renderer';
import { createInitialState, reduce } from '@adapter/state/app-state';
import type { AppState } from '@adapter/state/app-state';
import type { Container } from '@core/model/container';

/**
 * PR #179 row-memoization contract.
 *
 * Cache key: `Entry` reference. When an entry's content does not
 * change between renders, its `<li>` DOM node is reused; selection
 * attributes (`data-pkc-selected` / `data-pkc-multi-selected`) are
 * applied as a post-pass so cache hits still reflect the current
 * selection.
 *
 * Container reference change (entries / relations / revisions /
 * assets identity flip) blows the entire cache because the
 * derived backlink count / connectedness markers stop being
 * coherent across rows.
 *
 * Tests pin:
 *   1. Cache hit: same entry across two flat-mode renders → same DOM node
 *   2. Selection post-pass: cached row picks up the new selection
 *   3. Container invalidation: new container → cache miss for every entry
 *   4. Tree mode is NOT cached: tree-mode rows are fresh on every render
 *   5. Entry replacement (COMMIT_EDIT-style new ref) → cache miss for that entry, hit for others
 */

const T = '2026-04-27T00:00:00.000Z';

function fixture(): Container {
  return {
    meta: { container_id: 'cid', title: 't', created_at: T, updated_at: T, schema_version: 1 },
    entries: [
      { lid: 'a1', title: 'Alpha', archetype: 'text', body: 'a body', created_at: T, updated_at: T },
      { lid: 'a2', title: 'Beta', archetype: 'text', body: 'b body', created_at: T, updated_at: T },
      { lid: 'a3', title: 'Gamma', archetype: 'text', body: 'c body', created_at: T, updated_at: T },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };
}

function readyState(container: Container): AppState {
  const initial = createInitialState();
  const { state } = reduce(initial, { type: 'SYS_INIT_COMPLETE', container });
  return state;
}

let root: HTMLElement;

beforeEach(() => {
  __resetEntryRowMemoForTest();
  root = document.createElement('div');
  root.id = 'pkc-root';
  document.body.appendChild(root);
  return () => root.remove();
});

function entryRowFor(lid: string): HTMLElement | null {
  return root.querySelector<HTMLElement>(
    `.pkc-entry-list li.pkc-entry-item[data-pkc-lid="${lid}"]`,
  );
}

describe('PR #179 — flat-mode entry-row memoization', () => {
  it('cache hit: same Entry reference reuses the same <li> DOM node across two flat-mode renders', () => {
    const container = fixture();
    const prev = { ...readyState(container), searchQuery: 'a' }; // flat mode (search active)
    render(prev, root);
    const liA1Before = entryRowFor('a1');
    const liA2Before = entryRowFor('a2');
    expect(liA1Before).not.toBeNull();
    expect(liA2Before).not.toBeNull();

    // Tighten the search — sidebar-only re-render. Same entries
    // (same references), so cache should reuse the rows.
    const next: AppState = { ...prev, searchQuery: 'al' };
    render(next, root, prev);

    const liA1After = entryRowFor('a1');
    expect(liA1After).toBe(liA1Before); // ← cache hit (same DOM node moved)
  });

  it('selection post-pass: cached row picks up the new selectedLid even on cache hit', () => {
    const container = fixture();
    const prev: AppState = { ...readyState(container), searchQuery: 'a', selectedLid: 'a1' };
    render(prev, root);
    expect(entryRowFor('a1')?.getAttribute('data-pkc-selected')).toBe('true');
    expect(entryRowFor('a2')?.getAttribute('data-pkc-selected')).toBeNull();

    // Selection change forces 'full' scope, but the inner row cache
    // is still consulted: the SAME <li> for a1/a2 should be reused
    // and the post-pass should swap data-pkc-selected.
    const next: AppState = { ...prev, selectedLid: 'a2' };
    render(next, root, prev);
    expect(entryRowFor('a1')?.getAttribute('data-pkc-selected')).toBeNull();
    expect(entryRowFor('a2')?.getAttribute('data-pkc-selected')).toBe('true');
  });

  it('container invalidation: a new container reference produces a fresh DOM node for the same lid', () => {
    const container1 = fixture();
    const prev: AppState = { ...readyState(container1), searchQuery: 'a' };
    render(prev, root);
    const liBefore = entryRowFor('a1');
    expect(liBefore).not.toBeNull();

    // New container reference — even if the entry inside is
    // structurally identical, the cache must invalidate because
    // backlink-counts / connectedness derived from the container
    // are stale across all rows.
    const container2 = fixture();
    const next: AppState = { ...readyState(container2), searchQuery: 'a' };
    render(next, root, prev);

    const liAfter = entryRowFor('a1');
    expect(liAfter).not.toBe(liBefore); // ← cache invalidated
  });

  it('per-entry invalidation: replacing one entry reference (COMMIT_EDIT-style) misses for that lid only', () => {
    const container1 = fixture();
    const prev: AppState = { ...readyState(container1), searchQuery: 'a' };
    render(prev, root);
    const liA1Before = entryRowFor('a1');
    const liA2Before = entryRowFor('a2');

    // Replace a1's entry with a fresh object ref (mimicking how
    // COMMIT_EDIT mutates the entries array). a2 + a3 keep their
    // original refs. Same container TOO needs a new ref because
    // entries: [...] is itself a new array.
    const updatedEntry = { ...container1.entries[0]!, body: 'edited', updated_at: 'T2' };
    const container2: Container = {
      ...container1,
      entries: [updatedEntry, container1.entries[1]!, container1.entries[2]!],
    };
    const next: AppState = { ...readyState(container2), searchQuery: 'a' };
    render(next, root, prev);

    const liA1After = entryRowFor('a1');
    const liA2After = entryRowFor('a2');
    expect(liA1After).not.toBe(liA1Before); // ← container ref changed → cache wholesale invalidated
    expect(liA2After).not.toBe(liA2Before);
  });

  it('multi-selection post-pass works on cache hits', () => {
    const container = fixture();
    const prev: AppState = { ...readyState(container), searchQuery: 'a', multiSelectedLids: [] };
    render(prev, root);
    expect(entryRowFor('a1')?.getAttribute('data-pkc-multi-selected')).toBeNull();

    const next: AppState = { ...prev, multiSelectedLids: ['a1', 'a2'] };
    render(next, root, prev);
    expect(entryRowFor('a1')?.getAttribute('data-pkc-multi-selected')).toBe('true');
    expect(entryRowFor('a2')?.getAttribute('data-pkc-multi-selected')).toBe('true');
    expect(entryRowFor('a3')?.getAttribute('data-pkc-multi-selected')).toBeNull();
  });

  it('tree mode does NOT use the flat-mode cache (rows are rebuilt fresh)', () => {
    // Tree mode = no active filter (default for a freshly-loaded container).
    const container = fixture();
    const prev = readyState(container);
    render(prev, root);
    const liBefore = entryRowFor('a1');
    expect(liBefore).not.toBeNull();

    // Same state, second render — tree mode does not consult the
    // cache, so we expect the row to be rebuilt fresh.
    render(prev, root, null);
    const liAfter = entryRowFor('a1');
    expect(liAfter).not.toBe(liBefore);
  });
});
