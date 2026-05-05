/**
 * Sidebar mode flag (領域 10-6 ζ'' Phase 4 follow-up).
 *
 * User direction(2026-05-05):
 * > 左ペインをエクスプローラモードのファイラに入れ替える flags を追加して
 *
 * `sidebar.mode = 'tree' | 'filer'`. tree = legacy folder tree
 * (default). filer = a compact filer-explorer surface so the
 * user can navigate folders the same way as the center pane.
 */

import { defineFlag } from '../../core/flags';

export const sidebarMode = defineFlag<string>(
  'sidebar.mode',
  'tree',
  {
    enum: ['tree', 'filer'],
    category: 'sidebar',
    description: '左ペインの表示モード:tree=既存フォルダツリー / filer=エクスプローラ風 filer',
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
