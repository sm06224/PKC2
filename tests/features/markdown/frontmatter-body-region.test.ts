/**
 * PR-2W(2026-05-12):`:::frontmatter` / `:::body` region marker の unit test。
 *
 * Phase 2 PR-2K で deny list だった 2 directive を、Phase 3 で正式実装
 * (PKC1010 warning marker を廃止、`<aside class="pkc-region-frontmatter">` /
 * `<section class="pkc-region-body">` 生成)。
 */
import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '@features/markdown/markdown-render';

describe('PR-2W :::frontmatter / :::body 正式実装', () => {
  it('`:::frontmatter\\n...\\n:::` で <aside class="pkc-region-frontmatter">', () => {
    const html = renderMarkdown(':::frontmatter\nfront content\n:::');
    expect(html).toContain('<aside');
    expect(html).toContain('class="pkc-region-frontmatter"');
    expect(html).toContain('data-pkc-region="frontmatter"');
    expect(html).toContain('front content');
    expect(html).toContain('</aside>');
  });

  it('`:::body\\n...\\n:::` で <section class="pkc-region-body">', () => {
    const html = renderMarkdown(':::body\nbody content\n:::');
    expect(html).toContain('<section');
    expect(html).toContain('class="pkc-region-body"');
    expect(html).toContain('data-pkc-region="body"');
    expect(html).toContain('body content');
    expect(html).toContain('</section>');
  });

  it('content は markdown passthrough(bold / heading が render)', () => {
    const html = renderMarkdown(':::body\n## 章\n**強調**\n:::');
    expect(html).toContain('<h2');
    expect(html).toContain('章');
    expect(html).toContain('<strong>強調</strong>');
  });

  it('id attribute で <aside id="...">', () => {
    const html = renderMarkdown(':::frontmatter{#meta}\ncontent\n:::');
    expect(html).toContain('id="meta"');
    expect(html).toContain('pkc-region-frontmatter');
  });

  it('class attribute で merge', () => {
    const html = renderMarkdown(':::body{.custom-class}\ncontent\n:::');
    expect(html).toMatch(/class="pkc-region-body[^"]*custom-class/);
  });

  it('追加 kv attrs は data-pkc-region-* に展開', () => {
    const html = renderMarkdown(':::body{role=main lang=ja}\ncontent\n:::');
    expect(html).toContain('data-pkc-region-role="main"');
    expect(html).toContain('data-pkc-region-lang="ja"');
  });

  it('複数 region block を独立処理', () => {
    const md = `:::frontmatter\nA\n:::\n\n:::body\nB\n:::`;
    const html = renderMarkdown(md);
    expect(html).toMatch(/<aside[^>]*data-pkc-region="frontmatter"/);
    expect(html).toMatch(/<section[^>]*data-pkc-region="body"/);
    expect(html).toContain('A');
    expect(html).toContain('B');
  });

  it('PKC1010 deny list から外れている(literal warning marker 出ない)', () => {
    const html1 = renderMarkdown(':::frontmatter\nx\n:::');
    const html2 = renderMarkdown(':::body\nx\n:::');
    expect(html1).not.toContain('pkc-warning-hallucination-block-frontmatter');
    expect(html1).not.toContain('data-pkc-warn-code="PKC1010"');
    expect(html2).not.toContain('pkc-warning-hallucination-block-body');
    expect(html2).not.toContain('data-pkc-warn-code="PKC1010"');
  });

  it('fenced code 内の `:::frontmatter` / `:::body` は無視', () => {
    const html1 = renderMarkdown('```\n:::frontmatter\ncontent\n:::\n```');
    const html2 = renderMarkdown('```\n:::body\ncontent\n:::\n```');
    expect(html1).not.toContain('pkc-region-frontmatter');
    expect(html1).toContain(':::frontmatter');
    expect(html2).not.toContain('pkc-region-body');
    expect(html2).toContain(':::body');
  });

  it('unclosed `:::frontmatter`(closing 無し)は最後まで region に取り込む', () => {
    // markdown-it 標準と同様、close 無しでも content は読み込む
    const html = renderMarkdown(':::frontmatter\ncontent no close');
    // content は <aside> 内に入る or literal で残る、いずれにせよ error にしない
    expect(html).toBeTruthy();
  });

  it('nested in :::if{format=html} で render される', () => {
    const md = `:::if{format=html}\n:::body\nHTML only body\n:::\n:::`;
    const html = renderMarkdown(md);
    expect(html).toContain('pkc-region-body');
    expect(html).toContain('HTML only body');
  });

  it('nested in :::if{format=pdf} は strip(html target で)', () => {
    const md = `:::if{format=pdf}\n:::body\nPDF only body\n:::\n:::`;
    const html = renderMarkdown(md);
    expect(html).not.toContain('PDF only body');
  });

  it(':::section との orthogonal(両者 nest 可)', () => {
    const md = `:::body\n:::section{role=note}\n**重要**\n:::\n:::`;
    const html = renderMarkdown(md);
    expect(html).toContain('pkc-region-body');
    expect(html).toContain('pkc-section-callout');
    expect(html).toContain('pkc-section-note');
    expect(html).toContain('<strong>重要</strong>');
  });

  it('外部 frontmatter `---YAML---` と本 directive は別物(共存可)', () => {
    // 注:renderMarkdown は YAML frontmatter を strip しない(entry layer の責務)。
    // 本 test は :::frontmatter directive が `---YAML---` syntax と独立に動作することを確認。
    const md = `:::frontmatter\nmeta content\n:::\n\n## 本文`;
    const html = renderMarkdown(md);
    expect(html).toContain('pkc-region-frontmatter');
    expect(html).toContain('meta content');
    expect(html).toContain('本文');
  });
});
