# Entry-level Deep Preview for Batch Import

## 1. 概要

batch import preview パネルの各 entry に **lightweight な中身プレビュー** を追加する。

現状の preview は summary (format / counts / missing) + entry list (title + archetype + checkbox)
に留まっている。本 Issue では、各 entry を展開して **body の先頭部分を確認** できるようにする。

import wizard 化はしない。disclosure / accordion 型の最小 UI にとどめる。

---

## 2. 表示項目

### 2.1 TEXT entry

| 項目 | ソース | 説明 |
|---|---|---|
| body snippet | nested `body.md` 先頭 200 文字 | truncate 表示、末尾に `…` |
| body length | inner manifest `body_length` | `N 文字` |
| asset count | inner manifest `asset_count` | `N assets` |
| missing count | inner manifest `missing_asset_count` | `N missing` (> 0 のみ) |

### 2.2 TEXTLOG entry

| 項目 | ソース | 説明 |
|---|---|---|
| log entry count | inner manifest `entry_count` | `N entries` |
| 先頭ログ snippet | nested `textlog.csv` 先頭 3 行の `text_markdown` | 各 80 文字で truncate |
| asset count | inner manifest `asset_count` | `N assets` |
| missing count | inner manifest `missing_asset_count` | `N missing` (> 0 のみ) |

---

## 3. UI 構造

各 entry row の下に `<details>` (native disclosure) を配置:

```
□ My Document [TEXT]
  ▶ Preview
    ┌──────────────────────────────────┐
    │ Hello **world**, this is a test  │
    │ document with some markdown...   │
    │                                  │
    │ 1234 文字 | 3 assets             │
    └──────────────────────────────────┘

□ Daily Log [TEXTLOG]
  ▶ Preview
    ┌──────────────────────────────────┐
    │ 42 log entries                   │
    │ 1. Meeting with Alice about...   │
    │ 2. Fixed the rendering bug...    │
    │ 3. Deployed v2.1.0 to prod...   │
    │                                  │
    │ 5 assets | 1 missing             │
    └──────────────────────────────────┘
```

### 3.1 default collapsed

- `<details>` は **default closed** (collapsed)
- ユーザが明示的にクリックして展開する
- 展開状態は `<details>` 要素の native open 属性で管理される
  (state machine に展開フラグを持たせない — re-render で消える前提)

### 3.2 default collapsed の理由

- 大量の entry がある場合に一覧性を保つ
- full parse を避け、lightweight preview を目指す
- ユーザが「見たい entry だけ」展開する UX

---

## 4. データ抽出方式

### 4.1 preview 時点での nested peek

`previewBatchBundleFromBuffer()` の中で、各 nested bundle の:
- inner `manifest.json` を JSON parse
- `body.md` (TEXT) または `textlog.csv` (TEXTLOG) の先頭部分を読む

これは **full import parse ではない**:
- asset re-keying しない
- body rewrite しない
- attachment entry を構築しない
- dispatch 材料を作らない

あくまで「覗き見」(peek) であり、import ロジックとは独立。

### 4.2 TEXTLOG の CSV peek

textlog.csv の先頭 3 行の `text_markdown` を取得するために
`parseTextlogCsv()` で全行パースし先頭 3 件を抽出する。
CSV は通常小さいので性能上問題ない。

---

## 5. 型の変更

### BatchImportPreviewEntry (拡張)

```typescript
export interface BatchImportPreviewEntry {
  index: number;
  title: string;
  archetype: 'text' | 'textlog';
  // NEW: deep preview fields (optional — absent if peek fails)
  bodySnippet?: string;
  bodyLength?: number;
  logEntryCount?: number;
  logSnippets?: string[];
  assetCount?: number;
  missingAssetCount?: number;
}
```

全 deep preview フィールドは optional。nested bundle の peek に失敗しても
summary preview + selective import は壊れない。

---

## 6. selective import との共存

- deep preview は表示のみ。checkbox / toggle-all / Continue / Cancel に影響しない
- `<details>` は checkbox を含む `<label>` の **外側** に配置
  (checkbox の click が details toggle にバブルしないように)
- 構造: `<div class="pkc-batch-entry-row">` の中に `<label>` (checkbox) と
  `<details>` (preview) を兄弟として並べる

---

## 7. summary preview への影響

- 既存の summary table (format / source / counts / compacted / missing / folder caveat) は変更なし
- entry list の各行に `<details>` が追加されるのみ

---

## 8. Layering

- **`adapter/platform/batch-import.ts`** (変更)
  - `previewBatchBundleFromBuffer()` に nested peek ロジックを追加
  - `BatchImportPreviewEntry` に optional フィールドを追加
- **`adapter/ui/renderer.ts`** (変更)
  - `renderBatchImportPreview()` の entry 行に `<details>` を追加

---

## 9. Readonly

- deep preview は読み取り専用操作
- readonly 時はそもそも batch import preview が表示されないので影響なし

---

## 10. Intentionally やらないこと

| 項目 | 理由 |
|---|---|
| asset preview (画像表示等) | scope 外。body snippet のみ |
| inline edit | import preview は read-only |
| full body 全文表示 | truncate で十分 |
| body 差分編集 | scope 外 |
| markdown render | plain text snippet で十分 |
| TEXTLOG の全ログ表示 | 先頭 3 件で十分 |
| expand 状態の state machine 管理 | native `<details>` で十分 |
| folder structure restore | 別 Issue |

---

## 11. テスト要件

1. preview entry に deep preview フィールドが含まれる (TEXT)
2. preview entry に deep preview フィールドが含まれる (TEXTLOG)
3. body snippet が 200 文字以内に truncate される
4. TEXTLOG の logSnippets が 3 件以内
5. assetCount / missingAssetCount が正しく設定される
6. deep preview peek 失敗時も summary preview が成立する
7. renderer が `<details>` を描画する
8. `<details>` が default closed である
9. selective import checkbox と競合しない (構造テスト)
10. summary table の既存項目が変わらない

---

## 12. 次候補

- folder structure restore
- import/export パターン共通化の棚卸し
- asset preview (deep preview の拡張)
