/**
 * PR-2FF(2026-05-12、reform Phase 3 Block E 2/2):アプリランチャー Phase 1
 * foundation。
 *
 * 設計(`docs/development/feature-requests-2026-04-28-roadmap.md` 領域 10-7):
 *   PKC2 単一 HTML 内で複数の「アプリ」(別目的の view / mode)を切替できる
 *   launcher UI の data 層 foundation。Editor / Calendar / Kanban / Filer /
 *   Album などを入口で選択する dashboard 的位置付け。
 *
 * 本 PR の scope:
 *   - **app registry**(pure data structure)— 既知 app の id / label / icon /
 *     target view-mode をテーブル化
 *   - **URL flag `?app=<id>`** の parse helper
 *   - 実 UI rendering / state mutation / dispatcher 統合は **別 PR で**
 *     (Phase 2 foundation、本 PR は data 層のみ)
 *
 * Layer rule:features は core / 他 features のみ参照可、adapter / runtime
 * は touch しない。
 */

export type LauncherAppId =
  | 'detail'
  | 'calendar'
  | 'kanban'
  | 'filer'
  | 'graph'
  | 'album'
  | 'flags';

export interface LauncherApp {
  id: LauncherAppId;
  label: string;
  /** 1〜2 文字の絵文字 / 記号(launcher の card icon)。 */
  icon: string;
  /** 一行説明(launcher card の subtitle)。 */
  description: string;
  /**
   * Target view-mode を dispatch して切替える(app が view-mode の場合)、
   * または overlay を立ち上げる(app が flags / album のような mode の場合)。
   */
  target:
    | { kind: 'view-mode'; viewMode: 'detail' | 'calendar' | 'kanban' | 'filer' | 'graph' }
    | { kind: 'overlay'; overlay: 'flags-inspector' }
    | { kind: 'auto-filer-album' };
}

/**
 * Built-in app registry。Phase 1 の最小集合。将来 PKC-extension で追加可能に
 * する場合は別 module(registry mutator)を新設する想定。
 */
export const LAUNCHER_APPS: readonly LauncherApp[] = [
  {
    id: 'detail',
    label: 'Detail',
    icon: '📄',
    description: 'Entry の本文を編集 / 表示する標準モード',
    target: { kind: 'view-mode', viewMode: 'detail' },
  },
  {
    id: 'calendar',
    label: 'Calendar',
    icon: '📅',
    description: 'Todo / Event を月別 calendar で表示',
    target: { kind: 'view-mode', viewMode: 'calendar' },
  },
  {
    id: 'kanban',
    label: 'Kanban',
    icon: '📊',
    description: 'Todo を status(open / done)別に列表示',
    target: { kind: 'view-mode', viewMode: 'kanban' },
  },
  {
    id: 'filer',
    label: 'Filer',
    icon: '🗂',
    description: 'Folder 階層を explorer / card grid で表示',
    target: { kind: 'view-mode', viewMode: 'filer' },
  },
  {
    id: 'graph',
    label: 'Graph',
    icon: '🪐',
    description: 'Entry 間の relation を force-directed graph で表示',
    target: { kind: 'view-mode', viewMode: 'graph' },
  },
  {
    id: 'album',
    label: 'Album',
    icon: '📸',
    description: '画像 folder を contact sheet で表示(`kind: album`)',
    target: { kind: 'auto-filer-album' },
  },
  {
    id: 'flags',
    label: 'Flags',
    icon: '⚑',
    description: 'Runtime flag inspector(experimental feature 切替)',
    target: { kind: 'overlay', overlay: 'flags-inspector' },
  },
];

/** id 指定で app を lookup、未登録なら undefined。 */
export function findLauncherApp(id: string): LauncherApp | undefined {
  return LAUNCHER_APPS.find((a) => a.id === id);
}

/**
 * URL の `?app=<id>` query parameter から指定 app を解決する。
 *
 * @param search `location.search` 等(`'?app=calendar&foo=1'`)
 * @returns id が valid なら app、未指定 / 不正 id / `app=launcher` は null
 *
 * `app=launcher` は **launcher 自体を表示するフラグ**(個別 app へ jump しない、
 * `?app=` 無しと別状態として区別、Phase 2 で UI 起動条件として使う)。
 */
export function parseAppQueryParam(search: string): LauncherApp | null {
  let s = search;
  if (s.startsWith('?')) s = s.slice(1);
  const params = new URLSearchParams(s);
  const id = params.get('app');
  if (!id) return null;
  if (id === 'launcher') return null; // launcher 自体を表示する flag(個別 app jump しない)
  return findLauncherApp(id) ?? null;
}

/**
 * `?app=launcher` が指定されたかどうか。Phase 2 で UI 起動条件として使う。
 */
export function isLauncherRequested(search: string): boolean {
  let s = search;
  if (s.startsWith('?')) s = s.slice(1);
  const params = new URLSearchParams(s);
  return params.get('app') === 'launcher';
}
