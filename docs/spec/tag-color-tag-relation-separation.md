# Tag / Color Tag / Relation — 概念分離(docs-first)

## 1. Purpose / Status

PKC2 の「エントリに貼る軽いラベル」「色分類」「エントリ間のつながり」は現在、内部では単一の `Relation` モデル(categorical kind を含む)に寄せられている。UX 上はラベル・色・つながりが別のメンタルモデルで扱われるため、このまま次の feature wave(tag wave / search wave / UI wave)に進むと UI 命名・検索意味論・データ表現の各所で衝突する恐れがある。

この文書は、**実装の前に用語と役割分担を正本化する docs-first ドラフト** である。実装 PR ではない。以降の slice(tag UI / color tag UI / search syntax / data model additive 変更)がこの文書の判断基準に従って進められるよう、以下を固定する:

1. Tag / Color tag / Relation / categorical relation / structural relation の **定義と境界**
2. どの概念で何を持つべきかの **判断フレーム**
3. UI / 検索 / フィルタ / 表示での **見せ分け規約**
4. 既存データモデルを壊さない **互換境界**

対応する実装モジュール(参照のみ、変更対象ではない):

- `src/core/model/relation.ts` — `RelationKind` の現行 5 種
- `docs/spec/data-model.md §5` — Relation schema / kind の契約
- `src/features/relation/tag-selector.ts` — `getTagsForEntry` / `getAvailableTagTargets`(現行の "tag" 実装、categorical relation 依存)
- `src/features/relation/tag-filter.ts` — `filterByTag`
- `src/adapter/ui/renderer.ts` の Tags section(meta pane 内)
- `src/adapter/state/app-state.ts` の `tagFilter: string | null`(= 単一 tag lid)

---

## 2. Current ambiguity

### 2.1 "Tag" という語が 2 つの意味を兼ねている

現行 UI / docs で "tag" と言うとき、次の 2 つが混在している:

- **データモデル上の実体**: "tag entry"(`from === entry`, `to === tag entry`, `kind === 'categorical'` の Relation)
- **UX 上の軽量ラベル**: ユーザが「urgent」「読書メモ」などの短い文字列を entry に貼る感覚で付ける分類

実装上は前者しか存在しないため、ユーザが後者を期待して「urgent というラベルを貼りたい」と操作したとき、実際には **"urgent" という名前の entry を先に作り、それに categorical relation を張る** 必要がある。UX が重く、軽量ラベルの期待と合致しない。

### 2.2 Color tag は未定義の概念

"color tag" は過去のトリアージで登場したが、現行データモデル・実装・docs のどこにも存在しない。したがって:

- 単なる視覚装飾なのか、分類意味論を持つのか未定
- Tag との関係(Tag に色を付けたもの / Tag とは別の軸)が未定
- 固定 palette なのか自由色なのか未定

未定義のまま UI で呼ばれると、**意味が発散する前に固定する必要がある**。

### 2.3 Relation の 5 kind は意味論が広く、taggy な用途と構造的用途が同居している

`RelationKind` の現行 5 種(`structural` / `categorical` / `semantic` / `temporal` / `provenance`)のうち、`structural` と `provenance` は構造・因果を表す重い概念で UI 上も独立導線を持つ(tree / conversion origin)。一方 `categorical` / `semantic` / `temporal` は UI 上 **"同じ Related Entries 列" に並んで見える** ことが多く、意味上の差は kind の select から推測するしかない。

このまま Tag / Color tag を既存 kind に追加で押し込むと、同じ meta pane でさらに概念が重層化し、境界が崩れる。

### 2.4 Backlinks / references / summary / search / filter で visibility が非対称

- **Relation** は meta pane の Related Entries / Backlinks / References summary で可視化され、relation id ごとの CRUD 対象
- **"Tag"(= categorical relation)** は同じ relation 系インフラに乗っているが、UX 上は chip で軽く見せたい
- **Search** は `state.searchQuery` の全文検索 + `state.archetypeFilter` + `state.tagFilter`(単一 tag lid)の 3 軸で、Tag と Relation の検索は現在 **同じ store・同じ pane に出るが別 field** という中途半端な状態

ユーザから見ると "Tag で絞る" と "Relation で絞る" は別操作として期待されるはずだが、内部的にはどちらも relations の categorical / semantic / temporal 走査に帰着し、区別が曖昧。

### 2.5 Import / export / round-trip での伝播が未整理

将来 Tag を自由文字列として entry に直接持たせるとしたら、HTML export / ZIP export / sister bundle に Tag 情報がどう含まれるかは未設計。既存の categorical relation は `container.relations` として出ていくので互換の心配はないが、**新しい Tag 表現を追加したときに round-trip が壊れないか** は事前に境界を決めておく必要がある。

---

## 3. Concept definitions

このドラフトでは次の 5 概念を明示的に **別物** として扱う。

### 3.1 Tag(将来導入予定の新概念)

- **定義**: エントリ単体に貼る自由文字列の軽量ラベル。ユーザが任意のタイミングで入力し、entry に属性として紐付く
- **形態**: entry の属性(`entry.tags?: string[]` もしくは `container.entry_tags: Record<lid, string[]>`、実装 slice で決定)
- **粒度**: 1 エントリに複数。文字列としての一意性(大文字小文字・正規化・空白)の扱いは slice B で決定
- **UX**: chip / badge で軽く表示、入力は inline textbox
- **削除コスト**: 軽い。entry のプロパティ変更のみ
- **検索**: 完全一致 / 部分一致 / 複数 AND-OR
- **意味論上の注意**: tag は **エントリ単体の分類** であり、他 entry への参照ではない。もし「tag が 1 つの概念エンティティであるべき」場合、それは Tag ではなく **tag entry への categorical relation** を使う(§3.4 と区別)

### 3.2 Color tag(将来導入予定の新概念)

- **定義**: エントリの視覚的フォーカス用カラーマーカー。作業中の進行状況や優先度を色で示すためのもの
- **形態**: entry の属性(`entry.color_tag?: ColorTagId`)。ColorTagId は **固定 palette 上の識別子**(例 `red` / `amber` / `green` / `blue` / `violet` / ~10 種)
- **粒度**: 1 エントリに 1 つ(`null` = 未指定)。複数併記は UI 的にノイズになるので禁止
- **UX**: sidebar 行のサイドバー色インジケータ、detail / meta pane のアクセント色
- **削除コスト**: 軽い。entry のプロパティ変更のみ
- **検索**: 色単位の絞り込み(`state.colorTagFilter`)。Tag とは独立軸
- **意味論上の注意**: **意味を過積載しない**。色を「締切近い」「チーム A」「重要」などのビジネスロジック指標に独占させない。Color tag は `focus marker` であり、Tag と Relation の意味体系とは直交する第 3 軸

### 3.3 Relation(既存)

- **定義**: エントリ間の型付きリンク。`{from, to, kind}` で表現され、有向・一意 id を持つ
- **形態**: `container.relations[]`、`core/model/relation.ts` で定義済み
- **粒度**: `(from, to)` ペアごとに独立。同一ペアに複数 kind も許容(現行契約)
- **UX**: meta pane の Related Entries section / backlinks badge / references summary / relation editor の select
- **削除コスト**: 中。relation id の明示的 DELETE_RELATION が必要
- **検索**: kind フィルタ / endpoint 検索(今後設計)
- **意味論上の注意**: relation は **エントリ間の意味付きつながり**。エントリ単体の属性ではない

### 3.4 categorical relation(既存、Relation の subkind)

- **定義**: `kind === 'categorical'` の Relation。from は被分類 entry、to は分類用 entry
- **現行の位置づけ**: `src/features/relation/tag-selector.ts` の "Tag" 実装基盤
- **将来の位置づけ(本ドラフト提案)**:
  - 新 Tag 概念(§3.1)とは **異なる** 用途として残す
  - categorical relation は「**ある entry を別 entry の下に分類する**」ケース(タクソノミ的 / オントロジ的)を表現する — 例: "文書 D はプロジェクト P のもの" を P という entry への categorical 関係で表す
  - 軽量ラベルとしての "tag" は新 Tag に移し、categorical relation は **共有・ナビゲーション可能な分類 entity が必要なとき** だけ使う
- **移行方針**: 既存の categorical relation データは **そのまま残し、即時変換しない**(§7 参照)

### 3.5 structural relation(既存、Relation の subkind)

- **定義**: `kind === 'structural'` の Relation。from = 親 folder、to = 子 entry
- **位置づけ**: tree 構築の唯一の根拠。DAG 制約(P1 救済 + P2 入口 block で二重防御済み)
- **本ドラフトでは変更対象外**: Tag / Color tag / categorical relation の議論とは独立
- **注意**: structural と categorical は concept として混ざらない。structural は**木構造の配置**、categorical は**意味分類の所属**
<!-- W1-ANCHOR-PHASE-2 -->

---

## 4. Decision framework

「どの概念で持つべきか」の第一フィルタは次の 4 問。**上から順に評価し、最初に Yes が付いた段階で対応概念を選ぶ**:

1. **それは木構造上の位置関係か?**(folder 所属 / 親子関係 / tree 配置)  
   → **Yes: structural relation**。DnD、breadcrumb、左ペイン tree を使う UX になる
2. **それは別の具体的 entry への意味付きつながりか?**(参照 / 因果 / 時系列 / 双方向を張りたい)  
   → **Yes: Relation (semantic / temporal / provenance)**。meta pane Relations / Backlinks に現れる
3. **それはエントリ単体に付く軽量ラベルで、他 entry への参照ではないか?**(入力が文字列、同じ文字列を複数 entry に再利用するが、その文字列自体は entry として存在しなくてよい)  
   → **Yes: Tag**(§3.1、自由文字列属性)
4. **それはエントリの視覚的フォーカス分類か?**(色で作業状態を示したい、1 entry に 1 色)  
   → **Yes: Color tag**(§3.2、固定 palette の属性)

どれにも当てはまらない場合:

- "ある entry が別 entry にカテゴリとして所属する" ような分類 entity 的表現がほしい → **categorical relation**(§3.4)を使う。ただし UX 的に重いので、軽量ラベルで済む場合は Tag を優先

### 4.1 判断早見表

| 例 | 選ぶ概念 | 理由 |
|---|---|---|
| "プロジェクト A" フォルダに文書を入れる | structural relation | 木構造上の配置 |
| "この文書は文書 Y を引用している" | semantic relation | 別 entry への意味付きつながり |
| "この文書は会議 X から派生した" | provenance relation | 因果の記録(自動 / 変換元) |
| "urgent / 読書メモ / draft" の自由ラベル | **Tag** | エントリ単体の軽量分類、入力は文字列 |
| "赤 = 進行中 / 緑 = 完了" の視覚マーカー | **Color tag** | 視覚フォーカス、1 entry に 1 色 |
| "この文書は『デザインパターン』という分類 entity に属する(その分類 entity 自身にも詳細文書がある)" | categorical relation | 分類先自体が独立した entry として存在・編集される |
| "締切近い todo だけ絞り込みたい" | **Tag ではなく todo.date + Color tag** | body 属性や color で表現、tag に業務ロジックを入れない |

### 4.2 アンチパターン

- **Tag と categorical relation の両方で同じ意味を表現しない**。Tag `"urgent"` と categorical relation to `urgent` entry が並存すると、filter 時にどちらをヒットさせるか曖昧になる
- **Color tag に意味を持たせすぎない**。色に "締切" / "チーム" / "優先度" を同時に載せると、用途が増えた瞬間に palette が足りなくなる。色は視覚的グループ化のみ
- **Tag を entry 化して relation で張ることはしない**。それは categorical relation の役割であり、Tag 自体は entry として存在しない
- **structural relation を "カテゴリ所属" に転用しない**。structural は木構造、それ以外の分類は categorical または Tag

---

## 5. UI implications

### 5.1 見せる場所と重さ

| 概念 | UI 位置 | 重さ | 編集導線 |
|---|---|---|---|
| structural relation | 左サイドバー tree / breadcrumb / Move-to-folder | 重(構造を表す) | DnD、Move to folder select |
| Relation (semantic / categorical / temporal / provenance) | 右 meta pane の Related Entries / Backlinks / References summary | 中 | Relation picker select + kind select |
| **Tag** | entry detail ヘッダ下 or meta pane 先頭の chip 行 | 軽(小さい chip) | chip 内 inline textbox、Enter で追加 |
| **Color tag** | 左サイドバー行の色バー + detail ヘッダのアクセント色 | 視覚的のみ | メニューから palette picker |

### 5.2 優先順位と visual hierarchy

同じ画面に複数の概念が出たときの視覚優先順位(高 → 低):

1. **structural** — サイドバーツリーの folding / breadcrumb
2. **Color tag** — 色バーで視覚分類(structural と直交するので、両方見えても衝突しない)
3. **Tag** — chip 行。短く、密度を上げて表示してよい
4. **Relation (非 structural)** — meta pane に独立セクションとして並べる

### 5.3 命名規約(UI labels)

- **「タグ」/ "Tags"**: §3.1 の Tag 専用。categorical relation を「タグ」と呼ばない
- **「カラー」/ "Color"**: Color tag 専用。"カラータグ" とは呼ばず "カラー" または "Color" に統一(UI 上の label)
- **「関連」/ "Related"**: semantic / temporal / categorical relation の総称。meta pane のセクション名として使う
- **「由来」/ "Provenance"**: provenance relation 専用。他の kind と混ぜない
- **「配置」/ "Location"**: structural relation の親(breadcrumb / 所属フォルダ)。"関連" には含めない

### 5.4 relation をタグのように並べない原則

meta pane の Related Entries を chip 風に横並びで羅列すると Tag との境界が見えなくなる。Relation は **セクション構造(List)** を保ち、Tag は **chip 行** として視覚的に別レイヤにする。

### 5.5 UI 上混ぜてよいのは filter バー

検索 / フィルタ UI の文脈では、Tag 絞り込みと Relation 絞り込みが同じバーに並んでよい(両者とも「絞る」行為で意味的に同じユーザ意図)。ただし **backing store が別であることを内部で明示**(§6)。

---

## 6. Search / filter implications

### 6.1 独立した検索軸

現在の AppState(`searchQuery` / `archetypeFilter` / `tagFilter` の 3 軸)を Tag / Color tag / Relation 導入後に次の 5 軸に拡張する(実装は slice C で):

| 軸 | 現行 state | 将来 state | 検索対象 |
|---|---|---|---|
| 全文 | `searchQuery` | `searchQuery` | title + body |
| archetype | `archetypeFilter: Set<ArchetypeId>` | 同上 | `entry.archetype` |
| **Tag**(新) | — | `tagFilter: Set<string>`(自由文字列の複数) | `entry.tags` |
| **Color tag**(新) | — | `colorTagFilter: Set<ColorTagId> | null` | `entry.color_tag` |
| Relation | `tagFilter: string | null`(= categorical relation 対向 lid 1 件) | `relationFilter: { kind?, peerLid? }` | `container.relations` |

重要: 現在の `state.tagFilter`(単一 lid)は **実質 categorical relation フィルタ** なので、新 Tag 導入時に名前を衝突させないよう **rename する**(例: `relationPeerFilter` / `categoricalPeerFilter`)。

### 6.2 意味の違いを UI で曖昧にしない

- **"Tag で絞る"** と **"Relation で絞る"** は別操作であることを、filter バー上で見た目でも区別する(icon / section 分け)
- **"Color で絞る"** は palette picker として独立 UI
- **全文検索内で `tag:xxx` / `color:red` / `rel:semantic` のような query syntax** を導入する場合は、slice C で別 spec(`search-syntax-v1.md` 的に)として固定してから実装

### 6.3 multi-select 意味論

- **Tag filter**: 複数 Tag は **AND**(全て持つ entry)が自然。OR モードは明示トグルが必要なら slice で判断
- **Color tag filter**: 1 entry 1 color なので **OR のみ**(選択した色のいずれかを持つ entry)
- **archetype filter**: 既存通り OR
- **全文 + Tag + Color + archetype + Relation**: **軸間は AND**(各軸の条件を満たす entry を狭める)

### 6.4 検索結果の表示

現在 search / filter 有効時は sidebar が **flat list** にフォールバックする(`renderer.ts:1908` "tree doesn't make sense for search results")。この契約は本ドラフトでは変更しない — 階層維持検索は別 wave(`search-result-hierarchy.md` 将来 spec)で判断する。ただし **Tag filter 単独で絞った場合も flat** になる点は、次の slice で UX レビューする余地あり。

<!-- W1-ANCHOR-PHASE-3 -->

---

## 7. Migration / compatibility considerations

### 7.1 既存 categorical relation を即時変換しない

現行ワークスペースには "tag として categorical relation で運用している" データがある可能性がある。これを **自動で Tag(§3.1)に変換しない**。理由:

- categorical relation は relation id / timestamp / metadata を持ち、round-trip の互換単位として既に固定
- Tag は entry 属性としての新規格納位置を持つ(§3.1)ので、変換はデータ構造の根本を変える
- 変換側で情報が落ちる(relation id、created_at、metadata)

方針: **両方を併存させ、ユーザが明示的に変換するツールを別 slice(migration tool)で提供**。Tag が先に登場し、その後ユーザが必要に応じて categorical relation を Tag に書き換える。

### 7.2 Tag を additive に追加する

Tag の data model は既存 `Entry` / `Container` と後方互換で追加する。最低限の条件:

- 既存の container JSON に `tags` フィールドが無い場合、**空配列として扱う**
- 既存の sister bundle / HTML export / ZIP export が `tags` を知らなくても、import 時に欠落として扱う(= 全 entry の tags が空)
- schema_version は bump しない — additive optional field 追加は既存 migration policy(`docs/spec/schema-migration-policy.md`)の "additive" 分類
- round-trip 試験: Tag 付き container を v-current でも v-old でも読み書きしたとき、v-old では tags が失われるだけでほか壊れない

### 7.3 Color tag も additive

Color tag の格納(`entry.color_tag?: ColorTagId`)も同じく additive。palette は固定 ID 文字列(`red` / `amber` / `green` / `blue` / `violet` / ...)とし、import 側で未知 ID は `null` に fallback。palette は **ロックされた固定集合**(実装 slice で確定)。

### 7.4 Import/export に乗せるかの判断

- **HTML export**: Tag / Color tag は entry 属性として当然含まれる(`entry.tags` / `entry.color_tag` が export に出る)
- **ZIP export / sister bundle**: 同上
- **record:offer transport**: Tag / Color tag を含めるかは capture profile の判断(P5 wave 側で `record-offer-capture-profile.md` 更新)
- **categorical relation**: 既存通り `container.relations` として全 export 形式に出続ける

### 7.5 UI / state migration

- `state.tagFilter: string | null`(= categorical relation 対向 lid)は **rename が必要**。新 Tag の `tagFilter: Set<string>` と衝突する命名
- rename 案: `state.tagFilter` → `state.relationPeerFilter` もしくは `state.categoricalPeerFilter`
- 既存テストは 100 件程度この state 名に言及しているので、rename は slice B でまとめて実施

---

## 8. Non-goals

本ドラフトでは **以下を行わない**:

- **コード実装**(Tag / Color tag のいずれも)
- 既存 relation model の破壊的変更(kind 追加 / kind 削除 / schema bump)
- `state.tagFilter` の即時 rename
- search syntax(`tag:xxx`, `color:red` 等)の正本化 — slice C の別 spec で扱う
- Tag / Color tag UI chip のレイアウト / CSS
- migration tool(categorical relation → Tag 変換ウィザード)の実装
- graph visualization(tag cloud / tag-entry 相互参照グラフ)
- 他人格ワークスペース間での Tag 共有 / 同期
- "tag に意味を付けすぎない" 原則を機械的に強制する validator
- manual / user-facing docs の大規模更新 — Tag UI 実装 slice が着地した後に対応

---

## 9. Next-step options

以下の slice を将来 PR 候補として整理する。**本ドラフト時点では実装しない**。

### Slice A — UI vocabulary 固定(docs-only)

- `docs/development/` 配下に "UI label 辞書" を 1 本追加し、"タグ" / "カラー" / "関連" / "配置" / "由来" の日本語 UI label を固定
- 新規 UI が出るたびに参照する用語源として使う
- 実装コストゼロ

### Slice B — Tag data model additive draft(docs-only、次期実装への前段)

- `docs/spec/tag-data-model-v1-minimum-scope.md` を追加
- `entry.tags?: string[]` のスキーマ、正規化規則、round-trip、`state.tagFilter` rename 計画
- 実装 PR はこの spec が固まってから

### Slice C — Search/filter semantics draft(docs-only)

- `docs/spec/search-filter-semantics-v1.md` を追加
- 5 軸(全文 / archetype / Tag / Color tag / Relation)の AND / OR、combinator、result visibility(flat vs tree)を固定
- query syntax(`tag:` / `color:` / `rel:`)を採用するか決定

### Slice D — minimal Tag chip UI prototype(実装、slice B 後)

- Tag の data model が固まってから、meta pane 上部に chip 行 + inline 入力を実装
- Tag filter UI はまだ出さない(Slice C 後に)

### Slice E — Color tag palette 固定 + UI(実装、slice B 後)

- palette の 10 色 ID を固定する spec(`docs/spec/color-tag-palette-v1.md`)
- sidebar 色バー + detail アクセント色の実装

### Slice F — categorical relation → Tag migration tool(実装、Tag UI 着地後)

- ユーザが明示的に既存 categorical relation を Tag 化するための UI
- relation 側は残したまま、新 Tag を同時に付けるオプション(並存)も提供

推奨着手順: **A → B → C → D → E → F**。A-C は docs-only で前 3 件まとめてレビュー、D-F は実装 slice として段階的に着地。

---

## 関連 docs

- `docs/spec/data-model.md §5` — Relation schema 契約(本ドラフトは §5 を変更しない)
- `docs/spec/schema-migration-policy.md` — additive 変更の取り扱い
- `docs/development/backlinks-panel-v1.md` — 既存 relation 可視化との境界参考
- `docs/development/storage-profile-footprint-scope.md` — 同パターンの docs-first scope 固定(asset vs full footprint)の例

---

**Status**: docs-first scope clarification。実装 PR は未着手。本ドラフトを参照する次の slice が立ち上がるまで、既存データモデル・UI・検索挙動はすべて現行のまま。
