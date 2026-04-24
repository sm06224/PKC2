/**
 * @vitest-environment happy-dom
 *
 * Unit test for `maybeHandleLinkPaste` — the adapter helper that
 * splices a same-container PKC permalink into a textarea / input as
 * an internal markdown link. Integration with the editor paste event
 * lives in `action-binder-link-paste.test.ts`.
 *
 * Spec: docs/spec/pkc-link-unification-v0.md §6.1 / §7.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { maybeHandleLinkPaste } from '@adapter/ui/link-paste-handler';

const SELF = 'self-container-id';
const OTHER = 'other-container-id';

let textarea: HTMLTextAreaElement;

beforeEach(() => {
  document.body.innerHTML = '';
  textarea = document.createElement('textarea');
  document.body.appendChild(textarea);
  textarea.focus();
});

function setSelection(value: string, start: number, end: number = start): void {
  textarea.value = value;
  textarea.setSelectionRange(start, end);
}

function lastInputCount(): number {
  return Number(textarea.dataset.inputCount ?? '0');
}

beforeEach(() => {
  // Track input events so we can assert dispatch.
  textarea.addEventListener('input', () => {
    const cur = Number(textarea.dataset.inputCount ?? '0') + 1;
    textarea.dataset.inputCount = String(cur);
  });
});

describe('maybeHandleLinkPaste — same-container conversion', () => {
  it('inserts [](entry:<lid>) for a same-container entry permalink', () => {
    setSelection('', 0);
    const handled = maybeHandleLinkPaste(
      textarea,
      `pkc://${SELF}/entry/lid_a`,
      SELF,
    );
    expect(handled).toBe(true);
    expect(textarea.value).toBe('[](entry:lid_a)');
  });

  it('inserts [](asset:<key>) for a same-container asset permalink', () => {
    setSelection('', 0);
    const handled = maybeHandleLinkPaste(
      textarea,
      `pkc://${SELF}/asset/ast-001`,
      SELF,
    );
    expect(handled).toBe(true);
    expect(textarea.value).toBe('[](asset:ast-001)');
  });

  it('preserves an entry fragment in the inserted target', () => {
    setSelection('', 0);
    const handled = maybeHandleLinkPaste(
      textarea,
      `pkc://${SELF}/entry/lid_a#log/xyz`,
      SELF,
    );
    expect(handled).toBe(true);
    expect(textarea.value).toBe('[](entry:lid_a#log/xyz)');
  });

  it('replaces selected text with the markdown link', () => {
    setSelection('before SELECT after', 7, 13);
    const handled = maybeHandleLinkPaste(
      textarea,
      `pkc://${SELF}/entry/lid_a`,
      SELF,
    );
    expect(handled).toBe(true);
    expect(textarea.value).toBe('before [](entry:lid_a) after');
  });

  it('inserts at the caret position (end after insertion)', () => {
    setSelection('xy', 1);
    const handled = maybeHandleLinkPaste(
      textarea,
      `pkc://${SELF}/entry/lid_a`,
      SELF,
    );
    expect(handled).toBe(true);
    expect(textarea.value).toBe('x[](entry:lid_a)y');
    // After insertion the caret should sit at the end of the splice,
    // which is the boundary between the link and the trailing 'y'.
    expect(textarea.selectionStart).toBe('x[](entry:lid_a)'.length);
    expect(textarea.selectionEnd).toBe('x[](entry:lid_a)'.length);
  });

  it('dispatches an input event so dirty tracking sees the change', () => {
    const before = lastInputCount();
    setSelection('', 0);
    maybeHandleLinkPaste(textarea, `pkc://${SELF}/entry/lid_a`, SELF);
    expect(lastInputCount()).toBeGreaterThan(before);
  });
});

describe('maybeHandleLinkPaste — no-op fallbacks', () => {
  it('returns false on a cross-container permalink (caller keeps default paste)', () => {
    setSelection('keep me', 0, 7);
    const handled = maybeHandleLinkPaste(
      textarea,
      `pkc://${OTHER}/entry/lid_a`,
      SELF,
    );
    expect(handled).toBe(false);
    // The helper must not splice anything when it returns false.
    expect(textarea.value).toBe('keep me');
  });

  it('returns false on a malformed permalink', () => {
    setSelection('keep me', 0, 7);
    const handled = maybeHandleLinkPaste(
      textarea,
      `pkc://${SELF}/folder/lid_a`,
      SELF,
    );
    expect(handled).toBe(false);
    expect(textarea.value).toBe('keep me');
  });

  it('returns false on an ordinary https URL', () => {
    setSelection('', 0);
    const handled = maybeHandleLinkPaste(
      textarea,
      'https://example.com/page',
      SELF,
    );
    expect(handled).toBe(false);
    expect(textarea.value).toBe('');
  });

  it('returns false on plain text', () => {
    setSelection('', 0);
    const handled = maybeHandleLinkPaste(textarea, 'hello world', SELF);
    expect(handled).toBe(false);
    expect(textarea.value).toBe('');
  });

  it('returns false when the current container id is empty (bootstrap safety)', () => {
    setSelection('', 0);
    const handled = maybeHandleLinkPaste(
      textarea,
      `pkc://${SELF}/entry/lid_a`,
      '',
    );
    expect(handled).toBe(false);
    expect(textarea.value).toBe('');
  });

  it('returns false when raw input is empty', () => {
    setSelection('untouched', 0);
    const handled = maybeHandleLinkPaste(textarea, '', SELF);
    expect(handled).toBe(false);
    expect(textarea.value).toBe('untouched');
  });

  it('does NOT wrap a bare entry: ref the user typed by hand', () => {
    // Spec rationale: the writer already chose the internal form;
    // silently wrapping it in [](…) would surprise them. Only
    // explicit pkc:// permalinks should trigger the wrap.
    setSelection('', 0);
    const handled = maybeHandleLinkPaste(textarea, 'entry:lid_a', SELF);
    expect(handled).toBe(false);
    expect(textarea.value).toBe('');
  });

  it('returns false when target element is null', () => {
    const handled = maybeHandleLinkPaste(
      null,
      `pkc://${SELF}/entry/lid_a`,
      SELF,
    );
    expect(handled).toBe(false);
  });
});

describe('maybeHandleLinkPaste — text input support', () => {
  it('also works on a text-capable <input>', () => {
    const input = document.createElement('input');
    input.type = 'text';
    document.body.appendChild(input);
    input.value = '';
    input.focus();

    const handled = maybeHandleLinkPaste(
      input,
      `pkc://${SELF}/entry/lid_a`,
      SELF,
    );
    expect(handled).toBe(true);
    expect(input.value).toBe('[](entry:lid_a)');
  });
});
