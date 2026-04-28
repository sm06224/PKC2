/**
 * Multi-file attach progress badge (PR #184).
 *
 * Tiny corner badge that surfaces during multi-file drops so the user
 * has a non-modal hint that work is happening, without freezing the
 * main thread or introducing a focus-stealing modal.
 *
 * Design notes
 * ────────────
 * - Lives at `position: fixed` in the bottom-right of `#pkc-root`. Off
 *   the canvas, won't intercept click / drop events.
 * - Auto-removes on `done(total, total)` after a 700 ms tail so the
 *   "30 / 30 ✓" frame is briefly visible before the badge dissolves.
 * - One singleton instance per page lifetime. Concurrent multi-file
 *   sessions (rare — single drop zone per surface) reuse the same
 *   badge and just keep updating the counter.
 * - Aria-live polite so screen readers get the milestone updates
 *   without the badge stealing focus.
 *
 * The badge has its own minimal CSS injected on first show — no
 * touching of `bundle.css` to keep this PR small.
 */

const STYLE_ID = '__pkc2-attach-progress-style';
const BADGE_ID = '__pkc2-attach-progress-badge';

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .pkc-attach-progress {
      position: fixed;
      bottom: 1rem;
      right: 1rem;
      z-index: 1000;
      padding: 0.5rem 0.75rem;
      background: var(--c-bg-elevated, rgba(20, 20, 30, 0.92));
      color: var(--c-fg, #eaeaea);
      border: 1px solid var(--c-border, rgba(255, 255, 255, 0.15));
      border-radius: 0.4rem;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
      font-size: 0.75rem;
      font-family: var(--font-system, system-ui, sans-serif);
      pointer-events: none;
      opacity: 0.92;
      transition: opacity 250ms ease, transform 250ms ease;
      display: flex;
      flex-direction: column;
      gap: 0.3rem;
      min-width: 9rem;
    }
    .pkc-attach-progress[data-pkc-state="leaving"] {
      opacity: 0;
      transform: translateY(0.4rem);
    }
    .pkc-attach-progress-label {
      display: flex;
      justify-content: space-between;
      gap: 0.5rem;
      align-items: baseline;
    }
    .pkc-attach-progress-bar {
      height: 3px;
      background: var(--c-border, rgba(255, 255, 255, 0.15));
      border-radius: 2px;
      overflow: hidden;
    }
    .pkc-attach-progress-bar-fill {
      height: 100%;
      background: var(--c-accent, #4aa3ff);
      transition: width 200ms ease;
    }
  `;
  document.head.appendChild(style);
}

interface ProgressState {
  badge: HTMLElement;
  label: HTMLElement;
  fill: HTMLElement;
  closeTimer: ReturnType<typeof setTimeout> | null;
}

let active: ProgressState | null = null;

function ensureBadge(): ProgressState {
  if (active) return active;
  ensureStyles();
  const existing = document.getElementById(BADGE_ID);
  if (existing) existing.remove();

  const badge = document.createElement('div');
  badge.id = BADGE_ID;
  badge.className = 'pkc-attach-progress';
  badge.setAttribute('aria-live', 'polite');
  badge.setAttribute('role', 'status');

  const label = document.createElement('div');
  label.className = 'pkc-attach-progress-label';
  badge.appendChild(label);

  const bar = document.createElement('div');
  bar.className = 'pkc-attach-progress-bar';
  const fill = document.createElement('div');
  fill.className = 'pkc-attach-progress-bar-fill';
  fill.style.width = '0%';
  bar.appendChild(fill);
  badge.appendChild(bar);

  document.body.appendChild(badge);
  active = { badge, label, fill, closeTimer: null };
  return active;
}

function fadeAndRemove(state: ProgressState): void {
  state.badge.setAttribute('data-pkc-state', 'leaving');
  state.closeTimer = setTimeout(() => {
    state.badge.remove();
    if (active === state) active = null;
  }, 280);
}

/**
 * Update progress to `done / total`. Creates the badge on first call.
 * Caller is expected to invoke once per file completion.
 *
 * When `done >= total` the badge holds for 700 ms then fades, so the
 * final "N / N ✓" state is visible.
 */
export function showAttachProgress(done: number, total: number): void {
  if (typeof document === 'undefined') return;
  if (total <= 1) return; // no badge for single-file drops
  const state = ensureBadge();
  if (state.closeTimer !== null) {
    clearTimeout(state.closeTimer);
    state.closeTimer = null;
    state.badge.removeAttribute('data-pkc-state');
  }
  const completed = Math.min(done, total);
  const isDone = completed >= total;
  state.label.innerHTML = isDone
    ? `<span>添付完了</span><span>${completed} / ${total} ✓</span>`
    : `<span>添付中…</span><span>${completed} / ${total}</span>`;
  state.fill.style.width = `${Math.round((completed / total) * 100)}%`;
  if (isDone) {
    state.closeTimer = setTimeout(() => fadeAndRemove(state), 700);
  }
}

/**
 * Force-dismiss the badge (e.g. on error before completion). No-op
 * when no badge is showing.
 */
export function hideAttachProgress(): void {
  if (!active) return;
  if (active.closeTimer !== null) clearTimeout(active.closeTimer);
  fadeAndRemove(active);
}

/**
 * Test-only reset for the singleton badge state. Tests that exercise
 * fake timers or DOM teardown between cases call this in beforeEach
 * so a stale `active` from the previous case doesn't leak through.
 */
export function __resetAttachProgressForTest(): void {
  if (active) {
    if (active.closeTimer !== null) clearTimeout(active.closeTimer);
    active.badge.remove();
    active = null;
  }
}
