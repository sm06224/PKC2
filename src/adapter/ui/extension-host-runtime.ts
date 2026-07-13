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
  type ExtStructurePlanRequest,
} from '../transport/extension-channel';
import { exportStructureText } from '@features/structure/structure-dsl';
import { openStructurePlanModal, isStructurePlanModalOpen } from './structure-plan-modal';
import { parseAttachmentBody, decodeAttachmentText } from './attachment-presenter';
import { getAncestorFolderLids } from '@features/relation/tree';
import { parseTodoBody, serializeTodoBody } from '@features/todo/todo-body';
import { getRestoreCandidates } from '@core/operations/container-ops';
import { validateOfferPayload, buildPendingOffer } from '../transport/record-offer-handler';

export type LaunchFn = (opts: LaunchExtensionOptions) => ExtensionChannelHandle | null;

export interface ExtensionHost {
  /**
   * 拡張を開く(既に開いていれば既存 handle)。失敗時 null。trusted 宣言の
   * 拡張は明示同意ダイアログ(#796 PR-4)が先に出るため null を返す —
   * 起動は同意ボタンの click(user gesture)から行われる。
   */
  openExtension: (extLid: string) => ExtensionChannelHandle | null;
  /**
   * 実体 1 件を拡張へ送る(必要なら起動)。送れたら true。trusted の
   * 同意待ち中は送付が積まれ、同意後に flush される(この場合も true)。
   */
  sendToExtension: (extLid: string, entryLid: string) => boolean;
  /**
   * 構成 export text(DSL 語彙説明つき)を拡張へ送る(改善バッチ⑤、
   * 必要なら起動)。送れたら true。deliver と同格の**明示ジェスチャ**で、
   * projection と違い自動 push はしない。
   */
  sendStructureToExtension: (extLid: string) => boolean;
  /** trusted 同意ダイアログ表示中か(autostart の retry prompt 抑制用)。 */
  hasPendingConsent: (extLid: string) => boolean;
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

/**
 * entry を folder から外して未整理(root)へ戻す(#830 R7、検証済み・永続化)。
 * `moveEntryToFolder` の「既存 structural relation を DELETE」部分のみを行い、
 * 新規 CREATE はしない(= どの folder にも属さない = root)。既に root の
 * entry は no-op。readonly は安全に no-op。
 */
export function unfileEntry(dispatcher: Dispatcher, lid: string): void {
  const container = dispatcher.getState().container;
  if (!container || dispatcher.getState().readonly) return;
  if (!container.entries.some((e) => e.lid === lid)) return;
  for (const r of container.relations) {
    if (r.kind === 'structural' && r.to === lid) dispatcher.dispatch({ type: 'DELETE_RELATION', id: r.id });
  }
}

/**
 * soft delete 済み entry を復元する(#830 R4、検証済み・永続化)。host が
 * 最新 revision を `getRestoreCandidates` で解決し、既存 RESTORE_ENTRY に
 * 流す(拡張は revision_id を知らなくてよい)。復元候補でなければ no-op。
 */
export function restoreDeleted(dispatcher: Dispatcher, lid: string): void {
  const container = dispatcher.getState().container;
  if (!container || dispatcher.getState().readonly) return;
  const rev = getRestoreCandidates(container).find((r) => r.entry_lid === lid);
  if (!rev) return;
  dispatcher.dispatch({ type: 'RESTORE_ENTRY', lid, revision_id: rev.id });
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
 * todo の status だけを差し替える(#830 R2、検証済み・永続化)。拡張は
 * body(description)を projection に持たないため、host が現 body を
 * parse → status swap → serialize して **description / date / archived を
 * 保全**する。readonly / 非 todo / 同値は安全な no-op。
 */
export function applyTodoStatus(
  dispatcher: Dispatcher,
  lid: string,
  status: 'open' | 'done',
): void {
  const container = dispatcher.getState().container;
  if (!container || dispatcher.getState().readonly) return;
  const entry = container.entries.find((e) => e.lid === lid);
  if (!entry || entry.archetype !== 'todo') return;
  const todo = parseTodoBody(entry.body);
  if (todo.status === status) return; // already in that state → no-op
  dispatcher.dispatch({ type: 'QUICK_UPDATE_ENTRY', lid, body: serializeTodoBody({ ...todo, status }) });
}

/**
 * T2 書き戻しを検証して適用する(#806 6/6、G2)。readonly / light-source /
 * 検証 NG は適用せず false。各 op は既存 data-safe 経路:
 *   - update-body     → QUICK_UPDATE_ENTRY(body のみ、phase 遷移なし)
 *   - move            → moveEntryToFolder(cycle guard 含む)
 *   - relate          → relateEntries
 *   - set-todo-status → applyTodoStatus(host が description を保全、#830 R2)
 *   - rename          → RENAME_ENTRY_TITLE(title のみ、#830 R3)
 *   - unfile          → unfileEntry(structural relation 除去、#830 R7)
 *   - delete          → DELETE_ENTRY(soft delete、#830 R4。entry の purge は非開放)
 *   - restore         → restoreDeleted(最新 revision を解決、#830 R4)
 *   - purge-orphan-assets → PURGE_ORPHAN_ASSETS(孤児アセット一括掃除、#830 R8)
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
    } else if (op.op === 'set-todo-status') {
      applyTodoStatus(dispatcher, op.lid, op.status);
    } else if (op.op === 'rename') {
      dispatcher.dispatch({ type: 'RENAME_ENTRY_TITLE', lid: op.lid, title: op.title });
    } else if (op.op === 'unfile') {
      unfileEntry(dispatcher, op.lid);
    } else if (op.op === 'delete') {
      dispatcher.dispatch({ type: 'DELETE_ENTRY', lid: op.lid });
    } else if (op.op === 'restore') {
      restoreDeleted(dispatcher, op.lid);
    } else if (op.op === 'purge-orphan-assets') {
      dispatcher.dispatch({ type: 'PURGE_ORPHAN_ASSETS' });
    }
  }
  return true;
}

/**
 * #796 PR-4: Tier T(trusted = same-origin 全権)の明示同意ダイアログ。
 * 「このアプリはコンテナ全体にアクセスできます」級の警告(§2)+ 3 択:
 * 全権で開く / サンドボックスで開く(推奨、Tier S への降格)/ キャンセル。
 * 自己完結 DOM(autostart retry prompt と同パターン)— renderer の state
 * 描画とは独立した runtime-only overlay。
 */
function showTrustConsentDialog(
  title: string,
  capabilities: readonly string[] | undefined,
  onChoice: (mode: 'trusted' | 'sandboxed' | null) => void,
): void {
  document.querySelector('[data-pkc-region="extension-trust-consent"]')?.remove();

  const overlay = document.createElement('div');
  overlay.setAttribute('data-pkc-region', 'extension-trust-consent');
  // z-index はアプリ最上位(IDB banner の 30000 帯より上)。全権同意は
  // セキュリティ判断なので、いかなる overlay にも隠されてはならない。
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:30500;background:rgba(0,0,0,0.55);'
    + 'display:flex;align-items:center;justify-content:center;';

  const card = document.createElement('div');
  card.style.cssText =
    'max-width:440px;margin:16px;background:var(--c-surface,#111510);'
    + 'color:var(--c-fg,#c8d8b0);border:1px solid var(--c-warn,#b54708);'
    + 'border-radius:6px;padding:16px 18px;font-size:0.85rem;'
    + 'box-shadow:0 8px 32px rgba(0,0,0,0.5);';

  const heading = document.createElement('div');
  heading.textContent = '🔓 全権アクセスの確認';
  heading.style.cssText = 'font-weight:600;margin-bottom:8px;color:var(--c-warn,#b54708);';
  card.appendChild(heading);

  const body = document.createElement('div');
  body.textContent =
    `「${title}」は trusted(同一オリジン)実行を要求しています。許可すると、`
    + 'このアプリは PKC2 のコンテナ全体(全エントリ・アセット・保存データ)へ'
    + '直接アクセスできます。配布元を信頼できる場合のみ許可してください。';
  body.style.marginBottom = '10px';
  card.appendChild(body);

  if (capabilities && capabilities.length > 0) {
    const caps = document.createElement('div');
    caps.textContent = `宣言 capability: ${capabilities.join(', ')}`;
    caps.style.cssText = 'font-size:0.75rem;opacity:0.8;margin-bottom:10px;';
    card.appendChild(caps);
  }

  const buttons = document.createElement('div');
  buttons.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
  const choices: { label: string; mode: 'trusted' | 'sandboxed' | null; action: string }[] = [
    { label: '🔒 サンドボックスで開く(推奨)', mode: 'sandboxed', action: 'ext-consent-sandboxed' },
    { label: '🔓 全権で開く', mode: 'trusted', action: 'ext-consent-trusted' },
    { label: 'キャンセル', mode: null, action: 'ext-consent-cancel' },
  ];
  for (const c of choices) {
    const btn = document.createElement('button');
    btn.textContent = c.label;
    btn.setAttribute('data-pkc-action', c.action);
    btn.style.cssText = 'cursor:pointer;padding:6px 10px;text-align:left;';
    btn.addEventListener('click', () => {
      overlay.remove();
      onChoice(c.mode);
    });
    buttons.appendChild(btn);
  }
  card.appendChild(buttons);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
}

export function createExtensionHost(
  dispatcher: Dispatcher,
  launch: LaunchFn = launchExtensionChannel,
): ExtensionHost {
  const handles = new Map<string, ExtensionChannelHandle>();
  const unsubs = new Map<string, () => void>();
  // #796 PR-4: trusted 宣言拡張の同意待ち集合と、同意待ち中に積まれた
  // 送付ジェスチャ(同意後に flush)。永続 grant(OQ-4 extensionGrants)
  // は v2.2 予約のため、**毎起動確認**(最も安全)とする。
  const pendingConsent = new Set<string>();
  const pendingSends = new Map<string, string[]>();
  // 構成送付(改善バッチ⑤)の同意待ちキュー。構成はスナップショットなので
  // extLid ごとに「送る予約」1 個で足りる(Set)。
  const pendingStructureSends = new Set<string>();
  // #830 R5: pkc-ext `propose` で投げられ、同意 banner 待ちの offer。
  // offer_id → 起源拡張 + 相関 id。accept/dismiss event でチャネルに結果を返す。
  const pendingProposals = new Map<string, { extLid: string; correlationId: string | null }>();

  // propose 経由の offer は postMessage の reply window を持たない(結果は
  // pkc-ext で返す)。OFFER_ACCEPTED/DISMISSED を購読し、自分が起こした
  // offer_id だけ拾って `propose-result` を起源拡張へ push する。
  const offProposeEvents = dispatcher.onEvent((event) => {
    if (event.type !== 'OFFER_ACCEPTED' && event.type !== 'OFFER_DISMISSED') return;
    const pending = pendingProposals.get(event.offer_id);
    if (!pending) return;
    pendingProposals.delete(event.offer_id);
    const handle = handles.get(pending.extLid);
    if (event.type === 'OFFER_ACCEPTED') {
      handle?.notifyProposeResult(true, event.lid, pending.correlationId);
    } else {
      handle?.notifyProposeResult(false, null, pending.correlationId);
    }
  });

  function launchResolved(
    extLid: string,
    resolved: { html: string; manifest?: ExtensionManifest },
  ): ExtensionChannelHandle | null {
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
      // #830 R5: 新規 entry の作成提案。host が payload を検証し、既存の
      // record:offer 同意 banner に流す(silent 作成は無い)。検証 NG は
      // 即 accepted=false。accept/dismiss の結果は offProposeEvents が返す。
      onPropose: (req) => {
        const handle = handles.get(extLid);
        const payload = validateOfferPayload(req.offer);
        if (!payload) {
          handle?.notifyProposeResult(false, null, req.correlation_id ?? null);
          return;
        }
        const offer = buildPendingOffer(payload, {
          correlation_id: req.correlation_id ?? null,
          reply_to_id: null,
        });
        pendingProposals.set(offer.offer_id, { extLid, correlationId: req.correlation_id ?? null });
        dispatcher.dispatch({ type: 'SYS_RECORD_OFFERED', offer });
      },
      // 改善バッチ⑤: 整理プランの提案 → 既存 plan modal(dry-run プレビュー)
      // に流す。silent apply は無い — 適用は常に user が modal で確認する。
      // pending は同時 1 件(modal が開いている間の後続は rejected)。
      onStructurePlan: (req: ExtStructurePlanRequest) => {
        const handle = handles.get(extLid);
        const correlationId = req.correlation_id ?? null;
        const notify = (
          status: 'applied' | 'rejected' | 'dismissed',
          applied: number | null,
          errors: readonly string[] | null,
        ): void => handle?.notifyStructurePlanResult(status, applied, errors, correlationId);
        const state = dispatcher.getState();
        if (state.readonly || state.lightSource || state.viewOnlySource || !state.container) {
          notify('rejected', null, ['編集できないコンテナです(readonly / view-only)']);
          return;
        }
        if (isStructurePlanModalOpen()) {
          notify('rejected', null, ['前の提案が確認待ちです(plan modal が開いています)']);
          return;
        }
        const entry = state.container.entries.find((e) => e.lid === extLid);
        const opened = openStructurePlanModal(dispatcher, {
          initialText: req.text,
          sourceLabel: entry?.title || extLid,
          onResult: (r) => notify(r.status, r.applied ?? null, null),
        });
        if (!opened) notify('rejected', null, ['plan modal を開けませんでした']);
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

  function openExtension(extLid: string): ExtensionChannelHandle | null {
    const existing = handles.get(extLid);
    if (existing && !existing.isClosed()) return existing;
    // 拡張 window をユーザーが手で閉じた後の再起動(user 報告 2026-06-12
    // 「アプリ起動が一度しかできない」): host は child close を event で
    // 検知できないため、死んだ handle はここで掃除して開き直す。
    if (existing) closeOne(extLid);
    const resolved = resolveExtension(dispatcher, extLid);
    if (!resolved) return null;

    // #796 PR-4 — Tier T は「逃げ道であって既定にしない」(§2)。trusted
    // 宣言は same-origin 全権 = コンテナ全体への直接アクセスなので、起動
    // 前に明示同意を取る。ダイアログのボタン click は user gesture なので
    // 同意後の window.open は popup block されない。
    if (resolved.manifest?.tier === 'trusted') {
      if (!pendingConsent.has(extLid)) {
        pendingConsent.add(extLid);
        const entry = dispatcher.getState().container?.entries.find((e) => e.lid === extLid);
        showTrustConsentDialog(entry?.title || extLid, resolved.manifest.capabilities, (mode) => {
          pendingConsent.delete(extLid);
          const queued = pendingSends.get(extLid) ?? [];
          pendingSends.delete(extLid);
          const queuedStructure = pendingStructureSends.delete(extLid);
          if (!mode) return; // キャンセル: 起動しない(積まれた送付も破棄)
          // 同意時点の container で再解決(ダイアログ表示中の変化に追従)。
          const fresh = resolveExtension(dispatcher, extLid);
          if (!fresh) return;
          const manifest: ExtensionManifest | undefined = mode === 'sandboxed'
            ? { ...fresh.manifest, tier: 'sandboxed' }
            : fresh.manifest;
          const handle = launchResolved(extLid, { html: fresh.html, manifest });
          if (handle) {
            for (const lid of queued) sendToExtension(extLid, lid);
            if (queuedStructure) sendStructureToExtension(extLid);
          }
        });
      }
      return null;
    }

    return launchResolved(extLid, resolved);
  }

  function sendToExtension(extLid: string, entryLid: string): boolean {
    const handle = openExtension(extLid);
    if (!handle) {
      // trusted の同意待ちなら送付を積んでおき、同意後に flush する
      // (ユーザーの send ジェスチャを黙って失わない)。
      if (pendingConsent.has(extLid)) {
        const queue = pendingSends.get(extLid) ?? [];
        queue.push(entryLid);
        pendingSends.set(extLid, queue);
        return true;
      }
      return false;
    }
    const container = dispatcher.getState().container;
    if (!container) return false;
    const payload = buildDeliverPayload(container, entryLid);
    if (!payload) return false;
    handle.deliver(payload);
    return true;
  }

  function sendStructureToExtension(extLid: string): boolean {
    const handle = openExtension(extLid);
    if (!handle) {
      // trusted の同意待ちなら予約しておき、同意後に flush する。
      if (pendingConsent.has(extLid)) {
        pendingStructureSends.add(extLid);
        return true;
      }
      return false;
    }
    const container = dispatcher.getState().container;
    if (!container) return false;
    handle.sendStructure(exportStructureText(container));
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
    sendStructureToExtension,
    hasPendingConsent: (extLid: string) => pendingConsent.has(extLid),
    openLids: () => [...handles.keys()],
    closeAll: () => {
      for (const lid of [...handles.keys()]) closeOne(lid);
      offProposeEvents();
      pendingProposals.clear();
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
