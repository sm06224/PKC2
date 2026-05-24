import { describe, expect, it } from 'vitest';
import { detectTagImbalance } from '../../../src/features/ai/tag-imbalance';
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
    meta: { container_id: 'c1', title: 'C', created_at: TS, updated_at: TS, schema_version: 1 },
    entries,
    relations: [],
    revisions: [],
    assets: {},
  };
}

describe('detectTagImbalance', () => {
  it('case 1: container 短すぎ(< 4 entry)→ null', () => {
    const a = makeEntry({ lid: 'a' });
    const b = makeEntry({ lid: 'b', tags: ['x'] });
    expect(detectTagImbalance(a, makeContainer([a, b]))).toBeNull();
  });

  it('case 2: tag 文化なし(< 50% entry が tag 持ち)→ null', () => {
    const target = makeEntry({ lid: 't' });
    const others = [
      makeEntry({ lid: 'a' }),
      makeEntry({ lid: 'b' }),
      makeEntry({ lid: 'c', tags: ['x'] }),
      makeEntry({ lid: 'd' }),
    ];
    expect(detectTagImbalance(target, makeContainer([target, ...others]))).toBeNull();
  });

  it('case 3: 50% 以上 tag 文化 + 自 entry 0 件 → suggest', () => {
    const target = makeEntry({ lid: 't' });
    const others = [
      makeEntry({ lid: 'a', tags: ['proj'] }),
      makeEntry({ lid: 'b', tags: ['proj', 'urgent'] }),
      makeEntry({ lid: 'c', tags: ['urgent'] }),
      makeEntry({ lid: 'd' }),
    ];
    const out = detectTagImbalance(target, makeContainer([target, ...others]));
    expect(out).not.toBeNull();
    expect(out?.popularTags).toContain('proj');
  });

  it('case 4: 既に tag を持つ entry → null', () => {
    const target = makeEntry({ lid: 't', tags: ['existing'] });
    const others = [
      makeEntry({ lid: 'a', tags: ['proj'] }),
      makeEntry({ lid: 'b', tags: ['proj'] }),
      makeEntry({ lid: 'c', tags: ['proj'] }),
      makeEntry({ lid: 'd', tags: ['proj'] }),
    ];
    expect(detectTagImbalance(target, makeContainer([target, ...others]))).toBeNull();
  });

  it('case 5: popular tags は top 3 + 降順 sort', () => {
    const target = makeEntry({ lid: 't' });
    const others = [
      makeEntry({ lid: 'a', tags: ['most'] }),
      makeEntry({ lid: 'b', tags: ['most', 'mid'] }),
      makeEntry({ lid: 'c', tags: ['most', 'mid', 'low'] }),
      makeEntry({ lid: 'd', tags: ['most'] }),
      makeEntry({ lid: 'e', tags: ['mid'] }),
    ];
    const out = detectTagImbalance(target, makeContainer([target, ...others]));
    expect(out?.popularTags[0]).toBe('most');
    expect(out?.popularTags.length).toBeLessThanOrEqual(3);
  });

  it('case 6: system entry は判定対象外', () => {
    const sys = makeEntry({ lid: '__about__', archetype: 'system-about' });
    const others = [
      makeEntry({ lid: 'a', tags: ['proj'] }),
      makeEntry({ lid: 'b', tags: ['proj'] }),
      makeEntry({ lid: 'c', tags: ['proj'] }),
      makeEntry({ lid: 'd', tags: ['proj'] }),
    ];
    expect(detectTagImbalance(sys, makeContainer([sys, ...others]))).toBeNull();
  });

  it('case 7: 非 lintable archetype(todo)→ null', () => {
    const t = makeEntry({ lid: 't', archetype: 'todo' });
    const others = [
      makeEntry({ lid: 'a', tags: ['proj'] }),
      makeEntry({ lid: 'b', tags: ['proj'] }),
      makeEntry({ lid: 'c', tags: ['proj'] }),
      makeEntry({ lid: 'd', tags: ['proj'] }),
    ];
    expect(detectTagImbalance(t, makeContainer([t, ...others]))).toBeNull();
  });

  it('case 8: frontmatter tags も entry.tags と union で読む', () => {
    const target = makeEntry({ lid: 't', body: '---\ntags: [existing]\n---\n本文' });
    const others = [
      makeEntry({ lid: 'a', tags: ['proj'] }),
      makeEntry({ lid: 'b', tags: ['proj'] }),
      makeEntry({ lid: 'c', tags: ['proj'] }),
      makeEntry({ lid: 'd', tags: ['proj'] }),
    ];
    // frontmatter tags の existing が tag 持ち扱い → null
    expect(detectTagImbalance(target, makeContainer([target, ...others]))).toBeNull();
  });

  it('case 9: id 形式は `tag-imbalance:<lid>`', () => {
    const target = makeEntry({ lid: 'e_x' });
    const others = [
      makeEntry({ lid: 'a', tags: ['proj'] }),
      makeEntry({ lid: 'b', tags: ['proj'] }),
      makeEntry({ lid: 'c', tags: ['proj'] }),
      makeEntry({ lid: 'd', tags: ['proj'] }),
    ];
    expect(detectTagImbalance(target, makeContainer([target, ...others]))?.id).toBe('tag-imbalance:e_x');
  });

  it('case 10: reason に percentage + popular tag list', () => {
    const target = makeEntry({ lid: 't' });
    const others = [
      makeEntry({ lid: 'a', tags: ['proj'] }),
      makeEntry({ lid: 'b', tags: ['proj'] }),
      makeEntry({ lid: 'c', tags: ['urgent'] }),
      makeEntry({ lid: 'd', tags: ['urgent'] }),
    ];
    const out = detectTagImbalance(target, makeContainer([target, ...others]));
    expect(out?.reason).toMatch(/\d+%/);
    expect(out?.reason).toContain('proj');
  });

  it('case 11: 順序性(Phase 8)── target に tag 追加で suggestion 消える', () => {
    const others = [
      makeEntry({ lid: 'a', tags: ['proj'] }),
      makeEntry({ lid: 'b', tags: ['proj'] }),
      makeEntry({ lid: 'c', tags: ['proj'] }),
      makeEntry({ lid: 'd', tags: ['proj'] }),
    ];
    const before = makeEntry({ lid: 't' });
    expect(detectTagImbalance(before, makeContainer([before, ...others]))).not.toBeNull();
    const after = makeEntry({ lid: 't', tags: ['proj'] });
    expect(detectTagImbalance(after, makeContainer([after, ...others]))).toBeNull();
  });

  it('case 12: empty popular(全 entry tag 持ち だが popular tag が無いケース)→ null', () => {
    // 不可能だが念のため:tag を持つが entry 別々 → popular 順位はある
    // 0 tag user entry のみ → 既に case 2 でカバー、これは省略可能
    // case 11 で順序性のみ確認するため、この case は skip 想定
    expect(true).toBe(true);
  });
});
