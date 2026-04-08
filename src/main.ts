import './styles/base.css';
import { SLOT } from './runtime/contract';
import { createDispatcher } from './adapter/state/dispatcher';
import { render } from './adapter/ui/renderer';
import { bindActions, populateAttachmentPreviews, cleanupBlobUrls, flashEntry } from './adapter/ui/action-binder';
import { mountEventLog } from './adapter/ui/event-log';
import { createIDBStore } from './adapter/platform/idb-store';
import { mountPersistence, loadFromStore } from './adapter/platform/persistence';
import { exportContainerAsHtml } from './adapter/platform/exporter';
import { decompressAssets } from './adapter/platform/compression';
import { importFromFile, formatImportErrors } from './adapter/platform/importer';
import { exportContainerAsZip, importContainerFromZip } from './adapter/platform/zip-package';
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
import { folderPresenter } from './adapter/ui/folder-presenter';
import type { Dispatcher } from './adapter/state/dispatcher';
import type { ContainerStore } from './adapter/platform/idb-store';
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
  registerPresenter('folder', folderPresenter);

  // 1. Dispatcher
  const dispatcher = createDispatcher();

  // 2. Renderer: state → DOM (with scroll/focus restoration + flash feedback)
  let prevSelectedLid: string | null = null;
  let prevEntryCount = 0;

  dispatcher.onState((state) => {
    // Save scroll positions and active element info before re-render
    const sidebar = root.querySelector('[data-pkc-region="sidebar"]');
    const detail = root.querySelector('.pkc-detail');
    const sidebarScroll = sidebar?.scrollTop ?? 0;
    const detailScroll = detail?.scrollTop ?? 0;
    const focusField = document.activeElement?.getAttribute('data-pkc-field') ?? null;

    const currentCount = state.container?.entries.length ?? 0;
    const justCreated = currentCount > prevEntryCount && state.selectedLid && state.selectedLid !== prevSelectedLid;

    // Revoke preview Blob URLs before DOM replacement to prevent memory leaks
    cleanupBlobUrls(root);

    render(state, root);

    // Restore scroll positions
    const newSidebar = root.querySelector('[data-pkc-region="sidebar"]');
    const newDetail = root.querySelector('.pkc-detail');
    if (newSidebar) newSidebar.scrollTop = sidebarScroll;
    if (newDetail) newDetail.scrollTop = detailScroll;

    // Restore focus: if editing, focus the title or previously focused field
    if (state.phase === 'editing') {
      const target = focusField
        ? root.querySelector<HTMLElement>(`[data-pkc-field="${focusField}"]`)
        : root.querySelector<HTMLElement>('[data-pkc-field="title"]');
      target?.focus();
    }

    // Flash newly created entry in sidebar
    if (justCreated && state.selectedLid) {
      flashEntry(root, state.selectedLid);
    }

    prevSelectedLid = state.selectedLid;
    prevEntryCount = currentCount;

    // Populate attachment image previews (needs container.assets data)
    populateAttachmentPreviews(root, dispatcher);
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

  // 7. Export handler: when phase becomes 'exporting', run export (async for compression)
  dispatcher.onState((state) => {
    if (state.phase === 'exporting' && state.container) {
      const mode = state.exportMode ?? 'full';
      const mutability = state.exportMutability ?? 'editable';
      exportContainerAsHtml(state.container, { mode, mutability }).then((result) => {
        if (result.success) {
          console.log(`[PKC2] Exported (${mode}/${mutability}): ${result.filename} (${(result.size / 1024).toFixed(1)} KB)`);
          dispatcher.dispatch({ type: 'SYS_FINISH_EXPORT' });
        } else {
          dispatcher.dispatch({ type: 'SYS_ERROR', error: `Export failed: ${result.error}` });
        }
      });
    }
  });

  // 7b. Workspace reset: clear IDB and reload
  mountClearLocalDataHandler(root, store);

  // 8. Import handler: file input wiring (HTML + ZIP)
  mountImportHandler(root, dispatcher);

  // 8b. ZIP export handler: direct async export (no phase transition needed)
  mountZipExportHandler(root, dispatcher);

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
    const pkcData = await readPkcData();
    if (pkcData) {
      dispatcher.dispatch({
        type: 'SYS_INIT_COMPLETE',
        container: pkcData.container,
        embedded: embedCtx.embedded,
        readonly: pkcData.readonly,
        lightSource: pkcData.lightSource,
      });
      if (pkcData.lightSource) {
        console.log('[PKC2] Light export detected — IDB save suppressed');
      }
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
  lightSource: boolean;
}

async function readPkcData(): Promise<PkcDataResult | null> {
  const dataEl = document.getElementById(SLOT.DATA);
  const raw = dataEl?.textContent?.trim();
  if (!raw || raw === '{}') return null;

  const data = JSON.parse(raw);
  if (!data.container) return null;

  const isReadonly = data.export_meta?.mutability === 'readonly';
  const isLight = data.export_meta?.mode === 'light';

  let container = data.container as Container;

  // Decompress assets if they were compressed during export (gzip+base64).
  // Without this, compressed assets stored as-is would be unreadable.
  const assetEncoding = data.export_meta?.asset_encoding;
  if (assetEncoding === 'gzip+base64' && container.assets && Object.keys(container.assets).length > 0) {
    container = { ...container, assets: await decompressAssets(container.assets, assetEncoding) };
  }

  return { container, readonly: isReadonly, lightSource: isLight };
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
  fileInput.accept = '.html,.zip';
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

    // Route to appropriate importer based on file extension
    if (file.name.endsWith('.zip')) {
      const result = await importContainerFromZip(file);
      if (result.ok) {
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
        console.log(`[PKC2] ZIP import preview: ${result.source} (${result.container.entries.length} entries, ${Object.keys(result.container.assets).length} assets)`);
      } else {
        console.warn(`[PKC2] ZIP import failed: ${result.error}`);
        dispatcher.dispatch({ type: 'SYS_ERROR', error: `ZIP import failed: ${result.error}` });
      }
    } else {
      const result = await importFromFile(file);
      if (result.ok) {
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
    }
  });
}

/**
 * Mount ZIP export handler: handles export-zip clicks.
 * Directly triggers async ZIP export without phase transition.
 */
function mountZipExportHandler(root: HTMLElement, dispatcher: Dispatcher): void {
  root.addEventListener('click', async (e: Event) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-pkc-action="export-zip"]');
    if (!target) return;

    const state = dispatcher.getState();
    if (!state.container || state.phase !== 'ready') return;

    const result = await exportContainerAsZip(state.container);
    if (result.success) {
      console.log(`[PKC2] ZIP exported: ${result.filename} (${(result.size / 1024).toFixed(1)} KB)`);
    } else {
      console.warn(`[PKC2] ZIP export failed: ${result.error}`);
      dispatcher.dispatch({ type: 'SYS_ERROR', error: `ZIP export failed: ${result.error}` });
    }
  });
}

/**
 * Mount workspace reset handler: clears IDB and reloads page.
 * After clearing, the app falls back to pkc-data (embedded in HTML).
 */
function mountClearLocalDataHandler(root: HTMLElement, store: ContainerStore): void {
  root.addEventListener('click', async (e: Event) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-pkc-action="clear-local-data"]');
    if (!target) return;

    // Stage 1: explain what will happen
    const stage1 = confirm(
      '⚠ ワークスペースリセット ⚠\n\n'
      + '以下のデータがすべて削除されます:\n'
      + '• ブラウザに保存されたローカルデータ (IndexedDB)\n'
      + '• 未エクスポートの変更内容\n\n'
      + 'HTML に埋め込まれた元データから再読み込みされます。\n'
      + 'この操作は取り消せません。\n\n'
      + '続行しますか？',
    );
    if (!stage1) return;

    // Stage 2: require typed confirmation
    const typed = prompt(
      '本当に削除しますか？\n'
      + '確認のため「RESET」と入力してください:',
    );
    if (typed !== 'RESET') return;

    try {
      await store.clearAll();
      console.log('[PKC2] Local data cleared. Reloading…');
      location.reload();
    } catch (err) {
      console.error('[PKC2] Failed to clear local data:', err);
      alert('ローカルデータの削除に失敗しました。');
    }
  });
}

boot();
