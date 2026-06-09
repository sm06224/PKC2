/**
 * Graph-extension launcher + secure host channel.
 *
 * Launches the standalone graph extension (its single-file HTML lives in
 * `container.assets`) and serves it a minimal `GraphProjection` over a
 * secure PKC-Message channel. This is the host (opener/parent) side; the
 * child side lives in `PKC2-Extensions/graph/src/protocol.ts`.
 *
 * Security — the channel must start safely:
 *   - the child is opened with `window.open('') + document.write`, so it is
 *     **same-origin** with the host and `window.opener` points back here;
 *   - the host accepts a message only when `event.source === openedWindow`
 *     (an identity no other frame can forge) **and** `event.origin ===
 *     location.origin`;
 *   - a per-launch `nonce` is handed to the child in the `welcome` and
 *     required on every subsequent child→host message.
 *
 * `targetOrigin` is the exact origin; for `file://` (origin string `"null"`,
 * not a valid `postMessage` target) it falls back to `'*'`, with security
 * carried by the window-identity + nonce binding.
 */

import type { Container } from '@core/model/container';
import { buildGraphProjection } from '@features/graph-extension/projection';

const PKC_GRAPH = 'pkc-graph-ext';
const PKC_GRAPH_V = 1;
const POPUP_FEATURES = 'popup=yes,width=1280,height=800,resizable=yes,scrollbars=yes';

export interface LaunchGraphExtensionOptions {
  /** The extension's single-file HTML (resolved from container.assets). */
  html: string;
  /** Provider for the current container (called to (re)build the projection). */
  getContainer: () => Container | null;
  /** Invoked when the extension reports a node selection. */
  onSelect?: (lid: string) => void;
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
 * Open the graph extension and wire the secure channel. Returns null if the
 * popup was blocked.
 */
export function launchGraphExtension(opts: LaunchGraphExtensionOptions): GraphExtensionHandle | null {
  const win = window.open('', '_blank', POPUP_FEATURES);
  if (!win) return null;
  win.document.open();
  win.document.write(opts.html);
  win.document.close();

  const nonce = makeNonce();
  let established = false;

  const sendProjection = (t: 'welcome' | 'projection'): void => {
    const container = opts.getContainer();
    if (!container) return;
    const projection = buildGraphProjection(container);
    try {
      win.postMessage({ pkc: PKC_GRAPH, v: PKC_GRAPH_V, t, nonce, projection }, safeTargetOrigin());
    } catch {
      /* window closed mid-send */
    }
  };

  const onMessage = (ev: MessageEvent): void => {
    // Security gate: only the window we opened, only same-origin.
    if (ev.source !== win) return;
    if (ev.origin !== window.location.origin) return;
    const d = ev.data as { pkc?: unknown; v?: unknown; t?: unknown; nonce?: unknown; lid?: unknown } | null;
    if (!d || d.pkc !== PKC_GRAPH || d.v !== PKC_GRAPH_V) return;
    if (d.t === 'hello') {
      established = true;
      sendProjection('welcome');
    } else if (d.t === 'select' && d.nonce === nonce && typeof d.lid === 'string') {
      opts.onSelect?.(d.lid);
    }
  };
  window.addEventListener('message', onMessage);

  const timer = window.setInterval(() => {
    if (win.closed) cleanup();
  }, 1000);

  function cleanup(): void {
    window.removeEventListener('message', onMessage);
    window.clearInterval(timer);
  }

  return {
    pushUpdate: () => { if (established) sendProjection('projection'); },
    close: () => { try { win.close(); } catch { /* noop */ } cleanup(); },
  };
}
