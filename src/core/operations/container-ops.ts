import type { Container, Revision } from '../model/container';
import type { Entry, ArchetypeId } from '../model/record';
import type { Relation, RelationKind } from '../model/relation';
import { fnv1a64Hex } from './hash';

/**
 * Pure Container mutation functions.
 *
 * Every function returns a NEW Container (immutable update pattern).
 * These live in core/ — no browser API, no side effects.
 *
 * Design decisions:
 *
 * - DELETE is physical removal, not tombstone.
 *   Reason: Revision snapshots already preserve history.
 *   Adding a deleted_at field to Entry would mix runtime lifecycle
 *   concerns into the persistent model. If soft-delete is needed
 *   later, it can be added as a separate concern (e.g. a "trash"
 *   Relation kind) without changing Entry's shape.
 *
 * - UPDATE writes directly to Entry fields.
 *   Revision (snapshot of previous state) is captured BEFORE the
 *   update, so the old state is preserved. Full revision system
 *   is a later concern; the structure is ready for it.
 *
 * - Timestamps use ISO 8601 strings, passed in by the caller.
 *   Core does not call Date.now() — the caller provides the time.
 */

// ── Entry operations ─────────────────────────

export function addEntry(
  container: Container,
  lid: string,
  archetype: ArchetypeId,
  title: string,
  now: string,
): Container {
  const entry: Entry = {
    lid,
    title,
    body: '',
    archetype,
    created_at: now,
    updated_at: now,
  };
  return {
    ...container,
    entries: [...container.entries, entry],
    meta: { ...container.meta, updated_at: now },
  };
}

export function updateEntry(
  container: Container,
  lid: string,
  title: string,
  body: string,
  now: string,
): Container {
  const idx = container.entries.findIndex((e) => e.lid === lid);
  if (idx === -1) return container;

  const old = container.entries[idx]!;
  const updated: Entry = { ...old, title, body, updated_at: now };
  const entries = [...container.entries];
  entries[idx] = updated;

  return {
    ...container,
    entries,
    meta: { ...container.meta, updated_at: now },
  };
}

/**
 * Update only `entry.tags`, preserving title / body / archetype.
 * Used by the Tag chip UI (W1 Slice F) so Tag attach / detach does
 * not interfere with body editing state and does not require a
 * revision snapshot (tags are not body content).
 *
 * - `nextTags` empty → remove the field entirely (Slice B §3.3:
 *   missing and empty-array are equivalent; storing missing keeps
 *   JSON output identical to pre-Slice-F shape for un-tagged
 *   entries).
 * - `nextTags` non-empty → store a fresh array (insertion order
 *   preserved by caller, Slice B §5.1).
 *
 * Pure. No normalization here — caller is responsible for passing
 * an already-validated list (see `features/tag/normalize.ts`).
 */
export function updateEntryTags(
  container: Container,
  lid: string,
  nextTags: string[],
  now: string,
): Container {
  const idx = container.entries.findIndex((e) => e.lid === lid);
  if (idx === -1) return container;

  const old = container.entries[idx]!;
  // Slice B §3.3: empty list is semantically equivalent to "no tags".
  // Drop the field so the on-disk shape matches pre-Slice-F entries
  // that never had the key.
  const { tags: _drop, ...rest } = old;
  const updated: Entry = nextTags.length > 0
    ? { ...rest, tags: [...nextTags], updated_at: now }
    : { ...rest, updated_at: now };
  const entries = [...container.entries];
  entries[idx] = updated;

  return {
    ...container,
    entries,
    meta: { ...container.meta, updated_at: now },
  };
}

/**
 * Update only `entry.color_tag` (Color tag Slice 3, additive).
 *
 * - `nextColor === null` / `undefined` → drop the field entirely so the
 *   serialised JSON matches a never-coloured entry.
 * - `nextColor` non-empty string → store verbatim. The caller is
 *   responsible for picker-side validation; unknown palette IDs are
 *   intentionally preserved here so a future palette extension can
 *   round-trip through an older reader.
 *
 * Pure. No revision snapshot — Color tag is metadata, not body content
 * (mirrors `updateEntryTags`).
 */
export function updateEntryColorTag(
  container: Container,
  lid: string,
  nextColor: string | null | undefined,
  now: string,
): Container {
  const idx = container.entries.findIndex((e) => e.lid === lid);
  if (idx === -1) return container;

  const old = container.entries[idx]!;
  const { color_tag: _drop, ...rest } = old;
  const trimmed = typeof nextColor === 'string' ? nextColor : null;
  const updated: Entry =
    trimmed !== null && trimmed !== ''
      ? { ...rest, color_tag: trimmed, updated_at: now }
      : { ...rest, updated_at: now };
  const entries = [...container.entries];
  entries[idx] = updated;

  return {
    ...container,
    entries,
    meta: { ...container.meta, updated_at: now },
  };
}

export function removeEntry(container: Container, lid: string): Container {
  const entries = container.entries.filter((e) => e.lid !== lid);
  if (entries.length === container.entries.length) return container;

  // Also remove relations involving this entry
  const relations = container.relations.filter(
    (r) => r.from !== lid && r.to !== lid,
  );

  return { ...container, entries, relations };
}

/**
 * After removing an entry, determine the next selected LID.
 *
 * Rule:
 * 1. If the removed entry was not selected, keep current selection.
 * 2. If the removed entry was selected:
 *    a. Select the entry at the same index (the one that moved up).
 *    b. If that index is past the end, select the last entry.
 *    c. If no entries remain, select null.
 */
export function nextSelectedAfterRemove(
  entriesBefore: Entry[],
  removedLid: string,
  currentSelected: string | null,
): string | null {
  if (currentSelected !== removedLid) return currentSelected;

  const idx = entriesBefore.findIndex((e) => e.lid === removedLid);
  if (idx === -1) return null;

  // After removal, the list shrinks by 1
  const remaining = entriesBefore.filter((e) => e.lid !== removedLid);
  if (remaining.length === 0) return null;

  // Try same index, or fall back to last
  const nextIdx = Math.min(idx, remaining.length - 1);
  return remaining[nextIdx]!.lid;
}

// ── Asset operations ─────────────────────────

/**
 * Set an asset in the container. Overwrites if key already exists.
 * Used by attachment archetype to store file data separately from entry.body.
 */
export function setAsset(
  container: Container,
  key: string,
  data: string,
): Container {
  return {
    ...container,
    assets: { ...container.assets, [key]: data },
  };
}

/**
 * Merge multiple assets into the container.
 * Used when COMMIT_EDIT carries asset data from attachment editor.
 */
export function mergeAssets(
  container: Container,
  assets: Record<string, string>,
): Container {
  if (Object.keys(assets).length === 0) return container;
  return {
    ...container,
    assets: { ...container.assets, ...assets },
  };
}

// ── Relation operations ──────────────────────

export function addRelation(
  container: Container,
  id: string,
  from: string,
  to: string,
  kind: RelationKind,
  now: string,
): Container {
  const relation: Relation = {
    id,
    from,
    to,
    kind,
    created_at: now,
    updated_at: now,
  };
  return {
    ...container,
    relations: [...container.relations, relation],
    meta: { ...container.meta, updated_at: now },
  };
}

export function removeRelation(container: Container, id: string): Container {
  const relations = container.relations.filter((r) => r.id !== id);
  if (relations.length === container.relations.length) return container;
  return { ...container, relations };
}

export function updateRelationKind(
  container: Container,
  id: string,
  kind: RelationKind,
  now: string,
): Container {
  let changed = false;
  const relations = container.relations.map((r) => {
    if (r.id !== id) return r;
    if (r.kind === kind) return r;
    changed = true;
    return { ...r, kind, updated_at: now };
  });
  if (!changed) return container;
  return {
    ...container,
    relations,
    meta: { ...container.meta, updated_at: now },
  };
}

// ── Revision operations ─────────────────────────

/**
 * Revision policy:
 *
 * What gets snapshotted:
 * - COMMIT_EDIT: pre-update snapshot (preserves old title/body)
 * - DELETE_ENTRY: pre-delete snapshot (preserves deleted entry for restore)
 *
 * What does NOT get snapshotted:
 * - CREATE_ENTRY: nothing exists before creation
 * - ACCEPT_OFFER: creation, not mutation
 * - SYS_IMPORT_COMPLETE: replaces container wholesale; imported revisions preserved
 * - Runtime-only state (pendingOffers, phase, selection): never persisted
 *
 * Delete handling:
 * - Physical removal (no tombstone). The pre-delete snapshot in revisions
 *   preserves the entry's last state for potential future restore.
 */

/**
 * Create a pre-mutation revision snapshot of an entry.
 * The snapshot is the JSON-serialized entry before mutation.
 * Call BEFORE the mutation (update or delete).
 *
 * When `bulkId` is supplied, the resulting Revision carries that
 * identifier so that sibling revisions produced in the same bulk
 * action can be looked up together via `getRevisionsByBulkId`.
 * Single-entry mutations MUST pass `undefined` (or omit the
 * argument) so the common path writes no `bulk_id` field, matching
 * the spec §6.1 invariant that `bulk_id` is absent on single-entry
 * snapshots.
 */
export function snapshotEntry(
  container: Container,
  lid: string,
  revisionId: string,
  now: string,
  bulkId?: string,
): Container {
  const entry = container.entries.find((e) => e.lid === lid);
  if (!entry) return container;

  const snapshot = JSON.stringify(entry);
  const revision: Revision = {
    id: revisionId,
    entry_lid: lid,
    snapshot,
    created_at: now,
    content_hash: fnv1a64Hex(snapshot),
  };
  if (bulkId !== undefined) {
    revision.bulk_id = bulkId;
  }
  const prevRid = findLatestRevisionIdForLid(container, lid);
  if (prevRid !== undefined) {
    revision.prev_rid = prevRid;
  }

  return {
    ...container,
    revisions: [...container.revisions, revision],
  };
}

/**
 * Find the id of the most recent prior revision for `lid`, or
 * `undefined` if none exists. "Most recent" is defined as the
 * revision with the greatest `created_at` string among those
 * matching `entry_lid === lid`; ties are broken by array position
 * (later wins, matching insertion order).
 *
 * Used by `snapshotEntry` to populate `Revision.prev_rid` (H-6).
 * Kept file-local — callers outside `snapshotEntry` should query
 * revisions via `getEntryRevisions` instead.
 */
function findLatestRevisionIdForLid(
  container: Container,
  lid: string,
): string | undefined {
  let best: Revision | undefined;
  for (const r of container.revisions) {
    if (r.entry_lid !== lid) continue;
    if (best === undefined || r.created_at >= best.created_at) {
      best = r;
    }
  }
  return best?.id;
}

// ── Revision queries ─────────────────────────

/**
 * Get all revisions for a specific entry, ordered by created_at ascending.
 */
export function getEntryRevisions(
  container: Container,
  lid: string,
): Revision[] {
  return container.revisions
    .filter((r) => r.entry_lid === lid)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

/**
 * Get the latest (most recent) revision for an entry, or null.
 */
export function getLatestRevision(
  container: Container,
  lid: string,
): Revision | null {
  const revs = getEntryRevisions(container, lid);
  return revs.length > 0 ? revs[revs.length - 1]! : null;
}

/**
 * Get the revision count for an entry.
 */
export function getRevisionCount(
  container: Container,
  lid: string,
): number {
  return container.revisions.filter((r) => r.entry_lid === lid).length;
}

/**
 * Get every revision tagged with the given `bulk_id`, in
 * `created_at` ascending order. Returns an empty array when no
 * matching revisions exist.
 *
 * Added 2026-04-13 (bulk-snapshot policy). Intended audience is a
 * future "restore whole bulk" UI that wants to surface the set of
 * entries affected by a single `BULK_DELETE` / `BULK_SET_STATUS` /
 * `BULK_SET_DATE`. The current restore helpers still operate on one
 * entry at a time — this query is the aggregation primitive they
 * will layer on top of.
 */
export function getRevisionsByBulkId(
  container: Container,
  bulkId: string,
): Revision[] {
  return container.revisions
    .filter((r) => r.bulk_id === bulkId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

/**
 * Parse a revision's snapshot back into an Entry.
 * Returns null if the snapshot is malformed.
 *
 * Canonical spec: `docs/spec/data-model.md` §6.4 (snapshot parse contract).
 *
 * Strict failure contract (P0-4, 2026-04-13):
 *   Returns a non-null Entry only when EVERY field below holds.
 *   Any failure yields `null`; callers never see a partially-valid
 *   Entry, and restore paths can therefore trust every field.
 *
 *   - snapshot is valid JSON AND parses to a non-null plain object
 *   - `lid` is a NON-EMPTY string
 *   - `title` is a string (empty allowed)
 *   - `body` is a string (empty allowed)
 *   - `archetype` is one of the 8 known `ArchetypeId` values
 *     (unknown archetype strings — e.g. a future value or a typo in
 *     hand-crafted data — are rejected; do NOT silently coerce to
 *     `'generic'` at parse time)
 *   - `created_at` is a string (any string; ISO 8601 is expected but
 *     not strictly validated at this layer)
 *   - `updated_at` is a string
 *
 *   Extra fields are tolerated and preserved on the returned Entry
 *   object — this keeps the parse lossless for future additive
 *   schema extensions.
 *
 * Pre-P0-4 behaviour accepted snapshots that were missing
 * `archetype` / `created_at` / `updated_at`, or that carried an
 * unknown archetype value. That was a silent corruption vector: a
 * subsequent `restoreDeletedEntry` would re-create the Entry with
 * the bogus archetype. The stricter parse closes that vector.
 */
export function parseRevisionSnapshot(revision: Revision): Entry | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(revision.snapshot);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.lid !== 'string' || obj.lid.length === 0) return null;
  if (typeof obj.title !== 'string') return null;
  if (typeof obj.body !== 'string') return null;
  if (!isKnownArchetype(obj.archetype)) return null;
  if (typeof obj.created_at !== 'string') return null;
  if (typeof obj.updated_at !== 'string') return null;
  return obj as unknown as Entry;
}

/**
 * Closed set of archetype identifiers accepted by the strict parse.
 * Kept co-located with `parseRevisionSnapshot` so any future
 * addition to `ArchetypeId` is a one-place change here plus the
 * union in `core/model/record.ts`.
 */
const KNOWN_ARCHETYPES: ReadonlySet<ArchetypeId> = new Set<ArchetypeId>([
  'text',
  'textlog',
  'todo',
  'form',
  'attachment',
  'folder',
  'generic',
  'opaque',
]);

function isKnownArchetype(value: unknown): value is ArchetypeId {
  return typeof value === 'string' && KNOWN_ARCHETYPES.has(value as ArchetypeId);
}

/**
 * Get restore candidates: entries that have been deleted but have revisions.
 * Returns the latest revision for each deleted entry_lid.
 * An entry_lid is considered "deleted" if it has revisions but no
 * corresponding entry in Container.entries.
 */
export function getRestoreCandidates(container: Container): Revision[] {
  const activeLids = new Set(container.entries.map((e) => e.lid));

  // Group revisions by entry_lid, keep only deleted ones
  const latestByLid = new Map<string, Revision>();
  for (const rev of container.revisions) {
    if (activeLids.has(rev.entry_lid)) continue;
    const existing = latestByLid.get(rev.entry_lid);
    if (!existing || rev.created_at > existing.created_at) {
      latestByLid.set(rev.entry_lid, rev);
    }
  }

  return Array.from(latestByLid.values())
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/**
 * Purge trash: permanently remove all revisions for deleted entries.
 * Returns the new container and the count of purged revision records.
 */
export function purgeTrash(container: Container): { container: Container; purgedCount: number } {
  const activeLids = new Set(container.entries.map((e) => e.lid));
  const kept: typeof container.revisions = [];
  let purgedCount = 0;
  for (const rev of container.revisions) {
    if (activeLids.has(rev.entry_lid)) {
      kept.push(rev);
    } else {
      purgedCount++;
    }
  }
  if (purgedCount === 0) return { container, purgedCount: 0 };
  return {
    container: { ...container, revisions: kept },
    purgedCount,
  };
}

// ── Restore operations ─────────────────────────

/**
 * Restore policy:
 *
 * Restore is a "forward mutation", not a rewind:
 * - The revision's snapshot content becomes the new entry state
 * - The current state (if entry exists) is snapshotted first as a new revision
 * - The entry's updated_at advances to now (not the revision's timestamp)
 * - For deleted entries: re-created with the original lid
 *
 * What is NOT restored:
 * - Runtime-only state (pendingOffers, importPreview, phase, selection)
 * - Relations (restore is entry-level only)
 *
 * This preserves full history: old state → snapshot → restored content.
 * No revision is ever deleted or overwritten.
 */

/**
 * Restore an existing entry from a revision snapshot.
 * Snapshots the current state first, then overwrites with revision content.
 *
 * Failure contract (P0-4, 2026-04-13) — any of the following returns
 * the input `container` unchanged. None of them produces a silent
 * mutation, and each one is independently covered by core tests:
 *
 *   - `revisionId` is not present in `container.revisions`
 *   - The matching revision's snapshot fails
 *     `parseRevisionSnapshot` (see that function's strict contract)
 *   - `lid` is not present in `container.entries`
 *   - The existing entry's `archetype` differs from the snapshot's
 *     `archetype`. Spec I-E2 forbids mutating `archetype`, so an
 *     archetype mismatch means the snapshot was produced for a
 *     DIFFERENT entry identity — restoring its title/body into the
 *     current entry would corrupt the body format (e.g. writing a
 *     TODO JSON body into a TEXT entry). The restore is rejected.
 */
export function restoreEntry(
  container: Container,
  lid: string,
  revisionId: string,
  snapshotRevId: string,
  now: string,
): Container {
  const revision = container.revisions.find((r) => r.id === revisionId);
  if (!revision) return container;

  const restored = parseRevisionSnapshot(revision);
  if (!restored) return container;

  const existing = container.entries.find((e) => e.lid === lid);
  if (!existing) return container;

  // Archetype-mismatch guard. `parseRevisionSnapshot` already
  // validates the snapshot's archetype against the known set; here
  // we additionally require that it matches the live entry's
  // archetype so we never overwrite a TEXT body with a TODO JSON
  // or vice versa.
  if (existing.archetype !== restored.archetype) return container;

  // Snapshot current state before restoring
  const snapshotted = snapshotEntry(container, lid, snapshotRevId, now);

  // Overwrite entry with restored content (advance updated_at)
  return updateEntry(snapshotted, lid, restored.title, restored.body, now);
}

/**
 * Restore a deleted entry from a revision snapshot.
 * Re-creates the entry with its original lid, then applies revision content.
 *
 * Failure contract (P0-4, 2026-04-13) — any of the following returns
 * the input `container` unchanged:
 *
 *   - `revisionId` is not present in `container.revisions`
 *   - The snapshot fails the strict `parseRevisionSnapshot` check
 *     (non-JSON, non-object, missing lid/title/body, unknown or
 *     missing archetype, missing timestamps — see that function's
 *     JSDoc for the full list)
 *   - The entry `restored.lid` already exists in `container.entries`
 *     — this function is scoped to deleted-entry restore. Use
 *     `restoreEntry` for the existing-entry path.
 *
 * Because `parseRevisionSnapshot` is strict, `restored.archetype` is
 * guaranteed to be one of the 8 known `ArchetypeId` values. The
 * `addEntry` call therefore cannot introduce an invalid archetype
 * into the container.
 */
export function restoreDeletedEntry(
  container: Container,
  revisionId: string,
  now: string,
): Container {
  const revision = container.revisions.find((r) => r.id === revisionId);
  if (!revision) return container;

  const restored = parseRevisionSnapshot(revision);
  if (!restored) return container;

  // Verify the entry is actually deleted
  if (container.entries.some((e) => e.lid === restored.lid)) {
    return container; // entry still exists, not a deleted-entry restore
  }

  // Re-create with original lid and apply content
  const withEntry = addEntry(container, restored.lid, restored.archetype, restored.title, now);
  return updateEntry(withEntry, restored.lid, restored.title, restored.body, now);
}

/**
 * Branch-restore a past revision into a NEW entry (C-1 v1, 2026-04-17).
 *
 * Creates a fresh entry with its own `newLid` carrying the snapshot's
 * title / body / archetype, then appends a single `provenance` relation
 * pointing from the source (original) entry to the new (derived) branch
 * entry. The source entry and its revision chain stay unchanged
 * (I-Rbr1 / I-Rbr5).
 *
 * Contract: `docs/spec/revision-branch-restore-v1-behavior-contract.md`
 *   §1.3 (operation), §3 (I-Rbr1〜10), §4.1 (provenance metadata).
 *
 * Returns the input `container` unchanged (reference equality) when any
 * of the following holds — pure rejection, no silent mutation:
 *   - `revisionId` is absent from `container.revisions`
 *   - `parseRevisionSnapshot` rejects the revision (strict contract,
 *     see `data-model.md §6.4`)
 *   - `revision.entry_lid !== entryLid` (cross-entry guard)
 *   - the source entry (`entryLid`) no longer exists in `container.entries`
 *   - `newLid` already collides with an existing entry
 *   - `relationId` already collides with an existing relation
 *
 * `newLid` / `relationId` / `now` are injected by the caller for
 * determinism (I-Rbr10). The reducer typically supplies `generateLid()`
 * and the current timestamp.
 *
 * Provenance direction (I-Rbr9, profile §3.1 canonical):
 *   `from = entryLid (source)` → `to = newLid (derived)`.
 *
 * Metadata follows the profile additive scheme (§4.1 / §4.2):
 *   - `conversion_kind: 'revision-branch'` (new profile value)
 *   - `converted_at: now`
 *   - `source_revision_id: revisionId`
 *   - `source_content_hash`: copied from `revision.content_hash` when
 *     present; omitted for pre-H-6 revisions without a hash.
 */
export function branchRestoreRevision(
  container: Container,
  entryLid: string,
  revisionId: string,
  newLid: string,
  relationId: string,
  now: string,
): Container {
  const revision = container.revisions.find((r) => r.id === revisionId);
  if (!revision) return container;

  const snapshot = parseRevisionSnapshot(revision);
  if (!snapshot) return container;

  if (revision.entry_lid !== entryLid) return container;

  // Source entry must exist. Branch restore is only meaningful when
  // the original entry is live; restoring a deleted entry is the job
  // of `restoreDeletedEntry`.
  if (!container.entries.some((e) => e.lid === entryLid)) return container;

  // Defensive id-collision guards. `generateLid` collisions are
  // vanishingly rare, but the guards keep the helper safe against
  // hand-wired call sites (tests, replay tools).
  if (container.entries.some((e) => e.lid === newLid)) return container;
  if (container.relations.some((r) => r.id === relationId)) return container;

  // 1) append new entry with snapshot's archetype + title.
  // 2) overwrite body (addEntry initialises body as '').
  const withEntry = addEntry(container, newLid, snapshot.archetype, snapshot.title, now);
  const withBody = updateEntry(withEntry, newLid, snapshot.title, snapshot.body, now);

  // Build metadata per profile §2.2. All values are strings.
  const metadata: Record<string, string> = {
    conversion_kind: 'revision-branch',
    converted_at: now,
    source_revision_id: revisionId,
  };
  if (revision.content_hash !== undefined) {
    metadata.source_content_hash = revision.content_hash;
  }

  const relation: Relation = {
    id: relationId,
    from: entryLid, // source (I-Rbr9 canonical direction)
    to: newLid,     // derived
    kind: 'provenance',
    created_at: now,
    updated_at: now,
    metadata,
  };

  return {
    ...withBody,
    relations: [...withBody.relations, relation],
  };
}
