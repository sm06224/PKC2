/**
 * Relation kinds for typed edges between Records.
 *
 * Canonical spec: `docs/spec/data-model.md` §5.
 */
export type RelationKind =
  | 'structural'   // folder membership
  | 'categorical'  // tag classification
  | 'semantic'     // meaning-based reference
  | 'temporal';    // time-based ordering

/**
 * Relation: a typed edge between two Records.
 *
 * Canonical spec: `docs/spec/data-model.md` §5.
 */
export interface Relation {
  id: string;
  from: string;       // source Record LID
  to: string;         // target Record LID
  kind: RelationKind;
  created_at: string;
  updated_at: string;
}
