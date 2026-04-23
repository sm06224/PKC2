# Tag Data Model — v1 Minimum Scope (additive draft)

## 1. Purpose / Status

W1 Slice B。`docs/spec/tag-color-tag-relation-separation.md`(§3.1)で定義した **Tag**(エントリ単体に貼る自由文字列の軽量属性)を、**既存データモデルを壊さずに additive で導入するための最小 schema** を固定する。

- **docs-only、minimum-scope、additive draft**
- コード変更はゼロ。本 spec は実装 slice が着手するときの判断基準
- 本 spec が固まれば、以降の
  - Slice C(search / filter semantics draft)
  - rename slice(`state.tagFilter` → 新名称の一括置換)
  - 実装 slice(Tag chip UI / reducer / normalization)
  が語彙・契約の揺れなく進められる
- 既存の categorical relation ベースの "tag"(`src/features/relation/tag-selector.ts`)は **破壊しない**。新 Tag と並存する(W1 §7 参照)

参照(先行 docs):

- `docs/spec/tag-color-tag-relation-separation.md` — 概念分離の一次 source
- `docs/development/ui-vocabulary-tag-color-relation.md` — UI label 正本(Slice A)
- `docs/spec/data-model.md` — 既存 Entry / Container / Relation の schema
- `docs/spec/schema-migration-policy.md` — additive 変更の取り扱い(本 spec が適合する migration 分類)

---

## 2. Scope

### 2.1 含める

- **entry-level の Tag**(`entry.tags?: string[]` として entry schema に additive 追加)
- **正規化ルール**(trim / 空文字 / 重複 / 大文字小文字 / 最大長 / 最大件数)
- **順序意味論**(insertion-order 保持 / 表示・CSV・diff の deterministic)
- **import / export / round-trip の additive 契約**(sister bundle / HTML / ZIP)
- **`state.tagFilter` rename 計画**(既存の categorical peer lid filter が "tagFilter" の名を占有している問題の解消設計)

### 2.2 含めない

- **Color tag** のデータモデル(`entry.color_tag?: ColorTagId` は別 spec、Slice E)
- **search syntax** の形式定義(`tag:<value>` の BNF、escape、大文字小文字運用は Slice C)
- **UI chip / picker / filter bar 実装**(Slice D 以降)
- **categorical relation → Tag 自動変換 migration tool**(Slice F)
- **per-tag metadata**(色 / 説明 / owner / 優先度など)
- **container-level tag registry**(全 Tag の索引 / 別辞書、必要性自体が未確定)
- **tag hierarchy / nested tags**(フラットのみ)
- **手動 validation UI / error message**(実装 slice で決定)
- **manual 更新**(Tag 実装着地後の Slice D)

### 2.3 invariant(このドラフトが壊さない前提)

- 既存 `Entry` / `Container` / `Relation` / `Revision` / `Assets` の schema は **不変**
- 既存の `RelationKind` 5 種(`structural` / `categorical` / `semantic` / `temporal` / `provenance`)を変更しない
- 既存 categorical relation ベースの `tag-selector.ts` / `tag-filter.ts` の振る舞いを変更しない
- `schema_version` を **bump しない**(additive optional field に徹する)

---

## 3. Proposed data model

### 3.1 Schema

`Entry` に optional `tags?: string[]` を additive に追加する。

```typescript
interface Entry {
  lid: string;
  title: string;
  body: string;
  archetype: ArchetypeId;
  created_at: string;
  updated_at: string;
  // ── additive (v1 Slice B) ──
  tags?: string[];
}
```

### 3.2 Field contract

| 側面 | 規約 |
|---|---|
| 型 | `string[]`(optional) |
| 欠落(`undefined` / フィールド自体なし) | 「タグが無い」と解釈。全ての read path で **空配列と同一視** |
| 空配列(`[]`) | 「タグが無い」と解釈。欠落と同義 |
| 要素の型 | 非空 string(`length >= 1`、§4 normalization 後) |
| 要素の最大長 | **64 文字**(UTF-16 code unit ベース) |
| 配列の最大件数 | **32 件 per entry** |
| 順序の扱い | **insertion-order 保持**(§5 参照) |
| 重複許容 | **不可**(§4 normalization で排除) |
| persistence | entry 本体と同じ container JSON に含まれる。別ストアに分けない |
| schema_version bump | **不要**(additive optional field) |

### 3.3 欠落 / 空配列の正規化表現

read 側:
- `entry.tags === undefined` → 空配列として扱う
- `entry.tags === []` → 空配列(欠落と同義)
- どちらも UI 上は「タグなし」表示、filter からは match しない

write 側:
- 新規 entry が Tag を 1 件も持たない場合、**`tags` フィールドを書き出さない**(欠落形)
- ユーザが 1 件でも Tag を追加したら `tags: [...]` として現れる
- ユーザが全 Tag を削除したら `tags: []` として書き出してよい(欠落形に戻す義務はない)

→ **round-trip の安定性** のため、空配列と欠落は意味的に等価。実装側の都合で選んでよい。

### 3.4 non-schema な実装想定(参考情報)

- 編集は entry 単位で atomic(relation のように独立 id を持たない)
- Tag 単独に対する CRUD API は持たず、`UPDATE_ENTRY_TAGS` 的な action で配列を置換する想定(実装 slice で確定)
- 差分表現は配列 diff ベース(revision snapshot で全配列を保持、部分 patch はしない)

<!-- TAG-V1-ANCHOR-PHASE-2 -->

---

## 4. Normalization rules

Tag 入力値は **常に normalization を通してから** `entry.tags` に格納する。read 側は格納済みの値をそのまま信頼する(再 normalization を前提にしない)ので、**書き込みルート全てに単一の normalizer を置く** のが契約。

### 4.1 トリガーポイント

| 書き込みルート | normalization 適用 |
|---|---|
| UI chip 入力 → reducer | **必須**(入力時の action payload を normalizer に通す) |
| import(HTML / ZIP / sister bundle) | **必須**(importer 側で逐一通す。壊れた入力は reject or drop) |
| `record:offer` receiver(P5) | **必須**(capture profile 側の判断で reject or sanitize) |
| reducer の内部コピー(例: revision snapshot) | **不要**(既に normalized な値を保持) |
| export 書き出し | **不要**(格納時に正規化済みのため) |

単一 normalizer の置き場所は実装 slice で決定する(候補: `src/features/tag/normalize.ts`、pure feature layer)。

### 4.2 Normalization ルール(1 Tag 入力文字列 `raw: string` → 正規化結果 or reject)

| ルール | 内容 | 結果 |
|---|---|---|
| R1: trim | 先頭 / 末尾の空白(スペース / タブ / 改行 / 全角スペース含む)を削除 | trimmed string |
| R2: 空文字 reject | trim 後が空文字なら **reject**(entry に追加しない、UI はエラー feedback) | — |
| R3: 最大長 | trim 後が 64 文字超なら **reject** | — |
| R4: 改行 / 制御文字の排除 | trim 後に `\n` / `\r` / `\t` / その他 C0 制御文字を含むなら **reject** | — |
| R5: Unicode 正規化 | **minimum scope では NFC 正規化を行わない**(原文保持)。将来の Slice で評価(既存 body / title も NFC は明示されていないため整合) | raw-preserving |
| R6: 大文字小文字 | **区別する**(case-sensitive) | `Urgent` と `urgent` は別 Tag として扱う |
| R7: 重複排除 | **同一 entry 内** で既に同じ string を持つなら **reject**(R6 の比較ルールで同一判定) | — |
| R8: 件数上限 | entry の `tags` 配列が既に 32 件なら追加不可、**reject** | — |

すべての R* に違反したときは **reject = entry に追加しない**。reject の通知方法(toast / inline error)は実装 slice で決定。

### 4.3 重複判定の境界(R6 + R7 の接続)

- minimum scope では **生文字列の `===`** で比較する
- 将来の Slice で Unicode NFC / case-folding をオプションにする拡張は可能。ただし導入時は **既存データを壊さない**(格納済みの類似タグを自動マージしない)
- 「`Urgent` と `urgent` が別 Tag なのは UX 的に微妙」問題は既知のアンチパターン候補として記録しつつ、**minimum scope では決定せず runtime fold はしない**(§8 non-goals)

### 4.4 表示時の扱い

- 表示は **格納値そのまま**。display-time normalizer は持たない
- tooltip / accessibility label も格納値そのまま
- chip の色は Tag 自身の属性に基づかない(W1 Slice A §3.1 "Tag" 項に従う)

### 4.5 Validation error UX(参考、実装 slice で確定)

- R1: ユーザには透過(勝手に trim しただけで通る)
- R2-R4, R7, R8: inline エラー表示 + chip 確定しない
- R5 / R6 は UX 上 "静かに" 許容。ユーザは自分が入れた文字列が生でそのまま残ると期待できる

---

## 5. Ordering semantics

### 5.1 保持順

**insertion-order 保持**。新しく追加された Tag は配列末尾に append。削除時は該当要素を配列から除去し、残りの順序はそのまま(shift で詰める)。

### 5.2 保存 ↔ 表示 ↔ export の順序契約

| 文脈 | 順序規則 |
|---|---|
| container JSON `entry.tags` | insertion-order の配列 |
| UI chip 行 | 配列順に左から右へ描画 |
| CSV export(Slice B: column `tags`) | 配列を `;` 等の区切りで連結(具体デリミタは実装 slice で確定)、順序保持 |
| HTML / ZIP / sister bundle export | container JSON の配列そのまま |
| diff / revision snapshot | 配列全体を snapshot として保持、順序含めて diff 単位 |

### 5.3 deterministic の担保

round-trip および "同じユーザ操作から同じ結果" を得るため、次を保証:

- insertion → persistence → reload → display は **同じ順序で一貫**
- import 側 validator は順序を変更しない(rejected Tag は drop、順序はギャップなしで詰める)
- 手動 re-order は **minimum scope では UI 未提供**(将来の Slice で drag-reorder を検討)

### 5.4 集合として扱う場面

- filter の **AND 条件評価**(§Slice C で詳細)は集合演算として順序非依存
- 複数 entry 間の "同じ Tag を持つ" 判定も集合等価性
- → 内部表現は配列だが、評価ロジックでは `Set<string>` に変換して使うのが普通

---

## 6. Compatibility / additive migration

### 6.1 additive 分類

`docs/spec/schema-migration-policy.md` の **additive optional field** 分類に適合:

- 新規 field `tags?: string[]` を `Entry` に追加
- 既存フィールドは不変
- `schema_version` は **bump しない**(policy で定める "breaking" 条件には該当しない)

### 6.2 旧 reader の挙動

- 本 spec 導入前の reader(旧 schema_version で保存された container を読み戻す、あるいは未対応クライアントに export)は `tags` フィールドを **無視する**
- 無視された container を旧 reader で書き直し → 新 reader で再ロード、というラウンドトリップでは **`tags` が失われる**(旧 reader が preserve しないため)
- これは既知のリスクであり、運用上は新旧 reader を跨ぐ編集を推奨しない。W1 Slice B の minimum scope では許容

### 6.3 import / export round-trip

| 形式 | `entry.tags` の扱い |
|---|---|
| HTML export(Portable HTML、full mode / light mode) | container JSON に含まれる。full / light 共に tags を保持 |
| ZIP export(Portable Package) | 同上 |
| sister bundle(`.text.zip` / `.textlog.zip`) | 対象 entry が `tags` を持つ場合、manifest に含めて持ち出す |
| Folder export | 各 entry の `tags` を保持 |
| Batch import | 各 entry の `tags` を受信、normalizer を通してから container に投入 |
| `record:offer` transport(P5) | capture profile 側の判断。本 spec では "transport に乗せるかどうか" は未確定。capture profile 更新時に再判断 |

### 6.4 既存 categorical relation との併存

- 既存の `categorical` relation(`tag-selector.ts` が使っている "tag entity" 表現)は **そのまま残る**
- 同じ "Urgent" という文字列を、ある entry が entry-level Tag として持ち、別 entry が "Urgent" という tag-entry への categorical relation を持っている、という状態は **競合しない**(別レイヤ)
- UI 側で両者を「同じ Tag として見せるか別物として見せるか」は UI slice の判断。minimum scope では **別物として扱う**(自動マージしない)

### 6.5 migration tool 不在の前提

- **今 spec では migration tool を提供しない**
- 既存 categorical relation を Tag に変換したいユーザは、手動で両者を入力する必要がある
- 将来の Slice F で変換 UI を検討

<!-- TAG-V1-ANCHOR-PHASE-3 -->

---

## 7. `state.tagFilter` rename plan

### 7.1 現状

`AppState.tagFilter: string | null` は現在 **categorical relation の対向 entry lid を単一格納** している。

- `src/adapter/state/app-state.ts:169` 型宣言
- `src/adapter/state/app-state.ts:401` 初期 `null`
- `src/adapter/state/app-state.ts:652-655` `applyFilters` gate
- `src/adapter/state/app-state.ts:1840` `SET_TAG_FILTER` reducer
- `src/adapter/state/app-state.ts:1845` `CLEAR_FILTERS`
- `src/adapter/ui/renderer.ts:1849-1918` sidebar 絞り込み描画
- `src/core/action/user-action.ts:234` `{ type: 'SET_TAG_FILTER'; tagLid: string | null }`
- `src/features/search/saved-searches.ts` — saved-search JSON の persisted key `tag_filter` として保存

つまり現 `tagFilter` は **lid 1 件の categorical relation filter** であり、本 spec が導入する **新 Tag の `Set<string>` filter** とは **別もの**。名前が衝突したまま両者を追加すると、reducer / test / UI / saved-search JSON で意味不明になる。

### 7.2 rename が必要な理由

- 新 Tag の filter field を `state.tagFilter: Set<string>` として導入したい
- 既存 `state.tagFilter: string | null` がその名前を占有している
- 型も意味も違うので、共存するなら **一方を rename** する以外に整合が取れない
- 名前的にも UI 的にも、ユーザが "タグで絞る" と言ったときに想起するのは自由文字列 Tag の方。**新 Tag が `tagFilter` の名前を引き継ぐのが自然**
- 旧 `tagFilter`(categorical relation peer lid)を rename する

### 7.3 rename 候補の比較

| 候補 | メリット | デメリット | 判定 |
|---|---|---|---|
| **`categoricalPeerFilter`** | 最も precise。現状 categorical relation 以外では使われていないことを名前で示せる | 長い | **推奨** |
| `relationPeerFilter` | 将来 categorical 以外の kind も単一 peer filter で扱う可能性を残せる | 現実装は categorical 限定のため mislead、結局 kind 情報が別途必要 | 不採用 |
| `categoricalTargetFilter` | 意図は近い | "target" は relation の `to` と混同しやすい(graph 文脈) | 不採用 |
| `legacyTagFilter` | 旧互換が名前で明示 | "legacy" が永続化され負債化する | 不採用 |

**推奨: `categoricalPeerFilter: string | null`**

### 7.4 影響範囲(実装 slice で一括 rename する前提の概算)

| 対象 | 箇所 | 影響度 |
|---|---|---|
| `AppState.tagFilter` 型宣言 / init / reducer branches | `src/adapter/state/app-state.ts` 計 6 箇所 | 機械的 |
| action 型 `SET_TAG_FILTER` の名前 | `src/core/action/user-action.ts:234` + `src/adapter/ui/action-binder.ts:1095-1098` | rename 必須(例: `SET_CATEGORICAL_PEER_FILTER`) |
| renderer の filter gate / tag chip 表示 | `src/adapter/ui/renderer.ts:1849, 1850, 1871, 1872, 1888, 1918` | 機械的 |
| saved-search serialize / deserialize | `src/features/search/saved-searches.ts:32, 52, 72`、persisted key `tag_filter` | **要注意**(§7.5 参照) |
| reducer unit test | `tests/core/app-state.test.ts` 12 箇所 | grep/replace |
| renderer test | `tests/adapter/renderer.test.ts` 261 箇所 | 大量だが機械的 |
| saved-search test | `tests/features/search/saved-searches.test.ts` 4 箇所 + `tests/adapter/saved-searches-reducer.test.ts` 2 箇所 | rename + persisted key 互換テスト要追加 |
| その他 test(link-index-ui, merge-conflict-ui, renderer-export-grouping, split-editor-asset-preview) | 各 1 箇所 | grep/replace |

### 7.5 persisted JSON key の後方互換

`saved-searches.ts` は現在 localStorage 上に `tag_filter: string | null` として **外部 persistence** している(`saveAs` されたユーザの検索フィルタ)。

**rename 時の契約**:

- **新しいオブジェクトを書き出すときは新 key 名**(例: `categorical_peer_filter`)で保存
- **古い JSON を読むときは旧 key `tag_filter` も受け入れる**(backward-compat read)
- 書き直したら新 key に書き換わる(migration 効果は lazy)
- 当面 **旧 key も新 key も両方 accept する deserializer** を提供し、1〜2 release 後に旧 key support を削除する方針を実装 slice で確定

この persisted key の扱いは、単純な in-memory rename とは別の注意点なので、rename slice の最初のタスクとして固定。

### 7.6 rename を実装 slice で **一括** にする前提

- 部分 rename(一部 module だけ新名称)は禁止。**1 PR で src / tests / persisted reader 全てをまとめて切り替える**
- 本 spec(Slice B)はあくまで **plan の固定**。実施は rename slice が別 PR で行う
- rename PR の受け入れ条件:
  - `state.tagFilter` の旧名が src / tests から完全消滅
  - `state.categoricalPeerFilter`(新名称)が全経路で使われる
  - saved-search JSON の旧 key `tag_filter` 読み込みが継続動作
  - 既存テストが 100% 通る(assertion 名は更新される)

---

## 8. Non-goals

- **コード実装**(Tag 追加 reducer / normalizer / UI chip / filter bar / rename いずれも未実施)
- **Color tag の data model**(`entry.color_tag` の schema / palette 固定は Slice E)
- **search syntax の形式定義**(`tag:` prefix の BNF / escape / quote / multi-value 記法は Slice C)
- **UI chip / picker / filter UI / styling**
- **categorical relation → Tag の自動変換 migration tool**
- **manual 更新**(Tag 実装着地後の Slice D)
- **per-tag metadata**(色 / 説明 / owner など、Tag は "ただの文字列")
- **container-level tag registry**(全 Tag の辞書や統計の別ストア)
- **tag hierarchy / nested tags**(`parent/child` 記法のサポート、ワイルドカード 検索等)
- **case-fold / NFC / fuzzy match**(minimum scope では raw string 比較)
- **同期 / リモート共有 API**
- **permission / visibility の per-tag 制御**

---

## 9. Next-step options

推奨着手順:

### Slice C — Search / filter semantics draft(docs-only)

- `docs/spec/search-filter-semantics-v1.md` を新規追加
- 5 軸(全文 / archetype / Tag / Color / Relation)の AND / OR、prefix syntax(`tag:<value>` 等)、quote / escape、複数 Tag 時の AND-by-default、result visibility(flat vs tree)を固定
- 本 Slice B と Slice A の語彙をそのまま使う

### Rename slice — `state.tagFilter` → `state.categoricalPeerFilter`(実装)

- 本 Slice B §7 の計画をそのまま実施
- 機械的 rename + saved-search persisted key 互換 + 全テスト更新を 1 PR で完結
- Slice C より先に実施してよい(Slice C は仕様、rename は独立した技術的負債解消)

### Slice E — minimal Tag chip UI prototype(実装、Slice B + rename 後)

- `entry.tags` の read / write を reducer + normalizer 付きで追加
- meta pane に chip 行 + inline 入力を最小実装
- filter UI は Slice C の syntax が確定してから

### Slice F — categorical relation → Tag migration UI(実装、Slice E 着地後)

- 既存 categorical relation を "Tag 化" する UI
- 両者を自動マージするのではなく、ユーザが明示操作

### Slice D — manual 同期(docs-only、Slice E 実装着地後)

- Tag / Color tag / "関連" 用語を manual 03 / 04 / 06 / 09 に反映

---

## 関連

- 概念分離: `./tag-color-tag-relation-separation.md`
- UI vocabulary: `../development/ui-vocabulary-tag-color-relation.md`
- Data model 原典: `./data-model.md`
- Migration policy: `./schema-migration-policy.md`
- 同パターン先行例: `../development/storage-profile-footprint-scope.md`

---

**Status**: docs-only、additive data model spec。本ドラフトは Slice C / rename / Slice E が立ち上がるときの schema / normalization / migration の参照源になる。既存データ・既存 UI・既存 filter 挙動はすべて不変。
