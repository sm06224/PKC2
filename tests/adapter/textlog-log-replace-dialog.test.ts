/**
 * @vitest-environment happy-dom
 *
 * Integration tests for textlog log-replace dialog (S-28).
 *
 * Drives the overlay directly via `openTextlogLogReplaceDialog` and
 * through the action-binder `open-log-replace-dialog` pathway.
 * Verifies the v1 contract:
 *   - current log only
 *   - other logs / id / createdAt / flags / order all invariant
 *   - regex / case / invalid-regex / 0-hit gating
 *   - input event + collectBody integration
 *   - trigger appears only in textlog editing mode
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  openTextlogLogReplaceDialog,
  closeTextlogLogReplaceDialog,
  isTextlogLogReplaceDialogOpen,
} from '@adapter/ui/textlog-log-replace-dialog';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher } from '@adapter/state/dispatcher';
import { render } from '@adapter/ui/renderer';
import { registerPresenter } from '@adapter/ui/detail-presenter';
import { textlogPresenter } from '@adapter/ui/textlog-presenter';
import {
  parseTextlogBody,
  serializeTextlogBody,
} from '@features/textlog/textlog-body';
import type { Container } from '@core/model/container';

registerPresenter('textlog', textlogPresenter);

const T1 = '2026-04-10T10:00:00.000Z';
const T2 = '2026-04-11T10:00:00.000Z';
const T3 = '2026-04-12T10:00:00.000Z';

function makeTextlogContainer(): Container {
  const body = serializeTextlogBody({
    entries: [
      {
        id: 'log-001',
        text: 'Apple apple APPLE',
        createdAt: T1,
        flags: ['important'],
      },
      { id: 'log-002', text: 'banana Banana', createdAt: T2, flags: [] },
      { id: 'log-003', text: 'cherry cherry', createdAt: T3, flags: [] },
    ],
  });
  return {
    meta: {
      container_id: 'c1',
      title: 'T',
      created_at: T1,
      updated_at: T3,
      schema_version: 1,
    },
    entries: [
      {
        lid: 'tl1',
        title: 'Textlog',
        body,
        archetype: 'textlog',
        created_at: T1,
        updated_at: T3,
      },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };
}

let root: HTMLElement;
let cleanup: (() => void) | null = null;

function mount(): {
  dispatcher: ReturnType<typeof createDispatcher>;
} {
  const dispatcher = createDispatcher();
  const container = makeTextlogContainer();
  dispatcher.onState((state) => render(state, root));
  dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });
  render(dispatcher.getState(), root);
  cleanup = bindActions(root, dispatcher);

  // Enter edit mode on the textlog entry so the per-log textareas
  // are rendered.
  dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'tl1' });
  dispatcher.dispatch({ type: 'BEGIN_EDIT', lid: 'tl1' });
  render(dispatcher.getState(), root);

  return { dispatcher };
}

function logTextarea(logId: string): HTMLTextAreaElement {
  const el = root.querySelector<HTMLTextAreaElement>(
    `textarea[data-pkc-field="textlog-entry-text"][data-pkc-log-id="${logId}"]`,
  );
  if (!el) throw new Error(`log textarea not found for ${logId}`);
  return el;
}

function dialog(): HTMLElement {
  const el = root.querySelector<HTMLElement>(
    '[data-pkc-region="textlog-log-replace-dialog"]',
  );
  if (!el) throw new Error('dialog not mounted');
  return el;
}

function setInput(field: string, value: string): void {
  const el = dialog().querySelector<HTMLInputElement>(
    `[data-pkc-field="${field}"]`,
  );
  if (!el) throw new Error(`input not found: ${field}`);
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function setCheckbox(field: string, value: boolean): void {
  const el = dialog().querySelector<HTMLInputElement>(
    `[data-pkc-field="${field}"]`,
  );
  if (!el) throw new Error(`checkbox not found: ${field}`);
  el.checked = value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function statusText(): string {
  return dialog()
    .querySelector('.pkc-text-replace-status')!
    .textContent ?? '';
}

function applyBtn(): HTMLButtonElement {
  return dialog().querySelector<HTMLButtonElement>(
    '[data-pkc-action="textlog-log-replace-apply"]',
  )!;
}

beforeEach(() => {
  closeTextlogLogReplaceDialog();
  document.body.innerHTML = '';
  root = document.createElement('div');
  root.id = 'pkc-root';
  document.body.appendChild(root);
  return () => {
    closeTextlogLogReplaceDialog();
    cleanup?.();
    cleanup = null;
    root.remove();
  };
});

describe('textlog log-replace dialog — v1 behavior', () => {
  it('trigger appears on every log edit row in textlog editing mode', () => {
    mount();
    const triggers = root.querySelectorAll(
      '[data-pkc-action="open-log-replace-dialog"]',
    );
    expect(triggers.length).toBe(3);
    for (const t of Array.from(triggers)) {
      expect(t.getAttribute('data-pkc-log-id')).toMatch(/^log-\d{3}$/);
    }
  });

  it('opens against exactly the log whose trigger was clicked', () => {
    mount();
    const trigger = root.querySelector<HTMLElement>(
      '[data-pkc-action="open-log-replace-dialog"][data-pkc-log-id="log-002"]',
    )!;
    trigger.click();
    expect(isTextlogLogReplaceDialogOpen()).toBe(true);
    // The Find input starts focused inside the dialog.
    const findInput = dialog().querySelector<HTMLInputElement>(
      '[data-pkc-field="textlog-log-replace-find"]',
    )!;
    expect(document.activeElement).toBe(findInput);
  });

  it('performs plain replace only inside the current log', () => {
    mount();
    openTextlogLogReplaceDialog(logTextarea('log-001'), root);
    setInput('textlog-log-replace-find', 'apple');
    setInput('textlog-log-replace-replace', 'pear');
    // Case-insensitive default → 3 hits in "Apple apple APPLE".
    expect(statusText()).toContain('3');
    applyBtn().click();
    expect(logTextarea('log-001').value).toBe('pear pear pear');
    // Other logs are byte-identical.
    expect(logTextarea('log-002').value).toBe('banana Banana');
    expect(logTextarea('log-003').value).toBe('cherry cherry');
  });

  it('respects case-sensitive option inside the current log', () => {
    mount();
    openTextlogLogReplaceDialog(logTextarea('log-001'), root);
    setInput('textlog-log-replace-find', 'apple');
    setCheckbox('textlog-log-replace-case', true);
    // Case-sensitive → only the lowercase "apple" counts.
    expect(statusText()).toContain('1');
    setInput('textlog-log-replace-replace', 'pear');
    applyBtn().click();
    expect(logTextarea('log-001').value).toBe('Apple pear APPLE');
  });

  it('supports regex with back-references bounded to the current log', () => {
    mount();
    // Seed the log with digits so we can exercise back-references.
    const ta = logTextarea('log-002');
    ta.value = 'req-123 req-456';
    ta.dispatchEvent(new Event('input', { bubbles: true }));

    openTextlogLogReplaceDialog(ta, root);
    setCheckbox('textlog-log-replace-regex', true);
    setInput('textlog-log-replace-find', 'req-(\\d+)');
    setInput('textlog-log-replace-replace', 'R-$1');
    applyBtn().click();
    expect(logTextarea('log-002').value).toBe('R-123 R-456');
    // Other logs unchanged.
    expect(logTextarea('log-001').value).toBe('Apple apple APPLE');
    expect(logTextarea('log-003').value).toBe('cherry cherry');
  });

  it('disables Apply and surfaces the error for an invalid regex', () => {
    mount();
    openTextlogLogReplaceDialog(logTextarea('log-001'), root);
    setCheckbox('textlog-log-replace-regex', true);
    setInput('textlog-log-replace-find', '[unclosed');
    const s = dialog().querySelector(
      '.pkc-text-replace-status',
    ) as HTMLElement;
    expect(s.getAttribute('data-pkc-error')).toBe('true');
    expect(applyBtn().disabled).toBe(true);
  });

  it('is a no-op when hit count is zero (Apply stays disabled)', () => {
    mount();
    const ta = logTextarea('log-001');
    const before = ta.value;
    openTextlogLogReplaceDialog(ta, root);
    setInput('textlog-log-replace-find', 'zzz');
    expect(statusText()).toMatch(/no matches in current log/i);
    expect(applyBtn().disabled).toBe(true);
    applyBtn().click(); // defensive click
    expect(ta.value).toBe(before);
  });

  it('preserves log id / createdAt / flags / entries order on commit-edit', () => {
    const { dispatcher } = mount();
    // Run a plain replace on log-001.
    openTextlogLogReplaceDialog(logTextarea('log-001'), root);
    setInput('textlog-log-replace-find', 'apple');
    setInput('textlog-log-replace-replace', 'pear');
    applyBtn().click();
    closeTextlogLogReplaceDialog();

    // Commit the edit — collectBody rebuilds the JSON.
    const commitBtn = root.querySelector<HTMLButtonElement>(
      '[data-pkc-action="commit-edit"]',
    )!;
    commitBtn.click();

    const entry = dispatcher
      .getState()
      .container!.entries.find((e) => e.lid === 'tl1')!;
    const body = parseTextlogBody(entry.body);
    expect(body.entries.length).toBe(3);
    // Array order and id sequence are preserved (ascending by
    // createdAt per collectBody's normalization).
    expect(body.entries.map((e) => e.id)).toEqual([
      'log-001',
      'log-002',
      'log-003',
    ]);
    // Metadata on log-001 is invariant.
    const l1 = body.entries[0]!;
    expect(l1.id).toBe('log-001');
    expect(l1.createdAt).toBe(T1);
    expect(l1.flags).toEqual(['important']);
    // Only the text changed for log-001.
    expect(l1.text).toBe('pear pear pear');
    // Other logs are byte-identical.
    expect(body.entries[1]!.text).toBe('banana Banana');
    expect(body.entries[2]!.text).toBe('cherry cherry');
    expect(body.entries[2]!.flags).toEqual([]);
  });

  it('fires the input event so dirty / preview hooks see the change', () => {
    mount();
    const ta = logTextarea('log-001');
    let inputEvents = 0;
    ta.addEventListener('input', () => { inputEvents++; });

    openTextlogLogReplaceDialog(ta, root);
    setInput('textlog-log-replace-find', 'apple');
    setInput('textlog-log-replace-replace', 'pear');
    applyBtn().click();
    expect(inputEvents).toBeGreaterThanOrEqual(1);
  });

  it('silently ignores a textarea that is not a log textarea', () => {
    mount();
    const fake = document.createElement('textarea');
    fake.setAttribute('data-pkc-field', 'body'); // wrong field
    fake.setAttribute('data-pkc-log-id', 'log-001');
    root.appendChild(fake);
    openTextlogLogReplaceDialog(fake, root);
    expect(isTextlogLogReplaceDialogOpen()).toBe(false);
  });

  it('silently ignores a log textarea missing data-pkc-log-id', () => {
    mount();
    const ta = logTextarea('log-001');
    ta.removeAttribute('data-pkc-log-id');
    openTextlogLogReplaceDialog(ta, root);
    expect(isTextlogLogReplaceDialogOpen()).toBe(false);
  });

  it('closes on Escape without bubbling to global handlers', () => {
    mount();
    let globalEscape = 0;
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') globalEscape++;
    });
    openTextlogLogReplaceDialog(logTextarea('log-001'), root);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(isTextlogLogReplaceDialogOpen()).toBe(false);
    // Capture-phase stopPropagation keeps the bubble listener from
    // seeing Escape (important because edit-mode Escape would cancel).
    expect(globalEscape).toBe(0);
  });

  it('does not render triggers or accept opens in readonly mode', () => {
    const dispatcher = createDispatcher();
    const container = makeTextlogContainer();
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({
      type: 'SYS_INIT_COMPLETE',
      container,
      readonly: true,
    });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'tl1' });
    render(dispatcher.getState(), root);

    // In readonly, BEGIN_EDIT is a no-op and the editor (with
    // per-log textareas + triggers) is never rendered.
    const triggers = root.querySelectorAll(
      '[data-pkc-action="open-log-replace-dialog"]',
    );
    expect(triggers.length).toBe(0);
  });
});
