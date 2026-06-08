/**
 * `window.PKC.pasteAttachment(payload)` を child window(entry-window 等)から
 * 呼べる API として公開。
 *
 * user bug 報告 2026-05-28:
 *   「マルチウィンドウ時にスクショ貼付がメインウィンドウと同じようにアセット
 *    埋め込みにならないバグありです」
 *
 * 原因:entry-window は独立 document、main window の `addEventListener('paste', ...)`
 * は到達しない。child window 側で paste を catch しても dispatcher にアクセスできない。
 *
 * 解決:child は `window.opener.PKC.pasteAttachment(payload)` を呼んで parent の
 * dispatcher に PASTE_ATTACHMENT を投げる。parent dispatcher → reducer → asset 保存
 * → 既存 asset render path で inline 描画。
 *
 * 同期的に dispatch するので呼出側はそのまま `![name](asset:KEY)` を textarea に
 * 挿入できる(reducer 内で container.assets が同 tick で更新される、ただし parent
 * の re-render は次 frame に follow)。
 */

import type { Dispatcher } from '../state/dispatcher';

export interface PastePayload {
  /** asset の filename。 */
  name: string;
  /** MIME type(image/png 等)。 */
  mime: string;
  /** asset の byte size。 */
  size: number;
  /** container.assets の key(unique generated)。 */
  assetKey: string;
  /** base64 encoded asset 本体。 */
  assetData: string;
  /** asset 配置先 entry の lid。 */
  contextLid: string;
  /** image-optimize meta(optional、main window 経路で attach されている場合のみ)。 */
  optimizationMeta?: unknown;
  /** original asset data(image-optimize 前、optional)。 */
  originalAssetData?: string;
}

/**
 * `window.PKC.pasteAttachment(payload)` を namespace に設置する。
 * main.ts の boot path で 1 回だけ呼ばれる。idempotent。
 *
 * 戻り値の関数は同期的に dispatcher を呼ぶ。child window 側は呼び終わったら
 * すぐ markdown ref を textarea に挿入できる。
 */
export function exposePasteApi(dispatcher: Dispatcher): void {
  if (typeof window === 'undefined') return;
  const w = window as unknown as {
    PKC?: { pasteAttachment?: (payload: PastePayload) => void };
  };
  if (!w.PKC) {
    w.PKC = {};
  }
  if (!w.PKC.pasteAttachment) {
    w.PKC.pasteAttachment = (payload: PastePayload): void => {
      const action: Record<string, unknown> = {
        type: 'PASTE_ATTACHMENT',
        name: payload.name,
        mime: payload.mime,
        size: payload.size,
        assetKey: payload.assetKey,
        assetData: payload.assetData,
        contextLid: payload.contextLid,
      };
      if (payload.originalAssetData !== undefined) {
        action.originalAssetData = payload.originalAssetData;
      }
      if (payload.optimizationMeta !== undefined) {
        action.optimizationMeta = payload.optimizationMeta;
      }
      (dispatcher.dispatch as (a: unknown) => void)(action);
    };
  }
}
