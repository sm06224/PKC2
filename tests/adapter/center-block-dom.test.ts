/** @vitest-environment happy-dom */
/**
 * C3-b(2026-07-28):ブロック配列を DOM へ入れる部分の pin。
 *
 * ## 守るもの
 *
 * 1. **ラッパ要素を足していない** ── PKC2 の CSS は
 *    `.pkc-md-rendered > h2 + p` のような子孫・隣接セレクタを多用するので、
 *    ブロックごとに包んだ瞬間に見た目が変わる。C3 は挙動不変で入る必要がある
 * 2. **配置の記録が正しい** ── 1 ブロックが 0 個または複数の子要素を生む
 *    ケースでも index → 要素の対応が崩れない
 *
 * ⚠ 高さの計測(`measureVisibleBlockHeights`)は happy-dom では検証できない
 *   (rect が全部 0)。実機の smoke で pin する。
 */
import { describe, expect, it } from 'vitest';
import {
  applyBlockSpacers,
  elementsOfBlock,
  fillBlocks,
  measureVisibleBlockHeights,
} from '@adapter/ui/center-block-dom';

function host(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

describe('C3-b: ブロックを DOM へ入れる', () => {
  it('🔴 ラッパ要素を足さない ── join した HTML と同じ DOM になる', () => {
    const blocks = ['<h2>見出し</h2>', '<p>段落</p>', '<ul><li>a</li><li>b</li></ul>'];
    const a = host();
    fillBlocks(a, blocks);

    const b = host();
    b.innerHTML = blocks.join('');

    expect(a.innerHTML, 'ブロック経由で入れると DOM が変わっている').toBe(b.innerHTML);
    expect(a.children.length, '余計な要素が挟まっている').toBe(b.children.length);
  });

  it('配置の記録: 各ブロックの要素が index から引ける', () => {
    const h = host();
    const p = fillBlocks(h, ['<h2>A</h2>', '<p>B</p>', '<p>C</p>']);
    expect(p.ranges.length).toBe(3);
    expect(elementsOfBlock(h, p, 0)[0]?.tagName).toBe('H2');
    expect(elementsOfBlock(h, p, 1)[0]?.textContent).toBe('B');
    expect(elementsOfBlock(h, p, 2)[0]?.textContent).toBe('C');
  });

  it('1 ブロックが複数要素を生んでも範囲で追える', () => {
    const h = host();
    const p = fillBlocks(h, ['<h2>A</h2><p>A-sub</p>', '<p>B</p>']);
    const first = elementsOfBlock(h, p, 0);
    expect(first.length, '複数要素のブロックを 1 個しか拾えていない').toBe(2);
    expect(first[0]?.tagName).toBe('H2');
    expect(first[1]?.textContent).toBe('A-sub');
    expect(elementsOfBlock(h, p, 1)[0]?.textContent).toBe('B');
  });

  it('空ブロックがあっても以降の index がずれない', () => {
    const h = host();
    const p = fillBlocks(h, ['<p>A</p>', '', '<p>C</p>']);
    expect(elementsOfBlock(h, p, 0)[0]?.textContent).toBe('A');
    expect(elementsOfBlock(h, p, 1).length, '空ブロックが要素を生んでいる').toBe(0);
    expect(elementsOfBlock(h, p, 2)[0]?.textContent, 'index がずれた').toBe('C');
  });

  it('範囲外の index は空配列(例外にしない)', () => {
    const h = host();
    const p = fillBlocks(h, ['<p>A</p>']);
    expect(elementsOfBlock(h, p, -1)).toEqual([]);
    expect(elementsOfBlock(h, p, 99)).toEqual([]);
  });

  it('入れ直すと前の中身が残らない', () => {
    const h = host();
    fillBlocks(h, ['<p>old</p>']);
    fillBlocks(h, ['<p>new</p>']);
    expect(h.textContent).toBe('new');
  });
});

describe('C3-b: spacer', () => {
  it('前後に spacer を置き、2 回目は作り直さず高さだけ更新する', () => {
    const h = host();
    fillBlocks(h, ['<p>A</p>']);
    applyBlockSpacers(h, 100, 200);
    const top1 = h.firstElementChild;
    const bottom1 = h.lastElementChild;
    expect(top1?.getAttribute('data-pkc-block-spacer')).toBe('top');
    expect(bottom1?.getAttribute('data-pkc-block-spacer')).toBe('bottom');
    expect((top1 as HTMLElement).style.height).toBe('100px');

    applyBlockSpacers(h, 50, 60);
    expect(h.firstElementChild, 'spacer を作り直している').toBe(top1);
    expect(h.lastElementChild).toBe(bottom1);
    expect((h.firstElementChild as HTMLElement).style.height).toBe('50px');
  });

  it('負の高さは 0 に丸める(scrollHeight を壊さない)', () => {
    const h = host();
    fillBlocks(h, ['<p>A</p>']);
    applyBlockSpacers(h, -10, -20);
    expect((h.firstElementChild as HTMLElement).style.height).toBe('0px');
    expect((h.lastElementChild as HTMLElement).style.height).toBe('0px');
  });

  it('spacer は押せない・読み上げられない', () => {
    const h = host();
    fillBlocks(h, ['<p>A</p>']);
    applyBlockSpacers(h, 10, 10);
    const top = h.firstElementChild as HTMLElement;
    expect(top.getAttribute('aria-hidden')).toBe('true');
    expect(top.style.pointerEvents).toBe('none');
  });
});

describe('C3-b: 高さ計測は「測れないなら測らない」', () => {
  it('viewport の高さが 0 なら何も返さない', () => {
    const h = host();
    const p = fillBlocks(h, ['<p>A</p>', '<p>B</p>']);
    const scroller = document.createElement('div');
    // happy-dom は rect が全部 0 ── これは「測れない」状態そのもの
    expect(measureVisibleBlockHeights(h, scroller, p).size).toBe(0);
  });
});
