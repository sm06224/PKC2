/**
 * PKC Permalink — parser / formatter (pure helpers).
 *
 * Single source of truth for the `pkc://` grammar defined by
 * `docs/spec/pkc-link-unification-v0.md` §4 (canonical permalink)
 * and §5 (internal reference grammar that shares token shape).
 *
 * This module is a pure feature layer helper — it is consumed by
 * `paste-conversion.ts` (and any future intake surface: DnD, P2P
 * receive, PostMessage, extension inputs). Keeping the grammar
 * here in one place prevents the duplicated-parse drift that
 * tends to creep in once several call sites need to understand
 * the same URL shape.
 *
 * Invariants:
 *   - pure: no side effects, no DOM, no state, no I/O
 *   - safe: malformed input produces `null`, never throws
 *   - round-trip: `parsePermalink(formatPermalink(input)!)` yields
 *     a shape that is structurally equal to `input` (ignoring the
 *     `raw` field, which carries the source string for fidelity)
 *
 * This slice deliberately does NOT implement:
 *   - host URL wrapper (`<base>#pkc-ref=pkc://...`) expansion — the
 *     canonical form is enough for paste-conversion; wrapper support
 *     is a later slice once share UI lands
 *   - fragment validation (log/<id>, day/<yyyy-mm-dd>, heading) —
 *     fragments are preserved verbatim so the parser stays permissive
 *     while grammar evolves
 *   - legacy forms or coercion of entry: / asset: bare refs into
 *     permalinks — those belong in the internal reference layer
 */

export const PKC_SCHEME = 'pkc://';

export type PkcPermalinkKind = 'entry' | 'asset';

/**
 * Shared token shape with `src/features/entry-ref/entry-ref.ts`.
 * Mirrors spec §4.5 / §5.1 (token form is `[A-Za-z0-9_-]+`).
 */
const TOKEN_RE = /^[A-Za-z0-9_-]+$/;

/**
 * Structured view of a parsed permalink. `fragment` includes the
 * leading `#` so formatter and downstream consumers can treat it
 * as an opaque suffix. `raw` carries the original source string for
 * callers that want to echo the exact input back on cross-container
 * pass-through.
 */
export interface ParsedPermalink {
  readonly kind: PkcPermalinkKind;
  readonly containerId: string;
  readonly targetId: string;
  /** Includes the leading `#`. Always absent for `kind: 'asset'`. */
  readonly fragment?: string;
  readonly raw: string;
}

/**
 * Minimal formatter input. `fragment` — when provided — must already
 * carry the leading `#`; that keeps the callers honest about whether
 * they intend to add a fragment, and avoids ambiguity at the API
 * boundary.
 */
export interface PermalinkInput {
  readonly kind: PkcPermalinkKind;
  readonly containerId: string;
  readonly targetId: string;
  readonly fragment?: string;
}

/**
 * Parse a canonical PKC permalink string.
 *
 * Returns `null` for any shape mismatch: unknown scheme, missing
 * segments, invalid tokens, unknown kind, extra path segments, or
 * an asset permalink carrying a fragment (assets have no sub-
 * locations, spec §5.2). Non-string input is also rejected.
 */
export function parsePermalink(raw: string): ParsedPermalink | null {
  if (typeof raw !== 'string') return null;
  if (!raw.startsWith(PKC_SCHEME)) return null;

  const rest = raw.slice(PKC_SCHEME.length);
  const hashIdx = rest.indexOf('#');
  const pathPart = hashIdx === -1 ? rest : rest.slice(0, hashIdx);
  // A bare `#` with no body is meaningless; normalize it away so
  // parse(format(parsed)) stays a fixed point.
  const fragmentSuffix = hashIdx === -1 ? '' : rest.slice(hashIdx);
  const fragment = fragmentSuffix === '#' ? '' : fragmentSuffix;

  const parts = pathPart.split('/');
  if (parts.length !== 3) return null;
  const [containerId, kindRaw, targetId] = parts;
  if (containerId === undefined || !TOKEN_RE.test(containerId)) return null;
  if (targetId === undefined || !TOKEN_RE.test(targetId)) return null;
  if (kindRaw !== 'entry' && kindRaw !== 'asset') return null;

  const kind: PkcPermalinkKind = kindRaw;

  // Assets are single blobs; a fragmented asset permalink is
  // ambiguous, so we reject it rather than silently drop the
  // fragment and change the caller's intent.
  if (kind === 'asset' && fragment !== '') return null;

  return fragment === ''
    ? { kind, containerId, targetId, raw }
    : { kind, containerId, targetId, fragment, raw };
}

/**
 * Produce a canonical PKC permalink string from a structured input.
 *
 * Returns `null` when any field violates the grammar (e.g. an empty
 * token, disallowed characters, or an asset carrying a fragment).
 * Callers that want an exception on bad input can do the assertion
 * at their site; the helper itself stays total for composability.
 */
export function formatPermalink(input: PermalinkInput): string | null {
  if (input.kind !== 'entry' && input.kind !== 'asset') return null;
  if (!TOKEN_RE.test(input.containerId)) return null;
  if (!TOKEN_RE.test(input.targetId)) return null;

  const fragment = input.fragment;
  if (fragment !== undefined) {
    if (input.kind === 'asset') return null; // §5.2
    if (!fragment.startsWith('#') || fragment.length < 2) return null;
  }

  const base = `${PKC_SCHEME}${input.containerId}/${input.kind}/${input.targetId}`;
  return fragment === undefined ? base : `${base}${fragment}`;
}

/**
 * True when a parsed permalink targets the caller's own container.
 *
 * Exact, case-sensitive string comparison — the same rule that
 * paste-conversion applies at §7.1. Intentionally conservative:
 * callers must supply a non-empty container id to opt in, so a
 * bootstrap glitch that leaves `currentContainerId` unset cannot
 * silently flip a cross-container permalink into an internal
 * reference.
 */
export function isSamePermalinkContainer(
  parsed: ParsedPermalink,
  currentContainerId: string,
): boolean {
  if (typeof currentContainerId !== 'string') return false;
  if (currentContainerId === '') return false;
  return parsed.containerId === currentContainerId;
}
