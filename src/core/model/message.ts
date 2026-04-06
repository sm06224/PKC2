/**
 * MessageEnvelope: external postMessage protocol for PKC2 inter-instance
 * communication. This is EXTERNAL — not to be confused with internal
 * UserAction / SystemCommand / DomainEvent.
 *
 * Type definitions only (transport implementation in Phase 2).
 */

export type MessageType =
  | 'ping'
  | 'pong'
  | 'record:offer'
  | 'record:accept'
  | 'record:reject'
  | 'export:request'
  | 'export:result'
  | 'navigate'
  | 'custom';

export interface MessageEnvelope {
  /** Fixed protocol discriminant. */
  protocol: 'pkc-message';
  /** Protocol version. */
  version: 1;
  /** Message kind. */
  type: MessageType;
  /** Sender container_id (null = non-PKC parent). */
  source_id: string | null;
  /** Recipient container_id (null = broadcast). */
  target_id: string | null;
  /** Message-specific payload. */
  payload: unknown;
  /** ISO 8601 send timestamp. */
  timestamp: string;
}
