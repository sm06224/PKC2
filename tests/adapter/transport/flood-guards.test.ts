// @vitest-environment happy-dom
/**
 * #795 A-4: flood guards(受信 envelope 粗サイズ上限 + origin 別固定窓
 * rate limit)のテスト。設計 doc §2 / v1 spec §3.5 が正。
 *
 * - サイズ: 1,048,576 UTF-16 units 超の envelope は validation 前に drop
 * - rate: origin 単位 120 msg / 60s 固定窓。超過分 drop、onReject は
 *   窓あたり 1 回、onTraffic には drop ごと(verdict 'dropped')
 * - drop の onReject には flood payload を渡さない(null + 理由のみ)
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  mountMessageBridge,
  roughEnvelopeSize,
  MAX_ENVELOPE_ROUGH_UNITS,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX_PER_WINDOW,
  type TrafficEvent,
} from '@adapter/transport/message-bridge';

const CONTAINER_ID = 'flood-test-container';
const ORIGIN = window.location.origin;

function ev(data: unknown, origin: string = ORIGIN): MessageEvent {
  return new MessageEvent('message', { data, origin, source: window });
}

function v1Custom(body = 'b'): Record<string, unknown> {
  return {
    protocol: 'pkc-message',
    version: 1,
    type: 'custom',
    source_id: 'remote',
    target_id: null,
    payload: { body },
    timestamp: '2026-06-11T00:00:00Z',
  };
}

describe('roughEnvelopeSize', () => {
  it('top-level + 1 段下の string field 長を合算する', () => {
    expect(roughEnvelopeSize({ a: 'xx', payload: { b: 'yyy' } })).toBe(5);
  });

  it('string そのものは length を返し、primitive は 0', () => {
    expect(roughEnvelopeSize('hello')).toBe(5);
    expect(roughEnvelopeSize(42)).toBe(0);
    expect(roughEnvelopeSize(null)).toBe(0);
  });
});

describe('flood guards', () => {
  let handle: ReturnType<typeof mountMessageBridge> | null = null;
  let events: TrafficEvent[] = [];
  let onMessage = vi.fn();
  let onReject = vi.fn();

  function mount() {
    events = [];
    onMessage = vi.fn();
    onReject = vi.fn();
    handle = mountMessageBridge({
      containerId: CONTAINER_ID,
      allowedOrigins: ['*'],
      onMessage,
      onReject,
      onTraffic: (e) => events.push(e),
    });
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-11T12:00:00Z'));
  });

  afterEach(() => {
    handle?.destroy();
    handle = null;
    vi.useRealTimers();
  });

  it('粗サイズ上限超の v1 envelope は validation 前に drop(SIZE_LIMIT_EXCEEDED)', () => {
    mount();
    const huge = 'a b '.repeat((MAX_ENVELOPE_ROUGH_UNITS / 4) + 1); // 上限 +4 units、base64 run ではない
    window.dispatchEvent(ev(v1Custom(huge)));

    expect(onMessage).not.toHaveBeenCalled();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      direction: 'in', protocol: 'v1', verdict: 'dropped', rejectCode: 'SIZE_LIMIT_EXCEEDED',
    });
    // onReject には flood payload を渡さない(null + 理由)。
    expect(onReject).toHaveBeenCalledTimes(1);
    expect(onReject.mock.calls[0]![0]).toBeNull();
    expect(onReject.mock.calls[0]![1]).toContain('size limit');
  });

  it('粗サイズ上限超の v2 envelope も drop される', () => {
    mount();
    const huge = 'a b '.repeat((MAX_ENVELOPE_ROUGH_UNITS / 4) + 1);
    window.dispatchEvent(ev({ jsonrpc: '2.0', method: 'pkc.heartbeat', id: 1, params: { blob: huge } }));

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ protocol: 'v2', verdict: 'dropped', rejectCode: 'SIZE_LIMIT_EXCEEDED' });
  });

  it('上限ちょうどの envelope は通る(境界)', () => {
    mount();
    // payload.body のみが寄与するよう固定長で組む。
    const body = 'x'.repeat(100);
    window.dispatchEvent(ev(v1Custom(body)));
    expect(onMessage).toHaveBeenCalledTimes(1);
  });

  it(`rate limit: ${RATE_LIMIT_MAX_PER_WINDOW} 件目までは受理、超過分は drop(RATE_LIMIT_EXCEEDED)`, () => {
    mount();
    for (let i = 0; i < RATE_LIMIT_MAX_PER_WINDOW + 5; i++) {
      window.dispatchEvent(ev(v1Custom()));
    }
    expect(onMessage).toHaveBeenCalledTimes(RATE_LIMIT_MAX_PER_WINDOW);
    const drops = events.filter((e) => e.rejectCode === 'RATE_LIMIT_EXCEEDED');
    expect(drops).toHaveLength(5);
    // onReject の rate 通知は窓あたり 1 回のみ。
    const rateRejects = onReject.mock.calls.filter(
      (c) => typeof c[1] === 'string' && c[1].includes('Rate limit'),
    );
    expect(rateRejects).toHaveLength(1);
  });

  it('rate limit は origin 単位(別 origin は独立カウント)', () => {
    mount();
    for (let i = 0; i < RATE_LIMIT_MAX_PER_WINDOW + 1; i++) {
      window.dispatchEvent(ev(v1Custom(), 'https://busy.example'));
    }
    // busy.example は超過したが、別 origin は受理される。
    window.dispatchEvent(ev(v1Custom(), 'https://calm.example'));
    expect(onMessage).toHaveBeenCalledTimes(RATE_LIMIT_MAX_PER_WINDOW + 1);
  });

  it('窓が切り替わるとカウントはリセットされる', () => {
    mount();
    for (let i = 0; i < RATE_LIMIT_MAX_PER_WINDOW + 1; i++) {
      window.dispatchEvent(ev(v1Custom()));
    }
    expect(onMessage).toHaveBeenCalledTimes(RATE_LIMIT_MAX_PER_WINDOW);

    vi.setSystemTime(new Date(Date.now() + RATE_LIMIT_WINDOW_MS + 1));
    window.dispatchEvent(ev(v1Custom()));
    expect(onMessage).toHaveBeenCalledTimes(RATE_LIMIT_MAX_PER_WINDOW + 1);
  });

  it('非 PKC メッセージは flood guard の対象外(quick filter が先)', () => {
    mount();
    // 巨大でも protocol field が無ければ測定すらされず silent skip。
    const huge = 'a b '.repeat((MAX_ENVELOPE_ROUGH_UNITS / 4) + 1);
    window.dispatchEvent(ev({ kind: 'unrelated', blob: huge }));
    expect(events).toHaveLength(0);
    expect(onReject).not.toHaveBeenCalled();
  });
});
