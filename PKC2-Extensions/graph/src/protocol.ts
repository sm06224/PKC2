/**
 * PKC-Graph extension channel — the secure PKC-Message flow between a host
 * PKC2 (the opener/parent) and this graph extension launched from PKC2's
 * `container.assets` via the launcher (`window.open('') + document.write`,
 * so the child is **same-origin** with the host).
 *
 * This is the host→child direction the formal PKC-Message docs do not cover
 * (`export:request` is embedded-only = the inverse). It is intentionally
 * minimal and replaces the earlier fabricated `pkc.container.*` methods.
 *
 * ## Payload — only what the graph needs
 * The host sends a `GraphProjection` (node/edge metadata only). Entry
 * `body`, `assets` (base64 blobs) and `revisions` are **never** sent.
 *
 * ## Secure handshake (must start safely)
 *   1. host opens the child window (keeps the `Window` ref) and listens.
 *   2. child → host  `hello`            — host accepts ONLY if
 *      `event.source === openedWindow && event.origin === location.origin`.
 *      The window identity is unforgeable (no other frame *is* that window).
 *   3. host → child  `welcome {nonce, projection}` — child pins the nonce +
 *      `event.source === window.opener` + origin for all later messages.
 *   4. child → host  `select {nonce, lid}` / host → child `projection {nonce}`
 *      (live updates) — both sides validate source + origin + nonce.
 *
 * `targetOrigin` is the exact origin; for `file://` (origin string `"null"`,
 * which is not a valid `postMessage` targetOrigin) it falls back to `'*'`,
 * with security carried by the window-identity + nonce binding.
 */

export const PKC_GRAPH = 'pkc-graph-ext';
export const PKC_GRAPH_V = 1;

export interface GraphNodeProjection {
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
export interface GraphEdgeProjection {
  from: string;
  to: string;
  kind: string;
}
/** In-document internal link (entry → entry). */
export interface GraphHyperlink {
  from: string;
  to: string;
}
/** In-document external link (entry → outside URL). */
export interface GraphExternalLink {
  from: string;
  url: string;
}
export interface GraphProjection {
  containerId: string;
  title: string;
  nodes: GraphNodeProjection[];
  edges: GraphEdgeProjection[];
  hyperlinks?: GraphHyperlink[];
  externalLinks?: GraphExternalLink[];
}

export type ChildToHost =
  | { pkc: typeof PKC_GRAPH; v: 1; t: 'hello' }
  | { pkc: typeof PKC_GRAPH; v: 1; t: 'select'; nonce: string; lid: string };

export type HostToChild =
  | { pkc: typeof PKC_GRAPH; v: 1; t: 'welcome'; nonce: string; projection: GraphProjection }
  | { pkc: typeof PKC_GRAPH; v: 1; t: 'projection'; nonce: string; projection: GraphProjection };

/** Valid postMessage targetOrigin — exact origin, or '*' for opaque file://. */
export function safeTargetOrigin(): string {
  const o = window.location.origin;
  return o && o !== 'null' ? o : '*';
}

function isPkcGraph(data: unknown): data is { pkc: string; v: number; t: string } {
  return !!data && typeof data === 'object'
    && (data as { pkc?: unknown }).pkc === PKC_GRAPH
    && (data as { v?: unknown }).v === PKC_GRAPH_V;
}

/**
 * Child-side channel to the host PKC2. Returns false from `start()` when
 * there is no opener (extension opened standalone) so the caller can fall
 * back to a local/demo container.
 */
export class GraphChannel {
  private nonce: string | null = null;
  private host: Window | null = null;

  constructor(
    private readonly onProjection: (p: GraphProjection) => void,
  ) {}

  /** Begin the secure handshake with the host. */
  start(): boolean {
    // The host is the opener (popup launch) or the parent (iframe overlay).
    const host = (window.opener as Window | null)
      ?? (window.parent !== window ? window.parent : null);
    if (!host) return false; // standalone — no host
    this.host = host;
    window.addEventListener('message', (ev) => this.onMessage(ev));
    // Kick the handshake. Host binds us by `event.source` (the window it
    // opened) — identity it cannot be fooled about.
    host.postMessage({ pkc: PKC_GRAPH, v: PKC_GRAPH_V, t: 'hello' } satisfies ChildToHost, safeTargetOrigin());
    return true;
  }

  /** Tell the host a node was selected (after the channel is established). */
  select(lid: string): void {
    if (!this.host || this.nonce === null) return;
    this.host.postMessage(
      { pkc: PKC_GRAPH, v: PKC_GRAPH_V, t: 'select', nonce: this.nonce, lid } satisfies ChildToHost,
      safeTargetOrigin(),
    );
  }

  private onMessage(ev: MessageEvent): void {
    // Security: only the opener, only same-origin.
    if (ev.source !== this.host) return;
    if (ev.origin !== window.location.origin) return;
    const data = ev.data;
    if (!isPkcGraph(data)) return;
    const msg = data as HostToChild;
    if (msg.t === 'welcome') {
      // Pin the nonce the host assigned to this channel.
      this.nonce = msg.nonce;
      this.onProjection(msg.projection);
    } else if (msg.t === 'projection') {
      if (this.nonce === null || msg.nonce !== this.nonce) return; // nonce gate
      this.onProjection(msg.projection);
    }
  }
}
