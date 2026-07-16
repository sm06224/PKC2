/**
 * 本文中の asset 参照 chip → 埋め込みプレーヤー hydration(#921、2026-07-16)。
 *
 * user 要望「通常のアセットも埋め込みプレーヤーで再生できるように。これで
 * 会議メモをうまく残せるはず」。
 *
 * markdown render は `[label](asset:key)` を `<a href="#asset-KEY">` chip に
 * しか変換しない(features 層は DOM/Blob を持てない)。本 module はその chip
 * の隣に audio / video / pdf のプレビュー要素を差し込む adapter 層 hydrator。
 * 従来は action-binder 内の `populateInlineAssetPreviews`(center pane 専用)
 * に閉じていたロジックを、**S2 Viewer popup / S4 entry-window view でも同じ
 * DOM を出せる**よう container 引数の共有関数へ抽出した(mermaid hydration の
 * 3 surface 展開 #900/#910 と同じ運び)。
 *
 * 冪等:chip の直後に `data-pkc-inline-preview` が既にあれば skip。
 * blob URL は要素の `data-pkc-blob-url` に記録され、main window では
 * `cleanupBlobUrls()` が再 render 前に revoke する(popup 側は document の
 * 寿命 = window close までで、attachment preview と同じ扱い)。
 */

import type { Container } from '../../core/model/container';
import { parseAttachmentBody, classifyPreviewType } from './attachment-presenter';

/** base64 asset → blob URL(呼び出しごとに新規作成、revoke は caller 管理)。 */
function createBlobUrl(data: string, mime: string): string {
  const byteChars = atob(data);
  const bytes = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    bytes[i] = byteChars.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: mime });
  return URL.createObjectURL(blob);
}

/** container の attachment entries から asset_key → {mime, base64} 索引を作る。 */
export function buildInlineAssetIndex(
  container: Container,
): Map<string, { mime: string; base64: string }> {
  const map = new Map<string, { mime: string; base64: string }>();
  for (const entry of container.entries) {
    if (entry.archetype !== 'attachment') continue;
    const att = parseAttachmentBody(entry.body);
    if (!att.asset_key) continue;
    let base64 = '';
    if (container.assets?.[att.asset_key] != null) {
      base64 = container.assets[att.asset_key]!;
    } else if (att.data) {
      base64 = att.data;
    }
    if (!base64 || !att.mime) continue;
    map.set(att.asset_key, { mime: att.mime, base64 });
  }
  return map;
}

export interface HydrateInlineOptions {
  /** この selector に閉包される chip は skip(main window の edit preview 除外用)。 */
  excludeClosest?: string;
  /** 事前構築済み index(action-binder の per-render 共有用)。省略時は container から構築。 */
  assetIndex?: Map<string, { mime: string; base64: string }>;
}

/**
 * `rootEl` 配下の `a[href^="#asset-"]` chip を走査し、audio / video / pdf の
 * asset にはプレビュー要素を chip 直後へ差し込む。audio / video は chip を
 * 非表示化(プレーヤーが本体)、pdf は chip を残す(fallback 判定が不確実)。
 *
 * cross-document 安全:要素は `chip.ownerDocument` で作るため、Viewer popup /
 * entry-window(独立 document)の要素にもそのまま使える。
 */
export function hydrateInlineAssetPreviews(
  rootEl: Element,
  container: Container,
  options: HydrateInlineOptions = {},
): void {
  const chips = rootEl.querySelectorAll<HTMLAnchorElement>('a[href^="#asset-"]');
  if (chips.length === 0) return;
  let assetByKey = options.assetIndex ?? null;

  for (const chip of chips) {
    if (options.excludeClosest && chip.closest(options.excludeClosest)) continue;
    if (chip.nextElementSibling?.hasAttribute('data-pkc-inline-preview')) continue;

    const href = chip.getAttribute('href') ?? '';
    const assetKey = href.slice('#asset-'.length);
    if (!assetKey) continue;

    if (!assetByKey) assetByKey = buildInlineAssetIndex(container);
    const found = assetByKey.get(assetKey);
    if (!found) continue;
    const { mime, base64 } = found;

    const previewType = classifyPreviewType(mime);
    if (previewType !== 'pdf' && previewType !== 'audio' && previewType !== 'video') continue;

    const doc = chip.ownerDocument;
    try {
      const blobUrl = createBlobUrl(base64, mime);
      const wrapper = doc.createElement('div');
      wrapper.setAttribute('data-pkc-inline-preview', previewType);
      wrapper.className = 'pkc-inline-preview';

      switch (previewType) {
        case 'pdf': {
          const obj = doc.createElement('object');
          obj.className = 'pkc-inline-pdf-preview';
          obj.type = 'application/pdf';
          obj.data = blobUrl;
          obj.setAttribute('data-pkc-blob-url', blobUrl);
          const fallback = doc.createElement('p');
          fallback.textContent = 'PDF preview not available in this browser.';
          obj.appendChild(fallback);
          wrapper.appendChild(obj);
          // PDF: chip は隠さない(fallback 検知が不確実)
          break;
        }
        case 'audio': {
          const audio = doc.createElement('audio');
          audio.className = 'pkc-inline-audio-preview';
          audio.controls = true;
          audio.preload = 'none';
          audio.setAttribute('data-pkc-blob-url', blobUrl);
          const source = doc.createElement('source');
          source.src = blobUrl;
          source.type = mime;
          audio.appendChild(source);
          wrapper.appendChild(audio);
          chip.style.display = 'none';
          break;
        }
        case 'video': {
          const video = doc.createElement('video');
          video.className = 'pkc-inline-video-preview';
          video.controls = true;
          video.preload = 'none';
          video.setAttribute('data-pkc-blob-url', blobUrl);
          const source = doc.createElement('source');
          source.src = blobUrl;
          source.type = mime;
          video.appendChild(source);
          wrapper.appendChild(video);
          chip.style.display = 'none';
          break;
        }
      }

      chip.after(wrapper);
    } catch {
      // Graceful fallback: chip を残して skip(download は生きる)
    }
  }
}
