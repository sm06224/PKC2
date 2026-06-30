/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderContextMenu } from '@adapter/ui/renderer';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher } from '@adapter/state/dispatcher';
import { render } from '@adapter/ui/renderer';
import type { Container } from '@core/model/container';

/**
 * #869(B): TEXT entry の「末尾に追記」context-menu ショートカット。常時表示の
 * 追記 box(= 主要な inline 入力面)は据置き、menu からその textarea へ focus
 * する導線だけを追加(box 撤去は autocomplete/slash/paste/章編集を壊すため見送り)。
 */

const T = '2026-06-30T00:00:00Z';

function makeContainer(): Container {
  return {
    meta: { container_id: 'c', title: 'T', created_at: T, updated_at: T, schema_version: 1 },
    entries: [
      { lid: 'L1', title: 'Doc', body: '# h\nbody', archetype: 'text', created_at: T, updated_at: T },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };
}

describe('#869(B) renderContextMenu「末尾に追記」item', () => {
  it('TEXT entry には ctx-append-text item が出る', () => {
    const menu = renderContextMenu('L1', 0, 0, { archetype: 'text', canEdit: true });
    const item = menu.querySelector('[data-pkc-action="ctx-append-text"]');
    expect(item).not.toBeNull();
    expect(item!.getAttribute('data-pkc-lid')).toBe('L1');
    expect(item!.textContent).toContain('末尾に追記');
  });

  it('text 以外(textlog / attachment / folder)には出ない', () => {
    for (const archetype of ['textlog', 'attachment', 'todo', 'form', 'folder']) {
      const menu = renderContextMenu('L1', 0, 0, { archetype, canEdit: true });
      expect(menu.querySelector('[data-pkc-action="ctx-append-text"]'), archetype).toBeNull();
    }
  });

  it('canEdit=false(readonly)では出ない', () => {
    const menu = renderContextMenu('L1', 0, 0, { archetype: 'text', canEdit: false });
    expect(menu.querySelector('[data-pkc-action="ctx-append-text"]')).toBeNull();
  });
});

describe('#869(B) ctx-append-text click → 追記欄 focus', () => {
  let root: HTMLElement;
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    root = document.createElement('div');
    document.body.appendChild(root);
  });
  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    root.remove();
  });

  it('click で対象 entry を選択し、追記 textarea に focus する', () => {
    const dispatcher = createDispatcher();
    dispatcher.onState((s) => render(s, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);

    // Simulate a context-menu item click (carries action + lid).
    const btn = document.createElement('button');
    btn.setAttribute('data-pkc-action', 'ctx-append-text');
    btn.setAttribute('data-pkc-lid', 'L1');
    root.appendChild(btn);
    btn.click();

    expect(dispatcher.getState().selectedLid).toBe('L1');
    const ta = root.querySelector<HTMLTextAreaElement>(
      '[data-pkc-field="text-append-text"][data-pkc-lid="L1"]',
    );
    expect(ta).not.toBeNull();
    expect(document.activeElement).toBe(ta);
  });

  it('lid が無ければ no-op(選択を変えない)', () => {
    const dispatcher = createDispatcher();
    dispatcher.onState((s) => render(s, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);

    const btn = document.createElement('button');
    btn.setAttribute('data-pkc-action', 'ctx-append-text');
    root.appendChild(btn);
    btn.click();
    expect(dispatcher.getState().selectedLid).toBeNull();
  });
});
