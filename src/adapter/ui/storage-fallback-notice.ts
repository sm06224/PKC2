/**
 * ブラウザ保存フォールバック掲示 — C11 §4.5 ④-1(user GO 2026-07-22)。
 *
 * boot 時の probe で IndexedDB が利用不能と判った時、**黙って劣化させず**
 * 明示ダイアログでフォールバックを掲示する(自動切替はしない — user 裁定)。
 * 掲示内容は設計正本 doc §4.5「フォールバック掲示(UX 仕様)」のとおり:
 *
 *   - 新旧ストレージモードの比較図解つきの丁寧な説明
 *   - 新旧ベンチの要約(体感がどう変わるか)
 *   - 従来エクスポート形式(単一 HTML)と ZIP の互換保証・
 *     マイグレーション提供の明記
 *   - 選択肢: ①フォルダを選んで続行(推奨) ②都度の明示保存で続行
 *     ③閲覧のみ + ④通常モードの再試行(probe 誤検知に備える)
 *
 * 表示条件: IDB probe 不能 + 非 embed。automation(webdriver)では
 * `?pkc-storage-fallback-force=1` の明示解除がある時だけ表示
 * (startup-notice と同じゲート — 既存 smoke の座標 click を壊さない)。
 * force param は実ブラウザでの掲示確認(parity spec / user デモ)にも使う。
 */

import type { Dispatcher } from '../state/dispatcher';
import { showToast } from './toast';
import { pickDirectory, verifyFsaPermission } from '../platform/storage/fsa-adapter';
import { saveFsaHandle } from '../platform/storage/fsa-handle-store';
import { setStorageBackendPref } from '../platform/storage-backend';
import { probeIDBAvailability } from '../platform/idb-store';
import { mountFolderSink, type SinkDirectoryHandle } from '../platform/folder-sink';

const REGION = 'storage-fallback-notice';

export interface StorageFallbackOptions {
  /** probe が返した理由文字列(あれば掲示に含める)。 */
  reason?: string;
  /** test / デモ用: 表示ゲート(automation 判定)を無視して必ず出す。 */
  force?: boolean;
  host?: HTMLElement;
}

function isAutomated(): boolean {
  try {
    return (globalThis.navigator as { webdriver?: boolean } | undefined)?.webdriver === true;
  } catch {
    return false;
  }
}

export function isStorageFallbackForceRequested(): boolean {
  try {
    return new URLSearchParams(globalThis.location?.search ?? '')
      .get('pkc-storage-fallback-force') === '1';
  } catch {
    return false;
  }
}

function el(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * ダイアログを即時表示する。呼び出し側(mount)が表示条件を満たした時
 * のみ呼ぶ。冪等 — 既存ダイアログは張り替える。
 */
export function showStorageFallbackNotice(
  dispatcher: Dispatcher,
  opts: StorageFallbackOptions = {},
): HTMLElement {
  const host = opts.host ?? document.body;
  host.querySelector(`[data-pkc-region="${REGION}"]`)?.remove();

  const overlay = el('div', 'pkc-storage-fallback-overlay');
  overlay.setAttribute('data-pkc-region', REGION);
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'ブラウザ保存が利用できません');

  const card = el('div', 'pkc-storage-fallback-card');

  card.appendChild(el('div', 'pkc-storage-fallback-heading', '⚠ ブラウザ内の保存領域が利用できません'));

  const intro = el('div', 'pkc-storage-fallback-text');
  intro.textContent =
    'この環境ではブラウザの保存領域(IndexedDB / localStorage)が使えないか、'
    + '毎回初期化されるため、通常の「ブラウザ内に自動保存」モードが機能しません。'
    + '代わりに、ファイルへ保存する方式で続行することを提案します。'
    + '勝手にモードを切り替えることはありません — 下から選んでください。'
    + (opts.reason ? `(検知理由: ${opts.reason})` : '');
  card.appendChild(intro);

  // ── 図解: 新旧ストレージモードの比較(doc §4.5 と同構図)──
  const diagram = el('pre', 'pkc-storage-fallback-diagram');
  diagram.setAttribute('data-pkc-region', 'storage-fallback-diagram');
  diagram.textContent = [
    '【従来モード(ブラウザ保存)】',
    '  作業中データ ⇄ ブラウザ内 IndexedDB(自動保存)',
    '        ↓ 手動操作時のみ',
    '  書き出し(HTML / ZIP)',
    '  ※ この環境では IndexedDB が使えず、ここが機能しない',
    '',
    '【ファイル保存モード(この環境向け)】',
    '  起動: ファイル / フォルダを開く(取り込み)',
    '  作業中データはメモリ上 → 保存はファイルへ',
    '    ・フォルダを選べば自動保存(推奨)',
    '    ・または HTML / ZIP への都度保存',
  ].join('\n');
  card.appendChild(diagram);

  // ── ベンチ要約(実測、doc §4.5 の表の要約)──
  const bench = el('div', 'pkc-storage-fallback-text');
  bench.setAttribute('data-pkc-region', 'storage-fallback-bench');
  bench.textContent =
    '性能の参考(実測・300MB 級データ): 新しいストレージ構成では起動 11 秒 → 0.02〜0.03 秒、'
    + '添付 1 件の読み込み 152ms → 1〜5ms。ファイル保存モードでも従来モードと同水準の体感です。';
  card.appendChild(bench);

  // ── 互換保証・マイグレーション(doc の必須記載)──
  const compat = el('div', 'pkc-storage-fallback-text pkc-storage-fallback-compat');
  compat.setAttribute('data-pkc-region', 'storage-fallback-compat');
  compat.textContent =
    '互換について: 従来の書き出し形式(単一 HTML)と Backup ZIP はどちらのモードでも'
    + 'そのまま読み書きできます(互換保証)。ブラウザ保存 ⇄ ファイル保存の間の'
    + 'データ移行(マイグレーション)も提供されます — 移行の前には必ず ZIP バックアップを作成します。';
  card.appendChild(compat);

  const actions = el('div', 'pkc-storage-fallback-actions');

  const close = (): void => overlay.remove();

  // ① フォルダを選んで続行(推奨)
  const folderBtn = el('button', 'pkc-btn pkc-btn-create', '📁 フォルダを選んで続行(推奨)') as HTMLButtonElement;
  folderBtn.type = 'button';
  folderBtn.setAttribute('data-pkc-action', 'storage-fallback-pick-folder');
  folderBtn.title = 'ローカルフォルダを保存先にして続行します(以後そのフォルダへ保存)';
  folderBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    void (async (): Promise<void> => {
      const handle = await pickDirectory();
      if (!handle) return;
      if (!(await verifyFsaPermission(handle, true))) return;
      try {
        await saveFsaHandle(handle);
        setStorageBackendPref('fsa');
        close();
        globalThis.location?.reload?.();
      } catch {
        // IDB が完全に死んでいると handle を記憶できない(ブラウザ仕様上
        // handle は IDB にしか永続できない)。④-2: セッション内だけ
        // メモリ上の handle でフォルダ sink を mount し、完全な復元可能物
        // (Backup ZIP)を debounce で置き続ける。次回起動時はフォルダを
        // 選び直す(その導線はこのダイアログ自身が再掲示される)。
        const sink = mountFolderSink(
          dispatcher,
          handle as unknown as SinkDirectoryHandle,
          {
            onSaved: (info) => {
              showToast({
                message: `フォルダへ自動保存しました(${info.filename}、${Math.max(1, Math.round(info.size / 1024))} KB)`,
                kind: 'info',
              });
            },
            onError: () => {
              showToast({
                message: 'フォルダへの自動保存に失敗しました。💾 Backup ZIP / HTML 書き出しでの都度保存を検討してください',
                kind: 'error',
              });
            },
          },
        );
        close();
        showToast({
          message: 'このセッションでは選んだフォルダへ自動保存します(常に完全なバックアップ ZIP を置き続けます)。ブラウザの仕様上、次回起動時はフォルダを選び直してください',
          kind: 'info',
        });
        // 選んだ瞬間に必ず 1 つ完全な復元可能物が置かれる状態にする
        void sink.flushNow();
      }
    })();
  });
  actions.appendChild(folderBtn);

  // ② 都度の明示保存で続行
  const manualBtn = el('button', 'pkc-btn-small', '都度保存で続行') as HTMLButtonElement;
  manualBtn.type = 'button';
  manualBtn.setAttribute('data-pkc-action', 'storage-fallback-manual-save');
  manualBtn.title = '自動保存なしで使い、保存はメニューの Backup ZIP / HTML 書き出しで行う';
  manualBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    close();
    showToast({
      message: '自動保存は無効です。保存はメニュー最上段の 💾 Backup ZIP(推奨)または HTML 書き出しで行ってください',
      kind: 'info',
    });
  });
  actions.appendChild(manualBtn);

  // ③ 閲覧のみ
  const viewBtn = el('button', 'pkc-btn-small', '閲覧のみ') as HTMLButtonElement;
  viewBtn.type = 'button';
  viewBtn.setAttribute('data-pkc-action', 'storage-fallback-view-only');
  viewBtn.title = '編集せず閲覧だけする(編集 UI を無効化)';
  viewBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dispatcher.dispatch({ type: 'SYS_ENTER_READONLY' });
    close();
    showToast({ message: '閲覧のみモードにしました(編集 UI を無効化)', kind: 'info' });
  });
  actions.appendChild(viewBtn);

  // ④ 通常モードを再試行(probe 誤検知に備える)
  const retryBtn = el('button', 'pkc-btn-small', '通常モードを再試行') as HTMLButtonElement;
  retryBtn.type = 'button';
  retryBtn.setAttribute('data-pkc-action', 'storage-fallback-retry');
  retryBtn.title = 'ブラウザ保存をもう一度確認し、使えるようなら通常モードで再起動する';
  retryBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    void probeIDBAvailability().then((status) => {
      if (status.available) {
        close();
        globalThis.location?.reload?.();
      } else {
        showToast({
          message: `ブラウザ保存はまだ利用できません${status.reason ? `(${status.reason})` : ''}`,
          kind: 'warn',
        });
      }
    });
  });
  actions.appendChild(retryBtn);

  card.appendChild(actions);
  overlay.appendChild(card);
  host.appendChild(overlay);
  return overlay;
}

/**
 * boot 経路用 mount: 最初の ready(container あり)を待って表示条件を
 * 判定し、満たせば 1 回だけ掲示する。
 *
 * - embed 中は出さない(host 側がデータフローを管理する文脈)
 * - automation(webdriver)は force param がある時だけ
 */
export function mountStorageFallbackNotice(
  dispatcher: Dispatcher,
  opts: StorageFallbackOptions = {},
): () => void {
  let fired = false;
  const unsub = dispatcher.onState((s) => {
    if (fired) return;
    if (s.phase !== 'ready' || !s.container) return;
    fired = true;
    queueMicrotask(() => unsub());
    if (s.embedded) return;
    if (isAutomated() && !opts.force) return;
    showStorageFallbackNotice(dispatcher, opts);
  });
  return unsub;
}
