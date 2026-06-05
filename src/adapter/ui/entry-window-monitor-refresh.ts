/**
 * γ-A5(multi-window-vscode-extension-spec §3.3):monitor window の
 * 派生データ refresh 配線。
 *
 * dispatcher の state 変化を購読し、container の `entries` identity が
 * 変わったら、開いている monitor window の対象 entry を再評価して
 * `pushMonitorUpdate` で最新の派生データ(現状は TOC = 見出しアウトライン)
 * を push する。これで editor / 別経路の保存が monitor へ反映される
 * (spec §3.4「真のマルチウィンドウ」の monitor 版)。
 *
 * monitor は IDB を読まず、main の `state.container` から派生する
 * (spec §2-1 single authority)。push するのは描画済み HTML ではなく
 * **データ**(`MonitorItem[]`)── 子側 inline script が描画する
 * (spec §11.3 canvas 前方互換)。
 *
 * Companion to `wireEntryWindowViewBodyRefresh`(editor / viewer の
 * view-body 更新)。同じ dispatcher に同居し、互いに干渉しない。
 */

import type { Dispatcher } from '../state/dispatcher';
import { getOpenMonitorTargets, pushMonitorUpdate } from './entry-window';

/**
 * monitor refresh subscription を dispatcher に張る。
 * 返り値は `dispatcher.onState` の unsubscribe(主にテスト用)。
 */
export function wireEntryWindowMonitorRefresh(dispatcher: Dispatcher): () => void {
  return dispatcher.onState((state, prev) => {
    const next = state.container;
    if (!next) return;
    // entries identity が変わらなければ monitor の派生データも不変。
    if (prev.container?.entries === next.entries) return;
    const targets = getOpenMonitorTargets();
    if (targets.length === 0) return;
    for (const t of targets) {
      const entry = next.entries.find((e) => e.lid === t.lid);
      if (!entry) continue;
      pushMonitorUpdate(t.kind, t.lid, entry);
    }
  });
}
