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
import { mountMessageBridge } from './adapter/transport/message-bridge';
import { createHandlerRegistry } from './adapter/transport/message-handler';
import { exportRequestHandler } from './adapter/transport/export-handler';
import { recordOfferHandler } from './adapter/transport/record-offer-handler';
import { canHandleMessage } from './adapter/transport/capability';
import { buildPongProfile } from './adapter/transport/profile';
import { detectEmbedContext } from './adapter/platform/embed-detect';
import { VERSION } from './runtime/release-meta';
import { registerPresenter } from './adapter/ui/detail-presenter';
import { todoPresenter } from './adapter/ui/todo-presenter';
import { formPresenter } from './adapter/ui/form-presenter';
import { attachmentPresenter } from './adapter/ui/attachment-presenter';
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

  // 0. Register archetype presenters
  registerPresenter('todo', todoPresenter);
  registerPresenter('form', formPresenter);
  registerPresenter('attachment', attachmentPresenter);

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
      const mode = state.exportMode ?? 'full';
      const mutability = state.exportMutability ?? 'editable';
      const result = exportContainerAsHtml(state.container, { mode, mutability });
      if (result.success) {
        console.log(`[PKC2] Exported (${mode}/${mutability}): ${result.filename} (${(result.size / 1024).toFixed(1)} KB)`);
        dispatcher.dispatch({ type: 'SYS_FINISH_EXPORT' });
      } else {
        dispatcher.dispatch({ type: 'SYS_ERROR', error: `Export failed: ${result.error}` });
      }
    }
  });

  // 8. Import handler: file input wiring
  mountImportHandler(root, dispatcher);

  // 9. Message handler registry + bridge
  const registry = createHandlerRegistry();
  registry.register('export:request', exportRequestHandler);
  registry.register('record:offer', recordOfferHandler);

  // Mount bridge after init — containerId comes from state
  let bridgeHandle: ReturnType<typeof mountMessageBridge> | null = null;
  let bridgeMounted = false;

  dispatcher.onState((state) => {
    if (state.phase === 'ready' && state.container && !bridgeMounted) {
      bridgeMounted = true;
      bridgeHandle = mountMessageBridge({
        containerId: state.container.meta.container_id,
        onMessage: (envelope, origin, sourceWindow) => {
          console.log(`[PKC2] Message received: ${envelope.type} from ${origin}`);

          const currentState = dispatcher.getState();

          // Capability guard: reject messages this PKC cannot handle in current mode
          if (!canHandleMessage(envelope.type, currentState.embedded)) {
            console.warn(`[PKC2] Message "${envelope.type}" not supported (embedded=${currentState.embedded})`);
            return;
          }

          registry.route({
            envelope,
            sourceWindow,
            origin,
            container: currentState.container,
            embedded: currentState.embedded,
            dispatcher,
            sender: bridgeHandle!.sender,
          });
        },
        onReject: (_, reason) => {
          console.warn(`[PKC2] Message rejected: ${reason}`);
        },
        pongProfile: () => buildPongProfile({
          version: VERSION,
          embedded: dispatcher.getState().embedded,
        }),
      });
      console.log(`[PKC2] Message bridge mounted (container: ${state.container.meta.container_id})`);
    }
  });

  // 9b. Send record:reject when an offer is dismissed (if bridge is up)
  dispatcher.onEvent((event) => {
    if (event.type === 'OFFER_DISMISSED' && event.reply_to_id && bridgeHandle) {
      bridgeHandle.sender.send(
        window.parent,
        'record:reject',
        { offer_id: event.offer_id, reason: 'dismissed' },
        event.reply_to_id,
      );
    }
  });

  // 10. Embed detection
  const embedCtx = detectEmbedContext();
  if (embedCtx.embedded) {
    console.log(`[PKC2] Running embedded (parent origin: ${embedCtx.parentOrigin ?? 'unknown'})`);
  }

  // 11. Load data: IDB first, then pkc-data, then empty
  try {
    const { source, container: idbContainer } = await loadFromStore(store);

    if (source === 'idb' && idbContainer) {
      dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: idbContainer, embedded: embedCtx.embedded });
      return;
    }

    // Fallback: read pkc-data
    const pkcData = readPkcData();
    if (pkcData) {
      dispatcher.dispatch({
        type: 'SYS_INIT_COMPLETE',
        container: pkcData.container,
        embedded: embedCtx.embedded,
        readonly: pkcData.readonly,
      });
      return;
    }

    // Empty container
    dispatcher.dispatch({
      type: 'SYS_INIT_COMPLETE',
      container: createEmptyContainer(),
      embedded: embedCtx.embedded,
    });
  } catch (e) {
    dispatcher.dispatch({ type: 'SYS_INIT_ERROR', error: String(e) });
  }
}

interface PkcDataResult {
  container: Container;
  readonly: boolean;
}

function readPkcData(): PkcDataResult | null {
  const dataEl = document.getElementById(SLOT.DATA);
  const raw = dataEl?.textContent?.trim();
  if (!raw || raw === '{}') return null;

  const data = JSON.parse(raw);
  if (!data.container) return null;

  const isReadonly = data.export_meta?.mutability === 'readonly';
  return { container: data.container, readonly: isReadonly };
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
      // Show preview for user confirmation instead of immediate replace
      dispatcher.dispatch({
        type: 'SYS_IMPORT_PREVIEW',
        preview: {
          title: result.container.meta.title,
          container_id: result.container.meta.container_id,
          entry_count: result.container.entries.length,
          revision_count: result.container.revisions.length,
          schema_version: result.container.meta.schema_version,
          source: result.source,
          container: result.container,
        },
      });
      console.log(`[PKC2] Import preview: ${result.source} (${result.container.entries.length} entries)`);
    } else {
      const msg = formatImportErrors(result.errors);
      console.warn(`[PKC2] Import failed:\n${msg}`);
      dispatcher.dispatch({ type: 'SYS_ERROR', error: `Import failed: ${msg}` });
    }
  });
}

boot();
