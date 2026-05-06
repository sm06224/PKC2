/**
 * record:offer payload の author / brand 受け入れテスト(PR-JJ).
 *
 * 2026-05-06 user 修正指示2「Amazon 商品名 + メーカー / 著者 抽出」
 * の v1.1 spec additive 対応。bookmarklet が #productTitle /
 * #bylineInfo から拾った値を payload.author / payload.brand に乗せ
 * て送ってきたら、host 側は受理して PendingOffer に複写し、ACCEPT
 * 時に frontmatter へ注入する。型 mismatch は payload reject。
 */
import { describe, it, expect, vi } from 'vitest';
import {
  recordOfferHandler,
} from '@adapter/transport/record-offer-handler';
import type { HandlerContext } from '@adapter/transport/message-handler';
import type { MessageEnvelope } from '@core/model/message';
import type { Dispatcher } from '@adapter/state/dispatcher';
import type { MessageSender } from '@adapter/transport/message-bridge';

function makeCtx(payload: unknown): HandlerContext {
  return {
    envelope: {
      protocol: 'pkc-message',
      version: 1,
      type: 'record:offer',
      source_id: 'amazon-bookmarklet@1.1',
      target_id: null,
      payload,
      timestamp: '2026-05-06T00:00:00Z',
    } as MessageEnvelope,
    sourceWindow: {} as Window,
    origin: 'https://amazon.co.jp',
    container: null,
    embedded: false,
    dispatcher: {
      dispatch: vi.fn(),
      getState: vi.fn(),
      onState: vi.fn(),
      onEvent: vi.fn(),
    } as unknown as Dispatcher,
    sender: { send: vi.fn() } as unknown as MessageSender,
  };
}

describe('PR-JJ: record:offer author / brand additive', () => {
  it('forwards `author` field for kind:book Amazon offer', () => {
    const ctx = makeCtx({
      title: '異世界転生記',
      body: '# 異世界転生記',
      kind: 'book',
      provider: 'Amazon',
      author: '山田太郎',
    });
    const ok = recordOfferHandler(ctx);
    expect(ok).toBe(true);
    const action = (ctx.dispatcher.dispatch as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(action.type).toBe('SYS_RECORD_OFFERED');
    expect(action.offer.author).toBe('山田太郎');
    expect(action.offer.brand).toBeNull();
  });

  it('forwards `brand` field for non-book Amazon offer (kind omitted)', () => {
    const ctx = makeCtx({
      title: 'ロジクール マウス',
      body: '# ロジクール マウス',
      provider: 'Amazon',
      brand: 'Logicool',
    });
    const ok = recordOfferHandler(ctx);
    expect(ok).toBe(true);
    const action = (ctx.dispatcher.dispatch as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(action.offer.brand).toBe('Logicool');
    expect(action.offer.author).toBeNull();
  });

  it('rejects payload when author is non-string (type mismatch)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ctx = makeCtx({
      title: 'Foo',
      body: 'bar',
      author: 123, // wrong type
    });
    expect(recordOfferHandler(ctx)).toBe(false);
    expect(ctx.dispatcher.dispatch).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('rejects payload when brand is non-string', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ctx = makeCtx({
      title: 'Foo',
      body: 'bar',
      brand: { value: 'wrong shape' },
    });
    expect(recordOfferHandler(ctx)).toBe(false);
    warnSpy.mockRestore();
  });

  it('legacy payload without author/brand still accepted (backward compat)', () => {
    const ctx = makeCtx({
      title: 'Old',
      body: 'old',
    });
    const ok = recordOfferHandler(ctx);
    expect(ok).toBe(true);
    const action = (ctx.dispatcher.dispatch as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(action.offer.author).toBeNull();
    expect(action.offer.brand).toBeNull();
  });
});
