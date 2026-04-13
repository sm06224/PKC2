/**
 * Tests for `resolveAutoPlacementFolder` — the pure helper that picks
 * a target folder for newly-created incidental entries. See
 * docs/development/auto-folder-placement-for-generated-entries.md.
 */
import { describe, it, expect } from 'vitest';
import { resolveAutoPlacementFolder } from '../../../src/features/relation/auto-placement';
import type { Container } from '../../../src/core/model/container';

function makeContainer(partial: Partial<Container>): Container {
  return {
    meta: {
      container_id: 'test',
      title: 'Test',
      created_at: '2026-04-01T00:00:00Z',
      updated_at: '2026-04-01T00:00:00Z',
      schema_version: 1,
    },
    entries: [],
    relations: [],
    revisions: [],
    assets: {},
    ...partial,
  };
}

describe('resolveAutoPlacementFolder — null / missing inputs', () => {
  it('returns null when selectedLid is null', () => {
    const c = makeContainer({
      entries: [
        { lid: 'a', title: 'A', body: '', archetype: 'text', created_at: '', updated_at: '' },
      ],
    });
    expect(resolveAutoPlacementFolder(c, null)).toBeNull();
  });

  it('returns null when selectedLid is undefined', () => {
    const c = makeContainer({
      entries: [
        { lid: 'a', title: 'A', body: '', archetype: 'text', created_at: '', updated_at: '' },
      ],
    });
    expect(resolveAutoPlacementFolder(c, undefined)).toBeNull();
  });

  it('returns null when selectedLid does not resolve to any entry', () => {
    const c = makeContainer({
      entries: [
        { lid: 'a', title: 'A', body: '', archetype: 'text', created_at: '', updated_at: '' },
      ],
    });
    expect(resolveAutoPlacementFolder(c, 'ghost')).toBeNull();
  });
});

describe('resolveAutoPlacementFolder — selected folder', () => {
  it('returns the selected folder itself when the selection is a folder', () => {
    const c = makeContainer({
      entries: [
        { lid: 'fld', title: 'Project', body: '', archetype: 'folder', created_at: '', updated_at: '' },
      ],
    });
    expect(resolveAutoPlacementFolder(c, 'fld')).toBe('fld');
  });
});

describe('resolveAutoPlacementFolder — child entry walks up to parent folder', () => {
  it('returns the structural parent folder of a non-folder selection', () => {
    const c = makeContainer({
      entries: [
        { lid: 'fld', title: 'Project', body: '', archetype: 'folder', created_at: '', updated_at: '' },
        { lid: 'note', title: 'Note', body: '', archetype: 'text', created_at: '', updated_at: '' },
      ],
      relations: [
        { id: 'r1', from: 'fld', to: 'note', kind: 'structural', created_at: '', updated_at: '' },
      ],
    });
    expect(resolveAutoPlacementFolder(c, 'note')).toBe('fld');
  });

  it('walks past a non-folder structural parent until it finds a folder', () => {
    const c = makeContainer({
      entries: [
        { lid: 'fld', title: 'Project', body: '', archetype: 'folder', created_at: '', updated_at: '' },
        { lid: 'mid', title: 'Mid', body: '', archetype: 'text', created_at: '', updated_at: '' },
        { lid: 'leaf', title: 'Leaf', body: '', archetype: 'text', created_at: '', updated_at: '' },
      ],
      relations: [
        { id: 'r1', from: 'fld', to: 'mid', kind: 'structural', created_at: '', updated_at: '' },
        { id: 'r2', from: 'mid', to: 'leaf', kind: 'structural', created_at: '', updated_at: '' },
      ],
    });
    // From `leaf` → parent `mid` (text, skip) → grandparent `fld` (folder).
    expect(resolveAutoPlacementFolder(c, 'leaf')).toBe('fld');
  });
});

describe('resolveAutoPlacementFolder — root fallback', () => {
  it('returns null when a non-folder selection has no structural parent', () => {
    const c = makeContainer({
      entries: [
        { lid: 'note', title: 'Note', body: '', archetype: 'text', created_at: '', updated_at: '' },
      ],
    });
    expect(resolveAutoPlacementFolder(c, 'note')).toBeNull();
  });

  it('returns null when no folder exists on the ancestor chain', () => {
    const c = makeContainer({
      entries: [
        { lid: 'a', title: 'A', body: '', archetype: 'text', created_at: '', updated_at: '' },
        { lid: 'b', title: 'B', body: '', archetype: 'text', created_at: '', updated_at: '' },
      ],
      relations: [
        { id: 'r1', from: 'a', to: 'b', kind: 'structural', created_at: '', updated_at: '' },
      ],
    });
    // `b` → `a` (text, not folder) → no further parent → null.
    expect(resolveAutoPlacementFolder(c, 'b')).toBeNull();
  });
});

describe('resolveAutoPlacementFolder — cycle safety', () => {
  it('is safe against a structural cycle (a → b → a)', () => {
    const c = makeContainer({
      entries: [
        { lid: 'a', title: 'A', body: '', archetype: 'text', created_at: '', updated_at: '' },
        { lid: 'b', title: 'B', body: '', archetype: 'text', created_at: '', updated_at: '' },
      ],
      relations: [
        { id: 'r1', from: 'a', to: 'b', kind: 'structural', created_at: '', updated_at: '' },
        { id: 'r2', from: 'b', to: 'a', kind: 'structural', created_at: '', updated_at: '' },
      ],
    });
    // Neither entry is a folder and the cycle should not hang.
    expect(resolveAutoPlacementFolder(c, 'b')).toBeNull();
  });
});
