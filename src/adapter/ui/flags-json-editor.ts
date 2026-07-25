/**
 * flags JSON 一括編集ダイアログ — code-edit-lite-design-2026-07 §3
 * (user 裁定 2026-07-25)。VSCode の settings.json 相当の編集面。
 *
 * Flags Inspector の「{} JSON」から開く。renderer 配下ではなく
 * document.body 直下の overlay として imperative に mount する
 * (inline-dialog / storage-fallback-notice と同型)— 再 render で
 * 編集中のエディタが破棄されない。
 *
 * 編集対象は `__flags__` payload の values map のみ。validate は
 * features 純関数(flags-json-edit.ts)+ registry 照合。適用は
 * 差分だけを既存 SET_FLAG / RESET_FLAG で dispatch(reducer 変更ゼロ、
 * event 粒度・永続化・FLAGS_CHANGED 連鎖が GUI 面と同一)。
 */

import type { Dispatcher } from '../state/dispatcher';
import { getRegisteredFlags } from '../flags';
import { resolveFlagsPayload } from '../../core/model/system-flags-payload';
import type { FlagPrimitive } from '../../core/flags';
import { FLAGS_LID } from '../../core/model/record';
import { mountCodeEditLite } from './code-edit-lite';
import {
  seedFlagsJson,
  validateFlagsJson,
  diffFlagsValues,
} from '../../features/flags/flags-json-edit';
import { showToast } from './toast';

const REGION = 'flags-json-editor';

function currentValues(dispatcher: Dispatcher): Record<string, FlagPrimitive> {
  const body = dispatcher
    .getState()
    .container?.entries.find((e) => e.lid === FLAGS_LID)?.body;
  return { ...resolveFlagsPayload(body).values };
}

/**
 * ダイアログを開く(冪等 — 既存は張り替え)。閉じる操作は
 * キャンセル / 適用 / ESC / backdrop click。
 */
export function openFlagsJsonEditor(dispatcher: Dispatcher): HTMLElement {
  document.querySelector(`[data-pkc-region="${REGION}"]`)?.remove();

  const overlay = document.createElement('div');
  overlay.className = 'pkc-flags-json-overlay';
  overlay.setAttribute('data-pkc-region', REGION);
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'flags JSON 編集');

  const card = document.createElement('div');
  card.className = 'pkc-flags-json-card';

  const heading = document.createElement('div');
  heading.className = 'pkc-flags-json-heading';
  heading.textContent = '{} flags を JSON で一括編集';
  card.appendChild(heading);

  const hint = document.createElement('div');
  hint.className = 'pkc-flags-json-hint';
  hint.textContent =
    'VSCode の settings.json 相当の生編集です。ここには既定値から変更した flag だけが並びます'
    + '(行を消す = 既定値へ戻す)。適用は差分だけが反映されます。'
    + 'エラーがある間は適用できません(警告は適用可)。';
  card.appendChild(hint);

  const close = (): void => overlay.remove();

  mountCodeEditLite(card, {
    value: seedFlagsJson(currentValues(dispatcher)),
    lang: 'json',
    validate: (text) => validateFlagsJson(text, getRegisteredFlags()).issues,
    commitLabel: '適用',
    onCommit: (text) => {
      // commit 時点の最新 state と突き合わせる(編集中に GUI 面で変更が
      // あっても、その変更を巻き戻さない)。
      const parsed = validateFlagsJson(text, getRegisteredFlags());
      if (!parsed.values) return; // error 中は commit ボタン自体が disabled
      const { set, reset } = diffFlagsValues(currentValues(dispatcher), parsed.values);
      for (const { key, value } of set) {
        dispatcher.dispatch({ type: 'SET_FLAG', key, value });
      }
      for (const key of reset) {
        dispatcher.dispatch({ type: 'RESET_FLAG', key });
      }
      showToast({
        message: set.length + reset.length === 0
          ? 'flags: 変更はありませんでした'
          : `flags を適用しました(設定 ${set.length} 件 / 既定へ戻す ${reset.length} 件)`,
        kind: 'info',
      });
      close();
    },
    onCancel: close,
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  overlay.appendChild(card);
  document.body.appendChild(overlay);
  // 開いたら即編集できるように focus
  overlay.querySelector<HTMLTextAreaElement>('.pkc-code-edit-input')?.focus();
  return overlay;
}
