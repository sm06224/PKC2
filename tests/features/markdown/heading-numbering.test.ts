/**
 * 領域 8 Layer 3:見出しアウトライン番号(案 C)。
 *
 * opt-in(frontmatter `heading-number`)で、レンダラが `#`/`##`/`###` に
 * `N.` / `N.M` / `N.M.L` を前置する。`####` 以降は無番号。開始番号指定可、
 * 手書き番号は尊重(案 C)。
 */
import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '@features/markdown/markdown-render';
import { extractHeadingNumberConfig } from '@features/markdown/document-globals';

describe('領域 8:extractHeadingNumberConfig(frontmatter opt-in)', () => {
  it('heading-number: true → { start: 1 }', () => {
    expect(extractHeadingNumberConfig('---\nheading-number: true\n---\n本文')).toEqual({ start: 1 });
  });

  it('heading-number: 3 → { start: 3 }(数値 = 開始番号)', () => {
    expect(extractHeadingNumberConfig('---\nheading-number: 3\n---\n本文')).toEqual({ start: 3 });
  });

  it('frontmatter なし → null', () => {
    expect(extractHeadingNumberConfig('# 見出し\n本文')).toBeNull();
  });

  it('frontmatter に heading-number なし → null', () => {
    expect(extractHeadingNumberConfig('---\ntitle: T\n---\n本文')).toBeNull();
  });

  it('heading-number: false → null(opt-in なので無効)', () => {
    expect(extractHeadingNumberConfig('---\nheading-number: false\n---\n本文')).toBeNull();
  });
});

describe('領域 8:renderMarkdown 見出し採番', () => {
  const num = { start: 1 };

  it('# → <h1>N. ...</h1>', () => {
    const html = renderMarkdown('# 序論', { headingNumber: num });
    expect(html).toMatch(/<h1[^>]*>1\.\s/);
    expect(html).toContain('序論');
  });

  it('#/##/### に 3 レベルまで採番、#### は無番号', () => {
    const html = renderMarkdown('# A\n\n## B\n\n### C\n\n#### D', { headingNumber: num });
    expect(html).toMatch(/<h1[^>]*>1\. A<\/h1>/);
    expect(html).toMatch(/<h2[^>]*>1\.1 B<\/h2>/);
    expect(html).toMatch(/<h3[^>]*>1\.1\.1 C<\/h3>/);
    expect(html).toMatch(/<h4[^>]*>D<\/h4>/); // #### は番号なし
  });

  it('開始番号 start=3 が L1 に反映される', () => {
    const html = renderMarkdown('# A', { headingNumber: { start: 3 } });
    expect(html).toMatch(/<h1[^>]*>3\. A<\/h1>/);
  });

  it('複数 h1 は連番', () => {
    const html = renderMarkdown('# A\n\n# B', { headingNumber: num });
    expect(html).toMatch(/<h1[^>]*>1\. A<\/h1>/);
    expect(html).toMatch(/<h1[^>]*>2\. B<\/h1>/);
  });

  it('下位カウンタは上位見出しでリセットされる', () => {
    const html = renderMarkdown('# A\n\n## A1\n\n# B\n\n## B1', { headingNumber: num });
    expect(html).toMatch(/<h2[^>]*>1\.1 A1<\/h2>/);
    expect(html).toMatch(/<h2[^>]*>2\.1 B1<\/h2>/);
  });

  it('手書き番号で始まる見出しは尊重し二重採番しない', () => {
    const html = renderMarkdown('# 5. 手書き見出し', { headingNumber: num });
    expect(html).toMatch(/<h1[^>]*>5\. 手書き見出し<\/h1>/);
    expect(html).not.toMatch(/1\. 5\./);
  });

  it('手書き / auto 混在 ── auto は位置基準で採番', () => {
    const html = renderMarkdown('# 自動\n\n# 5. 手書き\n\n# また自動', { headingNumber: num });
    expect(html).toMatch(/<h1[^>]*>1\. 自動<\/h1>/);
    expect(html).toMatch(/<h1[^>]*>5\. 手書き<\/h1>/);
    expect(html).toMatch(/<h1[^>]*>3\. また自動<\/h1>/); // 3 番目 → 3.
  });

  it('headingNumber 未指定なら採番しない', () => {
    const html = renderMarkdown('# 序論');
    expect(html).toMatch(/<h1[^>]*>序論<\/h1>/);
    expect(html).not.toMatch(/1\./);
  });

  it('fenced code 内の # 行は採番しない', () => {
    const html = renderMarkdown('```\n# コード中の見出し風\n```', { headingNumber: num });
    expect(html).not.toMatch(/1\.\s/);
    expect(html).toContain('# コード中の見出し風');
  });

  it('採番後も見出し内の markdown が render される', () => {
    const html = renderMarkdown('# **強調** タイトル', { headingNumber: num });
    expect(html).toMatch(/<h1[^>]*>1\. <strong>強調<\/strong> タイトル<\/h1>/);
  });
});
