/**
 * Command Palette — feature 層の pure 型定義(vscode-grade-overhaul-2026-05
 * MASTER.md §4.1)。
 *
 * 「command を fuzzy search で起動」 という VSCode core 体験を PKC2 へ。
 * 本 file は **browser API 非依存 pure**(invariant I4)── handler 関数や
 * dispatcher は adapter 層 `command-palette.ts` で結合する。
 *
 * Tier 0 flag `shell.command_palette_enabled`(default OFF)で gate。
 */

/**
 * Command の所属カテゴリ。Command Palette の list で group 分けに使う。
 * 必要に応じて拡張(全 string union だが、リストの安定性のため厳格に管理)。
 */
export type CommandCategory =
  | 'View'         // view-mode 切替、focus mode、reading mode
  | 'Entry'        // 新規作成、削除、複製、save 等 entry 単位の操作
  | 'Edit'         // 編集モード遷移、format、insert 系
  | 'Navigation'   // back / forward、folder 移動、heading jump
  | 'Search'       // search、Quick Open、Find / Replace
  | 'Shell'        // sidebar / meta pane toggle、shell menu、focus mode
  | 'Theme'        // theme 切替、accent / border / font 等
  | 'Multi-window' // viewer / monitor / editor window 開く
  | 'Debug'        // flags inspector / debug overlay
  | 'Help';        // shortcut help / about

/**
 * Command の **pure meta** 定義。features 層に置く。
 * 実際の handler / dispatch logic は adapter 層が登録時に紐付ける。
 *
 * - `id` は dot-separated namespace 風(`view.detail` / `entry.create.text`)。
 *   重複登録は adapter 側 registry が warning として処理。
 * - `titleJa` / `titleEn` は両方 fuzzy match 対象、user の言語 setting に
 *   応じて表示は切替(MVP は両方併記)。
 * - `keybind` は **表示専用**(palette 内の右端で hint として出す)── 実際の
 *   shortcut wiring は別途 keymap-binder で行う(本書 §4.6 で扱う pgc-82
 *   の予定)。MVP は表示のみ。
 */
export interface CommandMeta {
  readonly id: string;
  readonly titleJa: string;
  readonly titleEn: string;
  readonly category: CommandCategory;
  readonly keybind?: string;
  readonly description?: string;
}

/**
 * Command meta の **validation**(adapter registry が登録時に呼ぶ)。
 * - id が空 / 非 ASCII / 重複 → error 文字列を返す
 * - title 系が空 → error
 *
 * pure ── browser API 非依存。
 */
export function validateCommandMeta(
  meta: CommandMeta,
  existingIds: ReadonlySet<string>,
): string | null {
  if (!meta.id || typeof meta.id !== 'string') return 'id is required (non-empty string)';
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(meta.id)) {
    return `id must be lowercase ASCII (got: ${meta.id})`;
  }
  if (existingIds.has(meta.id)) return `duplicate id: ${meta.id}`;
  if (!meta.titleJa || typeof meta.titleJa !== 'string') return 'titleJa is required';
  if (!meta.titleEn || typeof meta.titleEn !== 'string') return 'titleEn is required';
  return null;
}
