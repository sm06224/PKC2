/**
 * reform-2026-05 PR-D:`:::quote{author=...}` block citation directive の
 * integration test。
 *
 * 仕様(`docs/development/notation-redesign-2026-05/03-link-embed-card.md` §3.5.2):
 *   - `:::quote{author="Smith" year=2020}` で複数 embed を 1 引用 block に纏める
 *   - 共通 attribution(author / year / source 等)を block 全体に attach
 *   - 出力は `<blockquote class="pkc-quote-citation" data-pkc-quote-*="...">`
 *   - inner content は通常の markdown render(`<p>...</p>` 等で wrap)
 */

import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '@features/markdown/markdown-render';

describe(':::quote block citation directive', () => {
  it('単純な :::quote{author=...} を <blockquote class="pkc-quote-citation"> に展開', () => {
    const src = `:::quote{author="Smith" year=2020}
本文の引用テキスト。
:::`;
    const html = renderMarkdown(src);
    expect(html).toMatch(/<blockquote[^>]*class="pkc-quote-citation"/);
    expect(html).toContain('data-pkc-quote-author="Smith"');
    expect(html).toContain('data-pkc-quote-year="2020"');
    expect(html).toContain('本文の引用テキスト');
    expect(html).toContain('</blockquote>');
  });

  it('attrs なし :::quote だけでも動作', () => {
    const src = `:::quote
シンプルな引用。
:::`;
    const html = renderMarkdown(src);
    expect(html).toContain('<blockquote class="pkc-quote-citation"');
    expect(html).toContain('シンプルな引用');
  });

  it('複数行 content を保持(段落として render)', () => {
    const src = `:::quote{author="Tanaka"}
段落 1。

段落 2。
:::`;
    const html = renderMarkdown(src);
    expect(html).toContain('<blockquote');
    expect(html).toContain('段落 1');
    expect(html).toContain('段落 2');
    // 内部は markdown 通り <p> で wrap される
    expect(html).toMatch(/<p[^>]*>段落 1/);
    expect(html).toMatch(/<p[^>]*>段落 2/);
  });

  it('quoted attribute(spaces 含む)を data-* に展開', () => {
    const src = `:::quote{author="John Smith" source="pkc://container-X/origin"}
引用本文。
:::`;
    const html = renderMarkdown(src);
    expect(html).toContain('data-pkc-quote-author="John Smith"');
    expect(html).toContain('data-pkc-quote-source="pkc://container-X/origin"');
  });

  it('boolean flag(`important`)を data-pkc-quote-important="true" に展開', () => {
    const src = `:::quote{important author=Smith}
重要な引用。
:::`;
    const html = renderMarkdown(src);
    expect(html).toContain('data-pkc-quote-important="true"');
    expect(html).toContain('data-pkc-quote-author="Smith"');
  });

  it('id (`#cite-1`)を id 属性に展開', () => {
    const src = `:::quote{#cite-1 author=Smith}
引用本文。
:::`;
    const html = renderMarkdown(src);
    expect(html).toMatch(/<blockquote id="cite-1"/);
  });

  it('class (`.important`)を class 属性に追加(pkc-quote-citation と並列)', () => {
    const src = `:::quote{.important author=Smith}
本文。
:::`;
    const html = renderMarkdown(src);
    expect(html).toMatch(/class="pkc-quote-citation important"/);
  });

  it('複数 :::quote が独立 block として render される', () => {
    const src = `:::quote{author=A}
引用 A
:::

:::quote{author=B}
引用 B
:::`;
    const html = renderMarkdown(src);
    const blockquotes = html.match(/<blockquote[^>]*pkc-quote-citation/g) ?? [];
    expect(blockquotes.length).toBe(2);
    expect(html).toContain('data-pkc-quote-author="A"');
    expect(html).toContain('data-pkc-quote-author="B"');
    expect(html).toContain('引用 A');
    expect(html).toContain('引用 B');
  });

  it('XSS escape:author 値の `"` `<` `>` `&` は escape される', () => {
    const src = `:::quote{author="<script>alert(1)</script>"}
本文。
:::`;
    const html = renderMarkdown(src);
    // `<` は &lt; に escape されるべき
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
  });

  it('閉じ ::: が無い場合は EOF まで content として処理(parser tolerance)', () => {
    const src = `:::quote{author=Smith}
未閉じ引用本文`;
    const html = renderMarkdown(src);
    expect(html).toContain('<blockquote');
    expect(html).toContain('未閉じ引用本文');
  });

  it('fenced code block 内 `:::quote` はマーカー扱いしない', () => {
    const src = `\`\`\`
:::quote{author=Fake}
これは code 内
:::
\`\`\``;
    const html = renderMarkdown(src);
    // <blockquote> tag は出ない、code block のみ
    expect(html).not.toContain('<blockquote');
    expect(html).toContain('<code');
  });

  it('inner に `==highlight==` 等の inline markup が動作', () => {
    const src = `:::quote{author=Smith}
これは ==重要== な引用。
:::`;
    const html = renderMarkdown(src);
    expect(html).toContain('<mark>重要</mark>');
  });
});
