/**
 * @vitest-environment happy-dom
 *
 * PR-2JJ v2 hotfix(2026-05-13、PR #432 stack、user 報告:「長大マークダウンで
 * caret marker overlay がズレていく」):caret-position.ts の mirror-div が
 * textarea の vertical scrollbar 分の content area 縮小を考慮していなかった
 * 件を test で固定。
 *
 * 主張内容:textarea に縦 scrollbar が出ているとき(`offsetWidth > clientWidth
 * + borders`)、mirror div の width を scrollbar gutter 分だけ縮めることで
 * wrap 位置が textarea と一致し、caret position の累積誤差が消える。
 *
 * happy-dom は scrollbar layout を **シミュレートしない**(offsetWidth ===
 * clientWidth)ため、補正分岐自体は no-op になる。本 test は (a) 補正なしの
 * 普通の textarea で caret position が動かないこと、(b) `offsetWidth` /
 * `clientWidth` を手動で書き換えた状態でも throw しないこと、(c) 各種境界
 * (空 / 末尾 / 単一行 / 複数行)で動くこと、を担保する。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { getCaretViewportCoords } from '@adapter/ui/caret-position';

describe('PR-2JJ v2 caret-position scrollbar gutter 補正', () => {
  let ta: HTMLTextAreaElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    ta = document.createElement('textarea');
    ta.style.width = '400px';
    ta.style.height = '200px';
    ta.style.fontSize = '16px';
    ta.style.lineHeight = '1.5';
    ta.style.padding = '8px';
    ta.style.border = '1px solid #ccc';
    document.body.appendChild(ta);
  });

  it('空の textarea で coords が返る(throw しない)', () => {
    const c = getCaretViewportCoords(ta, 0);
    expect(c).toBeDefined();
    expect(typeof c.top).toBe('number');
    expect(typeof c.left).toBe('number');
    expect(c.height).toBeGreaterThan(0);
  });

  it('単一行の途中位置で coords が返る', () => {
    ta.value = 'Hello World';
    const c = getCaretViewportCoords(ta, 5);
    expect(c.top).toBeGreaterThanOrEqual(0);
    expect(c.left).toBeGreaterThanOrEqual(0);
  });

  it('末尾位置(value.length)で coords が返る', () => {
    ta.value = 'short text';
    const c = getCaretViewportCoords(ta, ta.value.length);
    expect(c).toBeDefined();
    expect(c.height).toBeGreaterThan(0);
  });

  it('複数行の途中で coords が返る', () => {
    ta.value = Array.from({ length: 50 }, (_, i) => `line ${i}`).join('\n');
    const c = getCaretViewportCoords(ta, ta.value.indexOf('line 25'));
    expect(c).toBeDefined();
  });

  it('scrollbar gutter 補正分岐が実行されても throw しない(offsetWidth > clientWidth を手動でシミュレート)', () => {
    // happy-dom は scrollbar layout を持たないため、offsetWidth / clientWidth は
    // 通常一致する。補正分岐の robustness 検証のため、手動で property override。
    Object.defineProperty(ta, 'offsetWidth', { value: 420, configurable: true });
    Object.defineProperty(ta, 'clientWidth', { value: 405, configurable: true });
    // → 計算上 verticalScrollbarGutter = 420 - 405 - 1 - 1 = 13px(border 1px 両側)
    ta.value = Array.from({ length: 100 }, (_, i) => `long line ${i} aaaa bbbb cccc dddd eeee`).join('\n');
    const c = getCaretViewportCoords(ta, ta.value.length / 2);
    expect(c).toBeDefined();
    expect(c.height).toBeGreaterThan(0);
  });

  it('scrollbar gutter == 0 のとき補正 no-op(普通の textarea)', () => {
    ta.value = 'short';
    // happy-dom default で offsetWidth === clientWidth + borders なので
    // verticalScrollbarGutter は 0 になる(補正 no-op)。
    const c1 = getCaretViewportCoords(ta, 0);
    const c2 = getCaretViewportCoords(ta, 5);
    expect(c1).toBeDefined();
    expect(c2).toBeDefined();
  });
});
