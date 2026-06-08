/**
 * @vitest-environment happy-dom
 *
 * Phase γ-A1:filer モード sidebar の drag-and-drop(entry の folder 間
 * 移動)。pgc-33。
 *
 * filer item に `draggable` / `data-pkc-draggable`、folder item と nav-up
 * に `data-pkc-drop-target` を付与し、action-binder の汎用 DnD 機構
 * (handleDragStart / handleDrop)で structural relation を付け替える。
 * 属性付与 → 実 drag/drop event → relation 変化(consumer)までの
 * reform-2026-05 Phase 8 順序性を case matrix 11 件で検証する。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  __resetRegistry,
  __resetUrlCache,
  setContainerFlagSource,
} from '@adapter/flags';
import { render } from '@adapter/ui/renderer';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher } from '@adapter/state/dispatcher';
import type { Container } from '@core/model/container';

const TS = '2026-01-01T00:00:00Z';

/** f1 / f2(folder, root)、e1(text, root)、e2(text, f1 の child)。 */
function makeContainer(): Container {
  return {
    meta: { container_id: 't', title: 'T', created_at: TS, updated_at: TS, schema_version: 1 },
    entries: [
      { lid: 'f1', title: 'フォルダ1', body: '', archetype: 'folder', created_at: TS, updated_at: TS },
      { lid: 'f2', title: 'フォルダ2', body: '', archetype: 'folder', created_at: TS, updated_at: TS },
      { lid: 'e1', title: 'エントリ1', body: 'x', archetype: 'text', created_at: TS, updated_at: TS },
      { lid: 'e2', title: 'エントリ2', body: 'y', archetype: 'text', created_at: TS, updated_at: TS },
    ],
    relations: [
      { id: 'r1', from: 'f1', to: 'e2', kind: 'structural', created_at: TS, updated_at: TS },
    ],
    revisions: [],
    assets: {},
  };
}

describe('filer モード sidebar の drag-and-drop (Phase γ-A1, pgc-33)', () => {
  let root: HTMLElement;
  let teardown: (() => void) | null = null;

  beforeEach(() => {
    __resetRegistry();
    __resetUrlCache();
    setContainerFlagSource({ 'sidebar.mode': 'filer' });
    document.body.innerHTML = '';
    root = document.createElement('div');
    root.id = 'pkc-root';
    document.body.appendChild(root);
    teardown = null;
  });

  afterEach(() => {
    if (teardown) {
      teardown();
      teardown = null;
    }
  });

  function boot(readonly = false): ReturnType<typeof createDispatcher> {
    const dispatcher = createDispatcher();
    dispatcher.onState((s) => render(s, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer(), readonly });
    render(dispatcher.getState(), root);
    teardown = bindActions(root, dispatcher);
    return dispatcher;
  }

  function item(lid: string): HTMLElement {
    const el = root.querySelector<HTMLElement>(
      `.pkc-sidebar-filer-item[data-pkc-lid="${lid}"]`,
    );
    if (!el) throw new Error(`filer item "${lid}" not found`);
    return el;
  }
  function navUp(): HTMLElement {
    const el = root.querySelector<HTMLElement>('.pkc-sidebar-filer-nav-up');
    if (!el) throw new Error('nav-up not found');
    return el;
  }
  function fire(type: string, el: HTMLElement): void {
    el.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
  }
  function dragDrop(src: HTMLElement, dst: HTMLElement): void {
    fire('dragstart', src);
    fire('drop', dst);
  }
  function structuralParent(
    d: ReturnType<typeof createDispatcher>,
    childLid: string,
  ): string | null {
    const rels = d.getState().container?.relations ?? [];
    const r = rels.find((x) => x.kind === 'structural' && x.to === childLid);
    return r ? r.from : null;
  }

  // ── 属性付与 ──

  it('filer item は draggable + data-pkc-draggable を持つ', () => {
    boot();
    expect(item('e1').getAttribute('draggable')).toBe('true');
    expect(item('e1').getAttribute('data-pkc-draggable')).toBe('true');
  });

  it('folder item は data-pkc-drop-target="true" を持つ', () => {
    boot();
    expect(item('f1').getAttribute('data-pkc-drop-target')).toBe('true');
    expect(item('f2').getAttribute('data-pkc-drop-target')).toBe('true');
  });

  it('非 folder item は data-pkc-drop-target を持たない', () => {
    boot();
    expect(item('e1').getAttribute('data-pkc-drop-target')).toBeNull();
  });

  it('top-level folder scope の nav-up は data-pkc-drop-target="root"', () => {
    const d = boot();
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'f1' });
    expect(navUp().getAttribute('data-pkc-drop-target')).toBe('root');
  });

  // ── move(consumer:structural relation 付け替え)──

  it('root の entry を folder に drop → folder の child になる', () => {
    const d = boot();
    expect(structuralParent(d, 'e1')).toBeNull(); // 元は root
    dragDrop(item('e1'), item('f1'));
    expect(structuralParent(d, 'e1')).toBe('f1');
  });

  it('root の entry を別 folder に drop しても move される', () => {
    const d = boot();
    dragDrop(item('e1'), item('f2'));
    expect(structuralParent(d, 'e1')).toBe('f2');
  });

  it('folder を別 folder に drop → folder-into-folder 移動', () => {
    const d = boot();
    dragDrop(item('f2'), item('f1'));
    expect(structuralParent(d, 'f2')).toBe('f1');
  });

  it('folder scope で child を nav-up(root)に drop → root へ移動', () => {
    const d = boot();
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'f1' }); // f1 scope へ
    expect(structuralParent(d, 'e2')).toBe('f1');
    dragDrop(item('e2'), navUp());
    expect(structuralParent(d, 'e2')).toBeNull(); // root へ
  });

  it('自分自身に drop しても move されない', () => {
    const d = boot();
    dragDrop(item('f1'), item('f1'));
    expect(structuralParent(d, 'f1')).toBeNull(); // 変化なし
  });

  it('readonly state では drop しても move されない', () => {
    const d = boot(true);
    dragDrop(item('e1'), item('f1'));
    expect(structuralParent(d, 'e1')).toBeNull(); // 変化なし
  });

  it('dragstart 無しの drop は何も起こさない(draggedLid 未設定)', () => {
    const d = boot();
    fire('drop', item('f1')); // dragstart せず drop だけ
    expect(structuralParent(d, 'e1')).toBeNull();
    expect(structuralParent(d, 'e2')).toBe('f1'); // 既存関係も不変
  });

  it('dragover で folder が data-pkc-drag-over の視覚 feedback を得る', () => {
    boot();
    fire('dragstart', item('e1'));
    fire('dragover', item('f1'));
    expect(item('f1').getAttribute('data-pkc-drag-over')).toBe('true');
  });
});
