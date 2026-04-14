import { describe, it, expect } from 'vitest';
import { createInitialState, reduce } from '@adapter/state/app-state';
import type { AppState } from '@adapter/state/app-state';
import type { Container } from '@core/model/container';
import { getRevisionsByBulkId } from '@core/operations/container-ops';

/**
 * Reducer-level bulk-snapshot tests.
 *
 * Verifies that `BULK_DELETE`, `BULK_SET_STATUS`, and `BULK_SET_DATE`
 * produce revisions that share a single `bulk_id` — the primitive a
 * future restore UI needs to offer "undo the whole bulk". The
 * assertions are intentionally identity-free (we don't pin the exact
 * bulk_id string) because `generateLid` is non-deterministic by
 * design; we only require that the group is non-empty, consistent,
 * and distinct from unrelated single-entry revisions.
 */

const T = '2026-04-13T00:00:00Z';

function seedContainer(): Container {
  return {
    meta: {
      container_id: 'c',
      title: 'seed',
      created_at: T,
      updated_at: T,
      schema_version: 1,
    },
    entries: [
      {
        lid: 't1',
        title: 'todo 1',
        body: JSON.stringify({ status: 'open', description: 'a' }),
        archetype: 'todo',
        created_at: T,
        updated_at: T,
      },
      {
        lid: 't2',
        title: 'todo 2',
        body: JSON.stringify({ status: 'open', description: 'b' }),
        archetype: 'todo',
        created_at: T,
        updated_at: T,
      },
      {
        lid: 't3',
        title: 'todo 3',
        body: JSON.stringify({ status: 'open', description: 'c' }),
        archetype: 'todo',
        created_at: T,
        updated_at: T,
      },
      {
        lid: 'tx1',
        title: 'text 1',
        body: 'some body',
        archetype: 'text',
        created_at: T,
        updated_at: T,
      },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };
}

function readyWith(container: Container): AppState {
  const init = createInitialState();
  const { state } = reduce(init, { type: 'SYS_INIT_COMPLETE', container });
  return state;
}

/** Select all three todos via multi-select. Returns the state with
 *  `multiSelectedLids = [t1, t2, t3]`. */
function selectAllTodos(state0: AppState): AppState {
  let s = state0;
  s = reduce(s, { type: 'SELECT_ENTRY', lid: 't1' }).state;
  s = reduce(s, { type: 'TOGGLE_MULTI_SELECT', lid: 't2' }).state;
  s = reduce(s, { type: 'TOGGLE_MULTI_SELECT', lid: 't3' }).state;
  return s;
}

describe('BULK_DELETE — bulk_id grouping', () => {
  it('produces N revisions (one per deleted entry), all sharing one bulk_id', () => {
    let s = readyWith(seedContainer());
    s = selectAllTodos(s);
    const before = s.container!.revisions.length;
    s = reduce(s, { type: 'BULK_DELETE' }).state;

    const after = s.container!.revisions;
    // Three new revisions — one for each deleted todo.
    expect(after.length - before).toBe(3);

    const newRevs = after.slice(before);
    const ids = new Set(newRevs.map((r) => r.bulk_id));
    expect(ids.size).toBe(1);
    const [bulkId] = Array.from(ids);
    expect(bulkId).toBeDefined();
    expect(typeof bulkId).toBe('string');
    expect(bulkId!.length).toBeGreaterThan(0);

    // Lookup reveals all three entries by the group id alone.
    const group = getRevisionsByBulkId(s.container!, bulkId!);
    expect(group.map((r) => r.entry_lid).sort()).toEqual(['t1', 't2', 't3']);
  });

  it('the entries themselves are removed from container.entries', () => {
    let s = readyWith(seedContainer());
    s = selectAllTodos(s);
    s = reduce(s, { type: 'BULK_DELETE' }).state;
    expect(s.container!.entries.find((e) => e.lid === 't1')).toBeUndefined();
    expect(s.container!.entries.find((e) => e.lid === 't2')).toBeUndefined();
    expect(s.container!.entries.find((e) => e.lid === 't3')).toBeUndefined();
    // Unrelated entry untouched.
    expect(s.container!.entries.find((e) => e.lid === 'tx1')).toBeDefined();
  });
});

describe('BULK_SET_STATUS — bulk_id grouping', () => {
  it('every actually-changed entry carries the same bulk_id', () => {
    let s = readyWith(seedContainer());
    s = selectAllTodos(s);
    s = reduce(s, { type: 'BULK_SET_STATUS', status: 'done' }).state;

    const revs = s.container!.revisions;
    expect(revs.length).toBe(3);
    const ids = new Set(revs.map((r) => r.bulk_id));
    expect(ids.size).toBe(1);
    const [bulkId] = Array.from(ids);
    const group = getRevisionsByBulkId(s.container!, bulkId!);
    expect(group.map((r) => r.entry_lid).sort()).toEqual(['t1', 't2', 't3']);
  });

  it('entries whose status is already the target produce no revision — bulk_id stays scoped to actually-changed entries', () => {
    // Seed with t1 already done; t2 and t3 stay open.
    const base = seedContainer();
    base.entries[0] = {
      ...base.entries[0]!,
      body: JSON.stringify({ status: 'done', description: 'a' }),
    };
    let s = readyWith(base);
    s = selectAllTodos(s);
    s = reduce(s, { type: 'BULK_SET_STATUS', status: 'done' }).state;

    const revs = s.container!.revisions;
    // Only t2 and t3 actually changed, so 2 revisions.
    expect(revs.length).toBe(2);
    expect(revs.map((r) => r.entry_lid).sort()).toEqual(['t2', 't3']);
    const ids = new Set(revs.map((r) => r.bulk_id));
    expect(ids.size).toBe(1);
  });

  it('skips non-todo entries without emitting a revision', () => {
    let s = readyWith(seedContainer());
    // Select a text entry too.
    s = reduce(s, { type: 'SELECT_ENTRY', lid: 't1' }).state;
    s = reduce(s, { type: 'TOGGLE_MULTI_SELECT', lid: 'tx1' }).state;
    s = reduce(s, { type: 'BULK_SET_STATUS', status: 'done' }).state;
    // Exactly one revision (for t1); tx1 is not a todo.
    expect(s.container!.revisions.length).toBe(1);
    expect(s.container!.revisions[0]!.entry_lid).toBe('t1');
  });
});

describe('BULK_SET_DATE — bulk_id grouping', () => {
  it('every actually-changed entry carries the same bulk_id', () => {
    let s = readyWith(seedContainer());
    s = selectAllTodos(s);
    s = reduce(s, { type: 'BULK_SET_DATE', date: '2026-05-01' }).state;
    const revs = s.container!.revisions;
    expect(revs.length).toBe(3);
    const ids = new Set(revs.map((r) => r.bulk_id));
    expect(ids.size).toBe(1);
  });

  it('clearing the date via null still produces grouped revisions for entries that HAD a date', () => {
    // Seed with dates set.
    const base = seedContainer();
    for (const e of base.entries.slice(0, 3)) {
      const parsed = JSON.parse(e.body);
      parsed.date = '2026-05-01';
      e.body = JSON.stringify(parsed);
    }
    let s = readyWith(base);
    s = selectAllTodos(s);
    s = reduce(s, { type: 'BULK_SET_DATE', date: null }).state;
    const revs = s.container!.revisions;
    expect(revs.length).toBe(3);
    const ids = new Set(revs.map((r) => r.bulk_id));
    expect(ids.size).toBe(1);
  });
});

describe('bulk_id separation — sequential bulk actions', () => {
  it('two sequential BULK_* actions produce two distinct bulk_id groups', () => {
    let s = readyWith(seedContainer());
    s = selectAllTodos(s);
    s = reduce(s, { type: 'BULK_SET_STATUS', status: 'done' }).state;
    // Re-select and run a second action (different kind).
    s = reduce(s, { type: 'SELECT_ENTRY', lid: 't1' }).state;
    s = reduce(s, { type: 'TOGGLE_MULTI_SELECT', lid: 't2' }).state;
    s = reduce(s, { type: 'BULK_SET_DATE', date: '2026-06-01' }).state;

    const revs = s.container!.revisions;
    const bulkIds = new Set(revs.map((r) => r.bulk_id).filter(Boolean));
    // Two different bulk_ids — one per action. (We don't care about
    // the exact strings, only that there are two of them.)
    expect(bulkIds.size).toBe(2);
  });
});

describe('single-entry revisions remain bulk_id-free (regression guard)', () => {
  it('COMMIT_EDIT on an existing entry produces a revision WITHOUT bulk_id', () => {
    let s = readyWith(seedContainer());
    s = reduce(s, { type: 'BEGIN_EDIT', lid: 't1' }).state;
    s = reduce(s, {
      type: 'COMMIT_EDIT',
      lid: 't1',
      title: 'todo 1 updated',
      body: JSON.stringify({ status: 'open', description: 'edited' }),
    }).state;

    const revs = s.container!.revisions.filter((r) => r.entry_lid === 't1');
    expect(revs.length).toBe(1);
    expect(revs[0]!.bulk_id).toBeUndefined();
  });

  it('DELETE_ENTRY on a single entry produces a revision WITHOUT bulk_id', () => {
    let s = readyWith(seedContainer());
    s = reduce(s, { type: 'SELECT_ENTRY', lid: 't1' }).state;
    s = reduce(s, { type: 'DELETE_ENTRY', lid: 't1' }).state;
    const revs = s.container!.revisions.filter((r) => r.entry_lid === 't1');
    expect(revs.length).toBe(1);
    expect(revs[0]!.bulk_id).toBeUndefined();
  });
});
