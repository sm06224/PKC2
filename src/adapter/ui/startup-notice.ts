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
import { getUiPref, setUiPref, removeUiPref } from '../platform/ui-prefs';

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
    id: '2026-07-25-code-edit-lite-wave',
    date: '2026-07-25',
    title: '2026-07-25 更新のお知らせ',
    items: [
      '新機能: Flags Inspector に「{} JSON」一括編集を追加しました。VSCode の settings.json のように、変更済みの flag をハイライト・補完つきの JSON でまとめて編集できます(誤りは行番号つきで表示、適用は差分だけ・再読み込み不要)',
      '改善: コードブロックのシンタックスハイライトが xml / svg に対応しました(```xml / ```svg)',
    ],
  },
  {
    id: '2026-07-24-codeblock-render-wave',
    date: '2026-07-24',
    title: '2026-07-24 更新のお知らせ',
    items: [
      '新標準: コードブロックのレンダリング記法を統一しました。レンダリングできる言語(html / mermaid / csv / tsv / psv)は、無印(```html など)= レンダリング表示 + 右上の ‹/› ボタンでソース切替 / -render = レンダリングのみ / -norender = コードのみ、になります(例: ```html-norender)。従来の ```html-render はそのまま「レンダリングのみ」として動き続けます',
      'ご注意: これまで「コード例」として ```html を使っていたブロックはレンダリング表示に変わります。コードのまま見せたい箇所は ```html-norender に書き換えてください(切替ボタンでソースも見られます)',
      'mermaid 図が既定で描画されるようになりました(設定不要。マニュアル 07 章の図解もそのまま表示されます)。コード表示に固定したい場合は ```mermaid-norender',
      '改善: レンダリング表示(html / mermaid / csv)のブロックにもコピー ⧉ ボタンが付きました。コピーされるのは「今見えている面」です(html / mermaid はソース、csv / tsv / psv は表として ── Excel などにそのまま表で貼れます。‹/› でソース面に切り替えていればソースをコピー)',
      '不具合修正: 表をコピーすると、画面上の飾り(行番号の # 列、並べ替え ↕ / 絞り込み ⌕ の記号)まで一緒に貼り付けられてしまう問題を修正しました(Excel や Word に表がきれいに貼れるようになりました)',
      '安全策: ブラウザ保存が使えない環境の案内ダイアログから「フォルダを選んで続行」した場合も、切替の前に移行前バックアップ ZIP を選んだフォルダへ自動作成するようになりました(バックアップに失敗した場合は切り替えず、ダイアログに戻って選び直せます)。これで Settings からの切替と同じ保護になります',
      '不具合修正: エントリを別ウィンドウで開いたとき、```html-render の埋め込み表示が高さ 0 のまま見えない問題を修正しました',
      '不具合修正: Viewer ポップアップの mermaid 図まわり(枠・ソース・エラー表示)のスタイルが本体画面と揃っていなかった問題を修正しました',
    ],
  },
  {
    id: '2026-07-22-refinement-round',
    date: '2026-07-22',
    title: '2026-07 更新のお知らせ',
    items: [
      '不具合修正: マニュアル(pkc2-manual.html)で一部の章(ファイラビュー等)の画像が表示されない問題を修正しました(GitHub 上の Markdown 版でも全画像が表示されるようになりました)',
      'マニュアル: 「07 保存と持ち出し」章を刷新しました。保存先 3 種(ブラウザ内 / OPFS / 実フォルダ)× 保存領域が使えない環境のフォールバック × 保存形式の全体像を図解で説明し、案内ダイアログの選択肢の使い分け・UI 設定の持ち出し(Settings File)も掲載しています',
      '不具合修正: Firefox で ⚙ Settings メニューのレイアウトが崩れる(列が横にはみ出す)問題を修正しました',
      '改善: 画面設定・お知らせ既読・タブ構成などの UI 設定がデータ本体と一緒に保存されるようになりました(ブラウザの localStorage が毎回消去される環境でも設定が維持されます。バックアップ ZIP / HTML 書き出しにも設定が同乗します)',
      '新機能: ⚙ Settings に「設定エクスポート / 設定インポート」を追加。画面設定・UI 設定だけを小さなファイル(.pkc2-prefs.json)で持ち出し / 持ち込みできます(データ・本文・添付は含まれません。インポートは差分を確認してから適用)',
      '改善: ブラウザ内の保存領域(IndexedDB)が使えない環境では、起動時に説明つきの案内を表示して「フォルダ保存 / 都度保存 / 閲覧のみ」を選べるようにしました(黙って機能低下しません。従来はこの環境で起動自体に失敗することがありました)',
      '改善: 上記の環境で「フォルダを選んで続行」を選ぶと、選んだフォルダへ完全なバックアップ ZIP を自動保存し続けるようになりました(編集のたびに数秒後へまとめて書き込み。ブラウザの仕様上、次回起動時はフォルダの選び直しが必要です)',
      '安全策: ストレージをローカルフォルダへ切り替える際、移行前バックアップ ZIP を移行先フォルダへ自動作成するようになりました(バックアップに失敗した場合は切替を中止します)',
      '安全策: ストレージ形式の切替(Flags Inspector の lazy_entry_bodies)を ON にすると、切替前に完全なバックアップ ZIP を自動生成するようになりました(バックアップに失敗した場合は切替を中止します)',
      '改善: 大きな添付(画面収録など)もサイズに関係なくそのまま表示されるようになりました(「大きなファイルは開く時に読み込み」の制限を撤去。新しい読み込み方式はメモリを消費せず、起動やほかの操作を遅くしません)。ランチャー登録アプリとアイコンは起動直後に先読みされ、クリック時の待ちがなくなります',
      '不具合修正: データが大きい(収録・添付が多い)とエクスポートが「string length」エラーやメモリ不足で失敗しバックアップできない問題を修正(逐次書き出し + 大きな添付は無変換で書き出し)',
      'バックアップは 💾 Backup ZIP を推奨: メニュー最上段に格上げしました(アセット分離形式でデータ量によらず確実。HTML 書き出しは配布・持ち運び用として従来どおり)',
      '改善: 大きな添付(4MB 超)は画面表示では読み込まず、開く / ダウンロード時にだけ読み込むように(巨大な収録がある環境で全体の読み込みが極端に遅くなる問題の対策)。開く / ダウンロードはストレージ直読みで待ち行列を跳ばします',
      '差分保存の既定オンを撤回しました: 大きなデータ + 遅いストレージで起動が極端に遅くなる報告のため(#958)。保存形式は次回の保存時に自動で従来の単一形式へ復元されます。書込頻度を抑えたい場合のみ Flags Inspector からオンにできます',
      '不具合修正: HTML アプリ / URL 添付が一時的に「Light export」表示になり開けないことがある問題を修正(読み込み待ちは「⏳ 読み込み中」表示になり、ボタンはそのまま使えます)',
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

// C11: 既読管理は ui-prefs facade 経由(container バッグ優先 +
// localStorage ミラー)。localStorage が毎回初期化される環境で
// 「起動のたびにお知らせが再表示される」問題を解消する。
const lsGet = getUiPref;
const lsSet = setUiPref;

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
  removeUiPref(SEEN_KEY);
  removeUiPref(DISABLED_KEY);
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
