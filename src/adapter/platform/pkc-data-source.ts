import { SLOT } from '../../runtime/contract';
import { decompressAssets } from './compression';
import type { Container } from '../../core/model/container';
import { hasUserContent } from '../../core/model/container';

/**
 * pkc-data source — reads the Container embedded in the exported HTML
 * file's `#pkc-data` script element.
 *
 * Extracted from `main.ts` so the read path is testable in isolation
 * and so the boot-priority decision (pkc-data vs IDB) can be unit-tested.
 *
 * ── Policy revision (2026-04-16, see `boot-container-source-policy-
 * revision.md`) ────────────────────────────────────────────────────
 *
 * The boot priority is now:
 *
 *   1. pkc-data AND IDB both present → 'chooser' (caller must show a
 *      modal and re-resolve via `finalizeChooserChoice`)
 *   2. pkc-data only → 'pkc-data' (viewOnlySource=true, no IDB save)
 *   3. IDB only → 'idb'
 *   4. Neither → 'empty'
 *
 * The critical new invariant is `viewOnlySource`: a container booted
 * from embedded pkc-data is a **view-only snapshot**. The session may
 * edit in memory, but the persistence layer refuses to write it back
 * to IndexedDB. Promotion to a writable / persistable workspace
 * requires an explicit Import operation (`CONFIRM_IMPORT` →
 * `CONTAINER_IMPORTED` event, which clears `viewOnlySource`).
 *
 * Rationale: opening an exported HTML "just to look" used to silently
 * expand that container into IndexedDB, contaminating the receiver's
 * local state forever. The prior fix (S-24) flipped the priority so
 * the HTML's content would at least be visible; this revision closes
 * the remaining hole — the visibility fix alone still let the embedded
 * container overwrite IDB on the very first save trigger.
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

  // System-entry isolation: a pkc-data payload that contains only
  // system-* entries (about / settings) carries no user content. Treat
  // it as absent so the boot-source decision falls through to IDB (if
  // any) or 'empty', instead of locking the session into view-only mode
  // and suppressing IDB writes. See `docs/spec/about-build-info-hidden-
  // entry-v1-behavior-contract.md` §I-ABOUT-7 and `docs/spec/system-
  // settings-hidden-entry-v1-behavior-contract.md` §I-SETTINGS-3 — both
  // exports continue to include the system entries; this gate only
  // affects the *boot-source decision*, not what is exported.
  if (!hasUserContent(data.container)) return null;

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
 *
 * When `source === 'chooser'`, `container` is `null` and the caller
 * MUST present a UI chooser and then call `finalizeChooserChoice` with
 * the stashed `pkcData` / `idbContainer` to get a concrete boot source.
 *
 * `viewOnlySource === true` iff the container was sourced from
 * pkc-data. Persistence reads this flag to suppress IDB writes.
 */
export interface BootSource {
  source: 'pkc-data' | 'idb' | 'empty' | 'chooser';
  container: Container | null;
  readonly: boolean;
  lightSource: boolean;
  viewOnlySource: boolean;
  /** Only set when source === 'chooser'. Stashed for finalizeChooserChoice. */
  pkcData?: PkcDataResult | null;
  /** Only set when source === 'chooser'. Stashed for finalizeChooserChoice. */
  idbContainer?: Container | null;
}

/**
 * User choice returned from the chooser UI.
 */
export type ChooserChoice = 'pkc-data' | 'idb';

/**
 * Decide which Container to boot from.
 *
 * Policy (revised 2026-04-16):
 *   1. pkc-data AND IDB both present → 'chooser' (caller shows UI)
 *   2. pkc-data only → 'pkc-data' (viewOnlySource=true)
 *   3. IDB only → 'idb'
 *   4. Neither → 'empty'
 *
 * Pure function: no DOM, no IDB, no side effects. Reads no globals.
 */
export function chooseBootSource(
  pkcData: PkcDataResult | null,
  idbContainer: Container | null,
): BootSource {
  if (pkcData && idbContainer) {
    return {
      source: 'chooser',
      container: null,
      readonly: false,
      lightSource: false,
      viewOnlySource: false,
      pkcData,
      idbContainer,
    };
  }
  if (pkcData) {
    return {
      source: 'pkc-data',
      container: pkcData.container,
      readonly: pkcData.readonly,
      lightSource: pkcData.lightSource,
      // Critical: pkc-data boots are view-only by policy. Persistence
      // refuses to save this container until the user explicitly
      // imports (which clears the flag via SYS_IMPORT_COMPLETE /
      // CONFIRM_IMPORT reducer cases).
      viewOnlySource: true,
    };
  }
  if (idbContainer) {
    return {
      source: 'idb',
      container: idbContainer,
      readonly: false,
      lightSource: false,
      viewOnlySource: false,
    };
  }
  return {
    source: 'empty',
    container: null,
    readonly: false,
    lightSource: false,
    viewOnlySource: false,
  };
}

/**
 * Translate a chooser choice back into a concrete BootSource. Pure.
 *
 * Called after the caller has presented the chooser UI to the user
 * and captured their decision. The stashed `pkcData` / `idbContainer`
 * typically come from the `chooser` BootSource returned by the
 * initial `chooseBootSource` call, but are passed explicitly here so
 * the helper stays pure and directly unit-testable.
 */
export function finalizeChooserChoice(
  pkcData: PkcDataResult,
  idbContainer: Container,
  choice: ChooserChoice,
): BootSource {
  if (choice === 'pkc-data') {
    return {
      source: 'pkc-data',
      container: pkcData.container,
      readonly: pkcData.readonly,
      lightSource: pkcData.lightSource,
      viewOnlySource: true,
    };
  }
  return {
    source: 'idb',
    container: idbContainer,
    readonly: false,
    lightSource: false,
    viewOnlySource: false,
  };
}
