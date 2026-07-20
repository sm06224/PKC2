/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, __resetEntryRowMemoForTest } from '@adapter/ui/renderer';
import { computeRenderScope } from '@adapter/ui/render-scope';
import { getTodosByDate, __resetFilterIndexCacheForTest } from '@adapter/ui/filter-cache';
import { createInitialState, reduce } from '@adapter/state/app-state';
import type { AppState } from '@adapter/state/app-state';
import type { Container } from '@core/model/container';

/**
 * #938 R8 — `'calendar-only'` render scope + todo→date memo。
 *
 * 月送り(SET_CALENDAR_MONTH)は従来 'full' に落ち、月を 1 つ進める
 * だけで O(N) sidebar tree を含む全 shell を wipe+rebuild していた
 * (refinement-research-2026-07 §3「calendar 月送りが full scope +
 * 全 entry walk」)。
 *
 * Pinned invariants(assets-only テストと同 doctrine):
 *   - narrow path の結果 DOM は同 state の full render と等価
 *   - sidebar element は identity 維持(rebuild されない)= the win
 *   - calendar grid は新しい月に更新される
 *   - calendar view 以外 / co-varying delta は 'full'(保守的)
 *   - todo→date map は container ref + showArchived で memoize
 */

const T = '2026-07-01T00:00:00.000Z';

function fixture(): Container {
  return {
    meta: { container_id: 'cal', title: 't', created_at: T, updated_at: T, schema_version: 1 },
    entries: [
      { lid: 'e1', title: 'Plain', archetype: 'text', body: 'x', created_at: T, updated_at: T },
      {
        lid: 'td1',
        title: 'July todo',
        archetype: 'todo',
        body: JSON.stringify({ status: 'open', description: 'd', date: '2026-07-15' }),
        created_at: T,
        updated_at: T,
      },
      {
        lid: 'td2',
        title: 'August todo',
        archetype: 'todo',
        body: JSON.stringify({ status: 'open', description: 'd', date: '2026-08-03' }),
        created_at: T,
        updated_at: T,
      },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };
}

function calendarState(container: Container): AppState {
  const init = reduce(createInitialState(), { type: 'SYS_INIT_COMPLETE', container }).state;
  const cal = reduce(init, { type: 'SET_VIEW_MODE', mode: 'calendar' }).state;
  return reduce(cal, { type: 'SET_CALENDAR_MONTH', year: 2026, month: 7 }).state;
}

function nextMonth(state: AppState): AppState {
  return reduce(state, { type: 'SET_CALENDAR_MONTH', year: 2026, month: 8 }).state;
}

/** Attribute-order-insensitive structural serialization(assets-only test の mirror)。 */
function normalize(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const attrs = [...el.attributes]
    .map((a) => `${a.name}=${JSON.stringify(a.value)}`)
    .sort()
    .join(' ');
  const kids = [...el.childNodes]
    .map((n) =>
      n.nodeType === 1
        ? normalize(n as Element)
        : n.nodeType === 3
          ? JSON.stringify(n.textContent)
          : '',
    )
    .join('');
  return `<${tag} ${attrs}>${kids}</${tag}>`;
}

let root: HTMLElement;

beforeEach(() => {
  __resetEntryRowMemoForTest();
  __resetFilterIndexCacheForTest();
  root = document.createElement('div');
  root.id = 'pkc-root';
  document.body.appendChild(root);
  return () => {
    root.remove();
    __resetEntryRowMemoForTest();
    __resetFilterIndexCacheForTest();
  };
});

describe('render scope=calendar-only — detection', () => {
  it('calendar view の SET_CALENDAR_MONTH は "calendar-only"', () => {
    const prev = calendarState(fixture());
    const next = nextMonth(prev);
    expect(computeRenderScope(next, prev)).toBe('calendar-only');
  });

  it('detail view では月フィールドが変わっても "full"(保守的)', () => {
    const init = reduce(createInitialState(), { type: 'SYS_INIT_COMPLETE', container: fixture() }).state;
    const withMonth = reduce(init, { type: 'SET_CALENDAR_MONTH', year: 2026, month: 7 }).state;
    const next = reduce(withMonth, { type: 'SET_CALENDAR_MONTH', year: 2026, month: 8 }).state;
    expect(withMonth.viewMode).toBe('detail');
    expect(computeRenderScope(next, withMonth)).toBe('full');
  });

  it('co-varying delta(月 + searchQuery)は "full"', () => {
    const prev = calendarState(fixture());
    let next = nextMonth(prev);
    next = reduce(next, { type: 'SET_SEARCH_QUERY', query: 'x' }).state;
    expect(computeRenderScope(next, prev)).toBe('full');
  });
});

describe('render scope=calendar-only — DOM integration', () => {
  it('sidebar は identity 維持、calendar grid は新しい月へ、結果は full render と等価', () => {
    const prev = calendarState(fixture());
    render(prev, root, null); // baseline full render

    const sidebarBefore = root.querySelector('[data-pkc-region="sidebar"]');
    expect(sidebarBefore).not.toBeNull();
    expect(root.querySelector('.pkc-calendar-title')?.textContent).toContain('July');
    // July の cell に td1 が出ている
    expect(root.querySelector('[data-pkc-date="2026-07-15"]')?.textContent).toContain('July todo');

    const next = nextMonth(prev);
    render(next, root, prev); // scope=calendar-only path

    // sidebar は rebuild されていない(同一 node)
    expect(root.querySelector('[data-pkc-region="sidebar"]')).toBe(sidebarBefore);
    // calendar は August に切替わり、August の todo が出る
    expect(root.querySelector('.pkc-calendar-title')?.textContent).toContain('August');
    expect(root.querySelector('[data-pkc-date="2026-08-03"]')?.textContent).toContain('August todo');
    expect(root.querySelector('[data-pkc-date="2026-07-15"]')).toBeNull();

    // 等価性: narrow path の DOM == 同 state の full render
    const narrowHtml = normalize(root);
    const fullRoot = document.createElement('div');
    fullRoot.id = 'pkc-root';
    document.body.appendChild(fullRoot);
    render(next, fullRoot, null);
    expect(narrowHtml).toBe(normalize(fullRoot));
    fullRoot.remove();
  });
});

describe('todo→date memo(getTodosByDate)', () => {
  it('同 container ref + 同 showArchived は同一 object を返す(O(1) hit)', () => {
    const c = fixture();
    const a = getTodosByDate(c, false);
    const b = getTodosByDate(c, false);
    expect(b).toBe(a);
    expect(a['2026-07-15']![0]!.entry.lid).toBe('td1');
  });

  it('showArchived の flip / container ref 変化で再計算される', () => {
    const c = fixture();
    const base = getTodosByDate(c, false);
    const archived = getTodosByDate(c, true);
    expect(archived).not.toBe(base);
    // ref を戻すと再計算(単一 slot cache)だが内容は等価
    const again = getTodosByDate(c, false);
    expect(again).toEqual(base);
    // container の immutable 更新 → 新しい map
    const c2: Container = { ...c, entries: [...c.entries] };
    const next = getTodosByDate(c2, false);
    expect(next).not.toBe(again);
    expect(next).toEqual(again);
  });

  it('archived todo は showArchived=false で除外、true で含まれる', () => {
    const c = fixture();
    const withArchived: Container = {
      ...c,
      entries: [
        ...c.entries,
        {
          lid: 'td3',
          title: 'Archived todo',
          archetype: 'todo',
          body: JSON.stringify({ status: 'done', description: 'd', date: '2026-07-20', archived: true }),
          created_at: T,
          updated_at: T,
        },
      ],
    };
    expect(getTodosByDate(withArchived, false)['2026-07-20']).toBeUndefined();
    expect(getTodosByDate(withArchived, true)['2026-07-20']![0]!.entry.lid).toBe('td3');
  });
});
