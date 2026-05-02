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

describe('runDebugReportDump — download happy path', () => {
  it('synthesizes a click on a hidden <a download> with a sortable filename', () => {
    setUrl('pkc-debug=*');
    const createObjectURL = vi.fn().mockReturnValue('blob:fake-1');
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL,
      revokeObjectURL: () => undefined,
    });
    // Spy on the anchor's click() so we can assert the synthetic
    // navigation fires without the test harness actually downloading.
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click');

    const dispatcher = createDispatcher();
    runDebugReportDump(dispatcher);

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blobArg = createObjectURL.mock.calls[0]![0] as Blob;
    expect(blobArg.type).toBe('application/json');
    expect(blobArg.size).toBeGreaterThan(0);

    expect(clickSpy).toHaveBeenCalledTimes(1);
    const anchor = clickSpy.mock.instances[0] as unknown as HTMLAnchorElement;
    // Filesystem-safe filename: pkc2-debug-YYYY-MM-DDTHH-MM-SSZ.json
    expect(anchor.download).toMatch(
      /^pkc2-debug-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z\.json$/,
    );
    expect(anchor.href).toBe('blob:fake-1');

    // Anchor must be removed from the DOM after the click — no
    // stray <a> elements littering the page across re-dumps.
    expect(document.body.querySelector('a[download]')).toBeNull();

    // No toast on success — the browser's download UI is the
    // confirmation. Modal/overlay paths are gone entirely.
    expect(
      document.body.querySelector(
        '[data-pkc-region="toast-stack"] [data-pkc-region="toast"]',
      ),
    ).toBeNull();
    expect(
      document.body.querySelector('[data-pkc-region="debug-report-fallback"]'),
    ).toBeNull();
  });

  it('serializes a schema 3 report into the Blob payload', async () => {
    setUrl('pkc-debug=*');
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
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
    expect(parsed.schema).toBe(3);
    expect(parsed.phase).toBe('initializing');
    expect(parsed.level).toBe('structural');
  });
});

describe('runDebugReportDump — failure surfaces a toast', () => {
  it('emits a warn toast (no throw) when URL.createObjectURL fails', () => {
    setUrl('pkc-debug=*');
    // Pathological surrogate for engine OOM: createObjectURL itself
    // raises. The "never throw" contract on runDebugReportDump
    // requires dispatchDebugReport to catch this and return false;
    // runDebugReportDump then surfaces the toast.
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: () => {
        throw new Error('out of memory');
      },
      revokeObjectURL: () => undefined,
    });

    const dispatcher = createDispatcher();
    expect(() => runDebugReportDump(dispatcher)).not.toThrow();

    const toast = document.body.querySelector(
      '[data-pkc-region="toast-stack"] [data-pkc-region="toast"]',
    );
    expect(toast).not.toBeNull();
    expect(toast!.textContent).toMatch(/failed to generate debug report/i);
  });
});
