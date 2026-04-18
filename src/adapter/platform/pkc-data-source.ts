import { SLOT } from '../../runtime/contract';
import { decompressAssets } from './compression';
import type { Container } from '../../core/model/container';
import { hasUserContent } from '../../core/model/container';
import { isSystemArchetype, type Entry } from '../../core/model/record';

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
  /**
   * system-* entries extracted from `container`. These represent the
   * authoritative, build-time view of About / Settings / … and must be
   * merged onto IDB / empty boot containers so those views always
   * reflect the current build, never a stale IDB snapshot.
   *
   * Optional so test fixtures that predate this field keep compiling.
   * Production code always derives it from `container.entries` in
   * `readPkcData`, and consumers treat an absent value as empty.
   */
  systemEntries?: Entry[];
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

  // Note: system-only pkc-data payloads (no user content) are NOT
  // rejected here. They carry authoritative system entries (About /
  // Settings) that must still be merged onto the boot container even
  // when IDB wins the boot-source vote. The user-content check is
  // deferred to chooseBootSource which gates boot source selection.

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

  const systemEntries = container.entries.filter((e) => isSystemArchetype(e.archetype));
  return { container, readonly: isReadonly, lightSource: isLight, systemEntries };
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
  /**
   * Authoritative system-* entries from pkc-data, to be merged onto
   * the chosen boot container. For 'pkc-data' source these are already
   * in the container; for 'idb' / 'empty' sources the caller must
   * merge them in. Optional so test fixtures that predate this field
   * keep compiling; treat absent / empty as "nothing to merge".
   */
  systemEntriesFromPkcData?: Entry[];
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
 * Policy (revised 2026-04-18, system-entry isolation):
 *   1. pkc-data has user content AND IDB both present → 'chooser'
 *   2. pkc-data has user content only → 'pkc-data' (viewOnlySource=true)
 *   3. IDB only (or pkc-data is system-only) → 'idb'
 *   4. Neither (or pkc-data is system-only and no IDB) → 'empty'
 *
 * "User content" means at least one entry whose archetype is NOT
 * system-*. A pkc-data payload that only contains About / Settings
 * must not lock the session into view-only mode, so it is ignored for
 * the boot-source vote. However, its system entries are surfaced via
 * `systemEntriesFromPkcData` so the caller can merge them onto the
 * chosen boot container — this keeps About always reflecting the
 * current build, even when IDB wins the vote.
 *
 * Pure function: no DOM, no IDB, no side effects. Reads no globals.
 */
export function chooseBootSource(
  pkcData: PkcDataResult | null,
  idbContainer: Container | null,
): BootSource {
  const systemEntriesFromPkcData: Entry[] = pkcData?.systemEntries ?? [];
  const pkcDataHasUserContent = pkcData ? hasUserContent(pkcData.container) : false;

  if (pkcDataHasUserContent && idbContainer) {
    return {
      source: 'chooser',
      container: null,
      readonly: false,
      lightSource: false,
      viewOnlySource: false,
      systemEntriesFromPkcData,
      pkcData,
      idbContainer,
    };
  }
  if (pkcDataHasUserContent) {
    return {
      source: 'pkc-data',
      container: pkcData!.container,
      readonly: pkcData!.readonly,
      lightSource: pkcData!.lightSource,
      // Critical: pkc-data boots are view-only by policy. Persistence
      // refuses to save this container until the user explicitly
      // imports (which clears the flag via SYS_IMPORT_COMPLETE /
      // CONFIRM_IMPORT reducer cases).
      viewOnlySource: true,
      systemEntriesFromPkcData,
    };
  }
  if (idbContainer) {
    return {
      source: 'idb',
      container: idbContainer,
      readonly: false,
      lightSource: false,
      viewOnlySource: false,
      systemEntriesFromPkcData,
    };
  }
  return {
    source: 'empty',
    container: null,
    readonly: false,
    lightSource: false,
    viewOnlySource: false,
    systemEntriesFromPkcData,
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
  const systemEntriesFromPkcData: Entry[] = pkcData.systemEntries ?? [];
  if (choice === 'pkc-data') {
    return {
      source: 'pkc-data',
      container: pkcData.container,
      readonly: pkcData.readonly,
      lightSource: pkcData.lightSource,
      viewOnlySource: true,
      systemEntriesFromPkcData,
    };
  }
  return {
    source: 'idb',
    container: idbContainer,
    readonly: false,
    lightSource: false,
    viewOnlySource: false,
    systemEntriesFromPkcData,
  };
}
