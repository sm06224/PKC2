/**
 * Pure batch import planner.
 *
 * Takes a parsed batch import result + selected indices and produces
 * a deterministic import plan. No DOM, no browser API, no side effects.
 *
 * The plan describes all entries, folders, and relations to create.
 * The reducer applies the plan atomically in one pass.
 *
 * Spec: `docs/development/batch-import-transaction-hardening.md`.
 *
 * Layering: features/ — pure types + functions only. Input types are
 * defined here independently of adapter types (caller maps at boundary).
 */

// ── Input types (independent of adapter layer) ──────

export interface PlannerFolderInfo {
  lid: string;
  title: string;
  parentLid: string | null;
}

export interface PlannerAttachment {
  assetKey: string;
  data: string;
  name: string;
  mime: string;
  size: number;
}

export interface PlannerEntry {
  archetype: 'text' | 'textlog';
  title: string;
  body: string;
  parentFolderLid?: string;
  attachments: PlannerAttachment[];
}

export interface PlannerInput {
  entries: PlannerEntry[];
  folders?: PlannerFolderInfo[];
  source: string;
  format: string;
  /** LID of existing target folder in container. null/undefined = root. */
  targetFolderLid?: string | null;
}

import type {
  BatchImportPlan,
  BatchImportPlanFolder,
  BatchImportPlanEntry,
  BatchImportPlanAttachment,
} from '../../core/action/system-command';

// Re-export for convenience
export type { BatchImportPlan, BatchImportPlanFolder, BatchImportPlanEntry, BatchImportPlanAttachment };

export type BatchImportPlanResult =
  | { ok: true; plan: BatchImportPlan }
  | { ok: false; error: string; fallbackPlan: BatchImportPlan };

// ── Folder graph validation ─────────────────────────

export interface FolderGraphValidation {
  valid: boolean;
  warnings: string[];
}

/**
 * Validate folder graph for structural correctness.
 * Pure function — no side effects.
 */
export function validateFolderGraph(
  folders: PlannerFolderInfo[],
  entries: { parentFolderLid?: string }[],
): FolderGraphValidation {
  const warnings: string[] = [];
  const lidSet = new Set<string>();
  const folderLids = new Set(folders.map((f) => f.lid));

  // Check duplicate folder LIDs
  for (const f of folders) {
    if (lidSet.has(f.lid)) {
      warnings.push(`Duplicate folder LID: "${f.lid}"`);
      return { valid: false, warnings };
    }
    lidSet.add(f.lid);
  }

  // Check self-parent
  for (const f of folders) {
    if (f.parentLid === f.lid) {
      warnings.push(`Self-parent folder: "${f.lid}"`);
      return { valid: false, warnings };
    }
  }

  // Check missing parent LID
  for (const f of folders) {
    if (f.parentLid !== null && !folderLids.has(f.parentLid)) {
      warnings.push(`Missing parent folder: "${f.parentLid}" referenced by "${f.lid}"`);
      return { valid: false, warnings };
    }
  }

  // Check cycles via visited-set traversal
  for (const f of folders) {
    const visited = new Set<string>();
    let cur: string | null = f.lid;
    while (cur !== null) {
      if (visited.has(cur)) {
        warnings.push(`Cycle detected in folder graph involving "${cur}"`);
        return { valid: false, warnings };
      }
      visited.add(cur);
      const parent = folders.find((p) => p.lid === cur);
      cur = parent?.parentLid ?? null;
    }
  }

  // Check entry parentFolderLid references
  for (const entry of entries) {
    if (entry.parentFolderLid && !folderLids.has(entry.parentFolderLid)) {
      warnings.push(`Entry references unknown folder: "${entry.parentFolderLid}"`);
      return { valid: false, warnings };
    }
  }

  return { valid: true, warnings };
}

// ── Selection-aware classification ─────────────────

export interface FolderRestoreClassification {
  canRestoreFolderStructure: boolean;
  folderCount: number;
  malformedFolderMetadata?: boolean;
  folderGraphWarning?: string;
}

/**
 * Classify folder restore availability for a selected subset of entries.
 * Pure function — same logic as confirm-time validation but scoped to selection.
 *
 * Used by the reducer to recompute classification when entry selection changes.
 */
export function classifyFolderRestore(
  folders: PlannerFolderInfo[],
  entryRefs: { parentFolderLid?: string }[],
  selectedIndices: number[],
): FolderRestoreClassification {
  if (folders.length === 0) {
    return { canRestoreFolderStructure: false, folderCount: 0 };
  }

  // Filter entry references to selected subset only
  const selectedRefs = selectedIndices
    .filter((i) => i >= 0 && i < entryRefs.length)
    .map((i) => entryRefs[i]!);

  const validation = validateFolderGraph(folders, selectedRefs);
  if (!validation.valid) {
    return {
      canRestoreFolderStructure: false,
      folderCount: 0,
      malformedFolderMetadata: true,
      folderGraphWarning: validation.warnings.join('; '),
    };
  }

  // Compute needed ancestor folder count for selected entries
  const folderByLid = new Map(folders.map((f) => [f.lid, f]));
  const neededLids = new Set<string>();
  for (const ref of selectedRefs) {
    let cur = ref.parentFolderLid;
    while (cur && !neededLids.has(cur)) {
      neededLids.add(cur);
      const folder = folderByLid.get(cur);
      cur = folder?.parentLid ?? undefined;
    }
  }

  return {
    canRestoreFolderStructure: neededLids.size > 0,
    folderCount: neededLids.size,
  };
}

// ── Plan building ───────────────────────────────────

/**
 * Build a batch import plan from a parsed import result and selection.
 *
 * Pure function. Returns either:
 * - `{ ok: true, plan }`: valid plan with folder restore (if applicable)
 * - `{ ok: false, error, fallbackPlan }`: folder graph invalid,
 *   fallback to flat import. Content entries are preserved.
 */
export function buildBatchImportPlan(
  input: PlannerInput,
  selectedIndices: Set<number>,
): BatchImportPlanResult {
  // Filter to selected entries
  const selectedEntries: BatchImportPlanEntry[] = [];
  for (let i = 0; i < input.entries.length; i++) {
    if (!selectedIndices.has(i)) continue;
    const entry = input.entries[i]!;
    // Collect assets from attachments
    const assets: Record<string, string> = {};
    for (const att of entry.attachments) {
      assets[att.assetKey] = att.data;
    }
    // Map attachments to plan format
    const attachments: BatchImportPlanAttachment[] = entry.attachments.map((att) => ({
      name: att.name,
      body: JSON.stringify({ name: att.name, mime: att.mime, size: att.size, asset_key: att.assetKey }),
      assetKey: att.assetKey,
      assetData: att.data,
    }));
    selectedEntries.push({
      archetype: entry.archetype,
      title: entry.title,
      body: entry.body,
      parentFolderOriginalLid: entry.parentFolderLid,
      assets,
      attachments,
    });
  }

  // Build flat plan (no folder restore)
  const targetLid = input.targetFolderLid ?? null;
  const flatPlan: BatchImportPlan = {
    folders: [],
    entries: selectedEntries.map((e) => ({ ...e, parentFolderOriginalLid: undefined })),
    source: input.source,
    format: input.format,
    restoreStructure: false,
    targetFolderLid: targetLid,
  };

  // No folders → flat import (this is not an error, just no restore)
  if (!input.folders || input.folders.length === 0) {
    return { ok: true, plan: flatPlan };
  }

  // Validate folder graph (map plan field names to validation field names)
  const validationEntries = selectedEntries.map((e) => ({ parentFolderLid: e.parentFolderOriginalLid }));
  const validation = validateFolderGraph(input.folders, validationEntries);
  if (!validation.valid) {
    return {
      ok: false,
      error: validation.warnings.join('; '),
      fallbackPlan: flatPlan,
    };
  }

  // Compute needed folders: ancestors of selected entries
  const folderByLid = new Map(input.folders.map((f) => [f.lid, f]));
  const neededFolderLids = new Set<string>();
  for (const entry of selectedEntries) {
    let cur = entry.parentFolderOriginalLid;
    while (cur && !neededFolderLids.has(cur)) {
      neededFolderLids.add(cur);
      const folder = folderByLid.get(cur);
      cur = folder?.parentLid ?? undefined;
    }
  }

  // Topological sort: parent before child
  const sorted: BatchImportPlanFolder[] = [];
  const placed = new Set<string>();
  const remaining = input.folders.filter((f) => neededFolderLids.has(f.lid));

  let lastSortedLength = -1;
  while (sorted.length < remaining.length && sorted.length !== lastSortedLength) {
    lastSortedLength = sorted.length;
    for (const f of remaining) {
      if (placed.has(f.lid)) continue;
      if (f.parentLid === null || placed.has(f.parentLid)) {
        sorted.push({
          originalLid: f.lid,
          title: f.title,
          parentOriginalLid: f.parentLid,
        });
        placed.add(f.lid);
      }
    }
  }

  // If not all needed folders were placed, the graph has unresolvable issues
  // (should not happen after validation, but defensive)
  if (sorted.length < remaining.length) {
    return {
      ok: false,
      error: 'Could not topologically sort folder hierarchy',
      fallbackPlan: flatPlan,
    };
  }

  return {
    ok: true,
    plan: {
      folders: sorted,
      entries: selectedEntries,
      source: input.source,
      format: input.format,
      restoreStructure: true,
      targetFolderLid: targetLid,
    },
  };
}
