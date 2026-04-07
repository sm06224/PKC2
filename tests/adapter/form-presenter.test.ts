/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from 'vitest';
import {
  parseFormBody,
  serializeFormBody,
  formPresenter,
} from '@adapter/ui/form-presenter';
import type { Entry } from '@core/model/record';
import { registerPresenter, getPresenter } from '@adapter/ui/detail-presenter';

function makeFormEntry(body: string = '{"name":"Alice","note":"Hello","checked":false}'): Entry {
  return {
    lid: 'form1', title: 'Contact', body,
    archetype: 'form', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  };
}

describe('Form Presenter', () => {
  // ── parse / serialize ─────────────────

  it('parseFormBody parses valid JSON', () => {
    const result = parseFormBody('{"name":"Bob","note":"test","checked":true}');
    expect(result).toEqual({ name: 'Bob', note: 'test', checked: true });
  });

  it('parseFormBody returns defaults for invalid JSON', () => {
    const result = parseFormBody('not json');
    expect(result).toEqual({ name: '', note: '', checked: false });
  });

  it('parseFormBody returns defaults for empty string', () => {
    const result = parseFormBody('');
    expect(result).toEqual({ name: '', note: '', checked: false });
  });

  it('parseFormBody handles partial fields', () => {
    const result = parseFormBody('{"name":"Alice"}');
    expect(result).toEqual({ name: 'Alice', note: '', checked: false });
  });

  it('parseFormBody coerces non-true checked to false', () => {
    const result = parseFormBody('{"name":"","note":"","checked":"yes"}');
    expect(result.checked).toBe(false);
  });

  it('serializeFormBody produces valid JSON', () => {
    const body = serializeFormBody({ name: 'Alice', note: 'test', checked: true });
    const parsed = JSON.parse(body);
    expect(parsed).toEqual({ name: 'Alice', note: 'test', checked: true });
  });

  it('parse → serialize → parse round-trip', () => {
    const original = { name: 'Bob', note: 'notes here', checked: true };
    const serialized = serializeFormBody(original);
    const parsed = parseFormBody(serialized);
    expect(parsed).toEqual(original);
  });

  // ── renderBody ─────────────────

  it('renderBody shows field values', () => {
    const el = formPresenter.renderBody(makeFormEntry());
    expect(el.className).toBe('pkc-form-view');
    const values = el.querySelectorAll('.pkc-form-value');
    expect(values).toHaveLength(3);
    expect(values[0]!.textContent).toBe('Alice');
    expect(values[1]!.textContent).toBe('Hello');
    expect(values[2]!.textContent).toBe('No');
  });

  it('renderBody shows (empty) for missing fields', () => {
    const el = formPresenter.renderBody(makeFormEntry('{}'));
    const values = el.querySelectorAll('.pkc-form-value');
    expect(values[0]!.textContent).toBe('(empty)');
    expect(values[1]!.textContent).toBe('(empty)');
    expect(values[2]!.textContent).toBe('No');
  });

  it('renderBody shows Yes for checked=true', () => {
    const el = formPresenter.renderBody(makeFormEntry('{"name":"","note":"","checked":true}'));
    const values = el.querySelectorAll('.pkc-form-value');
    expect(values[2]!.textContent).toBe('Yes');
  });

  // ── renderEditorBody ─────────────────

  it('renderEditorBody creates input, textarea, and checkbox', () => {
    const el = formPresenter.renderEditorBody(makeFormEntry());
    const nameInput = el.querySelector<HTMLInputElement>('[data-pkc-field="form-name"]');
    const noteArea = el.querySelector<HTMLTextAreaElement>('[data-pkc-field="form-note"]');
    const checkedInput = el.querySelector<HTMLInputElement>('[data-pkc-field="form-checked"]');
    expect(nameInput).not.toBeNull();
    expect(nameInput!.value).toBe('Alice');
    expect(noteArea).not.toBeNull();
    expect(noteArea!.value).toBe('Hello');
    expect(checkedInput).not.toBeNull();
    expect(checkedInput!.type).toBe('checkbox');
    expect(checkedInput!.checked).toBe(false);
  });

  it('renderEditorBody populates checked state', () => {
    const el = formPresenter.renderEditorBody(makeFormEntry('{"name":"","note":"","checked":true}'));
    const checkedInput = el.querySelector<HTMLInputElement>('[data-pkc-field="form-checked"]');
    expect(checkedInput!.checked).toBe(true);
  });

  // ── collectBody ─────────────────

  it('collectBody collects values from editor DOM', () => {
    const editor = formPresenter.renderEditorBody(makeFormEntry());
    // Simulate user edits
    const nameInput = editor.querySelector<HTMLInputElement>('[data-pkc-field="form-name"]')!;
    nameInput.value = 'Modified';
    const noteArea = editor.querySelector<HTMLTextAreaElement>('[data-pkc-field="form-note"]')!;
    noteArea.value = 'New note';
    const checkedInput = editor.querySelector<HTMLInputElement>('[data-pkc-field="form-checked"]')!;
    checkedInput.checked = true;

    // collectBody reads from root containing editor
    const root = document.createElement('div');
    root.appendChild(editor);
    const body = formPresenter.collectBody(root);
    const parsed = JSON.parse(body);
    expect(parsed).toEqual({ name: 'Modified', note: 'New note', checked: true });
  });

  it('collectBody returns defaults when fields not found', () => {
    const root = document.createElement('div');
    const body = formPresenter.collectBody(root);
    const parsed = JSON.parse(body);
    expect(parsed).toEqual({ name: '', note: '', checked: false });
  });

  // ── presenter registry ─────────────────

  it('getPresenter returns formPresenter when registered', () => {
    registerPresenter('form', formPresenter);
    expect(getPresenter('form')).toBe(formPresenter);
  });
});
