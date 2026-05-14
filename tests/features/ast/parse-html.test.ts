/**
 * @vitest-environment happy-dom
 *
 * PR-V7(2026-05-14、v2.3.x stack):HTML → AST reverse parser test。
 * `docs/spec/ast-commutative-ir.md` の双方向 mapping を完成させる。
 *
 * 検証カテゴリ:
 *   1. Core block elements(p / h1-h6 / blockquote / ul / ol / table / pre / hr)
 *   2. Core inline elements(strong / em / s / code / mark / sup / sub / ruby / a / img)
 *   3. PKC-specific markup(section data-pkc-role / cite pkc-citation / a pkc-auto-ref /
 *      span pkc-em-dot / span pkc-variable / sup pkc-footnote-ref / div pkc-if-block)
 *   4. Opaque preservation(未知 tag → AstOpaqueInline / AstOpaqueBlock)
 *   5. Round-trip:`renderHtml(ast) → parseHtml → semantic 等価`
 */
import { describe, it, expect } from 'vitest';
import { parseHtmlToAst } from '@features/ast/parse-html';
import { renderAstToHtml } from '@features/ast/render-html';
import { parseMarkdownToAst } from '@features/ast/parse';
import { canonicalize } from '@features/ast/canonicalize';
import { semanticHash } from '@features/ast/semantic-hash';
import type { AstBlock, AstInline } from '@core/ast/index';

function blocks(html: string): AstBlock[] {
  return parseHtmlToAst(html).children as AstBlock[];
}

function paragraphInlines(html: string): AstInline[] {
  const ast = parseHtmlToAst(html);
  const first = ast.children[0];
  if (!first || first.kind !== 'paragraph') return [];
  return first.children as AstInline[];
}

describe('PR-V7 parseHtmlToAst — block elements', () => {
  it('<p> → AstParagraph with text', () => {
    const b = blocks('<p>hello world</p>');
    expect(b.length).toBe(1);
    expect(b[0]?.kind).toBe('paragraph');
  });

  it('<h2> → AstHeading level=2', () => {
    const b = blocks('<h2>Title</h2>');
    expect(b[0]?.kind).toBe('heading');
    expect((b[0] as { level: number }).level).toBe(2);
  });

  it('<blockquote> → AstQuote', () => {
    const b = blocks('<blockquote><p>quote</p></blockquote>');
    expect(b[0]?.kind).toBe('quote');
  });

  it('<ul><li> → AstList(bullet)', () => {
    const b = blocks('<ul><li>a</li><li>b</li></ul>');
    const list = b[0] as { kind: string; listKind: string; items: unknown[] };
    expect(list.kind).toBe('list');
    expect(list.listKind).toBe('bullet');
    expect(list.items.length).toBe(2);
  });

  it('<ol start="5"> → AstList(ordered, start=5)', () => {
    const b = blocks('<ol start="5"><li>a</li></ol>');
    expect((b[0] as { listKind: string; start?: number }).listKind).toBe('ordered');
    expect((b[0] as { listKind: string; start?: number }).start).toBe(5);
  });

  it('<ul><li><input type=checkbox> → task list', () => {
    const b = blocks(
      '<ul><li><input type="checkbox" disabled> open</li><li><input type="checkbox" checked disabled> done</li></ul>',
    );
    const list = b[0] as { listKind: string; items: Array<{ state?: string }> };
    expect(list.listKind).toBe('task');
    expect(list.items[0]?.state).toBe('open');
    expect(list.items[1]?.state).toBe('done');
  });

  it('<pre><code class="language-ts"> → AstCodeBlock(lang=ts)', () => {
    const b = blocks('<pre><code class="language-ts">const a = 1;</code></pre>');
    expect(b[0]?.kind).toBe('code-block');
    expect((b[0] as { lang: string | null }).lang).toBe('ts');
  });

  it('<hr> → AstBreak(rule)', () => {
    const b = blocks('<hr>');
    expect(b[0]?.kind).toBe('break');
  });

  it('<table> → AstTable with header + body rows', () => {
    const b = blocks(
      '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>',
    );
    const tbl = b[0] as { kind: string; rows: Array<{ isHeader?: boolean; cells: unknown[] }> };
    expect(tbl.kind).toBe('table');
    expect(tbl.rows.length).toBe(2);
    expect(tbl.rows[0]?.isHeader).toBe(true);
    expect(tbl.rows[0]?.cells.length).toBe(2);
  });

  it('<figure> → AstFigure with caption', () => {
    const b = blocks(
      '<figure class="pkc-figure"><img src="a.png" alt=""><figcaption>A caption</figcaption></figure>',
    );
    expect(b[0]?.kind).toBe('figure');
  });

  it('<section data-pkc-role="warning"> → AstSection role=warning', () => {
    const b = blocks('<section data-pkc-role="warning"><p>注意</p></section>');
    expect(b[0]?.kind).toBe('section');
    expect((b[0] as { role: string }).role).toBe('warning');
  });

  it('<div class="pkc-if-block" data-pkc-if-format="html"> → AstIfBlock', () => {
    const b = blocks('<div class="pkc-if-block" data-pkc-if-format="html"><p>x</p></div>');
    expect(b[0]?.kind).toBe('if-block');
    expect((b[0] as { format: string }).format).toBe('html');
  });

  it('<dl><dt><dd> → AstDefinitionList', () => {
    const b = blocks('<dl><dt>Term1</dt><dd><p>desc1</p></dd></dl>');
    const dl = b[0] as { kind: string; items: Array<{ term: unknown[]; description: unknown[] }> };
    expect(dl.kind).toBe('definition-list');
    expect(dl.items.length).toBe(1);
  });
});

describe('PR-V7 parseHtmlToAst — inline elements', () => {
  it('<strong>X</strong> → AstStrong', () => {
    const i = paragraphInlines('<p><strong>a</strong></p>');
    expect(i[0]?.kind).toBe('strong');
  });

  it('<em>X</em> → AstEmphasis', () => {
    const i = paragraphInlines('<p><em>a</em></p>');
    expect(i[0]?.kind).toBe('emphasis');
  });

  it('<s>X</s> → AstStrike', () => {
    const i = paragraphInlines('<p><s>a</s></p>');
    expect(i[0]?.kind).toBe('strike');
  });

  it('<code>X</code> → AstInlineCode', () => {
    const i = paragraphInlines('<p><code>fn()</code></p>');
    expect(i[0]?.kind).toBe('inline-code');
    expect((i[0] as { value: string }).value).toBe('fn()');
  });

  it('<mark class="pkc-mark-yellow"> → AstMark color=yellow', () => {
    const i = paragraphInlines('<p><mark class="pkc-mark-yellow">a</mark></p>');
    expect(i[0]?.kind).toBe('mark');
    expect((i[0] as { color?: string }).color).toBe('yellow');
  });

  it('<sup>/<sub> → AstSup / AstSub', () => {
    const a = paragraphInlines('<p><sup>a</sup></p>');
    const b = paragraphInlines('<p><sub>b</sub></p>');
    expect(a[0]?.kind).toBe('sup');
    expect(b[0]?.kind).toBe('sub');
  });

  it('<ruby>base<rt>rt</rt></ruby> → AstRuby', () => {
    const i = paragraphInlines('<p><ruby>漢字<rt>かんじ</rt></ruby></p>');
    expect(i[0]?.kind).toBe('ruby');
    expect((i[0] as { base: string }).base).toBe('漢字');
    expect((i[0] as { rt: string }).rt).toBe('かんじ');
  });

  it('<a href=...> → AstLink', () => {
    const i = paragraphInlines('<p><a href="https://example.com" class="pkc-link-external">x</a></p>');
    expect(i[0]?.kind).toBe('link');
    expect((i[0] as { href: string }).href).toBe('https://example.com');
  });

  it('<img src alt> → AstImage', () => {
    const b = blocks('<p><img src="a.png" alt="a"></p>');
    const para = b[0] as { children: AstInline[] };
    expect(para.children[0]?.kind).toBe('image');
  });

  it('<cite class="pkc-citation" data-pkc-cite-id="smith2020"> → AstCitation', () => {
    const i = paragraphInlines('<p><cite class="pkc-citation" data-pkc-cite-id="smith2020">@smith2020</cite></p>');
    expect(i[0]?.kind).toBe('citation');
    expect((i[0] as { id: string }).id).toBe('smith2020');
  });

  it('<a class="pkc-auto-ref" data-pkc-ref-id="fig-1"> → AstAutoRef', () => {
    const i = paragraphInlines('<p><a class="pkc-auto-ref" href="#fig-1" data-pkc-ref-id="fig-1"></a></p>');
    expect(i[0]?.kind).toBe('auto-ref');
    expect((i[0] as { id: string }).id).toBe('fig-1');
  });

  it('<span class="pkc-em-dot"> → AstEmDot', () => {
    const i = paragraphInlines('<p><span class="pkc-em-dot">a</span></p>');
    expect(i[0]?.kind).toBe('em-dot');
  });

  it('<span class="pkc-variable" data-pkc-var-path="vars.X"> → AstVar', () => {
    const i = paragraphInlines('<p><span class="pkc-variable" data-pkc-var-path="vars.name">{{vars.name}}</span></p>');
    expect(i[0]?.kind).toBe('var');
    expect((i[0] as { path: string }).path).toBe('vars.name');
  });

  it('<sup class="pkc-footnote-ref"><a id="fnref-X"> → AstFootnoteRef', () => {
    const i = paragraphInlines('<p><sup class="pkc-footnote-ref"><a href="#fn-X" id="fnref-X">X</a></sup></p>');
    expect(i[0]?.kind).toBe('footnote-ref');
    expect((i[0] as { id: string }).id).toBe('X');
  });
});

describe('PR-V7 parseHtmlToAst — opaque preservation', () => {
  it('未知 inline tag → AstOpaqueInline(sourceFormat=html)', () => {
    const i = paragraphInlines('<p><kbd>Ctrl</kbd></p>');
    expect(i[0]?.kind).toBe('opaque-inline');
    expect((i[0] as { sourceFormat: string }).sourceFormat).toBe('html');
    expect((i[0] as { original: string }).original).toContain('<kbd>');
  });

  it('未知 block tag(generic <div>)→ AstOpaqueBlock', () => {
    const b = blocks('<div class="custom-block">x</div>');
    expect(b[0]?.kind).toBe('opaque-block');
  });

  it('<cite> without data-pkc-cite-id → AstOpaqueInline', () => {
    const i = paragraphInlines('<p><cite>Smith 2020</cite></p>');
    expect(i[0]?.kind).toBe('opaque-inline');
  });
});

describe('PR-V7 parseHtmlToAst — round-trip with renderAstToHtml', () => {
  function md2html(md: string): string {
    return renderAstToHtml(parseMarkdownToAst(md));
  }

  it('paragraph round-trip semantic equiv', () => {
    const md = 'hello **bold** _italic_';
    const a = canonicalize(parseMarkdownToAst(md));
    const b = canonicalize(parseHtmlToAst(md2html(md)));
    expect(semanticHash(a)).toBe(semanticHash(b));
  });

  it('list round-trip semantic equiv', () => {
    const md = '- one\n- two\n- three';
    const a = canonicalize(parseMarkdownToAst(md));
    const b = canonicalize(parseHtmlToAst(md2html(md)));
    expect(semanticHash(a)).toBe(semanticHash(b));
  });

  it('heading round-trip semantic equiv', () => {
    const md = '# Title\n\nbody';
    const a = canonicalize(parseMarkdownToAst(md));
    const b = canonicalize(parseHtmlToAst(md2html(md)));
    expect(semanticHash(a)).toBe(semanticHash(b));
  });

  it('blockquote round-trip semantic equiv', () => {
    const md = '> quoted line\n> second line';
    const a = canonicalize(parseMarkdownToAst(md));
    const b = canonicalize(parseHtmlToAst(md2html(md)));
    expect(semanticHash(a)).toBe(semanticHash(b));
  });

  it('table round-trip semantic equiv', () => {
    const md = '| A | B |\n|---|---|\n| 1 | 2 |';
    const a = canonicalize(parseMarkdownToAst(md));
    const b = canonicalize(parseHtmlToAst(md2html(md)));
    expect(semanticHash(a)).toBe(semanticHash(b));
  });

  it('code-block round-trip preserves lang', () => {
    const md = '```js\nconst a = 1;\n```';
    const a = canonicalize(parseMarkdownToAst(md));
    const b = canonicalize(parseHtmlToAst(md2html(md)));
    // semantic hash 完全一致は md→html→md の whitespace 差を受けるので、
    // ここは「code-block 自体が rendered & re-parsed されて lang が取れている」を確認
    const codeBlock = (b.children[0] as { kind: string });
    expect(codeBlock.kind).toBe('code-block');
    expect((b.children[0] as { lang: string }).lang).toBe('js');
    expect(a).toBeDefined();
  });

  it('idempotent: parseHtml(renderHtml(ast)) で 2 周目以降 stable', () => {
    const md = '# Title\n\nhello **bold** world';
    const ast1 = canonicalize(parseHtmlToAst(md2html(md)));
    const ast2 = canonicalize(parseHtmlToAst(renderAstToHtml(ast1)));
    expect(semanticHash(ast1)).toBe(semanticHash(ast2));
  });
});

describe('PR-V7 parseHtmlToAst — robustness', () => {
  it('empty string → empty document', () => {
    const ast = parseHtmlToAst('');
    expect(ast.children.length).toBe(0);
  });

  it('html fragment without <html> wrap', () => {
    const ast = parseHtmlToAst('<p>x</p><p>y</p>');
    expect(ast.children.length).toBe(2);
  });

  it('whitespace-only between blocks → drop', () => {
    const ast = parseHtmlToAst('<p>a</p>\n  \n<p>b</p>');
    expect(ast.children.length).toBe(2);
  });

  it('<br> → text "\\n" (inline soft break)', () => {
    const i = paragraphInlines('<p>line1<br>line2</p>');
    const hasNewline = i.some((n) => n.kind === 'text' && (n as { value: string }).value.includes('\n'));
    expect(hasNewline).toBe(true);
  });
});
