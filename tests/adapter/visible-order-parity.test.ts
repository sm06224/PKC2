/** @vitest-environment happy-dom */
/**
 * 可視行順序の正本(L3-S2、2026-07-27)── **記録した順序 = DOM の順序**。
 *
 * S2 は仮想化の前工事であり、**この段階では挙動を 1 ミリも変えない**のが要件。
 * だから pin するのは「新しい経路が正しい」ではなく
 * **「新旧が完全一致する」**である(一致しない構成が 1 つでもあれば、
 * その消費側は DOM 導出のまま据え置く判断になる)。
 *
 * 消費側は選択集合の定義が微妙に違うので、両方の selector で照合する:
 *   - Shift+click 範囲選択 : `li.pkc-entry-item[data-pkc-lid]`
 *   - ↑↓ キーボードナビ    : `[data-pkc-action="select-entry"][data-pkc-lid]`
 *
 * 併せて S1 の `data-pkc-row-count`(**論理**表示行数)も見る ── 窓化後は
 * DOM の li 数と論理行数がずれるので、計器はこの属性へ移す必要がある。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, __resetEntryRowMemoForTest } from '@adapter/ui/renderer';
import { resolveVisibleOrder, ENTRY_LIST_SELECTOR } from '@adapter/ui/visible-order';
import { createInitialState } from '@adapter/state/app-state';
import type { AppState } from '@adapter/state/app-state';
import type { Container } from '@core/model/container';
import type { Relation } from '@core/model/relation';

const T = '2026-07-01T00:00:00.000Z';

function entry(lid: string, title: string, archetype: 'text' | 'folder' = 'text') {
  return { lid, title, archetype, body: '', created_at: T, updated_at: T };
}

function rel(id: string, from: string, to: string): Relation {
  return { id, from, to, kind: 'structural', created_at: T, updated_at: T };
}

function containerFlat(n: number): Container {
  return {
    meta: { container_id: 'cid', title: 't', created_at: T, updated_at: T, schema_version: 1 },
    entries: Array.from({ length: n }, (_, i) => entry(`e${i}`, i % 2 === 0 ? `alpha ${i}` : `beta ${i}`)),
    relations: [],
    revisions: [],
    assets: {},
  } as unknown as Container;
}

/** folder 2 つ・各 2 子 + root 直下 1 件(tree の入れ子と折り畳みを作る)。 */
function containerTree(): Container {
  return {
    meta: { container_id: 'cid', title: 't', created_at: T, updated_at: T, schema_version: 1 },
    entries: [
      entry('f1', 'Folder 1', 'folder'),
      entry('c1', 'child 1'),
      entry('c2', 'child 2'),
      entry('f2', 'Folder 2', 'folder'),
      entry('c3', 'child 3'),
      entry('c4', 'child 4'),
      entry('r1', 'root level'),
    ],
    relations: [
      rel('r-1', 'f1', 'c1'),
      rel('r-2', 'f1', 'c2'),
      rel('r-3', 'f2', 'c3'),
      rel('r-4', 'f2', 'c4'),
    ],
    revisions: [],
    assets: {},
  } as unknown as Container;
}

function renderInto(state: AppState): HTMLElement {
  const root = document.createElement('div');
  root.id = 'pkc-root';
  document.body.appendChild(root);
  render(state, root);
  return root;
}

/** 従来の DOM 導出(この test の中で「旧実装」を再現する)。 */
function domOrder(scope: Element, selector: string): string[] {
  return Array.from(scope.querySelectorAll<HTMLElement>(selector))
    .map((el) => el.getAttribute('data-pkc-lid'))
    .filter((v): v is string => typeof v === 'string');
}

const SELECTORS = [
  ['Shift+click 範囲選択', 'li.pkc-entry-item[data-pkc-lid]'],
  ['↑↓ キーボードナビ', '[data-pkc-action="select-entry"][data-pkc-lid]'],
] as const;

describe('可視行順序の記録と DOM の一致(L3-S2)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    __resetEntryRowMemoForTest();
  });

  it('flat(検索絞り込み)で新旧が一致する', () => {
    const state: AppState = {
      ...createInitialState(),
      container: containerFlat(30),
      phase: 'ready',
      searchQuery: 'alpha',
    };
    const root = renderInto(state);
    const sidebar = root.querySelector('[data-pkc-region="sidebar"]')!;
    for (const [label, sel] of SELECTORS) {
      expect(resolveVisibleOrder(sidebar, sel), label).toEqual(domOrder(sidebar, sel));
    }
    expect(resolveVisibleOrder(sidebar, SELECTORS[0][1]).length).toBe(15);
  });

  it('tree(入れ子)で新旧が一致する ── 深さ優先の並びまで同じ', () => {
    const state: AppState = {
      ...createInitialState(),
      container: containerTree(),
      phase: 'ready',
    };
    const root = renderInto(state);
    const sidebar = root.querySelector('[data-pkc-region="sidebar"]')!;
    for (const [label, sel] of SELECTORS) {
      expect(resolveVisibleOrder(sidebar, sel), label).toEqual(domOrder(sidebar, sel));
    }
    // 順序そのものも見る(一致だけだと両方壊れたときに気付けない)
    expect(resolveVisibleOrder(sidebar, SELECTORS[0][1])).toEqual([
      'f1', 'c1', 'c2', 'f2', 'c3', 'c4', 'r1',
    ]);
  });

  it('folder を畳むと、畳んだ子は順序に入らない(DOM と同じ)', () => {
    const state: AppState = {
      ...createInitialState(),
      container: containerTree(),
      phase: 'ready',
      collapsedFolders: ['f1'],
    };
    const root = renderInto(state);
    const sidebar = root.querySelector('[data-pkc-region="sidebar"]')!;
    const recorded = resolveVisibleOrder(sidebar, SELECTORS[0][1]);
    expect(recorded).toEqual(domOrder(sidebar, SELECTORS[0][1]));
    expect(recorded).not.toContain('c1');
    expect(recorded).not.toContain('c2');
  });

  it('sub-location 行(検索ヒット)は順序に混ざらない', () => {
    const container = containerFlat(4) as unknown as { entries: { lid: string; body: string }[] };
    container.entries[0]!.body = '# alpha 見出し\n\nalpha 本文';
    const state: AppState = {
      ...createInitialState(),
      container: container as unknown as Container,
      phase: 'ready',
      searchQuery: 'alpha',
    };
    const root = renderInto(state);
    const sidebar = root.querySelector('[data-pkc-region="sidebar"]')!;
    for (const [label, sel] of SELECTORS) {
      expect(resolveVisibleOrder(sidebar, sel), label).toEqual(domOrder(sidebar, sel));
    }
  });

  it('UL を使い回す再描画でも順序が付いてくる(module 変数だとズレる経路)', () => {
    const state: AppState = {
      ...createInitialState(),
      container: containerFlat(10),
      phase: 'ready',
      searchQuery: 'alpha',
    };
    const root = renderInto(state);
    const sidebar = root.querySelector('[data-pkc-region="sidebar"]')!;
    const before = resolveVisibleOrder(sidebar, SELECTORS[0][1]);

    // 編集開始 = phase 変化 → render scope は 'full' だが UL は使い回される
    render({ ...state, phase: 'editing', editingLid: 'e0' }, root);
    const sidebar2 = root.querySelector('[data-pkc-region="sidebar"]')!;
    expect(resolveVisibleOrder(sidebar2, SELECTORS[0][1])).toEqual(before);
    expect(resolveVisibleOrder(sidebar2, SELECTORS[0][1]))
      .toEqual(domOrder(sidebar2, SELECTORS[0][1]));
  });

  it('S1: data-pkc-row-count が論理表示行数を示す', () => {
    const state: AppState = {
      ...createInitialState(),
      container: containerFlat(30),
      phase: 'ready',
      searchQuery: 'beta',
    };
    const root = renderInto(state);
    const list = root.querySelector(ENTRY_LIST_SELECTOR)!;
    expect(list.getAttribute('data-pkc-row-count')).toBe('15');
    // 窓化前は DOM の行数と一致する(窓化後はここが乖離するのが正常)
    expect(list.querySelectorAll('li.pkc-entry-item[data-pkc-lid]').length).toBe(15);
  });

  it('記録が無い scope(filer view など)は DOM 導出へ落ちる', () => {
    const scope = document.createElement('div');
    scope.innerHTML = `
      <ul class="pkc-sidebar-filer-list">
        <li data-pkc-action="select-entry" data-pkc-lid="x1"></li>
        <li data-pkc-action="select-entry" data-pkc-lid="x2"></li>
      </ul>`;
    expect(resolveVisibleOrder(scope, '[data-pkc-action="select-entry"][data-pkc-lid]'))
      .toEqual(['x1', 'x2']);
  });
});
