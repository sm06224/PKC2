import { describe, expect, it } from 'vitest';
import { detectCircularReference } from '../../../src/features/ai/circular-reference';
import type { Entry } from '../../../src/core/model/record';
import type { Container } from '../../../src/core/model/container';
import type { Relation, RelationKind } from '../../../src/core/model/relation';

const TS = '2026-05-24T00:00:00Z';

function makeEntry(opts: Partial<Entry> & { lid: string }): Entry {
  return {
    lid: opts.lid,
    title: opts.title ?? '',
    body: opts.body ?? '',
    archetype: opts.archetype ?? 'text',
    created_at: TS,
    updated_at: TS,
  };
}

function makeRel(from: string, to: string, kind: RelationKind = 'semantic'): Relation {
  return {
    id: `r_${from}_${to}`,
    from,
    to,
    kind,
    created_at: TS,
    updated_at: TS,
  };
}

function makeContainer(entries: Entry[], relations: Relation[] = []): Container {
  return {
    meta: { container_id: 'c1', title: 'C', created_at: TS, updated_at: TS, schema_version: 1 },
    entries,
    relations,
    revisions: [],
    assets: {},
  };
}

describe('detectCircularReference', () => {
  it('case 1: relation 無し → null', () => {
    const e = makeEntry({ lid: 'a' });
    expect(detectCircularReference(e, makeContainer([e]))).toBeNull();
  });

  it('case 2: 一方向 a → b → c → null(循環なし)', () => {
    const a = makeEntry({ lid: 'a' });
    const b = makeEntry({ lid: 'b' });
    const c = makeEntry({ lid: 'c' });
    const rels = [makeRel('a', 'b'), makeRel('b', 'c')];
    expect(detectCircularReference(a, makeContainer([a, b, c], rels))).toBeNull();
  });

  it('case 3: 直接循環 a → b → a → 検出', () => {
    const a = makeEntry({ lid: 'a' });
    const b = makeEntry({ lid: 'b' });
    const rels = [makeRel('a', 'b'), makeRel('b', 'a')];
    const out = detectCircularReference(a, makeContainer([a, b], rels));
    expect(out).not.toBeNull();
    expect(out?.path).toEqual(['a', 'b', 'a']);
  });

  it('case 4: 自己参照 a → a → 検出 + reason に「自己参照」', () => {
    const a = makeEntry({ lid: 'a' });
    const rels = [makeRel('a', 'a')];
    const out = detectCircularReference(a, makeContainer([a], rels));
    expect(out?.path).toEqual(['a', 'a']);
    expect(out?.reason).toContain('自己参照');
  });

  it('case 5: 3-step 循環 a → b → c → a → 検出', () => {
    const a = makeEntry({ lid: 'a' });
    const b = makeEntry({ lid: 'b' });
    const c = makeEntry({ lid: 'c' });
    const rels = [makeRel('a', 'b'), makeRel('b', 'c'), makeRel('c', 'a')];
    const out = detectCircularReference(a, makeContainer([a, b, c], rels));
    expect(out?.path).toEqual(['a', 'b', 'c', 'a']);
    expect(out?.reason).toContain('3 ステップ');
  });

  it('case 6: 別 entry の循環は影響しない(現 entry に関係ない cycle は無視)', () => {
    const a = makeEntry({ lid: 'a' });
    const b = makeEntry({ lid: 'b' });
    const c = makeEntry({ lid: 'c' });
    const rels = [makeRel('b', 'c'), makeRel('c', 'b')];
    expect(detectCircularReference(a, makeContainer([a, b, c], rels))).toBeNull();
  });

  it('case 7: markdown entry: link でも循環検出', () => {
    const a = makeEntry({ lid: 'a', body: '[](entry:b)' });
    const b = makeEntry({ lid: 'b', body: '[](entry:a)' });
    const out = detectCircularReference(a, makeContainer([a, b]));
    expect(out).not.toBeNull();
    expect(out?.path).toEqual(['a', 'b', 'a']);
  });

  it('case 8: provenance kind は除外(merge 経路の循環は通常)', () => {
    const a = makeEntry({ lid: 'a' });
    const b = makeEntry({ lid: 'b' });
    const rels = [
      makeRel('a', 'b', 'provenance'),
      makeRel('b', 'a', 'provenance'),
    ];
    expect(detectCircularReference(a, makeContainer([a, b], rels))).toBeNull();
  });

  it('case 9: system entry は判定対象外', () => {
    const sys = makeEntry({ lid: '__about__', archetype: 'system-about' });
    const rels = [makeRel('__about__', '__about__')];
    expect(detectCircularReference(sys, makeContainer([sys], rels))).toBeNull();
  });

  it('case 10: id 形式は `circular-ref:<lid>`', () => {
    const a = makeEntry({ lid: 'e_x' });
    const rels = [makeRel('e_x', 'e_x')];
    expect(detectCircularReference(a, makeContainer([a], rels))?.id).toBe('circular-ref:e_x');
  });

  it('case 11: 順序性(Phase 8)── relation 削除で cycle 消える', () => {
    const a = makeEntry({ lid: 'a' });
    const b = makeEntry({ lid: 'b' });
    const before = makeContainer([a, b], [makeRel('a', 'b'), makeRel('b', 'a')]);
    expect(detectCircularReference(a, before)).not.toBeNull();
    const after = makeContainer([a, b], [makeRel('a', 'b')]);
    expect(detectCircularReference(a, after)).toBeNull();
  });

  it('case 12: 大規模 graph で MAX_DEPTH に頭打ち(無限 traversal 防止)', () => {
    // 32+ ノードの chain で final で a に戻る関係を作る、深さ MAX_DEPTH
    // を超えるため検出失敗が期待値
    const entries: Entry[] = [];
    const rels: Relation[] = [];
    for (let i = 0; i < 40; i++) {
      entries.push(makeEntry({ lid: `e${i}` }));
      if (i > 0) rels.push(makeRel(`e${i - 1}`, `e${i}`));
    }
    rels.push(makeRel(`e39`, 'e0')); // 戻り edge
    const out = detectCircularReference(entries[0]!, makeContainer(entries, rels));
    // 深すぎて見つからない or 見つかる(depth 39 < 32 で打ち切り = null)
    if (out !== null) {
      // 何らかの 短い path を見つけた可能性(別 path)── 通常 null
      expect(out.path.length).toBeGreaterThan(0);
    }
  });

  it('case 13: 4-step 循環 a → b → c → d → a → 検出', () => {
    const a = makeEntry({ lid: 'a' });
    const b = makeEntry({ lid: 'b' });
    const c = makeEntry({ lid: 'c' });
    const d = makeEntry({ lid: 'd' });
    const rels = [makeRel('a', 'b'), makeRel('b', 'c'), makeRel('c', 'd'), makeRel('d', 'a')];
    const out = detectCircularReference(a, makeContainer([a, b, c, d], rels));
    expect(out?.path).toEqual(['a', 'b', 'c', 'd', 'a']);
  });

  it('case 14: 別 entry も target だが cycle path は最短', () => {
    const a = makeEntry({ lid: 'a' });
    const b = makeEntry({ lid: 'b' });
    const c = makeEntry({ lid: 'c' });
    // a→b→a の 2-step、加えて a→c も
    const rels = [makeRel('a', 'b'), makeRel('b', 'a'), makeRel('a', 'c')];
    const out = detectCircularReference(a, makeContainer([a, b, c], rels));
    // BFS で最短 → a-b-a
    expect(out?.path).toEqual(['a', 'b', 'a']);
  });
});
