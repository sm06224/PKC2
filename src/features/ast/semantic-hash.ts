/**
 * `semanticHash(ast)` — AST の **意味的同一性** を判定する hash。
 *
 * **ChatGPT review(2026-05-13)推奨**:
 * 「semantic 等価」を自然言語で書いてあると将来揉めるので、
 * `semanticHash(rt(ast)) === semanticHash(ast)` を invariant として
 * 数値化する。round-trip 安定性 / canonicalize idempotency の根拠 test に
 * 使える。
 *
 * 含める正規化:
 *   - 空 text node 除去
 *   - 連続 text node merge
 *   - quote depth normalize
 *   - whitespace normalize(連続空白 → 単一空白)
 *   - attrs 順序 normalize(key 名 alphabetical)
 *   - link href trailing slash normalize
 *
 * 含めない(intentional):
 *   - `pos`(source position はメタ情報)
 *   - `astVersion`(schema version も AST 構造の external info)
 *   - footnotes(別 namespace、別途比較)
 *
 * 戻り値は **deterministic な string**(JSON.stringify ベース、key を sort)。
 * 厳密な hash algorithm(SHA / FNV 等)は不要、対応する 2 つの AST から
 * 同じ string が出ることが条件。
 */
import type {
  AstAttrs,
  AstBlock,
  AstDocument,
  AstInline,
} from '@core/ast/index';

export function semanticHash(ast: AstDocument): string {
  const normalized = normalizeDocument(ast);
  return stableStringify(normalized);
}

function normalizeDocument(ast: AstDocument): unknown {
  return {
    kind: 'document',
    writing: ast.writing,
    direction: ast.direction,
    align: ast.align,
    notation: ast.notation,
    vars: ast.vars ? sortObject(ast.vars) : undefined,
    children: ast.children.map(normalizeBlock),
  };
}

function normalizeBlock(block: AstBlock): unknown {
  switch (block.kind) {
    case 'heading':
      return {
        kind: 'heading',
        level: block.level,
        children: mergeInlineText(block.children).map(normalizeInline),
      };
    case 'paragraph': {
      const cleaned = mergeInlineText(block.children).map(normalizeInline);
      return {
        kind: 'paragraph',
        children: cleaned,
        align: block.align,
        indent: block.indent,
      };
    }
    case 'quote':
      return {
        kind: 'quote',
        children: block.children.map(normalizeBlock),
        citation: block.citation ? sortObject(block.citation) : undefined,
      };
    case 'list':
      return {
        kind: 'list',
        listKind: block.listKind,
        start: block.start,
        items: block.items.map((it) => ({
          kind: 'list-item',
          state: it.state,
          children: it.children.map(normalizeBlock),
        })),
      };
    case 'table':
      return {
        kind: 'table',
        align: block.align,
        rows: block.rows.map((r) => ({
          isHeader: r.isHeader,
          cells: r.cells.map((c) => ({
            children: mergeInlineText(c.children).map(normalizeInline),
          })),
        })),
      };
    case 'code-block':
      return {
        kind: 'code-block',
        lang: block.lang,
        code: block.code.replace(/\s+$/, ''),
      };
    case 'code-render':
      return {
        kind: 'code-render',
        lang: block.lang,
        source: block.source.replace(/\s+$/, ''),
      };
    case 'break':
      return { kind: 'break', breakKind: block.breakKind, role: block.role };
    case 'figure':
      return {
        kind: 'figure',
        figureKind: block.figureKind,
        attrs: block.attrs ? normalizeAttrs(block.attrs) : undefined,
        children: block.children.map(normalizeBlock),
        caption: block.caption
          ? mergeInlineText(block.caption).map(normalizeInline)
          : undefined,
      };
    case 'section':
      return {
        kind: 'section',
        role: block.role,
        attrs: block.attrs ? normalizeAttrs(block.attrs) : undefined,
        children: block.children.map(normalizeBlock),
      };
    case 'if-block':
      return {
        kind: 'if-block',
        format: block.format,
        children: block.children.map(normalizeBlock),
      };
    case 'comment-block':
      // source は trim
      return { kind: 'comment-block', source: block.source.trim() };
    case 'blank':
      return { kind: 'blank', count: block.count };
    case 'math-block':
      return { kind: 'math-block', src: block.src.trim() };
    case 'definition-list':
      return {
        kind: 'definition-list',
        items: block.items.map((it) => ({
          term: mergeInlineText(it.term).map(normalizeInline),
          description: it.description.map(normalizeBlock),
        })),
      };
    case 'opaque-block':
      return {
        kind: 'opaque-block',
        sourceFormat: block.sourceFormat,
        original: block.original.trim(),
      };
    default: {
      const _exhaustive: never = block;
      void _exhaustive;
      return null;
    }
  }
}

function normalizeInline(node: AstInline): unknown {
  switch (node.kind) {
    case 'text':
      return { kind: 'text', value: normalizeWhitespace(node.value) };
    case 'inline-code':
      return { kind: 'inline-code', value: node.value };
    case 'strong':
    case 'emphasis':
    case 'strike':
    case 'mark':
    case 'em-dot':
    case 'sup':
    case 'sub':
    case 'span':
    case 'card':
    case 'embed':
    case 'comment-inline':
      return {
        kind: node.kind,
        children: mergeInlineText(node.children).map(normalizeInline),
        // span / mark / em-dot 等は attrs / color / style / mode / ref を含める
        attrs:
          'attrs' in node && node.attrs ? normalizeAttrs(node.attrs) : undefined,
      };
    case 'ruby':
      return { kind: 'ruby', base: node.base, rt: node.rt };
    case 'link':
      return {
        kind: 'link',
        href: normalizeHref(node.href),
        linkKind: node.linkKind,
        children: mergeInlineText(node.children).map(normalizeInline),
      };
    case 'image':
      return { kind: 'image', src: node.src, alt: node.alt };
    case 'auto-ref':
      return { kind: 'auto-ref', id: node.id };
    case 'var':
      return { kind: 'var', path: node.path };
    case 'math-inline':
      return { kind: 'math-inline', src: node.src };
    case 'footnote-ref':
      return { kind: 'footnote-ref', id: node.id };
    case 'opaque-inline':
      return {
        kind: 'opaque-inline',
        sourceFormat: node.sourceFormat,
        original: node.original,
      };
    default: {
      const _exhaustive: never = node;
      void _exhaustive;
      return null;
    }
  }
}

/** 連続する text node を merge して空 text を drop。 */
function mergeInlineText(inlines: readonly AstInline[]): AstInline[] {
  const out: AstInline[] = [];
  for (const n of inlines) {
    if (n.kind === 'text') {
      if (n.value === '') continue;
      const last = out[out.length - 1];
      if (last && last.kind === 'text') {
        out[out.length - 1] = { kind: 'text', value: last.value + n.value };
        continue;
      }
    }
    out.push(n);
  }
  return out;
}

function normalizeWhitespace(s: string): string {
  // 連続空白 → 単一 space、両端 trim はせず(意味を保つ)
  return s.replace(/[\s]+/g, ' ');
}

function normalizeHref(href: string): string {
  // hash fragment は lower-case、trailing slash 統一(`canonicalizeHref` と同 spec)
  const hashIdx = href.indexOf('#');
  if (hashIdx >= 0) {
    const before = href.slice(0, hashIdx);
    const fragment = href.slice(hashIdx + 1).toLowerCase();
    return `${before}#${fragment}`;
  }
  return href;
}

function normalizeAttrs(attrs: AstAttrs): unknown {
  return {
    id: attrs.id,
    classes: [...attrs.classes].sort(),
    kvs: sortObject(attrs.kvs),
  };
}

function sortObject<T>(obj: Readonly<Record<string, T>>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const k of Object.keys(obj).sort()) {
    out[k] = obj[k] as T;
  }
  return out;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_k, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(v as Record<string, unknown>).sort()) {
        sorted[k] = (v as Record<string, unknown>)[k];
      }
      return sorted;
    }
    return v;
  });
}
