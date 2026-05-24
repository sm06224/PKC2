import { describe, expect, it } from 'vitest';
import {
  detectAbandonedWarning,
  ABANDONED_DAYS_THRESHOLD,
} from '../../../src/features/ai/abandoned-warning';
import type { Entry } from '../../../src/core/model/record';
import type { Container } from '../../../src/core/model/container';
import type { Relation, RelationKind } from '../../../src/core/model/relation';

const NOW = Date.parse('2026-05-24T00:00:00Z');

function daysAgo(d: number): string {
  return new Date(NOW - d * 86_400_000).toISOString();
}

function makeEntry(opts: Partial<Entry> & { lid: string }): Entry {
  return {
    lid: opts.lid,
    title: opts.title ?? '',
    body: opts.body ?? '',
    archetype: opts.archetype ?? 'text',
    created_at: opts.created_at ?? daysAgo(100),
    updated_at: opts.updated_at ?? daysAgo(0),
    tags: opts.tags,
  };
}

function makeRel(from: string, to: string, kind: RelationKind = 'semantic'): Relation {
  return {
    id: `r_${from}_${to}`,
    from,
    to,
    kind,
    created_at: daysAgo(0),
    updated_at: daysAgo(0),
  };
}

function makeContainer(entries: Entry[], relations: Relation[] = []): Container {
  return {
    meta: {
      container_id: 'c1',
      title: 'C',
      created_at: daysAgo(100),
      updated_at: daysAgo(0),
      schema_version: 1,
    },
    entries,
    relations,
    revisions: [],
    assets: {},
  };
}

describe('detectAbandonedWarning', () => {
  it('case 1: 30 日以内 → null', () => {
    const e = makeEntry({ lid: 'e1', updated_at: daysAgo(10) });
    expect(detectAbandonedWarning(e, makeContainer([e]), NOW)).toBeNull();
  });

  it('case 2: 60 日前 + relation 0 + link 0 → warning', () => {
    const e = makeEntry({ lid: 'e1', updated_at: daysAgo(60), body: 'no link' });
    const w = detectAbandonedWarning(e, makeContainer([e]), NOW);
    expect(w).not.toBeNull();
    expect(w?.daysSinceUpdate).toBe(60);
    expect(w?.relationCount).toBe(0);
    expect(w?.linkRefCount).toBe(0);
  });

  it('case 3: 60 日前 + relation 1 件(from) → null', () => {
    const e = makeEntry({ lid: 'e1', updated_at: daysAgo(60) });
    const e2 = makeEntry({ lid: 'e2', updated_at: daysAgo(1) });
    const rel = makeRel('e1', 'e2');
    expect(detectAbandonedWarning(e, makeContainer([e, e2], [rel]), NOW)).toBeNull();
  });

  it('case 4: 60 日前 + relation 1 件(to) → null', () => {
    const e = makeEntry({ lid: 'e1', updated_at: daysAgo(60) });
    const e2 = makeEntry({ lid: 'e2', updated_at: daysAgo(1) });
    const rel = makeRel('e2', 'e1');
    expect(detectAbandonedWarning(e, makeContainer([e, e2], [rel]), NOW)).toBeNull();
  });

  it('case 5: 60 日前 + outgoing link 1 件(本文に [link](entry:e2)) → null', () => {
    const e = makeEntry({
      lid: 'e1',
      updated_at: daysAgo(60),
      body: 'see [link](entry:e2)',
    });
    const e2 = makeEntry({ lid: 'e2', updated_at: daysAgo(1) });
    expect(detectAbandonedWarning(e, makeContainer([e, e2]), NOW)).toBeNull();
  });

  it('case 6: 60 日前 + backlink 1 件(別 entry の本文に entry:e1) → null', () => {
    const e = makeEntry({ lid: 'e1', updated_at: daysAgo(60) });
    const e2 = makeEntry({
      lid: 'e2',
      updated_at: daysAgo(1),
      body: 'see [back](entry:e1)',
    });
    expect(detectAbandonedWarning(e, makeContainer([e, e2]), NOW)).toBeNull();
  });

  it('case 7: system entry(system-about)は判定対象外 → null', () => {
    const e = makeEntry({
      lid: '__about__',
      archetype: 'system-about',
      updated_at: daysAgo(365),
    });
    expect(detectAbandonedWarning(e, makeContainer([e]), NOW)).toBeNull();
  });

  it(`case 8: 境界 ${ABANDONED_DAYS_THRESHOLD} 日ちょうど → warning`, () => {
    const e = makeEntry({ lid: 'e1', updated_at: daysAgo(ABANDONED_DAYS_THRESHOLD) });
    expect(detectAbandonedWarning(e, makeContainer([e]), NOW)).not.toBeNull();
  });

  it(`case 9: ${ABANDONED_DAYS_THRESHOLD - 1} 日 → null(境界未満)`, () => {
    const e = makeEntry({ lid: 'e1', updated_at: daysAgo(ABANDONED_DAYS_THRESHOLD - 1) });
    expect(detectAbandonedWarning(e, makeContainer([e]), NOW)).toBeNull();
  });

  it('case 10: 不正な updated_at → 早期 return(parse fail で days=0 < threshold)', () => {
    const e = makeEntry({ lid: 'e1', updated_at: 'not-a-date' });
    expect(detectAbandonedWarning(e, makeContainer([e]), NOW)).toBeNull();
  });

  it('case 11: id は `abandoned:<lid>` 形式で安定', () => {
    const e = makeEntry({ lid: 'e_xyz', updated_at: daysAgo(100) });
    expect(detectAbandonedWarning(e, makeContainer([e]), NOW)?.id).toBe('abandoned:e_xyz');
  });

  it('case 12: reason 文に日数 + archive / 削除候補 を含む', () => {
    const e = makeEntry({ lid: 'e1', updated_at: daysAgo(45) });
    const w = detectAbandonedWarning(e, makeContainer([e]), NOW);
    expect(w?.reason).toContain('45');
    expect(w?.reason).toContain('archive');
    expect(w?.reason).toContain('削除候補');
  });

  it('case 13: 未来の updated_at(clock skew)は days=0 として null', () => {
    const future = new Date(NOW + 86_400_000).toISOString();
    const e = makeEntry({ lid: 'e1', updated_at: future });
    expect(detectAbandonedWarning(e, makeContainer([e]), NOW)).toBeNull();
  });

  it('case 14: now を変えると days 値が変わる(deterministic)', () => {
    const e = makeEntry({ lid: 'e1', updated_at: daysAgo(60) });
    const w1 = detectAbandonedWarning(e, makeContainer([e]), NOW)!;
    const w2 = detectAbandonedWarning(e, makeContainer([e]), NOW + 10 * 86_400_000)!;
    expect(w1.daysSinceUpdate).toBe(60);
    expect(w2.daysSinceUpdate).toBe(70);
  });

  it('case 15: 順序性(Phase 8)── relation 追加 mutation で warning が消える', () => {
    const e = makeEntry({ lid: 'e1', updated_at: daysAgo(60) });
    const e2 = makeEntry({ lid: 'e2', updated_at: daysAgo(1) });
    const before = makeContainer([e, e2]);
    expect(detectAbandonedWarning(e, before, NOW)).not.toBeNull();
    const after = makeContainer([e, e2], [makeRel('e1', 'e2')]);
    expect(detectAbandonedWarning(e, after, NOW)).toBeNull();
  });
});
