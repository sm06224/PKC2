/**
 * `?pkc-debug=assets` — attachment / asset 診断 overlay(#956)。
 *
 * user 報告「HTML と URL がライトエクスポート扱いになってアセットから
 * 開けない」(2026-07-22)の切り分け用。手元で再現しない報告に対し、
 * debug-via-url-flag-protocol の標準導線どおり「URL に付けて開くだけで
 * 内部状態が見える」観測点を提供する。
 *
 * 表示内容(state が言っていること + store の実体、の突き合わせ):
 *   - boot/環境: storage backend 設定、lightSource / viewOnlySource /
 *     readonly、差分保存 flag、container id、entry / asset 数
 *   - 各 attachment: lid / name / mime / asset_key /
 *     resident(container.assets に bytes があるか)/
 *     store(store から実際に読めるか + サイズ)/ 判定
 *
 * 「Light export 扱い」の実体は resident=✖ の表示。store=✔ なのに
 * resident=✖ のままなら working-set の回復漏れ、store=✖ なら bytes が
 * 実際に store に無い(データ側の問題)、と一目で切り分けられる。
 */

import type { Dispatcher } from '../state/dispatcher';
import type { ContainerStore } from '../platform/idb-store';
import { isDebugEnabled } from '../../runtime/debug-flags';
import { getStorageBackendPref } from '../platform/storage-backend';
import { parseAttachmentBody } from './attachment-presenter';
import { differentialSaveFlagValueForDebug } from '../platform/persistence';

interface AttachmentDiagnosis {
  lid: string;
  title: string;
  name: string;
  mime: string;
  assetKey: string | null;
  inlineData: boolean;
  resident: boolean;
  storeBytes: number | null;
}

const REGION = 'asset-debug-overlay';

async function diagnose(
  dispatcher: Dispatcher,
  store: ContainerStore,
): Promise<{ header: Record<string, unknown>; rows: AttachmentDiagnosis[] }> {
  const state = dispatcher.getState();
  const container = state.container;
  const cid = container?.meta.container_id ?? '(none)';
  const header: Record<string, unknown> = {
    backendPref: getStorageBackendPref(),
    lightSource: state.lightSource,
    viewOnlySource: state.viewOnlySource,
    readonly: state.readonly,
    differentialSave: differentialSaveFlagValueForDebug(),
    containerId: cid,
    entryCount: container?.entries.length ?? 0,
    residentAssetCount: Object.keys(container?.assets ?? {}).length,
  };
  const rows: AttachmentDiagnosis[] = [];
  if (!container) return { header, rows };
  for (const e of container.entries) {
    if (e.archetype !== 'attachment') continue;
    const att = parseAttachmentBody(e.body);
    const key = att.asset_key ?? null;
    let storeBytes: number | null = null;
    if (key) {
      try {
        const data = await store.loadAsset(cid, key);
        storeBytes = typeof data === 'string' ? data.length : null;
      } catch {
        storeBytes = null;
      }
    }
    rows.push({
      lid: e.lid,
      title: e.title,
      name: att.name ?? '',
      mime: att.mime ?? '',
      assetKey: key,
      inlineData: !!att.data,
      resident: !!(key && container.assets[key]),
      storeBytes,
    });
  }
  return { header, rows };
}

function verdict(d: AttachmentDiagnosis): string {
  if (d.inlineData) return 'OK(inline data)';
  if (!d.assetKey) return '✖ asset_key なし(body 破損?)';
  if (d.resident) return 'OK(resident)';
  if (d.storeBytes !== null) return '△ store にはある(working-set 未回復)';
  return '✖ store にも無い(bytes 欠落)';
}

function buildPanel(
  header: Record<string, unknown>,
  rows: AttachmentDiagnosis[],
  onRefresh: () => void,
): HTMLElement {
  document.querySelector(`[data-pkc-region="${REGION}"]`)?.remove();
  const panel = document.createElement('div');
  panel.setAttribute('data-pkc-region', REGION);
  panel.setAttribute('data-pkc-debug', 'true');
  panel.className = 'pkc-asset-debug-overlay';

  const head = document.createElement('div');
  head.className = 'pkc-asset-debug-head';
  head.textContent = `🔬 asset debug — ${Object.entries(header)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(' / ')}`;
  panel.appendChild(head);

  const table = document.createElement('table');
  table.className = 'pkc-asset-debug-table';
  const thead = document.createElement('tr');
  for (const h of ['entry', 'name / mime', 'asset_key', 'resident', 'store', '判定']) {
    const th = document.createElement('th');
    th.textContent = h;
    thead.appendChild(th);
  }
  table.appendChild(thead);
  for (const d of rows) {
    const tr = document.createElement('tr');
    const cells = [
      `${d.title}(${d.lid})`,
      `${d.name} / ${d.mime}`,
      d.assetKey ?? '(なし)',
      d.resident ? '✔' : '✖',
      d.storeBytes !== null ? `✔ ${d.storeBytes}B` : '✖',
      verdict(d),
    ];
    for (const c of cells) {
      const td = document.createElement('td');
      td.textContent = c;
      tr.appendChild(td);
    }
    if (!d.inlineData && !d.resident) tr.setAttribute('data-pkc-debug-bad', 'true');
    table.appendChild(tr);
  }
  panel.appendChild(table);

  const actions = document.createElement('div');
  actions.className = 'pkc-asset-debug-actions';
  const refreshBtn = document.createElement('button');
  refreshBtn.type = 'button';
  refreshBtn.className = 'pkc-btn-small';
  refreshBtn.textContent = '↻ 再診断';
  refreshBtn.addEventListener('click', onRefresh);
  actions.appendChild(refreshBtn);
  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'pkc-btn-small';
  copyBtn.textContent = '📋 コピー(報告用 JSON)';
  copyBtn.addEventListener('click', () => {
    void navigator.clipboard?.writeText(
      JSON.stringify({ header, attachments: rows }, null, 2),
    );
  });
  actions.appendChild(copyBtn);
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'pkc-btn-small';
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', () => panel.remove());
  actions.appendChild(closeBtn);
  panel.appendChild(actions);

  document.body.appendChild(panel);
  return panel;
}

/**
 * `?pkc-debug=assets` が有効なら、boot 完了後に診断 overlay を表示する。
 * 無効なら完全 no-op。
 */
export function mountAssetDebugOverlay(
  dispatcher: Dispatcher,
  store: ContainerStore,
): void {
  if (!isDebugEnabled('assets')) return;
  let shown = false;
  const run = async (): Promise<void> => {
    const { header, rows } = await diagnose(dispatcher, store);
    buildPanel(header, rows, () => { void run(); });
  };
  const unsub = dispatcher.onState((s) => {
    if (shown) return;
    if (s.phase !== 'ready' || !s.container) return;
    shown = true;
    setTimeout(() => { void run(); }, 1000);
    queueMicrotask(() => unsub());
  });
}
