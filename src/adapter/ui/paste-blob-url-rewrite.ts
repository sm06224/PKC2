/**
 * blob URL を含む markdown text の paste 時に、blob を fetch して PKC2 asset に
 * 書き込み、markdown 内の `blob:` URL を `asset:<key>` に rewrite する。
 *
 * user direction 2026-05-28:
 *   「blob url を含むマークダウンテキストの貼付時に、PKC のアセットとして書き込みし、
 *    アセットの埋め込みとしてインライン再現できますか？」
 *
 * ## scope
 *
 * - markdown image syntax `![alt](blob:...)` を detect
 * - blob URL を `fetch()` で blob 取得(同 document 由来なら同 session 内 URL.createObjectURL
 *   registry にあるので fetch 可、cross-document blob は network error で fallback)
 * - 取得成功なら base64 化 → `PASTE_ATTACHMENT` dispatch で asset 化
 * - text 内の `blob:...` を `asset:<key>` に置換
 * - 既存 asset render path(`<img src="asset:KEY">` → asset resolver)に乗せる
 *
 * ## fallback
 *
 * - fetch 失敗(cross-document blob 等)→ blob URL を維持 + warning toast
 * - 同 blob URL が複数登場 → 1 度だけ fetch、同じ asset key で全 occurrence 置換
 *
 * ## limitations
 *
 * - 非 image blob(`![](blob:...)` で type が非 image)も同様に accept、resolved な
 *   asset として保存(image-attach 経路に乗る MIME 判定は browser fetch の response
 *   から取る)
 * - markdown link 形 `[text](blob:...)` は本 PR 対象外(image syntax のみ)
 */

import type { Dispatcher } from '../state/dispatcher';
import { fileToBase64 } from './file-to-base64';

/** `![alt](blob:URL)` markdown image syntax を全件 capture。 */
const BLOB_URL_IMAGE_RE = /!\[([^\]\n]*)\]\((blob:[^)]+)\)/g;

export interface BlobRewriteResult {
  /** 置換後 markdown text。 */
  rewrittenText: string;
  /** asset 化に成功して URL を置換した件数。 */
  processedCount: number;
  /** fetch 失敗で URL を維持した件数。 */
  failedCount: number;
  /** 失敗時のエラーメッセージ集(toast / log 用)。 */
  errors: string[];
}

export interface BlobRewriteContext {
  /** context entry lid(`PASTE_ATTACHMENT` 配置先 folder の参照用)。 */
  contextLid: string;
  /** dispatcher で `PASTE_ATTACHMENT` を発火。 */
  dispatcher: Dispatcher;
}

/**
 * markdown text 内の blob URL を fetch + asset 化 + rewrite する。
 *
 * 同 blob URL が複数 occurrence あれば 1 度だけ fetch、同じ key で全 occurrence 置換。
 * 非対応 URL(fetch 失敗)は URL を残置、err を `errors[]` に格納して fallback。
 */
export async function rewriteBlobUrlsToAssets(
  text: string,
  ctx: BlobRewriteContext,
): Promise<BlobRewriteResult> {
  const errors: string[] = [];
  const matches = Array.from(text.matchAll(BLOB_URL_IMAGE_RE));
  if (matches.length === 0) {
    return { rewrittenText: text, processedCount: 0, failedCount: 0, errors };
  }

  // 同 blob URL を 1 度だけ fetch する dedup(高頻度 reuse 想定)
  const uniqueUrls = new Set(matches.map((m) => m[2]!));
  const urlToAssetKey = new Map<string, string>();
  let failedCount = 0;

  for (const blobUrl of uniqueUrls) {
    try {
      const response = await fetch(blobUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const blob = await response.blob();
      const mime = blob.type || 'application/octet-stream';
      const file = new File([blob], inferFilename(blobUrl, mime), { type: mime });
      const base64 = await fileToBase64(file);
      const assetKey = generateAssetKey();
      const name = file.name;

      ctx.dispatcher.dispatch({
        type: 'PASTE_ATTACHMENT',
        name,
        mime,
        size: blob.size,
        assetKey,
        assetData: base64,
        contextLid: ctx.contextLid,
      });

      urlToAssetKey.set(blobUrl, assetKey);
    } catch (err) {
      failedCount += 1;
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${blobUrl}: ${msg}`);
    }
  }

  // 置換は 1 pass で全件、`asset:<key>` 形に
  let rewrittenText = text;
  for (const [blobUrl, assetKey] of urlToAssetKey) {
    // alt は保持(`![alt](blob:...)` → `![alt](asset:KEY)`)
    rewrittenText = rewrittenText.replace(
      new RegExp(`!\\[([^\\]\\n]*)\\]\\(${escapeRegex(blobUrl)}\\)`, 'g'),
      `![$1](asset:${assetKey})`,
    );
  }

  return {
    rewrittenText,
    processedCount: urlToAssetKey.size,
    failedCount,
    errors,
  };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function generateAssetKey(): string {
  return `att-blob-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function inferFilename(blobUrl: string, mime: string): string {
  const ext = mime.split('/')[1]?.split(';')[0] ?? 'bin';
  const cleanExt = ext.replace(/[^a-z0-9]/gi, '') || 'bin';
  // blob URL の hash 部を簡易名に流用(冗長な URL を name に貼らないため最初の 8 桁のみ)
  const hash = blobUrl.replace(/[^a-zA-Z0-9]/g, '').slice(-8) || 'pasted';
  return `pasted-blob-${hash}.${cleanExt}`;
}

/**
 * `text` 内に blob URL の markdown image 形が存在するか判定(handler 内で
 * paste path を選択する事前 check 用)。global regex の lastIndex 干渉を避けるため
 * 新規 RegExp で test する(BLOB_URL_IMAGE_RE は matchAll 用 / `g` flag 付き)。
 */
export function hasBlobUrlImageMarkdown(text: string): boolean {
  return /!\[[^\]\n]*\]\(blob:[^)]+\)/.test(text);
}
