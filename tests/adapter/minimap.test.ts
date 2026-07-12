/**
 * @vitest-environment happy-dom
 *
 * #903 — minimap adapter(syncMinimap)の wiring test。
 * flag OFF で完全 no-op / ON でバー + viewport 描画 / クリック → scroller の
 * scrollTop が実際に変わる(consumer 観測点)/ 再 sync 冪等。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { syncMinimap } from '@adapter/ui/minimap';
import { setContainerFlagSource, __resetRegistry, __resetUrlCache } from '@adapter/flags';
// flag 定義を評価させる(defineFlag は import 時登録)
import '@adapter/ui/shell-flags';

function stubRect(el: Element, top: number, height: number): void {
  Object.defineProperty(el, 'getBoundingClientRect', {
    value: () => ({ top, height, bottom: top + height, left: 0, right: 14, width: 14, x: 0, y: top }),
    configurable: true,
  });
}

let root: HTMLElement;
let scroller: HTMLElement;

beforeEach(() => {
  __resetUrlCache();
  setContainerFlagSource({});
  document.body.innerHTML = '';
  root = document.createElement('div');
  root.id = 'pkc-root';
  const center = document.createElement('section');
  center.className = 'pkc-center';
  scroller = document.createElement('div');
  scroller.className = 'pkc-center-content';
  scroller.innerHTML = '<h1 id="h">T</h1><p id="p">body</p><pre id="c">code</pre>';
  center.appendChild(scroller);
  root.appendChild(center);
  document.body.appendChild(root);
  // 幾何 stub:content 3000px、viewport 300px
  stubRect(scroller, 0, 300);
  stubRect(scroller.querySelector('#h')!, 0, 30);
  stubRect(scroller.querySelector('#p')!, 40, 1000);
  stubRect(scroller.querySelector('#c')!, 1100, 500);
  Object.defineProperty(scroller, 'scrollHeight', { value: 3000, configurable: true });
  Object.defineProperty(scroller, 'clientHeight', { value: 300, configurable: true });
});

describe('syncMinimap(#903)', () => {
  it('flag OFF(既定)→ minimap は描画されない', () => {
    syncMinimap(root);
    expect(root.querySelector('[data-pkc-region="minimap"]')).toBeNull();
  });

  it('flag ON → バー(kind 別)+ viewport indicator が描画される', () => {
    setContainerFlagSource({ 'shell.minimap_enabled': true });
    syncMinimap(root);
    const map = root.querySelector<HTMLElement>('[data-pkc-region="minimap"]');
    expect(map).not.toBeNull();
    const kinds = Array.from(map!.querySelectorAll('.pkc-minimap-bar')).map((b) =>
      b.getAttribute('data-pkc-minimap-kind'),
    );
    expect(kinds).toEqual(['heading', 'paragraph', 'code']);
    expect(map!.querySelector('.pkc-minimap-viewport')).not.toBeNull();
  });

  it('minimap クリック → scroller.scrollTop が実際に動く(consumer 観測点)', () => {
    setContainerFlagSource({ 'shell.minimap_enabled': true });
    syncMinimap(root);
    const map = root.querySelector<HTMLElement>('[data-pkc-region="minimap"]')!;
    stubRect(map, 0, 300); // map の描画高 300px
    expect(scroller.scrollTop).toBe(0);
    // 下半分(y=240 → ratio 0.8)をクリック → 0.8*3000 - 150 = 2250
    map.dispatchEvent(new MouseEvent('click', { bubbles: true, clientY: 240 }));
    expect(scroller.scrollTop).toBe(2250);
  });

  it('再 sync は冪等(minimap は常に 1 個)', () => {
    setContainerFlagSource({ 'shell.minimap_enabled': true });
    syncMinimap(root);
    syncMinimap(root);
    expect(root.querySelectorAll('[data-pkc-region="minimap"]')).toHaveLength(1);
  });

  it('ON → OFF で撤去される', () => {
    setContainerFlagSource({ 'shell.minimap_enabled': true });
    syncMinimap(root);
    expect(root.querySelector('[data-pkc-region="minimap"]')).not.toBeNull();
    setContainerFlagSource({ 'shell.minimap_enabled': false });
    syncMinimap(root);
    expect(root.querySelector('[data-pkc-region="minimap"]')).toBeNull();
  });
});
