/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from 'vitest';
import {
  parseAttachmentBody,
  serializeAttachmentBody,
  estimateSize,
  attachmentPresenter,
} from '@adapter/ui/attachment-presenter';
import type { Entry } from '@core/model/record';
import { registerPresenter, getPresenter } from '@adapter/ui/detail-presenter';

// "SGVsbG8=" is base64 for "Hello" (5 bytes)
const HELLO_B64 = 'SGVsbG8=';

function makeAttEntry(body: string = `{"name":"test.txt","mime":"text/plain","data":"${HELLO_B64}"}`): Entry {
  return {
    lid: 'att1', title: 'My File', body,
    archetype: 'attachment', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  };
}

describe('Attachment Presenter', () => {
  // ── parse / serialize ─────────────────

  it('parseAttachmentBody parses valid JSON', () => {
    const result = parseAttachmentBody(`{"name":"doc.pdf","mime":"application/pdf","data":"AQID"}`);
    expect(result).toEqual({ name: 'doc.pdf', mime: 'application/pdf', data: 'AQID' });
  });

  it('parseAttachmentBody returns defaults for invalid JSON', () => {
    const result = parseAttachmentBody('not json');
    expect(result).toEqual({ name: '', mime: 'application/octet-stream', data: '' });
  });

  it('parseAttachmentBody returns defaults for empty string', () => {
    const result = parseAttachmentBody('');
    expect(result).toEqual({ name: '', mime: 'application/octet-stream', data: '' });
  });

  it('parseAttachmentBody handles partial fields', () => {
    const result = parseAttachmentBody('{"name":"file.bin"}');
    expect(result).toEqual({ name: 'file.bin', mime: 'application/octet-stream', data: '' });
  });

  it('serializeAttachmentBody produces valid JSON', () => {
    const body = serializeAttachmentBody({ name: 'a.txt', mime: 'text/plain', data: HELLO_B64 });
    const parsed = JSON.parse(body);
    expect(parsed).toEqual({ name: 'a.txt', mime: 'text/plain', data: HELLO_B64 });
  });

  it('parse → serialize → parse round-trip', () => {
    const original = { name: 'img.png', mime: 'image/png', data: 'iVBORw0KGgo=' };
    const serialized = serializeAttachmentBody(original);
    const parsed = parseAttachmentBody(serialized);
    expect(parsed).toEqual(original);
  });

  // ── estimateSize ─────────────────

  it('estimateSize returns 0 for empty string', () => {
    expect(estimateSize('')).toBe(0);
  });

  it('estimateSize calculates correctly for "SGVsbG8=" (Hello = 5 bytes)', () => {
    expect(estimateSize(HELLO_B64)).toBe(5);
  });

  it('estimateSize handles no-padding base64', () => {
    // "YQ" is base64 for "a" (1 byte) — no padding in this variant
    // Actually "YQ==" is standard. Let's use a known: "AQID" = 3 bytes
    expect(estimateSize('AQID')).toBe(3);
  });

  // ── renderBody ─────────────────

  it('renderBody shows file info', () => {
    const el = attachmentPresenter.renderBody(makeAttEntry());
    expect(el.className).toBe('pkc-attachment-view');
    const name = el.querySelector('.pkc-attachment-name');
    expect(name!.textContent).toBe('test.txt');
    const mime = el.querySelector('.pkc-attachment-mime');
    expect(mime!.textContent).toBe('text/plain');
    const size = el.querySelector('.pkc-attachment-size');
    expect(size!.textContent).toBe('5 B');
  });

  it('renderBody shows (no file) for empty name', () => {
    const el = attachmentPresenter.renderBody(makeAttEntry('{}'));
    const name = el.querySelector('.pkc-attachment-name');
    expect(name!.textContent).toBe('(no file)');
  });

  it('renderBody shows (empty) for empty data', () => {
    const el = attachmentPresenter.renderBody(makeAttEntry('{"name":"x","mime":"text/plain","data":""}'));
    const size = el.querySelector('.pkc-attachment-size');
    expect(size!.textContent).toBe('(empty)');
  });

  // ── renderEditorBody ─────────────────

  it('renderEditorBody creates file input and hidden fields', () => {
    const el = attachmentPresenter.renderEditorBody(makeAttEntry());
    expect(el.querySelector('[data-pkc-field="attachment-file"]')).not.toBeNull();
    expect(el.querySelector<HTMLInputElement>('[data-pkc-field="attachment-name"]')!.value).toBe('test.txt');
    expect(el.querySelector<HTMLInputElement>('[data-pkc-field="attachment-mime"]')!.value).toBe('text/plain');
    expect(el.querySelector<HTMLInputElement>('[data-pkc-field="attachment-data"]')!.value).toBe(HELLO_B64);
  });

  it('renderEditorBody shows current file info when file exists', () => {
    const el = attachmentPresenter.renderEditorBody(makeAttEntry());
    const current = el.querySelector('.pkc-attachment-current');
    expect(current).not.toBeNull();
    expect(current!.textContent).toContain('test.txt');
  });

  it('renderEditorBody hides current info for empty attachment', () => {
    const el = attachmentPresenter.renderEditorBody(makeAttEntry('{}'));
    const current = el.querySelector('.pkc-attachment-current');
    expect(current).toBeNull();
  });

  // ── collectBody ─────────────────

  it('collectBody collects values from hidden fields', () => {
    const editor = attachmentPresenter.renderEditorBody(makeAttEntry());
    const root = document.createElement('div');
    root.appendChild(editor);
    const body = attachmentPresenter.collectBody(root);
    const parsed = JSON.parse(body);
    expect(parsed).toEqual({ name: 'test.txt', mime: 'text/plain', data: HELLO_B64 });
  });

  it('collectBody returns defaults when fields not found', () => {
    const root = document.createElement('div');
    const body = attachmentPresenter.collectBody(root);
    const parsed = JSON.parse(body);
    expect(parsed).toEqual({ name: '', mime: 'application/octet-stream', data: '' });
  });

  // ── presenter registry ─────────────────

  it('getPresenter returns attachmentPresenter when registered', () => {
    registerPresenter('attachment', attachmentPresenter);
    expect(getPresenter('attachment')).toBe(attachmentPresenter);
  });
});
