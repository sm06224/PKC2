/**
 * FSA 再接続バナー(#940、user 報告 2026-07-21「fsa で前回パスを読み込まずに
 * 新規コンテナ状態で開く場合がある」)。
 *
 * 原因: FSA の保存 handle は再起動後 permission が `'prompt'` に落ちるが、
 * boot には user gesture が無く requestPermission できない → 従来は silent に
 * IDB へ fallback し、IDB 側が空だと「新規コンテナで開いた」ように見えた
 * (しかもそのまま編集するとフォルダと別データに分岐する)。
 *
 * 本バナーは idb-warning-banner と同じく state-driven render の外で表示する
 * 常駐 UI。**再接続ボタン = user gesture** で requestPermission → granted なら
 * caller が reload してフォルダから正しく boot し直す。
 */

export interface FsaReconnectOptions {
  /** 保存 handle のフォルダ名(表示用)。 */
  folderName: string;
  /**
   * 再接続試行。granted なら true を返す(caller 側で reload まで済ませて
   * よい ── その場合この Promise は解決しなくても構わない)。
   */
  onReconnect: () => Promise<boolean>;
  /** Host element。既定 document.body。 */
  host?: HTMLElement;
}

/**
 * 再接続バナーを表示する(idempotent)。戻り値はバナー要素。
 */
export function showFsaReconnectBanner(opts: FsaReconnectOptions): HTMLElement {
  const host = opts.host ?? document.body;
  const existing = host.querySelector<HTMLElement>('[data-pkc-region="fsa-reconnect"]');
  if (existing) return existing;

  const banner = document.createElement('div');
  banner.className = 'pkc-idb-warning pkc-fsa-reconnect';
  banner.setAttribute('role', 'alert');
  banner.setAttribute('data-pkc-region', 'fsa-reconnect');

  const title = document.createElement('strong');
  title.className = 'pkc-idb-warning-title';
  title.textContent = `フォルダ「${opts.folderName}」への再接続が必要です`;
  banner.appendChild(title);

  const detail = document.createElement('span');
  detail.className = 'pkc-idb-warning-detail';
  detail.textContent =
    ' — ブラウザの権限確認のため、いま表示されているのは保存フォルダの内容ではありません。' +
    '編集を始める前に再接続してください(編集するとフォルダと別のデータに分かれます)。';
  banner.appendChild(detail);

  const reconnect = document.createElement('button');
  reconnect.type = 'button';
  reconnect.className = 'pkc-fsa-reconnect-btn';
  reconnect.setAttribute('data-pkc-action', 'fsa-reconnect');
  reconnect.textContent = '🔓 フォルダに再接続';
  reconnect.addEventListener('click', () => {
    reconnect.disabled = true;
    reconnect.textContent = '再接続中…';
    void opts.onReconnect().then((ok) => {
      if (!ok) {
        reconnect.disabled = false;
        reconnect.textContent = '🔓 フォルダに再接続';
        detail.textContent =
          ' — 権限が許可されませんでした。もう一度試すか、⚙ → Storage Profile からフォルダを選び直してください。';
      }
      // ok の場合は caller が reload するのでここでは何もしない。
    }).catch(() => {
      reconnect.disabled = false;
      reconnect.textContent = '🔓 フォルダに再接続';
    });
  });
  banner.appendChild(reconnect);

  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'pkc-idb-warning-dismiss';
  dismiss.setAttribute('data-pkc-action', 'dismiss-fsa-reconnect');
  dismiss.setAttribute('aria-label', 'このまま続行(フォルダとは別データ)');
  dismiss.setAttribute('title', 'このまま続行(フォルダとは別データ)');
  dismiss.textContent = '×';
  dismiss.addEventListener('click', () => banner.remove());
  banner.appendChild(dismiss);

  host.appendChild(banner);
  return banner;
}
