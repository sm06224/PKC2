/**
 * Sidebar mode flag (領域 10-6 ζ'' Phase 4 follow-up / Phase γ-A1).
 *
 * User direction(2026-05-05):
 * > 左ペインをエクスプローラモードのファイラに入れ替える flags を追加して
 *
 * `sidebar.mode = 'tree' | 'filer'`. tree = legacy folder tree。filer =
 * a compact filer-explorer surface(DnD 移動 / per-folder 絞り込み検索 /
 * multi-select 一括操作 を備える)。
 *
 * **Default 変遷**:Phase γ-A1 pgc-37 で default を `'filer'` に切替えた
 * ものの、filer sidebar が tree の検索系(検索窓・hide-buckets・archetype
 * filter・saved searches・advanced filters・unreferenced-attachments
 * filter・recent-entries pane)を欠いており機能ダウンだったため pgc-41 で
 * `'tree'` に revert。その後 **pgc-46〜51 で上記 7 機能すべてを filer へ
 * 移植完了**(wave map A1-2/A1-3「検索系の filer 移植」)── filer は
 * search(full-text)/ archetype / color / 4 toggle filter / Recent pane /
 * Saved Searches を獲得し tree と検索能力同等に到達した。前提が揃った
 * ため **pgc-52(A1-4 再挑戦)で default を `'filer'` に再切替**。tree は
 * `sidebar.mode=tree` で opt-in に変わる。
 */

import { defineFlag } from '../../core/flags';

export const sidebarMode = defineFlag<string>(
  'sidebar.mode',
  'filer',
  {
    enum: ['tree', 'filer'],
    category: 'sidebar',
    description: '左ペインの表示モード:filer=エクスプローラ風 filer(default、検索/フィルタ/Saved Searches 完備)/ tree=フォルダツリー(opt-in)',
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
