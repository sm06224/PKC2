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
 * **Phase γ-A1 pgc-37 で default を `'filer'` に切替えたが、pgc-41 で
 * `'tree'` に revert**。user 指摘(2026-05-20「左 pane を不完全な
 * ファイラーにした / ツリー表示の検索オプションが無くなった / 機能ダウン
 * しすぎ」)の通り、filer sidebar は tree sidebar が持つ検索窓・hide-buckets
 * ・archetype filter・saved searches・advanced filters・unreferenced-
 * attachments filter・recent-entries pane 等を欠いており、default 化は
 * 機能ダウンだった。wave map A1-2/A1-3(filer の tree-port / navigation
 * parity)が未達のまま A1-4(default 切替)を行った手順ミス。filer を
 * default にするのは上記検索機能を filer へ移植してからとし、それまでは
 * `sidebar.mode=filer` で opt-in する。
 */

import { defineFlag } from '../../core/flags';

export const sidebarMode = defineFlag<string>(
  'sidebar.mode',
  'tree',
  {
    enum: ['tree', 'filer'],
    category: 'sidebar',
    description: '左ペインの表示モード:tree=フォルダツリー(default、検索/フィルタ完備)/ filer=エクスプローラ風 filer(opt-in、検索機能は移植途上)',
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
