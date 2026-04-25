# Search / Filter Semantics — v1 (docs-first draft)

## 1. Purpose / Status

W1 Slice C。Tag UI / `tag:` 系構文 / Saved Search 拡張 / Tag filter data path 実装の **すべてに先立って**、検索 / フィルタ semantics を 1 本の spec に固定する。

ここを先に固めないと:

- Tag filter UI(chip / filter bar)を設計したときに軸ごとの AND/OR が後からぶれる
- `tag:<value>` 等の構文を parser で実装したときに、他 prefix との挙動差が仕様外で決まる
- Saved Search に Tag / Color を乗せるとき、round-trip / backward-compat 判断が曖昧になる
- flat / tree / reveal の扱いが検索 semantics と混ざる

この doc は **docs-only、draft、コード変更なし**。W1 Slice B の `categoricalPeerFilter` rename が既に着地しているので、以降 legacy `tagFilter` の名前は使わず新名称のみで記述する。

参照(先行 docs):

- W1 本体: `docs/spec/tag-color-tag-relation-separation.md`
- Slice A(UI vocabulary): `docs/development/ui-vocabulary-tag-color-relation.md`
- Slice B(Tag data model): `docs/spec/tag-data-model-v1-minimum-scope.md`
- 既存 Saved Search: `docs/development/saved-searches-v1.md`
- 既存 search filter 実装: `src/features/search/filter.ts` / `src/features/relation/tag-filter.ts`

### 1.1 現在の状態(as of 2026-04-23)

W1 Tag wave のすべての実装 slice が着地した:

- **Slice B** — `entry.tags?: string[]` schema、R1–R8 正規化規則
- **Slice D** — `filterByTags` / `applyFilters` Tag 軸 AND-by-default 実装
- **`tag:` parser slice** — `parseSearchQuery(raw)` → `{ fullText, tags }` 実装済み

残り未実装: **Color tag** 軸、**Saved Search `tag_filter_v2`** schema 追加、**UI chip / filter bar**、**BNF parser(quote / escape 含む)**。それぞれ次 wave の scope。

---

## 2. Scope

### 2.1 In scope

- **5 つの検索 / フィルタ軸** の定義と意味
- 各軸の **値の型・単一/複数・現在の実装状態**
- **軸間 / 軸内の AND / OR 組み合わせ semantics**
- 将来の `tag:` / `color:` / `type:` / `rel:` など **prefix 構文の予約**(parser は実装しない、意味だけ予約)
- **Saved Search** への写像と backward-compat 方針
- **結果表示**(flat / tree / reveal)と検索 semantics の責務分離

### 2.2 Out of scope

- **parser 実装**(BNF / tokenizer / escape 仕様は Next-step slice)
- **UI widget 実装**(chip / picker / filter bar)
- **scoring / ranking**(全文 hit 数、関連度、タイムスタンプの重み付け)
- **fuzzy match / edit distance / prefix match**(本 draft は完全一致 / substring のみ)
- **advanced boolean syntax**(`AND` / `OR` / `NOT` キーワード / 括弧、全文側 `"exact phrase"` など)
- **階層維持検索結果**(現 flat fallback の設計見直しは別 wave)
- **graph-like query**(例: `rel:semantic ancestor:X`)
- **migration tool / manual 更新**

### 2.3 Invariants(本 draft が壊さない前提)

- 既存 `searchQuery` / `archetypeFilter` / `categoricalPeerFilter` の挙動は **変更しない**
- 既存 `filterEntries` / `filterByArchetype` / `filterByTag`(categorical peer 用)は **API 不変**
- Saved Search の既存 JSON shape(`search_query` / `archetype_filter` / `categorical_peer_filter` + legacy `tag_filter` read-compat)は **破壊しない**
- 本 draft は Tag / Color を **まだ AppState に持っていない** 前提で "reservation" する。実装 slice が着地するまでは絵に描いた状態
- `flat fallback when any filter active` 契約(`src/adapter/ui/renderer.ts:1918` の sidebar 描画分岐)は **今のまま維持**、別 wave で見直す

---

## 3. Search / filter axes

本 draft は 5 軸を fix する。軸は **それぞれ独立** であり、一つの軸が別の軸の evaluation に干渉することはない(§4 で合成規則を固定)。

| # | 軸名(内部) | AppState field | 値の型 | 現在の実装状態 | 評価対象 |
|---|---|---|---|---|---|
| **1** | **FullText**(全文) | `state.searchQuery: string` | string(trim 後 case-insensitive substring) | ✅ 実装済 | `entry.title` + `entry.body`(`filterEntries`) |
| **2** | **Archetype**(種類) | `state.archetypeFilter: Set<ArchetypeId>` | `Set<ArchetypeId>` | ✅ 実装済(複数 OR) | `entry.archetype` |
| **3** | **Tag**(自由文字列) | `state.tagFilter: Set<string>` | `Set<string>`(各要素は Slice B §4 の normalized string) | ✅ 実装済み(W1 Slice D + parser slice) | `entry.tags?: string[]` |
| **4** | **Color**(カラータグ) | **予約: `state.colorTagFilter: Set<ColorTagId> \| null`** | `Set<ColorTagId> \| null` | ❌ 未実装(W1 本体で概念のみ) | `entry.color_tag?: ColorTagId` |
| **5** | **CategoricalPeer** | `state.categoricalPeerFilter: string \| null` | `string \| null`(単一 peer lid) | ✅ 実装済(Slice B Rename で改名) | `relations[r.kind === 'categorical' && r.from === entry.lid && r.to === peerLid]` |

### 3.1 各軸の詳細

- **FullText(1)**: trim 後の substring match、case-insensitive。空文字 → 軸が無効(no filter)。現 `filterEntries` の挙動そのまま。`"exact phrase"` / regex / 複数語 AND は将来拡張候補、本 draft 対象外。
- **Archetype(2)**: `ArchetypeId` の `Set`。空 Set → 軸無効。現 `filterByArchetypes` の挙動そのまま(複数値 OR、§4.2 参照)。
- **Tag(3)**: ✅ **実装済み**(W1 Slice D)。`entry.tags?: string[]` に対して `Set<string>` で絞り込む。空 Set / 欠落 → 軸無効。**AND-by-default**(§4.2)。`tag:<value>` 構文は `parseSearchQuery` で認識済み(§5.7)。
- **Color(4)**: **本 draft で予約**。Color tag が実装されたとき、`Set<ColorTagId> | null` として filter を受け取る(`null` = 軸無効、空 Set も同義)。**OR**(1 entry 1 color なので AND は意味がない)。
- **CategoricalPeer(5)**: 既存の categorical relation peer 単一 lid。`null` → 軸無効。`filterByTag` はリネーム scope 外で残存、UI は従来どおり。**単一 peer のみサポート**(複数 peer は本 draft では reserved、実装候補は §8 / Slice D 側)。

### 3.2 structural relation は検索軸ではない

`structural` relation は木構造の配置を表すため、本 draft では **検索軸に含めない**。その代わり **結果 visibility(§7)側** で扱う — 具体的には:

- 検索結果 flat list の行は、structural 上どこに属していても hit する
- "あるフォルダ以下だけを検索したい" は本 draft では未対応(将来の scope-by-folder 拡張候補)
- `revealInSidebar` 的な折り返し挙動は §7 で検索と切り離して整理

### 3.3 relation kind filter(`semantic` / `temporal` / `provenance`)は本 draft で予約のみ

`kind in {semantic, temporal, provenance}` を持つ relation を検索条件にする需要はあるが、`categorical` との役割衝突と UI コストのため本 draft では **予約のみ、軸として立てない**。prefix syntax 側(§5)では `rel:<kind>` を予約して将来 hook できる形にしておく。

<!-- SLICE-C-ANCHOR-PHASE-2 -->

---

## 4. Combination semantics

### 4.1 軸間は AND

5 軸はすべて **独立した AND で合成** する。任意の軸 `A_i` に active filter があるとき、entry が surface する条件は `A_1.matches(entry) ∧ A_2.matches(entry) ∧ ... ∧ A_5.matches(entry)`。

各軸の `matches(entry)`:

- **軸が未設定 / 空 / null** → `true`(その軸では制約しない、短絡 pass)
- **軸が設定されている** → 軸ごとの内部 semantics で評価(§4.2)

### 4.2 軸ごとの内部 semantics(同一軸内の複数値の扱い)

| 軸 | 単一/複数 | 複数時の内部合成 | 根拠 |
|---|---|---|---|
| FullText | 単一 string | — | 現仕様、将来の "multi-word AND" は本 draft 対象外 |
| Archetype | 複数可(Set) | **OR** | 「text または todo のいずれか」が自然、既存 `filterByArchetypes` と整合 |
| **Tag** | 複数可(Set) | **AND(by default)** | W1 Slice A §6.3。ユーザは "urgent かつ review" のように絞り込みたい期待値。OR 指定は将来 prefix 構文で明示(§5.4)する拡張候補 |
| **Color** | 複数可(Set)、`null` で軸無効 | **OR** | 1 entry 1 color なので AND は定義不能。"赤 または 黄" を選べる形 |
| CategoricalPeer | 単一 lid(`string \| null`) | — | 既存 behavior。複数 peer filter は本 draft では reserved |

### 4.3 合成の疑似コード

```ts
function filterActiveAxes(entries: Entry[], state: AppState): Entry[] {
  return entries.filter((e) => (
    matchesFullText(e, state.searchQuery) &&
    matchesArchetype(e, state.archetypeFilter) &&
    matchesTag(e, state.tagFilter) &&         // Tag: AND over Set
    matchesColor(e, state.colorTagFilter) &&  // Color: OR over Set
    matchesCategoricalPeer(e, state.categoricalPeerFilter, relations)
  ));
}

// 各 matches は "軸未設定なら true" を前提に短絡評価
```

### 4.4 "フィルタが有効か" 判定

`hasActiveFilter` の将来的な定義(実装 slice で確定):

```ts
hasActiveFilter =
  state.searchQuery.trim() !== '' ||
  state.archetypeFilter.size > 0 ||
  (state.tagFilter && state.tagFilter.size > 0) ||
  (state.colorTagFilter && state.colorTagFilter.size > 0) ||
  state.categoricalPeerFilter !== null
```

現在は `searchQuery / archetypeFilter / categoricalPeerFilter` の 3 軸のみ。Tag / Color が実装されたとき additive に追加する。

### 4.5 複数軸 active 時の UX

- filter バーが 5 軸すべて active でも、UI 上は同じ「絞り込み中」状態
- 結果 0 件のときの空状態メッセージは軸ごとに分岐しない(複雑になるだけ)
- 「全部解除」は既存 `CLEAR_FILTERS` の拡張で対応 — Tag / Color を導入したらこの action が clearing する対象に追加(軸を追加するたびに CLEAR_FILTERS reducer を更新)

### 4.6 AND-by-default(Tag)の拡張候補 [reserved]

Tag の AND-by-default は「絞り込み」UX として自然だが、"A または B" を表現したいケースもある。本 draft では reserve のみ:

- 将来 prefix 構文 `tag:A tag:B` は AND
- `tag:A,B` または `tag:A|B` で OR 指定(具体記法は parser slice で確定)
- UI chip は AND、chip を長押しで OR トグルする UX もありうる — こちらは Slice E 以降

---

## 5. Prefix syntax reservation

`searchQuery` は現在、生の全文検索文字列を受け取る。将来、1 つの入力ボックスで複数軸を指定できるよう、次の prefix 群を **予約する**。実装 slice(parser)は別 PR。

### 5.1 prefix 一覧(実装済み / 予約)

#### 実装済み

| prefix | 意味 | 対応軸 | 値 | 例 |
|---|---|---|---|---|
| `tag:` | Tag 絞り込み | Tag(§3 軸 3) | case-sensitive string | `tag:urgent` |

#### 予約(未実装)

| prefix | 意味 | 対応軸 | 値 | 例 |
|---|---|---|---|---|
| `color:` | Color tag 絞り込み | Color(§3 軸 4) | 固定 palette ID | `color:red` / `color:amber` |
| `type:` | archetype 絞り込み | Archetype(§3 軸 2) | `ArchetypeId` | `type:text` / `type:todo` |
| `rel:` | relation kind 絞り込み(軸も未実装) | §3.3 の reserved | `RelationKind` | `rel:semantic` / `rel:categorical` |

上記以外の prefix(`archetype:` / `@tag` / `#tag` など)は **予約しない**。prefix 衝突を避けるため、ユーザは `:` を含む自由文字列を入力するときは `"..."` でクォートする(§5.3)。

### 5.2 AND / OR との関係

parser 実装時の前提:

- **複数 prefix トークンは AND** で合成(軸間 AND、§4.1 と一致)
- **同 prefix の複数トークンは軸内 semantics に従う** — `tag:A tag:B` は Tag 軸の AND、`type:text type:todo` は Archetype 軸の OR
- **prefix 外の素トークンは FullText** 軸へ流す — `tag:urgent hello` なら `tag:urgent` + 全文 `hello`

### 5.3 quote / escape の予約(parser 未実装)

- 値にスペースを含めたいときは `"..."` クォートを受ける予定
- 値に `"` 自体を含めたいときは `\"` エスケープを受ける予定
- `:` 自体を値に含めたいときは `"..."` でクォート
- 本 draft は **予約のみ**、厳密 BNF / tokenizer は parser slice で確定

### 5.4 "OR within axis" の表記 [reserved]

`tag:A|B` 記法を OR 用に予約するが、本 draft では動作定義しない。Tag UI が AND-by-default で着地した後、需要が固まってから記法を確定する。

### 5.5 Negation [not reserved]

`-tag:urgent` のような否定 prefix は **本 draft では予約しない**。用途が広がりすぎ、parser 実装と UI affordance が重くなるため。将来の別 spec で検討。

### 5.6 大文字小文字

- prefix 名(`tag:` / `color:` etc)は **lowercase only**
- 値の大文字小文字は軸ごとに従う:
  - Tag: case-sensitive(Slice B §4 R6)
  - Color: ID は lowercase fixed(palette で固定)
  - Archetype: ID は lowercase(既存)
  - FullText: case-insensitive substring(既存)

### 5.7 `tag:` parser — 実装済み(2026-04-23)

`parseSearchQuery(raw: string)` が `src/features/search/query-parser.ts` に実装済み。`tag:<value>` トークンを FullText から分離し Tag 軸へ流す。`state.searchQuery` は raw のまま保持し、reducer は strip しない — `applyFilters` / `entryMatchesQuery` が render 時にパースする(純粋関数、副作用なし)。

`TAG:` / `Tag:` など lowercase 以外の prefix は FullText として扱う(§5.6)。bare `tag:`(値なし)はドロップされ Tag 軸は活性化しない。

<!-- SLICE-C-ANCHOR-PHASE-3 -->

---

## 6. Saved Search mapping

Saved Search(`container.meta.saved_searches`)は現在 6 field を保存している(`docs/development/saved-searches-v1.md` §1)。本 draft で追加予約する軸と整合させる。

### 6.1 現在の persisted schema(Rename slice 後)

```typescript
interface SavedSearch {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  search_query: string;
  archetype_filter: ArchetypeId[];
  categorical_peer_filter?: string | null;  // ← Rename slice で追加
  tag_filter?: string | null;               // ← legacy read-compat
  sort_key: SavedSearchSortKey;
  sort_direction: SavedSearchSortDirection;
  show_archived: boolean;
}
```

### 6.2 Tag / Color の将来追加(additive、本 draft で予約)

Tag / Color filter が実装された時点で、Saved Search に **additive** で追加する fields:

| 追加 field | 型 | 欠落時の意味 | 実装 slice |
|---|---|---|---|
| `tag_filter_v2?: string[]` | 文字列配列(Tag Set のシリアライズ、順序 insertion-order) | `undefined` / `[]` → Tag filter 無効 | Tag filter data-path slice(実装 slice 1) |
| `color_filter?: string[] \| null` | Color ID 配列(`string[]` 型で unknown palette ID も round-trip 保持、known IDs は palette order でソート、unknown は末尾に preserve、空配列は writer で omit) | `undefined` / `[] / null` → Color filter 無効 | Color tag slice(実装 slice 2)**【schema 実装済 2026-04-25】**、`color:<id>` query parser / actual filtering は **slice 4 で実装**(slice 2 では schema / write / read のみ)|

**`tag_filter_v2` に `_v2` 接尾辞を付ける理由**: legacy `tag_filter?: string | null`(categorical peer lid 用の旧 key)と **名前衝突を避ける**。新 Tag は配列型で意味も違うので、旧 key を読むコードが誤って新 Tag を categorical peer として解釈しないよう、明示的に別 key にする。

代替案(採用しない): `tags` / `tag_values`。これらは W1 Slice A の命名規約とぶつかる / manual で混乱する可能性があり、`tag_filter_v2` が最も精密。

### 6.3 backward-compat 方針

- **read**: 既存 `categorical_peer_filter` / legacy `tag_filter` の優先順位(Rename slice で確立)は維持。新 field(`tag_filter_v2` / `color_filter`)は欠落時 → 対応軸が無効として扱う
- **write**: Tag filter 実装後は新 field を常に emit。legacy `tag_filter` は **引き続き writer から emit しない**(Rename slice の方針継続)
- **schema_version**: すべて additive optional field なので **bump しない**
- **旧 reader** が Tag / Color field を無視しても壊れない

### 6.4 UX: Saved Search の復元

`APPLY_SAVED_SEARCH` は軸ごとに state へ mapping するだけで、**selection / reveal / tree expand は触らない**(§7 と一致)。具体的には:

- `searchQuery` / `archetypeFilter` / `categoricalPeerFilter` / (将来)`tagFilter` / `colorTagFilter` / `sortKey` / `sortDirection` / `showArchived` のみ更新
- `selectedLid` / `collapsedFolders` / `revealInSidebar` 等の view state には触らない
- これにより "Saved Search を切り替えたら sidebar が勝手に展開した" のような副作用を防ぐ

### 6.5 Saved Search name (未変更)

保存時の `name` は §2.3 の invariant に従い trim + max 80 chars。本 draft で変更点なし。

---

## 7. Result visibility policy

### 7.1 検索 semantics と可視化 policy の責務分離

本 draft の検索 semantics(§3-§5)は **"どの entry が hit するか"** だけを決める。それが sidebar で **どう見えるか**(flat / tree / expand)は別レイヤ(renderer / AppState)の責務。両者を混ぜない。

### 7.2 現行可視化(Baseline、本 draft で変更しない)

- **active filter なし**: sidebar は tree 表示、`collapsedFolders` に従って畳む
- **active filter あり**(searchQuery / archetypeFilter / categoricalPeerFilter のいずれか): sidebar は **flat list** に fallback(`src/adapter/ui/renderer.ts:1918` "hasActiveFilter" 分岐)
- **サブロケーションヒット**(S-18): 該当 entry 行の下に sub-location row が追加される(text/textlog の body 内 substring hit)

### 7.3 Tag / Color 追加後の可視化ポリシー

- Tag filter / Color filter active も **flat list fallback** に従う(既存 `hasActiveFilter` 判定に加わるだけ、UI 挙動は同じ)
- 階層維持検索結果(filter active 時も tree を残す)は **別 wave**。本 draft 対象外。導入する場合は `docs/spec/search-result-hierarchy.md`(将来)で別途仕様化

### 7.4 reveal policy との独立

- Saved Search 復元 / filter 変更では **`revealInSidebar` を立てない**(PR-ε₁ / PR-ε₂ の opt-in reveal 設計と整合)
- Tag filter で絞り込んだとき、matching entry が畳まれた folder 配下にあっても **自動展開しない**。flat fallback が matching entry を直接 list に出すので展開は不要
- **例外**: 外部 jump(Storage Profile 行クリック / `entry:<lid>` link)は既存どおり reveal 適用。これらは検索の話ではないので本 draft とは無関係

### 7.5 selection との独立

- filter を設定しても **selection(`selectedLid`)は触らない**(ユーザが明示的に別エントリをクリックするまで選択維持)
- filter で現 selected が hit しなくなっても selection は残る。UI は hidden 状態を合理的に見せる(既存挙動)
- Saved Search 復元も selection には触らない(§6.4)

### 7.6 全件 0 時のガイダンス

- 0 件結果は「該当エントリがありません」系のメッセージのみ、軸ごとの差分は出さない
- **filter を全部クリアしたら戻れる** ことを明示する UI affordance(「全部解除」ボタン等)は UI slice で実装

---

## 8. Non-goals

- **parser 実装**(prefix 構文の BNF / tokenizer / escape / エラー表示、すべて別 slice)
- **UI 実装**(chip / picker / filter bar / search box 変更)
- **AppState 拡張**(`state.tagFilter: Set<string>` / `state.colorTagFilter` の実装自体)
- **Saved Search schema 拡張**(`tag_filter_v2` / `color_filter` の追加は additive slice)
- **scoring / ranking**(ヒット数 / タイムスタンプ / 関連度の重み付け)
- **fuzzy match / edit distance / prefix partial match / regex**
- **"exact phrase"** マッチ(全文軸で `"..."` を特別扱いすること)
- **advanced boolean syntax**(`AND` / `OR` / `NOT` / 括弧)
- **Negation prefix**(`-tag:urgent` 等)
- **graph-like query**(`rel:semantic ancestor:X` 等の構造検索)
- **scope-by-folder**("このフォルダ以下だけを検索")
- **階層維持検索結果**(flat fallback の見直し、別 wave)
- **`rel:<kind>` 軸の実装**(`categorical` 以外の kind filter、本 draft は reserve のみ)
- **structural relation を検索軸にする**
- **parser の lookahead / streaming / IDE completion**
- **manual 更新**
- **test 追加**(仕様 doc のみで実装なし)

---

## 9. 残作業と次 wave

### 着地済み(W1 Tag wave クローズ 2026-04-23)

| slice | 内容 | 状態 |
|---|---|---|
| Slice B | `entry.tags?: string[]` schema、R1–R8 正規化 | ✅ 着地 |
| Slice D | `filterByTags` / `applyFilters` Tag 軸 AND-by-default | ✅ 着地 |
| `tag:` parser | `parseSearchQuery` — `tag:` トークン分離、FullText 残余 | ✅ 着地 |

### 次 wave(未実装)

#### Color tag data model 最小 scope(次の docs-first)

- `entry.color_tag?: ColorTagId` schema 定義
- `docs/spec/color-tag-data-model-v1-minimum-scope.md` の起案
- Color 軸の filter semantics(OR、§4.2)確定

#### Saved Search schema additive

- `SavedSearch.tag_filter_v2?: string[]` を schema に追加
- `createSavedSearch` / `applySavedSearchFields` を Tag 軸対応に拡張
- legacy read-compat(旧 `tag_filter` string | null)は継続維持

#### UI chip / filter bar(Slice F)

- meta pane の Tag chip 入力 + sidebar filter bar の Tag section
- AND-by-default を UI chip の見た目で表現
- W1 Slice A の label / avoid wording を厳守

#### parser 拡張(BNF / quote / escape)

- `color:` / `type:` / `rel:` prefix 認識
- `"..."` クォート、`\"` エスケープ
- `docs/spec/search-syntax-parser-v1.md` で BNF 固定

---

## 関連

- 概念分離: `./tag-color-tag-relation-separation.md`
- UI vocabulary: `../development/ui-vocabulary-tag-color-relation.md`
- Tag data model(軸 3 の schema 根拠): `./tag-data-model-v1-minimum-scope.md`
- Saved Search(既存 v1): `../development/saved-searches-v1.md`
- reveal policy(§7.4 前提): `../development/saved-searches-v1.md` + PR-ε₁ / PR-ε₂ 由来
- 同 docs-first pattern: `../development/storage-profile-footprint-scope.md`

---

**Status**: W1 Tag wave クローズ(2026-04-23)。Tag 軸(Slice D)・`tag:` parser(最小 slice)が着地。Color tag wave / Saved Search schema additive / UI chip / parser BNF は次 wave。軸 / AND-OR / prefix 予約 / Saved Search 写像 / visibility 責務の判断基準はこの 1 本から参照できる。
