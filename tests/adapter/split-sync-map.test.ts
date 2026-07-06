/** @vitest-environment happy-dom */
/**
 * 2026-07 split-sync rebuild — piecewise-linear scroll mapping の
 * 純関数 contract。DOM 非依存(数学のみ)。
 *
 * 旧「ブロック高 ÷ 行数」比例割りを置き換える写像の性質を固定する:
 *   - 単調性(scroll が局所的に逆走しない)
 *   - 両端一致(top⇔top / bottom⇔bottom)
 *   - 双方向の整合(区間内 round-trip)
 *   - 汚れた入力(重複行 / 逆順 rect / NaN)の除去
 */
import { describe, it, expect } from 'vitest';
import {
  buildMonotonicPairs,
  buildScrollMapping,
  mapEditorToPreview,
  mapPreviewToEditor,
  type AnchorPair,
} from '@adapter/ui/split-sync-map';

describe('buildMonotonicPairs', () => {
  it('sorts by editorY and keeps strictly increasing pairs', () => {
    const out = buildMonotonicPairs([
      { editorY: 100, previewY: 200 },
      { editorY: 50, previewY: 80 },
      { editorY: 150, previewY: 260 },
    ]);
    expect(out).toEqual([
      { editorY: 50, previewY: 80 },
      { editorY: 100, previewY: 200 },
      { editorY: 150, previewY: 260 },
    ]);
  });

  it('first pair wins on duplicate editorY (outermost block)', () => {
    const out = buildMonotonicPairs([
      { editorY: 50, previewY: 80 },
      { editorY: 50, previewY: 95 }, // nested element, same source line
    ]);
    expect(out).toEqual([{ editorY: 50, previewY: 80 }]);
  });

  it('drops pairs that would reverse previewY (local backwards scroll)', () => {
    const out = buildMonotonicPairs([
      { editorY: 50, previewY: 300 },
      { editorY: 100, previewY: 200 }, // float/out-of-order rect
      { editorY: 150, previewY: 350 },
    ]);
    expect(out).toEqual([
      { editorY: 50, previewY: 300 },
      { editorY: 150, previewY: 350 },
    ]);
  });

  it('drops NaN / Infinity pairs', () => {
    const out = buildMonotonicPairs([
      { editorY: NaN, previewY: 10 },
      { editorY: 10, previewY: Infinity },
      { editorY: 20, previewY: 30 },
    ]);
    expect(out).toEqual([{ editorY: 20, previewY: 30 }]);
  });
});

describe('buildScrollMapping', () => {
  it('pins exact endpoints {0,0} and {editorMax, previewMax}', () => {
    const pairs = buildScrollMapping(
      [{ editorY: 500, previewY: 900 }],
      1000,
      2000,
    );
    expect(pairs[0]).toEqual({ editorY: 0, previewY: 0 });
    expect(pairs[pairs.length - 1]).toEqual({ editorY: 1000, previewY: 2000 });
    expect(pairs).toContainEqual({ editorY: 500, previewY: 900 });
  });

  it('drops interior anchors outside the scrollable range', () => {
    const pairs = buildScrollMapping(
      [
        { editorY: -10, previewY: 5 },
        { editorY: 500, previewY: 900 },
        { editorY: 1200, previewY: 1500 }, // beyond editorMax
        { editorY: 700, previewY: 2500 }, // beyond previewMax
      ],
      1000,
      2000,
    );
    expect(pairs).toEqual([
      { editorY: 0, previewY: 0 },
      { editorY: 500, previewY: 900 },
      { editorY: 1000, previewY: 2000 },
    ]);
  });

  it('degrades to a pure proportional 2-point map with no anchors', () => {
    const pairs = buildScrollMapping([], 1000, 500);
    expect(pairs).toEqual([
      { editorY: 0, previewY: 0 },
      { editorY: 1000, previewY: 500 },
    ]);
    expect(mapEditorToPreview(pairs, 500)).toBe(250);
  });

  it('handles zero-height panes (no scrollable range) without NaN', () => {
    const pairs = buildScrollMapping([{ editorY: 5, previewY: 5 }], 0, 0);
    expect(mapEditorToPreview(pairs, 0)).toBe(0);
    expect(mapEditorToPreview(pairs, 100)).toBe(0);
    expect(mapPreviewToEditor(pairs, 50)).toBe(0);
  });
});

describe('mapEditorToPreview / mapPreviewToEditor', () => {
  const table: AnchorPair[] = buildScrollMapping(
    [
      { editorY: 200, previewY: 500 },
      { editorY: 600, previewY: 800 },
    ],
    1000,
    2000,
  );

  it('interpolates linearly inside a segment', () => {
    // Segment {200,500}→{600,800}: midpoint 400 → 650.
    expect(mapEditorToPreview(table, 400)).toBe(650);
    // Segment {0,0}→{200,500}: 100 → 250.
    expect(mapEditorToPreview(table, 100)).toBe(250);
  });

  it('clamps outside the table range', () => {
    expect(mapEditorToPreview(table, -50)).toBe(0);
    expect(mapEditorToPreview(table, 99999)).toBe(2000);
    expect(mapPreviewToEditor(table, -1)).toBe(0);
    expect(mapPreviewToEditor(table, 99999)).toBe(1000);
  });

  it('is monotonic over the whole range', () => {
    let prev = -1;
    for (let y = 0; y <= 1000; y += 25) {
      const mapped = mapEditorToPreview(table, y);
      expect(mapped).toBeGreaterThanOrEqual(prev);
      prev = mapped;
    }
  });

  it('round-trips through the inverse within float tolerance', () => {
    for (const y of [0, 123, 200, 456, 600, 875, 1000]) {
      const there = mapEditorToPreview(table, y);
      const back = mapPreviewToEditor(table, there);
      expect(Math.abs(back - y)).toBeLessThanOrEqual(0.001);
    }
  });
});
