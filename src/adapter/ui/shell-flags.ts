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

// Context Menu universal 化(MASTER.md §4.7、pgc-83 POC)を有効化。
// ON で center / sidebar / meta / header の **background**(specific element に
// 着いていない場所)を右クリックすると region-aware menu が出る。OFF で
// 従来挙動(specific element でだけ menu、background は browser native)。
export const shellContextMenuUniversalEnabled = defineFlag<boolean>(
  'shell.context_menu_universal_enabled',
  false,
  {
    category: 'shell',
    description:
      'Context Menu の universal 化(region 背景の右クリックで region-aware menu)',
  },
);

// Tab system(MASTER.md §4.3、pgc-85 POC)を有効化。ON で center pane に
// tab strip(複数 entry 同時 open)が描画される。OFF で従来どおり 1 entry
// 表示のみ。
export const shellTabsEnabled = defineFlag<boolean>(
  'shell.tabs_enabled',
  false,
  {
    category: 'shell',
    description:
      'Tab system(center pane に open entry の tab strip を描画)',
  },
);

// Split View(MASTER.md §4.3 / §5.5、pgc-89 POC)を有効化。ON で center
// pane を 2 半に split し、secondary pane に read-only viewer を出す。
// OFF で従来 1-pane 表示。
export const shellSplitViewEnabled = defineFlag<boolean>(
  'shell.split_view_enabled',
  false,
  {
    category: 'shell',
    description:
      'Split View(center pane を 2 半に split、secondary は read-only viewer)を有効化',
  },
);

// Header の create button 集約(MASTER.md §6.1、pgc-99 wave-γ #1)。
// ON で 5 個の archetype create button(📝 Text / 📋 Log / ☑ Todo / 📎 File
// / 📁 Folder)を 1 個の `+ New` button + popover picker に集約する。click
// で popover を toggle、popover 内に 5 件の row(同じ data-pkc-action
// + data-pkc-archetype を持ち、既存 handler から透明)。Light mode の
// attachment disable、context-folder の追従、keyboard shortcut(Ctrl+N
// 等)は全て不変。OFF で従来どおり 5 個ボタンを inline 表示。
export const shellNewButtonPickerEnabled = defineFlag<boolean>(
  'shell.new_button_picker_enabled',
  false,
  {
    category: 'shell',
    description:
      'Header の 5 個 archetype create button を `+ New` 1 個 + popover picker に集約',
  },
);

// Data… inline button を Shell Menu に集約(MASTER.md §6.1 phase 2、
// pgc-100 wave-γ #2)。ON で header の `<details>Data…</details>` 経由
// export/import panel を header から外し、Shell Menu の Maintenance
// section 直前に「Data」section として埋め込む。OFF で従来どおり header
// inline。readonly mode の TEXTLOGs / TEXTs / Mixed 直接 export button は
// 影響なし(`Data…` 自体が !readonly 時のみ出るため)。
export const shellDataInShellMenuEnabled = defineFlag<boolean>(
  'shell.data_in_shell_menu_enabled',
  false,
  {
    category: 'shell',
    description:
      'Data… inline export/import panel を Shell Menu の section に集約(header から外す)',
  },
);

// header back/forward を breadcrumb 内 ⇐ ⇒ アイコンに統合(MASTER.md
// §6.1 phase 3、pgc-101 wave-γ #3)。ON で 従来 header 上段の独立
// `pkc-header-nav` group(`◀` `▶` button)を非表示にし、breadcrumb
// (`pkc-header-path` nav)の先頭に `⇐` `⇒` icon を prepend する。
// breadcrumb が選択無しで null になる場合でも、本 flag ON 時は
// `⇐` `⇒` だけを含む minimal nav を fallback として出す(navigation
// 動線が常に維持される)。OFF で従来どおり標準 nav group が上段。
export const shellBackForwardInBreadcrumbEnabled = defineFlag<boolean>(
  'shell.back_forward_in_breadcrumb_enabled',
  false,
  {
    category: 'shell',
    description:
      'header back/forward `◀` `▶` を breadcrumb 内 `⇐` `⇒` icon に統合',
  },
);
