# Todo / Editor-in / Continuous-Edit Wave — Design Contract

**Status**: design contract — 2026-04-22。docs-only。**No implementation in this PR**。
**Scope**: UI continuity wave（PR #99〜#107）の直後に来る次の UX wave。ユーザが以前から要望していた「Kanban / Calendar からの Todo 追加」「Kanban / Calendar 上の entry を Editor-in で編集」「TEXTLOG の dblclick-to-edit 見直し」「child window を continuous-edit 前提で再設計」の 4 本柱を、実装着手前に **design contract** として固定する。
**Baseline**: UI continuity wave closure（`HANDOVER_FINAL.md §23`）後の最新状態。child window shortcut first slice（`Ctrl+S` / `Escape` のみ、PR #105）は前提済。

> **このドキュメントは context のロック**です。§1〜§10 の条項を implementation PR 起票前に合意すること。条項を 1 つでも外す提案は差し戻す。

---

## 0. TL;DR

- Kanban / Calendar から Todo を **追加**できる（column の status / 日付の date を context として自動反映）
- TEXTLOG の **dblclick-to-edit は廃止候補**（単語選択との競合で v0 で再設計）。代替として **明示 Edit affordance + 修飾付き gesture** を採る
- **Editor-in** は「選択中 entry を、現 view を離れずに編集 → save → 現 view に戻る」の 1 語で統一した導線（Kanban card / Calendar cell / Sidebar に配置）
- child window は **continuous edit mode** を v0 で採用（save 後も window / caret / scroll を維持し、連続保存可能）
- Spreadsheet entry は **次段候補**として位置のみ確保、本 wave では仕様化しない
- すべて **v0 = 最小契約 / v1 = 予約 / out-of-scope = 明示**の 3 層で切る

---

## 1. Purpose / Status

### 1.1 何の wave か

UI continuity wave（PR #99〜#107）は「既存操作で引っかからない」ことを目的に、scroll / collapse / overlay / reveal / child window shortcut を修正した。次の wave は一段上がって、**作業の主役である Kanban / Calendar / TEXTLOG / child window で作業が閉じる** ようにする。

具体的には:

- Kanban / Calendar は「見る・動かす」はできるが、その view 上で **新規作成 / 編集を開始**できない
- TEXTLOG の dblclick-to-edit は、単語 / ブロック選択などの **テキスト操作と衝突**する
- child window は `Ctrl+S` / `Escape` は入ったが、save 後も **編集を続ける体験**にはなっていない

これら 4 箇所を個別実装で進めると、contract の粒度が PR ごとに揺れる。**先に contract を docs で固定**してから slice 実装に入ることで、レビュー粒度と UX 一貫性を両立する。

### 1.2 なぜ今か

- UI continuity wave は実装・planning・manual の 3 層で閉じ、次 wave の docs-first 着地点として最も整った状態
- ユーザの「Kanban / Calendar で作業したい」要望は複数回挙がっており、**先送りがこれ以上続くと UX 不満が累積**する
- TEXTLOG の dblclick 問題は user-visible な不具合として認知されているが、**機能を残すか消すか**を先に決めないと実装が迷う
- child window continuous edit は `Ctrl+S` first slice の自然な延長として、今 contract を書けば slice 2+ が軽く切れる

### 1.3 Status

- **design contract（本書）**: 本 PR で fix
- **implementation**: 本 PR に含まれない。slice PR 単位で別途起票（§8）
- **Spreadsheet entry**: 本 wave では spec 化せず、§10 で次段候補として位置づけのみ

---

## 2. Scope

### 2.1 In scope (v0)

- **Todo add from Kanban / Calendar**（§4）
  - Kanban column を context にした Todo 追加（status = その column）
  - Calendar day cell を context にした Todo 追加（date = その日）
- **Editor-in**（§5）
  - 全 archetype で「現 view に留まって編集する」導線を 1 つに統一
  - Kanban card / Calendar cell から invoke 可能
  - TEXTLOG は archetype 特有の body-pane 編集を維持（log 単位編集）
- **TEXTLOG dblclick-to-edit 廃止**（§6）
  - dblclick は **OS/ブラウザ標準の単語選択** に返す
  - Edit affordance は明示 button + modifier gesture（`Alt+Click` or `Ctrl+dblclick`）に置換
- **Child window continuous edit mode**（§7）
  - save 後に window / caret / selection / scroll を維持
  - edit → save → 即次の edit の連続フローをサポート

### 2.2 Likely follow-up (v1)

- Kanban / Calendar の **inline quick edit**（title 以外のフィールドも view 内で）
- Editor-in での **archetype 切替**（Kanban card から form → todo のような変更）
- child window の **preview toggle**（現状 v0 は edit-only、preview は main で見る）
- TEXTLOG `Enter` キーでのログ追加系 shortcut との統合
- conflict / save-failed 時の continuous edit 動線拡張（resolve 後に即 continue）

### 2.3 Out of scope

- Kanban / Calendar の **全面再設計**（列カスタム / フィルタ整理 / view 切替高速化など）
- main / child 編集系の **全面統一大改修**（共通 editor abstraction / state-sharing の一元化）
- child window で Ctrl+S / Escape 以外の **shortcut parity 拡張**（PR-ζ₂ 以降で別トラック）
- formula / grid / clipboard を含む本格的 spreadsheet
- 既存 TEXTLOG の log 単位 editor の再設計（v0 では既存維持）

### 2.4 Next foundation after this wave

- **Spreadsheet entry foundation**（§10）
  - body format / renderer / editor / import-export 境界を先に固めてから仕様化
  - 本 wave の continuous edit contract と editor-in contract は spreadsheet 側でも再利用する想定

---

## 3. User problems to solve

本 wave が解消する user problem を明示する。implementation PR はこのリストからの逆算で scope を守る。

### 3.1 Kanban で見ている最中に、その場で Todo を追加したい

- **現状**: Kanban view に居るとき、新規 Todo を作るには detail view に戻って `+ Todo` ボタンを押す必要がある。view 切替 + 戻りでコンテキストが 2 回切れる
- **期待**: Kanban column の末尾に「+ Add」相当の affordance があり、タップすると column の status を既定にした Todo が作成される
- **関連 pain**: 同じ status の Todo を連続で足したい時に、view 遷移が毎回入る

### 3.2 Calendar で見ている最中に、その場で Todo を追加したい

- **現状**: Calendar view でも同様。日付 cell をクリックしても新規 Todo を作る導線がない
- **期待**: cell 右下などに「+ Add」相当があり、その日を date として Todo が作成される
- **関連 pain**: 翌日の Todo / 来週の Todo を複数足す時に、detail view に戻って date を手動入力する作業が繰り返される

### 3.3 Kanban / Calendar で見えている entry を、そのまま編集したい

- **現状**: Kanban card / Calendar cell に表示されている Todo の **title や description を編集**したいが、現 view では読むだけで、編集は detail view に戻る必要がある
- **期待**: 「その場で編集して save → 元の view のまま次の card / cell に進める」導線
- **関連 pain**: 複数 Todo を確認しながら微調整する作業で、detail view 往復が増える

### 3.4 TEXTLOG 上で自然な dblclick / triple-click 選択をしたい

- **現状**: TEXTLOG のログ row をダブルクリックすると、既存の dblclick-to-edit が発火して **単語選択が取れない**
- **期待**: dblclick で単語選択、triple-click で行選択という **OS 標準のテキスト操作**が取れる
- **関連 pain**: ログ本文の一部をコピーしたいだけなのに、編集モードに入ってしまう。Escape で抜けると状態が変わっている不安も残る

### 3.5 child window で Ctrl+S しながら連続編集したい

- **現状**: PR #105 で `Ctrl+S` は入ったが、save 直後の挙動は「保存して view モードに戻る」（既存 save button と同じ）。次の編集を始めるには再度 Edit ボタンを押す必要がある
- **期待**: save 後もそのまま edit モードに留まり、caret / selection / scroll が保持されて連続で編集 → 保存 → 編集ができる
- **関連 pain**: TEXT / TEXTLOG の長文を複数回に分けて保存したい時（長大な draft を着実に進めたい時）に、save のたびにモードが切れる

### 3.6 save 後も caret / focus / editing flow が途切れない方がよい

- **現状**: main window / child window ともに save 後に caret 位置や scroll 位置が「安全寄り」（つまり先頭や既定位置）にリセットされる場面がある
- **期待**: save は **データの確定**であり、編集位置の再配置を伴うべきではない。特に連続編集中は caret を動かさない
- **関連 pain**: 長文を save した直後に caret が先頭に飛ぶと、続きを書くために毎回スクロール + クリック位置合わせが必要になる

---

## 4. Todo add contract（Kanban / Calendar）

### 4.1 Where to invoke

| view | 配置 | gesture |
|---|---|---|
| Kanban | 各 column の **末尾 card slot** に「+ Add」 affordance | click / Enter |
| Calendar | 各 day cell の **右下 / hover 時** に「+」affordance | click / Enter |

- Kanban / Calendar いずれも **既存 DnD / 選択 / keyboard navigation と衝突しない位置** に配置する（card / cell 本体に重ねず、末尾 slot or 端）
- マウス hover で可視化する方式は v0 採用（低密度化のため）。touch / keyboard では常時可視でよい
- 既存の detail view `+ Todo` ツールバーボタンは **残す**（他 view から使うユーザのため）

### 4.2 Created entry の初期値

| field | Kanban の場合 | Calendar の場合 |
|---|---|---|
| `archetype` | `'todo'` 固定 | `'todo'` 固定 |
| `title` | 空（編集開始時に caret が title にフォーカス） | 空 |
| `body` | `{ "status": <column-status>, "description": "", "date": null }` | `{ "status": "open", "description": "", "date": "<cell-date>" }` |
| `status` | column の status を継承（`open` / `done`） | 既定 `open`（date 起点の追加は status 非規定）|
| `date` | null（Calendar に出現しない）| cell の日付（`YYYY-MM-DD`）|

- status と date の両方が context から決まる view は **存在しない**（Kanban は date を持たない、Calendar は status 切替を持たない）。**片方は view 文脈、もう片方は既定** を採る
- archetype は **v0 では todo 固定**（`+ Note` / `+ Form` / `+ File` の view-scoped 版は v1 以降）

### 4.3 View context の引き継ぎ範囲

- **Kanban status**: add 位置の column の status を `body.status` に set。`done` column からの add は「既に完了済みの作業を後から記録する」用途で有効
- **Calendar date**: cell の日付を `body.date` に set。month をまたぐ navigation 後の add でも、現 cell の日付が採用される
- **Folder context**: 現行 auto-folder-placement（`docs/development/archived/singletons/auto-folder-placement-for-generated-entries.md`）の `TODOS` 自動配置を **そのまま踏襲**。context 引き継ぎで新しい判定ロジックは追加しない
- **Sort / filter context**: add された Todo は当然現 filter を満たす状態で作られる（filter は add 後も変更なし）。sort は既存の order に従う

### 4.4 Add 後の focus / selection / scroll / reveal

| 項目 | v0 契約 |
|---|---|
| selectedLid | add された entry に切替 |
| focus | title 入力欄に caret（即座にタイトル入力可能） |
| scroll | 現 view でその entry が可視になるようスクロール（Kanban: column 下端、Calendar: cell 内の追加位置）|
| reveal | sidebar の folder 自動展開は **発火しない**（PR-ε₁ 後の default = no reveal を継承）|
| modal | 非表示（inline / popover のいずれでも、modal window を新規に開かない）|

title 入力を終えたら **Enter で commit、Escape で discard** の 2 択で閉じる（UI continuity wave の Escape semantics と整合）。

### 4.5 Inline add vs popover vs full editor：v0 の採用

**v0: 軽量 popover を採用**（§4.6 構造）。

- inline 展開は既存 view の layout を大きく崩す懸念（card / cell size が動的に変わる）
- 既存 full editor に飛ばすと view を離れてしまい「その場で追加」の目的に反する
- **popover**: card slot / cell 右下の近傍に小さな入力用 DOM を mount、title + `Enter` commit / `Esc` discard の 2 action に閉じる

### 4.6 Popover の DOM 構造（v0）

```
<div class="pkc-todo-add-popover"
     data-pkc-region="todo-add-popover"
     data-pkc-context="kanban|calendar"
     data-pkc-context-value="<status-or-date>">
  <input class="pkc-todo-add-input"
         data-pkc-field="todo-add-title"
         placeholder="New todo…" />
  <span class="pkc-todo-add-hint">Enter to add · Esc to cancel</span>
</div>
```

- `data-pkc-context` は `"kanban"` / `"calendar"` のいずれか
- `data-pkc-context-value` は Kanban なら `"open" | "done"`、Calendar なら `YYYY-MM-DD`
- popover は **renderer-owned**（PR #101 で確立した state-driven overlay pattern を継承、ad-hoc append を避ける）

### 4.7 State / Action 契約

- **新 action**: `OPEN_TODO_ADD_POPOVER`（context + value を payload に含む）/ `CLOSE_TODO_ADD_POPOVER` / `COMMIT_TODO_ADD`
- **AppState additive field**: `todoAddPopover?: { context: 'kanban' | 'calendar'; value: string } | null`
- **reducer**: `COMMIT_TODO_ADD` は `CREATE_ENTRY` + `COMMIT_EDIT` の連鎖を **1 action で原子的に**（既存パターンを再利用）
- **既存 `CREATE_ENTRY` 挙動**: 変更なし（detail view の `+ Todo` ツールバーは従来通り）

### 4.8 やらないこと（v0）

- 複数エントリの一括追加（batch-add）
- popover 内での description / date / status の詳細編集（title のみ）
- 他 archetype の view-scoped add（`+ Note` from Kanban など）
- Kanban column の動的追加 / rename
- Calendar cell からの期間指定 Todo（`date_start` / `date_end`）

---

## 5. Editor-in contract

### 5.1 「Editor in」の定義

**選択中 entry を、現 view から離れずに編集状態にする導線**。save 後は **現 view のままその entry に戻る**（detail view へ強制遷移しない）。

目的:
- Kanban / Calendar で作業中の micro-edit を view 切替なしで行う
- TEXTLOG のログ row 編集を、Detail view 以外からも起動可能にする
- child window の continuous edit とも semantics を揃える（§7 と共通モデル）

### 5.2 どの view / archetype から使えるべきか

| view | archetype | v0 契約 |
|---|---|---|
| Detail | all | 既存 editor を **Editor-in** として位置づけ直す（新 affordance 不要、既存 Edit button が entry point） |
| Kanban | todo | card から invoke 可能（§5.4 gesture）|
| Calendar | todo | cell 内 todo tile から invoke 可能（§5.4 gesture）|
| Sidebar / Recent pane | all | **invoke しない**（sidebar は navigation 面、編集は detail / Kanban / Calendar で起動する）|

### 5.3 全 archetype 共通の invoke 導線（v0）

**候補 2 つ**:

| 候補 | Pros | Cons | v0 採用 |
|---|---|---|---|
| A. 明示 Edit ボタン（card / cell に hover 時に表示） | 直感的、初見で発見しやすい | 視覚ノイズ、hover 前提は touch で破綻 | v0 採用 |
| B. Modifier gesture（`Alt+Click` or `Ctrl+dblclick`）のみ | 視覚ノイズなし | discoverability が低い | v1 補助として追加 |

**v0 契約**: **A を主導線、B を隠し shortcut として併設**。

- card / cell に hover 時に小さな ✏︎ アイコンを表示、click で Editor-in 起動
- Modifier gesture は keyboard 併用派のための shortcut。manual には記載するが主導線にはしない
- touch 環境では hover が使えないため、**長押し（500ms+）で同じ Editor-in を起動**する fallback を v0 で採る

### 5.4 Kanban / Calendar 上の entry から Editor-in

- Kanban card: hover 時に card 右上の ✏︎、または `Alt+Click`
- Calendar day cell 内 todo tile: 同上
- 起動後は **その場で title / description の inline edit popover**（§4.6 と同型構造、fields だけ拡張）
- save 後は Kanban / Calendar view に留まる、caret は閉じる、card / cell の表示は即更新

### 5.5 Archetype 別差分

| archetype | 主 editor | Editor-in 経路 |
|---|---|---|
| `text` | Detail pane の split editor | Detail から。Kanban / Calendar に直接は出ない（text は todo 以外、非対象）|
| `textlog` | Detail pane の per-log editor（§6）| Detail から（log 単位）。Kanban / Calendar に直接は出ない |
| `todo` | inline popover（§5.4） | Kanban / Calendar / Detail すべてから invoke 可 |
| `form` | Detail pane の form editor | Detail から（form は Kanban / Calendar に出ない）|
| `attachment` | Detail pane の attachment properties editor | Detail から |
| `folder` | Detail pane の description editor | Detail から |

**v0 では「Editor-in が複数 view から invoke 可能」な archetype は todo のみ**。他は Detail pane 側に従来通り閉じる。v1 で text / form の view-scoped editor-in を追加する余地は残す。

### 5.6 Save 後の挙動

| 項目 | v0 契約 |
|---|---|
| view | 保持（Kanban → Kanban、Calendar → Calendar）|
| selectedLid | save した entry で維持 |
| reveal | 発火しない（PR-ε₁ 契約踏襲）|
| scroll | save 前の scroll 位置を維持 |
| focus | popover が閉じ、focus は card / cell に戻る |

### 5.7 Cancel（Escape）時の挙動

- popover の input 内容を discard
- reducer 側の変更は行わない（entry の body は save 直前と同じ）
- view / selection / scroll は変わらない
- focus は card / cell に戻る

### 5.8 既存導線との関係

- **既存の Detail view Edit button**: 引き続き使える。Detail での Editor-in の主入口
- **既存の sidebar dblclick → entry window**: v0 では残す（§7 で continuous edit を強化する側）
- **TEXTLOG dblclick-to-edit**: 廃止（§6 で詳述）
- **context menu "Edit"**: 既存 UI を Editor-in 統一名に rename するかは v1 に延期（behavior は現行維持）

### 5.9 やらないこと（v0）

- archetype 切替 UI（Kanban card から form → todo の変更）
- popover 内での relation / tag / archived など全 field の編集（v0 は title / description / date / status の 4 項目に絞る）
- multi-entry 同時編集
- Editor-in での preview toggle（preview は Detail pane の責務に閉じる）

---

## 6. TEXTLOG interaction revision

### 6.1 現行 dblclick-to-edit 契約の問題

**現行動作**（`action-binder.ts:4072-4100` 周辺）:
- `.pkc-textlog-log[data-pkc-lid]` の article を dblclick すると、そのログが **in-place edit モード**に遷移する
- selection モード中は発火しない（既存 exception）
- 除外: flag btn / anchor btn / asset anchor 上は無効

**問題**:
1. dblclick は **OS/ブラウザ標準で単語選択**の gesture。ログ本文の「この単語だけコピーしたい」操作が常に競合
2. triple-click（行選択）も発火する前に edit が起動する環境がある
3. 誤 dblclick で edit モードに入り、Escape で抜けると `status` や未保存 flag の状態に「何か変わった」という不安が残る
4. manual `05` でも「ダブルクリックで編集モードへ」と記載しており、変更時は manual 更新も必要

### 6.2 単語 / ブロック選択との競合

- ユーザが **本文中のテキストをコピー**する頻度は高い（URL / コード片 / 日付文字列など）
- dblclick で選択を取れないのは「読みながら作業する」pattern で致命的
- triple-click は log 全体を選択したい時に使いたいが、edit 起動が先に走ると selection が取れない

### 6.3 代替導線（v0 採用案）

**v0 では dblclick-to-edit を廃止**し、以下で置換する:

| 導線 | gesture | 視覚 | 既存操作との関係 |
|---|---|---|---|
| 明示 Edit button（ログ row hover 時に右上）| click | ✏︎ アイコン | 新規追加。既存 flag / anchor / asset chip と重ならない位置 |
| Modifier gesture | `Alt+Click` on log article | 視覚なし（shortcut help で説明）| 単語選択と衝突しない。ブラウザが Alt+Click を予約する環境はほぼ無し |
| Enter キー（Detail view で log を keyboard 選択中）| Enter | focus outline | 既存 sidebar Enter = BEGIN_EDIT と整合 |

**dblclick の本来の意味**（単語選択）は **ブラウザ標準に返す**。triple-click も同様。

### 6.4 v0 でどう変えるか

- `action-binder.ts` の `handleDblClick` から `.pkc-textlog-log[data-pkc-lid]` の article 分岐を **削除**
- 同時に log row の hover affordance（✏︎ button、`data-pkc-action="edit-log"`）を renderer に追加
- `Alt+Click` handler を log article 上の click delegation に追加
- 既存 `data-pkc-action="toggle-log-flag"` 等の既存 click 経路は不変
- append textarea（`pkc-textlog-log` の外）は scope 外のため影響なし

### 6.5 既存ユーザへの影響

- dblclick で「編集に入っていた」ユーザ: ✏︎ button または `Alt+Click` に慣れる必要あり
- 反対に **単語選択を奪われていた** ユーザ: 自然な selection が取れるようになる（net positive）
- 慣性対策として v0 では **transitional warning** を 1 回だけ出す選択肢もあるが、v0 では採らない（manual に記載で足りる、UI 上の一時告知は技術的負債が残る）

### 6.6 Migration compatibility

- data-model は変更なし。body format / schema 無変更
- `pkc-entry-save` など既存 message protocol には影響なし
- 既存 tests: `tests/adapter/mutation-shell.test.ts` や textlog-presenter テストに dblclick-to-edit を assert する行があれば **新 edit button click + Alt+Click** に振り替える
- manual `05` の「TextLog のログ row をダブルクリック → 編集」記述を削除し、✏︎ button / `Alt+Click` / Enter の 3 経路に置換

### 6.7 やらないこと（v0）

- triple-click の独自ハンドリング（ブラウザ標準に返すだけ）
- 新キー shortcut（`Ctrl+E` for edit など）の追加
- log row 全体をクリックで編集起動する方針（dblclick と同じ competing problem を招くため、明示 button / modifier gesture に限る）

---

## 7. Child window continuous edit contract

### 7.1 主目的

**child window は preview+edit のハイブリッドではなく、continuous edit を主目的**とする。save を挟みながら長時間の編集を続ける surface として位置づけ直す。

現状:
- PR #105 で `Ctrl+S` / `Escape` が入った（first slice）
- save 後は既存 save button と同じで view モードに戻る → 次の edit 開始に手間がかかる
- preview は main window 側の split editor で十分機能しており、child の主役ではない

v0 方針:
- **child = edit-first**
- **main = navigation + preview + multi-entry ワークフロー**
- preview を child に持ち込む v1 余地は残すが、v0 は scope 外

### 7.2 Continuous edit mode の定義

child window が open の間、editor は **常時 edit モードで滞在**する。save action は:

1. 現在の title / body を `pkc-entry-save` で parent に送る
2. parent から `pkc-entry-saved` が帰ってきたら:
   - `originalTitle` / `originalBody` を現 editor 値で同期
   - status 表示を「✓ saved HH:mm:ss」にしばらく切替
   - **editor を閉じない**
   - **caret / selection / scroll を維持**
3. ユーザは続けて編集 → `Ctrl+S` で再度 save → continuous loop

### 7.3 Ctrl+S 後の挙動（v0 契約）

| 項目 | v0 |
|---|---|
| window | 開いたまま |
| mode | edit のまま（view に戻らない）|
| caret | save 直前と同じ offset |
| selection | save 直前と同じ range |
| scroll | save 直前と同じ |
| title-display | 保存後の latest title に更新 |
| status 表示 | 「✓ saved HH:mm:ss」を 3 秒ほど表示、その後戻る |
| Escape の挙動 | 既存 first slice を維持（edit 中なら cancelEdit で破棄 → view、view なら window.close）|

**キーポイント**: save は **データ確定**であり、UI 状態の reset ではない。既存 `saveEntry()` / `pkc-entry-saved` handler はこの方針に沿って **caret / scroll を触らない** よう保つ（現行はそうなっているはずだが、念のため契約で固定する）。

### 7.4 Edit-only mode を持つべきか

**v0: child は常時 edit mode で開く。view mode は「保存後のフォールバック」として残るが、default で 1 回も出ない**。

理由:
- child を開くユーザは「main で見ていた → 詳しく書きたい」という動機が多い
- 最初に view を挟むと「Edit button を押す」余計な 1 step が挟まる（PR #105 の `startEditing=true` の既存挙動を標準化するだけ）
- save 後も edit のままなら、view に遷移する必要はほぼゼロ

**例外**: `readonly` / `lightSource` / `viewOnly` な container: edit mode には入れないため、child も view のまま開く（既存挙動）。

### 7.5 Preview の扱い

| item | v0 |
|---|---|
| child 内 preview tab | 現行 split editor / preview tab は **既存 child 実装を維持**（TEXT / TEXTLOG の split editor など）。新規 preview toggle は追加しない |
| child-only の preview-only mode | v1 以降の候補（本 wave では scope 外）|

### 7.6 Conflict / save-failed 時の扱い

- 既存 `pkc-entry-conflict` message（`dual-edit` 検知）で通知される場合:
  - child は **edit mode を維持**、banner を表示
  - ユーザは編集内容を保持したまま、次の save 試行で競合解決に進む
  - v0 では conflict resolve の UI 拡張はせず、既存 handler をそのまま使う
- save-failed（network / IO error など）時:
  - status 表示を「⚠ save failed」に切替、edit state は変えない
  - 次回 `Ctrl+S` で再試行可能

### 7.7 v0 / v1 の切り分け

**v0（本 wave で実装）**:
- `startEditing=true` を child の既定挙動に昇格
- `Ctrl+S` 後も edit mode を維持、caret / scroll を保持
- save 後の status 表示を「✓ saved HH:mm:ss」に変更
- Escape の 2 段階挙動は PR #105 のまま維持

**v1（follow-up）**:
- child-only preview toggle / preview-first mode
- conflict resolution UI を child 側に内包
- 追加 shortcut（`Ctrl+;` / `Ctrl+Enter` / inline calc）— PR-ζ₂ 以降
- save 後の undo horizon 拡張（現行は save ごとに boundary）

### 7.8 Parent 側への影響

- `pkc-entry-save` / `pkc-entry-saved` protocol は **変更なし**
- `handleMessage` の既存 handler は変更なし
- 新規 message type を追加しない（§7.6 の banner は既存 `pkc-entry-conflict` を使う）
- main の `dual-edit-safety` 経路は既存のまま

### 7.9 やらないこと（v0）

- child-only preview toggle
- child で inline calc / `Ctrl+;` / `Ctrl+Enter` 等の追加 shortcut
- child での relation / tag / provenance の編集
- main と child の editor state 完全共有（独立 window は独立 state を保持）
- child window 内での multi-entry navigation（child は 1 entry 編集に閉じる）

---

## 8. Slice plan

本 wave を **5 slice** に分解。各 slice は独立 PR として起票可能、依存関係は線形。

### Slice 1 — Todo add popover foundation（Kanban 優先）

**Scope**:
- AppState に `todoAddPopover?` field を additive 追加
- UserAction 3 種（`OPEN_TODO_ADD_POPOVER` / `CLOSE_TODO_ADD_POPOVER` / `COMMIT_TODO_ADD`）
- renderer に Kanban column 末尾の「+ Add」affordance + popover 描画
- action-binder に popover open / close / commit handler
- tests: reducer 3 action、renderer の affordance 出現、popover での Enter = commit / Escape = discard

**Scope 外**: Calendar 側の popover（Slice 2）/ Editor-in（Slice 3）/ dblclick 改修（Slice 4）/ child window continuous（Slice 5）

**規模**: +150〜200 行、+15〜20 tests、bundle +2〜3 KB

### Slice 2 — Calendar Todo add popover

**Scope**:
- Slice 1 で確立した popover model を Calendar day cell に展開
- cell hover affordance + day date を popover context に渡す
- `COMMIT_TODO_ADD` reducer で Calendar context 時に `body.date` をセット
- tests: Calendar 側 affordance 出現 / date 引き継ぎ / cross-view 移動時の popover close

**規模**: +60〜80 行、+8 tests、bundle +0.5 KB

### Slice 3 — Editor-in (Kanban / Calendar on todo only)

**Scope**:
- Kanban card / Calendar cell todo tile の hover ✏︎ affordance
- Editor-in popover（title / description / date / status 4 field、Slice 1 の popover を拡張）
- save は既存 `COMMIT_EDIT` 経路を通す（新 action は追加しない）
- `Alt+Click` も併設（主導線は button、modifier は shortcut）
- tests: affordance 出現 / popover field / save / cancel / Alt+Click

**Scope 外**: text / form / attachment への Editor-in 拡張（v1）、multi-entry 同時編集

**規模**: +200〜250 行、+15 tests、bundle +3〜4 KB

### Slice 4 — TEXTLOG dblclick revision

**Scope**:
- `handleDblClick` の `.pkc-textlog-log` 分岐を削除（dblclick-to-edit 廃止）
- log row hover affordance（✏︎ button、`data-pkc-action="edit-log"`）を追加
- `Alt+Click` handler（既存 click delegation に分岐追加）
- 既存 textlog / mutation-shell tests から dblclick-to-edit assert を除去、✏︎ button / `Alt+Click` の assert に置換
- manual `05` の該当行を更新

**規模**: +100〜150 行 / −30〜50 行、+10 tests 新規 / 5 tests 更新、bundle +1〜2 KB

### Slice 5 — Child window continuous edit mode

**Scope**:
- child inline script の save 後処理で edit mode を維持（caret / scroll 保持）
- status 表示を「✓ saved HH:mm:ss」フォーマットに
- `startEditing=true` を child 既定に（readonly 除く）
- tests: save 後に edit pane が可視のまま / caret offset 保持 / status 表示切替 / readonly 時は view のまま

**規模**: +80〜120 行、+6〜8 tests、bundle +0.5〜1 KB

### 依存関係

```
Slice 1 → Slice 2 → Slice 3
Slice 4（独立）
Slice 5（独立）
```

Slice 1 / 2 / 3 は順序必須。Slice 4 / 5 は Slice 1 との依存なし、並行 / 順不同で着手可能。推奨順: **1 → 2 → 4 → 5 → 3**（Editor-in が最も規模大なので popover foundation と dblclick 整理を先に固める）。

---

## 9. Non-goals

本 wave で **意図的にやらない**（将来 wave / scope 外）:

- **Spreadsheet entry 本体実装**（§10 で次段候補として位置確保のみ）
- **formula / grid / clipboard 本格対応**
- **child window full shortcut parity**（`Ctrl+S` / `Escape` 以外は PR-ζ₂ 以降、別トラック）
- **Kanban / Calendar 全面再設計**（列カスタム、フィルタ整理、view 高速化など）
- **main / child 編集系の全面統一大改修**（共通 editor abstraction、state-sharing の一元化）
- **新規 archetype 追加**（spreadsheet / complex / document-set などは別 wave）
- **archetype 切替 UI**（Kanban card から form → todo などの変換）
- **multi-entry 同時編集**
- **preview を child window の主役に据える改修**（v0 は edit-first）
- **既存 TEXTLOG log editor の再設計**（v0 は既存維持）
- **Context menu の Editor-in 統一 rename**（behavior は現行維持、v1 以降）

---

## 10. Spreadsheet entry — next-foundation note

### 10.1 なぜ次段候補か

- 本 wave で固める **Editor-in contract** と **continuous edit contract** は spreadsheet の cell 単位編集 UX の前提になる
- spreadsheet は body format / renderer / editor / import-export の 4 面すべてに仕様が要り、**docs-first で body format を先に固める前に UX 方針が定まっていない** と spec が揺れる
- 本 wave の Editor-in popover / continuous edit が動いていれば spreadsheet cell edit UX を同じ pattern に乗せられる（誤用しにくい contract の流用）

### 10.2 先に固めるべきこと（spreadsheet wave 着手前に）

| 項目 | 本 wave との関係 |
|---|---|
| body format（CSV / TSV? / 専用 JSON?）| 本 wave で決めない。`docs/spec/body-formats.md` への additive として別 wave |
| renderer（table DOM / virtual scroll / read-only view）| 本 wave の provenance viewer / markdown fence（CSV → table）の経験が参考 |
| editor（cell-level / inline popover / split editor）| 本 wave の Editor-in popover / continuous edit の再利用可否を設計 checkpoint に |
| import / export 境界（merge-import との整合 / CSV fence との区別）| 本 wave で触らない、merge-import 既存契約を破らない |

### 10.3 本 wave との接点

- spreadsheet cell の「1 cell 編集 → Enter commit / Esc discard」は、本 wave の popover と UX 揃える
- spreadsheet の「全体保存」は child window continuous edit の `Ctrl+S` 契約を再利用する想定
- この 2 点を本 wave の契約に組み込んでおくと、spreadsheet wave 着手時に **同じ gesture / keyboard / save flow** を自然展開できる

### 10.4 本 PR での扱い

- 本 PR では **仕様化しない**
- `docs/development/data-model/spreadsheet-archetype.md`（draft）は既存のまま
- `HANDOVER_FINAL.md §22.3 Defer` / `ledger §3.3 C` に登録があれば、そのまま維持

---

## 11. Related docs

### 11.1 本 wave の背景

- `../planning/HANDOVER_FINAL.md §23` — UI continuity wave closure（2026-04-22）
- `../planning/USER_REQUEST_LEDGER.md §1.2` — S-52〜S-58 retrospective
- `recent-entries-pane-v1.md` / `breadcrumb-path-trail-v1.md` / `saved-searches-v1.md` — UX wave の contract 前例

### 11.2 Kanban / Calendar / Todo foundation

- `calendar-kanban-keyboard-navigation.md` — keyboard nav（Editor-in gesture と非衝突）
- `calendar-kanban-multi-select-*.md` 系 — multi-select 挙動（Editor-in と排他）
- `kanban-keyboard-phase3-ctrl-arrow.md` — Kanban column 内 keyboard navigation
- `todo-cross-view-move-strategy.md` — Todo の view 横断移動
- `todo-view-consistency.md` — Detail / Calendar / Kanban での Todo 表示一貫性
- `todo-layering-fix.md` — Todo render の重なり順（popover レイヤの前提）

### 11.3 TEXTLOG

- `textlog-text-conversion.md` — TEXTLOG ↔ TEXT 変換（dblclick revision と独立）
- `textlog-text-attachment-ux-polish.md` — TEXTLOG UX 補助

### 11.4 Child window

- `entry-window-archetype-display.md` — child の archetype 別表示
- `entry-window-structured-editor-parity.md` — child の構造化 editor
- `entry-window-title-live-refresh-v1.md` — child 側 title 同期（P3 follow-up）
- `entry-window-preview-phase4.md` — preview 契約

### 11.5 UI continuity wave（直前の前提）

- PR #99 — scroll-preservation helper（cluster B）
- PR #100 — recent pane collapse state（cluster C）
- PR #101 — state-driven storage profile（cluster A）
- PR #103 + #104 — opt-in reveal policy + lockdown（cluster C'）
- PR #105 — child window shortcut first slice（cluster D）

### 11.6 実装時に touch する想定 code

- Slice 1 / 2 / 3: `src/core/action/user-action.ts` / `src/adapter/state/app-state.ts` / `src/adapter/ui/renderer.ts` / `src/adapter/ui/action-binder.ts`、必要に応じて `src/features/todo/`
- Slice 4: `src/adapter/ui/action-binder.ts`（`handleDblClick` 改修）/ `src/adapter/ui/renderer.ts`（log row affordance）/ `tests/adapter/textlog-presenter.test.ts` 等
- Slice 5: `src/adapter/ui/entry-window.ts`（inline script 内の save 後処理）/ `tests/adapter/entry-window.test.ts`

### 11.7 Docs 反映（本 wave 完了時）

- `HANDOVER_FINAL.md` に §24 として wave closure 追記
- `USER_REQUEST_LEDGER.md §1` に本 wave 対応要望を追加
- `development/INDEX.md` に slice 1〜5 の COMPLETED 行を追加
- `docs/manual/*` に「Kanban / Calendar からの Todo 追加」「Editor-in」「TEXTLOG の新編集導線」「child window continuous edit」を反映


