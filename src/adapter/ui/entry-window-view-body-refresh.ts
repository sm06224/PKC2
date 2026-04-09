/**
 * Entry-window text / textlog view-body rerender wiring.
 *
 * Subscribes to dispatcher state changes and, whenever the
 * container's `assets` object identity changes, pushes a freshly
 * resolved view-pane body HTML fragment into every currently-open
 * entry-window child for a text / textlog entry whose saved body
 * contains at least one `asset:` reference.
 *
 * Companion to `wireEntryWindowLiveRefresh` (Preview wiring). Both
 * modules share the same trigger condition
 * (`prev.assets !== next.assets`) but operate on disjoint parts of
 * the child window:
 *   - Preview wiring refreshes the edit-mode resolver context via
 *     `pushPreviewContextUpdate` — affects only the Preview tab.
 *   - View wiring (this module) refreshes the view-pane HTML via
 *     `pushViewBodyUpdate` — affects only `#body-view`.
 *
 * They live side-by-side on the same dispatcher and never
 * interfere: each one calls its own dedicated push helper and
 * sends its own dedicated postMessage type. See
 * `docs/development/edit-preview-asset-resolution.md`, section
 * "Text/textlog view rerender wiring", for the full
 * foundation → policy → wiring stack.
 *
 * Dirty-state policy: this wiring always calls
 * `pushViewBodyUpdate` when an asset change affects an open
 * text / textlog child with references. The CHILD decides whether
 * to apply the incoming HTML immediately (clean entry) or stash
 * it in `pendingViewBody` for a later flush (dirty entry). The
 * wiring itself is intentionally dirty-agnostic — it does not
 * inspect the child's edit state and does not short-circuit on
 * dirtiness.
 *
 * Archetype filter: only text / textlog entries receive a push.
 * Attachment, todo, form, folder children never receive a
 * view-body update here — those archetypes do not participate in
 * markdown asset resolution. `buildEntryPreviewCtx` already
 * returns `undefined` for non-text/textlog entries as a second
 * line of defense.
 *
 * No-op conditions (wiring deliberately skips the push):
 *   - No container yet (boot-time state).
 *   - `prev.assets === next.assets` (no identity change).
 *   - Zero currently-open entry-window children.
 *   - The open lid does not match any entry in the new container
 *     (stale / deleted lid).
 *   - The entry's archetype is not text / textlog.
 *   - The entry's body is empty or contains no `asset:` references
 *     — the rendered HTML would be identical to what the child
 *     already shows, so the push would be wasted work.
 *
 * Scope & invariants (must stay true):
 *   - Never bypasses `pushViewBodyUpdate`. All child DOM writes
 *     route through the foundation helper so its postMessage
 *     contract, `renderMarkdown` settings, and `(empty)` fallback
 *     remain the single source of truth.
 *   - Never touches the Preview wiring. This module only calls
 *     `pushViewBodyUpdate`; the Preview wiring only calls
 *     `pushPreviewContextUpdate`. The two remain orthogonal.
 *   - Never performs a deep asset diff. Identity comparison
 *     mirrors the Preview wiring and is sufficient because the
 *     reducer always replaces the `assets` object when it
 *     mutates.
 */

import type { Dispatcher } from '../state/dispatcher';
import { buildEntryPreviewCtx } from './action-binder';
import {
  hasAssetReferences,
  resolveAssetReferences,
} from '../../features/markdown/asset-resolver';
import {
  getOpenEntryWindowLids,
  pushViewBodyUpdate,
} from './entry-window';

/**
 * Wire the text / textlog view-body refresh subscription onto the
 * given dispatcher.
 *
 * Returns the unsubscribe function from `dispatcher.onState` so
 * callers can tear down the subscription (primarily for tests —
 * the production `main.ts` call site does not bother to
 * unsubscribe).
 */
export function wireEntryWindowViewBodyRefresh(dispatcher: Dispatcher): () => void {
  return dispatcher.onState((state, prev) => {
    const nextContainer = state.container;
    const prevAssets = prev.container?.assets;
    const nextAssets = nextContainer?.assets;
    if (!nextContainer) return;
    // Identity comparison is sufficient: the reducer always
    // replaces the `assets` object when it mutates, matching the
    // Preview wiring's gate exactly.
    if (prevAssets === nextAssets) return;

    const openLids = getOpenEntryWindowLids();
    if (openLids.length === 0) return;

    for (const lid of openLids) {
      const entry = nextContainer.entries.find((e) => e.lid === lid);
      if (!entry) continue;
      // Skip bodies that cannot possibly change based on assets.
      // This is purely an optimization gate — the child would
      // produce the same HTML either way. Skipping it avoids a
      // wasted postMessage round-trip and keeps the dirty-state
      // notice from flashing when nothing visible would change.
      if (!entry.body || !hasAssetReferences(entry.body)) continue;
      // Archetype filter: `buildEntryPreviewCtx` returns undefined
      // for anything other than text / textlog, so this is both
      // the resolver-context builder AND the archetype gate.
      const previewCtx = buildEntryPreviewCtx(entry, nextContainer);
      if (!previewCtx) continue;
      const resolvedBody = resolveAssetReferences(entry.body, previewCtx);
      pushViewBodyUpdate(lid, resolvedBody);
    }
  });
}
