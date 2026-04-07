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
import type { RelationKind } from '../../core/model/relation';
import { getPresenter } from './detail-presenter';
import { parseTodoBody } from './todo-presenter';

/** Archetype options for the filter bar. Single source of truth. */
const ARCHETYPE_FILTER_OPTIONS: readonly (ArchetypeId | null)[] = [
  null, 'text', 'textlog', 'todo', 'form', 'attachment', 'generic', 'opaque',
] as const;

/** Human-readable labels for archetypes. Used in badges, filters, and headers. */
const ARCHETYPE_LABELS: Record<ArchetypeId, string> = {
  text: 'Note',
  textlog: 'Log',
  todo: 'Todo',
  form: 'Form',
  attachment: 'File',
  generic: 'Generic',
  opaque: 'Opaque',
};

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

  // Main area: sidebar + detail
  const main = createElement('div', 'pkc-main');

  // Sidebar: entry list
  main.appendChild(renderSidebar(state));

  // Detail: selected entry or placeholder
  main.appendChild(renderDetail(state));

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
    const createBtn = createElement('button', 'pkc-btn');
    createBtn.setAttribute('data-pkc-action', 'create-entry');
    createBtn.setAttribute('data-pkc-archetype', 'text');
    createBtn.textContent = '+ Note';
    header.appendChild(createBtn);

    const createTodoBtn = createElement('button', 'pkc-btn');
    createTodoBtn.setAttribute('data-pkc-action', 'create-entry');
    createTodoBtn.setAttribute('data-pkc-archetype', 'todo');
    createTodoBtn.textContent = '+ Todo';
    header.appendChild(createTodoBtn);

    const createFormBtn = createElement('button', 'pkc-btn');
    createFormBtn.setAttribute('data-pkc-action', 'create-entry');
    createFormBtn.setAttribute('data-pkc-archetype', 'form');
    createFormBtn.textContent = '+ Form';
    header.appendChild(createFormBtn);

    const createAttBtn = createElement('button', 'pkc-btn');
    createAttBtn.setAttribute('data-pkc-action', 'create-entry');
    createAttBtn.setAttribute('data-pkc-archetype', 'attachment');
    createAttBtn.textContent = '+ File';
    header.appendChild(createAttBtn);

    const exportLightBtn = createElement('button', 'pkc-btn');
    exportLightBtn.setAttribute('data-pkc-action', 'begin-export');
    exportLightBtn.setAttribute('data-pkc-export-mode', 'light');
    exportLightBtn.setAttribute('data-pkc-export-mutability', 'editable');
    exportLightBtn.textContent = 'Export Light';
    header.appendChild(exportLightBtn);

    const exportFullBtn = createElement('button', 'pkc-btn');
    exportFullBtn.setAttribute('data-pkc-action', 'begin-export');
    exportFullBtn.setAttribute('data-pkc-export-mode', 'full');
    exportFullBtn.setAttribute('data-pkc-export-mutability', 'editable');
    exportFullBtn.textContent = 'Export Full';
    header.appendChild(exportFullBtn);

    const exportRoLightBtn = createElement('button', 'pkc-btn');
    exportRoLightBtn.setAttribute('data-pkc-action', 'begin-export');
    exportRoLightBtn.setAttribute('data-pkc-export-mode', 'light');
    exportRoLightBtn.setAttribute('data-pkc-export-mutability', 'readonly');
    exportRoLightBtn.textContent = 'Export RO Light';
    header.appendChild(exportRoLightBtn);

    const exportRoFullBtn = createElement('button', 'pkc-btn');
    exportRoFullBtn.setAttribute('data-pkc-action', 'begin-export');
    exportRoFullBtn.setAttribute('data-pkc-export-mode', 'full');
    exportRoFullBtn.setAttribute('data-pkc-export-mutability', 'readonly');
    exportRoFullBtn.textContent = 'Export RO Full';
    header.appendChild(exportRoFullBtn);

    const importBtn = createElement('button', 'pkc-btn');
    importBtn.setAttribute('data-pkc-action', 'begin-import');
    importBtn.textContent = 'Import';
    header.appendChild(importBtn);
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
  for (const entry of entries) {
    list.appendChild(renderEntryItem(entry, state));
  }
  sidebar.appendChild(list);

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
  badge.textContent = archetypeLabel(entry.archetype);
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

function renderDetail(state: AppState): HTMLElement {
  const detail = createElement('section', 'pkc-detail');
  detail.setAttribute('data-pkc-region', 'detail');

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
    detail.appendChild(placeholder);
    return detail;
  }

  if (state.phase === 'editing' && state.editingLid === selected.lid) {
    detail.appendChild(renderEditor(selected));
  } else {
    const canEdit = state.phase === 'ready' && !state.readonly;
    detail.appendChild(renderView(selected, canEdit, state.container));
  }

  return detail;
}

function renderView(entry: Entry, canEdit: boolean, container: Container | null): HTMLElement {
  const view = createElement('div', 'pkc-view');
  view.setAttribute('data-pkc-mode', 'view');
  view.setAttribute('data-pkc-archetype', entry.archetype);

  const titleRow = createElement('div', 'pkc-view-title-row');
  const title = createElement('h2', 'pkc-view-title');
  title.textContent = entry.title || '(untitled)';
  titleRow.appendChild(title);

  const archLabel = createElement('span', 'pkc-archetype-label');
  archLabel.setAttribute('data-pkc-archetype', entry.archetype);
  archLabel.textContent = archetypeLabel(entry.archetype);
  titleRow.appendChild(archLabel);
  view.appendChild(titleRow);

  // Archetype-dispatched body rendering
  const presenter = getPresenter(entry.archetype);
  view.appendChild(presenter.renderBody(entry));

  // Tags section
  if (container) {
    const tags = getTagsForEntry(container.relations, container.entries, entry.lid);
    const tagSection = createElement('div', 'pkc-tags');
    tagSection.setAttribute('data-pkc-region', 'tags');

    const tagHeading = createElement('span', 'pkc-tags-label');
    tagHeading.textContent = 'Tags:';
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
        addBtn.textContent = 'Add';
        addForm.appendChild(addBtn);

        tagSection.appendChild(addForm);
      }
    }

    view.appendChild(tagSection);
  }

  // History section
  if (container) {
    const revCount = getRevisionCount(container, entry.lid);
    if (revCount > 0) {
      const latest = getLatestRevision(container, entry.lid);
      const revInfo = createElement('div', 'pkc-revision-info');
      revInfo.setAttribute('data-pkc-region', 'revision-info');
      revInfo.setAttribute('data-pkc-revision-count', String(revCount));

      const heading = createElement('div', 'pkc-revision-heading');
      heading.textContent = `History: ${revCount} previous version${revCount > 1 ? 's' : ''}`;
      revInfo.appendChild(heading);

      if (latest) {
        const latestInfo = createElement('div', 'pkc-revision-latest');
        latestInfo.setAttribute('data-pkc-region', 'revision-latest');
        const latestLabel = createElement('span', 'pkc-revision-latest-label');
        latestLabel.textContent = `Last saved: ${formatTimestamp(latest.created_at)}`;
        latestInfo.appendChild(latestLabel);

        // Show what the previous version contained
        const parsed = parseRevisionSnapshot(latest);
        if (parsed) {
          const preview = createElement('span', 'pkc-revision-preview');
          preview.setAttribute('data-pkc-region', 'revision-preview');
          preview.textContent = `"${truncate(parsed.title, 40)}"`;
          latestInfo.appendChild(preview);
        }

        revInfo.appendChild(latestInfo);
      }

      if (canEdit && latest) {
        const restoreBtn = createElement('button', 'pkc-btn');
        restoreBtn.setAttribute('data-pkc-action', 'restore-entry');
        restoreBtn.setAttribute('data-pkc-lid', entry.lid);
        restoreBtn.setAttribute('data-pkc-revision-id', latest.id);
        restoreBtn.textContent = 'Revert to previous version';
        revInfo.appendChild(restoreBtn);
      }

      view.appendChild(revInfo);
    }
  }

  // Relation sections
  if (container) {
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

      view.appendChild(relSection);
    }

    // Relation creation form (only in ready phase)
    if (canEdit && container.entries.length > 1) {
      view.appendChild(renderRelationCreateForm(entry.lid, container.entries));
    }
  }

  if (canEdit) {
    const actions = createElement('div', 'pkc-view-actions');

    const editBtn = createElement('button', 'pkc-btn');
    editBtn.setAttribute('data-pkc-action', 'begin-edit');
    editBtn.setAttribute('data-pkc-lid', entry.lid);
    editBtn.textContent = 'Edit';
    actions.appendChild(editBtn);

    const deleteBtn = createElement('button', 'pkc-btn-danger');
    deleteBtn.setAttribute('data-pkc-action', 'delete-entry');
    deleteBtn.setAttribute('data-pkc-lid', entry.lid);
    deleteBtn.textContent = 'Delete';
    actions.appendChild(deleteBtn);

    view.appendChild(actions);
  }

  return view;
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
  archLabel.textContent = archetypeLabel(entry.archetype);
  titleRow.appendChild(archLabel);
  editor.appendChild(titleRow);

  // Archetype-dispatched editor body
  const presenter = getPresenter(entry.archetype);
  editor.appendChild(presenter.renderEditorBody(entry));

  const actions = createElement('div', 'pkc-editor-actions');

  const commitBtn = createElement('button', 'pkc-btn');
  commitBtn.setAttribute('data-pkc-action', 'commit-edit');
  commitBtn.setAttribute('data-pkc-lid', entry.lid);
  commitBtn.textContent = 'Save';
  actions.appendChild(commitBtn);

  const cancelBtn = createElement('button', 'pkc-btn');
  cancelBtn.setAttribute('data-pkc-action', 'cancel-edit');
  cancelBtn.textContent = 'Cancel';
  actions.appendChild(cancelBtn);

  editor.appendChild(actions);
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
