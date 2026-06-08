/**
 * @vitest-environment happy-dom
 *
 * pgc-101 wave-γ #3(MASTER.md §6.1 phase 3):header の標準 nav group
 * (`◀` `▶` button)を breadcrumb 内 `⇐` `⇒` icon に統合。
 *
 * Tier 0 flag `shell.back_forward_in_breadcrumb_enabled`:
 *   OFF(default):従来どおり header 上段に `.pkc-header-nav` group +
 *                 breadcrumb は back/forward icon 無し
 *   ON:header 上段の `.pkc-header-nav` group が消え、breadcrumb の
 *      先頭に `⇐` `⇒` icon が prepend される。選択無しでも minimal
 *      nav(icon のみ)が出る。
 *
 * 機能差ゼロ ── 両 button とも同じ `go-back` / `go-forward` action を
 * dispatch、disabled handling も標準と同条件(navIndex / navHistory.length)。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { __resetRegistry, __resetUrlCache } from '@adapter/flags';
import { render } from '@adapter/ui/renderer';
import { createDispatcher } from '@adapter/state/dispatcher';
import type { Container } from '@core/model/container';
import type { Relation } from '@core/model/relation';

const TS = '2026-01-01T00:00:00Z';

function rel(from: string, to: string): Relation {
  return { id: `r-${from}-${to}`, from, to, kind: 'structural', created_at: TS, updated_at: TS };
}

function makeContainer(): Container {
  return {
    meta: { container_id: 't', title: 'T', created_at: TS, updated_at: TS, schema_version: 1 },
    entries: [
      { lid: 'f1', title: 'フォルダ1', body: '', archetype: 'folder', created_at: TS, updated_at: TS },
      { lid: 'e1', title: '記事', body: 'x', archetype: 'text', created_at: TS, updated_at: TS },
    ],
    relations: [rel('f1', 'e1')],
    revisions: [],
    assets: {},
  };
}

function setFlag(value: boolean): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('pkc-flag');
  url.searchParams.set('pkc-flag', `shell.back_forward_in_breadcrumb_enabled=${value ? '1' : '0'}`);
  window.history.replaceState({}, '', url.toString());
  __resetUrlCache();
}

describe('pgc-101 header back/forward → breadcrumb 内 icon 統合', () => {
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

  function boot(selectLid: string | null): ReturnType<typeof createDispatcher> {
    const dispatcher = createDispatcher();
    dispatcher.onState((s) => render(s, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    if (selectLid) dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: selectLid });
    render(dispatcher.getState(), root);
    return dispatcher;
  }

  function standaloneNavGroup(): HTMLElement | null {
    return root.querySelector('.pkc-header-nav');
  }
  function breadcrumb(): HTMLElement | null {
    return root.querySelector('[data-pkc-region="header-path"]');
  }
  function backInBreadcrumb(): HTMLElement | null {
    return root.querySelector('[data-pkc-region="header-path"] .pkc-header-path-nav-back');
  }
  function fwdInBreadcrumb(): HTMLElement | null {
    return root.querySelector('[data-pkc-region="header-path"] .pkc-header-path-nav-fwd');
  }

  it('flag OFF:標準 nav group が出る、breadcrumb 内に icon 無し', () => {
    setFlag(false);
    boot('e1');
    expect(standaloneNavGroup()).not.toBeNull();
    expect(breadcrumb()).not.toBeNull();
    expect(backInBreadcrumb()).toBeNull();
    expect(fwdInBreadcrumb()).toBeNull();
  });

  it('flag ON:標準 nav group 消える、breadcrumb 先頭に `⇐` `⇒` icon', () => {
    setFlag(true);
    boot('e1');
    expect(standaloneNavGroup()).toBeNull();
    const bc = breadcrumb();
    expect(bc).not.toBeNull();
    const back = backInBreadcrumb();
    const fwd = fwdInBreadcrumb();
    expect(back).not.toBeNull();
    expect(fwd).not.toBeNull();
    expect(back?.textContent).toBe('⇐');
    expect(fwd?.textContent).toBe('⇒');
    // icon が breadcrumb 内で最初の子要素であること
    expect(bc?.firstElementChild).toBe(back);
    expect(bc?.children[1]).toBe(fwd);
  });

  it('flag ON:選択無しでも minimal nav(icon のみ)が出る', () => {
    setFlag(true);
    boot(null);
    expect(standaloneNavGroup()).toBeNull();
    const bc = breadcrumb();
    expect(bc).not.toBeNull();
    expect(backInBreadcrumb()).not.toBeNull();
    expect(fwdInBreadcrumb()).not.toBeNull();
    // 選択無しなので Root marker や segment 等は無い(icon のみ)
    expect(bc?.querySelector('.pkc-header-path-root')).toBeNull();
    expect(bc?.querySelector('.pkc-header-path-current')).toBeNull();
  });

  it('flag OFF:選択無しなら breadcrumb 自体 null(従来挙動)', () => {
    setFlag(false);
    boot(null);
    expect(breadcrumb()).toBeNull();
  });

  it('flag ON:back/forward icon の data-pkc-action が `go-back` / `go-forward`', () => {
    setFlag(true);
    boot('e1');
    expect(backInBreadcrumb()?.getAttribute('data-pkc-action')).toBe('go-back');
    expect(fwdInBreadcrumb()?.getAttribute('data-pkc-action')).toBe('go-forward');
  });

  it('flag ON:initial state(navIndex=0、stack 端)で back disabled', () => {
    setFlag(true);
    boot('e1');
    const back = backInBreadcrumb();
    expect(back?.hasAttribute('disabled')).toBe(true);
  });

  it('flag ON:fwd は navIndex >= length-1 なら disabled', () => {
    setFlag(true);
    boot('e1');
    // initial nav stack: just `e1`(SELECT_ENTRY で push)、navIndex=0
    const fwd = fwdInBreadcrumb();
    expect(fwd?.hasAttribute('disabled')).toBe(true);
  });
});
