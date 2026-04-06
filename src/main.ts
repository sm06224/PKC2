import './styles/base.css';
import { SLOT } from './runtime/contract';
import { createDispatcher } from './adapter/state/dispatcher';
import { render } from './adapter/ui/renderer';
import { bindActions } from './adapter/ui/action-binder';
import { mountEventLog } from './adapter/ui/event-log';
import { createIDBStore } from './adapter/platform/idb-store';
import { mountPersistence, loadFromStore } from './adapter/platform/persistence';
import { exportContainerAsHtml } from './adapter/platform/exporter';
import { importFromFile, formatImportErrors } from './adapter/platform/importer';
import type { Dispatcher } from './adapter/state/dispatcher';
import type { Container } from './core/model/container';

/**
 * PKC2 bootstrap.
 *
 * Boot priority for Container data:
 * 1. IDB (last saved state) → SYS_INIT_COMPLETE
 * 2. pkc-data element (embedded in HTML) → SYS_INIT_COMPLETE
 * 3. Empty container → SYS_INIT_COMPLETE
 * 4. All failed → SYS_INIT_ERROR
 */
async function boot(): Promise<void> {
  const root = document.getElementById(SLOT.ROOT);
  if (!root) {
    console.error(`[PKC2] #${SLOT.ROOT} not found`);
    return;
  }

  // 1. Dispatcher
  const dispatcher = createDispatcher();

  // 2. Renderer: state → DOM
  dispatcher.onState((state) => {
    render(state, root);
  });

  // 3. Action binder: DOM events → UserAction
  bindActions(root, dispatcher);

  // 4. Event log (dev aid)
  mountEventLog(document.body, dispatcher);

  // 5. Initial render (shows "initializing")
  render(dispatcher.getState(), root);

  // 6. IDB persistence
  const store = createIDBStore();
  mountPersistence(dispatcher, { store });

  // 7. Export handler: when phase becomes 'exporting', run export
  dispatcher.onState((state) => {
    if (state.phase === 'exporting' && state.container) {
      const result = exportContainerAsHtml(state.container);
      if (result.success) {
        console.log(`[PKC2] Exported: ${result.filename} (${(result.size / 1024).toFixed(1)} KB)`);
        dispatcher.dispatch({ type: 'SYS_FINISH_EXPORT' });
      } else {
        dispatcher.dispatch({ type: 'SYS_ERROR', error: `Export failed: ${result.error}` });
      }
    }
  });

  // 8. Import handler: file input wiring
  mountImportHandler(root, dispatcher);

  // 9. Load data: IDB first, then pkc-data, then empty
  try {
    const { source, container: idbContainer } = await loadFromStore(store);

    if (source === 'idb' && idbContainer) {
      dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: idbContainer });
      return;
    }

    // Fallback: read pkc-data
    const htmlContainer = readPkcData();
    if (htmlContainer) {
      dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: htmlContainer });
      return;
    }

    // Empty container
    dispatcher.dispatch({
      type: 'SYS_INIT_COMPLETE',
      container: createEmptyContainer(),
    });
  } catch (e) {
    dispatcher.dispatch({ type: 'SYS_INIT_ERROR', error: String(e) });
  }
}

function readPkcData(): Container | null {
  const dataEl = document.getElementById(SLOT.DATA);
  const raw = dataEl?.textContent?.trim();
  if (!raw || raw === '{}') return null;

  const data = JSON.parse(raw);
  return data.container ?? null;
}

function createEmptyContainer(): Container {
  return {
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
  };
}

/**
 * Mount import handler: creates hidden file input and wires
 * begin-import click → file picker → import → dispatch.
 */
function mountImportHandler(root: HTMLElement, dispatcher: Dispatcher): void {
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.html';
  fileInput.style.display = 'none';
  fileInput.setAttribute('data-pkc-role', 'import-input');
  document.body.appendChild(fileInput);

  // Listen for begin-import clicks via event delegation on root
  root.addEventListener('click', (e: Event) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-pkc-action="begin-import"]');
    if (!target) return;
    fileInput.value = '';
    fileInput.click();
  });

  // Handle file selection
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;

    const result = await importFromFile(file);

    if (result.ok) {
      dispatcher.dispatch({
        type: 'SYS_IMPORT_COMPLETE',
        container: result.container,
        source: result.source,
      });
      console.log(`[PKC2] Imported: ${result.source} (${result.container.entries.length} entries)`);
    } else {
      const msg = formatImportErrors(result.errors);
      console.warn(`[PKC2] Import failed:\n${msg}`);
      dispatcher.dispatch({ type: 'SYS_ERROR', error: `Import failed: ${msg}` });
    }
  });
}

boot();
