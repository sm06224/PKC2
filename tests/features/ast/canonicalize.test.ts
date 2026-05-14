/**
 * PR-2BB(2026-05-12):`canonicalize` の idempotent + 正規化動作 test。
 */
import { describe, it, expect } from 'vitest';
import { canonicalize } from '@features/ast/canonicalize';
import { parseMarkdownToAst } from '@features/ast/parse';
import type { AstDocument } from '@core/ast/index';

describe('PR-2BB canonicalize', () => {
  it('idempotent:canonicalize(canonicalize(x)) === canonicalize(x)', () => {
    const inputs = [
      '# Title\n\nparagraph with **bold** and _em_',
      '- a\n- b\n- c',
      '| A | B |\n|---|---|\n| 1 | 2 |',
      '[link](https://example.com)',
      '```ts\nconst x = 1;\n```',
    ];
    for (const md of inputs) {
      const ast = parseMarkdownToAst(md);
      const once = canonicalize(ast);
      const twice = canonicalize(once);
      expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
    }
  });

  it('link href の hash fragment が lower-case 化', () => {
    const ast: AstDocument = {
      kind: 'document',
      children: [
        {
          kind: 'paragraph',
          children: [
            {
              kind: 'link',
              href: '/page#SectionAbc',
              linkKind: 'permalink',
              children: [{ kind: 'text', value: 'link' }],
            },
          ],
        },
      ],
    };
    const canon = canonicalize(ast);
    const p = canon.children[0]!;
    if (p.kind === 'paragraph') {
      const l = p.children[0]!;
      if (l.kind === 'link') {
        expect(l.href).toBe('/page#sectionabc');
      }
    }
  });

  it('inline-code value の両端 whitespace を trim', () => {
    const ast: AstDocument = {
      kind: 'document',
      children: [
        {
          kind: 'paragraph',
          children: [
            { kind: 'inline-code', value: '  code  ' },
          ],
        },
      ],
    };
    const canon = canonicalize(ast);
    const p = canon.children[0]!;
    if (p.kind === 'paragraph') {
      const c = p.children[0]!;
      if (c.kind === 'inline-code') expect(c.value).toBe('code');
    }
  });

  it('paragraph children の空 text node を除去', () => {
    const ast: AstDocument = {
      kind: 'document',
      children: [
        {
          kind: 'paragraph',
          children: [
            { kind: 'text', value: '' },
            { kind: 'text', value: 'A' },
            { kind: 'text', value: '' },
            { kind: 'strong', children: [{ kind: 'text', value: 'B' }] },
            { kind: 'text', value: '' },
          ],
        },
      ],
    };
    const canon = canonicalize(ast);
    const p = canon.children[0]!;
    if (p.kind === 'paragraph') {
      expect(p.children.length).toBe(2);
      expect(p.children[0]).toEqual({ kind: 'text', value: 'A' });
      expect(p.children[1]?.kind).toBe('strong');
    }
  });

  it('連続 text node を merge', () => {
    const ast: AstDocument = {
      kind: 'document',
      children: [
        {
          kind: 'paragraph',
          children: [
            { kind: 'text', value: 'A' },
            { kind: 'text', value: 'B' },
            { kind: 'text', value: 'C' },
          ],
        },
      ],
    };
    const canon = canonicalize(ast);
    const p = canon.children[0]!;
    if (p.kind === 'paragraph') {
      expect(p.children.length).toBe(1);
      expect(p.children[0]).toEqual({ kind: 'text', value: 'ABC' });
    }
  });

  it('空 list-item を除去', () => {
    const ast: AstDocument = {
      kind: 'document',
      children: [
        {
          kind: 'list',
          listKind: 'bullet',
          items: [
            { kind: 'list-item', children: [{ kind: 'paragraph', children: [{ kind: 'text', value: 'A' }] }] },
            { kind: 'list-item', children: [] }, // empty
            { kind: 'list-item', children: [{ kind: 'paragraph', children: [{ kind: 'text', value: 'B' }] }] },
          ],
        },
      ],
    };
    const canon = canonicalize(ast);
    const l = canon.children[0]!;
    if (l.kind === 'list') {
      expect(l.items.length).toBe(2);
    }
  });

  it('table cells の inline children も正規化', () => {
    const ast: AstDocument = {
      kind: 'document',
      children: [
        {
          kind: 'table',
          rows: [
            {
              kind: 'table-row',
              cells: [
                {
                  kind: 'table-cell',
                  children: [
                    { kind: 'text', value: 'A' },
                    { kind: 'text', value: 'B' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const canon = canonicalize(ast);
    const t = canon.children[0]!;
    if (t.kind === 'table') {
      const cell = t.rows[0]?.cells[0];
      expect(cell?.children.length).toBe(1);
      expect(cell?.children[0]).toEqual({ kind: 'text', value: 'AB' });
    }
  });

  it('section / quote / if-block の inner block 再帰正規化', () => {
    const ast: AstDocument = {
      kind: 'document',
      children: [
        {
          kind: 'section',
          role: 'note',
          children: [
            {
              kind: 'paragraph',
              children: [
                { kind: 'text', value: 'A' },
                { kind: 'text', value: 'B' },
              ],
            },
          ],
        },
      ],
    };
    const canon = canonicalize(ast);
    const s = canon.children[0]!;
    if (s.kind === 'section') {
      const p = s.children[0]!;
      if (p.kind === 'paragraph') {
        expect(p.children.length).toBe(1);
        expect(p.children[0]).toEqual({ kind: 'text', value: 'AB' });
      }
    }
  });
});
