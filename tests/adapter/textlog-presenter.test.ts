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

  it('shows empty state with guidance hint when no entries', () => {
    const el = textlogPresenter.renderBody(makeEntry({ entries: [] }));
    const empty = el.querySelector('.pkc-textlog-empty');
    expect(empty).not.toBeNull();
    expect(empty!.textContent).toContain('No log entries');
    // The hint should guide the user toward the append area above (pinned to top).
    const hint = el.querySelector('.pkc-textlog-empty-hint');
    expect(hint).not.toBeNull();
    expect(hint!.textContent).toContain('above');
  });

  it('still renders append area when empty so the user has a place to write', () => {
    const el = textlogPresenter.renderBody(makeEntry({ entries: [] }));
    const appendInput = el.querySelector('[data-pkc-field="textlog-append-text"]');
    expect(appendInput).not.toBeNull();
  });

  it('displays timestamp for each entry', () => {
    const el = textlogPresenter.renderBody(makeEntry(sampleBody));
    const timestamps = el.querySelectorAll('.pkc-textlog-timestamp');
    expect(timestamps.length).toBe(3);
    // Should contain formatted time
    expect(timestamps[0]!.textContent).toMatch(/\d{4}\/\d{2}\/\d{2}/);
  });

  it('exposes full ISO timestamp via tooltip title for precision', () => {
    const el = textlogPresenter.renderBody(makeEntry(sampleBody));
    const timestamps = el.querySelectorAll('.pkc-textlog-timestamp');
    // Displayed in descending order (newest first)
    expect(timestamps[0]!.getAttribute('title')).toBe('2026-04-09T12:00:00Z');
    expect(timestamps[1]!.getAttribute('title')).toBe('2026-04-09T11:00:00Z');
    expect(timestamps[2]!.getAttribute('title')).toBe('2026-04-09T10:00:00Z');
  });

  it('marks important entries with data attribute', () => {
    const el = textlogPresenter.renderBody(makeEntry(sampleBody));
    const rows = el.querySelectorAll('.pkc-textlog-row');
    expect(rows[0]!.getAttribute('data-pkc-log-important')).toBeNull();
    expect(rows[1]!.getAttribute('data-pkc-log-important')).toBe('true');
  });

  it('each row carries data-pkc-lid so dblclick → BEGIN_EDIT can resolve the owning entry', () => {
    const el = textlogPresenter.renderBody(makeEntry(sampleBody, 'tl-owner'));
    const rows = el.querySelectorAll<HTMLElement>('.pkc-textlog-row');
    expect(rows.length).toBe(3);
    for (const r of rows) {
      expect(r.getAttribute('data-pkc-lid')).toBe('tl-owner');
      expect(r.getAttribute('data-pkc-log-id')).toBeTruthy();
    }
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

  it('append input placeholder advertises the Ctrl+Enter shortcut', () => {
    const el = textlogPresenter.renderBody(makeEntry(sampleBody));
    const appendInput = el.querySelector<HTMLTextAreaElement>(
      '[data-pkc-field="textlog-append-text"]',
    );
    expect(appendInput).not.toBeNull();
    expect(appendInput!.placeholder).toContain('Ctrl+Enter');
  });

  it('append input carries the owning entry lid for focus restoration', () => {
    const el = textlogPresenter.renderBody(makeEntry(sampleBody, 'tl-xyz'));
    const appendInput = el.querySelector<HTMLTextAreaElement>(
      '[data-pkc-field="textlog-append-text"]',
    );
    expect(appendInput!.getAttribute('data-pkc-lid')).toBe('tl-xyz');
  });

  it('renders markdown in log entries', () => {
    const el = textlogPresenter.renderBody(makeEntry(sampleBody));
    // log-3 (markdown heading) is now first due to descending order
    const mdRow = el.querySelectorAll('.pkc-textlog-text')[0];
    expect(mdRow!.classList.contains('pkc-md-rendered')).toBe(true);
    expect(mdRow!.innerHTML).toContain('<h1>');
  });

  // ── Asset reference resolution ──

  it('resolves asset: image references in log entries', () => {
    const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=';
    const body: TextlogBody = {
      entries: [
        { id: 'log-img', text: '![screenshot](asset:ast-png-001)', createdAt: '2026-04-09T10:00:00Z', flags: [] },
      ],
    };
    const el = textlogPresenter.renderBody(
      makeEntry(body),
      { 'ast-png-001': PNG_B64 },
      { 'ast-png-001': 'image/png' },
    );
    const row = el.querySelector('.pkc-textlog-text');
    expect(row!.innerHTML).toContain('data:image/png;base64,');
    expect(row!.innerHTML).not.toContain('asset:ast-png-001');
  });

  it('shows missing marker for unresolved asset in log entries', () => {
    const body: TextlogBody = {
      entries: [
        { id: 'log-bad', text: '![x](asset:ast-missing)', createdAt: '2026-04-09T10:00:00Z', flags: [] },
      ],
    };
    const el = textlogPresenter.renderBody(makeEntry(body), {}, {});
    const row = el.querySelector('.pkc-textlog-text');
    expect(row!.innerHTML).toContain('missing asset');
  });

  it('resolves assets without disturbing other log entries', () => {
    const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=';
    const body: TextlogBody = {
      entries: [
        { id: 'log-1', text: 'plain text entry', createdAt: '2026-04-09T10:00:00Z', flags: [] },
        { id: 'log-2', text: '![img](asset:ast-png-001)', createdAt: '2026-04-09T11:00:00Z', flags: [] },
      ],
    };
    const el = textlogPresenter.renderBody(
      makeEntry(body),
      { 'ast-png-001': PNG_B64 },
      { 'ast-png-001': 'image/png' },
    );
    const rows = el.querySelectorAll('.pkc-textlog-text');
    // Reversed order: log-2 (image) first, log-1 (plain) second
    expect(rows[0]!.innerHTML).toContain('data:image/png');
    expect(rows[1]!.textContent).toBe('plain text entry');
  });

  it('renders markdown and asset references within the same log entry', () => {
    const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=';
    const body: TextlogBody = {
      entries: [
        {
          id: 'log-mix',
          text: '**Investigation**\n\n![shot](asset:ast-png-001)\n\n- Step one\n- Step two',
          createdAt: '2026-04-09T10:00:00Z',
          flags: [],
        },
      ],
    };
    const el = textlogPresenter.renderBody(
      makeEntry(body),
      { 'ast-png-001': PNG_B64 },
      { 'ast-png-001': 'image/png' },
    );
    const row = el.querySelector('.pkc-textlog-text');
    expect(row!.classList.contains('pkc-md-rendered')).toBe(true);
    expect(row!.innerHTML).toContain('<strong>');
    expect(row!.innerHTML).toContain('<ul>');
    expect(row!.innerHTML).toContain('data:image/png;base64,');
  });

  it('marks important row with the data attribute used for visibility styling', () => {
    const el = textlogPresenter.renderBody(makeEntry(sampleBody));
    const important = el.querySelector('.pkc-textlog-row[data-pkc-log-important="true"]');
    expect(important).not.toBeNull();
    // The important row still has its normal flag button and text children.
    expect(important!.querySelector('.pkc-textlog-flag-btn')).not.toBeNull();
    expect(important!.querySelector('.pkc-textlog-text')).not.toBeNull();
  });

  // ── Non-image asset chip rendering in log entries ──

  it('renders a non-image asset link form as a chip inside a log entry', () => {
    const body: TextlogBody = {
      entries: [
        {
          id: 'log-pdf',
          text: 'attached [the report](asset:ast-pdf-001)',
          createdAt: '2026-04-09T10:00:00Z',
          flags: [],
        },
      ],
    };
    const el = textlogPresenter.renderBody(
      makeEntry(body),
      { 'ast-pdf-001': 'PDFdata' },
      { 'ast-pdf-001': 'application/pdf' },
      { 'ast-pdf-001': 'report.pdf' },
    );
    const row = el.querySelector('.pkc-textlog-text');
    expect(row!.innerHTML).toContain('href="#asset-ast-pdf-001"');
    expect(row!.innerHTML).toContain('📄');
    expect(row!.innerHTML).toContain('the report');
  });

  it('uses attachment name as label fallback when link text is empty', () => {
    const body: TextlogBody = {
      entries: [
        {
          id: 'log-empty',
          text: '[](asset:ast-aud-001)',
          createdAt: '2026-04-09T10:00:00Z',
          flags: [],
        },
      ],
    };
    const el = textlogPresenter.renderBody(
      makeEntry(body),
      { 'ast-aud-001': 'AUDdata' },
      { 'ast-aud-001': 'audio/mpeg' },
      { 'ast-aud-001': 'jingle.mp3' },
    );
    const row = el.querySelector('.pkc-textlog-text');
    expect(row!.innerHTML).toContain('href="#asset-ast-aud-001"');
    expect(row!.innerHTML).toContain('jingle.mp3');
  });

  it('shows missing marker for unknown asset link in a log entry', () => {
    const body: TextlogBody = {
      entries: [
        {
          id: 'log-miss',
          text: 'see [gone](asset:ast-lost-001)',
          createdAt: '2026-04-09T10:00:00Z',
          flags: [],
        },
      ],
    };
    const el = textlogPresenter.renderBody(makeEntry(body), {}, {});
    const row = el.querySelector('.pkc-textlog-text');
    expect(row!.innerHTML).toContain('missing asset');
    expect(row!.innerHTML).not.toContain('#asset-ast-lost-001');
  });

  it('only rewrites the log entry that contains an asset link', () => {
    const body: TextlogBody = {
      entries: [
        {
          id: 'log-plain',
          text: 'just plain text',
          createdAt: '2026-04-09T10:00:00Z',
          flags: [],
        },
        {
          id: 'log-asset',
          text: '[bundle](asset:ast-zip-001)',
          createdAt: '2026-04-09T11:00:00Z',
          flags: [],
        },
      ],
    };
    const el = textlogPresenter.renderBody(
      makeEntry(body),
      { 'ast-zip-001': 'ZIPdata' },
      { 'ast-zip-001': 'application/zip' },
    );
    const rows = el.querySelectorAll('.pkc-textlog-text');
    // Reversed order: log-asset first, log-plain second
    expect(rows[0]!.innerHTML).toContain('#asset-ast-zip-001');
    expect(rows[1]!.textContent).toBe('just plain text');
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
