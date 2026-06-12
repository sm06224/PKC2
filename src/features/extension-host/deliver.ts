/**
 * Deliver payload の組み立て(host-push 体系、#806 設計 doc rev.2 §3.2 —
 * 一括実装 4/6)。
 *
 * `pkc:deliver` で拡張へ渡す実体 1 件を container + lid から組む。**ここは
 * projection と違い、ユーザーが send ジェスチャで選んだ 1 件の実体(body /
 * asset base64)を意図的に含める**唯一の場所。送付ジェスチャ自体が同意な
 * ので、本関数は「何を含めるか」だけを純粋に決める(同意判定は呼び出し側
 * の UI 導線)。
 *
 * Pure: no browser APIs(features 層、core のみ)。
 */

import type { Container } from '@core/model/container';
import { peekAttachmentMeta } from './projection';

/** `pkc:deliver` payload(channel 側 `ExtDeliverPayload` の features 正本)。 */
export interface DeliverPayload {
  kind: 'asset' | 'entry';
  lid?: string;
  asset_key?: string;
  mime?: string;
  filename?: string;
  /** kind==='entry' の本文。 */
  body?: string;
  /** kind==='asset' の base64。 */
  data_base64?: string;
  correlation_id?: string;
}

/**
 * entry lid から deliver payload を組む。
 *
 *   - attachment かつ asset_key が container.assets に存在 → `kind:'asset'`
 *     (asset_key / mime / filename / data_base64)
 *   - それ以外(text / textlog / todo / 参照切れ attachment 等)→
 *     `kind:'entry'`(lid / body)
 *
 * lid 不在 / system archetype は `null`(呼び出し側は no-op)。
 */
export function buildDeliverPayload(
  container: Container,
  lid: string,
  correlation_id?: string,
): DeliverPayload | null {
  const entry = container.entries.find((e) => e.lid === lid);
  if (!entry) return null;

  if (entry.archetype === 'attachment') {
    const meta = peekAttachmentMeta(entry.body);
    if (meta.asset_key) {
      const data = container.assets[meta.asset_key];
      if (typeof data === 'string') {
        return {
          kind: 'asset',
          lid,
          asset_key: meta.asset_key,
          ...(meta.mime ? { mime: meta.mime } : {}),
          ...(meta.name ? { filename: meta.name } : {}),
          data_base64: data,
          ...(correlation_id ? { correlation_id } : {}),
        };
      }
    }
    // asset_key が無い / 参照切れ → entry(attachment の JSON body)として渡す。
  }

  return {
    kind: 'entry',
    lid,
    body: entry.body,
    ...(correlation_id ? { correlation_id } : {}),
  };
}
