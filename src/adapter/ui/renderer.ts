import type { AppState } from '../state/app-state';
import type { Entry } from '../../core/model/record';

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
    detail.appendChild(renderView(selected, state.phase === 'ready'));
  }

  return detail;
}

function renderView(entry: Entry, canEdit: boolean): HTMLElement {
  const view = createElement('div', 'pkc-view');
  view.setAttribute('data-pkc-mode', 'view');

  const title = createElement('h2', 'pkc-view-title');
  title.textContent = entry.title || '(untitled)';
  view.appendChild(title);

  const body = createElement('pre', 'pkc-view-body');
  body.textContent = entry.body || '(empty)';
  view.appendChild(body);

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
