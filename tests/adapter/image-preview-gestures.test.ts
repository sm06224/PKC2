/**
 * Image preview gesture tests (G7 parity).
 *
 * 領域 10-6 ζ'' PR-B (2026-05-06):iPhone で画像 preview の等倍 / 拡大縮小
 * を可能にした。pinch (2-finger) / pan (1-finger) / double-tap / Ctrl+wheel
 * の各 path を happy-dom の TouchEvent / WheelEvent 経由で発火し、
 * `data-pkc-image-zoom` attribute と img.style.transform の遷移で確認する。
 *
 * これは reform-2026-05 §6 visual-state-parity-testing の **state mutation
 * → consumer behavior change** parity test。Touch event を発火しただけで
 * 終わらず、最終的に img.style.transform が translate+scale を含むことを
 * assert する(consumer 観測点)。
 */

/** @vitest-environment happy-dom */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { __mountImagePreviewBodyForTest } from '@adapter/ui/image-preview';

const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

interface SyntheticTouch {
  identifier: number;
  clientX: number;
  clientY: number;
  target: EventTarget;
}

function dispatchTouch(target: EventTarget, type: 'touchstart' | 'touchmove' | 'touchend', touches: SyntheticTouch[], changedTouches?: SyntheticTouch[]): void {
  // happy-dom doesn't fully implement TouchEvent constructor; we
  // fabricate a minimal Event with the touches array glued on.
  const ev = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'touches', { value: touches, configurable: true });
  Object.defineProperty(ev, 'changedTouches', { value: changedTouches ?? touches, configurable: true });
  target.dispatchEvent(ev);
}

function setStageBounds(stage: HTMLElement, w: number, h: number): void {
  // happy-dom's getBoundingClientRect returns 0 by default.
  // override to simulate a real stage size.
  (stage as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () => ({
    x: 0, y: 0, top: 0, left: 0, right: w, bottom: h, width: w, height: h, toJSON: () => ({}),
  } as DOMRect);
  Object.defineProperty(stage, 'clientWidth', { value: w, configurable: true });
  Object.defineProperty(stage, 'clientHeight', { value: h, configurable: true });
}

describe('image-preview gestures (G7 PR-B parity)', () => {
  let stage: HTMLElement;
  let wrap: HTMLElement;
  let img: HTMLImageElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    stage = document.createElement('div');
    stage.className = 'pkc-image-preview-stage';
    document.body.appendChild(stage);
    setStageBounds(stage, 800, 600);

    __mountImagePreviewBodyForTest(stage, { src: TINY_PNG, label: 'test', permalink: 'entry:abc' });

    wrap = stage.querySelector('.pkc-image-preview-wrap') as HTMLElement;
    img = stage.querySelector('img') as HTMLImageElement;
    // Pretend the image decoded at 400x300 so gesture math has real numbers.
    Object.defineProperty(img, 'naturalWidth', { value: 400, configurable: true });
    Object.defineProperty(img, 'naturalHeight', { value: 300, configurable: true });
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('initial state is fit (no transform, fit class)', () => {
    expect(wrap.getAttribute('data-pkc-image-zoom')).toBe('fit');
    expect(img.classList.contains('pkc-image-preview-img-fit')).toBe(true);
    expect(img.style.transform).toBe('');
  });

  it('two-finger pinch out switches to numeric mode and increases scale', () => {
    // Start: two fingers 100 px apart at center.
    dispatchTouch(stage, 'touchstart', [
      { identifier: 0, clientX: 350, clientY: 300, target: stage },
      { identifier: 1, clientX: 450, clientY: 300, target: stage },
    ]);
    // Move: fingers spread to 200 px (2× zoom).
    dispatchTouch(stage, 'touchmove', [
      { identifier: 0, clientX: 300, clientY: 300, target: stage },
      { identifier: 1, clientX: 500, clientY: 300, target: stage },
    ]);

    expect(img.classList.contains('pkc-image-preview-img-fit')).toBe(false);
    expect(wrap.getAttribute('data-pkc-image-zoom')).toBe('200');
    expect(img.style.transform).toMatch(/scale\(2\)/);
    expect(img.style.transform).toMatch(/translate\(/);
  });

  it('two-finger pinch in shrinks scale', () => {
    dispatchTouch(stage, 'touchstart', [
      { identifier: 0, clientX: 300, clientY: 300, target: stage },
      { identifier: 1, clientX: 500, clientY: 300, target: stage },
    ]);
    dispatchTouch(stage, 'touchmove', [
      { identifier: 0, clientX: 350, clientY: 300, target: stage },
      { identifier: 1, clientX: 450, clientY: 300, target: stage },
    ]);

    expect(wrap.getAttribute('data-pkc-image-zoom')).toBe('50');
    expect(img.style.transform).toMatch(/scale\(0\.5\)/);
  });

  it('one-finger drag in numeric mode pans the image', () => {
    // Bootstrap to numeric mode via pinch out.
    dispatchTouch(stage, 'touchstart', [
      { identifier: 0, clientX: 350, clientY: 300, target: stage },
      { identifier: 1, clientX: 450, clientY: 300, target: stage },
    ]);
    dispatchTouch(stage, 'touchmove', [
      { identifier: 0, clientX: 300, clientY: 300, target: stage },
      { identifier: 1, clientX: 500, clientY: 300, target: stage },
    ]);
    dispatchTouch(stage, 'touchend', [], [
      { identifier: 0, clientX: 300, clientY: 300, target: stage },
    ]);
    // touchend with 0 touches and 1 changedTouches; second touchend
    // also fires.
    dispatchTouch(stage, 'touchend', [], []);

    const beforePan = img.style.transform;

    // Now 1-finger drag right + down by 50,30.
    dispatchTouch(stage, 'touchstart', [
      { identifier: 0, clientX: 400, clientY: 300, target: stage },
    ]);
    dispatchTouch(stage, 'touchmove', [
      { identifier: 0, clientX: 450, clientY: 330, target: stage },
    ]);

    expect(img.style.transform).not.toBe(beforePan);
    // tx should have shifted +50 from the beforePan baseline.
    const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(img.style.transform);
    expect(m).not.toBeNull();
    const tx = parseFloat(m![1]!);
    const ty = parseFloat(m![2]!);
    const m0 = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(beforePan);
    const tx0 = parseFloat(m0![1]!);
    const ty0 = parseFloat(m0![2]!);
    expect(tx - tx0).toBeCloseTo(50, 1);
    expect(ty - ty0).toBeCloseTo(30, 1);
  });

  it('one-finger drag in fit mode is a no-op (does not switch modes)', () => {
    expect(wrap.getAttribute('data-pkc-image-zoom')).toBe('fit');

    dispatchTouch(stage, 'touchstart', [
      { identifier: 0, clientX: 400, clientY: 300, target: stage },
    ]);
    dispatchTouch(stage, 'touchmove', [
      { identifier: 0, clientX: 500, clientY: 400, target: stage },
    ]);

    expect(wrap.getAttribute('data-pkc-image-zoom')).toBe('fit');
    expect(img.style.transform).toBe('');
    expect(img.classList.contains('pkc-image-preview-img-fit')).toBe(true);
  });

  it('Ctrl+wheel zooms around cursor and switches to numeric mode', () => {
    const wheel = new Event('wheel', { bubbles: true, cancelable: true });
    Object.defineProperty(wheel, 'ctrlKey', { value: true });
    Object.defineProperty(wheel, 'deltaY', { value: -100 }); // scroll up = zoom in
    Object.defineProperty(wheel, 'clientX', { value: 400 });
    Object.defineProperty(wheel, 'clientY', { value: 300 });
    stage.dispatchEvent(wheel);

    expect(img.classList.contains('pkc-image-preview-img-fit')).toBe(false);
    const zoom = wrap.getAttribute('data-pkc-image-zoom');
    expect(zoom).not.toBe('fit');
    expect(Number(zoom)).toBeGreaterThan(100);
    expect(img.style.transform).toMatch(/translate\(/);
    expect(img.style.transform).toMatch(/scale\(/);
  });

  it('plain wheel (no Ctrl) does NOT zoom — leaves layout to native scroll', () => {
    const wheel = new Event('wheel', { bubbles: true, cancelable: true });
    Object.defineProperty(wheel, 'ctrlKey', { value: false });
    Object.defineProperty(wheel, 'deltaY', { value: -100 });
    Object.defineProperty(wheel, 'clientX', { value: 400 });
    Object.defineProperty(wheel, 'clientY', { value: 300 });
    stage.dispatchEvent(wheel);

    expect(wrap.getAttribute('data-pkc-image-zoom')).toBe('fit');
  });

  it('re-mount aborts the previous gesture controller (no listener leak)', () => {
    // Pinch-zoom to numeric.
    dispatchTouch(stage, 'touchstart', [
      { identifier: 0, clientX: 350, clientY: 300, target: stage },
      { identifier: 1, clientX: 450, clientY: 300, target: stage },
    ]);
    dispatchTouch(stage, 'touchmove', [
      { identifier: 0, clientX: 300, clientY: 300, target: stage },
      { identifier: 1, clientX: 500, clientY: 300, target: stage },
    ]);
    expect(wrap.getAttribute('data-pkc-image-zoom')).toBe('200');

    // Re-mount with a fresh image.
    __mountImagePreviewBodyForTest(stage, { src: TINY_PNG, label: 'test2' });
    const newWrap = stage.querySelector('.pkc-image-preview-wrap') as HTMLElement;
    const newImg = stage.querySelector('img') as HTMLImageElement;
    Object.defineProperty(newImg, 'naturalWidth', { value: 400, configurable: true });
    Object.defineProperty(newImg, 'naturalHeight', { value: 300, configurable: true });

    // Old wrap was removed, new wrap starts at fit.
    expect(newWrap).not.toBe(wrap);
    expect(newWrap.getAttribute('data-pkc-image-zoom')).toBe('fit');

    // Pinch on new wrap zooms it (proving fresh handlers are bound).
    dispatchTouch(stage, 'touchstart', [
      { identifier: 0, clientX: 350, clientY: 300, target: stage },
      { identifier: 1, clientX: 450, clientY: 300, target: stage },
    ]);
    dispatchTouch(stage, 'touchmove', [
      { identifier: 0, clientX: 300, clientY: 300, target: stage },
      { identifier: 1, clientX: 500, clientY: 300, target: stage },
    ]);
    expect(newWrap.getAttribute('data-pkc-image-zoom')).toBe('200');
  });
});
