// Features layer — Layer 3.
//
// Features import from core (read-only types) but never modify core.
// Features export pure functions/types consumed by adapter (renderer, binder).
// Feature state lives in AppState as runtime-only fields.

export { filterEntries, entryMatchesQuery } from './search/filter';
