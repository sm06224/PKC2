/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDispatcher } from '@adapter/state/dispatcher';
import { runDebugReportDump } from '@adapter/ui/debug-report-button';

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

    const fakeWindow = {} as Window;
    const open = vi.spyOn(window, 'open').mockReturnValue(fakeWindow);
    const createObjectURL = vi.fn().mockReturnValue('blob:fake-1');
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL,
      revokeObjectURL: () => undefined,
    });

    const dispatcher = createDispatcher();
    runDebugReportDump(dispatcher);

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blobArg = createObjectURL.mock.calls[0]![0] as Blob;
    expect(blobArg.type).toBe('application/json');
    expect(blobArg.size).toBeGreaterThan(0);

    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith('blob:fake-1', '_blank', 'noopener');

    // No toast on the success path — the new tab is its own confirmation.
    expect(
      document.body.querySelector(
        '[data-pkc-region="toast-stack"] [data-pkc-region="toast"]',
      ),
    ).toBeNull();
    // No modal overlay must be created — PKC2 forbids backdrop modals.
    expect(
      document.body.querySelector('[data-pkc-region="debug-report-fallback"]'),
    ).toBeNull();
  });

  it('serializes a schema 2 report into the Blob payload', async () => {
    setUrl('pkc-debug=*');
    vi.spyOn(window, 'open').mockReturnValue({} as Window);

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
    runDebugReportDump(dispatcher);

    const text = await blobs[0]!.text();
    const parsed = JSON.parse(text);
    expect(parsed.schema).toBe(2);
    expect(parsed.phase).toBe('initializing');
    expect(parsed.level).toBe('structural');
  });
});

describe('runDebugReportDump — popup blocked → toast (no modal)', () => {
  it('emits a warn toast when window.open is blocked', () => {
    setUrl('pkc-debug=*');
    vi.spyOn(window, 'open').mockReturnValue(null);
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: () => 'blob:fake-3',
      revokeObjectURL,
    });

    const dispatcher = createDispatcher();
    runDebugReportDump(dispatcher);

    // Blob URL must be released immediately when the open is blocked.
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake-3');

    // Toast surfaces the failure to the user; modal overlay forbidden.
    const toast = document.body.querySelector(
      '[data-pkc-region="toast-stack"] [data-pkc-region="toast"]',
    );
    expect(toast).not.toBeNull();
    expect(toast!.textContent).toMatch(/pop-up blocked/i);

    // The legacy modal regions and classes must NOT exist.
    expect(
      document.body.querySelector('[data-pkc-region="debug-report-fallback"]'),
    ).toBeNull();
    expect(
      document.body.querySelector('.pkc-debug-report-fallback'),
    ).toBeNull();
  });
});
