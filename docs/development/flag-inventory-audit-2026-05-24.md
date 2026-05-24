# Tier 0 flag inventory audit(2026-05-24、pgc-167)

**Status**:audit doc(docs-only、actions は後続 PR)
**Purpose**:handoff §3.5「**flag inventory cleanup**:本 wave で 20+ 件追加、
全 default OFF。一定 PR 着地後に『定着 flag は always-on 化(コード簡素化)』
する整理が必要」 への対応 step 1。本 doc は現状 flag を列挙、各 flag の
**定着判断**(always-on 化推奨 / 維持 / 廃止検討)を提示。

---

## §1 現状 flag inventory(35 件、shell/text/editor + その他)

### §1.1 shell.* flag(26 件)

| # | flag key | 着地 PR | default | 用途 | 定着判断(私の暫定) |
|---|---|---|---|---|---|
| 1 | `shell.edit_mode_enabled` | pgc-27/28 | OFF | inline / window 編集 mode 切替 picker | **維持**(picker UI が experimental、user の好み次第)|
| 2 | `shell.main_reload_guard` | γ-A5 | OFF | 子 window 編集中の main reload 確認 dialog | 維持(危険度 user 判断)|
| 3 | `shell.window_roles` | pgc-67〜76 | OFF | editor / viewer role 分離 | 維持(multi-window 経路の opt-in)|
| 4 | `shell.window_layout_persist` | pgc-71 | OFF | child window geometry localStorage 保存 | 維持(localStorage 制約あり)|
| 5 | `shell.conflict_diff_view` | pgc-72 | OFF | dual-edit 競合 overlay の 2-pane 行 diff | 維持(条件発生時のみ)|
| 6 | `shell.command_palette_enabled` | pgc-80 | OFF | Ctrl+Shift+P / F1 で fuzzy command launcher | **always-on 推奨**(VSCode 標準、危険なし)|
| 7 | `shell.quick_open_enabled` | pgc-81 | OFF | Ctrl+P で entry fuzzy launcher、browser print override | **always-on 推奨**(browser print override は user 想定外の可能性、要 user 確認)|
| 8 | `shell.keymap_registry_enabled` | pgc-82 | OFF | declarative keymap registry | **always-on 推奨**(他 shell flag の前提)|
| 9 | `shell.context_menu_universal` | pgc-83/84 | OFF | universal context menu(右クリック)| 維持(user 体感確認後 always-on 候補)|
| 10 | `shell.tabs_enabled` | pgc-85 | OFF | center pane の tab strip | 維持(workspace tab 統合まで保留、wave-γ §6.5)|
| 11 | `shell.split_view_enabled` | pgc-89 | OFF | center pane の right split preview | 維持(user 好み)|
| 12 | `shell.new_button_picker_enabled` | pgc-99 | OFF | `+ New` 1 button picker(5 archetype を集約)| **always-on 推奨**(header 削減効果大、user 体感 positive)|
| 13 | `shell.data_in_shell_menu_enabled` | pgc-100 | OFF | Data... を Shell Menu の section に集約 | 維持(pgc-135 + pgc-162 hotfix で運用安定、user 確認次第 always-on)|
| 14 | `shell.back_forward_in_breadcrumb_enabled` | pgc-101 | OFF | back/forward を breadcrumb の `⇐` `⇒` に統合 | **always-on 推奨**(header 削減、pgc-160 hotfix 後の visual も改善)|
| 15 | `shell.activity_bar_enabled` | pgc-102〜108/116/121/124 | OFF | VSCode 流 Activity Bar(6 tab + 位置切替)| 維持(scope 大、wave-γ §6.2 後続あり)|
| 16 | `shell.editor_footer_wordcount_enabled` | pgc-125 | OFF | editor 末尾の wordcount + read time | **always-on 推奨**(text/textlog 編集時のみ表示、scope 安全)|
| 17 | `shell.entry_window_chrome_enabled` | pgc-141 | OFF | entry-window の slim sticky header | 維持(viewport 制約あり)|
| 18 | `shell.entry_window_split_default_off_enabled` | pgc-140 | OFF | entry-window で text の Split editor を default OFF | 維持(user 好み)|
| 19 | `shell.header_compact_enabled` | pgc-139 | OFF | header 4 段の縦 padding 圧縮 | 維持(pgc-161 で view-mode tabs visibility fix 後の状況、user 体感次第)|
| 20 | `shell.tray_bar_slim` | pgc-138 | OFF | tray bar(pane toggle 耳)を slim 化 | 維持(visual taste、user 確認次第)|
| 21 | `shell.todo_overdue_indicator_enabled` | pgc-134 | OFF | sidebar / filer の todo overdue ⚠ indicator | **always-on 推奨**(機能 additive、危険なし)|
| 22 | `shell.about_pkc_markdown_showcase_enabled` | pgc-113/114 | OFF | About entry を PKC-Markdown showcase に | **always-on 推奨**(about のみ影響、user 体感 positive)|
| 23 | `shell.meta_pane_references_clarify` | pgc-117 | OFF | meta pane References tab の重複 Backlinks 整理 | **always-on 推奨**(visual / 構造改善のみ)|
| 24 | `shell.view_mode_tabs_scoped_enabled` | pgc-111 | OFF | view-mode tabs を entry / workspace で scope 分離 | 維持(wave-γ §6.5 大改修との整合)|
| 25 | `shell.format_panel_default_hidden_enabled` | pgc-110/120 | OFF | format panel を default 非表示、🎨 toggle で表示 | **always-on 推奨**(user 体感 positive、format panel inline toolbar への前提)|
| 26 | `shell.meta_pane_inspector_enabled` | pgc-109/112/117/118/123 | OFF | meta pane Inspector tab strip(5 tab)| **always-on 推奨**(meta pane の 13+ section が chunk 化、user 体感 positive)|
| 27 | `shell.inspector_ai_local_enabled` | pgc-147〜166 | OFF | Inspector Hints tab(8 local lint、旧 AI tab)| 維持(pgc-166 で「AI 詐欺」 解消したが user 確認待ち)|
| 33 | `shell.activity_bar_badges_enabled` | pgc-180 | OFF | Activity Bar 3 tab(Outline / Relations / Pinned)に count badge | 維持(`shell.activity_bar_enabled` 共依存、ON 後の user 体感確認待ち)|
| 34 | `shell.revision_diff_viewer_enabled` | pgc-181 | OFF | Inspector History tab 各 revision row に「Show diff vs current」 inline line-level diff viewer | 維持(`shell.meta_pane_inspector_enabled` 共依存、ON 後の user 体感確認待ち)|

### §1.2 text.* flag(5 件)

| # | flag key | 着地 PR | default | 用途 | 定着判断 |
|---|---|---|---|---|---|
| 28 | `text.textlog_log_search_enabled` | pgc-155 | OFF | textlog の keyword search bar | **always-on 推奨**(textlog の絞り込み動線、必須 UX)|
| 29 | `text.textlog_importance_filter_enabled` | pgc-157/163 | OFF | textlog の ⭐ importance-only filter toggle | **always-on 推奨**(search と並列、scope 安全)|
| 30 | `text.todo_subtask_enabled` | pgc-150 | OFF | todo description 内 inline subtask click toggle | 維持(GFM 互換性、user 体感次第)|
| 31 | `text.wordcount_exclude_noise_enabled` | pgc-151 | OFF | wordcount footer から code / image / footnote / HTML 除外 | 維持(user 好み)|
| 32 | `text.wordcount_mobile_compact_enabled` | pgc-156 | OFF | wordcount を `1.2k · 250w` compact 表記に | 維持(画面サイズ依存、user 好み)|

### §1.3 editor.* flag(1 件、pgc-196 追加)

| # | flag key | 着地 PR | default | 用途 | 定着判断 |
|---|---|---|---|---|---|
| 35 | `editor.format_shortcuts_enabled` | pgc-186/187/193 | OFF | textarea 中の `Ctrl+B` / `Ctrl+I` / `Ctrl+U` / `Ctrl+Shift+S` / `` Ctrl+` ``(B/I/U/S/`code` wrap)| 維持(browser Ctrl+B 上書き、user 同意 opt-in 必須)|

*Note: `editor.format_panel_enabled` は default **ON** で出荷済(pgc-2JJ v2)── format ribbon の主機構そのもの、別 audit category。本表は wave-α' で新規追加した opt-in editor flag のみ。*

---

## §2 always-on 化推奨 flag(11 件)

以下 11 件は **header 削減 / 機能 additive / visual 改善** で副作用が少なく、
user 体感が positive と想定される。次 wave で別 PR(`pgc-X-flag-always-on-batch-1`
等)で **default ON 化 + 一定期間後に flag 削除 + コード簡素化** する候補:

1. `shell.command_palette_enabled`(pgc-80)
2. `shell.quick_open_enabled`(pgc-81)── browser print override は要 user 確認
3. `shell.keymap_registry_enabled`(pgc-82)── 他 shell flag の前提
4. `shell.new_button_picker_enabled`(pgc-99)
5. `shell.back_forward_in_breadcrumb_enabled`(pgc-101)
6. `shell.editor_footer_wordcount_enabled`(pgc-125)
7. `shell.todo_overdue_indicator_enabled`(pgc-134)
8. `shell.about_pkc_markdown_showcase_enabled`(pgc-113/114)
9. `shell.meta_pane_references_clarify`(pgc-117)
10. `shell.format_panel_default_hidden_enabled`(pgc-110/120)
11. `shell.meta_pane_inspector_enabled`(pgc-109/112/117/118/123)

text.* も `textlog_log_search_enabled` / `textlog_importance_filter_enabled` の
2 件が always-on 化候補。

---

## §3 維持 flag(15 件)── user 好み / 危険度 / 大改修との整合

以下は default OFF を維持:

- 編集 mode 系(`shell.edit_mode_enabled` / `shell.main_reload_guard` /
  `shell.window_roles` / `shell.window_layout_persist` / `shell.conflict_diff_view` /
  `shell.entry_window_chrome_enabled` / `shell.entry_window_split_default_off_enabled`)
- visual / layout(`shell.header_compact_enabled` / `shell.tray_bar_slim`)
- 大改修待ち(`shell.activity_bar_enabled` / `shell.tabs_enabled` /
  `shell.view_mode_tabs_scoped_enabled` / `shell.split_view_enabled`)
- context menu(`shell.context_menu_universal`)── user 確認後
- Hints tab(`shell.inspector_ai_local_enabled`)── pgc-166 直後で user 確認待ち
- Data in shell menu(`shell.data_in_shell_menu_enabled`)── pgc-135/162 hotfix 後の運用確認
- text.* の好み系(`text.todo_subtask_enabled` / `text.wordcount_exclude_noise_enabled` /
  `text.wordcount_mobile_compact_enabled`)

---

## §4 廃止検討(現状なし)

現時点で「廃止」 候補は無い。すべての flag が機能を gate しており、
user の選択肢として残す価値がある。

---

## §5 次 step

1. **user 確認**:always-on 推奨 11 件のうち、どれを **default ON にして良いか**
   user に提示(本 doc を共有)
2. user 承認後、batch PR(`pgc-X-flag-always-on-batch`)で default を OFF → ON 切替
3. 一定期間(数 wave)観察、issue 報告がなければ flag 自体を **削除 + コード簡素化**
4. 維持 flag は **wave-γ 完遂時(workspace tab 統合 / context menu universal 等)**
   に再評価

---

## §6 history

| date | event |
|---|---|
| 2026-05-24 | 本 doc 起こし(pgc-167、handoff §3.5「flag inventory cleanup」 step 1)|
