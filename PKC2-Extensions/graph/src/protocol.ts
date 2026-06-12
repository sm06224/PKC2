/**
 * PKC-Extension channel(child 側)— host PKC2 との `pkc-ext` チャネル。
 *
 * 2026-06-12: bespoke `pkc-graph-ext` v1 から汎用 **`pkc-ext` チャネル**へ
 * 全面移行(host 側は v1 を削除済み = 互換切り捨て、normative は host repo
 * `docs/spec/pkc-message-api-v2.md` §3.8)。
 *
 * ## 実行環境 — Tier S sandbox が既定
 * host は本拡張を popup shell 内の `<iframe sandbox="allow-scripts" srcdoc>`
 * で起動する(opaque origin)。子から host への送信先は **`window.parent`**
 * (shell)。Tier T(trusted 宣言)や standalone 検証では `window.opener`。
 * targetOrigin は `'*'` — opaque origin に exact origin は指定できず、
 * security は window identity + nonce が担う(host 側 gate が正)。
 *
 * ## Wire(graph が使う部分)
 *   - 受信 `projection`  ContainerProjection(entries / relations /
 *     links.internal / links.external / stats。body・assets は来ない)
 *   - 受信 `selected`    host 側の選択変更(focus 追従)
 *   - 送信 `hello`       handshake(これだけ nonce 不要)
 *   - 送信 `hint`        `{kind:'select'|'open', lid}`(nonce 必須)
 *   - 送信 `write`       `{ops:[{op:'move',...}|{op:'relate',...}]}`
 *                        (nonce 必須、host が検証して適用)
 *
 * ## 子側 gate — TOFU(trust on first use)
 * Tier S では host の push は main window から直接 iframe へ届くため、
 * `ev.source` は `window.parent` と一致しない(shell ≠ main)。子は
 * **最初の有効な `projection`(nonce 同梱)で source + nonce を pin** し、
 * 以後は両方の一致を要求する。opaque iframe への参照は same-origin 連鎖
 * (shell / main)しか持てないため、第三者 window が最初の 1 通を割り込む
 * 経路は無い。
 */

export const PKC_EXT = 'pkc-ext';
export const PKC_EXT_V = 1;

/** host の `ContainerProjection`(graph が使う field のみ型定義)。 */
export interface ProjectionEntry {
  lid: string;
  title: string;
  archetype: string;
  created_at: string;
  updated_at: string;
  tags?: string[];
  color_tag?: string | null;
  /** Parent folder lid (structural) — for compound/grouped layout. */
  folder?: string;
}
export interface ProjectionRelation {
  from: string;
  to: string;
  kind: string;
}
/** In-document internal link (entry → entry). */
export interface ProjectionInternalLink {
  from: string;
  to: string;
}
/** In-document external link (entry → outside URL). */
export interface ProjectionExternalLink {
  from: string;
  url: string;
}
export interface ContainerProjection {
  containerId: string;
  title: string;
  entries: ProjectionEntry[];
  relations: ProjectionRelation[];
  links?: {
    internal: ProjectionInternalLink[];
    external: ProjectionExternalLink[];
  };
}

function isPkcExt(data: unknown): data is Record<string, unknown> {
  return !!data && typeof data === 'object'
    && (data as { pkc?: unknown }).pkc === PKC_EXT
    && (data as { v?: unknown }).v === PKC_EXT_V;
}

/**
 * Child-side channel to the host PKC2. Returns false from `start()` when
 * there is no host window (extension opened standalone) so the caller can
 * fall back to a local/demo container.
 */
export class GraphChannel {
  private nonce: string | null = null;
  /** Where we SEND(Tier S = parent shell / Tier T・popup = opener)。 */
  private sendTo: Window | null = null;
  /** Pinned identity of the host push source(TOFU、最初の projection で確定)。 */
  private hostSource: MessageEventSource | null = null;

  constructor(
    private readonly onProjection: (p: ContainerProjection) => void,
    private readonly onSelected?: (lid: string) => void,
  ) {}

  /** Begin the handshake with the host. */
  start(): boolean {
    // Tier T(popup 直書き)は opener、Tier S(sandboxed iframe)は parent。
    const sendTo = (window.opener as Window | null)
      ?? (window.parent !== window ? window.parent : null);
    if (!sendTo) return false; // standalone — no host
    this.sendTo = sendTo;
    window.addEventListener('message', (ev) => this.onMessage(ev));
    // Kick the handshake. Host binds us by `event.source`(偽造不能)。
    this.post({ t: 'hello' });
    return true;
  }

  /** Tell the host a node was selected (after the channel is established). */
  select(lid: string): void {
    if (this.nonce === null) return;
    this.post({ t: 'hint', kind: 'select', lid, nonce: this.nonce });
  }

  /** Ask the host to open / focus the entry in PKC2 (double-click). */
  open(lid: string): void {
    if (this.nonce === null) return;
    this.post({ t: 'hint', kind: 'open', lid, nonce: this.nonce });
  }

  /** Ask the host to move an entry into a folder (drag-drop reparent). */
  move(lid: string, folderLid: string): void {
    if (this.nonce === null) return;
    this.post({ t: 'write', ops: [{ op: 'move', lid, folderLid }], nonce: this.nonce });
  }

  /** Ask the host to create a relation between two entries (draw edge). */
  relate(from: string, to: string): void {
    if (this.nonce === null) return;
    this.post({ t: 'write', ops: [{ op: 'relate', from, to }], nonce: this.nonce });
  }

  private post(msg: Record<string, unknown>): void {
    if (!this.sendTo) return;
    try {
      // '*': opaque origin からは exact targetOrigin を指定できない。
      // security は host 側の identity + nonce gate が担う。
      this.sendTo.postMessage({ pkc: PKC_EXT, v: PKC_EXT_V, ...msg }, '*');
    } catch {
      /* host torn down mid-send */
    }
  }

  private onMessage(ev: MessageEvent): void {
    const data = ev.data;
    if (!isPkcExt(data)) return;
    if (this.nonce === null) {
      // TOFU: 最初の有効な projection(nonce 同梱)で host を pin する。
      if (data.t !== 'projection' || typeof data.nonce !== 'string') return;
      this.nonce = data.nonce;
      this.hostSource = ev.source;
      this.onProjection(data.projection as ContainerProjection);
      return;
    }
    // 以後は pin 済み identity + nonce の両方を要求。
    if (ev.source !== this.hostSource) return;
    if (data.nonce !== this.nonce) return;
    if (data.t === 'projection') {
      this.onProjection(data.projection as ContainerProjection);
    } else if (data.t === 'selected' && typeof data.lid === 'string') {
      this.onSelected?.(data.lid);
    }
    // deliver / write-result は graph では未使用(黙殺)。
  }
}
