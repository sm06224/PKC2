/**
 * Post-render location navigation — S-18 / A-4 FULL (2026-04-14).
 *
 * `AppState.pendingNav` carries a sub-id + monotonic ticket set by
 * `NAVIGATE_TO_LOCATION`. main.ts invokes `consumePendingNav` in its
 * onState handler after each render — the helper resolves the sub-id
 * to a DOM element, scrolls it into view, and adds the temporary
 * highlight class for ~1.6s.
 *
 * Ticket comparison: the helper keeps a last-seen ticket across
 * calls. Only advancing tickets trigger a scroll, so the same
 * state value observed by unrelated re-renders is idempotent.
 *
 * adapter/ui — DOM access is allowed here (unlike features/).
 */

/** Accepted shapes of the `subId` field in `AppState.pendingNav`. */
export type LocationSubId =
  | `heading:${string}`
  | `log:${string}`
  | `entry:${string}`;

export interface PendingNav {
  subId: string;
  ticket: number;
}

/** Duration of the temporary highlight class (ms). */
export const LOCATION_HIGHLIGHT_DURATION_MS = 1600;

/**
 * Resolve the sub-id to a DOM target inside `root`. Returns null
 * when the id scheme is unknown OR when the element is not currently
 * mounted. The sub-id schemes track the renderer's emitted anchors:
 *
 *   - `heading:<slug>` → `[id="<slug>"]` (markdown-render's
 *     `heading_open` rule adds the id)
 *   - `log:<logId>`   → `[data-pkc-log-id="<logId>"]` (TEXTLOG log
 *     entries carry this attribute)
 *   - `entry:<lid>`   → `[data-pkc-lid="<lid>"][data-pkc-mode="view"]`
 *     (fallback — scroll to the entry's view container when no
 *     heading / log context is available)
 */
export function findLocationTarget(
  root: HTMLElement,
  subId: string,
): HTMLElement | null {
  const colon = subId.indexOf(':');
  if (colon < 0) return null;
  const kind = subId.slice(0, colon);
  const value = subId.slice(colon + 1);
  if (value === '') return null;
  // CSS.escape is widely supported in modern browsers / happy-dom;
  // fall back to a minimal escaper if absent.
  const esc = (typeof CSS !== 'undefined' && CSS.escape)
    ? CSS.escape.bind(CSS)
    : (s: string) => s.replace(/(["\\])/g, '\\$1');
  if (kind === 'heading') {
    return root.querySelector<HTMLElement>(`[id="${esc(value)}"]`);
  }
  if (kind === 'log') {
    return root.querySelector<HTMLElement>(`[data-pkc-log-id="${esc(value)}"]`);
  }
  if (kind === 'entry') {
    return root.querySelector<HTMLElement>(
      `[data-pkc-lid="${esc(value)}"][data-pkc-mode="view"]`,
    );
  }
  return null;
}

/**
 * Apply the "scroll into view + flash highlight" effect to `target`.
 * Pure DOM side-effects — no state mutation, no dispatch.
 */
export function highlightLocationTarget(
  target: HTMLElement,
  durationMs = LOCATION_HIGHLIGHT_DURATION_MS,
): void {
  try {
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch {
    /* happy-dom may not implement scrollIntoView with options */
    try {
      target.scrollIntoView();
    } catch {
      /* give up silently */
    }
  }
  target.classList.add('pkc-location-highlight');
  // Use a long-lived timeout; main.ts's onState is called many times
  // per session but we only ever fire on ticket advances so this
  // helper won't stack competing removals.
  setTimeout(() => {
    target.classList.remove('pkc-location-highlight');
  }, durationMs);
}

/**
 * Encapsulated ticket tracker. Create one per bindActions session
 * (or per onState subscription) so stale state snapshots don't
 * re-fire the effect.
 */
export interface LocationNavTracker {
  /**
   * Feed the latest state snapshot's pendingNav after render. Returns
   * `true` when the effect was run (ticket advanced and target found),
   * `false` otherwise.
   */
  consume(root: HTMLElement, pending: PendingNav | null | undefined): boolean;
}

export function createLocationNavTracker(): LocationNavTracker {
  let lastTicket = -1;
  return {
    consume(root, pending) {
      if (!pending) return false;
      if (pending.ticket === lastTicket) return false;
      lastTicket = pending.ticket;
      const target = findLocationTarget(root, pending.subId);
      if (!target) return false;
      highlightLocationTarget(target);
      return true;
    },
  };
}
