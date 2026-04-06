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
 * - Capability strings in CAPABILITIES (release-meta.ts) are the external
 *   contract; this module is the internal enforcement.
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
 * Only types listed here are considered "supported."
 * ping/pong are handled by the bridge before routing, so not listed.
 */
const MESSAGE_RULES: Partial<Record<MessageType, MessageRule>> = {
  'export:request': { mode: 'embedded-only' },
  'record:offer':   { mode: 'any' },
  'record:reject':  { mode: 'any' },
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
