/**
 * PKC 拡張を AST node に **真に decompose** する変換器
 * (PR-2JJ v2 final、PR #432 stack、2026-05-13 user direction:
 *  「実装できるまでを終わりとします。新しい世界を作るつもりで果敢に挑んで」)。
 *
 * これまでの bridge layer(render 後の string regex 置換)は user fixture で
 * output 品質を取り戻すための symptom 緩和だったが、本質的には AST 内に
 * PKC 拡張が raw 文字列として残ったままで「AST が可換」要件を満たさなかった。
 *
 * 本実装は parse 後の AstDocument を walker で深く走査し、PKC 拡張を
 * **構造化された AstInline / AstBlock node** に変換する。
 *
 * ## Inline 拡張 → AST node
 *
 * | 入力(text node 内) | 出力 AST node |
 * | --- | --- |
 * | `:strong:[X]` | AstStrong(children = scan(X))|
 * | `:emphasis:[X]` | AstEmphasis |
 * | `:code:[X]` | AstInlineCode |
 * | `:strike:[X]` | AstStrike |
 * | `:lead:[X]` | AstSpan(attrs.classes=['lead'])|
 * | `:caption:[X]` | AstSpan(attrs.classes=['caption'])|
 * | `:quote:{attribution=X}` | AstSpan(class='attribution', text=X)|
 * | `:spacing:{size=N}` | drop(block-level に変換すべきだが現状 inline 範囲では drop)|
 * | `:align:{position=X}` | drop(paragraph.align で別 path 処理)|
 * | `[@id]` | AstAutoRef(id) |
 * | `{{vars.x}}` | 定義済 → text(展開)、未定義 → AstVar(path)|
 * | `==text==` | AstMark |
 * | `..text..` | AstEmDot |
 * | `^^text^^` | AstEmDot |
 * | `[[em:text]]` | AstEmDot |
 * | `[[ruby:base|rt]]` | AstRuby |
 * | `%%text%%` | AstCommentInline(visibility=hidden)|
 *
 * ## Block 拡張 → AST node
 *
 * | 入力(連続 paragraph)| 出力 AST node |
 * | --- | --- |
 * | `:::section{role=R}` ... `:::` | AstSection(role=R, children=...) |
 * | `:::comment` ... `:::` | AstCommentBlock(source=...)|
 * | `:::figure{id=X}` ... `:::` | AstFigure(id=X, children=...) |
 * | `:::if{format=X}` ... `:::` | AstIfBlock(format=X, children=...)|
 * | `:::quote{author=X year=Y}` ... `:::` | AstQuote(citation={...}) |
 * | `:::paragraph{align=X}` ... `:::` | AstParagraph(align=X, children=...)|
 * | `:::break{kind=page role=R}` | AstBreak(breakKind=page, role=R)|
 *
 * ## 単一行 inline-block 形(markdown-it が paragraph 結合した結果)
 *
 * `:::role{...} content :::` が **1 text node の value** に入ってる case も
 * 同等に block node に変換する。
 *
 * ## 可換性 contract
 *
 * - **Idempotent**: `decomposePkcExtensions(decomposePkcExtensions(ast))`
 *   は deep equal(後段の正規化処理である `canonicalize` と組み合わせて使う)
 * - **Round-trip stable**: `parse → decompose → renderMarkdown → parse →
 *   decompose` が 2 回目以降同じ AST に収束する(`tests/features/ast/
 *   user-fixture-roundtrip.test.ts` で固定)
 *
 * @see `tests/features/ast/decompose-pkc.test.ts` for full case matrix.
 */

import type {
  AstAttrs,
  AstAutoRef,
  AstBlock,
  AstCommentBlock,
  AstCommentInline,
  AstDocument,
  AstEmDot,
  AstEmphasis,
  AstFigure,
  AstIfBlock,
  AstInline,
  AstInlineCode,
  AstListItem,
  AstMark,
  AstParagraph,
  AstQuote,
  AstRuby,
  AstSection,
  AstSpan,
  AstStrike,
  AstStrong,
  AstTableCell,
  AstText,
  AstVar,
} from '@core/ast/index';

// ── Public API ─────────────────────────────────────────────

/**
 * AstDocument の **PKC 拡張を真に decompose** する変換器。
 * Idempotent — 何回呼んでも同じ AST に収束。
 */
export function decomposePkcExtensions(ast: AstDocument): AstDocument {
  const vars = ast.vars ?? {};
  return {
    ...ast,
    children: decomposeBlocks(ast.children, vars),
  };
}

// ── Attrs パーサー ─────────────────────────────────────────

/** `{key=value key2="quoted value" #id .class}` 形式の attrs 文字列を parse。 */
function parseAttrString(raw: string): AstAttrs {
  const inner = raw.replace(/^\{|\}$/g, '').trim();
  const classes: string[] = [];
  const kvs: Record<string, string | boolean> = {};
  let id: string | undefined;
  // tokenize:`#id` / `.cls` / `key="value"` / `key=value` / `flag`
  const re = /(?:#([\w-]+))|(?:\.([\w-]+))|(?:([\w-]+)\s*=\s*"([^"]*)")|(?:([\w-]+)\s*=\s*([^\s}]+))|(?:([\w-]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(inner)) !== null) {
    if (m[1] !== undefined) id = m[1];
    else if (m[2] !== undefined) classes.push(m[2]);
    else if (m[3] !== undefined) {
      // key="value" form。`id="…"` は専用 id field に格上げ(`#id` 形と統一)
      if (m[3] === 'id') id = m[4] ?? '';
      else kvs[m[3]!] = m[4] ?? '';
    }
    else if (m[5] !== undefined) {
      // key=value form。同上、`id=…` は id field に格上げ
      if (m[5] === 'id') id = m[6] ?? '';
      else kvs[m[5]!] = m[6] ?? '';
    }
    else if (m[7] !== undefined) kvs[m[7]!] = true;
  }
  return { id, classes, kvs };
}

function isEmptyAttrs(attrs: AstAttrs): boolean {
  return !attrs.id && attrs.classes.length === 0 && Object.keys(attrs.kvs).length === 0;
}

// ── Block decomposition ───────────────────────────────────

/** node が children inline 配列を持つかの type guard。 */
function hasInlineChildren(
  node: AstInline,
): node is AstInline & { children: readonly AstInline[] } {
  return (
    node.kind === 'strong' ||
    node.kind === 'emphasis' ||
    node.kind === 'strike' ||
    node.kind === 'mark' ||
    node.kind === 'em-dot' ||
    node.kind === 'sup' ||
    node.kind === 'sub' ||
    node.kind === 'span' ||
    node.kind === 'link' ||
    node.kind === 'card' ||
    node.kind === 'embed' ||
    node.kind === 'comment-inline'
  );
}

/** paragraph の inline 配列を join して text として扱う(opener / closer 判定用)。 */
function inlinesToText(children: readonly AstInline[]): string {
  const parts: string[] = [];
  for (const c of children) {
    if (c.kind === 'text') parts.push(c.value);
    else if (c.kind === 'inline-code') parts.push('`' + c.value + '`');
    else if (hasInlineChildren(c)) {
      parts.push(inlinesToText(c.children));
    }
  }
  return parts.join('');
}

const BLOCK_OPEN_RE = /^[ \t]*:::([a-zA-Z0-9_-]+)(\{[^}]*\})?[ \t]*$/;
const BLOCK_CLOSE_RE = /^[ \t]*:::[ \t]*$/;
const SINGLELINE_BLOCK_RE = /:::([a-zA-Z0-9_-]+)(\{[^}]*\})?[ \t\n]+([\s\S]*?)[ \t\n]*:::/g;
/** `%%%` 単独行(open / close marker)。 */
const PERCENT_BLOCK_MARKER_RE = /^[ \t]*%%%[ \t]*$/;
/** `%%% content %%%` 単一行 form(markdown-it が paragraph 結合した結果)。 */
const SINGLELINE_PERCENT_BLOCK_RE = /%%%[ \t\n]+([\s\S]*?)[ \t\n]*%%%/g;

/**
 * paragraph が `:::role{...}` opener なら role + attrs を返す。
 * 入力は **paragraph の text** であって、line array ではない(markdown-it が
 * paragraph として 1 つにまとめる前提)。
 */
function matchBlockOpener(text: string): { role: string; attrs?: AstAttrs } | null {
  const m = BLOCK_OPEN_RE.exec(text);
  if (!m) return null;
  const role = m[1]!;
  const attrs = m[2] ? parseAttrString(m[2]) : undefined;
  return attrs && !isEmptyAttrs(attrs) ? { role, attrs } : { role };
}

function matchBlockCloser(text: string): boolean {
  return BLOCK_CLOSE_RE.test(text);
}

/**
 * 連続する block 配列を走査し、`:::role{...}` opener / `:::` closer の対
 * を見つけ次第、対応する block node(AstSection / AstFigure / AstIfBlock /
 * AstCommentBlock / AstQuote / AstParagraph)に集約。
 */
function decomposeBlocks(
  blocks: readonly AstBlock[],
  vars: Record<string, string>,
): AstBlock[] {
  // 第 1 パス:単一行 inline-block 形(markdown-it が paragraph 結合した
  // 結果、`:::role{...} content :::` が 1 paragraph text に入ってる)を
  // 複数 block に splitting。
  const expanded = expandSingleLineBlocks(blocks, vars);

  // 第 2 パス:opener / closer 対の検出と block 集約。
  // `:::role{...}` と `%%%` の 2 種類の block marker を扱う。
  const out: AstBlock[] = [];
  let i = 0;
  while (i < expanded.length) {
    const block = expanded[i]!;
    if (block.kind === 'paragraph') {
      const text = inlinesToText(block.children).trim();
      // (a)`%%%` open / close marker(comment-block 専用)
      if (PERCENT_BLOCK_MARKER_RE.test(text)) {
        // 対応する `%%%` close marker を探す
        let closeIdx = -1;
        for (let j = i + 1; j < expanded.length; j++) {
          const b = expanded[j]!;
          if (b.kind !== 'paragraph') continue;
          const t = inlinesToText(b.children).trim();
          if (PERCENT_BLOCK_MARKER_RE.test(t)) {
            closeIdx = j;
            break;
          }
        }
        if (closeIdx !== -1) {
          // 内部 block を text として fold(AstCommentBlock.source へ)
          const innerLines: string[] = [];
          for (const b of expanded.slice(i + 1, closeIdx)) {
            if (b.kind === 'paragraph') {
              innerLines.push(inlinesToText(b.children));
            }
          }
          const node: AstCommentBlock = {
            kind: 'comment-block',
            source: innerLines.join('\n'),
          };
          out.push(node);
          i = closeIdx + 1;
          continue;
        }
      }
      // (b)`:::role{...}` opener
      const opener = matchBlockOpener(text);
      if (opener) {
        // 対応する closer を探す(ネスト対応:depth カウンタ)
        let depth = 1;
        let closeIdx = -1;
        for (let j = i + 1; j < expanded.length; j++) {
          const b = expanded[j]!;
          if (b.kind !== 'paragraph') continue;
          const t = inlinesToText(b.children).trim();
          if (matchBlockCloser(t)) {
            depth--;
            if (depth === 0) {
              closeIdx = j;
              break;
            }
          } else if (matchBlockOpener(t)) {
            depth++;
          }
        }
        if (closeIdx !== -1) {
          const innerBlocks = decomposeBlocks(
            expanded.slice(i + 1, closeIdx),
            vars,
          );
          const node = buildBlockNode(opener.role, opener.attrs, innerBlocks);
          if (node) out.push(node);
          i = closeIdx + 1;
          continue;
        }
      }
    }
    // 通常 block(opener 不在 or close 不在):inline 解体のみ
    out.push(decomposeBlockInlines(block, vars));
    i++;
  }
  return out;
}

/**
 * single-line で `:::role{...} content :::` 形が 1 paragraph に入っている
 * case を切り出して block 配列を展開。
 */
function expandSingleLineBlocks(
  blocks: readonly AstBlock[],
  vars: Record<string, string>,
): AstBlock[] {
  const out: AstBlock[] = [];
  for (const block of blocks) {
    if (block.kind !== 'paragraph') {
      out.push(block);
      continue;
    }
    const text = inlinesToText(block.children);
    // (i)`%%% content %%%` 単一行 → AstCommentBlock(round-trip 安定性のため、
    // markdown-it が paragraph 結合した %%% 内容を再分解)
    const reP = new RegExp(SINGLELINE_PERCENT_BLOCK_RE.source, SINGLELINE_PERCENT_BLOCK_RE.flags);
    if (reP.test(text)) {
      reP.lastIndex = 0;
      let lastEnd = 0;
      let m: RegExpExecArray | null;
      while ((m = reP.exec(text)) !== null) {
        if (m[0].length === 0) { reP.lastIndex++; continue; }
        if (m.index > lastEnd) {
          const pre = text.slice(lastEnd, m.index);
          if (pre.trim() !== '') out.push(makeParagraphFromText(pre));
        }
        const source = m[1]!;
        const node: AstCommentBlock = { kind: 'comment-block', source };
        out.push(node);
        lastEnd = m.index + m[0].length;
      }
      if (lastEnd < text.length) {
        const tail = text.slice(lastEnd);
        if (tail.trim() !== '') out.push(makeParagraphFromText(tail));
      }
      continue;
    }
    // (ii)`%%%` 単独 paragraph(open / close marker)→ AstCommentBlock として
    // ペアを構築するロジックは下流の decomposeBlocks 第 2 パスで処理する。
    // ここでは単独 marker は paragraph として通す(opener/closer 認識は別関数)。
    if (PERCENT_BLOCK_MARKER_RE.test(text)) {
      out.push(block);
      continue;
    }
    // PR-2JJ v2 final hotfix(2026-05-13):/g flag の regex を再利用すると
    // lastIndex の state がインスタンス共有で漏れて infinite loop の原因に
    // なるため、毎回 local instance を作る。
    const re = new RegExp(SINGLELINE_BLOCK_RE.source, SINGLELINE_BLOCK_RE.flags);
    if (!re.test(text)) {
      out.push(block);
      continue;
    }
    re.lastIndex = 0;
    let lastEnd = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      // 安全策:零幅 match で lastIndex が進まない場合は break
      if (m[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      if (m.index > lastEnd) {
        const pre = text.slice(lastEnd, m.index);
        if (pre.trim() !== '') {
          out.push(makeParagraphFromText(pre));
        }
      }
      const role = m[1]!;
      const attrs = m[2] ? parseAttrString(m[2]) : undefined;
      const content = m[3]!;
      const innerBlocks = content.trim() === ''
        ? []
        : [makeParagraphFromText(content)];
      const node = buildBlockNode(role, attrs, decomposeBlocks(innerBlocks, vars));
      if (node) out.push(node);
      lastEnd = m.index + m[0].length;
    }
    if (lastEnd < text.length) {
      const tail = text.slice(lastEnd);
      if (tail.trim() !== '') {
        out.push(makeParagraphFromText(tail));
      }
    }
  }
  return out;
}

function makeParagraphFromText(text: string): AstParagraph {
  return { kind: 'paragraph', children: [{ kind: 'text', value: text } as AstText] };
}

/**
 * role / attrs / 内部 block から具体的な AST node を構築。未知 role は
 * AstSection で wrap(forward compatibility)。
 */
function buildBlockNode(
  role: string,
  attrs: AstAttrs | undefined,
  children: AstBlock[],
): AstBlock | null {
  switch (role) {
    case 'section': {
      const sectionRole = (attrs?.kvs.role as string | undefined) ?? 'section';
      const node: AstSection = { kind: 'section', role: sectionRole, children };
      if (attrs && !isEmptyAttrs(attrs)) node.attrs = attrs;
      return node;
    }
    case 'comment': {
      // AstCommentBlock は source 文字列を持つ。children を flatten text に。
      const source = children
        .map((b) => (b.kind === 'paragraph' ? inlinesToText(b.children) : ''))
        .join('\n');
      const node: AstCommentBlock = { kind: 'comment-block', source };
      return node;
    }
    case 'figure': {
      const figureKind: 'figure' | 'table' | 'equation' =
        ((attrs?.kvs.kind as string | undefined) === 'table'
          ? 'table'
          : (attrs?.kvs.kind as string | undefined) === 'equation'
            ? 'equation'
            : 'figure');
      const node: AstFigure = { kind: 'figure', figureKind, children };
      if (attrs && !isEmptyAttrs(attrs)) node.attrs = attrs;
      return node;
    }
    case 'if': {
      const format = (attrs?.kvs.format as string | undefined) ?? 'html';
      const node: AstIfBlock = { kind: 'if-block', format, children };
      return node;
    }
    case 'quote': {
      const citation: Record<string, string> = {};
      if (attrs) {
        for (const [k, v] of Object.entries(attrs.kvs)) {
          if (typeof v === 'string') citation[k] = v;
        }
      }
      const node: AstQuote = { kind: 'quote', children };
      if (Object.keys(citation).length > 0) node.citation = citation;
      return node;
    }
    case 'paragraph': {
      // children が複数 paragraph なら最初の paragraph のみ採用。align を attach。
      const first = children[0];
      const align = attrs?.kvs.align as
        | 'left'
        | 'right'
        | 'center'
        | 'top'
        | 'bottom'
        | 'start'
        | 'end'
        | undefined;
      if (first && first.kind === 'paragraph') {
        const node: AstParagraph = { ...first };
        if (align) node.align = align;
        return node;
      }
      return null;
    }
    default: {
      // 未知 role:AstSection で wrap(role 名そのまま、forward compatibility)
      const node: AstSection = { kind: 'section', role, children };
      if (attrs && !isEmptyAttrs(attrs)) node.attrs = attrs;
      return node;
    }
  }
}

/**
 * block node 内の inline 配列を全て scan して PKC inline 拡張を node 化。
 * 再帰的に nested block(quote / section / figure 等)も処理。
 */
function decomposeBlockInlines(
  block: AstBlock,
  vars: Record<string, string>,
): AstBlock {
  switch (block.kind) {
    case 'paragraph':
    case 'heading': {
      const decomposed = decomposeInlineList(block.children, vars);
      return { ...block, children: decomposed };
    }
    case 'list': {
      const items = block.items.map((it): AstListItem => ({
        ...it,
        children: decomposeBlocks(it.children, vars),
      }));
      return { ...block, items };
    }
    case 'table': {
      const rows = block.rows.map((r) => ({
        ...r,
        cells: r.cells.map((c): AstTableCell => ({
          ...c,
          children: decomposeInlineList(c.children, vars),
        })),
      }));
      return { ...block, rows };
    }
    case 'quote':
    case 'figure':
    case 'section':
    case 'if-block': {
      return { ...block, children: decomposeBlocks(block.children, vars) };
    }
    default:
      return block;
  }
}

// ── Inline decomposition ──────────────────────────────────

/** inline 配列を走査し、各 text node を scanInlineMarkers にかける。 */
function decomposeInlineList(
  inlines: readonly AstInline[],
  vars: Record<string, string>,
): AstInline[] {
  const out: AstInline[] = [];
  for (const node of inlines) {
    if (node.kind === 'text') {
      const split = scanInlineMarkers(node.value, vars);
      out.push(...split);
    } else if (hasInlineChildren(node)) {
      const decomposed = decomposeInlineList(node.children, vars);
      out.push({ ...node, children: decomposed } as AstInline);
    } else {
      out.push(node);
    }
  }
  return mergeAdjacentText(out);
}

function mergeAdjacentText(inlines: readonly AstInline[]): AstInline[] {
  const out: AstInline[] = [];
  for (const node of inlines) {
    const last = out[out.length - 1];
    if (last && last.kind === 'text' && node.kind === 'text') {
      out[out.length - 1] = { kind: 'text', value: last.value + node.value };
    } else if (node.kind === 'text' && node.value === '') {
      // empty text node は drop
    } else {
      out.push(node);
    }
  }
  return out;
}

/**
 * Text 文字列を走査して PKC inline marker を node 化。優先順位:
 *
 * 1. `{{vars.x}}` — 最高(他の marker より早く展開)
 * 2. `:role:[X]` — formal inline(`:strong:` / `:emphasis:` / `:code:` /
 *    `:strike:` / `:lead:` / `:caption:`)
 * 3. `:role:{...}` — attribution chip(`:quote:` / `:spacing:` / `:align:`)
 * 4. `[[em:X]]` / `[[ruby:base|rt]]` — formal inline(brackets 形)
 * 5. `[@id]` — auto-ref
 * 6. `==text==` / `..text..` / `^^text^^` — inline marker / em-dot
 * 7. `%%text%%` — inline comment(hidden)
 *
 * 上位 marker の中身は **再帰的に scan** される(nested marker 対応)。
 */
function scanInlineMarkers(
  text: string,
  vars: Record<string, string>,
): AstInline[] {
  const out: AstInline[] = [];
  let i = 0;
  let buf = '';
  const flush = (): void => {
    if (buf !== '') {
      out.push({ kind: 'text', value: buf });
      buf = '';
    }
  };
  while (i < text.length) {
    const r = tryInlinePattern(text, i, vars);
    if (r) {
      flush();
      for (const n of r.nodes) out.push(n);
      i = r.consumed;
    } else {
      buf += text[i];
      i++;
    }
  }
  flush();
  return mergeAdjacentText(out);
}

/**
 * 位置 start から PKC inline pattern を試行。マッチしたら nodes + consumed
 * (start 含めた終端 idx + 1)を返す。マッチなしなら null。
 */
function tryInlinePattern(
  text: string,
  start: number,
  vars: Record<string, string>,
): { nodes: AstInline[]; consumed: number } | null {
  const slice = text.slice(start);

  // 1. {{vars.x}}
  let m = /^\{\{\s*vars\.([A-Za-z_][\w-]*)\s*\}\}/.exec(slice);
  if (m) {
    const key = m[1]!;
    if (Object.prototype.hasOwnProperty.call(vars, key)) {
      return {
        nodes: [{ kind: 'text', value: vars[key]! }],
        consumed: start + m[0].length,
      };
    }
    const node: AstVar = { kind: 'var', path: `vars.${key}` };
    return { nodes: [node], consumed: start + m[0].length };
  }

  // 2. :role:[X] — formal inline
  m = /^:(strong|emphasis|code|strike|lead|caption|sup|sub):\[([\s\S]+?)\]/.exec(slice);
  if (m) {
    const role = m[1]!;
    // PR-2JJ v2 final hotfix(2026-05-13):`:emphasis:[\nbody\n]` のような
    // 改行入りの形では、render 後に `*\nbody\n*` → markdown-it が emphasis と
    // 認識せず `* body *`(bullet list 風)に decay する round-trip 不安定を
    // 起こす。content 端の whitespace は trim して安全化(意味的損失なし)。
    const inner = m[2]!.replace(/^\s+|\s+$/g, '');
    const consumed = start + m[0].length;
    if (inner === '') {
      // 空 inline は drop
      return { nodes: [], consumed };
    }
    if (role === 'code') {
      const node: AstInlineCode = { kind: 'inline-code', value: inner };
      return { nodes: [node], consumed };
    }
    const innerNodes = scanInlineMarkers(inner, vars);
    switch (role) {
      case 'strong':
        return { nodes: [{ kind: 'strong', children: innerNodes } as AstStrong], consumed };
      case 'emphasis':
        return { nodes: [{ kind: 'emphasis', children: innerNodes } as AstEmphasis], consumed };
      case 'strike':
        return { nodes: [{ kind: 'strike', children: innerNodes } as AstStrike], consumed };
      case 'lead':
        return {
          nodes: [{
            kind: 'span',
            children: innerNodes,
            attrs: { classes: ['lead'], kvs: {} },
          } as AstSpan],
          consumed,
        };
      case 'caption':
        return {
          nodes: [{
            kind: 'span',
            children: innerNodes,
            attrs: { classes: ['caption'], kvs: {} },
          } as AstSpan],
          consumed,
        };
      case 'sup':
        return { nodes: [{ kind: 'sup', children: innerNodes }], consumed };
      case 'sub':
        return { nodes: [{ kind: 'sub', children: innerNodes }], consumed };
    }
  }

  // 3. :role:{...} — attribution chip / hint / spacing / align
  m = /^:(quote|spacing|align|caption):(\{[^}]*\})/.exec(slice);
  if (m) {
    const role = m[1]!;
    const attrsStr = m[2]!;
    const consumed = start + m[0].length;
    const attrs = parseAttrString(attrsStr);
    if (role === 'quote' || role === 'caption') {
      // attribution / caption はテキストとして残す(text:value or
      // attribution kv を inline span に)
      const textValue =
        (attrs.kvs.attribution as string | undefined) ??
        (attrs.kvs.author as string | undefined) ??
        '';
      if (textValue === '') {
        return { nodes: [], consumed };
      }
      const innerNodes = scanInlineMarkers(textValue, vars);
      return {
        nodes: [{
          kind: 'span',
          children: innerNodes,
          attrs: { classes: [`pkc-${role}-chip`], kvs: {} },
        } as AstSpan],
        consumed,
      };
    }
    // spacing / align は presentational hint、AST level では drop
    return { nodes: [], consumed };
  }

  // 4. [[em:X]] / [[ruby:base|rt]]
  m = /^\[\[em:([^\]]+?)\]\]/.exec(slice);
  if (m) {
    const inner = scanInlineMarkers(m[1]!, vars);
    return { nodes: [{ kind: 'em-dot', children: inner } as AstEmDot], consumed: start + m[0].length };
  }
  m = /^\[\[ruby:([^|\]]+)\|([^\]]+)\]\]/.exec(slice);
  if (m) {
    return {
      nodes: [{ kind: 'ruby', base: m[1]!, rt: m[2]! } as AstRuby],
      consumed: start + m[0].length,
    };
  }

  // 5. [@id] auto-ref
  m = /^\[@([A-Za-z_][\w-]*)\]/.exec(slice);
  if (m) {
    return {
      nodes: [{ kind: 'auto-ref', id: m[1]! } as AstAutoRef],
      consumed: start + m[0].length,
    };
  }

  // 6. ==text== mark
  m = /^==([^=\n]+?)==/.exec(slice);
  if (m) {
    const inner = scanInlineMarkers(m[1]!, vars);
    return { nodes: [{ kind: 'mark', children: inner } as AstMark], consumed: start + m[0].length };
  }

  // 6b. ^^text^^ em-dot(simple)
  m = /^\^\^([^\n]+?)\^\^/.exec(slice);
  if (m) {
    const inner = scanInlineMarkers(m[1]!, vars);
    return { nodes: [{ kind: 'em-dot', children: inner } as AstEmDot], consumed: start + m[0].length };
  }

  // 6c. ..text.. em-dot(alt)
  m = /^\.\.([^.\n]+?)\.\./.exec(slice);
  if (m) {
    const inner = scanInlineMarkers(m[1]!, vars);
    return { nodes: [{ kind: 'em-dot', children: inner } as AstEmDot], consumed: start + m[0].length };
  }

  // 7. %%text%% inline comment(hidden)
  m = /^%%([^%\n]+?)%%/.exec(slice);
  if (m) {
    const inner = scanInlineMarkers(m[1]!, vars);
    return {
      nodes: [{ kind: 'comment-inline', visibility: 'hidden', children: inner } as AstCommentInline],
      consumed: start + m[0].length,
    };
  }

  return null;
}

// ── Test exports ──────────────────────────────────────────

/** test 用:scanInlineMarkers を直接 export。 */
export const _scanInlineMarkers = scanInlineMarkers;
/** test 用:decomposeBlocks を直接 export。 */
export const _decomposeBlocks = decomposeBlocks;
