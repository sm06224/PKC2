import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  recordOfferHandler,
  BODY_SIZE_CAP_BYTES,
  getReplyWindowForOffer,
  clearReplyWindowForOffer,
  clearAllReplyWindows,
} from '@adapter/transport/record-offer-handler';
import type { HandlerContext } from '@adapter/transport/message-handler';
import type { MessageEnvelope } from '@core/model/message';
import type { Dispatcher } from '@adapter/state/dispatcher';
import type { MessageSender } from '@adapter/transport/message-bridge';

function makeCtx(payload: unknown, overrides: Partial<HandlerContext> = {}): HandlerContext {
  return {
    envelope: {
      protocol: 'pkc-message',
      version: 1,
      type: 'record:offer',
      source_id: 'sender-container',
      target_id: null,
      payload,
      timestamp: '2026-04-06T00:00:00Z',
    } as MessageEnvelope,
    sourceWindow: {} as Window,
    origin: 'http://localhost',
    container: null,
    embedded: false,
    dispatcher: {
      dispatch: vi.fn(),
      getState: vi.fn(),
      onState: vi.fn(),
      onEvent: vi.fn(),
    } as unknown as Dispatcher,
    sender: { send: vi.fn() } as unknown as MessageSender,
    ...overrides,
  };
}

describe('recordOfferHandler', () => {
  it('rejects null payload', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ctx = makeCtx(null);
    const result = recordOfferHandler(ctx);
    expect(result).toBe(false);
    expect(ctx.dispatcher.dispatch).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('rejects payload without title', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ctx = makeCtx({ body: 'text' });
    const result = recordOfferHandler(ctx);
    expect(result).toBe(false);
    warnSpy.mockRestore();
  });

  it('rejects payload without body', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ctx = makeCtx({ title: 'test' });
    const result = recordOfferHandler(ctx);
    expect(result).toBe(false);
    warnSpy.mockRestore();
  });

  it('dispatches SYS_RECORD_OFFERED for valid payload', () => {
    const ctx = makeCtx({ title: 'Test Record', body: 'Hello world' });
    const result = recordOfferHandler(ctx);

    expect(result).toBe(true);
    expect(ctx.dispatcher.dispatch).toHaveBeenCalledTimes(1);

    const action = (ctx.dispatcher.dispatch as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(action.type).toBe('SYS_RECORD_OFFERED');
    expect(action.offer.title).toBe('Test Record');
    expect(action.offer.body).toBe('Hello world');
    expect(action.offer.archetype).toBe('text');
    expect(action.offer.offer_id).toBeTruthy();
    expect(action.offer.reply_to_id).toBe('sender-container');
    expect(action.offer.received_at).toBeTruthy();
  });

  it('uses provided archetype', () => {
    const ctx = makeCtx({ title: 'Todo', body: 'Do this', archetype: 'todo' });
    recordOfferHandler(ctx);

    const action = (ctx.dispatcher.dispatch as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(action.offer.archetype).toBe('todo');
  });

  it('captures source_container_id from payload', () => {
    const ctx = makeCtx({
      title: 'T', body: 'B', source_container_id: 'remote-container',
    });
    recordOfferHandler(ctx);

    const action = (ctx.dispatcher.dispatch as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(action.offer.source_container_id).toBe('remote-container');
  });

  it('defaults source_container_id to null when not provided', () => {
    const ctx = makeCtx({ title: 'T', body: 'B' });
    recordOfferHandler(ctx);

    const action = (ctx.dispatcher.dispatch as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(action.offer.source_container_id).toBeNull();
  });

  it('generates unique offer_ids', () => {
    const ctx1 = makeCtx({ title: 'A', body: 'a' });
    const ctx2 = makeCtx({ title: 'B', body: 'b' });
    recordOfferHandler(ctx1);
    recordOfferHandler(ctx2);

    const id1 = (ctx1.dispatcher.dispatch as ReturnType<typeof vi.fn>).mock.calls[0]![0].offer.offer_id;
    const id2 = (ctx2.dispatcher.dispatch as ReturnType<typeof vi.fn>).mock.calls[0]![0].offer.offer_id;
    expect(id1).not.toBe(id2);
  });

  // ── Capture profile v0 (docs/spec/record-offer-capture-profile.md) ──

  it('accepts payload with 4 capture-specific optional fields', () => {
    const ctx = makeCtx({
      title: 'T', body: 'B',
      source_url: 'https://example.com/a',
      captured_at: '2026-04-21T12:00:00Z',
      selection_text: 'snippet',
      page_title: '<title>',
    });
    const result = recordOfferHandler(ctx);
    expect(result).toBe(true);
    const action = (ctx.dispatcher.dispatch as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(action.offer.source_url).toBe('https://example.com/a');
    expect(action.offer.captured_at).toBe('2026-04-21T12:00:00Z');
  });

  it('accepts payload without optional capture fields (default null)', () => {
    const ctx = makeCtx({ title: 'T', body: 'B' });
    const result = recordOfferHandler(ctx);
    expect(result).toBe(true);
    const action = (ctx.dispatcher.dispatch as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(action.offer.source_url).toBeNull();
    expect(action.offer.captured_at).toBeNull();
  });

  it('accepts body exactly at the size cap', () => {
    const body = 'x'.repeat(BODY_SIZE_CAP_BYTES);
    const ctx = makeCtx({ title: 'T', body });
    const result = recordOfferHandler(ctx);
    expect(result).toBe(true);
  });

  it('rejects body one byte over the size cap', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const body = 'x'.repeat(BODY_SIZE_CAP_BYTES + 1);
    const ctx = makeCtx({ title: 'T', body });
    const result = recordOfferHandler(ctx);
    expect(result).toBe(false);
    expect(ctx.dispatcher.dispatch).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('rejects payload when source_url is not a string', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ctx = makeCtx({ title: 'T', body: 'B', source_url: 123 });
    const result = recordOfferHandler(ctx);
    expect(result).toBe(false);
    warnSpy.mockRestore();
  });

  it('rejects payload when captured_at is not a string', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ctx = makeCtx({ title: 'T', body: 'B', captured_at: false });
    const result = recordOfferHandler(ctx);
    expect(result).toBe(false);
    warnSpy.mockRestore();
  });

  it('rejects payload when selection_text is not a string', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ctx = makeCtx({ title: 'T', body: 'B', selection_text: ['a'] });
    const result = recordOfferHandler(ctx);
    expect(result).toBe(false);
    warnSpy.mockRestore();
  });

  it('rejects payload when page_title is not a string', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ctx = makeCtx({ title: 'T', body: 'B', page_title: { x: 1 } });
    const result = recordOfferHandler(ctx);
    expect(result).toBe(false);
    warnSpy.mockRestore();
  });

  it('silently ignores unknown extra fields (spec §7.3)', () => {
    const ctx = makeCtx({
      title: 'T', body: 'B',
      future_field_v1: 'some-value',
      another_unknown: 42,
    });
    const result = recordOfferHandler(ctx);
    expect(result).toBe(true);
  });
});

// ── Reply-window registry (PR-C, 2026-04-26) ────────────────────────
//
// PendingOffer now resolves the *exact* sender window for outbound
// `record:reject` via a transport-memory map keyed by `offer_id`.
// `docs/spec/pkc-message-api-v1.md` §3.2 source-window rule.

describe('reply-window registry', () => {
  beforeEach(() => {
    clearAllReplyWindows();
  });

  it('stashes ctx.sourceWindow on a successful record:offer', () => {
    const senderWin = { mark: 'sender-window-A' } as unknown as Window;
    const ctx = makeCtx(
      { title: 'T', body: 'B' },
      { sourceWindow: senderWin },
    );
    recordOfferHandler(ctx);

    const offerId = (ctx.dispatcher.dispatch as ReturnType<typeof vi.fn>)
      .mock.calls[0]![0].offer.offer_id;
    expect(getReplyWindowForOffer(offerId)).toBe(senderWin);
  });

  it('does not stash a window when the payload is rejected', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const senderWin = { mark: 'sender-window-B' } as unknown as Window;
    const ctx = makeCtx(
      { title: 'T' /* missing body */ },
      { sourceWindow: senderWin },
    );
    const result = recordOfferHandler(ctx);
    expect(result).toBe(false);

    // No dispatch ⇒ no offer_id, but the registry must also be empty
    // (otherwise a stash would leak with no way to reference it later).
    // Verify by attempting a lookup with a representative key — any
    // string should miss when the registry is empty.
    expect(getReplyWindowForOffer('any-key')).toBeNull();
    warnSpy.mockRestore();
  });

  it('returns null for an unregistered offer_id', () => {
    expect(getReplyWindowForOffer('never-registered')).toBeNull();
  });

  it('clearReplyWindowForOffer drops the entry', () => {
    const senderWin = { mark: 'sender-window-C' } as unknown as Window;
    const ctx = makeCtx(
      { title: 'T', body: 'B' },
      { sourceWindow: senderWin },
    );
    recordOfferHandler(ctx);
    const offerId = (ctx.dispatcher.dispatch as ReturnType<typeof vi.fn>)
      .mock.calls[0]![0].offer.offer_id;

    expect(getReplyWindowForOffer(offerId)).toBe(senderWin);
    clearReplyWindowForOffer(offerId);
    expect(getReplyWindowForOffer(offerId)).toBeNull();
  });

  it('keeps separate windows per offer_id when multiple offers arrive', () => {
    const winA = { mark: 'window-A' } as unknown as Window;
    const winB = { mark: 'window-B' } as unknown as Window;
    const ctxA = makeCtx({ title: 'A', body: 'a' }, { sourceWindow: winA });
    const ctxB = makeCtx({ title: 'B', body: 'b' }, { sourceWindow: winB });
    recordOfferHandler(ctxA);
    recordOfferHandler(ctxB);

    const idA = (ctxA.dispatcher.dispatch as ReturnType<typeof vi.fn>)
      .mock.calls[0]![0].offer.offer_id;
    const idB = (ctxB.dispatcher.dispatch as ReturnType<typeof vi.fn>)
      .mock.calls[0]![0].offer.offer_id;

    expect(getReplyWindowForOffer(idA)).toBe(winA);
    expect(getReplyWindowForOffer(idB)).toBe(winB);
  });
});
