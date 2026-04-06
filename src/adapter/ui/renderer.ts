import type { AppState } from '../state/app-state';
import type { Entry } from '../../core/model/record';
import type { Container } from '../../core/model/container';
import type { PendingOffer } from '../transport/record-offer-handler';
import type { ImportPreviewRef } from '../../core/action/system-command';
import { CAPABILITIES } from '../../runtime/release-meta';
import { getRevisionCount, getLatestRevision } from '../../core/operations/container-ops';

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

  // Actions: create entry, export
  if (state.phase === 'ready') {
    const createBtn = createElement('button', 'pkc-btn');
    createBtn.setAttribute('data-pkc-action', 'create-entry');
    createBtn.textContent = '+ New';
    header.appendChild(createBtn);

    const exportBtn = createElement('button', 'pkc-btn');
    exportBtn.setAttribute('data-pkc-action', 'begin-export');
    exportBtn.textContent = 'Export';
    header.appendChild(exportBtn);

    const importBtn = createElement('button', 'pkc-btn');
    importBtn.setAttribute('data-pkc-action', 'begin-import');
    importBtn.textContent = 'Import';
    header.appendChild(importBtn);
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

  const entries = state.container?.entries ?? [];

  if (entries.length === 0) {
    const empty = createElement('div', 'pkc-empty');
    empty.textContent = 'No entries';
    sidebar.appendChild(empty);
    return sidebar;
  }

  const list = createElement('ul', 'pkc-entry-list');
  for (const entry of entries) {
    list.appendChild(renderEntryItem(entry, state));
  }
  sidebar.appendChild(list);

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
  badge.textContent = entry.archetype;
  li.appendChild(badge);

  // Revision count indicator
  if (state.container) {
    const revCount = getRevisionCount(state.container, entry.lid);
    if (revCount > 0) {
      const revBadge = createElement('span', 'pkc-revision-badge');
      revBadge.setAttribute('data-pkc-revision-count', String(revCount));
      revBadge.textContent = `${revCount} rev`;
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
    placeholder.textContent = state.container?.entries?.length
      ? 'Select an entry'
      : 'Create an entry to begin';
    detail.appendChild(placeholder);
    return detail;
  }

  if (state.phase === 'editing' && state.editingLid === selected.lid) {
    detail.appendChild(renderEditor(selected));
  } else {
    detail.appendChild(renderView(selected, state.phase === 'ready', state.container));
  }

  return detail;
}

function renderView(entry: Entry, canEdit: boolean, container: Container | null): HTMLElement {
  const view = createElement('div', 'pkc-view');
  view.setAttribute('data-pkc-mode', 'view');

  const title = createElement('h2', 'pkc-view-title');
  title.textContent = entry.title || '(untitled)';
  view.appendChild(title);

  const body = createElement('pre', 'pkc-view-body');
  body.textContent = entry.body || '(empty)';
  view.appendChild(body);

  // Revision info
  if (container) {
    const revCount = getRevisionCount(container, entry.lid);
    if (revCount > 0) {
      const latest = getLatestRevision(container, entry.lid);
      const revInfo = createElement('div', 'pkc-revision-info');
      revInfo.setAttribute('data-pkc-region', 'revision-info');
      revInfo.setAttribute('data-pkc-revision-count', String(revCount));
      const label = createElement('span', 'pkc-revision-label');
      label.textContent = `${revCount} revision${revCount > 1 ? 's' : ''}`;
      if (latest) {
        label.textContent += ` (latest: ${latest.created_at})`;
      }
      revInfo.appendChild(label);
      view.appendChild(revInfo);
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

function renderEditor(entry: Entry): HTMLElement {
  const editor = createElement('div', 'pkc-editor');
  editor.setAttribute('data-pkc-mode', 'edit');

  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.value = entry.title;
  titleInput.setAttribute('data-pkc-field', 'title');
  titleInput.className = 'pkc-editor-title';
  editor.appendChild(titleInput);

  const bodyArea = document.createElement('textarea');
  bodyArea.value = entry.body;
  bodyArea.setAttribute('data-pkc-field', 'body');
  bodyArea.className = 'pkc-editor-body';
  bodyArea.rows = 10;
  editor.appendChild(bodyArea);

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
