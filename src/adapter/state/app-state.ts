import type { Container } from '../../core/model/container';
import type { ArchetypeId, Entry } from '../../core/model/record';
import { isReservedLid, SETTINGS_LID } from '../../core/model/record';
import type { ExportMode, ExportMutability } from '../../core/action/user-action';
import type { Dispatchable } from '../../core/action';
import type { DomainEvent } from '../../core/action/domain-event';
import type { ImportPreviewRef, BatchImportPreviewInfo, BatchImportResultSummary } from '../../core/action/system-command';
import type { PendingOffer } from '../transport/record-offer-handler';
import type { SortKey, SortDirection } from '../../features/search/sort';
import { classifyFolderRestore } from '../../features/batch-import/import-planner';
import {
  addEntry,
  updateEntry,
  updateEntryTags,
  removeEntry,
  nextSelectedAfterRemove,
  addRelation,
  removeRelation,
  updateRelationKind,
  snapshotEntry,
  restoreEntry,
  restoreDeletedEntry,
  branchRestoreRevision,
  mergeAssets,
  purgeTrash,
} from '../../core/operations/container-ops';
import { normalizeTagInput } from '../../features/tag/normalize';
import {
  captureEditBase,
  checkSaveConflict,
  branchFromDualEditConflict,
  type EditBaseSnapshot,
  type SaveConflictCheck,
} from '../../core/operations/dual-edit-safety';
import { removeOrphanAssets } from '../../features/asset/asset-scan';
import { planMergeImport, applyMergePlan } from '../../features/import/merge-planner';
import { applyConflictResolutions } from '../../features/import/conflict-detect';
import type { EntryConflict, Resolution } from '../../core/model/merge-conflict';
import {
  type SystemSettingsPayload,
  SETTINGS_DEFAULTS,
  isValidHexColor,
  isValidThemeMode,
  isValidFontFamily,
  isValidLanguageTag,
  isValidTimezone,
} from '../../core/model/system-settings-payload';
import type { ProvenanceRelationData } from '../../features/import/conflict-detect';
import { parseTodoBody, serializeTodoBody } from '../../features/todo/todo-body';
import { getAncestorFolderLids, isDescendant } from '../../features/relation/tree';
import { resolveAutoPlacementFolder, findSubfolder } from '../../features/relation/auto-placement';
import { applyFilters } from '../../features/search/filter';
import { filterByTag } from '../../features/relation/tag-filter';
import {
  applyManualOrder,
  ensureEntryOrder,
  moveAdjacentInOrder,
  snapshotEntryOrder,
  type MoveDirection,
} from '../../features/entry-order/entry-order';
import {
  createSavedSearch,
  applySavedSearchFields,
} from '../../features/search/saved-searches';
import { SAVED_SEARCH_CAP } from '../../core/model/saved-search';
import { buildLinkMigrationPreview } from '../../features/link/migration-scanner';
import { applyLinkMigrations } from '../../features/link/migration-apply';

/**
 * AppPhase: explicit state machine to prevent operation-order bugs.
 * Each phase defines which Dispatchable actions are permitted.
 */
export type AppPhase =
  | 'initializing'
  | 'ready'
  | 'editing'
  | 'exporting'
  | 'error';

/**
 * AppState: runtime-only UI state.
 *
 * `container` is a reference to the persistent domain model,
 * but selection/phase/error are purely runtime concerns.
 */
export interface AppState {
  phase: AppPhase;
  container: Container | null;
  selectedLid: string | null;
  editingLid: string | null;
  error: string | null;
  /** True when running inside an iframe. Set once at init. */
  embedded: boolean;
  /** Pending record offers (runtime-only, not persisted). */
  pendingOffers: PendingOffer[];
  /** Import preview awaiting user confirmation (runtime-only). */
  importPreview: ImportPreviewRef | null;
  /**
   * Import mode for the pending preview (Tier 3-1, merge import).
   * - 'replace' (default when absent): CONFIRM_IMPORT will fully
   *   replace the container.
   * - 'merge': CONFIRM_MERGE_IMPORT will overlay imported onto host.
   * Meaningful only while `importPreview !== null`; reset to 'replace'
   * when preview is cleared. Optional so test fixtures that predate
   * Tier 3-1 keep compiling; read sites treat undefined as 'replace'.
   * See docs/spec/merge-import-conflict-resolution.md.
   */
  importMode?: 'replace' | 'merge';
  mergeConflicts?: EntryConflict[];
  mergeConflictResolutions?: Record<string, Resolution>;
  /**
   * Pending sub-location navigation (S-18 / A-4 FULL, 2026-04-14).
   *
   * Set by `NAVIGATE_TO_LOCATION`. The post-render effect in
   * `main.ts` reads this after every render, compares `ticket`
   * against the last-seen value, and — if new — resolves the
   * `subId` to a DOM element, scrolls it into view, and temporarily
   * flashes `pkc-location-highlight`. The state field is NOT
   * cleared by the reducer; the effect is idempotent because it
   * only fires on ticket advances.
   *
   * Optional so existing AppState literal fixtures keep compiling
   * (same pattern as `importMode`). Read sites treat undefined as
   * "no pending navigation".
   *
   * See docs/development/search-ux-partial-reach.md.
   */
  pendingNav?: { subId: string; ticket: number } | null;
  /** Batch import preview awaiting user confirmation (runtime-only). */
  batchImportPreview: BatchImportPreviewInfo | null;
  /** Batch import result summary for UI feedback (runtime-only, transient). */
  batchImportResult: BatchImportResultSummary | null;
  /** Current search/filter query (runtime-only, feature layer). */
  searchQuery: string;
  /** Current archetype filter (runtime-only, feature layer). Empty set = show all. */
  archetypeFilter: ReadonlySet<ArchetypeId>;
  /**
   * Whether the Secondary tier of the archetype filter bar is expanded.
   * Optional so test fixtures that predate FI-09 keep compiling.
   * Read sites treat undefined as false.
   */
  archetypeFilterExpanded?: boolean;
  /**
   * Whether the CRT scanline overlay is visible (FI-12 v1).
   * Optional so test fixtures that predate FI-12 keep compiling.
   * undefined is equivalent to false. Session-only; not persisted.
   */
  showScanline?: boolean;
  /**
   * User-chosen accent color override (FI-12 follow-up).
   * Hex string like '#33ff66'. undefined = use the CSS default
   * (`--c-accent` from base.css, which is the neon green token).
   * Session-only; not persisted. Future persistence is planned via
   * the hidden system settings entry (see
   * `docs/spec/system-settings-hidden-entry-v1-minimum-scope.md`).
   */
  accentColor?: string;
  /**
   * Resolved system settings (FI-Settings v1, 2026-04-18).
   *
   * Persistent: mirrored to the reserved `__settings__` entry via the
   * `SETTINGS_CHANGED` domain event. Absent for legacy test fixtures
   * and the brief pre-RESTORE_SETTINGS window at boot; consumers treat
   * undefined as `SETTINGS_DEFAULTS` (see `resolveSettings`).
   *
   * `showScanline` / `accentColor` above remain as a read-compat
   * mirror and are kept in sync by every reducer path that mutates
   * `settings.theme.*`. Do not add new code that writes those mirror
   * fields without also updating `settings`.
   */
  settings?: SystemSettingsPayload;
  /**
   * W1 Slice D — Free-form Tag filter axis.
   *
   * `Set<string>` of normalized Tag values. Empty set / absent =
   * Tag axis off. Non-empty = AND-by-default over every value
   * (spec: `docs/spec/search-filter-semantics-v1.md` §4.2).
   *
   * Independent from `categoricalPeerFilter` below — the two axes
   * coexist (spec §3). Runtime-only, not persisted. Saved Search
   * round-trip for Tag filter lands in Slice E.
   *
   * Optional on the TS surface so legacy test fixtures that hand-
   * spell AppState don't need updating before the Tag UI lands;
   * every read path treats absent as equivalent to an empty Set.
   */
  tagFilter?: ReadonlySet<string>;
  /**
   * Categorical relation peer filter. Stores the lid of a "tag entry"
   * (categorical relation `to` endpoint) to filter by. Runtime-only.
   * `null` = no filter active.
   *
   * Rename note (W1 Slice B followup): this field used to be called
   * `tagFilter`. The new free-form Tag concept (see
   * `docs/spec/tag-color-tag-relation-separation.md` §3.1) needs the
   * `tag`/`Tag` name for itself, so this field was renamed with no
   * semantic change. Filter path is still categorical-relation based.
   */
  categoricalPeerFilter: string | null;
  /** Current sort key (runtime-only, feature layer). */
  sortKey: SortKey;
  /** Current sort direction (runtime-only, feature layer). */
  sortDirection: SortDirection;
  /** Export mode for the current export operation (runtime-only). */
  exportMode: ExportMode | null;
  /** Export mutability for the current export operation (runtime-only). */
  exportMutability: ExportMutability | null;
  /** True when running as a readonly artifact. Suppresses edit UI. */
  readonly: boolean;
  /** True when container was loaded from a Light export (no assets). Suppresses IDB save. */
  lightSource: boolean;
  /**
   * True when container was booted from embedded pkc-data (exported
   * HTML). Suppresses IDB save: opening an HTML must not contaminate
   * the receiver's IndexedDB. Cleared by explicit Import operations
   * (CONFIRM_IMPORT / SYS_IMPORT_COMPLETE / CONFIRM_MERGE_IMPORT) so
   * that post-import edits persist normally. See
   * `docs/development/boot-container-source-policy-revision.md`.
   *
   * Optional in the TS surface so existing test fixtures that spell
   * out AppState by hand remain valid without updates. Reducer paths
   * always initialize to `false` via `createInitialState()`.
   */
  viewOnlySource?: boolean;
  /** Shell menu open/close state. Runtime-only, not persisted. */
  menuOpen?: boolean;
  /**
   * "Normalize PKC links" preview dialog open/close state
   * (Phase 2 Slice 2). Runtime-only, not persisted. When `true` the
   * renderer mounts the preview overlay via
   * `syncLinkMigrationDialogFromState`.
   */
  linkMigrationDialogOpen?: boolean;
  /**
   * Result of the most recent APPLY_LINK_MIGRATION dispatch
   * (Phase 2 Slice 3). Runtime-only, not persisted. Reset to
   * `undefined` on OPEN_LINK_MIGRATION_DIALOG so the dialog opens
   * without a stale banner. Read by the preview dialog to render
   * "Applied N candidates across M entries" + skipped count.
   */
  linkMigrationLastApplyResult?: {
    readonly applied: number;
    readonly skipped: number;
    readonly entriesAffected: number;
    readonly at: string;
  };
  /** Show archived todos in sidebar. Runtime-only, not persisted. Default off. */
  showArchived: boolean;
  /** Current center pane view mode. Runtime-only. */
  viewMode: 'detail' | 'calendar' | 'kanban';
  /** Calendar navigation: year. Runtime-only. */
  calendarYear: number;
  /** Calendar navigation: month (1-12). Runtime-only. */
  calendarMonth: number;
  /** Multi-selection: additional selected entry lids (Ctrl/Shift+click). Runtime-only. */
  multiSelectedLids: string[];
  /**
   * Sidebar folder collapse state: lids of folders that are collapsed.
   * Folders default to expanded. Runtime-only, not persisted.
   */
  collapsedFolders: string[];
  /**
   * Sidebar Recent Entries pane collapse state. Runtime-only, not
   * persisted. Initial value is `true` (S3 — default closed): a
   * fresh session starts with the pane collapsed so the sidebar tree
   * is unobstructed on first mount. Once the user toggles the pane,
   * state persists across re-renders via the PR-γ wiring. Optional
   * on the TS surface so legacy test fixtures that spell out
   * AppState by hand remain valid without updates.
   */
  recentPaneCollapsed?: boolean;
  /**
   * Storage Profile overlay visibility. Runtime-only, not persisted.
   * `false` (default) = overlay closed. When `true`, the renderer
   * rebuilds the Storage Profile overlay on every render pass so the
   * numbers always reflect the live container. Optional on the TS
   * surface so legacy test fixtures stay valid.
   */
  storageProfileOpen?: boolean;
  /**
   * Shortcut-help overlay visibility. Runtime-only, not persisted.
   * `false` (default) = overlay closed. Mirrors `storageProfileOpen`
   * so the shortcut overlay is owned by the renderer and survives a
   * subsequent `CLOSE_MENU` re-render (B1 fix: previously the
   * `show-shortcut-help` handler mutated DOM directly, then the
   * re-render wiped the overlay on the same tick). Optional on the TS
   * surface so legacy test fixtures stay valid.
   */
  shortcutHelpOpen?: boolean;
  /**
   * Todo "+ Add" popover state (Slice 1 of the Todo / Editor-in /
   * continuous-edit wave, extended by Slice 2 to carry Calendar
   * context as well). Runtime-only, not persisted. When `null` or
   * absent the popover is closed; when present the renderer mounts a
   * small input popover anchored to the view surface whose context
   * matches, so a new Todo created through the popover inherits the
   * context value as its body field:
   *
   * - `context === 'kanban'` → `body.status` = `status`
   * - `context === 'calendar'` → `body.date` = `date`
   *
   * Only one popover is open at a time (Kanban and Calendar are
   * mutually exclusive view modes). See
   * `docs/development/todo-editor-in-continuous-edit-wave.md §4.7`.
   */
  todoAddPopover?:
    | { context: 'kanban'; status: 'open' | 'done' }
    | { context: 'calendar'; date: string }
    | null;
  /**
   * entry-ref autocomplete v1.3: LRU of lids accepted from the
   * autocomplete popup (most recent first). Powers recent-first
   * ordering of suggestions. Runtime-only, not persisted. Capped at
   * 20 entries. Does NOT include generic SELECT_ENTRY navigation.
   */
  recentEntryRefLids: string[];
  /**
   * TEXTLOG → TEXT log-selection mode (Slice 4 / P1-1). Runtime-only.
   *
   * `null` (or absent) when no selection is active. The presence of
   * this object is what the viewer uses to decide whether to render
   * the selection toolbar + per-log checkboxes. See
   * `docs/development/textlog-text-conversion.md` §2 and the §6.x
   * clear-semantics contract added in P1-1 (2026-04-13).
   *
   * Optional in the TS surface so existing test fixtures that spell
   * out AppState by hand remain valid without updates. Reducer paths
   * always initialize to `null` via `createInitialState()`.
   */
  textlogSelection?: TextlogSelectionState | null;
  /**
   * TEXT → TEXTLOG preview modal state (Slice 5 / P1-1). Runtime-only.
   *
   * `null` (or absent) when the modal is closed. The renderer mounts
   * / unmounts the modal DOM by observing this field. The user-edited
   * title is kept in the DOM input during the preview session (not
   * mirrored here) to keep keystrokes out of the dispatch loop.
   */
  textToTextlogModal?: TextToTextlogModalState | null;
  /**
   * FI-01 dual-edit-safety v1 (2026-04-17). Base-version snapshot
   * captured at `BEGIN_EDIT`; read by `COMMIT_EDIT` to run
   * `checkSaveConflict`. Cleared on `COMMIT_EDIT` (safe), `CANCEL_EDIT`,
   * and every `RESOLVE_DUAL_EDIT_CONFLICT` path.
   *
   * Optional so test fixtures that predate FI-01 keep compiling. A
   * `null` value means "no base captured" — the guard is skipped
   * (legacy permissive path).
   */
  editingBase?: EditBaseSnapshot | null;
  /**
   * FI-01 dual-edit-safety v1 (2026-04-17). Populated when
   * `COMMIT_EDIT` is rejected by the save-time optimistic version
   * guard. While non-null, the UI slice mounts the reject overlay and
   * blocks further commits for the same lid until the user picks a
   * resolution via `RESOLVE_DUAL_EDIT_CONFLICT`.
   *
   * Contract:
   * `docs/spec/dual-edit-safety-v1-behavior-contract.md` §5.
   */
  dualEditConflict?: DualEditConflictState | null;
}

/**
 * FI-01 dual-edit-safety v1 conflict record.
 *
 * Holds everything the overlay and the resolution reducer need to
 * proceed without re-running the guard or re-reading the container:
 *
 * - `lid` / `base` / `draft`: the identity of the rejected save.
 * - `kind`: the classification returned by `checkSaveConflict`.
 *   v1 UI does not differentiate but keeps the information for tests
 *   / future richer UX.
 * - `currentUpdatedAt` / `currentContentHash` / `currentArchetype`:
 *   snapshot of the *losing-side* reference at reject time (diagnostic
 *   only; the overlay itself does not show them in v1).
 * - `copyRequestTicket`: incremented on every
 *   `RESOLVE_DUAL_EDIT_CONFLICT { resolution: 'copy-to-clipboard' }`.
 *   A UI-side consumer observes advances and writes `draft.body` to
 *   the clipboard; the reducer itself never touches clipboard APIs.
 */
export interface DualEditConflictState {
  lid: string;
  base: EditBaseSnapshot;
  draft: { title: string; body: string; assets?: Record<string, string> };
  kind: Exclude<SaveConflictCheck, { kind: 'safe' }>['kind'];
  currentUpdatedAt?: string;
  currentContentHash?: string;
  currentArchetype?: import('../../core/model/record').ArchetypeId;
  copyRequestTicket?: number;
}

/**
 * Log-selection state for the TEXTLOG → TEXT conversion flow.
 *
 * `selectedLogIds` is a plain array (not Set) so the whole AppState
 * remains serializable — matching every other runtime field that is
 * expected to survive a `dispatcher.getState()` snapshot. Duplicates
 * are not allowed; the reducer dedupes on TOGGLE.
 */
export interface TextlogSelectionState {
  activeLid: string;
  selectedLogIds: string[];
}

/**
 * TEXT → TEXTLOG preview modal identity. `splitMode` is the only
 * input that can be changed while the modal is open; the preview body
 * itself is recomputed on demand from (source entry × splitMode).
 */
export interface TextToTextlogModalState {
  sourceLid: string;
  splitMode: 'heading' | 'hr';
}

/**
 * ReduceResult: state transition + emitted domain events.
 * Events are side-effects of a successful transition.
 */
export interface ReduceResult {
  state: AppState;
  events: DomainEvent[];
}

export function createInitialState(): AppState {
  return {
    phase: 'initializing',
    container: null,
    selectedLid: null,
    editingLid: null,
    error: null,
    embedded: false,
    pendingOffers: [],
    importPreview: null,
    importMode: 'replace',
    pendingNav: null,
    batchImportPreview: null,
    batchImportResult: null,
    searchQuery: '',
    archetypeFilter: new Set<ArchetypeId>(),
    archetypeFilterExpanded: false,
    tagFilter: new Set<string>(),
    showScanline: false,
    accentColor: undefined,
    // FI-Settings v1: left undefined until main.ts dispatches
    // RESTORE_SETTINGS after boot. The renderer and reducer both treat
    // undefined as "use SETTINGS_DEFAULTS (or the mirror fields)",
    // which lets pre-RESTORE_SETTINGS fixtures and legacy test
    // fixtures that only populate showScanline / accentColor continue
    // to drive the DOM through the mirror-fallback path.
    settings: undefined,
    categoricalPeerFilter: null,
    sortKey: 'title',
    sortDirection: 'asc',
    exportMode: null,
    exportMutability: null,
    readonly: false,
    lightSource: false,
    viewOnlySource: false,
    showArchived: false,
    viewMode: 'detail',
    calendarYear: new Date().getFullYear(),
    calendarMonth: new Date().getMonth() + 1,
    multiSelectedLids: [],
    collapsedFolders: [],
    recentPaneCollapsed: true,
    storageProfileOpen: false,
    shortcutHelpOpen: false,
    todoAddPopover: null,
    recentEntryRefLids: [],
    textlogSelection: null,
    textToTextlogModal: null,
    editingBase: null,
    dualEditConflict: null,
  };
}

/** Get all selected lids (primary + multi). */
export function getAllSelected(state: AppState): string[] {
  const set = new Set(state.multiSelectedLids);
  if (state.selectedLid) set.add(state.selectedLid);
  return Array.from(set);
}

/**
 * Recompute folder restore classification when selection changes.
 * Pure helper — returns updated preview info with new selectedIndices + classification.
 */
function reclassifyPreview(
  preview: BatchImportPreviewInfo,
  selectedIndices: number[],
): BatchImportPreviewInfo {
  if (!preview.folderMetadata || !preview.entryFolderRefs) {
    return { ...preview, selectedIndices };
  }
  const entryRefs = preview.entryFolderRefs.map((ref) => ({ parentFolderLid: ref }));
  const classification = classifyFolderRestore(preview.folderMetadata, entryRefs, selectedIndices);
  return {
    ...preview,
    selectedIndices,
    canRestoreFolderStructure: classification.canRestoreFolderStructure,
    folderCount: classification.folderCount,
    malformedFolderMetadata: classification.malformedFolderMetadata,
    folderGraphWarning: classification.folderGraphWarning,
  };
}

/**
 * Pure reducer: (state, action) → (state', events[]).
 *
 * Phase-first switch ensures operation-order safety.
 * Unhandled actions in a phase return the same state with no events,
 * plus a console.warn in development.
 */
export function reduce(state: AppState, action: Dispatchable): ReduceResult {
  switch (state.phase) {
    case 'initializing':
      return reduceInitializing(state, action);
    case 'ready':
      return reduceReady(state, action);
    case 'editing':
      return reduceEditing(state, action);
    case 'exporting':
      return reduceExporting(state, action);
    case 'error':
      return reduceError(state, action);
  }
}

function blocked(state: AppState, action: Dispatchable): ReduceResult {
  console.warn(`[PKC2] Action "${action.type}" blocked in phase "${state.phase}"`);
  return { state, events: [] };
}

function now(): string {
  return new Date().toISOString();
}

/**
 * Inject the v0 capture provenance header per
 * `docs/spec/record-offer-capture-profile.md` §10.4. Header lines are
 * emitted only for fields explicitly provided (non-null, non-empty
 * strings); when neither is provided the body is returned unchanged so
 * the existing ACCEPT_OFFER behavior stays bit-for-bit compatible.
 *
 * Format:
 *   > Source: <url>
 *   > Captured: <iso>
 *   <single blank line>
 *   <original body>
 *
 * Order is fixed: Source then Captured (spec §10.4).
 */
function injectCaptureHeader(body: string, sourceUrl: string | null, capturedAt: string | null): string {
  const lines: string[] = [];
  if (sourceUrl) lines.push(`> Source: ${sourceUrl}`);
  if (capturedAt) lines.push(`> Captured: ${capturedAt}`);
  if (lines.length === 0) return body;
  return `${lines.join('\n')}\n\n${body}`;
}

/**
 * FI-Settings v1 (2026-04-18): read the effective SystemSettingsPayload
 * for a state, synthesizing it from the legacy mirror fields when
 * `state.settings` has not been populated yet (pre-RESTORE_SETTINGS
 * boot window, or legacy test fixtures). This keeps single-action
 * reducer paths stable against fixtures that still only set
 * `showScanline` / `accentColor`.
 */
function currentSettings(state: AppState): SystemSettingsPayload {
  if (state.settings) return state.settings;
  return {
    ...SETTINGS_DEFAULTS,
    theme: {
      ...SETTINGS_DEFAULTS.theme,
      scanline: state.showScanline === true,
      accentColor: state.accentColor ?? null,
    },
  };
}

/**
 * FI-Settings v1 (2026-04-18): apply a resolved SystemSettingsPayload
 * to state, keeping the legacy `showScanline` / `accentColor` mirror
 * fields in sync, upsert the reserved `__settings__` entry in the
 * container, and emit a single `SETTINGS_CHANGED` event carrying the
 * new payload verbatim for downstream persistence / renderer
 * subscribers.
 *
 * The container upsert happens inline so persistence only needs to
 * hear the one `SETTINGS_CHANGED` event and call `save(container)`
 * — the entry is already materialized when the event fires. No
 * dedicated `ENTRY_UPDATED` / `ENTRY_CREATED` event is emitted for
 * this path so revision-history subscribers don't treat a theme tweak
 * as user-content edit.
 *
 * Callers are expected to have already performed any input validation
 * and produced the full next payload. A separate early-return (same
 * state reference, empty events) is used at each call site when no
 * effective change is needed.
 */
function applySettingsUpdate(
  state: AppState,
  next: SystemSettingsPayload,
): ReduceResult {
  const nextState: AppState = {
    ...state,
    container: upsertSettingsEntry(state.container, next),
    settings: next,
    showScanline: next.theme.scanline,
    accentColor: next.theme.accentColor ?? undefined,
  };
  return {
    state: nextState,
    events: [{ type: 'SETTINGS_CHANGED', settings: next }],
  };
}

/**
 * Upsert the reserved `__settings__` entry into a container with the
 * given payload as its JSON body. No-op when `container` is null
 * (pre-boot). Preserves `created_at` on updates; sets both timestamps
 * on fresh inserts.
 */
function upsertSettingsEntry(
  container: Container | null,
  settings: SystemSettingsPayload,
): Container | null {
  if (!container) return container;
  const body = JSON.stringify(settings, null, 2);
  const ts = now();
  const existingIdx = container.entries.findIndex((e) => e.lid === SETTINGS_LID);
  if (existingIdx >= 0) {
    const existing = container.entries[existingIdx]!;
    // Stable identity: if the body is literally unchanged (possible via
    // RESTORE_SETTINGS round-trip), don't bump updated_at or allocate a
    // new entries array. Callers already early-return on field-equal
    // no-op, but this defends against stringify-order edge cases.
    if (existing.body === body && existing.archetype === 'system-settings') {
      return container;
    }
    const updated: Entry = {
      ...existing,
      body,
      archetype: 'system-settings',
      title: existing.title || 'System Settings',
      updated_at: ts,
    };
    const nextEntries = container.entries.slice();
    nextEntries[existingIdx] = updated;
    return { ...container, entries: nextEntries };
  }
  const created: Entry = {
    lid: SETTINGS_LID,
    title: 'System Settings',
    body,
    archetype: 'system-settings',
    created_at: ts,
    updated_at: ts,
  };
  return { ...container, entries: [...container.entries, created] };
}

/** Expand `#rgb` → `#rrggbb`; pass through 6-char input (already lowercase). */
function canonicalHex(color: string): string {
  const lc = color.toLowerCase();
  if (lc.length === 4) {
    return '#' + lc.slice(1).split('').map((c) => c + c).join('');
  }
  return lc;
}

/**
 * C-2 v1 (2026-04-17): MOVE_ENTRY_UP / MOVE_ENTRY_DOWN reducer.
 *
 * Gate order matches contract §6.1. Every gate miss returns the same
 * state reference so downstream `===` identity checks stay cheap.
 * See `docs/spec/entry-ordering-v1-behavior-contract.md`.
 */
function reduceMoveEntry(
  state: AppState,
  direction: MoveDirection,
  lidArg: string | undefined,
): ReduceResult {
  if (state.readonly) return { state, events: [] };
  if (!state.container) return { state, events: [] };
  if (state.sortKey !== 'manual') return { state, events: [] };
  if (state.viewMode !== 'detail') return { state, events: [] };
  if (state.importPreview !== null) return { state, events: [] };
  if (state.batchImportPreview !== null) return { state, events: [] };
  const target = lidArg ?? state.selectedLid;
  if (!target) return { state, events: [] };

  const container = state.container;
  const entries = container.entries;
  if (!entries.some((e) => e.lid === target)) return { state, events: [] };

  // Filter pipeline — matches the sidebar renderer so `domainLids`
  // and `visibleLids` here reflect what the user is actually seeing.
  const hasActiveFilter =
    state.searchQuery !== '' ||
    state.archetypeFilter.size > 0 ||
    (state.tagFilter?.size ?? 0) > 0 ||
    state.categoricalPeerFilter !== null;
  let filtered = applyFilters(entries, state.searchQuery, state.archetypeFilter, state.tagFilter);
  if (state.categoricalPeerFilter) {
    filtered = filterByTag(filtered, container.relations, state.categoricalPeerFilter);
  }
  if (!state.showArchived) {
    filtered = filtered.filter((e) => {
      if (e.archetype !== 'todo') return true;
      try {
        return !parseTodoBody(e.body).archived;
      } catch {
        return true;
      }
    });
  }

  // Belonging set (contract §1.2 decision tree).
  let domainEntries: readonly { lid: string }[];
  if (hasActiveFilter) {
    domainEntries = filtered;
  } else {
    const parentLid = getStructuralParentLid(container.relations, target);
    domainEntries = filtered.filter((e) =>
      getStructuralParentLid(container.relations, e.lid) === parentLid,
    );
  }
  const domainLids = domainEntries.map((e) => e.lid);
  if (!domainLids.includes(target)) return { state, events: [] };

  // Ensure entry_order so Move always has a definite answer, then
  // project it through the visible domain set.
  const ensured = ensureEntryOrder(container.meta.entry_order, entries);
  const domainEntryObjs = filtered.filter((e) =>
    domainLids.includes(e.lid),
  );
  const visibleEntries = applyManualOrder(domainEntryObjs, ensured);
  const visibleLids = visibleEntries.map((e) => e.lid);

  const swapResult = moveAdjacentInOrder(
    ensured,
    domainLids,
    visibleLids,
    target,
    direction,
  );
  if (!swapResult.changed) return { state, events: [] };

  const nextContainer = {
    ...container,
    meta: { ...container.meta, entry_order: swapResult.order },
  };
  const next: AppState = { ...state, container: nextContainer };
  return { state: next, events: [] };
}

/**
 * Local helper: first structural-parent lid (folder membership) for
 * `childLid`, or `null` at root. Kept inline to avoid a dependency on
 * `tree.ts`'s full Entry-returning helper — we only need the lid.
 */
function getStructuralParentLid(
  relations: readonly import('../../core/model/relation').Relation[],
  childLid: string,
): string | null {
  for (const r of relations) {
    if (r.kind === 'structural' && r.to === childLid) return r.from;
  }
  return null;
}

function reduceInitializing(state: AppState, action: Dispatchable): ReduceResult {
  switch (action.type) {
    case 'SYS_INIT_COMPLETE': {
      const next: AppState = {
        ...state,
        phase: 'ready',
        container: action.container,
        embedded: action.embedded ?? false,
        readonly: action.readonly ?? false,
        lightSource: action.lightSource ?? false,
        viewOnlySource: action.viewOnlySource ?? false,
        error: null,
      };
      const cid = action.container?.meta?.container_id ?? 'unknown';
      return { state: next, events: [{ type: 'CONTAINER_LOADED', container_id: cid }] };
    }
    case 'SYS_INIT_ERROR': {
      const next: AppState = { ...state, phase: 'error', error: action.error };
      return { state: next, events: [{ type: 'ERROR_OCCURRED', error: action.error }] };
    }
    default:
      return blocked(state, action);
  }
}

function reduceReady(state: AppState, action: Dispatchable): ReduceResult {
  switch (action.type) {
    case 'SELECT_ENTRY': {
      // PR-ε₁ (cluster C'): ancestor auto-expand is opt-in via
      // `action.revealInSidebar === true`. Default = preserve the
      // user's folded state. External jumps (Storage Profile row,
      // `entry:<lid>` body link) pass the flag so the target shows
      // up in the tree; tree-internal clicks and other already-visible
      // surfaces leave the flag off so a fold stays folded.
      //
      // Pure read against the container — no mutation, no new action
      // type, and no-op when no ancestors are collapsed
      // (`state.collapsedFolders` reference is preserved for
      // downstream `===` checks).
      let collapsedFolders = state.collapsedFolders;
      if (action.revealInSidebar === true && state.container && state.collapsedFolders.length > 0) {
        const ancestorFolders = getAncestorFolderLids(
          state.container.relations,
          state.container.entries,
          action.lid,
        );
        if (ancestorFolders.length > 0) {
          const ancestorSet = new Set(ancestorFolders);
          const filtered = state.collapsedFolders.filter((l) => !ancestorSet.has(l));
          if (filtered.length !== state.collapsedFolders.length) {
            collapsedFolders = filtered;
          }
        }
      }
      // P1-1: automatic cleanup for transient UI state that is scoped
      // to a specific entry. Preserving them across a selection change
      // was the root of several "stale singleton" UX bugs (the
      // previously-selected TEXTLOG's log selection would keep showing
      // its check state after the user navigated away). See
      // `docs/development/textlog-text-conversion.md` §P1-1 clear-rules.
      const textlogSelection = (state.textlogSelection && state.textlogSelection.activeLid !== action.lid)
        ? null
        : state.textlogSelection;
      const textToTextlogModal = (state.textToTextlogModal && state.textToTextlogModal.sourceLid !== action.lid)
        ? null
        : state.textToTextlogModal;
      const next: AppState = {
        ...state,
        selectedLid: action.lid,
        multiSelectedLids: [],
        collapsedFolders,
        textlogSelection,
        textToTextlogModal,
      };
      return { state: next, events: [{ type: 'ENTRY_SELECTED', lid: action.lid }] };
    }
    case 'NAVIGATE_TO_LOCATION': {
      // S-18 (A-4 FULL): same selection semantics as SELECT_ENTRY
      // (clear per-entry transient UI when the selection target
      // changes), PLUS record a post-render hint so main.ts can
      // scroll to the sub-location and flash the highlight. `ticket`
      // is caller-supplied and monotonic.
      //
      // PR-ε₁: ancestor auto-expand is opt-in via
      // `action.revealInSidebar === true`, matching SELECT_ENTRY.
      // The sole current dispatch site (sidebar sub-location row
      // click) clicks on an already-visible row, so the flag is
      // absent and we preserve `collapsedFolders` as-is.
      if (state.phase !== 'ready') return blocked(state, action);
      if (!state.container) return blocked(state, action);
      let collapsedFolders = state.collapsedFolders;
      if (action.revealInSidebar === true && state.collapsedFolders.length > 0) {
        const ancestorFolders = getAncestorFolderLids(
          state.container.relations,
          state.container.entries,
          action.lid,
        );
        if (ancestorFolders.length > 0) {
          const ancestorSet = new Set(ancestorFolders);
          const filtered = state.collapsedFolders.filter((l) => !ancestorSet.has(l));
          if (filtered.length !== state.collapsedFolders.length) {
            collapsedFolders = filtered;
          }
        }
      }
      const textlogSelection = (state.textlogSelection && state.textlogSelection.activeLid !== action.lid)
        ? null
        : state.textlogSelection;
      const textToTextlogModal = (state.textToTextlogModal && state.textToTextlogModal.sourceLid !== action.lid)
        ? null
        : state.textToTextlogModal;
      const next: AppState = {
        ...state,
        selectedLid: action.lid,
        multiSelectedLids: [],
        collapsedFolders,
        textlogSelection,
        textToTextlogModal,
        pendingNav: { subId: action.subId, ticket: action.ticket },
      };
      return {
        state: next,
        events: [{ type: 'ENTRY_SELECTED', lid: action.lid }],
      };
    }
    case 'DESELECT_ENTRY': {
      // P1-1: deselection tears down per-entry transient UI state too.
      const next: AppState = {
        ...state,
        selectedLid: null,
        textlogSelection: null,
        textToTextlogModal: null,
      };
      return { state: next, events: [{ type: 'ENTRY_DESELECTED' }] };
    }
    case 'BEGIN_EDIT': {
      if (state.readonly) return blocked(state, action);
      if (isReservedLid(action.lid)) return blocked(state, action);
      // P1-1: BEGIN_EDIT terminates any in-progress transient UI flows
      // (log selection / preview modal). The user is switching to the
      // structured editor; carrying over a TEXTLOG selection toolbar
      // or a dangling preview modal is incoherent.
      //
      // FI-01 (2026-04-17): capture EditBaseSnapshot so COMMIT_EDIT
      // can run the save-time optimistic version guard. captureEditBase
      // returns null for unknown lids; we store null rather than aborting
      // so existing callers that trigger BEGIN_EDIT before SYS_INIT
      // (or in pathological fixtures) keep working — the guard then
      // skips (legacy permissive path).
      const base = state.container
        ? captureEditBase(state.container, action.lid)
        : null;
      const next: AppState = {
        ...state,
        phase: 'editing',
        selectedLid: action.lid,
        editingLid: action.lid,
        viewMode: 'detail',
        textlogSelection: null,
        textToTextlogModal: null,
        editingBase: base,
        dualEditConflict: null,
      };
      return { state: next, events: [{ type: 'EDIT_BEGUN', lid: action.lid }] };
    }
    case 'CREATE_ENTRY': {
      if (state.readonly) return blocked(state, action);
      if (!state.container) return blocked(state, action);
      const ts = now();
      let container = state.container;
      const events: DomainEvent[] = [];

      // Atomic placement. CREATE_ENTRY transitions into `editing`,
      // after which CREATE_RELATION / CREATE_ENTRY are blocked — so
      // any structural parent (and any lazy-created subfolder) must be
      // wired here. A missing / unknown / non-folder `parentFolder`
      // silently falls back to root; `ensureSubfolder` is ignored in
      // that case (we don't auto-create root-level bucket folders).
      let placementParentLid: string | null = null;
      if (action.parentFolder) {
        const parent = container.entries.find((e) => e.lid === action.parentFolder);
        if (parent && parent.archetype === 'folder') {
          placementParentLid = parent.lid;
          // Lazy subfolder resolution: reuse an existing child folder
          // with the target title if present, otherwise create one in
          // the same reduction. Skip the layer entirely when the
          // context folder already carries the target title — avoids
          // nesting like `TODOS/TODOS`.
          const sub = action.ensureSubfolder;
          if (sub && sub.length > 0 && parent.title !== sub) {
            const existing = findSubfolder(container, parent.lid, sub);
            if (existing) {
              placementParentLid = existing;
            } else {
              const subLid = generateLid();
              container = addEntry(container, subLid, 'folder', sub, ts);
              events.push({ type: 'ENTRY_CREATED', lid: subLid, archetype: 'folder' });
              const subRelId = generateLid();
              container = addRelation(container, subRelId, parent.lid, subLid, 'structural', ts);
              events.push({
                type: 'RELATION_CREATED', id: subRelId,
                from: parent.lid, to: subLid, kind: 'structural',
              });
              placementParentLid = subLid;
            }
          }
        }
      }

      const lid = generateLid();
      container = addEntry(container, lid, action.archetype, action.title, ts);
      events.push({ type: 'ENTRY_CREATED', lid, archetype: action.archetype });

      if (placementParentLid) {
        const relId = generateLid();
        container = addRelation(container, relId, placementParentLid, lid, 'structural', ts);
        events.push({
          type: 'RELATION_CREATED', id: relId,
          from: placementParentLid, to: lid, kind: 'structural',
        });
      }

      events.push({ type: 'EDIT_BEGUN', lid });
      const next: AppState = {
        ...state,
        container,
        selectedLid: lid,
        phase: 'editing',
        editingLid: lid,
        viewMode: 'detail',
      };
      return { state: next, events };
    }
    case 'DELETE_ENTRY': {
      if (state.readonly) return blocked(state, action);
      if (!state.container) return blocked(state, action);
      if (isReservedLid(action.lid)) return blocked(state, action);
      const ts = now();
      const entriesBefore = state.container.entries;
      // Snapshot the entry before deletion (preserves last state for restore)
      const revId = generateLid();
      const snapshotted = snapshotEntry(state.container, action.lid, revId, ts);
      const container = removeEntry(snapshotted, action.lid);
      const selectedLid = nextSelectedAfterRemove(
        entriesBefore, action.lid, state.selectedLid,
      );
      // P1-1: if the deleted entry was the owner of a transient UI
      // flow, tear it down. A selection toolbar anchored to a now-
      // nonexistent lid would render against stale data.
      const textlogSelection = state.textlogSelection && state.textlogSelection.activeLid === action.lid
        ? null
        : state.textlogSelection;
      const textToTextlogModal = state.textToTextlogModal && state.textToTextlogModal.sourceLid === action.lid
        ? null
        : state.textToTextlogModal;
      const next: AppState = { ...state, container, selectedLid, textlogSelection, textToTextlogModal };
      return { state: next, events: [{ type: 'ENTRY_DELETED', lid: action.lid }] };
    }
    case 'BEGIN_EXPORT': {
      if (state.readonly) return blocked(state, action);
      const next: AppState = {
        ...state, phase: 'exporting',
        exportMode: action.mode, exportMutability: action.mutability,
      };
      return { state: next, events: [] };
    }
    case 'CREATE_RELATION': {
      if (state.readonly) return blocked(state, action);
      if (!state.container) return blocked(state, action);
      // P2: structural cycle guard — reducer-side entry defense.
      // Pairs with the features-side rescue in `buildTree()` (P1).
      // Self-loops and any new edge that closes a structural cycle
      // (`to` can already reach `from` in the existing structural
      // graph) are rejected. Non-structural relations are free of
      // this constraint and fall through unchanged.
      if (action.kind === 'structural') {
        if (action.from === action.to) return blocked(state, action);
        if (isDescendant(state.container.relations, action.to, action.from)) {
          return blocked(state, action);
        }
      }
      const id = generateLid();
      const ts = now();
      const container = addRelation(
        state.container, id, action.from, action.to, action.kind, ts,
      );
      const next: AppState = { ...state, container };
      return {
        state: next,
        events: [{
          type: 'RELATION_CREATED', id,
          from: action.from, to: action.to, kind: action.kind,
        }],
      };
    }
    case 'DELETE_RELATION': {
      if (state.readonly) return blocked(state, action);
      if (!state.container) return blocked(state, action);
      const container = removeRelation(state.container, action.id);
      const next: AppState = { ...state, container };
      return {
        state: next,
        events: [{ type: 'RELATION_DELETED', id: action.id }],
      };
    }
    case 'UPDATE_RELATION_KIND': {
      if (state.readonly) return blocked(state, action);
      if (!state.container) return blocked(state, action);
      const existing = state.container.relations.find((r) => r.id === action.id);
      if (!existing) return blocked(state, action);
      // provenance is a system-only kind (merge-duplicate / text-textlog
      // origin tracking). Manual edits would leave the provenance metadata
      // contract inconsistent, so the reducer treats the action as a
      // no-op. Also block *setting* kind → 'provenance' from UI.
      if (existing.kind === 'provenance' || action.kind === 'provenance') {
        return blocked(state, action);
      }
      if (existing.kind === action.kind) return { state, events: [] };
      // P2: structural cycle guard — if the update promotes a
      // non-structural relation into `structural`, the resulting
      // graph must stay acyclic. The existing relation is
      // non-structural (we just checked kind inequality above and
      // `structural → structural` would have returned as no-op), so
      // it is invisible to the structural walk and the current
      // relations can be consulted as-is. Demotions structural →
      // non-structural only remove edges, so they never introduce a
      // cycle and skip this check.
      if (action.kind === 'structural') {
        if (existing.from === existing.to) return blocked(state, action);
        if (isDescendant(state.container.relations, existing.to, existing.from)) {
          return blocked(state, action);
        }
      }
      const container = updateRelationKind(state.container, action.id, action.kind, now());
      const next: AppState = { ...state, container };
      return {
        state: next,
        events: [{
          type: 'RELATION_KIND_UPDATED',
          id: action.id,
          kind: action.kind,
          previous: existing.kind,
        }],
      };
    }
    case 'SYS_IMPORT_COMPLETE': {
      // Tier 2-1: auto-GC orphan assets on container replacement. The
      // imported container is the new source of truth; any asset in
      // its `assets` map that is NOT referenced by one of its own
      // entries is baggage from the sender side and can be dropped
      // safely. Because the previous container (and its revisions)
      // is being thrown away wholesale, there is no restore path
      // that could surface a purged asset later — which is why
      // import is the one reducer path where auto-GC is risk-free.
      // See docs/development/orphan-asset-auto-gc.md.
      const importedContainer = action.container;
      const purged = removeOrphanAssets(importedContainer);
      const purgedCount =
        purged === importedContainer
          ? 0
          : Object.keys(importedContainer.assets).length - Object.keys(purged.assets).length;
      const next: AppState = {
        ...state,
        phase: 'ready',
        container: purged,
        selectedLid: null,
        editingLid: null,
        error: null,
        // Boot-source-policy: explicit import clears viewOnlySource
        // so the imported container persists to IDB normally.
        viewOnlySource: false,
        // P1-1: container replaced wholesale — any per-entry transient
        // UI flow is anchored to a lid that likely doesn't exist in
        // the new container. Clear them defensively.
        textlogSelection: null,
        textToTextlogModal: null,
      };
      const cid = action.container?.meta?.container_id ?? 'unknown';
      const events: DomainEvent[] = [{ type: 'CONTAINER_IMPORTED', container_id: cid, source: action.source }];
      if (purgedCount > 0) events.push({ type: 'ORPHAN_ASSETS_PURGED', count: purgedCount });
      return { state: next, events };
    }
    case 'SYS_RECORD_OFFERED': {
      const offer = action.offer as PendingOffer;
      const next: AppState = {
        ...state,
        pendingOffers: [...state.pendingOffers, offer],
      };
      return {
        state: next,
        events: [{ type: 'RECORD_OFFERED', offer_id: offer.offer_id, title: offer.title }],
      };
    }
    case 'ACCEPT_OFFER': {
      if (!state.container) return blocked(state, action);
      const offer = state.pendingOffers.find((o) => o.offer_id === action.offer_id);
      if (!offer) return blocked(state, action);
      const lid = generateLid();
      const ts = now();
      const container = addEntry(
        state.container, lid, offer.archetype, offer.title, ts,
      );
      // Inject capture provenance header per
      // `docs/spec/record-offer-capture-profile.md` §10.4. Header is
      // emitted only when at least one of `source_url` / `captured_at`
      // is present; absent → body unchanged (existing behavior).
      const finalBody = injectCaptureHeader(offer.body, offer.source_url ?? null, offer.captured_at ?? null);
      // Set body on the newly added entry
      const updatedContainer = updateEntry(container, lid, offer.title, finalBody, ts);
      const next: AppState = {
        ...state,
        container: updatedContainer,
        pendingOffers: state.pendingOffers.filter((o) => o.offer_id !== action.offer_id),
        selectedLid: lid,
      };
      return {
        state: next,
        events: [
          { type: 'OFFER_ACCEPTED', offer_id: action.offer_id, lid },
          { type: 'ENTRY_CREATED', lid, archetype: offer.archetype },
        ],
      };
    }
    case 'DISMISS_OFFER': {
      const offer = state.pendingOffers.find((o) => o.offer_id === action.offer_id);
      if (!offer) return { state, events: [] };
      const next: AppState = {
        ...state,
        pendingOffers: state.pendingOffers.filter((o) => o.offer_id !== action.offer_id),
      };
      return {
        state: next,
        events: [{ type: 'OFFER_DISMISSED', offer_id: action.offer_id, reply_to_id: offer.reply_to_id }],
      };
    }
    case 'RESTORE_ENTRY': {
      if (!state.container) return blocked(state, action);
      const ts = now();
      const entryExists = state.container.entries.some((e) => e.lid === action.lid);

      let container: typeof state.container;
      if (entryExists) {
        // Restore existing entry: snapshot current, then overwrite
        const snapshotRevId = generateLid();
        container = restoreEntry(
          state.container, action.lid, action.revision_id, snapshotRevId, ts,
        );
      } else {
        // Restore deleted entry: re-create from revision
        container = restoreDeletedEntry(state.container, action.revision_id, ts);
      }

      if (container === state.container) return blocked(state, action);

      const next: AppState = { ...state, container, selectedLid: action.lid };
      return {
        state: next,
        events: [{ type: 'ENTRY_RESTORED', lid: action.lid, revision_id: action.revision_id }],
      };
    }
    case 'BRANCH_RESTORE_REVISION': {
      // C-1 revision-branch-restore v1.
      // Gates: contract §6.1. The six below must each preserve state
      // identity so downstream `===` checks stay cheap. `editingLid`
      // can't be non-null in the ready phase, but the explicit guard
      // is kept so the gate list matches the contract 1:1.
      if (!state.container) return blocked(state, action);
      if (state.readonly) return blocked(state, action);
      if (state.viewOnlySource) return blocked(state, action);
      if (state.editingLid !== null) return blocked(state, action);
      if (state.importPreview !== null) return blocked(state, action);
      if (state.batchImportPreview !== null) return blocked(state, action);

      const newLid = generateLid();
      const relationId = generateLid();
      const ts = now();

      const container = branchRestoreRevision(
        state.container,
        action.entryLid,
        action.revisionId,
        newLid,
        relationId,
        ts,
      );
      if (container === state.container) return blocked(state, action);

      const next: AppState = { ...state, container, selectedLid: newLid };
      return {
        state: next,
        events: [{
          type: 'ENTRY_BRANCHED_FROM_REVISION',
          sourceLid: action.entryLid,
          newLid,
          revision_id: action.revisionId,
        }],
      };
    }
    case 'SYS_IMPORT_PREVIEW': {
      // Tier 3-1: reset import mode to 'replace' on every new preview so
      // a prior merge selection cannot leak into the next import session.
      const next: AppState = {
        ...state,
        importPreview: action.preview,
        importMode: 'replace',
        mergeConflicts: undefined,
        mergeConflictResolutions: undefined,
      };
      return {
        state: next,
        events: [{
          type: 'IMPORT_PREVIEWED',
          source: action.preview.source,
          entry_count: action.preview.entry_count,
        }],
      };
    }
    case 'CONFIRM_IMPORT': {
      if (!state.importPreview) return blocked(state, action);
      const imported = state.importPreview.container;
      const source = state.importPreview.source;
      // Tier 2-1: auto-GC orphan assets on import confirmation. See the
      // SYS_IMPORT_COMPLETE case above for the safety rationale.
      const purged = removeOrphanAssets(imported);
      const purgedCount =
        purged === imported
          ? 0
          : Object.keys(imported.assets).length - Object.keys(purged.assets).length;
      const next: AppState = {
        ...state,
        phase: 'ready',
        container: purged,
        selectedLid: null,
        editingLid: null,
        error: null,
        importPreview: null,
        importMode: 'replace',
        lightSource: false,
        // Explicit import is the canonical "promote to writable" gate
        // for boot-source policy (see boot-container-source-policy-
        // revision.md). Clear viewOnlySource so post-import edits
        // persist to IDB normally.
        viewOnlySource: false,
      };
      const cid = imported?.meta?.container_id ?? 'unknown';
      const events: DomainEvent[] = [{ type: 'CONTAINER_IMPORTED', container_id: cid, source }];
      if (purgedCount > 0) events.push({ type: 'ORPHAN_ASSETS_PURGED', count: purgedCount });
      return { state: next, events };
    }
    case 'CONFIRM_MERGE_IMPORT': {
      // Tier 3-1: Overlay MVP (append-only). Invariants I-Merge1 / I-Merge2.
      if (!state.importPreview) return blocked(state, action);
      if (!state.container) return blocked(state, action);
      const host = state.container;
      const imported = state.importPreview.container;
      const source = state.importPreview.source;
      const plan = planMergeImport(host, imported, action.now);
      if ('error' in plan) return blocked(state, action);

      let finalPlan = plan;
      let mergeTarget = imported;
      let suppressedByKeepCurrent: string[] = [];
      let suppressedBySkip: string[] = [];
      let provenanceData: ProvenanceRelationData[] = [];

      if (state.mergeConflicts && state.mergeConflicts.length > 0 && state.mergeConflictResolutions) {
        const crResult = applyConflictResolutions(
          plan, state.mergeConflictResolutions, state.mergeConflicts, action.now,
        );
        finalPlan = crResult.plan;
        suppressedByKeepCurrent = crResult.suppressedByKeepCurrent;
        suppressedBySkip = crResult.suppressedBySkip;
        provenanceData = crResult.provenanceData;
        mergeTarget = {
          ...imported,
          entries: imported.entries.filter((e) => crResult.plan.lidRemap.has(e.lid)),
        };
      }

      let merged = applyMergePlan(host, mergeTarget, finalPlan, action.now);

      if (provenanceData.length > 0) {
        const newRelations = provenanceData.map((p) => ({
          id: generateLid(),
          from: p.from_lid,
          to: p.to_lid,
          kind: 'provenance' as const,
          created_at: action.now,
          updated_at: action.now,
          metadata: p.metadata as Record<string, unknown>,
        }));
        merged = { ...merged, relations: [...merged.relations, ...newRelations] };
      }

      const purged = removeOrphanAssets(merged);
      const purgedCount =
        purged === merged
          ? 0
          : Object.keys(merged.assets).length - Object.keys(purged.assets).length;
      const next: AppState = {
        ...state,
        phase: 'ready',
        container: purged,
        editingLid: null,
        error: null,
        importPreview: null,
        importMode: 'replace',
        mergeConflicts: undefined,
        mergeConflictResolutions: undefined,
        viewOnlySource: false,
      };
      const cid = host.meta.container_id ?? 'unknown';
      const events: DomainEvent[] = [{
        type: 'CONTAINER_MERGED',
        container_id: cid,
        source,
        added_entries: finalPlan.counts.addedEntries,
        added_assets: finalPlan.counts.addedAssets,
        added_relations: finalPlan.counts.addedRelations + provenanceData.length,
        suppressed_by_keep_current: suppressedByKeepCurrent,
        suppressed_by_skip: suppressedBySkip,
      }];
      if (purgedCount > 0) events.push({ type: 'ORPHAN_ASSETS_PURGED', count: purgedCount });
      return { state: next, events };
    }
    case 'SET_IMPORT_MODE': {
      if (!state.importPreview) return blocked(state, action);
      const current = state.importMode ?? 'replace';
      if (current === action.mode) return blocked(state, action);
      const next: AppState = {
        ...state,
        importMode: action.mode,
        mergeConflicts: action.mode === 'replace' ? undefined : state.mergeConflicts,
        mergeConflictResolutions: action.mode === 'replace' ? undefined : state.mergeConflictResolutions,
      };
      return { state: next, events: [] };
    }
    case 'SET_MERGE_CONFLICTS': {
      if (!state.importPreview) return blocked(state, action);
      if ((state.importMode ?? 'replace') !== 'merge') return blocked(state, action);
      const resolutions: Record<string, Resolution> = {};
      for (const c of action.conflicts) {
        if (c.kind === 'content-equal') {
          resolutions[c.imported_lid] = 'keep-current';
        }
      }
      const next: AppState = {
        ...state,
        mergeConflicts: action.conflicts,
        mergeConflictResolutions: resolutions,
      };
      return { state: next, events: [] };
    }
    case 'SET_CONFLICT_RESOLUTION': {
      if (!state.mergeConflictResolutions) return blocked(state, action);
      const next: AppState = {
        ...state,
        mergeConflictResolutions: {
          ...state.mergeConflictResolutions,
          [action.importedLid]: action.resolution,
        },
      };
      return { state: next, events: [] };
    }
    case 'BULK_SET_CONFLICT_RESOLUTION': {
      if (!state.mergeConflicts || !state.mergeConflictResolutions) return blocked(state, action);
      // I-MergeUI7 preservation: for keep-current bulk, title-only-multi rows
      // are untouched — existing resolutions (if any) are preserved, not wiped.
      const resolutions: Record<string, Resolution> = { ...state.mergeConflictResolutions };
      for (const c of state.mergeConflicts) {
        if (action.resolution === 'keep-current' && c.kind === 'title-only-multi') continue;
        resolutions[c.imported_lid] = action.resolution;
      }
      const next: AppState = {
        ...state,
        mergeConflictResolutions: resolutions,
      };
      return { state: next, events: [] };
    }
    case 'CANCEL_IMPORT': {
      const next: AppState = {
        ...state,
        importPreview: null,
        importMode: 'replace',
        mergeConflicts: undefined,
        mergeConflictResolutions: undefined,
      };
      return {
        state: next,
        events: [{ type: 'IMPORT_CANCELLED' }],
      };
    }
    case 'SYS_BATCH_IMPORT_PREVIEW': {
      const next: AppState = { ...state, batchImportPreview: action.preview, batchImportResult: null };
      return {
        state: next,
        events: [{
          type: 'BATCH_IMPORT_PREVIEWED',
          source: action.preview.source,
          totalEntries: action.preview.totalEntries,
        }],
      };
    }
    case 'TOGGLE_BATCH_IMPORT_ENTRY': {
      if (!state.batchImportPreview) return blocked(state, action);
      const prev = state.batchImportPreview.selectedIndices;
      const idx = action.index;
      const selectedIndices = prev.includes(idx)
        ? prev.filter((i) => i !== idx)
        : [...prev, idx];
      const next: AppState = {
        ...state,
        batchImportPreview: reclassifyPreview(state.batchImportPreview, selectedIndices),
      };
      return { state: next, events: [] };
    }
    case 'TOGGLE_ALL_BATCH_IMPORT_ENTRIES': {
      if (!state.batchImportPreview) return blocked(state, action);
      const all = state.batchImportPreview.entries.map((e) => e.index);
      const allSelected = state.batchImportPreview.selectedIndices.length === all.length;
      const selectedIndices = allSelected ? [] : all;
      const next: AppState = {
        ...state,
        batchImportPreview: reclassifyPreview(state.batchImportPreview, selectedIndices),
      };
      return { state: next, events: [] };
    }
    case 'SET_BATCH_IMPORT_TARGET_FOLDER': {
      if (!state.batchImportPreview) return blocked(state, action);
      const next: AppState = {
        ...state,
        batchImportPreview: { ...state.batchImportPreview, targetFolderLid: action.lid },
      };
      return { state: next, events: [] };
    }
    case 'CONFIRM_BATCH_IMPORT': {
      if (!state.batchImportPreview) return blocked(state, action);
      if (state.batchImportPreview.selectedIndices.length === 0) return blocked(state, action);
      const next: AppState = { ...state, batchImportPreview: null };
      return {
        state: next,
        events: [{ type: 'BATCH_IMPORT_CONFIRMED' }],
      };
    }
    case 'CANCEL_BATCH_IMPORT': {
      const next: AppState = { ...state, batchImportPreview: null };
      return {
        state: next,
        events: [{ type: 'BATCH_IMPORT_CANCELLED' }],
      };
    }
    case 'SYS_APPLY_BATCH_IMPORT': {
      if (state.readonly) return blocked(state, action);
      if (!state.container) return blocked(state, action);
      const plan = action.plan;
      const ts = now();
      let container = state.container;
      const events: DomainEvent[] = [];
      const oldToNewLid = new Map<string, string>();

      // 1. Create folders in topological order
      for (const folder of plan.folders) {
        const lid = generateLid();
        container = addEntry(container, lid, 'folder', folder.title, ts);
        container = updateEntry(container, lid, folder.title, '', ts);
        oldToNewLid.set(folder.originalLid, lid);
        events.push({ type: 'ENTRY_CREATED', lid, archetype: 'folder' });
      }

      // Resolve target folder: must exist in container as a folder entry
      const targetLid = plan.targetFolderLid ?? null;
      const targetExists = targetLid !== null
        && container.entries.some((e) => e.lid === targetLid && e.archetype === 'folder');

      // 2. Create structural relations between folders
      for (const folder of plan.folders) {
        if (folder.parentOriginalLid !== null) {
          const newParent = oldToNewLid.get(folder.parentOriginalLid);
          const newChild = oldToNewLid.get(folder.originalLid);
          if (newParent && newChild) {
            const relId = generateLid();
            container = addRelation(container, relId, newParent, newChild, 'structural', ts);
            events.push({ type: 'RELATION_CREATED', id: relId, from: newParent, to: newChild, kind: 'structural' });
          }
        } else if (targetExists) {
          // Top-level imported folder → attach to target folder
          const newChild = oldToNewLid.get(folder.originalLid);
          if (newChild) {
            const relId = generateLid();
            container = addRelation(container, relId, targetLid, newChild, 'structural', ts);
            events.push({ type: 'RELATION_CREATED', id: relId, from: targetLid, to: newChild, kind: 'structural' });
          }
        }
      }

      // 3. Create content entries with attachments and assets
      for (const entry of plan.entries) {
        // Merge assets first
        if (Object.keys(entry.assets).length > 0) {
          container = mergeAssets(container, entry.assets);
        }

        // Create attachment entries before the main entry
        for (const att of entry.attachments) {
          const attLid = generateLid();
          container = addEntry(container, attLid, 'attachment', att.name, ts);
          container = updateEntry(container, attLid, att.name, att.body, ts);
          if (att.assetData) {
            container = mergeAssets(container, { [att.assetKey]: att.assetData });
          }
          events.push({ type: 'ENTRY_CREATED', lid: attLid, archetype: 'attachment' });
        }

        const lid = generateLid();
        container = addEntry(container, lid, entry.archetype, entry.title, ts);
        container = updateEntry(container, lid, entry.title, entry.body, ts);
        events.push({ type: 'ENTRY_CREATED', lid, archetype: entry.archetype });

        // Create structural relation to parent folder if applicable
        if (entry.parentFolderOriginalLid) {
          const newParent = oldToNewLid.get(entry.parentFolderOriginalLid);
          if (newParent) {
            const relId = generateLid();
            container = addRelation(container, relId, newParent, lid, 'structural', ts);
            events.push({ type: 'RELATION_CREATED', id: relId, from: newParent, to: lid, kind: 'structural' });
          }
        } else if (targetExists) {
          // Unparented content entry → attach to target folder
          const relId = generateLid();
          container = addRelation(container, relId, targetLid, lid, 'structural', ts);
          events.push({ type: 'RELATION_CREATED', id: relId, from: targetLid, to: lid, kind: 'structural' });
        }
      }

      // Compute result summary for UI feedback
      const totalAttachments = plan.entries.reduce((sum, e) => sum + e.attachments.length, 0);
      const fallbackToRoot = targetLid !== null && !targetExists;
      const targetEntry = targetExists
        ? container.entries.find((e) => e.lid === targetLid)
        : null;
      const actualDestination = targetExists && targetEntry
        ? targetEntry.title || '(untitled)'
        : '/ (Root)';
      // When fallback occurred, look up the intended folder title from original container
      let intendedDestination: string | null = null;
      if (fallbackToRoot && targetLid !== null) {
        const intendedEntry = state.container!.entries.find((e) => e.lid === targetLid);
        intendedDestination = intendedEntry ? intendedEntry.title || '(untitled)' : null;
      }
      const summary: BatchImportResultSummary = {
        entryCount: plan.entries.length,
        attachmentCount: totalAttachments,
        folderCount: plan.folders.length,
        restoreStructure: plan.restoreStructure,
        actualDestination,
        intendedDestination,
        fallbackToRoot,
        source: plan.source,
      };
      events.push({ type: 'BATCH_IMPORT_APPLIED', summary });

      const next: AppState = { ...state, container, batchImportResult: summary };
      return { state: next, events };
    }
    case 'DISMISS_BATCH_IMPORT_RESULT': {
      const next: AppState = { ...state, batchImportResult: null };
      return { state: next, events: [] };
    }
    case 'SET_SEARCH_QUERY': {
      const next: AppState = { ...state, searchQuery: action.query };
      return { state: next, events: [] };
    }
    case 'SET_ARCHETYPE_FILTER': {
      // Backwards-compat: null → empty Set (= show all), specific → singleton Set.
      const next: AppState = {
        ...state,
        archetypeFilter: action.archetype === null
          ? new Set<ArchetypeId>()
          : new Set([action.archetype]),
      };
      return { state: next, events: [] };
    }
    case 'TOGGLE_ARCHETYPE_FILTER': {
      const next = new Set(state.archetypeFilter);
      if (next.has(action.archetype)) {
        next.delete(action.archetype);
      } else {
        next.add(action.archetype);
      }
      return { state: { ...state, archetypeFilter: next }, events: [] };
    }
    case 'TOGGLE_ARCHETYPE_FILTER_EXPANDED': {
      return { state: { ...state, archetypeFilterExpanded: !(state.archetypeFilterExpanded ?? false) }, events: [] };
    }
    // ── FI-Settings v1 mirror actions (FI-12 back-compat) ───────────
    // These were session-only before 2026-04-18. They now also write
    // into `state.settings.theme.*` and emit `SETTINGS_CHANGED` so the
    // persistence layer upserts `__settings__`. The legacy
    // `showScanline` / `accentColor` fields are reconstructed by
    // `applySettingsUpdate` so old read sites keep working.
    case 'TOGGLE_SCANLINE': {
      const cur = currentSettings(state);
      return applySettingsUpdate(state, {
        ...cur,
        theme: { ...cur.theme, scanline: !cur.theme.scanline },
      });
    }
    case 'SET_SCANLINE': {
      const cur = currentSettings(state);
      if (cur.theme.scanline === action.on) return { state, events: [] };
      return applySettingsUpdate(state, {
        ...cur,
        theme: { ...cur.theme, scanline: action.on },
      });
    }
    case 'SET_ACCENT_COLOR': {
      // Accept `#rrggbb` / `#rgb`; canonicalize to lower-case 6-char so
      // the stored payload always satisfies `isValidHexColor` and the
      // per-field fallback at load time doesn't discard our own write.
      if (!/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(action.color)) {
        return { state, events: [] };
      }
      const cur = currentSettings(state);
      const canonical = canonicalHex(action.color);
      if (cur.theme.accentColor === canonical) return { state, events: [] };
      return applySettingsUpdate(state, {
        ...cur,
        theme: { ...cur.theme, accentColor: canonical },
      });
    }
    case 'RESET_ACCENT_COLOR': {
      const cur = currentSettings(state);
      if (cur.theme.accentColor === null) return { state, events: [] };
      return applySettingsUpdate(state, {
        ...cur,
        theme: { ...cur.theme, accentColor: null },
      });
    }
    // ── FI-Settings v1 new actions ──────────────────────────────────
    case 'SET_THEME_MODE': {
      if (!isValidThemeMode(action.mode)) return { state, events: [] };
      const cur = currentSettings(state);
      if (cur.theme.mode === action.mode) return { state, events: [] };
      return applySettingsUpdate(state, {
        ...cur,
        theme: { ...cur.theme, mode: action.mode },
      });
    }
    case 'RESET_THEME_MODE': {
      const cur = currentSettings(state);
      if (cur.theme.mode === SETTINGS_DEFAULTS.theme.mode) return { state, events: [] };
      return applySettingsUpdate(state, {
        ...cur,
        theme: { ...cur.theme, mode: SETTINGS_DEFAULTS.theme.mode },
      });
    }
    case 'SET_BORDER_COLOR': {
      if (!isValidHexColor(action.color)) return { state, events: [] };
      const cur = currentSettings(state);
      const c = action.color.toLowerCase();
      if (cur.theme.borderColor === c) return { state, events: [] };
      return applySettingsUpdate(state, {
        ...cur,
        theme: { ...cur.theme, borderColor: c },
      });
    }
    case 'RESET_BORDER_COLOR': {
      const cur = currentSettings(state);
      if (cur.theme.borderColor === null) return { state, events: [] };
      return applySettingsUpdate(state, {
        ...cur,
        theme: { ...cur.theme, borderColor: null },
      });
    }
    case 'SET_BACKGROUND_COLOR': {
      if (!isValidHexColor(action.color)) return { state, events: [] };
      const cur = currentSettings(state);
      const c = action.color.toLowerCase();
      if (cur.theme.backgroundColor === c) return { state, events: [] };
      return applySettingsUpdate(state, {
        ...cur,
        theme: { ...cur.theme, backgroundColor: c },
      });
    }
    case 'RESET_BACKGROUND_COLOR': {
      const cur = currentSettings(state);
      if (cur.theme.backgroundColor === null) return { state, events: [] };
      return applySettingsUpdate(state, {
        ...cur,
        theme: { ...cur.theme, backgroundColor: null },
      });
    }
    case 'SET_UI_TEXT_COLOR': {
      if (!isValidHexColor(action.color)) return { state, events: [] };
      const cur = currentSettings(state);
      const c = action.color.toLowerCase();
      if (cur.theme.uiTextColor === c) return { state, events: [] };
      return applySettingsUpdate(state, {
        ...cur,
        theme: { ...cur.theme, uiTextColor: c },
      });
    }
    case 'RESET_UI_TEXT_COLOR': {
      const cur = currentSettings(state);
      if (cur.theme.uiTextColor === null) return { state, events: [] };
      return applySettingsUpdate(state, {
        ...cur,
        theme: { ...cur.theme, uiTextColor: null },
      });
    }
    case 'SET_BODY_TEXT_COLOR': {
      if (!isValidHexColor(action.color)) return { state, events: [] };
      const cur = currentSettings(state);
      const c = action.color.toLowerCase();
      if (cur.theme.bodyTextColor === c) return { state, events: [] };
      return applySettingsUpdate(state, {
        ...cur,
        theme: { ...cur.theme, bodyTextColor: c },
      });
    }
    case 'RESET_BODY_TEXT_COLOR': {
      const cur = currentSettings(state);
      if (cur.theme.bodyTextColor === null) return { state, events: [] };
      return applySettingsUpdate(state, {
        ...cur,
        theme: { ...cur.theme, bodyTextColor: null },
      });
    }
    case 'SET_PREFERRED_FONT': {
      if (!isValidFontFamily(action.font)) return { state, events: [] };
      const cur = currentSettings(state);
      if (cur.display.preferredFont === action.font) return { state, events: [] };
      return applySettingsUpdate(state, {
        ...cur,
        display: { ...cur.display, preferredFont: action.font },
      });
    }
    case 'RESET_PREFERRED_FONT': {
      const cur = currentSettings(state);
      if (cur.display.preferredFont === null) return { state, events: [] };
      return applySettingsUpdate(state, {
        ...cur,
        display: { ...cur.display, preferredFont: null },
      });
    }
    case 'SET_FONT_DIRECT_INPUT': {
      if (!isValidFontFamily(action.font)) return { state, events: [] };
      const cur = currentSettings(state);
      if (cur.display.fontDirectInput === action.font) return { state, events: [] };
      return applySettingsUpdate(state, {
        ...cur,
        display: { ...cur.display, fontDirectInput: action.font },
      });
    }
    case 'RESET_FONT_DIRECT_INPUT': {
      const cur = currentSettings(state);
      if (cur.display.fontDirectInput === null) return { state, events: [] };
      return applySettingsUpdate(state, {
        ...cur,
        display: { ...cur.display, fontDirectInput: null },
      });
    }
    case 'SET_LANGUAGE': {
      if (!isValidLanguageTag(action.language)) return { state, events: [] };
      const cur = currentSettings(state);
      if (cur.locale.language === action.language) return { state, events: [] };
      return applySettingsUpdate(state, {
        ...cur,
        locale: { ...cur.locale, language: action.language },
      });
    }
    case 'RESET_LANGUAGE': {
      const cur = currentSettings(state);
      if (cur.locale.language === null) return { state, events: [] };
      return applySettingsUpdate(state, {
        ...cur,
        locale: { ...cur.locale, language: null },
      });
    }
    case 'SET_TIMEZONE': {
      if (!isValidTimezone(action.timezone)) return { state, events: [] };
      const cur = currentSettings(state);
      if (cur.locale.timezone === action.timezone) return { state, events: [] };
      return applySettingsUpdate(state, {
        ...cur,
        locale: { ...cur.locale, timezone: action.timezone },
      });
    }
    case 'RESET_TIMEZONE': {
      const cur = currentSettings(state);
      if (cur.locale.timezone === null) return { state, events: [] };
      return applySettingsUpdate(state, {
        ...cur,
        locale: { ...cur.locale, timezone: null },
      });
    }
    case 'RESTORE_SETTINGS': {
      // Boot-time payload replay: rebuild the mirror fields but DO NOT
      // emit SETTINGS_CHANGED — persistence would otherwise re-save the
      // value we just read back, and the restore is not a user-visible
      // modification. See I-SETTINGS-1 / load contract §3.1.
      const next = action.settings;
      const nextState: AppState = {
        ...state,
        settings: next,
        showScanline: next.theme.scanline,
        accentColor: next.theme.accentColor ?? undefined,
      };
      return { state: nextState, events: [] };
    }
    case 'TOGGLE_MENU': {
      return { state: { ...state, menuOpen: !state.menuOpen }, events: [] };
    }
    case 'CLOSE_MENU': {
      if (!state.menuOpen) return { state, events: [] };
      return { state: { ...state, menuOpen: false }, events: [] };
    }
    case 'OPEN_LINK_MIGRATION_DIALOG': {
      // Phase 2 Slice 2 — purely presentational flip. Closing the
      // shell menu at the same time keeps the overlay stack tidy when
      // the user triggered this from inside the menu. Guards (no
      // container / editing phase) are enforced in the action-binder
      // entry point and the dialog sync step; the reducer stays
      // permissive so direct tests can open the dialog without
      // spelling out the whole shell state.
      //
      // Slice 3: always clear the last-apply-result on open so the
      // dialog re-opens without a stale "Applied 3 …" banner. The
      // banner is semantically owned by a single open→apply→close
      // lifecycle; persisting it across re-opens would confuse users
      // who can't tell whether they just applied or reopened the
      // dialog.
      if (
        state.linkMigrationDialogOpen === true &&
        state.menuOpen !== true &&
        state.linkMigrationLastApplyResult === undefined
      ) {
        return { state, events: [] };
      }
      return {
        state: {
          ...state,
          linkMigrationDialogOpen: true,
          menuOpen: false,
          linkMigrationLastApplyResult: undefined,
        },
        events: [],
      };
    }
    case 'CLOSE_LINK_MIGRATION_DIALOG': {
      if (
        state.linkMigrationDialogOpen !== true &&
        state.linkMigrationLastApplyResult === undefined
      ) {
        return { state, events: [] };
      }
      return {
        state: {
          ...state,
          linkMigrationDialogOpen: false,
          linkMigrationLastApplyResult: undefined,
        },
        events: [],
      };
    }
    case 'APPLY_LINK_MIGRATION': {
      // Phase 2 Slice 3 — re-scan + apply all safe candidates.
      //
      // Guards mirror the destructive-action policy (see §10.6 of
      // `docs/spec/link-migration-tool-v1.md`): readonly sessions,
      // in-flight import previews, and active edit mode all block
      // apply. light-source (view-only artifacts) cannot persist,
      // so apply is blocked there too to avoid silently-dropped
      // revisions.
      if (state.readonly) return blocked(state, action);
      if (!state.container) return blocked(state, action);
      if (state.phase === 'editing') return blocked(state, action);
      if (state.importPreview) return blocked(state, action);
      if (state.lightSource || state.viewOnlySource) return blocked(state, action);

      const ts = now();
      // Re-scan against the current container — preview-time
      // candidates are never trusted blindly. Drift between preview
      // and apply (user edit, dual-edit reconciliation, quick
      // update) naturally drops out here.
      const preview = buildLinkMigrationPreview(state.container);
      const safe = preview.candidates.filter((c) => c.confidence === 'safe');

      if (safe.length === 0) {
        // Nothing to apply — record an empty result so the dialog
        // can surface the "no candidates" banner without another
        // state round-trip.
        const next: AppState = {
          ...state,
          linkMigrationLastApplyResult: {
            applied: 0,
            skipped: 0,
            entriesAffected: 0,
            at: ts,
          },
        };
        return {
          state: next,
          events: [
            {
              type: 'LINK_MIGRATION_APPLIED',
              applied: 0,
              skipped: 0,
              entriesAffected: 0,
            },
          ],
        };
      }

      const bulkId = generateLid();
      const result = applyLinkMigrations(
        state.container,
        safe,
        ts,
        generateLid,
        bulkId,
      );

      const next: AppState = {
        ...state,
        container: result.container,
        linkMigrationLastApplyResult: {
          applied: result.applied,
          skipped: result.skipped,
          entriesAffected: result.entriesAffected,
          at: ts,
        },
      };

      return {
        state: next,
        events: [
          {
            type: 'LINK_MIGRATION_APPLIED',
            applied: result.applied,
            skipped: result.skipped,
            entriesAffected: result.entriesAffected,
          },
        ],
      };
    }
    case 'SET_CATEGORICAL_PEER_FILTER': {
      const next: AppState = { ...state, categoricalPeerFilter: action.peerLid };
      return { state: next, events: [] };
    }
    case 'TOGGLE_TAG_FILTER': {
      // W1 Slice D — add or remove a single tag from the active Tag
      // filter Set. Mirrors TOGGLE_ARCHETYPE_FILTER's pattern so UI
      // chip toggling stays predictable across both filter axes.
      const next = new Set(state.tagFilter ?? []);
      if (next.has(action.tag)) {
        next.delete(action.tag);
      } else {
        next.add(action.tag);
      }
      return { state: { ...state, tagFilter: next }, events: [] };
    }
    case 'CLEAR_TAG_FILTER': {
      // Identity no-op when already empty or absent — keeps `state`
      // reference stable so downstream listeners that use `===` stay
      // quiet.
      if ((state.tagFilter?.size ?? 0) === 0) return { state, events: [] };
      return { state: { ...state, tagFilter: new Set<string>() }, events: [] };
    }
    case 'ADD_ENTRY_TAG': {
      // W1 Slice F — validate the user input through the single
      // Slice B R1-R8 normalizer, then append to `entry.tags`.
      // Rejected input silently no-ops in v1 (inline error surface
      // is a later slice); `===` reference identity is preserved so
      // downstream listeners do not re-render on a no-op attempt.
      if (state.readonly) return blocked(state, action);
      if (!state.container) return blocked(state, action);
      const entry = state.container.entries.find((e) => e.lid === action.lid);
      if (!entry) return blocked(state, action);
      const existing = entry.tags ?? [];
      const result = normalizeTagInput(action.raw, existing);
      if (!result.ok) return { state, events: [] };
      const nextTags = [...existing, result.value];
      const ts = new Date().toISOString();
      const container = updateEntryTags(state.container, action.lid, nextTags, ts);
      const next: AppState = { ...state, container };
      return {
        state: next,
        events: [{ type: 'ENTRY_UPDATED', lid: action.lid }],
      };
    }
    case 'REMOVE_ENTRY_TAG': {
      // W1 Slice F — detach a single Tag value by exact match. If
      // `tag` is not present we silently no-op (same identity-stable
      // behavior as ADD_ENTRY_TAG's reject path).
      if (state.readonly) return blocked(state, action);
      if (!state.container) return blocked(state, action);
      const entry = state.container.entries.find((e) => e.lid === action.lid);
      if (!entry) return blocked(state, action);
      const existing = entry.tags ?? [];
      if (!existing.includes(action.tag)) return { state, events: [] };
      const nextTags = existing.filter((t) => t !== action.tag);
      const ts = new Date().toISOString();
      const container = updateEntryTags(state.container, action.lid, nextTags, ts);
      const next: AppState = { ...state, container };
      return {
        state: next,
        events: [{ type: 'ENTRY_UPDATED', lid: action.lid }],
      };
    }
    case 'CLEAR_FILTERS': {
      // archetypeFilterExpanded is intentionally NOT reset (I-FI09-7).
      // Slice D (2026-04-23): clearing filters also resets the Tag
      // axis so "Clear filters" remains the single escape hatch for
      // every active filter axis.
      const next: AppState = {
        ...state,
        searchQuery: '',
        archetypeFilter: new Set<ArchetypeId>(),
        tagFilter: new Set<string>(),
        categoricalPeerFilter: null,
      };
      return { state: next, events: [] };
    }
    case 'SET_SORT': {
      // C-2 v1 (2026-04-17): switching into manual mode performs the
      // initial `entry_order` snapshot if none exists yet (contract
      // §2.5). Switching out of manual preserves `meta.entry_order`
      // untouched (I-Order2) — we only flip the runtime field.
      let container = state.container;
      if (
        action.key === 'manual' &&
        container &&
        (container.meta.entry_order === undefined ||
          container.meta.entry_order.length === 0)
      ) {
        const snapshot = snapshotEntryOrder(container.entries);
        container = {
          ...container,
          meta: { ...container.meta, entry_order: snapshot },
        };
      }
      const next: AppState = {
        ...state,
        container,
        sortKey: action.key,
        sortDirection: action.direction,
      };
      return { state: next, events: [] };
    }
    case 'MOVE_ENTRY_UP':
    case 'MOVE_ENTRY_DOWN': {
      const result = reduceMoveEntry(
        state,
        action.type === 'MOVE_ENTRY_UP' ? 'up' : 'down',
        action.lid,
      );
      return result;
    }
    // QUICK_UPDATE_ENTRY: body-only update, title preserved.
    // See user-action.ts for full contract documentation.
    case 'QUICK_UPDATE_ENTRY': {
      if (state.readonly) return blocked(state, action);
      if (!state.container) return blocked(state, action);
      if (isReservedLid(action.lid)) return blocked(state, action);
      const entry = state.container.entries.find((e) => e.lid === action.lid);
      if (!entry) return blocked(state, action);
      const ts = now();
      const revId = generateLid();
      const snapshotted = snapshotEntry(state.container, action.lid, revId, ts);
      // Preserve entry.title — QUICK_UPDATE_ENTRY must NOT change title
      const container = updateEntry(snapshotted, action.lid, entry.title, action.body, ts);
      const next: AppState = { ...state, container };
      return {
        state: next,
        events: [{ type: 'ENTRY_UPDATED', lid: action.lid }],
      };
    }
    case 'TOGGLE_SHOW_ARCHIVED': {
      const next: AppState = { ...state, showArchived: !state.showArchived };
      return { state: next, events: [] };
    }
    case 'SAVE_SEARCH': {
      // Spec: docs/development/saved-searches-v1.md §5–§6.
      if (!state.container) return blocked(state, action);
      if (state.readonly) return blocked(state, action);
      const trimmed = action.name.trim();
      if (trimmed === '') return { state, events: [] };
      const existing = state.container.meta.saved_searches ?? [];
      if (existing.length >= SAVED_SEARCH_CAP) return blocked(state, action);
      const ts = new Date().toISOString();
      const saved = createSavedSearch(generateLid(), trimmed, ts, {
        searchQuery: state.searchQuery,
        archetypeFilter: state.archetypeFilter,
        categoricalPeerFilter: state.categoricalPeerFilter,
        // Slice E (2026-04-23) — Tag axis round-trip. `state.tagFilter`
        // is optional on the TS surface (post-Slice-D additive field);
        // fall back to an empty Set so `createSavedSearch` always gets
        // a non-null `ReadonlySet<string>`.
        tagFilter: state.tagFilter ?? new Set<string>(),
        sortKey: state.sortKey,
        sortDirection: state.sortDirection,
        showArchived: state.showArchived,
      });
      const next: AppState = {
        ...state,
        container: {
          ...state.container,
          meta: {
            ...state.container.meta,
            saved_searches: [...existing, saved],
            updated_at: ts,
          },
        },
      };
      return { state: next, events: [] };
    }
    case 'APPLY_SAVED_SEARCH': {
      if (!state.container) return blocked(state, action);
      const existing = state.container.meta.saved_searches ?? [];
      const saved = existing.find((s) => s.id === action.id);
      if (!saved) return blocked(state, action);
      const fields = applySavedSearchFields(saved);
      // Mirror SET_SORT's manual-mode entry_order snapshot roll-in so
      // switching into manual mode via a saved search behaves the same
      // as switching via SET_SORT (contract §2.5, I-Order...).
      let container = state.container;
      if (
        fields.sortKey === 'manual' &&
        (container.meta.entry_order === undefined ||
          container.meta.entry_order.length === 0)
      ) {
        const snapshot = snapshotEntryOrder(container.entries);
        container = {
          ...container,
          meta: { ...container.meta, entry_order: snapshot },
        };
      }
      const next: AppState = {
        ...state,
        container,
        searchQuery: fields.searchQuery,
        archetypeFilter: fields.archetypeFilter,
        categoricalPeerFilter: fields.categoricalPeerFilter,
        // Slice E: Tag axis round-trip. Missing `tag_filter_v2` in the
        // stored record resolves to an empty Set here, so loading a
        // pre-Slice-E saved search leaves the Tag axis off.
        tagFilter: fields.tagFilter,
        sortKey: fields.sortKey,
        sortDirection: fields.sortDirection,
        showArchived: fields.showArchived,
      };
      return { state: next, events: [] };
    }
    case 'DELETE_SAVED_SEARCH': {
      if (!state.container) return blocked(state, action);
      if (state.readonly) return blocked(state, action);
      const existing = state.container.meta.saved_searches ?? [];
      const remaining = existing.filter((s) => s.id !== action.id);
      if (remaining.length === existing.length) return { state, events: [] };
      const ts = new Date().toISOString();
      const next: AppState = {
        ...state,
        container: {
          ...state.container,
          meta: {
            ...state.container.meta,
            saved_searches: remaining,
            updated_at: ts,
          },
        },
      };
      return { state: next, events: [] };
    }
    case 'SET_VIEW_MODE': {
      const next: AppState = { ...state, viewMode: action.mode };
      return { state: next, events: [] };
    }
    case 'SET_CALENDAR_MONTH': {
      const next: AppState = { ...state, calendarYear: action.year, calendarMonth: action.month };
      return { state: next, events: [] };
    }
    case 'REHYDRATE': {
      if (!state.readonly || !state.container) return blocked(state, action);
      const ts = now();
      const oldCid = state.container.meta.container_id;
      const newCid = generateLid();
      const rehydrated: Container = {
        ...state.container,
        meta: {
          ...state.container.meta,
          container_id: newCid,
          updated_at: ts,
        },
      };
      const next: AppState = {
        ...state,
        container: rehydrated,
        readonly: false,
        lightSource: false,
        // Rehydrate (from readonly / view-only snapshot) is an
        // explicit promotion — treat like Import for persistence.
        viewOnlySource: false,
      };
      return {
        state: next,
        events: [{ type: 'CONTAINER_REHYDRATED', old_cid: oldCid, new_cid: newCid }],
      };
    }
    case 'PURGE_TRASH': {
      if (state.readonly) return blocked(state, action);
      if (!state.container) return blocked(state, action);
      const result = purgeTrash(state.container);
      if (result.purgedCount === 0) return blocked(state, action);
      const next: AppState = { ...state, container: result.container };
      return { state: next, events: [{ type: 'TRASH_PURGED', count: result.purgedCount }] };
    }
    case 'PURGE_ORPHAN_ASSETS': {
      // Manual orphan asset cleanup. This is the user-facing cleanup
      // button; it runs the same helper as the Tier 2-1 auto-GC on
      // SYS_IMPORT_COMPLETE / CONFIRM_IMPORT, but from a different
      // trigger. Every non-import reducer path (DELETE_ENTRY /
      // COMMIT_EDIT / QUICK_UPDATE_ENTRY / BULK_DELETE / RESTORE_ENTRY)
      // still leaves orphan cleanup to this manual action — see
      // docs/development/orphan-asset-auto-gc.md.
      //
      // The helper's identity contract does all the bookkeeping:
      //   - zero orphans → returns the SAME container reference, which
      //     we detect via `===` and turn into a `blocked` no-op. This
      //     keeps the "cleanup button while nothing to do" case from
      //     polluting the event log or flipping identity spuriously.
      //   - some orphans → returns a fresh container with a fresh
      //     `assets` map. We count the delta by comparing the two key
      //     sets so the emitted event carries an accurate `count`.
      if (state.readonly) return blocked(state, action);
      if (!state.container) return blocked(state, action);
      const prev = state.container;
      const pruned = removeOrphanAssets(prev);
      if (pruned === prev) return blocked(state, action);
      const count = Object.keys(prev.assets).length - Object.keys(pruned.assets).length;
      const next: AppState = { ...state, container: pruned };
      return { state: next, events: [{ type: 'ORPHAN_ASSETS_PURGED', count }] };
    }
    case 'SET_SANDBOX_POLICY': {
      if (state.readonly) return blocked(state, action);
      if (!state.container) return blocked(state, action);
      // Validate policy value; treat unknown as 'strict'
      const policy = action.policy === 'relaxed' ? 'relaxed' : 'strict';
      const ts = now();
      const container: Container = {
        ...state.container,
        meta: { ...state.container.meta, sandbox_policy: policy, updated_at: ts },
      };
      const next: AppState = { ...state, container };
      return { state: next, events: [] };
    }
    // ── P1-1: TEXTLOG → TEXT selection + TEXT → TEXTLOG modal ──────
    case 'BEGIN_TEXTLOG_SELECTION': {
      if (!state.container) return blocked(state, action);
      const entry = state.container.entries.find((e) => e.lid === action.lid);
      if (!entry || entry.archetype !== 'textlog') return blocked(state, action);
      const next: AppState = {
        ...state,
        textlogSelection: { activeLid: action.lid, selectedLogIds: [] },
      };
      return { state: next, events: [] };
    }
    case 'TOGGLE_TEXTLOG_LOG_SELECTION': {
      if (!state.textlogSelection) return blocked(state, action);
      const { activeLid, selectedLogIds } = state.textlogSelection;
      const idx = selectedLogIds.indexOf(action.logId);
      const nextIds = idx >= 0
        ? selectedLogIds.filter((id) => id !== action.logId)
        : [...selectedLogIds, action.logId];
      const next: AppState = {
        ...state,
        textlogSelection: { activeLid, selectedLogIds: nextIds },
      };
      return { state: next, events: [] };
    }
    case 'CANCEL_TEXTLOG_SELECTION': {
      if (!state.textlogSelection) return blocked(state, action);
      const next: AppState = { ...state, textlogSelection: null };
      return { state: next, events: [] };
    }
    case 'OPEN_TEXT_TO_TEXTLOG_MODAL': {
      if (state.readonly) return blocked(state, action);
      if (!state.container) return blocked(state, action);
      const source = state.container.entries.find((e) => e.lid === action.sourceLid);
      if (!source || source.archetype !== 'text') return blocked(state, action);
      const splitMode = action.splitMode === 'hr' ? 'hr' : 'heading';
      const next: AppState = {
        ...state,
        textToTextlogModal: { sourceLid: action.sourceLid, splitMode },
      };
      return { state: next, events: [] };
    }
    case 'SET_TEXT_TO_TEXTLOG_SPLIT_MODE': {
      if (!state.textToTextlogModal) return blocked(state, action);
      const splitMode = action.splitMode === 'hr' ? 'hr' : 'heading';
      if (splitMode === state.textToTextlogModal.splitMode) {
        // Identity-preserving no-op — same reference returned so state
        // listeners can skip redundant re-renders.
        return { state, events: [] };
      }
      const next: AppState = {
        ...state,
        textToTextlogModal: { ...state.textToTextlogModal, splitMode },
      };
      return { state: next, events: [] };
    }
    case 'CLOSE_TEXT_TO_TEXTLOG_MODAL': {
      if (!state.textToTextlogModal) return blocked(state, action);
      const next: AppState = { ...state, textToTextlogModal: null };
      return { state: next, events: [] };
    }
    case 'TOGGLE_MULTI_SELECT': {
      const lids = [...state.multiSelectedLids];
      const idx = lids.indexOf(action.lid);
      if (idx >= 0) {
        lids.splice(idx, 1);
      } else {
        lids.push(action.lid);
      }
      // Also include current selectedLid if not already
      if (state.selectedLid && !lids.includes(state.selectedLid)) {
        lids.unshift(state.selectedLid);
      }
      const next: AppState = { ...state, selectedLid: action.lid, multiSelectedLids: lids };
      return { state: next, events: [{ type: 'MULTI_SELECT_CHANGED', lids }] };
    }
    case 'SELECT_RANGE': {
      if (!state.container) return blocked(state, action);
      const entries = state.container.entries;
      const anchorIdx = entries.findIndex((e) => e.lid === state.selectedLid);
      const targetIdx = entries.findIndex((e) => e.lid === action.lid);
      if (anchorIdx < 0 || targetIdx < 0) return blocked(state, action);
      const from = Math.min(anchorIdx, targetIdx);
      const to = Math.max(anchorIdx, targetIdx);
      const lids = entries.slice(from, to + 1).map((e) => e.lid);
      const next: AppState = { ...state, selectedLid: action.lid, multiSelectedLids: lids };
      return { state: next, events: [{ type: 'MULTI_SELECT_CHANGED', lids }] };
    }
    case 'CLEAR_MULTI_SELECT': {
      const next: AppState = { ...state, multiSelectedLids: [] };
      return { state: next, events: [{ type: 'MULTI_SELECT_CHANGED', lids: [] }] };
    }
    case 'BULK_DELETE': {
      if (state.readonly) return blocked(state, action);
      if (!state.container) return blocked(state, action);
      const allSelected = getAllSelected(state);
      if (allSelected.length === 0) return blocked(state, action);
      let container = state.container;
      const ts = now();
      // Bulk-snapshot policy (2026-04-13): every revision produced
      // by a single bulk action shares the same `bulk_id` so a
      // downstream restore UI can group them. Single-entry DELETE
      // does NOT use a bulk_id — see `snapshotEntry` contract.
      const bulkId = generateLid();
      for (const lid of allSelected) {
        const revId = generateLid();
        container = snapshotEntry(container, lid, revId, ts, bulkId);
        container = removeEntry(container, lid);
      }
      const next: AppState = { ...state, container, selectedLid: null, multiSelectedLids: [] };
      return { state: next, events: [{ type: 'BULK_DELETED', lids: allSelected }] };
    }
    case 'BULK_MOVE_TO_FOLDER': {
      if (state.readonly) return blocked(state, action);
      if (!state.container) return blocked(state, action);
      const selected = getAllSelected(state);
      if (selected.length === 0) return blocked(state, action);
      let container = state.container;
      const ts = now();
      for (const lid of selected) {
        // Remove existing structural parent relations
        for (const r of container.relations) {
          if (r.kind === 'structural' && r.to === lid) {
            container = removeRelation(container, r.id);
          }
        }
        // Add new structural relation to target folder
        const relId = generateLid();
        container = addRelation(container, relId, action.folderLid, lid, 'structural', ts);
      }
      const next: AppState = { ...state, container, multiSelectedLids: [] };
      return { state: next, events: [] };
    }
    case 'BULK_MOVE_TO_ROOT': {
      if (state.readonly) return blocked(state, action);
      if (!state.container) return blocked(state, action);
      const selected = getAllSelected(state);
      if (selected.length === 0) return blocked(state, action);
      let container = state.container;
      for (const lid of selected) {
        for (const r of container.relations) {
          if (r.kind === 'structural' && r.to === lid) {
            container = removeRelation(container, r.id);
          }
        }
      }
      const next: AppState = { ...state, container, multiSelectedLids: [] };
      return { state: next, events: [] };
    }
    case 'BULK_SET_STATUS': {
      if (state.readonly) return blocked(state, action);
      if (!state.container) return blocked(state, action);
      const selected = getAllSelected(state);
      if (selected.length === 0) return blocked(state, action);
      let container = state.container;
      const ts = now();
      // Bulk-snapshot policy: single group id for every per-entry
      // revision that this action writes. Entries that would be a
      // no-op (same status already) produce no revision and are NOT
      // counted — the group only holds the revisions of entries
      // that actually changed.
      const bulkId = generateLid();
      for (const lid of selected) {
        const entry = container.entries.find((e) => e.lid === lid);
        if (!entry || entry.archetype !== 'todo') continue;
        const todo = parseTodoBody(entry.body);
        if (todo.status === action.status) continue;
        const updated = serializeTodoBody({ ...todo, status: action.status });
        const revId = generateLid();
        container = snapshotEntry(container, lid, revId, ts, bulkId);
        container = updateEntry(container, lid, entry.title, updated, ts);
      }
      const next: AppState = { ...state, container, multiSelectedLids: [] };
      return { state: next, events: [] };
    }
    case 'BULK_SET_DATE': {
      if (state.readonly) return blocked(state, action);
      if (!state.container) return blocked(state, action);
      const selected = getAllSelected(state);
      if (selected.length === 0) return blocked(state, action);
      let container = state.container;
      const ts = now();
      const targetDate = action.date ?? undefined;
      // Bulk-snapshot policy: see BULK_SET_STATUS above.
      const bulkId = generateLid();
      for (const lid of selected) {
        const entry = container.entries.find((e) => e.lid === lid);
        if (!entry || entry.archetype !== 'todo') continue;
        const todo = parseTodoBody(entry.body);
        if (todo.date === targetDate) continue;
        const updated = serializeTodoBody({ ...todo, date: targetDate });
        const revId = generateLid();
        container = snapshotEntry(container, lid, revId, ts, bulkId);
        container = updateEntry(container, lid, entry.title, updated, ts);
      }
      const next: AppState = { ...state, container, multiSelectedLids: [] };
      return { state: next, events: [] };
    }
    case 'PASTE_ATTACHMENT': {
      if (state.readonly) return blocked(state, action);
      if (!state.container) return blocked(state, action);

      const ts = now();
      const events: DomainEvent[] = [];
      let container = state.container;

      // Auto-placement: inherit the current context's folder and
      // route the attachment into an `ASSETS` subfolder inside it. See
      // docs/development/auto-folder-placement-for-generated-entries.md.
      const contextFolderLid = resolveAutoPlacementFolder(container, action.contextLid);

      // Resolve final placement parent: skip the subfolder layer when
      // the context is already titled ASSETS; otherwise reuse existing
      // ASSETS child or create one in the same reduction.
      let placementParentLid: string | null = null;
      if (contextFolderLid) {
        const contextFolder = container.entries.find((e) => e.lid === contextFolderLid);
        const subName = 'ASSETS';
        if (contextFolder && contextFolder.title === subName) {
          placementParentLid = contextFolderLid;
        } else {
          const existing = findSubfolder(container, contextFolderLid, subName);
          if (existing) {
            placementParentLid = existing;
          } else {
            const subLid = generateLid();
            container = addEntry(container, subLid, 'folder', subName, ts);
            events.push({ type: 'ENTRY_CREATED', lid: subLid, archetype: 'folder' });
            const subRelId = generateLid();
            container = addRelation(container, subRelId, contextFolderLid, subLid, 'structural', ts);
            events.push({
              type: 'RELATION_CREATED', id: subRelId,
              from: contextFolderLid, to: subLid, kind: 'structural',
            });
            placementParentLid = subLid;
          }
        }
      }

      // Create attachment entry (no phase transition).
      const attachmentLid = generateLid();
      const bodyData: Record<string, unknown> = {
        name: action.name,
        mime: action.mime,
        size: action.size,
        asset_key: action.assetKey,
      };
      // v1 image intake optimization (paste + editor-drop surfaces):
      // attach provenance metadata + optional original asset pointer.
      if (action.optimizationMeta) {
        const provenance: Record<string, unknown> = {
          original_mime: action.optimizationMeta.originalMime,
          original_size: action.optimizationMeta.originalSize,
          method: action.optimizationMeta.method,
          quality: action.optimizationMeta.quality,
          resized: action.optimizationMeta.resized,
          original_dimensions: action.optimizationMeta.originalDimensions,
          optimized_dimensions: action.optimizationMeta.optimizedDimensions,
        };
        if (action.originalAssetData) {
          provenance.original_asset_key = `${action.assetKey}__original`;
        }
        bodyData.optimized = provenance;
      }
      const bodyMeta = JSON.stringify(bodyData);
      container = addEntry(container, attachmentLid, 'attachment', action.name, ts);
      container = updateEntry(container, attachmentLid, action.name, bodyMeta, ts);
      const assetsToMerge: Record<string, string> = { [action.assetKey]: action.assetData };
      if (action.originalAssetData) {
        assetsToMerge[`${action.assetKey}__original`] = action.originalAssetData;
      }
      container = mergeAssets(container, assetsToMerge);
      events.push({ type: 'ENTRY_CREATED', lid: attachmentLid, archetype: 'attachment' });

      // Place the attachment under the resolved folder. When no
      // context folder exists (selection at root / unresolved), no
      // structural relation is added and the attachment lands at root
      // — preserving the historical root-fallback path and avoiding
      // any root-level auto-ASSETS bucket.
      if (placementParentLid) {
        const attRelId = generateLid();
        container = addRelation(container, attRelId, placementParentLid, attachmentLid, 'structural', ts);
        events.push({ type: 'RELATION_CREATED', id: attRelId, from: placementParentLid, to: attachmentLid, kind: 'structural' });
      }

      const next: AppState = { ...state, container };
      return { state: next, events };
    }
    case 'TOGGLE_FOLDER_COLLAPSE': {
      const lids = state.collapsedFolders.includes(action.lid)
        ? state.collapsedFolders.filter((l) => l !== action.lid)
        : [...state.collapsedFolders, action.lid];
      const next: AppState = { ...state, collapsedFolders: lids };
      return { state: next, events: [] };
    }
    case 'RESTORE_COLLAPSED_FOLDERS': {
      // A-4 (2026-04-23): boot-time restore from the viewer-local
      // folder-prefs store. Payload is already deduped by the
      // persistence layer, but we still normalise to a fresh
      // mutable string[] so downstream `===` checks can identify
      // the boot transition. No-op when nothing meaningful is
      // stored and nothing is currently collapsed — avoids a
      // spurious listener fire on identity-new-but-value-equal
      // arrays.
      const incoming = Array.from(action.lids);
      if (
        incoming.length === 0
        && state.collapsedFolders.length === 0
      ) {
        return { state, events: [] };
      }
      const next: AppState = { ...state, collapsedFolders: incoming };
      return { state: next, events: [] };
    }
    case 'TOGGLE_RECENT_PANE': {
      const next: AppState = { ...state, recentPaneCollapsed: !state.recentPaneCollapsed };
      return { state: next, events: [] };
    }
    case 'OPEN_STORAGE_PROFILE': {
      if (state.storageProfileOpen) return { state, events: [] };
      const next: AppState = { ...state, storageProfileOpen: true };
      return { state: next, events: [] };
    }
    case 'CLOSE_STORAGE_PROFILE': {
      if (!state.storageProfileOpen) return { state, events: [] };
      const next: AppState = { ...state, storageProfileOpen: false };
      return { state: next, events: [] };
    }
    case 'OPEN_SHORTCUT_HELP': {
      if (state.shortcutHelpOpen) return { state, events: [] };
      const next: AppState = { ...state, shortcutHelpOpen: true };
      return { state: next, events: [] };
    }
    case 'CLOSE_SHORTCUT_HELP': {
      if (!state.shortcutHelpOpen) return { state, events: [] };
      const next: AppState = { ...state, shortcutHelpOpen: false };
      return { state: next, events: [] };
    }
    case 'OPEN_TODO_ADD_POPOVER': {
      // Slice 1 (Kanban) + Slice 2 (Calendar) of the Todo / Editor-in
      // / continuous-edit wave. The popover is renderer-owned; the
      // reducer holds only the context (status | date). Blocked in
      // readonly / no-container — edit-like flows share the same
      // guard as CREATE_ENTRY.
      if (state.readonly) return blocked(state, action);
      if (!state.container) return blocked(state, action);
      const desired = action.context === 'kanban'
        ? { context: 'kanban' as const, status: action.status }
        : { context: 'calendar' as const, date: action.date };
      // Identity when the same popover is already open — keeps
      // downstream `===` listeners from flipping for redundant opens.
      const current = state.todoAddPopover;
      if (
        current
        && current.context === desired.context
        && (
          (current.context === 'kanban' && desired.context === 'kanban' && current.status === desired.status)
          || (current.context === 'calendar' && desired.context === 'calendar' && current.date === desired.date)
        )
      ) {
        return { state, events: [] };
      }
      const next: AppState = { ...state, todoAddPopover: desired };
      return { state: next, events: [] };
    }
    case 'CLOSE_TODO_ADD_POPOVER': {
      if (!state.todoAddPopover) return { state, events: [] };
      const next: AppState = { ...state, todoAddPopover: null };
      return { state: next, events: [] };
    }
    case 'COMMIT_TODO_ADD': {
      // Atomic Todo creation with context inherited from the popover.
      // Unlike CREATE_ENTRY this path does NOT transition to `editing`
      // phase and does NOT change `viewMode` — the user stays in the
      // Kanban / Calendar view and the new card/tile is already
      // populated with the popover's title + context, so no follow-up
      // edit is needed.
      //
      // Auto-placement (TODOS subfolder under the current context) is
      // applied in the same reduction, matching the existing CREATE_
      // ENTRY handling.
      if (state.readonly) return blocked(state, action);
      if (!state.container) return blocked(state, action);
      if (!state.todoAddPopover) return blocked(state, action);
      const trimmed = action.title.trim();
      if (trimmed.length === 0) return blocked(state, action);
      const popover = state.todoAddPopover;
      const ts = now();
      const events: DomainEvent[] = [];
      let container = state.container;

      // Auto-placement: reuse the same resolver the toolbar "+ Todo"
      // uses, but inside the reducer so placement is atomic with the
      // entry creation and the status body write below.
      const autoPlacementParent = resolveAutoPlacementFolder(container, state.selectedLid ?? null);
      let placementParentLid: string | null = null;
      if (autoPlacementParent) {
        const parent = container.entries.find((e) => e.lid === autoPlacementParent);
        if (parent && parent.archetype === 'folder') {
          placementParentLid = parent.lid;
          const sub = 'TODOS';
          if (parent.title !== sub) {
            const existing = findSubfolder(container, parent.lid, sub);
            if (existing) {
              placementParentLid = existing;
            } else {
              const subLid = generateLid();
              container = addEntry(container, subLid, 'folder', sub, ts);
              events.push({ type: 'ENTRY_CREATED', lid: subLid, archetype: 'folder' });
              const subRelId = generateLid();
              container = addRelation(container, subRelId, parent.lid, subLid, 'structural', ts);
              events.push({
                type: 'RELATION_CREATED', id: subRelId,
                from: parent.lid, to: subLid, kind: 'structural',
              });
              placementParentLid = subLid;
            }
          }
        }
      }

      const lid = generateLid();
      container = addEntry(container, lid, 'todo', trimmed, ts);
      // Context-specific body:
      //   - kanban  → status from popover, no date
      //   - calendar → date from popover, default status 'open'
      // Calendar-context adds deliberately default to `open`: the
      // Calendar view is date-focused and does not expose a status
      // selector at the add point. Users who want to log already-done
      // work on a date can still toggle status after the fact.
      const body = popover.context === 'kanban'
        ? serializeTodoBody({ status: popover.status, description: '' })
        : serializeTodoBody({ status: 'open', description: '', date: popover.date });
      container = updateEntry(container, lid, trimmed, body, ts);
      events.push({ type: 'ENTRY_CREATED', lid, archetype: 'todo' });

      if (placementParentLid) {
        const relId = generateLid();
        container = addRelation(container, relId, placementParentLid, lid, 'structural', ts);
        events.push({
          type: 'RELATION_CREATED', id: relId,
          from: placementParentLid, to: lid, kind: 'structural',
        });
      }

      const next: AppState = {
        ...state,
        container,
        selectedLid: lid,
        // PR-ε₂ invariant (2026-04-22 audit): COMMIT_TODO_ADD fires
        // from the Kanban / Calendar popover, not from the sidebar.
        // The newly created todo may land under a collapsed ancestor
        // folder (auto-placement targets the nearest TODOS subfolder),
        // but we deliberately preserve `state.collapsedFolders` by
        // reference — the user's folding intent must survive the
        // add, matching PR-ε₂'s "view-local operations do not unfold
        // sidebar branches" lockdown. External reveal (storage
        // profile / entry-ref) is the only opt-in path.
        todoAddPopover: null,
      };
      return { state: next, events };
    }
    case 'SYS_ERROR': {
      const next: AppState = { ...state, phase: 'error', error: action.error };
      return { state: next, events: [{ type: 'ERROR_OCCURRED', error: action.error }] };
    }
    default:
      return blocked(state, action);
  }
}

function reduceEditing(state: AppState, action: Dispatchable): ReduceResult {
  switch (action.type) {
    case 'COMMIT_EDIT': {
      if (!state.container) return blocked(state, action);
      if (isReservedLid(action.lid)) return blocked(state, action);

      // FI-01 save-time optimistic version guard. When a base
      // snapshot is available (preferred: action.base; fallback:
      // state.editingBase captured at BEGIN_EDIT), check whether the
      // container has advanced since edit start. If it has, we refuse
      // to write and park the draft in state.dualEditConflict so the
      // UI can offer a resolution (save-as-branch / discard / copy).
      // When no base is available (legacy fixture / direct
      // phase='editing' entry), we skip the guard to preserve
      // backward compatibility — see COMMIT_EDIT JSDoc in
      // user-action.ts.
      const base: EditBaseSnapshot | null =
        action.base ?? state.editingBase ?? null;
      if (base !== null) {
        const check = checkSaveConflict(base, state.container);
        if (check.kind !== 'safe') {
          const conflict: DualEditConflictState = {
            lid: action.lid,
            base,
            draft: {
              title: action.title,
              body: action.body,
              ...(action.assets ? { assets: action.assets } : {}),
            },
            kind: check.kind,
          };
          if (check.kind === 'version-mismatch') {
            conflict.currentUpdatedAt = check.currentUpdatedAt;
            if (check.currentContentHash !== undefined) {
              conflict.currentContentHash = check.currentContentHash;
            }
          } else if (check.kind === 'archetype-changed') {
            conflict.currentArchetype = check.currentArchetype;
          }
          const rejectedState: AppState = {
            ...state,
            dualEditConflict: conflict,
          };
          const rejectEvent: DomainEvent = {
            type: 'DUAL_EDIT_SAVE_REJECTED',
            lid: action.lid,
            kind: check.kind,
            baseUpdatedAt: base.updated_at,
            ...(check.kind === 'version-mismatch'
              ? { currentUpdatedAt: check.currentUpdatedAt }
              : {}),
          };
          return { state: rejectedState, events: [rejectEvent] };
        }
      }

      const ts = now();
      // Snapshot the entry before update (minimal revision)
      const revId = generateLid();
      let container = snapshotEntry(state.container, action.lid, revId, ts);
      // Apply the update
      container = updateEntry(container, action.lid, action.title, action.body, ts);
      // Merge any assets (e.g., attachment file data)
      if (action.assets) {
        container = mergeAssets(container, action.assets);
      }
      const next: AppState = {
        ...state,
        phase: 'ready',
        editingLid: null,
        container,
        editingBase: null,
        dualEditConflict: null,
      };
      return {
        state: next,
        events: [
          { type: 'EDIT_COMMITTED', lid: action.lid },
          { type: 'ENTRY_UPDATED', lid: action.lid },
        ],
      };
    }
    case 'CANCEL_EDIT': {
      const next: AppState = {
        ...state,
        phase: 'ready',
        editingLid: null,
        editingBase: null,
        dualEditConflict: null,
      };
      return { state: next, events: [{ type: 'EDIT_CANCELLED' }] };
    }
    case 'RESOLVE_DUAL_EDIT_CONFLICT': {
      // FI-01 v1 §5. Only valid while a conflict is parked in state
      // and the action targets that same lid. Every mismatch preserves
      // identity so downstream `===` checks stay cheap.
      const conflict = state.dualEditConflict;
      if (!conflict) return blocked(state, action);
      if (conflict.lid !== action.lid) return blocked(state, action);

      if (action.resolution === 'copy-to-clipboard') {
        const ticket = (conflict.copyRequestTicket ?? 0) + 1;
        const next: AppState = {
          ...state,
          dualEditConflict: { ...conflict, copyRequestTicket: ticket },
        };
        return { state: next, events: [] };
      }

      if (action.resolution === 'discard-my-edits') {
        const next: AppState = {
          ...state,
          phase: 'ready',
          editingLid: null,
          editingBase: null,
          dualEditConflict: null,
        };
        return {
          state: next,
          events: [{ type: 'DUAL_EDIT_DISCARDED', lid: conflict.lid }],
        };
      }

      // save-as-branch (default safe action).
      if (!state.container) return blocked(state, action);
      const newLid = generateLid();
      const relationId = generateLid();
      const ts = now();
      let container = branchFromDualEditConflict(
        state.container,
        conflict.base,
        { title: conflict.draft.title, body: conflict.draft.body },
        newLid,
        relationId,
        ts,
      );
      if (container === state.container) {
        // Defensive: branchFromDualEditConflict returned the input
        // reference (id collision). Treat as blocked to preserve
        // I-Dual9 identity semantics.
        return blocked(state, action);
      }
      if (conflict.draft.assets) {
        container = mergeAssets(container, conflict.draft.assets);
      }
      const next: AppState = {
        ...state,
        phase: 'ready',
        editingLid: null,
        editingBase: null,
        dualEditConflict: null,
        container,
        selectedLid: newLid,
      };
      return {
        state: next,
        events: [{
          type: 'ENTRY_BRANCHED_FROM_DUAL_EDIT',
          sourceLid: conflict.lid,
          newLid,
          resolvedAt: ts,
        }],
      };
    }
    case 'PASTE_ATTACHMENT': {
      // Delegate to the ready-phase handler — it preserves phase/editingLid/selectedLid
      return reduceReady(state, action);
    }
    case 'MOVE_ENTRY_UP':
    case 'MOVE_ENTRY_DOWN': {
      // C-2 v1 contract §6.1: MOVE_ENTRY is allowed during `editing`.
      // Delegate to reduceReady → reduceMoveEntry, which only touches
      // `container.meta.entry_order` and preserves phase / editingLid
      // via the identity spread at the tail of reduceMoveEntry.
      return reduceReady(state, action);
    }
    case 'RECORD_ENTRY_REF_SELECTION': {
      // v1.3: runtime-only LRU of recently accepted autocomplete lids.
      // Prepend + dedupe + cap at 20. See
      // docs/development/entry-autocomplete-v1.3-recent-first.md.
      const lid = action.lid;
      const deduped = state.recentEntryRefLids.filter((x) => x !== lid);
      const next = [lid, ...deduped].slice(0, 20);
      return { state: { ...state, recentEntryRefLids: next }, events: [] };
    }
    default:
      return blocked(state, action);
  }
}

function reduceExporting(state: AppState, action: Dispatchable): ReduceResult {
  switch (action.type) {
    case 'SYS_FINISH_EXPORT': {
      const next: AppState = { ...state, phase: 'ready', exportMode: null, exportMutability: null };
      return { state: next, events: [{ type: 'EXPORT_COMPLETED' }] };
    }
    case 'SYS_ERROR': {
      const next: AppState = { ...state, phase: 'error', error: action.error };
      return { state: next, events: [{ type: 'ERROR_OCCURRED', error: action.error }] };
    }
    default:
      return blocked(state, action);
  }
}

function reduceError(state: AppState, action: Dispatchable): ReduceResult {
  switch (action.type) {
    case 'SYS_INIT_COMPLETE': {
      const next: AppState = {
        ...state,
        phase: 'ready',
        container: action.container,
        embedded: action.embedded ?? state.embedded,
        readonly: action.readonly ?? false,
        lightSource: action.lightSource ?? false,
        viewOnlySource: action.viewOnlySource ?? false,
        error: null,
      };
      const cid = action.container?.meta?.container_id ?? 'unknown';
      return { state: next, events: [{ type: 'CONTAINER_LOADED', container_id: cid }] };
    }
    case 'SYS_IMPORT_COMPLETE': {
      // Tier 2-1: mirror the reduceReady auto-GC behaviour on the
      // error-recovery import path so the two paths stay aligned.
      const importedContainer = action.container;
      const purged = removeOrphanAssets(importedContainer);
      const purgedCount =
        purged === importedContainer
          ? 0
          : Object.keys(importedContainer.assets).length - Object.keys(purged.assets).length;
      const next: AppState = {
        ...state,
        phase: 'ready',
        container: purged,
        selectedLid: null,
        editingLid: null,
        error: null,
        lightSource: false,
        viewOnlySource: false,
      };
      const cid = action.container?.meta?.container_id ?? 'unknown';
      const events: DomainEvent[] = [{ type: 'CONTAINER_IMPORTED', container_id: cid, source: action.source }];
      if (purgedCount > 0) events.push({ type: 'ORPHAN_ASSETS_PURGED', count: purgedCount });
      return { state: next, events };
    }
    default:
      return blocked(state, action);
  }
}

// ---- Utility ----

let lidCounter = 0;

export function generateLid(): string {
  lidCounter += 1;
  const ts = Date.now().toString(36);
  const seq = lidCounter.toString(36).padStart(4, '0');
  return `${ts}-${seq}`;
}
