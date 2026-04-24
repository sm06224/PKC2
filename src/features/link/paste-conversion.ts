/**
 * Paste Conversion Engine — minimal slice.
 *
 * Pure function that normalizes pasted raw text into a classified
 * link target. This is the *entry point* of the PKC link system —
 * clipboard, drag & drop, P2P-received text, and extension inputs
 * all flow through this transform before any renderer, parser, or
 * markdown layer sees the string. Establishing a single safe entry
 * point is the whole point of this slice: anything that adds new
 * intake surfaces (DnD, extensions, PostMessage) can plug into this
 * function instead of duplicating the container-id matching logic.
 *
 * Spec: `docs/spec/pkc-link-unification-v0.md` §7 (paste conversion
 * rules). The rules this module implements:
 *
 *   §7.1  permalink → internal ONLY if container_id matches self
 *   §7.2  permalink → permalink (external) on cross-container
 *   §7.3  internal reference (entry:/asset:) passes through as
 *         internal, no promotion to permalink
 *   §7.4  plain text / other URLs pass through as external
 *   §7.6  idempotent: feeding the output target back in yields the
 *         same classification (important because the same string
 *         may travel through multiple paste surfaces in one edit)
 *
 * Invariants:
 *   - pure: no side effects, no DOM, no state, no I/O
 *   - safe: malformed input falls through to external with the raw
 *     string preserved — never throws
 *   - conservative on cross-container: when in doubt, keep the raw
 *     permalink so we never silently demote one container's lid
 *     into another's namespace
 *   - presentation is always `'link'` in this slice — embed (`![]`)
 *     and card (`@[card]`) are a later slice and do not belong in
 *     the paste engine
 *
 * Grammar source: the `pkc://` parse/format/same-container rules
 * live in `./permalink.ts` (single source of truth). This module
 * is a thin classifier on top of that helper — it never re-parses
 * permalink shape itself.
 *
 * Features layer: imports neither adapter nor core.
 */

import {
  PKC_SCHEME,
  parsePermalink,
  isSamePermalinkContainer,
} from './permalink';

export interface PasteConversionResult {
  readonly type: 'internal' | 'external';
  readonly target: string;
  readonly presentation: 'link';
}

const ENTRY_SCHEME = 'entry:';
const ASSET_SCHEME = 'asset:';

/**
 * Convert pasted raw text into a classified link target.
 *
 * @param raw                  The clipboard / drop / message payload
 * @param currentContainerId   `container.container_id` of the active
 *                             PKC — the only id that can trigger a
 *                             permalink → internal demotion
 */
export function convertPastedText(
  raw: string,
  currentContainerId: string,
): PasteConversionResult {
  if (typeof raw !== 'string') return external(String(raw));

  // §7.3 Internal references pass through. We never promote them to
  // permalinks — the writer already chose the internal form, and a
  // permalink without the surrounding context can't be safely derived
  // here (we would need the full container identity).
  if (raw.startsWith(ENTRY_SCHEME) || raw.startsWith(ASSET_SCHEME)) {
    return internal(raw);
  }

  // §7.1 / §7.2 Permalink handling — delegate the grammar to
  // `parsePermalink`; malformed shape falls through to external.
  if (raw.startsWith(PKC_SCHEME)) {
    const parsed = parsePermalink(raw);
    if (parsed === null) return external(raw);
    if (isSamePermalinkContainer(parsed, currentContainerId)) {
      const target =
        parsed.kind === 'entry'
          ? `${ENTRY_SCHEME}${parsed.targetId}${parsed.fragment ?? ''}`
          : `${ASSET_SCHEME}${parsed.targetId}`;
      return internal(target);
    }
    return external(raw); // cross-container → keep permalink
  }

  // §7.4 Plain text / http(s):// / anything else is external.
  return external(raw);
}

function internal(target: string): PasteConversionResult {
  return { type: 'internal', target, presentation: 'link' };
}

function external(target: string): PasteConversionResult {
  return { type: 'external', target, presentation: 'link' };
}
