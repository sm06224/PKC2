import type { Container } from '../../core/model/container';
import type { Dispatchable } from '../../core/action';
import type { DomainEvent } from '../../core/action/domain-event';
import {
  addEntry,
  updateEntry,
  removeEntry,
  nextSelectedAfterRemove,
  addRelation,
  removeRelation,
  snapshotEntry,
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
      const entriesBefore = state.container.entries;
      const container = removeEntry(state.container, action.lid);
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
