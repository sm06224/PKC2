// @vitest-environment happy-dom
/**
 * PKC-Extension host channel(#806 一括実装 3/6)。
 * host-push の wire と security gate(identity + nonce)を検証。
 * 実体の pull 経路が無いこと、write は host 検証を通ることを pin。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  launchExtensionChannel,
  PKC_EXT,
  PKC_EXT_V,
  type ExtensionChannelHandle,
} from '@adapter/transport/extension-channel';

const ORIGIN = window.location.origin;

// window.open をスタブ化:childWin の postMessage を記録し、ev.source に使える
// Window-like を返す。
function stubChild() {
  const posted: Array<{ msg: Record<string, unknown>; targetOrigin: string }> = [];
  const child = {
    document: { open: vi.fn(), write: vi.fn(), close: vi.fn() },
    postMessage: (msg: Record<string, unknown>, targetOrigin: string) => {
      posted.push({ msg, targetOrigin });
    },
    close: vi.fn(),
    closed: false,
  };
  vi.spyOn(window, 'open').mockReturnValue(child as unknown as Window);
  return { child, posted };
}

/** child→host メッセージを発火(ev.source = child)。 */
function fromChild(child: unknown, data: Record<string, unknown>, origin = ORIGIN) {
  window.dispatchEvent(new MessageEvent('message', { data, origin, source: child as Window }));
}

let handle: ExtensionChannelHandle | null = null;
afterEach(() => {
  handle?.close();
  handle = null;
  vi.restoreAllMocks();
});

describe('launchExtensionChannel — handshake & push', () => {
  it('hello で established → projection を pinned origin で push', () => {
    const { child, posted } = stubChild();
    const projection = { entries: [{ lid: 'e1' }], stats: { totalEntries: 1 } };
    handle = launchExtensionChannel({ html: '<x>', getProjection: () => projection })!;
    expect(handle).not.toBeNull();
    expect(handle.isEstablished()).toBe(false);

    fromChild(child, { pkc: PKC_EXT, v: PKC_EXT_V, t: 'hello' });

    expect(handle.isEstablished()).toBe(true);
    const proj = posted.find((p) => p.msg.t === 'projection')!;
    expect(proj.msg.projection).toEqual(projection);
    expect(proj.targetOrigin).toBe(ORIGIN);
    expect(proj.msg.nonce).toBeTruthy();
  });

  it('pushProjection は established 前は no-op、後は再送', () => {
    const { child, posted } = stubChild();
    let n = 0;
    handle = launchExtensionChannel({ html: '<x>', getProjection: () => ({ tick: n++ }) })!;
    handle.pushProjection();
    expect(posted.filter((p) => p.msg.t === 'projection')).toHaveLength(0);
    fromChild(child, { pkc: PKC_EXT, v: PKC_EXT_V, t: 'hello' });
    handle.pushProjection();
    expect(posted.filter((p) => p.msg.t === 'projection').length).toBeGreaterThanOrEqual(2);
  });

  it('handshake 前の deliver はバッファされ、hello で projection の後に flush される', () => {
    const { child, posted } = stubChild();
    handle = launchExtensionChannel({ html: '<x>', getProjection: () => ({}) })!;
    // auto-open 直後の送付ジェスチャ: hello 到着前に deliver が呼ばれる。
    handle.deliver({ kind: 'entry', lid: 'e1', body: 'queued-1' });
    handle.deliver({ kind: 'entry', lid: 'e2', body: 'queued-2' });
    expect(posted.filter((p) => p.msg.t === 'deliver')).toHaveLength(0);

    fromChild(child, { pkc: PKC_EXT, v: PKC_EXT_V, t: 'hello' });

    const types = posted.map((p) => p.msg.t);
    expect(types.indexOf('projection')).toBeLessThan(types.indexOf('deliver'));
    const delivers = posted.filter((p) => p.msg.t === 'deliver');
    expect(delivers).toHaveLength(2);
    expect(delivers.map((p) => (p.msg.payload as { body: string }).body)).toEqual(['queued-1', 'queued-2']);
    expect(delivers.every((p) => p.targetOrigin === ORIGIN)).toBe(true);
  });

  it('deliver は実体 1 件を push(送付ジェスチャの結果)', () => {
    const { child, posted } = stubChild();
    handle = launchExtensionChannel({ html: '<x>', getProjection: () => ({}) })!;
    fromChild(child, { pkc: PKC_EXT, v: PKC_EXT_V, t: 'hello' });
    handle.deliver({ kind: 'asset', asset_key: 'k1', mime: 'application/pdf', data_base64: 'QUJD' });
    const del = posted.find((p) => p.msg.t === 'deliver')!;
    expect(del.msg.payload).toMatchObject({ kind: 'asset', asset_key: 'k1', data_base64: 'QUJD' });
    expect(del.targetOrigin).toBe(ORIGIN);
  });
});

describe('security gate', () => {
  it('別 source からの hello は無視(identity binding)', () => {
    const { child } = stubChild();
    handle = launchExtensionChannel({ html: '<x>', getProjection: () => ({}) })!;
    // ev.source が child でない別 window object。
    window.dispatchEvent(new MessageEvent('message', {
      data: { pkc: PKC_EXT, v: PKC_EXT_V, t: 'hello' }, origin: ORIGIN, source: {} as Window,
    }));
    expect(handle.isEstablished()).toBe(false);
    void child;
  });

  it('別 origin からの hello は無視', () => {
    const { child } = stubChild();
    handle = launchExtensionChannel({ html: '<x>', getProjection: () => ({}) })!;
    fromChild(child, { pkc: PKC_EXT, v: PKC_EXT_V, t: 'hello' }, 'https://evil.example');
    expect(handle.isEstablished()).toBe(false);
  });

  it('hello 以外は nonce 不一致だと無視(write が処理されない)', () => {
    const { child, posted } = stubChild();
    const onWrite = vi.fn(() => true);
    handle = launchExtensionChannel({ html: '<x>', getProjection: () => ({}), onWrite })!;
    fromChild(child, { pkc: PKC_EXT, v: PKC_EXT_V, t: 'hello' });
    // nonce を付けない write は弾かれる。
    fromChild(child, { pkc: PKC_EXT, v: PKC_EXT_V, t: 'write', ops: [{}] });
    expect(onWrite).not.toHaveBeenCalled();
    expect(posted.find((p) => p.msg.t === 'write-result')).toBeUndefined();
  });
});

describe('pkc:write(T2)は host 検証を通る', () => {
  function established() {
    const { child, posted } = stubChild();
    const onWrite = vi.fn((req: { ops: unknown[] }) => req.ops.length <= 1);
    handle = launchExtensionChannel({ html: '<x>', getProjection: () => ({}), onWrite })!;
    fromChild(child, { pkc: PKC_EXT, v: PKC_EXT_V, t: 'hello' });
    const nonce = posted.find((p) => p.msg.t === 'projection')!.msg.nonce as string;
    return { child, posted, onWrite, nonce };
  }

  it('onWrite が true → write-result ok:true(correlation echo)', () => {
    const { child, posted, onWrite, nonce } = established();
    fromChild(child, { pkc: PKC_EXT, v: PKC_EXT_V, nonce, t: 'write', lid: 'e1', ops: [{ op: 'x' }], correlation_id: 'c1' });
    expect(onWrite).toHaveBeenCalledTimes(1);
    const res = posted.find((p) => p.msg.t === 'write-result')!;
    expect(res.msg).toMatchObject({ ok: true, correlation_id: 'c1' });
  });

  it('onWrite が false → write-result ok:false', () => {
    const { child, posted, nonce } = established();
    fromChild(child, { pkc: PKC_EXT, v: PKC_EXT_V, nonce, t: 'write', ops: [{}, {}, {}] });
    const res = posted.find((p) => p.msg.t === 'write-result')!;
    expect(res.msg.ok).toBe(false);
  });

  it('onWrite 未指定なら ok:false(既定は拒否)', () => {
    const { child, posted } = stubChild();
    handle = launchExtensionChannel({ html: '<x>', getProjection: () => ({}) })!;
    fromChild(child, { pkc: PKC_EXT, v: PKC_EXT_V, t: 'hello' });
    const nonce = posted.find((p) => p.msg.t === 'projection')!.msg.nonce as string;
    fromChild(child, { pkc: PKC_EXT, v: PKC_EXT_V, nonce, t: 'write', ops: [{}] });
    const res = posted.find((p) => p.msg.t === 'write-result')!;
    expect(res.msg.ok).toBe(false);
  });
});

describe('popup blocked', () => {
  it('window.open が null なら handle も null(画面ハイジャックしない)', () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    const h = launchExtensionChannel({ html: '<x>', getProjection: () => ({}) });
    expect(h).toBeNull();
  });
});
