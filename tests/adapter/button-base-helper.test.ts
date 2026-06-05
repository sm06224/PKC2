/** @vitest-environment happy-dom */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { render } from '../../src/adapter/ui/renderer';
import { createDispatcher } from '../../src/adapter/state/dispatcher';
import { __resetRegistry, __resetUrlCache } from '../../src/adapter/flags';
import type { Container } from '../../src/core/model/container';

function makeContainer(): Container {
  const TS = '2026-05-24T00:00:00Z';
  return {
    meta: { container_id: 'c1', title: 'C', created_at: TS, updated_at: TS, schema_version: 1 },
    entries: [
      { lid: 'e1', title: 'X', body: 'body', archetype: 'text', created_at: TS, updated_at: TS },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };
}

describe('pgc-171 button base helper(audit doc step 1-2)', () => {
  let root: HTMLElement;

  beforeEach(() => {
    __resetRegistry();
    __resetUrlCache();
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  function setFlag(breadcrumbForwardInPath: boolean): void {
    const url = new URL(window.location.href);
    url.searchParams.delete('pkc-flag');
    url.searchParams.set('pkc-flag', `shell.back_forward_in_breadcrumb_enabled=${breadcrumbForwardInPath ? '1' : '0'}`);
    window.history.replaceState({}, '', url.toString());
    __resetUrlCache();
  }

  function boot() {
    const d = createDispatcher();
    d.onState((s) => render(s, root));
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    render(d.getState(), root);
    return d;
  }

  it('case 1: 標準 header nav back-forward に pkc-button-base + pkc-button-size-icon class が付く(audit step 2 adopt)', () => {
    setFlag(false);
    boot();
    const back = root.querySelector('button[data-pkc-action="go-back"]');
    const fwd = root.querySelector('button[data-pkc-action="go-forward"]');
    expect(back?.classList.contains('pkc-button-base')).toBe(true);
    expect(back?.classList.contains('pkc-button-size-icon')).toBe(true);
    expect(fwd?.classList.contains('pkc-button-base')).toBe(true);
    expect(fwd?.classList.contains('pkc-button-size-icon')).toBe(true);
  });

  it('case 2: breadcrumb 内 back-forward icon にも base + size-icon class', () => {
    setFlag(true);
    boot();
    const back = root.querySelector('button[data-pkc-action="go-back"]');
    const fwd = root.querySelector('button[data-pkc-action="go-forward"]');
    expect(back?.classList.contains('pkc-button-base')).toBe(true);
    expect(back?.classList.contains('pkc-button-size-icon')).toBe(true);
    expect(fwd?.classList.contains('pkc-button-base')).toBe(true);
    expect(fwd?.classList.contains('pkc-button-size-icon')).toBe(true);
  });

  it('case 3: 既存 class(pkc-header-nav-btn)も維持(後方互換)', () => {
    setFlag(false);
    boot();
    const back = root.querySelector('button[data-pkc-action="go-back"]');
    expect(back?.classList.contains('pkc-header-nav-btn')).toBe(true);
  });

  it('case 4: 既存 class(pkc-header-path-nav-btn)も維持', () => {
    setFlag(true);
    boot();
    const back = root.querySelector('button[data-pkc-action="go-back"]');
    expect(back?.classList.contains('pkc-header-path-nav-btn')).toBe(true);
    expect(back?.classList.contains('pkc-header-path-nav-back')).toBe(true);
  });

  it('case 5: button helper class の order 不変(test 安定性、tabIndex / aria の上書き無し)', () => {
    setFlag(false);
    boot();
    const back = root.querySelector<HTMLButtonElement>('button[data-pkc-action="go-back"]');
    // base helper class が先頭で、既存 class が後ろ(specificity 順)
    const classes = Array.from(back?.classList ?? []);
    expect(classes[0]).toBe('pkc-button-base');
    expect(classes[1]).toBe('pkc-button-size-icon');
    expect(classes).toContain('pkc-header-nav-btn');
  });
});
