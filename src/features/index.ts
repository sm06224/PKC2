// Features layer — Layer 3.
//
// Features import from core (read-only types) but never modify core.
// Features export pure functions/types consumed by adapter (renderer, binder).
// Feature state lives in AppState as runtime-only fields.

export {
  filterEntries,
  entryMatchesQuery,
  filterByArchetype,
  applyFilters,
} from './search/filter';

export { sortEntries } from './search/sort';
export type { SortKey, SortDirection } from './search/sort';

export { getRelationsForEntry, resolveRelations } from './relation/selector';
export type { Direction, DirectedRelation, ResolvedRelation } from './relation/selector';

export { getTagsForEntry, getAvailableTagTargets } from './relation/tag-selector';
export type { Tag } from './relation/tag-selector';

export { entryHasTag, filterByTag } from './relation/tag-filter';
