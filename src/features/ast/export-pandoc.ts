/**
 * PR-2BB(2026-05-12、reform Phase 3 Block C 4/4):AstDocument → Pandoc
 * Native JSON 雛形。可換世界拡大の出口。
 *
 * 設計(`docs/development/completed/ir-migration-plan-2026-05.md` §3 PR-2BB):
 *   - `AstDocument` を Pandoc AST(`Pandoc` / `Meta` / `Block` / `Inline`)に変換
 *   - 出力 JSON は `pandoc --from json --to docx/pptx/pdf/latex/...` で消費可能
 *   - 本 PR は **最頻使用 kind のみ網羅**、完全実装は future wave
 *
 * Pandoc Native JSON 構造(v1.22+):
 *   ```json
 *   {
 *     "pandoc-api-version": [1, 23, 1],
 *     "meta": {},
 *     "blocks": [
 *       { "t": "Header", "c": [1, ["id", [], []], [{ "t": "Str", "c": "Title" }]] },
 *       { "t": "Para", "c": [{ "t": "Str", "c": "paragraph" }] }
 *     ]
 *   }
 *   ```
 *
 * 完全実装は future wave で対応:
 *   - PKC 固有 inline / block(`mark` / `em-dot` / `:::section`)→ Pandoc Span /
 *     RawBlock / Div への mapping
 *   - 数式(`math-inline` / `math-block`)→ Math
 *   - 画像 / リンクの相対パス解決
 */
import type {
  AstAttrs,
  AstBlock,
  AstDocument,
  AstInline,
} from '@core/ast/index';

/** Pandoc API バージョン(v3.5 series 互換)。 */
const PANDOC_API_VERSION = [1, 23, 1] as const;

type PandocAttrTuple = [string, string[], [string, string][]];

export interface PandocNode {
  t: string;
  c?: unknown;
}

export interface PandocDocument {
  'pandoc-api-version': readonly [number, number, number];
  meta: Record<string, PandocNode>;
  blocks: PandocNode[];
}

function attrsToPandoc(attrs?: AstAttrs): PandocAttrTuple {
  if (!attrs) return ['', [], []];
  const id = attrs.id ?? '';
  const classes = attrs.classes ? [...attrs.classes] : [];
  const kvs: [string, string][] = [];
  if (attrs.kvs) {
    for (const [k, v] of Object.entries(attrs.kvs)) {
      if (typeof v === 'string') kvs.push([k, v]);
      else if (v === true) kvs.push([k, 'true']);
    }
  }
  return [id, classes, kvs];
}

function inlineToPandoc(node: AstInline): PandocNode[] {
  switch (node.kind) {
    case 'text': {
      // text を space で split、各 word を Str、間に Space を挿入(Pandoc 規約)
      const parts = node.value.split(/(\s+)/);
      const out: PandocNode[] = [];
      for (const p of parts) {
        if (p === '') continue;
        if (/^\s+$/.test(p)) {
          out.push({ t: 'Space' });
        } else {
          out.push({ t: 'Str', c: p });
        }
      }
      return out;
    }
    case 'strong':
      return [{ t: 'Strong', c: inlinesToPandoc(node.children) }];
    case 'emphasis':
      return [{ t: 'Emph', c: inlinesToPandoc(node.children) }];
    case 'strike':
      return [{ t: 'Strikeout', c: inlinesToPandoc(node.children) }];
    case 'inline-code':
      return [{ t: 'Code', c: [attrsToPandoc(), node.value] }];
    case 'link':
      return [
        {
          t: 'Link',
          c: [
            attrsToPandoc(),
            inlinesToPandoc(node.children),
            [node.href, ''],
          ],
        },
      ];
    case 'image':
      return [
        {
          t: 'Image',
          c: [
            attrsToPandoc(),
            node.alt ? [{ t: 'Str', c: node.alt }] : [],
            [node.src, ''],
          ],
        },
      ];
    case 'sup':
      return [{ t: 'Superscript', c: inlinesToPandoc(node.children) }];
    case 'sub':
      return [{ t: 'Subscript', c: inlinesToPandoc(node.children) }];
    case 'math-inline':
      return [{ t: 'Math', c: [{ t: 'InlineMath' }, node.src] }];
    case 'mark':
      // Pandoc に直接対応なし、Span class="pkc-mark" でフォールバック
      return [
        {
          t: 'Span',
          c: [
            ['', ['pkc-mark', ...(node.color ? [`pkc-mark-${node.color}`] : [])], []],
            inlinesToPandoc(node.children),
          ],
        },
      ];
    case 'em-dot':
      return [
        {
          t: 'Span',
          c: [['', ['pkc-em-dot'], []], inlinesToPandoc(node.children)],
        },
      ];
    case 'span':
      return [{ t: 'Span', c: [attrsToPandoc(node.attrs), inlinesToPandoc(node.children)] }];
    case 'ruby':
      // Pandoc ruby は format 依存(docx OK、md は不可)。Span class で fallback
      return [
        {
          t: 'Span',
          c: [
            ['', ['pkc-ruby'], [['rt', node.rt]]],
            [{ t: 'Str', c: node.base }],
          ],
        },
      ];
    case 'var':
      return [{ t: 'Str', c: `{{${node.path}}}` }];
    case 'card':
    case 'embed':
    case 'auto-ref':
    case 'comment-inline':
      // PKC 固有、render に出さない form は Str fallback
      return [{ t: 'Str', c: '' }];
    case 'footnote-ref':
      // Pandoc Note は inline-level footnote(`{ t: 'Note', c: [Block...] }`)。
      // Pandoc 仕様では本文末参照 ID は `Note` の中身に block を直接埋め込む形。
      // Pandoc 側で BibTeX / docx 等の export 時に footnote として処理される。
      return [{ t: 'Note', c: [] }];
    case 'opaque-inline':
      // Pandoc raw inline:`{ t: 'RawInline', c: [format, raw] }`。
      // sourceFormat が 'html' なら Pandoc も HTML として認識。
      return [{ t: 'RawInline', c: [node.sourceFormat, node.original] }];
    default: {
      const _exhaustive: never = node;
      void _exhaustive;
      return [];
    }
  }
}

function inlinesToPandoc(inlines: readonly AstInline[]): PandocNode[] {
  return inlines.flatMap(inlineToPandoc);
}

function blockToPandoc(node: AstBlock): PandocNode {
  switch (node.kind) {
    case 'heading':
      return {
        t: 'Header',
        c: [node.level, attrsToPandoc(node.attrs), inlinesToPandoc(node.children)],
      };
    case 'paragraph':
      return { t: 'Para', c: inlinesToPandoc(node.children) };
    case 'quote':
      return { t: 'BlockQuote', c: blocksToPandoc(node.children) };
    case 'list':
      if (node.listKind === 'ordered') {
        return {
          t: 'OrderedList',
          c: [
            [node.start ?? 1, { t: 'Decimal' }, { t: 'Period' }],
            node.items.map((it) => blocksToPandoc(it.children)),
          ],
        };
      }
      return {
        t: 'BulletList',
        c: node.items.map((it) => blocksToPandoc(it.children)),
      };
    case 'table': {
      // Pandoc Table は複雑。簡易版で Header + Body をフラット rows に投影
      const headerRows = node.rows.filter((r) => r.isHeader);
      const bodyRows = node.rows.filter((r) => !r.isHeader);
      const colCount = node.rows[0]?.cells.length ?? 0;
      const alignments = Array.from({ length: colCount }, () => ({ t: 'AlignDefault' }));
      const colWidths = Array.from({ length: colCount }, () => 0);
      const headerRow = headerRows[0]
        ? headerRows[0].cells.map((c) => [{ t: 'Plain', c: inlinesToPandoc(c.children) }])
        : Array.from({ length: colCount }, () => []);
      const bodyData = bodyRows.map((r) =>
        r.cells.map((c) => [{ t: 'Plain', c: inlinesToPandoc(c.children) }]),
      );
      return {
        t: 'Table',
        c: [attrsToPandoc(), [], alignments, colWidths, headerRow, bodyData],
      };
    }
    case 'code-block':
      return {
        t: 'CodeBlock',
        c: [
          ['', node.lang ? [node.lang] : [], []],
          node.code,
        ],
      };
    case 'break':
      if (node.breakKind === 'rule') return { t: 'HorizontalRule' };
      return {
        t: 'RawBlock',
        c: ['html', `<hr class="pkc-section-break" data-pkc-role="${node.role ?? ''}">`],
      };
    case 'figure': {
      // Pandoc は figure を Para+Image で表現(v3.x で Figure block 追加されるが互換性のため Para fallback)
      return {
        t: 'Div',
        c: [['', ['pkc-figure'], []], blocksToPandoc(node.children)],
      };
    }
    case 'section':
      return {
        t: 'Div',
        c: [
          ['', ['pkc-section-callout', `pkc-section-${node.role}`], [['role', node.role]]],
          blocksToPandoc(node.children),
        ],
      };
    case 'if-block':
      return {
        t: 'Div',
        c: [
          ['', ['pkc-if-block'], [['format', node.format]]],
          blocksToPandoc(node.children),
        ],
      };
    case 'comment-block':
      return { t: 'Null' };
    case 'blank':
      return { t: 'Para', c: [] };
    case 'math-block':
      return {
        t: 'Para',
        c: [{ t: 'Math', c: [{ t: 'DisplayMath' }, node.src] }],
      };
    case 'definition-list':
      // Pandoc DefinitionList:`{ t: 'DefinitionList', c: [[Term, [[Block]]]] }`
      return {
        t: 'DefinitionList',
        c: node.items.map((it) => [
          inlinesToPandoc(it.term),
          [blocksToPandoc(it.description)],
        ]),
      };
    case 'opaque-block':
      // Pandoc RawBlock:`{ t: 'RawBlock', c: [format, raw] }`
      return { t: 'RawBlock', c: [node.sourceFormat, node.original] };
    case 'code-render':
      return {
        t: 'CodeBlock',
        c: [
          ['', [`pkc-render-${node.lang}`], []],
          node.source,
        ],
      };
    default: {
      const _exhaustive: never = node;
      void _exhaustive;
      return { t: 'Null' };
    }
  }
}

function blocksToPandoc(blocks: readonly AstBlock[]): PandocNode[] {
  return blocks.map(blockToPandoc);
}

/**
 * `AstDocument` を Pandoc Native JSON 形に変換。
 *
 * 出力 JSON は `pandoc --from json --to docx/pptx/pdf/latex/markdown/html/...`
 * で消費可能。本実装は雛形(最頻使用 kind のみ網羅)、完全実装は future wave。
 *
 * @param ast `parseMarkdownToAst` or `canonicalize(...)` の出力
 * @returns Pandoc Document(JSON serializable)
 */
export function astToPandocNative(ast: AstDocument): PandocDocument {
  const meta: Record<string, PandocNode> = {};
  if (ast.notation) {
    meta.notation = { t: 'MetaString', c: ast.notation };
  }
  if (ast.writing) {
    meta.writing = { t: 'MetaString', c: ast.writing };
  }
  if (ast.direction) {
    meta.direction = { t: 'MetaString', c: ast.direction };
  }
  if (ast.align) {
    meta.align = { t: 'MetaString', c: ast.align };
  }
  if (ast.vars && Object.keys(ast.vars).length > 0) {
    const varsMap: Record<string, PandocNode> = {};
    for (const [k, v] of Object.entries(ast.vars)) {
      varsMap[k] = { t: 'MetaString', c: v };
    }
    meta.vars = { t: 'MetaMap', c: varsMap };
  }
  return {
    'pandoc-api-version': PANDOC_API_VERSION,
    meta,
    blocks: blocksToPandoc(ast.children),
  };
}
