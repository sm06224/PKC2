import { describe, it, expect } from 'vitest';
import { createInitialState, reduce } from '@adapter/state/app-state';
import type { AppState } from '@adapter/state/app-state';
import type { Container } from '@core/model/container';

/**
 * v1.3 — RECORD_ENTRY_REF_SELECTION reducer.
 *
 * Exercises LRU semantics (prepend, dedupe, cap at 20) and confirms
 * the slice is runtime-only (ignored in non-editing phases).
 */

const T = '2026-04-20T00:00:00Z';

const container: Container = {
  meta: {
    container_id: 'c',
    title: 't',
    created_at: T,
    updated_at: T,
    schema_version: 1,
  },
  entries: [
    { lid: 'e1', title: 'First', body: 'b', archetype: 'text', created_at: T, updated_at: T },
    { lid: 'e2', title: 'Second', body: 'b', archetype: 'text', created_at: T, updated_at: T },
  ],
  relations: [],
  revisions: [],
  assets: {},
};

function editing(): AppState {
  const init = createInitialState();
  const { state: ready } = reduce(init, { type: 'SYS_INIT_COMPLETE', container });
  const { state: selected } = reduce(ready, { type: 'SELECT_ENTRY', lid: 'e1' });
  const { state: edit } = reduce(selected, { type: 'BEGIN_EDIT', lid: 'e1' });
  return edit;
}

describe('RECORD_ENTRY_REF_SELECTION — LRU semantics', () => {
  it('initial recentEntryRefLids is empty', () => {
    const s = createInitialState();
    expect(s.recentEntryRefLids).toEqual([]);
  });

  it('prepends the lid on first dispatch', () => {
    const s0 = editing();
    const { state } = reduce(s0, { type: 'RECORD_ENTRY_REF_SELECTION', lid: 'abc' });
    expect(state.recentEntryRefLids).toEqual(['abc']);
  });

  it('prepends without duplicating when the same lid repeats', () => {
    const s0 = editing();
    const { state: s1 } = reduce(s0, { type: 'RECORD_ENTRY_REF_SELECTION', lid: 'abc' });
    const { state: s2 } = reduce(s1, { type: 'RECORD_ENTRY_REF_SELECTION', lid: 'def' });
    const { state: s3 } = reduce(s2, { type: 'RECORD_ENTRY_REF_SELECTION', lid: 'abc' });
    // 'abc' moves from tail back to head; no duplicates
    expect(s3.recentEntryRefLids).toEqual(['abc', 'def']);
  });

  it('orders entries recency-first (most recent = index 0)', () => {
    let s = editing();
    for (const lid of ['a', 'b', 'c']) {
      ({ state: s } = reduce(s, { type: 'RECORD_ENTRY_REF_SELECTION', lid }));
    }
    expect(s.recentEntryRefLids).toEqual(['c', 'b', 'a']);
  });

  it('caps at 20 entries (oldest dropped)', () => {
    let s = editing();
    for (let i = 0; i < 25; i++) {
      ({ state: s } = reduce(s, { type: 'RECORD_ENTRY_REF_SELECTION', lid: `lid-${i}` }));
    }
    expect(s.recentEntryRefLids).toHaveLength(20);
    // Most recent (lid-24) at head, oldest survivor (lid-5) at tail
    expect(s.recentEntryRefLids[0]).toBe('lid-24');
    expect(s.recentEntryRefLids[19]).toBe('lid-5');
  });

  it('dedup works even when existing lid is at the tail of a full buffer', () => {
    let s = editing();
    for (let i = 0; i < 20; i++) {
      ({ state: s } = reduce(s, { type: 'RECORD_ENTRY_REF_SELECTION', lid: `lid-${i}` }));
    }
    // Re-record the tail lid (oldest)
    ({ state: s } = reduce(s, { type: 'RECORD_ENTRY_REF_SELECTION', lid: 'lid-0' }));
    expect(s.recentEntryRefLids).toHaveLength(20);
    expect(s.recentEntryRefLids[0]).toBe('lid-0');
    // lid-0 moved from index 19 to 0, so lid-1 is now at 19
    expect(s.recentEntryRefLids[19]).toBe('lid-1');
  });

  it('is phase-scoped to editing — blocked (no-op) in ready', () => {
    const init = createInitialState();
    const { state: ready } = reduce(init, { type: 'SYS_INIT_COMPLETE', container });
    const warn = vitestSpyConsoleWarn();
    const { state } = reduce(ready, { type: 'RECORD_ENTRY_REF_SELECTION', lid: 'x' });
    expect(state.recentEntryRefLids).toEqual([]);
    warn.restore();
  });

  it('is runtime-only: survives through edits but is reset on createInitialState', () => {
    const s0 = editing();
    const { state: s1 } = reduce(s0, { type: 'RECORD_ENTRY_REF_SELECTION', lid: 'abc' });
    expect(s1.recentEntryRefLids).toEqual(['abc']);
    // Fresh boot
    const fresh = createInitialState();
    expect(fresh.recentEntryRefLids).toEqual([]);
  });
});

// Minimal console.warn silencer used by the "blocked in ready" case so
// expected warnings don't pollute test output.
function vitestSpyConsoleWarn(): { restore: () => void } {
  const original = console.warn;
  console.warn = () => {};
  return { restore: () => { console.warn = original; } };
}
