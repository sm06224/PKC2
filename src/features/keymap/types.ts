/**
 * Keymap registry — pure types(vscode-grade-overhaul-2026-05 MASTER.md §4.6、
 * wave-α PR pgc-82)。
 *
 * Tier 0 flag `shell.keymap_registry_enabled`(default OFF)で gate された
 * adapter `keymap-binder.ts` が global keydown を listen して chord match。
 *
 * **本層は完全 pure**(invariant I4)── KeyboardEvent は型としてのみ参照。
 */

/**
 * 単一 chord(1 keystroke = 1 chord)。modifier の組み合わせ + key。
 * key は **KeyboardEvent.key**(case-insensitive 比較)、または特殊 key
 * (`F1` 〜 `F12`、`ArrowUp` 等)。
 */
export interface KeyChord {
  readonly ctrl: boolean;
  readonly shift: boolean;
  readonly alt: boolean;
  readonly meta: boolean;
  /** lowercase 化された key 名(`p` / `arrowup` / `f12` / `,` 等)。 */
  readonly key: string;
}

/**
 * Keybind = 1 個以上の chord の sequence。
 * chord 1 個 → 単一 shortcut(`Ctrl+P`)。
 * chord 複数 → chord 列(VSCode の `Ctrl+K Ctrl+S` 等)。
 *
 * 本 POC では sequence は最大 2 chord までを想定(`leader + sub`)。
 * 3 chord 以上は registry 上 register 可能だが、adapter binder 側で
 * 拡張未対応のため発火しない場合がある。
 */
export interface KeyBinding {
  readonly sequence: readonly KeyChord[];
  /** 紐付け先 command id(`command-palette.ts` の registry にある必要)。 */
  readonly commandId: string;
  /**
   * Modal scope(future、本 POC では `'global'` のみ)。
   * 例:`'editing'` なら edit phase のときだけ発火、`'detail'` なら detail
   * view のときだけ、等。
   */
  readonly scope?: 'global';
}

/**
 * Bare chord 比較(modifier + key)。
 */
export function chordEquals(a: KeyChord, b: KeyChord): boolean {
  return (
    a.ctrl === b.ctrl
    && a.shift === b.shift
    && a.alt === b.alt
    && a.meta === b.meta
    && a.key === b.key
  );
}

/**
 * Chord 文字列の正規表現 ── parse 前 sanity check に使う。
 */
export const CHORD_TOKEN_RE = /^(?:(Ctrl|Cmd|Shift|Alt|Meta)\+)*(.+)$/i;
