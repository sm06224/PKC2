import type { Container } from '../../core/model/container';

// --- Thresholds (bytes) ---
export const SIZE_WARN_SOFT = 1 * 1024 * 1024;  // 1 MB
export const SIZE_WARN_HEAVY = 5 * 1024 * 1024;  // 5 MB
/**
 * Hard reject threshold. Above this size the attachment pipeline
 * refuses to accept the file because:
 *   - `readAsDataURL` / `readAsArrayBuffer` allocates the whole file
 *     into JS heap, peaking at roughly 2–3× the source size once
 *     base64 encoding doubles the working set (File bytes +
 *     ArrayBuffer copy + base64 string). A 250 MB file already hits
 *     ~750 MB peak; anything approaching 1 GB reliably OOMs Chromium
 *     on typical desktop configurations.
 *   - base64 encoding expands the payload by ~33%, so 250 MB source →
 *     ~333 MB in `Container.assets` → re-serialized into the single
 *     HTML product again, doubling the on-disk footprint.
 *   - IDB `put()` does not stream; the full base64 string must be
 *     materialised in one shot and can silently hit per-origin
 *     quotas on some browsers.
 * See docs/development/attachment-size-limits.md for the full audit.
 */
export const SIZE_REJECT_HARD = 250 * 1024 * 1024;  // 250 MB

export type SizeWarningLevel = 'none' | 'soft' | 'heavy' | 'reject';

/**
 * Classify file size into a warning level.  `reject` means the
 * attachment pipeline MUST refuse the file — see SIZE_REJECT_HARD.
 */
export function classifyFileSize(bytes: number): SizeWarningLevel {
  if (bytes >= SIZE_REJECT_HARD) return 'reject';
  if (bytes >= SIZE_WARN_HEAVY) return 'heavy';
  if (bytes >= SIZE_WARN_SOFT) return 'soft';
  return 'none';
}

/**
 * Build a human-readable file size warning message.
 * Returns null if no warning is needed.
 */
export function fileSizeWarningMessage(bytes: number): string | null {
  const level = classifyFileSize(bytes);
  const sizeStr = formatSizeForWarning(bytes);
  if (level === 'reject') {
    return `⛔ File is ${sizeStr}. PKC2 cannot attach files over ${formatSizeForWarning(SIZE_REJECT_HARD)} because the single-HTML embedding would exceed browser memory limits. Store the file externally and link to it instead.`;
  }
  if (level === 'heavy') {
    return `⚠ File is ${sizeStr}. Large files significantly increase export size and may slow down operations. Consider using external storage.`;
  }
  if (level === 'soft') {
    return `File is ${sizeStr}. Files over 1 MB increase export size. ZIP Package export is recommended for large attachments.`;
  }
  return null;
}

/**
 * Returns true when the file size is above SIZE_REJECT_HARD and the
 * attachment pipeline must refuse it. Convenience wrapper so callers
 * do not have to re-classify the level themselves.
 */
export function isFileTooLarge(bytes: number): boolean {
  return bytes >= SIZE_REJECT_HARD;
}

// --- Export guardrails ---

/**
 * Calculate total asset size in bytes (from base64 strings in container.assets).
 */
export function totalAssetBytes(container: Container): number {
  let total = 0;
  for (const val of Object.values(container.assets)) {
    // base64 → approximate decoded size
    if (typeof val === 'string' && val.length > 0) {
      const padding = (val.match(/=+$/) ?? [''])[0]!.length;
      total += Math.floor((val.length * 3) / 4) - padding;
    }
  }
  return total;
}

/**
 * Count assets in the container.
 */
export function assetCount(container: Container): number {
  return Object.keys(container.assets).length;
}

/**
 * Check if container has any assets (for Light export warning).
 */
export function hasAssets(container: Container): boolean {
  return Object.keys(container.assets).length > 0;
}

/**
 * Build a warning message for Light export when assets exist.
 * Returns null if no assets.
 */
export function lightExportWarning(container: Container): string | null {
  const count = assetCount(container);
  if (count === 0) return null;
  const totalSize = totalAssetBytes(container);
  return `Light export excludes ${count} attachment(s) (${formatSizeForWarning(totalSize)}). Use Full or ZIP to include files.`;
}

/**
 * Estimate Full HTML export size.
 * base64 encoding adds ~33% overhead; gzip typically saves 30-55% on text-like data.
 * For a rough estimate: JSON overhead + base64 assets * 0.75 (gzip saving on text)
 * This is intentionally conservative (overestimates).
 */
export function estimateFullExportSize(container: Container): number {
  // Serialize container without assets to get base size
  const baseJson = JSON.stringify({
    meta: container.meta,
    entries: container.entries,
    relations: container.relations,
    revisions: container.revisions,
  });
  const baseSize = baseJson.length;

  // Assets are stored as base64, compressed to gzip+base64 in Full export
  // gzip typically reduces base64 by ~30-55%, use conservative 20% reduction
  let assetsSize = 0;
  for (const val of Object.values(container.assets)) {
    if (typeof val === 'string') {
      assetsSize += val.length;
    }
  }
  // Conservative: assume 20% gzip reduction on the base64 strings
  const compressedAssetsSize = Math.ceil(assetsSize * 0.8);

  // HTML shell overhead (~2KB)
  const shellOverhead = 2048;

  return baseSize + compressedAssetsSize + shellOverhead;
}

/**
 * Build export size estimation message for Full export.
 * Returns null if container has no assets (estimation not meaningful).
 */
export function fullExportEstimation(container: Container): string | null {
  if (!hasAssets(container)) return null;
  const estimated = estimateFullExportSize(container);
  return `Estimated Full export size: ~${formatSizeForWarning(estimated)} (gzip compressed)`;
}

/**
 * Build ZIP recommendation message for large data.
 * Returns null if total data is small.
 */
export function zipRecommendation(container: Container): string | null {
  const total = totalAssetBytes(container);
  if (total < SIZE_WARN_SOFT) return null;
  return `Container has ${formatSizeForWarning(total)} of attachments. ZIP Package export preserves files as raw binary and is recommended for large data.`;
}

// --- Helpers ---

function formatSizeForWarning(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
