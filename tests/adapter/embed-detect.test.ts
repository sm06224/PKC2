// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * Tests for embed detection.
 *
 * happy-dom provides window.self and window.top, but their identity
 * comparison may differ from real browsers. We test by controlling
 * the globals explicitly.
 */

describe('isEmbedded', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns false when window.self === window.top (standalone)', async () => {
    // Ensure self and top are the same object
    vi.stubGlobal('self', window);
    vi.stubGlobal('top', window);

    // Re-import to pick up current globals
    const { isEmbedded } = await import('@adapter/platform/embed-detect');
    expect(isEmbedded()).toBe(false);
  });

  it('returns true when window.self !== window.top (iframe)', async () => {
    vi.stubGlobal('self', window);
    vi.stubGlobal('top', {} as Window);

    const { isEmbedded } = await import('@adapter/platform/embed-detect');
    expect(isEmbedded()).toBe(true);
  });

  it('returns true when accessing window.top throws (cross-origin iframe)', async () => {
    vi.stubGlobal('self', window);
    Object.defineProperty(globalThis, 'top', {
      get() { throw new DOMException('Blocked', 'SecurityError'); },
      configurable: true,
    });

    const { isEmbedded } = await import('@adapter/platform/embed-detect');
    expect(isEmbedded()).toBe(true);
  });
});

describe('detectEmbedContext', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns embedded=false, parentOrigin=null for standalone', async () => {
    vi.stubGlobal('self', window);
    vi.stubGlobal('top', window);

    const { detectEmbedContext } = await import('@adapter/platform/embed-detect');
    const ctx = detectEmbedContext();
    expect(ctx.embedded).toBe(false);
    expect(ctx.parentOrigin).toBeNull();
  });

  it('returns embedded=true with parentOrigin from referrer', async () => {
    vi.stubGlobal('self', window);
    vi.stubGlobal('top', {} as Window);
    Object.defineProperty(document, 'referrer', {
      value: 'http://parent.example.com/page.html',
      configurable: true,
    });

    const { detectEmbedContext } = await import('@adapter/platform/embed-detect');
    const ctx = detectEmbedContext();
    expect(ctx.embedded).toBe(true);
    expect(ctx.parentOrigin).toBe('http://parent.example.com');

    // Restore referrer
    Object.defineProperty(document, 'referrer', {
      value: '',
      configurable: true,
    });
  });

  it('returns parentOrigin=null when referrer is empty', async () => {
    vi.stubGlobal('self', window);
    vi.stubGlobal('top', {} as Window);
    Object.defineProperty(document, 'referrer', {
      value: '',
      configurable: true,
    });

    const { detectEmbedContext } = await import('@adapter/platform/embed-detect');
    const ctx = detectEmbedContext();
    expect(ctx.embedded).toBe(true);
    expect(ctx.parentOrigin).toBeNull();
  });
});
