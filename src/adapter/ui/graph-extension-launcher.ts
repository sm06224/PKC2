/**
 * Graph-extension launcher + secure host channel.
 *
 * Launches the standalone graph extension (its single-file HTML lives in
 * `container.assets`) and serves it a minimal `GraphProjection` over a
 * secure PKC-Message channel. This is the host (opener/parent) side; the
 * child side lives in `PKC2-Extensions/graph/src/protocol.ts`.
 *
 * The extension is hosted in a **same-origin iframe overlay** (an empty
 * iframe whose `contentWindow.document` is written directly). An iframe — not
 * `window.open` — because autostart happens at boot with no user activation,
 * where a popup would be blocked. Same-origin (about:blank) means `event.origin`
 * can be validated and `window.parent` points back to the host.
 *
 * Security — the channel must start safely:
 *   - the host accepts a message only when `event.source === iframe.contentWindow`
 *     (an identity no other frame can forge) **and** `event.origin ===
 *     location.origin`;
 *   - a per-launch `nonce` is handed to the child in the `welcome` and
 *     required on every subsequent child→host message.
 *
 * `targetOrigin` is the exact origin; for `file://` (origin string `"null"`,
 * not a valid `postMessage` target) it falls back to `'*'`, with security
 * carried by the frame-identity + nonce binding.
 */

import type { Container } from '@core/model/container';
import { buildGraphProjection } from '@features/graph-extension/projection';

const PKC_GRAPH = 'pkc-graph-ext';
const PKC_GRAPH_V = 1;

export interface LaunchGraphExtensionOptions {
  /** The extension's single-file HTML (resolved from container.assets). */
  html: string;
  /** Provider for the current container (called to (re)build the projection). */
  getContainer: () => Container | null;
  /** Invoked when the extension reports a node selection. */
  onSelect?: (lid: string) => void;
  /** Invoked when the extension asks to open / focus an entry (double-click). */
  onOpen?: (lid: string) => void;
  /** Invoked when the extension drags an entry into a folder (reparent). */
  onMove?: (lid: string, folderLid: string) => void;
  /** Invoked when the extension draws an edge between two entries (relate). */
  onRelate?: (from: string, to: string) => void;
}

export interface GraphExtensionHandle {
  /** Re-send the current projection (e.g. after the container changed). */
  pushUpdate: () => void;
  /** Close the extension window and tear down the channel. */
  close: () => void;
}

function safeTargetOrigin(): string {
  const o = window.location.origin;
  return o && o !== 'null' ? o : '*';
}

function makeNonce(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `n-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

/**
 * Open the graph extension in a real separate window and wire the secure
 * channel. The single-file extension is a **classic IIFE**, so it runs reliably
 * when injected via `document.write` on every browser (a `type="module"` script
 * does not). Returns null if the popup was blocked (e.g. an autostart at boot
 * with no user activation) — the host must never fall back to a screen-hijacking
 * overlay.
 */
export function launchGraphExtension(opts: LaunchGraphExtensionOptions): GraphExtensionHandle | null {
  const nonce = makeNonce();
  let established = false;
  let childWin: Window | null = null;
  let closeChild: () => void = () => { /* set per mode */ };

  const sendProjection = (t: 'welcome' | 'projection'): void => {
    const container = opts.getContainer();
    if (!container || !childWin) return;
    const projection = buildGraphProjection(container);
    try {
      childWin.postMessage(
        { pkc: PKC_GRAPH, v: PKC_GRAPH_V, t, nonce, projection },
        safeTargetOrigin(),
      );
    } catch {
      /* child torn down mid-send */
    }
  };

  const onMessage = (ev: MessageEvent): void => {
    // Security gate: only the child we launched, only same-origin.
    if (ev.source !== childWin) return;
    if (ev.origin !== window.location.origin) return;
    const d = ev.data as {
      pkc?: unknown; v?: unknown; t?: unknown; nonce?: unknown;
      lid?: unknown; folderLid?: unknown; from?: unknown; to?: unknown;
    } | null;
    if (!d || d.pkc !== PKC_GRAPH || d.v !== PKC_GRAPH_V) return;
    if (d.t === 'hello') {
      established = true;
      sendProjection('welcome');
      return;
    }
    if (d.nonce !== nonce) return; // every other message must carry the channel nonce
    if (d.t === 'select' && typeof d.lid === 'string') {
      opts.onSelect?.(d.lid);
    } else if (d.t === 'open' && typeof d.lid === 'string') {
      opts.onOpen?.(d.lid);
    } else if (d.t === 'move' && typeof d.lid === 'string' && typeof d.folderLid === 'string') {
      opts.onMove?.(d.lid, d.folderLid);
    } else if (d.t === 'relate' && typeof d.from === 'string' && typeof d.to === 'string') {
      opts.onRelate?.(d.from, d.to);
    }
  };

  const cleanup = (): void => {
    window.removeEventListener('message', onMessage);
    closeChild();
  };

  // Always a real separate window — never an in-page overlay (which would
  // hijack the PKC2 screen). `window.open('') + document.write` keeps the child
  // same-origin with `window.opener` pointing back to the host, so the secure
  // channel works; the classic IIFE runs reliably via document.write.
  const win = window.open('', '_blank', 'popup=yes,width=1280,height=800,resizable=yes,scrollbars=yes');
  if (!win) return null;
  win.document.open();
  win.document.write(opts.html);
  win.document.close();
  childWin = win;
  closeChild = () => { try { win.close(); } catch { /* noop */ } };

  window.addEventListener('message', onMessage);

  return {
    pushUpdate: () => { if (established) sendProjection('projection'); },
    close: cleanup,
  };
}
