/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { reduce, createInitialState } from '@adapter/state/app-state';
import type { AppState } from '@adapter/state/app-state';
import type { Container } from '@core/model/container';

/**
 * PR #186 — root-level ASSETS / TODOS auto-create contract.
 *
 * User direction (2026-04-28):
 *   「root配置はNG rootでもASSETS、TODOSの挙動は一緒
 *    仕様が間違ってる 最初の要望ではそんなこと言っていない」
 *
 * Pre-PR-186 the auto-placement spec said:
 *   "When parentFolder does not resolve (root fallback), ensureSubfolder
 *    is ignored — incidentals at root are still allowed to land at root,
 *    we don't auto-create root-level bucket folders."
 *
 * That ran counter to the user's expectation that ASSETS / TODOS folders
 * should ALWAYS organize their archetype, including at root. PR #186
 * inverts the rule: when no folder context resolves, the reducer
 * lazily creates a root-level ASSETS / TODOS folder and routes the new
 * entry into it.
 *
 * Tests here pin the reducer-level contract for both archetypes across
 * three scenarios:
 *   1. First-time use — root-level bucket is created
 *   2. Existing root-level bucket — reused (no duplicate)
 *   3. Folder context already resolves — no root-level bucket created
 *      (existing nested-subfolder behaviour unchanged)
 */

const T = '2026-04-28T00:00:00Z';

function emptyContainer(): Container {
  return {
    meta: { container_id: 'c1', title: 'T', created_at: T, updated_at: T, schema_version: 1 },
    entries: [],
    relations: [],
    revisions: [],
    assets: {},
  };
}

function ready(container: Container = emptyContainer()): AppState {
  const initial = createInitialState();
  const { state } = reduce(initial, { type: 'SYS_INIT_COMPLETE', container });
  return state;
}

function structuralParent(container: Container, lid: string): { lid: string; title: string } | null {
  for (const r of container.relations) {
    if (r.kind === 'structural' && r.to === lid) {
      const p = container.entries.find((e) => e.lid === r.from);
      if (p) return { lid: p.lid, title: p.title };
    }
  }
  return null;
}

describe('PR #186 — CREATE_ENTRY root-level TODOS auto-create', () => {
  it('first todo with no parentFolder → creates root-level TODOS folder + routes into it', () => {
    const s = ready();
    const { state } = reduce(s, {
      type: 'CREATE_ENTRY',
      archetype: 'todo',
      title: 'Buy milk',
      ensureSubfolder: 'TODOS',
    });
    const todo = state.container!.entries.find((e) => e.archetype === 'todo')!;
    const parent = structuralParent(state.container!, todo.lid);
    expect(parent).not.toBeNull();
    expect(parent!.title).toBe('TODOS');
    // The TODOS folder itself is at root (no incoming structural relation).
    expect(structuralParent(state.container!, parent!.lid)).toBeNull();
  });

  it('subsequent todos reuse the existing root-level TODOS folder', () => {
    let s = ready();
    s = reduce(s, {
      type: 'CREATE_ENTRY', archetype: 'todo', title: 'A', ensureSubfolder: 'TODOS',
    }).state;
    s = { ...s, phase: 'ready', editingLid: null };
    s = reduce(s, {
      type: 'CREATE_ENTRY', archetype: 'todo', title: 'B', ensureSubfolder: 'TODOS',
    }).state;
    const todosFolders = s.container!.entries.filter((e) => e.archetype === 'folder' && e.title === 'TODOS');
    expect(todosFolders.length).toBe(1);
    const todos = s.container!.entries.filter((e) => e.archetype === 'todo');
    expect(todos.length).toBe(2);
    for (const t of todos) {
      const parent = structuralParent(s.container!, t.lid);
      expect(parent!.lid).toBe(todosFolders[0]!.lid);
    }
  });

  it('explicit parentFolder still creates a NESTED TODOS subfolder (unchanged behaviour)', () => {
    const c = emptyContainer();
    c.entries.push({ lid: 'fld', title: 'Project', archetype: 'folder', body: '', created_at: T, updated_at: T });
    const s = ready(c);
    const { state } = reduce(s, {
      type: 'CREATE_ENTRY', archetype: 'todo', title: 'Buy', parentFolder: 'fld', ensureSubfolder: 'TODOS',
    });
    const todo = state.container!.entries.find((e) => e.archetype === 'todo')!;
    const parent = structuralParent(state.container!, todo.lid)!;
    expect(parent.title).toBe('TODOS');
    // The TODOS folder is a child of 'fld' (NOT at root).
    const grandparent = structuralParent(state.container!, parent.lid);
    expect(grandparent!.lid).toBe('fld');
  });
});

describe('PR #186 — PASTE_ATTACHMENT root-level ASSETS auto-create', () => {
  const pasteAction = {
    type: 'PASTE_ATTACHMENT' as const,
    name: 'p.png',
    mime: 'image/png',
    size: 4,
    assetKey: 'ast-1',
    assetData: 'data',
    contextLid: null,
  };

  it('paste at root → creates root-level ASSETS folder + routes into it', () => {
    const s = ready();
    const { state } = reduce(s, pasteAction);
    const att = state.container!.entries.find((e) => e.archetype === 'attachment')!;
    const parent = structuralParent(state.container!, att.lid);
    expect(parent).not.toBeNull();
    expect(parent!.title).toBe('ASSETS');
    expect(structuralParent(state.container!, parent!.lid)).toBeNull();
  });

  it('subsequent pastes reuse the existing root-level ASSETS', () => {
    let s = ready();
    s = reduce(s, pasteAction).state;
    s = reduce(s, { ...pasteAction, assetKey: 'ast-2', name: 'p2.png' }).state;
    const assetsFolders = s.container!.entries.filter((e) => e.archetype === 'folder' && e.title === 'ASSETS');
    expect(assetsFolders.length).toBe(1);
  });

  it('paste with folder context still creates NESTED ASSETS (unchanged)', () => {
    const c = emptyContainer();
    c.entries.push({ lid: 'fld', title: 'Project', archetype: 'folder', body: '', created_at: T, updated_at: T });
    const s = ready(c);
    const { state } = reduce(s, { ...pasteAction, contextLid: 'fld' });
    const att = state.container!.entries.find((e) => e.archetype === 'attachment')!;
    const parent = structuralParent(state.container!, att.lid)!;
    expect(parent.title).toBe('ASSETS');
    const grandparent = structuralParent(state.container!, parent.lid)!;
    expect(grandparent.lid).toBe('fld');
  });

  it('paste reuses an existing root-level ASSETS even when one is also nested under a folder', () => {
    const c = emptyContainer();
    c.entries.push(
      { lid: 'root-ast', title: 'ASSETS', archetype: 'folder', body: '', created_at: T, updated_at: T },
      { lid: 'fld', title: 'Project', archetype: 'folder', body: '', created_at: T, updated_at: T },
      { lid: 'nested-ast', title: 'ASSETS', archetype: 'folder', body: '', created_at: T, updated_at: T },
    );
    c.relations.push(
      { id: 'r1', from: 'fld', to: 'nested-ast', kind: 'structural', created_at: T, updated_at: T },
    );
    const s = ready(c);
    // No context — should land in the ROOT-level ASSETS, not the
    // nested one (only root-level folders are candidates for the
    // root-fallback path).
    const { state } = reduce(s, pasteAction);
    const att = state.container!.entries.find((e) => e.archetype === 'attachment')!;
    const parent = structuralParent(state.container!, att.lid)!;
    expect(parent.lid).toBe('root-ast');
  });
});
