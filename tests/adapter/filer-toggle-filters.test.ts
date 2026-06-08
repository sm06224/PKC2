/**
 * @vitest-environment happy-dom
 *
 * filer モード sidebar の ⚙ Filters disclosure(pgc-49)。
 *
 * pgc-46/47/48 で filer は global 検索 / archetype filter / color filter
 * を獲得した。pgc-49 は残る「検索オプション」── showArchived /
 * treeHideBuckets / searchHideBuckets / unreferencedAttachmentsOnly の
 * 4 toggle ── を tree sidebar と同一 semantics で filer に移植する
 * (user 指摘「ツリー表示の検索オプションが無くなっている / 機能ダウン
 * しすぎ」への対応)。disclosure 構築は tree と共有の
 * `renderAdvancedFiltersPanel` に集約済。
 *
 * reform-2026-05 Phase 8 順序性に従い、各 toggle の state mutation →
 * filer list(consumer)の表示要素数変化を end-to-end で assert する。
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

const T = '2026-05-20T00:00:00.000Z';

function todoBody(status: 'open' | 'done', archived = false): string {
  return JSON.stringify({ status, description: '', archived });
}
function attachmentBody(assetKey: string): string {
  return JSON.stringify({ name: `${assetKey}.png`, mime: 'image/png', size: 4, asset_key: assetKey });
}

/** root 直下に text 1 + open todo 1 + archived todo 1。bucket なし。 */
function archivedFixture(): Container {
  return {
    meta: { container_id: 'c-arch', title: 'Archived Fixture', created_at: T, updated_at: T, schema_version: 1 },
    entries: [
      { lid: 'note', title: 'Plain Note', archetype: 'text', body: 'plain text', created_at: T, updated_at: T },
      { lid: 'opentask', title: 'Open Task', archetype: 'todo', body: todoBody('open'), created_at: T, updated_at: T },
      { lid: 'archtask', title: 'Archived Task', archetype: 'todo', body: todoBody('done', true), created_at: T, updated_at: T },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };
}

/** root ─ note / ASSETS(─ snap)/ TODOS(─ task)。auto-bucket folder 込み。 */
function bucketFixture(): Container {
  return {
    meta: { container_id: 'c-bkt', title: 'Bucket Fixture', created_at: T, updated_at: T, schema_version: 1 },
    entries: [
      { lid: 'note', title: 'Note', archetype: 'text', body: 'hi', created_at: T, updated_at: T },
      { lid: 'assets', title: 'ASSETS', archetype: 'folder', body: '', created_at: T, updated_at: T },
      { lid: 'snap', title: 'snap.png', archetype: 'attachment', body: attachmentBody('k-snap'), created_at: T, updated_at: T },
      { lid: 'todos', title: 'TODOS', archetype: 'folder', body: '', created_at: T, updated_at: T },
      { lid: 'task', title: 'Buy milk', archetype: 'todo', body: todoBody('open'), created_at: T, updated_at: T },
    ],
    relations: [
      { id: 'r1', from: 'assets', to: 'snap', kind: 'structural', created_at: T, updated_at: T },
      { id: 'r2', from: 'todos', to: 'task', kind: 'structural', created_at: T, updated_at: T },
    ],
    revisions: [],
    assets: { 'k-snap': '' },
  };
}

/** root 直下に text(att-keep を参照)+ 参照済 attachment + 未参照 attachment。 */
function attachmentFixture(): Container {
  return {
    meta: { container_id: 'c-att', title: 'Attachment Fixture', created_at: T, updated_at: T, schema_version: 1 },
    entries: [
      { lid: 'note', title: 'Note', archetype: 'text', body: 'see [pic](entry:att-keep)', created_at: T, updated_at: T },
      { lid: 'att-keep', title: 'kept.png', archetype: 'attachment', body: attachmentBody('ast-keep'), created_at: T, updated_at: T },
      { lid: 'att-drop', title: 'orphan.png', archetype: 'attachment', body: attachmentBody('ast-drop'), created_at: T, updated_at: T },
    ],
    relations: [],
    revisions: [],
    assets: { 'ast-keep': '', 'ast-drop': '' },
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

/** filer list の実 entry item(nav-up は data-pkc-draggable を持たないので除外)。 */
function filerLids(): string[] {
  return Array.from(
    filerSidebar().querySelectorAll<HTMLElement>(
      '.pkc-sidebar-filer-item[data-pkc-draggable]',
    ),
  ).map((el) => el.getAttribute('data-pkc-lid')!);
}

function disclosure(): HTMLDetailsElement | null {
  return filerSidebar().querySelector<HTMLDetailsElement>(
    'details[data-pkc-region="advanced-filters"]',
  );
}

// ── ① ⚙ Filters disclosure の出し分け ────────────────────────────────
describe('filer ⚙ Filters disclosure の描画 (pgc-49)', () => {
  it('archived todo があると filer に ⚙ Filters disclosure + show-archived toggle が出る', () => {
    setup(archivedFixture());
    const d = disclosure();
    expect(d).not.toBeNull();
    expect(d!.querySelector('[data-pkc-region="show-archived-toggle"]')).not.toBeNull();
  });

  it('togglable な要素が何も無ければ disclosure は出ない', () => {
    setup({
      meta: { container_id: 'c-bare', title: 'Bare', created_at: T, updated_at: T, schema_version: 1 },
      entries: [
        { lid: 'note', title: 'Note', archetype: 'text', body: 'hi', created_at: T, updated_at: T },
      ],
      relations: [],
      revisions: [],
      assets: {},
    });
    expect(disclosure()).toBeNull();
  });

  it('attachment があると unreferenced toggle が disclosure 内に入る', () => {
    setup(attachmentFixture());
    const d = disclosure();
    expect(d).not.toBeNull();
    expect(d!.querySelector('[data-pkc-region="unreferenced-attachments-toggle"]')).not.toBeNull();
  });

  it('bucket folder があると tree-hide-buckets toggle が disclosure 内に入る', () => {
    setup(bucketFixture());
    const d = disclosure();
    expect(d).not.toBeNull();
    expect(d!.querySelector('[data-pkc-region="tree-hide-buckets-toggle"]')).not.toBeNull();
  });

  it('summary click で TOGGLE_ADVANCED_FILTERS、open 状態は再 render を跨いで維持', () => {
    const d = setup(archivedFixture());
    expect(d.getState().advancedFiltersOpen ?? false).toBe(false);
    const summary = disclosure()!.querySelector<HTMLElement>('summary')!;
    summary.click();
    expect(d.getState().advancedFiltersOpen).toBe(true);
    expect(disclosure()!.hasAttribute('open')).toBe(true);
    // 無関係な dispatch を挟んでも open は残る。
    d.dispatch({ type: 'SET_SIDEBAR_FILER_QUERY', query: 'x' });
    render(d.getState(), root);
    expect(disclosure()!.hasAttribute('open')).toBe(true);
  });
});

// ── ② showArchived 順序性(folder navigation mode)──────────────────
describe('filer showArchived 順序性 / folder-nav (pgc-49)', () => {
  it('default では archived todo は filer list に出ない', () => {
    setup(archivedFixture());
    const lids = filerLids();
    expect(lids).toContain('note');
    expect(lids).toContain('opentask');
    expect(lids).not.toContain('archtask');
  });

  it('TOGGLE_SHOW_ARCHIVED 後に archived todo が filer list へ出現する', () => {
    const d = setup(archivedFixture());
    d.dispatch({ type: 'TOGGLE_SHOW_ARCHIVED' });
    render(d.getState(), root);
    expect(filerLids()).toContain('archtask');
  });

  it('再 TOGGLE_SHOW_ARCHIVED で archived todo が再び消える', () => {
    const d = setup(archivedFixture());
    d.dispatch({ type: 'TOGGLE_SHOW_ARCHIVED' });
    render(d.getState(), root);
    d.dispatch({ type: 'TOGGLE_SHOW_ARCHIVED' });
    render(d.getState(), root);
    expect(filerLids()).not.toContain('archtask');
  });

  it('show-archived checkbox の実 click(consumer 経路)で archived 表示が切替わる', () => {
    setup(archivedFixture());
    const checkbox = filerSidebar().querySelector<HTMLInputElement>(
      'input[data-pkc-action="toggle-show-archived"]',
    );
    expect(checkbox).not.toBeNull();
    expect(checkbox!.checked).toBe(false);
    expect(filerLids()).not.toContain('archtask');
    checkbox!.click();
    expect(filerLids()).toContain('archtask');
  });
});

// ── ③ showArchived 順序性(検索 mode)────────────────────────────────
describe('filer showArchived 順序性 / 検索 mode (pgc-49)', () => {
  it('検索 mode でも default では archived todo は検索結果から除外される', () => {
    const d = setup(archivedFixture());
    d.dispatch({ type: 'SET_SIDEBAR_FILER_QUERY', query: 'Task' });
    render(d.getState(), root);
    const lids = filerLids();
    expect(lids).toContain('opentask');
    expect(lids).not.toContain('archtask');
  });

  it('showArchived ON なら検索結果にも archived todo が含まれる', () => {
    const d = setup(archivedFixture());
    d.dispatch({ type: 'TOGGLE_SHOW_ARCHIVED' });
    d.dispatch({ type: 'SET_SIDEBAR_FILER_QUERY', query: 'Task' });
    render(d.getState(), root);
    const lids = filerLids();
    expect(lids).toContain('opentask');
    expect(lids).toContain('archtask');
  });
});

// ── ④ treeHideBuckets 順序性 ─────────────────────────────────────────
describe('filer treeHideBuckets 順序性 (pgc-49)', () => {
  it('default では ASSETS / TODOS bucket folder が filer root に出ない', () => {
    setup(bucketFixture());
    const lids = filerLids();
    expect(lids).toContain('note');
    expect(lids).not.toContain('assets');
    expect(lids).not.toContain('todos');
  });

  it('TOGGLE_TREE_HIDE_BUCKETS 後に bucket folder が filer root へ出現する', () => {
    const d = setup(bucketFixture());
    d.dispatch({ type: 'TOGGLE_TREE_HIDE_BUCKETS' });
    render(d.getState(), root);
    const lids = filerLids();
    expect(lids).toContain('assets');
    expect(lids).toContain('todos');
  });

  it('bucket folder へ navigate-in すれば treeHideBuckets ON でも中身が見える', () => {
    // selectedLid が bucket folder のとき scopeInBucket exception が
    // 効き、view が空にならない(navigate-in を尊重)。
    const d = setup(bucketFixture());
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'assets' });
    render(d.getState(), root);
    expect(d.getState().treeHideBuckets ?? true).toBe(true);
    expect(filerLids()).toContain('snap');
  });
});

// ── ⑤ unreferencedAttachmentsOnly 順序性 ─────────────────────────────
describe('filer unreferenced lens 順序性 (pgc-49)', () => {
  it('TOGGLE_UNREFERENCED で未参照 attachment のみの flat global list へ切替わる', () => {
    const d = setup(attachmentFixture());
    d.dispatch({ type: 'TOGGLE_UNREFERENCED_ATTACHMENTS_FILTER' });
    render(d.getState(), root);
    const lids = filerLids();
    expect(lids).toContain('att-drop');
    expect(lids).not.toContain('att-keep');
    expect(lids).not.toContain('note');
  });
});

// ── ⑥ searchHideBuckets 順序性 ───────────────────────────────────────
describe('filer searchHideBuckets 順序性 (pgc-49)', () => {
  it('検索中 bucket 直下 entry は default で除外、TOGGLE_SEARCH_HIDE_BUCKETS で復帰', () => {
    const d = setup(bucketFixture());
    // tree-hide を先に外し、search-hide だけを残る gate にする。
    d.dispatch({ type: 'TOGGLE_TREE_HIDE_BUCKETS' });
    d.dispatch({ type: 'SET_SIDEBAR_FILER_QUERY', query: 'snap' });
    render(d.getState(), root);
    expect(filerLids()).not.toContain('snap');
    // 検索中なので search-hide-buckets toggle が現れる。
    expect(
      disclosure()!.querySelector('[data-pkc-region="search-hide-buckets-toggle"]'),
    ).not.toBeNull();

    d.dispatch({ type: 'TOGGLE_SEARCH_HIDE_BUCKETS' });
    render(d.getState(), root);
    expect(filerLids()).toContain('snap');
  });
});
