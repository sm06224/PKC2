/**
 * Debug-report dump utility.
 *
 * Stage α (PR #209) used a clipboard-write pipeline; stage β
 * follow-up (2026-05-02) replaced that with "open the JSON in a new
 * tab" — Blob URL via `dispatchDebugReport`. The user reviews the
 * report directly and saves with Ctrl+S / ⌘+S if they want to keep
 * it. This sidesteps clipboard permission prompts, dodges the
 * paste-into-chat formatting mess, and keeps the data fully visible
 * before the user shares anything (privacy by default, philosophy
 * doc §4 原則 2).
 *
 * If `window.open` is blocked by a pop-up blocker, the inline
 * fallback modal (`<pre>` of pretty JSON) takes over so the user can
 * still recover the report by selecting + copying manually.
 */

import type { Dispatcher } from '../state/dispatcher';
import { dispatchDebugReport } from '../../runtime/debug-flags';
import { buildDebugReportFromState } from './debug-report';

const MODAL_REGION = 'debug-report-fallback';

/**
 * Build the report from current state and open it in a new tab.
 * `host` should be a stable container outside the renderer root
 * (e.g. `document.body`) so the popup-blocker fallback modal
 * survives re-renders.
 */
export function runDebugReportDump(
  host: HTMLElement,
  dispatcher: Dispatcher,
): void {
  const report = buildDebugReportFromState(dispatcher.getState());
  const opened = dispatchDebugReport(report);
  if (!opened) showFallbackModal(host, report);
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
    'Pop-up blocked. Select all and copy / save manually:';
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
