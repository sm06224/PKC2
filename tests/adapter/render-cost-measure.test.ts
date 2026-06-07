/**
 * @vitest-environment happy-dom
 *
 * Render-cost characterization for L1 #768(full re-render 局所化調査).
 *
 * `computeRenderScope` falls back to `'full'` for `selectedLid`
 * (SELECT_ENTRY) and `container` (QUICK_UPDATE_ENTRY) deltas, so the
 * most frequent navigation/edit actions rebuild the ENTIRE shell:
 * `root.innerHTML = ''` then re-create every sidebar row + center +
 * meta. This test pins the cost basis — how many DOM nodes a full
 * render throws away and re-creates as a function of entry count, and
 * how that splits between the sidebar (O(N) rows) and the center pane
 * (≈ constant) — to quantify the localization opportunity.
 *
 * The thesis the localization rests on: a SELECT_ENTRY only needs to
 * move the selection highlight on 2 sidebar rows + swap the center
 * pane, yet today it re-creates all N sidebar rows. This test asserts
 * the sidebar node count scales ~linearly with N while the center
 * stays bounded — i.e. the wasted work is O(N) per click.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@adapter/ui/renderer';
import { registerPresenter } from '@adapter/ui/detail-presenter';
import { todoPresenter } from '@adapter/ui/todo-presenter';
import { formPresenter } from '@adapter/ui/form-presenter';
import { attachmentPresenter } from '@adapter/ui/attachment-presenter';
import type { AppState } from '@adapter/state/app-state';
import type { Container } from '@core/model/container';

registerPresenter('todo', todoPresenter);
registerPresenter('form', formPresenter);
registerPresenter('attachment', attachmentPresenter);

function makeContainer(n: number): Container {
  const entries = Array.from({ length: n }, (_, i) => {
    const isTodo = i % 3 === 0;
    return {
      lid: `e${i}`,
      title: `Entry ${i}`,
      body: isTodo
        ? JSON.stringify({ status: i % 2 ? 'done' : 'open', description: `task ${i}` })
        : `Body of entry ${i} with some **markdown** text.`,
      archetype: (isTodo ? 'todo' : 'text') as 'todo' | 'text',
      created_at: `2026-01-01T00:${String(i % 60).padStart(2, '0')}:00Z`,
      updated_at: `2026-01-01T00:${String(i % 60).padStart(2, '0')}:00Z`,
    };
  });
  return {
    meta: {
      container_id: 'measure', title: 'Measure', created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z', schema_version: 1,
    },
    entries, relations: [], revisions: [], assets: {},
  };
}

function baseState(container: Container, selectedLid: string | null): AppState {
  return {
    phase: 'ready', container, selectedLid, editingLid: null, error: null,
    embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null,
    searchQuery: '', archetypeFilter: new Set(), categoricalPeerFilter: null,
    sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null,
    readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const,
    calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null,
    collapsedFolders: [], recentEntryRefLids: [],
  } as AppState;
}

function countNodes(root: HTMLElement) {
  const total = root.querySelectorAll('*').length;
  const sidebar = root.querySelector('[data-pkc-region="sidebar"]')?.querySelectorAll('*').length ?? 0;
  const center = root.querySelector('[data-pkc-region="center"]')?.querySelectorAll('*').length ?? 0;
  const rows = root.querySelectorAll('[data-pkc-action="select-entry"]').length;
  return { total, sidebar, center, rows };
}

let root: HTMLElement;
beforeEach(() => {
  root = document.createElement('div');
  document.body.appendChild(root);
  return () => { root.remove(); };
});

describe('render-cost characterization (L1 #768)', () => {
  const sizes = [100, 500, 2000];
  const measured: Record<number, ReturnType<typeof countNodes> & { ms: number }> = {};

  for (const n of sizes) {
    it(`full render at N=${n} entries rebuilds O(N) sidebar nodes`, () => {
      const container = makeContainer(n);
      const state = baseState(container, 'e1');
      const t0 = performance.now();
      render(state, root); // prev=null ⇒ full path (root.innerHTML='' + full rebuild)
      const ms = performance.now() - t0;
      const c = countNodes(root);
      measured[n] = { ...c, ms };

      // Full render builds a row for every (non-folder) entry.
      expect(c.rows).toBeGreaterThanOrEqual(n * 0.9);
      // The sidebar subtree dominates total node count at scale.
      expect(c.sidebar).toBeGreaterThan(c.center);
    }, 30000);
  }

  // L1 #766: parseTodoBody は entry ref keyed の WeakMap で memoize される。
  // container は immutable update なので、編集された entry は新 ref になり cache が
  // 自動 invalidate されることを保証する(QUICK_UPDATE_ENTRY フローで stale な status
  // を描かないこと = consumer 観測点の parity)。
  it('memoized parseTodoBody invalidates on entry-ref change (no stale render)', () => {
    const c1: Container = {
      meta: { container_id: 'm', title: 'M', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', schema_version: 1 },
      entries: [{ lid: 't1', title: 'Task', body: JSON.stringify({ status: 'open', description: 'x' }), archetype: 'todo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }],
      relations: [], revisions: [], assets: {},
    };
    render(baseState(c1, 't1'), root);
    expect(root.querySelector('.pkc-todo-status-badge')?.getAttribute('data-pkc-todo-status')).toBe('open');

    // QUICK_UPDATE_ENTRY 相当: 新 container + 新 entry オブジェクト(status done)。
    const c2: Container = {
      ...c1,
      entries: [{ ...c1.entries[0]!, body: JSON.stringify({ status: 'done', description: 'x' }) }],
    };
    render(baseState(c2, 't1'), root);
    expect(root.querySelector('.pkc-todo-status-badge')?.getAttribute('data-pkc-todo-status')).toBe('done');
  });

  it('reports the cost table + per-row scaling (the localization basis)', () => {
    // eslint-disable-next-line no-console
    console.log('\n=== L1 #768 full-render cost (happy-dom; wall-clock is indicative only) ===');
    // eslint-disable-next-line no-console
    console.log('   N     total   sidebar   center   rows    sidebar/total   ms');
    for (const n of sizes) {
      const m = measured[n];
      if (!m) continue;
      const frac = ((m.sidebar / m.total) * 100).toFixed(0);
      // eslint-disable-next-line no-console
      console.log(
        `${String(n).padStart(5)}  ${String(m.total).padStart(7)}  ${String(m.sidebar).padStart(7)}  ${String(m.center).padStart(6)}  ${String(m.rows).padStart(5)}  ${frac.padStart(12)}%  ${m.ms.toFixed(1).padStart(6)}`,
      );
    }
    // Sidebar nodes per entry should be roughly stable across scales —
    // confirming the O(N) growth is the per-row cost, not a fixed
    // overhead. (Center is bounded by the single selected entry.)
    const perRowSmall = measured[100]!.sidebar / 100;
    const perRowLarge = measured[2000]!.sidebar / 2000;
    expect(perRowLarge).toBeGreaterThan(perRowSmall * 0.5);
    expect(perRowLarge).toBeLessThan(perRowSmall * 2);
  });
});
