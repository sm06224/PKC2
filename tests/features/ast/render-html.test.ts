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
