/**
 * スタートアップお知らせ(#954、user 指示 2026-07-22)。
 *
 * 「起動後のスタートアップメッセージを追加 / オフスイッチありで、
 *  お知らせを表示する / 今回の変更はお知らせに掲載する / 今度から、
 *  そういう運用にしよう」
 *
 * 設計:
 *   - **運用**: user-facing な変更を含む PR は `STARTUP_NOTICES` の先頭
 *     entry に 1 行追記する(新リリース = 新 entry を先頭に追加)。
 *     CLAUDE.md の PR 運用規律に登録済み
 *   - 表示は boot 完了(ready + container)後に 1 回だけ、右下の
 *     **非モーダル**カード(toast と同カテゴリ ── 画面をブロックしない)
 *   - 既読管理: localStorage(`pkc2.startup-notice.seen` = 最後に閉じた
 *     notice id)。同じお知らせは同一ブラウザで 1 回しか出ない
 *   - **オフスイッチ**(2 系統):
 *     a. flag `shell.startup_notice_enabled`(既定 ON、Flags Inspector と
 *        ⚙ Settings の「News」トグルから変更、container に永続化)
 *     b. カード内「今後表示しない」── SET_FLAG で a を OFF に(readonly
 *        container では localStorage fallback)
 *   - embed 中(iframe)は表示しない
 */

import type { Dispatcher } from '../state/dispatcher';
import { defineFlag } from '../../core/flags';

export interface StartupNotice {
  /** 一意 id(既読管理キー)。`YYYY-MM-DD-slug` 形式。 */
  readonly id: string;
  readonly date: string;
  readonly title: string;
  readonly items: readonly string[];
}

/**
 * お知らせデータ(新しいものを**先頭**に追加する)。表示されるのは先頭
 * entry のみ ── リリースごとに 1 entry、項目は user 向け文言で簡潔に。
 */
export const STARTUP_NOTICES: readonly StartupNotice[] = [
  {
    id: '2026-07-22-refinement-round',
    date: '2026-07-22',
    title: '2026-07 更新のお知らせ',
    items: [
      '不具合修正: ローカルフォルダ / OPFS 保存で起動・保存が極端に遅くなる問題を修正(差分保存を自動で従来の単一ファイル形式に切替。細分化されたフォルダも次回保存で自動復元されます)',
      '不具合修正: HTML アプリ / URL 添付が一時的に「Light export」表示になり開けないことがある問題を修正(読み込み待ちは「⏳ 読み込み中」表示になり、ボタンはそのまま使えます)',
      '保存が軽くなりました: 差分保存が既定で有効に(変更した分だけ書き込み。旧版で同じデータを開く場合はマニュアル 07 参照)',
      '画面収録: 大きい収録は停止時に「ダウンロード保存」を選べるように(長時間収録でタブが落ちる問題の対策)',
      'コマンドパレット: 使えないコマンドがグレー + 理由つき表示に(実行方法も案内)',
      'タブ機能が ⚙ Settings の「Tabs」から有効化できるように。ショートカット一覧に Views & Tabs 節を追加(Alt+1〜6 など)',
      'どこでも右クリックメニューが既定 ON に。ランチャータイルも右クリック対応',
      '確認・入力ダイアログを画面をブロックしないポップオーバーに刷新',
      'カレンダー月送り・サイドバー・検索の体感を高速化',
      'ローカルフォルダ(FSA)モード: 前回のフォルダへワンクリックで再接続できるバナーを追加',
    ],
  },
];

/** オフスイッチ(⚙ Settings の「News」トグル / Flags Inspector)。 */
export const shellStartupNoticeEnabled = defineFlag<boolean>(
  'shell.startup_notice_enabled',
  true,
  {
    category: 'shell',
    description: '起動後にアップデートのお知らせを表示(1 リリースにつき 1 回)。OFF で非表示',
  },
);

const SEEN_KEY = 'pkc2.startup-notice.seen';
const DISABLED_KEY = 'pkc2.startup-notice.disabled';
const REGION = 'startup-notice';

function lsGet(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function lsSet(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch { /* private mode 等 ── 既読が効かないだけで安全 */ }
}

function isAutomated(): boolean {
  try {
    return (globalThis.navigator as { webdriver?: boolean } | undefined)?.webdriver === true;
  } catch {
    return false;
  }
}

function forceRequested(): boolean {
  try {
    return new URLSearchParams(globalThis.location?.search ?? '').get('pkc-startup-notice-force') === '1';
  } catch {
    return false;
  }
}

/** test 用 ── 既読 / 無効化 state をリセット。 */
export function __resetStartupNoticeForTest(): void {
  try {
    globalThis.localStorage?.removeItem(SEEN_KEY);
    globalThis.localStorage?.removeItem(DISABLED_KEY);
  } catch { /* noop */ }
  document.querySelector(`[data-pkc-region="${REGION}"]`)?.remove();
}

/**
 * 条件を満たせばお知らせカードを表示する。戻り値は表示したカード
 * (非表示条件に該当したら null)。冪等 ── 既存カードは張り替える。
 */
export function maybeShowStartupNotice(
  dispatcher: Dispatcher,
  host: HTMLElement = document.body,
): HTMLElement | null {
  const latest = STARTUP_NOTICES[0];
  if (!latest) return null;
  if (!shellStartupNoticeEnabled()) return null;
  if (lsGet(DISABLED_KEY) === '1') return null;
  if (lsGet(SEEN_KEY) === latest.id) return null;
  // automation(Playwright 等、navigator.webdriver)では表示しない ──
  // リリースごとに内容・サイズが変わるカードは、既存 90+ smoke spec の
  // 座標 click / elementFromPoint を非決定的に妨げる(kanban DnD で実際に
  // 発生)。お知らせ自体の parity spec だけ URL param で明示解除する。
  if (isAutomated() && !forceRequested()) return null;
  const state = dispatcher.getState();
  if (state.embedded) return null;

  document.querySelector(`[data-pkc-region="${REGION}"]`)?.remove();

  const card = document.createElement('div');
  card.className = 'pkc-startup-notice';
  card.setAttribute('data-pkc-region', REGION);
  card.setAttribute('role', 'status');

  const heading = document.createElement('div');
  heading.className = 'pkc-startup-notice-heading';
  heading.textContent = `📢 ${latest.title}`;
  card.appendChild(heading);

  const list = document.createElement('ul');
  list.className = 'pkc-startup-notice-list';
  for (const item of latest.items) {
    const li = document.createElement('li');
    li.textContent = item;
    list.appendChild(li);
  }
  card.appendChild(list);

  const actions = document.createElement('div');
  actions.className = 'pkc-startup-notice-actions';

  const markSeen = (): void => {
    lsSet(SEEN_KEY, latest.id);
    card.remove();
  };

  const muteBtn = document.createElement('button');
  muteBtn.type = 'button';
  muteBtn.className = 'pkc-btn-small pkc-startup-notice-mute';
  muteBtn.setAttribute('data-pkc-action', 'startup-notice-mute');
  muteBtn.textContent = '今後表示しない';
  muteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    markSeen();
    // container 永続の flag を OFF に(readonly では SET_FLAG が reducer で
    // 弾かれるため、viewer-local の localStorage を fallback に使う)
    if (dispatcher.getState().readonly) {
      lsSet(DISABLED_KEY, '1');
    } else {
      dispatcher.dispatch({ type: 'SET_FLAG', key: 'shell.startup_notice_enabled', value: false });
    }
  });
  actions.appendChild(muteBtn);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'pkc-btn-small pkc-startup-notice-close';
  closeBtn.setAttribute('data-pkc-action', 'startup-notice-close');
  closeBtn.textContent = '閉じる';
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    markSeen();
  });
  actions.appendChild(closeBtn);

  card.appendChild(actions);
  host.appendChild(card);
  return card;
}

/**
 * boot 経路用: 最初の ready(container あり)を待って 1 回だけ表示を
 * 試みる。boot 直後の描画と競合しないよう少しだけ遅らせる。
 */
export function mountStartupNotice(
  dispatcher: Dispatcher,
  host?: HTMLElement,
  delayMs = 600,
): () => void {
  let fired = false;
  const unsub = dispatcher.onState((s) => {
    if (fired) return;
    if (s.phase !== 'ready' || !s.container) return;
    fired = true;
    setTimeout(() => {
      maybeShowStartupNotice(dispatcher, host);
    }, delayMs);
    queueMicrotask(() => unsub());
  });
  return unsub;
}
