import type { Container } from '../model/container';
import type { ArchetypeId } from '../model/record';
import type { Relation } from '../model/relation';
import { addEntry, updateEntry, getLatestRevision } from './container-ops';

/**
 * FI-01 dual-edit-safety v1 — pure slice.
 *
 * Contract: `docs/spec/dual-edit-safety-v1-behavior-contract.md`
 *   - §2.1  EditBaseSnapshot type
 *   - §2.2  judgement decision table
 *   - §3    pure helpers
 *   - §4    invariants I-Dual1〜I-Dual10
 *   - §6    provenance direction / metadata
 *
 * Scope: pure helpers only. Reducer / AppState / UI wiring lives in
 * later slices. Helpers are deterministic and take lid / relationId /
 * now via injection (I-Dual10).
 */

/**
 * Version tag captured at the moment the user enters edit mode. The
 * tag is compared against the current Container at save commit time;
 * a mismatch means another session has advanced the entry.
 *
 * - `updated_at` is the primary judgement key (always present on
 *   Entry). See `docs/spec/data-model.md §3`.
 * - `content_hash` is the auxiliary key (H-6, `docs/spec/data-model.md
 *   §6.2.1`). Absent when no revision for this entry carries a hash
 *   yet (pre-H-6 data). Judgement still succeeds on `updated_at` alone
 *   in that case (I-Dual7).
 * - `archetype` is captured so that a silent archetype swap by another
 *   path also surfaces as a conflict (§2.2).
 */
export type EditBaseSnapshot = {
  lid: string;
  archetype: ArchetypeId;
  updated_at: string;
  content_hash?: string;
};

/**
 * Result of `checkSaveConflict`. `safe` is the only value that permits
 * save to proceed; every other variant instructs the reducer to route
 * into the reject path (§5.3) and the UI to surface the overlay (§8.1).
 *
 * v1 UI does not differentiate the kinds (§8.1); the richer classes
 * exist so that tests / future diff viewer can reason about them.
 */
export type SaveConflictCheck =
  | { kind: 'safe' }
  | { kind: 'entry-missing' }
  | { kind: 'archetype-changed'; currentArchetype: ArchetypeId }
  | {
      kind: 'version-mismatch';
      currentUpdatedAt: string;
      currentContentHash?: string;
    };

/**
 * Capture the version tag for the entry the user is about to edit.
 *
 * Returns `null` when `lid` is not an entry in the container; callers
 * MUST check for this (editing a non-existent entry is an impossible
 * state that we choose to surface rather than fabricate a snapshot).
 *
 * `content_hash` is populated from the latest revision's
 * `content_hash` when available. Pre-H-6 data (no `content_hash` on
 * any revision) or new entries with no revisions yet will omit the
 * field; the downstream comparison tolerates that (§2.2, I-Dual7).
 */
export function captureEditBase(
  container: Container,
  lid: string,
): EditBaseSnapshot | null {
  const entry = container.entries.find((e) => e.lid === lid);
  if (!entry) return null;

  const base: EditBaseSnapshot = {
    lid: entry.lid,
    archetype: entry.archetype,
    updated_at: entry.updated_at,
  };

  const latestRev = getLatestRevision(container, lid);
  if (latestRev?.content_hash !== undefined) {
    base.content_hash = latestRev.content_hash;
  }

  return base;
}

/**
 * Classify whether saving `base`'s draft is safe against the current
 * container. Implements the §2.2 decision table.
 *
 * Order of checks (first match wins):
 *   1. entry missing → `entry-missing`
 *   2. archetype changed → `archetype-changed`
 *   3. `updated_at` differs → `version-mismatch`
 *   4. both sides have `content_hash` and they differ → `version-mismatch`
 *   5. otherwise → `safe`
 *
 * Step 4 realises the I-Dual7 auxiliary role of `content_hash`: it is
 * consulted only when `updated_at` matches. When either side is
 * missing a hash the judgement defers to `updated_at` alone, keeping
 * pre-H-6 data functional.
 */
export function checkSaveConflict(
  base: EditBaseSnapshot,
  container: Container,
): SaveConflictCheck {
  const entry = container.entries.find((e) => e.lid === base.lid);
  if (!entry) return { kind: 'entry-missing' };

  if (entry.archetype !== base.archetype) {
    return { kind: 'archetype-changed', currentArchetype: entry.archetype };
  }

  const latestRev = getLatestRevision(container, base.lid);
  const currentContentHash = latestRev?.content_hash;

  if (entry.updated_at !== base.updated_at) {
    const mismatch: Extract<SaveConflictCheck, { kind: 'version-mismatch' }> = {
      kind: 'version-mismatch',
      currentUpdatedAt: entry.updated_at,
    };
    if (currentContentHash !== undefined) {
      mismatch.currentContentHash = currentContentHash;
    }
    return mismatch;
  }

  // updated_at matches. content_hash is auxiliary: only report a
  // mismatch when BOTH sides carry a hash and they differ. Otherwise
  // trust the updated_at equality.
  if (
    base.content_hash !== undefined &&
    currentContentHash !== undefined &&
    base.content_hash !== currentContentHash
  ) {
    return {
      kind: 'version-mismatch',
      currentUpdatedAt: entry.updated_at,
      currentContentHash,
    };
  }

  return { kind: 'safe' };
}

/**
 * Boolean convenience around `checkSaveConflict`. Returns `true` iff
 * the detailed result is `safe`. Equivalent to the primary judgement
 * `isSaveSafe` defined in contract §3.2.
 */
export function isSaveSafe(
  base: EditBaseSnapshot,
  container: Container,
): boolean {
  return checkSaveConflict(base, container).kind === 'safe';
}

/**
 * Build a branch entry from a rejected save's draft. The branch
 * preserves the user's in-progress edits as a new, independent entry
 * so that no content is lost.
 *
 * Behaviour per contract §3.4 / §5.4 / §6:
 *   - adds a new Entry with `newLid` carrying `draft.title / draft.body`
 *     and `base.archetype` (the archetype the user was editing under)
 *   - appends a provenance Relation with canonical direction
 *     `from = base.lid (source) → to = newLid (derived)` and
 *     `kind = 'provenance'`
 *   - metadata: `conversion_kind = 'concurrent-edit'`,
 *     `converted_at = now`, `source_updated_at = base.updated_at`,
 *     and `source_content_hash` when present on `base`
 *
 * `newLid` / `relationId` / `now` are injected for determinism
 * (I-Dual10). Defensive id-collision guards are included so that
 * misuse in tests / replay tools does not corrupt the container.
 *
 * The helper is intentionally tolerant: even when `base.lid` no
 * longer exists in the container (the entry-missing conflict kind),
 * the provenance relation is still created so the user's intent is
 * recorded. A dangling `from` reference is visible to downstream
 * tooling and is preferable to silently dropping the linkage.
 *
 * This is a DIFFERENT operation from `branchRestoreRevision` (C-1).
 * The two happen to share the `addEntry` / `updateEntry` primitives
 * but are separate themes with distinct `conversion_kind` values
 * (I-Dual8).
 */
export function branchFromDualEditConflict(
  container: Container,
  base: EditBaseSnapshot,
  draft: { title: string; body: string },
  newLid: string,
  relationId: string,
  now: string,
): Container {
  if (container.entries.some((e) => e.lid === newLid)) return container;
  if (container.relations.some((r) => r.id === relationId)) return container;

  const withEntry = addEntry(container, newLid, base.archetype, draft.title, now);
  const withBody = updateEntry(withEntry, newLid, draft.title, draft.body, now);

  const metadata: Record<string, string> = {
    conversion_kind: 'concurrent-edit',
    converted_at: now,
    source_updated_at: base.updated_at,
  };
  if (base.content_hash !== undefined) {
    metadata.source_content_hash = base.content_hash;
  }

  const relation: Relation = {
    id: relationId,
    from: base.lid,
    to: newLid,
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
