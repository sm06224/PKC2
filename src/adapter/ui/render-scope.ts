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
 *   - `'selection'`      only `selectedLid` changed (plain navigation):
 *                        move the sidebar selection highlight in place
 *                        + replace center / meta / header regions, WITHOUT
 *                        rebuilding the O(N) sidebar tree (L1 #693). See
 *                        `replaceSelectionRegions` in renderer.ts.
 *   - `'entry-body'`     a single todo entry's body changed in a way that
 *                        cannot affect link index / membership / sort order
 *                        (status toggle): swap just that ONE sidebar row +
 *                        center + meta, leaving the other N-1 rows untouched
 *                        (L1 #693 PR-2). See `replaceEntryBodyRegions`.
 *   - `'full'`           current full-shell rebuild
 */

import type { AppState } from '../state/app-state';
import { parseTodoBody } from '../../features/todo/todo-body';

export type RenderScope =
  | 'none'
  | 'settings-only'
  | 'sidebar-only'
  | 'selection'
  | 'entry-body'
  | 'full';

/**
 * Detect a `'entry-body'`-eligible container delta (L1 #693 PR-2).
 *
 * Returns the lid of the single changed entry when prev → state is a
 * QUICK_UPDATE-style body-only mutation of ONE todo entry whose change
 * provably cannot ripple beyond its own row:
 *
 *   - exactly one entry differs (by reference), matched by lid at the
 *     same array index (no reorder of the source array);
 *   - title + archetype preserved, archetype === 'todo';
 *   - todo `description` unchanged ⇒ link index (which scans the todo
 *     description for entry-refs) is identical ⇒ connectedness / backlink
 *     badges on every row are unchanged;
 *   - todo `archived` flag unchanged ⇒ tree membership under the
 *     `showArchived` filter is unchanged;
 *   - `relations` and `assets` keep identity.
 *
 * `updated_at` is expected to bump and a revision snapshot to be appended
 * — neither affects the sidebar row structure (only the meta history,
 * which the entry-body path re-renders). Returns `null` when any condition
 * fails, so the caller falls back to `'full'`.
 */
export function findEntryBodyChangeLid(prev: AppState, state: AppState): string | null {
  const pc = prev.container;
  const nc = state.container;
  if (!pc || !nc || pc === nc) return null;
  if (pc.relations !== nc.relations) return null;
  if (pc.assets !== nc.assets) return null;
  if (pc.entries.length !== nc.entries.length) return null;

  let changedLid: string | null = null;
  for (let i = 0; i < nc.entries.length; i++) {
    const ne = nc.entries[i]!;
    const pe = pc.entries[i]!;
    if (ne === pe) continue;
    // Reorder (different lid at the same index) is not a body-only delta.
    if (ne.lid !== pe.lid) return null;
    if (changedLid !== null) return null; // more than one entry changed
    if (ne.title !== pe.title) return null;
    if (ne.archetype !== pe.archetype) return null;
    if (ne.archetype !== 'todo') return null;
    const pb = parseTodoBody(pe.body);
    const nb = parseTodoBody(ne.body);
    if (pb.description !== nb.description) return null; // link-safe
    if ((pb.archived ?? false) !== (nb.archived ?? false)) return null; // membership-safe
    changedLid = ne.lid;
  }
  return changedLid;
}

/** Whether any sidebar filter is active (⇒ flat list mode, not tree). */
function hasAnyActiveFilter(state: AppState): boolean {
  return (
    state.searchQuery.trim().length > 0
    || state.archetypeFilter.size > 0
    || (state.tagFilter?.size ?? 0) > 0
    || (state.colorTagFilter?.size ?? 0) > 0
    || state.categoricalPeerFilter != null
    || state.unreferencedAttachmentsOnly === true
  );
}

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
  // `container` is an immediate-full trigger EXCEPT for the narrow
  // `'entry-body'` case (a single todo body-only mutation), which is
  // resolved in the combination section below. Any other container change
  // still falls to 'full' here.
  const entryBodyChangeLid =
    state.container !== prev.container ? findEntryBodyChangeLid(prev, state) : null;
  if (state.container !== prev.container && entryBodyChangeLid === null) return 'full';
  // `selectedLid` is intentionally NOT an immediate-full trigger anymore
  // (L1 #693). It is resolved in the combination section below: when ONLY
  // selection changed (every other full/sidebar trigger identical) we return
  // `'selection'`, otherwise it still falls through to `'full'`. Because all
  // the other immediate-full checks below still run, any co-varying field
  // keeps forcing `'full'`, so a new unenumerated field can never be silently
  // absorbed into the selection short-circuit.
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
  // PR-NNN (2026-05-06、user 修正指示6「Filer の検索窓が活きていない」):
  // `SET_FILER_SEARCH_QUERY` dispatch で `filerSearchQuery` のみ変わる
  // ケースで render-scope が `'none'` を返し、filter が画面に反映され
  // ない bug。`'full'` trigger に追加して filer 再描画を起こす。
  if (state.filerSearchQuery !== prev.filerSearchQuery) return 'full';
  // PR-Δ9 (2026-05-07、user 報告「グラフの Venn と region ボタンが
  // 押しても反応しない」):graphVennGroupingMode / graphRegionSelectMode /
  // graphRegionSelectedLids が full-trigger に無いため、toggle dispatch
  // しても再描画されず button visual が固まっていた。PR-NNN と同型 bug。
  if (state.graphVennGroupingMode !== prev.graphVennGroupingMode) return 'full';
  if (state.graphRegionSelectMode !== prev.graphRegionSelectMode) return 'full';
  if (state.graphRegionSelectedLids !== prev.graphRegionSelectedLids) return 'full';
  if (state.calendarYear !== prev.calendarYear) return 'full';
  if (state.calendarMonth !== prev.calendarMonth) return 'full';
  // `multiSelectedLids` / `textlogSelection` / `textToTextlogModal` are NOT
  // immediate-full triggers: SELECT_ENTRY clears them on every plain
  // navigation, so leaving them here would defeat the `'selection'` scope.
  // They are resolved in the combination section below — forced to `'full'`
  // when they change WITHOUT a selection change, and absorbed by the
  // selection DOM path (which rebuilds center + clears multi highlight)
  // when they change alongside it.
  if (state.storageProfileOpen !== prev.storageProfileOpen) return 'full';
  if (state.shortcutHelpOpen !== prev.shortcutHelpOpen) return 'full';
  if (state.flagsInspectorOpen !== prev.flagsInspectorOpen) return 'full';
  if (state.todoAddPopover !== prev.todoAddPopover) return 'full';
  if (state.recentEntryRefLids !== prev.recentEntryRefLids) return 'full';
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

  // ── Selection resolution (L1 #693) ──────────────────────────────
  // Reaching here means every immediate-full trigger above is identical
  // (container / editingLid / phase / viewMode / overlays / …). The only
  // fields that can still differ are: selectedLid, the three selection-
  // adjacent fields (multi / textlog / textToTextlog), and the sidebar /
  // settings buckets computed above.
  const selectionChanged = state.selectedLid !== prev.selectedLid;
  // The multi-select action bar (renderSidebarImpl) appears iff
  // multiSelectedLids is non-empty. The `'selection'` DOM path does NOT
  // rebuild the sidebar, so it cannot make that bar appear/disappear —
  // restrict `'selection'` to plain navigation where the bar's presence
  // is unchanged (both empty; SELECT_ENTRY always clears to []).
  const noMultiBarTransition =
    state.multiSelectedLids.length === 0 && prev.multiSelectedLids.length === 0;

  if (selectionChanged) {
    // Co-varying narrow buckets ⇒ fall back to 'full' (the selection path
    // is standalone, like sidebar-only). A multi-bar transition also needs
    // the full sidebar rebuild.
    if (sidebarOnlyChanged || settingsChanged || !noMultiBarTransition) return 'full';
    return 'selection';
  }

  // ── Entry-body resolution (L1 #693 PR-2) ────────────────────────
  // A single todo body-only mutation (QUICK_UPDATE status toggle). Reaching
  // here means selectedLid / editingLid / phase / viewMode / overlays are
  // unchanged. Restrict to the localization-safe configuration: detail view
  // (filer/kanban sidebars render differently), a position-stable sort
  // (`updated_at` bumps on every body write and would reorder the row), and
  // no active filter (which switches the sidebar to flat-list mode). Any
  // co-varying narrow bucket ⇒ 'full'.
  if (entryBodyChangeLid !== null) {
    if (sidebarOnlyChanged || settingsChanged || !noMultiBarTransition) return 'full';
    if (state.multiSelectedLids !== prev.multiSelectedLids) return 'full';
    if (state.textlogSelection !== prev.textlogSelection) return 'full';
    if (state.textToTextlogModal !== prev.textToTextlogModal) return 'full';
    if (state.viewMode !== 'detail') return 'full';
    if (state.sortKey === 'updated_at') return 'full';
    if (hasAnyActiveFilter(state)) return 'full';
    return 'entry-body';
  }

  // selectedLid did NOT change → preserve prior behaviour: these fields
  // each forced 'full' before #693 carved them out of the immediate list.
  if (state.multiSelectedLids !== prev.multiSelectedLids) return 'full';
  if (state.textlogSelection !== prev.textlogSelection) return 'full';
  if (state.textToTextlogModal !== prev.textToTextlogModal) return 'full';

  // ── Combination resolution ──────────────────────────────────────
  // Multiple narrow buckets changed → fall back to 'full' since the
  // narrow paths are designed to be standalone. This keeps the
  // optimization correct without trying to be clever.
  if (sidebarOnlyChanged && settingsChanged) return 'full';
  if (sidebarOnlyChanged) return 'sidebar-only';
  if (settingsChanged) return 'settings-only';

  return 'none';
}
