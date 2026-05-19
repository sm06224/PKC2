/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  renderMediaViewer,
  openMediaViewer,
  closeMediaViewer,
  isMediaViewerOpen,
} from '@adapter/ui/media-viewer';

/**
 * PR #203 → 2026-05-19 PiP 廃止後の test 更新。
 *
 * Two delivery paths covered:
 *   - **`window.open()` 新規 window**(全ブラウザ対応):popup の document
 *     に host stylesheet を copy + cloned content を inject。本 test では
 *     `window.open` を stub して popup document への注入を検証。
 *   - **Modal fallback**:happy-dom default では `window.open` が `null`
 *     を返す環境を作って modal path に flow させる。
 */

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('renderMediaViewer — DOM shape', () => {
  it('renders backdrop + dialog, hidden by default', () => {
    const backdrop = renderMediaViewer();
    expect(backdrop.getAttribute('data-pkc-region')).toBe('media-viewer-backdrop');
    expect(backdrop.hidden).toBe(true);
    const dialog = backdrop.querySelector('[data-pkc-region="media-viewer"]');
    expect(dialog).toBeTruthy();
    expect(dialog!.getAttribute('role')).toBe('dialog');
    expect(dialog!.getAttribute('aria-modal')).toBe('true');
  });

  it('exposes a close button with the correct action attribute', () => {
    const backdrop = renderMediaViewer();
    const closeBtn = backdrop.querySelector<HTMLButtonElement>(
      '[data-pkc-action="close-media-viewer"]',
    );
    expect(closeBtn).toBeTruthy();
    expect(closeBtn!.type).toBe('button');
  });

  it('exposes a content region for the cloned source', () => {
    const backdrop = renderMediaViewer();
    const content = backdrop.querySelector('[data-pkc-region="media-viewer-content"]');
    expect(content).toBeTruthy();
    expect(content!.classList.contains('pkc-md-rendered')).toBe(true);
  });
});

describe('openMediaViewer / closeMediaViewer — modal fallback', () => {
  function mountViewer(): HTMLElement {
    const backdrop = renderMediaViewer();
    document.body.appendChild(backdrop);
    return backdrop;
  }

  // PiP 廃止後(2026-05-19):default で window.open() を試すので、modal path
  // を意図的に効かせるために window.open を null returner に stub。
  let originalOpen: typeof window.open;
  beforeEach(() => {
    originalOpen = window.open;
    (window as unknown as { open: typeof window.open }).open = () => null;
  });
  afterEach(() => {
    (window as unknown as { open: typeof window.open }).open = originalOpen;
  });

  it('returns false from isMediaViewerOpen when not yet opened', () => {
    mountViewer();
    expect(isMediaViewerOpen()).toBe(false);
  });

  it('clones the source into the content area and unhides the overlay', async () => {
    const backdrop = mountViewer();
    const source = document.createElement('div');
    source.className = 'pkc-md-block';
    source.setAttribute('data-pkc-md-block-kind', 'table');
    source.innerHTML = '<table><tr><td>cell</td></tr></table>';
    document.body.appendChild(source);

    await openMediaViewer(source);

    expect(backdrop.hidden).toBe(false);
    expect(isMediaViewerOpen()).toBe(true);
    const content = backdrop.querySelector('[data-pkc-region="media-viewer-content"]')!;
    expect(content.querySelector('table')).toBeTruthy();
    expect(content.querySelector('td')!.textContent).toBe('cell');
    // Original is untouched.
    expect(document.body.contains(source)).toBe(true);
  });

  it('strips copy buttons from the clone (no copy chrome inside the viewer)', async () => {
    mountViewer();
    const source = document.createElement('div');
    source.className = 'pkc-md-block';
    source.innerHTML =
      '<button class="pkc-md-copy-btn" data-pkc-action="copy-md-block">⧉</button>'
      + '<table><tr><td>data</td></tr></table>';
    document.body.appendChild(source);

    await openMediaViewer(source);

    const content = document.querySelector('[data-pkc-region="media-viewer-content"]')!;
    expect(content.querySelector('.pkc-md-copy-btn')).toBeNull();
    expect(source.querySelector('.pkc-md-copy-btn')).toBeTruthy();
  });

  it('marks the clone with `pkc-media-viewer-clone` so CSS can lift overflow caps', async () => {
    mountViewer();
    const source = document.createElement('div');
    source.className = 'pkc-md-block';
    source.innerHTML = '<table><tr><td>x</td></tr></table>';
    document.body.appendChild(source);

    await openMediaViewer(source);

    const clone = document.querySelector(
      '[data-pkc-region="media-viewer-content"] .pkc-media-viewer-clone',
    );
    expect(clone).toBeTruthy();
  });

  it('replaces previous content on subsequent open calls', async () => {
    mountViewer();
    const a = document.createElement('div');
    a.className = 'pkc-md-block';
    a.innerHTML = '<pre>first</pre>';
    const b = document.createElement('div');
    b.className = 'pkc-md-block';
    b.innerHTML = '<pre>second</pre>';
    document.body.append(a, b);

    await openMediaViewer(a);
    await openMediaViewer(b);

    const content = document.querySelector('[data-pkc-region="media-viewer-content"]')!;
    const pres = content.querySelectorAll('pre');
    expect(pres.length).toBe(1);
    expect(pres[0]!.textContent).toBe('second');
  });

  it('closeMediaViewer hides the overlay and clears the clone', async () => {
    mountViewer();
    const source = document.createElement('div');
    source.className = 'pkc-md-block';
    source.innerHTML = '<pre>x</pre>';
    document.body.appendChild(source);

    await openMediaViewer(source);
    expect(isMediaViewerOpen()).toBe(true);

    closeMediaViewer();
    expect(isMediaViewerOpen()).toBe(false);
    const content = document.querySelector('[data-pkc-region="media-viewer-content"]')!;
    expect(content.children.length).toBe(0);
  });

  it('open / close on a viewer that was never mounted is a no-op', async () => {
    const source = document.createElement('div');
    source.className = 'pkc-md-block';
    await expect(openMediaViewer(source)).resolves.toBeUndefined();
    expect(() => closeMediaViewer()).not.toThrow();
    expect(isMediaViewerOpen()).toBe(false);
  });

  it('opens on an <img> element', async () => {
    mountViewer();
    const img = document.createElement('img');
    img.src = 'data:image/png;base64,iVBORw0KGgo=';
    img.alt = 'sample';
    document.body.appendChild(img);

    await openMediaViewer(img);

    const content = document.querySelector('[data-pkc-region="media-viewer-content"]')!;
    const cloneImg = content.querySelector('img');
    expect(cloneImg).toBeTruthy();
    expect(cloneImg!.alt).toBe('sample');
  });
});

describe('openMediaViewer — window.open() 新規 window 経路(PiP 廃止後の主経路)', () => {
  it('window.open() が popup を返す場合、popup document に cloned content を挿入', async () => {
    // window.open を stub:fake popup window を返す。
    const fakePopupDoc = document.implementation.createHTMLDocument('popup');
    const fakePopup = {
      document: fakePopupDoc,
      closed: false,
      close: () => {
        (fakePopup as unknown as { closed: boolean }).closed = true;
      },
      addEventListener: () => {},
    } as unknown as Window;

    const originalOpen = window.open;
    let openCalled = false;
    (window as unknown as { open: typeof window.open }).open = () => {
      openCalled = true;
      return fakePopup;
    };

    try {
      const source = document.createElement('div');
      source.className = 'pkc-md-block';
      source.innerHTML = '<table><tr><td>row</td></tr></table>';
      document.body.appendChild(source);

      await openMediaViewer(source);

      expect(openCalled).toBe(true);
      // Clone landed in the popup document, NOT in the host document.
      expect(fakePopupDoc.querySelector('table')).toBeTruthy();
      expect(fakePopupDoc.querySelector('.pkc-media-viewer-clone')).toBeTruthy();
    } finally {
      (window as unknown as { open: typeof window.open }).open = originalOpen;
    }
  });

  it('window.open() が null を返す(popup blocker)場合、modal にフォール', async () => {
    const host = renderMediaViewer();
    document.body.appendChild(host);

    const originalOpen = window.open;
    (window as unknown as { open: typeof window.open }).open = () => null;

    try {
      const source = document.createElement('div');
      source.className = 'pkc-md-block';
      source.innerHTML = '<table><tr><td>row</td></tr></table>';
      document.body.appendChild(source);

      await openMediaViewer(source);

      // popup blocked → modal が表示される
      const backdrop = document.querySelector<HTMLElement>('[data-pkc-region="media-viewer-backdrop"]');
      expect(backdrop?.hidden).toBe(false);
      const content = document.querySelector<HTMLElement>('[data-pkc-region="media-viewer-content"]');
      expect(content?.querySelector('table')).toBeTruthy();
    } finally {
      (window as unknown as { open: typeof window.open }).open = originalOpen;
    }
  });
});
