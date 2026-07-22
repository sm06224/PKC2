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
import { compressAssets, compressToBase64, isCompressionSupported } from './compression';
import { slugify, formatDateCompact } from './zip-package';
import {
  hydrateForExport,
  hydratePendingBodiesForExport,
  collectExportAssetKeys,
  loadExportAsset,
} from './idb-store';

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
 * Escape </script> inside JSON to prevent premature script tag closure in
 * HTML. This is a standard HTML-in-script safety measure.
 */
function escapeScriptClose(json: string): string {
  return json.replace(/<\/(script)/gi, '<\\/$1');
}

/**
 * 骨格 JSON 内で assets object の位置を示す placeholder。JSON 文字列値の
 * 内側では `"` が `\"` へ escape されるため、`"assets": "<この値>"` という
 * 生の並びは entry body 等に同じ文字列が含まれていても衝突しない。
 */
const ASSETS_SPLIT_TOKEN = '__PKC_ASSETS_SPLIT_POINT__';

/**
 * Build the pkc-data JSON for a Container, as an ordered list of string
 * parts whose concatenation is the JSON document.
 * Shape: { container, export_meta } — matches readPkcData() contract.
 *
 * parts 化の理由(#960): 数百 MB 級の asset(画面収録等)を持つ
 * container を 1 本の JS 文字列に stringify すると V8 の文字列長上限
 * (~512MB)で `RangeError: Invalid string length` になり、**バックアップ
 * (エクスポート)が不可能になる**。骨格(entries / revisions / meta)
 * だけを stringify し、asset は 1 件 = 1 part で差し込むことで、個々の
 * 文字列を最大 asset 1 件ぶんに抑える。結合は `new Blob(parts)` に任せる
 * (Blob は文字列長上限の外)。
 *
 * Light mode: strips container.assets to {}, adds export_meta.mode = 'light'.
 * Full mode: compresses assets (gzip+base64), adds export_meta with asset_encoding.
 * Mutability: 'editable' (default) or 'readonly' (view-only with rehydrate).
 */
export async function serializePkcDataParts(
  container: Container,
  mode: ExportMode = 'full',
  mutability: ExportMutability = 'editable',
): Promise<string[]> {
  const exportMeta: ExportMeta = { mode, mutability };

  if (mode === 'light') {
    const json = JSON.stringify(
      { container: { ...container, assets: {} }, export_meta: exportMeta },
      null,
      2,
    );
    return [escapeScriptClose(json)];
  }

  // 段階3 (#868): `container.assets` may be a partial working-set at
  // runtime. Hydrate the referenced bytes from the store before
  // compressing, or a full export would silently drop every
  // non-resident asset (data loss). No-op when no store is registered
  // (tests with fully-resident containers) or assets are all resident.
  const hydrated = await hydrateForExport(container);
  // Full mode: compress assets for size efficiency
  const { assets: compressedAssets, encoding } = await compressAssets(hydrated.assets);
  exportMeta.asset_encoding = encoding;

  const skeleton = JSON.stringify(
    {
      container: { ...hydrated, assets: ASSETS_SPLIT_TOKEN as unknown as Record<string, string> },
      export_meta: exportMeta,
    },
    null,
    2,
  );
  const token = `"${ASSETS_SPLIT_TOKEN}"`;
  const splitAt = skeleton.indexOf(token);
  if (splitAt < 0) {
    // 起こり得ないが、防御的に従来の単一文字列 stringify へ fallback
    const json = JSON.stringify(
      { container: { ...hydrated, assets: compressedAssets }, export_meta: exportMeta },
      null,
      2,
    );
    return [escapeScriptClose(json)];
  }

  const parts: string[] = [escapeScriptClose(skeleton.slice(0, splitAt)), '{'];
  let first = true;
  for (const [key, value] of Object.entries(compressedAssets)) {
    // asset 値は base64 / gzip+base64(いずれも base64 文字集合)なので
    // JSON escape も </script> escape も不要 — そのまま 1 part で差し込む。
    parts.push(`${first ? '' : ','}\n      ${JSON.stringify(key)}: "`);
    parts.push(value);
    parts.push('"');
    first = false;
  }
  parts.push(first ? '}' : '\n    }');
  parts.push(escapeScriptClose(skeleton.slice(splitAt + token.length)));
  return parts;
}

/**
 * 単一文字列版(後方互換)。小さい container(embed transport の
 * export-handler / tests)向け。巨大 container では文字列長上限に
 * 当たり得るため、download 経路は parts 版を使うこと。
 */
export async function serializePkcData(
  container: Container,
  mode: ExportMode = 'full',
  mutability: ExportMutability = 'editable',
): Promise<string> {
  return (await serializePkcDataParts(container, mode, mutability)).join('');
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
function readHtmlEnvelope(container: Container): { head: string; tail: string } {
  // Read from live DOM
  const coreEl = document.getElementById(SLOT.CORE);
  const stylesEl = document.getElementById(SLOT.STYLES);
  const themeEl = document.getElementById(SLOT.THEME);
  const metaEl = document.getElementById(SLOT.META);
  const htmlEl = document.documentElement;

  const code = coreEl?.textContent ?? '';
  const styles = stylesEl?.textContent ?? '';
  const theme = themeEl?.textContent ?? '/* theme overrides */';

  // PR-OO (2026-05-06): snapshot the live `#pkc-root` element's
  // applied theme — `data-pkc-theme` (light / dark) attribute and
  // the inline style block carrying `--c-accent` / `--c-bg` /
  // `--c-fg` overrides. Exporting these inline lets the imported
  // HTML render in the user's theme on the **first paint**, before
  // the JS boot runs `RESTORE_SETTINGS` from the `__settings__`
  // entry. Without this, exports flashed default theme briefly,
  // and on `light` source mode (boot suppressed) the override
  // values were never re-applied at all — user report:
  // 「テーマカラー Export 修正」.
  const rootEl = document.getElementById('pkc-root');
  const rootThemeAttr = rootEl?.getAttribute('data-pkc-theme') ?? null;
  const rootStyle = rootEl?.getAttribute('style') ?? null;
  const rootThemeFragment = rootThemeAttr
    ? ` data-pkc-theme="${escapeAttr(rootThemeAttr)}"`
    : '';
  const rootStyleFragment = rootStyle
    ? ` style="${escapeAttr(rootStyle)}"`
    : '';

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

  // Assemble HTML matching shell.html contract
  const head = `<!DOCTYPE html>
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
  <div id="pkc-root"${rootThemeFragment}${rootStyleFragment}></div>

  <script id="pkc-data" type="application/json">`;
  const tail = `</script>

  <script id="pkc-meta" type="application/json">${metaJson}</script>

  <script id="pkc-core">${code}</script>
</body>
</html>`;
  return { head, tail };
}

export async function buildExportHtmlParts(
  container: Container,
  mode: ExportMode = 'full',
  mutability: ExportMutability = 'editable',
): Promise<string[]> {
  const { head, tail } = readHtmlEnvelope(container);
  // #960: 巨大 asset を単一文字列へ連結しないよう parts のまま HTML へ
  // 差し込む。
  const dataParts = await serializePkcDataParts(container, mode, mutability);
  return [head, ...dataParts, tail];
}

/**
 * #962: chunk 折り畳みの閾値。この分量の文字列 part が貯まるたびに
 * `new Blob(parts)` へ畳み、JS ヒープ上の文字列参照を手放す(ブラウザの
 * Blob storage はメモリ圧下でディスクへ page out できる)。
 */
const BLOB_FOLD_BYTES = 64 * 1024 * 1024;

/**
 * #966: gzip 圧縮を適用してよい container の条件 — 全 attachment の宣言
 * サイズがこの値以下であること。`compressToBase64` は 1 asset につき
 * 「base64 原文 → バイナリ文字列 → バイト配列 → 圧縮結果 → 再 base64」
 * の一時コピーを同時に持つため、数百 MB 級 asset では 1 件で GB 級の
 * ピークになり OOM する。画面収録などの巨大 asset は既に圧縮済み形式
 * (webm / mp4 等)で gzip の削減効果もほぼ無い。`asset_encoding` は
 * artifact 全体で 1 つ(後方互換の import 契約)なので、巨大 asset を
 * 1 つでも含む container は **全体を無圧縮 base64** で書き出す ── asset
 * は store の文字列をそのまま part にでき、per-asset の追加コピーがゼロに
 * なる。
 */
const EXPORT_COMPRESS_MAX_BYTES = 8 * 1024 * 1024;

/** entry 宣言サイズに EXPORT_COMPRESS_MAX_BYTES 超の attachment があるか。
 * P0(#967)で UI(begin-export の ZIP 誘導 toast)からも参照される。 */
export function containerHasLargeAsset(container: Container): boolean {
  for (const e of container.entries) {
    if (e.archetype !== 'attachment') continue;
    try {
      const body = JSON.parse(e.body) as { size?: unknown };
      if (typeof body.size === 'number' && body.size > EXPORT_COMPRESS_MAX_BYTES) return true;
    } catch { /* 破損 body は無視(サイズ不明 = 小さい扱い) */ }
  }
  return false;
}

/**
 * #962: streaming Blob 版の export ビルダー(download 経路の正)。
 *
 * #960 の parts 化で「単一文字列の長さ上限」は越えたが、従来経路は
 * (1) 全 asset を hydrate で 1 つの Record に格納 → (2) 圧縮版をもう
 * 1 セット構築 → (3) Blob へコピー、と **データセット総量の数倍**を
 * 同時にヒープへ載せるため、数 GB 級 container では OOM した(user 報告
 * 「エクスポート中に OOM になります」)。本関数は asset を **1 件ずつ**
 * 「store 読み → 圧縮 → part 追加」し、`foldBytes` ごとに Blob へ畳んで
 * 文字列を解放する ── peak は「畳み閾値 + 最大 asset 1 件の作業量」に
 * 有界で、総量に比例しない。
 */
export async function buildExportBlob(
  container: Container,
  mode: ExportMode = 'full',
  mutability: ExportMutability = 'editable',
  opts?: { foldBytes?: number },
): Promise<Blob> {
  const { head, tail } = readHtmlEnvelope(container);
  const foldBytes = opts?.foldBytes ?? BLOB_FOLD_BYTES;
  const chunks: BlobPart[] = [];
  let cur: string[] = [];
  let curBytes = 0;
  const push = (s: string): void => {
    cur.push(s);
    curBytes += s.length;
    if (curBytes >= foldBytes) {
      chunks.push(new Blob(cur));
      cur = [];
      curBytes = 0;
    }
  };

  push(head);
  const exportMeta: ExportMeta = { mode, mutability };
  if (mode === 'light') {
    push(escapeScriptClose(JSON.stringify(
      { container: { ...container, assets: {} }, export_meta: exportMeta },
      null,
      2,
    )));
  } else {
    // #940 段階4 の body barrier(asset には触れない版)。
    const withBodies = await hydratePendingBodiesForExport(container);
    const keys = collectExportAssetKeys(withBodies);
    // #966: 巨大 asset を含む container は無圧縮(素通し)で書き出す。
    const encoding: 'base64' | 'gzip+base64' =
      isCompressionSupported() && keys.length > 0 && !containerHasLargeAsset(withBodies)
        ? 'gzip+base64'
        : 'base64';
    exportMeta.asset_encoding = encoding;
    const skeleton = JSON.stringify(
      {
        container: { ...withBodies, assets: ASSETS_SPLIT_TOKEN as unknown as Record<string, string> },
        export_meta: exportMeta,
      },
      null,
      2,
    );
    const token = `"${ASSETS_SPLIT_TOKEN}"`;
    const splitAt = skeleton.indexOf(token);
    if (splitAt < 0) {
      // 起こり得ないが、防御的に従来経路(全 hydrate)へ fallback
      for (const p of await serializePkcDataParts(container, mode, mutability)) push(p);
    } else {
      push(escapeScriptClose(skeleton.slice(0, splitAt)));
      push('{');
      let first = true;
      for (const key of keys) {
        // 1 件ずつ: resident 優先 → store 直読み。読めない key は従来
        // どおり export に含めない(参照は broken のまま)。
        const raw = await loadExportAsset(withBodies, key);
        if (raw == null) continue;
        const value = encoding === 'gzip+base64' ? await compressToBase64(raw) : raw;
        push(`${first ? '' : ','}\n      ${JSON.stringify(key)}: "`);
        push(value);
        push('"');
        first = false;
      }
      push(first ? '}' : '\n    }');
      push(escapeScriptClose(skeleton.slice(splitAt + token.length)));
    }
  }
  push(tail);
  if (cur.length > 0) chunks.push(new Blob(cur));
  return new Blob(chunks, { type: 'text/html;charset=utf-8' });
}

/**
 * 単一文字列版(後方互換)。embed transport の export-handler / tests
 * 向け。巨大 container では parts 版 + Blob を使うこと(#960)。
 */
export async function buildExportHtml(
  container: Container,
  mode: ExportMode = 'full',
  mutability: ExportMutability = 'editable',
): Promise<string> {
  return (await buildExportHtmlParts(container, mode, mutability)).join('');
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
  options?: ExportOptions & {
    downloadFn?: (content: Blob, filename: string) => void;
  },
): Promise<ExportResult> {
  try {
    const mode = options?.mode ?? 'full';
    const mutability = options?.mutability ?? 'editable';
    // #960/#962: 単一文字列(V8 の string 長上限)も全量同時保持(OOM)も
    // 避ける streaming Blob 経路。
    const blob = await buildExportBlob(container, mode, mutability);
    const filename = generateExportFilename(container, options?.filename);

    const download = options?.downloadFn ?? triggerDownload;
    download(blob, filename);

    return {
      success: true,
      filename,
      size: blob.size,
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

function triggerDownload(content: Blob | string | readonly string[], filename: string): void {
  // parts / Blob のまま扱う — Blob は JS 文字列長上限の外で結合される(#960)
  const blob = content instanceof Blob
    ? content
    : new Blob(
      Array.isArray(content) ? (content as string[]) : [content as string],
      { type: 'text/html;charset=utf-8' },
    );
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();

  // Cleanup after a tick
  setTimeout(() => {
    if (typeof document !== 'undefined') {
      document.body.removeChild(a);
    }
    URL.revokeObjectURL(url);
  }, 100);
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
