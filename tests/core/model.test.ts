import { describe, it, expect } from 'vitest';
import type { Record, ArchetypeId } from '@core/model/record';
import type { Relation, RelationKind } from '@core/model/relation';
import type { Container } from '@core/model/container';

describe('Core model types', () => {
  it('Record can be constructed with all archetype ids', () => {
    const ids: ArchetypeId[] = ['text', 'textlog', 'todo', 'form', 'attachment', 'generic', 'opaque'];
    for (const id of ids) {
      const record: Record = {
        lid: `lid-${id}`,
        title: `Title ${id}`,
        body: '',
        archetype: id,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };
      expect(record.archetype).toBe(id);
    }
  });

  it('Relation can be constructed with all kinds', () => {
    const kinds: RelationKind[] = ['structural', 'categorical', 'semantic', 'temporal'];
    for (const kind of kinds) {
      const relation: Relation = {
        id: `rel-${kind}`,
        from: 'a',
        to: 'b',
        kind,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };
      expect(relation.kind).toBe(kind);
    }
  });

  it('Container structure is valid', () => {
    const container: Container = {
      meta: {
        container_id: 'uuid-1',
        title: 'Test Container',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        schema_version: 1,
      },
      records: [],
      relations: [],
      revisions: [],
      assets: {},
    };
    expect(container.meta.schema_version).toBe(1);
    expect(container.records).toHaveLength(0);
  });
});
