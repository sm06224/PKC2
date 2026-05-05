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
