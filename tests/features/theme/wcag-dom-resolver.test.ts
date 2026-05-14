/**
 * WCAG DOM resolver test(reform-2026-05 Phase 3 PR-2T)。
 * happy-dom 環境(JSDOM 互換)で DOM walk + style update を assert。
 */
/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  resolveWcagOnElement,
  applyWcagResolverToDom,
  revertWcagShiftsInDom,
} from '@features/theme/wcag-dom-resolver';
import { _clearShiftCacheForTests } from '@features/theme/wcag-contrast';

beforeEach(() => {
  _clearShiftCacheForTests();
  document.body.innerHTML = '';
  document.body.style.backgroundColor = 'rgb(255, 255, 255)';  // light bg
});

describe('resolveWcagOnElement', () => {
  it('inline style 無し element → no-op', () => {
    document.body.innerHTML = '<span id="t">text</span>';
    const el = document.getElementById('t') as HTMLElement;
    expect(resolveWcagOnElement(el)).toBe(false);
    expect(el.hasAttribute('data-pkc-wcag-shifted')).toBe(false);
  });

  it('inline color 持つが contrast 達成済 → no-op', () => {
    document.body.innerHTML = '<span id="t" style="color: rgb(0, 0, 0)">black on white</span>';
    const el = document.getElementById('t') as HTMLElement;
    expect(resolveWcagOnElement(el)).toBe(false);
  });

  it('inline color + bg で contrast 未達 → shift 適用', () => {
    // 黄背景 + 黒文字相当 contrast を未達状態に
    document.body.innerHTML = '<span id="t" style="color: rgb(220, 220, 0); background-color: rgb(240, 240, 0)">薄黄背景に薄黄文字</span>';
    const el = document.getElementById('t') as HTMLElement;
    expect(resolveWcagOnElement(el, 4.5)).toBe(true);
    expect(el.hasAttribute('data-pkc-wcag-shifted')).toBe(true);
    // ratio attribute も付く
    const ratio = parseFloat(el.getAttribute('data-pkc-wcag-ratio') ?? '0');
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    // style に shift 済の rgb() 形式
    expect(el.getAttribute('style')).toMatch(/color:\s*rgb\(/);
  });

  it('targetRatio = 7(AAA)も適用可能', () => {
    document.body.innerHTML = '<span id="t" style="color: rgb(150, 150, 150); background-color: rgb(255, 255, 255)">grey on white</span>';
    const el = document.getElementById('t') as HTMLElement;
    expect(resolveWcagOnElement(el, 7)).toBe(true);
    const ratio = parseFloat(el.getAttribute('data-pkc-wcag-ratio') ?? '0');
    expect(ratio).toBeGreaterThanOrEqual(7);
  });
});

describe('applyWcagResolverToDom', () => {
  it('複数 element を一括 scan + 該当のみ shift', () => {
    document.body.innerHTML = `
      <span id="a" style="color: rgb(220, 220, 0); background-color: rgb(240, 240, 0)">薄黄</span>
      <span id="b" style="color: rgb(0, 0, 0)">既に達成済(黒文字)</span>
      <span id="c">plain</span>
      <span id="d" style="color: rgb(180, 180, 180); background-color: rgb(200, 200, 200)">薄灰</span>
    `;
    const r = applyWcagResolverToDom(document.body);
    // a と d は shift 対象、b は達成済 no-op、c は inline style 無し
    expect(r.scanned).toBe(3);  // [style] 持つ a / b / d
    expect(r.shifted).toBeGreaterThanOrEqual(1);
    expect(document.getElementById('a')!.hasAttribute('data-pkc-wcag-shifted')).toBe(true);
    expect(document.getElementById('b')!.hasAttribute('data-pkc-wcag-shifted')).toBe(false);
    expect(document.getElementById('c')!.hasAttribute('data-pkc-wcag-shifted')).toBe(false);
  });

  it('selector で root scope 制限', () => {
    document.body.innerHTML = `
      <div class="scope-a">
        <span id="a" style="color: rgb(220, 220, 0); background-color: rgb(240, 240, 0)">a</span>
      </div>
      <div class="scope-b">
        <span id="b" style="color: rgb(220, 220, 0); background-color: rgb(240, 240, 0)">b</span>
      </div>
    `;
    const scope = document.querySelector('.scope-a') as HTMLElement;
    const r = applyWcagResolverToDom(scope);
    expect(r.scanned).toBe(1);
    expect(document.getElementById('a')!.hasAttribute('data-pkc-wcag-shifted')).toBe(true);
    expect(document.getElementById('b')!.hasAttribute('data-pkc-wcag-shifted')).toBe(false);
  });
});

describe('revertWcagShiftsInDom', () => {
  it('shifted marker をすべて削除', () => {
    document.body.innerHTML = '<span id="t" style="color: rgb(220, 220, 0); background-color: rgb(240, 240, 0)">x</span>';
    applyWcagResolverToDom(document.body);
    expect(document.getElementById('t')!.hasAttribute('data-pkc-wcag-shifted')).toBe(true);
    const reverted = revertWcagShiftsInDom(document.body);
    expect(reverted).toBe(1);
    expect(document.getElementById('t')!.hasAttribute('data-pkc-wcag-shifted')).toBe(false);
    expect(document.getElementById('t')!.hasAttribute('data-pkc-wcag-ratio')).toBe(false);
  });
});

describe('deterministic(同 fixture → 同結果)', () => {
  it('2 回 apply で同じ result(memoize)', () => {
    document.body.innerHTML = '<span id="t" style="color: rgb(220, 220, 0); background-color: rgb(240, 240, 0)">x</span>';
    applyWcagResolverToDom(document.body);
    const style1 = document.getElementById('t')!.getAttribute('style');
    revertWcagShiftsInDom(document.body);
    applyWcagResolverToDom(document.body);
    const style2 = document.getElementById('t')!.getAttribute('style');
    expect(style1).toBe(style2);
  });
});
