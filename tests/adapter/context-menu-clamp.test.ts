/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { clampMenuToViewport, renderContextMenu } from '@adapter/ui/renderer';

/**
 * Bugfix — context menu / overlay z-index + viewport clamping
 * (2026-04-14). Two independent regressions:
 *
 *   1. sandbox/PDF/video/HTML previews (z-index 10000) used to
 *      paint over settings / context menus (old z-index 200–210).
 *      Fixed in base.css by lifting overlays into the 20000 tier.
 *
 *   2. `renderContextMenu` placed the menu at raw (clientX, clientY)
 *      with no viewport clamping, so right-clicks near the right /
 *      bottom edge rendered the menu partly off-screen. Fixed by
 *      adding `clampMenuToViewport` and calling it in action-binder
 *      after every appendChild.
 *
 * These tests pin the clamp behaviour. The z-index tier fix is CSS-
 * only and is exercised by the test below that inspects
 * renderContextMenu's rendered class — we don't try to assert the
 * resolved z-index value because happy-dom's CSS engine does not
 * load base.css at test time.
 */

// Pin happy-dom's viewport so the clamp boundaries are predictable.
const VW = 1024;
const VH = 768;

beforeEach(() => {
  Object.defineProperty(window, 'innerWidth', { value: VW, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: VH, configurable: true });
});

afterEach(() => {
  document.body.innerHTML = '';
});

/**
 * happy-dom's layout engine does not run box-model calculations, so
 * `offsetWidth` / `getBoundingClientRect()` return 0 by default.
 * Stub getBoundingClientRect to a fixed width/height so the clamp
 * logic has realistic numbers to work with.
 */
function stubBoundingRect(el: HTMLElement, width: number, height: number): void {
  el.getBoundingClientRect = () => {
    const left = parseFloat(el.style.left || '0');
    const top = parseFloat(el.style.top || '0');
    return {
      x: left,
      y: top,
      left,
      top,
      right: left + width,
      bottom: top + height,
      width,
      height,
      toJSON() { return this; },
    } as DOMRect;
  };
}

describe('clampMenuToViewport', () => {
  it('leaves a menu unchanged when it fits inside the viewport', () => {
    const menu = document.createElement('div');
    menu.style.position = 'fixed';
    menu.style.left = '100px';
    menu.style.top = '100px';
    document.body.appendChild(menu);
    stubBoundingRect(menu, 200, 150);

    clampMenuToViewport(menu);

    expect(menu.style.left).toBe('100px');
    expect(menu.style.top).toBe('100px');
  });

  it('shifts left when the menu would overflow the right edge', () => {
    const menu = document.createElement('div');
    menu.style.position = 'fixed';
    // With width 200, clientX 950 puts right at 1150 — past VW=1024.
    menu.style.left = '950px';
    menu.style.top = '100px';
    document.body.appendChild(menu);
    stubBoundingRect(menu, 200, 150);

    clampMenuToViewport(menu, 4);

    // Expected new left = vw - margin - width = 1024 - 4 - 200 = 820
    expect(menu.style.left).toBe('820px');
    expect(menu.style.top).toBe('100px');
  });

  it('shifts up when the menu would overflow the bottom edge', () => {
    const menu = document.createElement('div');
    menu.style.position = 'fixed';
    menu.style.left = '100px';
    // With height 150, clientY 700 puts bottom at 850 — past VH=768.
    menu.style.top = '700px';
    document.body.appendChild(menu);
    stubBoundingRect(menu, 200, 150);

    clampMenuToViewport(menu, 4);

    expect(menu.style.left).toBe('100px');
    // Expected new top = vh - margin - height = 768 - 4 - 150 = 614
    expect(menu.style.top).toBe('614px');
  });

  it('clamps both axes simultaneously at the bottom-right corner', () => {
    const menu = document.createElement('div');
    menu.style.position = 'fixed';
    menu.style.left = '990px';
    menu.style.top = '740px';
    document.body.appendChild(menu);
    stubBoundingRect(menu, 200, 150);

    clampMenuToViewport(menu, 4);

    expect(menu.style.left).toBe('820px');
    expect(menu.style.top).toBe('614px');
  });

  it('never shifts the menu past the top-left margin', () => {
    // Pathological: a tiny viewport smaller than the menu. Clamp
    // should still keep left/top >= margin rather than produce
    // negative coordinates.
    Object.defineProperty(window, 'innerWidth', { value: 100, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 100, configurable: true });

    const menu = document.createElement('div');
    menu.style.position = 'fixed';
    menu.style.left = '50px';
    menu.style.top = '50px';
    document.body.appendChild(menu);
    stubBoundingRect(menu, 200, 150);

    clampMenuToViewport(menu, 4);

    expect(menu.style.left).toBe('4px');
    expect(menu.style.top).toBe('4px');
  });

  it('is a no-op when window dimensions are zero (SSR / offscreen)', () => {
    Object.defineProperty(window, 'innerWidth', { value: 0, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 0, configurable: true });

    const menu = document.createElement('div');
    menu.style.left = '950px';
    menu.style.top = '700px';
    document.body.appendChild(menu);
    stubBoundingRect(menu, 200, 150);

    clampMenuToViewport(menu);

    // unchanged
    expect(menu.style.left).toBe('950px');
    expect(menu.style.top).toBe('700px');
  });
});

describe('renderContextMenu — class contract (z-index tier assertion)', () => {
  it('tags the menu with the .pkc-context-menu class so the 20000-tier CSS applies', () => {
    // This is a structural assertion. The actual z-index value lives
    // in base.css (`.pkc-context-menu { z-index: 20000 }`). If a
    // refactor ever drops the class, the bug returns silently; this
    // test keeps the contract honest.
    const menu = renderContextMenu('lid-1', 100, 100, {
      archetype: 'text',
      canEdit: true,
      hasParent: false,
    });
    expect(menu.classList.contains('pkc-context-menu')).toBe(true);
    expect(menu.getAttribute('data-pkc-region')).toBe('context-menu');
  });

  it('passes through raw x/y into style.left/top (clamp is caller responsibility)', () => {
    // Documents the split of concerns: renderContextMenu is pure
    // layout, clampMenuToViewport adjusts post-append.
    const menu = renderContextMenu('lid-2', 950, 700, {
      archetype: 'text',
      canEdit: true,
      hasParent: false,
    });
    expect(menu.style.left).toBe('950px');
    expect(menu.style.top).toBe('700px');
  });
});

// Suppress vi unused-import lint when the above assertions suffice.
void vi;
