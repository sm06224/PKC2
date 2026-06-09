/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach } from 'vitest';
import { createDispatcher } from '../../src/adapter/state/dispatcher';
import { moveEntryToFolder, relateEntries } from '../../src/adapter/ui/pkc-extension-startup';
import type { Container } from '../../src/core/model/container';

const TS = '2026-06-09T00:00:00Z';

function makeContainer(): Container {
  return {
    meta: { container_id: 'c', title: 'C', created_at: TS, updated_at: TS, schema_version: 1 },
    entries: [
      { lid: 'f1', title: 'Folder 1', body: '', archetype: 'folder', created_at: TS, updated_at: TS },
      { lid: 'f2', title: 'Folder 2', body: '', archetype: 'folder', created_at: TS, updated_at: TS },
      { lid: 'n1', title: 'Note 1', body: '', archetype: 'text', created_at: TS, updated_at: TS },
      { lid: 'n2', title: 'Note 2', body: '', archetype: 'text', created_at: TS, updated_at: TS },
    ],
    relations: [
      { id: 'r1', from: 'f1', to: 'n1', kind: 'structural', created_at: TS, updated_at: TS },
      { id: 'r2', from: 'f1', to: 'f2', kind: 'structural', created_at: TS, updated_at: TS },
    ],
    revisions: [],
    assets: {},
  };
}

function boot(): ReturnType<typeof createDispatcher> {
  const d = createDispatcher();
  d.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
  return d;
}

function structParent(d: ReturnType<typeof createDispatcher>, lid: string): string | null {
  const r = d.getState().container!.relations.find((x) => x.kind === 'structural' && x.to === lid);
  return r ? r.from : null;
}

describe('PKC-Extension graph edit (data-safe write path)', () => {
  let d: ReturnType<typeof createDispatcher>;
  beforeEach(() => { d = boot(); });

  it('moveEntryToFolder reparents (old structural removed, new added)', () => {
    expect(structParent(d, 'n1')).toBe('f1');
    moveEntryToFolder(d, 'n1', 'f2');
    expect(structParent(d, 'n1')).toBe('f2');
    // exactly one structural parent
    const parents = d.getState().container!.relations.filter((r) => r.kind === 'structural' && r.to === 'n1');
    expect(parents.length).toBe(1);
  });

  it('moveEntryToFolder is a no-op for invalid targets', () => {
    moveEntryToFolder(d, 'n1', 'n2');     // target not a folder
    expect(structParent(d, 'n1')).toBe('f1');
    moveEntryToFolder(d, 'n1', 'n1');     // self
    expect(structParent(d, 'n1')).toBe('f1');
    moveEntryToFolder(d, 'n1', 'nope');   // missing folder
    expect(structParent(d, 'n1')).toBe('f1');
  });

  it('moveEntryToFolder rejects a cycle (folder into its own descendant)', () => {
    // f2 is a child of f1; moving f1 into f2 would create a cycle → no-op.
    moveEntryToFolder(d, 'f1', 'f2');
    expect(structParent(d, 'f1')).toBe(null);
    expect(structParent(d, 'f2')).toBe('f1');
  });

  it('relateEntries creates a single semantic relation; dups/self/missing are no-ops', () => {
    const count = () => d.getState().container!.relations.filter((r) => r.kind === 'semantic').length;
    relateEntries(d, 'n1', 'n2');
    expect(count()).toBe(1);
    relateEntries(d, 'n1', 'n2'); // duplicate
    expect(count()).toBe(1);
    relateEntries(d, 'n1', 'n1'); // self
    relateEntries(d, 'n1', 'ghost'); // missing
    expect(count()).toBe(1);
  });
});
