/** @vitest-environment happy-dom */
/**
 * 行 memo の保持が「今画面に付いている行」を超えない(B18、2026-07-27)。
 *
 * 🔴 見つけた形: `entryRowMemo` / `treeRowMemo` は `WeakMap<Entry, 行DOM>` で、
 * **Entry が生きている限り行 DOM が生き続ける**。Entry は container の寿命ぶん
 * 生きるので、事実上「一度でも描画した行の DOM を永久に持つ」だった。
 * #1031 で container 参照による全 invalidate をやめたこと自体は正しい
 * (1 文字の編集で 5000 行を作り直していた)が、溜め込みだけが残っていた。
 *
 * 実測(c-5000 / 検索条件を変えて 4 サイクル / 強制 GC 後):
 *   修正前 nodes 40,527 → 73,136(+32,609・単調増加)
 *   修正後 nodes 40,527 → 41,480(+953・横ばい)
 * ※ JS heap では +2.8MB にしか見えない ── だから B1 の計器を先に入れた。
 *
 * ここでの観測点は **memo の保持数**(`__rowMemoSize`)。heap を unit test で
 * 測るのは不安定なので、「保持 = 描画した行数」という構造の性質で pin する。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, __resetEntryRowMemoForTest, __rowMemoSize } from '@adapter/ui/renderer';
import { createInitialState } from '@adapter/state/app-state';
import type { AppState } from '@adapter/state/app-state';
import type { Container } from '@core/model/container';

const T = '2026-07-01T00:00:00.000Z';

function containerWith(n: number): Container {
  return {
    meta: { container_id: 'cid', title: 't', created_at: T, updated_at: T, schema_version: 1 },
    entries: Array.from({ length: n }, (_, i) => ({
      lid: `e${i}`,
      // 半分は "alpha"、半分は "beta" ── 検索で排他的な部分集合を作る
      title: i % 2 === 0 ? `alpha ${i}` : `beta ${i}`,
      archetype: 'text' as const,
      body: '',
      created_at: T,
      updated_at: T,
    })),
    relations: [],
    revisions: [],
    assets: {},
  };
}

function renderWith(container: Container, searchQuery: string): AppState {
  const state: AppState = {
    ...createInitialState(),
    container,
    phase: 'ready',
    searchQuery,
  };
  const root = document.createElement('div');
  root.id = 'pkc-root';
  document.body.appendChild(root);
  render(state, root);
  return state;
}

describe('行 memo の保持範囲(B18)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    __resetEntryRowMemoForTest();
  });

  it('絞り込みを切り替えても、保持は「今描いた行」を超えない', () => {
    const container = containerWith(40);

    renderWith(container, 'alpha');
    const afterA = __rowMemoSize();
    expect(afterA.flat).toBe(20);

    // 排他的な別の部分集合を描く ── 旧実装は 20 + 20 = 40 を抱えたままになる
    renderWith(container, 'beta');
    const afterB = __rowMemoSize();
    expect(afterB.flat, '前の絞り込みの行 DOM を掴んだままになっている').toBe(20);
  });

  it('同じ絞り込みの再描画では memo が効いたまま(行 DOM が同一参照で再利用される)', () => {
    // prune が「毎回全部捨てる」になっていないことの pin ──
    // #1031 が守りたかったのは「編集確定 → 同じ一覧を再描画」で 100% hit。
    const container = containerWith(10);
    const root = document.createElement('div');
    root.id = 'pkc-root';
    document.body.appendChild(root);
    const state: AppState = {
      ...createInitialState(),
      container,
      phase: 'ready',
      searchQuery: 'alpha',
    };

    render(state, root);
    const firstRow = root.querySelector('[data-pkc-region="entry-list"] [data-pkc-action="select-entry"]');
    expect(firstRow).not.toBeNull();

    render(state, root);
    const secondRow = root.querySelector('[data-pkc-region="entry-list"] [data-pkc-action="select-entry"]');
    expect(secondRow, 'memo が効かず行が作り直されている').toBe(firstRow);
    expect(__rowMemoSize().flat).toBe(5);
  });
});
