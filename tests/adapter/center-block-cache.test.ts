/** @vitest-environment happy-dom */
/**
 * C4(2026-07-28):描画結果キャッシュ(T1)の pin。
 *
 * ## 守るものは「速さ」ではなく **嘘を映さないこと**
 *
 * キャッシュは捨てても正しい(捨てれば描き直すだけ)。危ないのは
 * **key の取りこぼし**で、「編集したのに古い描画が出る」という
 * 例外も test failure も出ない壊れ方をする。だから hit する条件より
 * **miss しなければならない条件**を厚く pin する。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cachedRenderBlocks,
  invalidateRenderCache,
  renderCacheStats,
  resetRenderCacheStats,
} from '@adapter/ui/center-block-cache';

beforeEach(() => {
  invalidateRenderCache();
  resetRenderCacheStats();
});

describe('C4: 描画結果キャッシュ', () => {
  it('同じ入力なら 2 回目は描き直さない', () => {
    const render = vi.fn(() => ['<p>A</p>']);
    const a = cachedRenderBlocks('e1', 'src', 'fp', render);
    const b = cachedRenderBlocks('e1', 'src', 'fp', render);
    expect(render).toHaveBeenCalledTimes(1);
    expect(b).toEqual(a);
    expect(renderCacheStats().hits).toBe(1);
    expect(renderCacheStats().misses).toBe(1);
  });

  it('🔴 source が変われば必ず描き直す(編集が反映される)', () => {
    const render = vi.fn((): string[] => ['<p>old</p>']);
    cachedRenderBlocks('e1', 'src', 'fp', render);
    render.mockReturnValue(['<p>new</p>']);
    const out = cachedRenderBlocks('e1', 'src が変わった', 'fp', render);
    expect(render, '本文が変わったのに古い描画を返している').toHaveBeenCalledTimes(2);
    expect(out).toEqual(['<p>new</p>']);
  });

  it('🔴 source は長さが同じでも中身で判定する(ハッシュ衝突の余地を作らない)', () => {
    const render = vi.fn((): string[] => ['<p>A</p>']);
    cachedRenderBlocks('e1', 'abcd', 'fp', render);
    render.mockReturnValue(['<p>B</p>']);
    const out = cachedRenderBlocks('e1', 'abce', 'fp', render);
    expect(render).toHaveBeenCalledTimes(2);
    expect(out).toEqual(['<p>B</p>']);
  });

  it('🔴 fingerprint(container id / vars / 見出し番号)が変われば描き直す', () => {
    const render = vi.fn((): string[] => ['<p>A</p>']);
    cachedRenderBlocks('e1', 'src', 'fp1', render);
    cachedRenderBlocks('e1', 'src', 'fp2', render);
    expect(render, '外部入力が変わったのに再利用している').toHaveBeenCalledTimes(2);
  });

  it('別 entry の描画が混ざらない', () => {
    const a = cachedRenderBlocks('e1', 'src', 'fp', () => ['<p>A</p>']);
    const b = cachedRenderBlocks('e2', 'src', 'fp', () => ['<p>B</p>']);
    expect(a).toEqual(['<p>A</p>']);
    expect(b).toEqual(['<p>B</p>']);
    expect(cachedRenderBlocks('e1', 'src', 'fp', () => ['💥'])).toEqual(['<p>A</p>']);
  });

  it('明示的に捨てられる(捨てても出力は同じ ── 描き直すだけ)', () => {
    const render = vi.fn(() => ['<p>A</p>']);
    cachedRenderBlocks('e1', 'src', 'fp', render);
    invalidateRenderCache('e1');
    const out = cachedRenderBlocks('e1', 'src', 'fp', render);
    expect(render).toHaveBeenCalledTimes(2);
    expect(out).toEqual(['<p>A</p>']);
    expect(renderCacheStats().entries).toBe(1);
  });

  it('🔴 上限を超えたら古い順に捨てる(常駐が無制限に増えない)', () => {
    const big = 'x'.repeat(1_500_000);
    cachedRenderBlocks('e1', 's1', 'fp', () => [big]);
    cachedRenderBlocks('e2', 's2', 'fp', () => [big]);
    cachedRenderBlocks('e3', 's3', 'fp', () => [big]);
    const stats = renderCacheStats();
    expect(stats.chars, `上限を超えて溜め込んでいる(${stats.chars})`)
      .toBeLessThanOrEqual(4_000_000);
    // 追い出されても正しく描き直せる
    const again = cachedRenderBlocks('e1', 's1', 'fp', () => ['<p>再描画</p>']);
    expect(again.length).toBe(1);
  });

  it('hit すると LRU の末尾へ回る(よく見る entry が先に捨てられない)', () => {
    const big = 'y'.repeat(1_500_000);
    cachedRenderBlocks('e1', 's1', 'fp', () => [big]);
    cachedRenderBlocks('e2', 's2', 'fp', () => [big]);
    cachedRenderBlocks('e1', 's1', 'fp', () => ['💥']); // hit → e1 が新しくなる
    cachedRenderBlocks('e3', 's3', 'fp', () => [big]);  // 追い出しが走る
    const e1 = cachedRenderBlocks('e1', 's1', 'fp', () => ['<p>再描画</p>']);
    expect(e1[0], '直前に見た entry のほうが先に捨てられている').toBe(big);
  });

  it('計器が hit / miss を数える(§9 の hit 率の元)', () => {
    cachedRenderBlocks('e1', 's', 'fp', () => ['<p>A</p>']);
    cachedRenderBlocks('e1', 's', 'fp', () => ['<p>A</p>']);
    cachedRenderBlocks('e2', 's', 'fp', () => ['<p>B</p>']);
    expect(renderCacheStats()).toMatchObject({ hits: 1, misses: 2, entries: 2 });
    resetRenderCacheStats();
    expect(renderCacheStats()).toMatchObject({ hits: 0, misses: 0, entries: 2 });
  });
});
