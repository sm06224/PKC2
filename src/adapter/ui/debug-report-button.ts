/**
 * Floating "🐞 Report" button (stage α of the debug-via-URL-flag
 * protocol). Visible only when `?pkc-debug=<list>` (or the
 * `pkc2.debug` localStorage key) selects at least one feature.
 *
 * Click → build a DebugReport from the current AppState → copy
 * pretty JSON to clipboard → toast confirmation. Clipboard failure
 * (permission denied, http context without secure origin, etc.)
 * falls back to a modal `<pre>` so the user can copy by hand.
 *
 * Mounted as a sibling of the renderer's root, NOT inside it: the
 * renderer is a pure state→DOM function and the button must persist
 * across unrelated re-renders. See `toast.ts` for the same pattern.
 */

import type { Dispatcher } from '../state/dispatcher';
import { showToast } from './toast';
import {
  debugFeatures,
  dispatchDebugReport,
} from '../../runtime/debug-flags';
import { buildDebugReportFromState } from './debug-report';

const BUTTON_REGION = 'debug-report-button';
const MODAL_REGION = 'debug-report-fallback';

/**
 * Mount the floating Report button. No-op when no debug feature is
 * active. Returns an unmount fn for tests / hot-reload teardown.
 */
export function mountDebugReportButton(
  host: HTMLElement,
  dispatcher: Dispatcher,
): () => void {
  if (debugFeatures().size === 0) return () => undefined;

  // Idempotent: if already mounted (e.g. accidental double-call),
  // reuse the existing element so we never end up with two buttons.
  const existing = host.querySelector<HTMLButtonElement>(
    `[data-pkc-region="${BUTTON_REGION}"]`,
  );
  if (existing) return () => existing.remove();

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pkc-debug-report-button';
  btn.setAttribute('data-pkc-region', BUTTON_REGION);
  btn.setAttribute('data-pkc-debug', 'true');
  btn.setAttribute('aria-label', 'Copy debug report to clipboard');
  btn.title = 'Copy debug report (PKC2 debug)';
  btn.textContent = '🐞 Report';

  const onClick = async () => {
    const report = buildDebugReportFromState(dispatcher.getState());
    const ok = await dispatchDebugReport(report);
    if (ok) {
      showToast({
        message: 'Debug report copied to clipboard',
        kind: 'info',
        autoDismissMs: 4000,
      });
    } else {
      showFallbackModal(host, report);
    }
  };
  btn.addEventListener('click', onClick);

  host.appendChild(btn);
  return () => {
    btn.removeEventListener('click', onClick);
    btn.remove();
    closeFallbackModal(host);
  };
}

function showFallbackModal(host: HTMLElement, report: unknown): void {
  closeFallbackModal(host);
  const modal = document.createElement('div');
  modal.className = 'pkc-debug-report-fallback';
  modal.setAttribute('data-pkc-region', MODAL_REGION);
  modal.setAttribute('data-pkc-debug', 'true');
  modal.setAttribute('role', 'dialog');

  const dialog = document.createElement('div');
  dialog.className = 'pkc-debug-report-fallback-dialog';

  const heading = document.createElement('p');
  heading.className = 'pkc-debug-report-fallback-heading';
  heading.textContent =
    'Clipboard write was blocked. Select all and copy manually:';
  dialog.appendChild(heading);

  const pre = document.createElement('pre');
  pre.className = 'pkc-debug-report-fallback-text';
  pre.setAttribute('data-pkc-field', 'debug-report-json');
  pre.textContent = JSON.stringify(report, null, 2);
  dialog.appendChild(pre);

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'pkc-debug-report-fallback-close';
  close.setAttribute('data-pkc-action', 'dismiss-debug-report-fallback');
  close.textContent = 'Close';
  close.addEventListener('click', () => closeFallbackModal(host));
  dialog.appendChild(close);

  modal.appendChild(dialog);
  host.appendChild(modal);
}

function closeFallbackModal(host: HTMLElement): void {
  const existing = host.querySelector<HTMLElement>(
    `[data-pkc-region="${MODAL_REGION}"]`,
  );
  if (existing) existing.remove();
}
