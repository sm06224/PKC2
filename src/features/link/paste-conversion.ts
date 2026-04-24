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
 * Features layer: imports neither adapter nor core.
 */

export interface PasteConversionResult {
  readonly type: 'internal' | 'external';
  readonly target: string;
  readonly presentation: 'link';
}

const PKC_SCHEME = 'pkc://';
const ENTRY_SCHEME = 'entry:';
const ASSET_SCHEME = 'asset:';

// Token shape shared with the existing `entry-ref.ts` parser so the
// permalink grammar stays consistent with the internal reference
// grammar. See spec §4.5 and §5.1.
const TOKEN_RE = /^[A-Za-z0-9_-]+$/;

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

  // §7.1 / §7.2 Permalink handling.
  if (raw.startsWith(PKC_SCHEME)) {
    const parsed = parsePkcPermalink(raw);
    if (parsed === null) return external(raw); // malformed → fallback
    if (parsed.containerId === currentContainerId) {
      const target =
        parsed.kind === 'entry'
          ? `${ENTRY_SCHEME}${parsed.id}${parsed.fragment ?? ''}`
          : `${ASSET_SCHEME}${parsed.id}`;
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

interface ParsedPermalink {
  readonly containerId: string;
  readonly kind: 'entry' | 'asset';
  readonly id: string;
  /** Includes the leading `#` so it round-trips verbatim. */
  readonly fragment: string | null;
}

/**
 * Parse a `pkc://<container_id>/<entry|asset>/<id>[#fragment]` URL.
 *
 * Returns `null` on any shape mismatch — caller treats that as
 * "malformed" and falls back to external pass-through. This helper
 * deliberately does NOT validate the internal shape of a fragment;
 * fragment values are preserved verbatim for round-trip fidelity
 * (see spec §4.5 / §5.1). Validation belongs in the permalink
 * parser slice that follows.
 */
function parsePkcPermalink(raw: string): ParsedPermalink | null {
  const rest = raw.slice(PKC_SCHEME.length);
  const hashIdx = rest.indexOf('#');
  const pathPart = hashIdx === -1 ? rest : rest.slice(0, hashIdx);
  const fragment = hashIdx === -1 ? null : rest.slice(hashIdx);

  const parts = pathPart.split('/');
  if (parts.length !== 3) return null;
  const [containerId, kind, id] = parts;
  if (containerId === undefined || !TOKEN_RE.test(containerId)) return null;
  if (kind !== 'entry' && kind !== 'asset') return null;
  if (id === undefined || !TOKEN_RE.test(id)) return null;

  // Fragments only carry meaning for entry references (spec §5.2:
  // assets are single blobs without sub-locations). A fragment on
  // an asset permalink is shape-wrong, so malformed.
  if (kind === 'asset' && fragment !== null) return null;

  // A bare `#` with no content is meaningless; prefer the fragmentless
  // form so idempotency holds.
  const normalizedFragment = fragment === '#' ? null : fragment;

  return {
    containerId,
    kind,
    id,
    fragment: normalizedFragment,
  };
}
