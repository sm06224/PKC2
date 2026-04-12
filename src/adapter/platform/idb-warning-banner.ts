/**
 * IDB warning banner — non-blocking, dismissible alert surfaced when
 * `probeIDBAvailability()` returns unavailable. Rendered OUTSIDE the
 * state-driven render cycle because it describes the *runtime
 * environment*, not the app's domain state.
 *
 * The banner is intentionally minimal:
 *   - Fixed position at the top of the viewport so it is always visible
 *   - Clear message with a link to the diagnostics doc
 *   - Dismissible (session-only; rebound on reload)
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
