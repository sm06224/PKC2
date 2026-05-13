/**
 * AST → Markdown renderer(PR-2JJ v2、PR #432 stack)。
 *
 * 設計:
 *   - 2 mode:`'gfm'` = PKC 拡張を剥がして commonmark + GFM 標準にする
 *     (相互運用用)、`'pkc'` = 正規記法 PKC MD で出力(AST round-trip 想定)
 *   - parse → render が text レベルで完全 round-trip する保証は本実装では出さない
 *     (canonicalize を挟めば semantic round-trip は近似可能)
 *   - 出力は **string**(JSONL ではない、行で構成された MD)
 *
 * Scope(Phase 1):
 *   - inline:text / strong / emphasis / strike / inline-code / link / image /
 *     mark / em-dot / ruby / sup / sub / span / card / embed / auto-ref / var /
 *     math-inline / comment-inline
 *   - block:heading / paragraph / quote / list(bullet / ordered / task) /
 *     table / code-block / code-render / break(rule / page) / figure / section /
 *     if-block / comment-block / blank / math-block
 *   - GFM mode は PKC 固有 marker(mark color / em-dot style / `:::role` /
 *     `%%`comment / `$math$` 等)を構造維持できる範囲で plain GFM に変換
 *
 * Limitation:
 *   - frontmatter / globals(writing / direction / align)は出力 string 先頭に
 *     YAML として出すのみ、AST 内部の attrs(`{...}`)は basic mapping
 *   - 厳密な byte round-trip は保証しない(canonicalize 経由で semantic 一致)
 */

import type {
  AstDocument,
  AstBlock,
  AstInline,
  AstNodeBase,
} from '@core/ast/index';

export interface RenderMarkdownOptions {
  /**
   * 出力形式:
   *   - `'gfm'`(default):commonmark + GFM 標準、PKC 拡張は plain に落とす
   *   - `'pkc'`:正規記法 PKC MD(可換世界の canonical 形)
   */
  mode?: 'gfm' | 'pkc';
}

export function renderAstToMarkdown(
  ast: AstDocument,
  opts: RenderMarkdownOptions = {},
): string {
  const mode = opts.mode ?? 'gfm';
  const lines: string[] = [];

  // YAML frontmatter — globals + vars(両 mode で出す。GFM consumer は無視可)
  const fm: string[] = [];
  if (ast.notation) fm.push(`notation: ${ast.notation}`);
  if (ast.writing) fm.push(`writing: ${ast.writing}`);
  if (ast.direction) fm.push(`direction: ${ast.direction}`);
  if (ast.align) fm.push(`align: ${ast.align}`);
  if (ast.vars && Object.keys(ast.vars).length > 0) {
    fm.push('vars:');
    for (const [k, v] of Object.entries(ast.vars)) {
      fm.push(`  ${k}: ${JSON.stringify(v)}`);
    }
  }
  if (fm.length > 0) {
    lines.push('---');
    lines.push(...fm);
    lines.push('---');
    lines.push('');
  }

  for (const block of ast.children) {
    const out = renderBlock(block, mode);
    if (out.length > 0) {
      lines.push(out);
      lines.push('');
    }
  }

  // 末尾の余分な blank を 1 個にまとめる
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines.join('\n') + '\n';
}

function renderBlock(block: AstBlock, mode: 'gfm' | 'pkc'): string {
  switch (block.kind) {
    case 'heading': {
      const hash = '#'.repeat(block.level);
      return `${hash} ${renderInlines(block.children, mode)}`;
    }
    case 'paragraph': {
      const text = renderInlines(block.children, mode);
      // PKC mode のみ align / indent を `{...}` attrs として出す
      if (mode === 'pkc') {
        const parts: string[] = [];
        if (block.align) parts.push(`align=${block.align}`);
        if (block.indent !== undefined && block.indent !== 0) {
          parts.push(`indent=${block.indent}`);
        }
        if (parts.length > 0) {
          return `${text}\n{${parts.join(' ')}}`;
        }
      }
      return text;
    }
    case 'quote': {
      const inner = block.children
        .map((b) => renderBlock(b, mode))
        .join('\n\n')
        .split('\n')
        .map((l) => (l.length > 0 ? `> ${l}` : '>'))
        .join('\n');
      if (mode === 'pkc' && block.citation && Object.keys(block.citation).length > 0) {
        const cite = Object.entries(block.citation)
          .map(([k, v]) => `${k}="${v}"`)
          .join(' ');
        return `:::quote{${cite}}\n${block.children
          .map((b) => renderBlock(b, mode))
          .join('\n\n')}\n:::`;
      }
      return inner;
    }
    case 'list': {
      const lines: string[] = [];
      let idx = block.start ?? 1;
      for (const item of block.items) {
        let marker: string;
        if (block.listKind === 'ordered') {
          marker = `${idx}.`;
          idx++;
        } else if (block.listKind === 'task') {
          const check = item.state === 'done' ? 'x' : ' ';
          marker = `- [${check}]`;
        } else {
          marker = '-';
        }
        const itemText = item.children
          .map((b) => renderBlock(b, mode))
          .join('\n\n');
        const indented = itemText
          .split('\n')
          .map((l, i) => (i === 0 ? `${marker} ${l}` : `  ${l}`))
          .join('\n');
        lines.push(indented);
      }
      return lines.join('\n');
    }
    case 'table': {
      const lines: string[] = [];
      const aligns = block.align ?? [];
      for (let i = 0; i < block.rows.length; i++) {
        const row = block.rows[i]!;
        const cells = row.cells.map((c) => renderInlines(c.children, mode));
        lines.push(`| ${cells.join(' | ')} |`);
        if (i === 0 && row.isHeader) {
          const sep = row.cells.map((_, ci) => {
            const a = aligns[ci];
            if (a === 'left') return ':---';
            if (a === 'right') return '---:';
            if (a === 'center') return ':---:';
            return '---';
          });
          lines.push(`| ${sep.join(' | ')} |`);
        }
      }
      return lines.join('\n');
    }
    case 'code-block': {
      const lang = block.lang ?? '';
      return '```' + lang + '\n' + block.code + (block.code.endsWith('\n') ? '' : '\n') + '```';
    }
    case 'code-render': {
      // PKC:lang を維持、GFM:同じ書式で OK(rendering hint だけが PKC 拡張)
      return '```' + block.lang + '\n' + block.source + (block.source.endsWith('\n') ? '' : '\n') + '```';
    }
    case 'break': {
      if (block.breakKind === 'page') {
        return mode === 'pkc'
          ? `:::page-break${block.role ? `{role=${block.role}}` : ''}`
          : '---';
      }
      return '---';
    }
    case 'figure': {
      if (mode === 'pkc') {
        const inner = block.children
          .map((b) => renderBlock(b, mode))
          .join('\n\n');
        const cap = block.caption ? `\n${renderInlines(block.caption, mode)}` : '';
        return `:::figure{kind=${block.figureKind}}\n${inner}${cap}\n:::`;
      }
      // GFM:figure marker を剥がして中身 + caption を plain に
      const inner = block.children.map((b) => renderBlock(b, mode)).join('\n\n');
      const cap = block.caption ? `\n\n*${renderInlines(block.caption, mode)}*` : '';
      return inner + cap;
    }
    case 'section': {
      if (mode === 'pkc') {
        const inner = block.children.map((b) => renderBlock(b, mode)).join('\n\n');
        return `:::${block.role}\n${inner}\n:::`;
      }
      // GFM:section marker を剥がして中身だけ(role は失われる)
      return block.children.map((b) => renderBlock(b, mode)).join('\n\n');
    }
    case 'if-block': {
      if (mode === 'pkc') {
        const inner = block.children.map((b) => renderBlock(b, mode)).join('\n\n');
        return `:::if{format=${block.format}}\n${inner}\n:::`;
      }
      // GFM:全 format を素通し(format フィルタは消失)
      return block.children.map((b) => renderBlock(b, mode)).join('\n\n');
    }
    case 'comment-block': {
      // GFM:コメントは完全削除、PKC:`%%%`...`%%%` で復元
      if (mode === 'pkc') {
        return '%%%\n' + block.source + (block.source.endsWith('\n') ? '' : '\n') + '%%%';
      }
      return '';
    }
    case 'blank': {
      // blank node は paragraph 間の空行を制御するためのもの。
      // join('\n\n') で既に空行が入るため、ここでは追加しない。
      return '';
    }
    case 'math-block': {
      return '$$\n' + block.src + (block.src.endsWith('\n') ? '' : '\n') + '$$';
    }
    default: {
      // 未対応 kind は plain stringify(forward compatibility)
      const node = block as AstNodeBase & { kind: string };
      return `<!-- unsupported block kind: ${node.kind} -->`;
    }
  }
}

function renderInlines(
  inlines: readonly AstInline[],
  mode: 'gfm' | 'pkc',
): string {
  return inlines.map((n) => renderInline(n, mode)).join('');
}

function renderInline(node: AstInline, mode: 'gfm' | 'pkc'): string {
  switch (node.kind) {
    case 'text': {
      // GFM mode で AST text node に残った PKC marker を plain 化、その後
      // escape をかける。これにより `==text==` のような raw 文字列が
      // GFM 出力に残らない(parser が PKC 拡張を分解できない symptom 緩和)。
      const cleaned = mode === 'gfm' ? stripPkcMarkersForGfm(node.value) : node.value;
      return escapeText(cleaned);
    }
    case 'strong':
      return `**${renderInlines(node.children, mode)}**`;
    case 'emphasis':
      return `*${renderInlines(node.children, mode)}*`;
    case 'strike':
      return `~~${renderInlines(node.children, mode)}~~`;
    case 'inline-code': {
      // backtick が含まれる場合は二重 backtick で囲む
      const ticks = node.value.includes('`') ? '``' : '`';
      const pad = node.value.startsWith('`') || node.value.endsWith('`') ? ' ' : '';
      return `${ticks}${pad}${node.value}${pad}${ticks}`;
    }
    case 'mark': {
      const inner = renderInlines(node.children, mode);
      if (mode === 'pkc') {
        return `==${node.color ? `[${node.color}]` : ''}${inner}==`;
      }
      // GFM:`<mark>` HTML タグで近似(GFM が許す inline HTML)
      return `<mark>${inner}</mark>`;
    }
    case 'em-dot': {
      const inner = renderInlines(node.children, mode);
      if (mode === 'pkc') {
        const styleAttr = node.style && node.style !== 'dot' ? `[${node.style}]` : '';
        return `..${styleAttr}${inner}..`;
      }
      // GFM:em-dot は強調点だが、近似として emphasis に落とす
      return `*${inner}*`;
    }
    case 'ruby':
      if (mode === 'pkc') return `{${node.base}|${node.rt}}`;
      return `${node.base}<rt>${escapeText(node.rt)}</rt>`;
    case 'sup':
      return `<sup>${renderInlines(node.children, mode)}</sup>`;
    case 'sub':
      return `<sub>${renderInlines(node.children, mode)}</sub>`;
    case 'span': {
      const inner = renderInlines(node.children, mode);
      if (mode === 'pkc' && node.attrs && hasAttrs(node.attrs)) {
        return `[${inner}]${formatAttrs(node.attrs)}`;
      }
      return inner;
    }
    case 'link': {
      const text = renderInlines(node.children, mode);
      // entry / asset / permalink は PKC では pkc:// scheme で復元
      return `[${text}](${node.href})`;
    }
    case 'card': {
      const text = renderInlines(node.children, mode);
      if (mode === 'pkc') return `?[${text}](${node.ref})`;
      return `[${text}](${node.ref})`;
    }
    case 'embed': {
      const text = renderInlines(node.children, mode);
      if (mode === 'pkc') {
        const prefix = node.mode === 'quote' ? '!q' : '!';
        return `${prefix}[${text}](${node.ref})`;
      }
      return `[${text}](${node.ref})`;
    }
    case 'image':
      return `![${escapeText(node.alt)}](${node.src})`;
    case 'auto-ref':
      return `@${node.id}`;
    case 'var':
      if (mode === 'pkc') return `{{${node.path}}}`;
      // GFM:placeholder 文字列を素通し(consumer 側で展開できない)
      return `{{${node.path}}}`;
    case 'math-inline':
      return `$${node.src}$`;
    case 'comment-inline': {
      if (mode === 'pkc') {
        const inner = renderInlines(node.children, mode);
        return node.visibility === 'footnote'
          ? `%%footnote[${node.id ?? ''}](${inner})%%`
          : `%%${inner}%%`;
      }
      // GFM:hidden コメントは消す、footnote は `[^id]` で近似
      if (node.visibility === 'footnote') {
        return `[^${node.id ?? 'note'}]`;
      }
      return '';
    }
    default: {
      const n = node as AstNodeBase & { kind: string };
      return `<!-- unsupported inline kind: ${n.kind} -->`;
    }
  }
}

/**
 * CommonMark の "Backslash escape" rule に準拠した **最小限の inline escape**。
 *
 * 全 ASCII punctuation を escape すると `Hello (world)` → `Hello \(world\)` の
 * ような過剰 escape を produce してしまう(PR-2JJ v2 critical bug fix、
 * 2026-05-13 user 指摘:「MDコピーの両方の取得結果がシンタックスをエスケープ
 * する致命的なバグ」)。
 *
 * inline context で **markup として interpret される可能性が確実にある** 文字
 * のみ escape する:
 *
 *   - `\\` : escape character 自身(re-render の冪等性確保)
 *   - `` ` `` : inline code 開始
 *   - `*` `_` : emphasis / strong(連続する `*` / `_` が確実に markup)
 *
 * 他の punctuation(`( )` / `[ ]` / `#` / `+` / `-` / `!` / `|` / `>` /
 * `{` `}` / `/` / `~` / `:` 等)は inline では **markup を確実に trigger
 * しない** ので escape 不要。
 *
 *   - `[` `]`:本物の link は AST 上 `link` node に分解されており、text
 *     node の value に残るのは literal 用途のみ。escape すると `[test]`
 *     が `\[test\]` と読みづらくなる。markdown-it は対応する destination
 *     がない `[...]` を text token として残すので、escape なしでも re-parse
 *     で同じ AST に戻る。
 *   - 行頭 marker(`#` / `>` / `-`):block level context で別途扱う
 *     (paragraph wrap が常に block context を作るため)。
 *
 * 過剰 escape は出力の可読性を破壊するだけでなく、AI / 他システムへの
 * 互換性 hand-off で誤動作の原因になるため、ここは厳密に限定する。
 */
function escapeText(s: string): string {
  return s.replace(/([\\`*_])/g, '\\$1');
}

/**
 * GFM mode で AST text node に残った PKC 拡張 marker を plain text へ
 * 落とす post-process(PR-2JJ v2、2026-05-13 user 指摘:「ASTが可換に
 * なっていない、ASTの中なのにPKC Markdownがそのまま記録されていたりして、
 * ASTの体を成していない」)。
 *
 * 本来は parser(PR-2Y / PR-2Z scope)が PKC 拡張を AST 構造に分解する
 * のが筋だが、現 parser は **commonmark + GFM core のみ cover** で PKC
 * 固有 marker(`==text==` / `..text..` / `:::role` / `%%comment%%` 等)を
 * text node の value にそのまま渡してくる。
 *
 * GFM mode の互換性 contract を満たすため、render 段階で minimal な
 * fallback 変換を提供:
 *   - `==text==` → `text`(plain、強調マーカーは drop)
 *   - `..text..` → `text`(em-dot マーカー drop)
 *   - `%%hidden%%` → ``(hidden コメントは削除)
 *   - `:::role` ... `:::` block 形式は block 段階で処理済(現実装で剥がし済)
 *
 * 真の修正は AST canonicalize / parser を PKC 固有 inline 対応に強化する
 * future wave。本実装は symptom 緩和の bridge layer。
 */
function stripPkcMarkersForGfm(s: string): string {
  let out = s;
  // %%hidden%% コメントを削除(visibility=hidden 既定の inline comment 形式)
  out = out.replace(/%%([^%\n]+?)%%/g, '');
  // ==text== marker を中身だけ残す
  out = out.replace(/==([^=\n]+?)==/g, '$1');
  // ..text.. em-dot marker を中身だけ残す
  out = out.replace(/\.\.([^.\n]+?)\.\./g, '$1');
  // :::role{...} ブロック開始 / 閉じ marker を削除(parser が分解できない
  // 場合、これらが text node の value に line として残る)
  out = out.replace(/:::[a-zA-Z0-9_-]+(\{[^}]*\})?/g, '');
  out = out.replace(/:::/g, '');
  return out;
}

function hasAttrs(attrs: { id?: string; classes: readonly string[]; kvs: Readonly<Record<string, string | boolean>> }): boolean {
  if (attrs.id) return true;
  if (attrs.classes.length > 0) return true;
  if (Object.keys(attrs.kvs).length > 0) return true;
  return false;
}

function formatAttrs(attrs: { id?: string; classes: readonly string[]; kvs: Readonly<Record<string, string | boolean>> }): string {
  const parts: string[] = [];
  if (attrs.id) parts.push(`#${attrs.id}`);
  for (const cls of attrs.classes) parts.push(`.${cls}`);
  for (const [k, v] of Object.entries(attrs.kvs)) {
    if (v === true) parts.push(k);
    else if (v !== false) parts.push(`${k}=${JSON.stringify(v)}`);
  }
  return `{${parts.join(' ')}}`;
}
