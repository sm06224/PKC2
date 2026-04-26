# TEXTLOG Container-wide CSV+ZIP Export

## 1. 概要

container 内の複数 TEXTLOG エントリを、
**まとめて1つの ZIP としてエクスポートする機能**。
export only（import は対象外）。

---

## 2. ZIP レイアウト

```
textlogs-<container-slug>-<yyyymmdd>.textlogs.zip
├── manifest.json                         ← top-level manifest
├── <slug-1>-<yyyymmdd>.textlog.zip       ← 既存単体 bundle そのまま
├── <slug-2>-<yyyymmdd>.textlog.zip
└── ...
```

### 設計判断: 内包方式

- 各 TEXTLOG の既存 `.textlog.zip` **をそのまま内包する（nested ZIP）**
- 新しい CSV 集約形式は作らない
- 各 bundle は `buildTextlogBundle()` の出力をバイト列としてそのまま格納
- 展開すれば個別にも使える（opaque ではない）

### top-level manifest.json

```json
{
  "format": "pkc2-textlogs-container-bundle",
  "version": 1,
  "exported_at": "2026-04-10T12:00:00.000Z",
  "source_cid": "cnt-xxx",
  "source_title": "Container Title",
  "entry_count": 3,
  "compact": false,
  "entries": [
    {
      "lid": "e-log-001",
      "title": "Daily Notes",
      "filename": "daily-notes-20260410.textlog.zip",
      "log_entry_count": 42,
      "asset_count": 3,
      "missing_asset_count": 0
    }
  ]
}
```

---

## 3. export 対象

**container 内の全 TEXTLOG エントリ**。

- folder による絞り込みは今回やらない
- archetype === 'textlog' のみ対象
- 順序は container.entries の出現順

---

## 4. file naming rule

| レベル | 命名規則 | 例 |
|--------|----------|-----|
| 外側 ZIP | `textlogs-<container-slug>-<yyyymmdd>.textlogs.zip` | `textlogs-my-project-20260410.textlogs.zip` |
| 内側 ZIP | 既存ルール: `<entry-slug>-<yyyymmdd>.textlog.zip` | `daily-notes-20260410.textlog.zip` |

同名衝突時は `-2`, `-3` のサフィックスを付与する。

---

## 5. missing asset warning

- **各 bundle 単位**で既存仕様を再利用
- top-level manifest に全体の missing 件数集計はない
- export 前に合計 missing > 0 の場合、confirm() で通知

---

## 6. compact mode

- export 時に一括指定（top-level のフラグ）
- 各 `buildTextlogBundle()` に `compact` を渡す
- top-level manifest の `compact` フィールドに記録

---

## 7. readonly 時の扱い

- readonly でも export 可能（読み取り専用操作）
- UI ボタンは readonly でも表示する

---

## 8. live state 不変

- container / entries / assets は一切変更しない
- `buildTextlogBundle()` は pure-ish（既存保証）
- top-level manifest 構築も読み取り専用

---

## 9. intentionally やらなかったこと

- container-wide import（別 Issue）
- TEXT / attachment / form / todo を含む batch export
- folder 配下限定の export
- top-level での CSV 集約（各 bundle 内の CSV をそのまま使う）
- 各 bundle の展開・再パック（nested ZIP をそのまま格納）

---

## 10. 次候補

- container-wide batch import
- container-wide TEXT export（同方式で拡張可能）
- folder 配下限定 export
