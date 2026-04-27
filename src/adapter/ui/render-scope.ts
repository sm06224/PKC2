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

export type RenderScope = 'none' | 'settings-only' | 'sidebar-only' | 'full';

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
  if (state.selectedLid !== prev.selectedLid) return 'full';
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
  if (state.calendarYear !== prev.calendarYear) return 'full';
  if (state.calendarMonth !== prev.calendarMonth) return 'full';
  if (state.multiSelectedLids !== prev.multiSelectedLids) return 'full';
  if (state.storageProfileOpen !== prev.storageProfileOpen) return 'full';
  if (state.shortcutHelpOpen !== prev.shortcutHelpOpen) return 'full';
  if (state.todoAddPopover !== prev.todoAddPopover) return 'full';
  if (state.recentEntryRefLids !== prev.recentEntryRefLids) return 'full';
  if (state.textlogSelection !== prev.textlogSelection) return 'full';
  if (state.textToTextlogModal !== prev.textToTextlogModal) return 'full';
  if (state.dualEditConflict !== prev.dualEditConflict) return 'full';

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
  if (sidebarOnlyChanged && settingsChanged) return 'full';
  if (sidebarOnlyChanged) return 'sidebar-only';
  if (settingsChanged) return 'settings-only';

  return 'none';
}
