/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from 'vitest';
import { textlogPresenter } from '@adapter/ui/textlog-presenter';
import { serializeTextlogBody } from '@features/textlog/textlog-body';
import type { Entry } from '@core/model/record';
import type { TextlogBody } from '@features/textlog/textlog-body';

function makeEntry(body: TextlogBody, lid = 'tl1'): Entry {
  return {
    lid,
    title: 'Test Log',
    body: serializeTextlogBody(body),
    archetype: 'textlog',
    created_at: '2026-04-09T00:00:00Z',
    updated_at: '2026-04-09T00:00:00Z',
  };
}

const sampleBody: TextlogBody = {
  entries: [
    { id: 'log-1', text: 'First entry', createdAt: '2026-04-09T10:00:00Z', flags: [] },
    { id: 'log-2', text: 'Important entry', createdAt: '2026-04-09T11:00:00Z', flags: ['important'] },
    { id: 'log-3', text: '# Markdown heading', createdAt: '2026-04-09T12:00:00Z', flags: [] },
  ],
};

// ── renderBody ──

describe('textlog renderBody', () => {
  it('renders log entries as timeline rows', () => {
    const el = textlogPresenter.renderBody(makeEntry(sampleBody));
    const rows = el.querySelectorAll('.pkc-textlog-row');
    expect(rows.length).toBe(3);
  });

  it('shows empty state when no entries', () => {
    const el = textlogPresenter.renderBody(makeEntry({ entries: [] }));
    const empty = el.querySelector('.pkc-textlog-empty');
    expect(empty).not.toBeNull();
    expect(empty!.textContent).toContain('No log entries');
  });

  it('displays timestamp for each entry', () => {
    const el = textlogPresenter.renderBody(makeEntry(sampleBody));
    const timestamps = el.querySelectorAll('.pkc-textlog-timestamp');
    expect(timestamps.length).toBe(3);
    // Should contain formatted time
    expect(timestamps[0]!.textContent).toMatch(/\d{4}\/\d{2}\/\d{2}/);
  });

  it('marks important entries with data attribute', () => {
    const el = textlogPresenter.renderBody(makeEntry(sampleBody));
    const rows = el.querySelectorAll('.pkc-textlog-row');
    expect(rows[0]!.getAttribute('data-pkc-log-important')).toBeNull();
    expect(rows[1]!.getAttribute('data-pkc-log-important')).toBe('true');
  });

  it('renders flag toggle buttons', () => {
    const el = textlogPresenter.renderBody(makeEntry(sampleBody));
    const flagBtns = el.querySelectorAll('[data-pkc-action="toggle-log-flag"]');
    expect(flagBtns.length).toBe(3);
    expect(flagBtns[0]!.textContent).toBe('☆');
    expect(flagBtns[1]!.textContent).toBe('★');
  });

  it('renders append area with input and button', () => {
    const el = textlogPresenter.renderBody(makeEntry(sampleBody));
    const appendInput = el.querySelector('[data-pkc-field="textlog-append-text"]');
    expect(appendInput).not.toBeNull();
    const appendBtn = el.querySelector('[data-pkc-action="append-log-entry"]');
    expect(appendBtn).not.toBeNull();
  });

  it('renders markdown in log entries', () => {
    const el = textlogPresenter.renderBody(makeEntry(sampleBody));
    const mdRow = el.querySelectorAll('.pkc-textlog-text')[2];
    expect(mdRow!.classList.contains('pkc-md-rendered')).toBe(true);
    expect(mdRow!.innerHTML).toContain('<h1>');
  });
});

// ── renderEditorBody ──

describe('textlog renderEditorBody', () => {
  it('renders editable textareas for each entry', () => {
    const el = textlogPresenter.renderEditorBody(makeEntry(sampleBody));
    const editRows = el.querySelectorAll('.pkc-textlog-edit-row');
    expect(editRows.length).toBe(3);
    const textareas = el.querySelectorAll('[data-pkc-field="textlog-entry-text"]');
    expect(textareas.length).toBe(3);
  });

  it('shows timestamps as read-only', () => {
    const el = textlogPresenter.renderEditorBody(makeEntry(sampleBody));
    const timestamps = el.querySelectorAll('.pkc-textlog-timestamp');
    expect(timestamps.length).toBe(3);
  });

  it('shows flag checkboxes', () => {
    const el = textlogPresenter.renderEditorBody(makeEntry(sampleBody));
    const checks = el.querySelectorAll<HTMLInputElement>('[data-pkc-field="textlog-flag"]');
    expect(checks.length).toBe(3);
    expect(checks[0]!.checked).toBe(false);
    expect(checks[1]!.checked).toBe(true);
  });

  it('shows delete buttons', () => {
    const el = textlogPresenter.renderEditorBody(makeEntry(sampleBody));
    const delBtns = el.querySelectorAll('[data-pkc-field="textlog-delete"]');
    expect(delBtns.length).toBe(3);
  });

  it('shows empty state when no entries', () => {
    const el = textlogPresenter.renderEditorBody(makeEntry({ entries: [] }));
    const empty = el.querySelector('.pkc-textlog-empty');
    expect(empty).not.toBeNull();
  });

  it('includes hidden body field', () => {
    const el = textlogPresenter.renderEditorBody(makeEntry(sampleBody));
    const bodyField = el.querySelector<HTMLInputElement>('[data-pkc-field="body"]');
    expect(bodyField).not.toBeNull();
    expect(bodyField!.type).toBe('hidden');
  });
});

// ── collectBody ──

describe('textlog collectBody', () => {
  it('collects edited entries back to JSON', () => {
    const entry = makeEntry(sampleBody);
    const editorEl = textlogPresenter.renderEditorBody(entry);

    // Edit the first entry's text
    const textareas = editorEl.querySelectorAll<HTMLTextAreaElement>('[data-pkc-field="textlog-entry-text"]');
    textareas[0]!.value = 'Edited first entry';

    const collected = textlogPresenter.collectBody(editorEl);
    const parsed = JSON.parse(collected);
    expect(parsed.entries).toHaveLength(3);
    expect(parsed.entries[0].text).toBe('Edited first entry');
    expect(parsed.entries[0].id).toBe('log-1');
    expect(parsed.entries[0].createdAt).toBe('2026-04-09T10:00:00Z');
  });

  it('collects flag changes', () => {
    const entry = makeEntry(sampleBody);
    const editorEl = textlogPresenter.renderEditorBody(entry);

    // Toggle flag on first entry
    const checks = editorEl.querySelectorAll<HTMLInputElement>('[data-pkc-field="textlog-flag"]');
    checks[0]!.checked = true;
    checks[1]!.checked = false;

    const collected = textlogPresenter.collectBody(editorEl);
    const parsed = JSON.parse(collected);
    expect(parsed.entries[0].flags).toEqual(['important']);
    expect(parsed.entries[1].flags).toEqual([]);
  });

  it('returns empty body when no edit rows', () => {
    const div = document.createElement('div');
    const collected = textlogPresenter.collectBody(div);
    const parsed = JSON.parse(collected);
    expect(parsed.entries).toEqual([]);
  });
});
