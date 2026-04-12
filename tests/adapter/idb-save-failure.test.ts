/**
 * @vitest-environment happy-dom
 */
/**
 * Runtime IDB save-failure surfacing — ensures that when
 * `mountPersistence` observes a store.save() rejection (quota /
 * abort / generic) the resulting `onError` call surfaces a
 * non-blocking, coalescing banner separate from the boot-time
 * availability banner.
 *
 * Boundary: these tests do NOT exercise IndexedDB directly. They
 * drive `mountPersistence` against a mock store whose `save()`
 * rejects on demand — the unit under test is the onError → banner
 * wiring, plus the banner's coalescing / dismissal semantics.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createDispatcher } from '@adapter/state/dispatcher';
import { createMemoryStore } from '@adapter/platform/idb-store';
import { mountPersistence } from '@adapter/platform/persistence';
import {
  showIdbSaveFailureBanner,
  showIdbWarningBanner,
  classifySaveError,
} from '@adapter/platform/idb-warning-banner';
import type { Container } from '@core/model/container';

const T = '2026-04-12T00:00:00Z';

const mockContainer: Container = {
  meta: {
    container_id: 'c1',
    title: 'Test',
    created_at: T,
    updated_at: T,
    schema_version: 1,
  },
  entries: [
    { lid: 'e1', title: 'Entry', body: 'B', archetype: 'text', created_at: T, updated_at: T },
  ],
  relations: [],
  revisions: [],
  assets: {},
};

describe('classifySaveError', () => {
  it('classifies QuotaExceededError with canned reason', () => {
    const err = Object.assign(new Error('storage full'), { name: 'QuotaExceededError' });
    const reason = classifySaveError(err);
    expect(reason).toContain('QuotaExceededError');
    expect(reason).toContain('storage');
  });

  it('classifies AbortError with transaction-abort reason when message empty', () => {
    const err = Object.assign(new Error(''), { name: 'AbortError' });
    const reason = classifySaveError(err);
    expect(reason).toContain('AbortError');
    expect(reason.toLowerCase()).toContain('abort');
  });

  it('preserves AbortError message when provided', () => {
    const err = Object.assign(new Error('disk quota exceeded'), { name: 'AbortError' });
    const reason = classifySaveError(err);
    expect(reason).toContain('AbortError');
    expect(reason).toContain('disk quota');
  });

  it('classifies generic Error with name + message', () => {
    const err = new Error('something broke');
    const reason = classifySaveError(err);
    expect(reason).toContain('Error');
    expect(reason).toContain('something broke');
  });

  it('handles non-Error throws', () => {
    expect(classifySaveError('raw string error')).toContain('raw string error');
    expect(classifySaveError(42)).toContain('42');
  });

  it('truncates overly long reasons to keep the banner readable', () => {
    const long = 'x'.repeat(500);
    const err = new Error(long);
    const reason = classifySaveError(err);
    expect(reason.length).toBeLessThanOrEqual(140);
    expect(reason.endsWith('…')).toBe(true);
  });
});

describe('showIdbSaveFailureBanner', () => {
  let host: HTMLElement;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(() => {
    host.remove();
  });

  it('renders a banner with data-pkc-region="idb-save-warning" and role="alert"', () => {
    const banner = showIdbSaveFailureBanner({ host });
    expect(banner.getAttribute('data-pkc-region')).toBe('idb-save-warning');
    expect(banner.getAttribute('role')).toBe('alert');
    expect(host.contains(banner)).toBe(true);
  });

  it('includes the reason in the detail text when provided', () => {
    const banner = showIdbSaveFailureBanner({
      host,
      reason: 'QuotaExceededError: browser storage full',
    });
    expect(banner.textContent).toContain('QuotaExceededError');
  });

  it('warns about potential data loss and recommends export', () => {
    const banner = showIdbSaveFailureBanner({ host });
    const text = banner.textContent?.toLowerCase() ?? '';
    // Wording is intentionally hedged ("may not have been persisted")
    expect(text).toContain('persist');
    expect(text).toContain('export');
  });

  it('is coalescing — second call does not add a second banner', () => {
    const first = showIdbSaveFailureBanner({ host, reason: 'QuotaExceededError' });
    const second = showIdbSaveFailureBanner({ host, reason: 'AbortError' });
    expect(second).toBe(first);
    expect(
      host.querySelectorAll('[data-pkc-region="idb-save-warning"]').length,
    ).toBe(1);
  });

  it('refreshes the reason text on a repeat call so the latest failure is shown', () => {
    showIdbSaveFailureBanner({ host, reason: 'QuotaExceededError' });
    const refreshed = showIdbSaveFailureBanner({ host, reason: 'AbortError' });
    expect(refreshed.textContent).toContain('AbortError');
    expect(refreshed.textContent).not.toContain('QuotaExceededError');
  });

  it('dismiss button removes the banner', () => {
    const banner = showIdbSaveFailureBanner({ host });
    const dismiss = banner.querySelector<HTMLButtonElement>(
      '[data-pkc-action="dismiss-idb-save-warning"]',
    );
    expect(dismiss).not.toBeNull();
    dismiss!.click();
    expect(host.contains(banner)).toBe(false);
  });

  it('a subsequent failure after dismiss creates a new banner (session-only suppression)', () => {
    const first = showIdbSaveFailureBanner({ host, reason: 'QuotaExceededError' });
    first
      .querySelector<HTMLButtonElement>('[data-pkc-action="dismiss-idb-save-warning"]')!
      .click();
    expect(host.contains(first)).toBe(false);

    const second = showIdbSaveFailureBanner({ host, reason: 'AbortError' });
    expect(second).not.toBe(first);
    expect(host.contains(second)).toBe(true);
    expect(second.textContent).toContain('AbortError');
  });

  it('coexists with the boot-time idb-warning banner (distinct regions)', () => {
    const boot = showIdbWarningBanner({ host, reason: 'indexedDB undefined' });
    const save = showIdbSaveFailureBanner({ host, reason: 'QuotaExceededError' });
    expect(boot).not.toBe(save);
    expect(host.querySelectorAll('[data-pkc-region="idb-warning"]').length).toBe(1);
    expect(host.querySelectorAll('[data-pkc-region="idb-save-warning"]').length).toBe(1);
  });
});

describe('mountPersistence onError integration', () => {
  let host: HTMLElement;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    vi.useFakeTimers();
  });

  afterEach(() => {
    host.remove();
    vi.useRealTimers();
    // Clean any banner that may have escaped scope
    document
      .querySelectorAll('[data-pkc-region="idb-save-warning"]')
      .forEach((el) => el.remove());
  });

  function makeFailingStore(err: unknown) {
    const base = createMemoryStore();
    return {
      ...base,
      save: vi.fn().mockRejectedValue(err),
    };
  }

  it('invokes onError with the rejection when store.save() fails', async () => {
    const err = Object.assign(new Error('storage full'), { name: 'QuotaExceededError' });
    const store = makeFailingStore(err);
    const dispatcher = createDispatcher();
    const onError = vi.fn();

    mountPersistence(dispatcher, { store, debounceMs: 10, unloadTarget: null, onError });
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: mockContainer });

    await vi.advanceTimersByTimeAsync(50);
    // Allow the rejected promise to settle through the async doSave().
    await vi.runAllTimersAsync();

    expect(store.save).toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]).toBe(err);
  });

  it('does not invoke onError on successful save', async () => {
    const store = createMemoryStore();
    const dispatcher = createDispatcher();
    const onError = vi.fn();

    mountPersistence(dispatcher, { store, debounceMs: 10, unloadTarget: null, onError });
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: mockContainer });

    await vi.advanceTimersByTimeAsync(50);
    await vi.runAllTimersAsync();

    expect(onError).not.toHaveBeenCalled();
  });

  it('onError can surface the save-failure banner with a classified reason', async () => {
    const err = Object.assign(new Error(''), { name: 'AbortError' });
    const store = makeFailingStore(err);
    const dispatcher = createDispatcher();

    mountPersistence(dispatcher, {
      store,
      debounceMs: 10,
      unloadTarget: null,
      onError: (e) => {
        showIdbSaveFailureBanner({ host, reason: classifySaveError(e) });
      },
    });
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: mockContainer });

    await vi.advanceTimersByTimeAsync(50);
    await vi.runAllTimersAsync();

    const banner = host.querySelector<HTMLElement>(
      '[data-pkc-region="idb-save-warning"]',
    );
    expect(banner).not.toBeNull();
    expect(banner!.textContent).toContain('AbortError');
  });

  it('multiple failures coalesce into a single banner node', async () => {
    const err = Object.assign(new Error('full'), { name: 'QuotaExceededError' });
    const store = makeFailingStore(err);
    const dispatcher = createDispatcher();

    mountPersistence(dispatcher, {
      store,
      debounceMs: 10,
      unloadTarget: null,
      onError: (e) => {
        showIdbSaveFailureBanner({ host, reason: classifySaveError(e) });
      },
    });
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: mockContainer });

    await vi.advanceTimersByTimeAsync(50);
    await vi.runAllTimersAsync();

    // Second failure — trigger another mutation so a new save is scheduled.
    dispatcher.dispatch({ type: 'CREATE_ENTRY', archetype: 'text', title: 'X' });
    await vi.advanceTimersByTimeAsync(50);
    await vi.runAllTimersAsync();

    expect(
      host.querySelectorAll('[data-pkc-region="idb-save-warning"]').length,
    ).toBe(1);
  });

  it('successful save after a failure does not hide the existing banner', async () => {
    // Once the user has been warned about a lost write, we do NOT
    // silently retract the banner on the next success — the earlier
    // edit may already be gone. Dismissal is a user-initiated action.
    const err = Object.assign(new Error('full'), { name: 'QuotaExceededError' });
    let shouldFail = true;
    const base = createMemoryStore();
    const store = {
      ...base,
      save: vi.fn().mockImplementation(async (c: Container) => {
        if (shouldFail) throw err;
        return base.save(c);
      }),
    };
    const dispatcher = createDispatcher();

    mountPersistence(dispatcher, {
      store,
      debounceMs: 10,
      unloadTarget: null,
      onError: (e) => {
        showIdbSaveFailureBanner({ host, reason: classifySaveError(e) });
      },
    });
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: mockContainer });

    await vi.advanceTimersByTimeAsync(50);
    await vi.runAllTimersAsync();

    expect(
      host.querySelectorAll('[data-pkc-region="idb-save-warning"]').length,
    ).toBe(1);

    // Now allow saves to succeed.
    shouldFail = false;
    dispatcher.dispatch({ type: 'CREATE_ENTRY', archetype: 'text', title: 'OK' });
    await vi.advanceTimersByTimeAsync(50);
    await vi.runAllTimersAsync();

    // Banner is still present — only user dismiss removes it.
    expect(
      host.querySelectorAll('[data-pkc-region="idb-save-warning"]').length,
    ).toBe(1);
  });
});
