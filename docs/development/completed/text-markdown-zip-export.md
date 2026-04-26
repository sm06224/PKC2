# TEXT markdown + assets ZIP bundle (`.text.zip`)

`text` archetype 向けの sister export / import フォーマット。
TEXTLOG の `.textlog.zip` (`docs/development/textlog-csv-zip-export.md`)
と同じ考え方を single-body markdown entry に展開したもの。

本 doc は **実装に先立って凍結** された format contract であり、
2 つ目以降の実装バインディングはすべてここを一次ソースとして書かれる。

---

## 1. スコープ

- **in scope**: `text` archetype 1 件を `.text.zip` として書き出す export と、
  その逆向きの import。
- **out of scope (本 issue)**: `textlog` / `todo` / `form` / `attachment` /
  `generic` / `folder` / `opaque` など他 archetype、
  container-wide batch export/import、preview UI、auto-GC、multi-tab。

---

## 2. Bundle layout

```
<slug>-<yyyymmdd>.text.zip
├── manifest.json        metadata + asset index
├── body.md              the markdown body — **唯一の source of truth**
└── assets/              only referenced assets, one file per key
    ├── <key><.ext>
    └── ...
```

- `<slug>` = entry.title の slug (小文字化 + non-alphanumeric を `-` 化)。
  空 title のときは entry.lid をフォールバックに使う。
- `<yyyymmdd>` = ローカルタイムゾーンのビルド日 (TEXTLOG と同じ convention)。
- 拡張子は **必ず `.text.zip`**。`.zip` 単独の import 許容は受信側の判断事項。

---

## 3. `manifest.json`

```jsonc
{
  "format": "pkc2-text-bundle",
  "version": 1,
  "exported_at": "2026-04-10T02:45:00.000Z",
  "source_cid": "cnt-xxx",
  "source_lid": "lid-xxx",
  "source_title": "My document",
  "body_length": 1234,
  "asset_count": 3,
  "missing_asset_count": 1,
  "missing_asset_keys": ["ast-broken"],
  "assets": {
    "ast-001": { "name": "chart.png", "mime": "image/png" },
    "ast-002": { "name": "doc.pdf",   "mime": "application/pdf" }
  },
  "compacted": false
}
```

### 3.1 フィールド定義

| field | type | 意味 |
|---|---|---|
| `format` | 固定文字列 `'pkc2-text-bundle'` | re-import 時の guard 対象 |
| `version` | 固定整数 `1` | re-import 時の guard 対象 |
| `exported_at` | ISO 8601 | export 時刻 |
| `source_cid` | string | 元 container id。audit only |
| `source_lid` | string | 元 entry lid。audit only |
| `source_title` | string | 元 entry title。import 時に復元される |
| `body_length` | number | `body.md` の文字数。informational |
| `asset_count` | number | `assets/` に実際に書き出した件数 |
| `missing_asset_count` | number | body.md に参照あるが書き出せなかった件数 |
| `missing_asset_keys` | string[] | 上記の key 一覧 (audit trail) |
| `assets` | `Record<key, {name, mime}>` | 書き出した asset の index |
| `compacted` | boolean | §7 参照 |

### 3.2 TEXTLOG との差分

- `entry_count` は **持たない**。text は定義上 1 本なので冗長。
- 代わりに `body_length` を持つ。破損検知 / 概算統計用。
- `assets` の shape は TEXTLOG と完全一致 (`{ name, mime }`)。
- `missing_asset_*` / `compacted` のセマンティクスも TEXTLOG と一致。
- 将来の加算フィールドは **未知でも無視** される契約 (TEXTLOG と同じ)。

---

## 4. `body.md`

- UTF-8
- **entry.body の中身をそのまま書く** — 改行正規化しない、BOM を足さない、
  front-matter を付けない、title を埋め込まない。
- **`body.md` が唯一の source of truth**。TEXTLOG の `text_markdown` と同じ立場。
  `text_plain` 相当のフラット化コピーは持たない (単一 body なので解釈の余地がなく、
  表計算ツールからの閲覧性という TEXTLOG の動機が消える)。

---

## 5. Asset 収集

- body.md 内の asset 参照は **2 種類**:
  - 画像埋め込み: `![alt](asset:<key>)`
  - リンクチップ: `[label](asset:<key>)`
- `(?:\s+"[^"]*")?` のオプション title attribute を許容。
- 参照の集計順序は **first-occurrence source-position 順** (decreasing duplicates)。
- `container.assets[<key>]` に binary があり、かつ `attachment` archetype の
  entry が `asset_key: <key>` を持つ場合に **resolved**。
  上記の片方でも欠けていれば **missing**。

### 5.1 asset file naming

- ファイル名は `assets/<key><.ext>`。
- 拡張子の決定順 (TEXTLOG と同じ `chooseExtension` を再利用):
  1. 元 attachment の `name` から `/\.([A-Za-z0-9]{1,8})$/` で抽出
  2. MIME 表 (`image/png` → `.png`, `application/pdf` → `.pdf`, …)
  3. `.bin` フォールバック

### 5.2 missing asset の扱い (non-compact)

- ZIP に書き出さない
- `manifest.assets` に列挙しない
- `manifest.missing_asset_keys` に追加
- **body.md には元の参照を verbatim で残す** (TEXTLOG と同じく broken reference
  の可視性を保つ)

---

## 6. Compact mode (TEXTLOG §13 相当)

`compact: true` で export した場合、**body.md を rewrite** してから書き出す。

### 6.1 rewrite ルール

- `![alt](asset:<missing>)` → `alt` (alt text に畳む)
- `[label](asset:<missing>)` → `label` (label text に畳む)
- `<missing>` は 5 の判定で resolved でなかったもののみ対象。
- valid な参照は **一切触らない**。

### 6.2 不変条件

- **live entry / container は never mutated**。rewrite 対象は body 文字列の
  snapshot。
- `manifest.missing_asset_keys` は compact mode 下でも **元参照に基づいて**
  記録される (audit trail として)。
- compact mode の有無にかかわらず、同じ元 entry に対する export は
  re-run で byte-deterministic (時刻以外)。

---

## 7. Import

### 7.1 適格性

- `manifest.format === 'pkc2-text-bundle'` AND `manifest.version === 1`。
  いずれかが不一致なら `{ ok: false, error }` を返し、dispatch 0。
- `body.md` 必須。欠落は failure。
- `manifest.json` 必須。JSON parse 失敗は failure。

### 7.2 body の読み取り

- `body.md` のバイト列を UTF-8 で decode し、**それを entry.body として採用**。
- 前後の whitespace は trim しない (先頭空行を意味的に使っているユーザを壊さない)。

### 7.3 asset の復元と rekey

- `manifest.assets` を keys() で巡り、各 key について対応する
  `assets/<key><.ext>` を検索。
- **常時再採番** (TEXTLOG §14.4 と同じ)。衝突チェックをしない。
- 新 key の形: `att-<timestamp>-<salt><rand>`。`processFileAttachment` と同形式。
- `keyMap[old] = new` を記録。
- body.md 内の `asset:<old>` 参照を **すべて** `asset:<new>` に書換。
- `manifest.assets` に列挙されているが対応ファイルが無い (= half-broken) /
  `manifest.assets` に未列挙 (= missing) の key は `keyMap` に入れない →
  body.md 内の対応参照は **verbatim で残る**。

### 7.4 entry 生成順序 (N+1)

1. **N 件の attachment entry** を先に dispatch (`CREATE_ENTRY` + `COMMIT_EDIT`)。
   `COMMIT_EDIT.assets` に base64 binary を乗せて container.assets に入れる。
2. **1 件の text entry** を後に dispatch。このとき body には既に新 key が
   書き込まれているので、`buildAssetMimeMap` の再計算で renderer は正しく
   resolve できる。
3. `importer` 層は dispatcher に触らない。raw material を返すだけで、
   caller (`main.ts`) が dispatch シーケンスを流す (TEXTLOG と同パターン)。

### 7.5 title の復元

- `manifest.source_title.trim() || 'Imported text'` を新 entry の title とする。

### 7.6 compacted / missing bundle の受理

- `compacted: true` のバンドルは **そのまま受理する**。export 側で既に
  rewrite 済みなので import 側は何もしない。
- `missing_asset_keys` を含むバンドルも valid。broken 参照は verbatim で保持される。

### 7.7 Failure atomicity

- パース境界 (ZIP parse / manifest JSON / format/version guard / body.md 必須) で
  失敗すれば `{ ok: false, error }`、dispatch は一切走らない。
- パース境界を超えた後の dispatch シーケンスは決定的。

---

## 8. Layering

- **`features/text/text-markdown.ts`** (新規, pure)
  - `collectMarkdownAssetKeys(markdown: string): string[]` — first-occurrence 順
  - `compactMarkdownAgainst(markdown: string, presentKeys: ReadonlySet<string>): string`
  - いずれも純関数、browser API 非依存、core の制約を満たす
- **`adapter/platform/text-bundle.ts`** (新規)
  - `buildTextBundle` / `exportTextAsBundle` / `buildTextBundleFilename`
  - `importTextBundle` / `importTextBundleFromBuffer`
  - Blob / download / ZIP parse は platform で閉じる
- **`adapter/ui/renderer.ts`**
  - `entry.archetype === 'text'` の action bar に export ボタン + compact checkbox
  - EIP toolbar に Import Text button
- **`adapter/ui/action-binder.ts`**
  - `export-text-zip` action を追加
- **`src/main.ts`**
  - `mountTextImportHandler` を追加 (`mountTextlogImportHandler` と同形状)

CLAUDE.md の `core ← features ← adapter ← runtime ← main` 層構造に完全準拠。

---

## 9. UI 表面

- **Detail action bar** (`entry.archetype === 'text'`):
  - `compact` checkbox (`data-pkc-control="text-export-compact"` scoped by lid)
  - `📦 Export .text.zip` button (`data-pkc-action="export-text-zip"`)
- **EIP (Export/Import Panel) toolbar**:
  - `📥 Import Text` button (`data-pkc-action="import-text-bundle"`)

これにより EIP toolbar は: Export / Light / ZIP / | / Import / Import Textlog / Import Text / | / Reset の **7 ボタン** 構成になる。

---

## 10. Readonly

- Detail action bar の export button は readonly でも常時表示 (export は mutation
  しないため)。
- EIP の `📥 Import Text` は readonly では **action handler 側で bail**。
  ボタン自体は shape 維持のため render され続ける (TEXTLOG と同じ方針)。

---

## 11. 意図的にやらないこと

| 項目 | 理由 |
|---|---|
| `text_plain` 相当のフラット化 | single-body には解釈の余地がない |
| title の front-matter 埋め込み | manifest.source_title で十分 |
| HTML / PDF 生成 | scope 外、既存の汎用 HTML export で足りる |
| container-wide batch export/import | 本 issue のスコープ外 (次候補) |
| TEXTLOG との共通型への抽出 | premature abstraction。container-wide を実装する時にまとめて |
| reducer-path の自動 GC | 本 issue のスコープ外 |
| import preview UI | 本 issue のスコープ外 |
| multi-tab coordination | 本 issue のスコープ外 |

---

## 12. 次候補

- **container-wide batch export/import** — 複数 entry を 1 bundle に詰める
  汎用 format。TEXT / TEXTLOG の sister format の経験を踏まえて設計する。
- **text archetype の preview UI** — import 前に manifest の内容を表示する UI。
- **汎用 import/export framework の整理** — 3 つ目以降の archetype が続く場合の
  DRY 化。今は YAGNI。

---

## 13. 参照

- `docs/development/textlog-csv-zip-export.md` — sister format の先行事例
- `src/adapter/platform/textlog-bundle.ts` — 実装パターンのリファレンス
- `src/features/textlog/textlog-csv.ts` — `stripBrokenAssetRefs` の先行実装
- `src/features/markdown/asset-resolver.ts` — `extractAssetReferences` 共通ヘルパ
