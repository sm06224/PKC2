/**
 * HTML Importer: extract and validate Container from a PKC2 HTML artifact.
 *
 * Responsibility:
 * - Parse PKC2 HTML string (exported or built artifact)
 * - Extract pkc-meta and pkc-data from the parsed document
 * - Validate app identity, schema version, and Container shape
 * - Return the validated Container or structured error
 *
 * Design decisions:
 * - Uses DOMParser (browser API) — lives in adapter/platform
 * - Does NOT execute any scripts from the imported HTML
 * - Validates minimum required structure, not full deep validation
 * - Returns structured ImportResult for clear error handling
 * - Supports both string input (for testing) and File input (for UI)
 *
 * This module does NOT:
 * - Modify the current runtime state (caller dispatches)
 * - Access IDB or persistence
 * - Merge containers (full replacement only)
 */

import type { Container } from '../../core/model/container';
import type { ExportMode, ExportMutability } from '../../core/action/user-action';
import type { ExportMeta } from './exporter';
import type { ReleaseMeta } from '../../runtime/release-meta';
import { APP_ID, SCHEMA_VERSION } from '../../runtime/release-meta';
import { decompressAssets } from './compression';

// ── Result types ────────────────────────

export type ImportErrorCode =
  | 'PARSE_ERROR'
  | 'MISSING_PKC_DATA'
  | 'MISSING_PKC_META'
  | 'INVALID_APP_ID'
  | 'SCHEMA_MISMATCH'
  | 'INVALID_CONTAINER'
  | 'FILE_READ_ERROR';

export interface ImportError {
  code: ImportErrorCode;
  message: string;
}

export interface ImportSuccess {
  ok: true;
  container: Container;
  meta: ReleaseMeta;
  source: string;
  /** Export mode of the imported file, if present. */
  exportMode?: ExportMode;
  /** Export mutability of the imported file, if present. */
  exportMutability?: ExportMutability;
}

export interface ImportFailure {
  ok: false;
  errors: ImportError[];
}

export type ImportResult = ImportSuccess | ImportFailure;

// ── Main API ────────────────────────

/**
 * Parse and validate a PKC2 HTML string.
 * Returns ImportResult with either the validated Container or structured errors.
 * Async because gzip+base64 assets require decompression.
 */
export async function importFromHtml(html: string, source?: string): Promise<ImportResult> {
  // 1. Parse HTML
  let doc: Document;
  try {
    const parser = new DOMParser();
    doc = parser.parseFromString(html, 'text/html');
  } catch {
    return fail([{ code: 'PARSE_ERROR', message: 'Failed to parse HTML' }]);
  }

  // Check for parser errors
  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    return fail([{ code: 'PARSE_ERROR', message: 'HTML parse error detected' }]);
  }

  // 2. Extract pkc-meta
  const metaEl = doc.getElementById('pkc-meta');
  if (!metaEl) {
    return fail([{ code: 'MISSING_PKC_META', message: 'Element #pkc-meta not found' }]);
  }

  let meta: ReleaseMeta;
  try {
    const raw = metaEl.textContent?.trim();
    if (!raw || raw === '{}') {
      return fail([{ code: 'MISSING_PKC_META', message: 'pkc-meta is empty' }]);
    }
    meta = JSON.parse(raw) as ReleaseMeta;
  } catch {
    return fail([{ code: 'MISSING_PKC_META', message: 'pkc-meta contains invalid JSON' }]);
  }

  // 3. Validate app identity
  const errors: ImportError[] = [];

  if (meta.app !== APP_ID) {
    errors.push({
      code: 'INVALID_APP_ID',
      message: `Expected app "${APP_ID}", got "${meta.app}"`,
    });
  }

  // 4. Validate schema version
  if (meta.schema !== SCHEMA_VERSION) {
    errors.push({
      code: 'SCHEMA_MISMATCH',
      message: `Expected schema ${SCHEMA_VERSION}, got ${meta.schema}`,
    });
  }

  if (errors.length > 0) return fail(errors);

  // 5. Extract pkc-data
  const dataEl = doc.getElementById('pkc-data');
  if (!dataEl) {
    return fail([{ code: 'MISSING_PKC_DATA', message: 'Element #pkc-data not found' }]);
  }

  let container: Container;
  let exportMeta: ExportMeta | undefined;
  try {
    const raw = dataEl.textContent?.trim();
    if (!raw || raw === '{}') {
      return fail([{ code: 'MISSING_PKC_DATA', message: 'pkc-data is empty' }]);
    }
    // Unescape <\/script> that was escaped during export
    const unescaped = raw.replace(/<\\\/script>/gi, '</script>');
    const data = JSON.parse(unescaped);
    if (!data.container) {
      return fail([{ code: 'INVALID_CONTAINER', message: 'pkc-data missing "container" key' }]);
    }
    container = data.container as Container;
    // Read export_meta if present
    if (data.export_meta && typeof data.export_meta.mode === 'string') {
      exportMeta = {
        mode: data.export_meta.mode,
        mutability: typeof data.export_meta.mutability === 'string'
          ? data.export_meta.mutability
          : 'editable',
        asset_encoding: typeof data.export_meta.asset_encoding === 'string'
          ? data.export_meta.asset_encoding
          : undefined,
      };
    }
  } catch {
    return fail([{ code: 'MISSING_PKC_DATA', message: 'pkc-data contains invalid JSON' }]);
  }

  // 6. Validate Container minimum shape
  const shapeErrors = validateContainerShape(container);
  if (shapeErrors.length > 0) return fail(shapeErrors);

  // 7. Normalize optional arrays (backward compatibility with older exports)
  if (!Array.isArray(container.revisions)) {
    container = { ...container, revisions: [] };
  }

  // 8. Decompress assets if needed (gzip+base64 → base64 for IDB storage)
  if (container.assets && Object.keys(container.assets).length > 0) {
    const decompressed = await decompressAssets(container.assets, exportMeta?.asset_encoding);
    container = { ...container, assets: decompressed };
  }

  return {
    ok: true,
    container,
    meta,
    source: source ?? 'html-string',
    exportMode: exportMeta?.mode,
    exportMutability: exportMeta?.mutability,
  };
}

/**
 * Read a File and import its content.
 * Wraps FileReader in a Promise for async use.
 */
export async function importFromFile(file: File): Promise<ImportResult> {
  let html: string;
  try {
    html = await file.text();
  } catch {
    return fail([{ code: 'FILE_READ_ERROR', message: `Failed to read file: ${file.name}` }]);
  }

  return importFromHtml(html, file.name);
}

/**
 * Format import errors for display.
 */
export function formatImportErrors(errors: ImportError[]): string {
  return errors.map((e) => `[${e.code}] ${e.message}`).join('\n');
}

// ── Internal helpers ────────────────────────

function fail(errors: ImportError[]): ImportFailure {
  return { ok: false, errors };
}

/**
 * Validate minimum Container shape.
 * Does not deep-validate all fields, just checks required structure exists.
 */
function validateContainerShape(c: unknown): ImportError[] {
  const errors: ImportError[] = [];
  const obj = c as Record<string, unknown>;

  if (!obj || typeof obj !== 'object') {
    errors.push({ code: 'INVALID_CONTAINER', message: 'Container is not an object' });
    return errors;
  }

  // meta
  if (!obj.meta || typeof obj.meta !== 'object') {
    errors.push({ code: 'INVALID_CONTAINER', message: 'Container.meta is missing or invalid' });
  } else {
    const meta = obj.meta as Record<string, unknown>;
    if (typeof meta.container_id !== 'string') {
      errors.push({ code: 'INVALID_CONTAINER', message: 'Container.meta.container_id is missing' });
    }
    if (typeof meta.title !== 'string') {
      errors.push({ code: 'INVALID_CONTAINER', message: 'Container.meta.title is missing' });
    }
  }

  // entries
  if (!Array.isArray(obj.entries)) {
    errors.push({ code: 'INVALID_CONTAINER', message: 'Container.entries is missing or not an array' });
  }

  // relations
  if (!Array.isArray(obj.relations)) {
    errors.push({ code: 'INVALID_CONTAINER', message: 'Container.relations is missing or not an array' });
  }

  // revisions (optional but must be array if present)
  if (obj.revisions !== undefined && !Array.isArray(obj.revisions)) {
    errors.push({ code: 'INVALID_CONTAINER', message: 'Container.revisions is not an array' });
  }

  return errors;
}
