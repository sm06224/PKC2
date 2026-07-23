/**
 * Asset pin セットの boot プリウォーム — storage v3 P1s2-b(doc §4、#967)。
 *
 * > 「ランチャー登録対象や、参照可能性の高いアセットやエントリは、
 * >  高速性重視かつ per-file 影響の少ない状態がベスト」(user 指示)
 *
 * boot 完了直後の idle で、**参照可能性の高い asset** を registry へ先読み
 * (Blob handle → ObjectURL)し、LRU 追い出しから pin する:
 *
 *   1. launcher 登録 asset — `registered_as_app` / `startup` /
 *      `pkc_extension` の attachment 本体 + `app_icon_asset_key`(icon)
 *   2. 直近参照 — updated_at 降順の上位 N entries が持つ asset
 *   3. 現在選択の依存 closure — `getEntryAssetDependencies`(transclusion
 *      再帰込み)
 *
 * 以後、launcher タイル click / icon 描画 / 画像表示は ObjectURL 参照のみ
 * (per-file I/O ゼロ・syscall ゼロ)。bytes はブラウザ管理でヒープ外。
 * プリウォームは逐次読み(IDB Blob 直読み 0.8ms/件)で boot 体感と
 * 競合しない。
 *
 * 本 module は body を **最小 JSON parse** で読む(adapter/ui の
 * attachment-presenter に依存しない — platform 層から ui 層への逆流を
 * 避ける)。未知 field は無視、壊れた body は skip。
 */

import type { Container } from '../../core/model/container';
import type { Dispatcher } from '../state/dispatcher';
import { getEntryAssetDependencies } from '../../features/asset/asset-scan';
import {
  prewarmAssetUrls,
  type AssetBlobSource,
} from './asset-url-registry';

/** 「直近参照」として pin する entry 数の上限。 */
const RECENT_ENTRY_LIMIT = 20;
/** boot 完了からプリウォーム開始までの遅延(初回描画と競合しない)。 */
const PREWARM_DELAY_MS = 300;

interface MinimalAttachmentFields {
  asset_key?: string;
  app_icon_asset_key?: string;
  mime?: string;
  registered_as_app?: boolean;
  startup?: boolean;
  pkc_extension?: boolean;
}

function parseMinimalAttachment(body: string): MinimalAttachmentFields | null {
  try {
    const o = JSON.parse(body) as Record<string, unknown>;
    if (typeof o !== 'object' || o === null) return null;
    return {
      asset_key: typeof o.asset_key === 'string' ? o.asset_key : undefined,
      app_icon_asset_key:
        typeof o.app_icon_asset_key === 'string' ? o.app_icon_asset_key : undefined,
      mime: typeof o.mime === 'string' ? o.mime : undefined,
      registered_as_app: o.registered_as_app === true,
      startup: o.startup === true,
      pkc_extension: o.pkc_extension === true,
    };
  } catch {
    return null;
  }
}

/**
 * pin 対象の asset key(+ 分かる範囲の mime)を計算する。純関数。
 */
export function computePrewarmSet(
  container: Container,
  selectedLid: string | null,
): { key: string; mime?: string }[] {
  const out = new Map<string, string | undefined>();
  // asset_key → mime の索引(closure 由来 key の mime 解決にも使う)
  const mimeByKey = new Map<string, string>();
  const attachments: { fields: MinimalAttachmentFields }[] = [];
  for (const entry of container.entries) {
    if (entry.archetype !== 'attachment' || !entry.body) continue;
    const fields = parseMinimalAttachment(entry.body);
    if (!fields) continue;
    attachments.push({ fields });
    if (fields.asset_key && fields.mime) mimeByKey.set(fields.asset_key, fields.mime);
  }
  const add = (key: string | undefined): void => {
    if (!key) return;
    if (!out.has(key)) out.set(key, mimeByKey.get(key));
  };

  // 1. launcher 登録(本体 + icon)— 常時 pin の中核
  for (const { fields } of attachments) {
    if (fields.registered_as_app || fields.startup || fields.pkc_extension) {
      add(fields.asset_key);
      add(fields.app_icon_asset_key);
    }
  }

  // 2. 直近参照(updated_at 降順の上位 N、system entry は除外)
  const recent = container.entries
    .filter((e) => !e.lid.startsWith('__'))
    .slice()
    .sort((a, b) => (b.updated_at > a.updated_at ? 1 : b.updated_at < a.updated_at ? -1 : 0))
    .slice(0, RECENT_ENTRY_LIMIT);
  for (const entry of recent) {
    for (const key of getEntryAssetDependencies(container, entry.lid)) add(key);
  }

  // 3. 現在選択の依存 closure
  if (selectedLid) {
    for (const key of getEntryAssetDependencies(container, selectedLid)) add(key);
  }

  return [...out.entries()].map(([key, mime]) => ({ key, mime }));
}

/**
 * boot 配線(main.ts): container ごとに 1 回、ready 後の idle で
 * プリウォームを走らせる。URL が増えたら SYS_ASSET_URLS_READY で
 * 再 render(launcher icon 等が blob: に切り替わる)。
 */
export function mountAssetPrewarm(
  dispatcher: Dispatcher,
  store: AssetBlobSource,
): () => void {
  let warmedCid: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const unsub = dispatcher.onState((s) => {
    if (s.phase !== 'ready' || !s.container) return;
    const cid = s.container.meta.container_id;
    if (cid === warmedCid) return;
    warmedCid = cid;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      const st = dispatcher.getState();
      if (!st.container || st.container.meta.container_id !== cid) return;
      const wants = computePrewarmSet(st.container, st.selectedLid ?? null);
      if (wants.length === 0) return;
      void prewarmAssetUrls(store, cid, wants).then((added) => {
        if (added) dispatcher.dispatch({ type: 'SYS_ASSET_URLS_READY' });
      });
    }, PREWARM_DELAY_MS);
  });
  return () => {
    unsub();
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
}
