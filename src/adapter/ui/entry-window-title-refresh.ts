/**
 * Entry-window title live refresh wiring.
 *
 * Subscribes to dispatcher state changes and, whenever an open
 * entry-window child's host entry has its `title` field changed,
 * pushes the new title into the child via `pushTitleUpdate`.
 *
 * This is the third of three live-refresh wires on the entry-window
 * postMessage protocol:
 *
 *   - `wireEntryWindowLiveRefresh` → preview resolver ctx (edit-mode
 *     Preview tab). Fires on `assets` OR `entries` identity change.
 *   - `wireEntryWindowViewBodyRefresh` → view-pane body HTML
 *     (`#body-view`). Fires on `assets` OR `entries` identity change
 *     with archetype + body-ref gating.
 *   - `wireEntryWindowTitleRefresh` (this module) → title surfaces
 *     (`document.title`, `#title-display`, `originalTitle`). Fires
 *     only on `entries` identity change AND only when the specific
 *     host entry's `title` actually differs from the previous value.
 *
 * Archetype filter: none. Rename is meaningful for every archetype
 * (text, textlog, todo, form, attachment, folder, generic, opaque),
 * and the message handler only touches title DOM — no markdown or
 * asset resolution is involved, so the payload cost is a short
 * string regardless of body size.
 *
 * Dirty-state policy: handled entirely on the child side (see
 * `entry-window.ts` message listener). This wire is dirty-agnostic:
 * when `prev.title !== next.title`, it always pushes, and the child
 * decides whether to apply immediately or stash into `pendingTitle`.
 *
 * No-op conditions (wire deliberately skips the push):
 *   - No container yet (boot-time state).
 *   - `prev.entries === next.entries` (no mutation in the relevant
 *     identity gate).
 *   - Zero currently-open entry-window children.
 *   - The open lid does not match any entry in the new container.
 *   - The entry's title did not change across this state transition.
 *
 * Spec: `docs/development/entry-window-title-live-refresh-v1.md`.
 */

import type { Dispatcher } from '../state/dispatcher';
import { getOpenEntryWindowLids, pushTitleUpdate } from './entry-window';

/**
 * Wire the title refresh subscription onto the given dispatcher.
 * Returns the unsubscribe function from `dispatcher.onState` so
 * callers can tear down the subscription (primarily for tests —
 * the production `main.ts` call site does not bother to
 * unsubscribe).
 */
export function wireEntryWindowTitleRefresh(dispatcher: Dispatcher): () => void {
  return dispatcher.onState((state, prev) => {
    const nextContainer = state.container;
    if (!nextContainer) return;
    const prevEntries = prev.container?.entries;
    const nextEntries = nextContainer.entries;
    // Outer gate: entries identity must have flipped. Without this
    // check the wire would scan on every dispatch, including
    // selection / view-mode changes that cannot possibly affect
    // titles.
    if (prevEntries === nextEntries) return;

    const openLids = getOpenEntryWindowLids();
    if (openLids.length === 0) return;

    for (const lid of openLids) {
      const nextEntry = nextContainer.entries.find((e) => e.lid === lid);
      if (!nextEntry) continue;
      const prevEntry = prev.container?.entries.find((e) => e.lid === lid);
      // Per-entry gate: skip pushes that would not change the title.
      // Covers the common case where container.entries flipped for
      // an unrelated mutation (e.g. a different entry was edited).
      if (prevEntry && prevEntry.title === nextEntry.title) continue;

      pushTitleUpdate(lid, nextEntry.title ?? '');
    }
  });
}
