/**
 * reform-2026-05 PR-F:`:::if{format=...}` conditional block の integration test。
 *
 * 仕様(`docs/development/notation-redesign-2026-05/01-notation-catalog.md` §1.4 #23):
 *   - :::if{format=html}     ← html target で match → content 出力
 *   - :::if{format=docx}     ← html target で不一致 → content 全 strip
 *   - :::if(無 attrs)        ← always match
 *   - nested directive 対応(:::if{...} 内に :::quote 等)
 *   - fenced code 内の :::if は marker 扱いしない
 */

import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '@features/markdown/markdown-render';

describe(':::if{format=...} conditional block', () => {
  it('format=html(target match)→ content render', () => {
    const src = `:::if{format=html}
本文 A
:::`;
    const html = renderMarkdown(src);
    expect(html).toContain('本文 A');
  });

  it('format=docx(target mismatch)→ content strip', () => {
    const src = `:::if{format=docx}
docx 専用本文
:::`;
    const html = renderMarkdown(src);
    expect(html).not.toContain('docx 専用本文');
  });

  it('format=markdown(target mismatch)→ content strip', () => {
    const src = `:::if{format=markdown}
md 専用本文
:::`;
    const html = renderMarkdown(src);
    expect(html).not.toContain('md 専用本文');
  });

  it('format 省略 → always match(plain wrapper)', () => {
    const src = `:::if
常時表示本文
:::`;
    const html = renderMarkdown(src);
    expect(html).toContain('常時表示本文');
  });

  it('match 時、content は通常の markdown render される', () => {
    const src = `:::if{format=html}
**bold** と *italic*
:::`;
    const html = renderMarkdown(src);
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
  });

  it('mismatch 時、content の markdown は render されない', () => {
    const src = `:::if{format=docx}
**bold text**
:::`;
    const html = renderMarkdown(src);
    expect(html).not.toContain('<strong>bold text</strong>');
    expect(html).not.toContain('bold text');
  });

  it('複数 :::if が独立 block として動作', () => {
    const src = `:::if{format=html}
HTML 用
:::

:::if{format=docx}
DOCX 用
:::`;
    const html = renderMarkdown(src);
    expect(html).toContain('HTML 用');
    expect(html).not.toContain('DOCX 用');
  });

  it(':::if 内に :::quote nested(両 directive 動作)', () => {
    const src = `:::if{format=html}
:::quote{author=Smith}
ネスト引用
:::
:::`;
    const html = renderMarkdown(src);
    expect(html).toContain('<blockquote');
    expect(html).toContain('pkc-quote-citation');
    expect(html).toContain('data-pkc-quote-author="Smith"');
    expect(html).toContain('ネスト引用');
  });

  it(':::if mismatch 内に :::quote nested → quote も skip', () => {
    const src = `:::if{format=docx}
:::quote{author=Smith}
ネスト引用
:::
:::`;
    const html = renderMarkdown(src);
    expect(html).not.toContain('<blockquote');
    expect(html).not.toContain('ネスト引用');
  });

  it('fenced code block 内の :::if{} はマーカー扱いしない', () => {
    const src = `\`\`\`
:::if{format=docx}
これは code 内
:::
\`\`\``;
    const html = renderMarkdown(src);
    // code block 内 literal で残る、markdown render 経由で <code> 化
    expect(html).toContain('<code');
    expect(html).toContain(':::if{format=docx}');
    expect(html).toContain('これは code 内');
  });

  it('閉じ ::: が無くても EOF まで content として処理(parser tolerance)', () => {
    const src = `:::if{format=html}
未閉じ本文`;
    const html = renderMarkdown(src);
    expect(html).toContain('未閉じ本文');
  });

  it('閉じ ::: 無し + format mismatch → content は strip(EOF tolerance)', () => {
    const src = `:::if{format=docx}
未閉じ docx 本文`;
    const html = renderMarkdown(src);
    expect(html).not.toContain('未閉じ docx 本文');
  });

  it(':::if 前後の本文は影響なし', () => {
    const src = `前段落

:::if{format=docx}
strip 対象
:::

後段落`;
    const html = renderMarkdown(src);
    expect(html).toContain('前段落');
    expect(html).toContain('後段落');
    expect(html).not.toContain('strip 対象');
  });

  it('format=html 大文字小文字区別あり(format=HTML は mismatch)', () => {
    const src = `:::if{format=HTML}
case-sensitive
:::`;
    const html = renderMarkdown(src);
    expect(html).not.toContain('case-sensitive');
  });

  it('format quoted("html")も受理(parseBlockDirectiveAttrs が unquote)', () => {
    const src = `:::if{format="html"}
quoted format value
:::`;
    const html = renderMarkdown(src);
    expect(html).toContain('quoted format value');
  });
});
