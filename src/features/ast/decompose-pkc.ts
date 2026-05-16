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
  AstLayoutHint,
  AstAutoRef,
  AstCitation,
  AstFootnoteRef,
  AstMathInline,
  AstBreak,
  AstBlank,
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
  // Phase 1: PKC formal 形(:::section / :role:[X] / 等)を AST node に分解
  let children = decomposeBlocks(ast.children, vars);
  // Phase 2: Reverse 認識 — GFM 由来の表現(blockquote `> **Role:**` /
  // GitHub Alert `> [!NOTE]` / HTML inline `<mark>` / `<sup>` / `<ruby>` /
  // `<span class="lead">` 等)を可能な限り PKC AST node に逆変換。
  // これにより PKC ↔ GFM 双方向で AST が semantic equivalent に揃う
  // (user direction 2026-05-13:「可換に持ち込めるものは AST を介して
  // 変換器でターゲットに変換」「逆方向も然り」)。
  children = recognizeReverseFromGfm(children);
  // Phase 3: Footnote 定義 `[^id]: 本文` を抽出して ast.footnotes へ
  // (Gemini review 反映、2026-05-13)。
  const { remaining, footnotes } = extractFootnoteDefs(children);
  const result: AstDocument = {
    ...ast,
    children: remaining,
  };
  if (Object.keys(footnotes).length > 0) {
    result.footnotes = { ...(ast.footnotes ?? {}), ...footnotes };
  }
  return result;
}

/**
 * 第 3 パス:本文中の `[^id]: 本文` を footnote definition として ast.footnotes
 * に抽出し、本文 block 列からは取り除く。
 *
 * パターン:paragraph の text が `[^id]: …` から始まる場合、footnote 定義として
 * 認識。複数行に渡る定義(後続 indent 行)は単純化のため第 1 paragraph のみ。
 */
function extractFootnoteDefs(
  blocks: readonly AstBlock[],
): { remaining: AstBlock[]; footnotes: Record<string, readonly AstBlock[]> } {
  const remaining: AstBlock[] = [];
  const footnotes: Record<string, AstBlock[]> = {};
  // PR-W18(2026-05-16):複数 footnote 定義 `[^a]: A\n[^b]: B\n[^c]: C`
  // を連続行で書いた場合、markdown-it は blank-line 区切りが無いため
  // 単一 paragraph に合成する。1 paragraph 中に sentinel が複数並ぶ
  // パターンを matchAll で抽出して全件 ast.footnotes に格納する。
  // 1 個も sentinel が無い場合は通常 paragraph として通過。
  const fnPattern = /\u{E152}fndef:([A-Za-z_][\w-]*)\|([\s\S]*?)\u{E153}/gu;
  for (const block of blocks) {
    if (block.kind === 'paragraph') {
      const text = inlinesToText(block.children);
      const matches = [...text.matchAll(fnPattern)];
      if (matches.length > 0) {
        // text 中の sentinel 以外の部分が空(trim 後)なら定義 only paragraph
        // → 全件抽出 + paragraph 自体は drop。それ以外は sentinel 部分だけ
        // 取り出し、残り text を sanitized paragraph として残置。
        let nonSentinelText = text;
        for (const m of matches) {
          nonSentinelText = nonSentinelText.replace(m[0], '');
        }
        for (const m of matches) {
          const id = m[1]!;
          const body = m[2]!;
          footnotes[id] = [makeParagraphFromText(body)];
        }
        if (nonSentinelText.trim() === '') continue;
        // sentinel 混在 paragraph(本文 + 末尾 def 等):本文残置
        remaining.push(makeParagraphFromText(nonSentinelText));
        continue;
      }
    }
    remaining.push(block);
  }
  return { remaining, footnotes };
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

// PR-W24:`{[^}]*}` の closing `}` missing でも寛容に attrs として受ける。
// 不正 attrs は parse 失敗で role 名のみ採用、attrs は drop(寛容 parse doctrine、
// L-tolerant フォールバック)。AI hallucinate / typo 対応。
// PR-W24 v2:attrs は well-formed のみ accept、malformed `{` は role-only に fallback。
const BLOCK_OPEN_RE = /^[ \t]*:::([a-zA-Z0-9_-]+)(\{[^}\n]{0,200}\})?[ \t]*$/;
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
/**
 * PR-W24:parse.ts:shieldLineLeadingMarkers で挿入した sentinel
 * (`\u{E160}sb` / `\u{E162}bl` / `\u{E164}ind` / `\u{E166}al` / `\u{E168}fcap`)
 * を AST node に decompose する第 0 パス。各 sentinel は 1 paragraph 全体を
 * 単独 sentinel として取り上げ、対応する AstBreak / AstBlank /
 * AstParagraph(indent / align) に変換する。`\u{E168}fcap` は figure 内で
 * 拾うため別 path、ここでは text として残置。
 */
/**
 * Sentinel 文字列を AstBlock に変換するヘルパー。1 個の sentinel 文字列を
 * 1 AstBlock(または null)に対応させる。
 */
function buildSentinelBlock(raw: string): AstBlock | null {
  // section break sentinel
  let m: RegExpExecArray | null;
  m = /^\u{E160}sb:(\{[^}]*\})?\u{E161}$/u.exec(raw);
  if (m) {
    const attrs = m[1] ? parseAttrString(m[1]) : undefined;
    const role = attrs?.kvs?.role as string | undefined;
    return role
      ? { kind: 'break', breakKind: 'page', role }
      : { kind: 'break', breakKind: 'page' };
  }
  // blank-line marker sentinel
  m = /^\u{E162}bl:(\d{1,3})\u{E163}$/u.exec(raw);
  if (m) {
    const r = parseInt(m[1]!, 10);
    const capped = Math.min(Math.max(r, 1), 50);
    const node: AstBlank = { kind: 'blank', count: capped };
    if (capped !== r) node.cappedFrom = r;
    return node;
  }
  // indent sentinel
  m = /^\u{E164}ind:([\s\S]+?)\u{E165}$/u.exec(raw);
  if (m) {
    return {
      kind: 'paragraph',
      children: [{ kind: 'text', value: m[1]!.trim() }],
      indent: 1,
    };
  }
  // align sentinel
  m = /^\u{E166}al:(center|end)\|([\s\S]+?)\u{E167}$/u.exec(raw);
  if (m) {
    return {
      kind: 'paragraph',
      children: [{ kind: 'text', value: m[2]!.trim() }],
      align: m[1] as 'center' | 'end',
    };
  }
  return null;
}

/**
 * PR-W24:行頭 sentinel paragraph を AST block に decompose。markdown-it
 * は連続行(blank line 無し)を 1 paragraph に結合するため、複数の sentinel
 * が空白区切りで 1 paragraph 内に同居するケースが発生する。`splitSentinelParagraph`
 * で paragraph text を sentinel 境界で split、各 sentinel を独立 block に変換。
 */
function splitSentinelParagraph(text: string): Array<{ kind: 'sentinel'; raw: string } | { kind: 'text'; raw: string }> {
  // すべての sentinel(opener char \u{E160}-\u{E168}、closer char \u{E161}-\u{E169})を
  // 1 回 scan で抽出。
  const sentinelRe = /\u{E160}sb:(?:\{[^}]*\})?\u{E161}|\u{E162}bl:\d{1,3}\u{E163}|\u{E164}ind:[\s\S]+?\u{E165}|\u{E166}al:(?:center|end)\|[\s\S]+?\u{E167}/gu;
  const out: Array<{ kind: 'sentinel'; raw: string } | { kind: 'text'; raw: string }> = [];
  let pos = 0;
  let m: RegExpExecArray | null;
  while ((m = sentinelRe.exec(text)) !== null) {
    if (m.index > pos) {
      const between = text.slice(pos, m.index).trim();
      if (between !== '') out.push({ kind: 'text', raw: between });
    }
    out.push({ kind: 'sentinel', raw: m[0] });
    pos = m.index + m[0].length;
  }
  if (pos < text.length) {
    const tail = text.slice(pos).trim();
    if (tail !== '') out.push({ kind: 'text', raw: tail });
  }
  return out;
}

function decomposeLineLeadingSentinels(
  blocks: readonly AstBlock[],
): AstBlock[] {
  const out: AstBlock[] = [];
  for (const block of blocks) {
    if (block.kind !== 'paragraph') {
      out.push(block);
      continue;
    }
    const text = inlinesToText(block.children).trim();
    // (z) `:::break{...}` self-closing block(R-2H formal)
    const breakMatch = /^:::break(\{[^}]*\})?\s*$/.exec(text);
    if (breakMatch) {
      const attrs = breakMatch[1] ? parseAttrString(breakMatch[1]) : undefined;
      const kindRaw = attrs?.kvs.kind as string | undefined;
      const breakKind: 'rule' | 'page' = kindRaw === 'rule' ? 'rule' : 'page';
      const roleAttr = attrs?.kvs.role as string | undefined;
      const node: AstBreak = roleAttr
        ? { kind: 'break', breakKind, role: roleAttr }
        : { kind: 'break', breakKind };
      out.push(node);
      continue;
    }
    // PR-W24:複数 sentinel + plain text が混在する paragraph を split。
    // markdown-it が `\u{E162}bl:3\u{E163} 3 行あけ` のように blank line 無しで
    // 連結した場合に正しく分解する。
    const parts = splitSentinelParagraph(text);
    if (parts.length > 0 && parts.some((p) => p.kind === 'sentinel')) {
      for (const part of parts) {
        if (part.kind === 'sentinel') {
          const node = buildSentinelBlock(part.raw);
          if (node) out.push(node);
        } else {
          // plain text fragment は通常 paragraph として残置
          out.push(makeParagraphFromText(part.raw));
        }
      }
      continue;
    }
    out.push(block);
  }
  return out;
}

function decomposeBlocks(
  blocks: readonly AstBlock[],
  vars: Record<string, string>,
): AstBlock[] {
  // 第 0 パス:行頭 marker sentinel(`+++` / `_N` / `__` / `||` 等)を AST 化。
  const dedented = decomposeLineLeadingSentinels(blocks);
  // 第 1 パス:単一行 inline-block 形(markdown-it が paragraph 結合した
  // 結果、`:::role{...} content :::` が 1 paragraph text に入ってる)を
  // 複数 block に splitting。
  const expanded = expandSingleLineBlocks(dedented, vars);

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
        // PR-W24 v3:closer 見つからず EOF まで到達 → 寛容 parse として残り全部を
        // content として吸収。spec L-tolerant「EOF までを内容として取り込む」。
        const innerBlocks = decomposeBlocks(expanded.slice(i + 1), vars);
        const node = buildBlockNode(opener.role, opener.attrs, innerBlocks);
        if (node) out.push(node);
        i = expanded.length;
        continue;
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
/**
 * PR-W24:`:::` block 内部に blank line がある場合、markdown-it が opener
 * +前半 content / 後半 content + closer の **2 paragraph に分割** する。
 * 旧 expandSingleLineBlocks は paragraph 1 個に opener-content-closer が
 * 全て収まっている場合(blank line なし)しか拾えず、blank line 入り
 * `:::section / :::figure / :::quote / :::if / :::paragraph / :::comment`
 * 全てが decompose 失敗していた critical bug を修正。
 *
 * Pre-pass:各 paragraph を scan して
 *   - 行頭が `:::role{...}` 形で始まる場合 → opener-marker line を独立 paragraph に切り出し、
 *     残り content を別 paragraph として続ける
 *   - 末尾行が `:::` 単独形の場合 → content paragraph + closer-marker paragraph に切り出し
 * これにより phase 2 の opener/closer detection が paragraph 跨ぎでも対応可能に。
 */
// PR-W24:parse.ts:172 で softbreak → space に正規化されるため、blank line で
// 分断された paragraph 内では opener/closer の間が space で区切られる。
// scan 式で全 `:::role{...}` と standalone `:::` を marker として extract、
// その境界で paragraph を split。markers の前後 whitespace は trim。
// ネスト時の連続 closer(`:::\n:::`)も「両方の closer を独立 marker」として
// 拾うことで対応。

function splitParagraphAtBlockMarkers(text: string): string[] {
  const trimmed = text.trim();
  // opener:`:::role` + optional well-formed `{...}` のみ(200 文字以内)
  const openerMatch = /^:::([a-zA-Z0-9_-]+)(\{[^}\n]{0,200}\})?$/.exec(trimmed);
  if (openerMatch) return [trimmed];
  // closer:`:::` 単独
  if (trimmed === ':::') return [':::'];
  // PR-W24 v3:malformed opener tolerant fallback。
  // `:::role{...` の `{` 後に `}` 閉じが無いまま content が続く場合、role-only
  // opener + 残り content の 2 要素に split。寛容 parse doctrine。
  const malformedRoleMatch = /^(:::[a-zA-Z0-9_-]+)\{([\s\S]*)$/.exec(trimmed);
  if (malformedRoleMatch && !malformedRoleMatch[2]!.includes('}')) {
    const rolePart = malformedRoleMatch[1]!;
    const residual = malformedRoleMatch[2]!.trim();
    return residual ? [rolePart, residual] : [rolePart];
  }
  // それ以外:通常 paragraph
  return [text];
}

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
    const rawText = inlinesToText(block.children);
    // PR-W24:opener / closer が paragraph に merge されている case を分解。
    // 結果が 2 件以上ある場合は splitting 必要、1 件なら従来 path。
    const parts = splitParagraphAtBlockMarkers(rawText);
    if (parts.length > 1) {
      for (const part of parts) out.push(makeParagraphFromText(part));
      continue;
    }
    const text = rawText;
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
/**
 * `AstAttrs` から layout hint を抽出して `AstLayoutHint` に分離。
 * 主要 key:`layout-columns` / `layout-float` / `layout-page-break-role` /
 * `layout-region` / `layout-text-align` / `slide-layout`。
 *
 * 抽出した key は元の attrs.kvs から **除去**(semantic attrs と layout hint を
 * 名前空間として分離、target lowering での衝突防止)。
 */
function extractLayoutHint(attrs?: AstAttrs): { layout?: AstLayoutHint; attrs?: AstAttrs } {
  if (!attrs) return {};
  const layout: AstLayoutHint = {};
  const remaining: Record<string, string | boolean> = {};
  let captured = false;
  for (const [k, v] of Object.entries(attrs.kvs)) {
    if (k === 'layout-columns' || k === 'columns') {
      const n = typeof v === 'string' ? parseInt(v, 10) : NaN;
      if (Number.isFinite(n) && n >= 1) { layout.columns = n; captured = true; continue; }
    }
    if (k === 'layout-float' || k === 'float') {
      if (v === 'left' || v === 'right' || v === 'none') {
        layout.float = v; captured = true; continue;
      }
    }
    if (k === 'layout-page-break-role' || k === 'page-break-role') {
      if (typeof v === 'string') { layout.pageBreakRole = v; captured = true; continue; }
    }
    if (k === 'layout-region' || k === 'region') {
      if (typeof v === 'string') { layout.region = v; captured = true; continue; }
    }
    if (k === 'layout-text-align' || k === 'text-align') {
      if (v === 'left' || v === 'right' || v === 'center' || v === 'justify') {
        layout.textAlign = v; captured = true; continue;
      }
    }
    if (k === 'slide-layout') {
      if (typeof v === 'string') { layout.slideLayout = v; captured = true; continue; }
    }
    remaining[k] = v;
  }
  if (!captured) return { attrs };
  const result: { layout?: AstLayoutHint; attrs?: AstAttrs } = { layout };
  if (attrs.id || attrs.classes.length > 0 || Object.keys(remaining).length > 0) {
    result.attrs = { id: attrs.id, classes: attrs.classes, kvs: remaining };
  }
  return result;
}

function buildBlockNode(
  role: string,
  attrs: AstAttrs | undefined,
  children: AstBlock[],
): AstBlock | null {
  // PR-V3(2026-05-14):layout hint を attrs から分離(semantic / layout 名前空間切り分け)
  const { layout, attrs: cleanAttrs } = extractLayoutHint(attrs);
  switch (role) {
    case 'section': {
      const sectionRole = (cleanAttrs?.kvs.role as string | undefined) ?? 'section';
      const node: AstSection = { kind: 'section', role: sectionRole, children };
      if (cleanAttrs && !isEmptyAttrs(cleanAttrs)) node.attrs = cleanAttrs;
      if (layout) node.layout = layout;
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
        ((cleanAttrs?.kvs.kind as string | undefined) === 'table'
          ? 'table'
          : (cleanAttrs?.kvs.kind as string | undefined) === 'equation'
            ? 'equation'
            : 'figure');
      // PR-W24:children 内の `^^^ caption` sentinel(L-7-a)を caption に
      // 昇格、本体 children から除去。`:caption:[X]` formal inline は別経路
      // (現状は inline 化されないので未対応、後続 PR で評価)。
      const captionPattern = /^\u{E168}fcap:([\s\S]+?)\u{E169}$/u;
      let extractedCaption: readonly AstInline[] | undefined;
      const childrenWithoutCaption: AstBlock[] = [];
      for (const c of children) {
        if (c.kind === 'paragraph') {
          const t = inlinesToText(c.children).trim();
          const m = captionPattern.exec(t);
          if (m) {
            const captionText = m[1]!.trim();
            extractedCaption = scanInlineMarkers(captionText, {});
            continue;
          }
        }
        childrenWithoutCaption.push(c);
      }
      const node: AstFigure = {
        kind: 'figure',
        figureKind,
        children: childrenWithoutCaption,
      };
      if (extractedCaption) node.caption = extractedCaption;
      if (cleanAttrs && !isEmptyAttrs(cleanAttrs)) node.attrs = cleanAttrs;
      if (layout) node.layout = layout;
      return node;
    }
    case 'if': {
      const format = (cleanAttrs?.kvs.format as string | undefined) ?? 'html';
      const node: AstIfBlock = { kind: 'if-block', format, children };
      if (layout) node.layout = layout;
      return node;
    }
    case 'quote': {
      const citation: Record<string, string> = {};
      if (cleanAttrs) {
        for (const [k, v] of Object.entries(cleanAttrs.kvs)) {
          if (typeof v === 'string') citation[k] = v;
        }
      }
      const node: AstQuote = { kind: 'quote', children };
      if (Object.keys(citation).length > 0) node.citation = citation;
      if (layout) node.layout = layout;
      return node;
    }
    case 'paragraph': {
      // children が複数 paragraph なら最初の paragraph のみ採用。align を attach。
      const first = children[0];
      const align = cleanAttrs?.kvs.align as
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
        if (layout) node.layout = layout;
        return node;
      }
      return null;
    }
    case 'break': {
      // PR-W24:`:::break{kind=page|rule|section role=R}` formal。
      // R-2H spec、`+++` / `---` 等価。kind=page or rule(default page)。
      const kindRaw = cleanAttrs?.kvs.kind as string | undefined;
      const breakKind: 'rule' | 'page' = kindRaw === 'rule' ? 'rule' : 'page';
      const roleAttr = cleanAttrs?.kvs.role as string | undefined;
      const node: AstBreak = roleAttr
        ? { kind: 'break', breakKind, role: roleAttr }
        : { kind: 'break', breakKind };
      return node;
    }
    default: {
      // 未知 role:AstSection で wrap(role 名そのまま、forward compatibility)
      const node: AstSection = { kind: 'section', role, children };
      if (cleanAttrs && !isEmptyAttrs(cleanAttrs)) node.attrs = cleanAttrs;
      if (layout) node.layout = layout;
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

  // 1. {{vars.x}} — **常に AstVar として保持**(parse 時展開しない)。
  //
  // ChatGPT review(2026-05-13)重要推奨:
  // 「vars は parse 時展開しない。AstVar を semantic IR に残し、render 時のみ
  // resolve。理由:source provenance / reverse 可換 / late binding /
  // target-specific vars / template 化、すべて parse 時展開すると失われる」
  //
  // render 時の resolve は `renderAstToMarkdown` / `renderAstToHtml` の
  // entry point で document.vars を経由して行う。
  let m = /^\{\{\s*vars\.([A-Za-z_][\w-]*)\s*\}\}/.exec(slice);
  if (m) {
    const key = m[1]!;
    void vars; // marker:render 時に展開する設計、parse 時は未展開で保持
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

  // 2b. :span:[X]{attrs} — formal inline span(R-E-3 spec、attrs optional)
  // PR-W24:`:span:[text]{class=foo #id key=val}` で AstSpan(class / id / attrs 反映)
  m = /^:span:\[([\s\S]+?)\](\{[^}]*\})?/.exec(slice);
  if (m) {
    const inner = m[1]!.replace(/^\s+|\s+$/g, '');
    const consumed = start + m[0].length;
    if (inner === '') return { nodes: [], consumed };
    const attrs = m[2] ? parseAttrString(m[2]) : undefined;
    const innerNodes = scanInlineMarkers(inner, vars);
    const node: AstSpan = { kind: 'span', children: innerNodes };
    if (attrs && !isEmptyAttrs(attrs)) node.attrs = attrs;
    return { nodes: [node], consumed };
  }

  // 2c. L-6 Simple inline `:text:attrs:` — `:text:` の attrs に装飾(bold,red,
  // lg,1.5em,150% 等)を colon 区切りで列挙。formal `:role:[X]` と区別するため
  // `:text:attrs:` の text 部分は `[]` を含まない、attrs 部分は `[]` でも
  // `{}` でも始まらない実用上の制約で formal と衝突しない。AI が hallucinate
  // した時の寛容 parse として AstSpan(class=[attr1, attr2])で wrap。
  // PR-W24:`:大きく背景黄:lg,bg-yellow:` 形を AST 化(L-6 spec)。
  //   attrs char class:CSS-like name + `%`(150%)+ `.`(1.5em)+ `,`(区切り)。
  m = /^:([^:\n[{]+):([a-zA-Z0-9_.,#%\s-]+):/.exec(slice);
  if (m) {
    const text = m[1]!.trim();
    const attrStr = m[2]!.trim();
    // formal `:role:[X]` / `:role:{...}` と衝突しないこと(text に `[` `{` を含まない)を確認済
    const consumed = start + m[0].length;
    if (text === '' || attrStr === '') {
      return { nodes: [], consumed };
    }
    const classes = attrStr.split(/[,\s]+/).filter((s) => s !== '');
    const innerNodes = scanInlineMarkers(text, vars);
    const node: AstSpan = {
      kind: 'span',
      children: innerNodes,
      attrs: { classes, kvs: {} },
    };
    return { nodes: [node], consumed };
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

  // 5. [@id] auto-ref vs citation(PR-V2 2026-05-14、Gemini review 反映)
  //
  // 同じ `[@id]` syntax を 2 用途に分岐:
  //   - 図表参照(`fig-X` / `table-X` / `eq-X` / `eqn-X` プレフィックス)→
  //     AstAutoRef(本文中の図番号 reference)
  //   - 書誌的引用(その他、`smith2020` / `kuhn1962` 等)→ AstCitation
  //     (Pandoc / BibTeX 互換)
  //
  // また `[prefix @id suffix]` 形式の citation も認識(Pandoc syntax)。
  m = /^\[@([A-Za-z_][\w-]*)\]/.exec(slice);
  if (m) {
    const id = m[1]!;
    const consumed = start + m[0].length;
    if (/^(fig|figure|table|tbl|eq|eqn|equation)-/i.test(id)) {
      return {
        nodes: [{ kind: 'auto-ref', id } as AstAutoRef],
        consumed,
      };
    }
    // Pandoc citation syntax(書誌的 id、`figure-` 等の prefix 無し)
    return {
      nodes: [{ kind: 'citation', id } as AstCitation],
      consumed,
    };
  }
  // 5b. `[prefix @id, suffix]` 形式の Pandoc citation
  m = /^\[([^@\]]+?)@([A-Za-z_][\w-]*)(?:,\s*([^\]]+?))?\]/.exec(slice);
  if (m) {
    const prefix = m[1]!.trim();
    const id = m[2]!;
    const suffix = m[3]?.trim();
    if (!/^(fig|figure|table|tbl|eq|eqn|equation)-/i.test(id)) {
      const citation: AstCitation = { kind: 'citation', id };
      if (prefix) citation.prefix = prefix;
      if (suffix) citation.suffix = suffix;
      return {
        nodes: [citation],
        consumed: start + m[0].length,
      };
    }
  }

  // 5b. footnote reference(Gemini review、2026-05-13 推奨)
  // `[^id]` は parse 段階で markdown-it に shielded されて sentinel に
  // 置換されている(`\u{E150}fnref:id\u{E151}`)。decompose で AST node 化。
  m = /^\u{E150}fnref:([A-Za-z_][\w-]*)\u{E151}/u.exec(slice);
  if (m) {
    return {
      nodes: [{ kind: 'footnote-ref', id: m[1]! } as AstFootnoteRef],
      consumed: start + m[0].length,
    };
  }

  // 5c. PR-W21:`$X$` math-inline / `$$X$$` math-block(LaTeX 互換)
  // markdown-it は `$` を素通しするため decompose で拾う必要あり。`$$X$$`
  // を先に試行(2 文字 marker、greedy 防止のため `$X$` より優先)、続いて
  // `$X$`。content 端の whitespace は trim、空 math は drop。
  m = /^\$\$([\s\S]+?)\$\$/.exec(slice);
  if (m) {
    const src = m[1]!.replace(/^\s+|\s+$/g, '');
    if (src === '') return { nodes: [], consumed: start + m[0].length };
    // math-block は本来 block 構造だが、inline scan で見つかった場合は
    // math-inline に降格(block への昇格は decomposeBlocks 経路の責務)。
    return { nodes: [{ kind: 'math-inline', src } as AstMathInline], consumed: start + m[0].length };
  }
  m = /^\$([^$\n]+?)\$/.exec(slice);
  if (m) {
    const src = m[1]!.replace(/^\s+|\s+$/g, '');
    if (src === '') return { nodes: [], consumed: start + m[0].length };
    return { nodes: [{ kind: 'math-inline', src } as AstMathInline], consumed: start + m[0].length };
  }

  // 6. ==text== mark / ==[color]text== color mark(L-2-a / L-2-a')
  // PR-W24:`==[red]X==` `==[#fde68a]X==` の color 指定を AstMark.color に
  // 抽出。color spec は `[color-spec]` 形、color-spec は named color or
  // hex(`#abc` / `#abcdef`)。`==[label]X==` のような non-color label でも
  // 一旦 color として記録(下流 renderer が valid color を判定 / fallback)。
  m = /^==\[([^\]\n]+)\]([^=\n]+?)==/.exec(slice);
  if (m) {
    const color = m[1]!.trim();
    const inner = scanInlineMarkers(m[2]!, vars);
    return {
      nodes: [{ kind: 'mark', children: inner, color } as AstMark],
      consumed: start + m[0].length,
    };
  }
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

// ── Reverse recognition(GFM 表現 → PKC AST node)─────────
//
// user direction(2026-05-13):「可換に持ち込めるものは AST を介して変換器
// でターゲットに変換できるようにしてください」「逆方向も然りです」
//
// GFM 経路で書かれた markdown を parse すると、PKC 拡張は失われた(plain
// GFM 表現になる)ように見えるが、構造として識別可能なものは AST に逆
// 復元する。これにより PKC ↔ GFM 双方向で **semantic equivalent な AST**
// に収束し、可換性が成立する。
//
// 対応(現時点):
//   1. `> **Role:** ...` blockquote → AstSection(role 抽出)
//   2. `> [!NOTE]` / `> [!WARNING]` GitHub Alert → AstSection(role 小文字化)
//   3. HTML inline `<mark>X</mark>` → AstMark
//   4. HTML inline `<sup>X</sup>` / `<sub>X</sub>` → AstSup / AstSub
//   5. HTML inline `<ruby>base<rt>rt</rt></ruby>` → AstRuby
//   6. HTML inline `<span class="lead">X</span>` → AstSpan(class=lead)
//   7. HTML inline `<span class="pkc-em-dot">X</span>` → AstEmDot

/** GitHub Alert キーワードを PKC section role に正規化。 */
const GITHUB_ALERT_ROLES: Record<string, string> = {
  NOTE: 'note',
  TIP: 'tip',
  IMPORTANT: 'important',
  WARNING: 'warning',
  CAUTION: 'caution',
};

function recognizeReverseFromGfm(blocks: readonly AstBlock[]): AstBlock[] {
  const out: AstBlock[] = [];
  for (const block of blocks) {
    out.push(recognizeReverseBlock(block));
  }
  return out;
}

function recognizeReverseBlock(block: AstBlock): AstBlock {
  switch (block.kind) {
    case 'quote': {
      // (1)(2) Blockquote → AstSection 認識
      const recognized = tryReverseSection(block);
      if (recognized) return recognized;
      // 通常 quote:children を再帰
      return { ...block, children: recognizeReverseFromGfm(block.children) };
    }
    case 'paragraph':
    case 'heading': {
      return { ...block, children: recognizeReverseInlines(block.children) };
    }
    case 'list': {
      return {
        ...block,
        items: block.items.map((it) => ({
          ...it,
          children: recognizeReverseFromGfm(it.children),
        })),
      };
    }
    case 'table': {
      return {
        ...block,
        rows: block.rows.map((r) => ({
          ...r,
          cells: r.cells.map((c) => ({
            ...c,
            children: recognizeReverseInlines(c.children),
          })),
        })),
      };
    }
    case 'figure':
    case 'section':
    case 'if-block': {
      return { ...block, children: recognizeReverseFromGfm(block.children) };
    }
    default:
      return block;
  }
}

/**
 * `> **Role:** ...` 形式の blockquote、または `> [!NOTE]` GitHub Alert を
 * AstSection に変換。マッチしないなら null。
 */
function tryReverseSection(quote: { children: readonly AstBlock[] }): AstSection | null {
  if (quote.children.length === 0) return null;
  const first = quote.children[0]!;
  if (first.kind !== 'paragraph') return null;
  const firstText = inlinesToText(first.children).trim();

  // (2) GitHub Alert:`[!NOTE]` 等。
  // markdown-it が softbreak で結合した結果、firstText は
  //   `[!NOTE]` or `[!NOTE] 内容続き` の 2 form 可能。
  // 先頭 `[!ROLE]` を匹配、後続 content は paragraph として再構成。
  const ghAlertMatch = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*([\s\S]*)$/.exec(firstText);
  if (ghAlertMatch) {
    const role = GITHUB_ALERT_ROLES[ghAlertMatch[1]!]!;
    const afterLabel = ghAlertMatch[2]!.trim();
    const restBlocks: AstBlock[] = [];
    if (afterLabel !== '') {
      // 第 1 paragraph の `[!NOTE]` を剥がした残りを paragraph として復元
      restBlocks.push({
        kind: 'paragraph',
        children: [{ kind: 'text', value: afterLabel } as AstText],
      });
    }
    restBlocks.push(...quote.children.slice(1));
    return {
      kind: 'section',
      role,
      children: recognizeReverseFromGfm(restBlocks),
    };
  }

  // (1) `**Role:** [rest]` 形式。strong node が先頭にあって直後に `:` で
  // 終わる role label の場合に section に。
  const firstChild = first.children[0];
  if (firstChild?.kind === 'strong') {
    const labelText = inlinesToText(firstChild.children).trim();
    const labelMatch = /^([A-Za-z][\w-]*):$/.exec(labelText);
    if (labelMatch) {
      const role = labelMatch[1]!.toLowerCase();
      // 同 paragraph 内に role label 以外の content があるか確認
      const restInlines = first.children.slice(1);
      // strong の直後の text node の先頭 whitespace を trim
      const cleanedRest = restInlines.map((n, i) => {
        if (i === 0 && n.kind === 'text') {
          return { ...n, value: n.value.replace(/^\s+/, '') } as AstInline;
        }
        return n;
      });
      // 第 2 child 以降の blocks
      const tailBlocks = quote.children.slice(1);
      const sectionChildren: AstBlock[] = [];
      if (cleanedRest.length > 0 && hasNonEmptyContent(cleanedRest)) {
        sectionChildren.push({ kind: 'paragraph', children: cleanedRest });
      }
      sectionChildren.push(...tailBlocks);
      return {
        kind: 'section',
        role,
        children: recognizeReverseFromGfm(sectionChildren),
      };
    }
  }
  return null;
}

function hasNonEmptyContent(inlines: readonly AstInline[]): boolean {
  for (const n of inlines) {
    if (n.kind === 'text' && n.value.trim() !== '') return true;
    if (n.kind !== 'text') return true;
  }
  return false;
}

/** HTML inline element を PKC AST node に逆認識。 */
function recognizeReverseInlines(inlines: readonly AstInline[]): AstInline[] {
  const out: AstInline[] = [];
  for (const node of inlines) {
    if (node.kind === 'text') {
      const split = scanHtmlInlineForReverse(node.value);
      out.push(...split);
    } else if (hasInlineChildren(node)) {
      const decomposed = recognizeReverseInlines(node.children);
      out.push({ ...node, children: decomposed } as AstInline);
    } else {
      out.push(node);
    }
  }
  return mergeAdjacentText(out);
}

/**
 * Text 内に埋まった HTML inline tag / 未知 inline 構文を PKC AST node に逆認識。
 *
 *   `<mark>X</mark>` → AstMark
 *   `<sup>X</sup>` → AstSup
 *   `<sub>X</sub>` → AstSub
 *   `<ruby>base<rt>rt</rt></ruby>` → AstRuby
 *   `<span class="lead">X</span>` → AstSpan(class=lead)
 *   `<span class="pkc-em-dot">X</span>` → AstEmDot
 *   `\textcolor{...}{...}` 等 LaTeX 構文 → AstOpaqueInline(sourceFormat='latex')
 *
 * ChatGPT review(2026-05-13)推奨:lossless preservation のため未知 inline は
 * AstOpaqueInline として保持(drop しない)。Pandoc が raw inline を持つのと同じ。
 */
function scanHtmlInlineForReverse(text: string): AstInline[] {
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
    const slice = text.slice(i);
    // <ruby>...<rt>...</rt></ruby>
    let m = /^<ruby>([\s\S]*?)<rt>([\s\S]*?)<\/rt><\/ruby>/.exec(slice);
    if (m) {
      flush();
      out.push({ kind: 'ruby', base: m[1]!, rt: m[2]! });
      i += m[0].length;
      continue;
    }
    // <mark>X</mark>
    m = /^<mark>([\s\S]*?)<\/mark>/.exec(slice);
    if (m) {
      flush();
      const inner = scanHtmlInlineForReverse(m[1]!);
      out.push({ kind: 'mark', children: inner });
      i += m[0].length;
      continue;
    }
    // <sup>X</sup>
    m = /^<sup>([\s\S]*?)<\/sup>/.exec(slice);
    if (m) {
      flush();
      const inner = scanHtmlInlineForReverse(m[1]!);
      out.push({ kind: 'sup', children: inner });
      i += m[0].length;
      continue;
    }
    // <sub>X</sub>
    m = /^<sub>([\s\S]*?)<\/sub>/.exec(slice);
    if (m) {
      flush();
      const inner = scanHtmlInlineForReverse(m[1]!);
      out.push({ kind: 'sub', children: inner });
      i += m[0].length;
      continue;
    }
    // <span class="X">Y</span>(class=pkc-em-dot は AstEmDot へ、他は AstSpan)
    m = /^<span\s+class="([^"]+)">([\s\S]*?)<\/span>/.exec(slice);
    if (m) {
      flush();
      const cls = m[1]!;
      const inner = scanHtmlInlineForReverse(m[2]!);
      if (cls.split(/\s+/).includes('pkc-em-dot')) {
        out.push({ kind: 'em-dot', children: inner });
      } else {
        out.push({
          kind: 'span',
          children: inner,
          attrs: { classes: cls.split(/\s+/), kvs: {} },
        });
      }
      i += m[0].length;
      continue;
    }
    // LaTeX `\command{a}{b}` or `\command[opt]{...}` → AstOpaqueInline。
    // 複数 `{...}` グループに対応(`\textcolor{red}{warning}` 等)。
    // ChatGPT review(2026-05-13):未知構文は drop ではなく opaque preserve。
    m = /^\\[a-zA-Z]+(?:\[[^\]]*\])?(?:\{[^{}]*\})+/.exec(slice);
    if (m) {
      flush();
      out.push({
        kind: 'opaque-inline',
        sourceFormat: 'latex',
        original: m[0],
      });
      i += m[0].length;
      continue;
    }
    buf += text[i];
    i++;
  }
  flush();
  return out;
}

// ── Test exports ──────────────────────────────────────────

/** test 用:scanInlineMarkers を直接 export。 */
export const _scanInlineMarkers = scanInlineMarkers;
/** test 用:decomposeBlocks を直接 export。 */
export const _decomposeBlocks = decomposeBlocks;
