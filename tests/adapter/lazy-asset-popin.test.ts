/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach } from 'vitest';
import { resolveAssetReferences } from '@features/markdown/asset-resolver';
import { drainAssetMisses, resetAssetMisses } from '@features/asset/asset-miss-recorder';
import { createDispatcher } from '@adapter/state/dispatcher';
import { createMemoryStore } from '@adapter/platform/idb-store';
import { mountWorkingSet } from '@adapter/platform/asset-working-set';
import type { Container } from '@core/model/container';

const T = '2026-06-24T00:00:00Z';

async function settle(): Promise<void> {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

beforeEach(() => resetAssetMisses());

describe('lazy asset pop-in (段階3 #868)', () => {
  it('a missing image records a miss and renders the missing marker', () => {
    const out = resolveAssetReferences('![alt](asset:K)', {
      assets: {}, // not resident (lazy)
      mimeByKey: { K: 'image/png' },
    });
    expect(out).toContain('missing asset');
    expect(out).not.toContain('data:image');
    expect(drainAssetMisses()).toContain('K'); // recorded for the manager
  });

  it('once the bytes are resident the same reference renders an inline data URI', () => {
    const out = resolveAssetReferences('![alt](asset:K)', {
      assets: { K: 'QkFTRTY0' },
      mimeByKey: { K: 'image/png' },
    });
    expect(out).toContain('data:image/png;base64,QkFTRTY0');
    expect(drainAssetMisses()).toEqual([]); // resident → no miss
  });

  it('end-to-end: render miss → working-set loads → re-render shows the image (pop-in)', async () => {
    const store = createMemoryStore();
    await store.saveAsset('c1', 'K', 'QkFTRTY0');
    const dispatcher = createDispatcher();
    const container: Container = {
      meta: { container_id: 'c1', title: 'T', created_at: T, updated_at: T, schema_version: 1 },
      entries: [{ lid: 'e1', title: 'A', body: '![alt](asset:K)', archetype: 'text', created_at: T, updated_at: T }],
      relations: [],
      revisions: [],
      assets: {}, // shallow boot — no bytes resident
    };
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });
    const ws = mountWorkingSet(dispatcher, { store });

    // 1. First render: bytes absent → marker + recorded miss.
    const ctx1 = {
      assets: dispatcher.getState().container!.assets,
      mimeByKey: { K: 'image/png' },
    };
    const first = resolveAssetReferences('![alt](asset:K)', ctx1);
    expect(first).toContain('missing asset');

    // 2. The render-after hook drains misses and loads them.
    await ws.refresh();
    await settle();

    // 3. Re-render with the now-populated working-set → image pops in.
    const ctx2 = {
      assets: dispatcher.getState().container!.assets,
      mimeByKey: { K: 'image/png' },
    };
    const second = resolveAssetReferences('![alt](asset:K)', ctx2);
    expect(second).toContain('data:image/png;base64,QkFTRTY0');
    ws.dispose();
  });
});
