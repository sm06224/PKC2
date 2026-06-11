// @vitest-environment happy-dom
/**
 * #804: correlation_id + record:ack / record:accept wire-up のテスト。
 * spec v1 §4.1(correlation_id field)/ §7.2.5(record:ack)/
 * §7.3(record:accept wired)/ §7.4(reject への echo)が正。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  recordOfferHandler,
  getReplyTargetForOffer,
  clearAllReplyWindows,
  type RecordAckPayload,
} from '@adapter/transport/record-offer-handler';
import type { HandlerContext } from '@adapter/transport/message-handler';
import type { MessageSender } from '@adapter/transport/message-bridge';
import type { MessageEnvelope } from '@core/model/message';
import type { Container } from '@core/model/container';
import type { Dispatcher } from '@adapter/state/dispatcher';
import { createDispatcher } from '@adapter/state/dispatcher';
import type { DomainEvent } from '@core/action/domain-event';

const mockContainer: Container = {
  meta: {
    container_id: 'corr-test',
    title: 'T',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    schema_version: 1,
  },
  entries: [],
  relations: [],
  revisions: [],
  assets: {},
};

function makeOfferEnvelope(over: Partial<MessageEnvelope> = {}): MessageEnvelope {
  return {
    protocol: 'pkc-message',
    version: 1,
    type: 'record:offer',
    source_id: 'sender-1',
    target_id: null,
    payload: { title: 'T', body: 'B' },
    timestamp: '2026-06-11T00:00:00Z',
    ...over,
  };
}

function makeCtx(envelope: MessageEnvelope): HandlerContext & { sendMock: ReturnType<typeof vi.fn> } {
  const sendMock = vi.fn();
  return {
    envelope,
    sourceWindow: {} as Window,
    origin: 'https://offerer.example',
    container: mockContainer,
    embedded: false,
    dispatcher: { dispatch: vi.fn(), getState: vi.fn(), onState: vi.fn(), onEvent: vi.fn() } as unknown as Dispatcher,
    sender: { send: sendMock } as unknown as MessageSender,
    sendMock,
  };
}

afterEach(() => {
  clearAllReplyWindows();
});

describe('#804 record:ack(到達確認)', () => {
  it('validation pass 後に ack を送る(offer_id + correlation_id echo、pinned origin)', () => {
    const ctx = makeCtx(makeOfferEnvelope({ correlation_id: 'corr-abc' }));
    expect(recordOfferHandler(ctx)).toBe(true);

    expect(ctx.sendMock).toHaveBeenCalledTimes(1);
    const [win, type, payload, targetId, targetOrigin] = ctx.sendMock.mock.calls[0]!;
    expect(win).toBe(ctx.sourceWindow);
    expect(type).toBe('record:ack');
    const ack = payload as RecordAckPayload;
    expect(ack.correlation_id).toBe('corr-abc');
    expect(ack.offer_id).toMatch(/^offer-/);
    expect(targetId).toBe('sender-1');
    expect(targetOrigin).toBe('https://offerer.example'); // #797 pin

    // PendingOffer 側も correlation_id を保持(dispatch された offer)。
    const dispatched = (ctx.dispatcher.dispatch as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(dispatched.offer.correlation_id).toBe('corr-abc');
    expect(dispatched.offer.offer_id).toBe(ack.offer_id);
  });

  it('correlation_id 無しの旧 sender でも ack は送られる(echo は null)', () => {
    const ctx = makeCtx(makeOfferEnvelope());
    recordOfferHandler(ctx);
    const ack = ctx.sendMock.mock.calls[0]![2] as RecordAckPayload;
    expect(ack.correlation_id).toBeNull();
  });

  it('string 以外の correlation_id は absent 扱い(null)', () => {
    const ctx = makeCtx(makeOfferEnvelope({ correlation_id: 42 as unknown as string }));
    recordOfferHandler(ctx);
    const ack = ctx.sendMock.mock.calls[0]![2] as RecordAckPayload;
    expect(ack.correlation_id).toBeNull();
  });

  it('invalid payload(reject)では ack を送らない', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ctx = makeCtx(makeOfferEnvelope({ payload: { title: 42, body: 'B' } }));
    expect(recordOfferHandler(ctx)).toBe(false);
    expect(ctx.sendMock).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("opaque origin('null')の ack は targetOrigin '*' にフォールバック", () => {
    const ctx = makeCtx(makeOfferEnvelope());
    (ctx as { origin: string }).origin = 'null';
    recordOfferHandler(ctx);
    expect(ctx.sendMock.mock.calls[0]![4]).toBe('*');
  });

  it('reply registry には window + origin が stash される(accept/reject の宛先)', () => {
    const ctx = makeCtx(makeOfferEnvelope({ correlation_id: 'c1' }));
    recordOfferHandler(ctx);
    const dispatched = (ctx.dispatcher.dispatch as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    const target = getReplyTargetForOffer(dispatched.offer.offer_id);
    expect(target?.win).toBe(ctx.sourceWindow);
    expect(target?.origin).toBe('https://offerer.example');
  });
});

describe('#804 reducer events が相関 field を carry する', () => {
  function bootWithOffer(correlationId: string | null) {
    const d = createDispatcher();
    const events: DomainEvent[] = [];
    const offEvents = d.onEvent((e) => events.push(e));
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: mockContainer });
    d.dispatch({
      type: 'SYS_RECORD_OFFERED',
      offer: {
        offer_id: 'offer-x1',
        title: 'T',
        body: 'B',
        archetype: 'text',
        source_container_id: null,
        reply_to_id: 'sender-1',
        received_at: '2026-06-11T00:00:00Z',
        correlation_id: correlationId,
      },
    });
    return { d, events, off: offEvents };
  }

  it('OFFER_ACCEPTED は reply_to_id + correlation_id を carry(record:accept 送出用)', () => {
    const { d, events, off } = bootWithOffer('corr-9');
    d.dispatch({ type: 'ACCEPT_OFFER', offer_id: 'offer-x1' });
    const accepted = events.find((e) => e.type === 'OFFER_ACCEPTED');
    expect(accepted).toMatchObject({
      offer_id: 'offer-x1',
      reply_to_id: 'sender-1',
      correlation_id: 'corr-9',
    });
    expect((accepted as { lid: string }).lid).toBeTruthy();
    off();
  });

  it('OFFER_DISMISSED は correlation_id を carry(record:reject echo 用)', () => {
    const { d, events, off } = bootWithOffer('corr-10');
    d.dispatch({ type: 'DISMISS_OFFER', offer_id: 'offer-x1' });
    const dismissed = events.find((e) => e.type === 'OFFER_DISMISSED');
    expect(dismissed).toMatchObject({
      offer_id: 'offer-x1',
      reply_to_id: 'sender-1',
      correlation_id: 'corr-10',
    });
    off();
  });

  it('correlation_id 無しの offer では null を carry(旧 sender 互換)', () => {
    const { d, events, off } = bootWithOffer(null);
    d.dispatch({ type: 'ACCEPT_OFFER', offer_id: 'offer-x1' });
    const accepted = events.find((e) => e.type === 'OFFER_ACCEPTED');
    expect((accepted as { correlation_id: string | null }).correlation_id).toBeNull();
    off();
  });
});
