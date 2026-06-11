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
import {
  isV2Envelope,
  validateEnvelopeV2,
  buildResponseSuccess,
  buildResponseError,
} from './envelope-v2';
import { createHeartbeatHandler } from './heartbeat-handler-v2';
import { JSON_RPC_ERROR_CODES } from '../../core/model/message-v2';

// ── Types ────────────────────────

export interface BridgeOptions {
  /** Local container_id for target filtering and source tagging. */
  containerId: string;

  /**
   * Allowed origins. Accepts either a static array or a provider
   * function that returns the array on each message (PR-B 2026-04-26).
   *
   * Static array form (default, backward-compatible):
   *   - Empty or `['*']` accepts all origins except the special
   *     `"null"` origin (opaque origins from `file://` or sandboxed
   *     iframes), which must always be opted in explicitly via
   *     `allowedOrigins: [..., 'null']`.
   *   - Otherwise, only accept messages from listed origins.
   *
   * Provider form (`() => string[]`):
   *   - Resolved on **each inbound message**, so the host can rotate
   *     the allowlist at runtime (e.g. user-edited settings, env var
   *     refresh, dynamic registration of trusted Extension origins)
   *     without re-mounting the bridge.
   *   - The result follows the same semantics as the static array.
   *   - If the provider throws, the bridge logs a warning via
   *     `onReject` and treats the result as empty (= accept-all
   *     fail-safe; the deployment author is responsible for choosing
   *     a fail-closed policy by configuring an explicit list at mount
   *     time).
   *   - Returning `null` / `undefined` is normalised to `[]`.
   *
   * Production bootstrap should pass an explicit list (or provider
   * returning one) per `docs/spec/record-offer-capture-profile.md`
   * §9.1 / §9.2.
   */
  allowedOrigins?: string[] | (() => string[]);

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
   * @param targetOrigin - Target origin. **Required** (#795 Phase 1.5):
   *   every caller must pass an explicit origin — route it through
   *   `pinTargetOrigin()` so a forgotten argument can no longer silently
   *   default to `'*'` and leak a response to a navigated-away window.
   */
  send(
    target: Window,
    type: MessageType,
    payload: unknown,
    targetId: string | null,
    targetOrigin: string,
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
 * Pin an outbound `targetOrigin` to the origin the inbound message
 * arrived from (#795 A-1). The opaque origin (`"null"` — file://
 * senders, sandboxed iframes) is not a valid `postMessage`
 * targetOrigin, so it falls back to `'*'`; security there is carried
 * by the window-identity binding (same trade-off as
 * `safeTargetOrigin()` in graph-extension-launcher.ts). Every
 * response path (pong / v2 responses / handler replies / record:reject)
 * must route its targetOrigin through this helper so the
 * "`'null'` → `'*'`, otherwise exact" rule lives in one place.
 */
export function pinTargetOrigin(origin: string): string {
  return origin && origin !== 'null' ? origin : '*';
}

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

  /**
   * Resolve `allowedOrigins` to a concrete `string[]`. With the static
   * array form this is a no-op; with the provider form we invoke it
   * per-message so dynamic config (settings UI, env reload, trusted-
   * Extension registry) flows through without remounting the bridge.
   *
   * Fail-safe behavior: if the provider throws, surface the error to
   * `onReject` (audit trail) and return `[]`. The deployment chooses
   * the policy — an empty allowlist defaults to "accept all except
   * `null`" (`acceptAllOrigins` branch below); deployments that want
   * fail-closed should configure an explicit list at mount time.
   */
  function resolveAllowedOrigins(): string[] {
    if (typeof allowedOrigins === 'function') {
      try {
        const result = allowedOrigins();
        return Array.isArray(result) ? result : [];
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        onReject?.(null, `allowedOrigins provider threw: ${msg}`);
        return [];
      }
    }
    return allowedOrigins;
  }

  // PR-V15(2026-05-14、A3 minimum):v2 heartbeat handler を bridge 構築時に
  // 1 回だけ生成、receiver の container_id を bind。
  const heartbeatHandler = createHeartbeatHandler({ containerId });

  function handleMessage(event: MessageEvent): void {
    // PR-V15(2026-05-14、A3):v2 envelope(JSON-RPC 2.0)を先に discriminate。
    // jsonrpc: '2.0' field を持つ message は新 path で処理し、handler が無い
    // method は Method not found error を返す。
    if (isV2Envelope(event.data)) {
      handleV2Message(event);
      return;
    }
    // 1. Quick filter: skip non-PKC messages silently(v1 path)
    if (!isPkcMessage(event.data)) return;

    const currentAllowed = resolveAllowedOrigins();
    const acceptAllOrigins =
      currentAllowed.length === 0 || currentAllowed.includes('*');

    // 2a. Origin `"null"` (file:// sender, sandboxed iframe, opaque
    //     origin) is rejected unless explicitly opt-in via
    //     `allowedOrigins: [..., 'null']`. Per
    //     `docs/spec/record-offer-capture-profile.md` §9.2, `"null"`
    //     must not ride on the accept-all path — requiring an explicit
    //     list membership keeps the file:// / sandboxed-iframe opt-in
    //     auditable at the mount site.
    if (event.origin === 'null' && !currentAllowed.includes('null')) {
      onReject?.(event.data, `Origin rejected: null (explicit opt-in required)`);
      return;
    }

    // 2b. Origin allowlist check
    if (!acceptAllOrigins && !currentAllowed.includes(event.origin)) {
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
        // #795 A-1: pin the response to the origin the ping came from.
        (event.source as Window).postMessage(pong, pinTargetOrigin(event.origin));
      }
      return;
    }

    // pong is informational — pass to callback but don't auto-handle
    // All other types → delegate to callback
    if (onMessage && event.source) {
      onMessage(envelope, event.origin, event.source as Window);
    }
  }

  /**
   * PR-V15(2026-05-14、A3 minimum):JSON-RPC 2.0 envelope の処理。
   *
   * 現時点 v2.0 minimum で受け付ける method:
   *   - `pkc.heartbeat`(request → result echo / notification → noop)
   *
   * 未知 method は JSON-RPC 標準の Method not found(-32601)error response。
   * Notification 形(id 無し)は response を返さない(spec 通り)。
   */
  function handleV2Message(event: MessageEvent): void {
    const currentAllowed = resolveAllowedOrigins();
    const acceptAllOrigins =
      currentAllowed.length === 0 || currentAllowed.includes('*');
    if (event.origin === 'null' && !currentAllowed.includes('null')) {
      onReject?.(event.data, 'Origin rejected: null (explicit opt-in required)');
      return;
    }
    if (!acceptAllOrigins && !currentAllowed.includes(event.origin)) {
      onReject?.(event.data, `Origin rejected: ${event.origin}`);
      return;
    }
    const result = validateEnvelopeV2(event.data);
    if (!result.valid) {
      onReject?.(event.data, `v2 invalid: ${result.error.message}`);
      // Per JSON-RPC 2.0 §5.1、parse / shape error の id は不明なので null で返す
      if (event.source && typeof (event.source as Window).postMessage === 'function') {
        const resp = buildResponseError(null, result.error.code, result.error.message);
        // #795 A-1: pin every v2 response to the inbound origin.
        (event.source as Window).postMessage(resp, pinTargetOrigin(event.origin));
      }
      return;
    }
    const { envelope, form } = result;
    if (form === 'request') {
      const req = envelope as import('../../core/model/message-v2').MessageRequestV2;
      if (req.method === 'pkc.heartbeat') {
        const result = heartbeatHandler(req);
        if (event.source) {
          const resp = buildResponseSuccess(req.id, result);
          (event.source as Window).postMessage(resp, pinTargetOrigin(event.origin));
        }
        return;
      }
      // 未知 method:Method not found error
      if (event.source) {
        const resp = buildResponseError(
          req.id,
          JSON_RPC_ERROR_CODES.METHOD_NOT_FOUND,
          `Method not found: ${req.method}`,
        );
        (event.source as Window).postMessage(resp, pinTargetOrigin(event.origin));
      }
      return;
    }
    if (form === 'notification') {
      const note = envelope as import('../../core/model/message-v2').MessageNotificationV2;
      // notification 形:response 不要、heartbeat notification も無視(spec 通り)
      void note;
      return;
    }
    // response-success / response-error は v2 caller がいないので無視
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
      targetId: string | null,
      targetOrigin: string,
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
