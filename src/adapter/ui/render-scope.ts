/**
 * PR #177 — render-scope detection.
 *
 * Goal: short-circuit the renderer subscriber when a dispatch's
 * state delta does not require a full-shell rebuild. The bench
 * (PR #176) showed two clear targets:
 *
 *   - cold-boot `dispatch:RESTORE_SETTINGS` = ~180 ms at 1000
 *     entries — entirely the listener-flush full-shell repaint
 *     even though settings hydrating from null→defaults produces
 *     no visible change beyond a few `data-pkc-theme` attrs on
 *     `#pkc-root`.
 *   - dispatches that touch only fields the renderer doesn't read
 *     (e.g. mid-debug `pendingNav` ticket bumps) — the renderer
 *     should be a no-op.
 *
 * Conservative policy: when in doubt, return `'full'`. Misclassifying
 * a delta as `'settings-only'` or `'none'` could leave the UI stale,
 * so each non-full bucket lists EVERY field it considers safe to
 * ignore. New AppState fields default to `'full'` because they're
 * not yet enumerated here.
 *
 * Scope kinds (current pass — region scopes are deferred to PR #178+):
 *   - `'none'`           no DOM work needed
 *   - `'settings-only'`  only `applySystemSettings(root, …)` runs
 *   - `'full'`           current full-shell rebuild
 */

import type { AppState } from '../state/app-state';

export type RenderScope = 'none' | 'settings-only' | 'full';

/**
 * Compute the minimum render work required to bring the DOM in sync
 * with `state`, given that the last successful render rendered
 * `prev`. Returns `'full'` whenever:
 *
 *   - `prev` is `null` (first mount, no baseline to diff against)
 *   - any field NOT enumerated as settings-mirror or scope-trivial
 *     differs in identity (`!==`)
 *
 * Identity checks only — value-equality on settings is not done
 * here because the renderer's `applySystemSettings` is itself
 * idempotent and cheap, so re-running it with structurally-equal
 * settings is harmless.
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
  if (state.searchQuery !== prev.searchQuery) return 'full';
  if (state.archetypeFilter !== prev.archetypeFilter) return 'full';
  if (state.archetypeFilterExpanded !== prev.archetypeFilterExpanded) return 'full';
  if (state.tagFilter !== prev.tagFilter) return 'full';
  if (state.colorTagFilter !== prev.colorTagFilter) return 'full';
  if (state.categoricalPeerFilter !== prev.categoricalPeerFilter) return 'full';
  if (state.sortKey !== prev.sortKey) return 'full';
  if (state.sortDirection !== prev.sortDirection) return 'full';
  if (state.exportMode !== prev.exportMode) return 'full';
  if (state.exportMutability !== prev.exportMutability) return 'full';
  if (state.menuOpen !== prev.menuOpen) return 'full';
  if (state.linkMigrationDialogOpen !== prev.linkMigrationDialogOpen) return 'full';
  if (state.linkMigrationLastApplyResult !== prev.linkMigrationLastApplyResult) return 'full';
  if (state.showArchived !== prev.showArchived) return 'full';
  if (state.searchHideBuckets !== prev.searchHideBuckets) return 'full';
  if (state.unreferencedAttachmentsOnly !== prev.unreferencedAttachmentsOnly) return 'full';
  if (state.treeHideBuckets !== prev.treeHideBuckets) return 'full';
  if (state.advancedFiltersOpen !== prev.advancedFiltersOpen) return 'full';
  if (state.viewMode !== prev.viewMode) return 'full';
  if (state.calendarYear !== prev.calendarYear) return 'full';
  if (state.calendarMonth !== prev.calendarMonth) return 'full';
  if (state.multiSelectedLids !== prev.multiSelectedLids) return 'full';
  if (state.collapsedFolders !== prev.collapsedFolders) return 'full';
  if (state.recentPaneCollapsed !== prev.recentPaneCollapsed) return 'full';
  if (state.storageProfileOpen !== prev.storageProfileOpen) return 'full';
  if (state.shortcutHelpOpen !== prev.shortcutHelpOpen) return 'full';
  if (state.todoAddPopover !== prev.todoAddPopover) return 'full';
  if (state.recentEntryRefLids !== prev.recentEntryRefLids) return 'full';
  if (state.textlogSelection !== prev.textlogSelection) return 'full';
  if (state.textToTextlogModal !== prev.textToTextlogModal) return 'full';
  if (state.dualEditConflict !== prev.dualEditConflict) return 'full';

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

  if (settingsChanged) return 'settings-only';

  return 'none';
}
