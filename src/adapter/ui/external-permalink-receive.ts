/**
 * External Permalink receive — boot-time hash navigation.
 *
 * When PKC2 is opened via an External Permalink such as
 *
 *     file:///home/u/pkc2.html#pkc?container=<cid>&entry=<lid>
 *     https://example.com/pkc2.html#pkc?container=<cid>&entry=<lid>
 *
 * this helper inspects `window.location.href` after the container
 * has loaded, parses the `#pkc?...` fragment with the existing
 * `parseExternalPermalink` helper, and dispatches a `SELECT_ENTRY`
 * (with `revealInSidebar: true`) to land the user on the target
 * entry. Asset permalinks resolve to the owning attachment entry.
 *
 * Spec: docs/spec/pkc-link-unification-v0.md §4 / §7 (post-correction).
 *
 * What this slice does NOT do:
 *   - cross-container fetch / P2P resolve (we only navigate when
 *     the permalink targets the currently-loaded container)
 *   - asset preview / modal — asset permalinks navigate to the
 *     owning attachment entry, no extra UI surface
 *   - hashchange listening — only the initial boot-time URL is
 *     consumed in v0; in-page hash edits are ignored
 *   - URL fragment writeback / history mutation
 *   - migration / rewrite of legacy hash forms
 *
 * Adapter layer: reads window.location and dispatches actions, but
 * keeps the parsing logic delegated to features/link/permalink so
 * grammar stays single-source-of-truth.
 */

import {
  parseExternalPermalink,
  isSamePortableContainer,
  type ParsedExternalPermalink,
} from '../../features/link/permalink';
import type { Container } from '../../core/model/container';
import type { Dispatcher } from '../state/dispatcher';
import { showToast } from './toast';

/**
 * Outcome classification for the receive attempt. Exposed for tests
 * and for any future logging hook; the `applyExternalPermalinkOnBoot`
 * caller does not need to inspect it.
 */
export type ReceiveOutcome =
  | { kind: 'no-hash' }
  | { kind: 'malformed' }
  | { kind: 'cross-container'; parsed: ParsedExternalPermalink }
  | { kind: 'missing-entry'; parsed: ParsedExternalPermalink }
  | { kind: 'missing-asset'; parsed: ParsedExternalPermalink }
  | { kind: 'navigated'; lid: string; parsed: ParsedExternalPermalink };

/**
 * Pure parse: takes a URL string and returns the parsed shape, or
 * `null` if the URL has no `#pkc?...` fragment / is malformed.
 *
 * This wrapper exists so callers (including tests) can opt out of
 * touching `window.location` directly. The grammar logic lives in
 * `features/link/permalink.ts`.
 */
export function parseExternalPermalinkFromUrl(
  url: string,
): ParsedExternalPermalink | null {
  return parseExternalPermalink(url);
}

/**
 * Resolve the lid we should select for a parsed permalink within
 * `container`. Returns `null` when the target cannot be located:
 *
 *   - entry kind: lid not in `container.entries`
 *   - asset kind: no attachment entry whose body references the
 *     given asset_key
 *
 * Asset receive policy (v0): we hop to the **owning attachment
 * entry**, not the asset itself. There is no asset preview modal
 * in this slice, and the attachment entry is the closest stable
 * surface for the user to land on.
 */
export function resolveTargetLid(
  parsed: ParsedExternalPermalink,
  container: Container,
): string | null {
  if (parsed.kind === 'entry') {
    const hit = container.entries.find((e) => e.lid === parsed.targetId);
    return hit ? hit.lid : null;
  }
  // asset
  for (const entry of container.entries) {
    if (entry.archetype !== 'attachment') continue;
    if (typeof entry.body !== 'string' || entry.body === '') continue;
    let assetKey: unknown;
    try {
      const parsedBody = JSON.parse(entry.body) as { asset_key?: unknown };
      assetKey = parsedBody.asset_key;
    } catch {
      continue;
    }
    if (typeof assetKey === 'string' && assetKey === parsed.targetId) {
      return entry.lid;
    }
  }
  return null;
}

/**
 * Apply an External Permalink to the running app on boot.
 *
 * Reads `window.location.href`, parses any `#pkc?...` fragment,
 * and dispatches `SELECT_ENTRY` (with `revealInSidebar: true`)
 * when the permalink targets the currently-loaded container and
 * resolves to a real entry / attachment.
 *
 * All other paths are safe no-ops with an optional `info`-level
 * toast: ordinary hashes are ignored, malformed `#pkc?...` produces
 * no notification (the URL might be a typo from a future scheme),
 * cross-container / missing-target produce a toast so the user
 * understands why nothing happened.
 *
 * Returns the outcome for tests and for any future telemetry hook.
 */
export function applyExternalPermalinkOnBoot(
  dispatcher: Dispatcher,
  container: Container,
  rawUrl: string = readLocationHref(),
): ReceiveOutcome {
  if (typeof rawUrl !== 'string' || rawUrl === '') return { kind: 'no-hash' };
  const parsed = parseExternalPermalinkFromUrl(rawUrl);
  if (parsed === null) {
    // Either no `#pkc?` marker at all, or a malformed query.
    // We can't tell them apart without re-scanning the string;
    // either way the safe action is to leave boot state untouched.
    return rawUrl.includes('#pkc?')
      ? { kind: 'malformed' }
      : { kind: 'no-hash' };
  }

  const currentContainerId = container.meta.container_id;
  if (!isSamePortableContainer(parsed, currentContainerId)) {
    showToast({
      kind: 'info',
      message: `別 container (${parsed.containerId}) のリンクのため移動しませんでした。`,
      autoDismissMs: 4000,
    });
    return { kind: 'cross-container', parsed };
  }

  const lid = resolveTargetLid(parsed, container);
  if (lid === null) {
    const targetLabel = parsed.kind === 'entry' ? 'エントリ' : 'アセット';
    showToast({
      kind: 'info',
      message: `${targetLabel} (${parsed.targetId}) が見つかりませんでした。`,
      autoDismissMs: 4000,
    });
    return parsed.kind === 'entry'
      ? { kind: 'missing-entry', parsed }
      : { kind: 'missing-asset', parsed };
  }

  // External permalinks are an explicit jump from outside the app,
  // so opt into the sidebar reveal so a deeply-nested target is
  // visible after navigation. Mirrors the pattern used by
  // navigate-entry-ref (action-binder.ts:1932).
  dispatcher.dispatch({ type: 'SELECT_ENTRY', lid, revealInSidebar: true });
  return { kind: 'navigated', lid, parsed };
}

/**
 * Defensive accessor for `window.location.href`. Returns an empty
 * string when no DOM is present (Node test contexts) so the caller
 * can early-out without throwing.
 */
function readLocationHref(): string {
  if (typeof window === 'undefined' || !window.location) return '';
  return window.location.href ?? '';
}
