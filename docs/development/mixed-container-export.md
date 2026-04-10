# Mixed Container-wide Export / Import (`.mixed.zip`)

## 1. 概要

container 内の **TEXT と TEXTLOG を混在させた 1 つの ZIP** としてエクスポート / インポートする機能。

既存の個別フォーマット:
- `pkc2-texts-container-bundle` (TEXT only)
- `pkc2-textlogs-container-bundle` (TEXTLOG only)
- `pkc2-folder-export-bundle` (folder scoped, mixed)

に対する **container-wide mixed** バリアント。
folder-export と同じ nested ZIP + per-entry archetype パターンを採用し、
folder scoping を外して container 全体を対象にする。

---

## 2. ZIP レイアウト

```
mixed-<container-slug>-<yyyymmdd>.mixed.zip
├── manifest.json                         ← top-level manifest
├── <slug-1>-<yyyymmdd>.text.zip          ← 既存単体 .text.zip そのまま
├── <slug-2>-<yyyymmdd>.textlog.zip       ← 既存単体 .textlog.zip そのまま
└── ...
```

### 設計判断: nested ZIP 方式

- folder-export と同じ nested ZIP 方式を採用
- 各 entry の既存 `.text.zip` / `.textlog.zip` をそのまま内包
- 展開すれば個別にも使える
- 新しい集約形式は作らない

---

## 3. `manifest.json`

```json
{
  "format": "pkc2-mixed-container-bundle",
  "version": 1,
  "exported_at": "2026-04-10T12:00:00.000Z",
  "source_cid": "cnt-xxx",
  "source_title": "Container Title",
  "text_count": 3,
  "textlog_count": 2,
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

### 3.1 フィールド定義

| field | type | 意味 |
|---|---|---|
| `format` | 固定文字列 `'pkc2-mixed-container-bundle'` | 形式識別子 |
| `version` | 固定整数 `1` | re-import 時の guard |
| `exported_at` | ISO 8601 | export 時刻 |
| `source_cid` | string | 元 container id |
| `source_title` | string | 元 container title |
| `text_count` | number | 内包 TEXT エントリ数 |
| `textlog_count` | number | 内包 TEXTLOG エントリ数 |
| `compact` | boolean | compact mode で export したか |
| `entries[].lid` | string | 元 entry lid |
| `entries[].title` | string | 元 entry title |
| `entries[].archetype` | `'text' \| 'textlog'` | エントリの archetype |
| `entries[].filename` | string | 内包 ZIP のファイル名 |
| `entries[].body_length` | number? | body.md の文字数 (text のみ) |
| `entries[].log_entry_count` | number? | ログエントリ数 (textlog のみ) |
| `entries[].asset_count` | number | 解決できたアセット数 |
| `entries[].missing_asset_count` | number | 欠損アセット数 |

### 3.2 folder-export との差分

- `source_folder_lid` / `source_folder_title` / `scope` は **持たない**
  (container-wide なのでフォルダ情報は不要)
- `text_count` / `textlog_count` を持つ (folder-export と同じ)
- `entries[].archetype` を持つ (folder-export と同じ)
- 上記以外の構造は folder-export と完全一致

---

## 4. Export 対象

**container 内の全 TEXT + TEXTLOG エントリ**。

- `archetype === 'text' || archetype === 'textlog'` のみ対象
- 他の archetype (attachment / todo / form / folder / generic / opaque) は除外
- 順序は `container.entries` の出現順

---

## 5. ファイル命名規則

| レベル | 命名規則 | 例 |
|--------|----------|-----|
| 外側 ZIP | `mixed-<container-slug>-<yyyymmdd>.mixed.zip` | `mixed-my-project-20260410.mixed.zip` |
| 内側 (text) | 既存ルール: `<slug>-<yyyymmdd>.text.zip` | `my-doc-20260410.text.zip` |
| 内側 (textlog) | 既存ルール: `<slug>-<yyyymmdd>.textlog.zip` | `daily-notes-20260410.textlog.zip` |

同名衝突時は `-2`, `-3` のサフィックスを付与する。

---

## 6. Missing asset warning

- export 前に全 entry の missing asset を合計
- 合計 > 0 の場合 `confirm()` で通知
- 各 bundle 内の manifest に個別の `missing_asset_keys` が記録される (既存動作)

---

## 7. Compact mode

- export 時に一括指定 (UI は既存パターン不要 — 将来拡張用)
- 各 `buildTextBundle()` / `buildTextlogBundle()` に `compact` を渡す
- top-level manifest の `compact` フィールドに記録

---

## 8. Import

### 8.1 適格性

- `manifest.format === 'pkc2-mixed-container-bundle'` AND `manifest.version === 1`
- `entries` 配列必須
- 各 entry の `archetype` が `'text'` または `'textlog'` であること

### 8.2 処理フロー

既存の `batch-import.ts` に format を追加するだけ:

1. `ACCEPTED_FORMATS` に `'pkc2-mixed-container-bundle'` を追加
2. `resolveArchetype()` に case を追加: `entry.archetype` を読み取る
3. `FORMAT_LABELS` にラベルを追加

nested ZIP の parse / asset re-key / N+1 dispatch は既存インフラで処理される。

### 8.3 Preview / Selective Import

既存の preview UI + selective import がそのまま動作する:
- manifest-only preview (nested parse 不要)
- per-entry の title + archetype 表示
- checkbox による ON/OFF 切替
- TEXT / TEXTLOG をまたいだ選別が可能

---

## 9. Layering

- **`adapter/platform/mixed-bundle.ts`** (新規)
  - `buildMixedContainerBundle()` — export
  - folder-export と同じパターンだが folder scoping なし
- **`adapter/platform/batch-import.ts`** (変更)
  - `ACCEPTED_FORMATS` に format 追加
  - `resolveArchetype` に case 追加
  - `FORMAT_LABELS` に label 追加
- **`adapter/ui/renderer.ts`** (変更)
  - EIP パネルに `📦 Mixed` export ボタン追加
- **`adapter/ui/action-binder.ts`** (変更)
  - `export-mixed-container` action 追加

---

## 10. UI 表面

### EIP (Export/Import Panel)

export ボタン群に `📦 Mixed` を追加:
- `data-pkc-action="export-mixed-container"`
- `title="全 TEXT / TEXTLOG をまとめて ZIP エクスポート (.mixed.zip)"`
- TEXT または TEXTLOG が 1 件以上ある場合のみ表示

### Batch import ボタン

既存の `📥 Batch` ボタンの tooltip を更新して `.mixed.zip` を追記。
accept 属性に `.mixed.zip` を追加。

---

## 11. Readonly

- export は readonly でも常時利用可能 (読み取り専用操作)
- import は readonly 時 action handler 側で bail

---

## 12. Live state 不変

- container / entries / assets は一切変更しない
- `buildTextBundle` / `buildTextlogBundle` は pure-ish (既存保証)
- top-level manifest 構築も読み取り専用

---

## 13. Intentionally やらないこと

| 項目 | 理由 |
|---|---|
| attachment / todo / form / generic / opaque | scope 外。TEXT + TEXTLOG のみ |
| folder structure restore | 別 Issue |
| entry-level deep preview | 別 Issue |
| 既存 formats との DRY 統合 | premature abstraction |
| compact mode の UI checkbox | container-wide では不要 (API は対応済み) |

---

## 14. テスト要件

1. mixed bundle export で TEXT + TEXTLOG 両方が含まれる
2. manifest が正しいフォーマット / バージョン / archetype を持つ
3. assets が正しく同梱される
4. ファイル名衝突時のサフィックス付与
5. TEXT 0 件 + TEXTLOG N 件の場合
6. TEXT N 件 + TEXTLOG 0 件の場合
7. mixed bundle の batch import が成立する (round-trip)
8. preview で TEXT / TEXTLOG の archetype が正しく表示される
9. selective import で TEXT / TEXTLOG をまたいで選別できる
10. asset key が正しく再採番される
11. failure-atomic を維持する (不正 ZIP → error, dispatch 0)

---

## 15. 次候補

- entry-level deep preview
- folder structure restore
- compact mode の UI checkbox (container-wide export 向け)
