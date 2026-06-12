// @vitest-environment happy-dom
/**
 * PKC-Extension host channel(#806 3/6 + #796 封じ込め)。
 * host-push の wire と security gate を検証:
 *   - Tier S sandboxed(既定): popup shell + sandboxed iframe srcdoc、
 *     opaque origin → gate は identity + nonce、targetOrigin '*'
 *   - Tier T trusted(manifest opt-in): same-origin document.write、
 *     gate は identity + origin + nonce、targetOrigin ピン留め
 * 実体の pull 経路が無いこと、write は host 検証を通ることを pin。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  launchExtensionChannel,
  sandboxTokensFor,
  allowAttributeFor,
  PKC_EXT,
  PKC_EXT_V,
  type ExtensionChannelHandle,
} from '@adapter/transport/extension-channel';

const ORIGIN = window.location.origin;
const TRUSTED = { manifest: { tier: 'trusted' as const } };

// ── Tier T: window.open をスタブ化(子 window に直接 write)──
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

/** Tier T: child→host メッセージを発火(listener は main window)。 */
function fromChild(child: unknown, data: Record<string, unknown>, origin = ORIGIN) {
  window.dispatchEvent(new MessageEvent('message', { data, origin, source: child as Window }));
}

// ── Tier S: popup shell + sandboxed iframe のフェイク ──
function stubSandboxPopup() {
  const posted: Array<{ msg: Record<string, unknown>; targetOrigin: string }> = [];
  const frameContentWindow = {
    postMessage: (msg: Record<string, unknown>, targetOrigin: string) => {
      posted.push({ msg, targetOrigin });
    },
  };
  const frameEl = {
    attrs: {} as Record<string, string>,
    setAttribute(k: string, v: string) { this.attrs[k] = v; },
    contentWindow: frameContentWindow,
  };
  const listeners: Array<(ev: MessageEvent) => void> = [];
  const appended: unknown[] = [];
  const win = {
    document: {
      open: vi.fn(), write: vi.fn(), close: vi.fn(),
      createElement: vi.fn(() => frameEl),
      body: { appendChild: (el: unknown) => appended.push(el) },
    },
    addEventListener: (type: string, fn: (ev: MessageEvent) => void) => {
      if (type === 'message') listeners.push(fn);
    },
    removeEventListener: vi.fn(),
    close: vi.fn(),
  };
  vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
  /** sandboxed 子からのメッセージ(既定 origin は opaque の 'null')。 */
  const emit = (data: Record<string, unknown>, origin = 'null', source: unknown = frameContentWindow) => {
    for (const fn of listeners) fn({ data, origin, source } as MessageEvent);
  };
  return { win, frameEl, posted, emit, frameContentWindow, appended };
}

let handle: ExtensionChannelHandle | null = null;
afterEach(() => {
  handle?.close();
  handle = null;
  vi.restoreAllMocks();
});

describe('Tier S sandboxed(既定)— load と gate', () => {
  it('popup shell 内に sandbox iframe + srcdoc で load(allow-same-origin は決して付かない)', () => {
    const { frameEl, appended } = stubSandboxPopup();
    handle = launchExtensionChannel({ html: '<html>EXT</html>', getProjection: () => ({}) })!;
    expect(handle).not.toBeNull();
    expect(appended).toContain(frameEl);
    expect(frameEl.attrs.sandbox).toBe('allow-scripts');
    expect(frameEl.attrs.sandbox).not.toContain('allow-same-origin');
    expect(frameEl.attrs.srcdoc).toBe('<html>EXT</html>');
  });

  it("capability → sandbox/allow トークン写像(未知 capability は無視)", () => {
    const { frameEl } = stubSandboxPopup();
    handle = launchExtensionChannel({
      html: '<x>', getProjection: () => ({}),
      manifest: { capabilities: ['downloads', 'popups', 'forms', 'clipboard-write', 'fullscreen', 'mystery'] },
    })!;
    expect(frameEl.attrs.sandbox).toBe('allow-scripts allow-downloads allow-popups allow-forms');
    expect(frameEl.attrs.allow).toBe('clipboard-write; fullscreen');
  });

  it("opaque origin('null')の hello で established、targetOrigin は '*'", () => {
    const { posted, emit } = stubSandboxPopup();
    const projection = { stats: { totalEntries: 1 } };
    handle = launchExtensionChannel({ html: '<x>', getProjection: () => projection })!;
    expect(handle.isEstablished()).toBe(false);
    emit({ pkc: PKC_EXT, v: PKC_EXT_V, t: 'hello' });
    expect(handle.isEstablished()).toBe(true);
    const proj = posted.find((p) => p.msg.t === 'projection')!;
    expect(proj.msg.projection).toEqual(projection);
    expect(proj.targetOrigin).toBe('*');
  });

  it('identity が違う source は無視(opaque では identity + nonce が境界)', () => {
    const { emit } = stubSandboxPopup();
    handle = launchExtensionChannel({ html: '<x>', getProjection: () => ({}) })!;
    emit({ pkc: PKC_EXT, v: PKC_EXT_V, t: 'hello' }, 'null', { other: true });
    expect(handle.isEstablished()).toBe(false);
  });

  it('handshake 前の deliver は buffer され projection の後に flush', () => {
    const { posted, emit } = stubSandboxPopup();
    handle = launchExtensionChannel({ html: '<x>', getProjection: () => ({}) })!;
    handle.deliver({ kind: 'entry', lid: 'e1', body: 'queued-1' });
    handle.deliver({ kind: 'entry', lid: 'e2', body: 'queued-2' });
    expect(posted.filter((p) => p.msg.t === 'deliver')).toHaveLength(0);
    emit({ pkc: PKC_EXT, v: PKC_EXT_V, t: 'hello' });
    const types = posted.map((p) => p.msg.t);
    expect(types.indexOf('projection')).toBeLessThan(types.indexOf('deliver'));
    const delivers = posted.filter((p) => p.msg.t === 'deliver');
    expect(delivers.map((p) => (p.msg.payload as { body: string }).body)).toEqual(['queued-1', 'queued-2']);
  });

  it('notifySelected は established 後に selected を push(graph focus 追従)', () => {
    const { posted, emit } = stubSandboxPopup();
    handle = launchExtensionChannel({ html: '<x>', getProjection: () => ({}) })!;
    handle.notifySelected('pre'); // 前は no-op
    emit({ pkc: PKC_EXT, v: PKC_EXT_V, t: 'hello' });
    handle.notifySelected('e9');
    const sel = posted.filter((p) => p.msg.t === 'selected');
    expect(sel).toHaveLength(1);
    expect(sel[0]!.msg.lid).toBe('e9');
  });

  it('hint(select / open)は nonce 必須で onHint へ渡る', () => {
    const { posted, emit } = stubSandboxPopup();
    const onHint = vi.fn();
    handle = launchExtensionChannel({ html: '<x>', getProjection: () => ({}), onHint })!;
    emit({ pkc: PKC_EXT, v: PKC_EXT_V, t: 'hello' });
    const nonce = posted.find((p) => p.msg.t === 'projection')!.msg.nonce as string;
    emit({ pkc: PKC_EXT, v: PKC_EXT_V, t: 'hint', kind: 'select', lid: 'e1' }); // nonce 無し → 弾く
    expect(onHint).not.toHaveBeenCalled();
    emit({ pkc: PKC_EXT, v: PKC_EXT_V, nonce, t: 'hint', kind: 'select', lid: 'e1' });
    expect(onHint).toHaveBeenCalledWith({ kind: 'select', lid: 'e1' });
  });
});

describe('Tier T trusted — handshake & push(same-origin 全権の明示 opt-in)', () => {
  it('hello で established → projection を pinned origin で push', () => {
    const { child, posted } = stubChild();
    const projection = { entries: [{ lid: 'e1' }], stats: { totalEntries: 1 } };
    handle = launchExtensionChannel({ html: '<x>', getProjection: () => projection, ...TRUSTED })!;
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
    handle = launchExtensionChannel({ html: '<x>', getProjection: () => ({ tick: n++ }), ...TRUSTED })!;
    handle.pushProjection();
    expect(posted.filter((p) => p.msg.t === 'projection')).toHaveLength(0);
    fromChild(child, { pkc: PKC_EXT, v: PKC_EXT_V, t: 'hello' });
    handle.pushProjection();
    expect(posted.filter((p) => p.msg.t === 'projection').length).toBeGreaterThanOrEqual(2);
  });

  it('deliver は実体 1 件を push(送付ジェスチャの結果)', () => {
    const { child, posted } = stubChild();
    handle = launchExtensionChannel({ html: '<x>', getProjection: () => ({}), ...TRUSTED })!;
    fromChild(child, { pkc: PKC_EXT, v: PKC_EXT_V, t: 'hello' });
    handle.deliver({ kind: 'asset', asset_key: 'k1', mime: 'application/pdf', data_base64: 'QUJD' });
    const del = posted.find((p) => p.msg.t === 'deliver')!;
    expect(del.msg.payload).toMatchObject({ kind: 'asset', asset_key: 'k1', data_base64: 'QUJD' });
    expect(del.targetOrigin).toBe(ORIGIN);
  });
});

describe('security gate(Tier T)', () => {
  it('別 source からの hello は無視(identity binding)', () => {
    const { child } = stubChild();
    handle = launchExtensionChannel({ html: '<x>', getProjection: () => ({}), ...TRUSTED })!;
    window.dispatchEvent(new MessageEvent('message', {
      data: { pkc: PKC_EXT, v: PKC_EXT_V, t: 'hello' }, origin: ORIGIN, source: {} as Window,
    }));
    expect(handle.isEstablished()).toBe(false);
    void child;
  });

  it('別 origin からの hello は無視', () => {
    const { child } = stubChild();
    handle = launchExtensionChannel({ html: '<x>', getProjection: () => ({}), ...TRUSTED })!;
    fromChild(child, { pkc: PKC_EXT, v: PKC_EXT_V, t: 'hello' }, 'https://evil.example');
    expect(handle.isEstablished()).toBe(false);
  });

  it('hello 以外は nonce 不一致だと無視(write が処理されない)', () => {
    const { child, posted } = stubChild();
    const onWrite = vi.fn(() => true);
    handle = launchExtensionChannel({ html: '<x>', getProjection: () => ({}), onWrite, ...TRUSTED })!;
    fromChild(child, { pkc: PKC_EXT, v: PKC_EXT_V, t: 'hello' });
    fromChild(child, { pkc: PKC_EXT, v: PKC_EXT_V, t: 'write', ops: [{}] });
    expect(onWrite).not.toHaveBeenCalled();
    expect(posted.find((p) => p.msg.t === 'write-result')).toBeUndefined();
  });
});

describe('pkc:write(T2)は host 検証を通る', () => {
  function established() {
    const { child, posted } = stubChild();
    const onWrite = vi.fn((req: { ops: unknown[] }) => req.ops.length <= 1);
    handle = launchExtensionChannel({ html: '<x>', getProjection: () => ({}), onWrite, ...TRUSTED })!;
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
    handle = launchExtensionChannel({ html: '<x>', getProjection: () => ({}), ...TRUSTED })!;
    fromChild(child, { pkc: PKC_EXT, v: PKC_EXT_V, t: 'hello' });
    const nonce = posted.find((p) => p.msg.t === 'projection')!.msg.nonce as string;
    fromChild(child, { pkc: PKC_EXT, v: PKC_EXT_V, nonce, t: 'write', ops: [{}] });
    const res = posted.find((p) => p.msg.t === 'write-result')!;
    expect(res.msg.ok).toBe(false);
  });
});

describe('token 写像 helper', () => {
  it('sandboxTokensFor / allowAttributeFor の語彙', () => {
    expect(sandboxTokensFor(undefined)).toEqual(['allow-scripts']);
    expect(sandboxTokensFor(['downloads'])).toEqual(['allow-scripts', 'allow-downloads']);
    expect(allowAttributeFor(undefined)).toBe('');
    expect(allowAttributeFor(['fullscreen'])).toBe('fullscreen');
  });
});

describe('popup blocked', () => {
  it('window.open が null なら handle も null(画面ハイジャックしない)', () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    const h = launchExtensionChannel({ html: '<x>', getProjection: () => ({}) });
    expect(h).toBeNull();
  });
});
