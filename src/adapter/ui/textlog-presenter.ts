import type { Entry } from '../../core/model/record';
import type { DetailPresenter } from './detail-presenter';
import {
  parseTextlogBody,
  serializeTextlogBody,
  appendLogEntry,
  formatLogTimestampWithSeconds,
} from '../../features/textlog/textlog-body';
import type { TextlogFlag } from '../../features/textlog/textlog-body';
import { buildTextlogDoc } from '../../features/textlog/textlog-doc';
import type { LogArticle } from '../../features/textlog/textlog-doc';
import { renderMarkdown, hasMarkdownSyntax } from '../../features/markdown/markdown-render';
import { resolveAssetReferences, hasAssetReferences } from '../../features/markdown/asset-resolver';
import { expandTransclusions } from './transclusion';
import {
  isSelectionModeActive,
  isLogSelected,
  getSelectionSize,
} from './textlog-selection';

export { parseTextlogBody, serializeTextlogBody, appendLogEntry };

export const textlogPresenter: DetailPresenter = {
  /**
   * Live viewer DOM.
   *
   * Slice 2 of the TEXTLOG viewer redesign replaces the previous flat
   * list of `.pkc-textlog-row` elements with a day-grouped document
   * tree built from the `TextlogDoc` common representation (see
   * `docs/development/textlog-viewer-and-linkability-redesign.md`).
   *
   * Structure:
   *
   *   <div class="pkc-textlog-view">
   *     <div class="pkc-textlog-append"> …append area (unchanged)… </div>
   *     <div class="pkc-textlog-document">
   *       <section class="pkc-textlog-day" id="day-<yyyy-mm-dd>">
   *         <header class="pkc-textlog-day-header">
   *           <h2 class="pkc-textlog-day-title">yyyy-mm-dd</h2>
   *         </header>
   *         <article class="pkc-textlog-log" id="log-<id>"
   *                  data-pkc-log-id data-pkc-lid [data-pkc-log-important]>
   *           <header class="pkc-textlog-log-header">
   *             <button class="pkc-textlog-flag-btn"> …★/☆… </button>
   *             <span class="pkc-textlog-timestamp"> …HH:mm:ss… </span>
   *             <button class="pkc-textlog-anchor-btn"
   *                     data-pkc-action="copy-log-line-ref"> 🔗 </button>
   *           </header>
   *           <div class="pkc-textlog-text"> …markdown… </div>
   *         </article>
   *       </section>
   *     </div>
   *   </div>
   *
   * Live viewer uses `order: 'desc'` so the newest day (and newest log
   * within it) appears first — matching the append-recent UX.
   */
  renderBody(
    entry: Entry,
    assets?: Record<string, string>,
    mimeByKey?: Record<string, string>,
    nameByKey?: Record<string, string>,
    entries?: Entry[],
  ): HTMLElement {
    const container = document.createElement('div');
    container.className = 'pkc-textlog-view';
    container.setAttribute('data-pkc-lid', entry.lid);

    // Slice 4 (TEXTLOG → TEXT): selection-mode toolbar. Always
    // rendered so there is a stable hook for the action bar; the
    // toolbar's appearance changes based on whether this entry is
    // currently in selection mode.
    const selecting = isSelectionModeActive(entry.lid);
    if (selecting) {
      container.setAttribute('data-pkc-textlog-selecting', 'true');
    }
    container.appendChild(renderSelectionToolbar(entry.lid, selecting));

    // Append area pinned to top of center pane
    const appendArea = document.createElement('div');
    appendArea.className = 'pkc-textlog-append';
    appendArea.setAttribute('data-pkc-region', 'textlog-append');

    const appendInput = document.createElement('textarea');
    appendInput.className = 'pkc-textlog-append-input';
    appendInput.setAttribute('data-pkc-field', 'textlog-append-text');
    appendInput.setAttribute('data-pkc-lid', entry.lid);
    appendInput.rows = 6;
    appendInput.placeholder = 'New log entry… (Ctrl+Enter to add)';
    appendArea.appendChild(appendInput);

    const appendBtn = document.createElement('button');
    appendBtn.className = 'pkc-btn pkc-btn-create pkc-textlog-append-btn';
    appendBtn.setAttribute('data-pkc-action', 'append-log-entry');
    appendBtn.setAttribute('data-pkc-lid', entry.lid);
    appendBtn.setAttribute('title', 'Append log entry (Ctrl+Enter)');
    appendBtn.textContent = '+ Add';
    appendArea.appendChild(appendBtn);

    container.appendChild(appendArea);

    const doc = buildTextlogDoc(entry, { order: 'desc' });

    if (doc.sections.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'pkc-textlog-empty';
      empty.setAttribute('data-pkc-region', 'textlog-empty');
      const emptyTitle = document.createElement('div');
      emptyTitle.className = 'pkc-textlog-empty-title';
      emptyTitle.textContent = 'No log entries yet.';
      empty.appendChild(emptyTitle);
      const emptyHint = document.createElement('div');
      emptyHint.className = 'pkc-textlog-empty-hint';
      emptyHint.textContent = 'Write your first log entry above ↑';
      empty.appendChild(emptyHint);
      container.appendChild(empty);
      return container;
    }

    const docEl = document.createElement('div');
    docEl.className = 'pkc-textlog-document';
    docEl.setAttribute('data-pkc-region', 'textlog-document');

    for (const section of doc.sections) {
      const sectionEl = document.createElement('section');
      sectionEl.className = 'pkc-textlog-day';
      // Undated bucket (unparseable timestamp) uses a fixed key so its
      // heading and anchor stay addressable without generating an
      // invalid `day-` id.
      const dayId = section.dateKey === '' ? 'day-undated' : `day-${section.dateKey}`;
      sectionEl.id = dayId;
      sectionEl.setAttribute('data-pkc-date-key', section.dateKey);

      const header = document.createElement('header');
      header.className = 'pkc-textlog-day-header';
      const title = document.createElement('h2');
      title.className = 'pkc-textlog-day-title';
      title.textContent = section.dateKey === '' ? 'Undated' : section.dateKey;
      header.appendChild(title);
      sectionEl.appendChild(header);

      for (const log of section.logs) {
        sectionEl.appendChild(
          renderLogArticle(entry.lid, log, assets, mimeByKey, nameByKey, entries, selecting),
        );
      }
      docEl.appendChild(sectionEl);
    }

    container.appendChild(docEl);
    return container;
  },

  renderEditorBody(entry: Entry): HTMLElement {
    const log = parseTextlogBody(entry.body);
    const container = document.createElement('div');
    container.className = 'pkc-textlog-editor';

    // Editor also in descending chronological order (newest first)
    const editorEntries = [...log.entries].reverse();
    for (const logEntry of editorEntries) {
      const row = document.createElement('div');
      row.className = 'pkc-textlog-edit-row';
      row.setAttribute('data-pkc-log-id', logEntry.id);

      // Timestamp (read-only in editor)
      const tsEl = document.createElement('span');
      tsEl.className = 'pkc-textlog-timestamp';
      tsEl.textContent = formatLogTimestampWithSeconds(logEntry.createdAt);
      row.appendChild(tsEl);

      // Flag checkbox
      const flagLabel = document.createElement('label');
      flagLabel.className = 'pkc-textlog-flag-label';
      const flagCheck = document.createElement('input');
      flagCheck.type = 'checkbox';
      flagCheck.className = 'pkc-textlog-flag-check';
      flagCheck.setAttribute('data-pkc-field', 'textlog-flag');
      flagCheck.setAttribute('data-pkc-log-id', logEntry.id);
      flagCheck.checked = logEntry.flags.includes('important');
      flagLabel.appendChild(flagCheck);
      const flagText = document.createElement('span');
      flagText.textContent = ' ★';
      flagLabel.appendChild(flagText);
      row.appendChild(flagLabel);

      // Delete button
      const delBtn = document.createElement('button');
      delBtn.className = 'pkc-btn-small pkc-textlog-delete-btn';
      delBtn.setAttribute('data-pkc-field', 'textlog-delete');
      delBtn.setAttribute('data-pkc-log-id', logEntry.id);
      delBtn.textContent = '✕';
      delBtn.setAttribute('title', 'Remove this log entry');
      row.appendChild(delBtn);

      // S-28: per-log Find & Replace trigger. Scope is locked to
      // this single log's text textarea — see
      // docs/spec/textlog-replace-v1-behavior-contract.md.
      const replaceBtn = document.createElement('button');
      replaceBtn.type = 'button';
      replaceBtn.className = 'pkc-btn-small pkc-textlog-replace-btn';
      replaceBtn.setAttribute('data-pkc-action', 'open-log-replace-dialog');
      replaceBtn.setAttribute('data-pkc-log-id', logEntry.id);
      replaceBtn.textContent = '🔎';
      replaceBtn.setAttribute(
        'title',
        'Find & replace inside this log',
      );
      row.appendChild(replaceBtn);

      // Editable text.
      // Slice C-style sizing tuned for per-log entries: min 5 rows (large
      // enough to be usable — `rows=2` regressed this into a near-invisible
      // sliver), +2 buffer, grows with content. Log entries tend to be
      // shorter than TEXT bodies so we do not reuse the 15-row minimum.
      const textArea = document.createElement('textarea');
      textArea.className = 'pkc-textlog-edit-text';
      textArea.setAttribute('data-pkc-field', 'textlog-entry-text');
      textArea.setAttribute('data-pkc-log-id', logEntry.id);
      textArea.value = logEntry.text;
      const lineCount = logEntry.text ? logEntry.text.split('\n').length : 0;
      textArea.rows = Math.max(5, lineCount + 2);
      row.appendChild(textArea);

      container.appendChild(row);
    }

    if (log.entries.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'pkc-textlog-empty';
      empty.textContent = 'No log entries to edit.';
      container.appendChild(empty);
    }

    // Hidden body field for collectBody compatibility
    const bodyField = document.createElement('input');
    bodyField.type = 'hidden';
    bodyField.setAttribute('data-pkc-field', 'body');
    bodyField.value = entry.body;
    container.appendChild(bodyField);

    return container;
  },

  collectBody(root: HTMLElement): string {
    const editRows = root.querySelectorAll<HTMLElement>('.pkc-textlog-edit-row');
    if (editRows.length === 0) {
      // Fall back to hidden body field
      const bodyEl = root.querySelector<HTMLInputElement>('[data-pkc-field="body"]');
      return bodyEl?.value ?? serializeTextlogBody({ entries: [] });
    }

    // Read hidden body to get original data (for createdAt preservation
    // and for restoring chronological storage order after reverse display)
    const bodyEl = root.querySelector<HTMLInputElement>('[data-pkc-field="body"]');
    const original = parseTextlogBody(bodyEl?.value ?? '');
    const originalMap = new Map(original.entries.map((e) => [e.id, e]));
    const originalOrder = new Map(original.entries.map((e, i) => [e.id, i]));

    // Collect entries that haven't been deleted
    const entries: { id: string; text: string; createdAt: string; flags: TextlogFlag[] }[] = [];

    for (const row of editRows) {
      // Skip rows marked for deletion
      if (row.getAttribute('data-pkc-deleted') === 'true') continue;

      const logId = row.getAttribute('data-pkc-log-id') ?? '';
      const textEl = row.querySelector<HTMLTextAreaElement>('[data-pkc-field="textlog-entry-text"]');
      const flagEl = row.querySelector<HTMLInputElement>('[data-pkc-field="textlog-flag"]');

      const orig = originalMap.get(logId);
      const text = textEl?.value ?? '';
      const flags: TextlogFlag[] = flagEl?.checked ? ['important'] : [];
      entries.push({
        id: logId,
        text,
        createdAt: orig?.createdAt ?? new Date().toISOString(),
        flags,
      });
    }

    // Restore original chronological order (ascending) for storage,
    // regardless of display order (which may be reversed).
    entries.sort((a, b) => {
      const ia = originalOrder.get(a.id) ?? Infinity;
      const ib = originalOrder.get(b.id) ?? Infinity;
      return ia - ib;
    });

    return serializeTextlogBody({ entries });
  },
};

/**
 * Render a single `LogArticle` as an `<article>` element.
 *
 * The article carries the data attributes the rest of the app relies
 * on (`data-pkc-log-id`, `data-pkc-lid`, optional
 * `data-pkc-log-important`) so dblclick→BEGIN_EDIT, the flag toggle,
 * the copy-log-line-ref action, and the context menu all continue to
 * resolve against a single predictable element.
 */
function renderLogArticle(
  lid: string,
  log: LogArticle,
  assets?: Record<string, string>,
  mimeByKey?: Record<string, string>,
  nameByKey?: Record<string, string>,
  entries?: Entry[],
  selecting = false,
): HTMLElement {
  const article = document.createElement('article');
  article.className = 'pkc-textlog-log';
  article.id = `log-${log.id}`;
  article.setAttribute('data-pkc-log-id', log.id);
  // Owning entry's lid — used by dblclick→BEGIN_EDIT and by the
  // center-pane context menu to produce a log-line reference
  // string without having to walk the DOM back to the selected entry.
  article.setAttribute('data-pkc-lid', lid);
  if (log.flags.includes('important')) {
    article.setAttribute('data-pkc-log-important', 'true');
  }
  if (selecting && isLogSelected(log.id)) {
    article.setAttribute('data-pkc-log-selected', 'true');
  }

  const header = document.createElement('header');
  header.className = 'pkc-textlog-log-header';

  // Slice 4: checkbox shown only while selection mode is active for
  // this TEXTLOG. Pre-checked when the module-local selection set
  // already contains this id (restores state across re-renders).
  if (selecting) {
    const selectLabel = document.createElement('label');
    selectLabel.className = 'pkc-textlog-select-label';
    selectLabel.setAttribute('title', 'Include this log in the TEXT extract');
    const selectCheck = document.createElement('input');
    selectCheck.type = 'checkbox';
    selectCheck.className = 'pkc-textlog-select-check';
    selectCheck.setAttribute('data-pkc-field', 'textlog-select');
    selectCheck.setAttribute('data-pkc-lid', lid);
    selectCheck.setAttribute('data-pkc-log-id', log.id);
    selectCheck.checked = isLogSelected(log.id);
    selectLabel.appendChild(selectCheck);
    header.appendChild(selectLabel);
  }

  const flagBtn = document.createElement('button');
  flagBtn.className = 'pkc-textlog-flag-btn';
  flagBtn.setAttribute('data-pkc-action', 'toggle-log-flag');
  flagBtn.setAttribute('data-pkc-lid', lid);
  flagBtn.setAttribute('data-pkc-log-id', log.id);
  flagBtn.setAttribute('title', 'Toggle important');
  flagBtn.textContent = log.flags.includes('important') ? '★' : '☆';
  header.appendChild(flagBtn);

  // Timestamp — display is short form; title shows full ISO for precision.
  const tsEl = document.createElement('span');
  tsEl.className = 'pkc-textlog-timestamp';
  tsEl.textContent = formatLogTimestampWithSeconds(log.createdAt);
  tsEl.setAttribute('title', log.createdAt);
  header.appendChild(tsEl);

  // Copy-anchor button — emits the canonical `entry:<lid>#log/<id>`
  // reference via the existing `copy-log-line-ref` action. The action
  // string is shared with the right-click menu; Slice 5 will route
  // both through a single formatter.
  const anchorBtn = document.createElement('button');
  anchorBtn.className = 'pkc-textlog-anchor-btn';
  anchorBtn.setAttribute('data-pkc-action', 'copy-log-line-ref');
  anchorBtn.setAttribute('data-pkc-lid', lid);
  anchorBtn.setAttribute('data-pkc-log-id', log.id);
  anchorBtn.setAttribute('title', 'Copy log line reference');
  anchorBtn.textContent = '🔗';
  header.appendChild(anchorBtn);

  article.appendChild(header);

  // Text content — resolve asset references (image embeds and
  // non-image chips) first, then render markdown.
  const textEl = document.createElement('div');
  textEl.className = 'pkc-textlog-text';
  let source = log.bodySource;
  if (assets && mimeByKey && hasAssetReferences(source)) {
    source = resolveAssetReferences(source, { assets, mimeByKey, nameByKey });
  }
  if (hasMarkdownSyntax(source)) {
    textEl.innerHTML = renderMarkdown(source);
    textEl.classList.add('pkc-md-rendered');
    // Slice 5-B: expand `![](entry:...)` transclusion placeholders.
    // Guarded by `entries` so the presenter is safe to call without
    // container context (existing tests that call renderLogArticle
    // indirectly via renderBody without entries just skip expansion).
    if (entries) {
      expandTransclusions(textEl, {
        entries,
        assets,
        mimeByKey,
        nameByKey,
        hostLid: lid,
      });
    }
  } else {
    textEl.textContent = log.bodySource;
  }
  article.appendChild(textEl);

  return article;
}

/**
 * Toolbar for the TEXTLOG → TEXT conversion flow (Slice 4).
 *
 * Always rendered above the log document so the `Begin log selection`
 * entry point lives inside the viewer (not the outer action bar, which
 * is shared across archetypes). The toolbar re-renders with the rest
 * of the TEXTLOG view on every dispatch; state continuity is kept by
 * reading from `textlog-selection` at render time.
 */
function renderSelectionToolbar(lid: string, selecting: boolean): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'pkc-textlog-select-toolbar';
  bar.setAttribute('data-pkc-region', 'textlog-select-toolbar');

  if (!selecting) {
    const beginBtn = document.createElement('button');
    beginBtn.className = 'pkc-btn pkc-textlog-select-begin';
    beginBtn.setAttribute('data-pkc-action', 'begin-textlog-selection');
    beginBtn.setAttribute('data-pkc-lid', lid);
    beginBtn.setAttribute('title', 'Select logs to extract into a new TEXT entry');
    beginBtn.textContent = 'Begin log selection';
    bar.appendChild(beginBtn);
    return bar;
  }

  const count = getSelectionSize();

  const countLabel = document.createElement('span');
  countLabel.className = 'pkc-textlog-select-count';
  countLabel.setAttribute('data-pkc-region', 'textlog-select-count');
  countLabel.textContent = `${count} ${count === 1 ? 'log' : 'logs'} selected`;
  bar.appendChild(countLabel);

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'pkc-btn pkc-textlog-select-cancel';
  cancelBtn.setAttribute('data-pkc-action', 'cancel-textlog-selection');
  cancelBtn.setAttribute('title', 'Exit selection mode (Esc)');
  cancelBtn.textContent = 'Cancel';
  bar.appendChild(cancelBtn);

  const convertBtn = document.createElement('button');
  convertBtn.className = 'pkc-btn pkc-btn-create pkc-textlog-select-convert';
  convertBtn.setAttribute('data-pkc-action', 'open-textlog-to-text-preview');
  convertBtn.setAttribute('data-pkc-lid', lid);
  convertBtn.setAttribute('title', 'Preview the TEXT extract, then commit');
  convertBtn.textContent = 'Convert to TEXT →';
  if (count === 0) {
    convertBtn.setAttribute('disabled', 'true');
    convertBtn.setAttribute('data-pkc-disabled', 'true');
  }
  bar.appendChild(convertBtn);

  return bar;
}
