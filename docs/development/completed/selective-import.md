# Selective Import Foundation

## 1. Goal

batch import preview パネルに entry 単位の選択 UI を追加し、
ユーザが「どの entry をインポートするか」を選べるようにする。

最小実装。wizard 化しない。

## 2. Scope

| In scope | Out of scope |
|---|---|
| entry 一覧表示 (title + archetype) | drag-and-drop 並び替え |
| checkbox による ON/OFF 切替 | entry 内容プレビュー |
| 全選択/全解除 toggle | archetype 別フィルタ |
| Continue は checked entries のみインポート | 複数ステップ wizard |
| 0 件選択時 Continue disabled | |

## 3. Data Flow

```
file → previewBatchBundleFromBuffer()
       ↓ entries[] に title/archetype を含める
       ↓ selectedIndices = 全 index (default ON)
SYS_BATCH_IMPORT_PREVIEW → reducer → state.batchImportPreview
       ↓
renderBatchImportPreview() → entry list + checkboxes
       ↓ checkbox click
TOGGLE_BATCH_IMPORT_ENTRY { index } → reducer → selectedIndices 更新
       ↓ TOGGLE_ALL_BATCH_IMPORT_ENTRIES → 全選択/全解除
       ↓ Continue click
CONFIRM_BATCH_IMPORT → main.ts handler
       ↓ state.batchImportPreview.selectedIndices で filter
importBatchBundleFromBuffer() → result.entries を selectedIndices で絞る
       ↓ N+1 dispatch (selected only)
```

## 4. Type Changes

### BatchImportPreviewInfo (core + adapter)

```typescript
export interface BatchImportPreviewEntry {
  index: number;
  title: string;
  archetype: 'text' | 'textlog';
}

export interface BatchImportPreviewInfo {
  // ... existing fields ...
  entries: BatchImportPreviewEntry[];
  selectedIndices: number[];
}
```

### UserAction (new)

```typescript
| { type: 'TOGGLE_BATCH_IMPORT_ENTRY'; index: number }
| { type: 'TOGGLE_ALL_BATCH_IMPORT_ENTRIES' }
```

## 5. Reducer Behavior

| Action | Precondition | Effect |
|---|---|---|
| `SYS_BATCH_IMPORT_PREVIEW` | — | `selectedIndices = entries.map(e => e.index)` |
| `TOGGLE_BATCH_IMPORT_ENTRY` | `batchImportPreview != null` | flip index in/out of selectedIndices |
| `TOGGLE_ALL_BATCH_IMPORT_ENTRIES` | `batchImportPreview != null` | all ON → clear; otherwise → all ON |
| `CONFIRM_BATCH_IMPORT` | `batchImportPreview != null && selectedIndices.length > 0` | clear preview |
| `CANCEL_BATCH_IMPORT` | — | clear preview |

`CONFIRM_BATCH_IMPORT` は selectedIndices.length === 0 のとき blocked。

## 6. Preview Extraction

`previewBatchBundleFromBuffer()` はマニフェストから title を読み取る。
全 3 フォーマットのマニフェストに `title` フィールドがあることを確認済み。

```typescript
entries: manifestEntries.map((me, i) => ({
  index: i,
  title: (me as { title?: string }).title ?? me.filename ?? `Entry ${i + 1}`,
  archetype: resolveArchetype(format, me)!,
})),
selectedIndices: manifestEntries.map((_, i) => i),
```

## 7. Renderer

`renderBatchImportPreview()` に entry list を追加:

- summary テーブルの下に entry list
- 各 entry: `<label>` with checkbox + title + archetype badge
- checkbox は `data-pkc-action="toggle-batch-import-entry"` + `data-pkc-entry-index="N"`
- 全選択/全解除: `data-pkc-action="toggle-all-batch-import-entries"`
- 0 件選択時 Continue ボタンは `disabled`

## 8. main.ts Handler

confirm handler で `selectedIndices` を読み取り、
`result.entries` を index で絞り込んでからの N+1 dispatch。

```typescript
const state = dispatcher.getState();
const selected = new Set(state.batchImportPreview?.selectedIndices ?? []);
// ... full parse ...
for (let i = 0; i < result.entries.length; i++) {
  if (!selected.has(i)) continue;
  // N+1 dispatch
}
```

## 9. Test Requirements

1. preview info に entries が含まれること
2. selectedIndices が初期値で全 index であること
3. TOGGLE_BATCH_IMPORT_ENTRY で index が flip すること
4. TOGGLE_ALL_BATCH_IMPORT_ENTRIES で全選択/全解除が切り替わること
5. selectedIndices が空のとき CONFIRM_BATCH_IMPORT が blocked されること
6. renderer が entry list + checkboxes を描画すること
7. checked 状態が selectedIndices と一致すること
8. Continue ボタンが 0 件選択時 disabled であること

## 10. Invariants

- preview extraction は manifest-only (nested parse しない)
- entry の body/content は preview に含めない (title + archetype のみ)
- selectedIndices の初期値は常に全件 ON
- CONFIRM 時の filtering は main.ts handler の責務 (reducer は関知しない)
- 既存の failure-atomic / always-additive は変更しない
