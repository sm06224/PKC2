/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach } from 'vitest';
import { createDispatcher } from '@adapter/state/dispatcher';
import { bindActions } from '@adapter/ui/action-binder';
import { render } from '@adapter/ui/renderer';
import type { Container } from '@core/model/container';

/**
 * 2026-04-27 user direction:
 *   「ASSETSとTODOSをデフォで隠す ... トグル自体を折りたたんで隠した
 *    うえで、フォルダすらもハイドする感じです」
 *
 * Tree-hide-buckets default-true → ASSETS / TODOS folders AND
 * their descendants disappear from the entries list. The toggle
 * sits inside a collapsed `<details>` advanced-filters disclosure
 * so the typical browse view stays clean.
 */

const T = '2026-04-27T00:00:00.000Z';

function fixture(): Container {
  // root
  //  ├─ note (text)
  //  ├─ ASSETS
  //  │   └─ snap (attachment)
  //  └─ TODOS
  //      └─ task (todo)
  return {
    meta: { container_id: 'cid', title: 'Test', created_at: T, updated_at: T, schema_version: 1 },
    entries: [
      { lid: 'note', title: 'Note', archetype: 'text', body: 'hi', created_at: T, updated_at: T },
      { lid: 'assets', title: 'ASSETS', archetype: 'folder', body: '', created_at: T, updated_at: T },
      { lid: 'snap', title: 'snap.png', archetype: 'attachment', body: JSON.stringify({ name: 'snap.png', mime: 'image/png', size: 0, asset_key: 'k' }), created_at: T, updated_at: T },
      { lid: 'todos', title: 'TODOS', archetype: 'folder', body: '', created_at: T, updated_at: T },
      { lid: 'task', title: 'Buy milk', archetype: 'todo', body: JSON.stringify({ status: 'open', description: '' }), created_at: T, updated_at: T },
    ],
    relations: [
      { id: 'r1', from: 'assets', to: 'snap', kind: 'structural', created_at: T, updated_at: T },
      { id: 'r2', from: 'todos', to: 'task', kind: 'structural', created_at: T, updated_at: T },
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

function setup() {
  const dispatcher = createDispatcher();
  dispatcher.onState((state) => render(state, root));
  dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: fixture() });
  render(dispatcher.getState(), root);
  cleanup = bindActions(root, dispatcher);
  return dispatcher;
}

function visibleLids(): string[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>('.pkc-entry-list [data-pkc-lid]'),
  ).map((el) => el.getAttribute('data-pkc-lid')!);
}

describe('tree-hide-buckets default-true', () => {
  it('default browse view hides both ASSETS and TODOS folders + their descendants', () => {
    setup();
    const lids = visibleLids();
    expect(lids).toContain('note');
    expect(lids).not.toContain('assets');
    expect(lids).not.toContain('snap');
    expect(lids).not.toContain('todos');
    expect(lids).not.toContain('task');
  });

  it('toggling tree-hide-buckets off restores the bucket folders and their descendants', () => {
    const dispatcher = setup();
    dispatcher.dispatch({ type: 'TOGGLE_TREE_HIDE_BUCKETS' });
    render(dispatcher.getState(), root);
    const lids = visibleLids();
    expect(lids).toContain('note');
    expect(lids).toContain('assets');
    expect(lids).toContain('snap');
    expect(lids).toContain('todos');
    expect(lids).toContain('task');
  });

  it('the unreferenced-attachments lens overrides tree-hide-buckets so cleanup candidates surface', () => {
    const dispatcher = setup();
    dispatcher.dispatch({ type: 'TOGGLE_UNREFERENCED_ATTACHMENTS_FILTER' });
    render(dispatcher.getState(), root);
    const lids = visibleLids();
    // snap lives inside ASSETS but is the actual cleanup target —
    // surfacing it is the whole point of the toggle.
    expect(lids).toContain('snap');
    expect(lids).not.toContain('assets'); // folder itself still off-list
    expect(lids).not.toContain('note');
  });
});

describe('advanced-filters disclosure section', () => {
  it('renders a collapsed <details> wrapping all the filter toggles', () => {
    setup();
    const details = root.querySelector<HTMLDetailsElement>(
      'details[data-pkc-region="advanced-filters"]',
    );
    expect(details).not.toBeNull();
    expect(details!.hasAttribute('open')).toBe(false);

    // Toggles live INSIDE the details, not as siblings.
    expect(details!.querySelector('[data-pkc-region="tree-hide-buckets-toggle"]')).not.toBeNull();
    expect(details!.querySelector('[data-pkc-region="unreferenced-attachments-toggle"]')).not.toBeNull();
  });

  it('clicking the summary dispatches TOGGLE_ADVANCED_FILTERS', () => {
    const dispatcher = setup();
    expect(dispatcher.getState().advancedFiltersOpen).toBe(false);
    const summary = root.querySelector<HTMLElement>(
      'details[data-pkc-region="advanced-filters"] > summary',
    );
    expect(summary).not.toBeNull();
    summary!.click();
    expect(dispatcher.getState().advancedFiltersOpen).toBe(true);
  });

  it('the section stays expanded across re-renders once opened', () => {
    const dispatcher = setup();
    dispatcher.dispatch({ type: 'TOGGLE_ADVANCED_FILTERS' });
    render(dispatcher.getState(), root);
    const details = root.querySelector<HTMLDetailsElement>(
      'details[data-pkc-region="advanced-filters"]',
    );
    expect(details!.hasAttribute('open')).toBe(true);

    // Trigger an unrelated dispatch — the open state survives.
    dispatcher.dispatch({ type: 'SET_SEARCH_QUERY', query: 'note' });
    render(dispatcher.getState(), root);
    const detailsAfter = root.querySelector<HTMLDetailsElement>(
      'details[data-pkc-region="advanced-filters"]',
    );
    expect(detailsAfter!.hasAttribute('open')).toBe(true);
  });
});
