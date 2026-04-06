/**
 * PKC-Message: minimal postMessage protocol for PKC2 inter-instance communication.
 * Type definitions only (implementation in Phase 2).
 */

export type PKCMessageType =
  | 'ping'
  | 'pong'
  | 'record:offer'
  | 'record:accept'
  | 'export:request'
  | 'export:result'
  | 'navigate'
  | 'custom';

export interface PKCMessage {
  protocol: 'pkc-message';
  version: 1;
  type: PKCMessageType;
  source_id: string | null;
  target_id: string | null;
  payload: unknown;
  timestamp: string;
}
