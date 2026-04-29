/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  renderMediaViewer,
  openMediaViewer,
  closeMediaViewer,
  isMediaViewerOpen,
} from '@adapter/ui/media-viewer';

/**
 * PR #203 — media viewer modal.
 *
 * Tests pin two surfaces:
 *   1. `renderMediaViewer()` — DOM shape (backdrop + dialog +
 *      close button + content area, hidden by default).
 *   2. `openMediaViewer(source)` / `closeMediaViewer()` — the
 *      content area receives a clone of the source, the overlay
 *      becomes visible, copy buttons inside the clone are stripped
 *      so the viewer presents nothing but the media itself.
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

describe('openMediaViewer / closeMediaViewer', () => {
  function mountViewer(): HTMLElement {
    const backdrop = renderMediaViewer();
    document.body.appendChild(backdrop);
    return backdrop;
  }

  it('returns false from isMediaViewerOpen when not yet opened', () => {
    mountViewer();
    expect(isMediaViewerOpen()).toBe(false);
  });

  it('clones the source into the content area and unhides the overlay', () => {
    const backdrop = mountViewer();
    const source = document.createElement('div');
    source.className = 'pkc-md-block';
    source.setAttribute('data-pkc-md-block-kind', 'table');
    source.innerHTML = '<table><tr><td>cell</td></tr></table>';
    document.body.appendChild(source);

    openMediaViewer(source);

    expect(backdrop.hidden).toBe(false);
    expect(isMediaViewerOpen()).toBe(true);
    const content = backdrop.querySelector('[data-pkc-region="media-viewer-content"]')!;
    expect(content.querySelector('table')).toBeTruthy();
    expect(content.querySelector('td')!.textContent).toBe('cell');
    // Original is untouched.
    expect(document.body.contains(source)).toBe(true);
  });

  it('strips copy buttons from the clone (no copy chrome inside the viewer)', () => {
    mountViewer();
    const source = document.createElement('div');
    source.className = 'pkc-md-block';
    source.innerHTML =
      '<button class="pkc-md-copy-btn" data-pkc-action="copy-md-block">⧉</button>'
      + '<table><tr><td>data</td></tr></table>';
    document.body.appendChild(source);

    openMediaViewer(source);

    const content = document.querySelector('[data-pkc-region="media-viewer-content"]')!;
    expect(content.querySelector('.pkc-md-copy-btn')).toBeNull();
    // Source still has its button.
    expect(source.querySelector('.pkc-md-copy-btn')).toBeTruthy();
  });

  it('marks the clone with `pkc-media-viewer-clone` so CSS can lift overflow caps', () => {
    mountViewer();
    const source = document.createElement('div');
    source.className = 'pkc-md-block';
    source.innerHTML = '<table><tr><td>x</td></tr></table>';
    document.body.appendChild(source);

    openMediaViewer(source);

    const clone = document.querySelector(
      '[data-pkc-region="media-viewer-content"] .pkc-media-viewer-clone',
    );
    expect(clone).toBeTruthy();
  });

  it('replaces previous content on subsequent open calls', () => {
    mountViewer();
    const a = document.createElement('div');
    a.className = 'pkc-md-block';
    a.innerHTML = '<pre>first</pre>';
    const b = document.createElement('div');
    b.className = 'pkc-md-block';
    b.innerHTML = '<pre>second</pre>';
    document.body.append(a, b);

    openMediaViewer(a);
    openMediaViewer(b);

    const content = document.querySelector('[data-pkc-region="media-viewer-content"]')!;
    const pres = content.querySelectorAll('pre');
    expect(pres.length).toBe(1);
    expect(pres[0]!.textContent).toBe('second');
  });

  it('closeMediaViewer hides the overlay and clears the clone', () => {
    mountViewer();
    const source = document.createElement('div');
    source.className = 'pkc-md-block';
    source.innerHTML = '<pre>x</pre>';
    document.body.appendChild(source);

    openMediaViewer(source);
    expect(isMediaViewerOpen()).toBe(true);

    closeMediaViewer();
    expect(isMediaViewerOpen()).toBe(false);
    const content = document.querySelector('[data-pkc-region="media-viewer-content"]')!;
    expect(content.children.length).toBe(0);
  });

  it('open / close on a viewer that was never mounted is a no-op', () => {
    const source = document.createElement('div');
    source.className = 'pkc-md-block';
    expect(() => openMediaViewer(source)).not.toThrow();
    expect(() => closeMediaViewer()).not.toThrow();
    expect(isMediaViewerOpen()).toBe(false);
  });

  it('opens on an <img> element', () => {
    mountViewer();
    const img = document.createElement('img');
    img.src = 'data:image/png;base64,iVBORw0KGgo=';
    img.alt = 'sample';
    document.body.appendChild(img);

    openMediaViewer(img);

    const content = document.querySelector('[data-pkc-region="media-viewer-content"]')!;
    const cloneImg = content.querySelector('img');
    expect(cloneImg).toBeTruthy();
    expect(cloneImg!.alt).toBe('sample');
  });
});
