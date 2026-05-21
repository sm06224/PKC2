/**
 * @vitest-environment happy-dom
 *
 * 領域 1: navigation history(back / forward)。
 *
 * `navHistory` / `navIndex` を AppState に持ち、SELECT_ENTRY が push、
 * GO_BACK / GO_FORWARD が index を移動する。keyboard(Alt+←/→)と
 * header の ◀ / ▶ ボタンが発火点。
 *
 * reform-2026-05 Phase 8 順序性に従い、dispatch → selectedLid /
 * navIndex の consumer 観測点までを end-to-end で assert する。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from '@adapter/ui/renderer';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher } from '@adapter/state/dispatcher';
import type { Container } from '@core/model/container';

const T = '2026-05-21T00:00:00.000Z';

function makeContainer(): Container {
  const e = (lid: string, title: string) => ({
    lid, title, body: '', archetype: 'text' as const, created_at: T, updated_at: T,
  });
  return {
    meta: { container_id: 'c', title: 'T', created_at: T, updated_at: T, schema_version: 1 },
    entries: [e('e1', 'One'), e('e2', 'Two'), e('e3', 'Three')],
    relations: [],
    revisions: [],
    assets: {},
  };
}

let root: HTMLElement;
let cleanup: (() => void) | undefined;

beforeEach(() => {
  root = document.createElement('div');
  root.id = 'pkc-root';
  document.body.appendChild(root);
});

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  root.remove();
});

function boot() {
  const dispatcher = createDispatcher();
  dispatcher.onState((s) => render(s, root));
  dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
  render(dispatcher.getState(), root);
  cleanup = bindActions(root, dispatcher);
  return dispatcher;
}

function pressKey(target: EventTarget, key: string, opts: KeyboardEventInit = {}): void {
  target.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts }),
  );
}

describe('領域 1: navigation history reducer', () => {
  it('SELECT_ENTRY が navHistory に push し navIndex を進める', () => {
    const d = boot();
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    expect(d.getState().navHistory).toEqual(['e1']);
    expect(d.getState().navIndex).toBe(0);
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e2' });
    expect(d.getState().navHistory).toEqual(['e1', 'e2']);
    expect(d.getState().navIndex).toBe(1);
  });

  it('同じエントリの再選択は履歴 no-op', () => {
    const d = boot();
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    expect(d.getState().navHistory).toEqual(['e1']);
    expect(d.getState().navIndex).toBe(0);
  });

  it('GO_BACK が navIndex を戻し selectedLid を追従させる', () => {
    const d = boot();
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e2' });
    d.dispatch({ type: 'GO_BACK' });
    expect(d.getState().navIndex).toBe(0);
    expect(d.getState().selectedLid).toBe('e1');
    // navHistory 自体は不変。
    expect(d.getState().navHistory).toEqual(['e1', 'e2']);
  });

  it('GO_FORWARD が navIndex を進め selectedLid を追従させる', () => {
    const d = boot();
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e2' });
    d.dispatch({ type: 'GO_BACK' });
    d.dispatch({ type: 'GO_FORWARD' });
    expect(d.getState().navIndex).toBe(1);
    expect(d.getState().selectedLid).toBe('e2');
  });

  it('GO_BACK は stack 先頭で no-op', () => {
    const d = boot();
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    d.dispatch({ type: 'GO_BACK' });
    expect(d.getState().navIndex).toBe(0);
    expect(d.getState().selectedLid).toBe('e1');
  });

  it('GO_FORWARD は stack 末尾で no-op', () => {
    const d = boot();
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e2' });
    d.dispatch({ type: 'GO_FORWARD' });
    expect(d.getState().navIndex).toBe(1);
    expect(d.getState().selectedLid).toBe('e2');
  });

  it('GO_BACK 後の新規選択は前方履歴を truncate する', () => {
    const d = boot();
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e2' });
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e3' });
    d.dispatch({ type: 'GO_BACK' });
    d.dispatch({ type: 'GO_BACK' }); // navIndex=0 @ e1
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e3' });
    expect(d.getState().navHistory).toEqual(['e1', 'e3']);
    expect(d.getState().navIndex).toBe(1);
    // 前方に e2 はもう無い。
    d.dispatch({ type: 'GO_FORWARD' });
    expect(d.getState().selectedLid).toBe('e3');
  });

  it('navHistory は 100 件で cap される', () => {
    const d = boot();
    for (let i = 0; i < 105; i++) {
      d.dispatch({ type: 'SELECT_ENTRY', lid: `x${i}` });
    }
    expect(d.getState().navHistory).toHaveLength(100);
    expect(d.getState().navIndex).toBe(99);
    // 最古 5 件が捨てられ、先頭は x5。
    expect(d.getState().navHistory[0]).toBe('x5');
    expect(d.getState().navHistory[99]).toBe('x104');
  });

  it('GO_BACK は per-entry transient(multiSelect)を掃除する', () => {
    const d = boot();
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e2' });
    d.dispatch({ type: 'TOGGLE_MULTI_SELECT', lid: 'e3' });
    expect(d.getState().multiSelectedLids.length).toBeGreaterThan(0);
    d.dispatch({ type: 'GO_BACK' });
    expect(d.getState().multiSelectedLids).toEqual([]);
  });
});

describe('領域 1: end-to-end 順序性', () => {
  it('a→b→c 選択 → GO_BACK 2 回で a、GO_FORWARD で b', () => {
    const d = boot();
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e2' });
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e3' });
    expect(d.getState().selectedLid).toBe('e3');
    d.dispatch({ type: 'GO_BACK' });
    d.dispatch({ type: 'GO_BACK' });
    expect(d.getState().selectedLid).toBe('e1');
    d.dispatch({ type: 'GO_FORWARD' });
    expect(d.getState().selectedLid).toBe('e2');
  });
});

describe('領域 1: header ◀ / ▶ ボタン', () => {
  it('header に go-back / go-forward ボタンが描画される', () => {
    boot();
    expect(root.querySelector('[data-pkc-action="go-back"]')).not.toBeNull();
    expect(root.querySelector('[data-pkc-action="go-forward"]')).not.toBeNull();
  });

  it('stack 端に応じて disabled 属性が切り替わる', () => {
    const d = boot();
    const back = () => root.querySelector('[data-pkc-action="go-back"]')!;
    const fwd = () => root.querySelector('[data-pkc-action="go-forward"]')!;
    // 初期(空 history):両方 disabled。
    expect(back().hasAttribute('disabled')).toBe(true);
    expect(fwd().hasAttribute('disabled')).toBe(true);
    // e1→e2 後:戻る enabled / 進む disabled。
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e2' });
    expect(back().hasAttribute('disabled')).toBe(false);
    expect(fwd().hasAttribute('disabled')).toBe(true);
    // GO_BACK 後:戻る disabled / 進む enabled。
    d.dispatch({ type: 'GO_BACK' });
    expect(back().hasAttribute('disabled')).toBe(true);
    expect(fwd().hasAttribute('disabled')).toBe(false);
  });

  it('go-back ボタン click は history.back() を呼ぶ', () => {
    // pgc-55: 全 back/forward は browser history へ集約。ボタンは
    // history.back() を呼び、popstate 経由で nav-history bridge が
    // GO_BACK を dispatch する(full flow は nav-history bridge test +
    // smoke parity が担保)。
    const d = boot();
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e2' });
    const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    (root.querySelector('[data-pkc-action="go-back"]') as HTMLElement).click();
    expect(backSpy).toHaveBeenCalledTimes(1);
    backSpy.mockRestore();
  });
});

describe('領域 1: Alt+←/→ キーボード', () => {
  it('Alt+ArrowLeft が history.back() を呼ぶ', () => {
    boot();
    const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    pressKey(document.body, 'ArrowLeft', { altKey: true });
    expect(backSpy).toHaveBeenCalledTimes(1);
    backSpy.mockRestore();
  });

  it('Alt+ArrowRight が history.forward() を呼ぶ', () => {
    boot();
    const fwdSpy = vi.spyOn(window.history, 'forward').mockImplementation(() => {});
    pressKey(document.body, 'ArrowRight', { altKey: true });
    expect(fwdSpy).toHaveBeenCalledTimes(1);
    fwdSpy.mockRestore();
  });

  it('textarea にフォーカス中の Alt+← は history.back() を呼ばない(単語移動を尊重)', () => {
    boot();
    const ta = document.createElement('textarea');
    root.appendChild(ta);
    const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    pressKey(ta, 'ArrowLeft', { altKey: true });
    expect(backSpy).not.toHaveBeenCalled();
    backSpy.mockRestore();
  });
});
