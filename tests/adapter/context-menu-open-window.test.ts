/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderContextMenu } from '@adapter/ui/renderer';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher } from '@adapter/state/dispatcher';
import type { Container } from '@core/model/container';

/**
 * γ-A5-6(user 報告「メインウィンドウで別窓を開く動線が不足」):
 * context menu の「🪟 別ウィンドウで開く」item と、その click で
 * entry-window が開く end-to-end を検証する。
 */

const T = '2026-05-22T00:00:00Z';

function makeContainer(): Container {
  return {
    meta: {
      container_id: 'c',
      title: 'T',
      created_at: T,
      updated_at: T,
      schema_version: 1,
    },
    entries: [
      {
        lid: 'L1',
        title: 'Entry 1',
        body: '# h\nbody',
        archetype: 'text',
        created_at: T,
        updated_at: T,
      },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };
}

describe('γ-A5-6 context menu「別ウィンドウで開く」item', () => {
  it('renderContextMenu に ctx-open-window item がある', () => {
    const menu = renderContextMenu('L1', 10, 10, { archetype: 'text', canEdit: true });
    expect(
      menu.querySelector('[data-pkc-action="ctx-open-window"]'),
    ).not.toBeNull();
  });

  it('ctx-open-window は全 archetype で表示される', () => {
    for (const archetype of [
      'text',
      'textlog',
      'todo',
      'form',
      'attachment',
      'folder',
    ]) {
      const menu = renderContextMenu('L1', 0, 0, { archetype, canEdit: true });
      expect(
        menu.querySelector('[data-pkc-action="ctx-open-window"]'),
        archetype,
      ).not.toBeNull();
    }
  });

  it('ctx-open-window は canEdit=false(readonly)でも表示される', () => {
    const menu = renderContextMenu('L1', 0, 0, { archetype: 'text', canEdit: false });
    expect(
      menu.querySelector('[data-pkc-action="ctx-open-window"]'),
    ).not.toBeNull();
  });

  it('item の label / lid が正しい', () => {
    const menu = renderContextMenu('L1', 0, 0, { archetype: 'text' });
    const btn = menu.querySelector('[data-pkc-action="ctx-open-window"]')!;
    expect(btn.textContent).toContain('別ウィンドウで開く');
    expect(btn.getAttribute('data-pkc-lid')).toBe('L1');
  });
});

describe('γ-A5-6 ctx-open-window click → entry-window', () => {
  let root: HTMLElement;
  let cleanup: (() => void) | undefined;

  function spyOpen() {
    return vi.spyOn(window, 'open').mockReturnValue({
      closed: false,
      focus: vi.fn(),
      document: { open: vi.fn(), write: vi.fn(), close: vi.fn() },
      postMessage: vi.fn(),
    } as unknown as Window);
  }

  function clickAction(action: string, lid?: string): void {
    const btn = document.createElement('button');
    btn.setAttribute('data-pkc-action', action);
    if (lid) btn.setAttribute('data-pkc-lid', lid);
    root.appendChild(btn);
    btn.click();
  }

  beforeEach(() => {
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    root.remove();
    vi.restoreAllMocks();
  });

  it('ctx-open-window click で entry-window(window.open)が開く', () => {
    const openSpy = spyOpen();
    const dispatcher = createDispatcher();
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    cleanup = bindActions(root, dispatcher);
    clickAction('ctx-open-window', 'L1');
    expect(openSpy).toHaveBeenCalled();
  });

  it('ctx-open-window click は対象 entry を SELECT する', () => {
    spyOpen();
    const dispatcher = createDispatcher();
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    cleanup = bindActions(root, dispatcher);
    clickAction('ctx-open-window', 'L1');
    expect(dispatcher.getState().selectedLid).toBe('L1');
  });

  it('lid が無ければ no-op(window.open を呼ばない)', () => {
    const openSpy = spyOpen();
    const dispatcher = createDispatcher();
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    cleanup = bindActions(root, dispatcher);
    clickAction('ctx-open-window');
    expect(openSpy).not.toHaveBeenCalled();
  });
});
