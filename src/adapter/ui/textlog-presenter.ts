import type { Entry } from '../../core/model/record';
import type { DetailPresenter } from './detail-presenter';
import {
  parseTextlogBody,
  serializeTextlogBody,
  appendLogEntry,
  formatLogTimestampWithSeconds,
} from '../../features/textlog/textlog-body';
import type { TextlogFlag } from '../../features/textlog/textlog-body';
import { renderMarkdown, hasMarkdownSyntax } from '../../features/markdown/markdown-render';
import { resolveAssetReferences, hasAssetReferences } from '../../features/markdown/asset-resolver';

export { parseTextlogBody, serializeTextlogBody, appendLogEntry };

export const textlogPresenter: DetailPresenter = {
  renderBody(
    entry: Entry,
    assets?: Record<string, string>,
    mimeByKey?: Record<string, string>,
    nameByKey?: Record<string, string>,
  ): HTMLElement {
    const log = parseTextlogBody(entry.body);
    const container = document.createElement('div');
    container.className = 'pkc-textlog-view';

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

    if (log.entries.length === 0) {
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
    } else {
      const list = document.createElement('div');
      list.className = 'pkc-textlog-list';

      // Display in descending chronological order (newest first)
      const reversed = [...log.entries].reverse();
      for (const logEntry of reversed) {
        const row = document.createElement('div');
        row.className = 'pkc-textlog-row';
        row.setAttribute('data-pkc-log-id', logEntry.id);
        // Owning entry's lid — used by dblclick→BEGIN_EDIT and by the
        // center-pane context menu to produce a log-line reference
        // string (`[title › ts](entry:lid#log-id)`) without having to
        // walk the DOM back to the selected entry.
        row.setAttribute('data-pkc-lid', entry.lid);

        if (logEntry.flags.includes('important')) {
          row.setAttribute('data-pkc-log-important', 'true');
        }

        // Flag toggle button
        const flagBtn = document.createElement('button');
        flagBtn.className = 'pkc-textlog-flag-btn';
        flagBtn.setAttribute('data-pkc-action', 'toggle-log-flag');
        flagBtn.setAttribute('data-pkc-lid', entry.lid);
        flagBtn.setAttribute('data-pkc-log-id', logEntry.id);
        flagBtn.setAttribute('title', 'Toggle important');
        flagBtn.textContent = logEntry.flags.includes('important') ? '★' : '☆';
        row.appendChild(flagBtn);

        // Timestamp — display is short form; title shows full ISO for precision.
        const tsEl = document.createElement('span');
        tsEl.className = 'pkc-textlog-timestamp';
        tsEl.textContent = formatLogTimestampWithSeconds(logEntry.createdAt);
        tsEl.setAttribute('title', logEntry.createdAt);
        row.appendChild(tsEl);

        // Text content — resolve asset references (image embeds and
        // non-image chips) first, then render markdown.
        const textEl = document.createElement('div');
        textEl.className = 'pkc-textlog-text';
        let source = logEntry.text;
        if (assets && mimeByKey && hasAssetReferences(source)) {
          source = resolveAssetReferences(source, { assets, mimeByKey, nameByKey });
        }
        if (hasMarkdownSyntax(source)) {
          textEl.innerHTML = renderMarkdown(source);
          textEl.classList.add('pkc-md-rendered');
        } else {
          textEl.textContent = logEntry.text;
        }
        row.appendChild(textEl);

        list.appendChild(row);
      }
      container.appendChild(list);
    }

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

      // Editable text
      const textArea = document.createElement('textarea');
      textArea.className = 'pkc-textlog-edit-text';
      textArea.setAttribute('data-pkc-field', 'textlog-entry-text');
      textArea.setAttribute('data-pkc-log-id', logEntry.id);
      textArea.value = logEntry.text;
      textArea.rows = 2;
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
