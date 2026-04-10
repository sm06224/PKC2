import type { AppState } from '../state/app-state';
import type { Entry } from '../../core/model/record';
import type { Container } from '../../core/model/container';
import type { PendingOffer } from '../transport/record-offer-handler';
import type { ImportPreviewRef } from '../../core/action/system-command';
import { CAPABILITIES, VERSION } from '../../runtime/release-meta';
import {
  getRevisionCount,
  getLatestRevision,
  getRestoreCandidates,
  parseRevisionSnapshot,
} from '../../core/operations/container-ops';
import type { ArchetypeId } from '../../core/model/record';
import { applyFilters } from '../../features/search/filter';
import { sortEntries } from '../../features/search/sort';
import type { SortKey, SortDirection } from '../../features/search/sort';
import { getRelationsForEntry, resolveRelations } from '../../features/relation/selector';
import { getTagsForEntry, getAvailableTagTargets } from '../../features/relation/tag-selector';
import { filterByTag } from '../../features/relation/tag-filter';
import { buildTree, getBreadcrumb, getAvailableFolders, getStructuralParent } from '../../features/relation/tree';
import type { TreeNode } from '../../features/relation/tree';
import type { RelationKind } from '../../core/model/relation';
import { getPresenter } from './detail-presenter';
import { parseTodoBody, formatTodoDate, isTodoPastDue } from './todo-presenter';
import { parseAttachmentBody, classifyPreviewType, isHtml, isSvg, SANDBOX_ATTRIBUTES, SANDBOX_DESCRIPTIONS } from './attachment-presenter';
import { groupTodosByDate, getMonthGrid, dateKey, monthName } from '../../features/calendar/calendar-data';
import { groupTodosByStatus, KANBAN_COLUMNS } from '../../features/kanban/kanban-data';
import { collectOrphanAssetKeys } from '../../features/asset/asset-scan';
import { renderMarkdown, hasMarkdownSyntax } from '../../features/markdown/markdown-render';
import { resolveAssetReferences, hasAssetReferences } from '../../features/markdown/asset-resolver';

/** Archetype options for the filter bar. Single source of truth. */
const ARCHETYPE_FILTER_OPTIONS: readonly (ArchetypeId | null)[] = [
  null, 'text', 'textlog', 'todo', 'form', 'attachment', 'folder', 'generic', 'opaque',
] as const;

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
};

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
  root.innerHTML = '';
  root.setAttribute('data-pkc-phase', state.phase);
  root.setAttribute('data-pkc-embedded', String(state.embedded));
  root.setAttribute('data-pkc-readonly', String(state.readonly));
  root.setAttribute('data-pkc-capabilities', CAPABILITIES.join(','));

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
    shell.appendChild(renderImportConfirmation(state.importPreview));
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

  // Main area: sidebar + resize-handle + center + resize-handle + meta (3-pane)
  const main = createElement('div', 'pkc-main');

  // Left tray bar (shown when sidebar is collapsed)
  const leftTray = createElement('div', 'pkc-tray-bar');
  leftTray.setAttribute('data-pkc-action', 'toggle-sidebar');
  leftTray.setAttribute('title', 'Click to expand sidebar');
  leftTray.textContent = 'SIDEBAR';
  leftTray.style.display = 'none';
  leftTray.setAttribute('data-pkc-region', 'tray-left');
  main.appendChild(leftTray);

  // Left pane: entry list / tree / search / filters
  const sidebar = renderSidebar(state);
  main.appendChild(sidebar);

  // Resize handle: sidebar ↔ center
  const leftHandle = createElement('div', 'pkc-resize-handle');
  leftHandle.setAttribute('data-pkc-resize', 'left');
  main.appendChild(leftHandle);

  // Center pane: content view/edit + fixed action bar
  main.appendChild(renderCenter(state));

  // Right pane: meta information (tags, relations, history, move)
  const selected = findSelectedEntry(state);
  if (selected) {
    // Resize handle: center ↔ meta
    const rightHandle = createElement('div', 'pkc-resize-handle');
    rightHandle.setAttribute('data-pkc-resize', 'right');
    main.appendChild(rightHandle);

    const canEdit = state.phase === 'ready' && !state.readonly;
    main.appendChild(renderMetaPane(selected, canEdit, state.container));
  }

  // Right tray bar (shown when meta pane is collapsed)
  const rightTray = createElement('div', 'pkc-tray-bar pkc-tray-bar-right');
  rightTray.setAttribute('data-pkc-action', 'toggle-meta');
  rightTray.setAttribute('title', 'Click to expand meta pane');
  rightTray.textContent = 'META';
  rightTray.style.display = 'none';
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

  // Shortcuts
  const shortcutSection = createElement('div', 'pkc-shell-menu-section');
  const shortcutBtn = createElement('button', 'pkc-btn-small');
  shortcutBtn.setAttribute('data-pkc-action', 'show-shortcut-help');
  shortcutBtn.textContent = '⌨ Keyboard Shortcuts';
  shortcutSection.appendChild(shortcutBtn);
  card.appendChild(shortcutSection);

  // Data Maintenance — manual orphan asset cleanup.
  //
  // This section is intentionally passive until the user clicks:
  // the orphan count is just a read-only scan of the current
  // container, the cleanup button disables itself when there is
  // nothing to do, and the whole surface is hidden in readonly /
  // container-absent modes where mutation is not allowed.
  //
  // No auto-GC is wired anywhere — this button is the ONLY way an
  // orphan asset gets removed from the container today.
  if (state.container && !state.readonly) {
    card.appendChild(renderShellMenuMaintenance(state.container));
  }

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
    { key: '?', desc: 'Toggle this help' },
    { key: 'Ctrl+Click / ⌘+Click', desc: 'Toggle multi-select' },
    { key: 'Shift+Click', desc: 'Range select' },
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
  closeBtn.textContent = 'Close (Esc / ?)';
  card.appendChild(closeBtn);

  overlay.appendChild(card);
  return overlay;
}

function renderExportImportInline(state: AppState): HTMLElement {
  const group = createElement('div', 'pkc-eip-inline');
  group.setAttribute('data-pkc-region', 'export-import-panel');

  const sep1 = createElement('span', 'pkc-eip-sep');
  sep1.textContent = '|';
  group.appendChild(sep1);

  // Export Full (editable) — most common
  const exportBtn = createElement('button', 'pkc-btn pkc-btn-create');
  exportBtn.setAttribute('data-pkc-action', 'begin-export');
  exportBtn.setAttribute('data-pkc-export-mode', 'full');
  exportBtn.setAttribute('data-pkc-export-mutability', 'editable');
  exportBtn.setAttribute('title', 'Export complete HTML (editable, all data)');
  exportBtn.textContent = 'Export';
  group.appendChild(exportBtn);

  // Export Light (editable)
  const lightBtn = createElement('button', 'pkc-btn pkc-btn-create');
  lightBtn.setAttribute('data-pkc-action', 'begin-export');
  lightBtn.setAttribute('data-pkc-export-mode', 'light');
  lightBtn.setAttribute('data-pkc-export-mutability', 'editable');
  lightBtn.setAttribute('title', 'Export text-only HTML (no attachments)');
  lightBtn.textContent = 'Light';
  group.appendChild(lightBtn);

  // ZIP Export
  const zipBtn = createElement('button', 'pkc-btn pkc-btn-create');
  zipBtn.setAttribute('data-pkc-action', 'export-zip');
  zipBtn.setAttribute('title', 'Export as ZIP package (.pkc2.zip)');
  zipBtn.textContent = 'ZIP';
  group.appendChild(zipBtn);

  // Container-wide TEXTLOG export — only shown when the container
  // has at least one textlog entry. Bundles all textlogs into a
  // single .textlogs.zip containing individual .textlog.zip files.
  const hasTextlogs = state.container?.entries.some((e) => e.archetype === 'textlog');
  if (hasTextlogs) {
    const textlogsBtn = createElement('button', 'pkc-btn pkc-btn-create');
    textlogsBtn.setAttribute('data-pkc-action', 'export-textlogs-container');
    textlogsBtn.setAttribute('title', 'Export all TEXTLOGs as a single ZIP bundle (.textlogs.zip)');
    textlogsBtn.textContent = 'TEXTLOGs';
    group.appendChild(textlogsBtn);
  }

  const sep2 = createElement('span', 'pkc-eip-sep');
  sep2.textContent = '|';
  group.appendChild(sep2);

  // Import
  const importBtn = createElement('button', 'pkc-btn pkc-btn-create');
  importBtn.setAttribute('data-pkc-action', 'begin-import');
  importBtn.setAttribute('title', 'Import from HTML or ZIP');
  importBtn.textContent = 'Import';
  group.appendChild(importBtn);

  // Import textlog bundle (Issue H) — additive: adds one new
  // textlog entry plus its attachments to the current container.
  // Distinct from `begin-import` (which replaces the whole
  // container). Hidden in readonly mode by the action handler;
  // the button itself is always rendered to keep the toolbar
  // shape stable.
  const importTextlogBtn = createElement('button', 'pkc-btn pkc-btn-create');
  importTextlogBtn.setAttribute('data-pkc-action', 'import-textlog-bundle');
  importTextlogBtn.setAttribute('title', 'Import a textlog bundle (.textlog.zip) as a new entry');
  importTextlogBtn.textContent = '📥 Import Textlog';
  group.appendChild(importTextlogBtn);

  // Import text bundle — sister to Import Textlog, sharing the same
  // additive semantics. Format spec is pinned in
  // docs/development/text-markdown-zip-export.md. Readonly handling
  // matches the textlog path: the button is always rendered for
  // shape stability, the action handler bails out.
  const importTextBtn = createElement('button', 'pkc-btn pkc-btn-create');
  importTextBtn.setAttribute('data-pkc-action', 'import-text-bundle');
  importTextBtn.setAttribute('title', 'Import a text bundle (.text.zip) as a new entry');
  importTextBtn.textContent = '📥 Import Text';
  group.appendChild(importTextBtn);

  const sep3 = createElement('span', 'pkc-eip-sep');
  sep3.textContent = '|';
  group.appendChild(sep3);

  // Clear local data (workspace reset) — destructive, positioned after separator
  const clearBtn = createElement('button', 'pkc-btn pkc-btn-danger');
  clearBtn.setAttribute('data-pkc-action', 'clear-local-data');
  clearBtn.setAttribute('title', 'WARNING: Clears all locally saved data (IndexedDB). This cannot be undone.');
  clearBtn.textContent = '⚠ Reset';
  group.appendChild(clearBtn);

  return group;
}

function renderSidebar(state: AppState): HTMLElement {
  const sidebar = createElement('aside', 'pkc-sidebar');
  sidebar.setAttribute('data-pkc-region', 'sidebar');

  const allEntries = state.container?.entries ?? [];

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

    if (state.searchQuery !== '' || state.archetypeFilter !== null) {
      const clearBtn = createElement('button', 'pkc-btn-clear');
      clearBtn.setAttribute('data-pkc-action', 'clear-filters');
      clearBtn.setAttribute('title', 'Clear search and filters');
      clearBtn.textContent = '×';
      searchRow.appendChild(clearBtn);
    }

    sidebar.appendChild(searchRow);

    // Archetype filter bar
    sidebar.appendChild(renderArchetypeFilter(state.archetypeFilter));

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
  const entries = sortEntries(filtered, state.sortKey, state.sortDirection);

  // Result count (shown when any filter is active)
  if (allEntries.length > 0 && (state.searchQuery !== '' || state.archetypeFilter !== null || state.tagFilter !== null)) {
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
    return sidebar;
  }

  if (entries.length === 0) {
    const empty = createElement('div', 'pkc-empty pkc-guidance');
    empty.setAttribute('data-pkc-region', 'empty-guidance');
    empty.textContent = 'No matching entries. Try adjusting your search or filters.';
    sidebar.appendChild(empty);
    return sidebar;
  }

  const list = createElement('ul', 'pkc-entry-list');
  const hasActiveFilter = state.searchQuery !== '' || state.archetypeFilter !== null || state.tagFilter !== null;

  if (hasActiveFilter || !state.container) {
    // Flat mode when filters are active (tree doesn't make sense for search results)
    for (const entry of entries) {
      list.appendChild(renderEntryItem(entry, state));
    }
  } else {
    // Tree mode: build from structural relations
    const tree = buildTree(entries, state.container.relations);
    for (const node of tree) {
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

        details.appendChild(item);
      }

      sidebar.appendChild(details);
    }
  }

  return sidebar;
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

  return li;
}

function renderCenter(state: AppState): HTMLElement {
  const center = createElement('section', 'pkc-center');
  center.setAttribute('data-pkc-region', 'center');

  // View mode toggle (always visible when container has entries)
  if (state.container && state.container.entries.length > 0) {
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

  if (!selected) {
    if (canEdit) {
      // Large drop zone invitation when nothing is selected
      const dropInvite = renderDropZone(state, true);
      center.appendChild(dropInvite);
    } else {
      const placeholder = createElement('div', 'pkc-empty pkc-guidance');
      placeholder.setAttribute('data-pkc-region', 'center-guidance');
      if (state.readonly) {
        placeholder.textContent = state.container?.entries?.length
          ? 'Select an entry from the sidebar to view it here.'
          : 'This container has no entries.';
      } else {
        placeholder.textContent = state.container?.entries?.length
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
    content.appendChild(renderView(selected, canEdit, state.container));
  }

  // Compact drop zone strip when viewing an entry (not editing)
  if (canEdit && state.phase !== 'editing') {
    content.appendChild(renderDropZone(state, false));
  }

  center.appendChild(content);

  // Fixed action bar at bottom
  center.appendChild(renderActionBar(selected, state.phase, canEdit));

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
function renderActionBar(entry: Entry, phase: string, canEdit: boolean): HTMLElement {
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

    // Markdown / rich copy + rendered viewer actions for TEXT / TEXTLOG.
    // Always visible in the `ready` phase (including readonly) since
    // none of these buttons mutate state — they only read the current
    // entry body and hand it off to the clipboard or to a new window.
    if (entry.archetype === 'text' || entry.archetype === 'textlog') {
      const copyMdBtn = createElement('button', 'pkc-btn pkc-action-copy-md');
      copyMdBtn.setAttribute('data-pkc-action', 'copy-markdown-source');
      copyMdBtn.setAttribute('data-pkc-lid', entry.lid);
      copyMdBtn.setAttribute('title', 'Copy the raw markdown source to the clipboard');
      copyMdBtn.textContent = '📋 Copy MD';
      bar.appendChild(copyMdBtn);

      const copyRichBtn = createElement('button', 'pkc-btn pkc-action-copy-rich');
      copyRichBtn.setAttribute('data-pkc-action', 'copy-rich-markdown');
      copyRichBtn.setAttribute('data-pkc-lid', entry.lid);
      copyRichBtn.setAttribute(
        'title',
        'Copy both the markdown source and the rendered HTML (paste into rich editors)',
      );
      copyRichBtn.textContent = '🎨 Copy Rendered';
      bar.appendChild(copyRichBtn);

      const viewerBtn = createElement('button', 'pkc-btn pkc-action-rendered-viewer');
      viewerBtn.setAttribute('data-pkc-action', 'open-rendered-viewer');
      viewerBtn.setAttribute('data-pkc-lid', entry.lid);
      viewerBtn.setAttribute('title', 'Open a rendered, print-friendly view in a new window');
      viewerBtn.textContent = '📖 Open Viewer';
      bar.appendChild(viewerBtn);
    }

    // TEXTLOG-only: download a portable CSV+ZIP bundle of the log
    // and its referenced assets. Format spec is pinned in
    // docs/development/textlog-csv-zip-export.md. Always visible
    // (including readonly) — export does not mutate state.
    //
    // Issue G: the export button is paired with a "compact" checkbox
    // that, when checked, tells the bundle builder to strip broken
    // asset references from the CSV output. The checkbox is scoped
    // per-entry by data-pkc-lid so multiple open detail views don't
    // leak state between each other.
    if (entry.archetype === 'textlog') {
      const compactLabel = createElement('label', 'pkc-action-export-compact-label');
      compactLabel.setAttribute('title',
        'Compact mode: strip broken asset references from the exported CSV.' +
        ' The live textlog is never modified.');
      const compactInput = createElement('input', 'pkc-action-export-compact-input');
      (compactInput as HTMLInputElement).type = 'checkbox';
      compactInput.setAttribute('data-pkc-control', 'textlog-export-compact');
      compactInput.setAttribute('data-pkc-lid', entry.lid);
      compactLabel.appendChild(compactInput);
      compactLabel.appendChild(document.createTextNode(' compact'));
      bar.appendChild(compactLabel);

      const exportBtn = createElement('button', 'pkc-btn pkc-action-export-textlog');
      exportBtn.setAttribute('data-pkc-action', 'export-textlog-csv-zip');
      exportBtn.setAttribute('data-pkc-lid', entry.lid);
      exportBtn.setAttribute(
        'title',
        'Download this textlog as a CSV + assets ZIP bundle for sharing outside PKC2',
      );
      exportBtn.textContent = '📦 Export CSV+ZIP';
      bar.appendChild(exportBtn);
    }

    // TEXT-only: sister format to the textlog bundle — single-body
    // markdown + assets, spec frozen in
    // docs/development/text-markdown-zip-export.md. Same "compact"
    // checkbox shape as textlog so broken asset references can be
    // stripped from body.md without touching the live entry.
    if (entry.archetype === 'text') {
      const compactLabel = createElement('label', 'pkc-action-export-compact-label');
      compactLabel.setAttribute('title',
        'Compact mode: strip broken asset references from the exported body.md.' +
        ' The live text entry is never modified.');
      const compactInput = createElement('input', 'pkc-action-export-compact-input');
      (compactInput as HTMLInputElement).type = 'checkbox';
      compactInput.setAttribute('data-pkc-control', 'text-export-compact');
      compactInput.setAttribute('data-pkc-lid', entry.lid);
      compactLabel.appendChild(compactInput);
      compactLabel.appendChild(document.createTextNode(' compact'));
      bar.appendChild(compactLabel);

      const exportBtn = createElement('button', 'pkc-btn pkc-action-export-text');
      exportBtn.setAttribute('data-pkc-action', 'export-text-zip');
      exportBtn.setAttribute('data-pkc-lid', entry.lid);
      exportBtn.setAttribute(
        'title',
        'Download this text entry as a markdown + assets ZIP bundle for sharing outside PKC2',
      );
      exportBtn.textContent = '📦 Export .text.zip';
      bar.appendChild(exportBtn);
    }
  }

  // Entry info badge
  const info = createElement('span', 'pkc-action-bar-info');
  info.textContent = `${archetypeIcon(entry.archetype)} ${archetypeLabel(entry.archetype)}`;
  bar.appendChild(info);

  return bar;
}

function renderView(entry: Entry, _canEdit: boolean, container: Container | null): HTMLElement {
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
    view.appendChild(presenter.renderBody(entry, container.assets, mimeByKey, nameByKey));
  } else {
    view.appendChild(presenter.renderBody(entry));
  }

  // Folder contents section (show children for folder entries)
  if (entry.archetype === 'folder' && container) {
    view.appendChild(renderFolderContents(entry, container));
  }

  // Tags, relations, history, move → moved to right meta pane (renderMetaPane)

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
    const available = getAvailableTagTargets(container.relations, container.entries, entry.lid);
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
    }

    meta.appendChild(revInfo);
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
    meta.appendChild(renderRelationCreateForm(entry.lid, container.entries));
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

  return meta;
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

function renderImportConfirmation(preview: ImportPreviewRef): HTMLElement {
  const panel = createElement('div', 'pkc-import-confirm');
  panel.setAttribute('data-pkc-region', 'import-confirm');

  const warning = createElement('div', 'pkc-import-warning');
  warning.textContent = 'This will fully replace your current data. This is not a merge.';
  panel.appendChild(warning);

  const summary = createElement('div', 'pkc-import-summary');
  summary.setAttribute('data-pkc-region', 'import-summary');

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
  panel.appendChild(summary);

  const actions = createElement('div', 'pkc-import-actions');

  const confirmBtn = createElement('button', 'pkc-btn-danger');
  confirmBtn.setAttribute('data-pkc-action', 'confirm-import');
  confirmBtn.textContent = 'Replace & Import';
  actions.appendChild(confirmBtn);

  const cancelBtn = createElement('button', 'pkc-btn');
  cancelBtn.setAttribute('data-pkc-action', 'cancel-import');
  cancelBtn.textContent = 'Cancel';
  actions.appendChild(cancelBtn);

  panel.appendChild(actions);
  return panel;
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

function renderArchetypeFilter(current: ArchetypeId | null): HTMLElement {
  const bar = createElement('div', 'pkc-archetype-filter');
  bar.setAttribute('data-pkc-region', 'archetype-filter');

  for (const opt of ARCHETYPE_FILTER_OPTIONS) {
    const btn = createElement('button', 'pkc-filter-btn');
    btn.setAttribute('data-pkc-action', 'set-archetype-filter');
    btn.setAttribute('data-pkc-archetype', opt ?? '');
    btn.textContent = opt ? archetypeLabel(opt) : 'All';
    if (opt === current) {
      btn.setAttribute('data-pkc-active', 'true');
    }
    bar.appendChild(btn);
  }

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
    { action: 'begin-edit', label: '✏️ Edit', tip: 'Edit this entry', lid, show: canEdit },
    { action: 'ctx-preview', label: '👁️ Preview', tip: 'Open rendered preview in new window', lid, show: isPreviewable || isSandboxable },
    { action: 'ctx-sandbox-run', label: '🔒 Sandbox Run', tip: 'Open in sandboxed window', lid, show: isSandboxable },
    { action: 'delete-entry', label: '🗑️ Delete', tip: 'Delete this entry permanently', lid, show: canEdit },
    { action: 'delete-log-entry', label: '✕ Delete log entry', tip: 'Remove this log entry', lid, logId: opts.logId, show: canEdit && !!(opts.archetype === 'textlog' && opts.logId) },
    { action: 'ctx-move-to-root', label: '↑ Move to Root', tip: 'Remove from current folder', lid, show: canEdit && hasParent },
    // Reference-string actions — never mutate, always shown.
    {
      action: 'copy-entry-ref',
      label: '🔗 Copy entry reference',
      tip: 'Copy a markdown link pointing at this entry',
      lid,
      show: true,
    },
    {
      action: 'copy-entry-embed-ref',
      label: '🖼️ Copy entry embed',
      tip: 'Copy an embed reference for this entry',
      lid,
      show: true,
    },
    {
      action: 'copy-asset-ref',
      label: '📎 Copy asset reference',
      tip: 'Copy a markdown image / chip reference pointing at this attachment',
      lid,
      show: opts.archetype === 'attachment',
    },
    {
      action: 'copy-log-line-ref',
      label: '📝 Copy log line reference',
      tip: 'Copy a markdown link pointing at this specific log entry',
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
      content.appendChild(presenter.renderBody(entry, container.assets, mimeByKey, nameByKey));
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
