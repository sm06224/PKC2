/**
 * 領域 6:行頭 align prefix(L-5 `||` / `|>` / `<|`)を見出しにも適用。
 *
 * 従来 `applyAlignAttrs` は `paragraph_open` のみに `data-pkc-align` を
 * stamp していた。`||## 見出し` のように見出し行へ prefix を付けても
 * align が効かなかったのを、`heading_open` も対象に含めて解消する。
 * indent(L-9 `__`)は段落専用のまま(見出しには付与しない)。
 */
import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '@features/markdown/markdown-render';

describe('領域 6:見出しへの align prefix 適用', () => {
  it('`||## X` → <h2 data-pkc-align="center">', () => {
    const html = renderMarkdown('||## 中央見出し');
    expect(html).toMatch(/<h2[^>]*data-pkc-align="center"[^>]*>/);
    expect(html).toContain('中央見出し');
  });

  it('`|>## X` → <h2 data-pkc-align="end">', () => {
    const html = renderMarkdown('|>## 末尾寄せ見出し');
    expect(html).toMatch(/<h2[^>]*data-pkc-align="end"[^>]*>/);
  });

  it('`<|## X` → <h2 data-pkc-align="end">(L-5 の 4 形は end へ集約)', () => {
    const html = renderMarkdown('<|## 見出し');
    expect(html).toMatch(/<h2[^>]*data-pkc-align="end"[^>]*>/);
  });

  it('`||# X` → <h1> にも適用される', () => {
    const html = renderMarkdown('||# 大見出し');
    expect(html).toMatch(/<h1[^>]*data-pkc-align="center"[^>]*>/);
  });

  it('`||###### X` → <h6> にも適用される', () => {
    const html = renderMarkdown('||###### 小見出し');
    expect(html).toMatch(/<h6[^>]*data-pkc-align="center"[^>]*>/);
  });

  it('prefix なしの見出しには data-pkc-align が付かない', () => {
    const html = renderMarkdown('||段落\n\n## 素の見出し');
    expect(html).toMatch(/<p[^>]*data-pkc-align="center"[^>]*>/);
    expect(html).toMatch(/<h2(?![^>]*data-pkc-align)[^>]*>素の見出し<\/h2>/);
  });

  it('段落への align prefix は従来どおり機能する(回帰ガード)', () => {
    const html = renderMarkdown('||中央寄せの段落');
    expect(html).toMatch(/<p[^>]*data-pkc-align="center"[^>]*>/);
  });

  it('見出しには indent(L-9 `__`)は付与されない', () => {
    // `__段落` は <p data-pkc-indent>、`__## 見出し` は <h2> に indent なし。
    const html = renderMarkdown('__字下げ段落\n\n__## 見出し');
    expect(html).toMatch(/<p[^>]*data-pkc-indent="1"[^>]*>/);
    expect(html).not.toMatch(/<h2[^>]*data-pkc-indent/);
  });
});
