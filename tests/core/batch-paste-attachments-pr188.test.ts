/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { reduce, createInitialState } from '@adapter/state/app-state';
import type { AppState } from '@adapter/state/app-state';
import type { Container } from '@core/model/container';

/**
 * PR #188 — BATCH_PASTE_ATTACHMENTS contract.
 *
 * Same per-item semantics as PASTE_ATTACHMENT, applied in one
 * reduction. The motivation is `dispatcher.dispatch` firing one
 * notify-state per call: 30 PASTE_ATTACHMENT dispatches → 30
 * sidebar renders → 30 visible "row pop in" frames during a multi-
 * file drop. Batching collapses that to one render.
 *
 * Tests pin:
 *   1. N items → N attachment entries (count + titles)
 *   2. Items reuse the same root-level ASSETS folder (auto-created
 *      once for the whole batch)
 *   3. Items reuse a SINGLE auto-created nested ASSETS subfolder
 *      when contextLid resolves to a folder
 *   4. Empty batch → no-op (identity-equal state, no events)
 *   5. blocked when readonly
 *   6. selectedLid / editingLid / phase / viewMode all unchanged
 *      (silent attach, same as single-file PASTE_ATTACHMENT)
 *   7. assets[] merged correctly per item, including
 *      `${assetKey}__original` for items with originalAssetData
 */

const T = '2026-04-28T00:00:00Z';

function emptyContainer(): Container {
  return {
    meta: { container_id: 'c1', title: 'T', created_at: T, updated_at: T, schema_version: 1 },
    entries: [],
    relations: [],
    revisions: [],
    assets: {},
  };
}

function ready(container: Container = emptyContainer()): AppState {
  const initial = createInitialState();
  const { state } = reduce(initial, { type: 'SYS_INIT_COMPLETE', container });
  return state;
}

function makeItem(name: string, key: string, contextLid: string | null = null) {
  return {
    name,
    mime: 'image/png',
    size: 4,
    assetKey: key,
    assetData: `data-${key}`,
    contextLid,
  };
}

function structuralParent(c: Container, lid: string): { lid: string; title: string } | null {
  for (const r of c.relations) {
    if (r.kind === 'structural' && r.to === lid) {
      const p = c.entries.find((e) => e.lid === r.from);
      if (p) return { lid: p.lid, title: p.title };
    }
  }
  return null;
}

describe('BATCH_PASTE_ATTACHMENTS — PR #188', () => {
  it('N items create N attachment entries', () => {
    const s = ready();
    const items = [
      makeItem('a.png', 'k1'),
      makeItem('b.png', 'k2'),
      makeItem('c.png', 'k3'),
    ];
    const { state } = reduce(s, { type: 'BATCH_PASTE_ATTACHMENTS', items });
    const atts = state.container!.entries.filter((e) => e.archetype === 'attachment');
    expect(atts.map((e) => e.title).sort()).toEqual(['a.png', 'b.png', 'c.png']);
  });

  it('items reuse the same root-level ASSETS folder (auto-created once)', () => {
    const s = ready();
    const items = [
      makeItem('a.png', 'k1'),
      makeItem('b.png', 'k2'),
      makeItem('c.png', 'k3'),
    ];
    const { state } = reduce(s, { type: 'BATCH_PASTE_ATTACHMENTS', items });
    const assetsFolders = state.container!.entries.filter(
      (e) => e.archetype === 'folder' && e.title === 'ASSETS',
    );
    expect(assetsFolders.length).toBe(1);
    const rootAssetsLid = assetsFolders[0]!.lid;
    for (const att of state.container!.entries.filter((e) => e.archetype === 'attachment')) {
      expect(structuralParent(state.container!, att.lid)?.lid).toBe(rootAssetsLid);
    }
  });

  it('items reuse a single auto-created nested ASSETS subfolder', () => {
    const c = emptyContainer();
    c.entries.push({ lid: 'fld', title: 'Project', archetype: 'folder', body: '', created_at: T, updated_at: T });
    const s = ready(c);
    const items = [
      makeItem('a.png', 'k1', 'fld'),
      makeItem('b.png', 'k2', 'fld'),
      makeItem('c.png', 'k3', 'fld'),
    ];
    const { state } = reduce(s, { type: 'BATCH_PASTE_ATTACHMENTS', items });
    const nestedAssets = state.container!.entries.filter(
      (e) => e.archetype === 'folder' && e.title === 'ASSETS',
    );
    expect(nestedAssets.length).toBe(1);
    expect(structuralParent(state.container!, nestedAssets[0]!.lid)?.lid).toBe('fld');
  });

  it('empty batch is a no-op (identity-equal state)', () => {
    const s = ready();
    const { state, events } = reduce(s, { type: 'BATCH_PASTE_ATTACHMENTS', items: [] });
    expect(state).toBe(s);
    expect(events.length).toBe(0);
  });

  it('blocked when readonly', () => {
    const s: AppState = { ...ready(), readonly: true };
    const before = s.container;
    const { state } = reduce(s, {
      type: 'BATCH_PASTE_ATTACHMENTS',
      items: [makeItem('x.png', 'k')],
    });
    expect(state.container).toBe(before);
  });

  it('does NOT mutate selectedLid / editingLid / phase / viewMode', () => {
    const s: AppState = { ...ready(), selectedLid: 'doc-x', viewMode: 'kanban' };
    const { state } = reduce(s, {
      type: 'BATCH_PASTE_ATTACHMENTS',
      items: [makeItem('a.png', 'k1'), makeItem('b.png', 'k2')],
    });
    expect(state.selectedLid).toBe('doc-x');
    expect(state.editingLid).toBe(s.editingLid);
    expect(state.phase).toBe(s.phase);
    expect(state.viewMode).toBe('kanban');
  });

  it('merges assets correctly per item, with __original suffix when provided', () => {
    const s = ready();
    const items = [
      { ...makeItem('a.png', 'k1'), assetData: 'AAAA' },
      {
        ...makeItem('b.png', 'k2'),
        assetData: 'BBBB',
        originalAssetData: 'BBBB-ORIGINAL',
      },
    ];
    const { state } = reduce(s, { type: 'BATCH_PASTE_ATTACHMENTS', items });
    expect(state.container!.assets['k1']).toBe('AAAA');
    expect(state.container!.assets['k2']).toBe('BBBB');
    expect(state.container!.assets['k2__original']).toBe('BBBB-ORIGINAL');
  });
});
