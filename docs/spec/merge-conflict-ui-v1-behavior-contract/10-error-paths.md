# 10. Error paths

## 10.1 schema mismatch

- 既存の preview gate で reject される（I-MergeUI8）
- conflict UI は mount されない
- 追加対応不要

## 10.2 conflict 0 件

- `detectEntryConflicts` が空配列を返す
- conflict UI セクションを mount しない
- MVP 5 行サマリのみ表示
- `Confirm merge` button は既存 gate のみで enable/disable 判定

## 10.3 re-preview（新しい SYS_IMPORT_PREVIEW）

- `mergeConflictResolutions` を `{}` に reset（I-MergeUI5）
- 新しい `EntryConflict[]` で conflict UI を再描画
- 前回の選択は保持しない（imported container が変わった可能性があるため）

## 10.4 CANCEL_IMPORT

- `mergeConflictResolutions` を `undefined` に clear（I-MergeUI5）
- conflict UI を unmount
- 次回 preview で空から再開

## 10.5 host container null

- 既存 reducer guard が block する
- conflict UI の mount trigger が発火しない
- 追加対応不要
