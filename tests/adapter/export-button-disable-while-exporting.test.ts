/**
 * @vitest-environment happy-dom
 *
 * pgc-209(pgc-205 probe finding):
 * Export 中(phase='exporting')でも shell menu の Data section を visible に
 * 保ち、全 action button を disable する。これにより:
 *   - user に視覚的な「Exporting…」 feedback を与える(label 末尾に表示)
 *   - rapid click による sequential 多重 export(50-100ms 後 SYS_FINISH_EXPORT
 *     → phase='ready' → re-mount → 次 click 受理 経路)を browser-level で抑止
 *
 * pgc-205 までは phase='exporting' で Data section 全体を hide していたため
 * race window が開いていた。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { __resetRegistry, __resetUrlCache } from '@adapter/flags';
import { render } from '@adapter/ui/renderer';
import { createDispatcher } from '@adapter/state/dispatcher';
import type { Container } from '@core/model/container';

const TS = '2026-01-01T00:00:00Z';

function emptyContainer(): Container {
  return {
    meta: { container_id: 't', title: 'T', created_at: TS, updated_at: TS, schema_version: 1 },
    entries: [],
    relations: [],
    revisions: [],
    assets: {},
  };
}

function setFlag(value: boolean): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('pkc-flag');
  if (value) {
    url.searchParams.set('pkc-flag', 'shell.data_in_shell_menu_enabled=1');
  }
  window.history.replaceState({}, '', url.toString());
  __resetUrlCache();
}

describe('pgc-209 export button disable during exporting', () => {
  let root: HTMLElement;

  beforeEach(() => {
    __resetRegistry();
    __resetUrlCache();
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  afterEach(() => {
    setFlag(false);
  });

  it('case 1: phase=ready で Data section visible + Export button enabled', () => {
    setFlag(true);
    const dispatcher = createDispatcher();
    dispatcher.onState((s) => render(s, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: emptyContainer() });
    dispatcher.dispatch({ type: 'TOGGLE_MENU' });

    const section = root.querySelector('[data-pkc-region="shell-menu-data"]');
    expect(section).not.toBeNull();
    const label = section!.querySelector('.pkc-shell-menu-label');
    expect(label?.textContent).toBe('Data');
    const exportBtn = section!.querySelector<HTMLButtonElement>(
      'button[data-pkc-action="begin-export"][data-pkc-export-mode="full"]',
    );
    expect(exportBtn).not.toBeNull();
    expect(exportBtn!.disabled).toBe(false);
  });

  it('case 2: phase=exporting でも Data section visible(従来は hide)', () => {
    setFlag(true);
    const dispatcher = createDispatcher();
    dispatcher.onState((s) => render(s, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: emptyContainer() });
    dispatcher.dispatch({ type: 'TOGGLE_MENU' });
    dispatcher.dispatch({ type: 'BEGIN_EXPORT', mode: 'full', mutability: 'editable' });

    expect(dispatcher.getState().phase).toBe('exporting');
    const section = root.querySelector('[data-pkc-region="shell-menu-data"]');
    expect(section).not.toBeNull(); // pgc-209:visible のまま
  });

  it('case 3: phase=exporting で label が "Data (Exporting…)" に変化', () => {
    setFlag(true);
    const dispatcher = createDispatcher();
    dispatcher.onState((s) => render(s, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: emptyContainer() });
    dispatcher.dispatch({ type: 'TOGGLE_MENU' });
    dispatcher.dispatch({ type: 'BEGIN_EXPORT', mode: 'full', mutability: 'editable' });

    const section = root.querySelector('[data-pkc-region="shell-menu-data"]');
    const label = section!.querySelector('.pkc-shell-menu-label');
    expect(label?.textContent).toBe('Data (Exporting…)');
  });

  it('case 4: phase=exporting で Export button が disabled', () => {
    setFlag(true);
    const dispatcher = createDispatcher();
    dispatcher.onState((s) => render(s, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: emptyContainer() });
    dispatcher.dispatch({ type: 'TOGGLE_MENU' });
    dispatcher.dispatch({ type: 'BEGIN_EXPORT', mode: 'full', mutability: 'editable' });

    const section = root.querySelector('[data-pkc-region="shell-menu-data"]');
    const exportBtn = section!.querySelector<HTMLButtonElement>(
      'button[data-pkc-action="begin-export"][data-pkc-export-mode="full"]',
    );
    expect(exportBtn).not.toBeNull();
    expect(exportBtn!.disabled).toBe(true);
    expect(exportBtn!.getAttribute('data-pkc-disabled-reason')).toBe('exporting');
    expect(exportBtn!.getAttribute('aria-disabled')).toBe('true');
  });

  it('case 5: phase=exporting で全 begin-export / export-* / import-* button が disabled', () => {
    setFlag(true);
    const dispatcher = createDispatcher();
    dispatcher.onState((s) => render(s, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: emptyContainer() });
    dispatcher.dispatch({ type: 'TOGGLE_MENU' });
    dispatcher.dispatch({ type: 'BEGIN_EXPORT', mode: 'full', mutability: 'editable' });

    const section = root.querySelector('[data-pkc-region="shell-menu-data"]');
    const actionButtons = section!.querySelectorAll<HTMLButtonElement>(
      'button[data-pkc-action]',
    );
    expect(actionButtons.length).toBeGreaterThan(0);
    for (const btn of Array.from(actionButtons)) {
      expect(btn.disabled).toBe(true);
      expect(btn.getAttribute('data-pkc-disabled-reason')).toBe('exporting');
    }
  });

  it('case 6: details element に data-pkc-exporting="true" attribute(CSS visual feedback hook)', () => {
    setFlag(true);
    const dispatcher = createDispatcher();
    dispatcher.onState((s) => render(s, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: emptyContainer() });
    dispatcher.dispatch({ type: 'TOGGLE_MENU' });
    dispatcher.dispatch({ type: 'BEGIN_EXPORT', mode: 'full', mutability: 'editable' });

    const section = root.querySelector('[data-pkc-region="shell-menu-data"]');
    const details = section!.querySelector('details.pkc-eip-details');
    expect(details?.getAttribute('data-pkc-exporting')).toBe('true');
  });

  it('case 7: phase=ready 時は data-pkc-exporting attribute 無し(後方互換)', () => {
    setFlag(true);
    const dispatcher = createDispatcher();
    dispatcher.onState((s) => render(s, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: emptyContainer() });
    dispatcher.dispatch({ type: 'TOGGLE_MENU' });

    const section = root.querySelector('[data-pkc-region="shell-menu-data"]');
    const details = section!.querySelector('details.pkc-eip-details');
    expect(details?.hasAttribute('data-pkc-exporting')).toBe(false);
  });

  it('case 8: header inline 経路(flag OFF)も exporting 中の disable 適用なし(default false で従来挙動)', () => {
    setFlag(false);
    const dispatcher = createDispatcher();
    dispatcher.onState((s) => render(s, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: emptyContainer() });
    // header inline は phase==='ready' の create-action group 内で gated されており
    // phase='exporting' で header から消えるため、本 case は flag OFF 時の挙動が
    // header inline 経路の責務分離が保たれていることを confirm するための smoke。
    const inlinePanel = root.querySelector('[data-pkc-region="header"] [data-pkc-region="export-import-panel"]');
    expect(inlinePanel).not.toBeNull();
    // exporting 前の inline は exporting attribute 無し
    const details = inlinePanel!.querySelector('details.pkc-eip-details');
    expect(details?.hasAttribute('data-pkc-exporting')).toBe(false);
  });
});
