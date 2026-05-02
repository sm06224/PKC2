# Merge Conflict UI v1 — Reducer/State Slice 実装メモ

Created: 2026-04-17
Commit: 1b3dc40

## 変更ファイル

| ファイル | 変更内容 |
|---------|---------|
| `src/core/model/merge-conflict.ts` | **新規** — ConflictKind, Resolution, EntryConflict 型（core 配置） |
| `src/core/model/relation.ts` | `'provenance'` を RelationKind に追加、optional `metadata` field 追加 |
| `src/core/action/user-action.ts` | 3 新 action 追加 |
| `src/core/action/domain-event.ts` | CONTAINER_MERGED に `suppressed_by_*` 配列追加 |
| `src/features/import/conflict-detect.ts` | 型を core から re-export に変更 |
| `src/adapter/state/app-state.ts` | state field 2 つ + reducer case 3 つ + CONFIRM 改修 + lifecycle reset |
| `tests/adapter/merge-conflict-state.test.ts` | **新規** — 13 テスト |

## 設計判断

1. **型を core に配置**: `EntryConflict` / `Resolution` は domain model 型。user-action.ts（core 層）から参照するため core/model に配置。features 層は re-export で互換維持
2. **SET_MERGE_CONFLICTS action**: contract にはない追加。UI 層が `detectEntryConflicts`（pure helper）を呼び、結果を reducer に渡す経路として必要。reducer は検出を行わない原則を維持
3. **imported.entries フィルタリング**: `applyMergePlan` の `?? entry.lid` fallback 問題を回避。`crResult.plan.lidRemap.has(e.lid)` でフィルタリング
4. **provenance relation**: `Relation` に `'provenance'` kind + `metadata?` を additive 追加。`generateLid()` で id を mint

## Invariant 保証

| invariant | 保証方法 |
|-----------|---------|
| I-MergeUI1 | host entries は applyMergePlan で不変。テスト #8 で検証 |
| I-MergeUI2 | keep-current / skip とも lidRemap.delete で除外。テスト #4, #5 |
| I-MergeUI3 | SET_MERGE_CONFLICTS で C1 に keep-current default 設定。テスト #1 |
| I-MergeUI4 | provenance from=imported(newLid), to=host。テスト #6 |
| I-MergeUI5 | cancel / re-preview / mode-switch で state reset。テスト #9, #10, #11 |
| I-MergeUI7 | BULK keep-current は title-only-multi を skip。テスト #12 |

## 次 slice

UI slice（renderer + action-binder）
