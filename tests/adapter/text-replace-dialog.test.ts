/**
 * @vitest-environment happy-dom
 *
 * Integration test for the text-replace dialog (S-26). Drives the
 * overlay directly via `openTextReplaceDialog` against a synthetic
 * body textarea — does not go through the action-binder click path
 * here, that is exercised separately.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  openTextReplaceDialog,
  closeTextReplaceDialog,
  isTextReplaceDialogOpen,
} from '@adapter/ui/text-replace-dialog';

let root: HTMLElement;
let textarea: HTMLTextAreaElement;

function setup(
  initialBody: string,
  selection?: { start: number; end: number },
): void {
  root = document.createElement('div');
  root.id = 'pkc-root';
  document.body.appendChild(root);

  textarea = document.createElement('textarea');
  textarea.setAttribute('data-pkc-field', 'body');
  textarea.value = initialBody;
  root.appendChild(textarea);
  if (selection) {
    textarea.focus();
    textarea.setSelectionRange(selection.start, selection.end);
  }
}

function find(selector: string): HTMLElement {
  const el = root.querySelector<HTMLElement>(selector);
  if (!el) throw new Error(`selector not found: ${selector}`);
  return el;
}

function dialogOverlay(): HTMLElement {
  return find('[data-pkc-region="text-replace-dialog"]');
}

function setInput(field: string, value: string): void {
  const el = dialogOverlay().querySelector<HTMLInputElement>(
    `[data-pkc-field="${field}"]`,
  );
  if (!el) throw new Error(`input not found: ${field}`);
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function setCheckbox(field: string, value: boolean): void {
  const el = dialogOverlay().querySelector<HTMLInputElement>(
    `[data-pkc-field="${field}"]`,
  );
  if (!el) throw new Error(`checkbox not found: ${field}`);
  el.checked = value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function statusText(): string {
  return dialogOverlay()
    .querySelector('.pkc-text-replace-status')!
    .textContent ?? '';
}

function applyBtn(): HTMLButtonElement {
  return dialogOverlay().querySelector<HTMLButtonElement>(
    '[data-pkc-action="text-replace-apply"]',
  )!;
}

function closeBtn(): HTMLButtonElement {
  return dialogOverlay().querySelector<HTMLButtonElement>(
    '[data-pkc-action="text-replace-close"]',
  )!;
}

beforeEach(() => {
  // Ensure no overlay leaks between tests.
  closeTextReplaceDialog();
  document.body.innerHTML = '';
});

describe('text-replace dialog', () => {
  it('silently ignores a non-body textarea', () => {
    setup('body');
    textarea.setAttribute('data-pkc-field', 'title'); // wrong field
    openTextReplaceDialog(textarea, root);
    expect(isTextReplaceDialogOpen()).toBe(false);
  });

  it('opens and focuses the Find input', () => {
    setup('abc');
    openTextReplaceDialog(textarea, root);
    expect(isTextReplaceDialogOpen()).toBe(true);
    const findInput = dialogOverlay().querySelector<HTMLInputElement>(
      '[data-pkc-field="text-replace-find"]',
    )!;
    expect(document.activeElement).toBe(findInput);
  });

  it('shows an empty-query hint and disables Apply on open', () => {
    setup('abc');
    openTextReplaceDialog(textarea, root);
    expect(statusText()).toMatch(/enter/i);
    expect(applyBtn().disabled).toBe(true);
  });

  it('counts case-insensitive matches by default', () => {
    setup('Apple apple APPLE orange');
    openTextReplaceDialog(textarea, root);
    setInput('text-replace-find', 'apple');
    expect(statusText()).toContain('3');
    expect(applyBtn().disabled).toBe(false);
  });

  it('counts case-sensitive matches when opted in', () => {
    setup('Apple apple APPLE orange');
    openTextReplaceDialog(textarea, root);
    setInput('text-replace-find', 'apple');
    setCheckbox('text-replace-case', true);
    expect(statusText()).toContain('1');
  });

  it('counts regex matches when regex is opted in', () => {
    setup('one1 two22 three333');
    openTextReplaceDialog(textarea, root);
    setCheckbox('text-replace-regex', true);
    setInput('text-replace-find', '\\d+');
    expect(statusText()).toContain('3');
  });

  it('shows an error and disables Apply for invalid regex', () => {
    setup('body');
    openTextReplaceDialog(textarea, root);
    setCheckbox('text-replace-regex', true);
    setInput('text-replace-find', '[unclosed');
    const s = dialogOverlay().querySelector(
      '.pkc-text-replace-status',
    ) as HTMLElement;
    expect(s.getAttribute('data-pkc-error')).toBe('true');
    expect(applyBtn().disabled).toBe(true);
  });

  it('disables Apply when no matches are found', () => {
    setup('hello world');
    openTextReplaceDialog(textarea, root);
    setInput('text-replace-find', 'xxx');
    expect(statusText()).toMatch(/no matches/i);
    expect(applyBtn().disabled).toBe(true);
  });

  it('applies a plain replacement and fires the input event', () => {
    setup('Apple apple APPLE');
    let inputEvents = 0;
    textarea.addEventListener('input', () => { inputEvents++; });

    openTextReplaceDialog(textarea, root);
    setInput('text-replace-find', 'apple');
    setInput('text-replace-replace', 'pear');
    applyBtn().click();

    expect(textarea.value).toBe('pear pear pear');
    // After apply the dialog stays open, the count drops to 0.
    expect(statusText()).toMatch(/no matches/i);
    expect(applyBtn().disabled).toBe(true);
    expect(inputEvents).toBeGreaterThanOrEqual(1);
  });

  it('applies a regex replacement with back-references', () => {
    setup('John Smith, Mary Jane');
    openTextReplaceDialog(textarea, root);
    setCheckbox('text-replace-regex', true);
    setInput('text-replace-find', '(\\w+) (\\w+)');
    setInput('text-replace-replace', '$2 $1');
    applyBtn().click();
    expect(textarea.value).toBe('Smith John, Jane Mary');
  });

  it('is a no-op when the hit count is zero (Apply stays disabled)', () => {
    setup('body');
    openTextReplaceDialog(textarea, root);
    setInput('text-replace-find', 'xxx');
    // Button disabled state means a programmatic click still fires
    // — defensively confirm the apply path does nothing.
    const before = textarea.value;
    applyBtn().click();
    expect(textarea.value).toBe(before);
  });

  it('closes on the Close button', () => {
    setup('abc');
    openTextReplaceDialog(textarea, root);
    closeBtn().click();
    expect(isTextReplaceDialogOpen()).toBe(false);
  });

  it('closes on Escape without bubbling to global handlers', () => {
    setup('abc');
    let globalEscape = 0;
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') globalEscape++;
    });
    openTextReplaceDialog(textarea, root);
    const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    document.dispatchEvent(ev);
    expect(isTextReplaceDialogOpen()).toBe(false);
    // stopPropagation in capture phase prevents the bubble listener
    // from ever seeing the Escape. Keeps edit-mode's own Escape
    // handler from also firing (which would cancel the edit).
    expect(globalEscape).toBe(0);
  });

  it('restores focus to the body textarea after close', () => {
    setup('abc');
    openTextReplaceDialog(textarea, root);
    closeBtn().click();
    expect(document.activeElement).toBe(textarea);
  });

  it('replaces the previous overlay when opened twice', () => {
    setup('abc');
    openTextReplaceDialog(textarea, root);
    openTextReplaceDialog(textarea, root);
    const overlays = root.querySelectorAll(
      '[data-pkc-region="text-replace-dialog"]',
    );
    expect(overlays.length).toBe(1);
  });
});

// ── Selection only (S-27) ────────────────────────────────

function selectionCheckbox(): HTMLInputElement {
  return dialogOverlay().querySelector<HTMLInputElement>(
    '[data-pkc-field="text-replace-selection"]',
  )!;
}

describe('text-replace dialog — Selection only', () => {
  it('disables the Selection-only checkbox when no selection was captured', () => {
    setup('apple apple apple');
    // No selection set → captured range is null.
    openTextReplaceDialog(textarea, root);
    const box = selectionCheckbox();
    expect(box.disabled).toBe(true);
  });

  it('enables the Selection-only checkbox when a non-empty selection was captured', () => {
    // Select the first two "apple"s (including the space between).
    setup('apple apple apple', { start: 0, end: 11 });
    openTextReplaceDialog(textarea, root);
    const box = selectionCheckbox();
    expect(box.disabled).toBe(false);
  });

  it('counts only inside the selection when Selection-only is ON', () => {
    setup('apple apple apple', { start: 0, end: 11 });
    openTextReplaceDialog(textarea, root);
    setCheckbox('text-replace-selection', true);
    setInput('text-replace-find', 'apple');
    // Range [0, 11] covers exactly two "apple"s.
    expect(statusText()).toContain('2');
    expect(statusText()).toMatch(/selection/i);
  });

  it('falls back to the full body when Selection-only is OFF', () => {
    setup('apple apple apple', { start: 0, end: 11 });
    openTextReplaceDialog(textarea, root);
    setInput('text-replace-find', 'apple');
    // Default: checkbox off → full body → 3 hits.
    expect(statusText()).toContain('3');
    expect(statusText()).toMatch(/current entry/i);
  });

  it('replaces only inside the selection and leaves the rest unchanged', () => {
    setup('apple apple apple', { start: 0, end: 11 });
    openTextReplaceDialog(textarea, root);
    setCheckbox('text-replace-selection', true);
    setInput('text-replace-find', 'apple');
    setInput('text-replace-replace', 'pear');
    applyBtn().click();
    // Selected range's two "apple"s → "pear"; the trailing one is
    // preserved because it lay outside [0, 11].
    expect(textarea.value).toBe('pear pear apple');
  });

  it('keeps subsequent Applies inside the (shifted) selection region', () => {
    // Range [0, 9] covers "aa aa aa ".
    setup('aa aa aa aa', { start: 0, end: 9 });
    openTextReplaceDialog(textarea, root);
    setCheckbox('text-replace-selection', true);
    setInput('text-replace-find', 'aa');
    setInput('text-replace-replace', 'bbbb');
    applyBtn().click();
    // The first three "aa" inside the selection expand to "bbbb".
    expect(textarea.value).toBe('bbbb bbbb bbbb aa');

    // A second Apply with a different replacement must stay inside
    // the shifted range and not touch the final "aa".
    setInput('text-replace-find', 'bbbb');
    setInput('text-replace-replace', 'c');
    applyBtn().click();
    expect(textarea.value).toBe('c c c aa');
  });

  it('honours regex mode inside the selection', () => {
    setup('a1 a22 a333 a4444', { start: 0, end: 11 });
    openTextReplaceDialog(textarea, root);
    setCheckbox('text-replace-selection', true);
    setCheckbox('text-replace-regex', true);
    setInput('text-replace-find', 'a\\d+');
    expect(statusText()).toContain('3');
    setInput('text-replace-replace', 'X');
    applyBtn().click();
    // Only the first three matches (inside [0, 11]) get replaced.
    expect(textarea.value).toBe('X X X a4444');
  });

  it('preserves invalid-regex gating when Selection only is on', () => {
    setup('abc abc abc', { start: 0, end: 7 });
    openTextReplaceDialog(textarea, root);
    setCheckbox('text-replace-selection', true);
    setCheckbox('text-replace-regex', true);
    setInput('text-replace-find', '[unclosed');
    const s = dialogOverlay().querySelector(
      '.pkc-text-replace-status',
    ) as HTMLElement;
    expect(s.getAttribute('data-pkc-error')).toBe('true');
    expect(applyBtn().disabled).toBe(true);
  });

  it('fires the input event on apply so dirty / preview hooks see the change', () => {
    setup('apple apple apple', { start: 0, end: 11 });
    let inputEvents = 0;
    textarea.addEventListener('input', () => { inputEvents++; });
    openTextReplaceDialog(textarea, root);
    setCheckbox('text-replace-selection', true);
    setInput('text-replace-find', 'apple');
    setInput('text-replace-replace', 'pear');
    applyBtn().click();
    expect(inputEvents).toBeGreaterThanOrEqual(1);
  });
});
