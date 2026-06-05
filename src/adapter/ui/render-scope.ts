/**
 * Render-scope detection.
 *
 * Short-circuits the renderer subscriber when a dispatch's state
 * delta does not require a full-shell rebuild. Original PR #177
 * shipped `'none'` + `'settings-only'`; PR #178 adds
 * `'sidebar-only'` to capture the per-keystroke / filter-toggle
 * win.
 *
 * The bench (PR #176) identified the user-visible bottlenecks:
 *
 *   - cold-boot `dispatch:RESTORE_SETTINGS` = ~180 ms at 1000
 *     entries (PR #177 ✅ resolved; settings-only short-circuit
 *     reduced it to ~0.4 ms).
 *   - per-keystroke `SET_SEARCH_QUERY` = ~143 ms p50 at 1000 entries
 *     (PR #178 ✅ resolved by `'sidebar-only'` — only the sidebar
 *     pane is rebuilt; header / center / meta DOM stays put).
 *
 * Conservative policy: when in doubt, return `'full'`. Misclassifying
 * a delta as `'sidebar-only'` could leave a stale center / meta
 * pane in front of the user, so each non-full bucket enumerates
 * EVERY field it covers. New AppState fields default to `'full'`
 * because they're not yet enumerated here.
 *
 * Scope kinds:
 *   - `'none'`           no DOM work needed
 *   - `'settings-only'`  only `applySystemSettings(root, …)` runs
 *   - `'sidebar-only'`   replace the `[data-pkc-region="sidebar"]`
 *                        subtree in place (header / center / meta
 *                        / overlays untouched)
 *   - `'full'`           current full-shell rebuild
 */

import type { AppState } from '../state/app-state';

export type RenderScope = 'none' | 'settings-only' | 'sidebar-only' | 'selection-only' | 'full';

/**
 * Compute the minimum render work required to bring the DOM in sync
 * with `state`, given that the last successful render rendered
 * `prev`. Returns `'full'` whenever:
 *
 *   - `prev` is `null` (first mount, no baseline to diff against)
 *   - any field NOT enumerated as settings-mirror, sidebar-only,
 *     or scope-trivial differs in identity (`!==`)
 *
 * Identity checks only — value-equality is not done here because
 * the renderer's slot-level idempotent helpers
 * (`applySystemSettings`, `renderSidebar`) are themselves cheap
 * and idempotent, so re-running them on structurally-equal input
 * is harmless.
 *
 * pgc-208 (user 報告 2026-05-25「100エントリ程度で凄まじく動作が重い」):
 * `'selection-only'` scope を追加 ── SELECT_ENTRY のみの場合(selectedLid /
 * navHistory / navIndex / textlogSelection / textToTextlogModal /
 * collapsedFolders / multiSelectedLids が変化、その他 fields は不変)、
 * sidebar + center + meta の 3 region 差し替えに限定し、header /
 * shell-menu / activity-bar / tray-bar の rebuild を skip(これらは
 * selectedLid に依存しない or 軽微依存で済む)。bench 上 SELECT_ENTRY
 * 52ms → ~20-25ms に短縮見込み(60FPS 16.7ms 予算近接)。
 */
export function computeRenderScope(state: AppState, prev: AppState | null): RenderScope {
  if (prev === null) return 'full';
  if (state === prev) return 'none';

  // ── Fields that REQUIRE a full shell rebuild ─────────────────────
  // Any non-identity change here ⇒ 'full'. Listed individually so
  // the impact of adding a new AppState field is auditable in code
  // review (the default is 'full' until it's added to one of the
  // narrower buckets below).
  if (state.phase !== prev.phase) return 'full';
  if (state.container !== prev.container) return 'full';
  // pgc-208:selectedLid / multiSelectedLids / navHistory / navIndex /
  // collapsedFolders / textlogSelection / textToTextlogModal の 7 fields
  // は SELECT_ENTRY reducer が変化させる set(`SELECT_ENTRY` / `GO_BACK` /
  // `GO_FORWARD` で同じ pattern)。これらが ONLY changed なら
  // 'selection-only' で sidebar + center + meta 差し替えに限定する。
  // 1 個でも他 field が変わった場合は full に fall through。
  // selectedLid 単独 check は最後に行う(他 'full' trigger が先行)。
  if (state.editingLid !== prev.editingLid) return 'full';
  if (state.editingBase !== prev.editingBase) return 'full';
  if (state.error !== prev.error) return 'full';
  if (state.embedded !== prev.embedded) return 'full';
  if (state.readonly !== prev.readonly) return 'full';
  if (state.lightSource !== prev.lightSource) return 'full';
  if (state.viewOnlySource !== prev.viewOnlySource) return 'full';
  if (state.pendingOffers !== prev.pendingOffers) return 'full';
  if (state.importPreview !== prev.importPreview) return 'full';
  if (state.importMode !== prev.importMode) return 'full';
  if (state.mergeConflicts !== prev.mergeConflicts) return 'full';
  if (state.mergeConflictResolutions !== prev.mergeConflictResolutions) return 'full';
  if (state.batchImportPreview !== prev.batchImportPreview) return 'full';
  if (state.batchImportResult !== prev.batchImportResult) return 'full';
  if (state.exportMode !== prev.exportMode) return 'full';
  if (state.exportMutability !== prev.exportMutability) return 'full';
  if (state.menuOpen !== prev.menuOpen) return 'full';
  if (state.linkMigrationDialogOpen !== prev.linkMigrationDialogOpen) return 'full';
  if (state.linkMigrationLastApplyResult !== prev.linkMigrationLastApplyResult) return 'full';
  if (state.viewMode !== prev.viewMode) return 'full';
  if (state.filerScope !== prev.filerScope) return 'full';
  if (state.graphMode !== prev.graphMode) return 'full';
  if (state.graphFocusLid !== prev.graphFocusLid) return 'full';
  if (state.inventoryQuery !== prev.inventoryQuery) return 'full';
  if (state.filerExplorerSort !== prev.filerExplorerSort) return 'full';
  if (state.filerSearchQuery !== prev.filerSearchQuery) return 'full';
  if (state.graphVennGroupingMode !== prev.graphVennGroupingMode) return 'full';
  if (state.graphRegionSelectMode !== prev.graphRegionSelectMode) return 'full';
  if (state.graphRegionSelectedLids !== prev.graphRegionSelectedLids) return 'full';
  if (state.calendarYear !== prev.calendarYear) return 'full';
  if (state.calendarMonth !== prev.calendarMonth) return 'full';
  if (state.storageProfileOpen !== prev.storageProfileOpen) return 'full';
  if (state.shortcutHelpOpen !== prev.shortcutHelpOpen) return 'full';
  if (state.flagsInspectorOpen !== prev.flagsInspectorOpen) return 'full';
  if (state.todoAddPopover !== prev.todoAddPopover) return 'full';
  if (state.recentEntryRefLids !== prev.recentEntryRefLids) return 'full';
  if (state.dualEditConflict !== prev.dualEditConflict) return 'full';
  if (state.editMode !== prev.editMode) return 'full';
  if (state.childWindowLids !== prev.childWindowLids) return 'full';
  if (state.sidebarFilerQuery !== prev.sidebarFilerQuery) return 'full';
  if (state.metaPaneMode !== prev.metaPaneMode) return 'full';

  // ── pgc-208 SELECTION-ONLY scope check ───────────────────────────
  // SELECT_ENTRY が変える 7 fields のうち selectedLid / multiSelectedLids /
  // textlogSelection / textToTextlogModal / collapsedFolders の差分を
  // selection-only に集約。navHistory / navIndex は SELECT_ENTRY 専用 mutate
  // で、selection-only path 内で navHistory consumer(breadcrumb の back/
  // forward 状態など)は header 据え置きでも次回 full render で同期されるため
  // 体感上問題なし。
  // pgc-208:collapsedFolders は selection-only と sidebar-only の両 axis に
  // 跨る(SELECT_ENTRY revealInSidebar=true で expand される / user 明示
  // collapse/expand で変化)。両軸 重複を避けるため selection-only check
  // からは外す ── selectedLid とセットで変わる典型 case では selectedLid
  // 側の signal で selection-only に振り分けられる、collapsedFolders 単独
  // 変化は sidebar-only に流す(現状 test の後方互換)。
  const selectionChanged =
    state.selectedLid !== prev.selectedLid
    || state.multiSelectedLids !== prev.multiSelectedLids
    || state.textlogSelection !== prev.textlogSelection
    || state.textToTextlogModal !== prev.textToTextlogModal
    || state.navHistory !== prev.navHistory
    || state.navIndex !== prev.navIndex;

  // ── Fields the SIDEBAR consumes exclusively ──────────────────────
  // When ONLY these change, the center / meta / header / overlays
  // are unchanged and the sidebar can be rebuilt in place.
  //
  // Conservative additions:
  //   - search axes (text query / archetype / tag / color / categorical
  //     peer)
  //   - sort key + direction
  //   - toggle filters (archived / bucket-hide / unref-only / advanced
  //     disclosure / archetype-filter expansion)
  //   - sidebar UI memory (collapsed folders, recent-pane collapse)
  //
  // NOT included (kept in the 'full' bucket):
  //   - selectedLid (highlights a row AND swaps center+meta — would
  //     leave them stale)
  //   - container (relations / entries change ⇒ tree shape, ASSETS
  //     bucket-hide accounting, link index, connectedness all need
  //     re-derivation downstream of just the sidebar — full is
  //     simpler than tracking those)
  //   - editingLid (entry-window-open class, action bar in center,
  //     sidebar selection class all need a matched render)
  const sidebarOnlyChanged =
    state.searchQuery !== prev.searchQuery
    || state.archetypeFilter !== prev.archetypeFilter
    || state.archetypeFilterExpanded !== prev.archetypeFilterExpanded
    || state.tagFilter !== prev.tagFilter
    || state.colorTagFilter !== prev.colorTagFilter
    || state.categoricalPeerFilter !== prev.categoricalPeerFilter
    || state.sortKey !== prev.sortKey
    || state.sortDirection !== prev.sortDirection
    || state.showArchived !== prev.showArchived
    || state.searchHideBuckets !== prev.searchHideBuckets
    || state.unreferencedAttachmentsOnly !== prev.unreferencedAttachmentsOnly
    || state.treeHideBuckets !== prev.treeHideBuckets
    || state.advancedFiltersOpen !== prev.advancedFiltersOpen
    || state.collapsedFolders !== prev.collapsedFolders
    || state.recentPaneCollapsed !== prev.recentPaneCollapsed;

  // ── Settings-only path ───────────────────────────────────────────
  // `applySystemSettings(root, settings, state)` only writes
  // `data-pkc-theme` / `data-pkc-scanline` / `--c-accent` /
  // `html.lang` on root. None of those affect the sidebar / center /
  // meta DOM tree, so a settings-only delta does NOT require a
  // shell rebuild.
  //
  // Mirror fields (`showScanline` / `accentColor`) live alongside
  // `settings` and are derived from it during boot replay; treat
  // them under the same scope.
  const settingsChanged =
    state.settings !== prev.settings
    || state.showScanline !== prev.showScanline
    || state.accentColor !== prev.accentColor;

  // ── Render-irrelevant fields ─────────────────────────────────────
  // Currently: `pendingNav` (its `ticket` is consumed by the post-
  // render scroll tracker, not by the renderer itself; the tracker
  // is invoked from the main.ts subscriber so the renderer doesn't
  // need to fire). If a future field joins this bucket, list it
  // here AND verify the renderer never reads it.
  //
  // Note: even though pendingNav is render-irrelevant, the main.ts
  // subscriber's post-render hook (`locationNavTracker.consume`)
  // DOES need to run on every dispatch. The 'none' scope handles
  // that by letting main.ts run its post-hooks regardless of the
  // renderer's decision — see `main.ts` for the integration.

  // ── Combination resolution ──────────────────────────────────────
  // Multiple narrow buckets changed → fall back to 'full' since the
  // narrow paths are designed to be standalone. This keeps the
  // optimization correct without trying to be clever.
  // pgc-208:selection-only も同様、他 narrow scope と独立に判定。
  if (selectionChanged && sidebarOnlyChanged && settingsChanged) return 'full';
  if (selectionChanged && sidebarOnlyChanged) return 'full';
  if (selectionChanged && settingsChanged) return 'full';
  if (sidebarOnlyChanged && settingsChanged) return 'full';
  if (selectionChanged) return 'selection-only';
  if (sidebarOnlyChanged) return 'sidebar-only';
  if (settingsChanged) return 'settings-only';

  return 'none';
}
