import type { Entry } from '../../core/model/record';
import type { DetailPresenter } from './detail-presenter';
import {
  parseTextlogBody,
  serializeTextlogBody,
  appendLogEntry,
  formatLogTimestamp,
} from '../../features/textlog/textlog-body';
import type { TextlogFlag } from '../../features/textlog/textlog-body';
import { renderMarkdown, hasMarkdownSyntax } from '../../features/markdown/markdown-render';

export { parseTextlogBody, serializeTextlogBody, appendLogEntry };

export const textlogPresenter: DetailPresenter = {
  renderBody(entry: Entry): HTMLElement {
    const log = parseTextlogBody(entry.body);
    const container = document.createElement('div');
    container.className = 'pkc-textlog-view';

    if (log.entries.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'pkc-textlog-empty';
      empty.textContent = 'No log entries yet.';
      container.appendChild(empty);
    } else {
      const list = document.createElement('div');
      list.className = 'pkc-textlog-list';

      for (const logEntry of log.entries) {
        const row = document.createElement('div');
        row.className = 'pkc-textlog-row';
        row.setAttribute('data-pkc-log-id', logEntry.id);

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

        // Timestamp
        const tsEl = document.createElement('span');
        tsEl.className = 'pkc-textlog-timestamp';
        tsEl.textContent = formatLogTimestamp(logEntry.createdAt);
        row.appendChild(tsEl);

        // Text content
        const textEl = document.createElement('div');
        textEl.className = 'pkc-textlog-text';
        if (hasMarkdownSyntax(logEntry.text)) {
          textEl.innerHTML = renderMarkdown(logEntry.text);
          textEl.classList.add('pkc-md-rendered');
        } else {
          textEl.textContent = logEntry.text;
        }
        row.appendChild(textEl);

        list.appendChild(row);
      }
      container.appendChild(list);
    }

    // Append area (shown in view mode, hidden in readonly)
    const appendArea = document.createElement('div');
    appendArea.className = 'pkc-textlog-append';
    appendArea.setAttribute('data-pkc-region', 'textlog-append');

    const appendInput = document.createElement('textarea');
    appendInput.className = 'pkc-textlog-append-input';
    appendInput.setAttribute('data-pkc-field', 'textlog-append-text');
    appendInput.setAttribute('data-pkc-lid', entry.lid);
    appendInput.rows = 2;
    appendInput.placeholder = 'New log entry...';
    appendArea.appendChild(appendInput);

    const appendBtn = document.createElement('button');
    appendBtn.className = 'pkc-btn pkc-btn-create pkc-textlog-append-btn';
    appendBtn.setAttribute('data-pkc-action', 'append-log-entry');
    appendBtn.setAttribute('data-pkc-lid', entry.lid);
    appendBtn.textContent = '+ Add';
    appendArea.appendChild(appendBtn);

    container.appendChild(appendArea);

    return container;
  },

  renderEditorBody(entry: Entry): HTMLElement {
    const log = parseTextlogBody(entry.body);
    const container = document.createElement('div');
    container.className = 'pkc-textlog-editor';

    for (const logEntry of log.entries) {
      const row = document.createElement('div');
      row.className = 'pkc-textlog-edit-row';
      row.setAttribute('data-pkc-log-id', logEntry.id);

      // Timestamp (read-only in editor)
      const tsEl = document.createElement('span');
      tsEl.className = 'pkc-textlog-timestamp';
      tsEl.textContent = formatLogTimestamp(logEntry.createdAt);
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

    // Read hidden body to get original data (for createdAt preservation)
    const bodyEl = root.querySelector<HTMLInputElement>('[data-pkc-field="body"]');
    const original = parseTextlogBody(bodyEl?.value ?? '');
    const originalMap = new Map(original.entries.map((e) => [e.id, e]));

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

    return serializeTextlogBody({ entries });
  },
};
