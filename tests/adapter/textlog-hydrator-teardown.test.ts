/** @vitest-environment happy-dom */
/**
 * textlog hydrator の先読み tick が disconnect で止まる(B9、2026-07-27)。
 *
 * 🔴 見つけた形: `scheduleLookahead()` の `tick` は自分を再スケジュールし続ける
 * (スクロール中は setTimeout、それ以外は requestIdleCallback / rAF)のに、
 * **止める手段が無かった**。presenter を畳んでも連鎖は生き続け、
 *   - `docEl.querySelectorAll` は**剥がれた DOM でも要素を返す**ので
 *     tick は「まだ仕事がある」と判断して回り続け、
 *   - closure が docEl / ctxMap / renderFn を掴んだままなので
 *     **剥がれた記事ツリーごと解放されない**
 * ── 表示を切り替えるたびに 1 本ずつ増える(上限なし)。
 *
 * pin: disconnect した後、時間をいくら進めても render が増えないこと。
 * これは「hydrate されない」の pin ではなく **「剥がれた木を掴み続けない」**
 * の pin である(render 呼び出し = 生きている連鎖の観測点)。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachHydrator } from '../../src/adapter/ui/textlog-hydrator';

/** rAF / rIC を fake timer 経由にして、tick 連鎖を時間で駆動できるようにする。 */
function stubSchedulers(): void {
  vi.stubGlobal('requestAnimationFrame', ((fn: () => void) =>
    setTimeout(fn, 16) as unknown as number) as typeof requestAnimationFrame);
  // requestIdleCallback は happy-dom に無いので、在る場合と同じ経路を作る
  vi.stubGlobal('requestIdleCallback', ((fn: () => void) =>
    setTimeout(fn, 1) as unknown as number) as unknown as typeof globalThis.requestAnimationFrame);
  class FakeIO {
    constructor(private readonly cb: IntersectionObserverCallback) {
      void this.cb;
    }
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }
  vi.stubGlobal('IntersectionObserver', FakeIO as unknown as typeof IntersectionObserver);
}

function buildDoc(count: number): { docEl: HTMLElement; ctxMap: Map<string, never> } {
  const docEl = document.createElement('div');
  const ctxMap = new Map<string, never>();
  for (let i = 0; i < count; i++) {
    const ph = document.createElement('article');
    ph.setAttribute('data-pkc-hydrated', 'false');
    ph.setAttribute('data-pkc-log-id', `log-${i}`);
    docEl.appendChild(ph);
    ctxMap.set(`log-${i}`, {
      lid: 'e1',
      log: { id: `log-${i}`, body: `本文 ${i}` },
    } as never);
  }
  document.body.appendChild(docEl);
  return { docEl, ctxMap };
}

describe('textlog hydrator の teardown(B9)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    stubSchedulers();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('スクロール中に disconnect しても tick 連鎖が残らない', async () => {
    // 🔴 **これが本命の経路**。先読みだけなら上限(lookaheadArticleCount)で
    // 自然に止まるので、guard が無くても素通りする ── 実際、最初に書いた
    // 「disconnect 後に render が増えない」だけの pin は**無しでも通った**。
    // 止まらないのは **scrolling 分岐**: `setTimeout(tick, SCROLL_SETTLE_MS)` を
    // 無条件で張り直すうえ、disconnect は settleTimer を消すだけで
    // `scrolling` を false に戻さないので、**永久に 160ms 間隔で回り続ける**。
    // 観測点は render ではなく**保留タイマー数**(連鎖が生きている証拠)。
    const { docEl, ctxMap } = buildDoc(50);
    const render = vi.fn((): HTMLElement => document.createElement('section'));
    const handle = attachHydrator(docEl, ctxMap as never, render as never);

    // スクロール中にする(capture で document に届く)
    document.dispatchEvent(new Event('scroll'));
    await vi.advanceTimersByTimeAsync(20);

    handle.disconnect();
    docEl.remove();

    await vi.advanceTimersByTimeAsync(5_000);
    expect(
      vi.getTimerCount(),
      'disconnect 後もタイマー連鎖が残っている(剥がれた木を掴み続ける)',
    ).toBe(0);
  });

  it('disconnect 後は先読み tick が回らない', async () => {
    const { docEl, ctxMap } = buildDoc(50);
    const render = vi.fn((): HTMLElement => {
      const el = document.createElement('section');
      el.textContent = 'rendered';
      return el;
    });

    const handle = attachHydrator(docEl, ctxMap as never, render as never);
    // 先読みが 1 回でも走ることを確認(= この test が経路に届いている証拠)
    await vi.advanceTimersByTimeAsync(50);
    const duringLife = render.mock.calls.length;
    expect(duringLife).toBeGreaterThan(0);

    handle.disconnect();
    // 木を剥がす(実際の teardown と同じ状態にする ── 剥がれても
    // querySelectorAll は要素を返すので、tick は止まらないと回り続ける)
    docEl.remove();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(render.mock.calls.length, 'disconnect 後も先読みが回っている').toBe(duringLife);
  });
});
