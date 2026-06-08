/**
 * γ-A5-4(multi-window-vscode-extension-spec §4.3):window layout 復元
 * プロンプト。
 *
 * boot 時、`shell.window_layout_persist` flag が ON かつ保存 layout に
 * viewer / monitor window があれば、「前回のウィンドウを復元しますか?」
 * の overlay を出す。
 *
 * browser popup 制約(spec §4.3):複数 `window.open` を 1 user gesture
 * で行うと 2 つ目以降が blocker に阻まれ得る。「復元」ボタン click を
 * 起点に `restoreWindowLayout` を呼び、開けなかった分が残れば overlay を
 * 残してメッセージを更新、再クリックで残りを再試行する(冪等)。
 *
 * boot-source-chooser と同じ overlay CSS token(`pkc-text-replace-*`)を
 * 流用 ── 新規 CSS class を増やさない。
 */

import type { Dispatcher } from '../state/dispatcher';
import type { Entry } from '../../core/model/record';
import { readWindowLayout, clearWindowLayout } from '../platform/window-layout-store';
import { restoreWindowLayout } from './entry-window';
import { shellWindowLayoutPersistEnabled } from './shell-flags';

const OVERLAY_CLASS = 'pkc-text-replace-overlay';
const CARD_CLASS = 'pkc-text-replace-card';
const ACTIONS_CLASS = 'pkc-text-replace-actions';
const DATA_REGION = 'window-layout-restore-prompt';

let activeOverlay: HTMLElement | null = null;

/** overlay を取り外す。重複呼び出し安全。 */
export function closeWindowLayoutRestorePrompt(): void {
  if (activeOverlay && activeOverlay.parentElement) {
    activeOverlay.parentElement.removeChild(activeOverlay);
  }
  activeOverlay = null;
}

/**
 * 復元プロンプト overlay を `host` にマウントする。保存 layout に viewer /
 * monitor window が無ければ何もしない(overlay を作らない)。
 */
export function showWindowLayoutRestorePrompt(
  host: HTMLElement,
  entries: Entry[],
): void {
  closeWindowLayoutRestorePrompt();

  const restorable = readWindowLayout().filter(
    (e) => e.role === 'viewer' || e.role === 'monitor',
  );
  if (restorable.length === 0) return;

  const overlay = document.createElement('div');
  overlay.className = OVERLAY_CLASS;
  overlay.setAttribute('data-pkc-region', DATA_REGION);
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', '前回のウィンドウを復元');

  const card = document.createElement('div');
  card.className = CARD_CLASS;

  const title = document.createElement('h2');
  title.textContent = '前回のウィンドウを復元';
  card.appendChild(title);

  const msg = document.createElement('p');
  msg.setAttribute('data-pkc-region', 'window-layout-restore-message');
  msg.textContent = `前回開いていた viewer / monitor ウィンドウ ${restorable.length} 件を復元しますか?`;
  card.appendChild(msg);

  const actions = document.createElement('div');
  actions.className = ACTIONS_CLASS;

  const dismissBtn = document.createElement('button');
  dismissBtn.type = 'button';
  dismissBtn.className = 'pkc-btn';
  dismissBtn.setAttribute('data-pkc-action', 'window-layout-restore-dismiss');
  dismissBtn.textContent = '復元しない';

  const restoreBtn = document.createElement('button');
  restoreBtn.type = 'button';
  restoreBtn.className = 'pkc-btn pkc-btn-primary';
  restoreBtn.setAttribute('data-pkc-action', 'window-layout-restore-confirm');
  restoreBtn.textContent = '復元';

  actions.appendChild(dismissBtn);
  actions.appendChild(restoreBtn);
  card.appendChild(actions);
  overlay.appendChild(card);
  host.appendChild(overlay);
  activeOverlay = overlay;

  dismissBtn.addEventListener('click', () => {
    // 「復元しない」── layout を消し、次回 boot で再度尋ねない。
    clearWindowLayout();
    closeWindowLayoutRestorePrompt();
  });

  restoreBtn.addEventListener('click', () => {
    const pending = restoreWindowLayout(entries);
    if (pending === 0) {
      closeWindowLayoutRestorePrompt();
    } else {
      // popup blocker 等で開けなかった分。再クリックで残りを再試行。
      msg.textContent = `残り ${pending} 件。ブラウザにブロックされた可能性があります。もう一度「復元」を押してください。`;
    }
  });

  restoreBtn.focus();
}

/**
 * dispatcher を購読し、container が ready になった最初の 1 回だけ復元
 * プロンプトを出す。`shell.window_layout_persist` flag が OFF なら何も
 * しない。返り値は teardown(購読解除)。
 */
export function wireWindowLayoutRestore(
  dispatcher: Dispatcher,
  host: HTMLElement,
): () => void {
  let done = false;
  const unsub = dispatcher.onState((state) => {
    if (done) return;
    if (!shellWindowLayoutPersistEnabled()) {
      done = true;
      unsub();
      return;
    }
    if (state.phase !== 'ready' || !state.container) return;
    done = true;
    showWindowLayoutRestorePrompt(host, state.container.entries);
    unsub();
  });
  return unsub;
}
