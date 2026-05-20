/**
 * @vitest-environment happy-dom
 *
 * pgc-42:top-header の階層パス(Explorer 風 path trail)。
 *
 * user direction(2026-05-20「トップレベルの最上部のヘッダにファイラの
 * 階層パスをエクスプローラみたいに表示・jump できるように」)。
 * 選択中 entry の祖先 folder を `getBreadcrumb` で辿り、header 最下段に
 * `Root › 祖先 › … › 現在` を描画。祖先 segment は click で SELECT_ENTRY
 * (= jump)。center pane の breadcrumb とは別 surface で常時可視。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { __resetRegistry, __resetUrlCache } from '@adapter/flags';
import { render } from '@adapter/ui/renderer';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher } from '@adapter/state/dispatcher';
import type { Container } from '@core/model/container';
import type { Relation } from '@core/model/relation';

const TS = '2026-01-01T00:00:00Z';

function rel(from: string, to: string): Relation {
  return { id: `r-${from}-${to}`, from, to, kind: 'structural', created_at: TS, updated_at: TS };
}

/** f1 > f2 > e1 の 3 階層 + root 直下 e2。 */
function makeContainer(): Container {
  return {
    meta: { container_id: 't', title: 'T', created_at: TS, updated_at: TS, schema_version: 1 },
    entries: [
      { lid: 'f1', title: 'フォルダ1', body: '', archetype: 'folder', created_at: TS, updated_at: TS },
      { lid: 'f2', title: 'フォルダ2', body: '', archetype: 'folder', created_at: TS, updated_at: TS },
      { lid: 'e1', title: '深い記事', body: 'x', archetype: 'text', created_at: TS, updated_at: TS },
      { lid: 'e2', title: 'ルート記事', body: 'y', archetype: 'text', created_at: TS, updated_at: TS },
    ],
    relations: [rel('f1', 'f2'), rel('f2', 'e1')],
    revisions: [],
    assets: {},
  };
}

/** maxDepth(4)超えの深い階層:f1>f2>f3>f4>f5>eDeep。 */
function deepContainer(): Container {
  const folders = ['f1', 'f2', 'f3', 'f4', 'f5'].map((lid, i) => ({
    lid, title: `階層${i + 1}`, body: '', archetype: 'folder' as const, created_at: TS, updated_at: TS,
  }));
  return {
    meta: { container_id: 't', title: 'T', created_at: TS, updated_at: TS, schema_version: 1 },
    entries: [
      ...folders,
      { lid: 'eDeep', title: '最深記事', body: 'z', archetype: 'text', created_at: TS, updated_at: TS },
    ],
    relations: [
      rel('f1', 'f2'), rel('f2', 'f3'), rel('f3', 'f4'), rel('f4', 'f5'), rel('f5', 'eDeep'),
    ],
    revisions: [],
    assets: {},
  };
}

describe('header path trail (pgc-42)', () => {
  let root: HTMLElement;
  let teardown: (() => void) | null = null;

  beforeEach(() => {
    __resetRegistry();
    __resetUrlCache();
    document.body.innerHTML = '';
    root = document.createElement('div');
    root.id = 'pkc-root';
    document.body.appendChild(root);
    teardown = null;
  });

  afterEach(() => {
    if (teardown) { teardown(); teardown = null; }
  });

  function boot(
    container: Container,
    selectLid: string | null,
  ): ReturnType<typeof createDispatcher> {
    const dispatcher = createDispatcher();
    dispatcher.onState((s) => render(s, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });
    if (selectLid) dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: selectLid });
    render(dispatcher.getState(), root);
    teardown = bindActions(root, dispatcher);
    return dispatcher;
  }

  function pathTrail(): HTMLElement | null {
    return root.querySelector('[data-pkc-region="header-path"]');
  }
  function segments(): HTMLElement[] {
    return Array.from(
      root.querySelectorAll<HTMLElement>('.pkc-header-path-segment'),
    );
  }

  it('選択なし:header path trail は描画されない', () => {
    boot(makeContainer(), null);
    expect(pathTrail()).toBeNull();
  });

  it('存在しない lid を選択:header path trail は描画されない', () => {
    const d = boot(makeContainer(), null);
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'no-such-lid' });
    render(d.getState(), root);
    expect(pathTrail()).toBeNull();
  });

  it('root 直下 entry:Root marker + current のみ、祖先 segment なし', () => {
    boot(makeContainer(), 'e2');
    const trail = pathTrail();
    expect(trail).not.toBeNull();
    expect(trail!.querySelector('.pkc-header-path-root')?.textContent).toBe('Root');
    expect(segments()).toHaveLength(0);
    expect(trail!.querySelector('.pkc-header-path-current')?.textContent).toBe('ルート記事');
  });

  it('nested entry:Root › f1 › f2 › 現在 の順で祖先 segment が出る', () => {
    boot(makeContainer(), 'e1');
    const segs = segments();
    expect(segs.map((s) => s.textContent)).toEqual(['フォルダ1', 'フォルダ2']);
    expect(pathTrail()!.querySelector('.pkc-header-path-current')?.textContent).toBe('深い記事');
  });

  it('祖先 segment は select-entry action + 正しい data-pkc-lid を持つ', () => {
    boot(makeContainer(), 'e1');
    const segs = segments();
    expect(segs.map((s) => s.getAttribute('data-pkc-action'))).toEqual([
      'select-entry', 'select-entry',
    ]);
    expect(segs.map((s) => s.getAttribute('data-pkc-lid'))).toEqual(['f1', 'f2']);
  });

  it('current segment は非 clickable(select-entry action を持たない)', () => {
    boot(makeContainer(), 'e1');
    const current = pathTrail()!.querySelector('.pkc-header-path-current');
    expect(current?.getAttribute('data-pkc-action')).toBeNull();
  });

  it('folder 自体を選択:その folder が current、上位がパス', () => {
    boot(makeContainer(), 'f2');
    expect(segments().map((s) => s.textContent)).toEqual(['フォルダ1']);
    expect(pathTrail()!.querySelector('.pkc-header-path-current')?.textContent).toBe('フォルダ2');
  });

  it('祖先 segment を click → SELECT_ENTRY で jump(Phase 8 順序性)', async () => {
    const d = boot(makeContainer(), 'e1');
    const f1Seg = segments().find((s) => s.getAttribute('data-pkc-lid') === 'f1');
    expect(f1Seg).toBeDefined();
    f1Seg!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 300));
    expect(d.getState().selectedLid).toBe('f1');
    // jump 後は header path も f1 を current に再描画。
    expect(pathTrail()!.querySelector('.pkc-header-path-current')?.textContent).toBe('フォルダ1');
  });

  it('maxDepth(4)超の深い階層:truncation marker … が出る', () => {
    boot(deepContainer(), 'eDeep');
    const trail = pathTrail();
    expect(trail!.querySelector('.pkc-header-path-truncated')).not.toBeNull();
    // getBreadcrumb は maxDepth=4 で直近 4 祖先(f2〜f5)のみ返す。
    expect(segments().map((s) => s.getAttribute('data-pkc-lid'))).toEqual([
      'f2', 'f3', 'f4', 'f5',
    ]);
  });
});
