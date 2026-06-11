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
 * - origin verification is configurable and **fail-closed** (#795 A-3,
 *   2026-06-11): an empty / unspecified allowlist denies ALL origins
 *   (matching v1 spec §3.4's restrictive default, which the previous
 *   accept-all behaviour had drifted from). Accept-all must be opted
 *   in with the explicit `['*']` sentinel; the special `"null"` origin
 *   additionally requires explicit `'null'` membership (see
 *   `BridgeOptions.allowedOrigins` and
 *   `docs/spec/record-offer-capture-profile.md` §9.2).
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
import { isDebugEnabled } from '../../runtime/debug-flags';
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

/**
 * Unified traffic observation event (#795 B-1, design doc
 * `transport-hardening-and-observability-design-2026-06.md` §3).
 *
 * One event is emitted for EVERY bridge decision — the contract is
 * "if a postMessage ran (or a message was judged), `onTraffic` fired".
 * Blind spots closed by this seam: inbound ping (bridge-internal),
 * `target_id` mismatch silent drop, every outbound (pong / v2
 * responses / `sender.send`), and successful v2 round-trips.
 *
 * Payload is **never** included by default. `payloadPreview` (bounded
 * 256 chars, base64 / data-URI redacted) is attached only while
 * `?pkc-debug=transport` is active (spec § Observability).
 *
 * `rejectCode` values: envelope-validation failures reuse the existing
 * `RejectCode` enum (joined with `,` when multiple reasons were
 * collected); bridge-level decisions use the literal codes
 * `ORIGIN_REJECTED` / `TARGET_ID_MISMATCH` / `V2_INVALID_REQUEST` /
 * `METHOD_NOT_FOUND` / `UNSOLICITED_RESPONSE`.
 */
export interface TrafficEvent {
  direction: 'in' | 'out';
  protocol: 'v1' | 'v2' | 'foreign';
  verdict: 'accepted' | 'rejected' | 'dropped' | 'sent';
  /** v1: envelope.type / v2: method. Best-effort string for invalid data. */
  type: string;
  /** inbound: `event.origin` / outbound: the targetOrigin used. */
  origin: string;
  sourceId: string | null;
  targetId: string | null;
  rejectCode?: string;
  /** ISO 8601 capture time. */
  at: string;
  /** Only when `?pkc-debug=transport` (redacted, bounded). */
  payloadPreview?: string;
}

/** base64 風の長い run(asset データ等)を伏字にする(設計 doc §3 redaction)。 */
const BASE64_RUN = /[A-Za-z0-9+/=]{120,}/g;
const DATA_URI_RUN = /data:[^"'\s)]{40,}/g;
const PREVIEW_MAX = 256;

/**
 * Build the redacted, bounded payload preview for `TrafficEvent`
 * (#795 B-1). Exported for tests. Never throws.
 */
export function redactPayloadPreview(payload: unknown): string {
  let s: string;
  try {
    s = JSON.stringify(payload) ?? String(payload);
  } catch {
    return '[unserializable]';
  }
  const fullLen = s.length;
  s = s.replace(DATA_URI_RUN, '[redacted:data-uri]').replace(BASE64_RUN, '[redacted:base64]');
  if (s.length > PREVIEW_MAX) s = `${s.slice(0, PREVIEW_MAX)}…(${fullLen} chars)`;
  return s;
}

export interface BridgeOptions {
  /** Local container_id for target filtering and source tagging. */
  containerId: string;

  /**
   * Allowed origins. Accepts either a static array or a provider
   * function that returns the array on each message (PR-B 2026-04-26).
   *
   * Static array form — **fail-closed semantics**(#795 A-3、2026-06-11。
   * v1 spec §3.4 の restrictive default に実装を一致させる修正):
   *   - **Empty / unspecified = deny ALL origins**(従来の accept-all から
   *     変更。v1 spec §3.4 は v0 時点で「empty allowlist は受信全 reject」
   *     を確定済みで、実装側が乖離していた)。
   *   - Accept-all は明示 sentinel **`['*']`** のみ(その場合も `"null"`
   *     origin は別途 explicit opt-in が必要 — `allowedOrigins: ['*', 'null']`)。
   *   - Otherwise, only accept messages from listed origins.
   *
   * Provider form (`() => string[]`):
   *   - Resolved on **each inbound message**, so the host can rotate
   *     the allowlist at runtime (e.g. user-edited settings, env var
   *     refresh, dynamic registration of trusted Extension origins)
   *     without re-mounting the bridge.
   *   - The result follows the same semantics as the static array.
   *   - **If the provider throws, the result is treated as empty =
   *     deny-all(fail-closed、#795 A-3)**。`onReject` への audit signal
   *     は維持。accept-all へ倒したい deployment は provider 内で例外を
   *     握って `['*']` を返すこと(暗黙の fail-open は廃止)。
   *   - Returning `null` / `undefined` is normalised to `[]`(= deny-all)。
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

  /**
   * Unified traffic observation seam (#795 B-1). Called once per bridge
   * decision — see {@link TrafficEvent}. Default `undefined` = zero
   * overhead, fully backward compatible. Observer exceptions are
   * swallowed and MUST NOT affect protocol behaviour
   * (spec § Observability).
   */
  onTraffic?: (event: TrafficEvent) => void;
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
    onTraffic,
  } = options;

  // #795 B-1: payload preview は `?pkc-debug=transport` 時のみ(boot 安定
  // flag なので mount 時に 1 回評価)。既定 = メタデータのみ。
  const previewEnabled = onTraffic ? isDebugEnabled('transport') : false;

  /**
   * Emit one TrafficEvent. Observer exceptions are swallowed — the seam
   * must never affect protocol behaviour (spec § Observability #3).
   */
  function emitTraffic(
    ev: Omit<TrafficEvent, 'at' | 'payloadPreview'>,
    payload?: unknown,
  ): void {
    if (!onTraffic) return;
    try {
      const event: TrafficEvent = { ...ev, at: new Date().toISOString() };
      if (previewEnabled && payload !== undefined) {
        event.payloadPreview = redactPayloadPreview(payload);
      }
      onTraffic(event);
    } catch {
      /* observer must never break the bridge */
    }
  }

  /** Best-effort field extraction from unvalidated inbound data. */
  function peek(data: unknown): { type: string; sourceId: string | null; targetId: string | null } {
    const obj = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
    return {
      type: typeof obj.type === 'string' ? obj.type
        : typeof obj.method === 'string' ? obj.method : '(unknown)',
      sourceId: typeof obj.source_id === 'string' ? obj.source_id : null,
      targetId: typeof obj.target_id === 'string' ? obj.target_id : null,
    };
  }

  /**
   * Resolve `allowedOrigins` to a concrete `string[]`. With the static
   * array form this is a no-op; with the provider form we invoke it
   * per-message so dynamic config (settings UI, env reload, trusted-
   * Extension registry) flows through without remounting the bridge.
   *
   * **Fail-closed behavior**(#795 A-3): if the provider throws,
   * surface the error to `onReject` (audit trail) and return `[]` —
   * which now means **deny-all** (the `acceptAllOrigins` branch below
   * requires the explicit `['*']` sentinel). 設定読み込み失敗が
   * 「誰でも受理」に倒れる事故経路を塞ぐ。
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
    // #795 A-3(fail-closed): accept-all は明示 sentinel `['*']` のみ。
    // empty / unspecified は deny-all(v1 spec §3.4 の restrictive default)。
    const acceptAllOrigins = currentAllowed.includes('*');

    // 2a. Origin `"null"` (file:// sender, sandboxed iframe, opaque
    //     origin) is rejected unless explicitly opt-in via
    //     `allowedOrigins: [..., 'null']`. Per
    //     `docs/spec/record-offer-capture-profile.md` §9.2, `"null"`
    //     must not ride on the accept-all path — requiring an explicit
    //     list membership keeps the file:// / sandboxed-iframe opt-in
    //     auditable at the mount site.
    if (event.origin === 'null' && !currentAllowed.includes('null')) {
      onReject?.(event.data, `Origin rejected: null (explicit opt-in required)`);
      emitTraffic({ direction: 'in', protocol: 'v1', verdict: 'rejected', ...peek(event.data), origin: event.origin, rejectCode: 'ORIGIN_REJECTED' }, event.data);
      return;
    }

    // 2b. Origin allowlist check
    if (!acceptAllOrigins && !currentAllowed.includes(event.origin)) {
      onReject?.(event.data, `Origin rejected: ${event.origin}`);
      emitTraffic({ direction: 'in', protocol: 'v1', verdict: 'rejected', ...peek(event.data), origin: event.origin, rejectCode: 'ORIGIN_REJECTED' }, event.data);
      return;
    }

    // 3. Full validation
    const result = validateEnvelope(event.data);
    if (!result.valid) {
      const reason = formatRejectReasons(result.reasons);
      console.warn(`[PKC2] Message rejected: ${reason}`);
      onReject?.(event.data, reason);
      emitTraffic({
        direction: 'in', protocol: 'v1', verdict: 'rejected', ...peek(event.data), origin: event.origin,
        // spec §4.2: all collected reasons (B-2), joined into one code list.
        rejectCode: result.reasons.map((r) => r.code).join(','),
      }, event.data);
      return;
    }

    const envelope = result.envelope;

    // 4. Target filtering: if target_id is set, must match local
    if (envelope.target_id !== null && envelope.target_id !== containerId) {
      // Not for us, skip silently — but observable (#795 B-1 blind spot).
      emitTraffic({ direction: 'in', protocol: 'v1', verdict: 'dropped', type: envelope.type, origin: event.origin, sourceId: envelope.source_id, targetId: envelope.target_id, rejectCode: 'TARGET_ID_MISMATCH' }, envelope.payload);
      return;
    }

    // 5. Auto-handle ping/pong
    if (envelope.type === 'ping') {
      emitTraffic({ direction: 'in', protocol: 'v1', verdict: 'accepted', type: 'ping', origin: event.origin, sourceId: envelope.source_id, targetId: envelope.target_id }, envelope.payload);
      // Respond with pong carrying profile payload (if provider exists).
      if (event.source && typeof (event.source as Window).postMessage === 'function') {
        const payload = pongProfile ? pongProfile() : null;
        const pong = buildEnvelope(containerId, 'pong', payload, envelope.source_id);
        // #795 A-1: pin the response to the origin the ping came from.
        const to = pinTargetOrigin(event.origin);
        (event.source as Window).postMessage(pong, to);
        emitTraffic({ direction: 'out', protocol: 'v1', verdict: 'sent', type: 'pong', origin: to, sourceId: containerId, targetId: envelope.source_id }, payload);
      }
      return;
    }

    // pong is informational — pass to callback but don't auto-handle
    // All other types → delegate to callback
    if (onMessage && event.source) {
      emitTraffic({ direction: 'in', protocol: 'v1', verdict: 'accepted', type: envelope.type, origin: event.origin, sourceId: envelope.source_id, targetId: envelope.target_id }, envelope.payload);
      onMessage(envelope, event.origin, event.source as Window);
    } else {
      // No delegate registered (or sourceless event) — still observable.
      emitTraffic({ direction: 'in', protocol: 'v1', verdict: 'dropped', type: envelope.type, origin: event.origin, sourceId: envelope.source_id, targetId: envelope.target_id, rejectCode: 'NO_HANDLER' }, envelope.payload);
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
    // #795 A-3(fail-closed): v1 経路と同一の意味論(`['*']` sentinel のみ accept-all)。
    const acceptAllOrigins = currentAllowed.includes('*');
    if (event.origin === 'null' && !currentAllowed.includes('null')) {
      onReject?.(event.data, 'Origin rejected: null (explicit opt-in required)');
      emitTraffic({ direction: 'in', protocol: 'v2', verdict: 'rejected', ...peek(event.data), origin: event.origin, rejectCode: 'ORIGIN_REJECTED' }, event.data);
      return;
    }
    if (!acceptAllOrigins && !currentAllowed.includes(event.origin)) {
      onReject?.(event.data, `Origin rejected: ${event.origin}`);
      emitTraffic({ direction: 'in', protocol: 'v2', verdict: 'rejected', ...peek(event.data), origin: event.origin, rejectCode: 'ORIGIN_REJECTED' }, event.data);
      return;
    }
    const result = validateEnvelopeV2(event.data);
    if (!result.valid) {
      onReject?.(event.data, `v2 invalid: ${result.error.message}`);
      emitTraffic({ direction: 'in', protocol: 'v2', verdict: 'rejected', ...peek(event.data), origin: event.origin, rejectCode: 'V2_INVALID_REQUEST' }, event.data);
      // Per JSON-RPC 2.0 §5.1、parse / shape error の id は不明なので null で返す
      if (event.source && typeof (event.source as Window).postMessage === 'function') {
        const resp = buildResponseError(null, result.error.code, result.error.message);
        // #795 A-1: pin every v2 response to the inbound origin.
        const to = pinTargetOrigin(event.origin);
        (event.source as Window).postMessage(resp, to);
        emitTraffic({ direction: 'out', protocol: 'v2', verdict: 'sent', type: '(error-response)', origin: to, sourceId: containerId, targetId: null }, resp.error);
      }
      return;
    }
    const { envelope, form } = result;
    if (form === 'request') {
      const req = envelope as import('../../core/model/message-v2').MessageRequestV2;
      if (req.method === 'pkc.heartbeat') {
        emitTraffic({ direction: 'in', protocol: 'v2', verdict: 'accepted', type: req.method, origin: event.origin, sourceId: null, targetId: null }, req.params);
        const result = heartbeatHandler(req);
        if (event.source) {
          const resp = buildResponseSuccess(req.id, result);
          const to = pinTargetOrigin(event.origin);
          (event.source as Window).postMessage(resp, to);
          emitTraffic({ direction: 'out', protocol: 'v2', verdict: 'sent', type: req.method, origin: to, sourceId: containerId, targetId: null }, result);
        }
        return;
      }
      // 未知 method:Method not found error
      emitTraffic({ direction: 'in', protocol: 'v2', verdict: 'rejected', type: req.method, origin: event.origin, sourceId: null, targetId: null, rejectCode: 'METHOD_NOT_FOUND' }, req.params);
      if (event.source) {
        const resp = buildResponseError(
          req.id,
          JSON_RPC_ERROR_CODES.METHOD_NOT_FOUND,
          `Method not found: ${req.method}`,
        );
        const to = pinTargetOrigin(event.origin);
        (event.source as Window).postMessage(resp, to);
        emitTraffic({ direction: 'out', protocol: 'v2', verdict: 'sent', type: req.method, origin: to, sourceId: containerId, targetId: null }, resp.error);
      }
      return;
    }
    if (form === 'notification') {
      const note = envelope as import('../../core/model/message-v2').MessageNotificationV2;
      // notification 形:response 不要、heartbeat notification も無視(spec 通り)
      emitTraffic({ direction: 'in', protocol: 'v2', verdict: 'accepted', type: note.method, origin: event.origin, sourceId: null, targetId: null }, note.params);
      return;
    }
    // response-success / response-error は v2 caller がいないので無視 —
    // ただし traffic としては観測する(#795 B-1)。
    emitTraffic({ direction: 'in', protocol: 'v2', verdict: 'dropped', type: '(response)', origin: event.origin, sourceId: null, targetId: null, rejectCode: 'UNSOLICITED_RESPONSE' }, event.data);
  }

  window.addEventListener('message', handleMessage);

  // #795 B-1: thread the emit hook so every sender.send (export:result /
  // record:reject / future callers) is observable.
  const sender = createSender(containerId, emitTraffic);

  return {
    destroy: () => {
      window.removeEventListener('message', handleMessage);
    },
    sender,
  };
}

// ── Sender ────────────────────────

function createSender(
  containerId: string,
  emitTraffic?: (
    ev: Omit<TrafficEvent, 'at' | 'payloadPreview'>,
    payload?: unknown,
  ) => void,
): MessageSender {
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
      emitTraffic?.({ direction: 'out', protocol: 'v1', verdict: 'sent', type, origin: targetOrigin, sourceId: containerId, targetId }, payload);
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
