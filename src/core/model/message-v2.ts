/**
 * MessageEnvelopeV2: JSON-RPC 2.0 ベースの PKC-Message protocol v2
 * (PR-V15、2026-05-14、A3 minimum)。
 *
 * v1(`message.ts`)は独自 7-fields 平坦 envelope を採用していたが、prior-art
 * survey(`docs/development/pkc-message-v2-prior-art-and-plan-2026-04-26.md`)
 * の結論で MCP / LSP / DAP / graphql-ws / tRPC 等が一様に JSON-RPC 2.0 に収束
 * していることが判明。v2 は wire 上 JSON-RPC 2.0 に全面移行し、独自 envelope は
 * v1 互換用 fallback に降格させる。
 *
 * v2 minimum(本 PR スコープ):
 *   - JSON-RPC 2.0 envelope 型(request / response / notification 3 形態)
 *   - `pkc.heartbeat` method(sender が生存確認、receiver が server_time +
 *     container_id を返す)
 *   - 既存 v1 envelope と並列稼働(`jsonrpc: '2.0'` の有無で discriminate)
 *
 * v2.x で順次 borrow:
 *   - `initialize` handshake(capability 交換)
 *   - per-method ACL
 *   - `pkc.ast.parseMarkdown` / `renderHtml` / `parseHtml` 等 IR dispatch method
 *   - subscription registry(`pkc.subscribe` / `notification`)
 *   - Elicitation(receiver → sender request、reverse RPC)
 *
 * 上位 spec:`docs/spec/pkc-message-api-v1.md`(現行 v1)+ v2 spec は本 PR
 * では別 doc 化せず本 file ヘッダで暫定固定。
 */

/** JSON-RPC 2.0 base envelope fields(全 form 共通)。 */
interface JsonRpcEnvelopeBase {
  /** Fixed discriminant. */
  jsonrpc: '2.0';
}

/** Request:method 呼び出し + id 付き(response 期待)。 */
export interface MessageRequestV2 extends JsonRpcEnvelopeBase {
  /** Method 名(`'pkc.heartbeat'` / `'pkc.ast.parseMarkdown'` 等の dotted path)。 */
  method: string;
  /** Method 固有 parameters。spec で型固定。 */
  params?: unknown;
  /**
   * Correlation id(string / number、null は v2 では非推奨)。response の
   * `id` 値で対応付け。
   */
  id: string | number;
}

/** Notification:id を持たない一方向 message(response 不要)。 */
export interface MessageNotificationV2 extends JsonRpcEnvelopeBase {
  method: string;
  params?: unknown;
  /** Notification は `id` を持たないことで request と discriminate。 */
}

/** Response(success):method 実行成功。 */
export interface MessageResponseSuccessV2 extends JsonRpcEnvelopeBase {
  /** request の id を echo。 */
  id: string | number;
  /** method の戻り値。 */
  result: unknown;
}

/** Response(error):method 実行失敗。 */
export interface MessageResponseErrorV2 extends JsonRpcEnvelopeBase {
  id: string | number | null;
  error: JsonRpcError;
}

export interface JsonRpcError {
  /** JSON-RPC 2.0 標準 error code(-32700 / -32600 / -32601 / -32602 / -32603 + 独自 -32000 〜 -32099)。 */
  code: number;
  /** Error 簡潔 description(英語、user-facing は別途 localization)。 */
  message: string;
  /** Optional 詳細 data(stack trace / context 等)。 */
  data?: unknown;
}

/** v2 envelope union — v2 受信側で discriminate に使う。 */
export type MessageEnvelopeV2 =
  | MessageRequestV2
  | MessageNotificationV2
  | MessageResponseSuccessV2
  | MessageResponseErrorV2;

/**
 * 標準 JSON-RPC 2.0 error code(spec §5.1)。
 *
 * - -32700 Parse error    JSON parse 失敗
 * - -32600 Invalid Request envelope shape 不正
 * - -32601 Method not found 未知 method
 * - -32602 Invalid params  params 形が違う
 * - -32603 Internal error  handler 内部 throw
 * - -32000..-32099         実装独自 range(`pkc.heartbeat` の特殊 error 等)
 */
export const JSON_RPC_ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

// ── Method-specific payload types ────────────────────────

/** `pkc.heartbeat` request の params(空 object 推奨)。 */
export interface HeartbeatParams {
  /** Sender 側 sequence(receiver は echo するだけ、optional)。 */
  seq?: number;
}

/** `pkc.heartbeat` response の result。 */
export interface HeartbeatResult {
  /** Receiver の container_id。 */
  container_id: string;
  /** Receiver の current ISO 8601 timestamp。 */
  server_time: string;
  /** Request 側 `seq` を echo(送られていれば)。 */
  seq?: number;
  /** Protocol version 文字列(`'2.0.0'` 等)。 */
  pkc_version: string;
}
