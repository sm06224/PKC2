/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach } from 'vitest';
import { createDispatcher } from '@adapter/state/dispatcher';
import { bindActions } from '@adapter/ui/action-binder';
import { render } from '@adapter/ui/renderer';
import type { Container } from '@core/model/container';

/**
 * Hide entries inside auto-bucket folders (ASSETS / TODOS) from the
 * sidebar's flat search-result list by default, with a toggle to
 * include them. Tree mode (no active filter) is unaffected.
 *
 * User direction 2026-04-26:
 * 「ASSETSとTODOSは検索オプションでデフォでハイドして」.
 */

const T = '2026-04-27T00:00:00.000Z';

function bucketContainer(): Container {
  // fld
  //  ├─ note (text, "lunch meeting note")
  //  └─ ASSETS
  //       └─ snap (attachment, "lunch-snap.png")
  return {
    meta: { container_id: 'c1', title: 'Bucket Fixture', created_at: T, updated_at: T, schema_version: 1 },
    entries: [
      { lid: 'fld', title: 'Project', archetype: 'folder', body: '', created_at: T, updated_at: T },
      { lid: 'note', title: 'lunch meeting note', archetype: 'text', body: 'lunch agenda', created_at: T, updated_at: T },
      { lid: 'assets', title: 'ASSETS', archetype: 'folder', body: '', created_at: T, updated_at: T },
      {
        lid: 'snap',
        title: 'lunch-snap.png',
        archetype: 'attachment',
        body: JSON.stringify({ name: 'lunch-snap.png', mime: 'image/png', size: 0, asset_key: 'k' }),
        created_at: T,
        updated_at: T,
      },
    ],
    relations: [
      { id: 'r1', from: 'fld', to: 'note', kind: 'structural', created_at: T, updated_at: T },
      { id: 'r2', from: 'fld', to: 'assets', kind: 'structural', created_at: T, updated_at: T },
      { id: 'r3', from: 'assets', to: 'snap', kind: 'structural', created_at: T, updated_at: T },
    ],
    revisions: [],
    assets: { k: '' },
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

function setupReady() {
  const dispatcher = createDispatcher();
  dispatcher.onState((state) => render(state, root));
  dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: bucketContainer() });
  render(dispatcher.getState(), root);
  cleanup = bindActions(root, dispatcher);
  return dispatcher;
}

function rowLids(): string[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>('.pkc-entry-list [data-pkc-lid]'),
  ).map((el) => el.getAttribute('data-pkc-lid')!);
}

describe('search hides ASSETS-bucketed entries by default', () => {
  it('without a search, tree mode hides the ASSETS folder + its contents by default (treeHideBuckets)', () => {
    setupReady();
    const lids = rowLids();
    // 2026-04-27 follow-up: bucket folders are also dropped from
    // the unfiltered tree by default. Toggling tree-hide-buckets
    // off would bring them back; the search-hide tests now
    // explicitly do that to keep the existing behaviour pinned.
    expect(lids).toContain('note');
    expect(lids).not.toContain('snap');
    expect(lids).not.toContain('assets');
  });

  it('with tree-hide-buckets disabled, tree mode shows the ASSETS folder + its contents intact', () => {
    const dispatcher = setupReady();
    dispatcher.dispatch({ type: 'TOGGLE_TREE_HIDE_BUCKETS' });
    render(dispatcher.getState(), root);
    const lids = rowLids();
    expect(lids).toContain('snap');
    expect(lids).toContain('assets');
    expect(lids).toContain('note');
  });

  it('with a search matching both note and snap, the bucketed snap is hidden', () => {
    const dispatcher = setupReady();
    dispatcher.dispatch({ type: 'SET_SEARCH_QUERY', query: 'lunch' });
    render(dispatcher.getState(), root);

    const lids = rowLids();
    expect(lids).toContain('note');
    expect(lids).not.toContain('snap');
  });

  it('with tree-hide-buckets off + search active, the search-hide toggle re-includes the bucketed entry when checked', () => {
    const dispatcher = setupReady();
    // Surface buckets in the tree first so the per-result toggle
    // is the only remaining gate.
    dispatcher.dispatch({ type: 'TOGGLE_TREE_HIDE_BUCKETS' });
    dispatcher.dispatch({ type: 'SET_SEARCH_QUERY', query: 'lunch' });
    render(dispatcher.getState(), root);

    const toggleRegion = root.querySelector(
      '[data-pkc-region="search-hide-buckets-toggle"]',
    );
    expect(toggleRegion).not.toBeNull();
    const checkbox = toggleRegion!.querySelector<HTMLInputElement>(
      'input[data-pkc-action="toggle-search-hide-buckets"]',
    );
    expect(checkbox).not.toBeNull();
    expect(checkbox!.checked).toBe(false);

    dispatcher.dispatch({ type: 'TOGGLE_SEARCH_HIDE_BUCKETS' });
    render(dispatcher.getState(), root);

    const lids = rowLids();
    expect(lids).toContain('snap');
    expect(lids).toContain('note');

    const checkboxAfter = root.querySelector<HTMLInputElement>(
      '[data-pkc-region="search-hide-buckets-toggle"] input[data-pkc-action="toggle-search-hide-buckets"]',
    );
    expect(checkboxAfter!.checked).toBe(true);
  });

  it('toggle is hidden when there is no active filter (tree mode)', () => {
    setupReady();
    const toggleRegion = root.querySelector(
      '[data-pkc-region="search-hide-buckets-toggle"]',
    );
    expect(toggleRegion).toBeNull();
  });

  it('archetype-only filter (no text query) also hides bucketed entries by default', () => {
    const dispatcher = setupReady();
    dispatcher.dispatch({ type: 'TOGGLE_ARCHETYPE_FILTER', archetype: 'attachment' });
    render(dispatcher.getState(), root);

    const lids = rowLids();
    // snap is the only attachment but it's bucketed → empty result by default
    expect(lids).not.toContain('snap');
  });
});
