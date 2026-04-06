# 21. Release Metadata / Manifest

---

## 21.1 目的

release artifact (`dist/pkc2.html`) に埋め込む metadata を型・生成・検証で確立し、
「この PKC2 単一 HTML が何者か」を自己記述できる状態にする。

---

## 21.2 ReleaseMeta の shape

```typescript
interface ReleaseMeta {
  app: 'pkc2';              // 固定 app ID
  version: string;           // semver (e.g. "2.0.0")
  schema: number;            // データスキーマバージョン
  kind: ReleaseKind;         // 'dev' | 'stage' | 'product'
  timestamp: string;         // 14桁 YYYYMMDDHHmmss (user-facing version)
  build_at: string;          // ISO 8601 build time
  source_commit: string;     // git short hash
  code_integrity: string;    // "sha256:<hex>" (pkc-core の SHA-256)
  capabilities: string[];    // 機能リスト ['core', 'idb', ...]
}
```

### triple version

`version-kind+timestamp` の形式で表示:
```
2.0.0-dev+20260406143052
2.0.0-product+20260501120000
```

---

## 21.3 Builder と Runtime の責務分離

| 情報 | 生成元 | 理由 |
|------|--------|------|
| `app` | builder (固定値) | コード側の定数 |
| `version` | builder (package.json) | semver はリリース管理 |
| `schema` | builder (定数) | ソース側で管理 |
| `kind` | builder (PKC_KIND env) | ビルド構成 |
| `timestamp` | builder (ビルド時生成) | ビルド時刻 |
| `build_at` | builder (ISO 8601) | 機械可読ビルド時刻 |
| `source_commit` | builder (git rev-parse) | ビルドプロベナンス |
| `code_integrity` | builder (SHA-256) | JS バンドルのハッシュ |
| `capabilities` | builder (ソース定数) | 機能リスト |

**Runtime は読み取りと検証のみ**。metadata を生成する責務はない。

---

## 21.4 Source-side 定数

`src/runtime/release-meta.ts` に定義:

```typescript
export const APP_ID = 'pkc2';
export const SCHEMA_VERSION = 1;
export const CAPABILITIES = ['core', 'idb'];
```

builder は**これらの値をミラー**して pkc-meta に埋め込む。
将来、feature が追加されたら CAPABILITIES を更新する。

---

## 21.5 Integrity 検証

### ビルド時

builder が `dist/bundle.js` の SHA-256 を計算し、
`code_integrity: "sha256:<hex>"` として pkc-meta に埋め込む。

### ランタイム時

`verifyCodeIntegrity(meta)` が:
1. `pkc-core` の textContent を取得
2. Web Crypto API で SHA-256 を計算
3. `meta.code_integrity` と比較
4. `'ok'` / `'mismatch'` / `'skip'` を返す

### スキップ条件

- kind === 'dev' → skip（開発中は検証不要）
- crypto.subtle が利用不可 → skip
- pkc-core / pkc-meta がない → skip

### 不一致時

**警告のみ、ブロックしない**。ユーザーの自由を尊重する PKC の原則。

---

## 21.6 HTML 構造への反映

### `<html>` 要素の data 属性

```html
<html lang="ja"
      data-pkc-app="pkc2"
      data-pkc-version="2.0.0"
      data-pkc-schema="1"
      data-pkc-timestamp="20260406143052"
      data-pkc-kind="dev">
```

### `<script id="pkc-meta">`

完全な ReleaseMeta JSON を格納。

---

## 21.7 データの 3 分類

| 分類 | 説明 | 置き場 |
|------|------|--------|
| **seed data** | release artifact に埋め込まれた初期データ | pkc-data (ビルド時は空) |
| **working data** | ユーザーが mutation した現在のデータ | IDB |
| **release metadata** | artifact の自己記述情報 | pkc-meta |

- seed data と working data は同じ Container 形式だが、意味が異なる
- release metadata は Container とは無関係
- export 時は working data を pkc-data に書き出す

---

## 21.8 テスト一覧

| テストファイル | テスト数 | 検証内容 |
|--------------|---------|---------|
| `tests/runtime/release-meta.test.ts` | 7 | 型・定数・フォーマット |
| `tests/runtime/meta-reader.test.ts` | 8 | DOM読み取り・欠損処理・triple version |
| `tests/runtime/builder-output.test.ts` | 9 | ビルド成果物検証・全フィールド・integrity一致 |
| 既存テスト | 105 | (変更なし) |

合計: **129 テスト**, 14 ファイル

---

## 21.9 今回あえて入れなかっ���もの

| 項目 | 理由 |
|------|------|
| ランタイムでの integrity 自動検証 | boot 時に verifyCodeIntegrity() は定義済みだが、呼び出しは export 実装時に接続 |
| metadata の UI 表示 | header に version 表示は後回し（shell 変更を最小限に） |
| capability negotiation | PKC-Message / embed 実装時に |
| schema migration | スキーマ 1 のみ。バージョン管理の仕組みは用意済み |
| data_integrity (pkc-data のハッシュ) | データは正常な export 操作で変わるため不要 |

---

## 21.10 次に着手すべき Issue

| 優先 | Issue | 内容 |
|------|-------|------|
| 次 | **HTML export** | Container → pkc-data 埋め込み → 単一 HTML 出力 |
| 後 | **clone** | pkc-data 置換で clone 生成 |
| 後 | **embed / sandbox** | iframe + capability negotiation |
| 後 | **PKC-Message transport** | MessageEnvelope → SystemCommand ��換 |
