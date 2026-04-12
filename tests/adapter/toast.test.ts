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

  // ── Export Now action ───────────────────────────────────────────────
  //
  // When a caller passes `onExport`, the toast should expose a one-click
  // escape hatch carrying `data-pkc-action="begin-export"`.  The callback
  // is invoked directly on click because the toast stack lives outside
  // `#pkc-root` (global action-binder delegation doesn't reach it).

  it('renders no Export Now button when onExport is omitted', () => {
    const toast = showToast({ message: 'no export', host });
    expect(
      toast.querySelector('[data-pkc-action="begin-export"]'),
    ).toBeNull();
  });

  it('renders an Export Now button when onExport is provided', () => {
    const onExport = vi.fn();
    const toast = showToast({ message: 'with export', host, onExport });
    const btn = toast.querySelector<HTMLButtonElement>(
      '[data-pkc-action="begin-export"]',
    );
    expect(btn).not.toBeNull();
    expect(btn!.classList.contains('pkc-toast-action')).toBe(true);
    expect(btn!.textContent).toBe('Export Now');
    expect(btn!.getAttribute('data-pkc-export-mode')).toBe('full');
    expect(btn!.getAttribute('data-pkc-export-mutability')).toBe('editable');
  });

  it('honours a custom exportLabel', () => {
    const toast = showToast({
      message: 'custom label',
      host,
      onExport: () => {},
      exportLabel: 'Download backup',
    });
    const btn = toast.querySelector<HTMLButtonElement>(
      '[data-pkc-action="begin-export"]',
    );
    expect(btn?.textContent).toBe('Download backup');
  });

  it('clicking Export Now invokes the callback exactly once', () => {
    const onExport = vi.fn();
    const toast = showToast({ message: 'click me', host, onExport });
    const btn = toast.querySelector<HTMLButtonElement>(
      '[data-pkc-action="begin-export"]',
    )!;
    btn.click();
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it('Export Now click does NOT dismiss the toast', () => {
    const toast = showToast({
      message: 'still visible',
      host,
      onExport: () => {},
    });
    toast
      .querySelector<HTMLButtonElement>('[data-pkc-action="begin-export"]')!
      .click();
    expect(host.contains(toast)).toBe(true);
  });

  it('Export Now button sits between body and dismiss', () => {
    const toast = showToast({
      message: 'order',
      host,
      onExport: () => {},
    });
    const children = Array.from(toast.children) as HTMLElement[];
    const bodyIdx = children.findIndex((c) =>
      c.classList.contains('pkc-toast-body'),
    );
    const actionIdx = children.findIndex(
      (c) => c.getAttribute('data-pkc-action') === 'begin-export',
    );
    const dismissIdx = children.findIndex(
      (c) => c.getAttribute('data-pkc-action') === 'dismiss-toast',
    );
    expect(bodyIdx).toBeGreaterThanOrEqual(0);
    expect(actionIdx).toBeGreaterThan(bodyIdx);
    expect(dismissIdx).toBeGreaterThan(actionIdx);
  });

  it('coalescing does not duplicate the Export Now button', () => {
    const onExport = vi.fn();
    const first = showToast({ message: 'dup', host, onExport });
    const second = showToast({ message: 'dup', host, onExport });
    expect(second).toBe(first);
    expect(
      first.querySelectorAll('[data-pkc-action="begin-export"]').length,
    ).toBe(1);
  });

  it('coalescing upgrades a button-less toast when the repeat provides onExport', () => {
    const first = showToast({ message: 'upgrade', host });
    expect(
      first.querySelector('[data-pkc-action="begin-export"]'),
    ).toBeNull();
    const onExport = vi.fn();
    const same = showToast({ message: 'upgrade', host, onExport });
    expect(same).toBe(first);
    const btn = first.querySelector<HTMLButtonElement>(
      '[data-pkc-action="begin-export"]',
    );
    expect(btn).not.toBeNull();
    btn!.click();
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it('Export Now button is a keyboard-focusable native <button>', () => {
    const toast = showToast({
      message: 'focus',
      host,
      onExport: () => {},
    });
    const btn = toast.querySelector<HTMLButtonElement>(
      '[data-pkc-action="begin-export"]',
    )!;
    expect(btn.tagName).toBe('BUTTON');
    btn.focus();
    expect(document.activeElement).toBe(btn);
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
