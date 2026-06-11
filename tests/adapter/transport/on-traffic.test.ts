// @vitest-environment happy-dom
/**
 * #795 B-1: `onTraffic` 統一観測 seam のテスト。
 *
 * 契約: 「postMessage が走った(または bridge が判定を下した)のに
 * onTraffic が発火しないコードパスが無い」こと。設計 doc
 * `transport-hardening-and-observability-design-2026-06.md` §3 の
 * emit 点表(盲点 6 種)を全て検証する:
 *   1. inbound ping(bridge 内部処理)+ outbound pong
 *   2. inbound origin reject / invalid envelope
 *   3. inbound target_id 不一致 silent drop
 *   4. outbound 全部(sender.send 経由)
 *   5. v2 往復(heartbeat 成功・method-not-found・invalid・notification・
 *      unsolicited response)
 *   6. payload は既定で seam に流さない(payloadPreview 不在)
 * 加えて: observer 例外は protocol 挙動に影響しない(spec §Observability)。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  mountMessageBridge,
  redactPayloadPreview,
  type TrafficEvent,
} from '@adapter/transport/message-bridge';

const CONTAINER_ID = 'traffic-test-container';
const ORIGIN = window.location.origin;

function ev(data: unknown, origin: string = ORIGIN): MessageEvent {
  return new MessageEvent('message', { data, origin, source: window });
}

function v1(type: string, over: Record<string, unknown> = {}) {
  return {
    protocol: 'pkc-message',
    version: 1,
    type,
    source_id: 'remote',
    target_id: null,
    payload: { k: 'v' },
    timestamp: '2026-06-11T00:00:00Z',
    ...over,
  };
}

describe('onTraffic seam — v1 path', () => {
  let handle: ReturnType<typeof mountMessageBridge> | null = null;
  let events: TrafficEvent[] = [];
  let pmSpy: ReturnType<typeof vi.spyOn> | null = null;

  function mount(opts: Partial<Parameters<typeof mountMessageBridge>[0]> = {}) {
    events = [];
    handle = mountMessageBridge({
      containerId: CONTAINER_ID,
      onTraffic: (e) => events.push(e),
      ...opts,
    });
    pmSpy = vi.spyOn(window, 'postMessage').mockImplementation(() => {});
    return handle;
  }

  afterEach(() => {
    handle?.destroy();
    handle = null;
    pmSpy?.mockRestore();
    pmSpy = null;
  });

  it('inbound ping + outbound pong は両方 emit される(盲点 1)', () => {
    mount();
    window.dispatchEvent(ev(v1('ping')));

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      direction: 'in', protocol: 'v1', verdict: 'accepted', type: 'ping',
      origin: ORIGIN, sourceId: 'remote',
    });
    expect(events[1]).toMatchObject({
      direction: 'out', protocol: 'v1', verdict: 'sent', type: 'pong',
      sourceId: CONTAINER_ID, targetId: 'remote',
    });
    expect(events[0]!.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('origin reject(null 非 opt-in)は rejected + ORIGIN_REJECTED', () => {
    mount();
    window.dispatchEvent(ev(v1('ping'), 'null'));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      direction: 'in', verdict: 'rejected', rejectCode: 'ORIGIN_REJECTED', origin: 'null', type: 'ping',
    });
  });

  it('allowlist 不一致の origin reject も emit される', () => {
    mount({ allowedOrigins: ['https://only.example'] });
    window.dispatchEvent(ev(v1('ping'), 'https://other.example'));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ verdict: 'rejected', rejectCode: 'ORIGIN_REJECTED' });
  });

  it('invalid envelope は収集された全 RejectCode を joined で carry(B-2 整合)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mount();
    window.dispatchEvent(ev({ protocol: 'pkc-message', version: 99 }));
    expect(events).toHaveLength(1);
    expect(events[0]!.verdict).toBe('rejected');
    expect(events[0]!.rejectCode).toContain('WRONG_VERSION');
    expect(events[0]!.rejectCode).toContain('MISSING_TYPE');
    expect(events[0]!.rejectCode).toContain('MISSING_TIMESTAMP');
    warn.mockRestore();
  });

  it('target_id 不一致の silent drop が観測される(盲点 3)', () => {
    mount();
    window.dispatchEvent(ev(v1('custom', { target_id: 'someone-else' })));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      verdict: 'dropped', rejectCode: 'TARGET_ID_MISMATCH',
      targetId: 'someone-else', type: 'custom',
    });
  });

  it('handler delegate(onMessage)経路は accepted を emit', () => {
    const onMessage = vi.fn();
    mount({ onMessage });
    window.dispatchEvent(ev(v1('custom')));
    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ verdict: 'accepted', type: 'custom', sourceId: 'remote' });
  });

  it('delegate 不在の valid message は dropped(NO_HANDLER)を emit', () => {
    mount(); // onMessage なし
    window.dispatchEvent(ev(v1('custom')));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ verdict: 'dropped', rejectCode: 'NO_HANDLER' });
  });

  it('sender.send の outbound が emit される(盲点 4: export:result / record:reject 経路)', () => {
    const h = mount();
    const target = { postMessage: vi.fn() } as unknown as Window;
    h.sender.send(target, 'export:result', { html: 'x' }, 'requester', 'https://embedder.example');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      direction: 'out', verdict: 'sent', type: 'export:result',
      origin: 'https://embedder.example', sourceId: CONTAINER_ID, targetId: 'requester',
    });
  });

  it('payload は既定で seam に流れない(payloadPreview 不在)', () => {
    mount();
    window.dispatchEvent(ev(v1('ping')));
    for (const e of events) {
      expect(e.payloadPreview).toBeUndefined();
    }
  });

  it('observer の例外は protocol 挙動に影響しない(pong は送られる)', () => {
    events = [];
    handle = mountMessageBridge({
      containerId: CONTAINER_ID,
      onTraffic: () => { throw new Error('observer bug'); },
    });
    pmSpy = vi.spyOn(window, 'postMessage').mockImplementation(() => {});
    // throw する observer がいても ping → pong は完走する。
    expect(() => window.dispatchEvent(ev(v1('ping')))).not.toThrow();
    expect(pmSpy).toHaveBeenCalledTimes(1);
  });

  it('onTraffic 未指定(既定)は完全に従来挙動(後方互換)', () => {
    handle = mountMessageBridge({ containerId: CONTAINER_ID });
    pmSpy = vi.spyOn(window, 'postMessage').mockImplementation(() => {});
    window.dispatchEvent(ev(v1('ping')));
    expect(pmSpy).toHaveBeenCalledTimes(1); // pong は従来どおり
  });
});

describe('onTraffic seam — v2 path(盲点 5: 成功往復含む)', () => {
  let handle: ReturnType<typeof mountMessageBridge> | null = null;
  let events: TrafficEvent[] = [];
  let pmSpy: ReturnType<typeof vi.spyOn> | null = null;

  function mount() {
    events = [];
    handle = mountMessageBridge({
      containerId: CONTAINER_ID,
      onTraffic: (e) => events.push(e),
    });
    pmSpy = vi.spyOn(window, 'postMessage').mockImplementation(() => {});
  }

  afterEach(() => {
    handle?.destroy();
    handle = null;
    pmSpy?.mockRestore();
    pmSpy = null;
  });

  it('heartbeat 成功往復: in accepted + out sent の 2 emit', () => {
    mount();
    window.dispatchEvent(ev({ jsonrpc: '2.0', method: 'pkc.heartbeat', id: 1 }));
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ direction: 'in', protocol: 'v2', verdict: 'accepted', type: 'pkc.heartbeat' });
    expect(events[1]).toMatchObject({ direction: 'out', protocol: 'v2', verdict: 'sent', type: 'pkc.heartbeat' });
  });

  it('method not found: in rejected + out sent(error response)', () => {
    mount();
    window.dispatchEvent(ev({ jsonrpc: '2.0', method: 'pkc.nope', id: 2 }));
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ verdict: 'rejected', rejectCode: 'METHOD_NOT_FOUND', type: 'pkc.nope' });
    expect(events[1]).toMatchObject({ direction: 'out', verdict: 'sent', type: 'pkc.nope' });
  });

  it('invalid v2 envelope: in rejected + out sent(error response)', () => {
    mount();
    window.dispatchEvent(ev({ jsonrpc: '2.0', bogus: true }));
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ verdict: 'rejected', rejectCode: 'V2_INVALID_REQUEST', protocol: 'v2' });
    expect(events[1]).toMatchObject({ direction: 'out', verdict: 'sent', type: '(error-response)' });
  });

  it('notification は in accepted のみ(response なし)', () => {
    mount();
    window.dispatchEvent(ev({ jsonrpc: '2.0', method: '$/heartbeat' }));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ verdict: 'accepted', type: '$/heartbeat' });
    expect(pmSpy).not.toHaveBeenCalled();
  });

  it('unsolicited response 形は dropped で観測される', () => {
    mount();
    window.dispatchEvent(ev({ jsonrpc: '2.0', id: 9, result: {} }));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ verdict: 'dropped', rejectCode: 'UNSOLICITED_RESPONSE', type: '(response)' });
  });

  it('v2 origin reject も emit される', () => {
    events = [];
    handle = mountMessageBridge({
      containerId: CONTAINER_ID,
      allowedOrigins: ['https://only.example'],
      onTraffic: (e) => events.push(e),
    });
    pmSpy = vi.spyOn(window, 'postMessage').mockImplementation(() => {});
    window.dispatchEvent(ev({ jsonrpc: '2.0', method: 'pkc.heartbeat', id: 1 }, 'https://other.example'));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ protocol: 'v2', verdict: 'rejected', rejectCode: 'ORIGIN_REJECTED' });
  });
});

describe('redactPayloadPreview(#795 B-1 redaction)', () => {
  it('256 字に丸めて元の長さを付記する', () => {
    // 空白入りテキスト(base64 run には一致しない)で truncation 自体を検証。
    const out = redactPayloadPreview({ body: 'hello world '.repeat(100) });
    expect(out.length).toBeLessThan(300);
    expect(out).toMatch(/…\(\d+ chars\)$/);
  });

  it('base64 風の長い run を伏字にする', () => {
    const out = redactPayloadPreview({ asset: 'A'.repeat(200) });
    expect(out).toContain('[redacted:base64]');
    expect(out).not.toContain('A'.repeat(200));
  });

  it('data: URI を伏字にする', () => {
    const out = redactPayloadPreview({ img: `data:image/png;base64,${'B'.repeat(80)}` });
    expect(out).toContain('[redacted:data-uri]');
  });

  it('シリアライズ不能でも throw しない', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(redactPayloadPreview(cyclic)).toBe('[unserializable]');
  });
});
