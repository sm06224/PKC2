/**
 * 編集画面の選択部に追従する PKC MD フォーマット設定パネル
 * (PR-2JJ v2、PR #432 stack、2026-05-13)。
 *
 * 仕様:
 *   - edit mode の textarea で text を選択 / focus したとき、選択範囲の
 *     近傍に float 形式のパネルを表示
 *   - パネルには B / I / S / Code / H1 / H2 / H3 / Quote / List / Link /
 *     Mark / Em-dot / Ruby / Sup / Sub の format button を並べる
 *   - button click で選択範囲を **PKC MD 記法** で wrap / prefix
 *   - パネル右上の × で session 中の close、Tier 0 flag
 *     `editor.format_panel_enabled`(default ON)で完全 off 切替可能
 *   - スクロール / window resize / selection 変化で位置追従
 *
 * 上位規約:
 *   - `docs/development/spec/markdown-dialect-for-ai-authors-v3.md`(PKC MD 記法)
 *   - `docs/development/feature-requests-2026-04-28-roadmap.md`(roadmap 領域 10-7)
 *
 * 実装要件:
 *   - 単一 DOM ノード(`[data-pkc-region="format-panel"]`)を body 直下に置く
 *   - dispatcher 不要(textarea を直接操作する、QUICK_UPDATE 経由不要)
 *   - close ボタン押下は同 session 限り、reload で再表示
 */

import { defineFlag } from '@core/flags';
import { getCaretViewportCoords } from './caret-position';

const formatPanelEnabled = defineFlag<boolean>('editor.format_panel_enabled', true, {
  category: 'editor',
  description:
    '編集画面の選択部に追従する PKC MD フォーマット設定パネルを有効化(default ON)。' +
    'OFF にすると一切表示されない(同 session 中の hide は panel の × ボタンで別途可能)。',
});

let panel: HTMLElement | null = null;
let mounted = false;
/**
 * Format panel の dismiss 状態。
 *
 * PR-V10(2026-05-14、C4 小品):**localStorage に persist** することで、
 * 一度 close したパネルが次 session でも非表示のまま維持される。これまでは
 * `let sessionClosed = false` で reload でリセットされていたが、user が
 * 「邪魔だから閉じる」場合、次回も閉じたままが期待される。
 *
 * Reset 方法:
 *   - flag inspector で `editor.format_panel_enabled` を OFF → ON に切替
 *   - localStorage の `pkc2.formatPanelDismissed` キーを手動削除
 *   - `resetFormatPanelDismiss()` 関数を test / 開発者向けに export
 */
const DISMISS_KEY = 'pkc2.formatPanelDismissed';
let sessionClosed = readDismissedFromStorage();
let lastTextarea: HTMLTextAreaElement | null = null;

function readDismissedFromStorage(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeDismissedToStorage(dismissed: boolean): void {
  try {
    if (dismissed) localStorage.setItem(DISMISS_KEY, 'true');
    else localStorage.removeItem(DISMISS_KEY);
  } catch {
    /* private browsing / quota / no localStorage — degrade gracefully */
  }
}

/** Test / dev tool 用:dismiss 状態をリセット。 */
export function resetFormatPanelDismiss(): void {
  sessionClosed = false;
  writeDismissedToStorage(false);
}

interface FormatButton {
  label: string;
  title: string;
  /** Selection を変換する操作。 */
  apply: (sel: { value: string; start: number; end: number }) => {
    /** 置換後の text value。 */
    value: string;
    /** 置換後の selectionStart。 */
    start: number;
    /** 置換後の selectionEnd。 */
    end: number;
  };
}

/** 選択範囲の前後を marker で wrap する helper(inline 系)。 */
function wrapInline(
  sel: { value: string; start: number; end: number },
  marker: string,
): { value: string; start: number; end: number } {
  const selected = sel.value.slice(sel.start, sel.end);
  const before = sel.value.slice(0, sel.start);
  const after = sel.value.slice(sel.end);
  const wrapped = `${marker}${selected}${marker}`;
  return {
    value: `${before}${wrapped}${after}`,
    start: sel.start + marker.length,
    end: sel.end + marker.length,
  };
}

/** 選択範囲を asymmetric marker で wrap。 */
function wrapAsymmetric(
  sel: { value: string; start: number; end: number },
  left: string,
  right: string,
): { value: string; start: number; end: number } {
  const selected = sel.value.slice(sel.start, sel.end);
  const before = sel.value.slice(0, sel.start);
  const after = sel.value.slice(sel.end);
  return {
    value: `${before}${left}${selected}${right}${after}`,
    start: sel.start + left.length,
    end: sel.end + left.length,
  };
}

/** 選択範囲の各行に prefix を付ける(block 系)。 */
function prefixLines(
  sel: { value: string; start: number; end: number },
  prefix: string,
): { value: string; start: number; end: number } {
  // 選択開始の行頭まで戻す
  const lineStart = sel.value.lastIndexOf('\n', sel.start - 1) + 1;
  const lineEnd = sel.value.indexOf('\n', sel.end);
  const lineEndIdx = lineEnd === -1 ? sel.value.length : lineEnd;
  const block = sel.value.slice(lineStart, lineEndIdx);
  const prefixed = block
    .split('\n')
    .map((line) => `${prefix}${line}`)
    .join('\n');
  const before = sel.value.slice(0, lineStart);
  const after = sel.value.slice(lineEndIdx);
  return {
    value: `${before}${prefixed}${after}`,
    start: lineStart,
    end: lineStart + prefixed.length,
  };
}

const BUTTONS: readonly FormatButton[] = [
  {
    label: 'B',
    title: '太字(strong)— **text**',
    apply: (s) => wrapInline(s, '**'),
  },
  {
    label: 'I',
    title: '斜体(emphasis)— *text*',
    apply: (s) => wrapInline(s, '*'),
  },
  {
    label: 'S',
    title: '打ち消し(strike)— ~~text~~',
    apply: (s) => wrapInline(s, '~~'),
  },
  {
    label: '`',
    title: 'inline code — `text`',
    apply: (s) => wrapInline(s, '`'),
  },
  {
    label: '==',
    title: 'マーカー(mark)— ==text==',
    apply: (s) => wrapInline(s, '=='),
  },
  {
    label: '..',
    title: '強調点(em-dot)— ..text..',
    apply: (s) => wrapInline(s, '..'),
  },
  {
    label: 'sup',
    title: '上付き(sup)— <sup>text</sup>',
    apply: (s) => wrapAsymmetric(s, '<sup>', '</sup>'),
  },
  {
    label: 'sub',
    title: '下付き(sub)— <sub>text</sub>',
    apply: (s) => wrapAsymmetric(s, '<sub>', '</sub>'),
  },
  {
    label: 'link',
    title: 'link — [text](url)',
    apply: (s) => wrapAsymmetric(s, '[', '](url)'),
  },
  {
    label: 'H1',
    title: '見出し 1 — # text',
    apply: (s) => prefixLines(s, '# '),
  },
  {
    label: 'H2',
    title: '見出し 2 — ## text',
    apply: (s) => prefixLines(s, '## '),
  },
  {
    label: 'H3',
    title: '見出し 3 — ### text',
    apply: (s) => prefixLines(s, '### '),
  },
  {
    label: '>',
    title: '引用(quote)— > text',
    apply: (s) => prefixLines(s, '> '),
  },
  {
    label: '·',
    title: 'リスト(bullet)— - text',
    apply: (s) => prefixLines(s, '- '),
  },
];

function buildPanel(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'pkc-format-panel';
  el.setAttribute('data-pkc-region', 'format-panel');
  el.setAttribute('role', 'toolbar');
  el.setAttribute('aria-label', 'PKC MD フォーマットパネル');

  for (const b of BUTTONS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pkc-format-panel-btn';
    btn.setAttribute('data-pkc-format-label', b.label);
    btn.setAttribute('title', b.title);
    btn.setAttribute('aria-label', b.title);
    btn.textContent = b.label;
    btn.addEventListener('mousedown', (e) => {
      // mousedown で blur しないよう preventDefault — textarea focus 維持
      e.preventDefault();
    });
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      applyFormat(b);
    });
    el.appendChild(btn);
  }

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'pkc-format-panel-close';
  close.setAttribute('aria-label', 'パネルを閉じる(flag を OFF→ON で再表示)');
  close.setAttribute('title', 'パネルを閉じる(localStorage に永続化、flag OFF→ON で再表示)');
  close.textContent = '✕';
  close.addEventListener('mousedown', (e) => e.preventDefault());
  close.addEventListener('click', () => {
    sessionClosed = true;
    writeDismissedToStorage(true);
    hide();
  });
  el.appendChild(close);

  return el;
}

function applyFormat(b: FormatButton): void {
  const ta = lastTextarea;
  if (!ta) return;
  const start = ta.selectionStart ?? 0;
  const end = ta.selectionEnd ?? start;
  const result = b.apply({ value: ta.value, start, end });
  if (typeof ta.setRangeText === 'function') {
    // setRangeText は input event 発火 + undo stack 保持で safe
    const fullText = result.value;
    ta.value = fullText;
    ta.selectionStart = result.start;
    ta.selectionEnd = result.end;
  } else {
    ta.value = result.value;
    ta.selectionStart = result.start;
    ta.selectionEnd = result.end;
  }
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  ta.focus();
  // 位置再計算
  position(ta);
}

function show(): void {
  if (!panel) panel = buildPanel();
  if (!panel.isConnected) document.body.appendChild(panel);
  panel.style.display = 'flex';
}

function hide(): void {
  if (panel && panel.isConnected) panel.style.display = 'none';
}

function position(ta: HTMLTextAreaElement): void {
  if (!panel) return;
  const start = ta.selectionStart ?? 0;
  const coords = getCaretViewportCoords(ta, start);
  if (!coords) return;
  // 選択範囲の上に表示(画面端は反転)
  const panelRect = panel.getBoundingClientRect();
  const top = Math.max(8, coords.top - panelRect.height - 8);
  const left = Math.min(
    window.innerWidth - panelRect.width - 8,
    Math.max(8, coords.left - 20),
  );
  panel.style.top = `${top}px`;
  panel.style.left = `${left}px`;
}

function isFlagOn(): boolean {
  return formatPanelEnabled() !== false;
}

function handleSelection(target: EventTarget | null): void {
  if (!isFlagOn() || sessionClosed) {
    hide();
    return;
  }
  if (!(target instanceof HTMLTextAreaElement)) return;
  // PKC2 編集対象 textarea のみに反応:
  //   - center pane の text 編集 textarea(`.pkc-editor-body` class)
  //   - textlog の log entry 編集 textarea(`data-pkc-field="textlog-entry-text"`)
  //   - test では `data-pkc-field="text-edit-body"` / `editor-body` を許容
  // filter / search box / title 等は **除外**(class + field の組み合わせ判定)。
  const role = target.getAttribute('data-pkc-field') ?? '';
  const isEditorClass = target.classList.contains('pkc-editor-body');
  const editorFields = new Set([
    'text-edit-body',
    'textlog-entry-text',
    'editor-body',
  ]);
  if (!isEditorClass && !editorFields.has(role)) return;

  // 選択範囲が空(caret のみ)の場合は panel を出さない。
  // PR-2JJ v2 hotfix(2026-05-13、smoke regression fix):caret 移動だけで
  // panel が出ると、source-preview-sync の caret 駆動 scroll / wheel
  // operation と DOM overlay が干渉する。フォーマットボタンは「選択範囲を
  // 変換する」機能なので、selection が空なら panel は不要。
  const selStart = target.selectionStart ?? 0;
  const selEnd = target.selectionEnd ?? 0;
  if (selStart === selEnd) {
    hide();
    return;
  }
  lastTextarea = target;
  show();
  position(target);
}

/**
 * Mount the format panel handlers globally. Idempotent — multiple calls
 * are no-ops. main.ts boot path から呼ぶ。
 */
export function mountFormatPanel(): void {
  if (mounted) return;
  if (typeof document === 'undefined') return;
  mounted = true;

  document.addEventListener('selectionchange', () => {
    const active = document.activeElement;
    handleSelection(active);
  });
  document.addEventListener('focusin', (e) => {
    handleSelection(e.target);
  });
  document.addEventListener('focusout', (e) => {
    // textarea を抜けて他の panel ボタンに移動するときは hide しない
    const next = (e as FocusEvent).relatedTarget as HTMLElement | null;
    if (next?.closest('.pkc-format-panel')) return;
    setTimeout(() => {
      const active = document.activeElement;
      if (!(active instanceof HTMLTextAreaElement)) {
        hide();
      }
    }, 50);
  });
  window.addEventListener('resize', () => {
    if (lastTextarea && document.activeElement === lastTextarea) {
      position(lastTextarea);
    }
  });
  window.addEventListener('scroll', () => {
    if (lastTextarea && document.activeElement === lastTextarea) {
      position(lastTextarea);
    }
  }, true);
}

/** Test-only: panel state reset。localStorage の dismissed 状態を再読込し、
 *  module 初期化時と同じ state に戻す(fresh module load を simulate)。 */
export function _resetFormatPanelForTests(): void {
  mounted = false;
  sessionClosed = readDismissedFromStorage();
  lastTextarea = null;
  if (panel?.isConnected) panel.remove();
  panel = null;
}
