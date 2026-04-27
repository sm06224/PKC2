/**
 * @vitest-environment happy-dom
 *
 * Integration tests for archetype-aware auto-folder-placement at
 * `create-entry` time. See:
 *   - docs/development/auto-folder-placement-for-generated-entries.md
 *   - src/adapter/ui/action-binder.ts (case 'create-entry')
 *   - src/features/relation/auto-placement.ts
 *
 * Pure resolution rules are pinned in
 * `tests/features/relation/auto-placement.test.ts`; this file verifies
 * that the UI path hands the right context to the resolver and that
 * the resulting CREATE_RELATION lands where the rules promise.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher as _createRawDispatcher } from '@adapter/state/dispatcher';
import type { Container } from '@core/model/container';
import type { ArchetypeId } from '@core/model/record';

const baseContainer: Container = {
  meta: {
    container_id: 'auto-place-test',
    title: 'Auto Place Test',
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-01T00:00:00Z',
    schema_version: 1,
  },
  entries: [
    {
      lid: 'fld',
      title: 'Project',
      body: '',
      archetype: 'folder',
      created_at: '2026-04-01T00:00:00Z',
      updated_at: '2026-04-01T00:00:00Z',
    },
    {
      lid: 'note',
      title: 'A Note',
      body: 'hello',
      archetype: 'text',
      created_at: '2026-04-01T00:00:00Z',
      updated_at: '2026-04-01T00:00:00Z',
    },
    {
      lid: 'root-note',
      title: 'Root-level Note',
      body: 'no folder',
      archetype: 'text',
      created_at: '2026-04-01T00:00:00Z',
      updated_at: '2026-04-01T00:00:00Z',
    },
  ],
  relations: [
    { id: 'r1', from: 'fld', to: 'note', kind: 'structural', created_at: '2026-04-01T00:00:00Z', updated_at: '2026-04-01T00:00:00Z' },
  ],
  revisions: [],
  assets: {},
};

let root: HTMLElement;
let cleanup: (() => void) | null = null;
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
    cleanup = null;
    for (const fn of _trackedUnsubs) fn();
    _trackedUnsubs.length = 0;
    root.remove();
  };
});

function setup(selectedLid: string | null) {
  const dispatcher = createDispatcher();
  dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: baseContainer });
  if (selectedLid) dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: selectedLid });
  cleanup = bindActions(root, dispatcher);
  return { dispatcher };
}

/**
 * Fire a synthetic `create-entry` click without relying on the
 * renderer emitting the button — we test the action-binder contract
 * directly, so the archetype palette used by the UI doesn't need to
 * be rendered for this case.
 */
function clickCreate(arch: ArchetypeId, opts: { contextFolder?: string } = {}) {
  const btn = document.createElement('button');
  btn.setAttribute('data-pkc-action', 'create-entry');
  btn.setAttribute('data-pkc-archetype', arch);
  if (opts.contextFolder) {
    btn.setAttribute('data-pkc-context-folder', opts.contextFolder);
  }
  root.appendChild(btn);
  btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  btn.remove();
}

function placementParent(
  dispatcher: ReturnType<typeof createDispatcher>,
  lid: string,
): string | null {
  const c = dispatcher.getState().container!;
  const rel = c.relations.find((r) => r.kind === 'structural' && r.to === lid);
  return rel ? rel.from : null;
}

function newestLidOfArchetype(
  dispatcher: ReturnType<typeof createDispatcher>,
  arch: ArchetypeId,
): string | null {
  const c = dispatcher.getState().container!;
  // Ordered by insertion order — last is newest.
  for (let i = c.entries.length - 1; i >= 0; i--) {
    if (c.entries[i]!.archetype === arch) return c.entries[i]!.lid;
  }
  return null;
}

/**
 * Find a child folder of `parentLid` whose title equals `title`.
 * Used to prove that the reducer reused or created an archetype
 * subfolder under the context folder.
 */
function findChildFolderByTitle(
  dispatcher: ReturnType<typeof createDispatcher>,
  parentLid: string,
  title: string,
): string | null {
  const c = dispatcher.getState().container!;
  const entryMap = new Map(c.entries.map((e) => [e.lid, e]));
  for (const rel of c.relations) {
    if (rel.kind !== 'structural') continue;
    if (rel.from !== parentLid) continue;
    const child = entryMap.get(rel.to);
    if (!child || child.archetype !== 'folder') continue;
    if (child.title === title) return child.lid;
  }
  return null;
}

function countChildFoldersByTitle(
  dispatcher: ReturnType<typeof createDispatcher>,
  parentLid: string,
  title: string,
): number {
  const c = dispatcher.getState().container!;
  const entryMap = new Map(c.entries.map((e) => [e.lid, e]));
  let n = 0;
  for (const rel of c.relations) {
    if (rel.kind !== 'structural') continue;
    if (rel.from !== parentLid) continue;
    const child = entryMap.get(rel.to);
    if (!child || child.archetype !== 'folder') continue;
    if (child.title === title) n++;
  }
  return n;
}

describe('create-entry auto-placement — todo routes into TODOS subfolder', () => {
  it('creates a TODOS child under the selected folder and places the todo there', () => {
    const { dispatcher } = setup('fld');
    clickCreate('todo');
    const newLid = newestLidOfArchetype(dispatcher, 'todo');
    expect(newLid).not.toBeNull();
    const todosLid = findChildFolderByTitle(dispatcher, 'fld', 'TODOS');
    expect(todosLid).not.toBeNull();
    expect(placementParent(dispatcher, newLid!)).toBe(todosLid);
  });

  it('creates a TODOS child under the parent folder when a non-folder is selected', () => {
    const { dispatcher } = setup('note');
    clickCreate('todo');
    const newLid = newestLidOfArchetype(dispatcher, 'todo');
    const todosLid = findChildFolderByTitle(dispatcher, 'fld', 'TODOS');
    expect(todosLid).not.toBeNull();
    expect(placementParent(dispatcher, newLid!)).toBe(todosLid);
  });

  it('reuses an existing TODOS subfolder rather than creating a duplicate', () => {
    const { dispatcher } = setup('fld');
    // First todo: TODOS created lazily.
    clickCreate('todo');
    dispatcher.dispatch({ type: 'CANCEL_EDIT' });
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'fld' });
    // Second todo: must reuse the same TODOS folder.
    clickCreate('todo');
    const count = countChildFoldersByTitle(dispatcher, 'fld', 'TODOS');
    expect(count).toBe(1);
  });

  it('skips the subfolder layer when the context folder is itself titled TODOS', () => {
    const { dispatcher } = setup('fld');
    // Make a TODOS folder and select it.
    dispatcher.dispatch({ type: 'CREATE_ENTRY', archetype: 'folder', title: 'TODOS', parentFolder: 'fld' });
    const todosLid = dispatcher.getState().selectedLid!;
    dispatcher.dispatch({ type: 'CANCEL_EDIT' });
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: todosLid });
    clickCreate('todo');
    const newLid = newestLidOfArchetype(dispatcher, 'todo');
    // The todo goes directly into the TODOS folder — no TODOS/TODOS.
    expect(placementParent(dispatcher, newLid!)).toBe(todosLid);
    expect(countChildFoldersByTitle(dispatcher, todosLid, 'TODOS')).toBe(0);
  });

  it('leaves a new todo at root when the selected entry has no folder ancestor', () => {
    const { dispatcher } = setup('root-note');
    clickCreate('todo');
    const newLid = newestLidOfArchetype(dispatcher, 'todo');
    // Root fallback: no context folder → no TODOS auto-create.
    expect(placementParent(dispatcher, newLid!)).toBeNull();
  });

  it('leaves a new todo at root when nothing is selected', () => {
    const { dispatcher } = setup(null);
    clickCreate('todo');
    const newLid = newestLidOfArchetype(dispatcher, 'todo');
    expect(placementParent(dispatcher, newLid!)).toBeNull();
  });
});

describe('create-entry auto-placement — attachment routes into ASSETS subfolder', () => {
  // 2026-04-26 follow-up: the "📎 File" archetype-create button no
  // longer dispatches `CREATE_ENTRY` directly when clicked outside
  // editing mode — it now opens a hidden multi-file picker so iPad
  // / touch users can attach N files at once. The auto-placement
  // logic that used to run inline is no longer covered by these
  // two tests; the underlying CREATE_ENTRY auto-placement is still
  // exercised by the `todo` block above and the regression-guard
  // tests below. The `<input type="file">` opening is verified by
  // the next test (no entry created without a file selection).
  it('clicking 📎 File opens a multi-file picker without creating an entry', () => {
    const { dispatcher } = setup('note');
    const before = dispatcher.getState().container?.entries.length ?? 0;
    clickCreate('attachment');
    const after = dispatcher.getState().container?.entries.length ?? 0;
    // No entry should be created until the user actually selects
    // files in the picker. Auto-placement now happens at file-
    // selection time via `processFileAttachmentWithDedupe`.
    expect(after).toBe(before);
    const hiddenInput = document.querySelector(
      'input[data-pkc-role="creating-file-input"]',
    );
    expect(hiddenInput).not.toBeNull();
    expect((hiddenInput as HTMLInputElement).multiple).toBe(true);
  });
});

describe('create-entry auto-placement — regression guards', () => {
  it('explicit data-pkc-context-folder still triggers TODOS subfolder creation (todo)', () => {
    // Explicit context overrides WHICH folder is used for the context,
    // but the TODOS subfolder layer still applies — the policy is
    // "todos belong in TODOS wherever they land".
    const { dispatcher } = setup('note');
    dispatcher.dispatch({ type: 'CREATE_ENTRY', archetype: 'folder', title: 'Other' });
    const otherFolderLid = dispatcher.getState().selectedLid!;
    dispatcher.dispatch({ type: 'CANCEL_EDIT' });
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'note' });
    clickCreate('todo', { contextFolder: otherFolderLid });
    const newLid = newestLidOfArchetype(dispatcher, 'todo');
    const todosLid = findChildFolderByTitle(dispatcher, otherFolderLid, 'TODOS');
    expect(todosLid).not.toBeNull();
    expect(placementParent(dispatcher, newLid!)).toBe(todosLid);
    // `fld` must NOT have been touched — the explicit context won.
    expect(findChildFolderByTitle(dispatcher, 'fld', 'TODOS')).toBeNull();
  });

  it('non-auto archetypes (text) are unaffected — land wherever they used to', () => {
    const { dispatcher } = setup('note');
    clickCreate('text');
    const newLid = newestLidOfArchetype(dispatcher, 'text');
    // text / textlog / folder / form are NOT in the auto set — they
    // stay at root when no explicit context-folder was given and no
    // subfolder is ever created for them.
    expect(placementParent(dispatcher, newLid!)).toBeNull();
    expect(findChildFolderByTitle(dispatcher, 'fld', 'TODOS')).toBeNull();
    expect(findChildFolderByTitle(dispatcher, 'fld', 'ASSETS')).toBeNull();
  });

  it('non-auto archetypes honour explicit data-pkc-context-folder without subfolder routing', () => {
    const { dispatcher } = setup('note');
    clickCreate('text', { contextFolder: 'fld' });
    const newLid = newestLidOfArchetype(dispatcher, 'text');
    // Text goes directly into `fld` — no subfolder layer for text.
    expect(placementParent(dispatcher, newLid!)).toBe('fld');
    expect(findChildFolderByTitle(dispatcher, 'fld', 'TODOS')).toBeNull();
  });
});
