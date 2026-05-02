/**
 * Adapter-side bridge between AppState and the runtime DebugReport
 * shape. Kept separate from `src/runtime/debug-flags.ts` so the
 * runtime layer stays free of `AppState` / `Container` dependencies
 * (per CLAUDE.md import rules: runtime owns the data shape, adapter
 * fills it in).
 *
 * Schema 3 additions (PR #211 finalize):
 *   - container.schemaVersion + container.archetypeCounts: shape
 *     fingerprint that helps the developer construct a similar
 *     fixture without exposing user content.
 *   - replay.initialContainer: full container snapshot at the first
 *     SYS_INIT_COMPLETE — content mode only — so (init, recent[]) is
 *     a deterministic replay seed.
 *   - pkc.commit: pulled from the pkc-meta DOM slot via
 *     `readReleaseMeta()` for exact source-tree identification.
 *   - applyTotalSizeCap(): hard 1 MiB cap; truncation order is
 *     replay → recent[] FIFO → errors[] FIFO with counts surfaced.
 */

import type { AppState } from '../state/app-state';
import type { Container } from '../../core/model/container';
import {
  applyTotalSizeCap,
  buildDebugEnvironment,
  isContentModeEnabled,
  readInitialContainer,
  type DebugReport,
} from '../../runtime/debug-flags';
import { readReleaseMeta } from '../../runtime/meta-reader';

/**
 * Pure: turn the current AppState into a DebugReport.
 *
 * Privacy: structural mode drops every field that could leak entry
 * content or asset bytes. Content mode (user opt-in via
 * `?pkc-debug-contents=1`) additionally emits the initial container
 * snapshot under `replay.initialContainer` for deterministic local
 * replay. See `docs/development/debug-privacy-philosophy.md`.
 */
export function buildDebugReportFromState(state: AppState): DebugReport {
  const meta = safeReadMeta();
  const env = buildDebugEnvironment(meta?.source_commit);
  const c = state.container;
  const container =
    c === null
      ? null
      : {
          entryCount: c.entries.length,
          relationCount: c.relations.length,
          assetKeys: Object.keys(c.assets ?? {}).sort(),
          schemaVersion: c.meta?.schema_version ?? 0,
          archetypeCounts: countArchetypes(c),
        };
  const contentMode = isContentModeEnabled();
  const initialContainer = readInitialContainer();
  const report: DebugReport = {
    ...env,
    phase: state.phase,
    view: state.viewMode,
    selectedLid: state.selectedLid,
    editingLid: state.editingLid,
    container,
    ...(contentMode && initialContainer !== null
      ? { replay: { initialContainer } }
      : {}),
  };
  return applyTotalSizeCap(report);
}

function safeReadMeta(): ReturnType<typeof readReleaseMeta> {
  if (typeof document === 'undefined') return null;
  try {
    return readReleaseMeta();
  } catch {
    return null;
  }
}

function countArchetypes(container: Container): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entry of container.entries) {
    const a = entry.archetype;
    counts[a] = (counts[a] ?? 0) + 1;
  }
  return counts;
}
