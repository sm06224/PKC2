// @vitest-environment happy-dom
/**
 * SR-14(#806): record:offer に mime_type / filename(出典メタ、v1 additive)。
 * spec capture-profile §8.8 が正。consent 非依存の純メタとして先行導入。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  recordOfferHandler,
  clearAllReplyWindows,
  type PendingOffer,
} from '@adapter/transport/record-offer-handler';
import type { HandlerContext } from '@adapter/transport/message-handler';
import type { MessageSender } from '@adapter/transport/message-bridge';
import type { MessageEnvelope } from '@core/model/message';
import type { Container } from '@core/model/container';
import type { Dispatcher } from '@adapter/state/dispatcher';
import { createDispatcher } from '@adapter/state/dispatcher';

const mockContainer: Container = {
  meta: { container_id: 'sr14', title: 'T', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', schema_version: 1 },
  entries: [],
  relations: [],
  revisions: [],
  assets: {},
};

function ctxWith(payload: unknown): HandlerContext & { dispatchMock: ReturnType<typeof vi.fn> } {
  const dispatchMock = vi.fn();
  const envelope: MessageEnvelope = {
    protocol: 'pkc-message', version: 1, type: 'record:offer',
    source_id: 's', target_id: null, payload, timestamp: '2026-06-12T00:00:00Z',
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

afterEach(() => clearAllReplyWindows());

describe('SR-14 validation + threading', () => {
  it('mime_type / filename(string)は PendingOffer に保持される', () => {
    const ctx = ctxWith({ title: 'T', body: 'B', mime_type: 'application/pdf', filename: 'report.pdf' });
    expect(recordOfferHandler(ctx)).toBe(true);
    const offer = ctx.dispatchMock.mock.calls[0]![0].offer as PendingOffer;
    expect(offer.mime_type).toBe('application/pdf');
    expect(offer.filename).toBe('report.pdf');
  });

  it('非 string の mime_type / filename は payload 全体 reject', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(recordOfferHandler(ctxWith({ title: 'T', body: 'B', mime_type: 7 }))).toBe(false);
    expect(recordOfferHandler(ctxWith({ title: 'T', body: 'B', filename: {} }))).toBe(false);
    warn.mockRestore();
  });

  it('未指定の旧 sender は従来どおり(null)', () => {
    const ctx = ctxWith({ title: 'T', body: 'B' });
    expect(recordOfferHandler(ctx)).toBe(true);
    const offer = ctx.dispatchMock.mock.calls[0]![0].offer as PendingOffer;
    expect(offer.mime_type).toBeNull();
    expect(offer.filename).toBeNull();
  });
});

describe('SR-14 accept 時の frontmatter 注入(§8.8)', () => {
  function acceptWith(extra: Record<string, unknown>): string {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: mockContainer });
    d.dispatch({
      type: 'SYS_RECORD_OFFERED',
      offer: {
        offer_id: 'o-sr14', title: 'Doc', body: 'plain body', archetype: 'text',
        source_container_id: null, reply_to_id: null, received_at: '2026-06-12T00:00:00Z',
        ...extra,
      },
    });
    d.dispatch({ type: 'ACCEPT_OFFER', offer_id: 'o-sr14' });
    return d.getState().container!.entries.find((e) => e.title === 'Doc')!.body;
  }

  it('mime_type / filename 単独でも frontmatter 生成 trigger になる', () => {
    const body = acceptWith({ mime_type: 'application/pdf', filename: 'report.pdf' });
    expect(body.startsWith('---')).toBe(true);
    expect(body).toContain('mime_type: application/pdf');
    expect(body).toContain('filename: report.pdf');
    expect(body).toContain('plain body');
  });

  it('日本語 filename は YAML quote される', () => {
    const body = acceptWith({ filename: '請求書 2026.pdf' });
    expect(body).toContain('filename: "請求書 2026.pdf"');
  });

  it('sender 自前 frontmatter の body には手出ししない(§8.6.3)', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: mockContainer });
    d.dispatch({
      type: 'SYS_RECORD_OFFERED',
      offer: {
        offer_id: 'o-fm', title: 'Pre', body: '---\nkind: document\n---\nbody', archetype: 'text',
        source_container_id: null, reply_to_id: null, received_at: '2026-06-12T00:00:00Z',
        mime_type: 'application/pdf',
      },
    });
    d.dispatch({ type: 'ACCEPT_OFFER', offer_id: 'o-fm' });
    const body = d.getState().container!.entries.find((e) => e.title === 'Pre')!.body;
    expect(body).not.toContain('mime_type:');
    expect(body).toContain('kind: document');
  });

  it('SR-14 無しの旧 offer は frontmatter を作らない(従来挙動)', () => {
    const body = acceptWith({});
    expect(body.startsWith('---')).toBe(false);
  });
});
