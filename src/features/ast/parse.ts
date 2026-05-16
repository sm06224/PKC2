/**
 * PR-2Y(2026-05-12、reform Phase 3 Block C 1/4):markdown-it Token →
 * `AstDocument` parse 実装。可換世界拡大の起点。
 *
 * 設計(`docs/development/completed/ir-migration-plan-2026-05.md`):
 *   - frontmatter(YAML)→ `globals` + `vars`
 *   - `MarkdownIt` で `md.parse(text, env)` → flat Token[] を取得
 *   - Token walker で nested AstBlock[] を build(`heading_open` / `paragraph_open`
 *     等の open/close ペアを再帰展開)
 *   - inline token は AstInline[] に展開(`text` / `strong_open` / `em_open` 等)
 *   - position info(`token.map`)を `pos.line` に転記
 *
 * 本 PR の scope:
 *   - **commonmark + GFM core node**(heading / paragraph / list / table /
 *     code-block / quote / strong / emphasis / strike / inline-code / link /
 *     image / hr / softbreak / hardbreak)を完全 cover
 *   - **PKC 固有 inline / block の cover は段階的に追加**(PR-2Y2 等 follow-up)。
 *     現時点では未対応 token は `AstSpan` で wrap して text 保持(lossy fallback)
 *
 * features/ layer:browser API なし、`markdown-it` 経由でのみ Token を扱う。
 */
import MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';
import { decomposePkcExtensions } from './decompose-pkc';
import type {
  AstAttrs,
  AstBlock,
  AstCodeBlock,
  AstDocument,
  AstHeading,
  AstInline,
  AstInlineCode,
  AstLink,
  AstList,
  AstListItem,
  AstParagraph,
  AstPosition,
  AstQuote,
  AstSpan,
  AstStrong,
  AstTable,
  AstTableCell,
  AstTableRow,
  AstText,
} from '@core/ast/index';

export interface ParseOptions {
  /** frontmatter から抽出された vars(現時点では `var` token の defined flag に使用)。 */
  vars?: Record<string, string>;
  /** markdown-it instance を override(PKC plugin ありの設定を渡せる)。 */
  md?: MarkdownIt;
}

/**
 * frontmatter 抽出。`---\n...\n---\n` を YAML として簡易 parse、`vars` /
 * `writing` / `direction` / `align` / `notation` を取り出して body を返す。
 *
 * NOTE: 既存 `extractDocumentGlobals` と機能重複。PR-2AA migration で
 * 統合する想定だが、本 PR では独立実装(IR 経路の独立性確保)。
 */
function extractFrontmatter(text: string): {
  body: string;
  globals: {
    writing?: 'horizontal' | 'vertical';
    direction?: 'ltr' | 'rtl';
    align?: 'left' | 'right' | 'center' | 'top' | 'bottom';
    /** PR-W11(2026-05-16):docx/pptx export で 2 段組を反映するため layout も抽出。 */
    layout?: string;
    notation?: string;
    vars: Record<string, string>;
  };
} {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!m) {
    return { body: text, globals: { vars: {} } };
  }
  const yaml = m[1]!;
  const body = text.slice(m[0].length);
  const globals: {
    writing?: 'horizontal' | 'vertical';
    direction?: 'ltr' | 'rtl';
    align?: 'left' | 'right' | 'center' | 'top' | 'bottom';
    layout?: string;
    notation?: string;
    vars: Record<string, string>;
  } = { vars: {} };
  const VALID_LAYOUTS = new Set([
    'a4-1col', 'a4-2col', 'a4-3col',
    'b5-1col', 'b5-2col',
    'letter-1col', 'letter-2col',
    'legal-1col', 'legal-2col',
  ]);
  // 単純な key: value parse(nested vars: 構造のみ)
  const lines = yaml.split('\n');
  let inVars = false;
  for (const line of lines) {
    if (/^vars:\s*$/.test(line)) {
      inVars = true;
      continue;
    }
    if (inVars && /^\s+(\w+):\s*(.+)$/.test(line)) {
      const mm = /^\s+(\w+):\s*(.+)$/.exec(line)!;
      globals.vars[mm[1]!] = mm[2]!.replace(/^["']|["']$/g, '');
      continue;
    }
    if (!/^\s/.test(line)) inVars = false;
    const km = /^(\w+):\s*(.+)$/.exec(line);
    if (!km) continue;
    const key = km[1]!;
    const value = km[2]!.replace(/^["']|["']$/g, '');
    if (key === 'writing' && (value === 'horizontal' || value === 'vertical')) {
      globals.writing = value;
    } else if (key === 'direction' && (value === 'ltr' || value === 'rtl')) {
      globals.direction = value;
    } else if (
      key === 'align' &&
      ['left', 'right', 'center', 'top', 'bottom'].includes(value)
    ) {
      globals.align = value as 'left' | 'right' | 'center' | 'top' | 'bottom';
    } else if (key === 'notation') {
      globals.notation = value;
    } else if (key === 'layout' && VALID_LAYOUTS.has(value)) {
      globals.layout = value;
    }
  }
  return { body, globals };
}

/** markdown-it attrs token([['name', 'value'], ...])を `AstAttrs` に変換。 */
function tokenAttrsToAst(token: Token): AstAttrs | undefined {
  if (!token.attrs || token.attrs.length === 0) return undefined;
  const classes: string[] = [];
  const kvs: Record<string, string | boolean> = {};
  let id: string | undefined;
  for (const [name, value] of token.attrs) {
    if (name === 'class') {
      classes.push(...value.split(/\s+/).filter(Boolean));
    } else if (name === 'id') {
      id = value;
    } else {
      kvs[name] = value;
    }
  }
  if (id === undefined && classes.length === 0 && Object.keys(kvs).length === 0) {
    return undefined;
  }
  return { id, classes, kvs };
}

/** Token.map([startLine, endLine])を `AstPosition` に変換。 */
function tokenPos(token: Token): AstPosition | undefined {
  if (!token.map) return undefined;
  return {
    line: token.map[0] + 1,
    endLine: token.map[1] + 1,
  };
}

/** inline token を展開して AstInline[] を build。 */
function walkInline(tokens: readonly Token[]): AstInline[] {
  const result: AstInline[] = [];
  let i = 0;
  const stack: { kind: string; children: AstInline[] }[] = [];
  const top = () => (stack.length === 0 ? result : stack[stack.length - 1]!.children);
  while (i < tokens.length) {
    const tok = tokens[i]!;
    const type = tok.type;
    if (type === 'text') {
      const node: AstText = { kind: 'text', value: tok.content };
      top().push(node);
    } else if (type === 'softbreak' || type === 'hardbreak') {
      // softbreak は space、hardbreak は \n に正規化(commonmark 規約)
      const node: AstText = { kind: 'text', value: type === 'hardbreak' ? '\n' : ' ' };
      top().push(node);
    } else if (type === 'code_inline') {
      const node: AstInlineCode = { kind: 'inline-code', value: tok.content };
      top().push(node);
    } else if (type === 'strong_open') {
      stack.push({ kind: 'strong', children: [] });
    } else if (type === 'strong_close') {
      const popped = stack.pop()!;
      const node: AstStrong = { kind: 'strong', children: popped.children };
      top().push(node);
    } else if (type === 'em_open') {
      stack.push({ kind: 'emphasis', children: [] });
    } else if (type === 'em_close') {
      const popped = stack.pop()!;
      top().push({ kind: 'emphasis', children: popped.children });
    } else if (type === 's_open') {
      stack.push({ kind: 'strike', children: [] });
    } else if (type === 's_close') {
      const popped = stack.pop()!;
      top().push({ kind: 'strike', children: popped.children });
    } else if (type === 'link_open') {
      stack.push({ kind: 'link', children: [] });
      const node: { _href?: string; _title?: string } = stack[stack.length - 1]! as unknown as {
        _href?: string;
        _title?: string;
      };
      const href = tok.attrGet('href') ?? '';
      const title = tok.attrGet('title') ?? undefined;
      node._href = href;
      if (title) node._title = title;
    } else if (type === 'link_close') {
      const popped = stack.pop()! as unknown as {
        kind: string;
        children: AstInline[];
        _href?: string;
        _title?: string;
      };
      const linkKind = classifyLinkKind(popped._href ?? '');
      const node: AstLink = {
        kind: 'link',
        href: popped._href ?? '',
        linkKind,
        children: popped.children,
      };
      top().push(node);
    } else if (type === 'image') {
      const src = tok.attrGet('src') ?? '';
      const alt = tok.content ?? '';
      top().push({ kind: 'image', src, alt });
    } else if (type === 'html_inline') {
      // raw HTML — wrap in span として保持(IR は HTML を text として扱わない、
      // canonical な意味付けは canonicalize で行う)
      const node: AstSpan = {
        kind: 'span',
        children: [{ kind: 'text', value: tok.content }],
      };
      top().push(node);
    } else {
      // 未対応 token は text fallback で保持(lossy だが loss を可視化)
      if (tok.content) {
        top().push({ kind: 'text', value: tok.content });
      }
    }
    i++;
  }
  return result;
}

function classifyLinkKind(href: string): 'external' | 'entry' | 'asset' | 'permalink' {
  if (href.startsWith('http://') || href.startsWith('https://')) return 'external';
  if (href.startsWith('#')) return 'permalink';
  if (href.startsWith('asset:') || /\.(png|jpg|jpeg|gif|webp|svg|pdf|mp4|mp3)$/i.test(href)) {
    return 'asset';
  }
  return 'entry';
}

/** block token を nested AstBlock[] に展開。 */
function walkBlocks(tokens: readonly Token[]): AstBlock[] {
  const result: AstBlock[] = [];
  let i = 0;
  while (i < tokens.length) {
    const tok = tokens[i]!;
    const type = tok.type;
    if (type === 'heading_open') {
      const level = Number(tok.tag.slice(1)) as 1 | 2 | 3 | 4 | 5 | 6;
      const inlineTok = tokens[i + 1];
      const children = inlineTok && inlineTok.type === 'inline'
        ? walkInline(inlineTok.children ?? [])
        : [];
      const node: AstHeading = {
        kind: 'heading',
        level,
        children,
      };
      const pos = tokenPos(tok);
      if (pos) node.pos = pos;
      const attrs = tokenAttrsToAst(tok);
      if (attrs) node.attrs = attrs;
      result.push(node);
      i = findCloseIdx(tokens, i, 'heading_close') + 1;
    } else if (type === 'paragraph_open') {
      const inlineTok = tokens[i + 1];
      const children = inlineTok && inlineTok.type === 'inline'
        ? walkInline(inlineTok.children ?? [])
        : [];
      const node: AstParagraph = {
        kind: 'paragraph',
        children,
      };
      const pos = tokenPos(tok);
      if (pos) node.pos = pos;
      result.push(node);
      i = findCloseIdx(tokens, i, 'paragraph_close') + 1;
    } else if (type === 'bullet_list_open' || type === 'ordered_list_open') {
      const close = findCloseIdx(tokens, i, type === 'bullet_list_open' ? 'bullet_list_close' : 'ordered_list_close');
      const items: AstListItem[] = [];
      let j = i + 1;
      while (j < close) {
        if (tokens[j]!.type === 'list_item_open') {
          const itemClose = findCloseIdx(tokens, j, 'list_item_close');
          const innerTokens = tokens.slice(j + 1, itemClose);
          const innerBlocks = walkBlocks(innerTokens);
          const item: AstListItem = {
            kind: 'list-item',
            children: innerBlocks,
          };
          items.push(item);
          j = itemClose + 1;
        } else {
          j++;
        }
      }
      const node: AstList = {
        kind: 'list',
        listKind: type === 'bullet_list_open' ? 'bullet' : 'ordered',
        items,
      };
      const pos = tokenPos(tok);
      if (pos) node.pos = pos;
      result.push(node);
      i = close + 1;
    } else if (type === 'fence' || type === 'code_block') {
      const lang = type === 'fence' ? (tok.info?.trim() || null) : null;
      const node: AstCodeBlock = {
        kind: 'code-block',
        lang,
        code: tok.content,
      };
      const pos = tokenPos(tok);
      if (pos) node.pos = pos;
      result.push(node);
      i++;
    } else if (type === 'blockquote_open') {
      const close = findCloseIdx(tokens, i, 'blockquote_close');
      const innerBlocks = walkBlocks(tokens.slice(i + 1, close));
      const node: AstQuote = {
        kind: 'quote',
        children: innerBlocks,
      };
      const pos = tokenPos(tok);
      if (pos) node.pos = pos;
      result.push(node);
      i = close + 1;
    } else if (type === 'table_open') {
      const close = findCloseIdx(tokens, i, 'table_close');
      const rows: AstTableRow[] = [];
      let j = i + 1;
      while (j < close) {
        const t = tokens[j]!;
        if (t.type === 'tr_open') {
          const trClose = findCloseIdx(tokens, j, 'tr_close');
          const cells: AstTableCell[] = [];
          let k = j + 1;
          let isHeader = false;
          while (k < trClose) {
            const ct = tokens[k]!;
            if (ct.type === 'th_open' || ct.type === 'td_open') {
              if (ct.type === 'th_open') isHeader = true;
              const cellCloseType = ct.type === 'th_open' ? 'th_close' : 'td_close';
              const cellClose = findCloseIdx(tokens, k, cellCloseType);
              const inlineTok = tokens[k + 1];
              const children = inlineTok && inlineTok.type === 'inline'
                ? walkInline(inlineTok.children ?? [])
                : [];
              cells.push({ kind: 'table-cell', children });
              k = cellClose + 1;
            } else {
              k++;
            }
          }
          rows.push({ kind: 'table-row', cells, isHeader });
          j = trClose + 1;
        } else {
          j++;
        }
      }
      const node: AstTable = {
        kind: 'table',
        rows,
      };
      const pos = tokenPos(tok);
      if (pos) node.pos = pos;
      result.push(node);
      i = close + 1;
    } else if (type === 'hr') {
      const pos = tokenPos(tok);
      const node: AstBlock = {
        kind: 'break',
        breakKind: 'rule',
        ...(pos ? { pos } : {}),
      };
      result.push(node);
      i++;
    } else if (type === 'inline') {
      // bare inline(paragraph_open に挟まれていない場合):text として保持
      const children = walkInline(tok.children ?? []);
      result.push({ kind: 'paragraph', children });
      i++;
    } else if (type === 'html_block') {
      // raw HTML block — paragraph として text 保持
      result.push({
        kind: 'paragraph',
        children: [{ kind: 'text', value: tok.content }],
      });
      i++;
    } else {
      // 未対応 token は skip(loss を許容、IR は core node のみ完全 cover)
      i++;
    }
  }
  return result;
}

function findCloseIdx(tokens: readonly Token[], openIdx: number, closeType: string): number {
  let depth = 0;
  const openType = tokens[openIdx]!.type;
  for (let i = openIdx + 1; i < tokens.length; i++) {
    if (tokens[i]!.type === openType) depth++;
    else if (tokens[i]!.type === closeType) {
      if (depth === 0) return i;
      depth--;
    }
  }
  return tokens.length - 1; // 防御:close 無くても EOF を返す
}

let defaultMd: MarkdownIt | null = null;
function getDefaultMd(): MarkdownIt {
  if (defaultMd) return defaultMd;
  // PR-2JJ v2 final hotfix(2026-05-13、ChatGPT review feedback 実装中):
  // linkify を OFF。`{{vars.name}}` 等の PKC 拡張 pattern の中に含まれる
  // `vars.name` のような **domain 風 token** を markdown-it が auto-link 化
  // して link node に壊すため。明示的 link は `[text](url)` で書く方針。
  defaultMd = new MarkdownIt({ html: false, linkify: false, breaks: false, typographer: false });
  defaultMd.enable(['table', 'strikethrough']);
  return defaultMd;
}

/**
 * markdown text → AstDocument。
 *
 * frontmatter 抽出 → markdown-it parse → Token walker で AstBlock[] 構築。
 *
 * @param text 入力 markdown(frontmatter 込み可)
 * @param opts ParseOptions(vars / md instance override)
 * @returns AstDocument
 */
/**
 * `[^id]` / `[^id]:` を markdown-it の reference-link 機構から守る pre-process。
 *
 * markdown-it は `[label]` を reference link、`[label]: url` を link
 * definition として認識する。`[^foot]` も同パターンに引っかかって link 化
 * されてしまう(href=URL-encoded text)。
 *
 * 解決:body を md.parse する前に footnote pattern を sentinel に置換、
 * 後段 decompose-pkc で sentinel を AstFootnoteRef / footnote definition に
 * 戻す。
 *
 * 使う sentinel:
 *   `[^id]` → `\u{E150}fnref:id\u{E151}`  (inline ref)
 *   `[^id]: text` → `\u{E152}fndef:id|text\u{E153}` (definition、行頭 only)
 *
 * 後段 decompose-pkc の scanInlineMarkers が sentinel を見つけて AST node 化。
 */
function shieldFootnotes(body: string): string {
  let out = body;
  // definition 形(行頭、`[^id]:` で始まる、行末まで body)を sentinel に
  out = out.replace(
    /^\[\^([A-Za-z_][\w-]*)\]:\s*(.*)$/gm,
    (_m, id: string, def: string) => `\u{E152}fndef:${id}|${def}\u{E153}`,
  );
  // ref 形(`[^id]` で `[^id]:` でない、ref 末尾は ``]` の直後が `:` でない`)
  out = out.replace(
    /\[\^([A-Za-z_][\w-]*)\](?!:)/g,
    (_m, id: string) => `\u{E150}fnref:${id}\u{E151}`,
  );
  return out;
}

/**
 * PR-W24:行頭 marker を markdown-it から shield。`__` `||` `|>` `<|` `|<`
 * `>|` `_N` `+++` `^^^` 等の line-leading 記号は markdown-it が strong /
 * GFM table / autolink 等で破壊的に解釈する case があるため、parse 前に
 * sentinel で囲んで shield、decompose-pkc が AST node 化する。
 *
 * 寛容 parse doctrine:行頭 whitespace(半角 sp / tab / 全角 U+3000)も飲み込む。
 *
 * sentinel 設計:
 *   `+++` / `+++ {role=X}` → `\u{E160}sb:role?\u{E161}`        (section break)
 *   `_N`(N=0-50) / `_`     → `\u{E162}bl:N\u{E163}`            (blank-line marker)
 *   `__X` / `＿X`           → `\u{E164}ind:X\u{E165}`           (paragraph indent)
 *   `||X` / `|>X` / `<|X` / `|<X` / `>|X` → `\u{E166}al:dir|X\u{E167}` (align prefix)
 *   `^^^ caption`           → `\u{E168}fcap:caption\u{E169}`    (figure caption marker)
 */
/**
 * PR-W24:markdown-it は **行頭 tab(1 字)** または **4+ space** を indented
 * code block と解釈する。PKC marker 行に leading ws があると code block 化
 * されて decompose-pkc が認識できなくなるため、PKC marker 行頭の ws は
 * shield 前に **完全 strip**(寛容 parse doctrine、半角 sp / tab / 全角
 * U+3000 全部対応)。
 */
function stripLeadingWsOnPkcMarkers(body: string): string {
  // Block-level marker:行頭 ws 全 strip。
  // Inline-level marker(`:role:` 系):行頭 ws strip(`:span:[X]` 等が
  // 行頭 tab で code-block 化されないよう)。
  const markerStart =
    /^[ \t\u3000]+(\+\+\+|_\d{0,2}[\s$]|__|＿|\|\||\|>|<\||\|<|>\||\^\^\^|:::[a-zA-Z0-9_-]+|:::[\s$]|:[a-z]+:[[{])/gm;
  return body.replace(markerStart, '$1');
}

function shieldLineLeadingMarkers(body: string): string {
  let out = stripLeadingWsOnPkcMarkers(body);
  // (1) `+++` section break(role attrs optional)
  // `+++ {role=X}` or `+++` 単独行(行頭 ws 寛容)
  out = out.replace(
    /^[ \t\u3000]*\+\+\+[ \t]*(\{[^}]*\})?[ \t]*$/gm,
    (_m, attrs: string | undefined) => `\u{E160}sb:${attrs ?? ''}\u{E161}`,
  );
  // (2) `_N`(blank-line marker、N=0-50)/ `_`(N=1 暗黙)
  //   行頭 `_` + 数字 OR 単独 `_` で次行までが構造記号。N>50 は cap される
  //   (decompose 側で cap)。行頭 ws 寛容。
  out = out.replace(
    /^[ \t\u3000]*_(\d{1,3})?[ \t]*$/gm,
    (_m, n: string | undefined) => `\u{E162}bl:${n ?? '1'}\u{E163}`,
  );
  // (3) `__X` / `＿X` paragraph indent prefix。行頭で `__` or `＿` の直後に
  //   非空白文字、その行末まで段落 indent。行頭 ws 寛容(`__` 自体は半角 2
  //   または全角 1 字)。
  out = out.replace(
    /^[ \t\u3000]*(?:__|＿)([^\n]+)$/gm,
    (_m, body: string) => `\u{E164}ind:${body}\u{E165}`,
  );
  // (4) align prefix `||X` `|>X` `<|X` `|<X` `>|X` 5 形(end 4 形は typo 寛容)
  //   center: `||` / end: `|>` `<|` `|<` `>|`
  out = out.replace(
    /^[ \t\u3000]*(\|\|)([^\n]+)$/gm,
    (_m, _marker: string, body: string) => `\u{E166}al:center|${body}\u{E167}`,
  );
  out = out.replace(
    /^[ \t\u3000]*(\|>|<\||\|<|>\|)([^\n]+)$/gm,
    (_m, _marker: string, body: string) => `\u{E166}al:end|${body}\u{E167}`,
  );
  // (5) `^^^ caption text` figure caption marker(L-7-a)
  //   行頭 `^^^` + space + caption text(行末まで)。figure block 内で使用、
  //   block-level pre-processing として shield(figure decompose で拾う)。
  out = out.replace(
    /^[ \t\u3000]*\^\^\^[ \t]+([^\n]+)$/gm,
    (_m, caption: string) => `\u{E168}fcap:${caption}\u{E169}`,
  );
  return out;
}

export function parseMarkdownToAst(text: string, opts: ParseOptions = {}): AstDocument {
  const { body, globals } = extractFrontmatter(text);
  // PR-2JJ v2 final hotfix(2026-05-13、Gemini review feedback 反映):
  // footnote pattern を markdown-it から shield。後段で AST node 化する。
  // PR-W24:行頭 marker(`+++` / `_N` / `__` / `||` / `|>` / `<|` / `|<` /
  // `>|` / `^^^`)も同様 shield。markdown-it は `__strong__` / `|table|` 等で
  // 破壊解釈する case があるため。
  const shieldedBody = shieldLineLeadingMarkers(shieldFootnotes(body));
  const md = opts.md ?? getDefaultMd();
  const tokens = md.parse(shieldedBody, {});
  const children = walkBlocks(tokens);
  const doc: AstDocument = {
    kind: 'document',
    // ChatGPT review(2026-05-13)推奨:document payload に astVersion を
    // 埋め込む。serialized AST 保存 / postMessage / remote AI / cache / DB
    // persistence が始まったとき schema migration が機能する基盤。
    astVersion: '2.0',
    children,
  };
  if (globals.writing) doc.writing = globals.writing;
  if (globals.direction) doc.direction = globals.direction;
  if (globals.align) doc.align = globals.align;
  if (globals.layout) doc.layout = globals.layout;
  if (globals.notation) doc.notation = globals.notation;
  if (Object.keys(globals.vars).length > 0) doc.vars = globals.vars;
  // PR-2JJ v2 final(2026-05-13、user direction「実装できるまでを終わりとします」):
  // commonmark + GFM core parse の後に、PKC 拡張(`:::section` / `:::comment` /
  // `:::figure` / `:::if` / `:::quote` / `:role:[X]` 系 formal inline / `==X==` /
  // `..X..` / `^^X^^` / `[[em:X]]` / `[[ruby:base|rt]]` / `[@id]` / `%%X%%` /
  // `{{vars.x}}`)を **真に AST node に decompose**。
  //
  // bridge layer(render-markdown.ts 末尾の regex 置換)を「symptom 緩和」と
  // 表現していた件の正解。AST 自体が PKC を理解する世界。
  return decomposePkcExtensions(doc);
}
