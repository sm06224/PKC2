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
 * - `body.length` over `BODY_SIZE_CAP_UTF16_UNITS` (262144 UTF-16 code
 *   units — NOT bytes) is rejected (spec §9.3).
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
 * Correlation / ack / accept (#804, 2026-06-11):
 * - The sender MAY attach an envelope-level `correlation_id` (spec
 *   §4.1). It is stored on the `PendingOffer` and echoed back in every
 *   response payload so the sender can match multiple in-flight offers.
 * - `record:ack` is sent by THIS module immediately after the offer is
 *   validated and dispatched (`{ offer_id, correlation_id }`,
 *   targetOrigin pinned) — the sender learns the host-minted offer_id.
 * - `record:accept` / `record:reject` outbound senders live in main.ts
 *   (OFFER_ACCEPTED / OFFER_DISMISSED event wiring); accept is sent
 *   only when the reply registry still holds the exact sender window
 *   (no `window.parent` fallback — new path, spec §7.3).
 *
 * This module does NOT:
 * - Send `record:accept` / `record:reject` (outbound senders live in
 *   main.ts)
 * - Implement dedup on `(source_id, correlation_id)`(§11.6 のスコープ
 *   外残置 — 必要が実証されたら別途)
 * - Implement merge import / archetype compatibility
 * - Implement capability negotiation
 */

import type { HandlerContext, MessageHandler } from './message-handler';
import { pinTargetOrigin } from './message-bridge';
import type { ArchetypeId } from '../../core/model/record';

// ── Constants ────────────────────────

/**
 * Hard cap on `body.length` for inbound `record:offer` payloads, measured
 * in **UTF-16 code units — NOT bytes** (`String.prototype.length`). Per
 * `docs/spec/record-offer-capture-profile.md` §9.3. A non-ASCII body can
 * therefore exceed 262144 *bytes* while passing this cap (Japanese text
 * encodes ~3 bytes/unit in UTF-8). #795 A-2 renamed the constant from
 * `BODY_SIZE_CAP_BYTES` so the name matches what is actually measured;
 * the value and the check are unchanged (backward compatible — switching
 * to a byte measure would shrink the accepted range for existing senders
 * and needs an explicit user decision).
 */
export const BODY_SIZE_CAP_UTF16_UNITS = 262144;

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
  // ── PR-U v1.1 capture profile (2026-05-06) ─────────────────
  // PKC-Message v1.1 additive(spec §9.2 v1 内 additive、unknown field
  // は host 無視 §9.4)。後方互換維持:旧 sender はこれらを送らずに
  // 従来通り動作、新 sender が送ると host が structured Bases routing
  // に乗せる。詳細は `docs/spec/record-offer-capture-profile.md` §8.4。
  /** Bases subset hint(filer Auto 7 割多数決の判定材料、PR-G 参照)。 */
  kind?: 'video' | 'novel' | 'book' | 'audio' | 'image' | 'document';
  /** thumbnail URL or asset_key。 */
  thumbnail_url?: string;
  /** provider 表示名(`YouTube` / `カクヨム` 等、出典 badge)。 */
  provider?: string;
  /** video / audio の長さ(秒)。 */
  duration_sec?: number;
  /** book の page 数。 */
  pages?: number;
  /** book の ISBN(13 桁推奨)。 */
  isbn?: string;
  // ── PR-JJ Amazon scraper additive (2026-05-06) ─────────────
  // 書籍 / 漫画は author、それ以外の物販は brand を bookmarklet が
  // DOM から拾って frontmatter に注入する。両方とも optional /
  // unknown 互換、旧 sender / 旧 receiver は無視するだけ。
  /** 著者 / 作者(`kind: book` / `kind: novel` で意味を持つ)。 */
  author?: string;
  /** メーカー / ブランド(`kind: book` 以外の Amazon 商品で意味を持つ)。 */
  brand?: string;
}

/**
 * Payload for record:ack messages (#804 — sent back to the offerer
 * immediately after validation pass + SYS_RECORD_OFFERED dispatch).
 * Tells the sender "the offer arrived and is pending" + the host-minted
 * `offer_id` so later `record:accept` / `record:reject` can be matched.
 */
export interface RecordAckPayload {
  /** Host-minted ID for the pending offer. */
  offer_id: string;
  /** Echo of the sender's envelope-level correlation_id (null if absent). */
  correlation_id: string | null;
}

/**
 * Payload for record:accept messages (sent back to the offerer).
 */
export interface RecordAcceptPayload {
  /** The offer_id that was accepted. */
  offer_id: string;
  /** The LID assigned to the new entry in the receiving container. */
  assigned_lid: string;
  /** Echo of the sender's envelope-level correlation_id (#804、null if absent). */
  correlation_id?: string | null;
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
  // ── PR-U v1.1 additive (2026-05-06) ──
  /** Bases subset hint(filer Auto 判定材料、ACCEPT_OFFER で frontmatter に注入)。 */
  kind?: RecordOfferPayload['kind'] | null;
  /** thumbnail URL or asset_key。 */
  thumbnail_url?: string | null;
  /** provider 表示名。 */
  provider?: string | null;
  /** 任意の structured metadata。 */
  duration_sec?: number | null;
  pages?: number | null;
  isbn?: string | null;
  // ── PR-JJ additive (2026-05-06) ──
  /** 著者 / 作者(book / novel で意味を持つ)。 */
  author?: string | null;
  /** メーカー / ブランド(物販系 Amazon で意味を持つ)。 */
  brand?: string | null;
  // ── #804 additive ──
  /** Sender の envelope-level correlation_id(echo 用に保持、null = 無し)。 */
  correlation_id?: string | null;
}

// ── Validation ────────────────────────

function validateOfferPayload(payload: unknown): RecordOfferPayload | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.title !== 'string' || typeof p.body !== 'string') return null;
  // Body size cap (spec §9.3) — UTF-16 code units, not bytes.
  if (p.body.length > BODY_SIZE_CAP_UTF16_UNITS) return null;
  // Capture-specific optional fields (spec §8.1 / §8.3): when present they
  // must be strings. Unknown extra fields are silently ignored (spec §7.3).
  if (p.source_url !== undefined && typeof p.source_url !== 'string') return null;
  if (p.captured_at !== undefined && typeof p.captured_at !== 'string') return null;
  if (p.selection_text !== undefined && typeof p.selection_text !== 'string') return null;
  if (p.page_title !== undefined && typeof p.page_title !== 'string') return null;
  // PR-U v1.1 capture profile additive fields(spec §9.2、unknown は無視)。
  const kindAllowed = ['video', 'novel', 'book', 'audio', 'image', 'document'];
  if (p.kind !== undefined && (typeof p.kind !== 'string' || !kindAllowed.includes(p.kind))) return null;
  if (p.thumbnail_url !== undefined && typeof p.thumbnail_url !== 'string') return null;
  if (p.provider !== undefined && typeof p.provider !== 'string') return null;
  if (p.duration_sec !== undefined && typeof p.duration_sec !== 'number') return null;
  if (p.pages !== undefined && typeof p.pages !== 'number') return null;
  if (p.isbn !== undefined && typeof p.isbn !== 'string') return null;
  // PR-JJ additive
  if (p.author !== undefined && typeof p.author !== 'string') return null;
  if (p.brand !== undefined && typeof p.brand !== 'string') return null;
  return {
    title: p.title,
    body: p.body,
    archetype: (typeof p.archetype === 'string' ? p.archetype : 'text') as ArchetypeId,
    source_container_id: typeof p.source_container_id === 'string' ? p.source_container_id : undefined,
    source_url: typeof p.source_url === 'string' ? p.source_url : undefined,
    captured_at: typeof p.captured_at === 'string' ? p.captured_at : undefined,
    // selection_text / page_title intentionally omitted from result (spec §8.2).
    // PR-U v1.1 additive fields:
    kind: typeof p.kind === 'string' ? (p.kind as RecordOfferPayload['kind']) : undefined,
    thumbnail_url: typeof p.thumbnail_url === 'string' ? p.thumbnail_url : undefined,
    provider: typeof p.provider === 'string' ? p.provider : undefined,
    duration_sec: typeof p.duration_sec === 'number' ? p.duration_sec : undefined,
    pages: typeof p.pages === 'number' ? p.pages : undefined,
    isbn: typeof p.isbn === 'string' ? p.isbn : undefined,
    // PR-JJ additive
    author: typeof p.author === 'string' ? p.author : undefined,
    brand: typeof p.brand === 'string' ? p.brand : undefined,
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

  // #804: envelope-level correlation_id(optional)。string のみ採用、
  // それ以外は absent 扱い(spec §4.1 の寛容規則)。
  const correlationId =
    typeof ctx.envelope.correlation_id === 'string' ? ctx.envelope.correlation_id : null;

  const offer: PendingOffer = {
    offer_id: generateOfferId(),
    title: payload.title,
    body: payload.body,
    archetype: payload.archetype ?? 'text',
    source_container_id: payload.source_container_id ?? null,
    reply_to_id: ctx.envelope.source_id,
    received_at: new Date().toISOString(),
    correlation_id: correlationId,
    source_url: payload.source_url ?? null,
    captured_at: payload.captured_at ?? null,
    // PR-U v1.1 capture profile additive(2026-05-06)。
    kind: payload.kind ?? null,
    thumbnail_url: payload.thumbnail_url ?? null,
    provider: payload.provider ?? null,
    duration_sec: payload.duration_sec ?? null,
    pages: payload.pages ?? null,
    isbn: payload.isbn ?? null,
    // PR-JJ additive
    author: payload.author ?? null,
    brand: payload.brand ?? null,
  };

  // Stash the sender's window AND origin so a later `record:reject`
  // (on dismiss) can travel back to the exact window with its
  // targetOrigin pinned (#795 A-1). See module doc.
  setReplyWindowForOffer(offer.offer_id, ctx.sourceWindow, ctx.origin);

  ctx.dispatcher.dispatch({ type: 'SYS_RECORD_OFFERED', offer });

  // #804: record:ack — 受理(pending 化)した瞬間に host 採番の offer_id を
  // sender へ返す。以後の record:accept / record:reject と相関可能になる。
  // targetOrigin は #797 の規則どおり受信 origin にピン留め。
  const ackPayload: RecordAckPayload = {
    offer_id: offer.offer_id,
    correlation_id: correlationId,
  };
  ctx.sender.send(
    ctx.sourceWindow,
    'record:ack',
    ackPayload,
    ctx.envelope.source_id,
    pinTargetOrigin(ctx.origin),
  );
  return true;
};

// ── Reply-window registry ────────────────────────

/**
 * Reply target for a pending offer: the sender `Window` plus the
 * `event.origin` it arrived from (#795 A-1 — the origin is needed to
 * pin the outbound `record:reject` targetOrigin instead of `'*'`).
 */
export interface OfferReplyTarget {
  win: Window;
  origin: string;
}

/**
 * Transport-memory map from `offer_id` → sender `{ win, origin }`.
 *
 * Populated when a `record:offer` arrives (`recordOfferHandler` above).
 * Read by `main.ts` when dispatching the outbound `record:reject` so the
 * envelope reaches the *iframe that sent the offer*, not whoever happens
 * to be `window.parent` of the host — with its targetOrigin pinned to
 * the receive-time origin (#795 A-1). Cleared on either accept or
 * dismiss to bound memory growth.
 *
 * Why a side-table (not a `PendingOffer` field): a `Window` reference is
 * not serializable. Keeping it out of `PendingOffer` keeps every
 * downstream consumer (reducer, IDB persist, container JSON, domain
 * events) free of host-side handles.
 */
const replyWindowRegistry = new Map<string, OfferReplyTarget>();

/** Register the sender window + receive-time origin for a freshly-created offer. */
export function setReplyWindowForOffer(offerId: string, win: Window, origin: string): void {
  replyWindowRegistry.set(offerId, { win, origin });
}

/** Look up the sender window for an offer, or `null` if unknown. */
export function getReplyWindowForOffer(offerId: string): Window | null {
  return replyWindowRegistry.get(offerId)?.win ?? null;
}

/** Look up the full reply target (window + origin), or `null` if unknown. */
export function getReplyTargetForOffer(offerId: string): OfferReplyTarget | null {
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
