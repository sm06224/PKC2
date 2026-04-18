import type { AppState } from '../state/app-state';
import type { Entry } from '../../core/model/record';
import { ABOUT_LID } from '../../core/model/record';
import type { Container } from '../../core/model/container';
import { resolveAboutPayload } from '../../core/model/about-payload';
import type { PendingOffer } from '../transport/record-offer-handler';
import type { ImportPreviewRef, BatchImportPreviewInfo, BatchImportResultSummary } from '../../core/action/system-command';
import { CAPABILITIES, VERSION } from '../../runtime/release-meta';
import {
  getRevisionCount,
  getLatestRevision,
  getRestoreCandidates,
  getRevisionsByBulkId,
  getEntryRevisions,
  parseRevisionSnapshot,
} from '../../core/operations/container-ops';
import type { ArchetypeId } from '../../core/model/record';
import { applyFilters } from '../../features/search/filter';
import { sortEntries } from '../../features/search/sort';
import type { SortKey, SortDirection } from '../../features/search/sort';
import { applyManualOrder } from '../../features/entry-order/entry-order';
import { findSubLocationHits } from '../../features/search/sub-location-search';
import type { SubLocationHit } from '../../features/search/sub-location-search';
import { getRelationsForEntry, resolveRelations } from '../../features/relation/selector';
import { getTagsForEntry, getAvailableTagTargets } from '../../features/relation/tag-selector';
import { filterByTag } from '../../features/relation/tag-filter';
import { buildTree, getBreadcrumb, getAvailableFolders, getStructuralParent, collectDescendantLids } from '../../features/relation/tree';
import type { TreeNode } from '../../features/relation/tree';
import type { RelationKind } from '../../core/model/relation';
import { getPresenter } from './detail-presenter';
import { syncTextlogSelectionFromState } from './textlog-selection';
import { syncTextToTextlogModalFromState } from './text-to-textlog-modal';
import { syncDualEditConflictOverlay } from './dual-edit-conflict-overlay';
import { syncTextlogPreviewModalFromState } from './textlog-preview-modal';
import { parseTodoBody, formatTodoDate, isTodoPastDue } from './todo-presenter';
import { parseAttachmentBody, classifyPreviewType, isHtml, isSvg, SANDBOX_ATTRIBUTES, SANDBOX_DESCRIPTIONS } from './attachment-presenter';
import { groupTodosByDate, getMonthGrid, dateKey, monthName } from '../../features/calendar/calendar-data';
import { groupTodosByStatus, KANBAN_COLUMNS } from '../../features/kanban/kanban-data';
import { collectOrphanAssetKeys } from '../../features/asset/asset-scan';
import { buildStorageProfile, formatBytes } from '../../features/asset/storage-profile';
import type { StorageProfile } from '../../features/asset/storage-profile';
import { renderMarkdown, hasMarkdownSyntax } from '../../features/markdown/markdown-render';
import { resolveAssetReferences, hasAssetReferences } from '../../features/markdown/asset-resolver';
import { countTaskProgress } from '../../features/markdown/markdown-task-list';
import { extractTocFromEntry } from '../../features/markdown/markdown-toc';
import type { TocNode } from '../../features/markdown/markdown-toc';
import { planMergeImport } from '../../features/import/merge-planner';
import { buildLinkIndex } from '../../features/link-index/link-index';
import type { LinkIndex, LinkRef } from '../../features/link-index/link-index';
import type { EntryConflict, Resolution } from '../../core/model/merge-conflict';
import { highlightMatchesIn } from './search-mark';
import { loadPanePrefs } from '../platform/pane-prefs';

/** Primary tier: always visible in the archetype filter bar (FI-09). */
const ARCHETYPE_FILTER_PRIMARY: readonly ArchetypeId[] = ['text', 'textlog', 'folder'];
/** Secondary tier: hidden by default, shown when archetypeFilterExpanded (FI-09). */
const ARCHETYPE_FILTER_SECONDARY: readonly ArchetypeId[] = ['todo', 'attachment', 'form', 'generic', 'opaque'];

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
  'system-about': 'About',
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
  'system-about': 'ℹ️',
};

function isUserEntry(e: Entry): boolean {
  return e.archetype !== 'system-about';
}

function getUserEntries(entries: Entry[]): Entry[] {
  return entries.filter(isUserEntry);
}

function archetypeIcon(archetype: ArchetypeId): string {
  return ARCHETYPE_ICONS[archetype] ?? '📄';
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
const RELATION_KIND_OPTIONS: readonly { kind: RelationKind; label: string }[] = [
  { kind: 'structural', label: 'Structural' },
  { kind: 'categorical', label: 'Categorical' },
  { kind: 'semantic', label: 'Semantic' },
  { kind: 'temporal', label: 'Temporal' },
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

export function render(state: AppState, root: HTMLElement): void {
  // P1-1: sync reducer-owned transient UI state into the forward
  // caches used by legacy reader APIs. Must happen BEFORE the DOM
  // is rebuilt below so presenters see the current selection state.
  // The caches themselves are never sources of truth — the reducer is.
  // See src/adapter/ui/textlog-selection.ts and
  // src/adapter/ui/text-to-textlog-modal.ts for the split.
  syncTextlogSelectionFromState(state);

  root.innerHTML = '';
  root.setAttribute('data-pkc-phase', state.phase);
  root.setAttribute('data-pkc-embedded', String(state.embedded));
  root.setAttribute('data-pkc-readonly', String(state.readonly));
  root.setAttribute('data-pkc-capabilities', CAPABILITIES.join(','));
  if (state.showScanline) {
    root.setAttribute('data-pkc-scanline', 'on');
  } else {
    root.removeAttribute('data-pkc-scanline');
  }
  // Accent color override (FI-12 follow-up). Written as an inline
  // style on `#pkc-root` so it cascades to everything referencing
  // `--c-accent`. undefined → remove the override so the base.css
  // default (neon green) takes over.
  if (state.accentColor) {
    root.style.setProperty('--c-accent', state.accentColor);
  } else {
    root.style.removeProperty('--c-accent');
  }

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
      root.appendChild(renderShell(state));
      break;
  }

  // Post-render: if the current selection changed since the last
  // render, nudge the sidebar tree node into view.  Pairs with the
  // ancestor auto-expand in the SELECT_ENTRY reducer — together they
  // close the "selected but not visible" gap for Storage Profile
  // jumps, entry-ref clicks, calendar / kanban taps, and anything
  // else that dispatches SELECT_ENTRY from outside the tree.
  scrollSelectedSidebarNodeIntoView(state, root);

  // P1-1: reconcile the TEXT → TEXTLOG preview modal with the
  // authoritative state. Mount / unmount / re-render is decided
  // purely from `state.textToTextlogModal`. The helper is
  // responsible for its own DOM idempotency.
  syncTextToTextlogModalFromState(state, root);

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
  const node = sidebar.querySelector<HTMLElement>(
    `[data-pkc-selected="true"][data-pkc-lid="${CSS.escape(state.selectedLid)}"]`,
  );
  if (!node) return;
  node.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  root.dataset.pkcLastScrolledLid = state.selectedLid;
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

function renderShell(state: AppState): HTMLElement {
  const shell = createElement('div', 'pkc-shell');

  // Header
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
    shell.appendChild(renderPendingOffers(state.pendingOffers));
  }

  // Shell menu panel (hidden by default, toggled by action-binder).
  // The current theme is read from the root element so the active
  // theme button can be highlighted on every render.
  const currentTheme = getCurrentThemeMode();
  shell.appendChild(renderShellMenu(currentTheme, state));

  // Shortcut help overlay (hidden by default, toggled by ? key)
  shell.appendChild(renderShortcutHelp());

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
  const leftTray = createElement('div', 'pkc-tray-bar');
  leftTray.setAttribute('data-pkc-action', 'toggle-sidebar');
  leftTray.setAttribute('title', 'Click to expand sidebar');
  leftTray.textContent = 'SIDEBAR';
  leftTray.style.display = panePrefs.sidebar ? '' : 'none';
  leftTray.setAttribute('data-pkc-region', 'tray-left');
  main.appendChild(leftTray);

  // Left pane: entry list / tree / search / filters
  const sidebar = renderSidebar(state);
  if (panePrefs.sidebar) sidebar.setAttribute('data-pkc-collapsed', 'true');
  main.appendChild(sidebar);

  // Resize handle: sidebar ↔ center
  const leftHandle = createElement('div', 'pkc-resize-handle');
  leftHandle.setAttribute('data-pkc-resize', 'left');
  if (panePrefs.sidebar) leftHandle.setAttribute('data-pkc-collapsed', 'true');
  main.appendChild(leftHandle);

  // Center pane: content view/edit + fixed action bar
  main.appendChild(renderCenter(state));

  // Right pane: meta information (tags, relations, history, move)
  const selected = findSelectedEntry(state);
  if (selected) {
    // Resize handle: center ↔ meta
    const rightHandle = createElement('div', 'pkc-resize-handle');
    rightHandle.setAttribute('data-pkc-resize', 'right');
    if (panePrefs.meta) rightHandle.setAttribute('data-pkc-collapsed', 'true');
    main.appendChild(rightHandle);

    const canEdit = state.phase === 'ready' && !state.readonly;
    const metaPane = renderMetaPane(selected, canEdit, state.container);
    if (panePrefs.meta) metaPane.setAttribute('data-pkc-collapsed', 'true');
    main.appendChild(metaPane);
  }

  // Right tray bar (shown when meta pane is collapsed)
  const rightTray = createElement('div', 'pkc-tray-bar pkc-tray-bar-right');
  rightTray.setAttribute('data-pkc-action', 'toggle-meta');
  rightTray.setAttribute('title', 'Click to expand meta pane');
  rightTray.textContent = 'META';
  // The right tray is only meaningful when a meta pane exists, i.e.
  // when an entry is selected. When no entry is selected, leave it
  // hidden regardless of the persisted preference.
  rightTray.style.display = panePrefs.meta && selected ? '' : 'none';
  rightTray.setAttribute('data-pkc-region', 'tray-right');
  main.appendChild(rightTray);

  shell.appendChild(main);
  return shell;
}

function renderHeader(state: AppState): HTMLElement {
  const header = createElement('header', 'pkc-header');

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
      { arch: 'attachment', label: `${archetypeIcon('attachment')} File`, tip: 'Create a new file attachment entry' },
      { arch: 'folder', label: `${archetypeIcon('folder')} Folder`, tip: 'Create a new folder' },
    ];

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

    header.appendChild(createGroup);

    // Export / Import inline buttons
    header.appendChild(renderExportImportInline(state));
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
      textlogsBtn.textContent = 'TEXTLOGs';
      header.appendChild(textlogsBtn);
    }

    // Container-wide TEXT export — available in readonly mode
    // because export is a read-only operation (spec §7).
    const hasTexts = state.container?.entries.some((e) => e.archetype === 'text');
    if (hasTexts) {
      const textsBtn = createElement('button', 'pkc-btn pkc-btn-create');
      textsBtn.setAttribute('data-pkc-action', 'export-texts-container');
      textsBtn.setAttribute('title', 'Export all TEXTs as a single ZIP bundle (.texts.zip)');
      textsBtn.textContent = 'TEXTs';
      header.appendChild(textsBtn);
    }

    // Mixed container export — available in readonly mode.
    if (hasTextlogs || hasTexts) {
      const mixedBtn = createElement('button', 'pkc-btn pkc-btn-create');
      mixedBtn.setAttribute('data-pkc-action', 'export-mixed-container');
      mixedBtn.setAttribute('title', 'Export all TEXTs + TEXTLOGs as a single ZIP bundle (.mixed.zip)');
      mixedBtn.textContent = 'Mixed';
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

  // Pane toggle buttons (always shown)
  const sidebarToggle = createElement('button', 'pkc-tray-toggle');
  sidebarToggle.setAttribute('data-pkc-action', 'toggle-sidebar');
  sidebarToggle.setAttribute('title', 'Toggle sidebar');
  sidebarToggle.textContent = '◧';
  header.appendChild(sidebarToggle);

  const metaToggle = createElement('button', 'pkc-tray-toggle');
  metaToggle.setAttribute('data-pkc-action', 'toggle-meta');
  metaToggle.setAttribute('title', 'Toggle meta pane');
  metaToggle.textContent = '◨';
  header.appendChild(metaToggle);

  // Shell menu button
  const menuBtn = createElement('button', 'pkc-tray-toggle pkc-shell-menu-btn');
  menuBtn.setAttribute('data-pkc-action', 'toggle-shell-menu');
  menuBtn.setAttribute('title', 'Menu (?)');
  menuBtn.textContent = '⚙';
  header.appendChild(menuBtn);

  return header;
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
  overlay.style.display = 'none';

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

  // Shortcuts
  const shortcutSection = createElement('div', 'pkc-shell-menu-section');
  const shortcutBtn = createElement('button', 'pkc-btn-small');
  shortcutBtn.setAttribute('data-pkc-action', 'show-shortcut-help');
  shortcutBtn.textContent = '⌨ Keyboard Shortcuts';
  shortcutSection.appendChild(shortcutBtn);
  card.appendChild(shortcutSection);

  // Data Maintenance — manual orphan asset cleanup + workspace reset.
  //
  // This section is intentionally passive until the user clicks:
  // the orphan count is just a read-only scan of the current
  // container, the cleanup button disables itself when there is
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

  // Version
  const versionSection = createElement('div', 'pkc-shell-menu-section pkc-shell-menu-version');
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

  const orphanKeys = collectOrphanAssetKeys(container);
  const orphanCount = orphanKeys.size;
  const totalCount = Object.keys(container.assets).length;

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
  overlay.style.display = 'none';

  const card = createElement('div', 'pkc-shortcut-card');

  const heading = createElement('h2', 'pkc-shortcut-heading');
  heading.textContent = 'Keyboard Shortcuts';
  card.appendChild(heading);

  const shortcuts: { key: string; desc: string; group?: string }[] = [
    { key: 'Ctrl+N / ⌘+N', desc: 'New text entry' },
    { key: 'Ctrl+S / ⌘+S', desc: 'Save (in edit mode)' },
    { key: 'Escape', desc: 'Cancel edit / Deselect / Close' },
    { key: 'Ctrl+? / ⌘+?', desc: 'Toggle this help' },
    { key: 'Ctrl+Click / ⌘+Click', desc: 'Toggle multi-select' },
    { key: 'Shift+Click', desc: 'Range select' },
    { key: '', desc: '', group: 'Panes' },
    { key: 'Ctrl+\\ / ⌘+\\', desc: 'Toggle sidebar (left pane)' },
    { key: 'Ctrl+Shift+\\', desc: 'Toggle meta pane (right pane)' },
    { key: '', desc: '', group: 'Date/Time (edit mode)' },
    { key: 'Ctrl+;', desc: 'Insert date (yyyy/MM/dd)' },
    { key: 'Ctrl+:', desc: 'Insert time (HH:mm:ss)' },
    { key: 'Ctrl+Shift+;', desc: 'Insert date+time' },
    { key: 'Ctrl+D', desc: 'Insert short date + day of week' },
    { key: 'Ctrl+Shift+D', desc: 'Insert short date+time' },
    { key: 'Ctrl+Shift+Alt+D', desc: 'Insert ISO 8601' },
    { key: '', desc: '', group: 'Slash Commands (edit mode)' },
    { key: '/', desc: 'Open input assist menu (line start)' },
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
export function buildStorageProfileOverlay(
  container: Container | null,
): HTMLElement {
  const overlay = createElement('div', 'pkc-storage-profile-overlay');
  overlay.setAttribute('data-pkc-region', 'storage-profile');

  const card = createElement('div', 'pkc-storage-profile-card');

  const heading = createElement('h2', 'pkc-storage-profile-heading');
  heading.textContent = 'Storage Profile';
  card.appendChild(heading);

  const note = createElement('div', 'pkc-storage-profile-note');
  note.textContent =
    'Estimate based on embedded assets and asset references. Actual browser storage usage may differ.';
  card.appendChild(note);

  // Compute profile once and reuse for summary + rows + Export CSV
  // button gating. `profile === null` corresponds to the no-container
  // shell below.
  const profile = container ? buildStorageProfile(container) : null;
  if (!profile) {
    const empty = createElement('div', 'pkc-storage-profile-empty');
    empty.textContent = 'No container loaded.';
    card.appendChild(empty);
  } else {
    card.appendChild(renderStorageProfileSummary(profile));
    card.appendChild(renderStorageProfileRows(profile));
  }

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
 * Summary block for the Storage Profile dialog — top-level
 * aggregates only (total assets, total bytes, largest asset,
 * largest subtree).
 */
function renderStorageProfileSummary(profile: StorageProfile): HTMLElement {
  const section = createElement('div', 'pkc-storage-profile-section');
  section.setAttribute('data-pkc-region', 'storage-profile-summary');
  section.setAttribute('data-pkc-asset-count', String(profile.summary.assetCount));
  section.setAttribute('data-pkc-total-bytes', String(profile.summary.totalBytes));

  const label = createElement('span', 'pkc-shell-menu-label');
  label.textContent = 'Summary';
  section.appendChild(label);

  const { summary, orphanBytes, orphanCount } = profile;
  const lines: { label: string; value: string; raw?: number }[] = [
    { label: 'Total assets', value: String(summary.assetCount) },
    { label: 'Total size', value: formatBytes(summary.totalBytes), raw: summary.totalBytes },
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
  label.textContent = `Top entries by size (showing ${Math.min(profile.rows.length, TOP_N)} of ${profile.rows.length})`;
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
    detail.textContent = parts.join(' · ');
    trigger.appendChild(detail);

    li.appendChild(trigger);
    table.appendChild(li);
  }
  section.appendChild(table);
  return section;
}

function renderExportImportInline(state: AppState): HTMLElement {
  const group = createElement('div', 'pkc-eip-inline');
  group.setAttribute('data-pkc-region', 'export-import-panel');

  // Wrap all export/import buttons in a <details> element to reduce
  // header noise. The summary acts as a single toggle button; the
  // full panel is hidden until the user explicitly opens it.
  const details = document.createElement('details');
  details.className = 'pkc-eip-details';
  const summary = document.createElement('summary');
  summary.className = 'pkc-btn pkc-btn-create pkc-eip-summary';
  summary.setAttribute('title', 'エクスポート・インポート操作');
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
  //   [Archive — ZIP, re-importable into PKC2]
  //     ZIP │ TEXTLOGs? │ TEXTs? │ Mixed? │ 📦 Selected (TEXT/TEXTLOG)
  //   ──
  //   [Import]
  //     Import │ 📥 Textlog │ 📥 Text │ 📥 Entry │ 📥 Batch
  //
  // Rationale: the two "Selected" buttons live in different groups
  // and carry different icons — 📤 (share HTML) vs 📦 (ZIP package)
  // — so they read as distinct workflows rather than variants of
  // the same action. See docs/development/selected-entry-html-clone-export.md.

  const selectedEntry = state.selectedLid
    ? state.container?.entries.find((e) => e.lid === state.selectedLid)
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
  exportBtn.textContent = 'Export';
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
  lightBtn.textContent = 'Light';
  content.appendChild(lightBtn);

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

  // ZIP Export — full container ZIP for re-import
  const zipBtn = createElement('button', 'pkc-btn pkc-btn-create');
  zipBtn.setAttribute('data-pkc-action', 'export-zip');
  zipBtn.setAttribute(
    'title',
    '.pkc2.zip パッケージとしてエクスポート（別 PKC2 への再インポート・データ交換用）',
  );
  zipBtn.textContent = 'ZIP';
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
    textlogsBtn.textContent = 'TEXTLOGs';
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
    textsBtn.textContent = 'TEXTs';
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
    mixedBtn.textContent = 'Mixed';
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
      `選択中の ${kind} エントリを単独 ZIP パッケージとしてエクスポート（別 PKC2 への再インポート用）`,
    );
    selectedBtn.textContent = `📦 Selected (${kind})`;
  } else {
    (selectedBtn as HTMLButtonElement).disabled = true;
    selectedBtn.setAttribute(
      'title',
      '選択中のエントリを単独 ZIP で個別出力（TEXT / TEXTLOG 選択時のみ有効・再インポート用）',
    );
    selectedBtn.textContent = '📦 Selected';
  }
  content.appendChild(selectedBtn);

  // Group separator: Archive (ZIP) → Import
  const sep = createElement('span', 'pkc-eip-sep');
  sep.textContent = '|';
  content.appendChild(sep);

  // Import
  const importBtn = createElement('button', 'pkc-btn pkc-btn-create');
  importBtn.setAttribute('data-pkc-action', 'begin-import');
  importBtn.setAttribute('title', 'HTML または ZIP からインポート（上書き）');
  importBtn.textContent = 'Import';
  content.appendChild(importBtn);

  // Import textlog bundle
  const importTextlogBtn = createElement('button', 'pkc-btn pkc-btn-create');
  importTextlogBtn.setAttribute('data-pkc-action', 'import-textlog-bundle');
  importTextlogBtn.setAttribute('title', '.textlog.zip を新規エントリとしてインポート');
  importTextlogBtn.textContent = '📥 Textlog';
  content.appendChild(importTextlogBtn);

  // Import text bundle
  const importTextBtn = createElement('button', 'pkc-btn pkc-btn-create');
  importTextBtn.setAttribute('data-pkc-action', 'import-text-bundle');
  importTextBtn.setAttribute('title', '.text.zip を新規エントリとしてインポート');
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
    '.text.zip または .textlog.zip を自動判別して新規エントリとしてインポート',
  );
  importEntryBtn.textContent = '📥 Entry';
  content.appendChild(importEntryBtn);

  // Import batch bundle (container-wide / folder-scoped)
  const importBatchBtn = createElement('button', 'pkc-btn pkc-btn-create');
  importBatchBtn.setAttribute('data-pkc-action', 'import-batch-bundle');
  importBatchBtn.setAttribute('title', 'batch bundle (.textlogs.zip / .texts.zip / .mixed.zip / .folder-export.zip) をまとめてインポート');
  importBatchBtn.textContent = '📥 Batch';
  content.appendChild(importBatchBtn);

  details.appendChild(content);
  group.appendChild(details);

  return group;
}

function renderSidebar(state: AppState): HTMLElement {
  const sidebar = createElement('aside', 'pkc-sidebar');
  sidebar.setAttribute('data-pkc-region', 'sidebar');

  const allEntries = getUserEntries(state.container?.entries ?? []);

  // Search input (always shown when entries exist)
  if (allEntries.length > 0) {
    const searchRow = createElement('div', 'pkc-search-row');

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search entries…';
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

    sidebar.appendChild(searchRow);

    // Archetype filter bar
    sidebar.appendChild(renderArchetypeFilter(state.archetypeFilter, state.archetypeFilterExpanded ?? false));

    // Sort controls
    sidebar.appendChild(renderSortControls(state.sortKey, state.sortDirection));
  }

  // Show archived toggle (only when there are archived todos)
  if (allEntries.some((e) => e.archetype === 'todo' && parseTodoBody(e.body).archived)) {
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
    sidebar.appendChild(toggle);
  }

  // Active tag filter indicator
  if (state.tagFilter && state.container) {
    const tagEntry = state.container.entries.find((e) => e.lid === state.tagFilter);
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

  // Pipeline: query → archetype → tag → archive → sort
  let filtered = applyFilters(allEntries, state.searchQuery, state.archetypeFilter);
  if (state.tagFilter && state.container) {
    filtered = filterByTag(filtered, state.container.relations, state.tagFilter);
  }
  if (!state.showArchived) {
    filtered = filtered.filter((e) => {
      if (e.archetype !== 'todo') return true;
      return !parseTodoBody(e.body).archived;
    });
  }
  // C-2 v1 (2026-04-17): manual mode routes through applyManualOrder
  // using `container.meta.entry_order` (contract §2.2). Non-manual
  // modes fall through to the existing stable temporal/title sort.
  const entries = state.sortKey === 'manual'
    ? applyManualOrder(filtered, state.container?.meta.entry_order ?? [])
    : sortEntries(filtered, state.sortKey, state.sortDirection);

  // Result count (shown when any filter is active)
  if (allEntries.length > 0 && (state.searchQuery !== '' || state.archetypeFilter.size > 0 || state.tagFilter !== null)) {
    const count = createElement('div', 'pkc-result-count');
    count.setAttribute('data-pkc-region', 'result-count');
    count.textContent = `${entries.length} / ${allEntries.length} entries`;
    sidebar.appendChild(count);
  }

  if (allEntries.length === 0) {
    const empty = createElement('div', 'pkc-empty pkc-guidance');
    empty.setAttribute('data-pkc-region', 'empty-guidance');
    if (state.phase === 'ready' && !state.readonly) {
      empty.innerHTML = 'No entries yet.<br>Use the <strong>+ buttons</strong> above to create one,<br>or <strong>drop a file</strong> into the center pane.';
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
    empty.textContent = 'No matching entries. Try adjusting your search or filters.';
    sidebar.appendChild(empty);
    sidebar.appendChild(renderSidebarDropZone(state));
    return sidebar;
  }

  const list = createElement('ul', 'pkc-entry-list');
  const hasActiveFilter = state.searchQuery !== '' || state.archetypeFilter.size > 0 || state.tagFilter !== null;

  if (hasActiveFilter || !state.container) {
    // Flat mode when filters are active (tree doesn't make sense for search results)
    const query = state.searchQuery.trim();
    for (const entry of entries) {
      list.appendChild(renderEntryItem(entry, state));
      // S-18 (A-4 FULL, 2026-04-14): when the user has typed a
      // search query AND the entry has sub-location matches, expand
      // them as clickable sidebar rows that scroll to the exact spot
      // on click. Only runs for TEXT / TEXTLOG (the indexer returns
      // [] for other archetypes). Limited to the top 5 matches per
      // entry by the indexer's maxPerEntry default — keeps the list
      // scannable on frequent terms.
      if (query !== '') {
        const hits = findSubLocationHits(entry, query);
        for (const hit of hits) {
          list.appendChild(renderSubLocationItem(hit));
        }
      }
    }
  } else {
    // Tree mode: build from structural relations
    const tree = buildTree(entries, state.container.relations);
    // C-2 v1 manual mode: buildTree orders children by relation
    // iteration order, not by `entries` position. Reorder each node's
    // children so folder-child ordering reflects `entry_order`.
    const displayTree = state.sortKey === 'manual'
      ? reorderTreeByEntries(tree, entries)
      : tree;
    for (const node of displayTree) {
      renderTreeNode(node, list, state);
    }
  }
  sidebar.appendChild(list);

  // Root drop zone: drop here to move entry to root level
  if (state.phase === 'ready' && !state.readonly) {
    const rootDrop = createElement('div', 'pkc-root-drop-zone');
    rootDrop.setAttribute('data-pkc-drop-target', 'root');
    rootDrop.textContent = '↑ Drop here for root level';
    sidebar.appendChild(rootDrop);
  }

  // Interaction hints (non-intrusive)
  if (entries.length > 0) {
    const hints = createElement('div', 'pkc-interaction-hints');
    hints.setAttribute('data-pkc-region', 'interaction-hints');
    hints.innerHTML = [
      '<span>Drag to move</span>',
      '<span>Double-click to open</span>',
      '<span>Right-click for menu</span>',
      '<span>Ctrl+click to multi-select</span>',
    ].join(' · ');
    sidebar.appendChild(hints);
  }

  // Multi-selection action bar
  if (state.multiSelectedLids.length > 0 && !state.readonly) {
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

    const clearBtn = createElement('button', 'pkc-btn-small');
    clearBtn.setAttribute('data-pkc-action', 'clear-multi-select');
    clearBtn.textContent = 'Clear';
    bar.appendChild(clearBtn);

    sidebar.appendChild(bar);
  }

  // Restore candidates (deleted entries with revisions) — collapsible, closed by default
  if (state.container && state.phase === 'ready') {
    const candidates = getRestoreCandidates(state.container);
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
  label.textContent = '📎 Drop files here';
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

function renderTreeNode(node: TreeNode, parent: HTMLElement, state: AppState): void {
  const li = renderEntryItem(node.entry, state);
  if (node.depth > 0) {
    li.style.paddingLeft = `${0.6 + node.depth * 1.2}rem`;
  }
  // All tree items are draggable
  li.setAttribute('draggable', 'true');
  li.setAttribute('data-pkc-draggable', 'true');
  let isCollapsed = false;
  if (node.entry.archetype === 'folder') {
    li.setAttribute('data-pkc-folder', 'true');
    li.setAttribute('data-pkc-drop-target', 'true');

    // Expand/collapse toggle — shown only when folder has children.
    isCollapsed = state.collapsedFolders.includes(node.entry.lid);
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
    const childCount = createElement('span', 'pkc-folder-count');
    childCount.textContent = `(${node.children.length})`;
    li.appendChild(childCount);
  }
  parent.appendChild(li);
  // Skip rendering children when the folder is collapsed.
  if (isCollapsed) return;
  for (const child of node.children) {
    renderTreeNode(child, parent, state);
  }
}

function renderEntryItem(entry: Entry, state: AppState): HTMLElement {
  const li = createElement('li', 'pkc-entry-item');
  li.setAttribute('data-pkc-action', 'select-entry');
  li.setAttribute('data-pkc-lid', entry.lid);

  if (entry.lid === state.selectedLid) {
    li.setAttribute('data-pkc-selected', 'true');
  }
  if (state.multiSelectedLids.includes(entry.lid)) {
    li.setAttribute('data-pkc-multi-selected', 'true');
  }

  const title = createElement('span', 'pkc-entry-title');
  title.textContent = `${archetypeIcon(entry.archetype)} ${entry.title || '(untitled)'}`;
  li.appendChild(title);

  // Todo status indicator
  if (entry.archetype === 'todo') {
    const todo = parseTodoBody(entry.body);
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
    const revCount = getRevisionCount(state.container, entry.lid);
    if (revCount > 0) {
      li.setAttribute('data-pkc-has-history', 'true');
      const revBadge = createElement('span', 'pkc-revision-badge');
      revBadge.setAttribute('data-pkc-revision-count', String(revCount));
      revBadge.textContent = `r${revCount}`;
      li.appendChild(revBadge);
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
  const center = createElement('section', 'pkc-center');
  center.setAttribute('data-pkc-region', 'center');

  const userEntries = getUserEntries(state.container?.entries ?? []);

  // View mode toggle (always visible when container has user entries)
  if (userEntries.length > 0) {
    center.appendChild(renderViewModeToggle(state.viewMode));
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

  // Detail view (existing behavior)
  const selected = findSelectedEntry(state);
  const canEdit = state.phase === 'ready' && !state.readonly;

  // Show About when: explicitly selected OR no user entries exist
  const aboutEntry = state.container?.entries.find((e) => e.lid === ABOUT_LID);
  const showAbout = selected?.archetype === 'system-about'
    || (userEntries.length === 0 && !selected && aboutEntry);
  if (showAbout) {
    center.appendChild(renderAboutView(aboutEntry));
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

  // Content area (scrollable)
  const content = createElement('div', 'pkc-center-content');

  // Light mode notice for attachment entries
  if (state.lightSource && selected.archetype === 'attachment') {
    const notice = createElement('div', 'pkc-light-notice');
    notice.setAttribute('data-pkc-region', 'light-notice');
    notice.textContent = 'This is a Light export — attachment file data is not available. Use the full export to access file previews and downloads.';
    content.appendChild(notice);
  }

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
    content.appendChild(renderView(selected, canEdit, state.container, state.searchQuery));
  }

  // Compact drop zone strip when viewing an entry (not editing)
  if (canEdit && state.phase !== 'editing') {
    content.appendChild(renderDropZone(state, false));
  }

  center.appendChild(content);

  // Fixed action bar at bottom
  center.appendChild(renderActionBar(selected, state.phase, canEdit, state.container));

  return center;
}

function renderViewModeToggle(viewMode: 'detail' | 'calendar' | 'kanban'): HTMLElement {
  const bar = createElement('div', 'pkc-view-mode-bar');
  bar.setAttribute('data-pkc-region', 'view-mode-bar');

  const modes: { key: typeof viewMode; label: string }[] = [
    { key: 'detail', label: 'Detail' },
    { key: 'calendar', label: 'Calendar' },
    { key: 'kanban', label: 'Kanban' },
  ];

  for (const { key, label } of modes) {
    const btn = createElement('button', 'pkc-view-mode-btn');
    btn.setAttribute('data-pkc-action', 'set-view-mode');
    btn.setAttribute('data-pkc-view-mode', key);
    btn.textContent = label;
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

  // Build todo map
  const entries = state.container?.entries ?? [];
  const todoMap = groupTodosByDate(entries, state.showArchived);

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

      const dayNum = createElement('div', 'pkc-calendar-day');
      dayNum.textContent = String(day);
      cell.appendChild(dayNum);

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
  const monthKey = `${state.calendarYear}-${String(state.calendarMonth).padStart(2, '0')}`;
  const hasTodosThisMonth = Object.keys(todoMap).some((k) => k.startsWith(monthKey));
  if (!hasTodosThisMonth) {
    const empty = createElement('div', 'pkc-calendar-empty');
    empty.setAttribute('data-pkc-region', 'calendar-empty');
    empty.textContent = 'No dated todos this month.';
    cal.appendChild(empty);
  }

  return cal;
}

function renderKanbanView(state: AppState): HTMLElement {
  const kanban = createElement('div', 'pkc-kanban');
  kanban.setAttribute('data-pkc-region', 'kanban-view');

  const entries = state.container?.entries ?? [];
  const grouped = groupTodosByStatus(entries);

  const board = createElement('div', 'pkc-kanban-board');

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

    column.appendChild(header);

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
        date.textContent = formatTodoDate(item.todo.date);
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

/** Fixed action bar at bottom of center pane. Shows contextual actions. */
function renderActionBar(entry: Entry, phase: string, canEdit: boolean, container?: Container | null): HTMLElement {
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

      const deleteBtn = createElement('button', 'pkc-btn-danger');
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
        exportBtn.setAttribute('title', 'フォルダ配下の TEXT / TEXTLOG をまとめて ZIP エクスポート');
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
      moreSummary.textContent = 'More…';
      more.appendChild(moreSummary);

      const moreContent = createElement('div', 'pkc-action-bar-more-content');

      // Slice 4-B: Copy MD / Copy Rich emit markdown-source round-trip
      // payloads and therefore only make sense for TEXT. TEXTLOG's
      // flatten path (`serializeTextlogAsMarkdown`) has been removed —
      // users export TEXTLOG via the rendered viewer's Download HTML
      // button instead.
      if (entry.archetype === 'text') {
        const copyMdBtn = createElement('button', 'pkc-btn pkc-action-copy-md');
        copyMdBtn.setAttribute('data-pkc-action', 'copy-markdown-source');
        copyMdBtn.setAttribute('data-pkc-lid', entry.lid);
        copyMdBtn.setAttribute('title', 'Markdown ソースをクリップボードにコピー');
        copyMdBtn.textContent = '📋 MD';
        moreContent.appendChild(copyMdBtn);

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
        exportBtn.setAttribute('title', 'CSV + アセット ZIP バンドルをダウンロード');
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
        exportBtn.setAttribute('title', 'Markdown + アセット ZIP バンドルをダウンロード');
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

function renderView(entry: Entry, _canEdit: boolean, container: Container | null, searchQuery: string = ''): HTMLElement {
  const view = createElement('div', 'pkc-view');
  view.setAttribute('data-pkc-mode', 'view');
  view.setAttribute('data-pkc-archetype', entry.archetype);

  const titleRow = createElement('div', 'pkc-view-title-row');
  const title = createElement('h2', 'pkc-view-title');
  title.textContent = entry.title || '(untitled)';
  titleRow.appendChild(title);

  const archLabel = createElement('span', 'pkc-archetype-label');
  archLabel.setAttribute('data-pkc-archetype', entry.archetype);
  archLabel.textContent = `${archetypeIcon(entry.archetype)} ${archetypeLabel(entry.archetype)}`;
  titleRow.appendChild(archLabel);

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

  // Breadcrumb: show parent folder path + current entry
  if (container) {
    const breadcrumb = getBreadcrumb(container.relations, container.entries, entry.lid);
    if (breadcrumb.length > 0) {
      const bc = createElement('div', 'pkc-breadcrumb');
      bc.setAttribute('data-pkc-region', 'breadcrumb');
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
      // Current entry (non-clickable)
      const current = createElement('span', 'pkc-breadcrumb-current');
      current.textContent = entry.title || '(untitled)';
      bc.appendChild(current);

      view.appendChild(bc);
    }
  }

  // Archetype-dispatched body rendering.
  // For text/textlog (markdown-capable) presenters, pass assets + MIME
  // map + name map so both `![alt](asset:key)` image embeds and
  // `[label](asset:key)` non-image chips can be resolved.
  const presenter = getPresenter(entry.archetype);
  if (entry.archetype === 'attachment' && container?.assets) {
    view.appendChild(presenter.renderBody(entry, container.assets));
  } else if (container?.assets) {
    const mimeByKey = buildAssetMimeMap(container);
    const nameByKey = buildAssetNameMap(container);
    // `container.entries` is passed so text-like presenters can expand
    // `![](entry:...)` transclusions (P1 Slice 5-B). Non-text presenters
    // (attachment / folder / todo / form) ignore this 5th argument.
    view.appendChild(presenter.renderBody(entry, container.assets, mimeByKey, nameByKey, container.entries));
  } else {
    view.appendChild(presenter.renderBody(entry));
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
  if (searchQuery.trim() !== '') {
    highlightMatchesIn(view, searchQuery);
  }

  return view;
}

/** Right pane: meta information — tags, relations, history, move-to-folder. */
function renderMetaPane(entry: Entry, canEdit: boolean, container: Container | null): HTMLElement {
  const meta = createElement('aside', 'pkc-meta-pane');
  meta.setAttribute('data-pkc-region', 'meta');

  // Entry info header
  const infoHeader = createElement('div', 'pkc-meta-header');
  infoHeader.textContent = `${archetypeIcon(entry.archetype)} ${archetypeLabel(entry.archetype)}`;
  meta.appendChild(infoHeader);

  // Created / Updated timestamps
  const timestamps = createElement('div', 'pkc-meta-timestamps');
  const created = createElement('div', 'pkc-meta-ts');
  created.textContent = `Created: ${formatTimestamp(entry.created_at)}`;
  timestamps.appendChild(created);
  const updated = createElement('div', 'pkc-meta-ts');
  updated.textContent = `Updated: ${formatTimestamp(entry.updated_at)}`;
  timestamps.appendChild(updated);
  meta.appendChild(timestamps);

  // Table of Contents (TEXT / TEXTLOG with h1–h3 headings).
  // Hidden entirely when the body produces zero headings, per spec §4.
  const tocSection = renderTocSection(entry);
  if (tocSection) meta.appendChild(tocSection);

  if (!container) return meta;

  // Tags section
  const tags = getTagsForEntry(container.relations, container.entries, entry.lid);
  const tagSection = createElement('div', 'pkc-tags');
  tagSection.setAttribute('data-pkc-region', 'tags');

  const tagHeading = createElement('span', 'pkc-tags-label');
  tagHeading.textContent = 'Tags';
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

  if (canEdit) {
    const available = getAvailableTagTargets(container.relations, getUserEntries(container.entries), entry.lid);
    if (available.length > 0) {
      const addForm = createElement('span', 'pkc-tag-add');
      addForm.setAttribute('data-pkc-region', 'tag-add');
      addForm.setAttribute('data-pkc-from', entry.lid);

      const select = document.createElement('select');
      select.setAttribute('data-pkc-field', 'tag-target');
      select.className = 'pkc-tag-select';
      const defaultOpt = document.createElement('option');
      defaultOpt.value = '';
      defaultOpt.textContent = '+ Tag';
      select.appendChild(defaultOpt);
      for (const e of available) {
        const opt = document.createElement('option');
        opt.value = e.lid;
        opt.textContent = e.title || `(${e.lid})`;
        select.appendChild(opt);
      }
      addForm.appendChild(select);

      const addBtn = createElement('button', 'pkc-btn-small');
      addBtn.setAttribute('data-pkc-action', 'add-tag');
      addBtn.setAttribute('title', 'Add a tag to this entry');
      addBtn.textContent = 'Add';
      addForm.appendChild(addBtn);

      tagSection.appendChild(addForm);
    }
  }

  meta.appendChild(tagSection);

  // Move to Folder
  if (canEdit) {
    const folders = getAvailableFolders(container.entries, container.relations, entry.lid);
    const moveSection = createElement('div', 'pkc-move-to-folder');
    moveSection.setAttribute('data-pkc-region', 'move-to-folder');
    moveSection.setAttribute('data-pkc-lid', entry.lid);

    const moveLabel = createElement('span', 'pkc-move-label');
    moveLabel.textContent = 'Folder';
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

    const noneOpt = document.createElement('option');
    noneOpt.value = '';
    noneOpt.textContent = currentParent ? '↑ Root level' : '(root)';
    if (!currentParent) noneOpt.selected = true;
    select.appendChild(noneOpt);

    for (const f of folders) {
      const opt = document.createElement('option');
      opt.value = f.lid;
      opt.textContent = f.title || `(${f.lid})`;
      if (currentParent && currentParent.lid === f.lid) opt.selected = true;
      select.appendChild(opt);
    }
    moveSection.appendChild(select);

    const moveBtn = createElement('button', 'pkc-btn-small');
    moveBtn.setAttribute('data-pkc-action', 'move-to-folder');
    moveBtn.setAttribute('title', 'Move this entry to the selected folder');
    moveBtn.textContent = 'Move';
    moveSection.appendChild(moveBtn);

    meta.appendChild(moveSection);
  }

  // History section
  const revCount = getRevisionCount(container, entry.lid);
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
    summary.textContent = `Revision history (${revsDesc.length})`;
    picker.appendChild(summary);

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

      picker.appendChild(row);
    });

    meta.appendChild(picker);
  }

  // Relations section
  const directed = getRelationsForEntry(container.relations, entry.lid);
  const resolved = resolveRelations(directed, container.entries);
  const outbound = resolved.filter((r) => r.direction === 'outbound');
  const inbound = resolved.filter((r) => r.direction === 'inbound');

  if (outbound.length > 0 || inbound.length > 0) {
    const relSection = createElement('div', 'pkc-relations');
    relSection.setAttribute('data-pkc-region', 'relations');

    if (outbound.length > 0) {
      relSection.appendChild(renderRelationGroup('Outbound', outbound));
    }
    if (inbound.length > 0) {
      relSection.appendChild(renderRelationGroup('Inbound', inbound));
    }

    meta.appendChild(relSection);
  }

  if (canEdit && container.entries.length > 1) {
    meta.appendChild(renderRelationCreateForm(entry.lid, getUserEntries(container.entries)));
  }

  // Sandbox control section for HTML attachments
  if (entry.archetype === 'attachment') {
    const att = parseAttachmentBody(entry.body);
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

  // Link-index sections (C-3 v1): outgoing / backlinks / broken for the
  // selected entry. Runtime-only; derived at render time from container.
  const linkIndex = buildLinkIndex(container);
  meta.appendChild(renderLinkIndexSections(entry, linkIndex, container));

  return meta;
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

  const titleByLid = new Map<string, string>();
  for (const e of container.entries) titleByLid.set(e.lid, e.title);

  wrap.appendChild(
    renderLinkRefsSection('Outgoing links', 'link-index-outgoing', outgoing, titleByLid, 'target'),
  );
  wrap.appendChild(
    renderLinkRefsSection('Backlinks', 'link-index-backlinks', backlinks, titleByLid, 'source'),
  );
  wrap.appendChild(
    renderLinkRefsSection('Broken links', 'link-index-broken', brokenForEntry, titleByLid, 'target'),
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

  const heading = createElement('div', 'pkc-link-index-heading');
  heading.textContent = `${label} (${refs.length})`;
  section.appendChild(heading);

  if (refs.length === 0) {
    const empty = createElement('div', 'pkc-link-index-empty');
    empty.textContent =
      regionId === 'link-index-outgoing'
        ? 'No outgoing links.'
        : regionId === 'link-index-backlinks'
        ? 'No backlinks.'
        : 'No broken links.';
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
  label.textContent = 'Contents';
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
  relations: { relation: { id: string; kind: string }; direction: string; peer: Entry }[],
): HTMLElement {
  const group = createElement('div', 'pkc-relation-group');
  group.setAttribute('data-pkc-relation-direction', label.toLowerCase());

  const heading = createElement('div', 'pkc-relation-heading');
  heading.textContent = `${label} (${relations.length})`;
  group.appendChild(heading);

  const list = createElement('ul', 'pkc-relation-list');
  for (const r of relations) {
    const item = createElement('li', 'pkc-relation-item');
    item.setAttribute('data-pkc-relation-id', r.relation.id);

    const link = createElement('span', 'pkc-relation-peer');
    link.setAttribute('data-pkc-action', 'select-entry');
    link.setAttribute('data-pkc-lid', r.peer.lid);
    link.textContent = r.peer.title || '(untitled)';
    item.appendChild(link);

    const kindBadge = createElement('span', 'pkc-relation-kind');
    kindBadge.textContent = r.relation.kind;
    item.appendChild(kindBadge);

    list.appendChild(item);
  }
  group.appendChild(list);
  return group;
}

function renderRelationCreateForm(fromLid: string, entries: readonly Entry[]): HTMLElement {
  const form = createElement('div', 'pkc-relation-create');
  form.setAttribute('data-pkc-region', 'relation-create');
  form.setAttribute('data-pkc-from', fromLid);

  const heading = createElement('div', 'pkc-relation-create-heading');
  heading.textContent = 'Add Relation';
  form.appendChild(heading);

  const row = createElement('div', 'pkc-relation-create-row');

  // Target entry select
  const targetSelect = document.createElement('select');
  targetSelect.setAttribute('data-pkc-field', 'relation-target');
  targetSelect.className = 'pkc-relation-select';
  const defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.textContent = '-- Target --';
  targetSelect.appendChild(defaultOpt);
  for (const e of entries) {
    if (e.lid === fromLid) continue;
    const opt = document.createElement('option');
    opt.value = e.lid;
    opt.textContent = e.title || `(${e.lid})`;
    targetSelect.appendChild(opt);
  }
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

  // Archetype-dispatched editor body
  const presenter = getPresenter(entry.archetype);
  const editorBody = presenter.renderEditorBody(entry);
  editor.appendChild(editorBody);

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

  const confirmBtn = createElement('button', 'pkc-btn-danger');
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

function renderPendingOffers(offers: PendingOffer[]): HTMLElement {
  const bar = createElement('div', 'pkc-pending-offers');
  bar.setAttribute('data-pkc-region', 'pending-offers');

  const label = createElement('span', 'pkc-pending-label');
  label.textContent = `${offers.length} pending offer${offers.length > 1 ? 's' : ''}`;
  bar.appendChild(label);

  for (const offer of offers) {
    const item = createElement('div', 'pkc-pending-item');
    item.setAttribute('data-pkc-offer-id', offer.offer_id);

    const title = createElement('span', 'pkc-pending-title');
    title.textContent = offer.title || '(untitled)';
    item.appendChild(title);

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

function renderArchetypeFilter(current: ReadonlySet<ArchetypeId>, expanded: boolean): HTMLElement {
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

  // Primary group — always visible
  const primaryGroup = createElement('div', 'pkc-filter-group');
  primaryGroup.setAttribute('data-pkc-filter-group', 'primary');
  for (const archetype of ARCHETYPE_FILTER_PRIMARY) {
    const btn = createElement('button', 'pkc-filter-btn');
    btn.setAttribute('data-pkc-action', 'toggle-archetype-filter');
    btn.setAttribute('data-pkc-archetype', archetype);
    btn.textContent = archetypeLabel(archetype);
    if (current.has(archetype)) {
      btn.setAttribute('data-pkc-active', 'true');
    }
    primaryGroup.appendChild(btn);
  }
  bar.appendChild(primaryGroup);

  // Expand toggle
  const expandBtn = createElement('button', 'pkc-filter-expand');
  expandBtn.setAttribute('data-pkc-action', 'toggle-archetype-filter-expanded');
  expandBtn.setAttribute('data-pkc-expanded', expanded ? 'true' : 'false');
  expandBtn.textContent = expanded ? '▲' : '▼';
  bar.appendChild(expandBtn);

  // Secondary group — shown when expanded
  const secondaryGroup = createElement('div', 'pkc-filter-group');
  secondaryGroup.setAttribute('data-pkc-filter-group', 'secondary');
  secondaryGroup.setAttribute('data-pkc-visible', expanded ? 'true' : 'false');
  for (const archetype of ARCHETYPE_FILTER_SECONDARY) {
    const btn = createElement('button', 'pkc-filter-btn');
    btn.setAttribute('data-pkc-action', 'toggle-archetype-filter');
    btn.setAttribute('data-pkc-archetype', archetype);
    btn.textContent = archetypeLabel(archetype);
    if (current.has(archetype)) {
      btn.setAttribute('data-pkc-active', 'true');
    }
    secondaryGroup.appendChild(btn);
  }
  bar.appendChild(secondaryGroup);

  return bar;
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
    const att = parseAttachmentBody(entry.body);
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
    const att = parseAttachmentBody(entry.body);
    if (att.asset_key && att.name) {
      map[att.asset_key] = att.name;
    }
  }
  return map;
}

function renderFolderContents(folder: Entry, container: Container): HTMLElement {
  const section = createElement('div', 'pkc-folder-contents');
  section.setAttribute('data-pkc-region', 'folder-contents');

  const heading = createElement('div', 'pkc-folder-contents-heading');
  heading.textContent = 'Contents';
  section.appendChild(heading);

  // Find children via structural relations
  const children: Entry[] = [];
  for (const r of container.relations) {
    if (r.kind === 'structural' && r.from === folder.lid) {
      const child = container.entries.find((e) => e.lid === r.to);
      if (child) children.push(child);
    }
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
  const selected = state.container.entries.find((e) => e.lid === state.selectedLid);
  if (!selected) return null;

  if (selected.archetype === 'folder') return selected;

  // Check if the selected entry has a structural parent (folder)
  const parent = getStructuralParent(state.container.relations, state.container.entries, state.selectedLid);
  return parent ?? null;
}

function renderAboutView(aboutEntry: Entry | undefined): HTMLElement {
  const container = createElement('div', 'pkc-about-view');
  container.setAttribute('data-pkc-region', 'about-view');

  const payload = resolveAboutPayload(aboutEntry?.body);

  const title = createElement('h1', 'pkc-about-title');
  title.textContent = 'PKC2';
  container.appendChild(title);

  const version = createElement('div', 'pkc-about-version');
  version.textContent = `v${payload.version}`;
  container.appendChild(version);

  const desc = createElement('div', 'pkc-about-description');
  const traits: string[] = [];
  if (payload.runtime.offline) traits.push('Offline');
  if (payload.runtime.bundled) traits.push('Bundled');
  if (!payload.runtime.externalDependencies) traits.push('No external dependencies');
  desc.textContent = traits.join(' / ');
  container.appendChild(desc);

  const buildInfo = createElement('div', 'pkc-about-build');
  buildInfo.textContent = `Built at ${payload.build.timestamp} from commit ${payload.build.commit}`;
  container.appendChild(buildInfo);

  if (payload.modules.length > 0) {
    const modSection = createElement('div', 'pkc-about-modules');
    const modTitle = createElement('h3', 'pkc-about-section-title');
    modTitle.textContent = 'Modules';
    modSection.appendChild(modTitle);

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
    for (const mod of payload.modules) {
      const row = document.createElement('tr');
      for (const val of [mod.name, mod.version, mod.license]) {
        const td = document.createElement('td');
        td.textContent = val;
        row.appendChild(td);
      }
      tbody.appendChild(row);
    }
    table.appendChild(tbody);
    modSection.appendChild(table);
    container.appendChild(modSection);
  }

  const license = createElement('div', 'pkc-about-license');
  if (payload.license.url) {
    const a = document.createElement('a');
    a.href = payload.license.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = `License: ${payload.license.name}`;
    license.appendChild(a);
  } else {
    license.textContent = `License: ${payload.license.name}`;
  }
  container.appendChild(license);

  const author = createElement('div', 'pkc-about-author');
  if (payload.author.url) {
    const a = document.createElement('a');
    a.href = payload.author.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = `Author: ${payload.author.name}`;
    author.appendChild(a);
  } else {
    author.textContent = `Author: ${payload.author.name}`;
  }
  container.appendChild(author);

  return container;
}

function findSelectedEntry(state: AppState): Entry | null {
  if (!state.selectedLid || !state.container) return null;
  return state.container.entries.find((e) => e.lid === state.selectedLid) ?? null;
}

/**
 * Format an ISO timestamp for display.
 * Shows date and time in a compact human-readable form.
 */
function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const date = d.toISOString().slice(0, 10); // YYYY-MM-DD
    const time = d.toISOString().slice(11, 16); // HH:MM
    return `${date} ${time}`;
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
  };

  const isPreviewable = opts.archetype === 'text' || opts.archetype === 'textlog';
  const isSandboxable = opts.archetype === 'attachment';
  const hasFolders = !!(opts.folders && opts.folders.length > 0);

  const items: Item[] = [
    // Mutating actions — gated on canEdit.
    { action: 'begin-edit', label: '✏️ Edit', tip: 'このエントリを編集', lid, show: canEdit },
    { action: 'ctx-preview', label: '👁️ Preview', tip: 'レンダリング済みプレビューを新しいウィンドウで開く', lid, show: isPreviewable || isSandboxable },
    { action: 'ctx-sandbox-run', label: '🔒 Sandbox', tip: 'サンドボックス環境で安全に開く（HTML/SVG）', lid, show: isSandboxable },
    { action: 'delete-entry', label: '🗑️ Delete', tip: 'このエントリを完全に削除（元に戻せません）', lid, show: canEdit },
    { action: 'delete-log-entry', label: '✕ Delete log', tip: 'このログ行を削除', lid, logId: opts.logId, show: canEdit && !!(opts.archetype === 'textlog' && opts.logId) },
    { action: 'ctx-move-to-root', label: '↑ Move to Root', tip: '現在のフォルダから取り出してルートに移動', lid, show: canEdit && hasParent },
    // Reference-string actions — never mutate, always shown.
    {
      action: 'copy-entry-ref',
      label: '🔗 Entry ref',
      tip: 'このエントリへの Markdown リンクをコピー [title](entry:lid)',
      lid,
      show: true,
    },
    {
      action: 'copy-entry-embed-ref',
      label: '🖼️ Embed ref',
      tip: 'このエントリの埋め込み参照をコピー',
      lid,
      show: true,
    },
    {
      action: 'copy-asset-ref',
      label: '📎 Asset ref',
      tip: 'この添付ファイルへの Markdown 参照をコピー ![name](asset:key)',
      lid,
      show: opts.archetype === 'attachment',
    },
    {
      action: 'copy-log-line-ref',
      label: '📝 Log ref',
      tip: 'このログ行への Markdown リンクをコピー',
      lid,
      logId: opts.logId,
      show: !!(opts.archetype === 'textlog' && opts.logId),
    },
  ];

  for (const item of items) {
    if (!item.show) continue;
    const btn = createElement('button', 'pkc-context-menu-item');
    btn.setAttribute('data-pkc-action', item.action);
    btn.setAttribute('title', item.tip);
    if (item.lid) btn.setAttribute('data-pkc-lid', item.lid);
    if (item.logId) btn.setAttribute('data-pkc-log-id', item.logId);
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
    label.textContent = 'Drop a file here to attach';
    zone.appendChild(label);

    if (contextFolder) {
      const ctx = createElement('div', 'pkc-drop-zone-context');
      ctx.textContent = `→ ${contextFolder.title || '(untitled)'}`;
      zone.appendChild(ctx);
    }

    // Also show the "or create" hint
    const hint = createElement('div', 'pkc-drop-zone-hint');
    hint.textContent = state.container?.entries?.length
      ? 'or select an entry from the sidebar'
      : 'or use the + buttons above to create an entry';
    zone.appendChild(hint);
  } else {
    const label = createElement('span', 'pkc-drop-zone-label');
    label.textContent = '📎 Drop file to attach';
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
      content.appendChild(presenter.renderBody(entry, container.assets, mimeByKey, nameByKey, container.entries));
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
  const att = parseAttachmentBody(entry.body);

  if (!att.name) {
    const empty = createElement('div', 'pkc-attachment-empty');
    empty.textContent = 'No file attached. Edit this entry to add a file, or drop one into the center pane.';
    root.appendChild(empty);
    return root;
  }

  // File info
  const info = createElement('div', 'pkc-detached-attachment-info');
  info.textContent = `${att.name} — ${att.mime}${att.size ? ` (${formatFileSize(att.size)})` : ''}`;
  root.appendChild(info);

  // Check data availability
  const hasData = !!(att.data || (att.asset_key && container?.assets?.[att.asset_key]));
  const previewType = classifyPreviewType(att.mime);

  if (previewType !== 'none' && hasData) {
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

  if (hasData) {
    const dlBtn = createElement('button', 'pkc-btn');
    dlBtn.setAttribute('data-pkc-action', 'download-attachment');
    dlBtn.setAttribute('data-pkc-lid', entry.lid);
    dlBtn.setAttribute('title', `Download ${att.name}`);
    dlBtn.textContent = `📥 Download ${att.name}`;
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
