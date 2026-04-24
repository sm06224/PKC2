/**
 * Paste Conversion Engine — entry point for the link system.
 *
 * Pure function that normalizes pasted raw text into a classified
 * link target. Single intake surface for clipboard / drag & drop /
 * P2P-received text / extension inputs — every paste path goes
 * through this transform before any renderer, parser, or markdown
 * layer sees the string.
 *
 * Spec: docs/spec/pkc-link-unification-v0.md §7 (post-correction).
 *
 * Forms accepted on input:
 *
 *   1. External Permalink — `<base>#pkc?container=<cid>&entry=<lid>`
 *      The clickable URL that external apps (Loop / Office / mail)
 *      use to share PKC entries. Same-container ones demote to
 *      `entry:` / `asset:` internal references; cross-container
 *      ones stay verbatim so the original URL keeps working.
 *   2. Portable PKC Reference — `pkc://<cid>/entry/<lid>[#<frag>]`
 *      The machine identifier form. Same-container behaviour as
 *      External Permalink; cross-container stays verbatim.
 *   3. Internal Reference — `entry:<lid>` / `asset:<key>`
 *      Pass-through; the writer already chose the internal form.
 *   4. Anything else — plain text / http(s):// without `#pkc?` /
 *      Office URI scheme / obsidian:// / mailto: — preserved as
 *      external pass-through.
 *
 * Invariants:
 *   - pure: no side effects, no DOM, no state, no I/O
 *   - safe: malformed input falls through to external with the raw
 *     string preserved — never throws
 *   - conservative on cross-container: when in doubt, keep the raw
 *     reference so we never silently demote one container's lid
 *     into another's namespace
 *   - presentation is always `'link'` in this slice — embed (`![]`)
 *     and card (`@[card]`) live in a later slice
 *
 * Grammar source: `./permalink.ts` owns both the Portable
 * Reference (`pkc://`) and External Permalink (`<base>#pkc?...`)
 * parsers. This module never re-parses URL shape itself.
 *
 * Features layer: imports neither adapter nor core.
 */

import {
  PKC_SCHEME,
  parsePortablePkcReference,
  parseExternalPermalink,
  isSamePortableContainer,
  type ParsedPortablePkcReference,
  type ParsedExternalPermalink,
} from './permalink';

export interface PasteConversionResult {
  readonly type: 'internal' | 'external';
  readonly target: string;
  readonly presentation: 'link';
}

const ENTRY_SCHEME = 'entry:';
const ASSET_SCHEME = 'asset:';
const PKC_FRAGMENT_MARKER = '#pkc?';

/**
 * Convert pasted raw text into a classified link target.
 *
 * @param raw                  The clipboard / drop / message payload
 * @param currentContainerId   `container.container_id` of the active
 *                             PKC — the only id that can trigger a
 *                             same-container demotion to `entry:` /
 *                             `asset:` internal references
 */
export function convertPastedText(
  raw: string,
  currentContainerId: string,
): PasteConversionResult {
  if (typeof raw !== 'string') return external(String(raw));

  // §7.3 — internal references pass through unchanged. The writer
  // already chose the internal form; promoting them silently would
  // require a container identity we may not have.
  if (raw.startsWith(ENTRY_SCHEME) || raw.startsWith(ASSET_SCHEME)) {
    return internal(raw);
  }

  // §7.1 / §7.2 — Portable PKC Reference (`pkc://...`).
  if (raw.startsWith(PKC_SCHEME)) {
    const parsed = parsePortablePkcReference(raw);
    if (parsed === null) return external(raw); // malformed → fallback
    return demoteOrKeep(parsed, currentContainerId, raw);
  }

  // §7.1 / §7.2 — External Permalink (`<base>#pkc?...`). Detected
  // by the marker fragment so legacy http(s) / file URLs without
  // it are NOT intercepted (spec §12 non-interference).
  if (raw.includes(PKC_FRAGMENT_MARKER)) {
    const parsed = parseExternalPermalink(raw);
    if (parsed === null) return external(raw);
    return demoteOrKeep(parsed, currentContainerId, raw);
  }

  // §7.4 — plain text / http(s):// without #pkc? / Office URI
  // scheme / obsidian:// / mailto: — never our business.
  return external(raw);
}

/**
 * Apply the same-container demotion rule to either parser shape.
 * Cross-container content is returned as `external` with the
 * original raw string preserved (so external permalinks remain
 * clickable in external viewers and portable refs remain valid
 * cross-PKC identifiers).
 */
function demoteOrKeep(
  parsed: ParsedPortablePkcReference | ParsedExternalPermalink,
  currentContainerId: string,
  raw: string,
): PasteConversionResult {
  if (!isSamePortableContainer(parsed, currentContainerId)) return external(raw);

  if (parsed.kind === 'asset') {
    return internal(`${ASSET_SCHEME}${parsed.targetId}`);
  }

  // Both shapes carry a fragment, but Portable Reference's already
  // includes the leading `#`, while External Permalink stores the
  // value without it. Normalise to a single `#`-prefixed form.
  const frag = normaliseFragment(parsed.fragment);
  return internal(`${ENTRY_SCHEME}${parsed.targetId}${frag}`);
}

function normaliseFragment(value: string | undefined): string {
  if (value === undefined || value === '') return '';
  return value.startsWith('#') ? value : `#${value}`;
}

function internal(target: string): PasteConversionResult {
  return { type: 'internal', target, presentation: 'link' };
}

function external(target: string): PasteConversionResult {
  return { type: 'external', target, presentation: 'link' };
}
