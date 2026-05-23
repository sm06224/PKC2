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

// window layout 永続化(γ-A5-3、multi-window-vscode-extension-spec §4 / §8)。
// ON で子 window(editor / viewer / monitor)が geometry を main へ報告し、
// main が `localStorage['pkc2.windowLayout']` へ保存する。OFF で報告も保存も
// 行わない(完全 no-op)。復元 UI は後続スライス(A5-4)。
export const shellWindowLayoutPersistEnabled = defineFlag<boolean>(
  'shell.window_layout_persist',
  false,
  {
    category: 'shell',
    description:
      '子 window の geometry を localStorage に保存(マルチウィンドウ layout 永続化)',
  },
);

// 競合解決 diff view(γ-A5-5、multi-window-vscode-extension-spec §5 / §8)。
// ON で dual-edit 競合 overlay に「現 container body / 自分の draft」の
// 2-pane 行 diff を表示する。OFF で従来どおり 3 択ボタンのみ(diff なし)。
export const shellConflictDiffViewEnabled = defineFlag<boolean>(
  'shell.conflict_diff_view',
  false,
  {
    category: 'shell',
    description:
      'dual-edit 競合 overlay に 2-pane 行 diff を表示(現 body と draft の差分)',
  },
);

// Command Palette を有効化(vscode-grade-overhaul-2026-05 MASTER.md §4.1)。
// ON で `Ctrl+Shift+P` / `F1` で開く universal command launcher(fuzzy
// search で全 command 起動)。OFF で従来どおり(完全 no-op、wave-α POC)。
export const shellCommandPaletteEnabled = defineFlag<boolean>(
  'shell.command_palette_enabled',
  false,
  {
    category: 'shell',
    description:
      'Command Palette を有効化(Ctrl+Shift+P / F1 で fuzzy command launcher)',
  },
);


// Quick Open(vscode-grade-overhaul-2026-05 MASTER.md §4.2、pgc-81 POC)を
// 有効化。ON で `Ctrl+P` で entry fuzzy launcher を起動(browser print を
// 上書き)。`>` prefix で command mode。OFF で従来どおり(完全 no-op)。
export const shellQuickOpenEnabled = defineFlag<boolean>(
  'shell.quick_open_enabled',
  false,
  {
    category: 'shell',
    description:
      'Quick Open(Ctrl+P で entry fuzzy launcher、browser print 上書き)を有効化',
  },
);

// Keymap registry(vscode-grade-overhaul-2026-05 MASTER.md §4.6、pgc-82 POC)
// を有効化。ON で本 PR が登録する fresh chord(Alt+1〜6 で view 切替、F12 で
// Flags Inspector、Ctrl+K Ctrl+S で keyboard shortcuts 一覧)が発火する。
// OFF で完全 no-op、既存 shortcut のみ。
export const shellKeymapRegistryEnabled = defineFlag<boolean>(
  'shell.keymap_registry_enabled',
  false,
  {
    category: 'shell',
    description:
      'Keymap registry を有効化(Alt+1〜6 / F12 / Ctrl+K Ctrl+S 等の fresh shortcut)',
  },
);
