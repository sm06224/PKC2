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
  /**
   * #804 additive: sender の envelope-level correlation_id(null = 無し)。
   * OFFER_ACCEPTED / OFFER_DISMISSED event への echo 用に reducer が保持する。
   */
  correlation_id?: string | null;
  /**
   * #805 additive: accept 時 mint で付与する tags / color_tag(同意 banner
   * で表示済みのもの)。handler 側で検証・正規化済み(tags は trim/重複除去/
   * 件数・長さ上限、color_tag は既知 palette ID のみ)。null = 付与しない。
   */
  tags?: string[] | null;
  color_tag?: string | null;
  /** SR-14 additive(#806): 出典 mime / filename(accept 時 frontmatter 注入)。 */
  mime_type?: string | null;
  filename?: string | null;
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
  | { type: 'SYS_INIT_COMPLETE'; container: Container; embedded?: boolean; readonly?: boolean; lightSource?: boolean; viewOnlySource?: boolean; bodiesDeferred?: boolean }
  /**
   * #940 案 A 段階2: meta-first boot の本文 background 復元。lid → body の
   * map を container.entries へ merge する。**本文が '' の entry にだけ**
   * 適用する(boot 後にユーザーが書いた本文を上書きしない)。
   */
  | { type: 'SYS_BODIES_LOADED'; bodies: Record<string, string>; partial?: boolean }
  | { type: 'SYS_INIT_ERROR'; error: string }
  /**
   * C11 §4.5 ④-1: ブラウザ保存フォールバック掲示で「閲覧のみ」を選んだ
   * 時の post-boot readonly 化。編集 UI を抑止する(SYS_INIT_COMPLETE の
   * readonly と同じ扱いに切り替える)。逆方向(readonly 解除)は提供
   * しない — 通常モードへの復帰は reload(再 probe)経由。
   */
  | { type: 'SYS_ENTER_READONLY' }
  | { type: 'SYS_FINISH_EXPORT' }
  | { type: 'SYS_IMPORT_COMPLETE'; container: Container; source: string }
  | { type: 'SYS_IMPORT_PREVIEW'; preview: ImportPreviewRef }
  | { type: 'SYS_BATCH_IMPORT_PREVIEW'; preview: BatchImportPreviewInfo }
  | { type: 'SYS_APPLY_BATCH_IMPORT'; plan: BatchImportPlan }
  | { type: 'SYS_RECORD_OFFERED'; offer: PendingOfferRef }
  /**
   * Phase γ-A3:child entry-window の open/close 同期。entry-window.ts が
   * window を開いた / 閉じたタイミングで、現在開いている全 lid を載せて
   * dispatch する。reducer は phase に依らず `childWindowLids` を更新し、
   * state machine が multi-window を前提として扱えるようにする。
   */
  | { type: 'SYS_SYNC_CHILD_WINDOWS'; lids: readonly string[] }
  /**
   * Set the list of stored containers for the same-origin container
   * switcher (#771/#773 MVP). Populated at boot from
   * `store.listContainers()`; consumed only by the Storage Profile
   * dialog. Runtime-only (never persisted).
   */
  | { type: 'SYS_SET_AVAILABLE_CONTAINERS'; containers: readonly { id: string; title: string }[] }
  /**
   * Set the stored workspaces + active workspace id for the workspace
   * switcher (#773). Populated at boot; consumed by the Storage Profile
   * dialog. Runtime-only.
   */
  | { type: 'SYS_SET_WORKSPACES'; workspaces: readonly { id: string; name: string }[]; activeWorkspaceId: string | null }
  /**
   * 段階3 (#868, working-set lazy loading): replace `container.assets`
   * wholesale with the current working-set (the assets the visible
   * view references, loaded on demand from the store, minus LRU-evicted
   * bytes). Issued only by the working-set manager — never by the user.
   * Runtime-only: it mutates only the in-memory `container.assets`
   * map and is NOT a persistence save trigger (the bytes already live
   * in the store; `save()` is additive-only so even an accidental save
   * cannot lose them).
   */
  | { type: 'SET_WORKING_SET_ASSETS'; assets: Record<string, string> }
  | { type: 'SYS_ERROR'; error: string };

/** Extract the type literal from a SystemCommand. */
export type SystemCommandType = SystemCommand['type'];
