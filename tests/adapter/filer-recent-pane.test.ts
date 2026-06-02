/**
 * @vitest-environment happy-dom
 *
 * filer モード sidebar の Recent Entries Pane(pgc-50)。
 *
 * pgc-46〜49 で filer は tree 同等の検索オプションを獲得した。pgc-50 は
 * 残る pane の 1 つ ── tree sidebar の Recent Entries Pane ── を filer
 * へ移植する。`renderRecentEntriesPane` は `updated_at` desc の derived-
 * only ビューで query coupling を持たないため、tree と同一 helper を
 * filer でもそのまま再利用できる。
 *
 * reform-2026-05 Phase 8 順序性に従い、pane 開閉 toggle と recent item
 * click の state mutation → consumer DOM 変化を end-to-end で assert する。
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
import type { Entry } from '@core/model/record';

/** updated_at が昇順に並ぶ text entry n 件(recent 順は逆順になる)。 */
function makeContainer(n: number): Container {
  const entries: Entry[] = [];
  for (let i = 1; i <= n; i++) {
    const ts = `2026-05-${String(i).padStart(2, '0')}T00:00:00.000Z`;
    entries.push({
      lid: `e${i}`,
      title: `Entry ${i}`,
      body: 'body',
      archetype: 'text',
      created_at: ts,
      updated_at: ts,
    });
  }
  return {
    meta: { container_id: 'c', title: 'T', created_at: '2026-05-01T00:00:00.000Z', updated_at: '2026-05-01T00:00:00.000Z', schema_version: 1 },
    entries,
    relations: [],
    revisions: [],
    assets: {},
  };
}

let root: HTMLElement;
let cleanup: (() => void) | undefined;

beforeEach(() => {
  __resetRegistry();
  __resetUrlCache();
  setContainerFlagSource({ 'sidebar.mode': 'filer' });
  root = document.createElement('div');
  root.id = 'pkc-root';
  document.body.appendChild(root);
});

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  root.remove();
});

function setup(container: Container) {
  const dispatcher = createDispatcher();
  dispatcher.onState((state) => render(state, root));
  dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });
  render(dispatcher.getState(), root);
  cleanup = bindActions(root, dispatcher);
  return dispatcher;
}

function filerSidebar(): HTMLElement {
  const el = root.querySelector<HTMLElement>(
    '[data-pkc-region="sidebar"][data-pkc-sidebar-mode="filer"]',
  );
  if (!el) throw new Error('filer sidebar not rendered');
  return el;
}

function recentPane(): HTMLDetailsElement | null {
  return filerSidebar().querySelector<HTMLDetailsElement>(
    'details[data-pkc-region="recent-entries"]',
  );
}

function recentLids(): string[] {
  const pane = recentPane();
  if (!pane) return [];
  return Array.from(
    pane.querySelectorAll<HTMLElement>('.pkc-recent-item[data-pkc-lid]'),
  ).map((el) => el.getAttribute('data-pkc-lid')!);
}

describe('filer Recent Entries Pane の描画 (pgc-50)', () => {
  it('user entry があると filer に recent pane が出る', () => {
    setup(makeContainer(3));
    expect(recentPane()).not.toBeNull();
  });

  it('user entry が無ければ recent pane は出ない', () => {
    setup({
      meta: { container_id: 'c', title: 'T', created_at: '2026-05-01T00:00:00.000Z', updated_at: '2026-05-01T00:00:00.000Z', schema_version: 1 },
      entries: [],
      relations: [],
      revisions: [],
      assets: {},
    });
    expect(recentPane()).toBeNull();
  });

  it('recent pane は default で折りたたみ(open 属性なし)', () => {
    setup(makeContainer(3));
    expect(recentPane()!.hasAttribute('open')).toBe(false);
  });

  it('summary は Recent (件数) を表示する', () => {
    setup(makeContainer(3));
    const summary = recentPane()!.querySelector('summary')!;
    expect(summary.textContent).toContain('Recent (3)');
  });

  it('entry を updated_at desc で並べる(最新が先頭)', () => {
    setup(makeContainer(4));
    // e1<e2<e3<e4 の updated_at → recent は e4,e3,e2,e1。
    expect(recentLids()).toEqual(['e4', 'e3', 'e2', 'e1']);
  });

  it('recent item は最大 10 件まで(12 entry → 10 表示)', () => {
    setup(makeContainer(12));
    expect(recentLids()).toHaveLength(10);
  });
});

describe('filer Recent Entries Pane の順序性 (pgc-50)', () => {
  it('TOGGLE_RECENT_PANE で pane の open 状態が反転する', () => {
    const d = setup(makeContainer(3));
    expect(recentPane()!.hasAttribute('open')).toBe(false);
    d.dispatch({ type: 'TOGGLE_RECENT_PANE' });
    render(d.getState(), root);
    expect(recentPane()!.hasAttribute('open')).toBe(true);
    d.dispatch({ type: 'TOGGLE_RECENT_PANE' });
    render(d.getState(), root);
    expect(recentPane()!.hasAttribute('open')).toBe(false);
  });

  it('summary の実 click(consumer 経路)で pane が開く', () => {
    setup(makeContainer(3));
    const summary = recentPane()!.querySelector<HTMLElement>(
      'summary[data-pkc-action="toggle-recent-pane"]',
    );
    expect(summary).not.toBeNull();
    summary!.click();
    expect(recentPane()!.hasAttribute('open')).toBe(true);
  });

  it('recent item click で selectedLid が変わり data-pkc-selected が付く', () => {
    const d = setup(makeContainer(4));
    const item = recentPane()!.querySelector<HTMLElement>(
      '.pkc-recent-item[data-pkc-lid="e2"]',
    );
    expect(item).not.toBeNull();
    item!.click();
    expect(d.getState().selectedLid).toBe('e2');
    const selected = recentPane()!.querySelector(
      '.pkc-recent-item[data-pkc-lid="e2"][data-pkc-selected="true"]',
    );
    expect(selected).not.toBeNull();
  });

  it('filer の検索 mode 中でも recent pane は出続ける(filtering と独立)', () => {
    const d = setup(makeContainer(4));
    d.dispatch({ type: 'SET_SIDEBAR_FILER_QUERY', query: 'Entry 3' });
    render(d.getState(), root);
    // 検索結果は絞られても recent pane は derived-only なので残る。
    expect(recentPane()).not.toBeNull();
    expect(recentLids()).toHaveLength(4);
  });
});
