import type { ArchetypeId } from '../model/record';
import type { RelationKind } from '../model/relation';

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
  | { type: 'ENTRY_DELETED'; lid: string }
  | { type: 'RELATION_CREATED'; id: string; from: string; to: string; kind: RelationKind }
  | { type: 'RELATION_DELETED'; id: string }
  | { type: 'CONTAINER_LOADED'; container_id: string }
  | { type: 'CONTAINER_IMPORTED'; container_id: string; source: string }
  | { type: 'EXPORT_COMPLETED' }
  | { type: 'IMPORT_PREVIEWED'; source: string; entry_count: number }
  | { type: 'IMPORT_CANCELLED' }
  | { type: 'RECORD_OFFERED'; offer_id: string; title: string }
  | { type: 'OFFER_ACCEPTED'; offer_id: string; lid: string }
  | { type: 'OFFER_DISMISSED'; offer_id: string; reply_to_id: string | null }
  | { type: 'ERROR_OCCURRED'; error: string };

/** Extract the type literal from a DomainEvent. */
export type DomainEventType = DomainEvent['type'];
