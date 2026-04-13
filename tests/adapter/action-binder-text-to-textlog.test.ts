/**
 * @vitest-environment happy-dom
 *
 * Slice 5: TEXT → TEXTLOG conversion action-binder tests.
 *
 * Drives the user flow (open preview → flip mode → confirm / cancel)
 * through the real dispatcher + renderer + action-binder, so the
 * renderer's trigger placement and the action-binder's dispatch logic
 * are both under test.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher as _createRawDispatcher } from '@adapter/state/dispatcher';
import { render } from '@adapter/ui/renderer';
import { closeTextToTextlogModal } from '@adapter/ui/text-to-textlog-modal';
import { parseTextlogBody } from '@features/textlog/textlog-body';
import type { Container } from '@core/model/container';

const baseContainer: Container = {
  meta: {
    container_id: 'test-id',
    title: 'Test',
    created_at: '2026-04-13T00:00:00Z',
    updated_at: '2026-04-13T00:00:00Z',
    schema_version: 1,
  },
  entries: [
    {
      lid: 'txt1',
      title: 'My Doc',
      body: [
        'prelude line',
        '',
        '# Chapter 1',
        'alpha body',
        '',
        '# Chapter 2',
        'beta body',
      ].join('\n'),
      archetype: 'text',
      created_at: '2026-04-13T00:00:00Z',
      updated_at: '2026-04-13T00:00:00Z',
    },
    {
      lid: 'txt2',
      title: 'HR Doc',
      body: ['one', '', '---', '', 'two', '---', 'three'].join('\n'),
      archetype: 'text',
      created_at: '2026-04-13T00:00:00Z',
      updated_at: '2026-04-13T00:00:00Z',
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

function bootstrap(selectLid = 'txt1') {
  const dispatcher = createDispatcher();
  dispatcher.onState((state) => render(state, root));
  dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: baseContainer });
  render(dispatcher.getState(), root);
  cleanup = bindActions(root, dispatcher);
  dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: selectLid });
  render(dispatcher.getState(), root);
  return { dispatcher };
}

beforeEach(() => {
  root = document.createElement('div');
  root.id = 'pkc-root';
  document.body.appendChild(root);
  closeTextToTextlogModal();
  return () => {
    cleanup?.();
    cleanup = undefined;
    for (const fn of _trackedUnsubs) fn();
    _trackedUnsubs.length = 0;
    root.remove();
    closeTextToTextlogModal();
  };
});

function click(el: Element) {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}

describe('ActionBinder — TEXT → TEXTLOG conversion', () => {
  it('TEXT viewer exposes the `→ TEXTLOG` button', () => {
    bootstrap();
    const btn = root.querySelector<HTMLElement>('[data-pkc-action="open-text-to-textlog-preview"]');
    expect(btn).not.toBeNull();
    expect(btn!.getAttribute('data-pkc-lid')).toBe('txt1');
  });

  it('clicking the trigger opens the preview modal with heading-split log list', () => {
    bootstrap();
    click(root.querySelector<HTMLElement>('[data-pkc-action="open-text-to-textlog-preview"]')!);
    const overlay = root.querySelector('[data-pkc-region="text-to-textlog-overlay"]');
    expect(overlay).not.toBeNull();

    const list = root.querySelector<HTMLElement>('[data-pkc-region="text-to-textlog-list"]');
    // meta (1) + prelude (1) + Chapter 1 (1) + Chapter 2 (1) = 4 items
    expect(list?.children.length).toBe(4);

    const summary = root.querySelector('[data-pkc-region="text-to-textlog-summary"]');
    expect(summary?.textContent).toContain('3 logs');
    expect(summary?.textContent).toContain('heading');
  });

  it('flipping the mode radio to `hr` re-renders the preview', () => {
    bootstrap('txt2');
    click(root.querySelector<HTMLElement>('[data-pkc-action="open-text-to-textlog-preview"]')!);

    // The default mode is heading — HR Doc has no headings, so one
    // content log + meta log.
    let list = root.querySelector<HTMLElement>('[data-pkc-region="text-to-textlog-list"]');
    expect(list?.children.length).toBe(2);

    const hrRadio = root.querySelector<HTMLInputElement>(
      'input[data-pkc-field="text-to-textlog-mode"][data-pkc-mode="hr"]',
    );
    expect(hrRadio).not.toBeNull();
    hrRadio!.checked = true;
    hrRadio!.dispatchEvent(new Event('change', { bubbles: true }));

    list = root.querySelector<HTMLElement>('[data-pkc-region="text-to-textlog-list"]');
    // meta + 3 hr-split logs
    expect(list?.children.length).toBe(4);
    const summary = root.querySelector('[data-pkc-region="text-to-textlog-summary"]');
    expect(summary?.textContent).toContain('3 logs');
    expect(summary?.textContent).toContain('hr');
  });

  it('Cancel in the modal closes the modal without touching the container', () => {
    const { dispatcher } = bootstrap();
    const before = dispatcher.getState().container!.entries.length;
    click(root.querySelector<HTMLElement>('[data-pkc-action="open-text-to-textlog-preview"]')!);
    click(root.querySelector<HTMLElement>('[data-pkc-action="cancel-text-to-textlog"]')!);
    expect(root.querySelector('[data-pkc-region="text-to-textlog-overlay"]')).toBeNull();
    expect(dispatcher.getState().container!.entries.length).toBe(before);
  });

  it('Confirm creates a new TEXTLOG entry with expected body + title', () => {
    const { dispatcher } = bootstrap();
    const initialCount = dispatcher.getState().container!.entries.length;
    const srcBody = baseContainer.entries[0]!.body;

    click(root.querySelector<HTMLElement>('[data-pkc-action="open-text-to-textlog-preview"]')!);
    click(root.querySelector<HTMLElement>('[data-pkc-action="confirm-text-to-textlog"]')!);

    const state = dispatcher.getState();
    const entries = state.container!.entries;
    expect(entries.length).toBe(initialCount + 1);
    const created = entries[entries.length - 1]!;
    expect(created.archetype).toBe('textlog');
    expect(created.title).toMatch(/My Doc — log import \d{4}-\d{2}-\d{2}/);

    const parsed = parseTextlogBody(created.body);
    // meta + 3 segments (prelude, Chapter 1, Chapter 2)
    expect(parsed.entries.length).toBe(4);
    expect(parsed.entries[0]!.text).toContain('Source TEXT: [My Doc](entry:txt1)');
    expect(parsed.entries[1]!.text).toBe('prelude line');
    expect(parsed.entries[2]!.text).toBe('# Chapter 1\nalpha body');
    expect(parsed.entries[3]!.text).toBe('# Chapter 2\nbeta body');

    // Source TEXT is not mutated.
    const src = entries.find((e) => e.lid === 'txt1')!;
    expect(src.body).toBe(srcBody);
    expect(src.archetype).toBe('text');
  });

  it('Esc first closes the modal without committing', () => {
    const { dispatcher } = bootstrap();
    const before = dispatcher.getState().container!.entries.length;
    click(root.querySelector<HTMLElement>('[data-pkc-action="open-text-to-textlog-preview"]')!);
    expect(root.querySelector('[data-pkc-region="text-to-textlog-overlay"]')).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(root.querySelector('[data-pkc-region="text-to-textlog-overlay"]')).toBeNull();
    expect(dispatcher.getState().container!.entries.length).toBe(before);
  });

  it('user-edited title is honored on commit', () => {
    const { dispatcher } = bootstrap();
    click(root.querySelector<HTMLElement>('[data-pkc-action="open-text-to-textlog-preview"]')!);
    const titleInput = root.querySelector<HTMLInputElement>(
      '[data-pkc-field="text-to-textlog-title"]',
    );
    titleInput!.value = 'Manually renamed log';
    click(root.querySelector<HTMLElement>('[data-pkc-action="confirm-text-to-textlog"]')!);

    const entries = dispatcher.getState().container!.entries;
    const created = entries[entries.length - 1]!;
    expect(created.title).toBe('Manually renamed log');
  });

  it('non-TEXT entries have no `→ TEXTLOG` trigger (regression guard)', () => {
    const tlContainer: Container = {
      ...baseContainer,
      entries: [
        {
          lid: 'tl1',
          title: 'A log',
          body: JSON.stringify({ entries: [] }),
          archetype: 'textlog',
          created_at: '2026-04-13T00:00:00Z',
          updated_at: '2026-04-13T00:00:00Z',
        },
      ],
    };
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: tlContainer });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'tl1' });
    render(dispatcher.getState(), root);
    expect(
      root.querySelector('[data-pkc-action="open-text-to-textlog-preview"]'),
    ).toBeNull();
  });
});
