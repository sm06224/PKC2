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
  it('renders log entries as timeline articles', () => {
    const el = textlogPresenter.renderBody(makeEntry(sampleBody));
    const logs = el.querySelectorAll('.pkc-textlog-log');
    expect(logs.length).toBe(3);
  });

  it('wraps logs in a day-grouped document with <section> per day', () => {
    // Slice 2 contract: the live viewer replaces the flat list with
    // `.pkc-textlog-document` → `.pkc-textlog-day` → `.pkc-textlog-log`.
    const el = textlogPresenter.renderBody(makeEntry(sampleBody));
    const doc = el.querySelector('.pkc-textlog-document');
    expect(doc).not.toBeNull();
    const days = el.querySelectorAll('.pkc-textlog-day');
    // sampleBody has three logs on the same day.
    expect(days.length).toBe(1);
  });

  it('gives each day section a yyyy-mm-dd id and each log a log-<id> id', () => {
    const el = textlogPresenter.renderBody(makeEntry(sampleBody));
    const day = el.querySelector<HTMLElement>('.pkc-textlog-day');
    expect(day!.id).toMatch(/^day-\d{4}-\d{2}-\d{2}$/);
    const articles = el.querySelectorAll<HTMLElement>('.pkc-textlog-log');
    for (const a of articles) {
      expect(a.id).toMatch(/^log-/);
    }
  });

  it("applies desc order to BOTH day sections AND logs within each day", () => {
    const multiDay: TextlogBody = {
      entries: [
        { id: 'a', text: 't1', createdAt: '2026-04-09T10:00:00Z', flags: [] },
        { id: 'b', text: 't2', createdAt: '2026-04-09T11:00:00Z', flags: [] },
        { id: 'c', text: 't3', createdAt: '2026-04-10T09:00:00Z', flags: [] },
        { id: 'd', text: 't4', createdAt: '2026-04-10T10:00:00Z', flags: [] },
      ],
    };
    const el = textlogPresenter.renderBody(makeEntry(multiDay));
    const days = Array.from(
      el.querySelectorAll<HTMLElement>('.pkc-textlog-day'),
    ).map((s) => s.getAttribute('data-pkc-date-key'));
    // Newest day first.
    expect(days).toEqual(['2026-04-10', '2026-04-09']);
    // Newest log first inside each day.
    const logs = Array.from(
      el.querySelectorAll<HTMLElement>('.pkc-textlog-log'),
    ).map((a) => a.getAttribute('data-pkc-log-id'));
    expect(logs).toEqual(['d', 'c', 'b', 'a']);
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

  it('timestamp display includes seconds (HH:mm:ss) — A-1 readability', () => {
    const el = textlogPresenter.renderBody(makeEntry(sampleBody));
    const timestamps = el.querySelectorAll('.pkc-textlog-timestamp');
    // Every row's timestamp must carry HH:mm:ss so high-frequency log
    // entries stay visually distinguishable. See
    // docs/development/textlog-readability-hardening.md.
    for (const ts of timestamps) {
      expect(ts.textContent).toMatch(/\d{2}:\d{2}:\d{2}/);
    }
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
    const logs = el.querySelectorAll('.pkc-textlog-log');
    // Desc order: log-3 (no flag), log-2 (important), log-1 (no flag).
    expect(logs[0]!.getAttribute('data-pkc-log-important')).toBeNull();
    expect(logs[1]!.getAttribute('data-pkc-log-important')).toBe('true');
  });

  it('each article carries data-pkc-lid so Alt+Click / edit-log can resolve the owning entry', () => {
    const el = textlogPresenter.renderBody(makeEntry(sampleBody, 'tl-owner'));
    const logs = el.querySelectorAll<HTMLElement>('.pkc-textlog-log');
    expect(logs.length).toBe(3);
    for (const a of logs) {
      expect(a.getAttribute('data-pkc-lid')).toBe('tl-owner');
      expect(a.getAttribute('data-pkc-log-id')).toBeTruthy();
    }
  });

  it('Slice 4: each article carries an explicit ✏︎ edit-log button', () => {
    const el = textlogPresenter.renderBody(makeEntry(sampleBody, 'tl-owner'));
    const editBtns = el.querySelectorAll<HTMLElement>('[data-pkc-action="edit-log"]');
    expect(editBtns.length).toBe(3);
    for (const btn of Array.from(editBtns)) {
      expect(btn.getAttribute('data-pkc-lid')).toBe('tl-owner');
      expect(btn.getAttribute('data-pkc-log-id')).toBeTruthy();
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
    expect(mdRow!.innerHTML).toMatch(/<h1[ >]/);
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

  it('marks important article with the data attribute used for visibility styling', () => {
    const el = textlogPresenter.renderBody(makeEntry(sampleBody));
    const important = el.querySelector('.pkc-textlog-log[data-pkc-log-important="true"]');
    expect(important).not.toBeNull();
    // The important article still has its normal flag button and text children.
    expect(important!.querySelector('.pkc-textlog-flag-btn')).not.toBeNull();
    expect(important!.querySelector('.pkc-textlog-text')).not.toBeNull();
  });

  it('exposes a copy-anchor button per article so users can grab `entry:<lid>#log/<id>` refs', () => {
    const el = textlogPresenter.renderBody(makeEntry(sampleBody, 'tl-owner'));
    const anchors = el.querySelectorAll<HTMLElement>(
      '.pkc-textlog-log [data-pkc-action="copy-log-line-ref"]',
    );
    expect(anchors.length).toBe(3);
    for (const a of anchors) {
      expect(a.getAttribute('data-pkc-lid')).toBe('tl-owner');
      expect(a.getAttribute('data-pkc-log-id')).toBeTruthy();
    }
  });

  it('places logs with unparseable timestamps into a dedicated "day-undated" section', () => {
    const body: TextlogBody = {
      entries: [
        { id: 'bad', text: 'broken', createdAt: 'not-a-date', flags: [] },
        { id: 'ok', text: 'ok', createdAt: '2026-04-09T10:00:00Z', flags: [] },
      ],
    };
    const el = textlogPresenter.renderBody(makeEntry(body));
    const undated = el.querySelector('#day-undated');
    expect(undated).not.toBeNull();
    expect(undated!.querySelector('.pkc-textlog-log')!.getAttribute('data-pkc-log-id')).toBe('bad');
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

  // ── Slice 2 structure ──

  it('article layout is <header>(flag, ts, anchor) then .pkc-textlog-text', () => {
    const el = textlogPresenter.renderBody(makeEntry(sampleBody));
    const articles = el.querySelectorAll<HTMLElement>('.pkc-textlog-log');
    for (const art of articles) {
      const children = Array.from(art.children) as HTMLElement[];
      expect(children[0]!.classList.contains('pkc-textlog-log-header')).toBe(true);
      expect(children[1]!.classList.contains('pkc-textlog-text')).toBe(true);
      const headerKids = Array.from(children[0]!.children) as HTMLElement[];
      // Header order is [flag, timestamp, anchor]. Flag and anchor are
      // both buttons — disambiguate by data-pkc-action so the assertion
      // survives future cosmetic tweaks to child classes.
      expect(headerKids[0]!.classList.contains('pkc-textlog-flag-btn')).toBe(true);
      expect(headerKids[1]!.classList.contains('pkc-textlog-timestamp')).toBe(true);
      expect(headerKids[2]!.getAttribute('data-pkc-action')).toBe('copy-log-line-ref');
    }
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

  it('shows flag checkboxes (editor in descending order)', () => {
    const el = textlogPresenter.renderEditorBody(makeEntry(sampleBody));
    const checks = el.querySelectorAll<HTMLInputElement>('[data-pkc-field="textlog-flag"]');
    expect(checks.length).toBe(3);
    // Reversed: log-3 (no flag), log-2 (important), log-1 (no flag)
    expect(checks[0]!.checked).toBe(false);
    expect(checks[1]!.checked).toBe(true);
    expect(checks[2]!.checked).toBe(false);
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

  // ── P0-1: editor textarea sizing regression guard ──

  it('per-log textarea has at least 5 rows for short entries (P0-1 regression guard)', () => {
    // Regression: rows=2 hardcoded made the edit area a near-invisible sliver
    // when double-clicking to edit. Minimum must stay usable.
    const shortBody: TextlogBody = {
      entries: [
        { id: 'log-short', text: 'short', createdAt: '2026-04-09T10:00:00Z', flags: [] },
      ],
    };
    const el = textlogPresenter.renderEditorBody(makeEntry(shortBody));
    const ta = el.querySelector<HTMLTextAreaElement>('[data-pkc-field="textlog-entry-text"]');
    expect(ta).not.toBeNull();
    // happy-dom reports `rows` as a string; normalize for numeric comparison.
    expect(Number(ta!.rows)).toBeGreaterThanOrEqual(5);
  });

  it('per-log textarea grows with content (line count + buffer)', () => {
    const longText = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join('\n');
    const longBody: TextlogBody = {
      entries: [
        { id: 'log-long', text: longText, createdAt: '2026-04-09T10:00:00Z', flags: [] },
      ],
    };
    const el = textlogPresenter.renderEditorBody(makeEntry(longBody));
    const ta = el.querySelector<HTMLTextAreaElement>('[data-pkc-field="textlog-entry-text"]');
    // 20 lines + 2 buffer = 22, should grow past the 5-row minimum.
    expect(Number(ta!.rows)).toBeGreaterThanOrEqual(22);
  });

  it('each editor row gets its own dynamic sizing (no shared single hardcoded value)', () => {
    const mixedBody: TextlogBody = {
      entries: [
        { id: 'log-a', text: 'a', createdAt: '2026-04-09T10:00:00Z', flags: [] },
        {
          id: 'log-b',
          text: Array.from({ length: 12 }, (_, i) => `l${i}`).join('\n'),
          createdAt: '2026-04-09T11:00:00Z',
          flags: [],
        },
      ],
    };
    const el = textlogPresenter.renderEditorBody(makeEntry(mixedBody));
    const rows = Array.from(
      el.querySelectorAll<HTMLTextAreaElement>('[data-pkc-field="textlog-entry-text"]'),
    ).map((t) => Number(t.rows));
    // Reversed display: [log-b(long), log-a(short)].
    expect(rows[0]).toBeGreaterThan(rows[1]!);
    // Short entry still honors the 5-row floor.
    expect(rows[1]).toBeGreaterThanOrEqual(5);
  });
});

// ── collectBody ──

describe('textlog collectBody', () => {
  it('collects edited entries back to JSON in original chronological order', () => {
    const entry = makeEntry(sampleBody);
    const editorEl = textlogPresenter.renderEditorBody(entry);

    // Editor displays in reversed order: textareas[0] is log-3 (newest)
    const textareas = editorEl.querySelectorAll<HTMLTextAreaElement>('[data-pkc-field="textlog-entry-text"]');
    textareas[0]!.value = 'Edited newest entry';

    const collected = textlogPresenter.collectBody(editorEl);
    const parsed = JSON.parse(collected);
    expect(parsed.entries).toHaveLength(3);
    // collectBody restores original chronological order
    expect(parsed.entries[0].id).toBe('log-1');
    expect(parsed.entries[0].createdAt).toBe('2026-04-09T10:00:00Z');
    expect(parsed.entries[2].id).toBe('log-3');
    expect(parsed.entries[2].text).toBe('Edited newest entry');
  });

  it('collects flag changes (restores original order)', () => {
    const entry = makeEntry(sampleBody);
    const editorEl = textlogPresenter.renderEditorBody(entry);

    // Editor reversed: checks[0]=log-3, checks[1]=log-2(important), checks[2]=log-1
    const checks = editorEl.querySelectorAll<HTMLInputElement>('[data-pkc-field="textlog-flag"]');
    checks[0]!.checked = true;   // log-3: add important
    checks[1]!.checked = false;  // log-2: remove important

    const collected = textlogPresenter.collectBody(editorEl);
    const parsed = JSON.parse(collected);
    // Original order restored: [log-1, log-2, log-3]
    expect(parsed.entries[0].flags).toEqual([]);        // log-1 unchanged
    expect(parsed.entries[1].flags).toEqual([]);         // log-2 flag removed
    expect(parsed.entries[2].flags).toEqual(['important']); // log-3 flag added
  });

  it('returns empty body when no edit rows', () => {
    const div = document.createElement('div');
    const collected = textlogPresenter.collectBody(div);
    const parsed = JSON.parse(collected);
    expect(parsed.entries).toEqual([]);
  });
});

// ── FI-08.x: TEXTLOG rendered view autolinks bare URL (T-FBC-14) ──
// See docs/spec/addressbar-paste-fallback-v1-behavior-contract.md §7-6
describe('FI-08.x — TEXTLOG rendered view autolink (T-FBC-14)', () => {
  it('T-FBC-14: TEXTLOG article containing a bare URL renders as <a href>', () => {
    const body: TextlogBody = {
      entries: [
        { id: 'log-u', text: 'https://example.com', createdAt: '2026-04-09T10:00:00Z', flags: [] },
      ],
    };
    const el = textlogPresenter.renderBody(makeEntry(body));
    const anchor = el.querySelector('a[href="https://example.com"]');
    expect(anchor).not.toBeNull();
    expect(anchor!.getAttribute('target')).toBe('_blank');
    expect(anchor!.getAttribute('rel')).toBe('noopener noreferrer');
  });
});
