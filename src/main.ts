import './styles/base.css';
import { SLOT } from './runtime/contract';
import { createDispatcher } from './adapter/state/dispatcher';

/**
 * PKC2 minimal bootstrap.
 * Creates the Dispatcher and wires up state → render.
 */
function boot(): void {
  const dispatcher = createDispatcher();

  // Render on state change
  dispatcher.onState((state) => {
    const root = document.getElementById(SLOT.ROOT);
    if (!root) return;

    switch (state.phase) {
      case 'initializing':
        root.textContent = 'PKC2 initializing…';
        break;
      case 'ready':
        root.textContent = 'PKC2 ready.';
        break;
      case 'error':
        root.textContent = `PKC2 error: ${state.error ?? 'unknown'}`;
        break;
      default:
        break;
    }
  });

  // Initial render
  const root = document.getElementById(SLOT.ROOT);
  if (root) root.textContent = 'PKC2 initializing…';

  // Rehydrate: read pkc-data, parse, transition to ready
  try {
    const dataEl = document.getElementById(SLOT.DATA);
    const raw = dataEl?.textContent?.trim();
    if (raw) {
      const data = JSON.parse(raw);
      dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: data.container ?? null });
    } else {
      dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: null as never });
    }
  } catch (e) {
    dispatcher.dispatch({ type: 'SYS_INIT_ERROR', error: String(e) });
  }
}

boot();
