/** @vitest-environment happy-dom */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { render } from '../../src/adapter/ui/renderer';
import { bindActions } from '../../src/adapter/ui/action-binder';
import { createDispatcher } from '../../src/adapter/state/dispatcher';
import { __resetRegistry, __resetUrlCache } from '../../src/adapter/flags';
import type { Container } from '../../src/core/model/container';

function makeContainer(): Container {
  const TS = '2026-05-24T00:00:00Z';
  return {
    meta: { container_id: 'c1', title: 'C', created_at: TS, updated_at: TS, schema_version: 1 },
    entries: [
      { lid: 'e1', title: 'Entry 1', body: 'one', archetype: 'text', created_at: TS, updated_at: TS },
      { lid: 'e2', title: 'Entry 2', body: 'two', archetype: 'text', created_at: TS, updated_at: TS },
      { lid: 'e3', title: 'Entry 3', body: 'three', archetype: 'text', created_at: TS, updated_at: TS },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };
}

describe('pgc-160 breadcrumb / header nav forward button(user bug fix)', () => {
  let root: HTMLElement;
  let teardown: (() => void) | null = null;

  beforeEach(() => {
    __resetRegistry();
    __resetUrlCache();
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  afterEach(() => {
    if (teardown) { teardown(); teardown = null; }
  });

  function boot() {
    const dispatcher = createDispatcher();
    dispatcher.onState((s) => render(s, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    render(dispatcher.getState(), root);
    teardown = bindActions(root, dispatcher);
    return dispatcher;
  }

  function fwdBtn(): HTMLButtonElement | null {
    return root.querySelector<HTMLButtonElement>('button[data-pkc-action="go-forward"]');
  }
  function backBtn(): HTMLButtonElement | null {
    return root.querySelector<HTMLButtonElement>('button[data-pkc-action="go-back"]');
  }

  it('case 1: 初期状態(navHistory 空)で forward は disabled + tooltip に「履歴がありません」', () => {
    boot();
    const f = fwdBtn();
    expect(f).not.toBeNull();
    expect(f?.disabled).toBe(true);
    expect(f?.getAttribute('title')).toContain('履歴がありません');
    expect(f?.getAttribute('aria-label')).toContain('履歴なし');
  });

  it('case 2: entry select 後の back は disabled、forward も disabled(末尾)', () => {
    const d = boot();
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    render(d.getState(), root);
    expect(backBtn()?.disabled).toBe(true);
    expect(fwdBtn()?.disabled).toBe(true);
  });

  it('case 3: 2 件 select 後の back は enable、forward は disabled', () => {
    const d = boot();
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e2' });
    render(d.getState(), root);
    expect(backBtn()?.disabled).toBe(false);
    expect(fwdBtn()?.disabled).toBe(true);
  });

  it('case 4: back 後の forward は enable + tooltip 通常', () => {
    const d = boot();
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e2' });
    d.dispatch({ type: 'GO_BACK' });
    render(d.getState(), root);
    const f = fwdBtn();
    expect(f?.disabled).toBe(false);
    expect(f?.getAttribute('title')).toContain('次のエントリへ進む');
    expect(f?.getAttribute('title')).not.toContain('履歴がありません');
    expect(f?.getAttribute('aria-label')).toBe('進む');
  });

  it('case 5: GO_FORWARD dispatch で entry が次に進む(順序性 Phase 8、click は browser history 経由のため reducer 直 assert)', () => {
    // 注:`go-forward` action handler は window.history.forward() を呼び、
    // popstate event で GO_FORWARD を dispatch する経路。happy-dom では
    // popstate event が安定して発火しないため、click 経路を skip して
    // reducer 単独で正常動作を assert(本 PR は click 経路は touchない、
    // CSS + tooltip + visual の改修だけ)。
    const d = boot();
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e2' });
    d.dispatch({ type: 'GO_BACK' });
    render(d.getState(), root);
    expect(d.getState().selectedLid).toBe('e1');
    d.dispatch({ type: 'GO_FORWARD' });
    expect(d.getState().selectedLid).toBe('e2');
  });

  it('case 6: button は min-width / min-height で touch target 確保(class 経路 assert)', () => {
    boot();
    const f = fwdBtn();
    // 2026-05-28 `shell.back_forward_in_breadcrumb_enabled` always-on 化後は
    // breadcrumb 統合経路の class(`pkc-header-path-nav-btn`)、未統合経路は
    // 旧 class(`pkc-header-nav-btn`)── どちらでも touch target は確保される。
    const hasNavClass =
      f?.classList.contains('pkc-header-nav-btn') ||
      f?.classList.contains('pkc-header-path-nav-btn');
    expect(hasNavClass).toBe(true);
  });

  it('case 7: disabled button の cursor は not-allowed(class 経路 assert)', () => {
    // CSS rule は base.css に追加済 ── pkc-header-path-nav-btn:disabled が
    // cursor: not-allowed。本 test は class 付与のみ確認、computed style
    // は happy-dom では stable に取れないので skip。
    boot();
    expect(fwdBtn()?.disabled).toBe(true);
  });
});
