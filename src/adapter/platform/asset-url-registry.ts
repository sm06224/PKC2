/**
 * Asset ObjectURL registry — storage v3 P1 slice 2-a(doc §4、#967)。
 *
 * 原理「先読み(キャッシュ)」の基盤: asset の bytes を**ヒープ外**
 * (ブラウザ管理の Blob)に置いたまま、描画には ObjectURL を渡す。
 *
 *   - 同期 render 経路は `getAssetUrl(key, mime)` を先に引く。
 *     hit → `blob:` URL(bytes はヒープに載らない・syscall ゼロ)。
 *     miss → wanted に記録して null(呼び出し側は従来の base64
 *     fallback / miss 記録へ進む — 挙動の後方互換)。
 *   - render 後、mount した drain が wanted を `store.loadAssetBlob`
 *     (IDB Blob 直読み: 実測 0.8ms・ヒープ ±0)で解決し、URL を生成して
 *     `SYS_ASSET_URLS_READY` で再 render を促す(asset-miss-recorder →
 *     working-set と同じ「記録 → drain → pop-in」パターン)。
 *   - URL が供給されると render は base64 を要求しなくなる → working-set
 *     が base64 を evict でき、ヒープが総量比例から外れていく(C1)。
 *
 * eviction: bytes がヒープ外なので予算は**件数**で緩く張る(LRU +
 * revoke)。container 切替時は全 revoke。
 *
 * 注意: registry が生成した URL の revoke は registry だけが行う。
 * 消費側は自前 URL(per-render 生成)と区別し、registry URL を
 * `data-pkc-blob-url`(cleanup 対象)に載せないこと。
 */

import type { Dispatcher } from '../state/dispatcher';

/** ContainerStore のうち registry が必要とする最小面。 */
export interface AssetBlobSource {
  loadAssetBlob(containerId: string, key: string): Promise<Blob | null>;
}

interface UrlEntry {
  url: string;
  size: number;
  lastUsed: number;
}

const MAX_URLS = 512;
/** store に無かった key の再試行抑止(保存 debounce との競合を TTL で解消)。 */
const ABSENT_TTL_MS = 30_000;

let urls = new Map<string, UrlEntry>();
let wanted = new Map<string, string | undefined>(); // key → mime
let absent = new Map<string, number>(); // key → recordedAt
/** P1s2-b: LRU 追い出しから除外する key(launcher 登録 / 直近参照 /
 * 選択 closure — §4 の pin セット)。 */
let pinned = new Set<string>();
let tick = 0;

function revokeAll(): void {
  for (const e of urls.values()) {
    try {
      URL.revokeObjectURL(e.url);
    } catch { /* noop */ }
  }
  urls = new Map();
  wanted = new Map();
  absent = new Map();
  pinned = new Set();
}

/**
 * 同期 lookup(描画経路)。hit で `blob:` URL、miss は wanted に記録して
 * null(描画側は従来 fallback へ)。
 */
export function getAssetUrl(key: string, mime?: string): string | null {
  if (!key) return null;
  const e = urls.get(key);
  if (e) {
    e.lastUsed = ++tick;
    return e.url;
  }
  const absentAt = absent.get(key);
  if (absentAt !== undefined && Date.now() - absentAt < ABSENT_TTL_MS) return null;
  if (!wanted.has(key)) wanted.set(key, mime);
  return null;
}

function evictOverCap(): void {
  if (urls.size <= MAX_URLS) return;
  // pinned は追い出さない(bytes はヒープ外なので cap 超過は許容し、
  // 追い出しは unpinned の LRU からのみ)。
  const evictable = [...urls.entries()].filter(([k]) => !pinned.has(k));
  const sorted = evictable.sort((a, b) => a[1].lastUsed - b[1].lastUsed);
  const drop = Math.min(sorted.length, urls.size - MAX_URLS);
  for (let i = 0; i < drop; i++) {
    const [key, e] = sorted[i]!;
    try {
      URL.revokeObjectURL(e.url);
    } catch { /* noop */ }
    urls.delete(key);
  }
}

/**
 * wanted を store から解決して URL を張る。新規 URL を張れたら true
 * (呼び出し側が再 render を trigger する)。
 */
export async function drainWantedAssetUrls(
  store: AssetBlobSource,
  containerId: string,
): Promise<boolean> {
  if (wanted.size === 0) return false;
  const batch = [...wanted.entries()];
  wanted = new Map();
  let added = false;
  for (const [key, mime] of batch) {
    if (urls.has(key)) continue;
    let blob: Blob | null = null;
    try {
      blob = await store.loadAssetBlob(containerId, key);
    } catch {
      blob = null;
    }
    if (!blob) {
      absent.set(key, Date.now());
      continue;
    }
    // MIME が Blob record に残っていない場合は消費側の宣言で包む
    // (new Blob([blob]) は参照結合でバイトコピーしない)。
    const typed = mime && blob.type !== mime ? new Blob([blob], { type: mime }) : blob;
    urls.set(key, { url: URL.createObjectURL(typed), size: blob.size, lastUsed: ++tick });
    added = true;
  }
  evictOverCap();
  return added;
}

/**
 * P1s2-b: pin セットのプリウォーム。指定 key を store から Blob 直読みで
 * URL 化し、LRU 追い出しから除外(pin)する。既に URL がある key は pin
 * だけ付ける。並列は控えめ(逐次)— boot 直後の idle で走る前提で、
 * 起動体感と競合しない。新規 URL を張れたら true。
 */
export async function prewarmAssetUrls(
  store: AssetBlobSource,
  containerId: string,
  wants: ReadonlyArray<{ key: string; mime?: string }>,
): Promise<boolean> {
  let added = false;
  for (const { key, mime } of wants) {
    if (!key) continue;
    pinned.add(key);
    if (urls.has(key)) continue;
    let blob: Blob | null = null;
    try {
      blob = await store.loadAssetBlob(containerId, key);
    } catch {
      blob = null;
    }
    if (!blob) {
      absent.set(key, Date.now());
      continue;
    }
    const typed = mime && blob.type !== mime ? new Blob([blob], { type: mime }) : blob;
    urls.set(key, { url: URL.createObjectURL(typed), size: blob.size, lastUsed: ++tick });
    added = true;
  }
  evictOverCap();
  return added;
}

/** Test 用: pin 済み key 集合のスナップショット。 */
export function __pinnedKeysForTest(): ReadonlySet<string> {
  return new Set(pinned);
}

/**
 * boot 配線(main.ts): render 後に wanted を drain し、URL が増えたら
 * `SYS_ASSET_URLS_READY` で再 render を促す。container 切替は
 * `container_id` の変化で検知して全 revoke。
 */
export function mountAssetUrlRegistry(
  dispatcher: Dispatcher,
  store: AssetBlobSource,
): () => void {
  let running: Promise<void> = Promise.resolve();
  let lastCid: string | null = null;
  const unsub = dispatcher.onState((s) => {
    const cid = s.container?.meta.container_id ?? null;
    if (cid !== lastCid) {
      revokeAll();
      lastCid = cid;
    }
    if (!cid || wanted.size === 0) return;
    running = running.then(async () => {
      const added = await drainWantedAssetUrls(store, cid);
      if (added) dispatcher.dispatch({ type: 'SYS_ASSET_URLS_READY' });
    });
  });
  return () => {
    unsub();
    revokeAll();
    lastCid = null;
  };
}

/** Test / container 破棄用: 全 URL を revoke して空にする。 */
export function __resetAssetUrlRegistryForTest(): void {
  revokeAll();
  tick = 0;
}

/** Test 用: 現在張られている URL 件数。 */
export function __assetUrlCountForTest(): number {
  return urls.size;
}
