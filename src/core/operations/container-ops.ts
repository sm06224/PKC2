import type { Container } from '../model/container';
import type { Entry, ArchetypeId } from '../model/record';
import type { Relation, RelationKind } from '../model/relation';

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

// ── Revision helpers ─────────────────────────

/**
 * Create a pre-update revision snapshot of an entry.
 * The snapshot is the JSON-serialized entry before mutation.
 * This is the minimal foundation for future undo/history.
 */
export function snapshotEntry(
  container: Container,
  lid: string,
  revisionId: string,
  now: string,
): Container {
  const entry = container.entries.find((e) => e.lid === lid);
  if (!entry) return container;

  return {
    ...container,
    revisions: [
      ...container.revisions,
      {
        id: revisionId,
        entry_lid: lid,
        snapshot: JSON.stringify(entry),
        created_at: now,
      },
    ],
  };
}
