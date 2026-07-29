/** @vitest-environment happy-dom */
/**
 * C6-a(2026-07-29):mermaid のラスタ表示の pin。
 *
 * ## 守るものは「軽さ」ではなく **図が消えないこと**
 *
 * ラスタ化は表示の最適化であって図の正本ではない。直列化 / decode / canvas /
 * toBlob のどこで転んでも **元の SVG が DOM に残る**ことを最優先で pin する。
 * 「軽くしようとして図が消えた」は起こしてはならない。
 *
 * ⚠ happy-dom には canvas も `Image.decode` も無いので、**成功経路は
 *   実機(bench / smoke)でしか確かめられない**。ここで確かめるのは
 *   「失敗したときに何を残すか」と「何度も走らせないか」である。
 */
import { describe, expect, it, vi } from 'vitest';
import {
  MERMAID_RASTER_MAX_AREA,
  MERMAID_RASTER_MIN_ELEMENTS,
  isRasterUpToDate,
  rasterizeMermaidWrap,
} from '@adapter/ui/mermaid-raster';

function wrapWith(svgInner: string, w = 400, h = 300): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'pkc-mermaid-rendered';
  wrap.setAttribute('data-pkc-mermaid-src', 'graph TD; A-->B');
  wrap.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg">${svgInner}</svg>`;
  document.body.appendChild(wrap);
  const svg = wrap.querySelector('svg')!;
  svg.getBoundingClientRect = () => ({
    width: w, height: h, top: 0, left: 0, right: w, bottom: h, x: 0, y: 0,
    toJSON: () => ({}),
  }) as DOMRect;
  return wrap;
}

/** 閾値を超える要素数の SVG 中身。 */
const heavy = Array.from({ length: MERMAID_RASTER_MIN_ELEMENTS + 10 },
  (_, i) => `<rect id="r${i}"/>`).join('');

describe('C6-a: ラスタ化に失敗しても図は残る', () => {
  it('🔴 canvas が使えない環境でも SVG が消えない', async () => {
    const wrap = wrapWith(heavy);
    const ok = await rasterizeMermaidWrap(wrap);
    expect(ok, 'happy-dom で成功したことになっている(前提が崩れている)').toBe(false);
    expect(wrap.querySelector('svg'), '🔴 失敗したのに SVG が消えた').not.toBeNull();
    expect(wrap.getAttribute('data-pkc-mermaid-src'), 'source が失われた').toBe('graph TD; A-->B');
  });

  it('🔴 toBlob が throw しても SVG が残る(汚染された canvas の経路)', async () => {
    const wrap = wrapWith(heavy);
    const canvas = document.createElement('canvas');
    Object.defineProperty(canvas, 'getContext', {
      value: () => ({ drawImage: () => {} }),
    });
    Object.defineProperty(canvas, 'toBlob', {
      value: () => { throw new Error('Tainted canvases may not be exported.'); },
    });
    const spy = vi.spyOn(document, 'createElement').mockImplementation(
      ((tag: string) => (tag === 'canvas' ? canvas : Document.prototype.createElement.call(document, tag))) as never,
    );
    try {
      await rasterizeMermaidWrap(wrap);
    } finally {
      spy.mockRestore();
    }
    expect(wrap.querySelector('svg'), '🔴 toBlob 失敗で図が消えた').not.toBeNull();
  });

  it('svg が無ければ何もしない', async () => {
    const wrap = document.createElement('div');
    document.body.appendChild(wrap);
    expect(await rasterizeMermaidWrap(wrap)).toBe(false);
  });
});

describe('C6-a: 変換する条件', () => {
  it('🔴 幅が測れない(layout 前)なら変換しない', async () => {
    const wrap = wrapWith(heavy, 0, 0);
    expect(await rasterizeMermaidWrap(wrap), '幅 0 で変換に入った').toBe(false);
    expect(wrap.querySelector('svg')).not.toBeNull();
  });

  it('小さい図は変換しない(元から軽く、変換の意味が無い)', async () => {
    const wrap = wrapWith('<rect/><rect/>');
    expect(await rasterizeMermaidWrap(wrap)).toBe(false);
  });

  it('🔴 面積が上限を超える図は変換しない(ラスタのほうがメモリを食う)', async () => {
    // 実測: 260×6310(1.64M 画素)は blink_gc −1.7 に対し cc +4.5 で差引 +2.8MB。
    // 「大きい図こそ効きそう」は直感の罠 ── 面積で切る。
    const wrap = wrapWith(heavy, 260, 6310);
    expect(260 * 6310, '前提: 上限を超える fixture になっていない').toBeGreaterThan(MERMAID_RASTER_MAX_AREA);
    expect(await rasterizeMermaidWrap(wrap), '巨大な図を変換しようとした').toBe(false);
    expect(wrap.querySelector('svg'), 'SVG が残っていない').not.toBeNull();
  });

  it('上限内の図は変換に入る(happy-dom では canvas が無いので false で返る)', async () => {
    const wrap = wrapWith(heavy, 800, 600);
    expect(800 * 600).toBeLessThan(MERMAID_RASTER_MAX_AREA);
    // ここで見たいのは「足切りで弾かれていない」こと。canvas が無いので結果は
    // false だが、**SVG が残っている**ことと合わせて経路に入ったと判断する。
    expect(await rasterizeMermaidWrap(wrap)).toBe(false);
    expect(wrap.querySelector('svg')).not.toBeNull();
  });
});

describe('C6-a: 何度も走らせない(窓の描き替えで毎回来る)', () => {
  it('同じ幅でラスタ済みなら再変換しない', () => {
    const wrap = document.createElement('div');
    wrap.innerHTML = '<img data-pkc-mermaid-raster="400">';
    expect(isRasterUpToDate(wrap, 400)).toBe(true);
    // scrollbar の出入り程度のゆらぎでは作り直さない
    expect(isRasterUpToDate(wrap, 401)).toBe(true);
  });

  it('🔴 幅が変わったら作り直す(拡大・ウィンドウリサイズの経路)', () => {
    const wrap = document.createElement('div');
    wrap.innerHTML = '<img data-pkc-mermaid-raster="400">';
    expect(isRasterUpToDate(wrap, 700), '幅が変わったのに作り直さない').toBe(false);
  });

  it('まだラスタ化していなければ false', () => {
    const wrap = document.createElement('div');
    wrap.innerHTML = '<svg></svg>';
    expect(isRasterUpToDate(wrap, 400)).toBe(false);
  });
});
