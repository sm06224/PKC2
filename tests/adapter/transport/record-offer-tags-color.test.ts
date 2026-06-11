// @vitest-environment happy-dom
/**
 * #805: record:offer に tags / color_tag を additive(PR-U 同型)。
 * spec capture-profile §8.7 が正。validation 境界 + 同意ゲート + mint 付与。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  recordOfferHandler,
  clearAllReplyWindows,
  MAX_OFFER_TAGS,
  MAX_OFFER_TAG_LENGTH,
  type PendingOffer,
} from '@adapter/transport/record-offer-handler';
import type { HandlerContext } from '@adapter/transport/message-handler';
import type { MessageSender } from '@adapter/transport/message-bridge';
import type { MessageEnvelope } from '@core/model/message';
import type { Container } from '@core/model/container';
import type { Dispatcher } from '@adapter/state/dispatcher';
import { createDispatcher } from '@adapter/state/dispatcher';

const mockContainer: Container = {
  meta: { container_id: 'tc', title: 'T', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', schema_version: 1 },
  entries: [],
  relations: [],
  revisions: [],
  assets: {},
};

function ctxWith(payload: unknown): HandlerContext & { dispatchMock: ReturnType<typeof vi.fn> } {
  const dispatchMock = vi.fn();
  const envelope: MessageEnvelope = {
    protocol: 'pkc-message', version: 1, type: 'record:offer',
    source_id: 's', target_id: null, payload, timestamp: '2026-06-11T00:00:00Z',
  };
  return {
    envelope,
    sourceWindow: {} as Window,
    origin: 'https://x.example',
    container: mockContainer,
    embedded: false,
    dispatcher: { dispatch: dispatchMock, getState: vi.fn(), onState: vi.fn(), onEvent: vi.fn() } as unknown as Dispatcher,
    sender: { send: vi.fn() } as unknown as MessageSender,
    dispatchMock,
  };
}

function offerFrom(ctx: { dispatchMock: ReturnType<typeof vi.fn> }): PendingOffer {
  return ctx.dispatchMock.mock.calls[0]![0].offer as PendingOffer;
}

afterEach(() => clearAllReplyWindows());

describe('#805 tags validation', () => {
  it('正規の tags を trim / 空除去 / 重複除去して保持', () => {
    const ctx = ctxWith({ title: 'T', body: 'B', tags: ['  a ', 'b', 'a', '', '  '] });
    expect(recordOfferHandler(ctx)).toBe(true);
    expect(offerFrom(ctx).tags).toEqual(['a', 'b']);
  });

  it(`件数 ${MAX_OFFER_TAGS} は受理、+1 は payload 全体 reject`, () => {
    const ok = ctxWith({ title: 'T', body: 'B', tags: Array.from({ length: MAX_OFFER_TAGS }, (_, i) => `t${i}`) });
    expect(recordOfferHandler(ok)).toBe(true);

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const over = ctxWith({ title: 'T', body: 'B', tags: Array.from({ length: MAX_OFFER_TAGS + 1 }, (_, i) => `t${i}`) });
    expect(recordOfferHandler(over)).toBe(false);
    expect(over.dispatchMock).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it(`要素長 ${MAX_OFFER_TAG_LENGTH} は受理、+1 は reject`, () => {
    const ok = ctxWith({ title: 'T', body: 'B', tags: ['x'.repeat(MAX_OFFER_TAG_LENGTH)] });
    expect(recordOfferHandler(ok)).toBe(true);

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const over = ctxWith({ title: 'T', body: 'B', tags: ['x'.repeat(MAX_OFFER_TAG_LENGTH + 1)] });
    expect(recordOfferHandler(over)).toBe(false);
    warn.mockRestore();
  });

  it('要素に非 string が混ざると reject', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ctx = ctxWith({ title: 'T', body: 'B', tags: ['a', 5] });
    expect(recordOfferHandler(ctx)).toBe(false);
    warn.mockRestore();
  });

  it('tags 非配列は reject', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(recordOfferHandler(ctxWith({ title: 'T', body: 'B', tags: 'a,b' }))).toBe(false);
    warn.mockRestore();
  });

  it('tags 無しは従来どおり(offer.tags = null)', () => {
    const ctx = ctxWith({ title: 'T', body: 'B' });
    expect(recordOfferHandler(ctx)).toBe(true);
    expect(offerFrom(ctx).tags).toBeNull();
  });
});

describe('#805 color_tag validation', () => {
  it('既知 palette ID は採用', () => {
    // 'red' は COLOR_TAG_IDS の一員(palette の基本色)。
    const ctx = ctxWith({ title: 'T', body: 'B', color_tag: 'red' });
    expect(recordOfferHandler(ctx)).toBe(true);
    expect(offerFrom(ctx).color_tag).toBe('red');
  });

  it('未知 ID は field のみ null 化(offer は生きる)', () => {
    const ctx = ctxWith({ title: 'T', body: 'B', color_tag: 'chartreuse-not-a-palette' });
    expect(recordOfferHandler(ctx)).toBe(true);
    expect(offerFrom(ctx).color_tag).toBeNull();
  });

  it('非 string の color_tag は payload 全体 reject', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(recordOfferHandler(ctxWith({ title: 'T', body: 'B', color_tag: 3 }))).toBe(false);
    warn.mockRestore();
  });
});

describe('#805 mint: ACCEPT_OFFER が tags / color_tag を付与', () => {
  function bootWithOffer(tags: string[] | null, color: string | null) {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: mockContainer });
    d.dispatch({
      type: 'SYS_RECORD_OFFERED',
      offer: {
        offer_id: 'o1', title: 'Tagged', body: 'B', archetype: 'text',
        source_container_id: null, reply_to_id: null, received_at: '2026-06-11T00:00:00Z',
        tags, color_tag: color,
      },
    });
    return d;
  }

  it('accept で entry に tags + color_tag が乗る', () => {
    const d = bootWithOffer(['alpha', 'beta'], 'red');
    d.dispatch({ type: 'ACCEPT_OFFER', offer_id: 'o1' });
    const entry = d.getState().container!.entries.find((e) => e.title === 'Tagged')!;
    expect(entry.tags).toEqual(['alpha', 'beta']);
    expect(entry.color_tag).toBe('red');
  });

  it('tags / color 無しの offer は field を付けない(従来挙動)', () => {
    const d = bootWithOffer(null, null);
    d.dispatch({ type: 'ACCEPT_OFFER', offer_id: 'o1' });
    const entry = d.getState().container!.entries.find((e) => e.title === 'Tagged')!;
    expect(entry.tags).toBeUndefined();
    expect(entry.color_tag).toBeUndefined();
  });
});
