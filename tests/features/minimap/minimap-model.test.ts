/**
 * @vitest-environment happy-dom
 *
 * #903 — minimap-model(抽象化バー抽出)の unit test。
 * happy-dom は layout を持たないため、getBoundingClientRect を stub して
 * 幾何を注入する。
 */
import { describe, it, expect } from 'vitest';
import { buildMinimapModel } from '@features/minimap/minimap-model';

function stubRect(el: Element, top: number, height: number): void {
  Object.defineProperty(el, 'getBoundingClientRect', {
    value: () => ({ top, height, bottom: top + height, left: 0, right: 10, width: 10, x: 0, y: top }),
    configurable: true,
  });
}

function makeScroller(html: string): HTMLElement {
  const sc = document.createElement('div');
  sc.innerHTML = html;
  document.body.appendChild(sc);
  stubRect(sc, 0, 300);
  Object.defineProperty(sc, 'scrollHeight', { value: 1000, configurable: true });
  return sc;
}

describe('buildMinimapModel', () => {
  it('block 種別を分類し、scroll 座標系の top/height を持つ', () => {
    const sc = makeScroller(
      '<h2 id="h">T</h2><p id="p">x</p><pre id="c">code</pre><table id="t"><tr><td>1</td></tr></table>',
    );
    stubRect(sc.querySelector('#h')!, 10, 20);
    stubRect(sc.querySelector('#p')!, 40, 60);
    stubRect(sc.querySelector('#c')!, 110, 80);
    stubRect(sc.querySelector('#t')!, 200, 50);
    // table 内の td 等は table(外側)に吸収される
    const m = buildMinimapModel(sc);
    expect(m.contentHeight).toBe(1000);
    expect(m.blocks.map((b) => b.kind)).toEqual(['heading', 'paragraph', 'code', 'table']);
    expect(m.blocks[0]).toMatchObject({ kind: 'heading', level: 2, top: 10, height: 20 });
    expect(m.blocks[2]).toMatchObject({ kind: 'code', top: 110, height: 80 });
  });

  it('入れ子は外側だけ採用(blockquote 内の p / ul 内の p は出ない)', () => {
    const sc = makeScroller('<blockquote id="q"><p>a</p></blockquote><ul id="l"><li><p>b</p></li></ul>');
    stubRect(sc.querySelector('#q')!, 0, 30);
    stubRect(sc.querySelector('#l')!, 40, 30);
    const m = buildMinimapModel(sc);
    expect(m.blocks.map((b) => b.kind)).toEqual(['quote', 'list']);
  });

  it('mermaid rendered/placeholder は code 扱い', () => {
    const sc = makeScroller('<div class="pkc-mermaid-rendered" id="m"><svg></svg></div>');
    stubRect(sc.querySelector('#m')!, 5, 100);
    const m = buildMinimapModel(sc);
    expect(m.blocks).toHaveLength(1);
    expect(m.blocks[0]!.kind).toBe('code');
  });
});
