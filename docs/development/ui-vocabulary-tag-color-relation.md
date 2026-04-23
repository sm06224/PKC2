# UI Vocabulary — Tag / Color tag / Relation

## 1. Purpose / Status

`docs/spec/tag-color-tag-relation-separation.md` で Tag / Color tag / Relation / categorical relation / structural relation の **概念境界** を正本化した。本文書はその続きで、**実際の UI(日本語 / 英語 label)で使う語** を 1 ページで固定する **用語辞書** である。

- 次に着地する Tag wave / search wave / UI wave が **同じ語を同じ意味で使える** ようにするのが目的
- 実装 PR ではない。**コード変更はゼロ**、あくまで label のレビュー基準
- 既存 manual / dev docs の用語整合は本ドラフト後の Slice で逐次同期
- 用語がぶれそうになったら、この 1 ページを参照して決める

参照:

- 概念定義: `docs/spec/tag-color-tag-relation-separation.md`
- Relation schema: `docs/spec/data-model.md §5`
- 同パターンの docs-first 先行例: `docs/development/storage-profile-footprint-scope.md`

---

## 2. Vocabulary table

以下の 10 語を "UI で使える label" として固定する。日本語が第一次表示、英語は tooltip / code / CSV header / dev docs 用。

| 概念 | 推奨日本語 label | 推奨英語 label | 使う場所 | 避ける / 使わない表現 | 備考 |
|---|---|---|---|---|---|
| **Tag**(自由文字列属性) | タグ | Tag / Tags | entry 下部 chip 行、Tag filter バー、Tag 入力フォーム、検索結果バッジ | 「カテゴリ」(categorical relation と紛らわしい)、「ラベル」(label と混同、UI label 自体と区別つかない)、「tag entry」 | 複数形は "タグ" / "Tags"(日本語は単複区別なし) |
| **Color tag**(固定 palette 属性) | カラー | Color | sidebar 行の色バー、detail ヘッダのアクセント、palette picker、カラー filter | 「カラータグ」(可)、「色タグ」(可だが冗長)、単に「タグ」(不可、Tag と混同)、「ラベル色」(不可) | UI label は "カラー" / "Color" 単独で十分。"カラータグ" は本文説明で「Color tag」と説明するときに限る |
| **Relation**(entry 間リンク総称) | 関連 | Relation / Relations | meta pane "関連" セクション、relation picker、backlinks badge の説明 tooltip | 「タグ」(不可)、「リンク」(URL リンクと混同)、「参照」(references と紛らわしい、categorical / temporal は参照ではない) | "関連" は semantic / categorical / temporal / provenance の **総称**。UI で単に "関連" と出すときは kind badge を併記 |
| **categorical relation** | (UI では kind 名として)分類 | Categorical | relation kind select、relation 編集ダイアログ | UI label で「タグ」と書かない。Tag との混同を招く | 分類先自体が独立 entry として存在する場合の用語。ユーザが自由文字列を貼りたいだけなら Tag を勧める |
| **semantic relation** | (kind 名として)意味 | Semantic | 同上 | UI で「see also」とだけ書かない(他 kind と区別できない) | |
| **temporal relation** | (kind 名として)時系列 | Temporal | 同上 | — | |
| **provenance relation** | 由来 | Provenance | 由来バッジ、"この entry は X から派生" 表示 | 「関連」に混ぜない | 自動生成が主。ユーザが直接作る場面はまれ |
| **structural relation** | 配置 / フォルダ | Structural / Location | 左 sidebar tree、breadcrumb、"移動先" select、Storage Profile の "Largest subtree" 説明 | UI label で「関連」と単独表記しない(木構造だと分からない) | UI では内部名 `structural` を出さず、「配置」「親フォルダ」「フォルダ構造」等で見せる |
| **backlinks** | 被参照 | Backlinks | meta pane "被参照" セクション、sidebar backlink badge の tooltip | 「逆リンク」(技術語寄り)、「バックリンク」(カタカナ冗長) | inbound relations のうち semantic / categorical を中心に集計 |
| **references** | 参照 | References | meta pane "参照" セクション、References summary row | 「引用」(quotation の意で誤解)、「リンク先」 | outbound relations のうち semantic / body 内 `entry:<lid>` を含む |

### 2.1 周辺語(混乱防止メモ)

- **"関連付け"**: Relation を作る操作(動詞的)。"タグ付け" と混ぜない
- **"タグ付け"**: Tag を貼る操作。categorical relation を張ることを指して使わない
- **"カラーを付ける"**: Color tag を設定する。「色をタグにする」とは言わない
- **"Related Entries"**: 英語 UI での meta pane セクション名。日本語は「関連」に統一
- **"entry ref"**: body 内の `entry:<lid>` 記法を指す **内部用語**。ユーザ向け UI には出さない

<!-- W1-SLICE-A-ANCHOR-PHASE-2 -->

---

## 3. UI usage guidance

### 3.1 Tag

- **Chip / badge**: detail ヘッダ直下、または meta pane 先頭に 1 行の chip 群として表示。chip は角丸・小さめ・背景薄色
- **入力**: chip 行末の inline textbox。Enter で確定、`,` / 空白も区切りとして受け付けるかは実装 slice で判断
- **削除**: chip 右端の `×` ボタン(hover で現れる)
- **filter バーでの呼称**: 「タグで絞る」「Tag」単独表示
- **tooltip**: `Tag: <value>`(複数値の場合は `Tags: <v1>, <v2>, ...`)
- **禁止**: chip の上に色を被せて Color tag と混同させない。chip の色は Tag 自身の意味区別には使わない(装飾のみ)

### 3.2 Color tag

- **sidebar 表現**: 行の左端に **4 px 幅程度の色バー**。色バー単独で "カラー" を意味し、ラベル文字列は出さない
- **detail 表現**: ヘッダ左端のアクセントライン / ヘッダ背景のサブトル tint
- **picker**: 小さな palette パネル(10 色程度の円形 swatch + "なし" の ○×)
- **label**: picker 見出しは「カラー」、palette 個別色に日本語名は **付けない**(見て選ぶ UX、`red` / `amber` 等の ID は dev tool / CSV のみ)
- **filter バーでの呼称**: 「カラーで絞る」「Color」
- **禁止**: 色に "優先度"・"締切"・"チーム" 等の業務意味を UI label で重ねない

### 3.3 Relation

- **meta pane "関連"**: セクション名は「関連」一択。中は relation ごとに list item として展開し、各 item に **kind badge**(「分類」「意味」「時系列」「由来」)と **peer entry title** を並べる
- **relation kind select**: 編集ダイアログの pulldown は日本語 kind 名(分類 / 意味 / 時系列 / 由来)+ tooltip で英語 label
- **backlinks / references**: meta pane に "被参照" / "参照" の 2 セクションで分ける。両者を "関連" と一緒にしない
- **backlinks badge**(sidebar 行右端の小バッジ)の tooltip: `3 incoming relations` 相当
- **chip のように並べない**: Relation は **list 構造** を保つ(Tag との視覚差別化)

### 3.4 Structural relation

- **UI label では "structural" と書かない**。「配置」「親フォルダ」「フォルダ構造」のいずれか
- **sidebar tree**: ラベル不要(tree 構造そのものが structural の表現)
- **breadcrumb**: 「A / B / C」のパス。セクション名が必要なら「配置」
- **"move to folder" select**: 「移動先」「親フォルダを変更」
- **Storage Profile の "Largest subtree"**: 「最大のサブツリー」— 日本語で subtree は訳さず「サブツリー」で許容(manual に既出)

### 3.5 Provenance relation

- **meta pane**: 独立した **"由来"** バッジ / 小セクション。"関連" に混ぜない
- **表現**: `このエントリは X から派生しました`(X = 元 entry の title)
- **自動生成**: TEXT↔TEXTLOG 変換などで自動付与。ユーザが手で追加する場面はまれなので picker に出さない

---

## 4. Avoid / banned wording

UI に出してはいけない表現(混同源になる)。**コード内部名や dev docs では使ってよいが、ユーザ向け UI label / tooltip / manual 本文では避ける**。

| 避ける語 | 理由 | 代わりに |
|---|---|---|
| categorical relation を「タグ」と呼ぶ | Tag(自由文字列属性)と混同 | 「分類」もしくは relation kind select 内の「分類」 |
| Color tag を単に「タグ」と書く | Tag との区別消失 | 「カラー」 |
| Relation を雑に「タグ」と書く | 概念全部を潰す | kind を明示(「意味」「時系列」等)、総称は「関連」 |
| structural relation を「関連」とだけ書く | 木構造と関連 list が区別つかない | 「配置」「フォルダ構造」「親フォルダ」 |
| "linked entries" / 「リンク先」だけで relation を説明する | URL 系 link と混同 | 「関連する entry」「参照先 entry」 |
| "Tag entry" を UI に出す | 実装詳細(categorical relation 対向 entry)の露出 | UI では "分類先" / "Category"、本物のユーザ向け Tag 概念は別物 |
| "metadata" を漠然と使う | relation.metadata / entry metadata / export_meta を区別できない | 用途に応じて「provenance 情報」「export 情報」等を明示 |
| "カラータグ" を主ラベルとして多用 | UX 上冗長 | chip / picker の見出しは「カラー」、説明文で 1 度「Color tag(カラー)」と書けば十分 |
| "セマンティック" / "カテゴリカル" のカタカナ | 開発者語が UI に漏れる | "意味" / "分類" |

### 4.1 Banned に近い内部語(UI には絶対出さない)

- `lid`、`rid`、`container_id` — 内部 ID はユーザ向けに絶対出さない(dev log / CSV / export のみ)
- `archetype` — ユーザ向けは「種類」もしくはアイコンで表現
- `kind` — ユーザ向けには "種類" もしくは個別 kind の日本語名(分類 / 意味 / 時系列 / 由来)
- `structural` / `categorical` / `semantic` / `temporal` / `provenance` — ユーザ向けは日本語 label のみ
- `revealInSidebar`、`collapsedFolders` — runtime state 名、UI 露出なし
- `orphan` / `dangling` — manual では「欠損参照」「参照先が見つからない」等の自然な語に変換

<!-- W1-SLICE-A-ANCHOR-PHASE-3 -->

---

## 5. Search / filter implications

### 5.1 Filter バーでの見せ方

filter バーには複数軸が並ぶ(全文 / 種類(archetype) / タグ / カラー / 関連)。label / 表示ルール:

| 軸 | filter バー表示 | 挙動 |
|---|---|---|
| 全文 | 検索ボックス(プレースホルダ: `検索...`) | 既存の `searchQuery` |
| 種類 | "種類" pulldown or chip(archetype アイコン付き) | 既存の `archetypeFilter` |
| **タグ** | 「タグ」chip 追加バー(自由文字列入力) | 新 `tagFilter: Set<string>` |
| **カラー** | カラー swatch 行 | 新 `colorTagFilter` |
| **関連** | "関連" pulldown (kind + peer 指定) | 新 `relationFilter` |

各軸は **視覚的に分離**(区切りまたはサブラベル)。「タグで絞る」と「関連で絞る」を同じ入力欄に混ぜない。

### 5.2 Search syntax(slice C で確定予定、本ドラフトでは prefix 予約のみ)

検索ボックス内で構文的に軸を指定する場合の **prefix 予約**:

- `tag:urgent` — Tag 絞り込み
- `color:red` — Color tag 絞り込み
- `rel:semantic` / `rel:categorical` / `rel:structural` — Relation kind 絞り込み
- `type:text` / `type:todo` — archetype 絞り込み(既存 archetype filter と等価)

本ドラフトでは **予約だけ**。構文の実装・BNF・escape 仕様は Slice C の `search-filter-semantics-v1.md` で固定。

### 5.3 Badge / chip での略称

- **Tag chip**: 文字列そのまま表示。prefix(`tag:`)は UI chip 上では **付けない**
- **Color chip**: 色だけ、文字列なし
- **Relation kind badge**: 日本語 kind 名(「分類」「意味」「時系列」「由来」)
- **Backlinks badge**(sidebar 右端): 数字のみ(例: `3`)。tooltip で `被参照: 3 件`

### 5.4 Saved search(将来)

saved search(`docs/development/saved-searches-v1.md`)の label は「保存した検索」で既存 manual と整合。Tag / Color tag / Relation の新軸が増えてもセクション名は不変。

### 5.5 Storage Profile / diagnostics 側

- **Storage Profile の CSV 列名** は dev-facing なので内部英語 label(`bodyBytes`, `subtreeBodyBytes`, etc.)のまま。UI 表示は Slice A の日本語 label に従う
- **diagnostics panel**(将来): 内部 kind 名や relation id は dev tool 扱い、ユーザ UI から隔離

---

## 6. Cross-doc mapping

本ドラフトが参照される / 将来同期が必要になる docs の pointer。**この PR 時点では同期更新しない**(Slice B 以降で逐次実施)。

### 6.1 既に存在する関連 docs

- `docs/spec/tag-color-tag-relation-separation.md` — 概念分離の一次 source
- `docs/spec/data-model.md §5` — Relation schema(本ドラフトで触れる用語の実体)
- `docs/development/backlinks-panel-v1.md` — backlinks 表示の一次 source
- `docs/development/storage-profile-footprint-scope.md` — 同 docs-first パターンの先行例
- `docs/development/provenance-metadata-semantics.md`(存在する場合) — provenance の意味論
- `docs/spec/schema-migration-policy.md` — Tag / Color tag を additive に追加するときの根拠
- `docs/development/saved-searches-v1.md` — filter UI の既存 pattern

### 6.2 今後同期が必要になりそうな docs / 章

- `docs/manual/03_画面とビュー.md` — meta pane の "関連 / 被参照 / 参照" セクション名の表記統一
- `docs/manual/04_エントリの種類.md` — "タグ" の扱い(現行は categorical relation ベース)の書き換え、Color tag 追加
- `docs/manual/06_キーボードショートカット.md` — Tag / Color tag に shortcut を割り当てる場合の追記
- `docs/manual/09_トラブルシューティングと用語集.md` — 用語集に Tag / Color tag / categorical vs Tag の違いを追記

manual 更新は **Tag / Color tag の実装 slice が着地してから** が健全。本 Slice A はあくまで dev-doc 側の正本化に留める。

### 6.3 コード側の参照地点(変更対象外、参照のみ)

- `src/core/model/relation.ts` — `RelationKind` 現行 5 種
- `src/features/relation/tag-selector.ts` — 旧 "Tag"(= categorical relation)実装。将来 Slice D 以降で `state.tagFilter` rename に伴い参照先変更の可能性
- `src/adapter/ui/renderer.ts` の meta pane(Tags section / Related Entries / Backlinks) — 本ドラフトの label 規約を適用する第一候補

---

## 7. Non-goals

- **コード実装**(Tag / Color tag / UI chip / picker / filter bar / rename のいずれも)
- **data model 確定**(Slice B の `tag-data-model-v1-minimum-scope.md` で別途)
- **search syntax 実装**(Slice C 別 spec)
- **migration tool**(既存 categorical relation → Tag 変換)
- **palette 固定**(Color tag の具体 10 色 ID は Slice E で)
- **manual 全面更新**(実装着地後)
- **INDEX 大規模整理**(#127 を 1 行追加するだけ)
- **ユーザ向け "タグとは何か" の説明文**(manual 側、Slice D の着地後)
- **既存 docs の用語一括 rewrite**(本ドラフトは *指針* を置くだけ)
- **Tag / Color tag が data model に入っていない現時点で、manual に記述する** — 誤った期待を生むので禁止

---

## 8. Next-step options

推奨順:

### Slice B — Tag data model additive minimum-scope draft(docs-only)

- 新規 `docs/spec/tag-data-model-v1-minimum-scope.md`
- `entry.tags?: string[]` のスキーマ、正規化(trim / case / 空文字 / 重複)、最大数、import/export 契約、`state.tagFilter` rename 計画(`state.categoricalPeerFilter` 等への名前明け渡し)、round-trip 試験観点
- 本 Slice A の label 規約をそのまま使う
- 実装はさらに先

### Slice C — Search / filter semantics draft(docs-only)

- `docs/spec/search-filter-semantics-v1.md`
- §2.2 の prefix 予約を正式化、BNF、AND/OR、result visibility(flat vs tree)の契約
- Slice B と並行で docs レビュー可能

### Slice D — Manual 語彙同期(docs-only、Tag UI 実装の前 or 後)

- manual 03 / 04 / 09 の "関連" / "タグ" 用語を本 Slice A の規約に同期
- Tag / Color tag が未実装な現時点では "関連 / 被参照 / 参照 / 配置 / 由来" の既存記述統一にとどめる
- Color tag / Tag の本格記述は、実装 slice が着地してから追加

### Slice E — minimal Tag chip UI prototype(実装、Slice B 後)

- data model が固まってから、meta pane 先頭に chip 行 + inline 入力を実装
- filter UI は Slice C の syntax が固まってから

---

## 関連

- 概念分離: `../spec/tag-color-tag-relation-separation.md`
- データモデル: `../spec/data-model.md §5`
- migration policy: `../spec/schema-migration-policy.md`
- 同パターン先行例: `./storage-profile-footprint-scope.md`

---

**Status**: W1 Tag wave 着地済み(2026-04-23)。Tag label(タグ / `tag:` prefix)は実装済みで "予約語" ではなくなった。Color tag label は次 wave まで引き続き予約扱い。UI・manual・dev docs での語彙統一の正本として有効。
