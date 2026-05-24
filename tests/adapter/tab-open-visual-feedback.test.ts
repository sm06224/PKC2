/**
 * @vitest-environment happy-dom
 *
 * pgc-137 wave-δ #11(user bug report 2026-05-24):
 * 「センターペインでタブが開く時と開かない時の視覚効果が無いように
 *  感じる、重複 Open を意識づけしたい」
 *
 * 2 つの module-local feedback state を tab-strip.ts に追加:
 *   - justOpenedLid:`recordTabOpen` が新規 tab を push した時に立つ。
 *     buildTabStripElement が `data-pkc-just-opened="true"` 付与、
 *     400ms 後に clear。CSS slide-in animation。
 *   - justFocusedLid:`recordTabOpen` が既存 tab に re-focus した時に立つ。
 *     `data-pkc-just-focused="true"` 付与、250ms 後に clear。CSS pulse。
 *
 * 2 つの異なる animation により、user は新規 open vs 重複 re-focus を
 * 視覚で識別可能。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  recordTabOpen,
  buildTabStripElement,
  resetTabState,
  resetTabOpenFeedback,
  getJustOpenedLid,
  getJustFocusedLid,
} from '@adapter/ui/tab-strip';
import type { AppState } from '@adapter/state/app-state';
import type { Container } from '@core/model/container';

const TS = '2026-01-01T00:00:00Z';

function makeContainer(): Container {
  return {
    meta: { container_id: 't', title: 'T', created_at: TS, updated_at: TS, schema_version: 1 },
    entries: [
      { lid: 'e1', title: 'Entry 1', body: 'x', archetype: 'text', created_at: TS, updated_at: TS },
      { lid: 'e2', title: 'Entry 2', body: 'x', archetype: 'text', created_at: TS, updated_at: TS },
    ],
    relations: [], revisions: [], assets: {},
  };
}

function makeState(c: Container | null, selectedLid: string | null = null): AppState {
  return {
    phase: 'ready',
    container: c,
    selectedLid,
    editingLid: null,
    viewMode: 'detail',
    searchQuery: '',
    sidebarFilerQuery: null,
    tagFilter: new Set(),
    multiSelectedLids: [],
    readonly: false,
    lightSource: null,
    childWindowLids: [],
    navHistory: [],
    navIndex: -1,
    calendarYear: 2026,
    calendarMonth: 0,
    showArchived: false,
    metaPaneMode: 'all',
  } as unknown as AppState;
}

describe('pgc-137 tab open visual feedback', () => {
  beforeEach(() => {
    resetTabState();
    resetTabOpenFeedback();
  });

  afterEach(() => {
    resetTabState();
    resetTabOpenFeedback();
  });

  it('新規 tab open:justOpenedLid set + render で data-pkc-just-opened="true"', () => {
    const c = makeContainer();
    recordTabOpen('e1', c);
    expect(getJustOpenedLid()).toBe('e1');
    expect(getJustFocusedLid()).toBeNull();
    const strip = buildTabStripElement(makeState(c, 'e1'));
    const tab = strip.querySelector<HTMLElement>('[data-pkc-lid="e1"]');
    expect(tab?.getAttribute('data-pkc-just-opened')).toBe('true');
    expect(tab?.getAttribute('data-pkc-just-focused')).toBeNull();
  });

  it('既存 tab re-focus:justFocusedLid set + data-pkc-just-focused="true"', () => {
    const c = makeContainer();
    recordTabOpen('e1', c); // 新規 open
    resetTabOpenFeedback(); // 1 回目の opened state を reset
    recordTabOpen('e1', c); // 2 回目 → re-focus
    expect(getJustFocusedLid()).toBe('e1');
    expect(getJustOpenedLid()).toBeNull();
    const strip = buildTabStripElement(makeState(c, 'e1'));
    const tab = strip.querySelector<HTMLElement>('[data-pkc-lid="e1"]');
    expect(tab?.getAttribute('data-pkc-just-focused')).toBe('true');
    expect(tab?.getAttribute('data-pkc-just-opened')).toBeNull();
  });

  it('複数 tab open → 最新の lid だけが justOpenedLid', () => {
    const c = makeContainer();
    recordTabOpen('e1', c);
    recordTabOpen('e2', c);
    expect(getJustOpenedLid()).toBe('e2');
    const strip = buildTabStripElement(makeState(c, 'e2'));
    expect(strip.querySelector('[data-pkc-lid="e1"]')?.getAttribute('data-pkc-just-opened')).toBeNull();
    expect(strip.querySelector('[data-pkc-lid="e2"]')?.getAttribute('data-pkc-just-opened')).toBe('true');
  });

  it('400ms 後に justOpenedLid が clear される', async () => {
    const c = makeContainer();
    recordTabOpen('e1', c);
    expect(getJustOpenedLid()).toBe('e1');
    await new Promise((resolve) => setTimeout(resolve, 450));
    expect(getJustOpenedLid()).toBeNull();
  });

  it('250ms 後に justFocusedLid が clear される', async () => {
    const c = makeContainer();
    recordTabOpen('e1', c);
    resetTabOpenFeedback();
    recordTabOpen('e1', c);
    expect(getJustFocusedLid()).toBe('e1');
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(getJustFocusedLid()).toBeNull();
  });

  it('連続 recordTabOpen 同 lid:timer が refresh される(連打追従)', async () => {
    const c = makeContainer();
    recordTabOpen('e1', c);
    // 200ms 待った後にもう一度同 lid open
    await new Promise((resolve) => setTimeout(resolve, 200));
    recordTabOpen('e1', c); // re-focus
    // 200ms 経過済 + new 250ms timer = 元 timer 効かず
    await new Promise((resolve) => setTimeout(resolve, 100));
    // 100ms 経過時点では新 timer の 250ms 内なので focused 継続
    expect(getJustFocusedLid()).toBe('e1');
  });

  it('別 lid に open すると justOpenedLid が切替わる', () => {
    const c = makeContainer();
    recordTabOpen('e1', c);
    expect(getJustOpenedLid()).toBe('e1');
    recordTabOpen('e2', c);
    expect(getJustOpenedLid()).toBe('e2');
  });

  it('resetTabOpenFeedback() で両 state が 即座に clear', () => {
    const c = makeContainer();
    recordTabOpen('e1', c);
    recordTabOpen('e1', c); // re-focus
    expect(getJustFocusedLid()).toBe('e1');
    resetTabOpenFeedback();
    expect(getJustOpenedLid()).toBeNull();
    expect(getJustFocusedLid()).toBeNull();
  });
});
