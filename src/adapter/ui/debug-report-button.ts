/**
 * Debug-report dump utility — opens the JSON in a new browser tab.
 *
 * 🐞 button (rendered in the header next to ⚙ when a `?pkc-debug=*`
 * flag is active) wires through action-binder to `runDebugReportDump`.
 * It builds the report from current state, hands it to
 * `dispatchDebugReport` which `URL.createObjectURL`s a Blob and calls
 * `window.open(url, '_blank', 'noopener')`. The user reviews the JSON
 * in the new tab and saves with Ctrl+S / ⌘+S if they want to keep it.
 *
 * Pop-up blocked: emit a toast (UI-component layer, not an overlay
 * over the main canvas). The user enables pop-ups and retries.
 * No fallback modal — PKC2 forbids backdrop-style modals over the
 * main window.
 */

import type { Dispatcher } from '../state/dispatcher';
import { dispatchDebugReport } from '../../runtime/debug-flags';
import { buildDebugReportFromState } from './debug-report';
import { showToast } from './toast';

export function runDebugReportDump(dispatcher: Dispatcher): void {
  const report = buildDebugReportFromState(dispatcher.getState());
  if (dispatchDebugReport(report)) return;
  showToast({
    message:
      'Pop-up blocked — allow pop-ups for this page to view the debug report.',
    kind: 'warn',
    autoDismissMs: 6000,
  });
}
