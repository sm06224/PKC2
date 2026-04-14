/**
 * Entry-window text / textlog view-body rerender wiring.
 *
 * Subscribes to dispatcher state changes and, whenever an input that
 * affects the host's rendered body HTML changes, pushes a freshly
 * resolved view-pane body HTML fragment into every currently-open
 * entry-window child for a text / textlog entry.
 *
 * Trigger inputs that drive a push (P1-2, 2026-04-13):
 *   1. `prev.container.assets !== next.container.assets`
 *      — existing asset-identity path. When the host body contains at
 *        least one `asset:` reference, the rendered HTML changes and
 *        the child must receive an update.
 *   2. The host entry object itself changed
 *      (`prev.container.entries.find(lid) !== next.container.entries.find(lid)`)
 *      — the user or another pipeline edited the host directly. Always
 *        push, regardless of whether the body contains references,
 *        because the body text itself may have changed.
 *   3. `prev.container.entries !== next.container.entries` AND the host
 *      body contains at least one `entry:` reference
 *      — a referenced entry changed (e.g. a TODO status toggle while
 *        the host is embed'ed in a text document). The transclusion
 *        result depends on the target entry.
 *
 * Companion to `wireEntryWindowLiveRefresh` (Preview wiring). Both
 * modules share the same outer gate (assets OR entries identity change)
 * but operate on disjoint parts of the child window:
 *   - Preview wiring refreshes the edit-mode resolver context via
 *     `pushPreviewContextUpdate` — affects only the Preview tab.
 *   - View wiring (this module) refreshes the view-pane HTML via
 *     `pushViewBodyUpdate` — affects only `#body-view`.
 *
 * Dirty-state policy: this wiring always calls `pushViewBodyUpdate`
 * when a trigger fires and the per-entry gate admits the push. The
 * CHILD decides whether to apply the incoming HTML immediately
 * (clean entry) or stash it in `pendingViewBody` for a later flush
 * (dirty entry). The wiring itself is intentionally dirty-agnostic.
 *
 * Archetype filter: only text / textlog entries receive a push.
 * `buildEntryPreviewCtx` returns `undefined` for anything else, which
 * is the archetype gate's last line of defense.
 *
 * No-op conditions (wiring deliberately skips the push):
 *   - No container yet (boot-time state).
 *   - Both `prev.assets === next.assets` AND
 *     `prev.entries === next.entries` (no relevant identity change).
 *   - Zero currently-open entry-window children.
 *   - The open lid does not match any entry in the new container.
 *   - The entry's archetype is not text / textlog.
 *   - Host entry object identity unchanged AND the body contains no
 *     refs that would be affected by the asset/entry change that fired.
 *
 * Scope & invariants (must stay true):
 *   - Never bypasses `pushViewBodyUpdate`. All child DOM writes
 *     route through the foundation helper so its postMessage
 *     contract, `renderMarkdown` settings, and `(empty)` fallback
 *     remain the single source of truth.
 *   - Never touches the Preview wiring.
 *   - Never performs a deep asset or entry-graph diff. Identity
 *     comparison suffices because the reducer always replaces the
 *     parent arrays/objects when they mutate.
 */

import type { Dispatcher } from '../state/dispatcher';
import { buildEntryPreviewCtx } from './action-binder';
import {
  hasAssetReferences,
  resolveAssetReferences,
} from '../../features/markdown/asset-resolver';
import { extractEntryReferences } from '../../features/entry-ref/extract-entry-refs';
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
    if (!nextContainer) return;
    const prevAssets = prev.container?.assets;
    const nextAssets = nextContainer.assets;
    const prevEntries = prev.container?.entries;
    const nextEntries = nextContainer.entries;
    const assetsChanged = prevAssets !== nextAssets;
    const entriesChanged = prevEntries !== nextEntries;
    // Outer gate: at least one of the relevant identities must have
    // changed for there to be any possibility that a re-render is
    // needed.
    if (!assetsChanged && !entriesChanged) return;

    const openLids = getOpenEntryWindowLids();
    if (openLids.length === 0) return;

    for (const lid of openLids) {
      const entry = nextContainer.entries.find((e) => e.lid === lid);
      if (!entry) continue;
      if (!entry.body) continue;

      // The host entry's own object identity — if it changed, the
      // host's body/title/flags were edited directly and we must
      // always push a fresh render, regardless of refs.
      const prevHost = prev.container?.entries.find((e) => e.lid === lid);
      const hostChanged = prevHost !== entry;

      // Cheap ref-presence gates. We use them to skip pushes that
      // cannot possibly change the rendered output.
      const hasAssetRef = hasAssetReferences(entry.body);
      const hasEntryRef = extractEntryReferences(entry.body).size > 0;

      const shouldPush =
        hostChanged ||
        (assetsChanged && hasAssetRef) ||
        (entriesChanged && hasEntryRef);
      if (!shouldPush) continue;

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
