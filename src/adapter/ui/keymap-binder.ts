/**
 * Keymap binder(MASTER.md §4.6、wave-α PR pgc-82)。
 *
 * features 層 pure registry / parser / matcher を統合し、global keydown を
 * listen して合致 chord → command 実行へ繋ぐ adapter。
 *
 * Tier 0 flag `shell.keymap_registry_enabled`(default OFF)で gate ── ON で
 * 全 chord-binding(本 PR では限定 set:`Alt+1`〜`Alt+6` で view 切替 +
 * `F12` で flags inspector)が発火。OFF で完全 no-op、action-binder 上の
 * 既存 shortcut のみ動作。
 *
 * **本 POC は既存 shortcut(`Ctrl+S` / `Ctrl+\` / `Ctrl+Shift+P` / `Ctrl+P` 等)
 * の migration はしない**:既存と衝突しない fresh shortcut を追加するに留め、
 * keymap registry の infrastructure を proof-of-concept として落とす。後続
 * PR で gradual migration。
 *
 * Chord sequence:本 binder は **2 chord までの leader pattern**(`Ctrl+K
 * Ctrl+S` 等)を sustain する内部 buffer を持つ。3 chord 以上は次 PR
 * scope 外(features 層は対応済、binder の sustain logic だけが小規模)。
 */

import type { KeyBinding, KeyChord } from '../../features/keymap/types';
import { eventToChord, parseKeybindString } from '../../features/keymap/parse';
import { matchChordSequence } from '../../features/keymap/match';
import { executeCommand } from './command-palette';
import { shellKeymapRegistryEnabled } from './shell-flags';

const bindings: KeyBinding[] = [];

let chordBuffer: KeyChord[] = [];
let chordBufferTimer: ReturnType<typeof setTimeout> | null = null;
const CHORD_TIMEOUT_MS = 2000;

/**
 * 文字列形式の chord(`'Ctrl+K Ctrl+S'`)で binding を登録。parse 失敗時は
 * `false`(typo を fail-soft で受け止め、他 binding を巻き込まない)。
 */
export function registerKeyBinding(
  keybindStr: string,
  commandId: string,
): boolean {
  const seq = parseKeybindString(keybindStr);
  if (!seq) {
    if (typeof console !== 'undefined') {
      console.warn(`[keymap] invalid keybind string: ${keybindStr}`);
    }
    return false;
  }
  bindings.push({ sequence: seq, commandId });
  return true;
}

/**
 * 全 binding 一覧(test / inspector 表示用)。
 */
export function getKeyBindings(): readonly KeyBinding[] {
  return [...bindings];
}

/**
 * test 用 ── 全 binding を消去。
 */
export function resetKeymapRegistry(): void {
  bindings.length = 0;
  resetChordBuffer();
}

function resetChordBuffer(): void {
  chordBuffer = [];
  if (chordBufferTimer) {
    clearTimeout(chordBufferTimer);
    chordBufferTimer = null;
  }
}

/**
 * global keydown handler。flag OFF / textarea 編集中はスキップ。
 * 戻り値:event を捕まえて執行した場合 `true`(caller が preventDefault 等)。
 */
export function handleKeymapKeydown(e: KeyboardEvent): boolean {
  if (!shellKeymapRegistryEnabled()) return false;
  // textarea / input 等の編集中は keymap registry をスキップ(誤発火を避ける)
  const target = e.target;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
    // ただし leader key を待っている途中なら buffer を捨てる
    if (chordBuffer.length > 0) resetChordBuffer();
    return false;
  }
  // modifier 単独(Ctrl だけ等)は無視
  const k = (e.key ?? '').toLowerCase();
  if (k === 'control' || k === 'shift' || k === 'alt' || k === 'meta') return false;

  const chord = eventToChord(e);
  const next = [...chordBuffer, chord];
  const m = matchChordSequence(next, bindings);
  if (m.kind === 'matched') {
    resetChordBuffer();
    e.preventDefault();
    const ok = executeCommand(m.binding.commandId);
    if (!ok && typeof console !== 'undefined') {
      console.warn(`[keymap] command not registered: ${m.binding.commandId}`);
    }
    return true;
  }
  if (m.kind === 'partial') {
    // leader chord:buffer を進めて次 chord を待つ
    chordBuffer = next;
    if (chordBufferTimer) clearTimeout(chordBufferTimer);
    chordBufferTimer = setTimeout(() => resetChordBuffer(), CHORD_TIMEOUT_MS);
    e.preventDefault();
    return true;
  }
  // no match:buffer は捨てる
  if (chordBuffer.length > 0) resetChordBuffer();
  return false;
}

/**
 * 本 PR が registry に登録する **fresh binding set**(既存 shortcut と
 * 衝突しないもの限定):
 * - `Alt+1`〜`Alt+6`:view モード 6 種への直接切替(VSCode の `Ctrl+1..` の
 *   PKC2 等価、ただし browser tab 切替と衝突しない `Alt`)
 * - `F12`:Flags Inspector を開く
 * - `Ctrl+K Ctrl+S`:Show keyboard shortcuts(chord 列のデモ)
 *
 * boot 時 `main.ts` から呼ぶ。既存 shortcut への影響なし。
 */
export function registerBuiltinKeymaps(): void {
  registerKeyBinding('Alt+1', 'view.detail');
  registerKeyBinding('Alt+2', 'view.calendar');
  registerKeyBinding('Alt+3', 'view.kanban');
  registerKeyBinding('Alt+4', 'view.filer');
  registerKeyBinding('Alt+5', 'view.graph');
  registerKeyBinding('Alt+6', 'view.launcher');
  registerKeyBinding('F12', 'app.flags');
  registerKeyBinding('Ctrl+K Ctrl+S', 'app.shortcuts');
}
