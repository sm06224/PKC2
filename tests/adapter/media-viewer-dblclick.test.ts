/**
 * @vitest-environment happy-dom
 *
 * 2026-07-12 user 要望「コードブロックと画像をシングルクリックしたときに
 * 別ウィンドウで開く動作をダブルクリックにして欲しい」の挙動テスト。
 * state → consumer 観測点:bindActions 済み document 上で、md-block / 画像への
 * **シングルクリックでは viewer が開かず**、**ダブルクリックで開く**ことを
 * isMediaViewerOpen() で観測する。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher } from '@adapter/state/dispatcher';
import { isMediaViewerOpen, closeMediaViewer } from '@adapter/ui/media-viewer';

let root: HTMLElement;
let cleanup: (() => void) | null = null;

function flush(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

function mountRenderedBlock(): HTMLElement {
  const rendered = document.createElement('div');
  rendered.className = 'pkc-md-rendered';
  const block = document.createElement('div');
  block.className = 'pkc-md-block';
  block.innerHTML = '<pre><code>const x = 1;</code></pre>';
  rendered.appendChild(block);
  root.appendChild(rendered);
  return block;
}

function mountRenderedImage(): HTMLImageElement {
  const rendered = document.createElement('div');
  rendered.className = 'pkc-md-rendered';
  const img = document.createElement('img');
  img.src = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
  rendered.appendChild(img);
  root.appendChild(rendered);
  return img;
}

beforeEach(() => {
  cleanup?.();
  closeMediaViewer();
  document.body.innerHTML = '';
  root = document.createElement('div');
  root.id = 'pkc-root';
  document.body.appendChild(root);
  const dispatcher = createDispatcher();
  cleanup = bindActions(root, dispatcher);
});

describe('media viewer open: click → dblclick(2026-07-12)', () => {
  it('コードブロック:シングルクリックでは開かない', async () => {
    const block = mountRenderedBlock();
    block.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    expect(isMediaViewerOpen()).toBe(false);
  });

  it('コードブロック:ダブルクリックで開く', async () => {
    const block = mountRenderedBlock();
    block.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await flush();
    expect(isMediaViewerOpen()).toBe(true);
  });

  it('画像:シングルクリックでは開かず、ダブルクリックで開く', async () => {
    const img = mountRenderedImage();
    img.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    expect(isMediaViewerOpen()).toBe(false);
    img.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await flush();
    expect(isMediaViewerOpen()).toBe(true);
  });
});
