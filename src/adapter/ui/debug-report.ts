/**
 * Adapter-side bridge between AppState and the runtime DebugReport
 * shape. Kept separate from `src/runtime/debug-flags.ts` so the
 * runtime layer stays free of `AppState` dependencies (per CLAUDE.md
 * import rules: runtime owns the data shape, adapter fills it in).
 */

import type { AppState } from '../state/app-state';
import {
  buildDebugEnvironment,
  type DebugReport,
} from '../../runtime/debug-flags';

/**
 * Pure: turn the current AppState into a DebugReport.
 *
 * Privacy: this function intentionally drops every field that could
 * leak entry content or asset bytes. Only counts and asset KEYS are
 * included so the user can paste the result into an issue without
 * sanitising. Schema reviewers — keep that invariant.
 */
export function buildDebugReportFromState(state: AppState): DebugReport {
  const env = buildDebugEnvironment();
  const c = state.container;
  const container =
    c === null
      ? null
      : {
          entryCount: c.entries.length,
          relationCount: c.relations.length,
          assetKeys: Object.keys(c.assets ?? {}).sort(),
        };
  return {
    ...env,
    phase: state.phase,
    view: state.viewMode,
    selectedLid: state.selectedLid,
    editingLid: state.editingLid,
    container,
  };
}
