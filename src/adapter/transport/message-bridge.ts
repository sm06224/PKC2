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
 * - origin verification is configurable; the empty/`*` default
 *   accepts all origins except the special `"null"` origin, which
 *   must be opted in explicitly (see `BridgeOptions.allowedOrigins`
 *   and `docs/spec/record-offer-capture-profile.md` §9.2).
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
import type { PongProfile } from './profile';
import { validateEnvelope, isPkcMessage, formatRejectReasons } from './envelope';

// ── Types ────────────────────────

export interface BridgeOptions {
  /** Local container_id for target filtering and source tagging. */
  containerId: string;

  /**
   * Allowed origins. If empty or `['*']`, accept all origins except
   * the special `"null"` origin (opaque origins from file:// or
   * sandboxed iframes), which must always be opted in explicitly via
   * `allowedOrigins: [..., 'null']`. Otherwise, only accept messages
   * from listed origins.
   *
   * Production bootstrap should pass an explicit list per
   * `docs/spec/record-offer-capture-profile.md` §9.1 / §9.2.
   */
  allowedOrigins?: string[];

  /**
   * Callback for validated, non-ping messages.
   * The bridge handles ping/pong internally.
   * sourceWindow is the window that sent the message (for response targeting).
   */
  onMessage?: (envelope: MessageEnvelope, origin: string, sourceWindow: Window) => void;

  /**
   * Callback for rejected messages (logging/debugging).
   */
  onReject?: (data: unknown, reason: string) => void;

  /**
   * Optional profile provider for pong payload.
   * Called on each ping to build the current profile snapshot.
   * If omitted, pong payload is null (backward compatible).
   */
  pongProfile?: () => PongProfile;
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
    pongProfile,
  } = options;

  const acceptAllOrigins = allowedOrigins.length === 0 || allowedOrigins.includes('*');

  function handleMessage(event: MessageEvent): void {
    // 1. Quick filter: skip non-PKC messages silently
    if (!isPkcMessage(event.data)) return;

    // 2a. Origin `"null"` (file:// sender, sandboxed iframe, opaque
    //     origin) is rejected unless explicitly opt-in via
    //     `allowedOrigins: [..., 'null']`. Per
    //     `docs/spec/record-offer-capture-profile.md` §9.2, `"null"`
    //     must not ride on the accept-all path — requiring an explicit
    //     list membership keeps the file:// / sandboxed-iframe opt-in
    //     auditable at the mount site.
    if (event.origin === 'null' && !allowedOrigins.includes('null')) {
      onReject?.(event.data, `Origin rejected: null (explicit opt-in required)`);
      return;
    }

    // 2b. Origin allowlist check
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
      // Respond with pong carrying profile payload (if provider exists).
      if (event.source && typeof (event.source as Window).postMessage === 'function') {
        const payload = pongProfile ? pongProfile() : null;
        const pong = buildEnvelope(containerId, 'pong', payload, envelope.source_id);
        (event.source as Window).postMessage(pong, '*');
      }
      return;
    }

    // pong is informational — pass to callback but don't auto-handle
    // All other types → delegate to callback
    if (onMessage && event.source) {
      onMessage(envelope, event.origin, event.source as Window);
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
