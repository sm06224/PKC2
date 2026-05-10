/**
 * iOS Safari hard reload + version-check helper(2026-05-10、user 報告対応)。
 *
 * 背景:iOS Safari の Add to Home Screen mode は独自キャッシュ層を持ち、
 * `location.reload()` やブラウザの引き下げジェスチャーがキャッシュを
 * 無視しない。単一 HTML ファイル(dist/pkc2.html)で配布する PKC2 では
 * この問題が顕著で、新バージョン release してもユーザーの home screen
 * から起動した PKC2 が古いまま固定されることがある。
 *
 * 提供 API:
 *
 *   - forceReload():`?_r=<timestamp>` を付けた URL に遷移
 *     → Safari のキャッシュを bypass、確実に最新ファイルを取得
 *
 *   - checkForUpdate():起動時に HEAD リクエストで `Last-Modified` を取得、
 *     localStorage に保存した前回値と比較して toast 通知
 *     → file:// scheme / offline / fetch 失敗時は silent skip
 *
 *   - showUpdateToast():更新検知時の toast 表示(タップで forceReload)
 *
 * 設計判断(2026-05-10、user 確認済):
 *   - Service Worker は採用しない(PKC2 invariant「Single HTML product」違反 +
 *     iOS SW の癖)
 *   - 案 1(force reload button)+ 案 3(起動時 version check)の組合せ
 *   - failure はすべて silent(critical path に乗せない)
 */

import { showToast } from '../ui/toast';

const STORAGE_KEY = 'pkc2.last-known-version';
const RELOAD_QUERY_PARAM = '_r';

/**
 * 強制再読み込み:URL に `?_r=<timestamp>` を付けて遷移。
 * 既存 query は破棄、hash も破棄(home screen 起動時の URL 再現性のため)。
 *
 * iOS Safari の Add to Home Screen mode キャッシュを確実に bypass する。
 */
export function forceReload(): void {
  const base = location.pathname;
  const url = `${base}?${RELOAD_QUERY_PARAM}=${Date.now()}`;
  // location.replace で history を汚さない(戻るボタンで古い URL に戻らない)
  location.replace(url);
}

/**
 * 起動直後に呼び出す version check。
 *
 * 動作:
 *   1. fetch HEAD で `Last-Modified` ヘッダーを取得
 *   2. localStorage の前回値と比較
 *   3. 異なれば toast 表示(タップで forceReload)
 *   4. 値を localStorage に保存
 *
 * Skip 条件:
 *   - URL に `?_r=<timestamp>` が付いている(forceReload 直後 = 再 check 不要)
 *   - file:// scheme(fetch が CORS で失敗、または 404)
 *   - fetch / parse 失敗(silent、ユーザー体験を損なわない)
 *
 * Non-blocking:エラーは throw せず Promise<void> を返す。
 */
export async function checkForUpdate(opts: {
  /** 上書き用(test / debug 用)。default: location.pathname */
  pathname?: string;
  /** 上書き用(test / debug 用)。default: localStorage */
  storage?: { getItem(k: string): string | null; setItem(k: string, v: string): void };
  /** Toast 表示する callback。default: showToast */
  onUpdate?: (info: { lastModified: string; previousVersion: string | null }) => void;
} = {}): Promise<void> {
  // forceReload 直後は再 check をスキップ(無限ループ回避)
  if (location.search.includes(`${RELOAD_QUERY_PARAM}=`)) {
    return;
  }

  // file:// scheme は fetch できない
  if (location.protocol === 'file:') return;

  const pathname = opts.pathname ?? location.pathname;
  const storage = opts.storage ?? localStorage;
  const onUpdate = opts.onUpdate ?? defaultUpdateToast;

  let lastModified: string | null = null;
  try {
    const response = await fetch(pathname, {
      method: 'HEAD',
      cache: 'no-store',
    });
    if (!response.ok) return;
    lastModified = response.headers.get('last-modified');
  } catch {
    // 回線切断 / CORS / その他失敗は silent skip
    return;
  }

  if (!lastModified) return;

  const previous = storage.getItem(STORAGE_KEY);
  if (previous && previous !== lastModified) {
    // 更新検知
    onUpdate({ lastModified, previousVersion: previous });
  }

  // 初回 / 同値 / 更新検知後すべて、最新値を保存
  try {
    storage.setItem(STORAGE_KEY, lastModified);
  } catch {
    // localStorage 不可(private mode / quota)は silent
  }
}

function defaultUpdateToast(info: { lastModified: string; previousVersion: string | null }): void {
  const toast = showToast({
    message: '新しいバージョンがあります(タップで適用)',
    kind: 'info',
    autoDismissMs: 0, // 自動消去しない(ユーザーが気付くまで残す)
  });
  toast.style.cursor = 'pointer';
  toast.setAttribute('data-pkc-action', 'apply-update');
  toast.setAttribute(
    'title',
    `Last-Modified: ${info.lastModified}` + (info.previousVersion ? ` (前: ${info.previousVersion})` : ''),
  );
  toast.addEventListener('click', () => {
    forceReload();
  });
}

/**
 * test / debug 用:現在保存されている last-known-version を取得。
 */
export function getStoredVersion(storage?: { getItem(k: string): string | null }): string | null {
  return (storage ?? localStorage).getItem(STORAGE_KEY);
}

/**
 * test / debug 用:storage の last-known-version を消去(初回起動扱いに戻す)。
 */
export function clearStoredVersion(storage?: { removeItem(k: string): void }): void {
  (storage ?? localStorage).removeItem(STORAGE_KEY);
}
