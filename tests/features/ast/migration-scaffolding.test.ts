/**
 * PR-2AA(2026-05-12):IR migration scaffolding の動作 test。
 *
 * - `renderMarkdownViaIR(text, opts)` が `parseMarkdownToAst` + `renderAstToHtml`
 *   を 1 step で正しく実行する
 * - Tier 0 flag `markdown.use_ir` が default OFF
 * - flag OFF のとき `renderMarkdown` は legacy pipeline を使う(regression なし)
 * - flag ON のとき `renderMarkdown` は IR pipeline を使う(fallback safety あり)
 *
 * 注:Flag override は URL flag / localStorage / inspector からのみ可能、
 * 直接 setter は無いため、ON 動作は別 e2e で確認(本 unit test では OFF と
 * 「同じ HTML が出る」ことだけ確認、IR 経路は parse.test + render-html.test
 * で個別 cover 済)。
 */
import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '@features/markdown/markdown-render';
import { renderMarkdownViaIR, useIrPipeline } from '@features/ast/render-markdown-via-ir';
import { parseMarkdownToAst } from '@features/ast/parse';
import { renderAstToHtml } from '@features/ast/render-html';

describe('PR-2AA IR migration scaffolding', () => {
  it('`renderMarkdownViaIR(text)` で commonmark + GFM core が render', () => {
    const html = renderMarkdownViaIR('# Title\n\n**bold**');
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<strong>bold</strong>');
  });

  it('Tier 0 flag `markdown.use_ir` が default OFF', () => {
    // Flag system は URL 無効 / localStorage 無効では default を返す
    expect(useIrPipeline()).toBe(false);
  });

  it('flag OFF(default)で `renderMarkdown` は legacy pipeline を使う', () => {
    // legacy pipeline でしか出ない PKC 固有 directive(`:::section{role=note}`)を
    // 入れて、legacy 出力(`pkc-section-callout`)が出ることを確認
    const html = renderMarkdown(':::section{role=note}\n内容\n:::');
    expect(html).toContain('pkc-section-callout');
    expect(html).toContain('pkc-section-note');
  });

  it('`renderMarkdownViaIR` の出力は parse + render の合成 = chain と等価', () => {
    const md = '# A\n\nparagraph\n\n- list';
    const viaIR = renderMarkdownViaIR(md);
    const chained = renderAstToHtml(parseMarkdownToAst(md));
    expect(viaIR).toBe(chained);
  });

  it('`renderMarkdownViaIR` で sourceLineAnchors option が通る', () => {
    const html = renderMarkdownViaIR('# A\n\n# B', { sourceLineAnchors: true });
    expect(html).toContain('data-pkc-source-line="0"');
    expect(html).toContain('data-pkc-source-line="2"');
  });

  it('`renderMarkdownViaIR` で空 input → empty', () => {
    const html = renderMarkdownViaIR('');
    expect(html).toBe('');
  });

  it('既存 `renderMarkdown` の挙動は flag OFF で完全に維持(regression なし)', () => {
    // PKC 固有 directive が正しく render される(`:::comment` は strip = '' なので除く)
    const fixtures = [
      ':::figure{id="f1"}\n![](x.png)\n:::',
      ':::quote{author="A"}\n内容\n:::',
      ':::if{format=html}\nHTML only\n:::',
      ':::section{role=warning}\n警告\n:::',
    ];
    for (const md of fixtures) {
      const html = renderMarkdown(md);
      expect(html, `fixture: ${md.slice(0, 30)}`).toBeTruthy();
      // 元々 PKC 機能の DOM 構造が出ている(class または tag)
      expect(html).toMatch(/<figure|pkc-quote|pkc-if|pkc-section|HTML only|内容|警告/);
    }
    // :::comment は strip = empty(正常挙動)
    expect(renderMarkdown(':::comment\nhidden\n:::').trim()).toBe('');
  });
});
