/**
 * MessageBridge: runtime postMessage transport for PKC-Message protocol.
 *
 * Responsibility:
 * - Listen for incoming postMessage events on window
 * - Validate envelopes and filter non-PKC messages
 * - Auto-respond to ping with pong
 * - Route validated messages to an onMessage callback
 * - Provide a typed send API for outgoing messages
 *
 * Design decisions:
 * - origin verification is configurable (default: accept all for dev)
 * - unknown message types are rejected and logged, not thrown
 * - ping/pong is handled automatically (bridge-internal, no reducer)
 * - other message types are delegated to onMessage callback
 * - source_id/target_id filtering: target_id must match local container_id or be null
 *
 * This module does NOT:
 * - Dispatch to the reducer directly (caller's onMessage does that)
 * - Implement capability negotiation
 * - Implement rate limiting or payload size limits
 * - Handle embed/sandbox detection
 */

import type { MessageEnvelope, MessageType } from '../../core/model/message';
import { validateEnvelope, isPkcMessage, formatRejectReasons } from './envelope';

// ── Types ────────────────────────

export interface BridgeOptions {
  /** Local container_id for target filtering and source tagging. */
  containerId: string;

  /**
   * Allowed origins. If empty or ['*'], accept all origins.
   * Otherwise, only accept messages from listed origins.
   */
  allowedOrigins?: string[];

  /**
   * Callback for validated, non-ping messages.
   * The bridge handles ping/pong internally.
   */
  onMessage?: (envelope: MessageEnvelope, origin: string) => void;

  /**
   * Callback for rejected messages (logging/debugging).
   */
  onReject?: (data: unknown, reason: string) => void;
}

export interface MessageSender {
  /**
   * Send a MessageEnvelope to a target window.
   * @param target - Target window (e.g., parent, iframe.contentWindow)
   * @param type - Message type
   * @param payload - Message payload
   * @param targetId - Target container_id (null = broadcast)
   * @param targetOrigin - Target origin (default: '*')
   */
  send(
    target: Window,
    type: MessageType,
    payload: unknown,
    targetId?: string | null,
    targetOrigin?: string,
  ): void;
}

export interface BridgeHandle {
  /** Cleanup: remove listener. */
  destroy: () => void;
  /** Sender API. */
  sender: MessageSender;
}

// ── Main API ────────────────────────

/**
 * Mount the message bridge on window.
 * Returns a handle with destroy() and sender.
 */
export function mountMessageBridge(options: BridgeOptions): BridgeHandle {
  const {
    containerId,
    allowedOrigins = [],
    onMessage,
    onReject,
  } = options;

  const acceptAllOrigins = allowedOrigins.length === 0 || allowedOrigins.includes('*');

  function handleMessage(event: MessageEvent): void {
    // 1. Quick filter: skip non-PKC messages silently
    if (!isPkcMessage(event.data)) return;

    // 2. Origin check
    if (!acceptAllOrigins && !allowedOrigins.includes(event.origin)) {
      onReject?.(event.data, `Origin rejected: ${event.origin}`);
      return;
    }

    // 3. Full validation
    const result = validateEnvelope(event.data);
    if (!result.valid) {
      const reason = formatRejectReasons(result.reasons);
      console.warn(`[PKC2] Message rejected: ${reason}`);
      onReject?.(event.data, reason);
      return;
    }

    const envelope = result.envelope;

    // 4. Target filtering: if target_id is set, must match local
    if (envelope.target_id !== null && envelope.target_id !== containerId) {
      // Not for us, skip silently
      return;
    }

    // 5. Auto-handle ping/pong
    if (envelope.type === 'ping') {
      // Respond with pong to the source window.
      // Use '*' as targetOrigin — origin was already validated above.
      if (event.source && typeof (event.source as Window).postMessage === 'function') {
        const pong = buildEnvelope(containerId, 'pong', null, envelope.source_id);
        (event.source as Window).postMessage(pong, '*');
      }
      return;
    }

    // pong is informational — pass to callback but don't auto-handle
    // All other types → delegate to callback
    if (onMessage) {
      onMessage(envelope, event.origin);
    }
  }

  window.addEventListener('message', handleMessage);

  const sender = createSender(containerId);

  return {
    destroy: () => {
      window.removeEventListener('message', handleMessage);
    },
    sender,
  };
}

// ── Sender ────────────────────────

function createSender(containerId: string): MessageSender {
  return {
    send(
      target: Window,
      type: MessageType,
      payload: unknown,
      targetId: string | null = null,
      targetOrigin: string = '*',
    ): void {
      const envelope = buildEnvelope(containerId, type, payload, targetId);
      target.postMessage(envelope, targetOrigin);
    },
  };
}

/**
 * Build a valid MessageEnvelope.
 * Exported for testing.
 */
export function buildEnvelope(
  sourceId: string,
  type: MessageType,
  payload: unknown,
  targetId: string | null = null,
): MessageEnvelope {
  return {
    protocol: 'pkc-message',
    version: 1,
    type,
    source_id: sourceId,
    target_id: targetId,
    payload,
    timestamp: new Date().toISOString(),
  };
}
