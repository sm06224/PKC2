/**
 * IDB warning banner — non-blocking, dismissible alert surfaced when
 * `probeIDBAvailability()` returns unavailable or when a runtime save
 * fails (quota / abort / generic). Rendered OUTSIDE the state-driven
 * render cycle because it describes the *runtime environment*, not the
 * app's domain state.
 *
 * The banner is intentionally minimal:
 *   - Fixed position at the top of the viewport so it is always visible
 *   - Clear message with a short reason string
 *   - Dismissible (session-only; rebound on reload)
 *
 * Two distinct regions, so boot-time and mid-session failures can
 * coexist without clobbering each other's wording:
 *   - `data-pkc-region="idb-warning"`       — boot probe failure
 *   - `data-pkc-region="idb-save-warning"`  — runtime save failure
 *
 * Each region is individually idempotent: calling the corresponding
 * `show*` helper twice returns the existing element (and, for the
 * save-failure variant, updates its reason string so the latest
 * failure is reflected).
 *
 * See docs/development/idb-availability.md for when IDB can silently
 * fail and what the user can do about it (run over http://localhost,
 * disable private-browsing, etc.).
 */

export interface IdbWarningOptions {
  /** Reason string from `probeIDBAvailability()` (optional, shown in detail). */
  reason?: string;
  /** Human-readable headline, default: "IndexedDB is unavailable". */
  title?: string;
  /** Host element. Defaults to document.body. */
  host?: HTMLElement;
}

/**
 * Append a fixed-position warning banner describing that persistence
 * is degraded. Returns the banner element (caller may inspect or
 * detach it). The banner has `role="alert"` and
 * `data-pkc-region="idb-warning"` so tests + styling can target it.
 *
 * Idempotent: if a banner with the same data-region already exists
 * anywhere under `host`, this function is a no-op and returns the
 * existing element.
 */
export function showIdbWarningBanner(opts: IdbWarningOptions = {}): HTMLElement {
  const host = opts.host ?? document.body;
  const existing = host.querySelector<HTMLElement>(
    '[data-pkc-region="idb-warning"]',
  );
  if (existing) return existing;

  const banner = document.createElement('div');
  banner.className = 'pkc-idb-warning';
  banner.setAttribute('role', 'alert');
  banner.setAttribute('data-pkc-region', 'idb-warning');

  const title = document.createElement('strong');
  title.textContent = opts.title ?? 'IndexedDB is unavailable';
  title.className = 'pkc-idb-warning-title';
  banner.appendChild(title);

  const detail = document.createElement('span');
  detail.className = 'pkc-idb-warning-detail';
  const reasonText = opts.reason ? ` (${opts.reason})` : '';
  detail.textContent =
    ` — changes made in this session will NOT persist across reloads${reasonText}.` +
    ` Open PKC2 over http://localhost or disable private-browsing to restore persistence.`;
  banner.appendChild(detail);

  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'pkc-idb-warning-dismiss';
  dismiss.setAttribute('data-pkc-action', 'dismiss-idb-warning');
  dismiss.setAttribute('aria-label', 'Dismiss warning');
  dismiss.textContent = '×';
  dismiss.addEventListener('click', () => {
    banner.remove();
  });
  banner.appendChild(dismiss);

  host.appendChild(banner);
  return banner;
}

export interface IdbSaveFailureOptions {
  /**
   * Short reason string — typically the classified error kind
   * ("QuotaExceededError", "AbortError", "Error: …"). Shown in
   * parentheses after the detail text.
   */
  reason?: string;
  /** Human-readable headline, default: "Save to IndexedDB failed". */
  title?: string;
  /** Host element. Defaults to document.body. */
  host?: HTMLElement;
}

/**
 * Append a fixed-position warning banner describing that the runtime
 * save to IndexedDB failed at least once during this session.
 *
 * Coalescing: the banner lives under
 * `data-pkc-region="idb-save-warning"`. Calling this helper again
 * while the banner is still in the DOM does NOT stack; it updates the
 * reason string on the existing banner so the latest error kind is
 * shown. A user dismiss resets the banner for the session — the next
 * failure creates a fresh one.
 *
 * Distinct from `showIdbWarningBanner()` (which handles boot-time
 * unavailability) so both can coexist if, for example, the boot
 * probe passed but a later save hits a quota ceiling.
 */
export function showIdbSaveFailureBanner(
  opts: IdbSaveFailureOptions = {},
): HTMLElement {
  const host = opts.host ?? document.body;
  const existing = host.querySelector<HTMLElement>(
    '[data-pkc-region="idb-save-warning"]',
  );
  if (existing) {
    // Refresh the reason text so repeated failures reflect the latest
    // classified kind. Keeps coalescing visible + truthful.
    const detail = existing.querySelector<HTMLElement>(
      '.pkc-idb-warning-detail',
    );
    if (detail) {
      detail.textContent = buildSaveFailureDetail(opts.reason);
    }
    return existing;
  }

  const banner = document.createElement('div');
  banner.className = 'pkc-idb-warning pkc-idb-save-warning';
  banner.setAttribute('role', 'alert');
  banner.setAttribute('data-pkc-region', 'idb-save-warning');

  const title = document.createElement('strong');
  title.textContent = opts.title ?? 'Save to IndexedDB failed';
  title.className = 'pkc-idb-warning-title';
  banner.appendChild(title);

  const detail = document.createElement('span');
  detail.className = 'pkc-idb-warning-detail';
  detail.textContent = buildSaveFailureDetail(opts.reason);
  banner.appendChild(detail);

  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'pkc-idb-warning-dismiss';
  dismiss.setAttribute('data-pkc-action', 'dismiss-idb-save-warning');
  dismiss.setAttribute('aria-label', 'Dismiss save failure warning');
  dismiss.textContent = '×';
  dismiss.addEventListener('click', () => {
    banner.remove();
  });
  banner.appendChild(dismiss);

  host.appendChild(banner);
  return banner;
}

function buildSaveFailureDetail(reason?: string): string {
  const reasonText = reason ? ` (${reason})` : '';
  return (
    ` — recent edits may not have been persisted${reasonText}.` +
    ` Export or copy your container to avoid losing changes.`
  );
}

/**
 * Classify an unknown error from the save path into a short,
 * human-readable reason string suitable for the save-failure banner.
 *
 * Kinds:
 *   - QuotaExceededError → "QuotaExceededError: browser storage full"
 *   - AbortError         → "AbortError: transaction aborted"
 *   - Error (generic)    → "Name: message" (truncated)
 *   - non-Error thrown   → String(err) (truncated)
 */
export function classifySaveError(err: unknown): string {
  const MAX = 140;
  const truncate = (s: string): string =>
    s.length > MAX ? s.slice(0, MAX - 1) + '…' : s;

  if (err && typeof err === 'object') {
    const name =
      typeof (err as { name?: unknown }).name === 'string'
        ? ((err as { name?: string }).name as string)
        : '';
    const message =
      typeof (err as { message?: unknown }).message === 'string'
        ? ((err as { message?: string }).message as string)
        : '';
    if (name === 'QuotaExceededError') {
      return truncate('QuotaExceededError: browser storage full');
    }
    if (name === 'AbortError') {
      return truncate(
        message ? `AbortError: ${message}` : 'AbortError: transaction aborted',
      );
    }
    if (name) {
      return truncate(message ? `${name}: ${message}` : name);
    }
    if (message) {
      return truncate(message);
    }
  }
  return truncate(String(err));
}
