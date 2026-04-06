# 13. 基盤方針追補 — release artifact contract

配布される単一HTMLが満たすべき構造契約を定義する。
この契約は clone / rehydrate / embed のすべてが依存する基盤であり、
安易に変更してはならない。

---

## 13.1 根本原則

> **bundled な巨大 PKC.HTML を正本として扱わない。**
> **split source / docs / tests を正本とする。**
> **bundle artifact は CI / release engineering の成果物として扱う。**

- `dist/pkc2.html` は `src/` からの派生物であり、再生成可能
- 正本は常に repository 内の `src/`, `docs/`, `tests/`
- release artifact には再生成に必要な metadata を埋め込む

---

## 13.2 HTML 構造契約

release artifact（`dist/pkc2.html`）は以下の構造を必ず持つ:

```html
<!DOCTYPE html>
<html lang="ja"
      data-pkc-version="2.0.0"
      data-pkc-schema="1"
      data-pkc-build="20260406143052"
      data-pkc-kind="product">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <meta name="pkc-integrity" content="sha256:xxxx">
  <title>PKC2</title>
  <style id="pkc-styles">/* ... minified CSS ... */</style>
  <style id="pkc-theme">/* ... theme overrides, replaceable ... */</style>
</head>
<body>
  <div id="pkc-root"></div>

  <!-- データ領域: JSON。rehydrate / export で読み書き -->
  <script id="pkc-data" type="application/json">{}</script>

  <!-- release metadata: version, build, integrity -->
  <script id="pkc-meta" type="application/json">{
    "version": "2.0.0",
    "schema": 1,
    "build_at": "20260406143052",
    "kind": "product",
    "code_integrity": "sha256:xxxx"
  }</script>

  <!-- コア: minified JS。IIFE で閉じる -->
  <script id="pkc-core">(function(){/* ... */})();</script>
</body>
</html>
```

---

## 13.3 固定 ID 契約

以下の HTML 要素 ID は契約として固定される。
rehydrate / export / clone / embed のすべてがこの ID に依存する。

| ID | 用途 | 変更可否 |
|----|------|---------|
| `pkc-root` | UIマウントポイント | **不変** |
| `pkc-data` | ユーザーデータ JSON | **不変** |
| `pkc-meta` | release metadata JSON | **不変** |
| `pkc-core` | アプリケーション JS | **不変** |
| `pkc-styles` | 基本 CSS | **不変** |
| `pkc-theme` | テーマ CSS（差し替え可能） | **不変** |

これらは minify の影響を受けない（HTML 属性であり JS 識別子ではない）。
JS 内からは文字列定数として参照する:

```typescript
// src/runtime/contract.ts
export const SLOT = {
  ROOT:   'pkc-root',
  DATA:   'pkc-data',
  META:   'pkc-meta',
  CORE:   'pkc-core',
  STYLES: 'pkc-styles',
  THEME:  'pkc-theme',
} as const;
```

---

## 13.4 pkc-data 契約

`<script id="pkc-data">` には以下の JSON 構造を格納する:

```json
{
  "container": {
    "meta": {
      "container_id": "uuid",
      "title": "string",
      "created_at": "ISO8601",
      "updated_at": "ISO8601",
      "schema_version": 1
    },
    "records": [],
    "relations": [],
    "revisions": [],
    "assets": {}
  }
}
```

- 空コンテナ: `records`, `relations`, `revisions` は空配列、`assets` は空オブジェクト
- rehydrate: この JSON を parse し、core model に変換
- export: core model をこの JSON に変換し、`pkc-data` を書き換えて HTML を保存

---

## 13.5 pkc-meta 契約

`<script id="pkc-meta">` には以下を格納する:

```json
{
  "version": "2.0.0",
  "schema": 1,
  "build_at": "20260406143052",
  "kind": "product",
  "code_integrity": "sha256:xxxx",
  "source_commit": "abc1234"
}
```

| フィールド | 説明 |
|-----------|------|
| `version` | semver。コード互換性の判断基準 |
| `schema` | データスキーマバージョン。マイグレーション判断基準 |
| `build_at` | ビルド時刻。14桁タイムスタンプ（YYYYMMDDHHmmss） |
| `kind` | `dev` / `stage` / `product` |
| `code_integrity` | `pkc-core` の SHA-256 hash。改竄検知 |
| `source_commit` | ビルド元の git commit hash（開発トレーサビリティ） |

---

## 13.6 integrity 検証

release artifact は自身のコード改竄を検知できる:

1. `pkc-meta.code_integrity` に `pkc-core` の hash を保持
2. ランタイム起動時、`pkc-core` の textContent を hash し `code_integrity` と比較
3. 不一致時は警告表示（ブロックはしない — ユーザーの自由を尊重）

これにより:
- export されたHTMLのコード部分が改竄されていないことを検証できる
- データ部分（`pkc-data`）の変更は integrity に影響しない（正常な export 操作）
- clone 元とコードの同一性を検証できる

---

## 13.7 clone 同型性の担保

clone（コンテナ複製）時に release artifact に埋め込むべき情報:

1. **pkc-core**: オリジナルと同一のコード（改変しない）
2. **pkc-styles**: オリジナルと同一の基本CSS
3. **pkc-theme**: clone 元のテーマ設定（または既定値）
4. **pkc-meta**: オリジナルの meta をコピー + clone 固有情報を追記
5. **pkc-data**: 新しい container_id + clone 種別に応じたデータ

clone 後の HTML は、オリジナルと同じ pkc-core / pkc-styles を持つため、
同一の機能・契約・UI で動作することが保証される。

---

## 13.8 契約バージョニング

この release artifact contract 自体もバージョン管理する。

- `schema` フィールドで管理
- schema 1 → schema 2 への移行時は rehydrate にマイグレーションロジックを追加
- schema の後方互換は「1世代前まで読める」を最低保証
- 契約変更は breaking change として扱い、semver major を上げる
