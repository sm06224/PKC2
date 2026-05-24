import { describe, expect, it } from 'vitest';
import { detectBrokenLinkSummary } from '../../../src/features/ai/broken-link-summary';
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

describe('detectBrokenLinkSummary', () => {
  it('case 1: broken link 0 件 → null', () => {
    const e = makeEntry({ lid: 'e1', body: 'plain text, no link' });
    expect(detectBrokenLinkSummary(e, makeContainer([e]))).toBeNull();
  });

  it('case 2: 解決可能な link のみ → null', () => {
    const e = makeEntry({ lid: 'e1', body: '[ok](entry:e2)' });
    const e2 = makeEntry({ lid: 'e2' });
    expect(detectBrokenLinkSummary(e, makeContainer([e, e2]))).toBeNull();
  });

  it('case 3: broken link 1 件 → summary、count=1, brokenLids=[lid]', () => {
    const e = makeEntry({ lid: 'e1', body: '[gone](entry:e_deleted)' });
    const out = detectBrokenLinkSummary(e, makeContainer([e]));
    expect(out).not.toBeNull();
    expect(out?.count).toBe(1);
    expect(out?.brokenLids).toEqual(['e_deleted']);
    expect(out?.reason).toContain('1 件');
    expect(out?.reason).toContain('e_deleted');
  });

  it('case 4: broken link 複数(異なる target) → dedup なしの count + sorted', () => {
    const e = makeEntry({
      lid: 'e1',
      body: '[a](entry:zzz) and [b](entry:aaa)',
    });
    const out = detectBrokenLinkSummary(e, makeContainer([e]));
    expect(out?.count).toBe(2);
    expect(out?.brokenLids).toEqual(['aaa', 'zzz']); // sorted
    expect(out?.reason).toContain('2 件');
  });

  it('case 5: 同一 target を複数回参照 → brokenLids は dedup 済', () => {
    const e = makeEntry({
      lid: 'e1',
      body: '[1](entry:gone) [2](entry:gone) [3](entry:gone)',
    });
    const out = detectBrokenLinkSummary(e, makeContainer([e]));
    // link-index は1 entry あたり 1 outgoing ref per target に集約するので
    // count = 1, brokenLids = ['gone']
    expect(out?.brokenLids).toEqual(['gone']);
  });

  it('case 6: broken + 解決可能 mix → broken のみ集計', () => {
    const e = makeEntry({
      lid: 'e1',
      body: '[ok](entry:e2) [bad](entry:e3)',
    });
    const e2 = makeEntry({ lid: 'e2' });
    const out = detectBrokenLinkSummary(e, makeContainer([e, e2]));
    expect(out?.count).toBe(1);
    expect(out?.brokenLids).toEqual(['e3']);
  });

  it('case 7: 他 entry の broken は影響しない', () => {
    const e = makeEntry({ lid: 'e1', body: 'no link here' });
    const e2 = makeEntry({ lid: 'e2', body: '[bad](entry:gone)' });
    expect(detectBrokenLinkSummary(e, makeContainer([e, e2]))).toBeNull();
  });

  it('case 8: system entry は判定対象外', () => {
    const e = makeEntry({
      lid: '__about__',
      archetype: 'system-about',
      body: '[gone](entry:nope)',
    });
    expect(detectBrokenLinkSummary(e, makeContainer([e]))).toBeNull();
  });

  it('case 9: id 形式は `broken-links:<lid>`', () => {
    const e = makeEntry({ lid: 'e_xyz', body: '[x](entry:gone)' });
    expect(detectBrokenLinkSummary(e, makeContainer([e]))?.id).toBe('broken-links:e_xyz');
  });

  it('case 10: reason は単数形 vs 複数形で文言切替', () => {
    const e1 = makeEntry({ lid: 'e1', body: '[a](entry:x)' });
    const e2 = makeEntry({
      lid: 'e2',
      body: '[a](entry:x) [b](entry:y)',
    });
    const s1 = detectBrokenLinkSummary(e1, makeContainer([e1, e2]))!;
    const s2 = detectBrokenLinkSummary(e2, makeContainer([e1, e2]))!;
    expect(s1.reason).toMatch(/参照 1 件/);
    expect(s2.reason).toMatch(/参照 2 件/);
  });

  it('case 11: 順序性(Phase 8)── target 追加で broken summary が消える', () => {
    const e = makeEntry({ lid: 'e1', body: '[a](entry:e2)' });
    expect(detectBrokenLinkSummary(e, makeContainer([e]))).not.toBeNull();
    const e2 = makeEntry({ lid: 'e2' });
    expect(detectBrokenLinkSummary(e, makeContainer([e, e2]))).toBeNull();
  });

  it('case 12: bare `entry:lid` 形式も検出', () => {
    const e = makeEntry({ lid: 'e1', body: 'see entry:gone for details' });
    expect(detectBrokenLinkSummary(e, makeContainer([e]))?.count).toBe(1);
  });
});
