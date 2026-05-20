# Phase β PR-β4:Phase γ 実装 wave map(2026-05-19)

**Status**:docs-only spec(PR-β4、Phase β の最終 doc = 実装 wave 計画)
**前提 doc**(本書はこの 4 doc を統合した実装計画):
- [`phase-beta-plan-2026-05-19.md`](./phase-beta-plan-2026-05-19.md)(PR-β0 = Phase β 全体計画)
- [`phase-beta-group-a-shell-spec-2026-05.md`](./phase-beta-group-a-shell-spec-2026-05.md)(PR-β1 = Group A shell 再構成)
- [`phase-beta-group-b-meta-pane-spec-2026-05.md`](./phase-beta-group-b-meta-pane-spec-2026-05.md)(PR-β2 = Group B 右ペイン特化)
- [`phase-beta-group-c-format-panel-spec-2026-05.md`](./phase-beta-group-c-format-panel-spec-2026-05.md)(PR-β3 = Group C 書式機能)

**Scope**:Phase γ(実装 wave)の **PR-by-PR 分解 + 着手順序 + budget 試算
+ 20 OQ の wave gating + visual parity test 計画**。本書着地で Phase β
(設計 wave)は完了、Phase γ 着手の最終 audit doc となる。
**実装**:本書は **計画 doc**、src 変更なし。Phase γ で本書に従い実装 PR
を起こす。

---

## §0 本書の位置付け

PR-β1〜β3 で Group A / B / C の詳細 spec が出揃った。各 spec は内部に
γ-X1〜X3 の wave 分割を持つが、**PR 単位の分解 / 全 wave の着手順序 / 累積
budget / 20 個の open question(OQ)がどの wave を gate するか** は未確定。
本書(PR-β4)がそれを **実行可能な単一の wave map** に落とす。

plan §5.1 は coarse な 6 wave 一覧(γ-C / γ-B / γ-A1〜A4)+ PR 数レンジ
のみだった。本書はそれを **9 sub-wave + PR-by-PR table** に精緻化し、
plan §5.1 を supersede する(plan §5.1 は historical reference として残す)。

---

## §1 Phase γ の全体像

### §1.1 9 sub-wave 構成

| # | wave | 由来 spec | 想定 PR 数 | 着手 gate |
|---|---|---|---|---|
| 1 | **γ-C1** | Group C §9.1 | 7 | OQ-C-1 / C-6 / C-7 合意 |
| 2 | **γ-C2** | Group C §9.1 | 7 | OQ-C-4 / C-5 合意 |
| 3 | **γ-C3** | Group C §9.1 | 4 | OQ-C-2 / C-3 合意 + 領域 8 Layer 1 着地 |
| 4 | **γ-B1** | Group B §5.1 | 7 | OQ-B-2 / B-5 合意 |
| 5 | **γ-B2** | Group B §5.1 | 8 | OQ-B-1 / B-3 / B-4 / B-6 / B-7 合意 |
| 6 | **γ-B3** | Group B §5.1 | 4 | (γ-B1 / γ-B2 着地)|
| 7 | **γ-A1** | Group A §4 | 6 | OQ-A-3 合意 |
| 8 | **γ-A2** | Group A §2 | 10 | OQ-A-1 合意 |
| 9 | **γ-A3** | Group A §3 | 11 | OQ-A-2 / A-4 / A-5 合意 |
| 10 | **γ-A4** | Group A §4 | 4 | (v3.0 lineup 合流、別途判断)|

**合計**:**68 PR**(γ-C 18 + γ-B 19 + γ-A 31)。

### §1.2 着手順序と根拠

順序:**γ-C → γ-B → γ-A**(plan §5.1 の根拠を継承)。

- **Group C 最初**:独立性最高。format panel は編集モード内で完結し、
  shell / meta pane を触らない。PKC MD canonical 往復 invariant の
  validate を実装初期に固める価値が大きい
- **Group B 2 番目**:meta pane + graph view 内で完結、Group A の shell
  再構成を前提にしない
- **Group A 最後**:shell 全体の書き換え(編集 mode 3 種 / マルチ
  ウィンドウ / sidebar 廃止)で最 risky。C / B が安定してから

### §1.3 wave 分割規律(CLAUDE.md Wave §1)

CLAUDE.md Wave §1「1 wave あたり 30〜50 PR で打ち止め」に従い、68 PR を
**3 つの merge train** に分ける:

| merge train | 含む sub-wave | PR 数 | 締め |
|---|---|---|---|
| Train 1 | γ-C1 + γ-C2 + γ-C3 + γ-B1 | 25 | 下から sequential merge → main 最新化 |
| Train 2 | γ-B2 + γ-B3 + γ-A1 + γ-A2 | 31 | 同上 |
| Train 3 | γ-A3 + γ-A4 | 15 | 同上 |

各 train 締めで CLAUDE.md Wave §2(stacked PR は base retarget が先)を遵守。

---

## §2 Phase γ-C wave 詳細(format panel ワープロ化)

> **【2026-05-20 訂正:scrap-and-build】** 本 §2 初版は「desktop 固定
> panel を **新設**」前提だったが、実際は `src/adapter/ui/format-panel.ts`
> (選択追従 floating 書式 panel、14 button、本番稼働中)が既存。user 判断
> で **scrap-and-build**(既存 floating panel を破棄 → desktop 固定 ribbon
> を建て直し)に方針確定。stack PR-pgc-01 で本訂正。変更点:
> (1) C1-1 を「`format_panel.desktop_fixed_enabled` 新設」から
>     「**旧 format-panel.ts を scrap + 新 ribbon 骨格 build**」に再定義、
>     flag は旧 `editor.format_panel_enabled` を引き継ぐ(`format_panel.*`
>     多段 flag 案は破棄)。
> (2) Font group の bold / italic / strike / code、段落の heading /
>     quote、list の bullet は **旧 panel に実装済の `wrapInline` /
>     `prefixLines` を再利用** するため、各 PR の budget は下振れる。
> (3) stack 番号は PR-pgc-NN(main 着地せず stack を積む運用、2026-05-20
>     user 指示)。下表の C1-NN は論理 wave、実 PR は pgc-NN に対応。

### §2.1 γ-C1:scrap-and-build + Font group + 段落 group(7 PR)

| PR | scope | Tier 0 flag | budget |
|---|---|---|---|
| C1-1 | **旧 `format-panel.ts` を scrap**(floating panel / `mountFormatPanel` / 旧 CSS 破棄)+ **新 desktop 固定 ribbon 骨格**(6 group 折りたたみ枠)を同 file に build | 旧 `editor.format_panel_enabled` を新 panel が引き継ぐ | +0.5 KB js / +0 KB css(scrap 相殺)|
| C1-2 | Font group — bold / italic / strike / code toggle(`**X**` / `*X*` / `~~X~~` / `` `X` ``)| `format_panel.font_group_enabled` 導入 | +1 KB js |
| C1-3 | Font group — 文字色 / 背景色 popup(`:X:red:` / `==[red]X==`)| - | +1 KB js / +0.5 KB css |
| C1-4 | Font group — font-size / font-family popup(`:X:lg:` / `:X:mono:`、attr 合成 contract §4.4)| - | +1 KB js |
| C1-5 | 段落 group — align prefix toggle(`\|\|` / `\|>` / `<\|`)| `format_panel.paragraph_group_enabled` 導入 | +0.8 KB js |
| C1-6 | 段落 group — heading level / blockquote toggle | - | +0.7 KB js |
| C1-7 | visual parity test(γ-C1 全体、case matrix §4.3 / §5.4)+ flag default ON 切替 | 3 flag を default ON | +0 KB(test のみ)|

**累積**:+7 KB js / +2 KB css。
**visual parity test**:C1-7 で `tests/smoke/group-c-format-panel-parity.spec.ts` — `elementFromPoint` + `page.mouse.click(x,y)` で Font / 段落 button を実 OS event クリック → textarea canonical 記法 + preview render 変化を assert。

### §2.2 γ-C2:表 operation + 番号・リスト段階 1(7 PR)

| PR | scope | Tier 0 flag | budget |
|---|---|---|---|
| C2-1 | 表 group — GFM pipe table 挿入(行数×列数 picker)| `format_panel.table_ops_enabled` 導入 | +1.2 KB js / +0.5 KB css |
| C2-2 | 表 group — 行追加 / 削除(pipe table source 操作)| - | +1 KB js |
| C2-3 | 表 group — 列追加 / 削除 | - | +1 KB js |
| C2-4 | 表 group — セル整列(整列行 `:-:` 操作)| - | +0.5 KB js |
| C2-5 | リスト・番号 group — bullet / ordered / toggle(行頭 marker 置換、素朴 §7.2 段階 1)| `format_panel.numbering_ops_enabled` 導入 | +1 KB js |
| C2-6 | リスト・番号 group — indent 増 / 減(level 操作)| - | +0.6 KB js |
| C2-7 | visual parity test(γ-C2、表 contextual button は座標依存で必須)+ flag default ON | 2 flag default ON | +0 KB |

**累積**:+6.8 KB js / +1 KB css。
**visual parity test**:C2-7 で表内 caret 位置の「行追加」button を実 OS event click → pipe table 行数 +1 → preview `<table>` の `<tr>` +1。

### §2.3 γ-C3:検索 group 統合 + 採番正規化(4 PR)

| PR | scope | Tier 0 flag | budget |
|---|---|---|---|
| C3-1 | 検索 group — 既存 replace dialog への導線 button(`open-replace-dialog` 再利用)| `format_panel.search_integration_enabled` 導入 + default ON | +0.3 KB js |
| C3-2 | 採番正規化 — 領域 8 auto-renumber engine 連携(`1. 1. 1.` → `1. 2. 3.`)| `format_panel.numbering_renumber_enabled` 導入 | +0.5 KB js |
| C3-3 | uniform-one toggle(全部 `1.`)| - | +0.3 KB js |
| C3-4 | visual parity test(γ-C3)+ 採番 flag default ON | `numbering_renumber` default ON | +0 KB |

**累積**:+1.1 KB js。
**前提**:C3-2 / C3-3 は **roadmap 領域 8 Layer 1(auto-renumber engine)着地が必須**。領域 8 未着地なら γ-C3 は C3-1 のみ着地し C3-2〜4 は領域 8 完了まで保留(Group C §7.3 の段階 2 規約)。

---

## §3 Phase γ-B wave 詳細(右ペイン特化)

### §3.1 γ-B1:YAML graphical editor(7 PR)

| PR | scope | Tier 0 flag | budget |
|---|---|---|---|
| B1-1 | frontmatter section の mode toggle 骨格(graphical / raw)+ `state.frontmatterMode` | `meta_pane.yaml_graphical_enabled` 導入 | +1 KB js / +0.5 KB css |
| B1-2 | field-type-aware UI — enum(`kind` / `writing` / `align` / `layout`)+ string(`title` / `author` / `provider`)| - | +1.5 KB js / +1 KB css |
| B1-3 | field-type-aware UI — URL(`url` / `thumbnail_url` + file picker)+ numeric(`limits`)| - | +1.5 KB js |
| B1-4 | field-type-aware UI — `vars.*` table form(+/- row)+ `notation_overrides` toggle | - | +1.5 KB js |
| B1-5 | raw mode textarea + 不正 YAML 赤バー fallback(`meta_pane.yaml_graphical_fallback`)+ cap UI | `meta_pane.yaml_graphical_fallback` 導入 | +1 KB js / +0.5 KB css |
| B1-6 | unknown keys の "Other properties" read-only subsection + serialize merge 保護 | - | +0.5 KB js |
| B1-7 | visual parity test(γ-B1、case matrix §3.3 の 12 cases)+ flag default ON | `yaml_graphical_enabled` default ON | +0 KB |

**累積**:+8.5 KB js / +3.5 KB css。
**visual parity test**:B1-7 で各 field type を実 OS event 操作 → entry.body 内 `---` block の YAML 内容更新 + 不正 YAML → raw fallback。

### §3.2 γ-B2:graph view relation wire editor(8 PR)

| PR | scope | Tier 0 flag | budget |
|---|---|---|---|
| B2-1 | graph view edit mode toggle UI + `state.graphMode`(view / edit)| `graph.edit_mode_enabled` 導入 | +1 KB js |
| B2-2 | drag → edge prototype line(canvas 半透明 点線描画)| - | +1.2 KB js |
| B2-3 | kind selector popup(4 kind + cancel、`graph.kind_selector_show_cancel`)| `graph.kind_selector_show_cancel` 導入 | +1 KB js / +0.5 KB css |
| B2-4 | relation 確定 flow + 既存 relation 衝突チェック + provenance 保護 | - | +0.8 KB js |
| B2-5 | multi-select(Shift / Ctrl / Cmd+click)+ region-select 連携 | - | +1 KB js |
| B2-6 | bulk operation(bulk relate / bulk kind 変更 / bulk delete)+ atomic undo | `meta_pane.relation_editor_enabled` 導入 | +1.2 KB js |
| B2-7 | 大規模 graph perf(quadtree spatial index、OQ-B-6 で必要判定時のみ)| - | +1.5 KB js |
| B2-8 | visual parity test(γ-B2、canvas pixel + DOM 双方)+ flag default ON | `graph.edit_mode_enabled` / `relation_editor_enabled` default ON | +0 KB |

**累積**:+8.9 KB js / +1 KB css。
**visual parity test**:B2-8 で `page.mouse.down/move/up` の drag シーケンス → kind popup → relation 追加を canvas pixel + relations list 行数で assert。

### §3.3 γ-B3:meta pane mode 切替 UI(4 PR)

| PR | scope | Tier 0 flag | budget |
|---|---|---|---|
| B3-1 | meta pane mode tab strip(`data-pkc-region="meta-mode-bar"`)+ `state.metaPaneMode` | `meta_pane.mode_default` 導入 | +0.8 KB js / +0.5 KB css |
| B3-2 | relation-editor mode(graph edit 連動 + References subsection 拡大)| - | +0.5 KB js |
| B3-3 | yaml-editor mode(frontmatter full-size)+ collapse state 互換性 | - | +0.5 KB js |
| B3-4 | visual parity test(γ-B3)+ mode default 確定 | `mode_default` 確定値 | +0 KB |

**累積**:+1.8 KB js / +0.5 KB css。

---

## §4 Phase γ-A wave 詳細(shell 再構成)

### §4.1 γ-A1:sidebar mode default 切替(6 PR)

| PR | scope | Tier 0 flag | budget |
|---|---|---|---|
| A1-1 | `sidebarMode()` の filer 経路を default 候補に昇格(flag 経由)| `shell.sidebar_mode_default` 導入(default `'tree'`)| +0.5 KB js |
| A1-2 | filer 経路の tree-port(sidebar tree の機能を filer に移植、OQ-A-3 依存)| - | +2 KB js / +1 KB css |
| A1-3 | filer 経路の navigation parity(既存 sidebar の全 navigation を filer で再現)| - | +1.5 KB js |
| A1-4 | `sidebar_mode_default` を `'filer'` に default 切替 | flag default `'filer'` | +0 KB |
| A1-5 | 旧 sidebar に Beta deprecated marker 表示 | - | +0.3 KB js / +0.2 KB css |
| A1-6 | visual parity test(γ-A1、navigation が filer 経由に切替)| - | +0 KB |

**累積**:+5.8 KB js / +2.4 KB css。
**前提**:A1-2 は **OQ-A-3(sidebar tree port の範囲)** 合意が必須。

### §4.2 γ-A2:編集 mode 3 分割(10 PR)

| PR | scope | Tier 0 flag | budget |
|---|---|---|---|
| A2-1 | 編集 mode registry(`detail` / `overlay` / `split` / `window`)+ `state.editMode` | `shell.edit_mode_default` 導入 | +1 KB js |
| A2-2 | 透過 Overlay mode — render 済の上に半透明 textarea(OQ-A-1 精度依存)| `shell.overlay_mode_enabled` 導入 | +2 KB js / +1.5 KB css |
| A2-3 | Overlay mode — caret ↔ source 同期 + scroll 同期 | - | +1.5 KB js |
| A2-4 | Split View mode — 既存 Split View を mode registry に統合 | - | +0.5 KB js |
| A2-5 | 専用窓 mode — 編集面を別 window に分離(entry-window 経路拡張)| `shell.window_mode_enabled` 導入 | +2 KB js |
| A2-6 | per-archetype 編集 mode default(text=overlay / textlog=split 等)| - | +0.8 KB js |
| A2-7 | 編集 mode 切替 keyboard shortcut(`Cmd/Ctrl+E` 系列)| - | +0.5 KB js |
| A2-8 | 編集 mode 切替 UI(mode picker)| - | +0.7 KB js / +0.5 KB css |
| A2-9 | mode 永続化(localStorage `pkc2.editMode.*`)+ 既存互換 | - | +0.3 KB js |
| A2-10 | visual parity test(γ-A2、3 mode 切替の DOM + computed style 遷移)+ flag default ON | 3 flag default ON | +0 KB |

**累積**:+9.6 KB js / +3.5 KB css。
**前提**:A2-2 は **OQ-A-1(Overlay 精度)** 合意が必須。

**実装記録(2026-05-20、stack PR-pgc-27〜)**:A2-1(foundation)を
`pgc-27`、A2-2(picker UI + window 配線)を `pgc-28`、A2-3(localStorage
永続化)を `pgc-29` で着地。本 stack は γ-A1(sidebar)より先に γ-A2
(編集 mode)から着手(両 sub-wave は独立、editMode foundation は
sidebar に非依存)。A2-1 着手時に 3 mode(`overlay` / `split` /
`window`)を **編集 surface 軸のみ**(`editMode: 'inline' | 'window'`)
に精緻化 — `split` は inline 内 sub-layout、透過 overlay は OQ-A-1 UX
不確実で deferred。詳細は shell spec §2.5〜§2.7。flag は
`shell.edit_mode_enabled`(boolean gate)1 本に集約。**γ-A2 は picker /
window 配線 / 永続化が揃い機能的に完了**:per-archetype default(A2-6)
+ mode 別 keyboard shortcut(A2-7)は 2-mode model で不採用 / 不要、
flag default ON 切替(A2-10)は user 判断に委ねる。

### §4.3 γ-A3:マルチウィンドウ(11 PR)

| PR | scope | Tier 0 flag | budget |
|---|---|---|---|
| A3-1 | `editingLid` → `editingLids: Set` 化(複数 child 編集対応、OQ-A-2)| - | +1 KB js |
| A3-2 | 子 window の data flow(container live update 受信)| - | +1.5 KB js |
| A3-3 | postMessage protocol 4 新 type(child 編集 / main 通知)| - | +1.5 KB js |
| A3-4 | main reload guard(編集中 child があれば main 遷移抑制、OQ-A-4)| `shell.main_navigation_only` 導入 | +1 KB js |
| A3-5 | 複数 entry の同時並列編集 orchestration | - | +2 KB js |
| A3-6 | 競合解決(同 entry を複数 window で開いた時)| - | +1.5 KB js |
| A3-7 | per-window state persistence(OQ-A-5)| - | +1.5 KB js |
| A3-8 | main = navigation 専用化(detail を child window に逃がす)| - | +1.5 KB js |
| A3-9 | 子 window の close / crash recovery | - | +1 KB js |
| A3-10 | マルチウィンドウ整合性 audit | - | +0 KB |
| A3-11 | visual parity test(γ-A3、子 window 編集 → main IDB 反映)| - | +0 KB |

**累積**:+15 KB js。
**前提**:A3-1 は **OQ-A-2**、A3-4 は **OQ-A-4**、A3-7 は **OQ-A-5** 合意が必須。

**実装記録(2026-05-20、stack pgc-30〜31)**:A3-4(main reload guard)を
`pgc-30` で先行着地。reload guard は子 window の有無を entry-window.ts の
`getOpenEntryWindowLids()` で参照でき、A3-1 の `editingLid → editingLids`
Set 化(state machine 全体 + 多数 test に波及する大規模 refactor)に
依存しないため先行できた。flag は shell spec §3.2 に合わせ
`shell.main_reload_guard`(本表旧表記 `shell.main_navigation_only` は
A3-8「main = navigation 専用」側の概念)、γ-A stack 方針で default OFF
出荷。

**γ-A3 closeout(pgc-31)**:`entry-window.ts`(約 2977 行)を本表の
A3-1〜A3-11 と突き合わせる audit を実施。**複数 child window 同時 /
parent→child live refresh / postMessage protocol(8 type)/ 競合検知 /
close-crash recovery はすべて実装済**と確認。本 sub-wave は format-panel
(γ-C)と同様、wave map が「新規実装」前提で書かれていたが既存資産が
spec を上回っていた。**γ-A3 は reload guard(pgc-30)着地で機能的に
完了**:A3-1 の `editingLids` Set 化は consumer 不在で見送り(YAGNI)、
A3-6 競合 3-pane diff は spec §3.5 で deferred、A3-8 は γ-A1 に統合。
詳細は shell spec §3.6。

### §4.4 γ-A4:旧 sidebar 完全 removal(4 PR、v3.0 lineup 合流)

| PR | scope | Tier 0 flag | budget |
|---|---|---|---|
| A4-1 | 旧 sidebar tree mode の code path 除去 | `shell.sidebar_mode_default` flag 撤去 | −3 KB js / −2 KB css |
| A4-2 | sidebar 関連 dead code / test 整理 | - | −1 KB js |
| A4-3 | `data-pkc-region` の sidebar 系 deprecated region 撤去 | - | −0.5 KB js |
| A4-4 | doc / manual の sidebar 記述更新 | - | +0 KB |

**累積**:**−4.5 KB js / −2 KB css**(removal なので減る)。
**前提**:γ-A4 は v3.0 lineup の major bump タイミングに合わせる(別途判断、本 Phase γ の必須ではない)。

---

## §5 budget 試算(全 wave 累積)

### §5.1 wave 別 budget 推移

起点:**bundle.js 1874 KB / bundle.css 163 KB**(2026-05-19 build、cap
4608 / 512 KB)。

| wave | js Δ | css Δ | 累積 js | 累積 css |
|---|---|---|---|---|
| 起点 | - | - | 1874 | 163 |
| γ-C1 | +7 | +2 | 1881 | 165 |
| γ-C2 | +6.8 | +1 | 1888 | 166 |
| γ-C3 | +1.1 | 0 | 1889 | 166 |
| γ-B1 | +8.5 | +3.5 | 1897 | 169 |
| γ-B2 | +8.9 | +1 | 1906 | 170 |
| γ-B3 | +1.8 | +0.5 | 1908 | 171 |
| γ-A1 | +5.8 | +2.4 | 1914 | 173 |
| γ-A2 | +9.6 | +3.5 | 1923 | 177 |
| γ-A3 | +15 | 0 | 1938 | 177 |
| γ-A4 | −4.5 | −2 | **1934** | **175** |

**Phase γ 完了時点**:bundle.js **1934 KB**(cap 4608 KB の 42%)、
bundle.css **175 KB**(cap 512 KB の 34%)。headroom は十分。

### §5.2 plan §5.2 試算との差分

plan §5.2 は group 単位で +30 KB js / +16 KB css(完了時 1904 / 179 KB)と
試算。本書の PR-by-PR 積算は **+60 KB js / +12 KB css → γ-A4 removal で
+55.5 / +12** に修正。js が plan 試算より大きいのは、各 wave の PR 分解で
visual parity test / orchestration / audit を個別計上したため。それでも
cap headroom は 58%(js)/ 66%(css)残り、問題なし。

### §5.3 budget 監視規律

CLAUDE.md PR Workflow §7「headroom 1 KB 切ったら bump 検討」は Phase γ で
**遠く未到達**(headroom 2674 KB js)。各 PR で `git diff --stat` + bundle
サイズ確認は継続するが、bump 判断は不要。

---

## §6 visual parity test 一覧(全 wave)

CLAUDE.md Wave §5「視覚機能 PR に visual parity test 最低 1 件」+ §6 順序性
doctrine を Phase γ 全 wave に適用。

| wave | test file | assert 内容 |
|---|---|---|
| γ-C1 | `group-c-format-panel-parity.spec.ts` | Font / 段落 button を実 OS event click → textarea canonical 記法 + preview render 変化 |
| γ-C2 | `group-c-table-ops-parity.spec.ts` | 表内 caret の行追加 button → pipe table 行 +1 → preview `<tr>` +1(座標依存で必須)|
| γ-C3 | `group-c-search-numbering-parity.spec.ts` | 検索 button → dialog 表示 / 採番正規化 → source 連番修正 |
| γ-B1 | `group-b-yaml-editor-parity.spec.ts` | field type 操作 → entry.body の YAML 更新 / 不正 YAML → raw fallback |
| γ-B2 | `group-b-relation-wire-parity.spec.ts` | drag シーケンス → kind popup → relation 追加(canvas pixel + DOM 双方)|
| γ-B3 | `group-b-meta-mode-parity.spec.ts` | mode tab → meta pane root attribute + section 可視性遷移 |
| γ-A1 | `group-a-sidebar-filer-parity.spec.ts` | navigation が filer 経由に切替、tree-port 機能 parity |
| γ-A2 | `group-a-edit-mode-parity.spec.ts` | 3 mode 切替で center pane DOM + computed style 確定遷移 |
| γ-A3 | `group-a-multiwindow-parity.spec.ts` | 子 window 編集 → main IDB 反映、main reload guard |

各 test は **同 PR 内**(各 wave の最終 PR)で添付。順序性鎖(boot → action
→ consumer 観測)を全件 covered、DOM attribute 遷移で止めず consumer 数値
変化まで assert(CLAUDE.md §8)。

---

## §7 OQ gating checklist(20 OQ を wave に割当)

Phase γ は **20 個の open question** が user 合意されるまで該当 wave を
着手できない。OQ → wave の割当:

### §7.1 Group A OQ(5 件)

| OQ | 内容 | gate する wave | 暫定回答(spec §8)|
|---|---|---|---|
| OQ-A-1 | 透過 Overlay の精度 | γ-A2(A2-2)| spec 暫定あり |
| OQ-A-2 | 複数 child 編集 | γ-A3(A3-1)| spec 暫定あり |
| OQ-A-3 | sidebar tree port の範囲 | γ-A1(A1-2)| spec 暫定あり |
| OQ-A-4 | main = navigation 専用 | γ-A3(A3-4)| spec 暫定あり |
| OQ-A-5 | per-window state persistence | γ-A3(A3-7)| spec 暫定あり |

### §7.2 Group B OQ(7 件)

| OQ | 内容 | gate する wave | 暫定回答 |
|---|---|---|---|
| OQ-B-1 | graph edit mode default | γ-B2(B2-1)| view default + 明示 toggle |
| OQ-B-2 | nested YAML support | γ-B1(B1-4)| flat 限定 |
| OQ-B-3 | multi-select modifier | γ-B2(B2-5)| Shift / Ctrl / Cmd 両対応 |
| OQ-B-4 | drag-create visual feedback | γ-B2(B2-2)| neutral 灰色 半透明 点線 |
| OQ-B-5 | unknown frontmatter keys | γ-B1(B1-6)| read-only Other section |
| OQ-B-6 | 大規模 graph perf | γ-B2(B2-7)| quadtree 導入余地 |
| OQ-B-7 | bulk undo atomicity | γ-B2(B2-6)| atomic bulk |

### §7.3 Group C OQ(8 件)

| OQ | 内容 | gate する wave | 暫定回答 |
|---|---|---|---|
| OQ-C-1 | desktop panel 配置 | γ-C1(C1-1)| 上部 ribbon |
| OQ-C-2 | justify 記法新設 | γ-C3 | `:::paragraph{align=justify}` 拡張 |
| OQ-C-3 | indent / line-height 記法化 | γ-C3 | Group C scope 外 |
| OQ-C-4 | 番号段階 1 先行 | γ-C2(C2-5)| 先行提供 |
| OQ-C-5 | 表 operation 対象範囲 | γ-C2(C2-1)| GFM pipe table のみ |
| OQ-C-6 | floating ↔ fixed 出し分け | γ-C1(C1-1)| user 設定 + auto |
| OQ-C-7 | 複数行選択 inline 挙動 | γ-C1(C1-2)| 全体 1 wrap |
| OQ-C-8 | floating popup 再編 | γ-C1(C1-1)| 現状維持 |

### §7.4 gating 運用

- **暫定回答のまま着手は可**(各 OQ は spec で暫定が定まっている)。ただし
  user が暫定を覆す可能性がある OQ は、該当 wave 着手前に **明示確認** を
  取る
- gate の優先度:γ-C1 着手前に **OQ-C-1 / C-6 / C-7 / C-8**(4 件)、
  γ-B1 着手前に **OQ-B-2 / B-5**(2 件)、… と wave 単位でまとめて確認
- 全 20 OQ を Phase γ 着手前に一括確認するのが理想(後述 §9 gate)

---

## §8 wave 運用規律(CLAUDE.md Wave §1〜§11 の Phase γ 適用)

| CLAUDE.md Wave 規律 | Phase γ での適用 |
|---|---|
| §1 30〜50 PR 打ち止め | §1.3 の 3 merge train(25 / 31 / 15 PR)で遵守 |
| §2 stacked PR は base retarget 先 | 各 train 締めで頂点 PR の base を main に付け替え |
| §3 既存問題は別 hotfix PR | Phase γ 中に出た既存 bug / lint は即別 PR で剥がす |
| §4 case matrix 最低 10 件 | γ-C / γ-B の inline operation は spec で 12〜14 件確保済 |
| §5 visual parity test 最低 1 件 | §6 の 9 test、各 wave 最終 PR で添付 |
| §6 user 先回り | 20 OQ を §7 で wave gate 化、叩かれる前に確認 |
| §7 doc orphan 即登録 | Phase γ の新 doc は同 commit で INDEX 登録 |
| §9 3 surface dual-render verify | γ-C は editor → 3 surface 自動反映、fence skip 厳守 |
| §10 LineMap thread | γ-C2 表 operation の行挿入で Split View line anchor 保護 |
| §11 fence 内 preprocessor skip | γ-C の全 operation は code fence 内で発火しない |

---

## §9 Phase γ 開始判断 gate

### §9.1 開始 trigger(全て満たすこと)

1. PR-β1 / β2 / β3 / β4 すべて着地 ✅(β4 = 本書)
2. **20 OQ の user 合意**(§7、暫定回答ベースでも明示 OK が要る)
3. budget headroom 確認(§5、現状問題なし)
4. roadmap 領域 8 Layer 1 の状況確認(γ-C3 C3-2〜4 の前提)

### §9.2 着手の最小単位

Phase γ は **γ-C1 から**。γ-C1 着手前に **OQ-C-1 / C-6 / C-7 / C-8** の
4 件だけ先に確認すれば C1-1 に入れる(全 20 OQ を待たなくてよい、wave 単位
の段階 gate)。

### §9.3 停止 trigger

- 1 PR が unresolved review point を残したら該当 train を止める
- 各 sub-wave が想定 PR 数の 1.5 倍を超えたら wave 再分割
- 既存問題が出たら別 hotfix PR で剥がす(CLAUDE.md Wave §3)

### §9.4 Phase β 完了の宣言

本書(PR-β4)着地で **Phase β(設計 wave)は完了**。Phase β の成果物:
- PR-β0 plan + PR-β1/β2/β3 の 3 group spec + PR-β4 本書 = **計 5 doc**
- Group A/B/C の実装 spec が出揃い、Phase γ は本書の wave map に従って
  実行できる状態

Phase β の 5 doc は Phase γ 完了まで **LIVE active**(INDEX 掲載維持)、
Phase γ 完了時に `docs/development/archived/phase-beta/` へ一括 archive
(doc-archival-discipline §6.1)。

---

## §10 history

| date | event |
|---|---|
| 2026-05-19 | PR #480(PR-β0)merge:Phase β plan 着地 |
| 2026-05-19 | PR #481(PR-β1)merge:Group A 統合 spec 着地 |
| 2026-05-19 | PR #482(PR-β2)merge:Group B 右ペイン特化 spec 着地 |
| 2026-05-19 | PR #483(PR-β3)merge:Group C 書式機能 spec 着地 |
| 2026-05-19 | **本書起こし(PR-β4)**:Phase γ 実装 wave map。9 sub-wave(γ-C1〜C3 / γ-B1〜B3 / γ-A1〜A4)を 68 PR に PR-by-PR 分解、3 merge train 構成、budget 推移試算(完了時 1934 / 175 KB)、visual parity test 9 件、20 OQ の wave gating checklist、CLAUDE.md Wave §1〜§11 の Phase γ 適用表。**本書着地で Phase β 設計 wave 完了** |
| 2026-05-19 | PR #484(PR-β4)merge:Phase γ 実装 wave map 着地 |
| 2026-05-20 | user 判断:20 OQ 暫定回答を全承認、Phase γ-C1 着手。以後は **main 着地せず stack 運用**(PR-pgc-NN) |
| 2026-05-20 | **訂正(stack PR-pgc-01)**:γ-C 着手準備中に既存 `format-panel.ts`(選択追従 floating 書式 panel、本番稼働中)を発見。§2 を scrap-and-build に再定義(C1-1 = 旧 panel scrap + 新 ribbon build、flag は `editor.format_panel_enabled` 引き継ぎ)。詳細は [`phase-beta-group-c-format-panel-spec-2026-05.md`](./phase-beta-group-c-format-panel-spec-2026-05.md) 訂正 notice |
| 2026-05-20 | **Phase γ-C1 実装(stack PR-pgc-02〜08、main 着地せず stack 運用)**:pgc-02 scrap-and-build 骨格 + 14 op / pgc-03 font-size・family picker / pgc-04 文字色・背景色 picker / pgc-05 段落 align / pgc-06 表挿入 / pgc-07 挿入(ruby / 区切り線)/ pgc-08 CHANGELOG + doc 同期。固定 format ribbon = 6 group / operation 19 種 / value picker 5 種。検索 group・表の行列編集・justify は後続(CHANGELOG v2.3.0 §Phase γ-C1 参照)|
| 2026-05-20 | **Phase γ-C 続行(stack PR-pgc-09〜14)**:pgc-09 検索 launcher / pgc-10 表行編集(pipe-table-edit.ts pure parser 新設)/ pgc-11 表列編集 / pgc-12 表セル整列 / pgc-13 リスト・番号拡充 / pgc-14 doc 同期。固定 ribbon = operation 28 種 / picker 6 種 / launcher 1 種。採番正規化(領域 8 待ち)・justify(renderer 対応待ち)を残す |
| 2026-05-20 | **Phase γ-B 実装(stack PR-pgc-15〜26)**:γ-B1 YAML graphical editor(serialize / 編集 form / field-type / warnings、pgc-15〜18)/ γ-B2 graph relation wire editor(edit mode / wire drag / kind popup / CREATE_RELATION / Shift+drag 退避 / multi-select 一括 / visual parity test、pgc-19〜24)/ γ-B3 meta pane mode tabs(pgc-25)/ doc 同期(pgc-26)。すべて flag gate。Group B 完了。詳細は CHANGELOG v2.3.0 §Phase γ-B |
| TBD | Phase γ-C 残(採番正規化 / justify)、γ-A wave(shell 再構成)|

---

## §11 関連 doc

- [`phase-beta-plan-2026-05-19.md`](./phase-beta-plan-2026-05-19.md):
  PR-β0 全体計画。本書は plan §5.1 の coarse な 6 wave 一覧を 9 sub-wave
  + PR-by-PR に精緻化して supersede(plan §5.1 は historical reference)
- [`phase-beta-group-a-shell-spec-2026-05.md`](./phase-beta-group-a-shell-spec-2026-05.md):
  γ-A1〜A4 wave の spec 由来。OQ-A-1〜5
- [`phase-beta-group-b-meta-pane-spec-2026-05.md`](./phase-beta-group-b-meta-pane-spec-2026-05.md):
  γ-B1〜B3 wave の spec 由来。OQ-B-1〜7
- [`phase-beta-group-c-format-panel-spec-2026-05.md`](./phase-beta-group-c-format-panel-spec-2026-05.md):
  γ-C1〜C3 wave の spec 由来。OQ-C-1〜8
- [`feature-requests-2026-04-28-roadmap.md`](./feature-requests-2026-04-28-roadmap.md):
  領域 8 番号体系 Layer 1 = γ-C3 C3-2〜4 の前提
- [`visual-state-parity-testing.md`](./visual-state-parity-testing.md):
  §6 visual parity test 9 件の方法論 reference
- [`pr-review-checklist.md`](./pr-review-checklist.md):
  Phase γ 各 PR の 8 項目自己監査の正本
- [`doc-archival-discipline.md`](./doc-archival-discipline.md):
  §9.4 Phase β 5 doc の Phase γ 完了時 archive 規約
