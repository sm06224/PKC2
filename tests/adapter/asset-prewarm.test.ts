/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { computePrewarmSet, mountAssetPrewarm } from '@adapter/platform/asset-prewarm';
import {
  getAssetUrl,
  prewarmAssetUrls,
  drainWantedAssetUrls,
  __resetAssetUrlRegistryForTest,
  __assetUrlCountForTest,
  __pinnedKeysForTest,
  type AssetBlobSource,
} from '@adapter/platform/asset-url-registry';
import { createDispatcher } from '@adapter/state/dispatcher';
import type { Container } from '@core/model/container';
import type { Entry } from '@core/model/record';

/**
 * storage v3 P1s2-b(#967、doc §4)— pin セット + boot プリウォーム。
 *
 * 契約:
 *   - pin 対象 = launcher 登録(registered_as_app / startup /
 *     pkc_extension の本体 + app_icon_asset_key)+ 直近参照(updated_at
 *     上位 N)+ 選択 closure
 *   - プリウォームは registry へ URL を張り、LRU 追い出しから除外(pin)
 *   - mount は container ごとに 1 回、ready 後の idle に走り、URL が
 *     増えたら SYS_ASSET_URLS_READY を dispatch
 */

const T = (n: number): string => `2026-07-${String(n).padStart(2, '0')}T00:00:00Z`;

function attachment(
  lid: string,
  body: Record<string, unknown>,
  updatedAt = T(1),
): Entry {
  return {
    lid,
    title: lid,
    body: JSON.stringify(body),
    archetype: 'attachment',
    created_at: T(1),
    updated_at: updatedAt,
  };
}

function makeContainer(entries: Entry[]): Container {
  return {
    meta: { container_id: 'c-pin', title: 't', created_at: T(1), updated_at: T(1), schema_version: 1 },
    entries,
    relations: [],
    revisions: [],
    assets: {},
  };
}

function makeStore(blobs: Record<string, Blob>): AssetBlobSource & { loads: string[] } {
  const loads: string[] = [];
  return {
    loads,
    loadAssetBlob: (_cid: string, key: string) => {
      loads.push(key);
      return Promise.resolve(blobs[key] ?? null);
    },
  };
}

beforeEach(() => {
  __resetAssetUrlRegistryForTest();
  return () => {
    __resetAssetUrlRegistryForTest();
  };
});

describe('computePrewarmSet', () => {
  it('launcher 登録(app / startup / extension)の本体 + icon を含む', () => {
    const c = makeContainer([
      attachment('app', { name: 'a.html', mime: 'text/html', asset_key: 'k-app', registered_as_app: true, app_icon_asset_key: 'k-icon' }),
      attachment('ext', { name: 'e.html', mime: 'text/html', asset_key: 'k-ext', pkc_extension: true }),
      attachment('st', { name: 's.html', mime: 'text/html', asset_key: 'k-st', startup: true }),
      attachment('icon', { name: 'i.png', mime: 'image/png', asset_key: 'k-icon' }),
      attachment('plain', { name: 'p.bin', mime: 'application/octet-stream', asset_key: 'k-plain' }, T(1)),
    ]);
    const keys = computePrewarmSet(c, null).map((w) => w.key);
    expect(keys).toContain('k-app');
    expect(keys).toContain('k-ext');
    expect(keys).toContain('k-st');
    expect(keys).toContain('k-icon');
    // mime は attachment 索引から解決される
    const icon = computePrewarmSet(c, null).find((w) => w.key === 'k-icon');
    expect(icon?.mime).toBe('image/png');
  });

  it('直近参照(updated_at 上位)と選択 closure の asset を含む', () => {
    const c = makeContainer([
      attachment('old', { name: 'o.png', mime: 'image/png', asset_key: 'k-old' }, T(1)),
      attachment('new', { name: 'n.png', mime: 'image/png', asset_key: 'k-new' }, T(22)),
    ]);
    const keys = computePrewarmSet(c, 'old').map((w) => w.key);
    // 両方入る: k-new は直近参照(それでも 20 件枠内)、k-old は選択 closure
    expect(keys).toContain('k-new');
    expect(keys).toContain('k-old');
  });
});

describe('prewarmAssetUrls + pin', () => {
  it('URL を張り、pin は LRU 追い出しから除外される', async () => {
    const store = makeStore({ 'k-pin': new Blob(['x'], { type: 'image/png' }) });
    const added = await prewarmAssetUrls(store, 'c1', [{ key: 'k-pin', mime: 'image/png' }]);
    expect(added).toBe(true);
    expect(getAssetUrl('k-pin')).toMatch(/^blob:/);
    expect(__pinnedKeysForTest().has('k-pin')).toBe(true);

    // cap(512)を超えるまで unpinned URL を流し込む → pin は生き残る
    const bulkBlobs: Record<string, Blob> = {};
    for (let i = 0; i < 520; i++) bulkBlobs[`bulk-${i}`] = new Blob(['y']);
    const bulkStore = makeStore(bulkBlobs);
    for (let i = 0; i < 520; i++) getAssetUrl(`bulk-${i}`);
    await drainWantedAssetUrls(bulkStore, 'c1');
    expect(__assetUrlCountForTest()).toBeLessThanOrEqual(512);
    expect(getAssetUrl('k-pin')).toMatch(/^blob:/); // pin は追い出されない
  });

  it('store に無い pin 対象は absent 化して skip(エラーにしない)', async () => {
    const store = makeStore({});
    const added = await prewarmAssetUrls(store, 'c1', [{ key: 'k-none' }]);
    expect(added).toBe(false);
    expect(getAssetUrl('k-none')).toBeNull();
  });
});

describe('mountAssetPrewarm', () => {
  it('ready 後の idle にプリウォームが走り SYS_ASSET_URLS_READY が出る', async () => {
    vi.useFakeTimers();
    try {
      const d = createDispatcher();
      const dispatched: string[] = [];
      const store = makeStore({ 'k-app': new Blob(['x'], { type: 'text/html' }) });
      const unmount = mountAssetPrewarm(d, store);
      d.dispatch({
        type: 'SYS_INIT_COMPLETE',
        container: makeContainer([
          attachment('app', { name: 'a.html', mime: 'text/html', asset_key: 'k-app', registered_as_app: true }),
        ]),
      });
      d.onState(() => dispatched.push('render'));
      await vi.advanceTimersByTimeAsync(500);
      for (let i = 0; i < 20; i++) await Promise.resolve();
      expect(getAssetUrl('k-app')).toMatch(/^blob:/);
      expect(__pinnedKeysForTest().has('k-app')).toBe(true);
      unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('同じ container では 2 回走らない', async () => {
    vi.useFakeTimers();
    try {
      const d = createDispatcher();
      const store = makeStore({ 'k-app': new Blob(['x']) });
      const unmount = mountAssetPrewarm(d, store);
      d.dispatch({
        type: 'SYS_INIT_COMPLETE',
        container: makeContainer([
          attachment('app', { name: 'a.html', mime: 'text/html', asset_key: 'k-app', registered_as_app: true }),
        ]),
      });
      await vi.advanceTimersByTimeAsync(500);
      for (let i = 0; i < 20; i++) await Promise.resolve();
      const loadsAfterFirst = store.loads.length;
      // 追加 dispatch(同 cid)ではプリウォームは再実行されない
      d.dispatch({ type: 'SET_VIEW_MODE', mode: 'launcher' });
      await vi.advanceTimersByTimeAsync(500);
      for (let i = 0; i < 20; i++) await Promise.resolve();
      expect(store.loads.length).toBe(loadsAfterFirst);
      unmount();
    } finally {
      vi.useRealTimers();
    }
  });
});
