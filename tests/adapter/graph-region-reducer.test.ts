import { describe, it, expect } from 'vitest';
import type { Container } from '@core/model/container';
import type { Entry } from '@core/model/record';
import { reduce, createInitialState } from '@adapter/state/app-state';
import type { AppState } from '@adapter/state/app-state';

/**
 * Graph region-slice reducer tests (PR-E G8 後半).
 *
 * Two new actions:
 *   - TOGGLE_GRAPH_REGION_SELECT_MODE — flips graphRegionSelectMode,
 *     clears selectedLids when toggling OFF.
 *   - SET_GRAPH_REGION_SELECTED_LIDS — replaces selectedLids.
 *
 * reform-2026-05 §6 順序性:state mutation だけでなく consumer
 * (renderer が読む field)が想定通りに変わることまで verify。
 */

function mkContainer(entries: Entry[]): Container {
  return {
    meta: {
      container_id: 'c1',
      title: 'test',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      schema_version: 1,
    },
    entries,
    relations: [],
    revisions: [],
    assets: {},
  };
}

function readyState(overrides: Partial<AppState> = {}): AppState {
  return {
    ...createInitialState(),
    phase: 'ready',
    container: mkContainer([]),
    ...overrides,
  };
}

describe('graph region-slice reducer', () => {
  it('TOGGLE_GRAPH_REGION_SELECT_MODE: undefined → true', () => {
    const before = readyState();
    expect(before.graphRegionSelectMode).toBeUndefined();
    const { state: after } = reduce(before, { type: 'TOGGLE_GRAPH_REGION_SELECT_MODE' });
    expect(after.graphRegionSelectMode).toBe(true);
  });

  it('TOGGLE_GRAPH_REGION_SELECT_MODE: true → false also clears selected lids', () => {
    const before = readyState({
      graphRegionSelectMode: true,
      graphRegionSelectedLids: ['a', 'b'],
    });
    const { state: after } = reduce(before, { type: 'TOGGLE_GRAPH_REGION_SELECT_MODE' });
    expect(after.graphRegionSelectMode).toBe(false);
    expect(after.graphRegionSelectedLids).toEqual([]);
  });

  it('TOGGLE_GRAPH_REGION_SELECT_MODE: false → true preserves any prior selectedLids', () => {
    const before = readyState({
      graphRegionSelectMode: false,
      graphRegionSelectedLids: ['x'],
    });
    const { state: after } = reduce(before, { type: 'TOGGLE_GRAPH_REGION_SELECT_MODE' });
    expect(after.graphRegionSelectMode).toBe(true);
    // ON 時は prior selection を保つ(user が toggle off → on で選択維持
    // を期待するケース。off 時のみ clear する)。
    expect(after.graphRegionSelectedLids).toEqual(['x']);
  });

  it('SET_GRAPH_REGION_SELECTED_LIDS: replaces the list', () => {
    const before = readyState({ graphRegionSelectedLids: ['a'] });
    const { state: after } = reduce(before, {
      type: 'SET_GRAPH_REGION_SELECTED_LIDS',
      lids: ['b', 'c'],
    });
    expect(after.graphRegionSelectedLids).toEqual(['b', 'c']);
  });

  it('SET_GRAPH_REGION_SELECTED_LIDS: empty list = clear', () => {
    const before = readyState({ graphRegionSelectedLids: ['a', 'b'] });
    const { state: after } = reduce(before, {
      type: 'SET_GRAPH_REGION_SELECTED_LIDS',
      lids: [],
    });
    expect(after.graphRegionSelectedLids).toEqual([]);
  });
});
