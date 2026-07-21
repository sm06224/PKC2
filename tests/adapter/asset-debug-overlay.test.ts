/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach } from 'vitest';
import { mountAssetDebugOverlay } from '@adapter/ui/asset-debug-overlay';
import { createContainerStore } from '@adapter/platform/idb-store';
import { createMemoryAdapter } from '@adapter/platform/storage/memory-adapter';
import { createDispatcher } from '@adapter/state/dispatcher';
import type { Container } from '@core/model/container';

/**
 * #956 — `?pkc-debug=assets` 診断 overlay。
 * user 報告(HTML/URL が Light export 扱いで開けない)の切り分け導線:
 * 「resident(container.assets)」と「store 実体」を突き合わせて表示する。
 */

const T = '2026-07-22T00:00:00Z';

function makeContainer(assets: Record<string, string>): Container {
  return {
    meta: { container_id: 'dbg', title: 't', created_at: T, updated_at: T, schema_version: 1 },
    entries: [
      {
        lid: 'a1', title: 'App', archetype: 'attachment',
        body: JSON.stringify({ name: 'a.html', mime: 'text/html', asset_key: 'k1' }),
        created_at: T, updated_at: T,
      },
      {
        lid: 'a2', title: 'Broken', archetype: 'attachment',
        body: JSON.stringify({ name: 'b.html', mime: 'text/html', asset_key: 'k-missing' }),
        created_at: T, updated_at: T,
      },
    ],
    relations: [], revisions: [], assets,
  };
}

function overlay(): HTMLElement | null {
  return document.querySelector('[data-pkc-region="asset-debug-overlay"]');
}

const tick = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  document.body.innerHTML = '';
  window.history.replaceState({}, '', '/');
  return () => {
    document.body.innerHTML = '';
    window.history.replaceState({}, '', '/');
  };
});

describe('?pkc-debug=assets 診断 overlay(#956)', () => {
  it('debug flag なしでは完全 no-op', async () => {
    const store = createContainerStore(createMemoryAdapter());
    const d = createDispatcher();
    mountAssetDebugOverlay(d, store);
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer({}) });
    await tick(1100);
    expect(overlay()).toBeNull();
  });

  it('flag ON: resident / store / 欠落 を突き合わせて表示する', async () => {
    window.history.replaceState({}, '', '/?pkc-debug=assets');
    const store = createContainerStore(createMemoryAdapter());
    // store には k1 だけ保存(k-missing は本当に欠落しているケース)
    await store.saveAsset('dbg', 'k1', 'QUJD');
    const d = createDispatcher();
    mountAssetDebugOverlay(d, store);
    // resident には k1 も無い(shallow boot 相当)→ k1 は「store にはある」判定
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer({}) });
    await tick(1200);

    const el = overlay();
    expect(el).not.toBeNull();
    const text = el!.textContent ?? '';
    // header に環境情報
    expect(text).toContain('backendPref=');
    expect(text).toContain('lightSource=false');
    expect(text).toContain('differentialSave=');
    // k1: store にはある(working-set 未回復)
    expect(text).toContain('working-set 未回復');
    // k-missing: store にも無い(bytes 欠落)
    expect(text).toContain('bytes 欠落');
    // 欠落行は data-pkc-debug-bad でマークされる
    expect(el!.querySelectorAll('[data-pkc-debug-bad="true"]').length).toBe(2);
  });

  it('resident な asset は OK 判定', async () => {
    window.history.replaceState({}, '', '/?pkc-debug=assets');
    const store = createContainerStore(createMemoryAdapter());
    await store.saveAsset('dbg', 'k1', 'QUJD');
    const d = createDispatcher();
    mountAssetDebugOverlay(d, store);
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer({ k1: 'QUJD' }) });
    await tick(1200);
    expect(overlay()!.textContent).toContain('OK(resident)');
  });
});
