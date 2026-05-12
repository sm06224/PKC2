/**
 * App Launcher dashboard overlay — PR-2JJ(2026-05-12 hotfix、PR #432 stack)。
 *
 * Phase 1(PR-2FF / #426)で `src/features/launcher/app-registry.ts` に
 * data 層 foundation のみ着地、UI 起動 wire が無く dead code 状態だった
 * 件を hotfix で解消する。
 *
 * 設計(`docs/development/feature-requests-2026-04-28-roadmap.md` 領域 10-7):
 *   PKC2 単一 HTML 内で複数の「アプリ」(別目的の view / mode)を切替
 *   できる launcher dashboard UI。Editor (=detail) / Calendar / Kanban /
 *   Filer / Graph / Album / Flags を入口で選択する Shell menu の上位概念。
 *
 * 開閉導線:
 *   - `?app=launcher` URL flag → boot 時に dispatch OPEN_LAUNCHER
 *   - shell-menu「🚀 Launcher」link → OPEN_LAUNCHER
 *   - × button / ESC / backdrop click → CLOSE_LAUNCHER
 *   - tile click → 対応 app への dispatch + CLOSE_LAUNCHER
 *
 * State machine: `state.launcherOpen` boolean(runtime-only、not persisted)。
 *
 * Pure DOM rendering: state → DOM。click は data-pkc-action delegation で
 * action-binder が処理。
 */

import { LAUNCHER_APPS, type LauncherApp } from '../../features/launcher/app-registry';

function createElement(tag: string, className: string): HTMLElement {
  const el = document.createElement(tag);
  el.className = className;
  return el;
}

/**
 * Build the launcher overlay DOM. The renderer mounts this when
 * `state.launcherOpen === true`. Tiles carry `data-pkc-action="launch-app"`
 * with `data-pkc-app-id="<id>"` for action-binder dispatch.
 */
export function renderLauncher(): HTMLElement {
  const overlay = createElement('div', 'pkc-launcher-overlay');
  overlay.setAttribute('data-pkc-region', 'launcher-overlay');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'App Launcher');

  const backdrop = createElement('div', 'pkc-launcher-backdrop');
  backdrop.setAttribute('data-pkc-action', 'close-launcher');
  overlay.appendChild(backdrop);

  const panel = createElement('div', 'pkc-launcher-panel');
  panel.setAttribute('data-pkc-region', 'launcher-panel');
  panel.setAttribute('data-pkc-stop-bubbling', '');

  const header = createElement('header', 'pkc-launcher-header');
  const title = createElement('h2', 'pkc-launcher-title');
  title.textContent = '🚀 App Launcher';
  header.appendChild(title);

  const close = createElement('button', 'pkc-launcher-close');
  close.setAttribute('type', 'button');
  close.setAttribute('data-pkc-action', 'close-launcher');
  close.setAttribute('aria-label', 'Close launcher');
  close.setAttribute('title', 'Close (ESC)');
  close.textContent = '✕';
  header.appendChild(close);
  panel.appendChild(header);

  const grid = createElement('div', 'pkc-launcher-grid');
  grid.setAttribute('data-pkc-region', 'launcher-grid');
  for (const app of LAUNCHER_APPS) {
    grid.appendChild(renderTile(app));
  }
  panel.appendChild(grid);

  const hint = createElement('p', 'pkc-launcher-hint');
  hint.textContent =
    'URL に ?app=<id>(例: ?app=calendar)で直接起動、?app=launcher で本 dashboard を再表示できます。';
  panel.appendChild(hint);

  overlay.appendChild(panel);
  return overlay;
}

function renderTile(app: LauncherApp): HTMLElement {
  const tile = createElement('button', 'pkc-launcher-tile');
  tile.setAttribute('type', 'button');
  tile.setAttribute('data-pkc-action', 'launch-app');
  tile.setAttribute('data-pkc-app-id', app.id);
  tile.setAttribute('aria-label', `Launch ${app.label}`);
  tile.setAttribute('title', app.description);

  const icon = createElement('span', 'pkc-launcher-tile-icon');
  icon.textContent = app.icon;
  icon.setAttribute('aria-hidden', 'true');
  tile.appendChild(icon);

  const label = createElement('span', 'pkc-launcher-tile-label');
  label.textContent = app.label;
  tile.appendChild(label);

  const desc = createElement('span', 'pkc-launcher-tile-desc');
  desc.textContent = app.description;
  tile.appendChild(desc);

  return tile;
}
