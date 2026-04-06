import './styles/base.css';
import { SLOT } from './runtime/contract';
import { createDispatcher } from './adapter/state/dispatcher';
import { render } from './adapter/ui/renderer';
import { bindActions } from './adapter/ui/action-binder';
import { mountEventLog } from './adapter/ui/event-log';

/**
 * PKC2 bootstrap.
 *
 * Wiring order:
 * 1. Create Dispatcher
 * 2. Get root element
 * 3. Subscribe Renderer to state changes
 * 4. Bind DOM actions → UserAction dispatch
 * 5. Mount event log (dev aid)
 * 6. Rehydrate: read pkc-data → SYS_INIT_COMPLETE
 */
function boot(): void {
  const root = document.getElementById(SLOT.ROOT);
  if (!root) {
    console.error(`[PKC2] #${SLOT.ROOT} not found`);
    return;
  }

  // 1. Dispatcher
  const dispatcher = createDispatcher();

  // 2. Renderer: state → DOM (re-renders on every state change)
  dispatcher.onState((state) => {
    render(state, root);
  });

  // 3. Action binder: DOM events → UserAction
  //    Re-bind after each render since DOM is replaced.
  //    Using event delegation on root, so a single bind is sufficient.
  bindActions(root, dispatcher);

  // 4. Event log (dev aid, appended to body outside root)
  mountEventLog(document.body, dispatcher);

  // 5. Initial render
  render(dispatcher.getState(), root);

  // 6. Rehydrate
  rehydrate(dispatcher);
}

function rehydrate(dispatcher: ReturnType<typeof createDispatcher>): void {
  try {
    const dataEl = document.getElementById(SLOT.DATA);
    const raw = dataEl?.textContent?.trim();

    if (raw && raw !== '{}') {
      const data = JSON.parse(raw);
      if (data.container) {
        dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: data.container });
        return;
      }
    }

    // Empty or missing data: create an empty container
    dispatcher.dispatch({
      type: 'SYS_INIT_COMPLETE',
      container: {
        meta: {
          container_id: crypto.randomUUID?.() ?? `pkc-${Date.now()}`,
          title: 'PKC2',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          schema_version: 1,
        },
        entries: [],
        relations: [],
        revisions: [],
        assets: {},
      },
    });
  } catch (e) {
    dispatcher.dispatch({ type: 'SYS_INIT_ERROR', error: String(e) });
  }
}

boot();
