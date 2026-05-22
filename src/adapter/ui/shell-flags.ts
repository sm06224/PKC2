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

// 子 entry-window が開いている間、main window の reload / close 時に
// browser native の確認を出す(編集中の子 window を巻き込む事故を防ぐ)。
// spec §3.2 は default ON を想定するが、γ-A stack は全 flag OFF で
// 「opt-in するまで完全 no-op」を保つため OFF で出荷、採用時に user が
// 切り替える。
export const shellMainReloadGuardEnabled = defineFlag<boolean>(
  'shell.main_reload_guard',
  false,
  {
    category: 'shell',
    description:
      '子 entry-window が開いている間、main の reload / close 時に確認ダイアログを出す',
  },
);

// window role 分離(γ-A5、multi-window-vscode-extension-spec §3 / §8)。
// ON で editor entry-window から「別窓プレビュー」= viewer role の子 window
// を分離できる。OFF で従来どおり editor window のみ(完全後方互換)。
export const shellWindowRolesEnabled = defineFlag<boolean>(
  'shell.window_roles',
  false,
  {
    category: 'shell',
    description:
      'window role 分離(editor / viewer)を有効化。OFF で editor window のみ',
  },
);
