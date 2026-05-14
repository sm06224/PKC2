/**
 * PR-2Z(2026-05-12、reform Phase 3 Block C 2/4):`AstDocument` → HTML render
 * 実装。PR-2Y parse の出力面。`renderMarkdown` の equivalence test の
 * 対比対象。
 *
 * 設計(`docs/development/completed/ir-migration-plan-2026-05.md` §3 PR-2Z):
 *   - AstDocument を再帰的に traverse
 *   - 各 kind を HTML element にマップ
 *   - globals を `data-pkc-*` attr で root に転記(本 PR では document 全体
 *     wrap までは行わない、`renderMarkdown` の inner と等価に保つ)
 *   - vars 未定義は `<span class="pkc-variable-undefined">`(本 PR では未着手、
 *     PR-2AA で `renderMarkdown` switch 時に経路統合)
 *   - position を `data-pkc-source-line` attr に転記(`opts.sourceLineAnchors`
 *     有効時)
 *
 * 本 PR の scope:
 *   - PR-2Y で cover した commonmark + GFM core node を HTML に確実 render
 *   - PKC 固有 kind(em-dot / mark / :::section / :::quote 等)は段階追加
 *   - 未対応 kind は `<!-- TODO -->` comment で残置(意図的 loss を可視化)
 */
import type {
  AstAttrs,
  AstBlock,
  AstDocument,
  AstInline,
  AstListItem,
  AstTableRow,
} from '@core/ast/index';
import { escapeHtml, escapeAttr } from '@core/escape';

export interface RenderOptions {
  /** `data-pkc-source-line` attr を block element に転記する。 */
  sourceLineAnchors?: boolean;
  /** トップレベル wrap("article" / "body" / "main" / null = wrap なし)。 */
  rootTag?: 'article' | 'body' | 'main' | null;
}

function attrsToString(attrs: AstAttrs | undefined): string {
  if (!attrs) return '';
  const parts: string[] = [];
  if (attrs.id) parts.push(`id="${escapeAttr(attrs.id)}"`);
  if (attrs.classes.length > 0) {
    parts.push(`class="${attrs.classes.map(escapeAttr).join(' ')}"`);
  }
  for (const [k, v] of Object.entries(attrs.kvs)) {
    if (!/^[A-Za-z_][\w-]*$/.test(k)) continue;
    if (typeof v === 'boolean') {
      if (v) parts.push(`data-${k}="true"`);
    } else {
      parts.push(`data-${k}="${escapeAttr(v)}"`);
    }
  }
  return parts.length === 0 ? '' : ' ' + parts.join(' ');
}

function sourceLineAttr(block: AstBlock, opts: RenderOptions): string {
  if (!opts.sourceLineAnchors || !block.pos) return '';
  return ` data-pkc-source-line="${block.pos.line - 1}"`; // 0-based に戻す(既存 renderMarkdown と合わせる)
}

function renderInline(inlines: readonly AstInline[]): string {
  return inlines.map((node) => renderInlineNode(node)).join('');
}

function renderInlineNode(node: AstInline): string {
  switch (node.kind) {
    case 'text':
      return escapeHtml(node.value);
    case 'strong':
      return `<strong>${renderInline(node.children)}</strong>`;
    case 'emphasis':
      return `<em>${renderInline(node.children)}</em>`;
    case 'strike':
      return `<s>${renderInline(node.children)}</s>`;
    case 'inline-code':
      return `<code>${escapeHtml(node.value)}</code>`;
    case 'mark': {
      const colorClass = node.color ? ` class="pkc-mark-${escapeAttr(node.color)}"` : '';
      return `<mark${colorClass}>${renderInline(node.children)}</mark>`;
    }
    case 'em-dot':
      return `<em class="pkc-em-dot">${renderInline(node.children)}</em>`;
    case 'ruby':
      return `<ruby>${escapeHtml(node.base)}<rt>${escapeHtml(node.rt)}</rt></ruby>`;
    case 'sup':
      return `<sup>${renderInline(node.children)}</sup>`;
    case 'sub':
      return `<sub>${renderInline(node.children)}</sub>`;
    case 'span':
      return `<span${attrsToString(node.attrs)}>${renderInline(node.children)}</span>`;
    case 'link': {
      const titleAttr = ''; // PR-2Y では title 抽出未実装
      const linkKindClass = ` class="pkc-link-${escapeAttr(node.linkKind)}"`;
      return `<a href="${escapeAttr(node.href)}"${linkKindClass}${titleAttr}>${renderInline(node.children)}</a>`;
    }
    case 'card':
      return `<span class="pkc-card" data-pkc-ref="${escapeAttr(node.ref)}">${renderInline(node.children)}</span>`;
    case 'embed':
      return `<span class="pkc-embed pkc-embed-${escapeAttr(node.mode)}" data-pkc-ref="${escapeAttr(node.ref)}">${renderInline(node.children)}</span>`;
    case 'image':
      return `<img src="${escapeAttr(node.src)}" alt="${escapeAttr(node.alt)}">`;
    case 'auto-ref':
      return `<a class="pkc-auto-ref" href="#${escapeAttr(node.id)}" data-pkc-ref-id="${escapeAttr(node.id)}"></a>`;
    case 'var':
      return `<span class="pkc-variable" data-pkc-var-path="${escapeAttr(node.path)}">{{${escapeHtml(node.path)}}}</span>`;
    case 'math-inline':
      return `<span class="pkc-math-inline">${escapeHtml(node.src)}</span>`;
    case 'comment-inline':
      return ''; // hidden / footnote は render しない(footnote は後段 wave で promote)
    case 'footnote-ref':
      // PR-2JJ v2 final(2026-05-13、Gemini review 反映):学術用 footnote。
      // `<a class="pkc-footnote-ref" href="#fn-X">` で footnote 定義への jump、
      // CSS で sup スタイル化(後段 wave で sup 化を選択可能)。
      return `<sup class="pkc-footnote-ref"><a href="#fn-${escapeAttr(node.id)}" id="fnref-${escapeAttr(node.id)}">${escapeHtml(node.id)}</a></sup>`;
    case 'opaque-inline':
      // PR-2JJ v2 final(2026-05-13、ChatGPT review 反映):未知構文 preserve。
      // HTML 出力では原文をそのまま埋め込む(format=html なら raw、それ以外は
      // escape して `<span data-pkc-opaque>` で wrap)。
      if (node.sourceFormat === 'html') return node.original;
      return `<span class="pkc-opaque" data-pkc-source-format="${escapeAttr(node.sourceFormat)}">${escapeHtml(node.original)}</span>`;
    case 'citation': {
      // PR-V2(2026-05-14、Gemini review 反映):学術 / 書誌的 inline citation。
      // `<cite class="pkc-citation" data-pkc-cite-id="...">` で BibTeX 連携 +
      // Pandoc citation processor が認識できる minimal HTML。
      const prefix = node.prefix ? escapeHtml(node.prefix) + ' ' : '';
      const suffix = node.suffix ? ' ' + escapeHtml(node.suffix) : '';
      const modeClass = node.mode ? ` pkc-citation-${escapeAttr(node.mode)}` : '';
      return `<cite class="pkc-citation${modeClass}" data-pkc-cite-id="${escapeAttr(node.id)}">${prefix}@${escapeHtml(node.id)}${suffix}</cite>`;
    }
    default: {
      const unreachable: never = node;
      void unreachable;
      return '';
    }
  }
}

function renderListItem(item: AstListItem): string {
  return `<li>${item.children.map((c) => renderBlock(c, { sourceLineAnchors: false })).join('\n')}</li>`;
}

function renderTableRow(row: AstTableRow): string {
  const cellTag = row.isHeader ? 'th' : 'td';
  const cells = row.cells.map((c) => `<${cellTag}>${renderInline(c.children)}</${cellTag}>`).join('');
  return `<tr>${cells}</tr>`;
}

function renderBlock(block: AstBlock, opts: RenderOptions): string {
  const lineAttr = sourceLineAttr(block, opts);
  switch (block.kind) {
    case 'heading': {
      const tag = `h${block.level}`;
      const inner = renderInline(block.children);
      return `<${tag}${attrsToString(block.attrs)}${lineAttr}>${inner}</${tag}>`;
    }
    case 'paragraph': {
      const inner = renderInline(block.children);
      const alignAttr = block.align ? ` data-pkc-align="${escapeAttr(block.align)}"` : '';
      const indentAttr = block.indent ? ` data-pkc-indent="${block.indent}"` : '';
      return `<p${attrsToString(block.attrs)}${lineAttr}${alignAttr}${indentAttr}>${inner}</p>`;
    }
    case 'quote': {
      const inner = block.children.map((c) => renderBlock(c, opts)).join('\n');
      // citation attrs は将来 figure caption 経路で expose(本 PR は children のみ)
      return `<blockquote${lineAttr}>${inner}</blockquote>`;
    }
    case 'list': {
      const tag = block.listKind === 'ordered' ? 'ol' : 'ul';
      const items = block.items.map((it) => renderListItem(it)).join('\n');
      return `<${tag}${lineAttr}>${items}</${tag}>`;
    }
    case 'table': {
      const headerRows = block.rows.filter((r) => r.isHeader);
      const bodyRows = block.rows.filter((r) => !r.isHeader);
      let inner = '';
      if (headerRows.length > 0) {
        inner += `<thead>${headerRows.map(renderTableRow).join('')}</thead>`;
      }
      if (bodyRows.length > 0) {
        inner += `<tbody>${bodyRows.map(renderTableRow).join('')}</tbody>`;
      }
      return `<table${lineAttr}>${inner}</table>`;
    }
    case 'code-block': {
      const langAttr = block.lang ? ` data-pkc-lang="${escapeAttr(block.lang)}"` : '';
      const codeClass = block.lang ? ` class="language-${escapeAttr(block.lang)}"` : '';
      return `<pre${lineAttr}${langAttr}><code${codeClass}>${escapeHtml(block.code)}</code></pre>`;
    }
    case 'code-render':
      return `<div class="pkc-code-render pkc-code-render-${escapeAttr(block.lang)}" data-pkc-render-lang="${escapeAttr(block.lang)}"${lineAttr}>${escapeHtml(block.source)}</div>`;
    case 'break': {
      if (block.breakKind === 'rule') return `<hr${lineAttr}>`;
      const roleAttr = block.role ? ` data-pkc-role="${escapeAttr(block.role)}"` : '';
      return `<hr class="pkc-section-break"${roleAttr}${lineAttr}>`;
    }
    case 'figure': {
      const inner = block.children.map((c) => renderBlock(c, opts)).join('\n');
      const captionHtml = block.caption ? `<figcaption>${renderInline(block.caption)}</figcaption>` : '';
      return `<figure class="pkc-figure"${lineAttr}>${inner}${captionHtml}</figure>`;
    }
    case 'section': {
      const inner = block.children.map((c) => renderBlock(c, opts)).join('\n');
      return `<section class="pkc-section-callout pkc-section-${escapeAttr(block.role)}" data-pkc-role="${escapeAttr(block.role)}"${lineAttr}>${inner}</section>`;
    }
    case 'if-block': {
      const inner = block.children.map((c) => renderBlock(c, opts)).join('\n');
      return `<div class="pkc-if-block" data-pkc-if-format="${escapeAttr(block.format)}"${lineAttr}>${inner}</div>`;
    }
    case 'comment-block':
      return ''; // render に出ない
    case 'blank':
      return `<div class="pkc-blank-line" data-pkc-blank-count="${block.count}"${lineAttr}></div>`;
    case 'math-block':
      return `<div class="pkc-math-block"${lineAttr}>${escapeHtml(block.src)}</div>`;
    case 'definition-list': {
      // PR-2JJ v2 final(2026-05-13、Gemini review 反映):仕様書 / 辞書的 dl。
      const items = block.items
        .map((it) => {
          const dt = `<dt>${renderInline(it.term)}</dt>`;
          const dd = `<dd>${it.description.map((b) => renderBlock(b, opts)).join('\n')}</dd>`;
          return `${dt}\n${dd}`;
        })
        .join('\n');
      return `<dl class="pkc-definition-list"${lineAttr}>${items}</dl>`;
    }
    case 'opaque-block':
      // PR-2JJ v2 final(2026-05-13、ChatGPT review 反映):未知構文 preserve。
      if (block.sourceFormat === 'html') return block.original;
      return `<pre class="pkc-opaque-block" data-pkc-source-format="${escapeAttr(block.sourceFormat)}"${lineAttr}>${escapeHtml(block.original)}</pre>`;
    default: {
      const unreachable: never = block;
      void unreachable;
      return '';
    }
  }
}

/**
 * AstDocument を HTML 文字列に render。
 *
 * @param ast `parseMarkdownToAst` の出力
 * @param opts RenderOptions
 * @returns HTML 文字列(rootTag 未指定なら children の連結のみ)
 */
export function renderAstToHtml(ast: AstDocument, opts: RenderOptions = {}): string {
  const inner = ast.children.map((c) => renderBlock(c, opts)).join('\n');
  if (!opts.rootTag) return inner;
  const rootAttrs: string[] = [];
  if (ast.writing) rootAttrs.push(`data-pkc-writing="${ast.writing}"`);
  if (ast.direction) rootAttrs.push(`data-pkc-direction="${ast.direction}"`);
  if (ast.align) rootAttrs.push(`data-pkc-align="${ast.align}"`);
  if (ast.notation) rootAttrs.push(`data-pkc-notation="${escapeAttr(ast.notation)}"`);
  const attrStr = rootAttrs.length === 0 ? '' : ' ' + rootAttrs.join(' ');
  return `<${opts.rootTag}${attrStr}>${inner}</${opts.rootTag}>`;
}
