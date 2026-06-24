/**
 * 本文の h1–h3 節分割(章フォーカス編集=差し挟みの土台)。
 * 範囲算出 / 取り出し / 差し替えの pure ロジックを検証する。
 */
import { describe, it, expect } from 'vitest';
import {
  extractBodySections,
  getSectionText,
  replaceSectionText,
} from '@features/markdown/body-sections';

describe('extractBodySections', () => {
  it('h1/h2/h3 を文書順に節分割、範囲は次の同レベル以上の見出しまで', () => {
    const body = [
      'preamble', // 0
      '# A', // 1
      'a body', // 2
      '## A1', // 3
      'a1 body', // 4
      '## A2', // 5
      'a2 body', // 6
      '# B', // 7
      'b body', // 8
    ].join('\n');
    const s = extractBodySections(body);
    expect(s.map((x) => [x.level, x.text, x.startLine, x.endLine])).toEqual([
      [1, 'A', 1, 7],
      [2, 'A1', 3, 5],
      [2, 'A2', 5, 7],
      [1, 'B', 7, 9],
    ]);
  });

  it('fenced code block 内の # は見出しにしない', () => {
    const body = ['# Real', '```', '# fake', '```', 'text'].join('\n');
    const s = extractBodySections(body);
    expect(s).toHaveLength(1);
    expect(s[0]!.text).toBe('Real');
    expect(s[0]!.endLine).toBe(5);
  });

  it('先頭 frontmatter 内の # は無視', () => {
    const body = ['---', '# yaml-ish comment', 'title: x', '---', '# Real'].join('\n');
    const s = extractBodySections(body);
    expect(s).toHaveLength(1);
    expect(s[0]!.text).toBe('Real');
    expect(s[0]!.startLine).toBe(4);
  });

  it('h4+ は節の起点にしない(所属節の content)', () => {
    const body = ['## S', 'x', '#### deep', 'y'].join('\n');
    const s = extractBodySections(body);
    expect(s).toHaveLength(1);
    expect(s[0]!.endLine).toBe(4);
  });

  it('見出し無し / 空は空配列', () => {
    expect(extractBodySections('just text\n\nmore')).toEqual([]);
    expect(extractBodySections('')).toEqual([]);
  });

  it('slug は衝突時 -1 suffix(renderer 準拠)', () => {
    const s = extractBodySections('# Dup\n## Dup');
    expect(s[0]!.slug).toBe('dup');
    expect(s[1]!.slug).toBe('dup-1');
  });
});

describe('getSectionText / replaceSectionText', () => {
  const body = ['# A', 'a1', 'a2', '# B', 'b1'].join('\n');

  it('getSectionText は見出し行から範囲末尾まで', () => {
    const s = extractBodySections(body);
    expect(getSectionText(body, s[0]!)).toBe('# A\na1\na2');
    expect(getSectionText(body, s[1]!)).toBe('# B\nb1');
  });

  it('replaceSectionText は該当節のみ差し替え(他は不変)', () => {
    const s = extractBodySections(body);
    const out = replaceSectionText(body, s[0]!, '# A\na1\na2\nINSERTED');
    expect(out).toBe(['# A', 'a1', 'a2', 'INSERTED', '# B', 'b1'].join('\n'));
  });

  it('round-trip:getSectionText を replaceSectionText で戻すと不変', () => {
    const s = extractBodySections(body);
    for (const sec of s) {
      expect(replaceSectionText(body, sec, getSectionText(body, sec))).toBe(body);
    }
  });

  it('節の差し替えは複数行・空行を含めて反映', () => {
    const s = extractBodySections(body);
    const out = replaceSectionText(body, s[1]!, '# B (renamed)\n\nnew para\n');
    expect(out).toBe(['# A', 'a1', 'a2', '# B (renamed)', '', 'new para', ''].join('\n'));
  });
});
