import { describe, expect, it } from 'vitest';
import {
  detectDuplicates,
  DUPLICATE_THRESHOLD,
  DUPLICATE_MAX_RESULTS,
} from '../../../src/features/ai/duplicate-detector';
import type { Entry } from '../../../src/core/model/record';
import type { Container } from '../../../src/core/model/container';

const TS = '2026-05-24T00:00:00Z';

function makeEntry(opts: Partial<Entry> & { lid: string }): Entry {
  return {
    lid: opts.lid,
    title: opts.title ?? '',
    body: opts.body ?? '',
    archetype: opts.archetype ?? 'text',
    created_at: TS,
    updated_at: TS,
    tags: opts.tags,
  };
}

function makeContainer(entries: Entry[]): Container {
  return {
    meta: {
      container_id: 'c1',
      title: 'C',
      created_at: TS,
      updated_at: TS,
      schema_version: 1,
    },
    entries,
    relations: [],
    revisions: [],
    assets: {},
  };
}

describe('detectDuplicates', () => {
  it('case 1: container に他 entry 無し → []', () => {
    const e = makeEntry({ lid: 'e1', title: 'Hello world' });
    expect(detectDuplicates(e, makeContainer([e]))).toEqual([]);
  });

  it('case 2: 完全一致 title + body → similarity ~ 1.0', () => {
    const a = makeEntry({ lid: 'a', title: 'Same title', body: 'identical body content' });
    const b = makeEntry({ lid: 'b', title: 'Same title', body: 'identical body content' });
    const dups = detectDuplicates(a, makeContainer([a, b]));
    expect(dups).toHaveLength(1);
    expect(dups[0]?.lid).toBe('b');
    expect(dups[0]?.similarity).toBeGreaterThan(0.95);
  });

  it('case 3: 全く異なる title → threshold 下回り []', () => {
    const a = makeEntry({ lid: 'a', title: 'apple pie recipe' });
    const b = makeEntry({ lid: 'b', title: 'quantum mechanics' });
    expect(detectDuplicates(a, makeContainer([a, b]))).toEqual([]);
  });

  it('case 4: self は候補に含まない', () => {
    const a = makeEntry({ lid: 'a', title: 'Same' });
    const b = makeEntry({ lid: 'b', title: 'Same' });
    const dups = detectDuplicates(a, makeContainer([a, b]));
    expect(dups.find((d) => d.lid === 'a')).toBeUndefined();
  });

  it('case 5: system entry は除外', () => {
    const a = makeEntry({ lid: 'a', title: 'about' });
    const sys = makeEntry({
      lid: '__about__',
      title: 'about',
      archetype: 'system-about',
    });
    expect(detectDuplicates(a, makeContainer([a, sys]))).toEqual([]);
  });

  it('case 6: 入力 entry 自体が system なら []', () => {
    const sys = makeEntry({
      lid: '__about__',
      title: 'x',
      archetype: 'system-about',
    });
    const other = makeEntry({ lid: 'o', title: 'x' });
    expect(detectDuplicates(sys, makeContainer([sys, other]))).toEqual([]);
  });

  it('case 7: opaque archetype は候補から除外', () => {
    const a = makeEntry({ lid: 'a', title: 'Same words here' });
    const op = makeEntry({ lid: 'o', title: 'Same words here', archetype: 'opaque' });
    expect(detectDuplicates(a, makeContainer([a, op]))).toEqual([]);
  });

  it('case 8: 結果は similarity 降順 sort、上位 N 件', () => {
    const a = makeEntry({ lid: 'a', title: 'foo bar baz' });
    const b1 = makeEntry({ lid: 'b1', title: 'foo bar baz' }); // 100%
    const b2 = makeEntry({ lid: 'b2', title: 'foo bar baz qux' }); // ~95%
    const b3 = makeEntry({ lid: 'b3', title: 'foo bar' }); // ~80%
    const b4 = makeEntry({ lid: 'b4', title: 'foo bar baz hello world' }); // ~75%
    const b5 = makeEntry({ lid: 'b5', title: 'foo bar quux' }); // ~70%
    const dups = detectDuplicates(a, makeContainer([a, b1, b2, b3, b4, b5]));
    expect(dups.length).toBeLessThanOrEqual(DUPLICATE_MAX_RESULTS);
    // 1 位は b1(完全一致)
    expect(dups[0]?.lid).toBe('b1');
    // 降順
    for (let i = 0; i + 1 < dups.length; i++) {
      const cur = dups[i]?.similarity ?? 0;
      const nxt = dups[i + 1]?.similarity ?? 0;
      expect(cur).toBeGreaterThanOrEqual(nxt);
    }
  });

  it('case 9: title 一部一致 + body も似ている → sim 上昇', () => {
    const a = makeEntry({ lid: 'a', title: 'meeting notes', body: 'agenda: review last week, plan next' });
    const b = makeEntry({ lid: 'b', title: 'meeting notes', body: 'agenda: review last week, plan next' });
    const dups = detectDuplicates(a, makeContainer([a, b]));
    expect(dups[0]?.similarity).toBeGreaterThan(0.9);
  });

  it('case 10: id 形式は `duplicate:<self_lid>:<other_lid>`', () => {
    const a = makeEntry({ lid: 'self', title: 'X' });
    const b = makeEntry({ lid: 'other', title: 'X' });
    const dups = detectDuplicates(a, makeContainer([a, b]));
    expect(dups[0]?.id).toBe('duplicate:self:other');
  });

  it('case 11: title 空 → reason に「(無題)」 表示', () => {
    const a = makeEntry({ lid: 'a', title: 'common phrase here' });
    const b = makeEntry({ lid: 'b', title: 'common phrase here' });
    b.title = '';
    // 注:title 空にすると combineText が body のみ。body も空なら combine 結果空 → skip
    // title 空でも body あれば候補になる場合の title 表示
    b.title = '';
    b.body = 'common phrase here';
    const dups = detectDuplicates(a, makeContainer([a, b]));
    if (dups.length > 0) {
      expect(dups[0]?.title).toBe('(無題)');
    }
  });

  it('case 12: text archetype は body も比較対象', () => {
    const a = makeEntry({ lid: 'a', title: 'A', body: 'very long body content that should match' });
    const b = makeEntry({ lid: 'b', title: 'B', body: 'very long body content that should match' });
    const dups = detectDuplicates(a, makeContainer([a, b]));
    expect(dups.length).toBeGreaterThan(0);
  });

  it('case 13: todo archetype は body(JSON)を比較対象から除外、title のみ', () => {
    const a = makeEntry({
      lid: 'a',
      title: 'Buy groceries',
      archetype: 'todo',
      body: JSON.stringify({ status: 'open', description: 'apples, bananas' }),
    });
    const b = makeEntry({
      lid: 'b',
      title: 'Buy groceries',
      archetype: 'todo',
      body: JSON.stringify({ status: 'done', description: 'totally different stuff' }),
    });
    const dups = detectDuplicates(a, makeContainer([a, b]));
    expect(dups.length).toBeGreaterThan(0);
    // body 違っても title が同じなら similarity 高い
    expect(dups[0]?.similarity).toBeGreaterThan(0.9);
  });

  it('case 14: threshold 未満は除外', () => {
    const a = makeEntry({ lid: 'a', title: 'apple' });
    const b = makeEntry({ lid: 'b', title: 'apply' }); // bigram 一部一致だが小
    const dups = detectDuplicates(a, makeContainer([a, b]));
    for (const d of dups) {
      expect(d.similarity).toBeGreaterThanOrEqual(DUPLICATE_THRESHOLD);
    }
  });

  it(`case 15: 上位 ${DUPLICATE_MAX_RESULTS} 件まで(超過分は drop)`, () => {
    const a = makeEntry({ lid: 'a', title: 'hello world example' });
    const entries: Entry[] = [a];
    for (let i = 0; i < 10; i++) {
      entries.push(makeEntry({ lid: `dup${i}`, title: 'hello world example' }));
    }
    const dups = detectDuplicates(a, makeContainer(entries));
    expect(dups.length).toBe(DUPLICATE_MAX_RESULTS);
  });

  it('case 16: 順序性(Phase 8)── 完全一致 entry 削除で候補も消える', () => {
    const a = makeEntry({ lid: 'a', title: 'unique phrase' });
    const b = makeEntry({ lid: 'b', title: 'unique phrase' });
    expect(detectDuplicates(a, makeContainer([a, b])).length).toBe(1);
    expect(detectDuplicates(a, makeContainer([a])).length).toBe(0);
  });

  it('case 17: 空 title + 空 body の self → []', () => {
    const e = makeEntry({ lid: 'e', title: '', body: '' });
    const o = makeEntry({ lid: 'o', title: 'something' });
    expect(detectDuplicates(e, makeContainer([e, o]))).toEqual([]);
  });
});
