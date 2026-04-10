# Batch Import Target Folder Selection

Status: spec-complete
Parent: `batch-import-transaction-hardening.md`

## §1 User Goal

The user can import a batch bundle not only at the workspace root level, but
also under a chosen **existing folder** in the current container.

This extends the existing batch import flow without changing its
failure-atomic, always-additive guarantees.

## §2 Target Folder Modes

| Mode | `targetFolderLid` value | Behavior |
|------|------------------------|----------|
| Root import | `null` | Current behavior. Top-level imported items are placed at root. |
| Folder import | existing folder LID | Top-level imported items become children of the chosen folder. |

"Top-level" means:
- **Restore import**: folders whose `parentOriginalLid` is `null` (root-level folders in the bundle) and content entries whose `parentFolderOriginalLid` is `undefined` (unparented content).
- **Flat import**: all content entries.

## §3 Structural Behavior

### Restore import under target folder

- All imported top-level folders get a structural relation: `from=targetFolder, to=newFolder`.
- All imported content entries without a parent folder get a structural relation: `from=targetFolder, to=newEntry`.
- Nested imported folders maintain their internal parent→child relations unchanged.
- No merge by folder title. No overwrite. Always-additive only.

### Flat import under target folder

- All content entries get a structural relation: `from=targetFolder, to=newEntry`.
- No folders are created.

### Root import (existing behavior)

- Unchanged from current implementation. No additional structural relations for root-level items.

## §4 Preview Behavior

The batch import preview panel shows:
- **Destination**: "/ (Root)" or the chosen folder title.
- A dropdown/select element listing all existing folders in the container, plus "/ (Root)".
- Changing the target does NOT affect selection-aware classification (folder restore availability is independent of destination).

## §5 Operation Sequence

1. Open batch import preview (select file).
2. Choose destination folder (default: root).
3. Toggle entry selection as desired.
4. Click Continue.
5. Planner receives `targetFolderLid` and includes it in the plan.
6. Reducer applies plan: creates structural relations from target folder to imported top-level items.

## §6 Data Flow

### BatchImportPreviewInfo
Add:
```typescript
targetFolderLid?: string | null;
```

### UserAction
Add:
```typescript
| { type: 'SET_BATCH_IMPORT_TARGET_FOLDER'; lid: string | null }
```

### BatchImportPlan
Add:
```typescript
targetFolderLid?: string | null;
```

### PlannerInput
Add:
```typescript
targetFolderLid?: string | null;
```

## §7 Constraints

1. Target folder must be an existing `folder` archetype entry in the current container.
2. If the chosen target folder does not exist in the container at confirm/apply time, the apply reducer **ignores the target** silently and imports at root. This is the safest fallback — content is preserved, no error thrown, and the user sees the import succeed at root level. This matches the conservative fallback pattern used for malformed folder metadata.
3. Readonly and null container are blocked as before.

## §8 Planner Changes

`buildBatchImportPlan()` passes through `targetFolderLid` into the plan.
The planner itself does not validate target existence — that is the reducer's responsibility (it has access to the live container).

## §9 Reducer Changes (SYS_APPLY_BATCH_IMPORT)

After creating all folders and content entries:
- If `plan.targetFolderLid` is set:
  - Verify the LID exists in the container as a folder entry.
  - For each top-level imported folder (parentOriginalLid === null): create structural relation `from=target, to=newFolder`.
  - For each content entry without a parent folder: create structural relation `from=target, to=newEntry`.
- If the target folder LID does not exist in the (updated) container, skip silently (root fallback).

## §10 Non-Goals

- Merge / overwrite policy
- Drag & drop targeting
- Undo UI
- DRY refactor of export/import builders
- Folder title-based deduplication
- Import conflict resolution
