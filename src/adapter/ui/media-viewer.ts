/**
 * Media viewer (PR #203, 2026-04-29).
 *
 * Two delivery paths, picked at runtime:
 *
 *   1. **Document Picture-in-Picture** (Chrome / Edge 116+).
 *      Opens a real OS-level always-on-top floating window via
 *      `documentPictureInPicture.requestWindow()`. Sized free of the
 *      host page — wide tables get all the horizontal room they
 *      need, the user can drag / resize the PiP, and it stays
 *      visible while they work in the main window. The host page's
 *      stylesheets are cloned in so the rendered look matches.
 *
 *   2. **Fallback modal overlay** (Safari, Firefox, anywhere PiP
 *      is unavailable). Same backdrop + dialog card we shipped in
 *      v1; constrained to the host viewport but at least full-
 *      width within it.
 *
 * Open path is async because PiP request returns a promise;
 * `openMediaViewer(source)` resolves once either path finishes
 * setting up.
 *
 * Pure DOM helpers — no dispatcher / state coupling. The action
 * binder owns event wiring.
 */

interface DocumentPiPApi {
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
}

function getDocumentPiP(): DocumentPiPApi | null {
  const w = window as unknown as { documentPictureInPicture?: DocumentPiPApi };
  return w.documentPictureInPicture ?? null;
}

/**
 * Render the modal-fallback viewer overlay. Hidden by default; the
 * action binder unhides it when PiP is unavailable.
 */
export function renderMediaViewer(): HTMLElement {
  const backdrop = document.createElement('div');
  backdrop.className = 'pkc-media-viewer-backdrop';
  backdrop.setAttribute('data-pkc-region', 'media-viewer-backdrop');
  backdrop.hidden = true;

  const card = document.createElement('div');
  card.className = 'pkc-media-viewer-card';
  card.setAttribute('data-pkc-region', 'media-viewer');
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  card.setAttribute('aria-label', 'Expanded media view');

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'pkc-media-viewer-close';
  closeBtn.setAttribute('data-pkc-action', 'close-media-viewer');
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = '✕';
  card.appendChild(closeBtn);

  const content = document.createElement('div');
  content.className = 'pkc-media-viewer-content pkc-md-rendered';
  content.setAttribute('data-pkc-region', 'media-viewer-content');
  card.appendChild(content);

  backdrop.appendChild(card);
  return backdrop;
}

function findMediaViewer(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-pkc-region="media-viewer-backdrop"]');
}

function findContentArea(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-pkc-region="media-viewer-content"]');
}

/**
 * Build a clone of `source` with viewer-specific cleanup applied
 * (strip copy / expand buttons, mark with `pkc-media-viewer-clone`
 * so CSS can lift overflow caps).
 */
function buildViewerClone(source: Element): Element {
  const clone = source.cloneNode(true) as Element;
  for (const sel of ['.pkc-md-copy-btn', '[data-pkc-action="expand-md-block"]']) {
    for (const el of clone.querySelectorAll(sel)) el.remove();
  }
  if (clone instanceof HTMLElement) {
    clone.classList.add('pkc-media-viewer-clone');
  }
  return clone;
}

/**
 * Copy every accessible CSS rule from the host document into a
 * `<style>` tag in the PiP window, so the cloned content renders
 * identically. Cross-origin sheets are skipped silently (their
 * rules aren't readable; usually they're not relevant to a PKC2
 * single-HTML build anyway).
 */
function cloneStylesheetsInto(target: Document): void {
  const css: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const rules = (sheet as CSSStyleSheet).cssRules;
      for (const rule of Array.from(rules)) {
        css.push(rule.cssText);
      }
    } catch {
      // Cross-origin or otherwise inaccessible — skip.
    }
  }
  const style = target.createElement('style');
  style.textContent = css.join('\n');
  target.head.appendChild(style);
}

/**
 * Track the currently open PiP window so subsequent open calls can
 * close the previous one before spawning a new one(otherwise the
 * user accumulates orphan windows).
 */
let activePipWindow: Window | null = null;

async function tryOpenInPiP(source: Element): Promise<boolean> {
  const pip = getDocumentPiP();
  if (!pip) return false;
  try {
    // Close any previous PiP window from a stale open call.
    if (activePipWindow && !activePipWindow.closed) {
      activePipWindow.close();
    }
    const pipWindow = await pip.requestWindow({ width: 900, height: 640 });
    activePipWindow = pipWindow;

    cloneStylesheetsInto(pipWindow.document);

    // Mirror the body classes/data attributes that drive theming
    // (`data-pkc-theme`, `data-pkc-scanline`, etc.) so the cloned
    // content uses the user's chosen palette.
    for (const attr of Array.from(document.documentElement.attributes)) {
      pipWindow.document.documentElement.setAttribute(attr.name, attr.value);
    }
    for (const attr of Array.from(document.body.attributes)) {
      pipWindow.document.body.setAttribute(attr.name, attr.value);
    }

    // Layout container — `.pkc-md-rendered` for inherited prose
    // styling, padding for visual breathing room.
    const container = pipWindow.document.createElement('div');
    container.className = 'pkc-md-rendered pkc-media-viewer-pip-body';
    container.appendChild(buildViewerClone(source));
    pipWindow.document.body.appendChild(container);

    // Ensure the host knows when the user closes the PiP window so
    // we can clear the reference (lets the next open spawn fresh).
    pipWindow.addEventListener('pagehide', () => {
      if (activePipWindow === pipWindow) activePipWindow = null;
    });
    return true;
  } catch (err) {
    // PiP can be denied (e.g. user gesture missing, blocked by
    // policy). Fall through to the modal path.
    console.warn('[media-viewer] Document PiP unavailable:', err);
    return false;
  }
}

function openModalFallback(source: Element): void {
  const backdrop = findMediaViewer();
  const content = findContentArea();
  if (!backdrop || !content) return;
  content.innerHTML = '';
  content.appendChild(buildViewerClone(source));
  backdrop.hidden = false;
}

/**
 * Show the viewer for `source`. Tries Document Picture-in-Picture
 * first (free-floating OS window, no parent-size constraint); falls
 * back to the in-page modal where PiP is unavailable.
 */
export async function openMediaViewer(source: Element): Promise<void> {
  if (await tryOpenInPiP(source)) return;
  openModalFallback(source);
}

/**
 * Close whichever delivery is open: PiP window if active, modal
 * otherwise.
 */
export function closeMediaViewer(): void {
  if (activePipWindow && !activePipWindow.closed) {
    activePipWindow.close();
    activePipWindow = null;
  }
  const backdrop = findMediaViewer();
  const content = findContentArea();
  if (backdrop) backdrop.hidden = true;
  if (content) content.innerHTML = '';
}

/**
 * Returns whether either delivery is currently open.
 */
export function isMediaViewerOpen(): boolean {
  if (activePipWindow && !activePipWindow.closed) return true;
  const backdrop = findMediaViewer();
  return !!backdrop && !backdrop.hidden;
}
