import './styles/base.css';
import { SLOT } from './runtime/contract';
import { start as profileStart, mark as profileMark } from './runtime/profile';
import {
  currentDispatchSeq,
  isRecordingEnabled,
  nextDispatchSeq,
  recordDebugError,
  recordDebugEvent,
  refreshStorageEstimate,
} from './runtime/debug-flags';
import { createDispatcher } from './adapter/state/dispatcher';
import { render } from './adapter/ui/renderer';
import { computeRenderScope } from './adapter/ui/render-scope';
import { getFilterIndexes } from './adapter/ui/filter-cache';
import type { AppState } from './adapter/state/app-state';
import { createLocationNavTracker } from './adapter/ui/location-nav';
import { preferredEditFocusSelector } from './adapter/ui/edit-focus';
import {
  captureRenderContinuity,
  restoreRenderContinuity,
} from './adapter/ui/render-continuity';
import { installCaretIndicator } from './adapter/ui/caret-indicator';
import { installHtmlSandboxResizer } from './features/markdown/html-sandbox';
import { exposeAstApi } from './adapter/public-ast-api';
// user bug 2026-05-28:MW(entry-window)からの screenshot paste も asset 埋め込み化。
import { exposePasteApi } from './adapter/ui/expose-paste-api';
import {
  installBootReadySignal,
  signalBootReady,
} from './adapter/boot-ready-signal';
import { installWcagResolverRuntime, applyWcagResolverNow } from './adapter/ui/wcag-runtime';
import { checkForUpdate } from './adapter/platform/version-check';
import { decodeSnapshotParam, snapshotToEntryDraft } from './features/snapshot/intake';
import { isSnapshot } from './features/snapshot/types';
import {
  bindActions,
  populateAttachmentPreviews,
  populateInlineAssetPreviews,
  cleanupBlobUrls,
  flashEntry,
} from './adapter/ui/action-binder';
import { wireEntryWindowLiveRefresh } from './adapter/ui/entry-window-live-refresh';
import { registerBuiltinCommands } from './adapter/ui/command-palette-builtins';
import { registerBuiltinKeymaps } from './adapter/ui/keymap-binder';
import { wireTabStrip, restoreTabState } from './adapter/ui/tab-strip';
import { wireEntryWindowViewBodyRefresh } from './adapter/ui/entry-window-view-body-refresh';
import { wireEntryWindowTitleRefresh } from './adapter/ui/entry-window-title-refresh';
import { wireEntryWindowMonitorRefresh } from './adapter/ui/entry-window-monitor-refresh';
import { wireWindowLayoutRestore } from './adapter/ui/window-layout-restore-prompt';
import { getOpenEntryWindowLids, setEntryWindowsChangedListener, setEntryWindowCurrentContainer } from './adapter/ui/entry-window';
import { installMainReloadGuard } from './adapter/ui/main-reload-guard';
import { wireEventLogToConsole } from './adapter/ui/event-log';
import { probeIDBAvailability } from './adapter/platform/idb-store';
import { createConfiguredStoreFromEnv } from './adapter/platform/storage-backend';
import {
  ensureDefaultWorkspace,
  activeWorkspaceContainers,
  switchActiveContainer,
  addContainerToActiveWorkspace,
  removeContainerFromActiveWorkspace,
  switchWorkspace,
  createWorkspace,
  renameWorkspace,
} from './adapter/platform/workspace';
import {
  showIdbWarningBanner,
  showIdbSaveFailureBanner,
  classifySaveError,
} from './adapter/platform/idb-warning-banner';
import { mountPersistence, loadFromStore } from './adapter/platform/persistence';
import { registerExportStore } from './adapter/platform/idb-store';
import { mountWorkingSet } from './adapter/platform/asset-working-set';
import { mountNavHistory } from './adapter/ui/nav-history';
import {
  loadCollapsedFolders,
  saveCollapsedFolders,
} from './adapter/platform/folder-prefs';
import { loadEditMode } from './adapter/platform/edit-mode-prefs';
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
import { mountMessageBridge, pinTargetOrigin } from './adapter/transport/message-bridge';
import { createHandlerRegistry, type MessageHandlerRegistry } from './adapter/transport/message-handler';
import { exportRequestHandler } from './adapter/transport/export-handler';
import {
  recordOfferHandler,
  getReplyTargetForOffer,
  clearReplyWindowForOffer,
} from './adapter/transport/record-offer-handler';
import { findThumbnailHttpUrl } from './features/auto-fill/thumbnail-frontmatter';
import { fetchImageAsBase64 } from './adapter/platform/fetch-image-asset';
import {
  parseCaptureJson,
  isCaptureJsonFilename,
} from './features/auto-fill/parse-capture-json';
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
// 領域 10-4 spreadsheet archetype Phase 1(2026-05-28、user direction #4)
import { spreadsheetPresenter } from './adapter/ui/spreadsheet-presenter';
import { applyExternalPermalinkOnBoot } from './adapter/ui/external-permalink-receive';
import { setLinkMigrationDialogDispatcher } from './adapter/ui/link-migration-dialog';
import type { Dispatcher } from './adapter/state/dispatcher';
import { autostartPkcExtensions } from './adapter/ui/pkc-extension-startup';
import type { ContainerStore } from './adapter/platform/idb-store';
import type { Container } from './core/model/container';
import { mergeSystemEntries } from './core/model/container';
import { SETTINGS_LID } from './core/model/record';
import { resolveSettingsPayload } from './core/model/system-settings-payload';
import { resolveFlagsPayload } from './core/model/system-flags-payload';
import { setContainerFlagSource } from './adapter/flags';
import { applyThemeScale } from './adapter/ui/theme-scale';

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
  // Smoke test boot signal (2026-05-18):smoke test が「真の boot 完了」を
  // 待つための Promise を window.PKC.bootReady に install。boot 開始前に
  // install することで、test が先に navigate + await しても miss しない。
  // resolve は SYS_INIT_COMPLETE 後の初回 render 完了時に 1 回だけ発火。
  // 詳細は src/adapter/boot-ready-signal.ts。
  installBootReadySignal();
  // Reform-2026-05 stage β finalize: install error capture FIRST so
  // boot-time crashes land in the debug ring buffer. Cheap when no
  // ?pkc-debug flag is active (the recordDebugError ring buffer is
  // module-scoped and the wrappers are no-ops in that case). Also
  // kick off a one-shot navigator.storage.estimate() so the report
  // can carry quota numbers without a Promise round-trip at click time.
  installDebugErrorCapture();
  void refreshStorageEstimate();
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
  // 領域 10-4 spreadsheet archetype Phase 1(2026-05-28、user direction #4)
  registerPresenter('spreadsheet', spreadsheetPresenter);

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
    if (renderScope === 'selection') {
      // L1 #693: only `selectedLid` changed. The renderer swaps the
      // center / meta / header regions and moves the sidebar highlight
      // in place WITHOUT rebuilding the O(N) sidebar tree. The center
      // pane IS replaced, so — unlike sidebar-only — we revoke its old
      // preview Blobs first and re-hydrate BOTH attachment and inline
      // asset previews afterwards. Continuity capture/restore keeps the
      // center scroll / focus across the swap.
      cleanupBlobUrls(root);
      const continuity = captureRenderContinuity(root);
      render(state, root, prevRenderState);
      restoreRenderContinuity(root, continuity);
      populateAttachmentPreviews(root, dispatcher);
      populateInlineAssetPreviews(root, dispatcher);
      locationNavTracker.consume(root, state.pendingNav ?? null);
      prevSelectedLid = state.selectedLid;
      prevRenderState = state;
      return;
    }
    if (renderScope === 'entry-body') {
      // L1 #693 PR-2: a single todo body-only change. Like the selection
      // path, the center pane is replaced, so revoke its old preview Blobs
      // and re-hydrate previews; continuity preserves center scroll / focus.
      cleanupBlobUrls(root);
      const continuity = captureRenderContinuity(root);
      render(state, root, prevRenderState);
      restoreRenderContinuity(root, continuity);
      populateAttachmentPreviews(root, dispatcher);
      populateInlineAssetPreviews(root, dispatcher);
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

    // PR-2T(2026-05-12):render 後の inline color に WCAG resolver を適用。
    // `theme.wcag_auto_shift` flag が OFF なら no-op、ON なら同系色 shift。
    applyWcagResolverNow(root);

    restoreRenderContinuity(root, continuity);

    // Edit-mode focus default: when NOTHING was focused before the
    // re-render and we've just entered edit mode, point the caret
    // at the archetype's main body/description field. Falls back
    // to the title when no body field is available. This preserves
    // S1 (2026-04-22): the non-B4 textlog path still lets its
    // explicit `beginLogEdit` focus win because it runs before
    // this branch on the same tick.
    if (!continuity.focus && state.phase === 'editing') {
      // pgc-240:filter-cache の entryByLid Map で O(1) lookup ── onState
      // listener は毎 render 後に走るため hot path、O(N) walk を解消。
      const editingEntry = state.editingLid && state.container
        ? getFilterIndexes(state.container).entryByLid.get(state.editingLid) ?? null
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

  // pgc-96(audit pgc-77 Gap-15):entry-window の `currentContainerRef` を
  // dispatcher の state.container 変化に追従させる。features 層 DOM op
  // (expandTransclusions + hydrateCardPlaceholders)を S4 全 render path で
  // parent 側完成 HTML に inject するため、最新 container reference を
  // module-local に流し込む。
  dispatcher.onState((s) => setEntryWindowCurrentContainer(s.container));

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

  // 2d-2. Entry-window monitor refresh wiring (γ-A5-2). Whenever the
  // container's `entries` identity changes, every open monitor window
  // (TOC etc.) gets a fresh derived-data push via `pushMonitorUpdate`.
  // See `src/adapter/ui/entry-window-monitor-refresh.ts`.
  wireEntryWindowMonitorRefresh(dispatcher);

  // 2d-3. Window layout restore prompt (γ-A5-4). On the first ready
  // state, if `shell.window_layout_persist` is on and a saved layout
  // exists, offer to reopen the previous session's viewer / monitor
  // windows. See `src/adapter/ui/window-layout-restore-prompt.ts`.
  wireWindowLayoutRestore(dispatcher, document.body);

  // 2e. main reload guard (Phase γ-A3 A3-4). When child entry-windows
  // are open, `beforeunload` raises the browser-native confirm so a
  // stray main reload / close does not silently drop in-progress child
  // edits. flag-gated (`shell.main_reload_guard`, default OFF); no-op
  // when the flag is off or no children are open. See
  // `src/adapter/ui/main-reload-guard.ts` + shell spec §3.2.
  installMainReloadGuard(getOpenEntryWindowLids);

  // 2f. Phase γ-A3:child entry-window の open/close を state machine へ
  // 同期する。window を開閉するたび現在の全 lid を `SYS_SYNC_CHILD_WINDOWS`
  // で dispatch → `AppState.childWindowLids` が更新され、renderer の
  // indicator と `BEGIN_EDIT` の二重編集 guard が機能する。これにより
  // state machine が multi-window を「前提」として扱う。
  setEntryWindowsChangedListener(() => {
    dispatcher.dispatch({
      type: 'SYS_SYNC_CHILD_WINDOWS',
      lids: getOpenEntryWindowLids(),
    });
  });

  // 3. Action binder: DOM events → UserAction
  bindActions(root, dispatcher);

  // 3-CP. Command Palette POC(vscode-grade-overhaul-2026-05 MASTER.md §4.1、
  // pgc-80):Tier 0 flag `shell.command_palette_enabled` で gate(default
  // OFF)、`Ctrl+Shift+P` / `F1` で起動。bootstrap として PKC2 の基本 command
  // を `registerBuiltinCommands(dispatcher)` で登録。
  registerBuiltinCommands(dispatcher);

  // 3-KM. Keymap registry(MASTER.md §4.6、pgc-82):Tier 0 flag
  // `shell.keymap_registry_enabled` で gate(default OFF)、Alt+1〜6 で view
  // 切替 / F12 で Flags Inspector / Ctrl+K Ctrl+S で shortcuts 一覧 等の
  // fresh chord を登録。既存 shortcut は不変。
  registerBuiltinKeymaps();

  // 3-TS-R. pgc-86 restore(MASTER.md §4.3):本処理は **wireTabStrip より
  // 先に** 登録して、SYS_INIT_COMPLETE で container が ready になった
  // 最初の 1 回に restoreTabState を走らせる ── wireTabStrip の onState が
  // 「openTabs が空」 を LS に書き出して saved 状態を上書きする前に restore
  // が読む順序を確保する(listener 登録順 = 発火順、stateListeners.forEach)。
  {
    let restoredOnce = false;
    const offRestore = dispatcher.onState((s) => {
      if (restoredOnce) return;
      if (!s.container) return;
      restoredOnce = true;
      const restoredActive = restoreTabState(s.container);
      offRestore();
      if (restoredActive) {
        dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: restoredActive });
      }
    });
  }

  // 3-TS. Tab strip(MASTER.md §4.3、pgc-85):Tier 0 flag `shell.tabs_enabled`
  // で gate(default OFF)。本 wiring は always-on で `ENTRY_SELECTED` を
  // listen して open 履歴を保持(flag OFF 時は描画されないだけで state は
  // 育つ)── ON にした瞬間既存履歴が tab strip に出る。
  // **本 wiring は restore より後に登録する**(上記 3-TS-R 参照)。
  wireTabStrip(dispatcher);

  // 3a. Global caret-row indicator (always on, sync-independent).
  // Paints a subtle marker at the focused textarea's caret row
  // anywhere in PKC2 (split editor body, title input, search,
  // log row inputs, …). 2026-05-05 user direction:「caret 位置の
  // 視覚効果は PKC 全体で入力中部分で適用してください」.
  installCaretIndicator();

  // reform-2026-05 Phase 2 PR-2M(2026-05-10):` ```html-render` fence の
  // iframe sandbox から postMessage で height 通知を受け、対応 iframe の
  // style.height を更新する parent-side listener。一度 install するだけで
  // 全 iframe を listen(message に id を含めて iframe を特定)。
  installHtmlSandboxResizer();

  // PR-2GG(2026-05-12、reform Phase 3 Block F):AST 公開 API を window.PKC.ast
  // に設置。他の AI(DevTools console / iframe / postMessage caller)から
  // markdown text を AST / Pandoc JSON に変換できる経路を提供。
  exposeAstApi();
  // user bug 2026-05-28:entry-window から `window.opener.PKC.pasteAttachment` で
  // parent dispatcher に paste 動線を通すための API。MW screenshot paste fix。
  exposePasteApi(dispatcher);

  // 編集モード固定 format ribbon(Group C、Phase γ-C)は renderer.ts の
  // renderEditor() が描画する。旧 floating panel の global mount は scrap 済。

  // reform-2026-05 Phase 3 PR-2T(2026-05-12):WCAG コントラスト探索 runtime。
  // Tier 0 flag `theme.wcag_auto_shift`(default ON)/ `theme.wcag_target_ratio`
  // (default 4.5、AA)で AI 生成色 + theme bg の組合せが contrast 不足な場合に
  // 同系色 shift で AA を自動達成。OFF にすれば設定通りの色のまま。
  // theme change(prefers-color-scheme)で re-apply listener も install。
  installWcagResolverRuntime();

  // PR-2O(2026-05-10):?pkc-debug=hallucination で tolerant alias の hint
  // marker(dotted underline / align chip)を visible に。default 非表示。
  try {
    if (typeof URLSearchParams !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const debugRaw = params.get('pkc-debug') ?? '';
      const debugList = new Set(debugRaw.split(',').map((s) => s.trim()));
      if (debugList.has('hallucination') || debugList.has('all')) {
        document.documentElement.setAttribute('data-pkc-debug-hallucination', '');
      }
    }
  } catch { /* URL parse 失敗時は default(非表示)維持 */ }

  // 3a-bis. iOS Safari hard reload(2026-05-10、user 報告対応):
  // Add to Home Screen mode で Safari がアグレッシブにキャッシュするため、
  // 起動時に 1 回 HEAD リクエストで Last-Modified を取得 → 前回値と異なれば
  // toast 通知 → タップで `?_r=<timestamp>` 付きで location.replace。
  // file:// / offline / fetch 失敗は silent skip(critical path に乗せない)。
  void checkForUpdate();

  // 3b. Debug-via-URL-flag report button has moved into the renderer
  // header (next to the ⚙ shell menu) as of stage β follow-up
  // (2026-05-02). The action-binder handles the click via the
  // `dump-debug-report` action; the fallback modal sink lives on
  // `document.body` and is created on demand. No mount call needed.

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
  //
  // #771: the active backend is chosen from the localStorage preference
  // (`pkc2.storageBackend`). Default = 'idb' (unchanged behaviour). When
  // set to 'opfs' and OPFS is usable (secure context — NOT file://), the
  // store is OPFS-backed, migrating the existing IDB default container
  // across once. Falls back to IDB safely otherwise.
  const { store } = await createConfiguredStoreFromEnv();
  // 段階3 (#868) lazy asset loading. Boot loads the container shallow
  // (no asset bytes — see loadFromStore); the working-set manager keeps
  // `container.assets` populated with just what the visible view
  // references and evicts the rest under a byte budget. `refresh()` runs
  // after each render (a later onState subscriber, so the renderer has
  // already recorded any asset misses) to load misses + preload the
  // current selection. registerExportStore lets the export serializers
  // hydrate the full referenced set before writing (no data loss).
  registerExportStore(store);
  const workingSet = mountWorkingSet(dispatcher, { store });
  dispatcher.onState(() => {
    void workingSet.refresh();
  });
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

  // 6-bis. #773 完全層: ensure a workspace exists (migrating existing
  // containers into a "Default" workspace on first run), then publish
  // the ACTIVE workspace's containers to the switcher list (runtime-
  // only; feeds the Storage Profile dialog). Non-blocking.
  void (async (): Promise<void> => {
    await ensureDefaultWorkspace(store);
    const containers = await activeWorkspaceContainers(store);
    dispatcher.dispatch({ type: 'SYS_SET_AVAILABLE_CONTAINERS', containers });
    const workspaces = await store.listWorkspaces();
    const activeWorkspaceId = await store.getActiveWorkspaceId();
    dispatcher.dispatch({
      type: 'SYS_SET_WORKSPACES',
      workspaces: workspaces.map((w) => ({ id: w.id, name: w.name })),
      activeWorkspaceId,
    });
  })().catch(() => {});
  mountContainerSwitchHandler(root, store);

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

  // PR #197: navigation history bridge — wires browser back/forward
  // (toolbar arrows, mouse button 4/5, Alt+← / Alt+→ / Cmd+[ / Cmd+])
  // to internal SELECT_ENTRY / SET_VIEW_MODE via history.pushState +
  // popstate. Mounted after persistence so initial state has settled.
  mountNavHistory(dispatcher);

  // 7. Export handler: when phase becomes 'exporting', run export (async for compression)
  //
  // pgc-205 (user 報告 2026-05-24「エクスポート導線が壊れたままだ」):
  // listener は phase==='exporting' の間に発生した **任意の他 dispatch**
  // (SET_THEME / TOGGLE_MENU 等、phase guard 無し reducer)で再 fire し、
  // 多重 exportContainerAsHtml を triggering(同 container を 2-3 個
  // ダウンロード)していた。`exportInFlight` guard で BEGIN_EXPORT →
  // SYS_FINISH_EXPORT/SYS_ERROR の 1 サイクル内は 1 回のみ実行する。
  let exportInFlight = false;
  dispatcher.onState((state) => {
    if (state.phase === 'exporting' && state.container && !exportInFlight) {
      exportInFlight = true;
      const mode = state.exportMode ?? 'full';
      const mutability = state.exportMutability ?? 'editable';
      exportContainerAsHtml(state.container, { mode, mutability })
        .then((result) => {
          if (result.success) {
            console.log(`[PKC2] Exported (${mode}/${mutability}): ${result.filename} (${(result.size / 1024).toFixed(1)} KB)`);
            dispatcher.dispatch({ type: 'SYS_FINISH_EXPORT' });
          } else {
            dispatcher.dispatch({ type: 'SYS_ERROR', error: `Export failed: ${result.error}` });
          }
        })
        .finally(() => {
          exportInFlight = false;
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
        // #795 B-1: 観測 seam → 既存 debug ring buffer(kind:'transport')。
        // 新 UI は足さない — 既存の debug report 導線(`?pkc-debug=…` +
        // 🐞 button)でそのまま輸出される。recording off(通常運用)では
        // undefined を渡し、seam のオーバーヘッドをゼロにする。
        // payloadPreview は bridge 側が `?pkc-debug=transport` 時のみ付与
        // (redaction 済み・256 字 bound)。
        onTraffic: isRecordingEnabled()
          ? (ev) => {
              recordDebugEvent({
                kind: 'transport',
                seq: nextDispatchSeq(),
                ts: ev.at,
                type: ev.type,
                direction: ev.direction,
                protocol: ev.protocol,
                verdict: ev.verdict,
                origin: ev.origin,
                sourceId: ev.sourceId,
                targetId: ev.targetId,
                ...(ev.rejectCode !== undefined ? { rejectCode: ev.rejectCode } : {}),
                ...(ev.payloadPreview !== undefined ? { payloadPreview: ev.payloadPreview } : {}),
              });
            }
          : undefined,
      });
      console.log(`[PKC2] Message bridge mounted (container: ${state.container.meta.container_id})`);
    }
  });

  // Smoke test boot signal (2026-05-18):SYS_INIT_COMPLETE 後の最初の
  // phase=ready state mutation で signalBootReady() を呼ぶ。本 subscriber は
  // dispatcher.onState 登録順で renderer subscriber(line 180 付近)より後に
  // 登録されているため、本 callback が走る時点で renderer は既に DOM 更新
  // 済(synchronous chain)。test は `await window.PKC.bootReady` で UI
  // 操作の前段同期を確実に取れる。idempotent(signalBootReady 内で resolve
  // を 1 回だけ発火、以降の dispatch では no-op)。
  let bootReadySignaled = false;
  dispatcher.onState((state) => {
    if (!bootReadySignaled && state.phase === 'ready' && state.container) {
      bootReadySignaled = true;
      signalBootReady();
    }
  });

  // 8d. PKC-Extension autostart (#790). Launch `pkc_extension && startup`
  // attachments once the container is ready (skipped in `?pkc-safe-mode`).
  // Each launched extension subscribes itself to live container updates, so no
  // per-handle push is needed here.
  let extensionsStarted = false;
  dispatcher.onState((state) => {
    if (!extensionsStarted && state.phase === 'ready' && state.container) {
      extensionsStarted = true;
      autostartPkcExtensions(dispatcher);
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
      // #795 A-1: pin the reject's targetOrigin to the origin recorded at
      // offer receipt. The `window.parent` fallback (registry miss —
      // historical offers / debug harness) has no recorded origin, so it
      // keeps the previous `'*'` behavior.
      const replyTarget = getReplyTargetForOffer(event.offer_id);
      bridgeHandle.sender.send(
        replyTarget?.win ?? window.parent,
        'record:reject',
        // #804: correlation_id を echo(sender が複数 offer を相関できる)。
        { offer_id: event.offer_id, reason: 'dismissed', correlation_id: event.correlation_id ?? null },
        event.reply_to_id,
        replyTarget ? pinTargetOrigin(replyTarget.origin) : '*',
      );
      clearReplyWindowForOffer(event.offer_id);
    }
    if (event.type === 'OFFER_ACCEPTED') {
      // #804(spec §11.3 予約の wire-up): accept を sender へ通知する。
      // record:reject と違い window.parent fallback はしない — 新規経路
      // なので registry に正確な送信元 window + origin がある場合のみ
      // 送る(targetOrigin は受信時 origin にピン留め、#797 規則)。
      // **送出 → clear の順**(clear が先だと送れない)。
      if (event.reply_to_id && bridgeHandle) {
        const replyTarget = getReplyTargetForOffer(event.offer_id);
        if (replyTarget) {
          bridgeHandle.sender.send(
            replyTarget.win,
            'record:accept',
            {
              offer_id: event.offer_id,
              assigned_lid: event.lid,
              correlation_id: event.correlation_id ?? null,
            },
            event.reply_to_id,
            pinTargetOrigin(replyTarget.origin),
          );
        }
      }
      // Drop the registry entry so the Map does not grow unbounded.
      clearReplyWindowForOffer(event.offer_id);
      // PR-HH (2026-05-06): when the just-accepted entry's body
      // carries a http(s) thumbnail URL in its YAML frontmatter,
      // materialize it into a local container asset so card grids
      // no longer depend on the original host's runtime
      // availability + CORS posture. Best-effort: any failure
      // (network / CORS taint / canvas error) leaves the URL in
      // place so the existing runtime fallback path still works.
      void (async (): Promise<void> => {
        try {
          const st = dispatcher.getState();
          const entry = st.container?.entries.find((e) => e.lid === event.lid);
          if (!entry || entry.archetype !== 'text') return;
          const url = findThumbnailHttpUrl(entry.body ?? '');
          if (!url) return;
          const fetched = await fetchImageAsBase64(url);
          if (!fetched) return;
          const assetKey = `thumb-${event.lid}-${Date.now().toString(36)}`;
          dispatcher.dispatch({
            type: 'MATERIALIZE_THUMBNAIL',
            lid: event.lid,
            assetKey,
            assetData: fetched.b64,
            mime: fetched.mime,
          });
        } catch {
          /* best-effort — runtime URL fallback still renders */
        }
      })();
    }
    if (event.type === 'FLAGS_CHANGED') {
      // Flags Protocol v1 (2026-05-03): refresh the runtime flag
      // registry's container snapshot so subsequent
      // `getRegisteredFlags()` calls reflect the new payload.
      setContainerFlagSource(event.flags.values);
      // Phase 3a (2026-05-04): re-apply runtime UI scale multiplier
      // immediately after the flag registry is primed, so a flag
      // edit reflects in `--theme-scale` (and the rem cascade) on
      // the same dispatch tick — no waiting for the next render.
      applyThemeScale();
      // PR-Δ29 (2026-05-07、user 報告「Galaxy / Venn の button caption が
      // 即時に変わらない」):dispatcher は state listeners を event より
      // 先に notify するため、SET_FLAG の state listener 実行時点では
      // flag source がまだ古い値。renderer は graphGalaxyMode() の旧値で
      // button text を出してしまう。FLAGS_CHANGED 直後に **再 render を
      // microtask 経由で trigger** して新 flag 値を反映する。
      queueMicrotask(() => {
        render(dispatcher.getState(), root);
      });
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
        primeFlagsFromContainer(container);
        maybeOpenFlagsInspectorFromUrl(dispatcher);
        maybeApplyLauncherUrlFlag(dispatcher);
        maybeIngestSnapshotFromUrl(dispatcher);
        installBookmarkletPkcMessageBridge(dispatcher, registry);
        restoreCollapsedFoldersForContainer(dispatcher, container);
        restoreEditModeFromStorage(dispatcher);
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
        primeFlagsFromContainer(container);
        maybeOpenFlagsInspectorFromUrl(dispatcher);
        maybeApplyLauncherUrlFlag(dispatcher);
        maybeIngestSnapshotFromUrl(dispatcher);
        installBookmarkletPkcMessageBridge(dispatcher, registry);
        restoreCollapsedFoldersForContainer(dispatcher, container);
        restoreEditModeFromStorage(dispatcher);
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
        primeFlagsFromContainer(container);
        maybeOpenFlagsInspectorFromUrl(dispatcher);
        maybeApplyLauncherUrlFlag(dispatcher);
        maybeIngestSnapshotFromUrl(dispatcher);
        installBookmarkletPkcMessageBridge(dispatcher, registry);
        restoreCollapsedFoldersForContainer(dispatcher, container);
        restoreEditModeFromStorage(dispatcher);
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
 * Phase γ-A2 (A2-3, 2026-05-20): after SYS_INIT_COMPLETE, restore the
 * persisted editMode (inline / window) from localStorage and dispatch
 * SET_EDIT_MODE. No-op when nothing is stored — the reducer's
 * undefined default resolves to inline (= legacy behavior), so a
 * first-ever boot stays fully backward-compatible. editMode is a
 * viewer-local preference (localStorage, not container), mirroring
 * `restoreCollapsedFoldersForContainer`. See `edit-mode-prefs.ts`.
 */
function restoreEditModeFromStorage(dispatcher: Dispatcher): void {
  const mode = loadEditMode();
  if (mode) dispatcher.dispatch({ type: 'SET_EDIT_MODE', mode });
}

/**
 * Flags Protocol v1 (2026-05-03): after SYS_INIT_COMPLETE, resolve
 * the reserved `__flags__` entry from the booted container and prime
 * the runtime flag registry's container source. Missing / malformed /
 * wrong-archetype entry falls back to FLAGS_DEFAULTS (empty values).
 *
 * Unlike Settings, Flags has no AppState mirror — defineFlag values
 * are resolved at module-import time directly from the registry's
 * sources (URL > containerSource > default), so we just feed the
 * payload's `values` map into setContainerFlagSource and let the
 * registry handle the rest. No reducer dispatch required.
 *
 * Called again whenever FLAGS_CHANGED fires so the registry's
 * snapshot stays in sync with subsequent SET_FLAG mutations.
 */
function primeFlagsFromContainer(container: Container): void {
  const entry = container.entries.find(
    (e) => e.lid === '__flags__' && e.archetype === 'system-flags',
  );
  const flags = resolveFlagsPayload(entry?.body);
  setContainerFlagSource(flags.values);
  // Phase 3a — sync `theme.scale` to the `--theme-scale` CSS var
  // at boot, before the first render. This avoids a one-frame
  // flash where the rem cascade falls back to `var(--theme-scale, 1)`
  // (= 1.0) before applyThemeScale runs from applySystemSettings.
  applyThemeScale();
}

/**
 * Flags Protocol v1 (PR-β-2): URL `?pkc-flag=*` boot-time inspector
 * launch. The wildcard form is the spec-defined trigger to surface
 * the inspector overlay automatically (parallel to the existing
 * `?pkc-debug=*` overlay launch). Specific values like
 * `?pkc-flag=foo.bar=1` apply value overrides without auto-opening
 * the inspector — only `*` opens the UI.
 */
function maybeOpenFlagsInspectorFromUrl(dispatcher: Dispatcher): void {
  if (typeof window === 'undefined' || !window.location) return;
  const params = new URLSearchParams(window.location.search);
  if (params.getAll('pkc-flag').includes('*')) {
    dispatcher.dispatch({ type: 'OPEN_FLAGS_INSPECTOR' });
  }
}

/**
 * PR-2JJ(2026-05-12 hotfix v2、user 要望に合わせた再設計):
 * `?app=launcher` URL flag を boot 時に処理し、center pane の launcher view
 * へ直接遷移する(`SET_VIEW_MODE 'launcher'`)。
 *
 * 経緯:v1 で固定 7-app enum を modal overlay として実装したが、user の
 * 当初要望は「PKC が単一 HTML を attachment として保持 + sandbox 実行できる
 * 能力を活かし、HTML attachment を opt-in でアプリ化して中央 pane で
 * 一覧 → window で起動」だった。v2 で再設計。
 */
function maybeApplyLauncherUrlFlag(dispatcher: Dispatcher): void {
  if (typeof window === 'undefined' || !window.location) return;
  const params = new URLSearchParams(window.location.search);
  if (params.get('app') === 'launcher') {
    dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'launcher' });
  }
}

/**
 * 領域 10-6 ζ'' Phase 3c-E — bookmarklet snapshot intake.
 * If the URL carries `?pkc-snapshot=<base64-or-json>`, decode and
 * create a TEXT entry from it. **No modal in main shell** (2026-05-05
 * user direction); the new entry simply appears as the freshly-
 * selected entry and the URL param is stripped to prevent re-import
 * on refresh.
 */
function maybeIngestSnapshotFromUrl(dispatcher: Dispatcher): void {
  if (typeof window === 'undefined' || !window.location) return;
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('pkc-snapshot');
  if (!raw) return;
  const decoded = decodeSnapshotParam(raw);
  if (!isSnapshot(decoded)) return;
  const draft = snapshotToEntryDraft(decoded);
  dispatcher.dispatch({
    type: 'CREATE_ENTRY',
    archetype: 'text',
    title: draft.title,
  });
  // The reducer puts us into editing mode for the new entry; commit
  // immediately with the snapshot body so the user lands on a saved
  // entry. No modal interactions required.
  const lid = dispatcher.getState().editingLid;
  if (lid) {
    dispatcher.dispatch({ type: 'COMMIT_EDIT', lid, title: draft.title, body: draft.body });
  }
  // Strip the param so reload / share doesn't re-create the entry.
  try {
    params.delete('pkc-snapshot');
    const newSearch = params.toString();
    const url = `${window.location.pathname}${newSearch ? '?' + newSearch : ''}${window.location.hash}`;
    window.history.replaceState({}, document.title, url);
  } catch {
    /* ignore */
  }
}

/**
 * PR-S (2026-05-06):bookmarklet を **PKC-Message v1 spec 準拠** に
 * 全面書換え。User 指摘:
 * > これ、ちゃんと PKC-Message の規約読んだ?
 *
 * 旧 PR-Q の独自 type `pkc-bookmarklet-snapshot` は **spec 違反**:
 *   - envelope 必須 field(`protocol` / `version` / `source_id` /
 *     `timestamp`)を持たなかった
 *   - 勝手な type 名で `KNOWN_TYPES` に未登録
 *   - **user 同意経路をバイパス**(spec §6.2 違反)で CREATE_ENTRY 直
 *     dispatch していた
 *   - origin allowlist / capability gate / envelope validation すべて skip
 *
 * 新設計(spec §4.1 envelope + §7.2 record:offer):
 *   - bookmarklet が `record:offer` envelope(spec 完全準拠)を送る
 *   - origin policy は `?pkc-bookmarklet=ready` URL flag が付いた boot
 *     時のみ **one-shot で any origin** を許容(URL flag は user-initiated
 *     なので user が明示同意)、それ以外は通常の `mountMessageBridge`
 *     allowlist が効く
 *   - 受信した envelope は `recordOfferHandler` を直 invoke、PendingOffer
 *     banner → user accept で初めて entry mint(**user 同意経路温存**、
 *     spec §6.2 / §7.2.5 通り)
 *   - record:offer 受信後 / 30 秒タイムアウトで listener 自動 removal
 *
 * v1 spec の中で完結:envelope / type / handler / user-consent gate
 * すべて既存の `record:offer` path に乗る。spec 拡張不要。
 *
 * 残るリスク評価:
 *   - bookmarklet 経由は cross-origin postMessage を一時受け入れる →
 *     URL flag が偽 click で生やされた場合に payload 注入の窓が 30 秒
 *     開く。ただし最終的に user の accept がないと entry は作られない
 *     (spec §6.2 user-consent gate)ので、最悪でも PendingOffer banner
 *     を 1 件 user に見せるだけで終わる(DoS 程度の被害、storage write
 *     なし)。
 */
function installBookmarkletPkcMessageBridge(
  dispatcher: Dispatcher,
  registry: MessageHandlerRegistry,
): void {
  if (typeof window === 'undefined' || !window.location) return;
  const params = new URLSearchParams(window.location.search);
  if (params.get('pkc-bookmarklet') !== 'ready') return;

  // Strip the URL flag immediately so reload doesn't re-trigger the
  // cross-origin window.
  try {
    params.delete('pkc-bookmarklet');
    const newSearch = params.toString();
    window.history.replaceState(
      {},
      document.title,
      `${window.location.pathname}${newSearch ? '?' + newSearch : ''}${window.location.hash}`,
    );
  } catch {
    /* ignore */
  }

  let consumed = false;
  const onMessage = (ev: MessageEvent): void => {
    if (consumed) return;
    if (!ev.source) return;
    const data = ev.data as Record<string, unknown> | null | undefined;
    // Validate as PKC-Message envelope (spec §4.1 / §4.2).
    if (!data || typeof data !== 'object') return;
    if (data.protocol !== 'pkc-message') return;
    if (data.version !== 1) return;
    if (data.type !== 'record:offer') return;
    if (typeof data.timestamp !== 'string') return;
    consumed = true;

    // Route through the spec-compliant handler. PendingOffer is created
    // and the user must explicitly Accept on the banner before any
    // entry is minted (spec §6.2 / §7.2.5 user-consent gate).
    //
    // Sender stub:`record:offer` handler does not call ctx.sender (it
    // stashes sourceWindow for the later record:reject reply path).
    // The dismiss-side reply uses bridgeHandle.sender via the
    // `OFFER_DISMISSED` event handler in main.ts, not this path. So a
    // no-op sender stub is safe here.
    const noopSender = {
      send: (
        _target: Window,
        _type: string,
        _payload: unknown,
        _targetId?: string | null,
        _targetOrigin?: string,
      ): void => {
        /* unused for record:offer inbound path */
      },
    } as Parameters<typeof registry.route>[0]['sender'];
    const currentState = dispatcher.getState();
    registry.route({
      envelope: data as unknown as Parameters<typeof registry.route>[0]['envelope'],
      sourceWindow: ev.source as Window,
      origin: ev.origin,
      container: currentState.container,
      embedded: currentState.embedded,
      dispatcher,
      sender: noopSender,
    });
    window.removeEventListener('message', onMessage);
  };
  window.addEventListener('message', onMessage);
  // Auto-cleanup after 30s — bookmarklet's expected handshake is
  // sub-second; anything longer is a stuck / aborted flow.
  setTimeout(() => {
    if (!consumed) window.removeEventListener('message', onMessage);
  }, 30_000);

  // Notify the opener (the bookmarklet's host page) that we're ready
  // to receive a record:offer envelope. The opener checks `e.data.type
  // === 'pkc-bookmarklet-ready'` and posts the envelope back.
  if (window.opener) {
    try {
      window.opener.postMessage({ type: 'pkc-bookmarklet-ready' }, '*');
    } catch {
      /* opaque cross-origin opener — ignore */
    }
  }
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
  // PR-QQ (2026-05-06): accept `.pkc-capture.json` for the local
  // bookmarklet DL mode in addition to the existing HTML / ZIP
  // container imports.
  // PR-UU (2026-05-06): user 修正指示4「.pkc-capture.json の複数取り
  // 込みを有効化して」— `multiple` を on に。container HTML / ZIP
  // は基本 1 件 import 想定だが、複数選択しても先頭ファイルが従来
  // 通り処理される(後方互換、capture JSON 経路のみ全件 loop)。
  fileInput.accept = '.html,.zip,.json';
  fileInput.multiple = true;
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
    const allFiles = Array.from(fileInput.files ?? []);
    if (allFiles.length === 0) return;

    // PR-UU (2026-05-06): when ALL selected files are capture JSONs,
    // process every one in sequence as separate `SYS_RECORD_OFFERED`
    // dispatches so the user sees a stack of PendingOffer banners
    // (PKC-Message §6 user-consent gate is preserved per offer).
    // Mixed selections (HTML + capture-json + zip) fall back to the
    // legacy first-file behavior since that path has its own preview
    // dialog flow.
    const allCapture = allFiles.every((f) => isCaptureJsonFilename(f.name));
    if (allCapture) {
      let n = 0;
      for (const file of allFiles) {
        const text = await file.text();
        const parsed = parseCaptureJson(text);
        if (!parsed) {
          console.warn(`[PKC2] capture JSON rejected: ${file.name}`);
          continue;
        }
        n += 1;
        const offer = {
          offer_id: `dl-${Date.now().toString(36)}-${n}`,
          title: parsed.payload.title,
          body: parsed.payload.body,
          archetype: parsed.payload.archetype ?? 'text',
          source_container_id: parsed.payload.source_container_id ?? null,
          reply_to_id: null,
          received_at: new Date().toISOString(),
          source_url: parsed.payload.source_url ?? null,
          captured_at: parsed.payload.captured_at ?? null,
          kind: parsed.payload.kind ?? null,
          thumbnail_url: parsed.payload.thumbnail_url ?? null,
          provider: parsed.payload.provider ?? null,
          duration_sec: parsed.payload.duration_sec ?? null,
          pages: parsed.payload.pages ?? null,
          isbn: parsed.payload.isbn ?? null,
          author: parsed.payload.author ?? null,
          brand: parsed.payload.brand ?? null,
        };
        dispatcher.dispatch({ type: 'SYS_RECORD_OFFERED', offer });
        console.log(`[PKC2] capture import (${n}/${allFiles.length}): ${file.name} → offer ${offer.offer_id}`);
      }
      console.log(`[PKC2] capture import batch complete: ${n}/${allFiles.length} accepted`);
      return;
    }

    // Single capture json among mixed picks — handle just it (legacy
    // single-file path).
    const file = allFiles[0]!;

    // PR-QQ: capture JSON branch (bookmarklet DL mode). Detect by
    // filename — accepts `.pkc-capture.json` or `.pkc-capture`.
    // Validates the envelope, then dispatches `SYS_RECORD_OFFERED`
    // so the user sees the same accept / dismiss UX as the
    // postMessage path.
    if (isCaptureJsonFilename(file.name)) {
      const text = await file.text();
      const parsed = parseCaptureJson(text);
      if (!parsed) {
        console.warn(`[PKC2] capture JSON rejected: ${file.name}`);
        dispatcher.dispatch({
          type: 'SYS_ERROR',
          error: `Capture import failed: ${file.name} は有効な PKC-Message v1 envelope ではありません。`,
        });
        return;
      }
      const offer = {
        offer_id: `dl-${Date.now().toString(36)}`,
        title: parsed.payload.title,
        body: parsed.payload.body,
        archetype: parsed.payload.archetype ?? 'text',
        source_container_id: parsed.payload.source_container_id ?? null,
        reply_to_id: null,
        received_at: new Date().toISOString(),
        source_url: parsed.payload.source_url ?? null,
        captured_at: parsed.payload.captured_at ?? null,
        kind: parsed.payload.kind ?? null,
        thumbnail_url: parsed.payload.thumbnail_url ?? null,
        provider: parsed.payload.provider ?? null,
        duration_sec: parsed.payload.duration_sec ?? null,
        pages: parsed.payload.pages ?? null,
        isbn: parsed.payload.isbn ?? null,
        author: parsed.payload.author ?? null,
        brand: parsed.payload.brand ?? null,
      };
      dispatcher.dispatch({ type: 'SYS_RECORD_OFFERED', offer });
      console.log(`[PKC2] capture import: ${file.name} → offer ${offer.offer_id}`);
      return;
    }

    // Route to appropriate importer based on file extension
    if (file.name.endsWith('.zip')) {
      // PR-Δ27 (2026-05-07、user 報告「ZIP 開こうとすると止まる、
      // progress も無くて UX 低い」):進捗 toast を 1 件だけ作って
      // 同 message で coalesce 更新(toast.ts の coalescing 機構)。
      console.log(`[PKC2] ZIP import start: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`);
      let lastToast: HTMLElement | null = null as HTMLElement | null;
      let lastReportTime = 0;
      const onProgress = (info: { done: number; total: number; currentName: string }): void => {
        const now = Date.now();
        // throttle to 1 update / 250ms to avoid DOM thrash
        if (now - lastReportTime < 250 && info.done < info.total) return;
        lastReportTime = now;
        const pct = Math.round((info.done / info.total) * 100);
        const msg = `📦 ZIP 取り込み中 ${info.done}/${info.total} (${pct}%)`;
        if (lastToast) lastToast.remove();
        lastToast = showToast({ message: msg, kind: 'info', autoDismissMs: 60000 });
      };
      const result = await importContainerFromZip(file, onProgress);
      if (lastToast) lastToast.remove();
      console.log(`[PKC2] ZIP import done: ok=${result.ok}`);
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
/**
 * #771/#773 MVP — same-origin container switcher actions. Mounted with
 * the active `store` (which may be IDB / OPFS / FSA) so switching
 * targets the live backend. Each action mutates the store then reloads;
 * boot loads the new active container. Mirrors
 * `mountClearLocalDataHandler`'s store-bound delegation.
 */
function mountContainerSwitchHandler(root: HTMLElement, store: ContainerStore): void {
  root.addEventListener('click', (e: Event) => {
    const el = e.target as HTMLElement;
    const switchEl = el.closest<HTMLElement>('[data-pkc-action="switch-container"]');
    if (switchEl) {
      const cid = switchEl.getAttribute('data-pkc-cid');
      if (!cid) return;
      void (async (): Promise<void> => {
        await switchActiveContainer(store, cid);
        location.reload();
      })();
      return;
    }
    if (el.closest<HTMLElement>('[data-pkc-action="new-container"]')) {
      void (async (): Promise<void> => {
        await addContainerToActiveWorkspace(store, createEmptyContainer());
        location.reload();
      })();
      return;
    }
    const delEl = el.closest<HTMLElement>('[data-pkc-action="delete-container"]');
    if (delEl) {
      const cid = delEl.getAttribute('data-pkc-cid');
      if (!cid) return;
      if (!confirm('このコンテナを削除しますか？元に戻せません。')) return;
      void (async (): Promise<void> => {
        await removeContainerFromActiveWorkspace(store, cid);
        location.reload();
      })();
      return;
    }
    // ── Workspace actions (#773 PR-WS-B2) ──
    const wsSwitchEl = el.closest<HTMLElement>('[data-pkc-action="switch-workspace"]');
    if (wsSwitchEl) {
      const wid = wsSwitchEl.getAttribute('data-pkc-wid');
      if (!wid) return;
      void (async (): Promise<void> => {
        await switchWorkspace(store, wid);
        location.reload();
      })();
      return;
    }
    if (el.closest<HTMLElement>('[data-pkc-action="new-workspace"]')) {
      const name = prompt('新しいワークスペース名:', 'Workspace');
      if (name === null) return; // cancelled
      void (async (): Promise<void> => {
        await createWorkspace(store, name, createEmptyContainer());
        location.reload();
      })();
      return;
    }
    const wsRenameEl = el.closest<HTMLElement>('[data-pkc-action="rename-workspace"]');
    if (wsRenameEl) {
      const wid = wsRenameEl.getAttribute('data-pkc-wid');
      if (!wid) return;
      const name = prompt('ワークスペース名を変更:', wsRenameEl.getAttribute('data-pkc-wname') ?? '');
      if (name === null) return;
      void (async (): Promise<void> => {
        await renameWorkspace(store, wid, name);
        location.reload();
      })();
      return;
    }
  });
}

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

/**
 * Install the debug error capture (window.onerror, unhandledrejection,
 * console.error) so the ring buffer in `runtime/debug-flags.ts`
 * collects crashes from boot onwards. The recording itself is
 * unconditional — we always populate the buffer — but the data only
 * leaves the page when the user clicks 🐞, which is gated on the
 * `?pkc-debug=*` flag. The cost when no debug session is active is
 * three event listener registrations + one console.error wrapper
 * that branches on `isRecordingEnabled()` before doing any work.
 *
 * Privacy: structural mode truncates `message` to 200 chars at report
 * time (philosophy doc §4 原則 2); content mode emits the full
 * message. Stack traces are structural information and stay full.
 *
 * `lastSeq` correlates each error to the most recent dispatch the
 * ring buffer had observed when the error fired, so the developer
 * can scan recent[] for the matching seq.
 */
function installDebugErrorCapture(): void {
  if (typeof window === 'undefined') return;

  window.addEventListener('error', (ev: ErrorEvent) => {
    if (!isRecordingEnabled()) return;
    recordDebugError({
      kind: 'error',
      ts: new Date().toISOString(),
      message: ev.message ?? '',
      stack: ev.error instanceof Error ? ev.error.stack : undefined,
      source: ev.filename,
      line: ev.lineno,
      col: ev.colno,
      lastSeq: currentDispatchSeq(),
    });
  });

  window.addEventListener('unhandledrejection', (ev: PromiseRejectionEvent) => {
    if (!isRecordingEnabled()) return;
    const reason: unknown = ev.reason;
    const message =
      reason instanceof Error
        ? reason.message
        : typeof reason === 'string'
          ? reason
          : String(reason);
    const stack = reason instanceof Error ? reason.stack : undefined;
    recordDebugError({
      kind: 'unhandledrejection',
      ts: new Date().toISOString(),
      message,
      stack,
      lastSeq: currentDispatchSeq(),
    });
  });

  // console.error wrapper. Capture from boot so failures during the
  // pre-dispatcher phase (presenter registration, IDB probe) are
  // visible. The original implementation is preserved verbatim.
  const originalConsoleError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    if (isRecordingEnabled()) {
      const [first, ...rest] = args;
      const message =
        first instanceof Error
          ? first.message
          : typeof first === 'string'
            ? first
            : safeStringify(first);
      const stack = first instanceof Error ? first.stack : undefined;
      recordDebugError({
        kind: 'console-error',
        ts: new Date().toISOString(),
        message:
          rest.length > 0 ? `${message} ${rest.map(safeStringify).join(' ')}` : message,
        stack,
        lastSeq: currentDispatchSeq(),
      });
    }
    originalConsoleError(...args);
  };
}

function safeStringify(v: unknown): string {
  try {
    return typeof v === 'string' ? v : JSON.stringify(v);
  } catch {
    return '[unserializable]';
  }
}

boot();
