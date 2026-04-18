# Link Index — v1 Minimum Scope (Feasibility Spec)

Status: DRAFT
Created: 2026-04-17
Category: C. Data Model Extensions（ナビゲーション UX 寄り）
Predecessor: `docs/development/data-model/link-index-entry.md`（CANDIDATE、2026-04-12）
Purpose: C-3 link-index の **v1 最小仕様** を固定し、docs → contract → pure → state → UI → audit → manual の docs-first pipeline の入口を確定する

---

## 0. 本書の位置づけ

本書は C-3 テーマの **v1 minimum scope** を 1 本で定める **補助 spec** である。behavior contract ではなく feasibility + 最小 scope の固定（`entry-ordering-v1-minimum-scope.md` / `merge-import-conflict-ui-minimum-scope.md` と同格）。

- 本書の役割: **v1 で何を扱い／何を扱わないか** を確定する
- 本書承認後に `link-index-v1-behavior-contract.md` を別ファイルで起こす
- implementation spec ではない。reducer / UI / DOM selector の決定は contract 段階で行う

## 0.1 関連 doc

| doc | 関係 |
|-----|-----|
| `docs/development/data-model/link-index-entry.md` | 前身 CANDIDATE。専用 archetype 案だったが v1 では不採用（§6） |
| `docs/spec/body-formats.md §10` | entry 参照記法（`entry:<lid>` / `[label](entry:...)` / `![](entry:...)` / fragment 付き） |
| `docs/spec/data-model.md §5` | `Relation` / `RelationKind`。v1 対象外の切り分け根拠 |
| `src/features/entry-ref/extract-entry-refs.ts` | `entry:` 参照抽出の pure helper。v1 でも流用 |
| `src/adapter/ui/transclusion.ts` | embed の missing guard。broken 判定の source of truth を共有 |
| `src/features/search/*` | filter / sort / sub-location-search。非干渉境界 |

---

## 1. 目的と位置づけ

### 1.1 なぜ別テーマか

replace（S-26〜S-28）→ merge（H-10）→ ordering（C-2）と続いたことで、PKC2 は「構造化して扱う」基盤を一段強めた。次に残る弱点は **エントリ間の辿りやすさ**。

現状、entry から他 entry への参照は描画時に clickable link として展開されるが、「**どこから参照されているか**」を知る手段が無い。broken link（target LID が存在しない）もレンダー時に placeholder として出るだけで、container 全体として一覧する手段が無い。結果、wiki 的な運用と保守（hub entry を特定する・broken を直す）が user 側に委ねられている。

link-index は user 価値が高い一方、データモデルや search / relation 周辺に手を入れると事故面が広い。docs-first で **最小 scope を先に固定** する手順が安全である（revision-branch-restore や textlog viewer redesign より軽く切りやすい）。

### 1.2 既存機能との関係

| 既存サブシステム | v1 link-index との関係 |
|---|---|
| `entry:<lid>` 参照 / embed（`body-formats.md §10`） | **データソース**。抽出は `extractEntryReferences` を流用 |
| `Relation`（structural / categorical / semantic / temporal / provenance） | v1 は **対象外**（tree / tag / provenance UI で既に可視化済み、意味論が違う） |
| transclusion の missing guard | broken link 判定の **同じ source of truth**（`container.entries` の存在チェック）を使う |
| `features/search/*`（filter / sort / sub-location-search） | **独立**。search の hit を link-index に混ぜない、逆も無し |
| entry-ordering v1（C-2） / merge v1（H-10） | **独立**。ordering / merge を一切 touch しない |
| revision / provenance | **独立**。revision 生成や `prev_rid` / `provenance` Relation に影響しない |

---

## 2. 問題定義

### 2.1 現状の pain

- 「この entry を参照している他の entry は？」に答える UI が無い
- broken link は描画時に "missing entry: …" placeholder として出るが、**container 全体で一覧する手段が無い**（修復のきっかけが user 側に無い）
- 参照の多い hub entry と孤立 entry の区別がつかない
- wiki 的なナビゲーション運用が成立しない

### 2.2 どの link を index 対象にするか（v1 の決定）

v1 は **markdown body 内の `entry:<lid>` 参照** に限る:

| 形式 | 参照源（source body） | v1 で扱うか |
|---|---|---|
| `entry:<lid>`（bare） | text / textlog log / folder description / todo description の markdown | ○ |
| `[label](entry:<lid>)` | 同上 | ○ |
| `[label](entry:<lid>#<fragment>)` | 同上 | ○（fragment は捨てて target LID だけ index 化） |
| `![](entry:<lid>)` / `![alt](...)` | 同上 | ○（embed も「参照 1 件」として同列にカウント） |
| `Relation`（structural / categorical / semantic / temporal / provenance） | entry ↔ entry の typed edge | × 対象外（既存 UI で可視化済み、意味論が違う） |
| 外部 URL リンク `http(s)://...` | markdown | × 対象外 |
| `asset:<key>` | markdown | × link ではなくアセット参照のため対象外 |

### 2.3 backlink / outgoing / broken のどこまで v1 に含めるか

| 軸 | v1 | 備考 |
|---|---|---|
| **outgoing** | ○ | 選択中 entry から出る `entry:` 参照の一覧 |
| **backlinks** | ○ | 選択中 entry を指している他 entry の一覧 |
| **broken (unresolved)** | ○ | container 全体で target lid が存在しない `entry:` 参照 |
| **orphan entry 一覧** | × | backlink が 0 件、という派生情報から user が読める。v1 専用 UI は不要 |

---

## 3. v1 scope

### 3.1 対象 entry archetype

markdown を body に持つもの:

- `text`
- `textlog`（log 単位の body を scan、log 粒度で source を識別）
- `folder`（description が markdown）
- `todo`（description のみ scan、status / date は非対象）

対象外: `form` / `attachment` / `generic` / `opaque`（body が markdown でない）。

### 3.2 対象 link 種別

§2.2 のとおり **markdown body 内の `entry:` scheme** の全形式（bare / link / embed / fragment 付き）のみ。Relation 系は対象外。

### 3.3 runtime index か persisted index か

**runtime index（選定）**:

- `buildLinkIndex(container): LinkIndex` を features 層で pure 関数として実装
- container が変わるたびに **再計算**（memoization は adapter 側で任意）
- `Container` schema には一切 touch しない（SCHEMA_VERSION 据え置き）
- persistence / versioning / migration の負債を負わない

**不採用: persisted index**（`Container.meta.linkIndex?` 等）

- 理由: container mutation のたびに同期責務が発生、stale index / orphan index のリスク、schema_version 昇格が必要

### 3.4 どこに表示するか（方向性のみ、詳細は contract で確定）

- **選択中 entry の meta pane** に「Outgoing (N)」「Backlinks (M)」セクションを追加
- **container 全体の broken link 一覧** は meta pane 内セクションまたは専用ダイアログ（contract で確定）
- 既存 meta pane の構成（revision list / relation list / tag 等）は一切変更しない

---

## 4. 最小機能

v1 で実装するのは以下 3 つのみ:

1. **Outgoing links** — 選択中 entry の body から出る `entry:` 参照を一覧
   - 表示: target lid / title（解決できた場合） / broken フラグ
2. **Backlinks** — 選択中 entry を指している他 entry の一覧
   - 表示: source lid / source title / source archetype（textlog は log 単位）
3. **Broken links 全体一覧** — container 全体で target lid が存在しない `entry:` 参照を発見
   - 表示: source lid / broken target 文字列

以下は「似ているが v1 には入れない」機能（§6 と重複しないもの）:

- orphan entry 一覧（backlink 件数で代替）
- 参照数ランキング / hub centrality
- Outgoing と Backlinks の種別 grouping（link / embed / fragment の区別）

---

## 5. invariants

link-index v1 は既存契約を以下のとおり保つ。

- **I-LinkIdx1（read-only derivation）**: index は container を一切 mutate しない。pure 関数の出力のみ
- **I-LinkIdx2（schema 不変）**: `Container` / `Entry` / `Relation` / `Revision` の schema に追加フィールドを作らない。SCHEMA_VERSION 据え置き
- **I-LinkIdx3（relation 非干渉）**: `Relation` の作成・削除・kind 変更を行わない
- **I-LinkIdx4（revision 非干渉）**: revision 生成 / restore / `prev_rid` / `content_hash` に影響しない
- **I-LinkIdx5（provenance 非干渉）**: `provenance` Relation の生成・解釈を変えない
- **I-LinkIdx6（readonly / lightSource 整合）**: index 表示は readonly / lightSource / viewOnlySource モードでも可視（read-only 派生値のため）。編集操作は v1 に無い
- **I-LinkIdx7（search 非干渉）**: `searchQuery` / `archetypeFilter` / `tagFilter` / `sortKey` と independent。search の hit を link-index に混ぜない / index が filter 結果を書き換えない
- **I-LinkIdx8（ordering 非干渉）**: `entry_order`（C-2）/ manual ordering に触らない
- **I-LinkIdx9（merge 非干渉）**: merge preview / conflict resolution（H-10）は link-index の対象外
- **I-LinkIdx10（broken 判定の一意性）**: broken の判定は transclusion の missing guard と同じ「target lid が `container.entries` に存在するか」のみを使う。独自の正規化を増やさない

---

## 6. 非対象（v1 で明示的に除外）

以下は v1 では扱わない。v1.x 以降のテーマ候補:

- **semantic link inference**（類似度 / NLP による link 推薦）
- **graph visualization**（ノード・エッジ描画、force layout 等）
- **cross-container federation**（他 container への link）
- **auto-fix**（broken link の自動修復 / rename 追従）
- **orphan entry 専用 view**（backlink 0 件 = orphan という派生情報のみで v1 は足りる）
- **Relation-kind 別 index**（structural / categorical 等での filter / grouping）
- **`[[wiki link]]` 記法の新設**（`body-formats.md` に現状無い）
- **外部 URL 検証**（HTTP HEAD 等）
- **変更差分 refresh**（v1 は都度再計算で十分）
- **link 数ランキング / centrality metric**
- **link-index 専用 archetype の新設**（前身 CANDIDATE の「body に markdown table として保存」案は v1 不採用）
- **search との統合**（A-4 search 結果と link-index を横断する view）
- **entry-window 側への表示複製**（v1 は中央 meta pane のみ。entry-window は別 contract で検討）

---

## 7. 推奨方針

### 7.1 docs-first pipeline の順序

1. **本書**（`docs/spec/link-index-v1-minimum-scope.md`）: feasibility + minimum scope 固定 ← 今ここ
2. `docs/spec/link-index-v1-behavior-contract.md`: behavior contract（data contract / API / state interaction / UI selector / gate / error path / test plan）
3. **pure slice**: `buildLinkIndex(container)` を features 層で実装 + test
4. **state slice**（原則 skip）: index は pure 関数を UI 側で直呼びで十分。AppState 拡張を避けるのが v1 方針
5. **UI slice**: meta pane 拡張（Outgoing / Backlinks セクション）+ broken-link 全体 view
6. **post-impl audit**: invariance 確認（I-LinkIdx1〜10 の実装トレース）
7. **manual sync**: 日常操作 / トラブルシューティング / 用語 への反映

### 7.2 どこから始めるか

- **pure から**。`buildLinkIndex` は `extractEntryReferences` を archetype 別の body に対して呼ぶだけの小さい pure 関数で、契約が安定しやすい
- **state は増やさない**。UI 側で毎 render に `buildLinkIndex` を呼ぶ runtime memo 方針が最小。container が数千件で重い場合の memoization 戦略は contract 段階で判断

### 7.3 contract 段階で決めること（本書では決めない）

- DOM selector の命名（`data-pkc-region="link-index-outgoing"` 等）
- Outgoing / Backlinks / Broken 各リストの件数上限 / truncation 閾値
- broken 全体一覧の起動 UI（button / menu / 専用 panel のどれか）
- Outgoing / Backlinks のソート順（出現順 / lid 昇順 / title 昇順）
- entry 削除直後の backlink 表示の一貫性（削除した瞬間に他 entry の backlink から消えるか、refresh 要か）
- textlog source の粒度表示（log id まで出すか / lid だけに留めるか）

---

## 8. Examples

### 8.1 単純 backlink

Container:

- A（text, body: `"... see [details](entry:B) ..."`）
- B（text, body: `"..."`）

選択中 = B のとき:

- Outgoing: なし
- Backlinks: 1 件（source = A）
- Broken: なし

### 8.2 broken link

Container:

- A（text, body: `"orphan ref: [missing](entry:Z)"`）
- B（text, body: `"..."`）

container 全体 broken view:

- 1 件: source = A, target = `Z`, status = broken

選択中 = A のとき:

- Outgoing: 1 件（target `Z` / broken）
- Backlinks: なし

### 8.3 multiple inbound links（hub entry）

Container:

- `Hub`（text）
- A（text, body に `entry:Hub`）
- B（text, body に `[go](entry:Hub)`）
- C（textlog, log body に `![](entry:Hub)`）

選択中 = `Hub` のとき:

- Outgoing: なし
- Backlinks: 3 件（A / B / C）
- **v1 は embed / link / bare の違いを区別しない**（全部 "参照 1 件" として同列表示）

---

## 9. まとめ

v1 は:

- **読み取り専用の派生値** として link-index を runtime 計算
- 対象 link は **markdown body 内の `entry:` scheme のみ**（Relation / 外部 URL / asset は対象外）
- 機能は **Outgoing / Backlinks / Broken の 3 つのみ**
- schema / relation / revision / provenance / search / ordering / merge を **一切 touch しない**

これで「link の index」という user 価値を最小コストで提供し、graph visualization / auto-fix / federation 等の重いテーマは v1.x 以降に残す。
