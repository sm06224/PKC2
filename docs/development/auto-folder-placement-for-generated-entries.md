# Auto-folder placement for generated entries

"Incidental" objects — todos, attachments, pasted images — used to
land at the root of the tree unless the user explicitly created them
inside a folder row. Over time the root became noisy with rows that
nobody actually navigates to directly.

This pass makes those objects inherit the current working context
**and** routes them into an archetype-specific subfolder inside that
context — so when the user is looking at `ProjectA/notes.md`, a new
todo goes into `ProjectA/TODOS/` and a pasted image into
`ProjectA/ASSETS/`. Incidentals stop scattering and stay organised per
project without any manual filing.

## Scope

Covered archetypes (auto-placed into a subfolder):

- `todo` → `TODOS`
- `attachment` (explicit create + `PASTE_ATTACHMENT` from image paste)
  → `ASSETS`

Out of scope (unchanged):

- `text`, `textlog`, `folder`, `form`, `generic`, `opaque` — primary
  documents retain the "root unless the button said otherwise"
  contract, so a deliberate root-level create still works and no
  subfolder is ever auto-generated for them.

## Placement rules

Two layers, applied in order:

### 1. Context-folder resolution

Done by `resolveAutoPlacementFolder(container, selectedLid)`
(`src/features/relation/auto-placement.ts`):

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

### 2. Archetype subfolder routing

Once a context folder is resolved, the reducer routes the new entry
through an archetype-specific subfolder:

- `ARCHETYPE_SUBFOLDER_NAMES` maps the archetype to a fixed title
  (`todo → TODOS`, `attachment → ASSETS`).
- `findSubfolder(container, contextFolderLid, title)` returns the
  first existing child folder with that exact title, or `null`.
- If the subfolder exists, it is **reused** — no duplicates.
- If not, the reducer **creates** a new folder with that title under
  the context folder in the same reduction.
- If the context folder itself has title === subfolder name (e.g.
  user is already inside an `ASSETS/` folder), the subfolder layer is
  **skipped** — no nested `ASSETS/ASSETS`.

When the context resolver returned `null` (root fallback), the
subfolder layer is skipped entirely. We explicitly do **not**
auto-create root-level `TODOS` / `ASSETS` buckets — those would scatter
at root in exactly the way we set out to stop.

Title matching is case-sensitive and exact. Multiple same-titled
subfolders are tolerated — the first match (in relation order) is
used, mirroring how the rest of the app disambiguates sibling
collisions.

## Why a subfolder rather than direct placement

Placing todos / attachments directly inside the context folder (the
previous pass) already stopped the "root noise" problem, but it
scattered a different way: in a folder with notes, todos and images
all sat next to each other, making the primary document harder to
find.

Routing into an archetype-specific subfolder:

- keeps the primary documents visible at the top level of the folder,
- naturally groups incidentals together without the user filing
  anything manually,
- composes with any folders the user has already organised.

We still explicitly do **not**:

- create dedicated subfolders for non-incidental archetypes
  (`text`, `textlog`, `folder`, `form`, …).
- move existing entries when the rule changes (existing data is not
  touched).
- walk transitive relations (categorical / semantic / temporal). Only
  the structural chain contributes.

Pre-existing root-level `ASSETS` / `TODOS` folders in user data remain
— they are just not magic. Auto-creation only happens under a
resolved context folder.

## Action plumbing

`CREATE_ENTRY` carries two optional fields
(`src/core/action/user-action.ts`):

- `parentFolder?: string` — the resolved context-folder lid.
- `ensureSubfolder?: string` — the subfolder title to find-or-create
  inside `parentFolder`.

The action-binder resolves both **before** dispatching
(`src/adapter/ui/action-binder.ts`, case `create-entry`). The reducer
then, in a single atomic reduction:

1. Validates `parentFolder` (must be a folder, else root fallback —
   `ensureSubfolder` is ignored in that case).
2. If `ensureSubfolder` is given and `parentFolder.title !== ensureSubfolder`:
   - Reuse an existing child folder with that title, or create one.
3. Emits `ENTRY_CREATED` + `RELATION_CREATED` for any new subfolder.
4. Creates the real entry and wires its structural relation to the
   final placement parent (either the context folder itself — when
   the subfolder layer was skipped — or the reused / newly-created
   subfolder).
5. Emits `ENTRY_CREATED` for the new entry and `RELATION_CREATED`
   when a placement parent was wired.

Atomicity matters because `CREATE_ENTRY` transitions the state
machine into `editing`, where follow-up `CREATE_RELATION` /
`CREATE_ENTRY` would be blocked — the whole subfolder-plus-entry
dance has to happen inside one reduction.

Explicit `data-pkc-context-folder` on the triggering button still
wins over auto-resolution for WHICH context folder is used — e.g. a
`+ New` button rendered inside a specific folder row still routes
into that folder regardless of the current selection. The subfolder
layer then runs on top of the explicit context exactly as it would on
an auto-resolved one ("todos belong in `TODOS` wherever they land").

`PASTE_ATTACHMENT` performs the same find-or-create dance directly in
its reducer branch (using the shared `findSubfolder` helper),
replacing the legacy ASSETS-folder creation logic that used to treat
`ASSETS` as a sibling of the pasting entry.

## Testing

- `tests/features/relation/auto-placement.test.ts` — 17 tests pinning
  the pure resolution rules:
  - context resolver (folder / parent / walk / root fallback / cycle
    safety / missing input guards)
  - `getSubfolderNameForArchetype` mapping coverage
  - `findSubfolder` (exact title match, non-folder children ignored,
    case sensitivity, first-match semantics, non-structural relations
    ignored).
- `tests/adapter/action-binder-auto-placement.test.ts` — 11 integration
  tests covering:
  - TODOS subfolder create + reuse + no-nesting + root fallback
  - ASSETS subfolder create + reuse
  - explicit-context regression guard (now also triggers subfolder)
  - non-auto archetypes remain untouched.
- `tests/core/app-state.test.ts` — `PASTE_ATTACHMENT` suite (10 tests)
  covers ASSETS subfolder create + reuse, no-nesting when context is
  itself `ASSETS`, root-context root-fallback, event-count expectations
  for both lazy-create and root paths, and existing-at-root ASSETS
  being ignored.

## File-attachment intake (PR #174 補追, 2026-04-27)

`processFileAttachmentWithDedupe` (DnD on sidebar / center drop
zones + 上部 `📎 File` archetype-create button) も同じ
`parentFolder` + `ensureSubfolder` route を使うように refactor
された。以前は次の sequence で実装されていた:

```
CREATE_ENTRY (parent なし)
  → COMMIT_EDIT
    → CREATE_RELATION(contextFolder, newEntry, structural)  ← 後出し
```

しかし `CREATE_ENTRY` は phase を `editing` に遷移させるため、
後続の `CREATE_RELATION` が race し、ASSETS バケットフォルダ
レイヤが作られず、entry が contextFolder の直下に flat に積まれて
いた。User audit「左ペインのDnDエリアへのファイル添付がASSETSに
整理されない」で発覚。

修正後:

```ts
// processFileAttachmentWithDedupe
const preState = dispatcher.getState();
const autoPlacementFolder =
  !contextFolder && preState.container
    ? resolveAutoPlacementFolder(preState.container, preState.selectedLid ?? null)
    : null;
const parentFolder = contextFolder ?? autoPlacementFolder ?? undefined;
const subfolderName = getSubfolderNameForArchetype('attachment');
const ensureSubfolder =
  parentFolder && subfolderName ? subfolderName : undefined;
dispatcher.dispatch({
  type: 'CREATE_ENTRY',
  archetype: 'attachment',
  title: file.name,
  parentFolder,
  ensureSubfolder,
});
```

これで:
- DnD sidebar drop zone (no contextFolder) → 選択中 entry の
  ancestor を walk して auto-placement
- DnD center drop zone (contextFolder ある) → 明示の context が勝つ
- 上部 `📎 File` button (multi-file picker) → 同じ route

3 surface 全てが atomic に ASSETS バケットを生成する。重複ファイル
添付時も同じ ASSETS が **再利用** される (`findSubfolder` で title
exact match)。

Tests: `tests/adapter/fi04-multi-add-dedupe-persistent-dnd.test.ts`
+4 (sidebar DnD with selection / no selection / center-pane explicit
context / dedup retains ASSETS)。

## Not done here

- Back-fill of existing root-level todos / attachments into resolved
  subfolders. Placement is for newly-created entries only.
- Per-archetype configurable subfolder names as a user preference.
  Fixed titles (`TODOS`, `ASSETS`) are sufficient for the minimal pass
  and avoid a persisted setting.
- Semantic / categorical walk for placement. Only structural ancestry
  contributes.
- Auto-creation of `TODOS` / `ASSETS` as siblings at root when no
  context folder resolves — incidentals still land at root in that
  case.
