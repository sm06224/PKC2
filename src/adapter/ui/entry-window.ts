/**
 * Entry Window: opens an entry in a separate browser window for
 * markdown-rendered viewing and optional editing.
 *
 * The child window's UI mirrors the center pane (same CSS variables,
 * class names, DOM structure) so the user sees a consistent experience.
 *
 * Communication with the parent window uses postMessage.
 * Protocol:
 *   Parent → Child: { type: 'pkc-entry-init', entry, readonly }
 *   Child → Parent: { type: 'pkc-entry-save', lid, title, body, openedAt }
 *   Parent → Child: { type: 'pkc-entry-saved' }
 *   Parent → Child: { type: 'pkc-entry-conflict', message }
 */

import type { Entry } from '../../core/model/record';
import { renderMarkdown } from '../../features/markdown/markdown-render';
import { parseTodoBody, formatTodoDate, isTodoPastDue } from '../../features/todo/todo-body';
import { parseAttachmentBody } from './attachment-presenter';
import { parseFormBody } from './form-presenter';

/**
 * Expose renderMarkdown on the parent window so child windows
 * can call it via window.opener.pkcRenderMarkdown().
 * This ensures preview rendering in the child window uses the
 * exact same markdown-it instance as the parent.
 */
(window as unknown as Record<string, unknown>).pkcRenderMarkdown = renderMarkdown;

/** Track open child windows to prevent duplicates. */
const openWindows = new Map<string, Window>();

/**
 * Open an entry in a separate browser window.
 * If a window for the same lid is already open, focus it.
 */
export function openEntryWindow(
  entry: Entry,
  readonly: boolean,
  onSave: (lid: string, title: string, body: string, openedAt: string) => void,
): void {
  // Check for existing window
  const existing = openWindows.get(entry.lid);
  if (existing && !existing.closed) {
    existing.focus();
    return;
  }

  const child = window.open('', `pkc-entry-${entry.lid}`, 'width=720,height=600,menubar=no,toolbar=no');
  if (!child) return;

  openWindows.set(entry.lid, child);

  const openedAt = entry.updated_at;

  child.document.open();
  child.document.write(buildWindowHtml(entry, readonly));
  child.document.close();

  // Listen for messages from child
  function handleMessage(e: MessageEvent): void {
    if (e.source !== child) return;
    if (!e.data || e.data.type !== 'pkc-entry-save') return;
    onSave(e.data.lid, e.data.title, e.data.body, openedAt);
    child!.postMessage({ type: 'pkc-entry-saved' }, '*');
  }
  window.addEventListener('message', handleMessage);

  // Cleanup on child close
  const pollClose = setInterval(() => {
    if (child!.closed) {
      clearInterval(pollClose);
      openWindows.delete(entry.lid);
      window.removeEventListener('message', handleMessage);
    }
  }, 500);
}

/**
 * Notify a child window of a conflict.
 */
export function notifyConflict(lid: string, message: string): void {
  const child = openWindows.get(lid);
  if (child && !child.closed) {
    child.postMessage({ type: 'pkc-entry-conflict', message }, '*');
  }
}

function escapeForAttr(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeForScript(text: string): string {
  return JSON.stringify(text);
}

/**
 * Read computed CSS variable values from the parent document's :root
 * so the child window inherits the exact same theme.
 */
function getParentCssVars(): string {
  const vars = [
    '--c-bg', '--c-fg', '--c-accent', '--c-accent-dim', '--c-accent-fg',
    '--c-border', '--c-hover', '--c-danger', '--c-muted', '--c-surface',
    '--c-success', '--c-warn', '--c-warn-fg',
    '--font-sans', '--font-mono',
    '--radius', '--radius-lg', '--radius-sm',
    '--shadow-sm', '--glow', '--transition-fast',
  ];
  const style = getComputedStyle(document.documentElement);
  const lines: string[] = [];
  for (const v of vars) {
    const val = style.getPropertyValue(v).trim();
    if (val) lines.push(`  ${v}: ${val};`);
  }
  return lines.join('\n');
}

/**
 * Render the view body HTML based on entry archetype.
 * - text/textlog/generic/opaque: markdown render
 * - attachment: file info card
 * - todo: status/date/description card
 * - form: key-value card
 * - folder: markdown render (has no special body)
 */
function renderViewBody(entry: Entry): string {
  switch (entry.archetype) {
    case 'attachment':
      return renderAttachmentCard(entry.body);
    case 'todo':
      return renderTodoCard(entry.body);
    case 'form':
      return renderFormCard(entry.body);
    default:
      return renderMarkdown(entry.body || '') || '<em style="color:var(--c-muted)">(empty)</em>';
  }
}

function renderAttachmentCard(body: string): string {
  const att = parseAttachmentBody(body);
  const sizeStr = att.size != null ? formatFileSize(att.size) : 'unknown';
  const ext = att.name.includes('.') ? att.name.split('.').pop() : '—';
  return `<div class="pkc-ew-card" data-pkc-ew-card="attachment">
  <div class="pkc-ew-card-icon">📎</div>
  <div class="pkc-ew-card-fields">
    <div class="pkc-ew-field"><strong>File:</strong> <span>${escapeForHtml(att.name || '(unnamed)')}</span></div>
    <div class="pkc-ew-field"><strong>Type:</strong> <span>${escapeForHtml(att.mime)}</span></div>
    <div class="pkc-ew-field"><strong>Size:</strong> <span>${escapeForHtml(sizeStr)}</span></div>
    <div class="pkc-ew-field"><strong>Ext:</strong> <span>${escapeForHtml(ext ?? '—')}</span></div>
    ${att.asset_key ? `<div class="pkc-ew-field"><strong>Asset:</strong> <span>${escapeForHtml(att.asset_key)}</span></div>` : ''}
  </div>
  <div class="pkc-ew-card-note" style="color:var(--c-muted);font-size:0.75rem;margin-top:0.4rem">
    Preview is available in the main window.
  </div>
</div>`;
}

function renderTodoCard(body: string): string {
  const todo = parseTodoBody(body);
  const statusIcon = todo.status === 'done' ? '✅' : '⬜';
  const statusLabel = todo.status === 'done' ? 'Done' : 'Open';
  const dateHtml = todo.date
    ? `<div class="pkc-ew-field"><strong>Date:</strong> <span${isTodoPastDue(todo) ? ' style="color:var(--c-danger)"' : ''}>${escapeForHtml(formatTodoDate(todo.date))}</span></div>`
    : '';
  const archivedHtml = todo.archived
    ? '<div class="pkc-ew-field"><span style="color:var(--c-warn)">Archived</span></div>'
    : '';
  return `<div class="pkc-ew-card" data-pkc-ew-card="todo">
  <div class="pkc-ew-card-icon">${statusIcon}</div>
  <div class="pkc-ew-card-fields">
    <div class="pkc-ew-field"><strong>Status:</strong> <span>${statusLabel}</span></div>
    ${dateHtml}
    ${archivedHtml}
    <div class="pkc-ew-field"><strong>Description:</strong></div>
    <div class="pkc-ew-desc">${escapeForHtml(todo.description || '(empty)')}</div>
  </div>
</div>`;
}

function renderFormCard(body: string): string {
  const form = parseFormBody(body);
  const checkedLabel = form.checked ? '✅ Yes' : '⬜ No';
  return `<div class="pkc-ew-card" data-pkc-ew-card="form">
  <div class="pkc-ew-card-icon">📋</div>
  <div class="pkc-ew-card-fields">
    <div class="pkc-ew-field"><strong>Name:</strong> <span>${escapeForHtml(form.name || '(empty)')}</span></div>
    <div class="pkc-ew-field"><strong>Note:</strong> <span>${escapeForHtml(form.note || '(empty)')}</span></div>
    <div class="pkc-ew-field"><strong>Checked:</strong> <span>${checkedLabel}</span></div>
  </div>
</div>`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function escapeForHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildWindowHtml(
  entry: Entry,
  readonly: boolean,
): string {
  const escapedTitle = escapeForAttr(entry.title || '');
  const renderedBody = renderViewBody(entry);
  const parentVars = getParentCssVars();

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>${escapedTitle} — PKC2</title>
<style>
/* ── Theme: inherited from parent window ── */
:root {
${parentVars}
  color-scheme: dark;
}
@media (prefers-color-scheme: light) {
  :root { color-scheme: light; }
}

/* ── Reset ── */
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: var(--font-sans);
  color: var(--c-fg);
  background: var(--c-bg);
  font-size: 13px;
  line-height: 1.4;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

/* ── Layout ── */
.pkc-window-content {
  flex: 1;
  overflow-y: auto;
  padding: 0.75rem 1rem;
}

/* ── View title row (mirrors center pane) ── */
.pkc-view-title-row {
  display: flex;
  align-items: baseline;
  gap: 0.35rem;
  margin-bottom: 0.4rem;
}
.pkc-view-title {
  font-size: 1.1rem;
  font-weight: 600;
  flex: 1;
  min-width: 0;
  word-break: break-word;
}
.pkc-archetype-label {
  font-size: 0.65rem;
  padding: 0.05rem 0.3rem;
  border-radius: var(--radius);
  background: var(--c-border);
  color: var(--c-muted);
  white-space: nowrap;
  flex-shrink: 0;
}

/* ── View body (mirrors center pane) ── */
.pkc-view-body {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  white-space: pre-wrap;
  word-wrap: break-word;
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  border-radius: var(--radius-lg, 4px);
  padding: 0.5rem 0.75rem;
  margin-bottom: 0.5rem;
  line-height: 1.5;
}

/* ── Markdown rendered (mirrors center pane) ── */
.pkc-md-rendered {
  font-family: var(--font-sans);
  white-space: normal;
}
.pkc-md-rendered h1, .pkc-md-rendered h2, .pkc-md-rendered h3,
.pkc-md-rendered h4, .pkc-md-rendered h5, .pkc-md-rendered h6 {
  margin: 0.5em 0 0.25em; line-height: 1.3;
}
.pkc-md-rendered h1 { font-size: 1.3rem; }
.pkc-md-rendered h2 { font-size: 1.15rem; }
.pkc-md-rendered h3 { font-size: 1.0rem; }
.pkc-md-rendered p { margin: 0.35em 0; }
.pkc-md-rendered ul, .pkc-md-rendered ol { margin: 0.35em 0; padding-left: 1.5em; }
.pkc-md-rendered li { margin: 0.15em 0; }
.pkc-md-rendered code {
  background: var(--c-bg); padding: 0.1em 0.3em;
  border-radius: 2px; font-family: var(--font-mono); font-size: 0.85em;
}
.pkc-md-rendered pre {
  background: var(--c-bg); padding: 0.5em 0.75em;
  border-radius: 2px; overflow-x: auto; margin: 0.35em 0;
}
.pkc-md-rendered pre code { background: none; padding: 0; font-size: 0.8rem; }
.pkc-md-rendered blockquote {
  border-left: 3px solid var(--c-accent); padding-left: 0.75em;
  margin: 0.35em 0; color: var(--c-muted);
}
.pkc-md-rendered hr { border: none; border-top: 1px solid var(--c-border); margin: 0.5em 0; }
.pkc-md-rendered img { max-width: 100%; height: auto; }
.pkc-md-rendered a { color: var(--c-accent); text-decoration: underline; }
.pkc-md-rendered table { border-collapse: collapse; margin: 0.35em 0; }
.pkc-md-rendered th, .pkc-md-rendered td { border: 1px solid var(--c-border); padding: 0.3em 0.5em; }

/* ── Editor (mirrors center pane) ── */
.pkc-editor { max-width: 720px; }
.pkc-editor-title-row {
  display: flex; align-items: center; gap: 0.35rem; margin-bottom: 0.35rem;
}
.pkc-editor-title {
  flex: 1; font-size: 1rem; font-family: var(--font-sans);
  padding: 0.25rem 0.5rem; border: 1px solid var(--c-border);
  border-radius: var(--radius); background: var(--c-bg); color: var(--c-fg); outline: none;
}
.pkc-editor-title:focus {
  border-color: var(--c-accent);
  box-shadow: 0 0 0 1px var(--c-accent), var(--glow);
}
.pkc-editor-body {
  display: block; width: 100%; font-family: var(--font-mono); font-size: 0.8rem;
  padding: 0.4rem 0.5rem; border: 1px solid var(--c-border); border-radius: var(--radius);
  margin-bottom: 0.5rem; resize: vertical; line-height: 1.5; outline: none;
  min-height: 120px; background: var(--c-bg); color: var(--c-fg);
}
.pkc-editor-body:focus {
  border-color: var(--c-accent);
  box-shadow: 0 0 0 1px var(--c-accent), var(--glow);
}

/* ── Tab bar (Source/Preview) ── */
.pkc-tab-bar {
  display: flex; gap: 0; margin-bottom: 0.5rem; border-bottom: 1px solid var(--c-border);
}
.pkc-tab {
  padding: 0.2rem 0.6rem; font-size: 0.75rem; cursor: pointer;
  border: 1px solid var(--c-border); border-bottom: none;
  border-radius: var(--radius) var(--radius) 0 0;
  background: var(--c-bg); color: var(--c-muted); margin-bottom: -1px;
  font-family: var(--font-sans);
}
.pkc-tab[data-pkc-active="true"] {
  background: var(--c-surface); color: var(--c-fg); border-bottom: 1px solid var(--c-surface);
}
.pkc-tab:hover:not([data-pkc-active="true"]) {
  background: var(--c-hover);
}

/* ── Action bar (mirrors center pane) ── */
.pkc-action-bar {
  display: flex; align-items: center; gap: 0.35rem;
  padding: 0.35rem 1rem; border-top: 1px solid var(--c-accent-dim);
  background: var(--c-surface); flex-shrink: 0;
  box-shadow: 0 -1px 4px rgba(51,255,102,0.06);
}
.pkc-action-bar[data-pkc-editing="true"] {
  border-top-color: var(--c-accent);
  box-shadow: 0 -2px 8px rgba(51,255,102,0.1);
}
.pkc-action-bar-status {
  font-size: 0.75rem; font-weight: 600; color: var(--c-accent);
  margin-right: 0.25rem; text-shadow: 0 0 6px rgba(51,255,102,0.2);
}
.pkc-action-bar-info {
  margin-left: auto; font-size: 0.75rem; color: var(--c-muted);
}

/* ── Buttons (mirrors center pane) ── */
.pkc-btn {
  padding: 0.2rem 0.5rem; font-size: 0.75rem;
  border: 1px solid var(--c-border); border-radius: var(--radius);
  background: var(--c-bg); color: var(--c-fg); cursor: pointer;
  font-family: var(--font-sans); white-space: nowrap;
  transition: background 120ms ease, box-shadow 120ms ease, transform 120ms ease;
}
.pkc-btn:hover { background: var(--c-hover); box-shadow: var(--glow); }
.pkc-btn:active { transform: scale(0.96); }
.pkc-btn-primary {
  padding: 0.2rem 0.5rem; font-size: 0.75rem;
  border: 1px solid var(--c-accent); border-radius: var(--radius);
  background: var(--c-accent); color: var(--c-accent-fg); cursor: pointer;
  font-family: var(--font-sans); white-space: nowrap; font-weight: 600;
  box-shadow: var(--glow);
  transition: background 120ms ease, box-shadow 120ms ease, transform 120ms ease, opacity 120ms ease;
}
.pkc-btn-primary:hover { opacity: 0.9; box-shadow: 0 0 10px rgba(51,255,102,0.3); }
.pkc-btn-primary:active { transform: scale(0.96); }

/* ── Conflict banner ── */
.pkc-conflict-banner {
  display: none; background: var(--c-danger); color: #fff;
  padding: 0.4rem 0.75rem; font-size: 0.8rem; margin: 0.5rem 0;
  border-radius: var(--radius);
}

/* ── Status message ── */
.pkc-status-msg {
  font-size: 0.75rem; color: var(--c-muted); padding: 0.25rem 0;
}

/* ── Archetype info cards (attachment / todo / form) ── */
.pkc-ew-card {
  display: flex; gap: 0.75rem; align-items: flex-start;
  padding: 0.75rem; border: 1px solid var(--c-border); border-radius: var(--radius-lg, 4px);
  background: var(--c-surface);
}
.pkc-ew-card-icon { font-size: 1.5rem; flex-shrink: 0; line-height: 1; }
.pkc-ew-card-fields { flex: 1; min-width: 0; }
.pkc-ew-field { font-size: 0.8rem; line-height: 1.6; }
.pkc-ew-field strong { color: var(--c-muted); font-weight: 600; margin-right: 0.25rem; }
.pkc-ew-desc {
  font-size: 0.8rem; white-space: pre-wrap; word-wrap: break-word;
  margin-top: 0.25rem; padding: 0.3rem 0.5rem;
  background: var(--c-bg); border-radius: var(--radius); border: 1px solid var(--c-border);
}
</style>
</head>
<body>
  <!-- Conflict banner (hidden by default) -->
  <div class="pkc-conflict-banner" id="conflict-banner"></div>

  <!-- Scrollable content area -->
  <div class="pkc-window-content" id="window-content">
    <!-- View mode (initial state) -->
    <div id="view-pane">
      <div class="pkc-view-title-row">
        <h2 class="pkc-view-title" id="title-display">${escapedTitle}</h2>
        <span class="pkc-archetype-label">${entry.archetype}</span>
      </div>
      <div class="pkc-view-body pkc-md-rendered" id="body-view">${renderedBody}</div>
    </div>

    <!-- Edit mode (hidden initially) -->
    <div id="edit-pane" class="pkc-editor" style="display:none">
      <div class="pkc-editor-title-row">
        <input type="text" class="pkc-editor-title" id="title-input" value="">
        <span class="pkc-archetype-label">${entry.archetype}</span>
      </div>
      <div class="pkc-tab-bar" id="tab-bar">
        <span class="pkc-tab" id="tab-source" data-pkc-active="true" onclick="showTab('source')">Source</span>
        <span class="pkc-tab" id="tab-preview" onclick="showTab('preview')">Preview</span>
      </div>
      <textarea class="pkc-editor-body" id="body-edit" rows="10"></textarea>
      <div class="pkc-view-body pkc-md-rendered" id="body-preview" style="display:none"></div>
    </div>
  </div>

  <!-- Fixed action bar at bottom (mirrors center pane) -->
  <div class="pkc-action-bar" id="action-bar">
    ${readonly ? '' : '<button class="pkc-btn" id="btn-edit" onclick="enterEdit()">✏️ Edit</button>'}
    <button class="pkc-btn-primary" id="btn-save" style="display:none" onclick="saveEntry()">💾 Save</button>
    <button class="pkc-btn" id="btn-cancel" style="display:none" onclick="cancelEdit()">Cancel</button>
    <span class="pkc-action-bar-status" id="bar-status"></span>
    <span class="pkc-action-bar-info" id="bar-info">${entry.archetype}</span>
  </div>

  <div class="pkc-status-msg" id="status"></div>

<script>
var currentMode = 'view';
var lid = ${escapeForScript(entry.lid)};
var originalTitle = ${escapeForScript(entry.title)};
var originalBody = ${escapeForScript(entry.body)};

document.getElementById('body-edit').value = originalBody;
if (document.getElementById('title-input')) {
  document.getElementById('title-input').value = originalTitle;
}

function enterEdit() {
  currentMode = 'edit';
  document.getElementById('view-pane').style.display = 'none';
  document.getElementById('edit-pane').style.display = '';
  document.getElementById('btn-edit').style.display = 'none';
  document.getElementById('btn-save').style.display = '';
  document.getElementById('btn-cancel').style.display = '';
  document.getElementById('action-bar').setAttribute('data-pkc-editing', 'true');
  document.getElementById('bar-status').textContent = '✎ Editing';
  showTab('source');
}

function cancelEdit() {
  currentMode = 'view';
  document.getElementById('view-pane').style.display = '';
  document.getElementById('edit-pane').style.display = 'none';
  document.getElementById('btn-edit').style.display = '';
  document.getElementById('btn-save').style.display = 'none';
  document.getElementById('btn-cancel').style.display = 'none';
  document.getElementById('action-bar').removeAttribute('data-pkc-editing');
  document.getElementById('bar-status').textContent = '';
  document.getElementById('body-edit').value = originalBody;
  document.getElementById('title-input').value = originalTitle;
}

function showTab(tab) {
  if (tab === 'source') {
    document.getElementById('body-edit').style.display = '';
    document.getElementById('body-preview').style.display = 'none';
    document.getElementById('tab-source').setAttribute('data-pkc-active', 'true');
    document.getElementById('tab-preview').removeAttribute('data-pkc-active');
  } else {
    /* Re-render markdown from the CURRENT textarea value */
    var src = document.getElementById('body-edit').value;
    document.getElementById('body-preview').innerHTML = renderMd(src);
    document.getElementById('body-edit').style.display = 'none';
    document.getElementById('body-preview').style.display = '';
    document.getElementById('tab-preview').setAttribute('data-pkc-active', 'true');
    document.getElementById('tab-source').removeAttribute('data-pkc-active');
  }
}

/**
 * Render markdown using the parent window's markdown-it instance.
 * This ensures the child window preview matches the parent's rendering exactly.
 * Falls back to plain-text display if the parent is unavailable.
 */
function renderMd(text) {
  if (!text) return '<em style="color:var(--c-muted)">(empty)</em>';
  try {
    if (window.opener && typeof window.opener.pkcRenderMarkdown === 'function') {
      return window.opener.pkcRenderMarkdown(text);
    }
  } catch (_e) { /* cross-origin or closed — fall through */ }
  /* Fallback: plain text with HTML escaping */
  var escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return '<pre>' + escaped + '</pre>';
}

function saveEntry() {
  var title = document.getElementById('title-input').value;
  var body = document.getElementById('body-edit').value;
  window.opener.postMessage({ type: 'pkc-entry-save', lid: lid, title: title, body: body }, '*');
  document.getElementById('status').textContent = 'Saving...';
}

window.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'pkc-entry-saved') {
    originalTitle = document.getElementById('title-input').value;
    originalBody = document.getElementById('body-edit').value;
    /* Update the view-pane body to reflect saved content */
    document.getElementById('title-display').textContent = originalTitle;
    document.getElementById('body-view').innerHTML = renderMd(originalBody);
    document.getElementById('status').textContent = 'Saved.';
    setTimeout(function() { document.getElementById('status').textContent = ''; }, 2000);
  }
  if (e.data && e.data.type === 'pkc-entry-conflict') {
    var banner = document.getElementById('conflict-banner');
    banner.textContent = e.data.message;
    banner.style.display = '';
  }
});
</script>
</body>
</html>`;
}
