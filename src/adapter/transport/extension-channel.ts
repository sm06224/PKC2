/**
 * PKC-Extension host channel(host-push 体系、#806 設計 doc rev.2 §3.2 +
 * #796 封じ込め設計)。
 *
 * graph の bespoke `pkc-graph-ext` を一般化した host 側チャネル。
 * **host 主体の push** が一次経路:
 *
 *   - host → ext  `projection`     既定露出(index/list/統計、メタのみ)
 *   - host → ext  `deliver`        ユーザーの send ジェスチャで実体 1 件
 *   - host → ext  `selected`       host 側の選択変更(graph 等が focus を追従)
 *   - ext  → host `write`          T2 editor の書き戻し(host が検証)
 *   - host → ext  `write-result`   書き戻しの成否
 *   - ext  → host `hint`           軽量ヒント(open / select)。実体は流れない
 *   - ext  → host `propose`        新規 entry の作成提案(#830 R5)。host は
 *                                  既存 record:offer 同意 banner に流す
 *   - host → ext  `propose-result` 作成の成否(accept で assigned_lid を返す)
 *   - host → ext  `structure`      構成 export text(改善バッチ⑤ 2026-07)。
 *                                  **user の送付ジェスチャでのみ**送る
 *   - ext  → host `structure-plan` 整理プラン(DSL コマンド列)の提案。host は
 *                                  既存 plan modal に流す(silent apply は無い)
 *   - host → ext  `structure-plan-result` applied / rejected / dismissed
 *
 * **拡張から実体を pull する経路は無い**(rev.1 の `asset:request` は廃止)。
 *
 * 封じ込め 2 層(#796 §2、既定 = Tier S):
 *   - **Tier S sandboxed(既定)**: popup shell(same-origin)内の
 *     `<iframe sandbox="allow-scripts" srcdoc>` で load → opaque origin。
 *     ホスト DOM / IDB / localStorage へ構造的に到達不能、postMessage が
 *     唯一の通路。gate は identity + nonce(origin は `'null'` で自滅する
 *     ため捨てる、#796 §3)。送信 targetOrigin は `'*'`(identity が宛先を
 *     一意化)。子は `window.parent` へ送る。
 *   - **Tier T trusted(manifest 明示 opt-in)**: 現行どおり
 *     `window.open('') + document.write`(same-origin 全権)。gate は
 *     identity + origin + nonce。子は `window.opener` へ送る。
 *
 * capability → sandbox/allow トークン写像(#796 §4.2 初版語彙)は
 * `sandboxTokensFor` を参照。未知 capability は無視(forward 互換)。
 */

import { pinTargetOrigin } from './message-bridge';
import type { DeliverPayload } from '@features/extension-host/deliver';

export const PKC_EXT = 'pkc-ext';
export const PKC_EXT_V = 1;

/** host → ext で渡す実体 1 件(features の `DeliverPayload` 正本の re-export)。 */
export type ExtDeliverPayload = DeliverPayload;

/** ext → host: T2 editor の書き戻し要求(host が op を検証)。 */
export interface ExtWriteRequest {
  lid?: string;
  ops: unknown[];
  correlation_id?: string;
}

/**
 * ext → host: 新規 entry の作成提案(#830 R5)。`offer` は record:offer の
 * payload と同型(title / body / archetype / ... )。host は検証して既存の
 * 同意 banner に流し、ユーザー accept で初めて mint する(silent 作成は無い)。
 */
export interface ExtProposeRequest {
  offer: unknown;
  correlation_id?: string;
}

/**
 * ext → host: 整理プラン(構成コマンド DSL)の提案(改善バッチ⑤ 2026-07)。
 * `text` は mv / mkdir / rename のコマンド列。host は既存 structure-plan
 * modal(dry-run プレビュー)に流し、適用は常に user が確認する。
 */
export interface ExtStructurePlanRequest {
  text: string;
  correlation_id?: string;
}

/** structure-plan の結果(host → ext)。 */
export type StructurePlanResultStatus = 'applied' | 'rejected' | 'dismissed';

/** structure-plan text の受理上限(64KB)。超過は即 rejected。 */
export const STRUCTURE_PLAN_TEXT_MAX = 64 * 1024;

/** #796 §4.1 manifest(AttachmentBody additive)。tier 既定 'sandboxed'。 */
export interface ExtensionManifest {
  tier?: 'sandboxed' | 'trusted';
  capabilities?: string[];
}

export interface LaunchExtensionOptions {
  /** 拡張の単一 HTML(asset 由来)。 */
  html: string;
  /** projection を (再)構築するための provider。 */
  getProjection: () => unknown;
  /** 封じ込め manifest。未指定 = Tier S 最小(`allow-scripts` のみ)。 */
  manifest?: ExtensionManifest;
  /** ext→host `hello` 受信時に established になったら呼ばれる。 */
  onEstablished?: () => void;
  /** ext→host `write`(T2)。host 側で検証して `ok` を返す。 */
  onWrite?: (req: ExtWriteRequest) => boolean;
  /** ext が「この entry を開いて / 選択して」等の軽量ヒント(pull ではない)。 */
  onHint?: (hint: { kind: string; lid?: string }) => void;
  /** ext→host `propose`(#830 R5)。host が同意 banner に流す(結果は `notifyProposeResult`)。 */
  onPropose?: (req: ExtProposeRequest) => void;
  /**
   * ext→host `structure-plan`(改善バッチ⑤)。host が plan modal に流す
   * (結果は `notifyStructurePlanResult`)。text の型 / サイズ検証は channel
   * が済ませてから呼ぶ(不正は即 rejected を返し、ここには来ない)。
   */
  onStructurePlan?: (req: ExtStructurePlanRequest) => void;
}

export interface ExtensionChannelHandle {
  /** 最新 projection を再送(container 変化時)。 */
  pushProjection: () => void;
  /** 実体 1 件を push(送付ジェスチャの結果)。handshake 前は buffer。 */
  deliver: (payload: ExtDeliverPayload) => void;
  /** host 側の選択変更を通知(graph 等が focus を追従)。 */
  notifySelected: (lid: string) => void;
  /**
   * `propose`(#830 R5)の結果を ext へ返す。accept なら assigned_lid 付き、
   * reject/dismiss なら accepted=false。established 前 / 閉鎖後は no-op。
   */
  notifyProposeResult: (accepted: boolean, assignedLid: string | null, correlationId: string | null) => void;
  /**
   * 構成 export text を push(改善バッチ⑤、user の送付ジェスチャの実体)。
   * handshake 前は buffer(最新 1 件が勝つ — 構成はスナップショットなので
   * 古いものを積む意味がない)。
   */
  sendStructure: (text: string) => void;
  /** `structure-plan` の結果を ext へ返す。established 前 / 閉鎖後は no-op。 */
  notifyStructurePlanResult: (
    status: StructurePlanResultStatus,
    applied: number | null,
    errors: readonly string[] | null,
    correlationId: string | null,
  ) => void;
  /** チャネルを閉じる。 */
  close: () => void;
  /** established 済みか(テスト/呼び出し側の判定用)。 */
  isEstablished: () => boolean;
  /**
   * 拡張 window がユーザー操作等で閉じられたか。host は child close を
   * event では検知できない(heartbeat 未導入)ため、再起動判定はこの
   * polling で行う(orchestrator が openExtension 時に確認)。
   */
  isClosed: () => boolean;
}

function makeNonce(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `n-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

/**
 * capability → `sandbox` 属性トークン(#796 §4.2)。`allow-scripts` は常時
 * (拡張は script で動く)。`allow-same-origin` は**決して**付けない(opaque
 * 化こそが封じ込めの核)。
 */
export function sandboxTokensFor(capabilities: readonly string[] | undefined): string[] {
  const tokens = ['allow-scripts'];
  for (const c of capabilities ?? []) {
    if (c === 'downloads') tokens.push('allow-downloads');
    else if (c === 'popups') tokens.push('allow-popups');
    else if (c === 'forms') tokens.push('allow-forms');
    // 未知 capability は無視(forward 互換)。
  }
  return tokens;
}

/** capability → iframe `allow` 属性(#796 §4.2)。 */
export function allowAttributeFor(capabilities: readonly string[] | undefined): string {
  const parts: string[] = [];
  for (const c of capabilities ?? []) {
    if (c === 'clipboard-write') parts.push('clipboard-write');
    else if (c === 'fullscreen') parts.push('fullscreen');
  }
  return parts.join('; ');
}

/**
 * 拡張を起動して host-push チャネルを配線する。popup がブロックされたら
 * null(呼び出し側は retry prompt 等で対応、画面ハイジャックはしない)。
 *
 * Tier S: popup shell に sandboxed iframe を立て、その `contentWindow` を
 * identity の錨にする。message listener は **popup window 側**に張る(子の
 * `window.parent` = popup shell)。
 * Tier T: 子 window 自体が identity。listener は host(main)window。
 */
export function launchExtensionChannel(
  opts: LaunchExtensionOptions,
): ExtensionChannelHandle | null {
  const nonce = makeNonce();
  const trusted = opts.manifest?.tier === 'trusted';
  let established = false;
  let childWin: Window | null = null;
  // 送付ジェスチャ(deliver)が handshake より先に来た場合に備えるバッファ。
  // 「未開封なら開いてから送る」auto-open 経路では deliver が hello 到着前に
  // 呼ばれるのが常態(hello は子 window の script 実行後に async で届く)。
  // 黙って捨てるとユーザーの send が消えるため、hello で flush する。
  const pendingDelivers: ExtDeliverPayload[] = [];
  // 構成送付も同じ auto-open 事情を持つ。スナップショットなので最新 1 件のみ。
  let pendingStructure: string | null = null;

  // Tier S は opaque origin への送信なので '*'(#796 §3 — identity が宛先を
  // 一意化)。Tier T は同一オリジンへピン留め(#797 規則)。
  const target = (): string =>
    trusted ? pinTargetOrigin(window.location.origin) : pinTargetOrigin('null');

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
    // ── security gate(#796 §3)──
    // identity は両 tier で必須(偽造不能の錨)。origin は Tier T のみ
    // 検証(Tier S は opaque = 'null' で同一オリジン検証が自滅するため、
    // identity + nonce が境界を担う)。
    if (ev.source !== childWin) return;
    if (trusted && ev.origin !== window.location.origin) return;
    const d = ev.data as Record<string, unknown> | null;
    if (!d || d.pkc !== PKC_EXT || d.v !== PKC_EXT_V) return;
    if (d.t === 'hello') {
      established = true;
      opts.onEstablished?.();
      sendProjection();
      while (pendingDelivers.length > 0) {
        post({ t: 'deliver', payload: pendingDelivers.shift() });
      }
      if (pendingStructure !== null) {
        post({ t: 'structure', text: pendingStructure });
        pendingStructure = null;
      }
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
    } else if (d.t === 'propose') {
      // #830 R5: 新規 entry の作成提案。offer の検証 + 同意 banner への流し
      // 込みは orchestrator(host 側)が行う。結果は notifyProposeResult で
      // 非同期に返る(ユーザーが banner で accept/dismiss するまで保留)。
      opts.onPropose?.({
        offer: d.offer,
        correlation_id: typeof d.correlation_id === 'string' ? d.correlation_id : undefined,
      });
    } else if (d.t === 'structure-plan') {
      // 改善バッチ⑤: 整理プランの提案。型 / サイズはここで検証し、不正は
      // 即 rejected(orchestrator まで流さない)。正当なら modal 連携は
      // orchestrator が行い、結果は notifyStructurePlanResult で返る。
      const correlationId = typeof d.correlation_id === 'string' ? d.correlation_id : null;
      if (typeof d.text !== 'string' || d.text.length > STRUCTURE_PLAN_TEXT_MAX) {
        post({
          t: 'structure-plan-result',
          status: 'rejected',
          applied: null,
          errors: [typeof d.text !== 'string' ? 'text は文字列で指定してください' : `text が上限(${STRUCTURE_PLAN_TEXT_MAX} 文字)を超えています`],
          correlation_id: correlationId,
        });
        return;
      }
      opts.onStructurePlan?.({
        text: d.text,
        ...(correlationId !== null ? { correlation_id: correlationId } : {}),
      });
    }
    // それ以外の ext→host は無視(pull 経路は存在しない)。
  };

  const win = window.open('', '_blank', 'popup=yes,width=1280,height=800,resizable=yes,scrollbars=yes');
  if (!win) return null;

  let removeListener: () => void;
  if (trusted) {
    // Tier T: 現行どおり popup へ直接 document.write(same-origin 全権)。
    win.document.open();
    win.document.write(opts.html);
    win.document.close();
    childWin = win;
    window.addEventListener('message', onMessage);
    removeListener = () => window.removeEventListener('message', onMessage);
  } else {
    // Tier S: same-origin の shell を書き、その中の sandboxed iframe に
    // srcdoc で拡張を立てる。shell は host と同一オリジンなので host が
    // listener を直接張れる(子の `window.parent` = shell window)。
    win.document.open();
    win.document.write(
      '<!doctype html><html><head><meta charset="utf-8"><title>PKC-Extension</title>'
      + '<style>html,body{margin:0;height:100%;overflow:hidden}'
      + 'iframe{border:0;width:100%;height:100%}</style></head><body></body></html>',
    );
    win.document.close();
    const frame = win.document.createElement('iframe');
    frame.setAttribute('sandbox', sandboxTokensFor(opts.manifest?.capabilities).join(' '));
    const allow = allowAttributeFor(opts.manifest?.capabilities);
    if (allow) frame.setAttribute('allow', allow);
    frame.setAttribute('srcdoc', opts.html);
    win.document.body.appendChild(frame);
    childWin = frame.contentWindow;
    win.addEventListener('message', onMessage);
    removeListener = () => {
      try {
        win.removeEventListener('message', onMessage);
      } catch {
        /* popup already closed */
      }
    };
  }

  win.focus?.(); // 拡張ホスト window を前面へ(新規 open 時に背面化しない)

  return {
    pushProjection: () => { if (established) sendProjection(); },
    deliver: (payload: ExtDeliverPayload) => {
      if (!established) {
        pendingDelivers.push(payload);
        return;
      }
      post({ t: 'deliver', payload });
    },
    notifySelected: (lid: string) => {
      if (established) post({ t: 'selected', lid });
    },
    notifyProposeResult: (accepted, assignedLid, correlationId) => {
      if (established) {
        post({ t: 'propose-result', accepted, assigned_lid: assignedLid, correlation_id: correlationId });
      }
    },
    sendStructure: (text: string) => {
      if (!established) {
        pendingStructure = text;
        return;
      }
      post({ t: 'structure', text });
    },
    notifyStructurePlanResult: (status, applied, errors, correlationId) => {
      if (established) {
        post({
          t: 'structure-plan-result',
          status,
          applied,
          errors: errors ?? null,
          correlation_id: correlationId,
        });
      }
    },
    close: () => {
      removeListener();
      try { win.close(); } catch { /* noop */ }
      childWin = null;
    },
    isEstablished: () => established,
    isClosed: () => {
      try {
        return childWin === null || win.closed === true;
      } catch {
        return true;
      }
    },
  };
}
