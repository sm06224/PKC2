/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  renderMediaViewer,
  openMediaViewer,
  closeMediaViewer,
  isMediaViewerOpen,
} from '@adapter/ui/media-viewer';

/**
 * PR #203 — media viewer.
 *
 * Two delivery paths covered indirectly:
 *   - Real browsers with `documentPictureInPicture`: open spawns a
 *     free-floating PiP window. Untested here (happy-dom doesn't
 *     expose the API).
 *   - Fallback modal overlay: covered below. happy-dom doesn't
 *     expose `documentPictureInPicture`, so `openMediaViewer`
 *     resolves to the modal path and we can pin the same shape we
 *     shipped in v1.
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

describe('openMediaViewer — Document PiP path (when API is present)', () => {
  it('opens via documentPictureInPicture.requestWindow when supported', async () => {
    // Stub a minimal PiP window (just a doc-like body for our clone).
    const fakePipDoc = document.implementation.createHTMLDocument('pip');
    let closed = false;
    const fakePipWindow = {
      document: fakePipDoc,
      closed,
      close: () => {
        closed = true;
        (fakePipWindow as unknown as { closed: boolean }).closed = true;
      },
      addEventListener: () => {},
    } as unknown as Window;

    let requested = false;
    (window as unknown as Record<string, unknown>).documentPictureInPicture = {
      requestWindow: async () => {
        requested = true;
        return fakePipWindow;
      },
    };

    try {
      const source = document.createElement('div');
      source.className = 'pkc-md-block';
      source.innerHTML = '<table><tr><td>row</td></tr></table>';
      document.body.appendChild(source);

      // No mounted modal; PiP path is the only option.
      await openMediaViewer(source);

      expect(requested).toBe(true);
      // Clone landed in the PiP document, NOT in the host document.
      expect(fakePipDoc.querySelector('table')).toBeTruthy();
      expect(fakePipDoc.querySelector('.pkc-media-viewer-clone')).toBeTruthy();
    } finally {
      delete (window as unknown as Record<string, unknown>).documentPictureInPicture;
    }
  });
});
