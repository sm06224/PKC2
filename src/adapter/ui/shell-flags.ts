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
  true,
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
  true,
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
  true,
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
  true,
  {
    category: 'shell',
    description:
      'header back/forward `◀` `▶` を breadcrumb 内 `⇐` `⇒` icon に統合',
  },
);

// Activity Bar(MASTER.md §6.2、pgc-102 wave-γ #4)を有効化。ON で
// sidebar の左に縦 strip の activity bar を **prepend** する ── VSCode の
// Activity Bar 相当(6 tab:📁 Explorer / 🔍 Search / 📊 Outline /
// 🔗 Relations / 📜 Recent / 📌 Pinned)。本 PR では visual scaffold
// + tab selection のみ ── 各 tab の中身は後続 pgc-103〜107 で順次実装、
// Explorer は既存 sidebar をそのまま出す(機能後退ゼロ)。OFF で従来
// どおり activity bar 無し(layout 不変)。
export const shellActivityBarEnabled = defineFlag<boolean>(
  'shell.activity_bar_enabled',
  false,
  {
    category: 'shell',
    description:
      'sidebar の左に Activity Bar(VSCode 流の縦 strip tab)を表示。Explorer / Search / Outline / Relations / Recent / Pinned の 6 tab、本 PR は scaffold のみ',
  },
);

// editor footer に word count / char count を表示(MASTER.md §7 text、
// pgc-125 wave-δ #1)。ON で text / textlog 編集時に editor 末尾に
// `📊 char / word / line` の compact metrics row を append。Inspector
// Style tab(pgc-118)が読み取り専用 archetype-level metrics を表示するの
// に対し、本 footer は **編集中の即座な目線確認**(editor 内で完結)に
// 特化 ── 編集中の目線移動を最小化、Notion / Bear / Typora 流の wordcount
// footer 動線。
//
// 注:本 PR は静的 render のみ(textarea 入力に追従しない)。live update は
// 後続 PR で textarea input event を hook して実装。
export const shellEditorFooterWordcountEnabled = defineFlag<boolean>(
  'shell.editor_footer_wordcount_enabled',
  true,
  {
    category: 'shell',
    description:
      'text / textlog editor の末尾に compact word count / char count metrics row を表示(編集中の目線確認動線)',
  },
);

// entry-window に slim sticky header(container / archetype / title 常駐
// 表示)を追加(user bug report 2026-05-24「マルチウィンドウ時にヘッダ
// フッタが見えないのもそうだし」、pgc-141 wave-δ #15)。child window は
// 現状 view-pane の `<h2>` title しか持たないため、scroll で title が
// 隠れたり container 由来が分からなくなる。ON で **body 先頭に sticky
// header**(`<header class="pkc-window-header">`)を追加 ── archetype icon
// + entry title + container name + close 動線、scroll で隠れない。
// footer(action bar)は既に sticky なので、本 flag は header 側のみ補完。
export const shellEntryWindowChromeEnabled = defineFlag<boolean>(
  'shell.entry_window_chrome_enabled',
  false,
  {
    category: 'shell',
    description:
      'entry-window 先頭に slim sticky header(archetype + title + container)を追加。scroll で隠れない',
  },
);

// entry-window(マルチウィンドウ)で text archetype の Split editor を
// **default OFF** にする(user bug report 2026-05-24「マルチウィンドウ時の
// Split View は不要とは言えないがデフォではない」、pgc-140 wave-δ #14)。
// ON で entry-window が text entry を開いた時、source / preview の
// **Split 表示ではなく従来 Source / Preview tab bar 切替** で起動。
// Split を見たい時は tab bar が出ているので user 側で操作可能。
// OFF で従来の split editor default(text archetype は常に split)。
export const shellEntryWindowSplitDefaultOffEnabled = defineFlag<boolean>(
  'shell.entry_window_split_default_off_enabled',
  false,
  {
    category: 'shell',
    description:
      'entry-window(マルチウィンドウ)で text の Split editor を default OFF に(tab bar で source/preview 切替)',
  },
);

// header / view-mode bar / tab strip / breadcrumb の上部 4 段を compact 化
// (user bug report 2026-05-24「上部メニューや操作系が実質 4 段程度
// 占有しているのも少し重い」、pgc-139 wave-δ #13)。ON で:
//   - header padding を vertical 1.5 → 1(33% 削減)
//   - header-path(breadcrumb)padding-top / margin-top も削減
//   - view-mode-bar padding を 2.5 → 1(60% 削減)+ font-size sm → xs
//   - tab-strip padding 削減
// 横幅 / 機能は不変、縦方向だけ詰める ── density 重視 power user 向け。
// OFF で従来 spacious layout。
export const shellHeaderCompactEnabled = defineFlag<boolean>(
  'shell.header_compact_enabled',
  false,
  {
    category: 'shell',
    description:
      'header / breadcrumb / view-mode bar / tab strip の縦方向 padding を圧縮(上部 4 段の占有面積を約 40% 削減)',
  },
);

// tray bar の chrome を細く / 静かに(user bug report 2026-05-24
// 「不必要な隠し項目の耳が見えていたりで視覚ノイズが大きい」、pgc-138
// wave-δ #12)。ON で 左右 tray bar(sidebar collapsed / meta collapsed 時
// の薄い縦 strip)を **20px → 6px** に細くし、`SIDEBAR` / `META` テキスト
// 表示を非表示にする。`title` tooltip は残るため click 動線維持。
// `:hover` で accent border が出るので「ここに collapsed pane あり」と
// 分かる。OFF で従来の vertical text strip。
export const shellTrayBarSlimEnabled = defineFlag<boolean>(
  'shell.tray_bar_slim_enabled',
  false,
  {
    category: 'shell',
    description:
      'collapsed pane の tray bar(左右の耳)を 20px → 6px に細く、SIDEBAR/META text を非表示にして視覚ノイズを削減',
  },
);

// todo overdue 視覚 indicator を sidebar / filer row にも展開(MASTER.md
// §7 todo、pgc-134 wave-δ #9)。kanban / calendar は既に
// `data-pkc-todo-overdue="true"` attr を立てているが、sidebar entry list と
// filer row には未対応 ── todo の overdue を user が「リストを見るだけで」
// 気づける動線が無い。ON で sidebar `<li>` / filer `<tr>` に同 attr を
// 立て、CSS で warning border / `⚠` badge を見せる。OFF で従来挙動。
export const shellTodoOverdueIndicatorEnabled = defineFlag<boolean>(
  'shell.todo_overdue_indicator_enabled',
  true,
  {
    category: 'shell',
    description:
      'sidebar / filer の todo row に overdue 視覚 indicator(⚠ badge + accent border)を追加',
  },
);

// About entry に PKC-Markdown showcase section を追加(MASTER.md §2 U-19、
// pgc-113 wave-γ #14)。「Aboutはかなり味気ない / 最近の変更があまり反映
// されていない / もっと PKC-Markdown をドッグフーディングして積極的に
// アピールしたほうがいい」(user direction)。ON で About view の頭に
// `:::section{role=tip}` callout / `==highlight==` mark / `..em-dot..` 圏点 /
// footnote / table / vars 等を含む showcase markdown を `renderMarkdown` で
// 描画した section を prepend ── 既存 About view(version / license /
// dependencies / releases / contributors 等のメタ情報 hand-rendered)は
// 完全維持、その手前に showcase が追加されるだけ。OFF で従来挙動。
export const shellAboutPkcMarkdownShowcaseEnabled = defineFlag<boolean>(
  'shell.about_pkc_markdown_showcase_enabled',
  true,
  {
    category: 'shell',
    description:
      'About entry の頭に PKC-Markdown showcase section(:::section / ==mark== / footnote / vars 等)を prepend して dialect 機能を可視化',
  },
);

// meta pane References section の重複 "Backlinks" を視覚的に区別する
// (MASTER.md §6.3、pgc-112 wave-γ #13)。現状 References umbrella の中に
// 2 つの「Backlinks」見出しが並ぶ(first-class relations の Backlinks と
// markdown link-index の Backlinks)── 視覚的に同一なので user 体感が
// 「重複」と読まれる。ON で:
//   - 第 1(relations)Backlinks → "Backlinks (relation)" + 説明 tooltip
//   - 第 2(link-index)"Outgoing links" → "Outgoing links (markdown)" 系
//   - 各 heading に title attribute で「何の system か」を hint
// 関連 region attr / 機能は不変、heading 表示のみ調整 ── safe rename。
export const shellMetaPaneReferencesClarifyEnabled = defineFlag<boolean>(
  'shell.meta_pane_references_clarify_enabled',
  true,
  {
    category: 'shell',
    description:
      'meta pane References section の 2 系統 Backlinks を視覚的に区別(relation vs markdown を heading 末尾に明示)',
  },
);

// view-mode tabs に scope mark + 視覚 separator(MASTER.md §6.5、pgc-111
// wave-γ #12)。center pane 上部の 6 tab(Detail / Calendar / Kanban /
// Filer / Graph / Launcher)に対して、ON で:
//   - 各 tab に `data-pkc-tab-scope="entry"|"workspace"` attribute 追加
//     (Detail = entry-level、他 5 = workspace-level)
//   - Detail と Calendar の間に視覚 separator(`|`)挿入
//   - 選択無しの状態で Detail tab を disabled 化(entry-level の意味を強調)
// OFF で従来どおり 6 tab 並列表示(行動 / 視覚不変)。
//
// MASTER §6.5 の最終形(workspace-level は tab strip に統合)へは複数 PR
// で段階移行、本 PR は **scope mark + 視覚分離** の最初の step。
export const shellViewModeTabsScopedEnabled = defineFlag<boolean>(
  'shell.view_mode_tabs_scoped_enabled',
  false,
  {
    category: 'shell',
    description:
      'view-mode tabs(Detail / Calendar 等 6 tab)に scope mark + 視覚 separator を追加し、Detail を entry-level として分離する',
  },
);

// format panel を default 非表示にする(MASTER.md §6.4、pgc-110 wave-γ
// #11)。ON で `formatPanelEnabled` が true でも編集開始時の format ribbon
// を **非表示** で start、editor 上部の「🎨 Format」 toggle button を click
// したときだけ表示する。OFF で従来挙動(format ribbon が常時表示)。
//
// MASTER §6.4 の「default 非表示 + Ctrl+R toggle + 選択 inline popover」の
// 3 step のうち本 PR は (1) default 非表示 + 明示 button toggle のみ。
// (2) Ctrl+R 等の keyboard shortcut は keymap registry 経由で後続 PR、
// (3) selection-floating inline toolbar も別 PR で。
export const shellFormatPanelDefaultHiddenEnabled = defineFlag<boolean>(
  'shell.format_panel_default_hidden_enabled',
  true,
  {
    category: 'shell',
    description:
      'editor の format panel を default 非表示にし、「🎨 Format」 toggle button で表示切替に変更(user U-15「何でも button 化は悪い兆候」対応)',
  },
);

// Textlog importance-only filter(wave-δ #24、pgc-157 handoff §3.3)。
// ON で textlog presenter に「⭐ Only important」 toggle button を追加、
// 押下中は `important` flag が立っている log entry だけ表示。pgc-155 の
// search bar(keyword filter)と AND 条件で組合せ可能(検索結果のうち
// important のみ)。OFF で従来通り(完全後方互換)。
// URL flag: `?pkc-flag=text.textlog_importance_filter_enabled=1`。
export const textTextlogImportanceFilterEnabled = defineFlag<boolean>(
  'text.textlog_importance_filter_enabled',
  true,
  {
    category: 'text',
    description:
      'textlog presenter に importance-only filter toggle(⭐)を追加し important log のみ表示',
  },
);

// Textlog log search(wave-δ #22、pgc-155 handoff §3.3)。
// ON で textlog presenter に keyword search input を表示、log entries を
// space 区切り token AND 部分一致(case-insensitive)で絞り込み。
// 多 log の textlog で「あの会議メモどこ」「あの bug 報告どこ」 を 1
// keystroke で見つける動線。OFF で従来通り(完全後方互換)。
// URL flag: `?pkc-flag=text.textlog_log_search_enabled=1`。
export const textTextlogLogSearchEnabled = defineFlag<boolean>(
  'text.textlog_log_search_enabled',
  true,
  {
    category: 'text',
    description:
      'textlog presenter に keyword search input を表示し log entries を絞り込む',
  },
);

// Wordcount footer mobile compact format(wave-δ #23、pgc-156 handoff §3.5)。
// ON で editor footer wordcount を mobile / 狭画面向けの **compact**
// 表記に切替(`1234 chars · 250 words · 42 lines · ~3 min read` →
// `1.2k · 250w · 42l · 3m`)。space 取らず status bar 内に収まる。
// OFF で従来通り(完全後方互換)。
// URL flag: `?pkc-flag=text.wordcount_mobile_compact_enabled=1`。
export const textWordcountMobileCompactEnabled = defineFlag<boolean>(
  'text.wordcount_mobile_compact_enabled',
  false,
  {
    category: 'text',
    description:
      'editor footer wordcount を mobile compact 表記に切替(1.2k · 250w · 42l · 3m)',
  },
);

// Wordcount footer noise exclusion(wave-δ #20、pgc-151 handoff §3.5)。
// ON で editor footer wordcount が fenced code block / inline code /
// image markup / footnote ref / HTML tag を除外して prose のみで
// char / word / read-time を計算。line count は line 構造を保つため
// 不変(空行 placeholder 化で line 数同じ)。OFF で従来どおり body
// 全体カウント(完全後方互換)。
// URL flag: `?pkc-flag=text.wordcount_exclude_noise_enabled=1`。
export const textWordcountExcludeNoiseEnabled = defineFlag<boolean>(
  'text.wordcount_exclude_noise_enabled',
  false,
  {
    category: 'text',
    description:
      'editor footer wordcount から code block / inline code / image / footnote / HTML を除外して prose のみ計算',
  },
);

// Todo subtask inline checkbox(wave-δ #19、pgc-150 handoff §3.3)。
// ON で todo description 内の `- [ ]` / `- [x]` markdown task literal を
// **click 可能な inline checkbox** として render(markdown-it task-list
// plugin が既に出力する `<input type="checkbox">` に
// `data-pkc-action="toggle-todo-subtask"` を inject)。click で
// `extractSubtasks` / `toggleSubtaskAt`(features/todo/todo-subtask.ts)
// を経由して description を更新 → QUICK_UPDATE_ENTRY dispatch。
// URL flag: `?pkc-flag=text.todo_subtask_enabled=1`。OFF で従来通り
// disabled checkbox(read-only)。
export const textTodoSubtaskEnabled = defineFlag<boolean>(
  'text.todo_subtask_enabled',
  false,
  {
    category: 'text',
    description:
      'todo description 内の `- [ ]` / `- [x]` inline checkbox を click で toggle 可能化',
  },
);

// Activity Bar tab に小 badge(visual count indicator)を表示
// (v3 統合 master `v3-unification-master-2026-05-24.md` wave-α' G8 visual
// layer / theme / chrome 統一、handoff §3.5 後続候補、pgc-180 wave-α' #3)。
// `shell.activity_bar_enabled` 必須(badge は activity bar 自体が無いと
// 描画されない、自動的に共依存)。ON で 3 tab に count badge を上に重ねる:
// Outline = 現 entry の heading 数 / Relations = outbound + inbound 数 /
// Pinned = pinned tab 数(空ペーン無しのものに限る)。0 なら badge 非表示
// (noise 回避)。Explorer / Search / Recent は count 算出が container 全体
// scope or 非 deterministic でユーザーにとって意味希薄なので badge なし。
export const shellActivityBarBadgesEnabled = defineFlag<boolean>(
  'shell.activity_bar_badges_enabled',
  false,
  {
    category: 'shell',
    description:
      'Activity Bar の 3 tab(Outline / Relations / Pinned)に count badge(visual indicator、現 entry に紐づく数)を表示',
  },
);

// Inspector History tab の各 revision row に「Show diff vs current」 を
// 追加(v3 統合 master `v3-unification-master-2026-05-24.md` wave-α' G6
// Inspector / Hints / AI 統一、handoff §3.5「Inspector History tab の
// revision diff viewer」、pgc-181 wave-α' #4)。`shell.meta_pane_inspector_
// enabled` 共依存(Inspector tab strip 自体が無いと revision row も
// 出ない、構造的に自動成立)。
//
// ON で revision row 末尾に `<details>` (default 閉じ)を追加、開くと
// `diffRows(rev.body, current_entry.body)` の line-level diff を inline
// 表示。features/diff/line-diff の既存 pure function を再利用 ── canvas
// 前方互換(spec §11.3)。
export const shellRevisionDiffViewerEnabled = defineFlag<boolean>(
  'shell.revision_diff_viewer_enabled',
  false,
  {
    category: 'shell',
    description:
      'Inspector History tab の各 revision row に「Show diff vs current」 inline diff viewer(line-level diff)を追加',
  },
);

// Editor format keyboard shortcuts(v3 統合 master `v3-unification-master-
// 2026-05-24.md` wave-α' G1 編集 surface 統一の延長、handoff §3.4 wave-δ
// phase 2 text 編集 UX、pgc-186 wave-α' #9)。ON で textarea(TEXT body /
// TEXTLOG log)編集中の `Ctrl+B` / `Ctrl+I` で format-panel と同じ wrap
// 変換を発火 ── B/I 標準 editor shortcut(Word / Notion / Obsidian 互換)。
// browser default の `Ctrl+B`(bookmark side panel)を上書きするため、
// 編集中 textarea でのみ override + flag opt-in で user 同意済。
export const editorFormatShortcutsEnabled = defineFlag<boolean>(
  'editor.format_shortcuts_enabled',
  false,
  {
    category: 'editor',
    description:
      'editor 中 textarea で `Ctrl+B`(strong)/ `Ctrl+I`(emphasis)keyboard shortcut で format-panel と同じ wrap 変換を発火',
  },
);

// Built-in Mermaid 描画(v3 統合 master G5 markdown 方言完結、user 直接
// 指示 2026-05-24「ビルトインマーメイドに対応して」、pgc-203 wave-α'
// polish #24)。ON で markdown fence ` ```mermaid ` を mermaid.js で
// SVG render。lazy `import('mermaid')` で初回 detection 時のみ load(初期
// bundle.js には mermaid 本体は入らず、separate chunk 経由)。
// `prefers-color-scheme` を listen して theme 切替時に re-render。
// 3 surface(S1 center / S2 Viewer popup / S4 entry-window)で hydrate。
export const editorMermaidRenderEnabled = defineFlag<boolean>(
  'editor.mermaid_render_enabled',
  false,
  {
    category: 'editor',
    description:
      'markdown ```mermaid fence を built-in mermaid.js で SVG render(lazy import、theme aware、3 surface 統一)',
  },
);

// #903(2026-07-12 user 要望「ミニマップをサポートして欲しい」):center pane
// rendered view の抽象化バーミニマップ(VSCode 風、DOM 縮小クローンではなく
// 見出し/段落/コード等をバーで表す軽量方式)。viewport indicator +
// クリック/ドラッグでスクロール。OFF で完全 no-op、実機評価後に既定を判断。
export const shellMinimapEnabled = defineFlag<boolean>(
  'shell.minimap_enabled',
  false,
  {
    category: 'shell',
    description:
      'center pane に抽象化バーのミニマップを表示(クリック/ドラッグでスクロール)。OFF で従来表示',
  },
);

// #926(2026-07-17、user 要望):launcher の「+ URL タイル」追加 UI。
// ON で URL / 名前を入力 → 擬似リダイレクト HTML(referrer を送らない中継
// ページ)を attachment 化して launcher に並べる。opt-in で導入し、実機
// 評価後に既定 ON を判断する。
export const shellLauncherUrlTilesEnabled = defineFlag<boolean>(
  'shell.launcher_url_tiles',
  false,
  {
    category: 'shell',
    description:
      'ランチャーの「+ URL タイル」追加 UI(referrer を送らない中継ページ経由の URL ジャンプ)。opt-in',
  },
);

// #932(2026-07-17、user 要望):左ペイン / タブでエントリ名が表示しきれ
// ないケースへの opt-in 対策。ON で entry list とタブのエントリ名を小さい
// 字 + 2 行折り返しで表示する(全文はツールチップで常時参照可)。
export const shellCompactEntryLabelsEnabled = defineFlag<boolean>(
  'shell.compact_entry_labels',
  false,
  {
    category: 'shell',
    description:
      '左ペインとタブのエントリ名を小さい字 + 折り返しで表示(長い名前対策、全文はツールチップ)。opt-in',
  },
);
