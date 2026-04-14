/**
 * Entry-window live refresh wiring.
 *
 * Subscribes to dispatcher state changes and, whenever the container's
 * `assets` OR `entries` object identity changes, pushes a freshly-built
 * preview resolver context into every currently-open entry-window child
 * for a text / textlog entry.
 *
 * This is the adapter-side glue that connects the A sub-item of
 * "Entry-window live refresh wiring + state/resource hardening" —
 * attachment add / remove / metadata-edit in the main window → Preview
 * tab resolver update in any open entry-window child.
 *
 * Scope & invariants (must stay true):
 *   - Only the child's edit-mode Preview resolver is refreshed. The
 *     view-pane HTML and the Source textarea are never touched.
 *   - Only `text` / `textlog` archetypes receive a push — for
 *     attachment / todo / form entries `buildEntryPreviewCtx` returns
 *     `undefined` and this wiring becomes a no-op for them.
 *   - Identity comparison (`prev.assets !== next.assets` OR
 *     `prev.entries !== next.entries`) is sufficient because the
 *     reducer always replaces those arrays/objects when they mutate.
 *     No deep diff is needed. The `entries` gate was added in P1-2
 *     (2026-04-13) so attachment METADATA edits (mime/name) also
 *     propagate into the child's preview resolver, not just
 *     body-side asset merges.
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
    if (!nextContainer) return;
    const prevAssets = prev.container?.assets;
    const nextAssets = nextContainer.assets;
    const prevEntries = prev.container?.entries;
    const nextEntries = nextContainer.entries;
    // Trigger on either assets OR entries identity change. Both are
    // legitimate drivers of the Preview resolver context:
    //   - assets: the raw data the resolver maps keys to.
    //   - entries: the attachment metadata (mime, display name) that
    //     `buildEntryPreviewCtx` derives from attachment entries.
    if (prevAssets === nextAssets && prevEntries === nextEntries) return;

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
