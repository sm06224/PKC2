/**
 * Record offer message handler (inbound phase-1 only).
 *
 * Current wiring:
 * - Inbound `record:offer` is stored as an AppState.pendingOffer entry
 *   via dispatching the `SYS_RECORD_OFFERED` SystemCommand.
 * - When the user accepts the offer in the pending-offer UI, the
 *   internal `ACCEPT_OFFER` UserAction is dispatched (see
 *   action-binder.ts + app-state.ts reducer). This turns the pending
 *   offer into an Entry.
 *
 * Capture profile (v0):
 * - Payload accepts the optional fields `source_url`, `captured_at`,
 *   `selection_text`, `page_title` per
 *   `docs/spec/record-offer-capture-profile.md` §8.
 * - `source_url` and `captured_at` are threaded into PendingOffer so the
 *   reducer can inject a body header on accept (`> Source:` / `> Captured:`).
 * - `selection_text` and `page_title` are type-checked but otherwise
 *   discarded in v0 (spec §8.2).
 * - `body.length` over `BODY_SIZE_CAP_BYTES` (262144) is rejected
 *   (spec §9.3).
 *
 * Reply-window threading (PR-C, 2026-04-26):
 * - When a `record:offer` arrives, we stash `ctx.sourceWindow` in
 *   `replyWindowRegistry`, keyed by the freshly-minted `offer_id`.
 * - When the offer is later dismissed, `main.ts` looks up the registry
 *   to send `record:reject` back to the *exact* sender window. Without
 *   this, the previous code sent to `window.parent` — which in the
 *   standard "PKC2 hosts the companion iframe" deployment is PKC2's
 *   own parent (top-level), not the iframe child that originated the
 *   offer (`docs/spec/pkc-message-api-v1.md` §3.2 source-window rule).
 * - The registry holds a non-serializable `Window` object. It lives in
 *   transport memory only — never flows through the reducer / domain
 *   events / IDB / container JSON.
 *
 * Scope boundary (see
 * `docs/development/transport-record-accept-reject-consistency-review.md`):
 * - The informational `record:accept` outbound message defined in the
 *   spec is NOT wired in this module. `RecordAcceptPayload` below is
 *   kept for forward wire-up but has no current sender.
 * - The `record:reject` outbound message IS sent by `main.ts:391` when
 *   a pending offer is dismissed; it is not handled on the inbound
 *   side by this module.
 *
 * This module does NOT:
 * - Send `record:accept` / `record:reject` (outbound sender lives in
 *   main.ts for reject; accept is not yet wired)
 * - Implement merge import / correlation_id / archetype compatibility
 * - Implement capability negotiation
 * - Adjust origin allowlist defaults (separate follow-up PR)
 */

import type { HandlerContext, MessageHandler } from './message-handler';
import type { ArchetypeId } from '../../core/model/record';

// ── Constants ────────────────────────

/**
 * Hard cap on `body.length` (UTF-16 code units) for inbound `record:offer`
 * payloads. Per `docs/spec/record-offer-capture-profile.md` §9.3, v0 = 256 KiB.
 */
export const BODY_SIZE_CAP_BYTES = 262144;

// ── Payload types ────────────────────────

/**
 * Payload for record:offer messages.
 * Minimal record representation for cross-container transfer.
 *
 * Capture-specific optional fields (v0, spec §8.1):
 * - `source_url`: origin URL of the captured content. Threaded to
 *   PendingOffer for body header injection at accept time.
 * - `captured_at`: ISO 8601 timestamp when the content was captured.
 *   Threaded to PendingOffer for body header injection at accept time.
 * - `selection_text`: type-checked but discarded in v0.
 * - `page_title`: type-checked but discarded in v0.
 */
export interface RecordOfferPayload {
  /** Title of the offered record. */
  title: string;
  /** Body content. */
  body: string;
  /** Archetype of the record. Defaults to 'text' if omitted. */
  archetype?: ArchetypeId;
  /** Container ID of the sender (informational). */
  source_container_id?: string;
  /** Capture-specific (v0, spec §8.1): origin URL. */
  source_url?: string;
  /** Capture-specific (v0, spec §8.1): ISO 8601 capture timestamp. */
  captured_at?: string;
}

/**
 * Payload for record:accept messages (sent back to the offerer).
 */
export interface RecordAcceptPayload {
  /** The offer_id that was accepted. */
  offer_id: string;
  /** The LID assigned to the new entry in the receiving container. */
  assigned_lid: string;
}

// ── Pending Offer ────────────────────────

/**
 * PendingOffer: a record:offer waiting for user decision.
 * Stored in AppState (runtime only), never in Container.
 *
 * Capture-specific fields (v0, spec §10.4): `source_url` / `captured_at`
 * are read by the `ACCEPT_OFFER` reducer to inject a body header.
 */
export interface PendingOffer {
  /** Unique ID assigned at receipt time. */
  offer_id: string;
  /** Title of the offered record. */
  title: string;
  /** Body content. */
  body: string;
  /** Archetype. */
  archetype: ArchetypeId;
  /** Source container ID (informational). */
  source_container_id: string | null;
  /** Source envelope's source_id for reply targeting. */
  reply_to_id: string | null;
  /** Timestamp of receipt. */
  received_at: string;
  /** Capture-specific (v0): origin URL, used by ACCEPT_OFFER body header. */
  source_url?: string | null;
  /** Capture-specific (v0): ISO 8601 capture time, used by ACCEPT_OFFER body header. */
  captured_at?: string | null;
}

// ── Validation ────────────────────────

function validateOfferPayload(payload: unknown): RecordOfferPayload | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.title !== 'string' || typeof p.body !== 'string') return null;
  // Body size cap (spec §9.3).
  if (p.body.length > BODY_SIZE_CAP_BYTES) return null;
  // Capture-specific optional fields (spec §8.1 / §8.3): when present they
  // must be strings. Unknown extra fields are silently ignored (spec §7.3).
  if (p.source_url !== undefined && typeof p.source_url !== 'string') return null;
  if (p.captured_at !== undefined && typeof p.captured_at !== 'string') return null;
  if (p.selection_text !== undefined && typeof p.selection_text !== 'string') return null;
  if (p.page_title !== undefined && typeof p.page_title !== 'string') return null;
  return {
    title: p.title,
    body: p.body,
    archetype: (typeof p.archetype === 'string' ? p.archetype : 'text') as ArchetypeId,
    source_container_id: typeof p.source_container_id === 'string' ? p.source_container_id : undefined,
    source_url: typeof p.source_url === 'string' ? p.source_url : undefined,
    captured_at: typeof p.captured_at === 'string' ? p.captured_at : undefined,
    // selection_text / page_title intentionally omitted from result (spec §8.2).
  };
}

// ── Handlers ────────────────────────

let offerCounter = 0;
function generateOfferId(): string {
  offerCounter += 1;
  return `offer-${Date.now().toString(36)}-${offerCounter.toString(36)}`;
}

/**
 * Handler for record:offer.
 * Validates payload and dispatches SYS_RECORD_OFFERED to add to pending.
 */
export const recordOfferHandler: MessageHandler = (ctx: HandlerContext): boolean => {
  const payload = validateOfferPayload(ctx.envelope.payload);
  if (!payload) {
    console.warn('[PKC2] record:offer rejected: invalid payload');
    return false;
  }

  const offer: PendingOffer = {
    offer_id: generateOfferId(),
    title: payload.title,
    body: payload.body,
    archetype: payload.archetype ?? 'text',
    source_container_id: payload.source_container_id ?? null,
    reply_to_id: ctx.envelope.source_id,
    received_at: new Date().toISOString(),
    source_url: payload.source_url ?? null,
    captured_at: payload.captured_at ?? null,
  };

  // Stash the sender's window so a later `record:reject` (on dismiss)
  // can travel back to the exact origin. See module doc.
  setReplyWindowForOffer(offer.offer_id, ctx.sourceWindow);

  ctx.dispatcher.dispatch({ type: 'SYS_RECORD_OFFERED', offer });
  return true;
};

// ── Reply-window registry ────────────────────────

/**
 * Transport-memory map from `offer_id` → sender `Window`.
 *
 * Populated when a `record:offer` arrives (`recordOfferHandler` above).
 * Read by `main.ts` when dispatching the outbound `record:reject` so the
 * envelope reaches the *iframe that sent the offer*, not whoever happens
 * to be `window.parent` of the host. Cleared on either accept or
 * dismiss to bound memory growth.
 *
 * Why a side-table (not a `PendingOffer` field): a `Window` reference is
 * not serializable. Keeping it out of `PendingOffer` keeps every
 * downstream consumer (reducer, IDB persist, container JSON, domain
 * events) free of host-side handles.
 */
const replyWindowRegistry = new Map<string, Window>();

/** Register the sender window for a freshly-created offer. */
export function setReplyWindowForOffer(offerId: string, win: Window): void {
  replyWindowRegistry.set(offerId, win);
}

/** Look up the sender window for an offer, or `null` if unknown. */
export function getReplyWindowForOffer(offerId: string): Window | null {
  return replyWindowRegistry.get(offerId) ?? null;
}

/** Drop the registry entry for an offer (call on accept or dismiss). */
export function clearReplyWindowForOffer(offerId: string): void {
  replyWindowRegistry.delete(offerId);
}

/**
 * Drop every entry in the registry. Test-only helper so suites can
 * isolate themselves from earlier tests' offers.
 */
export function clearAllReplyWindows(): void {
  replyWindowRegistry.clear();
}
