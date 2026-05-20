/**
 * Sidebar mode flag (領域 10-6 ζ'' Phase 4 follow-up / Phase γ-A1).
 *
 * User direction(2026-05-05):
 * > 左ペインをエクスプローラモードのファイラに入れ替える flags を追加して
 *
 * `sidebar.mode = 'tree' | 'filer'`. filer = a compact filer-explorer
 * surface(DnD 移動 / per-folder 絞り込み検索 / multi-select 一括操作
 * を備え、pgc-32〜36 で tree-mode 同等の management 能力に到達)。
 * tree = legacy folder tree。
 *
 * **Phase γ-A1(pgc-37、user direction「filer をデフォルト化まで
 * 進める」)で default を `'tree'` → `'filer'` に切替**。tree mode は
 * `sidebar.mode=tree` で opt-in できる legacy 経路として保持する。
 */

import { defineFlag } from '../../core/flags';

export const sidebarMode = defineFlag<string>(
  'sidebar.mode',
  'filer',
  {
    enum: ['tree', 'filer'],
    category: 'sidebar',
    description: '左ペインの表示モード:filer=エクスプローラ風 filer(default)/ tree=旧フォルダツリー(legacy)',
    tier: 0,
  },
);

/**
 * `folder.detail_as_filer = true` で folder を select した detail
 * 表示を filer view に差し替える(2026-05-05 user direction:「フォルダ
 * の detail はファイラー表示にして、フォルダの detail を実質の廃止に
 * しましょう」)。デフォルト false で既存挙動を保持し、user が opt-in
 * で実験できる段階移行。
 */
export const folderDetailAsFiler = defineFlag<boolean>(
  'folder.detail_as_filer',
  false,
  {
    category: 'folder',
    description: 'フォルダ選択時の detail 表示を filer view に差し替える(opt-in)',
    tier: 0,
  },
);
