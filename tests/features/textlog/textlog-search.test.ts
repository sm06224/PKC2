import { describe, expect, it } from 'vitest';
import { searchTextlogEntries } from '../../../src/features/textlog/textlog-search';
import type { TextlogEntry } from '../../../src/features/textlog/textlog-body';

function makeEntry(id: string, text: string): TextlogEntry {
  return { id, text, createdAt: '2026-05-24T00:00:00Z', flags: [] };
}

const FIXTURE: TextlogEntry[] = [
  makeEntry('1', 'morning standup meeting'),
  makeEntry('2', 'fix bug in renderer'),
  makeEntry('3', 'review PR for AI tab'),
  makeEntry('4', 'lunch with team'),
  makeEntry('5', 'evening REVIEW of PR'),
];

describe('searchTextlogEntries', () => {
  it('case 1: 空 query → 全件 + isEmpty=true', () => {
    const out = searchTextlogEntries(FIXTURE, '');
    expect(out.matches.length).toBe(5);
    expect(out.totalHits).toBe(5);
    expect(out.isEmpty).toBe(true);
  });

  it('case 2: 空白のみ query → 全件', () => {
    const out = searchTextlogEntries(FIXTURE, '   ');
    expect(out.matches.length).toBe(5);
    expect(out.isEmpty).toBe(true);
  });

  it('case 3: 単一 token 部分一致', () => {
    const out = searchTextlogEntries(FIXTURE, 'bug');
    expect(out.matches.length).toBe(1);
    expect(out.matches[0]?.id).toBe('2');
    expect(out.isEmpty).toBe(false);
  });

  it('case 4: case-insensitive', () => {
    const out = searchTextlogEntries(FIXTURE, 'REVIEW');
    expect(out.matches.length).toBe(2);
    expect(out.matches.map((e) => e.id)).toEqual(['3', '5']);
  });

  it('case 5: 複数 token は AND 条件', () => {
    const out = searchTextlogEntries(FIXTURE, 'review PR');
    expect(out.matches.length).toBe(2);
  });

  it('case 6: token 順は問わない', () => {
    const a = searchTextlogEntries(FIXTURE, 'review pr');
    const b = searchTextlogEntries(FIXTURE, 'pr review');
    expect(a.matches.map((e) => e.id)).toEqual(b.matches.map((e) => e.id));
  });

  it('case 7: 全 token が同 entry に必要', () => {
    const out = searchTextlogEntries(FIXTURE, 'morning bug');
    expect(out.matches.length).toBe(0);
  });

  it('case 8: hit 0 件でも空配列を返す(safe)', () => {
    const out = searchTextlogEntries(FIXTURE, 'nonexistent');
    expect(out.matches).toEqual([]);
    expect(out.totalHits).toBe(0);
    expect(out.totalEntries).toBe(5);
  });

  it('case 9: 元の entries が空 → matches も空', () => {
    const out = searchTextlogEntries([], 'anything');
    expect(out.matches).toEqual([]);
    expect(out.totalEntries).toBe(0);
  });

  it('case 10: 全 entry hit でも matches は元順序を保持', () => {
    const out = searchTextlogEntries(FIXTURE, 'e');
    // 'meeting' / 'renderer' / 'review' / 'team' / 'evening review'
    expect(out.matches.length).toBe(5);
    expect(out.matches.map((e) => e.id)).toEqual(['1', '2', '3', '4', '5']);
  });

  it('case 11: totalEntries は filter 前の数を反映', () => {
    const out = searchTextlogEntries(FIXTURE, 'bug');
    expect(out.totalHits).toBe(1);
    expect(out.totalEntries).toBe(5);
  });

  it('case 12: 順序性(Phase 8)── 同じ query で deterministic', () => {
    const a = searchTextlogEntries(FIXTURE, 'pr');
    const b = searchTextlogEntries(FIXTURE, 'pr');
    expect(a.matches.map((e) => e.id)).toEqual(b.matches.map((e) => e.id));
  });

  it('case 13: 順序性(Phase 8)── entries 追加で hit が増える', () => {
    const before = searchTextlogEntries(FIXTURE, 'bug');
    const after = searchTextlogEntries([...FIXTURE, makeEntry('6', 'another bug found')], 'bug');
    expect(before.totalHits).toBe(1);
    expect(after.totalHits).toBe(2);
  });

  it('case 14: CJK token も部分一致', () => {
    const ja = [makeEntry('1', '会議に参加した'), makeEntry('2', '休憩中')];
    const out = searchTextlogEntries(ja, '会議');
    expect(out.matches.length).toBe(1);
    expect(out.matches[0]?.id).toBe('1');
  });

  it('case 15: 特殊文字を含む query は literal match', () => {
    const ents = [makeEntry('1', 'use [special] chars'), makeEntry('2', 'normal text')];
    const out = searchTextlogEntries(ents, '[special]');
    expect(out.matches.length).toBe(1);
    expect(out.matches[0]?.id).toBe('1');
  });
});
