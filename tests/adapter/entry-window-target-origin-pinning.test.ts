/** @vitest-environment happy-dom */
/**
 * #795 Phase 1.5: entry-window `pkc-entry-*` channel targetOrigin pinning.
 *
 * The audit (PR #797 review) flagged a third independent postMessage
 * surface — the entry/viewer/monitor child windows — where every send
 * used `targetOrigin: '*'`, including `pkc-entry-save` (title + body user
 * content). These windows are same-origin (`window.open('') +
 * document.write` → about:blank inherits the opener origin), so the
 * correct target is the host origin; `'null'` (file://) falls back to '*'.
 *
 * This file asserts:
 *   1. host→child sends are pinned to `window.location.origin` (not '*');
 *   2. the generated child inline script computes `__pkcTO` and uses it
 *      for every child→host `window.opener.postMessage` (no bare '*');
 *   3. the child inbound listeners bind to `e.source === window.opener`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Entry } from '../../src/core/model/record';

let capturedHtml = '';

function setupWindowOpenMock() {
  const childDoc = {
    open: vi.fn(),
    write: vi.fn((html: string) => { capturedHtml = html; }),
    close: vi.fn(),
  };
  const childWindow = {
    closed: false,
    focus: vi.fn(),
    document: childDoc,
    postMessage: vi.fn(),
  };
  const openSpy = vi
    .spyOn(window, 'open')
    .mockReturnValue(childWindow as unknown as Window);
  return { childWindow, openSpy };
}

function makeEntry(over: Partial<Entry> = {}): Entry {
  return {
    lid: `lid-${Math.random().toString(36).slice(2)}`,
    title: 'T',
    body: 'B',
    archetype: 'text',
    created_at: '2026-06-11T00:00:00Z',
    updated_at: '2026-06-11T00:00:00Z',
    ...over,
  } as Entry;
}

beforeEach(() => {
  capturedHtml = '';
});

describe('#795 Phase 1.5 — entry-window host→child targetOrigin pinning', () => {
  it('pkc-entry-saved reply is sent with the host origin, not *', async () => {
    const { openEntryWindow } = await import('../../src/adapter/ui/entry-window');
    const { childWindow } = setupWindowOpenMock();
    const entry = makeEntry();

    openEntryWindow(entry, false, vi.fn(), false);

    // Simulate the child posting a save back to the host. The host's
    // message listener replies with pkc-entry-saved pinned to its origin.
    const ev = new MessageEvent('message', {
      data: { type: 'pkc-entry-save', lid: entry.lid, title: 'New', body: 'Body' },
      source: childWindow as unknown as Window,
    });
    window.dispatchEvent(ev);

    const savedCall = (childWindow.postMessage as ReturnType<typeof vi.fn>).mock.calls
      .find((c) => c[0] && c[0].type === 'pkc-entry-saved');
    expect(savedCall).toBeDefined();
    expect(savedCall![1]).toBe(window.location.origin);
    expect(savedCall![1]).not.toBe('*');
  });

  it('pushTitleUpdate pins targetOrigin to the host origin', async () => {
    const { openEntryWindow, pushTitleUpdate } = await import('../../src/adapter/ui/entry-window');
    const { childWindow } = setupWindowOpenMock();
    const entry = makeEntry();
    openEntryWindow(entry, false, vi.fn(), false);

    expect(pushTitleUpdate(entry.lid, 'Renamed')).toBe(true);
    const call = (childWindow.postMessage as ReturnType<typeof vi.fn>).mock.calls
      .find((c) => c[0] && c[0].type === 'pkc-entry-update-title');
    expect(call).toBeDefined();
    expect(call![1]).toBe(window.location.origin);
  });
});

describe('#795 Phase 1.5 — child inline script pins child→host sends', () => {
  it('generated HTML computes __pkcTO and uses it for opener.postMessage', async () => {
    const { openEntryWindow } = await import('../../src/adapter/ui/entry-window');
    setupWindowOpenMock();
    const entry = makeEntry({ archetype: 'text' });
    openEntryWindow(entry, false, vi.fn(), false);

    // The pin helper is injected and the save send uses it.
    expect(capturedHtml).toContain("var __pkcTO=(location.origin&&location.origin!=='null')?location.origin:'*';");
    expect(capturedHtml).toContain("type: 'pkc-entry-save', lid: lid, title: title, body: body }, __pkcTO)");
    // No bare '*' targetOrigin remains on any opener.postMessage in the child.
    expect(capturedHtml).not.toMatch(/window\.opener\.postMessage\([^;]*\},\s*'\*'\)/);
  });

  it('child inbound listener binds to e.source === window.opener', async () => {
    const { openEntryWindow } = await import('../../src/adapter/ui/entry-window');
    setupWindowOpenMock();
    const entry = makeEntry({ archetype: 'text' });
    openEntryWindow(entry, false, vi.fn(), false);

    expect(capturedHtml).toContain('if (e.source !== window.opener) return;');
  });
});
