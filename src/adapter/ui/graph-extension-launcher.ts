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
 * Open the graph extension in a same-origin iframe overlay and wire the
 * secure channel. Returns null if a host window is unavailable.
 */
export function launchGraphExtension(opts: LaunchGraphExtensionOptions): GraphExtensionHandle | null {
  const overlay = document.createElement('div');
  overlay.setAttribute('data-pkc-region', 'extension-overlay');
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,0.4);display:flex;flex-direction:column;';

  const bar = document.createElement('div');
  bar.style.cssText = 'flex:0 0 auto;display:flex;justify-content:flex-end;padding:4px;background:#000;';
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕ 閉じる';
  closeBtn.setAttribute('data-pkc-action', 'close-extension-overlay');
  bar.appendChild(closeBtn);

  const iframe = document.createElement('iframe');
  iframe.setAttribute('data-pkc-region', 'extension-frame');
  iframe.style.cssText = 'flex:1 1 auto;border:0;width:100%;background:#0d0f0a;';

  overlay.appendChild(bar);
  overlay.appendChild(iframe);
  document.body.appendChild(overlay);

  // Write the extension HTML into the (about:blank, same-origin) iframe.
  const doc = iframe.contentWindow?.document;
  if (!doc || !iframe.contentWindow) {
    overlay.remove();
    return null;
  }
  doc.open();
  doc.write(opts.html);
  doc.close();
  const childWin = iframe.contentWindow;

  const nonce = makeNonce();
  let established = false;

  const sendProjection = (t: 'welcome' | 'projection'): void => {
    const container = opts.getContainer();
    if (!container) return;
    const projection = buildGraphProjection(container);
    try {
      childWin.postMessage({ pkc: PKC_GRAPH, v: PKC_GRAPH_V, t, nonce, projection }, safeTargetOrigin());
    } catch {
      /* frame torn down mid-send */
    }
  };

  const onMessage = (ev: MessageEvent): void => {
    // Security gate: only our iframe's window, only same-origin.
    if (ev.source !== childWin) return;
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

  function cleanup(): void {
    window.removeEventListener('message', onMessage);
    overlay.remove();
  }
  closeBtn.addEventListener('click', cleanup);

  return {
    pushUpdate: () => { if (established) sendProjection('projection'); },
    close: cleanup,
  };
}
