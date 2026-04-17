# 7. State interaction

## 7.1 AppState 拡張

```ts
interface AppState {
  // ... existing fields ...
  mergeConflictResolutions?: Record<string, Resolution>;
}
```

- optional field。既存 AppState literal を使う test fixture は無変更で通る
- `Resolution = 'keep-current' | 'duplicate-as-branch' | 'skip'`
- key は imported entry の lid

## 7.2 lifecycle

| trigger | mergeConflictResolutions の状態 |
|---------|-------------------------------|
| `SYS_IMPORT_PREVIEW`（mode='merge'） | `{}` で初期化 |
| `SET_CONFLICT_RESOLUTION` | 該当 key を更新 |
| `BULK_SET_CONFLICT_RESOLUTION` | 全 conflict の key を一括更新 |
| `CANCEL_IMPORT` | `undefined` に reset |
| `CONFIRM_MERGE_IMPORT` | `undefined` に reset（merge 完了後） |
| 新しい `SYS_IMPORT_PREVIEW` | `{}` に reset（re-preview） |
| `SET_IMPORT_MODE { mode: 'replace' }` | `undefined` に reset |

## 7.3 新規 action

### SET_CONFLICT_RESOLUTION

```ts
{
  type: 'SET_CONFLICT_RESOLUTION',
  importedLid: string,
  resolution: Resolution,
}
```

reducer: `state.mergeConflictResolutions[action.importedLid] = action.resolution`

### BULK_SET_CONFLICT_RESOLUTION

```ts
{
  type: 'BULK_SET_CONFLICT_RESOLUTION',
  resolution: Resolution,
}
```

reducer: 全 conflict の imported_lid に対して `resolution` を設定。ただし `resolution === 'keep-current'` の場合、`title-only-multi` の conflict は skip する（I-MergeUI7: keep-current disabled）。

## 7.4 CONTAINER_MERGED event 拡張

```ts
{
  type: 'CONTAINER_MERGED',
  container_id: string,
  source: string,
  added_entries: number,
  added_assets: number,
  added_relations: number,
  suppressed_by_keep_current: string[],
  suppressed_by_skip: string[],
}
```

`suppressed_by_keep_current` と `suppressed_by_skip` は新規 field。conflict UI を経由しない merge（conflict 0 件）では両配列とも空。

## 7.5 reducer 非依存の原則

- conflict 検出（`detectEntryConflicts`）は reducer 外で実行される pure helper
- reducer が conflict 検出を行うことはない
- reducer は `mergeConflictResolutions` の CRUD と、`CONFIRM_MERGE_IMPORT` 時の `applyConflictResolutions` 適用のみを担当する
