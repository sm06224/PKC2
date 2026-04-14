import { describe, it, expect } from 'vitest';
import { createInitialState, reduce } from '@adapter/state/app-state';
import type { AppState } from '@adapter/state/app-state';
import type { Container } from '@core/model/container';

/**
 * P1-1 stale-residue prevention tests.
 *
 * Verifies the reducer-level clear semantics that make module-level
 * `textlog-selection` / `text-to-textlog-modal` singletons safe to
 * treat as forward caches. Every path that previously required the
 * action-binder to remember to call a mutator-clear function is
 * exercised here at the reducer level.
 */

const T = '2026-04-13T00:00:00Z';

const container: Container = {
  meta: {
    container_id: 'c',
    title: 't',
    created_at: T,
    updated_at: T,
    schema_version: 1,
  },
  entries: [
    { lid: 'tl1', title: 'Log A', body: JSON.stringify({ entries: [] }), archetype: 'textlog', created_at: T, updated_at: T },
    { lid: 'tl2', title: 'Log B', body: JSON.stringify({ entries: [] }), archetype: 'textlog', created_at: T, updated_at: T },
    { lid: 'tx1', title: 'Text A', body: 'plain', archetype: 'text', created_at: T, updated_at: T },
  ],
  relations: [],
  revisions: [],
  assets: {},
};

function readyWith(container: Container): AppState {
  const init = createInitialState();
  const { state } = reduce(init, { type: 'SYS_INIT_COMPLETE', container });
  return state;
}

describe('P1-1 — BEGIN_TEXTLOG_SELECTION', () => {
  it('installs selection state for a valid textlog lid', () => {
    const s0 = readyWith(container);
    const { state } = reduce(s0, { type: 'BEGIN_TEXTLOG_SELECTION', lid: 'tl1' });
    expect(state.textlogSelection).toEqual({ activeLid: 'tl1', selectedLogIds: [] });
  });

  it('replaces a previously-active selection (only one TEXTLOG owns selection)', () => {
    let s = readyWith(container);
    s = reduce(s, { type: 'BEGIN_TEXTLOG_SELECTION', lid: 'tl1' }).state;
    s = reduce(s, { type: 'TOGGLE_TEXTLOG_LOG_SELECTION', logId: 'log-a' }).state;
    expect(s.textlogSelection?.selectedLogIds).toEqual(['log-a']);
    s = reduce(s, { type: 'BEGIN_TEXTLOG_SELECTION', lid: 'tl2' }).state;
    expect(s.textlogSelection).toEqual({ activeLid: 'tl2', selectedLogIds: [] });
  });

  it('blocks when the lid is not a textlog', () => {
    const s0 = readyWith(container);
    const { state } = reduce(s0, { type: 'BEGIN_TEXTLOG_SELECTION', lid: 'tx1' });
    expect(state.textlogSelection).toBeFalsy();
  });

  it('blocks when the lid is unknown', () => {
    const s0 = readyWith(container);
    const { state } = reduce(s0, { type: 'BEGIN_TEXTLOG_SELECTION', lid: 'ghost' });
    expect(state.textlogSelection).toBeFalsy();
  });
});

describe('P1-1 — TOGGLE_TEXTLOG_LOG_SELECTION', () => {
  it('toggles membership of a log id', () => {
    let s = readyWith(container);
    s = reduce(s, { type: 'BEGIN_TEXTLOG_SELECTION', lid: 'tl1' }).state;
    s = reduce(s, { type: 'TOGGLE_TEXTLOG_LOG_SELECTION', logId: 'log-x' }).state;
    expect(s.textlogSelection?.selectedLogIds).toEqual(['log-x']);
    s = reduce(s, { type: 'TOGGLE_TEXTLOG_LOG_SELECTION', logId: 'log-x' }).state;
    expect(s.textlogSelection?.selectedLogIds).toEqual([]);
  });

  it('is a no-op when no selection is active', () => {
    const s0 = readyWith(container);
    const before = s0.textlogSelection;
    const { state } = reduce(s0, { type: 'TOGGLE_TEXTLOG_LOG_SELECTION', logId: 'log-x' });
    expect(state.textlogSelection).toBe(before);
  });
});

describe('P1-1 — CANCEL_TEXTLOG_SELECTION', () => {
  it('clears an active selection', () => {
    let s = readyWith(container);
    s = reduce(s, { type: 'BEGIN_TEXTLOG_SELECTION', lid: 'tl1' }).state;
    s = reduce(s, { type: 'CANCEL_TEXTLOG_SELECTION' }).state;
    expect(s.textlogSelection).toBeNull();
  });

  it('is a no-op when no selection is active', () => {
    const s0 = readyWith(container);
    const { state } = reduce(s0, { type: 'CANCEL_TEXTLOG_SELECTION' });
    expect(state.textlogSelection).toBeFalsy();
  });
});

describe('P1-1 — clear semantics on SELECT_ENTRY', () => {
  it('clears textlogSelection when switching to a DIFFERENT entry', () => {
    let s = readyWith(container);
    s = reduce(s, { type: 'BEGIN_TEXTLOG_SELECTION', lid: 'tl1' }).state;
    expect(s.textlogSelection?.activeLid).toBe('tl1');
    s = reduce(s, { type: 'SELECT_ENTRY', lid: 'tl2' }).state;
    // Stale-selection guard: the active lid for selection was tl1;
    // selecting tl2 must tear the selection down so the tl2 viewer
    // doesn't inherit tl1's check boxes.
    expect(s.textlogSelection).toBeNull();
  });

  it('preserves textlogSelection when SELECT_ENTRY re-selects the same lid', () => {
    let s = readyWith(container);
    s = reduce(s, { type: 'BEGIN_TEXTLOG_SELECTION', lid: 'tl1' }).state;
    s = reduce(s, { type: 'TOGGLE_TEXTLOG_LOG_SELECTION', logId: 'keep-me' }).state;
    s = reduce(s, { type: 'SELECT_ENTRY', lid: 'tl1' }).state;
    expect(s.textlogSelection?.activeLid).toBe('tl1');
    expect(s.textlogSelection?.selectedLogIds).toEqual(['keep-me']);
  });

  it('clears textToTextlogModal when switching to a DIFFERENT entry', () => {
    let s = readyWith(container);
    s = reduce(s, { type: 'OPEN_TEXT_TO_TEXTLOG_MODAL', sourceLid: 'tx1' }).state;
    expect(s.textToTextlogModal?.sourceLid).toBe('tx1');
    s = reduce(s, { type: 'SELECT_ENTRY', lid: 'tl1' }).state;
    expect(s.textToTextlogModal).toBeNull();
  });

  it('preserves textToTextlogModal when re-selecting the same source', () => {
    let s = readyWith(container);
    s = reduce(s, { type: 'OPEN_TEXT_TO_TEXTLOG_MODAL', sourceLid: 'tx1' }).state;
    s = reduce(s, { type: 'SELECT_ENTRY', lid: 'tx1' }).state;
    expect(s.textToTextlogModal?.sourceLid).toBe('tx1');
  });
});

describe('P1-1 — clear semantics on DESELECT_ENTRY', () => {
  it('tears down both transient UI states', () => {
    let s = readyWith(container);
    s = reduce(s, { type: 'BEGIN_TEXTLOG_SELECTION', lid: 'tl1' }).state;
    s = reduce(s, { type: 'OPEN_TEXT_TO_TEXTLOG_MODAL', sourceLid: 'tx1' }).state;
    s = reduce(s, { type: 'DESELECT_ENTRY' }).state;
    expect(s.textlogSelection).toBeNull();
    expect(s.textToTextlogModal).toBeNull();
  });
});

describe('P1-1 — clear semantics on BEGIN_EDIT', () => {
  it('tears down both transient UI states when the user enters edit mode', () => {
    let s = readyWith(container);
    s = reduce(s, { type: 'BEGIN_TEXTLOG_SELECTION', lid: 'tl1' }).state;
    s = reduce(s, { type: 'OPEN_TEXT_TO_TEXTLOG_MODAL', sourceLid: 'tx1' }).state;
    s = reduce(s, { type: 'BEGIN_EDIT', lid: 'tl1' }).state;
    expect(s.textlogSelection).toBeNull();
    expect(s.textToTextlogModal).toBeNull();
  });
});

describe('P1-1 — clear semantics on DELETE_ENTRY', () => {
  it('clears textlogSelection when the active textlog is deleted', () => {
    let s = readyWith(container);
    s = reduce(s, { type: 'BEGIN_TEXTLOG_SELECTION', lid: 'tl1' }).state;
    s = reduce(s, { type: 'DELETE_ENTRY', lid: 'tl1' }).state;
    expect(s.textlogSelection).toBeNull();
  });

  it('preserves textlogSelection when an UNRELATED entry is deleted', () => {
    let s = readyWith(container);
    s = reduce(s, { type: 'BEGIN_TEXTLOG_SELECTION', lid: 'tl1' }).state;
    s = reduce(s, { type: 'TOGGLE_TEXTLOG_LOG_SELECTION', logId: 'keep-me' }).state;
    // Delete an unrelated entry.
    s = reduce(s, { type: 'DELETE_ENTRY', lid: 'tx1' }).state;
    expect(s.textlogSelection?.selectedLogIds).toEqual(['keep-me']);
  });

  it('clears textToTextlogModal when the modal source is deleted', () => {
    let s = readyWith(container);
    s = reduce(s, { type: 'OPEN_TEXT_TO_TEXTLOG_MODAL', sourceLid: 'tx1' }).state;
    s = reduce(s, { type: 'DELETE_ENTRY', lid: 'tx1' }).state;
    expect(s.textToTextlogModal).toBeNull();
  });
});

describe('P1-1 — clear semantics on SYS_IMPORT_COMPLETE', () => {
  it('tears down both transient UI states when the container is replaced', () => {
    let s = readyWith(container);
    s = reduce(s, { type: 'BEGIN_TEXTLOG_SELECTION', lid: 'tl1' }).state;
    s = reduce(s, { type: 'OPEN_TEXT_TO_TEXTLOG_MODAL', sourceLid: 'tx1' }).state;
    // Import a different container.
    const other: Container = {
      meta: { container_id: 'c2', title: 't2', created_at: T, updated_at: T, schema_version: 1 },
      entries: [],
      relations: [],
      revisions: [],
      assets: {},
    };
    s = reduce(s, { type: 'SYS_IMPORT_COMPLETE', container: other, source: 'test' }).state;
    expect(s.textlogSelection).toBeNull();
    expect(s.textToTextlogModal).toBeNull();
  });
});

describe('P1-1 — OPEN / SET / CLOSE TEXT_TO_TEXTLOG_MODAL', () => {
  it('opens the modal for a valid TEXT source', () => {
    const s0 = readyWith(container);
    const { state } = reduce(s0, { type: 'OPEN_TEXT_TO_TEXTLOG_MODAL', sourceLid: 'tx1' });
    expect(state.textToTextlogModal).toEqual({ sourceLid: 'tx1', splitMode: 'heading' });
  });

  it('honors an explicit initial split mode', () => {
    const s0 = readyWith(container);
    const { state } = reduce(s0, {
      type: 'OPEN_TEXT_TO_TEXTLOG_MODAL',
      sourceLid: 'tx1',
      splitMode: 'hr',
    });
    expect(state.textToTextlogModal?.splitMode).toBe('hr');
  });

  it('blocks when the source lid is not a TEXT entry', () => {
    const s0 = readyWith(container);
    const { state } = reduce(s0, { type: 'OPEN_TEXT_TO_TEXTLOG_MODAL', sourceLid: 'tl1' });
    expect(state.textToTextlogModal).toBeFalsy();
  });

  it('SET_TEXT_TO_TEXTLOG_SPLIT_MODE updates split mode while open', () => {
    let s = readyWith(container);
    s = reduce(s, { type: 'OPEN_TEXT_TO_TEXTLOG_MODAL', sourceLid: 'tx1' }).state;
    s = reduce(s, { type: 'SET_TEXT_TO_TEXTLOG_SPLIT_MODE', splitMode: 'hr' }).state;
    expect(s.textToTextlogModal?.splitMode).toBe('hr');
  });

  it('SET_TEXT_TO_TEXTLOG_SPLIT_MODE preserves state identity when mode unchanged', () => {
    let s = readyWith(container);
    s = reduce(s, { type: 'OPEN_TEXT_TO_TEXTLOG_MODAL', sourceLid: 'tx1' }).state;
    const before = s;
    s = reduce(s, { type: 'SET_TEXT_TO_TEXTLOG_SPLIT_MODE', splitMode: 'heading' }).state;
    // Identity-preserving no-op — same state reference.
    expect(s).toBe(before);
  });

  it('CLOSE_TEXT_TO_TEXTLOG_MODAL clears the modal', () => {
    let s = readyWith(container);
    s = reduce(s, { type: 'OPEN_TEXT_TO_TEXTLOG_MODAL', sourceLid: 'tx1' }).state;
    s = reduce(s, { type: 'CLOSE_TEXT_TO_TEXTLOG_MODAL' }).state;
    expect(s.textToTextlogModal).toBeNull();
  });
});
