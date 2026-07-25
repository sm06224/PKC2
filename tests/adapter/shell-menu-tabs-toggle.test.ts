/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@adapter/ui/renderer';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher } from '@adapter/state/dispatcher';
import { setContainerFlagSource } from '@adapter/flags';
import type { Container } from '@core/model/container';

/**
 * #938 R10 — タブ機能の設定メニュー昇格 + shortcut help の発見可能性。
 *
 * `shell.tabs_enabled` は Flags Inspector の奥でしか切替えられず発見
 * 不能だった(refinement-research §5)。shell menu(⚙ Settings)に
 * Off/On segmented control を常設し、`set-bool-flag` 汎用 action で
 * SET_FLAG dispatch → container `__flags__` に永続化する。
 */

const T = '2026-07-01T00:00:00.000Z';

function fixture(): Container {
  return {
    meta: { container_id: 'menu', title: 't', created_at: T, updated_at: T, schema_version: 1 },
    entries: [
      { lid: 'e1', title: 'One', archetype: 'text', body: 'x', created_at: T, updated_at: T },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };
}

let root: HTMLElement;
let unbind: (() => void) | undefined;

beforeEach(() => {
  setContainerFlagSource({});
  root = document.createElement('div');
  root.id = 'pkc-root';
  document.body.appendChild(root);
  return () => {
    unbind?.();
    unbind = undefined;
    root.remove();
    setContainerFlagSource({});
  };
});

function boot() {
  const dispatcher = createDispatcher();
  dispatcher.onState((s) => render(s, root));
  // main.ts と同じ FLAGS_CHANGED → flag registry 同期 + 再 render。
  // (dispatcher は state listener を event より先に呼ぶため、SET_FLAG の
  //  直後 render は旧 flag 値 — event 後に再 render して反映する)
  dispatcher.onEvent((event) => {
    if (event.type === 'FLAGS_CHANGED') {
      setContainerFlagSource(event.flags.values);
      render(dispatcher.getState(), root);
    }
  });
  dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: fixture() });
  render(dispatcher.getState(), root);
  unbind = bindActions(root, dispatcher);
  return dispatcher;
}

describe('shell menu Tabs トグル(#938 R10)', () => {
  it('menu に Tabs section が出て、既定 OFF がアクティブ表示', () => {
    const d = boot();
    d.dispatch({ type: 'TOGGLE_MENU' });
    const menu = root.querySelector('[data-pkc-region="shell-menu"]')!;
    expect(menu).not.toBeNull();
    const off = menu.querySelector<HTMLElement>(
      '[data-pkc-action="set-bool-flag"][data-pkc-flag-key="shell.tabs_enabled"][data-pkc-flag-value="false"]',
    )!;
    const on = menu.querySelector<HTMLElement>(
      '[data-pkc-action="set-bool-flag"][data-pkc-flag-key="shell.tabs_enabled"][data-pkc-flag-value="true"]',
    )!;
    expect(off.getAttribute('data-pkc-active')).toBe('true');
    expect(on.getAttribute('data-pkc-active')).toBe('false');
  });

  it('On click → SET_FLAG が __flags__ に永続化され、tab strip が描画される', () => {
    const d = boot();
    d.dispatch({ type: 'TOGGLE_MENU' });
    root
      .querySelector<HTMLElement>(
        '[data-pkc-action="set-bool-flag"][data-pkc-flag-key="shell.tabs_enabled"][data-pkc-flag-value="true"]',
      )!
      .click();

    // __flags__ entry に値が入る
    const flagsEntry = d
      .getState()
      .container!.entries.find((e) => e.lid === '__flags__');
    expect(flagsEntry).toBeTruthy();
    expect(JSON.parse(flagsEntry!.body).values['shell.tabs_enabled']).toBe(true);
    // menu の active 表示が On に移る
    const on = root.querySelector<HTMLElement>(
      '[data-pkc-action="set-bool-flag"][data-pkc-flag-key="shell.tabs_enabled"][data-pkc-flag-value="true"]',
    )!;
    expect(on.getAttribute('data-pkc-active')).toBe('true');
    // tab strip region が center に出る(flag ON の描画ゲート)
    expect(root.querySelector('[data-pkc-region="tab-strip"]')).not.toBeNull();
  });

  it('Off click で解除できる(往復)', () => {
    const d = boot();
    d.dispatch({ type: 'TOGGLE_MENU' });
    const onSel =
      '[data-pkc-action="set-bool-flag"][data-pkc-flag-key="shell.tabs_enabled"][data-pkc-flag-value="true"]';
    const offSel =
      '[data-pkc-action="set-bool-flag"][data-pkc-flag-key="shell.tabs_enabled"][data-pkc-flag-value="false"]';
    root.querySelector<HTMLElement>(onSel)!.click();
    expect(root.querySelector('[data-pkc-region="tab-strip"]')).not.toBeNull();
    root.querySelector<HTMLElement>(offSel)!.click();
    const flagsEntry = d
      .getState()
      .container!.entries.find((e) => e.lid === '__flags__');
    expect(JSON.parse(flagsEntry!.body).values['shell.tabs_enabled']).toBe(false);
    expect(root.querySelector('[data-pkc-region="tab-strip"]')).toBeNull();
  });
});

describe('shortcut help の Views & Tabs 群(#938 R10)', () => {
  it('Alt+1〜4/6 / tab chord が help に掲載される', () => {
    const d = boot();
    d.dispatch({ type: 'OPEN_SHORTCUT_HELP' });
    const help = root.querySelector('[data-pkc-region="shortcut-help"]')!;
    expect(help).not.toBeNull();
    expect(help.textContent).toContain('Views & Tabs');
    // Alt+5(graph)は廃止済で欠番。help は実際に動くキーだけを案内する
    // (視覚監査 2026-07-25 ── 動かないキーの案内は user への誤情報)。
    expect(help.textContent).toContain('Alt+1 〜 Alt+4 / Alt+6');
    expect(help.textContent).not.toContain('Graph');
    expect(help.textContent).toContain('Ctrl+Shift+T');
  });
});
