/**
 * Image-as-asset fetcher (PR-HH, 2026-05-06).
 *
 * Loads a remote image URL and returns it as a base64-encoded asset
 * payload + MIME type, so the thumbnail materializer can store it
 * in `container.assets` and the bookmarklet/capture path no longer
 * depends on the origin host's runtime availability.
 *
 * Strategy: anonymous-CORS `<img>` + canvas read. Most public image
 * CDNs (i.ytimg.com, nicovideo, kakuyomu cover art, Amazon cover
 * art, Spotify, Apple Music) serve `Access-Control-Allow-Origin:
 * *` for static images, so canvas-readback works. When a host
 * refuses CORS the canvas becomes "tainted" and `toDataURL`
 * throws — we catch that and resolve `null`, leaving the runtime
 * URL fallback path intact.
 *
 * Failures (timeout / network / CORS taint / non-image) are NOT
 * surfaced to the user. The materializer is best-effort — the
 * existing `pickImageAssetForEntry` URL fallback covers the
 * unmaterialized case.
 */

const DEFAULT_TIMEOUT_MS = 8000;

export interface FetchedImage {
  /** Base64-encoded image bytes (no `data:` prefix). */
  readonly b64: string;
  /** MIME type as reported by the canvas encoder. */
  readonly mime: string;
}

/**
 * Load a http(s) image URL into a base64 asset payload via canvas.
 * Resolves `null` on any failure (timeout, network, CORS taint).
 */
export async function fetchImageAsBase64(
  url: string,
  options: { timeoutMs?: number; doc?: Document } = {},
): Promise<FetchedImage | null> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const doc = options.doc ?? (typeof document !== 'undefined' ? document : null);
  if (!doc) return null;

  return new Promise<FetchedImage | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';

    let settled = false;
    const finish = (result: FetchedImage | null): void => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(result);
    };

    const timer = window.setTimeout(() => finish(null), timeoutMs);

    img.onload = (): void => {
      try {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        if (!w || !h) {
          finish(null);
          return;
        }
        const canvas = doc.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          finish(null);
          return;
        }
        ctx.drawImage(img, 0, 0);
        // Pick a MIME type matching common server formats. Default
        // to JPEG for opaque art (smaller for cover/thumb work) and
        // PNG for pixel-art / icons (transparent / sharp edges).
        // Heuristic from the URL extension since the canvas itself
        // can't tell.
        const mime = pickEncoderMime(url);
        const dataUrl = canvas.toDataURL(mime, mime === 'image/jpeg' ? 0.85 : undefined);
        const commaIdx = dataUrl.indexOf(',');
        if (commaIdx < 0) {
          finish(null);
          return;
        }
        const b64 = dataUrl.slice(commaIdx + 1);
        finish({ b64, mime });
      } catch {
        // Canvas tainted by cross-origin without ACAO — `toDataURL`
        // throws SecurityError. Best-effort path — drop silently.
        finish(null);
      }
    };

    img.onerror = (): void => finish(null);

    img.src = url;
  });
}

function pickEncoderMime(url: string): string {
  const lower = url.toLowerCase();
  if (lower.endsWith('.png') || lower.includes('.png?')) return 'image/png';
  if (lower.endsWith('.webp') || lower.includes('.webp?')) return 'image/webp';
  return 'image/jpeg';
}
