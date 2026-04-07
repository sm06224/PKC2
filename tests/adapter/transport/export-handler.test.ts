// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportRequestHandler } from '@adapter/transport/export-handler';
import type { ExportResultPayload } from '@adapter/transport/export-handler';
import type { HandlerContext } from '@adapter/transport/message-handler';
import type { MessageEnvelope } from '@core/model/message';
import type { Container } from '@core/model/container';
import type { MessageSender } from '@adapter/transport/message-bridge';
import type { Dispatcher } from '@adapter/state/dispatcher';
import { SLOT } from '@runtime/contract';

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

function makeExportRequest(sourceId = 'parent-app'): MessageEnvelope {
  return {
    protocol: 'pkc-message',
    version: 1,
    type: 'export:request',
    source_id: sourceId,
    target_id: 'test-container',
    payload: null,
    timestamp: '2026-04-06T12:00:00Z',
  };
}

function setupDom(): void {
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
    version: '2.0.0', schema: 1, build_at: '20260406120000',
    kind: 'dev', code_integrity: 'sha256:abc', capabilities: [],
  });
  document.body.appendChild(meta);

  document.documentElement.setAttribute('data-pkc-app', 'pkc2');
  document.documentElement.setAttribute('data-pkc-version', '2.0.0');
  document.documentElement.setAttribute('data-pkc-schema', '1');
  document.documentElement.setAttribute('data-pkc-timestamp', '20260406120000');
  document.documentElement.setAttribute('data-pkc-kind', 'dev');
}

function cleanupDom(): void {
  for (const id of [SLOT.ROOT, SLOT.CORE, SLOT.META]) {
    document.getElementById(id)?.remove();
  }
  document.querySelector(`#${SLOT.STYLES}`)?.remove();
  document.querySelector(`#${SLOT.THEME}`)?.remove();
}

function makeContext(overrides: Partial<HandlerContext> = {}): HandlerContext {
  return {
    envelope: makeExportRequest(),
    sourceWindow: {} as Window,
    origin: 'http://localhost',
    container: mockContainer,
    embedded: true,
    dispatcher: { dispatch: vi.fn(), getState: vi.fn(), onState: vi.fn(), onEvent: vi.fn() } as unknown as Dispatcher,
    sender: { send: vi.fn() } as unknown as MessageSender,
    ...overrides,
  };
}

/** Wait for all microtasks (Promise.then) to flush. */
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('exportRequestHandler', () => {
  beforeEach(() => {
    setupDom();
    return () => { cleanupDom(); };
  });

  it('processes export even when embedded=false (capability guard is external)', async () => {
    const ctx = makeContext({ embedded: false });

    const result = exportRequestHandler(ctx);
    await flushMicrotasks();

    expect(result).toBe(true);
    expect(ctx.sender.send).toHaveBeenCalledTimes(1);
  });

  it('returns false when container is null', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ctx = makeContext({ container: null });

    const result = exportRequestHandler(ctx);

    expect(result).toBe(false);
    expect(ctx.sender.send).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('sends export:result when embedded with container', async () => {
    const ctx = makeContext();

    const result = exportRequestHandler(ctx);
    await flushMicrotasks();

    expect(result).toBe(true);
    expect(ctx.sender.send).toHaveBeenCalledTimes(1);

    const [target, type, payload, targetId] = (ctx.sender.send as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(target).toBe(ctx.sourceWindow);
    expect(type).toBe('export:result');
    expect(targetId).toBe('parent-app');

    const resultPayload = payload as ExportResultPayload;
    expect(resultPayload.html).toContain('<!DOCTYPE html>');
    expect(resultPayload.html).toContain('pkc-core');
    expect(resultPayload.filename).toMatch(/^pkc2-.*\.html$/);
    expect(resultPayload.size).toBeGreaterThan(0);
    expect(resultPayload.size).toBe(resultPayload.html.length);
  });

  it('uses filename from payload when provided', async () => {
    const ctx = makeContext({
      envelope: { ...makeExportRequest(), payload: { filename: 'custom-export' } },
    });

    exportRequestHandler(ctx);
    await flushMicrotasks();

    const [, , payload] = (ctx.sender.send as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect((payload as ExportResultPayload).filename).toBe('custom-export.html');
  });

  it('targets response to the source_id of the request', async () => {
    const ctx = makeContext({
      envelope: makeExportRequest('requester-42'),
    });

    exportRequestHandler(ctx);
    await flushMicrotasks();

    const [, , , targetId] = (ctx.sender.send as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(targetId).toBe('requester-42');
  });
});
