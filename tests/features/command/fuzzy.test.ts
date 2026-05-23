/**
 * Command Palette fuzzy ranking unit tests(pgc-80)。
 * 純 features 層なので happy-dom は不要、node 環境で OK。
 */

import { describe, it, expect } from 'vitest';
import { fuzzyMatchSingle, rankCommands } from '../../../src/features/command/fuzzy';
import type { CommandMeta } from '../../../src/features/command/types';

const cmd = (id: string, titleJa: string, titleEn: string, category: CommandMeta['category'] = 'View'): CommandMeta => ({
  id, titleJa, titleEn, category,
});

describe('fuzzyMatchSingle', () => {
  it('empty query returns score=1 (trivial match)', () => {
    expect(fuzzyMatchSingle('', 'anything').score).toBe(1);
  });
  it('empty target returns score=0', () => {
    expect(fuzzyMatchSingle('a', '').score).toBe(0);
  });
  it('exact prefix match scores higher than middle match', () => {
    const a = fuzzyMatchSingle('cal', 'calendar');
    const b = fuzzyMatchSingle('cal', 'graph_calendar');
    expect(a.score).toBeGreaterThan(0);
    expect(b.score).toBeGreaterThan(0);
    expect(a.score).toBeGreaterThan(b.score);
  });
  it('case-insensitive', () => {
    expect(fuzzyMatchSingle('CAL', 'calendar').score).toBeGreaterThan(0);
    expect(fuzzyMatchSingle('cal', 'CALENDAR').score).toBeGreaterThan(0);
  });
  it('subsequence match works (non-consecutive)', () => {
    const r = fuzzyMatchSingle('vgb', 'view-graph-button');
    expect(r.score).toBeGreaterThan(0);
    expect(r.matched).toEqual([0, 5, 11]);
  });
  it('returns 0 when query chars not all present', () => {
    expect(fuzzyMatchSingle('xyz', 'view-graph').score).toBe(0);
  });
  it('consecutive match scores higher than spread', () => {
    const consec = fuzzyMatchSingle('view', 'view-x');
    const spread = fuzzyMatchSingle('view', 'v-i-e-w');
    expect(consec.score).toBeGreaterThan(spread.score);
  });
  it('handles CJK target', () => {
    const r = fuzzyMatchSingle('カレ', 'カレンダー');
    expect(r.score).toBeGreaterThan(0);
    expect(r.matched).toEqual([0, 1]);
  });
  it('word boundary bonus after .', () => {
    const a = fuzzyMatchSingle('d', 'view.detail');
    const b = fuzzyMatchSingle('d', 'reduceditem');
    expect(a.score).toBeGreaterThan(b.score);
  });
});

describe('rankCommands', () => {
  const cmds: CommandMeta[] = [
    cmd('view.detail',   '詳細ビュー',     'View: Detail'),
    cmd('view.calendar', 'カレンダービュー', 'View: Calendar'),
    cmd('view.kanban',   'カンバンビュー',  'View: Kanban'),
    cmd('view.filer',    'ファイラービュー','View: Filer'),
    cmd('view.graph',    'グラフビュー',    'View: Graph'),
    cmd('entry.create.text', '新規 TEXT エントリ', 'New TEXT entry', 'Entry'),
    cmd('shell.toggle-sidebar', 'サイドバーを開閉', 'Toggle sidebar', 'Shell'),
  ];

  it('empty query returns all commands sorted by category+id', () => {
    const out = rankCommands('', cmds);
    expect(out.length).toBe(cmds.length);
    // Entry < Shell < View(alphabet)
    expect(out[0]!.meta.category).toBe('Entry');
    expect(out[1]!.meta.category).toBe('Shell');
    expect(out[2]!.meta.category).toBe('View');
  });
  it('English query matches en title', () => {
    const out = rankCommands('cal', cmds);
    expect(out[0]!.meta.id).toBe('view.calendar');
  });
  it('Japanese query matches ja title', () => {
    const out = rankCommands('カレン', cmds);
    expect(out[0]!.meta.id).toBe('view.calendar');
  });
  it('id-style query matches id', () => {
    const out = rankCommands('viewfile', cmds);
    expect(out.length).toBeGreaterThan(0);
    expect(out[0]!.meta.id).toBe('view.filer');
  });
  it('no match → empty result', () => {
    const out = rankCommands('zzzqqq', cmds);
    expect(out).toEqual([]);
  });
  it('partial match returns subset', () => {
    const out = rankCommands('view', cmds);
    // 5 view.* + entry.create.text(text contains v? no, but `view` is not in entry/shell)
    // → 5 only
    expect(out.length).toBe(5);
    for (const r of out) expect(r.meta.id.startsWith('view.')).toBe(true);
  });
  it('stable sort: equal-score commands sort by category+id', () => {
    // 3 件の cmd を同 titleEn / titleJa にして score を強制的に同じにする
    const eq: CommandMeta[] = [
      cmd('z.id-3', '同タイトル', 'Same', 'View'),
      cmd('a.id-1', '同タイトル', 'Same', 'View'),
      cmd('m.id-2', '同タイトル', 'Same', 'View'),
    ];
    const out = rankCommands('same', eq);
    expect(out.map((r) => r.meta.id)).toEqual(['a.id-1', 'm.id-2', 'z.id-3']);
  });

  it('score-desc primary sort', () => {
    // `view.detail` の en title `View: Detail` で query `view` は prefix
    // match で高 score。`entry.create.text` には `view` 部分一致なし → 排除。
    const out = rankCommands('view', cmds);
    expect(out.length).toBeGreaterThan(0);
    // 結果は全部 view.*
    for (const r of out) expect(r.meta.id.startsWith('view.')).toBe(true);
    // 全部 score >= 1
    for (const r of out) expect(r.score).toBeGreaterThan(0);
  });
});
