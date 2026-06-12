/**
 * PKC-Extension host channel(host-push 体系、#806 設計 doc rev.2 §3.2 —
 * 一括実装 3/6)。
 *
 * graph の bespoke `pkc-graph-ext`(`graph-extension-launcher.ts`)を
 * 汎用語彙へ一般化した host 側チャネル。**host 主体の push** が一次経路:
 *
 *   - host → ext  `pkc:projection`  既定露出(index/list/統計、メタのみ)
 *   - host → ext  `pkc:deliver`     ユーザーの send ジェスチャで実体 1 件
 *   - ext  → host `pkc:write`       T2 editor の書き戻し(host が検証)
 *   - host → ext  `pkc:write-result`書き戻しの成否
 *
 * **拡張から実体を pull する経路は無い**(rev.1 の `asset:request` は廃止)。
 *
 * セキュリティ(graph と同じ primitive、#796 の opaque 移行でも生存):
 *   1. window identity: `event.source === childWin`(偽造不能の錨)
 *   2. origin: `event.origin === location.origin`(opaque 化前の現行)
 *   3. per-launch nonce: 全 ext→host message に必須
 * 送信 targetOrigin は `pinTargetOrigin(location.origin)`(#797 規則)。
 *
 * このモジュールは wire のみ。送付ジェスチャ(右クリック「拡張へ送る」)の
 * UI 導線は 4/6、graph の本チャネルへの移行は 5/6 で行う。
 */

import { pinTargetOrigin } from './message-bridge';
import type { DeliverPayload } from '@features/extension-host/deliver';

export const PKC_EXT = 'pkc-ext';
export const PKC_EXT_V = 1;

/** host → ext で渡す実体 1 件(features の `DeliverPayload` 正本の re-export)。 */
export type ExtDeliverPayload = DeliverPayload;

/** host → ext: 既定露出。projection は `ContainerProjection`(features 層)。 */
export interface ExtProjectionMsg {
  pkc: typeof PKC_EXT;
  v: typeof PKC_EXT_V;
  t: 'projection';
  nonce: string;
  projection: unknown;
}

/** ext → host: T2 editor の書き戻し要求(host が op を検証)。 */
export interface ExtWriteRequest {
  lid?: string;
  ops: unknown[];
  correlation_id?: string;
}

export interface LaunchExtensionOptions {
  /** 拡張の単一 HTML(asset 由来)。 */
  html: string;
  /** projection を (再)構築するための provider。 */
  getProjection: () => unknown;
  /** ext→host `hello` 受信時に established になったら呼ばれる。 */
  onEstablished?: () => void;
  /** ext→host `pkc:write`(T2)。host 側で検証して `ok` を返す。 */
  onWrite?: (req: ExtWriteRequest) => boolean;
  /** ext が「この entry を開いてほしい」等の軽量ヒント(pull ではない)。 */
  onHint?: (hint: { kind: string; lid?: string }) => void;
}

export interface ExtensionChannelHandle {
  /** 最新 projection を再送(container 変化時)。 */
  pushProjection: () => void;
  /** 実体 1 件を push(送付ジェスチャの結果)。 */
  deliver: (payload: ExtDeliverPayload) => void;
  /** チャネルを閉じる。 */
  close: () => void;
  /** established 済みか(テスト/呼び出し側の判定用)。 */
  isEstablished: () => boolean;
}

function makeNonce(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `n-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

/**
 * 拡張を別ウィンドウで起動し、host-push チャネルを配線する。popup が
 * ブロックされたら null(呼び出し側は retry prompt 等で対応、画面ハイジャック
 * はしない)。同一オリジン(`window.open('') + document.write`)で childWin
 * identity + nonce が成立する。
 */
export function launchExtensionChannel(
  opts: LaunchExtensionOptions,
): ExtensionChannelHandle | null {
  const nonce = makeNonce();
  let established = false;
  let childWin: Window | null = null;

  const target = (): string => pinTargetOrigin(window.location.origin);

  const post = (msg: Record<string, unknown>): void => {
    if (!childWin) return;
    try {
      childWin.postMessage({ pkc: PKC_EXT, v: PKC_EXT_V, nonce, ...msg }, target());
    } catch {
      /* child torn down mid-send */
    }
  };

  const sendProjection = (): void => {
    const projection = opts.getProjection();
    if (projection == null) return;
    post({ t: 'projection', projection });
  };

  const onMessage = (ev: MessageEvent): void => {
    // ── security gate(graph と同一 primitive)──
    if (ev.source !== childWin) return;
    if (ev.origin !== window.location.origin) return;
    const d = ev.data as Record<string, unknown> | null;
    if (!d || d.pkc !== PKC_EXT || d.v !== PKC_EXT_V) return;
    if (d.t === 'hello') {
      established = true;
      opts.onEstablished?.();
      sendProjection();
      return;
    }
    if (d.nonce !== nonce) return; // hello 以外は nonce 必須
    if (d.t === 'write' && Array.isArray(d.ops)) {
      const req: ExtWriteRequest = {
        lid: typeof d.lid === 'string' ? d.lid : undefined,
        ops: d.ops,
        correlation_id: typeof d.correlation_id === 'string' ? d.correlation_id : undefined,
      };
      const ok = opts.onWrite ? opts.onWrite(req) : false;
      post({ t: 'write-result', ok, correlation_id: req.correlation_id ?? null });
    } else if (d.t === 'hint') {
      opts.onHint?.({
        kind: typeof d.kind === 'string' ? d.kind : 'unknown',
        lid: typeof d.lid === 'string' ? d.lid : undefined,
      });
    }
    // それ以外の ext→host は無視(pull 経路は存在しない)。
  };

  const win = window.open('', '_blank', 'popup=yes,width=1280,height=800,resizable=yes,scrollbars=yes');
  if (!win) return null;
  win.document.open();
  win.document.write(opts.html);
  win.document.close();
  childWin = win;

  window.addEventListener('message', onMessage);

  return {
    pushProjection: () => { if (established) sendProjection(); },
    deliver: (payload: ExtDeliverPayload) => {
      if (!established) return;
      post({ t: 'deliver', payload });
    },
    close: () => {
      window.removeEventListener('message', onMessage);
      try { childWin?.close(); } catch { /* noop */ }
      childWin = null;
    },
    isEstablished: () => established,
  };
}
