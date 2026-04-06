/**
 * Envelope validation for PKC-Message protocol.
 *
 * Validates incoming postMessage data against the MessageEnvelope contract.
 * Returns structured validation results with reject reasons.
 *
 * This module does NOT:
 * - Access DOM or browser APIs (pure validation)
 * - Dispatch actions or modify state
 * - Handle message routing (bridge does that)
 */

import type { MessageEnvelope, MessageType } from '../../core/model/message';

// ── Validation result types ────────────────────────

export type RejectCode =
  | 'NOT_OBJECT'
  | 'WRONG_PROTOCOL'
  | 'WRONG_VERSION'
  | 'MISSING_TYPE'
  | 'INVALID_TYPE'
  | 'MISSING_TIMESTAMP';

export interface RejectReason {
  code: RejectCode;
  message: string;
}

export interface ValidEnvelope {
  valid: true;
  envelope: MessageEnvelope;
}

export interface InvalidEnvelope {
  valid: false;
  reasons: RejectReason[];
}

export type ValidationResult = ValidEnvelope | InvalidEnvelope;

// ── Known message types ────────────────────────

const KNOWN_TYPES: ReadonlySet<string> = new Set<MessageType>([
  'ping',
  'pong',
  'record:offer',
  'record:accept',
  'record:reject',
  'export:request',
  'export:result',
  'navigate',
  'custom',
]);

// ── Main API ────────────────────────

/**
 * Validate raw postMessage data as a PKC-Message envelope.
 * Returns structured result: valid envelope or reject reasons.
 */
export function validateEnvelope(data: unknown): ValidationResult {
  const reasons: RejectReason[] = [];

  // 1. Must be an object
  if (!data || typeof data !== 'object') {
    return reject([{ code: 'NOT_OBJECT', message: 'Message data is not an object' }]);
  }

  const obj = data as Record<string, unknown>;

  // 2. Protocol discriminant
  if (obj.protocol !== 'pkc-message') {
    reasons.push({
      code: 'WRONG_PROTOCOL',
      message: `Expected protocol "pkc-message", got "${String(obj.protocol)}"`,
    });
  }

  // 3. Version
  if (obj.version !== 1) {
    reasons.push({
      code: 'WRONG_VERSION',
      message: `Expected version 1, got ${String(obj.version)}`,
    });
  }

  // 4. Type
  if (!obj.type || typeof obj.type !== 'string') {
    reasons.push({ code: 'MISSING_TYPE', message: 'Missing or invalid message type' });
  } else if (!KNOWN_TYPES.has(obj.type)) {
    reasons.push({
      code: 'INVALID_TYPE',
      message: `Unknown message type: "${obj.type}"`,
    });
  }

  // 5. Timestamp
  if (!obj.timestamp || typeof obj.timestamp !== 'string') {
    reasons.push({ code: 'MISSING_TIMESTAMP', message: 'Missing or invalid timestamp' });
  }

  if (reasons.length > 0) return reject(reasons);

  return {
    valid: true,
    envelope: obj as unknown as MessageEnvelope,
  };
}

/**
 * Check if raw data looks like a PKC-Message (quick check, no full validation).
 * Useful for filtering non-PKC messages in the bridge.
 */
export function isPkcMessage(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  return (data as Record<string, unknown>).protocol === 'pkc-message';
}

/**
 * Format reject reasons for logging/display.
 */
export function formatRejectReasons(reasons: RejectReason[]): string {
  return reasons.map((r) => `[${r.code}] ${r.message}`).join('; ');
}

// ── Internal ────────────────────────

function reject(reasons: RejectReason[]): InvalidEnvelope {
  return { valid: false, reasons };
}
