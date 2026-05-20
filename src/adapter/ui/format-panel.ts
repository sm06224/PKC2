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

// ── simple-inline `:text:attrs:` の attr 合成(spec §4.4)──
//
// simple-inline の attr は category を持ち、同 category は排他(size を 2 つ
// 付けられない)。新 attr 適用時に同 category の既存 attr を置換し、別 category
// は維持する(`:X:red:` に lg を足すと `:X:red,lg:`、lg に xl を足すと `:X:xl:`)。
// color category は pgc-04 で追加予定、現状は size / family のみ。
const ATTR_CATEGORY: Readonly<Record<string, string>> = {
  xs: 'size',
  sm: 'size',
  md: 'size',
  lg: 'size',
  xl: 'size',
  serif: 'family',
  sans: 'family',
  mono: 'family',
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

export interface FormatOp {
  label: string;
  title: string;
  apply: (sel: Selection) => Selection;
}

// 値を選んで適用する operation(font-size / font-family 等)。trigger を押すと
// option の popup が開き、option click で apply(spec §4.2)。
export interface FormatPicker {
  id: string;
  triggerLabel: string;
  triggerTitle: string;
  options: readonly { label: string; value: string; title: string }[];
  apply: (sel: Selection, value: string) => Selection;
}

export type FormatGroupId =
  | 'font'
  | 'paragraph'
  | 'list'
  | 'table'
  | 'insert'
  | 'search';

export interface FormatGroup {
  id: FormatGroupId;
  label: string;
  ops: readonly FormatOp[];
  pickers?: readonly FormatPicker[];
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

// 6 group(spec §3.2)+ operation / picker の定義。旧 panel の 14 operation を
// group に再配置し、Font group に font-size / font-family picker を追加した。
// 表 / 検索 group の operation、文字色 / 背景色 picker は後続 stack PR で追加。
export const FORMAT_GROUPS: readonly FormatGroup[] = [
  {
    id: 'font',
    label: 'Font',
    ops: [
      { label: 'B', title: '太字(strong)— **text**', apply: (s) => wrapInline(s, '**') },
      { label: 'I', title: '斜体(emphasis)— *text*', apply: (s) => wrapInline(s, '*') },
      { label: 'S', title: '打ち消し(strike)— ~~text~~', apply: (s) => wrapInline(s, '~~') },
      { label: '`', title: 'inline code — `text`', apply: (s) => wrapInline(s, '`') },
      { label: '==', title: 'マーカー(mark)— ==text==', apply: (s) => wrapInline(s, '==') },
      { label: '..', title: '強調点(em-dot)— ..text..', apply: (s) => wrapInline(s, '..') },
      { label: 'sup', title: '上付き(sup)— <sup>text</sup>', apply: (s) => wrapAsymmetric(s, '<sup>', '</sup>') },
      { label: 'sub', title: '下付き(sub)— <sub>text</sub>', apply: (s) => wrapAsymmetric(s, '<sub>', '</sub>') },
    ],
    pickers: [FONT_SIZE_PICKER, FONT_FAMILY_PICKER],
  },
  {
    id: 'paragraph',
    label: '段落',
    ops: [
      { label: 'H1', title: '見出し 1 — # text', apply: (s) => prefixLines(s, '# ') },
      { label: 'H2', title: '見出し 2 — ## text', apply: (s) => prefixLines(s, '## ') },
      { label: 'H3', title: '見出し 3 — ### text', apply: (s) => prefixLines(s, '### ') },
      { label: '>', title: '引用(quote)— > text', apply: (s) => prefixLines(s, '> ') },
    ],
  },
  {
    id: 'list',
    label: 'リスト・番号',
    ops: [
      { label: '·', title: 'リスト(bullet)— - text', apply: (s) => prefixLines(s, '- ') },
    ],
  },
  { id: 'table', label: '表', ops: [] },
  {
    id: 'insert',
    label: '挿入',
    ops: [
      { label: 'link', title: 'link — [text](url)', apply: (s) => wrapAsymmetric(s, '[', '](url)') },
    ],
  },
  { id: 'search', label: '検索', ops: [] },
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
    btn.textContent = opt.label;
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

// 編集モード上部に常駐する固定 format ribbon を描画する。group の折りたたみは
// native <details>(JS / dispatch 不要)。renderer.ts renderEditor() から呼ぶ。
export function renderFormatPanel(): HTMLElement {
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
    frame.appendChild(body);

    panel.appendChild(frame);
  }

  return panel;
}
