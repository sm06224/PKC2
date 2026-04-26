/**
 * Capability: minimal contract for "what this PKC can handle."
 *
 * Defines which MessageTypes are supported and under what conditions
 * (embedded-only, standalone-only, or any mode). The runtime uses
 * `canHandleMessage()` as a pre-routing guard to reject messages
 * that cannot be processed in the current mode.
 *
 * Design:
 * - Acceptance rules are static and declarative (no runtime registration).
 * - The guard runs BEFORE the handler registry — rejected messages never
 *   reach a handler, keeping handler logic free of mode checks.
 * - `MESSAGE_CAPABILITIES` (this module) is the **transport advertise
 *   list**: the message-type names PKC2 surfaces via `PongProfile`
 *   per spec `pkc-message-api-v1.md` §5.2.1. Derived from
 *   `MESSAGE_RULES` so that "registered handler" and "advertised type"
 *   stay in lockstep by construction.
 * - Build-side feature flags (`BUILD_FEATURES` in
 *   `src/runtime/release-meta.ts`) are a **separate** list with
 *   different vocabulary and audience (devtools / embed harness).
 *
 * This module does NOT:
 * - Check AppPhase (the reducer handles phase gating)
 * - Implement capability negotiation protocol
 * - Validate payloads (handlers do that)
 */

import type { MessageType } from '../../core/model/message';

// ── Acceptance mode ────────────────────────

/**
 * When a message type can be accepted:
 * - 'any': works in both standalone and embedded mode
 * - 'embedded-only': requires embedded=true
 */
export type AcceptanceMode = 'any' | 'embedded-only';

interface MessageRule {
  mode: AcceptanceMode;
}

/**
 * Static acceptance rules per MessageType.
 * Only types listed here are considered "supported" for INBOUND routing.
 *
 * ping/pong are handled by the bridge before routing, so not listed.
 *
 * `record:reject` is intentionally NOT listed: PKC2 only **sends** it
 * when a pending offer is dismissed (`main.ts:391`), and currently has
 * no architecture for receiving offer-reject replies (no outgoing-offer
 * tracking exists). See
 * `docs/development/transport-record-reject-decision.md`.
 */
const MESSAGE_RULES: Partial<Record<MessageType, MessageRule>> = {
  'export:request': { mode: 'embedded-only' },
  'record:offer':   { mode: 'any' },
};

// ── Public API ────────────────────────

/**
 * Check if this PKC can handle a given message type in the current mode.
 * Returns true if the message type is supported AND the mode allows it.
 */
export function canHandleMessage(type: MessageType, embedded: boolean): boolean {
  const rule = MESSAGE_RULES[type];
  if (!rule) return false;

  switch (rule.mode) {
    case 'any':
      return true;
    case 'embedded-only':
      return embedded;
  }
}

/**
 * Get the list of supported message types (for diagnostics/logging).
 */
export function getSupportedMessageTypes(): MessageType[] {
  return Object.keys(MESSAGE_RULES) as MessageType[];
}

/**
 * Get the acceptance mode for a message type (for diagnostics).
 * Returns null if the type is not supported.
 */
export function getAcceptanceMode(type: MessageType): AcceptanceMode | null {
  return MESSAGE_RULES[type]?.mode ?? null;
}

/**
 * Transport-advertised message types. Derived from `MESSAGE_RULES`
 * keys (sorted for deterministic ordering) so the list always
 * matches what the bridge actually routes to a handler.
 *
 * This is the canonical source for `PongProfile.capabilities` per
 * spec `pkc-message-api-v1.md` §5.2.1:
 *
 *   - Vocabulary: message-type names (colon-separated, e.g.
 *     `'record:offer'`, `'export:request'`).
 *   - Subset of `KNOWN_TYPES` (envelope.ts).
 *   - Excludes protocol primitives (`ping` / `pong`) — they are
 *     always available and not advertised.
 *   - Excludes types without a registered handler (so a sender
 *     never sees an advertise for a type that would silently drop).
 *
 * Build-side feature flags live in a different list, see
 * `BUILD_FEATURES` in `src/runtime/release-meta.ts`.
 */
export const MESSAGE_CAPABILITIES: readonly MessageType[] = (
  Object.keys(MESSAGE_RULES) as MessageType[]
).sort();
