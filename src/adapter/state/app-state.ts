import type { Container } from '../../core/model/container';

/**
 * AppPhase: explicit state machine to prevent operation-order bugs.
 * Each phase defines which Actions are permitted.
 */
export type AppPhase =
  | 'initializing'     // rehydrate in progress
  | 'ready'            // normal operation
  | 'editing'          // Record editing in progress
  | 'exporting'        // export in progress
  | 'error';           // error state

export interface AppState {
  phase: AppPhase;
  container: Container | null;
  selectedLid: string | null;
  error: string | null;
}

export type Action =
  | { type: 'INIT_COMPLETE'; container: Container }
  | { type: 'INIT_ERROR'; error: string }
  | { type: 'SELECT_RECORD'; lid: string }
  | { type: 'DESELECT_RECORD' }
  | { type: 'BEGIN_EDIT'; lid: string }
  | { type: 'COMMIT_EDIT' }
  | { type: 'CANCEL_EDIT' }
  | { type: 'BEGIN_EXPORT' }
  | { type: 'FINISH_EXPORT' }
  | { type: 'ERROR'; error: string };

export function createInitialState(): AppState {
  return {
    phase: 'initializing',
    container: null,
    selectedLid: null,
    error: null,
  };
}

export function reduce(state: AppState, action: Action): AppState {
  switch (state.phase) {
    case 'initializing':
      switch (action.type) {
        case 'INIT_COMPLETE':
          return { ...state, phase: 'ready', container: action.container };
        case 'INIT_ERROR':
          return { ...state, phase: 'error', error: action.error };
        default:
          return state;
      }

    case 'ready':
      switch (action.type) {
        case 'SELECT_RECORD':
          return { ...state, selectedLid: action.lid };
        case 'DESELECT_RECORD':
          return { ...state, selectedLid: null };
        case 'BEGIN_EDIT':
          return { ...state, phase: 'editing', selectedLid: action.lid };
        case 'BEGIN_EXPORT':
          return { ...state, phase: 'exporting' };
        case 'ERROR':
          return { ...state, phase: 'error', error: action.error };
        default:
          return state;
      }

    case 'editing':
      switch (action.type) {
        case 'COMMIT_EDIT':
          return { ...state, phase: 'ready' };
        case 'CANCEL_EDIT':
          return { ...state, phase: 'ready' };
        default:
          console.warn(`Action ${action.type} blocked in phase ${state.phase}`);
          return state;
      }

    case 'exporting':
      switch (action.type) {
        case 'FINISH_EXPORT':
          return { ...state, phase: 'ready' };
        case 'ERROR':
          return { ...state, phase: 'error', error: action.error };
        default:
          return state;
      }

    case 'error':
      switch (action.type) {
        case 'INIT_COMPLETE':
          return { ...state, phase: 'ready', container: action.container, error: null };
        default:
          return state;
      }
  }
}
