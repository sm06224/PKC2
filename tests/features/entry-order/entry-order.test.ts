import { describe, it, expect } from 'vitest';
import type { Entry } from '@core/model/record';
import {
  normalizeEntryOrder,
  snapshotEntryOrder,
  ensureEntryOrder,
  applyManualOrder,
  moveAdjacentInOrder,
} from '@features/entry-order/entry-order';

function mkEntry(lid: string, updated_at = '2026-04-01T00:00:00Z'): Entry {
  return {
    lid,
    title: lid.toUpperCase(),
    body: '',
    archetype: 'text',
    created_at: updated_at,
    updated_at,
  };
}

describe('entry-order: normalizeEntryOrder', () => {
  it('returns empty for undefined', () => {
    expect(normalizeEntryOrder(undefined, [mkEntry('a')])).toEqual([]);
  });

  it('dedupes first-wins', () => {
    const entries = [mkEntry('a'), mkEntry('b')];
    expect(normalizeEntryOrder(['a', 'b', 'a', 'b'], entries)).toEqual(['a', 'b']);
  });

  it('drops dangling lids (I-Order10)', () => {
    const entries = [mkEntry('a'), mkEntry('c')];
    expect(normalizeEntryOrder(['a', 'b', 'c'], entries)).toEqual(['a', 'c']);
  });

  it('empty order → empty result', () => {
    expect(normalizeEntryOrder([], [mkEntry('a')])).toEqual([]);
  });
});

describe('entry-order: snapshotEntryOrder', () => {
  it('sorts by updated_at desc with input-order tiebreak', () => {
    const entries = [
      mkEntry('a', '2026-01-01T00:00:00Z'),
      mkEntry('b', '2026-03-01T00:00:00Z'),
      mkEntry('c', '2026-02-01T00:00:00Z'),
      mkEntry('d', '2026-03-01T00:00:00Z'), // tie with b; input-order keeps b first
    ];
    expect(snapshotEntryOrder(entries)).toEqual(['b', 'd', 'c', 'a']);
  });

  it('empty input returns empty', () => {
    expect(snapshotEntryOrder([])).toEqual([]);
  });
});

describe('entry-order: ensureEntryOrder', () => {
  it('appends missing entries at tail (I-Order7a new-entry append)', () => {
    const entries = [mkEntry('a'), mkEntry('b'), mkEntry('c')];
    expect(ensureEntryOrder(['b', 'a'], entries)).toEqual(['b', 'a', 'c']);
  });

  it('falls back to snapshot when order is empty', () => {
    const entries = [
      mkEntry('a', '2026-01-01T00:00:00Z'),
      mkEntry('b', '2026-02-01T00:00:00Z'),
    ];
    expect(ensureEntryOrder(undefined, entries)).toEqual(['b', 'a']);
  });

  it('strips dangling and appends missing in one pass', () => {
    const entries = [mkEntry('a'), mkEntry('c'), mkEntry('d')];
    expect(ensureEntryOrder(['b', 'a', 'c'], entries)).toEqual(['a', 'c', 'd']);
  });

  it('deterministic: same input → same output', () => {
    const entries = [mkEntry('a'), mkEntry('b'), mkEntry('c')];
    const order = ['c', 'a'];
    expect(ensureEntryOrder(order, entries)).toEqual(ensureEntryOrder(order, entries));
  });
});

describe('entry-order: applyManualOrder', () => {
  it('reorders entries by given order', () => {
    const e = [mkEntry('a'), mkEntry('b'), mkEntry('c')];
    const result = applyManualOrder(e, ['c', 'a', 'b']);
    expect(result.map((x) => x.lid)).toEqual(['c', 'a', 'b']);
  });

  it('appends un-ordered entries in input order (§2.2 fallback)', () => {
    const e = [mkEntry('a'), mkEntry('b'), mkEntry('c'), mkEntry('d')];
    const result = applyManualOrder(e, ['c', 'a']);
    expect(result.map((x) => x.lid)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('skips order lids that are not in the projected entries (filter case)', () => {
    const e = [mkEntry('a'), mkEntry('c')];
    const result = applyManualOrder(e, ['b', 'a', 'c']);
    expect(result.map((x) => x.lid)).toEqual(['a', 'c']);
  });
});

describe('entry-order: moveAdjacentInOrder — basic moves', () => {
  it('move up basic: visible[1] → visible[0]', () => {
    const order = ['a', 'b', 'c'];
    const r = moveAdjacentInOrder(order, ['a', 'b', 'c'], ['a', 'b', 'c'], 'b', 'up');
    expect(r.changed).toBe(true);
    expect(r.order).toEqual(['b', 'a', 'c']);
  });

  it('move down basic: visible[0] → visible[1]', () => {
    const order = ['a', 'b', 'c'];
    const r = moveAdjacentInOrder(order, ['a', 'b', 'c'], ['a', 'b', 'c'], 'a', 'down');
    expect(r.changed).toBe(true);
    expect(r.order).toEqual(['b', 'a', 'c']);
  });

  it('top-edge up → no-op, changed=false', () => {
    const order = ['a', 'b', 'c'];
    const r = moveAdjacentInOrder(order, ['a', 'b', 'c'], ['a', 'b', 'c'], 'a', 'up');
    expect(r.changed).toBe(false);
    expect(r.order).toEqual(['a', 'b', 'c']);
  });

  it('bottom-edge down → no-op, changed=false', () => {
    const order = ['a', 'b', 'c'];
    const r = moveAdjacentInOrder(order, ['a', 'b', 'c'], ['a', 'b', 'c'], 'c', 'down');
    expect(r.changed).toBe(false);
  });

  it('target not visible → no-op', () => {
    const order = ['a', 'b', 'c'];
    const r = moveAdjacentInOrder(order, ['a', 'b'], ['a', 'b'], 'c', 'up');
    expect(r.changed).toBe(false);
  });
});

describe('entry-order: moveAdjacentInOrder — filter / global semantics (I-Order3)', () => {
  it('filter-hidden lids keep their slot position (global swap)', () => {
    // Full container: [a, x, b, y, c]. Filter hides x and y.
    // Visible under filter: [a, b, c]. Move b up in filter view.
    // Expected: global order becomes [b, x, a, y, c] — x and y slots preserved.
    const order = ['a', 'x', 'b', 'y', 'c'];
    const domain = ['a', 'b', 'c'];
    const visible = ['a', 'b', 'c'];
    const r = moveAdjacentInOrder(order, domain, visible, 'b', 'up');
    expect(r.changed).toBe(true);
    expect(r.order).toEqual(['b', 'x', 'a', 'y', 'c']);
  });

  it('swap on root set with folder-children lids interleaved in order', () => {
    // order = [root1, folderChild1, root2, root3]
    // domain = root set = [root1, root2, root3]
    // move root3 up.
    const order = ['root1', 'child1', 'root2', 'root3'];
    const domain = ['root1', 'root2', 'root3'];
    const visible = ['root1', 'root2', 'root3'];
    const r = moveAdjacentInOrder(order, domain, visible, 'root3', 'up');
    expect(r.changed).toBe(true);
    expect(r.order).toEqual(['root1', 'child1', 'root3', 'root2']);
  });

  it('moving a brand-new entry (not yet in order) inserts it correctly', () => {
    // A new entry "new" is visible at tail but not yet in order.
    // Move up should place it right before its neighbor.
    const order = ['a', 'b']; // "new" missing
    const domain = ['a', 'b', 'new'];
    const visible = ['a', 'b', 'new'];
    const r = moveAdjacentInOrder(order, domain, visible, 'new', 'up');
    expect(r.changed).toBe(true);
    expect(r.order).toEqual(['a', 'new', 'b']);
  });
});

describe('entry-order: moveAdjacentInOrder — idempotence + determinism', () => {
  it('double-swap up then down returns to original', () => {
    const order = ['a', 'b', 'c'];
    const r1 = moveAdjacentInOrder(order, ['a', 'b', 'c'], ['a', 'b', 'c'], 'b', 'up');
    expect(r1.order).toEqual(['b', 'a', 'c']);
    const r2 = moveAdjacentInOrder(r1.order, ['a', 'b', 'c'], ['b', 'a', 'c'], 'b', 'down');
    expect(r2.order).toEqual(['a', 'b', 'c']);
  });

  it('returns new array (does not mutate input)', () => {
    const order = ['a', 'b', 'c'];
    moveAdjacentInOrder(order, ['a', 'b', 'c'], ['a', 'b', 'c'], 'b', 'up');
    expect(order).toEqual(['a', 'b', 'c']);
  });
});
