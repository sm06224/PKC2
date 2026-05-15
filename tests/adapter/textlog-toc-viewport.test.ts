/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { attachTocViewportTracker } from '@adapter/ui/textlog-toc-viewport';

/**
 * PR-V8(2026-05-14、textlog-viewer-and-linkability-redesign §8 future
 * enhancement):TEXTLOG TOC viewport highlight tracker。
 *
 * IntersectionObserver の callback を mock し、textlog の article / day
 * section が viewport に入ったとき、対応する TOC ボタンに
 * `data-pkc-toc-current="true"` が attach されることを検証。
 */

let originalIO: typeof IntersectionObserver;
let intersectionCallback: IntersectionObserverCallback | null = null;
let observedElements: HTMLElement[];

beforeEach(() => {
  originalIO = globalThis.IntersectionObserver;
  intersectionCallback = null;
  observedElements = [];
  globalThis.IntersectionObserver = class MockIO {
    constructor(cb: IntersectionObserverCallback) {
      intersectionCallback = cb;
    }
    observe(el: Element): void { observedElements.push(el as HTMLElement); }
    unobserve(el: Element): void {
      const idx = observedElements.indexOf(el as HTMLElement);
      if (idx >= 0) observedElements.splice(idx, 1);
    }
    disconnect(): void { observedElements = []; }
    takeRecords(): IntersectionObserverEntry[] { return []; }
    root = null;
    rootMargin = '';
    thresholds = [0];
  } as unknown as typeof IntersectionObserver;
});

afterEach(() => {
  globalThis.IntersectionObserver = originalIO;
});

function buildTextlogDom(): {
  docEl: HTMLElement;
  tocEl: HTMLElement;
  articleA: HTMLElement;
  articleB: HTMLElement;
  daySection: HTMLElement;
  tocBtnA: HTMLElement;
  tocBtnB: HTMLElement;
  tocBtnDay: HTMLElement;
} {
  const root = document.createElement('div');
  document.body.appendChild(root);

  // center pane: textlog doc with day section containing 2 articles
  const docEl = document.createElement('div');
  docEl.className = 'pkc-textlog-doc';
  const daySection = document.createElement('section');
  daySection.id = 'day-2026-05-14';
  const articleA = document.createElement('article');
  articleA.setAttribute('data-pkc-log-id', 'log-A');
  articleA.id = 'log-log-A';
  const articleB = document.createElement('article');
  articleB.setAttribute('data-pkc-log-id', 'log-B');
  articleB.id = 'log-log-B';
  daySection.appendChild(articleA);
  daySection.appendChild(articleB);
  docEl.appendChild(daySection);
  root.appendChild(docEl);

  // meta pane: TOC sidebar
  const tocEl = document.createElement('div');
  tocEl.setAttribute('data-pkc-region', 'toc');
  const dayBtn = document.createElement('button');
  dayBtn.className = 'pkc-toc-link';
  dayBtn.setAttribute('data-pkc-toc-target-id', 'day-2026-05-14');
  const btnA = document.createElement('button');
  btnA.className = 'pkc-toc-link';
  btnA.setAttribute('data-pkc-toc-target-id', 'log-log-A');
  btnA.setAttribute('data-pkc-log-id', 'log-A');
  const btnB = document.createElement('button');
  btnB.className = 'pkc-toc-link';
  btnB.setAttribute('data-pkc-toc-target-id', 'log-log-B');
  btnB.setAttribute('data-pkc-log-id', 'log-B');
  tocEl.appendChild(dayBtn);
  tocEl.appendChild(btnA);
  tocEl.appendChild(btnB);
  root.appendChild(tocEl);

  return { docEl, tocEl, articleA, articleB, daySection, tocBtnA: btnA, tocBtnB: btnB, tocBtnDay: dayBtn };
}

function fireIntersection(
  el: HTMLElement,
  isIntersecting: boolean,
  top: number,
): void {
  intersectionCallback!(
    [{
      isIntersecting,
      target: el,
      boundingClientRect: { top, left: 0, bottom: top + 100, right: 100, width: 100, height: 100, x: 0, y: top } as DOMRectReadOnly,
      intersectionRect: { top, left: 0, bottom: top + 100, right: 100, width: 100, height: 100, x: 0, y: top } as DOMRectReadOnly,
      intersectionRatio: isIntersecting ? 1 : 0,
      rootBounds: null,
      time: 0,
    } as unknown as IntersectionObserverEntry],
    {} as IntersectionObserver,
  );
}

describe('PR-V8 attachTocViewportTracker', () => {
  it('attaches observer on all article + day elements in docEl', () => {
    const { docEl } = buildTextlogDom();
    const handle = attachTocViewportTracker(docEl);
    // 2 articles + 1 day section = 3 observed
    expect(observedElements.length).toBe(3);
    handle.disconnect();
    document.body.innerHTML = '';
  });

  it('marks the topmost visible article as current in TOC', () => {
    const { docEl, articleA, articleB, tocBtnA, tocBtnB } = buildTextlogDom();
    const handle = attachTocViewportTracker(docEl);

    // Both A and B become visible; A has smaller top → current
    fireIntersection(articleA, true, 100);
    fireIntersection(articleB, true, 400);

    expect(tocBtnA.getAttribute('data-pkc-toc-current')).toBe('true');
    expect(tocBtnB.hasAttribute('data-pkc-toc-current')).toBe(false);
    handle.disconnect();
    document.body.innerHTML = '';
  });

  it('switches current when scrolling — A leaves, B becomes top', () => {
    const { docEl, articleA, articleB, tocBtnA, tocBtnB } = buildTextlogDom();
    const handle = attachTocViewportTracker(docEl);

    fireIntersection(articleA, true, 100);
    fireIntersection(articleB, true, 400);
    expect(tocBtnA.getAttribute('data-pkc-toc-current')).toBe('true');

    // A scrolls out, B remains visible
    fireIntersection(articleA, false, -200);
    expect(tocBtnA.hasAttribute('data-pkc-toc-current')).toBe(false);
    expect(tocBtnB.getAttribute('data-pkc-toc-current')).toBe('true');
    handle.disconnect();
    document.body.innerHTML = '';
  });

  it('marks day section as current when only day is visible (no article)', () => {
    const { docEl, daySection, tocBtnDay } = buildTextlogDom();
    const handle = attachTocViewportTracker(docEl);

    fireIntersection(daySection, true, 50);
    expect(tocBtnDay.getAttribute('data-pkc-toc-current')).toBe('true');
    handle.disconnect();
    document.body.innerHTML = '';
  });

  it('disconnect() removes the current marker and stops observing', () => {
    const { docEl, articleA, tocBtnA } = buildTextlogDom();
    const handle = attachTocViewportTracker(docEl);

    fireIntersection(articleA, true, 100);
    expect(tocBtnA.getAttribute('data-pkc-toc-current')).toBe('true');

    handle.disconnect();
    expect(tocBtnA.hasAttribute('data-pkc-toc-current')).toBe(false);
    document.body.innerHTML = '';
  });

  it('returns a no-op handle when IntersectionObserver is undefined', () => {
    const origIO = globalThis.IntersectionObserver;
    (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = undefined;
    const { docEl } = buildTextlogDom();
    const handle = attachTocViewportTracker(docEl);
    expect(typeof handle.disconnect).toBe('function');
    handle.disconnect(); // should not throw
    globalThis.IntersectionObserver = origIO;
    document.body.innerHTML = '';
  });

  it('returns a no-op handle when no observed elements exist in docEl', () => {
    const docEl = document.createElement('div');
    document.body.appendChild(docEl);
    const handle = attachTocViewportTracker(docEl);
    expect(observedElements.length).toBe(0);
    handle.disconnect();
    document.body.removeChild(docEl);
  });
});
