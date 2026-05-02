/**
 * Debug-report dump utility — downloads the JSON as a file.
 *
 * 🐞 button (rendered in the header next to ⚙ when a `?pkc-debug=*`
 * flag is active) wires through action-binder to `runDebugReportDump`.
 * It builds the report from current state, hands it to
 * `dispatchDebugReport` which `URL.createObjectURL`s a Blob and
 * synthesizes a click on a hidden `<a download="pkc2-debug-...json">`.
 * The browser's download manager picks up the file and writes it to
 * Downloads with a clean human-readable name.
 *
 * Why download (not new-tab Blob URL): the previous version opened
 * the JSON in a new tab and asked the user to Ctrl+S. Firefox in
 * particular doesn't let users save Blob URLs reliably (the filename
 * defaults to the UUID, the prompt's location varies). Download
 * works the same on every engine and gives the file a sortable name.
 *
 * Failure surfaces as a toast (UI-component layer, not an overlay
 * over the main canvas). PKC2 forbids backdrop-style modals over
 * the main window — toasts are the dedicated affordance for short
 * status messages.
 */

import type { Dispatcher } from '../state/dispatcher';
import { dispatchDebugReport } from '../../runtime/debug-flags';
import { buildDebugReportFromState } from './debug-report';
import { showToast } from './toast';

export function runDebugReportDump(dispatcher: Dispatcher): void {
  const report = buildDebugReportFromState(dispatcher.getState());
  if (dispatchDebugReport(report)) return;
  showToast({
    message: 'Failed to generate debug report (the container may be too large).',
    kind: 'warn',
    autoDismissMs: 6000,
  });
}
