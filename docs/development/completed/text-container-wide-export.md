# TEXT Container-wide ZIP Export

## 1. 概要

container 内の複数 TEXT エントリを、
**まとめて1つの ZIP としてエクスポートする機能**。
export only（import は対象外）。

TEXTLOG container-wide export (`textlog-bundle.ts::buildTextlogsContainerBundle`)
と同じ nested ZIP 方式を TEXT に展開したもの。

---

## 2. ZIP レイアウト

```
texts-<container-slug>-<yyyymmdd>.texts.zip
├── manifest.json                       ← top-level manifest
├── <slug-1>-<yyyymmdd>.text.zip        ← 既存単体 bundle そのまま
├── <slug-2>-<yyyymmdd>.text.zip
└── ...
```

### 設計判断: 内包方式

- 各 TEXT の既存 `.text.zip` **をそのまま内包する（nested ZIP）**
- 新しい集約形式は作らない
- 各 bundle は `buildTextBundle()` の出力をバイト列としてそのまま格納
- 展開すれば個別にも使える（opaque ではない）

### top-level manifest.json

```json
{
  "format": "pkc2-texts-container-bundle",
  "version": 1,
  "exported_at": "2026-04-10T12:00:00.000Z",
  "source_cid": "cnt-xxx",
  "source_title": "Container Title",
  "entry_count": 3,
  "compact": false,
  "entries": [
    {
      "lid": "e-text-001",
      "title": "My Document",
      "filename": "my-document-20260410.text.zip",
      "body_length": 1234,
      "asset_count": 3,
      "missing_asset_count": 0
    }
  ]
}
```

### manifest フィールド定義

| field | type | 意味 |
|---|---|---|
| `format` | 固定文字列 `'pkc2-texts-container-bundle'` | 形式識別子 |
| `version` | 固定整数 `1` | バージョン |
| `exported_at` | ISO 8601 | export 時刻 |
| `source_cid` | string | 元 container id |
| `source_title` | string | 元 container title |
| `entry_count` | number | 内包した TEXT エントリ数 |
| `compact` | boolean | compact mode で export したか |
| `entries[].lid` | string | 元 entry lid |
| `entries[].title` | string | 元 entry title |
| `entries[].filename` | string | 内包 ZIP のファイル名 |
| `entries[].body_length` | number | body.md の文字数 |
| `entries[].asset_count` | number | 解決できたアセット数 |
| `entries[].missing_asset_count` | number | 欠損アセット数 |

TEXTLOG container manifest との差分:
- `log_entry_count` の代わりに `body_length` を使用（TEXT は単一 body）

---

## 3. export 対象

**container 内の全 TEXT エントリ**。

- folder による絞り込みは今回やらない
- `archetype === 'text'` のみ対象
- 順序は `container.entries` の出現順

---

## 4. file naming rule

| レベル | 命名規則 | 例 |
|--------|----------|-----|
| 外側 ZIP | `texts-<container-slug>-<yyyymmdd>.texts.zip` | `texts-my-project-20260410.texts.zip` |
| 内側 ZIP | 既存ルール: `<entry-slug>-<yyyymmdd>.text.zip` | `my-document-20260410.text.zip` |

同名衝突時は `-2`, `-3` のサフィックスを付与する。

---

## 5. missing asset warning

- **各 bundle 単位**で既存仕様を再利用
- top-level result に `totalMissingAssetCount` を集計
- export 前に合計 missing > 0 の場合、`confirm()` で通知

---

## 6. compact mode

- export 時に一括指定（top-level のフラグ）
- 各 `buildTextBundle()` に `compact` を渡す
- top-level manifest の `compact` フィールドに記録

---

## 7. readonly 時の扱い

- readonly でも export 可能（読み取り専用操作）
- UI ボタンは readonly でも表示する

---

## 8. live state 不変

- container / entries / assets は一切変更しない
- `buildTextBundle()` は pure-ish（既存保証）
- top-level manifest 構築も読み取り専用

---

## 9. 実装パターン

`textlog-bundle.ts::buildTextlogsContainerBundle` と同じパターン:

1. `buildTextBundle` に `zipBytes` フィールドを追加
2. `createZipBlob` → `createZipBytes` に切り替え（inner ZIP のバイト列を直接取得）
3. `buildTextsContainerBundle()` は各 TEXT に対して `buildTextBundle()` を呼び出し、
   `built.zipBytes` を outer ZIP にネスト

---

## 10. intentionally やらなかったこと

- container-wide import（別 Issue）
- TEXTLOG / attachment / form / todo を含む batch export
- folder 配下限定の export
- top-level での body 集約（各 bundle 内の body.md をそのまま使う）
- 各 bundle の展開・再パック（nested ZIP をそのまま格納）

---

## 11. 次候補

- container-wide batch import
- folder 配下限定 export
- 汎用 container-wide export（TEXT + TEXTLOG 混在）
