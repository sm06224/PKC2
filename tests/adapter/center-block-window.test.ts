/**
 * C3-a(2026-07-28):center pane のブロック窓化 ── 純粋計算部分の pin。
 *
 * サイドバー窓化(L3-S5)で実際に踏んだ壊れ方を、**同じ形で center 側にも**
 * 起こさないための test。窓化は「例外も test failure も出ない」型で壊れる:
 *   - 0 個返して「本文が空」に見える
 *   - 高さ表がずれてスクロールバーが嘘をつく
 *   - 選んだブロックへ寄れない
 * ので、境界と単調性を明示的に固定する。
 */
import { describe, expect, it } from 'vitest';
import {
  CENTER_BLOCK_DEFAULT_ESTIMATE,
  CENTER_BLOCK_MIN_BLOCKS,
  computeBlockOutline,
  computeBlockWindow,
  cumulativeOffsets,
  headingLevelOfBlock,
  heightOf,
  hiddenBlocks,
  invalidateMeasurements,
  makeBlockMetrics,
  scrollOffsetForBlock,
  shouldWindowBlocks,
  totalHeight,
  withHidden,
  withMeasured,
} from '@adapter/ui/center-block-window';

describe('C3-a: ブロック高さ表と累積オフセット', () => {
  it('未測定は推定値で埋まる', () => {
    const m = makeBlockMetrics(5);
    expect(m.count).toBe(5);
    for (let i = 0; i < 5; i += 1) {
      expect(heightOf(m, i)).toBe(CENTER_BLOCK_DEFAULT_ESTIMATE);
    }
    expect(totalHeight(m)).toBe(5 * CENTER_BLOCK_DEFAULT_ESTIMATE);
  });

  it('累積オフセットは長さ count+1・0 始まり・単調非減少', () => {
    const m = withMeasured(makeBlockMetrics(4), new Map([[0, 10], [1, 200], [2, 30]]));
    const offsets = cumulativeOffsets(m);
    expect(offsets.length).toBe(5);
    expect(offsets[0]).toBe(0);
    for (let i = 1; i < offsets.length; i += 1) {
      expect(offsets[i]!, `offset が減っている(index ${i})`).toBeGreaterThanOrEqual(offsets[i - 1]!);
    }
    // 3 番目は未測定 → 推定値
    expect(offsets[4]! - offsets[3]!).toBe(m.estimate);
  });

  it('🔴 推定は中央値(平均だと表 1 個で引きずられる)', () => {
    // 段落 3 つ(20px)と巨大な表 1 つ(2000px)
    const m = withMeasured(
      makeBlockMetrics(10),
      new Map([[0, 20], [1, 20], [2, 20], [3, 2000]]),
    );
    // 平均なら 515 になる。中央値なら 20 付近。
    expect(m.estimate, '外れ値に引きずられている(平均を使っていないか)').toBeLessThan(100);
  });

  it('0 以下の高さは取り込まない(測れていない値を嘘として持たない)', () => {
    const m = withMeasured(makeBlockMetrics(3), new Map([[0, 0], [1, -5], [2, 40]]));
    expect(m.heights[0], '0 を実測として取り込んでいる').toBeNull();
    expect(m.heights[1], '負値を実測として取り込んでいる').toBeNull();
    expect(m.heights[2]).toBe(40);
  });

  it('範囲外の index は無視する', () => {
    const m = withMeasured(makeBlockMetrics(2), new Map([[-1, 10], [5, 10], [0, 33]]));
    expect(m.heights[0]).toBe(33);
    expect(m.heights.length).toBe(2);
  });

  it('invalidate すると件数を保ったまま全部未測定に戻る(幅変更時)', () => {
    const m = withMeasured(makeBlockMetrics(3), new Map([[0, 100], [1, 200]]));
    const back = invalidateMeasurements(m);
    expect(back.count).toBe(3);
    expect(back.heights.every((h) => h === null), '実測が残っている').toBe(true);
    expect(back.estimate).toBe(CENTER_BLOCK_DEFAULT_ESTIMATE);
  });
});

describe('C3-a: 窓の範囲', () => {
  /** 高さ 100px のブロック 20 個。 */
  const uniform = withMeasured(
    makeBlockMetrics(20),
    new Map(Array.from({ length: 20 }, (_, i) => [i, 100] as const)),
  );

  it('先頭では start が 0 で、可視ぶん + overscan が入る', () => {
    const r = computeBlockWindow({ metrics: uniform, scrollTop: 0, viewportHeight: 300, overscan: 2 });
    expect(r.start).toBe(0);
    // 0..2 が見えて + overscan 2 → 少なくとも 5 個
    expect(r.end).toBeGreaterThanOrEqual(5);
    expect(r.end).toBeLessThanOrEqual(uniform.count);
  });

  it('中ほどでは前後に overscan が付く', () => {
    const r = computeBlockWindow({ metrics: uniform, scrollTop: 1000, viewportHeight: 300, overscan: 2 });
    expect(r.start, '前方 overscan が無い').toBe(8);
    expect(r.end, '後方 overscan が無い').toBeGreaterThanOrEqual(15);
  });

  it('末尾を越えても範囲外へ出ない', () => {
    const r = computeBlockWindow({ metrics: uniform, scrollTop: 99999, viewportHeight: 300 });
    expect(r.end).toBe(uniform.count);
    expect(r.start).toBeLessThan(r.end);
  });

  it('🔴 負の scrollTop / 高さ 0 でも必ず 1 個以上返す(空に見せない)', () => {
    for (const [scrollTop, viewportHeight] of [[-500, 300], [0, 0], [-1, 0]] as const) {
      const r = computeBlockWindow({ metrics: uniform, scrollTop, viewportHeight });
      expect(r.end - r.start, `0 個返した(scrollTop=${scrollTop}, vh=${viewportHeight})`)
        .toBeGreaterThanOrEqual(1);
    }
  });

  it('ブロックが 0 個なら空の範囲', () => {
    const r = computeBlockWindow({ metrics: makeBlockMetrics(0), scrollTop: 0, viewportHeight: 300 });
    expect(r).toEqual({ start: 0, end: 0 });
  });

  it('高さがバラバラでも正しい位置を選ぶ(一様前提に退化していない)', () => {
    // 0: 10px, 1: 1000px(巨大な表), 2: 10px, 3: 10px
    const m = withMeasured(
      makeBlockMetrics(4),
      new Map([[0, 10], [1, 1000], [2, 10], [3, 10]]),
    );
    // scrollTop 500 は「巨大な表」の途中 = index 1
    const r = computeBlockWindow({ metrics: m, scrollTop: 500, viewportHeight: 100, overscan: 0 });
    expect(r.start, '一様高さで割ってしまっている').toBe(1);
    expect(r.end).toBe(2);
  });
});

describe('C3-a: 指定ブロックへ寄せる', () => {
  const m = withMeasured(
    makeBlockMetrics(10),
    new Map(Array.from({ length: 10 }, (_, i) => [i, 100] as const)),
  );

  it('上に外れていれば上端へ', () => {
    expect(scrollOffsetForBlock(m, 1, 300, 500)).toBe(100);
  });

  it('下に外れていれば下端合わせ', () => {
    expect(scrollOffsetForBlock(m, 8, 300, 0)).toBe(900 - 300);
  });

  it('既に見えていれば動かさない(震え防止)', () => {
    expect(scrollOffsetForBlock(m, 3, 300, 300)).toBeNull();
  });

  it('範囲外は null', () => {
    expect(scrollOffsetForBlock(m, -1, 300, 0)).toBeNull();
    expect(scrollOffsetForBlock(m, 10, 300, 0)).toBeNull();
  });
});

describe('C3-a: 発動条件', () => {
  it(`${CENTER_BLOCK_MIN_BLOCKS} 未満では窓化しない`, () => {
    expect(shouldWindowBlocks(CENTER_BLOCK_MIN_BLOCKS - 1)).toBe(false);
    expect(shouldWindowBlocks(CENTER_BLOCK_MIN_BLOCKS)).toBe(true);
    expect(shouldWindowBlocks(0)).toBe(false);
  });
});

describe('C3-d: 畳んだ見出しの扱い', () => {
  const BLOCKS = [
    '<h1>タイトル</h1>',   // 0
    '<p>前書き</p>',        // 1
    '<h2>節 A</h2>',        // 2
    '<p>A-1</p>',           // 3
    '<h3>小節 A-a</h3>',    // 4
    '<p>A-a-1</p>',         // 5
    '<h2>節 B</h2>',        // 6
    '<p>B-1</p>',           // 7
  ];

  it('見出しレベルはブロック HTML の先頭タグだけで決める', () => {
    expect(headingLevelOfBlock('<h2>x</h2>')).toBe(2);
    expect(headingLevelOfBlock('  <h6 id="a">x</h6>')).toBe(6);
    expect(headingLevelOfBlock('<p>x</p>')).toBe(0);
    // 🔴 本文中の <h2>(表の中など)を見出しと誤認しない
    expect(headingLevelOfBlock('<table><tr><td><h2>x</h2></td></tr></table>')).toBe(0);
    expect(headingLevelOfBlock('<h7>x</h7>')).toBe(0);
  });

  it('セクションは「次の同レベル以上の見出しまで」(fold と同じ判定)', () => {
    const outline = computeBlockOutline(BLOCKS);
    // h2「節 A」を畳む → A-1 / 小節 A-a / A-a-1 が隠れる。節 B は隠れない
    expect([...hiddenBlocks(outline, new Set([2]))].sort((a, b) => a - b)).toEqual([3, 4, 5]);
    // h3「小節 A-a」を畳む → A-a-1 だけ
    expect([...hiddenBlocks(outline, new Set([4]))]).toEqual([5]);
    // h1 を畳む → 以降すべて
    expect([...hiddenBlocks(outline, new Set([0]))].sort((a, b) => a - b))
      .toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('見出しでない index を渡しても壊れない', () => {
    const outline = computeBlockOutline(BLOCKS);
    expect(hiddenBlocks(outline, new Set([1, 99])).size).toBe(0);
  });

  it('🔴 隠れたブロックは高さ 0 ── 累積オフセットが画面と一致する', () => {
    const outline = computeBlockOutline(BLOCKS);
    let m = makeBlockMetrics(BLOCKS.length);
    m = withMeasured(m, new Map([[3, 100], [4, 100], [5, 100]]));
    const openTotal = totalHeight(m);
    m = withHidden(m, hiddenBlocks(outline, new Set([2])));
    expect(totalHeight(m), '畳んでも総高が変わっていない').toBe(openTotal - 300);
    expect(heightOf(m, 3)).toBe(0);
    expect(heightOf(m, 2), '見出し自身は隠れない(summary として残る)').not.toBe(0);
  });

  it('開き直すと実測値が戻る(捨てていない)', () => {
    const outline = computeBlockOutline(BLOCKS);
    let m = withMeasured(makeBlockMetrics(BLOCKS.length), new Map([[3, 100]]));
    m = withHidden(m, hiddenBlocks(outline, new Set([2])));
    expect(heightOf(m, 3)).toBe(0);
    m = withHidden(m, hiddenBlocks(outline, new Set()));
    expect(heightOf(m, 3), '開き直しても高さを測り直させている').toBe(100);
  });

  it('畳んだぶんは窓の計算からも外れる', () => {
    const outline = computeBlockOutline(BLOCKS);
    let m = withMeasured(
      makeBlockMetrics(BLOCKS.length),
      new Map([[0, 40], [1, 40], [2, 40], [3, 1000], [4, 40], [5, 1000], [6, 40], [7, 40]]),
    );
    const openEnd = computeBlockWindow({ metrics: m, scrollTop: 0, viewportHeight: 200, overscan: 0 }).end;
    m = withHidden(m, hiddenBlocks(outline, new Set([2])));
    const foldedEnd = computeBlockWindow({ metrics: m, scrollTop: 0, viewportHeight: 200, overscan: 0 }).end;
    expect(openEnd, '前提: 開いていれば大きなブロックで窓が止まる').toBeLessThan(BLOCKS.length);
    expect(foldedEnd, '畳んでも窓が伸びていない ── 画面に穴があく').toBeGreaterThan(openEnd);
  });

  it('測り直しても畳み状態は保つ(幅変更などで消えない)', () => {
    const outline = computeBlockOutline(BLOCKS);
    let m = withHidden(makeBlockMetrics(BLOCKS.length), hiddenBlocks(outline, new Set([2])));
    m = invalidateMeasurements(m);
    expect(heightOf(m, 3), '再計測で畳み状態が飛んだ').toBe(0);
  });
});
