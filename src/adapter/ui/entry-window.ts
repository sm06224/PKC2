/**
 * Entry Window: opens an entry in a separate browser window for
 * markdown-rendered viewing and optional editing.
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

  // Build child window HTML
  const renderedBody = renderMarkdown(entry.body || '');
  const escapedBody = escapeForAttr(entry.body || '');
  const escapedTitle = escapeForAttr(entry.title || '');

  child.document.open();
  child.document.write(buildWindowHtml(entry, renderedBody, escapedTitle, escapedBody, readonly));
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

function buildWindowHtml(
  entry: Entry,
  renderedBody: string,
  escapedTitle: string,
  _escapedBody: string,
  readonly: boolean,
): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>${escapedTitle} — PKC2</title>
<style>
  :root { --c-bg: #1a1a2e; --c-surface: #16213e; --c-text: #e0e0e0; --c-accent: #0f9b58; --c-border: #333; --c-muted: #888; --c-danger: #e74c3c; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--c-bg); color: var(--c-text); padding: 1rem; line-height: 1.6; }
  .header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem; border-bottom: 1px solid var(--c-border); padding-bottom: 0.75rem; }
  .header h1 { font-size: 1.1rem; flex: 1; }
  .badge { font-size: 0.7rem; background: var(--c-surface); border: 1px solid var(--c-border); border-radius: 4px; padding: 0.1rem 0.4rem; }
  .btn { padding: 0.3rem 0.75rem; border: 1px solid var(--c-border); border-radius: 4px; cursor: pointer; font-size: 0.8rem; background: var(--c-surface); color: var(--c-text); }
  .btn:hover { background: var(--c-accent); color: #fff; }
  .btn-save { background: var(--c-accent); color: #fff; }
  .btn-save:hover { opacity: 0.9; }
  .title-input { width: 100%; padding: 0.4rem; border: 1px solid var(--c-border); border-radius: 4px; background: var(--c-surface); color: var(--c-text); font-size: 1rem; margin-bottom: 0.75rem; }
  .body-view { background: var(--c-surface); border: 1px solid var(--c-border); border-radius: 8px; padding: 0.75rem 1rem; min-height: 200px; line-height: 1.6; }
  .body-edit { width: 100%; min-height: 300px; padding: 0.5rem; border: 1px solid var(--c-border); border-radius: 8px; background: var(--c-surface); color: var(--c-text); font-family: monospace; font-size: 0.85rem; line-height: 1.5; resize: vertical; }
  .tab-bar { display: flex; gap: 0.25rem; margin-bottom: 0.5rem; }
  .tab { padding: 0.25rem 0.6rem; border: 1px solid var(--c-border); border-radius: 4px 4px 0 0; cursor: pointer; font-size: 0.8rem; background: var(--c-bg); color: var(--c-muted); }
  .tab.active { background: var(--c-surface); color: var(--c-text); border-bottom-color: var(--c-surface); }
  .conflict-banner { display: none; background: var(--c-danger); color: #fff; padding: 0.5rem; border-radius: 4px; margin-bottom: 0.75rem; font-size: 0.85rem; }
  .status { font-size: 0.75rem; color: var(--c-muted); margin-top: 0.5rem; }
  /* Markdown rendered styles */
  .body-view h1, .body-view h2, .body-view h3 { margin: 0.5em 0 0.25em; }
  .body-view h1 { font-size: 1.3rem; }
  .body-view h2 { font-size: 1.15rem; }
  .body-view h3 { font-size: 1rem; }
  .body-view p { margin: 0.4em 0; }
  .body-view ul, .body-view ol { padding-left: 1.5em; margin: 0.4em 0; }
  .body-view code { background: var(--c-bg); padding: 0.1em 0.3em; border-radius: 3px; font-size: 0.85em; }
  .body-view pre { background: var(--c-bg); padding: 0.5em; border-radius: 4px; overflow-x: auto; margin: 0.4em 0; }
  .body-view pre code { background: none; padding: 0; }
  .body-view blockquote { border-left: 3px solid var(--c-accent); padding-left: 0.75em; color: var(--c-muted); margin: 0.4em 0; }
  .body-view table { border-collapse: collapse; margin: 0.4em 0; }
  .body-view th, .body-view td { border: 1px solid var(--c-border); padding: 0.3em 0.5em; }
  .body-view a { color: var(--c-accent); }
  .body-view img { max-width: 100%; }
  .body-view hr { border: none; border-top: 1px solid var(--c-border); margin: 0.5em 0; }
</style>
</head>
<body>
  <div class="conflict-banner" id="conflict-banner"></div>
  <div class="header">
    <h1 id="title-display">${escapedTitle}</h1>
    <span class="badge">${entry.archetype}</span>
    ${readonly ? '<span class="badge">readonly</span>' : `
    <button class="btn" id="btn-edit" onclick="enterEdit()">Edit</button>
    <button class="btn btn-save" id="btn-save" style="display:none" onclick="saveEntry()">Save</button>
    <button class="btn" id="btn-cancel" style="display:none" onclick="cancelEdit()">Cancel</button>
    `}
  </div>
  ${readonly ? '' : '<input class="title-input" id="title-input" style="display:none" value="">'}
  <div class="tab-bar" id="tab-bar" style="display:none">
    <span class="tab active" id="tab-preview" onclick="showTab('preview')">Preview</span>
    <span class="tab" id="tab-source" onclick="showTab('source')">Source</span>
  </div>
  <div class="body-view" id="body-view">${renderedBody || '<em style="color:var(--c-muted)">(empty)</em>'}</div>
  <textarea class="body-edit" id="body-edit" style="display:none"></textarea>
  <div class="status" id="status"></div>
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
  document.getElementById('btn-edit').style.display = 'none';
  document.getElementById('btn-save').style.display = '';
  document.getElementById('btn-cancel').style.display = '';
  document.getElementById('title-input').style.display = '';
  document.getElementById('title-display').style.display = 'none';
  document.getElementById('tab-bar').style.display = 'flex';
  showTab('source');
}

function cancelEdit() {
  currentMode = 'view';
  document.getElementById('btn-edit').style.display = '';
  document.getElementById('btn-save').style.display = 'none';
  document.getElementById('btn-cancel').style.display = 'none';
  document.getElementById('title-input').style.display = 'none';
  document.getElementById('title-display').style.display = '';
  document.getElementById('tab-bar').style.display = 'none';
  document.getElementById('body-edit').value = originalBody;
  document.getElementById('title-input').value = originalTitle;
  showTab('preview');
  document.getElementById('body-view').style.display = '';
  document.getElementById('body-edit').style.display = 'none';
}

function showTab(tab) {
  if (tab === 'preview') {
    document.getElementById('body-view').style.display = '';
    document.getElementById('body-edit').style.display = 'none';
    document.getElementById('tab-preview').className = 'tab active';
    document.getElementById('tab-source').className = 'tab';
  } else {
    document.getElementById('body-view').style.display = 'none';
    document.getElementById('body-edit').style.display = '';
    document.getElementById('tab-preview').className = 'tab';
    document.getElementById('tab-source').className = 'tab active';
  }
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
