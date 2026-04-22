/**
 * Storage profile — read-only aggregation of asset byte-sizes
 * attributed to their owning entries and folder subtrees.
 *
 * Role in the capacity-warning stack:
 *   boot-time IDB banner  → availability
 *   preflight toast       → free-space trend
 *   save-failure banner   → actual write rejection
 *   storage profile (this) → *what to prune / export / split*
 *
 * The other three signals tell the user *that* storage is tight.
 * This module tells them *where the weight is*. It is pure,
 * side-effect-free, and does not mutate the container — callers
 * project the returned `StorageProfile` into a dialog.
 *
 * Sizing method:
 *   asset bytes = estimateBase64Size(container.assets[key])
 *
 *   base64 expansion is ~4/3, so the decoded byte-size is close to
 *   what the browser actually spends on that asset in IndexedDB
 *   (the serialised JSON still carries the base64 text, but that is
 *   the apples-to-apples quantity when we ask "which entry is
 *   heaviest").  The numbers are ESTIMATES — we do not probe IDB.
 *
 * Ownership (one owner per asset, for self-byte attribution):
 *   1. Attachment archetype — body JSON `asset_key` → owns that key.
 *      First attachment encountered wins (deterministic by
 *      entries[] order).
 *   2. Text / textlog fallback — `![..](asset:K)` /
 *      `[..](asset:K)` references to a not-yet-owned key make the
 *      referring entry the owner.
 *   3. Everything else → owns nothing.
 *
 * Reference counts (separate from ownership, informational):
 *   - Text / textlog entries also tally `referencedCount` for
 *     markdown refs they do NOT own (so the UI can show "5 other
 *     entries lean on this attachment's asset").
 *
 * Subtree rollup:
 *   - Folder entries aggregate `selfBytes` of all structural
 *     descendants via `collectDescendantLids`.
 *   - Non-folder entries have `subtreeBytes === selfBytes`.
 *
 * Orphan accounting:
 *   - Assets whose key is in `container.assets` but is not attributed
 *     to any owner contribute to `orphanBytes` / `orphanCount`. This
 *     mirrors `collectOrphanAssetKeys`, but with bytes rather than
 *     just identity.
 *
 * Non-goals:
 *   - No deletion, no export, no externalization — those are policy
 *     decisions left to separate UI issues.
 *   - No revision-snapshot accounting. Revisions freeze body text
 *     only; they do not own their own asset bytes.
 *   - No relation / meta sizing.
 */
import type { Container } from '../../core/model/container';
import type { Entry, ArchetypeId } from '../../core/model/record';
import { extractAssetReferences } from '../markdown/asset-resolver';
import { parseTextlogBody } from '../textlog/textlog-body';
import { collectDescendantLids } from '../relation/tree';
import { pad2 } from '../datetime/datetime-format';

/**
 * Decode-free base64 byte-size estimate.  Identical in semantics to
 * the adapter-layer `estimateSize` in `attachment-presenter.ts` but
 * lifted here so this features-layer module stays adapter-free.
 */
export function estimateBase64Size(base64: string): number {
  if (!base64) return 0;
  const padding = (base64.match(/=+$/) ?? [''])[0]!.length;
  return Math.floor((base64.length * 3) / 4) - padding;
}

export interface AssetSizeEntry {
  key: string;
  bytes: number;
}

export interface EntryStorageRow {
  lid: string;
  title: string;
  archetype: ArchetypeId;
  /** Number of assets directly owned for size attribution. */
  ownedCount: number;
  /**
   * Markdown-referenced assets (text / textlog) that this entry
   * does NOT own.  Informational — does not contribute bytes.
   */
  referencedCount: number;
  /** Bytes this entry contributes directly (owned assets only). */
  selfBytes: number;
  /**
   * Folder: `selfBytes` + sum of structural descendants' selfBytes.
   * Non-folder: equal to `selfBytes`.
   */
  subtreeBytes: number;
  /** Bytes of the single largest owned asset. */
  largestAssetBytes: number;
}

export interface StorageProfileSummary {
  /** Count of keys in `container.assets`. */
  assetCount: number;
  /** Sum of estimated bytes across all assets. */
  totalBytes: number;
  /** Key + bytes of the single largest asset, or null when empty. */
  largestAsset: AssetSizeEntry | null;
  /** Title of the entry that owns `largestAsset`, or null. */
  largestAssetOwnerTitle: string | null;
  /** Row with the largest `subtreeBytes`, or null when no rows. */
  largestEntry: EntryStorageRow | null;
}

export interface StorageProfile {
  summary: StorageProfileSummary;
  /** Sorted by `subtreeBytes` desc, ties broken by title asc. */
  rows: EntryStorageRow[];
  /** Bytes held by asset keys with no attributable owner. */
  orphanBytes: number;
  /** Count of asset keys with no attributable owner. */
  orphanCount: number;
}

/**
 * Compute the storage profile for a container.
 *
 * Pure — returns a fresh structure on each call; does not mutate
 * the input container.  Cost is O(entries + assets + markdown
 * scans); no memoisation is attempted, since the profile is
 * computed at dialog-open time only.
 */
export function buildStorageProfile(container: Container): StorageProfile {
  const assets = container.assets ?? {};
  // Pre-compute byte-sizes so we never decode twice.
  const assetBytes = new Map<string, number>();
  for (const [key, value] of Object.entries(assets)) {
    assetBytes.set(key, estimateBase64Size(value));
  }

  // Pass 1: attribute attachments (primary ownership).
  const owner = new Map<string, string>(); // assetKey -> lid
  for (const e of container.entries) {
    if (e.archetype !== 'attachment') continue;
    const key = readAttachmentAssetKey(e.body);
    if (key !== null && assetBytes.has(key) && !owner.has(key)) {
      owner.set(key, e.lid);
    }
  }
  // Pass 2: text / textlog markdown references claim any still-
  // unowned asset keys. Guard on assetBytes.has so missing refs
  // never become phantom owners.
  for (const e of container.entries) {
    if (e.archetype === 'text') {
      for (const k of extractAssetReferences(e.body)) {
        if (!owner.has(k) && assetBytes.has(k)) owner.set(k, e.lid);
      }
    } else if (e.archetype === 'textlog') {
      const parsed = parseTextlogBody(e.body);
      for (const log of parsed.entries) {
        if (typeof log.text !== 'string' || log.text.length === 0) continue;
        for (const k of extractAssetReferences(log.text)) {
          if (!owner.has(k) && assetBytes.has(k)) owner.set(k, e.lid);
        }
      }
    }
  }

  // Build one row per entry (keep empties; drop at sort stage).
  const rowsByLid = new Map<string, EntryStorageRow>();
  for (const e of container.entries) {
    rowsByLid.set(e.lid, {
      lid: e.lid,
      title: e.title,
      archetype: e.archetype,
      ownedCount: 0,
      referencedCount: 0,
      selfBytes: 0,
      subtreeBytes: 0,
      largestAssetBytes: 0,
    });
  }

  // Attribute owned bytes.
  for (const [key, lid] of owner) {
    const row = rowsByLid.get(lid);
    if (!row) continue;
    const bytes = assetBytes.get(key) ?? 0;
    row.ownedCount += 1;
    row.selfBytes += bytes;
    if (bytes > row.largestAssetBytes) row.largestAssetBytes = bytes;
  }

  // Informational: reference tallies for text / textlog entries.
  for (const e of container.entries) {
    if (e.archetype !== 'text' && e.archetype !== 'textlog') continue;
    const row = rowsByLid.get(e.lid);
    if (!row) continue;
    const refs = collectBodyAssetRefs(e);
    for (const k of refs) {
      if (!assetBytes.has(k)) continue;
      if (owner.get(k) !== e.lid) row.referencedCount += 1;
    }
  }

  // Subtree rollup for folders.
  for (const row of rowsByLid.values()) {
    if (row.archetype !== 'folder') {
      row.subtreeBytes = row.selfBytes;
      continue;
    }
    const descendants = collectDescendantLids(container.relations, row.lid);
    let sum = row.selfBytes;
    for (const descLid of descendants) {
      const descRow = rowsByLid.get(descLid);
      if (descRow) sum += descRow.selfBytes;
    }
    row.subtreeBytes = sum;
  }

  // Sort and filter: only surface rows that actually contribute
  // bytes.  Empty folders and caption-only text entries are noise in
  // a capacity-focused view.
  const rows = Array.from(rowsByLid.values())
    .filter((r) => r.subtreeBytes > 0)
    .sort((a, b) => {
      if (b.subtreeBytes !== a.subtreeBytes) return b.subtreeBytes - a.subtreeBytes;
      return a.title.localeCompare(b.title);
    });

  // Summary — single largest asset + its owner's title.
  let totalBytes = 0;
  let largestAsset: AssetSizeEntry | null = null;
  for (const [key, bytes] of assetBytes) {
    totalBytes += bytes;
    if (largestAsset === null || bytes > largestAsset.bytes) {
      largestAsset = { key, bytes };
    }
  }
  let largestAssetOwnerTitle: string | null = null;
  if (largestAsset) {
    const ownerLid = owner.get(largestAsset.key);
    if (ownerLid) {
      const ownerRow = rowsByLid.get(ownerLid);
      largestAssetOwnerTitle = ownerRow?.title ?? null;
    }
  }
  const largestEntry = rows.length > 0 ? (rows[0] ?? null) : null;

  // Orphan accounting.
  let orphanBytes = 0;
  let orphanCount = 0;
  for (const [key, bytes] of assetBytes) {
    if (!owner.has(key)) {
      orphanBytes += bytes;
      orphanCount += 1;
    }
  }

  return {
    summary: {
      assetCount: assetBytes.size,
      totalBytes,
      largestAsset,
      largestAssetOwnerTitle,
      largestEntry,
    },
    rows,
    orphanBytes,
    orphanCount,
  };
}

/**
 * CSV column order for the Storage Profile export. Must stay in
 * sync with `formatStorageProfileCsv`'s header and row order.
 *
 * Column meanings mirror the UI — see `EntryStorageRow`.
 */
export const STORAGE_PROFILE_CSV_COLUMNS = [
  'lid',
  'title',
  'archetype',
  'ownedCount',
  'referencedCount',
  'selfBytes',
  'subtreeBytes',
  'largestAssetBytes',
] as const;

/**
 * Render the Storage Profile as a CSV document (text, not Blob).
 *
 * - Row order = `profile.rows` (subtreeBytes desc, title asc tie-break).
 * - Prepends a UTF-8 BOM so Excel opens Japanese titles correctly.
 * - Uses CRLF line endings for maximum spreadsheet compatibility.
 * - Escapes comma / quote / newline per RFC 4180 (fields containing
 *   any of those are wrapped in double quotes; literal quotes are
 *   doubled).
 *
 * Pure — no DOM, no Blob construction. Callers wrap the returned
 * string in a Blob for download.
 */
export function formatStorageProfileCsv(profile: StorageProfile): string {
  const BOM = '\uFEFF';
  const CRLF = '\r\n';
  const headerLine = STORAGE_PROFILE_CSV_COLUMNS.join(',');
  const lines: string[] = [headerLine];
  for (const row of profile.rows) {
    lines.push(
      [
        csvEscape(row.lid),
        csvEscape(row.title),
        csvEscape(row.archetype),
        String(row.ownedCount),
        String(row.referencedCount),
        String(row.selfBytes),
        String(row.subtreeBytes),
        String(row.largestAssetBytes),
      ].join(','),
    );
  }
  return BOM + lines.join(CRLF) + CRLF;
}

/**
 * Build a timestamped filename for the CSV export, e.g.
 * `pkc-storage-profile-20260412-223015.csv`. Accepts a Date so the
 * test suite can pin the output.
 */
export function storageProfileCsvFilename(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  const hh = pad2(date.getHours());
  const mm = pad2(date.getMinutes());
  const ss = pad2(date.getSeconds());
  return `pkc-storage-profile-${y}${m}${d}-${hh}${mm}${ss}.csv`;
}

function csvEscape(value: string): string {
  // RFC 4180: wrap in quotes if the field contains comma, quote, CR
  // or LF; double any embedded quote.
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Human-readable byte formatter (B / KB / MB / GB). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// ── Internal helpers ──────────────────────────────────────────────

function readAttachmentAssetKey(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { asset_key?: unknown };
    if (typeof parsed.asset_key === 'string' && parsed.asset_key.length > 0) {
      return parsed.asset_key;
    }
  } catch {
    /* malformed body — no key */
  }
  return null;
}

function collectBodyAssetRefs(entry: Entry): Set<string> {
  if (entry.archetype === 'text') return extractAssetReferences(entry.body);
  if (entry.archetype === 'textlog') {
    const refs = new Set<string>();
    const parsed = parseTextlogBody(entry.body);
    for (const log of parsed.entries) {
      if (typeof log.text === 'string' && log.text.length > 0) {
        for (const k of extractAssetReferences(log.text)) refs.add(k);
      }
    }
    return refs;
  }
  return new Set();
}
