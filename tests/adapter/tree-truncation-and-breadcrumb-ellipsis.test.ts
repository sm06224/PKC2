/**
 * @vitest-environment happy-dom
 *
 * 視覚監査 2026-07-25 の B1 / A6 ── **省略されていることを画面に出す**。
 *
 * - B1(user 裁定「上限据え置き・打ち切りを可視化」):階層 cap で子を出せ
 *   なかった tree 行に `…N` を出し、子件数の `(0)` という嘘を実件数に直す
 * - A6:パンくずの長大タイトルを ellipsis で省略し、全文は tooltip で読める
 *   ようにする(従来は横スクロール頼みで、省略されていることが分からなかった)
 *
 * どちらも見た目の変更なので実ブラウザ検証は
 * `tests/smoke/tree-truncation-parity.spec.ts` が担う。ここは DOM 生成と
 * memo 無効化(「直したのに画面が変わらない」事故の検知)を固める。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { __resetRegistry, __resetUrlCache, setContainerFlagSource } from '@adapter/flags';
import { render } from '@adapter/ui/renderer';
import { createDispatcher } from '@adapter/state/dispatcher';
import type { Container } from '@core/model/container';
import type { Entry } from '@core/model/record';
import type { Relation } from '@core/model/relation';

const TS = '2026-01-01T00:00:00Z';

function folder(lid: string, title = lid): Entry {
  return { lid, title, body: '', archetype: 'folder', created_at: TS, updated_at: TS };
}
function text(lid: string, title: string): Entry {
  return { lid, title, body: 'x', archetype: 'text', created_at: TS, updated_at: TS };
}
function rel(from: string, to: string): Relation {
  return { id: `${from}->${to}`, from, to, kind: 'structural', created_at: TS, updated_at: TS };
}

/** root > L1 > L2 > L3 > L4(cap)> deep1..deep2 の 6 階層。 */
function deepContainer(): Container {
  const entries: Entry[] = [];
  const relations: Relation[] = [];
  let prev: string | null = null;
  for (let d = 0; d <= 4; d++) {
    const lid = `L${d}`;
    entries.push(folder(lid, `階層${d}`));
    if (prev) relations.push(rel(prev, lid));
    prev = lid;
  }
  // cap(depth 4 = L4)の直下に 2 件 ── ここが打ち切られる
  entries.push(text('deep1', '深い子 1'), text('deep2', '深い子 2'));
  relations.push(rel('L4', 'deep1'), rel('L4', 'deep2'));
  return {
    meta: { container_id: 't', title: 'T', created_at: TS, updated_at: TS, schema_version: 1 },
    entries, relations, revisions: [], assets: {},
  };
}

describe('B1 階層 cap の打ち切り可視化 / A6 パンくず省略', () => {
  let root: HTMLElement;

  beforeEach(() => {
    __resetRegistry();
    __resetUrlCache();
    setContainerFlagSource({});
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  function boot(container: Container, selected?: string): ReturnType<typeof createDispatcher> {
    const d = createDispatcher();
    d.onState((s) => render(s, root));
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container });
    if (selected) d.dispatch({ type: 'SELECT_ENTRY', lid: selected });
    render(d.getState(), root);
    return d;
  }

  // ── B1 ──────────────────────────────────────────────

  it('cap に当たった folder 行に「…N」marker が出る', () => {
    boot(deepContainer());
    const marker = root.querySelector('[data-pkc-tree-truncated]');
    expect(marker, '階層上限で打ち切られたことが画面に出ていない').not.toBeNull();
    expect(marker?.getAttribute('data-pkc-tree-truncated')).toBe('2');
    expect(marker?.textContent).toBe('…2');
    // 全文の説明は tooltip で辿れる
    expect(marker?.getAttribute('title') ?? '').toContain('2 件');
  });

  it('cap に当たった folder の子件数が (0) ではなく実件数になる', () => {
    boot(deepContainer());
    // ⚠ scope 必須:サイドバーの Recent ペインにも同じ lid の <li> が出るので
    //    素の querySelector だと tree 行ではなくそちらを掴む。
    const row = root.querySelector('[data-pkc-region="entry-list"] li[data-pkc-lid="L4"]');
    expect(row, 'cap 直上の folder 行が無い').not.toBeNull();
    const count = row?.querySelector('.pkc-folder-count');
    expect(count?.textContent, '子がいるのに (0) と嘘をついている').toBe('(2)');
  });

  it('cap に当たらない folder では従来どおり(marker なし / 件数はそのまま)', () => {
    boot(deepContainer());
    const shallow = root.querySelector('[data-pkc-region="entry-list"] li[data-pkc-lid="L1"]');
    expect(shallow?.querySelector('[data-pkc-tree-truncated]')).toBeNull();
    expect(shallow?.querySelector('.pkc-folder-count')?.textContent).toBe('(1)');
  });

  it('marker には data-pkc-action を付けない(click は行の選択に bubble する)', () => {
    boot(deepContainer());
    const marker = root.querySelector('[data-pkc-tree-truncated]');
    expect(marker?.getAttribute('data-pkc-action')).toBeNull();
    // 外側の行が従来どおり select-entry を持つ
    const row = marker?.closest('[data-pkc-action="select-entry"]');
    expect(row?.getAttribute('data-pkc-lid')).toBe('L4');
  });

  it('行 memo:同一 container の再 render では行を再利用しつつ marker が保たれる', () => {
    // tree 行は WeakMap memo で再利用される。marker / 件数が memo 経路で
    // 落ちないことを固定する(memo hit でも表示が消えない)。
    const same = deepContainer();
    const d0 = createDispatcher();
    d0.onState((s) => render(s, root));
    d0.dispatch({ type: 'SYS_INIT_COMPLETE', container: same });
    render(d0.getState(), root);
    const first = root.querySelector('[data-pkc-region="entry-list"] li[data-pkc-lid="L4"]');
    render(d0.getState(), root); // 同一 container で再 render = memo hit
    const second = root.querySelector('[data-pkc-region="entry-list"] li[data-pkc-lid="L4"]');
    expect(second, 'memo hit で行が消えた').not.toBeNull();
    expect(second, 'memo が効かず毎回作り直している').toBe(first);
    expect(second?.querySelector('[data-pkc-tree-truncated]')?.textContent).toBe('…2');
    expect(second?.querySelector('.pkc-folder-count')?.textContent).toBe('(2)');
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  it('打ち切り件数が変われば表示が追随する(container 変化 → 行 rebuild)', () => {
    const d = boot(deepContainer());
    const row = (): Element | null =>
      root.querySelector('[data-pkc-region="entry-list"] li[data-pkc-lid="L4"]');
    expect(row()?.querySelector('[data-pkc-tree-truncated]')?.textContent).toBe('…2');

    // 打ち切られている側の entry を実際に削除する(container identity が
    // 変わる実経路。SYS_INIT_COMPLETE は initializing 相でしか効かない)。
    d.dispatch({ type: 'DELETE_ENTRY', lid: 'deep2' });
    render(d.getState(), root);

    expect(
      row()?.querySelector('[data-pkc-tree-truncated]')?.textContent,
      '打ち切り件数の変化が画面に追随していない',
    ).toBe('…1');
    expect(row()?.querySelector('.pkc-folder-count')?.textContent).toBe('(1)');
  });

  // ── A6 ──────────────────────────────────────────────

  it('パンくずの現在地に title 属性(全文)が付く', () => {
    const long = 'あ'.repeat(200);
    const c: Container = {
      meta: { container_id: 't', title: 'T', created_at: TS, updated_at: TS, schema_version: 1 },
      entries: [folder('f1', '親'), text('e1', long)],
      relations: [rel('f1', 'e1')],
      revisions: [], assets: {},
    };
    boot(c, 'e1');
    const current = root.querySelector('.pkc-header-path-current');
    expect(current?.textContent).toBe(long);
    expect(
      current?.getAttribute('title'),
      '省略時に全文へ到達する導線(tooltip)が無い',
    ).toBe(long);
  });

  it('パンくずに ellipsis の CSS が入っている(横スクロール頼みをやめる)', () => {
    // happy-dom は base.css を読まないので source を検査する
    // (tests/adapter/entry-window-css-cat1.test.ts と同じ流儀)。
    const css = readFileSync(resolve(process.cwd(), 'src/styles/base.css'), 'utf-8');
    const m = /\.pkc-header-path-current,\s*\n\.pkc-header-path-segment\s*\{([^}]*max-width[^}]*)\}/.exec(css);
    expect(m, 'header path の ellipsis rule が無い').not.toBeNull();
    const rule = m![1]!;
    expect(rule).toContain('max-width');
    // `overflow: hidden` は ellipsis の前提であると同時に flex item の
    // automatic minimum size を 0 にする ── これが無いと max-width を
    // 付けてもテキストが box 外に描画され、横スクロールが消えない。
    expect(rule).toContain('overflow: hidden');
    expect(rule).toContain('text-overflow: ellipsis');
  });
});
