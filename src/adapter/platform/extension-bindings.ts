/**
 * 拡張の紐付けレジストリ(host-push 体系、#806 設計 doc rev.2 §2/§3.1 —
 * 一括実装 4/6)。
 *
 * **紐付け(導入)= ユーザーが「この拡張は send したものを受け取れる」と
 * 結ぶ standing opt-in 契約**(設計 doc §0-3)。本モジュールはその台帳:
 *
 *   - 紐付け済み拡張の集合(右クリック「拡張へ送る」の宛先候補)
 *   - archetype / mime 別の既定送り先(設定済みなら一発送付)
 *
 * 拡張は **asset 由来 HTML を載せた attachment entry の lid** で識別する。
 * localStorage 永続(pane-prefs と同型、reducer / container schema 非依存)。
 * storage 不可時は in-memory cache で session 内のみ有効。
 *
 * G3(設計 doc §4): 既定送り先は**可視・取消可能**であること。本モジュール
 * は `list*` / `clear*` を提供し、設定 UI(別 PR)がそれを使う。
 */

import { peekAttachmentMeta } from '@features/extension-host/projection';
import { getUiPref, setUiPref } from './ui-prefs';

export const EXTENSION_BINDINGS_KEY = 'pkc2.extensionBindings';

export interface ExtensionBindings {
  /** 紐付け済み拡張の lid 集合(送付ジェスチャの宛先候補)。 */
  bound: string[];
  /** match key(`archetype:<id>` / `mime:<type>`)→ 既定送り先拡張 lid。 */
  defaults: Record<string, string>;
}

let cache: ExtensionBindings | null = null;

function read(): ExtensionBindings {
  if (cache) return cache;
  cache = readFromStorage() ?? { bound: [], defaults: {} };
  return cache;
}

function write(next: ExtensionBindings): void {
  cache = next;
  setUiPref(EXTENSION_BINDINGS_KEY, JSON.stringify(next));
}

function readFromStorage(): ExtensionBindings | null {
  // C11: ui-prefs facade 経由(container バッグ優先 + localStorage
  // ミラー)。紐付けは standing opt-in 契約なので storage 初期化で
  // 失われないことが特に重要。
  const raw = getUiPref(EXTENSION_BINDINGS_KEY);
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;
  const bound = Array.isArray(obj.bound)
    ? obj.bound.filter((x): x is string => typeof x === 'string')
    : [];
  const defaults: Record<string, string> = {};
  if (obj.defaults && typeof obj.defaults === 'object') {
    for (const [k, v] of Object.entries(obj.defaults as Record<string, unknown>)) {
      if (typeof v === 'string') defaults[k] = v;
    }
  }
  return { bound, defaults };
}

/** Snapshot(読み取り専用)。 */
export function loadExtensionBindings(): ExtensionBindings {
  const b = read();
  return { bound: [...b.bound], defaults: { ...b.defaults } };
}

/** 拡張を紐付ける(冪等)。 */
export function bindExtension(lid: string): void {
  const b = read();
  if (b.bound.includes(lid)) return;
  write({ ...b, bound: [...b.bound, lid] });
}

/** 紐付け解除。既定送り先に使われていたら、その既定も消す(整合)。 */
export function unbindExtension(lid: string): void {
  const b = read();
  const bound = b.bound.filter((x) => x !== lid);
  const defaults: Record<string, string> = {};
  for (const [k, v] of Object.entries(b.defaults)) if (v !== lid) defaults[k] = v;
  write({ bound, defaults });
}

export function isExtensionBound(lid: string): boolean {
  return read().bound.includes(lid);
}

/** match key を組む(archetype / mime)。mime は `image/png` 等の完全一致。 */
export function matchKeyForArchetype(archetype: string): string {
  return `archetype:${archetype}`;
}
export function matchKeyForMime(mime: string): string {
  return `mime:${mime}`;
}

/**
 * entry の既定送り先 lookup key。attachment は mime 優先(`.pdf` の既定 =
 * pdf-viewer、のような種類別設定)、mime 不明 / 非 attachment は archetype。
 */
export function matchKeyForEntry(entry: { archetype: string; body: string }): string {
  if (entry.archetype === 'attachment') {
    const meta = peekAttachmentMeta(entry.body);
    if (meta.mime) return matchKeyForMime(meta.mime);
  }
  return matchKeyForArchetype(entry.archetype);
}

/**
 * 既定送り先を設定。**紐付け済みの拡張のみ**既定にできる(未紐付けを
 * 既定にすると送付できない不整合になるため)。設定できたら true。
 */
export function setDefaultTarget(matchKey: string, extLid: string): boolean {
  const b = read();
  if (!b.bound.includes(extLid)) return false;
  write({ ...b, defaults: { ...b.defaults, [matchKey]: extLid } });
  return true;
}

/** 既定送り先 lid(無ければ null)。紐付け解除済みなら null(整合チェック)。 */
export function getDefaultTarget(matchKey: string): string | null {
  const b = read();
  const lid = b.defaults[matchKey];
  if (!lid) return null;
  return b.bound.includes(lid) ? lid : null;
}

/** 既定送り先を取り消す。 */
export function clearDefaultTarget(matchKey: string): void {
  const b = read();
  if (!(matchKey in b.defaults)) return;
  const defaults: Record<string, string> = {};
  for (const [k, v] of Object.entries(b.defaults)) if (k !== matchKey) defaults[k] = v;
  write({ ...b, defaults });
}

/** Test-only: module cache をリセット(localStorage を直接操作する suite 用)。 */
export function __resetExtensionBindingsCacheForTest(): void {
  cache = null;
}

