/** @vitest-environment happy-dom */
/**
 * #938 R2 — sidebar click の即時 SELECT_ENTRY(旧 PR-MMM 250ms 遅延の撤去)
 * と、dblclick の行ズレ redirect の統合 test。
 *
 * - 単一 click: 遅延なしで selectedLid が変わる(「左ペインだけワンテンポ
 *   遅い」の解消)
 * - dblclick(detail>=2): click 1 の再描画で行がズレて click 2 が**別の行**
 *   に当たっても、300ms / 8px 以内なら 1 打目の行が対象になる(redirect)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDispatcher } from '@adapter/state/dispatcher';
import { bindActions } from '@adapter/ui/action-binder';
import { render } from '@adapter/ui/renderer';
import type { Container } from '@core/model/container';

const T = '2026-07-20T00:00:00Z';

function makeContainer(): Container {
  const mk = (lid: string, title: string, archetype: 'text' | 'folder') => ({
    lid, title, body: '', archetype, created_at: T, updated_at: T,
  });
  return {
    meta: { container_id: 'c-r2', title: 't', created_at: T, updated_at: T, schema_version: 1 },
    entries: [mk('fA', 'Folder A', 'folder'), mk('fB', 'Folder B', 'folder'), mk('e1', 'Text', 'text')],
    relations: [], revisions: [], assets: {},
  };
}

let root: HTMLElement;
let cleanup: (() => void) | null = null;

beforeEach(() => {
  root = document.createElement('div');
  document.body.appendChild(root);
});
afterEach(() => {
  cleanup?.();
  root.remove();
});

function setup() {
  const dispatcher = createDispatcher();
  dispatcher.onState((s) => render(s, root));
  dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
  render(dispatcher.getState(), root);
  cleanup = bindActions(root, dispatcher);
  return dispatcher;
}

function sidebarRow(lid: string): HTMLElement {
  return root.querySelector<HTMLElement>(
    `[data-pkc-region="entry-list"] [data-pkc-action="select-entry"][data-pkc-lid="${lid}"]`,
  )!;
}

function click(el: HTMLElement, opts: { detail?: number; x?: number; y?: number } = {}): void {
  el.dispatchEvent(new MouseEvent('click', {
    bubbles: true, cancelable: true,
    detail: opts.detail ?? 1,
    clientX: opts.x ?? 0,
    clientY: opts.y ?? 0,
  }));
}

describe('sidebar 即時選択(#938 R2)', () => {
  it('単一 click で遅延なく SELECT_ENTRY される', () => {
    const d = setup();
    click(sidebarRow('e1'));
    // timer を進めずに即時反映を assert(旧実装はここで null だった)
    expect(d.getState().selectedLid).toBe('e1');
  });

  it('別々の行への素早い 2 連 click(detail=1)はそれぞれ単一選択', () => {
    const d = setup();
    click(sidebarRow('e1'), { x: 10, y: 10 });
    click(sidebarRow('fA'), { x: 10, y: 40 });
    expect(d.getState().selectedLid).toBe('fA');
    expect(d.getState().viewMode).not.toBe('filer'); // dblclick 扱いされない
  });
});

describe('dblclick の行ズレ redirect(#938 R2)', () => {
  it('click 2(detail=2)が同座標で別行に当たっても 1 打目の行が対象', () => {
    const d = setup();
    // 1 打目: Folder A(座標 100,50)→ 即時選択・再描画で行がズレた想定
    click(sidebarRow('fA'), { x: 100, y: 50 });
    expect(d.getState().selectedLid).toBe('fA');
    // 2 打目: ほぼ同座標で detail=2 だが、ズレた行 = Folder B に着弾
    click(sidebarRow('fB'), { detail: 2, x: 102, y: 52 });
    // redirect により dblclick は fA(folder → filer へ)扱い
    expect(d.getState().selectedLid).toBe('fA');
    expect(d.getState().viewMode).toBe('filer');
  });

  it('座標が離れていれば redirect しない(着弾行の dblclick)', () => {
    const d = setup();
    click(sidebarRow('fA'), { x: 10, y: 10 });
    click(sidebarRow('fB'), { detail: 2, x: 10, y: 60 }); // 50px 離れている
    expect(d.getState().selectedLid).toBe('fB');
    expect(d.getState().viewMode).toBe('filer');
  });
});
