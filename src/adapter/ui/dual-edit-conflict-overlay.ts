/**
 * FI-01 dual-edit-safety v1 — reject overlay.
 *
 * Contract: docs/spec/dual-edit-safety-v1-behavior-contract.md §8.
 *
 * Mounts a singleton overlay on top of the shell when
 * `state.dualEditConflict` is populated. Unmounts when the reducer
 * clears it. The three action buttons carry `data-pkc-action`
 * attributes; dispatch happens in the single delegated click
 * handler in `action-binder.ts`. This module only concerns itself
 * with DOM construction + mount / unmount lifecycle + default-focus
 * placement.
 *
 * Contract invariants surfaced here:
 *   - Escape / backdrop do NOT close the overlay (I-Dual2: edit
 *     buffer must not be discarded without explicit resolution).
 *   - Default focus lands on the "Save as branch" button — the
 *     safe-automatic direction established by supervisor decision 3.
 *   - `[data-pkc-region="dual-edit-conflict"]` marks the overlay so
 *     tests / other UI layers can probe its presence deterministically.
 *
 * The renderer wipes `root.innerHTML` on every render tick, which
 * detaches any previously-mounted overlay. The sync step detects that
 * orphan case (`!activeOverlay.isConnected`) and re-mounts. This
 * mirrors the pattern used by `text-to-textlog-modal.ts`.
 */

import type { AppState, DualEditConflictState } from '../state/app-state';

const REGION = 'dual-edit-conflict';

// data-pkc-action identifiers handled by action-binder. Defined here
// so the overlay and binder stay in sync via a single spelling.
export const ACTION_SAVE_AS_BRANCH = 'resolve-dual-edit-save-as-branch';
export const ACTION_DISCARD = 'resolve-dual-edit-discard';
export const ACTION_COPY = 'resolve-dual-edit-copy-clipboard';

// data-pkc-field on the default CTA so main.ts's focus restoration
// (and direct focus probes in tests) can find the element.
const FIELD_DEFAULT_FOCUS = 'dual-edit-default-focus';

let activeOverlay: HTMLElement | null = null;
let activeConflictLid: string | null = null;

/**
 * Reconcile the overlay's DOM presence with `state.dualEditConflict`.
 *
 * Called by `renderer.ts` AFTER the main shell has been rebuilt so
 * that the overlay always sits on top of the freshly rendered DOM.
 */
export function syncDualEditConflictOverlay(
  state: AppState,
  root: HTMLElement,
): void {
  const desired = state.dualEditConflict ?? null;

  if (!desired) {
    if (activeOverlay !== null) unmount();
    return;
  }

  // The renderer clears `root.innerHTML` before rebuilding. Any cached
  // `activeOverlay` is now orphaned — treat as "modal closed at the
  // DOM layer" and re-mount.
  if (activeOverlay !== null && !activeOverlay.isConnected) {
    activeOverlay = null;
    activeConflictLid = null;
  }

  // Fresh mount when first opened OR the conflict identity changed.
  // A ticket bump (`copyRequestTicket`) does NOT change the lid so
  // the DOM is left untouched between copy presses.
  if (activeOverlay === null || activeConflictLid !== desired.lid) {
    if (activeOverlay !== null) unmount();
    mount(root, desired);
  }
}

/** True while the overlay is on screen. Exposed for tests / probes. */
export function isDualEditConflictOverlayOpen(): boolean {
  return activeOverlay !== null;
}

/** Force-unmount. Used only by tests that isolate slices. */
export function closeDualEditConflictOverlay(): void {
  if (activeOverlay !== null) unmount();
}

function mount(root: HTMLElement, conflict: DualEditConflictState): void {
  // Reuse the existing overlay CSS tokens (pkc-text-replace-*) — this
  // matches the boot-source-chooser's approach and avoids introducing
  // a new class namespace.
  const overlay = document.createElement('div');
  overlay.className = 'pkc-text-replace-overlay';
  overlay.setAttribute('data-pkc-region', REGION);
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Save conflict');

  const card = document.createElement('div');
  card.className = 'pkc-text-replace-card';

  const title = document.createElement('h2');
  title.className = 'pkc-text-replace-title';
  title.textContent = '別のセッションでこのエントリが更新されました';
  card.appendChild(title);

  const desc = document.createElement('p');
  desc.className = 'pkc-dual-edit-desc';
  desc.textContent =
    '保存は中止されました。編集内容は下のいずれかで処理してください。';
  card.appendChild(desc);

  const info = document.createElement('dl');
  info.className = 'pkc-dual-edit-info';
  appendRow(info, '対象エントリ', conflict.lid);
  appendRow(info, '編集開始時の更新時刻', conflict.base.updated_at);
  if (conflict.currentUpdatedAt) {
    appendRow(info, '現在の更新時刻', conflict.currentUpdatedAt);
  }
  card.appendChild(info);

  const actions = document.createElement('div');
  actions.className = 'pkc-text-replace-actions';

  const saveAsBranchBtn = document.createElement('button');
  saveAsBranchBtn.type = 'button';
  saveAsBranchBtn.className = 'pkc-btn pkc-btn-primary';
  saveAsBranchBtn.setAttribute('data-pkc-action', ACTION_SAVE_AS_BRANCH);
  saveAsBranchBtn.setAttribute('data-pkc-lid', conflict.lid);
  saveAsBranchBtn.setAttribute('data-pkc-field', FIELD_DEFAULT_FOCUS);
  saveAsBranchBtn.textContent = 'Save as branch';
  actions.appendChild(saveAsBranchBtn);

  const discardBtn = document.createElement('button');
  discardBtn.type = 'button';
  discardBtn.className = 'pkc-btn';
  discardBtn.setAttribute('data-pkc-action', ACTION_DISCARD);
  discardBtn.setAttribute('data-pkc-lid', conflict.lid);
  discardBtn.textContent = 'Discard my edits';
  actions.appendChild(discardBtn);

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'pkc-btn';
  copyBtn.setAttribute('data-pkc-action', ACTION_COPY);
  copyBtn.setAttribute('data-pkc-lid', conflict.lid);
  copyBtn.textContent = 'Copy to clipboard';
  actions.appendChild(copyBtn);

  card.appendChild(actions);
  overlay.appendChild(card);
  root.appendChild(overlay);

  activeOverlay = overlay;
  activeConflictLid = conflict.lid;

  // Default focus = Save as branch (supervisor fixed decision 3).
  // No Escape / backdrop-click listeners are wired — intentional per
  // I-Dual2 / contract §8.1.
  saveAsBranchBtn.focus();
}

function appendRow(dl: HTMLElement, k: string, v: string): void {
  const dt = document.createElement('dt');
  dt.textContent = k;
  const dd = document.createElement('dd');
  dd.textContent = v;
  dl.appendChild(dt);
  dl.appendChild(dd);
}

function unmount(): void {
  if (activeOverlay) {
    activeOverlay.remove();
    activeOverlay = null;
    activeConflictLid = null;
  }
}
