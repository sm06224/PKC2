/**
 * @vitest-environment happy-dom
 *
 * Slice 4: TEXTLOG → TEXT conversion action-binder tests.
 *
 * These exercises drive the full user flow (begin selection →
 * toggle checkboxes → open preview → confirm / cancel) through
 * the real dispatcher + renderer + action-binder, so the
 * presenter's render contract and the action-binder's dispatch
 * logic are both under test.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher as _createRawDispatcher } from '@adapter/state/dispatcher';
import { render } from '@adapter/ui/renderer';
import { registerPresenter } from '@adapter/ui/detail-presenter';
import { textlogPresenter } from '@adapter/ui/textlog-presenter';
import { __resetSelectionStateForTest } from '@adapter/ui/textlog-selection';
import { closeTextlogPreviewModal } from '@adapter/ui/textlog-preview-modal';
import { serializeTextlogBody } from '@features/textlog/textlog-body';
import type { Container } from '@core/model/container';

registerPresenter('textlog', textlogPresenter);

const baseContainer: Container = {
  meta: {
    container_id: 'test-id',
    title: 'Test',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    schema_version: 1,
  },
  entries: [
    {
      lid: 'tl1',
      title: 'Work Log',
      body: serializeTextlogBody({
        entries: [
          { id: 'a', text: 'alpha entry', createdAt: '2026-04-09T10:00:00', flags: [] },
          { id: 'b', text: 'beta entry',  createdAt: '2026-04-09T11:00:00', flags: [] },
          { id: 'c', text: 'gamma entry', createdAt: '2026-04-10T09:00:00', flags: [] },
        ],
      }),
      archetype: 'textlog',
      created_at: '2026-04-09T00:00:00Z',
      updated_at: '2026-04-09T00:00:00Z',
    },
  ],
  relations: [],
  revisions: [],
  assets: {},
};

const _trackedUnsubs: (() => void)[] = [];
function createDispatcher() {
  const d = _createRawDispatcher();
  return {
    ...d,
    onState(listener: Parameters<typeof d.onState>[0]) {
      const unsub = d.onState(listener);
      _trackedUnsubs.push(unsub);
      return unsub;
    },
    onEvent(listener: Parameters<typeof d.onEvent>[0]) {
      const unsub = d.onEvent(listener);
      _trackedUnsubs.push(unsub);
      return unsub;
    },
  };
}

let root: HTMLElement;
let cleanup: (() => void) | undefined;

function bootstrap() {
  const dispatcher = createDispatcher();
  dispatcher.onState((state) => render(state, root));
  dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: baseContainer });
  render(dispatcher.getState(), root);
  cleanup = bindActions(root, dispatcher);
  dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'tl1' });
  render(dispatcher.getState(), root);
  return { dispatcher };
}

beforeEach(() => {
  root = document.createElement('div');
  root.id = 'pkc-root';
  document.body.appendChild(root);
  __resetSelectionStateForTest();
  closeTextlogPreviewModal();
  return () => {
    cleanup?.();
    cleanup = undefined;
    for (const fn of _trackedUnsubs) fn();
    _trackedUnsubs.length = 0;
    root.remove();
    __resetSelectionStateForTest();
    closeTextlogPreviewModal();
  };
});

function click(el: Element) {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}

describe('ActionBinder — TEXTLOG → TEXT selection mode', () => {
  it('Begin selection button enters selection mode and reveals checkboxes on each log', () => {
    bootstrap();
    // Before clicking Begin: no checkbox on any log article.
    expect(root.querySelector('input[data-pkc-field="textlog-select"]')).toBeNull();

    const beginBtn = root.querySelector<HTMLElement>('[data-pkc-action="begin-textlog-selection"]');
    expect(beginBtn).not.toBeNull();
    click(beginBtn!);

    // Now each log should have a selection checkbox.
    const checks = root.querySelectorAll('input[data-pkc-field="textlog-select"]');
    expect(checks.length).toBe(3);

    // Container carries the selecting data-attr.
    const view = root.querySelector<HTMLElement>('.pkc-textlog-view[data-pkc-textlog-selecting="true"]');
    expect(view).not.toBeNull();
  });

  it('clicking a log checkbox updates the selection count label', () => {
    const { dispatcher } = bootstrap();
    void dispatcher;
    click(root.querySelector<HTMLElement>('[data-pkc-action="begin-textlog-selection"]')!);

    const checkA = root.querySelector<HTMLInputElement>(
      'input[data-pkc-field="textlog-select"][data-pkc-log-id="a"]',
    );
    expect(checkA).not.toBeNull();
    checkA!.checked = true;
    checkA!.dispatchEvent(new Event('change', { bubbles: true }));

    const count = root.querySelector('[data-pkc-region="textlog-select-count"]');
    expect(count?.textContent).toContain('1');
  });

  it('Convert to TEXT button is disabled when zero logs are selected', () => {
    bootstrap();
    click(root.querySelector<HTMLElement>('[data-pkc-action="begin-textlog-selection"]')!);
    const convertBtn = root.querySelector<HTMLElement>('[data-pkc-action="open-textlog-to-text-preview"]');
    expect(convertBtn).not.toBeNull();
    expect(convertBtn!.hasAttribute('disabled')).toBe(true);
  });

  it('Convert to TEXT opens the preview modal with the generated body', () => {
    bootstrap();
    click(root.querySelector<HTMLElement>('[data-pkc-action="begin-textlog-selection"]')!);
    // Select two logs.
    for (const id of ['a', 'b']) {
      const ck = root.querySelector<HTMLInputElement>(
        `input[data-pkc-field="textlog-select"][data-pkc-log-id="${id}"]`,
      );
      ck!.checked = true;
      ck!.dispatchEvent(new Event('change', { bubbles: true }));
    }
    click(root.querySelector<HTMLElement>('[data-pkc-action="open-textlog-to-text-preview"]')!);

    const overlay = root.querySelector('[data-pkc-region="textlog-preview-overlay"]');
    expect(overlay).not.toBeNull();
    const bodyPre = root.querySelector<HTMLElement>('[data-pkc-field="textlog-preview-body"]');
    expect(bodyPre?.textContent).toContain('alpha entry');
    expect(bodyPre?.textContent).toContain('beta entry');
    expect(bodyPre?.textContent).not.toContain('gamma entry');
  });

  it('Cancel in the preview modal closes the modal but keeps the selection', () => {
    bootstrap();
    click(root.querySelector<HTMLElement>('[data-pkc-action="begin-textlog-selection"]')!);
    const ck = root.querySelector<HTMLInputElement>(
      'input[data-pkc-field="textlog-select"][data-pkc-log-id="a"]',
    );
    ck!.checked = true;
    ck!.dispatchEvent(new Event('change', { bubbles: true }));
    click(root.querySelector<HTMLElement>('[data-pkc-action="open-textlog-to-text-preview"]')!);

    expect(root.querySelector('[data-pkc-region="textlog-preview-overlay"]')).not.toBeNull();
    click(root.querySelector<HTMLElement>('[data-pkc-action="cancel-textlog-to-text"]')!);
    expect(root.querySelector('[data-pkc-region="textlog-preview-overlay"]')).toBeNull();

    // Selection mode still active; checkbox remains checked.
    const ckAgain = root.querySelector<HTMLInputElement>(
      'input[data-pkc-field="textlog-select"][data-pkc-log-id="a"]',
    );
    expect(ckAgain?.checked).toBe(true);
  });

  it('Confirm creates a new TEXT entry whose body is the generated markdown', () => {
    const { dispatcher } = bootstrap();
    const initialCount = dispatcher.getState().container!.entries.length;

    click(root.querySelector<HTMLElement>('[data-pkc-action="begin-textlog-selection"]')!);
    for (const id of ['a', 'b']) {
      const ck = root.querySelector<HTMLInputElement>(
        `input[data-pkc-field="textlog-select"][data-pkc-log-id="${id}"]`,
      );
      ck!.checked = true;
      ck!.dispatchEvent(new Event('change', { bubbles: true }));
    }
    click(root.querySelector<HTMLElement>('[data-pkc-action="open-textlog-to-text-preview"]')!);
    click(root.querySelector<HTMLElement>('[data-pkc-action="confirm-textlog-to-text"]')!);

    const state = dispatcher.getState();
    const entries = state.container!.entries;
    expect(entries.length).toBe(initialCount + 1);
    const newEntry = entries[entries.length - 1]!;
    expect(newEntry.archetype).toBe('text');
    // Title from pure function: `<src title> — log extract <date>`.
    expect(newEntry.title).toMatch(/Work Log — log extract \d{4}-\d{2}-\d{2}/);
    // Body contains both selected logs' text and a backlink.
    expect(newEntry.body).toContain('alpha entry');
    expect(newEntry.body).toContain('beta entry');
    expect(newEntry.body).toContain(`entry:tl1#log/a`);

    // Source TEXTLOG is not mutated.
    const src = entries.find((e) => e.lid === 'tl1')!;
    expect(src.body).toBe(baseContainer.entries[0]!.body);
  });

  it('Cancel selection button exits the mode and removes checkboxes', () => {
    bootstrap();
    click(root.querySelector<HTMLElement>('[data-pkc-action="begin-textlog-selection"]')!);
    expect(root.querySelectorAll('input[data-pkc-field="textlog-select"]').length).toBe(3);
    click(root.querySelector<HTMLElement>('[data-pkc-action="cancel-textlog-selection"]')!);
    expect(root.querySelectorAll('input[data-pkc-field="textlog-select"]').length).toBe(0);
    expect(
      root.querySelector('.pkc-textlog-view[data-pkc-textlog-selecting="true"]'),
    ).toBeNull();
  });

  it('Esc in selection mode exits the mode', () => {
    bootstrap();
    click(root.querySelector<HTMLElement>('[data-pkc-action="begin-textlog-selection"]')!);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(
      root.querySelector('.pkc-textlog-view[data-pkc-textlog-selecting="true"]'),
    ).toBeNull();
  });

  it('Esc first closes the preview modal, leaving selection mode intact', () => {
    bootstrap();
    click(root.querySelector<HTMLElement>('[data-pkc-action="begin-textlog-selection"]')!);
    const ck = root.querySelector<HTMLInputElement>(
      'input[data-pkc-field="textlog-select"][data-pkc-log-id="a"]',
    );
    ck!.checked = true;
    ck!.dispatchEvent(new Event('change', { bubbles: true }));
    click(root.querySelector<HTMLElement>('[data-pkc-action="open-textlog-to-text-preview"]')!);
    expect(root.querySelector('[data-pkc-region="textlog-preview-overlay"]')).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(root.querySelector('[data-pkc-region="textlog-preview-overlay"]')).toBeNull();
    // Still in selection mode.
    expect(
      root.querySelector('.pkc-textlog-view[data-pkc-textlog-selecting="true"]'),
    ).not.toBeNull();
  });

  it('plain viewer without selection mode has no checkboxes (regression guard)', () => {
    bootstrap();
    expect(root.querySelectorAll('input[data-pkc-field="textlog-select"]').length).toBe(0);
    // Append area, flag buttons, and anchor buttons remain unaffected.
    expect(root.querySelector('.pkc-textlog-append')).not.toBeNull();
    expect(root.querySelectorAll('.pkc-textlog-flag-btn').length).toBeGreaterThan(0);
  });

  it('dblclick on a log article in selection mode does NOT enter edit mode', () => {
    const { dispatcher } = bootstrap();
    click(root.querySelector<HTMLElement>('[data-pkc-action="begin-textlog-selection"]')!);
    const article = root.querySelector<HTMLElement>('.pkc-textlog-log[data-pkc-log-id="a"]');
    expect(article).not.toBeNull();
    article!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    // Should not have transitioned to editing phase.
    expect(dispatcher.getState().phase).not.toBe('editing');
  });

  it('Convert button with zero selection does not open the modal', () => {
    bootstrap();
    click(root.querySelector<HTMLElement>('[data-pkc-action="begin-textlog-selection"]')!);
    const convertBtn = root.querySelector<HTMLElement>('[data-pkc-action="open-textlog-to-text-preview"]');
    click(convertBtn!);
    expect(root.querySelector('[data-pkc-region="textlog-preview-overlay"]')).toBeNull();
  });
});
