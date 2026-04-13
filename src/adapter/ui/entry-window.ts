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
 *   Child → Parent: { type: 'pkc-entry-task-toggle', lid, taskIndex, logId }
 */

import type { Entry } from '../../core/model/record';
import { renderMarkdown } from '../../features/markdown/markdown-render';
import { extractTocFromEntry, renderStaticTocHtml } from '../../features/markdown/markdown-toc';
import { formatLogTimestampWithSeconds } from '../../features/textlog/textlog-body';
import { buildTextlogDoc } from '../../features/textlog/textlog-doc';
import {
  resolveAssetReferences,
  hasAssetReferences,
  type AssetResolutionContext,
} from '../../features/markdown/asset-resolver';
import { parseTodoBody, formatTodoDate, isTodoPastDue } from '../../features/todo/todo-body';
import {
  parseAttachmentBody,
  classifyPreviewType,
  isSvg,
} from './attachment-presenter';
import { parseFormBody, formPresenter } from './form-presenter';
import { textlogPresenter } from './textlog-presenter';
import { todoPresenter } from './todo-presenter';

/**
 * Expose renderMarkdown on the parent window so child windows
 * can call it via window.opener.pkcRenderMarkdown().
 * This ensures preview rendering in the child window uses the
 * exact same markdown-it instance as the parent.
 */
(window as unknown as Record<string, unknown>).pkcRenderMarkdown = renderMarkdown;

/**
 * Per-lid preview resolver contexts.
 *
 * Captured at `openEntryWindow` time from the current container and
 * used by `pkcRenderEntryPreview(lid, text)` (exposed on the parent
 * `window` below) so that the child window's edit-mode Preview tab
 * can resolve `![alt](asset:key)` image embeds and
 * `[label](asset:key)` non-image chips in the textarea's current
 * contents before handing the string to `renderMarkdown()`.
 *
 * Snapshot semantics: the context is taken once at window-open time
 * and then pushed to the child via `pushPreviewContextUpdate` on
 * subsequent updates (duplicate-open, attachment add/remove). The
 * child keeps its own local copy, so the parent map is primarily the
 * initial seed and a fallback for the first render before any push
 * has arrived. It is cleared on child close.
 */
const previewResolverContexts = new Map<string, AssetResolutionContext>();

/**
 * Render a textarea body string as the entry-window preview, running
 * asset reference resolution against the captured per-lid context
 * first when the text contains any `asset:` references. Exposed on
 * the parent `window` so the child window's inline `<script>` can
 * call it via `window.opener.pkcRenderEntryPreview(lid, text, ctx?)`.
 *
 * - The third argument `overrideCtx` is supplied by the child window
 *   when it has a locally-stored preview context from an earlier
 *   `pkc-entry-update-preview-ctx` live-refresh push. When present,
 *   it takes precedence over the parent's per-lid map so a freshly
 *   pushed snapshot wins over the stale initial one.
 * - If no override is given and no context is registered for the
 *   given lid (non-text archetype or no references at open time),
 *   the function is a plain wrapper around `renderMarkdown()` —
 *   identical to the legacy `pkcRenderMarkdown` path.
 * - If the current text has no `asset:` reference, the resolver is
 *   skipped and `renderMarkdown()` is called directly. This keeps the
 *   common typing path cheap.
 */
function renderEntryPreview(
  lid: string,
  text: string,
  overrideCtx?: AssetResolutionContext | null,
): string {
  const ctx = overrideCtx ?? previewResolverContexts.get(lid);
  if (ctx && text && hasAssetReferences(text)) {
    const resolved = resolveAssetReferences(text, ctx);
    return renderMarkdown(resolved);
  }
  return renderMarkdown(text ?? '');
}
(window as unknown as Record<string, unknown>).pkcRenderEntryPreview = renderEntryPreview;

/** Track open child windows to prevent duplicates. */
const openWindows = new Map<string, Window>();

/**
 * Return the set of lids for which an entry-window child is currently
 * open. Used by the main-window state subscriber to decide which open
 * children should receive a live preview-context refresh when the
 * container's asset state changes (e.g. an attachment entry added or
 * removed between the initial open and now).
 *
 * The returned array is a snapshot — callers iterating over it may
 * safely dispatch `pushPreviewContextUpdate` or similar without
 * worrying about concurrent mutation of the underlying map.
 *
 * Closed children that the close-poller has not yet cleaned up are
 * filtered out here so callers never receive a stale lid that would
 * make `pushPreviewContextUpdate` post to a dead child.
 */
export function getOpenEntryWindowLids(): string[] {
  const lids: string[] = [];
  for (const [lid, child] of openWindows) {
    if (!child.closed) lids.push(lid);
  }
  return lids;
}

/**
 * Private message type name used for the parent → child live refresh
 * of the edit-mode Preview resolver context. Exported so the test
 * harness and adjacent adapter code can reference the exact string
 * without re-hard-coding it.
 *
 * Payload shape:
 *   { type: 'pkc-entry-update-preview-ctx', previewCtx: AssetResolutionContext }
 *
 * Direction:
 *   parent → child (the child listens for this message; the parent
 *   never receives it).
 *
 * Scope:
 *   affects ONLY the child's edit-mode Preview tab resolver. The
 *   child's view-pane HTML (already written at open time) is not
 *   redrawn, the Source textarea is not touched, and no other state
 *   is changed. A separate message type is introduced below
 *   (`ENTRY_WINDOW_VIEW_BODY_UPDATE_MSG`) for view-pane rerender —
 *   see `edit-preview-asset-resolution.md`, "Child view-pane rerender
 *   foundation".
 */
export const ENTRY_WINDOW_PREVIEW_CTX_UPDATE_MSG = 'pkc-entry-update-preview-ctx';

/**
 * Private message type name used for the parent → child rerender of
 * the view-pane body (`#body-view`). Exported so the test harness and
 * future wiring code can reference the exact string without
 * re-hard-coding it.
 *
 * Payload shape:
 *   { type: 'pkc-entry-update-view-body', viewBody: string }
 *
 * The `viewBody` field is a **fully rendered HTML string** produced by
 * the parent (markdown render + asset resolution already applied). The
 * child treats the payload as trusted HTML — same trust domain as the
 * initial `document.write` at window-open time — and writes it
 * directly into `#body-view.innerHTML`.
 *
 * Direction:
 *   parent → child (the child listens for this message; the parent
 *   never receives it).
 *
 * Scope — what this rerender touches:
 *   - ONLY `#body-view.innerHTML`
 *
 * Scope — what this rerender does NOT touch:
 *   - `#body-edit` (Source textarea) — user's in-progress edit is
 *     preserved verbatim
 *   - `#body-preview` (edit-mode Preview tab's scratch div) — that
 *     path is owned by `ENTRY_WINDOW_PREVIEW_CTX_UPDATE_MSG` and runs
 *     independently
 *   - `#title-display` / `#title-input` — title sync is a separate
 *     concern (if needed) and not part of this foundation
 *   - any other DOM, CSS, scroll, or tab state
 *
 * Intentionally out of scope for this foundation Issue:
 *   - automatic wiring into the dispatcher state stream (callers must
 *     invoke `pushViewBodyUpdate` explicitly; no auto-subscriber
 *     exists yet)
 *   - dirty state / conflict resolution with in-progress edits
 *   - non-text / non-textlog archetypes — attachment / todo / form
 *     have different `#body-view` contents (preview card, kanban
 *     card, etc.) and would be destroyed by innerHTML replacement
 *   - main-window Source/Preview tab introduction
 */
export const ENTRY_WINDOW_VIEW_BODY_UPDATE_MSG = 'pkc-entry-update-view-body';

/**
 * Push a fresh preview resolver context snapshot to an already-open
 * child window, updating both the parent-side map and the child's
 * local copy via postMessage.
 *
 * This is the live-refresh foundation: callers that know the parent
 * container's asset state has changed (e.g. an attachment was added
 * or removed) can invoke this helper to make the child's Preview tab
 * see the new state on its next render, without the user having to
 * close and re-open the entry window.
 *
 * Behavior:
 *   - Always updates `previewResolverContexts[lid]` so the parent-side
 *     fallback stays in sync with the latest snapshot.
 *   - If a child window is open for this lid, sends a
 *     `pkc-entry-update-preview-ctx` postMessage carrying the new
 *     context. The child stores it locally and uses it as the
 *     override argument to `pkcRenderEntryPreview` on the next render.
 *   - If no child is open, this is effectively a parent-side map
 *     update only (which still matters for the duplicate-open path
 *     and for any future child reopen).
 *
 * Intentionally out of scope:
 *   - Does NOT redraw the child's view-pane HTML.
 *   - Does NOT touch the child's Source textarea.
 *   - Does NOT participate in the save/conflict/download protocols.
 *   - Does NOT synchronize state across multiple windows for the same
 *     lid (duplicate-open is handled separately in `openEntryWindow`).
 *
 * Returns `true` when a postMessage was dispatched to a live child,
 * `false` when only the parent-side map was updated.
 */
export function pushPreviewContextUpdate(
  lid: string,
  previewCtx: AssetResolutionContext,
): boolean {
  previewResolverContexts.set(lid, previewCtx);
  const child = openWindows.get(lid);
  if (child && !child.closed) {
    child.postMessage(
      { type: ENTRY_WINDOW_PREVIEW_CTX_UPDATE_MSG, previewCtx },
      '*',
    );
    return true;
  }
  return false;
}

/**
 * Push a rerender of the child's view-pane body (`#body-view`).
 *
 * This is the view-pane rerender **foundation** — counterpart to
 * `pushPreviewContextUpdate`, but targeting the view-mode body HTML
 * instead of the edit-mode Preview resolver context. Callers that
 * already know the parent-side resolved-body string has changed
 * (e.g. because container assets were mutated and the caller re-ran
 * `resolveAssetReferences` for this entry) can invoke this helper to
 * replace the child's `#body-view.innerHTML` on the spot, without
 * closing and reopening the window.
 *
 * Contract:
 *   - Parent runs `renderMarkdown(resolvedBody || '')` using the same
 *     safe markdown settings as the initial `renderViewBody` default
 *     branch, with the same `(empty)` fallback when the render result
 *     is an empty string. The caller therefore does not need to worry
 *     about renderer configuration drift.
 *   - The rendered HTML string is sent to the child as
 *     `{ type: 'pkc-entry-update-view-body', viewBody }` via
 *     postMessage.
 *   - The child listener replaces ONLY `#body-view.innerHTML`. No
 *     other DOM in the child is touched (see
 *     `ENTRY_WINDOW_VIEW_BODY_UPDATE_MSG` JSDoc for the full scope /
 *     non-scope list).
 *
 * Caller responsibility:
 *   - Only invoke this for `text` / `textlog` archetypes. Other
 *     archetypes (`attachment`, `todo`, `form`, `folder`) use
 *     dedicated card renderers whose HTML would be destroyed by a
 *     markdown-rendered replacement. The helper itself is archetype-
 *     agnostic and does no gating; archetype filtering lives at the
 *     call site.
 *   - Pass a `resolvedBody` string that has already been through
 *     `resolveAssetReferences` (or the caller's equivalent). Passing
 *     a raw `entry.body` without resolving `asset:` references is
 *     valid but will produce a view that lacks inline data-URI
 *     embeds / chip anchors for referenced assets.
 *
 * Intentionally out of scope:
 *   - Does NOT auto-subscribe to dispatcher state changes. Unlike
 *     `pushPreviewContextUpdate`, which has an
 *     `entry-window-live-refresh.ts` wiring layer on top of it, this
 *     helper has no live-wiring counterpart yet — it is foundation
 *     only. Wiring (and the associated dirty-state policy for
 *     unsaved edits in the Source textarea) is a separate Issue.
 *   - Does NOT touch the child's `#body-edit` textarea. The user's
 *     in-progress edit is never replaced, moved, or cleared by this
 *     helper.
 *   - Does NOT touch the child's `#body-preview`, `#title-display`,
 *     `#title-input`, or any other DOM node.
 *   - Does NOT update the parent-side `previewResolverContexts` map
 *     (that is the `pushPreviewContextUpdate` responsibility; the
 *     two helpers are deliberately independent).
 *   - Does NOT perform any dirty-state / conflict-resolution
 *     protocol handshake with the child.
 *
 * Returns `true` when a postMessage was dispatched to a live child,
 * `false` when no open window exists for the lid (or the child has
 * been closed).
 */
export function pushViewBodyUpdate(
  lid: string,
  resolvedBody: string,
): boolean {
  const child = openWindows.get(lid);
  if (!child || child.closed) return false;
  const html =
    renderMarkdown(resolvedBody || '') ||
    '<em style="color:var(--c-muted)">(empty)</em>';
  child.postMessage(
    { type: ENTRY_WINDOW_VIEW_BODY_UPDATE_MSG, viewBody: html },
    '*',
  );
  return true;
}

/**
 * Build the day-grouped TEXTLOG view-body HTML string used by both the
 * initial parent-side render (`renderViewBody`) and the post-save
 * rerender paths (`pushTextlogViewBodyUpdate`, child-side
 * `renderBodyView`).
 *
 * Slice 4-A unifies the rendered viewer with the live viewer's common
 * builder: `buildTextlogDoc(entry, { order: 'asc' })` drives a
 * `<section id="day-…"><article id="log-…">` tree that matches the
 * structure emitted by `textlogPresenter.renderBody` (see
 * `docs/development/textlog-viewer-and-linkability-redesign.md`).
 *
 * Differences from the live viewer:
 *   - `order: 'asc'` — chronological, natural document order.
 *   - No append area, no flag-toggle / copy-anchor buttons — the
 *     entry-window view pane is read-oriented; in-place mutation
 *     happens via the edit pane (structured editor).
 *   - Asset-reference resolution is NOT applied here. The entry-window
 *     rendered viewer has historically rendered TEXTLOG as raw
 *     markdown; Slice 4-A preserves that behavior rather than
 *     introducing new asset semantics. Asset support for TEXTLOG
 *     rendered viewer is a separate concern.
 */
function buildTextlogViewBodyHtml(lid: string, body: string): string {
  const stubEntry: Entry = {
    lid,
    archetype: 'textlog',
    title: '',
    body,
    created_at: '',
    updated_at: '',
  };
  const doc = buildTextlogDoc(stubEntry, { order: 'asc' });
  if (doc.sections.length === 0) {
    return '<em style="color:var(--c-muted)">(empty)</em>';
  }
  const parts: string[] = [];
  parts.push(
    `<div class="pkc-textlog-document" data-pkc-region="textlog-document">`,
  );
  for (const section of doc.sections) {
    const dayId =
      section.dateKey === '' ? 'day-undated' : `day-${section.dateKey}`;
    const dayTitle = section.dateKey === '' ? 'Undated' : section.dateKey;
    parts.push(
      `<section class="pkc-textlog-day" id="${escapeForAttr(dayId)}" data-pkc-date-key="${escapeForAttr(section.dateKey)}">`,
      `<header class="pkc-textlog-day-header"><h2 class="pkc-textlog-day-title">${escapeForHtml(dayTitle)}</h2></header>`,
    );
    for (const log of section.logs) {
      const importantAttr = log.flags.includes('important')
        ? ' data-pkc-log-important="true"'
        : '';
      const bodyHtml = renderMarkdown(log.bodySource || '') || '';
      parts.push(
        `<article class="pkc-textlog-log" id="log-${escapeForAttr(log.id)}" data-pkc-log-id="${escapeForAttr(log.id)}" data-pkc-lid="${escapeForAttr(lid)}"${importantAttr}>`,
        `<header class="pkc-textlog-log-header">`,
        `<span class="pkc-textlog-timestamp" title="${escapeForAttr(log.createdAt)}">${escapeForHtml(formatLogTimestampWithSeconds(log.createdAt))}</span>`,
        `</header>`,
        `<div class="pkc-textlog-text pkc-md-rendered">${bodyHtml}</div>`,
        `</article>`,
      );
    }
    parts.push(`</section>`);
  }
  parts.push(`</div>`);
  return parts.join('');
}

/**
 * Expose the TEXTLOG view-body builder on the parent window so the
 * child window's inline `<script>` can re-render its view pane after a
 * save (`renderBodyView` in the child). Keeping the day-grouping logic
 * on the parent side avoids duplicating `buildTextlogDoc` /
 * `formatLogTimestampWithSeconds` / `renderMarkdown` in the child's
 * inline JS string.
 */
(window as unknown as Record<string, unknown>).pkcRenderTextlogViewBody =
  buildTextlogViewBodyHtml;

/**
 * Push a TEXTLOG view-body update with per-log-entry rendering so the
 * child retains `data-pkc-log-id` markers for task toggle identification.
 */
export function pushTextlogViewBodyUpdate(
  lid: string,
  textlogBody: string,
): boolean {
  const child = openWindows.get(lid);
  if (!child || child.closed) return false;
  const html = buildTextlogViewBodyHtml(lid, textlogBody);
  child.postMessage(
    { type: ENTRY_WINDOW_VIEW_BODY_UPDATE_MSG, viewBody: html },
    '*',
  );
  return true;
}

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
  /**
   * For text / textlog archetype entries: snapshot of the resolver
   * input context (assets + mimeByKey + nameByKey) captured at window
   * open time. When present, `openEntryWindow` registers it under
   * `previewResolverContexts[entry.lid]` so the edit-mode Preview tab
   * can resolve asset references against the same container state
   * that produced `resolvedBody`. Cleared when the child closes.
   */
  previewCtx?: AssetResolutionContext;
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
  onTaskToggle?: (lid: string, taskIndex: number, logId: string | null) => void,
  startEditing = false,
): void {
  // ── Duplicate-open path ─────────────────────────────
  // If a child window for this lid is already open, we do NOT create
  // a second child. Instead, we refresh the preview resolver context
  // so the next time the user switches to the Preview tab the edit-
  // mode asset resolver works against the freshest container snapshot
  // (attachments added / removed between the first open and now).
  //
  // The refresh routes through `pushPreviewContextUpdate`, which both
  // updates the parent-side map AND live-pushes the new snapshot to
  // the child via `pkc-entry-update-preview-ctx` postMessage. The
  // child's view-pane HTML (already written at open time) is NOT
  // touched — redrawing it would require a separate rerender protocol
  // which is deliberately out of scope (see
  // `edit-preview-asset-resolution.md`, "Live refresh foundation").
  //
  // If the caller did not pass a `previewCtx`, the existing context
  // (if any) is preserved rather than cleared — the caller asked to
  // focus an already-open window, not to downgrade its state.
  const existing = openWindows.get(entry.lid);
  if (existing && !existing.closed) {
    if (assetContext?.previewCtx) {
      pushPreviewContextUpdate(entry.lid, assetContext.previewCtx);
    }
    existing.focus();
    return;
  }

  const child = window.open('', `pkc-entry-${entry.lid}`, 'width=720,height=600,menubar=no,toolbar=no');
  if (!child) return;

  openWindows.set(entry.lid, child);

  // Register the edit-mode Preview resolver context so the child's
  // `pkcRenderEntryPreview(lid, text)` call can resolve asset
  // references as the user types in the Source textarea.
  if (assetContext?.previewCtx) {
    previewResolverContexts.set(entry.lid, assetContext.previewCtx);
  }

  const openedAt = entry.updated_at;

  child.document.open();
  child.document.write(buildWindowHtml(entry, readonly, lightSource, assetContext, startEditing));
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
    if (e.data.type === 'pkc-entry-task-toggle') {
      if (typeof e.data.taskIndex === 'number' && onTaskToggle) {
        const logId = typeof e.data.logId === 'string' ? e.data.logId : null;
        onTaskToggle(e.data.lid, e.data.taskIndex, logId);
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
      previewResolverContexts.delete(entry.lid);
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
    '--c-text', '--c-text-dim', '--c-info',
    '--font-sans', '--font-mono',
    '--radius', '--radius-lg', '--radius-sm',
    '--shadow-sm', '--glow', '--transition-fast',
    // Syntax-highlight token colors — forward them so fenced code
    // blocks inside a popped-out entry window match the main-app
    // palette (see styles/base.css and
    // docs/development/markdown-code-block-highlighting.md).
    '--c-tok-comment', '--c-tok-string', '--c-tok-keyword',
    '--c-tok-number', '--c-tok-builtin', '--c-tok-variable',
    '--c-tok-type', '--c-tok-attr', '--c-tok-tag', '--c-tok-meta',
    '--c-tok-ins', '--c-tok-del', '--c-tok-hunk',
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
    case 'textlog': {
      // TEXTLOG: render as a day-grouped document tree matching the
      // live viewer (see `buildTextlogViewBodyHtml`). Each log article
      // carries the `data-pkc-log-id` marker the child-side task-toggle
      // click handler relies on.
      return buildTextlogViewBodyHtml(entry.lid, entry.body);
    }
    default: {
      // Text / generic: use the pre-resolved body when the parent
      // provided one, so that `![](asset:…)` embeds and
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

/**
 * Sync DOM properties to HTML attributes/content so that `.outerHTML`
 * serializes form element values correctly.
 *
 * Background: presenters set `textarea.value`, `select.value`, and
 * `checkbox.checked` as DOM properties. These are NOT reflected in
 * `.outerHTML` output. Since entry-window injects editor HTML via
 * `document.write(outerHTML)`, the values are lost without this step.
 *
 * This is not a bug workaround — it is the serialization contract for
 * any DOM tree that will be injected into entry-window via outerHTML.
 *
 * If new form element types are added to presenters (e.g. radio,
 * contenteditable), this function must be extended.
 */
function syncDomPropertiesToHtml(root: HTMLElement): void {
  for (const ta of root.querySelectorAll('textarea')) {
    ta.textContent = ta.value;
  }
  for (const sel of root.querySelectorAll('select')) {
    for (const opt of sel.options) {
      if (opt.value === sel.value) opt.setAttribute('selected', '');
      else opt.removeAttribute('selected');
    }
  }
  for (const chk of root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) {
    if (chk.checked) chk.setAttribute('checked', '');
    else chk.removeAttribute('checked');
  }
}

function buildWindowHtml(
  entry: Entry,
  readonly: boolean,
  lightSource = false,
  assetContext?: EntryWindowAssetContext,
  startEditing = false,
): string {
  const escapedTitle = escapeForAttr(entry.title || '');
  const renderedBody = renderViewBody(entry, lightSource, assetContext);
  // Static TOC HTML for TEXT / TEXTLOG — the extractor returns `[]`
  // for other archetypes so this is just `''` there. Every anchor
  // is a native `href="#id"` so scroll works without any JS.
  const tocHtml = renderStaticTocHtml(extractTocFromEntry(entry as Entry));
  const parentVars = getParentCssVars();

  // Generate archetype-specific editor body for structured types.
  // For textlog/todo/form, use the presenter to produce a structured
  // editor matching the center pane. For all other archetypes, keep
  // the existing textarea + Source/Preview tabs.
  const structuredArchetypes = new Set(['textlog', 'todo', 'form']);
  const useStructuredEditor = structuredArchetypes.has(entry.archetype);
  let editorBodyHtml = '';
  if (useStructuredEditor) {
    const presenterMap: Record<string, { renderEditorBody: (e: Entry) => HTMLElement }> = {
      textlog: textlogPresenter,
      todo: todoPresenter,
      form: formPresenter,
    };
    const presenter = presenterMap[entry.archetype];
    if (presenter) {
      const el = presenter.renderEditorBody(entry);
      syncDomPropertiesToHtml(el);
      editorBodyHtml = el.outerHTML;
    }
  }

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
  /* Slice C: flex column so edit-pane (data-pkc-wide) can flex:1 fill height. */
  display: flex;
  flex-direction: column;
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
  /* Pin the same 1.35 baseline as main base.css .pkc-md-rendered,
     so prose density cannot drift from the center pane. */
  line-height: 1.35;
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
/* Syntax highlight tokens — inherits colors from the main window
   via getParentCssVars(). Kept in sync with styles/base.css. */
.pkc-md-rendered pre code .pkc-tok-comment { color: var(--c-tok-comment); font-style: italic; }
.pkc-md-rendered pre code .pkc-tok-string { color: var(--c-tok-string); }
.pkc-md-rendered pre code .pkc-tok-keyword { color: var(--c-tok-keyword); font-weight: 600; }
.pkc-md-rendered pre code .pkc-tok-number { color: var(--c-tok-number); }
.pkc-md-rendered pre code .pkc-tok-builtin { color: var(--c-tok-builtin); }
.pkc-md-rendered pre code .pkc-tok-variable { color: var(--c-tok-variable); }
.pkc-md-rendered pre code .pkc-tok-type { color: var(--c-tok-type); }
.pkc-md-rendered pre code .pkc-tok-attr { color: var(--c-tok-attr); }
.pkc-md-rendered pre code .pkc-tok-punct { color: var(--c-text-dim); }
.pkc-md-rendered pre code .pkc-tok-regex { color: var(--c-tok-string); }
.pkc-md-rendered pre code .pkc-tok-tag { color: var(--c-tok-tag); }
.pkc-md-rendered pre code .pkc-tok-meta { color: var(--c-tok-meta); }
.pkc-md-rendered pre code .pkc-tok-ins { color: var(--c-tok-ins); }
.pkc-md-rendered pre code .pkc-tok-del { color: var(--c-tok-del); }
.pkc-md-rendered pre code .pkc-tok-hunk { color: var(--c-tok-hunk); font-weight: 600; }
.pkc-md-rendered blockquote {
  border-left: 3px solid var(--c-accent); padding-left: 0.75em;
  margin: 0.35em 0; color: var(--c-muted);
}
.pkc-md-rendered hr { border: none; border-top: 1px solid var(--c-border); margin: 0.5em 0; }
.pkc-md-rendered img { max-width: 100%; height: auto; }
.pkc-md-rendered a { color: var(--c-accent); text-decoration: underline; }
.pkc-md-rendered table { border-collapse: collapse; margin: 0.35em 0; }
.pkc-md-rendered th, .pkc-md-rendered td { border: 1px solid var(--c-border); padding: 0.3em 0.5em; }
/* Preview-surface Table of Contents. Mirrors base.css .pkc-toc
   so the popped-out preview exposes the same heading / day / log
   navigation the right pane carries. Anchors are native href to
   #id, so click scrolls via the browsers default anchor behaviour. */
.pkc-toc.pkc-toc-preview {
  padding: 0.35rem 0.5rem;
  margin: 0 0 0.75rem;
  border: 1px solid var(--c-border);
  border-radius: var(--radius-sm);
  background: var(--c-surface);
  font-size: 0.8rem;
}
.pkc-toc-preview .pkc-toc-label {
  display: block;
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--c-muted);
  margin-bottom: 0.2rem;
}
.pkc-toc-preview .pkc-toc-list { list-style: none; margin: 0; padding: 0; }
.pkc-toc-preview .pkc-toc-item { margin: 0; padding: 0; }
.pkc-toc-preview .pkc-toc-item[data-pkc-toc-level="2"] { padding-left: 0.75rem; }
.pkc-toc-preview .pkc-toc-item[data-pkc-toc-level="3"] { padding-left: 1.5rem; }
.pkc-toc-preview .pkc-toc-item[data-pkc-toc-level="4"] { padding-left: 2.25rem; }
.pkc-toc-preview .pkc-toc-item[data-pkc-toc-level="5"] { padding-left: 3rem; }
.pkc-toc-preview .pkc-toc-link {
  display: block;
  padding: 0.08rem 0.25rem;
  color: var(--c-fg);
  text-decoration: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  border-radius: var(--radius-sm);
}
.pkc-toc-preview .pkc-toc-link:hover,
.pkc-toc-preview .pkc-toc-link:focus-visible {
  background: var(--c-border);
  color: var(--c-accent);
}
.pkc-toc-preview .pkc-toc-item[data-pkc-toc-kind="day"] > .pkc-toc-link,
.pkc-toc-preview .pkc-toc-item[data-pkc-toc-kind="log"] > .pkc-toc-link {
  color: var(--c-muted);
  font-family: var(--font-mono);
  font-size: 0.72rem;
}
.pkc-toc-preview .pkc-toc-item[data-pkc-toc-kind="day"] > .pkc-toc-link {
  font-weight: 600;
}

/* ── Task checkbox: interactive in view mode, disabled when readonly ── */
.pkc-task-checkbox { cursor: pointer; }
${readonly ? '.pkc-task-checkbox { pointer-events: none; cursor: default; opacity: 0.6; }' : ''}

/* ── Editor (mirrors center pane) ── */
.pkc-editor { max-width: 720px; }
/* Slice C: non-structured edit pane follows pane/viewport instead of 720px cap.
   See docs/development/ui-readability-and-editor-sizing-hardening.md §3-C. */
.pkc-editor[data-pkc-wide="true"] {
  max-width: none;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
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
/* Slice C: non-structured dblclick editor textarea follows viewport height.
   flex:1 fills the edit-pane column; min-height ensures usable size when
   the pane column is short (e.g., on very small windows).
   See docs/development/ui-readability-and-editor-sizing-hardening.md §3-C. */
.pkc-editor-body[data-pkc-viewport-sized="true"] {
  flex: 1;
  min-height: calc(100vh - 12rem);
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

/* ── Pending view-refresh notice ──
   Shown when a parent → child view-body rerender was received while
   the child was dirty (body-edit or title-input differs from the
   saved originals). The actual DOM replacement is deferred until the
   user cancels or saves — see the "Dirty state policy for view
   rerender" Issue and docs/development/edit-preview-asset-resolution.md.
   Hidden by default via the inline style attribute on the element. */
.pkc-pending-view-notice {
  background: var(--c-surface); color: var(--c-muted);
  border-left: 3px solid var(--c-accent-dim);
  padding: 0.35rem 0.6rem; font-size: 0.75rem; margin: 0.5rem 0;
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
/* ── Task completion badge ── */
.pkc-task-badge {
  font-size: 0.7rem;
  color: var(--c-muted);
  white-space: nowrap;
  flex-shrink: 0;
}
.pkc-task-badge[data-pkc-task-complete="true"] {
  color: var(--c-success);
}
/* ── TEXTLOG rendered view (day-grouped document) ──
 * Slice 4-A mirrors base.css (see
 * docs/development/textlog-viewer-and-linkability-redesign.md). The
 * rendered viewer emits the same <section id="day-…"><article id="log-…">
 * structure as the live viewer so anchors and DOM ids line up across
 * surfaces. DOM order is header → text so plain-text reading starts
 * with the timestamp.
 */
.pkc-textlog-document { display: flex; flex-direction: column; gap: 0.75rem; }
.pkc-textlog-day { display: flex; flex-direction: column; gap: 0.35rem; }
.pkc-textlog-day-header {
  padding: 0.15rem 0 0.25rem;
  border-bottom: 1px solid var(--c-border);
}
.pkc-textlog-day-title {
  margin: 0;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--c-muted);
  font-family: var(--font-mono);
  letter-spacing: 0.02em;
}
.pkc-textlog-log {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.5rem 0.5rem 0.6rem;
  border-left: 3px solid var(--c-border);
  font-size: 0.85rem;
}
.pkc-textlog-log + .pkc-textlog-log {
  border-top: 1px solid var(--c-border);
  padding-top: 0.6rem;
}
.pkc-textlog-log[data-pkc-log-important="true"] {
  border-left-color: #f5a623;
  border-left-width: 4px;
  background: rgba(245,166,35,0.12);
  padding-left: 0.6rem;
}
.pkc-textlog-log[data-pkc-log-important="true"] .pkc-textlog-text {
  font-weight: 600;
  color: var(--c-fg);
}
.pkc-textlog-log-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.pkc-textlog-log .pkc-textlog-timestamp {
  color: var(--c-muted);
  font-size: 0.75rem;
  font-family: var(--font-mono);
  white-space: nowrap;
  padding-top: 0.1rem;
  cursor: help;
}
.pkc-textlog-log[data-pkc-log-important="true"] .pkc-textlog-timestamp {
  color: #c88a1c;
}
.pkc-textlog-text {
  color: var(--c-fg);
  white-space: pre-wrap;
  word-break: break-word;
}
/* TEXTLOG-scoped markdown density override — see base.css for the
   rationale. Kept in parity so popped-out TEXTLOG viewers read at
   the same density as the in-app view. */
.pkc-textlog-text.pkc-md-rendered { line-height: 1.3; }
.pkc-textlog-text.pkc-md-rendered > :first-child { margin-top: 0; }
.pkc-textlog-text.pkc-md-rendered > :last-child { margin-bottom: 0; }
.pkc-textlog-text p { margin: 0.2em 0; }
.pkc-textlog-text ul,
.pkc-textlog-text ol { margin: 0.2em 0; padding-left: 1.3em; }
.pkc-textlog-text li { margin: 0.05em 0; }
.pkc-textlog-text blockquote { margin: 0.25em 0; }
.pkc-textlog-text pre { margin: 0.25em 0; }

/* ── Structured editors (textlog / todo / form) ── */
.pkc-textlog-editor { display: flex; flex-direction: column; gap: 0.5rem; }
.pkc-textlog-edit-row {
  display: grid; grid-template-columns: auto auto auto 1fr;
  gap: 0.4rem; align-items: start; padding: 0.4rem;
  border: 1px solid var(--c-border); border-radius: var(--radius);
}
.pkc-textlog-edit-row[data-pkc-deleted="true"] { display: none; }
.pkc-textlog-flag-label { font-size: 0.85rem; cursor: pointer; white-space: nowrap; }
.pkc-textlog-delete-btn {
  font-size: 0.7rem; padding: 0.1rem 0.3rem;
  color: var(--c-danger, #ff4444); cursor: pointer;
  background: none; border: 1px solid var(--c-border); border-radius: var(--radius);
}
.pkc-textlog-edit-text {
  grid-column: 1 / -1; background: var(--c-surface); color: var(--c-fg);
  border: 1px solid var(--c-border); border-radius: var(--radius);
  padding: 0.3rem; font-family: var(--font-mono); font-size: 0.85rem; resize: vertical;
}
.pkc-textlog-timestamp {
  font-size: 0.75rem; color: var(--c-muted); white-space: nowrap;
  font-family: var(--font-mono);
}
.pkc-todo-editor { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 0.75rem; }
.pkc-todo-status-select {
  width: auto; max-width: 120px; font-size: 0.8rem; padding: 0.25rem 0.4rem;
  border: 1px solid var(--c-border); border-radius: var(--radius); background: var(--c-bg);
  font-family: var(--font-sans); color: var(--c-fg);
}
.pkc-todo-date-input {
  width: auto; max-width: 180px; font-size: 0.8rem; padding: 0.25rem 0.4rem;
  border: 1px solid var(--c-border); border-radius: var(--radius); background: var(--c-bg);
  font-family: var(--font-sans); color: var(--c-fg);
}
.pkc-todo-archived-label { font-size: 0.85rem; cursor: pointer; }
.pkc-todo-description-input {
  width: 100%; font-family: var(--font-mono); font-size: 0.85rem;
  padding: 0.4rem; border: 1px solid var(--c-border); border-radius: var(--radius);
  background: var(--c-surface); color: var(--c-fg); resize: vertical;
}
.pkc-form-editor { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 0.75rem; }
.pkc-form-name-input {
  width: 100%; font-size: 0.85rem; padding: 0.4rem 0.6rem;
  border: 1px solid var(--c-border); border-radius: var(--radius);
  font-family: var(--font-sans); color: var(--c-fg); background: var(--c-bg); outline: none;
}
.pkc-form-note-input {
  width: 100%; font-family: var(--font-mono); font-size: 0.85rem;
  padding: 0.4rem; border: 1px solid var(--c-border); border-radius: var(--radius);
  background: var(--c-surface); color: var(--c-fg); resize: vertical;
}
.pkc-form-check-label { font-size: 0.85rem; cursor: pointer; }
</style>
</head>
<body>
  <!-- Conflict banner (hidden by default) -->
  <div class="pkc-conflict-banner" id="conflict-banner"></div>
  <!-- Pending view-refresh notice (hidden by default) -->
  <div class="pkc-pending-view-notice" id="pending-view-notice" style="display:none">View refresh pending &mdash; will apply on save or cancel.</div>
${lightSource && entry.archetype === 'attachment' ? '  <div class="pkc-light-notice" data-pkc-region="light-notice">This is a Light export — attachment file data is not available.</div>' : ''}
  <!-- Scrollable content area -->
  <div class="pkc-window-content" id="window-content">
    <!-- View mode (initial state) -->
    <div id="view-pane">
      <div class="pkc-view-title-row">
        <h2 class="pkc-view-title" id="title-display">${escapedTitle}</h2>
        <span class="pkc-archetype-label">${entry.archetype}</span>
        <span class="pkc-task-badge" id="task-badge" style="display:none"></span>
      </div>
      ${tocHtml}
      <div class="pkc-view-body pkc-md-rendered" id="body-view">${renderedBody}</div>
    </div>

    <!-- Edit mode (hidden initially) -->
    <div id="edit-pane" class="pkc-editor"${useStructuredEditor ? '' : ' data-pkc-wide="true"'} style="display:none">
      <div class="pkc-editor-title-row">
        <input type="text" class="pkc-editor-title" id="title-input" value="">
        <span class="pkc-archetype-label">${entry.archetype}</span>
      </div>
${useStructuredEditor ? `      <div id="structured-editor">${editorBodyHtml}</div>
      <textarea class="pkc-editor-body" id="body-edit" rows="10" style="display:none"></textarea>` : `      <div class="pkc-tab-bar" id="tab-bar">
        <span class="pkc-tab" id="tab-source" data-pkc-active="true" onclick="showTab('source')">Source</span>
        <span class="pkc-tab" id="tab-preview" onclick="showTab('preview')">Preview</span>
      </div>
      <textarea class="pkc-editor-body" id="body-edit" data-pkc-viewport-sized="true"></textarea>
      <div class="pkc-view-body pkc-md-rendered" id="body-preview" style="display:none"></div>`}
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
var entryArchetype = ${escapeForScript(entry.archetype)};
var useStructuredEditor = ${useStructuredEditor ? 'true' : 'false'};
var originalTitle = ${escapeForScript(entry.title)};
var originalBody = ${escapeForScript(entry.body)};

/* Phase 4 attachment preview data (empty string when no data is available). */
var pkcAttachmentData = ${escapeForScript(attachmentData)};
var pkcAttachmentMime = ${escapeForScript(attachmentMime)};
var pkcSandboxAllow = ${JSON.stringify(sandboxAllow)};
var pkcActiveBlobUrls = [];

/*
 * Child-local edit-mode Preview resolver context.
 *
 * Starts null and is populated by 'pkc-entry-update-preview-ctx'
 * messages from the parent (see the message listener at the bottom
 * of this script). When populated, it is passed as the third arg to
 * window.opener.pkcRenderEntryPreview(lid, text, childPreviewCtx) so
 * the live-refreshed snapshot takes precedence over the parent's
 * initial per-lid map.
 *
 * Only the Preview tab reads this. The Source textarea, the view-
 * pane HTML, and the save/conflict paths do NOT touch it.
 */
var childPreviewCtx = null;

/*
 * Pending view-body HTML, stashed when a parent → child
 * 'pkc-entry-update-view-body' message arrives while the child is
 * dirty (body-edit differs from originalBody OR title-input differs
 * from originalTitle). Dirty state policy:
 *
 *   clean: apply immediately to #body-view.innerHTML, clear stash.
 *   dirty: stash here, show #pending-view-notice, do NOT touch any
 *          DOM other than the notice element.
 *
 * Flushed on dirty → clean transitions:
 *   - cancelEdit(): user discarded the edit — apply the latest
 *     stashed HTML as the now-authoritative view.
 *   - 'pkc-entry-saved' message: the save handler runs its own
 *     body-view rerender from the current textarea contents against
 *     the parent's latest container state, so the pending stash is
 *     DISCARDED (not applied) because the save path is more
 *     authoritative than any earlier snapshot.
 *
 * Holding only the MOST RECENT pending HTML is intentional: if
 * multiple updates arrive while the child is dirty, only the newest
 * one is applied on flush. Older snapshots are unreachable.
 */
var pendingViewBody = null;

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
function revokeAllBlobUrls() {
  /*
   * Revoke every URL currently tracked in pkcActiveBlobUrls and reset
   * the array. Called from (a) bootAttachmentPreview at the start so
   * any stale URLs from a previous boot invocation are torn down
   * before new ones are created, and (b) the window unload handler as
   * the last-chance cleanup. Wrapped in try/catch per entry because
   * revoking an already-revoked URL throws in some engines.
   */
  for (var i = 0; i < pkcActiveBlobUrls.length; i++) {
    try { URL.revokeObjectURL(pkcActiveBlobUrls[i]); } catch (_e) { /* ignore */ }
  }
  pkcActiveBlobUrls = [];
}
function bootAttachmentPreview() {
  /*
   * Eager revoke of any previously-tracked URLs. bootAttachmentPreview
   * is normally called exactly once per child window, but this keeps
   * the function idempotent: if a future change ever re-invokes boot
   * (e.g. a hypothetical attachment-swap feature), the prior blob URLs
   * are released before new ones are created, so the array can never
   * grow past the set of URLs actually in use by the current preview.
   */
  revokeAllBlobUrls();
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
  /*
   * Track the URL in pkcActiveBlobUrls so the window unload handler
   * revokes it if the child closes before the 1500ms setTimeout fires.
   * The setTimeout still provides a best-effort early cleanup while
   * the child is still open — ~1.5s is the standard window-open grace
   * period for new tabs to finish loading the blob.
   */
  var url = trackBlobUrl(URL.createObjectURL(base64ToBlob(pkcAttachmentData, pkcAttachmentMime)));
  window.open(url, '_blank', 'noopener');
  setTimeout(function() {
    try { URL.revokeObjectURL(url); } catch (_e) { /* ignore */ }
    /* Also prune the URL from pkcActiveBlobUrls so the unload handler
     * doesn't try to double-revoke it. Linear scan is fine — the array
     * is typically very small. */
    var idx = pkcActiveBlobUrls.indexOf(url);
    if (idx >= 0) pkcActiveBlobUrls.splice(idx, 1);
  }, 1500);
}
function downloadAttachmentFromChild() {
  if (!pkcAttachmentData) return;
  var blob = base64ToBlob(pkcAttachmentData, pkcAttachmentMime);
  /*
   * Track the URL the same way openAttachmentInNewTab does, so a close
   * before the 500ms timer still frees it via the unload handler.
   */
  var url = trackBlobUrl(URL.createObjectURL(blob));
  var a = document.createElement('a');
  a.href = url;
  var name = (document.querySelector('[data-pkc-ew-preview-type]') || { getAttribute: function() { return ''; } }).getAttribute('data-pkc-ew-name');
  a.download = name || 'attachment';
  document.body.appendChild(a);
  a.click();
  setTimeout(function() {
    if (a.parentNode) a.parentNode.removeChild(a);
    try { URL.revokeObjectURL(url); } catch (_e) { /* ignore */ }
    var idx = pkcActiveBlobUrls.indexOf(url);
    if (idx >= 0) pkcActiveBlobUrls.splice(idx, 1);
  }, 500);
}
document.addEventListener('click', function(e) {
  var target = e.target;
  /* Task checkbox toggle: route through parent for source-of-truth update. */
  if (target && target.tagName === 'INPUT' && target.hasAttribute('data-pkc-task-index')) {
    e.preventDefault();
    var taskIndex = parseInt(target.getAttribute('data-pkc-task-index'), 10);
    if (!isNaN(taskIndex) && window.opener) {
      var logRow = target.closest ? target.closest('[data-pkc-log-id]') : null;
      var logId = logRow ? logRow.getAttribute('data-pkc-log-id') : null;
      try { window.opener.postMessage({ type: 'pkc-entry-task-toggle', lid: lid, taskIndex: taskIndex, logId: logId }, '*'); }
      catch (_e) { /* parent closed */ }
    }
    return;
  }
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
window.addEventListener('pagehide', revokeAllBlobUrls);
window.addEventListener('unload', revokeAllBlobUrls);
bootAttachmentPreview();

/*
 * Returns true if the current edit-pane state differs from the saved
 * originals captured at window-open time (or refreshed by the most
 * recent 'pkc-entry-saved' message). Used exclusively by the view-
 * body rerender policy below to decide whether a parent-pushed
 * rerender should apply immediately or stash as pending.
 *
 * Intentionally a snapshot comparison: we only check at message-
 * arrival time and at cancel/save transitions. We do not install an
 * 'input' listener to track dirtiness continuously, so a user who
 * manually undoes their edit back to the original and then waits
 * will only see the pending update applied on the next explicit
 * cancel or save. This is acceptable and keeps the policy simple.
 */
function isEntryDirty() {
  var titleEl = document.getElementById('title-input');
  if (!titleEl) return false;
  if (titleEl.value !== originalTitle) return true;
  if (useStructuredEditor) {
    return collectStructuredBody() !== originalBody;
  }
  var bodyEl = document.getElementById('body-edit');
  return bodyEl ? bodyEl.value !== originalBody : false;
}

/*
 * Show / hide the pending-view-refresh notice element. The element's
 * initial hidden state is set via the inline style="display:none"
 * attribute in the HTML, so toggling to '' (auto-inherit) is enough
 * to reveal it. Both helpers are null-safe so that unit tests that
 * build a minimal DOM fragment without the notice element don't
 * throw when exercising the listener path.
 */
function showPendingViewNotice() {
  var el = document.getElementById('pending-view-notice');
  if (el) el.style.display = '';
}
function hidePendingViewNotice() {
  var el = document.getElementById('pending-view-notice');
  if (el) el.style.display = 'none';
}

/*
 * Collect body from structured editor fields. Mirrors the center pane's
 * collectBody pattern for each archetype. Returns the serialized body
 * string ready for the save protocol.
 */
function collectStructuredBody() {
  if (entryArchetype === 'textlog') {
    var hiddenBody = document.querySelector('[data-pkc-field="body"]');
    var original = { entries: [] };
    try { original = JSON.parse(hiddenBody ? hiddenBody.value : '{}'); } catch (_e) {}
    var origMap = {};
    for (var k = 0; k < original.entries.length; k++) {
      origMap[original.entries[k].id] = original.entries[k];
    }
    var rows = document.querySelectorAll('.pkc-textlog-edit-row');
    var entries = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (row.getAttribute('data-pkc-deleted') === 'true') continue;
      var logId = row.getAttribute('data-pkc-log-id');
      var textarea = row.querySelector('[data-pkc-field="textlog-entry-text"]');
      var flagChk = row.querySelector('[data-pkc-field="textlog-flag"]');
      var text = textarea ? textarea.value : '';
      var flags = flagChk && flagChk.checked ? ['important'] : [];
      var orig = origMap[logId] || {};
      entries.push({ id: logId, text: text, createdAt: orig.createdAt || new Date().toISOString(), flags: flags });
    }
    entries.reverse();
    return JSON.stringify({ entries: entries });
  }
  if (entryArchetype === 'todo') {
    var statusEl = document.querySelector('[data-pkc-field="todo-status"]');
    var descEl = document.querySelector('[data-pkc-field="todo-description"]');
    var dateEl = document.querySelector('[data-pkc-field="todo-date"]');
    var archivedEl = document.querySelector('[data-pkc-field="todo-archived"]');
    var obj = { status: statusEl && statusEl.value === 'done' ? 'done' : 'open', description: descEl ? descEl.value : '' };
    if (dateEl && dateEl.value) obj.date = dateEl.value;
    if (archivedEl && archivedEl.checked) obj.archived = true;
    return JSON.stringify(obj);
  }
  if (entryArchetype === 'form') {
    var nameEl = document.querySelector('[data-pkc-field="form-name"]');
    var noteEl = document.querySelector('[data-pkc-field="form-note"]');
    var checkedEl = document.querySelector('[data-pkc-field="form-checked"]');
    return JSON.stringify({ name: nameEl ? nameEl.value : '', note: noteEl ? noteEl.value : '', checked: checkedEl ? checkedEl.checked : false });
  }
  return document.getElementById('body-edit').value;
}

/*
 * Restore structured editor fields to their original values on cancel.
 */
function restoreStructuredEditor() {
  try {
    if (entryArchetype === 'textlog') {
      var parsed = JSON.parse(originalBody);
      if (!parsed.entries) return;
      /* Remove any deletion markers and restore original content */
      var rows = document.querySelectorAll('.pkc-textlog-edit-row');
      var origMap = {};
      var reversed = parsed.entries.slice().reverse();
      for (var k = 0; k < reversed.length; k++) origMap[reversed[k].id] = reversed[k];
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        row.removeAttribute('data-pkc-deleted');
        row.style.display = '';
        var logId = row.getAttribute('data-pkc-log-id');
        var orig = origMap[logId];
        if (orig) {
          var ta = row.querySelector('[data-pkc-field="textlog-entry-text"]');
          if (ta) ta.value = orig.text || '';
          var fl = row.querySelector('[data-pkc-field="textlog-flag"]');
          if (fl) fl.checked = (orig.flags || []).indexOf('important') >= 0;
        }
      }
    }
    if (entryArchetype === 'todo') {
      var todo = JSON.parse(originalBody);
      var s = document.querySelector('[data-pkc-field="todo-status"]');
      if (s) s.value = todo.status || 'open';
      var d = document.querySelector('[data-pkc-field="todo-description"]');
      if (d) d.value = todo.description || '';
      var dt = document.querySelector('[data-pkc-field="todo-date"]');
      if (dt) dt.value = todo.date || '';
      var ar = document.querySelector('[data-pkc-field="todo-archived"]');
      if (ar) ar.checked = !!todo.archived;
    }
    if (entryArchetype === 'form') {
      var form = JSON.parse(originalBody);
      var n = document.querySelector('[data-pkc-field="form-name"]');
      if (n) n.value = form.name || '';
      var nt = document.querySelector('[data-pkc-field="form-note"]');
      if (nt) nt.value = form.note || '';
      var ch = document.querySelector('[data-pkc-field="form-checked"]');
      if (ch) ch.checked = !!form.checked;
    }
  } catch (_e) {}
}

/*
 * Render body HTML for view mode. For TEXTLOG, delegate to the
 * parent-side day-grouped builder via window.opener so the child's
 * post-save rerender produces the exact same DOM shape as the initial
 * renderViewBody and pushTextlogViewBodyUpdate paths. For all other
 * archetypes, delegate to renderMd.
 */
function renderBodyView(body) {
  if (entryArchetype !== 'textlog') return renderMd(body);
  try {
    if (window.opener && typeof window.opener.pkcRenderTextlogViewBody === 'function') {
      return window.opener.pkcRenderTextlogViewBody(lid, body);
    }
  } catch (_e) { /* cross-origin or closed — fall through */ }
  /*
   * Fallback: legacy per-log flat rendering via renderMd. Keeps the
   * data-pkc-log-id markers so task-toggle continues to work even if
   * the opener is unavailable; lacks day grouping and log headers.
   */
  try {
    var parsed = JSON.parse(body);
    if (!parsed.entries || !parsed.entries.length) {
      return '<em style="color:var(--c-muted)">(empty)</em>';
    }
    var parts = [];
    for (var i = 0; i < parsed.entries.length; i++) {
      var le = parsed.entries[i];
      var html = renderMd(le.text || '') || '';
      parts.push('<div data-pkc-log-id="' + le.id + '">' + html + '</div>');
    }
    return parts.join('');
  } catch (_e) {
    return renderMd(body);
  }
}

/*
 * Derive task completion badge from the visible #body-view DOM.
 * Counts .pkc-task-checkbox elements to produce a done/total badge.
 * Called after every body-view innerHTML update (init, push, save, flush).
 */
function updateTaskBadge() {
  var bodyView = document.getElementById('body-view');
  var badge = document.getElementById('task-badge');
  if (!bodyView || !badge) return;
  var checkboxes = bodyView.querySelectorAll('.pkc-task-checkbox');
  if (checkboxes.length === 0) {
    badge.style.display = 'none';
    badge.removeAttribute('data-pkc-task-complete');
    return;
  }
  var done = 0;
  for (var i = 0; i < checkboxes.length; i++) {
    if (checkboxes[i].checked) done++;
  }
  badge.textContent = done + '/' + checkboxes.length;
  badge.style.display = '';
  if (done === checkboxes.length) {
    badge.setAttribute('data-pkc-task-complete', 'true');
  } else {
    badge.removeAttribute('data-pkc-task-complete');
  }
}

/*
 * Apply any stashed pendingViewBody to #body-view.innerHTML and
 * clear the stash. No-op when nothing is pending. This is the
 * canonical dirty → clean transition point invoked by cancelEdit()
 * below. The 'pkc-entry-saved' branch does NOT call this helper —
 * see pendingViewBody's JSDoc for why save discards pending instead
 * of applying it.
 */
function flushPendingViewBody() {
  if (pendingViewBody == null) return;
  var viewBodyEl = document.getElementById('body-view');
  if (viewBodyEl) viewBodyEl.innerHTML = pendingViewBody;
  pendingViewBody = null;
  hidePendingViewNotice();
  updateTaskBadge();
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
  if (!useStructuredEditor) showTab('source');
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
  if (useStructuredEditor) {
    restoreStructuredEditor();
  } else {
    document.getElementById('body-edit').value = originalBody;
  }
  document.getElementById('title-input').value = originalTitle;
  /*
   * The user just discarded in-progress edits — body-edit and
   * title-input are now back in sync with originalBody / originalTitle,
   * so isEntryDirty() would return false. If a pending view-body
   * rerender was stashed while the child was dirty, apply it now so
   * the view pane shows the freshest parent-side state.
   */
  flushPendingViewBody();
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

/*
 * Render markdown using the parent window's markdown-it instance.
 * Preference order:
 *   1. pkcRenderEntryPreview(lid, text) — resolves image embeds and
 *      non-image chips against the per-lid context captured at window
 *      open time, then renders. Used for TEXT / TEXTLOG entries.
 *   2. pkcRenderMarkdown(text) — legacy raw-markdown path, kept for
 *      non-text archetypes and parents without the new helper.
 *   3. Plain-text HTML escape — last-resort fallback if the parent is
 *      unavailable (cross-origin or closed).
 */
function renderMd(text) {
  if (!text) return '<em style="color:var(--c-muted)">(empty)</em>';
  try {
    if (window.opener && typeof window.opener.pkcRenderEntryPreview === 'function') {
      /*
       * Pass childPreviewCtx as the override so any live-refreshed
       * snapshot (pushed after open) wins over the parent's initial
       * per-lid map. When childPreviewCtx is still null (no push has
       * arrived yet), the opener falls back to the initial map — so
       * the first Preview tab switch after open keeps working.
       */
      return window.opener.pkcRenderEntryPreview(lid, text, childPreviewCtx);
    }
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
  var body = useStructuredEditor ? collectStructuredBody() : document.getElementById('body-edit').value;
  window.opener.postMessage({ type: 'pkc-entry-save', lid: lid, title: title, body: body }, '*');
  document.getElementById('status').textContent = 'Saving...';
}

window.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'pkc-entry-saved') {
    originalTitle = document.getElementById('title-input').value;
    originalBody = useStructuredEditor ? collectStructuredBody() : document.getElementById('body-edit').value;
    /* Update the view-pane body to reflect saved content */
    document.getElementById('title-display').textContent = originalTitle;
    document.getElementById('body-view').innerHTML = renderBodyView(originalBody);
    updateTaskBadge();
    document.getElementById('status').textContent = 'Saved.';
    setTimeout(function() { document.getElementById('status').textContent = ''; }, 2000);
    /*
     * Dirty state policy: save's own rerender (just above) is the
     * authoritative view — it reflects the exact text the user just
     * persisted, resolved through the parent's current container
     * state via renderMd → opener.pkcRenderEntryPreview. Any stale
     * pendingViewBody captured from an earlier parent push is
     * deliberately DISCARDED here, not applied. See pendingViewBody's
     * JSDoc at the top of this script.
     */
    pendingViewBody = null;
    hidePendingViewNotice();
  }
  if (e.data && e.data.type === 'pkc-entry-conflict') {
    var banner = document.getElementById('conflict-banner');
    banner.textContent = e.data.message;
    banner.style.display = '';
  }
  if (e.data && e.data.type === 'pkc-entry-update-preview-ctx') {
    /*
     * Live refresh of the edit-mode Preview resolver context. We only
     * update the local variable; we do NOT re-render anything. The
     * next time the user switches to the Preview tab (or the already-
     * visible preview is re-invoked via showTab('preview')) the new
     * snapshot will be passed to opener.pkcRenderEntryPreview.
     *
     * The Source textarea and the view-pane body are deliberately
     * untouched — this message only affects the preview resolver.
     */
    childPreviewCtx = e.data.previewCtx || null;
    if (currentMode === 'edit' && document.getElementById('body-preview').style.display !== 'none') {
      /*
       * If the Preview tab is currently visible, re-render it in place
       * so the user sees the effect immediately. This does NOT touch
       * body-edit (the Source textarea) and does NOT touch body-view
       * (the view-pane HTML) — only body-preview (the Preview tab's
       * scratch div) is updated.
       */
      var src = document.getElementById('body-edit').value;
      document.getElementById('body-preview').innerHTML = renderMd(src);
    }
  }
  if (e.data && e.data.type === 'pkc-entry-update-view-body') {
    /*
     * View-pane rerender: the parent has computed a fresh HTML
     * string for the view-mode body (e.g. because container assets
     * changed and the resolvedBody needs to be re-rendered) and
     * pushed it here via postMessage.
     *
     * Dirty state policy (see pendingViewBody JSDoc above):
     *   - Clean: apply immediately to #body-view.innerHTML and drop
     *     any stale pending stash.
     *   - Dirty: stash into pendingViewBody and surface the
     *     #pending-view-notice element. Do NOT touch #body-view,
     *     do NOT touch #body-edit, do NOT touch #body-preview,
     *     do NOT touch the title elements, do NOT touch the
     *     originalBody / originalTitle trackers.
     *
     * The dirty branch guarantees the user's in-progress edit is
     * preserved bit-for-bit. The pending stash will be applied on
     * the next cancelEdit() (see flushPendingViewBody), or
     * discarded on the next 'pkc-entry-saved' (save's own rerender
     * is authoritative).
     *
     * Note: Preview live refresh ('pkc-entry-update-preview-ctx',
     * the branch above) runs independently of this policy — the
     * edit-mode Preview tab stays fresh even while the view pane
     * is held stale by a dirty stash.
     *
     * Trust: the payload is rendered HTML produced by the parent's
     * markdown renderer, which runs in the same origin as the
     * initial document.write that built this child. No additional
     * sanitization is applied here.
     */
    if (typeof e.data.viewBody === 'string') {
      if (isEntryDirty()) {
        pendingViewBody = e.data.viewBody;
        showPendingViewNotice();
      } else {
        var viewBodyEl = document.getElementById('body-view');
        if (viewBodyEl) viewBodyEl.innerHTML = e.data.viewBody;
        pendingViewBody = null;
        hidePendingViewNotice();
        updateTaskBadge();
      }
    }
  }
});
/* Derive initial task badge from the rendered body */
updateTaskBadge();
/* TEXTLOG delete button handler — mark row as deleted and hide it */
if (useStructuredEditor && entryArchetype === 'textlog') {
  document.addEventListener('click', function(ev) {
    var btn = ev.target;
    if (!btn || !btn.getAttribute) return;
    if (btn.getAttribute('data-pkc-field') !== 'textlog-delete') return;
    var row = btn.closest('.pkc-textlog-edit-row');
    if (row) {
      row.setAttribute('data-pkc-deleted', 'true');
      row.style.display = 'none';
    }
  });
}
${!readonly && startEditing ? "/* Auto-enter edit mode on open */\nenterEdit();" : ''}
</script>
</body>
</html>`;
}
