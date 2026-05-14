/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isV2Envelope,
  validateEnvelopeV2,
  buildResponseSuccess,
  buildResponseError,
  buildRequest,
  buildNotification,
} from '@adapter/transport/envelope-v2';
import { createHeartbeatHandler } from '@adapter/transport/heartbeat-handler-v2';
import { mountMessageBridge } from '@adapter/transport/message-bridge';
import { JSON_RPC_ERROR_CODES } from '@core/model/message-v2';
import type { MessageRequestV2 } from '@core/model/message-v2';

describe('PR-V15 A3 — envelope-v2 validation', () => {
  it('isV2Envelope:jsonrpc=2.0 field を持つもののみ true', () => {
    expect(isV2Envelope({ jsonrpc: '2.0', method: 'x', id: 1 })).toBe(true);
    expect(isV2Envelope({ jsonrpc: '1.0' })).toBe(false);
    expect(isV2Envelope({ protocol: 'pkc-message' })).toBe(false);
    expect(isV2Envelope(null)).toBe(false);
    expect(isV2Envelope('text')).toBe(false);
  });

  it('request 形(method + id)を認識', () => {
    const r = validateEnvelopeV2({ jsonrpc: '2.0', method: 'pkc.heartbeat', id: 1 });
    expect(r.valid).toBe(true);
    if (r.valid) expect(r.form).toBe('request');
  });

  it('notification 形(method only、id なし)を認識', () => {
    const r = validateEnvelopeV2({ jsonrpc: '2.0', method: 'pkc.notify' });
    expect(r.valid).toBe(true);
    if (r.valid) expect(r.form).toBe('notification');
  });

  it('response success 形(id + result)を認識', () => {
    const r = validateEnvelopeV2({ jsonrpc: '2.0', id: 1, result: { ok: true } });
    expect(r.valid).toBe(true);
    if (r.valid) expect(r.form).toBe('response-success');
  });

  it('response error 形(id + error)を認識', () => {
    const r = validateEnvelopeV2({
      jsonrpc: '2.0',
      id: 1,
      error: { code: -32601, message: 'not found' },
    });
    expect(r.valid).toBe(true);
    if (r.valid) expect(r.form).toBe('response-error');
  });

  it('jsonrpc field が "2.0" でない envelope は reject', () => {
    const r = validateEnvelopeV2({ jsonrpc: '1.0', method: 'x', id: 1 });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.error.code).toBe(JSON_RPC_ERROR_CODES.INVALID_REQUEST);
  });

  it('shape が request / notification / response いずれにも合致しない場合 reject', () => {
    const r = validateEnvelopeV2({ jsonrpc: '2.0', random: 'thing' });
    expect(r.valid).toBe(false);
  });
});

describe('PR-V15 A3 — envelope-v2 builders', () => {
  it('buildResponseSuccess:正しい shape', () => {
    const r = buildResponseSuccess(1, { ok: true });
    expect(r).toEqual({ jsonrpc: '2.0', id: 1, result: { ok: true } });
  });

  it('buildResponseError:code + message を持つ shape', () => {
    const r = buildResponseError(1, JSON_RPC_ERROR_CODES.METHOD_NOT_FOUND, 'no');
    expect(r.jsonrpc).toBe('2.0');
    expect(r.error.code).toBe(-32601);
    expect(r.error.message).toBe('no');
  });

  it('buildRequest:method + id + optional params', () => {
    expect(buildRequest('pkc.x', 1)).toEqual({ jsonrpc: '2.0', method: 'pkc.x', id: 1 });
    expect(buildRequest('pkc.x', 'abc', { a: 1 })).toEqual({
      jsonrpc: '2.0', method: 'pkc.x', id: 'abc', params: { a: 1 },
    });
  });

  it('buildNotification:method のみ、id 無し', () => {
    const n = buildNotification('pkc.tick');
    expect(n).toEqual({ jsonrpc: '2.0', method: 'pkc.tick' });
    expect('id' in n).toBe(false);
  });
});

describe('PR-V15 A3 — heartbeat handler', () => {
  it('container_id + server_time + pkc_version を返す', () => {
    const handler = createHeartbeatHandler({
      containerId: 'test-cid',
      now: () => new Date('2026-05-14T12:00:00.000Z'),
    });
    const req: MessageRequestV2 = { jsonrpc: '2.0', method: 'pkc.heartbeat', id: 1 };
    const result = handler(req);
    expect(result.container_id).toBe('test-cid');
    expect(result.server_time).toBe('2026-05-14T12:00:00.000Z');
    expect(result.pkc_version).toBe('2.0.0-minimum');
  });

  it('request の params.seq を echo', () => {
    const handler = createHeartbeatHandler({ containerId: 'cid' });
    const req: MessageRequestV2 = {
      jsonrpc: '2.0', method: 'pkc.heartbeat', id: 1, params: { seq: 42 },
    };
    expect(handler(req).seq).toBe(42);
  });

  it('seq 無しの request では result.seq も undefined', () => {
    const handler = createHeartbeatHandler({ containerId: 'cid' });
    const req: MessageRequestV2 = { jsonrpc: '2.0', method: 'pkc.heartbeat', id: 1 };
    expect(handler(req).seq).toBeUndefined();
  });
});

describe('PR-V15 A3 — bridge integration', () => {
  let originalAddEventListener: typeof window.addEventListener;
  let listener: ((e: MessageEvent) => void) | null;
  let lastPostMessage: { data: unknown; origin: string } | null;

  beforeEach(() => {
    originalAddEventListener = window.addEventListener;
    listener = null;
    lastPostMessage = null;
    vi.spyOn(window, 'addEventListener').mockImplementation(
      (type: string, fn: EventListenerOrEventListenerObject) => {
        if (type === 'message') listener = fn as (e: MessageEvent) => void;
      },
    );
  });

  afterEach(() => {
    window.addEventListener = originalAddEventListener;
    vi.restoreAllMocks();
  });

  function makeSourceWindow(): Window {
    return {
      postMessage: (data: unknown, origin: string): void => {
        lastPostMessage = { data, origin };
      },
    } as unknown as Window;
  }

  it('v2 heartbeat request → response success が source へ postMessage 返送', () => {
    const handle = mountMessageBridge({ containerId: 'my-cid' });
    const src = makeSourceWindow();
    const req = buildRequest('pkc.heartbeat', 'req-1', { seq: 5 });
    listener?.({ data: req, origin: 'https://x.test', source: src } as unknown as MessageEvent);
    expect(lastPostMessage).not.toBeNull();
    const resp = lastPostMessage!.data as { jsonrpc: string; id: string; result: { container_id: string; seq?: number } };
    expect(resp.jsonrpc).toBe('2.0');
    expect(resp.id).toBe('req-1');
    expect(resp.result.container_id).toBe('my-cid');
    expect(resp.result.seq).toBe(5);
    handle.destroy();
  });

  it('未知 v2 method → Method not found(-32601)error response', () => {
    const handle = mountMessageBridge({ containerId: 'cid' });
    const src = makeSourceWindow();
    listener?.(
      {
        data: buildRequest('pkc.unknown', 'r2'),
        origin: 'https://x.test',
        source: src,
      } as unknown as MessageEvent,
    );
    const resp = lastPostMessage!.data as { error: { code: number; message: string } };
    expect(resp.error.code).toBe(JSON_RPC_ERROR_CODES.METHOD_NOT_FOUND);
    expect(resp.error.message).toMatch(/pkc.unknown/);
    handle.destroy();
  });

  it('v2 notification(id 無し)→ response 無し', () => {
    const handle = mountMessageBridge({ containerId: 'cid' });
    const src = makeSourceWindow();
    listener?.(
      {
        data: buildNotification('pkc.heartbeat'),
        origin: 'https://x.test',
        source: src,
      } as unknown as MessageEvent,
    );
    expect(lastPostMessage).toBeNull();
    handle.destroy();
  });

  it('v1 envelope は引き続き処理(v2 path に取られない)', () => {
    const v1Pings: unknown[] = [];
    const handle = mountMessageBridge({
      containerId: 'cid',
      onMessage: (env) => v1Pings.push(env),
    });
    const src = makeSourceWindow();
    listener?.(
      {
        data: {
          protocol: 'pkc-message',
          version: 1,
          type: 'navigate',
          source_id: 'other',
          target_id: null,
          payload: { x: 1 },
          timestamp: '2026-05-14T00:00:00Z',
        },
        origin: 'https://x.test',
        source: src,
      } as unknown as MessageEvent,
    );
    expect(v1Pings.length).toBe(1);
    handle.destroy();
  });

  it('invalid v2 envelope(shape 破綻)→ id=null の error response', () => {
    const handle = mountMessageBridge({ containerId: 'cid' });
    const src = makeSourceWindow();
    listener?.(
      {
        data: { jsonrpc: '2.0', random: 'broken' },
        origin: 'https://x.test',
        source: src,
      } as unknown as MessageEvent,
    );
    const resp = lastPostMessage!.data as { id: null; error: { code: number } };
    expect(resp.id).toBeNull();
    expect(resp.error.code).toBe(JSON_RPC_ERROR_CODES.INVALID_REQUEST);
    handle.destroy();
  });
});
