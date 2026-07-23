/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getAssetUrl,
  drainWantedAssetUrls,
  mountAssetUrlRegistry,
  __resetAssetUrlRegistryForTest,
  __assetUrlCountForTest,
  type AssetBlobSource,
} from '@adapter/platform/asset-url-registry';
import { createDispatcher } from '@adapter/state/dispatcher';
import { resolveImageDataUrl } from '@adapter/ui/attachment-presenter';
import { resetAssetMisses } from '@features/asset/asset-miss-recorder';
import type { Container } from '@core/model/container';

/**
 * storage v3 P1s2-a(#967)— asset ObjectURL registry。
 *
 * 契約:
 *   - 同期 get: hit → blob: URL(bytes ヒープ外)、miss → wanted 記録 + null
 *   - drain: store.loadAssetBlob で解決 → URL 生成。無い key は absent
 *     (TTL)で再試行抑止
 *   - mount: URL が増えたら SYS_ASSET_URLS_READY で再 render を促す。
 *     container 切替(cid 変化)で全 revoke
 *   - 消費点(resolveImageDataUrl)は registry 優先、miss は従来 fallback
 */

const T = '2026-07-22T00:00:00Z';

function makeContainer(cid = 'c-p1s2'): Container {
  return {
    meta: { container_id: cid, title: 't', created_at: T, updated_at: T, schema_version: 1 },
    entries: [],
    relations: [],
    revisions: [],
    assets: {},
  };
}

function makeStore(blobs: Record<string, Blob>): AssetBlobSource & { loads: string[] } {
  const loads: string[] = [];
  return {
    loads,
    loadAssetBlob: (cid: string, key: string) => {
      loads.push(`${cid}:${key}`);
      return Promise.resolve(blobs[key] ?? null);
    },
  };
}

beforeEach(() => {
  __resetAssetUrlRegistryForTest();
  resetAssetMisses();
  return () => {
    __resetAssetUrlRegistryForTest();
    resetAssetMisses();
  };
});

describe('registry 単体', () => {
  it('miss → wanted → drain → hit(blob: URL)', async () => {
    const store = makeStore({ k1: new Blob(['x'], { type: 'image/png' }) });
    expect(getAssetUrl('k1', 'image/png')).toBeNull(); // wanted 記録
    const added = await drainWantedAssetUrls(store, 'c1');
    expect(added).toBe(true);
    const url = getAssetUrl('k1');
    expect(url).toMatch(/^blob:/);
    // 2 回目の get で追加ロードは走らない
    await drainWantedAssetUrls(store, 'c1');
    expect(store.loads).toEqual(['c1:k1']);
  });

  it('store に無い key は absent 化され再試行しない(TTL 内)', async () => {
    const store = makeStore({});
    getAssetUrl('missing');
    await drainWantedAssetUrls(store, 'c1');
    expect(store.loads).toEqual(['c1:missing']);
    // absent 中の get は wanted を積まない
    expect(getAssetUrl('missing')).toBeNull();
    const added = await drainWantedAssetUrls(store, 'c1');
    expect(added).toBe(false);
    expect(store.loads).toEqual(['c1:missing']); // 追加ロードなし
  });

  it('mime 指定は Blob type に反映される', async () => {
    const store = makeStore({ k2: new Blob(['v']) }); // type なし record
    getAssetUrl('k2', 'video/webm');
    await drainWantedAssetUrls(store, 'c1');
    expect(getAssetUrl('k2')).toMatch(/^blob:/);
  });
});

describe('mount(dispatcher 配線)', () => {
  it('render 後 drain → SYS_ASSET_URLS_READY で再 render が走る', async () => {
    const d = createDispatcher();
    const store = makeStore({ k1: new Blob(['x'], { type: 'image/png' }) });
    const unmount = mountAssetUrlRegistry(d, store);
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });

    // 描画相当: registry miss を発生させ、onState を起こす
    expect(getAssetUrl('k1', 'image/png')).toBeNull();
    d.dispatch({ type: 'SET_VIEW_MODE', mode: 'launcher' });

    // drain は非同期 — URL が張られるまで待つ
    for (let i = 0; i < 50 && __assetUrlCountForTest() === 0; i++) {
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(getAssetUrl('k1')).toMatch(/^blob:/);
    unmount();
  });

  it('container 切替(cid 変化)で全 revoke', async () => {
    const d = createDispatcher();
    const store = makeStore({ k1: new Blob(['x']) });
    const unmount = mountAssetUrlRegistry(d, store);
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer('cid-a') });
    getAssetUrl('k1');
    await drainWantedAssetUrls(store, 'cid-a');
    expect(__assetUrlCountForTest()).toBe(1);
    // cid が変わる container 差し替え
    d.dispatch({ type: 'SYS_IMPORT_COMPLETE', container: makeContainer('cid-b'), source: 'test' });
    expect(__assetUrlCountForTest()).toBe(0);
    unmount();
  });
});

describe('消費点: resolveImageDataUrl の registry 優先', () => {
  it('registry hit なら base64 が無くても blob: URL を返す', async () => {
    const store = makeStore({ img1: new Blob(['png-bytes'], { type: 'image/png' }) });
    getAssetUrl('img1', 'image/png');
    await drainWantedAssetUrls(store, 'c1');
    const url = resolveImageDataUrl(
      { name: 'a.png', mime: 'image/png', asset_key: 'img1' },
      {}, // base64 非常駐
    );
    expect(url).toMatch(/^blob:/);
  });

  it('registry miss は従来どおり base64 fallback(data: URI)', () => {
    const url = resolveImageDataUrl(
      { name: 'b.png', mime: 'image/png', asset_key: 'img2' },
      { img2: 'QUJD' },
    );
    expect(url).toBe('data:image/png;base64,QUJD');
  });
});
