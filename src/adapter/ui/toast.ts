/**
 * Lightweight warning / info toast helper.
 *
 * Rendered OUTSIDE the state-driven render cycle, same architectural
 * category as `idb-warning-banner.ts`: a fixed-position affordance
 * describing a *runtime event* (attachment rejected, FileReader
 * failed, clipboard decode failed) that the reducer does not model.
 *
 * Design goals:
 *   - Non-blocking, no `alert()` / `confirm()` / `prompt()`
 *   - Dismissible (click × or the toast body)
 *   - Coalescing: identical messages already visible do NOT stack —
 *     the existing toast's timer is reset so the user has a fresh
 *     chance to read or dismiss it
 *   - Optional auto-dismiss (default 7 s) so warnings for transient
 *     events (a drop reject) do not clutter the screen forever
 *   - Light/dark aware via existing `--c-warn` / `--c-warn-fg`
 *     design tokens (see `base.css`)
 *
 * Container: a single `[data-pkc-region="toast-stack"]` is created
 * on first use and reused on subsequent calls. Individual toasts are
 * `[data-pkc-region="toast"]` with `role="status"` for non-blocking
 * assistive-tech announcement.
 */

export type ToastKind = 'warn' | 'error' | 'info';

export interface ToastOptions {
  /** Body text. */
  message: string;
  /** Visual kind. Default: 'warn'. */
  kind?: ToastKind;
  /**
   * Auto-dismiss after this many milliseconds. Pass `0` (or a
   * negative number) to disable auto-dismiss. Default: 7000.
   */
  autoDismissMs?: number;
  /** Host element. Default: `document.body`. */
  host?: HTMLElement;
}

const DEFAULT_AUTO_DISMISS_MS = 7000;
const STACK_REGION = 'toast-stack';
const TOAST_REGION = 'toast';

function ensureStack(host: HTMLElement): HTMLElement {
  const existing = host.querySelector<HTMLElement>(
    `[data-pkc-region="${STACK_REGION}"]`,
  );
  if (existing) return existing;
  const stack = document.createElement('div');
  stack.className = 'pkc-toast-stack';
  stack.setAttribute('data-pkc-region', STACK_REGION);
  host.appendChild(stack);
  return stack;
}

/**
 * Show a toast. Returns the toast element so tests can inspect it.
 *
 * Coalescing: if a toast with the exact same message text is already
 * visible, this call does NOT create a second one — instead it
 * resets the existing toast's auto-dismiss timer and, if the kind
 * differs, upgrades the visual kind to the more-severe of the two
 * (`error` > `warn` > `info`). The existing element is returned.
 */
export function showToast(opts: ToastOptions): HTMLElement {
  const host = opts.host ?? document.body;
  const stack = ensureStack(host);
  const kind: ToastKind = opts.kind ?? 'warn';
  const autoDismissMs =
    opts.autoDismissMs === undefined
      ? DEFAULT_AUTO_DISMISS_MS
      : opts.autoDismissMs;

  // Coalesce on message equality — the typical re-trigger is "user
  // dropped another oversized file", which should not stack.
  const existingToasts = stack.querySelectorAll<HTMLElement>(
    `[data-pkc-region="${TOAST_REGION}"]`,
  );
  for (const t of existingToasts) {
    if (t.dataset.pkcToastMessage === opts.message) {
      // Upgrade severity if the new kind is more severe.
      const prev = (t.dataset.pkcToastKind ?? 'warn') as ToastKind;
      const next = severerKind(prev, kind);
      if (next !== prev) applyKindClass(t, next);
      t.dataset.pkcToastKind = next;
      // Reset timer.
      resetTimer(t, autoDismissMs);
      return t;
    }
  }

  const toast = document.createElement('div');
  toast.className = 'pkc-toast';
  toast.setAttribute('data-pkc-region', TOAST_REGION);
  toast.setAttribute('role', 'status');
  toast.dataset.pkcToastMessage = opts.message;
  toast.dataset.pkcToastKind = kind;
  applyKindClass(toast, kind);

  const body = document.createElement('span');
  body.className = 'pkc-toast-body';
  body.textContent = opts.message;
  toast.appendChild(body);

  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'pkc-toast-dismiss';
  dismiss.setAttribute('data-pkc-action', 'dismiss-toast');
  dismiss.setAttribute('aria-label', 'Dismiss');
  dismiss.textContent = '×';
  dismiss.addEventListener('click', (e) => {
    // Stop the click from bubbling to the stack (avoids double-
    // dismiss in case a parent handler ever opts in).
    e.stopPropagation();
    toast.remove();
  });
  toast.appendChild(dismiss);

  stack.appendChild(toast);
  resetTimer(toast, autoDismissMs);
  return toast;
}

function applyKindClass(el: HTMLElement, kind: ToastKind): void {
  el.classList.remove('pkc-toast-warn', 'pkc-toast-error', 'pkc-toast-info');
  el.classList.add(`pkc-toast-${kind}`);
}

function severerKind(a: ToastKind, b: ToastKind): ToastKind {
  const rank: Record<ToastKind, number> = { info: 0, warn: 1, error: 2 };
  return rank[b] > rank[a] ? b : a;
}

function resetTimer(toast: HTMLElement, autoDismissMs: number): void {
  const prev = (toast as HTMLElement & { __pkcToastTimer?: number })
    .__pkcToastTimer;
  if (prev !== undefined) {
    clearTimeout(prev);
  }
  if (autoDismissMs > 0) {
    const timer = setTimeout(() => {
      toast.remove();
    }, autoDismissMs) as unknown as number;
    (toast as HTMLElement & { __pkcToastTimer?: number }).__pkcToastTimer =
      timer;
  } else {
    (toast as HTMLElement & { __pkcToastTimer?: number }).__pkcToastTimer =
      undefined;
  }
}
