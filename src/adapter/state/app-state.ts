import type { Container } from '../../core/model/container';
import type { ArchetypeId } from '../../core/model/record';
import type { ExportMode, ExportMutability } from '../../core/action/user-action';
import type { Dispatchable } from '../../core/action';
import type { DomainEvent } from '../../core/action/domain-event';
import type { ImportPreviewRef, BatchImportPreviewInfo, BatchImportResultSummary } from '../../core/action/system-command';
import type { PendingOffer } from '../transport/record-offer-handler';
import type { SortKey, SortDirection } from '../../features/search/sort';
import { classifyFolderRestore } from '../../features/batch-import/import-planner';
import {
  addEntry,
  updateEntry,
  removeEntry,
  nextSelectedAfterRemove,
  addRelation,
  removeRelation,
  snapshotEntry,
  restoreEntry,
  restoreDeletedEntry,
  mergeAssets,
  purgeTrash,
} from '../../core/operations/container-ops';
import { removeOrphanAssets } from '../../features/asset/asset-scan';
import { planMergeImport, applyMergePlan } from '../../features/import/merge-planner';
import { applyConflictResolutions } from '../../features/import/conflict-detect';
import type { EntryConflict, Resolution } from '../../core/model/merge-conflict';
import type { ProvenanceRelationData } from '../../features/import/conflict-detect';
import { parseTodoBody, serializeTodoBody } from '../../features/todo/todo-body';
import { getAncestorFolderLids } from '../../features/relation/tree';
import { resolveAutoPlacementFolder, findSubfolder } from '../../features/relation/auto-placement';

/**
 * AppPhase: explicit state machine to prevent operation-order bugs.
 * Each phase defines which Dispatchable actions are permitted.
 */
export type AppPhase =
  | 'initializing'
  | 'ready'
  | 'editing'
  | 'exporting'
  | 'error';

/**
 * AppState: runtime-only UI state.
 *
 * `container` is a reference to the persistent domain model,
 * but selection/phase/error are purely runtime concerns.
 */
export interface AppState {
  phase: AppPhase;
  container: Container | null;
  selectedLid: string | null;
  editingLid: string | null;
  error: string | null;
  /** True when running inside an iframe. Set once at init. */
  embedded: boolean;
  /** Pending record offers (runtime-only, not persisted). */
  pendingOffers: PendingOffer[];
  /** Import preview awaiting user confirmation (runtime-only). */
  importPreview: ImportPreviewRef | null;
  /**
   * Import mode for the pending preview (Tier 3-1, merge import).
   * - 'replace' (default when absent): CONFIRM_IMPORT will fully
   *   replace the container.
   * - 'merge': CONFIRM_MERGE_IMPORT will overlay imported onto host.
   * Meaningful only while `importPreview !== null`; reset to 'replace'
   * when preview is cleared. Optional so test fixtures that predate
   * Tier 3-1 keep compiling; read sites treat undefined as 'replace'.
   * See docs/spec/merge-import-conflict-resolution.md.
   */
  importMode?: 'replace' | 'merge';
  mergeConflicts?: EntryConflict[];
  mergeConflictResolutions?: Record<string, Resolution>;
  /**
   * Pending sub-location navigation (S-18 / A-4 FULL, 2026-04-14).
   *
   * Set by `NAVIGATE_TO_LOCATION`. The post-render effect in
   * `main.ts` reads this after every render, compares `ticket`
   * against the last-seen value, and — if new — resolves the
   * `subId` to a DOM element, scrolls it into view, and temporarily
   * flashes `pkc-location-highlight`. The state field is NOT
   * cleared by the reducer; the effect is idempotent because it
   * only fires on ticket advances.
   *
   * Optional so existing AppState literal fixtures keep compiling
   * (same pattern as `importMode`). Read sites treat undefined as
   * "no pending navigation".
   *
   * See docs/development/search-ux-partial-reach.md.
   */
  pendingNav?: { subId: string; ticket: number } | null;
  /** Batch import preview awaiting user confirmation (runtime-only). */
  batchImportPreview: BatchImportPreviewInfo | null;
  /** Batch import result summary for UI feedback (runtime-only, transient). */
  batchImportResult: BatchImportResultSummary | null;
  /** Current search/filter query (runtime-only, feature layer). */
  searchQuery: string;
  /** Current archetype filter (runtime-only, feature layer). null = show all. */
  archetypeFilter: ArchetypeId | null;
  /** Current tag filter: lid of tag entry to filter by (runtime-only). null = no tag filter. */
  tagFilter: string | null;
  /** Current sort key (runtime-only, feature layer). */
  sortKey: SortKey;
  /** Current sort direction (runtime-only, feature layer). */
  sortDirection: SortDirection;
  /** Export mode for the current export operation (runtime-only). */
  exportMode: ExportMode | null;
  /** Export mutability for the current export operation (runtime-only). */
  exportMutability: ExportMutability | null;
  /** True when running as a readonly artifact. Suppresses edit UI. */
  readonly: boolean;
  /** True when container was loaded from a Light export (no assets). Suppresses IDB save. */
  lightSource: boolean;
  /**
   * True when container was booted from embedded pkc-data (exported
   * HTML). Suppresses IDB save: opening an HTML must not contaminate
   * the receiver's IndexedDB. Cleared by explicit Import operations
   * (CONFIRM_IMPORT / SYS_IMPORT_COMPLETE / CONFIRM_MERGE_IMPORT) so
   * that post-import edits persist normally. See
   * `docs/development/boot-container-source-policy-revision.md`.
   *
   * Optional in the TS surface so existing test fixtures that spell
   * out AppState by hand remain valid without updates. Reducer paths
   * always initialize to `false` via `createInitialState()`.
   */
  viewOnlySource?: boolean;
  /** Show archived todos in sidebar. Runtime-only, not persisted. Default off. */
  showArchived: boolean;
  /** Current center pane view mode. Runtime-only. */
  viewMode: 'detail' | 'calendar' | 'kanban';
  /** Calendar navigation: year. Runtime-only. */
  calendarYear: number;
  /** Calendar navigation: month (1-12). Runtime-only. */
  calendarMonth: number;
  /** Multi-selection: additional selected entry lids (Ctrl/Shift+click). Runtime-only. */
  multiSelectedLids: string[];
  /**
   * Sidebar folder collapse state: lids of folders that are collapsed.
   * Folders default to expanded. Runtime-only, not persisted.
   */
  collapsedFolders: string[];
  /**
   * TEXTLOG → TEXT log-selection mode (Slice 4 / P1-1). Runtime-only.
   *
   * `null` (or absent) when no selection is active. The presence of
   * this object is what the viewer uses to decide whether to render
   * the selection toolbar + per-log checkboxes. See
   * `docs/development/textlog-text-conversion.md` §2 and the §6.x
   * clear-semantics contract added in P1-1 (2026-04-13).
   *
   * Optional in the TS surface so existing test fixtures that spell
   * out AppState by hand remain valid without updates. Reducer paths
   * always initialize to `null` via `createInitialState()`.
   */
  textlogSelection?: TextlogSelectionState | null;
  /**
   * TEXT → TEXTLOG preview modal state (Slice 5 / P1-1). Runtime-only.
   *
   * `null` (or absent) when the modal is closed. The renderer mounts
   * / unmounts the modal DOM by observing this field. The user-edited
   * title is kept in the DOM input during the preview session (not
   * mirrored here) to keep keystrokes out of the dispatch loop.
   */
  textToTextlogModal?: TextToTextlogModalState | null;
}

/**
 * Log-selection state for the TEXTLOG → TEXT conversion flow.
 *
 * `selectedLogIds` is a plain array (not Set) so the whole AppState
 * remains serializable — matching every other runtime field that is
 * expected to survive a `dispatcher.getState()` snapshot. Duplicates
 * are not allowed; the reducer dedupes on TOGGLE.
 */
export interface TextlogSelectionState {
  activeLid: string;
  selectedLogIds: string[];
}

/**
 * TEXT → TEXTLOG preview modal identity. `splitMode` is the only
 * input that can be changed while the modal is open; the preview body
 * itself is recomputed on demand from (source entry × splitMode).
 */
export interface TextToTextlogModalState {
  sourceLid: string;
  splitMode: 'heading' | 'hr';
}

/**
 * ReduceResult: state transition + emitted domain events.
 * Events are side-effects of a successful transition.
 */
export interface ReduceResult {
  state: AppState;
  events: DomainEvent[];
}

export function createInitialState(): AppState {
  return {
    phase: 'initializing',
    container: null,
    selectedLid: null,
    editingLid: null,
    error: null,
    embedded: false,
    pendingOffers: [],
    importPreview: null,
    importMode: 'replace',
    pendingNav: null,
    batchImportPreview: null,
    batchImportResult: null,
    searchQuery: '',
    archetypeFilter: null,
    tagFilter: null,
    sortKey: 'title',
    sortDirection: 'asc',
    exportMode: null,
    exportMutability: null,
    readonly: false,
    lightSource: false,
    viewOnlySource: false,
    showArchived: false,
    viewMode: 'detail',
    calendarYear: new Date().getFullYear(),
    calendarMonth: new Date().getMonth() + 1,
    multiSelectedLids: [],
    collapsedFolders: [],
    textlogSelection: null,
    textToTextlogModal: null,
  };
}

/** Get all selected lids (primary + multi). */
export function getAllSelected(state: AppState): string[] {
  const set = new Set(state.multiSelectedLids);
  if (state.selectedLid) set.add(state.selectedLid);
  return Array.from(set);
}

/**
 * Recompute folder restore classification when selection changes.
 * Pure helper — returns updated preview info with new selectedIndices + classification.
 */
function reclassifyPreview(
  preview: BatchImportPreviewInfo,
  selectedIndices: number[],
): BatchImportPreviewInfo {
  if (!preview.folderMetadata || !preview.entryFolderRefs) {
    return { ...preview, selectedIndices };
  }
  const entryRefs = preview.entryFolderRefs.map((ref) => ({ parentFolderLid: ref }));
  const classification = classifyFolderRestore(preview.folderMetadata, entryRefs, selectedIndices);
  return {
    ...preview,
    selectedIndices,
    canRestoreFolderStructure: classification.canRestoreFolderStructure,
    folderCount: classification.folderCount,
    malformedFolderMetadata: classification.malformedFolderMetadata,
    folderGraphWarning: classification.folderGraphWarning,
  };
}

/**
 * Pure reducer: (state, action) → (state', events[]).
 *
 * Phase-first switch ensures operation-order safety.
 * Unhandled actions in a phase return the same state with no events,
 * plus a console.warn in development.
 */
export function reduce(state: AppState, action: Dispatchable): ReduceResult {
  switch (state.phase) {
    case 'initializing':
      return reduceInitializing(state, action);
    case 'ready':
      return reduceReady(state, action);
    case 'editing':
      return reduceEditing(state, action);
    case 'exporting':
      return reduceExporting(state, action);
    case 'error':
      return reduceError(state, action);
  }
}

function blocked(state: AppState, action: Dispatchable): ReduceResult {
  console.warn(`[PKC2] Action "${action.type}" blocked in phase "${state.phase}"`);
  return { state, events: [] };
}

function now(): string {
  return new Date().toISOString();
}

function reduceInitializing(state: AppState, action: Dispatchable): ReduceResult {
  switch (action.type) {
    case 'SYS_INIT_COMPLETE': {
      const next: AppState = {
        ...state,
        phase: 'ready',
        container: action.container,
        embedded: action.embedded ?? false,
        readonly: action.readonly ?? false,
        lightSource: action.lightSource ?? false,
        viewOnlySource: action.viewOnlySource ?? false,
        error: null,
      };
      const cid = action.container?.meta?.container_id ?? 'unknown';
      return { state: next, events: [{ type: 'CONTAINER_LOADED', container_id: cid }] };
    }
    case 'SYS_INIT_ERROR': {
      const next: AppState = { ...state, phase: 'error', error: action.error };
      return { state: next, events: [{ type: 'ERROR_OCCURRED', error: action.error }] };
    }
    default:
      return blocked(state, action);
  }
}

function reduceReady(state: AppState, action: Dispatchable): ReduceResult {
  switch (action.type) {
    case 'SELECT_ENTRY': {
      // Auto-expand ancestor folders so the newly selected entry is
      // actually visible in the tree. This closes the "selected but
      // hidden under a collapsed folder" gap for Storage Profile /
      // entry-ref / calendar / kanban jumps. Pure read against the
      // container — no mutation, no new action type, and no-op when
      // no ancestors are collapsed (state.collapsedFolders reference
      // is preserved for downstream `===` checks).
      let collapsedFolders = state.collapsedFolders;
      if (state.container && state.collapsedFolders.length > 0) {
        const ancestorFolders = getAncestorFolderLids(
          state.container.relations,
          state.container.entries,
          action.lid,
        );
        if (ancestorFolders.length > 0) {
          const ancestorSet = new Set(ancestorFolders);
          const filtered = state.collapsedFolders.filter((l) => !ancestorSet.has(l));
          if (filtered.length !== state.collapsedFolders.length) {
            collapsedFolders = filtered;
          }
        }
      }
      // P1-1: automatic cleanup for transient UI state that is scoped
      // to a specific entry. Preserving them across a selection change
      // was the root of several "stale singleton" UX bugs (the
      // previously-selected TEXTLOG's log selection would keep showing
      // its check state after the user navigated away). See
      // `docs/development/textlog-text-conversion.md` §P1-1 clear-rules.
      const textlogSelection = (state.textlogSelection && state.textlogSelection.activeLid !== action.lid)
        ? null
        : state.textlogSelection;
      const textToTextlogModal = (state.textToTextlogModal && state.textToTextlogModal.sourceLid !== action.lid)
        ? null
        : state.textToTextlogModal;
      const next: AppState = {
        ...state,
        selectedLid: action.lid,
        multiSelectedLids: [],
        collapsedFolders,
        textlogSelection,
        textToTextlogModal,
      };
      return { state: next, events: [{ type: 'ENTRY_SELECTED', lid: action.lid }] };
    }
    case 'NAVIGATE_TO_LOCATION': {
      // S-18 (A-4 FULL): same selection semantics as SELECT_ENTRY
      // (auto-expand ancestors, clear per-entry transient UI when
      // the selection target changes), PLUS record a post-render
      // hint so main.ts can scroll to the sub-location and flash
      // the highlight. `ticket` is caller-supplied and monotonic.
      if (state.phase !== 'ready') return blocked(state, action);
      if (!state.container) return blocked(state, action);
      let collapsedFolders = state.collapsedFolders;
      if (state.collapsedFolders.length > 0) {
        const ancestorFolders = getAncestorFolderLids(
          state.container.relations,
          state.container.entries,
          action.lid,
        );
        if (ancestorFolders.length > 0) {
          const ancestorSet = new Set(ancestorFolders);
          const filtered = state.collapsedFolders.filter((l) => !ancestorSet.has(l));
          if (filtered.length !== state.collapsedFolders.length) {
            collapsedFolders = filtered;
          }
        }
      }
      const textlogSelection = (state.textlogSelection && state.textlogSelection.activeLid !== action.lid)
        ? null
        : state.textlogSelection;
      const textToTextlogModal = (state.textToTextlogModal && state.textToTextlogModal.sourceLid !== action.lid)
        ? null
        : state.textToTextlogModal;
      const next: AppState = {
        ...state,
        selectedLid: action.lid,
        multiSelectedLids: [],
        collapsedFolders,
        textlogSelection,
        textToTextlogModal,
        pendingNav: { subId: action.subId, ticket: action.ticket },
      };
      return {
        state: next,
        events: [{ type: 'ENTRY_SELECTED', lid: action.lid }],
      };
    }
    case 'DESELECT_ENTRY': {
      // P1-1: deselection tears down per-entry transient UI state too.
      const next: AppState = {
        ...state,
        selectedLid: null,
        textlogSelection: null,
        textToTextlogModal: null,
      };
      return { state: next, events: [{ type: 'ENTRY_DESELECTED' }] };
    }
    case 'BEGIN_EDIT': {
      if (state.readonly) return blocked(state, action);
      // P1-1: BEGIN_EDIT terminates any in-progress transient UI flows
      // (log selection / preview modal). The user is switching to the
      // structured editor; carrying over a TEXTLOG selection toolbar
      // or a dangling preview modal is incoherent.
      const next: AppState = {
        ...state,
        phase: 'editing',
        selectedLid: action.lid,
        editingLid: action.lid,
        viewMode: 'detail',
        textlogSelection: null,
        textToTextlogModal: null,
      };
      return { state: next, events: [{ type: 'EDIT_BEGUN', lid: action.lid }] };
    }
    case 'CREATE_ENTRY': {
      if (state.readonly) return blocked(state, action);
      if (!state.container) return blocked(state, action);
      const ts = now();
      let container = state.container;
      const events: DomainEvent[] = [];

      // Atomic placement. CREATE_ENTRY transitions into `editing`,
      // after which CREATE_RELATION / CREATE_ENTRY are blocked — so
      // any structural parent (and any lazy-created subfolder) must be
      // wired here. A missing / unknown / non-folder `parentFolder`
      // silently falls back to root; `ensureSubfolder` is ignored in
      // that case (we don't auto-create root-level bucket folders).
      let placementParentLid: string | null = null;
      if (action.parentFolder) {
        const parent = container.entries.find((e) => e.lid === action.parentFolder);
        if (parent && parent.archetype === 'folder') {
          placementParentLid = parent.lid;
          // Lazy subfolder resolution: reuse an existing child folder
          // with the target title if present, otherwise create one in
          // the same reduction. Skip the layer entirely when the
          // context folder already carries the target title — avoids
          // nesting like `TODOS/TODOS`.
          const sub = action.ensureSubfolder;
          if (sub && sub.length > 0 && parent.title !== sub) {
            const existing = findSubfolder(container, parent.lid, sub);
            if (existing) {
              placementParentLid = existing;
            } else {
              const subLid = generateLid();
              container = addEntry(container, subLid, 'folder', sub, ts);
              events.push({ type: 'ENTRY_CREATED', lid: subLid, archetype: 'folder' });
              const subRelId = generateLid();
              container = addRelation(container, subRelId, parent.lid, subLid, 'structural', ts);
              events.push({
                type: 'RELATION_CREATED', id: subRelId,
                from: parent.lid, to: subLid, kind: 'structural',
              });
              placementParentLid = subLid;
            }
          }
        }
      }

      const lid = generateLid();
      container = addEntry(container, lid, action.archetype, action.title, ts);
      events.push({ type: 'ENTRY_CREATED', lid, archetype: action.archetype });

      if (placementParentLid) {
        const relId = generateLid();
        container = addRelation(container, relId, placementParentLid, lid, 'structural', ts);
        events.push({
          type: 'RELATION_CREATED', id: relId,
          from: placementParentLid, to: lid, kind: 'structural',
        });
      }

      events.push({ type: 'EDIT_BEGUN', lid });
      const next: AppState = {
        ...state,
        container,
        selectedLid: lid,
        phase: 'editing',
        editingLid: lid,
        viewMode: 'detail',
      };
      return { state: next, events };
    }
    case 'DELETE_ENTRY': {
      if (state.readonly) return blocked(state, action);
      if (!state.container) return blocked(state, action);
      const ts = now();
      const entriesBefore = state.container.entries;
      // Snapshot the entry before deletion (preserves last state for restore)
      const revId = generateLid();
      const snapshotted = snapshotEntry(state.container, action.lid, revId, ts);
      const container = removeEntry(snapshotted, action.lid);
      const selectedLid = nextSelectedAfterRemove(
        entriesBefore, action.lid, state.selectedLid,
      );
      // P1-1: if the deleted entry was the owner of a transient UI
      // flow, tear it down. A selection toolbar anchored to a now-
      // nonexistent lid would render against stale data.
      const textlogSelection = state.textlogSelection && state.textlogSelection.activeLid === action.lid
        ? null
        : state.textlogSelection;
      const textToTextlogModal = state.textToTextlogModal && state.textToTextlogModal.sourceLid === action.lid
        ? null
        : state.textToTextlogModal;
      const next: AppState = { ...state, container, selectedLid, textlogSelection, textToTextlogModal };
      return { state: next, events: [{ type: 'ENTRY_DELETED', lid: action.lid }] };
    }
    case 'BEGIN_EXPORT': {
      if (state.readonly) return blocked(state, action);
      const next: AppState = {
        ...state, phase: 'exporting',
        exportMode: action.mode, exportMutability: action.mutability,
      };
      return { state: next, events: [] };
    }
    case 'CREATE_RELATION': {
      if (state.readonly) return blocked(state, action);
      if (!state.container) return blocked(state, action);
      const id = generateLid();
      const ts = now();
      const container = addRelation(
        state.container, id, action.from, action.to, action.kind, ts,
      );
      const next: AppState = { ...state, container };
      return {
        state: next,
        events: [{
          type: 'RELATION_CREATED', id,
          from: action.from, to: action.to, kind: action.kind,
        }],
      };
    }
    case 'DELETE_RELATION': {
      if (state.readonly) return blocked(state, action);
      if (!state.container) return blocked(state, action);
      const container = removeRelation(state.container, action.id);
      const next: AppState = { ...state, container };
      return {
        state: next,
        events: [{ type: 'RELATION_DELETED', id: action.id }],
      };
    }
    case 'SYS_IMPORT_COMPLETE': {
      // Tier 2-1: auto-GC orphan assets on container replacement. The
      // imported container is the new source of truth; any asset in
      // its `assets` map that is NOT referenced by one of its own
      // entries is baggage from the sender side and can be dropped
      // safely. Because the previous container (and its revisions)
      // is being thrown away wholesale, there is no restore path
      // that could surface a purged asset later — which is why
      // import is the one reducer path where auto-GC is risk-free.
      // See docs/development/orphan-asset-auto-gc.md.
      const importedContainer = action.container;
      const purged = removeOrphanAssets(importedContainer);
      const purgedCount =
        purged === importedContainer
          ? 0
          : Object.keys(importedContainer.assets).length - Object.keys(purged.assets).length;
      const next: AppState = {
        ...state,
        phase: 'ready',
        container: purged,
        selectedLid: null,
        editingLid: null,
        error: null,
        // Boot-source-policy: explicit import clears viewOnlySource
        // so the imported container persists to IDB normally.
        viewOnlySource: false,
        // P1-1: container replaced wholesale — any per-entry transient
        // UI flow is anchored to a lid that likely doesn't exist in
        // the new container. Clear them defensively.
        textlogSelection: null,
        textToTextlogModal: null,
      };
      const cid = action.container?.meta?.container_id ?? 'unknown';
      const events: DomainEvent[] = [{ type: 'CONTAINER_IMPORTED', container_id: cid, source: action.source }];
      if (purgedCount > 0) events.push({ type: 'ORPHAN_ASSETS_PURGED', count: purgedCount });
      return { state: next, events };
    }
    case 'SYS_RECORD_OFFERED': {
      const offer = action.offer as PendingOffer;
      const next: AppState = {
        ...state,
        pendingOffers: [...state.pendingOffers, offer],
      };
      return {
        state: next,
        events: [{ type: 'RECORD_OFFERED', offer_id: offer.offer_id, title: offer.title }],
      };
    }
    case 'ACCEPT_OFFER': {
      if (!state.container) return blocked(state, action);
      const offer = state.pendingOffers.find((o) => o.offer_id === action.offer_id);
      if (!offer) return blocked(state, action);
      const lid = generateLid();
      const ts = now();
      const container = addEntry(
        state.container, lid, offer.archetype, offer.title, ts,
      );
      // Set body on the newly added entry
      const updatedContainer = updateEntry(container, lid, offer.title, offer.body, ts);
      const next: AppState = {
        ...state,
        container: updatedContainer,
        pendingOffers: state.pendingOffers.filter((o) => o.offer_id !== action.offer_id),
        selectedLid: lid,
      };
      return {
        state: next,
        events: [
          { type: 'OFFER_ACCEPTED', offer_id: action.offer_id, lid },
          { type: 'ENTRY_CREATED', lid, archetype: offer.archetype },
        ],
      };
    }
    case 'DISMISS_OFFER': {
      const offer = state.pendingOffers.find((o) => o.offer_id === action.offer_id);
      if (!offer) return { state, events: [] };
      const next: AppState = {
        ...state,
        pendingOffers: state.pendingOffers.filter((o) => o.offer_id !== action.offer_id),
      };
      return {
        state: next,
        events: [{ type: 'OFFER_DISMISSED', offer_id: action.offer_id, reply_to_id: offer.reply_to_id }],
      };
    }
    case 'RESTORE_ENTRY': {
      if (!state.container) return blocked(state, action);
      const ts = now();
      const entryExists = state.container.entries.some((e) => e.lid === action.lid);

      let container: typeof state.container;
      if (entryExists) {
        // Restore existing entry: snapshot current, then overwrite
        const snapshotRevId = generateLid();
        container = restoreEntry(
          state.container, action.lid, action.revision_id, snapshotRevId, ts,
        );
      } else {
        // Restore deleted entry: re-create from revision
        container = restoreDeletedEntry(state.container, action.revision_id, ts);
      }

      if (container === state.container) return blocked(state, action);

      const next: AppState = { ...state, container, selectedLid: action.lid };
      return {
        state: next,
        events: [{ type: 'ENTRY_RESTORED', lid: action.lid, revision_id: action.revision_id }],
      };
    }
    case 'SYS_IMPORT_PREVIEW': {
      // Tier 3-1: reset import mode to 'replace' on every new preview so
      // a prior merge selection cannot leak into the next import session.
      const next: AppState = {
        ...state,
        importPreview: action.preview,
        importMode: 'replace',
        mergeConflicts: undefined,
        mergeConflictResolutions: undefined,
      };
      return {
        state: next,
        events: [{
          type: 'IMPORT_PREVIEWED',
          source: action.preview.source,
          entry_count: action.preview.entry_count,
        }],
      };
    }
    case 'CONFIRM_IMPORT': {
      if (!state.importPreview) return blocked(state, action);
      const imported = state.importPreview.container;
      const source = state.importPreview.source;
      // Tier 2-1: auto-GC orphan assets on import confirmation. See the
      // SYS_IMPORT_COMPLETE case above for the safety rationale.
      const purged = removeOrphanAssets(imported);
      const purgedCount =
        purged === imported
          ? 0
          : Object.keys(imported.assets).length - Object.keys(purged.assets).length;
      const next: AppState = {
        ...state,
        phase: 'ready',
        container: purged,
        selectedLid: null,
        editingLid: null,
        error: null,
        importPreview: null,
        importMode: 'replace',
        lightSource: false,
        // Explicit import is the canonical "promote to writable" gate
        // for boot-source policy (see boot-container-source-policy-
        // revision.md). Clear viewOnlySource so post-import edits
        // persist to IDB normally.
        viewOnlySource: false,
      };
      const cid = imported?.meta?.container_id ?? 'unknown';
      const events: DomainEvent[] = [{ type: 'CONTAINER_IMPORTED', container_id: cid, source }];
      if (purgedCount > 0) events.push({ type: 'ORPHAN_ASSETS_PURGED', count: purgedCount });
      return { state: next, events };
    }
    case 'CONFIRM_MERGE_IMPORT': {
      // Tier 3-1: Overlay MVP (append-only). Invariants I-Merge1 / I-Merge2.
      if (!state.importPreview) return blocked(state, action);
      if (!state.container) return blocked(state, action);
      const host = state.container;
      const imported = state.importPreview.container;
      const source = state.importPreview.source;
      const plan = planMergeImport(host, imported, action.now);
      if ('error' in plan) return blocked(state, action);

      let finalPlan = plan;
      let mergeTarget = imported;
      let suppressedByKeepCurrent: string[] = [];
      let suppressedBySkip: string[] = [];
      let provenanceData: ProvenanceRelationData[] = [];

      if (state.mergeConflicts && state.mergeConflicts.length > 0 && state.mergeConflictResolutions) {
        const crResult = applyConflictResolutions(
          plan, state.mergeConflictResolutions, state.mergeConflicts, action.now,
        );
        finalPlan = crResult.plan;
        suppressedByKeepCurrent = crResult.suppressedByKeepCurrent;
        suppressedBySkip = crResult.suppressedBySkip;
        provenanceData = crResult.provenanceData;
        mergeTarget = {
          ...imported,
          entries: imported.entries.filter((e) => crResult.plan.lidRemap.has(e.lid)),
        };
      }

      let merged = applyMergePlan(host, mergeTarget, finalPlan, action.now);

      if (provenanceData.length > 0) {
        const newRelations = provenanceData.map((p) => ({
          id: generateLid(),
          from: p.from_lid,
          to: p.to_lid,
          kind: 'provenance' as const,
          created_at: action.now,
          updated_at: action.now,
          metadata: p.metadata as Record<string, unknown>,
        }));
        merged = { ...merged, relations: [...merged.relations, ...newRelations] };
      }

      const purged = removeOrphanAssets(merged);
      const purgedCount =
        purged === merged
          ? 0
          : Object.keys(merged.assets).length - Object.keys(purged.assets).length;
      const next: AppState = {
        ...state,
        phase: 'ready',
        container: purged,
        editingLid: null,
        error: null,
        importPreview: null,
        importMode: 'replace',
        mergeConflicts: undefined,
        mergeConflictResolutions: undefined,
        viewOnlySource: false,
      };
      const cid = host.meta.container_id ?? 'unknown';
      const events: DomainEvent[] = [{
        type: 'CONTAINER_MERGED',
        container_id: cid,
        source,
        added_entries: finalPlan.counts.addedEntries,
        added_assets: finalPlan.counts.addedAssets,
        added_relations: finalPlan.counts.addedRelations + provenanceData.length,
        suppressed_by_keep_current: suppressedByKeepCurrent,
        suppressed_by_skip: suppressedBySkip,
      }];
      if (purgedCount > 0) events.push({ type: 'ORPHAN_ASSETS_PURGED', count: purgedCount });
      return { state: next, events };
    }
    case 'SET_IMPORT_MODE': {
      if (!state.importPreview) return blocked(state, action);
      const current = state.importMode ?? 'replace';
      if (current === action.mode) return blocked(state, action);
      const next: AppState = {
        ...state,
        importMode: action.mode,
        mergeConflicts: action.mode === 'replace' ? undefined : state.mergeConflicts,
        mergeConflictResolutions: action.mode === 'replace' ? undefined : state.mergeConflictResolutions,
      };
      return { state: next, events: [] };
    }
    case 'SET_MERGE_CONFLICTS': {
      if (!state.importPreview) return blocked(state, action);
      if ((state.importMode ?? 'replace') !== 'merge') return blocked(state, action);
      const resolutions: Record<string, Resolution> = {};
      for (const c of action.conflicts) {
        if (c.kind === 'content-equal') {
          resolutions[c.imported_lid] = 'keep-current';
        }
      }
      const next: AppState = {
        ...state,
        mergeConflicts: action.conflicts,
        mergeConflictResolutions: resolutions,
      };
      return { state: next, events: [] };
    }
    case 'SET_CONFLICT_RESOLUTION': {
      if (!state.mergeConflictResolutions) return blocked(state, action);
      const next: AppState = {
        ...state,
        mergeConflictResolutions: {
          ...state.mergeConflictResolutions,
          [action.importedLid]: action.resolution,
        },
      };
      return { state: next, events: [] };
    }
    case 'BULK_SET_CONFLICT_RESOLUTION': {
      if (!state.mergeConflicts || !state.mergeConflictResolutions) return blocked(state, action);
      // I-MergeUI7 preservation: for keep-current bulk, title-only-multi rows
      // are untouched — existing resolutions (if any) are preserved, not wiped.
      const resolutions: Record<string, Resolution> = { ...state.mergeConflictResolutions };
      for (const c of state.mergeConflicts) {
        if (action.resolution === 'keep-current' && c.kind === 'title-only-multi') continue;
        resolutions[c.imported_lid] = action.resolution;
      }
      const next: AppState = {
        ...state,
        mergeConflictResolutions: resolutions,
      };
      return { state: next, events: [] };
    }
    case 'CANCEL_IMPORT': {
      const next: AppState = {
        ...state,
        importPreview: null,
        importMode: 'replace',
        mergeConflicts: undefined,
        mergeConflictResolutions: undefined,
      };
      return {
        state: next,
        events: [{ type: 'IMPORT_CANCELLED' }],
      };
    }
    case 'SYS_BATCH_IMPORT_PREVIEW': {
      const next: AppState = { ...state, batchImportPreview: action.preview, batchImportResult: null };
      return {
        state: next,
        events: [{
          type: 'BATCH_IMPORT_PREVIEWED',
          source: action.preview.source,
          totalEntries: action.preview.totalEntries,
        }],
      };
    }
    case 'TOGGLE_BATCH_IMPORT_ENTRY': {
      if (!state.batchImportPreview) return blocked(state, action);
      const prev = state.batchImportPreview.selectedIndices;
      const idx = action.index;
      const selectedIndices = prev.includes(idx)
        ? prev.filter((i) => i !== idx)
        : [...prev, idx];
      const next: AppState = {
        ...state,
        batchImportPreview: reclassifyPreview(state.batchImportPreview, selectedIndices),
      };
      return { state: next, events: [] };
    }
    case 'TOGGLE_ALL_BATCH_IMPORT_ENTRIES': {
      if (!state.batchImportPreview) return blocked(state, action);
      const all = state.batchImportPreview.entries.map((e) => e.index);
      const allSelected = state.batchImportPreview.selectedIndices.length === all.length;
      const selectedIndices = allSelected ? [] : all;
      const next: AppState = {
        ...state,
        batchImportPreview: reclassifyPreview(state.batchImportPreview, selectedIndices),
      };
      return { state: next, events: [] };
    }
    case 'SET_BATCH_IMPORT_TARGET_FOLDER': {
      if (!state.batchImportPreview) return blocked(state, action);
      const next: AppState = {
        ...state,
        batchImportPreview: { ...state.batchImportPreview, targetFolderLid: action.lid },
      };
      return { state: next, events: [] };
    }
    case 'CONFIRM_BATCH_IMPORT': {
      if (!state.batchImportPreview) return blocked(state, action);
      if (state.batchImportPreview.selectedIndices.length === 0) return blocked(state, action);
      const next: AppState = { ...state, batchImportPreview: null };
      return {
        state: next,
        events: [{ type: 'BATCH_IMPORT_CONFIRMED' }],
      };
    }
    case 'CANCEL_BATCH_IMPORT': {
      const next: AppState = { ...state, batchImportPreview: null };
      return {
        state: next,
        events: [{ type: 'BATCH_IMPORT_CANCELLED' }],
      };
    }
    case 'SYS_APPLY_BATCH_IMPORT': {
      if (state.readonly) return blocked(state, action);
      if (!state.container) return blocked(state, action);
      const plan = action.plan;
      const ts = now();
      let container = state.container;
      const events: DomainEvent[] = [];
      const oldToNewLid = new Map<string, string>();

      // 1. Create folders in topological order
      for (const folder of plan.folders) {
        const lid = generateLid();
        container = addEntry(container, lid, 'folder', folder.title, ts);
        container = updateEntry(container, lid, folder.title, '', ts);
        oldToNewLid.set(folder.originalLid, lid);
        events.push({ type: 'ENTRY_CREATED', lid, archetype: 'folder' });
      }

      // Resolve target folder: must exist in container as a folder entry
      const targetLid = plan.targetFolderLid ?? null;
      const targetExists = targetLid !== null
        && container.entries.some((e) => e.lid === targetLid && e.archetype === 'folder');

      // 2. Create structural relations between folders
      for (const folder of plan.folders) {
        if (folder.parentOriginalLid !== null) {
          const newParent = oldToNewLid.get(folder.parentOriginalLid);
          const newChild = oldToNewLid.get(folder.originalLid);
          if (newParent && newChild) {
            const relId = generateLid();
            container = addRelation(container, relId, newParent, newChild, 'structural', ts);
            events.push({ type: 'RELATION_CREATED', id: relId, from: newParent, to: newChild, kind: 'structural' });
          }
        } else if (targetExists) {
          // Top-level imported folder → attach to target folder
          const newChild = oldToNewLid.get(folder.originalLid);
          if (newChild) {
            const relId = generateLid();
            container = addRelation(container, relId, targetLid, newChild, 'structural', ts);
            events.push({ type: 'RELATION_CREATED', id: relId, from: targetLid, to: newChild, kind: 'structural' });
          }
        }
      }

      // 3. Create content entries with attachments and assets
      for (const entry of plan.entries) {
        // Merge assets first
        if (Object.keys(entry.assets).length > 0) {
          container = mergeAssets(container, entry.assets);
        }

        // Create attachment entries before the main entry
        for (const att of entry.attachments) {
          const attLid = generateLid();
          container = addEntry(container, attLid, 'attachment', att.name, ts);
          container = updateEntry(container, attLid, att.name, att.body, ts);
          if (att.assetData) {
            container = mergeAssets(container, { [att.assetKey]: att.assetData });
          }
          events.push({ type: 'ENTRY_CREATED', lid: attLid, archetype: 'attachment' });
        }

        const lid = generateLid();
        container = addEntry(container, lid, entry.archetype, entry.title, ts);
        container = updateEntry(container, lid, entry.title, entry.body, ts);
        events.push({ type: 'ENTRY_CREATED', lid, archetype: entry.archetype });

        // Create structural relation to parent folder if applicable
        if (entry.parentFolderOriginalLid) {
          const newParent = oldToNewLid.get(entry.parentFolderOriginalLid);
          if (newParent) {
            const relId = generateLid();
            container = addRelation(container, relId, newParent, lid, 'structural', ts);
            events.push({ type: 'RELATION_CREATED', id: relId, from: newParent, to: lid, kind: 'structural' });
          }
        } else if (targetExists) {
          // Unparented content entry → attach to target folder
          const relId = generateLid();
          container = addRelation(container, relId, targetLid, lid, 'structural', ts);
          events.push({ type: 'RELATION_CREATED', id: relId, from: targetLid, to: lid, kind: 'structural' });
        }
      }

      // Compute result summary for UI feedback
      const totalAttachments = plan.entries.reduce((sum, e) => sum + e.attachments.length, 0);
      const fallbackToRoot = targetLid !== null && !targetExists;
      const targetEntry = targetExists
        ? container.entries.find((e) => e.lid === targetLid)
        : null;
      const actualDestination = targetExists && targetEntry
        ? targetEntry.title || '(untitled)'
        : '/ (Root)';
      // When fallback occurred, look up the intended folder title from original container
      let intendedDestination: string | null = null;
      if (fallbackToRoot && targetLid !== null) {
        const intendedEntry = state.container!.entries.find((e) => e.lid === targetLid);
        intendedDestination = intendedEntry ? intendedEntry.title || '(untitled)' : null;
      }
      const summary: BatchImportResultSummary = {
        entryCount: plan.entries.length,
        attachmentCount: totalAttachments,
        folderCount: plan.folders.length,
        restoreStructure: plan.restoreStructure,
        actualDestination,
        intendedDestination,
        fallbackToRoot,
        source: plan.source,
      };
      events.push({ type: 'BATCH_IMPORT_APPLIED', summary });

      const next: AppState = { ...state, container, batchImportResult: summary };
      return { state: next, events };
    }
    case 'DISMISS_BATCH_IMPORT_RESULT': {
      const next: AppState = { ...state, batchImportResult: null };
      return { state: next, events: [] };
    }
    case 'SET_SEARCH_QUERY': {
      const next: AppState = { ...state, searchQuery: action.query };
      return { state: next, events: [] };
    }
    case 'SET_ARCHETYPE_FILTER': {
      const next: AppState = { ...state, archetypeFilter: action.archetype };
      return { state: next, events: [] };
    }
    case 'SET_TAG_FILTER': {
      const next: AppState = { ...state, tagFilter: action.tagLid };
      return { state: next, events: [] };
    }
    case 'CLEAR_FILTERS': {
      const next: AppState = { ...state, searchQuery: '', archetypeFilter: null, tagFilter: null };
      return { state: next, events: [] };
    }
    case 'SET_SORT': {
      const next: AppState = { ...state, sortKey: action.key, sortDirection: action.direction };
      return { state: next, events: [] };
    }
    // QUICK_UPDATE_ENTRY: body-only update, title preserved.
    // See user-action.ts for full contract documentation.
    case 'QUICK_UPDATE_ENTRY': {
      if (state.readonly) return blocked(state, action);
      if (!state.container) return blocked(state, action);
      const entry = state.container.entries.find((e) => e.lid === action.lid);
      if (!entry) return blocked(state, action);
      const ts = now();
      const revId = generateLid();
      const snapshotted = snapshotEntry(state.container, action.lid, revId, ts);
      // Preserve entry.title — QUICK_UPDATE_ENTRY must NOT change title
      const container = updateEntry(snapshotted, action.lid, entry.title, action.body, ts);
      const next: AppState = { ...state, container };
      return {
        state: next,
        events: [{ type: 'ENTRY_UPDATED', lid: action.lid }],
      };
    }
    case 'TOGGLE_SHOW_ARCHIVED': {
      const next: AppState = { ...state, showArchived: !state.showArchived };
      return { state: next, events: [] };
    }
    case 'SET_VIEW_MODE': {
      const next: AppState = { ...state, viewMode: action.mode };
      return { state: next, events: [] };
    }
    case 'SET_CALENDAR_MONTH': {
      const next: AppState = { ...state, calendarYear: action.year, calendarMonth: action.month };
      return { state: next, events: [] };
    }
    case 'REHYDRATE': {
      if (!state.readonly || !state.container) return blocked(state, action);
      const ts = now();
      const oldCid = state.container.meta.container_id;
      const newCid = generateLid();
      const rehydrated: Container = {
        ...state.container,
        meta: {
          ...state.container.meta,
          container_id: newCid,
          updated_at: ts,
        },
      };
      const next: AppState = {
        ...state,
        container: rehydrated,
        readonly: false,
        lightSource: false,
        // Rehydrate (from readonly / view-only snapshot) is an
        // explicit promotion — treat like Import for persistence.
        viewOnlySource: false,
      };
      return {
        state: next,
        events: [{ type: 'CONTAINER_REHYDRATED', old_cid: oldCid, new_cid: newCid }],
      };
    }
    case 'PURGE_TRASH': {
      if (state.readonly) return blocked(state, action);
      if (!state.container) return blocked(state, action);
      const result = purgeTrash(state.container);
      if (result.purgedCount === 0) return blocked(state, action);
      const next: AppState = { ...state, container: result.container };
      return { state: next, events: [{ type: 'TRASH_PURGED', count: result.purgedCount }] };
    }
    case 'PURGE_ORPHAN_ASSETS': {
      // Manual orphan asset cleanup. This is the user-facing cleanup
      // button; it runs the same helper as the Tier 2-1 auto-GC on
      // SYS_IMPORT_COMPLETE / CONFIRM_IMPORT, but from a different
      // trigger. Every non-import reducer path (DELETE_ENTRY /
      // COMMIT_EDIT / QUICK_UPDATE_ENTRY / BULK_DELETE / RESTORE_ENTRY)
      // still leaves orphan cleanup to this manual action — see
      // docs/development/orphan-asset-auto-gc.md.
      //
      // The helper's identity contract does all the bookkeeping:
      //   - zero orphans → returns the SAME container reference, which
      //     we detect via `===` and turn into a `blocked` no-op. This
      //     keeps the "cleanup button while nothing to do" case from
      //     polluting the event log or flipping identity spuriously.
      //   - some orphans → returns a fresh container with a fresh
      //     `assets` map. We count the delta by comparing the two key
      //     sets so the emitted event carries an accurate `count`.
      if (state.readonly) return blocked(state, action);
      if (!state.container) return blocked(state, action);
      const prev = state.container;
      const pruned = removeOrphanAssets(prev);
      if (pruned === prev) return blocked(state, action);
      const count = Object.keys(prev.assets).length - Object.keys(pruned.assets).length;
      const next: AppState = { ...state, container: pruned };
      return { state: next, events: [{ type: 'ORPHAN_ASSETS_PURGED', count }] };
    }
    case 'SET_SANDBOX_POLICY': {
      if (state.readonly) return blocked(state, action);
      if (!state.container) return blocked(state, action);
      // Validate policy value; treat unknown as 'strict'
      const policy = action.policy === 'relaxed' ? 'relaxed' : 'strict';
      const ts = now();
      const container: Container = {
        ...state.container,
        meta: { ...state.container.meta, sandbox_policy: policy, updated_at: ts },
      };
      const next: AppState = { ...state, container };
      return { state: next, events: [] };
    }
    // ── P1-1: TEXTLOG → TEXT selection + TEXT → TEXTLOG modal ──────
    case 'BEGIN_TEXTLOG_SELECTION': {
      if (!state.container) return blocked(state, action);
      const entry = state.container.entries.find((e) => e.lid === action.lid);
      if (!entry || entry.archetype !== 'textlog') return blocked(state, action);
      const next: AppState = {
        ...state,
        textlogSelection: { activeLid: action.lid, selectedLogIds: [] },
      };
      return { state: next, events: [] };
    }
    case 'TOGGLE_TEXTLOG_LOG_SELECTION': {
      if (!state.textlogSelection) return blocked(state, action);
      const { activeLid, selectedLogIds } = state.textlogSelection;
      const idx = selectedLogIds.indexOf(action.logId);
      const nextIds = idx >= 0
        ? selectedLogIds.filter((id) => id !== action.logId)
        : [...selectedLogIds, action.logId];
      const next: AppState = {
        ...state,
        textlogSelection: { activeLid, selectedLogIds: nextIds },
      };
      return { state: next, events: [] };
    }
    case 'CANCEL_TEXTLOG_SELECTION': {
      if (!state.textlogSelection) return blocked(state, action);
      const next: AppState = { ...state, textlogSelection: null };
      return { state: next, events: [] };
    }
    case 'OPEN_TEXT_TO_TEXTLOG_MODAL': {
      if (state.readonly) return blocked(state, action);
      if (!state.container) return blocked(state, action);
      const source = state.container.entries.find((e) => e.lid === action.sourceLid);
      if (!source || source.archetype !== 'text') return blocked(state, action);
      const splitMode = action.splitMode === 'hr' ? 'hr' : 'heading';
      const next: AppState = {
        ...state,
        textToTextlogModal: { sourceLid: action.sourceLid, splitMode },
      };
      return { state: next, events: [] };
    }
    case 'SET_TEXT_TO_TEXTLOG_SPLIT_MODE': {
      if (!state.textToTextlogModal) return blocked(state, action);
      const splitMode = action.splitMode === 'hr' ? 'hr' : 'heading';
      if (splitMode === state.textToTextlogModal.splitMode) {
        // Identity-preserving no-op — same reference returned so state
        // listeners can skip redundant re-renders.
        return { state, events: [] };
      }
      const next: AppState = {
        ...state,
        textToTextlogModal: { ...state.textToTextlogModal, splitMode },
      };
      return { state: next, events: [] };
    }
    case 'CLOSE_TEXT_TO_TEXTLOG_MODAL': {
      if (!state.textToTextlogModal) return blocked(state, action);
      const next: AppState = { ...state, textToTextlogModal: null };
      return { state: next, events: [] };
    }
    case 'TOGGLE_MULTI_SELECT': {
      const lids = [...state.multiSelectedLids];
      const idx = lids.indexOf(action.lid);
      if (idx >= 0) {
        lids.splice(idx, 1);
      } else {
        lids.push(action.lid);
      }
      // Also include current selectedLid if not already
      if (state.selectedLid && !lids.includes(state.selectedLid)) {
        lids.unshift(state.selectedLid);
      }
      const next: AppState = { ...state, selectedLid: action.lid, multiSelectedLids: lids };
      return { state: next, events: [{ type: 'MULTI_SELECT_CHANGED', lids }] };
    }
    case 'SELECT_RANGE': {
      if (!state.container) return blocked(state, action);
      const entries = state.container.entries;
      const anchorIdx = entries.findIndex((e) => e.lid === state.selectedLid);
      const targetIdx = entries.findIndex((e) => e.lid === action.lid);
      if (anchorIdx < 0 || targetIdx < 0) return blocked(state, action);
      const from = Math.min(anchorIdx, targetIdx);
      const to = Math.max(anchorIdx, targetIdx);
      const lids = entries.slice(from, to + 1).map((e) => e.lid);
      const next: AppState = { ...state, selectedLid: action.lid, multiSelectedLids: lids };
      return { state: next, events: [{ type: 'MULTI_SELECT_CHANGED', lids }] };
    }
    case 'CLEAR_MULTI_SELECT': {
      const next: AppState = { ...state, multiSelectedLids: [] };
      return { state: next, events: [{ type: 'MULTI_SELECT_CHANGED', lids: [] }] };
    }
    case 'BULK_DELETE': {
      if (state.readonly) return blocked(state, action);
      if (!state.container) return blocked(state, action);
      const allSelected = getAllSelected(state);
      if (allSelected.length === 0) return blocked(state, action);
      let container = state.container;
      const ts = now();
      // Bulk-snapshot policy (2026-04-13): every revision produced
      // by a single bulk action shares the same `bulk_id` so a
      // downstream restore UI can group them. Single-entry DELETE
      // does NOT use a bulk_id — see `snapshotEntry` contract.
      const bulkId = generateLid();
      for (const lid of allSelected) {
        const revId = generateLid();
        container = snapshotEntry(container, lid, revId, ts, bulkId);
        container = removeEntry(container, lid);
      }
      const next: AppState = { ...state, container, selectedLid: null, multiSelectedLids: [] };
      return { state: next, events: [{ type: 'BULK_DELETED', lids: allSelected }] };
    }
    case 'BULK_MOVE_TO_FOLDER': {
      if (state.readonly) return blocked(state, action);
      if (!state.container) return blocked(state, action);
      const selected = getAllSelected(state);
      if (selected.length === 0) return blocked(state, action);
      let container = state.container;
      const ts = now();
      for (const lid of selected) {
        // Remove existing structural parent relations
        for (const r of container.relations) {
          if (r.kind === 'structural' && r.to === lid) {
            container = removeRelation(container, r.id);
          }
        }
        // Add new structural relation to target folder
        const relId = generateLid();
        container = addRelation(container, relId, action.folderLid, lid, 'structural', ts);
      }
      const next: AppState = { ...state, container, multiSelectedLids: [] };
      return { state: next, events: [] };
    }
    case 'BULK_MOVE_TO_ROOT': {
      if (state.readonly) return blocked(state, action);
      if (!state.container) return blocked(state, action);
      const selected = getAllSelected(state);
      if (selected.length === 0) return blocked(state, action);
      let container = state.container;
      for (const lid of selected) {
        for (const r of container.relations) {
          if (r.kind === 'structural' && r.to === lid) {
            container = removeRelation(container, r.id);
          }
        }
      }
      const next: AppState = { ...state, container, multiSelectedLids: [] };
      return { state: next, events: [] };
    }
    case 'BULK_SET_STATUS': {
      if (state.readonly) return blocked(state, action);
      if (!state.container) return blocked(state, action);
      const selected = getAllSelected(state);
      if (selected.length === 0) return blocked(state, action);
      let container = state.container;
      const ts = now();
      // Bulk-snapshot policy: single group id for every per-entry
      // revision that this action writes. Entries that would be a
      // no-op (same status already) produce no revision and are NOT
      // counted — the group only holds the revisions of entries
      // that actually changed.
      const bulkId = generateLid();
      for (const lid of selected) {
        const entry = container.entries.find((e) => e.lid === lid);
        if (!entry || entry.archetype !== 'todo') continue;
        const todo = parseTodoBody(entry.body);
        if (todo.status === action.status) continue;
        const updated = serializeTodoBody({ ...todo, status: action.status });
        const revId = generateLid();
        container = snapshotEntry(container, lid, revId, ts, bulkId);
        container = updateEntry(container, lid, entry.title, updated, ts);
      }
      const next: AppState = { ...state, container, multiSelectedLids: [] };
      return { state: next, events: [] };
    }
    case 'BULK_SET_DATE': {
      if (state.readonly) return blocked(state, action);
      if (!state.container) return blocked(state, action);
      const selected = getAllSelected(state);
      if (selected.length === 0) return blocked(state, action);
      let container = state.container;
      const ts = now();
      const targetDate = action.date ?? undefined;
      // Bulk-snapshot policy: see BULK_SET_STATUS above.
      const bulkId = generateLid();
      for (const lid of selected) {
        const entry = container.entries.find((e) => e.lid === lid);
        if (!entry || entry.archetype !== 'todo') continue;
        const todo = parseTodoBody(entry.body);
        if (todo.date === targetDate) continue;
        const updated = serializeTodoBody({ ...todo, date: targetDate });
        const revId = generateLid();
        container = snapshotEntry(container, lid, revId, ts, bulkId);
        container = updateEntry(container, lid, entry.title, updated, ts);
      }
      const next: AppState = { ...state, container, multiSelectedLids: [] };
      return { state: next, events: [] };
    }
    case 'PASTE_ATTACHMENT': {
      if (state.readonly) return blocked(state, action);
      if (!state.container) return blocked(state, action);

      const ts = now();
      const events: DomainEvent[] = [];
      let container = state.container;

      // Auto-placement: inherit the current context's folder and
      // route the attachment into an `ASSETS` subfolder inside it. See
      // docs/development/auto-folder-placement-for-generated-entries.md.
      const contextFolderLid = resolveAutoPlacementFolder(container, action.contextLid);

      // Resolve final placement parent: skip the subfolder layer when
      // the context is already titled ASSETS; otherwise reuse existing
      // ASSETS child or create one in the same reduction.
      let placementParentLid: string | null = null;
      if (contextFolderLid) {
        const contextFolder = container.entries.find((e) => e.lid === contextFolderLid);
        const subName = 'ASSETS';
        if (contextFolder && contextFolder.title === subName) {
          placementParentLid = contextFolderLid;
        } else {
          const existing = findSubfolder(container, contextFolderLid, subName);
          if (existing) {
            placementParentLid = existing;
          } else {
            const subLid = generateLid();
            container = addEntry(container, subLid, 'folder', subName, ts);
            events.push({ type: 'ENTRY_CREATED', lid: subLid, archetype: 'folder' });
            const subRelId = generateLid();
            container = addRelation(container, subRelId, contextFolderLid, subLid, 'structural', ts);
            events.push({
              type: 'RELATION_CREATED', id: subRelId,
              from: contextFolderLid, to: subLid, kind: 'structural',
            });
            placementParentLid = subLid;
          }
        }
      }

      // Create attachment entry (no phase transition).
      const attachmentLid = generateLid();
      const bodyMeta = JSON.stringify({
        name: action.name,
        mime: action.mime,
        size: action.size,
        asset_key: action.assetKey,
      });
      container = addEntry(container, attachmentLid, 'attachment', action.name, ts);
      container = updateEntry(container, attachmentLid, action.name, bodyMeta, ts);
      container = mergeAssets(container, { [action.assetKey]: action.assetData });
      events.push({ type: 'ENTRY_CREATED', lid: attachmentLid, archetype: 'attachment' });

      // Place the attachment under the resolved folder. When no
      // context folder exists (selection at root / unresolved), no
      // structural relation is added and the attachment lands at root
      // — preserving the historical root-fallback path and avoiding
      // any root-level auto-ASSETS bucket.
      if (placementParentLid) {
        const attRelId = generateLid();
        container = addRelation(container, attRelId, placementParentLid, attachmentLid, 'structural', ts);
        events.push({ type: 'RELATION_CREATED', id: attRelId, from: placementParentLid, to: attachmentLid, kind: 'structural' });
      }

      const next: AppState = { ...state, container };
      return { state: next, events };
    }
    case 'TOGGLE_FOLDER_COLLAPSE': {
      const lids = state.collapsedFolders.includes(action.lid)
        ? state.collapsedFolders.filter((l) => l !== action.lid)
        : [...state.collapsedFolders, action.lid];
      const next: AppState = { ...state, collapsedFolders: lids };
      return { state: next, events: [] };
    }
    case 'SYS_ERROR': {
      const next: AppState = { ...state, phase: 'error', error: action.error };
      return { state: next, events: [{ type: 'ERROR_OCCURRED', error: action.error }] };
    }
    default:
      return blocked(state, action);
  }
}

function reduceEditing(state: AppState, action: Dispatchable): ReduceResult {
  switch (action.type) {
    case 'COMMIT_EDIT': {
      if (!state.container) return blocked(state, action);
      const ts = now();
      // Snapshot the entry before update (minimal revision)
      const revId = generateLid();
      let container = snapshotEntry(state.container, action.lid, revId, ts);
      // Apply the update
      container = updateEntry(container, action.lid, action.title, action.body, ts);
      // Merge any assets (e.g., attachment file data)
      if (action.assets) {
        container = mergeAssets(container, action.assets);
      }
      const next: AppState = { ...state, phase: 'ready', editingLid: null, container };
      return {
        state: next,
        events: [
          { type: 'EDIT_COMMITTED', lid: action.lid },
          { type: 'ENTRY_UPDATED', lid: action.lid },
        ],
      };
    }
    case 'CANCEL_EDIT': {
      const next: AppState = { ...state, phase: 'ready', editingLid: null };
      return { state: next, events: [{ type: 'EDIT_CANCELLED' }] };
    }
    case 'PASTE_ATTACHMENT': {
      // Delegate to the ready-phase handler — it preserves phase/editingLid/selectedLid
      return reduceReady(state, action);
    }
    default:
      return blocked(state, action);
  }
}

function reduceExporting(state: AppState, action: Dispatchable): ReduceResult {
  switch (action.type) {
    case 'SYS_FINISH_EXPORT': {
      const next: AppState = { ...state, phase: 'ready', exportMode: null, exportMutability: null };
      return { state: next, events: [{ type: 'EXPORT_COMPLETED' }] };
    }
    case 'SYS_ERROR': {
      const next: AppState = { ...state, phase: 'error', error: action.error };
      return { state: next, events: [{ type: 'ERROR_OCCURRED', error: action.error }] };
    }
    default:
      return blocked(state, action);
  }
}

function reduceError(state: AppState, action: Dispatchable): ReduceResult {
  switch (action.type) {
    case 'SYS_INIT_COMPLETE': {
      const next: AppState = {
        ...state,
        phase: 'ready',
        container: action.container,
        embedded: action.embedded ?? state.embedded,
        readonly: action.readonly ?? false,
        lightSource: action.lightSource ?? false,
        viewOnlySource: action.viewOnlySource ?? false,
        error: null,
      };
      const cid = action.container?.meta?.container_id ?? 'unknown';
      return { state: next, events: [{ type: 'CONTAINER_LOADED', container_id: cid }] };
    }
    case 'SYS_IMPORT_COMPLETE': {
      // Tier 2-1: mirror the reduceReady auto-GC behaviour on the
      // error-recovery import path so the two paths stay aligned.
      const importedContainer = action.container;
      const purged = removeOrphanAssets(importedContainer);
      const purgedCount =
        purged === importedContainer
          ? 0
          : Object.keys(importedContainer.assets).length - Object.keys(purged.assets).length;
      const next: AppState = {
        ...state,
        phase: 'ready',
        container: purged,
        selectedLid: null,
        editingLid: null,
        error: null,
        lightSource: false,
        viewOnlySource: false,
      };
      const cid = action.container?.meta?.container_id ?? 'unknown';
      const events: DomainEvent[] = [{ type: 'CONTAINER_IMPORTED', container_id: cid, source: action.source }];
      if (purgedCount > 0) events.push({ type: 'ORPHAN_ASSETS_PURGED', count: purgedCount });
      return { state: next, events };
    }
    default:
      return blocked(state, action);
  }
}

// ---- Utility ----

let lidCounter = 0;

export function generateLid(): string {
  lidCounter += 1;
  const ts = Date.now().toString(36);
  const seq = lidCounter.toString(36).padStart(4, '0');
  return `${ts}-${seq}`;
}
