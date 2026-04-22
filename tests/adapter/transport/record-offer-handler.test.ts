import { describe, it, expect, vi } from 'vitest';
import { recordOfferHandler, BODY_SIZE_CAP_BYTES } from '@adapter/transport/record-offer-handler';
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
