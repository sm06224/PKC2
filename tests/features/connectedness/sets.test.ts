/**
 * Unified Orphan Detection v3 — S3 pure helper tests.
 *
 * Each test maps to a contract §5.8 test point (1–10).
 * Contract: docs/development/unified-orphan-detection-v3-contract.md
 */
import { describe, it, expect } from 'vitest';
import { buildConnectednessSets } from '@features/connectedness';
import { buildLinkIndex } from '@features/link-index/link-index';
import type { Container } from '@core/model/container';
import type { Entry, ArchetypeId } from '@core/model/record';
import type { Relation, RelationKind } from '@core/model/relation';

const T = '2026-01-01T00:00:00Z';

function mkEntry(lid: string, archetype: ArchetypeId, body = ''): Entry {
  return { lid, title: lid, body, archetype, created_at: T, updated_at: T };
}

function mkRelation(id: string, from: string, to: string, kind: RelationKind = 'structural'): Relation {
  return { id, from, to, kind, created_at: T, updated_at: T };
}

function mkContainer(entries: Entry[], relations: Relation[] = []): Container {
  return {
    meta: {
      container_id: 'c1',
      title: 'test',
      created_at: T,
      updated_at: T,
      schema_version: 1,
    },
    entries,
    relations,
    revisions: [],
    assets: {},
  };
}

describe('buildConnectednessSets — contract §5.8', () => {
  it('#1 empty container → 3 sets empty', () => {
    const sets = buildConnectednessSets(mkContainer([]));
    expect(sets.relationsConnected.size).toBe(0);
    expect(sets.markdownConnected.size).toBe(0);
    expect(sets.fullyUnconnected.size).toBe(0);
  });

  it('#2 entry participating in a relation → in relationsConnected', () => {
    const entries = [mkEntry('a', 'text'), mkEntry('b', 'text')];
    const relations = [mkRelation('r1', 'a', 'b')];
    const sets = buildConnectednessSets(mkContainer(entries, relations));
    expect(sets.relationsConnected.has('a')).toBe(true);
    expect(sets.relationsConnected.has('b')).toBe(true);
  });

  it('#3 entry with resolved outgoing markdown ref → in markdownConnected', () => {
    const entries = [
      mkEntry('a', 'text', 'see entry:b for details'),
      mkEntry('b', 'text'),
    ];
    const sets = buildConnectednessSets(mkContainer(entries));
    expect(sets.markdownConnected.has('a')).toBe(true); // a has resolved outgoing
    expect(sets.markdownConnected.has('b')).toBe(true); // b has inbound backlink from a
  });

  it('#4 entry whose only outgoing ref is broken → NOT in markdownConnected (§3.2)', () => {
    const entries = [mkEntry('a', 'text', 'dangling entry:nonexistent ref')];
    const sets = buildConnectednessSets(mkContainer(entries));
    expect(sets.markdownConnected.has('a')).toBe(false);
    expect(sets.fullyUnconnected.has('a')).toBe(true);
  });

  it('#5 entry whose only relation is a self-loop → NOT in relationsConnected (§3.3)', () => {
    const entries = [mkEntry('a', 'text')];
    const relations = [mkRelation('r1', 'a', 'a')];
    const sets = buildConnectednessSets(mkContainer(entries, relations));
    expect(sets.relationsConnected.has('a')).toBe(false);
    expect(sets.fullyUnconnected.has('a')).toBe(true);
  });

  it('#6 entry with relations but no markdown refs → relationsConnected ∧ ¬markdownConnected ∧ ¬fullyUnconnected', () => {
    const entries = [mkEntry('a', 'text'), mkEntry('b', 'text')];
    const relations = [mkRelation('r1', 'a', 'b')];
    const sets = buildConnectednessSets(mkContainer(entries, relations));
    expect(sets.relationsConnected.has('a')).toBe(true);
    expect(sets.markdownConnected.has('a')).toBe(false);
    expect(sets.fullyUnconnected.has('a')).toBe(false);
  });

  it('#7 entry with zero edges in either dimension → in fullyUnconnected', () => {
    const entries = [mkEntry('lonely', 'text')];
    const sets = buildConnectednessSets(mkContainer(entries));
    expect(sets.fullyUnconnected.has('lonely')).toBe(true);
    expect(sets.relationsConnected.has('lonely')).toBe(false);
    expect(sets.markdownConnected.has('lonely')).toBe(false);
  });

  it('#8 fullyUnconnected(e) ⟹ ¬relationsConnected(e) — subset relationship by construction', () => {
    const entries = [
      mkEntry('a', 'text', 'entry:b'),
      mkEntry('b', 'text'),
      mkEntry('c', 'text'),
      mkEntry('d', 'text'),
    ];
    const relations = [mkRelation('r1', 'c', 'd')];
    const sets = buildConnectednessSets(mkContainer(entries, relations));
    for (const lid of sets.fullyUnconnected) {
      expect(sets.relationsConnected.has(lid)).toBe(false);
    }
  });

  it('#9 archetype gate — form/attachment/generic/opaque excluded from markdownConnected (§3.5)', () => {
    const archetypes: ArchetypeId[] = ['form', 'attachment', 'generic', 'opaque'];
    for (const archetype of archetypes) {
      const entries = [
        mkEntry('src', 'text', 'see entry:target'), // markdown-evaluated source
        mkEntry('target', archetype),                // non-markdown-evaluated target
      ];
      const sets = buildConnectednessSets(mkContainer(entries));
      // Source (text) gets markdownConnected because its outgoing ref is resolved.
      expect(sets.markdownConnected.has('src')).toBe(true);
      // Non-markdown-evaluated target is NEVER in markdownConnected even if
      // it has inbound markdown backlinks.
      expect(sets.markdownConnected.has('target')).toBe(false);
      // For the non-markdown archetype, fullyUnconnected ⇔ ¬relationsConnected.
      // No relations exist, so target is fullyUnconnected.
      expect(sets.fullyUnconnected.has('target')).toBe(true);
    }
  });

  it('#10 dangling relation — neither side gains connectedness (§3.7)', () => {
    const entries = [mkEntry('alive', 'text')];
    // Relation points to a deleted / never-existing entry.
    const relations = [mkRelation('r-dangling', 'alive', 'deleted-lid')];
    const sets = buildConnectednessSets(mkContainer(entries, relations));
    expect(sets.relationsConnected.has('alive')).toBe(false);
    expect(sets.fullyUnconnected.has('alive')).toBe(true);
    // The dangling lid itself is never in any set (evaluation scope = user entries only).
    expect(sets.relationsConnected.has('deleted-lid')).toBe(false);
    expect(sets.markdownConnected.has('deleted-lid')).toBe(false);
    expect(sets.fullyUnconnected.has('deleted-lid')).toBe(false);
  });
});

describe('buildConnectednessSets — additional contract invariants', () => {
  it('subset relationship: fullyUnconnected ⊆ complement(relationsConnected) always', () => {
    // Random-ish mix: some connected by relation, some by markdown, some neither.
    const entries = [
      mkEntry('r1', 'text'),
      mkEntry('r2', 'text'),
      mkEntry('m1', 'text', 'entry:m2'),
      mkEntry('m2', 'text'),
      mkEntry('lonely', 'text'),
      mkEntry('selfloop', 'text'),
    ];
    const relations = [
      mkRelation('rel-a', 'r1', 'r2'),
      mkRelation('rel-b', 'selfloop', 'selfloop'), // excluded
    ];
    const sets = buildConnectednessSets(mkContainer(entries, relations));
    for (const lid of sets.fullyUnconnected) {
      expect(sets.relationsConnected.has(lid)).toBe(false);
      expect(sets.markdownConnected.has(lid)).toBe(false);
    }
    expect(sets.fullyUnconnected.has('lonely')).toBe(true);
    expect(sets.fullyUnconnected.has('selfloop')).toBe(true);
    expect(sets.fullyUnconnected.has('r1')).toBe(false);
    expect(sets.fullyUnconnected.has('m1')).toBe(false);
  });

  it('system entries (system-about / system-settings) excluded from all sets (§3.9)', () => {
    const entries = [
      mkEntry('__about__', 'system-about'),
      mkEntry('__settings__', 'system-settings'),
      mkEntry('u1', 'text'),
    ];
    const sets = buildConnectednessSets(mkContainer(entries));
    expect(sets.relationsConnected.has('__about__')).toBe(false);
    expect(sets.markdownConnected.has('__about__')).toBe(false);
    expect(sets.fullyUnconnected.has('__about__')).toBe(false);
    expect(sets.fullyUnconnected.has('__settings__')).toBe(false);
    // user entry is still evaluated
    expect(sets.fullyUnconnected.has('u1')).toBe(true);
  });

  it('provenance kind is treated like any other kind (§3.8)', () => {
    const entries = [mkEntry('src', 'text'), mkEntry('dst', 'text')];
    const relations = [mkRelation('p1', 'src', 'dst', 'provenance')];
    const sets = buildConnectednessSets(mkContainer(entries, relations));
    expect(sets.relationsConnected.has('src')).toBe(true);
    expect(sets.relationsConnected.has('dst')).toBe(true);
  });

  it('body-only mixed: entry reached only by inbound markdown backlinks', () => {
    const entries = [
      mkEntry('writer', 'text', 'pointer entry:target here'),
      mkEntry('target', 'text'),
    ];
    const sets = buildConnectednessSets(mkContainer(entries));
    expect(sets.markdownConnected.has('target')).toBe(true); // inbound only
    expect(sets.markdownConnected.has('writer')).toBe(true); // outbound resolved
    expect(sets.fullyUnconnected.has('target')).toBe(false);
  });

  it('mixed resolved + broken outgoing: resolved alone is enough (markdownConnected)', () => {
    const entries = [
      mkEntry('a', 'text', 'entry:exists and entry:ghost'),
      mkEntry('exists', 'text'),
    ];
    const sets = buildConnectednessSets(mkContainer(entries));
    expect(sets.markdownConnected.has('a')).toBe(true);
    expect(sets.markdownConnected.has('exists')).toBe(true);
  });

  // PR-δ: shared-LinkIndex overload — contract §5.4 / §5.7. Accepting a
  // pre-computed LinkIndex lets the renderer share one pass per render
  // between the sidebar connectedness marker and the References summary
  // row. The result must be identical to the default (compute-inline)
  // path.
  it('accepts a pre-computed LinkIndex and yields identical sets', () => {
    const entries = [
      mkEntry('writer', 'text', 'pointer entry:target here'),
      mkEntry('target', 'text'),
      mkEntry('lonely', 'text'),
    ];
    const container = mkContainer(entries);
    const baseline = buildConnectednessSets(container);
    const shared = buildConnectednessSets(container, buildLinkIndex(container));
    expect(Array.from(shared.relationsConnected).sort())
      .toEqual(Array.from(baseline.relationsConnected).sort());
    expect(Array.from(shared.markdownConnected).sort())
      .toEqual(Array.from(baseline.markdownConnected).sort());
    expect(Array.from(shared.fullyUnconnected).sort())
      .toEqual(Array.from(baseline.fullyUnconnected).sort());
  });
});
