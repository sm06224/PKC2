/**
 * PR-2Y(2026-05-12):`parseMarkdownToAst` 単体 test。
 *
 * commonmark + GFM core node を AstDocument に正しく parse することを確認。
 * PKC 固有 inline / block の cover は段階的に追加(PR-2Y2 等 follow-up)、
 * 本 PR では core coverage を保証。
 */
import { describe, it, expect } from 'vitest';
import { parseMarkdownToAst } from '@features/ast/parse';

describe('PR-2Y parseMarkdownToAst — core markdown coverage', () => {
  describe('heading', () => {
    it('h1〜h6 の level + text', () => {
      const ast = parseMarkdownToAst('# A\n\n## B\n\n### C\n\n#### D\n\n##### E\n\n###### F');
      expect(ast.children.length).toBe(6);
      ast.children.forEach((c, i) => {
        expect(c.kind).toBe('heading');
        if (c.kind === 'heading') {
          expect(c.level).toBe(i + 1);
        }
      });
    });

    it('heading の children は text', () => {
      const ast = parseMarkdownToAst('# Hello world');
      const h = ast.children[0]!;
      expect(h.kind).toBe('heading');
      if (h.kind === 'heading') {
        expect(h.children.length).toBe(1);
        expect(h.children[0]).toEqual({ kind: 'text', value: 'Hello world' });
      }
    });
  });

  describe('paragraph + inline', () => {
    it('plain text の paragraph', () => {
      const ast = parseMarkdownToAst('plain text here');
      expect(ast.children.length).toBe(1);
      const p = ast.children[0]!;
      expect(p.kind).toBe('paragraph');
      if (p.kind === 'paragraph') {
        expect(p.children).toEqual([{ kind: 'text', value: 'plain text here' }]);
      }
    });

    it('strong + emphasis + strike', () => {
      const ast = parseMarkdownToAst('**bold** _em_ ~~strike~~');
      const p = ast.children[0]!;
      if (p.kind !== 'paragraph') throw new Error('not paragraph');
      const kinds = p.children.map((c) => c.kind);
      expect(kinds).toContain('strong');
      expect(kinds).toContain('emphasis');
      expect(kinds).toContain('strike');
    });

    it('inline-code', () => {
      const ast = parseMarkdownToAst('hello `code` world');
      const p = ast.children[0]!;
      if (p.kind !== 'paragraph') throw new Error('not paragraph');
      const c = p.children.find((x) => x.kind === 'inline-code');
      expect(c).toBeDefined();
      if (c?.kind === 'inline-code') expect(c.value).toBe('code');
    });

    it('link external/entry/asset/permalink を classify', () => {
      const ast = parseMarkdownToAst(
        '[E](https://example.com) [I](page.md) [A](photo.png) [P](#sec)',
      );
      const p = ast.children[0]!;
      if (p.kind !== 'paragraph') throw new Error('not paragraph');
      const links = p.children.filter((c) => c.kind === 'link') as Array<{
        kind: 'link';
        linkKind: string;
        href: string;
      }>;
      expect(links.length).toBe(4);
      expect(links[0]?.linkKind).toBe('external');
      expect(links[1]?.linkKind).toBe('entry');
      expect(links[2]?.linkKind).toBe('asset');
      expect(links[3]?.linkKind).toBe('permalink');
    });

    it('image', () => {
      const ast = parseMarkdownToAst('![alt text](image.png)');
      const p = ast.children[0]!;
      if (p.kind !== 'paragraph') throw new Error('not paragraph');
      const img = p.children.find((c) => c.kind === 'image');
      expect(img).toBeDefined();
      if (img?.kind === 'image') {
        expect(img.src).toBe('image.png');
        expect(img.alt).toBe('alt text');
      }
    });

    it('nested inline(strong > emphasis)', () => {
      const ast = parseMarkdownToAst('**outer _inner_ outer**');
      const p = ast.children[0]!;
      if (p.kind !== 'paragraph') throw new Error('not paragraph');
      const strong = p.children.find((c) => c.kind === 'strong');
      expect(strong).toBeDefined();
      if (strong?.kind === 'strong') {
        const em = strong.children.find((c) => c.kind === 'emphasis');
        expect(em).toBeDefined();
      }
    });
  });

  describe('list', () => {
    it('bullet list', () => {
      const ast = parseMarkdownToAst('- a\n- b\n- c');
      const l = ast.children[0]!;
      expect(l.kind).toBe('list');
      if (l.kind === 'list') {
        expect(l.listKind).toBe('bullet');
        expect(l.items.length).toBe(3);
      }
    });

    it('ordered list', () => {
      const ast = parseMarkdownToAst('1. a\n2. b');
      const l = ast.children[0]!;
      expect(l.kind).toBe('list');
      if (l.kind === 'list') {
        expect(l.listKind).toBe('ordered');
        expect(l.items.length).toBe(2);
      }
    });

    it('nested list', () => {
      const ast = parseMarkdownToAst('- outer\n  - inner\n  - inner2\n- outer2');
      const l = ast.children[0]!;
      if (l.kind !== 'list') throw new Error('not list');
      expect(l.items.length).toBe(2);
      // inner list は first item の children に存在
      const firstItem = l.items[0]!;
      const innerList = firstItem.children.find((c) => c.kind === 'list');
      expect(innerList).toBeDefined();
    });
  });

  describe('code-block', () => {
    it('fenced code with lang', () => {
      const ast = parseMarkdownToAst('```ts\nconst x = 1;\n```');
      const cb = ast.children[0]!;
      expect(cb.kind).toBe('code-block');
      if (cb.kind === 'code-block') {
        expect(cb.lang).toBe('ts');
        expect(cb.code).toContain('const x = 1;');
      }
    });

    it('fenced code without lang', () => {
      const ast = parseMarkdownToAst('```\nplain\n```');
      const cb = ast.children[0]!;
      if (cb.kind !== 'code-block') throw new Error('not code-block');
      expect(cb.lang).toBeNull();
    });
  });

  describe('quote', () => {
    it('blockquote with paragraph', () => {
      const ast = parseMarkdownToAst('> A quote\n> continued');
      const q = ast.children[0]!;
      expect(q.kind).toBe('quote');
      if (q.kind === 'quote') {
        expect(q.children.length).toBeGreaterThan(0);
      }
    });
  });

  describe('table', () => {
    it('GFM table with header', () => {
      const md = '| A | B |\n|---|---|\n| 1 | 2 |';
      const ast = parseMarkdownToAst(md);
      const t = ast.children[0]!;
      expect(t.kind).toBe('table');
      if (t.kind === 'table') {
        expect(t.rows.length).toBe(2);
        expect(t.rows[0]?.isHeader).toBe(true);
        expect(t.rows[0]?.cells.length).toBe(2);
      }
    });
  });

  describe('hr / break', () => {
    it('--- → rule break', () => {
      const ast = parseMarkdownToAst('A\n\n---\n\nB');
      const breakNode = ast.children.find((c) => c.kind === 'break');
      expect(breakNode).toBeDefined();
      if (breakNode?.kind === 'break') {
        expect(breakNode.breakKind).toBe('rule');
      }
    });
  });

  describe('frontmatter', () => {
    it('YAML frontmatter を globals + vars に抽出', () => {
      const md = `---\nwriting: vertical\ndirection: rtl\nalign: center\nnotation: pkc-markdown-1.0\nvars:\n  x: 198,853\n  name: Alice\n---\n\n# Body`;
      const ast = parseMarkdownToAst(md);
      expect(ast.writing).toBe('vertical');
      expect(ast.direction).toBe('rtl');
      expect(ast.align).toBe('center');
      expect(ast.notation).toBe('pkc-markdown-1.0');
      expect(ast.vars?.x).toBe('198,853');
      expect(ast.vars?.name).toBe('Alice');
      // body は heading だけ残る
      expect(ast.children.length).toBe(1);
      expect(ast.children[0]?.kind).toBe('heading');
    });

    it('frontmatter なしでも parse 可能', () => {
      const ast = parseMarkdownToAst('# Just body');
      expect(ast.writing).toBeUndefined();
      expect(ast.children.length).toBe(1);
    });
  });

  describe('position info', () => {
    it('heading に pos.line が転記される', () => {
      const ast = parseMarkdownToAst('# A\n\n# B');
      const h1 = ast.children[0]!;
      const h2 = ast.children[1]!;
      expect(h1.pos?.line).toBe(1);
      expect(h2.pos?.line).toBe(3);
    });
  });

  describe('document root', () => {
    it('空 input → empty children', () => {
      const ast = parseMarkdownToAst('');
      expect(ast.kind).toBe('document');
      expect(ast.children.length).toBe(0);
    });

    it('mixed content(heading + paragraph + list + code-block)', () => {
      const md = `# Title\n\nparagraph text\n\n- a\n- b\n\n\`\`\`\ncode\n\`\`\``;
      const ast = parseMarkdownToAst(md);
      expect(ast.children.length).toBe(4);
      expect(ast.children[0]?.kind).toBe('heading');
      expect(ast.children[1]?.kind).toBe('paragraph');
      expect(ast.children[2]?.kind).toBe('list');
      expect(ast.children[3]?.kind).toBe('code-block');
    });
  });
});
