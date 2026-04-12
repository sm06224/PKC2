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
  /**
   * If provided, render an inline "Export Now" action link inside
   * the toast so the user has a one-click escape route (typical
   * cause: "attachment rejected — too big to embed in the single
   * HTML; export now to back up your current state before retrying
   * with a smaller file").  The callback is invoked directly on
   * click — we cannot rely on `bindActions()` delegation because
   * the toast stack is hosted outside `#pkc-root`.  The button
   * still carries `data-pkc-action="begin-export"` for parity with
   * the in-app export buttons and for test targeting.
   */
  onExport?: () => void;
  /** Label for the export action. Default: "Export Now". */
  exportLabel?: string;
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
      // Belt-and-braces: if the first call omitted `onExport` but a
      // repeat provides one, upgrade the toast by inserting the
      // action button before the existing dismiss × so the newer
      // context (e.g. the user dropped a SECOND oversized file and
      // now really needs a way out) is honoured.
      if (
        opts.onExport &&
        !t.querySelector('[data-pkc-action="begin-export"]')
      ) {
        const dismissEl = t.querySelector<HTMLElement>(
          '[data-pkc-action="dismiss-toast"]',
        );
        const action = buildExportAction(opts.onExport, opts.exportLabel);
        if (dismissEl) t.insertBefore(action, dismissEl);
        else t.appendChild(action);
      }
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

  if (opts.onExport) {
    toast.appendChild(buildExportAction(opts.onExport, opts.exportLabel));
  }

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

/**
 * Build the "Export Now" inline action button that surfaces the
 * existing BEGIN_EXPORT flow from inside a toast.  The onclick
 * handler invokes the callback directly (the toast stack lives
 * outside `#pkc-root`, so the global action-binder delegation
 * cannot see this element); the `data-pkc-action` / `data-pkc-
 * export-*` attributes are kept for test targeting and for parity
 * with the in-app export buttons.
 */
function buildExportAction(
  onExport: () => void,
  label?: string,
): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pkc-toast-action';
  btn.setAttribute('data-pkc-action', 'begin-export');
  btn.setAttribute('data-pkc-export-mode', 'full');
  btn.setAttribute('data-pkc-export-mutability', 'editable');
  btn.textContent = label ?? 'Export Now';
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    onExport();
  });
  return btn;
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
