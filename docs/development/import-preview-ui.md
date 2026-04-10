# Import Preview UI

## 1. 概要

batch import（container-wide / folder-scoped）の実行前に、
**bundle の中身を軽く確認できる preview パネル** を表示する機能。

- import の意味論は変えない（always-additive / failure-atomic）
- preview → Continue / Cancel の 2 択
- Cancel は state 不変
- Continue は既存 import ロジックへ委譲

---

## 2. preview で表示する項目

| 項目 | 説明 |
|------|------|
| Format | `pkc2-texts-container-bundle` 等の format 文字列（人間向けラベル） |
| Source | ファイル名 |
| Total entries | manifest の entry 件数 |
| TEXT / TEXTLOG 内訳 | 各 archetype の件数 |
| Compacted | `manifest.compact === true` なら表示 |
| Missing assets | `missing_asset_count > 0` の entry がある場合に合計数を表示 |
| Folder caveat | folder-export の場合「フォルダ構造は復元されません」を表示 |

---

## 3. preview に表示しない項目

- 各 entry のタイトル・body の中身（heavy preview は対象外）
- asset の中身・プレビュー
- 元 container のメタ情報（CID / schema version 等）
- diff / merge 情報

---

## 4. unsupported / invalid bundle の見せ方

- preview 段階で manifest を読み、format / version が不正なら
  **preview を表示せず、即座にエラー** とする
- エラーは既存の `SYS_ERROR` で表示（既存 batch import と同一）
- preview パネルは valid な bundle のみに表示される

---

## 5. Continue / Cancel の意味

| 操作 | 効果 |
|------|------|
| **Continue** | preview を閉じて、既存 batch import ロジックを実行。entries を dispatch。 |
| **Cancel** | preview を閉じて、何もしない。state 不変。 |

- Continue 後の dispatch は既存の N+1 パターン（attachments → main entry）
- Cancel は `CANCEL_BATCH_IMPORT` を dispatch → `batchImportPreview` を null に戻す

---

## 6. folder-export bundle の caveat

`format === 'pkc2-folder-export-bundle'` の場合:
- preview パネルに **「フォルダ構造は復元されません」** と注記を表示
- import の挙動自体は変わらない（batch import と同一）

---

## 7. live state 不変条件

- preview 表示中は `batchImportPreview` フィールドのみ変化
- Cancel 時は `batchImportPreview` を null に戻すだけ（他の state は不変）
- Continue 時は `batchImportPreview` を null にした後、既存 dispatch パターンで entries 追加
- preview 関数自体は dispatcher に触らない

---

## 8. readonly 時の扱い

- readonly では `📥 Batch` ボタン自体が非表示
- handler 側でも `state.readonly` で bail
- readonly で preview が表示されることはない

---

## 9. 実装方針

### preview metadata 抽出

`batch-import.ts` に `previewBatchBundleFromBuffer()` を追加:
- outer ZIP を parse し manifest.json のみ読む
- nested bundle は parse しない（高速）
- format / version を検証
- `BatchImportPreviewInfo` を返す

### state machine

- `AppState` に `batchImportPreview: BatchImportPreviewInfo | null` を追加
- `SYS_BATCH_IMPORT_PREVIEW` → preview を set
- `CONFIRM_BATCH_IMPORT` → preview を clear
- `CANCEL_BATCH_IMPORT` → preview を clear

### renderer

- `state.batchImportPreview` が non-null のとき preview パネルを描画
- 既存 `renderImportConfirmation()` と同様のパターン
- Continue / Cancel ボタンに `data-pkc-action` を設定

### main.ts handler

1. ファイル選択
2. `previewBatchBundleFromBuffer()` で manifest を読む（fast）
3. error → `SYS_ERROR`
4. ok → `SYS_BATCH_IMPORT_PREVIEW` を dispatch → preview 表示
5. Continue click → `importBatchBundleFromBuffer()` で full parse → entries dispatch → preview clear
6. Cancel click → `CANCEL_BATCH_IMPORT` dispatch → preview clear

---

## 10. intentionally やらなかったこと

- entry 個別のタイトル一覧表示
- import preview からの個別選択 / skip
- merge / overwrite policy
- partial success
- import 先 folder 指定
- multi-tab coordination
- folder 構造復元
- asset プレビュー
- undo / rollback

---

## 11. 次候補

- **mixed archetype batch export/import**: attachment / todo 等を含む bundle
- **entry-level preview**: 各 entry のタイトル・body を preview に表示
- **selective import**: preview から特定 entry だけを選んで import
- **folder 構造の復元**: 元の folder / relation も import で再現する
