/**
 * Keymap chord 文字列 parser(pure)。
 *
 * 「Ctrl+Shift+P」「Alt+1」「Ctrl+K Ctrl+S」(chord 列)等の人間可読
 * shortcut 表記を {@link KeyChord} 列に変換する。
 *
 * Rules:
 * - tokens は `+` で分離、modifiers は前置、key 名は最後
 * - modifiers:`Ctrl` / `Cmd` / `Meta` / `Shift` / `Alt`(case-insensitive)
 *   - `Cmd` / `Meta` は同義(macOS の Command key)── 内部は `meta`
 *   - `Ctrl` は **Ctrl** のみ(`meta` には flag が立たない)
 * - key:1 文字なら lowercase 化、複数 char(`F12` / `ArrowUp`)は lowercase
 *   化のみ(`f12` / `arrowup`)
 * - chord 列:空白(1 個以上)で分離(`Ctrl+K Ctrl+S` = 2 chord)
 *
 * Error:invalid な文字列は `null` を返す(throw しない、registry 側で
 * 「skip」 判断に使う、user 設定の typo を fail-soft で受け止める)。
 */

import type { KeyChord } from './types';

export function parseKeybindString(input: string): readonly KeyChord[] | null {
  if (!input || typeof input !== 'string') return null;
  const tokens = input.trim().split(/\s+/);
  if (tokens.length === 0) return null;
  const out: KeyChord[] = [];
  for (const tok of tokens) {
    const c = parseSingleChord(tok);
    if (!c) return null;
    out.push(c);
  }
  return out;
}

function parseSingleChord(token: string): KeyChord | null {
  if (!token) return null;
  const parts = token.split('+');
  if (parts.length === 0) return null;
  let ctrl = false;
  let shift = false;
  let alt = false;
  let meta = false;
  for (let i = 0; i < parts.length - 1; i++) {
    const m = parts[i]!.toLowerCase();
    if (m === 'ctrl') ctrl = true;
    else if (m === 'cmd' || m === 'meta') meta = true;
    else if (m === 'shift') shift = true;
    else if (m === 'alt') alt = true;
    else return null; // unknown modifier
  }
  const keyPart = parts[parts.length - 1];
  if (!keyPart) return null;
  return {
    ctrl,
    shift,
    alt,
    meta,
    key: keyPart.toLowerCase(),
  };
}

/**
 * `KeyboardEvent` を {@link KeyChord} に正規化する。
 * - macOS / Windows の `Ctrl` vs `Meta` の差異を吸収する目的で、Ctrl と Meta
 *   は **両方 OR で扱う** ことを registry 側に任せたい場合の helper として
 *   `eventToChord(event)` を提供。
 *
 * **本 helper は browser API(KeyboardEvent)に触れるが、KeyChord 型は
 * pure**。pure registry を browser 側で叩く glue として、本 file 自体は
 * features 層に置く(KeyboardEvent は型 import のみ)。
 */
export function eventToChord(e: KeyboardEvent): KeyChord {
  return {
    ctrl: e.ctrlKey,
    shift: e.shiftKey,
    alt: e.altKey,
    meta: e.metaKey,
    // KeyboardEvent.key は "P" / "p" / "F12" / "ArrowUp" 等 ── lowercase 化
    key: (e.key ?? '').toLowerCase(),
  };
}
