import type { Container } from '../../core/model/container';
import type { Dispatchable } from '../../core/action';
import type { DomainEvent } from '../../core/action/domain-event';
import type { ImportPreviewRef } from '../../core/action/system-command';
import type { PendingOffer } from '../transport/record-offer-handler';
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
} from '../../core/operations/container-ops';

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
      const next: AppState = { ...state, selectedLid: action.lid };
      return { state: next, events: [{ type: 'ENTRY_SELECTED', lid: action.lid }] };
    }
    case 'DESELECT_ENTRY': {
      const next: AppState = { ...state, selectedLid: null };
      return { state: next, events: [{ type: 'ENTRY_DESELECTED' }] };
    }
    case 'BEGIN_EDIT': {
      const next: AppState = {
        ...state,
        phase: 'editing',
        selectedLid: action.lid,
        editingLid: action.lid,
      };
      return { state: next, events: [{ type: 'EDIT_BEGUN', lid: action.lid }] };
    }
    case 'CREATE_ENTRY': {
      if (!state.container) return blocked(state, action);
      const lid = generateLid();
      const ts = now();
      const container = addEntry(state.container, lid, action.archetype, action.title, ts);
      const next: AppState = { ...state, container, selectedLid: lid };
      return {
        state: next,
        events: [{ type: 'ENTRY_CREATED', lid, archetype: action.archetype }],
      };
    }
    case 'DELETE_ENTRY': {
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
      const next: AppState = { ...state, phase: 'exporting' };
      return { state: next, events: [] };
    }
    case 'CREATE_RELATION': {
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
    default:
      return blocked(state, action);
  }
}

function reduceExporting(state: AppState, action: Dispatchable): ReduceResult {
  switch (action.type) {
    case 'SYS_FINISH_EXPORT': {
      const next: AppState = { ...state, phase: 'ready' };
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
