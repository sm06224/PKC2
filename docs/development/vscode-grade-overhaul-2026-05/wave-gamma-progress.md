# wave-γ progress: shell redesign 15 PR(pgc-99〜114)

**作成日**: 2026-05-23
**status**: 進行中(15 PR 着地、後続 candidate あり)
**parent doc**: `MASTER.md` §6(main shell 刷新)

---

## §1 概要

MASTER.md §6 で定義した shell redesign 25 PR 計画のうち **15 PR が着地**。
全 PR は **Tier 0 flag default OFF + 後方互換完全維持**の規律で進行、
user は `?pkc-flag=<name>=1` URL 形式で個別に opt-in 可能。

main 着地は invariant I7 で禁止中 ── 着地済 PR は GitHub PR として
stack(各 PR の base = 直前 PR の頂点)で保持、user 判断で release 時に
main へ merge する。

## §2 flag 一覧(15 PR の opt-in 表)

各 flag は default OFF。URL flag form は `?pkc-flag=<name>=1`、複数同時
opt-in は `&` で連結。

| # | PR | section | flag name | 効果 |
|---|----|---------|-----------|------|
| 1 | pgc-99 | §6.1 phase 1 | `shell.new_button_picker_enabled` | header 5 個 archetype create button → 1 個 `+ New` popover |
| 2 | pgc-100 | §6.1 phase 2 | `shell.data_in_shell_menu_enabled` | `Data…` panel を Shell Menu の section に集約 |
| 3 | pgc-101 | §6.1 phase 3 | `shell.back_forward_in_breadcrumb_enabled` | `◀` `▶` を breadcrumb 内 `⇐` `⇒` icon に統合 |
| 4 | pgc-102 | §6.2 起点 | `shell.activity_bar_enabled` | sidebar 左に VSCode 流 Activity Bar(6 tab scaffold) |
| 5 | pgc-103 | §4.5 | (同上) | Outline tab 実装(現 entry の h1〜h3 を list、click で scroll) |
| 6 | pgc-104 | §6.2 | (同上) | Recent tab 実装(`selectRecentEntries` で最新 N 件) |
| 7 | pgc-105 | §6.2 | (同上) | Pinned tab 実装(tab-strip pinned 機構を data source) |
| 8 | pgc-106 | (hotfix) | (`+ New` 専用) | `+ New` popover 画面外描画 fix(viewport-safe fixed positioning) |
| 9 | pgc-107 | §6.2 | (同上) | Search tab 実装(`filterEntries` で live filter、最大 50 件) |
| 10 | pgc-108 | §6.2 | (同上) | Relations tab 実装(現 entry の outbound / inbound を 2 section) |
| 11 | pgc-109 | §6.3 起点 | `shell.meta_pane_inspector_enabled` | meta pane の頭に Inspector 5 tab strip(Properties / References / History / Style / AI) |
| 12 | pgc-110 | §6.4 step 1 | `shell.format_panel_default_hidden_enabled` | format panel default 非表示 + `🎨 Format` toggle button |
| 13 | pgc-111 | §6.5 step 1 | `shell.view_mode_tabs_scoped_enabled` | view-mode tabs に scope mark + 視覚 separator + Detail 選択無し disabled |
| 14 | pgc-112 | §6.3 follow-up | `shell.meta_pane_references_clarify_enabled` | meta pane References の 2 系統 `Backlinks` を `— relation` / `— markdown` 接尾辞で区別 |
| 15 | pgc-113 | §2 U-19 | `shell.about_pkc_markdown_showcase_enabled` | About 頭に PKC-Markdown showcase section を prepend(dogfooding) |
| 15* | pgc-114 | §2 U-19 follow-up | (同上) | About showcase に payload vars 動的展開(version / commit / dep counts) |
| 16 | pgc-115 | (docs-only) | — | wave-γ progress doc 起こし |
| 17 | pgc-116 | §6.2 後続 | (`shell.activity_bar_enabled`) | Activity Bar left / right 配置切替(↔ toggle button、main 先頭 / 末尾を flip) |
| 18 | pgc-117 | §6.3 follow-up | (`shell.meta_pane_inspector_enabled`) | Inspector History tab の visibleRegions silent bug fix(`['history','revisions']` → `['revision-history',...]`)+ non-placeholder tab で no matched empty hint |
| 19 | pgc-118 | §6.3 follow-up | (同上) | Inspector Style tab に読み取り専用 metrics 実装(archetype / char count / heading 数 / frontmatter style globals / timestamps、placeholder 脱却) |

`*` = pgc-113 と同 flag を使う follow-up PR
括弧書き flag = 新 flag 追加なし、既存 flag の機能拡張 PR

## §3 全 ON URL 例

wave-γ 全 15 機能を同時 ON にして実機検証する場合:

```
file:///path/to/pkc2.html?pkc-flag=shell.new_button_picker_enabled=1&pkc-flag=shell.data_in_shell_menu_enabled=1&pkc-flag=shell.back_forward_in_breadcrumb_enabled=1&pkc-flag=shell.activity_bar_enabled=1&pkc-flag=shell.meta_pane_inspector_enabled=1&pkc-flag=shell.format_panel_default_hidden_enabled=1&pkc-flag=shell.view_mode_tabs_scoped_enabled=1&pkc-flag=shell.meta_pane_references_clarify_enabled=1&pkc-flag=shell.about_pkc_markdown_showcase_enabled=1
```

または **Shell Menu**(右上 `≡` button)→ `Flags Inspector` から GUI で
toggle するのが楽。

## §4 MASTER §6 残り(後続 PR 候補)

### §6.2 Activity Bar(全 6 tab 完成 ✓ + 位置切替 ✓)

- 完了:Explorer(既存 sidebar)/ Search / Outline / Relations / Recent / Pinned + 位置切替(pgc-116、↔ button で left ↔ right flip)
- 後続候補:**キーボード shortcut**(Ctrl+Shift+E 等で各 tab focus、keymap registry 連携必要)/ tab order の user customize / hidden tab(Search / Outline 非表示にして 4 tab に絞る option)

### §6.3 meta pane Inspector

- scaffold 完了(pgc-109)+ References clarify(pgc-112)+ History region fix + empty hint(pgc-117)+ Style metrics 実装(pgc-118)
- **5 tab のうち 4 件機能化**(Properties / References / History / Style)、残り placeholder は **AI 1 件のみ**
- 後続候補:Properties tab の frontmatter 編集 inline UI / History tab の revision diff viewer / Style tab の per-entry theme override / **AI tab** の中身(設計議論待ち、LLM API 連携 or local-only inspector?)

### §6.4 format panel context-aware

- default 非表示 + toggle(pgc-110)着地
- 後続候補:**Ctrl+R shortcut**(keymap registry 経由)/ **selection-floating inline toolbar**(Notion / Medium 流)/ format panel pin 機能(power user 用、常時表示固定)

### §6.5 view-mode tabs

- scope mark + separator + Detail disabled(pgc-111)着地
- 後続候補:**workspace-level tab(Calendar / Kanban / Filer / Graph / Launcher)を center pane tab strip(pgc-85+)に統合**(MASTER §6.5 の最終形)/ §6.5.1 Launcher view の Quick Open + Home view への統合検討

### §6.1 header(全 phase 完成 ✓)

- 完了:`+ New` / `Data…` 集約 / back-forward → breadcrumb
- 後続候補:header の更なる削減(`PKC2` title clickable で home / shell menu icon 変更等)

## §5 §7 archetype 別 UX(wave-δ scope、未着手)

MASTER §7 の archetype 別 UX 改修は wave-δ scope。wave-γ が一段落
(用具立て完了)したら着手:
- text: multi-cursor / minimap / outline sidebar / word count / reading mode / folding 拡張
- textlog: 各日の高速 jump、log search、importance filter UI
- todo: subtask 階層、due-date overdue indicator、completion graph
- form: field 順序 DnD、conditional field、type richer
- attachment: preview MIME 拡張、batch download、sandbox policy GUI
- folder: tree-flat 切替、children sort / filter、bulk select / move

## §6 関連 doc

- `MASTER.md`(本 doc の parent、§6 main shell 刷新の canonical 仕様)
- `docs/release/CHANGELOG_v2.3.0.md`(各 PR の詳細 entry、wave-γ #1〜#15)
- `docs/development/render-surface-parity-audit-2026-05.md`(wave-β audit、全 15 Gap 解消済)

## §7 進捗 / history

| date | event |
|---|---|
| 2026-05-23 | wave-γ #1〜#15 着地(pgc-99〜114)、本 progress doc 起こし。test 9031、bundle 1928KB |
| 2026-05-23 | wave-γ #16〜#18 追加着地(pgc-116〜118):Activity Bar 位置切替 / Inspector History region fix + empty hint / Inspector Style metrics 実装。test 9052、bundle 1932KB。Inspector 5 tab のうち 4 件機能化、placeholder 残りは AI 1 件のみ |
