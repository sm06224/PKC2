import type { ArchetypeId } from '../model/record';
import type { RelationKind } from '../model/relation';

/** Export scope: 'light' omits assets; 'full' includes everything. */
export type ExportMode = 'light' | 'full';

/** Export mutability: 'editable' allows editing; 'readonly' is view-only with rehydrate option. */
export type ExportMutability = 'editable' | 'readonly';

/**
 * UserAction: actions initiated by the user through the UI.
 *
 * These are imperative requests — "the user wants to…".
 * The reducer decides whether the action is permitted
 * based on the current AppPhase.
 *
 * Naming: VERB_NOUN, present tense imperative.
 * All type literals are string constants (minify-safe).
 */
export type UserAction =
  | { type: 'SELECT_ENTRY'; lid: string }
  | { type: 'DESELECT_ENTRY' }
  | { type: 'BEGIN_EDIT'; lid: string }
  | { type: 'COMMIT_EDIT'; lid: string; title: string; body: string; assets?: Record<string, string> }
  | { type: 'CANCEL_EDIT' }
  | { type: 'CREATE_ENTRY'; archetype: ArchetypeId; title: string }
  | { type: 'DELETE_ENTRY'; lid: string }
  | { type: 'BEGIN_EXPORT'; mode: ExportMode; mutability: ExportMutability }
  | { type: 'CREATE_RELATION'; from: string; to: string; kind: RelationKind }
  | { type: 'DELETE_RELATION'; id: string }
  | { type: 'ACCEPT_OFFER'; offer_id: string }
  | { type: 'DISMISS_OFFER'; offer_id: string }
  | { type: 'CONFIRM_IMPORT' }
  | { type: 'CANCEL_IMPORT' }
  | { type: 'RESTORE_ENTRY'; lid: string; revision_id: string }
  | { type: 'SET_SEARCH_QUERY'; query: string }
  | { type: 'SET_ARCHETYPE_FILTER'; archetype: ArchetypeId | null }
  | { type: 'CLEAR_FILTERS' }
  | { type: 'SET_TAG_FILTER'; tagLid: string | null }
  | { type: 'SET_SORT'; key: 'title' | 'created_at' | 'updated_at'; direction: 'asc' | 'desc' }
  /**
   * QUICK_UPDATE_ENTRY — body-only update without entering edit mode.
   *
   * Contract:
   * - Updates body ONLY; title is preserved from the existing entry.
   * - Allowed in ready phase only (blocked in editing/exporting/initializing/error).
   * - Creates a revision snapshot before applying the update.
   * - Emits ENTRY_UPDATED event.
   * - Does NOT change phase, selectedLid, or editingLid.
   *
   * Intended use: small immediate operations on presenter-rendered views
   * (e.g., todo status toggle). NOT for title changes, archetype changes,
   * or operations that warrant full editor interaction.
   */
  | { type: 'QUICK_UPDATE_ENTRY'; lid: string; body: string }
  /**
   * REHYDRATE — convert readonly artifact to editable workspace.
   *
   * Contract:
   * - Only allowed in ready phase when state.readonly is true.
   * - Creates a new container with a fresh cid (independent copy).
   * - Saves to browser storage (IDB) via persistence layer.
   * - Clears readonly flag, making the workspace fully editable.
   * - Does NOT modify the original artifact.
   */
  | { type: 'REHYDRATE' }
  | { type: 'TOGGLE_SHOW_ARCHIVED' }
  | { type: 'SET_VIEW_MODE'; mode: 'detail' | 'calendar' }
  | { type: 'SET_CALENDAR_MONTH'; year: number; month: number };

/** Extract the type literal from a UserAction. */
export type UserActionType = UserAction['type'];
