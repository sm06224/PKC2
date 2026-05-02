/**
 * Reducer-purity contract test — pins the property the debug
 * report's `replay.initialContainer` field promises.
 *
 * Stage β finalize (PR #211, 2026-05-02): the `replay` slice in
 * content-mode debug reports advertises that
 *   (initialContainer, recent[].type/lid → replayed actions)
 * deterministically reconstructs the user's final state on the
 * developer's machine. That promise rests entirely on
 * `reduce(state, action)` being a pure function — same input always
 * yields same output. If that ever ceases to hold (a stray Date.now
 * inside the reducer, an external dependency baked into reduce, an
 * unintended I/O hook in a listener path that changes state-derived
 * values), the debug-report replay claim becomes a lie.
 *
 * This file pins the contract by running the same dispatcher twice
 * over the same (init, actions[]) and asserting the final states are
 * structurally identical. It runs against a representative cross-
 * section of UserAction + SystemCommand variants — not every action,
 * but enough that adding non-determinism to a common reducer path
 * trips the test.
 *
 * If this test fails, do NOT change it to match the new behavior.
 * Treat the failure as a signal that the reducer is no longer pure
 * and either (a) restore purity, or (b) delete the `replay` field
 * from the DebugReport schema and document the change in
 * `docs/development/debug-privacy-philosophy.md` §5-5.
 */

import { describe, it, expect } from 'vitest';
import { createDispatcher } from '@adapter/state/dispatcher';
import type { Dispatchable } from '@core/action';
import type { Container } from '@core/model/container';

const TS = '2026-05-02T00:00:00Z';

function makeContainer(): Container {
  return {
    meta: {
      container_id: 'c-replay-test',
      title: 'Replay test',
      created_at: TS,
      updated_at: TS,
      schema_version: 1,
    },
    entries: [
      { lid: 'e-1', title: 'A', body: 'body A', archetype: 'text', created_at: TS, updated_at: TS },
      { lid: 'e-2', title: 'B', body: '{"status":"open","description":"todo B"}', archetype: 'todo', created_at: TS, updated_at: TS },
      { lid: 'e-3', title: 'C', body: 'body C', archetype: 'text', created_at: TS, updated_at: TS },
    ],
    relations: [
      { id: 'r-1', kind: 'categorical', from: 'e-1', to: 'tag:work', created_at: TS, updated_at: TS },
    ],
    revisions: [],
    assets: {},
  };
}

function replay(init: Container, actions: Dispatchable[]) {
  const d = createDispatcher();
  d.dispatch({ type: 'SYS_INIT_COMPLETE', container: init });
  for (const action of actions) {
    d.dispatch(action);
  }
  return d.getState();
}

describe('reducer purity contract — debug replay underpinning', () => {
  it('replay produces identical final state for the same (init, actions[])', () => {
    const init = makeContainer();
    const actions: Dispatchable[] = [
      { type: 'SELECT_ENTRY', lid: 'e-1' },
      { type: 'SET_VIEW_MODE', mode: 'kanban' },
      { type: 'SELECT_ENTRY', lid: 'e-2' },
      { type: 'BEGIN_EDIT', lid: 'e-2' },
      { type: 'CANCEL_EDIT' },
      { type: 'SET_VIEW_MODE', mode: 'detail' },
      { type: 'SELECT_ENTRY', lid: 'e-3' },
      { type: 'DESELECT_ENTRY' },
    ];
    const a = replay(init, actions);
    const b = replay(init, actions);
    // structural deep-equality — identity isn't expected (state is
    // recreated on each reduce), but the resulting trees must match.
    expect(b).toEqual(a);
  });

  it('different action prefixes diverge — confirms test is non-trivial', () => {
    const init = makeContainer();
    const a = replay(init, [{ type: 'SELECT_ENTRY', lid: 'e-1' }]);
    const b = replay(init, [{ type: 'SELECT_ENTRY', lid: 'e-2' }]);
    expect(a.selectedLid).toBe('e-1');
    expect(b.selectedLid).toBe('e-2');
    expect(a).not.toEqual(b);
  });

  it('SYS_INIT_COMPLETE alone is enough to reach a deterministic baseline', () => {
    const init = makeContainer();
    const a = replay(init, []);
    const b = replay(init, []);
    expect(a).toEqual(b);
    expect(a.phase).toBe('ready');
    expect(a.container).toEqual(init);
  });
});
