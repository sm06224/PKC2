/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  showAttachProgress,
  hideAttachProgress,
  __resetAttachProgressForTest,
} from '@adapter/ui/attach-progress';

/**
 * PR #184 — attach progress badge contract.
 *
 * The badge is a non-modal status surface for multi-file drops.
 * Tests pin the visible behaviour the user depends on:
 *   1. Single-file drops show no badge (total <= 1 → no-op)
 *   2. Multi-file drops show a badge with progress text + bar fill %
 *   3. Subsequent calls update the same singleton badge
 *   4. Reaching `done === total` schedules a fade-out (badge stays
 *      momentarily visible to confirm completion, then leaves)
 *   5. `hideAttachProgress()` force-dismisses
 *   6. The badge is `aria-live="polite"` so screen readers announce
 *      milestones without stealing focus
 */

beforeEach(() => {
  __resetAttachProgressForTest();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

function getBadge(): HTMLElement | null {
  return document.body.querySelector('.pkc-attach-progress');
}

describe('attach progress badge', () => {
  it('does not render for single-file drops', () => {
    showAttachProgress(0, 1);
    showAttachProgress(1, 1);
    expect(getBadge()).toBeNull();
  });

  it('renders for multi-file drops with total >= 2', () => {
    showAttachProgress(0, 5);
    const badge = getBadge();
    expect(badge).not.toBeNull();
    expect(badge!.getAttribute('aria-live')).toBe('polite');
    expect(badge!.getAttribute('role')).toBe('status');
    expect(badge!.textContent).toContain('0 / 5');
  });

  it('updates the same singleton badge across repeat calls', () => {
    showAttachProgress(0, 3);
    const first = getBadge();
    showAttachProgress(1, 3);
    const second = getBadge();
    expect(second).toBe(first);
    expect(second!.textContent).toContain('1 / 3');
  });

  it('updates the bar-fill width percentage in step with progress', () => {
    showAttachProgress(0, 4);
    const fill = getBadge()!.querySelector<HTMLElement>('.pkc-attach-progress-bar-fill')!;
    expect(fill.style.width).toBe('0%');
    showAttachProgress(2, 4);
    expect(fill.style.width).toBe('50%');
    showAttachProgress(3, 4);
    expect(fill.style.width).toBe('75%');
  });

  it('schedules a fade-out after reaching done === total', () => {
    showAttachProgress(0, 2);
    showAttachProgress(2, 2);
    expect(getBadge()).not.toBeNull();
    expect(getBadge()!.textContent).toContain('2 / 2');
    // Hold + fade window (700 ms hold + 280 ms fade).
    vi.advanceTimersByTime(1100);
    expect(getBadge()).toBeNull();
  });

  it('hideAttachProgress force-dismisses an active badge', () => {
    showAttachProgress(1, 5);
    expect(getBadge()).not.toBeNull();
    hideAttachProgress();
    vi.advanceTimersByTime(400);
    expect(getBadge()).toBeNull();
  });

  it('hideAttachProgress is a no-op when no badge is showing', () => {
    expect(() => hideAttachProgress()).not.toThrow();
  });
});
