import type { Container } from '../model/container';

/**
 * PendingOfferRef: minimal reference for offer-related commands.
 * Avoids importing adapter types into core by using a structural type.
 */
export interface PendingOfferRef {
  offer_id: string;
  title: string;
  body: string;
  archetype: string;
  source_container_id: string | null;
  reply_to_id: string | null;
  received_at: string;
}

/**
 * ImportPreviewRef: summary of an import candidate for confirmation.
 * Structural type to avoid importing adapter types into core.
 */
export interface ImportPreviewRef {
  /** Title of the container to be imported. */
  title: string;
  /** Container ID of the import source. */
  container_id: string;
  /** Number of entries in the import. */
  entry_count: number;
  /** Number of revisions in the import. */
  revision_count: number;
  /** Schema version of the import. */
  schema_version: number;
  /** Source filename or description. */
  source: string;
  /** The validated Container, ready for replacement on confirm. */
  container: Container;
}

/**
 * Per-entry metadata from the batch bundle manifest.
 * Used by the preview UI to show a selectable entry list.
 */
export interface BatchImportPreviewEntry {
  index: number;
  title: string;
  archetype: 'text' | 'textlog';
  /** First ~200 chars of body (TEXT). Optional — absent if peek fails. */
  bodySnippet?: string;
  /** TEXT: body.md char count. */
  bodyLength?: number;
  /** TEXTLOG: number of log entries. */
  logEntryCount?: number;
  /** TEXTLOG: first 3 log entry texts, each truncated to ~80 chars. */
  logSnippets?: string[];
  /** Number of resolved assets in the nested bundle. */
  assetCount?: number;
  /** Number of missing assets in the nested bundle. */
  missingAssetCount?: number;
}

/**
 * BatchImportPreviewInfo: lightweight metadata from the batch bundle manifest.
 * All primitives — no adapter types needed.
 */
export interface BatchImportPreviewInfo {
  format: string;
  formatLabel: string;
  textCount: number;
  textlogCount: number;
  totalEntries: number;
  compacted: boolean;
  missingAssetCount: number;
  isFolderExport: boolean;
  sourceFolderTitle: string | null;
  /** Whether folder structure can be restored on import. */
  canRestoreFolderStructure: boolean;
  /** Number of folders in the hierarchy (0 if no restore). */
  folderCount: number;
  /** Folder graph validation failed → will fall back to flat import. */
  malformedFolderMetadata?: boolean;
  /** Human-readable reason (from validateFolderGraph warnings). */
  folderGraphWarning?: string;
  source: string;
  /** Per-entry metadata (title + archetype). */
  entries: BatchImportPreviewEntry[];
  /** Indices of entries selected for import (default: all). */
  selectedIndices: number[];
  /** Raw folder metadata for selection-aware classification recomputation. */
  folderMetadata?: { lid: string; title: string; parentLid: string | null }[];
  /** Per-entry parent folder LID for classification. Indexed by entry index. */
  entryFolderRefs?: (string | undefined)[];
  /** LID of the target folder in the current container for import. null = root. */
  targetFolderLid?: string | null;
}

// ── Batch import plan types ─────────────────────────

export interface BatchImportPlanFolder {
  originalLid: string;
  title: string;
  parentOriginalLid: string | null;
}

export interface BatchImportPlanAttachment {
  name: string;
  body: string;
  assetKey: string;
  assetData: string;
}

export interface BatchImportPlanEntry {
  archetype: 'text' | 'textlog';
  title: string;
  body: string;
  parentFolderOriginalLid?: string;
  assets: Record<string, string>;
  attachments: BatchImportPlanAttachment[];
}

export interface BatchImportPlan {
  /** Folders to create, in topological order (parent first). */
  folders: BatchImportPlanFolder[];
  /** Content entries to create. */
  entries: BatchImportPlanEntry[];
  /** Source filename. */
  source: string;
  /** Format string. */
  format: string;
  /** Whether folder structure is being restored. */
  restoreStructure: boolean;
  /** LID of existing target folder in container. null/undefined = root. */
  targetFolderLid?: string | null;
}

/** Compact summary of a completed batch import, for UI feedback. */
export interface BatchImportResultSummary {
  entryCount: number;
  attachmentCount: number;
  folderCount: number;
  restoreStructure: boolean;
  /** Actual destination used: "/ (Root)" or folder title. */
  actualDestination: string;
  /** Intended destination if fallback occurred: folder title. null if no fallback. */
  intendedDestination: string | null;
  /** True when the user chose a target folder but it was unavailable at apply time. */
  fallbackToRoot: boolean;
  source: string;
}

/**
 * SystemCommand: commands issued by the runtime or infrastructure,
 * not directly by the user.
 *
 * Examples: rehydrate completion, export finish, system-level errors.
 *
 * Naming: SYS_ prefix to distinguish from UserAction at a glance.
 * All type literals are string constants (minify-safe).
 */
export type SystemCommand =
  | { type: 'SYS_INIT_COMPLETE'; container: Container; embedded?: boolean; readonly?: boolean; lightSource?: boolean }
  | { type: 'SYS_INIT_ERROR'; error: string }
  | { type: 'SYS_FINISH_EXPORT' }
  | { type: 'SYS_IMPORT_COMPLETE'; container: Container; source: string }
  | { type: 'SYS_IMPORT_PREVIEW'; preview: ImportPreviewRef }
  | { type: 'SYS_BATCH_IMPORT_PREVIEW'; preview: BatchImportPreviewInfo }
  | { type: 'SYS_APPLY_BATCH_IMPORT'; plan: BatchImportPlan }
  | { type: 'SYS_RECORD_OFFERED'; offer: PendingOfferRef }
  | { type: 'SYS_ERROR'; error: string };

/** Extract the type literal from a SystemCommand. */
export type SystemCommandType = SystemCommand['type'];
