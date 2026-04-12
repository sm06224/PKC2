/**
 * @vitest-environment happy-dom
 */
/**
 * Toast helper — non-blocking, coalescing, dismissible alternative to
 * `alert()` for paste / drop reject and FileReader error paths.
 *
 * These tests cover:
 *   - Stack creation + region attributes (for a11y + test targeting)
 *   - Coalescing on message equality
 *   - Severity upgrade when a repeat has a higher kind
 *   - Auto-dismiss timer + reset on re-trigger
 *   - Manual dismiss
 *   - Disabled auto-dismiss (autoDismissMs=0) leaves the toast until
 *     user dismiss
 *   - Multiple distinct messages coexist
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { showToast } from '@adapter/ui/toast';

describe('showToast', () => {
  let host: HTMLElement;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    vi.useFakeTimers();
  });

  afterEach(() => {
    host.remove();
    vi.useRealTimers();
  });

  it('creates a stack + toast with proper region attributes and role=status', () => {
    const toast = showToast({ message: 'Paste rejected', host });
    const stack = host.querySelector('[data-pkc-region="toast-stack"]');
    expect(stack).not.toBeNull();
    expect(stack?.contains(toast)).toBe(true);
    expect(toast.getAttribute('data-pkc-region')).toBe('toast');
    expect(toast.getAttribute('role')).toBe('status');
    expect(toast.textContent).toContain('Paste rejected');
  });

  it('reuses the same stack across calls', () => {
    showToast({ message: 'A', host });
    showToast({ message: 'B', host });
    expect(
      host.querySelectorAll('[data-pkc-region="toast-stack"]').length,
    ).toBe(1);
  });

  it('default kind is warn and maps to .pkc-toast-warn', () => {
    const toast = showToast({ message: 'Hi', host });
    expect(toast.classList.contains('pkc-toast-warn')).toBe(true);
    expect(toast.classList.contains('pkc-toast')).toBe(true);
  });

  it('error kind maps to .pkc-toast-error', () => {
    const toast = showToast({ message: 'Boom', kind: 'error', host });
    expect(toast.classList.contains('pkc-toast-error')).toBe(true);
    expect(toast.classList.contains('pkc-toast-warn')).toBe(false);
  });

  it('info kind maps to .pkc-toast-info', () => {
    const toast = showToast({ message: 'FYI', kind: 'info', host });
    expect(toast.classList.contains('pkc-toast-info')).toBe(true);
  });

  it('coalesces identical messages — second call returns the same element', () => {
    const first = showToast({ message: 'same', host });
    const second = showToast({ message: 'same', host });
    expect(second).toBe(first);
    expect(
      host.querySelectorAll('[data-pkc-region="toast"]').length,
    ).toBe(1);
  });

  it('distinct messages coexist as separate toasts', () => {
    showToast({ message: 'one', host });
    showToast({ message: 'two', host });
    expect(
      host.querySelectorAll('[data-pkc-region="toast"]').length,
    ).toBe(2);
  });

  it('upgrades severity when a repeat call has a higher kind', () => {
    const warn = showToast({ message: 'dup', kind: 'warn', host });
    expect(warn.classList.contains('pkc-toast-warn')).toBe(true);
    const upgraded = showToast({ message: 'dup', kind: 'error', host });
    expect(upgraded).toBe(warn);
    expect(upgraded.classList.contains('pkc-toast-error')).toBe(true);
    expect(upgraded.classList.contains('pkc-toast-warn')).toBe(false);
  });

  it('does NOT downgrade severity when a repeat has a lower kind', () => {
    const err = showToast({ message: 'dup', kind: 'error', host });
    const still = showToast({ message: 'dup', kind: 'warn', host });
    expect(still).toBe(err);
    expect(still.classList.contains('pkc-toast-error')).toBe(true);
    expect(still.classList.contains('pkc-toast-warn')).toBe(false);
  });

  it('auto-dismisses after autoDismissMs', () => {
    const toast = showToast({ message: 'fleeting', autoDismissMs: 1000, host });
    expect(host.contains(toast)).toBe(true);
    vi.advanceTimersByTime(999);
    expect(host.contains(toast)).toBe(true);
    vi.advanceTimersByTime(2);
    expect(host.contains(toast)).toBe(false);
  });

  it('re-trigger resets the auto-dismiss timer', () => {
    const toast = showToast({ message: 'resetme', autoDismissMs: 1000, host });
    vi.advanceTimersByTime(800);
    // Re-trigger — timer should reset to 1000ms from here
    showToast({ message: 'resetme', autoDismissMs: 1000, host });
    vi.advanceTimersByTime(800);
    // 1600ms total: still visible because the re-trigger reset the timer at 800ms
    expect(host.contains(toast)).toBe(true);
    vi.advanceTimersByTime(300);
    expect(host.contains(toast)).toBe(false);
  });

  it('autoDismissMs=0 disables auto-dismiss', () => {
    const toast = showToast({ message: 'sticky', autoDismissMs: 0, host });
    vi.advanceTimersByTime(1_000_000);
    expect(host.contains(toast)).toBe(true);
  });

  it('manual dismiss via the × button removes the toast', () => {
    const toast = showToast({ message: 'bye', host });
    const btn = toast.querySelector<HTMLButtonElement>(
      '[data-pkc-action="dismiss-toast"]',
    );
    expect(btn).not.toBeNull();
    btn!.click();
    expect(host.contains(toast)).toBe(false);
  });

  it('dismiss button has an aria-label', () => {
    const toast = showToast({ message: 'labelled', host });
    const btn = toast.querySelector<HTMLButtonElement>(
      '[data-pkc-action="dismiss-toast"]',
    );
    expect(btn?.getAttribute('aria-label')).toBe('Dismiss');
  });

  it('dismissed toasts let a subsequent identical message create a new toast', () => {
    const first = showToast({ message: 'cycle', host });
    first
      .querySelector<HTMLButtonElement>('[data-pkc-action="dismiss-toast"]')!
      .click();
    expect(host.contains(first)).toBe(false);

    const second = showToast({ message: 'cycle', host });
    expect(second).not.toBe(first);
    expect(host.contains(second)).toBe(true);
  });

  it('coexists with the IDB warning banner regions', () => {
    // Pre-existing IDB banner — toast stack must not collide with it.
    const fakeBanner = document.createElement('div');
    fakeBanner.setAttribute('data-pkc-region', 'idb-warning');
    host.appendChild(fakeBanner);

    const toast = showToast({ message: 'coexist', host });

    expect(host.contains(fakeBanner)).toBe(true);
    expect(host.contains(toast)).toBe(true);
    expect(
      host.querySelectorAll('[data-pkc-region="idb-warning"]').length,
    ).toBe(1);
    expect(
      host.querySelectorAll('[data-pkc-region="toast"]').length,
    ).toBe(1);
  });
});
