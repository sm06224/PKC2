/**
 * PKC-Message v2 — JSON-RPC 2.0 over postMessage.
 *
 * Vendored faithfully from the host PKC2 (`src/core/model/message-v2.ts` +
 * `src/adapter/transport/envelope-v2.ts`) so the extension speaks the real
 * protocol rather than an ad-hoc message shape. Kept dependency-free.
 *
 * The extension uses these methods over the channel to its host PKC2:
 *   - `pkc.container.snapshot`  (ext → host, request)  → result `{ container }`
 *   - `pkc.container.changed`   (host → ext, notification) params `{ container }`
 *   - `pkc.graph.nodeSelected`  (ext → host, notification) params `{ lid }`
 */

export interface MessageRequestV2 {
  jsonrpc: '2.0';
  method: string;
  id: string | number;
  params?: unknown;
}
export interface MessageNotificationV2 {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}
export interface MessageResponseSuccessV2 {
  jsonrpc: '2.0';
  id: string | number;
  result: unknown;
}
export interface MessageResponseErrorV2 {
  jsonrpc: '2.0';
  id: string | number | null;
  error: JsonRpcError;
}
export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}
export type MessageEnvelopeV2 =
  | MessageRequestV2
  | MessageNotificationV2
  | MessageResponseSuccessV2
  | MessageResponseErrorV2;

export const JSON_RPC_ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

/** `jsonrpc: '2.0'` discriminant — separates PKC-Message v2 from other traffic. */
export function isV2Envelope(data: unknown): data is MessageEnvelopeV2 {
  return !!data && typeof data === 'object' && (data as Record<string, unknown>).jsonrpc === '2.0';
}

export type V2Form = 'request' | 'notification' | 'response-success' | 'response-error';

export interface V2ValidationResult {
  valid: boolean;
  form?: V2Form;
}

/** Discriminate a v2 envelope's form (request / notification / response). */
export function validateEnvelopeV2(data: unknown): V2ValidationResult {
  if (!isV2Envelope(data)) return { valid: false };
  const obj = data as unknown as Record<string, unknown>;
  const hasMethod = typeof obj.method === 'string';
  const hasId = 'id' in obj && (typeof obj.id === 'string' || typeof obj.id === 'number' || obj.id === null);
  const hasResult = 'result' in obj;
  const hasError = 'error' in obj;
  if (hasMethod && hasId) return { valid: true, form: 'request' };
  if (hasMethod && !hasId) return { valid: true, form: 'notification' };
  if (hasResult && hasId) return { valid: true, form: 'response-success' };
  if (hasError && hasId) return { valid: true, form: 'response-error' };
  return { valid: false };
}

export function buildRequest(method: string, id: string | number, params?: unknown): MessageRequestV2 {
  return params === undefined ? { jsonrpc: '2.0', method, id } : { jsonrpc: '2.0', method, id, params };
}
export function buildNotification(method: string, params?: unknown): MessageNotificationV2 {
  return params === undefined ? { jsonrpc: '2.0', method } : { jsonrpc: '2.0', method, params };
}
export function buildResponseSuccess(id: string | number, result: unknown): MessageResponseSuccessV2 {
  return { jsonrpc: '2.0', id, result };
}
export function buildResponseError(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown,
): MessageResponseErrorV2 {
  const error: JsonRpcError = { code, message };
  if (data !== undefined) error.data = data;
  return { jsonrpc: '2.0', id, error };
}

/** Extension-side method names. */
export const METHOD = {
  CONTAINER_SNAPSHOT: 'pkc.container.snapshot',
  CONTAINER_CHANGED: 'pkc.container.changed',
  GRAPH_NODE_SELECTED: 'pkc.graph.nodeSelected',
} as const;

/**
 * Minimal PKC-Message v2 client over `postMessage` to a peer window
 * (the host PKC2, typically `window.parent`). Correlates requests by id
 * and surfaces inbound notifications.
 */
export class PkcMessageClient {
  private seq = 0;
  private pending = new Map<string | number, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>();
  private notificationHandlers = new Map<string, (params: unknown) => void>();

  constructor(
    private readonly peer: Window,
    private readonly targetOrigin: string = '*',
  ) {
    window.addEventListener('message', (ev: MessageEvent) => this.onMessage(ev));
  }

  /** Register a handler for an inbound notification method. */
  onNotification(method: string, handler: (params: unknown) => void): void {
    this.notificationHandlers.set(method, handler);
  }

  /** Send a request and resolve with its result (rejects on error / timeout). */
  request<T = unknown>(method: string, params?: unknown, timeoutMs = 4000): Promise<T> {
    this.seq += 1;
    const id = `ext-${this.seq}`;
    const env = buildRequest(method, id, params);
    return new Promise<T>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`PKC-Message request timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => { window.clearTimeout(timer); resolve(v as T); },
        reject: (e) => { window.clearTimeout(timer); reject(e); },
      });
      this.peer.postMessage(env, this.targetOrigin);
    });
  }

  /** Fire-and-forget notification. */
  notify(method: string, params?: unknown): void {
    this.peer.postMessage(buildNotification(method, params), this.targetOrigin);
  }

  private onMessage(ev: MessageEvent): void {
    const data = ev.data;
    if (!isV2Envelope(data)) return;
    const v = validateEnvelopeV2(data);
    if (!v.valid) return;
    if (v.form === 'response-success') {
      const r = data as MessageResponseSuccessV2;
      this.pending.get(r.id)?.resolve(r.result);
      this.pending.delete(r.id);
    } else if (v.form === 'response-error') {
      const r = data as MessageResponseErrorV2;
      if (r.id !== null) {
        this.pending.get(r.id)?.reject(new Error(r.error.message));
        this.pending.delete(r.id);
      }
    } else if (v.form === 'notification') {
      const n = data as MessageNotificationV2;
      this.notificationHandlers.get(n.method)?.(n.params);
    }
  }
}
