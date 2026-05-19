# PKC2 v3.x architecture proposals(2026-05-18 user 提案)

**Status**:議論段階(docs-only、実装 wave 未着手)
**Trigger**:user 提案(2026-05-18、棚卸し回答後)
**Wave 想定**:v2.x release-締め後の v2.4 / v3.0 計画

---

## §0 背景

Wave Z final(v2.3.0、2026-05-16 着地)で 5 archetype + Filer 5 subset +
markdown 方言拡張 + AST commutative IR + 文書出力(docx/pptx)を確定させた。
ここから先の進化方向について user が **8 案** を提示(2026-05-18)。

本書はそれら 8 案を:
- 自然な依存関係でグループ化(A/B/C/D)
- 各案の scope / risk / 価値を表で整理
- 推奨着手順序を提示

設計議論用 doc、user 合意後に各 group の **詳細 spec doc** を別途起こす想定。

「あとで対応する時の陳腐化を避けるために」(user 指示)各案の **背景事情**
(なぜこの提案が出たか、現状の何が不満か)を明記し、時間が経っても判断材料が
残るようにする。

---

## §1 8 提案の全文(user 原文、2026-05-18)

> - 編集モードを 3 つに分ける。透過レイヤー編集、Split View 編集、編集専用別窓
>   とレンダリング専用別窓(あるいは、メインウィンドウにレンダリング)。
> - 編集の canvas 化(場合によっては、エディタとパーサのコアを wasm 化)
> - PiP 別窓の廃止。思ったよりも使いにくいので、Window.open() に片寄せしよう
> - メインウィンドウの遷移抑制と並行したマルチウィンドウ路線への変更
> - vscode, emacs ライクなファイラへの移行と左ペインの並行廃止
> - 右ペイン機能の専門化。リレーションワイヤリングの専用画面や yaml frontmatter
>   のグラフィカル編集画面
> - 編集機能の強化。既存の書式設定機能が弱過ぎる。最低でも初期のワードプロセッサ
>   相当まで引き上げたい
> - 編集画面の canvas 化と並行して、カーソル位置明示機能の原理的なズレをなくす
>   判定とカーソル位置オーバーレイ機能、および、レンダリングしたブロックごとの
>   対応を 1:1 検出し、レンダリングにもオーバーレイする。そして、レンダリング
>   側も canvas に閉じ込めることで、オーバーレイ描画時の要素ズレを原理的に
>   発生しないようにする

---

## §2 グループ分け + 相互依存

```
┌─────────────────────────────────────────────────┐
│ Group A: ウィンドウ / pane 再構成(UI shell)    │
│  ├─ 1 編集モード 3 分割                          │
│  ├─ 3 PiP 廃止 → window.open() 統一              │
│  ├─ 4 メイン遷移抑制 + マルチウィンドウ          │
│  └─ 5 ファイラ統合 + 左ペイン廃止                │
│  ↓                                              │
│ Group B: pane 特化(右ペイン専門化)              │
│  └─ 6 relation wire / YAML graphical editor      │
│  ↓                                              │
│ Group C: 編集機能強化(書式 / 操作性)            │
│  └─ 7 ワープロ相当の書式パレット                 │
│  ↓                                              │
│ Group D: 編集 / レンダリング基盤 canvas + wasm 化│
│  ├─ 2 editor + parser core wasm                  │
│  └─ 8 cursor 1:1 overlay + canvas render         │
└─────────────────────────────────────────────────┘
```

依存関係:
- A の前提無しに B/C は中途半端になる(配置が決まらない)
- D は A/B/C の **既存実装を上書き** するため、**最後に来るべき** か
  **完全並走 spinoff** のどちらか
- C は A 完了後 or 並走、独立性高い

---

## §3 案件別 評価表

### §3.1 Group A:ウィンドウ / pane 再構成

#### #1 編集モード 3 分割

**背景**:現状の編集モードは 2 種類(detail-edit と Split View)で、用途に
よって使い分けが不明瞭。「読みながら少し直したい」(透過レイヤー)/「書きながら
プレビュー見たい」(Split View)/「集中して書きたい」(専用窓)が混在。

**提案**:
- (a) 透過レイヤー編集:render 済 content の上に半透明 textarea overlay
- (b) Split View 編集:現状の Split View(editor + preview 並列)
- (c) 専用別窓:編集専用 window + render 専用 window(or main = render)

| 軸 | 値 |
|----|---|
| scope | 中-大(spec 必須、6-10 PR)|
| risk | 中(現 phase machine への影響)|
| 価値 | 大、edit UX 根本改善 |
| 前提 | **設計 doc 先行**、3 mode の選択 UI / persist / toggle 規約 |

#### #3 PiP 廃止 → window.open() 統一

**背景**:Document Picture-in-Picture API は Chrome 116+ で対応、Safari /
Firefox は新規 window で fallback。実機 user 利用で「思ったより使いにくい」
判定。PiP 仕様(常時最前面)が user の期待と乖離(モバイル window だけ
最前面で固定するのが煩わしい)。

**提案**:PiP 廃止、`window.open()` での新規 window 一本化。fallback 不要、
コードパス簡素化。

| 軸 | 値 |
|----|---|
| scope | **小**(1 PR、既存 viewer / textlog PiP の `window.open()` 化)|
| risk | 低、既存 fallback あり |
| 価値 | 中(PiP は使いにくい認定済)|
| 前提 | なし、すぐ着手可 |

#### #4 メイン遷移抑制 + マルチウィンドウ

**背景**:現 PKC2 はメイン window 内で view-mode 切替(detail / filer /
graph / kanban / calendar / launcher)している。「複数 entry を並べて見たい」
「メインを動かさず別 entry を別 window で開きたい」要求が user 体感で発生。

**提案**:
- メイン window は固定 view(filer / launcher)を保持、遷移抑制
- 個別 entry の detail / 編集は **別 window** で開く
- 複数 window 間の state 同期は postMessage bridge 経由(既存実装あり、要拡張)

| 軸 | 値 |
|----|---|
| scope | **大**(子 window 間 state sync、postMessage 拡張、container live update)|
| risk | **高**、子 window が main の dispatch / IDB を奪い合う |
| 価値 | 大、user 操作の自由度 |
| 前提 | **設計 doc 必須**、子 window の data flow / 競合解決 |

#### #5 ファイラ統合 + 左ペイン廃止

**背景**:現 PKC2 の左ペイン(sidebar tree)は entry 一覧の navigation 主体、
Filer view と機能重複が多い。vscode / emacs のように「ファイラを左ペインに
配置せず、center pane の主役にする」アプローチが UX として優れる(編集中の
context を左ペインに奪われない)。`folder.detail_as_filer = true` flag で
opt-in 機能としては既存。

**提案**:
- 左ペイン(sidebar tree)廃止 → Filer view を navigation の単一窓口
- vscode / emacs explorer 風 UI(階層 + 検索 + tag filter 統合)
- `folder.detail_as_filer` flag を default ON 経由で正式廃止

| 軸 | 値 |
|----|---|
| scope | **大**(現 left sidebar 関連 30+ 件の renderer / action / spec を消去)|
| risk | **高**、互換性破壊 |
| 価値 | 中-大(integration UX 向上)|
| 前提 | **設計 doc + migration plan**、`folder.detail_as_filer` flag の正式昇格経路 |

### §3.2 Group B:pane 特化

#### #6 右ペイン専門化

**背景**:現 meta pane は frontmatter / tags / relations / display_profile 等の
編集 UI が混在、power user(AI authoring / metadata 整備)には機能不足。
「relation を線で繋ぐ」「frontmatter を YAML 直書きせずグラフィカルに編集」の
要求あり。

**提案**:
- (a) **Relation wire editor**:entry を node、relation を edge として描画、
  GUI で接続 / 切断 / kind 切替(graph view と統合可)
- (b) **YAML frontmatter graphical editor**:key/value 表形式、kind / writing /
  align / vars 等を input UI で編集、生成された YAML を body 先頭に書き戻す

| 軸 | 値 |
|----|---|
| scope | **中**(relation editor / YAML editor の専用 UI、各 ~2 PR)|
| risk | 中、現 meta pane の resize 影響 |
| 価値 | 大、power user 用 |
| 前提 | meta pane の region 規約を再設計、A 完了後が望ましい |

### §3.3 Group C:編集機能強化

#### #7 書式設定機能の強化(ワープロ相当)

**背景**:現 format panel(PR-2JJ v2、2026-05-13)は 14 button(B / I / S /
` / == / .. / sup / sub / link / H1-3 / > / · / ・)で最小限。user 評価
「**既存の書式設定機能が弱過ぎる。最低でも初期のワードプロセッサ相当まで
引き上げたい**」。

**提案**:
- 初期ワープロ(Word 95 相当)が持っていた機能を 1:1 で:
  - font 系(family / size 直指定、selection で色変更)
  - 段落 系(align / indent / line-height / spacing 指定)
  - 表 系(insert / cell merge / column resize)
  - 番号 / 箇条書き(level 増減、ordered / bullet 切替)
  - 検索置換(現存だが UI 弱い)
- すべて **PKC MD canonical 形に逆変換** できる形で実装(supreme invariant 維持)

| 軸 | 値 |
|----|---|
| scope | **中-大**(format panel 2JJ v2 を本格化、richer inline ops、style/span/class)|
| risk | 中、PKC MD 不変式維持の制約 |
| 価値 | 大、edit 体感 |
| 前提 | PKC MD canonical 形を崩さない operation 設計 |

### §3.4 Group D:canvas + wasm 化(v3.0 spinoff 想定)

#### #2 editor + parser core wasm 化

**背景**:現 PKC2 は markdown-it(JavaScript)依存。大規模 doc(数万行)で
re-parse がボトルネック、cursor 位置の正確な計算が DOM-based のため精度 / 性能
両面で限界。Rust / C++ で書かれた IR を wasm 化すれば:
- parse 性能 ~10x 改善見込み
- cursor 位置算出が AST-based で原理的に正確
- ブラウザ性能依存の差を吸収

**提案**:
- 現 features/ast の TypeScript 実装を Rust(or Zig)で書き換え
- markdown → AST → HTML の core path を wasm に
- TS 側は wasm wrapper + UI 制御のみ

| 軸 | 値 |
|----|---|
| scope | **超大**(現 markdown-it 依存排除、AST IR を Rust/C++ で書き直し)|
| risk | **極高**、4-6 ヶ月 wave、test 全書換 |
| 価値 | 大、性能 + cursor 精度 |
| 前提 | **完全別 spinoff branch、v3.0 計画**|

#### #8 canvas overlay 1:1 + render canvas 化

**背景**:現 DOM-based render は要素位置を正確に取れない(font subpixel /
line-break / measure 問題)。Source ↔ Preview sync で誤差が生じ、user 体感の
「cursor がずれる」原因。canvas に render を閉じ込めれば:
- cursor 位置 vs render 位置が原理的に一致
- block 1:1 対応がデータ構造で保証(DOM 経由しない)
- overlay 描画が pixel 単位で正確

**提案**:
- editor side:textarea を捨て、canvas + text rendering library に
- preview side:DOM render を捨て、canvas に文字描画
- cursor / selection / scroll は AST-based で計算、canvas に overlay 描画

| 軸 | 値 |
|----|---|
| scope | **超大**(現 DOM render を捨て canvas で再描画、accessibility / selection / copy 全書直)|
| risk | **極高**、accessibility regression |
| 価値 | 大、cursor / overlay 完全一致 |
| 前提 | **完全別 spinoff branch、v3.0 計画**|

---

## §4 推奨着手順序

### Phase α(immediate、Wave Z 直後):
- ✅ **#3 PiP 廃止**(PR #475 + 後続 #477 regression hotfix):Document
  Picture-in-Picture API を破棄、`window.open('', '_blank')` の同期実行
  へ統一(user activation chain を保つため `async` 廃止 + iOS Safari
  popup blocker を避けるため features arg 廃止)
- ✅ **bug fix:`>` + `:::section` lazy continuation**(PR #474、別 doc:
  `completed/bug-section-blockquote-lazy-continuation-2026-05-18.md`):
  共有 utility `colon-block-normalize.ts` を起こし AST 経路 +
  markdown-render.ts 経路の preprocessor chain 両方から呼び出し
- ✅ 周辺 cleanup:scrollIntoView ancestor scroll bug 3 popover
  (slash-menu / asset-picker / asset-autocomplete)を `scrollTop` 直接
  操作に置換(PR #476)、CI smoke 並列度 reduction で flake 緩和(PR
  #470/#471)、boot ready canonical helper(PR #467)、roadmap 完了
  項目反映(PR #478)

### Phase β(設計 wave、~2 週):
**全体計画 doc** = [`phase-beta-plan-2026-05-19.md`](./phase-beta-plan-2026-05-19.md)
で起こした(2026-05-19、user direction「Phase β 全体計画 doc で合意」)。
PR-β0 = 本計画書、PR-β1〜β4 = 各 group の canonical spec doc + Phase γ
wave map。docs-only で全体図を固める:
- **PR-β1 Group A 統合 spec**(#1 + #4 + #5 一括)
  - 3 mode 定義、子 window の data flow、左ペイン廃止後の navigation
  - migration plan(現 sidebar / detail / filer の互換性破壊範囲)
  - Tier 0 flag `shell.multi_window` 等で段階導入経路
- **PR-β2 Group B 右ペイン spec**(#6)
  - relation editor / YAML editor の UI design
- **PR-β3 Group C 書式機能 spec**(#7)
  - ワープロ相当の operation 一覧、PKC MD canonical 形との対応表
- **PR-β4 Phase γ 実装 wave map**(optional、spec 全件着地後)
  - 実装 PR stack 順序 + budget 試算 + visual parity test 計画

### Phase γ(実装 wave、~2-3 ヶ月、6-15 PR):
- 設計合意後に Group A(window shell)→ B(右ペイン特化)→ C(書式強化)を順次着地
- 各 PR 50-100 PR の large wave、CHANGELOG_v2.4.0 で締め

### Phase δ(v3.0 design、別 spinoff):
- **#2 + #8 = PKC2 canvas + wasm rewrite**
- 完全に別 repo branch で R&D wave 開始
- 既存 v2.x は保守モード、v3.0 が安定したら switchover
- 設計理由:現 DOM-based architecture の根本書き換え。並走で実装すると両方の
  test / spec を二重保守になり crippling overhead

---

## §5 議論待ち / open question

各 group ごと:

### §5.1 Group A:UI shell

- **Q1**:#1 の 3 mode 定義は user の用途で決める? それとも実装可能性で決める?
- **Q2**:#4 のマルチウィンドウで、子 window が編集中に main がリロードされたら
  どうする?子 window の編集を失う or 子 window が独立保存する?
- **Q3**:#5 の左ペイン廃止は backward compat(`folder.detail_as_filer = true`
  default ON)で段階的に進める? それとも一括破壊変更?

### §5.2 Group B:右ペイン特化

- **Q4**:#6 relation editor は graph view と統合するか別 UI で?
- **Q5**:YAML graphical editor は YAML 構文を画面に出すか、完全に隠すか?

### §5.3 Group C:書式機能

- **Q6**:#7「初期ワープロ相当」の最低 line は何?(font / 段落 / 表 / 番号
  の 4 つで足りる? 検索置換は除外?)
- **Q7**:format operation で PKC MD canonical 形に逆変換できないもの
  (e.g. font 色 inline style 直書き)は仕様外として禁止する?

### §5.4 Group D:canvas + wasm

- **Q8**:v3.0 spinoff の branch は本 repo 内 / 別 repo どちらにする?
- **Q9**:wasm 候補は Rust か Zig か AssemblyScript か?

---

## §6 history

| date | event |
|---|---|
| 2026-05-18 | **user 提案**:Wave Z 直後の棚卸し回答に対して 8 案を提示(編集 mode 分割 / canvas 化 / wasm 化 / PiP 廃止 / マルチウィンドウ / ファイラ統合 / 右ペイン特化 / 書式機能強化)|
| 2026-05-18 | 私(Claude)が group 分け + 評価表 + 着手順序を整理 |
| 2026-05-18 | **docs-only 着地**:本書で背景 + 提案 + 評価 + 議論を明文化、後の wave 着手時に陳腐化させない |
| 2026-05-19 | ✅ Phase α 完了:#3 PiP 廃止(PR #475 + 後続 #477 hotfix)+ bug fix(PR #474)+ 周辺 cleanup(scrollIntoView 3 popover #476 / CI smoke 並列度 #470-#471 / boot ready helper #467 / roadmap 反映 #478)|
| TBD | Phase β 設計 wave(#1 + #4 + #5 + #6 + #7 の spec 化)|
| TBD | Phase γ 実装 wave(Group A → B → C 順次)|
| TBD | Phase δ v3.0 spinoff(#2 + #8 = canvas + wasm)|

---

## §7 関連 doc

- `completed/bug-section-blockquote-lazy-continuation-2026-05-18.md`:同時報告 bug(2026-05-19 PR #474 で resolved → archive 済)
- `feature-requests-2026-04-28-roadmap.md`:領域 1〜10 既存 roadmap
- `pkc2-vision-modern-emacs-2026-05.md`:「モダン emacs / org-mode + 非
  プログラマ + AI 一級市民」vision、本 8 案と整合
- `markdown-dialect-extensions-spec-2026-05.md`:markdown 方言拡張 spec
- `dependency-supply-chain-baseline-2026-05-17.md`:主権モード Renovate
  setup(v3.0 spinoff 着手前に Phase 2/3 major bump を整理する候補)
- `notation-redesign-2026-05/`:Phase 1+2 完了の notation 再設計 doc 群
