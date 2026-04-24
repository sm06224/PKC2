/**
 * Link migration apply — Phase 2 Slice 3.
 *
 * Takes a list of `LinkMigrationCandidate` objects (produced by
 * `buildLinkMigrationPreview`) and returns a new `Container` with the
 * candidates applied. Pure function — no side effects, no I/O, no
 * state.
 *
 * Contract:
 *
 *   - Each candidate is re-validated against the CURRENT container
 *     body before being applied. If the source text at
 *     `location.start..location.end` no longer matches `before` (user
 *     edited between preview and apply, dual-edit reconciliation,
 *     etc.), that candidate is **skipped**. The entry's other
 *     candidates still attempt to apply.
 *   - Same-body candidates are applied in **offset-descending** order
 *     so earlier replacements never shift the offsets of later ones.
 *   - For textlog entries, the body is parsed via
 *     `parseTextlogBody`, the target row's `text` is rewritten, and
 *     the body is re-serialised via `serializeTextlogBody`. Row `id`
 *     / `createdAt` / `flags` are preserved verbatim.
 *   - For all other archetypes, the raw `entry.body` string is
 *     rewritten directly.
 *   - Every entry whose body actually changes receives a revision
 *     snapshot (via `snapshotEntry`) **before** the body is updated,
 *     and all such revisions share the same `bulkId` so a future
 *     undo UI can restore them as a group.
 *   - `title` / `lid` / `archetype` / `created_at` are NEVER changed
 *     by this function. Only `body` and `updated_at` move.
 *
 * Non-goals:
 *   - No scanner call — callers must pass the candidate list
 *     explicitly so the reducer path is testable without re-running
 *     the scanner inside the pure planner.
 *   - No selection filtering — callers decide which candidates to
 *     attempt. v1's "Apply all safe" dispatch filters to
 *     `confidence === 'safe'` before calling this function.
 *   - No guard against readonly / editing / importPreview — those
 *     live in the reducer. Passing garbage here is a caller bug.
 */

import type { Container } from '../../core/model/container';
import type { Entry } from '../../core/model/record';
import { snapshotEntry, updateEntry } from '../../core/operations/container-ops';
import { parseTextlogBody, serializeTextlogBody } from '../textlog/textlog-body';
import type { LinkMigrationCandidate } from './migration-scanner';

/**
 * Outcome of an apply operation. Counts are summed across every
 * candidate passed in — they are NOT per-entry.
 */
export interface ApplyLinkMigrationsResult {
  readonly container: Container;
  /** Candidates that were actually rewritten. */
  readonly applied: number;
  /**
   * Candidates that were dropped because the source text had drifted
   * (preview offsets no longer matched `before`), or whose target
   * entry / textlog row had disappeared. Never throws — the caller
   * gets a count instead.
   */
  readonly skipped: number;
  /** Distinct entries whose body actually changed. */
  readonly entriesAffected: number;
}

/**
 * Apply the given candidates to a snapshot of the container.
 *
 * @param container           The container to rewrite. Not mutated.
 * @param candidates          Candidates to attempt. Re-validated
 *                            individually against current body text.
 * @param now                 ISO timestamp used for revisions +
 *                            `updated_at`.
 * @param generateRevisionId  Supplier for new revision ids — kept as
 *                            a parameter so the reducer can plug in
 *                            the same id generator it uses elsewhere.
 * @param bulkId              Bulk revision group id. All revisions
 *                            produced by this apply share it so a
 *                            future restore UI can group them.
 */
export function applyLinkMigrations(
  container: Container,
  candidates: readonly LinkMigrationCandidate[],
  now: string,
  generateRevisionId: () => string,
  bulkId: string,
): ApplyLinkMigrationsResult {
  if (candidates.length === 0) {
    return { container, applied: 0, skipped: 0, entriesAffected: 0 };
  }

  // Group by entryLid so we process one entry at a time.
  const byEntry = new Map<string, LinkMigrationCandidate[]>();
  for (const c of candidates) {
    const bucket = byEntry.get(c.entryLid);
    if (bucket) bucket.push(c);
    else byEntry.set(c.entryLid, [c]);
  }

  let result = container;
  let applied = 0;
  let skipped = 0;
  let entriesAffected = 0;

  for (const [lid, group] of byEntry.entries()) {
    const entry = result.entries.find((e) => e.lid === lid);
    if (!entry) {
      skipped += group.length;
      continue;
    }

    const rewrite =
      entry.archetype === 'textlog'
        ? rewriteTextlogEntry(entry, group)
        : rewritePlainEntry(entry, group);

    applied += rewrite.applied;
    skipped += rewrite.skipped;

    if (rewrite.body === null || rewrite.body === entry.body) {
      continue;
    }

    // Snapshot BEFORE update so the restore path can reconstruct the
    // old body verbatim. `snapshotEntry` is responsible for the
    // `prev_rid` / `content_hash` chain (H-6).
    result = snapshotEntry(result, lid, generateRevisionId(), now, bulkId);
    result = updateEntry(result, lid, entry.title, rewrite.body, now);
    entriesAffected += 1;
  }

  return { container: result, applied, skipped, entriesAffected };
}

// ── Plain-body entries ───────────────────────────────────────

interface RewriteOutcome {
  /** `null` when the body could not be rewritten (e.g. parse error). */
  readonly body: string | null;
  readonly applied: number;
  readonly skipped: number;
}

function rewritePlainEntry(
  entry: Entry,
  candidates: LinkMigrationCandidate[],
): RewriteOutcome {
  // Candidates for a non-textlog entry should all carry `body`
  // locations. A mismatched `textlog` location is a caller bug; skip
  // defensively so an accidental mix can't corrupt the body.
  const body = entry.body ?? '';
  let text = body;
  let applied = 0;
  let skipped = 0;

  // Offset-descending so earlier replacements don't shift later
  // offsets. Ties (same start offset) settle by larger end first to
  // preserve deterministic behaviour when two candidates overlap —
  // though overlapping candidates shouldn't happen in practice for
  // the v1 scanner's A/B/C shapes.
  const sorted = [...candidates].sort((a, b) => {
    const as = a.location.kind === 'body' ? a.location.start : -1;
    const bs = b.location.kind === 'body' ? b.location.start : -1;
    if (bs !== as) return bs - as;
    const ae = a.location.kind === 'body' ? a.location.end : -1;
    const be = b.location.kind === 'body' ? b.location.end : -1;
    return be - ae;
  });

  for (const c of sorted) {
    if (c.location.kind !== 'body') {
      skipped += 1;
      continue;
    }
    const { start, end } = c.location;
    if (start < 0 || end > text.length || text.slice(start, end) !== c.before) {
      skipped += 1;
      continue;
    }
    text = text.slice(0, start) + c.after + text.slice(end);
    applied += 1;
  }

  return { body: text, applied, skipped };
}

// ── Textlog entries ──────────────────────────────────────────

function rewriteTextlogEntry(
  entry: Entry,
  candidates: LinkMigrationCandidate[],
): RewriteOutcome {
  // parseTextlogBody never throws — it returns `{ entries: [] }` for
  // malformed input. If the body couldn't parse, every textlog
  // candidate is implicitly stale and gets skipped.
  const parsed = parseTextlogBody(entry.body ?? '');
  if (parsed.entries.length === 0 && candidates.length > 0) {
    // Special case: an entry that parses empty cannot host any row
    // offsets. Drop every candidate.
    return { body: null, applied: 0, skipped: candidates.length };
  }

  // Group candidates by the row they target so we can rewrite each
  // row's text in one pass.
  const byRow = new Map<string, LinkMigrationCandidate[]>();
  let skipped = 0;
  for (const c of candidates) {
    if (c.location.kind !== 'textlog') {
      skipped += 1;
      continue;
    }
    const bucket = byRow.get(c.location.logId);
    if (bucket) bucket.push(c);
    else byRow.set(c.location.logId, [c]);
  }

  let applied = 0;
  let anyChange = false;
  const nextRows = parsed.entries.map((row) => {
    const rowCandidates = byRow.get(row.id);
    if (!rowCandidates || rowCandidates.length === 0) return row;

    const sorted = [...rowCandidates].sort((a, b) => {
      const as = a.location.kind === 'textlog' ? a.location.start : -1;
      const bs = b.location.kind === 'textlog' ? b.location.start : -1;
      if (bs !== as) return bs - as;
      const ae = a.location.kind === 'textlog' ? a.location.end : -1;
      const be = b.location.kind === 'textlog' ? b.location.end : -1;
      return be - ae;
    });

    let text = row.text;
    let rowChanged = false;
    for (const c of sorted) {
      if (c.location.kind !== 'textlog') {
        skipped += 1;
        continue;
      }
      const { start, end } = c.location;
      if (start < 0 || end > text.length || text.slice(start, end) !== c.before) {
        skipped += 1;
        continue;
      }
      text = text.slice(0, start) + c.after + text.slice(end);
      applied += 1;
      rowChanged = true;
    }

    if (!rowChanged) return row;
    anyChange = true;
    return { ...row, text };
  });

  // Account for candidates that target a row id that no longer
  // exists: we never entered the map iteration for them, so they
  // still need to register as skipped.
  const validLogIds = new Set(parsed.entries.map((r) => r.id));
  for (const [logId, bucket] of byRow.entries()) {
    if (!validLogIds.has(logId)) {
      skipped += bucket.length;
    }
  }

  if (!anyChange) {
    return { body: null, applied, skipped };
  }

  return {
    body: serializeTextlogBody({ entries: nextRows }),
    applied,
    skipped,
  };
}
