/**
 * Debug-report dump utility.
 *
 * Stage α (PR #209) mounted a floating "🐞 Report" button as a
 * sibling of the renderer root. Stage β follow-up (2026-05-02) moves
 * the trigger into the header next to the ⚙ shell menu so it's
 * indistinguishable from a normal toolbar control. This file now
 * exposes the click-handler logic as a function the action-binder
 * can invoke, plus the fallback modal helpers.
 *
 * Click → build a DebugReport from the current AppState → copy
 * pretty JSON to clipboard → toast confirmation. Clipboard failure
 * (permission denied, http context without secure origin, etc.)
 * falls back to a modal `<pre>` so the user can copy by hand.
 *
 * The fallback modal is a sibling of the renderer's root, NOT inside
 * it: the renderer is a pure state→DOM function and the modal must
 * persist across unrelated re-renders. See `toast.ts` for the same
 * pattern.
 */

import type { Dispatcher } from '../state/dispatcher';
import { showToast } from './toast';
import { dispatchDebugReport } from '../../runtime/debug-flags';
import { buildDebugReportFromState } from './debug-report';

const MODAL_REGION = 'debug-report-fallback';

/**
 * Build the report from current state, attempt clipboard copy, then
 * either toast success or open the fallback modal. `host` should be
 * a stable container outside the renderer root (e.g. `document.body`)
 * so the fallback modal survives re-renders.
 */
export async function runDebugReportDump(
  host: HTMLElement,
  dispatcher: Dispatcher,
): Promise<void> {
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
