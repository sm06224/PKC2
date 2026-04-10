# Folder-scoped Export

## 1. 概要

選択中の folder 配下にある TEXT / TEXTLOG エントリを、
**まとめて1つの ZIP としてエクスポートする機能**。
export only（import は対象外）。

container-wide TEXT / TEXTLOG export と同じ nested ZIP 方式を、
folder スコープに絞って適用したもの。

---

## 2. folder scope 定義

- **再帰的に子孫を含む**（直下のみではない）
- `tree.ts` の structural relation (`kind === 'structural'`, `from → to`)
  を辿り、選択中 folder 配下の全 descendant を収集
- folder 自身は export 対象に含まない（folder は構造情報のみ）
- 子孫の中から対象 archetype のエントリだけを抽出

---

## 3. 対象 archetype

- **TEXT** (`archetype === 'text'`)
- **TEXTLOG** (`archetype === 'textlog'`)
- 上記以外の archetype（todo, attachment, form, folder, generic, opaque）は
  対象外
- TEXT / TEXTLOG のどちらか一方だけが存在する場合でも正常に動作する
- 対象エントリが 0 件の場合は、manifest のみの空 ZIP を生成

---

## 4. ZIP レイアウト

```
folder-<folder-slug>-<yyyymmdd>.folder-export.zip
├── manifest.json                       ← top-level manifest
├── <slug-1>-<yyyymmdd>.text.zip        ← TEXT の既存単体 bundle
├── <slug-2>-<yyyymmdd>.textlog.zip     ← TEXTLOG の既存単体 bundle
└── ...
```

### 設計判断

- 各 TEXT / TEXTLOG の既存 `.text.zip` / `.textlog.zip`
  **をそのまま内包する（nested ZIP）**
- container-wide export と同一の方式。差分は scope のみ。
- 展開すれば個別にも使える

### top-level manifest.json

```json
{
  "format": "pkc2-folder-export-bundle",
  "version": 1,
  "exported_at": "2026-04-10T12:00:00.000Z",
  "source_cid": "cnt-xxx",
  "source_folder_lid": "e-folder-001",
  "source_folder_title": "My Folder",
  "scope": "recursive",
  "text_count": 2,
  "textlog_count": 1,
  "compact": false,
  "entries": [
    {
      "lid": "e-text-001",
      "title": "My Document",
      "archetype": "text",
      "filename": "my-document-20260410.text.zip",
      "body_length": 1234,
      "asset_count": 3,
      "missing_asset_count": 0
    },
    {
      "lid": "e-log-001",
      "title": "Daily Notes",
      "archetype": "textlog",
      "filename": "daily-notes-20260410.textlog.zip",
      "log_entry_count": 42,
      "asset_count": 1,
      "missing_asset_count": 0
    }
  ]
}
```

### manifest フィールド定義

| field | type | 意味 |
|---|---|---|
| `format` | 固定文字列 `'pkc2-folder-export-bundle'` | 形式識別子 |
| `version` | 固定整数 `1` | バージョン |
| `exported_at` | ISO 8601 | export 時刻 |
| `source_cid` | string | 元 container id |
| `source_folder_lid` | string | 元 folder の lid |
| `source_folder_title` | string | 元 folder の title |
| `scope` | 固定文字列 `'recursive'` | 対象スコープ（将来 `'direct'` も候補） |
| `text_count` | number | 内包した TEXT 数 |
| `textlog_count` | number | 内包した TEXTLOG 数 |
| `compact` | boolean | compact mode で export したか |
| `entries[].lid` | string | 元 entry lid |
| `entries[].title` | string | 元 entry title |
| `entries[].archetype` | string | `'text'` or `'textlog'` |
| `entries[].filename` | string | 内包 ZIP のファイル名 |
| `entries[].body_length` | number | TEXT のみ: body.md の文字数 |
| `entries[].log_entry_count` | number | TEXTLOG のみ: ログ行数 |
| `entries[].asset_count` | number | 解決できたアセット数 |
| `entries[].missing_asset_count` | number | 欠損アセット数 |

container-wide manifest との差分:
- `source_folder_lid` / `source_folder_title` を追加
- `scope` フィールドを追加（`'recursive'` 固定）
- `text_count` + `textlog_count` で archetype ごとの件数を報告
- `entries[].archetype` を追加（mixed なので識別が必要）
- TEXT は `body_length`、TEXTLOG は `log_entry_count` を持つ（null 許容）

---

## 5. file naming rule

| レベル | 命名規則 | 例 |
|--------|----------|-----|
| 外側 ZIP | `folder-<folder-slug>-<yyyymmdd>.folder-export.zip` | `folder-my-project-20260410.folder-export.zip` |
| 内側 ZIP (TEXT) | 既存ルール: `<entry-slug>-<yyyymmdd>.text.zip` | `my-doc-20260410.text.zip` |
| 内側 ZIP (TEXTLOG) | 既存ルール: `<entry-slug>-<yyyymmdd>.textlog.zip` | `daily-notes-20260410.textlog.zip` |

同名衝突時は `-2`, `-3` のサフィックスを付与する。

---

## 6. missing asset warning

- **各 bundle 単位**で既存仕様を再利用
- top-level result に `totalMissingAssetCount` を集計
- export 前に合計 missing > 0 の場合、`confirm()` で通知

---

## 7. compact mode

- export 時に一括指定
- 各 `buildTextBundle()` / `buildTextlogBundle()` に `compact` を渡す
- top-level manifest の `compact` フィールドに記録

---

## 8. readonly 時の扱い

- readonly でも export 可能（読み取り専用操作）
- UI ボタンは readonly でも表示する

---

## 9. live state 不変

- container / entries / relations / assets は一切変更しない
- `buildTextBundle()` / `buildTextlogBundle()` は pure-ish（既存保証）
- folder scope 収集も読み取り専用

---

## 10. UI surfacing

- folder の detail action bar に `📦 Export` ボタンを追加
  - `data-pkc-action="export-folder"`
  - `data-pkc-lid="<folder-lid>"`
  - 対象 entry（TEXT / TEXTLOG）が 0 件の場合は非表示
  - readonly でも表示
- tooltip: `フォルダ配下の TEXT / TEXTLOG をまとめて ZIP エクスポート`
- Data… panel / context menu には追加しない（folder 選択時のみ有効な操作）
- Quick Help に `フォルダ export: フォルダ選択 → Export ボタン` を追記

---

## 11. 実装パターン

1. `features/relation/tree.ts` に `collectDescendantLids()` を追加
   - 既存の `collectDescendants` と同等だが public API として export
2. `adapter/platform/folder-export.ts` を新設
   - `buildFolderExportBundle(folderEntry, container, options)` を実装
   - 内部で `collectDescendantLids` → archetype filter → `buildTextBundle` / `buildTextlogBundle` を呼び出し
3. `adapter/ui/renderer.ts` で folder action bar に Export ボタンを追加
4. `adapter/ui/action-binder.ts` に `export-folder` ハンドラを追加

---

## 12. intentionally やらなかったこと

- folder-scoped import
- attachment / form / todo の export
- folder 構造（ネスト）の再現
- context menu からの export 導線
- Data… panel への追加（folder 専用なので action bar に置く）
- `scope: 'direct'`（直下のみ）のサポート

---

## 13. 次候補

- container-wide batch import
- folder 配下限定 import
- mixed archetype batch export/import
- `scope: 'direct'` オプション
