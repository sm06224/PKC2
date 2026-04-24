# Color Tag Data Model — v1 Minimum Scope (additive draft)

## 1. Purpose / Status

W1 Tag wave(`docs/spec/tag-data-model-v1-minimum-scope.md` / `docs/spec/search-filter-semantics-v1.md`)が着地した直後の **隣接概念 docs-first 整理**。`docs/spec/tag-color-tag-relation-separation.md` §3.2 で定義した **Color tag**(エントリの視覚的フォーカスを示す固定 palette マーカー)を、**既存データモデルを壊さずに additive で導入するための最小 schema** として正本化する。

- **docs-only、minimum-scope、additive draft**
- コード変更はゼロ。本 spec は実装 slice が着手するときの判断基準
- Tag wave との **概念混線を防ぐための契約** を先に固定する:
  - Color tag は Tag の代替でも、Relation の代替でもない
  - 1 entry に 1 color、固定 palette ID、意味の過積載禁止
- 本 spec が固まれば、以降の
  - Color vocabulary / palette ID fixed list(次 slice)
  - Saved Search additive schema(`color_filter`)
  - Color badge UI prototype
  - `color:` parser draft
  が語彙・契約の揺れなく進められる

参照(先行 docs):

- `docs/spec/tag-color-tag-relation-separation.md` — 概念分離の一次 source(§3.2 Color tag / §4 判断フレーム)
- `docs/development/ui-vocabulary-tag-color-relation.md` — UI label 正本(「カラー」/「Color」)
- `docs/spec/tag-data-model-v1-minimum-scope.md` — Tag 側の同等 spec(本文書のテンプレート元)
- `docs/spec/search-filter-semantics-v1.md` — 検索 / フィルタ軸 5 本(Color は軸 4、OR semantics)
- `docs/spec/data-model.md` — 既存 Entry / Container schema
- `docs/spec/schema-migration-policy.md` — additive 変更の扱い

---

## 2. Scope

### 2.1 含める

- **entry-level の Color tag**(`entry.color_tag?: ColorTagId` として entry schema に additive 追加)
- **ColorTagId** の型方針(固定 palette 上の string literal union、格納は ID のみで色値は格納しない)
- **単一値 semantics**(1 entry に 1 color、`null` / 欠落で「未指定」)
- **欠落 / `null` / 未知 ID の read 側フォールバック**
- **filter / search 側の前提**(OR 軸、`state.colorTagFilter`、`color:` prefix は既に §5.1 予約済み)
- **import / export / round-trip の additive 契約**
- **schema_version bump の要否**(不要)
- **Tag / categorical relation との自動変換は行わない** 契約

### 2.2 含めない

- **Tag 本体**(`entry.tags?: string[]` は別 spec で着地済み)
- **palette の具体的 ID 一覧 / 色値 / アクセシビリティ対応**(次 slice: Color vocabulary / palette ID fixed list)
- **parser 実装**(`color:<id>` の tokenizer / escape は `search-filter-semantics-v1.md` §5 reserved)
- **UI 実装**(picker / swatch / sidebar 色バー / filter bar の Color section)
- **Saved Search schema 実装**(`color_filter` field の writer / reader)
- **palette editor / user-defined color**(固定 palette 以外の色をユーザが追加する機能は非対象)
- **multi-color per entry**(1 entry に複数 color を付ける機能)
- **gradient / theme personalization / dark-mode 別 palette**
- **categorical relation → Color tag 自動変換 migration tool**
- **manual 更新**

### 2.3 invariant(本ドラフトが壊さない前提)

- 既存 `Entry` / `Container` / `Relation` / `Revision` / `Assets` の schema は **不変**
- 既存 `RelationKind` 5 種を変更しない
- Tag(`entry.tags?: string[]`)の仕様を変更しない
- 既存 categorical relation ベースの "tag" 実装系(`tag-selector.ts` / `tag-filter.ts`)は **不変**
- `schema_version` を **bump しない**(additive optional field)
- 既存の filter 3 軸(FullText / Archetype / CategoricalPeer)と Tag 軸の挙動は **不変**

---

## 3. Proposed data model

### 3.1 Schema

`Entry` に optional `color_tag?: ColorTagId | null` を additive に追加する。

```typescript
type ColorTagId = string; // §4 で固定 palette の string literal union に絞る

interface Entry {
  lid: string;
  title: string;
  body: string;
  archetype: ArchetypeId;
  created_at: string;
  updated_at: string;
  tags?: string[];              // ← W1 Tag wave(既存)
  // ── additive (Color tag v1) ──
  color_tag?: ColorTagId | null;
}
```

### 3.2 Field contract

| 側面 | 規約 |
|---|---|
| 型 | `ColorTagId \| null`(optional) |
| 欠落(`undefined` / フィールド自体なし) | 「カラー未指定」と解釈。`null` と同義 |
| `null` | 「カラー未指定」と解釈。欠落と同義 |
| 値(非 null) | §4 の fixed palette に属する 1 つの `ColorTagId` |
| 多重指定 | **不可**(1 entry に 1 color。配列型にしない) |
| 重複/順序 | 単一値なので該当なし |
| persistence | entry 本体と同じ container JSON に含まれる。別ストアに分けない |
| schema_version bump | **不要**(additive optional field) |

### 3.3 欠落 / null / 未知 ID の正規化表現

read 側:
- `entry.color_tag === undefined` → 「未指定」として扱う
- `entry.color_tag === null` → 「未指定」(欠落と同義)
- `entry.color_tag === '<unknown id>'`(palette に存在しない ID)→ **未指定にフォールバック**(UI は色なしで表示、filter からは `null` 扱い)。未知 ID は **削除しない**(round-trip 保持、§7.2)

write 側:
- 新規 entry が color を持たない場合、**`color_tag` フィールドを書き出さない**(欠落形)
- ユーザが color を設定したら `color_tag: '<id>'` として現れる
- ユーザが color を解除したら `color_tag: null` または欠落で書き出してよい

→ **round-trip の安定性** のため、`undefined` / `null` は意味的に等価。実装側の都合で選んでよい。

### 3.4 non-schema な実装想定(参考情報)

- 編集は entry 単位で atomic(Tag と同様、relation のような独立 id を持たない)
- Color tag 単独に対する CRUD API は持たず、`UPDATE_ENTRY_COLOR` 的な action で単一値を置換する想定(実装 slice で確定)
- 差分表現は単純置換(revision snapshot に `color_tag` を含める)

---

## 4. ColorTagId / palette

### 4.1 ID のみを保存する(色値は保存しない)

`entry.color_tag` は **ID のみ**(例: `'red'` / `'amber'` / `'green'`)を保存し、**CSS 色値 / HEX / RGB は保存しない**。理由:

- **theme 変更に追従できる**: light / dark / high-contrast で palette の具体色を変えても、ID が不変なので entry データを触らなくてよい
- **a11y 修正に追従できる**: コントラストや色覚配慮で色値を微調整しても、ID ベースの意味は壊れない
- **ID は短く diff に優しい**: `'red'` は 3 文字、round-trip / revision の node 表現が軽い
- **palette 拡張時の互換性**: palette に色を追加しても既存の ID は別解釈されない(§4.4)

### 4.2 ID は lowercase fixed

- ID は **lowercase ASCII のみ**(`[a-z][a-z0-9-]*`、ただし v1 は hyphen 不要想定)
- 大文字混在 / スペース / 日本語 / Unicode は **不可**(parser `color:<id>` / CSS class / dev tool の diff 安定性のため)
- 表示名(日本語ラベルの有無、文脈ラベル)は **UI vocabulary** 側が決める。data model 側は ID のみ契約

### 4.3 palette 数の方針(本 spec 最小 scope)

- **v1 palette は 10 色以下**
- 10 色以下とする根拠:
  - **UI の swatch 一行で並ぶ範囲**(`ui-vocabulary-tag-color-relation.md` §3.2:「10 色程度の円形 swatch + なし」)
  - **ユーザが意味を覚えられる上限**(色数が増えるほど「どれが何色か」の認知コストが跳ね上がる)
  - **a11y: 色覚配慮で区別可能な hue の数の実用上限**
- **具体 ID list は別書 `./color-palette-v1.md` で固定**(2026-04-24、v1 = 8 ID: `red` / `orange` / `yellow` / `green` / `blue` / `purple` / `pink` / `gray`)。本書は palette 数の方針と fixed 化の制約を定めるのみで、値そのものは palette spec を参照する。`brown` / `cyan` 等の除外理由 / vocabulary table / a11y 要件は palette spec §3.3 / §5 を見ること

### 4.4 将来 palette を増やす場合の互換方針

- palette の **拡張は additive** — 新しい ID を追加しても既存 ID の意味は変わらない
- palette の **削除は行わない** — 既存 entry が参照している ID を palette から外すと、未知 ID フォールバック(§3.3)に落ちる。意味論の破壊なので原則禁止
- palette の **rename**(同じ色に別 ID を割り当てる)は破壊的。v1 契約期間内は行わない。どうしても必要なら migration slice で旧 ID → 新 ID を変換する
- palette の **具体色値の調整**(`red` の色味を若干変える等)は自由 — ID 契約は変わらない(§4.1)

### 4.5 未知 ID の互換性

- 将来 palette に `teal` が追加されて、旧バージョンの reader が `color_tag: 'teal'` を見た場合:
  - 旧 reader は `teal` を palette に持たないので **未指定にフォールバック**(§3.3)
  - ただし `entry.color_tag` の値は **書き換えない**(round-trip で保持)
  - 旧 reader で保存しても `'teal'` はそのまま round-trip される前提
- この方針により、palette 拡張は **旧 reader を壊さない**

---

## 5. Semantics

### 5.1 Color tag は Tag の代替ではない

- Tag(`entry.tags?: string[]`)は **自由文字列 / 複数 / 意味分類** のための軸
- Color tag は **固定 palette / 単一値 / 視覚フォーカス** のための軸
- **「`red` と `urgent`」 を等価に扱わない**:
  - "urgent" のような業務ラベルは **Tag** で表現する
  - "今日触っているエントリ" のような視覚的ピックアップは **Color tag** で表現する
- Tag と Color tag が **同じ情報を重複保持することを禁止しない**(ユーザが両方付けたければ付けてよい)が、**自動変換はしない**(§7.3)

### 5.2 Color tag は Relation の代替ではない

- Relation(categorical / semantic / temporal / provenance)は **entry 間のつながり**
- Color tag は **entry 単体の属性**
- 「この entry は red グループに属する」という表現は **Color tag**、「この entry は別の entry `Red Project` にカテゴリ所属する」という表現は **categorical relation**
- Color tag は他 entry への参照を表現しない

### 5.3 主な用途(意図)

- **視覚的フォーカス**: 「今日触るやつ」「要レビュー」「保留」などを色で一瞥で区別
- **作業状態の一時マーキング**: 進行 / 完了 / 差し戻し等の軽いステータス表示(業務ロジックを持たない)
- **sidebar での素早いスキャン**: 色バー / 色 badge により、flat / tree のいずれでも色グループが視覚的に分離する

### 5.4 意味の過積載を避ける(アンチパターン)

**禁止ではないが強く推奨される運用規範**:

- ❌ 色に "締切まで X 日" のような動的意味を持たせない(色 palette が動的スケールに耐えられない)
- ❌ 色に "チーム A / チーム B" のような組織意味を持たせない(組織は Tag または categorical relation の領分)
- ❌ 色に優先度(P1/P2/P3 など)を 1 対 1 に縛らない(優先度が増えた瞬間に palette が足りなくなる)
- ✅ 色は「個人の視覚メモ」「その日のピック」「一目での grouping」レベルに抑える

この規範は data model では強制できないが、UI vocabulary / manual 側で「意味を過積載しないでください」と明記し、UX を方向づける(参照: `ui-vocabulary-tag-color-relation.md` §3.2)。

### 5.5 Tag / Color tag / Relation の役割分担サマリ

| 軸 | 形態 | 粒度 | 主用途 | 削除コスト |
|---|---|---|---|---|
| **Tag** | `string[]` 属性 | 1 entry に複数 | 自由文字列の軽量分類 | 軽(entry 属性) |
| **Color tag** | `ColorTagId` 単一属性 | 1 entry に 1 つ | 視覚的フォーカス | 軽(entry 属性) |
| **categorical relation** | Relation(kind = `categorical`) | (from, peer) ペア | 分類 entity への所属 | 中(relation id 削除) |
| **semantic/temporal/provenance relation** | Relation | (from, to) ペア | entry 間の意味付きつながり | 中(relation id 削除) |
| **structural relation** | Relation(kind = `structural`) | 親子関係 | 木構造の配置 | 大(tree 整合が必要) |

---

## 6. Filter / search implications

### 6.1 Color 軸は OR semantics

- **`state.colorTagFilter: Set<ColorTagId> | null`**(予約、`search-filter-semantics-v1.md` §3 軸 4)
- 複数指定は **OR**("赤 または 黄 を選択")
  - 1 entry が複数色を持たない(単一値)ので AND は意味論的に定義不能
- 軸無効の表現:
  - `null` → 軸無効
  - 空 Set → 軸無効(`null` と同義)
- 軸間は AND(spec §4.1 に従う)

### 6.2 `color:<id>` prefix は既に予約済み

- `search-filter-semantics-v1.md` §5.1 で `color:` prefix は **予約(未実装)** に分類されている
- 値は **固定 palette ID**(§4)。lowercase fixed
- 同 prefix の複数トークン(`color:red color:amber`)は **Color 軸の OR**(§5.2)
- 実装は parser slice で行う(本 spec では触らない)

### 6.3 `hasActiveFilter` 判定への追加

Color filter が実装されたとき、`hasActiveFilter` は以下の形で拡張される(既に §4.4 に予約済みの形):

```ts
hasActiveFilter =
  state.searchQuery.trim() !== '' ||
  state.archetypeFilter.size > 0 ||
  (state.tagFilter && state.tagFilter.size > 0) ||
  (state.colorTagFilter && state.colorTagFilter.size > 0) ||  // ← 本 spec が前提化する軸
  state.categoricalPeerFilter !== null
```

### 6.4 未知 ID をフィルタに指定した場合

- filter 側に palette に存在しない ID を渡した場合(Saved Search の読み込みで旧 reader が知らない ID を受け取ったケース):
  - filter は **該当 ID の値として評価**(= 未知 ID を持つ entry には hit、それ以外はヒットしない)
  - ただし現実的には未知 ID を持つ entry は §3.3 の read フォールバックで `null` 扱いになるため、hit しない(= 結果は空)
  - **filter 側で未知 ID を除外しない**(round-trip 保持、§7.2 と整合)
- 結果 0 件時の UX は `search-filter-semantics-v1.md` §7.6 に従う(軸別の差分メッセージは出さない)

### 6.5 Saved Search への将来写像

- `search-filter-semantics-v1.md` §6.2 で予約済み:
  ```typescript
  color_filter?: ColorTagId[] | null;  // undefined / [] / null → Color filter 無効
  ```
- 配列は **順序意味論を持たない**(OR 軸、Set を配列シリアライズしたもの)
- 旧 reader は unknown field として無視する(additive)
- 実装は次 slice(`Saved Search additive schema`)で

---

## 7. Compatibility / additive migration

### 7.1 additive field、schema_version bump なし

- `entry.color_tag` は optional、欠落時は「未指定」と同義
- 既存 container / export / import で **schema_version を bump しない**
- 旧 reader は unknown field を無視 → Color tag が設定されていても動作を壊さない

### 7.2 import/export round-trip で値を保持する

- `container.json` / sister bundle / HTML export / ZIP export いずれも、`entry.color_tag` の値を **そのまま保持**
- 未知 ID も書き換えず round-trip する(§3.3 / §4.5)
- round-trip の安定性は Tag(§7 of `tag-data-model-v1-minimum-scope.md`)と同じ契約

### 7.3 Tag / categorical relation とは自動変換しない

- 既存の Tag / categorical relation を Color tag に **自動変換しない**(逆も同様)
- 例: Tag `"urgent"` があっても `color_tag: 'red'` は自動付与されない。意味論が違うので変換は常にユーザ判断
- migration tool を将来作るとしても、それは明示的な別 slice / opt-in であり、本 spec の scope 外

### 7.4 既存機能への影響

- **既存 Entry schema の read path**: 影響なし(optional field を無視する path は安全)
- **既存 render path**: 影響なし(Color tag 表示は実装 slice で追加)
- **既存 filter 3 軸 + Tag 軸**: 影響なし(Color は別軸として追加される、`hasActiveFilter` だけ将来拡張)
- **既存 Saved Search**: 影響なし(新 field は旧 reader で無視される)
- **既存 revision**: `color_tag` は revision snapshot に含まれる(§3.4)ため、履歴が残る。旧 revision には欠落 → 「未指定」に解釈

---

## 8. Non-goals

- **code implementation**(`entry.color_tag` の reducer / action / presenter / CSS いずれも)
- **palette の具体 ID 一覧 fixed list**(次 slice で確定。本 spec は ID 戦略のみ固定)
- **palette editor / user-defined color**(palette 自体をユーザが拡張する機能)
- **multi-color per entry**(1 entry 1 color の invariant は本 spec で固定)
- **color picker UI / swatch / badge の実装**
- **`color:` parser 実装**(BNF / tokenizer は `search-filter-semantics-v1.md` §5 reserved のまま)
- **Saved Search schema 実装**(`color_filter` field の writer / reader は別 slice)
- **Tag / categorical relation → Color tag 自動変換 migration tool**
- **theme personalization / dark mode 別 palette / gradient**
- **a11y(色覚配慮)の具体 hex 値調整 / contrast 検証**(palette 確定 slice で触れる)
- **Saved Search に Color filter を UI から保存する UX**
- **manual 更新**(Tag wave と同じく、実装着地後に manual slice で)

---

## 9. Next-step options

本 spec が固まったら、以下の順で最小 slice を切ることを推奨する。

### Slice 1 — Color vocabulary / palette ID fixed list(docs)**【CLOSED 2026-04-24】**

- **landing**: `./color-palette-v1.md`(新規、docs-only)
- v1 palette = 8 ID fixed(`red` / `orange` / `yellow` / `green` / `blue` / `purple` / `pink` / `gray`)
- ID + 英語 / 日本語 label + 意味過積載ガイダンス + a11y 方針(CVD 配慮の hue 選定)+ UI 実装時の追加要件 + additive 拡張ルール
- 具体 HEX / CSS token は palette spec でも保留(theme / 実装 slice で確定)
- **Slice 2-4 はこれで解凍される**(値空間が決まったため、schema / parser / UI が具体型を持てる)

### Slice 2 — Saved Search additive schema(`color_filter`)

- `SavedSearch.color_filter?: ColorTagId[] | null` を schema に追加
- `createSavedSearch` / `applySavedSearchFields` を Color 軸対応に拡張(Tag 軸追加時のパターンをコピー)
- 旧 reader 互換は additive なので自動確保
- 実装 + テストで閉じる最小 slice

### Slice 3 — Minimal Color badge UI prototype

- `state.colorTagFilter: Set<ColorTagId> | null` の AppState 拡張
- `SET_COLOR_TAG_FILTER` / `CLEAR_COLOR_TAG_FILTER` action 追加
- meta pane に Color picker(10 swatch + ×)配置
- sidebar 行に色バー(左端 2–4 px の細い色 band)の描画
- filter bar に Color section 追加(OR chip)
- `hasActiveFilter` / `CLEAR_FILTERS` の軸追加
- Tag chip UI と同等の最小プロトタイプで閉じる

### Slice 4 — `color:` parser draft(docs + 実装)

- `docs/spec/search-syntax-parser-v1.md`(未着手)に Color prefix を追加 or Tag parser と同じ module で拡張
- `parseSearchQuery` が `color:<id>` トークンも extract → `parsed.colors: ReadonlySet<ColorTagId>`
- `applyFilters` が parser 結果と `state.colorTagFilter` を union / AND 合成(Tag wave と同じパターン)
- 大文字小文字は prefix name lowercase、値 lowercase fixed(§4.2)

**推奨順**: Slice 1 → 2 → 3 → 4。**palette ID が fixed になるまで Slice 2/3/4 は着手不可**(ID なしで schema / UI / parser を組むと後から書き直しが発生する)。

---

## 関連

- 概念分離: `./tag-color-tag-relation-separation.md`(§3.2 Color tag / §4 判断フレーム)
- UI vocabulary: `../development/ui-vocabulary-tag-color-relation.md`(「カラー」/「Color」label、palette picker の語彙)
- Tag data model(隣接 spec、本文書のテンプレート): `./tag-data-model-v1-minimum-scope.md`
- Search / filter semantics: `./search-filter-semantics-v1.md`(Color は軸 4、OR、`color:` 予約)
- 既存 Saved Search: `../development/saved-searches-v1.md`(次 slice の拡張先)
- additive migration 方針: `./schema-migration-policy.md`

---

**Status**: docs-only、Color tag minimum-scope draft(2026-04-24)。W1 Tag wave クローズ直後の隣接概念正本化。Tag / Relation と役割を分離し、1 entry 1 color / fixed palette ID / OR 軸 semantics / additive 契約を固定。次 slice `Color vocabulary / palette ID fixed list` で具体 ID を確定するまで、実装 slice(Slice 2–4)は着手しない。既存 data / UI / filter 挙動はすべて不変。
