import type { Container } from '../../core/model/container';
import type { ArchetypeId } from '../../core/model/record';
import type { ExportMode, ExportMutability } from '../../core/action/user-action';
import type { Dispatchable } from '../../core/action';
import type { DomainEvent } from '../../core/action/domain-event';
import type { ImportPreviewRef, BatchImportPreviewInfo } from '../../core/action/system-command';
import type { PendingOffer } from '../transport/record-offer-handler';
import type { SortKey, SortDirection } from '../../features/search/sort';
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
  /** Batch import preview awaiting user confirmation (runtime-only). */
  batchImportPreview: BatchImportPreviewInfo | null;
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
    batchImportPreview: null,
    searchQuery: '',
    archetypeFilter: null,
    tagFilter: null,
    sortKey: 'title',
    sortDirection: 'asc',
    exportMode: null,
    exportMutability: null,
    readonly: false,
    lightSource: false,
    showArchived: false,
    viewMode: 'detail',
    calendarYear: new Date().getFullYear(),
    calendarMonth: new Date().getMonth() + 1,
    multiSelectedLids: [],
    collapsedFolders: [],
  };
}

/** Get all selected lids (primary + multi). */
export function getAllSelected(state: AppState): string[] {
  const set = new Set(state.multiSelectedLids);
  if (state.selectedLid) set.add(state.selectedLid);
  return Array.from(set);
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
      const next: AppState = { ...state, selectedLid: action.lid, multiSelectedLids: [] };
      return { state: next, events: [{ type: 'ENTRY_SELECTED', lid: action.lid }] };
    }
    case 'DESELECT_ENTRY': {
      const next: AppState = { ...state, selectedLid: null };
      return { state: next, events: [{ type: 'ENTRY_DESELECTED' }] };
    }
    case 'BEGIN_EDIT': {
      if (state.readonly) return blocked(state, action);
      const next: AppState = {
        ...state,
        phase: 'editing',
        selectedLid: action.lid,
        editingLid: action.lid,
        viewMode: 'detail',
      };
      return { state: next, events: [{ type: 'EDIT_BEGUN', lid: action.lid }] };
    }
    case 'CREATE_ENTRY': {
      if (state.readonly) return blocked(state, action);
      if (!state.container) return blocked(state, action);
      const lid = generateLid();
      const ts = now();
      const container = addEntry(state.container, lid, action.archetype, action.title, ts);
      const next: AppState = {
        ...state,
        container,
        selectedLid: lid,
        phase: 'editing',
        editingLid: lid,
        viewMode: 'detail',
      };
      return {
        state: next,
        events: [
          { type: 'ENTRY_CREATED', lid, archetype: action.archetype },
          { type: 'EDIT_BEGUN', lid },
        ],
      };
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
      const next: AppState = { ...state, container, selectedLid };
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
      const next: AppState = {
        ...state,
        phase: 'ready',
        container: action.container,
        selectedLid: null,
        editingLid: null,
        error: null,
      };
      const cid = action.container?.meta?.container_id ?? 'unknown';
      return {
        state: next,
        events: [{ type: 'CONTAINER_IMPORTED', container_id: cid, source: action.source }],
      };
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
      const next: AppState = { ...state, importPreview: action.preview };
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
      const next: AppState = {
        ...state,
        phase: 'ready',
        container: imported,
        selectedLid: null,
        editingLid: null,
        error: null,
        importPreview: null,
        lightSource: false,
      };
      const cid = imported?.meta?.container_id ?? 'unknown';
      return {
        state: next,
        events: [{ type: 'CONTAINER_IMPORTED', container_id: cid, source }],
      };
    }
    case 'CANCEL_IMPORT': {
      const next: AppState = { ...state, importPreview: null };
      return {
        state: next,
        events: [{ type: 'IMPORT_CANCELLED' }],
      };
    }
    case 'SYS_BATCH_IMPORT_PREVIEW': {
      const next: AppState = { ...state, batchImportPreview: action.preview };
      return {
        state: next,
        events: [{
          type: 'BATCH_IMPORT_PREVIEWED',
          source: action.preview.source,
          totalEntries: action.preview.totalEntries,
        }],
      };
    }
    case 'CONFIRM_BATCH_IMPORT': {
      if (!state.batchImportPreview) return blocked(state, action);
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
      // Manual orphan asset cleanup. This is the ONE and only place
      // where `removeOrphanAssets` is wired — no other reducer path
      // invokes it (no auto-GC on DELETE_ENTRY / COMMIT_EDIT / export).
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
      for (const lid of allSelected) {
        const revId = generateLid();
        container = snapshotEntry(container, lid, revId, ts);
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
    case 'PASTE_ATTACHMENT': {
      if (state.readonly) return blocked(state, action);
      if (!state.container) return blocked(state, action);

      const ts = now();
      const events: DomainEvent[] = [];
      let container = state.container;

      // 1. Find structural parent of contextLid (same level)
      let parentFolderLid: string | null = null;
      for (const r of container.relations) {
        if (r.kind === 'structural' && r.to === action.contextLid) {
          const parent = container.entries.find((e) => e.lid === r.from);
          if (parent) { parentFolderLid = parent.lid; break; }
        }
      }

      // 2. Find or create ASSETS folder at that level
      let assetsFolderLid: string | null = null;
      for (const e of container.entries) {
        if (e.archetype !== 'folder' || e.title !== 'ASSETS') continue;
        if (parentFolderLid === null) {
          // Context is at root — ASSETS folder must also be at root (no structural parent)
          const hasParent = container.relations.some(
            (r) => r.kind === 'structural' && r.to === e.lid,
          );
          if (!hasParent) { assetsFolderLid = e.lid; break; }
        } else {
          // Context is inside a folder — ASSETS must be a child of same parent
          const isChild = container.relations.some(
            (r) => r.kind === 'structural' && r.from === parentFolderLid && r.to === e.lid,
          );
          if (isChild) { assetsFolderLid = e.lid; break; }
        }
      }

      if (!assetsFolderLid) {
        // Create ASSETS folder
        assetsFolderLid = generateLid();
        container = addEntry(container, assetsFolderLid, 'folder', 'ASSETS', ts);
        events.push({ type: 'ENTRY_CREATED', lid: assetsFolderLid, archetype: 'folder' });

        // Place it under the same parent as contextLid
        if (parentFolderLid) {
          const relId = generateLid();
          container = addRelation(container, relId, parentFolderLid, assetsFolderLid, 'structural', ts);
          events.push({ type: 'RELATION_CREATED', id: relId, from: parentFolderLid, to: assetsFolderLid, kind: 'structural' });
        }
      }

      // 3. Create attachment entry (no phase transition)
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

      // 4. Place attachment inside ASSETS folder
      const attRelId = generateLid();
      container = addRelation(container, attRelId, assetsFolderLid, attachmentLid, 'structural', ts);
      events.push({ type: 'RELATION_CREATED', id: attRelId, from: assetsFolderLid, to: attachmentLid, kind: 'structural' });

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
        error: null,
      };
      const cid = action.container?.meta?.container_id ?? 'unknown';
      return { state: next, events: [{ type: 'CONTAINER_LOADED', container_id: cid }] };
    }
    case 'SYS_IMPORT_COMPLETE': {
      const next: AppState = {
        ...state,
        phase: 'ready',
        container: action.container,
        selectedLid: null,
        editingLid: null,
        error: null,
        lightSource: false,
      };
      const cid = action.container?.meta?.container_id ?? 'unknown';
      return {
        state: next,
        events: [{ type: 'CONTAINER_IMPORTED', container_id: cid, source: action.source }],
      };
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
