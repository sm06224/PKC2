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

describe('create-entry auto-placement — todo', () => {
  it('places a new todo under the selected folder', () => {
    const { dispatcher } = setup('fld');
    clickCreate('todo');
    const newLid = newestLidOfArchetype(dispatcher, 'todo');
    expect(newLid).not.toBeNull();
    expect(placementParent(dispatcher, newLid!)).toBe('fld');
  });

  it('places a new todo under the parent folder of the selected entry', () => {
    const { dispatcher } = setup('note');
    clickCreate('todo');
    const newLid = newestLidOfArchetype(dispatcher, 'todo');
    expect(placementParent(dispatcher, newLid!)).toBe('fld');
  });

  it('leaves a new todo at root when the selected entry has no folder ancestor', () => {
    const { dispatcher } = setup('root-note');
    clickCreate('todo');
    const newLid = newestLidOfArchetype(dispatcher, 'todo');
    expect(placementParent(dispatcher, newLid!)).toBeNull();
  });

  it('leaves a new todo at root when nothing is selected', () => {
    const { dispatcher } = setup(null);
    clickCreate('todo');
    const newLid = newestLidOfArchetype(dispatcher, 'todo');
    expect(placementParent(dispatcher, newLid!)).toBeNull();
  });
});

describe('create-entry auto-placement — attachment', () => {
  it('places a new attachment under the parent folder of the selected entry', () => {
    const { dispatcher } = setup('note');
    clickCreate('attachment');
    const newLid = newestLidOfArchetype(dispatcher, 'attachment');
    expect(placementParent(dispatcher, newLid!)).toBe('fld');
  });
});

describe('create-entry auto-placement — regression guards', () => {
  it('explicit data-pkc-context-folder wins over auto-resolution (todo)', () => {
    // Even though selection resolves to `fld`, the button says "put
    // this specific one somewhere else" — explicit context must win.
    const { dispatcher } = setup('note');
    // Register a second folder to route into. CREATE_ENTRY lands the
    // state in `editing`, so cancel back to `ready` before firing the
    // next UI action (the action-binder itself is the SUT here, not
    // this setup step).
    dispatcher.dispatch({ type: 'CREATE_ENTRY', archetype: 'folder', title: 'Other' });
    const otherFolderLid = dispatcher.getState().selectedLid!;
    dispatcher.dispatch({ type: 'CANCEL_EDIT' });
    // Re-select the original note so auto-resolution would route to
    // `fld` — we want to prove that the explicit contextFolder beats
    // that choice.
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'note' });
    clickCreate('todo', { contextFolder: otherFolderLid });
    const newLid = newestLidOfArchetype(dispatcher, 'todo');
    expect(placementParent(dispatcher, newLid!)).toBe(otherFolderLid);
  });

  it('non-auto archetypes (text) are unaffected — land wherever they used to', () => {
    const { dispatcher } = setup('note');
    clickCreate('text');
    const newLid = newestLidOfArchetype(dispatcher, 'text');
    // text / textlog / folder / form are NOT in the auto set — they
    // stay at root when no explicit context-folder was given.
    expect(placementParent(dispatcher, newLid!)).toBeNull();
  });

  it('non-auto archetypes still honour explicit data-pkc-context-folder', () => {
    const { dispatcher } = setup('note');
    clickCreate('text', { contextFolder: 'fld' });
    const newLid = newestLidOfArchetype(dispatcher, 'text');
    expect(placementParent(dispatcher, newLid!)).toBe('fld');
  });
});
