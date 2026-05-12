/**
 * PR-2V(2026-05-12):`:::toc{depth=N}` 正式実装の unit test。
 *
 * Phase 2 PR-2K で deny list だった `:::toc` を、Phase 3 で正式実装(PKC1010
 * warning marker を廃止、`<nav class="pkc-toc-formal">` 生成)。
 */
import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '@features/markdown/markdown-render';

describe('PR-2V :::toc{depth=N} 正式実装', () => {
  it('`:::toc\\n:::` で empty TOC(heading 無し)', () => {
    const html = renderMarkdown(':::toc\n:::');
    expect(html).toContain('pkc-toc-formal');
    expect(html).toContain('data-pkc-region="toc-formal"');
    expect(html).toContain('data-pkc-toc-depth="3"'); // default
    // 内側 ul は空
    expect(html).toMatch(/<ul class="pkc-toc-list"><\/ul>/);
  });

  it('`:::toc\\n:::` + h1/h2/h3 で全 heading が link 化', () => {
    const md = `:::toc\n:::\n\n# 章 1\n\n## 節 1.1\n\n### 項 1.1.1\n\n# 章 2`;
    const html = renderMarkdown(md);
    expect(html).toContain('pkc-toc-formal');
    expect(html).toContain('章 1');
    expect(html).toContain('節 1.1');
    expect(html).toContain('項 1.1.1');
    expect(html).toContain('章 2');
    // 4 li
    const matches = html.match(/<li class="pkc-toc-item"/g);
    expect(matches?.length ?? 0).toBe(4);
  });

  it('`:::toc{depth=2}` で h1/h2 のみ(h3 は TOC 除外、body には render)', () => {
    const md = `:::toc{depth=2}\n:::\n\n# 章 1\n\n## 節 1.1\n\n### 項(除外)\n\n## 節 1.2`;
    const html = renderMarkdown(md);
    expect(html).toContain('data-pkc-toc-depth="2"');
    // TOC 内に章 1 / 節 1.1 / 節 1.2 はある(li 内)
    expect(html).toMatch(/<li[^>]*>.*章 1/);
    expect(html).toMatch(/<li[^>]*>.*節 1\.1/);
    expect(html).toMatch(/<li[^>]*>.*節 1\.2/);
    // h3 「項(除外)」は body には render されるが TOC li には居ない
    const tocSection = html.match(/<nav class="pkc-toc-formal[^>]*>([\s\S]*?)<\/nav>/);
    expect(tocSection).not.toBeNull();
    expect(tocSection![1]).not.toContain('項(除外)');
  });

  it('`:::toc{depth=1}` で h1 のみ(TOC 内)', () => {
    const md = `:::toc{depth=1}\n:::\n\n# A\n\n## B(TOC 除外)\n\n# C`;
    const html = renderMarkdown(md);
    // TOC 内に A / C のみ
    const tocSection = html.match(/<nav class="pkc-toc-formal[^>]*>([\s\S]*?)<\/nav>/);
    expect(tocSection).not.toBeNull();
    expect(tocSection![1]).toContain('A');
    expect(tocSection![1]).toContain('C');
    expect(tocSection![1]).not.toContain('B(TOC 除外)');
  });

  it('depth=quoted("3")も受理', () => {
    const html = renderMarkdown(':::toc{depth="3"}\n:::\n# X');
    expect(html).toContain('data-pkc-toc-depth="3"');
    expect(html).toContain('X');
  });

  it('depth 不正(0 / 7 / 文字列)→ default 3', () => {
    const html = renderMarkdown(':::toc{depth=99}\n:::\n# X');
    expect(html).toContain('data-pkc-toc-depth="3"');
  });

  it('複数の `:::toc` block も対応', () => {
    const md = `:::toc{depth=1}\n:::\n\n:::toc{depth=2}\n:::\n\n# A\n\n## B`;
    const html = renderMarkdown(md);
    // 2 つの nav が生成される
    const navMatches = html.match(/<nav class="pkc-toc-formal/g);
    expect(navMatches?.length ?? 0).toBe(2);
    expect(html).toContain('data-pkc-toc-depth="1"');
    expect(html).toContain('data-pkc-toc-depth="2"');
  });

  it('PKC1010 deny list から外れている(literal warning marker 出ない)', () => {
    const html = renderMarkdown(':::toc\n:::');
    expect(html).not.toContain('pkc-warning-hallucination-block-toc');
    expect(html).not.toContain('data-pkc-warn-code="PKC1010"');
  });

  it('fenced code 内の `:::toc` は無視', () => {
    const html = renderMarkdown('```\n:::toc\n:::\n```');
    expect(html).not.toContain('pkc-toc-formal');
    expect(html).toContain(':::toc');  // literal
  });

  it('unclosed `:::toc`(closing `:::` 無し)は literal で残し warning', () => {
    const html = renderMarkdown(':::toc\nuncloed');
    expect(html).not.toContain('pkc-toc-formal');
    // literal で残るのは markdown-it 標準挙動(error にはしない)
  });

  it('frontmatter heading は除外(extractHeadingsFromMarkdown が strip 済)', () => {
    const md = `---\ntitle: My title\n---\n\n:::toc\n:::\n\n# 本文の章`;
    const html = renderMarkdown(md);
    expect(html).toContain('本文の章');
    // frontmatter の title は heading として誤認しない
    expect(html).not.toMatch(/<li[^>]*>.*My title/);
  });

  it('`:::if{format=html}` 内 heading は include、`:::if{format=pdf}` 内は exclude', () => {
    const md = `:::toc\n:::\n\n# 通常\n\n:::if{format=html}\n## HTML only\n:::\n\n:::if{format=pdf}\n## PDF only(除外)\n:::`;
    const html = renderMarkdown(md);
    expect(html).toContain('通常');
    expect(html).toContain('HTML only');
    // PDF-only heading は extractHeadingsFromMarkdown が strip(target='html')
    expect(html).not.toMatch(/<li[^>]*>.*PDF only/);
  });

  it('heading link `href="#slug"` が機能(anchor target)', () => {
    const md = `:::toc\n:::\n\n# 第 1 章\n\n## サブセクション`;
    const html = renderMarkdown(md);
    // slug は ASCII / lowercase / hyphen 形式
    expect(html).toMatch(/<a class="pkc-toc-link" href="#[^"]+">第 1 章<\/a>/);
    expect(html).toMatch(/<a class="pkc-toc-link" href="#[^"]+">サブセクション<\/a>/);
  });
});
