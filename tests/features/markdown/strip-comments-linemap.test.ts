/**
 * PR-2X(2026-05-12):`%%%` / `:::comment` block comment の LineMap thread。
 *
 * 既存の `stripComments` は削除した行数分の lineMap を吸収せず、Split View
 * source-preview-sync が `data-pkc-source-line` で逆引きすると原文 line index
 * がズレる known limitation だった(`CLAUDE.md` Phase 10 §10「preprocessor
 * pipeline で LineMap thread」)。本 PR で stripComments を line-aware
 * state machine に rewrite、output line → 原文 line index map を保持。
 *
 * 本 test では `data-pkc-source-line` 属性で逆引き、強い source-line を
 * assert する。レンダリング後の HTML から data-pkc-source-line を取得して
 * 原文行と一致することを確認。
 */
import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '@features/markdown/markdown-render';

function extractSourceLines(html: string): Array<{ tag: string; line: number; text: string }> {
  const results: Array<{ tag: string; line: number; text: string }> = [];
  // <p ...data-pkc-source-line="N"...>text</p> 等を tag 別に拾う(ネスト無視、p のみで十分)
  const reP = /<p\b[^>]*data-pkc-source-line="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;
  let m: RegExpExecArray | null;
  while ((m = reP.exec(html)) !== null) {
    results.push({
      tag: 'p',
      line: parseInt(m[1]!, 10),
      text: m[2]!.replace(/<[^>]+>/g, '').trim(),
    });
  }
  return results;
}

describe('PR-2X stripComments LineMap thread', () => {
  it('inline `%% ... %%` のみは lineMap 不変', () => {
    // blank line を入れて 2 段落に分離
    const md = 'A line %% hidden %% B\n\n後の段落';
    const html = renderMarkdown(md, { sourceLineAnchors: true });
    const sources = extractSourceLines(html);
    const p1 = sources.find((s) => s.text.includes('A line'));
    const p2 = sources.find((s) => s.text.includes('後の段落'));
    expect(p1?.line).toBe(0);
    expect(p2?.line).toBe(2);
    // hidden comment は消える
    expect(html).not.toContain('hidden');
  });

  it('multi-line `%%%...%%%` block comment 削除後も後続段落の line index は原文 line', () => {
    const md = [
      '段落A',           // line 0
      '',                 // line 1
      '%%%',             // line 2
      'block comment',   // line 3
      '%%%',             // line 4
      '',                 // line 5
      '段落B',           // line 6
    ].join('\n');
    const html = renderMarkdown(md, { sourceLineAnchors: true });
    const sources = extractSourceLines(html);
    const pA = sources.find((s) => s.text.includes('段落A'));
    const pB = sources.find((s) => s.text.includes('段落B'));
    expect(pA?.line).toBe(0);
    expect(pB?.line).toBe(6); // 原文 line 6 を維持(LineMap thread の決定的検証点)
    expect(html).not.toContain('block comment');
  });

  it('複数 block comment が散在しても後続 line index 維持', () => {
    const md = [
      'A',               // 0
      '%%%',             // 1
      'c1',              // 2
      '%%%',             // 3
      'B',               // 4
      '%%%',             // 5
      'c2',              // 6
      '%%%',             // 7
      'C',               // 8
    ].join('\n');
    const html = renderMarkdown(md, { sourceLineAnchors: true });
    const sources = extractSourceLines(html);
    expect(sources.find((s) => s.text === 'A')?.line).toBe(0);
    expect(sources.find((s) => s.text === 'B')?.line).toBe(4);
    expect(sources.find((s) => s.text === 'C')?.line).toBe(8);
    expect(html).not.toContain('c1');
    expect(html).not.toContain('c2');
  });

  it('`:::comment{...}` block も lineMap thread 対応', () => {
    const md = [
      'A',                       // 0
      '',                         // 1(blank で paragraph 分離)
      ':::comment{hidden=true}', // 2
      'this is a hidden note',   // 3
      ':::',                     // 4
      '',                         // 5
      'B',                       // 6
    ].join('\n');
    const html = renderMarkdown(md, { sourceLineAnchors: true });
    const sources = extractSourceLines(html);
    expect(sources.find((s) => s.text === 'A')?.line).toBe(0);
    expect(sources.find((s) => s.text === 'B')?.line).toBe(6);
    expect(html).not.toContain('hidden note');
  });

  it('fenced code 内の `%%%` / `:::comment` は無視(literal 残し)', () => {
    const md = [
      '```',           // 0
      '%%%',           // 1
      'literal',       // 2
      '%%%',           // 3
      '```',           // 4
      '',              // 5
      'after',         // 6
    ].join('\n');
    const html = renderMarkdown(md, { sourceLineAnchors: true });
    expect(html).toContain('literal');
    expect(html).toContain('%%%'); // code 内では literal
    const sources = extractSourceLines(html);
    const afterP = sources.find((s) => s.text.includes('after'));
    expect(afterP?.line).toBe(6);
  });

  it('部分行 `before %%% block %%% after` で同一行内開閉', () => {
    const md = '前 %%% inline block %%% 後';
    const html = renderMarkdown(md, { sourceLineAnchors: true });
    expect(html).not.toContain('inline block');
    expect(html).toContain('前');
    expect(html).toContain('後');
  });

  it('unclosed `%%%` は pendingPrefix を emit(error にしない)', () => {
    const md = [
      'A',
      '%%%',
      'unclosed',
    ].join('\n');
    const html = renderMarkdown(md, { sourceLineAnchors: true });
    // A は残る、unclosed は consume されて消える(content lost、tolerant)
    expect(html).toContain('A');
  });

  it('block comment と `:::comment` の混在', () => {
    const md = [
      'A',                     // 0
      '',                       // 1
      '%%%',                   // 2
      'c1',                    // 3
      '%%%',                   // 4
      '',                       // 5
      'middle',                // 6
      '',                       // 7
      ':::comment',            // 8
      'c2',                    // 9
      ':::',                   // 10
      '',                       // 11
      'B',                     // 12
    ].join('\n');
    const html = renderMarkdown(md, { sourceLineAnchors: true });
    const sources = extractSourceLines(html);
    expect(sources.find((s) => s.text === 'A')?.line).toBe(0);
    expect(sources.find((s) => s.text === 'middle')?.line).toBe(6);
    expect(sources.find((s) => s.text === 'B')?.line).toBe(12);
    expect(html).not.toContain('c1');
    expect(html).not.toContain('c2');
  });
});
