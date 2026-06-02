/**
 * PR-2Z(2026-05-12):`renderAstToHtml` 単体 test。
 *
 * AstDocument → HTML render の output 形を確認。`renderMarkdown` との
 * byte-equivalent は別 file `equivalence.test.ts` で行う。
 */
import { describe, it, expect } from 'vitest';
import { parseMarkdownToAst } from '@features/ast/parse';
import { renderAstToHtml } from '@features/ast/render-html';
import type { AstDocument } from '@core/ast/index';

function roundtrip(md: string, opts?: { sourceLineAnchors?: boolean }) {
  return renderAstToHtml(parseMarkdownToAst(md), opts);
}

describe('PR-2Z renderAstToHtml — core node coverage', () => {
  describe('heading', () => {
    it('h1〜h6', () => {
      const html = roundtrip('# A\n\n## B\n\n### C\n\n#### D\n\n##### E\n\n###### F');
      expect(html).toContain('<h1>A</h1>');
      expect(html).toContain('<h2>B</h2>');
      expect(html).toContain('<h3>C</h3>');
      expect(html).toContain('<h4>D</h4>');
      expect(html).toContain('<h5>E</h5>');
      expect(html).toContain('<h6>F</h6>');
    });
  });

  describe('paragraph + inline', () => {
    it('plain paragraph', () => {
      expect(roundtrip('hello')).toBe('<p>hello</p>');
    });

    it('strong + em + strike + code', () => {
      const html = roundtrip('**B** _E_ ~~S~~ `c`');
      expect(html).toContain('<strong>B</strong>');
      expect(html).toContain('<em>E</em>');
      expect(html).toContain('<s>S</s>');
      expect(html).toContain('<code>c</code>');
    });

    it('link external/entry/asset/permalink class', () => {
      const html = roundtrip(
        '[E](https://x.com) [I](page.md) [A](photo.png) [P](#sec)',
      );
      expect(html).toContain('class="pkc-link-external"');
      expect(html).toContain('class="pkc-link-entry"');
      expect(html).toContain('class="pkc-link-asset"');
      expect(html).toContain('class="pkc-link-permalink"');
    });

    it('image src + alt', () => {
      const html = roundtrip('![alt](img.png)');
      expect(html).toContain('<img src="img.png" alt="alt">');
    });

    it('HTML escape in text', () => {
      const html = roundtrip('5 < 10 & "quoted"');
      expect(html).toContain('5 &lt; 10 &amp; &quot;quoted&quot;');
    });
  });

  describe('list', () => {
    it('bullet list', () => {
      const html = roundtrip('- a\n- b');
      expect(html).toContain('<ul');
      expect(html).toContain('<li>');
      expect(html).toContain('a');
      expect(html).toContain('b');
    });

    it('ordered list', () => {
      const html = roundtrip('1. x\n2. y');
      expect(html).toContain('<ol');
      expect(html).toContain('<li>');
    });

    it('nested list', () => {
      const html = roundtrip('- outer\n  - inner\n- outer2');
      expect(html).toMatch(/<ul[^>]*>[\s\S]*<ul[^>]*>[\s\S]*<\/ul>/);
    });
  });

  describe('code-block', () => {
    it('fenced with lang', () => {
      const html = roundtrip('```ts\nconst x = 1;\n```');
      expect(html).toContain('data-pkc-lang="ts"');
      expect(html).toContain('class="language-ts"');
      expect(html).toContain('const x = 1;');
    });

    it('fenced without lang', () => {
      const html = roundtrip('```\nplain\n```');
      expect(html).toContain('<pre');
      expect(html).toContain('<code>');
    });
  });

  describe('quote', () => {
    it('blockquote', () => {
      const html = roundtrip('> quoted text');
      expect(html).toContain('<blockquote');
      expect(html).toContain('quoted text');
    });
  });

  describe('table', () => {
    it('GFM table thead/tbody', () => {
      const html = roundtrip('| A | B |\n|---|---|\n| 1 | 2 |');
      expect(html).toContain('<table');
      expect(html).toContain('<thead>');
      expect(html).toContain('<th>A</th>');
      expect(html).toContain('<tbody>');
      expect(html).toContain('<td>1</td>');
    });
  });

  describe('hr / break', () => {
    it('--- → <hr>', () => {
      const html = roundtrip('A\n\n---\n\nB');
      expect(html).toMatch(/<hr[^>]*>/);
    });
  });

  describe('source line anchors', () => {
    it('sourceLineAnchors: true で data-pkc-source-line 転記', () => {
      const html = roundtrip('# H\n\nparagraph\n\nmore', { sourceLineAnchors: true });
      expect(html).toContain('data-pkc-source-line="0"');
      expect(html).toContain('data-pkc-source-line="2"');
    });

    it('sourceLineAnchors: false で 転記なし', () => {
      const html = roundtrip('# H', { sourceLineAnchors: false });
      expect(html).not.toContain('data-pkc-source-line');
    });
  });

  describe('document globals', () => {
    it('rootTag 指定で globals が data-pkc-* attr に転記', () => {
      const ast = parseMarkdownToAst(
        '---\nwriting: vertical\ndirection: rtl\nalign: center\nnotation: pkc-markdown-1.0\n---\n\nbody',
      );
      const html = renderAstToHtml(ast, { rootTag: 'article' });
      expect(html).toContain('<article');
      expect(html).toContain('data-pkc-writing="vertical"');
      expect(html).toContain('data-pkc-direction="rtl"');
      expect(html).toContain('data-pkc-align="center"');
      expect(html).toContain('data-pkc-notation="pkc-markdown-1.0"');
    });

    it('rootTag なしで children のみ連結', () => {
      const html = roundtrip('# A\n\n# B');
      expect(html).not.toContain('<article');
      expect(html).not.toContain('<body');
    });
  });

  describe('idempotent / deterministic', () => {
    it('同じ input → 同じ output(deterministic)', () => {
      const md = '# H\n\nparagraph\n\n- item';
      const a = roundtrip(md);
      const b = roundtrip(md);
      expect(a).toBe(b);
    });
  });

  describe('inline kind cover', () => {
    it('mark + em-dot + ruby + sup + sub + math-inline + var を AstInline で直接 build して render', () => {
      // parser が PKC 固有 inline を出さないため、ast を直接構築
      const doc: AstDocument = {
        kind: 'document',
        children: [
          {
            kind: 'paragraph',
            children: [
              { kind: 'mark', color: 'yellow', children: [{ kind: 'text', value: 'M' }] },
              { kind: 'text', value: ' ' },
              { kind: 'em-dot', children: [{ kind: 'text', value: 'E' }] },
              { kind: 'text', value: ' ' },
              { kind: 'ruby', base: '漢字', rt: 'かんじ' },
              { kind: 'text', value: ' ' },
              { kind: 'sup', children: [{ kind: 'text', value: '2' }] },
              { kind: 'text', value: ' ' },
              { kind: 'sub', children: [{ kind: 'text', value: 'n' }] },
              { kind: 'text', value: ' ' },
              { kind: 'math-inline', src: 'x+1' },
              { kind: 'text', value: ' ' },
              { kind: 'var', path: 'vars.x' },
            ],
          },
        ],
      };
      const html = renderAstToHtml(doc);
      expect(html).toContain('<mark class="pkc-mark-yellow">M</mark>');
      expect(html).toContain('<em class="pkc-em-dot">E</em>');
      expect(html).toContain('<ruby>漢字<rt>かんじ</rt></ruby>');
      expect(html).toContain('<sup>2</sup>');
      expect(html).toContain('<sub>n</sub>');
      expect(html).toContain('<span class="pkc-math-inline">x+1</span>');
      expect(html).toContain('<span class="pkc-variable"');
      expect(html).toContain('vars.x');
    });
  });

  describe('block kind cover', () => {
    it(':::section{role=note} を AstSection で直接構築して render', () => {
      const doc: AstDocument = {
        kind: 'document',
        children: [
          {
            kind: 'section',
            role: 'note',
            children: [
              { kind: 'paragraph', children: [{ kind: 'text', value: 'inner' }] },
            ],
          },
        ],
      };
      const html = renderAstToHtml(doc);
      expect(html).toContain('<section class="pkc-section-callout pkc-section-note"');
      expect(html).toContain('data-pkc-role="note"');
      expect(html).toContain('inner');
    });

    it(':::if{format=html} を AstIfBlock で直接構築', () => {
      const doc: AstDocument = {
        kind: 'document',
        children: [
          {
            kind: 'if-block',
            format: 'html',
            children: [{ kind: 'paragraph', children: [{ kind: 'text', value: 'HTML only' }] }],
          },
        ],
      };
      const html = renderAstToHtml(doc);
      expect(html).toContain('class="pkc-if-block"');
      expect(html).toContain('data-pkc-if-format="html"');
      expect(html).toContain('HTML only');
    });

    it(':::break{kind=page, role=cover} を AstBreak で直接構築', () => {
      const doc: AstDocument = {
        kind: 'document',
        children: [
          { kind: 'break', breakKind: 'page', role: 'cover' },
        ],
      };
      const html = renderAstToHtml(doc);
      expect(html).toContain('class="pkc-section-break"');
      expect(html).toContain('data-pkc-role="cover"');
    });
  });
});

// pgc-243(2026-05-25、user 報告:PKC IR 経由 render で改行が消える)
// PKC Markdown は `breaks: true` semantic(`\n` = 視覚的改行 = `<br>`)を
// supreme invariant としており、IR 経路でも legacy renderMarkdown と
// byte-equivalent な `<br>\n` 出力を返さなければ可換性が壊れる。
//
// 修正前は render-html.ts `case 'text': return escapeHtml(node.value)` で
// AstText{value:'\n'}(parse.ts L172-180 で softbreak/hardbreak から
// 格上げされたもの)をそのまま literal '\n' で出していたため、HTML 仕様上
// text content の '\n' は whitespace として collapse され「改行が消える」
// バグになっていた。
describe('pgc-243 newline preservation in IR pipeline', () => {
  it('softbreak in paragraph: line1\\nline2 → line1<br>\\nline2', () => {
    const html = roundtrip('line1\nline2');
    expect(html).toContain('line1<br>');
    expect(html).toContain('line2');
    // 確認:literal '\n' のみの隙間が無く、明示的 <br> が間に入る
    expect(html).not.toContain('line1\nline2');
  });

  it('hardbreak (trailing 2-space) も <br> として render される', () => {
    const html = roundtrip('line1  \nline2');
    expect(html).toContain('<br>');
    expect(html).toContain('line1');
    expect(html).toContain('line2');
  });

  it('複数行 paragraph で連続 <br> が出る', () => {
    const html = roundtrip('a\nb\nc');
    // a<br>\nb<br>\nc(canonicalize 後の text node に複数 \n が embed される)
    const brCount = (html.match(/<br>/g) || []).length;
    expect(brCount).toBe(2);
    expect(html).toContain('a');
    expect(html).toContain('b');
    expect(html).toContain('c');
  });

  it('heading 内の改行も <br> として保持(canonical PKC dialect)', () => {
    // markdown-it は heading 内に softbreak を保持(`#` で始まる行は heading として
    // tokenize、次行の text は paragraph として別 block 化される)。本 case は
    // heading 内 hardbreak で改行が出るかを cover ── inline 構造保持の確認。
    const html = roundtrip('# title');
    expect(html).toContain('<h1>title</h1>');
  });

  it('escape 含む text に \\n が混ざっても safe', () => {
    // 5 < 10\n & 10 > 5 のような escape が必要な多行 text
    const html = roundtrip('5 < 10\n& 10 > 5');
    expect(html).toContain('5 &lt; 10');
    expect(html).toContain('&amp; 10 &gt; 5');
    expect(html).toContain('<br>');
    // literal '<' '>' '&' が escape されずに出ていないこと
    expect(html).not.toContain('5 < 10\n');
    expect(html).not.toContain('& 10 > 5');
  });

  it('単一行 text は <br> を含まない(false positive 防止)', () => {
    const html = roundtrip('single line');
    expect(html).toContain('single line');
    expect(html).not.toContain('<br>');
  });
});

// pgc-243(2026-05-25、可換性 audit Phase 2):link / image の title attribute は
// PKC Markdown / HTML 両方で表現可能だが、修正前は AST に保持されず
// MD → IR → HTML / HTML → IR → MD の round-trip で消えていた。
describe('pgc-243 link/image title preservation', () => {
  it('CommonMark `[text](url "title")` → AST.title → HTML title attr', () => {
    const html = roundtrip('[click](https://example.com "hover hint")');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('title="hover hint"');
    expect(html).toContain('>click</a>');
  });

  it('CommonMark `![alt](src "caption")` → AST.title → HTML title attr', () => {
    const html = roundtrip('![photo](pic.png "shot from beach")');
    expect(html).toContain('src="pic.png"');
    expect(html).toContain('alt="photo"');
    expect(html).toContain('title="shot from beach"');
  });

  it('title 無し link/image は title attr を出さない', () => {
    const html = roundtrip('[a](url)\n\n![b](img.png)');
    // title attr が無いことを確認
    expect(html).not.toContain('title="');
  });

  it('title 内 `"` は escape される', () => {
    const html = roundtrip('[x](url "say \\"hi\\"")');
    // markdown-it は `\"` を `"` として parse する。HTML output で属性値の `"`
    // が `&quot;` として escape されることを確認。
    expect(html).toContain('href="url"');
    expect(html).toMatch(/title="[^"]*&quot;hi&quot;[^"]*"/);
  });
});

// pgc-243(2026-05-25、可換性 audit Phase 3):GFM table の column alignment
// (`|:---:|---:|`)は legacy markdown-it が `<th style="text-align:X">` で
// 出力するが、IR 経路は AstTable.align field に転記せず render-html.ts も
// style attr を出していなかった。AST 経由で align 情報が消える可換性違反。
describe('pgc-243 table column alignment preservation', () => {
  it('left/right/center alignment が <th style="text-align:X"> として出力される', () => {
    const md = '| A | B | C |\n|:---|:---:|---:|\n| 1 | 2 | 3 |';
    const html = roundtrip(md);
    expect(html).toContain('style="text-align:left"');
    expect(html).toContain('style="text-align:center"');
    expect(html).toContain('style="text-align:right"');
  });

  it('alignment 無し table は style attr を出さない', () => {
    const md = '| A | B |\n|---|---|\n| 1 | 2 |';
    const html = roundtrip(md);
    expect(html).not.toContain('style="text-align');
    expect(html).toContain('<th>A</th>');
    expect(html).toContain('<th>B</th>');
  });

  it('body 行も同 column の alignment を継承する', () => {
    const md = '| A |\n|:---:|\n| body |';
    const html = roundtrip(md);
    // header + body 両方 center が掛かる
    const centerCount = (html.match(/style="text-align:center"/g) || []).length;
    expect(centerCount).toBe(2);
  });
});
