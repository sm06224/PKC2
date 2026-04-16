import { SLOT } from '../../runtime/contract';
import { decompressAssets } from './compression';
import type { Container } from '../../core/model/container';

/**
 * pkc-data source — reads the Container embedded in the exported HTML
 * file's `#pkc-data` script element.
 *
 * Extracted from `main.ts` so the read path is testable in isolation
 * and so the boot-priority decision (pkc-data vs IDB) can be unit-tested.
 *
 * The boot priority itself lives in `main.ts` and is expressed by
 * `chooseBootSource()` below:
 *
 *   1. pkc-data (exported HTML embedded content) — wins if non-empty
 *   2. IDB default container — wins if pkc-data is absent / empty
 *   3. Empty container — final fallback
 *
 * Rationale: opening an exported HTML should show the **exported
 * snapshot**, not whatever happens to live in the current browser's
 * IndexedDB from a previous session. Prior to this change IDB won
 * unconditionally, which made exported HTMLs unusable as a way to
 * hand off a snapshot (the receiver saw their own local content).
 */

export interface PkcDataResult {
  container: Container;
  readonly: boolean;
  lightSource: boolean;
}

/**
 * Read the `#pkc-data` element and parse it into a Container.
 *
 * Returns `null` when:
 *   - the element is absent
 *   - the element is empty or the canonical empty payload `{}`
 *   - parsing fails (malformed JSON, missing `container` key)
 *
 * Errors are swallowed so the caller can fall back to IDB instead of
 * crashing the whole boot. Structural failures are logged at `warn`.
 */
export async function readPkcData(): Promise<PkcDataResult | null> {
  const dataEl = typeof document !== 'undefined'
    ? document.getElementById(SLOT.DATA)
    : null;
  const raw = dataEl?.textContent?.trim();
  if (!raw || raw === '{}') return null;

  let data: { container?: Container; export_meta?: { mutability?: string; mode?: string; asset_encoding?: string } };
  try {
    data = JSON.parse(raw);
  } catch (err) {
    console.warn('[PKC2] pkc-data JSON parse failed, ignoring:', err);
    return null;
  }
  if (!data.container) return null;

  const isReadonly = data.export_meta?.mutability === 'readonly';
  const isLight = data.export_meta?.mode === 'light';

  let container = data.container;

  // Decompress assets if they were compressed during export
  // (gzip+base64). Without this, compressed assets stored as-is would
  // be unreadable.
  const assetEncoding = data.export_meta?.asset_encoding;
  if (
    assetEncoding === 'gzip+base64'
    && container.assets
    && Object.keys(container.assets).length > 0
  ) {
    try {
      container = { ...container, assets: await decompressAssets(container.assets, assetEncoding) };
    } catch (err) {
      console.warn('[PKC2] pkc-data asset decompress failed:', err);
      return null;
    }
  }

  return { container, readonly: isReadonly, lightSource: isLight };
}

/**
 * Boot source descriptor returned by `chooseBootSource`.
 */
export interface BootSource {
  source: 'pkc-data' | 'idb' | 'empty';
  container: Container | null;
  readonly: boolean;
  lightSource: boolean;
}

/**
 * Decide which Container to boot from.
 *
 * Priority (new as of this change):
 *   1. pkc-data (exported HTML) — if non-empty, wins over IDB
 *   2. IDB default container — used only when pkc-data is absent
 *   3. Empty — caller builds an empty Container when both above fail
 *
 * Pure function: no DOM, no IDB, no side effects. Reads no globals.
 */
export function chooseBootSource(
  pkcData: PkcDataResult | null,
  idbContainer: Container | null,
): BootSource {
  if (pkcData) {
    return {
      source: 'pkc-data',
      container: pkcData.container,
      readonly: pkcData.readonly,
      lightSource: pkcData.lightSource,
    };
  }
  if (idbContainer) {
    return {
      source: 'idb',
      container: idbContainer,
      readonly: false,
      lightSource: false,
    };
  }
  return {
    source: 'empty',
    container: null,
    readonly: false,
    lightSource: false,
  };
}
