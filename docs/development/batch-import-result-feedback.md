# Batch Import Result Feedback

Status: spec-complete (rev 2)
Parent: `batch-import-target-folder-selection.md`

## §1 User-Visible Completion Contract

After batch import completes, the user must be able to tell:

| Field | Example |
|-------|---------|
| Imported entry count | "3 entries" |
| Attachment count | "2 attachments" |
| Restore vs flat | "folder structure restored" / "flat import" |
| Actual destination | "/ (Root)" or folder title |
| Intended destination (on fallback) | "📁 Project Alpha" |
| Fallback occurred | "selected destination 📁 Project Alpha was unavailable" |

## §2 Actual vs Intended Destination

Two destination concepts exist:

- **Actual destination** (`actualDestination`): where entries were actually placed.
  Always set. Either `"/ (Root)"` or the folder title.
- **Intended destination** (`intendedDestination`): the folder the user selected
  in the preview picker, if a fallback to root occurred. Only set when
  `fallbackToRoot` is true. `null` otherwise.

When `fallbackToRoot` is true, both `actualDestination` (always `"/ (Root)"`)
and `intendedDestination` (the originally selected folder title) are available
for the result message.

## §3 Terminology

| Situation | Message pattern |
|-----------|----------------|
| Root + flat | "N entries imported to / (Root) — flat import" |
| Root + restore | "N entries imported to / (Root) — folder structure restored (M folders)" |
| Folder + flat | "N entries imported to 📁 \<title\> — flat import" |
| Folder + restore | "N entries imported to 📁 \<title\> — folder structure restored (M folders)" |
| Fallback | "... — selected destination 📁 \<intended\> was unavailable" |
| With attachments | "N entries (K attachments) imported to ..." |

The restore/flat distinction is always stated explicitly.

## §4 Data Model

### BatchImportResultSummary (system-command.ts)

```typescript
export interface BatchImportResultSummary {
  entryCount: number;
  attachmentCount: number;
  folderCount: number;
  restoreStructure: boolean;
  /** Actual destination used: "/ (Root)" or folder title. */
  actualDestination: string;
  /** Intended destination if fallback occurred: folder title. null if no fallback. */
  intendedDestination: string | null;
  /** True when the user chose a target folder but it was unavailable at apply time. */
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
- Restore/flat mode is always explicitly stated.
- When `fallbackToRoot` is true, the message names the `intendedDestination`.

## §7 Empty Plan Behavior

An empty plan (zero entries, zero folders) still emits `BATCH_IMPORT_APPLIED`
with a zero-count summary and stores `batchImportResult`. This is intentional:
the user initiated the import action and deserves feedback even if the result
was trivially empty. The banner renders normally with "0 entries imported".

## §8 Constraints

1. No new dialogs or modals.
2. Result banner is purely informational — dismissible, not blocking.
3. Reducer remains side-effect free.
4. Result summary computation happens inside the reducer using data already available.

## §9 Non-Goals

- Import history / log viewer
- Undo UI
- Merge/overwrite policy
- Picker tree indentation
