# HANDOVER — PKC2 マージ前 最終整理

**Status**: 引き継ぎ正本（canonical handover）
**Last updated**: 2026-04-21（§22 Recent Waves Addendum 追補）
**Previous stamp**: 2026-04-17（§21 C-2 entry-ordering v1 + C-3 link-index v1 完了追記）
**Branch**: `claude/pkc2-handover-restructure-WNRHU`
**Supersedes**: `docs/planning/HANDOVER.md`（Issue #54 時点）/ `docs/planning/HANDOVER_SLICE6.md`（Slice 6 完了時点）
**Release target**: v0.1.0（プレリリース）

この文書は **PKC2 を人に渡せる完成状態** として締めるための最終 HANDOVER である。
次の開発者（人間であれ AI であれ）がこの文書だけを読めば、現在地・不変条件・
意図的な非対応・次段計画が全て把握できるように書かれている。

本文書は**凍結ドキュメント**の性格を持つ。内容を変える作業は「もう一段大きな
フェーズ」の開始時にのみ行う。
---

## 1. 全体サマリ

### PKC2 とは

PKC2 は **単一 HTML ファイルに自己完結するローカル完結型の知識コンテナ**
である。ユーザーはブラウザで HTML を開くだけで、IndexedDB 上に永続化される
ワークスペース（Entry・Relation・Revision・Asset の集約）を編集し、HTML /
ZIP として書き出して配布できる。外部サーバーに依存せず、同一 HTML を
email / USB / GitHub Pages / オフラインで同じように動かせる。

### 今回の到達点

P1 Slice 1〜6 と P0/P1 主要タスク、および UI singleton 整理までが完了した。
プレリリース **v0.1.0** として締められる状態である。

具体的に到達した 4 系統:

1. **Workspace (IDB)** — ブラウザ内作業環境。自動保存 + 全操作対応
2. **Portable HTML** — Light / Full × editable / readonly の 4 モード
3. **Portable Package (ZIP)** — 完全再現型 + 衝突検知 + warnings UI
4. **Guardrail UX** — 非ブロッキング通知 + 復元可能性 + 多経路 closure 安全性

**技術基盤**: core / features / adapter / UI の 5 層構造、Redux 風 reducer
（UserAction 50+ / SystemCommand 9+ / DomainEvent 16）、data-pkc-\* 属性規約、
仕様書 2 本（data-model / body-formats）＋ ユーザーマニュアル 9 章。
---

## 2. 今回の変更範囲（重要）

現ブランチは main から 75k+ 行を追加し、266 ファイルを変更している大規模ブラ
ンチである。主要変更を系統別に整理する。

### 2.1 TEXTLOG ↔ TEXT 相互変換（P1 Slice 4 / 5）

- **TEXTLOG → TEXT**: 選択モードで log を選び、プレビュー → 確認で新 TEXT
  を生成。元 TEXTLOG は不変。
- **TEXT → TEXTLOG**: heading (`#`) または hr (`---`) で分割、プレビュー →
  確認で新 TEXTLOG を生成。
- **操作順序依存の解消**: P1-1 でプレビュー modal の identity を reducer に
  編入。SELECT_ENTRY / BEGIN_EDIT / DELETE_ENTRY / SYS_IMPORT_COMPLETE で自
  動クリア。

### 2.2 embed 拡張 / cycle guard（P1 Slice 2）

- 他 Entry を `![](entry:<lid>)` で transclusion 可能
- 対象 archetype: text / textlog / todo / attachment / folder
- 5 種のガード: depth > 1 / cycle / self-reference / missing / invalid
- すべて `data-pkc-embed-blocked` の統一プレースホルダで表示

### 2.3 TODO / FOLDER description の markdown 化（P1 Slice 3）

- TODO の `description` と FOLDER の body（説明）が markdown レンダリングに
  切替え
- `hasMarkdownSyntax` で plain と markdown を自動判別
- 他 Entry への埋め込み（TODO ステータスカードなど）が実用レベルに

### 2.4 pane 再トグル shortcut（P1 Slice 6）

- `Ctrl+\` / `Cmd+\` で左ペイン（サイドバー）表示 ⇄ 非表示
- `Ctrl+Shift+\` / `Cmd+Shift+\` で右ペイン（情報パネル）表示 ⇄ 非表示

### 2.5 bulk operation snapshot（bulk_id）

- BULK_DELETE / BULK_SET_STATUS / BULK_SET_DATE で生成される N 件の
  Revision に **共通の `bulk_id`** を付与
- `Revision.bulk_id?: string` は additive optional field
- `getRevisionsByBulkId(container, bulkId)` で 1 bulk action の全 revisions
  を一括取得可能
- 「1 bulk action = 1 まとまり」として将来の restore-whole-bulk UI の下地

### 2.6 UI singleton 整理（P1-1 + audit final pass）

- **A 分類 (reducer owned)**: `text-to-textlog-modal` / `textlog-selection`
- **B 分類 (close hook)**: `textlog-preview-modal`（renderer 駆動 sync）
- **C 分類 (leave)**: `slash-menu` / `asset-picker` / `asset-autocomplete`
- 全 observable stale-leak 経路を閉塞

### 2.7 データ完全性系

- **ZIP collision 検知** (P0-5): silent overwrite を排除、5 種の warning
  code を定義、toast surface 済み
- **Revision parse 契約の strict 化** (P0-4): archetype whitelist、空 lid
  reject、timestamp 必須化
- **round-trip テスト** (P0-2a / P0-2b): 5 経路の成功パス + 28 境界観測
- **build-subset cycle test** (A10): 15 観測追加、longer cycle / multi-path
  / archetype 横断 cycle / bounded size / relation filter を固定
---

## 3. 設計の現在地

### 3.1 5 層構造の状態

```
core         ← features ← adapter ← UI (presenters/renderer/action-binder)
                                  ← main.ts (bootstrap / wire)
```

- **core**: 純粋ドメインモデル。ブラウザ API 一切なし（grep で 0 件維持）
- **features**: 純アルゴリズム（filter / sort / tree / markdown / textlog /
  calendar / kanban / asset-scan / auto-placement / ...）。adapter 逆依存なし
- **adapter**: 実行時統合（state/reducer / ui/renderer / platform/IDB
  + export/import / transport/postMessage）
- **main.ts**: 全 wire-up の単一場所

**層違反ゼロ** が `.eslintrc.cjs` の `no-restricted-imports` rule で機械的に
ガードされている。

### 3.2 reducer の健全性

- **UserAction 50+ 種**、すべて `src/core/action/user-action.ts` に型として列挙
- **SystemCommand 9+ 種**、同じく core に集約
- **DomainEvent 16 種**、reducer → events の純関数変換
- **Dispatchable = UserAction | SystemCommand** → `reduce(state, action)` →
  `(state', DomainEvent[])`
- phase 状態機械: `initializing → ready ↔ editing / exporting → error`
- phase-first switch で「このフェーズで許されないアクション」を機械的にブロック

P1-1 で 6 つの新 action を追加（TEXTLOG selection / TEXT→TEXTLOG modal の
識別子系）。reducer は全ての state mutation point として唯一の正本。

### 3.3 UI state の整理状況

| レイヤ | 所在 | 代表例 |
|-------|-----|-------|
| 永続 state | `Container`（IDB / export） | entries / relations / revisions / assets / meta |
| 実行時 state | `AppState`（reducer 管理） | phase / selectedLid / viewMode / textlogSelection / textToTextlogModal |
| 派生 UI cache | 一部 module singleton（reducer mirror） | `textlog-selection.ts` の cache |
| 真に transient な DOM | module singleton（触らない判断） | slash-menu / asset-picker / asset-autocomplete |

**原則**: 正本は reducer。UI singleton は forward cache または close-only
sync の補助として存続を許可。
---

## 4. 不変条件（Invariants）

以下は **壊してはならない** 契約である。reducer / renderer / presenter /
importer / exporter のいずれを触る場合も、これらを侵食しないことを確認する。

### 4.1 Core 層の純粋性
- `src/core/**` に **ブラウザ API 禁止**（fetch / window / document /
  localStorage / indexedDB / DOMParser / Blob / File / crypto.subtle 等）
- `src/core/operations/container-ops.ts` は `Date.now()` を呼ばない。caller
  が時刻を引数で渡す
- core ← features ← adapter ← UI の一方向依存

### 4.2 reducer 唯一性
- **reducer は state 変更の唯一の場所**。action-binder / renderer は dispatch
  するだけで、state を直接 mutate しない
- `dispatcher.getState()` は読み取り専用
- singleton state（UI local）は reducer からの forward cache または
  close-only sync のみ許可

### 4.3 preview == commit
- TEXTLOG → TEXT 変換 preview と TEXT → TEXTLOG 変換 preview で表示されて
  いる title / body は、**確認ボタンで commit される内容と厳密に一致する**
- preview modal は再計算を挟まず、DOM の current value から直接読む

### 4.4 embed depth ≤ 1
- `![](entry:<lid>)` の transclusion は **1 段のみ展開**
- depth > 1 は `data-pkc-embed-blocked` プレースホルダに置換
- cycle / self-reference / missing / invalid も同じ blocked placeholder で
  統一的に遮断

### 4.5 data-pkc-\* 属性規約
- DOM の functional selector は **すべて `data-pkc-*` 属性**
- CSS class は視覚スタイリング専用、query セレクタに使わない
- この規約で minify 耐性と test DOM query の安定性を両立

### 4.6 Container の source of truth 原則
- `Container` が唯一の永続 state
- UI state（phase / selection / editing）は reducer 管理、永続化されない
- import は **full replace**（merge しない）。単体 / batch で追加したい場合
  は別の専用経路を使う

### 4.7 Additive schema 原則（spec §15.1）
- 新フィールドは必ず optional で追加
- 既存フィールドの削除・改名は schema_version bump なしに禁止
- unknown field は reader 側で無視（破壊しない）
- legacy 形式は parse で受け入れ、save 時に new format で書き戻す (lazy migration)

### 4.8 Export / Import 契約の安定性
- `export_meta.mode`（light / full）/ `mutability`（editable / readonly）/
  `asset_encoding`（base64 / gzip+base64）の値は変更禁止
- ZIP の `manifest.format: 'pkc2-package'` / `version: 1` 識別子は固定
- SLOT ID（pkc-root / pkc-data / pkc-meta / pkc-core / pkc-styles / pkc-theme）
  は改名禁止
---

## 5. 意図的にやっていないこと（Intentionally NOT done）

**これは怠慢ではなく設計判断**。次の開発者が「なぜ残したのか」で迷わないた
めに、全て理由付きで列挙する。

### 5.1 merge import 未実装（**部分解消 — Tier 3-1 MVP + H-10 v1, 2026-04-17**）
- ~~現状 import は **full replace** のみ~~ → Tier 3-1 で Overlay MVP（append-only）、H-10 v1 で entry 単位 conflict UI（C1/C2/C2-multi + 3 操作 + bulk + provenance）まで到達
- ~~merge には conflict resolution 戦略（新規 cid 採番 / lid 衝突時の扱い / relation の張り替え）の設計が必要~~ → `docs/spec/merge-import-conflict-resolution.md` + `docs/spec/merge-conflict-ui-v1-behavior-contract.md` で固定
- 追加だけの用途には **Batch Import** / **単体 bundle (.text.zip / .textlog.zip)** が引き続き利用可能
- **なお v1 非対象**: §9 将来拡張（policy UI / staging / revision 持込 / diff export / merge undo）、accept-incoming（host 上書き）、semantic merge、attachment binary diff — いずれも v1.x / v2 テーマとして据え置き（§20.5 参照）

### 5.2 template archetype の正式化
- `generic` / `opaque` は予約として型に残っているが、専用 presenter はない
- `docs/development/data-model/complex-entry-archetype.md` などに将来設計あり
- 今は `text` archetype + markdown table / YAML で代替可能なため、実装優先度
  は低い

### 5.3 P2P transport 拡張
- `docs/vision/webrtc-p2p-collaboration.md` に先行構想あり
- 現行は postMessage based の単一 embed protocol のみ
- multi-user collaboration は conflict-free data 構造（CRDT など）への踏み
  込みが必要で、Revision の linear history モデルを拡張する必要がある
- 単独利用が主用途である今の段階では手を出さない

### 5.4 reducer への過剰な UI state 編入
- P1-1 で編入したのは `textlogSelection` と `textToTextlogModal` の 2 件のみ
- slash-menu / asset-picker / asset-autocomplete は **per-keystroke の超
  transient UI** で、reducer 編入は overkill と判定（audit §4）
- 「正本は reducer」という原則を守りつつ「実害のない transient は singleton
  のまま」という balance を意識的に選んだ

### 5.5 modal の render 横断永続化
- `textlog-preview-modal` は sync を入れたが、mount/unmount ベースの
  `text-to-textlog-modal` のような「render 横断で overlay を維持」する形に
  は**していない**
- render の `root.innerHTML = ''` で detach される既存挙動を尊重
- preview 内での大量キーストロークを扱う UX が必要になるまで、凝った永続化は
  避ける

### 5.6 DOM 全置換レンダリングの局所 diff 化
- 現状 `render()` は毎回 `root.innerHTML = ''` で全 DOM を破棄・再構築する
- scroll 位置 / focus / IME 状態は個別に保存・復元するハック的 wiring で対処
- local diff renderer（virtual DOM / incremental render）の導入は将来の大型
  refactor 対象
- 今の規模では十分速く、再レンダリング起因の regression よりも「単純で正しい」
  ことを優先する

### 5.7 TEXTLOG bundle の lossy format の解消（**解消済み — H-4 / S-20, 2026-04-14**）
- 旧: textlog-bundle (`.textlog.zip`) の CSV は `important` flag のみを列として
  持ち、将来 flag が追加されれば失われる
- F3 として spec に「lossy format」と明言済み（body-formats.md §3.6.1）
- **H-4 (S-20) で解消**: CSV schema 末尾に `flags` 列を追加。新 writer は
  `important` と `flags` を両方出力、新 reader は `flags` 列を正本にし、
  無ければ `important` から推論（legacy fallback）。modern × modern の
  round-trip は lossless、pre-H-4 reader との互換は `important` 列で維持。
  spec §3.6.1 更新済み、詳細は `docs/development/completed/textlog-csv-zip-export.md`
  §3 / §14.6 と `USER_REQUEST_LEDGER.md` §1 S-20

### 5.8 Revision への branch / prev_rid の追加
- 現状 Revision は `entry_lid + created_at` でソートして履歴として扱う
  linear model
- branch / restore 系の凝った UI を入れるなら optional field 追加で可能
  （data-model §15.5）
- 現状の forward-mutation 原則で十分使えており、拡張は具体的な要求が出てから
- **2026-04-15 追記（H-6 / 自主運転モード第 4 号）**: linear 前提のまま、
  `Revision.prev_rid?` と `Revision.content_hash?` の 2 optional field を
  追加（`snapshotEntry` で populate、旧 rev は absent のまま）。branch UI /
  diff viewer / history browser は依然未実装。本 slice は **記録面のみ**
  強化して C-1 revision-branch-restore の足場にする。詳細は
  `docs/spec/data-model.md §6.1 / §6.2 / §6.2.1` と `USER_REQUEST_LEDGER.md`
  §1 S-22
---

## 6. 既知の制約

「動作する」「安全である」が、「理想の UX」とは違う部分を明記する。これらは
次の開発者が「仕様を理解せずに直そうとする」事故を防ぐために必要な情報。

### 6.1 DOM 全置換レンダリング
- `render()` は毎回 `root.innerHTML = ''` → 再構築
- 結果: open 中の modal / popover は state 変更の render cycle で **必ず
  detach される**
- 対策済み:
  - `textlog-preview-modal` は sync で stale pointer を明示 close
  - `text-to-textlog-modal` は sync で mount / unmount を state 駆動
  - `slash-menu` / `asset-picker` / `asset-autocomplete` は textarea 依存の
    transient なので self-heal で OK
- **制約として受け入れる側**: IME 編集中 / scroll 位置 / input focus は明示
  的保存・復元が必要（既存 wiring で対処済み、新 UI 追加時は要注意）

### 6.2 pane state 非永続（**解消済み — S-19 / H-7, 2026-04-14**）
- 旧: 左右ペインの表示状態（`Ctrl+\` / `Ctrl+Shift+\` で切替）は永続化されず、
  ブラウザリロードどころか**任意の dispatch で走る再描画でさえ既定に戻って**いた
- **S-19 で解消**: `localStorage['pkc2.panePrefs']` に `{ sidebar, meta }` を
  保存。renderer が初期レンダ時に prefs を読んで `data-pkc-collapsed`
  を注入（flash なし）、`togglePane` は `setPaneCollapsed` → `applyOnePaneCollapsedToDOM`
  を経由して永続化 + DOM 反映。reducer / AppState / user-action への
  touch 0。invalid JSON / no-storage fallback 済み。詳細は
  `docs/development/pane-state-persistence.md`

### 6.3 TEXT → TEXTLOG 変換の非可逆部分
- 分割境界（heading / hr）は選んだ方式で決まるが、元の TEXT 本文内の特殊
  markdown（`---` を分割 hr ではなく水平線として意図した使い方など）は変換
  で意味が変わる可能性がある
- 変換後の TEXTLOG から元 TEXT を完全復元する保証はない（log id は新規、
  meta backlink が増える等）
- spec `body-formats.md §2.4` に「title spam の可能性」として記載
- **→ H-8 / 2026-04-16 で解消**: 非可逆境界を `docs/spec/text-textlog-provenance.md`
  に canonical spec として固定。`provenance` RelationKind と `Relation.metadata?`
  フィールドの設計も同ドキュメントに記載

### 6.4 markdown 互換リスク
- 独自拡張: `asset:` URL スキーム、`entry:` URL スキーム、transclusion の
  image-form 特殊解釈（`![](entry:<lid>)`）
- 標準 markdown viewer で開くと、`entry:` は unknown scheme として plain
  文字列化される
- 外部ツールで markdown として処理する時は、text-bundle が提供する compact
  mode（missing ref を label のみに書き戻す）で broken ref を回避する

### 6.5 ZIP stored mode（deflate なし）
- `pkc2-package` ZIP は intentional に stored mode（method 0、圧縮なし）
- 理由: 外部 deflate 実装を bundle に含めない（単一 HTML 契約）
- 既圧縮 asset（画像 / PDF / zip）には影響小だが、text 大量だと HTML Full
  より ZIP が大きくなる可能性あり
- サイズ最適化よりも portability を選んでいる設計判断

### 6.6 HTML Full の gzip fallback
- CompressionStream がない環境では `asset_encoding: 'base64'` に自動 fallback
- Node 18+ / Chrome 80+ / Firefox 113+ / Safari 16.4+ でサポート
- 古い環境で export した HTML は他環境でも互換性があるが、サイズが膨らむ

### 6.7 複数 Workspace / 複数 cid の同時扱い
- IDB は `__default__` ポインタで単一 default cid のみ使用
- 複数 cid を切り替える UI は未実装
- 設計的には data 層で可能だが、UI の整備待ち

### 6.8 ZIP import は source_cid を失う
- ZIP import は常に新 cid を採番（spec §11.5 / F1 decision）
- 元の cid は manifest に残るが、container.meta.container_id には復元されない
- 配布 HTML の cid 保持とは意図的に異なる設計（ZIP = 再導入のための形式、
  HTML = 配布 artifact）

### 6.8 Pre-existing lint errors（**解消済み — Tier 3-3 / 2026-04-14**）
- 旧: `src/adapter/ui/*.ts` で `no-restricted-imports` ルールが 80+ 件エラー
- 旧規則は「adapter が features を import してはならない」という文字通り
  読みだが、実装上は合法（CLAUDE.md の層規則では `adapter → features`
  が正しい）— 設定側のドリフトで、コードは正しかった
- **Tier 3-3 で `.eslintrc.cjs` を CLAUDE.md §Architecture に整合させ、
  91 errors / 9 warnings をゼロ化。CI の lint step は blocking に昇格済み。
  詳細は `docs/development/lint-baseline-realignment.md`**
---

## 7. 次にやるべきこと（優先順位付き）

v0.1.0 マージ後に開始できる P2 タスクを、優先度別に整理する。この順序は
**監督の運用経験を基にした推奨**であり、絶対ではない。

### 7.1 最優先（P2 early）— 運用を広げる前の追加保険

| タスク | 理由 / 期待効果 |
|-------|----------------|
| **スクリーンショット差し替え** | 現在 placeholder。Slice 1-6 の UI を反映すると manual の実用性が一段上がる |
| **i18n 基盤（日本語 / 英語）** | 現状 UI 文言は日英混在。リリース向けには統一が必要 |
| **CI / GitHub Actions 整備** | 現在 ローカル手動。lint / typecheck / test / build の自動化で回帰検知 |

### 7.2 中優先（P2 mid）— データモデル拡張

| タスク | 理由 | Tier 2 進捗 |
|-------|-----|------------|
| **merge import の conflict resolution 設計** | 複数 export を結合する運用ニーズが出たら必要 | ✓ Tier 2-3 で spec 固定（`docs/spec/merge-import-conflict-resolution.md`）。実装は Tier 3 |
| **bulk restore UI** | `bulk_id` の土台は入った。UI 導線を追加すれば使える | ✓ Tier 2-2 で実装完了 |
| **complex / document-set / spreadsheet archetype** | `docs/development/data-model/*` に設計先行済み | — 未着手 |
| **orphan asset auto-GC** | 現状手動 `PURGE_ORPHAN_ASSETS` のみ。delete / import-replace 時の自動クリーンアップ | ✓ Tier 2-1 で import 経路のみ実装（edit/delete 経路は据え置き） |

### 7.3 低優先（P2 later）— 足回りの改善

| タスク | 理由 |
|-------|-----|
| **DOM 局所 diff renderer** | 現状の全置換で十分速いが、Entry 数 1000+ でスケーリング懸念 |
| ~~**schema_version migration path の設計**~~ | **解消済み（2026-04-15 / H-3 / 自主運転モード第 3 号）**: `docs/spec/schema-migration-policy.md` に正本化。判断基準・hook 位置・lazy/eager 適用・test 戦略・v2 着手時の実装順序まで固定（docs-only）。実装は v2 要求発生時に spec §11 の順序で着手 |
| **lint ルールの整流** | 既存 `no-restricted-imports` 80 件エラーの解消。CLAUDE.md 層規則に沿う形に書き換え |
| **textlog-bundle CSV 列拡張** | flag 追加時に lossy でなくすなら |

### 7.4 ビジョン系（P3 以降）

| テーマ | 参照 |
|-------|-----|
| P2P / WebRTC 同期 | `docs/vision/webrtc-p2p-collaboration.md` |
| multi-window 協調 | `docs/vision/pkc-multi-window-architecture.md` |
| message externalization | `docs/vision/pkc-message-externalization.md` |
| application scope | `docs/vision/pkc-application-scope-vision.md` |
---

## 8. 完了済みタスクの全体表

ブランチ `claude/pkc2-handover-restructure-WNRHU` 上で完了した全タスク:

| # | タスク | 種別 | 日付 |
|---|-------|------|-----|
| P0-1 | データモデル仕様書の単一正本化 | docs | 2026-04-13 |
| P0-2a | round-trip テスト成功パス導入 | test | 2026-04-13 |
| P0-2b | round-trip 境界ケース観測 | test | 2026-04-13 |
| P0-4 | Revision parse failure contract 補強 | src + test + docs | 2026-04-13 |
| P0-5 | ZIP import collision 検知（importer 側） | src + test + docs | 2026-04-13 |
| P0-5b | ZIP import warnings UI surface | src + test | 2026-04-13 |
| P1-1 | UI singleton state の reducer 編入 | src + test + docs | 2026-04-13 |
| P1-2 | entry-window live-refresh の dispatcher 購読化 | src + test | 2026-04-13 |
| F1 | ZIP import `updated_at` の canonical 化 | docs | 2026-04-13 |
| F2 | text-bundle title trim の canonical 化 | docs | 2026-04-13 |
| F3 | textlog-bundle lossy format の明文化 | docs | 2026-04-13 |
| manual 更新 | manual 全章を実装に追従 | docs | 2026-04-13 |
| bulk snapshot | Revision.bulk_id の追加 | src + test + docs | 2026-04-13 |
| A10 | build-subset cycle observation テスト | test | 2026-04-13 |
| UI singleton audit | 残 singleton 棚卸し | docs | 2026-04-13 |
| textlog-preview auto-close | renderer 駆動 close-only sync | src + test + docs | 2026-04-13 |

**合計**: 14 commits、ブランチ内で 266 files / +75k lines 変更。全ての
commit で `npm test` 全通過、`build:bundle` 成功、production code は最小
差分で進んだ。

### 完了時点のテスト数推移

- P0-1 commit 時: 既存 3378 tests
- P0-2a 後: 3378 + 15 = 3393
- P0-2b 後: 3393 + 28 = 3421
- P0-5 collision: 3421 + 15 = 3436
- P0-5 warnings UI: 3436 + 20 = 3456（但し一部 recount）
- P1-1 後: 3491
- P1-2 後: 3438（P1-1 並行期間を整理）
- P0-4 後: 3467
- manual 更新後: 3491（docs-only のため変化無し、前 commit の値維持）
- bulk snapshot 後: 3530 (+19)
- A10 後: 3545 (+15)
- warnings toast 後: **3556** (+20 for sync + misc)
- **最終**: **3556 tests / 119 files, all passing**
---

## 9. ドキュメント構造の棚卸し

PKC2 のドキュメントは 5 つのレイヤに分かれる。次の開発者はこの構造を
守ったまま追加する:

### 9.1 `docs/spec/` — 正本仕様書（canonical）

| ファイル | 内容 |
|---------|-----|
| `data-model.md` | Container / Entry / Relation / Revision / Assets の JSON schema・不変条件・IDB 保存・HTML / ZIP export 契約・bulk_id |
| `body-formats.md` | archetype 別 body 契約（text / textlog / todo / form / attachment / folder / generic / opaque）、asset / entry 参照記法、embed / cycle guard |

**ルール**: 破壊的変更時は schema_version bump 必須。optional 追加は自由。
Guaranteed contract と Current implementation を分けて記述する。

### 9.2 `docs/planning/` — 設計・運用文書

| ファイル | 役割 |
|---------|------|
| `00_index.md` | ナビゲーション |
| `HANDOVER_FINAL.md` | **この文書。常に最新** |
| `HANDOVER.md` / `HANDOVER_SLICE6.md` | 過去の棚卸し（履歴参照のみ） |
| `INVENTORY_041.md` | Issue #41 時点の詳細棚卸し |
| `05_設計原則.md` ～ `20_UI_usability_audit.md` | 各領域の設計判断 |
| `CHANGELOG_v0.1.0.md` | v0.1.0 リリース note |
| `resolved/` | 解決済み計画文書（履歴） |

### 9.3 `docs/development/` — 実装細目

Issue ごとの技術メモ・実装方針・検討ログ。INDEX.md にステータス一覧あり
（CLOSED / COMPLETED / CANDIDATE）。

新しい Issue の設計文書はここに追加する（spec ではない、manual でもない
「開発時の判断記録」）。

### 9.4 `docs/manual/` — ユーザー向けマニュアル

| 章 | 内容 |
|---|-----|
| 00 | 索引 |
| 01 | はじめに |
| 02 | クイックスタート |
| 03 | 画面とビュー |
| 04 | エントリの種類 |
| 05 | 日常操作（multi-select / DnD / 右クリック / 別窓 / TEXT↔TEXTLOG / Batch Import を含む） |
| 06 | キーボードショートカット（6 Phase ナビゲーション含む） |
| 07 | 保存と持ち出し（ZIP warnings UX 含む） |
| 08 | 運用ガイド（planning/18 からビルド時取込） |
| 09 | トラブルシューティング + 用語集 |

### 9.5 `docs/vision/` — 将来構想

P2P / multi-window / message externalization / application scope の長期
ビジョン。**現段階では参考文書**。実装着手は Issue として別途切り出す。

### 9.6 `docs/requirements/` — 原点

初期要件。履歴参照用。
---

## 10. 実装戦略メモ（後続開発者向け）

### 10.1 コミット原則

- **1 コミット = 1 不変式 or 1 契約**
- **docs と test は同一 commit に同梱**
- コミットメッセージに「scope 外として意図的に触らなかったもの」を明示する
  （このブランチの commit log がお手本）

### 10.2 各コミット作成時のチェックリスト

- [ ] `npm run typecheck` 通過
- [ ] 関連 test で pass
- [ ] `npm test` 全体で pass
- [ ] 必要なら `npm run build:bundle` で dist 更新 commit
- [ ] `data-pkc-*` 規約違反なし
- [ ] 5 層依存方向違反なし
- [ ] `docs/spec/**` or `docs/development/**` に対応記載
- [ ] `CLAUDE.md` の Language Policy 遵守（内部思考英語 / 出力日本語）

### 10.3 大きいファイルの扱い

- **行数だけでなくバイト数・最大行長も確認**（1 行が長いケース対策）
- 1000+ 行のファイルは 20 チャンク分割で読む
- 対象: `renderer.ts` (3497)、`action-binder.ts` (4318)、
  `app-state.ts` (1180+)、`entry-window.ts` (2214)、
  `tests/adapter/renderer.test.ts` (大)、
  `tests/adapter/entry-window.test.ts` (2939)

### 10.4 禁止事項（再掲）

- cross-layer import（core ← features ← adapter を崩す）
- CSS class を functional selector に使う
- renderer 内での DOM 読取
- action-binder 内での DOM 操作
- core にブラウザ API 導入
- `export_meta` / `asset_encoding` の **非互換変更**
- `manifest.format: 'pkc2-package'` / `version: 1` の改名
- SLOT ID 改名
---

## 11. 定量指標

### 11.1 ソースコード規模

| 層 | ファイル数 | 代表サイズ |
|---|----------|----------|
| `src/core/` | 10+ | 小さい（model 各 20-50 行、container-ops 約 450 行） |
| `src/features/` | 20+ | 中（markdown / textlog / relation 系） |
| `src/adapter/platform/` | 16 | 中（zip-package 620 行が最大） |
| `src/adapter/state/` | 2 | 大（app-state 1180+ 行） |
| `src/adapter/ui/` | 26 | 大（renderer 3497、action-binder 4318、entry-window 2214） |
| `src/adapter/transport/` | 7 | 小 |
| `src/runtime/` | 3 | 小 |

### 11.2 テスト規模

- **Test files**: 119
- **Test cases**: 3556（all passing）
- **Execution time**: 約 35-65 秒（full suite）
- **test ディレクトリ構造**: `tests/core/` / `tests/features/` /
  `tests/adapter/` / `tests/adapter/round-trip/` / `tests/adapter/transport/` /
  `tests/runtime/` / `tests/styles/` / `tests/build/`

### 11.3 Bundle サイズ

| 対象 | サイズ | gzip |
|-----|-------|-----|
| `dist/bundle.js` | 495.28 kB | 147.81 kB |
| `dist/bundle.css` | 72.31 kB | 10.90 kB |
| `dist/pkc2.html`（単一 HTML 成果物） | 別途 `build:release` で生成 | — |

### 11.4 Branch 差分

- Main からの commit: 14
- 変更 files: 266
- Insertions: 75,159
- Deletions: 705
---

## 12. リリースチェックリスト（v0.1.0）

このブランチを main にマージして v0.1.0 としてタグを打つ前に確認する項目。

### 必須

- [x] `npm test` が全 pass
- [x] `npm run typecheck` がエラー 0
- [x] `npm run build:bundle` が成功
- [x] `docs/spec/**` の 2 仕様書が実装と整合
- [x] `docs/manual/**` が実装済み機能を反映
- [x] `docs/planning/HANDOVER_FINAL.md`（この文書）が存在
- [x] `docs/planning/CHANGELOG_v0.1.0.md` が存在
- [x] `docs/planning/00_index.md` が最新の章構成を反映
- [x] `dist/bundle.js` と `dist/bundle.css` が最新コミットに同梱

### 推奨（リリース品質を一段上げるなら）

- [x] `npm run build:release` を実行して `dist/pkc2.html` を更新
- [x] manual のスクリーンショットを最新 UI に差し替え — Tier 1-2 で完了（Playwright + IPAGothic）
- [ ] GitHub Release 上に v0.1.0 タグ + release note を作成
- [ ] `docs/planning/19_pre_release.md` を v0.1.0 リリース note と整合

### 非必須（マージ後で可）

- [x] CI 設定の導入（`.github/workflows/*.yml`）— Tier 1-1 で完了（lint は continue-on-error、blocking 化は Tier 3 C 候補）
- [ ] Pre-existing lint errors の解消（無関係、P2）
- [ ] i18n 基盤（将来の多言語化向け）— §18.4.2 で据え置き判断
---

## 13. 次セッション向けの標準プロンプト雛形

次に PKC2 を触るセッション（人間であれ AI であれ）が、最短で正しい作業に入
るためのテンプレート。

```text
[Meta]
- Internal reasoning MUST be in English
- Final output MUST be in Japanese

[File Handling]
- Before reading/editing any file, check size first.
- For large files (renderer.ts / action-binder.ts / app-state.ts /
  entry-window.ts / tests ≥ 1000 lines), split into 20 chunks and
  work chunk-by-chunk.

[Context — read first]
1. docs/planning/HANDOVER_FINAL.md  ← this file
2. docs/spec/data-model.md
3. docs/spec/body-formats.md
4. CLAUDE.md
5. docs/planning/00_index.md

[Invariants to preserve]
See HANDOVER_FINAL.md §4.

[Rules]
- reducer is the sole state mutation point
- core has no browser API
- data-pkc-* attributes for functional selectors
- preview == commit
- embed depth ≤ 1
- Additive schema only; no destructive changes without schema bump

[Task]
<specific task here>
```

### 推奨する最初の 1 タスクの切り方

次セッションで最初に試すべきは、P2 early の中から **「小さくて効果が高い」
もの**。一例:

- スクリーンショット差し替え（docs/manual/images/）→ UI が実物として見える
- CI 整備（GitHub Actions で npm test + typecheck + build）→ 回帰検知の自動化
- i18n 調査（UI 文言の現状 inventory）→ 実装前に全箇所の棚卸し
---

## 14. 関連文書

### 仕様（正本）
- `docs/spec/data-model.md` — Container 全体スキーマ + revision + bulk_id + HTML/ZIP 契約
- `docs/spec/body-formats.md` — archetype 別 body 契約 + asset / entry 参照記法

### 設計
- `docs/planning/05_設計原則.md` — 設計哲学
- `docs/planning/12_基盤方針追補_責務分離.md` — 5 層アーキテクチャ
- `docs/planning/13_基盤方針追補_release契約.md` — HTML slot 契約
- `docs/planning/15_基盤方針追補_type_dispatch_adapter.md` — reducer 型規約
- `docs/planning/16_基盤方針追補_versioning_UX_Issues.md` — 状態機械 / UX
- `docs/planning/17_保存再水和可搬モデル.md` — 4 系統モデル（Workspace / HTML / ZIP / Template）
- `docs/planning/18_運用ガイド_export_import_rehydrate.md` — 利用手順
- `docs/planning/19_pre_release.md` — プレリリース note
- `docs/planning/20_UI_usability_audit.md` — UI 監査

### 開発
- `docs/development/INDEX.md` — Issue インデックス（42+ CLOSED + 完了群）
- `docs/development/ui-singleton-state-audit.md` — 残 singleton 棚卸し
- `docs/development/stale-listener-prevention.md` — テストでの listener leak 回避
- `docs/development/textlog-text-conversion.md` — TEXTLOG ↔ TEXT 変換仕様
- `docs/development/embedded-preview-and-cycle-guard.md` — embed / cycle guard 設計
- `docs/development/zip-export-contract.md` — ZIP stored mode の根拠

### 履歴
- `docs/planning/HANDOVER.md` — Issue #54 時点
- `docs/planning/HANDOVER_SLICE6.md` — Slice 6 完了時点
- `docs/planning/INVENTORY_041.md` — Issue #41 時点
- `docs/planning/resolved/**` — 解決済み計画文書

### ユーザー
- `docs/manual/00_index.md` — マニュアル入口

### ビジョン
- `docs/vision/pkc-application-scope-vision.md`
- `docs/vision/pkc-multi-window-architecture.md`
- `docs/vision/pkc-message-externalization.md`
- `docs/vision/webrtc-p2p-collaboration.md`
---

## 15. 本文書の変更履歴

| 日付 | 変更 |
|-----|-----|
| 2026-04-13 | 初版作成。v0.1.0 リリース前の最終 HANDOVER として整備 |
| 2026-04-14 | §18「Tier 2 完了時点の到達状態」を追加（Tier 1-1 / 1-2 / 2-1 / 2-2 / 2-3 の固定、5 つの新不変条件、5 項目の意図的 non-done、Tier 3 方向の列挙）。§1〜§17 は書き換え無し |
| 2026-04-14 | §18.8「Tier 3-1 完了」を追加（merge import Overlay MVP 実装）。§18.5 A を完了印に更新。§4〜§5 / §6 / §17 は無変更 |
| 2026-04-14 | §18.9「Tier 3-2 完了」を追加（release automation + bundle size budget + Playwright smoke baseline）。production code への touch 0。詳細は `docs/development/release-automation-and-smoke-baseline.md` |
| 2026-04-14 | §18.9 末尾の Tier 3-3 再評価ポインタを追記。`docs/planning/TIER3_3_REEVALUATION.md` を正本として追加（docs-only）。Tier 3-3 = C-4（lint baseline 解消）を採用 |
| 2026-04-14 | §18.10「Tier 3-3 完了」を追加（lint baseline realignment）。§6.8 を "解消済み" に更新。`.eslintrc.cjs` を CLAUDE.md §Architecture に整合させて 91 errors / 9 warnings をゼロ化、CI の lint step を blocking に昇格。詳細は `docs/development/lint-baseline-realignment.md` |

### このあと更新してよい箇所

- §7「次にやるべきこと」— 着手したものを ✓ に
- §8 完了タスク表 — 新規タスクを追加
- §11 定量指標 — test 数 / bundle サイズの更新
- §12 リリースチェックリスト — release 後の後始末完了で ✓

### このあと更新してはいけない箇所

- §4 不変条件 — 変えるなら schema bump
- §5 意図的にやっていないこと — 削除するなら理由を明記
- §6 既知の制約 — 解消したら削除でなく「解消日」を付記

---

## 16. 最終ステータス

| タスク | 状態 |
|-------|-----|
| P0-1 仕様固定 | ✓ |
| P0-2a 成功パス証明 | ✓ |
| P0-2b 境界観測 | ✓ |
| P0-4 Revision parse 補強 | ✓ |
| P0-5 ZIP collision 検知 | ✓ |
| P0-5b ZIP warnings UI surface | ✓ |
| P1-1 UI singleton reducer 編入 | ✓ |
| P1-2 entry-window stale 解消 | ✓ |
| F1 / F2 / F3 canonical 化 | ✓ |
| manual 更新 | ✓ |
| bulk operation snapshot | ✓ |
| P0-2c / A10 build-subset cycle test | ✓ |
| UI singleton 棚卸し | ✓ |
| textlog-preview-modal auto-close sync | ✓ |

**v0.1.0 リリース準備: 完了**。

---

## 17. spec 整合性チェック結果（2026-04-13）

マージ前整理の一環で実施した、`docs/spec/` と実装の突き合わせ結果。

### 17.1 `docs/spec/data-model.md`

| 検査項目 | 結果 |
|---------|-----|
| §1 Container schema | 実装 (`src/core/model/container.ts`) と一致 |
| §2 ContainerMeta + sandbox_policy | 一致（attachment-sandbox-phase5 で追加済みの optional field が明記） |
| §3 Entry schema | 一致 |
| §4 ArchetypeId 8 種 | 一致。`KNOWN_ARCHETYPES` set の中身と spec enum が同一 |
| §5 Relation + 4 kind | 一致 |
| §6.1 Revision + bulk_id | **bulk_id 反映済み**。`Revision.bulk_id?: string` optional 契約が両側で一致 |
| §6.3 snapshot 発火表 | 3 種の BULK に `bulk_id` 列が付与、実装と一致 |
| §6.4 parse strict contract | P0-4 実装の `parseRevisionSnapshot` と archetype whitelist / timestamp 必須が一致 |
| §6.4.4 failure contract 総括表 | restoreEntry archetype-mismatch guard 含め実装と一致 |
| §7 Assets | IDB / HTML / ZIP / compact 経路の encoding 差異が実装と一致 |
| §9 IDB レイアウト（DB v2 / assets store 分離） | `idb-store.ts` と一致 |
| §10 HTML export + export_meta | `exporter.ts` / `compressAssets` と一致 |
| §11.4 ZIP import `updated_at` 上書き | F1 canonical 化済み、実装の無条件上書きと一致 |
| §11.7 ZIP collision policy + 5 warning codes | 実装 `ZipImportWarningCode` 5 種と完全一致、first-wins / skip の ルール表も一致 |
| §14 不変条件 | 実装の reducer 不変式と一致 |

### 17.2 `docs/spec/body-formats.md`

| 検査項目 | 結果 |
|---------|-----|
| §1 共通原則（body は常に string） | 全 presenter で遵守、parse 関数 throw なし |
| §2 text + markdown 拡張 | markdown-render / asset-resolver / transclusion の実装と一致 |
| §3 textlog body + log-id（ULID） | `textlog-body.ts` / `log-id.ts` と一致 |
| §3.6.1 textlog-bundle lossy declaration | F3 canonical 化済み、CSV schema が 5 列（important のみ）の実装と一致 |
| §4 todo + description markdown | Slice 3 実装 + todo-presenter と一致 |
| §5 form (3 固定 field) | `form-presenter.ts` と一致 |
| §6 attachment + sandbox_allow | new/legacy 両形式の lazy migration と一致 |
| §7 folder + description markdown | Slice 3 実装、`hasMarkdownSyntax` gate と一致 |
| §9 asset 参照記法 | `SAFE_KEY_RE` = `[A-Za-z0-9_-]+` と一致、missing 時の placeholder と一致 |
| §10 entry 参照 / embed 5 guard | transclusion.ts の 5 種 placeholder と一致 |
| §13.4.1 text-bundle title trim canonical | F2 canonical 化済み、`(source_title ?? '').trim() \|\| 'Imported text'` と一致 |
| §14 legacy migration 一覧 | 実装の lazy migration 経路と一致 |

### 17.3 結論

**spec と実装の間に observable な不整合は無し**。spec 側に明記された F1/F2/F3
decision、bulk_id 追加、warning codes、P0-4 strict parse、P1-1 新 AppState
field すべてが実装に反映されている。逆方向も同じで、実装で増えた field /
action / warning の全てが spec に記載済み。

検査未実施の項目（P2 以降で増えれば順次記録）:
- 将来の archetype（complex / document-set / spreadsheet）— docs/development
  にドラフトあり、spec には未取り込み
- schema_version migration path — **spec 化完了**（2026-04-15、`docs/spec/schema-migration-policy.md`）。実装は v2 要求発生時に spec §11 の順序で着手する前提、現時点ではコード変更 0
- merge import — spec に merge 契約なし、実装も無し
- 以上 3 項目は「意図的に spec に無い」状態であり、HANDOVER_FINAL §5 と整合

---

## 18. Tier 2 完了時点の到達状態（2026-04-14 締め）

v0.1.0 のマージ後に走った **Tier 1〜Tier 2** の作業をここで正式に
凍結する。本章は §4〜§7 の **補遺** であり、既存条項を書き換えない。

### 18.1 Tier 1 / Tier 2 の全体サマリ

| Tier | 完了日 | 成果 | 種別 |
|------|-------|------|------|
| 1-1 | 2026-04-14 | GitHub Actions CI（typecheck / lint / test / build）導入 | infra |
| 1-2 | 2026-04-14 | manual 6 枚の placeholder を Playwright 実機キャプチャに差し替え | docs |
| 2-1 | 2026-04-14 | `removeOrphanAssets` を import 経路 3 箇所に wiring（自動 orphan purge） | src + test + docs |
| 2-2 | 2026-04-14 | BULK_* revision の 1-click restore UI（meta pane + trash panel） | src + test + docs |
| 2-3 | 2026-04-14 | merge import 衝突解決の設計 spec を `docs/spec/merge-import-conflict-resolution.md` に固定 | docs-only |

Tier 1 は「v0.1.0 リリース後の運用基盤整備」、Tier 2 は「既存契約
の中で閉じられる改善 3 点」という切り分けで進めた。いずれも 5 層
アーキテクチャ / reducer 一元化 / additive schema の **既存不変条件
を壊していない**。

### 18.2 Tier 2 で追加された不変条件（§4 の補遺）

以下 5 項目は v0.1.x 時点で **固定された契約** として扱う。変更は
schema bump 相当の大きな意思決定を要する。

#### I-AutoGC1: orphan asset auto-GC は import 経路限定
- `SYS_IMPORT_COMPLETE`（ready / error 両 reducer）/ `CONFIRM_IMPORT`
  の 3 経路でのみ `removeOrphanAssets` を自動適用する
- 識別子: `ORPHAN_ASSETS_PURGED` event、`removeOrphanAssets` 0 件時は
  identity 維持で既存 round-trip test を壊さない
- **DELETE_ENTRY / COMMIT_EDIT / QUICK_UPDATE_ENTRY / BULK_DELETE
  の経路では自動 purge しない**。理由: revision snapshot 経由の
  `RESTORE_ENTRY` が purge 済み asset を要求した時に復元不能化する
  ため（`asset-scan.ts` L37-40 の "revisions are NOT reference-counted"
  契約と整合）
- 参照: `docs/development/orphan-asset-auto-gc.md`

#### I-AutoGC2: 手動 `PURGE_ORPHAN_ASSETS` は据え置き
- 既存の手動 action は edit / delete 経路のユーザー起点掃除として
  残す。自動 GC とは共存する 2 つの GC surface

#### I-Bulk1: bulk_id は grouping tag であり restore identity ではない
- `Revision.bulk_id?: string` は「同一 bulk 操作で生まれた N 件の
  snapshot を束ねる tag」
- 単一 `RESTORE_ENTRY` の対象識別子としては使わない（従来どおり
  `lid + revision_id` で restore）
- bulk 単位の restore は **N 回の `RESTORE_ENTRY` dispatch** で実現
  する（Tier 2-2 の UI 契約）
- 新 reducer action は追加しない（`RESTORE_BULK` は未導入）
- 参照: `docs/development/bulk-restore-ui.md` §2

#### I-Merge1: merge import は Overlay (append-only) 契約
- Tier 3 で実装する merge import は **host 側 entry を absolute に
  触らない** append-only を MVP 契約とする
- imported 側の lid は常に新規採番へ rename
- update / reconcile（上書き / マージ）は **MVP では実装しない**
- 設計: `docs/spec/merge-import-conflict-resolution.md` §6.2

#### I-Merge2: merge import spec は凍結済みの正本
- `docs/spec/merge-import-conflict-resolution.md` は Tier 2-3 で正式
  spec（canonical）として固定
- Tier 3 実装時にここで扱っていない軸を新しく発見した場合は **spec
  を先に更新してから実装**する（spec-first）。実装優先で spec を
  reverse-engineer しない
- Option A（Overlay）/ B（Policy）/ C（Staging）の trade-off 判断は
  再議論しない（MVP 採用 = Option A 固定）

### 18.3 Tier 2 で固定された設計判断

| 判断 | 採用 | 不採用 |
|-----|-----|-------|
| orphan auto-GC の範囲 | B: 安全な import 経路のみ | A: 全経路自動 / C: 手動のまま |
| bulk restore UI の実装 | A: UI + 既存 `RESTORE_ENTRY` 多重 dispatch | B: 新 `RESTORE_BULK` reducer action / C: UI だけで handler なし |
| merge import の MVP 形態 | A: Overlay（append-only） | B: Policy-driven UI / C: Staging container |
| CI の lint 扱い | B: `continue-on-error` で non-blocking | A: blocking（pre-existing 80 件の lint error で CI 恒常赤化） |
| manual screenshot の取得 | Playwright + headless chromium + IPAGothic | 手動キャプチャ / SVG モック |

**これらの判断は「再議論対象外」**。新しい要件が出た時は MVP の
契約に後付け可能か（§9 将来拡張の形）を先に検討する。

### 18.4 Tier 2 で意図的にやらなかったこと（§5 の補遺）

§5 に書かれている一次リストに加えて、Tier 2 進行中に改めて **今は
やらない** と判断した事項。

#### 18.4.1 merge import の実装（Tier 3 以降）
- spec は凍結したが実装は着手していない
- **理由**: 
  - v0.1.x で実害のある衝突ユースケースが観測されていない
  - 前提条件（`docs/spec/merge-import-conflict-resolution.md` §10）
    の確認作業を 1 セッション独立で取る方が安全
  - Tier 3 の全体優先順位決定を先行させるため、着手は後段

#### 18.4.2 i18n（日英の文言統一基盤）は未着手
- UI 文言は現状も日英混在のまま
- **理由**:
  - 現時点で多言語ユーザーからの要求が出ていない
  - i18n 基盤の選定（gettext vs key-value table vs runtime lookup）
    自体が一定の設計工数。着手するなら独立した tier として設計する
  - v0.1.x の readability は IPAGothic / CSS 調整で許容範囲に到達
    済み（Tier 2 完了時点）

#### 18.4.3 DOM 局所 diff renderer は未採用
- renderer は現状 `root.innerHTML = ''` の全置換
- **理由**:
  - v0.1.x のエントリ数（典型 100 件未満）では体感遅延が無い
  - 全置換の単純さが「操作順序バグ抑止を最重要非機能要件とする」
    という原点方針（requirements 00）と整合
  - virtual DOM や incremental render の導入は 5 層構造の
    renderer 層を大きく作り直す refactor で、Tier 3 単発では収ま
    らない

#### 18.4.4 P2P / WebRTC によるマルチユーザー協調はスコープ外
- `docs/vision/webrtc-p2p-collaboration.md` に構想はある
- **理由**:
  - マルチユーザー対応は CRDT 等の conflict-free データ構造への
    拡張が必要で、Revision の linear history モデルと構造的に衝突
    する
  - 単独利用 + 配布 HTML での "snapshot 共有" が現実的にワークして
    いる
  - P2P は v1.x 以降の大型テーマ

#### 18.4.5 multi-cid（同時複数コンテナ）は未対応
- IDB は `__default__` pointer の単一 cid のみ
- **理由**:
  - 現在は export / import の 4 系統で "別コンテナへの移動" が
    表現できているため、同時存在のメリットが薄い
  - UI / selection / renderer / persistence の全層に container 参
    照を引数化する破壊的 refactor になる
  - Option C（Staging）と同じ invariant 拡張を要するため、merge
    import 実装後に一緒に検討するのが自然

### 18.5 Tier 3 への橋渡し（優先順位は付けない）

Tier 3 で候補となる方向を列挙する。**順序は未決**（本章の責務は
「選択肢の固定」であり優先順位決定は別セッション）。

> **更新 (2026-04-14)**: 優先順位は `docs/planning/TIER3_PRIORITIZATION.md`
> で確定済み。Tier 3-1 = A（merge import 実装）、Tier 3-2 = D
> （release automation）+ C の軽量部分。B / C 重い部分 / E は保留。

#### A. merge import 実装
- spec（`docs/spec/merge-import-conflict-resolution.md`）を正本として
  `features/import/merge-planner.ts` + 1 reducer action + UI radio
  を追加
- 前提条件チェックは spec §10 を使う
- **Tier 3-1 で実装完了（2026-04-14）** — §18.8 参照

#### B. archetype 拡張
- `docs/development/data-model/complex-entry-archetype.md` /
  `spreadsheet-entry-archetype.md` に先行設計あり
- 追加時は新 presenter + body-formats spec への §追加

#### C. CI 強化
- E2E テスト（Playwright baseline）導入
- bundle size budget（回帰検知）
- lint blocking 化（pre-existing 80 件 error の解消が前提）

#### D. release automation
- GitHub Release 自動作成
- `dist/pkc2.html` 自動アップロード
- `PKC2-Extensions/pkc2-manual.html` 自動同梱

#### E. 将来構想（P3 以降）
- P2P / WebRTC 同期
- multi-window 協調
- multi-cid UI
- i18n 基盤

**いずれも「Tier 3 で 1 つずつ決着させる」粒度の切り分けになって
おり、複合 Tier には跨げない**。

### 18.6 Tier 2 完了後に追加で読むべき文書

新規セッションは §13 の標準プロンプトに加えて以下を読むと、現時点
の完成面を最短で把握できる:

- `docs/spec/merge-import-conflict-resolution.md` — merge 設計の
  正本（Tier 3 前提文書）
- `docs/development/orphan-asset-auto-gc.md` — Tier 2-1 の実装メモ
- `docs/development/bulk-restore-ui.md` — Tier 2-2 の実装メモ
- `.github/workflows/ci.yml` — CI の現状（Tier 1-1）
- `docs/manual/images/README.md` — screenshot 運用（Tier 1-2）

### 18.7 Tier 2 完了確認

| 項目 | 状態 |
|-----|-----|
| Tier 1-1 CI workflow | ✓ push / PR で自動走行 |
| Tier 1-2 manual screenshot | ✓ 6 枚差し替え済み |
| Tier 2-1 orphan asset auto-GC | ✓ 3 経路 wiring 済み、テスト 8 件追加 |
| Tier 2-2 bulk restore UI | ✓ meta pane + trash panel に実装、テスト 14 件追加 |
| Tier 2-3 merge import spec | ✓ canonical spec として固定 |
| 新不変条件 5 件（I-AutoGC1 / I-AutoGC2 / I-Bulk1 / I-Merge1 / I-Merge2） | ✓ §18.2 に明記 |
| 意図的 non-done 5 件（merge 実装 / i18n / diff renderer / P2P / multi-cid） | ✓ §18.4 に明記 |
| 既存 §4 / §5 / §6 の書き換え | × 発生せず（additive のみ） |
| production code への touch | Tier 2-1 / 2-2 のみ（Tier 2-3 は docs-only） |

**Tier 2 完了**。次は Tier 3 優先順位決定（別セッション）。

### 18.8 Tier 3-1 完了（2026-04-14）

Tier 3 優先順位決定（`docs/planning/TIER3_PRIORITIZATION.md`）で
「Tier 3-1 = A. merge import 実装（Overlay MVP）」を採用。本節は
その完了記録。

| 項目 | 状態 |
|-----|-----|
| pure helper `features/import/merge-planner.ts` | ✓ `planMergeImport` / `applyMergePlan` を実装 |
| reducer action `CONFIRM_MERGE_IMPORT` / `SET_IMPORT_MODE` | ✓ 追加 |
| domain event `CONTAINER_MERGED` | ✓ 追加 |
| `AppState.importMode` field | ✓ optional で追加（default `'replace'`） |
| preview UI の mode radio + 5 行サマリ | ✓ 実装 |
| I-Merge1（append-only） / I-Merge2（spec-first） | ✓ 維持 |
| 既存 `CONFIRM_IMPORT` path | ✓ 完全に無変更（regression 0） |
| orphan auto-GC を merge 経路にも | ✓ I-AutoGC1 の自然な拡張として wiring |
| spec `data-model.md §14.6 I-IO1b` | ✓ 追記 |
| spec `merge-import-conflict-resolution.md` status | ✓ "implemented" に昇格（MVP 契約は凍結継続） |
| テスト 29 件追加（planner 13 / reducer+integration+UI 16） | ✓ 全 pass |
| 実装詳細メモ `docs/development/merge-import-implementation.md` | ✓ 新規 |
| Tier 3-1 で「spec 非スコープ」に入れる項目（per-entry 選択 UI / title hash dedup / revision 持ち込み / Policy UI / Staging / schema migration / folder semantic merge / bulk_id 越境 / 1-click revert） | × 1 つも実装せず（spec §8 固定を遵守） |

**Tier 3-1 完了**。次は Tier 3-2（release automation + bundle
size budget + Playwright smoke baseline）。

### 18.9 Tier 3-2 完了（2026-04-14）

`TIER3_PRIORITIZATION.md` で「Tier 3-2 = D + C-1 + C-2 の合併」を
採用。本節はその完了記録。production code は 1 行も触れず、すべて
CI / tooling / docs の変更。

| 項目 | 状態 |
|-----|-----|
| D. release workflow（`.github/workflows/release.yml`） | ✓ `v*` tag push で GitHub Release 自動作成、`dist/pkc2.html` + `PKC2-Extensions/pkc2-manual.html` を添付、prerelease 判定あり |
| C-1. bundle size budget（`build/check-bundle-size.cjs` + CI step） | ✓ `dist/bundle.js` 615 KB / `dist/bundle.css` 90 KB を hard fail で enforce。現状 79.8% / 78.5% |
| C-2. Playwright smoke baseline（`tests/smoke/app-launch.spec.ts` + `.github/workflows/smoke.yml`） | ✓ 1 本の smoke（boot + Text create → editing phase）を別 workflow で実行 |
| 静的サーバ `scripts/smoke-serve.cjs` | ✓ `npx http-server` の race を回避するための自前 40 行 |
| `@playwright/test@^1.56.1` を devDep に | ✓ chromium 1194 とバージョン整合 |
| 採用判断（release 別ファイル / budget hard fail / smoke 1 本 / smoke 別 workflow） | ✓ すべて `docs/development/release-automation-and-smoke-baseline.md` §1-4 に記録 |
| production code / tests への touch | × 1 行も無し（CI / tooling / docs のみ） |
| 既存 `ci.yml` の test / build / typecheck step | × 無変更（size budget を最後に追加のみ） |
| Vitest 既存 122 files / 3607 tests | ✓ regression なし |

**Tier 3-2 完了**。次は Tier 3-3 **再評価セッション**（選定のみ、
実装ではない）— B / C-3 / C-4 / E のどれに進むかをユーザー要求 /
実害の観測状況と合わせて棚卸しする。

> **更新 (2026-04-14)**: 再評価セッション完了。選定結果は
> `docs/planning/TIER3_3_REEVALUATION.md` に正本化済み。採用 =
> **C-4（lint baseline 解消）**。Tier 3-3 実装も同日完了（§18.10）。

### 18.10 Tier 3-3 完了（2026-04-14）

`TIER3_3_REEVALUATION.md` で「Tier 3-3 = C-4（lint baseline 解消）」
を採用。本節はその完了記録。production code logic は変更なし（1 か所
の `while (true) → for (;;)` 変換のみ、意味同一）。

| 項目 | 状態 |
|-----|-----|
| `.eslintrc.cjs` の adapter→features 禁止ルール撤去 | ✓ 83 errors 解消 |
| `.eslintrc.cjs` に features→adapter 禁止ルール追加 | ✓ CLAUDE.md §Architecture を lint で pin |
| `.eslintrc.cjs` に runtime→(anything) 禁止ルール追加 | ✓ 将来のドリフト予防 |
| `no-unused-vars` に `varsIgnorePattern: '^_'` 追加 | ✓ 6 errors 解消 |
| 9 件の `any` warning を eslint-disable + reason で止血 | ✓ 0 warnings |
| `ci.yml` の lint step を blocking に昇格 | ✓ `continue-on-error: true` 削除 |
| `merge-planner.ts` の `while (true)` → `for (let seq = 1; ; seq++)` | ✓ `no-constant-condition` 回避、意味同一 |
| production code への意味変更 | × 0 件 |
| 既存 3607 tests + smoke 1 件 | ✓ 全 pass |
| `§6.8 Pre-existing lint errors` を "解消済み" へ更新 | ✓ |

**これで 6 系統すべてが自動品質ゲートとして blocking に揃った**:
typecheck / lint / unit / bundle size / UI smoke / release。

**Tier 3-3 完了**。Tier 3-4 は改めて再評価対象（保留 3 群 = B / C-3
/ E の昇格条件を `TIER3_3_REEVALUATION.md §5` に記録済み）。

---

## 19. Post-v0.1.0 Editor UX Pack（2026-04-16 締め）

Tier 3-3 以降、editor UX を小さな安全境界ごとに順次前進させた
一連のテーマ群をここにまとめる。いずれも production code touch は
限定的で、**spec → feasibility → contract → implementation → audit →
manual** という review 駆動の順序を守って積み上げた。

### 19.1 完了テーマ（§1 S-24〜S-28 の正式記録）

| ID | 内容 | 種別 | 主要 surface |
|----|-----|-----|-------------|
| S-24 | Export HTML を開いた時に IDB より pkc-data を優先する boot 順序修正 | bugfix | `src/main.ts §11`、新規 `pkc-data-source.ts` |
| S-25 | HTML paste 時に anchor を Markdown リンク `[label](url)` に正規化 | 追加 | `adapter/ui/action-binder.ts handlePaste`、新規 `html-paste-to-markdown.ts` |
| S-26 | current TEXT entry body の最小 Find & Replace ダイアログ | 追加 | 新規 `text-replace-dialog.ts`、pure helper `features/text/text-replace.ts` |
| S-27 | Find & Replace に Selection only 拡張（open 時 snapshot） | 追加 | `text-replace.ts` に range 版 helper 追加、`text-replace-dialog.ts` 拡張 |
| S-28 | textlog-replace v1（current log only、metadata 不変） | 追加 | 新規 `textlog-log-replace-dialog.ts`、`textlog-presenter.ts` に 🔎 trigger、action-binder |

### 19.2 並行で追加した補助 spec / dev doc / manual

- **補助 spec**（`docs/spec/`）:
  - `find-replace-behavior-contract.md`（TEXT v1.1）
  - `textlog-replace-feasibility-and-minimum-scope.md`
  - `textlog-replace-v1-behavior-contract.md`
  - `textlog-text-conversion-policy.md`（H-8 補完、TEXTLOG→TEXT 変換ポリシー）
  - `provenance-relation-profile.md`（H-8 補完、provenance Relation の v1 profile）
- **dev doc**（`docs/development/`）:
  - `archived/singletons/html-paste-link-markdown.md`
  - `archived/singletons/text-replace-current-entry.md`
  - `archived/textlog-replace/textlog-replace-current-log.md`
  - `archived/textlog-replace/textlog-replace-current-log-audit.md`（S-28 post-impl invariance audit、欠陥 0）
  - `archived/boot-container-source/boot-container-source-priority.md`
- **manual 同期**: 2 回
  - TEXT 側 UX（paste link / Find & Replace / boot priority）
  - textlog 側 UX（per-log Find & Replace）
- **00_index.md**: 上記補助 spec のエントリを追加（第 0 群に 5 行追加）

### 19.3 安定化済み（selected lines に進む前提として OK）

- TEXT body Find & Replace（v1.1 contract 固定、Selection only 搭載）
- textlog per-log Find & Replace（v1 contract 固定、metadata 不変を audit で確認済み）
- HTML paste の link 正規化（TEXT body 限定）
- Export HTML の Container 優先表示（boot priority 修正）
- pure helper `features/text/text-replace.ts` は TEXT / textlog 両 UI から共有可能、追加テーマで再利用できる

### 19.4 次候補（推奨順）

#### 候補 1: **textlog-replace v1.x 候補 — log 内 Selection only**

- 位置: 既存 textlog v1 contract の additive 拡張。contract §8.2 で「v1.x 候補」として明示済み
- 利点: pure helper（`countMatchesInRange` / `replaceAllInRange`）は既に存在、UI 追加だけで済む
- 危険: 小、TEXT 側と対称な Selection only 挙動を再利用できる
- 推奨度: **高**（次の実装テーマとして最も自然）

#### 候補 2: **textlog replace の粒度 C 前段調査（whole textlog）**

- 位置: contract §8.2「v2 別契約」。まず docs-only で preview UI / undo 戦略 / cross-log regex 挙動を整理
- 利点: 価値は高い（複数 log 一括置換）
- 危険: 中〜高。影響範囲が広く、event / dispatch / regex scope の設計が別途必要
- 推奨度: **中**（実装に入る前に feasibility + contract をもう 1 ラウンド挟む必要あり）

#### 候補 3: **別系統 UX 改善**

- TEXT / textlog から離れた任意の polish（例: calendar / kanban 操作、export/import UX、検索 UX の追加 polish 等）
- 推奨度: **低〜中**（replace 系の棚卸しが終わったので再評価の余地あり）

#### 候補 4: **global replace / broader replace**

- 位置: contract §3.4 / §8.2 の終端候補
- 推奨度: **保留**（v1.x / v2 の段階を経てから、慎重に）

### 19.5 意図的にまだやっていないこと

- **textlog selected lines replace**（粒度 B）: feasibility §3.2 で conversion selection との UI 二重用途化を懸念、v1.x 候補としても後回し
- **textlog whole textlog replace**（粒度 C）: 候補 2 と同じ
- **cross-entry / cross-archetype replace**: contract §3.4
- **global replace**: 本 handover §19 の候補 4
- **他 archetype（todo / form / folder description）への replace 展開**: archetype 別の body 構造が異なり、個別 contract が必要
- **Replace next / Replace prev navigation**: TEXT / textlog 両 v1 contract で v1 非対象
- **hit position highlight**: 両 contract で v1 非対象
- **Selection only for textlog v1**（log 内範囲限定）: textlog v1 contract §4.2、v1.x 候補として切り出し待ち

### 19.6 次テーマ選定の判断基準

- **進めて良いテーマ**: 既存 contract の additive 拡張 / invariance 契約を壊さない小改善
- **docs-only で先行させるテーマ**: 粒度 C / cross-entry / global など、UI / 影響範囲の再議論が必要なもの
- **まだ保留**: global replace、別 archetype 展開、transport / P2P 拡張

---

## 20. Boot policy revision + H-10 merge-conflict-ui v1（2026-04-17 締め）

§19 の Editor UX Pack に続き、**boot 契約の structural 強化**と **merge
import の entry 単位 conflict UI**を docs-first パイプラインで閉じた。
いずれも「contract → 実装 → audit → manual」の順序を守り、slice ごとに
scope を厳守した。

### 20.1 完了テーマ（§1 S-30 / S-31 の正式記録）

| ID | 内容 | 種別 | 主要 surface |
|----|-----|-----|-------------|
| S-30 | Boot source policy revision（embedded pkc-data は view-only / IDB 拡張は明示 Import のみ） | 強化 + audit + manual | `chooseBootSource` 拡張 + `viewOnlySource` state / save ガード + 明示 Import 7 経路 clear + boot chooser overlay |
| S-31 | H-10 merge-conflict-ui v1（behavior contract → pure / state / UI 3 slice → audit → manual） | contract + 3 slice + audit + manual | `features/import/conflict-detect.ts`、`app-state.ts` 3 reducer case、`renderer.ts` conflict section、`action-binder.ts` 4 handler（うち set-import-mode で wiring） |

### 20.2 並行で追加した補助 spec / dev doc / manual

- **behavior contract**（新規、単一ファイル統合済み）:
  - `docs/spec/merge-conflict-ui-v1-behavior-contract.md`（§0〜§12、775 行）
  - supervisor 確定事項 2 点: (1) multi-host 代表 = `updatedAt` 最新 + tie-break array index 昇順 (2) `contentHash` 入力 = `body + archetype`（title は分類軸なので除外）
  - I-MergeUI1〜I-MergeUI10 の不変条件固定
- **dev doc**（`docs/development/`）:
  - `archived/boot-container-source/boot-container-source-policy-revision.md`（S-30 実装 spec）
  - `archived/boot-container-source/boot-container-source-policy-audit.md`（S-30 audit、欠陥 0）
  - `archived/merge-conflict/merge-conflict-pure-slice.md`（pure 実装メモ）
  - `archived/merge-conflict/merge-conflict-state-slice.md`（state 実装メモ）
  - `archived/merge-conflict/merge-conflict-ui-v1-audit.md`（全 3 slice 統合監査、DEFECT-1 / DEFECT-2 最小修正記録）
- **manual 同期**: 2 回
  - boot 側（chooser / view-only）→ 07 / 09
  - H-10 側（Merge mode と conflict 解決 UI / troubleshooting 3 件 / 用語集 3 件）→ 07 / 09
- **core / state 追加（additive）**:
  - `RelationKind = 'provenance'` が merge-duplicate 用途として稼働開始（既に H-8 spec で予約済み）
  - `AppState.viewOnlySource: boolean`（S-30）
  - `AppState.mergeConflicts` / `mergeConflictResolutions`（S-31）
  - `CONTAINER_MERGED` event に `suppressed_by_keep_current[]` / `suppressed_by_skip[]` 追加
  - いずれも SCHEMA_VERSION 変更なし

### 20.3 安定化済み（次の builder として前提にしてよい）

- **Boot 契約**: Export HTML を開いても受信者の IDB workspace は構造的に上書きされない。IDB 拡張は明示 Import でのみ許可（§20 audit で欠陥 0 を確認）
- **Merge import conflict UI v1**: entry 単位の C1 / C2 / C2-multi 分類、3 操作（Keep current / Duplicate as branch / Skip）、bulk shortcut、Confirm merge gate、provenance relation append までが contract + audit で固定
- pure helper `src/features/import/conflict-detect.ts` は再利用可能（今後の merge 系拡張、例えば relation-level conflict / revision 持込などの基盤になる）

### 20.4 次候補（推奨順）

#### 候補 1: **直近完了群の棚卸し後、待機テーマから 1 件選定**

supervisor が台帳 §3 を見て以下のいずれか 1 件を昇格する想定。

- **B-3 Slice β/γ**（quote assist の empty exit / bulk prefix toggle / entry-window 同期） — CONDITIONAL、実 user 報告があれば昇格
- **C-1 revision-branch-restore** — `prev_rid` / `content_hash` 下地（H-6）は既に敷設済み、pain が顕在化したら着手
- **C-1 revision-branch-restore** — `prev_rid` / `content_hash` 下地（H-6）は既に敷設済み、pain が顕在化したら着手
- **C-P1 textlog-viewer-and-linkability-redesign** — TEXTLOG を addressable な時系列文書に再定義（大きいので feasibility 先行）
- ~~**C-2 entry-ordering-model**~~ / ~~**C-3 link-index-entry**~~ — **完了済み（§21 参照）**

#### 候補 2: **H-10 v1.x 候補**（実運用で pain が出たら）

- conflict UI のキーボード操作拡張（J/K で行移動、Space でバッジ展開など）
- body preview の diff 表示（v1 は side-by-side のみ、diff は非対象）
- conflict UI の keyboard focus / accessibility 強化

#### 候補 3: **重いテーマ（まだ後ろ）**

- whole-textlog replace（粒度 C）
- global replace（cross-entry）
- merge import §9 将来拡張（policy UI / staging / revision 持込 / diff export / merge undo）

### 20.5 意図的にまだやっていないこと

- **merge import の §9 将来拡張全般**: H-10 v1 は「entry 単位の 3 操作 + bulk + gate」に閉じている。relation / revision 持込、staging、policy 永続化、diff export、undo は v1.x / v2 で別契約
- **accept-incoming（host 上書き）操作**: I-MergeUI1（host absolute preservation）/ I-Merge1（append-only）に違反するため v1 では不採用。duplicate-as-branch + 手動 delete が代替
- **semantic merge / field-level cherry-pick**: archetype 別に別契約が必要なため v1 非対象
- **attachment binary diff**: content 同一判定は `asset_key` 一致に限定、バイナリ差分は v1 非対象

### 20.6 運用メモ

- 本節（§20）以降の追加は、新テーマ 1 件が **contract → 実装 → audit → manual** の全段を閉じた時点で新しい節（§21 以降）として追記する
- 途中段階では §19 / §20 に追記せず、dev doc と ledger §1 のみ更新する運用を継続

---

## 21. C-2 entry-ordering v1 + C-3 link-index v1（2026-04-17 締め）

§20 の boot policy revision + H-10 完了に続き、**data model extension 系の 2 テーマ**を
docs-first pipeline（minimum scope → contract → 実装 → audit → manual）で完了させた。

### 21.1 完了テーマ（§1 S-32 / S-33 の正式記録）

| # | テーマ | パイプライン段階 | 主要成果物 |
|---|---|---|---|
| S-32 | C-2 entry-ordering v1（サイドバー手動並び替え） | 全 6 段 + F-1/F-2 修正 | `entry_order: string[]` additive optional in Container.meta / `MOVE_ENTRY` user action / `applyManualOrder` pure helper / renderer Manual セレクタ + ↑/↓ ボタン |
| S-33 | C-3 link-index v1（entry 間参照インデックス） | 全 6 段 + audit 欠陥 0 | `buildLinkIndex(container)` runtime-only / meta pane Outgoing + Backlinks + Broken 3 section / AppState・schema 変更なし |

### 21.2 共通方針（両テーマ）

- **docs-first**: minimum scope（feasibility）→ behavior contract → 実装 → audit → manual の 6 段 pipeline
- **最小差分**: 既存 reducer / AppState / schema を尊重。additive optional のみ
- **完全 pipeline 閉鎖**: audit + manual sync まで行い「実装あるのに manual なし」状態を回避

### 21.3 C-2 entry-ordering v1 詳細

**実装範囲**:
- `Container.meta.entry_order?: string[]`（additive optional、SCHEMA_VERSION 据え置き）
- `MOVE_ENTRY { lid, direction: 'up'|'down' }` user action + reducer
- `applyManualOrder(entries, order)` pure helper（features 層）
- renderer: Manual ソートセレクタ + 選択中エントリに ↑/↓ ボタン（Detail / 非 readonly / 非 Import preview 限定）
- audit で FINDING-1（ルート/フォルダ混在時の index 計算）/ FINDING-2（削除済 LID が order に残留）を最小修正

**テスト**: pure order helper + reducer + UI の計 3 テストファイル、全 passed

**新規 spec / dev doc**:
- `docs/spec/entry-ordering-v1-minimum-scope.md`
- `docs/spec/entry-ordering-v1-behavior-contract.md`
- `docs/development/archived/v1-audits/entry-ordering-v1-audit.md`

**manual 同期**: `docs/manual/05_日常操作.md`（Manual Order 節）/ `docs/manual/09_トラブルシューティングと用語集.md`（4 件 + Manual Order 用語）

### 21.4 C-3 link-index v1 詳細

**実装範囲**:
- `buildLinkIndex(container): LinkIndex`（features 層 pure helper、runtime-only）
- `LinkRef` / `LinkIndex` / `LinkSourceArchetype` 型（features 層、AppState / Container に追加なし）
- `extractEntryReferences(markdown)` の流用（entry-ref 既存 helper）
- renderer `renderMetaPane` に `renderLinkIndexSections` / `renderLinkRefsSection` を追加
- Outgoing / Backlinks / Broken の 3 セクション（`data-pkc-region` selector 規約、§4.6 準拠）
- broken 行: `data-pkc-broken="true"` マーカー + click なし。resolved 行: 既存 `select-entry` 導線を再利用

**audit**: 欠陥なし。scope narrowing 2 件（selected-entry スコープ / open-link-index-broken ボタン未実装）を記録

**テスト**: pure helper 20 件 + UI 9 件（4059→4068 +9）、全 passed

**新規 spec / dev doc**:
- `docs/spec/link-index-v1-minimum-scope.md`
- `docs/spec/link-index-v1-behavior-contract.md`
- `docs/development/archived/v1-audits/link-index-v1-audit.md`

**manual 同期**: `docs/manual/05_日常操作.md`（リンクインデックス節）/ `docs/manual/09_トラブルシューティングと用語集.md`（TS 4 件 + 用語 2 件）

### 21.5 次候補（推奨順）

§20.4 の更新に連動:

1. **C-1 revision-branch-restore** — `prev_rid` / `content_hash`（H-6）の下地は既に敷設済み。分岐復元の user pain が顕在化したら着手
2. **C-P1 textlog-viewer-and-linkability-redesign** — TEXTLOG を addressable な時系列文書に再定義。規模が大きいため feasibility spec 先行推奨
3. **B-3 Slice β/γ**（quote assist の empty exit / bulk prefix toggle）— CONDITIONAL、user 報告があれば昇格
4. **heavy テーマ**（whole-textlog replace / global replace / merge §9 拡張）— まだ後

### 21.6 運用メモ

- 本節（§21）以降の追加は §20.6 の運用ルールを継続（全段 pipeline 閉鎖後に新節追記）
- C-2 / C-3 の §3 待機候補は「完了済み」に更新済み（LEDGER §3.3 参照）

---

## 22. Recent Waves Addendum（2026-04-18..2026-04-21 追補）

§21 締めの 2026-04-17 以降、**docs-first pipeline を個別テーマに適用するのをやめ**、
relations / references / provenance / orphan / P1–P5 / hook subscription / transport /
dead-path maintenance を連続で流し込む **短 PR wave** に方針を切り替えた。
本節は **2026-04-21 時点の handover addendum** であり、§1–§21 の本文は書き換えない。
詳細は個別 docs を参照する方針で、ここではポインタと境界だけを残す。

### 22.1 wave サマリ

| wave | テーマ | 代表 doc | 状態 |
|---|---|---|---|
| Relations / Backlinks | backlinks panel / sidebar badge + jump / relation delete + kind edit / Unified Backlinks (Option E) / References summary v2 + clickable v3 | `../development/unified-backlinks-v1.md` 他 9 本 | **landed** |
| Provenance metadata | viewer v1 → pretty-print v1.x → copy/export v1 | `../development/provenance-metadata-{viewer,pretty-print,copy-export}-v1.md` | **landed** |
| Unified Orphan Detection v3 | S1 draft → S2 contract → S3 `buildConnectednessSets` → S4 sidebar marker | `../development/unified-orphan-detection-v3-contract.md` / `connectedness-s{3,4}-v1.md` | S1–S4 **landed** / **S5 filter = Defer** |
| P1–P5 | Recent Entries Pane / Breadcrumb Path Trail / Entry Rename Freshness Audit / Entry-window title live refresh / Saved Searches / Extension Capture | `../development/recent-entries-pane-v1.md` 他 7 本 | P1–P4 + P3 follow-up **landed** / **P5 は docs-only draft（receiver 実装 pending）** |
| Hook subscription | review / PoC / acceptance / **decision** | `../development/pkc-message-hook-subscription-decision.md`（canonical） | **Defer**（simpler proof path = polling 等を優先） |
| Transport record | `record:accept`/`record:reject` consistency review + sender-only decision | `../development/transport-record-{accept-reject-consistency-review,reject-decision}.md` | **landed**（PR #45 / #47 で解消） |
| Dead-path maintenance | round 1–5 + 2 decision doc + relations wave 後の dead-code inventory | `../development/dead-{path-cleanup-inventory-0{1..5},code-inventory-after-relations-wave,path-decision-*}.md` | **landed** |

### 22.2 現在 active な candidate（2026-04-21）

**P5 Extension Capture（receiver side）のみ**。

- 現状: `../development/extension-capture-v0-draft.md` が docs-only draft（`record:offer` 再利用 Option B 推奨）
- 次の 1 PR: `docs/spec/record-offer-capture-profile.md` を docs-only で策定（payload spec を固定）
- その後: receiver 実装（transport 拡張 / reducer capture action / provenance attach / origin allowlist / size cap / tests）
- arch risk: medium（transport 契約拡張 + 外部由来 sanitization）

他の候補（S5 orphan filter / hook subscription 実装 / Calendar Phase 2 / Shift+Arrow range / graph visualization / telemetry）は **すべて Defer**。

### 22.3 Defer 済みの決定（本節で confirm）

| 項目 | canonical reference | 昇格条件 |
|---|---|---|
| S5 Orphan filter | `../development/unified-orphan-detection-v3-contract.md §7.4` | "orphan 一覧だけを取り出したい" の実需が明示されたとき |
| Hook subscription 実装 | `../development/pkc-message-hook-subscription-decision.md` | simpler proof path（polling 等）が実用価値を示し、hook 追加投資に釣り合う pain が具体化したとき |
| Graph visualization | `next-feature-prioritization-after-relations-wave.md §1` の前提 | 本 memo 以降は前提にしない |
| Telemetry | 同上 | 同上 |

### 22.4 §3 / §5 / §6 / §7 との関係

- §3「設計の現在地」: relations / references / provenance 表示面が強化され、meta pane 側に References umbrella が登場した点を除き、アーキテクチャ層は不変
- §5「意図的にやっていないこと」: 本節 §22.3 の 4 項目を **Defer として追加**（本文は touch しない）
- §6「既知の制約」: 変更なし（P1–P4 で個別制約が足されたわけではなく、いずれも derived-only / additive optional に閉じた）
- §7「次にやるべきこと」: **active candidate は §22.2 の 1 本のみ**。§7 の古い優先順位リストは本節で overridable

### 22.5 運用メモ（§22 以降）

- 本節は 2026-04-21 時点の **addendum**（補遺）であり、§1–§21 の本文を書き換えない
- 次の大きなフェーズ（v0.1.0 超えの breaking change を伴う判断）に入る時に §22 を吸収して新しい canonical handover に再編集する
- それまでは wave 単位の記録は `USER_REQUEST_LEDGER.md §1.1`（retrospective 一括追記）+ `../development/INDEX.md §COMPLETED`（#79–#116）+ `../planning/00_index.md §第5群 末尾`（2026-04-18〜21 wave）を一次資料とする

### 22.6 関連文書（本 addendum の pointer）

- `USER_REQUEST_LEDGER.md §1.1` — S-34〜S-51 retrospective（本 wave の 1 行サマリ一覧）
- `../development/INDEX.md` §COMPLETED — #79–#116（wave 別の詳細行）
- `../planning/00_index.md` §第5群 末尾 — nav seam（recent wave への入口）
- `next-feature-prioritization-after-relations-wave.md` — wave 直前の軸選定 memo（§22.2 の根拠）
- `extension-capture-v0-draft.md` — §22.2 active candidate の設計 draft

---

## 23. UI Continuity Wave Closure（2026-04-22 締め）

§22 の直後に、**ユーザ報告 7 件**を起点とする UI continuity 連鎖修正 wave（2026-04-22）が走り、
docs-first investigation → 最小 PR × 複数本 で閉じた。本節はその closure record。
§1–§22 の本文は書き換えない。

### 23.1 wave 全体サマリ

| cluster | 症状 | 代表 PR | 状態 |
|---|---|---|---|
| B | TEXTLOG checkbox / HTML 許可 checkbox 起点の scroll reset | #99 | **merged** |
| C | Sidebar Recent Entries pane が畳んでも再 render で開き直す | #100 | **merged** |
| A | Storage Profile overlay が menu close の re-render で即消滅 | #101 | **merged** |
| C' | Folder が SELECT_ENTRY 起因で "勝手に全開" する | #103 (first wave) + #104 (lockdown) | **merged** |
| D | Child window（pop-out 編集）で Ctrl+S / Escape 等のショートカットが効かない | #105 (first slice: Ctrl+S / Escape) | **merged** |
| E（low-risk optimization） | `buildLinkIndex` の 1-render-1-call 統一 | #102 | **merged** |

investigation-only PR として残す:

| cluster | 調査結果 PR | 状態 |
|---|---|---|
| C' follow-up 判定 | 調査は #104 本文で決定（全 6 経路 reveal 不要の lockdown）| コードに固定済み |
| D follow-up（Ctrl+; 等）| 実需待ち、本 PR 時点で未起票 | defer |

### 23.2 ユーザ報告との対応表（再掲 + final state）

| # | 症状 | 状態 | 対応 PR |
|---|---|---|---|
| 1 | ストレージプロファイルが見られない | **resolved** | #101 |
| 2 | メニュー全体のイベント導線が壊れている疑い | **largely addressed**（root cause = storage profile overlay renderer-ownership 違反。#101 で除去済み。全面 event-wiring 監査は defer） | #101（主因）|
| 3 | TEXTLOG チェックリストで画面が上に戻る | **resolved** | #99 |
| 4 | HTML 許可 checkbox で画面が上に戻る | **resolved** | #99 |
| 5 | ダブルクリックの編集ウィンドウでショートカットが使えない | **resolved**（first slice: Ctrl+S save / Escape cancel）| #105 |
| 6 | Recent pane を畳んでもすぐ開く | **resolved** | #100 |
| 7 | フォルダが勝手に全開する | **resolved**（外部 jump 2 経路のみ opt-in、残り 20 経路は lockdown）| #103 + #104 |

**結論**: 6/7 完全解消 + 1/7 主因除去。UI continuity wave は事実上クローズ。

### 23.3 新規 runtime-only state（本 wave で追加、すべて additive）

`AppState` interface の optional field として以下 2 つを新規追加。persistence 非対象（`SAVE_TRIGGERS` に載せない）:

| field | 用途 | 追加 PR |
|---|---|---|
| `recentPaneCollapsed?: boolean` | Recent Entries pane の畳み状態 | #100 |
| `storageProfileOpen?: boolean` | Storage Profile overlay の表示状態 | #101 |

同じく `UserAction` union に以下 4 つを additive 追加:

| action | 用途 | 追加 PR |
|---|---|---|
| `TOGGLE_RECENT_PANE` | recent pane 畳み toggle | #100 |
| `OPEN_STORAGE_PROFILE` / `CLOSE_STORAGE_PROFILE` | storage profile 駆動 | #101 |
| `SELECT_ENTRY.revealInSidebar?: boolean` | ancestor folder auto-expand opt-in | #103 |
| `NAVIGATE_TO_LOCATION.revealInSidebar?: boolean` | 同上（parity）| #103 |

いずれも既存 fixture 互換の optional。core / features / runtime / builder は不変。

### 23.4 §5 / §7 / §22 との関係

- **§5（意図的にやっていないこと）**: 本 wave で変更なし。「overlay/pane を renderer が所有すべき」という暗黙 invariant が state-driven overlay の形で明文化されただけ（§22.3 の Defer 4 項目とも衝突しない）
- **§7（次にやるべきこと）**: §22.2 で示した active candidate = P5 Extension Capture receiver side は依然変わらず。本 wave は独立 track で進行
- **§22 Recent Waves Addendum**: wave サマリ表には加筆しない（本 §23 が 2026-04-22 分の closure record を担う）

### 23.5 残件 / follow-up

| 項目 | 状態 | 昇格条件 |
|---|---|---|
| **Menu 全体の event wiring 全面監査** | 主因除去済、defer | storage profile 以外で類似 "overlay wipe" 現象が報告されたとき |
| **Child window shortcut slice 2+**（Ctrl+; 日時挿入 / Ctrl+Enter TEXTLOG append 等）| 未起票 | 実機要請が具体化したとき |
| **Artifact-size 本格最適化**（renderer 分割 / dead-export audit 等）| 別トラック | 継続的な低リスク pass で進める |
| **Dead-export audit**（`src/features/` 208 exports の cross-reference）| 別トラック | |
| **Folder auto-expand 後追い経路追加**（calendar / kanban の view 切替時など）| 現状 lockdown 済、実需待ち | ユーザから "tree で見えなくて困る" が挙がったとき |

### 23.6 次フェーズ入口（active candidate）

以下 3 つが次の 1 PR 候補として並ぶ。いずれも本 wave の outflow として自然:

1. **Manual / docs への反映**（UI continuity wave closure をマニュアル側にも同期）
2. **P5 Extension Capture receiver 実装**（§22.2 の本命、本 wave と独立 track）
3. **Artifact-size low-risk pass 2**（`RecordAcceptPayload` docs-first 削除 + `buildInboundCountMap` shared 化などの小 win を束ねる）

**次 UX wave の design contract**: `../development/todo-editor-in-continuous-edit-wave.md` — Todo add / Editor-in / TEXTLOG dblclick revision / child window continuous edit を 5 slice に分解した docs-only 契約（2026-04-22 策定）。本 wave と並行で実装 slice に入れる。

### 23.7 関連文書（本節の pointer）

- `USER_REQUEST_LEDGER.md §1.2` — S-52〜S-58 retrospective（本 wave の 1 行サマリ一覧）
- `../development/INDEX.md` §COMPLETED — #117〜#123（本 wave の詳細行）
- `../planning/00_index.md` §第5群 末尾 — nav seam（"2026-04-22 UI continuity wave" 小節）

---
