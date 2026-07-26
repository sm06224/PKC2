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
 *   - `'assets-only'`    only `container.assets` changed identity (the
 *                        working-set republishing resident asset bytes via
 *                        SET_WORKING_SET_ASSETS, #868 段階3). Only the center
 *                        + meta panes consume asset bytes; the O(N) sidebar
 *                        tree / header / overlays never read them. See
 *                        `replaceAssetRegions`.
 *   - `'calendar-only'`  only `calendarYear` / `calendarMonth` changed
 *                        (SET_CALENDAR_MONTH = 月送り) while the calendar
 *                        view is showing (#938 R8). The month is consumed
 *                        exclusively by the calendar grid inside the center
 *                        pane — sidebar / header / meta / overlays never
 *                        read it — so only the center region is swapped.
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
  | 'assets-only'
  | 'calendar-only'
  | 'full';

/**
 * Detect an `'assets-only'`-eligible container delta (#868 段階3 遅延 asset).
 *
 * `SET_WORKING_SET_ASSETS` clones the container with ONLY `assets` swapped
 * (`{ ...container, assets }` — entries / relations / revisions / meta keep
 * identity). Under lazy loading this dispatch lands asynchronously tens–
 * hundreds of ms AFTER the first paint of an open/save, and classifying it
 * `'full'` produced a visible whole-shell wipe+rebuild flash (user report
 * 2026-07「編集保存後や開いた直後にレンダリングが遅れる」).
 *
 * The check is generic over the container's keys so a future Container
 * field cannot be silently absorbed: every key except `assets` must keep
 * reference identity.
 */
export function isAssetsOnlyContainerDelta(prev: AppState, state: AppState): boolean {
  const pc = prev.container;
  const nc = state.container;
  if (!pc || !nc || pc === nc) return false;
  if (pc.assets === nc.assets) return false;
  const keys = new Set([...Object.keys(pc), ...Object.keys(nc)]);
  for (const k of keys) {
    if (k === 'assets') continue;
    if ((pc as unknown as Record<string, unknown>)[k]
      !== (nc as unknown as Record<string, unknown>)[k]) return false;
  }
  return true;
}

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
/**
 * 全シェル再構築のときに、**サイドバーの行リスト DOM をそのまま使い回してよいか**
 * (2026-07-26)。
 *
 * なぜ要るか ── `phase` が変わると `computeRenderScope` は無条件に `'full'` を返す
 * (下の :183)。編集の開始(`ready → editing`)と確定(`editing → ready`)がそれで、
 * **1 編集につき 5000 行のサイドバーを 2 回作り直していた**。
 *
 * 実測(N=5000 / M=15000、long task を直接観測):
 *   1 編集あたりメインスレッド停止 **約 670 ms**(保存の寄与は −16 ms = ほぼゼロ)
 *   ⇒ 体感を殺していたのは保存ではなく **描画**だった
 *
 * 行リストの中身は `phase` に依存しない。サイドバーで `phase` を読むのは
 * 周辺の 4 箇所だけで(空状態の案内 / ルートへのドロップ枠 / ゴミ箱ペイン /
 * ファイルドロップ枠)、**いずれも O(N) の行ループの外**にある。
 * よって行リストだけ使い回し、サイドバーの残りは従来どおり組み直せば、
 * **挙動を一切変えずに** O(N) を消せる。
 *
 * ⚠ **保守的**(迷ったら false)。ここが誤ると「古い行が残る」= user から見て
 * データが壊れたのと区別がつかない。判定は
 * 「**`phase` と `editingLid` 以外のすべてが同一参照/同値**」に限定する。
 * 行の内容に効きうる入力(container / 検索 / 絞り込み / 並べ替え / view /
 * 折りたたみ / sidebar mode …)は 1 つでも動いたら false。
 */
export function canReuseEntryList(prev: AppState | null, state: AppState): boolean {
  if (prev === null || prev === state) return false;
  // 対象は編集の出入りだけ。他の phase 遷移(initializing / exporting / error)は
  // シェルの形自体が変わりうるので対象外。
  const editPhases = new Set(['ready', 'editing']);
  if (!editPhases.has(prev.phase) || !editPhases.has(state.phase)) return false;
  if (prev.phase === state.phase) return false;

  // `phase` / `editingLid` **以外**が 1 つでも違えば使い回さない。
  // AppState に新しい field が増えても、既定で false に倒れる書き方にする。
  const keys = new Set([...Object.keys(prev), ...Object.keys(state)]) as Set<keyof AppState>;
  for (const k of keys) {
    if (k === 'phase' || k === 'editingLid') continue;
    if (prev[k] !== state[k]) return false;
  }
  return true;
}

export function computeRenderScope(state: AppState, prev: AppState | null): RenderScope {
  if (prev === null) return 'full';
  if (state === prev) return 'none';

  // ── Fields that REQUIRE a full shell rebuild ─────────────────────
  // Any non-identity change here ⇒ 'full'. Listed individually so
  // the impact of adding a new AppState field is auditable in code
  // review (the default is 'full' until it's added to one of the
  // narrower buckets below).
  if (state.phase !== prev.phase) return 'full';
  // `container` is an immediate-full trigger EXCEPT for two narrow cases
  // resolved in the combination section below: `'entry-body'` (a single
  // todo body-only mutation) and `'assets-only'` (working-set republish of
  // resident asset bytes, #868). Any other container change still falls to
  // 'full' here.
  const containerChanged = state.container !== prev.container;
  const entryBodyChangeLid = containerChanged ? findEntryBodyChangeLid(prev, state) : null;
  const assetsOnlyChange =
    containerChanged && entryBodyChangeLid === null && isAssetsOnlyContainerDelta(prev, state);
  if (containerChanged && entryBodyChangeLid === null && !assetsOnlyChange) return 'full';
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
  if (state.availableContainers !== prev.availableContainers) return 'full';
  if (state.workspaces !== prev.workspaces) return 'full';
  if (state.activeWorkspaceId !== prev.activeWorkspaceId) return 'full';
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
  if (state.inventoryQuery !== prev.inventoryQuery) return 'full';
  if (state.filerExplorerSort !== prev.filerExplorerSort) return 'full';
  // PR-NNN (2026-05-06、user 修正指示6「Filer の検索窓が活きていない」):
  // `SET_FILER_SEARCH_QUERY` dispatch で `filerSearchQuery` のみ変わる
  // ケースで render-scope が `'none'` を返し、filter が画面に反映され
  // ない bug。`'full'` trigger に追加して filer 再描画を起こす。
  if (state.filerSearchQuery !== prev.filerSearchQuery) return 'full';
  // `calendarYear` / `calendarMonth`(月送り)は immediate-full から #938 R8
  // で外した。calendar view 表示中で他 bucket が全て不変なら、下の
  // combination section が `'calendar-only'` に解決する。co-varying な変化は
  // 各 narrow 解決 block 内の guard と最後の fall-through が 'full' に落とす
  // ため、他 field と同時変化が narrow scope に吸収されることはない。
  const calendarNavChanged =
    state.calendarYear !== prev.calendarYear || state.calendarMonth !== prev.calendarMonth;
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
  // Edit-mode picker (inline / window) and meta-pane mode tabs: UI toggles that
  // change only these AppState fields. They were never enumerated, so the
  // fall-through returned 'none' and pressing the toggle did not re-render
  // (user report 2026-06). Both affect the rendered shell → 'full'.
  if (state.editMode !== prev.editMode) return 'full';
  if (state.metaPaneMode !== prev.metaPaneMode) return 'full';
  // `childWindowLids` (set by `SYS_SYNC_CHILD_WINDOWS` on entry-window
  // open/close) was never enumerated, so a dispatch that changes ONLY it
  // fell through to 'none'. That broke the sidebar/meta expand path: when a
  // collapsed pane is re-opened, `togglePane` dispatches SYS_SYNC_CHILD_WINDOWS
  // specifically to force a full render that rebuilds the lazy placeholder —
  // but render-scope swallowed it, leaving the pane visually empty until an
  // unrelated 'full' (e.g. switching detail↔another tab) rebuilt it (user
  // report 2026-06「サイドのパネルが描画されていないことがある / detailと他の
  // タブを行ったり来たりすると直る」). Entry-window open/close also marks the
  // owning sidebar row, so a shell rebuild is the correct response. → 'full'.
  if (state.childWindowLids !== prev.childWindowLids) return 'full';

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

  // ── Assets-only resolution (#868 段階3) ──────────────────────────
  // The working-set republished resident asset bytes. Only the center +
  // meta panes read `container.assets` synchronously (filer cards /
  // launcher icons / detail markdown embeds / attachment preview);
  // sidebar rows get their thumbnails from the async
  // `populateAttachmentPreviews` pass which main.ts re-runs for this
  // scope. Restricted to `phase === 'ready'`: during `editing` the
  // center hosts the live editor (renderEditor also reads assets for
  // its preview) and swapping it mid-keystroke is not worth the risk —
  // 'full' keeps the pre-#868 behaviour there. Any co-varying narrow
  // bucket ⇒ 'full', same doctrine as the other scopes.
  if (assetsOnlyChange) {
    if (state.phase !== 'ready') return 'full';
    if (selectionChanged || sidebarOnlyChanged || settingsChanged || !noMultiBarTransition) {
      return 'full';
    }
    if (calendarNavChanged) return 'full';
    if (state.multiSelectedLids !== prev.multiSelectedLids) return 'full';
    if (state.textlogSelection !== prev.textlogSelection) return 'full';
    if (state.textToTextlogModal !== prev.textToTextlogModal) return 'full';
    return 'assets-only';
  }

  if (selectionChanged) {
    // Co-varying narrow buckets ⇒ fall back to 'full' (the selection path
    // is standalone, like sidebar-only). A multi-bar transition also needs
    // the full sidebar rebuild.
    if (sidebarOnlyChanged || settingsChanged || !noMultiBarTransition) return 'full';
    if (calendarNavChanged) return 'full';
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
    if (calendarNavChanged) return 'full';
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

  // ── Calendar-nav resolution (#938 R8) ───────────────────────────
  // Reaching here means EVERY other trigger is identical (container /
  // selection / phase / viewMode / overlays / multi / textlog) — the only
  // remaining candidates are calendar nav and the sidebar / settings
  // buckets. SET_CALENDAR_MONTH(月送り)changes ONLY the two calendar
  // fields, so the common case resolves here. The month is consumed
  // exclusively by the calendar grid in the center pane; restrict to the
  // calendar view actually showing (any other view ⇒ 'full',保守的)and
  // ready phase. Co-varying sidebar / settings buckets ⇒ 'full'.
  if (calendarNavChanged) {
    if (state.phase !== 'ready') return 'full';
    if (state.viewMode !== 'calendar') return 'full';
    if (sidebarOnlyChanged || settingsChanged) return 'full';
    return 'calendar-only';
  }

  // ── Combination resolution ──────────────────────────────────────
  // Multiple narrow buckets changed → fall back to 'full' since the
  // narrow paths are designed to be standalone. This keeps the
  // optimization correct without trying to be clever.
  if (sidebarOnlyChanged && settingsChanged) return 'full';
  if (sidebarOnlyChanged) return 'sidebar-only';
  if (settingsChanged) return 'settings-only';

  return 'none';
}
