/**
 * Profile: lightweight self-description for pong payload.
 *
 * When a host or sibling PKC sends a ping, the bridge responds with
 * a pong carrying a PongProfile. This tells the sender:
 * - What app this is
 * - What version and schema it speaks
 * - Whether it's embedded
 * - What message types it accepts (advertised types only)
 *
 * This is NOT capability negotiation. It is a passive, read-only
 * profile response. The sender decides what to do with it.
 *
 * Design:
 * - Profile is built from source-side constants + runtime state
 * - No heavy runtime state is included (no entries, no pending offers)
 * - The profile helper is pure: takes inputs, returns a value
 * - Bridge calls this to build the pong payload
 *
 * `capabilities` source (PR-B' / Decision D1, 2026-04-26):
 * Reads `MESSAGE_CAPABILITIES` from `./capability.ts` (derived from
 * `MESSAGE_RULES` keys). This guarantees the advertised list always
 * matches the message types that will actually route to a handler.
 * The list follows spec `pkc-message-api-v1.md` §5.2.1 vocabulary
 * (message-type names, colon-separated). Build-side feature flags
 * are intentionally NOT included (see `BUILD_FEATURES` in
 * `src/runtime/release-meta.ts`).
 */

import { APP_ID, SCHEMA_VERSION } from '../../runtime/release-meta';
import { MESSAGE_CAPABILITIES } from './capability';

// ── Profile shape ────────────────────────

/**
 * Minimal self-description included in pong payload.
 * Flat, serializable, machine-readable.
 */
export interface PongProfile {
  /** Fixed app identifier. Always 'pkc2'. */
  app_id: string;
  /** Semantic version. */
  version: string;
  /** Data schema version. */
  schema_version: number;
  /** Whether this instance is running embedded in an iframe. */
  embedded: boolean;
  /** Supported capability strings. */
  capabilities: readonly string[];
}

// ── Builder ────────────────────────

export interface ProfileInput {
  /** Semantic version (from runtime or build-time). */
  version: string;
  /** Current embedded state. */
  embedded: boolean;
}

/**
 * Build a PongProfile from runtime inputs and source-side constants.
 * Pure function — no browser API access.
 */
export function buildPongProfile(input: ProfileInput): PongProfile {
  return {
    app_id: APP_ID,
    version: input.version,
    schema_version: SCHEMA_VERSION,
    embedded: input.embedded,
    capabilities: MESSAGE_CAPABILITIES,
  };
}
