import type { ArchetypeId } from '../model/record';
import type { RelationKind } from '../model/relation';
import type { EntryConflict, Resolution } from '../model/merge-conflict';
import type { EditBaseSnapshot } from '../operations/dual-edit-safety';

/** Export scope: 'light' omits assets; 'full' includes everything. */
export type ExportMode = 'light' | 'full';

/** Export mutability: 'editable' allows editing; 'readonly' is view-only with rehydrate option. */
export type ExportMutability = 'editable' | 'readonly';

/**
 * UserAction: actions initiated by the user through the UI.
 *
 * These are imperative requests — "the user wants to…".
 * The reducer decides whether the action is permitted
 * based on the current AppPhase.
 *
 * Naming: VERB_NOUN, present tense imperative.
 * All type literals are string constants (minify-safe).
 */
export type UserAction =
  | { type: 'SELECT_ENTRY'; lid: string }
  | { type: 'DESELECT_ENTRY' }
  | { type: 'BEGIN_EDIT'; lid: string }
  /**
   * COMMIT_EDIT — confirm the user's in-progress edit back to the
   * container.
   *
   * FI-01 dual-edit-safety v1 (2026-04-17): the optional `base` field
   * carries the `EditBaseSnapshot` captured at `BEGIN_EDIT` so the
   * reducer can run the save-time optimistic version guard
   * (`checkSaveConflict`). When `base` is omitted, the reducer falls
   * back to `state.editingBase`, which is also populated at
   * BEGIN_EDIT. Fixtures that fabricate `phase: 'editing'` without
   * going through BEGIN_EDIT leave `editingBase` at `null`; in that
   * case the guard is skipped (legacy permissive path) — this is a
   * deliberate backward-compat decision so pre-FI-01 tests keep
   * passing while live call sites always supply a base.
   *
   * Contract: `docs/spec/dual-edit-safety-v1-behavior-contract.md` §2.3.
   */
  | { type: 'COMMIT_EDIT'; lid: string; title: string; body: string; assets?: Record<string, string>; base?: EditBaseSnapshot }
  | { type: 'CANCEL_EDIT' }
  /**
   * CREATE_ENTRY — create a new entry and (optionally) place it under
   * a structural parent folder, possibly routed through a lazily
   * created subfolder.
   *
   * Contract:
   * - Creates the entry, selects it, and moves to `editing` phase.
   * - When `parentFolder` is a valid folder lid in the current
   *   container, a structural relation (`parentFolder → new lid`) is
   *   added in the same reduction and a `RELATION_CREATED` event is
   *   emitted. Missing / unknown / non-folder ids silently fall back
   *   to root placement — the caller is expected to pre-resolve.
   * - When `ensureSubfolder` is a non-empty title AND `parentFolder`
   *   resolves to a real folder, the reducer looks for an existing
   *   child folder of `parentFolder` with exactly that title. If
   *   found, the new entry is placed inside it. If not found, a new
   *   folder with that title is created under `parentFolder` in the
   *   same reduction and the new entry is placed inside it. If
   *   `parentFolder` itself already has title === `ensureSubfolder`,
   *   the subfolder layer is skipped (no nested `TODOS/TODOS`).
   * - When `parentFolder` does not resolve (root fallback),
   *   `ensureSubfolder` is ignored — incidentals at root are still
   *   allowed to land at root, we don't auto-create root-level
   *   bucket folders.
   * - Atomic placement matters here because CREATE_ENTRY itself moves
   *   the state machine into `editing`, where follow-up
   *   CREATE_RELATION / CREATE_ENTRY would be blocked.
   */
  | { type: 'CREATE_ENTRY'; archetype: ArchetypeId; title: string; parentFolder?: string; ensureSubfolder?: string }
  | { type: 'DELETE_ENTRY'; lid: string }
  | { type: 'BEGIN_EXPORT'; mode: ExportMode; mutability: ExportMutability }
  | { type: 'CREATE_RELATION'; from: string; to: string; kind: RelationKind }
  | { type: 'DELETE_RELATION'; id: string }
  | { type: 'ACCEPT_OFFER'; offer_id: string }
  | { type: 'DISMISS_OFFER'; offer_id: string }
  | { type: 'CONFIRM_IMPORT' }
  | { type: 'CONFIRM_MERGE_IMPORT'; now: string }
  | { type: 'SET_IMPORT_MODE'; mode: 'replace' | 'merge' }
  | { type: 'CANCEL_IMPORT' }
  | { type: 'SET_MERGE_CONFLICTS'; conflicts: EntryConflict[] }
  | { type: 'SET_CONFLICT_RESOLUTION'; importedLid: string; resolution: Resolution }
  | { type: 'BULK_SET_CONFLICT_RESOLUTION'; resolution: Resolution }
  | {
      // S-18 (A-4 FULL, 2026-04-14): select an entry AND request the
      // post-render effect in main.ts to scroll to + temporarily
      // highlight the target sub-location (heading, log entry, or
      // entry-top). `ticket` is a monotonically increasing counter
      // generated at dispatch time so main.ts can tell a repeated
      // navigation (same subId) apart from a stale state snapshot.
      type: 'NAVIGATE_TO_LOCATION';
      lid: string;
      subId: string;
      ticket: number;
    }
  | { type: 'CONFIRM_BATCH_IMPORT' }
  | { type: 'CANCEL_BATCH_IMPORT' }
  | { type: 'TOGGLE_BATCH_IMPORT_ENTRY'; index: number }
  | { type: 'TOGGLE_ALL_BATCH_IMPORT_ENTRIES' }
  | { type: 'SET_BATCH_IMPORT_TARGET_FOLDER'; lid: string | null }
  | { type: 'DISMISS_BATCH_IMPORT_RESULT' }
  | { type: 'RESTORE_ENTRY'; lid: string; revision_id: string }
  /**
   * BRANCH_RESTORE_REVISION — C-1 revision-branch-restore v1 (2026-04-17).
   * Contract: `docs/spec/revision-branch-restore-v1-behavior-contract.md` §1.3.
   *
   * Creates a new entry from the given revision's snapshot and appends a
   * `provenance` relation from the source entry (`entryLid`) to the new
   * derived entry. The source entry and its revision chain are not
   * touched. Blocked when `readonly` / `viewOnlySource` / `editingLid`
   * is set, or `phase !== 'ready'` (I-Rbr7).
   *
   * Wiring into the reducer is the state slice's job; this slice only
   * registers the action shape so pure helpers and tests can refer to
   * it without triggering an unknown-action branch.
   */
  | { type: 'BRANCH_RESTORE_REVISION'; entryLid: string; revisionId: string }
  /**
   * RESOLVE_DUAL_EDIT_CONFLICT — user decision on a save that the
   * version guard rejected (FI-01 dual-edit-safety v1, 2026-04-17).
   *
   * The action is only meaningful while `state.dualEditConflict` is
   * populated. `lid` must match `state.dualEditConflict.lid`; a
   * mismatch is treated as a blocked no-op (identity preserved).
   *
   * Resolutions:
   * - `'save-as-branch'` (default safe action): creates a new entry
   *   from the user's draft via `branchFromDualEditConflict`, appends
   *   a `provenance` relation (`conversion_kind='concurrent-edit'`),
   *   clears `dualEditConflict` / `editingBase` / `editingLid`, moves
   *   to `ready` phase, and selects the new branch lid.
   * - `'discard-my-edits'`: drops the edit buffer, clears
   *   `dualEditConflict` / `editingBase` / `editingLid`, and moves
   *   to `ready` phase. The container is not mutated.
   * - `'copy-to-clipboard'`: bumps
   *   `state.dualEditConflict.copyRequestTicket` so the UI slice can
   *   observe the advance and write `draft.body` to the clipboard
   *   out-of-reducer. Overlay / conflict state are retained (user has
   *   not resolved yet).
   *
   * Contract: `docs/spec/dual-edit-safety-v1-behavior-contract.md`
   *   §5.1 / §5.4 / §5.5 / §5.6.
   */
  | { type: 'RESOLVE_DUAL_EDIT_CONFLICT'; lid: string; resolution: 'save-as-branch' | 'discard-my-edits' | 'copy-to-clipboard' }
  | { type: 'SET_SEARCH_QUERY'; query: string }
  | { type: 'SET_ARCHETYPE_FILTER'; archetype: ArchetypeId | null }
  | { type: 'CLEAR_FILTERS' }
  | { type: 'SET_TAG_FILTER'; tagLid: string | null }
  | { type: 'SET_SORT'; key: 'title' | 'created_at' | 'updated_at' | 'manual'; direction: 'asc' | 'desc' }
  /**
   * MOVE_ENTRY_UP / MOVE_ENTRY_DOWN — user-defined entry ordering
   * (C-2 v1, 2026-04-17). Contract:
   * `docs/spec/entry-ordering-v1-behavior-contract.md`.
   *
   * - Allowed only in `ready` / `editing` phase, `sortKey === 'manual'`,
   *   `viewMode === 'detail'`, no preview open, not readonly.
   * - `lid` optional: defaults to `state.selectedLid`. Missing target /
   *   edge of belonging set / gate violation → silent no-op (reducer
   *   returns the same state reference, no event emitted).
   * - `selectedLid` / `multiSelectedLids` unchanged (I-Order1,
   *   I-Order-MS). Other container fields unchanged.
   */
  | { type: 'MOVE_ENTRY_UP'; lid?: string }
  | { type: 'MOVE_ENTRY_DOWN'; lid?: string }
  /**
   * QUICK_UPDATE_ENTRY — body-only update without entering edit mode.
   *
   * Contract:
   * - Updates body ONLY; title is preserved from the existing entry.
   * - Allowed in ready phase only (blocked in editing/exporting/initializing/error).
   * - Creates a revision snapshot before applying the update.
   * - Emits ENTRY_UPDATED event.
   * - Does NOT change phase, selectedLid, or editingLid.
   *
   * Intended use: small immediate operations on presenter-rendered views
   * (e.g., todo status toggle). NOT for title changes, archetype changes,
   * or operations that warrant full editor interaction.
   */
  | { type: 'QUICK_UPDATE_ENTRY'; lid: string; body: string }
  /**
   * REHYDRATE — convert readonly artifact to editable workspace.
   *
   * Contract:
   * - Only allowed in ready phase when state.readonly is true.
   * - Creates a new container with a fresh cid (independent copy).
   * - Saves to browser storage (IDB) via persistence layer.
   * - Clears readonly flag, making the workspace fully editable.
   * - Does NOT modify the original artifact.
   */
  | { type: 'REHYDRATE' }
  | { type: 'TOGGLE_SHOW_ARCHIVED' }
  | { type: 'SET_VIEW_MODE'; mode: 'detail' | 'calendar' | 'kanban' }
  | { type: 'SET_CALENDAR_MONTH'; year: number; month: number }
  | { type: 'PURGE_TRASH' }
  /**
   * PURGE_ORPHAN_ASSETS — manual orphan asset cleanup.
   *
   * Contract:
   * - Allowed in ready phase only.
   * - Blocked when state.readonly or when container is absent.
   * - Blocked (no-op) when the orphan scan returns zero keys — callers
   *   can check `state === prevState` to detect this.
   * - Uses the pure `removeOrphanAssets` foundation; mutates ONLY
   *   `container.assets`. Entries / relations / revisions / meta are
   *   all reused by reference (see `features/asset/asset-scan.ts`).
   * - Does NOT touch `meta.updated_at` — orphan cleanup is a
   *   maintenance operation, not a user-visible content change.
   * - Does NOT change phase, selectedLid, editingLid, or viewMode.
   * - Emits `ORPHAN_ASSETS_PURGED { count }` on success.
   *
   * Foundation vs policy: this is the FIRST and only caller of the
   * orphan GC foundation. Reducer path auto-GC (on DELETE_ENTRY etc.)
   * is intentionally NOT wired — see the docs for rationale.
   */
  | { type: 'PURGE_ORPHAN_ASSETS' }
  | { type: 'TOGGLE_MULTI_SELECT'; lid: string }
  | { type: 'SELECT_RANGE'; lid: string }
  | { type: 'CLEAR_MULTI_SELECT' }
  | { type: 'BULK_DELETE' }
  | { type: 'BULK_MOVE_TO_FOLDER'; folderLid: string }
  | { type: 'BULK_MOVE_TO_ROOT' }
  | { type: 'BULK_SET_STATUS'; status: 'open' | 'done' }
  | { type: 'BULK_SET_DATE'; date: string | null }
  /**
   * TOGGLE_FOLDER_COLLAPSE — collapse or expand a sidebar folder node.
   *
   * Runtime-only UI state. Toggles the presence of `lid` in
   * `state.collapsedFolders`. Does NOT mutate the container.
   */
  | { type: 'TOGGLE_FOLDER_COLLAPSE'; lid: string }
  /**
   * PASTE_ATTACHMENT — create an attachment entry from pasted image data
   * without changing phase or editing state.
   *
   * Contract:
   * - Blocked when readonly or container is absent.
   * - Creates a new attachment entry with the given asset data.
   * - Merges the asset into container.assets.
   * - Places the attachment under an `ASSETS` subfolder of the
   *   resolved context folder (or under the context folder itself if
   *   it is already titled `ASSETS`). The context folder is
   *   `resolveAutoPlacementFolder(container, contextLid)`. If no
   *   `ASSETS` child exists under the context folder, one is created
   *   in the same reduction. When no context folder resolves
   *   (selection at root / unresolved), the attachment lands at root
   *   — no root-level `ASSETS` is auto-created. See
   *   docs/development/auto-folder-placement-for-generated-entries.md.
   * - Does NOT change phase, editingLid, or selectedLid.
   * - Emits ENTRY_CREATED; RELATION_CREATED only when a target folder
   *   is resolved.
   */
  | { type: 'PASTE_ATTACHMENT'; name: string; mime: string; size: number; assetKey: string; assetData: string; contextLid: string }
  /**
   * SET_SANDBOX_POLICY — update container-level default sandbox policy.
   *
   * Contract:
   * - Allowed in ready phase only.
   * - Blocked when readonly or container is absent.
   * - Updates container.meta.sandbox_policy.
   * - Valid values: 'strict', 'relaxed'.
   * - Invalid values are treated as 'strict'.
   * - Emits no domain event (meta-only change, no entry mutation).
   */
  | { type: 'SET_SANDBOX_POLICY'; policy: 'strict' | 'relaxed' }
  // ── P1-1: TEXTLOG → TEXT selection + TEXT → TEXTLOG modal ──────
  /**
   * BEGIN_TEXTLOG_SELECTION — enter log-selection mode for a TEXTLOG.
   *
   * Contract (P1-1, 2026-04-13):
   * - `lid` must resolve to a `textlog` archetype entry. Other
   *   archetypes are blocked.
   * - Replaces any previously-active selection (only one TEXTLOG
   *   may own selection mode at a time).
   * - Initial `selectedLogIds` is empty.
   * - Does NOT change phase / selectedLid / editingLid.
   * - Emits no DomainEvent (pure UI state).
   */
  | { type: 'BEGIN_TEXTLOG_SELECTION'; lid: string }
  /**
   * TOGGLE_TEXTLOG_LOG_SELECTION — flip a single log id in / out of
   * the active selection set.
   *
   * Contract (P1-1):
   * - No-op when `textlogSelection` is null.
   * - Duplicates ignored: membership is a set, not a list.
   */
  | { type: 'TOGGLE_TEXTLOG_LOG_SELECTION'; logId: string }
  /** CANCEL_TEXTLOG_SELECTION — exit log-selection mode (no-op when inactive). */
  | { type: 'CANCEL_TEXTLOG_SELECTION' }
  /**
   * OPEN_TEXT_TO_TEXTLOG_MODAL — open the TEXT → TEXTLOG preview modal
   * for a given TEXT source entry.
   *
   * Contract (P1-1):
   * - Blocked when readonly.
   * - `sourceLid` must resolve to a `text` archetype entry.
   * - Default `splitMode` is 'heading' when omitted.
   * - Opening while a modal is already present replaces it (only one
   *   preview modal at a time).
   */
  | { type: 'OPEN_TEXT_TO_TEXTLOG_MODAL'; sourceLid: string; splitMode?: 'heading' | 'hr' }
  /** SET_TEXT_TO_TEXTLOG_SPLIT_MODE — update split mode; no-op when modal closed. */
  | { type: 'SET_TEXT_TO_TEXTLOG_SPLIT_MODE'; splitMode: 'heading' | 'hr' }
  /** CLOSE_TEXT_TO_TEXTLOG_MODAL — close the modal (no-op when closed). */
  | { type: 'CLOSE_TEXT_TO_TEXTLOG_MODAL' };

/** Extract the type literal from a UserAction. */
export type UserActionType = UserAction['type'];
