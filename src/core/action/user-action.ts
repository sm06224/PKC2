import type { ArchetypeId } from '../model/record';
import type { RelationKind } from '../model/relation';

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
  | { type: 'COMMIT_EDIT'; lid: string; title: string; body: string }
  | { type: 'CANCEL_EDIT' }
  | { type: 'CREATE_ENTRY'; archetype: ArchetypeId; title: string }
  | { type: 'DELETE_ENTRY'; lid: string }
  | { type: 'BEGIN_EXPORT' }
  | { type: 'CREATE_RELATION'; from: string; to: string; kind: RelationKind }
  | { type: 'DELETE_RELATION'; id: string }
  | { type: 'ACCEPT_OFFER'; offer_id: string }
  | { type: 'DISMISS_OFFER'; offer_id: string }
  | { type: 'CONFIRM_IMPORT' }
  | { type: 'CANCEL_IMPORT' }
  | { type: 'RESTORE_ENTRY'; lid: string; revision_id: string }
  | { type: 'SET_SEARCH_QUERY'; query: string }
  | { type: 'SET_ARCHETYPE_FILTER'; archetype: ArchetypeId | null }
  | { type: 'CLEAR_FILTERS' };

/** Extract the type literal from a UserAction. */
export type UserActionType = UserAction['type'];
