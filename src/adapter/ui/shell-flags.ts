// Tier 0 flags for the shell editing-mode system (Phase γ-A).
// Spec: docs/development/phase-beta-group-a-shell-spec-2026-05.md §5.

import { defineFlag } from '@core/flags';

// 編集モードの選択(inline / window)を有効化する。OFF で従来の inline
// 編集のみ(完全後方互換)。
export const shellEditModeEnabled = defineFlag<boolean>(
  'shell.edit_mode_enabled',
  false,
  {
    category: 'shell',
    description:
      '編集モードの選択(inline / window)を有効化。OFF で従来の inline 編集のみ',
  },
);
