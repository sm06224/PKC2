/**
 * Entry-window live refresh wiring.
 *
 * Subscribes to dispatcher state changes and, whenever the container's
 * `assets` object identity changes, pushes a freshly-built preview
 * resolver context into every currently-open entry-window child for a
 * text / textlog entry.
 *
 * This is the adapter-side glue that connects the A sub-item of
 * "Entry-window live refresh wiring + state/resource hardening" —
 * attachment add / remove in the main window → Preview tab resolver
 * update in any open entry-window child.
 *
 * Scope & invariants (must stay true):
 *   - Only the child's edit-mode Preview resolver is refreshed. The
 *     view-pane HTML and the Source textarea are never touched.
 *   - Only `text` / `textlog` archetypes receive a push — for
 *     attachment / todo / form entries `buildEntryPreviewCtx` returns
 *     `undefined` and this wiring becomes a no-op for them.
 *   - Identity comparison (`prev.assets !== next.assets`) is
 *     sufficient because the reducer always replaces the `assets`
 *     object when it mutates (COMMIT_EDIT's asset merge path,
 *     ENTRY_DELETED's asset_key removal). No deep diff is needed.
 *   - This is NOT a generic cross-window sync bus — it listens to
 *     state changes only and writes directly to the private
 *     entry-window postMessage protocol via `pushPreviewContextUpdate`.
 *     New cross-window flows should add their own dedicated wiring.
 *
 * See `docs/development/edit-preview-asset-resolution.md`, section
 * "Live refresh wiring", for the full rationale and the four-point
 * responsibility split.
 */

import type { Dispatcher } from '../state/dispatcher';
import { buildEntryPreviewCtx } from './action-binder';
import {
  getOpenEntryWindowLids,
  pushPreviewContextUpdate,
} from './entry-window';

/**
 * Wire the live refresh subscription onto the given dispatcher.
 * Returns the unsubscribe function from `dispatcher.onState` so
 * callers can tear down the subscription (primarily for tests — the
 * production main.ts call site does not bother to unsubscribe).
 */
export function wireEntryWindowLiveRefresh(dispatcher: Dispatcher): () => void {
  return dispatcher.onState((state, prev) => {
    const nextContainer = state.container;
    const prevAssets = prev.container?.assets;
    const nextAssets = nextContainer?.assets;
    if (!nextContainer) return;
    if (prevAssets === nextAssets) return;

    const openLids = getOpenEntryWindowLids();
    if (openLids.length === 0) return;

    for (const lid of openLids) {
      const entry = nextContainer.entries.find((e) => e.lid === lid);
      if (!entry) continue;
      const previewCtx = buildEntryPreviewCtx(entry, nextContainer);
      if (!previewCtx) continue;
      pushPreviewContextUpdate(lid, previewCtx);
    }
  });
}
