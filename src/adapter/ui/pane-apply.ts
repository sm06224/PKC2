/**
 * Pane collapse/expand DOM application — shared by the renderer's
 * initial-render path and by the action-binder's togglePane helper.
 *
 * USER_REQUEST_LEDGER S-19 (H-7 pane persistence, 2026-04-14).
 *
 * Goal: give pane collapse a single source of truth in the DOM
 * manipulation contract so that the renderer (first render) and
 * the toggle handler (click / shortcut / tray) produce identical
 * attribute / display outcomes.
 *
 * Attribute contract, stable:
 *   - `[data-pkc-region="sidebar"]`  : `data-pkc-collapsed="true"` when collapsed
 *   - `[data-pkc-region="meta"]`     : idem
 *   - `[data-pkc-region="tray-left"]`  : `style.display=''` when collapsed, `'none'` otherwise
 *   - `[data-pkc-region="tray-right"]` : idem
 *   - `[data-pkc-resize="left"]`     : `data-pkc-collapsed="true"` when collapsed
 *   - `[data-pkc-resize="right"]`    : idem
 *
 * Only mutates elements that exist — silently skips absent anchors
 * so the helper is safe to run even in partial DOMs (e.g. no entry
 * is selected so the meta pane isn't rendered).
 */

import type { PanePrefs } from '../platform/pane-prefs';

type Pane = 'sidebar' | 'meta';

const PANE_SELECTORS: Readonly<
  Record<Pane, { pane: string; tray: string; handle: string }>
> = {
  sidebar: {
    pane: '[data-pkc-region="sidebar"]',
    tray: '[data-pkc-region="tray-left"]',
    handle: '[data-pkc-resize="left"]',
  },
  meta: {
    pane: '[data-pkc-region="meta"]',
    tray: '[data-pkc-region="tray-right"]',
    handle: '[data-pkc-resize="right"]',
  },
};

/**
 * Apply both panes' collapsed state to the DOM under `root`.
 * Called by main.ts and the renderer to synchronise with
 * `loadPanePrefs()`.
 */
export function applyPaneCollapsedToDOM(root: HTMLElement, prefs: PanePrefs): void {
  applyOne(root, 'sidebar', prefs.sidebar);
  applyOne(root, 'meta', prefs.meta);
}

/** Same as the above but for just one pane (used from togglePane). */
export function applyOnePaneCollapsedToDOM(
  root: HTMLElement,
  pane: Pane,
  collapsed: boolean,
): void {
  applyOne(root, pane, collapsed);
}

function applyOne(root: HTMLElement, pane: Pane, collapsed: boolean): void {
  const sel = PANE_SELECTORS[pane];
  const paneEl = root.querySelector<HTMLElement>(sel.pane);
  const trayEl = root.querySelector<HTMLElement>(sel.tray);
  const handleEl = root.querySelector<HTMLElement>(sel.handle);
  if (!paneEl) return;
  if (collapsed) {
    paneEl.setAttribute('data-pkc-collapsed', 'true');
    if (trayEl) trayEl.style.display = '';
    if (handleEl) handleEl.setAttribute('data-pkc-collapsed', 'true');
  } else {
    paneEl.removeAttribute('data-pkc-collapsed');
    if (trayEl) trayEl.style.display = 'none';
    if (handleEl) handleEl.removeAttribute('data-pkc-collapsed');
  }
}
