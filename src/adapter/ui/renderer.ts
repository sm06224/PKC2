import type { AppState } from '../state/app-state';
import type { Entry } from '../../core/model/record';
import type { Container } from '../../core/model/container';
import type { PendingOffer } from '../transport/record-offer-handler';
import type { ImportPreviewRef } from '../../core/action/system-command';
import { CAPABILITIES } from '../../runtime/release-meta';
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
import {
  lightExportWarning, fullExportEstimation, zipRecommendation,
  hasAssets, assetCount,
} from './guardrails';
import { getPresenter } from './detail-presenter';
import { parseTodoBody } from './todo-presenter';

/** Archetype options for the filter bar. Single source of truth. */
const ARCHETYPE_FILTER_OPTIONS: readonly (ArchetypeId | null)[] = [
  null, 'text', 'textlog', 'todo', 'form', 'attachment', 'folder', 'generic', 'opaque',
] as const;

/** Human-readable labels for archetypes. Used in badges, filters, and headers. */
const ARCHETYPE_LABELS: Record<ArchetypeId, string> = {
  text: 'Note',
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

  // Main area: sidebar + center + meta (3-pane)
  const main = createElement('div', 'pkc-main');

  // Left pane: entry list / tree / search / filters
  main.appendChild(renderSidebar(state));

  // Center pane: content view/edit + fixed action bar
  main.appendChild(renderCenter(state));

  // Right pane: meta information (tags, relations, history, move)
  const selected = findSelectedEntry(state);
  if (selected) {
    const canEdit = state.phase === 'ready' && !state.readonly;
    main.appendChild(renderMetaPane(selected, canEdit, state.container));
  }

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
      { arch: 'text', label: `${archetypeIcon('text')} Note`, tip: 'Create a new text note' },
      { arch: 'todo', label: `${archetypeIcon('todo')} Todo`, tip: 'Create a new todo item' },
      { arch: 'form', label: `${archetypeIcon('form')} Form`, tip: 'Create a new form entry' },
      { arch: 'attachment', label: `${archetypeIcon('attachment')} File`, tip: 'Create a new file attachment' },
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
      btn.textContent = label;
      createGroup.appendChild(btn);
    }

    header.appendChild(createGroup);

    // Export / Import panel (collapsible)
    header.appendChild(renderExportImportPanel(state));
  }

  // Readonly mode: show readonly badge and rehydrate button
  if (state.phase === 'ready' && state.readonly) {
    const roBadge = createElement('span', 'pkc-readonly-badge');
    roBadge.setAttribute('data-pkc-region', 'readonly-badge');
    roBadge.textContent = 'Readonly';
    header.appendChild(roBadge);

    const rehydrateBtn = createElement('button', 'pkc-btn');
    rehydrateBtn.setAttribute('data-pkc-action', 'rehydrate');
    rehydrateBtn.textContent = 'Rehydrate to Workspace';
    header.appendChild(rehydrateBtn);
  }

  if (state.phase === 'exporting') {
    const badge = createElement('span', 'pkc-export-badge');
    badge.textContent = 'Exporting…';
    header.appendChild(badge);
  }

  return header;
}

function renderExportImportPanel(state: AppState): HTMLElement {
  const details = document.createElement('details');
  details.className = 'pkc-eip-disclosure';
  details.setAttribute('data-pkc-region', 'export-import-panel');

  const summary = document.createElement('summary');
  summary.className = 'pkc-eip-summary';
  summary.textContent = 'Export / Import';
  details.appendChild(summary);

  const panel = createElement('div', 'pkc-export-import-panel');

  const container = state.container;
  const containerHasAssets = container ? hasAssets(container) : false;

  // ── Section 1: HTML Export ──
  const htmlSection = createElement('div', 'pkc-eip-section');
  const htmlHeading = createElement('div', 'pkc-eip-heading');
  htmlHeading.textContent = 'HTML Export';
  htmlSection.appendChild(htmlHeading);
  const htmlDesc = createElement('div', 'pkc-eip-desc');
  htmlDesc.textContent = 'Single self-contained HTML file. Opens in any browser.';
  htmlSection.appendChild(htmlDesc);

  // Editable group
  const editableGroup = createElement('div', 'pkc-eip-group');
  const editableLabel = createElement('span', 'pkc-eip-group-label');
  editableLabel.textContent = 'Editable';
  editableGroup.appendChild(editableLabel);

  const lightBtn = createElement('button', 'pkc-btn pkc-eip-btn');
  lightBtn.setAttribute('data-pkc-action', 'begin-export');
  lightBtn.setAttribute('data-pkc-export-mode', 'light');
  lightBtn.setAttribute('data-pkc-export-mutability', 'editable');
  lightBtn.setAttribute('title', 'Export text-only HTML (no attachments)');
  lightBtn.textContent = 'Light';
  editableGroup.appendChild(lightBtn);
  editableGroup.appendChild(makeHint('Text only, small file'));

  const fullBtn = createElement('button', 'pkc-btn pkc-eip-btn');
  fullBtn.setAttribute('data-pkc-action', 'begin-export');
  fullBtn.setAttribute('data-pkc-export-mode', 'full');
  fullBtn.setAttribute('data-pkc-export-mutability', 'editable');
  fullBtn.setAttribute('title', 'Export complete HTML with all data');
  fullBtn.textContent = 'Full';
  editableGroup.appendChild(fullBtn);
  editableGroup.appendChild(makeHint('All data including attachments'));

  htmlSection.appendChild(editableGroup);

  // Readonly group
  const readonlyGroup = createElement('div', 'pkc-eip-group');
  const readonlyLabel = createElement('span', 'pkc-eip-group-label');
  readonlyLabel.textContent = 'Readonly';
  readonlyGroup.appendChild(readonlyLabel);

  const roLightBtn = createElement('button', 'pkc-btn pkc-eip-btn');
  roLightBtn.setAttribute('data-pkc-action', 'begin-export');
  roLightBtn.setAttribute('data-pkc-export-mode', 'light');
  roLightBtn.setAttribute('data-pkc-export-mutability', 'readonly');
  roLightBtn.textContent = 'Light';
  readonlyGroup.appendChild(roLightBtn);

  const roFullBtn = createElement('button', 'pkc-btn pkc-eip-btn');
  roFullBtn.setAttribute('data-pkc-action', 'begin-export');
  roFullBtn.setAttribute('data-pkc-export-mode', 'full');
  roFullBtn.setAttribute('data-pkc-export-mutability', 'readonly');
  roFullBtn.textContent = 'Full';
  readonlyGroup.appendChild(roFullBtn);

  readonlyGroup.appendChild(makeHint('View-only, can rehydrate to workspace'));
  htmlSection.appendChild(readonlyGroup);

  // HTML guardrails (inline, next to relevant section)
  if (container) {
    const lightWarn = lightExportWarning(container);
    if (lightWarn) {
      htmlSection.appendChild(makeGuardrail(lightWarn));
    }
    const fullEst = fullExportEstimation(container);
    if (fullEst) {
      htmlSection.appendChild(makeGuardrail(fullEst));
    }
  }

  panel.appendChild(htmlSection);

  // ── Section 2: ZIP Package ──
  const zipSection = createElement('div', 'pkc-eip-section');
  const zipHeading = createElement('div', 'pkc-eip-heading');
  zipHeading.textContent = 'ZIP Package';
  zipSection.appendChild(zipHeading);
  const zipDesc = createElement('div', 'pkc-eip-desc');
  zipDesc.textContent = 'Complete backup with raw files. Best for large data or migration.';
  zipSection.appendChild(zipDesc);

  const zipBtn = createElement('button', 'pkc-btn pkc-eip-btn');
  zipBtn.setAttribute('data-pkc-action', 'export-zip');
  zipBtn.textContent = 'Export ZIP';
  zipSection.appendChild(zipBtn);

  if (containerHasAssets && container) {
    const count = assetCount(container);
    const info = createElement('div', 'pkc-eip-hint');
    info.textContent = `${count} file(s), raw binary — no base64 overhead`;
    zipSection.appendChild(info);
  }

  // ZIP recommendation guardrail
  if (container) {
    const zipRec = zipRecommendation(container);
    if (zipRec) {
      zipSection.appendChild(makeGuardrail(zipRec));
    }
  }

  panel.appendChild(zipSection);

  // ── Section 3: Import ──
  const importSection = createElement('div', 'pkc-eip-section');
  const importHeading = createElement('div', 'pkc-eip-heading');
  importHeading.textContent = 'Import';
  importSection.appendChild(importHeading);
  const importDesc = createElement('div', 'pkc-eip-desc');
  importDesc.textContent = 'Load from HTML (.html) or ZIP Package (.zip). Replaces current data.';
  importSection.appendChild(importDesc);

  const importBtn = createElement('button', 'pkc-btn pkc-eip-btn');
  importBtn.setAttribute('data-pkc-action', 'begin-import');
  importBtn.textContent = 'Import';
  importSection.appendChild(importBtn);

  panel.appendChild(importSection);

  details.appendChild(panel);
  return details;
}

function makeHint(text: string): HTMLElement {
  const el = createElement('span', 'pkc-eip-hint');
  el.textContent = text;
  return el;
}

function makeGuardrail(text: string): HTMLElement {
  const el = createElement('div', 'pkc-guardrail-info');
  el.setAttribute('data-pkc-region', 'export-guardrails');
  el.textContent = text;
  return el;
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
      clearBtn.textContent = '×';
      searchRow.appendChild(clearBtn);
    }

    sidebar.appendChild(searchRow);

    // Archetype filter bar
    sidebar.appendChild(renderArchetypeFilter(state.archetypeFilter));

    // Sort controls
    sidebar.appendChild(renderSortControls(state.sortKey, state.sortDirection));
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
      clearBtn.textContent = '\u00d7';
      indicator.appendChild(clearBtn);

      sidebar.appendChild(indicator);
    }
  }

  // Pipeline: query → archetype → tag → sort
  let filtered = applyFilters(allEntries, state.searchQuery, state.archetypeFilter);
  if (state.tagFilter && state.container) {
    filtered = filterByTag(filtered, state.container.relations, state.tagFilter);
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
    const empty = createElement('div', 'pkc-empty');
    empty.textContent = 'No entries';
    sidebar.appendChild(empty);
    return sidebar;
  }

  if (entries.length === 0) {
    const empty = createElement('div', 'pkc-empty');
    empty.textContent = 'No matching entries';
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

  // Restore candidates (deleted entries with revisions)
  if (state.container && state.phase === 'ready') {
    const candidates = getRestoreCandidates(state.container);
    if (candidates.length > 0) {
      const section = createElement('div', 'pkc-restore-candidates');
      section.setAttribute('data-pkc-region', 'restore-candidates');

      const heading = createElement('div', 'pkc-restore-heading');
      heading.textContent = `Deleted (${candidates.length} restorable)`;
      section.appendChild(heading);

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
          archetype.textContent = archetypeLabel(parsed.archetype as ArchetypeId);
          info.appendChild(archetype);
        }

        const deletedAt = createElement('span', 'pkc-restore-timestamp');
        deletedAt.textContent = `deleted ${formatTimestamp(rev.created_at)}`;
        info.appendChild(deletedAt);

        item.appendChild(info);

        const btn = createElement('button', 'pkc-btn');
        btn.setAttribute('data-pkc-action', 'restore-entry');
        btn.setAttribute('data-pkc-lid', rev.entry_lid);
        btn.setAttribute('data-pkc-revision-id', rev.id);
        btn.textContent = 'Restore deleted entry';
        item.appendChild(btn);

        section.appendChild(item);
      }

      sidebar.appendChild(section);
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
  if (node.entry.archetype === 'folder') {
    li.setAttribute('data-pkc-folder', 'true');
    li.setAttribute('data-pkc-drop-target', 'true');
    // Show child count for folders
    const childCount = createElement('span', 'pkc-folder-count');
    childCount.textContent = `(${node.children.length})`;
    li.appendChild(childCount);
  }
  parent.appendChild(li);
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

  const title = createElement('span', 'pkc-entry-title');
  title.textContent = entry.title || '(untitled)';
  li.appendChild(title);

  const badge = createElement('span', 'pkc-archetype-badge');
  badge.setAttribute('data-pkc-archetype', entry.archetype);
  badge.textContent = `${archetypeIcon(entry.archetype)} ${archetypeLabel(entry.archetype)}`;
  li.appendChild(badge);

  // Todo status indicator
  if (entry.archetype === 'todo') {
    const todo = parseTodoBody(entry.body);
    const statusBadge = createElement('span', 'pkc-todo-status-badge');
    statusBadge.setAttribute('data-pkc-todo-status', todo.status);
    statusBadge.textContent = todo.status === 'done' ? '[x]' : '[ ]';
    li.appendChild(statusBadge);
  }

  // History indicator
  if (state.container) {
    const revCount = getRevisionCount(state.container, entry.lid);
    if (revCount > 0) {
      li.setAttribute('data-pkc-has-history', 'true');
      const revBadge = createElement('span', 'pkc-revision-badge');
      revBadge.setAttribute('data-pkc-revision-count', String(revCount));
      revBadge.textContent = revCount === 1
        ? '1 version'
        : `${revCount} versions`;
      li.appendChild(revBadge);
    }
  }

  return li;
}

function renderCenter(state: AppState): HTMLElement {
  const center = createElement('section', 'pkc-center');
  center.setAttribute('data-pkc-region', 'center');

  const selected = findSelectedEntry(state);

  if (!selected) {
    const placeholder = createElement('div', 'pkc-empty');
    if (state.readonly) {
      placeholder.textContent = state.container?.entries?.length
        ? 'Select an entry'
        : 'No entries';
    } else {
      placeholder.textContent = state.container?.entries?.length
        ? 'Select an entry'
        : 'Create an entry to begin';
    }
    center.appendChild(placeholder);
    return center;
  }

  // Content area (scrollable)
  const content = createElement('div', 'pkc-center-content');

  if (state.phase === 'editing' && state.editingLid === selected.lid) {
    content.appendChild(renderEditor(selected));
  } else {
    const canEdit = state.phase === 'ready' && !state.readonly;
    content.appendChild(renderView(selected, canEdit, state.container));
  }

  center.appendChild(content);

  // Fixed action bar at bottom
  const canEdit = state.phase === 'ready' && !state.readonly;
  center.appendChild(renderActionBar(selected, state.phase, canEdit));

  return center;
}

/** Fixed action bar at bottom of center pane. Shows contextual actions. */
function renderActionBar(entry: Entry, phase: string, canEdit: boolean): HTMLElement {
  const bar = createElement('div', 'pkc-action-bar');
  bar.setAttribute('data-pkc-region', 'action-bar');

  if (phase === 'editing') {
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
  } else if (canEdit) {
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

  // Archetype-dispatched body rendering
  const presenter = getPresenter(entry.archetype);
  view.appendChild(presenter.renderBody(entry));

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
      restoreBtn.setAttribute('title', 'Revert to the previous version');
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
  btn.textContent = 'Add';
  row.appendChild(btn);

  form.appendChild(row);
  return form;
}

function renderEditor(entry: Entry): HTMLElement {
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
  editor.appendChild(presenter.renderEditorBody(entry));

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
    acceptBtn.textContent = 'Accept';
    item.appendChild(acceptBtn);

    const dismissBtn = createElement('button', 'pkc-btn');
    dismissBtn.setAttribute('data-pkc-action', 'dismiss-offer');
    dismissBtn.setAttribute('data-pkc-offer-id', offer.offer_id);
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
      badge.textContent = archetypeLabel(child.archetype);
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
 */
export function renderContextMenu(
  lid: string,
  x: number,
  y: number,
  hasParent: boolean,
): HTMLElement {
  const menu = createElement('div', 'pkc-context-menu');
  menu.setAttribute('data-pkc-region', 'context-menu');
  menu.setAttribute('data-pkc-lid', lid);
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;

  const items: { action: string; label: string; lid?: string; show: boolean }[] = [
    { action: 'begin-edit', label: '✏️ Edit', lid, show: true },
    { action: 'delete-entry', label: '🗑️ Delete', lid, show: true },
    { action: 'ctx-move-to-root', label: '↑ Move to Root', lid, show: hasParent },
  ];

  for (const item of items) {
    if (!item.show) continue;
    const btn = createElement('button', 'pkc-context-menu-item');
    btn.setAttribute('data-pkc-action', item.action);
    if (item.lid) btn.setAttribute('data-pkc-lid', item.lid);
    btn.textContent = item.label;
    menu.appendChild(btn);
  }

  return menu;
}
