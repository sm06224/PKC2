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
});

describe('runDebugReportDump — clipboard happy path', () => {
  it('writes JSON to clipboard and shows a confirmation toast', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { writeText },
    });
    setUrl('pkc-debug=*');
    const dispatcher = createDispatcher();

    await runDebugReportDump(document.body, dispatcher);

    expect(writeText).toHaveBeenCalledTimes(1);
    const payload = writeText.mock.calls[0]![0] as string;
    const parsed = JSON.parse(payload);
    expect(parsed.schema).toBe(2);
    expect(typeof parsed.pkc.version).toBe('string');
    expect(parsed.phase).toBe('initializing');

    // Toast confirmation appears in the toast stack region.
    const toast = document.body.querySelector(
      '[data-pkc-region="toast-stack"] [data-pkc-region="toast"]',
    );
    expect(toast).not.toBeNull();
    expect(toast!.textContent).toContain('clipboard');
  });
});

describe('runDebugReportDump — clipboard failure → fallback modal', () => {
  it('shows the fallback modal when clipboard.writeText rejects', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { writeText },
    });
    setUrl('pkc-debug=*');
    const dispatcher = createDispatcher();

    await runDebugReportDump(document.body, dispatcher);

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

  it('replaces an existing modal when re-invoked (no stacking)', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { writeText },
    });
    setUrl('pkc-debug=*');
    const dispatcher = createDispatcher();

    await runDebugReportDump(document.body, dispatcher);
    await runDebugReportDump(document.body, dispatcher);

    expect(document.body.querySelectorAll(FALLBACK_SELECTOR)).toHaveLength(1);
  });
});
