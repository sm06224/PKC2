import './styles/base.css';
import { SLOT } from './runtime/contract';
import { createDispatcher } from './adapter/state/dispatcher';
import { render } from './adapter/ui/renderer';
import {
  bindActions,
  populateAttachmentPreviews,
  cleanupBlobUrls,
  flashEntry,
} from './adapter/ui/action-binder';
import { wireEntryWindowLiveRefresh } from './adapter/ui/entry-window-live-refresh';
import { wireEntryWindowViewBodyRefresh } from './adapter/ui/entry-window-view-body-refresh';
import { mountEventLog } from './adapter/ui/event-log';
import { createIDBStore } from './adapter/platform/idb-store';
import { mountPersistence, loadFromStore } from './adapter/platform/persistence';
import { exportContainerAsHtml } from './adapter/platform/exporter';
import { decompressAssets } from './adapter/platform/compression';
import { importFromFile, formatImportErrors } from './adapter/platform/importer';
import { exportContainerAsZip, importContainerFromZip } from './adapter/platform/zip-package';
import { importTextlogBundle } from './adapter/platform/textlog-bundle';
import { importTextBundle } from './adapter/platform/text-bundle';
import {
  previewBatchBundleFromBuffer,
  importBatchBundleFromBuffer,
} from './adapter/platform/batch-import';
import { serializeAttachmentBody } from './adapter/ui/attachment-presenter';
import { buildBatchImportPlan } from './features/batch-import/import-planner';
import type { PlannerInput, PlannerEntry, PlannerFolderInfo } from './features/batch-import/import-planner';
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
import { textlogPresenter } from './adapter/ui/textlog-presenter';
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
  registerPresenter('textlog', textlogPresenter);

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

  // 2b. Entry-window live refresh wiring.
  //
  // See `src/adapter/ui/entry-window-live-refresh.ts` for the
  // full contract. In brief: when the container's `assets` object
  // identity changes (attachment added / removed), every currently-
  // open entry-window child for a text / textlog entry gets a freshly
  // built preview resolver context pushed into it. The child's
  // view-pane HTML and Source textarea are never touched.
  wireEntryWindowLiveRefresh(dispatcher);

  // 2c. Entry-window view-body rerender wiring.
  //
  // Companion of the Preview wiring above. Same trigger
  // (`prev.assets !== next.assets`), disjoint effect: for every
  // open text / textlog child whose saved body contains at least
  // one `asset:` reference, the parent re-resolves the body and
  // calls `pushViewBodyUpdate`, which replaces only
  // `#body-view.innerHTML`. The Source textarea and Preview tab
  // are never touched by this wiring — Preview wiring handles the
  // Preview tab, and dirty-state policy on the child side decides
  // whether to apply the incoming view-body immediately or stash
  // it for a later flush on cancelEdit. See
  // `src/adapter/ui/entry-window-view-body-refresh.ts` for the
  // full contract.
  wireEntryWindowViewBodyRefresh(dispatcher);

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

  // 8a. Textlog bundle import handler (Issue H) — additive,
  // distinct file picker so the .textlog.zip flow is unambiguous.
  mountTextlogImportHandler(root, dispatcher);

  // 8a'. Text bundle import handler — sister of the textlog flow,
  // for `.text.zip` single-body markdown bundles. Additive with the
  // same N+1 dispatch pattern (N attachments then 1 text entry).
  mountTextImportHandler(root, dispatcher);

  // 8a''. Batch bundle import handler — reads container-wide or
  // folder-scoped export ZIPs containing multiple .text.zip /
  // .textlog.zip bundles. Additive with the same N+1 dispatch pattern
  // per nested bundle. Failure-atomic: if any nested bundle fails to
  // parse, nothing is dispatched.
  mountBatchImportHandler(root, dispatcher);

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
 * Mount textlog bundle import handler (Issue H).
 *
 * Hidden file picker dedicated to `.textlog.zip` bundles. Distinct
 * from `mountImportHandler` (which replaces the whole container)
 * because textlog bundle import is **additive**: it adds N + 1
 * new entries (one textlog + N attachments) to the current
 * container without touching anything that already exists.
 *
 * Failure atomicity (spec §14.7) is enforced by the platform
 * layer's `importTextlogBundle`: a parse failure resolves to
 * `{ ok: false, error }` and we never enter the dispatch loop.
 */
function mountTextlogImportHandler(root: HTMLElement, dispatcher: Dispatcher): void {
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  // Accept both `.textlog.zip` (the canonical extension) and bare
  // `.zip` so that users who renamed the file or whose OS strips
  // double extensions can still import.
  fileInput.accept = '.zip,.textlog.zip,application/zip';
  fileInput.style.display = 'none';
  fileInput.setAttribute('data-pkc-role', 'import-textlog-input');
  document.body.appendChild(fileInput);

  root.addEventListener('click', (e: Event) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-pkc-action="import-textlog-bundle"]');
    if (!target) return;
    const state = dispatcher.getState();
    // Belt-and-braces guard: the renderer hides the button in
    // readonly via CSS pattern, but a stale state.readonly is the
    // exact case the spec §14.10 calls out.
    if (state.readonly) {
      console.warn('[PKC2] Textlog import blocked: workspace is readonly');
      return;
    }
    if (!state.container) {
      console.warn('[PKC2] Textlog import blocked: no container loaded');
      return;
    }
    fileInput.value = '';
    fileInput.click();
  });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const result = await importTextlogBundle(file);
    if (!result.ok) {
      console.warn(`[PKC2] Textlog import failed: ${result.error}`);
      dispatcher.dispatch({ type: 'SYS_ERROR', error: `Textlog import failed: ${result.error}` });
      return;
    }

    // 1. Dispatch each attachment as its own CREATE_ENTRY +
    // COMMIT_EDIT pair. This mirrors `processFileAttachment` so
    // imported attachments behave like drag-dropped ones.
    for (const att of result.attachments) {
      dispatcher.dispatch({ type: 'CREATE_ENTRY', archetype: 'attachment', title: att.name });
      const lid = dispatcher.getState().editingLid;
      if (!lid) continue;
      const body = serializeAttachmentBody({
        name: att.name,
        mime: att.mime,
        size: att.size,
        asset_key: att.assetKey,
      });
      dispatcher.dispatch({
        type: 'COMMIT_EDIT',
        lid,
        title: att.name,
        body,
        assets: { [att.assetKey]: att.data },
      });
    }

    // 2. Dispatch the textlog entry itself.
    dispatcher.dispatch({ type: 'CREATE_ENTRY', archetype: 'textlog', title: result.textlog.title });
    const textlogLid = dispatcher.getState().editingLid;
    if (textlogLid) {
      dispatcher.dispatch({
        type: 'COMMIT_EDIT',
        lid: textlogLid,
        title: result.textlog.title,
        body: result.textlog.body,
      });
    }

    console.log(
      `[PKC2] Textlog import complete: "${result.textlog.title}"`
      + ` (${result.entryCount} rows, ${result.attachments.length} attachments)`,
    );
  });
}

/**
 * Mount text bundle import handler — sister of
 * `mountTextlogImportHandler`, for `.text.zip` single-body markdown
 * bundles. Format spec in `docs/development/text-markdown-zip-export.md`.
 *
 * Additive: the imported text + its attachments are **added** to the
 * current container, never replacing it. The dispatch order is the
 * same N + 1 pattern as the textlog path — attachments first (so
 * `container.assets` gets populated and `buildAssetMimeMap` resolves),
 * then the text entry last (so its body renders with every reference
 * already resolvable).
 *
 * Failure atomicity: any parse / format / version / missing-body.md
 * error resolves to `{ ok: false, error }` inside
 * `importTextBundle`, and we never enter the dispatch loop.
 */
function mountTextImportHandler(root: HTMLElement, dispatcher: Dispatcher): void {
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  // Accept both `.text.zip` (canonical) and bare `.zip` for the same
  // reasons the textlog path does.
  fileInput.accept = '.zip,.text.zip,application/zip';
  fileInput.style.display = 'none';
  fileInput.setAttribute('data-pkc-role', 'import-text-input');
  document.body.appendChild(fileInput);

  root.addEventListener('click', (e: Event) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-pkc-action="import-text-bundle"]');
    if (!target) return;
    const state = dispatcher.getState();
    if (state.readonly) {
      console.warn('[PKC2] Text import blocked: workspace is readonly');
      return;
    }
    if (!state.container) {
      console.warn('[PKC2] Text import blocked: no container loaded');
      return;
    }
    fileInput.value = '';
    fileInput.click();
  });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const result = await importTextBundle(file);
    if (!result.ok) {
      console.warn(`[PKC2] Text import failed: ${result.error}`);
      dispatcher.dispatch({ type: 'SYS_ERROR', error: `Text import failed: ${result.error}` });
      return;
    }

    // 1. Dispatch each attachment as its own CREATE_ENTRY + COMMIT_EDIT
    // pair. Must come BEFORE the text entry so that when the text
    // entry renders, `buildAssetMimeMap` already sees each
    // `asset_key` in `container.entries`.
    for (const att of result.attachments) {
      dispatcher.dispatch({ type: 'CREATE_ENTRY', archetype: 'attachment', title: att.name });
      const lid = dispatcher.getState().editingLid;
      if (!lid) continue;
      const body = serializeAttachmentBody({
        name: att.name,
        mime: att.mime,
        size: att.size,
        asset_key: att.assetKey,
      });
      dispatcher.dispatch({
        type: 'COMMIT_EDIT',
        lid,
        title: att.name,
        body,
        assets: { [att.assetKey]: att.data },
      });
    }

    // 2. Dispatch the text entry itself. Its body already contains
    // the rewritten asset keys.
    dispatcher.dispatch({ type: 'CREATE_ENTRY', archetype: 'text', title: result.text.title });
    const textLid = dispatcher.getState().editingLid;
    if (textLid) {
      dispatcher.dispatch({
        type: 'COMMIT_EDIT',
        lid: textLid,
        title: result.text.title,
        body: result.text.body,
      });
    }

    console.log(
      `[PKC2] Text import complete: "${result.text.title}"`
      + ` (${result.attachments.length} attachments)`,
    );
  });
}

/**
 * Mount batch bundle import handler — reads container-wide or
 * folder-scoped export ZIPs containing multiple .text.zip /
 * .textlog.zip bundles. Delegates each nested bundle to the
 * existing single-entry importers.
 *
 * Additive: imported entries are **added** to the current container.
 * Failure-atomic: if any nested bundle fails to parse, nothing is
 * dispatched and the error is surfaced via SYS_ERROR.
 *
 * Dispatch order per nested bundle: attachments first (N), then
 * the main entry (1), same as single-entry import paths.
 */
function mountBatchImportHandler(root: HTMLElement, dispatcher: Dispatcher): void {
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.zip,.textlogs.zip,.texts.zip,.mixed.zip,.folder-export.zip,application/zip';
  fileInput.style.display = 'none';
  fileInput.setAttribute('data-pkc-role', 'import-batch-input');
  document.body.appendChild(fileInput);

  // Stores the raw buffer while user reviews the preview panel.
  let pendingBuffer: ArrayBuffer | null = null;
  let pendingSource = '';

  // 1. Batch button → open file picker
  root.addEventListener('click', (e: Event) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-pkc-action="import-batch-bundle"]');
    if (!target) return;
    const state = dispatcher.getState();
    if (state.readonly) {
      console.warn('[PKC2] Batch import blocked: workspace is readonly');
      return;
    }
    if (!state.container) {
      console.warn('[PKC2] Batch import blocked: no container loaded');
      return;
    }
    fileInput.value = '';
    fileInput.click();
  });

  // 2. File selected → preview (manifest only, fast)
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    const preview = previewBatchBundleFromBuffer(buf, file.name);
    if (!preview.ok) {
      console.warn(`[PKC2] Batch import failed: ${preview.error}`);
      dispatcher.dispatch({ type: 'SYS_ERROR', error: `Batch import failed: ${preview.error}` });
      return;
    }
    pendingBuffer = buf;
    pendingSource = file.name;
    dispatcher.dispatch({ type: 'SYS_BATCH_IMPORT_PREVIEW', preview: preview.info });
  });

  // 3a. Toggle individual entry selection
  root.addEventListener('change', (e: Event) => {
    const target = e.target as HTMLElement;
    if (target.getAttribute('data-pkc-action') === 'toggle-batch-import-entry') {
      const index = Number(target.getAttribute('data-pkc-entry-index'));
      if (!Number.isNaN(index)) {
        dispatcher.dispatch({ type: 'TOGGLE_BATCH_IMPORT_ENTRY', index });
      }
    } else if (target.getAttribute('data-pkc-action') === 'toggle-all-batch-import-entries') {
      dispatcher.dispatch({ type: 'TOGGLE_ALL_BATCH_IMPORT_ENTRIES' });
    }
  });

  // 3b. Continue → full parse + dispatch selected entries only
  root.addEventListener('click', (e: Event) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-pkc-action="confirm-batch-import"]');
    if (!target || !pendingBuffer) return;

    // Read selected indices before clearing preview
    const selectedSet = new Set(
      dispatcher.getState().batchImportPreview?.selectedIndices ?? [],
    );

    const buf = pendingBuffer;
    const source = pendingSource;
    pendingBuffer = null;
    pendingSource = '';

    // Clear preview panel first
    dispatcher.dispatch({ type: 'CONFIRM_BATCH_IMPORT' });

    // Full parse
    const result = importBatchBundleFromBuffer(buf, source);
    if (!result.ok) {
      console.warn(`[PKC2] Batch import failed: ${result.error}`);
      dispatcher.dispatch({ type: 'SYS_ERROR', error: `Batch import failed: ${result.error}` });
      return;
    }

    // Map adapter types → planner input (boundary mapping)
    const plannerFolders: PlannerFolderInfo[] | undefined = result.folders?.map((f) => ({
      lid: f.lid,
      title: f.title,
      parentLid: f.parentLid,
    }));
    const plannerEntries: PlannerEntry[] = result.entries.map((e) => ({
      archetype: e.archetype,
      title: e.title,
      body: e.body,
      parentFolderLid: e.parentFolderLid,
      attachments: e.attachments.map((att) => ({
        assetKey: att.assetKey,
        data: att.data,
        name: att.name,
        mime: att.mime,
        size: att.size ?? 0,
      })),
    }));
    const plannerInput: PlannerInput = {
      entries: plannerEntries,
      folders: plannerFolders,
      source,
      format: result.format,
    };

    // Pure planning: validate folder graph + build plan
    const planResult = buildBatchImportPlan(plannerInput, selectedSet);

    if (!planResult.ok) {
      console.warn(`[PKC2] Folder graph invalid, falling back to flat import: ${planResult.error}`);
    }

    // Atomic apply: single dispatch for the entire import
    const plan = planResult.ok ? planResult.plan : planResult.fallbackPlan;
    dispatcher.dispatch({ type: 'SYS_APPLY_BATCH_IMPORT', plan });

    const selectedCount = selectedSet.size;
    const totalAttachments = plan.entries.reduce((sum, e) => sum + e.attachments.length, 0);
    const folderNote = plan.restoreStructure
      ? ` (folder-export: ${plan.folders.length} folders restored)`
      : !planResult.ok
        ? ` (folder-export: malformed metadata — flat fallback)`
        : result.format === 'pkc2-folder-export-bundle'
          ? ' (folder-export: フォルダ構造は復元されません)'
          : '';
    console.log(
      `[PKC2] Batch import complete: ${selectedCount}/${result.entries.length} entries`
      + ` (${totalAttachments} attachments) from "${source}"${folderNote}`,
    );
  });

  // 4. Cancel → clear preview
  root.addEventListener('click', (e: Event) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-pkc-action="cancel-batch-import"]');
    if (!target) return;
    pendingBuffer = null;
    pendingSource = '';
    dispatcher.dispatch({ type: 'CANCEL_BATCH_IMPORT' });
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
