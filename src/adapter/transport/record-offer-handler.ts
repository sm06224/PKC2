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
 */

import type { HandlerContext, MessageHandler } from './message-handler';
import type { ArchetypeId } from '../../core/model/record';

// ── Payload types ────────────────────────

/**
 * Payload for record:offer messages.
 * Minimal record representation for cross-container transfer.
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
}

// ── Validation ────────────────────────

function validateOfferPayload(payload: unknown): RecordOfferPayload | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.title !== 'string' || typeof p.body !== 'string') return null;
  return {
    title: p.title,
    body: p.body,
    archetype: (typeof p.archetype === 'string' ? p.archetype : 'text') as ArchetypeId,
    source_container_id: typeof p.source_container_id === 'string' ? p.source_container_id : undefined,
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
  };

  ctx.dispatcher.dispatch({ type: 'SYS_RECORD_OFFERED', offer });
  return true;
};
