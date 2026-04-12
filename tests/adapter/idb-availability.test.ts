/**
 * @vitest-environment happy-dom
 */
/**
 * IDB availability probe + warning banner — ensures PKC2 detects
 * silent IDB breakage (file:// on some browsers, private-browsing,
 * quota exhaustion) and surfaces a clear banner instead of falling
 * back to pkc-data in silence.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { probeIDBAvailability } from '@adapter/platform/idb-store';
import { showIdbWarningBanner } from '@adapter/platform/idb-warning-banner';

/**
 * happy-dom does not ship a functional IndexedDB, so the probe tests
 * install lightweight fakes for the open() handler and observe the
 * resulting IDBAvailability record. We do NOT test a real IDB
 * round-trip here — that is covered by integration tests against real
 * browsers (Playwright / manual).
 */
describe('probeIDBAvailability', () => {
  let originalIDB: unknown;

  beforeEach(() => {
    originalIDB = (globalThis as { indexedDB?: unknown }).indexedDB;
  });

  afterEach(() => {
    (globalThis as { indexedDB?: unknown }).indexedDB = originalIDB;
    vi.restoreAllMocks();
  });

  it('returns available=false with reason when indexedDB is undefined (happy-dom default)', async () => {
    (globalThis as { indexedDB?: unknown }).indexedDB = undefined;
    const result = await probeIDBAvailability();
    expect(result.available).toBe(false);
    expect(result.reason).toContain('undefined');
  });

  it('returns available=false with reason when open() throws synchronously', async () => {
    (globalThis as { indexedDB?: unknown }).indexedDB = {
      open: () => {
        throw new Error('SecurityError: operation not permitted');
      },
    };
    const result = await probeIDBAvailability();
    expect(result.available).toBe(false);
    expect(result.reason).toContain('SecurityError');
  });

  it('returns available=false when open() emits onerror', async () => {
    (globalThis as { indexedDB?: unknown }).indexedDB = {
      open: () => {
        const req = {
          error: new Error('QuotaExceededError'),
          onerror: null as null | (() => void),
          onsuccess: null as null | (() => void),
          onupgradeneeded: null as null | (() => void),
          onblocked: null as null | (() => void),
        };
        queueMicrotask(() => req.onerror?.());
        return req;
      },
    };
    const result = await probeIDBAvailability();
    expect(result.available).toBe(false);
    expect(result.reason).toContain('QuotaExceededError');
  });

  it('returns available=true when the probe transaction round-trips successfully', async () => {
    // Minimal fake IDB: open → onupgradeneeded + onsuccess → txn →
    // put → get returns the value back → resolve available=true.
    (globalThis as { indexedDB?: unknown }).indexedDB = {
      open: () => {
        const storeNames: string[] = [];
        const data = new Map<string, unknown>();
        const store = {
          put: (value: unknown, key: string) => {
            data.set(key, value);
          },
          get: (key: string) => {
            const getReq = {
              result: data.get(key),
              onsuccess: null as null | (() => void),
              onerror: null as null | (() => void),
            };
            queueMicrotask(() => getReq.onsuccess?.());
            return getReq;
          },
        };
        const db = {
          objectStoreNames: {
            contains: (n: string) => storeNames.includes(n),
          },
          createObjectStore: (n: string) => {
            storeNames.push(n);
            return store;
          },
          transaction: () => ({ objectStore: () => store }),
          close: () => {},
        };
        const req = {
          result: db,
          error: null,
          onupgradeneeded: null as null | (() => void),
          onsuccess: null as null | (() => void),
          onerror: null as null | (() => void),
          onblocked: null as null | (() => void),
        };
        queueMicrotask(() => {
          req.onupgradeneeded?.();
          req.onsuccess?.();
        });
        return req;
      },
    };
    const result = await probeIDBAvailability();
    expect(result.available).toBe(true);
    expect(result.reason).toBeUndefined();
  });
});

describe('showIdbWarningBanner', () => {
  let host: HTMLElement;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(() => {
    host.remove();
  });

  it('renders a banner with data-pkc-region="idb-warning" and role="alert"', () => {
    const banner = showIdbWarningBanner({ host });
    expect(banner.getAttribute('data-pkc-region')).toBe('idb-warning');
    expect(banner.getAttribute('role')).toBe('alert');
    expect(host.contains(banner)).toBe(true);
  });

  it('includes the reason in the detail text when provided', () => {
    const banner = showIdbWarningBanner({
      host,
      reason: 'QuotaExceededError',
    });
    expect(banner.textContent).toContain('QuotaExceededError');
  });

  it('warns that changes will not persist', () => {
    const banner = showIdbWarningBanner({ host });
    expect(banner.textContent?.toLowerCase()).toContain('not persist');
  });

  it('is idempotent — a second call returns the same element without duplicating', () => {
    const first = showIdbWarningBanner({ host });
    const second = showIdbWarningBanner({ host });
    expect(second).toBe(first);
    expect(
      host.querySelectorAll('[data-pkc-region="idb-warning"]').length,
    ).toBe(1);
  });

  it('dismiss button removes the banner when clicked', () => {
    const banner = showIdbWarningBanner({ host });
    const dismiss = banner.querySelector<HTMLButtonElement>(
      '[data-pkc-action="dismiss-idb-warning"]',
    );
    expect(dismiss).not.toBeNull();
    dismiss!.click();
    expect(host.contains(banner)).toBe(false);
  });
});
