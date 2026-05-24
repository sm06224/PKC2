// pgc-186 wave-α' #9(v3 統合 master G1 編集 surface 統一の延長、handoff
// §3.4 wave-δ phase 2 text 編集 UX):textarea 編集中の `Ctrl+B` / `Ctrl+I`
// keyboard shortcut。format-panel.ts の `wrapInline` を再利用、selection
// を `**...**`(strong)/ `*...*`(emphasis)で wrap、合成 input event で
// dirty-state / preview / commit に通知(既存 textarea 経路と統合)。
//
// pgc-187 wave-α' #10:`Ctrl+U`(underline、PKC dialect simple-inline)+
// `Ctrl+Shift+S`(strikethrough)を追加。Word / Notion / Obsidian の標準
// shortcut セットを ほぼ網羅(Ctrl+K link は dialog 必須で別 PR scope 外)。
//
// `editor.format_shortcuts_enabled` Tier 0 flag(default OFF)で gate、
// browser default の `Ctrl+B`(bookmark side panel)を上書きするため
// opt-in 必須。textarea 以外の target(input / 非編集領域)は skip。
//
// 設計判断:
//   - format-panel.ts の wrapInline + applySelectionTransform の inline
//     equivalent を本 file で持ち、format-panel 外でも編集中の操作を
//     完備。両 path で同じ `wrapInline` 関数を共有することで「panel から
//     B を押す」 と「`Ctrl+B`」 が完全同等。
//   - Mac の `Cmd+B` も同等に動作(ctrlKey OR metaKey)。
//   - `Ctrl+U` は単純 wrap ではなく `applySimpleInlineAttr(sel, 'underline')`
//     経由(PKC dialect simple-inline、`:text:underline:`)

import { wrapInline, applySimpleInlineAttr, type Selection } from './format-panel';
import { editorFormatShortcutsEnabled } from './shell-flags';

/**
 * keydown event を解釈、対象 textarea があり認識 chord ならば format
 * を適用 + preventDefault して戻り値 `true`。それ以外は `false` で
 * caller(global keydown handler)に control を返す。
 *
 * 適用 chord:
 *   - `Ctrl+B` / `Cmd+B` → `**X**`(strong)
 *   - `Ctrl+I` / `Cmd+I` → `*X*`(emphasis)
 *   - `Ctrl+U` / `Cmd+U` → `:X:underline:`(simple-inline underline、PKC dialect)
 *   - `Ctrl+Shift+S` / `Cmd+Shift+S` → `~~X~~`(strikethrough)
 */
export function handleEditorFormatShortcut(e: KeyboardEvent): boolean {
  if (!editorFormatShortcutsEnabled()) return false;
  const ta = e.target;
  if (!(ta instanceof HTMLTextAreaElement)) return false;
  const ctrlOrCmd = e.ctrlKey || e.metaKey;
  if (!ctrlOrCmd) return false;
  const key = (e.key ?? '').toLowerCase();
  const hasShift = e.shiftKey;
  const hasAlt = e.altKey;
  // Alt は当面 skip(将来 chord 予約)
  if (hasAlt) return false;
  // Shift 単独(`Ctrl+Shift+S` のみ)で strikethrough を許容、それ以外は skip
  if (hasShift && key !== 's') return false;
  let transform: ((sel: Selection) => Selection) | null = null;
  if (!hasShift && key === 'b') transform = (s) => wrapInline(s, '**');
  else if (!hasShift && key === 'i') transform = (s) => wrapInline(s, '*');
  else if (!hasShift && key === 'u') transform = (s) => applySimpleInlineAttr(s, 'underline');
  else if (hasShift && key === 's') transform = (s) => wrapInline(s, '~~');
  if (!transform) return false;
  e.preventDefault();
  applyTransformToTextarea(ta, transform);
  return true;
}

/**
 * 指定 marker で textarea の current selection を wrap。
 * format-panel.ts:applySelectionTransform の inline equivalent。
 * 合成 input event で dirty-state / preview / commit に通知。
 */
export function applyWrapToTextarea(ta: HTMLTextAreaElement, marker: string): void {
  applyTransformToTextarea(ta, (s) => wrapInline(s, marker));
}

/**
 * pgc-187:任意の transform 関数(`(Selection) => Selection`)を textarea
 * に適用する汎用 helper。applyWrapToTextarea は内部で本関数を呼ぶ薄い
 * adapter になる(後方互換は破らない)。
 */
export function applyTransformToTextarea(
  ta: HTMLTextAreaElement,
  transform: (sel: Selection) => Selection,
): void {
  const start = ta.selectionStart ?? 0;
  const end = ta.selectionEnd ?? start;
  const sel: Selection = { value: ta.value, start, end };
  const result = transform(sel);
  ta.value = result.value;
  ta.selectionStart = result.start;
  ta.selectionEnd = result.end;
  // 合成 input event で dirty-state / preview / commit へ通知(action-binder)。
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  ta.focus();
}
