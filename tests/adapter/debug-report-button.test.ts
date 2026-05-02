/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDispatcher } from '@adapter/state/dispatcher';
import { mountDebugReportButton } from '@adapter/ui/debug-report-button';

const BUTTON_SELECTOR = '[data-pkc-region="debug-report-button"]';
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

describe('mountDebugReportButton — gating', () => {
  it('does NOT mount a button when no debug feature is active', () => {
    const dispatcher = createDispatcher();
    const unmount = mountDebugReportButton(document.body, dispatcher);
    expect(document.body.querySelector(BUTTON_SELECTOR)).toBeNull();
    unmount();
  });

  it('mounts the button when ?pkc-debug=sync is present', () => {
    setUrl('pkc-debug=sync');
    const dispatcher = createDispatcher();
    mountDebugReportButton(document.body, dispatcher);
    const btn = document.body.querySelector<HTMLButtonElement>(BUTTON_SELECTOR);
    expect(btn).not.toBeNull();
    expect(btn!.textContent).toContain('Report');
    expect(btn!.getAttribute('data-pkc-debug')).toBe('true');
  });

  it('mounts the button when localStorage pkc2.debug is set', () => {
    window.localStorage.setItem('pkc2.debug', 'kanban');
    const dispatcher = createDispatcher();
    mountDebugReportButton(document.body, dispatcher);
    expect(document.body.querySelector(BUTTON_SELECTOR)).not.toBeNull();
  });

  it('is idempotent on repeat mount (single button only)', () => {
    setUrl('pkc-debug=*');
    const dispatcher = createDispatcher();
    mountDebugReportButton(document.body, dispatcher);
    mountDebugReportButton(document.body, dispatcher);
    expect(document.body.querySelectorAll(BUTTON_SELECTOR).length).toBe(1);
  });
});

describe('mountDebugReportButton — click → clipboard → toast', () => {
  it('writes JSON to clipboard and shows a confirmation toast', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { writeText },
    });
    setUrl('pkc-debug=*');
    const dispatcher = createDispatcher();
    mountDebugReportButton(document.body, dispatcher);

    const btn = document.body.querySelector<HTMLButtonElement>(BUTTON_SELECTOR)!;
    btn.click();
    await Promise.resolve();
    await Promise.resolve();

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

  it('shows the fallback modal when clipboard.writeText rejects', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { writeText },
    });
    setUrl('pkc-debug=*');
    const dispatcher = createDispatcher();
    mountDebugReportButton(document.body, dispatcher);

    const btn = document.body.querySelector<HTMLButtonElement>(BUTTON_SELECTOR)!;
    btn.click();
    // Allow the rejected promise + dispatchDebugReport's catch to settle.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

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
});

describe('mountDebugReportButton — unmount', () => {
  it('removes the button and any open fallback modal', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { writeText },
    });
    setUrl('pkc-debug=*');
    const dispatcher = createDispatcher();
    const unmount = mountDebugReportButton(document.body, dispatcher);

    document.body
      .querySelector<HTMLButtonElement>(BUTTON_SELECTOR)!
      .click();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(document.body.querySelector(FALLBACK_SELECTOR)).not.toBeNull();

    unmount();
    expect(document.body.querySelector(BUTTON_SELECTOR)).toBeNull();
    expect(document.body.querySelector(FALLBACK_SELECTOR)).toBeNull();
  });
});
