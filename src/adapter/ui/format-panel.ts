// Desktop fixed format panel (ribbon) — Phase γ-C1, Group C ワープロ化.
//
// 旧 format-panel.ts(選択追従の floating panel、PR-2JJ v2)を scrap し、
// 編集モード上部に常駐する固定 ribbon として build し直したもの。user 判断
// (2026-05-20)で「floating + 選択追従の UX が使いにくい」ため scrap-and-build。
// Spec: docs/development/phase-beta-group-c-format-panel-spec-2026-05.md §3 / §4。
//
// renderer.ts renderEditor() が編集モード時に flag + archetype を確認して
// 呼び、固定 ribbon を編集面の上部へ描画する。global mount / 選択追従 /
// floating 位置計算は持たない(旧実装から破棄)。

import { defineFlag } from '@core/flags';
import { openTextReplaceDialog } from './text-replace-dialog';
import {
  addTableRow,
  deleteTableRow,
  addTableColumn,
  deleteTableColumn,
  setTableColumnAlign,
  type TableEditResult,
} from '@features/markdown/pipe-table-edit';
import { extractListNumberMode } from '@features/markdown/document-globals';
import {
  renumberOrderedLists,
  renumberOrderedListRunAt,
} from '@features/markdown/list-renumber';

// 旧 floating panel から flag contract を引き継ぐ(scrap-and-build、spec §3.1)。
export const formatPanelEnabled = defineFlag<boolean>(
  'editor.format_panel_enabled',
  true,
  {
    category: 'editor',
    description:
      '編集モード上部の固定 format panel(書式 ribbon)を有効化(default ON)。OFF で一切表示しない',
  },
);

interface Selection {
  value: string;
  start: number;
  end: number;
}

// 選択範囲の前後を marker で wrap(inline 系)。旧 panel の変換ロジックを再利用。
function wrapInline(sel: Selection, marker: string): Selection {
  const before = sel.value.slice(0, sel.start);
  const selected = sel.value.slice(sel.start, sel.end);
  const after = sel.value.slice(sel.end);
  return {
    value: `${before}${marker}${selected}${marker}${after}`,
    start: sel.start + marker.length,
    end: sel.end + marker.length,
  };
}

// 選択範囲を非対称 marker で wrap。旧 panel の変換ロジックを再利用。
function wrapAsymmetric(sel: Selection, left: string, right: string): Selection {
  const before = sel.value.slice(0, sel.start);
  const selected = sel.value.slice(sel.start, sel.end);
  const after = sel.value.slice(sel.end);
  return {
    value: `${before}${left}${selected}${right}${after}`,
    start: sel.start + left.length,
    end: sel.end + left.length,
  };
}

// 選択範囲の各行頭に prefix を付ける(block 系)。旧 panel の変換ロジックを再利用。
function prefixLines(sel: Selection, prefix: string): Selection {
  const lineStart = sel.value.lastIndexOf('\n', sel.start - 1) + 1;
  const lineEnd = sel.value.indexOf('\n', sel.end);
  const lineEndIdx = lineEnd === -1 ? sel.value.length : lineEnd;
  const block = sel.value.slice(lineStart, lineEndIdx);
  const prefixed = block
    .split('\n')
    .map((line) => `${prefix}${line}`)
    .join('\n');
  return {
    value: `${sel.value.slice(0, lineStart)}${prefixed}${sel.value.slice(lineEndIdx)}`,
    start: lineStart,
    end: lineStart + prefixed.length,
  };
}

// ── 段落 align prefix `||` / `|>` / `<|`(spec §5.1 / §5.2)──
//
// align prefix は行頭の 2 文字。同 prefix が既にあれば除去(toggle off)、
// 別 align prefix があれば置換、無ければ付与。3 種は排他。
const ALIGN_PREFIXES = ['||', '|>', '<|'] as const;

function stripAlignPrefix(line: string): { stripped: string; prefix: string | null } {
  for (const p of ALIGN_PREFIXES) {
    if (line.startsWith(p)) return { stripped: line.slice(p.length), prefix: p };
  }
  return { stripped: line, prefix: null };
}

// 選択範囲の各行に align prefix を toggle 適用する。
export function applyAlignPrefix(sel: Selection, target: string): Selection {
  const lineStart = sel.value.lastIndexOf('\n', sel.start - 1) + 1;
  const lineEnd = sel.value.indexOf('\n', sel.end);
  const lineEndIdx = lineEnd === -1 ? sel.value.length : lineEnd;
  const block = sel.value.slice(lineStart, lineEndIdx);
  const transformed = block
    .split('\n')
    .map((line) => {
      const { stripped, prefix } = stripAlignPrefix(line);
      return prefix === target ? stripped : `${target}${stripped}`;
    })
    .join('\n');
  return {
    value: `${sel.value.slice(0, lineStart)}${transformed}${sel.value.slice(lineEndIdx)}`,
    start: lineStart,
    end: lineStart + transformed.length,
  };
}

// ── リスト・番号(spec §7)──

// 選択範囲の各行(行全体に拡張)を fn で変換する。
function transformBlockLines(
  sel: Selection,
  fn: (line: string) => string,
): Selection {
  const lineStart = sel.value.lastIndexOf('\n', sel.start - 1) + 1;
  const lineEnd = sel.value.indexOf('\n', sel.end);
  const lineEndIdx = lineEnd === -1 ? sel.value.length : lineEnd;
  const block = sel.value.slice(lineStart, lineEndIdx);
  const transformed = block.split('\n').map(fn).join('\n');
  return {
    value: `${sel.value.slice(0, lineStart)}${transformed}${sel.value.slice(lineEndIdx)}`,
    start: lineStart,
    end: lineStart + transformed.length,
  };
}

// 行を indent / list marker(`- ` / `* ` / `N. `)/ 残りに分解する。
function splitListMarker(line: string): {
  indent: string;
  kind: 'bullet' | 'ordered' | null;
  rest: string;
} {
  const m = /^(\s*)([-*] |\d+\. )?(.*)$/.exec(line);
  const indent = m?.[1] ?? '';
  const mk = m?.[2];
  const rest = m?.[3] ?? line;
  let kind: 'bullet' | 'ordered' | null = null;
  if (mk) kind = /^\d/.test(mk) ? 'ordered' : 'bullet';
  return { indent, kind, rest };
}

// 選択行に list marker を toggle 適用する。同 kind なら除去、別 kind / 無し
// なら付与(spec §7.1)。ordered 化した行は素朴な `1. ` の連続になるので、
// 領域 8 Layer 1 の採番エンジンで正しい連番 / 統一へ整える(連番 / 統一は
// frontmatter `list-number` に従う)。
export function applyListMarker(
  sel: Selection,
  target: 'bullet' | 'ordered',
): Selection {
  const result = transformBlockLines(sel, (line) => {
    const { indent, kind, rest } = splitListMarker(line);
    if (kind === target) return `${indent}${rest}`;
    return `${indent}${target === 'bullet' ? '- ' : '1. '}${rest}`;
  });
  if (target !== 'ordered') return result;
  const block = result.value.slice(result.start, result.end);
  const renumbered = renumberOrderedLists(block, extractListNumberMode(sel.value));
  return {
    value: `${result.value.slice(0, result.start)}${renumbered}${result.value.slice(result.end)}`,
    start: result.start,
    end: result.start + renumbered.length,
  };
}

// 順序リストの採番を振り直す(領域 8 Layer 1 / 2)。選択ありなら選択行
// ブロック内の全 run を、選択なしなら caret 位置の run 全体を再採番する。
// 連番 / 統一は frontmatter `list-number` に従う。
export function applyRenumberList(sel: Selection): Selection {
  const mode = extractListNumberMode(sel.value);
  if (sel.start === sel.end) {
    const r = renumberOrderedListRunAt(sel.value, sel.start, mode);
    return { value: r.text, start: r.caret, end: r.caret };
  }
  const lineStart = sel.value.lastIndexOf('\n', sel.start - 1) + 1;
  const lineEnd = sel.value.indexOf('\n', sel.end);
  const lineEndIdx = lineEnd === -1 ? sel.value.length : lineEnd;
  const block = sel.value.slice(lineStart, lineEndIdx);
  const renumbered = renumberOrderedLists(block, mode);
  return {
    value: `${sel.value.slice(0, lineStart)}${renumbered}${sel.value.slice(lineEndIdx)}`,
    start: lineStart,
    end: lineStart + renumbered.length,
  };
}

// 選択行のインデントを 2 space 単位で増減する(spec §7.1)。
export function applyIndent(sel: Selection, delta: 'in' | 'out'): Selection {
  return transformBlockLines(sel, (line) => {
    if (delta === 'in') return `  ${line}`;
    if (line.startsWith('  ')) return line.slice(2);
    if (line.startsWith(' ')) return line.slice(1);
    return line;
  });
}

// ── simple-inline `:text:attrs:` の attr 合成(spec §4.4)──
//
// simple-inline の attr は category を持ち、同 category は排他(size を 2 つ
// 付けられない)。新 attr 適用時に同 category の既存 attr を置換し、別 category
// は維持する(`:X:red:` に lg を足すと `:X:red,lg:`、red に blue を足すと
// `:X:blue:`)。
const ATTR_CATEGORY: Readonly<Record<string, string>> = {
  xs: 'size',
  sm: 'size',
  md: 'size',
  lg: 'size',
  xl: 'size',
  serif: 'family',
  sans: 'family',
  mono: 'family',
  red: 'color',
  orange: 'color',
  green: 'color',
  blue: 'color',
  purple: 'color',
  gray: 'color',
};

// 選択テキストが simple-inline `:inner:attrs:` 全体ならパースする。inner に
// `:` は含めない(simple-inline の delimiter)。それ以外は null。
export function parseSimpleInline(
  text: string,
): { inner: string; attrs: string[] } | null {
  const m = /^:([^:]+):([a-z][a-z0-9]*(?:,[a-z0-9]+)*):$/.exec(text);
  if (!m || m[1] === undefined || m[2] === undefined) return null;
  return { inner: m[1], attrs: m[2].split(',') };
}

// simple-inline attr を選択範囲に適用する。選択が既に simple-inline 全体なら
// attr を合成(同 category は置換)、そうでなければ新規 wrap。
export function applySimpleInlineAttr(sel: Selection, attr: string): Selection {
  const selected = sel.value.slice(sel.start, sel.end);
  const parsed = parseSimpleInline(selected);
  const category = ATTR_CATEGORY[attr];
  let inner: string;
  let attrs: string[];
  if (parsed) {
    inner = parsed.inner;
    attrs = parsed.attrs.filter((a) => ATTR_CATEGORY[a] !== category);
    attrs.push(attr);
  } else {
    inner = selected;
    attrs = [attr];
  }
  const replacement = `:${inner}:${attrs.join(',')}:`;
  return {
    value: `${sel.value.slice(0, sel.start)}${replacement}${sel.value.slice(sel.end)}`,
    start: sel.start,
    end: sel.start + replacement.length,
  };
}

// ── highlight 色 `==[color]text==`(spec §4.1 背景色)──

// 選択が highlight `==X==` / `==[color]X==` 全体ならば inner を取り出す。
export function parseHighlight(text: string): { inner: string } | null {
  const m = /^==(?:\[[a-z0-9#]+\])?(.+)==$/.exec(text);
  if (!m || m[1] === undefined) return null;
  return { inner: m[1] };
}

// highlight 背景色を選択範囲に適用する。選択が既に highlight 全体なら色を
// 差し替え(`==X==` → `==[color]X==`、`==[red]X==` → `==[blue]X==`)、
// そうでなければ新規 wrap。
export function applyHighlightColor(sel: Selection, color: string): Selection {
  const selected = sel.value.slice(sel.start, sel.end);
  const parsed = parseHighlight(selected);
  const inner = parsed ? parsed.inner : selected;
  const replacement = `==[${color}]${inner}==`;
  return {
    value: `${sel.value.slice(0, sel.start)}${replacement}${sel.value.slice(sel.end)}`,
    start: sel.start,
    end: sel.start + replacement.length,
  };
}

// ── 表(GFM pipe table)挿入(spec §6.1)──

// rows 本の body 行 × cols 列の GFM pipe table 雛形を生成する。
export function buildPipeTable(rows: number, cols: number): string {
  const headerCells = Array.from({ length: cols }, (_, i) => `列${i + 1}`);
  const header = `| ${headerCells.join(' | ')} |`;
  const sep = `| ${Array.from({ length: cols }, () => '---').join(' | ')} |`;
  const bodyRow = `| ${Array.from({ length: cols }, () => '').join(' | ')} |`;
  const body = Array.from({ length: rows }, () => bodyRow).join('\n');
  return `${header}\n${sep}\n${body}`;
}

// block 要素(表 / 区切り線 等)を caret 位置に挿入する。block は前後がテキスト
// 行に隣接する場合に改行を補って行境界を保つ。
export function insertBlock(sel: Selection, text: string): Selection {
  const before = sel.value.slice(0, sel.start);
  const after = sel.value.slice(sel.end);
  const lead = before.length > 0 && !before.endsWith('\n') ? '\n' : '';
  const tail = after.length > 0 && !after.startsWith('\n') ? '\n' : '';
  return {
    value: `${before}${lead}${text}${tail}${after}`,
    start: sel.start + lead.length,
    end: sel.start + lead.length + text.length,
  };
}

// caret 位置に GFM pipe table を挿入する。value は "cols x rows"。
export function insertPipeTable(sel: Selection, value: string): Selection {
  const parts = value.split('x');
  const cols = Math.max(1, Number(parts[0]) || 2);
  const rows = Math.max(1, Number(parts[1]) || 2);
  return insertBlock(sel, buildPipeTable(rows, cols));
}

// pipe table contextual 編集(行追加・削除)を FormatOp.apply 化する。caret が
// 表内に無ければ TableEditResult が null となり、選択を変えず no-op。
function tableEditOp(
  fn: (value: string, caret: number) => TableEditResult | null,
): (sel: Selection) => Selection {
  return (sel) => {
    const r = fn(sel.value, sel.start);
    return r ? { value: r.value, start: r.caret, end: r.caret } : sel;
  };
}

export interface FormatOp {
  label: string;
  title: string;
  apply: (sel: Selection) => Selection;
}

// 値を選んで適用する operation(font-size / 文字色 等)。trigger を押すと
// option の popup が開き、option click で apply(spec §4.2)。swatch=true の
// 場合 option button を色見本(背景色)で描画する。
export interface FormatPicker {
  id: string;
  triggerLabel: string;
  triggerTitle: string;
  options: readonly { label: string; value: string; title: string }[];
  apply: (sel: Selection, value: string) => Selection;
  swatch?: boolean;
}

export type FormatGroupId =
  | 'font'
  | 'paragraph'
  | 'list'
  | 'table'
  | 'insert'
  | 'search';

// dialog 等を起動する button(検索置換 等)。selection transform ではない。
export interface FormatLauncher {
  id: string;
  label: string;
  title: string;
  launch: (panel: HTMLElement) => void;
  // 指定時はその archetype でのみ表示。未指定なら常時表示。
  archetypes?: readonly string[];
}

export interface FormatGroup {
  id: FormatGroupId;
  label: string;
  ops: readonly FormatOp[];
  pickers?: readonly FormatPicker[];
  launchers?: readonly FormatLauncher[];
}

// 文字サイズ picker(simple-inline `:text:size:`、spec §4.1)。
const FONT_SIZE_PICKER: FormatPicker = {
  id: 'font-size',
  triggerLabel: 'A↕',
  triggerTitle: '文字サイズ(simple-inline :text:size:)',
  options: [
    { label: 'XS', value: 'xs', title: '最小(xs)' },
    { label: 'S', value: 'sm', title: '小(sm)' },
    { label: 'M', value: 'md', title: '中(md)' },
    { label: 'L', value: 'lg', title: '大(lg)' },
    { label: 'XL', value: 'xl', title: '最大(xl)' },
  ],
  apply: (sel, value) => applySimpleInlineAttr(sel, value),
};

// 書体 picker(simple-inline `:text:family:`、spec §4.1)。
const FONT_FAMILY_PICKER: FormatPicker = {
  id: 'font-family',
  triggerLabel: '字体',
  triggerTitle: '書体(simple-inline :text:family:)',
  options: [
    { label: '明朝', value: 'serif', title: 'serif(明朝系)' },
    { label: 'ゴシック', value: 'sans', title: 'sans(ゴシック系)' },
    { label: '等幅', value: 'mono', title: 'mono(等幅)' },
  ],
  apply: (sel, value) => applySimpleInlineAttr(sel, value),
};

// 文字色 / 背景色 picker 共通の色 option(named color、spec §4.2 preset)。
const COLOR_OPTIONS: readonly { label: string; value: string; title: string }[] = [
  { label: '赤', value: 'red', title: '赤(red)' },
  { label: '橙', value: 'orange', title: '橙(orange)' },
  { label: '緑', value: 'green', title: '緑(green)' },
  { label: '青', value: 'blue', title: '青(blue)' },
  { label: '紫', value: 'purple', title: '紫(purple)' },
  { label: '灰', value: 'gray', title: '灰(gray)' },
];

// 文字色 picker(simple-inline `:text:color:`、spec §4.1)。
const TEXT_COLOR_PICKER: FormatPicker = {
  id: 'text-color',
  triggerLabel: '文字色',
  triggerTitle: '文字色(simple-inline :text:color:)',
  options: COLOR_OPTIONS,
  apply: (sel, value) => applySimpleInlineAttr(sel, value),
  swatch: true,
};

// 背景色 picker(highlight `==[color]text==`、spec §4.1)。
const HIGHLIGHT_COLOR_PICKER: FormatPicker = {
  id: 'highlight-color',
  triggerLabel: '背景色',
  triggerTitle: '背景色(==[color]text==)',
  options: COLOR_OPTIONS,
  apply: (sel, value) => applyHighlightColor(sel, value),
  swatch: true,
};

// 表セル整列 picker(spec §6.3)。caret 列の separator marker を置き換える。
const TABLE_ALIGN_PICKER: FormatPicker = {
  id: 'table-align',
  triggerLabel: '整列',
  triggerTitle: '表:caret 列のセル整列',
  options: [
    { label: '既定', value: 'none', title: '既定整列(---)' },
    { label: '左', value: 'left', title: '左寄せ(:--)' },
    { label: '中央', value: 'center', title: '中央寄せ(:-:)' },
    { label: '右', value: 'right', title: '右寄せ(--:)' },
  ],
  apply: (sel, value) => {
    const r = setTableColumnAlign(sel.value, sel.start, value);
    return r ? { value: r.value, start: r.caret, end: r.caret } : sel;
  },
};

// 表挿入 picker(GFM pipe table、spec §6.1)。option value は "cols x rows"。
const TABLE_INSERT_PICKER: FormatPicker = {
  id: 'table-insert',
  triggerLabel: '表',
  triggerTitle: 'GFM pipe table を挿入',
  options: [
    { label: '2×2', value: '2x2', title: '2 列 × 2 行' },
    { label: '3×2', value: '3x2', title: '3 列 × 2 行' },
    { label: '3×3', value: '3x3', title: '3 列 × 3 行' },
    { label: '4×3', value: '4x3', title: '4 列 × 3 行' },
  ],
  apply: (sel, value) => insertPipeTable(sel, value),
};

// 検索置換 dialog を起動する(spec §8)。openTextReplaceDialog は TEXT body
// textarea(data-pkc-field="body")専用のため launcher は archetype text 限定。
function openReplaceFromPanel(panel: HTMLElement): void {
  const ta = resolveTargetTextarea(panel);
  if (!ta) return;
  const root = panel.closest('#pkc-root');
  if (root instanceof HTMLElement) openTextReplaceDialog(ta, root);
}

const SEARCH_REPLACE_LAUNCHER: FormatLauncher = {
  id: 'search-replace',
  label: '🔎 検索置換',
  title: '検索・置換(TEXT body)',
  launch: openReplaceFromPanel,
  archetypes: ['text'],
};

// 6 group(spec §3.2)+ operation / picker の定義。旧 panel の 14 operation を
// group に再配置し、Font group に font-size / font-family / 文字色 / 背景色
// picker を追加した。表 / 検索 group の operation は後続 stack PR で追加。
export const FORMAT_GROUPS: readonly FormatGroup[] = [
  {
    id: 'font',
    label: 'Font',
    ops: [
      { label: 'B', title: '太字(strong)— **text**', apply: (s) => wrapInline(s, '**') },
      { label: 'I', title: '斜体(emphasis)— *text*', apply: (s) => wrapInline(s, '*') },
      { label: 'S', title: '打ち消し(strike)— ~~text~~', apply: (s) => wrapInline(s, '~~') },
      // 下線は PKC MD に専用 marker が無く simple-inline `:text:underline:` で表現
      // する(renderer L-6、markdown-render.ts の attr `underline`)。
      { label: 'U', title: '下線(underline)— :text:underline:', apply: (s) => applySimpleInlineAttr(s, 'underline') },
      { label: '`', title: 'inline code — `text`', apply: (s) => wrapInline(s, '`') },
      { label: '==', title: 'マーカー(mark)— ==text==', apply: (s) => wrapInline(s, '==') },
      // 強調点(圏点)の canonical delimiter は `^^`(renderer L-2 pkc_em_dot_caret)。
      // 旧 ribbon は `..` を使っていたが PKC MD に `..` 強調点は存在せず literal
      // のまま残る不具合だった(pgc-39 で修正)。
      { label: '^^', title: '強調点(em-dot)— ^^text^^', apply: (s) => wrapInline(s, '^^') },
      // 上付き / 下付きは PKC MD では formal inline role `:sup:[…]` / `:sub:[…]`。
      // markdown-it は `html: false` のため生 `<sup>` タグは escape されて
      // literal 表示になる(旧 ribbon の不具合、pgc-39 で修正)。
      { label: 'sup', title: '上付き(sup)— :sup:[text]', apply: (s) => wrapAsymmetric(s, ':sup:[', ']') },
      { label: 'sub', title: '下付き(sub)— :sub:[text]', apply: (s) => wrapAsymmetric(s, ':sub:[', ']') },
    ],
    pickers: [
      FONT_SIZE_PICKER,
      FONT_FAMILY_PICKER,
      TEXT_COLOR_PICKER,
      HIGHLIGHT_COLOR_PICKER,
    ],
  },
  {
    id: 'paragraph',
    label: '段落',
    ops: [
      { label: 'H1', title: '見出し 1 — # text', apply: (s) => prefixLines(s, '# ') },
      { label: 'H2', title: '見出し 2 — ## text', apply: (s) => prefixLines(s, '## ') },
      { label: 'H3', title: '見出し 3 — ### text', apply: (s) => prefixLines(s, '### ') },
      { label: '>', title: '引用(quote)— > text', apply: (s) => prefixLines(s, '> ') },
      // PKC MD の段落 align(renderer L-5)は logical で **中央(||)と行末(|>)の
      // 2 prefix のみ**。`<|` は renderer 上 `|>` と同じ end へ写像され「左揃え」
      // にならないため ribbon からは除外(左 = prefix 無し = 既定の流れ方向、
      // || / |> を toggle off で戻る)。applyAlignPrefix は旧 `<|` 入りの本文を
      // 置換できるよう ALIGN_PREFIXES に `<|` を保持している。
      { label: '||', title: '中央揃え(行頭 || prefix、toggle、解除で既定の左に戻る)', apply: (s) => applyAlignPrefix(s, '||') },
      { label: '|>', title: '行末揃え(行頭 |> prefix、LTR では右、toggle)', apply: (s) => applyAlignPrefix(s, '|>') },
    ],
  },
  {
    id: 'list',
    label: 'リスト・番号',
    ops: [
      { label: '·', title: '箇条書き(- 、toggle)', apply: (s) => applyListMarker(s, 'bullet') },
      { label: '1.', title: '番号リスト(1. 、toggle)', apply: (s) => applyListMarker(s, 'ordered') },
      {
        label: '1.↻',
        title: '番号振り直し(順序リストを再採番。連番 / 統一は frontmatter list-number で選択)',
        apply: applyRenumberList,
      },
      { label: '⇥', title: 'インデント増(2 space)', apply: (s) => applyIndent(s, 'in') },
      { label: '⇤', title: 'インデント減(2 space)', apply: (s) => applyIndent(s, 'out') },
    ],
  },
  {
    id: 'table',
    label: '表',
    ops: [
      { label: '行↑', title: '表:caret 行の上に行を追加', apply: tableEditOp((v, c) => addTableRow(v, c, 'above')) },
      { label: '行↓', title: '表:caret 行の下に行を追加', apply: tableEditOp((v, c) => addTableRow(v, c, 'below')) },
      { label: '行✕', title: '表:caret 行を削除', apply: tableEditOp(deleteTableRow) },
      { label: '列←', title: '表:caret 列の左に列を追加', apply: tableEditOp((v, c) => addTableColumn(v, c, 'left')) },
      { label: '列→', title: '表:caret 列の右に列を追加', apply: tableEditOp((v, c) => addTableColumn(v, c, 'right')) },
      { label: '列✕', title: '表:caret 列を削除', apply: tableEditOp(deleteTableColumn) },
    ],
    pickers: [TABLE_INSERT_PICKER, TABLE_ALIGN_PICKER],
  },
  {
    id: 'insert',
    label: '挿入',
    ops: [
      { label: 'link', title: 'link — [text](url)', apply: (s) => wrapAsymmetric(s, '[', '](url)') },
      { label: 'ﾙﾋﾞ', title: 'ふりがな — [[ruby:漢字|よみ]]', apply: (s) => wrapAsymmetric(s, '[[ruby:', '|]]') },
      { label: '+++', title: '区切り線(section break)— +++', apply: (s) => insertBlock(s, '+++') },
    ],
  },
  { id: 'search', label: '検索', ops: [], launchers: [SEARCH_REPLACE_LAUNCHER] },
];

// クリックされた button から編集対象 textarea を解決する。button の mousedown が
// preventDefault するため focus は textarea に残り、click 時の activeElement が
// 編集中の textarea(TEXT body / TEXTLOG log のいずれか)を指す。focus が
// 外れている場合は editor 内の先頭 textarea にフォールバック。
function resolveTargetTextarea(panel: HTMLElement): HTMLTextAreaElement | null {
  const active = document.activeElement;
  if (active instanceof HTMLTextAreaElement) return active;
  const editor = panel.closest('.pkc-editor');
  return editor ? editor.querySelector('textarea') : null;
}

// Selection 変換を編集対象 textarea に適用する(op / picker 共通)。
function applySelectionTransform(
  panel: HTMLElement,
  transform: (sel: Selection) => Selection,
): void {
  const ta = resolveTargetTextarea(panel);
  if (!ta) return;
  const start = ta.selectionStart ?? 0;
  const end = ta.selectionEnd ?? start;
  const result = transform({ value: ta.value, start, end });
  ta.value = result.value;
  ta.selectionStart = result.start;
  ta.selectionEnd = result.end;
  // 合成 input event で dirty-state / preview / commit へ通知(action-binder)。
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  ta.focus();
}

// operation button を生成する。
function renderOpButton(panel: HTMLElement, op: FormatOp): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pkc-format-panel-btn';
  btn.setAttribute('data-pkc-format-label', op.label);
  btn.setAttribute('title', op.title);
  btn.setAttribute('aria-label', op.title);
  btn.textContent = op.label;
  // mousedown で blur しないよう preventDefault — textarea focus を維持。
  btn.addEventListener('mousedown', (e) => e.preventDefault());
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    applySelectionTransform(panel, op.apply);
  });
  return btn;
}

// 値選択 picker を生成する。trigger(summary)を押すと native <details> が
// option popup を toggle、option click で apply。同 panel の他 picker は閉じる。
function renderPicker(panel: HTMLElement, picker: FormatPicker): HTMLElement {
  const det = document.createElement('details');
  det.className = 'pkc-format-panel-picker';
  det.setAttribute('data-pkc-picker', picker.id);

  const summary = document.createElement('summary');
  summary.className = 'pkc-format-panel-btn pkc-format-panel-picker-trigger';
  summary.textContent = picker.triggerLabel;
  summary.setAttribute('title', picker.triggerTitle);
  summary.setAttribute('aria-label', picker.triggerTitle);
  // mousedown preventDefault で textarea focus を維持(click は <details> を toggle)。
  summary.addEventListener('mousedown', (e) => e.preventDefault());
  det.appendChild(summary);

  const body = document.createElement('div');
  body.className = 'pkc-format-panel-picker-body';
  for (const opt of picker.options) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pkc-format-panel-btn';
    btn.setAttribute('data-pkc-picker-value', opt.value);
    btn.setAttribute('title', opt.title);
    btn.setAttribute('aria-label', opt.title);
    if (picker.swatch) {
      // 色見本:UI chrome の inline style(user content ではないため許容)。
      btn.classList.add('pkc-format-panel-swatch');
      btn.style.backgroundColor = opt.value;
    } else {
      btn.textContent = opt.label;
    }
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      applySelectionTransform(panel, (sel) => picker.apply(sel, opt.value));
      det.open = false;
    });
    body.appendChild(btn);
  }
  det.appendChild(body);

  // 同 panel 内で同時に開く picker は 1 つに制限(popup の視覚的衝突回避)。
  det.addEventListener('toggle', () => {
    if (!det.open) return;
    panel
      .querySelectorAll<HTMLDetailsElement>('.pkc-format-panel-picker[open]')
      .forEach((other) => {
        if (other !== det) other.open = false;
      });
  });

  return det;
}

// dialog 起動 launcher button を生成する。
function renderLauncher(panel: HTMLElement, launcher: FormatLauncher): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pkc-format-panel-btn';
  btn.setAttribute('data-pkc-launcher', launcher.id);
  btn.setAttribute('title', launcher.title);
  btn.setAttribute('aria-label', launcher.title);
  btn.textContent = launcher.label;
  // mousedown preventDefault で textarea focus を維持(launch が activeElement
  // から編集対象 textarea を解決するため)。
  btn.addEventListener('mousedown', (e) => e.preventDefault());
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    launcher.launch(panel);
  });
  return btn;
}

// 編集モード上部に常駐する固定 format ribbon を描画する。group の折りたたみは
// native <details>(JS / dispatch 不要)。renderer.ts renderEditor() から呼ぶ。
// archetype は launcher の表示出し分けに使う(検索 group は text 限定)。
export function renderFormatPanel(archetype = 'text'): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'pkc-format-panel';
  panel.setAttribute('data-pkc-region', 'format-panel');
  panel.setAttribute('role', 'toolbar');
  panel.setAttribute('aria-label', '書式パネル');

  for (const group of FORMAT_GROUPS) {
    const frame = document.createElement('details');
    frame.className = 'pkc-format-panel-group';
    frame.setAttribute('data-pkc-region', 'format-panel-group');
    frame.setAttribute('data-pkc-group', group.id);
    frame.open = true;

    const summary = document.createElement('summary');
    summary.className = 'pkc-format-panel-group-summary';
    summary.textContent = group.label;
    frame.appendChild(summary);

    const body = document.createElement('div');
    body.className = 'pkc-format-panel-group-body';
    for (const op of group.ops) {
      body.appendChild(renderOpButton(panel, op));
    }
    for (const picker of group.pickers ?? []) {
      body.appendChild(renderPicker(panel, picker));
    }
    for (const launcher of group.launchers ?? []) {
      if (launcher.archetypes && !launcher.archetypes.includes(archetype)) continue;
      body.appendChild(renderLauncher(panel, launcher));
    }
    frame.appendChild(body);

    panel.appendChild(frame);
  }

  return panel;
}
