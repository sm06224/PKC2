import { describe, it, expect, vi } from 'vitest';
import { createHandlerRegistry } from '@adapter/transport/message-handler';
import type { HandlerContext, MessageHandler } from '@adapter/transport/message-handler';
import type { MessageEnvelope } from '@core/model/message';
import type { Dispatcher } from '@adapter/state/dispatcher';
import type { MessageSender } from '@adapter/transport/message-bridge';

function makeCtx(type: MessageEnvelope['type'], overrides: Partial<HandlerContext> = {}): HandlerContext {
  return {
    envelope: {
      protocol: 'pkc-message',
      version: 1,
      type,
      source_id: 'sender',
      target_id: null,
      payload: null,
      timestamp: '2026-04-06T00:00:00Z',
    },
    sourceWindow: {} as Window,
    origin: 'http://localhost',
    container: null,
    embedded: false,
    dispatcher: { dispatch: vi.fn(), getState: vi.fn(), onState: vi.fn(), onEvent: vi.fn() } as unknown as Dispatcher,
    sender: { send: vi.fn() } as unknown as MessageSender,
    ...overrides,
  };
}

describe('MessageHandlerRegistry', () => {
  it('creates an empty registry', () => {
    const reg = createHandlerRegistry();
    expect(reg.has('custom')).toBe(false);
  });

  it('registers and retrieves a handler', () => {
    const reg = createHandlerRegistry();
    const handler: MessageHandler = vi.fn(() => true);

    reg.register('custom', handler);

    expect(reg.has('custom')).toBe(true);
  });

  it('routes to the registered handler', () => {
    const reg = createHandlerRegistry();
    const handler: MessageHandler = vi.fn(() => true);
    reg.register('custom', handler);

    const ctx = makeCtx('custom');
    const result = reg.route(ctx);

    expect(result).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(ctx);
  });

  it('returns false and warns for unregistered type', () => {
    const reg = createHandlerRegistry();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const ctx = makeCtx('navigate');
    const result = reg.route(ctx);

    expect(result).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith('[PKC2] No handler for message type "navigate"');
    warnSpy.mockRestore();
  });

  it('allows overwriting a handler with warning', () => {
    const reg = createHandlerRegistry();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const h1: MessageHandler = vi.fn(() => true);
    const h2: MessageHandler = vi.fn(() => true);

    reg.register('custom', h1);
    reg.register('custom', h2);

    expect(warnSpy).toHaveBeenCalledWith('[PKC2] Handler for "custom" overwritten');

    const ctx = makeCtx('custom');
    reg.route(ctx);

    expect(h1).not.toHaveBeenCalled();
    expect(h2).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });

  it('handler receives full context including dispatcher', () => {
    const reg = createHandlerRegistry();
    const mockDispatcher = { dispatch: vi.fn(), getState: vi.fn(), onState: vi.fn(), onEvent: vi.fn() } as unknown as Dispatcher;

    const handler: MessageHandler = vi.fn((ctx) => {
      ctx.dispatcher.dispatch({ type: 'SYS_ERROR', error: 'test' });
      return true;
    });
    reg.register('custom', handler);

    const ctx = makeCtx('custom', { dispatcher: mockDispatcher });
    reg.route(ctx);

    expect(mockDispatcher.dispatch).toHaveBeenCalledWith({ type: 'SYS_ERROR', error: 'test' });
  });

  it('multiple handlers for different types coexist', () => {
    const reg = createHandlerRegistry();
    const h1: MessageHandler = vi.fn(() => true);
    const h2: MessageHandler = vi.fn(() => true);

    reg.register('export:request', h1);
    reg.register('navigate', h2);

    reg.route(makeCtx('export:request'));
    reg.route(makeCtx('navigate'));

    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);
  });

  it('handler returning false indicates rejection', () => {
    const reg = createHandlerRegistry();
    const handler: MessageHandler = vi.fn(() => false);
    reg.register('custom', handler);

    const result = reg.route(makeCtx('custom'));

    expect(result).toBe(false);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
