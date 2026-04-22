// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  mountMessageBridge,
  buildEnvelope,
} from '@adapter/transport/message-bridge';

const CONTAINER_ID = 'test-container-001';

function createMessageEvent(data: unknown, origin = 'http://localhost'): MessageEvent {
  return new MessageEvent('message', {
    data,
    origin,
    source: window,
  });
}

function validPing(targetId: string | null = null) {
  return {
    protocol: 'pkc-message',
    version: 1,
    type: 'ping',
    source_id: 'remote-container',
    target_id: targetId,
    payload: null,
    timestamp: '2026-04-06T00:00:00Z',
  };
}

describe('buildEnvelope', () => {
  it('creates a valid MessageEnvelope', () => {
    const env = buildEnvelope('src-001', 'ping', null);

    expect(env.protocol).toBe('pkc-message');
    expect(env.version).toBe(1);
    expect(env.type).toBe('ping');
    expect(env.source_id).toBe('src-001');
    expect(env.target_id).toBeNull();
    expect(env.payload).toBeNull();
    expect(env.timestamp).toBeTruthy();
  });

  it('includes target_id and payload when provided', () => {
    const env = buildEnvelope('src', 'custom', { key: 'val' }, 'target-001');

    expect(env.target_id).toBe('target-001');
    expect(env.payload).toEqual({ key: 'val' });
  });
});

describe('mountMessageBridge', () => {
  let handle: ReturnType<typeof mountMessageBridge>;

  afterEach(() => {
    handle?.destroy();
  });

  it('mounts and can be destroyed', () => {
    handle = mountMessageBridge({ containerId: CONTAINER_ID });
    expect(handle.destroy).toBeTypeOf('function');
    expect(handle.sender).toBeDefined();
  });

  it('ignores non-PKC messages silently', () => {
    const onReject = vi.fn();
    handle = mountMessageBridge({ containerId: CONTAINER_ID, onReject });

    window.dispatchEvent(createMessageEvent({ some: 'other-data' }));

    // Non-PKC messages are silently ignored, not rejected
    expect(onReject).not.toHaveBeenCalled();
  });

  it('rejects invalid PKC messages', () => {
    const onReject = vi.fn();
    handle = mountMessageBridge({ containerId: CONTAINER_ID, onReject });

    window.dispatchEvent(createMessageEvent({
      protocol: 'pkc-message',
      version: 99, // wrong version
    }));

    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it('auto-responds to ping with pong', () => {
    handle = mountMessageBridge({ containerId: CONTAINER_ID });

    const postMessageSpy = vi.spyOn(window, 'postMessage');

    window.dispatchEvent(createMessageEvent(validPing()));

    expect(postMessageSpy).toHaveBeenCalledTimes(1);
    const sentData = postMessageSpy.mock.calls[0]![0];
    expect(sentData.protocol).toBe('pkc-message');
    expect(sentData.type).toBe('pong');
    expect(sentData.source_id).toBe(CONTAINER_ID);
    expect(sentData.target_id).toBe('remote-container');

    postMessageSpy.mockRestore();
  });

  it('includes profile in pong payload when pongProfile provided', () => {
    const profile = {
      app_id: 'pkc2',
      version: '2.0.0',
      schema_version: 1,
      embedded: true,
      capabilities: ['core', 'export'],
    };
    handle = mountMessageBridge({
      containerId: CONTAINER_ID,
      pongProfile: () => profile,
    });

    const postMessageSpy = vi.spyOn(window, 'postMessage');
    window.dispatchEvent(createMessageEvent(validPing()));

    const sentData = postMessageSpy.mock.calls[0]![0];
    expect(sentData.type).toBe('pong');
    expect(sentData.payload).toEqual(profile);

    postMessageSpy.mockRestore();
  });

  it('sends null payload in pong when no pongProfile provided', () => {
    handle = mountMessageBridge({ containerId: CONTAINER_ID });

    const postMessageSpy = vi.spyOn(window, 'postMessage');
    window.dispatchEvent(createMessageEvent(validPing()));

    const sentData = postMessageSpy.mock.calls[0]![0];
    expect(sentData.type).toBe('pong');
    expect(sentData.payload).toBeNull();

    postMessageSpy.mockRestore();
  });

  it('does not call onMessage for ping (handled internally)', () => {
    const onMessage = vi.fn();
    handle = mountMessageBridge({ containerId: CONTAINER_ID, onMessage });

    window.dispatchEvent(createMessageEvent(validPing()));

    expect(onMessage).not.toHaveBeenCalled();
  });

  it('routes non-ping messages to onMessage callback', () => {
    const onMessage = vi.fn();
    handle = mountMessageBridge({ containerId: CONTAINER_ID, onMessage });

    const customMsg = {
      ...validPing(),
      type: 'custom',
      payload: { data: 'test' },
    };
    window.dispatchEvent(createMessageEvent(customMsg));

    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage.mock.calls[0]![0].type).toBe('custom');
    expect(onMessage.mock.calls[0]![0].payload).toEqual({ data: 'test' });
  });

  it('passes pong to onMessage (informational)', () => {
    const onMessage = vi.fn();
    handle = mountMessageBridge({ containerId: CONTAINER_ID, onMessage });

    const pongMsg = { ...validPing(), type: 'pong' };
    window.dispatchEvent(createMessageEvent(pongMsg));

    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage.mock.calls[0]![0].type).toBe('pong');
  });

  it('filters messages by target_id', () => {
    const onMessage = vi.fn();
    handle = mountMessageBridge({ containerId: CONTAINER_ID, onMessage });

    // Message for a different container
    const msg = {
      ...validPing(),
      type: 'custom',
      target_id: 'other-container',
    };
    window.dispatchEvent(createMessageEvent(msg));

    expect(onMessage).not.toHaveBeenCalled();
  });

  it('accepts messages with target_id matching local container', () => {
    const onMessage = vi.fn();
    handle = mountMessageBridge({ containerId: CONTAINER_ID, onMessage });

    const msg = {
      ...validPing(),
      type: 'custom',
      target_id: CONTAINER_ID,
    };
    window.dispatchEvent(createMessageEvent(msg));

    expect(onMessage).toHaveBeenCalledTimes(1);
  });

  it('accepts broadcast messages (target_id = null)', () => {
    const onMessage = vi.fn();
    handle = mountMessageBridge({ containerId: CONTAINER_ID, onMessage });

    const msg = { ...validPing(), type: 'custom', target_id: null };
    window.dispatchEvent(createMessageEvent(msg));

    expect(onMessage).toHaveBeenCalledTimes(1);
  });

  it('rejects messages from disallowed origins', () => {
    const onReject = vi.fn();
    const onMessage = vi.fn();
    handle = mountMessageBridge({
      containerId: CONTAINER_ID,
      allowedOrigins: ['http://trusted.example'],
      onMessage,
      onReject,
    });

    window.dispatchEvent(createMessageEvent(validPing(), 'http://evil.example'));

    expect(onMessage).not.toHaveBeenCalled();
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it('accepts messages from allowed origins', () => {
    const onMessage = vi.fn();
    handle = mountMessageBridge({
      containerId: CONTAINER_ID,
      allowedOrigins: ['http://trusted.example'],
      onMessage,
    });

    const msg = { ...validPing(), type: 'custom' };
    window.dispatchEvent(createMessageEvent(msg, 'http://trusted.example'));

    expect(onMessage).toHaveBeenCalledTimes(1);
  });

  it('stops receiving after destroy', () => {
    const onMessage = vi.fn();
    handle = mountMessageBridge({ containerId: CONTAINER_ID, onMessage });
    handle.destroy();

    const msg = { ...validPing(), type: 'custom' };
    window.dispatchEvent(createMessageEvent(msg));

    expect(onMessage).not.toHaveBeenCalled();
  });

  // ── Capture profile v0 §9.1 / §9.2: explicit allowlist + null opt-in ──

  it('rejects "null" origin by default even when allowedOrigins is empty (accept-all)', () => {
    const onMessage = vi.fn();
    const onReject = vi.fn();
    handle = mountMessageBridge({ containerId: CONTAINER_ID, onMessage, onReject });

    const msg = { ...validPing(), type: 'custom' };
    window.dispatchEvent(createMessageEvent(msg, 'null'));

    expect(onMessage).not.toHaveBeenCalled();
    expect(onReject).toHaveBeenCalledTimes(1);
    expect(onReject.mock.calls[0]![1]).toContain('null');
  });

  it('rejects "null" origin even when a non-null allowlist is set', () => {
    const onMessage = vi.fn();
    const onReject = vi.fn();
    handle = mountMessageBridge({
      containerId: CONTAINER_ID,
      allowedOrigins: ['http://trusted.example'],
      onMessage,
      onReject,
    });

    const msg = { ...validPing(), type: 'custom' };
    window.dispatchEvent(createMessageEvent(msg, 'null'));

    expect(onMessage).not.toHaveBeenCalled();
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it('accepts "null" origin only when explicitly opted in via allowlist', () => {
    const onMessage = vi.fn();
    handle = mountMessageBridge({
      containerId: CONTAINER_ID,
      allowedOrigins: ['null'],
      onMessage,
    });

    const msg = { ...validPing(), type: 'custom' };
    window.dispatchEvent(createMessageEvent(msg, 'null'));

    expect(onMessage).toHaveBeenCalledTimes(1);
  });

  it('rejects non-listed origin when explicit allowedOrigins is set (production path shape)', () => {
    const onMessage = vi.fn();
    const onReject = vi.fn();
    handle = mountMessageBridge({
      containerId: CONTAINER_ID,
      allowedOrigins: ['http://pkc.local'],
      onMessage,
      onReject,
    });

    const msg = { ...validPing(), type: 'custom' };
    window.dispatchEvent(createMessageEvent(msg, 'http://evil.example'));

    expect(onMessage).not.toHaveBeenCalled();
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it('accepts origin that matches explicit allowedOrigins entry', () => {
    const onMessage = vi.fn();
    handle = mountMessageBridge({
      containerId: CONTAINER_ID,
      allowedOrigins: ['http://pkc.local'],
      onMessage,
    });

    const msg = { ...validPing(), type: 'custom' };
    window.dispatchEvent(createMessageEvent(msg, 'http://pkc.local'));

    expect(onMessage).toHaveBeenCalledTimes(1);
  });
});

describe('MessageSender', () => {
  let handle: ReturnType<typeof mountMessageBridge>;

  beforeEach(() => {
    handle = mountMessageBridge({ containerId: CONTAINER_ID });
  });

  afterEach(() => {
    handle.destroy();
  });

  it('sends a valid envelope via postMessage', () => {
    const target = { postMessage: vi.fn() } as unknown as Window;

    handle.sender.send(target, 'ping', null);

    expect(target.postMessage).toHaveBeenCalledTimes(1);
    const [data, origin] = (target.postMessage as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(data.protocol).toBe('pkc-message');
    expect(data.type).toBe('ping');
    expect(data.source_id).toBe(CONTAINER_ID);
    expect(origin).toBe('*');
  });

  it('sends with custom target_id and origin', () => {
    const target = { postMessage: vi.fn() } as unknown as Window;

    handle.sender.send(target, 'custom', { key: 'val' }, 'target-001', 'http://example.com');

    const [data, origin] = (target.postMessage as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(data.target_id).toBe('target-001');
    expect(data.payload).toEqual({ key: 'val' });
    expect(origin).toBe('http://example.com');
  });
});
