/**
 * Media viewer (PR #203, 2026-04-29).
 *
 * A modal overlay that displays a single markdown block (table /
 * code fence / image) at full screen size so the user can read it
 * without the surrounding chrome.
 *
 * Triggered by tapping on a `.pkc-md-block` or `.pkc-md-rendered img`
 * element. The overlay clones the source element into its content
 * area (no live binding — the original DOM stays intact), so layout
 * tricks specific to the viewer (e.g. larger font, removed scroll
 * caps) don't bleed back into the page.
 *
 * Pure DOM helpers — no dispatcher / state coupling. The action
 * binder owns event wiring.
 */

/**
 * Render the media viewer overlay (backdrop + content area + close
 * button). Hidden by default; the action binder unhides it via
 * `openMediaViewer(source)` and rehides via `closeMediaViewer()`.
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

/**
 * Find the overlay rendered by `renderMediaViewer()` if it has been
 * appended to the document.
 */
function findMediaViewer(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-pkc-region="media-viewer-backdrop"]');
}

function findContentArea(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-pkc-region="media-viewer-content"]');
}

/**
 * Show the viewer with a clone of `source` placed in its content
 * area. Existing content is replaced. The clone strips the copy
 * button and expand button (overlay would carry no copy / expand
 * affordance — the viewer IS the expansion).
 */
export function openMediaViewer(source: Element): void {
  const backdrop = findMediaViewer();
  const content = findContentArea();
  if (!backdrop || !content) return;

  const clone = source.cloneNode(true) as Element;
  // Strip overlays that don't belong inside the viewer.
  for (const sel of ['.pkc-md-copy-btn', '[data-pkc-action="expand-md-block"]']) {
    for (const el of clone.querySelectorAll(sel)) el.remove();
  }
  // The cloned `.pkc-md-block` had `overflow-x: auto` because of its
  // table content. Inside the viewer we lift that cap so the table
  // can use the full viewer width.
  if (clone instanceof HTMLElement) {
    clone.classList.add('pkc-media-viewer-clone');
  }

  content.innerHTML = '';
  content.appendChild(clone);
  backdrop.hidden = false;
}

/**
 * Hide the viewer and drop its content. Does NOT refocus any prior
 * element (caller is responsible if they need that).
 */
export function closeMediaViewer(): void {
  const backdrop = findMediaViewer();
  const content = findContentArea();
  if (!backdrop) return;
  backdrop.hidden = true;
  if (content) content.innerHTML = '';
}

/**
 * Returns whether the viewer is currently open (= unhidden).
 */
export function isMediaViewerOpen(): boolean {
  const backdrop = findMediaViewer();
  return !!backdrop && !backdrop.hidden;
}
