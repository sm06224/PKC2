import { fnv1a64Hex } from '../../core/operations/hash';
import type { Container } from '../../core/model/container';
import type { Entry } from '../../core/model/record';
import type { MergePlan } from './merge-planner';

export type { ConflictKind, Resolution, EntryConflict } from '../../core/model/merge-conflict';
import type { ConflictKind, Resolution, EntryConflict } from '../../core/model/merge-conflict';

/**
 * Structured provenance data for duplicate-as-branch resolutions.
 * The reducer wiring slice will mint actual Relation objects from this,
 * since core Relation type does not yet include 'provenance' kind or metadata.
 */
export interface ProvenanceRelationData {
  from_lid: string;
  to_lid: string;
  metadata: {
    kind: 'merge-duplicate';
    detected_at: string;
    match_kind: ConflictKind;
    imported_title: string;
    imported_archetype: string;
    host_candidates?: string[];
  };
}

export interface ConflictResolutionResult {
  plan: MergePlan;
  provenanceData: ProvenanceRelationData[];
  suppressedByKeepCurrent: string[];
  suppressedBySkip: string[];
}

// ── Pure helpers ──────────────────────────────

export function normalizeTitle(title: string): string {
  return title.normalize('NFC').trim().replace(/\s+/g, ' ');
}

export function contentHash(body: string, archetype: string): string {
  return fnv1a64Hex(body + '\0' + archetype);
}

export function bodyPreview(body: string): string {
  const codePoints = [...body];
  const truncated = codePoints.length > 200;
  const slice = codePoints.slice(0, 200).join('');
  const visible = slice.replace(/\n/g, '↵');
  return truncated ? visible + '...' : visible;
}

// ── Conflict detection ──────────────────────────────

export function detectEntryConflicts(
  host: Container,
  imported: Container,
): EntryConflict[] {
  const hostMap = new Map<string, Entry[]>();
  for (const entry of host.entries) {
    const key = normalizeTitle(entry.title) + '|' + entry.archetype;
    const list = hostMap.get(key);
    if (list) {
      list.push(entry);
    } else {
      hostMap.set(key, [entry]);
    }
  }

  const conflicts: EntryConflict[] = [];

  for (const imp of imported.entries) {
    const key = normalizeTitle(imp.title) + '|' + imp.archetype;
    const candidates = hostMap.get(key);
    if (!candidates || candidates.length === 0) continue;

    const impHash = contentHash(imp.body, imp.archetype);
    const exactMatch = candidates.find(
      (h) => contentHash(h.body, h.archetype) === impHash,
    );

    if (exactMatch) {
      conflicts.push(buildConflict('content-equal', imp, exactMatch, impHash, host));
    } else if (candidates.length === 1) {
      conflicts.push(buildConflict('title-only', imp, candidates[0]!, impHash, host));
    } else {
      const sorted = [...candidates].sort((a, b) => {
        const cmp = b.updated_at.localeCompare(a.updated_at);
        if (cmp !== 0) return cmp;
        return host.entries.indexOf(a) - host.entries.indexOf(b);
      });
      const representative = sorted[0]!;
      const conflict = buildConflict(
        'title-only-multi',
        imp,
        representative,
        impHash,
        host,
      );
      conflict.host_candidates = candidates.map((c) => c.lid);
      conflicts.push(conflict);
    }
  }

  return conflicts;
}

function buildConflict(
  kind: ConflictKind,
  imp: Entry,
  hostEntry: Entry,
  impHash: string,
  _host: Container,
): EntryConflict {
  return {
    kind,
    imported_lid: imp.lid,
    host_lid: hostEntry.lid,
    imported_title: imp.title,
    host_title: hostEntry.title,
    archetype: imp.archetype,
    imported_content_hash: impHash,
    host_content_hash: contentHash(hostEntry.body, hostEntry.archetype),
    imported_body_preview: bodyPreview(imp.body),
    host_body_preview: bodyPreview(hostEntry.body),
    imported_created_at: imp.created_at,
    imported_updated_at: imp.updated_at,
    host_created_at: hostEntry.created_at,
    host_updated_at: hostEntry.updated_at,
  };
}

// ── Conflict resolution application ──────────────────────────────

export function applyConflictResolutions(
  plan: MergePlan,
  resolutions: Record<string, Resolution>,
  conflicts: EntryConflict[],
  now: string,
): ConflictResolutionResult {
  const newLidRemap = new Map(plan.lidRemap);
  const provenanceData: ProvenanceRelationData[] = [];
  const suppressedByKeepCurrent: string[] = [];
  const suppressedBySkip: string[] = [];

  for (const conflict of conflicts) {
    const resolution = resolutions[conflict.imported_lid];
    if (!resolution) continue;

    switch (resolution) {
      case 'keep-current': {
        newLidRemap.delete(conflict.imported_lid);
        suppressedByKeepCurrent.push(conflict.imported_lid);
        break;
      }
      case 'skip': {
        newLidRemap.delete(conflict.imported_lid);
        suppressedBySkip.push(conflict.imported_lid);
        break;
      }
      case 'duplicate-as-branch': {
        const newLid = plan.lidRemap.get(conflict.imported_lid);
        if (newLid) {
          const metadata: ProvenanceRelationData['metadata'] = {
            kind: 'merge-duplicate',
            detected_at: now,
            match_kind: conflict.kind,
            imported_title: conflict.imported_title,
            imported_archetype: conflict.archetype,
          };
          if (conflict.host_candidates) {
            metadata.host_candidates = conflict.host_candidates;
          }
          provenanceData.push({
            from_lid: newLid,
            to_lid: conflict.host_lid,
            metadata,
          });
        }
        break;
      }
    }
  }

  const excludedCount =
    suppressedByKeepCurrent.length + suppressedBySkip.length;

  return {
    plan: {
      lidRemap: newLidRemap,
      assetRemap: plan.assetRemap,
      counts: {
        ...plan.counts,
        addedEntries: plan.counts.addedEntries - excludedCount,
      },
    },
    provenanceData,
    suppressedByKeepCurrent,
    suppressedBySkip,
  };
}
