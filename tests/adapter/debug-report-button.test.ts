/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDispatcher } from '@adapter/state/dispatcher';
import { runDebugReportDump } from '@adapter/ui/debug-report-button';

const FALLBACK_SELECTOR = '[data-pkc-region="debug-report-fallback"]';

function setUrl(query: string): void {
  window.history.replaceState(null, '', query.length > 0 ? `?${query}` : '/');
}

beforeEach(() => {
  setUrl('');
  window.localStorage.clear();
  document.body.innerHTML = '';
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('runDebugReportDump — new-tab happy path', () => {
  it('opens the JSON report in a new tab via a Blob URL', () => {
    setUrl('pkc-debug=*');

    const fakeWindow = { document: { title: 'json' } } as Window;
    const open = vi.spyOn(window, 'open').mockReturnValue(fakeWindow);
    const createObjectURL = vi.fn().mockReturnValue('blob:fake-1');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL,
      revokeObjectURL,
    });

    const dispatcher = createDispatcher();
    runDebugReportDump(document.body, dispatcher);

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blobArg = createObjectURL.mock.calls[0]![0] as Blob;
    expect(blobArg.type).toBe('application/json');
    expect(blobArg.size).toBeGreaterThan(0);

    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith('blob:fake-1', '_blank', 'noopener');

    // Fallback modal must NOT appear when the new tab opens.
    expect(document.body.querySelector(FALLBACK_SELECTOR)).toBeNull();
  });

  it('serializes a schema 2 report into the Blob payload', async () => {
    setUrl('pkc-debug=*');
    const fakeWindow = {} as Window;
    vi.spyOn(window, 'open').mockReturnValue(fakeWindow);

    const blobs: Blob[] = [];
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: (b: Blob) => {
        blobs.push(b);
        return 'blob:fake-2';
      },
      revokeObjectURL: () => undefined,
    });

    const dispatcher = createDispatcher();
    runDebugReportDump(document.body, dispatcher);

    const text = await blobs[0]!.text();
    const parsed = JSON.parse(text);
    expect(parsed.schema).toBe(2);
    expect(parsed.phase).toBe('initializing');
    expect(parsed.level).toBe('structural');
  });
});

describe('runDebugReportDump — popup blocked → fallback modal', () => {
  it('opens the inline modal when window.open returns null', () => {
    setUrl('pkc-debug=*');
    vi.spyOn(window, 'open').mockReturnValue(null);
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: () => 'blob:fake-3',
      revokeObjectURL,
    });

    const dispatcher = createDispatcher();
    runDebugReportDump(document.body, dispatcher);

    // Blocked popup → blob URL must be revoked promptly so we don't
    // leak. The modal exposes the same JSON for manual copy.
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake-3');

    const modal = document.body.querySelector(FALLBACK_SELECTOR);
    expect(modal).not.toBeNull();
    const pre = modal!.querySelector<HTMLPreElement>(
      '[data-pkc-field="debug-report-json"]',
    );
    expect(pre).not.toBeNull();
    const parsed = JSON.parse(pre!.textContent ?? '');
    expect(parsed.schema).toBe(2);

    const close = modal!.querySelector<HTMLButtonElement>(
      '[data-pkc-action="dismiss-debug-report-fallback"]',
    );
    close!.click();
    expect(document.body.querySelector(FALLBACK_SELECTOR)).toBeNull();
  });

  it('replaces an existing modal when re-invoked (no stacking)', () => {
    setUrl('pkc-debug=*');
    vi.spyOn(window, 'open').mockReturnValue(null);
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: () => 'blob:fake-4',
      revokeObjectURL: () => undefined,
    });

    const dispatcher = createDispatcher();
    runDebugReportDump(document.body, dispatcher);
    runDebugReportDump(document.body, dispatcher);

    expect(document.body.querySelectorAll(FALLBACK_SELECTOR)).toHaveLength(1);
  });
});
