/** @vitest-environment happy-dom */
/**
 * #868 bug fix(user 報告:「起動した時にランチャーの HTML が開けない、一度
 * asset として開く必要がある」):
 *
 * lazy/shallow boot では `container.assets` は空で起動し、working-set が
 * 表示中の選択 entry の依存だけを先読みする。ランチャーの tile は **選択
 * されていない** HTML attachment を開くため、その bytes は resident でなく、
 * 旧実装の `open-html-attachment` は `resolveAttachmentData` が null を返した
 * 時点で黙って break していた(= 開けない)。一度 entry を選択して「asset と
 * して開く」と proactive preload が走り bytes が載るので、その後は開けた。
 *
 * 修正:popup window は click gesture 内で同期的に開き(popup blocker 回避)、
 * bytes が resident でなければ登録済 hydrator(= workingSet.ensure)で on-demand
 * に load してから document を書く。これで初回 click で開く。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { bindActions, registerAssetHydrator } from '@adapter/ui/action-binder';
import { createDispatcher } from '@adapter/state/dispatcher';
import { drainAssetMisses, resetAssetMisses } from '@features/asset/asset-miss-recorder';
import type { Container } from '@core/model/container';

const T = '2026-06-30T00:00:00Z';
const HTML = '<!doctype html><title>App</title><h1>Hello Launcher</h1>';
const B64 = btoa(HTML);
const KEY = 'asset-app-1';

function shallowContainer(withBytes = false): Container {
  return {
    meta: { container_id: 'c', title: 'T', created_at: T, updated_at: T, schema_version: 1 },
    entries: [
      {
        lid: 'app1',
        title: 'App',
        body: JSON.stringify({
          name: 'app.html',
          mime: 'text/html',
          asset_key: KEY,
          registered_as_app: true,
        }),
        archetype: 'attachment',
        created_at: T,
        updated_at: T,
      },
    ],
    relations: [],
    revisions: [],
    // shallow boot: no asset bytes resident (the bug condition) unless asked.
    assets: withBytes ? { [KEY]: B64 } : {},
  };
}

let root: HTMLElement;
let cleanup: (() => void) | null = null;
let captured = '';

function mockWindowOpen() {
  captured = '';
  const childDoc = {
    open: vi.fn(),
    write: vi.fn((h: string) => { captured += h; }),
    close: vi.fn(),
  };
  const child = {
    closed: false,
    focus: vi.fn(),
    close: vi.fn(),
    document: childDoc,
    postMessage: vi.fn(),
  };
  vi.spyOn(window, 'open').mockReturnValue(child as unknown as Window);
  return child;
}

function clickOpen(lid: string): void {
  const btn = document.createElement('button');
  btn.setAttribute('data-pkc-action', 'open-html-attachment');
  btn.setAttribute('data-pkc-lid', lid);
  root.appendChild(btn);
  btn.click();
}

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

beforeEach(() => {
  resetAssetMisses();
  root = document.createElement('div');
  document.body.appendChild(root);
});

afterEach(() => {
  cleanup?.();
  cleanup = null;
  root.remove();
  registerAssetHydrator(null);
  resetAssetMisses();
  vi.restoreAllMocks();
});

describe('#868 launcher HTML lazy open', () => {
  it('opens on the FIRST click by hydrating the missing asset on demand', async () => {
    mockWindowOpen();
    const dispatcher = createDispatcher();
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: shallowContainer() });

    // hydrator simulates workingSet.ensure: load bytes into container.assets.
    const hydrate = vi.fn(async (keys: readonly string[]) => {
      if (keys.includes(KEY)) {
        dispatcher.dispatch({ type: 'SET_WORKING_SET_ASSETS', assets: { [KEY]: B64 } });
      }
    });
    registerAssetHydrator(hydrate);

    cleanup = bindActions(root, dispatcher);
    clickOpen('app1');

    // The popup is opened synchronously inside the gesture (popup-blocker safe).
    expect(window.open).toHaveBeenCalledTimes(1);

    await flushMicrotasks();

    // The hydrator was asked for exactly the entry's asset, and after it
    // loaded the bytes the real document was written.
    expect(hydrate).toHaveBeenCalledWith([KEY]);
    expect(captured).toContain('Hello Launcher');
  });

  it('records an asset miss so passive consumers (preview/download) also heal', () => {
    const dispatcher = createDispatcher();
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: shallowContainer() });
    cleanup = bindActions(root, dispatcher);
    // No hydrator registered. The synchronous resolve still records the miss.
    clickOpen('app1');
    expect(drainAssetMisses()).toContain(KEY);
  });

  it('opens directly when bytes are already resident (no hydrator needed)', async () => {
    mockWindowOpen();
    const dispatcher = createDispatcher();
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: shallowContainer(true) });
    // Intentionally no hydrator: resident bytes resolve on the first pass.
    cleanup = bindActions(root, dispatcher);
    clickOpen('app1');
    await flushMicrotasks();
    expect(window.open).toHaveBeenCalledTimes(1);
    expect(captured).toContain('Hello Launcher');
  });
});
