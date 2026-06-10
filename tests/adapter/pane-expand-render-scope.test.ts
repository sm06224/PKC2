/**
 * @vitest-environment happy-dom
 *
 * Pane 展開 × render-scope の regression テスト(issue #792 ①再発、
 * user 実機報告 2026-06-10)。
 *
 * 既存の pane toggle テスト(action-binder-pane-toggle-shortcut.test.ts)は
 * prev なしの `render(state, root)`(毎回 full render)で描画するため、
 * render-scope の短絡で起きるこの種のバグを検知できない。本ファイルは
 * **main.ts と同じ scope 付き render パイプライン**(computeRenderScope +
 * `render(state, root, prev)`)で UI 操作を実イベント駆動し、展開後の
 * pane の**中身**(attribute 遷移で止めず DOM 実コンテンツ)を assert する。
 *
 * バグ機構:collapsed pane は full render のたび lazy placeholder(空)に
 * 置き換わる。展開経路は SYS_SYNC_CHILD_WINDOWS dispatch で full render を
 * 強制する契約だが、focus-mode chord(Ctrl+Alt+\)の keydown 経路だけ
 * dispatcher 渡し忘れで placeholder が残り「ペーンが描画されない」を起こした。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher as _createRawDispatcher } from '@adapter/state/dispatcher';
import { render } from '@adapter/ui/renderer';
import { computeRenderScope } from '@adapter/ui/render-scope';
import { __resetPanePrefsCacheForTest } from '@adapter/platform/pane-prefs';
import type { AppState } from '@adapter/state/app-state';
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
      lid: 'f1',
      title: 'Folder One',
      body: '',
      archetype: 'folder',
      created_at: '2026-04-13T00:00:00Z',
      updated_at: '2026-04-13T00:00:00Z',
    },
    {
      lid: 'e1',
      title: 'Entry One',
      body: 'body one',
      archetype: 'text',
      created_at: '2026-04-13T00:00:00Z',
      updated_at: '2026-04-13T00:00:00Z',
    },
    {
      lid: 'e2',
      title: 'Entry Two',
      body: 'body two',
      archetype: 'text',
      created_at: '2026-04-13T00:00:00Z',
      updated_at: '2026-04-13T00:00:00Z',
    },
  ],
  relations: [
    {
      id: 'r1',
      from: 'f1',
      to: 'e1',
      kind: 'structural',
      created_at: '2026-04-13T00:00:00Z',
      updated_at: '2026-04-13T00:00:00Z',
    },
  ],
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

/** main.ts 互換の scope 付き render subscriber。 */
function bootstrap() {
  const dispatcher = createDispatcher();
  let prevRenderState: AppState | null = null;
  const scopes: string[] = [];
  dispatcher.onState((state) => {
    const scope = computeRenderScope(state, prevRenderState);
    scopes.push(scope);
    if (scope !== 'none') {
      render(state, root, prevRenderState);
    }
    prevRenderState = state;
  });
  dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: baseContainer });
  cleanup = bindActions(root, dispatcher);
  return { dispatcher, scopes };
}

function click(el: Element | null): void {
  expect(el).not.toBeNull();
  el!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
}

function sidebar(): HTMLElement | null {
  return root.querySelector<HTMLElement>('[data-pkc-region="sidebar"]');
}
function metaPane(): HTMLElement | null {
  return root.querySelector<HTMLElement>('[data-pkc-region="meta"]');
}

beforeEach(() => {
  __resetPanePrefsCacheForTest();
  localStorage.clear();
  root = document.createElement('div');
  root.id = 'pkc-root';
  document.body.appendChild(root);
  return () => {
    cleanup?.();
    cleanup = undefined;
    for (const fn of _trackedUnsubs) fn();
    _trackedUnsubs.length = 0;
    root.remove();
    __resetPanePrefsCacheForTest();
    localStorage.clear();
  };
});

describe('repro: 両ペーン Hide → Filer から entry open → 耳たぶで展開', () => {
  it('展開後の sidebar に entry rows が描画されている', () => {
    const { dispatcher } = bootstrap();

    // 1. 両ペーンを Hide(header の toggle ボタン or キーボード相当)。
    //    togglePane は data-pkc-action="toggle-sidebar"/"toggle-meta" 経由。
    //    まず entry を選択して meta pane を出してから畳む。
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e2' });
    click(root.querySelector('[data-pkc-action="toggle-sidebar"]'));
    click(root.querySelector('[data-pkc-action="toggle-meta"]'));
    expect(sidebar()!.getAttribute('data-pkc-collapsed')).toBe('true');
    expect(metaPane()!.getAttribute('data-pkc-collapsed')).toBe('true');

    // 2. Filer view へ(センタータブ Filer 相当)。
    dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'filer' });
    // full render 後、collapsed sidebar は lazy placeholder。
    expect(sidebar()!.getAttribute('data-pkc-lazy-sidebar')).toBe('true');

    // 3. Filer の行(非 folder)を single click → detail へ遷移。
    const row = root.querySelector('tr.pkc-filer-row[data-pkc-lid="e2"]');
    click(row);
    const st = dispatcher.getState();
    expect(st.viewMode).toBe('detail');
    expect(st.selectedLid).toBe('e2');

    // 4. 耳たぶ(tray-left)で sidebar を展開。
    const trayLeft = root.querySelector<HTMLElement>('[data-pkc-region="tray-left"]');
    click(trayLeft);

    // 5. assert: sidebar は collapsed でなく、entry rows が存在する。
    const sb = sidebar();
    expect(sb).not.toBeNull();
    expect(sb!.getAttribute('data-pkc-collapsed')).toBeNull();
    expect(sb!.getAttribute('data-pkc-lazy-sidebar')).toBeNull();
    const rows = sb!.querySelectorAll('li[data-pkc-lid]');
    expect(rows.length).toBeGreaterThan(0);
  });

  it('focus-mode chord(Ctrl+Alt+\\)展開後の両ペーンに中身が描画されている', () => {
    const { dispatcher } = bootstrap();

    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e2' });

    // chord で両ペーンを Hide(collapse 側は re-render 不要の契約)。
    const chord = new KeyboardEvent('keydown', {
      key: '\\',
      ctrlKey: true,
      altKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(chord);
    expect(sidebar()!.getAttribute('data-pkc-collapsed')).toBe('true');
    expect(metaPane()!.getAttribute('data-pkc-collapsed')).toBe('true');

    // collapsed 中に full render を走らせて lazy placeholder を仕込む
    // (Filer 切替 = user 再現手順の「センタータブ Filer」相当)。
    dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'filer' });
    expect(sidebar()!.getAttribute('data-pkc-lazy-sidebar')).toBe('true');
    dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'detail' });

    // chord で両ペーンを展開 → SYS_SYNC dispatch 経由の full render で
    // placeholder が実コンテンツに差し替わること(#792 ①の修正点)。
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: '\\',
        ctrlKey: true,
        altKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );

    const sb = sidebar();
    expect(sb).not.toBeNull();
    expect(sb!.getAttribute('data-pkc-collapsed')).toBeNull();
    expect(sb!.getAttribute('data-pkc-lazy-sidebar')).toBeNull();
    expect(sb!.querySelectorAll('li[data-pkc-lid]').length).toBeGreaterThan(0);

    const mp = metaPane();
    expect(mp).not.toBeNull();
    expect(mp!.getAttribute('data-pkc-collapsed')).toBeNull();
    expect(mp!.getAttribute('data-pkc-lazy-meta')).toBeNull();
    expect(mp!.children.length).toBeGreaterThan(0);
  });

  it('展開後の meta pane に中身が描画されている', () => {
    const { dispatcher } = bootstrap();

    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e2' });
    click(root.querySelector('[data-pkc-action="toggle-sidebar"]'));
    click(root.querySelector('[data-pkc-action="toggle-meta"]'));

    dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'filer' });

    const row = root.querySelector('tr.pkc-filer-row[data-pkc-lid="e2"]');
    click(row);

    // 耳たぶ(tray-right)で meta を展開。
    const trayRight = root.querySelector<HTMLElement>('[data-pkc-region="tray-right"]');
    click(trayRight);

    const mp = metaPane();
    expect(mp).not.toBeNull();
    expect(mp!.getAttribute('data-pkc-collapsed')).toBeNull();
    expect(mp!.getAttribute('data-pkc-lazy-meta')).toBeNull();
    expect(mp!.children.length).toBeGreaterThan(0);
  });
});
