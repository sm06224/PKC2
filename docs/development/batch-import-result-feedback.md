# Batch Import Result Feedback

Status: spec-complete
Parent: `batch-import-target-folder-selection.md`

## §1 User-Visible Completion Contract

After batch import completes, the user must be able to tell:

| Field | Example |
|-------|---------|
| Imported entry count | "3 entries" |
| Attachment count | "2 attachments" |
| Restore vs flat | "folder structure restored" / "flat import" |
| Destination | "/ (Root)" or folder title |
| Fallback occurred | "selected destination was unavailable" |

## §2 Target Folder Fallback Visibility

If the user selected a target folder in preview, but apply had to fall back
to root because the target was missing or invalid:

- The result message MUST explicitly state that fallback occurred.
- The message should name the original intended destination.
- No silent fallback in user-visible messaging.

## §3 Terminology

| Situation | Message pattern |
|-----------|----------------|
| Root import | "N entries imported to / (Root)" |
| Folder import | "N entries imported to 📁 <title>" |
| Root + restore | "N entries imported to / (Root) — folder structure restored (M folders)" |
| Folder + restore | "N entries imported to 📁 <title> — folder structure restored (M folders)" |
| Target missing fallback | "N entries imported to / (Root) — selected destination was unavailable" |
| Flat + attachments | "N entries (K attachments) imported to ..." |

## §4 Data Model

### BatchImportResultSummary (new type in system-command.ts)

```typescript
export interface BatchImportResultSummary {
  entryCount: number;
  attachmentCount: number;
  folderCount: number;
  restoreStructure: boolean;
  destination: string;       // "/ (Root)" or folder title
  fallbackToRoot: boolean;
  source: string;
}
```

### AppState extension

```typescript
batchImportResult: BatchImportResultSummary | null;
```

Set by `SYS_APPLY_BATCH_IMPORT` reducer. Cleared by `DISMISS_BATCH_IMPORT_RESULT` action.

### DomainEvent extension

```typescript
| { type: 'BATCH_IMPORT_APPLIED'; summary: BatchImportResultSummary }
```

### UserAction extension

```typescript
| { type: 'DISMISS_BATCH_IMPORT_RESULT' }
```

## §5 Operation Sequence

1. User selects entries and target folder in preview.
2. User clicks Continue.
3. Planner produces plan with `targetFolderLid`.
4. Reducer applies plan atomically.
5. Reducer computes result summary (entry count, fallback status, etc.).
6. Reducer stores summary in `state.batchImportResult`.
7. Reducer emits `BATCH_IMPORT_APPLIED` event with summary.
8. Renderer displays result banner.
9. User dismisses banner (click) or it auto-clears on next import preview.

## §6 Renderer Behavior

- When `state.batchImportResult` is set, show a result banner in the main area.
- Banner uses `data-pkc-region="batch-import-result"`.
- Banner includes a dismiss button with `data-pkc-action="dismiss-batch-import-result"`.
- Banner text follows §3 terminology.

## §7 Constraints

1. No new dialogs or modals.
2. Result banner is purely informational — dismissible, not blocking.
3. Reducer remains side-effect free.
4. Result summary computation happens inside the reducer using data already available.

## §8 Non-Goals

- Import history / log viewer
- Undo UI
- Merge/overwrite policy
- Picker tree indentation
