# Entry Ordering — v1 Minimum Scope (Feasibility Spec)

Status: 実装済み(C-2 entry-ordering v1、v2.1.0 以前に landing、v2.1.1 時点で稼働中)。本書は minimum-scope / historical design record として保持。実装の現物は `src/features/entry-order/entry-order.ts` / `tests/features/entry-order/entry-order.test.ts`。
Created: 2026-04-17
Category: C. Data Model Extensions（運用 UX 寄り）
Predecessor: `docs/development/data-model/entry-ordering-model.md`（CANDIDATE、2026-04-12）
Purpose: C-2 entry-ordering v1 の **最小仕様** を固定し、contract → 実装 → audit → manual の docs-first パイプラインに乗せる前段の feasibility を確定する

---

## 0. 本書の位置づけ

本書は C-2 テーマの **v1 minimum scope** を 1 本で定める **補助 spec**
である。behavior contract ではなく feasibility + 最小 scope の固定
（H-10 における `merge-import-conflict-ui-minimum-scope.md` と同格）。

- 本書の役割: **v1 で何を扱い／何を扱わないか** を確定する
- 本書は data model 決定まで踏み込むが、**最終 behavior contract は別ファイルで後段**（本書承認後に `entry-ordering-v1-behavior-contract.md` として起こす）
- implementation spec ではない。reducer / UI / DOM selector の決定は contract 段階で行う

## 0.1 関連 doc

| doc | 関係 |
|-----|-----|
| `docs/development/data-model/entry-ordering-model.md` | 前身 CANDIDATE。relation-based を志向していた |
| `docs/spec/data-model.md` §3（Entry）/ §5（Relation）/ §4（Container） | 追加フィールド／新 kind の影響源 |
| `docs/spec/schema-migration-policy.md` | additive のみなら SCHEMA_VERSION 据え置き |
| `src/features/search/sort.ts` | 既存 sortKey / sortDirection（runtime-only） |
| `src/features/relation/tree.ts` | sidebar tree の構造化ルート |

---

## 1. 目的と位置づけ

### 1.1 なぜ別テーマか

現状、entry の並びは **runtime-only の sort**（`sortKey` ∈ `title | created_at | updated_at`、方向 `asc | desc`）だけで決まる。user が「この 3 つをこの順で並べたい」と思っても、それを **container に永続化する手段が無い**。

sort 系の UX（S-18 sub-location 検索 / A-2 entry-window split 等）はすべて「自動順序の見せ方」改善であり、「手動順序そのもの」を扱うのは未着手の空白領域である。

### 1.2 既存 sort / selection / view mode との関係

| 既存サブシステム | v1 ordering との関係 |
|---------------|------------------|
| `sortKey` / `sortDirection`（runtime, feature 層） | **フォールバック軸** として温存。manual order が無い entry / 領域では現状どおり動く |
| `selectedLid` / `multiSelectedLids` | 独立。手動 reorder 操作は **single selection 前提** で開始（bulk reorder は v1 非対象） |
| `viewMode`（detail / calendar / kanban） | sidebar（detail mode）に限る。calendar / kanban は独自軸（日付 / status）を保持、本 v1 は触らない |
| `showArchived` / `archetypeFilter` / `tagFilter` / `searchQuery` | 独立。filter 後に ordering を適用（filter → order → render パイプライン） |
| `collapsedFolders` | 直交。折りたたみ状態と順序は別軸 |

本 v1 は **「何を並べるか」（selection / filter / view mode）の側は一切触らず、「どう並べるか」の最後の軸だけ置き換える**。

---

## 2. 問題定義

### 2.1 何が pain か

- 500 件規模の container で `updated_at desc` だけでは「重要な 3 件」を上に固定できない
- 章立て文書（複数 entry を order-aware に読ませたい）に対応できない
- TOC（A-3）／document-set（C-6）への足掛かりが無い
- user が手で揃えた順が **再レンダリングごとに壊れる**（DOM だけ一時並べても再 render で消える）

### 2.2 現状の order source

```
allEntries（container.entries、配列順）
  → filter（archetype / tag / search / archive）
  → sortEntries(filtered, sortKey, sortDirection)   ← 唯一の order source
  → sidebar に flat / tree で render
      └ tree の子順序は relations の配列順に依存（implicit / 安定性は保証されていない）
```

配列順が「事実上の順序」になっている箇所:

1. `container.entries[]` の並び（import / merge で順序が変わりうる）
2. `container.relations[]` の並び（tree の子順序に影響）
3. `sortEntries` は stable sort（key が一致した entry は「入力順」を保つ）

この **「入力順に依存した安定性」** を user の手動順序に差し替えるのが v1 の骨子。

### 2.3 どこで操作順序性バグが起きうるか

| 操作 | 潜在バグ |
|------|---------|
| manual reorder → sortKey 切替 | 手動順が見えなくなる／消えたように見える（実は保存されている）|
| manual reorder → filter / search ON | filter 結果内の並び vs 全体の並びの解釈が二重化する |
| manual reorder → CREATE_ENTRY | 新 entry が「どこに挿入されるか」の期待が不明 |
| manual reorder → DELETE_ENTRY | 削除後の詰め直しをいつ行うか |
| manual reorder → BULK_MOVE_TO_FOLDER | 移動先フォルダ内の順序位置はどこか |
| manual reorder → Merge import（H-10） | imported 側の ordering 情報を持ち込むか／捨てるか |
| manual reorder → Export / Import（Replace） | HTML / ZIP round-trip で順序が保全されるか |
| manual reorder → revision restore（将来 C-1） | 復元時点の順序を復元するか |

v1 では **「ordering は container meta / relation に持たせた時点で round-trip される」** 方針を取り、上記のうち *data model レベルで自明な round-trip* は解決、*UX レベルの判断*（bulk / merge 時の扱い）は個別に v1 で判断を下す（§5 invariants / §6 非対象）。

---

## 3. v1 で扱う ordering 単位

### 3.1 対象スコープ

**sidebar detail mode（tree / flat）の中で、同じ「親」を持つ entry 集合の order** のみを v1 対象とする。

| ordering 単位 | v1 | 理由 |
|--------------|----|------|
| root level（structural parent なし）の entry 集合 | **対象** | もっとも頻出、user が「上位」を意識する領域 |
| ある folder 配下の entry 集合（tree の子） | **対象** | 章立て / プレゼン順の基本単位 |
| filter 中（search / archetype / tag）の結果リスト | **非対象**（manual order が存在すれば適用、無ければ sort fallback） |
| calendar / kanban view | **非対象**（独自軸を温存） |
| TEXTLOG 内の log 行順 | **非対象**（textlog は oldest-first の invariant、別契約） |
| container 間 ordering | **非対象** |
| archive セクション内 | **非対象**（archive は一時隠蔽の概念、order 付け直しは user value が低い）|

### 3.2 ordering の「適用先」

- **flat mode**（filter / search 時）: manual order は **参照するがフォールバック可**。つまり、filter 結果の各 entry に manual order が付いていればそれを使い、無ければ sortKey/sortDirection で並べる（§5 invariants の詳細）
- **tree mode**（sidebar 通常時）: root 集合と各 folder の子集合に対してそれぞれ manual order を適用

### 3.3 含めない領域の扱い

calendar / kanban / search-sub-location の各 view は **自分の軸で並ぶ**（例: calendar は date、kanban は status）。v1 で manual order を導入してもこれらの view は挙動が変わらない。

---

## 4. 操作の最小集合

### 4.1 v1 で採用する 2 操作

| 操作 | trigger | 対象 |
|------|---------|------|
| **Move up**（1 つ前に移動） | キーボード or 小さな UI ボタン | 選択中の single entry 1 件 |
| **Move down**（1 つ後ろに移動） | 同上 | 同上 |

単一 entry を 1 ポジション動かす **最小 2 操作** に絞る。これは:

- 実装 surface が小さく、操作順序性バグを起こしにくい
- 連続 Move で任意位置に到達可能（到達不能な順序は存在しない）
- UI も「↑ / ↓」の極小で済む
- 「edge から更に 1 つ動かそうとした」場合は no-op（error ではなく、静かに無視）

### 4.2 v1 で採用しない操作

| 操作 | 理由 |
|------|------|
| Move to top / bottom | shortcut として便利だが v1 の最小集合を 2 → 4 に倍にする。user pain 未検証 |
| Drag & Drop reorder | 既存 DnD（folder 移動）と衝突しやすい、contract 段階でしか判断できない |
| Numeric "insert at position N" | UX が pro user 向き、pain 未検証 |
| Bulk reorder（複数選択で一括移動） | `multiSelectedLids` と ordering 操作の合成が複雑 |
| Keyboard `Alt+Up/Down` 等の shortcut 正式登録 | ショートカット整理は別 surface |

### 4.3 「どの集合内で動かすか」の決定規則

対象 entry の **所属集合** は以下のルールで決まる（decision tree）:

1. `searchQuery / archetypeFilter / tagFilter` のいずれかが active → flat 集合（その filter 結果）
2. それ以外 → tree mode:
   - 対象 entry の structural parent が null → root 集合
   - 対象 entry の structural parent が folder F → F の子集合

この「所属集合」の中でのみ 1 ポジション動く。集合をまたいだ移動は **BULK_MOVE_TO_FOLDER**（既存）で行う（v1 ordering の責務外）。

---

## 5. Invariants（v1 で壊さないこと）

### I-Order1: selection 不変
Move up/down 実行後も `selectedLid` は同一 entry を指す（画面上の相対位置は変わるが identity は不変）。

### I-Order2: sort fallback 温存
manual order が付いていない entry / 集合は **従来どおり** `sortKey` / `sortDirection` で並ぶ。sort 機能そのものは廃止しない。

### I-Order3: filter / search 独立
manual order は `archetypeFilter` / `tagFilter` / `searchQuery` の値で消えない。filter が変わっても保存された順序は保持される。filter が外れた時に元の見え方に戻る。

### I-Order4: view mode 独立
`viewMode` が `calendar` / `kanban` に切り替わっても manual order は container 側に残り続ける。sidebar 以外の view は **読まない**（書き換えない）。

### I-Order5: relation / revision / provenance 非破壊
manual order のための data model 追加は **additive** のみ。既存の `structural` / `categorical` / `semantic` / `temporal` / `provenance` リレーションや `Revision` schema に一切 breaking change を入れない。SCHEMA_VERSION 変更なし。

### I-Order6: archive / archetype フィルタでの隠蔽は順序を削除しない
archived todo が非表示になっても、復帰時に元の位置に戻る。archetype filter を外した時も位置が復元される。

### I-Order7: BULK_MOVE / BULK_DELETE 等の既存 bulk 操作は ordering を黙って保存する
- BULK_MOVE_TO_FOLDER: 移動先集合の末尾に追加（v1 の「挿入位置」既定）。移動元集合の順序は詰まる
- BULK_DELETE: 削除された entry の ordering エントリは除去、残った entry の相対順は保持
- CREATE_ENTRY: 新 entry は **所属集合の末尾** に追加。既存 entry の ordering は不変

### I-Order8: Merge import（H-10）との独立
merge import は host 側の ordering を **不可侵**。imported 側の ordering 情報は v1 では **読み捨てる**（host 末尾に append）。provenance relation は H-10 契約どおり付与されるが ordering には関与しない。

### I-Order9: Export / Import（Replace）round-trip
HTML / ZIP export は ordering を保全する。Replace Import は host を完全に置き換えるので ordering も imported 側に切り替わる（既存契約どおり）。

### I-Order10: No cycles / No invalid references
ordering の表現方法が relation 経由であれ meta 配列であれ、lid 参照の dangling / cycle は load 時点で検出・除去する（既存 orphan GC と同じ原則）。

---

## 6. v1 非対象

以下は v1 では意図的に扱わない。供述のみ記す（v1.x / v2 で契約し直す）。

- **Bulk reorder**（multi-select + 1 操作で複数動かす）
- **Cross-view semantic ordering**（calendar / kanban に manual order を反映）
- **Drag & Drop reorder**（folder 移動 DnD と衝突、contract 段階で別途）
- **Move to top / bottom**（shortcut 拡張）
- **Numeric "insert at N"**
- **Collaborative ordering**（P2P / WebRTC 系、D-3 の領域）
- **Auto-ordering policy**（tag / 関連度 / ML による自動並び替え）
- **Archive 内部の ordering**
- **TEXTLOG の log 行並び替え**（別不変条件、oldest-first）
- **Calendar 上の日付フィールドを無視した再配置**
- **revision restore で順序を遡る**（C-1 と合流時に再議論）

---

## 7. 推奨方針

### 7.1 実装に進む価値

**高**。理由:

- user value が恒常的（日常操作の基礎 UX）
- 既存 sort と **共存可能**（置き換えではなく追加軸）
- v1 の操作集合が 2 個 + invariants が 10 個で **contract 化しやすい**
- data model の追加が additive で **SCHEMA_VERSION 変更不要**

### 7.2 先に behavior contract を起こすべき

**Yes（strongly）**。理由:

- data model の選択肢が 3 通り以上あり（§7.4 参照）、pure slice に入る前に固定が必要
- gate / invariants / operation の表は contract 化に向く
- H-10 merge-conflict-ui v1 と同じ docs-first パイプライン（spec → pure → state → UI → audit → manual）を踏むのが自然
- replace 系 / merge 系と違って「失敗しても気付かないバグ」が起きやすい（順序は可視だが保存は不可視）ので、契約固定 → 実装の順序が安全

**次ステップ**: 本書承認後、`docs/spec/entry-ordering-v1-behavior-contract/` を H-10 と同じ章分割（10〜12 章）で起こす。

### 7.3 state slice から始めるべき理由（pure slice よりも）

manual order の **data 表現** と **reducer semantics** は分離不可能に近い:

- 「末尾追加」「削除時の詰め直し」「BULK_MOVE 時の挿入位置」は reducer の責務
- pure helper（normalize / compare / place）は reducer 側の意思決定が先に要る

したがって **contract 固定後は pure + state を並列**（厳密には contract → pure + state → UI → audit → manual）で進めるのが効率的。

### 7.4 data model 候補 3 種（contract で最終決定）

| 案 | 場所 | 表現 | 利点 | 欠点 |
|----|------|------|------|------|
| **A. ContainerMeta に global 配列** | `Container.meta.entry_order?: string[]` | 全体の lid 並びを 1 本の配列で | 最も単純、検証容易、round-trip 自明 | 親別 ordering の表現には「所属集合でフィルタしてから使う」実装が必要、配列が長大化 |
| **B. 新 RelationKind `'ordering'`** | `Relation { kind: 'ordering', from: parentLid \| '__root__', to: childLid, metadata: { sequence: number } }` | 親ごとの有向隣接 | relation 層の既存経路で扱える、親別の自然な表現 | RelationKind 追加（additive だが type union 拡張）、sequence の詰め直しが reducer 責務 |
| **C. Entry.sort_key?: string** | `Entry.sort_key?: string`（fractional indexing、例: `"h0"` < `"h0m"` < `"h1"`） | lexicographic 軸 | 挿入が O(1)、配列の詰め直し不要、sort が自明 | fractional indexing の生成・正規化ロジックが要る、既存 Entry schema 拡張 |

**事前推奨: 案 A（Container.meta.entry_order）**。理由:
- v1 の最小 scope（root + folder 子のみ）なら global 配列の「所属集合で filter」は安価（entries 数 n で O(n)）
- SCHEMA_VERSION 変更なし、Relation / Entry 型を一切 touch しない
- round-trip / export / import の取り扱いが単純（meta が既に保存経路に乗っている）
- 将来 folder 別の ordering が必要になったら `meta.entry_order_by_parent?: Record<string, string[]>` に additive で拡張可

ただし最終決定は contract で行う（案 B / C を捨てる決め手がまだ弱い、特に folder ネストが深い場合の挙動）。

---

## 8. Examples

3 ケースのみ短く示す。contract 段階で最終確認。

### 8.1 単純な順序変更（root 集合 / tree mode）

初期（updated_at desc）:

```
- Report 2026
- Meeting notes
- Plan draft
```

user が "Plan draft" を選択 → Move up を 2 回:

```
- Plan draft       ← 先頭
- Report 2026
- Meeting notes
```

期待: `selectedLid` は "Plan draft" のまま（I-Order1）、sort mode は無変化（fallback 温存、I-Order2）、container meta に順序が保存されて再 render / reload / export-import 往復で保持される。

### 8.2 filter / search 中の危険例

"2026" で検索中（2 件 hit）:

```
- Report 2026
- Plan 2026
```

user が "Plan 2026" を Move up:

```
- Plan 2026
- Report 2026
```

検索をクリア → root 集合に戻った時:
- v1 の期待: root 集合における "Plan 2026" と "Report 2026" の相対順も **同じ 1 操作で更新される**（I-Order3）
- つまり manual order は「filter 前の所属集合」にも反映される（filter 結果内の相対順と root 集合内の相対順が整合）

反例として避けるべき実装: filter 中の reorder が filter 集合だけに保存され、filter 解除で元の順に戻ってしまうと I-Order3 違反。

### 8.3 sort mode と手動 order の衝突

user が:
1. `sortKey = title asc` で並べる
2. manual order で 3 件を手で並べ替えた
3. `sortKey = updated_at desc` に切替

v1 の期待:
- manual order が付与されている 3 件は **手動順** で上位 3 件として出る
- manual order が無い残りの entry は `updated_at desc` で続く（I-Order2）
- sort key の再切替で手動順が消えることはない（meta に保存）

user mental model: 「手で動かしたものは fix される、その他は sort ルールで流れる」。

---

## 9. 移行とロールアウト

- **additive のみ**: 既存 container（meta に entry_order なし）は従来どおり sortKey で動く（I-Order2）
- **SCHEMA_VERSION 変更なし**: schema-migration-policy に抵触しない
- **export / import round-trip**: HTML Full / ZIP / HTML Light いずれも meta を転送するので自動的に保存される
- **初回 manual 操作**: user が初めて Move up/down を押した時点で meta に `entry_order` が生成される（空配列ではなく、その時点の視認順序をスナップショットして入れる）
- **後方互換**: 旧 reader が meta に知らない key があっても無視する（`Record<string, unknown>` 扱い）

---

## 10. 次段での決定事項（contract に送る）

1. data model の最終選択（案 A / B / C のどれか）
2. 挿入位置の規則（CREATE_ENTRY / BULK_MOVE / Merge import の末尾 vs 先頭）
3. Keyboard shortcut の割当（v1 は必須ではないが contract に明記）
4. UI surface の詳細（↑/↓ ボタンの配置 / selectedLid 依存 / tree node 内の位置）
5. Gate: どの phase で enable / disable か（readonly / historical / importPreview 中）
6. DOM selector（`data-pkc-action="move-entry-up" | "move-entry-down"` 等）
7. Event（`ENTRY_ORDER_CHANGED` 等）の要否
8. Testability の範囲（pure X 件 / reducer Y 件 / UI Z 件）

---

## 11. チェックリスト（本書の完了条件）

- [x] v1 対象 ordering 単位を 3 領域（root / folder / flat-with-fallback）に限定
- [x] 操作を 2 個（Move up / Move down）に絞った
- [x] invariants 10 個（I-Order1〜I-Order10）
- [x] 非対象 10 種の供述
- [x] 実装価値判断（高、docs-first で進める）
- [x] data model 3 案の並列 + 推奨（案 A）
- [x] 3 examples（単純 / filter 中 / sort 衝突）
- [x] 移行 / 後方互換方針
- [x] 次段（contract）に持ち越す決定事項 8 項目
