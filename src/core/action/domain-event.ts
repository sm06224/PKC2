import type { ArchetypeId } from '../model/record';
import type { RelationKind } from '../model/relation';
import type { BatchImportResultSummary } from './system-command';

/**
 * DomainEvent: immutable facts about what happened.
 *
 * Events are emitted by the reducer AFTER a state transition succeeds.
 * They are past-tense and factual — "this did happen".
 * Consumers (logging, undo stack, side effects) subscribe to events
 * without affecting the state transition itself.
 *
 * Naming: NOUN_PAST_PARTICIPLE.
 */
export type DomainEvent =
  | { type: 'ENTRY_SELECTED'; lid: string }
  | { type: 'ENTRY_DESELECTED' }
  | { type: 'EDIT_BEGUN'; lid: string }
  | { type: 'EDIT_COMMITTED'; lid: string }
  | { type: 'EDIT_CANCELLED' }
  | { type: 'ENTRY_CREATED'; lid: string; archetype: ArchetypeId }
  | { type: 'ENTRY_UPDATED'; lid: string }
  | { type: 'ENTRY_RESTORED'; lid: string; revision_id: string }
  | { type: 'ENTRY_DELETED'; lid: string }
  | { type: 'RELATION_CREATED'; id: string; from: string; to: string; kind: RelationKind }
  | { type: 'RELATION_DELETED'; id: string }
  | { type: 'CONTAINER_LOADED'; container_id: string }
  | { type: 'CONTAINER_IMPORTED'; container_id: string; source: string }
  | { type: 'CONTAINER_MERGED'; container_id: string; source: string; added_entries: number; added_assets: number; added_relations: number }
  | { type: 'EXPORT_COMPLETED' }
  | { type: 'IMPORT_PREVIEWED'; source: string; entry_count: number }
  | { type: 'IMPORT_CANCELLED' }
  | { type: 'BATCH_IMPORT_PREVIEWED'; source: string; totalEntries: number }
  | { type: 'BATCH_IMPORT_CONFIRMED' }
  | { type: 'BATCH_IMPORT_CANCELLED' }
  | { type: 'BATCH_IMPORT_APPLIED'; summary: BatchImportResultSummary }
  | { type: 'RECORD_OFFERED'; offer_id: string; title: string }
  | { type: 'OFFER_ACCEPTED'; offer_id: string; lid: string }
  | { type: 'OFFER_DISMISSED'; offer_id: string; reply_to_id: string | null }
  | { type: 'CONTAINER_REHYDRATED'; old_cid: string; new_cid: string }
  | { type: 'TRASH_PURGED'; count: number }
  | { type: 'ORPHAN_ASSETS_PURGED'; count: number }
  | { type: 'BULK_DELETED'; lids: string[] }
  | { type: 'MULTI_SELECT_CHANGED'; lids: string[] }
  | { type: 'ERROR_OCCURRED'; error: string };

/** Extract the type literal from a DomainEvent. */
export type DomainEventType = DomainEvent['type'];
