/**
 * JSON-RPC 2.0 envelope validation & response builders for PKC-Message v2
 * (PR-V15、2026-05-14、A3 minimum)。
 *
 * v2 では JSON-RPC 2.0 形式に全面移行。本 module は wire 上の data を
 * `MessageEnvelopeV2` union に narrow + handler 結果から response envelope を
 * build する pure helper。
 *
 * v1 envelope と並列稼働するため、`isV2Envelope(data)` で discriminate に使う
 * (`jsonrpc: '2.0'` field の有無で判定)。
 */

import type {
  MessageEnvelopeV2,
  MessageRequestV2,
  MessageNotificationV2,
  MessageResponseSuccessV2,
  MessageResponseErrorV2,
  JsonRpcError,
} from '../../core/model/message-v2';
import { JSON_RPC_ERROR_CODES } from '../../core/model/message-v2';

/** v2 envelope discriminant(message-bridge が v1/v2 を切り分けるため)。 */
export function isV2Envelope(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  return obj.jsonrpc === '2.0';
}

export type V2ValidationResult =
  | { valid: true; envelope: MessageEnvelopeV2; form: 'request' | 'notification' | 'response-success' | 'response-error' }
  | { valid: false; error: JsonRpcError };

/**
 * v2 envelope を validate + form discriminate。
 *
 * 判定規則:
 *   - `id` + `method` + (`params`? )= request
 *   - `method` のみ(`id` 無し)= notification
 *   - `id` + `result` = response (success)
 *   - `id` + `error` = response (error)
 */
export function validateEnvelopeV2(data: unknown): V2ValidationResult {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: { code: JSON_RPC_ERROR_CODES.INVALID_REQUEST, message: 'envelope is not an object' } };
  }
  const obj = data as Record<string, unknown>;
  if (obj.jsonrpc !== '2.0') {
    return { valid: false, error: { code: JSON_RPC_ERROR_CODES.INVALID_REQUEST, message: 'jsonrpc field must be "2.0"' } };
  }
  const hasMethod = typeof obj.method === 'string';
  const hasId = 'id' in obj && (typeof obj.id === 'string' || typeof obj.id === 'number' || obj.id === null);
  const hasResult = 'result' in obj;
  const hasError = 'error' in obj;

  if (hasMethod && hasId) {
    return { valid: true, envelope: obj as unknown as MessageRequestV2, form: 'request' };
  }
  if (hasMethod && !hasId) {
    return { valid: true, envelope: obj as unknown as MessageNotificationV2, form: 'notification' };
  }
  if (hasResult && hasId) {
    return { valid: true, envelope: obj as unknown as MessageResponseSuccessV2, form: 'response-success' };
  }
  if (hasError && hasId) {
    return { valid: true, envelope: obj as unknown as MessageResponseErrorV2, form: 'response-error' };
  }
  return {
    valid: false,
    error: {
      code: JSON_RPC_ERROR_CODES.INVALID_REQUEST,
      message: 'envelope shape does not match request / notification / response',
    },
  };
}

/** Success response builder。 */
export function buildResponseSuccess(
  id: string | number,
  result: unknown,
): MessageResponseSuccessV2 {
  return { jsonrpc: '2.0', id, result };
}

/** Error response builder。 */
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

/** Notification builder(送信側用)。 */
export function buildNotification(method: string, params?: unknown): MessageNotificationV2 {
  if (params === undefined) return { jsonrpc: '2.0', method };
  return { jsonrpc: '2.0', method, params };
}

/** Request builder(送信側用、id は呼び出し側が指定)。 */
export function buildRequest(
  method: string,
  id: string | number,
  params?: unknown,
): MessageRequestV2 {
  if (params === undefined) return { jsonrpc: '2.0', method, id };
  return { jsonrpc: '2.0', method, id, params };
}
