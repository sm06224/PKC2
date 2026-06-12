/**
 * PKC-Extension host orchestrator(host-push 体系、#806 一括実装 5/6)。
 *
 * channel(3/6)/ projection(2/6)/ bindings + deliver(4/6)を束ね、
 * 「拡張を開く」「実体を送る」を提供する。送付導線 UI(右クリック)と graph
 * 移行はこれを呼ぶ(本 PR では orchestrator + 単体テストまで)。
 *
 *   - openExtension(extLid): 拡張 HTML を asset から解決して channel 起動、
 *     container 変化で projection を push
 *   - sendToExtension(extLid, entryLid): 開いてなければ開き、deliver payload
 *     を組んで push(= 送付ジェスチャの実体)
 *   - onWrite(T2): 本 PR では既定拒否。検証付き書き戻しの op 語彙は 6/6
 *
 * channel 起動関数は注入可能(テストは fake を渡す)。
 */

import type { Dispatcher } from '../state/dispatcher';
import { buildContainerProjection } from '@features/extension-host/projection';
import { buildDeliverPayload } from '@features/extension-host/deliver';
import {
  launchExtensionChannel,
  type ExtensionChannelHandle,
  type LaunchExtensionOptions,
  type ExtWriteRequest,
} from '../transport/extension-channel';
import { parseAttachmentBody, decodeAttachmentText } from './attachment-presenter';

export type LaunchFn = (opts: LaunchExtensionOptions) => ExtensionChannelHandle | null;

export interface ExtensionHost {
  /** 拡張を開く(既に開いていれば既存 handle)。失敗時 null。 */
  openExtension: (extLid: string) => ExtensionChannelHandle | null;
  /** 実体 1 件を拡張へ送る(必要なら起動)。送れたら true。 */
  sendToExtension: (extLid: string, entryLid: string) => boolean;
  /** 開いている拡張 lid 一覧。 */
  openLids: () => string[];
  /** 全 channel を閉じる。 */
  closeAll: () => void;
}

/**
 * asset 由来の拡張 HTML を解決する。`pkc_extension` 印のある attachment の
 * body から HTML を取り出す。非拡張 / 解決不能なら null。
 */
function resolveExtensionHtml(dispatcher: Dispatcher, extLid: string): string | null {
  const container = dispatcher.getState().container;
  if (!container) return null;
  const entry = container.entries.find((e) => e.lid === extLid);
  if (!entry || entry.archetype !== 'attachment') return null;
  const att = parseAttachmentBody(entry.body);
  if (!att.pkc_extension) return null;
  return decodeAttachmentText(att, container.assets) || null;
}

export function createExtensionHost(
  dispatcher: Dispatcher,
  launch: LaunchFn = launchExtensionChannel,
): ExtensionHost {
  const handles = new Map<string, ExtensionChannelHandle>();
  const unsubs = new Map<string, () => void>();

  function openExtension(extLid: string): ExtensionChannelHandle | null {
    const existing = handles.get(extLid);
    if (existing) return existing;
    const html = resolveExtensionHtml(dispatcher, extLid);
    if (!html) return null;

    const handle = launch({
      html,
      getProjection: () => {
        const c = dispatcher.getState().container;
        return c ? buildContainerProjection(c) : null;
      },
      // T2 書き戻しは 6/6 で検証付き配線。本 PR は既定拒否(安全側)。
      onWrite: (_req: ExtWriteRequest) => false,
      onHint: (hint) => {
        // ext からの軽量ヒント(pull ではない)。entry を開くだけ許す。
        if (hint.kind === 'open' && hint.lid) {
          dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: hint.lid, revealInSidebar: true });
        }
      },
    });
    if (!handle) return null;
    handles.set(extLid, handle);

    // container 変化で projection を push(参照比較で無駄打ち抑制)。
    let lastContainer = dispatcher.getState().container;
    const off = dispatcher.onState((s) => {
      if (s.container !== lastContainer) {
        lastContainer = s.container;
        handle.pushProjection();
      }
    });
    unsubs.set(extLid, off);
    return handle;
  }

  function sendToExtension(extLid: string, entryLid: string): boolean {
    const handle = openExtension(extLid);
    if (!handle) return false;
    const container = dispatcher.getState().container;
    if (!container) return false;
    const payload = buildDeliverPayload(container, entryLid);
    if (!payload) return false;
    handle.deliver(payload);
    return true;
  }

  function closeOne(extLid: string): void {
    unsubs.get(extLid)?.();
    unsubs.delete(extLid);
    handles.get(extLid)?.close();
    handles.delete(extLid);
  }

  return {
    openExtension,
    sendToExtension,
    openLids: () => [...handles.keys()],
    closeAll: () => {
      for (const lid of [...handles.keys()]) closeOne(lid);
    },
  };
}
