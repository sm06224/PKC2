import { describe, it, expect } from 'vitest';
import { createInitialState, reduce } from '@adapter/state/app-state';
import type { AppState, DualEditConflictState } from '@adapter/state/app-state';
import type { Container } from '@core/model/container';
import type { EditBaseSnapshot } from '@core/operations/dual-edit-safety';

/**
 * FI-01 dual-edit-safety v1 — state/save slice tests.
 *
 * Contract: `docs/spec/dual-edit-safety-v1-behavior-contract.md`
 *   - §2.3  action payload schema
 *   - §5    conflict outcome matrix
 *   - §7.1  gates
 *   - invariants I-Dual1〜10
 */

const T0 = '2026-04-17T00:00:00Z';
const T2 = '2026-04-17T02:00:00Z';

function baseContainer(): Container {
  return {
    meta: {
      container_id: 'c1',
      title: 'Test',
      created_at: T0,
      updated_at: T0,
      schema_version: 1,
    },
    entries: [
      {
        lid: 'e1', title: 'Title', body: 'original body',
        archetype: 'text', created_at: T0, updated_at: T0,
      },
      {
        lid: 'e2', title: 'Other', body: 'other',
        archetype: 'todo', created_at: T0, updated_at: T0,
      },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };
}

function readyState(): AppState {
  return { ...createInitialState(), phase: 'ready', container: baseContainer() };
}

describe('FI-01 state slice — BEGIN_EDIT captures editingBase', () => {
  it('1. BEGIN_EDIT populates editingBase for an existing entry', () => {
    const { state } = reduce(readyState(), { type: 'BEGIN_EDIT', lid: 'e1' });
    expect(state.phase).toBe('editing');
    expect(state.editingBase).not.toBeNull();
    expect(state.editingBase!.lid).toBe('e1');
    expect(state.editingBase!.updated_at).toBe(T0);
    expect(state.editingBase!.archetype).toBe('text');
  });

  it('2. BEGIN_EDIT with unknown lid still enters editing phase with editingBase = null (permissive)', () => {
    const { state } = reduce(readyState(), { type: 'BEGIN_EDIT', lid: 'nope' });
    expect(state.phase).toBe('editing');
    expect(state.editingBase).toBeNull();
  });

  it('3. BEGIN_EDIT clears any stale dualEditConflict', () => {
    const start: AppState = {
      ...readyState(),
      dualEditConflict: {
        lid: 'e1', base: { lid: 'e1', archetype: 'text', updated_at: T0 },
        draft: { title: 'd', body: 'b' }, kind: 'version-mismatch',
      },
    };
    const { state } = reduce(start, { type: 'BEGIN_EDIT', lid: 'e1' });
    expect(state.dualEditConflict).toBeNull();
  });
});

describe('FI-01 state slice — COMMIT_EDIT safe path', () => {
  it('4. COMMIT_EDIT with matching base passes the guard and mutates the entry', () => {
    let state = readyState();
    ({ state } = reduce(state, { type: 'BEGIN_EDIT', lid: 'e1' }));

    const before = state.container!.entries.find((e) => e.lid === 'e1')!;
    const { state: next, events } = reduce(state, {
      type: 'COMMIT_EDIT', lid: 'e1', title: 'Title', body: 'new body',
    });

    expect(next.phase).toBe('ready');
    expect(next.editingLid).toBeNull();
    expect(next.editingBase).toBeNull();
    expect(next.dualEditConflict).toBeNull();
    const after = next.container!.entries.find((e) => e.lid === 'e1')!;
    expect(after.body).toBe('new body');
    expect(after.updated_at).not.toBe(before.updated_at);
    expect(events.some((e) => e.type === 'EDIT_COMMITTED')).toBe(true);
    expect(events.some((e) => e.type === 'ENTRY_UPDATED')).toBe(true);
    expect(events.some((e) => e.type === 'DUAL_EDIT_SAVE_REJECTED')).toBe(false);
  });

  it('5. COMMIT_EDIT without a base (no BEGIN_EDIT) still works (legacy permissive path)', () => {
    const state: AppState = {
      ...readyState(),
      phase: 'editing',
      editingLid: 'e1',
      editingBase: null,
    };
    const { state: next, events } = reduce(state, {
      type: 'COMMIT_EDIT', lid: 'e1', title: 'T', body: 'legacy body',
    });
    expect(next.phase).toBe('ready');
    expect(next.container!.entries.find((e) => e.lid === 'e1')!.body).toBe('legacy body');
    expect(events.some((e) => e.type === 'DUAL_EDIT_SAVE_REJECTED')).toBe(false);
  });
});

describe('FI-01 state slice — COMMIT_EDIT rejects on conflict', () => {
  it('6. version-mismatch: container advanced after edit start → reject, container unchanged', () => {
    let state = readyState();
    ({ state } = reduce(state, { type: 'BEGIN_EDIT', lid: 'e1' }));

    // Simulate a concurrent save that advanced the entry by mutating
    // the container reference directly in state (another window path).
    const bumped: Container = {
      ...state.container!,
      entries: state.container!.entries.map((e) =>
        e.lid === 'e1'
          ? { ...e, body: 'remote body', updated_at: T2 }
          : e,
      ),
    };
    state = { ...state, container: bumped };

    const containerBefore = state.container;
    const { state: next, events } = reduce(state, {
      type: 'COMMIT_EDIT', lid: 'e1', title: 'Title', body: 'my body',
    });

    expect(next.container).toBe(containerBefore); // container identity preserved (I-Dual1)
    expect(next.phase).toBe('editing');            // still editing (I-Dual4)
    expect(next.editingLid).toBe('e1');
    expect(next.dualEditConflict).not.toBeNull();
    const conflict = next.dualEditConflict!;
    expect(conflict.lid).toBe('e1');
    expect(conflict.kind).toBe('version-mismatch');
    expect(conflict.draft.body).toBe('my body');
    expect(conflict.base.updated_at).toBe(T0);
    expect(conflict.currentUpdatedAt).toBe(T2);

    const rejected = events.find((e) => e.type === 'DUAL_EDIT_SAVE_REJECTED');
    expect(rejected).toBeDefined();
    if (rejected && rejected.type === 'DUAL_EDIT_SAVE_REJECTED') {
      expect(rejected.kind).toBe('version-mismatch');
      expect(rejected.baseUpdatedAt).toBe(T0);
      expect(rejected.currentUpdatedAt).toBe(T2);
    }
  });

  it('7. entry-missing: entry removed after edit start → reject with entry-missing kind', () => {
    let state = readyState();
    ({ state } = reduce(state, { type: 'BEGIN_EDIT', lid: 'e1' }));

    // Simulate external deletion.
    const gone: Container = {
      ...state.container!,
      entries: state.container!.entries.filter((e) => e.lid !== 'e1'),
    };
    state = { ...state, container: gone };

    const { state: next, events } = reduce(state, {
      type: 'COMMIT_EDIT', lid: 'e1', title: 'T', body: 'b',
    });
    expect(next.dualEditConflict?.kind).toBe('entry-missing');
    const rej = events.find((e) => e.type === 'DUAL_EDIT_SAVE_REJECTED');
    expect(rej && rej.type === 'DUAL_EDIT_SAVE_REJECTED' && rej.kind).toBe('entry-missing');
  });

  it('8. archetype-changed: archetype swapped externally → reject with archetype-changed kind', () => {
    let state = readyState();
    ({ state } = reduce(state, { type: 'BEGIN_EDIT', lid: 'e1' }));

    const swapped: Container = {
      ...state.container!,
      entries: state.container!.entries.map((e) =>
        e.lid === 'e1' ? { ...e, archetype: 'textlog' } : e,
      ),
    };
    state = { ...state, container: swapped };

    const { state: next } = reduce(state, {
      type: 'COMMIT_EDIT', lid: 'e1', title: 'T', body: 'b',
    });
    expect(next.dualEditConflict?.kind).toBe('archetype-changed');
    expect(next.dualEditConflict?.currentArchetype).toBe('textlog');
  });
});

describe('FI-01 state slice — RESOLVE_DUAL_EDIT_CONFLICT save-as-branch', () => {
  function stateWithConflict(): AppState {
    let state = readyState();
    ({ state } = reduce(state, { type: 'BEGIN_EDIT', lid: 'e1' }));
    const bumped: Container = {
      ...state.container!,
      entries: state.container!.entries.map((e) =>
        e.lid === 'e1' ? { ...e, body: 'remote', updated_at: T2 } : e,
      ),
    };
    state = { ...state, container: bumped };
    ({ state } = reduce(state, {
      type: 'COMMIT_EDIT', lid: 'e1', title: 'Draft Title', body: 'my draft body',
    }));
    return state;
  }

  it('9. save-as-branch creates a new entry carrying the draft + clears conflict', () => {
    const state = stateWithConflict();
    const { state: next, events } = reduce(state, {
      type: 'RESOLVE_DUAL_EDIT_CONFLICT', lid: 'e1', resolution: 'save-as-branch',
    });

    expect(next.dualEditConflict).toBeNull();
    expect(next.editingBase).toBeNull();
    expect(next.editingLid).toBeNull();
    expect(next.phase).toBe('ready');

    // The branched entry is selected, not e1.
    expect(next.selectedLid).not.toBe('e1');
    expect(next.selectedLid).not.toBeNull();
    const branch = next.container!.entries.find((e) => e.lid === next.selectedLid)!;
    expect(branch.title).toBe('Draft Title');
    expect(branch.body).toBe('my draft body');
    expect(branch.archetype).toBe('text');

    // Source entry was NOT overwritten (I-Dual1).
    const source = next.container!.entries.find((e) => e.lid === 'e1')!;
    expect(source.body).toBe('remote');

    // provenance relation with canonical direction exists.
    const rel = next.container!.relations.find(
      (r) => r.kind === 'provenance' && r.from === 'e1' && r.to === branch.lid,
    );
    expect(rel).toBeDefined();
    expect((rel!.metadata as Record<string, string>).conversion_kind).toBe('concurrent-edit');

    // Event emitted.
    const ev = events.find((e) => e.type === 'ENTRY_BRANCHED_FROM_DUAL_EDIT');
    expect(ev).toBeDefined();
    if (ev && ev.type === 'ENTRY_BRANCHED_FROM_DUAL_EDIT') {
      expect(ev.sourceLid).toBe('e1');
      expect(ev.newLid).toBe(branch.lid);
    }
  });
});

describe('FI-01 state slice — RESOLVE_DUAL_EDIT_CONFLICT discard-my-edits', () => {
  it('10. discard clears conflict, preserves container, and emits DUAL_EDIT_DISCARDED', () => {
    const initialState = (() => {
      let s = readyState();
      ({ state: s } = reduce(s, { type: 'BEGIN_EDIT', lid: 'e1' }));
      s = {
        ...s,
        container: {
          ...s.container!,
          entries: s.container!.entries.map((e) =>
            e.lid === 'e1' ? { ...e, body: 'remote', updated_at: T2 } : e,
          ),
        },
      };
      ({ state: s } = reduce(s, {
        type: 'COMMIT_EDIT', lid: 'e1', title: 'X', body: 'my',
      }));
      return s;
    })();

    const containerBefore = initialState.container;
    const { state: next, events } = reduce(initialState, {
      type: 'RESOLVE_DUAL_EDIT_CONFLICT', lid: 'e1', resolution: 'discard-my-edits',
    });

    expect(next.container).toBe(containerBefore); // container untouched
    expect(next.dualEditConflict).toBeNull();
    expect(next.editingBase).toBeNull();
    expect(next.editingLid).toBeNull();
    expect(next.phase).toBe('ready');
    const ev = events.find((e) => e.type === 'DUAL_EDIT_DISCARDED');
    expect(ev).toBeDefined();
    if (ev && ev.type === 'DUAL_EDIT_DISCARDED') {
      expect(ev.lid).toBe('e1');
    }
  });
});

describe('FI-01 state slice — RESOLVE_DUAL_EDIT_CONFLICT copy-to-clipboard', () => {
  it('11. copy-to-clipboard bumps copyRequestTicket and keeps conflict + editing state intact', () => {
    let state = (() => {
      let s = readyState();
      ({ state: s } = reduce(s, { type: 'BEGIN_EDIT', lid: 'e1' }));
      s = {
        ...s,
        container: {
          ...s.container!,
          entries: s.container!.entries.map((e) =>
            e.lid === 'e1' ? { ...e, body: 'remote', updated_at: T2 } : e,
          ),
        },
      };
      ({ state: s } = reduce(s, {
        type: 'COMMIT_EDIT', lid: 'e1', title: 'X', body: 'my',
      }));
      return s;
    })();

    const containerBefore = state.container;
    const { state: nextState, events } = reduce(state, {
      type: 'RESOLVE_DUAL_EDIT_CONFLICT', lid: 'e1', resolution: 'copy-to-clipboard',
    });
    state = nextState;

    expect(state.container).toBe(containerBefore);
    expect(state.phase).toBe('editing');
    expect(state.editingLid).toBe('e1');
    expect(state.dualEditConflict).not.toBeNull();
    expect(state.dualEditConflict!.copyRequestTicket).toBe(1);
    expect(events).toHaveLength(0); // no domain event

    // Second invocation → ticket advances monotonically.
    ({ state } = reduce(state, {
      type: 'RESOLVE_DUAL_EDIT_CONFLICT', lid: 'e1', resolution: 'copy-to-clipboard',
    }));
    expect(state.dualEditConflict!.copyRequestTicket).toBe(2);
    // Draft body still accessible to the UI consumer.
    expect(state.dualEditConflict!.draft.body).toBe('my');
  });
});

describe('FI-01 state slice — blocked / no-op paths', () => {
  it('12. RESOLVE with no conflict parked is blocked (state identity preserved)', () => {
    const state = readyState();
    const { state: next, events } = reduce(state, {
      type: 'RESOLVE_DUAL_EDIT_CONFLICT', lid: 'e1', resolution: 'save-as-branch',
    });
    expect(next).toBe(state);
    expect(events).toHaveLength(0);
  });

  it('13. RESOLVE with lid mismatch is blocked (state identity preserved)', () => {
    let state = readyState();
    ({ state } = reduce(state, { type: 'BEGIN_EDIT', lid: 'e1' }));
    const bumped: Container = {
      ...state.container!,
      entries: state.container!.entries.map((e) =>
        e.lid === 'e1' ? { ...e, body: 'remote', updated_at: T2 } : e,
      ),
    };
    state = { ...state, container: bumped };
    ({ state } = reduce(state, {
      type: 'COMMIT_EDIT', lid: 'e1', title: 'X', body: 'my',
    }));

    const before = state;
    const { state: next, events } = reduce(before, {
      type: 'RESOLVE_DUAL_EDIT_CONFLICT', lid: 'WRONG', resolution: 'save-as-branch',
    });
    expect(next).toBe(before);
    expect(events).toHaveLength(0);
  });

  it('14. CANCEL_EDIT clears editingBase + dualEditConflict (housekeeping)', () => {
    let state = readyState();
    ({ state } = reduce(state, { type: 'BEGIN_EDIT', lid: 'e1' }));
    expect(state.editingBase).not.toBeNull();

    const { state: next } = reduce(state, { type: 'CANCEL_EDIT' });
    expect(next.phase).toBe('ready');
    expect(next.editingLid).toBeNull();
    expect(next.editingBase).toBeNull();
    expect(next.dualEditConflict).toBeNull();
  });
});

describe('FI-01 state slice — non-regression with existing operations', () => {
  it('15. COMMIT_EDIT with explicit action.base override works even when state.editingBase is null', () => {
    const state: AppState = {
      ...readyState(),
      phase: 'editing',
      editingLid: 'e1',
      editingBase: null,
    };
    const base: EditBaseSnapshot = {
      lid: 'e1', archetype: 'text', updated_at: 'mismatched-time',
    };
    const { state: next } = reduce(state, {
      type: 'COMMIT_EDIT', lid: 'e1', title: 'T', body: 'b', base,
    });
    // Explicit base forces the guard to run even without BEGIN_EDIT capture.
    expect(next.dualEditConflict?.kind).toBe('version-mismatch');
    expect(next.phase).toBe('editing');
  });

  it('16. RESTORE_ENTRY continues to work end-to-end (no regression)', () => {
    // Build a container with one revision so we can restore.
    let state = readyState();
    ({ state } = reduce(state, { type: 'BEGIN_EDIT', lid: 'e1' }));
    ({ state } = reduce(state, {
      type: 'COMMIT_EDIT', lid: 'e1', title: 'Title', body: 'v2 body',
    }));
    // Now a revision capturing the pre-edit state exists.
    const revId = state.container!.revisions[0]!.id;

    const { state: after, events } = reduce(state, {
      type: 'RESTORE_ENTRY', lid: 'e1', revision_id: revId,
    });
    expect(after.container!.entries.find((e) => e.lid === 'e1')!.body).toBe('original body');
    expect(events.some((e) => e.type === 'ENTRY_RESTORED')).toBe(true);
  });
});

describe('FI-01 state slice — conflict shape', () => {
  it('17. DualEditConflictState preserves draft.assets passthrough', () => {
    let state = readyState();
    ({ state } = reduce(state, { type: 'BEGIN_EDIT', lid: 'e1' }));
    state = {
      ...state,
      container: {
        ...state.container!,
        entries: state.container!.entries.map((e) =>
          e.lid === 'e1' ? { ...e, body: 'remote', updated_at: T2 } : e,
        ),
      },
    };
    ({ state } = reduce(state, {
      type: 'COMMIT_EDIT', lid: 'e1',
      title: 'T', body: 'b', assets: { 'k1': 'asset-data' },
    }));
    const conflict: DualEditConflictState = state.dualEditConflict!;
    expect(conflict.draft.assets).toEqual({ 'k1': 'asset-data' });
  });
});
