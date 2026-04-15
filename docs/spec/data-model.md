# PKC2 データモデル仕様書

**Status**: 正本（canonical）
**Last updated**: 2026-04-13（Slice 6 完了時点）
**Supersedes**: `docs/planning/17_保存再水和可搬モデル.md` の該当章は本文書を参照
**Related**: `docs/spec/body-formats.md`（archetype 別 body 契約）

---

## 0. この文書の位置づけ

PKC2 のデータは「Container」という単一の永続集約で表現される。
本文書は **Container とその構成要素の JSON schema・不変条件・互換性方針** の正本である。

- **保証される契約 (Guaranteed Contract)**: どのバージョンでも守られる
- **現状実装の詳細 (Current Implementation)**: 現在そう動くだけで、将来変更し得る

この 2 種類を必ず区別して記述する。
曖昧な箇所は「未規定」または「現状実装依存」と明記する。

---

## 1. Container — 最上位永続集約

Container は PKC2 のすべての永続データを包む唯一の集約 (aggregate root)。
実装: `src/core/model/container.ts`

### 1.1 Schema（TypeScript 表記）

```typescript
interface Container {
  meta: ContainerMeta;
  entries: Entry[];
  relations: Relation[];
  revisions: Revision[];
  assets: { [key: string]: string };
}
```

### 1.2 JSON 形式（保証契約）

```json
{
  "meta":      { /* ContainerMeta */ },
  "entries":   [ /* Entry[] */ ],
  "relations": [ /* Relation[] */ ],
  "revisions": [ /* Revision[] */ ],
  "assets":    { "<key>": "<base64-string>" }
}
```

- 5 フィールドすべて **必須**（空配列 `[]` / 空オブジェクト `{}` は許可、欠落は不可）
- 追加フィールドを持つ Container を import する場合、既知フィールドのみ採用される（ignore by default）
- **current implementation**: `importer.ts:164-167` が `revisions` 欠落時のみ `[]` で補填する互換処理を実装している。他フィールドの補填は無い。

---

## 2. ContainerMeta — Container 識別とバージョン

実装: `src/core/model/container.ts:7-20`

### 2.1 Schema

```typescript
interface ContainerMeta {
  container_id: string;                // 一意識別子 (cid)
  title: string;                       // ユーザー可視タイトル
  created_at: string;                  // ISO 8601
  updated_at: string;                  // ISO 8601
  schema_version: number;              // 現状 1 (固定)
  sandbox_policy?: 'strict' | 'relaxed';  // 添付プレビューのサンドボックス既定
}
```

### 2.2 フィールド契約

| フィールド | 型 | 必須 | 契約 |
|-----------|-----|-----|-----|
| `container_id` | string | ✓ | Container の一意識別子 (cid)。ZIP import 時は新しい cid が採番される（`zip-package.ts:182`）。HTML import 時は source 側の cid を保持する |
| `title` | string | ✓ | ユーザーが編集可能な表示タイトル。空文字列許可 |
| `created_at` | ISO8601 string | ✓ | Container 作成時刻。caller が供給（core は `Date.now()` を呼ばない） |
| `updated_at` | ISO8601 string | ✓ | 直近の mutation 時刻。各種 `addEntry` / `updateEntry` / `addRelation` で自動更新 |
| `schema_version` | number | ✓ | **現状 1 固定**。`src/runtime/release-meta.ts:91` の `SCHEMA_VERSION` と一致する。import 時に不一致なら `SCHEMA_MISMATCH` で拒否（`importer.ts:115-120`） |
| `sandbox_policy` | `'strict'` \| `'relaxed'` | optional | 添付（HTML/SVG）プレビュー時の iframe sandbox 既定値。absent → **'strict' 扱い**（`allow-same-origin` のみ）。per-entry `sandbox_allow` が最優先 |

### 2.3 未規定 / 曖昧な点

- `title` の最大長: 制限なし（current implementation）
- `schema_version` の migration 規約: **未規定**。現状は厳格一致のみで、upgrade path が設計されていない
- `container_id` の生成規則: 実装依存（current: timestamp + random base36）。保証される性質は**一意性のみ**

---

## 3. Entry — 基本データ単位

実装: `src/core/model/record.ts:23-30`

### 3.1 Schema

```typescript
interface Entry {
  lid: string;          // Local ID: Container 内で一意
  title: string;        // ユーザー可視タイトル
  body: string;         // archetype が解釈する文字列
  archetype: ArchetypeId;
  created_at: string;   // ISO 8601
  updated_at: string;   // ISO 8601
}
```

### 3.2 フィールド契約

| フィールド | 型 | 必須 | 契約 |
|-----------|-----|-----|-----|
| `lid` | string | ✓ | **Local ID**。Container 内で一意。他 Container に移植する際は衝突解決が必要（current: import は full replace のみのため発生せず） |
| `title` | string | ✓ | 空文字列許可。archetype により自動派生される場合がある（`Archetype.deriveTitle(entry)`） |
| `body` | string | ✓ | **常に string**。archetype が JSON として解釈するか markdown として解釈するかは `body-formats.md` 参照 |
| `archetype` | ArchetypeId | ✓ | §4 参照。未知値の場合は `'generic'` にフォールバック（`archetype.ts:22`） |
| `created_at` | ISO8601 | ✓ | 生成時刻。caller 供給 |
| `updated_at` | ISO8601 | ✓ | 更新時刻。mutation 時に自動更新 |

### 3.3 不変条件

- `lid` は作成後**変更不可**（immutable）
- `archetype` は作成後**変更不可**（archetype 変換は新規 Entry 生成 + 旧 Entry 削除で行う。例: TEXT→TEXTLOG, TEXTLOG→TEXT）
- `body` は**必ず string**（null / undefined / object 不可）。空文字列 `""` は許可

### 3.4 削除ポリシー

- **物理削除**（tombstone なし）
- 削除前に Revision snapshot を残す（§6 参照）
- `removeEntry(container, lid)` は関連 `Relation`（`from === lid` または `to === lid`）も同時に削除する（`container-ops.ts:75-85`）

---

## 4. ArchetypeId — Entry の種別

実装: `src/core/model/record.ts:4-12`

### 4.1 列挙

```typescript
type ArchetypeId =
  | 'text'       // markdown 文書
  | 'textlog'    // 時系列ログ (JSON)
  | 'todo'       // ToDo 項目 (JSON)
  | 'form'       // 固定 3 フィールド form (JSON)
  | 'attachment' // ファイル添付 (JSON + assets)
  | 'folder'     // 構造コンテナ (markdown description)
  | 'generic'    // フォールバック
  | 'opaque';    // 未解釈の予約型
```

### 4.2 契約

- この 8 種は **追加可能**（将来の拡張）だが、**削除・改名不可**
- 新 archetype の追加は schema_version を上げずに行ってよい（optional、後方互換）
- 未知 archetype を含む Container を import した場合:
  - **current implementation**: そのまま保持される。`getArchetype()` が `'generic'` にフォールバックして描画を継続する
  - **guaranteed contract**: 未知 archetype は **無害化され破棄されない**

### 4.3 archetype 別 body 契約

`body` の形式は archetype ごとに異なる。詳細は `docs/spec/body-formats.md` を参照。

| archetype | body 形式 | 正本 |
|-----------|----------|------|
| text | raw markdown string | body-formats §2 |
| textlog | `JSON.stringify({ entries: TextlogEntry[] })` | body-formats §3 |
| todo | `JSON.stringify({ status, description, date?, archived? })` | body-formats §4 |
| form | `JSON.stringify({ name, note, checked })` | body-formats §5 |
| attachment | `JSON.stringify({ name, mime, size?, asset_key?, data?, sandbox_allow? })` | body-formats §6 |
| folder | raw markdown description string | body-formats §7 |
| generic | 未解釈 string | body-formats §8 |
| opaque | 予約。現状 generic と同等 | body-formats §8 |

---

## 5. Relation — Entry 間の型付き関係

実装: `src/core/model/relation.ts`

### 5.1 Schema

```typescript
interface Relation {
  id: string;                // 一意識別子 (rid)
  from: string;              // source Entry.lid
  to: string;                // target Entry.lid
  kind: RelationKind;
  created_at: string;        // ISO 8601
  updated_at: string;        // ISO 8601
}

type RelationKind =
  | 'structural'   // folder membership（親子構造）
  | 'categorical'  // tag 分類
  | 'semantic'     // 意味的参照
  | 'temporal';    // 時系列順序
```

### 5.2 フィールド契約

| フィールド | 型 | 必須 | 契約 |
|-----------|-----|-----|-----|
| `id` | string | ✓ | Relation の一意識別子 (rid)。同一 `(from, to, kind)` の重複登録を許容するかは未規定 |
| `from` | string | ✓ | source Entry の `lid`。対応 Entry が存在しない場合は**dangling relation** |
| `to` | string | ✓ | target Entry の `lid`。対応 Entry が存在しない場合は**dangling relation** |
| `kind` | RelationKind | ✓ | 4 種のみ。未知 kind は import 時の挙動未規定 |

### 5.3 RelationKind 意味論

| kind | 用途 | Entry type 制約 | 例 |
|------|-----|----------------|-----|
| `structural` | 親子構造（フォルダ所属） | from は通常 folder。階層を形成 | folder → child entry |
| `categorical` | タグ / カテゴリ分類 | from は被タグ Entry、to はタグ Entry | entry → tag entry |
| `semantic` | 意味的参照（see also） | 制約なし | entry → referenced entry |
| `temporal` | 時系列順序 | 制約なし | earlier → later |

### 5.4 Dangling Relation 方針

- **Entry 削除時**: `removeEntry()` が当該 Entry を含む Relation を**自動削除**する（`container-ops.ts:80-82`）
- **Import 後の dangling**: import 側で参照先 Entry が欠落している Relation は**残存する可能性がある**。current implementation は検出/削除を行わない
- **guaranteed contract**: dangling relation は **壊れた状態ではなく "未解決参照" として扱う**。UI 側でフィルタ/表示しない扱いが原則

### 5.5 不変条件

- 同一 `id` の重複は不可
- `from === to`（自己参照）は許可（current implementation、意味論は UI 側の解釈に任せる）
- `updated_at >= created_at`

---

## 6. Revision — 履歴スナップショット

実装: `src/core/model/container.ts:25-30`, `src/core/operations/container-ops.ts:179-281`

### 6.1 Schema

```typescript
interface Revision {
  id: string;             // Revision の一意識別子
  entry_lid: string;      // 対応 Entry の lid
  snapshot: string;       // JSON.stringify(Entry) の前状態 (pre-mutation)
  created_at: string;     // ISO 8601
  bulk_id?: string;       // (optional) 同一 bulk action で生成された
                          //            revisions を束ねる識別子
  prev_rid?: string;      // (optional, H-6 / 2026-04-15) 同 entry_lid の
                          //            直前 Revision の id
  content_hash?: string;  // (optional, H-6 / 2026-04-15) snapshot の
                          //            16-char lowercase hex FNV-1a-64 digest
}
```

### 6.2 フィールド契約

| フィールド | 型 | 必須 | 契約 |
|-----------|-----|-----|-----|
| `id` | string | ✓ | 一意識別子 |
| `entry_lid` | string | ✓ | スナップショット対象 Entry の `lid`。当該 Entry が削除済みでも残存する |
| `snapshot` | string | ✓ | **JSON.stringify(Entry) の文字列**（§6.4 参照） |
| `created_at` | ISO8601 | ✓ | スナップショット時刻 |
| `bulk_id` | string | optional | 同一 bulk action で作られた revisions を束ねるグループ識別子。単体操作（COMMIT_EDIT / DELETE_ENTRY / QUICK_UPDATE_ENTRY / RESTORE_ENTRY）では**必ず absent**。bulk 操作（BULK_DELETE / BULK_SET_STATUS / BULK_SET_DATE）では**すべて同じ値**で付与される（§6.3 参照） |
| `prev_rid` | string | optional | (H-6 / 2026-04-15) 同 `entry_lid` の直前 Revision の `id`。`snapshotEntry` 内で `container.revisions` から **同 entry_lid を持つもののうち最大 `created_at`**（タイは配列順で later が勝つ）を選択。対象 entry に対する**最初**の snapshot では absent。`parseRevisionSnapshot` / `restoreEntry` / `restoreDeletedEntry` は本フィールドを**読まない**（§6.2.1 参照）。将来の branch/provenance 機能のための足場 |
| `content_hash` | string | optional | (H-6 / 2026-04-15) `snapshot` 文字列の **FNV-1a-64 digest を 16-char lowercase hex** で格納。`core/operations/hash.ts` の `fnv1a64Hex(snapshot)` で計算。pre-H-6 Revision（旧 export / 旧 IDB）では absent。cryptographic commitment ではない（integrity hint と future dedup / branch 検知のための fingerprint）。強度が必要になったら `content_hash_sha256` 等を別 optional field として**追加**する — 本フィールドのアルゴリズムを後方互換なく差し替えない |

### 6.3 いつ snapshot が作られるか

`src/core/operations/container-ops.ts:181-197` の policy に従う。

| 契機 | snapshot | `bulk_id` | 備考 |
|------|---------|-----------|-----|
| `COMMIT_EDIT` | ✓ | absent | 更新前の Entry を保存 |
| `DELETE_ENTRY` | ✓ | absent | 削除前の Entry を保存（物理削除の代替履歴） |
| `QUICK_UPDATE_ENTRY` | ✓ | absent | `app-state.ts` reducer 内で snapshot を取得してから update |
| `RESTORE_ENTRY` | ✓（restore 中の現状態を） | absent | forward-mutation 原則（§6.5）に従い、復元前の現状態を独立 revision として残す |
| `BULK_DELETE` | ✓（対象 N 件それぞれ） | ✓ 共通値 | 1 bulk action = 1 共通 `bulk_id`、関与 N 件分の revisions |
| `BULK_SET_STATUS` | ✓（実際に変更されたもののみ） | ✓ 共通値 | status が既に同じ値のものは revision を作らない |
| `BULK_SET_DATE` | ✓（実際に変更されたもののみ） | ✓ 共通値 | date が既に同じ値のものは revision を作らない |
| `CREATE_ENTRY` | ✗ | — | 作成前は何も無い |
| `ACCEPT_OFFER` | ✗ | — | 外部受信による新規作成扱い |
| `SYS_IMPORT_COMPLETE` | ✗ | — | Container 丸ごと置換。import 側の revisions が引き継がれる |

#### 6.3.1 bulk_id の保証契約

- **集合性**: `getRevisionsByBulkId(container, bulkId)` で 1 bulk action の全 revisions を `created_at` 昇順で取得できる
- **排他性**: 単体操作は決して `bulk_id` を書かない。グループ検索で単体操作の revision が紛れ込むことはない
- **一意性**: 同じ `bulk_id` が別 bulk action に再利用されることはない（reducer が毎回 `generateLid()` で新規採番）
- **parse 非干渉**: `parseRevisionSnapshot` / `restoreEntry` / `restoreDeletedEntry` は `bulk_id` を一切読まない。個別 entry 単位の復元は bulk 時でも同じ動作
- **backward compatibility**: `bulk_id` absent の古い Revision は strict parse / restore でこれまで通り動く。optional field 追加のみで破壊的変更なし（§15.1）

#### 6.2.1 prev_rid / content_hash の保証契約（H-6 / 2026-04-15）

- **非介入**: `parseRevisionSnapshot` / `restoreEntry` / `restoreDeletedEntry` は `prev_rid` と `content_hash` を一切読まない。旧 Revision（両 field absent）と新 Revision で restore 挙動は同一
- **prev_rid の絶対性**: 指す `id` は `container.revisions` 内に存在する保証はない（import で一部の revisions が drop される merge 経路では dangling になりうる）。**dangling は許容**し、閲覧側で「prev が見つからない → chain 終端扱い」とする
- **prev_rid の scope**: 参照対象は常に同 `entry_lid`。異なる entry_lid を跨いで chain を張ることはない
- **content_hash の用途限定**: integrity hint / future dedup / branch 検知のための fingerprint。**cryptographic commitment ではない**。悪意ある差し替えを検出する用途に使ってはならない
- **content_hash アルゴリズムの不変性**: 本フィールドに書かれる値は常に FNV-1a-64（16-char lowercase hex）。将来より強い hash を併用したくなったら `content_hash_sha256` 等の**別 optional field を additive に追加**する（`docs/spec/schema-migration-policy.md` §3.1）
- **backward compatibility**: 両 field absent の古い Revision は strict parse / restore でこれまで通り動く。新 reader はそれらに対して両 field を**補填しない**（lazy migration も行わない — 再 snapshot 時に自然に populate される）

### 6.4 snapshot の形式契約

#### 6.4.1 保証契約 (Guaranteed Contract) — **Tightened 2026-04-13 (P0-4)**

- `snapshot` は **JSON.stringify された Entry オブジェクトの文字列** である
- `parseRevisionSnapshot(rev)` は次を **すべて**満たすときに限り非 null を返す:
  - JSON.parse が成功し、結果が `null` でない plain object（配列も不可）
  - `typeof parsed.lid === 'string'` **かつ非空**
  - `typeof parsed.title === 'string'`（空文字列は許容）
  - `typeof parsed.body === 'string'`（空文字列は許容）
  - `parsed.archetype` が **§4 で列挙された 8 種のいずれか**（`'text' | 'textlog' | 'todo' | 'form' | 'attachment' | 'folder' | 'generic' | 'opaque'`）
  - `typeof parsed.created_at === 'string'`
  - `typeof parsed.updated_at === 'string'`
- 上記を満たさない場合 `parseRevisionSnapshot(rev)` は `null` を返す
- **追加フィールドは保存される**（将来の additive schema 拡張のための透過性）
- caller（`restoreEntry` / `restoreDeletedEntry`）は `null` を受けたら container を**無変更で返す**（silent mutation しない）

#### 6.4.2 Restore 時の追加 guard — **P0-4**

- **`restoreEntry`**: 既存 entry の `archetype` と snapshot の `archetype` が**一致しない場合は restore を拒否**（input container を無変更で返す）。
  - 根拠: §14.2 I-E2（archetype は immutable）。archetype mismatch は「別アイデンティティの snapshot」を示すため、title/body を上書きすると body format が壊れる（例: TEXT の body に TODO JSON が書き込まれる）
- **`restoreDeletedEntry`**: `parseRevisionSnapshot` の strict 契約により archetype は 8 種の既知値が保証される。`addEntry(container, lid, archetype, ...)` に不正値が流入する silent 経路は閉じられている

#### 6.4.3 既知の曖昧点（P0-2 → P0-4 で解決／未解決）

- [x] **未知 archetype snapshot の扱い** → P0-4 で parse レベル reject に変更（silent 'generic' fallback は発生しない）
- [x] **restore 時の archetype mismatch による body 形式破壊** → P0-4 で `restoreEntry` が明示的に拒否
- [ ] **null body の snapshot**: parse は reject（body は string 必須）。ただし**実際に null body の snapshot が生成される経路は `snapshotEntry` には存在しない**（`Entry.body: string` 型制約のため）。hand-crafted / 古い migration データのみが対象
- [ ] **巨大 body (MB 級 markdown)**: JSON.stringify のメモリ消費が非線形に増える点は未計測
- [ ] **snapshot 内の相互参照 (asset key, entry ref)**: snapshot は Entry のみで、asset / relation は含まない。restore で参照切れが発生し得る（by design — revision は entry-level snapshot であり graph ではない）

#### 6.4.4 Failure contract まとめ（表）

| 入力 | parseRevisionSnapshot | restoreEntry | restoreDeletedEntry |
|-----|---------------------|-------------|-------------------|
| 非 JSON 文字列 | `null` | 無変更 | 無変更 |
| JSON だが array / number / null | `null` | 無変更 | 無変更 |
| lid 欠落・空文字列・非 string | `null` | 無変更 | 無変更 |
| title / body 欠落・非 string | `null` | 無変更 | 無変更 |
| archetype 欠落 | `null` (P0-4) | 無変更 | 無変更 |
| archetype が未知文字列 (`'bogus'`) | `null` (P0-4) | 無変更 | 無変更 |
| archetype 非 string | `null` (P0-4) | 無変更 | 無変更 |
| created_at / updated_at 欠落 | `null` (P0-4) | 無変更 | 無変更 |
| 全フィールド valid、既存 entry と archetype 一致 | Entry | restore 成功 | — |
| 全フィールド valid、既存 entry と archetype mismatch | Entry | **無変更 (P0-4)** | — |
| 全フィールド valid、lid が存在しない (deleted) | Entry | 無変更 | restore 成功 |
| 全フィールド valid、lid が existing | Entry | restore 成功 | **無変更**（restoreEntry の職分） |

**silent corruption は上記すべての経路で遮断されている**（P0-4 完了時点）。

### 6.5 Restore の forward-mutation 原則

`container-ops.ts:328-345` に明記。

- restore は **rewind ではない**
- 現 Entry 状態を **先に snapshot してから** revision 内容で上書き
- `updated_at` は restore 実行時刻に進む
- revision は**削除・上書きされない**（履歴保全）
- **restore されないもの**: relations、runtime state（pendingOffers / importPreview / phase / selection）

### 6.6 Trash purge

`purgeTrash(container)` は削除済み Entry（`entries` に存在せず `revisions` のみ持つ lid）の revision をすべて物理削除する。

- 呼出契機: `SYS_PURGE_TRASH` 相当の明示操作のみ（current: UI から到達経路を確認要）
- guaranteed: **存命中の Entry の revision は purge の対象外**

---

## 7. Assets — バイナリデータ辞書

実装: `src/core/model/container.ts:42`, `src/core/operations/container-ops.ts:116-146`

### 7.1 Schema

```typescript
interface Container {
  // ...
  assets: { [key: string]: string };
}
```

- **key**: opaque string（asset key）
- **value**: base64 文字列、またはフォーム化された文字列（§7.3 参照）

### 7.2 Asset key の契約

| 項目 | 契約 |
|-----|-----|
| 文字集合 (guaranteed) | **非空文字列**。decode 不可能な文字を含まないこと |
| 文字集合 (reference safety) | markdown 参照 `![](asset:<key>)` / `[](asset:<key>)` で安全にマッチするのは `[A-Za-z0-9_-]+`（`asset-resolver.ts:84` の `SAFE_KEY_RE`）。これ以外の文字を含む key は参照時に解決されない可能性がある |
| 一意性 | 同一 Container 内で一意 |
| 生成規則 (current impl) | `attachment-presenter.ts:112-115` の `generateAssetKey()`: `ast-<ts-base36>-<rand-base36>` |
| lifetime | Entry と別ライフサイクル。Entry を削除しても asset は自動削除されない（**ガベージコレクション機構は現状なし**） |

### 7.3 Asset value のエンコーディング

asset value は「どこにあるか」で形式が決まる。

| 文脈 | value 形式 | 根拠 |
|------|----------|-----|
| **IDB 保存** | base64 string | `persistence.ts` / `idb-store.ts` |
| **runtime memory** | base64 string | IDB からロード直後 |
| **HTML Light export** | `{}` 固定（assets 省略） | `exporter.ts:78-79` |
| **HTML Full export (圧縮対応環境)** | gzip+base64 string | `compression.ts:95-107`。`export_meta.asset_encoding = 'gzip+base64'` |
| **HTML Full export (非圧縮環境)** | base64 string（フォールバック） | `compression.ts:98-100`。`export_meta.asset_encoding = 'base64'` |
| **ZIP package** | **raw binary**（.bin ファイル） | `zip-package.ts:101-104`。container.json 側の `assets` は `{}` |
| **text bundle / textlog bundle** | assets zip に同梱される raw binary | sister bundle 仕様（`text-bundle.ts` / `textlog-bundle.ts`） |

### 7.4 IDB での格納実態

`idb-store.ts`（DB `pkc2`, version `2`）:

- `containers` store: Container を `assets: {}` にしてから保存（`save()` で strip）
- `assets` store: per-cid + per-key で個別保存
- `__default__` key: current default cid へのポインタ

load 時に `assets` store から rehydrate されて `container.assets` に復元される。

### 7.5 未規定 / 曖昧点

- asset 内容の最大サイズ（current: guardrail 側で warn、reject はしない）
- content-hash による dedup: **未実装**。同一バイナリが複数 key で重複保持され得る
- 複数 ZIP import 時の key 衝突検出: **未実装**（P0-5 対象）

---

## 8. 識別子 (ID) とタイムスタンプの共通規約

### 8.1 識別子の階層

| 名前 | 略称 | スコープ | 格納先 | 保証 |
|------|-----|---------|-------|-----|
| Container ID | **cid** | グローバル（ユーザー視点で一意） | `ContainerMeta.container_id` | 同一ユーザー環境で一意 |
| Local Entry ID | **lid** | Container 内で一意 | `Entry.lid` | Container 内で一意、作成後 immutable |
| Relation ID | **rid** | Container 内で一意 | `Relation.id` | Container 内で一意 |
| Revision ID | — | Container 内で一意 | `Revision.id` | Container 内で一意 |
| Asset Key | **key** | Container 内で一意 | `assets[key]` | §7.2 参照 |
| Log Entry ID | — | TEXTLOG body 内で一意 | `TextlogEntry.id` | ULID (26 char Crockford Base32) もしくは legacy |

### 8.2 prev_rid / hash の扱い

**重要**: データモデル上、**Revision は chain を成さない**。
各 Revision は独立した snapshot であり、`prev_rid` や content `hash` フィールドは **存在しない**。

（将来 branch/restore history UI を強化する際に追加余地あり。現状は `Revision[]` を `entry_lid` + `created_at` でフィルタ・ソートして履歴として扱う。）

### 8.3 Revision chain の代替: created_at sort

`getEntryRevisions(container, lid)` は `entry_lid` 一致の Revision を `created_at` 昇順で返す（`container-ops.ts:232-239`）。この順序が履歴の意味での「古い → 新しい」である。

- **保証契約**: 同一 `entry_lid` の revisions は `created_at` で一意に順序付けられる
- **曖昧点**: 同一ミリ秒で複数 revision が作られた場合の副順序は未規定

### 8.4 タイムスタンプ規約

- 形式: **ISO 8601 文字列**（例: `"2026-04-13T12:34:56.789Z"`）
- 生成: **caller が供給**（core は `Date.now()` を呼ばない。`container-ops.ts` 冒頭 JSDoc 参照）
- 比較: 文字列比較可能（ISO 8601 は lexicographic に時系列順）
- タイムゾーン: UTC 推奨。ただし TEXTLOG の `createdAt` はローカルタイム由来も許容（`toLocalDateKey` で day bucketing）

### 8.5 Log Entry ID (TEXTLOG 内)

実装: `src/features/textlog/log-id.ts`

- **新規**: 26 char Crockford Base32 **ULID**（48-bit timestamp + 80-bit randomness）
- **legacy**: 旧形式 `log-<ts>-<n>` などを**書き換えない**（そのまま保持）
- resolver は ULID / legacy を同等の opaque token として扱う
- chronological 順序は **storage 順序が source of truth**（ID sort から推測しない）

---

## 9. IDB (Workspace) 保存レイアウト

実装: `src/adapter/platform/idb-store.ts`, `src/adapter/platform/persistence.ts`

### 9.1 IndexedDB 構造

```
Database:  'pkc2'    (DB_NAME)
Version:   2         (DB_VERSION)

Object Stores:
├── 'containers'
│   ├── key = cid              value = Container (ただし assets は {} に stripped)
│   └── key = '__default__'    value = { cid: string }  (current default pointer)
│
└── 'assets'
    └── key = `${cid}:${assetKey}`   value = base64 string
```

### 9.2 保存契約

- **container.assets は IDB に直接格納しない**。`save()` が strip してから書く
- `assets` store は **per-cid + per-key** で個別 PUT
- `loadDefault()` / `load(cid)` が `assets` store から集めて reassemble

### 9.3 debounce と flush

- mutation event → 300ms debounce → `store.save()`（`persistence.ts:52`）
- `pagehide` 時に `flushPending()` を発火（`persistence.ts:163`）
- `lightSource` フラグ付き state は IDB 保存**しない**（Light export で asset が空の Container が IDB を上書きするのを防ぐ、`persistence.ts:113-114`）

### 9.4 Migration

- v0 → v1: `containers` store 作成
- v1 → v2: `assets` store 作成 + 既存 `container.assets` を assets store へ移動
- 将来の migration は `openDB()` 内の `onupgradeneeded` で明示的に記述する規約

### 9.5 未規定 / 曖昧点

- **multi-cid Workspace**: 現状は `__default__` の単一 cid のみ使用（複数 Workspace 切替は UI 未露出）
- **asset ガベージコレクション**: 参照されなくなった asset の自動削除は**未実装**
- **storage quota 対応**: warning のみ（`storage-estimate.ts`）

---

## 10. HTML Export 契約（Portable HTML）

実装: `src/adapter/platform/exporter.ts`, `src/adapter/platform/importer.ts`
関連: `src/runtime/contract.ts` (SLOT), `src/runtime/release-meta.ts` (ReleaseMeta)

### 10.1 HTML の slot 契約

```
<html data-pkc-app data-pkc-version data-pkc-schema data-pkc-timestamp data-pkc-kind>
  <head>
    <style id="pkc-styles"> ... </style>
    <style id="pkc-theme">  ... </style>
  </head>
  <body>
    <div id="pkc-root"></div>
    <script id="pkc-data" type="application/json"> ... </script>
    <script id="pkc-meta" type="application/json"> ... </script>
    <script id="pkc-core"> ... </script>
  </body>
</html>
```

6 slots (`SLOT` in `runtime/contract.ts`):
- `pkc-root`: mount point (DOM)
- `pkc-data`: Container + export_meta（JSON）
- `pkc-meta`: ReleaseMeta（JSON）
- `pkc-core`: 実行可能な JS bundle
- `pkc-styles`: コンパイル済み CSS
- `pkc-theme`: theme overrides

### 10.2 pkc-data の形式

```json
{
  "container":   { /* Container */ },
  "export_meta": { /* ExportMeta */ }
}
```

- `</script>` は `<\/script>` にエスケープして埋め込む（`exporter.ts:90`）
- import 側は `<\/script>` → `</script>` に戻す（`importer.ts:138`）

### 10.3 ExportMeta

```typescript
interface ExportMeta {
  mode: 'light' | 'full';
  mutability: 'editable' | 'readonly';
  asset_encoding?: 'base64' | 'gzip+base64';
}
```

| フィールド | 値 | 意味 |
|-----------|-----|-----|
| `mode: 'light'` | — | `container.assets = {}` に置換。asset_encoding は省略 |
| `mode: 'full'` | — | `container.assets` を compress して埋込。`asset_encoding` で形式を記録 |
| `mutability: 'editable'` | default | 編集可能な成果物 |
| `mutability: 'readonly'` | — | 閲覧専用 UI。Rehydrate で Workspace に昇格可能 |
| `asset_encoding: 'base64'` | — | 非圧縮環境フォールバック |
| `asset_encoding: 'gzip+base64'` | — | CompressionStream 使用で圧縮済み |

### 10.4 ReleaseMeta

`src/runtime/release-meta.ts` 参照。

- `app: 'pkc2'` 固定
- `schema: 1`（`SCHEMA_VERSION`）。import 時に不一致で拒否
- `code_integrity: "sha256:<hex>"` — pkc-core 改竄検出（warn レベル）
- `source_commit: "<short-sha>"` または `"<short-sha>+dirty"` または `"unknown"`
- `capabilities: string[]` — `'core'`, `'idb'`, `'export'`, `'record-offer'` 等

### 10.5 Import 時の検証

`importer.ts` が行う検証:

1. HTML parse error チェック
2. `pkc-meta` の存在と JSON parse
3. `meta.app === 'pkc2'`
4. `meta.schema === SCHEMA_VERSION` (厳格一致)
5. `pkc-data` の存在と JSON parse
6. `container.meta.container_id` と `container.meta.title` が string
7. `entries` / `relations` が array
8. `revisions` が欠落または array（欠落時は `[]` 補填）
9. asset_encoding が `'gzip+base64'` なら decompress

### 10.6 拒否される入力

- `MISSING_PKC_META`, `MISSING_PKC_DATA`
- `INVALID_APP_ID`, `SCHEMA_MISMATCH`
- `INVALID_CONTAINER`
- `PARSE_ERROR`, `FILE_READ_ERROR`

---

## 11. ZIP Export 契約（Portable Package）

実装: `src/adapter/platform/zip-package.ts`
関連: `docs/development/zip-export-contract.md`

### 11.1 ZIP 構造

```
<name>.pkc2.zip
├── manifest.json        — パッケージ識別情報
├── container.json       — Container（ただし assets: {}）
└── assets/
    ├── <key1>.bin       — 生バイナリ（base64 decode 済み）
    ├── <key2>.bin
    └── ...
```

### 11.2 manifest.json

```typescript
interface PackageManifest {
  format: 'pkc2-package';     // 固定
  version: 1;                  // 現状 1
  exported_at: string;         // ISO 8601
  source_cid: string;          // export 元の container_id
  entry_count: number;
  relation_count: number;
  revision_count: number;
  asset_count: number;
}
```

### 11.3 ZIP 形式の詳細

- **ZIP stored mode**（method 0、圧縮なし）を採用
- 理由: 外部 deflate 実装を bundle に含めないため（単一 HTML 成果物契約）
- 大半の asset（画像・PDF・既圧縮）は再圧縮の利得が小さく、text JSON は absolute size が小さい
- per-entry `mtime` は MS-DOS date/time で export timestamp（1980-01-01 デフォルト回避）

### 11.4 Import 時の挙動

- `manifest.format === 'pkc2-package'` と `version === 1` を検証
- `container.json` を parse
- `container.meta.container_id` / `title` が string で `entries` / `relations` が array であることを検証
- `assets/<key>.bin` を順次読み、base64 にエンコードして `assets[key]` に格納（衝突検知ルールは §11.7 参照）
- **新しい cid を採番**して `container.meta.container_id` を置換（source と衝突を避けるため）
- **`meta.updated_at` は import 時刻で無条件上書きされる**（F1 監督決定、2026-04-13）。source の `updated_at` は **保持されない**。単調性は保証されず、source が未来の値を持っていた場合、import 後に値が小さくなり得る
- revisions は「array なら維持、欠落なら `[]`」

### 11.5 ZIP Import で失われる情報

- **source_cid**（manifest に記録されるが復元は不可。新 cid が振られる）
- 旧 cid を参照していた外部リンク（URL 直書きの entry ref 等）
- **source の `meta.updated_at`**（§11.4 参照、import 時刻で上書きされる）

### 11.6 失敗時のエラーメッセージ

- `Missing manifest.json in ZIP`
- `Invalid format: expected "pkc2-package", got "<x>"`
- `Unsupported version: <n>`
- `Missing container.json in ZIP`
- `Invalid container: missing meta fields`
- `Invalid container: missing entries array`
- `Invalid container: missing relations array`

### 11.7 Import 時の衝突検知（collision policy）

**Added 2026-04-13 (P0-5)**. 実装: `src/adapter/platform/zip-package.ts` の `importContainerFromZip`。

ZIP ファイル内に以下のような不整合があった場合、**silent overwrite を行わず**、`ZipImportSuccess.warnings` に記録して import を成功させる。

#### 11.7.1 警告コード

| コード | 条件 | 処理 |
|-------|------|-----|
| `DUPLICATE_ASSET_SAME_CONTENT` | 同一 key の `assets/<key>.bin` が複数、**byte 完全一致** | 1 個に dedup（1 件目を採用） |
| `DUPLICATE_ASSET_CONFLICT` | 同一 key の `assets/<key>.bin` が複数、**byte が異なる** | **1 件目を採用**（first-wins）、loudly warn |
| `DUPLICATE_MANIFEST` | `manifest.json` が複数 | 1 件目を採用 |
| `DUPLICATE_CONTAINER_JSON` | `container.json` が複数 | 1 件目を採用 |
| `INVALID_ASSET_KEY` | key が空 / `.` / `..` / `/` や `\` を含む | 当該 asset を skip（`assets[key]` に格納しない） |

#### 11.7.2 ZipImportWarning スキーマ

```typescript
interface ZipImportWarning {
  code: ZipImportWarningCode;
  message: string;    // 人間可読
  key?: string;       // asset 関連時のみ
  kept: 'first' | null;  // 'first' = 1件目を採用 / null = skip
}
```

#### 11.7.3 保証契約

- **一度の import 中に発生したすべての違反**を warnings 配列に記録する（silent drop しない）
- **成功時 result に `warnings` フィールドが存在する場合、必ず 1 件以上の警告を含む**（空配列を格納しない。警告が無ければ field ごと省略）
- **first-wins は安定かつ deterministic**: 同一 ZIP を繰り返し import すると同じ結果を返す
- **異なる key に同一 byte を持つ asset は dedup しない**（両方とも保持。§12.3 の ZIP 行と整合）

#### 11.7.4 「衝突検知」の意味的範囲

本節は **1 つの ZIP ファイル内部**の不整合のみを扱う。current implementation は「複数 ZIP を順次 import した際の累積」を扱わない（import は full replace 契約、§14.1 I-IO1）。複数 container を統合する merge import は **Tier 3-1（2026-04-14）で実装済み**（§14.6 I-IO1b 参照）。append-only の Overlay MVP であり、衝突解決は `docs/spec/merge-import-conflict-resolution.md` が正本。

---

## 12. HTML Export vs ZIP Export の契約境界

### 12.1 本質的な違い

| 観点 | HTML (Portable HTML) | ZIP (Portable Package) |
|------|---------------------|-----------------------|
| **成果物種別** | self-executing artifact | data-only artifact |
| **コード同梱** | ✓（pkc-core, pkc-styles, pkc-core に bundle 埋込） | ✗（コード無し） |
| **開いた時の挙動** | ブラウザで開けばそのまま PKC2 が動く | PKC2 に import する必要あり |
| **主用途** | 配布、閲覧、Rehydrate による Workspace 取込 | バックアップ、移行、外部ツール処理 |
| **最小サイズ** | 数十 KB〜（Light モード） | 数 KB〜（小 Container） |
| **Asset 格納** | base64 または gzip+base64 を JSON 内埋込 | 生バイナリを個別 `.bin` ファイル |
| **バイナリ効率** | base64 で 33% 膨張 + 圧縮可（gzip） | 生バイナリで 0% 膨張、ZIP stored で再圧縮なし |

### 12.2 使い分け決定木（保証契約レベル）

```
配布・共有したい?
├── Yes → HTML
│   ├── テキストだけで十分? → HTML Light (editable or readonly)
│   └── 添付も含めたい?     → HTML Full (editable or readonly)
│
└── バックアップ・移行?
    ├── 大容量 asset を効率的に扱いたい → ZIP
    └── 単一 Entry だけ持ち出したい     → text-bundle (.text.zip) / textlog-bundle (.textlog.zip)
```

### 12.3 往復 (round-trip) 可能性

| 経路 | cid 保持 | `meta.updated_at` 保持 | revisions 保持 | assets 保持 | body/relations 保持 |
|-----|---------|----------------------|---------------|------------|-------------------|
| HTML Light export → import | ✓ | ✓ | ✓ | ✗（空に） | body=✓ / relations=✓ |
| HTML Full export → import | ✓ | ✓ | ✓ | ✓ | ✓ |
| ZIP export → import | ✗（新 cid、§11.5） | **✗（import 時刻で上書き、§11.4 / F1）** | ✓ | ✓ | ✓ |

**注**:「保持」は**バイト完全一致**を意味しない。pretty-print、revisions の順序は `created_at` sort 依存、など境界は P0-2a/P0-2b round-trip テスト群で観測済み。ZIP の `meta.updated_at` は F1 監督決定（2026-04-13）により**保持しない**のが canonical（§11.4）。

### 12.4 両形式で共通する原則

- Container のみが永続。runtime state（phase / selection / editing）は**決して埋め込まれない**
- コード（pkc-core）は runtime version と source_commit を pkc-meta に記録するが、HTML ファイル自体の SHA は記録しない（code_integrity は pkc-core 部分のみ）
- import は **full replace**（merge は未実装）

---

## 13. Sister Bundle 契約（単一 Entry 可搬形式）

実装: `src/adapter/platform/text-bundle.ts`, `src/adapter/platform/textlog-bundle.ts`, `src/adapter/platform/mixed-bundle.ts`, `src/adapter/platform/folder-export.ts`, `src/adapter/platform/entry-package-router.ts`

### 13.1 対象

単一 Entry または部分 closure を持ち出す形式。Container 全体ではない。

| 拡張子 | 対象 | 用途 |
|-------|-----|-----|
| `.text.zip` | 単一 TEXT entry + 参照 assets | markdown ドキュメント単体のバックアップ／配布 |
| `.textlog.zip` | 単一 TEXTLOG entry + 参照 assets | ログファイル単体の持ち出し |
| `.mixed.zip` | folder closure or selected entries | folder 単位エクスポート |
| `.texts.zip` | 複数 TEXT 一括 | container-wide TEXT export |

### 13.2 Import ルーティング

`entry-package-router.ts` が filename の末尾で判定:
- `.textlog.zip` → textlog importer
- `.text.zip` → text importer
- それ以外（`.pkc2.zip` / `.texts.zip` / `.mixed.zip`）→ 専用の batch import 経路

### 13.3 build-subset の closure 計算

実装: `src/features/container/build-subset.ts`

- root LID から reachable な Entry 集合を計算
- MAX_REF_ITERATIONS = 10,000、MAX_ANCESTOR_DEPTH = 32 のガード
- attachment entry を収集し、対応 asset key を map
- TODO / FOLDER body（markdown 化された description）も scan して entry refs / asset refs を辿る（Slice 3 / Slice 6 で closure 対応）
- missing asset key は manifest に report
- **revisions は空にリセット**（subset 外の Entry の履歴が漏れるのを防ぐ、`build-subset.ts:202-203`）

### 13.4 Compact mode

text / textlog bundle には **compact mode** がある。
壊れた asset 参照（`asset:key` で key が present でない）は以下のように markdown を書き換える:

- `![alt](asset:<missing>)` → `alt`
- `[label](asset:<missing>)` → `label`

（実装: `text-markdown.ts:64-74` の `compactMarkdownAgainst`）

### 13.5 未規定 / 曖昧点

- build-subset の **cycle guard**: includedLids set で de-dup されるが、A→B→A のような相互参照チェーンの closure テストは未網羅（P0-2 / P1-8 候補）
- subset 内に dangling relation が残る可能性（external reference 整合性チェックなし）

---

## 14. データモデル不変条件

### 14.1 Container レベル

- **I-C1**: `meta` / `entries` / `relations` / `revisions` / `assets` の 5 フィールドは常に存在（空でもよい）
- **I-C2**: `meta.container_id` は Container の生涯にわたって変化しない（ZIP import による新 cid 採番を除く。それは「新 Container」）
- **I-C3**: `meta.schema_version` は現状 `1` 固定。migration なしに変更不可
- **I-C4**: `meta.updated_at` は、**同一 Container 内の mutation** 後は前回値以上。ただし **ZIP import は新 Container として扱う**ため本不変式の適用外（§11.4 / §11.5 / §12.3、F1 監督決定）

### 14.2 Entry レベル

- **I-E1**: `lid` は Container 内で一意
- **I-E2**: `lid` と `archetype` は作成後 immutable
- **I-E3**: `body` は常に string（JSON parse される archetype でも、格納値は string）
- **I-E4**: `created_at <= updated_at`

### 14.3 Relation レベル

- **I-R1**: `id` は Container 内で一意
- **I-R2**: `removeEntry(lid)` は対応 Relation（from または to が lid）を同時削除する
- **I-R3**: dangling relation（from / to の Entry が存在しない）は **runtime 側でフィルタする前提**。データ層では許容

### 14.4 Revision レベル

- **I-V1**: `entry_lid` が指す Entry が削除されても Revision は残存する（物理削除の代替履歴）
- **I-V2**: `snapshot` は `JSON.stringify(Entry)` の形式を取る（§6.4）
- **I-V3**: restore は forward mutation（rewind ではない）。revision は決して削除・上書きされない
- **I-V4**: `purgeTrash` は存命中 Entry の revision を削除しない

### 14.5 Assets レベル

- **I-A1**: asset key は Container 内で一意
- **I-A2**: IDB / runtime 上は常に base64。gzip+base64 は HTML Full 内のみ
- **I-A3**: Entry 削除で asset は自動削除されない（orphan 化し得る）

### 14.6 Import/Export レベル

- **I-IO1**: 既定の Import は full replace（`CONFIRM_IMPORT` — 既存 container を imported で置換）
- **I-IO1b**: 別経路として Overlay merge import（`CONFIRM_MERGE_IMPORT` — Tier 3-1 で実装、2026-04-14）。host container の既存エントリは不変のまま imported の entry / asset / relation を append-only で追加する。**imported revisions は drop**。衝突解決は host 側に副作用を起こさない方向に倒す（lid 衝突 → rename、asset hash 同一 → dedupe、asset hash 異 → rehash、dangling relation → drop）。契約と不変条件は `docs/spec/merge-import-conflict-resolution.md` §6〜§7、および `docs/planning/HANDOVER_FINAL.md §18.2` の I-Merge1 / I-Merge2 を正本とする
- **I-IO2**: runtime state（phase / selectedLid / editingLid / pendingOffers / importPreview / multiSelectedLids 等）は一切埋め込まれない
- **I-IO3**: HTML Full と ZIP の body / relations / revisions は logical equivalence（バイト完全一致は非保証、pretty-print や順序は変わり得る）

---

## 15. 後方互換性と Migration 原則

### 15.1 基本方針

1. **Additive only**: 新フィールドは必ず optional で追加
2. **Never remove / rename**: 既存フィールド・値の削除や改名は禁止（schema_version を上げる場合のみ可）
3. **Unknown fields are ignored**: 未知フィールドを含む Container を読み込む場合、既知のみ採用
4. **Legacy formats auto-migrate on next save**: 読込時は legacy を許容、次回 save 時に新形式で書き出す (lazy migration)

### 15.2 確立済み migration パターン

| 項目 | legacy | new | migration | 責務 |
|-----|-------|-----|-----------|-----|
| **attachment body** | `{ name, mime, data }` （data inline base64） | `{ name, mime, size, asset_key }` + `container.assets[asset_key]` | lazy migration on next save | `attachment-presenter.ts` |
| **TEXTLOG log id** | `log-<ts>-<n>` | ULID (26 char Crockford Base32) | **never rewritten**（旧 ID 保持） | `log-id.ts`, `textlog-body.ts` |
| **todo body** | plain string | JSON `{status, description, ...}` | parse が fallback して `{status:'open', description: body}` を返す | `todo-body.ts:36-39` |
| **IDB schema** | v1: container.assets 直格納 | v2: assets store 分離 | `onupgradeneeded` で自動移行 | `idb-store.ts` |
| **revisions 欠落** | 旧 export で欠落 | 必須 array | import 時に `[]` 補填 | `importer.ts:164-167` |
| **Revision.prev_rid / content_hash** | 両 field absent | 新 snapshot で populate（旧 rev は absent 維持） | lazy: 次回 `snapshotEntry` で populate、旧 rev は補填しない | `container-ops.ts` `snapshotEntry`（H-6 / 2026-04-15） |

### 15.3 schema_version の昇格ルール

- 現状 `SCHEMA_VERSION = 1`（`release-meta.ts:91`）
- schema_version を上げる条件: **既存フィールドの削除・改名・型変更**を行う場合のみ
- 昇格時の migration path 設計は `docs/spec/schema-migration-policy.md` に正本化済み（2026-04-15 / 自主運転モード第 3 号）。判断基準・hook 位置・lazy/eager の使い分け・test 戦略雛形が `§4 / §6 / §7 / §10` にまとまっている。v2 到達時はまず当該 spec §11 の実装順序に従う

### 15.4 禁止される変更（P0-P1 期間中）

以下は破壊的変更であり、現段階では**禁止**:

- `ContainerMeta.container_id` の必須性を外す
- `Entry.body` を `string` 以外の型にする
- `ArchetypeId` の既存値を削除・改名
- `RelationKind` の既存値を削除・改名
- `Revision.snapshot` の形式を JSON.stringify 以外に変更
- `export_meta.mode` / `asset_encoding` の既存値を削除・改名
- `manifest.format: 'pkc2-package'` 識別子の変更
- SLOT ID（`pkc-root`, `pkc-data`, `pkc-meta`, `pkc-core`, `pkc-styles`, `pkc-theme`）の改名

### 15.5 拡張の余地（P2 候補）

- 新 archetype（`complex`, `document-set`, `spreadsheet` 等）の追加: **schema_version 据え置きで可能**
- ~~`Revision` への `prev_rid` / `content_hash` フィールド追加~~: **完了（2026-04-15 / H-6）**。どちらも optional additive、`snapshotEntry` で populate、schema_version 据え置き（§6.1 / §6.2 / §6.2.1）
- `ContainerMeta` への locale / timezone フィールド追加: optional なら可能
- merge import の実装: Tier 3-1（2026-04-14）で Overlay MVP が実装済み（§14.6 I-IO1b）。拡張（Policy UI / Staging / Revision 持ち込み）は `docs/spec/merge-import-conflict-resolution.md` §9 を参照

---

## 16. 既知の曖昧点（P0-2 round-trip で検証すべき）

以下は**仕様として未規定または実装依存**。次段 P0-2 の round-trip テストで挙動を固定し、必要なら契約化する。

### 16.1 Revision 関連
- [x] **snapshot に含まれる `archetype` と restore 先の `archetype` が異なるケース → §6.4.2 で解決（P0-4, 2026-04-13）**
- [x] **snapshot の `body` が null / undefined / object だった場合 → §6.4.1 strict parse で reject（P0-4）**
- [ ] 同一ミリ秒 created_at 複数 revision の副順序

### 16.2 Relation 関連
- [ ] 同一 `(from, to, kind)` の重複 Relation の扱い
- [ ] dangling relation（from / to の Entry が存在しない）が import/export で残るか消えるか
- [ ] `from === to`（自己参照）が UI でどう解釈されるか

### 16.3 Asset 関連
- [ ] asset key が `[A-Za-z0-9_-]+` の範囲外の文字（例: 日本語、スペース）を含む場合の参照解決
- [ ] 同一 base64 内容が複数 key で重複保持される場合のサイズ膨張
- [ ] orphan asset（どの Entry からも参照されない）の検出 / 削除
- [x] **ZIP import 時の asset key 衝突 → §11.7 で解決（P0-5, 2026-04-13）**

### 16.4 Export / Import 関連
- [ ] HTML Full → ZIP 経由 → HTML Full で container が logical equivalent か
- [x] **ZIP import で `meta.updated_at` が source を保持しない（F1 決定、2026-04-13、§11.4 / §11.5 / §12.3 に反映）**
- [ ] ZIP import で新 cid が振られた Container を再度 HTML export した時の `created_at` の値
- [ ] Light export → import → Full export の asset 欠落状態の扱い（`lightSource` フラグの永続化）
- [ ] `export_meta` 欠落の古い HTML を import した場合のフォールバック挙動
- [ ] `revisions` が undefined の旧 Container import で `[]` 補填が確実か
- [ ] pretty-print（`JSON.stringify(..., null, 2)`）と minify の混在耐性

### 16.5 Schema migration 関連
- [ ] schema_version = 2 を持つ未来 Container を現行（schema=1）で読んだ場合の挙動（現状 `SCHEMA_MISMATCH`）
- [ ] schema_version = 0 を持つ旧 Container（存在しうるか要調査）

### 16.6 Transclusion / Embed 関連（body-formats と横断）
- [ ] entry ref で削除済み Entry を指す場合の placeholder
- [ ] depth > 1 の embed chain の完全遮断契約
- [ ] self-reference / cycle の検出境界

---

## 17. 関連文書

- `docs/spec/body-formats.md` — archetype 別 body 契約
- `docs/spec/schema-migration-policy.md` — schema_version 昇格時の判断基準・hook 位置・test 戦略（§15.3 を具体化）
- `docs/planning/17_保存再水和可搬モデル.md` — 4 系統モデル（Workspace/HTML/ZIP/Template）
- `docs/planning/13_基盤方針追補_release契約.md` — HTML slot 契約
- `docs/planning/18_運用ガイド_export_import_rehydrate.md` — 利用手順
- `docs/development/zip-export-contract.md` — ZIP stored mode の根拠
- `docs/development/entry-transformation-and-embedded-preview.md` — TEXT/TEXTLOG 変換と embed
- `docs/planning/HANDOVER_SLICE6.md` — 次段計画

---

## 18. 変更履歴

| 日付 | 変更 |
|------|-----|
| 2026-04-13 | 初版作成（P0-1、Slice 6 完了時点の実装を正本化） |

