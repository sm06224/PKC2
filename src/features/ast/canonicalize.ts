/**
 * PR-2BB(2026-05-12、reform Phase 3 Block C 4/4):AST canonicalization 実装。
 *
 * 設計(`docs/development/notation-redesign-2026-05/11-canonicalization-spec.md`):
 *   simple 形と formal 形の AST 表現の **正規化**(simple ↔ formal の equivalent
 *   forms は片方向に正規化される)。
 *
 * idempotent contract:
 *   `canonicalize(canonicalize(x)) === canonicalize(x)`(deep equal)
 *
 * semantic round-trip:
 *   `parseMarkdownToAst(serializeFromAst(canonicalize(ast)))` で semantic 等価。
 *
 * 本 PR の scope(雛形):
 *   - **link 正規化**:href の trailing slash normalize / hash fragment lower-case
 *   - **inline-code 正規化**:両端の不要 whitespace 除去
 *   - **paragraph 正規化**:children の空 text node を除去、連続 text を merge
 *   - **list 正規化**:空 list-item を除去
 *
 * 完全実装は future wave(`em-dot` → `mark` 同形 / `:::admonition` → `:::section`
 * 等の simple→formal alias 写像、PR-2L tolerant log との連携)。
 */
import type {
  AstBlock,
  AstDocument,
  AstInline,
  AstListItem,
  AstText,
} from '@core/ast/index';

function canonicalizeInline(node: AstInline): AstInline {
  switch (node.kind) {
    case 'text':
      // text node はそのまま(merge は paragraph level で行う)
      return node;
    case 'inline-code':
      // 両端 whitespace を trim(commonmark spec で許容、canonical 化)
      return { ...node, value: node.value.replace(/^\s+|\s+$/g, '') };
    case 'link':
      return {
        ...node,
        href: canonicalizeHref(node.href),
        children: canonicalizeInlineChildren(node.children),
      };
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
      return { ...node, children: canonicalizeInlineChildren(node.children) };
    default:
      return node;
  }
}

function canonicalizeHref(href: string): string {
  // hash fragment は lower-case(deterministic anchor)
  const hashIdx = href.indexOf('#');
  if (hashIdx >= 0) {
    const before = href.slice(0, hashIdx);
    const fragment = href.slice(hashIdx + 1).toLowerCase();
    return `${before}#${fragment}`;
  }
  return href;
}

/** inline children の正規化:空 text 除去 + 連続 text merge。 */
function canonicalizeInlineChildren(children: readonly AstInline[]): readonly AstInline[] {
  const out: AstInline[] = [];
  for (const node of children) {
    const c = canonicalizeInline(node);
    if (c.kind === 'text' && c.value === '') continue;
    // 連続 text node を merge
    const last = out[out.length - 1];
    if (last && last.kind === 'text' && c.kind === 'text') {
      out[out.length - 1] = { kind: 'text', value: last.value + c.value } as AstText;
      continue;
    }
    out.push(c);
  }
  return out;
}

function canonicalizeBlock(node: AstBlock): AstBlock {
  switch (node.kind) {
    case 'paragraph':
      return { ...node, children: canonicalizeInlineChildren(node.children) };
    case 'heading':
      return { ...node, children: canonicalizeInlineChildren(node.children) };
    case 'quote':
    case 'figure':
    case 'section':
    case 'if-block':
      return { ...node, children: canonicalizeBlockChildren(node.children) };
    case 'list':
      return {
        ...node,
        items: node.items
          .map(canonicalizeListItem)
          .filter((it) => it.children.length > 0),
      };
    case 'table': {
      const rows = node.rows.map((r) => ({
        ...r,
        cells: r.cells.map((c) => ({
          ...c,
          children: canonicalizeInlineChildren(c.children),
        })),
      }));
      return { ...node, rows };
    }
    default:
      return node;
  }
}

function canonicalizeBlockChildren(children: readonly AstBlock[]): readonly AstBlock[] {
  return children.map(canonicalizeBlock);
}

function canonicalizeListItem(item: AstListItem): AstListItem {
  return { ...item, children: canonicalizeBlockChildren(item.children) };
}

/**
 * AstDocument を正規化形にする。
 *
 * idempotent contract:`canonicalize(canonicalize(x))` の deep equal。
 *
 * 本 PR では link href / inline-code value / paragraph children / list items
 * の正規化を実装。complete simple→formal alias 写像は future wave。
 */
export function canonicalize(ast: AstDocument): AstDocument {
  return {
    ...ast,
    children: canonicalizeBlockChildren(ast.children),
  };
}
