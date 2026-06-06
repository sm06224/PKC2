> 🔒 **凍結(2026-06-06、L4 #775)**:本 doc は「機能を足す」系の計画 / tracking で、現在のプライム・ディレクティブ「機能を足さない・削る/選る/着陸」と両立しないため **frozen**。**正本は [`v3-consolidation-and-direction-2026-06.md`](./v3-consolidation-and-direction-2026-06.md)**、保全台帳は GitHub Issue #776。参照のみ、再開には user の明示 go が要る。

---

# PKC2 v3.x Phase β 設計 wave 計画(2026-05-19 起点)

**Status**:設計 wave 計画(docs-only、user 合意 → 各 group spec PR 起こしへ)
**Trigger**:Phase α 完了(2026-05-19、PR #463〜#479 全件着地)+ user direction
「Phase β 全体計画 doc で合意」(2026-05-19)
**Wave 想定**:2 週、4-6 docs-only PR、Phase γ 実装 wave への bridge
**前提 doc**:[`v3-architecture-proposals-2026-05-18.md`](./v3-architecture-proposals-2026-05-18.md)

---

## §0 本 doc の位置付け

`v3-architecture-proposals-2026-05-18.md` で受領した 8 案を、**Group A/B/C
の詳細 spec を起こす wave(= Phase β)** に進める前に、wave 全体の **計画 +
open question Q1〜Q9 への暫定回答** を user 合意レベルで固める doc。

本 doc は **計画書**、ここで合意 → 各 group の **canonical spec doc**
(`phase-beta-group-a-shell-spec-2026-05.md` 等)を別 PR で起こす流れ。
spec を勝手に書き始める前に、user 判断を要する分岐点を **全部本書で詰めて
おく** ことで、Phase β 中の手戻りを最小化する。

**Phase 区分(再確認)**:

| Phase | scope | 期間 | 状態 |
|---|---|---|---|
| α | Wave Z 直後 small-wins(PiP 廃止 / bug fix / popover / dep / CI)| 3 日 | ✅ 完了(2026-05-19) |
| **β** | **Group A/B/C 詳細 spec(本 wave)** | **2 週** | 🟡 **計画起こし中(本 doc)** |
| γ | 実装 wave(Group C → B → A の順、各 wave で 20〜30 PR)| 2〜3 ヶ月 | ⏳ Phase β 着地後 |
| δ | Group D(canvas + wasm)v3.0 spinoff | 4〜6 ヶ月、別 repo branch | ⏳ 別 spinoff |

---

## §1 Phase β scope

### §1.1 含むもの(本 wave で起こす docs)

- **PR-β0**(本 PR、本書):Phase β 全体計画 + open question 暫定回答
- **PR-β1**:Group A 統合 spec(#1 + #4 + #5 = 編集 mode 3 分割 +
  マルチウィンドウ + ファイラ統合 / 左ペイン廃止)
- **PR-β2**:Group B 右ペイン spec(#6 = relation wire editor +
  YAML frontmatter graphical editor)
- **PR-β3**:Group C 書式機能 spec(#7 = format panel ワープロ化)
- **PR-β4**(optional):Phase γ 実装 wave map(各 PR の順序 / scope /
  budget 試算)

### §1.2 含まないもの

- **Group D(#2 + #8 = canvas + wasm 化)**:Phase δ で別 spinoff として
  扱う。本 Phase β scope 外。理由:現 DOM-based architecture の根本書き換え
  で、並走実装すると両方の test / spec を二重保守する crippling overhead
- **実装(src 変更)**:Phase γ の責務。Phase β は spec docs のみ
- **bundle.css 領域 9 Phase 4(per-archetype palette)**:USER_REQUEST_LEDGER
  §3.6 deferred、Phase β scope 外(別 wave で再評価)

### §1.3 想定期間 + PR 数

- 2 週(2026-05-19〜2026-06-02 目安)
- 4-6 docs-only PR(各 PR docs/development/ または docs/spec/ に新規 spec
  doc を追加 + INDEX 同期)
- 各 PR で **user 合意 ✅ を得てから次へ進む**、勝手に stack しない

---

## §2 spec PR stack 構成

### §2.1 PR-β1 = Group A 統合 spec(`phase-beta-group-a-shell-spec-2026-05.md`)

**なぜ統合?** #1 編集 mode 3 分割、#4 マルチウィンドウ、#5 ファイラ統合
の 3 提案は **すべて PKC2 shell(main window + sidebar + center pane の
配置)を書き換える** ため、互いに依存する。3 つを別 spec にすると配置が
決まらず spec 同士の cross-ref が破綻する。1 spec で全部固める。

**spec 構成案**:

| § | 内容 |
|---|---|
| §1 現状 shell の整理 | sidebar tree / center pane / meta pane / view-mode tab の配置と機能、現 entry-window の data flow |
| §2 編集 mode 3 分割(#1) | 透過 / Split / 専用窓 の 3 mode 定義、各 trigger UX、persist 規約、toggle UI、既存 detail-edit + Split View との互換性 |
| §3 マルチウィンドウ(#4) | 子 window の data flow、main reload 抑制 規約、postMessage protocol 拡張、container live update、競合解決 |
| §4 ファイラ統合 + 左ペイン廃止(#5) | `folder.detail_as_filer` の default ON 化、現 sidebar の deprecated 経路、Beta marker → removal の段階導入 |
| §5 migration plan | Tier 0 flag `shell.multi_window` / `shell.sidebar_legacy` 等の opt-in 経路、現 user 設定の保存・移行 |
| §6 backward compat | 既存 detail-edit + Split View は保持、新 mode を **追加**、user 設定で選択。子 window 経路は既存 entry-window と統合 |
| §7 open question 残課題 | spec 起こし中に出た新 question を user 追加合意待ち欄に |

### §2.2 PR-β2 = Group B 右ペイン spec(`phase-beta-group-b-meta-pane-spec-2026-05.md`)

| § | 内容 |
|---|---|
| §1 現 meta pane 整理 | 既存 frontmatter / tags / relations / display_profile の編集 UI、resize 挙動 |
| §2 Relation wire editor(#6a) | graph view との統合、drag → edge 作成、kind selector popup、relation 確定 flow |
| §3 YAML graphical editor(#6b) | table 形式の graphical edit UI、advanced toggle で raw YAML edit、生成 YAML の body 書き戻し |
| §4 region 規約 | right-pane mode の `data-pkc-region="meta-relation-editor"` / `meta-yaml-editor` 規約、view-mode tab 統合 |
| §5 backward compat | 既存 frontmatter raw editor を fallback として残す、Tier 0 flag `meta_pane.mode_default` で初期 mode 選択 |

### §2.3 PR-β3 = Group C 書式機能 spec(`phase-beta-group-c-format-panel-spec-2026-05.md`)

| § | 内容 |
|---|---|
| §1 既存 format panel 整理 | PR-2JJ v2(2026-05-13、14 button)の構成、Tier 0 flag `editor.format_panel_enabled` の挙動 |
| §2 ワープロ相当 operation 一覧 | font / 段落 / 表 / 番号 + 検索置換 の 5 軸、各軸の operation を table 化 |
| §3 PKC MD canonical 形対応表 | 各 operation の PKC MD 出力形(`**X**` / `:strong:[X]` / `:span:cls:` 等)、不可逆 operation の判定 |
| §4 不可逆 operation の扱い | font 色 inline style 直書き等 PKC MD canonical 形に逆変換できない operation は提供しない、`:span:cls:` + class 定義経由で誘導 |
| §5 UI 設計 | format panel richer mode、現 14 button を base、追加 ~20 operation の配置、keyboard shortcut |
| §6 backward compat | 現 format panel は保持、Tier 0 flag `editor.format_panel_richer` で gate(default OFF、user opt-in) |

### §2.4 PR-β4 = Phase γ 実装 wave map(optional、spec 全件着地後)

各 spec PR が着地したら、**Phase γ 実装順序 + 各 PR の scope + budget
試算 + Tier 0 flag 一覧 + visual parity test 計画** を 1 doc にまとめる。
Phase γ 着手前の最終 audit doc。

---

## §3 open question Q1〜Q9 の暫定回答誇規案

`v3-architecture-proposals-2026-05-18.md` §5 で記録した 9 件の open question
について、**Phase β spec を書き始める前に判断方針を固める**。本 §3 は暫定
回答、user 合意待ち。

### §3.1 Group A(Q1〜Q3)

#### Q1:#1 の 3 mode 定義は user 用途で決める? 実装可能性で決める?

**暫定回答**:**user 用途で決める**。

理由:現状の編集 mode は detail-edit と Split View の 2 種で、user が
「読みながら少し直したい」「書きながらプレビュー見たい」「集中して書きたい」
の 3 状況を 2 mode で兼用していて trigger UX が曖昧。3 mode に分けることで
**選択責任が user に渡る = Postel's Law の receiver 側を user に開放** する。

- (a) **透過レイヤー編集**:render 済 content の上に半透明 textarea overlay、
  read-mostly 状況で「少し直す」用
- (b) **Split View 編集**:現状の Split View(editor + preview 並列)、
  書きながらプレビュー見たい状況用
- (c) **専用別窓**:編集専用 window + render 専用 window(or main = render)、
  集中執筆用

実装可能性は (a) > (b) > (c) の順(透過 overlay は新規実装、Split View は
既存、専用窓は子 window orchestration 拡張)、各々の実装 cost は別。

#### Q2:#4 マルチウィンドウで子 window が編集中に main がリロードされたら?

**暫定回答**:**main reload 抑制 default ON**。

理由:子 window で書いた編集を失うのは UX として致命的。main 側で:
- `dispatcher.phase === 'editing'` の子 window が 1 つでもあれば、
  main の `beforeunload` で confirm dialog を出す
- main 側の auto-save / IDB write 遷移は子 window 経路を経由(子の編集を
  常に main IDB に sync)
- 子 window が独立保存するか main IDB に流すかは Tier 0 flag
  `multi_window.child_persist_mode = 'main-only' | 'child-local' | 'both'`
  で選択、default `'main-only'`(現実装互換)

#### Q3:#5 左ペイン廃止は backward compat か一括破壊?

**暫定回答**:**backward compat 段階導入(3 段階)**。

- **Phase γ-A1**:`folder.detail_as_filer = true` を **default ON** 切替
  (現 user は OFF に明示変更すれば旧挙動を維持)
- **Phase γ-A2**:現 sidebar を **deprecated marker**(Beta)で表示、
  実機 user の不満報告を 1 month observe
- **Phase γ-A3**:旧 sidebar の **完全 removal** を v3.0 lineup に合わせて
  実施(別 wave、本 Phase β scope 外)

1-PR 一括破壊は test 全書換になり、CHANGELOG_v2.4.0 締めが回らない。
3 段階で互換性経路を保つ。

### §3.2 Group B(Q4〜Q5)

#### Q4:#6 relation editor は graph view と統合する? 別 UI で?

**暫定回答**:**graph view と統合**。

理由:現 graph view は entry を node、relation を edge として描画する
基盤がある(force-layout + canvas + 多 modifier 操作)。別 UI を新設すると
graph view と機能重複、user は「relation を編集したい」と思った時に
どちらを開くべきか迷う。

統合経路:
- graph view を **edit mode** に切替可能に
- 右クリック menu に「Edit relations from here」を追加
- node を選択 + drag → edge 作成 prototype 線、drag-end で kind selector
  popup → relation 確定の flow
- existing edge を右クリック → kind 切替 / delete

#### Q5:#6 YAML editor は YAML 構文を画面に出す? 完全に隠す?

**暫定回答**:**両モード対応、default は graphical**。

理由:
- YAML を完全に隠す → power user(AI authoring、frontmatter で document
  globals を細かく制御)が困る
- YAML を完全に出す → 初心者は engage しにくい
- **両刀** で初期 mode を user 設定で選べる

UI 設計案:
- right-pane の YAML editor section に **mode toggle**(graphical /
  raw、`data-pkc-meta-yaml-mode`)
- graphical mode:key/value 表形式、kind / writing / align / vars 等を
  input UI で編集、変更を YAML に書き戻し
- raw mode:現 textarea(現 meta pane raw frontmatter editor)
- 不正 YAML(構文 error)は graphical mode で読めないので、自動で raw
  mode に fallback + 赤バー警告

### §3.3 Group C(Q6〜Q7)

#### Q6:#7「初期ワープロ相当」の最低 line は何?

**暫定回答**:**font / 段落 / 表 / 番号 + 検索置換 = 5 軸**。

理由:Word 95 の最低操作集をそのまま採用。各軸の operation を spec §3 で
table 化、PKC MD 対応 form を明示する。

| 軸 | operation 候補 | 想定 PKC MD 対応 |
|---|---|---|
| font | family 直指定 / size 直指定 / 色変更 | **不可逆判定**(font family の inline style は PKC MD canonical に書き戻せない)、`:span:cls:` + class 定義経由で誘導 |
| 段落 | align(left/center/right/justify)/ indent / line-height | align prefix(`||` / `|>` / `|<` / `|=`)、indent prefix(`__`)で対応 |
| 表 | insert / cell merge / column resize | `\| col1 \| col2 \|` 形(現 GFM)+ `^^^ caption` |
| 番号 | level 増減 / ordered ↔ bullet 切替 | `1.` / `-` の標準 markdown list |
| 検索置換 | inline search / replace UI 拡張 | 既存 `Ctrl+F` 検索を拡張、関連:領域 5 #B1 |

#### Q7:format operation で PKC MD canonical 形に逆変換できないものは禁止?

**暫定回答**:**禁止する**。

理由:supreme invariant「**PKC MD = Rendered HTML 不変式**」(see
`markdown-render-scope.md`)を維持する。font 色 inline style 直書きや
font family の inline style 直書きは、PKC MD canonical 形に書き戻せない
ため、format panel の operation として **提供しない**。

代替経路:
- font 色 → `:span:cls:` + class 定義(theme.css 経由で色を指定)
- font family → **提供しない**(PKC2 は theme で統一的に設定する設計、
  inline 上書きは vision に反する)
- font size → 既存 `:sub:` / `:sup:` / `:em-dot:` 等のセマンティック span
  で誘導

詳細は PR-β3 spec の §3 / §4 で operation table + 不可逆判定で具体化。

### §3.4 Group D(Q8〜Q9、Phase δ scope、参考)

- **Q8**:v3.0 spinoff branch は本 repo / 別 repo どちらにする?→ Phase δ
  着手時に議論。**現時点での仮置き**:本 repo の `v3.0-spike` branch で
  R&D、安定したら新 repo に分離 or main に merge
- **Q9**:wasm 候補は Rust / Zig / AssemblyScript?→ Phase δ 着手時に議論。
  **現時点での仮置き**:Rust(`wasm-bindgen` の成熟度 + parser crate
  ecosystem が手厚い、`pulldown-cmark` を base にできる)

---

## §4 risk + rollback contract

### §4.1 Group A

**最大 risk**:子 window 間 state sync で main の dispatcher / IDB を奪い
合う、片方の編集が他方の re-render を block する。

**rollback contract**:
- 既存 detail-edit + Split View は保持、新 mode を **追加** だけ
- Tier 0 flag `shell.multi_window = false` で既存挙動に完全戻し
- 左ペイン廃止は §3.1 Q3 の 3 段階導入で、Phase γ-A1 の default ON 切替
  時点では、user 設定 `folder.detail_as_filer = false` で旧挙動完全維持

### §4.2 Group B

**最大 risk**:meta pane の resize / scroll が現 detail / textlog で
壊れる、relation editor の UI が graph view の force-layout と競合。

**rollback contract**:
- 既存 frontmatter raw editor を fallback として残す
- Tier 0 flag `meta_pane.mode_default = 'raw'` で初期 mode を旧 raw に
  固定可能
- relation editor は graph view の **edit mode toggle** として実装、
  edit mode を OFF にすれば現 graph view と完全同等

### §4.3 Group C

**最大 risk**:format panel richer mode で追加した operation が PKC MD
canonical 形を破壊、supreme invariant 違反。

**rollback contract**:
- 現 format panel は保持、新 operation は **richer mode** として追加
- Tier 0 flag `editor.format_panel_richer = false`(default OFF)で
  既存挙動完全維持
- spec §3 の不可逆 operation table を **設計時点で禁止**、実装に届かない

---

## §5 Phase γ 実装 wave への bridge

### §5.1 PR stack 順序(暫定、Phase β 着地後に PR-β4 で確定)

spec が固まったら以下の順で実装 wave を起こす:

| 順序 | wave | scope | 想定 PR 数 |
|---|---|---|---|
| 1 | Phase γ-C | Group C(format panel ワープロ化) | 5-10 PR |
| 2 | Phase γ-B | Group B(右ペイン特化) | 5-10 PR |
| 3 | Phase γ-A1 | `folder.detail_as_filer` default ON 切替 | 3-5 PR |
| 4 | Phase γ-A2 | 編集 mode 3 分割(透過 / Split / 専用窓) | 8-12 PR |
| 5 | Phase γ-A3 | マルチウィンドウ(子 window orchestration) | 8-12 PR |
| 6 | Phase γ-A4 | 旧 sidebar 完全 removal(v3.0 lineup 合流) | 3-5 PR |

**根拠**:
- **Group C を最初**:独立性最高、影響限定、PKC MD canonical 形維持の
  validate を実装初期に固める
- **Group B を 2 番目**:right-pane mode 切替で済む、Group A の前提なし
- **Group A を最後**:shell 書き換え、最 risky、Group C/B が安定して
  から着手

### §5.2 各 group の budget impact 試算

| group | bundle.js 増 | bundle.css 増 | 合計 (cap 4608 / 512) |
|---|---|---|---|
| Group C | +5 KB(format panel richer + operation table)| +3 KB(button row 拡張)| 1879 / 166 KB |
| Group B | +10 KB(relation editor + YAML editor)| +5 KB(table form + edit mode)| 1889 / 171 KB |
| Group A | +15 KB(子 window orchestration + 3 mode toggle + filer 主役化)| +8 KB(透過 overlay + filer width)| 1904 / 179 KB |
| **合計** | **+30 KB** | **+16 KB** | 1904 / 179 KB(cap 4608 / 512 余裕大)|

現 1874 KB / 163 KB(2026-05-19 build)、cap の 41% / 35% 消化。Phase γ
完了時点で 1904 KB / 179 KB、cap の 41% / 35% 維持。headroom は十分。

### §5.3 visual parity test 計画

CLAUDE.md Wave §10 §5 規約「視覚を持つ feature の PR では visual parity
test 最低 1 件」を Phase γ に適用:

- Group C:format panel richer mode の各 operation で **selection 範囲
  に新規 PKC MD が挿入される** ことを `elementFromPoint` + 実 OS event
  ベースで assert(`tests/smoke/group-c-format-richer-parity.spec.ts`)
- Group B:graph view の edit mode で drag → edge prototype 描画 → drop
  で kind popup → relation 確定の **canvas pixel** + state 観測の鎖を
  実 OS event で assert
- Group A:3 mode 切替で center pane の **DOM 構造 + computed style** が
  確定値に遷移、子 window で書いた編集が main IDB に反映、左ペイン
  廃止経路で navigation が filer 経由に切替を実 OS event で assert

各 visual parity test を **同 PR 内** で添付、green 確認まで「ユーザー側で
merge 判断してよい状態」を報告しない(CLAUDE.md doctrine §6 visual-state-
parity-testing 準拠)。

---

## §6 Phase β 着地後の Phase γ 開始判断

### §6.1 開始 trigger

- PR-β1 / β2 / β3 すべて着地 + user 合意 ✅
- PR-β4(Phase γ wave map)着地 + budget / 順序 / visual parity 計画
  確定
- USER_REQUEST_LEDGER §3.6 deferred items に Group A/B/C の進捗を反映

### §6.2 停止 trigger

- 1 spec PR が unresolved review point を残したら Phase γ は止める
- 各 Phase γ-X wave が 30 PR を超える場合は wave 分割(CLAUDE.md Wave §1
  「30〜50 PR で打ち止め」遵守)
- 既存問題(CI flake / lint warning / 既存 bug)が出たら別 hotfix PR を
  立てて剥がす(CLAUDE.md Wave §3「既存問題は通さない」)

---

## §7 history

| date | event |
|---|---|
| 2026-05-19 | Phase α(small-wins、PR #463〜#479)完走 |
| 2026-05-19 | user direction「Phase β 全体計画 doc で合意」 |
| 2026-05-19 | **本書起こし(PR-β0)**:Phase β scope + spec PR stack + open Q1〜Q9 暫定回答 + Phase γ bridge を 1 doc で固める |
| 2026-05-19 | **PR-β1 起こし**:[`phase-beta-group-a-shell-spec-2026-05.md`](./phase-beta-group-a-shell-spec-2026-05.md) 着手。§4 で plan §3.1 Q3 の事実誤認(`folder.detail_as_filer` flag = sidebar 廃止 と書いたが、実際は center pane detail の filer 置き換え flag で sidebar とは別軸)を訂正、sidebar 廃止経路を `sidebarMode()` default 切替 + 3 段階 deprecation に再定義。新 OQ-A-1〜A-5 を追加(Overlay 精度 / 複数 child 編集 / sidebar tree port / main = navigation 専用 / per-window state persistence)|
| 2026-05-19 | PR #481(PR-β1)merge:Group A 統合 spec 着地、OQ-A-1〜A-5 未合意のまま継続 |
| 2026-05-19 | **PR-β2 起こし**:[`phase-beta-group-b-meta-pane-spec-2026-05.md`](./phase-beta-group-b-meta-pane-spec-2026-05.md) 着手。v3 提案 #6 = relation wire editor(graph view 統合)+ YAML frontmatter graphical editor を 1 spec に統合。case matrix 12 件 + 12 件で網羅、Tier 0 flag 6 件、新 OQ-B-1〜B-7 追加 |
| 2026-05-19 | PR #482(PR-β2)merge:Group B 右ペイン特化 spec 着地 |
| 2026-05-19 | **PR-β3 起こし**:[`phase-beta-group-c-format-panel-spec-2026-05.md`](./phase-beta-group-c-format-panel-spec-2026-05.md) 着手。v3 提案 #7 = format panel ワープロ化。現状調査で **desktop 固定 toolbar 未実装**(format affordance は `snippet-toolbar.ts` の floating popup 18 snippet のみ)が判明、roadmap §206 の「14 button」記述も古いと訂正。canonical 往復 invariant + 領域 8 / 領域 6 scope 境界を §2 で固定、case matrix 14+12+12+12 件、Tier 0 flag 7 件、新 OQ-C-1〜C-8 追加 |
| 2026-05-19 | PR #483(PR-β3)merge:Group C 書式機能 spec 着地 |
| 2026-05-19 | **PR-β4 起こし**:[`phase-gamma-implementation-wave-map-2026-05.md`](./phase-gamma-implementation-wave-map-2026-05.md) 着手。Phase γ を 9 sub-wave(γ-C1〜C3 / γ-B1〜B3 / γ-A1〜A4)= 68 PR に PR-by-PR 分解、3 merge train 構成、budget 推移試算(完了時 1934 / 175 KB)、visual parity test 9 件、20 OQ の wave gating checklist。本書 §5.1 の coarse な 6 wave 一覧は PR-β4 が supersede(本書は historical reference として残置)。**PR-β4 着地で Phase β 設計 wave 完了** |
| TBD | PR-β4 着地 → 20 OQ 合意 → Phase γ-C1 着手判断 |

---

## §8 関連 doc

- [`v3-architecture-proposals-2026-05-18.md`](./v3-architecture-proposals-2026-05-18.md):
  8 案受領 doc、本 Phase β は §4 Phase β に対応
- [`feature-requests-2026-04-28-roadmap.md`](./feature-requests-2026-04-28-roadmap.md):
  既存 roadmap、領域 1-10 と本 Phase β の cross-reference
- [`markdown-render-scope.md`](./markdown-render-scope.md):**PKC MD =
  Rendered HTML 不変式** doctrine、Group C 書式機能の上限規約
- [`css-architecture-audit-2026-05.md`](./css-architecture-audit-2026-05.md):
  CSS dedup 規約、Group A/B/C 実装時に value boundary anchoring 規約遵守
- [`pkc2-vision-modern-emacs-2026-05.md`](./pkc2-vision-modern-emacs-2026-05.md):
  vision、Group C 書式機能の上限規約(theme 統一設定 vs inline 上書き)
- [`completed/bug-section-blockquote-lazy-continuation-2026-05-18.md`](./completed/bug-section-blockquote-lazy-continuation-2026-05-18.md):
  Phase α #A5 で着地済み bug fix doc、3 surface 整合の参考
- [`dependency-supply-chain-baseline-2026-05-17.md`](./dependency-supply-chain-baseline-2026-05-17.md):
  Phase 1 supply chain baseline、Phase γ 中の dep bump は本書 § Phase 2/3
  経路を経由
