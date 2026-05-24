/**
 * @vitest-environment happy-dom
 *
 * pgc-180 wave-α' #3(v3 統合 master G8、handoff §3.5「Activity Bar tab
 * badge」):Activity Bar の Outline / Relations / Pinned 3 tab に count
 * badge を visual indicator として重ねる。`shell.activity_bar_badges_
 * enabled` Tier 0 flag default OFF で gate、ON + state 指定時のみ実値。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { __resetRegistry, __resetUrlCache } from '@adapter/flags';
import {
  buildActivityBarElement,
  computeBadges,
  resetActivityBarState,
} from '@adapter/ui/activity-bar';
import { resetTabState, openViewTab, recordTabOpen, togglePinTab, viewTabLid } from '@adapter/ui/tab-strip';
import type { AppState } from '@adapter/state/app-state';
import type { Container } from '@core/model/container';

const TS = '2026-05-24T00:00:00Z';

function makeContainer(entries?: Container['entries'], relations?: Container['relations']): Container {
  return {
    meta: { container_id: 'c1', title: 'C', created_at: TS, updated_at: TS, schema_version: 1 },
    entries: entries ?? [
      { lid: 'e1', title: 'X', body: '# H1\n## H2\n### H3\nbody text\n', archetype: 'text', created_at: TS, updated_at: TS },
    ],
    relations: relations ?? [],
    revisions: [],
    assets: {},
  };
}

function makeState(container: Container, selectedLid: string | null = null): AppState {
  return {
    phase: 'ready',
    container,
    selectedLid,
    editingLid: null,
    viewMode: 'detail',
    error: null,
  } as AppState;
}

function setFlag(badges: boolean): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('pkc-flag');
  if (badges) {
    url.searchParams.set('pkc-flag', 'shell.activity_bar_badges_enabled=1');
  }
  window.history.replaceState({}, '', url.toString());
  __resetUrlCache();
}

describe('pgc-180 Activity Bar tab badges', () => {
  beforeEach(() => {
    __resetRegistry();
    __resetUrlCache();
    resetActivityBarState();
    resetTabState();
  });

  afterEach(() => {
    setFlag(false);
    resetActivityBarState();
    resetTabState();
  });

  it('case 1: flag OFF だと computeBadges は全部 0(後方互換)', () => {
    setFlag(false);
    const state = makeState(makeContainer(), 'e1');
    const badges = computeBadges(state);
    expect(badges.outline).toBe(0);
    expect(badges.relations).toBe(0);
    expect(badges.pinned).toBe(0);
  });

  it('case 2: state 未指定だと全部 0(構造的 opt-in)', () => {
    setFlag(true);
    const badges = computeBadges(undefined);
    expect(badges.outline).toBe(0);
    expect(badges.relations).toBe(0);
    expect(badges.pinned).toBe(0);
  });

  it('case 3: flag ON + text entry の heading 数が outline badge に反映', () => {
    setFlag(true);
    const container = makeContainer([
      { lid: 'e1', title: 'X', body: '# H1\n## H2-1\n## H2-2\n### H3-1\nbody\n', archetype: 'text', created_at: TS, updated_at: TS },
    ]);
    const state = makeState(container, 'e1');
    const badges = computeBadges(state);
    expect(badges.outline).toBe(4); // H1 + 2 H2 + H3 = 4 headings
  });

  it('case 4: textlog archetype も outline badge を計算する', () => {
    setFlag(true);
    const container = makeContainer([
      { lid: 'e1', title: 'X', body: '# only h1\nlog entry\n', archetype: 'textlog', created_at: TS, updated_at: TS },
    ]);
    const state = makeState(container, 'e1');
    const badges = computeBadges(state);
    expect(badges.outline).toBe(1);
  });

  it('case 5: text / textlog 以外の archetype は outline badge 0', () => {
    setFlag(true);
    const container = makeContainer([
      { lid: 'e1', title: 'X', body: '{"status":"open","description":"# h1\\nbody"}', archetype: 'todo', created_at: TS, updated_at: TS },
    ]);
    const state = makeState(container, 'e1');
    const badges = computeBadges(state);
    expect(badges.outline).toBe(0);
  });

  it('case 6: outbound + inbound relation 数が relations badge に反映', () => {
    setFlag(true);
    const container = makeContainer(
      [
        { lid: 'e1', title: 'X', body: 'x', archetype: 'text', created_at: TS, updated_at: TS },
        { lid: 'e2', title: 'Y', body: 'y', archetype: 'text', created_at: TS, updated_at: TS },
        { lid: 'e3', title: 'Z', body: 'z', archetype: 'text', created_at: TS, updated_at: TS },
      ],
      [
        { id: 'r1', from: 'e1', to: 'e2', kind: 'semantic', created_at: TS, updated_at: TS },
        { id: 'r2', from: 'e1', to: 'e3', kind: 'structural', created_at: TS, updated_at: TS },
        { id: 'r3', from: 'e2', to: 'e1', kind: 'semantic', created_at: TS, updated_at: TS }, // inbound
      ],
    );
    const state = makeState(container, 'e1');
    const badges = computeBadges(state);
    expect(badges.relations).toBe(3); // 2 outbound + 1 inbound
  });

  it('case 7: relations 0 件なら badge 0', () => {
    setFlag(true);
    const state = makeState(makeContainer(), 'e1');
    const badges = computeBadges(state);
    expect(badges.relations).toBe(0);
  });

  it('case 8: pinned tab 数が pinned badge に反映(view tab 除外)', () => {
    setFlag(true);
    const container = makeContainer([
      { lid: 'e1', title: 'X', body: 'x', archetype: 'text', created_at: TS, updated_at: TS },
      { lid: 'e2', title: 'Y', body: 'y', archetype: 'text', created_at: TS, updated_at: TS },
    ]);
    recordTabOpen('e1', container);
    recordTabOpen('e2', container);
    togglePinTab('e1');
    openViewTab('calendar');
    togglePinTab(viewTabLid('calendar')); // view tab を pin しても badge は数えない
    const state = makeState(container, 'e1');
    const badges = computeBadges(state);
    expect(badges.pinned).toBe(1); // entry pin 1 件のみ、view tab pin は数えず
  });

  it('case 9: buildActivityBarElement(state) で flag ON 時 badge element が描画', () => {
    setFlag(true);
    const container = makeContainer([
      { lid: 'e1', title: 'X', body: '# A\n## B\n## C\n', archetype: 'text', created_at: TS, updated_at: TS },
    ]);
    const state = makeState(container, 'e1');
    const bar = buildActivityBarElement(state);
    document.body.appendChild(bar);
    const outlineBadge = bar.querySelector<HTMLElement>('button[data-pkc-activity-tab="outline"] .pkc-activity-bar-badge');
    expect(outlineBadge).not.toBeNull();
    expect(outlineBadge?.textContent).toBe('3');
    expect(outlineBadge?.getAttribute('aria-hidden')).toBe('true');
  });

  it('case 10: badge 値が 0 のとき element は非描画(visual noise 回避)', () => {
    setFlag(true);
    const state = makeState(makeContainer(), 'e1');
    const bar = buildActivityBarElement(state);
    const relationsBadge = bar.querySelector('button[data-pkc-activity-tab="relations"] .pkc-activity-bar-badge');
    expect(relationsBadge).toBeNull(); // relations 0 件、badge 非描画
    const pinnedBadge = bar.querySelector('button[data-pkc-activity-tab="pinned"] .pkc-activity-bar-badge');
    expect(pinnedBadge).toBeNull();
  });

  it('case 11: 99 超は "99+" 圧縮表示', () => {
    setFlag(true);
    // 100 heading の text entry
    const body = Array.from({ length: 100 }, (_, i) => `# H${i + 1}`).join('\n');
    const container = makeContainer([
      { lid: 'e1', title: 'X', body, archetype: 'text', created_at: TS, updated_at: TS },
    ]);
    const state = makeState(container, 'e1');
    const bar = buildActivityBarElement(state);
    const outlineBadge = bar.querySelector<HTMLElement>('button[data-pkc-activity-tab="outline"] .pkc-activity-bar-badge');
    expect(outlineBadge?.textContent).toBe('99+');
  });

  it('case 12: flag OFF だと buildActivityBarElement(state) でも badge 非描画', () => {
    setFlag(false);
    const container = makeContainer([
      { lid: 'e1', title: 'X', body: '# H1\n## H2\n', archetype: 'text', created_at: TS, updated_at: TS },
    ]);
    const state = makeState(container, 'e1');
    const bar = buildActivityBarElement(state);
    const anyBadge = bar.querySelector('.pkc-activity-bar-badge');
    expect(anyBadge).toBeNull();
  });

  it('case 13: button にも data-pkc-badge-count attr が立つ(CSS / test selector 用)', () => {
    setFlag(true);
    const container = makeContainer([
      { lid: 'e1', title: 'X', body: '# A\n', archetype: 'text', created_at: TS, updated_at: TS },
    ]);
    const state = makeState(container, 'e1');
    const bar = buildActivityBarElement(state);
    const outlineBtn = bar.querySelector<HTMLElement>('button[data-pkc-activity-tab="outline"]');
    expect(outlineBtn?.getAttribute('data-pkc-badge-count')).toBe('1');
    // 0 badge tab(relations / pinned)は attr 立たない
    const relationsBtn = bar.querySelector<HTMLElement>('button[data-pkc-activity-tab="relations"]');
    expect(relationsBtn?.getAttribute('data-pkc-badge-count')).toBeNull();
  });

  it('case 14: entry 未選択(selectedLid=null)で outline / relations は 0(safe-fail)', () => {
    setFlag(true);
    const state = makeState(makeContainer(), null);
    const badges = computeBadges(state);
    expect(badges.outline).toBe(0);
    expect(badges.relations).toBe(0);
  });

  it('case 15: Explorer badge は常に 0(設計対象外)、Search は pgc-200 で saved_searches、Recent は pgc-199 で navHistory', () => {
    setFlag(true);
    const container = makeContainer([
      { lid: 'e1', title: 'X', body: '# A\n## B\n', archetype: 'text', created_at: TS, updated_at: TS },
    ]);
    const state = makeState(container, 'e1');
    const badges = computeBadges(state);
    expect(badges.explorer).toBe(0);
    // saved_searches 無いなら search も 0
    expect(badges.search).toBe(0);
    // recent は navHistory 空(test では SELECT_ENTRY していない)なら 0
    expect(badges.recent).toBe(0);
  });

  // pgc-199 wave-α' #21:Recent badge — navHistory ベース dedup count

  it('case 16: pgc-199 navHistory に 3 unique entry あれば recent badge = 3', () => {
    setFlag(true);
    const container = makeContainer([
      { lid: 'e1', title: 'A', body: 'a', archetype: 'text', created_at: TS, updated_at: TS },
      { lid: 'e2', title: 'B', body: 'b', archetype: 'text', created_at: TS, updated_at: TS },
      { lid: 'e3', title: 'C', body: 'c', archetype: 'text', created_at: TS, updated_at: TS },
    ]);
    const state = makeState(container, 'e3');
    // navHistory に e1 → e2 → e3 を積む
    (state as { navHistory: string[] }).navHistory = ['e1', 'e2', 'e3'];
    const badges = computeBadges(state);
    expect(badges.recent).toBe(3);
  });

  it('case 17: pgc-199 navHistory 重複 lid は 1 件として count', () => {
    setFlag(true);
    const container = makeContainer([
      { lid: 'e1', title: 'A', body: 'a', archetype: 'text', created_at: TS, updated_at: TS },
      { lid: 'e2', title: 'B', body: 'b', archetype: 'text', created_at: TS, updated_at: TS },
    ]);
    const state = makeState(container, 'e1');
    // e1 → e2 → e1 → e2 → e1 = unique 2
    (state as { navHistory: string[] }).navHistory = ['e1', 'e2', 'e1', 'e2', 'e1'];
    const badges = computeBadges(state);
    expect(badges.recent).toBe(2);
  });

  it('case 18: pgc-199 削除済 lid(container に entry 無し)は skip', () => {
    setFlag(true);
    const container = makeContainer([
      { lid: 'e1', title: 'A', body: 'a', archetype: 'text', created_at: TS, updated_at: TS },
    ]);
    const state = makeState(container, 'e1');
    // e1(存在)+ e-deleted(container に無い)+ e1 = unique 1
    (state as { navHistory: string[] }).navHistory = ['e1', 'e-deleted', 'e1'];
    const badges = computeBadges(state);
    expect(badges.recent).toBe(1);
  });

  it('case 19: pgc-199 opaque archetype は recent badge から除外', () => {
    setFlag(true);
    const container = makeContainer([
      { lid: 'e1', title: 'A', body: 'a', archetype: 'text', created_at: TS, updated_at: TS },
      { lid: 'e2', title: 'O', body: 'o', archetype: 'opaque', created_at: TS, updated_at: TS },
    ]);
    const state = makeState(container, 'e1');
    (state as { navHistory: string[] }).navHistory = ['e1', 'e2'];
    const badges = computeBadges(state);
    expect(badges.recent).toBe(1); // e2 opaque は除外
  });

  // pgc-200 wave-α' polish #22:Search tab badge — saved_searches count

  it('case 20: pgc-200 saved_searches 3 件で search badge = 3', () => {
    setFlag(true);
    const container = makeContainer([
      { lid: 'e1', title: 'X', body: 'x', archetype: 'text', created_at: TS, updated_at: TS },
    ]);
    container.meta.saved_searches = [
      { id: 's1', name: 'Recent text', created_at: TS, archetypes: [], tags: [], searchQuery: '', sortKey: 'updated_at', sortDirection: 'desc', showArchived: false },
      { id: 's2', name: 'Todo open', created_at: TS, archetypes: ['todo'], tags: [], searchQuery: '', sortKey: 'updated_at', sortDirection: 'desc', showArchived: false },
      { id: 's3', name: 'Tagged rust', created_at: TS, archetypes: [], tags: ['rust'], searchQuery: '', sortKey: 'updated_at', sortDirection: 'desc', showArchived: false },
    ] as never;
    const state = makeState(container, 'e1');
    const badges = computeBadges(state);
    expect(badges.search).toBe(3);
  });

  it('case 21: pgc-200 saved_searches 未定義 / 空配列で search badge = 0', () => {
    setFlag(true);
    const container = makeContainer([
      { lid: 'e1', title: 'X', body: 'x', archetype: 'text', created_at: TS, updated_at: TS },
    ]);
    // saved_searches 未設定 → undefined
    const state = makeState(container, 'e1');
    const badges = computeBadges(state);
    expect(badges.search).toBe(0);
    // 空配列 → 0
    container.meta.saved_searches = [];
    const badges2 = computeBadges(state);
    expect(badges2.search).toBe(0);
  });
});
