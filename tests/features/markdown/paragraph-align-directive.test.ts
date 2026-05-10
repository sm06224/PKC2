/**
 * reform-2026-05 Phase 2 PR-2E:`:::paragraph{align=physical}` block directive。
 *
 * 仕様(01-notation-catalog.md §1.4):
 *   `:::paragraph{align=left|right|center|top|bottom}\ncontent\n:::`
 *   物理 align を強制(formal-only、user は L-5 行頭 prefix で十分)。
 *
 * L-5 simple は logical(`||` center / `|>` end)、PR-2E formal は physical。
 * AI / serializer が emit 用、export(Word 等)で物理 align を保存する場合に消費。
 */
import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '@features/markdown/markdown-render';

describe(':::paragraph{align=physical} block directive(reform Phase 2 PR-2E)', () => {
  it('align=left → <p data-pkc-align="left">', () => {
    const html = renderMarkdown(':::paragraph{align=left}\n左寄せ強制\n:::');
    expect(html).toMatch(/<p[^>]*data-pkc-align="left"[^>]*>左寄せ強制<\/p>/);
  });

  it('align=right → physical right', () => {
    const html = renderMarkdown(':::paragraph{align=right}\n右寄せ\n:::');
    expect(html).toMatch(/<p[^>]*data-pkc-align="right"[^>]*>右寄せ<\/p>/);
  });

  it('align=center → physical center', () => {
    const html = renderMarkdown(':::paragraph{align=center}\n中央\n:::');
    expect(html).toMatch(/<p[^>]*data-pkc-align="center"[^>]*>中央<\/p>/);
  });

  it('align=top → vertical writing-mode 用', () => {
    const html = renderMarkdown(':::paragraph{align=top}\n上寄せ\n:::');
    expect(html).toMatch(/<p[^>]*data-pkc-align="top"[^>]*>上寄せ<\/p>/);
  });

  it('align=bottom → vertical writing-mode 用', () => {
    const html = renderMarkdown(':::paragraph{align=bottom}\n下寄せ\n:::');
    expect(html).toMatch(/<p[^>]*data-pkc-align="bottom"[^>]*>下寄せ<\/p>/);
  });

  it('align=invalid(letterspacing 等)→ 適用なし、content だけ残る', () => {
    const html = renderMarkdown(':::paragraph{align=letterspacing}\n本文\n:::');
    expect(html).toContain('本文');
    expect(html).not.toContain('data-pkc-align="letterspacing"');
  });

  it('align 省略 → 適用なし、content だけ残る', () => {
    const html = renderMarkdown(':::paragraph\n本文\n:::');
    expect(html).toContain('本文');
    expect(html).not.toContain('data-pkc-align');
  });

  it('複数行 content も同 align(各行に register)', () => {
    const html = renderMarkdown(':::paragraph{align=left}\n1 行目\n2 行目\n:::');
    // 1 行目 paragraph に data-pkc-align="left" が付く(breaks: true で <br> で連結)
    expect(html).toMatch(/<p[^>]*data-pkc-align="left"/);
    expect(html).toContain('1 行目');
    expect(html).toContain('2 行目');
  });

  it('閉じ ::: 無し → EOF まで content として処理(parser tolerance)', () => {
    const html = renderMarkdown(':::paragraph{align=left}\n本文\n本文 2');
    expect(html).toContain('本文');
  });

  it('複数 :::paragraph{align=…} block 並列', () => {
    const src = ':::paragraph{align=left}\n左\n:::\n\n:::paragraph{align=right}\n右\n:::';
    const html = renderMarkdown(src);
    expect(html).toMatch(/<p[^>]*data-pkc-align="left"[^>]*>左<\/p>/);
    expect(html).toMatch(/<p[^>]*data-pkc-align="right"[^>]*>右<\/p>/);
  });

  it('fenced code block 内 :::paragraph はマーカー扱いしない', () => {
    const src = '```\n:::paragraph{align=left}\nthis is code\n:::\n```';
    const html = renderMarkdown(src);
    expect(html).not.toContain('data-pkc-align');
    expect(html).toContain('<code');
  });

  it('L-5 行頭 prefix(logical)と並列に共存(orthogonal)', () => {
    const src = ':::paragraph{align=left}\n物理左\n:::\n\n|> 行頭 logical end';
    const html = renderMarkdown(src);
    // 物理 left
    expect(html).toMatch(/<p[^>]*data-pkc-align="left"[^>]*>物理左<\/p>/);
    // logical end
    expect(html).toMatch(/<p[^>]*data-pkc-align="end"[^>]*>行頭 logical end<\/p>/);
  });

  it('attrs 不正(brace 不整合)→ literal 残置', () => {
    const html = renderMarkdown(':::paragraph{align=\n本文');
    // `{align=` 不正、:::paragraph として認識されず literal
    // 本文行は markdown-it に直接流れる
    expect(html).toContain('本文');
  });
});
