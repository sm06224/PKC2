# Auto-folder placement for generated entries

"Incidental" objects — todos, attachments, pasted images — used to
land at the root of the tree unless the user explicitly created them
inside a folder row. Over time the root became noisy with rows that
nobody actually navigates to directly.

This pass makes those objects inherit the current working context
instead.

## Scope

Covered archetypes (auto-placed):

- `todo`
- `attachment` (explicit create + `PASTE_ATTACHMENT` from image paste)

Out of scope (unchanged):

- `text`, `textlog`, `folder`, `form`, `generic`, `opaque` — primary
  documents retain the "root unless the button said otherwise"
  contract, so a deliberate root-level create still works.

## Placement rules

Applied in order by `resolveAutoPlacementFolder(container,
selectedLid)` (`src/features/relation/auto-placement.ts`):

1. `selectedLid` is `null` / unresolved → `null` (root).
2. The selected entry is itself a folder → that folder's lid.
3. The selected entry has a structural parent chain → the first
   `archetype === 'folder'` ancestor along the chain.
4. No folder ancestor → `null` (root fallback).

`null` means "no auto-placement" — the reducer adds no structural
relation and the new entry sits at root. This preserves the
historical fallback whenever there is no meaningful folder nearby.

Cycle-safe (visited set) and depth-capped at
`MAX_ANCESTOR_DEPTH = 32`, matching the subset-builder and
tree-ancestor walks.

## Why this is NOT a dedicated folder

Previously `PASTE_ATTACHMENT` auto-created an `ASSETS` folder as a
sibling of the context entry and placed the attachment in it. That
approach bought one less-noisy root at the cost of a named
convention, a lazy-create ritual, and a special case in every piece
of tooling that had to recognise the folder.

The new rule is simpler and composes with folders the user has
already organised. We explicitly do **not**:

- auto-create `Attachments` / `Todos` / `Images` folders.
- move existing entries when the rule changes (existing data is not
  touched).
- walk transitive relations (categorical / semantic / temporal). Only
  the structural chain contributes.

Pre-existing `ASSETS` folders in user data remain — they are just no
longer magic.

## Action plumbing

`CREATE_ENTRY` gained an optional `parentFolder` field
(`src/core/action/user-action.ts`). The action-binder resolves the
placement folder **before** dispatching, and hands it to the reducer
in the same action. Placement must be atomic because `CREATE_ENTRY`
transitions the state machine into `editing`, where a follow-up
`CREATE_RELATION` would be blocked.

Explicit `data-pkc-context-folder` on the triggering button always
wins over auto-resolution — e.g. a `+ New` button rendered inside a
specific folder row still routes into that folder regardless of the
current selection.

`PASTE_ATTACHMENT` uses the same helper directly in its reducer
branch, replacing the legacy ASSETS-folder creation logic.

## Testing

- `tests/features/relation/auto-placement.test.ts` — 9 tests pinning
  the pure resolution rules (folder / parent / walk / root fallback
  / cycle safety / missing input guards).
- `tests/adapter/action-binder-auto-placement.test.ts` — 8 integration
  tests covering todo / attachment routing and the explicit-context
  precedence regression guard.
- `tests/core/app-state.test.ts` — `PASTE_ATTACHMENT` suite updated
  to reflect the new placement (no more ASSETS folder; attachment
  inherits the paste context).

## Not done here

- Back-fill of existing root-level todos / attachments into resolved
  folders. Placement is for newly-created entries only.
- Per-archetype default folders as a user preference. Would require a
  persisted setting; out of scope for this minimal pass.
- Semantic / categorical walk for placement. Only structural ancestry
  contributes.
