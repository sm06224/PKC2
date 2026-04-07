/**
 * HTML Exporter: runtime export of current Container as self-contained HTML.
 *
 * Responsibility:
 * - Read current document's code (pkc-core), styles (pkc-styles, pkc-theme),
 *   and metadata (pkc-meta, html data attributes) from the live DOM.
 * - Serialize the current Container (persistent model only, no runtime state).
 * - Assemble a standalone HTML document matching the shell.html contract.
 * - Trigger download via Blob URL.
 *
 * Design decisions:
 * - Metadata is preserved from the original build (code hasn't changed).
 *   Only `capabilities` gains 'export' to indicate this artifact was exported.
 * - pkc-data shape: { container: Container } — matches readPkcData() in main.ts.
 * - code_integrity stays the same (same pkc-core content).
 * - No data_integrity yet (future concern).
 * - File naming: pkc2-{slug}-{YYYYMMDD}.html
 *
 * This module lives in adapter/platform/ because:
 * - It reads from the DOM (browser API)
 * - It triggers a download (browser API)
 * - It must NOT be imported by core/
 */

import { SLOT } from '../../runtime/contract';
import type { Container } from '../../core/model/container';
import type { ExportMode, ExportMutability } from '../../core/action/user-action';
import type { ReleaseMeta } from '../../runtime/release-meta';
import { compressAssets } from './compression';

/**
 * ExportResult: outcome of an export attempt.
 */
export interface ExportResult {
  success: boolean;
  filename: string;
  size: number;
  error?: string;
}

/**
 * export_meta: metadata embedded in pkc-data to identify the export configuration.
 */
export interface ExportMeta {
  mode: ExportMode;
  mutability: ExportMutability;
  asset_encoding?: 'base64' | 'gzip+base64';
}

/**
 * ExportOptions: optional configuration for export.
 */
export interface ExportOptions {
  /** Override filename (without extension). */
  filename?: string;
  /** Export mode: 'light' strips assets, 'full' includes everything. Default: 'full'. */
  mode?: ExportMode;
  /** Export mutability: 'editable' or 'readonly'. Default: 'editable'. */
  mutability?: ExportMutability;
}

/**
 * Build the pkc-data JSON string from a Container.
 * Shape: { container, export_meta } — matches readPkcData() contract.
 *
 * Light mode: strips container.assets to {}, adds export_meta.mode = 'light'.
 * Full mode: compresses assets (gzip+base64), adds export_meta with asset_encoding.
 * Mutability: 'editable' (default) or 'readonly' (view-only with rehydrate).
 */
export async function serializePkcData(
  container: Container,
  mode: ExportMode = 'full',
  mutability: ExportMutability = 'editable',
): Promise<string> {
  const exportMeta: ExportMeta = { mode, mutability };

  let exported: Container;
  if (mode === 'light') {
    exported = { ...container, assets: {} };
  } else {
    // Full mode: compress assets for size efficiency
    const { assets: compressedAssets, encoding } = await compressAssets(container.assets);
    exported = { ...container, assets: compressedAssets };
    exportMeta.asset_encoding = encoding;
  }

  const json = JSON.stringify({ container: exported, export_meta: exportMeta }, null, 2);
  // Escape </script> inside JSON to prevent premature script tag closure in HTML.
  // This is a standard HTML-in-script safety measure.
  return json.replace(/<\/(script)/gi, '<\\/$1');
}

/**
 * Build the full HTML string for export.
 *
 * Reads structural elements from the live DOM:
 * - pkc-core (JS bundle)
 * - pkc-styles (compiled CSS)
 * - pkc-theme (theme overrides)
 * - pkc-meta (release metadata)
 * - html data-pkc-* attributes
 *
 * Injects the given Container as pkc-data.
 */
export async function buildExportHtml(
  container: Container,
  mode: ExportMode = 'full',
  mutability: ExportMutability = 'editable',
): Promise<string> {
  // Read from live DOM
  const coreEl = document.getElementById(SLOT.CORE);
  const stylesEl = document.getElementById(SLOT.STYLES);
  const themeEl = document.getElementById(SLOT.THEME);
  const metaEl = document.getElementById(SLOT.META);
  const htmlEl = document.documentElement;

  const code = coreEl?.textContent ?? '';
  const styles = stylesEl?.textContent ?? '';
  const theme = themeEl?.textContent ?? '/* theme overrides */';

  // Read and optionally augment metadata
  let metaJson = metaEl?.textContent?.trim() ?? '{}';
  try {
    const meta = JSON.parse(metaJson) as Partial<ReleaseMeta>;
    if (meta.capabilities && !meta.capabilities.includes('export')) {
      meta.capabilities = [...meta.capabilities, 'export'];
    }
    metaJson = JSON.stringify(meta, null, 2);
  } catch {
    // Keep original if parse fails
  }

  // Read html attributes
  const app = htmlEl.getAttribute('data-pkc-app') ?? 'pkc2';
  const version = htmlEl.getAttribute('data-pkc-version') ?? '';
  const schema = htmlEl.getAttribute('data-pkc-schema') ?? '';
  const timestamp = htmlEl.getAttribute('data-pkc-timestamp') ?? '';
  const kind = htmlEl.getAttribute('data-pkc-kind') ?? 'dev';

  // Serialize container data (async: may compress assets)
  const dataJson = await serializePkcData(container, mode, mutability);

  // Assemble HTML matching shell.html contract
  return `<!DOCTYPE html>
<html lang="ja"
      data-pkc-app="${escapeAttr(app)}"
      data-pkc-version="${escapeAttr(version)}"
      data-pkc-schema="${escapeAttr(schema)}"
      data-pkc-timestamp="${escapeAttr(timestamp)}"
      data-pkc-kind="${escapeAttr(kind)}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${escapeHtml(container.meta.title || 'PKC2')}</title>
  <style id="pkc-styles">${styles}</style>
  <style id="pkc-theme">${theme}</style>
</head>
<body>
  <div id="pkc-root"></div>

  <script id="pkc-data" type="application/json">${dataJson}</script>

  <script id="pkc-meta" type="application/json">${metaJson}</script>

  <script id="pkc-core">${code}</script>
</body>
</html>`;
}

/**
 * Generate export filename.
 * Format: pkc2-{slug}-{YYYYMMDD}.html
 */
export function generateExportFilename(container: Container, override?: string): string {
  if (override) return `${override}.html`;

  const slug = slugify(container.meta.title || container.meta.container_id);
  const date = formatDateCompact(new Date());
  return `pkc2-${slug}-${date}.html`;
}

/**
 * Execute the full export: build HTML, trigger download.
 * Returns ExportResult with outcome details.
 *
 * @param downloadFn - Override for testing. Defaults to triggerDownload.
 */
export async function exportContainerAsHtml(
  container: Container,
  options?: ExportOptions & { downloadFn?: (content: string, filename: string) => void },
): Promise<ExportResult> {
  try {
    const mode = options?.mode ?? 'full';
    const mutability = options?.mutability ?? 'editable';
    const html = await buildExportHtml(container, mode, mutability);
    const filename = generateExportFilename(container, options?.filename);

    const download = options?.downloadFn ?? triggerDownload;
    download(html, filename);

    return {
      success: true,
      filename,
      size: html.length,
    };
  } catch (e) {
    return {
      success: false,
      filename: '',
      size: 0,
      error: String(e),
    };
  }
}

// ── Internal helpers ────────────────────────

function triggerDownload(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();

  // Cleanup after a tick
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\u3000-\u9fff\uff00-\uffef]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'untitled';
}

function formatDateCompact(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}
