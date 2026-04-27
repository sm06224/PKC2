import './styles/base.css';
import { SLOT } from './runtime/contract';
import { start as profileStart, mark as profileMark } from './runtime/profile';
import { createDispatcher } from './adapter/state/dispatcher';
import { render } from './adapter/ui/renderer';
import { computeRenderScope } from './adapter/ui/render-scope';
import type { AppState } from './adapter/state/app-state';
import { createLocationNavTracker } from './adapter/ui/location-nav';
import { preferredEditFocusSelector } from './adapter/ui/edit-focus';
import {
  captureRenderContinuity,
  restoreRenderContinuity,
} from './adapter/ui/render-continuity';
import {
  bindActions,
  populateAttachmentPreviews,
  populateInlineAssetPreviews,
  cleanupBlobUrls,
  flashEntry,
} from './adapter/ui/action-binder';
import { wireEntryWindowLiveRefresh } from './adapter/ui/entry-window-live-refresh';
import { wireEntryWindowViewBodyRefresh } from './adapter/ui/entry-window-view-body-refresh';
import { wireEntryWindowTitleRefresh } from './adapter/ui/entry-window-title-refresh';
import { wireEventLogToConsole } from './adapter/ui/event-log';
import { createIDBStore, probeIDBAvailability } from './adapter/platform/idb-store';
import {
  showIdbWarningBanner,
  showIdbSaveFailureBanner,
  classifySaveError,
} from './adapter/platform/idb-warning-banner';
import { mountPersistence, loadFromStore } from './adapter/platform/persistence';
import {
  loadCollapsedFolders,
  saveCollapsedFolders,
} from './adapter/platform/folder-prefs';
import { readPkcData, chooseBootSource, finalizeChooserChoice } from './adapter/platform/pkc-data-source';
import { showBootSourceChooser } from './adapter/ui/boot-source-chooser';
import {
  estimateStorage,
  bootWarningMessage,
} from './adapter/platform/storage-estimate';
import { showToast } from './adapter/ui/toast';
import { summarizeZipImportWarnings } from './adapter/ui/zip-import-warnings';
import { exportContainerAsHtml } from './adapter/platform/exporter';
import { importFromFile, formatImportErrors } from './adapter/platform/importer';
import { exportContainerAsZip, importContainerFromZip } from './adapter/platform/zip-package';
import { pickEntryPackageTarget } from './adapter/platform/entry-package-router';
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
import {
  recordOfferHandler,
  getReplyWindowForOffer,
  clearReplyWindowForOffer,
} from './adapter/transport/record-offer-handler';
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
import { applyExternalPermalinkOnBoot } from './adapter/ui/external-permalink-receive';
import { setLinkMigrationDialogDispatcher } from './adapter/ui/link-migration-dialog';
import type { Dispatcher } from './adapter/state/dispatcher';
import type { ContainerStore } from './adapter/platform/idb-store';
import type { Container } from './core/model/container';
import { mergeSystemEntries } from './core/model/container';
import { SETTINGS_LID } from './core/model/record';
import { resolveSettingsPayload } from './core/model/system-settings-payload';

/**
 * PKC2 bootstrap.
 *
 * Boot priority for Container data (see `pkc-data-source.ts` for the
 * `chooseBootSource` pure helper and the rationale):
 * 1. pkc-data element (embedded in exported HTML) → SYS_INIT_COMPLETE
 * 2. IDB (last saved state) → SYS_INIT_COMPLETE
 * 3. Empty container → SYS_INIT_COMPLETE
 * 4. All failed → SYS_INIT_ERROR
 */
async function boot(): Promise<void> {
  // PR #176 profile wave: mark boot enter/exit; the bench computes
  // boot:enter → boot:exit duration. Marks (vs measures) avoid
  // having to thread an `end()` thunk past every early return.
  profileMark('boot:enter');
  const root = document.getElementById(SLOT.ROOT);
  if (!root) {
    console.error(`[PKC2] #${SLOT.ROOT} not found`);
    profileMark('boot:exit');
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

  // Phase 2 Slice 2 — the Normalize PKC links preview dialog needs
  // to dispatch CLOSE_LINK_MIGRATION_DIALOG from its backdrop click
  // handler (and from the defensive "no container" guard inside the
  // state-sync step). Register the dispatcher once at boot so the
  // module does not have to plumb it through every render call.
  setLinkMigrationDialogDispatcher(dispatcher);

  // 2. Renderer: state → DOM (with scroll/focus restoration + flash feedback)
  let prevSelectedLid: string | null = null;
  let prevEntryCount = 0;
  // PR #177: track the last state we passed to `render()` so the
  // renderer can compute its scope and short-circuit when nothing
  // visible changed. Stays `null` until the FIRST render so that
  // initial mount keeps the existing full-shell behaviour.
  let prevRenderState: AppState | null = null;
  // S-18 (A-4 FULL, 2026-04-14): sub-location navigation post-render
  // effect. The tracker compares the `ticket` in state.pendingNav
  // against the last-seen value and fires the scroll + highlight
  // only on ticket advances. Must be declared outside the onState
  // closure so its internal `lastTicket` survives between ticks.
  const locationNavTracker = createLocationNavTracker();

  dispatcher.onState((state) => {
    // PR #177: scope-driven short-circuit so the renderer subscriber
    // skips the full pre/post-render hook chain (continuity capture,
    // blob cleanup, attachment-preview hydration, etc) when the
    // delta is render-irrelevant. The renderer itself ALSO bails on
    // its scope check below; the duplicate guard here is so the
    // subscriber's surrounding work (which the renderer doesn't
    // know about) doesn't fire either.
    const renderScope = computeRenderScope(state, prevRenderState);

    if (renderScope === 'none') {
      // Render-irrelevant dispatch — but post-render side effects
      // that watch other state slices (sub-location scroll ticket)
      // still need to run. Settings-only also skips the heavy
      // hooks — applySystemSettings is idempotent on root attrs.
      locationNavTracker.consume(root, state.pendingNav ?? null);
      prevRenderState = state;
      return;
    }
    if (renderScope === 'settings-only') {
      render(state, root, prevRenderState);
      locationNavTracker.consume(root, state.pendingNav ?? null);
      prevRenderState = state;
      return;
    }
    if (renderScope === 'sidebar-only') {
      // PR #178: replace just the sidebar subtree. Continuity
      // capture + restore is still needed because the search input
      // (focus + caret) lives inside the sidebar and gets replaced.
      // populateAttachmentPreviews walks ALL `[data-pkc-asset-key]`
      // images including the sidebar entry rows, so it runs here.
      // populateInlineAssetPreviews scans center-pane markdown
      // bodies which are NOT replaced — skip it. cleanupBlobUrls
      // touches center-pane preview Blobs and is also center-only.
      const continuity = captureRenderContinuity(root);
      render(state, root, prevRenderState);
      restoreRenderContinuity(root, continuity);
      populateAttachmentPreviews(root, dispatcher);
      locationNavTracker.consume(root, state.pendingNav ?? null);
      prevRenderState = state;
      return;
    }

    // A-1 / A-2 (2026-04-23): continuity capture runs BEFORE the
    // full re-render wipes `root.innerHTML`. The helper records
    // scroll positions of every `data-pkc-region` scroller, and
    // the focused element + caret when present. Restoration after
    // render is a silent no-op when the target is no longer in
    // the DOM, so this is safe to run unconditionally.
    //
    // Replaces the previous hand-rolled capture that matched
    // `.pkc-detail` (a class that was renamed to
    // `.pkc-center-content` without updating this hook — the
    // center pane scroll was therefore never actually restored,
    // which is why markdown-checklist clicks snapped to the top
    // of the page).
    const continuity = captureRenderContinuity(root);

    const currentCount = state.container?.entries.length ?? 0;
    const justCreated = currentCount > prevEntryCount && state.selectedLid && state.selectedLid !== prevSelectedLid;

    // Revoke preview Blob URLs before DOM replacement to prevent memory leaks
    cleanupBlobUrls(root);

    render(state, root, prevRenderState);

    restoreRenderContinuity(root, continuity);

    // Edit-mode focus default: when NOTHING was focused before the
    // re-render and we've just entered edit mode, point the caret
    // at the archetype's main body/description field. Falls back
    // to the title when no body field is available. This preserves
    // S1 (2026-04-22): the non-B4 textlog path still lets its
    // explicit `beginLogEdit` focus win because it runs before
    // this branch on the same tick.
    if (!continuity.focus && state.phase === 'editing') {
      const editingEntry = state.editingLid && state.container
        ? state.container.entries.find((e) => e.lid === state.editingLid) ?? null
        : null;
      const bodyFieldSelector = preferredEditFocusSelector(editingEntry?.archetype);
      const target =
        (bodyFieldSelector ? root.querySelector<HTMLElement>(bodyFieldSelector) : null)
        ?? root.querySelector<HTMLElement>('[data-pkc-field="title"]');
      target?.focus();
    }

    // Flash newly created entry in sidebar
    if (justCreated && state.selectedLid) {
      flashEntry(root, state.selectedLid);
    }

    // S-18 (A-4 FULL): sub-location scroll + highlight. Runs AFTER
    // render so `pendingNav.subId` resolves against the just-mounted
    // DOM. Ticket gating prevents re-fire on unrelated re-renders.
    locationNavTracker.consume(root, state.pendingNav ?? null);

    prevSelectedLid = state.selectedLid;
    prevEntryCount = currentCount;
    prevRenderState = state;

    // Populate attachment image previews (needs container.assets data)
    populateAttachmentPreviews(root, dispatcher);
    // Populate inline asset previews for non-image chips in rendered markdown
    populateInlineAssetPreviews(root, dispatcher);
  });

  // 2a-A4. Collapsed-folder persistence (viewer-local). Writes
  // through to localStorage whenever `state.collapsedFolders`
  // changes identity. Reducer cases `TOGGLE_FOLDER_COLLAPSE`,
  // `SELECT_ENTRY` / `NAVIGATE_TO_LOCATION` (with
  // `revealInSidebar`), and `RESTORE_COLLAPSED_FOLDERS` all
  // produce new array identities only when the set actually
  // changes, so `prev !== curr` reliably gates writes. Keyed by
  // `container_id` so multiple containers in the same browser
  // keep independent fold state. See `folder-prefs.ts`.
  let prevCollapsedFolders: string[] | null = null;
  let prevContainerId: string | null = null;
  dispatcher.onState((state) => {
    const cid = state.container?.meta?.container_id ?? null;
    const curr = state.collapsedFolders;
    const containerSwitched = cid !== prevContainerId;
    if (containerSwitched) {
      // First tick for this container — take the current fold
      // state as baseline, do not write (the restore dispatch
      // already reflects persisted state). This also handles
      // legitimate switches between containers without flushing
      // one's fold state over another's.
      prevContainerId = cid;
      prevCollapsedFolders = curr;
      return;
    }
    if (curr !== prevCollapsedFolders && cid) {
      saveCollapsedFolders(cid, curr);
      prevCollapsedFolders = curr;
    }
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

  // 2d. Entry-window title refresh wiring.
  //
  // Third of three live-refresh wires. Whenever an open
  // entry-window child's host entry has its `title` field changed
  // by the reducer (e.g. the user renamed the entry from the main
  // window), the parent pushes the new title via
  // `pushTitleUpdate`. The child applies it to `document.title`,
  // `#title-display`, and the script's `originalTitle` variable —
  // but only when it is not currently editing; edit-mode pushes
  // are stashed into `pendingTitle` and flushed on cancelEdit so
  // the user's in-progress rename is never stomped. See
  // `src/adapter/ui/entry-window-title-refresh.ts` and
  // `docs/development/entry-window-title-live-refresh-v1.md`.
  wireEntryWindowTitleRefresh(dispatcher);

  // 3. Action binder: DOM events → UserAction
  bindActions(root, dispatcher);

  // 4. Event log (dev aid). Was a fixed-position UI tray in the
  // bottom-right corner; demoted to `console.log` per 2026-04-26
  // user request because end users have no use for the tray and it
  // occupied screen real estate. Devs can still inspect events
  // through the browser console.
  wireEventLogToConsole(dispatcher);

  // 5. Initial render (shows "initializing")
  render(dispatcher.getState(), root);

  // 6. IDB persistence
  //
  // `onError` surfaces runtime save failures (QuotaExceededError,
  // transaction aborts, generic put() rejections) as a separate
  // non-blocking banner (`[data-pkc-region="idb-save-warning"]`). The
  // banner is idempotent per-region, so repeated failures update the
  // reason string on the existing banner rather than stacking. See
  // docs/development/idb-availability.md § "Runtime save failure".
  const store = createIDBStore();
  mountPersistence(dispatcher, {
    store,
    onError: (err) => {
      // Surface the failure AND give the user a one-click escape
      // hatch: "Export Now" inside the banner triggers the existing
      // BEGIN_EXPORT action so they can back up the container to a
      // single-HTML file before the next edit is also lost.
      showIdbSaveFailureBanner({
        reason: classifySaveError(err),
        onExport: () =>
          dispatcher.dispatch({
            type: 'BEGIN_EXPORT',
            mode: 'full',
            mutability: 'editable',
          }),
      });
    },
  });

  // 6a. IDB availability probe — warn the user if persistence is
  // silently broken (file:// on some browsers, private-browsing, etc.).
  // Non-blocking: boot continues regardless, the banner just signals
  // that changes won't survive a reload.
  // See docs/development/idb-availability.md.
  void probeIDBAvailability().then((status) => {
    if (!status.available) {
      console.warn(
        `[PKC2] IndexedDB unavailable — persistence disabled. Reason: ${status.reason ?? 'unknown'}`,
      );
      showIdbWarningBanner({ reason: status.reason });
    }
  });

  // 6b. Storage capacity preflight — best-effort read of
  // `navigator.storage.estimate()` so we can warn BEFORE a save
  // or large attachment hits the browser quota wall. Non-blocking;
  // silent on engines that don't expose the API; sticky toast (no
  // auto-dismiss) with an Export Now escape hatch when triggered.
  // See docs/development/idb-availability.md § "Storage capacity
  // preflight".
  void estimateStorage().then((result) => {
    const msg = bootWarningMessage(result);
    if (!msg) return;
    console.warn(`[PKC2] Storage preflight: ${msg}`);
    showToast({
      message: msg,
      kind: 'warn',
      // Keep the toast visible until the user acts — the boot-time
      // warning is a "you might want to export now" hint, not a
      // transient event.
      autoDismissMs: 0,
      onExport: () =>
        dispatcher.dispatch({
          type: 'BEGIN_EXPORT',
          mode: 'full',
          mutability: 'editable',
        }),
    });
  });

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

  // 8a'''. Unified single-entry package import handler — auto-detects
  // `.text.zip` vs `.textlog.zip` by filename and delegates to the
  // existing dedicated importers by re-dispatching a synthetic click.
  // See docs/development/selected-entry-export-and-reimport.md.
  mountEntryPackageImportHandler(root);

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
        // Explicit allowlist closes the accept-all default per
        // `docs/spec/record-offer-capture-profile.md` §9.1. v0
        // policy: same-origin only. When `window.location.origin`
        // evaluates to `"null"` (e.g. `file://` distribution), that
        // string is still added — this is an explicit opt-in at the
        // mount site (§9.2). Cross-origin embedded / extension flows
        // are a follow-up; add their origin here when wired.
        allowedOrigins: [window.location.origin],
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

  // 9b. Route `record:reject` (on dismiss) and reply-window cleanup (on
  // accept). The sender window for each offer is stashed by
  // `recordOfferHandler` in the transport-memory registry; here we look
  // it up by `offer_id` so the reject envelope travels to the exact
  // iframe / window that sent the offer (spec §3.2 source-window rule).
  // Falling back to `window.parent` keeps the previous behavior for
  // historical offers received before PR-C (registry empty case) and
  // for any non-iframe debug harness, but in standard
  // "PKC2 hosts companion iframe" deployments the lookup is the path
  // that actually reaches the sender.
  dispatcher.onEvent((event) => {
    if (event.type === 'OFFER_DISMISSED' && event.reply_to_id && bridgeHandle) {
      const target = getReplyWindowForOffer(event.offer_id) ?? window.parent;
      bridgeHandle.sender.send(
        target,
        'record:reject',
        { offer_id: event.offer_id, reason: 'dismissed' },
        event.reply_to_id,
      );
      clearReplyWindowForOffer(event.offer_id);
    }
    if (event.type === 'OFFER_ACCEPTED') {
      // No outbound message on accept (spec §7.3 — `record:accept` is
      // a reserved type, not wired in v1), but we still need to drop
      // the registry entry so the Map does not grow unbounded.
      clearReplyWindowForOffer(event.offer_id);
    }
  });

  // 10. Embed detection
  const embedCtx = detectEmbedContext();
  if (embedCtx.embedded) {
    console.log(`[PKC2] Running embedded (parent origin: ${embedCtx.parentOrigin ?? 'unknown'})`);
  }

  // 11. Load data — revised boot source policy (2026-04-16, see
  // `docs/development/boot-container-source-policy-revision.md`).
  //
  //   1. pkc-data AND IDB both present → chooser modal
  //   2. pkc-data only → boot pkc-data with `viewOnlySource = true`
  //      (IDB save suppressed; explicit Import is the promotion gate)
  //   3. IDB only → boot IDB normally
  //   4. Neither → empty container
  //
  // Prior revision (S-24, 2026-04-16) flipped precedence so exported
  // HTMLs would at least display their own content, but an implicit
  // save cycle still wrote that embedded container into the viewer's
  // IndexedDB. This policy closes that hole: embedded pkc-data is
  // treated as a view-only snapshot, and IDB is never written to
  // unless the user explicitly imports.
  //
  // Embedded-iframe context bypasses the chooser (embedded PKC2 has
  // parent-driven data flow; the chooser would confuse that UX).
  try {
    const endReadPkcData = profileStart('boot:readPkcData');
    const pkcData = await readPkcData();
    endReadPkcData();
    const endLoadFromStore = profileStart('boot:loadFromStore');
    const { container: idbContainer } = await loadFromStore(store);
    endLoadFromStore();
    let chosen = chooseBootSource(pkcData, idbContainer);

    if (chosen.source === 'chooser') {
      if (embedCtx.embedded) {
        // Embedded iframe: fall back to pkc-data priority silently.
        // Chooser UX doesn't fit cross-origin embed scenarios.
        chosen = finalizeChooserChoice(
          chosen.pkcData!,
          chosen.idbContainer!,
          'pkc-data',
        );
      } else {
        const choice = await showBootSourceChooser({
          host: document.body,
          chooser: chosen,
        });
        chosen = finalizeChooserChoice(
          chosen.pkcData!,
          chosen.idbContainer!,
          choice,
        );
      }
    }

    switch (chosen.source) {
      case 'pkc-data': {
        const container = chosen.container!;
        dispatcher.dispatch({
          type: 'SYS_INIT_COMPLETE',
          container,
          embedded: embedCtx.embedded,
          readonly: chosen.readonly,
          lightSource: chosen.lightSource,
          viewOnlySource: chosen.viewOnlySource,
        });
        restoreSettingsFromContainer(dispatcher, container);
        restoreCollapsedFoldersForContainer(dispatcher, container);
        applyExternalPermalinkOnBoot(dispatcher, container, undefined, { root });
        if (chosen.lightSource) {
          console.log('[PKC2] Light export detected — IDB save suppressed');
        }
        if (chosen.viewOnlySource) {
          console.log('[PKC2] Embedded pkc-data booted as view-only — IDB save suppressed until explicit Import');
        }
        return;
      }
      case 'idb': {
        const container = mergeSystemEntries(
          chosen.container!,
          chosen.systemEntriesFromPkcData ?? [],
        );
        dispatcher.dispatch({
          type: 'SYS_INIT_COMPLETE',
          container,
          embedded: embedCtx.embedded,
        });
        restoreSettingsFromContainer(dispatcher, container);
        restoreCollapsedFoldersForContainer(dispatcher, container);
        applyExternalPermalinkOnBoot(dispatcher, container, undefined, { root });
        return;
      }
      case 'empty': {
        const container = mergeSystemEntries(
          createEmptyContainer(),
          chosen.systemEntriesFromPkcData ?? [],
        );
        dispatcher.dispatch({
          type: 'SYS_INIT_COMPLETE',
          container,
          embedded: embedCtx.embedded,
        });
        restoreSettingsFromContainer(dispatcher, container);
        restoreCollapsedFoldersForContainer(dispatcher, container);
        applyExternalPermalinkOnBoot(dispatcher, container, undefined, { root });
        return;
      }
    }
  } catch (e) {
    dispatcher.dispatch({ type: 'SYS_INIT_ERROR', error: String(e) });
  } finally {
    // PR #176 profile wave: emit boot:exit on every path including
    // the early-`return` inside the chooser switch. Without the
    // `finally` the trailing mark below was unreachable and the
    // bench `waitForBoot()` hung waiting for it.
    profileMark('boot:exit');
  }
}

/**
 * FI-Settings v1 (2026-04-18): after SYS_INIT_COMPLETE, resolve the
 * reserved `__settings__` entry from the booted container and dispatch
 * RESTORE_SETTINGS. Per the load contract §3.1, a missing / malformed /
 * wrong-archetype entry falls back to SETTINGS_DEFAULTS — the resolver
 * handles this invisibly, so we always get a valid payload to dispatch.
 * The action does not emit SETTINGS_CHANGED (boot replay is not a user
 * modification) so persistence stays quiet.
 */
function restoreSettingsFromContainer(
  dispatcher: Dispatcher,
  container: Container,
): void {
  const entry = container.entries.find(
    (e) => e.lid === SETTINGS_LID && e.archetype === 'system-settings',
  );
  const settings = resolveSettingsPayload(entry?.body);
  dispatcher.dispatch({ type: 'RESTORE_SETTINGS', settings });
}

/**
 * A-4 (2026-04-23): after SYS_INIT_COMPLETE, hydrate
 * `state.collapsedFolders` from the viewer-local folder-prefs
 * store, keyed by `container_id`. This is a runtime UI preference
 * — nothing is ever written back into the container — so the
 * dispatch is silent (no event emitted by the reducer).
 */
function restoreCollapsedFoldersForContainer(
  dispatcher: Dispatcher,
  container: Container,
): void {
  const cid = container.meta?.container_id ?? '';
  if (!cid) return;
  const lids = loadCollapsedFolders(cid);
  if (lids.length === 0) return;
  dispatcher.dispatch({ type: 'RESTORE_COLLAPSED_FOLDERS', lids });
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
        // Surface ZIP import warnings (P0-5 → UI).
        //
        // Success is not blocked; the preview dispatch above already
        // moved the user forward. The toast is a non-blocking
        // affordance so the user is told "some parts of the ZIP
        // needed adjustments" — think of it as the ZIP-layer
        // equivalent of a spell-checker squiggle. Operators get the
        // full structured detail on the console so post-hoc audits
        // do not lose information. See `docs/spec/data-model.md`
        // §11.7 for the collision policy the warnings describe.
        const summary = summarizeZipImportWarnings(result.warnings);
        if (summary.summary) {
          showToast({ message: summary.summary, kind: 'warn' });
          for (const line of summary.details) {
            console.warn(`[PKC2] ZIP import warning: ${line}`);
          }
        }
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
 * bundles. Format spec in `docs/development/completed/text-markdown-zip-export.md`.
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

  // 3a. Toggle individual entry selection / target folder change
  root.addEventListener('change', (e: Event) => {
    const target = e.target as HTMLElement;
    if (target.getAttribute('data-pkc-action') === 'toggle-batch-import-entry') {
      const index = Number(target.getAttribute('data-pkc-entry-index'));
      if (!Number.isNaN(index)) {
        dispatcher.dispatch({ type: 'TOGGLE_BATCH_IMPORT_ENTRY', index });
      }
    } else if (target.getAttribute('data-pkc-action') === 'toggle-all-batch-import-entries') {
      dispatcher.dispatch({ type: 'TOGGLE_ALL_BATCH_IMPORT_ENTRIES' });
    } else if (target.getAttribute('data-pkc-action') === 'set-batch-import-target-folder') {
      const lid = (target as HTMLSelectElement).value || null;
      dispatcher.dispatch({ type: 'SET_BATCH_IMPORT_TARGET_FOLDER', lid });
    }
  });

  // 3b. Continue → full parse + dispatch selected entries only
  root.addEventListener('click', (e: Event) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-pkc-action="confirm-batch-import"]');
    if (!target || !pendingBuffer) return;

    // Read selected indices and target folder before clearing preview
    const previewState = dispatcher.getState().batchImportPreview;
    const selectedSet = new Set(previewState?.selectedIndices ?? []);
    const targetFolderLid = previewState?.targetFolderLid ?? null;

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
      targetFolderLid,
    };

    // Pure planning: validate folder graph + build plan
    const planResult = buildBatchImportPlan(plannerInput, selectedSet);

    if (!planResult.ok) {
      console.warn(`[PKC2] Folder graph invalid, falling back to flat import: ${planResult.error}`);
    }

    // Atomic apply: single dispatch for the entire import
    const plan = planResult.ok ? planResult.plan : planResult.fallbackPlan;
    dispatcher.dispatch({ type: 'SYS_APPLY_BATCH_IMPORT', plan });

    // Log result from reducer-computed summary
    const summary = dispatcher.getState().batchImportResult;
    if (summary) {
      const attNote = summary.attachmentCount > 0 ? ` (${summary.attachmentCount} attachments)` : '';
      const modeNote = summary.restoreStructure ? ` — ${summary.folderCount} folders restored` : ' — flat import';
      const fallbackNote = summary.fallbackToRoot
        ? ` — target folder${summary.intendedDestination ? ` "${summary.intendedDestination}"` : ''} was unavailable, imported to root`
        : '';
      const planWarning = !planResult.ok ? ' — malformed folder metadata, flat fallback' : '';
      console.log(
        `[PKC2] Batch import complete: ${summary.entryCount}${attNote}`
        + ` to "${summary.actualDestination}" from "${summary.source}"${modeNote}${fallbackNote}${planWarning}`,
      );
    }
  });

  // 4. Cancel → clear preview
  root.addEventListener('click', (e: Event) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-pkc-action="cancel-batch-import"]');
    if (!target) return;
    pendingBuffer = null;
    pendingSource = '';
    dispatcher.dispatch({ type: 'CANCEL_BATCH_IMPORT' });
  });

  // 5. Dismiss result banner
  root.addEventListener('click', (e: Event) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-pkc-action="dismiss-batch-import-result"]');
    if (!target) return;
    dispatcher.dispatch({ type: 'DISMISS_BATCH_IMPORT_RESULT' });
  });
}

/**
 * Mount the unified single-entry package import handler.
 *
 * Clicking the Data menu's `📥 Entry` button opens a single file
 * picker that accepts both `.text.zip` and `.textlog.zip`. The file
 * chosen is then routed to the dedicated text / textlog importer by
 * re-dispatching a synthetic click on the corresponding hidden input
 * — no duplicated import logic, no reducer change.
 *
 * Routing rules (filename only, parsed right-to-left):
 *   - ends with `.text.zip`    → text bundle importer
 *   - ends with `.textlog.zip` → textlog bundle importer
 *   - otherwise: surface a toast-style console warning (no dispatch).
 *
 * The dedicated importers already assert their own manifest.format
 * guard, so a mis-named file still fails closed with a helpful error.
 */
function mountEntryPackageImportHandler(root: HTMLElement): void {
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.zip,.text.zip,.textlog.zip,application/zip';
  fileInput.style.display = 'none';
  fileInput.setAttribute('data-pkc-role', 'import-entry-package-input');
  document.body.appendChild(fileInput);

  root.addEventListener('click', (e: Event) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>(
      '[data-pkc-action="import-entry-package"]',
    );
    if (!target) return;
    fileInput.value = '';
    fileInput.click();
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    // Route by filename — the dedicated importers' hidden file inputs
    // already accept DataTransfer-style uploads via `.files` assignment,
    // but the cleanest cross-browser path is to re-open the matching
    // picker with a programmatic click after staging the file.
    const target = pickEntryPackageTarget(file.name);
    if (!target) {
      console.warn(
        `[PKC2] Entry package import: unrecognized extension for "${file.name}". Expected .text.zip or .textlog.zip.`,
      );
      return;
    }
    // Hand the file off by assigning it to the target's hidden input
    // and firing its change event. Keeps the dispatch / dedupe logic
    // owned by the dedicated handler.
    const targetInput = document.querySelector<HTMLInputElement>(
      `input[data-pkc-role="${target}"]`,
    );
    if (!targetInput) {
      console.warn(`[PKC2] Entry package import: target input "${target}" not mounted.`);
      return;
    }
    const dt = new DataTransfer();
    dt.items.add(file);
    targetInput.files = dt.files;
    targetInput.dispatchEvent(new Event('change'));
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
