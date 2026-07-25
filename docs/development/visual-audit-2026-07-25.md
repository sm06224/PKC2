# 全画面 視覚監査 2026-07-25 — トリアージと修正計画

> user 指示(2026-07-25):「作ったスキルを最大活用しましょう。ここで flags のオンオフと
> テストデータを大量に使って、全画面の分岐やレンダリング結果を視覚テストしてください。
> **明らかな質の悪い部分と私の判断が必要な部分を切り分け、修正計画を立てていきましょう**」
>
> 本 doc は **監査の記録 + トリアージ + 修正計画** であり、実装は含まない(doc-first)。
> A 群(明らかな不具合)は裁定不要で着手可、B 群(user 判断)は裁定待ち。

commit `192f748c` 時点 / 監査環境 = Playwright(`playwright-visual` skill)、
Full HD(1920×1080)、Chromium(`resolve-pw-chromium.cjs` 解決)。

---

## 1. 監査の方法

### 1.1 意地悪データ(adversarial fixture)

新規 `build/scripts/generate-audit-container.ts` → `bench-fixtures/c-audit.json`
(222 entries / 170 relations / 3 assets)。**通常のベンチ fixture が撮らない
「壊れ方」を意図的に仕込む**:

| 仕込み | 内容 |
|---|---|
| 深い階層 | folder 10 段の直列チェーン(tree の depth cap を踏み抜く) |
| 大量の子 | 1 folder 配下に 120 entry |
| 長大タイトル | 200 文字超 / 空白なし 120 文字(`あ` 連打)/ 長大 URL |
| 文字クラス | 絵文字 + RTL(アラビア文字)混在 / **空タイトル** |
| ハブ | relation 40 本 + tag 24 個を持つ 1 entry |
| markdown | 全方言入り kitchen sink(callout / ruby / em-dot / footnote / table / mermaid / csv / html) |
| todo | open / done / 期限切れ / archived / 一括 24 件 / 長文 description |
| textlog | 15 エントリ / **空 textlog** |
| attachment | json / svg / png / **asset 欠落(壊れた添付)** / 長大ファイル名 |
| その他 archetype | form / generic / opaque / spreadsheet |

### 1.2 撮影 spec

新規 `tests/smoke/_demo/full-visual-audit.spec.ts`(7 sweep)。
`test-results/audit/` に 30 枚。IndexedDB へ直接 seed → `bootReady` → 実操作 → 撮影。

### 1.3 flag 分岐の棚卸し

並行して flag × 画面のマトリクスを洗い出し済(§5 参照)。**今回の 30 枚では
まだ大半の flag 分岐を撮れていない** — これ自体が課題(C 群)。

---

## 2. A 群 — 明らかに質が悪い(裁定不要、Claude が直す)

### A1 🔴 About ページの `:::details` が **記法ミスで literal 表示**

- 場所: `src/adapter/ui/about-showcase.ts:66`
- 現状: `:::details summary="折りたたみ block も使えます"`(**brace なし**)
- `parseBlockDirectiveOpen`(`src/features/markdown/block-directive-attrs.ts:177`)の
  正規表現は `^:::name(\{...\})?\s*$` — **空白区切りの attr 形は非対応**。
  結果、方言が発火せず `:::details summary=…` と `:::` が**そのまま本文として表示**される
  (typographer が `"` を `“”` に変換までしている)
- 実測(`renderMarkdown` 直呼び):

  ```
  BAD :  <p>:::details summary=“折りたたみ block も使えます”<br>本文です。</p><p>:::</p>
  GOOD:  <details class="pkc-details"><summary class="pkc-details-summary">…</summary>…
  ```

- **深刻度が高い理由**: About は **空コンテナ初回起動時の中央ペイン**
  = 全 user の第一印象。しかもこのページは「PKC-Markdown を dogfooding して
  アピールする」ためのショーケースで、そこで方言が壊れて見えている
- 修正: `:::details{summary="…"}` に直す + About showcase の各方言が
  **render 後の DOM に出ている**ことを assert する回帰 test(現状の test は
  markdown 文字列の存在チェック止まりで、この壊れを素通りした)

### A2 🔴 右クリック「📊 グラフビュー」/ `Alt+5` が **dead command**

- `src/adapter/ui/context-menu-region.ts:60` — center pane 右クリックメニューに
  `{ label: '📊 グラフビュー', commandId: 'view.graph' }`
- `src/adapter/ui/keymap-binder.ts:133` — `registerKeyBinding('Alt+5', 'view.graph')`
- ところが command 側は `command-palette-builtins.ts:115` で
  `id: \`view.${v.mode}\`` を **viewMode 5 値ぶんだけ** 生成。`viewMode` 型
  (`app-state.ts:375`)は `detail | calendar | kanban | filer | launcher` で
  **graph は存在しない**。`view.graph` を register する箇所は grep で 0 件
- つまり **メニューに見えているのに押しても何も起きない / Alt+5 が無反応**
- graph view は既に廃止済(`renderer.ts:9159` 付近「PR-HHH で廃止済」、
  filer profile の選択肢からも除外)。**残骸の掃除** = プライム・ディレクティブ
  「削る」に合致
- 修正: context menu item と keybinding を削除。ついでに
  `action-binder.ts:1697` のコメント(6 種と書いてある)を実装に合わせる

### A3 🔴 filer の「名前」列が空タイトルで **内部 lid を露出**

- `src/adapter/ui/renderer.ts:7568` — `if (key === '__name') return row.entry.title || row.entry.lid;`
- 他の表示経路は全て `(untitled)`(`renderer.ts:1785` / `1793` / `4030` / `5703`)
- 監査 fixture の空タイトル entry が filer で `x-empty` と表示される。
  **内部 ID がユーザー向け画面に漏れている**うえ、他画面と表記が食い違う
- 修正: `(untitled)` に統一

### A4 🟠 asset 欠落の添付が「⏳ ファイル読み込み中…」で **永久停止**

- `src/adapter/ui/attachment-presenter.ts:586-596` — `pendingHydration && !registryUrl`
  のとき loading バッジを出すが、**タイムアウトも失敗表示もない**
- asset_key が assets store に無い(export 事故 / 手編集 / 移行失敗)場合、
  hydration は永遠に成功しないので **ずっと「読み込み中」**。
  ユーザーには「重いのか壊れたのか」が区別できない
- リポジトリの「silent fail 禁止」ドクトリンに反する
- 修正: hydration 試行が **キーの不在で確定的に失敗した場合**は
  「⚠ ファイルデータが見つかりません(asset_key: …)」に切り替える。
  一定時間で諦めるのではなく、**store 照会で不在が確定した時点**で表示を変える

### A5 🟠 不正な spreadsheet body が **無言で空グリッド**(上書き事故の危険)

- `src/features/spreadsheet/spreadsheet-body.ts:135-151` — JSON parse 失敗、
  object でない、`rows` が配列でない、のいずれも **`{ rows: [] }` を返して終わり**
- 画面上は「空のシート」と完全に同一に見える
- **本当の危険はここから**: ユーザーがそのまま 1 セル編集して保存すると、
  壊れていた(が復旧可能だったかもしれない)元 body が **空シートで上書き**される
- 修正: parse 失敗を `SpreadsheetBody` に載せて presenter が
  「⚠ このシートのデータを解釈できませんでした(元データは保持しています)」を表示し、
  **編集を保存する前に確認を挟む**(= 破壊的上書きの手前で止める)

### A6 🟡 breadcrumb / header path に省略表現がない

- `src/styles/base.css:682-699` — `.pkc-header-path` は `overflow-x: auto`、
  子は `white-space: nowrap`。**`max-width` も `text-overflow: ellipsis` もない**
- Full HD では 200 文字タイトルがぎりぎり 1 行に収まるが、幅の狭い環境では
  横スクロール(スクロールバー非表示)頼みになり、**省略されていることが視覚的に分からない**
- 修正: `.pkc-header-path-current` / `-segment` に `max-width` + `ellipsis` +
  `title` 属性(既に segment には title あり、current には無い)

---

## 3. B 群 — user の判断が要る

### B1 🔴判断 sidebar tree の `maxDepth = 4` で **5 階層目以降がツリーから消える**

- `src/features/relation/tree.ts:41-104` — `buildTree(entries, relations, maxDepth = 4)`。
  depth 4 に達すると子を **`markReachableBelowCap` で「配置済み」とマークするだけ**で
  `TreeNode` を作らない(:95-100)
- この「配置済みマーク」は、後段の孤立エントリ救済 sweep が深い子を
  第 2 の root に昇格させてしまうのを防ぐための処置。結果として深い entry は
  **root にも出ず、親の下にも出ない = サイドバーから完全に消える**
- さらに depth 4 の folder は `children: []` になるため、子件数を読む表示は
  **「(0)」= 子なし** と嘘をつく(10 段チェーンの 5 段目以降が実在するのに)
- データは失われていない(filer / 検索 / relation からは辿れる)が、
  **主要な導線から見えない**
- **判断が要る点**: 深い階層を許すかどうかは perf と UI 方針の両方に関わる
  - (a) 上限を引き上げる(8 / 16)— 大量 entry での再帰コストが増える
  - (b) 上限は据え置き、**打ち切りを可視化**する(「… 以下 N 件」を出して
    filer に誘導)— 追加 UI = 「足さない」方針との兼ね合い
  - (c) 現状維持(深い階層は非推奨と割り切る)
  - 推奨は **(b) の最小版** — 新 UI ではなく既存 tree 行に「…」を出すだけなら
    「削る/選る」の範囲に収まり、かつ嘘の「(0)」も消せる

### B2 🟡判断 UI 文言の日本語 / 英語 混在

- 実例(1 画面に同居):`Rename` / `✎ 編集` / `Download` / `Copy link` / `TEXT に変換`、
  `Recent (10)` / `Search entries…` / `Drop file to attach` / `No entries yet.` /
  `Preview is not available for this file type — use Download to save the file.` /
  `Outgoing relations (0) — relation` ↔ `新規 TEXT エントリ` / `期限切れタスク`
- **これは事故ではなく既知の設計状態**: `docs/development/i18n-requirements.md` に
  「UI string translation: **Not Implemented** — all UI labels remain hardcoded in
  English (with some Japanese in Quick Help)」と明記済み。後から日本語が
  ad-hoc に混ざってきた結果が現状
- `src/adapter/ui/*.ts` の英語 UI 文字列はざっと 200 箇所超
- **判断が要る点**:
  - (a) 現状維持(混在を許容)
  - (b) **目立つ画面だけ**日本語に寄せる(添付カード / meta pane / 空状態)
    — 小さく着地、全体の一貫性は残らない
  - (c) string table(`features/i18n/strings.ts` + `t()`)を作る
    — i18n doc の Priority 1 そのものだが、**機能追加**なので凍結方針に抵触。
      user 裁定が要る
  - 推奨は **(b)** を A 群と同じ波で。(c) は Issue 化して優先度判断へ

### B3 ✅裁定済 spreadsheet の長文セルで行高が爆発

- 長い文字列のセルが 1 文字ずつ縦積みになり、行高が数十倍になる
- 列幅の既定方針(`max-width` + ellipsis / 折り返し / 横スクロール)は
  **表計算としての体験設計**の判断だった
- **user 裁定(2026-07-25)**:**列幅に上限を付けて溢れは `…` で省略。
  セルをクリックすれば全文が見える**。行高が数十倍に爆発するほうが害が大きい
  - 明示的に `colWidths` が指定されている列は user の意図なので上限を適用しない

### B4 ✅裁定済 attachment: `text/plain` は「✎ 編集」できるのに「プレビュー不可」

- `attachment-presenter.ts` — `previewType === 'none'` で
  「このファイル形式はプレビューできません」を表示
- しかし #1005 で **text 添付のその場編集**を入れたので、同じカードに
  「✎ 編集」ボタンが並ぶ。**編集はできるが閲覧はできない**というちぐはぐな状態
- **user 裁定(2026-07-25)**:**プレビュー対応 mime を text 系に広げる**。
  編集機能を入れた時点で整合が崩れているので、機能追加というより
  **整合性の回復**と読む
  - 「編集できる = プレビューできる」を **同じ述語**で担保し、構造的に
    再発しないようにする

### B5 ✅裁定済(見送り)Kanban カードの todo description を markdown render するか

- 現状 plain text。長文 description が生の記法のまま並ぶ
- **user 裁定(2026-07-25)**:**見送り**。カード高さが不揃いになり、
  カンバンの一覧性が落ちる副作用のほうが大きい
- 再検討するなら「カードは 2 行まで、続きは詳細で」のような**高さを固定した
  形**が前提になる ── その設計が固まるまでは触らない

---

## 4. C 群 — 監査基盤そのものの穴(Claude が直す)

**この監査で最も重要な発見のひとつ**は、監査 spec 自身が「撮れたつもり」に
なっていたこと。30 枚の md5 を突き合わせたところ **4 枚が boot 直後と同一画像**:

| ファイル | 実態 |
|---|---|
| `30-tree-expanded.png` / `31-deep-leaf-breadcrumb.png` / `63-command-palette.png` | いずれも `01-boot-tree.png` と **完全一致** = 操作が効いていない |
| `20-sidebar-filer.png` / `21-filer-tabs-minimap-detail.png` / `22-filer-tabs-second-tab.png` | 3 枚が相互に **完全一致** = tab 切替が効いていない |

さらに modal sweep は Viewer popup の click タイムアウトで **fail**(7 件中 1 件失敗)。

- **C1**: 操作が効いたことを **画面の観測点で assert してから撮る**
  (`visual-state-parity-testing.md` の規律を demo spec 側にも適用)。
  「前ショットと同一なら fail」の md5 ガードを spec に入れる
- **C2**: Viewer popup(S2)は独立 document なので `page` 直の click が届かない。
  `context.waitForEvent('page')` で popup を掴んでから撮る
- **C3**: flag 分岐の網羅が薄い。§5 のマトリクスに沿って sweep を増やす

**教訓(skill に反映する)**: demo モードは pass/fail を持たないので、
**「撮れた枚数」を成果と誤認しやすい**。撮影前の状態 assert と
撮影後の重複検出をセットにしないと、監査が空振りしていても気づけない。

---

## 5. 未撮影の flag 分岐(次の sweep 対象)

| 領域 | flag / 手段 | 既定 |
|---|---|---|
| サイドバー | `sidebar.mode` = `tree` / `filer` | tree |
| Activity Bar | `shell.activity_bar_enabled`(6 タブ + 左右反転 + badge) | OFF |
| タブ | `shell.tabs_enabled`(pin / close / 右クリック) | OFF |
| Split View | `shell.split_view_enabled` | OFF |
| meta pane | `meta_pane.mode_tabs_enabled`(all / properties / references) | OFF |
| meta pane | `meta_pane.yaml_graphical_enabled`(graphical ↔ read-only `<dl>`) | ON |
| folder | `folder.detail_as_filer` | OFF |
| filer profile | 8 種(auto / explorer / contact-sheet / book / video / novel / audio / inventory) | auto |
| view mode | detail / calendar / kanban / filer / launcher(+ dead な Alt+5) | detail |
| テーマ | light / dark / scanline | — |

---

## 6. 修正計画(PR 分割)

| # | 内容 | 前提 | 規模 |
|---|---|---|---|
| **PR-A1** | A1 About `:::details` 記法 fix + 方言が **DOM に出る**ことの回帰 test | なし | S |
| **PR-A2** | A2 dead command(`view.graph` メニュー項目 / Alt+5 / 古いコメント)削除 | なし | S |
| **PR-A3** | A3 filer `__name` の lid 露出を `(untitled)` に統一 + 回帰 test | なし | S |
| **PR-A4** | A4 asset 欠落の確定失敗表示 + A5 spreadsheet parse 失敗の明示化(上書き前の確認) | なし | M |
| **PR-A5** | A6 breadcrumb 省略(max-width + ellipsis + title) | なし | S |
| **PR-C** | C1 監査 spec の状態 assert + 重複検出ガード、C2 popup 撮影、C3 flag sweep 拡張 | なし | M |
| **PR-B1** | B1 tree depth の扱い | **裁定待ち** | S〜M(選択肢による) |
| **PR-B2** | B2 文言方針 | **裁定待ち** | (b) なら M / (c) なら L |
| **PR-B3/B4** | spreadsheet 列幅の上限 + セルクリックで全文 / text 添付のプレビュー対応 | 裁定済(2026-07-25) | 各 S〜M |
| ~~PR-B5~~ | ~~Kanban の markdown render~~ | **見送り**(user 裁定 2026-07-25) | — |

推奨着手順: **PR-A1 → PR-A2 → PR-A3**(小さく確実、全部 user 可視の質改善)
→ **PR-C**(監査の空振りを潰してから)→ **PR-A4 → PR-A5** → 裁定後に B 群。

user-facing 変更を含む PR(A1 / A3 / A6)は
`src/adapter/ui/startup-notice.ts` の `STARTUP_NOTICES` へ 1 行追記する。

---

## 7. 参照

- `docs/development/visual-state-parity-testing.md` — parity test 方法論
- `.claude/skills/playwright-visual/SKILL.md` — demo / verify 2 モードと環境固め
- `docs/development/i18n-requirements.md` — B2 の背景(UI string 未 i18n)
- `docs/development/pr-review-checklist.md` — PR 自己監査
