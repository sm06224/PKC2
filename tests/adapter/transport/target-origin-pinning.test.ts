// @vitest-environment happy-dom
/**
 * #795 A-1: outbound targetOrigin ピン留めの regression テスト。
 *
 * 受信時の `event.origin` に応答先を固定する(opaque origin `"null"` のみ
 * `'*'` フォールバック)。対象 4 経路:
 *   1. pong 自動応答(message-bridge)
 *   2. v2(JSON-RPC)応答 3 種: invalid / heartbeat result / method not found
 *   3. export:result(export-handler、container 全文 payload)
 *   4. record:reject(reply-window registry が origin を保持)
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  mountMessageBridge,
  pinTargetOrigin,
} from '@adapter/transport/message-bridge';
import { exportRequestHandler } from '@adapter/transport/export-handler';
import {
  recordOfferHandler,
  setReplyWindowForOffer,
  getReplyTargetForOffer,
  getReplyWindowForOffer,
  clearAllReplyWindows,
} from '@adapter/transport/record-offer-handler';
import type { HandlerContext } from '@adapter/transport/message-handler';
import type { MessageSender } from '@adapter/transport/message-bridge';
import type { Dispatcher } from '@adapter/state/dispatcher';
import type { Container } from '@core/model/container';
import { SLOT } from '@runtime/contract';

const CONTAINER_ID = 'pin-test-container';

function createMessageEvent(data: unknown, origin: string): MessageEvent {
  return new MessageEvent('message', { data, origin, source: window });
}

function validPing() {
  return {
    protocol: 'pkc-message',
    version: 1,
    type: 'ping',
    source_id: 'remote-container',
    target_id: null,
    payload: null,
    timestamp: '2026-06-10T00:00:00Z',
  };
}

describe('pinTargetOrigin', () => {
  it('returns the origin unchanged for a real origin', () => {
    expect(pinTargetOrigin('https://sender.example')).toBe('https://sender.example');
  });

  it("falls back to '*' for the opaque origin 'null'", () => {
    expect(pinTargetOrigin('null')).toBe('*');
  });

  it("falls back to '*' for an empty origin", () => {
    expect(pinTargetOrigin('')).toBe('*');
  });
});

describe('bridge responses pin targetOrigin to event.origin', () => {
  let handle: ReturnType<typeof mountMessageBridge> | null = null;

  afterEach(() => {
    handle?.destroy();
    handle = null;
  });

  it('pong is sent with the ping origin (not *)', () => {
    handle = mountMessageBridge({ containerId: CONTAINER_ID, allowedOrigins: ['*'] });
    // happy-dom は targetOrigin 不一致の postMessage を SecurityError に
    // するため、引数検証のみ行う(配達はしない)。
    const spy = vi.spyOn(window, 'postMessage').mockImplementation(() => {});

    window.dispatchEvent(createMessageEvent(validPing(), 'https://sender.example'));

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]![1]).toBe('https://sender.example');
    spy.mockRestore();
  });

  it("pong falls back to '*' for opaque origin 'null' (explicit opt-in)", () => {
    handle = mountMessageBridge({
      containerId: CONTAINER_ID,
      allowedOrigins: ['null'],
    });
    // happy-dom は targetOrigin 不一致の postMessage を SecurityError に
    // するため、引数検証のみ行う(配達はしない)。
    const spy = vi.spyOn(window, 'postMessage').mockImplementation(() => {});

    window.dispatchEvent(createMessageEvent(validPing(), 'null'));

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]![1]).toBe('*');
    spy.mockRestore();
  });

  it('v2 heartbeat response is pinned to the request origin', () => {
    handle = mountMessageBridge({ containerId: CONTAINER_ID, allowedOrigins: ['*'] });
    // happy-dom は targetOrigin 不一致の postMessage を SecurityError に
    // するため、引数検証のみ行う(配達はしない)。
    const spy = vi.spyOn(window, 'postMessage').mockImplementation(() => {});

    window.dispatchEvent(createMessageEvent(
      { jsonrpc: '2.0', method: 'pkc.heartbeat', id: 1, params: {} },
      'https://v2-sender.example',
    ));

    expect(spy).toHaveBeenCalledTimes(1);
    const [resp, targetOrigin] = spy.mock.calls[0]!;
    expect((resp as { id: number }).id).toBe(1);
    expect(targetOrigin).toBe('https://v2-sender.example');
    spy.mockRestore();
  });

  it('v2 method-not-found error is pinned to the request origin', () => {
    handle = mountMessageBridge({ containerId: CONTAINER_ID, allowedOrigins: ['*'] });
    // happy-dom は targetOrigin 不一致の postMessage を SecurityError に
    // するため、引数検証のみ行う(配達はしない)。
    const spy = vi.spyOn(window, 'postMessage').mockImplementation(() => {});

    window.dispatchEvent(createMessageEvent(
      { jsonrpc: '2.0', method: 'pkc.unknown', id: 2 },
      'https://v2-sender.example',
    ));

    expect(spy).toHaveBeenCalledTimes(1);
    const [resp, targetOrigin] = spy.mock.calls[0]!;
    expect((resp as { error: { code: number } }).error.code).toBe(-32601);
    expect(targetOrigin).toBe('https://v2-sender.example');
    spy.mockRestore();
  });

  it('v2 invalid-envelope error is pinned to the request origin', () => {
    const onReject = vi.fn();
    handle = mountMessageBridge({ containerId: CONTAINER_ID, allowedOrigins: ['*'], onReject });
    // happy-dom は targetOrigin 不一致の postMessage を SecurityError に
    // するため、引数検証のみ行う(配達はしない)。
    const spy = vi.spyOn(window, 'postMessage').mockImplementation(() => {});

    // jsonrpc discriminant はあるが request / notification / response の
    // どの形でもない壊れた envelope。
    window.dispatchEvent(createMessageEvent(
      { jsonrpc: '2.0', bogus: true },
      'https://broken.example',
    ));

    expect(onReject).toHaveBeenCalled();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]![1]).toBe('https://broken.example');
    spy.mockRestore();
  });
});

// ── export:result ────────────────────────

const mockContainer: Container = {
  meta: {
    container_id: 'test-container',
    title: 'Test PKC',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    schema_version: 1,
  },
  entries: [],
  relations: [],
  revisions: [],
  assets: {},
};

function setupExportDom(): () => void {
  const root = document.createElement('div');
  root.id = SLOT.ROOT;
  document.body.appendChild(root);
  const core = document.createElement('script');
  core.id = SLOT.CORE;
  core.textContent = '/* pkc core */';
  document.body.appendChild(core);
  const styles = document.createElement('style');
  styles.id = SLOT.STYLES;
  styles.textContent = '/* styles */';
  document.head.appendChild(styles);
  const theme = document.createElement('style');
  theme.id = SLOT.THEME;
  theme.textContent = '/* theme */';
  document.head.appendChild(theme);
  const meta = document.createElement('script');
  meta.id = SLOT.META;
  meta.type = 'application/json';
  meta.textContent = JSON.stringify({
    version: '2.0.0', schema: 1, build_at: '20260610120000',
    kind: 'dev', code_integrity: 'sha256:abc', capabilities: [],
  });
  document.body.appendChild(meta);
  return () => {
    for (const id of [SLOT.ROOT, SLOT.CORE, SLOT.META]) {
      document.getElementById(id)?.remove();
    }
    document.querySelector(`#${SLOT.STYLES}`)?.remove();
    document.querySelector(`#${SLOT.THEME}`)?.remove();
  };
}

function makeExportContext(origin: string): HandlerContext {
  return {
    envelope: {
      protocol: 'pkc-message',
      version: 1,
      type: 'export:request',
      source_id: 'parent-app',
      target_id: 'test-container',
      payload: null,
      timestamp: '2026-06-10T12:00:00Z',
    },
    sourceWindow: {} as Window,
    origin,
    container: mockContainer,
    embedded: true,
    dispatcher: { dispatch: vi.fn(), getState: vi.fn(), onState: vi.fn(), onEvent: vi.fn() } as unknown as Dispatcher,
    sender: { send: vi.fn() } as unknown as MessageSender,
  };
}

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('export:result targetOrigin pinning', () => {
  it('passes the receive-time origin as the 5th send argument', async () => {
    const cleanup = setupExportDom();
    const ctx = makeExportContext('https://embedder.example');

    exportRequestHandler(ctx);
    await flushMicrotasks();

    const call = (ctx.sender.send as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(call[1]).toBe('export:result');
    expect(call[4]).toBe('https://embedder.example');
    cleanup();
  });

  it("opaque origin 'null' falls back to '*'", async () => {
    const cleanup = setupExportDom();
    const ctx = makeExportContext('null');

    exportRequestHandler(ctx);
    await flushMicrotasks();

    const call = (ctx.sender.send as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(call[4]).toBe('*');
    cleanup();
  });
});

// ── record:reject reply registry ────────────────────────

describe('reply-window registry keeps the receive-time origin', () => {
  afterEach(() => {
    clearAllReplyWindows();
  });

  it('setReplyWindowForOffer stores { win, origin } and both getters resolve', () => {
    const win = {} as Window;
    setReplyWindowForOffer('offer-x', win, 'https://offerer.example');

    expect(getReplyWindowForOffer('offer-x')).toBe(win);
    expect(getReplyTargetForOffer('offer-x')).toEqual({
      win,
      origin: 'https://offerer.example',
    });
  });

  it('recordOfferHandler stashes ctx.origin alongside the source window', () => {
    const dispatch = vi.fn();
    const senderWin = {} as Window;
    const ctx: HandlerContext = {
      envelope: {
        protocol: 'pkc-message',
        version: 1,
        type: 'record:offer',
        source_id: 'offerer',
        target_id: null,
        payload: { title: 'T', body: 'B' },
        timestamp: '2026-06-10T12:00:00Z',
      },
      sourceWindow: senderWin,
      origin: 'https://offerer.example',
      container: mockContainer,
      embedded: false,
      dispatcher: { dispatch, getState: vi.fn(), onState: vi.fn(), onEvent: vi.fn() } as unknown as Dispatcher,
      sender: { send: vi.fn() } as unknown as MessageSender,
    };

    expect(recordOfferHandler(ctx)).toBe(true);
    const offer = dispatch.mock.calls[0]![0].offer as { offer_id: string };
    const target = getReplyTargetForOffer(offer.offer_id);
    expect(target?.win).toBe(senderWin);
    expect(target?.origin).toBe('https://offerer.example');
  });
});
