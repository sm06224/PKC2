/** @vitest-environment happy-dom */
/**
 * 2026-07-06 user 要望「レンダリング関係の WCAG 調整をデフォルト動作に。
 * どこで何を見ても見やすく」の parity test。
 *
 * WCAG 同系色 shift(`theme.wcag_auto_shift` 既定 ON)はこれまで main pane
 * (`#pkc-root`)の text と、全 surface の mermaid SVG(#890)にしか効いて
 * いなかった。本 PR で **独立 document の 2 popup**(rendered-viewer /
 * entry-window child)の text 経路にも拡張した。ここでは:
 *
 *   1. entry-window child template が再描画経路(renderMdInto)で
 *      `pkcApplyWcagShift` を呼ぶよう emit されていること(wiring emitted)。
 *   2. parent が公開する `window.pkcApplyWcagShift` が、低コントラストの
 *      inline color text を実効背景に対し目標比(4.5)まで実際に shift する
 *      こと(state mutation → consumer 観測点の end-to-end)。
 *   3. `openRenderedViewer` が popup document.body に対し resolver を走らせ、
 *      低コントラスト要素が shift されること(rendered-viewer wiring)。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { openEntryWindow } from '@adapter/ui/entry-window';
import { openRenderedViewer } from '@adapter/ui/rendered-viewer';
import { _clearShiftCacheForTests } from '@features/theme/wcag-contrast';

const T = '2026-07-06T00:00:00Z';

/** 低コントラスト(薄黄背景 × 薄黄文字、ratio ≈ 1.x)fixture。 */
const LOW_CONTRAST_HTML =
  '<span id="lc" style="color: rgb(220, 220, 0); background-color: rgb(240, 240, 0)">薄黄</span>';

let testCounter = 0;
const createdChildren: Array<{ closed: boolean }> = [];

beforeEach(() => {
  vi.restoreAllMocks();
  _clearShiftCacheForTests();
  document.body.innerHTML = '';
  document.body.style.backgroundColor = 'rgb(255, 255, 255)';
});

afterEach(() => {
  for (const child of createdChildren) child.closed = true;
  createdChildren.length = 0;
});

/**
 * 実 body(main document の要素)を持つ fake child window。`write()` は
 * 与えられた fixture HTML で実 body を満たすので、parent が `document.body`
 * 経由で resolver を走らせた結果を観測できる。
 */
function fakeWindowWithRealBody(seedHtml: string) {
  const realBody = document.createElement('div');
  document.body.appendChild(realBody); // computed style 解決のため attach
  const win = {
    closed: false,
    focus: vi.fn(),
    print: vi.fn(),
    setTimeout: vi.fn(),
    postMessage: vi.fn(),
    document: {
      open: vi.fn(),
      write: vi.fn((_html: string) => { realBody.innerHTML = seedHtml; }),
      close: vi.fn(),
      get body() { return realBody; },
    },
  };
  vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
  createdChildren.push(win);
  return { win, realBody };
}

function textEntry() {
  testCounter++;
  return {
    lid: `wcag-pop-${testCounter}`,
    title: 'WCAG popup target',
    body: 'body',
    archetype: 'text' as const,
    created_at: T,
    updated_at: T,
  };
}

function baseContainer() {
  return { meta: { container_id: 'c1' }, entries: [], relations: [], revisions: [], assets: {} };
}

describe('WCAG popup surface — entry-window child', () => {
  it('child template が再描画経路(renderMdInto)で pkcApplyWcagShift を呼ぶ', () => {
    let captured = '';
    const stub = {
      closed: false,
      focus: vi.fn(),
      postMessage: vi.fn(),
      document: {
        open: vi.fn(),
        write: vi.fn((html: string) => { captured = html; }),
        close: vi.fn(),
      },
    };
    vi.spyOn(window, 'open').mockReturnValue(stub as unknown as Window);
    createdChildren.push(stub);

    openEntryWindow(textEntry() as never, false, vi.fn(), false, undefined);

    // renderMdInto の中で opener.pkcApplyWcagShift(el) を呼ぶ配線が emit される
    expect(captured).toContain('pkcApplyWcagShift');
    // mermaid hydration と並置(同じ再描画経路)
    const idx = captured.indexOf('function renderMdInto');
    expect(idx).toBeGreaterThan(-1);
    const body = captured.slice(idx, idx + 700);
    expect(body).toContain('pkcHydratePreviewMermaid');
    expect(body).toContain('pkcApplyWcagShift');
  });

  it('公開 window.pkcApplyWcagShift が低コントラスト inline text を目標比まで shift', () => {
    const shift = (window as unknown as { pkcApplyWcagShift?: (el: unknown) => void }).pkcApplyWcagShift;
    expect(typeof shift).toBe('function');

    const host = document.createElement('div');
    host.style.backgroundColor = 'rgb(255, 255, 255)';
    host.innerHTML = LOW_CONTRAST_HTML;
    document.body.appendChild(host);

    shift!(host);

    const lc = document.getElementById('lc')!;
    expect(lc.hasAttribute('data-pkc-wcag-shifted')).toBe(true);
    const ratio = parseFloat(lc.getAttribute('data-pkc-wcag-ratio') ?? '0');
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it('openEntryWindow の初期焼き込み本文にも parent が shift を適用する', () => {
    const { realBody } = fakeWindowWithRealBody(LOW_CONTRAST_HTML);
    openEntryWindow(textEntry() as never, false, vi.fn(), false, undefined);
    const lc = realBody.querySelector('#lc')!;
    expect(lc.hasAttribute('data-pkc-wcag-shifted')).toBe(true);
  });
});

describe('WCAG popup surface — rendered-viewer', () => {
  it('openRenderedViewer が popup document.body の低コントラスト text を shift', () => {
    const { realBody } = fakeWindowWithRealBody(LOW_CONTRAST_HTML);
    const win = openRenderedViewer(textEntry() as never, baseContainer() as never);
    expect(win).not.toBeNull();
    const lc = realBody.querySelector('#lc')!;
    expect(lc.hasAttribute('data-pkc-wcag-shifted')).toBe(true);
    const ratio = parseFloat(lc.getAttribute('data-pkc-wcag-ratio') ?? '0');
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});
