/** @vitest-environment happy-dom */
/**
 * C3-c(2026-07-28):center pane のブロック窓化の**指揮**を pin する。
 *
 * ## 守るものは「速さ」ではなく「本文が消えないこと」
 *
 * 窓化の事故は例外も test failure も出ない型になる(本文の途中から先が
 * 出ない・スクロールしても続きが来ない)。サイドバー窓化(L3-S5)で
 * 実際に踏んだので、ここでは**壊れ方**を直接 pin する:
 *
 *   1. 指揮が来ない場所に置かれたら **全ブロック**へ戻る(保険)
 *   2. scroller が測れなければ窓化しない(= 全ブロック)
 *   3. spacer は `applyHeadingFold` の**後**に置かれ、top-level に居る
 *   4. `min-height` が全体の推定総高 ── 再描画中に scroll 範囲が潰れない
 *   5. scroll すると窓が動く
 */
import { describe, expect, it, vi } from 'vitest';
import {
  finalizeCenterBlockWindows,
  registerCenterBlockHost,
} from '@adapter/ui/center-block-controller';
import { applyHeadingFold } from '@features/markdown/heading-fold';
import {
  CENTER_BLOCK_DEFAULT_ESTIMATE,
  CENTER_BLOCK_OVERSCAN,
} from '@adapter/ui/center-block-window';

const N = 200;

function blocks(count = N): string[] {
  return Array.from({ length: count }, (_, i) =>
    (i % 5 === 0 ? `<h2>見出し ${i}</h2>` : `<p>段落 ${i}</p>`),
  );
}

/** 本文の要素だけ数える(spacer は除く)。 */
function contentCount(host: HTMLElement): number {
  return host.querySelectorAll('h2, p').length;
}

function mount(opts: { scrollerHeight: number }): {
  root: HTMLElement;
  scroller: HTMLElement;
  host: HTMLElement;
} {
  const root = document.createElement('div');
  const scroller = document.createElement('div');
  scroller.className = 'pkc-center-content';
  const host = document.createElement('div');
  host.className = 'pkc-view-body pkc-md-rendered';
  scroller.appendChild(host);
  root.appendChild(scroller);
  document.body.appendChild(root);
  Object.defineProperty(scroller, 'clientHeight', {
    configurable: true,
    get: () => opts.scrollerHeight,
  });
  let scrollTop = 0;
  Object.defineProperty(scroller, 'scrollTop', {
    configurable: true,
    get: () => scrollTop,
    set: (v: number) => { scrollTop = v; },
  });
  return { root, scroller, host };
}

describe('C3-c: 窓化の指揮', () => {
  it('🔴 指揮が来なければ rAF で全ブロックへ戻る(本文が切れない)', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    registerCenterBlockHost(host, blocks(), applyHeadingFold);
    expect(contentCount(host), '初回窓が全件になっている(窓化の意味がない)').toBeLessThan(N);

    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    expect(contentCount(host), '保険が効かず本文が切れたまま').toBe(N);
    expect(host.hasAttribute('data-pkc-block-window')).toBe(false);
    expect(host.style.minHeight, '窓化をやめたのに床が残っている').toBe('');
  });

  it('🔴 scroller の高さが測れなければ窓化しない(happy-dom の既定)', () => {
    const root = document.createElement('div');
    const scroller = document.createElement('div');
    scroller.className = 'pkc-center-content';
    const host = document.createElement('div');
    scroller.appendChild(host);
    root.appendChild(scroller);
    document.body.appendChild(root);

    registerCenterBlockHost(host, blocks(), applyHeadingFold);
    finalizeCenterBlockWindows(root);
    expect(contentCount(host), 'clientHeight 0 なのに窓化してしまった').toBe(N);
  });

  it('scroller が測れれば窓だけ入る', () => {
    const { root, host } = mount({ scrollerHeight: 480 });
    registerCenterBlockHost(host, blocks(), applyHeadingFold);
    finalizeCenterBlockWindows(root);

    // 高さは全部未実測 → 推定 48px。480px 分 + overscan。
    const visible = Math.ceil(480 / CENTER_BLOCK_DEFAULT_ESTIMATE) + 1 + CENTER_BLOCK_OVERSCAN;
    expect(contentCount(host)).toBeLessThanOrEqual(visible + CENTER_BLOCK_OVERSCAN);
    expect(contentCount(host)).toBeGreaterThan(0);
    expect(host.getAttribute('data-pkc-block-window')).toBe('on');
  });

  it('🔴 spacer は fold の後 = top-level に居る', () => {
    const { root, host } = mount({ scrollerHeight: 480 });
    registerCenterBlockHost(host, blocks(), applyHeadingFold);
    finalizeCenterBlockWindows(root);

    const top = host.firstElementChild as HTMLElement;
    const bottom = host.lastElementChild as HTMLElement;
    expect(top.getAttribute('data-pkc-block-spacer'), 'spacer が <details> へ吸い込まれた').toBe('top');
    expect(bottom.getAttribute('data-pkc-block-spacer')).toBe('bottom');
    // fold は効いている(= spacer より内側に <details> が居る)
    expect(host.querySelector('details.pkc-heading-fold'), 'fold が走っていない').not.toBeNull();
  });

  it('min-height が全ブロックの推定総高になる(scroll 範囲の床)', () => {
    const { root, host } = mount({ scrollerHeight: 480 });
    registerCenterBlockHost(host, blocks(), applyHeadingFold);
    finalizeCenterBlockWindows(root);
    expect(host.style.minHeight).toBe(`${N * CENTER_BLOCK_DEFAULT_ESTIMATE}px`);
  });

  it('scroll すると窓が動く(下端の段落が入れ替わる)', () => {
    const { root, scroller, host } = mount({ scrollerHeight: 480 });
    registerCenterBlockHost(host, blocks(), applyHeadingFold);
    finalizeCenterBlockWindows(root);
    const before = host.textContent ?? '';

    scroller.scrollTop = N * CENTER_BLOCK_DEFAULT_ESTIMATE / 2;
    scroller.dispatchEvent(new Event('scroll'));
    const after = host.textContent ?? '';

    expect(after, 'scroll しても窓が動いていない').not.toBe(before);
    expect(after).toContain('段落 10');
    expect(before, '窓が動いたのに先頭が残っている').toContain('見出し 0');
    expect(after).not.toContain('見出し 0');
  });

  it('scroll listener は render をまたいで 1 本に保つ', () => {
    const { root, scroller, host } = mount({ scrollerHeight: 480 });
    const add = vi.spyOn(scroller, 'addEventListener');
    const remove = vi.spyOn(scroller, 'removeEventListener');
    registerCenterBlockHost(host, blocks(), applyHeadingFold);
    finalizeCenterBlockWindows(root);
    registerCenterBlockHost(host, blocks(), applyHeadingFold);
    finalizeCenterBlockWindows(root);

    const added = add.mock.calls.filter((c) => c[0] === 'scroll').length;
    const removed = remove.mock.calls.filter((c) => c[0] === 'scroll').length;
    expect(added - removed, 'listener が積み上がっている').toBe(1);
  });
});
