import type { AppState } from '../state/app-state';
import type { Entry } from '../../core/model/record';
import { ABOUT_LID, isReservedLid, isSystemArchetype } from '../../core/model/record';
import { isColorTagId, COLOR_TAG_IDS } from '../../features/color/color-palette';
import { renderColorPickerTrigger } from './color-picker';
import { renderFlagsInspector } from './flags-inspector';
import { applyThemeScale } from './theme-scale';
import {
  getActiveFlagCount as getActiveFlagCountForAbout,
  setContainerFlagSource as setFlagsInspectorContainerSource,
} from '../flags';
import { resolveFlagsPayload } from '../../core/model/system-flags-payload';
import { renderFloatingTrigger, renderFloatingPopup } from './snippet-toolbar';
import { renderMediaViewer } from './media-viewer';
import { renderFormatPanel, formatPanelEnabled } from './format-panel';
import {
  metaPaneYamlGraphicalEnabled,
  metaPaneModeTabsEnabled,
} from './meta-pane-flags';
import { shellEditModeEnabled, shellTabsEnabled, shellSplitViewEnabled, shellNewButtonPickerEnabled, shellDataInShellMenuEnabled, shellBackForwardInBreadcrumbEnabled, shellActivityBarEnabled, shellFormatPanelDefaultHiddenEnabled, shellViewModeTabsScopedEnabled, shellMetaPaneReferencesClarifyEnabled, shellAboutPkcMarkdownShowcaseEnabled, shellEditorFooterWordcountEnabled, shellTodoOverdueIndicatorEnabled, shellTrayBarSlimEnabled, shellHeaderCompactEnabled, shellRevisionDiffViewerEnabled, shellLauncherUrlTilesEnabled, shellCompactEntryLabelsEnabled, sidebarVirtualListEnabled } from './shell-flags';
import { sortLauncherTiles, normalizeGroup } from '@features/launcher/tile-order';
import { diffRows } from '../../features/diff/line-diff';
import { buildEditorFooterWordcount } from './editor-footer-wordcount';
import { buildAboutShowcaseElement } from './about-showcase';
import { isFormatPanelVisible, buildFormatPanelToggleButton } from './format-panel-visibility';
import { buildActivityBarElement, buildActivityTabPlaceholder, getActivityBarActiveTab, getActivityBarSide } from './activity-bar';
import { buildOutlineTab } from './activity-outline-tab';
import { buildRecentTab } from './activity-recent-tab';
import { buildPinnedTab } from './activity-pinned-tab';
import { buildSearchTab } from './activity-search-tab';
import { buildRelationsTab } from './activity-relations-tab';
import { buildTabStripElement } from './tab-strip';
import { isSplitViewOpen, buildSplitViewElement } from './split-view';
import { renderImagePreviewModal } from './image-preview';
import { autoDetectFilerProfile } from '../../features/filer/auto-display-profile';
import { isExplicitAlbum } from '../../features/album/album-metadata';
import { sidebarMode, folderDetailAsFiler } from './sidebar-flags';
import { getFilerThumbPx } from './filer-flags';
import type { Container } from '../../core/model/container';
import type { Revision } from '../../core/model/container';
import { resolveAboutPayload } from '../../core/model/about-payload';
import { SETTINGS_DEFAULTS, type SystemSettingsPayload } from '../../core/model/system-settings-payload';
import type { PendingOffer } from '../transport/record-offer-handler';
import type { ImportPreviewRef, BatchImportPreviewInfo, BatchImportResultSummary } from '../../core/action/system-command';
import { BUILD_FEATURES, VERSION } from '../../runtime/release-meta';
import { isContentModeEnabled, isRecordingEnabled } from '../../runtime/debug-flags';
import {
  getLatestRevision,
  getRestoreCandidates,
  getRevisionsByBulkId,
  getEntryRevisions,
  parseRevisionSnapshot,
} from '../../core/operations/container-ops';
import type { ArchetypeId, FilerProfile } from '../../core/model/record';
import { applyFilters } from '../../features/search/filter';
import { parseSearchQuery } from '../../features/search/query-parser';
import { sortEntries } from '../../features/search/sort';
import type { SortKey, SortDirection } from '../../features/search/sort';
import { applyManualOrder } from '../../features/entry-order/entry-order';
import { selectRecentEntries } from '../../features/entry-order/recent-entries';
import { findSubLocationHits, searchSublocScanMaxRows } from '../../features/search/sub-location-search';
import type { SubLocationHit } from '../../features/search/sub-location-search';
import { buildConnectedLidSet, buildInboundCountMap, getRelationsForEntry, resolveRelations } from '../../features/relation/selector';
import { buildConnectednessSets, type ConnectednessSets } from '../../features/connectedness';
import { getTagsForEntry } from '../../features/relation/tag-selector';
import { filterByTag } from '../../features/relation/tag-filter';
import {
  buildTree,
  sortTreeNodes,
  getBreadcrumb,
  getStructuralParent,
  collectDescendantLids,
  getStructuralChildren,
  getRootEntries,
  getAncestorFolderLids,
} from '../../features/relation/tree';
import { ARCHETYPE_SUBFOLDER_NAMES } from '../../features/relation/auto-placement';
import { collectUnreferencedAttachmentLids } from '../../features/asset/asset-scan';
import { getFilterIndexes, getTodosByDate } from './filter-cache';
import { shellStartupNoticeEnabled } from './startup-notice';
import { start as profileStart } from '../../runtime/profile';
import { computeRenderScope, findEntryBodyChangeLid, canReuseEntryList } from './render-scope';
import { recordVisibleOrder, getRecordedVisibleOrder } from './visible-order';
import { describeStorageEngine, getStorageEngineInfo } from '../platform/storage/storage-engine-info';
import {
  SIDEBAR_VIRTUAL_MIN_ROWS,
  applySpacers,
  computeWindowRange,
  measureUnitRowHeight,
  scrollOffsetForIndex,
  shouldVirtualize,
  type WindowRange,
} from './sidebar-window';
import type { TreeNode } from '../../features/relation/tree';
import type { RelationKind, Relation } from '../../core/model/relation';
import { getPresenter } from './detail-presenter';
import { syncTextlogSelectionFromState } from './textlog-selection';
import { syncTextToTextlogModalFromState } from './text-to-textlog-modal';
import { syncLinkMigrationDialogFromState } from './link-migration-dialog';
import { syncDualEditConflictOverlay } from './dual-edit-conflict-overlay';
import { syncTextlogPreviewModalFromState } from './textlog-preview-modal';
import { parseTodoBody as parseTodoBodyRaw, formatTodoDate, isTodoPastDue } from './todo-presenter';
import { parseAttachmentBody as parseAttachmentBodyRaw, classifyPreviewType, isHtml, isSvg, SANDBOX_ATTRIBUTES, SANDBOX_DESCRIPTIONS, setAttachmentLightSourceHint, isAttachmentLightSourceHint } from './attachment-presenter';
import type { TodoBody } from '../../features/todo/todo-body';
import type { AttachmentBody } from './attachment-presenter';

// #766 perf re-impl(pgc-241/242 を現 main に fresh 再実装): parseTodoBody /
// parseAttachmentBody は内部で JSON.parse(O(L))を実行し、sidebar / filer /
// detail render の hot path で per-entry に複数 site から呼ばれる。entry ref を
// optional key に取り WeakMap で memoize する。container は immutable update なので
// 編集された entry は新 ref になり cache は自動 invalidate(明示 cleanup 不要)。
// entry 未指定の呼出は raw parser に delegate するため後方互換は完全。
const todoBodyMemo = new WeakMap<Entry, TodoBody>();
function parseTodoBody(body: string, entry?: Entry): TodoBody {
  if (!entry) return parseTodoBodyRaw(body);
  const cached = todoBodyMemo.get(entry);
  if (cached) return cached;
  const parsed = parseTodoBodyRaw(body);
  todoBodyMemo.set(entry, parsed);
  return parsed;
}
const attachmentBodyMemo = new WeakMap<Entry, AttachmentBody>();
function parseAttachmentBody(body: string, entry?: Entry): AttachmentBody {
  if (!entry) return parseAttachmentBodyRaw(body);
  const cached = attachmentBodyMemo.get(entry);
  if (cached) return cached;
  const parsed = parseAttachmentBodyRaw(body);
  attachmentBodyMemo.set(entry, parsed);
  return parsed;
}
import { deriveDisplayFilename } from './image-optimize/paste-optimization';
import { getMonthGrid, dateKey, monthName } from '../../features/calendar/calendar-data';
import { pad2 } from '../../features/datetime/datetime-format';
import { groupTodosByStatus, KANBAN_COLUMNS } from '../../features/kanban/kanban-data';
import { collectOrphanAssetKeys } from '../../features/asset/asset-scan';
import { noteAssetMiss } from '../../features/asset/asset-miss-recorder';
import { isAssetConfirmedAbsent } from '../../features/asset/asset-absence';
import { getResidentAssetMeta, getResidentAssetSizes } from '../platform/asset-meta-index';
import { buildStorageProfile, formatBytes } from '../../features/asset/storage-profile';
import type { StorageProfile } from '../../features/asset/storage-profile';
import { getStorageBackendPref, type StorageBackend } from '../platform/storage-backend';
import {
  isRevisionHydrationPending,
  revisionCountOf,
} from '../platform/revision-residency';
import { isOpfsSupported } from '../platform/storage/opfs-adapter';
import { isFsaSupported } from '../platform/storage/fsa-adapter';
import { renderMarkdown, renderMarkdownInline, hasMarkdownSyntax } from '../../features/markdown/markdown-render';
import { resolveAssetReferences, hasAssetReferences } from '../../features/markdown/asset-resolver';
import { countTaskProgress } from '../../features/markdown/markdown-task-list';
import { extractTocFromEntry } from '../../features/markdown/markdown-toc';
import { extractBodySections, getSectionText } from '../../features/markdown/body-sections';
import { parseFrontmatter } from '../../features/markdown/frontmatter';
import { buildNovelCoverDataUrl } from '../../features/auto-fill/novel-cover-svg';
import { extractThumbnailRef } from '../../features/auto-fill/thumbnail-frontmatter';
import {
  classifyUrl,
  classifyFirstUrlInBody,
  classifyFrontmatterUrl,
  type UrlClassification,
} from '../../features/classification/url-host';
import { parseFragment, buildFragmentUri } from '../../features/fragment/registry';
import type { TocNode } from '../../features/markdown/markdown-toc';
import { planMergeImport } from '../../features/import/merge-planner';
import { buildLinkIndex } from '../../features/link-index/link-index';
import type { LinkIndex, LinkRef } from '../../features/link-index/link-index';
import type { EntryConflict, Resolution } from '../../core/model/merge-conflict';
import { highlightMatchesIn } from './search-mark';
import { loadPanePrefs } from '../platform/pane-prefs';
import { getUiPref } from '../platform/ui-prefs';
import { getAssetUrl } from '../platform/asset-url-registry';
import { loadExtensionBindings, getDefaultTarget, matchKeyForEntry } from '../platform/extension-bindings';
import { contrastRatio, wcagGrade, formatContrastRatio } from '../../features/color/wcag-contrast';
import { setFormatContext, getFormatLocale } from './format-context';

/** Primary tier: always visible in the archetype filter bar (FI-09). */
/**
 * Archetype filter rail (sidebar). Lists every archetype with a UI
 * creation path so the filter never advertises a route the user
 * cannot reach. `form` / `generic` / `opaque` were removed on
 * 2026-04-26 per user audit ("導線死んでるんだから今は不要なはず")
 * — they have no create-entry button in the header. Imported
 * containers may still hold those archetypes; entries display
 * normally, the filter just doesn't surface them as a separate axis.
 */
const ARCHETYPE_FILTER_PRIMARY: readonly ArchetypeId[] = [
  'text',
  'textlog',
  'folder',
  'todo',
  'attachment',
];
/** Human-readable labels for archetypes. Used in badges, filters, and headers. */
const ARCHETYPE_LABELS: Record<ArchetypeId, string> = {
  text: 'Text',
  textlog: 'Log',
  todo: 'Todo',
  form: 'Form',
  attachment: 'File',
  folder: 'Folder',
  generic: 'Generic',
  opaque: 'Opaque',
  spreadsheet: 'Sheet',
  'system-about': 'About',
  'system-settings': 'Settings',
  'system-flags': 'Flags',
};

/** Archetype icons for visual distinction. */
const ARCHETYPE_ICONS: Record<ArchetypeId, string> = {
  text: '📝',
  textlog: '📋',
  todo: '☑️',
  form: '📊',
  attachment: '📎',
  folder: '📁',
  generic: '📄',
  opaque: '🔒',
  spreadsheet: '🧮',
  'system-about': 'ℹ️',
  'system-settings': '⚙️',
  'system-flags': '⚑',
};

function archetypeIcon(archetype: ArchetypeId): string {
  return ARCHETYPE_ICONS[archetype] ?? '📄';
}

/**
 * FI-Settings v1 (2026-04-18): apply the resolved settings payload to
 * the live DOM. Called on every `render()` because the root element's
 * innerHTML is cleared just above, but the attributes / inline styles
 * on `#pkc-root` itself survive the clear — still, we re-apply to
 * handle transitions (e.g. settings changed while a re-render was
 * queued).
 *
 * `settings.theme.*` is the primary source of truth. The legacy
 * mirror fields (`state.showScanline` / `state.accentColor`) are used
 * only as a fallback when `state.settings` is absent — this lets
 * test fixtures that predate FI-Settings keep driving the DOM via the
 * old fields without a full migration.
 *
 * Writes:
 *   - `data-pkc-theme` attribute (explicit 'light' / 'dark', removed
 *     for 'auto' which falls back to `prefers-color-scheme`)
 *   - `data-pkc-scanline="on"` when scanline is true, removed otherwise
 *   - `--c-accent` / `--c-border` / `--c-bg` / `--c-fg` / `--c-text` /
 *     `--c-body-text` inline CSS variables (removed when payload holds
 *     null → base.css defaults win)
 *   - `--font-sans` inline CSS variable (fontDirectInput ?? preferredFont)
 *   - `html.lang` attribute (locale.language)
 *
 * Timezone is NOT applied here — it's consumed by date-format helpers
 * via AppState lookup.
 */
function applySystemSettings(
  root: HTMLElement,
  settings: SystemSettingsPayload | undefined,
  state: AppState,
): void {
  // Fallback to legacy mirror fields when `state.settings` is absent
  // so old fixtures and the brief pre-RESTORE_SETTINGS boot window
  // still drive the DOM.
  const resolved: SystemSettingsPayload = settings ?? {
    ...SETTINGS_DEFAULTS,
    theme: {
      ...SETTINGS_DEFAULTS.theme,
      scanline: state.showScanline === true,
      accentColor: state.accentColor ?? null,
    },
  };

  // Theme mode → data-pkc-theme. 'auto' clears the attribute so
  // `prefers-color-scheme` in base.css takes over.
  if (resolved.theme.mode === 'dark' || resolved.theme.mode === 'light') {
    root.setAttribute('data-pkc-theme', resolved.theme.mode);
  } else {
    root.removeAttribute('data-pkc-theme');
  }

  if (resolved.theme.scanline) {
    root.setAttribute('data-pkc-scanline', 'on');
  } else {
    root.removeAttribute('data-pkc-scanline');
  }

  if (resolved.theme.accentColor) {
    root.style.setProperty('--c-accent', resolved.theme.accentColor);
  } else {
    root.style.removeProperty('--c-accent');
  }
  if (resolved.theme.borderColor) {
    root.style.setProperty('--c-border', resolved.theme.borderColor);
  } else {
    root.style.removeProperty('--c-border');
  }
  if (resolved.theme.backgroundColor) {
    root.style.setProperty('--c-bg', resolved.theme.backgroundColor);
  } else {
    root.style.removeProperty('--c-bg');
  }
  if (resolved.theme.uiTextColor) {
    root.style.setProperty('--c-fg', resolved.theme.uiTextColor);
    root.style.setProperty('--c-text', resolved.theme.uiTextColor);
  } else {
    root.style.removeProperty('--c-fg');
    root.style.removeProperty('--c-text');
  }
  if (resolved.theme.bodyTextColor) {
    root.style.setProperty('--c-body-text', resolved.theme.bodyTextColor);
  } else {
    root.style.removeProperty('--c-body-text');
  }
  // Font: direct input wins over dropdown selection (D5).
  const effectiveFont = resolved.display.fontDirectInput ?? resolved.display.preferredFont;
  if (effectiveFont) {
    root.style.setProperty('--font-sans', `'${effectiveFont}', 'BIZ UDGothic', 'Share Tech Mono', 'IBM Plex Mono', 'SF Mono', ui-monospace, monospace`);
  } else {
    root.style.removeProperty('--font-sans');
  }

  if (typeof document !== 'undefined' && document.documentElement) {
    if (resolved.locale.language) {
      document.documentElement.setAttribute('lang', resolved.locale.language);
    } else {
      // Default to 'ja' (shipped HTML uses ja) — keep in sync with
      // index.html; removing the attribute entirely would break
      // accessibility assumptions.
      document.documentElement.setAttribute('lang', 'ja');
    }
  }

  // Phase 3a — runtime UI scale multiplier. Pushes `theme.scale`
  // flag value into `--theme-scale` CSS variable on <html>, which
  // base.css `:root { font-size: calc(16px * var(--theme-scale, 1)) }`
  // multiplies into all rem-based tokens (--space-*, --fs-*).
  applyThemeScale();
}

function archetypeLabel(archetype: ArchetypeId): string {
  return ARCHETYPE_LABELS[archetype] ?? archetype;
}

/** Sort key options with display labels. Single source of truth. */
const SORT_KEY_OPTIONS: readonly { key: SortKey; label: string }[] = [
  { key: 'created_at', label: 'Created' },
  { key: 'updated_at', label: 'Updated' },
  { key: 'title', label: 'Title' },
  { key: 'manual', label: 'Manual' },
] as const;

/** Relation kind options with display labels. */
// B2(視覚監査 2026-07-25):**label だけ**日本語化する。`kind` は
// data-pkc-* / option value / 保存される relation.kind に直結する機能契約
// なので絶対に触らない。
const RELATION_KIND_OPTIONS: readonly { kind: RelationKind; label: string }[] = [
  { kind: 'structural', label: '配置(structural)' },
  { kind: 'categorical', label: '分類(categorical)' },
  { kind: 'semantic', label: '意味(semantic)' },
  { kind: 'temporal', label: '時系列(temporal)' },
] as const;

/**
 * Renderer: pure function that projects AppState → DOM.
 *
 * Design:
 * - One-directional: state → DOM. Never reads DOM to derive state.
 * - Uses data-pkc-* attributes for all functional selectors (minify-safe).
 * - Class names are for styling only, never for JS logic.
 * - Re-renders the entire shell on state change (adequate for minimal shell).
 *
 * The renderer does NOT:
 * - Dispatch actions (ActionBinder does that)
 * - Subscribe to events (EventLog does that)
 * - Access core directly
 */

/**
 * Map AppState to the iPhone-shell page identifier. The matrix
 * mirrors the visual hierarchy a touch user steps through:
 *
 *   `phase === 'editing'`    → 'edit'
 *   `selectedLid !== null`   → 'detail'
 *   otherwise                → 'list'
 *
 * The helper lives next to `render` so the same routing rule is
 * available wherever the renderer needs to branch (mobile header
 * shape, mobile back-arrow visibility). Desktop ignores the
 * attribute entirely; the `pointer:coarse` @media block in
 * `base.css` is what activates the page-switching CSS.
 */
type MobilePage = 'list' | 'detail' | 'edit';
function resolveMobilePage(state: AppState): MobilePage {
  if (state.phase === 'editing') return 'edit';
  if (state.selectedLid) return 'detail';
  return 'list';
}

export function render(state: AppState, root: HTMLElement, prev: AppState | null = null): void {
  // #956: attachment presenter が「真の Light export」と「lazy loading で
  // 未回復なだけの非常駐 asset」を区別できるよう、render のたびに
  // state.lightSource を presenter module へ供給する(presenter interface は
  // state を受け取らないため)。
  setAttachmentLightSourceHint(state.lightSource);
  // PR #177: scope-driven short-circuit. When the delta from `prev`
  // → `state` is irrelevant to rendering (`'none'`) or only shifts
  // root attributes (`'settings-only'`), skip the full-shell rebuild
  // path entirely. The bench (PR #176) showed `RESTORE_SETTINGS` at
  // cold boot was ~70 % of the 263 ms wall clock at 1000 entries —
  // almost entirely the listener-flush full-shell repaint, which
  // produces no user-visible change when settings are hydrating
  // null → defaults.
  //
  // `prev === null` (the first mount, where main.ts hasn't recorded
  // a prior render baseline yet) falls through to the full path so
  // there is no behaviour change for the boot SYS_INIT_COMPLETE flow.
  const scope = computeRenderScope(state, prev);
  if (scope === 'none') {
    profileStart('render:scope=none')();
    return;
  }
  if (scope === 'settings-only') {
    const endProfile = profileStart('render:scope=settings-only');
    applySystemSettings(root, state.settings, state);
    endProfile();
    return;
  }
  if (scope === 'sidebar-only') {
    const endProfile = profileStart('render:scope=sidebar-only');
    replaceSidebarRegion(state, root);
    endProfile();
    return;
  }
  if (scope === 'selection') {
    const endProfile = profileStart('render:scope=selection');
    replaceSelectionRegions(state, root);
    endProfile();
    return;
  }
  if (scope === 'entry-body') {
    const endProfile = profileStart('render:scope=entry-body');
    replaceEntryBodyRegions(state, prev, root);
    endProfile();
    return;
  }
  if (scope === 'assets-only') {
    const endProfile = profileStart('render:scope=assets-only');
    replaceAssetRegions(state, root);
    endProfile();
    return;
  }
  if (scope === 'calendar-only') {
    // #938 R8: 月送り(SET_CALENDAR_MONTH)は calendar grid を含む center
    // pane だけを差し替える。sidebar / header / meta は月に依存しない。
    const endProfile = profileStart('render:scope=calendar-only');
    replaceCenterRegion(state, root);
    endProfile();
    return;
  }
  // PR #176 profile wave: outermost wrapper for the full-shell
  // rebuild. `render:phase=<phase>` is the canonical "renderer
  // wall-clock" measure used by the bench runner. No-op when
  // profiling is disabled.
  const endProfile = profileStart(`render:phase=${state.phase}`);
  // 🔴 編集の出入り(`ready ↔ editing`)では行リストを作り直さない(2026-07-26)。
  // `root.innerHTML` を消す**前に** node を退避し、新しいサイドバーへ差し込む。
  // 判定は `canReuseEntryList`(phase / editingLid 以外がすべて同一のときだけ true)。
  const reusableEntryList = canReuseEntryList(prev, state)
    ? root.querySelector<HTMLElement>('[data-pkc-region="entry-list"]')
    : null;
  const localeSettings = state.settings?.locale;
  setFormatContext(localeSettings?.language, localeSettings?.timezone);

  // P1-1: sync reducer-owned transient UI state into the forward
  // caches used by legacy reader APIs. Must happen BEFORE the DOM
  // is rebuilt below so presenters see the current selection state.
  // The caches themselves are never sources of truth — the reducer is.
  // See src/adapter/ui/textlog-selection.ts and
  // src/adapter/ui/text-to-textlog-modal.ts for the split.
  syncTextlogSelectionFromState(state);

  // 2026-04-26 user audit: "左ペインの挙動がおかしい / 初期位置
  // 戻しが働いて、選択したいエントリが選択できない". Every
  // dispatch wipes `root.innerHTML`, which resets the sidebar
  // scroll back to the top — long sidebars then snap-jump as the
  // user is mid-scroll. Capture both the sidebar and center-pane
  // scrollTop before the rebuild so the post-render handler below
  // can restore them. The center-pane preservation already exists
  // via `preserveCenterPaneScroll` for inline mutations, but
  // full-shell re-renders (CONTAINER_LOADED, theme changes, any
  // click-elsewhere) skipped that helper.
  //
  // PR-GG (2026-05-06): the actual scroll container for the entry
  // list is `<ul class="pkc-entry-list" data-pkc-region="entry-
  // list">`, not the outer `<aside data-pkc-region="sidebar">`.
  // The aside has `display: flex; flex-direction: column` and
  // never overflows; the UL has `flex: 1; overflow-y: auto`.
  // Capturing only the aside read scrollTop = 0 every time, so
  // the restore was silently a no-op — exactly the user-reported
  // "大量のエントリがある状況でクリックすると左ペインのスクロー
  // ルが上に戻る" symptom.
  const prevSidebarScroll =
    root.querySelector<HTMLElement>('[data-pkc-region="sidebar"]')?.scrollTop ?? null;
  const prevEntryListScroll =
    root.querySelector<HTMLElement>('[data-pkc-region="entry-list"]')?.scrollTop ?? null;
  const prevCenterScroll =
    root.querySelector<HTMLElement>('.pkc-center-content')?.scrollTop ?? null;

  root.innerHTML = '';
  root.setAttribute('data-pkc-phase', state.phase);
  root.setAttribute('data-pkc-embedded', String(state.embedded));
  root.setAttribute('data-pkc-readonly', String(state.readonly));
  root.setAttribute('data-pkc-capabilities', BUILD_FEATURES.join(','));
  // iPhone push/pop shell page routing — `list` (no selection) →
  // `detail` (selection, view) → `edit` (selection, editing). On
  // desktop the attribute is set but ignored (no responsive CSS
  // queries activate). On the iPhone tier (`pointer:coarse +
  // ≤640px`) the @media block in `base.css` keys all of its
  // hide / show rules off this attribute so each page renders as
  // a full-screen native-feeling view.
  root.setAttribute('data-pkc-mobile-page', resolveMobilePage(state));
  // Coarser binary "is something selected" flag retained from
  // PR #172 — drives the tablet / iPad master-detail responsive
  // CSS block (`data-pkc-has-selection="true|false"`). The two
  // attributes serve different viewports and are intentionally
  // kept side-by-side; the iPhone block keys off mobile-page,
  // the tablet block keys off has-selection.
  root.setAttribute(
    'data-pkc-has-selection',
    state.selectedLid ? 'true' : 'false',
  );
  applySystemSettings(root, state.settings, state);

  switch (state.phase) {
    case 'initializing':
      root.appendChild(renderInitializing());
      break;
    case 'error':
      root.appendChild(renderError(state.error));
      break;
    case 'ready':
    case 'editing':
    case 'exporting':
      root.appendChild(renderShell(state, reusableEntryList));
      break;
  }

  // PR-α (cluster A): Storage Profile overlay is owned by the
  // renderer, not by an ad-hoc `root.appendChild` inside the action
  // handler. The handler now just dispatches `OPEN_STORAGE_PROFILE`;
  // this branch rebuilds the overlay from the live container each
  // render pass so a subsequent `CLOSE_MENU` re-render does not wipe
  // it. `close-storage-profile` dispatches `CLOSE_STORAGE_PROFILE`.
  if (state.storageProfileOpen && (state.phase === 'ready' || state.phase === 'editing' || state.phase === 'exporting')) {
    root.appendChild(buildStorageProfileOverlay(
      state.container,
      state.availableContainers,
      state.workspaces,
      state.activeWorkspaceId ?? null,
    ));
  }

  // B1: shortcut-help overlay is state-driven. Rebuilt from
  // `state.shortcutHelpOpen` on each render pass so a subsequent
  // `CLOSE_MENU` re-render does not wipe it. `close-shortcut-help`
  // dispatches `CLOSE_SHORTCUT_HELP`.
  if (state.shortcutHelpOpen && (state.phase === 'ready' || state.phase === 'editing' || state.phase === 'exporting')) {
    root.appendChild(renderShortcutHelp());
  }

  // Flags Protocol v1 (PR-β-2): inspector overlay. Mounted in any
  // phase that has a working app surface (avoids appearing during
  // boot / error). Shell-menu link, settings dialog, and URL flag
  // `?pkc-flag=*` all dispatch OPEN_FLAGS_INSPECTOR.
  if (state.flagsInspectorOpen && (state.phase === 'ready' || state.phase === 'editing' || state.phase === 'exporting')) {
    // Prime the runtime flag registry's container source from the
    // current `__flags__` entry before mounting. dispatcher.onState
    // (which drives this render path) fires BEFORE dispatcher.onEvent
    // (where main.ts normally pushes FLAGS_CHANGED into the
    // registry), so the first render after SET_FLAG / RESET_FLAG
    // would otherwise see a stale containerSource and surface
    // source='default' for a value that's actually persisted in the
    // entry. Re-priming here closes that race without the renderer
    // needing to wait for the event loop.
    const flagsEntry = state.container?.entries.find(
      (e) => e.lid === '__flags__' && e.archetype === 'system-flags',
    );
    setFlagsInspectorContainerSource(resolveFlagsPayload(flagsEntry?.body).values);
    root.appendChild(renderFlagsInspector());
  }

  // Restore the sidebar / center scroll positions captured before
  // the rebuild, so a re-render triggered by an unrelated dispatch
  // (theme change, autosave bump, idb-flush event) does not yank
  // the user away from the row they were looking at. Run before
  // `scrollSelectedSidebarNodeIntoView` so the ensure-visible
  // helper still wins when the SELECTION moved (`scrollIntoView`
  // with `block: 'nearest'` is a no-op when the row is already
  // in view).
  //
  // PR-GG (2026-05-06): the synchronous write can clamp to
  // `maxScrollTop = scrollHeight - clientHeight` when layout has
  // not finished measuring the just-mounted sidebar (large entry
  // counts amplify this). Schedule a rAF-deferred re-apply so the
  // captured value wins once `scrollHeight` settles. Idempotent:
  // a successful synchronous write turns the rAF pass into a no-op.
  entryListScrollOverridden = false; // この描画ぶんの判定をリセット
  if (prevSidebarScroll !== null) {
    const sidebar = root.querySelector<HTMLElement>('[data-pkc-region="sidebar"]');
    if (sidebar) sidebar.scrollTop = prevSidebarScroll;
  }
  if (prevEntryListScroll !== null) {
    const entryList = root.querySelector<HTMLElement>('[data-pkc-region="entry-list"]');
    if (entryList) entryList.scrollTop = prevEntryListScroll;
  }
  if (prevCenterScroll !== null) {
    const center = root.querySelector<HTMLElement>('.pkc-center-content');
    if (center) center.scrollTop = prevCenterScroll;
  }
  if (prevSidebarScroll !== null || prevEntryListScroll !== null || prevCenterScroll !== null) {
    const raf = root.ownerDocument?.defaultView?.requestAnimationFrame;
    if (raf) {
      raf(() => {
        if (!root.isConnected) return;
        if (prevSidebarScroll !== null) {
          const sidebar = root.querySelector<HTMLElement>('[data-pkc-region="sidebar"]');
          if (sidebar && sidebar.scrollTop !== prevSidebarScroll) {
            sidebar.scrollTop = prevSidebarScroll;
          }
        }
        // ensure-visible が意図的に動かしていたら書き戻さない(上の doc 参照)。
        if (prevEntryListScroll !== null && !entryListScrollOverridden) {
          const entryList = root.querySelector<HTMLElement>('[data-pkc-region="entry-list"]');
          if (entryList && entryList.scrollTop !== prevEntryListScroll) {
            entryList.scrollTop = prevEntryListScroll;
          }
        }
        if (prevCenterScroll !== null) {
          const center = root.querySelector<HTMLElement>('.pkc-center-content');
          if (center && center.scrollTop !== prevCenterScroll) {
            center.scrollTop = prevCenterScroll;
          }
        }
      });
    }
  }

  // Post-render: if the current selection changed since the last
  // render, nudge the sidebar tree node into view.  Pairs with the
  // ancestor auto-expand in the SELECT_ENTRY reducer — together they
  // close the "selected but not visible" gap for Storage Profile
  // jumps, entry-ref clicks, calendar / kanban taps, and anything
  // else that dispatches SELECT_ENTRY from outside the tree.
  // L3-S5: attach 後に窓化を確定する(単位行高は layout 後にしか測れない)。
  // **scrollSelectedSidebarNodeIntoView より前**に呼ぶ ── 窓を確定してから
  // 「選択行が見えているか」を判定しないと、直後に窓が動いてずれる。
  finalizeSidebarWindow(root, state);

  scrollSelectedSidebarNodeIntoView(state, root);

  // P1-1: reconcile the TEXT → TEXTLOG preview modal with the
  // authoritative state. Mount / unmount / re-render is decided
  // purely from `state.textToTextlogModal`. The helper is
  // responsible for its own DOM idempotency.
  syncTextToTextlogModalFromState(state, root);

  // Phase 2 Slice 2: reconcile the Normalize PKC links preview
  // dialog. Same state-synced pattern — the helper owns its own DOM
  // idempotency, mounts/unmounts from `state.linkMigrationDialogOpen`,
  // and recomputes its preview when the container reference changes.
  syncLinkMigrationDialogFromState(state, root);

  // UI singleton audit final pass (2026-04-13): auto-close the
  // TEXTLOG → TEXT preview modal whenever the authoritative
  // `textlogSelection` is gone, or whenever the overlay has been
  // orphaned by the root-level innerHTML wipe above. Pure
  // housekeeping — never opens, only closes.
  syncTextlogPreviewModalFromState(state);

  // FI-01 (2026-04-17): reject overlay for dual-edit conflicts.
  // Mounts when `state.dualEditConflict` is populated and unmounts
  // on every path that clears it. Must sit after the shell rebuild
  // so the overlay layers on top.
  syncDualEditConflictOverlay(state, root);
  endProfile();
}

/**
 * Scroll the sidebar's `[data-pkc-selected="true"]` node into view
 * when `state.selectedLid` has changed since the previous render.
 *
 * - `block: 'nearest'` + `inline: 'nearest'` → browsers treat an
 *   already-visible element as a no-op (no jitter on re-renders).
 * - No `smooth` option: instant snap keeps the feeling of "the app
 *   just moved my eyes to where I looked" rather than "the app is
 *   animating for me".
 * - A `data-pkc-last-scrolled-lid` memo on the root element
 *   suppresses redundant calls on same-selection re-renders
 *   (e.g. filter / sort / collapse toggles that don't move the
 *   selection). Survives DOM replacement because it lives on the
 *   root element, which `render` does not recreate.
 * - Scoped to the sidebar region so center-pane selections (kanban
 *   cards, calendar cells) don't trigger sidebar scroll.
 */
/**
 * 🔴 ensure-visible が entry-list を**意図的に**スクロールしたかどうか(L3-S5)。
 *
 * scroll 継続性の復元(`prevEntryListScroll`)には **rAF での再適用**があり、
 * 「描画前の scrollTop と違っていたら書き戻す」という無条件の処理になっている。
 * 同期の復元は ensure-visible より前に走るので競合しないが、**rAF の再適用は
 * 後から走って ensure-visible のスクロールを打ち消す**。
 *
 * 窓化前は「選択行は近くにあり scrollIntoView の移動も小さい」ため実害が
 * 見えにくかったが、窓化すると選択行が数百行先になりうるので必ず露見する
 * (実測: 目標 870px を書いても rAF が 148px へ戻し、選択行が永久に画面外)。
 *
 * → ensure-visible が動かしたときだけ、その 1 回の再適用を見送る。
 */
let entryListScrollOverridden = false;

/**
 * 「この描画で ensure-visible が entry-list を動かしたか」。
 * 呼び出し側(main.ts)は true のとき scroll 継続性の復元から entry-list を
 * 外す ── そうしないと復元(同期 + rAF + 200ms の 3 段)が ensure-visible の
 * スクロールを必ず打ち消す。
 *
 * ⚠ **読むだけで消さない**。renderer 内の rAF 再適用も同じフラグを見ており、
 *    ここで消すと**そちらが false を読んで書き戻してしまう**(実測: 選択行が
 *    5 行ぶん手前で止まった)。リセットは次の描画の入口で 1 回だけ行う。
 */
export function didEnsureVisibleScrollEntryList(): boolean {
  return entryListScrollOverridden;
}

function scrollSelectedSidebarNodeIntoView(
  state: AppState,
  root: HTMLElement,
): void {
  if (!state.selectedLid) {
    delete root.dataset.pkcLastScrolledLid;
    return;
  }
  if (root.dataset.pkcLastScrolledLid === state.selectedLid) return;
  const sidebar = root.querySelector<HTMLElement>(
    '[data-pkc-region="sidebar"]',
  );
  if (!sidebar) return;
  // 🔴 L3-S5: **窓化中は DOM を見ずに位置を計算する**。
  //
  // 窓化すると選択行は「DOM に居ない」か「居るが窓の描き替えと scroll 復元の
  // 相互作用で表示範囲の外」のどちらにもなりうる。前者は従来ここで黙って
  // return し(= 選んだのに見えない)、後者は `scrollIntoView` が効いても
  // 直後の再描画で位置が戻る。どちらも例外は出ない。
  // 論理 index × 単位行高で位置は決まるので、窓化中は**常に**計算で寄せる。
  const list = sidebar.querySelector<HTMLElement>('ul[data-pkc-region="entry-list"]');
  const windowed = !!list?.querySelector('[data-pkc-spacer]');
  if (windowed && list) {
    const order = getRecordedVisibleOrder(list);
    const index = order ? order.indexOf(state.selectedLid) : -1;
    const unit = index >= 0 ? measureUnitRowHeight(list) : null;
    if (unit !== null && index >= 0) {
      const offset = scrollOffsetForIndex(index, unit, list.clientHeight, list.scrollTop);
      if (offset !== null) {
        list.scrollTop = offset;
        entryListScrollOverridden = true; // 復元(同期/rAF/200ms)に勝たせる
      }
      root.dataset.pkcLastScrolledLid = state.selectedLid;
      return;
    }
  }

  const node = sidebar.querySelector<HTMLElement>(
    `[data-pkc-selected="true"][data-pkc-lid="${CSS.escape(state.selectedLid)}"]`,
  );
  if (!node) return;
  // PR-Δ15 (2026-05-07、user 報告「エントリをクリックするとエントリが
  // 震える動作をした後に全体の再描画ないし座標再設定が走っているように
  // 感じる」):scrollIntoView は node が **viewport 完全内** にある場合
  // でも僅か scroll する場合がある(sub-pixel 補正)。click 元の row は
  // 定義により 100% visible なので、`scrollIntoView` を completely 包含
  // 検知 + skip にして震動を撃退。partially clipped(切れている)時のみ
  // scroll。happy-dom 等で rect が 0 の場合は実機ではないので skip 判定
  // を bypass(test 互換)。
  const sidebarRect = sidebar.getBoundingClientRect();
  const nodeRect = node.getBoundingClientRect();
  const haveLayout = sidebarRect.height > 0 && nodeRect.height > 0;
  const fullyInView = haveLayout
    && nodeRect.top >= sidebarRect.top
    && nodeRect.bottom <= sidebarRect.bottom;
  if (!fullyInView) {
    node.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    entryListScrollOverridden = true;
  }
  root.dataset.pkcLastScrolledLid = state.selectedLid;
}

/**
 * PR #178: sidebar-only region replacement.
 *
 * Replaces the `[data-pkc-region="sidebar"]` subtree in place when
 * the dispatch's state delta only affects sidebar content (search /
 * filter / sort / show-archived / advanced-filter toggles). Header /
 * center / meta / overlays stay put.
 *
 * Critical contract:
 *   - The new sidebar inherits the OLD element's `data-pkc-collapsed`
 *     attribute so a user-collapsed sidebar doesn't suddenly re-open
 *     mid-keystroke.
 *   - Scroll position is preserved manually because `replaceWith`
 *     resets `scrollTop` on the new element. The renderer subscriber
 *     in main.ts also runs `captureRenderContinuity` →
 *     `restoreRenderContinuity` for focus / caret restoration on
 *     sub-elements (e.g. the search input), so explicit focus
 *     handling here is unnecessary.
 *   - linkIndex is recomputed from the unchanged `state.container`.
 *     `buildLinkIndex` is fast (single-pass scan) and the meta-pane
 *     side that shares it doesn't get re-rendered, so a stale
 *     reference there is fine until the next 'full' render.
 *
 * Silent no-op when no sidebar exists (the boot transient
 * `phase === 'initializing'` window). The scope detector wouldn't
 * normally classify a phase change as 'sidebar-only', but the guard
 * keeps a programmer surprise from corrupting state.
 */
function replaceSidebarRegion(state: AppState, root: HTMLElement): void {
  const oldSidebar = root.querySelector<HTMLElement>('[data-pkc-region="sidebar"]');
  if (!oldSidebar) return;
  const scrollTop = oldSidebar.scrollTop;
  // PR-GG (2026-05-06): the actual scroll container is the inner
  // `<ul data-pkc-region="entry-list">`. Capture it too.
  const oldEntryList = oldSidebar.querySelector<HTMLElement>(
    '[data-pkc-region="entry-list"]',
  );
  const entryListScrollTop = oldEntryList?.scrollTop ?? 0;
  const wasCollapsed = oldSidebar.getAttribute('data-pkc-collapsed') === 'true';

  // pgc-225(pgc-224 と同 doctrine):collapsed の時は placeholder で build skip。
  // 展開時(toggle-sidebar → full render)で完全 sidebar が build される。
  let newSidebar: HTMLElement;
  if (wasCollapsed) {
    newSidebar = createElement('aside', 'pkc-sidebar');
    newSidebar.setAttribute('data-pkc-region', 'sidebar');
    newSidebar.setAttribute('data-pkc-collapsed', 'true');
    newSidebar.setAttribute('data-pkc-lazy-sidebar', 'true');
  } else {
    const linkIndex = state.container ? memoizedBuildLinkIndex(state.container) : null;
    newSidebar = renderSidebar(state, linkIndex);
  }

  oldSidebar.replaceWith(newSidebar);
  newSidebar.scrollTop = scrollTop;
  const newEntryList = newSidebar.querySelector<HTMLElement>(
    '[data-pkc-region="entry-list"]',
  );
  if (newEntryList) newEntryList.scrollTop = entryListScrollTop;
  // rAF-deferred re-apply to win against layout clamping when
  // scrollHeight hasn't settled yet. Idempotent.
  const raf = root.ownerDocument?.defaultView?.requestAnimationFrame;
  if (raf) {
    raf(() => {
      if (newSidebar.isConnected && newSidebar.scrollTop !== scrollTop) {
        newSidebar.scrollTop = scrollTop;
      }
      if (newEntryList && newEntryList.isConnected && newEntryList.scrollTop !== entryListScrollTop) {
        newEntryList.scrollTop = entryListScrollTop;
      }
    });
  }
}

/**
 * L1 #693: `'selection'` scope region replacement.
 *
 * Mirror of `replaceSidebarRegion` (PR #178) but inverted: when ONLY
 * `selectedLid` changed (plain navigation), the expensive O(N) sidebar
 * tree is PRESERVED and only its selection highlight moves. Every other
 * region that depends on `selectedLid` is small (N-independent) and
 * rebuilt wholesale: center pane (~38 nodes), meta pane, desktop +
 * mobile headers, plus the root selection attributes.
 *
 * The scope detector (`render-scope.ts`) guarantees container / viewMode
 * / editingLid / overlays / filters are unchanged and that no multi-
 * select action bar transition is in flight, so the sidebar's non-
 * highlight content is already in sync. A parity test asserts the
 * resulting DOM equals a full render of the same state.
 */
function replaceSelectionRegions(state: AppState, root: HTMLElement): void {
  // 1. Root selection attributes (drive responsive master-detail CSS).
  root.setAttribute('data-pkc-has-selection', state.selectedLid ? 'true' : 'false');
  root.setAttribute('data-pkc-mobile-page', resolveMobilePage(state));

  // 2. Sidebar selection highlight — O(1) attribute move, no tree rebuild.
  applySelectionHighlight(state, root);

  // 2b. Nudge the newly-selected sidebar row into view (and update the
  // `data-pkc-last-scrolled-lid` memo) exactly as the full path does —
  // must run AFTER the highlight so the node query resolves.
  // L3-S5: 窓化していれば選択行が DOM に無いことがある(scroll 計算へ落ちる)。
  finalizeSidebarWindow(root, state);
  scrollSelectedSidebarNodeIntoView(state, root);

  // 3. Center pane — full swap.
  replaceCenterRegion(state, root);

  // 4. Meta pane — appear / disappear / replace reconciliation.
  reconcileMetaPane(state, root);

  // 5. Headers — desktop back-button + mobile title depend on selectedLid.
  const oldHeader = root.querySelector<HTMLElement>('[data-pkc-region="header"]');
  if (oldHeader) oldHeader.replaceWith(renderHeader(state));
  const oldMobileHeader = root.querySelector<HTMLElement>('[data-pkc-region="mobile-header"]');
  if (oldMobileHeader) oldMobileHeader.replaceWith(renderMobileHeader(state));
}

/**
 * Move the sidebar selection highlight to match `state`, mirroring
 * `applyEntryRowSelectionAttrs` but driven by DOM `data-pkc-lid` so a
 * row is never rebuilt. `data-pkc-selected` applies to every lid-
 * carrying row (entry-list rows + recent-pane items); `data-pkc-multi-
 * selected` is scoped to entry-list rows only (matching the full render,
 * where recent items never carry the multi attribute).
 */
function applySelectionHighlight(state: AppState, root: HTMLElement): void {
  const sidebar = root.querySelector<HTMLElement>('[data-pkc-region="sidebar"]');
  if (!sidebar) return;
  for (const li of sidebar.querySelectorAll<HTMLElement>('li[data-pkc-lid]')) {
    if (li.getAttribute('data-pkc-lid') === state.selectedLid) {
      li.setAttribute('data-pkc-selected', 'true');
    } else {
      li.removeAttribute('data-pkc-selected');
    }
  }
  const entryList = sidebar.querySelector<HTMLElement>('[data-pkc-region="entry-list"]');
  if (entryList) {
    for (const li of entryList.querySelectorAll<HTMLElement>('li[data-pkc-lid]')) {
      const lid = li.getAttribute('data-pkc-lid');
      if (lid && state.multiSelectedLids.includes(lid)) {
        li.setAttribute('data-pkc-multi-selected', 'true');
      } else {
        li.removeAttribute('data-pkc-multi-selected');
      }
    }
  }
}

/**
 * #868 段階3: `'assets-only'` scope region replacement.
 *
 * `SET_WORKING_SET_ASSETS` republished the resident asset bytes —
 * `container.assets` changed identity while entries / relations /
 * revisions / meta kept theirs. Under lazy loading this dispatch lands
 * asynchronously AFTER the first paint of an open/save; classifying it
 * `'full'` wiped and rebuilt the whole shell (O(N) sidebar included),
 * which the user saw as「開いた直後/保存後にレンダリングが遅れる」.
 * Only the center pane (detail markdown embeds / filer cards / launcher
 * icons) and the meta pane (attachment preview) consume asset bytes
 * synchronously, so swap exactly those two — `replaceCenterRegion`
 * preserves the center scroll position across the swap.
 */
function replaceAssetRegions(state: AppState, root: HTMLElement): void {
  replaceCenterRegion(state, root);
  reconcileMetaPane(state, root);
}

/** Swap the center pane in place, preserving its scroll position. */
function replaceCenterRegion(state: AppState, root: HTMLElement): void {
  const oldCenter = root.querySelector<HTMLElement>('[data-pkc-region="center"]');
  if (!oldCenter) return;
  const prevScroll =
    oldCenter.querySelector<HTMLElement>('.pkc-center-content')?.scrollTop ?? null;
  const newCenter = renderCenter(state);
  oldCenter.replaceWith(newCenter);
  if (prevScroll != null) {
    const sc = newCenter.querySelector<HTMLElement>('.pkc-center-content');
    if (sc) sc.scrollTop = prevScroll;
  }
}

/**
 * Reconcile the meta pane (+ its resize handle + right tray) against the
 * new selection. Uses the SAME desired-state computation as `renderShell`
 * (filer mode pins the meta pane to the scope folder; otherwise it shows
 * the selected entry; `system-about` entries have no meta pane). Handles
 * all four appear/disappear/replace transitions.
 */
function reconcileMetaPane(state: AppState, root: HTMLElement): void {
  const center = root.querySelector<HTMLElement>('[data-pkc-region="center"]');
  const main = center?.parentElement;
  if (!center || !main) return;

  let selected = findSelectedEntry(state);
  if (state.viewMode === 'filer' && state.container) {
    const scope = resolveFilerScope(state);
    if (scope) selected = scope;
  }
  const hasMetaPane = !!selected && selected.archetype !== 'system-about';

  const oldMeta = main.querySelector<HTMLElement>('[data-pkc-region="meta"]');
  const oldRightHandle = main.querySelector<HTMLElement>('[data-pkc-resize="right"]');
  const panePrefs = loadPanePrefs();

  if (hasMetaPane) {
    const canEdit = state.phase === 'ready' && !state.readonly;
    const linkIndex = state.container ? memoizedBuildLinkIndex(state.container) : null;
    const metaPane = renderMetaPane(selected!, canEdit, state.container, linkIndex, state.tagFilter);
    if (panePrefs.meta) metaPane.setAttribute('data-pkc-collapsed', 'true');
    if (oldMeta) {
      oldMeta.replaceWith(metaPane);
    } else {
      // none → has: insert resize handle + meta pane right after center.
      const rightHandle = createElement('div', 'pkc-resize-handle');
      rightHandle.setAttribute('data-pkc-resize', 'right');
      if (panePrefs.meta) rightHandle.setAttribute('data-pkc-collapsed', 'true');
      center.after(rightHandle);
      rightHandle.after(metaPane);
    }
  } else if (oldMeta) {
    // has → none: drop the meta pane and its resize handle.
    oldMeta.remove();
    oldRightHandle?.remove();
  }

  const rightTray = main.querySelector<HTMLElement>('[data-pkc-region="tray-right"]');
  if (rightTray) {
    rightTray.style.display = panePrefs.meta && hasMetaPane ? '' : 'none';
  }
}

/**
 * L1 #693 PR-2: `'entry-body'` scope region replacement.
 *
 * A single todo entry's body changed (QUICK_UPDATE status toggle) in a
 * way the scope detector proved cannot affect link index, tree membership,
 * or sort position (see `findEntryBodyChangeLid`). So the other N-1 sidebar
 * rows are untouched — only the changed row is swapped — and the center /
 * meta panes (which show that todo + its revision history) are rebuilt.
 *
 * A parity test asserts the result equals a full render of the same state.
 */
function replaceEntryBodyRegions(state: AppState, prev: AppState | null, root: HTMLElement): void {
  const lid = prev ? findEntryBodyChangeLid(prev, state) : null;
  if (!lid || !state.container) return; // defensive — detector already gated

  const fi = getFilterIndexes(state.container);
  const entry = fi.entryByLid.get(lid);

  // 1. Swap ONLY the changed entry's sidebar row (tree-mode leaf). The scope
  // is gated to no-active-filter detail view, so the row is a renderTreeNode
  // leaf: renderEntryItem + depth padding + draggable attrs.
  // Scope to the entry-list tree (NOT the whole sidebar): the recent pane
  // also carries `li[data-pkc-lid]` rows, but those show an archetype icon +
  // title only — both status-independent — so they need no update.
  const oldRow = root.querySelector<HTMLElement>(
    `[data-pkc-region="entry-list"] li[data-pkc-lid="${CSS.escape(lid)}"]`,
  );
  if (oldRow && entry) {
    const connectednessSets = memoizedBuildConnectednessSets(
      state.container,
      memoizedBuildLinkIndex(state.container),
    );
    const newRow = renderEntryItem(entry, state, fi.backlinkCounts, fi.connectedLids, connectednessSets);
    newRow.style.paddingLeft = oldRow.style.paddingLeft; // preserve depth indent
    newRow.setAttribute('draggable', 'true');
    newRow.setAttribute('data-pkc-draggable', 'true');
    oldRow.replaceWith(newRow);
  }

  // 2. Center (the todo's detail / any board) + meta (revision history) —
  // reuse the selection-scope region swaps.
  replaceCenterRegion(state, root);
  reconcileMetaPane(state, root);
}

function renderInitializing(): HTMLElement {
  const el = createElement('div', 'pkc-loading');
  el.textContent = 'PKC2 initializing…';
  return el;
}

function renderError(error: string | null): HTMLElement {
  const el = createElement('div', 'pkc-error');
  el.textContent = `Error: ${error ?? 'unknown'}`;
  return el;
}

function renderShell(
  state: AppState,
  /** 使い回す既存の行リスト(2026-07-26)。詳細は `canReuseEntryList`。 */
  reusableEntryList: HTMLElement | null = null,
): HTMLElement {
  const shell = createElement('div', 'pkc-shell');
  // pgc-139 wave-δ #13(user bug report 2026-05-24):上部 4 段(header /
  // breadcrumb / tab strip / view-mode bar)の縦 padding を圧縮する
  // compact mode。CSS が `data-pkc-compact-header="true"` を見て padding /
  // font-size を削減する。
  if (shellHeaderCompactEnabled()) {
    shell.setAttribute('data-pkc-compact-header', 'true');
  }

  // Desktop header — appended FIRST so the legacy chrome stays
  // first in DOM order. Existing tests + the smoke suite call
  // `querySelector('[data-pkc-action="commit-edit"]…').first()`
  // expecting the desktop action-bar button; if the mobile header
  // (which carries an identically-named action) preceded it in
  // DOM, `.first()` would resolve to a `display: none` mobile
  // button and the click would silently time out.
  shell.appendChild(renderHeader(state));

  // Import confirmation panel
  if (state.importPreview) {
    shell.appendChild(renderImportConfirmation(
      state.importPreview,
      state.importMode ?? 'replace',
      state.container,
      state.mergeConflicts,
      state.mergeConflictResolutions,
    ));
  }

  // Batch import preview panel
  if (state.batchImportPreview) {
    shell.appendChild(renderBatchImportPreview(state.batchImportPreview, state.container));
  }

  // Batch import result banner (transient)
  if (state.batchImportResult && !state.batchImportPreview) {
    shell.appendChild(renderBatchImportResult(state.batchImportResult));
  }

  // Pending offers bar
  if (state.pendingOffers.length > 0) {
    // PR-VV (2026-05-06):folder picker 候補のため container を渡す。
    shell.appendChild(renderPendingOffers(state.pendingOffers, state.container));
  }

  // Shell menu panel (hidden by default, toggled by action-binder).
  // The current theme is read from the root element so the active
  // theme button can be highlighted on every render.
  const currentTheme = getCurrentThemeMode();
  shell.appendChild(renderShellMenu(currentTheme, state));

  // Shortcut help overlay — state-driven (B1). Mounted from the
  // top-level `render()` when `state.shortcutHelpOpen` is true so
  // it survives `CLOSE_MENU` re-renders just like the storage
  // profile overlay.

  // Storage profile overlay is mounted on demand by `action-binder`
  // when the user opens the dialog (and removed on close). Mounting
  // it per render would add several DOM nodes to every state update,
  // inflating test-run memory across hundreds of renders — and the
  // dialog is opened rarely, so the shell-level cost is not worth
  // paying on every render.

  // Main area: sidebar + resize-handle + center + resize-handle + meta (3-pane)
  const main = createElement('div', 'pkc-main');

  // H-7 (S-19, 2026-04-14): read persisted pane state so the
  // initial render already reflects the user's last collapse
  // preference. Avoids the "always-expand on re-render" flash
  // that existed before pane-prefs was wired up.
  const panePrefs = loadPanePrefs();

  // Left tray bar (shown when sidebar is collapsed)
  // pgc-138 wave-δ #12:flag ON で tray bar の text を空にして slim 化
  // (CSS が `data-pkc-slim` で chrome 削減)。OFF で従来の "SIDEBAR" 表記。
  const leftTray = createElement('div', 'pkc-tray-bar');
  leftTray.setAttribute('data-pkc-action', 'toggle-sidebar');
  leftTray.setAttribute('title', 'Click to expand sidebar');
  const slimTray = shellTrayBarSlimEnabled();
  leftTray.textContent = slimTray ? '' : 'SIDEBAR';
  if (slimTray) leftTray.setAttribute('data-pkc-slim', 'true');
  leftTray.style.display = panePrefs.sidebar ? '' : 'none';
  leftTray.setAttribute('data-pkc-region', 'tray-left');
  main.appendChild(leftTray);

  // PR-δ (spec §5.7): compute LinkIndex once per render pass so
  // `buildConnectednessSets` (sidebar) and the References sub-panels
  // (meta pane) share the same result instead of each invoking a
  // second `buildLinkIndex(container)` over the same container.
  // PR #179: also memoize across renders — same container reference
  // ⇒ cached linkIndex re-used, skipping the per-keystroke O(N)
  // body scan.
  const linkIndex = state.container ? memoizedBuildLinkIndex(state.container) : null;

  // pgc-102 wave-γ #4(MASTER.md §6.2):flag ON 時に Activity Bar(VSCode
  // 流の縦 strip)を sidebar の左に prepend。pgc-116 wave-γ #16:
  // `getActivityBarSide()` が 'left' なら従来どおり main 先頭、'right' なら
  // 全 pane が append された後に末尾(meta pane の更に右)に置く。後者は
  // 下の "After all panes" 直前で append される。
  const activityBarSide = shellActivityBarEnabled() ? getActivityBarSide() : null;
  if (activityBarSide === 'left') {
    main.appendChild(buildActivityBarElement(state));
  }

  // Left pane: entry list / tree / search / filters
  // pgc-102 wave-γ #4:Activity Bar flag ON + 非 explorer tab 時は
  // tab 別 builder へ振り分け。pgc-103 で outline tab を実装、未実装の
  // tab は placeholder("Coming soon")で fallback。
  let sidebar: HTMLElement;
  // pgc-225(pgc-224 と同 doctrine):sidebar が collapsed(panePrefs.sidebar
  // =true)の時は full DOM(filer ~100 row tree / outline / recent / etc.)を
  // build せず placeholder のみ append。展開時(toggle-sidebar dispatch)で
  // 完全 sidebar が build される。c-100+ で tree-loop / flat-loop / etc.の
  // 数 ms cost を完全 skip。
  if (panePrefs.sidebar) {
    sidebar = createElement('aside', 'pkc-sidebar');
    sidebar.setAttribute('data-pkc-region', 'sidebar');
    sidebar.setAttribute('data-pkc-collapsed', 'true');
    sidebar.setAttribute('data-pkc-lazy-sidebar', 'true');
  } else if (shellActivityBarEnabled()) {
    const tab = getActivityBarActiveTab();
    switch (tab) {
      case 'explorer':
        sidebar = renderSidebar(state, linkIndex, reusableEntryList);
        break;
      case 'outline':
        sidebar = buildOutlineTab(state);
        break;
      case 'recent':
        sidebar = buildRecentTab(state);
        break;
      case 'pinned':
        sidebar = buildPinnedTab(state);
        break;
      case 'search':
        sidebar = buildSearchTab(state);
        break;
      case 'relations':
        sidebar = buildRelationsTab(state);
        break;
      default:
        sidebar = buildActivityTabPlaceholder(tab);
        break;
    }
  } else {
    sidebar = renderSidebar(state, linkIndex, reusableEntryList);
  }
  main.appendChild(sidebar);

  // Resize handle: sidebar ↔ center
  const leftHandle = createElement('div', 'pkc-resize-handle');
  leftHandle.setAttribute('data-pkc-resize', 'left');
  if (panePrefs.sidebar) leftHandle.setAttribute('data-pkc-collapsed', 'true');
  main.appendChild(leftHandle);

  // Center pane: content view/edit + fixed action bar
  main.appendChild(renderCenter(state));

  // Right pane: meta information (tags, relations, history, move)
  // System-about entries are view-only hidden entries, so the meta
  // pane (which exposes tags/relations/history/delete) is skipped.
  let selected = findSelectedEntry(state);
  // 2026-05-06 user direction:「ファイラ表示では、必ず右ペインは
  // 開いているフォルダのものを表示すること。現状はフォルダ以外
  // エントリを開いてから戻ると、開いたエントリのメタデータが
  // 表示されている」。
  // viewMode === 'filer' の時は filer scope folder を meta に固定。
  // selectedLid は filer 内 row highlight にのみ使う。
  if (state.viewMode === 'filer' && state.container) {
    const scope = resolveFilerScope(state);
    if (scope) selected = scope;
  }
  const hasMetaPane = !!selected && selected.archetype !== 'system-about';
  if (hasMetaPane) {
    // Resize handle: center ↔ meta
    const rightHandle = createElement('div', 'pkc-resize-handle');
    rightHandle.setAttribute('data-pkc-resize', 'right');
    if (panePrefs.meta) rightHandle.setAttribute('data-pkc-collapsed', 'true');
    main.appendChild(rightHandle);

    // pgc-224(pgc-207 shell menu lazy build と同 doctrine):meta pane が
    // collapsed(panePrefs.meta=true)の時は full meta DOM を build せず、
    // placeholder のみ append。展開時(toggle-meta dispatch)は render 走り
    // panePrefs.meta=false で完全 meta が build される。
    // render:meta 17.5-23ms@c-1000+ を collapsed user で完全 skip。
    let metaPane: HTMLElement;
    if (panePrefs.meta) {
      // collapsed placeholder。region attribute は維持(action-binder の
      // event delegation が meta region を query するため)。
      metaPane = createElement('aside', 'pkc-meta-pane');
      metaPane.setAttribute('data-pkc-region', 'meta');
      metaPane.setAttribute('data-pkc-collapsed', 'true');
      metaPane.setAttribute('data-pkc-lazy-meta', 'true');
    } else {
      const canEdit = state.phase === 'ready' && !state.readonly;
      metaPane = renderMetaPane(selected!, canEdit, state.container, linkIndex, state.tagFilter, state.metaPaneMode ?? 'all');
    }
    main.appendChild(metaPane);
  }

  // Right tray bar (shown when meta pane is collapsed)
  // pgc-138 wave-δ #12:同 flag で slim 化(text 空 + data-pkc-slim attr)。
  const rightTray = createElement('div', 'pkc-tray-bar pkc-tray-bar-right');
  rightTray.setAttribute('data-pkc-action', 'toggle-meta');
  rightTray.setAttribute('title', 'Click to expand meta pane');
  rightTray.textContent = slimTray ? '' : 'META';
  if (slimTray) rightTray.setAttribute('data-pkc-slim', 'true');
  // The right tray is only meaningful when a meta pane exists.
  rightTray.style.display = panePrefs.meta && hasMetaPane ? '' : 'none';
  rightTray.setAttribute('data-pkc-region', 'tray-right');
  main.appendChild(rightTray);

  // pgc-116 wave-γ #16:Activity Bar が 'right' 側設定なら ここで append。
  // すべての pane(sidebar / center / meta / right tray)の右隣に置かれる。
  if (activityBarSide === 'right') {
    main.appendChild(buildActivityBarElement(state));
  }

  shell.appendChild(main);

  // Mobile header (iPhone push/pop redesign 2026-04-26). Appended
  // LAST in DOM order so existing `.first()` queries on
  // ambiguous action attributes (commit-edit, cancel-edit, …)
  // resolve to the desktop chrome above; CSS `order: -1` on the
  // `pointer:coarse + ≤640px` tier reorders it to the visual top
  // so iPhone users still see the bar at the top of the
  // viewport.
  shell.appendChild(renderMobileHeader(state));

  // Snippet floating helpers (PR #201 v4) — small "✚" trigger that
  // follows the caret in markdown textareas, plus a compact popup
  // with snippet buttons that opens next to the trigger. Hidden by
  // default; action-binder positions / toggles them based on focus
  // and selection events. CSS gates visibility on `pointer: coarse`.
  shell.appendChild(renderFloatingTrigger());
  shell.appendChild(renderFloatingPopup());

  // Media viewer (PR #203) — modal overlay that shows a tapped
  // markdown block (table / code fence / image) at full screen so
  // the user can read it without surrounding chrome. Hidden until
  // the action binder opens it via `openMediaViewer(source)`.
  shell.appendChild(renderMediaViewer());
  shell.appendChild(renderImagePreviewModal());
  return shell;
}

/**
 * iPhone shell header — replaces the desktop `.pkc-header` on the
 * `pointer:coarse + ≤640px` tier. Always emitted by `renderShell`
 * so the markup is hot-reload-stable; CSS gates the visibility.
 *
 * The bar is intentionally minimal — Apple's HIG calls for
 * "content is hero", so chrome is whittled down to the verbs the
 * user needs *on this exact page*:
 *
 *   list   → [PKC2 ◯ phase] ── ⋯ ── [✏ Compose] [☰ Menu]
 *   detail → [‹ List]      [Title]                  [⋯ Actions]
 *   edit   → [Cancel]      [編集中]                  [💾 Done]
 *
 * Routing is derived from `resolveMobilePage(state)` so the same
 * rule that drives the shell's `data-pkc-mobile-page` attribute
 * also picks the header variant — no chance of drift.
 */
function renderMobileHeader(state: AppState): HTMLElement {
  const bar = createElement('header', 'pkc-mobile-header');
  const page = resolveMobilePage(state);
  bar.setAttribute('data-pkc-region', 'mobile-header');
  bar.setAttribute('data-pkc-mobile-page', page);

  if (page === 'edit') {
    const cancelBtn = createElement('button', 'pkc-mobile-header-btn');
    cancelBtn.setAttribute('data-pkc-action', 'cancel-edit');
    cancelBtn.setAttribute('title', '編集を破棄 (Esc)');
    cancelBtn.textContent = 'Cancel';
    bar.appendChild(cancelBtn);

    const titleEl = createElement('span', 'pkc-mobile-header-title');
    titleEl.textContent = '編集中';
    bar.appendChild(titleEl);

    const editingLid = state.editingLid ?? state.selectedLid;
    if (editingLid) {
      const saveBtn = createElement('button', 'pkc-mobile-header-btn pkc-mobile-header-primary');
      saveBtn.setAttribute('data-pkc-action', 'commit-edit');
      saveBtn.setAttribute('data-pkc-lid', editingLid);
      saveBtn.setAttribute('title', '変更を保存 (Ctrl+S)');
      saveBtn.textContent = '💾 Done';
      bar.appendChild(saveBtn);
    }
    return bar;
  }

  if (page === 'detail') {
    // user direction 2026-06-02「戻る進むの左上のボタンはタイトル横のモバイル
    // モードでの初期戻しボタンと合流すべき」 fix:mobile detail header の
    // 「‹ List」 を desktop と同じ `go-back` history navigation に統一。
    // history が空なら fallback で list 表示(action-binder で分岐)。
    // 同 button の右に「進む」 も追加(両者で 1 つの nav unit を構成)。
    const backBtn = createElement('button', 'pkc-mobile-header-btn');
    backBtn.setAttribute('data-pkc-action', 'go-back');
    backBtn.setAttribute('aria-label', '戻る');
    backBtn.setAttribute('title', '戻る(履歴がない場合は一覧へ)');
    backBtn.textContent = '◀';
    bar.appendChild(backBtn);
    const fwdBtn = createElement('button', 'pkc-mobile-header-btn');
    fwdBtn.setAttribute('data-pkc-action', 'go-forward');
    fwdBtn.setAttribute('aria-label', '進む');
    fwdBtn.setAttribute('title', '進む');
    fwdBtn.textContent = '▶';
    const fwdDisabled = state.navIndex >= state.navHistory.length - 1;
    if (fwdDisabled) fwdBtn.setAttribute('disabled', '');
    bar.appendChild(fwdBtn);

    const selectedTitle =
      (state.selectedLid && state.container
        ? getFilterIndexes(state.container).entryByLid.get(state.selectedLid)
        : undefined)?.title ?? '';
    const titleEl = createElement('span', 'pkc-mobile-header-title');
    titleEl.textContent = truncate(selectedTitle || '(untitled)', 28);
    bar.appendChild(titleEl);

    const spacer = createElement('span', 'pkc-mobile-header-spacer');
    bar.appendChild(spacer);

    // 2026-04-26 user feedback ("メタ情報にアクセスできない"):
    // On the iPhone shell the meta pane is normally hidden in
    // detail mode (the full-screen entry view). Expose it via an
    // explicit ⓘ "Info" button that toggles a slide-over drawer
    // from the right edge so users can reach Tags / Relations /
    // History / Folder etc. without rotating to landscape.
    const metaBtn = createElement('button', 'pkc-mobile-header-btn');
    metaBtn.setAttribute('data-pkc-action', 'toggle-meta');
    metaBtn.setAttribute('aria-label', 'メタ情報');
    metaBtn.setAttribute('title', 'タグ / 関連 / 履歴などのメタ情報');
    metaBtn.textContent = 'ⓘ';
    bar.appendChild(metaBtn);
    return bar;
  }

  // page === 'list'
  const titleEl = createElement('span', 'pkc-mobile-header-title');
  titleEl.textContent = state.container?.meta?.title ?? 'PKC2';
  bar.appendChild(titleEl);

  const phase = createElement('span', 'pkc-phase-badge pkc-mobile-header-phase');
  phase.setAttribute('data-pkc-phase-value', state.phase);
  phase.textContent = state.phase;
  bar.appendChild(phase);

  const spacer = createElement('span', 'pkc-mobile-header-spacer');
  bar.appendChild(spacer);

  // Compose button — phone equivalent of the desktop Text-button.
  // Defaults to creating a Text entry; the hamburger drawer below
  // exposes the other archetypes for users who want them.
  if (!state.readonly) {
    const composeBtn = createElement('button', 'pkc-mobile-header-btn pkc-mobile-header-primary');
    composeBtn.setAttribute('data-pkc-action', 'create-entry');
    composeBtn.setAttribute('data-pkc-archetype', 'text');
    composeBtn.setAttribute('aria-label', '新規 Text を作成');
    composeBtn.setAttribute('title', 'Create a new text entry');
    composeBtn.textContent = '✏';
    bar.appendChild(composeBtn);
  }

  // Hamburger drawer — opens a sheet containing the create
  // archetype list, Data… export/import bundle, and a shortcut
  // back to the desktop shell menu (Theme / Scanline / Settings).
  const menuBtn = createElement('button', 'pkc-mobile-header-btn');
  menuBtn.setAttribute('data-pkc-action', 'mobile-open-drawer');
  menuBtn.setAttribute('aria-label', 'メニューを開く');
  menuBtn.setAttribute('title', 'Menu');
  menuBtn.textContent = '☰';
  bar.appendChild(menuBtn);

  return bar;
}

function renderHeader(state: AppState): HTMLElement {
  const header = createElement('header', 'pkc-header');
  // Stable functional selector for the `'selection'` render scope, which
  // replaces this header in place (the back button presence depends on
  // `selectedLid`). See `replaceSelectionRegions`.
  header.setAttribute('data-pkc-region', 'header');

  // 2026-04-26 mobile master-detail: a back arrow button that
  // deselects the current entry, used by the touch-coarse phone
  // layout to return from the detail view to the list. Always
  // emitted when there is a selection; CSS hides it on desktop /
  // tablet (the back-arrow is `display: none` outside the phone
  // master-detail @media block in `base.css`).
  if (state.selectedLid) {
    const backBtn = createElement('button', 'pkc-mobile-back-btn');
    backBtn.setAttribute('data-pkc-action', 'mobile-back-to-list');
    backBtn.setAttribute('title', '一覧に戻る');
    backBtn.setAttribute('aria-label', '一覧に戻る');
    backBtn.textContent = '←';
    header.appendChild(backBtn);
  }

  // 領域 1: entry navigation history の戻る / 進む。常に描画し、stack の
  // 端では `disabled`(disabled button は click event を出さないため
  // action-binder の event delegation に乗らず自然に inert になる)。
  // pgc-101 wave-γ #3(MASTER.md §6.1 phase 3):flag ON 時は標準 nav
  // group を skip し、breadcrumb 内 `⇐` `⇒` icon に集約(`renderHeader-
  // PathTrail` 側で実装)。OFF で従来挙動を完全維持。
  if (!shellBackForwardInBreadcrumbEnabled()) {
    // pgc-160 user bug fix:標準 header nav も disabled 時 tooltip 改善。
    const navGroup = createElement('div', 'pkc-header-nav');
    const histBackBtn = createElement('button', 'pkc-button-base pkc-button-size-icon pkc-header-nav-btn');
    histBackBtn.setAttribute('data-pkc-action', 'go-back');
    const stdBackDisabled = state.navIndex <= 0;
    histBackBtn.setAttribute('title', stdBackDisabled
      ? '戻る履歴がありません(エントリを移動すると履歴が記録されます)'
      : '前のエントリへ戻る (Alt+←)');
    histBackBtn.setAttribute('aria-label', stdBackDisabled ? '戻る(履歴なし)' : '戻る');
    histBackBtn.textContent = '◀';
    if (stdBackDisabled) histBackBtn.setAttribute('disabled', '');
    navGroup.appendChild(histBackBtn);
    const histFwdBtn = createElement('button', 'pkc-button-base pkc-button-size-icon pkc-header-nav-btn');
    histFwdBtn.setAttribute('data-pkc-action', 'go-forward');
    const stdFwdDisabled = state.navIndex >= state.navHistory.length - 1;
    histFwdBtn.setAttribute('title', stdFwdDisabled
      ? '進む履歴がありません(一度戻ると進む先が生まれます)'
      : '次のエントリへ進む (Alt+→)');
    histFwdBtn.setAttribute('aria-label', stdFwdDisabled ? '進む(履歴なし)' : '進む');
    histFwdBtn.textContent = '▶';
    if (stdFwdDisabled) histFwdBtn.setAttribute('disabled', '');
    navGroup.appendChild(histFwdBtn);
    header.appendChild(navGroup);
  }

  const title = createElement('span', 'pkc-header-title');
  title.textContent = state.container?.meta?.title ?? 'PKC2';
  header.appendChild(title);

  const phase = createElement('span', 'pkc-phase-badge');
  phase.setAttribute('data-pkc-phase-value', state.phase);
  phase.textContent = state.phase;
  header.appendChild(phase);

  // Actions: create entry, export (suppressed in readonly mode)
  if (state.phase === 'ready' && !state.readonly) {
    // Determine context folder for creation
    const contextFolder = resolveContextFolder(state);

    const createGroup = createElement('div', 'pkc-create-actions');

    // Show context indicator when creating inside a folder
    if (contextFolder) {
      const ctx = createElement('span', 'pkc-create-context');
      ctx.setAttribute('data-pkc-region', 'create-context');
      ctx.textContent = `in ${truncate(contextFolder.title || '(untitled)', 20)}:`;
      createGroup.appendChild(ctx);
    }

    const archetypeButtons: { arch: ArchetypeId; label: string; tip: string }[] = [
      { arch: 'text', label: `${archetypeIcon('text')} Text`, tip: 'Create a new text entry' },
      { arch: 'textlog', label: `${archetypeIcon('textlog')} Log`, tip: 'Create a new textlog entry' },
      { arch: 'todo', label: `${archetypeIcon('todo')} Todo`, tip: 'Create a new todo entry' },
      { arch: 'spreadsheet', label: `${archetypeIcon('spreadsheet')} Sheet`, tip: 'Create a new spreadsheet entry' },
      { arch: 'attachment', label: `${archetypeIcon('attachment')} File`, tip: 'Create a new file attachment entry' },
      { arch: 'folder', label: `${archetypeIcon('folder')} Folder`, tip: 'Create a new folder' },
    ];

    if (shellNewButtonPickerEnabled()) {
      // pgc-99 wave-γ #1(MASTER.md §6.1):5 個 archetype create button を
      // 1 個の `+ New` button + popover picker に集約。click で popover を
      // toggle(action-binder の `toggle-new-picker` handler)、popover 内に
      // 5 件 row(同じ `data-pkc-action="create-entry"` を持つので既存 handler
      // から透明)。region は `new-picker-wrapper` で囲み、CSS で button と
      // popover の絶対位置 anchor を取る。Light mode disable / context-folder
      // 追従はそのまま継承。
      const wrap = createElement('div', 'pkc-new-picker-wrap');
      wrap.setAttribute('data-pkc-region', 'new-picker-wrap');

      const newBtn = createElement('button', 'pkc-btn pkc-btn-create pkc-btn-new');
      newBtn.setAttribute('data-pkc-action', 'toggle-new-picker');
      newBtn.setAttribute('title', 'Create a new entry (T)ext / (L)og / Todo / File / Folder');
      newBtn.setAttribute('aria-haspopup', 'menu');
      newBtn.setAttribute('aria-expanded', 'false');
      newBtn.textContent = '+ New';
      wrap.appendChild(newBtn);

      const popover = createElement('div', 'pkc-new-picker-popover');
      popover.setAttribute('data-pkc-region', 'new-picker-popover');
      popover.setAttribute('role', 'menu');
      popover.setAttribute('aria-label', 'Create entry by archetype');
      // default 非表示(`toggle-new-picker` handler が `data-pkc-open` を
      // 立てて display を変える)。
      popover.setAttribute('data-pkc-open', 'false');
      for (const { arch, label, tip } of archetypeButtons) {
        const row = createElement('button', 'pkc-new-picker-row');
        row.setAttribute('data-pkc-action', 'create-entry');
        row.setAttribute('data-pkc-archetype', arch);
        row.setAttribute('title', tip);
        row.setAttribute('role', 'menuitem');
        if (contextFolder) {
          row.setAttribute('data-pkc-context-folder', contextFolder.lid);
        }
        if (arch === 'attachment' && state.lightSource) {
          (row as HTMLButtonElement).disabled = true;
          row.setAttribute('title', 'File attachments cannot be created in Light mode');
          row.setAttribute('data-pkc-light-disabled', 'true');
        }
        row.textContent = label;
        popover.appendChild(row);
      }
      wrap.appendChild(popover);
      createGroup.appendChild(wrap);
    } else {
      for (const { arch, label, tip } of archetypeButtons) {
        const btn = createElement('button', 'pkc-btn pkc-btn-create');
        btn.setAttribute('data-pkc-action', 'create-entry');
        btn.setAttribute('data-pkc-archetype', arch);
        btn.setAttribute('title', tip);
        if (contextFolder) {
          btn.setAttribute('data-pkc-context-folder', contextFolder.lid);
        }
        // Disable attachment creation in Light mode (no asset storage)
        if (arch === 'attachment' && state.lightSource) {
          (btn as HTMLButtonElement).disabled = true;
          btn.setAttribute('title', 'File attachments cannot be created in Light mode');
          btn.setAttribute('data-pkc-light-disabled', 'true');
        }
        btn.textContent = label;
        createGroup.appendChild(btn);
      }
    }

    header.appendChild(createGroup);

    // Export / Import inline buttons
    // pgc-100 wave-γ #2(MASTER.md §6.1 phase 2):flag ON 時は header から外し、
    // Shell Menu の "Data" section へ集約(`renderShellMenu` 側で同 element
    // を append する)。OFF で従来 header inline 表示。
    //
    // pgc-135 hotfix(user bug report 2026-05-23、全 flag ON で export 動線
    // が見えなくなる issue):flag ON 時でも **小さな `📤 Export…` fallback
    // button** を header に 1 個残す。
    //
    // pgc-162 hotfix(user bug report 2026-05-24「Export ボタンを押すと
    // シェルメニューが開く」):**fallback button の action が
    // toggle-shell-menu だった** ため、user が「Export ボタン」 と思って
    // 押すと shell menu open のみ(2 段階)で意図と乖離。**直接 `begin-export`
    // dispatch に切替**(default `mode='full'`、mutability='editable')。
    // Full mode 以外を選びたい user は shell menu の Data section から、
    // という案内を title / aria-label に明記。
    if (!shellDataInShellMenuEnabled()) {
      header.appendChild(renderExportImportInline(state));
    } else {
      const exportFallback = createElement('button', 'pkc-btn pkc-btn-create pkc-header-export-fallback');
      exportFallback.setAttribute('data-pkc-action', 'begin-export');
      exportFallback.setAttribute('data-pkc-export-mode', 'full');
      exportFallback.setAttribute('data-pkc-export-mutability', 'editable');
      exportFallback.setAttribute(
        'title',
        'Export HTML(Full、editable)── 別 mode は Shell Menu → Data section から',
      );
      exportFallback.setAttribute('aria-label', 'Export HTML (Full, editable)');
      exportFallback.textContent = '📤 Export';
      header.appendChild(exportFallback);
    }
  }

  // Readonly mode: show readonly badge and rehydrate button
  if (state.phase === 'ready' && state.readonly) {
    const roBadge = createElement('span', 'pkc-readonly-badge');
    roBadge.setAttribute('data-pkc-region', 'readonly-badge');
    roBadge.textContent = 'Readonly';
    header.appendChild(roBadge);

    const rehydrateBtn = createElement('button', 'pkc-btn');
    rehydrateBtn.setAttribute('data-pkc-action', 'rehydrate');
    rehydrateBtn.setAttribute('title', 'Copy this container to your browser storage for editing');
    rehydrateBtn.textContent = 'Rehydrate to Workspace';
    header.appendChild(rehydrateBtn);

    // Container-wide TEXTLOG export — available in readonly mode
    // because export is a read-only operation (spec §7).
    const hasTextlogs = state.container?.entries.some((e) => e.archetype === 'textlog');
    if (hasTextlogs) {
      const textlogsBtn = createElement('button', 'pkc-btn pkc-btn-create');
      textlogsBtn.setAttribute('data-pkc-action', 'export-textlogs-container');
      textlogsBtn.setAttribute('title', 'Export all TEXTLOGs as a single ZIP bundle (.textlogs.zip)');
      textlogsBtn.textContent = '📦 TEXTLOGs';
      header.appendChild(textlogsBtn);
    }

    // Container-wide TEXT export — available in readonly mode
    // because export is a read-only operation (spec §7).
    const hasTexts = state.container?.entries.some((e) => e.archetype === 'text');
    if (hasTexts) {
      const textsBtn = createElement('button', 'pkc-btn pkc-btn-create');
      textsBtn.setAttribute('data-pkc-action', 'export-texts-container');
      textsBtn.setAttribute('title', 'Export all TEXTs as a single ZIP bundle (.texts.zip)');
      textsBtn.textContent = '📦 TEXTs';
      header.appendChild(textsBtn);
    }

    // Mixed container export — available in readonly mode.
    if (hasTextlogs || hasTexts) {
      const mixedBtn = createElement('button', 'pkc-btn pkc-btn-create');
      mixedBtn.setAttribute('data-pkc-action', 'export-mixed-container');
      mixedBtn.setAttribute('title', 'Export all TEXTs + TEXTLOGs as a single ZIP bundle (.mixed.zip)');
      mixedBtn.textContent = '📦 Mixed';
      header.appendChild(mixedBtn);
    }
  }

  // Light mode: show light badge (assets stripped)
  if (state.phase === 'ready' && state.lightSource) {
    const lightBadge = createElement('span', 'pkc-light-badge');
    lightBadge.setAttribute('data-pkc-region', 'light-badge');
    lightBadge.textContent = 'Light';
    lightBadge.setAttribute('title', 'Loaded from Light export — file attachments have no data');
    header.appendChild(lightBadge);
  }

  if (state.phase === 'exporting') {
    const badge = createElement('span', 'pkc-export-badge');
    badge.textContent = 'Exporting…';
    header.appendChild(badge);
  }

  // Pane toggle buttons (always shown). Wrapped in a right-anchored
  // group so they stay pinned to the header's right edge in every phase
  // — without the wrapper, phases that produce few preceding elements
  // (e.g. `editing`) leave the toggles clustered on the left.
  const toggles = createElement('div', 'pkc-header-toggles');

  const sidebarToggle = createElement('button', 'pkc-tray-toggle');
  sidebarToggle.setAttribute('data-pkc-action', 'toggle-sidebar');
  sidebarToggle.setAttribute('title', 'Toggle sidebar');
  sidebarToggle.textContent = '◧';
  toggles.appendChild(sidebarToggle);

  const metaToggle = createElement('button', 'pkc-tray-toggle');
  metaToggle.setAttribute('data-pkc-action', 'toggle-meta');
  metaToggle.setAttribute('title', 'Toggle meta pane');
  metaToggle.textContent = '◨';
  toggles.appendChild(metaToggle);

  // Focus mode: hide / restore both side panes at once. Mirrors the
  // Ctrl+Alt+\ keyboard chord so touch / mouse users can reach the
  // same affordance without a keyboard.
  const focusToggle = createElement('button', 'pkc-tray-toggle');
  focusToggle.setAttribute('data-pkc-action', 'toggle-focus-mode');
  focusToggle.setAttribute('title', 'Focus mode — hide both panes (Ctrl+Alt+\\)');
  focusToggle.textContent = '▣';
  toggles.appendChild(focusToggle);

  // Shell menu button
  const menuBtn = createElement('button', 'pkc-tray-toggle pkc-shell-menu-btn');
  menuBtn.setAttribute('data-pkc-action', 'toggle-shell-menu');
  menuBtn.setAttribute('title', 'Menu (?)');
  menuBtn.textContent = '⚙';
  toggles.appendChild(menuBtn);

  // 🐞 Debug Report button — placed to the right of the shell menu
  // when `?pkc-debug=<feature>` is active. Click is wired through
  // action-binder (`dump-debug-report`); the report downloads as
  // `pkc2-debug-<ISO-ts>.json`. Inherits all visual styling from
  // `pkc-tray-toggle` so the button is indistinguishable from other
  // header toolbar buttons.
  if (isRecordingEnabled()) {
    const debugBtn = createElement('button', 'pkc-tray-toggle');
    debugBtn.setAttribute('data-pkc-action', 'dump-debug-report');
    debugBtn.setAttribute('data-pkc-region', 'debug-report-button');
    debugBtn.setAttribute('data-pkc-debug', 'true');
    debugBtn.setAttribute('aria-label', 'Download debug report as JSON');
    debugBtn.setAttribute('title', 'Download debug report (PKC2 debug)');
    debugBtn.textContent = '🐞';
    toggles.appendChild(debugBtn);
  }

  header.appendChild(toggles);

  // Top-header 階層パス(Explorer 風 path trail、pgc-42 / user direction
  // 2026-05-20)。header 最下段に full-width 1 行で出す。
  const pathTrail = renderHeaderPathTrail(state);
  if (pathTrail) header.appendChild(pathTrail);

  return header;
}

// pgc-101 wave-γ #3 helper:breadcrumb 先頭に `⇐` `⇒` icon を prepend。
// navIndex / navHistory.length で各 button の disabled 状態を決める
// (標準 nav group と同条件、`go-back` / `go-forward` action を dispatch)。
function appendBackForwardIcons(nav: HTMLElement, state: AppState): void {
  // pgc-160 user bug fix(2026-05-24):disabled 時の tooltip で「履歴
  // なし」 を明示 ── user 体感「押せない」 を「履歴が無いから押せない」
  // に翻訳。aria-label も更新で screen reader にも伝わる。
  const back = createElement('button', 'pkc-button-base pkc-button-size-icon pkc-header-path-nav-btn pkc-header-path-nav-back');
  back.setAttribute('data-pkc-action', 'go-back');
  const backDisabled = state.navIndex <= 0;
  back.setAttribute('title', backDisabled
    ? '戻る履歴がありません(エントリを移動すると履歴が記録されます)'
    : '前のエントリへ戻る (Alt+←)');
  back.setAttribute('aria-label', backDisabled ? '戻る(履歴なし)' : '戻る');
  back.textContent = '⇐';
  if (backDisabled) back.setAttribute('disabled', '');
  nav.appendChild(back);
  const fwd = createElement('button', 'pkc-button-base pkc-button-size-icon pkc-header-path-nav-btn pkc-header-path-nav-fwd');
  fwd.setAttribute('data-pkc-action', 'go-forward');
  const fwdDisabled = state.navIndex >= state.navHistory.length - 1;
  fwd.setAttribute('title', fwdDisabled
    ? '進む履歴がありません(一度戻ると進む先が生まれます)'
    : '次のエントリへ進む (Alt+→)');
  fwd.setAttribute('aria-label', fwdDisabled ? '進む(履歴なし)' : '進む');
  fwd.textContent = '⇒';
  if (fwdDisabled) fwd.setAttribute('disabled', '');
  nav.appendChild(fwd);
}

// Top-header の階層パス(Explorer 風 path trail)。user direction
// (2026-05-20「トップレベルの最上部のヘッダにファイラの階層パスを
// エクスプローラみたいに表示・jump できるように」)。選択中 entry の
// 祖先 folder を辿り、各 segment を click で SELECT_ENTRY(= jump)。
// center pane の breadcrumb(renderView 内)と data 経路(`getBreadcrumb`)を
// 共有する別 surface で、常時可視。選択が無ければ null(描画しない)。
//
// pgc-101 wave-γ #3(MASTER.md §6.1 phase 3):
// `shellBackForwardInBreadcrumbEnabled()` ON 時、本 nav の **先頭** に
// `⇐` `⇒` icon button を prepend する(`go-back` / `go-forward` action、
// disabled handling は標準 nav group と同条件)。選択無しで pathTrail が
// 通常 null になる case でも、本 flag ON 時は icon だけの minimal nav を
// 返して navigation 動線を保つ。
function renderHeaderPathTrail(state: AppState): HTMLElement | null {
  const container = state.container;
  const lid = state.selectedLid;
  const integratedBackForward = shellBackForwardInBreadcrumbEnabled();

  // 通常 path:選択あり + entry 存在 → 階層パス描画。
  // pgc-238:filter-cache の entryByLid Map で O(1) lookup。
  const entry = lid && container
    ? getFilterIndexes(container).entryByLid.get(lid)
    : undefined;
  if (!container || !lid || !entry) {
    if (!integratedBackForward) return null;
    // flag ON で選択無し:icon だけの minimal nav。
    const minimal = createElement('nav', 'pkc-header-path');
    minimal.setAttribute('data-pkc-region', 'header-path');
    minimal.setAttribute('aria-label', '階層パス');
    appendBackForwardIcons(minimal, state);
    return minimal;
  }

  const nav = createElement('nav', 'pkc-header-path');
  nav.setAttribute('data-pkc-region', 'header-path');
  nav.setAttribute('aria-label', '階層パス');

  // pgc-101:flag ON 時、`⇐` `⇒` icon を nav 先頭に prepend。
  if (integratedBackForward) appendBackForwardIcons(nav, state);

  const appendSep = (): void => {
    const sep = createElement('span', 'pkc-header-path-sep');
    sep.textContent = '›';
    nav.appendChild(sep);
  };

  // Root marker(非 clickable)。
  const root = createElement('span', 'pkc-header-path-root');
  root.textContent = 'Root';
  nav.appendChild(root);

  const ancestors = getBreadcrumb(container.relations, container.entries, lid);

  // 祖先が getBreadcrumb の maxDepth cap で truncate されていれば … を挟む。
  if (
    ancestors.length > 0 &&
    getStructuralParent(container.relations, container.entries, ancestors[0]!.lid) !== null
  ) {
    appendSep();
    const trunc = createElement('span', 'pkc-header-path-truncated');
    trunc.setAttribute('title', '…(省略された祖先あり)');
    trunc.textContent = '…';
    nav.appendChild(trunc);
  }

  // 祖先 folder — click で jump(SELECT_ENTRY、action-binder の汎用 handler)。
  for (const a of ancestors) {
    appendSep();
    const seg = createElement('span', 'pkc-header-path-segment');
    seg.setAttribute('data-pkc-action', 'select-entry');
    seg.setAttribute('data-pkc-lid', a.lid);
    seg.setAttribute('title', a.title || '(untitled)');
    seg.textContent = a.title || '(untitled)';
    nav.appendChild(seg);
  }

  // 現在 entry(非 clickable — 既にそこに居る)。
  appendSep();
  const current = createElement('span', 'pkc-header-path-current');
  // A6:CSS 側で ellipsis 省略するので、祖先 segment(上で title 付与済)と
  // 同じく全文を tooltip で確認できるようにする。current だけ title が
  // 欠けているのは非対称だった。
  current.setAttribute('title', entry.title || '(untitled)');
  current.textContent = entry.title || '(untitled)';
  nav.appendChild(current);

  return nav;
}

/**
 * Read the currently effective theme mode from the root element.
 * `data-pkc-theme="light" | "dark"` is an explicit override; absence
 * means "follow the system `prefers-color-scheme`" (i.e. system mode).
 */
function getCurrentThemeMode(): 'light' | 'dark' | 'system' {
  if (typeof document === 'undefined') return 'system';
  const pkc = document.getElementById('pkc-root');
  const attr = pkc?.getAttribute('data-pkc-theme');
  if (attr === 'light' || attr === 'dark') return attr;
  return 'system';
}

function renderShellMenu(
  currentTheme: 'light' | 'dark' | 'system',
  state: AppState,
): HTMLElement {
  // Dialog-style overlay (matches the shortcut-help pattern) so that the
  // menu is always centered on the viewport, above all other panes, and
  // never gets pushed below the right pane or clipped by the event log.
  const overlay = createElement('div', 'pkc-shell-menu-overlay');
  overlay.setAttribute('data-pkc-region', 'shell-menu');
  // pgc-207 (user 報告 2026-05-24「100エントリ程度で凄まじく動作が重い」):
  // shell menu は ~850 行の builder で Theme / Scanline / Accent / Settings /
  // Data section / Maintenance / Quick Help / Tools / Debug 等 ~200+ DOM
  // node を生成する。従来は menuOpen=false でも全 DOM を build して
  // `display:none` で隠していたため、毎 render の wasted work 大。本 PR で
  // menuOpen=false 時は overlay placeholder のみ返す early return に最適化。
  // menuOpen → true 遷移時は render-scope='full'(`menuOpen` is in full-trigger
  // 一覧)で full re-render が triggers され、その render で menu DOM が
  // build される。閉じた時も同様。後方互換完全(action-binder の menu DOM
  // query は event delegation 経由で missing DOM へは event が届かない)。
  if (!state.menuOpen) {
    overlay.style.display = 'none';
    return overlay;
  }
  overlay.style.display = '';

  const card = createElement('div', 'pkc-shell-menu-card');

  const heading = createElement('h2', 'pkc-shell-menu-heading');
  heading.textContent = 'Menu';
  card.appendChild(heading);

  // Theme selector: three explicit modes (Light / Dark / System).
  // The active mode is highlighted via `data-pkc-theme-active="true"`.
  const themeSection = createElement('div', 'pkc-shell-menu-section');
  const themeLabel = createElement('span', 'pkc-shell-menu-label');
  themeLabel.textContent = 'Theme';
  themeSection.appendChild(themeLabel);

  const themeButtons = createElement('div', 'pkc-shell-menu-theme-buttons');
  const modes: { mode: 'light' | 'dark' | 'system'; label: string }[] = [
    { mode: 'light', label: '☀ Light' },
    { mode: 'dark', label: '🌙 Dark' },
    { mode: 'system', label: '🖥 System' },
  ];
  for (const { mode, label } of modes) {
    const btn = createElement('button', 'pkc-btn-small pkc-shell-menu-theme-btn');
    btn.setAttribute('data-pkc-action', 'set-theme');
    btn.setAttribute('data-pkc-theme-mode', mode);
    if (currentTheme === mode) {
      btn.setAttribute('data-pkc-theme-active', 'true');
    }
    btn.textContent = label;
    themeButtons.appendChild(btn);
  }
  themeSection.appendChild(themeButtons);
  card.appendChild(themeSection);

  // Scanline segmented control (FI-12 follow-up). A single toggle
  // button hid the current state behind an opaque glyph; a two-button
  // segmented control mirrors the Theme row above so "which one is
  // active right now" is obvious at a glance.
  const scanlineSection = createElement('div', 'pkc-shell-menu-section');
  const scanlineLabel = createElement('span', 'pkc-shell-menu-label');
  scanlineLabel.textContent = 'Scanline';
  scanlineSection.appendChild(scanlineLabel);
  const scanlineButtons = createElement('div', 'pkc-shell-menu-theme-buttons');
  const scanlineOn = state.showScanline === true;
  const scanlineChoices: { value: 'off' | 'on'; label: string }[] = [
    { value: 'off', label: '○ Off' },
    { value: 'on', label: '◉ On' },
  ];
  for (const { value, label } of scanlineChoices) {
    const btn = createElement('button', 'pkc-btn-small pkc-shell-menu-theme-btn');
    btn.setAttribute('data-pkc-action', 'set-scanline');
    btn.setAttribute('data-pkc-scanline-value', value);
    const isActive = (value === 'on') === scanlineOn;
    btn.setAttribute('data-pkc-active', String(isActive));
    if (isActive) btn.setAttribute('data-pkc-theme-active', 'true');
    btn.textContent = label;
    scanlineButtons.appendChild(btn);
  }
  scanlineSection.appendChild(scanlineButtons);
  card.appendChild(scanlineSection);

  // #938 R10(2026-07-20 洗練化): タブ機能の発見可能性昇格。
  // `shell.tabs_enabled` は Flags Inspector の奥で眠っていた(refinement-
  // research §5「タブ機能が flag 裏で発見不能」)。設定メニューに Off/On
  // segmented control を常設し、SET_FLAG 経由で container に永続化する。
  const tabsSection = createElement('div', 'pkc-shell-menu-section');
  const tabsLabel = createElement('span', 'pkc-shell-menu-label');
  tabsLabel.textContent = 'Tabs';
  tabsSection.appendChild(tabsLabel);
  const tabsButtons = createElement('div', 'pkc-shell-menu-theme-buttons');
  const tabsOn = shellTabsEnabled();
  const tabsChoices: { value: 'false' | 'true'; label: string }[] = [
    { value: 'false', label: '○ Off' },
    { value: 'true', label: '◉ On' },
  ];
  for (const { value, label } of tabsChoices) {
    const btn = createElement('button', 'pkc-btn-small pkc-shell-menu-theme-btn');
    btn.setAttribute('data-pkc-action', 'set-bool-flag');
    btn.setAttribute('data-pkc-flag-key', 'shell.tabs_enabled');
    btn.setAttribute('data-pkc-flag-value', value);
    const isActive = (value === 'true') === tabsOn;
    btn.setAttribute('data-pkc-active', String(isActive));
    if (isActive) btn.setAttribute('data-pkc-theme-active', 'true');
    btn.textContent = label;
    tabsButtons.appendChild(btn);
  }
  tabsSection.appendChild(tabsButtons);
  const tabsHint = createElement('div', 'pkc-shell-menu-hint');
  tabsHint.textContent = 'ブラウザ風タブ(開いたエントリの一覧をセンター上部に表示。右クリックで一覧・復元)';
  tabsSection.appendChild(tabsHint);
  card.appendChild(tabsSection);

  // #954(2026-07-22): 起動後お知らせのオフスイッチ(R10 の汎用
  // set-bool-flag トグルを再利用)。
  const newsSection = createElement('div', 'pkc-shell-menu-section');
  const newsLabel = createElement('span', 'pkc-shell-menu-label');
  newsLabel.textContent = 'News';
  newsSection.appendChild(newsLabel);
  const newsButtons = createElement('div', 'pkc-shell-menu-theme-buttons');
  const newsOn = shellStartupNoticeEnabled();
  const newsChoices: { value: 'false' | 'true'; label: string }[] = [
    { value: 'false', label: '○ Off' },
    { value: 'true', label: '◉ On' },
  ];
  for (const { value, label } of newsChoices) {
    const btn = createElement('button', 'pkc-btn-small pkc-shell-menu-theme-btn');
    btn.setAttribute('data-pkc-action', 'set-bool-flag');
    btn.setAttribute('data-pkc-flag-key', 'shell.startup_notice_enabled');
    btn.setAttribute('data-pkc-flag-value', value);
    const isActive = (value === 'true') === newsOn;
    btn.setAttribute('data-pkc-active', String(isActive));
    if (isActive) btn.setAttribute('data-pkc-theme-active', 'true');
    btn.textContent = label;
    newsButtons.appendChild(btn);
  }
  newsSection.appendChild(newsButtons);
  const newsHint = createElement('div', 'pkc-shell-menu-hint');
  newsHint.textContent = '起動後にアップデートのお知らせを表示(1 リリースにつき 1 回)';
  newsSection.appendChild(newsHint);
  card.appendChild(newsSection);

  // Accent color picker (FI-12 follow-up). A native <input type="color">
  // + a reset button. Runtime-only — persistence is deferred to the
  // hidden system settings entry design (see
  // `docs/spec/system-settings-hidden-entry-v1-minimum-scope.md`).
  const accentSection = createElement('div', 'pkc-shell-menu-section');
  const accentLabel = createElement('span', 'pkc-shell-menu-label');
  accentLabel.textContent = 'Accent';
  accentSection.appendChild(accentLabel);
  const accentControls = createElement('div', 'pkc-shell-menu-theme-buttons');
  const accentInput = createElement('input', 'pkc-shell-menu-accent-input') as HTMLInputElement;
  accentInput.type = 'color';
  accentInput.setAttribute('data-pkc-action', 'set-accent-color');
  accentInput.setAttribute('data-pkc-field', 'accent-color');
  // The <input type="color"> requires a 6-digit hex. When no override
  // is set we seed it with the neon-green default so the picker opens
  // at the token color rather than #000000.
  accentInput.value = state.accentColor ?? '#33ff66';
  accentControls.appendChild(accentInput);
  const accentReset = createElement('button', 'pkc-btn-small pkc-shell-menu-theme-btn');
  accentReset.setAttribute('data-pkc-action', 'reset-accent-color');
  accentReset.textContent = 'Neon Green に戻す';
  accentControls.appendChild(accentReset);
  accentSection.appendChild(accentControls);
  card.appendChild(accentSection);

  // FI-Settings v1 full UI — additional appearance / locale controls.
  const settings = state.settings ?? SETTINGS_DEFAULTS;
  // Theme-aware defaults for color pickers: so the picker opens at the
  // current effective color rather than black.
  const themeDefaults = currentTheme === 'light'
    ? { bg: '#f0ebe0', fg: '#1a1a14' }
    : { bg: '#0d0f0a', fg: '#c8d8b0' };

  // Border color
  const borderSection = createElement('div', 'pkc-shell-menu-section');
  const borderLabel = createElement('span', 'pkc-shell-menu-label');
  borderLabel.textContent = 'Border';
  borderSection.appendChild(borderLabel);
  const borderControls = createElement('div', 'pkc-shell-menu-theme-buttons');
  const borderInput = createElement('input', 'pkc-shell-menu-accent-input') as HTMLInputElement;
  borderInput.type = 'color';
  borderInput.setAttribute('data-pkc-action', 'set-border-color');
  borderInput.value = settings.theme.borderColor ?? '#333333';
  borderControls.appendChild(borderInput);
  const borderReset = createElement('button', 'pkc-btn-small pkc-shell-menu-theme-btn');
  borderReset.setAttribute('data-pkc-action', 'reset-border-color');
  borderReset.textContent = 'Default';
  borderControls.appendChild(borderReset);
  borderSection.appendChild(borderControls);
  card.appendChild(borderSection);

  // Background color
  const bgSection = createElement('div', 'pkc-shell-menu-section');
  const bgLabel = createElement('span', 'pkc-shell-menu-label');
  bgLabel.textContent = 'Background';
  bgSection.appendChild(bgLabel);
  const bgControls = createElement('div', 'pkc-shell-menu-theme-buttons');
  const bgInput = createElement('input', 'pkc-shell-menu-accent-input') as HTMLInputElement;
  bgInput.type = 'color';
  bgInput.setAttribute('data-pkc-action', 'set-background-color');
  bgInput.value = settings.theme.backgroundColor ?? themeDefaults.bg;
  bgControls.appendChild(bgInput);
  const bgReset = createElement('button', 'pkc-btn-small pkc-shell-menu-theme-btn');
  bgReset.setAttribute('data-pkc-action', 'reset-background-color');
  bgReset.textContent = 'Default';
  bgControls.appendChild(bgReset);
  bgSection.appendChild(bgControls);
  card.appendChild(bgSection);

  // UI text color
  const uiTextSection = createElement('div', 'pkc-shell-menu-section');
  const uiTextLabel = createElement('span', 'pkc-shell-menu-label');
  uiTextLabel.textContent = 'UI Text';
  uiTextSection.appendChild(uiTextLabel);
  const uiTextControls = createElement('div', 'pkc-shell-menu-theme-buttons');
  const uiTextInput = createElement('input', 'pkc-shell-menu-accent-input') as HTMLInputElement;
  uiTextInput.type = 'color';
  uiTextInput.setAttribute('data-pkc-action', 'set-ui-text-color');
  uiTextInput.value = settings.theme.uiTextColor ?? themeDefaults.fg;
  uiTextControls.appendChild(uiTextInput);
  const uiTextReset = createElement('button', 'pkc-btn-small pkc-shell-menu-theme-btn');
  uiTextReset.setAttribute('data-pkc-action', 'reset-ui-text-color');
  uiTextReset.textContent = 'Default';
  uiTextControls.appendChild(uiTextReset);
  uiTextSection.appendChild(uiTextControls);
  card.appendChild(uiTextSection);

  // Body text color
  const bodyTextSection = createElement('div', 'pkc-shell-menu-section');
  const bodyTextLabel = createElement('span', 'pkc-shell-menu-label');
  bodyTextLabel.textContent = 'Body Text';
  bodyTextSection.appendChild(bodyTextLabel);
  const bodyTextControls = createElement('div', 'pkc-shell-menu-theme-buttons');
  const bodyTextInput = createElement('input', 'pkc-shell-menu-accent-input') as HTMLInputElement;
  bodyTextInput.type = 'color';
  bodyTextInput.setAttribute('data-pkc-action', 'set-body-text-color');
  bodyTextInput.value = settings.theme.bodyTextColor ?? themeDefaults.fg;
  bodyTextControls.appendChild(bodyTextInput);
  const bodyTextReset = createElement('button', 'pkc-btn-small pkc-shell-menu-theme-btn');
  bodyTextReset.setAttribute('data-pkc-action', 'reset-body-text-color');
  bodyTextReset.textContent = 'Default';
  bodyTextControls.appendChild(bodyTextReset);
  bodyTextSection.appendChild(bodyTextControls);
  card.appendChild(bodyTextSection);

  // WCAG contrast ratio display
  const wcagSection = createElement('div', 'pkc-shell-menu-section');
  wcagSection.setAttribute('data-pkc-region', 'wcag-contrast');
  const wcagLabel = createElement('span', 'pkc-shell-menu-label');
  wcagLabel.textContent = 'Contrast';
  wcagSection.appendChild(wcagLabel);
  const wcagBox = createElement('div', 'pkc-shell-menu-wcag');
  const effectiveBg = settings.theme.backgroundColor ?? themeDefaults.bg;
  const effectiveUiText = settings.theme.uiTextColor ?? themeDefaults.fg;
  const effectiveBodyText = settings.theme.bodyTextColor ?? themeDefaults.fg;
  const uiRatio = contrastRatio(effectiveBg, effectiveUiText);
  const bodyRatio = contrastRatio(effectiveBg, effectiveBodyText);
  const uiGrade = wcagGrade(uiRatio);
  const bodyGrade = wcagGrade(bodyRatio);
  const uiLine = createElement('div', 'pkc-wcag-line');
  uiLine.innerHTML = `UI: <strong>${formatContrastRatio(uiRatio)}</strong> <span class="pkc-wcag-badge" data-pkc-wcag="${uiGrade}">${uiGrade}</span>`;
  const bodyLine = createElement('div', 'pkc-wcag-line');
  bodyLine.innerHTML = `Body: <strong>${formatContrastRatio(bodyRatio)}</strong> <span class="pkc-wcag-badge" data-pkc-wcag="${bodyGrade}">${bodyGrade}</span>`;
  wcagBox.appendChild(uiLine);
  wcagBox.appendChild(bodyLine);
  wcagSection.appendChild(wcagBox);
  card.appendChild(wcagSection);

  // Preferred font (dropdown + direct input)
  const fontSection = createElement('div', 'pkc-shell-menu-section');
  const fontLabel = createElement('span', 'pkc-shell-menu-label');
  fontLabel.textContent = 'Font';
  fontSection.appendChild(fontLabel);
  const fontControls = createElement('div', 'pkc-shell-menu-theme-buttons');
  const fontSelect = createElement('select', 'pkc-shell-menu-select') as HTMLSelectElement;
  fontSelect.setAttribute('data-pkc-action', 'set-preferred-font');
  const fontOptions: { value: string; label: string }[] = [
    { value: '', label: 'Preset' },
    { value: 'BIZ UDGothic', label: 'BIZ UDGothic' },
    { value: 'IBM Plex Mono', label: 'IBM Plex Mono' },
    { value: 'Share Tech Mono', label: 'Share Tech Mono' },
    { value: 'Inter', label: 'Inter' },
    { value: 'sans-serif', label: 'Sans Serif' },
    { value: 'monospace', label: 'Monospace' },
  ];
  for (const { value, label } of fontOptions) {
    const opt = createElement('option', '') as HTMLOptionElement;
    opt.value = value;
    opt.textContent = label;
    if (value === (settings.display.preferredFont ?? '')) opt.selected = true;
    fontSelect.appendChild(opt);
  }
  fontControls.appendChild(fontSelect);
  const fontInput = createElement('input', 'pkc-shell-menu-font-input') as HTMLInputElement;
  fontInput.type = 'text';
  fontInput.placeholder = 'Direct input (priority)';
  fontInput.setAttribute('data-pkc-action', 'set-font-direct-input');
  fontInput.value = settings.display.fontDirectInput ?? '';
  fontControls.appendChild(fontInput);
  fontSection.appendChild(fontControls);
  card.appendChild(fontSection);

  // Language
  const langSection = createElement('div', 'pkc-shell-menu-section');
  const langLabel = createElement('span', 'pkc-shell-menu-label');
  langLabel.textContent = 'Language';
  langSection.appendChild(langLabel);
  const langControls = createElement('div', 'pkc-shell-menu-theme-buttons');
  const langSelect = createElement('select', 'pkc-shell-menu-select') as HTMLSelectElement;
  langSelect.setAttribute('data-pkc-action', 'set-language');
  const langOptions: { value: string; label: string }[] = [
    { value: '', label: 'System' },
    { value: 'ja', label: '日本語 (ja)' },
    { value: 'en', label: 'English (en)' },
    { value: 'en-US', label: 'English (en-US)' },
    { value: 'zh-Hant-TW', label: '繁體中文 (zh-Hant-TW)' },
    { value: 'ko', label: '한국어 (ko)' },
  ];
  for (const { value, label } of langOptions) {
    const opt = createElement('option', '') as HTMLOptionElement;
    opt.value = value;
    opt.textContent = label;
    if (value === (settings.locale.language ?? '')) opt.selected = true;
    langSelect.appendChild(opt);
  }
  langControls.appendChild(langSelect);
  langSection.appendChild(langControls);
  card.appendChild(langSection);

  // Timezone
  const tzSection = createElement('div', 'pkc-shell-menu-section');
  const tzLabel = createElement('span', 'pkc-shell-menu-label');
  tzLabel.textContent = 'Timezone';
  tzSection.appendChild(tzLabel);
  const tzControls = createElement('div', 'pkc-shell-menu-theme-buttons');
  const tzSelect = createElement('select', 'pkc-shell-menu-select') as HTMLSelectElement;
  tzSelect.setAttribute('data-pkc-action', 'set-timezone');
  const tzOptions: { value: string; label: string }[] = [
    { value: '', label: 'System' },
    { value: 'Asia/Tokyo', label: 'Asia/Tokyo (JST)' },
    { value: 'UTC', label: 'UTC' },
    { value: 'America/New_York', label: 'America/New_York (ET)' },
    { value: 'America/Los_Angeles', label: 'America/Los_Angeles (PT)' },
    { value: 'Europe/London', label: 'Europe/London (GMT/BST)' },
  ];
  for (const { value, label } of tzOptions) {
    const opt = createElement('option', '') as HTMLOptionElement;
    opt.value = value;
    opt.textContent = label;
    if (value === (settings.locale.timezone ?? '')) opt.selected = true;
    tzSelect.appendChild(opt);
  }
  tzControls.appendChild(tzSelect);
  tzSection.appendChild(tzControls);
  card.appendChild(tzSection);

  // i18n limitation notice
  const i18nNotice = createElement('div', 'pkc-shell-menu-section pkc-shell-menu-i18n-notice');
  const i18nText = createElement('span', 'pkc-shell-menu-notice-text');
  i18nText.textContent = 'Language / Timezone は日付表示のフォーマットに反映されます。UI 文字列の翻訳は未実装です。';
  i18nNotice.appendChild(i18nText);
  card.appendChild(i18nNotice);

  // Settings File — C11 §4.6: prefs 単体のエクスポート / インポート。
  // データ・本文・asset は含まない小さな JSON(*.pkc2-prefs.json)。
  // export は readonly でも可(読むだけ)、import は書き込み可能な
  // container がある時のみ enabled。
  const prefsFileSection = createElement('div', 'pkc-shell-menu-section');
  prefsFileSection.setAttribute('data-pkc-region', 'shell-menu-prefs-file');
  const prefsFileLabel = createElement('span', 'pkc-shell-menu-label');
  prefsFileLabel.textContent = 'Settings File';
  prefsFileSection.appendChild(prefsFileLabel);
  const prefsFileButtons = createElement('div', 'pkc-shell-menu-theme-buttons');
  const prefsExportBtn = createElement('button', 'pkc-btn-small');
  prefsExportBtn.setAttribute('data-pkc-action', 'prefs-export');
  prefsExportBtn.setAttribute(
    'title',
    '画面設定・UI 設定だけを小さなファイル(.pkc2-prefs.json)に書き出す（データ・本文・添付は含まれません）',
  );
  prefsExportBtn.textContent = '📤 設定エクスポート';
  prefsFileButtons.appendChild(prefsExportBtn);
  const prefsImportBtn = createElement('button', 'pkc-btn-small');
  prefsImportBtn.setAttribute('data-pkc-action', 'prefs-import');
  prefsImportBtn.setAttribute(
    'title',
    '設定ファイル(.pkc2-prefs.json)を読み込んで適用する（差分を確認してから適用。uiPrefs は追加・上書きのみ）',
  );
  prefsImportBtn.textContent = '📥 設定インポート';
  if (state.readonly || !state.container) {
    (prefsImportBtn as HTMLButtonElement).disabled = true;
  }
  prefsFileButtons.appendChild(prefsImportBtn);
  prefsFileSection.appendChild(prefsFileButtons);
  card.appendChild(prefsFileSection);

  // Shortcuts
  const shortcutSection = createElement('div', 'pkc-shell-menu-section');
  const shortcutBtn = createElement('button', 'pkc-btn-small');
  shortcutBtn.setAttribute('data-pkc-action', 'show-shortcut-help');
  shortcutBtn.textContent = '⌨ Keyboard Shortcuts';
  shortcutSection.appendChild(shortcutBtn);

  const aboutBtn = createElement('button', 'pkc-btn-small');
  aboutBtn.setAttribute('data-pkc-action', 'select-about');
  aboutBtn.textContent = 'ℹ About PKC2';
  shortcutSection.appendChild(aboutBtn);

  // Flags Protocol v1 (PR-β-2): inspector launcher next to About,
  // always visible (no debug-mode gate, parallel to About). Clicking
  // opens the inspector overlay; the spec defines the URL parameter
  // `?pkc-flag=*` as an alternate launch path (handled at boot).
  const flagsBtn = createElement('button', 'pkc-btn-small');
  flagsBtn.setAttribute('data-pkc-action', 'open-flags-inspector');
  flagsBtn.textContent = '⚑ Flags';
  flagsBtn.setAttribute('title', 'Open the Flags Inspector');
  shortcutSection.appendChild(flagsBtn);
  card.appendChild(shortcutSection);

  // Data Maintenance — manual orphan asset cleanup + workspace reset.
  //
  // This section is intentionally passive until the user clicks:
  // the orphan count is just a read-only scan of the current
  // container, the cleanup button disables itself when there is
  // pgc-100 wave-γ #2(MASTER.md §6.1 phase 2):flag ON 時に Data… inline
  // panel を header から外して Shell Menu の section として集約。同じ
  // `renderExportImportInline(state)` を call するので機能差ゼロ、視覚的
  // 位置だけが header → shell-menu に移る。OFF で本 section 非表示
  // (従来 header inline)。`!readonly` 限定(header inline と同条件)。
  // pgc-209(pgc-205 probe finding):従来 `phase === 'ready'` で gating
  // していたため、export 中(phase='exporting')に Data section が消えて
  // しまい、再描画 race で「rapid double-click → 2 downloads」 が起き得た。
  // export 中も Data section を visible のままにし、Export ボタンを disable
  // する(視覚 feedback「Exporting…」+ click 防御)。
  if (
    shellDataInShellMenuEnabled() &&
    state.container &&
    !state.readonly &&
    (state.phase === 'ready' || state.phase === 'exporting')
  ) {
    const dataSection = createElement('div', 'pkc-shell-menu-section');
    dataSection.setAttribute('data-pkc-region', 'shell-menu-data');
    const dataLabel = createElement('span', 'pkc-shell-menu-label');
    dataLabel.textContent = state.phase === 'exporting' ? 'Data (Exporting…)' : 'Data';
    dataSection.appendChild(dataLabel);
    dataSection.appendChild(renderExportImportInline(state, { autoOpen: true, exporting: state.phase === 'exporting' }));
    card.appendChild(dataSection);
  }

  // nothing to do, and the whole surface is hidden in readonly /
  // container-absent modes where mutation is not allowed.
  //
  // The ⚠ Reset button was moved here from the header export/import
  // panel to separate destructive maintenance actions from daily
  // export/import operations (action surface consolidation).
  if (state.container && !state.readonly) {
    card.appendChild(renderShellMenuMaintenance(state.container));
  }

  // Quick Help — lightweight usage guide inside the shell menu.
  // Usage-oriented, not a full manual. Each line answers "what can
  // I do?" for a category of actions.
  const helpSection = createElement('div', 'pkc-shell-menu-section');
  helpSection.setAttribute('data-pkc-region', 'shell-menu-help');
  const helpLabel = createElement('span', 'pkc-shell-menu-label');
  helpLabel.textContent = 'Quick Help';
  helpSection.appendChild(helpLabel);

  const helpList = createElement('ul', 'pkc-shell-menu-help-list');
  const helpItems = [
    '作成: ヘッダーの Text / Log / Todo / File / Folder ボタン',
    '編集: エントリ選択 → Edit ボタン、または右クリック → Edit',
    'コピー: More… → MD（Markdown）/ Rich（リッチ貼り付け）',
    '表示: More… → Viewer（印刷可能なレンダリング表示）',
    'エクスポート: Data… → Export / Light / ZIP / TEXTLOGs / TEXTs / フォルダ選択 → Export',
    'インポート: Data… → Import（上書き）/ Textlog / Text / Batch（追加、フォルダ構造は自動復元）',
    '参照文字列: 右クリック → Entry ref / Embed ref / Asset ref',
    'ショートカット: ? キーで一覧表示',
  ];
  for (const text of helpItems) {
    const li = createElement('li', 'pkc-shell-menu-help-item');
    li.textContent = text;
    helpList.appendChild(li);
  }
  helpSection.appendChild(helpList);
  card.appendChild(helpSection);

  // Tools section (Phase 2 Slice 2 onward). Surfaces long-running /
  // optional maintenance operations that are not tied to a specific
  // entry. Currently only the Normalize PKC links preview; future
  // tools (bulk rename, orphan asset scan graduated from below,
  // clickable-image migration v2, etc.) land here too.
  const toolsSection = createElement('div', 'pkc-shell-menu-section');
  toolsSection.setAttribute('data-pkc-region', 'shell-menu-tools');
  const toolsLabel = createElement('span', 'pkc-shell-menu-label');
  toolsLabel.textContent = 'Tools';
  toolsSection.appendChild(toolsLabel);
  const toolsButtons = createElement('div', 'pkc-shell-menu-theme-buttons');
  const normalizeBtn = createElement(
    'button',
    'pkc-btn-small pkc-shell-menu-theme-btn',
  ) as HTMLButtonElement;
  normalizeBtn.setAttribute('data-pkc-action', 'open-link-migration-dialog');
  normalizeBtn.setAttribute('title', 'Normalize PKC links (preview)');
  // Disabled when no container is loaded (bootstrap / error phase):
  // keeps the menu stable across states instead of hiding the button.
  if (!state.container) {
    normalizeBtn.disabled = true;
    normalizeBtn.setAttribute('data-pkc-disabled-reason', 'no-container');
  }
  normalizeBtn.textContent = '🔧 Normalize PKC links';
  toolsButtons.appendChild(normalizeBtn);
  toolsSection.appendChild(toolsButtons);
  card.appendChild(toolsSection);

  // Extensions — #806 host-push の G3(既定送り先は可視・取消可能)。
  // 紐付け済み拡張と archetype/mime 別の既定送り先を一覧し、その場で
  // 解除 / 取消できる。何も無ければ section ごと出さない(clutter 回避)。
  // localStorage 直読みは pane-prefs / filer column widths と同じ前例。
  {
    const extBindings = loadExtensionBindings();
    const defaultEntries = Object.entries(extBindings.defaults);
    if (extBindings.bound.length > 0 || defaultEntries.length > 0) {
      const extSection = createElement('div', 'pkc-shell-menu-section');
      extSection.setAttribute('data-pkc-region', 'shell-menu-extensions');
      const extLabel = createElement('span', 'pkc-shell-menu-label');
      extLabel.textContent = 'Extensions';
      extSection.appendChild(extLabel);

      const titleOf = (lid: string): string =>
        state.container?.entries.find((e) => e.lid === lid)?.title || '(untitled)';

      for (const extLid of extBindings.bound) {
        const row = createElement('div', 'pkc-shell-menu-ext-row');
        row.setAttribute('data-pkc-ext-binding-row', extLid);
        const name = createElement('span', 'pkc-shell-menu-ext-name');
        name.textContent = `🧩 ${titleOf(extLid)}`;
        name.setAttribute('title', '紐付け済み拡張(「拡張へ送る」の宛先)');
        row.appendChild(name);
        const btn = createElement('button', 'pkc-btn-small');
        btn.setAttribute('data-pkc-action', 'unbind-extension');
        btn.setAttribute('data-pkc-ext-lid', extLid);
        btn.setAttribute('title', '紐付けを解除(この拡張への既定送り先設定も消えます)');
        btn.textContent = '解除';
        row.appendChild(btn);
        extSection.appendChild(row);
      }

      for (const [matchKey, extLid] of defaultEntries) {
        const row = createElement('div', 'pkc-shell-menu-ext-row');
        row.setAttribute('data-pkc-ext-default-row', matchKey);
        row.setAttribute('data-pkc-ext-default-target', extLid);
        const name = createElement('span', 'pkc-shell-menu-ext-name');
        name.textContent = `📌 ${matchKey} → ${titleOf(extLid)}`;
        name.setAttribute('title', 'この種類を「拡張へ送る」時の既定送り先');
        row.appendChild(name);
        const btn = createElement('button', 'pkc-btn-small');
        btn.setAttribute('data-pkc-action', 'clear-default-extension');
        btn.setAttribute('data-pkc-match-key', matchKey);
        btn.setAttribute('title', 'この既定送り先を取り消す');
        btn.textContent = '✕';
        row.appendChild(btn);
        extSection.appendChild(row);
      }

      card.appendChild(extSection);
    }
  }

  // Debug toggle — three-state segmented control mirroring the Theme
  // and Scanline rows above. Off / Structural / + Contents matches
  // the philosophy-doc graduated opt-in: structural mode is privacy-
  // by-default, content mode is the explicit user-selected escalation
  // (philosophy doc §4 原則 3). The Contents button carries a warning
  // class so the elevated mode is visually distinct.
  const debugSection = createElement('div', 'pkc-shell-menu-section');
  const debugLabel = createElement('span', 'pkc-shell-menu-label');
  debugLabel.textContent = 'Debug';
  debugSection.appendChild(debugLabel);
  const debugButtons = createElement('div', 'pkc-shell-menu-theme-buttons');
  const debugIsOn = isRecordingEnabled();
  const debugIsContent = isContentModeEnabled();
  const debugCurrent: 'off' | 'structural' | 'content' = debugIsContent
    ? 'content'
    : debugIsOn
      ? 'structural'
      : 'off';
  const debugChoices: {
    value: 'off' | 'structural' | 'content';
    label: string;
    title: string;
    extraClass?: string;
  }[] = [
    { value: 'off', label: '○ Off', title: 'Reload without ?pkc-debug' },
    {
      value: 'structural',
      label: '🐞 Structural',
      title:
        'Reload with ?pkc-debug=* (structural mode — actions / lids only)',
    },
    {
      value: 'content',
      label: '🐞 + Contents',
      title:
        'Reload with ?pkc-debug=*&pkc-debug-contents=1 (content mode — entry titles, bodies, asset bytes included in dispatch records)',
      extraClass: 'pkc-shell-menu-debug-contents',
    },
  ];
  for (const { value, label, title, extraClass } of debugChoices) {
    const cls = extraClass
      ? `pkc-btn-small pkc-shell-menu-theme-btn ${extraClass}`
      : 'pkc-btn-small pkc-shell-menu-theme-btn';
    const btn = createElement('button', cls);
    btn.setAttribute('data-pkc-action', 'set-debug-mode');
    btn.setAttribute('data-pkc-debug-mode', value);
    btn.setAttribute('data-pkc-region', `debug-restart-${value}`);
    btn.setAttribute('title', title);
    if (debugCurrent === value) {
      btn.setAttribute('data-pkc-debug-active', 'true');
    }
    btn.textContent = label;
    debugButtons.appendChild(btn);
  }
  debugSection.appendChild(debugButtons);
  card.appendChild(debugSection);

  // PR-O (2026-05-06):Bookmarklet generator。user 報告「ブックマーク
  // レットが使えないように感じる」。実装は Phase 3c-E から存在(URL
  // `?pkc-snapshot=<base64>` を boot path で intake)、しかし生成 UI が
  // 無く一般 user に届いていなかった。shell menu から draggable link
  // で配布する。
  const bmSection = createElement('div', 'pkc-shell-menu-section pkc-shell-menu-bookmarklet');
  const bmLabel = createElement('span', 'pkc-shell-menu-label');
  bmLabel.textContent = 'Bookmarklet';
  bmSection.appendChild(bmLabel);
  // PR-R (2026-05-06) → PR-Z hotfix (2026-05-06):bookmarklet target URL
  // 解決を環境別に固める。
  //
  // - http(s) hosted(GitHub Pages / 自前 host)→ そのままその URL を target に
  // - file:// で開いている場合は `window.location.origin === 'null'`(string)
  //   になり、`null + pathname` で壊れた URL を生成していた(user 報告
  //   「null/Users/.../pkc2-...html」)。修正:`file://` のときは public
  //   stable URL に fallback し、user に「file:// では同 instance への
  //   bookmarklet 経由は不可能(Web ページから file:// は browser security
  //   でブロック)」を desc 文で伝える。
  const PKC2_PUBLIC_STABLE_URL = 'https://sm06224.github.io/PKC-Public/PKC2/';
  const isFileOrigin = window.location.origin === 'null' || window.location.protocol === 'file:';
  const bookmarkletTargetUrl = isFileOrigin
    ? PKC2_PUBLIC_STABLE_URL
    : `${window.location.origin}${window.location.pathname}`;
  const bmDesc = createElement('div', 'pkc-shell-menu-bookmarklet-desc');
  bmDesc.textContent = isFileOrigin
    ? `ドラッグしてブックマークバーへ。任意 Web ページで click → 選択テキスト + URL が PKC2 に新規 entry として送られます。\n⚠ 現在 file:// で開いているため、bookmarklet 送信先は public stable URL(${PKC2_PUBLIC_STABLE_URL})に fallback します。自前 host の PKC2 を使う場合は下のコードをコピーして URL 部分を編集してください。`
    : `ドラッグしてブックマークバーへ。任意 Web ページで click → 選択テキスト + URL が PKC2 に新規 entry として送られます。送信先は今 click 時の PKC2 instance(${bookmarkletTargetUrl})。`;
  bmSection.appendChild(bmDesc);
  // PR-S (2026-05-06):**PKC-Message v1 spec §4.1 envelope + §7.2
  // record:offer に完全準拠** な bookmarklet。User 指摘「PKC-Message の
  // 規約読んだ?」を受けて全面書換え。flow:
  //   1. bookmarklet が PKC2 を `?pkc-bookmarklet=ready` で開く
  //   2. PKC2 boot 時、URL flag 検知して one-shot listener install +
  //      opener に `{type:'pkc-bookmarklet-ready'}` 送信
  //   3. bookmarklet が ready を受けて **正式 envelope の record:offer**
  //      を target に postMessage
  //   4. PKC2 が envelope validate → recordOfferHandler 経由で
  //      PendingOffer 化 → user accept で初めて entry mint
  //
  // user-consent gate(spec §6.2)が温存されるので、bookmarklet が
  // 自動的に entry を注入することは **無い**(必ず PendingOffer banner
  // で user が "保存" を click する)。
  // PR-V (2026-05-06):page-open UX(選択不要)+ 5 公式 site scraper
  //(YouTube / Niconico / Narou / カクヨム / Amazon)+ generic OG meta
  // fallback。v1.1 capture profile additive(kind / thumbnail_url /
  // provider)を envelope に乗せて送信。host が body 先頭に YAML
  // frontmatter を生成 → folder の中身が 7 割同 kind なら filer Auto
  // で book-base / video-base / novel-base 等に Bases 化。
  //
  // 期待挙動:
  //   - YouTube ページで click → kind:'video' / provider:'YouTube' /
  //     thumbnail = i.ytimg.com/vi/<id>/maxresdefault.jpg
  //   - カクヨム ページで click → kind:'novel' / provider:'カクヨム' /
  //     thumbnail = og:image
  //   - Amazon 商品ページ → kind:'book' / provider:'Amazon' /
  //     thumbnail = og:image
  //   - その他のページ → og:type / og:image fallback、不明なら kind 付与なし
  const bmJs = (
    '(function(){'
    + 'var u=location.href,host=location.host,'
    + 'q=function(s){var e=document.querySelector(s);return e?(e.getAttribute("content")||e.getAttribute("href")||""):""},'
    + 'ogTitle=q("meta[property=\\"og:title\\"]"),'
    + 'ogImg=q("meta[property=\\"og:image\\"]"),'
    + 'ogDesc=q("meta[property=\\"og:description\\"]"),'
    + 'ogType=q("meta[property=\\"og:type\\"]"),'
    + 'ogSite=q("meta[property=\\"og:site_name\\"]"),'
    + 't=ogTitle||document.title||"Snapshot",'
    + 'sel=getSelection().toString().trim(),'
    + 'firstP=document.querySelector("article p,main p"),'
    + 'excerpt=sel||ogDesc||(firstP?firstP.textContent.slice(0,500):""),'
    + 'now=new Date().toISOString(),'
    + 'kind=null,provider=null,thumb=ogImg||null,'
    // PR-JJ:author / brand は Amazon scraper で詰めるための holder。
    // 他 site scraper も将来同じ holder を使える(syosetu / kakuyomu の
    // author 抽出が PR-JJ scope 外でも、holder だけ既存)。
    + 'pkAuthor=null,pkBrand=null;'
    // 5 公式 site detection(URL host pattern → kind/provider)
    + 'if(/youtube\\.com|youtu\\.be/.test(host)){kind="video";provider="YouTube";'
    + 'var m=u.match(/(?:v=|youtu\\.be\\/)([\\w-]{11})/);if(m)thumb="https://i.ytimg.com/vi/"+m[1]+"/maxresdefault.jpg";'
    // PR-EEE (2026-05-06、user 修正指示5):YouTube DOM scraper 拡張。
    // og:title が空の watch ページが多いため、複数候補から動画タイ
    // トル / 投稿者 / 説明文を拾う。失敗しても既存 og 値 fallback で
    // null にはならない安全網。
    // タイトル候補:#title h1 yt-formatted-string / h1.title など。
    + 'var ytT=document.querySelector("#title h1 yt-formatted-string,#title h1,h1.ytd-watch-metadata,h1.title yt-formatted-string");'
    + 'if(ytT&&ytT.textContent){var ytTtxt=ytT.textContent.trim();if(ytTtxt)t=ytTtxt;}'
    // 投稿者候補(channel name):#owner-name / ytd-channel-name a / itemprop=author。
    + 'var ytC=document.querySelector("ytd-channel-name #text-container a,ytd-channel-name a,#owner #channel-name a,#upload-info #text a,[itemprop=\\"author\\"] [itemprop=\\"name\\"]");'
    + 'var ytCtxt=ytC?ytC.textContent.trim():(ytC?ytC.getAttribute("content"):"");'
    + 'if(ytCtxt)pkAuthor=ytCtxt;'
    // 説明欄候補:#description-inline-expander / #description / meta[name=description]。
    + 'var ytD=document.querySelector("#description-inline-expander,ytd-text-inline-expander,#description ytd-text-inline-expander,#description #text"),ytDtxt="";'
    + 'if(ytD)ytDtxt=ytD.innerText||ytD.textContent||"";'
    + 'if(!ytDtxt){var ytMd=document.querySelector("meta[name=description]");if(ytMd)ytDtxt=ytMd.getAttribute("content")||"";}'
    + 'if(ytDtxt){ytDtxt=ytDtxt.replace(/\\s+/g," ").trim();if(ytDtxt)excerpt=ytDtxt.slice(0,800);}'
    + '}'
    + 'else if(/nicovideo\\.jp/.test(host)){kind="video";provider="niconico";}'
    + 'else if(/(ncode\\.|novel18\\.|mypage\\.)?syosetu\\.com/.test(host)){kind="novel";provider="小説家になろう";}'
    + 'else if(/kakuyomu\\.jp/.test(host)){kind="novel";provider="カクヨム";}'
    + 'else if(/amazon\\.(co\\.jp|com|de|co\\.uk|fr|es|it)/.test(host)){'
    // PR-JJ Amazon scraper(2026-05-06):#productTitle で clean な
    // 商品名、#bylineInfo の <a> から author / brand を拾う。
    // book / kindle 系は書名 + 著者、その他は商品名 + ブランド。
    + 'kind="book";provider="Amazon";'
    + 'var pTitle=document.getElementById("productTitle"),pTitleTxt=pTitle?pTitle.textContent.trim():"";'
    + 'if(pTitleTxt)t=pTitleTxt;'
    + 'var byline=document.getElementById("bylineInfo"),bylineLink=byline?byline.querySelector("a"):null,'
    + 'bylineTxt=bylineLink?bylineLink.textContent.trim():(byline?byline.textContent.replace(/\\s+/g," ").trim():"");'
    // book detection — URL に dp/ASIN(B〜10桁 の Kindle/書籍指標)があるか、
    // bylineInfo に「(著)」「(Author)」が含まれるかで判定。
    + 'var isBook=/\\/(dp|gp\\/product)\\/(B0|4|0|1|9)/.test(u)||/(著)|(Author)/i.test(byline?byline.textContent:"");'
    + 'if(isBook){var amAuth=bylineTxt.replace(/\\(.+?\\)/g,"").replace(/\\s+/g," ").trim();if(amAuth)pkAuthor=amAuth;}'
    + 'else{kind=null;var amBrand=bylineTxt.replace(/^(Visit the |Brand: |ブランド: )/i,"").replace(/Store$/i,"").replace(/\\s+/g," ").trim();if(amBrand)pkBrand=amBrand;}'
    // PR-ZZ (2026-05-06):user 修正指示4「Amazon からサムネ取得され
    // ていない」への対応。og:image が無い / placeholder の Amazon
    // 商品ページが大半。複数の DOM 候補から先頭の有効 src を採用:
    //   #imgTagWrapperId img → 一般商品(`data-old-hires` で hi-res)
    //   #landingImage → 一部商品 / kindle
    //   #ebooksImgBlkFront img → ebook
    //   #main-image / #imgBlkFront → variants
    // どれも抽出できなければ既存 thumb(og:image)に fallback。
    + 'var amImg=null,amSel=["#imgTagWrapperId img","#landingImage","#ebooksImgBlkFront img","#main-image","#imgBlkFront","#booksImageBlock_feature_div img"];'
    + 'for(var ai=0;ai<amSel.length&&!amImg;ai++){'
    + 'var amEl=document.querySelector(amSel[ai]);'
    + 'if(amEl){amImg=amEl.getAttribute("data-old-hires")||amEl.getAttribute("data-a-dynamic-image")||amEl.src||null;'
    + 'if(amImg&&amImg.charAt(0)==="{"){'
    // data-a-dynamic-image: JSON object {url: [w,h]}. Pick first key.
    + 'try{var amObj=JSON.parse(amImg);var amKeys=Object.keys(amObj||{});amImg=amKeys.length?amKeys[0]:null;}catch(_amE){amImg=null;}'
    + '}}}'
    + 'if(amImg&&/^https?:/.test(amImg))thumb=amImg;'
    + '}'
    // generic fallback by og:type
    + 'else if(/^video\\./.test(ogType)){kind="video";if(ogSite)provider=ogSite;}'
    + 'else if(ogType==="book"){kind="book";if(ogSite)provider=ogSite;}'
    + 'else if(/^music\\./.test(ogType)){kind="audio";if(ogSite)provider=ogSite;}'
    + 'else if(ogType==="article"&&ogSite)provider=ogSite;'
    // payload 組立(plain markdown body、host が frontmatter を inject)
    + 'var body="# "+t+(excerpt?"\\n\\n"+excerpt:""),'
    + 'pl={title:t.slice(0,200),body:body,source_url:u,captured_at:now};'
    + 'if(kind)pl.kind=kind;if(thumb)pl.thumbnail_url=thumb;if(provider)pl.provider=provider;'
    // PR-JJ additive
    + 'if(pkAuthor)pl.author=pkAuthor;if(pkBrand)pl.brand=pkBrand;'
    + 'var env={protocol:"pkc-message",version:1,type:"record:offer",'
    + 'source_id:"extension:pkc2-bookmarklet@1.1",target_id:null,payload:pl,timestamp:now},'
    // PR-WW (2026-05-06):user 修正指示4「ブックマークレットで取り込
    // むたびに新しいタブで PKC が開く。UX 低下・許容不可」への対応。
    // `'_blank'` から **named target** `'pkc2-bookmarklet'` に変更。
    // 既に同名 window/tab があれば browser はそれを focus + reuse、
    // 無ければ新規 tab を 1 度だけ開く。2 回目以降の click で post-
    // Message が同じ PKC2 instance に届くので「新タブが量産される」
    // 問題が解消する。
    + `w=open(${JSON.stringify(bookmarkletTargetUrl + '?pkc-bookmarklet=ready')},'pkc2-bookmarklet');`
    + 'if(!w){alert("PKC2: popup blocked");return;}'
    // PR-WW: 既存 named tab を reuse した場合、focus を明示的に呼ばないと
    // bookmarklet 元 tab に視線が留まり「何も起きていない」と見える。
    + 'try{w.focus();}catch(_){}'
    // PR-Z fix:旧 `function h(e){...}` は `var h=location.host` と衝突して
    // string で上書きされ addEventListener が TypeError を投げていた。
    // handler は `onPkc2Ready` に rename。
    + 'function onPkc2Ready(e){if(e.source!==w)return;'
    + 'if(e.data&&e.data.type==="pkc-bookmarklet-ready"){'
    + 'w.postMessage(env,"*");removeEventListener("message",onPkc2Ready);}}'
    + 'addEventListener("message",onPkc2Ready);'
    + '})();'
  );
  const bmLink = document.createElement('a');
  bmLink.className = 'pkc-shell-menu-bookmarklet-link';
  bmLink.href = `javascript:${bmJs}`;
  bmLink.textContent = '📌 Send to PKC2';
  bmLink.title = 'ドラッグしてブックマークバーに追加';
  bmLink.draggable = true;

  // PR-QQ (2026-05-06):「ローカル PKC 用 file DL モード」 bookmarklet。
  // file:// で開いている PKC2 は browser の cross-origin policy で
  // postMessage handshake が成立しない(file:// → file:// は禁止、
  // file:// ⇄ http(s):// も window.opener が null)。代わりにこの
  // bookmarklet は同じ envelope を `.pkc-capture.json` ファイルとして
  // download する。ユーザーは PKC2 の Import ボタンから picker で
  // 拾うか、shell に drop することで取り込める(後続 PR で完成)。
  // PKC 哲学:ローカル動作を許容する経路を 1 本確保する。
  const bmDlJs = (
    '(function(){'
    + 'var u=location.href,host=location.host,'
    + 'q=function(s){var e=document.querySelector(s);return e?(e.getAttribute("content")||e.getAttribute("href")||""):""},'
    + 'ogTitle=q("meta[property=\\"og:title\\"]"),'
    + 'ogImg=q("meta[property=\\"og:image\\"]"),'
    + 'ogDesc=q("meta[property=\\"og:description\\"]"),'
    + 'ogType=q("meta[property=\\"og:type\\"]"),'
    + 'ogSite=q("meta[property=\\"og:site_name\\"]"),'
    + 't=ogTitle||document.title||"Snapshot",'
    + 'sel=getSelection().toString().trim(),'
    + 'firstP=document.querySelector("article p,main p"),'
    + 'excerpt=sel||ogDesc||(firstP?firstP.textContent.slice(0,500):""),'
    + 'now=new Date().toISOString(),'
    + 'kind=null,provider=null,thumb=ogImg||null,'
    + 'pkAuthor=null,pkBrand=null;'
    // PR-FFF (2026-05-06):primary bookmarklet と同じ scraper logic
    // を DL モードにも適用。PR-V の 5 site detection、PR-JJ の Amazon
    // author/brand + thumb fallback chain、PR-EEE の YouTube DOM
    // scraper(タイトル/投稿者/説明)を全部 inline。
    + 'if(/youtube\\.com|youtu\\.be/.test(host)){kind="video";provider="YouTube";'
    + 'var m=u.match(/(?:v=|youtu\\.be\\/)([\\w-]{11})/);if(m)thumb="https://i.ytimg.com/vi/"+m[1]+"/maxresdefault.jpg";'
    + 'var ytT=document.querySelector("#title h1 yt-formatted-string,#title h1,h1.ytd-watch-metadata,h1.title yt-formatted-string");'
    + 'if(ytT&&ytT.textContent){var ytTtxt=ytT.textContent.trim();if(ytTtxt)t=ytTtxt;}'
    + 'var ytC=document.querySelector("ytd-channel-name #text-container a,ytd-channel-name a,#owner #channel-name a,#upload-info #text a,[itemprop=\\"author\\"] [itemprop=\\"name\\"]");'
    + 'var ytCtxt=ytC?ytC.textContent.trim():(ytC?ytC.getAttribute("content"):"");'
    + 'if(ytCtxt)pkAuthor=ytCtxt;'
    + 'var ytD=document.querySelector("#description-inline-expander,ytd-text-inline-expander,#description ytd-text-inline-expander,#description #text"),ytDtxt="";'
    + 'if(ytD)ytDtxt=ytD.innerText||ytD.textContent||"";'
    + 'if(!ytDtxt){var ytMd=document.querySelector("meta[name=description]");if(ytMd)ytDtxt=ytMd.getAttribute("content")||"";}'
    + 'if(ytDtxt){ytDtxt=ytDtxt.replace(/\\s+/g," ").trim();if(ytDtxt)excerpt=ytDtxt.slice(0,800);}'
    + '}'
    + 'else if(/nicovideo\\.jp/.test(host)){kind="video";provider="niconico";}'
    + 'else if(/(ncode\\.|novel18\\.|mypage\\.)?syosetu\\.com/.test(host)){kind="novel";provider="小説家になろう";}'
    + 'else if(/kakuyomu\\.jp/.test(host)){kind="novel";provider="カクヨム";}'
    + 'else if(/amazon\\.(co\\.jp|com|de|co\\.uk|fr|es|it)/.test(host)){'
    + 'kind="book";provider="Amazon";'
    + 'var pTitle=document.getElementById("productTitle"),pTitleTxt=pTitle?pTitle.textContent.trim():"";'
    + 'if(pTitleTxt)t=pTitleTxt;'
    + 'var byline=document.getElementById("bylineInfo"),bylineLink=byline?byline.querySelector("a"):null,'
    + 'bylineTxt=bylineLink?bylineLink.textContent.trim():(byline?byline.textContent.replace(/\\s+/g," ").trim():"");'
    + 'var isBook=/\\/(dp|gp\\/product)\\/(B0|4|0|1|9)/.test(u)||/(著)|(Author)/i.test(byline?byline.textContent:"");'
    + 'if(isBook){var amAuth=bylineTxt.replace(/\\(.+?\\)/g,"").replace(/\\s+/g," ").trim();if(amAuth)pkAuthor=amAuth;}'
    + 'else{kind=null;var amBrand=bylineTxt.replace(/^(Visit the |Brand: |ブランド: )/i,"").replace(/Store$/i,"").replace(/\\s+/g," ").trim();if(amBrand)pkBrand=amBrand;}'
    // Amazon thumbnail DOM fallback chain(PR-ZZ from primary、ここで初導入)。
    + 'var amImg=null,amSel=["#imgTagWrapperId img","#landingImage","#ebooksImgBlkFront img","#main-image","#imgBlkFront","#booksImageBlock_feature_div img"];'
    + 'for(var ai=0;ai<amSel.length&&!amImg;ai++){'
    + 'var amEl=document.querySelector(amSel[ai]);'
    + 'if(amEl){amImg=amEl.getAttribute("data-old-hires")||amEl.getAttribute("data-a-dynamic-image")||amEl.src||null;'
    + 'if(amImg&&amImg.charAt(0)==="{"){'
    + 'try{var amObj=JSON.parse(amImg);var amKeys=Object.keys(amObj||{});amImg=amKeys.length?amKeys[0]:null;}catch(_amE){amImg=null;}'
    + '}}}'
    + 'if(amImg&&/^https?:/.test(amImg))thumb=amImg;'
    + '}'
    + 'else if(/^video\\./.test(ogType)){kind="video";if(ogSite)provider=ogSite;}'
    + 'else if(ogType==="book"){kind="book";if(ogSite)provider=ogSite;}'
    + 'else if(/^music\\./.test(ogType)){kind="audio";if(ogSite)provider=ogSite;}'
    + 'else if(ogType==="article"&&ogSite)provider=ogSite;'
    + 'var body="# "+t+(excerpt?"\\n\\n"+excerpt:""),'
    + 'pl={title:t.slice(0,200),body:body,source_url:u,captured_at:now};'
    + 'if(kind)pl.kind=kind;if(thumb)pl.thumbnail_url=thumb;if(provider)pl.provider=provider;'
    + 'if(pkAuthor)pl.author=pkAuthor;if(pkBrand)pl.brand=pkBrand;'
    + 'var env={protocol:"pkc-message",version:1,type:"record:offer",'
    + 'source_id:"extension:pkc2-bookmarklet@1.1-dl",target_id:null,payload:pl,timestamp:now};'
    // 違いはここから:postMessage せず Blob を作って download trigger。
    + 'var json=JSON.stringify(env,null,2),'
    + 'blob=new Blob([json],{type:"application/json"}),'
    + 'url=URL.createObjectURL(blob),'
    + 'fname="pkc2-capture-"+now.replace(/[:.]/g,"-").slice(0,19)+".pkc-capture.json",'
    + 'a=document.createElement("a");'
    + 'a.href=url;a.download=fname;document.body.appendChild(a);a.click();'
    + 'setTimeout(function(){document.body.removeChild(a);URL.revokeObjectURL(url);},0);'
    + '})();'
  );
  const bmDlLink = document.createElement('a');
  bmDlLink.className = 'pkc-shell-menu-bookmarklet-link pkc-shell-menu-bookmarklet-link-dl';
  bmDlLink.href = `javascript:${bmDlJs}`;
  bmDlLink.textContent = '📥 Save .pkc-capture.json';
  bmDlLink.title = 'ローカル PKC 用:現ページのキャプチャを JSON ファイルでダウンロード(後で PKC2 にドロップ可)';
  bmDlLink.draggable = true;
  bmSection.appendChild(bmLink);
  bmSection.appendChild(bmDlLink);

  // PR-W (2026-05-06):custom scraper を user が追加するための template
  // editor。<details> で展開、bookmarklet JS を <textarea> に表示して
  // user が copy / 編集できる。User direction:
  // > それ以外はユーザーが自分でスクレイピングを用意できるようにしましょう
  //
  // 編集経路:
  //   1. user が下の textarea から JS をコピー
  //   2. 自分のお気に入りブックマークの URL に `javascript:` prefix を
  //      付けて貼り付け
  //   3. host pattern 部(`if(/youtube\.com|...)`...)に独自 site を追加
  //   4. 名前を変えて保存(複数 site 用 bookmarklet を user が育てる)
  //
  // PKC2 内に scraper 設定を保存する代わりに、bookmarklet 自体を user
  // が育てる UX。PKC2 哲学(local-first / single-source)に沿う。
  const bmCustom = document.createElement('details');
  bmCustom.className = 'pkc-shell-menu-bookmarklet-custom';
  const bmCustomSummary = document.createElement('summary');
  bmCustomSummary.className = 'pkc-shell-menu-bookmarklet-custom-summary';
  bmCustomSummary.textContent = '▼ カスタム作成 / コードを表示';
  bmCustom.appendChild(bmCustomSummary);
  const bmCustomDesc = createElement('div', 'pkc-shell-menu-bookmarklet-custom-desc');
  bmCustomDesc.textContent = '5 公式 site 以外(個人 blog / 別 SNS / 自社 wiki 等)も対応したい場合、下の JS をコピーして自分でブックマークを作成し、host pattern 部分に独自 site を追加してください。';
  bmCustom.appendChild(bmCustomDesc);
  const bmCode = document.createElement('textarea');
  bmCode.className = 'pkc-shell-menu-bookmarklet-code';
  bmCode.setAttribute('readonly', 'true');
  bmCode.setAttribute('spellcheck', 'false');
  bmCode.setAttribute('rows', '6');
  bmCode.value = `javascript:${bmJs}`;
  bmCode.title = 'クリックで全選択 → Ctrl/Cmd+C でコピー';
  bmCode.addEventListener('focus', () => bmCode.select());
  bmCustom.appendChild(bmCode);
  const bmCopyBtn = createElement('button', 'pkc-btn-small pkc-shell-menu-bookmarklet-copy');
  bmCopyBtn.setAttribute('data-pkc-action', 'copy-bookmarklet-code');
  bmCopyBtn.textContent = '📋 クリップボードにコピー';
  bmCopyBtn.title = 'bookmarklet JS をクリップボードへ';
  bmCustom.appendChild(bmCopyBtn);
  bmSection.appendChild(bmCustom);

  card.appendChild(bmSection);

  // PR-M (2026-05-06):shell menu に GitHub Pages の公開 URL を 3 件
  // 出して、初見 user がマニュアル / 安定版 / 開発版に到達できるよう
  // にする。user 指示:
  // > シェルメニューに公開URLを以下の追加して、これがあれば一般ユー
  // > ザーもマニュアル見れるでしょ
  const urlSection = createElement('div', 'pkc-shell-menu-section pkc-shell-menu-public-urls');
  const urlLabel = createElement('span', 'pkc-shell-menu-label');
  urlLabel.textContent = 'Public URLs';
  urlSection.appendChild(urlLabel);
  const urlList = createElement('div', 'pkc-shell-menu-public-urls-list');
  const publicUrls: { label: string; url: string; tip: string }[] = [
    {
      label: '📦 安定版',
      url: 'https://sm06224.github.io/PKC-Public/PKC2/',
      tip: '安定版 PKC2(GitHub Pages 公開、最新リリース)',
    },
    {
      label: '🧪 開発版',
      url: 'https://sm06224.github.io/PKC-Public/PKC2-DEV/',
      tip: '開発版 PKC2(最新 main、未リリース機能を含む)',
    },
    {
      label: '📖 Manual',
      url: 'https://sm06224.github.io/PKC-Public/PKC2-MANUAL/',
      tip: 'PKC2 マニュアル(安定版ベース、入門〜上級)',
    },
  ];
  for (const { label, url, tip } of publicUrls) {
    const a = document.createElement('a');
    a.className = 'pkc-shell-menu-public-url';
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.title = tip;
    a.textContent = label;
    urlList.appendChild(a);
  }
  urlSection.appendChild(urlList);
  card.appendChild(urlSection);

  // Version (clickable → About)
  const versionSection = createElement('button', 'pkc-shell-menu-section pkc-shell-menu-version');
  versionSection.setAttribute('data-pkc-action', 'select-about');
  versionSection.setAttribute('title', 'Open About');
  versionSection.textContent = `PKC2 v${VERSION}`;
  card.appendChild(versionSection);

  // Close button
  const closeBtn = createElement('button', 'pkc-btn-small pkc-shell-menu-close');
  closeBtn.setAttribute('data-pkc-action', 'close-shell-menu');
  closeBtn.textContent = 'Close (Esc)';
  card.appendChild(closeBtn);

  overlay.appendChild(card);
  return overlay;
}

/**
 * Shell menu Data Maintenance section — manual orphan asset cleanup.
 *
 * Rendered inside the shell menu card when the container is editable
 * (non-readonly) and present. Purely a DOM projection of the current
 * container's asset-scan result; it performs no mutations and holds
 * no runtime state. The state comes from `collectOrphanAssetKeys`,
 * which is a pure read-only scan.
 *
 * Contract:
 *   - Always shows the total asset count and the orphan count, so
 *     users can verify "nothing to clean" without guessing.
 *   - When `orphanCount === 0`, the cleanup button is rendered but
 *     disabled (`data-pkc-disabled="true"`). ActionBinder skips
 *     disabled buttons, so accidental clicks are no-ops.
 *   - When `orphanCount > 0`, a preview of up to 3 representative
 *     orphan keys is shown below the count, mirroring the
 *     "observe-before-delete" principle in the Issue spec.
 *   - The button text explicitly states the irreversibility
 *     ("cannot be undone"); we do not hook undo/redo into this path.
 *
 * Rendering is O(entries + assets) — no caching, no memoisation.
 * The whole shell menu is re-rendered on every state change anyway,
 * and the orphan scan is cheap enough that this is not worth
 * optimising today.
 */
function renderShellMenuMaintenance(container: Container): HTMLElement {
  const section = createElement('div', 'pkc-shell-menu-section');
  section.setAttribute('data-pkc-region', 'shell-menu-maintenance');

  const label = createElement('span', 'pkc-shell-menu-label');
  label.textContent = 'Data Maintenance';
  section.appendChild(label);

  // 段階4 (#868): count orphans / total across the FULL store via the
  // resident asset-meta index, not just the resident working-set.
  const metaIndex = getResidentAssetMeta(container.meta.container_id);
  const allAssetKeys = metaIndex ? Object.keys(metaIndex) : undefined;
  const orphanKeys = collectOrphanAssetKeys(container, allAssetKeys);
  const orphanCount = orphanKeys.size;
  const totalCount = allAssetKeys ? allAssetKeys.length : Object.keys(container.assets).length;

  const summary = createElement('div', 'pkc-shell-menu-maintenance-summary');
  summary.setAttribute('data-pkc-region', 'orphan-asset-summary');
  summary.setAttribute('data-pkc-orphan-count', String(orphanCount));
  summary.setAttribute('data-pkc-asset-total', String(totalCount));
  if (orphanCount === 0) {
    summary.textContent = `Orphan assets: 0 / ${totalCount}`;
  } else {
    summary.textContent = `Orphan assets: ${orphanCount} / ${totalCount}`;
  }
  section.appendChild(summary);

  // Representative orphan keys — show up to 3 so the user can see
  // WHAT will be removed before committing. Beyond 3 we collapse the
  // remainder into a "+N more" hint to keep the card compact.
  if (orphanCount > 0) {
    const preview = createElement('ul', 'pkc-shell-menu-maintenance-list');
    preview.setAttribute('data-pkc-region', 'orphan-asset-preview');
    const keys = Array.from(orphanKeys);
    const shown = keys.slice(0, 3);
    for (const key of shown) {
      const li = createElement('li', 'pkc-shell-menu-maintenance-item');
      li.textContent = key;
      preview.appendChild(li);
    }
    if (keys.length > shown.length) {
      const more = createElement('li', 'pkc-shell-menu-maintenance-more');
      more.textContent = `+${keys.length - shown.length} more`;
      preview.appendChild(more);
    }
    section.appendChild(preview);
  }

  const actionRow = createElement('div', 'pkc-shell-menu-maintenance-actions');
  const cleanupBtn = createElement('button', 'pkc-btn-small pkc-shell-menu-maintenance-btn');
  cleanupBtn.setAttribute('data-pkc-action', 'purge-orphan-assets');
  if (orphanCount === 0) {
    cleanupBtn.setAttribute('data-pkc-disabled', 'true');
    cleanupBtn.setAttribute('disabled', 'true');
    cleanupBtn.textContent = '🧹 No orphans to clean';
  } else {
    cleanupBtn.textContent = `🧹 Clean ${orphanCount} orphan asset${orphanCount === 1 ? '' : 's'}`;
  }
  actionRow.appendChild(cleanupBtn);
  section.appendChild(actionRow);

  const note = createElement('div', 'pkc-shell-menu-maintenance-note');
  note.textContent = 'Removes assets not referenced by any entry. Cannot be undone.';
  section.appendChild(note);

  // Storage Profile — read-only diagnostic dialog. Opens a surface
  // showing which entries / folder subtrees weigh most in
  // `container.assets`. Helps decide what to export / delete when
  // capacity warnings appear. Non-destructive; added here so the
  // whole capacity toolbox sits in one place.
  //
  // Workspace Reset — destructive action moved here from the header
  // export/import panel. Mounted in the same row as the profile
  // button (compact layout + `pkc-btn-danger` still visually
  // distinguishes it).
  const resetRow = createElement('div', 'pkc-shell-menu-maintenance-actions');
  const profileBtn = createElement('button', 'pkc-btn-small pkc-shell-menu-maintenance-btn');
  profileBtn.setAttribute('data-pkc-action', 'show-storage-profile');
  profileBtn.textContent = '📊 Storage Profile';
  resetRow.appendChild(profileBtn);
  const resetBtn = createElement('button', 'pkc-btn-small pkc-btn-danger');
  resetBtn.setAttribute('data-pkc-action', 'clear-local-data');
  resetBtn.setAttribute('title', 'ローカル保存データ (IndexedDB) を全て削除します。元に戻せません。');
  resetBtn.textContent = '⚠ Reset Workspace';
  resetRow.appendChild(resetBtn);
  section.appendChild(resetRow);

  return section;
}

function renderShortcutHelp(): HTMLElement {
  const overlay = createElement('div', 'pkc-shortcut-overlay');
  overlay.setAttribute('data-pkc-region', 'shortcut-help');

  const card = createElement('div', 'pkc-shortcut-card');

  const heading = createElement('h2', 'pkc-shortcut-heading');
  heading.textContent = 'Keyboard Shortcuts';
  card.appendChild(heading);

  // PR-MM (2026-05-06): registry を action-binder と shortcut-help が
  // 共有するための shared SOT は Flags 集中管理 wave で導入予定。
  // 本 PR は help 文言を action-binder の actual key handling に合わせ
  // て audit-update する scope。
  const shortcuts: { key: string; desc: string; group?: string }[] = [
    { key: 'Ctrl+N / ⌘+N', desc: 'New text entry' },
    { key: 'Ctrl+S / ⌘+S', desc: 'Save (in edit mode)' },
    { key: 'Ctrl+E / ⌘+E', desc: 'Edit selected entry' },
    { key: 'Escape', desc: 'Cancel edit / Deselect / Close menus / overlay' },
    { key: 'Ctrl+? / ⌘+?', desc: 'Toggle this help' },
    { key: 'Ctrl+Click / ⌘+Click', desc: 'Toggle multi-select (sidebar)' },
    { key: 'Shift+Click', desc: 'Range select (sidebar)' },
    // #938 R10: keymap registry(既定 ON)の view / tab / history chord を
    // help に掲載(refinement-research §5「発見可能性」)。
    { key: '', desc: '', group: 'Views & Tabs' },
    // `Alt+5` は欠番 ── graph view 廃止に伴い削除(視覚監査 2026-07-25)。
    // Alt+6 は繰り上げない(既に動いていたキーを変えない)。
    { key: 'Alt+1 〜 Alt+4 / Alt+6', desc: 'Switch view (Detail / Calendar / Kanban / Filer / Launcher)' },
    { key: 'Alt+← / Alt+→', desc: 'History back / forward' },
    { key: 'Ctrl+PageDown / PageUp', desc: 'Next / previous tab (Tabs ON 時)' },
    { key: 'Alt+W', desc: 'Close active tab (Tabs ON 時)' },
    { key: 'Ctrl+Shift+T', desc: 'Reopen last closed tab (Tabs ON 時)' },
    { key: '', desc: '', group: 'Navigation (sidebar / list)' },
    { key: 'Arrow Up / Down', desc: 'Move selection in sidebar tree' },
    { key: 'Arrow Left / Right', desc: 'Collapse / expand folder; jump to parent / first child' },
    { key: 'Enter', desc: 'Open selected entry (in non-editing mode)' },
    { key: '', desc: '', group: 'Calendar view' },
    { key: 'Arrow Left / Right', desc: 'Step day' },
    { key: 'Ctrl+Shift+Arrow Up / Down', desc: 'Step week (±7 days)' },
    { key: '', desc: '', group: 'Kanban view' },
    { key: 'Ctrl+Arrow Left / Right', desc: 'Move selected todo across columns' },
    { key: 'Arrow Left / Right', desc: 'Cross-column step (pick first card in target column)' },
    { key: '', desc: '', group: 'Panes' },
    { key: 'Ctrl+\\ / ⌘+\\', desc: 'Toggle sidebar (left pane)' },
    { key: 'Ctrl+Shift+\\', desc: 'Toggle meta pane (right pane)' },
    { key: 'Ctrl+Alt+\\', desc: 'Focus mode — hide both panes (Windows / cross-platform)' },
    { key: 'Alt+Space', desc: 'Focus mode — hide both panes (Mac / Linux only; blocked by Windows OS menu)' },
    { key: '', desc: '', group: 'Editing (textarea)' },
    { key: 'Tab', desc: 'Insert tab character (= 4 spaces, via tab-size:4)' },
    { key: 'Ctrl+Enter / ⌘+Enter', desc: 'Append entry (TEXTLOG append textarea)' },
    { key: 'Space', desc: 'Toggle checkbox under caret (markdown task list)' },
    { key: '', desc: '', group: 'Date/Time (edit mode)' },
    { key: 'Ctrl+;', desc: 'Insert date (yyyy/MM/dd)' },
    { key: 'Ctrl+:', desc: 'Insert time (HH:mm:ss)' },
    { key: 'Ctrl+Shift+;', desc: 'Insert date+time' },
    { key: 'Ctrl+D', desc: 'Insert short date + day of week' },
    { key: 'Ctrl+Shift+D', desc: 'Insert short date+time' },
    { key: 'Ctrl+Shift+Alt+D', desc: 'Insert ISO 8601' },
    { key: '', desc: '', group: 'Slash Commands (edit mode)' },
    { key: '/', desc: 'Open input assist menu (line start)' },
    { key: '', desc: '', group: 'Note' },
    { key: '', desc:
      'Future: a flags-controlled shortcut registry (`shortcuts.*` flag namespace) will let users rebind these keys without rebuild.' },
  ];

  const table = createElement('div', 'pkc-shortcut-table');
  for (const { key, desc, group } of shortcuts) {
    if (group) {
      const groupRow = createElement('div', 'pkc-shortcut-group');
      groupRow.textContent = group;
      table.appendChild(groupRow);
      continue;
    }
    const row = createElement('div', 'pkc-shortcut-row');
    const keyEl = createElement('kbd', 'pkc-shortcut-key');
    keyEl.textContent = key;
    row.appendChild(keyEl);
    const descEl = createElement('span', 'pkc-shortcut-desc');
    descEl.textContent = desc;
    row.appendChild(descEl);
    table.appendChild(row);
  }
  card.appendChild(table);

  const closeBtn = createElement('button', 'pkc-btn-small');
  closeBtn.setAttribute('data-pkc-action', 'close-shortcut-help');
  closeBtn.textContent = 'Close (Esc / Ctrl+?)';
  card.appendChild(closeBtn);

  overlay.appendChild(card);
  return overlay;
}

/**
 * Storage Profile overlay — read-only dialog surfacing which entries
 * and folder subtrees weigh most in `container.assets`. Opened via
 * the shell-menu Data Maintenance section; closed via its own close
 * button or Escape (handled by the shell-menu Esc handler).
 *
 * This dialog holds no state of its own — every open recomputes the
 * profile from the live container, mirroring how the orphan count
 * is read on each shell-menu render. The computation is pure (see
 * `buildStorageProfile`) and cheap enough that no memoisation is
 * warranted.
 *
 * The wording is intentionally qualified ("estimate", "approximate")
 * because decoded-base64 bytes are not identical to the actual IDB
 * footprint — the JSON envelope still inflates the stored size — but
 * they are close enough for capacity triage.
 */
/**
 * Build the fully-populated Storage Profile overlay for mounting on
 * demand.  Exported so `action-binder` can create the dialog at
 * click time (and remove it on close) — mounting per render would
 * add several DOM nodes to every state update.
 *
 * `container === null` renders a neutral "no container" shell (the
 * launch button is already gated out in that case, but the dialog
 * stays robust for programmatic callers).
 */
/**
 * 保存先エンジンの表示行。**sqlite のライブラリ版まで出す**のが要点 ──
 * 「sqlite で動いている」と自称するだけなら簡単だが、実際に init が返した
 * version / VFS を見せれば、動いていない状態と区別が付く。
 */
function renderStorageEngineRow(): HTMLElement {
  const info = getStorageEngineInfo();
  const row = createElement('div', 'pkc-storage-engine-row');
  row.setAttribute('data-pkc-region', 'storage-engine');
  row.setAttribute('data-pkc-storage-engine', info.kind);

  const label = createElement('span', 'pkc-storage-engine-label');
  label.textContent = '保存先エンジン';
  row.appendChild(label);

  const value = createElement('span', 'pkc-storage-engine-value');
  value.textContent = describeStorageEngine(info);
  row.appendChild(value);

  // 永続化が成立していない = **データが残らない**。ここは目立たせる。
  if (info.kind !== 'idb' && info.persistent === false) {
    const warn = createElement('span', 'pkc-storage-engine-warn');
    warn.textContent = '⚠ 揮発 — 閉じると消えます';
    row.appendChild(warn);
  }
  if (info.detail) {
    const detail = createElement('span', 'pkc-storage-engine-detail');
    detail.textContent = info.detail;
    row.appendChild(detail);
  }
  // 要求したのに使えなかった場合は、**理由と対処**を出す。
  // 「効いていない」と「そもそも動かない」を user が区別できるように。
  if (info.requestedButUnavailable) {
    row.setAttribute('data-pkc-storage-fallback', 'true');
  }
  return row;
}

export function buildStorageProfileOverlay(
  container: Container | null,
  availableContainers: ReadonlyArray<{ id: string; title: string }> = [],
  workspaces: ReadonlyArray<{ id: string; name: string }> = [],
  activeWorkspaceId: string | null = null,
): HTMLElement {
  const overlay = createElement('div', 'pkc-storage-profile-overlay');
  overlay.setAttribute('data-pkc-region', 'storage-profile');

  const card = createElement('div', 'pkc-storage-profile-card');

  const heading = createElement('h2', 'pkc-storage-profile-heading');
  // Slice A (2026-04-22): explicit scope in the title so the dialog
  // cannot be mis-read as a container-wide footprint. See
  // docs/development/storage-profile-footprint-scope.md.
  heading.textContent = 'Storage Profile — Assets';
  card.appendChild(heading);

  // 🔴 「今どのエンジンで保存しているか」を最初に出す(user 指摘 2026-07-28
  //    「wasm-sqlite で稼働してるかどうかわからんのやが?」)。flag で切り替わる
  //    のに devtools を見ないと確認できない状態は、user から見れば
  //    「動いているかわからない」= 入っていないのと大差ない。
  //    事実は storage 層が確定したものを読むだけにする(UI 側で推測しない)。
  card.appendChild(renderStorageEngineRow());

  const note = createElement('div', 'pkc-storage-profile-note');
  // Slice A: call out the asset-only scope up front so operators do
  // not read "Total size" as the full container footprint. Full
  // container footprint (text bodies / relations / revisions) is
  // documented as future work in the footprint-scope doc.
  note.textContent =
    'Shows asset bytes only. Text bodies, relations, and revisions are NOT counted — '
    + 'full container footprint is not yet implemented. Numbers are estimates; '
    + 'actual browser storage usage may differ.';
  card.appendChild(note);

  // Compute profile once and reuse for summary + rows + Export CSV
  // button gating. `profile === null` corresponds to the no-container
  // shell below.
  const profile = container
    ? buildStorageProfile(container, getResidentAssetSizes(container.meta.container_id) ?? undefined)
    : null;
  if (!profile) {
    const empty = createElement('div', 'pkc-storage-profile-empty');
    empty.textContent = 'No container loaded.';
    card.appendChild(empty);
  } else {
    card.appendChild(renderStorageProfileSummary(profile));
    card.appendChild(renderStorageProfileRows(profile));
  }

  // #773: workspace switcher (above the container switcher, which is
  // scoped to the active workspace).
  card.appendChild(renderWorkspaceSwitcher(workspaces, activeWorkspaceId));

  // #771/#773 MVP: same-origin container switcher (active workspace).
  card.appendChild(renderContainerSwitcher(availableContainers, container?.meta.container_id ?? null));

  // #771: explicit storage-backend switcher (Browser/IDB ⇄ OPFS).
  card.appendChild(renderStorageBackendSelector());

  // Action row: Export CSV (read-only persist-out) + Close. The CSV
  // button is only mounted when the container has at least one
  // byte-contributing row — an empty profile has nothing to export,
  // and hiding the button keeps the dialog noise-free.
  const actionsRow = createElement('div', 'pkc-storage-profile-actions');
  if (profile && profile.rows.length > 0) {
    const exportBtn = createElement(
      'button',
      'pkc-btn-small pkc-storage-profile-export',
    );
    exportBtn.setAttribute('data-pkc-action', 'export-storage-profile-csv');
    exportBtn.textContent = '⬇ Export CSV';
    exportBtn.setAttribute(
      'title',
      'Download the current profile rows as CSV for external analysis. Read-only.',
    );
    actionsRow.appendChild(exportBtn);
  }
  const closeBtn = createElement('button', 'pkc-btn-small pkc-storage-profile-close');
  closeBtn.setAttribute('data-pkc-action', 'close-storage-profile');
  closeBtn.textContent = 'Close (Esc)';
  actionsRow.appendChild(closeBtn);
  card.appendChild(actionsRow);

  overlay.appendChild(card);
  return overlay;
}

/**
 * Workspace switcher (#773). Lists workspaces and lets the user switch,
 * create (with a fresh blank container), or rename. The container
 * switcher below is scoped to the active workspace.
 */
function renderWorkspaceSwitcher(
  workspaces: ReadonlyArray<{ id: string; name: string }>,
  activeWorkspaceId: string | null,
): HTMLElement {
  const section = createElement('div', 'pkc-storage-profile-section');
  section.setAttribute('data-pkc-region', 'workspace-switcher');
  if (activeWorkspaceId) section.setAttribute('data-pkc-active-workspace', activeWorkspaceId);

  const label = createElement('span', 'pkc-shell-menu-label');
  label.textContent = 'Workspaces';
  section.appendChild(label);

  const list = createElement('div', 'pkc-workspace-switcher-list');
  for (const w of workspaces) {
    const row = createElement('div', 'pkc-workspace-switcher-row');
    row.setAttribute('data-pkc-wid', w.id);
    const isActive = w.id === activeWorkspaceId;
    if (isActive) row.setAttribute('data-pkc-active', 'true');

    const name = createElement('span', 'pkc-workspace-switcher-name');
    name.textContent = (w.name && w.name.length > 0 ? w.name : '(unnamed)') + (isActive ? ' ●' : '');
    row.appendChild(name);

    if (!isActive) {
      const switchBtn = createElement('button', 'pkc-btn-small');
      switchBtn.setAttribute('data-pkc-action', 'switch-workspace');
      switchBtn.setAttribute('data-pkc-wid', w.id);
      switchBtn.textContent = 'Switch';
      row.appendChild(switchBtn);
    }
    const renameBtn = createElement('button', 'pkc-btn-small');
    renameBtn.setAttribute('data-pkc-action', 'rename-workspace');
    renameBtn.setAttribute('data-pkc-wid', w.id);
    renameBtn.setAttribute('data-pkc-wname', w.name);
    renameBtn.textContent = '名前を変更';
    row.appendChild(renameBtn);

    list.appendChild(row);
  }
  section.appendChild(list);

  const newBtn = createElement('button', 'pkc-btn-small pkc-workspace-switcher-new');
  newBtn.setAttribute('data-pkc-action', 'new-workspace');
  newBtn.textContent = '+ New workspace';
  section.appendChild(newBtn);

  const note = createElement('div', 'pkc-storage-profile-note');
  note.textContent = 'ワークスペースは複数のコンテナを束ねる作業空間です。下の Containers は選択中のワークスペースの内容です。';
  section.appendChild(note);
  return section;
}

/**
 * Same-origin container switcher (#771/#773 MVP). Lists the stored
 * containers and lets the user switch the active one, create a new
 * (blank) container, or delete a non-active one. Switching / creating
 * / deleting mutate the store and reload (boot loads the new active
 * container) — wired in `mountContainerSwitchHandler` (main.ts).
 */
function renderContainerSwitcher(
  containers: ReadonlyArray<{ id: string; title: string }>,
  activeCid: string | null,
): HTMLElement {
  const section = createElement('div', 'pkc-storage-profile-section');
  section.setAttribute('data-pkc-region', 'container-switcher');
  if (activeCid) section.setAttribute('data-pkc-active-container', activeCid);

  const label = createElement('span', 'pkc-shell-menu-label');
  label.textContent = 'Containers (this origin)';
  section.appendChild(label);

  const list = createElement('div', 'pkc-container-switcher-list');
  for (const c of containers) {
    const row = createElement('div', 'pkc-container-switcher-row');
    row.setAttribute('data-pkc-cid', c.id);
    const isActive = c.id === activeCid;
    if (isActive) row.setAttribute('data-pkc-active', 'true');

    const name = createElement('span', 'pkc-container-switcher-title');
    name.textContent = (c.title && c.title.length > 0 ? c.title : '(untitled)') + (isActive ? ' ●' : '');
    row.appendChild(name);

    if (!isActive) {
      const switchBtn = createElement('button', 'pkc-btn-small');
      switchBtn.setAttribute('data-pkc-action', 'switch-container');
      switchBtn.setAttribute('data-pkc-cid', c.id);
      switchBtn.textContent = 'Switch';
      row.appendChild(switchBtn);

      const delBtn = createElement('button', 'pkc-btn-small pkc-btn-danger');
      delBtn.setAttribute('data-pkc-action', 'delete-container');
      delBtn.setAttribute('data-pkc-cid', c.id);
      delBtn.setAttribute('title', 'Delete this container (irreversible)');
      delBtn.textContent = 'Delete';
      row.appendChild(delBtn);
    }
    list.appendChild(row);
  }
  section.appendChild(list);

  const newBtn = createElement('button', 'pkc-btn-small pkc-container-switcher-new');
  newBtn.setAttribute('data-pkc-action', 'new-container');
  newBtn.textContent = '+ New container';
  section.appendChild(newBtn);

  const note = createElement('div', 'pkc-storage-profile-note');
  note.textContent = 'Switching / creating / deleting reloads the app. Each container is an independent workspace on this origin.';
  section.appendChild(note);
  return section;
}

/**
 * Storage backend selector (#771). Lets the user explicitly choose
 * where the container persists: Browser (IndexedDB, default) or the
 * Private filesystem (OPFS). Switching sets the boot-time preference
 * and reloads (boot re-runs the chooser + non-destructive migration).
 * OPFS is offered only when the runtime supports it (secure context —
 * not file://).
 */
function renderStorageBackendSelector(): HTMLElement {
  const section = createElement('div', 'pkc-storage-profile-section');
  section.setAttribute('data-pkc-region', 'storage-backend-selector');

  const label = createElement('span', 'pkc-shell-menu-label');
  label.textContent = 'Storage backend';
  section.appendChild(label);

  const current = getStorageBackendPref();
  section.setAttribute('data-pkc-current-backend', current);
  const opfsOk = isOpfsSupported();
  const fsaOk = isFsaSupported();

  const secureHint = 'Requires a secure context (https / localhost) — not available from file://';
  const options: {
    backend: StorageBackend;
    text: string;
    enabled: boolean;
    /** `set-storage-backend` (pref+reload) or `pick-storage-folder` (picker gesture). */
    action: 'set-storage-backend' | 'pick-storage-folder';
    /** Allow clicking even when active (FSA re-pick to re-grant permission). */
    clickableWhenActive?: boolean;
    hint?: string;
  }[] = [
    { backend: 'idb', text: '🗄 Browser (IndexedDB)', enabled: true, action: 'set-storage-backend' },
    {
      backend: 'opfs',
      text: '📁 Private filesystem (OPFS)',
      enabled: opfsOk,
      action: 'set-storage-backend',
      hint: opfsOk ? undefined : secureHint,
    },
    {
      backend: 'fsa',
      text: current === 'fsa' ? '📂 Local folder (re-pick…)' : '📂 Local folder (choose…)',
      enabled: fsaOk,
      action: 'pick-storage-folder',
      clickableWhenActive: true, // re-pick to re-grant a lapsed permission
      hint: fsaOk ? 'Pick a real folder on disk (Chromium)' : secureHint,
    },
  ];

  const row = createElement('div', 'pkc-storage-backend-options');
  for (const o of options) {
    const btn = createElement('button', 'pkc-btn-small pkc-storage-backend-option');
    btn.setAttribute('data-pkc-action', o.action);
    btn.setAttribute('data-pkc-backend', o.backend);
    btn.textContent = o.text;
    const isActive = o.backend === current;
    if (isActive) btn.setAttribute('data-pkc-active', 'true');
    if (!o.enabled || (isActive && !o.clickableWhenActive)) {
      (btn as HTMLButtonElement).disabled = true;
    }
    if (o.hint) btn.setAttribute('title', o.hint);
    row.appendChild(btn);
  }
  section.appendChild(row);

  const note = createElement('div', 'pkc-storage-profile-note');
  note.textContent =
    'Switching reloads the app and migrates your data (non-destructive — the previous backend keeps a copy). '
    + 'Local folder needs re-granting access each session.';
  section.appendChild(note);
  return section;
}

/**
 * Summary block for the Storage Profile dialog — top-level
 * aggregates only (total assets, total bytes, largest asset,
 * largest subtree).
 */
function renderStorageProfileSummary(profile: StorageProfile): HTMLElement {
  const section = createElement('div', 'pkc-storage-profile-section');
  section.setAttribute('data-pkc-region', 'storage-profile-summary');
  section.setAttribute('data-pkc-asset-count', String(profile.summary.assetCount));
  section.setAttribute('data-pkc-total-bytes', String(profile.summary.totalBytes));
  // Slice B: body bytes is an independent axis. Expose via a separate
  // dataset attribute so tests / tooling can read it without
  // scraping the rendered label.
  section.setAttribute('data-pkc-total-body-bytes', String(profile.summary.totalBodyBytes));

  const label = createElement('span', 'pkc-shell-menu-label');
  label.textContent = 'Summary';
  section.appendChild(label);

  const { summary, orphanBytes, orphanCount } = profile;
  const lines: { label: string; value: string; raw?: number }[] = [
    { label: 'Total assets', value: String(summary.assetCount) },
    // Slice A: "Total size" was misread as a container-wide total.
    // Renamed so the scope is unambiguous. The underlying number
    // (`summary.totalBytes`) is unchanged.
    { label: 'Total asset bytes', value: formatBytes(summary.totalBytes), raw: summary.totalBytes },
    // Slice B: body bytes surfaced as a separate line. Never summed
    // with asset bytes; see docs/development/storage-profile-footprint-scope.md.
    { label: 'Total body bytes', value: formatBytes(summary.totalBodyBytes), raw: summary.totalBodyBytes },
  ];
  if (summary.largestAsset) {
    const ownerHint = summary.largestAssetOwnerTitle
      ? ` (${summary.largestAssetOwnerTitle})`
      : ' (unowned)';
    lines.push({
      label: 'Largest asset',
      value: `${formatBytes(summary.largestAsset.bytes)}${ownerHint}`,
      raw: summary.largestAsset.bytes,
    });
  }
  if (summary.largestEntry) {
    lines.push({
      label: 'Largest subtree',
      value: `${formatBytes(summary.largestEntry.subtreeBytes)} — ${summary.largestEntry.title || '(untitled)'}`,
      raw: summary.largestEntry.subtreeBytes,
    });
  }
  if (orphanCount > 0) {
    lines.push({
      label: 'Orphan assets',
      value: `${orphanCount} (${formatBytes(orphanBytes)})`,
      raw: orphanBytes,
    });
  }

  const list = createElement('ul', 'pkc-storage-profile-summary-list');
  for (const { label: k, value, raw } of lines) {
    const li = createElement('li', 'pkc-storage-profile-summary-row');
    const kEl = createElement('span', 'pkc-storage-profile-summary-key');
    kEl.textContent = k;
    const vEl = createElement('span', 'pkc-storage-profile-summary-value');
    vEl.textContent = value;
    if (raw !== undefined) vEl.setAttribute('title', `${raw} bytes`);
    li.appendChild(kEl);
    li.appendChild(vEl);
    list.appendChild(li);
  }
  section.appendChild(list);
  return section;
}

/**
 * Top-list table for the Storage Profile dialog — up to N entries
 * ordered by subtree size.  Empty rows (entries that contribute
 * zero bytes) are filtered at `buildStorageProfile` sort time.
 */
function renderStorageProfileRows(profile: StorageProfile): HTMLElement {
  const TOP_N = 20;
  const section = createElement('div', 'pkc-storage-profile-section');
  section.setAttribute('data-pkc-region', 'storage-profile-top');

  const label = createElement('span', 'pkc-shell-menu-label');
  // Slice A: clarify the ranking basis — rows are ordered by
  // `subtreeBytes`, which is an asset-byte rollup, not a whole-entry
  // footprint.
  label.textContent = `Top entries by asset bytes (showing ${Math.min(profile.rows.length, TOP_N)} of ${profile.rows.length})`;
  section.appendChild(label);

  if (profile.rows.length === 0) {
    const empty = createElement('div', 'pkc-storage-profile-empty');
    empty.textContent = 'No entries carry asset bytes.';
    section.appendChild(empty);
    return section;
  }

  const table = createElement('ul', 'pkc-storage-profile-rows');
  for (const row of profile.rows.slice(0, TOP_N)) {
    const li = createElement('li', 'pkc-storage-profile-row');
    li.setAttribute('data-pkc-region', 'storage-profile-row');
    li.setAttribute('data-pkc-lid', row.lid);
    li.setAttribute('data-pkc-archetype', row.archetype);
    li.setAttribute('data-pkc-subtree-bytes', String(row.subtreeBytes));
    // Slice B: body bytes as a separate attribute so downstream
    // tooling can read it without parsing the rendered detail text.
    li.setAttribute('data-pkc-subtree-body-bytes', String(row.subtreeBodyBytes));

    // Each row is a real <button> so Enter/Space work without a
    // bespoke keydown handler. The button carries data-pkc-action +
    // data-pkc-lid; closest() in action-binder resolves both from any
    // nested span (icon / title / size / detail).
    const trigger = createElement('button', 'pkc-storage-profile-row-button');
    trigger.setAttribute('data-pkc-action', 'select-from-storage-profile');
    trigger.setAttribute('data-pkc-lid', row.lid);
    trigger.setAttribute(
      'title',
      'Open this entry and close the Storage Profile dialog',
    );

    const head = createElement('span', 'pkc-storage-profile-row-head');
    const icon = createElement('span', 'pkc-storage-profile-row-icon');
    icon.textContent = archetypeIcon(row.archetype);
    head.appendChild(icon);

    const title = createElement('span', 'pkc-storage-profile-row-title');
    title.textContent = row.title || '(untitled)';
    head.appendChild(title);

    const size = createElement('span', 'pkc-storage-profile-row-size');
    size.textContent = formatBytes(row.subtreeBytes);
    size.setAttribute('title', `${row.subtreeBytes} bytes`);
    head.appendChild(size);
    trigger.appendChild(head);

    const detail = createElement('span', 'pkc-storage-profile-row-detail');
    const parts: string[] = [];
    if (row.archetype === 'folder') {
      parts.push(`folder · self ${formatBytes(row.selfBytes)}`);
    } else {
      parts.push(archetypeLabel(row.archetype));
    }
    if (row.ownedCount > 0) parts.push(`${row.ownedCount} owned`);
    if (row.referencedCount > 0) parts.push(`${row.referencedCount} refs`);
    if (row.largestAssetBytes > 0) {
      parts.push(`largest ${formatBytes(row.largestAssetBytes)}`);
    }
    // Slice B: body-byte contribution, flagged explicitly so it is
    // never mistaken for an asset-bytes number.
    if (row.subtreeBodyBytes > 0) {
      parts.push(`body ${formatBytes(row.subtreeBodyBytes)}`);
    }
    detail.textContent = parts.join(' · ');
    trigger.appendChild(detail);

    li.appendChild(trigger);
    table.appendChild(li);
  }
  section.appendChild(table);
  return section;
}

function renderExportImportInline(state: AppState, options?: { autoOpen?: boolean; exporting?: boolean }): HTMLElement {
  const group = createElement('div', 'pkc-eip-inline');
  group.setAttribute('data-pkc-region', 'export-import-panel');

  // Wrap all export/import buttons in a <details> element to reduce
  // header noise. The summary acts as a single toggle button; the
  // full panel is hidden until the user explicitly opens it.
  const details = document.createElement('details');
  details.className = 'pkc-eip-details';
  // pgc-205 (user 報告 2026-05-24「エクスポート導線が壊れたままだ」):
  // shell menu Data section から呼ばれた時(`autoOpen: true`)は **既に
  // shell menu overlay が open** で「Data…」 を二段クリックさせるのは
  // 冗長(以前は header inline の collapse 1 段だけ、shell menu 移植時に
  // 同 component を流用したため二重 collapse 化)。`autoOpen` で初期から
  // 開いた状態にして 1 click 短縮、user の「Export 押せない」 体感を解消。
  // header inline 経路(`autoOpen: false` / default)は従来通り collapse。
  if (options?.autoOpen) {
    details.open = true;
  }
  // pgc-209:`exporting=true` のとき details `data-pkc-exporting` attribute
  // を付与(CSS 側で visual feedback の余地 + post-pass で button disable)。
  const isExporting = options?.exporting === true;
  if (isExporting) {
    details.setAttribute('data-pkc-exporting', 'true');
  }
  const summary = document.createElement('summary');
  summary.className = 'pkc-btn pkc-btn-create pkc-eip-summary';
  summary.setAttribute('title', isExporting ? 'エクスポート実行中…' : 'エクスポート・インポート操作');
  // 2026-04-26 user audit: opt this details into the press-drag-
  // release UX (`handleDetailsMenuMouseDown`) so the panel follows
  // the macOS native menu idiom. mousedown opens the panel, drag
  // onto an action button, release fires the action and closes
  // the panel. Native click-toggle still works for keyboard.
  summary.setAttribute('data-pkc-pdr-menu', '');
  summary.textContent = 'Data…';
  details.appendChild(summary);

  const content = createElement('div', 'pkc-eip-content');

  // ── Data menu layout ──
  //
  // Three visually separated groups so the user can distinguish
  // "HTML distribution" from "ZIP interchange" from "Import":
  //
  //   [Share — standalone HTML, openable without PKC2]
  //     Export │ Light │ 📤 Selected as HTML
  //   ──
  //   [Archive — Backup ZIP + archetype-filtered batch bundles + single-entry bundle]
  //     Backup ZIP │ TEXTLOGs? │ TEXTs? │ Mixed? │ 📦 Selected (TEXT/TEXTLOG)
  //   ──
  //   [Import]
  //     Import │ 📥 Textlog │ 📥 Text │ 📥 Entry │ 📥 Batch
  //
  // Rationale: the two "Selected" buttons live in different groups
  // and carry different icons — 📤 (share HTML) vs 📦 (single-entry
  // bundle ZIP) — so they read as distinct workflows rather than
  // variants of the same action. See
  // docs/development/selected-entry-html-clone-export.md +
  // docs/development/import-export-surface-audit.md (vocabulary
  // map: Backup ZIP = .pkc2.zip, single-entry bundle = .text.zip /
  // .textlog.zip, batch bundle = .texts.zip / .textlogs.zip /
  // .mixed.zip / .folder-export.zip).

  const selectedEntry = state.selectedLid && state.container
    ? getFilterIndexes(state.container).entryByLid.get(state.selectedLid)
    : undefined;

  // --- Group 1: Share (standalone HTML, openable without PKC2) ---

  // Export Full (editable) — full container as standalone HTML
  const exportBtn = createElement('button', 'pkc-btn pkc-btn-create');
  exportBtn.setAttribute('data-pkc-action', 'begin-export');
  exportBtn.setAttribute('data-pkc-export-mode', 'full');
  exportBtn.setAttribute('data-pkc-export-mutability', 'editable');
  exportBtn.setAttribute(
    'title',
    '全データを配布用 HTML でエクスポート（相手に PKC2 不要・単体で開ける・編集可能）',
  );
  // PR-TT (2026-05-06): user 修正指示2「Date... 配下メニュー、PC で
  // 絵文字なくモバイルと統一感がない」(Data… の typo と解釈)。PC
  // labels を mobile drawer の emoji 接頭辞に揃える。Share=📤 / Archive
  // ZIP=📦 / Import=📥 の 3 系統 icon が distinct になるよう拡張。
  exportBtn.textContent = '📤 Export';
  content.appendChild(exportBtn);

  // Export Light (editable) — same as Full but strips assets
  const lightBtn = createElement('button', 'pkc-btn pkc-btn-create');
  lightBtn.setAttribute('data-pkc-action', 'begin-export');
  lightBtn.setAttribute('data-pkc-export-mode', 'light');
  lightBtn.setAttribute('data-pkc-export-mutability', 'editable');
  lightBtn.setAttribute(
    'title',
    'アセットなしの軽量な配布用 HTML をエクスポート（相手に PKC2 不要・単体で開ける）',
  );
  lightBtn.textContent = '📤 Light';
  content.appendChild(lightBtn);

  // PR-PP (2026-05-06): New PKC button — exports a fresh HTML carrying
  // ONLY the reserved system entries (`__settings__` / `__flags__` /
  // `__about__`) with user content stripped. Use case:「私の theme と
  // flag 設定を埋め込んだ blank PKC2 を相手に渡す / 新 workspace の
  // 起点にする」(user 修正指示2).
  const newPkcBtn = createElement('button', 'pkc-btn pkc-btn-create');
  newPkcBtn.setAttribute('data-pkc-action', 'export-system-only');
  newPkcBtn.setAttribute(
    'title',
    'システムエントリ(設定 / Flags / About)だけを含む空の PKC2 を HTML で書き出す。相手は同じ theme / 設定で blank workspace を始められる',
  );
  newPkcBtn.textContent = '🆕 New PKC';
  content.appendChild(newPkcBtn);

  // Selected-entry HTML clone export — produces a stand-alone `.html`
  // that the recipient can open without PKC2. Subset logic
  // (referenced entries, owned attachments, reachable assets,
  // ancestor folders) lives in `buildSubsetContainer`. Enabled for
  // any entry — unlike ZIP bundle formats, the HTML clone does not
  // require an archetype-specific builder.
  const selectedHtmlBtn = createElement('button', 'pkc-btn pkc-btn-create');
  selectedHtmlBtn.setAttribute('data-pkc-action', 'export-selected-entry-html');
  if (selectedEntry) {
    selectedHtmlBtn.setAttribute(
      'title',
      '選択中のエントリと関連アセット / 参照エントリのみを含む配布用 HTML を生成（相手に PKC2 不要・単体で開ける）',
    );
    selectedHtmlBtn.textContent = '📤 Selected as HTML';
  } else {
    (selectedHtmlBtn as HTMLButtonElement).disabled = true;
    selectedHtmlBtn.setAttribute(
      'title',
      '選択中のエントリのみを含む配布用 HTML を生成（エントリ選択時のみ有効・相手に PKC2 不要）',
    );
    selectedHtmlBtn.textContent = '📤 Selected as HTML';
  }
  content.appendChild(selectedHtmlBtn);

  // Group separator: Share (HTML) → Archive (ZIP)
  const sepShareZip = createElement('span', 'pkc-eip-sep');
  sepShareZip.textContent = '|';
  content.appendChild(sepShareZip);

  // --- Group 2: Archive (ZIP, re-importable into PKC2) ---

  // ZIP Export — full container ZIP, framed as "Backup ZIP" so users
  // can tell apart the **backup-oriented** `.pkc2.zip` from the
  // archetype-filtered batch bundles that follow (TEXTLOGs / TEXTs /
  // Mixed) and from the **single-entry bundles** (📦 Selected). See
  // `docs/development/import-export-surface-audit.md` §6.1 / §8.1 —
  // `.pkc2.zip` is the canonical Backup ZIP today; the renaming is
  // label-only (no behavioural change). The action / data attribute
  // stays `export-zip` so existing tests / event wiring are intact.
  const zipBtn = createElement('button', 'pkc-btn pkc-btn-create');
  zipBtn.setAttribute('data-pkc-action', 'export-zip');
  zipBtn.setAttribute(
    'title',
    'Backup ZIP（.pkc2.zip）として書き出す — バックアップ・マシン移行・別 PKC2 への再インポート用',
  );
  zipBtn.textContent = '📦 Backup ZIP';
  content.appendChild(zipBtn);

  // Container-wide TEXTLOG export — only shown when the container
  // has at least one textlog entry. Bundles all textlogs into a
  // single .textlogs.zip containing individual .textlog.zip files.
  const hasTextlogs = state.container?.entries.some((e) => e.archetype === 'textlog');
  if (hasTextlogs) {
    const textlogsBtn = createElement('button', 'pkc-btn pkc-btn-create');
    textlogsBtn.setAttribute('data-pkc-action', 'export-textlogs-container');
    textlogsBtn.setAttribute(
      'title',
      '全テキストログをまとめて ZIP エクスポート（再インポート用）',
    );
    textlogsBtn.textContent = '📦 TEXTLOGs';
    content.appendChild(textlogsBtn);
  }

  // Container-wide TEXT export — only shown when the container
  // has at least one text entry. Bundles all texts into a
  // single .texts.zip containing individual .text.zip files.
  const hasTexts = state.container?.entries.some((e) => e.archetype === 'text');
  if (hasTexts) {
    const textsBtn = createElement('button', 'pkc-btn pkc-btn-create');
    textsBtn.setAttribute('data-pkc-action', 'export-texts-container');
    textsBtn.setAttribute(
      'title',
      '全テキストをまとめて ZIP エクスポート（再インポート用）',
    );
    textsBtn.textContent = '📦 TEXTs';
    content.appendChild(textsBtn);
  }

  // Container-wide mixed export — shown when the container has at
  // least one TEXT or TEXTLOG entry. Bundles both archetypes into
  // a single .mixed.zip.
  if (hasTextlogs || hasTexts) {
    const mixedBtn = createElement('button', 'pkc-btn pkc-btn-create');
    mixedBtn.setAttribute('data-pkc-action', 'export-mixed-container');
    mixedBtn.setAttribute(
      'title',
      '全 TEXT / TEXTLOG をまとめて ZIP エクスポート (.mixed.zip・再インポート用)',
    );
    mixedBtn.textContent = '📦 Mixed';
    content.appendChild(mixedBtn);
  }

  // Selected-only ZIP — "hand the single entry to another PKC2 user"
  // affordance. Enabled only when the current selection points at a
  // text / textlog entry (the two archetypes that have round-trippable
  // .text.zip / .textlog.zip bundle formats). Disabled otherwise so
  // the user gets an inert, labeled button instead of a no-op surprise.
  // Icon is 📦 (package) — distinct from 📤 (share HTML) above so the
  // two "Selected" buttons read as different workflows.
  const selectedShareable = selectedEntry?.archetype === 'text'
    || selectedEntry?.archetype === 'textlog';
  const selectedBtn = createElement('button', 'pkc-btn pkc-btn-create');
  selectedBtn.setAttribute('data-pkc-action', 'export-selected-entry');
  if (selectedShareable && selectedEntry) {
    const kind = selectedEntry.archetype === 'text' ? 'TEXT' : 'TEXTLOG';
    selectedBtn.setAttribute(
      'title',
      `選択中の ${kind} エントリを単体バンドル（.${kind.toLowerCase()}.zip）として書き出す（別 PKC2 への再インポート用）`,
    );
    selectedBtn.textContent = `📦 Selected (${kind})`;
  } else {
    (selectedBtn as HTMLButtonElement).disabled = true;
    selectedBtn.setAttribute(
      'title',
      '選択中のエントリを単体バンドル（.text.zip / .textlog.zip）で個別出力（TEXT / TEXTLOG 選択時のみ有効・再インポート用）',
    );
    selectedBtn.textContent = '📦 Selected';
  }
  content.appendChild(selectedBtn);

  // Group separator: Archive (ZIP) → Import
  const sep = createElement('span', 'pkc-eip-sep');
  sep.textContent = '|';
  content.appendChild(sep);

  // Import — HTML or Backup ZIP. The preview dialog lets the user
  // pick Replace (full overwrite) or Merge (additive). Tooltip used
  // to say only "上書き" which mis-implied that Replace is the only
  // mode. Audit §5.4 / §7.
  const importBtn = createElement('button', 'pkc-btn pkc-btn-create');
  importBtn.setAttribute('data-pkc-action', 'begin-import');
  importBtn.setAttribute(
    'title',
    'HTML または Backup ZIP を取り込む（プレビューで Replace / Merge を選択）',
  );
  importBtn.textContent = '📥 Import';
  content.appendChild(importBtn);

  // Import single-entry bundle (.textlog.zip)
  const importTextlogBtn = createElement('button', 'pkc-btn pkc-btn-create');
  importTextlogBtn.setAttribute('data-pkc-action', 'import-textlog-bundle');
  importTextlogBtn.setAttribute(
    'title',
    '単体バンドル（.textlog.zip）を 1 件の TEXTLOG エントリとして取り込む（追加）',
  );
  importTextlogBtn.textContent = '📥 Textlog';
  content.appendChild(importTextlogBtn);

  // Import single-entry bundle (.text.zip)
  const importTextBtn = createElement('button', 'pkc-btn pkc-btn-create');
  importTextBtn.setAttribute('data-pkc-action', 'import-text-bundle');
  importTextBtn.setAttribute(
    'title',
    '単体バンドル（.text.zip）を 1 件の TEXT エントリとして取り込む（追加）',
  );
  importTextBtn.textContent = '📥 Text';
  content.appendChild(importTextBtn);

  // Unified single-entry package import — accepts .text.zip OR
  // .textlog.zip and routes internally based on filename. Sister
  // affordance to the "📤 Selected" export above, so users who
  // received a single shared entry don't have to first identify
  // which archetype they were handed.
  const importEntryBtn = createElement('button', 'pkc-btn pkc-btn-create');
  importEntryBtn.setAttribute('data-pkc-action', 'import-entry-package');
  importEntryBtn.setAttribute(
    'title',
    '単体バンドル（.text.zip / .textlog.zip）を自動判別して取り込む（追加）',
  );
  importEntryBtn.textContent = '📥 Entry';
  content.appendChild(importEntryBtn);

  // Import batch bundle (container-wide / folder-scoped)
  const importBatchBtn = createElement('button', 'pkc-btn pkc-btn-create');
  importBatchBtn.setAttribute('data-pkc-action', 'import-batch-bundle');
  importBatchBtn.setAttribute(
    'title',
    '一括バンドル（.textlogs.zip / .texts.zip / .mixed.zip / .folder-export.zip）をまとめて取り込む（追加）',
  );
  importBatchBtn.textContent = '📥 Batch';
  content.appendChild(importBatchBtn);

  // ── Group 4 (PR-2JJ v2 / 2026-05-13):AST / Pandoc / HTML 出力 ──
  //
  // 現在 selected entry の body を window.PKC.ast 経由で 4 種類の表現に変換、
  // clipboard へコピー。JSONL(compact、1 行)default で AI / LLM 入力に最適、
  // 「Pretty」checkbox を入れた状態で押すと整形 JSON を出す。
  //
  // 旧 `?pkc-debug=ast` overlay(右下 fixed panel)は廃止、本 menu に統合。
  if (selectedEntry) {
    const sep = createElement('div', 'pkc-eip-separator');
    sep.setAttribute('aria-hidden', 'true');
    content.appendChild(sep);

    const prettyLabel = createElement('label', 'pkc-eip-pretty-label');
    prettyLabel.setAttribute('title', '出力 JSON を整形(default は JSONL = 1 行 compact)');
    const prettyInput = createElement('input', 'pkc-eip-pretty-input');
    (prettyInput as HTMLInputElement).type = 'checkbox';
    prettyInput.setAttribute('data-pkc-control', 'ast-pretty');
    prettyLabel.appendChild(prettyInput);
    prettyLabel.appendChild(document.createTextNode(' Pretty'));
    content.appendChild(prettyLabel);

    const astBtn = createElement('button', 'pkc-btn');
    astBtn.setAttribute('data-pkc-action', 'copy-ast-data');
    astBtn.setAttribute('data-pkc-ast-format', 'ast');
    astBtn.setAttribute('data-pkc-lid', selectedEntry.lid);
    astBtn.setAttribute('title', 'AstDocument を clipboard にコピー(JSONL / Pretty 切替)');
    astBtn.textContent = '🧬 AST';
    content.appendChild(astBtn);

    const canonBtn = createElement('button', 'pkc-btn');
    canonBtn.setAttribute('data-pkc-action', 'copy-ast-data');
    canonBtn.setAttribute('data-pkc-ast-format', 'canonical');
    canonBtn.setAttribute('data-pkc-lid', selectedEntry.lid);
    canonBtn.setAttribute('title', 'Canonical AstDocument(idempotent な正規化済 AST)');
    canonBtn.textContent = '🧬 Canonical';
    content.appendChild(canonBtn);

    const pandocBtn = createElement('button', 'pkc-btn');
    pandocBtn.setAttribute('data-pkc-action', 'copy-ast-data');
    pandocBtn.setAttribute('data-pkc-ast-format', 'pandoc');
    pandocBtn.setAttribute('data-pkc-lid', selectedEntry.lid);
    pandocBtn.setAttribute('title', 'Pandoc Native JSON(`pandoc --from json` で docx/pptx/pdf 等に変換可能)');
    pandocBtn.textContent = '🧬 Pandoc';
    content.appendChild(pandocBtn);

    const htmlBtn = createElement('button', 'pkc-btn');
    htmlBtn.setAttribute('data-pkc-action', 'copy-ast-data');
    htmlBtn.setAttribute('data-pkc-ast-format', 'html');
    htmlBtn.setAttribute('data-pkc-lid', selectedEntry.lid);
    htmlBtn.setAttribute('title', 'renderHtml(ast) の HTML 文字列');
    htmlBtn.textContent = '🧬 HTML';
    content.appendChild(htmlBtn);

    // ── Group 5 (PR-2JJ v2 / 2026-05-13):PDF / Word / PPT export ──
    //
    // PDF:browser native print dialog → "Save as PDF"。Viewer popup を
    // 開いて user 操作で印刷確定。0 KB のバンドル増、依存 0。
    // Word(docx):Pandoc Native JSON を .pandoc.json でダウンロード、
    // user 側で `pandoc --from json -o out.docx input.pandoc.json` を実行する。
    // PPT(pptx):同様、`pandoc -o out.pptx`。
    //
    // browser 内で完結する Word/PPT 直接生成は将来課題(docx.js / pptxgenjs
    // を bundle すると +100〜200 KB)。Phase 1 は Pandoc JSON dump で interop。
    const sep2 = createElement('div', 'pkc-eip-separator');
    sep2.setAttribute('aria-hidden', 'true');
    content.appendChild(sep2);

    const pdfBtn = createElement('button', 'pkc-btn');
    pdfBtn.setAttribute('data-pkc-action', 'export-entry-pdf');
    pdfBtn.setAttribute('data-pkc-lid', selectedEntry.lid);
    pdfBtn.setAttribute('title', 'ブラウザ印刷ダイアログ経由で PDF 保存(Viewer popup → 印刷 → PDF として保存)');
    pdfBtn.textContent = '📄 PDF';
    content.appendChild(pdfBtn);

    const docxBtn = createElement('button', 'pkc-btn');
    docxBtn.setAttribute('data-pkc-action', 'export-entry-pandoc-json');
    docxBtn.setAttribute('data-pkc-pandoc-target', 'docx');
    docxBtn.setAttribute('data-pkc-lid', selectedEntry.lid);
    docxBtn.setAttribute(
      'title',
      'Pandoc Native JSON を .pandoc.json で保存。コマンドラインで `pandoc --from json -o out.docx <file>` を実行して Word 化',
    );
    docxBtn.textContent = '📝 Word';
    content.appendChild(docxBtn);

    const pptxBtn = createElement('button', 'pkc-btn');
    pptxBtn.setAttribute('data-pkc-action', 'export-entry-pandoc-json');
    pptxBtn.setAttribute('data-pkc-pandoc-target', 'pptx');
    pptxBtn.setAttribute('data-pkc-lid', selectedEntry.lid);
    pptxBtn.setAttribute(
      'title',
      'Pandoc Native JSON を .pandoc.json で保存。コマンドラインで `pandoc --from json -o out.pptx <file>` を実行して PowerPoint 化',
    );
    pptxBtn.textContent = '🎞 PPT';
    content.appendChild(pptxBtn);
  }

  details.appendChild(content);
  group.appendChild(details);

  // pgc-209(pgc-205 probe finding「rapid double-click → 2 downloads」 対策):
  // export 中は全 action button(begin-export / export-* / import-* / new pkc)
  // を disable。reducer 側で BEGIN_EXPORT が phase='exporting' 中は blocked
  // (state===prev で render listener 非発火、parallel call は防止済)だが、
  // **button が DOM に visible のまま rapid click が貯まる** ケース(50-100ms
  // 間の SYS_FINISH_EXPORT → phase='ready' → re-mount → 次 click 受理)で
  // sequential 多重 export が起き得るため、export 中は visual feedback +
  // browser-level click 抑止の両方を入れる。
  if (isExporting) {
    const actionButtons = group.querySelectorAll<HTMLButtonElement>(
      'button[data-pkc-action]',
    );
    for (const btn of Array.from(actionButtons)) {
      btn.disabled = true;
      btn.setAttribute('data-pkc-disabled-reason', 'exporting');
      btn.setAttribute('aria-disabled', 'true');
    }
  }

  return group;
}

/**
/**
 * Saved Searches Pane v1 — spec: docs/development/saved-searches-v1.md
 *
 * Lists `container.meta.saved_searches` as clickable chips. Each chip
 * applies the saved filter / sort / search state when clicked and has
 * a × delete button. Empty (undefined or []) → pane is not rendered.
 * Hidden while an import preview is active, and the × button is
 * hidden when `state.readonly` is true.
 */
function renderSavedSearchesPane(
  state: AppState,
): HTMLElement | null {
  if (!state.container) return null;
  if (state.importPreview) return null;
  const saved = state.container.meta.saved_searches ?? [];
  if (saved.length === 0) return null;

  // 2026-04-26 user audit: sidebar required scrolling by default —
  // the Saved Searches pane was the biggest ~200-300px contributor
  // because it was always opened. Default to closed; users expand
  // when they want to apply a snapshot. State is intentionally
  // ephemeral (matches `<details>` semantics) so a click on the
  // summary is the only interaction needed to peek inside.
  const pane = document.createElement('details');
  pane.className = 'pkc-saved-searches-pane';
  pane.setAttribute('data-pkc-region', 'saved-searches');

  const summary = document.createElement('summary');
  summary.className = 'pkc-saved-searches-summary';
  summary.textContent = `Saved (${saved.length})`;
  pane.appendChild(summary);

  const list = createElement('ul', 'pkc-saved-searches-list');
  for (const s of saved) {
    // Defensive skip: silently drop malformed records so a single
    // corrupt entry cannot wedge the whole pane.
    if (!s || typeof s.id !== 'string' || typeof s.name !== 'string') continue;
    const li = createElement('li', 'pkc-saved-search-item');
    li.setAttribute('data-pkc-action', 'apply-saved-search');
    li.setAttribute('data-pkc-saved-id', s.id);
    li.setAttribute('title', s.name || '(unnamed)');

    const label = createElement('span', 'pkc-saved-search-label');
    label.textContent = s.name || '(unnamed)';
    li.appendChild(label);

    // W1 Slice F-3 — surface any saved `tag_filter_v2` values as
    // read-only chips inline with the row so users can see which
    // Tag filters a Saved Search will restore before clicking.
    // Chips carry no `data-pkc-action` — click bubbles up to the
    // row's `apply-saved-search` via closest(), which is the
    // desired behavior (the whole row stays a single target).
    // The legacy `tag_filter` key (categorical peer) is
    // intentionally NOT visualized here; Slice A / Rename split
    // made it a different axis and rendering it with the same
    // "タグ" label would re-introduce the very vocabulary
    // collision the rename fixed.
    const savedTags = Array.isArray(s.tag_filter_v2) ? s.tag_filter_v2 : [];
    if (savedTags.length > 0) {
      const tagsWrap = createElement('span', 'pkc-saved-search-tags');
      tagsWrap.setAttribute('data-pkc-region', 'saved-search-tags');

      const tagsLabel = createElement('span', 'pkc-saved-search-tags-label');
      tagsLabel.textContent = 'タグ:';
      tagsWrap.appendChild(tagsLabel);

      for (const tagValue of savedTags) {
        const chip = createElement('span', 'pkc-saved-search-tag-chip');
        chip.setAttribute('data-pkc-saved-tag-value', tagValue);
        chip.textContent = tagValue;
        tagsWrap.appendChild(chip);
      }

      li.appendChild(tagsWrap);
    }

    if (!state.readonly) {
      // 2026-04-26 sidebar audit follow-up: ★ button quick-saves
      // with an auto timestamp name ("Saved <datetime>"). The
      // rename affordance lets users replace that with a custom
      // label after the fact. Sits BEFORE the delete × so the
      // destructive action stays at the row's right edge.
      const renameBtn = createElement('button', 'pkc-saved-search-rename');
      renameBtn.setAttribute('data-pkc-action', 'rename-saved-search');
      renameBtn.setAttribute('data-pkc-saved-id', s.id);
      renameBtn.setAttribute('title', 'この保存検索の名前を変更');
      renameBtn.textContent = '✏';
      li.appendChild(renameBtn);

      const delBtn = createElement('button', 'pkc-saved-search-delete');
      delBtn.setAttribute('data-pkc-action', 'delete-saved-search');
      delBtn.setAttribute('data-pkc-saved-id', s.id);
      delBtn.setAttribute('title', 'Delete saved search');
      delBtn.textContent = '×';
      li.appendChild(delBtn);
    }

    list.appendChild(li);
  }
  pane.appendChild(list);
  return pane;
}

/**
 * Recent Entries Pane v1 — spec: docs/development/recent-entries-pane-v1.md
 *
 * Derived-only pane listing up to 10 user entries sorted by
 * `updated_at` desc (tie: `created_at` desc, then `lid` asc). Shown
 * as a default-open `<details>` between sort controls and archive
 * toggle. Non-describe when container has zero user entries.
 */
function renderRecentEntriesPane(
  userEntries: readonly Entry[],
  selectedLid: string | null,
  collapsed: boolean,
): HTMLElement | null {
  if (userEntries.length === 0) return null;
  const rows = selectRecentEntries(userEntries);
  if (rows.length === 0) return null;

  const pane = document.createElement('details');
  pane.className = 'pkc-recent-pane';
  pane.setAttribute('data-pkc-region', 'recent-entries');
  // Drive open/closed from AppState so a user-initiated collapse is
  // preserved across subsequent re-renders. See PR-γ / cluster C.
  pane.open = !collapsed;

  const summary = document.createElement('summary');
  summary.className = 'pkc-recent-summary';
  summary.setAttribute('data-pkc-action', 'toggle-recent-pane');
  summary.textContent = `最近 (${rows.length})`;
  pane.appendChild(summary);

  const list = createElement('ul', 'pkc-recent-list');
  for (const entry of rows) {
    const li = createElement('li', 'pkc-recent-item');
    li.setAttribute('data-pkc-action', 'select-recent-entry');
    li.setAttribute('data-pkc-lid', entry.lid);
    if (entry.lid === selectedLid) {
      li.setAttribute('data-pkc-selected', 'true');
    }
    const icon = createElement('span', 'pkc-recent-icon');
    icon.textContent = archetypeIcon(entry.archetype);
    li.appendChild(icon);
    const title = createElement('span', 'pkc-recent-title');
    title.textContent = entry.title || '(untitled)';
    li.appendChild(title);
    list.appendChild(li);
  }
  pane.appendChild(list);
  return pane;
}

function renderSidebar(
  state: AppState,
  sharedLinkIndex: LinkIndex | null = null,
  /**
   * 使い回す既存の `<ul data-pkc-region="entry-list">`(2026-07-26)。
   * 渡されたときは **O(N) の行ループを丸ごと skip** して、この node を
   * そのまま差し込む。呼び元は `canReuseEntryList` が true のときだけ渡す。
   */
  reuseEntryList: HTMLElement | null = null,
): HTMLElement {
  const endProfile = profileStart('render:sidebar');
  try {
    // 領域 10-6 ζ'' Phase 4 follow-up: `sidebar.mode = 'filer'` で
    // 左ペインを compact filer-explorer に差し替え。tree (default) は
    // 既存実装を流用。
    const sidebar = sidebarMode() === 'filer'
      ? renderSidebarAsFiler(state)
      : renderSidebarImpl(state, sharedLinkIndex, reuseEntryList);
    markChildWindowItems(sidebar, state.childWindowLids);
    return sidebar;
  } finally {
    endProfile();
  }
}

/**
 * Phase γ-A3:child entry-window で編集中の entry の sidebar 行に
 * `data-pkc-in-window="true"` を付け、「別ウィンドウで編集中」marker を
 * 出す。tree 行は memoize されるため、render 後の sidebar subtree 全体に
 * 対し `data-pkc-lid` を持つ要素を走査して一括適用する(memo を貫通する
 * state → DOM の decoration pass)。tree / filer どちらの sidebar 行も
 * `data-pkc-lid` を持つため両 mode で機能する。
 */
function markChildWindowItems(
  sidebar: HTMLElement,
  lids: readonly string[] | undefined,
): void {
  // #938 R9: 付与だけでなく除去も行う reconcile pass に変更。従来は
  // 「window close → full render で行が rebuild される」ことに依存して
  // marker が消えていたが、行 memo(flat PR #179 / tree R9)は node を
  // 温存するため、明示的に剥がさないと stale marker が残る。title は
  // この pass が設定した文言のときだけ除去する(他要素の title を
  // 巻き込まない)。
  const inWindow = new Set(lids ?? []);
  sidebar.querySelectorAll<HTMLElement>('[data-pkc-lid]').forEach((el) => {
    const lid = el.getAttribute('data-pkc-lid');
    if (lid && inWindow.has(lid)) {
      el.setAttribute('data-pkc-in-window', 'true');
      el.setAttribute('title', '別ウィンドウで編集中');
    } else if (el.hasAttribute('data-pkc-in-window')) {
      el.removeAttribute('data-pkc-in-window');
      if (el.getAttribute('title') === '別ウィンドウで編集中') {
        el.removeAttribute('title');
      }
    }
  });
}

/**
 * Compact filer surface used inside the left pane when
 * `sidebar.mode = 'filer'`. Mirrors the explorer subset structure
 * of the center filer view but at narrower width: only the name +
 * archetype icon column, no breadcrumb header (it's pinned to the
 * current folder via selectedLid).
 */
/**
 * pgc-49:tree sidebar(renderSidebarImpl)と filer sidebar
 * (renderSidebarAsFiler)で共有する ⚙ Filters disclosure。color strip +
 * showArchived / treeHideBuckets / searchHideBuckets / unreferenced の
 * 4 toggle を 1 つの `<details>` に折りたたみ収納する(2026-04-27 user
 * direction「トグル自体を折りたたんで隠したうえで」)。
 *
 * 各 toggle の有無は container の中身で出し分ける。toggle が 1 つも無ければ
 * `null` を返す。disclosure の open/close は `state.advancedFiltersOpen` で
 * 次 dispatch の full re-render を跨いで維持される。helper 化により tree と
 * filer の検索オプションが構造的に分岐し得なくなる(user 指摘「機能ダウン
 * しすぎ」への恒久対策)。
 *
 * @param userEntries  precondition 判定に使う user entry 配列(system-*
 *                     archetype は除外済を渡すこと)。
 * @param filterActive search 軸 filter(query / archetype / tag / color /
 *                     categoricalPeer)が立っているか。`search-hide-buckets`
 *                     toggle の表示 gate(検索中のみ意味を持つ)。
 */
function renderAdvancedFiltersPanel(
  state: AppState,
  userEntries: Entry[],
  filterActive: boolean,
): HTMLElement | null {
  const hasArchivedTodo = userEntries.some(
    (e) => e.archetype === 'todo' && parseTodoBody(e.body, e).archived,
  );
  const hasAttachment = userEntries.some((e) => e.archetype === 'attachment');
  const bucketTitles = new Set(Object.values(ARCHETYPE_SUBFOLDER_NAMES));
  const hasBucketFolder = !!state.container
    && state.container.entries.some(
      (e) => e.archetype === 'folder' && bucketTitles.has(e.title),
    );
  // pgc-231:従来は filterActive のとき userEntries 全件に対し
  // `getStructuralParent`(O(R) walk)を回し O(N×R) になっていた。
  // `getFilterIndexes(container).bucketChildLids` は同 semantic の
  // memoized Set(filter-cache.ts L85-96)── O(N) Set.has check に
  // 置換、c-5000 + 検索 active で keystroke ごとに走っていた
  // **O(N×R) を O(N) に圧縮**。
  const hasBucketedEntryInResults =
    filterActive
    && !!state.container
    && (() => {
      const { bucketChildLids } = getFilterIndexes(state.container!);
      if (bucketChildLids.size === 0) return false;
      return userEntries.some((e) => bucketChildLids.has(e.lid));
    })();
  // pgc-232:colorTagsInUse は filter-cache.ts で memoize 済(container
  // ref で keystroke / re-render 跨ぎ cache hit)。1 度だけ entries walk、
  // 各 keystroke で再計算しない。
  const memoizedColorsInUse = state.container
    ? getFilterIndexes(state.container).colorTagsInUse
    : undefined;
  const colorStrip = renderColorFilterStrip(userEntries, state.colorTagFilter ?? new Set(), memoizedColorsInUse);
  const hasColorsInUse = colorStrip !== null;
  const hasAnyToggle =
    hasArchivedTodo || hasAttachment || hasBucketFolder || hasBucketedEntryInResults || hasColorsInUse;
  if (!hasAnyToggle) return null;

  const details = document.createElement('details');
  details.className = 'pkc-advanced-filters';
  details.setAttribute('data-pkc-region', 'advanced-filters');
  if (state.advancedFiltersOpen ?? false) {
    details.setAttribute('open', '');
  }
  const summary = document.createElement('summary');
  summary.className = 'pkc-advanced-filters-summary';
  summary.setAttribute('data-pkc-action', 'toggle-advanced-filters');
  summary.textContent = '⚙ 絞り込み';
  details.appendChild(summary);

  if (colorStrip) {
    // Color tag chip strip — first child so the visual filter axis
    // is at the top of the disclosure, ahead of the toggle list.
    details.appendChild(colorStrip);
  }

  if (hasArchivedTodo) {
    const toggle = createElement('label', 'pkc-show-archived-toggle');
    toggle.setAttribute('data-pkc-region', 'show-archived-toggle');
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = state.showArchived;
    check.setAttribute('data-pkc-action', 'toggle-show-archived');
    toggle.appendChild(check);
    const labelText = createElement('span', '');
    labelText.textContent = 'Show archived';
    toggle.appendChild(labelText);
    details.appendChild(toggle);
  }

  if (hasBucketFolder) {
    // Inverted UX: checked = "show ASSETS / TODOS folders in tree".
    const toggle = createElement('label', 'pkc-show-archived-toggle');
    toggle.setAttribute('data-pkc-region', 'tree-hide-buckets-toggle');
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = !(state.treeHideBuckets ?? true);
    check.setAttribute('data-pkc-action', 'toggle-tree-hide-buckets');
    toggle.appendChild(check);
    const labelText = createElement('span', '');
    labelText.textContent = 'Show ASSETS / TODOS folders';
    toggle.appendChild(labelText);
    details.appendChild(toggle);
  }

  if (hasBucketedEntryInResults) {
    // Inverted UX: checked = "show ASSETS / TODOS contents in
    // search results". Distinct from the tree-folder toggle —
    // user may want folder visibility OFF but search-result
    // visibility ON, or vice versa.
    const toggle = createElement('label', 'pkc-show-archived-toggle');
    toggle.setAttribute('data-pkc-region', 'search-hide-buckets-toggle');
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = !(state.searchHideBuckets ?? true);
    check.setAttribute('data-pkc-action', 'toggle-search-hide-buckets');
    toggle.appendChild(check);
    const labelText = createElement('span', '');
    labelText.textContent = 'Show ASSETS / TODOS in search results';
    toggle.appendChild(labelText);
    details.appendChild(toggle);
  }

  if (hasAttachment) {
    const unrefToggle = createElement('label', 'pkc-show-archived-toggle');
    unrefToggle.setAttribute('data-pkc-region', 'unreferenced-attachments-toggle');
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = state.unreferencedAttachmentsOnly ?? false;
    check.setAttribute('data-pkc-action', 'toggle-unreferenced-attachments');
    unrefToggle.appendChild(check);
    const labelText = createElement('span', '');
    labelText.textContent = 'Show only unused attachments';
    unrefToggle.appendChild(labelText);
    if (state.container && (state.unreferencedAttachmentsOnly ?? false)) {
      const count = collectUnreferencedAttachmentLids(state.container).size;
      const badge = createElement('span', 'pkc-unref-count');
      badge.textContent = ` (${count})`;
      unrefToggle.appendChild(badge);
    }
    details.appendChild(unrefToggle);
  }

  return details;
}

function renderSidebarAsFiler(state: AppState): HTMLElement {
  const sidebar = createElement('aside', 'pkc-sidebar pkc-sidebar-filer-mode');
  sidebar.setAttribute('data-pkc-region', 'sidebar');
  sidebar.setAttribute('data-pkc-sidebar-mode', 'filer');

  const scope = resolveFilerScope(state);
  const children = scope
    ? getStructuralChildren(state.container?.relations ?? [], state.container?.entries ?? [], scope.lid)
    : getRootEntries(state.container?.relations ?? [], state.container?.entries ?? []);
  const visibleChildren = children.filter((e) => !isSystemArchetype(e.archetype));

  // pgc-46/47:query または archetype/tag/color filter が立っていれば
  // container 全体を検索する。検索は tree sidebar と同じ `applyFilters`
  // pipeline を再利用 — full-text(title + body)+ `tag:` / `color:`
  // query token + archetype / tag / color filter set。これで filer が
  // tree sidebar 同等の検索オプションを獲得する(user 指摘「ツリー表示の
  // 検索オプションが無くなっている」への対応)。どの filter 軸も立って
  // いなければ従来どおり現スコープの folder navigation を表示。
  // pgc-237:userEntries は filter-cache で memoize 済 ── inline filter walk
  // を skip。applyFilters が mutable Entry[] を要求するため shallow spread copy。
  const userEntries: Entry[] = state.container
    ? [...getFilterIndexes(state.container).userEntries]
    : [];
  const rawQuery = state.sidebarFilerQuery ?? '';
  // searchAxisActive:`applyFilters` が駆動する軸(query / archetype / tag /
  // color)。`filtering` はそれに加え unreferenced lens も含む ─ pgc-49 で
  // unreferenced lens を ON にすると現フォルダでなく container 全体から未参照
  // 添付を拾う必要があるため、flat global list へ切り替える(添付は ASSETS
  // bucket に auto-route されるので現スコープ局所では空になる)。
  const searchAxisActive =
    rawQuery.trim().length > 0 ||
    state.archetypeFilter.size > 0 ||
    (state.tagFilter?.size ?? 0) > 0 ||
    (state.colorTagFilter?.size ?? 0) > 0;
  const filtering = searchAxisActive || (state.unreferencedAttachmentsOnly ?? false);
  let matched = filtering
    ? applyFilters(
        userEntries,
        rawQuery,
        state.archetypeFilter,
        state.tagFilter,
        state.colorTagFilter,
      )
    : visibleChildren;

  // pgc-49:tree sidebar(renderSidebarImpl)の post-applyFilters chain を
  // matched に適用する。showArchived / searchHideBuckets / treeHideBuckets /
  // unreferencedAttachmentsOnly の 4 toggle を tree と同一 semantics で再現
  // (toggle UI は後段の ⚙ Filters disclosure)。
  // ① showArchived:OFF なら archived todo を全 mode で除外。
  if (!state.showArchived) {
    matched = matched.filter((e) => {
      if (e.archetype !== 'todo') return true;
      return !parseTodoBody(e.body, e).archived;
    });
  }
  // ② searchHideBuckets:検索軸が立っているときのみ ASSETS / TODOS bucket
  // 直下 entry を検索結果から除外。unreferenced lens 単独では bypass する
  // ─ 未参照添付は ASSETS bucket 内に住むため、ここで hide すると lens が
  // 常に空になってしまう(tree の filterIsActive と同じ gate)。
  if (searchAxisActive && (state.searchHideBuckets ?? true) && state.container) {
    const { bucketChildLids } = getFilterIndexes(state.container);
    if (bucketChildLids.size > 0) {
      matched = matched.filter((e) => !bucketChildLids.has(e.lid));
    }
  }
  // ③ treeHideBuckets:bucket folder + 子孫を hide。unreferenced lens 中は
  // bypass(tree と同一)。現スコープ自体が bucket 配下なら hide を skip ─
  // filer は folder navigation を持つので、bucket folder へ navigate-in した
  // 状態で全件 hide されると view が空になり戻れなくなる。
  if (
    (state.treeHideBuckets ?? true) &&
    !(state.unreferencedAttachmentsOnly ?? false) &&
    state.container
  ) {
    const { hiddenBucketLids } = getFilterIndexes(state.container);
    const scopeInBucket = !!scope && hiddenBucketLids.has(scope.lid);
    if (hiddenBucketLids.size > 0 && !scopeInBucket) {
      matched = matched.filter((e) => !hiddenBucketLids.has(e.lid));
    }
  }
  // ④ unreferencedAttachmentsOnly:何からも参照されない attachment のみに
  // 絞る cleanup lens(destructive workflow 用、明示 ON 時のみ作動)。
  if ((state.unreferencedAttachmentsOnly ?? false) && state.container) {
    const { unreferencedAttachmentLids } = getFilterIndexes(state.container);
    matched = matched.filter((e) => unreferencedAttachmentLids.has(e.lid));
  }

  const header = createElement('div', 'pkc-sidebar-filer-header');
  const label = createElement('span', 'pkc-sidebar-filer-label');
  // pgc-46:検索中は scope 名でなく「検索結果」であることを示す。
  label.textContent = filtering
    ? '🔍 検索結果'
    : scope ? (scope.title || '(untitled)') : 'Root';
  header.appendChild(label);
  // Phase γ-A1:現スコープの(絞り込み後の)item 数を表示。
  const count = createElement('span', 'pkc-sidebar-filer-count');
  count.setAttribute('data-pkc-region', 'filer-sidebar-count');
  count.textContent = String(matched.length);
  header.appendChild(count);
  sidebar.appendChild(header);

  // Phase γ-A1(pgc-36):multi-select 中は一括操作バーを出す。multi-select
  // の state(Ctrl/Shift+click)は select-entry handler が汎用処理済。
  // bar は center filer / graph と同じ buildFilerMultiActionBar を再利用。
  if (state.multiSelectedLids.length > 0) {
    sidebar.appendChild(buildFilerMultiActionBar(state, 'sidebar'));
  }

  // pgc-46:global search 窓。container に entry があれば常時表示する
  // (空 folder からでも全体検索できるよう、pgc-35 の「現 folder に item が
  // あるときだけ」gate を撤廃)。data-pkc-field は render-continuity helper
  // が focus + caret を full re-render 跨ぎで復元するキー(IME が壊れない)。
  const hasAnyEntry = userEntries.length > 0;
  if (hasAnyEntry) {
    // pgc-51:検索窓 + ★ quick-save を 1 行に並べる(tree sidebar と同じ
    // `.pkc-search-row` を再利用)。★ は現在の検索条件を saved search と
    // して保存する(`quick-save-search` → SAVE_SEARCH、自動命名)。
    const searchRow = createElement('div', 'pkc-search-row');
    const searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.className = 'pkc-sidebar-filer-search';
    searchInput.setAttribute('data-pkc-action', 'set-sidebar-filer-query');
    searchInput.setAttribute('data-pkc-field', 'sidebar-filer-search');
    searchInput.setAttribute('placeholder', '🔍 全エントリを検索');
    searchInput.value = state.sidebarFilerQuery ?? '';
    searchRow.appendChild(searchInput);
    if (!state.readonly && !state.importPreview) {
      const saveBtn = createElement('button', 'pkc-btn-small pkc-btn-quick-save');
      saveBtn.setAttribute('data-pkc-action', 'quick-save-search');
      saveBtn.setAttribute('title', '現在の検索条件を保存（自動命名）');
      saveBtn.textContent = '★';
      searchRow.appendChild(saveBtn);
    }
    sidebar.appendChild(searchRow);
    // pgc-47:archetype filter rail。tree sidebar と同じ `renderArchetypeFilter`
    // を再利用し、検索結果を type で絞れるようにする。button は
    // `set-archetype-filter` を dispatch、`applyFilters` 経由で matched に反映。
    sidebar.appendChild(renderArchetypeFilter(state.archetypeFilter));
    // pgc-51:Saved Searches Pane。tree sidebar と同一の
    // `renderSavedSearchesPane` を再利用。APPLY_SAVED_SEARCH は pgc-51 で
    // `sidebarFilerQuery` も復元するため、filer から saved search を apply
    // すれば query + archetype / tag / color filter が連動する。
    {
      const savedPane = renderSavedSearchesPane(state);
      if (savedPane) sidebar.appendChild(savedPane);
    }
    // pgc-50:Recent Entries Pane。tree sidebar と同一の
    // `renderRecentEntriesPane` を再利用 — `updated_at` desc の派生ビューを
    // default 折りたたみ `<details>` で出す。query coupling なし(derived-
    // only、`select-recent-entry` で選択するだけ)なので filer でもそのまま
    // 機能する。tree と同じく archetype filter 直下に配置。
    {
      const recentPane = renderRecentEntriesPane(
        userEntries,
        state.selectedLid,
        state.recentPaneCollapsed ?? true,
      );
      if (recentPane) sidebar.appendChild(recentPane);
    }
    // pgc-48/49:⚙ Filters disclosure。tree sidebar(renderSidebarImpl)と
    // 共有する `renderAdvancedFiltersPanel` で color strip + showArchived /
    // treeHideBuckets / searchHideBuckets / unreferenced の 4 toggle を
    // 折りたたみ収納する。helper 共有で tree と検索オプションが構造的に
    // 乖離しないことを保証(user 指摘「ツリー表示の検索オプションが
    // 無くなっている / 機能ダウンしすぎ」への対応)。
    const advanced = renderAdvancedFiltersPanel(state, userEntries, searchAxisActive);
    if (advanced) sidebar.appendChild(advanced);
  }

  const nav = resolveFilerNavigation(state);
  const list = createElement('ul', 'pkc-sidebar-filer-list');
  // pgc-46:検索中は folder navigation でなく flat な検索結果なので nav-up
  // を出さない(filter を解除すると folder view へ戻る)。
  if (nav.parent && !filtering) {
    const li = createElement('li', 'pkc-sidebar-filer-item pkc-sidebar-filer-nav-up');
    li.setAttribute('data-pkc-action', 'select-entry');
    li.setAttribute('data-pkc-lid', nav.parent.lid);
    li.setAttribute('data-pkc-archetype', 'folder');
    // Phase γ-A1:nav-up を drop target に。entry を drop すると上階層へ
    // 移動する。root sentinel への drop は root level 直下へ(structural
    // relation 削除)、実 folder への drop はその folder へ移動。
    li.setAttribute(
      'data-pkc-drop-target',
      nav.parentIsRootSentinel ? 'root' : 'true',
    );
    // 空タイトルは `(untitled)` を使うが、ここは元から括弧で包む表記なので
    // そのまま入れると `((untitled))` と二重括弧になる。fallback 側だけ
    // 括弧を持たせない。
    li.textContent = nav.parent.title
      ? `📁 ..  (${nav.parent.title})`
      : '📁 ..  (untitled)';
    list.appendChild(li);
  }
  for (const child of matched) {
    const li = createElement('li', 'pkc-sidebar-filer-item');
    li.setAttribute('data-pkc-action', 'select-entry');
    li.setAttribute('data-pkc-lid', child.lid);
    li.setAttribute('data-pkc-archetype', child.archetype);
    // Phase γ-A1:filer item を draggable に(entry の folder 間移動)。
    // DnD 機構は action-binder の handleDragStart / handleDrop が
    // `data-pkc-draggable` / `data-pkc-drop-target` で汎用処理する。
    li.setAttribute('draggable', 'true');
    li.setAttribute('data-pkc-draggable', 'true');
    // folder は drop target を兼ねる(entry を中へ移動)。
    if (child.archetype === 'folder') {
      li.setAttribute('data-pkc-drop-target', 'true');
    }
    if (child.lid === state.selectedLid) li.setAttribute('data-pkc-active', 'true');
    // Phase γ-A1(pgc-36):multi-select 中の item を視覚マーク。
    // `[data-pkc-multi-selected]` は global CSS rule が自動適用。
    if (state.multiSelectedLids.includes(child.lid)) {
      li.setAttribute('data-pkc-multi-selected', 'true');
    }
    li.textContent = `${archetypeIcon(child.archetype)} ${child.title || '(untitled)'}`;
    list.appendChild(li);
  }
  sidebar.appendChild(list);

  if (filtering && matched.length === 0) {
    // pgc-46/47:検索 / filter 条件に一致なし。
    const noMatch = createElement('div', 'pkc-sidebar-filer-empty');
    noMatch.setAttribute('data-pkc-region', 'filer-sidebar-no-match');
    noMatch.textContent = rawQuery.trim().length > 0
      ? `「${rawQuery}」に一致なし`
      : '絞り込み条件に一致なし';
    sidebar.appendChild(noMatch);
  } else if (!filtering && visibleChildren.length === 0) {
    // Phase γ-A1:空スコープの案内。scoped 時は nav-up が戻る導線。
    const empty = createElement('div', 'pkc-sidebar-filer-empty');
    empty.textContent = scope ? 'このフォルダは空です' : '項目がありません';
    sidebar.appendChild(empty);
  } else if (!filtering) {
    // Phase γ-A1:操作ヒント(pgc-33 の DnD 着地で「ドラッグで移動」が有効)。
    const hint = createElement('div', 'pkc-sidebar-filer-hint');
    hint.setAttribute('data-pkc-region', 'filer-sidebar-hint');
    hint.textContent = 'ドラッグで移動 · ダブルクリックで別窓';
    sidebar.appendChild(hint);
  }

  return sidebar;
}

function renderSidebarImpl(
  state: AppState,
  sharedLinkIndex: LinkIndex | null = null,
  reuseEntryList: HTMLElement | null = null,
): HTMLElement {
  const sidebar = createElement('aside', 'pkc-sidebar');
  sidebar.setAttribute('data-pkc-region', 'sidebar');

  // pgc-237:userEntries は filter-cache で memoize 済 ── container ref で
  // re-render 跨ぎ cache hit、O(N) walk を skip。downstream の `applyFilters`
  // が mutable Entry[] を要求するため spread copy(memoize cache 自体は
  // readonly preserve、shallow copy のみ ── 中の Entry object refs は共有)。
  const allEntries: Entry[] = state.container
    ? [...getFilterIndexes(state.container).userEntries]
    : [];

  // Search input (always shown when entries exist)
  if (allEntries.length > 0) {
    const searchRow = createElement('div', 'pkc-search-row');

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = '🔍 全エントリを検索';
    searchInput.value = state.searchQuery;
    searchInput.setAttribute('data-pkc-field', 'search');
    searchInput.className = 'pkc-search-input';
    searchRow.appendChild(searchInput);

    if (state.searchQuery !== '' || state.archetypeFilter.size > 0) {
      const clearBtn = createElement('button', 'pkc-btn-clear');
      clearBtn.setAttribute('data-pkc-action', 'clear-filters');
      clearBtn.setAttribute('title', 'Clear search and filters');
      clearBtn.textContent = '×';
      searchRow.appendChild(clearBtn);
    }

    // Saved Searches v1: a single ★ button next to the search input
    // (2026-04-26 user audit: "検索窓横の星マークも２つあるのが意味
    // 不明"). Click → quick-save with an auto timestamp-based name
    // so the round trip "set filters → save → restore later" stays
    // one click. The legacy name-first prompt button was dropped to
    // remove the visual ambiguity of two adjacent star icons; users
    // who want a custom name can rename the saved search later
    // (spec follow-up §5.x — saved-searches rename UX).
    if (!state.readonly && !state.importPreview) {
      const saveBtn = createElement('button', 'pkc-btn-small pkc-btn-quick-save');
      saveBtn.setAttribute('data-pkc-action', 'quick-save-search');
      saveBtn.setAttribute('title', '現在の検索条件を保存（自動命名）');
      saveBtn.textContent = '★';
      searchRow.appendChild(saveBtn);
    }

    sidebar.appendChild(searchRow);

    // Archetype filter bar
    sidebar.appendChild(renderArchetypeFilter(state.archetypeFilter));

    // Sort controls
    sidebar.appendChild(renderSortControls(state.sortKey, state.sortDirection));
  }

  // Saved Searches Pane v1 — named snapshots of search/filter/sort
  // state. See docs/development/saved-searches-v1.md.
  {
    const savedPane = renderSavedSearchesPane(state);
    if (savedPane) sidebar.appendChild(savedPane);
  }

  // Recent Entries Pane v1 — derived-only list of the most recently
  // updated user entries. See docs/development/recent-entries-pane-v1.md.
  {
    // 2026-04-26 user audit: default Recent pane to collapsed so a
    // fresh sidebar fits the viewport without scrolling. Once the
    // user expands it, `state.recentPaneCollapsed` records the
    // explicit choice and is honored verbatim afterwards.
    const recentPane = renderRecentEntriesPane(allEntries, state.selectedLid, state.recentPaneCollapsed ?? true);
    if (recentPane) sidebar.appendChild(recentPane);
  }

  // 2026-04-27 user direction:「Show Only unused attachmentsもそうだ
  // けど、トグル自体を折りたたんで隠したうえで」 — collapse all of
  // the list-shape toggles into one `<details>` disclosure section
  // so the typical browse view stays clean. The section persists
  // its open/closed state via `state.advancedFiltersOpen` so it
  // survives the next dispatch's full-shell rebuild.
  const hasArchivedTodo = allEntries.some(
    (e) => e.archetype === 'todo' && parseTodoBody(e.body, e).archived,
  );
  const hasAttachment = allEntries.some((e) => e.archetype === 'attachment');
  const bucketTitles = new Set(Object.values(ARCHETYPE_SUBFOLDER_NAMES));
  const hasBucketFolder = !!state.container
    && state.container.entries.some(
      (e) => e.archetype === 'folder' && bucketTitles.has(e.title),
    );
  const filterIsActiveForToggle =
    state.searchQuery !== '' ||
    state.archetypeFilter.size > 0 ||
    (state.tagFilter?.size ?? 0) > 0 ||
    (state.colorTagFilter?.size ?? 0) > 0 ||
    state.categoricalPeerFilter !== null;
  const hasBucketedEntryInResults =
    filterIsActiveForToggle
    && !!state.container
    && (() => {
      const containerRef = state.container!;
      return allEntries.some((e) => {
        const parent = getStructuralParent(containerRef.relations, containerRef.entries, e.lid);
        return !!parent && parent.archetype === 'folder' && bucketTitles.has(parent.title);
      });
    })();
  const colorStrip = renderColorFilterStrip(allEntries, state.colorTagFilter ?? new Set());
  const hasColorsInUse = colorStrip !== null;
  const hasAnyToggle =
    hasArchivedTodo || hasAttachment || hasBucketFolder || hasBucketedEntryInResults || hasColorsInUse;
  if (hasAnyToggle) {
    const details = document.createElement('details');
    details.className = 'pkc-advanced-filters';
    details.setAttribute('data-pkc-region', 'advanced-filters');
    if (state.advancedFiltersOpen ?? false) {
      details.setAttribute('open', '');
    }
    const summary = document.createElement('summary');
    summary.className = 'pkc-advanced-filters-summary';
    summary.setAttribute('data-pkc-action', 'toggle-advanced-filters');
    summary.textContent = '⚙ 絞り込み';
    details.appendChild(summary);

    if (colorStrip) {
      // Color tag chip strip — first child so the visual filter axis
      // is at the top of the disclosure, ahead of the toggle list.
      details.appendChild(colorStrip);
    }

    if (hasArchivedTodo) {
      const toggle = createElement('label', 'pkc-show-archived-toggle');
      toggle.setAttribute('data-pkc-region', 'show-archived-toggle');
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = state.showArchived;
      check.setAttribute('data-pkc-action', 'toggle-show-archived');
      toggle.appendChild(check);
      const labelText = createElement('span', '');
      labelText.textContent = 'Show archived';
      toggle.appendChild(labelText);
      details.appendChild(toggle);
    }

    if (hasBucketFolder) {
      // Inverted UX: checked = "show ASSETS / TODOS folders in tree".
      const toggle = createElement('label', 'pkc-show-archived-toggle');
      toggle.setAttribute('data-pkc-region', 'tree-hide-buckets-toggle');
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = !(state.treeHideBuckets ?? true);
      check.setAttribute('data-pkc-action', 'toggle-tree-hide-buckets');
      toggle.appendChild(check);
      const labelText = createElement('span', '');
      labelText.textContent = 'Show ASSETS / TODOS folders';
      toggle.appendChild(labelText);
      details.appendChild(toggle);
    }

    if (hasBucketedEntryInResults) {
      // Inverted UX: checked = "show ASSETS / TODOS contents in
      // search results". Distinct from the tree-folder toggle —
      // user may want folder visibility OFF but search-result
      // visibility ON, or vice versa.
      const toggle = createElement('label', 'pkc-show-archived-toggle');
      toggle.setAttribute('data-pkc-region', 'search-hide-buckets-toggle');
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = !(state.searchHideBuckets ?? true);
      check.setAttribute('data-pkc-action', 'toggle-search-hide-buckets');
      toggle.appendChild(check);
      const labelText = createElement('span', '');
      labelText.textContent = 'Show ASSETS / TODOS in search results';
      toggle.appendChild(labelText);
      details.appendChild(toggle);
    }

    if (hasAttachment) {
      const unrefToggle = createElement('label', 'pkc-show-archived-toggle');
      unrefToggle.setAttribute('data-pkc-region', 'unreferenced-attachments-toggle');
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = state.unreferencedAttachmentsOnly ?? false;
      check.setAttribute('data-pkc-action', 'toggle-unreferenced-attachments');
      unrefToggle.appendChild(check);
      const labelText = createElement('span', '');
      labelText.textContent = 'Show only unused attachments';
      unrefToggle.appendChild(labelText);
      if (state.container && (state.unreferencedAttachmentsOnly ?? false)) {
        const count = collectUnreferencedAttachmentLids(state.container).size;
        const badge = createElement('span', 'pkc-unref-count');
        badge.textContent = ` (${count})`;
        unrefToggle.appendChild(badge);
      }
      details.appendChild(unrefToggle);
    }

    sidebar.appendChild(details);
  }

  // Active tag filter indicator (categorical relation peer).
  // The `tagFilter` state field was renamed to `categoricalPeerFilter`
  // post W1 Slice B; the user-visible label and data-pkc-action names
  // ("Tag:", "clear-tag-filter") are intentionally preserved so
  // the existing categorical-relation UI vocabulary stays stable.
  if (state.categoricalPeerFilter && state.container) {
    const tagEntry = state.container.entries.find((e) => e.lid === state.categoricalPeerFilter);
    if (tagEntry) {
      const indicator = createElement('div', 'pkc-tag-filter-indicator');
      indicator.setAttribute('data-pkc-region', 'tag-filter-indicator');

      const label = createElement('span', 'pkc-tag-filter-label');
      label.textContent = `Tag: ${tagEntry.title || '(untitled)'}`;
      indicator.appendChild(label);

      const clearBtn = createElement('button', 'pkc-btn-small');
      clearBtn.setAttribute('data-pkc-action', 'clear-tag-filter');
      clearBtn.setAttribute('title', 'Clear tag filter');
      clearBtn.textContent = '\u00d7';
      indicator.appendChild(clearBtn);

      sidebar.appendChild(indicator);
    }
  }

  // W1 Slice F-2 \u2014 free-form Tag filter indicator.
  // Color tag Slice 4 \u2014 Color filter chip indicator. Slice 4 ships
  // ZERO new CSS to stay under the 94 KB bundle.css budget; it
  // therefore reuses the existing `pkc-entry-tag-filter-*` classes
  // verbatim (chip shape, label, remove button, "Clear all" button
  // are visually identical). The label text differentiates the two
  // axes; `data-pkc-region` is distinct so test selectors stay
  // unambiguous.
  if ((state.colorTagFilter?.size ?? 0) > 0) {
    const activeColors = Array.from(state.colorTagFilter!);
    const indicator = createElement('div', 'pkc-entry-tag-filter');
    indicator.setAttribute('data-pkc-region', 'entry-color-filter');

    const label = createElement('span', 'pkc-entry-tag-filter-label');
    label.textContent = '\u30ab\u30e9\u30fc:';
    indicator.appendChild(label);

    for (const colorValue of activeColors) {
      const chip = createElement('span', 'pkc-entry-tag-filter-chip');
      chip.setAttribute('data-pkc-color-value', colorValue);

      const chipLabel = createElement('span', 'pkc-entry-tag-filter-chip-label');
      chipLabel.textContent = colorValue;
      chip.appendChild(chipLabel);

      const removeBtn = createElement('button', 'pkc-entry-tag-filter-remove');
      removeBtn.setAttribute('data-pkc-action', 'toggle-color-tag-filter');
      removeBtn.setAttribute('data-pkc-color', colorValue);
      removeBtn.setAttribute('title', `Remove filter: ${colorValue}`);
      removeBtn.textContent = '\u00d7';
      chip.appendChild(removeBtn);

      indicator.appendChild(chip);
    }

    if (activeColors.length >= 2) {
      const clearAllBtn = createElement('button', 'pkc-btn-small pkc-entry-tag-filter-clear-all');
      clearAllBtn.setAttribute('data-pkc-action', 'clear-color-tag-filter');
      clearAllBtn.setAttribute('title', 'Clear all Color filters');
      clearAllBtn.textContent = 'Clear all';
      indicator.appendChild(clearAllBtn);
    }

    sidebar.appendChild(indicator);
  }

  // Shown only when `state.tagFilter` has at least one value. Each
  // active value renders as a small chip; clicking its \u00d7 dispatches
  // TOGGLE_TAG_FILTER (idempotent remove since the value is already
  // in the filter). A "Clear all" button surfaces only when there
  // are \u2265 2 active values so the single-chip case keeps the UI
  // dense. The section uses distinct classes / DOM region /
  // action names from the categorical indicator above to keep
  // selectors unambiguous.
  if ((state.tagFilter?.size ?? 0) > 0) {
    const activeTags = Array.from(state.tagFilter!);

    const indicator = createElement('div', 'pkc-entry-tag-filter');
    indicator.setAttribute('data-pkc-region', 'entry-tag-filter');

    const label = createElement('span', 'pkc-entry-tag-filter-label');
    label.textContent = '\u30bf\u30b0:';
    indicator.appendChild(label);

    for (const tagValue of activeTags) {
      const chip = createElement('span', 'pkc-entry-tag-filter-chip');
      chip.setAttribute('data-pkc-entry-tag-value', tagValue);

      const chipLabel = createElement('span', 'pkc-entry-tag-filter-chip-label');
      chipLabel.textContent = tagValue;
      chip.appendChild(chipLabel);

      const removeBtn = createElement('button', 'pkc-entry-tag-filter-remove');
      // TOGGLE is idempotent \u2014 clicking an already-active value
      // removes it. A dedicated remove action would duplicate the
      // reducer branch without adding semantic clarity, so we
      // reuse toggle here.
      removeBtn.setAttribute('data-pkc-action', 'toggle-tag-filter');
      removeBtn.setAttribute('data-pkc-tag-value', tagValue);
      removeBtn.setAttribute('title', `Remove filter: ${tagValue}`);
      removeBtn.textContent = '\u00d7';
      chip.appendChild(removeBtn);

      indicator.appendChild(chip);
    }

    if (activeTags.length >= 2) {
      const clearAllBtn = createElement('button', 'pkc-btn-small pkc-entry-tag-filter-clear-all');
      clearAllBtn.setAttribute('data-pkc-action', 'clear-entry-tag-filter');
      clearAllBtn.setAttribute('title', 'Clear all Tag filters');
      clearAllBtn.textContent = 'Clear all';
      indicator.appendChild(clearAllBtn);
    }

    sidebar.appendChild(indicator);
  }

  // Pipeline: query → archetype → tag → categorical peer → archive → sort
  // Slice D (2026-04-23): Tag axis threaded through `applyFilters`
  // with AND-by-default semantics (see
  // `docs/spec/search-filter-semantics-v1.md` §4.2).
  // PR #182: outer `render:sidebar:filter-pipeline` wraps the whole
  // filter chain (applyFilters + categoricalPeer + showArchived +
  // searchHide + treeHide + unreferenced) so the bench can attribute
  // residual time to filter work versus sort / loop / DOM assemble.
  const endFilterPipeline = profileStart('render:sidebar:filter-pipeline');
  const endApplyFilters = profileStart('filter:applyFilters');
  let filtered = applyFilters(
    allEntries,
    state.searchQuery,
    state.archetypeFilter,
    state.tagFilter,
    state.colorTagFilter,
  );
  endApplyFilters();
  if (state.categoricalPeerFilter && state.container) {
    filtered = filterByTag(filtered, state.container.relations, state.categoricalPeerFilter);
  }
  if (!state.showArchived) {
    filtered = filtered.filter((e) => {
      if (e.archetype !== 'todo') return true;
      return !parseTodoBody(e.body, e).archived;
    });
  }
  // Hide entries inside auto-bucket folders (ASSETS / TODOS) from
  // search-result lists by default. Only kicks in when a filter is
  // active — tree mode and unfiltered list both keep showing them.
  // Spec: user direction 2026-04-26
  // 「ASSETSとTODOSは検索オプションでデフォでハイドして」.
  const filterIsActive =
    state.searchQuery !== '' ||
    state.archetypeFilter.size > 0 ||
    (state.tagFilter?.size ?? 0) > 0 ||
    (state.colorTagFilter?.size ?? 0) > 0 ||
    state.categoricalPeerFilter !== null;
  if (filterIsActive && (state.searchHideBuckets ?? true) && state.container) {
    // PR #189: memoized — bucketChildLids is a Set built once per
    // container ref (not per filter call). Pre-PR-189 ran an
    // O(R) `getStructuralParent` walk per entry per render.
    const { bucketChildLids } = getFilterIndexes(state.container);
    if (bucketChildLids.size > 0) {
      filtered = filtered.filter((e) => !bucketChildLids.has(e.lid));
    }
  }

  // Tree-hide-buckets: by default the entries list (both tree and
  // flat modes) hides ASSETS / TODOS bucket folders AND every
  // entry inside them. Auto-placement keeps the buckets full of
  // attachments and todos that the user normally doesn't need to
  // see — the folders themselves are clutter for browsing flow.
  // Spec: user direction 2026-04-27
  // 「フォルダすらもハイドする感じです」.
  // Bypassed by the unreferenced-attachments lens (which is
  // intentionally about surfacing bucket-routed candidates).
  if (
    (state.treeHideBuckets ?? true)
    && !(state.unreferencedAttachmentsOnly ?? false)
    && state.container
  ) {
    // PR #189: memoized — hiddenBucketLids includes bucket folders
    // AND their transitive descendants, computed once per container
    // ref. Pre-PR-189 ran the walk per render.
    const { hiddenBucketLids } = getFilterIndexes(state.container);
    if (hiddenBucketLids.size > 0) {
      filtered = filtered.filter((e) => !hiddenBucketLids.has(e.lid));
    }
  }

  // Unreferenced-attachments cleanup filter. Active only when the
  // user explicitly flipped the toggle — this is a destructive-
  // workflow lens, not a default view. Restricts the list to
  // attachment entries that nothing else points at, so the user
  // can multi-select + bulk-delete in one pass.
  if ((state.unreferencedAttachmentsOnly ?? false) && state.container) {
    // PR #189: memoized — same Set reused across keystrokes /
    // archetype toggles within the same container snapshot.
    const { unreferencedAttachmentLids } = getFilterIndexes(state.container);
    filtered = filtered.filter((e) => unreferencedAttachmentLids.has(e.lid));
  }
  endFilterPipeline();
  // C-2 v1 (2026-04-17): manual mode routes through applyManualOrder
  // using `container.meta.entry_order` (contract §2.2). Non-manual
  // modes fall through to the existing stable temporal/title sort.
  const endSort = profileStart('render:sidebar:sort');
  const entries = state.sortKey === 'manual'
    ? applyManualOrder(filtered, state.container?.meta.entry_order ?? [])
    : sortEntries(filtered, state.sortKey, state.sortDirection);
  endSort();

  // Result count (shown when any filter is active)
  if (allEntries.length > 0 && (state.searchQuery !== '' || state.archetypeFilter.size > 0 || (state.tagFilter?.size ?? 0) > 0 || (state.colorTagFilter?.size ?? 0) > 0 || state.categoricalPeerFilter !== null)) {
    const count = createElement('div', 'pkc-result-count');
    count.setAttribute('data-pkc-region', 'result-count');
    count.textContent = `${entries.length} / ${allEntries.length} entries`;
    sidebar.appendChild(count);
  }

  if (allEntries.length === 0) {
    const empty = createElement('div', 'pkc-empty pkc-guidance');
    empty.setAttribute('data-pkc-region', 'empty-guidance');
    if (state.phase === 'ready' && !state.readonly) {
      // 2026-04-26 mobile redesign — branch the guidance text on
      // viewport because the iPhone shell has neither the desktop
      // header's "+ buttons" nor a visible "center pane". Pointing
      // at the ✏ Compose button + ☰ Menu drawer matches the
      // mobile chrome the user actually sees, so the message
      // becomes actionable instead of misleading. Desktop / tablet
      // (matchMedia returns false) keep the legacy hint.
      const isPhone =
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(pointer: coarse) and (max-width: 640px)').matches;
      empty.innerHTML = isPhone
        ? 'まだエントリがありません。<br>右上の <strong>✏ Compose</strong> をタップして最初のエントリを作成、<br>または <strong>☰ Menu</strong> から他のアーキタイプを選択。'
        : 'まだエントリがありません。<br>上部の <strong>+ ボタン</strong> で作成するか、<br>中央ペインに <strong>ファイルをドロップ</strong> してください。';
    } else {
      empty.textContent = 'No entries in this container.';
    }
    sidebar.appendChild(empty);
    sidebar.appendChild(renderSidebarDropZone(state));
    return sidebar;
  }

  if (entries.length === 0) {
    const empty = createElement('div', 'pkc-empty pkc-guidance');
    empty.setAttribute('data-pkc-region', 'empty-guidance');
    empty.textContent = '絞り込み条件に一致なし。検索条件を見直してください。';
    sidebar.appendChild(empty);
    sidebar.appendChild(renderSidebarDropZone(state));
    return sidebar;
  }

  // 🔴 行リストの使い回し(2026-07-26)。
  //
  // `phase` が変わると render scope は無条件に 'full' になる(render-scope.ts:183)。
  // 編集の開始と確定がそれで、**1 編集につき 5000 行のサイドバーを 2 回**
  // 作り直していた。long task を直接測ると **1 編集あたり約 670 ms** の
  // メインスレッド停止で、保存の寄与は −16 ms(= ほぼゼロ)だった。
  // 体感を殺していたのは保存ではなく描画である。
  //
  // 行の内容は `phase` に依存しない(サイドバーで phase を読む 4 箇所は
  // すべてこのループの外)。よって既存の `<ul>` をそのまま差し込み、
  // サイドバーの残りは従来どおり組み直す ── **挙動は一切変えずに** O(N) が消える。
  // 使い回してよいかの判定は `canReuseEntryList`(保守的・迷ったら false)。
  if (reuseEntryList) {
    sidebar.appendChild(reuseEntryList);
  } else {
    const list = createElement('ul', 'pkc-entry-list');
    // PR-GG (2026-05-06): mark the entry-list as a scroll region so
    // render-continuity capture/restore preserves it across full
    // re-renders. Critical: the `<aside class="pkc-sidebar">` wrapper
    // never overflows because the entry-list is `flex:1; overflow-y:
    // auto` — the user's actual scroll lives on this UL, not on the
    // outer sidebar. Without this attribute, every dispatch silently
    // wiped the sidebar's scroll position back to 0, manifesting as
    // "大量のエントリでクリックすると左ペインが上に戻る".
    list.setAttribute('data-pkc-region', 'entry-list');
    // #932: opt-in 小字 + 折り返し表示(長いエントリ名対策)。class は行の
    // memo 対象外の親 UL に付けるので、flag flip が既存 memo 行にも即効く。
    if (shellCompactEntryLabelsEnabled()) list.classList.add('pkc-compact-labels');
    const hasActiveFilter = state.searchQuery !== '' || state.archetypeFilter.size > 0 || (state.tagFilter?.size ?? 0) > 0 || (state.colorTagFilter?.size ?? 0) > 0 || state.categoricalPeerFilter !== null || (state.unreferencedAttachmentsOnly ?? false);

    // v1 backlink count badge: per-target count map. PR #192 routes
    // through `getFilterIndexes` so the O(R) walk is cached by
    // container ref — search keystrokes no longer pay it. Same source
    // and contract as `buildInboundCountMap`. See
    // docs/development/sidebar-backlink-badge-v1.md.
    const filterIndexes = state.container ? getFilterIndexes(state.container) : null;
    const backlinkCounts = filterIndexes?.backlinkCounts
      ?? buildInboundCountMap(state.container?.relations ?? []);
    // v1 orphan detection: lids appearing in ANY relation. PR #192
    // also routes through the same cache.
    const connectedLids = filterIndexes?.connectedLids
      ?? buildConnectedLidSet(state.container?.relations ?? []);
    // v3 connectedness sets (Unified Orphan Detection, S4). Additive layer
    // built alongside the v1 helpers — v1 `connectedLids` stays authoritative
    // for `.pkc-orphan-marker` / `data-pkc-orphan`; v3 sets drive the new
    // `data-pkc-connectedness` attribute and `.pkc-unconnected-marker`. See
    // docs/development/unified-orphan-detection-v3-contract.md §2.3 / §4.4.
    // PR #179: memoized — same container ⇒ cached graph traversal
    // result reused. Falls through to a fresh build when sharedLinkIndex
    // is missing because the per-render memo is keyed off container
    // alone and is consistent with whichever linkIndex memo returned.
    const connectednessSets: ConnectednessSets | null = state.container
      ? memoizedBuildConnectednessSets(state.container, sharedLinkIndex ?? memoizedBuildLinkIndex(state.container))
      : null;

    // L3-S2: この描画で並べた entry 行の lid を**描画順**で集める。
    // 消費側(Shift+click 範囲選択 / ↑↓ ナビ)が DOM を走査して順序を
    // 導出するのをやめるため ── 窓化すると DOM に無い行が出てくる。
    //
    // 🔑 窓化しても、ここに入るのは **論理行の全件**である(窓の中だけでは
    //    ない)。これが S2 を前工事にした理由そのもの ── 消費側は「画面に
    //    並んでいる全行の順序」を必要としており、DOM に居るかどうかは別問題。
    const visibleLids: string[] = [];

    // L3-S5: 窓化してよい場面か。**検索中は窓化しない** ── sub-location 行が
    // 混ざって「1 entry = 1 行」が崩れ、窓の index 計算が成立しないため。
    const virtualizable = sidebarVirtualListEnabled() && state.searchQuery === '';
    /** 窓化の材料(attach 後の後処理と scroll handler が使う)。 */
    let windowPlan: SidebarWindowContext | null = null;

    if (hasActiveFilter || !state.container) {
      // Flat mode when filters are active (tree doesn't make sense for search results).
      // PR #179: memoize per-entry rows so a search-keystroke that
      // narrows the visible list does not rebuild markup for rows it
      // already produced. Cache invalidation hooks off container
      // reference equality — see `getOrCreateMemoizedEntryItem`.
      clearEntryRowMemoIfStale(state.container ?? null);
      const query = state.searchQuery.trim();
      // PR #182: split flat-loop into row-construction vs sub-location
      // hit scanning. The former is dominated by memo hits + DOM
      // append; the latter is the body-scan path that was the prime
      // suspect in PR #179's residual cost.
      const endFlatLoop = profileStart('render:sidebar:flat-loop');
      let endSubLocation: (() => void) | null = null;
      // #938 R9: sub-location 展開は先頭 N 行に限定(可視件数限定)。
      // flat list は仮想化されていないため、hit を持つ entry が多い
      // container では走査 + hit 行構築がキーストロークごとに件数比例で
      // 積み上がる。ユーザーが目視するのはリスト先頭のみ — 上限以降の
      // entry は行自体は従来どおり表示し、sub-location 展開だけ省略。
      const sublocRowCap = searchSublocScanMaxRows();
      let sublocRowsScanned = 0;
      // L3-S5: 窓化は**描画後の後処理**でやる(ここでは全件描いて材料だけ残す)。
      // 単位行高は attach 済みの UL からしか実測できず、`content-visibility` の
      // 行は未表示だと嘘の高さを返すので、「描く前に窓を決める」ができない。
      if (virtualizable && entries.length >= SIDEBAR_VIRTUAL_MIN_ROWS) {
        windowPlan = { kind: 'flat', rows: entries, backlinkCounts, connectedLids, connectednessSets };
      }
      for (const entry of entries) {
        visibleLids.push(entry.lid);
        list.appendChild(
          getOrCreateMemoizedEntryItem(
            entry,
            state,
            backlinkCounts,
            connectedLids,
            connectednessSets,
          ),
        );
        // S-18 (A-4 FULL, 2026-04-14): when the user has typed a
        // search query AND the entry has sub-location matches, expand
        // them as clickable sidebar rows that scroll to the exact spot
        // on click. Only runs for TEXT / TEXTLOG (the indexer returns
        // [] for other archetypes). Limited to the top 5 matches per
        // entry by the indexer's maxPerEntry default — keeps the list
        // scannable on frequent terms.
        if (query !== '' && sublocRowsScanned < sublocRowCap) {
          sublocRowsScanned++;
          if (!endSubLocation) endSubLocation = profileStart('render:sidebar:sublocation-scan');
          const hits = findSubLocationHits(entry, query);
          for (const hit of hits) {
            list.appendChild(renderSubLocationItem(hit));
          }
        }
      }
      endSubLocation?.();
      endFlatLoop();
    } else {
      // Tree mode: build from structural relations
      // #938 R9: tree 行 memo(flat 行の PR #179 memo と同 doctrine)。
      clearTreeRowMemoIfStale(state.container);
      const endBuildTree = profileStart('tree:buildTree');
      const tree = buildTree(entries, state.container.relations);
      endBuildTree();
      // C-2 v1 manual mode: buildTree orders children by relation
      // iteration order, not by `entries` position. Reorder each node's
      // children so folder-child ordering reflects `entry_order`.
      // PR-W24 v6(user 報告「左ペイン要素並び替え 1 階層しか sort 対応で
      // バラバラ」):manual 以外の sort key で **各 level 内で sort** + folder
      // を先頭に grouping(`sortTreeNodes` 再帰)。これにより manual の
      // 章エントリ + ASSETS folder + 画像 attachment が hierarchical に整理。
      const displayTree = state.sortKey === 'manual'
        ? reorderTreeByEntries(tree, entries)
        : sortTreeNodes(tree, state.sortKey, state.sortDirection);
      const endTreeLoop = profileStart('render:sidebar:tree-loop');
      if (virtualizable) {
        const flatNodes = flattenDisplayTree(displayTree, state);
        if (flatNodes.length >= SIDEBAR_VIRTUAL_MIN_ROWS) {
          windowPlan = { kind: 'tree', rows: flatNodes, backlinkCounts, connectedLids, connectednessSets };
        }
      }
      for (const node of displayTree) {
        renderTreeNode(node, list, state, backlinkCounts, connectedLids, connectednessSets, visibleLids);
      }
      endTreeLoop();
    }
    // B18: 今回描いた行以外の memo を捨てる(flat / tree どちらの枝を通っても
    // 1 回。枝ごとに書くと、モード切替で反対側の memo が残る)。
    pruneRowMemos();
    // L3-S2/S1: 描画順を UL に記録(+ 論理行数 `data-pkc-row-count`)。
    recordVisibleOrder(list, visibleLids);
    // L3-S5: 窓化の材料を UL に預ける(実際の窓化は attach 後の後処理)。
    setSidebarWindowContext(list, windowPlan);
    sidebar.appendChild(list);
  }

  // Root drop zone: drop here to move entry to root level
  if (state.phase === 'ready' && !state.readonly) {
    const rootDrop = createElement('div', 'pkc-root-drop-zone');
    rootDrop.setAttribute('data-pkc-drop-target', 'root');
    rootDrop.textContent = '↑ ここにドロップでルートへ';
    sidebar.appendChild(rootDrop);
  }

  // Interaction hints (non-intrusive)
  if (entries.length > 0) {
    const hints = createElement('div', 'pkc-interaction-hints');
    hints.setAttribute('data-pkc-region', 'interaction-hints');
    hints.innerHTML = [
      '<span>ドラッグで移動</span>',
      '<span>ダブルクリックで別窓</span>',
      '<span>右クリックでメニュー</span>',
      '<span>Ctrl+クリックで複数選択</span>',
    ].join(' · ');
    sidebar.appendChild(hints);
  }

  // PR-Δ25 (2026-05-07、user 訂正「Filer で選択時に左ペインに一括操作 UI
  // が出るのは誤り、Filer 側に表示すべき」):viewMode === 'filer' のとき
  // sidebar には bar を出さない(filer view 側で同 helper を呼んで filer
  // 内部に表示する)。それ以外の view では従来通り sidebar 表示。
  // PR-Δ30 (2026-05-07):graph view も同様に view 内で表示するため
  // sidebar 側は skip。
  if (
    state.multiSelectedLids.length > 0
    && !state.readonly
    && state.viewMode !== 'filer'
  ) {
    const bar = createElement('div', 'pkc-multi-action-bar');
    bar.setAttribute('data-pkc-region', 'multi-action-bar');

    const info = createElement('span', 'pkc-multi-action-info');
    info.textContent = `${state.multiSelectedLids.length} selected`;
    bar.appendChild(info);

    const deleteBtn = createElement('button', 'pkc-btn-small pkc-btn-danger');
    deleteBtn.setAttribute('data-pkc-action', 'bulk-delete');
    deleteBtn.textContent = 'Delete';
    bar.appendChild(deleteBtn);

    // Folder move targets
    if (state.container) {
      const folders = state.container.entries.filter((e) => e.archetype === 'folder' && !state.multiSelectedLids.includes(e.lid));
      if (folders.length > 0) {
        const moveSelect = document.createElement('select');
        moveSelect.className = 'pkc-multi-action-move';
        moveSelect.setAttribute('data-pkc-action', 'bulk-move-select');
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'Move to...';
        placeholder.disabled = true;
        placeholder.selected = true;
        moveSelect.appendChild(placeholder);
        const rootOpt = document.createElement('option');
        rootOpt.value = '__root__';
        rootOpt.textContent = '/ (Root)';
        moveSelect.appendChild(rootOpt);
        for (const f of folders) {
          const opt = document.createElement('option');
          opt.value = f.lid;
          opt.textContent = `📁 ${f.title || '(untitled)'}`;
          moveSelect.appendChild(opt);
        }
        bar.appendChild(moveSelect);
      }
    }

    // Bulk status change (only when selection contains todos)
    if (state.container) {
      const hasTodo = state.multiSelectedLids.some((lid) => {
        const e = state.container!.entries.find((en) => en.lid === lid);
        return e?.archetype === 'todo';
      });
      if (hasTodo) {
        const statusSelect = document.createElement('select');
        statusSelect.className = 'pkc-multi-action-status';
        statusSelect.setAttribute('data-pkc-action', 'bulk-set-status');
        const ph = document.createElement('option');
        ph.value = '';
        ph.textContent = 'Status...';
        ph.disabled = true;
        ph.selected = true;
        statusSelect.appendChild(ph);
        for (const [val, label] of [['open', 'Open'], ['done', 'Done']] as const) {
          const opt = document.createElement('option');
          opt.value = val;
          opt.textContent = label;
          statusSelect.appendChild(opt);
        }
        bar.appendChild(statusSelect);

        const dateInput = document.createElement('input');
        dateInput.type = 'date';
        dateInput.className = 'pkc-multi-action-date';
        dateInput.setAttribute('data-pkc-action', 'bulk-set-date');
        bar.appendChild(dateInput);

        const clearDateBtn = createElement('button', 'pkc-btn-small');
        clearDateBtn.setAttribute('data-pkc-action', 'bulk-clear-date');
        clearDateBtn.textContent = '✕ date';
        bar.appendChild(clearDateBtn);
      }
    }

    // PR-Δ5 (2026-05-07、user 報告「複数エントリに同一のタグやカラー
    // タグ、リレーションを与えるなどの一括操作要素」):bulk tag /
    // color-tag application。reducer は ADD_ENTRY_TAG / SET_ENTRY_COLOR
    // を 1 entry ずつ叩くため、変更しない field は完全に保護される。
    if (state.container) {
      // Bulk add tag
      const tagInput = document.createElement('input');
      tagInput.type = 'text';
      tagInput.className = 'pkc-multi-action-tag-input';
      tagInput.placeholder = 'タグ追加 (Enter)';
      tagInput.setAttribute('data-pkc-action', 'bulk-add-tag-input');
      tagInput.setAttribute('data-pkc-field', 'bulk-add-tag');
      tagInput.title = '選択中の全エントリに同じタグを追加(他の field は不変)';
      bar.appendChild(tagInput);

      // Bulk color-tag selector
      const colorSelect = document.createElement('select');
      colorSelect.className = 'pkc-multi-action-color';
      colorSelect.setAttribute('data-pkc-action', 'bulk-set-color-tag');
      colorSelect.title = '選択中の全エントリに同じカラータグを設定';
      const cph = document.createElement('option');
      cph.value = '';
      cph.textContent = 'Color...';
      cph.disabled = true;
      cph.selected = true;
      colorSelect.appendChild(cph);
      for (const c of ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'gray']) {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        colorSelect.appendChild(opt);
      }
      const clearOpt = document.createElement('option');
      clearOpt.value = '__none__';
      clearOpt.textContent = '✕ 解除';
      colorSelect.appendChild(clearOpt);
      bar.appendChild(colorSelect);

      // Bulk add structural-relation (move-into-folder の semantic は別、
      // ここは generic relation-from-source-X-to-each。Phase 1 は
      // structural / categorical / semantic の relation kind 選択 +
      // target lid 選択を 2 select で構成、target は selectable folder 等
      // から拾う。ロジック簡素化のため source-X-to-each 形式 (X は select
      // から、each は state.multiSelectedLids 全件)。
      const relTargetSelect = document.createElement('select');
      relTargetSelect.className = 'pkc-multi-action-rel-target';
      relTargetSelect.setAttribute('data-pkc-action', 'bulk-add-relation-target');
      relTargetSelect.title = '選択中の全エントリに同じ参照先を関連付け';
      const rph = document.createElement('option');
      rph.value = '';
      rph.textContent = 'Relate to...';
      rph.disabled = true;
      rph.selected = true;
      relTargetSelect.appendChild(rph);
      // 関連先候補は selectedLid 以外の全 entry(多すぎる場合は folder
      // のみに絞る)。30+ entry を全部出すと UX が悪いため、現状は
      // folder のみ列挙。
      const relCandidates = state.container.entries.filter(
        (e) => e.archetype === 'folder' && !state.multiSelectedLids.includes(e.lid),
      );
      for (const c of relCandidates) {
        const opt = document.createElement('option');
        opt.value = c.lid;
        opt.textContent = `📁 ${c.title || '(untitled)'}`;
        relTargetSelect.appendChild(opt);
      }
      bar.appendChild(relTargetSelect);
    }

    const clearBtn = createElement('button', 'pkc-btn-small');
    clearBtn.setAttribute('data-pkc-action', 'clear-multi-select');
    clearBtn.textContent = 'Clear';
    bar.appendChild(clearBtn);

    sidebar.appendChild(bar);
  }

  // Restore candidates (deleted entries with revisions) — collapsible, closed by default
  if (state.container && state.phase === 'ready') {
    const rawCandidates = getRestoreCandidates(state.container);
    // 2026-04-26 user audit: the restore-candidates pane was
    // surfacing deleted `__settings__` / `__about__` revisions
    // ("システム設定が見えています"). System entries are
    // app-managed — users never deleted them on purpose and
    // restoring them only re-creates the silent infrastructure
    // record. Filter them out so the trash only shows actual
    // user content the user can recognise.
    const candidates = rawCandidates.filter((rev) => {
      if (isReservedLid(rev.entry_lid)) return false;
      const parsed = parseRevisionSnapshot(rev);
      if (parsed && isSystemArchetype(parsed.archetype)) return false;
      return true;
    });
    if (candidates.length > 0) {
      const details = document.createElement('details');
      details.className = 'pkc-restore-candidates';
      details.setAttribute('data-pkc-region', 'restore-candidates');

      const summary = document.createElement('summary');
      summary.className = 'pkc-restore-heading';
      summary.textContent = `🗑️ Deleted (${candidates.length})`;
      details.appendChild(summary);

      // Empty Trash button
      if (!state.readonly) {
        const purgeBtn = createElement('button', 'pkc-btn-small pkc-btn-danger');
        purgeBtn.setAttribute('data-pkc-action', 'purge-trash');
        purgeBtn.setAttribute('title', 'Permanently delete all items in trash');
        purgeBtn.textContent = 'Empty Trash';
        details.appendChild(purgeBtn);
      }

      // Tier 2-2: pre-compute which deleted-entry revisions belong to
      // a BULK_DELETE group so we can render a grouped "Restore bulk"
      // affordance. Only bulk_ids whose group has size > 1 within the
      // currently-visible trash list count — a solo deleted entry is
      // indistinguishable from a regular DELETE_ENTRY for UX purposes.
      const bulkSizeInTrash = new Map<string, number>();
      for (const rev of candidates) {
        if (!rev.bulk_id) continue;
        bulkSizeInTrash.set(rev.bulk_id, (bulkSizeInTrash.get(rev.bulk_id) ?? 0) + 1);
      }
      const shownBulkIds = new Set<string>();

      for (const rev of candidates) {
        const parsed = parseRevisionSnapshot(rev);
        const item = createElement('div', 'pkc-restore-item');
        item.setAttribute('data-pkc-revision-id', rev.id);
        item.setAttribute('data-pkc-entry-lid', rev.entry_lid);

        const info = createElement('div', 'pkc-restore-info');

        const title = createElement('span', 'pkc-restore-title');
        title.textContent = parsed?.title ?? '(untitled)';
        info.appendChild(title);

        if (parsed) {
          const archetype = createElement('span', 'pkc-archetype-badge');
          archetype.textContent = `${archetypeIcon(parsed.archetype as ArchetypeId)} ${archetypeLabel(parsed.archetype as ArchetypeId)}`;
          info.appendChild(archetype);
        }

        const deletedAt = createElement('span', 'pkc-restore-timestamp');
        deletedAt.textContent = `deleted ${formatTimestamp(rev.created_at)}`;
        info.appendChild(deletedAt);

        item.appendChild(info);

        const btn = createElement('button', 'pkc-btn-small');
        btn.setAttribute('data-pkc-action', 'restore-entry');
        btn.setAttribute('data-pkc-lid', rev.entry_lid);
        btn.setAttribute('data-pkc-revision-id', rev.id);
        btn.setAttribute('title', 'Restore this deleted entry');
        btn.textContent = 'Restore';
        item.appendChild(btn);

        // Tier 2-2: show "Restore bulk (N)" next to Restore on the
        // FIRST item of each bulk group. Subsequent items in the
        // same group still get their per-item Restore but skip the
        // bulk affordance to keep the list readable.
        if (
          !state.readonly
          && rev.bulk_id
          && (bulkSizeInTrash.get(rev.bulk_id) ?? 0) > 1
          && !shownBulkIds.has(rev.bulk_id)
        ) {
          const bulkSize = bulkSizeInTrash.get(rev.bulk_id)!;
          const bulkBtn = createElement('button', 'pkc-btn-small');
          bulkBtn.setAttribute('data-pkc-action', 'restore-bulk');
          bulkBtn.setAttribute('data-pkc-bulk-id', rev.bulk_id);
          bulkBtn.setAttribute('data-pkc-bulk-size', String(bulkSize));
          bulkBtn.setAttribute(
            'title',
            `Restore all ${bulkSize} entries that were deleted together`,
          );
          bulkBtn.textContent = `Restore bulk (${bulkSize})`;
          item.appendChild(bulkBtn);
          shownBulkIds.add(rev.bulk_id);
        }

        details.appendChild(item);
      }

      sidebar.appendChild(details);
    }
  }

  // G-3: persistent file drop zone at sidebar bottom (FI-04).
  // Always rendered; active only when phase === 'ready' and not readonly.
  sidebar.appendChild(renderSidebarDropZone(state));

  return sidebar;
}

/**
 * FI-04 G-3: Persistent file drop zone rendered at the bottom of the sidebar.
 * Uses data-pkc-region="sidebar-file-drop-zone" to avoid querySelector ordering
 * conflicts with center-pane zones. The action-binder drop handlers match both
 * "file-drop-zone" and "sidebar-file-drop-zone" via a combined CSS selector.
 */
function renderSidebarDropZone(state: AppState): HTMLElement {
  const zone = createElement('div', 'pkc-drop-zone pkc-drop-zone-sidebar');
  zone.setAttribute('data-pkc-region', 'sidebar-file-drop-zone');
  zone.setAttribute('data-pkc-persistent-drop-zone', 'true');

  const isActive = state.phase === 'ready' && !state.readonly;
  if (!isActive) {
    zone.setAttribute('data-pkc-inactive', 'true');
  }

  const label = createElement('span', 'pkc-drop-zone-label');
  label.textContent = '📎 ここにファイルをドロップ';
  zone.appendChild(label);

  return zone;
}

/**
 * C-2 v1 (2026-04-17): reorder tree children so that folder children
 * follow the order of `entries` (i.e., `entry_order`). `buildTree`
 * preserves root iteration order but orders children by structural
 * relation iteration; under manual mode we need both levels to match
 * `entries`. Returns a new tree; does not mutate input nodes.
 */
function reorderTreeByEntries(tree: TreeNode[], entries: readonly Entry[]): TreeNode[] {
  const rank = new Map<string, number>();
  entries.forEach((e, i) => rank.set(e.lid, i));
  const INF = entries.length + 1;
  function walk(nodes: TreeNode[]): TreeNode[] {
    const sorted = [...nodes].sort(
      (a, b) => (rank.get(a.entry.lid) ?? INF) - (rank.get(b.entry.lid) ?? INF),
    );
    return sorted.map((n) => ({ ...n, children: walk(n.children) }));
  }
  return walk(tree);
}

// ── #938 R9: tree-row memoization ────────────────────────────────
//
// flat 行は PR #179 で memo 済だったが、tree 行(renderTreeNode)は
// 「装飾の invalidation matrix が複雑」として対象外のまま残り、filter
// 無しの full render(c-5000 で 60-67ms)の主コストだった。装飾が依存
// する軸は実際には有限で、すべて安価に比較できる:
//
//   - depth(padding)                → tree 形状 = relations = container ref
//     で不変だが、保守的に param 比較にも含める
//   - collapsed(chevron / attr)     → state.collapsedFolders
//   - childCount(folder count 表示) → tree 形状
//   - hasMoveButtons(manual mode の ↑↓ は選択行のみ)→ selectedLid ほか
//
// これらを memo entry に記録し、1 つでも違えばその行だけ rebuild する。
// container ref 変化は flat memo と同じく全 invalidate。選択 highlight
// は flat と同じ post-pass(`applyEntryRowSelectionAttrs`)。
interface TreeRowMemoEntry {
  li: HTMLElement;
  depth: number;
  collapsed: boolean;
  childCount: number;
  /**
   * B1(視覚監査 2026-07-25):階層 cap の打ち切り件数も行の見た目
   * (子件数の表示 + 「…N」marker)を決めるので memo key に含める。
   * ここを足し忘れると型 error も test failure も出ないまま古い行 DOM が
   * 再利用され、「機能は直ったのに画面が変わらない」事故になる。
   */
  truncatedChildCount: number;
  hasMoveButtons: boolean;
  /**
   * γ-A3 の「別ウィンドウで編集中」marker(markChildWindowItems)は行
   * subtree の title を上書きする。in-window ⇄ 通常の遷移で行を rebuild
   * し、folder toggle 等の元 title を確実に復元するため param に含める。
   */
  inWindow: boolean;
  /** 行が読む container 由来の派生値の指紋。`derivedRowFingerprint` 参照。 */
  derived: string;
}

/**
 * 🔴 **WeakMap → Map + 描画ごとの prune**(B18、2026-07-27)。
 *
 * WeakMap のキーは Entry なので、**Entry が生きている限り行 DOM が生き続ける**。
 * Entry は container の寿命ぶん生きるから、これは事実上「一度でも描画された行の
 * DOM を永久に持つ」と同じだった。#1031 で container 参照による全 invalidate を
 * やめた(それ自体は正しい ── 1 文字の編集で 5000 行を作り直していた)結果、
 * 溜め込みだけが残った形になる。
 *
 * 実測(c-5000 / 検索条件を 4 回変えて戻す / 強制 GC 後):
 *   jsHeap  13.4 → 16.2 MB(+2.8MB)だが **nodes 40,527 → 73,136(+32,609)**。
 *   画面に出ているのは 100 行。JS heap で見ると小さく見えるが、実体は
 *   3.2 万ノードの detached DOM である(B1 の計器で初めて正しい単位で見えた)。
 *
 * 直し方: **描画のたびに「今回描いた行」以外を捨てる**。memo の保持は
 * 常に**画面に付いている行と一致**し、detached が積まれなくなる。
 * 速度の性質は保つ ── #1031 が守りたかったのは「編集確定 → 同じ一覧を再描画」で
 * あって、そこは 100% hit のまま(prune は今回描いた行を残すため)。
 * 絞り込みを A→B→A と往復したときだけ A を作り直す = cold 描画 1 回ぶん。
 */
let treeRowMemo = new Map<Entry, TreeRowMemoEntry>();

/**
 * この描画パスで実際に使った Entry。パス終端の `pruneRowMemos()` で
 * これ以外の memo を落とす。
 */
const rowMemoTouched = new Set<Entry>();

/** 今回の描画で使わなかった行 memo を捨てる(detached DOM を溜めない)。 */
function pruneRowMemos(): void {
  for (const key of entryRowMemo.keys()) {
    if (!rowMemoTouched.has(key)) entryRowMemo.delete(key);
  }
  for (const key of treeRowMemo.keys()) {
    if (!rowMemoTouched.has(key)) treeRowMemo.delete(key);
  }
  rowMemoTouched.clear();
}

/** 計器: 行 memo が保持している行数(常駐の pin 用)。 */
export function __rowMemoSize(): { flat: number; tree: number } {
  return { flat: entryRowMemo.size, tree: treeRowMemo.size };
}

function clearTreeRowMemoIfStale(
  container: import('@core/model/container').Container | null,
): void {
  // 2026-07-26: flat memo と同じく **container 参照での全 invalidate をやめた**。
  // 派生値は `derivedRowFingerprint` が行ごとに比較する。
  void container;
}

/** manual mode の ↑↓ button gate(renderEntryItem 内の条件の mirror)。 */
function treeRowHasMoveButtons(entry: Entry, state: AppState): boolean {
  return (
    entry.lid === state.selectedLid
    && state.sortKey === 'manual'
    && state.viewMode === 'detail'
    && !state.readonly
    && state.importPreview === null
    && state.batchImportPreview === null
  );
}

/**
 * 行が読む「他行にも波及しうる派生値」の指紋(2026-07-26)。
 *
 * 従来、行 memo は **container の参照が変わると全部捨てて**いた
 * (「relations / revisions / connectedness の派生値が全行で古くなるから」)。
 * ところが本文を 1 文字直すだけでも container 参照は変わるので、
 * **編集の確定のたびに全行が作り直されていた**。
 *
 * 実測(N=5000、Performance.getMetrics で Script / Layout / Style を分離):
 *   取消(保存なし) Script  89 ms
 *   確定(保存あり) Script 195 ms   ← 差 106 ms が行の作り直し
 *
 * 派生値は **行ごとに安く比較できる**。指紋を memo に載せて 1 つでも違えば
 * その行だけ作り直す ── treeRowMemo が depth / collapsed などで既にやっている
 * のと同じ方式を、container 由来の値にも広げる。
 *
 * ⚠ **ここに載せ忘れた入力は「古い行が残る」= 画面が嘘をつく事故になる**
 *   (型 error も test failure も出ない)。`renderEntryItem` が読む
 *   container 由来の値を列挙したもので、増やしたら必ずここへ足すこと。
 *   regression test: tests/adapter/renderer-row-memo-derived.test.ts
 */
function derivedRowFingerprint(
  entry: Entry,
  state: AppState,
  backlinkCounts?: ReadonlyMap<string, number>,
  connectedLids?: ReadonlySet<string>,
  connectednessSets?: ConnectednessSets | null,
): string {
  const lid = entry.lid;
  // P4a: deferred(sqlite)では COUNT 索引 + 追記数、それ以外は従来導出。
  const rev = state.container ? revisionCountOf(state.container, lid) : 0;
  const back = backlinkCounts?.get(lid) ?? 0;
  const conn = connectedLids?.has(lid) ? 1 : 0;
  // ConnectednessSets は複数のバケツを持つ。どれに属するかが行の marker を決める。
  const sets = connectednessSets
    ? Object.entries(connectednessSets)
      .map(([k, v]) => (v instanceof Set && v.has(lid) ? k : ''))
      .filter(Boolean)
      .sort()
      .join(',')
    : '';
  // 行が読む state 由来のうち、選択(post-pass)以外のもの。
  const importing = (state.importPreview ? 1 : 0) + (state.batchImportPreview ? 2 : 0);
  return `${rev}|${back}|${conn}|${sets}|${state.viewMode}|${state.sortKey}|`
    + `${state.readonly ? 1 : 0}|${importing}|${shellTodoOverdueIndicatorEnabled() ? 1 : 0}`;
}

function renderTreeNode(
  node: TreeNode,
  parent: HTMLElement,
  state: AppState,
  backlinkCounts?: ReadonlyMap<string, number>,
  connectedLids?: ReadonlySet<string>,
  connectednessSets?: ConnectednessSets | null,
  /** L3-S2: 描画順の収集先(折り畳まれた子は入らない = 画面の順序と一致)。 */
  visibleLids?: string[],
): void {
  const isCollapsed =
    node.entry.archetype === 'folder' && state.collapsedFolders.includes(node.entry.lid);
  const hasMoveButtons = treeRowHasMoveButtons(node.entry, state);
  const inWindow = (state.childWindowLids ?? []).includes(node.entry.lid);

  const derived = derivedRowFingerprint(
    node.entry, state, backlinkCounts, connectedLids, connectednessSets,
  );
  visibleLids?.push(node.entry.lid);
  rowMemoTouched.add(node.entry);
  const memo = treeRowMemo.get(node.entry);
  let li: HTMLElement;
  if (
    memo
    && memo.derived === derived
    && memo.depth === node.depth
    && memo.collapsed === isCollapsed
    && memo.childCount === node.children.length
    && memo.truncatedChildCount === (node.truncatedChildCount ?? 0)
    && memo.hasMoveButtons === hasMoveButtons
    && memo.inWindow === inWindow
  ) {
    li = memo.li;
  } else {
    li = buildTreeRow(node, state, isCollapsed, backlinkCounts, connectedLids, connectednessSets);
    treeRowMemo.set(node.entry, {
      li,
      depth: node.depth,
      collapsed: isCollapsed,
      childCount: node.children.length,
      truncatedChildCount: node.truncatedChildCount ?? 0,
      hasMoveButtons,
      inWindow,
      derived,
    });
  }
  // 選択 highlight は flat memo と同じ post-pass(cache hit でも最新化)。
  applyEntryRowSelectionAttrs(li, node.entry, state);
  parent.appendChild(li);
  // Skip rendering children when the folder is collapsed.
  if (isCollapsed) return;
  for (const child of node.children) {
    renderTreeNode(child, parent, state, backlinkCounts, connectedLids, connectednessSets, visibleLids);
  }
}

/**
 * L3-S5: 窓化の材料と適用。
 *
 * ## なぜ「描画後の後処理」なのか
 *
 * 窓を決めるには**単位行高**が要るが、これは attach 済みで layout の付いた
 * 行からしか測れない。しかも `content-visibility: auto` の行は未表示だと
 * **39px という嘘の高さ**を返す(真値 24.91px)ので、`scrollHeight / 行数`
 * では出せない。よって「一度全件描く → 測る → 窓へ削る」の順になる。
 *
 * 一見無駄に見えるが、削る側は memo hit なので 2 度目以降の描画では
 * 行の**生成**は起きない。そして常駐(DOM ノード)は窓ぶんに落ちる ──
 * 買っているのは生成コストではなく**常駐**である。
 *
 * ## UL に材料を預ける理由
 *
 * `canReuseEntryList` は UL ごと使い回すので、その描画では行の構築ループを
 * 一切通らない。module 変数に持つと「使い回した UL に前回の材料」がぶら下がる。
 * UL 自身に付けておけば、使い回されても引っ越しても正しいものが付いてくる
 * (S2 の `WeakMap<UL, order>` と同じ理由)。
 */
export interface SidebarWindowContext {
  kind: 'flat' | 'tree';
  rows: readonly Entry[] | readonly TreeNode[];
  backlinkCounts: ReadonlyMap<string, number> | undefined;
  connectedLids: ReadonlySet<string> | undefined;
  connectednessSets: ConnectednessSets | null;
}

type WindowedList = HTMLElement & {
  __pkcWindowCtx?: SidebarWindowContext | null;
  __pkcWindowCleanup?: () => void;
  __pkcWindowRange?: WindowRange;
};

function setSidebarWindowContext(list: HTMLElement, ctx: SidebarWindowContext | null): void {
  (list as WindowedList).__pkcWindowCtx = ctx;
}

/** 窓の slice を DOM に反映する(行は memo 経由なので hit なら生成しない)。 */
function paintWindow(
  list: HTMLElement,
  ctx: SidebarWindowContext,
  state: AppState,
  range: WindowRange,
  unitHeight: number,
): void {
  // 🔴 **spacer を先に伸ばしてから行を入れ替える**(順序が命)。
  //
  // 先に行を全部 remove すると、その瞬間だけ UL の内容高が spacer ぶんまで
  // 縮む → browser が `scrollTop` を max まで**クランプ**する → 直後に
  // spacer を戻しても scroll 位置は戻らない。実測ではこれで scrollTop が
  // 148px から動かなくなり、「↓ を押しても選択行が画面外のまま」になった。
  // scrollTop は保険としても保存・復元する(クランプは非同期に見えることがある)。
  const keepScrollTop = list.scrollTop;
  applySpacers(list, range, unitHeight, ctx.rows.length);
  for (const row of Array.from(list.querySelectorAll('li.pkc-entry-item'))) row.remove();
  const bottom = list.querySelector('[data-pkc-spacer="bottom"]');
  for (let i = range.start; i < range.end; i++) {
    if (ctx.kind === 'flat') {
      const el = getOrCreateMemoizedEntryItem(
        (ctx.rows as readonly Entry[])[i]!, state,
        ctx.backlinkCounts, ctx.connectedLids, ctx.connectednessSets,
      );
      list.insertBefore(el, bottom);
    } else {
      renderTreeRowOnly(
        (ctx.rows as readonly TreeNode[])[i]!, list, state,
        ctx.backlinkCounts, ctx.connectedLids, ctx.connectednessSets,
      );
      const appended = list.lastElementChild;
      if (appended && bottom && appended !== bottom) list.insertBefore(appended, bottom);
    }
  }
  // B18: 窓の外へ出た行の memo は捨てる(スクロールで溜め込まない)。
  pruneRowMemos();
  if (list.scrollTop !== keepScrollTop) list.scrollTop = keepScrollTop;
  (list as WindowedList).__pkcWindowRange = range;
}

/**
 * attach 後の窓化。`render()` の末尾から 1 回だけ呼ぶ。
 *
 * 発動条件を満たさなければ**何もしない**(全件描画のまま)。happy-dom は
 * 高さが 0 なので構造的にここで抜ける ── 既存 test は旧経路のまま守られる。
 */
function finalizeSidebarWindow(root: HTMLElement, state: AppState): void {
  const list = root.querySelector<HTMLElement>('ul[data-pkc-region="entry-list"]') as WindowedList | null;
  if (!list) return;
  const ctx = list.__pkcWindowCtx ?? null;
  if (!ctx) {
    // 窓化しない描画になった ── 前回張った scroll listener を必ず外す。
    list.__pkcWindowCleanup?.();
    list.__pkcWindowCleanup = undefined;
    return;
  }
  const unitHeight = measureUnitRowHeight(list);
  if (!shouldVirtualize(unitHeight, ctx.rows.length)) {
    list.__pkcWindowCleanup?.();
    list.__pkcWindowCleanup = undefined;
    return;
  }

  const range = computeWindowRange({
    scrollTop: list.scrollTop,
    viewportHeight: list.clientHeight,
    unitHeight,
    total: ctx.rows.length,
  });
  paintWindow(list, ctx, state, range, unitHeight);

  // scroll 追従。listener は **UL 1 枚につき 1 本**に保つ(使い回しで積み上がる)。
  list.__pkcWindowCleanup?.();
  const onScroll = (): void => {
    const cur = list.__pkcWindowRange;
    const next = computeWindowRange({
      scrollTop: list.scrollTop,
      viewportHeight: list.clientHeight,
      unitHeight,
      total: ctx.rows.length,
    });
    if (cur && next.start === cur.start && next.end === cur.end) return;
    paintWindow(list, ctx, state, next, unitHeight);
  };
  list.addEventListener('scroll', onScroll, { passive: true });
  list.__pkcWindowCleanup = () => list.removeEventListener('scroll', onScroll);
}

/**
 * L3-S5: 折り畳みを反映した**表示順の平坦化**(DOM を作らない)。
 *
 * 窓化は「N 行のうち i..j 行目だけ描く」機構なので、tree でも
 * 「何番目に何が来るか」を DOM 抜きで確定できないと始まらない。
 * 折り畳み判定は `renderTreeNode` と**同じ式**を使う ── ここがズレると
 * 窓の index と画面が食い違う(しかも静かに)。
 */
function flattenDisplayTree(nodes: readonly TreeNode[], state: AppState): TreeNode[] {
  const out: TreeNode[] = [];
  const walk = (node: TreeNode): void => {
    out.push(node);
    const isCollapsed =
      node.entry.archetype === 'folder' && state.collapsedFolders.includes(node.entry.lid);
    if (isCollapsed) return;
    for (const child of node.children) walk(child);
  };
  for (const n of nodes) walk(n);
  return out;
}

/**
 * L3-S5: tree 行を 1 行だけ描く(再帰しない)。窓の slice を描くのに使う。
 * memo の扱い・装飾・選択 post-pass は `renderTreeNode` と同一。
 */
function renderTreeRowOnly(
  node: TreeNode,
  parent: HTMLElement,
  state: AppState,
  backlinkCounts: ReadonlyMap<string, number> | undefined,
  connectedLids: ReadonlySet<string> | undefined,
  connectednessSets: ConnectednessSets | null,
): void {
  const isCollapsed =
    node.entry.archetype === 'folder' && state.collapsedFolders.includes(node.entry.lid);
  const hasMoveButtons = treeRowHasMoveButtons(node.entry, state);
  const inWindow = (state.childWindowLids ?? []).includes(node.entry.lid);
  const derived = derivedRowFingerprint(
    node.entry, state, backlinkCounts, connectedLids, connectednessSets,
  );
  rowMemoTouched.add(node.entry);
  const memo = treeRowMemo.get(node.entry);
  let li: HTMLElement;
  if (
    memo
    && memo.derived === derived
    && memo.depth === node.depth
    && memo.collapsed === isCollapsed
    && memo.childCount === node.children.length
    && memo.truncatedChildCount === (node.truncatedChildCount ?? 0)
    && memo.hasMoveButtons === hasMoveButtons
    && memo.inWindow === inWindow
  ) {
    li = memo.li;
  } else {
    li = buildTreeRow(node, state, isCollapsed, backlinkCounts, connectedLids, connectednessSets);
    treeRowMemo.set(node.entry, {
      li,
      depth: node.depth,
      collapsed: isCollapsed,
      childCount: node.children.length,
      truncatedChildCount: node.truncatedChildCount ?? 0,
      hasMoveButtons,
      inWindow,
      derived,
    });
  }
  applyEntryRowSelectionAttrs(li, node.entry, state);
  parent.appendChild(li);
}

/** tree 行の実構築(memo miss 時のみ)。従来の renderTreeNode の装飾部。 */
function buildTreeRow(
  node: TreeNode,
  state: AppState,
  isCollapsed: boolean,
  backlinkCounts?: ReadonlyMap<string, number>,
  connectedLids?: ReadonlySet<string>,
  connectednessSets?: ConnectednessSets | null,
): HTMLElement {
  const li = renderEntryItem(node.entry, state, backlinkCounts, connectedLids, connectednessSets);
  if (node.depth > 0) {
    li.style.paddingLeft = `${0.6 + node.depth * 1.2}rem`;
  }
  // All tree items are draggable
  li.setAttribute('draggable', 'true');
  li.setAttribute('data-pkc-draggable', 'true');
  // B1:階層 cap で打ち切られた直下の子の件数(件数表示と「…N」marker の
  // 両方で使うので 1 回だけ解決する)。
  const truncated = node.truncatedChildCount ?? 0;
  if (node.entry.archetype === 'folder') {
    li.setAttribute('data-pkc-folder', 'true');
    li.setAttribute('data-pkc-drop-target', 'true');

    // Expand/collapse toggle — shown only when folder has children.
    if (node.children.length > 0) {
      const toggle = createElement('button', 'pkc-folder-toggle');
      toggle.setAttribute('data-pkc-action', 'toggle-folder-collapse');
      toggle.setAttribute('data-pkc-lid', node.entry.lid);
      toggle.setAttribute(
        'title',
        isCollapsed ? 'Expand folder' : 'Collapse folder',
      );
      toggle.setAttribute('aria-label', isCollapsed ? 'Expand folder' : 'Collapse folder');
      toggle.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
      toggle.textContent = isCollapsed ? '▶' : '▼';
      // Prepend so the chevron sits before the icon/title
      li.insertBefore(toggle, li.firstChild);
      if (isCollapsed) {
        li.setAttribute('data-pkc-folder-collapsed', 'true');
      }
    }

    // Show child count for folders
    // B1(視覚監査 2026-07-25):描画された子ではなく **実在する直下の子**
    // を出す。階層 cap で打ち切られた分を足さないと、深さ上限に達した
    // folder が `(0)` と嘘をつく。cap に当たらない行では truncated===0 な
    // ので表示は従来どおり。
    const childCount = createElement('span', 'pkc-folder-count');
    childCount.textContent = `(${node.children.length + truncated})`;
    li.appendChild(childCount);
  }

  // B1:階層 cap で子を出せなかった行に「…N」を出す。新しい UI 部品では
  // なく、breadcrumb の打ち切り表示(`pkc-header-path-truncated` の `…` +
  // title tooltip)と同じ規約を tree 行の枠内で再利用する。
  // folder 以外も structural 親になり得るので archetype 分岐の **外**。
  // `data-pkc-action` は付けない ── click は外側の
  // `<li data-pkc-action="select-entry">` に bubble して既存の選択挙動の
  // まま(folder ならダブルクリックで filer へ入れる既存導線も生きる)。
  if (truncated > 0) {
    const trunc = createElement('span', 'pkc-tree-truncated');
    trunc.setAttribute('data-pkc-tree-truncated', String(truncated));
    trunc.setAttribute(
      'title',
      `階層の表示上限のため、この直下の ${truncated} 件はツリーに出ていません`
        + '(ファイラー・検索からは辿れます)',
    );
    trunc.textContent = `…${truncated}`;
    li.appendChild(trunc);
  }
  return li;
}

// ── PR #179: container-derived index memoization ────────────────
//
// `buildLinkIndex` walks every entry's body for `entry:` references
// to count incoming relations / build the backlinks adjacency map.
// `buildConnectednessSets` does a graph walk over relations + the
// link-index. Both are O(N) in container size and BOTH run on
// every render (full or sidebar-only). At 5000 entries each is
// ~50-150 ms, dominating the per-keystroke cost the row memo
// alone could not address.
//
// Both depend ONLY on container + (for connectedness) the linkIndex
// derived from the same container. Memoize by container reference;
// cache invalidates wholesale when the reducer hands us a new
// container ref (every reducer that touches entries / relations /
// revisions returns `{...prev, entries|relations|...}`, so identity
// equality is a perfect proxy for "container content unchanged").
let cachedLinkIndexContainer: import('@core/model/container').Container | null = null;
let cachedLinkIndex: ReturnType<typeof buildLinkIndex> | null = null;
let cachedConnectednessContainer: import('@core/model/container').Container | null = null;
let cachedConnectedness: ConnectednessSets | null = null;

function memoizedBuildLinkIndex(
  container: import('@core/model/container').Container,
): ReturnType<typeof buildLinkIndex> {
  if (container !== cachedLinkIndexContainer || cachedLinkIndex === null) {
    cachedLinkIndexContainer = container;
    cachedLinkIndex = buildLinkIndex(container);
  }
  return cachedLinkIndex;
}

function memoizedBuildConnectednessSets(
  container: import('@core/model/container').Container,
  linkIndex: ReturnType<typeof buildLinkIndex>,
): ConnectednessSets {
  if (container !== cachedConnectednessContainer || cachedConnectedness === null) {
    cachedConnectednessContainer = container;
    cachedConnectedness = buildConnectednessSets(container, linkIndex);
  }
  return cachedConnectedness;
}

/** Test-only reset of the index memos. Tests that exercise repeated
 *  renders with synthetic containers expect a clean slate. */
export function __resetIndexMemoForTest(): void {
  cachedLinkIndexContainer = null;
  cachedLinkIndex = null;
  cachedConnectednessContainer = null;
  cachedConnectedness = null;
}

// ── PR #179: flat-mode entry-row memoization ────────────────────
//
// The PR #178 bench showed `render:sidebar` itself was the dominant
// per-keystroke cost (370 ms at 5000 entries). Most of that was
// per-row markup-build for entries that hadn't changed since the
// previous render — a search keystroke filters the list but the
// rows themselves are identical.
//
// This cache memoizes flat-mode `<li>` rows by `Entry` REFERENCE.
// Reducer paths that mutate an entry produce a new object ref
// (`...prev, body, updated_at`), so referential equality is enough
// to detect "this entry's content unchanged since last render". A
// container-reference change (the entries array itself swapped)
// invalidates the entire cache because relations / revisions /
// connectedness derived counts are then stale across all rows.
//
// Selection (`data-pkc-selected` / `data-pkc-multi-selected`) is
// applied as a POST-PASS on every render — including cache hits —
// so cached rows always reflect the current selectedLid /
// multiSelectedLids without needing a cache-key dimension.
//
// Tree mode は長らく対象外だったが、#938 R9 で専用 memo(treeRowMemo、
// 装飾パラメータ比較つき)が付いた — renderTreeNode 直上の doc 参照。
let entryRowMemo = new Map<Entry, { li: HTMLElement; derived: string }>();

/**
 * 2026-07-26: **container 参照での全 invalidate をやめた**。
 *
 * 従来ここは「container が変わったら memo を全部捨てる」だった
 * (relations / revisions / connectedness の派生値が全行で古くなるため)。
 * しかし本文を 1 文字直すだけでも container 参照は変わるので、
 * **編集の確定のたびに全行が作り直されていた**(実測 106 ms / 確定、N=5000)。
 *
 * 派生値は行ごとに安く比較できるので、`derivedRowFingerprint` を memo に載せて
 * **1 つでも違う行だけ**作り直す。関数は互換のため残すが、もう何もしない
 * (呼び元を消すより、なぜ不要になったかをここに残すほうが後で効く)。
 */
function clearEntryRowMemoIfStale(
  _container: import('@core/model/container').Container | null,
): void {
  /* no-op — 派生値の比較に置き換わった(上の doc 参照) */
}

function applyEntryRowSelectionAttrs(li: HTMLElement, entry: Entry, state: AppState): void {
  if (entry.lid === state.selectedLid) {
    li.setAttribute('data-pkc-selected', 'true');
  } else {
    li.removeAttribute('data-pkc-selected');
  }
  if (state.multiSelectedLids.includes(entry.lid)) {
    li.setAttribute('data-pkc-multi-selected', 'true');
  } else {
    li.removeAttribute('data-pkc-multi-selected');
  }
}

function getOrCreateMemoizedEntryItem(
  entry: Entry,
  state: AppState,
  backlinkCounts: ReadonlyMap<string, number> | undefined,
  connectedLids: ReadonlySet<string> | undefined,
  connectednessSets: ConnectednessSets | null,
): HTMLElement {
  const derived = derivedRowFingerprint(
    entry, state, backlinkCounts, connectedLids, connectednessSets,
  );
  rowMemoTouched.add(entry);
  const memo = entryRowMemo.get(entry);
  let li: HTMLElement;
  if (memo && memo.derived === derived) {
    li = memo.li;
  } else {
    li = renderEntryItem(entry, state, backlinkCounts, connectedLids, connectednessSets);
    entryRowMemo.set(entry, { li, derived });
  }
  applyEntryRowSelectionAttrs(li, entry, state);
  return li;
}

/** Test-only reset of the row memo. Used by integration tests that
 *  exercise repeated renders within a single test fixture and want
 *  a clean slate without juggling Container references. Module-
 *  level state is not normally observable from outside the
 *  renderer, but the cache's wholesale-invalidation behaviour IS
 *  observable (cache hit on second render of the same entry), and
 *  tests need a deterministic starting point. */
export function __resetEntryRowMemoForTest(): void {
  entryRowMemo = new Map();
  // #938 R9: tree 行 memo も同じ test hook で reset する(既存テストは
  // この 1 本で「行 memo なしのクリーンな状態」を期待している)。
  treeRowMemo = new Map();
  rowMemoTouched.clear();
}

function renderEntryItem(
  entry: Entry,
  state: AppState,
  backlinkCounts?: ReadonlyMap<string, number>,
  connectedLids?: ReadonlySet<string>,
  connectednessSets?: ConnectednessSets | null,
): HTMLElement {
  const li = createElement('li', 'pkc-entry-item');
  li.setAttribute('data-pkc-action', 'select-entry');
  li.setAttribute('data-pkc-lid', entry.lid);

  if (entry.lid === state.selectedLid) {
    li.setAttribute('data-pkc-selected', 'true');
  }
  if (state.multiSelectedLids.includes(entry.lid)) {
    li.setAttribute('data-pkc-multi-selected', 'true');
  }

  // Color tag Slice 3 — left-edge color bar. The raw value goes onto
  // a data attribute regardless of whether it is a known palette ID,
  // so a future palette extension does not lose round-trip data even
  // before its CSS lands. Only known IDs get the visible band class
  // plus the `pkc-color-<id>` hue binding (shared with the picker
  // trigger dot and swatches so a new palette ID is one CSS rule).
  if (typeof entry.color_tag === 'string' && entry.color_tag !== '') {
    li.setAttribute('data-pkc-color-tag', entry.color_tag);
    if (isColorTagId(entry.color_tag)) {
      li.classList.add('pkc-entry-color-bar', `pkc-color-${entry.color_tag}`);
    }
  }

  const title = createElement('span', 'pkc-entry-title');
  title.textContent = `${archetypeIcon(entry.archetype)} ${entry.title || '(untitled)'}`;
  // #932: 省略表示でも全文を確認できるよう tooltip は常時付与。
  title.setAttribute('title', entry.title || '(untitled)');
  li.appendChild(title);

  // Todo status indicator
  if (entry.archetype === 'todo') {
    const todo = parseTodoBody(entry.body, entry);
    const statusBadge = createElement('span', 'pkc-todo-status-badge');
    statusBadge.setAttribute('data-pkc-todo-status', todo.status);
    statusBadge.textContent = todo.status === 'done' ? '[x]' : '[ ]';
    li.appendChild(statusBadge);
    if (todo.archived) {
      li.setAttribute('data-pkc-todo-archived', 'true');
      const archivedBadge = createElement('span', 'pkc-todo-archived-sidebar');
      archivedBadge.textContent = 'Archived';
      li.appendChild(archivedBadge);
    }
    // pgc-134 wave-δ #9(MASTER.md §7 todo):flag ON 時に overdue 視覚
    // indicator を sidebar 行に追加。kanban / calendar と同じ
    // `data-pkc-todo-overdue="true"` attr で CSS 統一、加えて `⚠` badge
    // を行末に append(色覚弱者対応)。
    if (shellTodoOverdueIndicatorEnabled() && isTodoPastDue(todo)) {
      li.setAttribute('data-pkc-todo-overdue', 'true');
      const overdueBadge = createElement('span', 'pkc-todo-overdue-badge');
      overdueBadge.setAttribute('title', 'Overdue');
      overdueBadge.textContent = '⚠';
      li.appendChild(overdueBadge);
    }
  }

  // Task completion badge
  const taskProgress = countTaskProgress(entry);
  if (taskProgress) {
    const taskBadge = createElement('span', 'pkc-task-badge');
    taskBadge.textContent = `${taskProgress.done}/${taskProgress.total}`;
    if (taskProgress.done === taskProgress.total) {
      li.setAttribute('data-pkc-task-complete', 'true');
    }
    li.appendChild(taskBadge);
  }

  // History indicator
  if (state.container) {
    const revCount = revisionCountOf(state.container, entry.lid);
    if (revCount > 0) {
      li.setAttribute('data-pkc-has-history', 'true');
      const revBadge = createElement('span', 'pkc-revision-badge');
      revBadge.setAttribute('data-pkc-revision-count', String(revCount));
      revBadge.textContent = `r${revCount}`;
      li.appendChild(revBadge);
    }
  }

  // v1 backlink count badge — relations-based only. Rendered only when
  // count > 0. Visual form: `←N` with a `title` explaining the meaning
  // without the ambiguous standalone word "backlink". Clicking jumps
  // to the Relations section — see
  // docs/development/backlink-badge-jump-v1.md.
  const backlinkCount = backlinkCounts?.get(entry.lid) ?? 0;
  if (backlinkCount > 0) {
    const badge = createElement('button', 'pkc-backlink-badge');
    badge.setAttribute('data-pkc-action', 'open-backlinks');
    badge.setAttribute('data-pkc-lid', entry.lid);
    badge.setAttribute('data-pkc-backlink-count', String(backlinkCount));
    const phrase = backlinkCount === 1 ? '1 incoming relation' : `${backlinkCount} incoming relations`;
    badge.setAttribute('title', phrase);
    badge.setAttribute('aria-label', `Jump to ${phrase}`);
    badge.textContent = `←${backlinkCount}`;
    li.appendChild(badge);
  }

  // v1 relations-based orphan marker — a subtle `○` shown for entries
  // that participate in no relation (neither `from` nor `to`). Marker
  // is informational only; no click behavior. See
  // docs/development/orphan-detection-ui-v1.md.
  if (connectedLids && !connectedLids.has(entry.lid)) {
    li.setAttribute('data-pkc-orphan', 'true');
    const marker = createElement('span', 'pkc-orphan-marker');
    marker.setAttribute('title', 'No relations yet');
    marker.setAttribute('aria-hidden', 'true');
    marker.textContent = '○';
    li.appendChild(marker);
  }

  // S4 Unified Orphan Detection v3 — additive layer. v1 attribute /
  // marker above are NOT touched. The new `data-pkc-connectedness`
  // attribute is added whenever connectedness sets are available, and
  // `.pkc-unconnected-marker` is shown only for the `fully-unconnected`
  // state. Wording follows contract §4.1 / §4.2 (no bare "orphan",
  // no warning color, no graph semantics). See
  // docs/development/unified-orphan-detection-v3-contract.md §4.4.
  if (connectednessSets) {
    let connectedness: 'connected' | 'relations-orphan' | 'fully-unconnected';
    if (connectednessSets.relationsConnected.has(entry.lid)) {
      connectedness = 'connected';
    } else if (connectednessSets.markdownConnected.has(entry.lid)) {
      connectedness = 'relations-orphan';
    } else {
      connectedness = 'fully-unconnected';
    }
    li.setAttribute('data-pkc-connectedness', connectedness);
    if (connectedness === 'fully-unconnected') {
      const uMarker = createElement('span', 'pkc-unconnected-marker');
      uMarker.setAttribute('title', 'Fully unconnected (no relations, no markdown refs)');
      uMarker.setAttribute('aria-hidden', 'true');
      uMarker.textContent = '◌';
      li.appendChild(uMarker);
    }
  }

  // C-2 v1 (2026-04-17): Move up / Move down for the selected entry
  // under manual mode. Gate mirrors the reducer (detail view, not
  // read-only, no import preview in progress) — contract §4.2.
  // Reducer is authoritative: a no-op at an edge still goes through
  // dispatch and returns the same state ref.
  if (
    entry.lid === state.selectedLid &&
    state.sortKey === 'manual' &&
    state.viewMode === 'detail' &&
    !state.readonly &&
    state.importPreview === null &&
    state.batchImportPreview === null
  ) {
    const upBtn = createElement('button', 'pkc-entry-move-btn');
    upBtn.setAttribute('data-pkc-action', 'move-entry-up');
    upBtn.setAttribute('data-pkc-lid', entry.lid);
    upBtn.setAttribute('title', 'Move up');
    upBtn.setAttribute('aria-label', 'Move up');
    upBtn.textContent = '↑';
    li.appendChild(upBtn);

    const downBtn = createElement('button', 'pkc-entry-move-btn');
    downBtn.setAttribute('data-pkc-action', 'move-entry-down');
    downBtn.setAttribute('data-pkc-lid', entry.lid);
    downBtn.setAttribute('title', 'Move down');
    downBtn.setAttribute('aria-label', 'Move down');
    downBtn.textContent = '↓';
    li.appendChild(downBtn);
  }

  // PR-III (2026-05-06、user 修正指示5「エントリ編集中、左ペインの
  // コピーリンク系の挙動のみ活かしてほしい。リンクをたくさん埋め
  // 込んだエントリを作成する時に手間」):各 sidebar entry に小さな
  // 🔗 copy-link button を常設、hover で visible(CSS)。click は
  // `e.target.closest([data-pkc-action])` で button が先にマッチする
  // ため、parent の select-entry を pre-empt して permalink だけが
  // clipboard へコピーされる(編集中の body / focus / scroll は
  // 一切影響を受けない)。reserved / system entries では非表示。
  if (
    !isReservedLid(entry.lid)
    && !isSystemArchetype(entry.archetype)
  ) {
    const copyLinkBtn = createElement('button', 'pkc-entry-copy-link');
    copyLinkBtn.setAttribute('data-pkc-action', 'copy-entry-permalink');
    copyLinkBtn.setAttribute('data-pkc-lid', entry.lid);
    copyLinkBtn.setAttribute('title', 'このエントリの共有 URL（pkc://）をコピー');
    copyLinkBtn.setAttribute('aria-label', 'Copy permalink');
    copyLinkBtn.textContent = '🔗';
    li.appendChild(copyLinkBtn);
  }

  return li;
}

/**
 * S-18 (A-4 FULL): render one sub-location hit under its parent
 * entry row in the sidebar. Clicking dispatches NAVIGATE_TO_LOCATION
 * which sets selectedLid + pendingNav, and main.ts's post-render
 * effect then scrolls to the sub-id target and flashes the
 * highlight.
 */
function renderSubLocationItem(hit: SubLocationHit): HTMLElement {
  const li = createElement('li', 'pkc-entry-subloc');
  li.setAttribute('data-pkc-action', 'navigate-to-location');
  li.setAttribute('data-pkc-lid', hit.entryLid);
  li.setAttribute('data-pkc-sub-id', hit.subId);
  li.setAttribute('data-pkc-subloc-kind', hit.kind);

  // Kind badge → label → snippet. Three spans to keep CSS simple.
  const badge = createElement('span', 'pkc-entry-subloc-kind');
  badge.textContent = hit.kind === 'heading'
    ? '§'
    : hit.kind === 'log'
      ? '•'
      : '↑';
  li.appendChild(badge);

  const label = createElement('span', 'pkc-entry-subloc-label');
  label.textContent = hit.label;
  li.appendChild(label);

  const snippet = createElement('span', 'pkc-entry-subloc-snippet');
  snippet.textContent = hit.snippet;
  li.appendChild(snippet);

  return li;
}

function renderCenter(state: AppState): HTMLElement {
  const endProfile = profileStart('render:center');
  try {
    const center = renderCenterImpl(state);
    // pgc-89:Split View — renderCenterImpl が view mode 別の早期 return を
    // 多数持つので、全 return path に対して append する wrapper layer。
    if (shellSplitViewEnabled() && isSplitViewOpen()) {
      const splitPane = buildSplitViewElement(state);
      center.appendChild(splitPane);
      center.classList.add('pkc-center-split');
    }
    return center;
  } finally {
    endProfile();
  }
}

function renderCenterImpl(state: AppState): HTMLElement {
  const center = createElement('section', 'pkc-center');
  center.setAttribute('data-pkc-region', 'center');

  // pgc-237:userEntries は filter-cache で memoize 済 ── container ref で
  // re-render 跨ぎ cache hit、O(N) walk を skip。fallback として state.container
  // が undefined の場合は empty array。
  const userEntries = state.container
    ? getFilterIndexes(state.container).userEntries
    : [];

  // pgc-85 / pgc-87(MASTER.md §4.3):Tab strip(複数 entry 同時 open +
  // workspace-level view tab)。flag ON で常時描画(open tabs が無くても
  // placeholder を出す)── view tab だけ open のケース(entry 無し)を
  // 拾うため、`userEntries.length > 0` の condition を撤廃。
  if (shellTabsEnabled()) {
    center.appendChild(buildTabStripElement(state));
  }

  // View mode toggle (always visible when container has user entries)
  if (userEntries.length > 0) {
    center.appendChild(renderViewModeToggle(state.viewMode, state.selectedLid != null));
  }

  // Calendar view
  if (state.viewMode === 'calendar') {
    center.appendChild(renderCalendarView(state));
    return center;
  }

  // Kanban view
  if (state.viewMode === 'kanban') {
    center.appendChild(renderKanbanView(state));
    return center;
  }

  // Filer view (Phase 1: skeleton placeholder; Phase 1 PR-2 will add table render)
  if (state.viewMode === 'filer') {
    center.appendChild(renderFilerView(state));
    return center;
  }

  // PR-2JJ v2(2026-05-13、PR #432 stack):Launcher view。HTML attachment で
  // `registered_as_app: true` のものを tile grid で表示、tile click は既存
  // `open-html-attachment` action 経由(window.open + document.write)。
  if (state.viewMode === 'launcher') {
    center.appendChild(renderLauncherView(state));
    return center;
  }

  // Detail view (existing behavior).
  // Phase 4 follow-up 3: when the selected entry is a folder, fold the
  // detail surface into the filer view so the "folder detail" is the
  // filer's overview (user direction:「フォルダの detail はファイラー
  // 表示にして、フォルダの detail を実質の廃止にしましょう」).
  // viewMode itself stays 'detail' so the user can return via the
  // dedicated Filer tab without losing context.
  const selected = findSelectedEntry(state);
  if (
    folderDetailAsFiler()
    && selected
    && selected.archetype === 'folder'
    && state.phase === 'ready'
    && state.editingLid !== selected.lid
  ) {
    center.appendChild(renderFilerView(state));
    return center;
  }
  const canEdit = state.phase === 'ready' && !state.readonly;

  // Show About when: explicitly selected OR no user entries exist
  const aboutEntry = state.container
    ? getFilterIndexes(state.container).entryByLid.get(ABOUT_LID)
    : undefined;
  const showAbout = selected?.archetype === 'system-about'
    || (userEntries.length === 0 && !selected && aboutEntry);
  if (showAbout) {
    const aboutScroll = createElement('div', 'pkc-about-scroll');
    aboutScroll.appendChild(renderAboutView(aboutEntry));
    center.appendChild(aboutScroll);
    return center;
  }

  if (!selected) {
    if (canEdit) {
      // Large drop zone invitation when nothing is selected
      const dropInvite = renderDropZone(state, true);
      center.appendChild(dropInvite);
    } else {
      const placeholder = createElement('div', 'pkc-empty pkc-guidance');
      placeholder.setAttribute('data-pkc-region', 'center-guidance');
      if (state.readonly) {
        placeholder.textContent = userEntries.length
          ? 'Select an entry from the sidebar to view it here.'
          : 'This container has no entries.';
      } else {
        placeholder.textContent = userEntries.length
          ? 'Select an entry from the sidebar to view it here.'
          : 'Create your first entry using the + buttons above.';
      }
      center.appendChild(placeholder);
    }
    return center;
  }

  // Content area (scrollable). `data-pkc-region="center-content"`
  // so the render-continuity helper can preserve its scrollTop
  // across full re-renders (A-1 / A-2).
  const content = createElement('div', 'pkc-center-content');
  content.setAttribute('data-pkc-region', 'center-content');

  // Light mode notice for attachment entries
  if (state.lightSource && selected.archetype === 'attachment') {
    const notice = createElement('div', 'pkc-light-notice');
    notice.setAttribute('data-pkc-region', 'light-notice');
    notice.textContent = 'This is a Light export — attachment file data is not available. Use the full export to access file previews and downloads.';
    content.appendChild(notice);
  }

  let sectionEditorShown = false;
  if (state.phase === 'editing' && state.editingLid === selected.lid) {
    // Light mode warning in attachment editor
    if (state.lightSource && selected.archetype === 'attachment') {
      const editWarn = createElement('div', 'pkc-light-notice');
      editWarn.setAttribute('data-pkc-region', 'light-edit-notice');
      editWarn.textContent = 'Light mode: changes to this entry will not be saved. File uploads are unavailable.';
      content.appendChild(editWarn);
    }
    content.appendChild(renderEditor(selected, state.container));
  } else {
    // 章フォーカス編集:対象 entry の 1 節だけを focused editor で開く
    // (full editor とは別経路、phase は 'ready' のまま)。節が解決できなければ
    // null を返すので通常 view に fall back。
    const sectionEditor =
      canEdit && state.sectionEdit && state.sectionEdit.lid === selected.lid
        ? renderSectionEditor(selected, state.sectionEdit.index)
        : null;
    if (sectionEditor) {
      content.appendChild(sectionEditor);
      sectionEditorShown = true;
    } else {
      content.appendChild(renderView(selected, canEdit, state.container, state.searchQuery, state.childWindowLids ?? []));
    }
  }

  // Compact drop zone strip when viewing an entry (not editing / not section-editing)
  if (canEdit && state.phase !== 'editing' && !sectionEditorShown) {
    content.appendChild(renderDropZone(state, false));
  }

  center.appendChild(content);

  // Fixed action bar at bottom
  center.appendChild(
    renderActionBar(selected, state.phase, canEdit, state.container, state.editMode ?? 'inline'),
  );

  return center;
}

function renderViewModeToggle(
  viewMode: 'detail' | 'calendar' | 'kanban' | 'filer' | 'launcher',
  hasSelection: boolean,
): HTMLElement {
  const bar = createElement('div', 'pkc-view-mode-bar');
  bar.setAttribute('data-pkc-region', 'view-mode-bar');

  // pgc-111 wave-γ #12(MASTER.md §6.5):flag ON 時に scope mark + 視覚
  // separator + 選択無時の Detail tab disabled 化を追加。OFF で従来挙動。
  const scoped = shellViewModeTabsScopedEnabled();
  if (scoped) {
    bar.setAttribute('data-pkc-scoped', 'true');
  }

  const modes: { key: typeof viewMode; label: string; scope: 'entry' | 'workspace' }[] = [
    { key: 'detail',   label: 'Detail',   scope: 'entry' },
    { key: 'calendar', label: 'Calendar', scope: 'workspace' },
    { key: 'kanban',   label: 'Kanban',   scope: 'workspace' },
    { key: 'filer',    label: 'Filer',    scope: 'workspace' },
    { key: 'launcher', label: 'Launcher', scope: 'workspace' },
  ];

  let prevScope: 'entry' | 'workspace' | null = null;
  for (const { key, label, scope } of modes) {
    // 視覚 separator:entry → workspace の遷移点で `|` を挿入(scoped flag ON 時のみ)。
    if (scoped && prevScope === 'entry' && scope === 'workspace') {
      const sep = createElement('span', 'pkc-view-mode-sep');
      sep.setAttribute('aria-hidden', 'true');
      sep.textContent = '|';
      bar.appendChild(sep);
    }
    prevScope = scope;

    const btn = createElement('button', 'pkc-button-base pkc-button-size-tab pkc-view-mode-btn');
    btn.setAttribute('data-pkc-action', 'set-view-mode');
    btn.setAttribute('data-pkc-view-mode', key);
    btn.textContent = label;
    if (scoped) {
      btn.setAttribute('data-pkc-tab-scope', scope);
    }
    // pgc-111:scoped + entry-level tab + 選択無し → disabled。
    // entry を選ばないと Detail view は意味ないため、視覚 + 機能で抑制。
    if (scoped && scope === 'entry' && !hasSelection) {
      (btn as HTMLButtonElement).disabled = true;
      btn.setAttribute('data-pkc-disabled-reason', 'no-selection');
      btn.setAttribute('title', 'Select an entry to view its detail');
    }
    if (key === viewMode) {
      btn.setAttribute('data-pkc-active', 'true');
    } else {
      // Non-active tabs accept drag-over to switch views during DnD
      btn.setAttribute('data-pkc-view-switch', key);
    }
    bar.appendChild(btn);
  }

  return bar;
}

function renderCalendarView(state: AppState): HTMLElement {
  const cal = createElement('div', 'pkc-calendar');
  cal.setAttribute('data-pkc-region', 'calendar-view');

  // Navigation: < Month Year >
  const nav = createElement('div', 'pkc-calendar-nav');

  const prevBtn = createElement('button', 'pkc-btn pkc-calendar-nav-btn');
  prevBtn.setAttribute('data-pkc-action', 'calendar-prev');
  prevBtn.setAttribute('title', 'Previous month');
  prevBtn.textContent = '◀';
  nav.appendChild(prevBtn);

  const title = createElement('span', 'pkc-calendar-title');
  title.textContent = `${monthName(state.calendarMonth)} ${state.calendarYear}`;
  nav.appendChild(title);

  const nextBtn = createElement('button', 'pkc-btn pkc-calendar-nav-btn');
  nextBtn.setAttribute('data-pkc-action', 'calendar-next');
  nextBtn.setAttribute('title', 'Next month');
  nextBtn.textContent = '▶';
  nav.appendChild(nextBtn);

  cal.appendChild(nav);

  // Day-of-week header
  const header = createElement('div', 'pkc-calendar-header');
  for (const day of ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']) {
    const cell = createElement('div', 'pkc-calendar-dow');
    cell.textContent = day;
    header.appendChild(cell);
  }
  cal.appendChild(header);

  // Build todo map(#938 R8: container ref + showArchived で memoize。
  // 月送りごとの全 entry walk + todo body parse を排除する)
  const todoMap = state.container
    ? getTodosByDate(state.container, state.showArchived)
    : {};

  // Month grid
  const weeks = getMonthGrid(state.calendarYear, state.calendarMonth);
  const today = new Date();
  const todayKey = dateKey(today.getFullYear(), today.getMonth() + 1, today.getDate());
  const grid = createElement('div', 'pkc-calendar-grid');

  for (const week of weeks) {
    for (const day of week) {
      const cell = createElement('div', 'pkc-calendar-cell');
      if (day === null) {
        cell.classList.add('pkc-calendar-cell-empty');
        grid.appendChild(cell);
        continue;
      }

      const key = dateKey(state.calendarYear, state.calendarMonth, day);
      cell.setAttribute('data-pkc-calendar-drop-target', 'true');
      cell.setAttribute('data-pkc-date', key);
      if (key === todayKey) {
        cell.setAttribute('data-pkc-calendar-today', 'true');
      }

      const dayHeader = createElement('div', 'pkc-calendar-day-header');
      const dayNum = createElement('div', 'pkc-calendar-day');
      dayNum.textContent = String(day);
      dayHeader.appendChild(dayNum);

      // Slice 2: per-cell "+ Add" trigger, visible only when editable.
      // See docs/development/todo-editor-in-continuous-edit-wave.md §4.
      if (!state.readonly && state.container) {
        const addBtn = createElement('button', 'pkc-calendar-day-add');
        addBtn.setAttribute('data-pkc-action', 'open-calendar-todo-add');
        addBtn.setAttribute('data-pkc-date', key);
        addBtn.setAttribute('title', `Add new Todo on ${key}`);
        addBtn.setAttribute('aria-label', `Add new Todo on ${key}`);
        addBtn.textContent = '+';
        dayHeader.appendChild(addBtn);
      }
      cell.appendChild(dayHeader);

      // Slice 2: render the Calendar-context popover inside the cell
      // whose date matches the popover state. Single-instance
      // (the reducer guarantees at most one).
      if (
        state.todoAddPopover
        && state.todoAddPopover.context === 'calendar'
        && state.todoAddPopover.date === key
        && !state.readonly
      ) {
        const popEl = createElement('div', 'pkc-calendar-add-popover');
        popEl.setAttribute('data-pkc-region', 'calendar-todo-add-popover');
        popEl.setAttribute('data-pkc-context', 'calendar');
        popEl.setAttribute('data-pkc-context-value', key);
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'pkc-calendar-add-input';
        input.setAttribute('data-pkc-field', 'calendar-todo-add-title');
        input.setAttribute('placeholder', 'New todo…');
        input.setAttribute('autofocus', 'true');
        popEl.appendChild(input);
        const hint = createElement('span', 'pkc-calendar-add-hint');
        hint.textContent = 'Enter · Esc';
        popEl.appendChild(hint);
        cell.appendChild(popEl);
      }

      const todos = todoMap[key];
      if (todos && todos.length > 0) {
        const todoList = createElement('div', 'pkc-calendar-todos');
        const maxShow = 3;
        for (let i = 0; i < Math.min(todos.length, maxShow); i++) {
          const t = todos[i]!;
          const item = createElement('div', 'pkc-calendar-todo-item');
          item.setAttribute('data-pkc-action', 'select-entry');
          item.setAttribute('data-pkc-lid', t.entry.lid);
          if (t.todo.status === 'done') {
            item.setAttribute('data-pkc-todo-status', 'done');
          }
          if (t.todo.archived) {
            item.setAttribute('data-pkc-todo-archived', 'true');
          }
          if (state.selectedLid === t.entry.lid) {
            item.setAttribute('data-pkc-selected', 'true');
          }
          if (state.multiSelectedLids.includes(t.entry.lid)) {
            item.setAttribute('data-pkc-multi-selected', 'true');
          }
          if (isTodoPastDue(t.todo)) {
            item.setAttribute('data-pkc-todo-overdue', 'true');
          }
          // DnD: make calendar todo item draggable in non-readonly mode
          if (!state.readonly) {
            item.setAttribute('draggable', 'true');
            item.setAttribute('data-pkc-calendar-draggable', 'true');
          }
          item.textContent = t.entry.title || t.todo.description || '(untitled)';
          todoList.appendChild(item);
        }
        if (todos.length > maxShow) {
          const more = createElement('div', 'pkc-calendar-todo-more');
          more.textContent = `+${todos.length - maxShow} more`;
          todoList.appendChild(more);
        }
        cell.appendChild(todoList);
      }

      grid.appendChild(cell);
    }
  }

  cal.appendChild(grid);

  // Empty state: hint when no dated todos exist for this month
  const monthKey = `${state.calendarYear}-${pad2(state.calendarMonth)}`;
  const hasTodosThisMonth = Object.keys(todoMap).some((k) => k.startsWith(monthKey));
  if (!hasTodosThisMonth) {
    const empty = createElement('div', 'pkc-calendar-empty');
    empty.setAttribute('data-pkc-region', 'calendar-empty');
    empty.textContent = 'No dated todos this month.';
    cal.appendChild(empty);
  }

  return cal;
}

/**
 * PR-Δ25 (2026-05-07、user 訂正「Filer の一括操作 UI は Filer 側に出す
 * べき」):sidebar の multi-action-bar と等価な UI を filer view 上部に
 * 描画。コードは sidebar 版をミラー(reducer は同一 dispatch を受ける)、
 * 重複は意図的(sidebar/filer の独立性確保)。
 */
function buildFilerMultiActionBar(
  state: AppState,
  viewCtx: 'filer' | 'sidebar' = 'filer',
): HTMLElement {
  const bar = createElement('div', `pkc-multi-action-bar pkc-${viewCtx}-multi-action-bar`);
  bar.setAttribute('data-pkc-region', 'multi-action-bar');
  bar.setAttribute('data-pkc-view-ctx', viewCtx);
  const info = createElement('span', 'pkc-multi-action-info');
  info.textContent = `${state.multiSelectedLids.length} selected`;
  bar.appendChild(info);
  const deleteBtn = createElement('button', 'pkc-btn-small pkc-btn-danger');
  deleteBtn.setAttribute('data-pkc-action', 'bulk-delete');
  deleteBtn.textContent = 'Delete';
  bar.appendChild(deleteBtn);
  if (state.container) {
    const folders = state.container.entries.filter(
      (e) => e.archetype === 'folder' && !state.multiSelectedLids.includes(e.lid),
    );
    if (folders.length > 0) {
      const moveSelect = document.createElement('select');
      moveSelect.className = 'pkc-multi-action-move';
      moveSelect.setAttribute('data-pkc-action', 'bulk-move-select');
      const ph = document.createElement('option');
      ph.value = ''; ph.textContent = 'Move to...'; ph.disabled = true; ph.selected = true;
      moveSelect.appendChild(ph);
      const rootOpt = document.createElement('option');
      rootOpt.value = '__root__'; rootOpt.textContent = '/ (Root)';
      moveSelect.appendChild(rootOpt);
      for (const f of folders) {
        const opt = document.createElement('option');
        opt.value = f.lid; opt.textContent = `📁 ${f.title || '(untitled)'}`;
        moveSelect.appendChild(opt);
      }
      bar.appendChild(moveSelect);
    }
    // tag input
    const tagInput = document.createElement('input');
    tagInput.type = 'text';
    tagInput.className = 'pkc-multi-action-tag-input';
    tagInput.placeholder = 'タグ追加 (Enter)';
    tagInput.setAttribute('data-pkc-action', 'bulk-add-tag-input');
    tagInput.setAttribute('data-pkc-field', 'bulk-add-tag');
    tagInput.title = '選択中の全エントリに同じタグを追加';
    bar.appendChild(tagInput);
    // color tag
    const colorSelect = document.createElement('select');
    colorSelect.className = 'pkc-multi-action-color';
    colorSelect.setAttribute('data-pkc-action', 'bulk-set-color-tag');
    const cph = document.createElement('option');
    cph.value = ''; cph.textContent = 'Color...'; cph.disabled = true; cph.selected = true;
    colorSelect.appendChild(cph);
    for (const c of ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'gray']) {
      const opt = document.createElement('option');
      opt.value = c; opt.textContent = c;
      colorSelect.appendChild(opt);
    }
    const cloneOpt = document.createElement('option');
    cloneOpt.value = '__none__'; cloneOpt.textContent = '✕ 解除';
    colorSelect.appendChild(cloneOpt);
    bar.appendChild(colorSelect);
  }
  const clearBtn = createElement('button', 'pkc-btn-small');
  clearBtn.setAttribute('data-pkc-action', 'clear-multi-select');
  clearBtn.textContent = 'Clear';
  bar.appendChild(clearBtn);
  return bar;
}

function renderFilerView(state: AppState): HTMLElement {
  const filer = createElement('div', 'pkc-filer');
  filer.setAttribute('data-pkc-region', 'filer-view');

  // PR-Δ25:filer view top に multi-action-bar を表示。
  if (state.multiSelectedLids.length > 0 && !state.readonly) {
    filer.appendChild(buildFilerMultiActionBar(state));
  }

  // Trash mode short-circuits the normal folder-scope render. The
  // toolbar's "Trash" toggle dispatches SET_FILER_SCOPE 'trash' and
  // restoration / purge use the same actions as the sidebar trash
  // pane (RESTORE_ENTRY / PURGE_TRASH).
  if (state.filerScope === 'trash') {
    filer.setAttribute('data-pkc-subset', 'trash');
    filer.setAttribute('data-pkc-filer-scope', 'trash');
    filer.appendChild(renderFilerTrashHeader(state));
    filer.appendChild(renderFilerTrashTable(state));
    return filer;
  }

  const scope = resolveFilerScope(state);
  const profile = resolveFilerSubsetForScope(state, scope);
  filer.setAttribute('data-pkc-subset', profile.kind);
  if (scope) filer.setAttribute('data-pkc-filer-scope-lid', scope.lid);

  filer.appendChild(renderFilerHeader(state, scope, profile));

  // PR-L (2026-05-06):filer 検索 query 反映。空 → direct children、
  // 非空 → scope 配下を再帰展開して title 部分一致で flat 表示。
  const searchQuery = (state.filerSearchQuery ?? '').trim().toLowerCase();
  let visibleChildren: Entry[];
  if (searchQuery.length > 0) {
    // Subtree walk: BFS from scope (or root entries) collecting all
    // descendants. Then title-substring filter.
    const allEntries = (state.container?.entries ?? []).filter(
      (e) => !isSystemArchetype(e.archetype),
    );
    const rels = state.container?.relations ?? [];
    const childrenByParent = new Map<string, string[]>();
    for (const r of rels) {
      if (r.kind !== 'structural') continue;
      const arr = childrenByParent.get(r.from) ?? [];
      arr.push(r.to);
      childrenByParent.set(r.from, arr);
    }
    const reachable = new Set<string>();
    const queue: string[] = [];
    if (scope) {
      const initial = childrenByParent.get(scope.lid) ?? [];
      queue.push(...initial);
    } else {
      queue.push(...getRootEntries(rels, allEntries).map((e) => e.lid));
    }
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (reachable.has(id)) continue;
      reachable.add(id);
      const sub = childrenByParent.get(id);
      if (sub) queue.push(...sub);
    }
    visibleChildren = allEntries.filter(
      // ここは **表示ではなく検索の haystack** なので lid fallback のままで
      // 正しい(lid で引けるのは意図した挙動)。表示側の `title || lid` は
      // 内部 ID が画面に漏れるため 2026-07-25 に全部 `(untitled)` へ統一済 ──
      // 同じ形をしていても混同しないこと。
      (e) => reachable.has(e.lid) && (e.title || e.lid).toLowerCase().includes(searchQuery),
    );
  } else {
    const children = scope
      ? getStructuralChildren(state.container?.relations ?? [], state.container?.entries ?? [], scope.lid)
      : getRootEntries(state.container?.relations ?? [], state.container?.entries ?? []);
    // System entries should never surface in the filer.
    visibleChildren = children.filter((e) => !isSystemArchetype(e.archetype));
  }

  // Even an empty folder still renders the subset surface so the
  // "." and ".." navigation affordances stay reachable. The empty
  // message becomes a peer node when there are no real children.
  const isEmptyChildren = visibleChildren.length === 0;

  // Subset render dispatch — 領域 10-6 ζ'' Phase 3a.
  switch (profile.kind) {
    case 'contact-sheet':
      filer.appendChild(renderFilerContactSheet(state, visibleChildren, profile));
      break;
    case 'book-base':
      filer.appendChild(renderFilerCardGrid(state, visibleChildren, 'book'));
      break;
    case 'video-base':
      filer.appendChild(renderFilerCardGrid(state, visibleChildren, 'video'));
      break;
    case 'novel-base':
      filer.appendChild(renderFilerCardGrid(state, visibleChildren, 'novel'));
      break;
    case 'audio-base':
      filer.appendChild(renderFilerCardGrid(state, visibleChildren, 'audio'));
      break;
    // PR-HHH (2026-05-06、user 修正指示5「廃止したはずのFilerのGraph
    // がまだ活きている。センターペインのGraphタブが正です」):filer
    // 内 Graph subset を廃止、center pane viewMode='graph' タブが
    // canonical。`profile.kind === 'graph'` が container に残っていても
    // 引き続き受理する(後方互換)が、explorer table へ silent fallback
    // (default 分岐に流す)。inventory は別枝で生かす。
    case 'inventory':
      filer.appendChild(renderFilerInventory(state, visibleChildren));
      break;
    case 'explorer':
    default:
      filer.appendChild(renderFilerExplorerTable(state, visibleChildren));
      break;
  }
  if (isEmptyChildren) {
    const empty = createElement('div', 'pkc-filer-empty');
    empty.setAttribute('data-pkc-region', 'filer-empty');
    empty.textContent = scope
      ? 'このフォルダには項目がありません。'
      : '表示できるエントリがありません。';
    filer.appendChild(empty);
  }
  return filer;
}

function renderFilerTrashHeader(state: AppState): HTMLElement {
  const header = createElement('header', 'pkc-filer-header');
  header.setAttribute('data-pkc-region', 'filer-header');

  const breadcrumb = createElement('nav', 'pkc-filer-breadcrumb');
  breadcrumb.setAttribute('data-pkc-region', 'filer-breadcrumb');
  const back = createElement('button', 'pkc-filer-breadcrumb-segment');
  back.setAttribute('data-pkc-action', 'filer-scope-folder');
  back.setAttribute('data-pkc-filer-breadcrumb', 'back-from-trash');
  back.textContent = '← フォルダ';
  breadcrumb.appendChild(back);
  const sep = createElement('span', 'pkc-filer-breadcrumb-sep');
  sep.textContent = ' / ';
  breadcrumb.appendChild(sep);
  const trashSeg = createElement('span', 'pkc-filer-breadcrumb-segment pkc-filer-breadcrumb-trash');
  trashSeg.setAttribute('data-pkc-filer-breadcrumb', 'trash');
  trashSeg.textContent = '🗑️ ゴミ箱';
  breadcrumb.appendChild(trashSeg);
  header.appendChild(breadcrumb);

  const subset = createElement('span', 'pkc-filer-subset-label');
  subset.setAttribute('data-pkc-filer-subset-label', 'trash');
  subset.textContent = 'Trash';
  header.appendChild(subset);

  // Empty-trash button (only when there's something to purge).
  if (state.container && state.phase === 'ready' && !state.readonly) {
    const visibleCandidates = getTrashCandidatesForFiler(state);
    if (visibleCandidates.length > 0) {
      const purge = createElement('button', 'pkc-btn-small pkc-filer-trash-purge');
      purge.setAttribute('data-pkc-action', 'purge-trash');
      purge.setAttribute('title', 'ゴミ箱を空にする(取り消し不可)');
      purge.textContent = 'ゴミ箱を空にする';
      header.appendChild(purge);
    }
  }
  return header;
}

function getTrashCandidatesForFiler(state: AppState): Revision[] {
  if (!state.container) return [];
  const all = getRestoreCandidates(state.container);
  return all.filter((rev) => {
    if (isReservedLid(rev.entry_lid)) return false;
    const parsed = parseRevisionSnapshot(rev);
    if (parsed && isSystemArchetype(parsed.archetype)) return false;
    return true;
  });
}

function renderFilerTrashTable(state: AppState): HTMLElement {
  const wrapper = createElement('div', 'pkc-filer-table-wrapper');
  wrapper.setAttribute('data-pkc-region', 'filer-table-wrapper');

  const candidates = getTrashCandidatesForFiler(state);

  if (candidates.length === 0) {
    const empty = createElement('div', 'pkc-filer-empty');
    empty.setAttribute('data-pkc-region', 'filer-empty');
    empty.textContent = 'ゴミ箱は空です。';
    wrapper.appendChild(empty);
    return wrapper;
  }

  const table = createElement('table', 'pkc-filer-table');
  table.setAttribute('data-pkc-region', 'filer-table');

  const thead = createElement('thead', 'pkc-filer-thead');
  const headRow = createElement('tr', 'pkc-filer-head-row');
  for (const label of ['名前', '種類', '削除日時', '操作']) {
    const th = createElement('th', 'pkc-filer-th');
    th.textContent = label;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const canEdit = state.phase === 'ready' && !state.readonly;
  const tbody = createElement('tbody', 'pkc-filer-tbody');
  for (const rev of candidates) {
    const parsed = parseRevisionSnapshot(rev);
    const tr = createElement('tr', 'pkc-filer-row pkc-filer-row-trash');
    tr.setAttribute('data-pkc-revision-id', rev.id);
    tr.setAttribute('data-pkc-lid', rev.entry_lid);

    const nameTd = createElement('td', 'pkc-filer-cell pkc-filer-cell-name');
    if (parsed) {
      const icon = createElement('span', 'pkc-filer-row-icon');
      icon.textContent = archetypeIcon(parsed.archetype);
      nameTd.appendChild(icon);
    }
    const titleSpan = createElement('span', 'pkc-filer-row-title');
    titleSpan.textContent = (parsed?.title ?? rev.entry_lid).trim() || rev.entry_lid;
    nameTd.appendChild(titleSpan);
    tr.appendChild(nameTd);

    const archTd = createElement('td', 'pkc-filer-cell pkc-filer-cell-archetype');
    archTd.textContent = parsed ? archetypeLabel(parsed.archetype) : '—';
    tr.appendChild(archTd);

    const updTd = createElement('td', 'pkc-filer-cell pkc-filer-cell-updated');
    updTd.textContent = formatTimestamp(rev.created_at);
    tr.appendChild(updTd);

    const actTd = createElement('td', 'pkc-filer-cell pkc-filer-cell-actions');
    if (canEdit) {
      const restore = createElement('button', 'pkc-btn-small');
      restore.setAttribute('data-pkc-action', 'restore-entry');
      restore.setAttribute('data-pkc-lid', rev.entry_lid);
      restore.setAttribute('data-pkc-revision-id', rev.id);
      restore.textContent = '復元';
      actTd.appendChild(restore);
    }
    tr.appendChild(actTd);

    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrapper.appendChild(table);
  return wrapper;
}

/**
 * Resolve which folder is the current "filer scope" — the folder
 * whose children are listed in the table.
 *
 * Rules:
 *   1. If the selected entry is a folder, that folder is the scope.
 *   2. Otherwise, walk structural ancestors until we hit a folder.
 *   3. If neither yields a folder, the scope is `null` (= root).
 */
function resolveFilerScope(state: AppState): Entry | null {
  const lid = state.selectedLid;
  if (!lid || !state.container) return null;
  const { entryByLid } = getFilterIndexes(state.container);
  const entry = entryByLid.get(lid);
  if (!entry) return null;
  if (entry.archetype === 'folder') return entry;
  const ancestors = getAncestorFolderLids(state.container.relations, state.container.entries, lid);
  const nearest = ancestors[0];
  if (!nearest) return null;
  return entryByLid.get(nearest) ?? null;
}

/**
 * Resolve the FilerProfile for a given scope.
 *
 * PR-G G15 (2026-05-06):display_profile が undefined または `{kind:'auto'}`
 * のとき、folder の direct children を 7 割多数決で classify して
 * concrete profile に解決する。それ以外の kind はそのまま返す。
 */
function resolveFilerSubsetForScope(state: AppState, scope: Entry | null): FilerProfile {
  const explicit = scope && scope.archetype === 'folder' ? scope.display_profile : undefined;
  if (explicit && explicit.kind !== 'auto') {
    return explicit;
  }
  // PR-2EE (2026-05-12、reform Phase 3 Block E):folder frontmatter
  // `kind: album` で明示的に album folder と宣言された場合、7 割多数決
  // (autoDetectFilerProfile)を bypass して強制的に contact-sheet を選択。
  // user 意図が画像 % 閾値を超えて優先される。
  if (scope && isExplicitAlbum(scope)) {
    return { kind: 'contact-sheet' };
  }
  // Auto-detect から実 profile を決める。scope === null = container root
  // のときは scope 全 user entries を直接 children として扱う(root も
  // 一種の folder として「中身が画像ばかりなら album」を適用したい)。
  if (!state.container) return { kind: 'explorer' };
  const allUserEntries = state.container.entries.filter((e) => !isSystemArchetype(e.archetype));
  let children: Entry[];
  if (scope) {
    const childLids = new Set<string>();
    for (const r of state.container.relations) {
      if (r.kind === 'structural' && r.from === scope.lid) childLids.add(r.to);
    }
    children = allUserEntries.filter((e) => childLids.has(e.lid));
  } else {
    children = allUserEntries;
  }
  return autoDetectFilerProfile(children);
}

function renderFilerHeader(state: AppState, scope: Entry | null, profile: FilerProfile): HTMLElement {
  const header = createElement('header', 'pkc-filer-header');
  header.setAttribute('data-pkc-region', 'filer-header');

  // Create-entry toolbar: same `create-entry` action used by the main
  // header. resolveContextFolder() picks up the filer scope folder as
  // parent automatically because we set selectedLid = scope.lid when
  // scope changes (so newly-created entries land inside the visible
  // folder, matching the user's mental model of "create here").
  const canEdit = state.phase === 'ready' && !state.readonly;
  if (canEdit) {
    const toolbar = createElement('div', 'pkc-filer-toolbar');
    toolbar.setAttribute('data-pkc-region', 'filer-toolbar');
    const archetypeButtons: { arch: ArchetypeId; label: string; tip: string }[] = [
      { arch: 'folder', label: `${archetypeIcon('folder')} Folder`, tip: 'Create a new folder here' },
      { arch: 'text', label: `${archetypeIcon('text')} Text`, tip: 'Create a new text entry here' },
      { arch: 'textlog', label: `${archetypeIcon('textlog')} Log`, tip: 'Create a new textlog entry here' },
      { arch: 'todo', label: `${archetypeIcon('todo')} Todo`, tip: 'Create a new todo entry here' },
      { arch: 'spreadsheet', label: `${archetypeIcon('spreadsheet')} Sheet`, tip: 'Create a new spreadsheet entry here' },
      { arch: 'attachment', label: `${archetypeIcon('attachment')} File`, tip: 'Create a new file attachment here' },
    ];
    for (const { arch, label, tip } of archetypeButtons) {
      const btn = createElement('button', 'pkc-btn-small pkc-filer-create-btn');
      btn.setAttribute('data-pkc-action', 'create-entry');
      btn.setAttribute('data-pkc-archetype', arch);
      btn.setAttribute('title', tip);
      btn.textContent = label;
      toolbar.appendChild(btn);
    }
    // Trash toggle — opens the deleted-entries listing inside the
    // filer. Click again (via the breadcrumb back link) returns to
    // folder scope.
    const trashBtn = createElement('button', 'pkc-btn-small pkc-filer-trash-btn');
    trashBtn.setAttribute('data-pkc-action', 'filer-scope-trash');
    trashBtn.setAttribute('title', 'ゴミ箱を開く(削除済みエントリ一覧)・ここに DnD で削除');
    // 2026-05-06 G13: filer 内の row / card を drop すると削除する
    // drop target にする(ゴミ箱への DnD)。
    trashBtn.setAttribute('data-pkc-drop-target', 'trash');
    trashBtn.textContent = '🗑️ ゴミ箱';
    toolbar.appendChild(trashBtn);
    header.appendChild(toolbar);
  }

  const breadcrumb = createElement('nav', 'pkc-filer-breadcrumb');
  breadcrumb.setAttribute('data-pkc-region', 'filer-breadcrumb');
  const trail: { label: string; lid: string | null; isCurrent?: boolean }[] = [
    { label: 'Root', lid: null },
  ];
  if (scope && state.container) {
    const ancestors = getAncestorFolderLids(state.container.relations, state.container.entries, scope.lid);
    const { entryByLid } = getFilterIndexes(state.container);
    // ancestors are nearest-first; reverse to get root-to-current order.
    for (const aLid of ancestors.slice().reverse()) {
      const a = entryByLid.get(aLid);
      if (a) trail.push({ label: a.title || '(untitled)', lid: a.lid });
    }
    trail.push({ label: scope.title || '(untitled)', lid: scope.lid, isCurrent: true });
  }
  // PR-Δ25 (2026-05-07、user 報告「深い folder 階層で path が表示
  // しきれない」):trail.length > 5 のとき middle 部を「⋯」で集約し、
  // 集約 button hover で full path を tooltip 表示、click で展開。
  // 常に root + 最初 + 末尾 2 segments は visible にして context を保つ。
  const collapsedTrail: typeof trail = [];
  if (trail.length <= 5) {
    collapsedTrail.push(...trail);
  } else {
    collapsedTrail.push(trail[0]!); // root
    collapsedTrail.push(trail[1]!); // top-level
    // ellipsis placeholder; lid carries full middle path joined
    const middle = trail.slice(2, trail.length - 2);
    const ellipsisLabels = middle.map((s) => s.label).join(' / ');
    collapsedTrail.push({ label: `⋯ (${middle.length})`, lid: `__ellipsis__:${ellipsisLabels}` });
    collapsedTrail.push(trail[trail.length - 2]!);
    collapsedTrail.push(trail[trail.length - 1]!);
  }

  for (let i = 0; i < collapsedTrail.length; i++) {
    const seg = collapsedTrail[i]!;
    if (i > 0) {
      const sep = createElement('span', 'pkc-filer-breadcrumb-sep');
      sep.textContent = ' / ';
      breadcrumb.appendChild(sep);
    }
    if (seg.lid && seg.lid.startsWith('__ellipsis__:')) {
      const tooltipText = seg.lid.slice('__ellipsis__:'.length);
      const ellSpan = createElement('span', 'pkc-filer-breadcrumb-segment pkc-filer-breadcrumb-ellipsis');
      ellSpan.textContent = seg.label;
      ellSpan.title = tooltipText;
      breadcrumb.appendChild(ellSpan);
      continue;
    }
    if (seg.lid === null) {
      // Root segment is clickable — DESELECT_ENTRY moves the filer
      // scope to the container root so user can browse top-level
      // entries(2026-05-06 user direction:「Root フォルダを開けない。
      // Root は開けなくてはならない」)。
      const link = createElement('button', 'pkc-filer-breadcrumb-segment pkc-filer-breadcrumb-root');
      link.setAttribute('data-pkc-action', 'filer-scope-root');
      link.setAttribute('data-pkc-filer-breadcrumb', 'root');
      link.textContent = seg.label;
      breadcrumb.appendChild(link);
    } else if (seg.isCurrent && canEdit) {
      // Current folder breadcrumb segment is editable inline
      // (GitHub 風、2026-05-06 user direction)。Edit on input → blur
      // dispatches RENAME_ENTRY_TITLE。
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'pkc-filer-breadcrumb-segment pkc-filer-breadcrumb-current';
      input.setAttribute('data-pkc-action', 'rename-folder');
      input.setAttribute('data-pkc-lid', seg.lid);
      input.setAttribute('data-pkc-filer-breadcrumb', 'current');
      input.value = seg.label;
      // Auto-size to content via attribute size estimate.
      input.size = Math.max(8, Math.min(40, seg.label.length + 2));
      breadcrumb.appendChild(input);
    } else {
      const link = createElement('button', 'pkc-filer-breadcrumb-segment');
      link.setAttribute('data-pkc-action', 'select-entry');
      link.setAttribute('data-pkc-lid', seg.lid);
      link.setAttribute('data-pkc-filer-breadcrumb', 'folder');
      link.textContent = seg.label;
      breadcrumb.appendChild(link);
    }
  }
  header.appendChild(breadcrumb);

  const subsetBadge = createElement('span', 'pkc-filer-subset-label');
  subsetBadge.setAttribute('data-pkc-filer-subset-label', profile.kind);
  subsetBadge.textContent = subsetLabelText(profile.kind);
  header.appendChild(subsetBadge);

  // PR-L (2026-05-06):filer 側の検索窓。空文字列で direct children、
  // 非空文字列で scope 配下の **全 descendants** を title 部分一致で
  // 絞り込み。「左ペインの代替活用 / 大規模管理用」目的の foundation。
  const searchWrap = createElement('div', 'pkc-filer-search-wrap');
  searchWrap.setAttribute('data-pkc-region', 'filer-search');
  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.className = 'pkc-filer-search-input';
  searchInput.setAttribute('data-pkc-action', 'set-filer-search-query');
  // PR-QQQ (2026-05-07、user 修正指示7「Filer の検索窓からフォーカス
  // が勝手に外れる。日本語の変換とかに支障大」):render-continuity
  // helper が focus + caret を復元するための data-pkc-field を付与。
  // SET_FILER_SEARCH_QUERY dispatch で full re-render が走っても、
  // 同 field 名の input が新 DOM にあれば focus + caret + selection
  // が保持される。
  searchInput.setAttribute('data-pkc-field', 'filer-search');
  searchInput.setAttribute('placeholder', '🔍 タイトル検索(scope 配下を再帰)');
  searchInput.value = state.filerSearchQuery ?? '';
  searchWrap.appendChild(searchInput);
  header.appendChild(searchWrap);

  return header;
}

function subsetLabelText(kind: FilerProfile['kind']): string {
  switch (kind) {
    case 'auto':
      return 'Auto';
    case 'explorer':
      return 'Explorer';
    case 'contact-sheet':
      return 'Contact sheet';
    case 'book-base':
      return 'Book base';
    case 'video-base':
      return 'Video base';
    case 'novel-base':
      return 'Novel base';
    case 'audio-base':
      return 'Audio base';
    case 'graph':
      return 'Graph';
    case 'inventory':
      return 'Inventory';
  }
}

/**
 * Resolve "." (current folder) and ".." (parent folder) navigation
 * affordances for the filer view.
 *
 * 2026-05-06 user direction(G14):「..」が表示されないという報告 →
 * **常に「..」を出す**ように修正。structural parent が無い top-level
 * folder の「..」は Container root へ戻す sentinel(`__root__`)を target
 * として返し、action-binder 側で `filer-scope-root` 動作にマップする。
 * これで user は filer 内のどの位置からも一段上に戻れる。
 */
const ROOT_NAV_SENTINEL_LID = '__root__';

function resolveFilerNavigation(state: AppState): {
  current: Entry | null;
  parent: Entry | null;
  parentIsRootSentinel?: boolean;
} {
  const scope = resolveFilerScope(state);
  if (!scope) return { current: null, parent: null };
  if (!state.container) return { current: scope, parent: null };
  const parent = getStructuralParent(state.container.relations, state.container.entries, scope.lid);
  if (parent) return { current: scope, parent };
  // Top-level folder — synthesize a sentinel "Root" entry for the
  // ".." row. The action-binder maps this lid to filer-scope-root.
  const rootSentinel: Entry = {
    lid: ROOT_NAV_SENTINEL_LID,
    title: 'Root',
    body: '',
    archetype: 'folder',
    created_at: '',
    updated_at: '',
  };
  return { current: scope, parent: rootSentinel, parentIsRootSentinel: true };
}

// PR-EE (2026-05-06):buildFilerNavCard / buildFilerNavRow は削除
// (user direction「. / .. row は breadcrumb のパンくずで代替可能なため
// 不要」)。breadcrumb の root / parent click が同等 navigation を提供。

function renderFilerExplorerTable(state: AppState, children: readonly Entry[]): HTMLElement {
  const wrapper = createElement('div', 'pkc-filer-table-wrapper');
  wrapper.setAttribute('data-pkc-region', 'filer-table-wrapper');

  const table = createElement('table', 'pkc-filer-table');
  table.setAttribute('data-pkc-region', 'filer-table');

  const thead = createElement('thead', 'pkc-filer-thead');
  const headRow = createElement('tr', 'pkc-filer-head-row');
  const cols: { key: 'name' | 'archetype' | 'created_at' | 'updated_at' | 'tags'; label: string }[] = [
    { key: 'name', label: '名前' },
    { key: 'archetype', label: '種類' },
    { key: 'created_at', label: '作成' },
    { key: 'updated_at', label: '更新' },
    { key: 'tags', label: 'タグ' },
  ];
  const sortState = state.filerExplorerSort ?? {};
  const sortBy = sortState.sortBy ?? null;
  const sortDir = sortState.sortDir ?? 'asc';
  const colValue = (e: Entry, key: string): string => {
    if (key === 'name') return e.title || '(untitled)';
    if (key === 'archetype') return e.archetype;
    if (key === 'created_at') return e.created_at;
    if (key === 'updated_at') return e.updated_at;
    if (key === 'tags') return (e.tags ?? []).join(', ');
    return '';
  };
  let sortedChildren: Entry[] = children.slice();
  if (sortBy) {
    sortedChildren = sortedChildren.sort((a, b) => {
      const va = colValue(a, sortBy);
      const vb = colValue(b, sortBy);
      const cmp = va.localeCompare(vb);
      return sortDir === 'desc' ? -cmp : cmp;
    });
  }
  // PR-Δ2 (2026-05-07、修正指示9):filer 列幅 drag-resize handle。
  // localStorage `pkc2.filer.column-widths` から永続化された幅を読み出し、
  // <th> の width style に上書き反映。最終 col には resize handle 不要。
  const persistedWidths = readFilerColumnWidths();

  // PR-Δ3 (2026-05-07、修正指示9):multi-select check column を先頭に
  // 追加。header checkbox は visible 全選択 / 全解除のトグル。
  const allSelectedVisible =
    sortedChildren.length > 0
    && sortedChildren.every((c) => (state.multiSelectedLids ?? []).includes(c.lid));
  const someSelectedVisible =
    !allSelectedVisible
    && sortedChildren.some((c) => (state.multiSelectedLids ?? []).includes(c.lid));
  const checkTh = createElement('th', 'pkc-filer-th pkc-filer-th-check');
  const checkAll = document.createElement('input');
  checkAll.type = 'checkbox';
  checkAll.className = 'pkc-filer-row-check';
  checkAll.setAttribute('data-pkc-action', 'filer-toggle-all-multi-select');
  checkAll.setAttribute('aria-label', '全選択切替');
  checkAll.title = '全選択 / 全解除';
  checkAll.checked = allSelectedVisible;
  checkAll.indeterminate = someSelectedVisible;
  checkTh.appendChild(checkAll);
  headRow.appendChild(checkTh);

  for (let i = 0; i < cols.length; i++) {
    const c = cols[i]!;
    const th = createElement('th', `pkc-filer-th pkc-filer-th-${c.key}`);
    th.setAttribute('data-pkc-filer-column', c.key);
    th.setAttribute('data-pkc-action', 'set-filer-explorer-sort');
    th.setAttribute('data-pkc-sort-key', c.key);
    // 永続化幅があれば反映、なければ CSS 既定の % 比率に任せる。
    const w = persistedWidths[c.key];
    if (typeof w === 'number' && w > 0) {
      (th as HTMLElement).style.width = `${w}px`;
    }
    const labelSpan = document.createElement('span');
    labelSpan.className = 'pkc-filer-th-label';
    const arrow = sortBy === c.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';
    labelSpan.textContent = `${c.label}${arrow}`;
    th.appendChild(labelSpan);
    // Resize handle - 最終 col は省略(右端を引き伸ばすのは別 col の
    // 縮小と意味的に同じだが、UX 上不要混乱の元)。
    if (i < cols.length - 1) {
      const handle = document.createElement('span');
      handle.className = 'pkc-filer-th-resize';
      handle.setAttribute('data-pkc-action', 'filer-col-resize-start');
      handle.setAttribute('data-pkc-col', c.key);
      handle.setAttribute('aria-hidden', 'true');
      handle.title = '列幅をドラッグで調整';
      th.appendChild(handle);
    }
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = createElement('tbody', 'pkc-filer-tbody');
  const canEditDnd = state.phase === 'ready' && !state.readonly;

  // PR-EE (2026-05-06、user 報告):「.」「..」row は breadcrumb の
  // パンくず動作で代替できるため削除(user direction:「結果的に不要
  // となったため削除、パス表示からのパンクズ動作で代替可能」)。
  // breadcrumb の Root / 親 folder click で同等の navigation が成立する。
  // resolveFilerNavigation は data-pkc-region="filer-breadcrumb" の
  // 描画でも参照されるので、削除はせず call 側のみ撤去。

  // PR-Δ3 (2026-05-07、修正指示9):filer multi-select 視認性。
  // sidebar と同じく `data-pkc-multi-selected="true"` で active 装飾。
  const multiSet = new Set<string>(state.multiSelectedLids ?? []);
  for (const child of sortedChildren) {
    const tr = createElement('tr', 'pkc-filer-row');
    tr.setAttribute('data-pkc-action', 'select-entry');
    tr.setAttribute('data-pkc-lid', child.lid);
    tr.setAttribute('data-pkc-archetype', child.archetype);
    // DnD: filer row is draggable (move-by-DnD reuses the existing
    // sidebar handler in action-binder via `data-pkc-draggable`).
    // Folder rows are also drop targets (drop another row → move into).
    if (canEditDnd) {
      (tr as HTMLTableRowElement).draggable = true;
      tr.setAttribute('data-pkc-draggable', 'true');
      if (child.archetype === 'folder') {
        tr.setAttribute('data-pkc-drop-target', 'folder');
      }
    }
    if (child.lid === state.selectedLid) {
      tr.setAttribute('data-pkc-active', 'true');
    }
    if (multiSet.has(child.lid)) {
      tr.setAttribute('data-pkc-multi-selected', 'true');
    }
    // pgc-134 wave-δ #9(MASTER.md §7 todo):flag ON 時に filer row でも
    // overdue indicator。sidebar と同 attr / CSS で統一。
    if (
      shellTodoOverdueIndicatorEnabled() &&
      child.archetype === 'todo' &&
      isTodoPastDue(parseTodoBody(child.body, child))
    ) {
      tr.setAttribute('data-pkc-todo-overdue', 'true');
    }

    // PR-Δ3 multi-select checkbox cell(先頭に挿入)。
    const checkTd = createElement('td', 'pkc-filer-cell pkc-filer-cell-check');
    const checkBox = document.createElement('input');
    checkBox.type = 'checkbox';
    checkBox.className = 'pkc-filer-row-check';
    checkBox.setAttribute('data-pkc-action', 'filer-toggle-row-multi-select');
    checkBox.setAttribute('data-pkc-lid', child.lid);
    checkBox.setAttribute('aria-label', '選択切替');
    checkBox.checked = multiSet.has(child.lid);
    checkTd.appendChild(checkBox);
    tr.appendChild(checkTd);

    const nameTd = createElement('td', 'pkc-filer-cell pkc-filer-cell-name');
    const icon = createElement('span', 'pkc-filer-row-icon');
    icon.textContent = archetypeIcon(child.archetype);
    nameTd.appendChild(icon);
    const titleSpan = createElement('span', 'pkc-filer-row-title');
    const fullTitle = child.title || '(untitled)';
    // PR-SSS (2026-05-07、修正指示7 #3):中間省略 + tooltip。長文件名
    // (>40 char)で頭尾だけ残して中間を ellipsis 化、末尾 8 char で
    // date / 拡張子 / suffix を保持。`title` 属性に full text を載せ
    // hover で全名確認可能。短い title は通常の tail ellipsis(CSS)に任せる。
    titleSpan.textContent = truncateMiddle(fullTitle, 48);
    titleSpan.title = fullTitle;
    nameTd.appendChild(titleSpan);
    tr.appendChild(nameTd);

    const archTd = createElement('td', 'pkc-filer-cell pkc-filer-cell-archetype');
    archTd.textContent = archetypeLabel(child.archetype);
    tr.appendChild(archTd);

    const createdTd = createElement('td', 'pkc-filer-cell pkc-filer-cell-created');
    createdTd.textContent = formatTimestamp(child.created_at);
    createdTd.title = child.created_at;
    tr.appendChild(createdTd);

    const updTd = createElement('td', 'pkc-filer-cell pkc-filer-cell-updated');
    updTd.textContent = formatTimestamp(child.updated_at);
    updTd.title = child.updated_at;
    tr.appendChild(updTd);

    const tagsTd = createElement('td', 'pkc-filer-cell pkc-filer-cell-tags');
    const tags = child.tags ?? [];
    if (tags.length === 0) {
      tagsTd.textContent = '';
    } else {
      tagsTd.title = tags.join(', ');
      for (const tag of tags) {
        const chip = createElement('span', 'pkc-filer-tag-chip');
        chip.textContent = tag;
        tagsTd.appendChild(chip);
      }
    }
    tr.appendChild(tagsTd);

    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrapper.appendChild(table);
  return wrapper;
}

/**
 * PR-Δ2 (2026-05-07、修正指示9 ファイラ列幅調整):
 * `localStorage.pkc2.filer.column-widths` を JSON parse して
 * `{ [colKey]: pxWidth }` を返す。stale / corrupted 値は安全に無視。
 *
 * 永続化キーは action-binder (case 'filer-col-resize-start' の mouseup)
 * から書き込まれる。
 */
const FILER_COLUMN_WIDTHS_KEY = 'pkc2.filer.column-widths';

function readFilerColumnWidths(): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    // C11: ui-prefs facade 経由(container バッグ優先 + localStorage
    // ミラー)。
    const raw = getUiPref(FILER_COLUMN_WIDTHS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v) && v > 20 && v < 2000) {
        out[k] = v;
      }
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Middle-truncate a long string while preserving `tailLen` characters
 * at the end. Used by the filer explorer name cell so that file names
 * like `2026-04-25_dump_long_name.pdf` keep their date prefix and
 * extension visible after the ellipsis. Returns the original string
 * unchanged when its length doesn't exceed `maxLen`.
 *
 * PR-SSS (2026-05-07、修正指示7 #3)。
 */
function truncateMiddle(s: string, maxLen: number, tailLen = 8): string {
  if (s.length <= maxLen) return s;
  const headLen = maxLen - tailLen - 1;
  if (headLen <= 0) return s;
  return `${s.slice(0, headLen)}…${s.slice(-tailLen)}`;
}

/**
 * Contact-sheet subset (領域 10-6 ζ'' Phase 3a).
 * Image-attachment-leading folders (album/scrap/portfolio) become a
 * grid of thumbnails with caption underneath. Non-image children fall
 * back to a small icon card so a mixed folder still renders cleanly.
 */
function renderFilerContactSheet(
  state: AppState,
  children: readonly Entry[],
  profile: { kind: 'contact-sheet'; cell_size?: 'sm' | 'md' | 'lg' },
): HTMLElement {
  const wrapper = createElement('div', 'pkc-filer-table-wrapper');
  wrapper.setAttribute('data-pkc-region', 'filer-table-wrapper');

  const grid = createElement('div', 'pkc-filer-grid pkc-filer-grid-contact-sheet');
  grid.setAttribute('data-pkc-region', 'filer-grid');
  grid.setAttribute('data-pkc-cell-size', profile.cell_size ?? 'md');
  // Per-subset thumbnail size flag(2026-05-06 user direction G10)。
  grid.style.setProperty('--filer-thumb-px', `${getFilerThumbPx('album')}px`);

  const canEditDnd = state.phase === 'ready' && !state.readonly;
  const assets = state.container?.assets ?? {};

  // PR-EE (2026-05-06):「.」「..」 card は breadcrumb で代替可能のため
  // 削除(user direction)。

  for (const child of children) {
    const card = createElement('div', 'pkc-filer-card pkc-filer-card-image');
    // Image attachments dispatch a dedicated preview-open action so
    // clicking from the filer opens an in-window viewer instead of
    // switching to the detail pane (2026-05-05 user direction).
    const isImageAttachment =
      child.archetype === 'attachment'
      && (() => {
        try {
          const meta = JSON.parse(child.body) as { mime?: unknown };
          return typeof meta.mime === 'string' && meta.mime.startsWith('image/');
        } catch {
          return false;
        }
      })();
    if (isImageAttachment) {
      card.setAttribute('data-pkc-action', 'open-image-preview-from-filer');
    } else {
      card.setAttribute('data-pkc-action', 'select-entry');
    }
    card.setAttribute('data-pkc-lid', child.lid);
    card.setAttribute('data-pkc-archetype', child.archetype);
    if (canEditDnd) {
      (card as HTMLElement).draggable = true;
      card.setAttribute('data-pkc-draggable', 'true');
      if (child.archetype === 'folder') card.setAttribute('data-pkc-drop-target', 'folder');
    }
    if (child.lid === state.selectedLid) card.setAttribute('data-pkc-active', 'true');

    const thumb = createElement('div', 'pkc-filer-card-thumb');
    const dataUrl = pickImageAssetForEntry(child, assets, state.container);
    if (dataUrl) {
      const img = document.createElement('img');
      img.src = dataUrl;
      img.alt = child.title || '(untitled)';
      img.loading = 'lazy';
      thumb.appendChild(img);
    } else {
      thumb.classList.add('pkc-filer-card-thumb-fallback');
      thumb.textContent = archetypeIcon(child.archetype);
    }
    // Caption は thumb の右下に overlay(2026-05-06 user direction G12)。
    const caption = createElement('div', 'pkc-filer-card-caption');
    caption.textContent = child.title || '(untitled)';
    thumb.appendChild(caption);
    card.appendChild(thumb);

    grid.appendChild(card);
  }
  wrapper.appendChild(grid);
  return wrapper;
}

/**
 * Card grid for book-base / youtube-base subsets (領域 10-6 ζ'' Phase 3a).
 * Reads frontmatter `kind` to filter or annotate cards. When a child's
 * frontmatter doesn't match the expected kind, render with graceful
 * degrade(small icon + title only) — the philosophy is overview, not
 * strict schema enforcement.
 */
function renderFilerCardGrid(
  state: AppState,
  children: readonly Entry[],
  expectedKind: 'book' | 'video' | 'novel' | 'audio',
): HTMLElement {
  const wrapper = createElement('div', 'pkc-filer-table-wrapper');
  wrapper.setAttribute('data-pkc-region', 'filer-table-wrapper');

  const grid = createElement('div', `pkc-filer-grid pkc-filer-grid-${expectedKind}-base`);
  grid.setAttribute('data-pkc-region', 'filer-grid');
  grid.setAttribute('data-pkc-card-kind', expectedKind);
  grid.style.setProperty('--filer-thumb-px', `${getFilerThumbPx(expectedKind)}px`);

  const canEditDnd = state.phase === 'ready' && !state.readonly;
  const assets = state.container?.assets ?? {};

  // PR-EE (2026-05-06):「.」「..」 card は breadcrumb で代替可能のため
  // 削除(user direction)。

  for (const child of children) {
    const fm = child.archetype === 'text' ? parseFrontmatter(child.body ?? '') : { meta: {} as Record<string, unknown>, body: '', found: false, warnings: [] as never[] };
    const classification = classifyEntryForCardGrid(child, fm.meta);
    const matches = classification?.kind === expectedKind;

    const card = createElement('div', `pkc-filer-card pkc-filer-card-${expectedKind}`);
    card.setAttribute('data-pkc-action', 'select-entry');
    card.setAttribute('data-pkc-lid', child.lid);
    card.setAttribute('data-pkc-archetype', child.archetype);
    if (matches) {
      card.setAttribute('data-pkc-card-kind-match', 'true');
      if (classification?.provider) {
        card.setAttribute('data-pkc-provider', classification.provider);
      }
    }
    if (canEditDnd) {
      (card as HTMLElement).draggable = true;
      card.setAttribute('data-pkc-draggable', 'true');
      if (child.archetype === 'folder') card.setAttribute('data-pkc-drop-target', 'folder');
    }
    if (child.lid === state.selectedLid) card.setAttribute('data-pkc-active', 'true');

    // Cover / thumbnail: prefer the first image asset structurally
    // related to this entry, fall back to archetype icon.
    const thumb = createElement('div', 'pkc-filer-card-thumb');
    const dataUrl = pickImageAssetForEntry(child, assets, state.container);
    if (dataUrl) {
      const img = document.createElement('img');
      img.src = dataUrl;
      img.alt = child.title || '(untitled)';
      img.loading = 'lazy';
      thumb.appendChild(img);
    } else {
      thumb.classList.add('pkc-filer-card-thumb-fallback');
      thumb.textContent = archetypeIcon(child.archetype);
    }
    card.appendChild(thumb);

    const titleEl = createElement('div', 'pkc-filer-card-title');
    titleEl.textContent = child.title || '(untitled)';
    card.appendChild(titleEl);

    if (matches) {
      // Fragment badge — when the URL carries a recognised fragment
      // (YouTube ?t= / PDF #page= / 小説 episode path / W3C #:~:text=…)
      // expose its locator label as a small chip on the card. Phase
      // 3c-C wiring of the canonical fragment IR.
      if (classification?.url) {
        const fragment = parseFragment(classification.url);
        if (fragment?.label) {
          const fragBadge = createElement('span', 'pkc-filer-card-fragment-badge');
          fragBadge.setAttribute('data-pkc-card-field', 'fragment');
          fragBadge.setAttribute('data-pkc-fragment-kind', fragment.locator_kind);
          fragBadge.textContent = fragment.label;
          card.appendChild(fragBadge);
        }
      }

      const meta = createElement('div', 'pkc-filer-card-meta');
      const fields: string[] = (() => {
        switch (expectedKind) {
          case 'book': return ['author', 'year', 'publisher', 'rating'];
          case 'video': return ['channel', 'duration', 'published_at'];
          case 'novel': return ['author', 'site', 'updated_at'];
          default: return [];
        }
      })();
      if (classification?.provider && classification.provider !== 'unknown') {
        const provSpan = createElement('span', 'pkc-filer-card-field pkc-filer-card-field-provider');
        provSpan.setAttribute('data-pkc-card-field', 'provider');
        provSpan.textContent = classification.provider;
        meta.appendChild(provSpan);
      }
      for (const f of fields) {
        const v = fm.meta[f];
        if (v === undefined || v === null || v === '') continue;
        const span = createElement('span', `pkc-filer-card-field pkc-filer-card-field-${f}`);
        span.setAttribute('data-pkc-frontmatter-key', f);
        span.textContent = String(v);
        meta.appendChild(span);
      }
      if (meta.children.length > 0) card.appendChild(meta);
    }

    grid.appendChild(card);
  }
  wrapper.appendChild(grid);
  return wrapper;
}

/**
 * Classify an entry for inclusion in a book / video / novel card grid.
 *
 * Resolution order (most specific first):
 *   1. frontmatter `kind` field — if set to a known string, use it
 *      directly (legacy + explicit override).
 *   2. frontmatter `url` field — classify via URL host map.
 *   3. first http(s) URL in body — classify via URL host map.
 *
 * Returns a `UrlClassification`-like shape so the caller can read
 * both `kind` and `provider`. Returns null for unclassifiable entries.
 */
function classifyEntryForCardGrid(
  entry: Entry,
  meta: Record<string, unknown>,
): UrlClassification | null {
  const explicitKind = meta['kind'];
  if (typeof explicitKind === 'string' && explicitKind.length > 0) {
    // Treat explicit `kind: book/video/novel` as authoritative even
    // without a URL. Provider blank when no URL is present.
    const fmUrl = classifyFrontmatterUrl(meta);
    if (fmUrl && fmUrl.kind === explicitKind) return fmUrl;
    return {
      url: fmUrl?.url ?? '',
      host: fmUrl?.host ?? '',
      kind: (explicitKind as UrlClassification['kind']) ?? 'unknown',
      provider: fmUrl?.provider ?? '',
    };
  }
  const fmUrl = classifyFrontmatterUrl(meta);
  if (fmUrl && fmUrl.kind !== 'unknown') return fmUrl;
  const bodyUrl = classifyFirstUrlInBody(entry.body ?? '');
  if (bodyUrl && bodyUrl.kind !== 'unknown') return bodyUrl;
  return null;
}

// Re-export for tests / consumers that want raw URL classification.
export { classifyUrl };

/**
 * Find an image asset to use as a card thumbnail.
 *
 * `container.assets[K]` stores **raw base64**(no `data:` prefix);
 * the MIME comes from the attachment body. We therefore reconstruct
 * a data URL on the fly when the MIME indicates an image. Lookups:
 *   1. attachment archetype — body JSON has `{ asset_key, mime }`.
 *      If MIME starts with `image/`, build `data:<mime>;base64,<b64>`.
 *   2. body markdown `asset:KEY` reference. We can't see a MIME for
 *      this path, so accept any asset byte stream — the consumer
 *      `<img>` will reject non-image data with a broken-image icon
 *      (acceptable failure mode at the filer thumbnail layer).
 *   3. folder archetype — first attachment child that resolves to
 *      an image asset (folder cover thumbnail).
 *
 * Returns a `data:` URL or null.
 */
export function pickImageAssetForEntry(
  entry: Entry,
  assets: Record<string, string>,
  container: Container | null = null,
): string | null {
  // PR-X (2026-05-06):0. text frontmatter `thumbnail: <url>`(PR-U
  // v1.1 capture profile)。bookmarklet 経由で `kind: video` + thumbnail
  // url が入った entry が、card grid で raster 画像で表示される経路。
  // YouTube / Niconico / カクヨム 等の外部 thumbnail を直接 img src で
  // ロード(CORS は host 側に任せる、PKC2 は単に URL を渡すだけ)。
  // PR-YY (2026-05-06):user 修正指示4「サムネ指定が PKC embed と
  // 記法が異なる」への対応 — `extractThumbnailRef` で markdown image
  // syntax `![...](TARGET)` 含めた PKC embed 互換形式を受理。
  if (entry.archetype === 'text' && entry.body) {
    const fmEnd = entry.body.indexOf('---', 3);
    if (entry.body.trimStart().startsWith('---') && fmEnd > 0) {
      const fmBlock = entry.body.slice(0, fmEnd);
      const tm = fmBlock.match(/^thumbnail:\s*(.+)$/m);
      if (tm) {
        const v = extractThumbnailRef(tm[1]!);
        if (v) {
          if (/^https?:\/\//i.test(v) || v.startsWith('data:')) return v;
          if (v.startsWith('asset:')) {
            const k = v.slice(6);
            // P1s2-a(#967): ObjectURL registry を先に引く(bytes ヒープ外)。
            const regUrl = getAssetUrl(k);
            if (regUrl) return regUrl;
            const b64 = assets[k];
            if (b64) {
              if (b64.startsWith('data:')) return b64;
              return `data:image/png;base64,${b64}`;
            }
            // 段階3 (#868): thumbnail asset not in the working-set —
            // record so the manager loads it and the cover pops in.
            noteAssetMiss(k);
          }
        }
      }
    }
  }
  // 1. attachment archetype.
  if (entry.archetype === 'attachment' && entry.body) {
    try {
      const parsed = JSON.parse(entry.body) as { asset_key?: unknown; mime?: unknown };
      const key = typeof parsed.asset_key === 'string' ? parsed.asset_key : null;
      const mime = typeof parsed.mime === 'string' ? parsed.mime : null;
      if (key && mime && mime.startsWith('image/')) {
        // P1s2-a(#967): ObjectURL registry を先に引く(bytes ヒープ外)。
        const regUrl = getAssetUrl(key, mime);
        if (regUrl) return regUrl;
        const b64 = assets[key];
        if (b64) {
          // assets[K] may be raw base64 (new format) OR a full data
          // URL (legacy / generated paths) — handle both.
          if (b64.startsWith('data:')) return b64;
          return `data:${mime};base64,${b64}`;
        }
        // 段階3 (#868): attachment image not in the working-set yet.
        noteAssetMiss(key);
      }
    } catch {
      /* fall through */
    }
  }
  // 2.(撤去 2026-06-24、user 指示「埋め込んだ画像をサムネ表示するのをやめて
  //   欲しい。サムネは yaml frontmatter で設定した時のみにして欲しい」)
  //   以前は TEXT body 内の `asset:KEY`(貼付画像 ── #861 で asset 化された
  //   埋め込み画像)を card/hero サムネに自動採用していたが、本文の図版が意図せず
  //   表紙になる体験不良のため廃止。text のサムネは step 0(frontmatter
  //   `thumbnail:`)のみ。attachment 画像(step 1)/ folder cover(step 3)/
  //   novel 合成(step 4)は「埋め込み画像」ではないので従来どおり残す。
  // 3. Folder thumbnail.
  if (container && entry.archetype === 'folder') {
    const children = getStructuralChildren(container.relations, container.entries, entry.lid);
    for (const child of children) {
      if (child.archetype !== 'attachment') continue;
      const inner = pickImageAssetForEntry(child, assets, null);
      if (inner) return inner;
    }
  }
  // 4. PR-II (2026-05-06): novel-kind synthesis fallback. カクヨム /
  // 小説家になろう のような表紙画像が存在しない site の entry は
  // ここまで全 step が null を返す。frontmatter `kind: novel` を
  // 検出した場合は title + author + provider から SVG カバーを
  // 合成して card grid の見栄えを救う。`book` kind も同様の
  // フォールバック対象(Amazon 等で thumbnail_url が拾えなかった
  // 場合のセーフネット)。
  if (entry.archetype === 'text' && entry.body) {
    const fm = parseFrontmatter(entry.body);
    const kind = typeof fm.meta.kind === 'string' ? fm.meta.kind : null;
    if (kind === 'novel' || kind === 'book') {
      const author = typeof fm.meta.author === 'string' ? fm.meta.author : null;
      const provider = typeof fm.meta.provider === 'string' ? fm.meta.provider : null;
      const dataUrl = buildNovelCoverDataUrl({
        title: entry.title,
        author,
        provider,
      });
      if (dataUrl) return dataUrl;
    }
  }
  return null;
}

/*
 * PR-HHH (2026-05-06、user 修正指示5「廃止したはずのFilerのGraph
 * がまだ活きている」):filer 内 Graph subset の `renderFilerGraph`
 * 関数は完全削除。center pane の viewMode='graph' タブ
 * (`renderCenterGraphView`)が canonical な graph 表示として残る。
 * 古い container で `profile.kind='graph'` を持つ folder は subset
 * 分岐の default(explorer table)へ silent fallback。
 */

/**
 * Inventory subset (Phase 5) — Bases 風 query view over folder
 * children. Columns are derived from the union of frontmatter keys
 * across visible children + a built-in `__name` / `__archetype` /
 * `__tags` fixed columns. Each column has:
 *   - filter input (substring match, case-insensitive)
 *   - header click → sort toggle (asc → desc → off)
 * A toolbar provides:
 *   - "Group by" select
 *   - "Clear" button
 */
function renderFilerInventory(state: AppState, children: readonly Entry[]): HTMLElement {
  const wrapper = createElement('div', 'pkc-filer-table-wrapper pkc-filer-inventory-wrapper');
  wrapper.setAttribute('data-pkc-region', 'filer-table-wrapper');

  // 1. Parse frontmatter for every child and gather column keys.
  const childrenWithMeta = children.map((c) => ({
    entry: c,
    meta: c.archetype === 'text' ? parseFrontmatter(c.body ?? '').meta : ({} as Record<string, unknown>),
  }));
  const fmKeys = new Set<string>();
  for (const { meta } of childrenWithMeta) for (const k of Object.keys(meta)) fmKeys.add(k);
  const columns: { key: string; label: string; isBuiltin: boolean }[] = [
    { key: '__name', label: '名前', isBuiltin: true },
    { key: '__archetype', label: '種類', isBuiltin: true },
    ...Array.from(fmKeys).sort().map((k) => ({ key: k, label: k, isBuiltin: false })),
    { key: '__tags', label: 'タグ', isBuiltin: true },
  ];

  const query = state.inventoryQuery ?? {};
  const filter = query.filter ?? {};
  const sortBy = query.sortBy ?? null;
  const sortDir = query.sortDir ?? 'asc';
  const groupBy = query.groupBy ?? null;

  // Toolbar
  const toolbar = createElement('div', 'pkc-filer-inventory-toolbar');
  toolbar.setAttribute('data-pkc-region', 'filer-inventory-toolbar');
  const groupSelect = document.createElement('select');
  groupSelect.className = 'pkc-filer-inventory-group-select';
  groupSelect.setAttribute('data-pkc-action', 'set-inventory-group-by');
  const noneOpt = document.createElement('option');
  noneOpt.value = '';
  noneOpt.textContent = '(no group)';
  if (groupBy === null) noneOpt.selected = true;
  groupSelect.appendChild(noneOpt);
  for (const col of columns) {
    const opt = document.createElement('option');
    opt.value = col.key;
    opt.textContent = `Group by: ${col.label}`;
    if (col.key === groupBy) opt.selected = true;
    groupSelect.appendChild(opt);
  }
  toolbar.appendChild(groupSelect);

  const clearBtn = createElement('button', 'pkc-btn-small');
  clearBtn.setAttribute('data-pkc-action', 'clear-inventory-query');
  clearBtn.textContent = 'クエリ Clear';
  toolbar.appendChild(clearBtn);

  wrapper.appendChild(toolbar);

  // Helpers to read column value from entry+meta.
  const readCol = (row: { entry: Entry; meta: Record<string, unknown> }, key: string): string => {
    if (key === '__name') return row.entry.title || '(untitled)';
    if (key === '__archetype') return row.entry.archetype;
    if (key === '__tags') return (row.entry.tags ?? []).join(', ');
    const v = row.meta[key];
    if (v === null || v === undefined) return '';
    if (Array.isArray(v)) return v.map((x) => String(x)).join(', ');
    return String(v);
  };

  // 2. Filter
  let filtered = childrenWithMeta.filter((row) => {
    for (const col of columns) {
      const f = filter[col.key];
      if (!f) continue;
      const v = readCol(row, col.key).toLowerCase();
      if (!v.includes(f.toLowerCase())) return false;
    }
    return true;
  });

  // 3. Sort
  if (sortBy) {
    filtered = filtered.slice().sort((a, b) => {
      const va = readCol(a, sortBy);
      const vb = readCol(b, sortBy);
      // Try numeric compare when both look numeric.
      const na = Number(va);
      const nb = Number(vb);
      let cmp: number;
      if (Number.isFinite(na) && Number.isFinite(nb) && va !== '' && vb !== '') cmp = na - nb;
      else cmp = va.localeCompare(vb);
      return sortDir === 'desc' ? -cmp : cmp;
    });
  }

  // 4. Optionally group
  const renderTable = (rows: typeof filtered): HTMLTableElement => {
    const table = createElement('table', 'pkc-filer-table pkc-filer-inventory-table') as HTMLTableElement;
    table.setAttribute('data-pkc-region', 'filer-inventory-table');

    const thead = createElement('thead', 'pkc-filer-thead');
    const headRow = createElement('tr', 'pkc-filer-head-row');
    for (const col of columns) {
      const th = createElement('th', 'pkc-filer-th pkc-filer-inventory-th');
      th.setAttribute('data-pkc-filer-column', col.key);
      th.setAttribute('data-pkc-action', 'set-inventory-sort');
      th.setAttribute('data-pkc-inventory-key', col.key);
      const arrow = sortBy === col.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';
      th.textContent = `${col.label}${arrow}`;
      headRow.appendChild(th);
    }
    thead.appendChild(headRow);

    // Filter row
    const filterRow = createElement('tr', 'pkc-filer-inventory-filter-row');
    for (const col of columns) {
      const cell = createElement('th', 'pkc-filer-inventory-filter-cell');
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'pkc-filer-inventory-filter-input';
      input.setAttribute('data-pkc-action', 'set-inventory-filter');
      input.setAttribute('data-pkc-inventory-key', col.key);
      input.placeholder = '…';
      input.value = filter[col.key] ?? '';
      cell.appendChild(input);
      filterRow.appendChild(cell);
    }
    thead.appendChild(filterRow);
    table.appendChild(thead);

    const tbody = createElement('tbody', 'pkc-filer-tbody');
    for (const row of rows) {
      const tr = createElement('tr', 'pkc-filer-row pkc-filer-inventory-row');
      tr.setAttribute('data-pkc-action', 'select-entry');
      tr.setAttribute('data-pkc-lid', row.entry.lid);
      tr.setAttribute('data-pkc-archetype', row.entry.archetype);
      if (row.entry.lid === state.selectedLid) tr.setAttribute('data-pkc-active', 'true');
      for (const col of columns) {
        const td = createElement('td', 'pkc-filer-cell');
        td.setAttribute('data-pkc-inventory-key', col.key);
        td.textContent = readCol(row, col.key);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    return table;
  };

  if (groupBy) {
    const groups = new Map<string, typeof filtered>();
    for (const row of filtered) {
      const v = readCol(row, groupBy) || '(none)';
      const arr = groups.get(v) ?? [];
      arr.push(row);
      groups.set(v, arr);
    }
    const sortedGroupKeys = Array.from(groups.keys()).sort();
    for (const key of sortedGroupKeys) {
      const detail = document.createElement('details');
      detail.className = 'pkc-filer-inventory-group';
      detail.setAttribute('data-pkc-inventory-group', key);
      detail.open = true;
      const summary = document.createElement('summary');
      summary.className = 'pkc-filer-inventory-group-summary';
      summary.textContent = `${key} (${groups.get(key)!.length})`;
      detail.appendChild(summary);
      detail.appendChild(renderTable(groups.get(key)!));
      wrapper.appendChild(detail);
    }
  } else {
    wrapper.appendChild(renderTable(filtered));
  }

  return wrapper;
}

/**
 * PR-V5(2026-05-14):attachment-presenter が出す App icon select の option を、
 * container 内の image attachment 一覧で埋める。presenter は container access が
 * 無いので renderer 経路でここで hydrate する。
 *
 * 探す対象:`select[data-pkc-needs-image-options="true"]`(attachment-presenter の
 * renderViewBody 内、HTML attachment + registered checkbox 区間で生成)。
 */
function hydrateAppIconAssetOptions(view: HTMLElement, container: Container): void {
  const selects = view.querySelectorAll<HTMLSelectElement>(
    'select[data-pkc-needs-image-options="true"]',
  );
  if (selects.length === 0) return;
  const imageAttachments: { assetKey: string; label: string }[] = [];
  for (const e of container.entries) {
    if (e.archetype !== 'attachment') continue;
    const ea = parseAttachmentBody(e.body, e);
    if (!ea.asset_key) continue;
    if (!ea.mime?.startsWith('image/')) continue;
    if (container.assets[ea.asset_key] == null) continue;
    imageAttachments.push({
      assetKey: ea.asset_key,
      label: e.title || ea.name || ea.asset_key,
    });
  }
  for (const sel of selects) {
    const current = sel.getAttribute('data-pkc-current-asset-key') ?? '';
    // presenter が暫定で挿入した「現在の選択」option(value=current asset_key)
    // を一度消して、container の真実の image 一覧で置き換える。
    while (sel.options.length > 1) sel.remove(1);
    let matched = false;
    for (const ia of imageAttachments) {
      const opt = document.createElement('option');
      opt.value = ia.assetKey;
      opt.textContent = ia.label;
      if (ia.assetKey === current) {
        opt.selected = true;
        matched = true;
      }
      sel.appendChild(opt);
    }
    if (current && !matched) {
      // 元の asset が container から消えている stale 参照:reminder option を残す
      const stale = document.createElement('option');
      stale.value = current;
      stale.textContent = '⚠ 未解決 (' + current.slice(0, 14) + '…)';
      stale.selected = true;
      sel.appendChild(stale);
    }
    sel.removeAttribute('data-pkc-needs-image-options');
  }
}

/**
 * #806 host-push: attachment カードの action 列に「🧩 ○○で開く」送付
 * ボタンを hydrate する(user 報告 2026-06-12「ファイル名は表示されるけど、
 * 開く動線が出てこない」への可視導線)。紐付け済み拡張(自分以外)が宛先。
 * 既定送り先は ★ 付きで先頭。click は右クリック menu と同じ
 * `ctx-send-to-extension` handler に乗る(送付 = 同意のジェスチャ)。
 * presenter は container access を持たないため renderer 経路で補完する
 * (`hydrateAppIconAssetOptions` と同パターン)。
 */
function hydrateExtensionSendButtons(view: HTMLElement, entry: Entry, container: Container): void {
  const actionRow = view.querySelector<HTMLElement>('[data-pkc-region="attachment-actions"]');
  if (!actionRow) return; // data 無し / stripped の card には出さない
  const bindings = loadExtensionBindings();
  if (bindings.bound.length === 0) return;
  const defaultLid = getDefaultTarget(matchKeyForEntry(entry));
  const targets: { extLid: string; title: string; isDefault: boolean }[] = [];
  for (const extLid of bindings.bound) {
    if (extLid === entry.lid) continue;
    const ext = container.entries.find((e) => e.lid === extLid);
    if (!ext || ext.archetype !== 'attachment') continue;
    if (!parseAttachmentBody(ext.body, ext).pkc_extension) continue;
    targets.push({ extLid, title: ext.title || extLid, isDefault: extLid === defaultLid });
  }
  if (targets.length === 0) return;
  targets.sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
  for (const t of targets) {
    const btn = createElement('button', 'pkc-btn pkc-btn-small pkc-attachment-send-ext');
    btn.setAttribute('data-pkc-action', 'ctx-send-to-extension');
    btn.setAttribute('data-pkc-lid', entry.lid);
    btn.setAttribute('data-pkc-ext-lid', t.extLid);
    btn.setAttribute(
      'title',
      t.isDefault
        ? 'この種類の既定送り先です。このファイルを拡張へ送って開きます(閉じていれば起動)'
        : 'このファイルを拡張へ送って開きます(閉じていれば起動)',
    );
    btn.textContent = t.isDefault ? `🧩 ★ ${t.title}で開く` : `🧩 ${t.title}で開く`;
    actionRow.appendChild(btn);
  }
}

function renderLauncherView(state: AppState): HTMLElement {
  const view = createElement('section', 'pkc-launcher-view');
  view.setAttribute('data-pkc-region', 'launcher-view');

  const header = createElement('header', 'pkc-launcher-view-header');
  const title = createElement('h2', 'pkc-launcher-view-title');
  title.textContent = '🚀 App Launcher';
  header.appendChild(title);
  const hint = createElement('span', 'pkc-launcher-view-hint');
  hint.textContent = '登録済 HTML アプリ / 🧩 拡張 / 🔗 URL — クリックで起動';
  header.appendChild(hint);
  // #926: URL タイル追加(flag opt-in)。押すと action-binder が URL / 名前を
  // 尋ね、擬似リダイレクト HTML を attachment 化して tile に並べる。
  if (shellLauncherUrlTilesEnabled()) {
    const addUrlBtn = createElement('button', 'pkc-btn pkc-btn-small pkc-launcher-add-url');
    addUrlBtn.setAttribute('type', 'button');
    addUrlBtn.setAttribute('data-pkc-action', 'launcher-add-url');
    addUrlBtn.setAttribute('title', 'URL 起動タイルを追加(referrer を送らない中継ページ経由で開く)');
    addUrlBtn.textContent = '+ URL タイル';
    header.appendChild(addUrlBtn);
  }
  view.appendChild(header);

  const assets = state.container?.assets ?? {};
  // PR-V5(2026-05-14):image asset_key の resolve helper。
  // container.assets[K] は raw base64、attachment-presenter.resolveImageDataUrl と
  // 同 contract で data: URL を組み立てる。MIME が不明な image attachment は
  // image/* と仮定して `image/*` ではなく `image/png` を default 仮定する。
  const resolveAppIconDataUrl = (assetKey: string): string | null => {
    // P1s2-a(#967): ObjectURL registry を先に引く(bytes ヒープ外・
    // launcher icon は §4 の pin 対象なので registry hit が定常状態)。
    const regUrl = getAssetUrl(assetKey);
    if (regUrl) return regUrl;
    const base64 = assets[assetKey];
    if (!base64) {
      // 段階3 (#868): icon bytes may not be resident under lazy/shallow
      // load. Record the miss so the working-set hydrates it and the tile
      // icon pops in on the next render. Cosmetic, but keeps the launcher
      // consistent with the demand-fill pattern.
      if (assetKey) noteAssetMiss(assetKey);
      return null;
    }
    if (base64.startsWith('data:')) return base64;
    // asset_key を持つ image attachment の MIME を逆引き
    for (const e of state.container?.entries ?? []) {
      if (e.archetype !== 'attachment') continue;
      const ea = parseAttachmentBody(e.body, e);
      if (ea.asset_key === assetKey && ea.mime?.startsWith('image/')) {
        return `data:${ea.mime};base64,${base64}`;
      }
    }
    return null;
  };
  const registered: {
    lid: string; name: string; iconText: string; iconImageUrl: string | null;
    kind: 'app' | 'extension' | 'url';
    tooltip: string;
    group?: string; order?: number; seq: number;
  }[] = [];
  // #935: 未登録の HTML 添付(launcher からの起動・登録導線)。
  const unregistered: { lid: string; name: string; iconText: string }[] = [];
  let seq = 0;
  for (const entry of state.container?.entries ?? []) {
    if (entry.archetype !== 'attachment') continue;
    const att = parseAttachmentBody(entry.body, entry);
    // #926 導線見直し: registered_as_app に加えて **PKC-Extension も自動で
    // 並べる**(従来は両フラグ ON にしないと launcher に出ず、拡張の起動
    // 導線が分かりにくかった)。click は既存 open-html-attachment action が
    // pkc_extension を判別して extension host 起動へ分岐する。
    const isExtension = att.pkc_extension === true;
    if (classifyPreviewType(att.mime) !== 'html') continue;
    if (att.registered_as_app !== true && !isExtension) {
      // #935: 未登録の HTML 添付も launcher から起動・登録できるよう別
      // section に集める(「ランチャー画面から asset の HTML にたどり
      // 着けない」+ 設定消失事故からの一発復旧導線)。
      unregistered.push({
        lid: entry.lid,
        name: entry.title || att.name || '(untitled)',
        iconText: typeof att.app_icon === 'string' && att.app_icon.length > 0 ? att.app_icon : '🌐',
      });
      continue;
    }
    const isUrlTile = typeof att.launcher_url === 'string' && att.launcher_url.length > 0;
    const kind = isExtension ? 'extension' : (isUrlTile ? 'url' : 'app');
    const iconImageUrl = att.app_icon_asset_key
      ? resolveAppIconDataUrl(att.app_icon_asset_key)
      : null;
    const name = entry.title || att.name || '(untitled)';
    registered.push({
      lid: entry.lid,
      name,
      iconText: typeof att.app_icon === 'string' && att.app_icon.length > 0
        ? att.app_icon
        : (kind === 'extension' ? '🧩' : kind === 'url' ? '🔗' : '🌐'),
      iconImageUrl,
      kind,
      tooltip: kind === 'extension'
        ? `${name} を PKC-Extension として起動`
        : kind === 'url'
          ? `${att.launcher_url} へジャンプ(referrer を送らない中継ページ経由)`
          : `${name} を新規ウィンドウで起動`,
      ...(att.app_group !== undefined ? { group: att.app_group } : {}),
      ...(att.app_order !== undefined ? { order: att.app_order } : {}),
      seq: seq++,
    });
  }

  if (registered.length === 0) {
    const empty = createElement('div', 'pkc-launcher-empty');
    empty.setAttribute('data-pkc-region', 'launcher-empty');
    const line1 = document.createElement('p');
    line1.textContent = '登録済アプリはまだありません。';
    empty.appendChild(line1);
    const line2 = document.createElement('p');
    line2.appendChild(document.createTextNode('HTML attachment を選択し、右ペインの '));
    const code = document.createElement('code');
    code.textContent = 'アプリランチャーに登録';
    line2.appendChild(code);
    line2.appendChild(document.createTextNode(' checkbox を ON にするか、下の 📌 で登録すると、ここに tile が並びます。'));
    empty.appendChild(line2);
    view.appendChild(empty);
    // #935: 未登録 HTML があれば下でその section を出す(early return しない)。
    if (unregistered.length === 0) return view;
  }

  // #928: グループ化 + 並び替え(app_group / app_order、pure helper で整列)。
  const sorted = sortLauncherTiles(registered);
  const hasGroups = sorted.some((t) => normalizeGroup(t.group) !== '');

  let currentGroup: string | null = null;
  let grid: HTMLElement | null = null;
  const ensureGrid = (groupName: string): HTMLElement => {
    if (grid && currentGroup === groupName) return grid;
    currentGroup = groupName;
    if (hasGroups) {
      const h = createElement('h3', 'pkc-launcher-group-title');
      h.setAttribute('data-pkc-region', 'launcher-group-title');
      h.textContent = groupName === '' ? '(未分類)' : groupName;
      view.appendChild(h);
    }
    grid = createElement('div', 'pkc-launcher-grid');
    grid.setAttribute('data-pkc-region', 'launcher-grid');
    // drop 先判定に使うため既定グループ('')も含め常に付与(DnD 並び替え)。
    grid.setAttribute('data-pkc-launcher-group', groupName);
    view.appendChild(grid);
    return grid;
  };

  for (const app of sorted) {
    const targetGrid = ensureGrid(normalizeGroup(app.group));

    // #928: hover 操作(ⓘ 詳細 / 🏷 グループ)を重ねるため、tile button を
    // wrapper で包む(button 入れ子は不可)。並び替え・グループ移動は
    // wrapper の drag & drop が主(2026-07-17 user 指摘で ◀▶ ボタンを撤去)。
    const wrap = createElement('div', 'pkc-launcher-tile-wrap');
    wrap.setAttribute('data-pkc-region', 'launcher-tile-wrap');
    wrap.setAttribute('draggable', 'true');
    wrap.setAttribute('data-pkc-launcher-draggable', 'true');
    wrap.setAttribute('data-pkc-lid', app.lid);
    wrap.setAttribute('data-pkc-tile-group', normalizeGroup(app.group));

    const tile = createElement('button', 'pkc-launcher-tile');
    tile.setAttribute('type', 'button');
    // 既存 open-html-attachment action を再利用、tile click = "Open in New Window"
    tile.setAttribute('data-pkc-action', 'open-html-attachment');
    tile.setAttribute('data-pkc-lid', app.lid);
    tile.setAttribute('data-pkc-launcher-kind', app.kind);
    tile.setAttribute('aria-label', `Launch ${app.name}`);
    tile.setAttribute('title', app.tooltip);

    const iconEl = createElement('span', 'pkc-launcher-tile-icon');
    if (app.iconImageUrl) {
      // PR-V5(2026-05-14):image asset_key 指定時は <img> で render。alt は
      // tile name と重複するので decorative 扱い(`alt=""`)、tile aria-label が
      // 既に「Launch <name>」を持つ。
      const img = document.createElement('img');
      img.src = app.iconImageUrl;
      img.alt = '';
      img.className = 'pkc-launcher-tile-icon-image';
      iconEl.appendChild(img);
    } else {
      iconEl.textContent = app.iconText;
    }
    iconEl.setAttribute('aria-hidden', 'true');
    tile.appendChild(iconEl);

    const labelEl = createElement('span', 'pkc-launcher-tile-label');
    labelEl.textContent = app.name;
    tile.appendChild(labelEl);

    wrap.appendChild(tile);

    // hover 操作列(#928): 添付エントリ詳細への導線 + グループ設定。
    const controls = createElement('div', 'pkc-launcher-tile-controls');
    const mkCtl = (action: string, label: string, tip: string, extra?: Record<string, string>): void => {
      const b = createElement('button', 'pkc-launcher-tile-ctl');
      b.setAttribute('type', 'button');
      b.setAttribute('data-pkc-action', action);
      b.setAttribute('data-pkc-lid', app.lid);
      b.setAttribute('title', tip);
      b.setAttribute('aria-label', tip);
      for (const [k, v] of Object.entries(extra ?? {})) b.setAttribute(k, v);
      b.textContent = label;
      controls.appendChild(b);
    };
    mkCtl('launcher-open-detail', 'ⓘ', 'この添付エントリの詳細を開く(アイコン・登録・削除など)');
    mkCtl('launcher-set-group', '🏷', 'グループを設定(空で解除)');
    wrap.appendChild(controls);

    targetGrid.appendChild(wrap);
  }

  // #935: 未登録の HTML 添付 section。クリックで起動(open-html-attachment
  // は登録状態に依らず動く)、📌 で 1-click 登録、ⓘ で詳細へ。設定消失事故
  // からの復旧導線も兼ねる。DnD の drop 対象・draggable にはしない
  // (data-pkc-launcher-group を付けない)。
  if (unregistered.length > 0) {
    const h = createElement('h3', 'pkc-launcher-group-title');
    h.setAttribute('data-pkc-region', 'launcher-unregistered-title');
    h.textContent = `未登録の HTML 添付(${unregistered.length})`;
    view.appendChild(h);
    const ugrid = createElement('div', 'pkc-launcher-grid');
    ugrid.setAttribute('data-pkc-region', 'launcher-grid-unregistered');
    for (const u of unregistered) {
      const wrap = createElement('div', 'pkc-launcher-tile-wrap');
      wrap.setAttribute('data-pkc-region', 'launcher-tile-wrap');

      const tile = createElement('button', 'pkc-launcher-tile pkc-launcher-tile-unregistered');
      tile.setAttribute('type', 'button');
      tile.setAttribute('data-pkc-action', 'open-html-attachment');
      tile.setAttribute('data-pkc-lid', u.lid);
      tile.setAttribute('data-pkc-launcher-kind', 'unregistered');
      tile.setAttribute('aria-label', `Launch ${u.name}`);
      tile.setAttribute('title', `${u.name} を新規ウィンドウで起動(未登録)`);
      const iconEl = createElement('span', 'pkc-launcher-tile-icon');
      iconEl.textContent = u.iconText;
      iconEl.setAttribute('aria-hidden', 'true');
      tile.appendChild(iconEl);
      const labelEl = createElement('span', 'pkc-launcher-tile-label');
      labelEl.textContent = u.name;
      tile.appendChild(labelEl);
      wrap.appendChild(tile);

      const controls = createElement('div', 'pkc-launcher-tile-controls');
      const mkUCtl = (action: string, label: string, tip: string): void => {
        const b = createElement('button', 'pkc-launcher-tile-ctl');
        b.setAttribute('type', 'button');
        b.setAttribute('data-pkc-action', action);
        b.setAttribute('data-pkc-lid', u.lid);
        b.setAttribute('title', tip);
        b.setAttribute('aria-label', tip);
        b.textContent = label;
        controls.appendChild(b);
      };
      mkUCtl('launcher-open-detail', 'ⓘ', 'この添付エントリの詳細を開く');
      mkUCtl('launcher-register-tile', '📌', 'アプリランチャーに登録');
      wrap.appendChild(controls);

      ugrid.appendChild(wrap);
    }
    view.appendChild(ugrid);
  }

  return view;
}

function renderKanbanView(state: AppState): HTMLElement {
  const kanban = createElement('div', 'pkc-kanban');
  kanban.setAttribute('data-pkc-region', 'kanban-view');

  const entries = state.container?.entries ?? [];
  const grouped = groupTodosByStatus(entries);

  const board = createElement('div', 'pkc-kanban-board');

  // Slice 1 / 2: the shared `todoAddPopover` can be in `kanban` or
  // `calendar` context; only the Kanban variant is mounted from this
  // renderer path. Calendar variant is handled in `renderCalendarView`.
  const popover = state.todoAddPopover && state.todoAddPopover.context === 'kanban'
    ? state.todoAddPopover
    : null;
  const canEditKanban = !state.readonly && !!state.container;

  for (const col of KANBAN_COLUMNS) {
    const column = createElement('div', 'pkc-kanban-column');
    column.setAttribute('data-pkc-kanban-status', col.status);

    const header = createElement('div', 'pkc-kanban-column-header');
    const headerLabel = createElement('span', 'pkc-kanban-column-label');
    headerLabel.textContent = col.label;
    header.appendChild(headerLabel);

    const count = grouped[col.status].length;
    const badge = createElement('span', 'pkc-kanban-column-count');
    badge.textContent = String(count);
    header.appendChild(badge);

    // Slice 1 (Todo add popover foundation): per-column "+ Add" trigger.
    // Hidden in readonly mode so the reducer guard is not provoked.
    // See docs/development/todo-editor-in-continuous-edit-wave.md §4.
    if (canEditKanban) {
      const addBtn = createElement('button', 'pkc-kanban-column-add');
      addBtn.setAttribute('data-pkc-action', 'open-kanban-todo-add');
      addBtn.setAttribute('data-pkc-kanban-status', col.status);
      addBtn.setAttribute('title', `Add new Todo (${col.label})`);
      addBtn.setAttribute('aria-label', `Add new Todo to ${col.label}`);
      addBtn.textContent = '+ Add';
      header.appendChild(addBtn);
    }

    column.appendChild(header);

    // Render the popover INSIDE the column it was opened from so the
    // context is visually anchored. Single-instance: the reducer
    // guarantees at most one popover is open across all columns.
    if (popover && popover.status === col.status && canEditKanban) {
      const popEl = createElement('div', 'pkc-kanban-add-popover');
      popEl.setAttribute('data-pkc-region', 'kanban-todo-add-popover');
      popEl.setAttribute('data-pkc-context', 'kanban');
      popEl.setAttribute('data-pkc-context-value', col.status);
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'pkc-kanban-add-input';
      input.setAttribute('data-pkc-field', 'kanban-todo-add-title');
      input.setAttribute('placeholder', 'New todo…');
      input.setAttribute('autofocus', 'true');
      popEl.appendChild(input);
      const hint = createElement('span', 'pkc-kanban-add-hint');
      hint.textContent = 'Enter to add · Esc to cancel';
      popEl.appendChild(hint);
      column.appendChild(popEl);
    }

    const list = createElement('div', 'pkc-kanban-list');
    list.setAttribute('data-pkc-kanban-drop-target', col.status);

    for (const item of grouped[col.status]) {
      const card = createElement('div', 'pkc-kanban-card');
      card.setAttribute('data-pkc-action', 'select-entry');
      card.setAttribute('data-pkc-lid', item.entry.lid);
      if (item.todo.status === 'done') {
        card.setAttribute('data-pkc-todo-status', 'done');
      }
      if (state.selectedLid === item.entry.lid) {
        card.setAttribute('data-pkc-selected', 'true');
      }
      if (state.multiSelectedLids.includes(item.entry.lid)) {
        card.setAttribute('data-pkc-multi-selected', 'true');
      }
      // DnD: make card draggable in non-readonly mode
      if (!state.readonly) {
        card.setAttribute('draggable', 'true');
        card.setAttribute('data-pkc-kanban-draggable', 'true');
      }

      const title = createElement('div', 'pkc-kanban-card-title');
      title.textContent = item.entry.title || '(untitled)';
      card.appendChild(title);

      if (item.todo.description) {
        const desc = createElement('div', 'pkc-kanban-card-desc');
        desc.textContent = item.todo.description;
        card.appendChild(desc);
      }

      if (item.todo.date) {
        const date = createElement('div', 'pkc-kanban-card-date');
        date.textContent = formatTodoDate(item.todo.date, getFormatLocale());
        if (isTodoPastDue(item.todo)) {
          date.classList.add('pkc-todo-date-overdue');
        }
        card.appendChild(date);
      }

      // Status move button (reuses existing toggle-todo-status action)
      if (!state.readonly) {
        const moveBtn = createElement('button', 'pkc-kanban-status-btn');
        moveBtn.setAttribute('data-pkc-action', 'toggle-todo-status');
        moveBtn.setAttribute('data-pkc-lid', item.entry.lid);
        if (item.todo.status === 'open') {
          moveBtn.textContent = '✓ Done';
          moveBtn.setAttribute('title', 'Mark as done');
        } else {
          moveBtn.textContent = '↺ Reopen';
          moveBtn.setAttribute('title', 'Reopen this todo');
        }
        card.appendChild(moveBtn);
      }

      list.appendChild(card);
    }

    column.appendChild(list);
    board.appendChild(column);
  }

  kanban.appendChild(board);

  // Empty state: show hint when no active todos exist at all
  const totalCards = grouped.open.length + grouped.done.length;
  if (totalCards === 0) {
    const empty = createElement('div', 'pkc-kanban-empty');
    empty.setAttribute('data-pkc-region', 'kanban-empty');
    empty.textContent = 'No active todos. Create a todo to see it here.';
    kanban.appendChild(empty);
  }

  return kanban;
}

// Phase γ-A2:編集モード picker(spec §2.5)。flag `shell.edit_mode_enabled`
// が ON のとき action bar に表示。inline / window を選ぶと SET_EDIT_MODE が
// dispatch され、以後あらゆる編集トリガ(✏️ Edit / Ctrl+E / Enter)がその
// surface に分岐する。
function renderEditModePicker(editMode: 'inline' | 'window'): HTMLElement {
  const picker = createElement('div', 'pkc-edit-mode-picker');
  picker.setAttribute('data-pkc-region', 'edit-mode-picker');
  for (const m of [
    { v: 'inline' as const, label: 'Inline', tip: '中央ペイン内で編集(従来)' },
    { v: 'window' as const, label: 'Window', tip: '専用ウィンドウで編集' },
  ]) {
    const btn = createElement('button', 'pkc-edit-mode-btn');
    btn.setAttribute('data-pkc-action', 'set-edit-mode');
    btn.setAttribute('data-pkc-edit-mode', m.v);
    btn.setAttribute('title', m.tip);
    if (m.v === editMode) btn.classList.add('pkc-edit-mode-active');
    btn.textContent = m.label;
    picker.appendChild(btn);
  }
  return picker;
}

/**
 * テキスト entry 用の追記 / 差し挟み入力エリア。textlog の append を text に持ち込み、
 * さらに「どこへ挿すか」(本文末尾 or h1–h3 の章)を選べる。user direction
 * (2026-06-24):編集の大半は既存文書への**追記**と**差し挟み**(Vim 的発想)。
 * ①=末尾追記、②=同様の入力で章(節)末尾へ差し挟む focused insert。全文を editor に
 * 載せず、本文を `QUICK_UPDATE_ENTRY`(phase 遷移なし)で更新。readonly は CSS で非表示。
 */
function renderTextAppendArea(entry: Entry): HTMLElement {
  const area = createElement('div', 'pkc-text-append');
  area.setAttribute('data-pkc-region', 'text-append');

  const input = document.createElement('textarea');
  input.className = 'pkc-text-append-input';
  input.setAttribute('data-pkc-field', 'text-append-text');
  input.setAttribute('data-pkc-lid', entry.lid);
  input.rows = 3;
  input.placeholder = '追記 / 差し挟むテキスト…(Ctrl+Enter)';
  area.appendChild(input);

  // ② 挿入先 selector:本文末尾(既定)or h1–h3 の章。章があるときだけ出す。
  // 章を選ぶと、その章の末尾(次の見出しの直前)へ差し挟む。
  const sections = extractBodySections(entry.body ?? '');
  if (sections.length > 0) {
    const select = document.createElement('select');
    select.className = 'pkc-text-append-target';
    select.setAttribute('data-pkc-field', 'text-append-target');
    select.setAttribute('data-pkc-lid', entry.lid);
    select.setAttribute('title', '挿入先(本文末尾 / 章を選んで差し挟み)');
    const endOpt = document.createElement('option');
    endOpt.value = '';
    endOpt.textContent = '▼ 本文末尾';
    select.appendChild(endOpt);
    for (const s of sections) {
      const opt = document.createElement('option');
      opt.value = String(s.index);
      // level で字下げして章構造を見せる(h1=0, h2=1, h3=2 段)。
      opt.textContent = `${'　'.repeat(s.level - 1)}▸ ${s.text}`;
      select.appendChild(opt);
    }
    area.appendChild(select);
  }

  const btn = document.createElement('button');
  btn.className = 'pkc-btn pkc-btn-create pkc-text-append-btn';
  btn.setAttribute('data-pkc-action', 'append-text');
  btn.setAttribute('data-pkc-lid', entry.lid);
  btn.setAttribute('title', '追記 / 差し挟み(Ctrl+Enter)');
  btn.textContent = '＋ 挿入';
  area.appendChild(btn);

  // ②-edit:selector で章を選んで「章を編集」= その章の本文を focused editor で
  // 開いて丸ごと書き換える(差し挟みの編集版)。章があるときだけ出す。
  if (sections.length > 0) {
    const editBtn = document.createElement('button');
    editBtn.className = 'pkc-btn pkc-text-section-edit-btn';
    editBtn.setAttribute('data-pkc-action', 'begin-section-edit');
    editBtn.setAttribute('data-pkc-lid', entry.lid);
    editBtn.setAttribute('title', '選んだ章の本文を開いて書き換える');
    editBtn.textContent = '✎ 章を編集';
    area.appendChild(editBtn);
  }

  return area;
}

/**
 * 章フォーカス editor:text entry の h1–h3 を 1 節だけ開いて書き換える focused
 * editor。全文を載せず、その章のテキスト(見出し行〜次見出し直前)だけを textarea
 * に出す。保存で当該節へ splice(`replaceSectionText`)→ `COMMIT_SECTION_EDIT`。
 * text 以外 / index が解決できない場合は null(呼び出し側は通常 view に fall back)。
 */
function renderSectionEditor(entry: Entry, index: number): HTMLElement | null {
  if (entry.archetype !== 'text') return null;
  const body = entry.body ?? '';
  const section = extractBodySections(body)[index];
  if (!section) return null;
  const sectionText = getSectionText(body, section);

  const wrap = createElement('div', 'pkc-section-editor');
  wrap.setAttribute('data-pkc-region', 'section-editor');

  const header = createElement('div', 'pkc-section-editor-header');
  const label = createElement('span', 'pkc-section-editor-label');
  label.textContent = `✎ 章を編集:${section.text}`;
  header.appendChild(label);
  const hint = createElement('span', 'pkc-section-editor-hint');
  hint.textContent = 'この章だけを書き換えます(他の章・前文は変更されません)';
  header.appendChild(hint);
  wrap.appendChild(header);

  const ta = document.createElement('textarea');
  ta.className = 'pkc-section-editor-text pkc-editor-body';
  ta.setAttribute('data-pkc-field', 'section-edit-text');
  ta.setAttribute('data-pkc-lid', entry.lid);
  ta.setAttribute('data-pkc-section-index', String(index));
  ta.value = sectionText;
  const lineCount = sectionText.split('\n').length;
  ta.rows = Math.max(8, lineCount + 2);
  wrap.appendChild(ta);

  const actions = createElement('div', 'pkc-section-editor-actions');
  const save = createElement('button', 'pkc-btn pkc-btn-create pkc-section-editor-save');
  save.setAttribute('data-pkc-action', 'commit-section-edit');
  save.setAttribute('data-pkc-lid', entry.lid);
  save.setAttribute('title', '保存(Ctrl+Enter / Ctrl+S)');
  save.textContent = '保存';
  actions.appendChild(save);
  const cancel = createElement('button', 'pkc-btn pkc-section-editor-cancel');
  cancel.setAttribute('data-pkc-action', 'cancel-section-edit');
  cancel.setAttribute('title', '取消(Esc)');
  cancel.textContent = '取消';
  actions.appendChild(cancel);
  wrap.appendChild(actions);

  return wrap;
}

/** Fixed action bar at bottom of center pane. Shows contextual actions. */
function renderActionBar(
  entry: Entry,
  phase: string,
  canEdit: boolean,
  container?: Container | null,
  editMode: 'inline' | 'window' = 'inline',
): HTMLElement {
  const bar = createElement('div', 'pkc-action-bar');
  bar.setAttribute('data-pkc-region', 'action-bar');

  if (phase === 'editing') {
    bar.setAttribute('data-pkc-editing', 'true');

    const editingLabel = createElement('span', 'pkc-action-bar-status');
    editingLabel.textContent = '✎ Editing';
    bar.appendChild(editingLabel);

    const saveBtn = createElement('button', 'pkc-btn pkc-btn-primary');
    saveBtn.setAttribute('data-pkc-action', 'commit-edit');
    saveBtn.setAttribute('data-pkc-lid', entry.lid);
    saveBtn.setAttribute('title', 'Save changes (Ctrl+S)');
    saveBtn.textContent = '💾 Save';
    bar.appendChild(saveBtn);

    const cancelBtn = createElement('button', 'pkc-btn');
    cancelBtn.setAttribute('data-pkc-action', 'cancel-edit');
    cancelBtn.setAttribute('title', 'Discard changes (Esc)');
    cancelBtn.textContent = 'Cancel';
    bar.appendChild(cancelBtn);

    // S-26 (2026-04-16): find/replace trigger. Shown only for TEXT
    // entries (body is plain markdown). Textlog / form / attachment
    // are intentionally out of scope for v1 — see
    // docs/development/text-replace-current-entry.md.
    if (entry.archetype === 'text') {
      const replaceBtn = createElement('button', 'pkc-btn');
      replaceBtn.setAttribute('data-pkc-action', 'open-replace-dialog');
      replaceBtn.setAttribute('data-pkc-lid', entry.lid);
      replaceBtn.setAttribute('title', 'Find & replace inside this entry');
      replaceBtn.textContent = '🔎 Replace';
      bar.appendChild(replaceBtn);
    }
  } else {
    if (canEdit) {
      const editBtn = createElement('button', 'pkc-btn');
      editBtn.setAttribute('data-pkc-action', 'begin-edit');
      editBtn.setAttribute('data-pkc-lid', entry.lid);
      editBtn.setAttribute('title', 'Edit this entry');
      editBtn.textContent = '✏️ Edit';
      bar.appendChild(editBtn);

      if (shellEditModeEnabled()) {
        bar.appendChild(renderEditModePicker(editMode));
      }

      const deleteBtn = createElement('button', 'pkc-btn pkc-btn-danger');
      deleteBtn.setAttribute('data-pkc-action', 'delete-entry');
      deleteBtn.setAttribute('data-pkc-lid', entry.lid);
      deleteBtn.setAttribute('title', 'Delete this entry permanently');
      deleteBtn.textContent = '🗑️ Delete';
      bar.appendChild(deleteBtn);
    }

    // Folder export: show when the selected folder has TEXT/TEXTLOG
    // descendants. Export is a read-only operation, so always shown
    // (including readonly). Lives on the action bar because it's
    // folder-specific (not a global Data… panel action).
    if (entry.archetype === 'folder' && container) {
      const descendantLids = collectDescendantLids(container.relations, entry.lid);
      const hasExportable = container.entries.some(
        (e) => descendantLids.has(e.lid) && (e.archetype === 'text' || e.archetype === 'textlog'),
      );
      if (hasExportable) {
        const exportBtn = createElement('button', 'pkc-btn');
        exportBtn.setAttribute('data-pkc-action', 'export-folder');
        exportBtn.setAttribute('data-pkc-lid', entry.lid);
        exportBtn.setAttribute(
          'title',
          'フォルダ配下の TEXT / TEXTLOG を一括バンドル（.folder-export.zip）として書き出す（別 PKC2 への再インポート用）',
        );
        exportBtn.textContent = '📦 Export';
        bar.appendChild(exportBtn);
      }
    }

    // Secondary actions for TEXT / TEXTLOG: copy, viewer, export.
    // Collapsed behind a <details> "More…" toggle to keep the action
    // bar compact. Always rendered (including readonly) since none
    // of these buttons mutate state.
    if (entry.archetype === 'text' || entry.archetype === 'textlog') {
      const more = document.createElement('details');
      more.className = 'pkc-action-bar-more';
      more.setAttribute('data-pkc-region', 'action-bar-more');
      const moreSummary = document.createElement('summary');
      moreSummary.className = 'pkc-btn pkc-action-bar-more-summary';
      moreSummary.setAttribute('title', 'コピー・表示・エクスポート');
      // 2026-04-26 user audit: macOS native menu idiom (see Data… in
      // `renderExportImportInline`). The `data-pkc-pdr-menu` marker
      // hooks into `handleDetailsMenuMouseDown` in action-binder.
      moreSummary.setAttribute('data-pkc-pdr-menu', '');
      moreSummary.textContent = 'More…';
      more.appendChild(moreSummary);

      const moreContent = createElement('div', 'pkc-action-bar-more-content');

      // Slice 4-B: Copy MD / Copy Rich emit markdown-source round-trip
      // payloads and therefore only make sense for TEXT. TEXTLOG's
      // flatten path (`serializeTextlogAsMarkdown`) has been removed —
      // users export TEXTLOG via the rendered viewer's Download HTML
      // button instead.
      if (entry.archetype === 'text') {
        // PR-2JJ v2(2026-05-13):既存「📋 MD」は GFM 標準クリーンアップ出力に変更、
        // 相互運用(Word / Notion / Obsidian 等)用。AST 経由で PKC 拡張を剥がす。
        const copyMdBtn = createElement('button', 'pkc-btn pkc-action-copy-md');
        copyMdBtn.setAttribute('data-pkc-action', 'copy-markdown-gfm');
        copyMdBtn.setAttribute('data-pkc-lid', entry.lid);
        copyMdBtn.setAttribute('title', 'GFM 標準 Markdown(PKC 拡張を剥がした相互運用用)をコピー');
        copyMdBtn.textContent = '📋 MD';
        moreContent.appendChild(copyMdBtn);

        // PR-2JJ v2(2026-05-13):新規「📋 PKC MD」AST → 正規記法 PKC MD で復元、
        // PKC2 ↔ PKC2 round-trip 用 / spec 準拠の canonical 形を入手。
        const copyPkcMdBtn = createElement('button', 'pkc-btn pkc-action-copy-pkc-md');
        copyPkcMdBtn.setAttribute('data-pkc-action', 'copy-markdown-pkc');
        copyPkcMdBtn.setAttribute('data-pkc-lid', entry.lid);
        copyPkcMdBtn.setAttribute('title', 'AST → 正規記法 PKC MD でコピー(PKC ↔ PKC 用、canonicalize 経由)');
        copyPkcMdBtn.textContent = '📋 PKC MD';
        moreContent.appendChild(copyPkcMdBtn);

        const copyRichBtn = createElement('button', 'pkc-btn pkc-action-copy-rich');
        copyRichBtn.setAttribute('data-pkc-action', 'copy-rich-markdown');
        copyRichBtn.setAttribute('data-pkc-lid', entry.lid);
        copyRichBtn.setAttribute('title', 'Markdown + HTML をリッチコピー（リッチエディタに貼り付け可能）');
        copyRichBtn.textContent = '🎨 Rich';
        moreContent.appendChild(copyRichBtn);
      }

      const viewerBtn = createElement('button', 'pkc-btn pkc-action-rendered-viewer');
      viewerBtn.setAttribute('data-pkc-action', 'open-rendered-viewer');
      viewerBtn.setAttribute('data-pkc-lid', entry.lid);
      viewerBtn.setAttribute('title', '印刷可能なビューを新しいウィンドウで開く');
      viewerBtn.textContent = '📖 Viewer';
      moreContent.appendChild(viewerBtn);

      // TEXTLOG-only: download a portable CSV+ZIP bundle.
      if (entry.archetype === 'textlog') {
        const compactLabel = createElement('label', 'pkc-action-export-compact-label');
        compactLabel.setAttribute('title',
          'Compact モード: 欠損アセット参照を CSV から除去します。元データは変更されません。');
        const compactInput = createElement('input', 'pkc-action-export-compact-input');
        (compactInput as HTMLInputElement).type = 'checkbox';
        compactInput.setAttribute('data-pkc-control', 'textlog-export-compact');
        compactInput.setAttribute('data-pkc-lid', entry.lid);
        compactLabel.appendChild(compactInput);
        compactLabel.appendChild(document.createTextNode(' compact'));
        moreContent.appendChild(compactLabel);

        const exportBtn = createElement('button', 'pkc-btn pkc-action-export-textlog');
        exportBtn.setAttribute('data-pkc-action', 'export-textlog-csv-zip');
        exportBtn.setAttribute('data-pkc-lid', entry.lid);
        exportBtn.setAttribute('title', '単体バンドル（.textlog.zip = CSV + アセット）として書き出す');
        exportBtn.textContent = '📦 Export';
        moreContent.appendChild(exportBtn);
      }

      // Slice 5: TEXT → TEXTLOG conversion trigger. Only surface when
      // the entry is editable — confirming the preview dispatches
      // CREATE_ENTRY + COMMIT_EDIT, so read-only containers have
      // nothing to offer.
      if (entry.archetype === 'text' && canEdit) {
        const toLogBtn = createElement('button', 'pkc-btn pkc-action-text-to-textlog');
        toLogBtn.setAttribute('data-pkc-action', 'open-text-to-textlog-preview');
        toLogBtn.setAttribute('data-pkc-lid', entry.lid);
        toLogBtn.setAttribute('title', 'この TEXT を分割して新しい TEXTLOG を作成');
        toLogBtn.textContent = '📝 → TEXTLOG';
        moreContent.appendChild(toLogBtn);
      }

      // TEXT-only: download a markdown + assets bundle.
      if (entry.archetype === 'text') {
        const compactLabel = createElement('label', 'pkc-action-export-compact-label');
        compactLabel.setAttribute('title',
          'Compact モード: 欠損アセット参照を body.md から除去します。元データは変更されません。');
        const compactInput = createElement('input', 'pkc-action-export-compact-input');
        (compactInput as HTMLInputElement).type = 'checkbox';
        compactInput.setAttribute('data-pkc-control', 'text-export-compact');
        compactInput.setAttribute('data-pkc-lid', entry.lid);
        compactLabel.appendChild(compactInput);
        compactLabel.appendChild(document.createTextNode(' compact'));
        moreContent.appendChild(compactLabel);

        const exportBtn = createElement('button', 'pkc-btn pkc-action-export-text');
        exportBtn.setAttribute('data-pkc-action', 'export-text-zip');
        exportBtn.setAttribute('data-pkc-lid', entry.lid);
        exportBtn.setAttribute('title', '単体バンドル（.text.zip = Markdown + アセット）として書き出す');
        exportBtn.textContent = '📦 Export';
        moreContent.appendChild(exportBtn);
      }

      more.appendChild(moreContent);
      bar.appendChild(more);
    }
  }

  // Entry info badge
  const info = createElement('span', 'pkc-action-bar-info');
  info.textContent = `${archetypeIcon(entry.archetype)} ${archetypeLabel(entry.archetype)}`;
  bar.appendChild(info);

  return bar;
}

function renderView(
  entry: Entry,
  _canEdit: boolean,
  container: Container | null,
  searchQuery: string = '',
  childWindowLids: readonly string[] = [],
): HTMLElement {
  const view = createElement('div', 'pkc-view');
  view.setAttribute('data-pkc-mode', 'view');
  view.setAttribute('data-pkc-archetype', entry.archetype);

  const titleRow = createElement('div', 'pkc-view-title-row');
  const title = createElement('h2', 'pkc-view-title');
  title.textContent = entry.title || '(untitled)';
  titleRow.appendChild(title);

  // 2026-04-27 user direction: the archetype badge that used to sit
  // here was redundant — the action bar's bar-info already shows
  // the archetype on the bottom-right of the same pane. Surface a
  // Copy Link button instead so the affordance survives the meta
  // pane being collapsed AND the More… menu not being rendered
  // (some archetypes / phases skip the More… group entirely). The
  // meta-pane Copy Link stays put as the canonical detailed
  // location; the title-row button is the always-visible mirror.
  if (
    !isSystemArchetype(entry.archetype) &&
    !isReservedLid(entry.lid)
  ) {
    const copyLinkBtn = createElement('button', 'pkc-btn-small pkc-action-copy-permalink');
    copyLinkBtn.setAttribute('data-pkc-action', 'copy-entry-permalink');
    copyLinkBtn.setAttribute('data-pkc-lid', entry.lid);
    copyLinkBtn.setAttribute('title', 'このエントリの共有 URL（pkc://）をコピー');
    copyLinkBtn.setAttribute('aria-label', 'Copy permalink for this entry');
    copyLinkBtn.textContent = '🔗 Copy link';
    titleRow.appendChild(copyLinkBtn);
  }

  // Color tag Slice 3 — picker trigger. Hidden for system entries
  // (about / settings) and for reserved lids; the reducer would
  // block those anyway, so skipping the button keeps the surface
  // tidy. `_canEdit` is the underlying readonly / editing gate
  // shared with the action bar; respect it here too.
  if (
    _canEdit &&
    !isSystemArchetype(entry.archetype) &&
    !isReservedLid(entry.lid)
  ) {
    titleRow.appendChild(renderColorPickerTrigger(entry.color_tag));
  }

  // Task completion badge in title row
  const viewTaskProgress = countTaskProgress(entry);
  if (viewTaskProgress) {
    const viewTaskBadge = createElement('span', 'pkc-task-badge');
    viewTaskBadge.textContent = `${viewTaskProgress.done}/${viewTaskProgress.total}`;
    if (viewTaskProgress.done === viewTaskProgress.total) {
      viewTaskBadge.setAttribute('data-pkc-task-complete', 'true');
    }
    titleRow.appendChild(viewTaskBadge);
  }

  view.appendChild(titleRow);

  // Phase γ-A3:この entry が child window で編集中なら、その旨を view
  // 上部に明示する。BEGIN_EDIT は childWindowLids guard で inline 編集を
  // 弾くため、user に「編集は別ウィンドウ側」という導線を見せる。
  if (childWindowLids.includes(entry.lid)) {
    const winHint = createElement('div', 'pkc-view-window-hint');
    winHint.setAttribute('data-pkc-region', 'entry-in-window-hint');
    winHint.textContent = '⧉ この entry は別ウィンドウで開いています。編集はそのウィンドウで続けてください。';
    view.appendChild(winHint);
  }

  // Breadcrumb: always show path trail (root marker, ancestors, current).
  // Spec: docs/development/breadcrumb-path-trail-v1.md
  if (container) {
    const breadcrumb = getBreadcrumb(container.relations, container.entries, entry.lid);
    const bc = createElement('div', 'pkc-breadcrumb');
    bc.setAttribute('data-pkc-region', 'breadcrumb');

    if (breadcrumb.length === 0) {
      const rootMarker = createElement('span', 'pkc-breadcrumb-root');
      rootMarker.textContent = 'Root';
      bc.appendChild(rootMarker);
      const sep = createElement('span', 'pkc-breadcrumb-sep');
      sep.textContent = ' › ';
      bc.appendChild(sep);
    } else {
      // If the oldest ancestor still has a structural parent, the chain
      // was truncated by `getBreadcrumb`'s maxDepth cap.
      const truncated =
        getStructuralParent(container.relations, container.entries, breadcrumb[0]!.lid) !== null;
      if (truncated) {
        const trunc = createElement('span', 'pkc-breadcrumb-truncated');
        trunc.setAttribute('title', '…（省略された祖先あり）');
        trunc.textContent = '…';
        bc.appendChild(trunc);
        const sep = createElement('span', 'pkc-breadcrumb-sep');
        sep.textContent = ' › ';
        bc.appendChild(sep);
      }
      for (const ancestor of breadcrumb) {
        const link = createElement('span', 'pkc-breadcrumb-item');
        link.setAttribute('data-pkc-action', 'select-entry');
        link.setAttribute('data-pkc-lid', ancestor.lid);
        link.textContent = ancestor.title || '(untitled)';
        bc.appendChild(link);

        const sep = createElement('span', 'pkc-breadcrumb-sep');
        sep.textContent = ' › ';
        bc.appendChild(sep);
      }
    }
    // Current entry (non-clickable)
    const current = createElement('span', 'pkc-breadcrumb-current');
    current.textContent = entry.title || '(untitled)';
    bc.appendChild(current);

    view.appendChild(bc);
  }

  // PR-YY (2026-05-06):user 修正指示4「TEXTエントリのサムネイル
  // 指定が … エントリを開いても適切なサムネが表示されない」への対応。
  // text archetype で frontmatter / body / folder 経由で resolve できる
  // hero thumbnail があれば body の前に大きく表示する。filer card
  // grid と同じ `pickImageAssetForEntry` を経由するので一貫性あり。
  // attachment 自体は既に presenter が body 内で preview を出すので除外。
  // novel cover SVG fallback も含むため、kind:novel/book でも hero が
  // 出る。
  if (
    entry.archetype === 'text'
    && container
    && !isReservedLid(entry.lid)
    && !isSystemArchetype(entry.archetype)
  ) {
    const heroUrl = pickImageAssetForEntry(entry, container.assets, container);
    if (heroUrl) {
      const hero = createElement('div', 'pkc-view-hero-thumb');
      hero.setAttribute('data-pkc-region', 'view-hero-thumb');
      const heroImg = document.createElement('img');
      heroImg.src = heroUrl;
      heroImg.alt = entry.title || '';
      heroImg.loading = 'lazy';
      hero.appendChild(heroImg);
      view.appendChild(hero);
    }
  }

  // Archetype-dispatched body rendering.
  // For text/textlog (markdown-capable) presenters, pass assets + MIME
  // map + name map so both `![alt](asset:key)` image embeds and
  // `[label](asset:key)` non-image chips can be resolved.
  const presenter = getPresenter(entry.archetype);
  if (entry.archetype === 'attachment' && container?.assets) {
    view.appendChild(presenter.renderBody(entry, container.assets));
    // PR-V5(2026-05-14):App icon image select の option を container 内の
    // image attachment から hydrate。presenter 単体では container に access
    // できないため、ここで補完する。
    hydrateAppIconAssetOptions(view, container);
    // #806: 紐付け済み拡張への「🧩 ○○で開く」送付ボタンを action 列へ。
    hydrateExtensionSendButtons(view, entry, container);
  } else if (container?.assets) {
    // pgc-229:`buildAssetMimeMap` / `buildAssetNameMap` は container.entries
    // 全件を walk して attachment archetype entry を filter。c-5000 で
    // 2 walk 合計 ~1-2ms 累積。container.assets が空(asset data 無し)なら
    // map は必ず空、walk 自体無意味 ── early skip で empty map を pass。
    // body が asset: ref を持たない場合の cost は presenter 側 `hasAssetReferences`
    // gate で既に短絡されているが、map build 自体の cost は本 PR で除去。
    const hasAnyAsset = Object.keys(container.assets).length > 0;
    const mimeByKey = hasAnyAsset ? buildAssetMimeMap(container) : {};
    const nameByKey = hasAnyAsset ? buildAssetNameMap(container) : {};
    // `container.entries` is passed so text-like presenters can expand
    // `![](entry:...)` transclusions (P1 Slice 5-B). Non-text presenters
    // (attachment / folder / todo / form) ignore this 5th argument.
    // `container.meta.container_id` is threaded so the markdown renderer
    // can distinguish same-container from cross-container `pkc://`
    // permalinks (spec pkc-link-unification-v0 §4). Presenters that
    // don't render markdown ignore the 6th argument.
    view.appendChild(
      presenter.renderBody(
        entry,
        container.assets,
        mimeByKey,
        nameByKey,
        container.entries,
        container.meta.container_id,
      ),
    );
  } else {
    view.appendChild(presenter.renderBody(entry));
  }

  // テキスト追記エリア:本文末尾へ素早く追記する小入力(全文を editor に載せず
  // QUICK_UPDATE_ENTRY で append)。view モード(本パス)= 非編集時のみ出る
  // (編集中は renderEditorBody 経路で本パスを通らない)。
  if (entry.archetype === 'text') {
    view.appendChild(renderTextAppendArea(entry));
  }

  // Folder contents section (show children for folder entries)
  if (entry.archetype === 'folder' && container) {
    view.appendChild(renderFolderContents(entry, container));
  }

  // Tags, relations, history, move → moved to right meta pane (renderMetaPane)

  // A-4 Slice α (USER_REQUEST_LEDGER S-15, 2026-04-14): when a
  // search query is active, wrap matching text in `<mark>` so the
  // user can see WHERE the entry matched. Code blocks (`<pre>`) are
  // skipped to keep B-2 syntax-highlight token markup intact. The
  // helper is idempotent so re-rendering the same entry is safe.
  // Parser slice (2026-04-23): highlight the FullText portion only.
  // `tag:<value>` tokens contribute to the Tag axis and must NOT
  // be highlighted as literal body text — otherwise a query like
  // `foo tag:urgent` would paint the literal string `tag:urgent`
  // yellow whenever an entry happens to contain that substring.
  const highlightText = parseSearchQuery(searchQuery).fullText;
  if (highlightText.trim() !== '') {
    highlightMatchesIn(view, highlightText);
  }

  return view;
}

/** Right pane: meta information — tags, relations, history, move-to-folder. */
function renderMetaPane(
  entry: Entry,
  canEdit: boolean,
  container: Container | null,
  sharedLinkIndex: LinkIndex | null = null,
  /**
   * W1 Slice F-2 — active Tag filter Set so each entry Tag chip can
   * mark itself as "already filtered". Optional to avoid touching
   * every caller that pre-dates the Tag filter axis.
   */
  activeTagFilter: ReadonlySet<string> | undefined = undefined,
  metaPaneMode: 'all' | 'properties' | 'references' = 'all',
): HTMLElement {
  const endProfile = profileStart('render:meta');
  try {
    return renderMetaPaneImpl(
      entry,
      canEdit,
      container,
      sharedLinkIndex,
      activeTagFilter,
      metaPaneMode,
    );
  } finally {
    endProfile();
  }
}

// Phase γ-B3:meta pane mode bar(spec §4)。
function renderMetaPaneModeBar(mode: string): HTMLElement {
  const bar = createElement('div', 'pkc-meta-pane-mode-bar');
  bar.setAttribute('data-pkc-region', 'meta-pane-mode-bar');
  for (const m of [
    { v: 'all', label: 'すべて' },
    { v: 'properties', label: 'プロパティ' },
    { v: 'references', label: '関連' },
  ]) {
    const btn = createElement('button', 'pkc-meta-pane-mode-btn');
    btn.setAttribute('data-pkc-action', 'set-meta-pane-mode');
    btn.setAttribute('data-pkc-meta-pane-mode', m.v);
    if (m.v === mode) btn.classList.add('pkc-meta-pane-mode-active');
    btn.textContent = m.label;
    bar.appendChild(btn);
  }
  return bar;
}

// mode に応じて meta pane の section 表示を絞る。all は全表示。region 無し
// (header / timestamps)と mode bar は常時表示。
const META_PANE_MODE_VISIBLE: Readonly<
  Record<string, readonly string[] | null>
> = {
  all: null,
  properties: ['frontmatter'],
  references: ['references', 'tags', 'entry-tags', 'relation-create'],
};
function applyMetaPaneModeFilter(pane: HTMLElement, mode: string): void {
  const visible = META_PANE_MODE_VISIBLE[mode];
  if (!visible) return;
  for (const child of Array.from(pane.children)) {
    const region = child.getAttribute('data-pkc-region');
    if (!region || region === 'meta-pane-mode-bar') continue;
    if (!visible.includes(region)) {
      (child as HTMLElement).style.display = 'none';
    }
  }
}

function renderMetaPaneImpl(
  entry: Entry,
  canEdit: boolean,
  container: Container | null,
  sharedLinkIndex: LinkIndex | null = null,
  activeTagFilter: ReadonlySet<string> | undefined = undefined,
  metaPaneMode: 'all' | 'properties' | 'references' = 'all',
): HTMLElement {
  // pgc-219:bench で render:meta 開始から最初の sub-profile (meta:frontmatter)
  // 開始まで 20ms 程度のギャップが c-1000 で観測された(pgc-216 sub-profile
  // 群の "unmeasured" 部分の一部)。header / Copy link button / timestamps の
  // build 区間を `meta:startup` sub-profile で覆い、startup overhead を identify。
  const endProfStartup = profileStart('meta:startup');
  const meta = createElement('aside', 'pkc-meta-pane');
  meta.setAttribute('data-pkc-region', 'meta');

  // Entry info header
  const infoHeader = createElement('div', 'pkc-meta-header');
  infoHeader.textContent = `${archetypeIcon(entry.archetype)} ${archetypeLabel(entry.archetype)}`;

  // Copy permalink — small affordance in the header row so the
  // paste-wiring loop (copy → paste → same-container demotion) has
  // a visible entry point. The button is always shown; when the
  // container lacks an id the handler surfaces an error toast and
  // leaves the clipboard untouched.
  // Spec: docs/spec/pkc-link-unification-v0.md §4 + §7.
  const copyLinkBtn = createElement('button', 'pkc-btn-small pkc-meta-copy-permalink');
  copyLinkBtn.setAttribute('data-pkc-action', 'copy-entry-permalink');
  copyLinkBtn.setAttribute('data-pkc-lid', entry.lid);
  copyLinkBtn.setAttribute('title', 'このエントリの共有 URL(pkc://)をコピー');
  copyLinkBtn.setAttribute('aria-label', 'Copy permalink for this entry');
  copyLinkBtn.textContent = '🔗 Copy link';
  infoHeader.appendChild(copyLinkBtn);

  meta.appendChild(infoHeader);

  // Phase γ-B3:flag ON で meta pane mode bar(すべて / Properties / 関連)。
  if (metaPaneModeTabsEnabled()) {
    meta.appendChild(renderMetaPaneModeBar(metaPaneMode));
  }

  // Created / Updated timestamps
  const timestamps = createElement('div', 'pkc-meta-timestamps');
  const created = createElement('div', 'pkc-meta-ts');
  created.textContent = `Created: ${formatTimestamp(entry.created_at)}`;
  timestamps.appendChild(created);
  const updated = createElement('div', 'pkc-meta-ts');
  updated.textContent = `Updated: ${formatTimestamp(entry.updated_at)}`;
  timestamps.appendChild(updated);
  meta.appendChild(timestamps);
  endProfStartup();

  // Table of Contents (TEXT / TEXTLOG with h1–h3 headings).
  // 領域 10-6 ζ'' Phase 2a — Frontmatter property table.
  // Body-leading `---\n…\n---\n` YAML produces a small key/value list
  // here so book / youtube / paper / film / album metadata is visible
  // in the meta pane without rendering it inside the markdown.
  // pgc-216:frontmatter parsing(YAML mini parser)+ TOC enumeration
  // (markdown body から h1-h3 抽出)の cost を sub-profile で識別。
  const endProfFrontmatter = profileStart('meta:frontmatter');
  const frontmatterSection = renderFrontmatterSection(entry, canEdit);
  if (frontmatterSection) meta.appendChild(frontmatterSection);
  endProfFrontmatter();

  // Hidden entirely when the body produces zero headings, per spec §4.
  const endProfToc = profileStart('meta:toc');
  const tocSection = renderTocSection(entry);
  if (tocSection) meta.appendChild(tocSection);
  endProfToc();

  if (!container) return meta;

  // W1 Slice F — free-form Tag chip section. This precedes the
  // categorical-relation "Categorical" section below so the
  // lightweight per-entry Tag attribute appears first in the meta
  // pane's visual order (W1 Slice A §5.2 visual hierarchy: Tag chip
  // row sits ahead of Relation lists).
  // pgc-216:entry-tags + categorical + tag section + move + description +
  // profile を 1 sub-profile で覆う(各 section ~1-2ms で合計 6-10ms 想定)。
  // pgc-221:meta:middle-sections 9.6ms@1000 を 5 section sub-profile に
  // split、最重 section を identify。entryTags / categorical+tag /
  // move-to-folder / description / profile の 5 グループ。
  const endProfMiddleSections = profileStart('meta:middle-sections');
  const endProfEntryTags = profileStart('meta:section-entry-tags');
  const entryTagSection = createElement('div', 'pkc-entry-tags');
  entryTagSection.setAttribute('data-pkc-region', 'entry-tags');
  entryTagSection.setAttribute('data-pkc-lid', entry.lid);

  const entryTagHeading = createElement('span', 'pkc-entry-tags-label');
  entryTagHeading.textContent = 'タグ';
  entryTagSection.appendChild(entryTagHeading);

  const entryTags = entry.tags ?? [];
  for (const tagValue of entryTags) {
    const chip = createElement('span', 'pkc-entry-tag-chip');
    chip.setAttribute('data-pkc-entry-tag-value', tagValue);
    // Slice F-2 — surface whether this value is currently part of
    // the active Tag filter, so CSS / selectors can style "already
    // filtered" chips distinctly. Users can still toggle from
    // either state (click = add, click again = remove).
    if (activeTagFilter?.has(tagValue)) {
      chip.setAttribute('data-pkc-entry-tag-filter-active', 'true');
    }

    // Slice F-2 — chip label click toggles Tag filter. The role
    // split with the `×` button is strict: label = filter toggle,
    // × = remove tag from entry. action-binder's event delegation
    // uses `closest()` to pick the nearest `data-pkc-action`, so
    // clicking `×` resolves to the button first and the filter
    // toggle never fires.
    const chipLabel = createElement('span', 'pkc-entry-tag-label');
    chipLabel.setAttribute('data-pkc-action', 'toggle-tag-filter');
    chipLabel.setAttribute('data-pkc-tag-value', tagValue);
    chipLabel.setAttribute('title', `Toggle tag filter: ${tagValue}`);
    chipLabel.textContent = tagValue;
    chip.appendChild(chipLabel);

    if (canEdit) {
      const removeBtn = createElement('button', 'pkc-entry-tag-remove');
      removeBtn.setAttribute('data-pkc-action', 'remove-entry-tag');
      removeBtn.setAttribute('data-pkc-lid', entry.lid);
      removeBtn.setAttribute('data-pkc-entry-tag-value', tagValue);
      removeBtn.setAttribute('title', `Remove tag: ${tagValue}`);
      removeBtn.textContent = '×';
      chip.appendChild(removeBtn);
    }

    entryTagSection.appendChild(chip);
  }

  if (canEdit) {
    const addForm = createElement('span', 'pkc-entry-tag-add');
    addForm.setAttribute('data-pkc-region', 'entry-tag-add');
    addForm.setAttribute('data-pkc-lid', entry.lid);

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'pkc-entry-tag-input';
    input.setAttribute('data-pkc-field', 'entry-tag-input');
    input.setAttribute('data-pkc-lid', entry.lid);
    input.setAttribute('placeholder', '+ タグ');
    input.setAttribute('maxlength', '64');
    addForm.appendChild(input);

    const addBtn = createElement('button', 'pkc-btn-small pkc-entry-tag-add-btn');
    addBtn.setAttribute('data-pkc-action', 'add-entry-tag');
    addBtn.setAttribute('data-pkc-lid', entry.lid);
    addBtn.setAttribute('title', 'Add a tag to this entry');
    addBtn.textContent = 'Add';
    addForm.appendChild(addBtn);

    entryTagSection.appendChild(addForm);
  }

  meta.appendChild(entryTagSection);
  endProfEntryTags();
  const endProfCategoricalTag = profileStart('meta:section-categorical-tag');

  // Tags section (categorical relation — Slice A §2 "Categorical").
  // The DOM region / class / action names stay stable so existing
  // tests and CSS selectors keep working; only the visible label
  // was renamed from "Tags" → "Categorical" to reclaim the "Tags"
  // wording for the free-form Tag axis above.
  const tags = getTagsForEntry(container.relations, container.entries, entry.lid);
  const tagSection = createElement('div', 'pkc-tags');
  tagSection.setAttribute('data-pkc-region', 'tags');

  const tagHeading = createElement('span', 'pkc-tags-label');
  tagHeading.textContent = '分類';
  tagSection.appendChild(tagHeading);

  for (const tag of tags) {
    const chip = createElement('span', 'pkc-tag-chip');
    chip.setAttribute('data-pkc-tag-relation-id', tag.relationId);

    const chipLabel = createElement('span', 'pkc-tag-label');
    chipLabel.setAttribute('data-pkc-action', 'filter-by-tag');
    chipLabel.setAttribute('data-pkc-lid', tag.peer.lid);
    chipLabel.setAttribute('title', 'Click to filter by this tag');
    chipLabel.textContent = tag.peer.title || '(untitled)';
    chip.appendChild(chipLabel);

    if (canEdit) {
      const removeBtn = createElement('button', 'pkc-tag-remove');
      removeBtn.setAttribute('data-pkc-action', 'remove-tag');
      removeBtn.setAttribute('data-pkc-relation-id', tag.relationId);
      removeBtn.setAttribute('title', 'Remove this tag');
      removeBtn.textContent = '\u00d7';
      chip.appendChild(removeBtn);
    }

    tagSection.appendChild(chip);
  }

  // pgc-226(pgc-222 lazy options の deeper attack):pgc-222 で options 構築
  // は lazy 化したが、visibility 判定の `getAvailableTagTargets(...).length > 0`
  // 自体が container.relations + entries を walk する N+M cost で
  // c-5000 で ~5ms 残存。**visibility check も lazy 化**:cheap な
  // `container.entries.length > 1` で「他に entry がある」 だけ確認、actual
  // available は user mousedown 時に handler が compute する。`available=0`
  // のときに select が表示される問題は handler 側で空 options + placeholder
  // 「(候補無し)」 表示で対処(後方互換維持)。
  if (canEdit && container.entries.length > 1) {
    const addForm = createElement('span', 'pkc-tag-add');
    addForm.setAttribute('data-pkc-region', 'tag-add');
    addForm.setAttribute('data-pkc-from', entry.lid);

    const select = document.createElement('select');
    select.setAttribute('data-pkc-field', 'tag-target');
    select.className = 'pkc-tag-select';
    select.setAttribute('data-pkc-lazy-options', 'tag-target');
    select.setAttribute('data-pkc-from-lid', entry.lid);
    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = '+ Tag (クリックで読込)';
    select.appendChild(defaultOpt);
    addForm.appendChild(select);

    const addBtn = createElement('button', 'pkc-btn-small');
    addBtn.setAttribute('data-pkc-action', 'add-tag');
    addBtn.setAttribute('title', 'Add a tag to this entry');
    addBtn.textContent = 'Add';
    addForm.appendChild(addBtn);

    tagSection.appendChild(addForm);
  }

  meta.appendChild(tagSection);
  endProfCategoricalTag();
  const endProfMove = profileStart('meta:section-move');

  // Move to Folder
  // pgc-227(pgc-222 lazy options doctrine の move-target 適用):従来は
  // render-time に `getAvailableFolders` で descendant walk(O(R))+ folder
  // filter(O(N))していたが、c-5000 で `meta:section-move` 2.5ms 累積。
  // **options を lazy-build 化** ── render-time は placeholder のみ append、
  // user の select mousedown 時に handler(`handleLazyTagTargetPopulate`
  // 拡張)が full folders を populate。`getStructuralParent` は「in: X」
  // label / placeholder text / selected option mark のため render-time に
  // 残す(structural relation 1 件目で短絡で安価)。
  if (canEdit) {
    const moveSection = createElement('div', 'pkc-move-to-folder');
    moveSection.setAttribute('data-pkc-region', 'move-to-folder');
    moveSection.setAttribute('data-pkc-lid', entry.lid);

    const moveLabel = createElement('span', 'pkc-move-label');
    moveLabel.textContent = 'フォルダ';
    moveSection.appendChild(moveLabel);

    const currentParent = getStructuralParent(container.relations, container.entries, entry.lid);

    if (currentParent) {
      const currentLoc = createElement('span', 'pkc-move-current');
      currentLoc.textContent = `in: ${currentParent.title || '(untitled)'}`;
      moveSection.appendChild(currentLoc);
    }

    const select = document.createElement('select');
    select.setAttribute('data-pkc-field', 'move-target');
    select.className = 'pkc-move-select';
    select.setAttribute('data-pkc-lazy-options', 'move-target');
    select.setAttribute('data-pkc-from-lid', entry.lid);
    if (currentParent) {
      select.setAttribute('data-pkc-current-parent-lid', currentParent.lid);
    }

    // Placeholder option:render-time に 1 つだけ append。user mousedown 時に
    // handler が full folders を populate し、current parent option を select する。
    const noneOpt = document.createElement('option');
    noneOpt.value = '';
    noneOpt.textContent = currentParent ? '↑ Root level' : '(root)';
    if (!currentParent) noneOpt.selected = true;
    select.appendChild(noneOpt);

    moveSection.appendChild(select);

    const moveBtn = createElement('button', 'pkc-btn-small');
    moveBtn.setAttribute('data-pkc-action', 'move-to-folder');
    moveBtn.setAttribute('title', 'Move this entry to the selected folder');
    moveBtn.textContent = 'Move';
    moveSection.appendChild(moveBtn);

    meta.appendChild(moveSection);
  }
  endProfMove();
  const endProfDescProfile = profileStart('meta:section-desc-profile');

  // Filer display profile (folder archetype only) —領域 10-6 ζ'' Phase 1.
  // Phase 1 only ships `'explorer'`; Phase 2b/3a will add `'graph'` /
  // `'contact-sheet'` / `'book-base'` / `'youtube-base'` to the option list.
  if (entry.archetype === 'folder' && canEdit) {
    // Description editor — 2026-05-06 user direction:「フォルダの説明
    // は右ペインから編集できるようにして、ファイラー UI を阻害しない」。
    // Folder body は description として運用、QUICK_UPDATE_ENTRY 経由。
    const descSection = createElement('div', 'pkc-folder-description-editor');
    descSection.setAttribute('data-pkc-region', 'folder-description-editor');
    descSection.setAttribute('data-pkc-lid', entry.lid);
    const descLabel = createElement('span', 'pkc-folder-description-label');
    descLabel.textContent = 'フォルダ説明';
    descSection.appendChild(descLabel);
    const descInput = document.createElement('textarea');
    descInput.className = 'pkc-folder-description-input';
    descInput.setAttribute('data-pkc-action', 'set-folder-description');
    descInput.setAttribute('data-pkc-lid', entry.lid);
    descInput.setAttribute('placeholder', 'このフォルダの説明…');
    descInput.rows = 3;
    descInput.value = entry.body ?? '';
    descSection.appendChild(descInput);
    meta.appendChild(descSection);

    const profileSection = createElement('div', 'pkc-filer-profile-editor');
    profileSection.setAttribute('data-pkc-region', 'filer-display-profile-editor');
    profileSection.setAttribute('data-pkc-lid', entry.lid);

    const profileLabel = createElement('span', 'pkc-filer-profile-label');
    profileLabel.textContent = 'Filer 表示';
    profileSection.appendChild(profileLabel);

    const select = document.createElement('select');
    select.setAttribute('data-pkc-action', 'set-display-profile');
    select.setAttribute('data-pkc-lid', entry.lid);
    select.className = 'pkc-filer-profile-select';

    // U5 (2026-05-07、wave-10-6 UX evaluation):subset 8 種が単一 list に
    // 並び意味分類が混在(table / grid / network / query)。<optgroup> で
    // 4 group に整理し、初見 user でも何用か判別しやすくする。Graph は
    // PR-HHH で廃止済(center pane viewMode='graph' タブが canonical)。
    type ProfileOpt = { value: string; label: string };
    const groups: { label: string; opts: ProfileOpt[] }[] = [
      {
        label: '既定',
        opts: [{ value: 'auto', label: 'Auto(自動判定)' }],
      },
      {
        label: 'Layout',
        opts: [
          { value: 'explorer', label: 'Explorer(table)' },
          { value: 'contact-sheet', label: 'Contact sheet(album)' },
        ],
      },
      {
        label: 'Catalogue',
        opts: [
          { value: 'book-base', label: 'Book base(蔵書)' },
          { value: 'video-base', label: 'Video base(動画)' },
          { value: 'novel-base', label: 'Novel base(小説)' },
          { value: 'audio-base', label: 'Audio base(音声)' },
        ],
      },
      {
        label: 'Query',
        opts: [
          { value: 'inventory', label: 'Inventory(Bases 風)' },
        ],
      },
    ];
    // PR-G G15 (2026-05-06):default は auto。undefined display_profile も
    // auto と同じ意味として扱う。
    const current = entry.display_profile?.kind ?? 'auto';
    for (const group of groups) {
      const og = document.createElement('optgroup');
      og.label = group.label;
      for (const opt of group.opts) {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        if (opt.value === current) option.selected = true;
        og.appendChild(option);
      }
      select.appendChild(og);
    }
    profileSection.appendChild(select);

    // Auto モード時、自動判定された結果を併記して user に伝える。
    if (current === 'auto' && container) {
      const childLids = new Set<string>();
      for (const r of container.relations) {
        if (r.kind === 'structural' && r.from === entry.lid) childLids.add(r.to);
      }
      const children = container.entries.filter(
        (e) => childLids.has(e.lid) && !isSystemArchetype(e.archetype),
      );
      const resolved = autoDetectFilerProfile(children);
      const hint = createElement('span', 'pkc-filer-profile-hint');
      hint.setAttribute('data-pkc-region', 'filer-profile-auto-hint');
      hint.setAttribute('data-pkc-resolved-kind', resolved.kind);
      hint.textContent = `→ 現在: ${resolved.kind}(${children.length} 件中)`;
      profileSection.appendChild(hint);
    }

    meta.appendChild(profileSection);
  }
  endProfDescProfile();
  endProfMiddleSections();

  // History section
  // pgc-215:revisions / history / branches を 1 sub-profile で括る
  // (pgc-181 revision diff viewer flag が ON だと per-revision diff
  // compute が重くなる)。
  const endProfHistory = profileStart('meta:history');
  const revCount = revisionCountOf(container, entry.lid);
  if (revCount > 0) {
    const latest = getLatestRevision(container, entry.lid);
    const revInfo = createElement('div', 'pkc-revision-info');
    revInfo.setAttribute('data-pkc-region', 'revision-info');
    revInfo.setAttribute('data-pkc-revision-count', String(revCount));

    const heading = createElement('div', 'pkc-revision-heading');
    heading.textContent = `History (${revCount})`;
    revInfo.appendChild(heading);

    if (latest) {
      const latestInfo = createElement('div', 'pkc-revision-latest');
      latestInfo.setAttribute('data-pkc-region', 'revision-latest');
      const latestLabel = createElement('span', 'pkc-revision-latest-label');
      latestLabel.textContent = formatTimestamp(latest.created_at);
      latestInfo.appendChild(latestLabel);

      const parsed = parseRevisionSnapshot(latest);
      if (parsed) {
        const preview = createElement('span', 'pkc-revision-preview');
        preview.setAttribute('data-pkc-region', 'revision-preview');
        preview.textContent = `"${truncate(parsed.title, 30)}"`;
        latestInfo.appendChild(preview);
      }

      revInfo.appendChild(latestInfo);
    }

    if (canEdit && latest) {
      const restoreBtn = createElement('button', 'pkc-btn-small');
      restoreBtn.setAttribute('data-pkc-action', 'restore-entry');
      restoreBtn.setAttribute('data-pkc-lid', entry.lid);
      restoreBtn.setAttribute('data-pkc-revision-id', latest.id);
      restoreBtn.setAttribute('title', 'Revert this entry to its previous saved version');
      restoreBtn.textContent = 'Revert';
      revInfo.appendChild(restoreBtn);

      // Tier 2-2: bulk restore. When the latest revision belongs to a
      // BULK_* operation (bulk_id is set) and affected > 1 entries,
      // offer to revert the whole bulk in one click. Single-entry
      // bulks fall back to the regular Revert button only.
      if (latest.bulk_id) {
        const bulkRevs = getRevisionsByBulkId(container, latest.bulk_id);
        if (bulkRevs.length > 1) {
          const bulkBtn = createElement('button', 'pkc-btn-small');
          bulkBtn.setAttribute('data-pkc-action', 'restore-bulk');
          bulkBtn.setAttribute('data-pkc-bulk-id', latest.bulk_id);
          bulkBtn.setAttribute('data-pkc-bulk-size', String(bulkRevs.length));
          bulkBtn.setAttribute(
            'title',
            `Revert the entire bulk operation that affected ${bulkRevs.length} entries`,
          );
          bulkBtn.textContent = `Revert bulk (${bulkRevs.length})`;
          revInfo.appendChild(bulkBtn);
        }
      }
    }

    meta.appendChild(revInfo);

    // C-1 revision-branch-restore v1 — picker (list + select only).
    // See `docs/spec/revision-branch-restore-v1-behavior-contract.md` §7.
    // Revisions are listed newest first so the first row matches the
    // existing Revert button. Rendered verbatim for every revision
    // (including the latest) — consolidation with Revert is v1.x
    // scope (§9.2).
    const allRevs = getEntryRevisions(container, entry.lid);
    const revsDesc = [...allRevs].reverse();
    const picker = createElement('details', 'pkc-revision-picker');
    picker.setAttribute('data-pkc-region', 'revision-history');
    const summary = createElement('summary', 'pkc-revision-picker-summary');
    // P4a: deferred 中は常駐分より総数が多いことがある ── 総数で表示し、
    // 揃うまで「読み込み中」行を出す(選択駆動の hydrate が埋める)。
    summary.textContent = `Revision history (${revCount})`;
    picker.appendChild(summary);
    if (isRevisionHydrationPending(container, entry.lid)) {
      const loading = createElement('div', 'pkc-revision-row pkc-revision-row-loading');
      loading.setAttribute('data-pkc-region', 'revision-history-loading');
      loading.textContent = `履歴を読み込み中… (${revsDesc.length}/${revCount})`;
      picker.appendChild(loading);
    }

    revsDesc.forEach((rev, idx) => {
      const row = createElement('div', 'pkc-revision-row');
      row.setAttribute('data-pkc-revision-id', rev.id);
      row.setAttribute('data-pkc-revision-index', String(idx + 1));

      const headLine = createElement('div', 'pkc-revision-row-head');
      const ts = createElement('span', 'pkc-revision-row-ts');
      ts.textContent = formatTimestamp(rev.created_at);
      headLine.appendChild(ts);

      const parsed = parseRevisionSnapshot(rev);
      if (parsed) {
        const arch = createElement('span', 'pkc-revision-row-archetype');
        arch.textContent = archetypeLabel(parsed.archetype);
        headLine.appendChild(arch);
      }

      const hash = createElement('span', 'pkc-revision-row-hash');
      hash.textContent = rev.content_hash ? rev.content_hash.slice(0, 8) : '—';
      headLine.appendChild(hash);

      row.appendChild(headLine);

      if (canEdit) {
        const actions = createElement('div', 'pkc-revision-row-actions');

        const restoreBtn = createElement('button', 'pkc-btn-small');
        restoreBtn.setAttribute('data-pkc-action', 'restore-entry');
        restoreBtn.setAttribute('data-pkc-lid', entry.lid);
        restoreBtn.setAttribute('data-pkc-revision-id', rev.id);
        restoreBtn.setAttribute('title', 'Restore this revision in place');
        restoreBtn.textContent = 'Restore';
        actions.appendChild(restoreBtn);

        const branchBtn = createElement('button', 'pkc-btn-small');
        branchBtn.setAttribute('data-pkc-action', 'branch-restore-revision');
        branchBtn.setAttribute('data-pkc-lid', entry.lid);
        branchBtn.setAttribute('data-pkc-revision-id', rev.id);
        branchBtn.setAttribute('title', 'Create a new entry from this revision');
        branchBtn.textContent = 'Restore as branch';
        actions.appendChild(branchBtn);

        row.appendChild(actions);
      }

      // pgc-181 wave-α' #4(v3 統合 master G6、handoff §3.5):「Show diff
      // vs current」 inline diff viewer。`shell.revision_diff_viewer_enabled`
      // ON + parseRevisionSnapshot success + 現 entry.body との差分計算
      // (features/diff/line-diff の pure function を再利用)。
      // `<details>` で lazy には開かない構造(初回 render 時に diff も作る)
      // が、`diffRows` の LCS_LINE_BUDGET safety net(6000 行超で degraded)
      // で大規模 entry にも対応。
      if (parsed && shellRevisionDiffViewerEnabled()) {
        const diff = renderRevisionDiff(parsed.body ?? '', entry.body ?? '');
        if (diff) row.appendChild(diff);
      }

      picker.appendChild(row);
    });

    meta.appendChild(picker);
  }

  // PR-V6 + PR-V14(2026-05-14、U7 branch tree 視覚化):derived-branches。
  // provenance を逆引きして「この entry から派生した branches」を **多階層
  // tree** として render。元 entry → branch → 孫 branch まで再帰展開、
  // 「ある版から派生してさらに派生した」系譜が一目で見える。
  //
  // PR-V6 では flat list だったが、user 宣言「branch tree 視覚化」に対する
  // 不足だったため PR-V14 で nested 構造に拡張。
  //
  // revisions セクションの外に置く:branches は元 entry の revision が
  // compact / consolidate されて 0 件になった後も(provenance metadata に
  // source_revision_id が記録されているため)表示し続けるべき。
  interface BranchNode {
    lid: string;
    title: string;
    branchedAt?: string;
    sourceRevisionId?: string;
    children: BranchNode[];
  }
  const collectChildren = (parentLid: string, seen: Set<string>): BranchNode[] => {
    const out: BranchNode[] = [];
    for (const rel of container.relations) {
      if (rel.kind !== 'provenance') continue;
      if (rel.to !== parentLid) continue;
      const md = rel.metadata as Record<string, unknown> | undefined;
      if (!md) continue;
      const branchSource = md.branch_source ?? md.conversion_kind;
      if (branchSource !== 'revision' && branchSource !== 'revision-branch') continue;
      const branchEntry = container.entries.find((e) => e.lid === rel.from);
      if (!branchEntry) continue;
      if (seen.has(branchEntry.lid)) continue; // cycle 防御
      const childSeen = new Set(seen);
      childSeen.add(branchEntry.lid);
      out.push({
        lid: branchEntry.lid,
        title: branchEntry.title || '(untitled)',
        branchedAt: typeof md.branched_at === 'string'
          ? md.branched_at
          : typeof md.converted_at === 'string'
            ? md.converted_at
            : undefined,
        sourceRevisionId: typeof md.source_revision_id === 'string'
          ? md.source_revision_id
          : undefined,
        children: collectChildren(branchEntry.lid, childSeen),
      });
    }
    return out;
  };
  const tree = collectChildren(entry.lid, new Set([entry.lid]));
  const countNodes = (nodes: BranchNode[]): number => {
    let n = 0;
    for (const node of nodes) n += 1 + countNodes(node.children);
    return n;
  };
  const renderBranchRow = (b: BranchNode, depth: number): HTMLElement => {
    const row = createElement('div', 'pkc-derived-branch-row');
    row.setAttribute('data-pkc-branch-lid', b.lid);
    row.setAttribute('data-pkc-branch-depth', String(depth));
    // tree guide marker:depth ごとに「└──」style indent
    if (depth > 0) {
      const guide = createElement('span', 'pkc-derived-branch-guide');
      guide.setAttribute('aria-hidden', 'true');
      guide.textContent = '└── ';
      row.appendChild(guide);
    }
    const link = createElement('button', 'pkc-derived-branch-link');
    link.setAttribute('type', 'button');
    link.setAttribute('data-pkc-action', 'select-entry');
    link.setAttribute('data-pkc-lid', b.lid);
    link.textContent = b.title;
    link.setAttribute('title', `Jump to ${b.title}`);
    row.appendChild(link);
    if (b.branchedAt) {
      const ts = createElement('span', 'pkc-derived-branch-ts');
      ts.textContent = formatTimestamp(b.branchedAt);
      row.appendChild(ts);
    }
    if (b.sourceRevisionId) {
      const rid = createElement('span', 'pkc-derived-branch-source-rev');
      rid.textContent = '@ ' + b.sourceRevisionId.slice(0, 8);
      rid.setAttribute('title', `Source revision: ${b.sourceRevisionId}`);
      row.appendChild(rid);
    }
    return row;
  };
  const renderBranchSubtree = (
    nodes: BranchNode[],
    parent: HTMLElement,
    depth: number,
  ): void => {
    for (const b of nodes) {
      parent.appendChild(renderBranchRow(b, depth));
      if (b.children.length > 0) {
        const wrapper = createElement('div', 'pkc-derived-branch-children');
        wrapper.setAttribute('data-pkc-branch-parent-lid', b.lid);
        renderBranchSubtree(b.children, wrapper, depth + 1);
        parent.appendChild(wrapper);
      }
    }
  };
  if (tree.length > 0) {
    const total = countNodes(tree);
    const branches = createElement('details', 'pkc-derived-branches');
    branches.setAttribute('data-pkc-region', 'derived-branches');
    branches.setAttribute('open', '');
    const bsum = createElement('summary', 'pkc-derived-branches-summary');
    bsum.textContent = `Derived branches (${total})`;
    branches.appendChild(bsum);
    renderBranchSubtree(tree, branches, 0);
    meta.appendChild(branches);
  }
  endProfHistory();

  // Unified References umbrella (v1, Option E) — groups the two distinct
  // reference systems under one heading so the meta pane stops having
  // two separate "Backlinks (N)" sub-headings in unrelated places:
  //   sub-panel 1: first-class relations (structural / semantic / ...)
  //   sub-panel 2: link-index (markdown reference) outgoing / backlinks / broken
  // Existing data-pkc-region ids of each sub-panel are preserved so per-
  // panel tests, the sidebar badge scroll target, and the delete flow
  // continue to work. See docs/development/unified-backlinks-v1.md.
  // pgc-216:relations resolution + Outgoing / Backlinks group build を
  // 1 sub-profile で計測(container.relations 全 walk + lid 解決 + 2 group
  // 描画、container 内 relation 数に比例)。
  const endProfRelations = profileStart('meta:relations');
  const directed = getRelationsForEntry(container.relations, entry.lid);
  const resolved = resolveRelations(directed, container.entries);
  const outbound = resolved.filter((r) => r.direction === 'outbound');
  const inbound = resolved.filter((r) => r.direction === 'inbound');

  const relSection = createElement('div', 'pkc-relations');
  relSection.setAttribute('data-pkc-region', 'relations');
  relSection.appendChild(renderRelationGroup('関連', 'outgoing', outbound, canEdit));
  relSection.appendChild(renderRelationGroup('被参照', 'backlinks', inbound, canEdit));
  endProfRelations();

  // PR-δ: reuse LinkIndex computed at `renderShell` level (spec §5.7)
  // so the sidebar connectedness pass and the References sub-panels
  // share the same per-render result. Fallback keeps this function
  // callable in isolation (tests / future call sites).
  // pgc-215:linkIndex build を sub-profile で計測(meta pane 20ms
  // のうち linkIndex 自体が何 ms か切り分け)。
  const endProfLinkIndex = profileStart('meta:linkIndex');
  const linkIndex = sharedLinkIndex ?? buildLinkIndex(container);
  endProfLinkIndex();

  const referencesSection = createElement('section', 'pkc-references');
  referencesSection.setAttribute('data-pkc-region', 'references');

  const referencesHeading = createElement('div', 'pkc-references-heading');
  referencesHeading.textContent = '参照と関連';
  referencesSection.appendChild(referencesHeading);

  // References summary row (v2, 2026-04-20). Lightweight count line
  // directly under the umbrella heading. Purely informational — no
  // click behavior, no semantic merge. Labels stay distinct so the
  // relations-based and markdown-reference systems remain visually
  // separate. See docs/development/references-summary-row-v2.md.
  const liOutgoing = linkIndex.outgoingBySource.get(entry.lid) ?? [];
  const liBacklinks = linkIndex.backlinksByTarget.get(entry.lid) ?? [];
  const liBroken = liOutgoing.filter((r) => !r.resolved);
  const relationsCount = outbound.length + inbound.length;
  const markdownRefsCount = liOutgoing.length + liBacklinks.length;
  const brokenCount = liBroken.length;
  referencesSection.appendChild(
    renderReferencesSummary(relationsCount, markdownRefsCount, brokenCount),
  );

  referencesSection.appendChild(relSection);
  // pgc-215:renderLinkIndexSections は backlinks-by-target walk + section
  // build で linkIndex の dispose-heavy 部分(References sub-panel 内の
  // entry refs / asset refs / external links 等)を含む。
  const endProfLinkSections = profileStart('meta:renderLinkIndexSections');
  referencesSection.appendChild(renderLinkIndexSections(entry, linkIndex, container));
  endProfLinkSections();

  meta.appendChild(referencesSection);

  // pgc-216 v2:`renderRelationCreateForm` は <select> 内に全 user entries
  // を <option> として展開する(L9966-9973、N entries で N option DOM 操作)。
  // 100 entries で ~5ms、1000 entries で ~50ms、5000 entries で ~250ms の
  // 線形 cost。本 sub-profile で実測値を計測、後続 PR で datalist 化や lazy
  // popup での attack target にする。
  if (canEdit && container.entries.length > 1) {
    const endProfRelCreate = profileStart('meta:relation-create-form');
    // pgc-237:userEntries は filter-cache で memoize 済 ── O(N) walk skip。
    meta.appendChild(renderRelationCreateForm(entry.lid, getFilterIndexes(container).userEntries));
    endProfRelCreate();
  }

  // Sandbox control section for HTML attachments
  if (entry.archetype === 'attachment') {
    const att = parseAttachmentBody(entry.body, entry);
    if (isHtml(att.mime) || isSvg(att.mime)) {
      const sandboxSection = createElement('div', 'pkc-sandbox-control');
      sandboxSection.setAttribute('data-pkc-region', 'sandbox-control');
      sandboxSection.setAttribute('data-pkc-lid', entry.lid);

      const heading = createElement('div', 'pkc-sandbox-heading');
      heading.textContent = 'Sandbox Policy';
      sandboxSection.appendChild(heading);

      // Container default policy control
      const defaultRow = createElement('div', 'pkc-sandbox-default-row');
      const defaultLabel = createElement('label', 'pkc-sandbox-default-label');
      defaultLabel.textContent = 'Container Default:';
      defaultRow.appendChild(defaultLabel);
      const policySelect = document.createElement('select');
      policySelect.className = 'pkc-sandbox-policy-select';
      policySelect.setAttribute('data-pkc-action', 'set-sandbox-policy');
      if (!canEdit) policySelect.disabled = true;
      const currentPolicy = container?.meta.sandbox_policy ?? 'strict';
      for (const opt of ['strict', 'relaxed'] as const) {
        const option = document.createElement('option');
        option.value = opt;
        option.textContent = opt;
        if (opt === currentPolicy) option.selected = true;
        policySelect.appendChild(option);
      }
      defaultRow.appendChild(policySelect);
      sandboxSection.appendChild(defaultRow);

      const currentAllow = att.sandbox_allow ?? [];

      for (const attr of SANDBOX_ATTRIBUTES) {
        const row = createElement('label', 'pkc-sandbox-row');

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'pkc-sandbox-checkbox';
        checkbox.setAttribute('data-pkc-action', 'toggle-sandbox-attr');
        checkbox.setAttribute('data-pkc-lid', entry.lid);
        checkbox.setAttribute('data-pkc-sandbox-attr', attr);
        checkbox.checked = currentAllow.includes(attr);
        if (!canEdit) checkbox.disabled = true;
        row.appendChild(checkbox);

        const labelWrap = createElement('span', 'pkc-sandbox-label-wrap');
        const label = createElement('span', 'pkc-sandbox-label');
        label.textContent = attr;
        labelWrap.appendChild(label);
        const desc = createElement('span', 'pkc-sandbox-desc');
        desc.textContent = SANDBOX_DESCRIPTIONS[attr as keyof typeof SANDBOX_DESCRIPTIONS] ?? '';
        labelWrap.appendChild(desc);
        row.appendChild(labelWrap);

        sandboxSection.appendChild(row);
      }

      meta.appendChild(sandboxSection);
    }
  }

  // Phase γ-B3:flag ON で mode に応じて section 表示を絞る。
  if (metaPaneModeTabsEnabled()) {
    meta.setAttribute('data-pkc-meta-pane-mode', metaPaneMode);
    applyMetaPaneModeFilter(meta, metaPaneMode);
  }


  return meta;
}

function renderReferencesSummary(
  relationsCount: number,
  markdownRefsCount: number,
  brokenCount: number,
): HTMLElement {
  const row = createElement('div', 'pkc-references-summary');
  row.setAttribute('data-pkc-region', 'references-summary');
  row.setAttribute(
    'aria-label',
    `References summary: ${relationsCount} relations, ${markdownRefsCount} markdown references, ${brokenCount} broken`,
  );

  // v3: each summary item is a <button> so keyboard activation works
  // natively. Click / Enter / Space all fire via action-binder's
  // `jump-to-references-section` handler, which scrollIntoView-s the
  // target sub-panel region. Semantics stay navigation-only — no
  // filtering, no semantic merge. See
  // docs/development/references-summary-clickable-v3.md.
  const items: {
    key: string;
    label: string;
    count: number;
    target: string;
    broken?: boolean;
  }[] = [
    { key: 'relations',     label: '関連',       count: relationsCount,     target: 'relations' },
    { key: 'markdown-refs', label: '本文リンク', count: markdownRefsCount,  target: 'link-index' },
    { key: 'broken',        label: '欠損',       count: brokenCount,        target: 'link-index-broken', broken: true },
  ];

  items.forEach((item, i) => {
    if (i > 0) {
      const sep = createElement('span', 'pkc-references-summary-sep');
      sep.setAttribute('aria-hidden', 'true');
      sep.textContent = '·';
      row.appendChild(sep);
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pkc-references-summary-item';
    btn.setAttribute('data-pkc-summary-key', item.key);
    btn.setAttribute('data-pkc-action', 'jump-to-references-section');
    btn.setAttribute('data-pkc-summary-target', item.target);
    btn.setAttribute(
      'title',
      `Jump to ${item.label.toLowerCase()} section (${item.count})`,
    );
    btn.setAttribute(
      'aria-label',
      `Jump to ${item.label.toLowerCase()} section, ${item.count} item${item.count === 1 ? '' : 's'}`,
    );
    if (item.broken && item.count > 0) btn.setAttribute('data-pkc-broken', 'true');
    btn.textContent = `${item.label}: ${item.count}`;
    row.appendChild(btn);
  });

  return row;
}

function renderLinkIndexSections(
  entry: Entry,
  linkIndex: LinkIndex,
  container: Container,
): HTMLElement {
  const wrap = createElement('div', 'pkc-link-index');
  wrap.setAttribute('data-pkc-region', 'link-index');

  const outgoing = linkIndex.outgoingBySource.get(entry.lid) ?? [];
  const backlinks = linkIndex.backlinksByTarget.get(entry.lid) ?? [];
  const brokenForEntry = outgoing.filter((r) => !r.resolved);

  // pgc-228:titleByLid Map は container.entries の O(N) walk で、
  // c-5000 で ~1ms 累積。refs が全 0 のとき(typical case ── 大半の
  // entry は外部 link を持たない)この walk は完全に無駄。
  // **lazy build**:全 refs が空なら Map 自体を作らず、empty Map で
  // pass(各 renderLinkRefsSection 内で refs.length === 0 short-circuit)。
  const totalRefs = outgoing.length + backlinks.length + brokenForEntry.length;
  const titleByLid = new Map<string, string>();
  if (totalRefs > 0) {
    for (const e of container.entries) titleByLid.set(e.lid, e.title);
  }

  wrap.appendChild(
    renderLinkRefsSection('本文リンク', 'link-index-outgoing', outgoing, titleByLid, 'target'),
  );
  wrap.appendChild(
    renderLinkRefsSection('被参照', 'link-index-backlinks', backlinks, titleByLid, 'source'),
  );
  wrap.appendChild(
    renderLinkRefsSection('欠損リンク', 'link-index-broken', brokenForEntry, titleByLid, 'target'),
  );

  return wrap;
}

function renderLinkRefsSection(
  label: string,
  regionId: string,
  refs: readonly LinkRef[],
  titleByLid: ReadonlyMap<string, string>,
  peer: 'source' | 'target',
): HTMLElement {
  const section = createElement('div', 'pkc-link-index-section');
  section.setAttribute('data-pkc-region', regionId);

  // pgc-112 wave-γ #13(MASTER.md §6.3):References の 2 系統 Backlinks
  // を視覚区別。flag ON 時に "(markdown)" 接尾辞 + tooltip。OFF で従来。
  const clarify = shellMetaPaneReferencesClarifyEnabled();
  const heading = createElement('div', 'pkc-link-index-heading');
  if (clarify) {
    heading.textContent = `${label} (${refs.length}) — markdown`;
    heading.setAttribute(
      'title',
      'Markdown 本文内の `[text](lid:foo)` / `[[lid:foo]]` 形式の link から計算される references。Container の first-class relations とは別 system です。',
    );
  } else {
    heading.textContent = `${label} (${refs.length})`;
  }
  section.appendChild(heading);

  if (refs.length === 0) {
    const empty = createElement('div', 'pkc-link-index-empty');
    empty.textContent =
      regionId === 'link-index-outgoing'
        ? '本文リンクはありません。'
        : regionId === 'link-index-backlinks'
        ? '被参照はありません。'
        : '欠損リンクはありません。';
    section.appendChild(empty);
    return section;
  }

  const list = createElement('ul', 'pkc-link-index-list');
  for (const ref of refs) {
    const lid = peer === 'source' ? ref.sourceLid : ref.targetLid;
    const item = createElement('li', 'pkc-link-index-item');
    item.setAttribute('data-pkc-lid', lid);
    if (!ref.resolved) item.setAttribute('data-pkc-broken', 'true');

    const link = createElement('span', 'pkc-link-index-peer');
    if (ref.resolved) {
      link.setAttribute('data-pkc-action', 'select-entry');
      link.setAttribute('data-pkc-lid', lid);
      link.textContent = titleByLid.get(lid) || lid;
    } else {
      link.textContent = lid;
    }
    item.appendChild(link);

    list.appendChild(item);
  }
  section.appendChild(list);
  return section;
}

/**
 * Right-pane Table of Contents for TEXT / TEXTLOG entries.
 *
 * Returns `null` when the entry has no navigable structure (no
 * headings for TEXT, no logs for TEXTLOG) so the caller can skip
 * appending the section (spec §4: TOC 0 件時は非表示).
 *
 * TEXT produces a flat list of heading nodes (unchanged contract).
 * TEXTLOG produces a linearized day → log → heading tree built by
 * `extractTocFromEntry` on top of `buildTextlogDoc` — see
 * `docs/development/textlog-viewer-and-linkability-redesign.md` §5.
 *
 * Per-item data attributes:
 * - `data-pkc-toc-kind`   — `heading` | `day` | `log`, drives styling
 * - `data-pkc-toc-level`  — visual depth (1-based; TEXT uses 1..3,
 *                            TEXTLOG uses 1=day, 2=log, 3..5=heading)
 * - `data-pkc-toc-target-id` — DOM id to scroll to (day / log nodes)
 * - `data-pkc-toc-slug`      — slug of the heading (heading nodes)
 * - `data-pkc-log-id`        — owning article for headings / logs
 */
// pgc-181 wave-α' #4(v3 統合 master G6、handoff §3.5):revision diff
// viewer 本体。revision の body と現 entry.body を line-level diff し、
// `<details>` で折りたためる inline 表示を返す。両 body が完全一致なら
// `null`(visual noise 回避)。features/diff/line-diff の DiffRow[] を
// op 別に CSS 分岐して render。
function renderRevisionDiff(revBody: string, currentBody: string): HTMLElement | null {
  const rows = diffRows(revBody, currentBody);
  // 全 row が 'same' なら diff 無し(rev = current)、UI noise 回避で
  // 非描画。
  const hasChange = rows.some((r) => r.op !== 'same');
  if (!hasChange) return null;
  const wrap = createElement('details', 'pkc-revision-diff');
  wrap.setAttribute('data-pkc-region', 'revision-diff');
  const summary = createElement('summary', 'pkc-revision-diff-summary');
  const addCount = rows.filter((r) => r.op === 'add').length;
  const delCount = rows.filter((r) => r.op === 'del').length;
  summary.textContent = `Show diff vs current(+${addCount} / −${delCount})`;
  wrap.appendChild(summary);
  const body = createElement('div', 'pkc-revision-diff-body');
  for (const r of rows) {
    const line = createElement('div', 'pkc-revision-diff-row');
    line.setAttribute('data-pkc-diff-op', r.op);
    const marker = createElement('span', 'pkc-revision-diff-marker');
    marker.textContent = r.op === 'add' ? '+' : r.op === 'del' ? '−' : ' ';
    line.appendChild(marker);
    const text = createElement('span', 'pkc-revision-diff-text');
    // add は new(right)、del は old(left)、same は left/right どちらも同
    text.textContent = r.op === 'add' ? (r.right ?? '') : (r.left ?? '');
    line.appendChild(text);
    body.appendChild(line);
  }
  wrap.appendChild(body);
  return wrap;
}

function renderFrontmatterSection(
  entry: Entry,
  canEdit: boolean,
): HTMLElement | null {
  // Only TEXT bodies are markdown-rendered; other archetypes either
  // serialize body as JSON / CSV / opaque blob, where a leading
  // `---` is not a frontmatter fence.
  if (entry.archetype !== 'text') return null;
  const { meta, found, warnings } = parseFrontmatter(entry.body ?? '');
  if (!found) return null;
  const keys = Object.keys(meta);
  // warnings があれば key 0 でも section を出す(silent fail 禁止)。
  if (keys.length === 0 && warnings.length === 0) return null;

  const section = createElement('section', 'pkc-frontmatter');
  section.setAttribute('data-pkc-region', 'frontmatter');

  const heading = createElement('div', 'pkc-frontmatter-heading');
  heading.textContent = 'プロパティ';
  section.appendChild(heading);

  // Phase γ-B1:parseFrontmatter の warnings(size cap 超過等)を可視化。
  if (warnings.length > 0) {
    section.appendChild(renderFrontmatterWarnings(warnings));
  }

  // Phase γ-B1:flag ON + 編集可能なら graphical editor、それ以外は従来の
  // read-only 表示。size cap 超過時は meta が空になり得るのでその場合は省略。
  if (keys.length > 0) {
    if (metaPaneYamlGraphicalEnabled() && canEdit) {
      section.appendChild(renderFrontmatterEditor(entry, meta, keys));
    } else {
      section.appendChild(renderFrontmatterReadonly(meta, keys));
    }
  }
  return section;
}

// parseFrontmatter の warnings を赤バーで可視化する(silent fail 禁止、
// spec §3.3 / reform-2026-05 §07.3)。
function renderFrontmatterWarnings(
  warnings: ReadonlyArray<{ kind: string; detail: string }>,
): HTMLElement {
  const bar = createElement('div', 'pkc-frontmatter-warning');
  bar.setAttribute('data-pkc-region', 'frontmatter-warning');
  bar.setAttribute('role', 'alert');
  for (const w of warnings) {
    const item = createElement('div', 'pkc-frontmatter-warning-item');
    item.setAttribute('data-pkc-warning-kind', w.kind);
    item.textContent = `⚠ ${w.detail}`;
    bar.appendChild(item);
  }
  return bar;
}

// 従来の read-only `<dl>` 表示。
function renderFrontmatterReadonly(
  meta: Record<string, unknown>,
  keys: string[],
): HTMLElement {
  const dl = document.createElement('dl');
  dl.className = 'pkc-frontmatter-list';
  for (const key of keys) {
    const dt = document.createElement('dt');
    dt.className = 'pkc-frontmatter-key';
    dt.textContent = key;
    dl.appendChild(dt);
    const dd = document.createElement('dd');
    dd.className = 'pkc-frontmatter-value';
    dd.setAttribute('data-pkc-frontmatter-key', key);
    // URL fields render as <a> with optional fragment label.
    // Phase 3c-C: parseFragment surfaces locator labels (p. 245 /
    // 2:13 / 第28話) inline so the meta pane stays a useful overview.
    if (key === 'url' && typeof meta[key] === 'string') {
      const url = String(meta[key]);
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.className = 'pkc-frontmatter-url';
      link.textContent = url;
      dd.appendChild(link);
      const fragment = parseFragment(url);
      if (fragment?.label) {
        const badge = createElement('span', 'pkc-frontmatter-fragment-badge');
        badge.setAttribute('data-pkc-fragment-kind', fragment.locator_kind);
        badge.textContent = fragment.label;
        dd.appendChild(document.createTextNode(' '));
        dd.appendChild(badge);
      }
    } else {
      dd.textContent = formatFrontmatterValue(meta[key]);
    }
    dl.appendChild(dd);
  }
  return dl;
}

// strict enum を持つ frontmatter key(spec §3.1、document-globals.ts の
// VALID_* と整合)。これらは `<select>` で編集する。`kind` は parser が値を
// 検証しない free string のため select 化しない(text input のまま)。
const FRONTMATTER_ENUMS: Readonly<Record<string, readonly string[]>> = {
  writing: ['horizontal', 'vertical'],
  align: ['left', 'right', 'center', 'top', 'bottom'],
  layout: [
    'a4-1col',
    'a4-2col',
    'a4-3col',
    'b5-1col',
    'b5-2col',
    'letter-1col',
    'letter-2col',
  ],
};

// 1 つの frontmatter key の編集 control を生成する。enum key は <select>、
// それ以外は text <input>。現在値が enum 外でも option として残し値を失わない。
function renderFrontmatterControl(
  key: string,
  value: unknown,
  lid: string,
): HTMLElement {
  const current = frontmatterInputValue(value);
  const enumValues = FRONTMATTER_ENUMS[key];
  if (enumValues) {
    const select = document.createElement('select');
    select.className = 'pkc-frontmatter-edit-input';
    select.setAttribute('data-pkc-frontmatter-key', key);
    select.setAttribute('data-pkc-action', 'update-frontmatter-field');
    select.setAttribute('data-pkc-lid', lid);
    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = '(未設定)';
    select.appendChild(blank);
    const options =
      current === '' || enumValues.includes(current)
        ? enumValues
        : [current, ...enumValues];
    for (const v of options) {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v;
      select.appendChild(opt);
    }
    // 全 option 追加後に value を設定(個別 opt.selected 設定だと value
    // 変更時に複数 selected が残る環境差がある)。
    select.value = current;
    return select;
  }
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'pkc-frontmatter-edit-input';
  input.value = current;
  input.setAttribute('data-pkc-frontmatter-key', key);
  input.setAttribute('data-pkc-action', 'update-frontmatter-field');
  input.setAttribute('data-pkc-lid', lid);
  return input;
}

// Phase γ-B1:key ごとの編集 control を持つ graphical editor。control change を
// action-binder の `update-frontmatter-field` が拾い、setFrontmatter で
// entry.body へ書き戻す。
function renderFrontmatterEditor(
  entry: Entry,
  meta: Record<string, unknown>,
  keys: string[],
): HTMLElement {
  const form = createElement('div', 'pkc-frontmatter-editor');
  for (const key of keys) {
    const row = createElement('div', 'pkc-frontmatter-edit-row');
    const label = createElement('label', 'pkc-frontmatter-edit-label');
    label.textContent = key;
    row.appendChild(label);
    row.appendChild(renderFrontmatterControl(key, meta[key], entry.lid));
    form.appendChild(row);
  }
  return form;
}

// 編集 input に表示する値。formatFrontmatterValue は表示用に null→'—' /
// boolean→'yes' 等へ整形するため、再 parse 可能な edit 用 format を別に持つ。
function frontmatterInputValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.join(', ');
  return String(v);
}

// Re-export so callers (extensions, debug overlays) can reach the
// fragment IR without reaching into features layer directly.
export { parseFragment, buildFragmentUri };

function formatFrontmatterValue(v: unknown): string {
  if (v === null) return '—';
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map((item) => formatFrontmatterValue(item)).join(', ');
  return String(v);
}

function renderTocSection(entry: Entry): HTMLElement | null {
  if (entry.archetype !== 'text' && entry.archetype !== 'textlog') return null;
  const nodes: TocNode[] = extractTocFromEntry(entry);
  if (nodes.length === 0) return null;

  const section = createElement('div', 'pkc-toc');
  section.setAttribute('data-pkc-region', 'toc');
  // Archetype marker lets CSS scope the per-kind styling without
  // bleeding TEXTLOG's day/log chrome into TEXT.
  section.setAttribute('data-pkc-toc-archetype', entry.archetype);

  const label = createElement('span', 'pkc-toc-label');
  // 本文の見出し一覧(フォルダの中身ではない)
  label.textContent = '目次';
  section.appendChild(label);

  const list = createElement('ul', 'pkc-toc-list');
  for (const n of nodes) {
    const li = createElement('li', 'pkc-toc-item');
    li.setAttribute('data-pkc-toc-kind', n.kind);
    li.setAttribute('data-pkc-toc-level', String(n.level));

    const btn = createElement('button', 'pkc-toc-link');
    btn.setAttribute('data-pkc-action', 'toc-jump');
    if (n.kind === 'heading') {
      btn.setAttribute('data-pkc-toc-slug', n.slug);
      if (n.logId) btn.setAttribute('data-pkc-log-id', n.logId);
    } else {
      // day / log — direct DOM-id lookup by `data-pkc-toc-target-id`.
      btn.setAttribute('data-pkc-toc-target-id', n.targetId);
      if (n.kind === 'log') btn.setAttribute('data-pkc-log-id', n.logId);
    }
    btn.setAttribute('title', n.text);
    btn.textContent = n.text;
    li.appendChild(btn);
    list.appendChild(li);
  }
  section.appendChild(list);
  return section;
}

function renderRelationGroup(
  label: string,
  direction: 'outgoing' | 'backlinks',
  relations: { relation: Relation; direction: string; peer: Entry }[],
  canEdit: boolean,
): HTMLElement {
  const group = createElement('div', 'pkc-relation-group');
  group.setAttribute('data-pkc-relation-direction', direction);

  // pgc-112 wave-γ #13(MASTER.md §6.3):References の 2 系統 Backlinks
  // を視覚区別。flag ON 時に "(relation)" 接尾辞 + tooltip。OFF で従来。
  const clarify = shellMetaPaneReferencesClarifyEnabled();
  const heading = createElement('div', 'pkc-relation-heading');
  if (clarify) {
    heading.textContent = `${label} (${relations.length}) — relation`;
    heading.setAttribute(
      'title',
      'First-class relations(structural / categorical / semantic / temporal kind)。Markdown link 由来の参照とは別 system です。',
    );
  } else {
    heading.textContent = `${label} (${relations.length})`;
  }
  group.appendChild(heading);

  if (relations.length === 0) {
    const empty = createElement('div', 'pkc-relation-empty');
    empty.textContent = direction === 'backlinks' ? '被参照はありません。' : '関連はありません。';
    group.appendChild(empty);
    return group;
  }

  const list = createElement('ul', 'pkc-relation-list');
  for (const r of relations) {
    const item = createElement('li', 'pkc-relation-item');
    item.setAttribute('data-pkc-relation-id', r.relation.id);

    const link = createElement('span', 'pkc-relation-peer');
    link.setAttribute('data-pkc-action', 'select-entry');
    link.setAttribute('data-pkc-lid', r.peer.lid);
    link.textContent = r.peer.title || '(untitled)';
    item.appendChild(link);

    // v1 relation-kind inline editor: user-exposable kinds are editable
    // via a <select>; 'provenance' rows remain a read-only badge because
    // they carry origin metadata that manual edits would desynchronise.
    // Reducer-level readonly / provenance gate provides defence-in-depth.
    // See docs/development/relation-kind-edit-v1.md.
    if (canEdit && r.relation.kind !== 'provenance') {
      const kindSelect = document.createElement('select');
      kindSelect.className = 'pkc-relation-kind pkc-relation-kind-select';
      kindSelect.setAttribute('data-pkc-action', 'update-relation-kind');
      kindSelect.setAttribute('data-pkc-relation-id', r.relation.id);
      kindSelect.setAttribute('title', 'Change relation kind');
      kindSelect.setAttribute('aria-label', 'Change relation kind');
      for (const opt of RELATION_KIND_OPTIONS) {
        const el = document.createElement('option');
        el.value = opt.kind;
        el.textContent = opt.kind;
        kindSelect.appendChild(el);
      }
      kindSelect.value = r.relation.kind;
      item.appendChild(kindSelect);
    } else {
      const kindBadge = createElement('span', 'pkc-relation-kind');
      kindBadge.textContent = r.relation.kind;
      item.appendChild(kindBadge);
    }

    // v1 provenance metadata viewer — read-only, collapsed by default.
    // Only rendered for provenance relations that actually carry metadata.
    // Non-provenance rows are untouched. Viewing is context-agnostic
    // (shown even in readonly / manual contexts — no edit semantics).
    // See docs/development/provenance-metadata-viewer-v1.md.
    if (r.relation.kind === 'provenance') {
      const viewer = renderProvenanceMetadataViewer(r.relation.id, r.relation.metadata);
      if (viewer) item.appendChild(viewer);
    }

    // v1 relation delete UI: only rendered in editable contexts.
    // Reducer-level `state.readonly` gate provides defence-in-depth.
    // See docs/development/relation-delete-ui-v1.md.
    if (canEdit) {
      const deleteBtn = createElement('button', 'pkc-relation-delete');
      deleteBtn.setAttribute('data-pkc-action', 'delete-relation');
      deleteBtn.setAttribute('data-pkc-relation-id', r.relation.id);
      deleteBtn.setAttribute('title', 'Delete relation');
      deleteBtn.setAttribute('aria-label', 'Delete relation');
      deleteBtn.textContent = '×';
      item.appendChild(deleteBtn);
    }

    list.appendChild(item);
  }
  group.appendChild(list);
  return group;
}

/**
 * provenance-metadata-viewer v1 (2026-04-20) + pretty-print v1.x (2026-04-20).
 *
 * Read-only viewer for `Relation.metadata` on provenance rows. Uses a
 * native <details>/<summary> so no JS state is needed for toggle,
 * outside-click, or focus management. Returns null when metadata is
 * absent or empty — the caller skips appending in that case.
 *
 * Field ordering (v1): required two first, recommended third, then any
 * other string keys in sorted order. Values display via
 * `formatProvenanceMetadataValue` — see that helper for the per-key
 * pretty-print rules. Non-formatted values render as-is (strings are
 * the only spec-permitted value shape per
 * docs/spec/provenance-relation-profile.md §2.2).
 *
 * This viewer does NOT introduce edit controls. provenance relations
 * remain non-editable; see docs/development/provenance-metadata-viewer-v1.md.
 */

/**
 * Pretty-print a single provenance metadata value (v1.x).
 *
 * Key-scoped formatter — only canonical keys with known spec semantics
 * get reformatted. Unknown keys fall through unchanged. Raw input is
 * always returned alongside the display string so callers can preserve
 * it via `title` / aria-label for recovery (contract continues to hold
 * that canonical key/value is the source of truth).
 *
 * - `converted_at`         — ISO 8601 → locale-aware "MMM d, y, h:mm a"
 * - `source_content_hash`  — ≥12-char hex → `first8…`
 * - everything else        — unchanged (conservative; no speculative
 *                            pattern matching)
 *
 * Fallback: parse failure → return raw `{ display: raw, formatted: false }`.
 */
function formatProvenanceMetadataValue(
  key: string,
  raw: string,
): { display: string; formatted: boolean } {
  if (key === 'converted_at') {
    const ms = Date.parse(raw);
    if (!Number.isNaN(ms)) {
      try {
        const fmt = new Intl.DateTimeFormat(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short',
        });
        return { display: fmt.format(new Date(ms)), formatted: true };
      } catch {
        // Intl unavailable or options unsupported — fall through to raw.
      }
    }
    return { display: raw, formatted: false };
  }
  if (key === 'source_content_hash') {
    if (raw.length >= 12) {
      return { display: `${raw.slice(0, 8)}…`, formatted: true };
    }
    return { display: raw, formatted: false };
  }
  return { display: raw, formatted: false };
}

function renderProvenanceMetadataViewer(
  relationId: string,
  metadata: Record<string, unknown> | undefined,
): HTMLElement | null {
  if (!metadata) return null;
  const entries: [string, string][] = [];
  for (const key of Object.keys(metadata)) {
    const v = metadata[key];
    if (typeof v === 'string' && v.length > 0) entries.push([key, v]);
  }
  if (entries.length === 0) return null;

  const PRIORITY = ['conversion_kind', 'converted_at', 'source_content_hash'];
  entries.sort((a, b) => {
    const ai = PRIORITY.indexOf(a[0]);
    const bi = PRIORITY.indexOf(b[0]);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a[0].localeCompare(b[0]);
  });

  const details = document.createElement('details');
  details.className = 'pkc-provenance-metadata';
  details.setAttribute('data-pkc-region', 'provenance-metadata');

  const summary = document.createElement('summary');
  summary.className = 'pkc-provenance-metadata-summary';
  summary.setAttribute('title', 'Show provenance metadata (read-only)');
  summary.setAttribute('aria-label', 'Show provenance metadata (read-only)');
  summary.textContent = 'ⓘ';
  details.appendChild(summary);

  const dl = document.createElement('dl');
  dl.className = 'pkc-provenance-metadata-list';
  for (const [key, value] of entries) {
    const dt = document.createElement('dt');
    dt.className = 'pkc-provenance-metadata-key';
    dt.textContent = key;
    dt.setAttribute('data-pkc-metadata-key', key);
    const dd = document.createElement('dd');
    dd.className = 'pkc-provenance-metadata-value';
    const { display, formatted } = formatProvenanceMetadataValue(key, value);
    dd.textContent = display;
    dd.setAttribute('data-pkc-metadata-value', key);
    if (formatted) {
      // v1.x pretty-print: display differs from canonical — expose raw
      // via `title` / `aria-label` (hover + screen reader recovery) and
      // mark the node for tests / CSS targeting. Raw canonical value
      // remains the source of truth (contract: viewer stays read-only).
      dd.setAttribute('title', value);
      dd.setAttribute('aria-label', `${key}: ${value}`);
      dd.setAttribute('data-pkc-metadata-formatted', 'true');
    }
    dl.appendChild(dt);
    dl.appendChild(dd);
  }
  details.appendChild(dl);

  // v1 provenance metadata copy/export. Single button, whole metadata
  // only, raw canonical JSON (never the pretty-printed display form).
  // action-binder reads the relation id from this button, looks the
  // relation up in state, serializes via
  // `serializeProvenanceMetadataCanonical`, and writes to clipboard.
  // See docs/development/provenance-metadata-copy-export-v1.md.
  const copyWrap = document.createElement('div');
  copyWrap.className = 'pkc-provenance-metadata-copy-row';
  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'pkc-provenance-metadata-copy';
  copyBtn.setAttribute('data-pkc-action', 'copy-provenance-metadata');
  copyBtn.setAttribute('data-pkc-relation-id', relationId);
  copyBtn.setAttribute('title', 'Copy raw canonical metadata as JSON');
  copyBtn.setAttribute('aria-label', 'Copy raw canonical provenance metadata as JSON');
  copyBtn.textContent = 'Copy raw';
  copyWrap.appendChild(copyBtn);
  details.appendChild(copyWrap);

  return details;
}

function renderRelationCreateForm(fromLid: string, entries: readonly Entry[]): HTMLElement {
  const form = createElement('div', 'pkc-relation-create');
  form.setAttribute('data-pkc-region', 'relation-create');
  form.setAttribute('data-pkc-from', fromLid);

  const heading = createElement('div', 'pkc-relation-create-heading');
  heading.textContent = '関連を追加';
  form.appendChild(heading);

  const row = createElement('div', 'pkc-relation-create-row');

  // Target entry select.
  // 2026-04-26 user audit: "プルダウンがエントリが多くなると表示
  // しきれなくなってる". Native `<select>` opens its dropdown panel
  // sized to the longest option, which can spill past the meta
  // pane on long titles. Truncate option labels (the underlying
  // `value` keeps the full lid) so the panel sits inside the
  // pane while the option still reads as the entry it points to.
  const targetSelect = document.createElement('select');
  targetSelect.setAttribute('data-pkc-field', 'relation-target');
  targetSelect.className = 'pkc-relation-select';
  // pgc-222(pgc-217 fragment + pgc-221 で identify した残 5-27ms 線形 scaling
  // への deeper attack):tag-target と同 pattern で options を lazy-populate 化。
  // render 時は placeholder のみ、user mousedown で `handleLazyTagTargetPopulate`
  // 相当の handler が options 注入。c-5000 で 27.20ms → 0ms 期待。
  targetSelect.setAttribute('data-pkc-lazy-options', 'relation-target');
  targetSelect.setAttribute('data-pkc-from-lid', fromLid);
  // available count を hint(後続 user-side search seed)。
  // entries は既に fromLid 除外前の総数なので -1 する。
  targetSelect.setAttribute('data-pkc-lazy-available-count', String(Math.max(0, entries.length - 1)));
  const defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.textContent = entries.length > 1
    ? `-- Target (${entries.length - 1} 候補、クリックで読込) --`
    : '-- Target --';
  targetSelect.appendChild(defaultOpt);
  row.appendChild(targetSelect);

  // Kind select
  const kindSelect = document.createElement('select');
  kindSelect.setAttribute('data-pkc-field', 'relation-kind');
  kindSelect.className = 'pkc-relation-select';
  for (const opt of RELATION_KIND_OPTIONS) {
    const el = document.createElement('option');
    el.value = opt.kind;
    el.textContent = opt.label;
    kindSelect.appendChild(el);
  }
  row.appendChild(kindSelect);

  // Create button
  const btn = createElement('button', 'pkc-btn');
  btn.setAttribute('data-pkc-action', 'create-relation');
  btn.setAttribute('title', 'Create a relation to the selected entry');
  btn.textContent = 'Add';
  row.appendChild(btn);

  form.appendChild(row);
  return form;
}

function renderEditor(entry: Entry, container?: Container | null): HTMLElement {
  const editor = createElement('div', 'pkc-editor');
  editor.setAttribute('data-pkc-mode', 'edit');
  editor.setAttribute('data-pkc-archetype', entry.archetype);

  const titleRow = createElement('div', 'pkc-editor-title-row');
  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.value = entry.title;
  titleInput.setAttribute('data-pkc-field', 'title');
  titleInput.className = 'pkc-editor-title';
  titleRow.appendChild(titleInput);

  const archLabel = createElement('span', 'pkc-archetype-label');
  archLabel.setAttribute('data-pkc-archetype', entry.archetype);
  archLabel.textContent = `${archetypeIcon(entry.archetype)} ${archetypeLabel(entry.archetype)}`;
  titleRow.appendChild(archLabel);
  editor.appendChild(titleRow);

  // 編集モード固定 format ribbon(Group C ワープロ化、Phase γ-C)。Tier 0
  // flag gated、text / textlog の markdown 編集時のみ。touch 端末では CSS で
  // 非表示(snippet-toolbar の floating popup を使う)。
  //
  // pgc-110 wave-γ #11(MASTER.md §6.4):flag `shell.format_panel_default_
  // hidden_enabled` ON 時は default 非表示で start、toggle button「🎨
  // Format」 click で表示。flag OFF or `shellFormatPanelDefaultHiddenEnabled
  // ()` false なら従来挙動(常時表示)。
  if (
    formatPanelEnabled() &&
    (entry.archetype === 'text' || entry.archetype === 'textlog')
  ) {
    if (shellFormatPanelDefaultHiddenEnabled()) {
      const wrap = createElement('div', 'pkc-format-panel-wrap');
      wrap.setAttribute('data-pkc-region', 'format-panel-wrap');
      wrap.appendChild(buildFormatPanelToggleButton());
      if (isFormatPanelVisible()) {
        wrap.appendChild(renderFormatPanel(entry.archetype));
      }
      editor.appendChild(wrap);
    } else {
      editor.appendChild(renderFormatPanel(entry.archetype));
    }
  }

  // Archetype-dispatched editor body
  const presenter = getPresenter(entry.archetype);
  const editorBody = presenter.renderEditorBody(entry);
  editor.appendChild(editorBody);

  // pgc-125 wave-δ #1(MASTER.md §7 text):flag ON + text/textlog 編集時
  // に editor 末尾へ compact wordcount footer を append。Inspector Style
  // tab(pgc-118)とは別 surface ── editor 内で目線移動最小の metrics。
  if (
    shellEditorFooterWordcountEnabled() &&
    (entry.archetype === 'text' || entry.archetype === 'textlog')
  ) {
    editor.appendChild(buildEditorFooterWordcount(entry));
  }

  // Resolve asset references in the TEXT split editor's initial preview
  // so that `![alt](asset:key)` and `[label](asset:key)` render inline
  // from the moment the editor opens. Source body is never mutated.
  if (entry.archetype === 'text' && container?.assets && entry.body) {
    const preview = editorBody.querySelector<HTMLElement>('[data-pkc-region="text-edit-preview"]');
    if (preview && hasAssetReferences(entry.body)) {
      const mimeByKey = buildAssetMimeMap(container);
      const nameByKey = buildAssetNameMap(container);
      const resolved = resolveAssetReferences(entry.body, { assets: container.assets, mimeByKey, nameByKey });
      if (hasMarkdownSyntax(resolved)) {
        preview.innerHTML = renderMarkdown(resolved);
      }
    }
  }

  // Actions moved to fixed action bar (renderActionBar)
  return editor;
}

function renderImportConfirmation(
  preview: ImportPreviewRef,
  mode: 'replace' | 'merge',
  host: Container | null,
  conflicts?: EntryConflict[],
  resolutions?: Record<string, Resolution>,
): HTMLElement {
  const panel = createElement('div', 'pkc-import-confirm');
  panel.setAttribute('data-pkc-region', 'import-confirm');
  panel.setAttribute('data-pkc-import-mode', mode);

  // ── Mode radio (Tier 3-1) ──────────────────────
  // Disabled until host container exists (can't merge into nothing).
  const canMerge = host !== null;
  const schemaMismatch =
    canMerge && host!.meta.schema_version !== preview.container.meta.schema_version;

  const modeGroup = createElement('div', 'pkc-import-mode');
  modeGroup.setAttribute('data-pkc-region', 'import-mode');
  modeGroup.setAttribute('role', 'radiogroup');

  const replaceBtn = createElement('button', 'pkc-import-mode-option');
  replaceBtn.setAttribute('data-pkc-action', 'set-import-mode');
  replaceBtn.setAttribute('data-pkc-mode', 'replace');
  replaceBtn.setAttribute('role', 'radio');
  replaceBtn.setAttribute('aria-checked', mode === 'replace' ? 'true' : 'false');
  if (mode === 'replace') replaceBtn.setAttribute('data-pkc-mode-selected', 'true');
  replaceBtn.textContent = 'Replace';
  modeGroup.appendChild(replaceBtn);

  const mergeBtn = createElement('button', 'pkc-import-mode-option');
  mergeBtn.setAttribute('data-pkc-action', 'set-import-mode');
  mergeBtn.setAttribute('data-pkc-mode', 'merge');
  mergeBtn.setAttribute('role', 'radio');
  mergeBtn.setAttribute('aria-checked', mode === 'merge' ? 'true' : 'false');
  if (mode === 'merge') mergeBtn.setAttribute('data-pkc-mode-selected', 'true');
  if (!canMerge) mergeBtn.setAttribute('disabled', 'true');
  mergeBtn.textContent = 'Merge (append)';
  modeGroup.appendChild(mergeBtn);

  panel.appendChild(modeGroup);

  // ── Mode-dependent narrative + summary ─────────
  if (mode === 'merge') {
    const warning = createElement('div', 'pkc-import-warning');
    warning.setAttribute('data-pkc-region', 'import-merge-note');
    warning.textContent = schemaMismatch
      ? 'Schema version mismatch — merge is disabled. Switch to Replace or cancel.'
      : 'Imported entries will be added to the current container. Host entries stay intact.';
    panel.appendChild(warning);
  } else {
    const warning = createElement('div', 'pkc-import-warning');
    warning.textContent = 'This will fully replace your current data. This is not a merge.';
    panel.appendChild(warning);
  }

  const summary = createElement('div', 'pkc-import-summary');
  summary.setAttribute('data-pkc-region', 'import-summary');

  if (mode === 'merge' && canMerge) {
    // Merge summary: 5-line breakdown per spec §7.2.
    const nowStamp = new Date().toISOString();
    const plan = planMergeImport(host!, preview.container, nowStamp);
    if ('error' in plan) {
      const row = createElement('div', 'pkc-import-row');
      const label = createElement('span', 'pkc-import-label');
      label.textContent = 'Error:';
      const value = createElement('span', 'pkc-import-value');
      value.textContent = `schema v${host!.meta.schema_version} vs v${preview.container.meta.schema_version} — cannot merge`;
      row.appendChild(label);
      row.appendChild(value);
      summary.appendChild(row);
    } else {
      const c = plan.counts;
      const mergeItems: [string, string][] = [
        ['Source', preview.source],
        ['New entries', `+${c.addedEntries}${c.renamedLids > 0 ? ` (${c.renamedLids} renamed)` : ''}`],
        ['Assets', `+${c.addedAssets} / dedup ${c.dedupedAssets}${c.rehashedAssets > 0 ? ` / rehash ${c.rehashedAssets}` : ''}`],
        ['Relations', `+${c.addedRelations}${c.droppedRelations > 0 ? ` / drop ${c.droppedRelations}` : ''}`],
        ['Revisions', `drop ${c.droppedRevisions}`],
      ];
      for (const [label, value] of mergeItems) {
        const row = createElement('div', 'pkc-import-row');
        const labelEl = createElement('span', 'pkc-import-label');
        labelEl.textContent = `${label}:`;
        row.appendChild(labelEl);
        const valueEl = createElement('span', 'pkc-import-value');
        valueEl.textContent = value;
        row.appendChild(valueEl);
        summary.appendChild(row);
      }
    }
  } else {
    // Replace summary: classic 5-line preview.
    const items: [string, string][] = [
      ['Source', preview.source],
      ['Title', preview.title],
      ['Entries', String(preview.entry_count)],
      ['Revisions', String(preview.revision_count)],
      ['Schema', `v${preview.schema_version}`],
    ];
    for (const [label, value] of items) {
      const row = createElement('div', 'pkc-import-row');
      const labelEl = createElement('span', 'pkc-import-label');
      labelEl.textContent = `${label}:`;
      row.appendChild(labelEl);
      const valueEl = createElement('span', 'pkc-import-value');
      valueEl.textContent = value;
      row.appendChild(valueEl);
      summary.appendChild(row);
    }
  }
  panel.appendChild(summary);

  // ── Conflict UI (v1, H-10) ──────────────────────
  const hasConflicts = mode === 'merge' && conflicts && conflicts.length > 0;
  if (hasConflicts) {
    panel.appendChild(renderMergeConflictSection(conflicts!, resolutions ?? {}));
  }

  const actions = createElement('div', 'pkc-import-actions');

  const confirmBtn = createElement('button', 'pkc-btn pkc-btn-danger');
  if (mode === 'merge') {
    confirmBtn.setAttribute('data-pkc-action', 'confirm-merge-import');
    confirmBtn.textContent = 'Merge & Import';
    if (schemaMismatch) confirmBtn.setAttribute('disabled', 'true');
    if (hasConflicts && !allConflictsResolved(conflicts!, resolutions ?? {})) {
      confirmBtn.setAttribute('disabled', 'true');
    }
  } else {
    confirmBtn.setAttribute('data-pkc-action', 'confirm-import');
    confirmBtn.textContent = 'Replace & Import';
  }
  actions.appendChild(confirmBtn);

  const cancelBtn = createElement('button', 'pkc-btn');
  cancelBtn.setAttribute('data-pkc-action', 'cancel-import');
  cancelBtn.textContent = 'Cancel';
  actions.appendChild(cancelBtn);

  panel.appendChild(actions);
  return panel;
}

function allConflictsResolved(
  conflicts: EntryConflict[],
  resolutions: Record<string, Resolution>,
): boolean {
  for (const c of conflicts) {
    const r = resolutions[c.imported_lid];
    if (!r) return false;
  }
  return true;
}

function conflictKindLabel(kind: EntryConflict['kind']): string {
  switch (kind) {
    case 'content-equal': return 'C1';
    case 'title-only': return 'C2';
    case 'title-only-multi': return 'C2-multi';
  }
}

function conflictBadgeText(conflict: EntryConflict): string {
  switch (conflict.kind) {
    case 'content-equal': return '✓ content identical';
    case 'title-only': return '⚠ title matches, content differs';
    case 'title-only-multi':
      return `⚠ ${conflict.host_candidates?.length ?? 0} host candidates`;
  }
}

function shortDate(iso: string): string {
  return iso.slice(0, 16).replace('T', ' ');
}

function renderMergeConflictSection(
  conflicts: EntryConflict[],
  resolutions: Record<string, Resolution>,
): HTMLElement {
  const section = createElement('div', 'pkc-merge-conflicts');
  section.setAttribute('data-pkc-region', 'merge-conflicts');

  const heading = createElement('div', 'pkc-merge-conflicts-heading');
  const unresolvedCount = conflicts.filter((c) => !resolutions[c.imported_lid]).length;
  heading.textContent = unresolvedCount > 0
    ? `Entry conflicts: ${conflicts.length} (Resolve ${unresolvedCount} pending)`
    : `Entry conflicts: ${conflicts.length}`;
  section.appendChild(heading);

  for (const conflict of conflicts) {
    section.appendChild(renderConflictRow(conflict, resolutions[conflict.imported_lid]));
  }

  const bulkBar = createElement('div', 'pkc-merge-conflict-bulk');
  const acceptBtn = createElement('button', 'pkc-btn');
  acceptBtn.setAttribute('data-pkc-action', 'bulk-resolution');
  acceptBtn.setAttribute('data-pkc-value', 'keep-current');
  acceptBtn.textContent = 'Accept all host';
  bulkBar.appendChild(acceptBtn);

  const dupBtn = createElement('button', 'pkc-btn');
  dupBtn.setAttribute('data-pkc-action', 'bulk-resolution');
  dupBtn.setAttribute('data-pkc-value', 'duplicate-as-branch');
  dupBtn.textContent = 'Duplicate all';
  bulkBar.appendChild(dupBtn);

  section.appendChild(bulkBar);
  return section;
}

function renderConflictRow(
  conflict: EntryConflict,
  resolution: Resolution | undefined,
): HTMLElement {
  const row = createElement('div', 'pkc-merge-conflict-row');
  row.setAttribute('data-pkc-conflict-id', conflict.imported_lid);
  row.setAttribute('data-pkc-conflict-kind', conflictKindLabel(conflict.kind));

  const header = createElement('div', 'pkc-merge-conflict-header');
  const archBadge = createElement('span', 'pkc-merge-conflict-archetype');
  archBadge.textContent = conflict.archetype.toUpperCase();
  header.appendChild(archBadge);

  const title = createElement('span', 'pkc-merge-conflict-title');
  title.textContent = `"${conflict.imported_title}"`;
  header.appendChild(title);

  const kindBadge = createElement('span', 'pkc-merge-conflict-badge');
  kindBadge.textContent = conflictBadgeText(conflict);
  header.appendChild(kindBadge);
  row.appendChild(header);

  const sides = createElement('div', 'pkc-merge-conflict-sides');

  const hostSide = createElement('div', 'pkc-merge-conflict-side');
  hostSide.innerHTML = `<strong>Host</strong>: ${shortDate(conflict.host_created_at)} / ${shortDate(conflict.host_updated_at)}<br><code>${escapeHtml(conflict.host_body_preview)}</code>`;
  sides.appendChild(hostSide);

  const impSide = createElement('div', 'pkc-merge-conflict-side');
  impSide.innerHTML = `<strong>Incoming</strong>: ${shortDate(conflict.imported_created_at)} / ${shortDate(conflict.imported_updated_at)}<br><code>${escapeHtml(conflict.imported_body_preview)}</code>`;
  sides.appendChild(impSide);

  row.appendChild(sides);

  const radios = createElement('div', 'pkc-merge-conflict-radios');
  radios.setAttribute('data-pkc-field', 'conflict-resolution');
  radios.setAttribute('role', 'radiogroup');

  const options: [Resolution, string, boolean][] = [
    ['keep-current', 'Keep current', conflict.kind === 'title-only-multi'],
    ['duplicate-as-branch', 'Branch', false],
    ['skip', 'Skip', false],
  ];

  for (const [value, label, disabled] of options) {
    const btn = createElement('button', 'pkc-merge-conflict-radio');
    btn.setAttribute('data-pkc-action', 'set-conflict-resolution');
    btn.setAttribute('data-pkc-value', value);
    btn.setAttribute('data-pkc-conflict-id', conflict.imported_lid);
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-checked', resolution === value ? 'true' : 'false');
    if (resolution === value) btn.setAttribute('data-pkc-selected', 'true');
    if (disabled) btn.setAttribute('disabled', 'true');
    btn.textContent = label;
    radios.appendChild(btn);
  }

  row.appendChild(radios);
  return row;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderBatchImportPreview(info: BatchImportPreviewInfo, container: Container | null): HTMLElement {
  const panel = createElement('div', 'pkc-import-confirm');
  panel.setAttribute('data-pkc-region', 'batch-import-preview');

  const heading = createElement('div', 'pkc-import-warning');
  heading.textContent = 'Batch Import Preview — 以下の内容をインポートします（追加のみ）';
  panel.appendChild(heading);

  const summary = createElement('div', 'pkc-import-summary');
  summary.setAttribute('data-pkc-region', 'batch-import-summary');

  const items: [string, string][] = [
    ['Source', info.source],
    ['Format', info.formatLabel],
    ['Entries', `${info.totalEntries} 件 (TEXT: ${info.textCount}, TEXTLOG: ${info.textlogCount})`],
  ];

  if (info.compacted) {
    items.push(['Compacted', 'はい — 欠損アセット参照は除去済み']);
  }
  if (info.missingAssetCount > 0) {
    items.push(['Missing assets', `${info.missingAssetCount} 件`]);
  }

  for (const [label, value] of items) {
    const row = createElement('div', 'pkc-import-row');
    const labelEl = createElement('span', 'pkc-import-label');
    labelEl.textContent = `${label}:`;
    row.appendChild(labelEl);
    const valueEl = createElement('span', 'pkc-import-value');
    valueEl.textContent = value;
    row.appendChild(valueEl);
    summary.appendChild(row);
  }
  panel.appendChild(summary);

  // Target folder picker
  if (container) {
    const existingFolders = container.entries.filter((e) => e.archetype === 'folder');
    const targetRow = createElement('div', 'pkc-import-row');
    targetRow.setAttribute('data-pkc-region', 'batch-import-target-folder');
    const targetLabel = createElement('span', 'pkc-import-label');
    targetLabel.textContent = 'Destination:';
    targetRow.appendChild(targetLabel);
    const targetSelect = document.createElement('select');
    targetSelect.className = 'pkc-batch-target-folder-select';
    targetSelect.setAttribute('data-pkc-action', 'set-batch-import-target-folder');
    const rootOpt = document.createElement('option');
    rootOpt.value = '';
    rootOpt.textContent = '/ (Root)';
    targetSelect.appendChild(rootOpt);
    for (const f of existingFolders) {
      const opt = document.createElement('option');
      opt.value = f.lid;
      opt.textContent = `\u{1F4C1} ${f.title || '(untitled)'}`;
      if (info.targetFolderLid === f.lid) opt.selected = true;
      targetSelect.appendChild(opt);
    }
    targetRow.appendChild(targetSelect);
    panel.appendChild(targetRow);
  }

  // Folder-export: restore info, malformed warning, or no-metadata caveat
  if (info.isFolderExport) {
    if (info.canRestoreFolderStructure) {
      const restoreInfo = createElement('div', 'pkc-import-info');
      restoreInfo.setAttribute('data-pkc-role', 'folder-restore-info');
      restoreInfo.textContent = `フォルダ構造: ${info.folderCount} folders — 復元されます`;
      panel.appendChild(restoreInfo);
    } else if (info.malformedFolderMetadata) {
      const warning = createElement('div', 'pkc-import-warning');
      warning.setAttribute('data-pkc-role', 'folder-malformed-warning');
      warning.textContent = 'フォルダ構造に問題があります — フラットにインポートされます';
      panel.appendChild(warning);
    } else {
      const caveat = createElement('div', 'pkc-import-warning');
      caveat.setAttribute('data-pkc-role', 'folder-caveat');
      caveat.textContent = 'フォルダ構造は復元されません — エントリはフラットに追加されます';
      panel.appendChild(caveat);
    }
  }

  // Entry list with checkboxes
  if (info.entries.length > 0) {
    const entryList = createElement('div', 'pkc-batch-entry-list');
    entryList.setAttribute('data-pkc-region', 'batch-entry-list');

    const selectedSet = new Set(info.selectedIndices);

    // Toggle-all header
    const toggleAllRow = createElement('label', 'pkc-batch-entry-toggle-all');
    const toggleAllCb = document.createElement('input');
    toggleAllCb.type = 'checkbox';
    toggleAllCb.checked = selectedSet.size === info.entries.length;
    toggleAllCb.indeterminate = selectedSet.size > 0 && selectedSet.size < info.entries.length;
    toggleAllCb.setAttribute('data-pkc-action', 'toggle-all-batch-import-entries');
    toggleAllRow.appendChild(toggleAllCb);
    const toggleAllLabel = createElement('span', '');
    toggleAllLabel.textContent = `全選択 (${selectedSet.size}/${info.entries.length})`;
    toggleAllRow.appendChild(toggleAllLabel);
    entryList.appendChild(toggleAllRow);

    for (const entry of info.entries) {
      const wrapper = createElement('div', 'pkc-batch-entry-wrapper');
      wrapper.setAttribute('data-pkc-entry-index', String(entry.index));

      const row = createElement('label', 'pkc-batch-entry-row');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = selectedSet.has(entry.index);
      cb.setAttribute('data-pkc-action', 'toggle-batch-import-entry');
      cb.setAttribute('data-pkc-entry-index', String(entry.index));
      row.appendChild(cb);
      const titleSpan = createElement('span', 'pkc-batch-entry-title');
      titleSpan.textContent = entry.title || '(untitled)';
      row.appendChild(titleSpan);
      const archBadge = createElement('span', 'pkc-batch-entry-archetype');
      archBadge.textContent = entry.archetype.toUpperCase();
      row.appendChild(archBadge);
      wrapper.appendChild(row);

      // Deep preview disclosure (default collapsed)
      const hasDeepPreview = entry.bodySnippet != null || entry.logSnippets != null || entry.logEntryCount != null;
      if (hasDeepPreview) {
        const details = document.createElement('details');
        details.className = 'pkc-batch-entry-details';
        details.setAttribute('data-pkc-role', 'entry-deep-preview');
        const summaryEl = document.createElement('summary');
        summaryEl.textContent = 'Preview';
        details.appendChild(summaryEl);

        const content = createElement('div', 'pkc-batch-entry-preview');

        if (entry.archetype === 'text' && entry.bodySnippet != null) {
          const pre = createElement('pre', 'pkc-batch-snippet');
          pre.textContent = entry.bodySnippet;
          content.appendChild(pre);
        }

        if (entry.archetype === 'textlog') {
          if (entry.logEntryCount != null) {
            const countLine = createElement('div', 'pkc-batch-meta-line');
            countLine.textContent = `${entry.logEntryCount} log entries`;
            content.appendChild(countLine);
          }
          if (entry.logSnippets && entry.logSnippets.length > 0) {
            const ol = createElement('ol', 'pkc-batch-log-snippets');
            for (const snippet of entry.logSnippets) {
              const li = document.createElement('li');
              li.textContent = snippet;
              ol.appendChild(li);
            }
            content.appendChild(ol);
          }
        }

        // Metadata line: body length / asset count / missing
        const metaParts: string[] = [];
        if (entry.bodyLength != null) metaParts.push(`${entry.bodyLength} 文字`);
        if (entry.assetCount != null && entry.assetCount > 0) metaParts.push(`${entry.assetCount} assets`);
        if (entry.missingAssetCount != null && entry.missingAssetCount > 0) metaParts.push(`${entry.missingAssetCount} missing`);
        if (metaParts.length > 0) {
          const metaLine = createElement('div', 'pkc-batch-meta-line');
          metaLine.textContent = metaParts.join(' | ');
          content.appendChild(metaLine);
        }

        details.appendChild(content);
        wrapper.appendChild(details);
      }

      entryList.appendChild(wrapper);
    }
    panel.appendChild(entryList);
  }

  const actions = createElement('div', 'pkc-import-actions');

  const confirmBtn = createElement('button', 'pkc-btn pkc-btn-create') as HTMLButtonElement;
  confirmBtn.setAttribute('data-pkc-action', 'confirm-batch-import');
  confirmBtn.textContent = 'Continue';
  if (info.selectedIndices.length === 0) {
    confirmBtn.disabled = true;
  }
  actions.appendChild(confirmBtn);

  const cancelBtn = createElement('button', 'pkc-btn');
  cancelBtn.setAttribute('data-pkc-action', 'cancel-batch-import');
  cancelBtn.textContent = 'Cancel';
  actions.appendChild(cancelBtn);

  panel.appendChild(actions);
  return panel;
}

function renderBatchImportResult(summary: BatchImportResultSummary): HTMLElement {
  const banner = createElement('div', 'pkc-import-result');
  banner.setAttribute('data-pkc-region', 'batch-import-result');

  const parts: string[] = [];

  // Entry count + attachments
  let countText = `${summary.entryCount} entries`;
  if (summary.attachmentCount > 0) {
    countText += ` (${summary.attachmentCount} attachments)`;
  }
  parts.push(countText + ' imported');

  // Destination
  if (summary.actualDestination === '/ (Root)') {
    parts.push('to / (Root)');
  } else {
    parts.push(`to \u{1F4C1} ${summary.actualDestination}`);
  }

  // Restore / flat — always explicit
  if (summary.restoreStructure && summary.folderCount > 0) {
    parts.push(`\u2014 folder structure restored (${summary.folderCount} folders)`);
  } else {
    parts.push('\u2014 flat import');
  }

  // Fallback warning with intended destination
  if (summary.fallbackToRoot) {
    if (summary.intendedDestination) {
      parts.push(`\u2014 selected destination \u{1F4C1} ${summary.intendedDestination} was unavailable`);
    } else {
      parts.push('\u2014 selected destination was unavailable');
    }
  }

  const message = createElement('span', 'pkc-import-result-message');
  message.setAttribute('data-pkc-role', 'import-result-message');
  message.textContent = parts.join(' ');
  banner.appendChild(message);

  const dismissBtn = createElement('button', 'pkc-btn-small');
  dismissBtn.setAttribute('data-pkc-action', 'dismiss-batch-import-result');
  dismissBtn.textContent = '\u00D7';
  banner.appendChild(dismissBtn);

  return banner;
}

function renderPendingOffers(
  offers: PendingOffer[],
  container?: Container | null,
): HTMLElement {
  const bar = createElement('div', 'pkc-pending-offers');
  bar.setAttribute('data-pkc-region', 'pending-offers');

  const label = createElement('span', 'pkc-pending-label');
  label.textContent = `${offers.length} pending offer${offers.length > 1 ? 's' : ''}`;
  bar.appendChild(label);

  // PR-VV (2026-05-06):folder picker のための候補を 1 度だけ collect。
  // 大規模 container でも O(N)、O(N) sort 1 回。display は title 優先で
  // 並べ、空 title は lid を fallback。
  const folders: { lid: string; label: string }[] = container
    ? container.entries
        .filter((e) => e.archetype === 'folder')
        .map((e) => ({ lid: e.lid, label: e.title || '(untitled)' }))
        .sort((a, b) => a.label.localeCompare(b.label))
    : [];

  for (const offer of offers) {
    const item = createElement('div', 'pkc-pending-item');
    item.setAttribute('data-pkc-offer-id', offer.offer_id);

    const title = createElement('span', 'pkc-pending-title');
    title.textContent = offer.title || '(untitled)';
    item.appendChild(title);

    // #805: 同意ゲートの原理(§6.2「user が見たものだけが entry に入る」)
    // どおり、offer に同送された tags / color_tag を accept 前に提示する。
    // 既存のタグチップ CSS(.pkc-filer-tag-chip)を流用、新 UI mode は足さない。
    if ((offer.tags && offer.tags.length > 0) || offer.color_tag) {
      const meta = createElement('span', 'pkc-pending-tags');
      meta.setAttribute('data-pkc-region', 'pending-offer-tags');
      if (offer.color_tag) {
        const dot = createElement('span', 'pkc-pending-color-dot');
        dot.setAttribute('data-pkc-color-tag', offer.color_tag);
        dot.setAttribute('title', `color: ${offer.color_tag}`);
        dot.textContent = '●';
        meta.appendChild(dot);
      }
      for (const t of offer.tags ?? []) {
        const chip = createElement('span', 'pkc-filer-tag-chip');
        chip.textContent = t;
        meta.appendChild(chip);
      }
      item.appendChild(meta);
    }

    // PR-VV: target folder picker. 同じ `[data-pkc-offer-id]` item 内に
    // <select> を置く。action-binder が accept-offer click 時に同 item
    // 内の select を querySelector で読み、value を ACCEPT_OFFER の
    // `target_folder_lid` に渡す。空文字列 = root scope。
    if (folders.length > 0) {
      const targetSelect = document.createElement('select');
      targetSelect.className = 'pkc-pending-target';
      targetSelect.setAttribute('data-pkc-pending-target', offer.offer_id);
      targetSelect.setAttribute('title', '取り込み先フォルダ(空 = root scope)');
      const rootOpt = document.createElement('option');
      rootOpt.value = '';
      rootOpt.textContent = '📂 (root)';
      targetSelect.appendChild(rootOpt);
      for (const f of folders) {
        const opt = document.createElement('option');
        opt.value = f.lid;
        opt.textContent = `📁 ${f.label}`;
        targetSelect.appendChild(opt);
      }
      item.appendChild(targetSelect);
    }

    const acceptBtn = createElement('button', 'pkc-btn');
    acceptBtn.setAttribute('data-pkc-action', 'accept-offer');
    acceptBtn.setAttribute('data-pkc-offer-id', offer.offer_id);
    acceptBtn.setAttribute('title', 'Accept this incoming entry');
    acceptBtn.textContent = 'Accept';
    item.appendChild(acceptBtn);

    const dismissBtn = createElement('button', 'pkc-btn');
    dismissBtn.setAttribute('data-pkc-action', 'dismiss-offer');
    dismissBtn.setAttribute('data-pkc-offer-id', offer.offer_id);
    dismissBtn.setAttribute('title', 'Decline this incoming entry');
    dismissBtn.textContent = 'Dismiss';
    item.appendChild(dismissBtn);

    bar.appendChild(item);
  }

  return bar;
}

function renderArchetypeFilter(current: ReadonlySet<ArchetypeId>): HTMLElement {
  const bar = createElement('div', 'pkc-archetype-filter');
  bar.setAttribute('data-pkc-region', 'archetype-filter');

  // "All" button — active when no archetype is selected
  const allBtn = createElement('button', 'pkc-filter-btn');
  allBtn.setAttribute('data-pkc-action', 'set-archetype-filter');
  allBtn.setAttribute('data-pkc-archetype', '');
  allBtn.textContent = 'All';
  if (current.size === 0) {
    allBtn.setAttribute('data-pkc-active', 'true');
  }
  bar.appendChild(allBtn);

  // 2026-04-26 cleanup: a single flat group of archetype filter
  // chips. The previous design wrapped a 5-item secondary group
  // (todo / attachment / form / generic / opaque) behind a `▼`
  // expand toggle; once `form` / `generic` / `opaque` were dropped
  // (no UI create path), the toggle no longer pulled its weight,
  // so todo and attachment were merged into the always-visible
  // group. CSS `flex-wrap` handles narrow viewports.
  const group = createElement('div', 'pkc-filter-group');
  group.setAttribute('data-pkc-filter-group', 'primary');
  for (const archetype of ARCHETYPE_FILTER_PRIMARY) {
    const btn = createElement('button', 'pkc-filter-btn');
    btn.setAttribute('data-pkc-action', 'toggle-archetype-filter');
    btn.setAttribute('data-pkc-archetype', archetype);
    btn.textContent = archetypeLabel(archetype);
    if (current.has(archetype)) {
      btn.setAttribute('data-pkc-active', 'true');
    }
    group.appendChild(btn);
  }
  bar.appendChild(group);

  return bar;
}

/**
 * Color tag filter strip — chip-per-color quick filter UI.
 *
 * Renders a button for each palette ID that at least one entry in
 * the container currently carries. Clicking a chip dispatches
 * `TOGGLE_COLOR_TAG_FILTER` via the existing action-binder route, so
 * the same handler powers both this strip and the active-filter
 * indicator. Returns `null` when no entry has a recognised
 * `color_tag` so the sidebar stays clean for users who don't tag.
 *
 * Order follows palette order (warm → cool → neutral) for layout
 * stability regardless of insertion order.
 */
function renderColorFilterStrip(
  allEntries: readonly Entry[],
  current: ReadonlySet<string>,
  inUseOverride?: ReadonlySet<string>,
): HTMLElement | null {
  // pgc-232:caller(`renderAdvancedFiltersPanel`)が `getFilterIndexes`
  // 経由で memoized `colorTagsInUse` を渡せる。container ref で memoize
  // されているため keystroke / re-render で再計算 0。fallback として
  // 旧 inline walk を残す(test / 単体呼出 用)。
  const inUse = inUseOverride ?? (() => {
    const local = new Set<string>();
    const target = COLOR_TAG_IDS.length;
    for (const entry of allEntries) {
      if (isColorTagId(entry.color_tag)) {
        local.add(entry.color_tag);
        if (local.size === target) break;
      }
    }
    return local;
  })();
  if (inUse.size === 0) return null;

  const strip = createElement('div', 'pkc-color-filter-strip');
  strip.setAttribute('data-pkc-region', 'color-filter-strip');
  strip.setAttribute('role', 'group');
  strip.setAttribute('aria-label', 'Color filter');

  for (const id of COLOR_TAG_IDS) {
    if (!inUse.has(id)) continue;
    const btn = createElement('button', `pkc-color-filter-chip pkc-color-${id}`);
    btn.setAttribute('type', 'button');
    btn.setAttribute('data-pkc-action', 'toggle-color-tag-filter');
    btn.setAttribute('data-pkc-color', id);
    btn.setAttribute('aria-label', `Filter by color: ${id}`);
    btn.setAttribute('title', `Filter by color: ${id}`);
    if (current.has(id)) {
      btn.setAttribute('data-pkc-active', 'true');
      btn.setAttribute('aria-pressed', 'true');
    } else {
      btn.setAttribute('aria-pressed', 'false');
    }
    strip.appendChild(btn);
  }

  return strip;
}

function renderSortControls(currentKey: SortKey, currentDirection: SortDirection): HTMLElement {
  const row = createElement('div', 'pkc-sort-controls');
  row.setAttribute('data-pkc-region', 'sort-controls');
  row.setAttribute('data-pkc-sort-key', currentKey);
  row.setAttribute('data-pkc-sort-direction', currentDirection);

  const keySelect = document.createElement('select');
  keySelect.setAttribute('data-pkc-field', 'sort-key');
  keySelect.className = 'pkc-sort-select';
  for (const opt of SORT_KEY_OPTIONS) {
    const option = document.createElement('option');
    option.value = opt.key;
    option.textContent = opt.label;
    if (opt.key === currentKey) option.selected = true;
    keySelect.appendChild(option);
  }
  row.appendChild(keySelect);

  const dirSelect = document.createElement('select');
  dirSelect.setAttribute('data-pkc-field', 'sort-direction');
  dirSelect.className = 'pkc-sort-select';
  for (const [value, label] of [['asc', '↑ Asc'], ['desc', '↓ Desc']] as const) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    if (value === currentDirection) option.selected = true;
    dirSelect.appendChild(option);
  }
  row.appendChild(dirSelect);

  return row;
}

// ---- Helpers ----

function createElement(tag: string, className: string): HTMLElement {
  const el = document.createElement(tag);
  el.className = className;
  return el;
}

/**
 * Build a map of `asset_key → mime` from the container's attachment
 * entries. Used by the markdown asset resolver so that text / textlog
 * bodies can embed `![alt](asset:key)` references inline.
 *
 * Attachment entries store their metadata (name, mime, asset_key) in
 * the body JSON; the raw base64 data lives in `container.assets[key]`.
 */
export function buildAssetMimeMap(container: Container): Record<string, string> {
  const map: Record<string, string> = {};
  for (const entry of container.entries) {
    if (entry.archetype !== 'attachment') continue;
    const att = parseAttachmentBody(entry.body, entry);
    if (att.asset_key && att.mime) {
      map[att.asset_key] = att.mime;
    }
  }
  return map;
}

/**
 * Build a map of `asset_key → display name` from the container's
 * attachment entries. Used by the markdown asset resolver to label
 * non-image chips (`[label](asset:key)`) when the user omits an
 * explicit link label.
 */
export function buildAssetNameMap(container: Container): Record<string, string> {
  const map: Record<string, string> = {};
  for (const entry of container.entries) {
    if (entry.archetype !== 'attachment') continue;
    const att = parseAttachmentBody(entry.body, entry);
    if (att.asset_key && att.name) {
      map[att.asset_key] = deriveDisplayFilename(att.name, att.mime);
    }
  }
  return map;
}

function renderFolderContents(folder: Entry, container: Container): HTMLElement {
  const section = createElement('div', 'pkc-folder-contents');
  section.setAttribute('data-pkc-region', 'folder-contents');

  const heading = createElement('div', 'pkc-folder-contents-heading');
  heading.textContent = 'フォルダの内容';
  section.appendChild(heading);

  // pgc-233:旧 path は `container.entries.find` を per-child child 数回呼んで
  // O(R × N) worst case(R = structural relations、N = entries)。folder の
  // 直下 child は数件でも entries.find が N walk なので、entryByLid Map で
  // O(1) lookup に変換 ── c-5000 で folder render が dramatically 軽量化。
  const children: Entry[] = [];
  let entryByLid: Map<string, Entry> | null = null;
  for (const r of container.relations) {
    if (r.kind !== 'structural' || r.from !== folder.lid) continue;
    if (!entryByLid) {
      entryByLid = new Map(container.entries.map((e) => [e.lid, e]));
    }
    const child = entryByLid.get(r.to);
    if (child) children.push(child);
  }

  if (children.length === 0) {
    const empty = createElement('div', 'pkc-folder-contents-empty');
    empty.textContent = 'This folder is empty. Use the + buttons above to add entries here.';
    section.appendChild(empty);
  } else {
    const list = createElement('ul', 'pkc-folder-contents-list');
    for (const child of children) {
      const item = createElement('li', 'pkc-folder-contents-item');
      const link = createElement('span', 'pkc-folder-contents-link');
      link.setAttribute('data-pkc-action', 'select-entry');
      link.setAttribute('data-pkc-lid', child.lid);
      link.textContent = child.title || '(untitled)';
      item.appendChild(link);

      const badge = createElement('span', 'pkc-archetype-badge');
      badge.setAttribute('data-pkc-archetype', child.archetype);
      badge.textContent = `${archetypeIcon(child.archetype)} ${archetypeLabel(child.archetype)}`;
      item.appendChild(badge);

      list.appendChild(item);
    }
    section.appendChild(list);
  }

  return section;
}

/**
 * Resolve the folder context for creation.
 * If selected entry is a folder → create inside it.
 * If selected entry has a structural parent → create in the same folder.
 * Otherwise → no context (root level).
 */
function resolveContextFolder(state: AppState): Entry | null {
  if (!state.selectedLid || !state.container) return null;
  const selected = getFilterIndexes(state.container).entryByLid.get(state.selectedLid);
  if (!selected) return null;

  if (selected.archetype === 'folder') return selected;

  // Check if the selected entry has a structural parent (folder)
  const parent = getStructuralParent(state.container.relations, state.container.entries, state.selectedLid);
  return parent ?? null;
}

function renderAboutModuleTable(
  modules: { name: string; version: string; license: string }[],
  heading: string,
  emptyMessage: string,
): HTMLElement {
  const section = createElement('section', 'pkc-about-modules');
  section.setAttribute('data-pkc-region', `about-modules-${heading.toLowerCase().replace(/\s+/g, '-')}`);

  const headerRow = createElement('div', 'pkc-about-modules-header');
  const title = createElement('h3', 'pkc-about-section-title');
  title.textContent = heading;
  headerRow.appendChild(title);
  const count = createElement('span', 'pkc-about-modules-count');
  count.textContent = `${modules.length}`;
  headerRow.appendChild(count);
  section.appendChild(headerRow);

  if (modules.length === 0) {
    const empty = createElement('div', 'pkc-about-modules-empty');
    empty.textContent = emptyMessage;
    section.appendChild(empty);
    return section;
  }

  const table = createElement('table', 'pkc-about-table');
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  for (const h of ['Name', 'Version', 'License']) {
    const th = document.createElement('th');
    th.textContent = h;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const mod of modules) {
    const row = document.createElement('tr');
    for (const val of [mod.name, mod.version, mod.license]) {
      const td = document.createElement('td');
      td.textContent = val;
      row.appendChild(td);
    }
    tbody.appendChild(row);
  }
  table.appendChild(tbody);
  section.appendChild(table);

  return section;
}

function renderAboutView(aboutEntry: Entry | undefined): HTMLElement {
  const container = createElement('div', 'pkc-about-view');
  container.setAttribute('data-pkc-region', 'about-view');

  const payload = resolveAboutPayload(aboutEntry?.body);

  // pgc-113 wave-γ #14(MASTER.md §2 U-19、user direction「Aboutはかなり
  // 味気ない / もっと PKC-Markdown をドッグフーディング」):flag ON 時に
  // PKC-Markdown showcase section を About view の頭に prepend。dialect の
  // 主要機能(callout / mark / em-dot / ruby / footnote / table / details)
  // を視覚で示し、user に「ここでも PKC-Markdown が使える」と伝える。
  // 既存 About view(version / license 等の hand-rendered メタ)は完全維持。
  if (shellAboutPkcMarkdownShowcaseEnabled()) {
    // pgc-114 wave-γ #15:payload(version / commit / dep counts)を
    // pass して SHOWCASE_MARKDOWN 内 `{{vars.x}}` を動的展開。
    container.appendChild(buildAboutShowcaseElement(payload));
  }

  const header = createElement('header', 'pkc-about-header');
  const title = createElement('h1', 'pkc-about-title');
  title.textContent = 'PKC2';
  header.appendChild(title);

  const tagline = createElement('div', 'pkc-about-tagline');
  tagline.textContent = 'Portable Knowledge Container — Generation 2';
  header.appendChild(tagline);

  const version = createElement('div', 'pkc-about-version');
  version.textContent = `v${payload.version}`;
  header.appendChild(version);

  container.appendChild(header);

  if (payload.description) {
    const desc = createElement('p', 'pkc-about-description');
    desc.textContent = payload.description;
    container.appendChild(desc);
  }

  const traitsBox = createElement('div', 'pkc-about-traits');
  const traitSpecs: [boolean, string][] = [
    [payload.runtime.offline, 'Offline'],
    [payload.runtime.bundled, 'Bundled'],
    [!payload.runtime.externalDependencies, 'No external runtime dependencies'],
  ];
  for (const [active, label] of traitSpecs) {
    if (!active) continue;
    const chip = createElement('span', 'pkc-about-trait');
    chip.textContent = label;
    traitsBox.appendChild(chip);
  }
  container.appendChild(traitsBox);

  const i18nNote = createElement('p', 'pkc-about-i18n-note');
  i18nNote.textContent = 'i18n: Language / Timezone settings affect date formatting. Full UI string translation is not yet implemented.';
  container.appendChild(i18nNote);

  const metaTable = createElement('dl', 'pkc-about-meta');
  const metaRows: [string, Node][] = [];

  metaRows.push(['Built at', document.createTextNode(payload.build.timestamp)]);
  metaRows.push(['Commit', document.createTextNode(payload.build.commit)]);
  metaRows.push(['Builder', document.createTextNode(payload.build.builder)]);

  const licenseNode = payload.license.url
    ? (() => {
      const a = document.createElement('a');
      a.href = payload.license.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = payload.license.name;
      return a;
    })()
    : document.createTextNode(payload.license.name);
  metaRows.push(['License', licenseNode]);

  const authorNode = payload.author.url
    ? (() => {
      const a = document.createElement('a');
      a.href = payload.author.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = payload.author.name;
      return a;
    })()
    : document.createTextNode(payload.author.name);
  metaRows.push(['Author', authorNode]);

  if (payload.homepage) {
    const a = document.createElement('a');
    a.href = payload.homepage;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = payload.homepage;
    metaRows.push(['Homepage', a]);
  }

  // Flags Protocol v1 (PR-β-2): Active Flags row. Surfaces the
  // count of flags whose current value differs from default so
  // power users can confirm runtime overrides without opening the
  // inspector. The number itself is a button → opens inspector
  // (single-click discovery from About).
  {
    const { total, active } = getActiveFlagCountForAbout();
    const summary = createElement('button', 'pkc-about-flags-summary pkc-btn-link');
    summary.setAttribute('type', 'button');
    summary.setAttribute('data-pkc-action', 'open-flags-inspector');
    summary.setAttribute(
      'title',
      'Open the Flags Inspector to inspect / edit runtime configuration',
    );
    summary.textContent =
      total === 0
        ? 'No flags registered'
        : `${active} of ${total} differ from default — open inspector`;
    metaRows.push(['Active flags', summary]);
  }

  // iOS Safari hard reload(2026-05-10、user 報告対応):Add to Home Screen
  // mode のキャッシュを bypass する「最新版を取得」ボタン。`?_r=<timestamp>`
  // 付きで location.replace するだけのシンプルな実装。
  {
    const reload = createElement('button', 'pkc-about-force-reload pkc-btn-link');
    reload.setAttribute('type', 'button');
    reload.setAttribute('data-pkc-action', 'force-reload');
    reload.setAttribute(
      'title',
      'iOS Safari Home Screen mode 等のキャッシュを bypass して最新ファイルを取得',
    );
    reload.textContent = '最新版を取得(キャッシュ bypass)';
    metaRows.push(['Hard reload', reload]);
  }

  for (const [label, value] of metaRows) {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.appendChild(value);
    metaTable.appendChild(dt);
    metaTable.appendChild(dd);
  }
  container.appendChild(metaTable);

  // Release summary(v2.1.0+、additive):highlights + known
  // limitations を About に表示して、配布 HTML だけでも「この
  // バージョンで何が入っていて、何が未実装か」が分かるようにする。
  // v2.2.0+ は payload.releases (newest-first 最新 3 generations、
  // CHANGELOG パーサが populate) を優先表示。旧 export(v2.1.x まで)
  // は payload.releases が無く payload.release(単一)のみ持つので
  // backward-compat で 1 件 array に正規化。
  const releaseEntries: Array<{
    version?: string;
    highlights: string[];
    knownLimitations: string[];
    changelog?: string;
  }> =
    payload.releases && payload.releases.length > 0
      ? payload.releases
      : payload.release
        ? [payload.release]
        : [];
  for (const r of releaseEntries) {
    const releaseBlock = renderAboutRelease(r);
    if (releaseBlock) container.appendChild(releaseBlock);
  }

  container.appendChild(renderAboutCredits(
    { name: payload.author.name, role: payload.author.role, url: payload.author.url },
    payload.contributors,
  ));

  container.appendChild(renderAboutModuleTable(
    payload.dependencies,
    'Runtime Dependencies',
    'No runtime dependencies — fully self-contained.',
  ));

  container.appendChild(renderAboutModuleTable(
    payload.devDependencies,
    'Development Dependencies',
    'No development dependencies — built with fully custom tooling.',
  ));

  return container;
}

/**
 * Render the Release summary block(v2.1.0+):highlights list +
 * known-limitations list + changelog path pointer. Returns `null`
 * when the payload has no `release` (older exports / dev builds
 * between tagged versions) so the caller can skip the whole section.
 */
function renderAboutRelease(
  release: {
    version?: string;
    highlights: string[];
    knownLimitations: string[];
    changelog?: string;
  } | undefined,
): HTMLElement | null {
  if (!release) return null;
  if (release.highlights.length === 0 && release.knownLimitations.length === 0) {
    return null;
  }
  const section = createElement('section', 'pkc-about-release');
  section.setAttribute('data-pkc-region', 'about-release');
  if (release.version) {
    section.setAttribute('data-pkc-release-version', release.version);
  }

  const heading = createElement('h2', 'pkc-about-section-heading');
  // v2.2.0+ — annotate the section heading with the version so the
  // 3-generation stack is self-labelling. Falls back to the bare
  // 'Release' string for legacy exports without a version.
  heading.textContent = release.version ? `Release v${release.version}` : 'Release';
  section.appendChild(heading);

  if (release.highlights.length > 0) {
    const subHeading = createElement('h3', 'pkc-about-release-subheading');
    subHeading.textContent = 'Highlights';
    section.appendChild(subHeading);
    const ul = createElement('ul', 'pkc-about-release-list pkc-md-rendered');
    ul.setAttribute('data-pkc-region', 'about-release-highlights');
    for (const item of release.highlights) {
      const li = createElement('li', 'pkc-about-release-item');
      // 2026-05-10 (PR-2Q):About に PKC Markdown を render(本機能の披露目場)。
      // CHANGELOG 由来の string は信頼源、renderMarkdown は html:false で
      // XSS safe。renderInline で <p> wrap を避け、<li> 直下に inline 要素を置く。
      li.innerHTML = renderMarkdownInline(item);
      ul.appendChild(li);
    }
    section.appendChild(ul);
  }

  if (release.knownLimitations.length > 0) {
    const subHeading = createElement('h3', 'pkc-about-release-subheading');
    subHeading.textContent = 'Known limitations';
    section.appendChild(subHeading);
    const ul = createElement('ul', 'pkc-about-release-list pkc-md-rendered');
    ul.setAttribute('data-pkc-region', 'about-release-limitations');
    for (const item of release.knownLimitations) {
      const li = createElement('li', 'pkc-about-release-item');
      li.innerHTML = renderMarkdownInline(item);
      ul.appendChild(li);
    }
    section.appendChild(ul);
  }

  if (release.changelog) {
    const changelogNote = createElement('p', 'pkc-about-release-changelog');
    changelogNote.textContent = `Full changelog: ${release.changelog}`;
    section.appendChild(changelogNote);
  }

  return section;
}

function renderAboutCredits(
  principal: { name: string; role: string; url: string },
  contributors: { name: string; role: string; url: string }[],
): HTMLElement {
  const section = createElement('section', 'pkc-about-credits');
  section.setAttribute('data-pkc-region', 'about-credits');

  const title = createElement('h3', 'pkc-about-section-title');
  title.textContent = 'Credits';
  section.appendChild(title);

  const intro = createElement('p', 'pkc-about-credits-intro');
  intro.textContent = 'Built collaboratively by:';
  section.appendChild(intro);

  const list = createElement('ul', 'pkc-about-credits-list');

  const appendEntry = (entry: { name: string; role: string; url: string }) => {
    if (!entry.name) return;
    const li = document.createElement('li');
    li.className = 'pkc-about-credit';

    let nameNode: Node;
    if (entry.url) {
      const a = document.createElement('a');
      a.href = entry.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = entry.name;
      nameNode = a;
    } else {
      nameNode = document.createTextNode(entry.name);
    }
    const nameWrap = createElement('span', 'pkc-about-credit-name');
    nameWrap.appendChild(nameNode);
    li.appendChild(nameWrap);

    if (entry.role) {
      const sep = createElement('span', 'pkc-about-credit-sep');
      sep.textContent = ' — ';
      li.appendChild(sep);
      const role = createElement('span', 'pkc-about-credit-role');
      role.textContent = entry.role;
      li.appendChild(role);
    }

    list.appendChild(li);
  };

  appendEntry(principal);
  for (const c of contributors) appendEntry(c);
  section.appendChild(list);

  const note = createElement('p', 'pkc-about-credits-note');
  note.textContent
    = 'AI collaborators are acknowledged here as development partners. '
    + 'Under current copyright law, authorship is held solely by the human author above.';
  section.appendChild(note);

  return section;
}

function findSelectedEntry(state: AppState): Entry | null {
  if (!state.selectedLid || !state.container) return null;
  return getFilterIndexes(state.container).entryByLid.get(state.selectedLid) ?? null;
}

/**
 * Format an ISO timestamp for display.
 * Shows date and time in a compact human-readable form.
 */
// pgc-220(pgc-219 で identify した meta:startup 12ms の主因):
// `new Intl.DateTimeFormat()` は constructor が重量級(locale parse +
// options bake)。formatTimestamp が呼ばれる度に毎回新規生成していたため
// SELECT_ENTRY 1 回で 2 instance 作成 → ~数 ms のロス。
// locale + options は実質 static(navigator.language は session 中不変)
// なので、module-local cache で 1 度だけ生成する。
let cachedTimestampFormatter: Intl.DateTimeFormat | null = null;
let cachedTimestampLocale: string | null = null;

function getTimestampFormatter(): Intl.DateTimeFormat {
  const locale = (typeof navigator !== 'undefined' && navigator.language) || 'ja-JP';
  if (cachedTimestampFormatter && cachedTimestampLocale === locale) {
    return cachedTimestampFormatter;
  }
  cachedTimestampLocale = locale;
  cachedTimestampFormatter = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    // 2026-05-06 — en-US default would emit "AM/PM"。日本語 / 英語
    // 共通で 24 時間表示にして UI を簡潔にする(user 指示 G6)。
    hour12: false,
  });
  return cachedTimestampFormatter;
}

function formatTimestamp(iso: string): string {
  // 2026-05-06 user direction:「日時関連のロケール解決がされていない
  // 表示があるため、ファイラの日時もエントリごとの右ペインの日時表示
  // もロケールに合わせて表示してください」。Intl.DateTimeFormat で
  // 表示ロケールを尊重(navigator.language fallback)。
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return getTimestampFormatter().format(d);
  } catch {
    return iso;
  }
}

/**
 * Truncate a string with ellipsis if it exceeds maxLen.
 */
function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 1) + '…';
}

/**
 * Render a context menu at the given position for an entry.
 * Returns the menu element to be appended to the DOM.
 *
 * Extra context (archetype, logId, source region) unlocks extra menu
 * items beyond the default Edit / Delete / Move-to-root triplet:
 *
 * - `copy-entry-ref` is always shown — works in readonly and in
 *   every source region (sidebar, detail pane, textlog rows).
 * - `copy-asset-ref` is shown for ATTACHMENT entries.
 * - `copy-log-line-ref` is shown when a TEXTLOG row supplied its
 *   log-id through the menu origin.
 * - Mutating actions (Edit / Delete / Move to Root) are shown only
 *   when `canEdit === true`. In a readonly container or when the
 *   menu is opened from a textlog row (where the user is operating
 *   on a sub-entry, not the whole entry), mutating actions are
 *   hidden so the menu degrades gracefully.
 */
export interface ContextMenuOptions {
  archetype?: string;
  logId?: string;
  canEdit?: boolean;
  hasParent?: boolean;
  /** Available folders for "move to folder" sub-menu. */
  folders?: { lid: string; title: string }[];
  /** PR-Δ34: graph view 等から呼ばれる時に「開く」item を先頭に出す。 */
  showOpen?: boolean;
  /**
   * #806 host-push 送付導線: 紐付け済み拡張(「拡張へ送る」の宛先)。
   * isDefault = この entry の matchKey の既定送り先。
   */
  sendTargets?: { extLid: string; title: string; isDefault?: boolean }[];
  /** #806: この entry 自身が PKC-Extension の時の紐付け状態(toggle 表示用)。 */
  extensionBindState?: 'bound' | 'unbound';
}

export function renderContextMenu(
  lid: string,
  x: number,
  y: number,
  hasParentOrOptions: boolean | ContextMenuOptions = false,
): HTMLElement {
  const opts: ContextMenuOptions =
    typeof hasParentOrOptions === 'boolean'
      ? { hasParent: hasParentOrOptions, canEdit: true }
      : hasParentOrOptions;
  const canEdit = opts.canEdit !== false;
  const hasParent = !!opts.hasParent;

  const menu = createElement('div', 'pkc-context-menu');
  menu.setAttribute('data-pkc-region', 'context-menu');
  menu.setAttribute('data-pkc-lid', lid);
  if (opts.logId) menu.setAttribute('data-pkc-log-id', opts.logId);
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;

  type Item = {
    action: string;
    label: string;
    tip: string;
    lid?: string;
    logId?: string;
    show: boolean;
    /**
     * Optional visual grouping. `'markdown-source'` buckets together
     * the legacy Internal Reference copy actions(`copy-entry-ref` /
     * `copy-asset-ref` / `copy-entry-embed-ref`) so they render under
     * a separator + `Markdown source` header, visually distinct from
     * the primary `🔗 Copy link`(External Permalink)导线.
     * Phase 1 step 5 / audit G6 — we keep the legacy actions for
     * power-user / markdown-authoring workflows but demote them from
     * equal-surface standing to clearly "advanced" territory.
     *
     * `'log-data'`(PR-2JJ v2、2026-05-13):TEXTLOG log row 専用の
     * 📋 MD / PKC MD / AST / Pandoc / HTML 一群。TEXT entry の Data…
     * menu と同等を log 単位で提供。
     */
    group?: 'markdown-source' | 'log-data';
  };

  const isPreviewable = opts.archetype === 'text' || opts.archetype === 'textlog';
  const isSandboxable = opts.archetype === 'attachment';
  const hasFolders = !!(opts.folders && opts.folders.length > 0);

  const items: Item[] = [
    // PR-Δ34: graph 等で右クリックされた時のみ「Open」を先頭に表示。
    { action: 'ctx-open-detail', label: '🔍 Open', tip: 'このエントリを Detail で開く', lid, show: !!opts.showOpen },
    // Mutating actions — gated on canEdit.
    { action: 'begin-edit', label: '✏️ Edit', tip: 'このエントリを編集', lid, show: canEdit },
    // #869(B): TEXT entry の「末尾に追記」menu ショートカット。常時表示の追記
    // box(= 主要な inline 入力面)は据置き、menu から開いて textarea に focus
    // する導線だけ追加(box 撤去は inline 入力面を壊すため見送り)。
    { action: 'ctx-append-text', label: '✍ 末尾に追記', tip: '本文末尾への追記欄を開いて入力', lid, show: canEdit && opts.archetype === 'text' },
    // γ-A5-6(user 報告「別窓を開く動線が不足」):main window から
    // entry を独立ウィンドウで開く動線。全 archetype で常時表示。
    { action: 'ctx-open-window', label: '🪟 別ウィンドウで開く', tip: 'このエントリを独立した編集ウィンドウで開く', lid, show: true },
    { action: 'ctx-preview', label: '👁️ Preview', tip: 'レンダリング済みプレビューを新しいウィンドウで開く', lid, show: isPreviewable || isSandboxable },
    { action: 'ctx-sandbox-run', label: '🔒 Sandbox', tip: 'サンドボックス環境で安全に開く（HTML/SVG）', lid, show: isSandboxable },
    // #806 host-push: 紐付け(導入)= 「この拡張は送ったものを受け取れる」
    // という standing opt-in 契約(G3: 紐付け時開示は tip で行う)。
    { action: 'ctx-bind-extension', label: '🧩 拡張として紐付け', tip: '紐付けると「拡張へ送る」の宛先になり、送ったエントリ / アセットをこの拡張が受け取れるようになります', lid, show: opts.extensionBindState === 'unbound' },
    { action: 'ctx-unbind-extension', label: '🧩 紐付けを解除', tip: 'この拡張を「拡張へ送る」の宛先から外します（既定送り先設定も解除されます）', lid, show: opts.extensionBindState === 'bound' },
    { action: 'delete-entry', label: '🗑️ Delete', tip: 'このエントリを完全に削除（元に戻せません）', lid, show: canEdit },
    { action: 'delete-log-entry', label: '✕ Delete log', tip: 'このログ行を削除', lid, logId: opts.logId, show: canEdit && !!(opts.archetype === 'textlog' && opts.logId) },
    { action: 'ctx-move-to-root', label: '↑ Move to Root', tip: '現在のフォルダから取り出してルートに移動', lid, show: canEdit && hasParent },
    // Primary Copy link — External Permalink for a TEXTLOG log row.
    // Only this row uses the 🔗 Copy link label in context menu; the
    // entry-level / asset-level Copy link lives in the meta pane and
    // attachment card respectively(intentionally not duplicated here).
    {
      action: 'copy-log-line-ref',
      label: '🔗 Copy link',
      tip: 'このログ行の共有 URL をコピー（外部に貼ると該当ログに戻れます）',
      lid,
      logId: opts.logId,
      show: !!(opts.archetype === 'textlog' && opts.logId),
    },
    // Advanced: Markdown source copies(Internal Reference form).
    // Phase 1 step 5 — we keep these for markdown-authoring workflows
    // but rename them so the user does not confuse them with the
    // primary 🔗 Copy link(External Permalink). Label convention:
    // `📝 Markdown <kind>` + tip that names the exact Markdown shape.
    {
      action: 'copy-entry-ref',
      label: '📝 Markdown link',
      tip: 'PKC 内 Markdown 用のリンクをコピー: [title](entry:lid)',
      lid,
      show: true,
      group: 'markdown-source',
    },
    {
      action: 'copy-entry-embed-ref',
      label: '📝 Markdown embed',
      tip: 'PKC 内 Markdown 用の埋め込み参照をコピー: ![title](entry:lid)',
      lid,
      show: true,
      group: 'markdown-source',
    },
    {
      action: 'copy-asset-ref',
      label: '📝 Markdown asset link',
      tip: 'PKC 内 Markdown 用の添付参照をコピー: ![name](asset:key)',
      lid,
      show: opts.archetype === 'attachment',
      group: 'markdown-source',
    },
    // PR-2JJ v2(2026-05-13、PR #432 stack):TEXTLOG log row 専用の Data... 操作。
    // TEXT entry の Data… menu(action bar)と同等を log 単位で提供。
    {
      action: 'copy-log-md-gfm',
      label: '📋 MD (GFM)',
      tip: 'このログ行を GFM 標準 Markdown でコピー(相互運用用、PKC 拡張は plain に変換)',
      lid,
      logId: opts.logId,
      show: !!(opts.archetype === 'textlog' && opts.logId),
      group: 'log-data',
    },
    {
      action: 'copy-log-md-pkc',
      label: '📋 PKC MD',
      tip: 'このログ行を canonical PKC MD でコピー(AST → canonicalize → 正規記法)',
      lid,
      logId: opts.logId,
      show: !!(opts.archetype === 'textlog' && opts.logId),
      group: 'log-data',
    },
    {
      action: 'copy-log-ast',
      label: '🧬 AST',
      tip: 'このログ行を AstDocument JSON でコピー(JSONL = 1 行 compact)',
      lid,
      logId: opts.logId,
      show: !!(opts.archetype === 'textlog' && opts.logId),
      group: 'log-data',
    },
    {
      action: 'copy-log-pandoc',
      label: '🧬 Pandoc',
      tip: 'このログ行を Pandoc Native JSON でコピー(pandoc --from json で docx/pptx/pdf 変換可能)',
      lid,
      logId: opts.logId,
      show: !!(opts.archetype === 'textlog' && opts.logId),
      group: 'log-data',
    },
    {
      action: 'copy-log-html',
      label: '🧬 HTML',
      tip: 'このログ行を render 済 HTML 文字列でコピー',
      lid,
      logId: opts.logId,
      show: !!(opts.archetype === 'textlog' && opts.logId),
      group: 'log-data',
    },
  ];

  // Track whether we have already emitted each group's section
  // header so it appears exactly once, right above the first item
  // of that group.
  let emittedMarkdownSectionHeader = false;
  let emittedLogDataSectionHeader = false;
  for (const item of items) {
    if (!item.show) continue;
    if (item.group === 'markdown-source' && !emittedMarkdownSectionHeader) {
      const sep = createElement('div', 'pkc-context-menu-separator');
      menu.appendChild(sep);
      const header = createElement('div', 'pkc-context-menu-label');
      header.setAttribute('data-pkc-region', 'context-menu-markdown-source');
      header.textContent = '📝 Markdown source';
      menu.appendChild(header);
      emittedMarkdownSectionHeader = true;
    }
    if (item.group === 'log-data' && !emittedLogDataSectionHeader) {
      // PR-2JJ v2(2026-05-13):log-data section header(TEXTLOG 専用)
      const sep = createElement('div', 'pkc-context-menu-separator');
      menu.appendChild(sep);
      const header = createElement('div', 'pkc-context-menu-label');
      header.setAttribute('data-pkc-region', 'context-menu-log-data');
      header.textContent = '🧬 Log data';
      menu.appendChild(header);
      emittedLogDataSectionHeader = true;
    }
    const btn = createElement('button', 'pkc-context-menu-item');
    btn.setAttribute('data-pkc-action', item.action);
    btn.setAttribute('title', item.tip);
    if (item.lid) btn.setAttribute('data-pkc-lid', item.lid);
    if (item.logId) btn.setAttribute('data-pkc-log-id', item.logId);
    if (item.group) btn.setAttribute('data-pkc-menu-group', item.group);
    btn.textContent = item.label;
    menu.appendChild(btn);
  }

  // "Move to Folder" sub-menu — only shown when folders exist and entry is editable
  if (canEdit && hasFolders) {
    const sep = createElement('div', 'pkc-context-menu-separator');
    menu.appendChild(sep);

    const folderLabel = createElement('div', 'pkc-context-menu-label');
    folderLabel.textContent = '📁 Move to Folder';
    menu.appendChild(folderLabel);

    for (const folder of opts.folders!) {
      if (folder.lid === lid) continue; // Skip self
      const btn = createElement('button', 'pkc-context-menu-item pkc-context-menu-folder-item');
      btn.setAttribute('data-pkc-action', 'ctx-move-to-folder');
      btn.setAttribute('data-pkc-lid', lid);
      btn.setAttribute('data-pkc-folder-lid', folder.lid);
      btn.setAttribute('title', `Move into ${folder.title || '(untitled)'}`);
      btn.textContent = `  → ${folder.title || '(untitled)'}`;
      menu.appendChild(btn);
    }
  }

  // #806 host-push 送付ジェスチャ: 「拡張へ送る」 sub-menu。送るクリック
  // そのものが同意(banner なし)。既定送り先は ★ 付きで先頭、その他は
  // 「📌 既定にして送る」 row で送付と同時に既定登録できる(OS の
  // 「常にこのアプリで開く」 idiom)。readonly でも表示する(送付 = 読み
  // 方向のジェスチャで、container を変更しない)。
  if (opts.sendTargets && opts.sendTargets.length > 0) {
    const sep = createElement('div', 'pkc-context-menu-separator');
    menu.appendChild(sep);

    // #869 (C): collapse the per-extension send rows (previously 6–9
    // top-level slots) into a single "送る ▸" toggle that expands the
    // targets inline. Keeps the top-level menu short; the targets live in
    // a `hidden` group revealed on click (toggle handled in action-binder
    // so it expands instead of dismissing the menu). The send actions
    // themselves are unchanged.
    const toggle = createElement('button', 'pkc-context-menu-item pkc-context-menu-send-toggle');
    toggle.setAttribute('data-pkc-send-toggle', '1');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('title', '紐付け済み拡張のウィンドウへ送ります');
    toggle.textContent = '🧩 送る ▸';
    menu.appendChild(toggle);

    const group = createElement('div', 'pkc-context-menu-send-group');
    group.setAttribute('data-pkc-region', 'context-menu-send-group');
    group.hidden = true;

    const ordered = [...opts.sendTargets].sort(
      (a, b) => Number(!!b.isDefault) - Number(!!a.isDefault),
    );
    for (const t of ordered) {
      const btn = createElement('button', 'pkc-context-menu-item');
      btn.setAttribute('data-pkc-action', 'ctx-send-to-extension');
      btn.setAttribute('data-pkc-lid', lid);
      btn.setAttribute('data-pkc-ext-lid', t.extLid);
      btn.setAttribute(
        'title',
        t.isDefault
          ? 'この種類の既定送り先です。クリックで送ります（拡張が閉じていれば起動）'
          : 'この拡張のウィンドウへ送ります（拡張が閉じていれば起動）',
      );
      btn.textContent = t.isDefault
        ? `  ★ ${t.title || '(untitled)'}（既定）`
        : `  → ${t.title || '(untitled)'}`;
      group.appendChild(btn);
    }
    for (const t of ordered) {
      if (t.isDefault) continue;
      const btn = createElement('button', 'pkc-context-menu-item');
      btn.setAttribute('data-pkc-action', 'ctx-send-to-extension-default');
      btn.setAttribute('data-pkc-lid', lid);
      btn.setAttribute('data-pkc-ext-lid', t.extLid);
      btn.setAttribute(
        'title',
        'この種類（mime / archetype）の既定送り先として記憶してから送ります。設定はメニュー（⚙）の Extensions で取消できます',
      );
      btn.textContent = `  📌 ${t.title || '(untitled)'} を既定にして送る`;
      group.appendChild(btn);
    }
    menu.appendChild(group);
  }

  return menu;
}

// ── Persistent Drop Zone ──

/**
 * Keep a menu (or any fixed-positioned element) inside the viewport.
 *
 * Mutates `menu.style.left` / `menu.style.top` so that its bounding
 * box stays within `[margin, window.innerWidth - margin]` × `[margin,
 * window.innerHeight - margin]`. Must be called AFTER the element has
 * been appended to the DOM — `getBoundingClientRect` needs layout.
 *
 * Primary use: `renderContextMenu` opens near the cursor; clicks near
 * the right / bottom edge would otherwise render the menu partly off-
 * screen. We shift left / up by the overflow amount, but never past
 * the top-left margin.
 */
export function clampMenuToViewport(menu: HTMLElement, margin = 4): void {
  // happy-dom returns 0 for offsetWidth/Height on elements that have
  // no layout; guard against div-by-zero style bugs with a fall-back
  // to the style values. getBoundingClientRect is preferred because
  // it reflects any inline style we already set.
  const rect = menu.getBoundingClientRect();
  const vw = typeof window !== 'undefined' ? window.innerWidth : 0;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 0;
  if (vw <= 0 || vh <= 0) return;

  let nextLeft = rect.left;
  let nextTop = rect.top;

  if (rect.right > vw - margin) {
    nextLeft = Math.max(margin, vw - margin - rect.width);
  }
  if (rect.bottom > vh - margin) {
    nextTop = Math.max(margin, vh - margin - rect.height);
  }
  // Also clamp on the low side in case the caller passed negative
  // coords (shouldn't happen but cheap to defend).
  if (nextLeft < margin) nextLeft = margin;
  if (nextTop < margin) nextTop = margin;

  if (nextLeft !== rect.left) menu.style.left = `${nextLeft}px`;
  if (nextTop !== rect.top) menu.style.top = `${nextTop}px`;
}

/**
 * Render a persistent file drop zone.
 * @param large - If true, renders full-area invitation (when no entry selected).
 *                If false, renders compact strip (below entry content).
 */
function renderDropZone(state: AppState, large: boolean): HTMLElement {
  const zone = createElement('div', large ? 'pkc-drop-zone pkc-drop-zone-large' : 'pkc-drop-zone pkc-drop-zone-compact');
  zone.setAttribute('data-pkc-region', 'file-drop-zone');

  // Show context folder if applicable
  const contextFolder = resolveContextFolder(state);

  if (large) {
    const icon = createElement('div', 'pkc-drop-zone-icon');
    icon.textContent = '📎';
    zone.appendChild(icon);

    const label = createElement('div', 'pkc-drop-zone-label');
    label.textContent = 'ここにファイルをドロップして添付';
    zone.appendChild(label);

    if (contextFolder) {
      const ctx = createElement('div', 'pkc-drop-zone-context');
      ctx.textContent = `→ ${contextFolder.title || '(untitled)'}`;
      zone.appendChild(ctx);
    }

    // Also show the "or create" hint
    const hint = createElement('div', 'pkc-drop-zone-hint');
    hint.textContent = state.container?.entries?.length
      ? 'またはサイドバーからエントリを選択'
      : 'または上部の + ボタンでエントリを作成';
    zone.appendChild(hint);
  } else {
    const label = createElement('span', 'pkc-drop-zone-label');
    label.textContent = '📎 ファイルをドロップして添付';
    zone.appendChild(label);

    if (contextFolder) {
      const ctx = createElement('span', 'pkc-drop-zone-context');
      ctx.textContent = `→ ${truncate(contextFolder.title || '(untitled)', 20)}`;
      zone.appendChild(ctx);
    }
  }

  // Store context folder lid for action-binder to read
  if (contextFolder) {
    zone.setAttribute('data-pkc-context-folder', contextFolder.lid);
  }

  return zone;
}

// ── Detached View ──

/**
 * Render a detached (floating) view panel for an entry.
 * Non-modal: does not block main UI interaction.
 * Draggable via header bar.
 */
export function renderDetachedPanel(entry: Entry, container: Container | null): HTMLElement {
  const panel = createElement('div', 'pkc-detached-panel');
  panel.setAttribute('data-pkc-region', 'detached-panel');
  panel.setAttribute('data-pkc-lid', entry.lid);

  // Header bar (draggable handle + close button)
  const header = createElement('div', 'pkc-detached-header');
  header.setAttribute('data-pkc-region', 'detached-header');

  const icon = createElement('span', 'pkc-detached-icon');
  icon.textContent = archetypeIcon(entry.archetype);
  header.appendChild(icon);

  const titleEl = createElement('span', 'pkc-detached-title');
  titleEl.textContent = entry.title || '(untitled)';
  header.appendChild(titleEl);

  const typeBadge = createElement('span', 'pkc-archetype-badge');
  typeBadge.textContent = archetypeLabel(entry.archetype);
  header.appendChild(typeBadge);

  const closeBtn = createElement('button', 'pkc-detached-close');
  closeBtn.setAttribute('data-pkc-action', 'close-detached');
  closeBtn.setAttribute('title', 'Close this panel');
  closeBtn.textContent = '×';
  header.appendChild(closeBtn);

  panel.appendChild(header);

  // Content area
  const content = createElement('div', 'pkc-detached-content');

  if (entry.archetype === 'attachment') {
    content.appendChild(renderDetachedAttachment(entry, container));
  } else {
    // Use presenter for body rendering (read-only).
    // Pass assets + MIME + name maps so asset references (images and
    // non-image chips) resolve in detached view too.
    const presenter = getPresenter(entry.archetype);
    if (container?.assets) {
      const mimeByKey = buildAssetMimeMap(container);
      const nameByKey = buildAssetNameMap(container);
      content.appendChild(
        presenter.renderBody(
          entry,
          container.assets,
          mimeByKey,
          nameByKey,
          container.entries,
          container.meta.container_id,
        ),
      );
    } else {
      content.appendChild(presenter.renderBody(entry));
    }

    // Folder contents
    if (entry.archetype === 'folder' && container) {
      content.appendChild(renderFolderContents(entry, container));
    }
  }

  panel.appendChild(content);

  // Make panel draggable via header
  makeDraggablePanel(panel, header);

  return panel;
}

/**
 * Render attachment content for detached view.
 * image/* → large preview, others → metadata + download button.
 */
function renderDetachedAttachment(entry: Entry, container: Container | null): HTMLElement {
  const root = createElement('div', 'pkc-detached-attachment');
  const att = parseAttachmentBody(entry.body, entry);

  if (!att.name) {
    const empty = createElement('div', 'pkc-attachment-empty');
    empty.textContent = 'No file attached. Edit this entry to add a file, or drop one into the center pane.';
    root.appendChild(empty);
    return root;
  }

  // File info
  const displayName = deriveDisplayFilename(att.name, att.mime);
  const info = createElement('div', 'pkc-detached-attachment-info');
  info.textContent = `${displayName} — ${att.mime}${att.size ? ` (${formatFileSize(att.size)})` : ''}`;
  root.appendChild(info);

  // Check data availability
  const hasData = !!(att.data || (att.asset_key && container?.assets?.[att.asset_key]));
  const previewType = classifyPreviewType(att.mime);

  // P1s2-c: media 系は base64 非常駐でも registry URL があれば preview 可
  const hasRegistryUrl = !!att.asset_key && getAssetUrl(att.asset_key, att.mime) !== null;
  const urlPreviewable =
    previewType === 'image' || previewType === 'pdf' || previewType === 'video' || previewType === 'audio';
  if (previewType !== 'none' && (hasData || (hasRegistryUrl && urlPreviewable))) {
    // Preview area: populated by action-binder based on MIME type
    const previewArea = createElement('div', 'pkc-detached-preview');
    previewArea.setAttribute('data-pkc-region', 'detached-attachment-preview');
    previewArea.setAttribute('data-pkc-lid', entry.lid);
    previewArea.setAttribute('data-pkc-preview-type', previewType);
    const placeholder = createElement('div', 'pkc-attachment-preview-placeholder');
    placeholder.textContent = 'Loading preview…';
    previewArea.appendChild(placeholder);
    root.appendChild(previewArea);
  }

  // #956: 非常駐なだけ(Light export でない)なら回復を促し、Download
  // ボタンは残す(click 経路が on-demand hydrate する)。P1s2-c(#967):
  // #964 の 4MB 閾値と deferred 分岐は撤去 — media 系は registry の
  // ObjectURL(ヒープ ±0・サイズ非依存)、それ以外のみ base64 hydrate。
  // A4(視覚監査 2026-07-25):center pane と同じ第 3 状態(store にも実体が
  // 無い)を分ける。ここも従来は永久に「⏳ 読み込み中」だった。
  const assetMissing = !hasData && !!att.asset_key && !isAttachmentLightSourceHint()
    && isAssetConfirmedAbsent(att.asset_key);
  const pendingHydration = !hasData && !!att.asset_key && !isAttachmentLightSourceHint()
    && !assetMissing;
  if (pendingHydration) {
    const regUrl = getAssetUrl(att.asset_key!, att.mime);
    const t = classifyPreviewType(att.mime);
    const urlRenderable = t === 'image' || t === 'pdf' || t === 'video' || t === 'audio';
    if (!regUrl && !urlRenderable) noteAssetMiss(att.asset_key!);
  }
  // assetMissing でも `Light export` 側の else 節に落とさない(誤表示になる)。
  if (hasData || pendingHydration || assetMissing) {
    if (assetMissing) {
      const missing = createElement('div', 'pkc-attachment-missing');
      missing.setAttribute('data-pkc-region', 'attachment-missing');
      missing.textContent = '⚠ ファイルの中身が見つかりません';
      missing.title =
        `保存領域に asset (${att.asset_key ?? '?'}) の実体がありません。`
        + 'ダウンロードは保存領域を直接読むので、試す価値はあります。';
      root.appendChild(missing);
    } else if (pendingHydration) {
      const pending = createElement('div', 'pkc-attachment-pending');
      pending.setAttribute('data-pkc-region', 'attachment-loading');
      pending.textContent = '⏳ ファイル読み込み中…';
      root.appendChild(pending);
    }
    const dlBtn = createElement('button', 'pkc-btn');
    dlBtn.setAttribute('data-pkc-action', 'download-attachment');
    dlBtn.setAttribute('data-pkc-lid', entry.lid);
    dlBtn.setAttribute('title', `${displayName} をダウンロード`);
    dlBtn.textContent = `📥 ダウンロード ${displayName}`;
    root.appendChild(dlBtn);
  } else {
    const stripped = createElement('div', 'pkc-attachment-stripped');
    stripped.textContent = 'File data not available (Light export)';
    root.appendChild(stripped);
  }

  return root;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Make a panel draggable by its header.
 */
function makeDraggablePanel(panel: HTMLElement, handle: HTMLElement): void {
  let offsetX = 0;
  let offsetY = 0;

  function onMouseDown(e: MouseEvent): void {
    // Only drag via the header, not buttons inside it
    if ((e.target as HTMLElement).closest('button')) return;
    offsetX = e.clientX - panel.offsetLeft;
    offsetY = e.clientY - panel.offsetTop;
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    e.preventDefault();
  }

  function onMouseMove(e: MouseEvent): void {
    panel.style.left = `${e.clientX - offsetX}px`;
    panel.style.top = `${e.clientY - offsetY}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  }

  function onMouseUp(): void {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  }

  handle.addEventListener('mousedown', onMouseDown);
  handle.style.cursor = 'grab';
}
