/**
 * PKC-Extension host orchestrator(host-push 体系、#806 一括実装 5/6 +
 * #796 封じ込め)。
 *
 * channel / projection / bindings + deliver を束ね、「拡張を開く」「実体を
 * 送る」を提供する。送付導線 UI(右クリック)・launcher tile・autostart の
 * **全起動経路がここを通る**(bespoke graph channel は廃止、直接切替)。
 *
 *   - openExtension(extLid): 拡張 HTML + manifest を asset から解決して
 *     channel 起動(既定 Tier S sandbox)。container 変化で projection、
 *     選択変化で selected を push
 *   - sendToExtension(extLid, entryLid): 開いてなければ開き、deliver payload
 *     を組んで push(= 送付ジェスチャの実体)
 *   - onWrite(T2): 検証付き書き戻し(G2)
 *   - hint: open(選択 + sidebar reveal + host 前面化)/ select(選択のみ)
 *
 * channel 起動関数は注入可能(テストは fake を渡す)。
 */

import type { Dispatcher } from '../state/dispatcher';
import { buildContainerProjection } from '@features/extension-host/projection';
import { buildDeliverPayload } from '@features/extension-host/deliver';
import { validateWriteOps, type WriteOp } from '@features/extension-host/write';
import {
  launchExtensionChannel,
  type ExtensionChannelHandle,
  type LaunchExtensionOptions,
  type ExtensionManifest,
  type ExtWriteRequest,
} from '../transport/extension-channel';
import { parseAttachmentBody, decodeAttachmentText } from './attachment-presenter';
import { getAncestorFolderLids } from '@features/relation/tree';

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
 * asset 由来の拡張 HTML + 封じ込め manifest を解決する。`pkc_extension` 印の
 * ある attachment の body から取り出す。非拡張 / 解決不能なら null。
 */
function resolveExtension(
  dispatcher: Dispatcher,
  extLid: string,
): { html: string; manifest?: ExtensionManifest } | null {
  const container = dispatcher.getState().container;
  if (!container) return null;
  const entry = container.entries.find((e) => e.lid === extLid);
  if (!entry || entry.archetype !== 'attachment') return null;
  const att = parseAttachmentBody(entry.body);
  if (!att.pkc_extension) return null;
  const html = decodeAttachmentText(att, container.assets);
  if (!html) return null;
  return { html, manifest: att.extension_manifest };
}

/**
 * entry を folder へ移動する(dispatch + 永続化の通常経路:旧 structural
 * relation を DELETE、新を CREATE)。全入力を検証し、不正要求は安全な
 * no-op — 拡張発の編集が container を壊せないようにする。
 */
export function moveEntryToFolder(dispatcher: Dispatcher, lid: string, folderLid: string): void {
  const container = dispatcher.getState().container;
  if (!container || dispatcher.getState().readonly) return;
  const entry = container.entries.find((e) => e.lid === lid);
  const folder = container.entries.find((e) => e.lid === folderLid);
  if (!entry || !folder || folder.archetype !== 'folder' || lid === folderLid) return;
  // Cycle guard: cannot move a folder into its own descendant.
  if (entry.archetype === 'folder') {
    const ancestors = getAncestorFolderLids(container.relations, container.entries, folderLid);
    if (ancestors.includes(lid)) return;
  }
  // Already in that folder → no-op.
  const cur = container.relations.find((r) => r.kind === 'structural' && r.to === lid);
  if (cur && cur.from === folderLid) return;
  for (const r of container.relations) {
    if (r.kind === 'structural' && r.to === lid) dispatcher.dispatch({ type: 'DELETE_RELATION', id: r.id });
  }
  dispatcher.dispatch({ type: 'CREATE_RELATION', from: folderLid, to: lid, kind: 'structural' });
}

/** entry 間に semantic relation を張る(検証済み、永続化)。 */
export function relateEntries(dispatcher: Dispatcher, from: string, to: string): void {
  const container = dispatcher.getState().container;
  if (!container || dispatcher.getState().readonly) return;
  if (from === to) return;
  const hasFrom = container.entries.some((e) => e.lid === from);
  const hasTo = container.entries.some((e) => e.lid === to);
  if (!hasFrom || !hasTo) return;
  // Skip if an identical relation already exists.
  if (container.relations.some((r) => r.from === from && r.to === to && r.kind === 'semantic')) return;
  dispatcher.dispatch({ type: 'CREATE_RELATION', from, to, kind: 'semantic' });
}

/**
 * T2 書き戻しを検証して適用する(#806 6/6、G2)。readonly / light-source /
 * 検証 NG は適用せず false。各 op は既存 data-safe 経路:
 *   - update-body → QUICK_UPDATE_ENTRY(body のみ、phase 遷移なし)
 *   - move        → moveEntryToFolder(cycle guard 含む)
 *   - relate      → relateEntries
 * 検証は all-or-nothing。1 件でも NG なら全体を拒否(部分適用しない)。
 */
function applyWrite(dispatcher: Dispatcher, req: ExtWriteRequest): boolean {
  const state = dispatcher.getState();
  if (state.readonly || state.lightSource || state.viewOnlySource) return false;
  const container = state.container;
  if (!container) return false;
  const validation = validateWriteOps(container, req.ops);
  if (!validation.ok) return false;
  for (const op of validation.ops as WriteOp[]) {
    if (op.op === 'update-body') {
      dispatcher.dispatch({ type: 'QUICK_UPDATE_ENTRY', lid: op.lid, body: op.body });
    } else if (op.op === 'move') {
      moveEntryToFolder(dispatcher, op.lid, op.folderLid);
    } else if (op.op === 'relate') {
      relateEntries(dispatcher, op.from, op.to);
    }
  }
  return true;
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
    const resolved = resolveExtension(dispatcher, extLid);
    if (!resolved) return null;

    const handle = launch({
      html: resolved.html,
      manifest: resolved.manifest,
      getProjection: () => {
        const c = dispatcher.getState().container;
        return c ? buildContainerProjection(c) : null;
      },
      // T2 書き戻し(#806 G2): host が op を検証してから既存 data-safe
      // 経路で適用する。readonly / 検証 NG は false。
      onWrite: (req: ExtWriteRequest) => applyWrite(dispatcher, req),
      onHint: (hint) => {
        // ext からの軽量ヒント(pull ではない)。選択系のみ許す。
        if (!hint.lid) return;
        if (hint.kind === 'open') {
          // graph の double-click 相当: 開いて host を前面化する。
          dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: hint.lid, revealInSidebar: true });
          try { window.focus(); } catch { /* noop */ }
        } else if (hint.kind === 'select') {
          // graph の single-click 相当: 選択のみ(前面化しない)。
          dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: hint.lid });
        }
      },
    });
    if (!handle) return null;
    handles.set(extLid, handle);

    // container 変化で projection、選択変化で selected を push(参照 /
    // 値比較で無駄打ち抑制)。
    let lastContainer = dispatcher.getState().container;
    let lastSelected = dispatcher.getState().selectedLid;
    const off = dispatcher.onState((s) => {
      if (s.container !== lastContainer) {
        lastContainer = s.container;
        handle.pushProjection();
      }
      if (s.selectedLid !== lastSelected) {
        lastSelected = s.selectedLid;
        if (s.selectedLid) handle.notifySelected(s.selectedLid);
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

// dispatcher ごとの共有 host。autostart(main)・launcher tile・右クリック
// 送付(action-binder)が**同じ host** を使うことで、同一拡張の二重起動を
// 防ぐ(openExtension の既存 handle 再利用が効く)。
const sharedHosts = new WeakMap<Dispatcher, ExtensionHost>();

/** dispatcher に紐づく共有 ExtensionHost(無ければ生成)。 */
export function getSharedExtensionHost(dispatcher: Dispatcher): ExtensionHost {
  let host = sharedHosts.get(dispatcher);
  if (!host) {
    host = createExtensionHost(dispatcher);
    sharedHosts.set(dispatcher, host);
  }
  return host;
}
