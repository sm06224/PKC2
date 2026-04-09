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
import {
  parseAttachmentBody,
  classifyPreviewType,
  isSvg,
} from './attachment-presenter';
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
 * Asset context threaded from the parent window into the child window
 * at open time so the child can preview attachments and show resolved
 * asset references without having live access to `container.assets`.
 *
 * All fields are optional — an absent field means "data not available
 * for this reason" and the child renders the corresponding fallback.
 */
export interface EntryWindowAssetContext {
  /**
   * For attachment archetype entries only: the base64 bytes of the
   * attached file. Undefined means either Light export (no data) or
   * the asset key is no longer present in the container.
   */
  attachmentData?: string;
  /**
   * For attachment archetype entries with HTML/SVG MIME: the sandbox
   * permissions to apply to the iframe. `allow-same-origin` is always
   * added as a baseline.
   */
  sandboxAllow?: string[];
  /**
   * For text / textlog archetype entries: the entry body with
   * `![alt](asset:key)` and `[label](asset:key)` references already
   * resolved by the parent's asset resolver. When provided, the child
   * uses this instead of `entry.body` for the initial view-mode
   * markdown render.
   */
  resolvedBody?: string;
}

/**
 * Open an entry in a separate browser window.
 * If a window for the same lid is already open, focus it.
 *
 * `assetContext` and `onDownloadAsset` are optional: when absent, the
 * child window falls back to the pre-Phase-4 behavior (no attachment
 * preview, no non-image chip download).
 */
export function openEntryWindow(
  entry: Entry,
  readonly: boolean,
  onSave: (lid: string, title: string, body: string, openedAt: string) => void,
  lightSource = false,
  assetContext?: EntryWindowAssetContext,
  onDownloadAsset?: (assetKey: string) => void,
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
  child.document.write(buildWindowHtml(entry, readonly, lightSource, assetContext));
  child.document.close();

  // Listen for messages from child
  function handleMessage(e: MessageEvent): void {
    if (e.source !== child) return;
    if (!e.data) return;
    if (e.data.type === 'pkc-entry-save') {
      onSave(e.data.lid, e.data.title, e.data.body, openedAt);
      child!.postMessage({ type: 'pkc-entry-saved' }, '*');
      return;
    }
    if (e.data.type === 'pkc-entry-download-asset') {
      if (typeof e.data.assetKey === 'string' && onDownloadAsset) {
        onDownloadAsset(e.data.assetKey);
      }
      return;
    }
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
 * - text/textlog/generic/opaque: markdown render (using resolved body when available)
 * - attachment: MIME-aware preview card
 * - todo: status/date/description card
 * - form: key-value card
 * - folder: markdown render (has no special body)
 */
function renderViewBody(
  entry: Entry,
  lightSource: boolean,
  ctx?: EntryWindowAssetContext,
): string {
  switch (entry.archetype) {
    case 'attachment':
      return renderAttachmentCard(entry.body, lightSource, ctx);
    case 'todo':
      return renderTodoCard(entry.body);
    case 'form':
      return renderFormCard(entry.body);
    default: {
      // Text / textlog / generic: use the pre-resolved body when the
      // parent provided one, so that `![](asset:…)` embeds and
      // `[](asset:…)` chips already appear as inline data URIs /
      // fragment-href chips by the time markdown-it sees them.
      const source = ctx?.resolvedBody != null ? ctx.resolvedBody : entry.body;
      return renderMarkdown(source || '') || '<em style="color:var(--c-muted)">(empty)</em>';
    }
  }
}

/**
 * Render the attachment view pane.
 *
 * The returned HTML contains the file info card, a MIME-specific
 * preview placeholder, an action row (Open / Download), and explicit
 * fallback messages for Light mode, missing data and unsupported MIME.
 *
 * Actual preview wiring — blob URL creation, iframe srcdoc, `<img>`
 * data URI, chip click interception — runs from the child window's
 * inline `<script>`, which reads the base64 data that `buildWindowHtml`
 * embeds via `pkcAttachmentData` (see bottom of the generated HTML).
 */
function renderAttachmentCard(
  body: string,
  lightSource: boolean,
  ctx?: EntryWindowAssetContext,
): string {
  const att = parseAttachmentBody(body);
  const sizeStr = att.size != null ? formatFileSize(att.size) : 'unknown';
  const ext = att.name.includes('.') ? att.name.split('.').pop() : '—';

  if (!att.name) {
    return `<div class="pkc-ew-card" data-pkc-ew-card="attachment">
  <div class="pkc-ew-empty" data-pkc-region="attachment-empty">No file attached.</div>
</div>`;
  }

  // Resolve data availability. `ctx?.attachmentData` is the only way
  // the child ever sees the bytes — we do NOT trust `att.data` from
  // the body because the new format stores data in container.assets.
  const hasData = !!ctx?.attachmentData && ctx.attachmentData.length > 0;
  const previewType = classifyPreviewType(att.mime);
  const svg = isSvg(att.mime);

  // ── Info card ──
  const infoCard = `<div class="pkc-ew-card" data-pkc-ew-card="attachment">
  <div class="pkc-ew-card-icon">📎</div>
  <div class="pkc-ew-card-fields">
    <div class="pkc-ew-field"><strong>File:</strong> <span>${escapeForHtml(att.name)}</span></div>
    <div class="pkc-ew-field"><strong>Type:</strong> <span>${escapeForHtml(att.mime)}</span></div>
    <div class="pkc-ew-field"><strong>Size:</strong> <span>${escapeForHtml(sizeStr)}</span></div>
    <div class="pkc-ew-field"><strong>Ext:</strong> <span>${escapeForHtml(ext ?? '—')}</span></div>
    ${att.asset_key ? `<div class="pkc-ew-field"><strong>Asset:</strong> <span>${escapeForHtml(att.asset_key)}</span></div>` : ''}
  </div>
</div>`;

  // ── Fallback reason (data unavailable) ──
  if (!hasData) {
    const reason = lightSource
      ? 'This is a Light export — attachment file data is not included. Re-export without Light mode to preview or download this file.'
      : att.asset_key
        ? 'File data is not available in this container. The asset may have been removed.'
        : 'File data is not available.';
    return `${infoCard}
<div class="pkc-ew-preview-reason" data-pkc-region="attachment-preview-reason">${escapeForHtml(reason)}</div>`;
  }

  // ── Preview area (populated by child-side script) ──
  const previewHtml = renderPreviewShell(previewType, att.mime, att.name, svg);

  // ── Action row ──
  const openBtnHtml = (previewType === 'image' || previewType === 'pdf' || previewType === 'video')
    ? `<button type="button" class="pkc-btn" data-pkc-ew-action="open-attachment">${previewTypeOpenLabel(previewType)}</button>`
    : '';
  const downloadBtnHtml = `<button type="button" class="pkc-btn" data-pkc-ew-action="download-attachment">📥 Download</button>`;
  const actionRow = `<div class="pkc-ew-action-row" data-pkc-region="attachment-actions">${openBtnHtml}${downloadBtnHtml}</div>`;

  return `${infoCard}
${previewHtml}
${actionRow}`;
}

/**
 * Build the preview shell DOM. Base64 data injection and blob URL
 * wiring happen in the child-side script (`pkcAttachmentData` + the
 * inline `bootAttachmentPreview()` function). The shell carries the
 * MIME category on `data-pkc-ew-preview-type` so the script can
 * dispatch without re-classifying.
 */
function renderPreviewShell(
  previewType: ReturnType<typeof classifyPreviewType>,
  mime: string,
  name: string,
  svg: boolean,
): string {
  const safeName = escapeForHtml(name);
  const safeMime = escapeForAttr(mime);
  const base = `class="pkc-ew-preview" data-pkc-region="attachment-preview" data-pkc-ew-preview-type="${svg ? 'svg' : previewType}" data-pkc-ew-mime="${safeMime}" data-pkc-ew-name="${escapeForAttr(name)}"`;

  switch (previewType) {
    case 'image':
      return `<div ${base}>
  <img class="pkc-ew-preview-img" alt="${escapeForAttr(name)}" data-pkc-ew-slot="img" />
</div>`;
    case 'pdf':
      return `<div ${base}>
  <iframe class="pkc-ew-preview-pdf" title="PDF preview: ${safeName}" data-pkc-ew-slot="iframe"></iframe>
</div>`;
    case 'video':
      return `<div ${base}>
  <video class="pkc-ew-preview-video" controls preload="metadata" data-pkc-ew-slot="video"></video>
</div>`;
    case 'audio':
      return `<div ${base}>
  <audio class="pkc-ew-preview-audio" controls preload="metadata" data-pkc-ew-slot="audio"></audio>
</div>`;
    case 'html':
      // HTML and SVG are both sandboxed. `pkc-ew-preview-type` uses
      // `svg` vs `html` so the child script can decide whether to
      // hand the bytes to `srcdoc` as UTF-8 text.
      return `<div ${base}>
  <iframe class="pkc-ew-preview-html" title="${svg ? 'SVG' : 'HTML'} preview: ${safeName}" data-pkc-ew-slot="iframe"></iframe>
  <div class="pkc-ew-sandbox-note" data-pkc-ew-slot="sandbox-note"></div>
</div>`;
    case 'none':
    default:
      return `<div ${base}>
  <div class="pkc-ew-preview-none">No inline preview for this file type.</div>
</div>`;
  }
}

function previewTypeOpenLabel(previewType: ReturnType<typeof classifyPreviewType>): string {
  switch (previewType) {
    case 'image': return '🖼 Open image in new tab';
    case 'pdf':   return '📄 Open PDF in new tab';
    case 'video': return '🎬 Open video in new tab';
    default:      return 'Open in new tab';
  }
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
  lightSource = false,
  assetContext?: EntryWindowAssetContext,
): string {
  const escapedTitle = escapeForAttr(entry.title || '');
  const renderedBody = renderViewBody(entry, lightSource, assetContext);
  const parentVars = getParentCssVars();

  // Attachment-preview boot data. Only attachment archetype entries
  // carry per-entry bytes (`attachmentData`); everything else leaves
  // this as an empty object and the boot script becomes a no-op.
  const attachmentData = entry.archetype === 'attachment' && assetContext?.attachmentData
    ? assetContext.attachmentData
    : '';
  const attachmentMime = entry.archetype === 'attachment'
    ? parseAttachmentBody(entry.body).mime
    : '';
  const sandboxAllow = (entry.archetype === 'attachment' && assetContext?.sandboxAllow) ?? [];

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

/* ── Light mode notice ── */
.pkc-light-notice {
  font-size: 0.75rem; padding: 0.35rem 0.5rem; margin: 0.5rem 0;
  border-radius: var(--radius); border-left: 3px solid var(--c-accent-dim);
  background: var(--c-surface); color: var(--c-muted);
}

/* ── Attachment preview (Phase 4) ── */
.pkc-ew-empty {
  font-size: 0.8rem; color: var(--c-muted); padding: 0.4rem 0;
}
.pkc-ew-preview {
  margin: 0.5rem 0; padding: 0.5rem; border: 1px solid var(--c-border);
  border-radius: var(--radius-lg, 4px); background: var(--c-bg);
  display: flex; flex-direction: column; gap: 0.4rem;
}
.pkc-ew-preview-img {
  max-width: 100%; max-height: 60vh; height: auto; display: block;
  object-fit: contain; background: var(--c-surface);
  border-radius: var(--radius);
}
.pkc-ew-preview-pdf {
  width: 100%; height: 60vh; border: 1px solid var(--c-border);
  border-radius: var(--radius); background: var(--c-surface);
}
.pkc-ew-preview-video {
  max-width: 100%; max-height: 60vh; display: block;
  border-radius: var(--radius); background: #000;
}
.pkc-ew-preview-audio {
  width: 100%; display: block;
}
.pkc-ew-preview-html {
  width: 100%; height: 60vh; border: 1px solid var(--c-border);
  border-radius: var(--radius); background: var(--c-surface);
}
.pkc-ew-preview-none {
  font-size: 0.8rem; color: var(--c-muted); padding: 0.4rem 0.2rem;
  font-style: italic;
}
.pkc-ew-sandbox-note {
  font-size: 0.7rem; color: var(--c-muted); font-family: var(--font-mono);
}
.pkc-ew-preview-reason {
  margin: 0.5rem 0; padding: 0.4rem 0.6rem;
  border: 1px dashed var(--c-border); border-radius: var(--radius);
  background: var(--c-surface); color: var(--c-muted);
  font-size: 0.75rem; line-height: 1.5;
}
.pkc-ew-action-row {
  display: flex; gap: 0.4rem; flex-wrap: wrap; margin-top: 0.25rem;
}

/* ── Non-image asset chip in resolved text bodies ── */
.pkc-md-rendered a[href^="#asset-"] {
  display: inline-flex; align-items: center; gap: 0.35em;
  padding: 0.1em 0.55em; margin: 0 0.15em;
  border: 1px solid var(--c-border); border-radius: 999px;
  background: var(--c-bg); color: var(--c-fg);
  text-decoration: none; font-size: 0.9em; line-height: 1.35;
  cursor: pointer;
}
.pkc-md-rendered a[href^="#asset-"]:hover {
  background: var(--c-hover); border-color: var(--c-accent-dim);
}
</style>
</head>
<body>
  <!-- Conflict banner (hidden by default) -->
  <div class="pkc-conflict-banner" id="conflict-banner"></div>
${lightSource && entry.archetype === 'attachment' ? '  <div class="pkc-light-notice" data-pkc-region="light-notice">This is a Light export — attachment file data is not available.</div>' : ''}
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

/* Phase 4 attachment preview data (empty string when no data is available). */
var pkcAttachmentData = ${escapeForScript(attachmentData)};
var pkcAttachmentMime = ${escapeForScript(attachmentMime)};
var pkcSandboxAllow = ${JSON.stringify(sandboxAllow)};
var pkcActiveBlobUrls = [];

document.getElementById('body-edit').value = originalBody;
if (document.getElementById('title-input')) {
  document.getElementById('title-input').value = originalTitle;
}

/* ── Attachment preview boot ── */
function base64ToBlob(b64, mime) {
  var bin = atob(b64);
  var len = bin.length;
  var bytes = new Uint8Array(len);
  for (var i = 0; i < len; i++) { bytes[i] = bin.charCodeAt(i); }
  return new Blob([bytes], { type: mime || 'application/octet-stream' });
}
function base64ToText(b64) {
  var bin = atob(b64);
  var bytes = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) { bytes[i] = bin.charCodeAt(i); }
  try { return new TextDecoder().decode(bytes); }
  catch (_e) { return bin; }
}
function trackBlobUrl(url) { pkcActiveBlobUrls.push(url); return url; }
function bootAttachmentPreview() {
  if (!pkcAttachmentData) return;
  var el = document.querySelector('[data-pkc-ew-preview-type]');
  if (!el) return;
  var type = el.getAttribute('data-pkc-ew-preview-type');
  var mime = el.getAttribute('data-pkc-ew-mime') || pkcAttachmentMime;
  var name = el.getAttribute('data-pkc-ew-name') || '';
  try {
    if (type === 'image') {
      var img = el.querySelector('[data-pkc-ew-slot="img"]');
      if (img) img.src = 'data:' + mime + ';base64,' + pkcAttachmentData;
    } else if (type === 'pdf') {
      var iframe = el.querySelector('[data-pkc-ew-slot="iframe"]');
      if (iframe) {
        var url = trackBlobUrl(URL.createObjectURL(base64ToBlob(pkcAttachmentData, mime)));
        iframe.src = url;
      }
    } else if (type === 'video') {
      var video = el.querySelector('[data-pkc-ew-slot="video"]');
      if (video) {
        var vurl = trackBlobUrl(URL.createObjectURL(base64ToBlob(pkcAttachmentData, mime)));
        video.src = vurl;
      }
    } else if (type === 'audio') {
      var audio = el.querySelector('[data-pkc-ew-slot="audio"]');
      if (audio) {
        var aurl = trackBlobUrl(URL.createObjectURL(base64ToBlob(pkcAttachmentData, mime)));
        audio.src = aurl;
      }
    } else if (type === 'html' || type === 'svg') {
      var htmlIframe = el.querySelector('[data-pkc-ew-slot="iframe"]');
      if (htmlIframe) {
        var allow = ['allow-same-origin'];
        for (var i = 0; i < pkcSandboxAllow.length; i++) {
          if (pkcSandboxAllow[i] !== 'allow-same-origin') allow.push(pkcSandboxAllow[i]);
        }
        htmlIframe.setAttribute('sandbox', allow.join(' '));
        htmlIframe.srcdoc = base64ToText(pkcAttachmentData);
        var note = el.querySelector('[data-pkc-ew-slot="sandbox-note"]');
        if (note) note.textContent = 'Sandbox: ' + allow.join(', ');
      }
    }
  } catch (_e) {
    /* Preview boot errors fall back silently — the info card + action row remain visible. */
  }
}
function openAttachmentInNewTab() {
  if (!pkcAttachmentData) return;
  var url = URL.createObjectURL(base64ToBlob(pkcAttachmentData, pkcAttachmentMime));
  window.open(url, '_blank', 'noopener');
  setTimeout(function() { URL.revokeObjectURL(url); }, 1500);
}
function downloadAttachmentFromChild() {
  if (!pkcAttachmentData) return;
  var blob = base64ToBlob(pkcAttachmentData, pkcAttachmentMime);
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  var name = (document.querySelector('[data-pkc-ew-preview-type]') || { getAttribute: function() { return ''; } }).getAttribute('data-pkc-ew-name');
  a.download = name || 'attachment';
  document.body.appendChild(a);
  a.click();
  setTimeout(function() {
    if (a.parentNode) a.parentNode.removeChild(a);
    URL.revokeObjectURL(url);
  }, 500);
}
document.addEventListener('click', function(e) {
  var target = e.target;
  /* Non-image asset chip click: route download through the parent window. */
  var chip = target && target.closest ? target.closest('a[href^="#asset-"]') : null;
  if (chip) {
    e.preventDefault();
    var key = chip.getAttribute('href').slice('#asset-'.length);
    if (key && window.opener) {
      try { window.opener.postMessage({ type: 'pkc-entry-download-asset', assetKey: key }, '*'); }
      catch (_e) { /* parent closed or cross-origin */ }
    }
    return;
  }
  var actionBtn = target && target.closest ? target.closest('[data-pkc-ew-action]') : null;
  if (actionBtn) {
    var action = actionBtn.getAttribute('data-pkc-ew-action');
    if (action === 'open-attachment') { e.preventDefault(); openAttachmentInNewTab(); return; }
    if (action === 'download-attachment') { e.preventDefault(); downloadAttachmentFromChild(); return; }
  }
});
window.addEventListener('unload', function() {
  for (var i = 0; i < pkcActiveBlobUrls.length; i++) {
    try { URL.revokeObjectURL(pkcActiveBlobUrls[i]); } catch (_e) { /* ignore */ }
  }
});
bootAttachmentPreview();

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
