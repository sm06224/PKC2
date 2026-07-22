/**
 * 編集モード persistence — Group A、Phase γ-A2(A2-3、2026-05-20)。
 *
 * `editMode`(`inline` / `window`、shell spec §2.5)を localStorage に
 * 永続化し、reload 後も user の選択した編集 surface を復元する。
 *
 * これは **viewer-local な runtime preference**:`container.meta` には
 * 書かず、export / import には参加せず、device 間で同期しない。「中央
 * ペインで編集したい / 専用ウィンドウで編集したい」は端末ごとの好み
 * だからである(shell spec §2.3、`folder-prefs.ts` と同じ方針)。
 *
 * Storage key:`pkc2.editMode`。値は `'inline'` または `'window'` の
 * 文字列そのもの(JSON ではない — 単一 enum なので最小形)。
 *
 * Fallback(`folder-prefs.ts` と同様):
 *   - localStorage 不可(private browsing / quota / SSR)→ `loadEditMode`
 *     は `null`、`saveEditMode` は no-op。editMode は γ-A2 foundation の
 *     既定(undefined = inline)に戻る = 完全後方互換。
 *   - 未知 / 不正な格納値 → `null` 扱い(呼び出し側が既定 inline を使う)。
 *
 * No reducer / AppState coupling:本モジュールは pure な load / save の
 * み。main.ts が boot 時に 1 回読んで `SET_EDIT_MODE` を dispatch し、
 * action-binder の `set-edit-mode` handler が user 選択時に書く。
 */

import { getUiPref, setUiPref } from './ui-prefs';

/** Storage key。衝突回避のため `pkc2.` namespace。 */
export const EDIT_MODE_STORAGE_KEY = 'pkc2.editMode';

/**
 * 永続化された編集モードを読む。未設定 / storage 不可 / 不正値の
 * いずれも `null` を返す。`null` = 「永続値なし」= 呼び出し側は既定
 * (inline)を使う、という契約。
 *
 * C11: 読み書きは ui-prefs facade 経由(container バッグ優先 +
 * localStorage ミラー)。localStorage が毎回初期化される環境でも
 * container 側の値で復元される。
 */
export function loadEditMode(): 'inline' | 'window' | null {
  const raw = getUiPref(EDIT_MODE_STORAGE_KEY);
  if (raw === 'inline' || raw === 'window') return raw;
  return null;
}

/**
 * 編集モードを書く。storage 不可なら no-op(この session は runtime
 * state のみで動作、reload で既定に戻る)。
 */
export function saveEditMode(mode: 'inline' | 'window'): void {
  setUiPref(EDIT_MODE_STORAGE_KEY, mode);
}
