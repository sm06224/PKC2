/**
 * Keymap match(pure)。
 * registry の `KeyBinding[]` と incoming `KeyChord` 列を照合し、合致する
 * binding を返す。chord 列(`Ctrl+K Ctrl+S` の 2 chord 等)に対応。
 *
 * 本 POC の chord buffer 状態管理は adapter `keymap-binder.ts` が握る。
 * 本 file は **stateless な pure 照合関数のみ**。
 */

import type { KeyBinding, KeyChord } from './types';
import { chordEquals } from './types';

export type MatchResult =
  | { kind: 'matched'; binding: KeyBinding }
  | { kind: 'partial'; candidates: readonly KeyBinding[] }
  | { kind: 'none' };

/**
 * incoming chord buffer(末尾が最新)を全 bindings と比較。
 * - 完全一致 1 件以上 → `matched`(commandId 経由で実行)。
 * - prefix-match(残り chord を待てば合致しうる)複数 → `partial`(buffer を
 *   そのまま保持して次 chord を待つ)。
 * - 無し → `none`(buffer を捨てる)。
 *
 * **conflict**:完全一致 1 件 + partial 候補 1 件以上 が同時に起きた場合は
 * **完全一致を優先**(矛盾しない VSCode の挙動と一致)。
 */
export function matchChordSequence(
  buffer: readonly KeyChord[],
  bindings: readonly KeyBinding[],
): MatchResult {
  if (buffer.length === 0) return { kind: 'none' };
  const exact: KeyBinding[] = [];
  const partial: KeyBinding[] = [];
  for (const b of bindings) {
    if (b.sequence.length === 0) continue;
    if (b.sequence.length === buffer.length) {
      if (sequenceMatchesPrefix(b.sequence, buffer)) {
        exact.push(b);
      }
    } else if (b.sequence.length > buffer.length) {
      if (sequenceMatchesPrefix(b.sequence, buffer)) {
        partial.push(b);
      }
    }
    // 長すぎる buffer は never match
  }
  if (exact.length > 0) {
    // 完全一致が複数 → 最初(register 順)を採用
    return { kind: 'matched', binding: exact[0]! };
  }
  if (partial.length > 0) {
    return { kind: 'partial', candidates: partial };
  }
  return { kind: 'none' };
}

function sequenceMatchesPrefix(
  binding: readonly KeyChord[],
  buffer: readonly KeyChord[],
): boolean {
  if (buffer.length > binding.length) return false;
  for (let i = 0; i < buffer.length; i++) {
    if (!chordEquals(binding[i]!, buffer[i]!)) return false;
  }
  return true;
}
