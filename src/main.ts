import './styles/base.css';
import { SLOT } from './runtime/contract';
import { createInitialState, reduce } from './adapter/state/app-state';
import type { Action, AppState } from './adapter/state/app-state';

/**
 * PKC2 minimal bootstrap.
 * Mounts the app shell and initializes the state machine.
 */
function boot(): void {
  let state: AppState = createInitialState();

  function dispatch(action: Action): void {
    const prev = state;
    state = reduce(state, action);
    if (prev !== state) {
      render(state);
    }
  }

  function render(s: AppState): void {
    const root = document.getElementById(SLOT.ROOT);
    if (!root) return;

    switch (s.phase) {
      case 'initializing':
        root.textContent = 'PKC2 initializing…';
        break;
      case 'ready':
        root.textContent = 'PKC2 ready.';
        break;
      case 'error':
        root.textContent = `PKC2 error: ${s.error ?? 'unknown'}`;
        break;
      default:
        break;
    }
  }

  // Initial render
  render(state);

  // Simulate rehydrate: read pkc-data, parse, transition to ready
  try {
    const dataEl = document.getElementById(SLOT.DATA);
    const raw = dataEl?.textContent?.trim();
    if (raw) {
      const data = JSON.parse(raw);
      dispatch({ type: 'INIT_COMPLETE', container: data.container ?? null });
    } else {
      dispatch({ type: 'INIT_COMPLETE', container: null as never });
    }
  } catch (e) {
    dispatch({ type: 'INIT_ERROR', error: String(e) });
  }
}

boot();
