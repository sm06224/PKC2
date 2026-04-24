# Link Index v1 — Behavior Contract

Status: 実装済み(C-3 link-index v1、v2.1.0 以前に landing、v2.1.1 時点で稼働中、HANDOVER_FINAL §22.1 landed 宣言済み)。本書は behavior contract / historical design record として保持。実装の現物は `src/features/link-index/link-index.ts` / `tests/features/link-index/link-index.test.ts`。
Created: 2026-04-17
Category: C. Data Model Extensions（ナビゲーション UX 寄り）
Predecessor: `docs/spec/link-index-v1-minimum-scope.md`（同日、feasibility spec）
Purpose: C-3 link-index v1 の振る舞い契約を固定し、pure → UI → audit → manual の実装 pipeline の入口を確定する

---

## 0. 位置づけ

本書は C-3 テーマの **behavior contract** である。minimum scope が「何を扱うか」を決めたのに対し、本書は「**どう扱うか**」を固定する（data contract / pure helper シグネチャ / UI selector / gate / invariance 最終化）。

- 本書の役割: pure / UI 実装が参照する **唯一の契約**
- 本書承認後に pure slice → UI slice → post-impl audit → manual sync の順で進める
- state slice は原則 **skip**（supervisor fixed、§3.4 / §5 参照）

### 0.1 supervisor 固定事項

contract 段階で ambiguity を残さないため、以下 4 点は固定:

1. **v1 は runtime-only index**（persisted index を持たない）
2. **v1 対象 link は body 内の `entry:` scheme 参照のみ**
3. **v1 機能は Outgoing / Backlinks / Broken の 3 つのみ**
4. **state slice は不要**（pure → UI で進める）

### 0.2 関連 doc

| doc | 関係 |
|-----|-----|
| `docs/spec/link-index-v1-minimum-scope.md` | 前段 feasibility。scope / invariants / 非対象の根拠 |
| `docs/spec/body-formats.md §10` | `entry:` scheme 記法の canonical spec |
| `src/features/entry-ref/extract-entry-refs.ts` | `extractEntryReferences` 抽出 helper（流用） |
| `src/core/model/relation.ts` | `RelationKind`。v1 で touch しない証跡 |

---

## 1. Scope

### 1.1 対象 entry archetype（source 側）

link-index が **source body** として scan する archetype:

| archetype | scan 対象の body | 備考 |
|---|---|---|
| `text` | `entry.body`（markdown） | ○ |
| `textlog` | 全 log の `text` を結合して scan | log 粒度の source 識別は v1 UI 非対象（§4.8） |
| `folder` | `entry.body`（description、markdown） | ○ |
| `todo` | todo body JSON の `description` 文字列のみ | status / date は対象外 |
| `form` | — | × body が markdown でない |
| `attachment` | — | × body が markdown でない |
| `generic` / `opaque` | — | × body は opaque |

### 1.2 対象本文領域（target 側）

target は **container 内の `Entry.lid`** のみ。外部 container / cross-container federation は v1 対象外。

### 1.3 `entry:` scheme の対象定義

`docs/spec/body-formats.md §10` で canonical に定義された全形式を受理する:

| 形式 | 対象 | 備考 |
|---|---|---|
| `entry:<lid>` | ○ | bare reference |
| `[label](entry:<lid>)` | ○ | link reference |
| `[label](entry:<lid>#<fragment>)` | ○ | fragment は捨てて target lid のみ使用 |
| `![](entry:<lid>)` / `![alt](entry:<lid>)` | ○ | embed 形式も参照 1 件としてカウント |

`parseEntryRef` は使用しない。v1 は target lid しか要らないので `extractEntryReferences` の `Set<string>` 出力で十分。

### 1.4 runtime-only の意味

- `buildLinkIndex(container)` が呼ばれる **たびに再計算** する
- `Container` / `Entry` / `Relation` / `Revision` の schema に一切追加しない（SCHEMA_VERSION 据え置き）
- 永続化しない（IDB にも HTML export にも出力しない）
- AppState にも `linkIndex` を保持しない（毎 render で UI から pure 呼び出し）

memoization が必要になった場合は adapter 側 UI 層で `WeakMap<Container, LinkIndex>` 等の runtime cache として入れる（contract 義務ではない、将来拡張余地）。

---

## 2. Data contract

### 2.1 Types（v1 正本）

```ts
// Source archetype の列挙（§1.1）
type LinkSourceArchetype = 'text' | 'textlog' | 'folder' | 'todo';

// 1 つの entry:<target> 参照
interface LinkRef {
  /** 参照を含む entry の LID */
  sourceLid: string;
  /** 参照を含む entry の archetype */
  sourceArchetype: LinkSourceArchetype;
  /** 参照先の LID（`entry:<lid>` から抽出、fragment は捨てる） */
  targetLid: string;
  /** target LID が container.entries に存在するか */
  resolved: boolean;
}

// container 全体の link 派生値
interface LinkIndex {
  /** sourceLid → その entry から出ていく参照の配列 */
  outgoingBySource: ReadonlyMap<string, readonly LinkRef[]>;
  /** targetLid → その entry を指している参照の配列（resolved=true のみ） */
  backlinksByTarget: ReadonlyMap<string, readonly LinkRef[]>;
  /** container 全体の broken ref 一覧（resolved=false のもの） */
  broken: readonly LinkRef[];
}
```

### 2.2 target lid の解決規則

- `resolved = container.entries.some(e => e.lid === ref.targetLid)`
- 大文字小文字は **区別する**（LID は opaque token、正規化しない）
- target lid の trim / unicode normalize も行わない
- `extractEntryReferences` の正規表現 `entry:([A-Za-z0-9_-]+)` に合致しない token は最初から抽出されない

### 2.3 unresolved（broken）の定義

`resolved === false` の `LinkRef`。以下も broken に含める:

- target LID が 0 文字（regex で弾かれるので発生しない、保険）
- target LID が削除済み entry の LID（`container.entries` に無い）

### 2.4 deterministic rules（順序と重複）

| 規則 | 挙動 |
|---|---|
| **重複参照（同 entry → 同 target）** | `extractEntryReferences` が `Set<string>` を返すため、同一 source・同一 target は **1 件に dedupe** される |
| **出現順序（1 つの source 内）** | `Set` の iteration 順（= markdown 内の最初の regex match 順）を保つ |
| **source の並び** | `container.entries` の配列順に走査する |
| **Outgoing リストの並び** | `container.entries` で source 自体を見つけたときの走査順に target が出現した順 |
| **Backlinks リストの並び** | `container.entries` を走査するので、他 source の配列順 |
| **Broken リストの並び** | `container.entries` 走査順、かつ 1 entry 内は最初の regex match 順 |

`buildLinkIndex` は **副作用なし・決定的**。同じ `Container` 入力に対し等価な出力（Map キー集合 / 各配列の要素 / 順序が一致）を返す。

### 2.5 self-link の扱い

`sourceLid === targetLid` の ref:

- Outgoing に含める（resolved=true）
- Backlinks にも **自分自身を含める**（source=self として出現）
- broken には含まれない（self は必ず resolved）

v1 UI は self-link を特別扱いしない（通常の entry item として描画）。将来の v1.x で badge 追加余地（§8）。

---

## 3. Pure helper contract

### 3.1 配置と依存制約

- すべて **features 層** (`src/features/link-index/`) に配置
- `core` model（`Container` / `Entry`）のみ import 可
- DOM / AppState / dispatcher / browser API **非依存**（I-LinkIdx1）
- 既存 `src/features/entry-ref/extract-entry-refs.ts` の `extractEntryReferences` を import して流用

### 3.2 helper シグネチャ

```ts
/**
 * 1 つの entry から source body を archetype に応じて選び、
 * そこに含まれる `entry:<lid>` 参照を LinkRef[] として返す。
 * §1.1 の対象 archetype 以外は空配列。
 */
function extractRefsFromEntry(entry: Entry): LinkRef[];

/**
 * container 全体を走査し、全 LinkRef を走査順で返す。
 * resolved は container.entries の存在チェックで判定する。
 */
function collectLinkRefs(container: Container): LinkRef[];

/**
 * collectLinkRefs の結果を 3 つの派生形に畳み込む。
 * Outgoing / Backlinks / Broken の 3 ビューを同時に作る。
 */
function buildLinkIndex(container: Container): LinkIndex;
```

### 3.3 source body 選択規則（archetype 別）

| archetype | scan 対象 string |
|---|---|
| `text` | `entry.body`（そのまま markdown） |
| `textlog` | `parseTextlogBody(entry.body).logs` の各 `text` を **`'\n'` で join** |
| `folder` | `entry.body` |
| `todo` | `parseTodoBody(entry.body).description`（null / 空なら空文字） |

parse エラー（malformed textlog / todo body）は **空文字として扱う**（pure helper は throw しない、I-LinkIdx1 を優先）。

### 3.4 テスト方針（contract 要件）

pure test は以下の 6 カテゴリを網羅:

1. 空 container → `outgoingBySource` / `backlinksByTarget` 空 Map、`broken` 空配列
2. 対象 archetype（text / textlog / folder / todo description）それぞれで 1 件ずつ抽出
3. 対象外 archetype（form / attachment / generic / opaque）→ 無視
4. broken ref（target LID が存在しない）→ `broken` に出現、`backlinksByTarget` には出現しない
5. 重複 ref（同 entry 内の同 target 複数 occurrence）→ 1 件に dedupe
6. self-link → Outgoing と Backlinks の両方に出現、broken に無し

---

## 4. UI contract

### 4.1 表示位置

- **選択中 entry の Outgoing / Backlinks**: 中央 meta pane（右側の entry 詳細情報領域）に新セクションとして追加
- **Container 全体の Broken 一覧**: 同じ meta pane 内の別セクション、または専用ダイアログ（後者を v1 採用、起動 trigger は 4.7）
- 既存 meta pane の構成（revision list / relation list / tag 等）は **一切変更しない**

### 4.2 Outgoing section

- region: `data-pkc-region="link-index-outgoing"`
- ヘッダ: `Outgoing (N)`（N = 該当 entry の outgoing ref 件数）
- 行要素: `data-pkc-action="select-entry"` + `data-pkc-lid="<targetLid>"`
- resolved の行: target entry の title を表示
- **broken** の行（resolved=false）: raw target LID を表示 + `data-pkc-broken="true"`、**click で select しない**（action-binder で broken は no-op）

### 4.3 Backlinks section

- region: `data-pkc-region="link-index-backlinks"`
- ヘッダ: `Backlinks (M)`
- 行要素: `data-pkc-action="select-entry"` + `data-pkc-lid="<sourceLid>"`
- 表示: source entry の title（archetype icon があれば付加、v1 必須ではない）
- **backlinks に broken は混ぜない**（resolved=true のみ、§2.1）

### 4.4 Broken 全体 view

- region: `data-pkc-region="link-index-broken"`
- 行要素: `data-pkc-action="select-entry"` + `data-pkc-lid="<sourceLid>"`（click で source entry へ飛ぶ）
- 各行に「`sourceLid` → `broken target string`」を表示
- v1 は**並び=`container.entries` 走査順 / 1 entry 内は最初の regex match 順**（§2.4）

### 4.5 Empty state

| 条件 | 表示 |
|---|---|
| 選択中 entry が Outgoing を持たない | Outgoing section 自体は残し、中身に "No outgoing links." を表示 |
| 選択中 entry が Backlinks を持たない | Backlinks section 自体は残し、中身に "No backlinks." を表示 |
| container 全体に broken が無い | Broken 全体 view 起動時に "No broken links." を表示 |

### 4.6 DOM selector 一覧（contract 正本）

実装と test は以下の selector だけを使う。CSS class 名での functional selection は禁止。

| selector | 意味 |
|---|---|
| `[data-pkc-region="link-index-outgoing"]` | Outgoing section のルート |
| `[data-pkc-region="link-index-backlinks"]` | Backlinks section のルート |
| `[data-pkc-region="link-index-broken"]` | Broken 全体 view のルート |
| `[data-pkc-action="select-entry"][data-pkc-lid]` | link-index 内の click 可能な行（既存 select-entry を再利用） |
| `[data-pkc-broken="true"]` | broken ref 行のマーカー（click 不可） |
| `[data-pkc-action="open-link-index-broken"]` | Broken 全体 view を起動するボタン |

### 4.7 Broken 全体 view の起動

- `data-pkc-action="open-link-index-broken"` のボタンを meta pane のフッタ領域に配置
- click で reducer に `OPEN_LINK_INDEX_BROKEN` action を dispatch... **ではなく**、v1 は `state slice 不要` 方針（§5 I-LinkIdx-NoState）に基づき **overlay 開閉は既存の modal 系 pattern を流用**（具体は UI 実装段階で既存 modal helper に合わせる、本 contract は selector 命名のみ固定）

### 4.8 選択中 entry が textlog の場合

- source 表示の granularity は **entry 粒度のみ**（log id は v1 UI に出さない）
- 内部データは `LinkRef.sourceLid` だけを持ち、log id は **LinkRef に含めない**（将来拡張時に optional field で追加する余地を残す、§8）

### 4.9 readonly / lightSource / viewOnlySource での表示

- 3 モードすべてで Outgoing / Backlinks / Broken 全体 view を **表示する**（read-only 派生値、I-LinkIdx6）
- click で `select-entry` する挙動も同様に許可（selection は UI-only、container を mutate しない）

---

## 5. Invariance（v1 正本、実装・audit はこの番号を引用）

| # | 名前 | 定義 |
|---|---|---|
| **I-LinkIdx1** | read-only derivation | index は `Container` を一切 mutate しない。pure 関数の出力のみ |
| **I-LinkIdx2** | schema 不変 | `Container` / `Entry` / `Relation` / `Revision` の schema に追加フィールドを作らない。SCHEMA_VERSION 据え置き |
| **I-LinkIdx3** | relation 非干渉 | `Relation` の作成・削除・kind 変更を行わない。既存 relation は link-index の入力にも出力にもならない |
| **I-LinkIdx4** | revision 非干渉 | revision 生成 / restore / `prev_rid` / `content_hash` に影響しない |
| **I-LinkIdx5** | provenance 非干渉 | `provenance` RelationKind の生成・解釈を変えない |
| **I-LinkIdx6** | readonly / lightSource 整合 | 3 モードで Outgoing / Backlinks / Broken 全体 view が可視。編集操作は無い |
| **I-LinkIdx7** | search 非干渉 | `searchQuery` / `archetypeFilter` / `tagFilter` / `sortKey` と independent。index は filter 結果を書き換えない、search hit を index に混ぜない |
| **I-LinkIdx8** | ordering 非干渉 | `entry_order`（C-2）/ manual ordering に触らない |
| **I-LinkIdx9** | merge 非干渉 | merge preview / conflict resolution（H-10）は link-index の対象外 |
| **I-LinkIdx10** | broken 判定の一意性 | broken の判定は `container.entries.some(e => e.lid === targetLid) === false` のみ。独自の LID 正規化を導入しない |
| **I-LinkIdx-NoState** | state slice skip | AppState に `linkIndex` / `linkIndexOpen` 等のフィールドを追加しない。UI は render 時に pure helper を直呼びする |
| **I-LinkIdx-Selectors** | selector 固定 | §4.6 の `data-pkc-*` selector のみを functional selector として使う。CSS class 名での識別は禁止 |

---

## 6. Gate / error paths

### 6.1 entry 未選択

| 領域 | 挙動 |
|---|---|
| Outgoing section | 非表示（`display:none` ではなく要素自体を render しない） |
| Backlinks section | 同上 |
| Broken 全体 view 起動ボタン | **表示する**（container レベルの情報なので entry 選択は不要） |

### 6.2 選択中 entry の body が空 / 対象 archetype でない

- body 空 → Outgoing 0 件 → "No outgoing links." 表示
- 対象外 archetype（form / attachment / generic / opaque）→ Outgoing 0 件、Backlinks は通常通り計算（target 側としては対象 archetype 非依存で backlink を受けられる）

### 6.3 target が存在しない（broken）

- Outgoing 内で broken マーカー付きで表示
- click 不可（action-binder で `data-pkc-broken="true"` を弾く）
- backlinks には現れない（target entry 自体が無いので backlink の宛先が存在しない）
- Broken 全体 view には 1 件として現れる

### 6.4 self-link

- Outgoing / Backlinks 両方に現れる
- click で自 entry を再 select（no-op に見える挙動、既存 select-entry の冪等性に依存）

### 6.5 duplicate refs（同 entry 内の同 target）

- `extractEntryReferences` の `Set` で dedupe 済み → 1 件として表示

### 6.6 選択中 entry が削除された瞬間

- 次回 render 時に `selectedLid` が `container.entries` に存在しない
- Outgoing / Backlinks は非表示、Broken 全体 view は引き続き機能
- ここは既存 selection 整合ロジックの範囲（link-index 固有の追加挙動は無い）

### 6.7 Broken 全体 view を開いている最中に container が書き換わった

- next render で `buildLinkIndex` を呼び直すので、broken 配列は自動で最新化
- 0 件になったら "No broken links." を表示
- modal の close 挙動は既存 modal pattern 依存（本 contract は規定しない）

---

## 7. Non-goal（v1 で明示的に除外）

minimum scope §6 を正本化する。以下は v1 未実装:

- semantic link inference（類似度 / NLP による link 推薦）
- graph visualization（ノード・エッジ描画）
- external URL validation（HTTP HEAD 等）
- auto-fix（broken link の自動修復 / rename 追従）
- cross-container federation
- persisted index（supervisor fixed）
- orphan entry 専用 view（backlink 0 件で代替）
- Relation-kind 別 index（structural / categorical 等の filter / grouping）
- `[[wiki link]]` 記法の新設
- link-index 専用 archetype の新設（前身 CANDIDATE の案は不採用）
- link 数ランキング / centrality metric
- entry-window 側での Outgoing / Backlinks 複製
- log 粒度 source 表示（textlog の log id まで出す）
- Outgoing / Backlinks のソート切替 UI（v1 は走査順固定）

---

## 8. Future extension boundary

v1.x 以降で追加可能な拡張と、そのために v1 で残してある余地:

| 拡張 | v1 で残してある余地 |
|---|---|
| persisted cache | `LinkIndex` interface を v1 正本に固定しているので `Container.meta.cachedLinkIndex?` として追加可 |
| broader archetype support（`generic` / `form` 等） | `LinkSourceArchetype` union を拡張するだけ（§2.1） |
| log 粒度 backlink | `LinkRef` に `sourceLogId?: string` を optional 追加（§4.8 で非採用の根拠を記載済み） |
| search integration | `LinkIndex` を読み取り専用 input として search side で利用 |
| repair actions（broken を click で rename ダイアログ起動等） | `[data-pkc-broken="true"]` マーカーを v1 で固定してあるので、後段で click behavior だけ足せる |
| graph view | `buildLinkIndex` 出力を force-layout 側に feed（pure helper 契約は変えない） |
| self-link badge / embed vs link の種別区別 | `LinkRef` に `refForm?: 'bare' \| 'link' \| 'embed'` を optional 追加 |

いずれも v1 の **I-LinkIdx1〜10 を破らずに** 拡張できる。

---

## 9. Examples

### 9.1 単純 backlink

Container:

- `A`（text, body: `"see [details](entry:B)"`）
- `B`（text, body: `"..."`）

`buildLinkIndex` 結果:

```
outgoingBySource:
  A → [ { sourceLid:'A', sourceArchetype:'text', targetLid:'B', resolved:true } ]
backlinksByTarget:
  B → [ { sourceLid:'A', sourceArchetype:'text', targetLid:'B', resolved:true } ]
broken: []
```

選択中 = B のとき UI:
- Outgoing: "No outgoing links."
- Backlinks: 1 件（A）

### 9.2 broken link

Container:

- `A`（text, body: `"orphan ref: [missing](entry:Z)"`）
- `B`（text, body: `"..."`）

`buildLinkIndex` 結果:

```
outgoingBySource:
  A → [ { sourceLid:'A', sourceArchetype:'text', targetLid:'Z', resolved:false } ]
backlinksByTarget: (Z は無い、他 target も無い)
broken: [ { sourceLid:'A', sourceArchetype:'text', targetLid:'Z', resolved:false } ]
```

選択中 = A のとき UI:
- Outgoing: 1 件、target = `Z`、`data-pkc-broken="true"`（click 不可）
- Backlinks: "No backlinks."
- Broken 全体 view: 1 件（A → Z）

### 9.3 multiple inbound links（hub + duplicate + self）

Container:

- `Hub`（text, body: `"top of [self](entry:Hub)"`）
- `A`（text, body: `"entry:Hub"`）
- `B`（text, body: `"[x](entry:Hub) also [y](entry:Hub)"`）
- `C`（textlog, 1 log で `"![](entry:Hub)"`）

`buildLinkIndex` 結果（抜粋）:

```
outgoingBySource:
  Hub → [ {..., targetLid:'Hub', resolved:true} ]
  A   → [ {..., targetLid:'Hub', resolved:true} ]
  B   → [ {..., targetLid:'Hub', resolved:true} ]  // dedupe 済み、1 件
  C   → [ {..., targetLid:'Hub', resolved:true} ]
backlinksByTarget:
  Hub → [Hub-self, A, B, C]  // 走査順
broken: []
```

選択中 = `Hub` のとき UI:
- Outgoing: 1 件（self-link、通常表示）
- Backlinks: 4 件（Hub / A / B / C）、C は textlog だが log id は v1 UI 非表示
- Broken 全体 view: "No broken links."

---

## 10. 実装順序（本書承認後）

1. `src/features/link-index/link-index.ts` 新規 + `tests/features/link-index/*.test.ts` 6 カテゴリ（§3.4）
2. UI slice: renderer.ts 拡張 + action-binder.ts で `open-link-index-broken` / broken click guard
3. post-impl audit: I-LinkIdx1〜10 + I-LinkIdx-NoState + I-LinkIdx-Selectors の trace
4. manual sync: `docs/manual/05_日常操作.md` + `docs/manual/09_トラブルシューティングと用語集.md`

state slice は不要（I-LinkIdx-NoState）。
