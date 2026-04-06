// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleExportRequest } from '@adapter/transport/export-handler';
import type { ExportResultPayload } from '@adapter/transport/export-handler';
import type { MessageEnvelope } from '@core/model/message';
import type { Container } from '@core/model/container';
import type { MessageSender } from '@adapter/transport/message-bridge';
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
  // Set up minimal DOM elements that buildExportHtml reads from
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

  // html data attributes
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

describe('handleExportRequest', () => {
  let mockSender: MessageSender;
  let mockWindow: Window;

  beforeEach(() => {
    setupDom();
    mockSender = {
      send: vi.fn(),
    };
    mockWindow = {} as Window;
    return () => { cleanupDom(); };
  });

  it('returns false and warns when not embedded', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const envelope = makeExportRequest();

    const result = handleExportRequest(envelope, mockContainer, mockSender, mockWindow, false);

    expect(result).toBe(false);
    expect(mockSender.send).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith('[PKC2] export:request ignored: not embedded');
    warnSpy.mockRestore();
  });

  it('sends export:result when embedded', () => {
    const envelope = makeExportRequest();

    const result = handleExportRequest(envelope, mockContainer, mockSender, mockWindow, true);

    expect(result).toBe(true);
    expect(mockSender.send).toHaveBeenCalledTimes(1);

    const [target, type, payload, targetId] = (mockSender.send as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(target).toBe(mockWindow);
    expect(type).toBe('export:result');
    expect(targetId).toBe('parent-app');

    const resultPayload = payload as ExportResultPayload;
    expect(resultPayload.html).toContain('<!DOCTYPE html>');
    expect(resultPayload.html).toContain('pkc-core');
    expect(resultPayload.filename).toMatch(/^pkc2-.*\.html$/);
    expect(resultPayload.size).toBeGreaterThan(0);
    expect(resultPayload.size).toBe(resultPayload.html.length);
  });

  it('uses filename from payload when provided', () => {
    const envelope: MessageEnvelope = {
      ...makeExportRequest(),
      payload: { filename: 'custom-export' },
    };

    handleExportRequest(envelope, mockContainer, mockSender, mockWindow, true);

    const [, , payload] = (mockSender.send as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect((payload as ExportResultPayload).filename).toBe('custom-export.html');
  });

  it('targets response to the source_id of the request', () => {
    const envelope = makeExportRequest('requester-42');

    handleExportRequest(envelope, mockContainer, mockSender, mockWindow, true);

    const [, , , targetId] = (mockSender.send as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(targetId).toBe('requester-42');
  });
});
