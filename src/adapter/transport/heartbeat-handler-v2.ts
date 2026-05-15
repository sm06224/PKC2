/**
 * `pkc.heartbeat` method handler for PKC-Message v2(PR-V15、2026-05-14)。
 *
 * Spec:`docs/development/pkc-message-v2-prior-art-and-plan-2026-04-26.md`
 *   §4.1 (a) JSON-RPC 2.0 envelope + heartbeat method
 *
 * Behavior:
 *   - request `method: 'pkc.heartbeat'` を受けたら server_time + container_id
 *     + pkc_version + seq(request 側 echo)を含む result を返す
 *   - params が無くても OK(空 object 同等)
 *   - notification 形(id 無し)で来た場合は response を返さず無視(spec 通り)
 *
 * Container_id / pkc_version は handler 構築時に bind。bridge から見ると
 * `(req) => result` の同期 closure。
 */

import type { MessageRequestV2, HeartbeatResult } from '../../core/model/message-v2';

export interface HeartbeatHandlerOptions {
  /** Receiver の container_id(response に echo)。 */
  containerId: string;
  /**
   * Protocol version(`'2.0.0'` 等)。本 PR 着地時の defaults を export 経由で
   * 上書きできるよう、optional に。
   */
  pkcVersion?: string;
  /**
   * Clock injection point(test 用 deterministic timestamp)。default = Date.
   */
  now?: () => Date;
}

const DEFAULT_VERSION = '2.0.0-minimum';

/**
 * Heartbeat handler を生成。`(request) => HeartbeatResult` を返す pure closure。
 */
export function createHeartbeatHandler(
  opts: HeartbeatHandlerOptions,
): (request: MessageRequestV2) => HeartbeatResult {
  const containerId = opts.containerId;
  const pkcVersion = opts.pkcVersion ?? DEFAULT_VERSION;
  const now = opts.now ?? (() => new Date());
  return (request: MessageRequestV2): HeartbeatResult => {
    const params = (request.params ?? {}) as { seq?: number };
    const result: HeartbeatResult = {
      container_id: containerId,
      server_time: now().toISOString(),
      pkc_version: pkcVersion,
    };
    if (typeof params.seq === 'number') result.seq = params.seq;
    return result;
  };
}
