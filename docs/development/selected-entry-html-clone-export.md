# Selected-entry HTML clone export

"Hand off what I'm looking at to someone who doesn't have PKC2."
Produces a self-contained `.html` — the same shell PKC2 always ships,
but carrying only the subset of the current container that the
selected entry actually needs.

## Why this is separate from ZIP export

Two different goals, two different artifacts:

| Format | Purpose | Requires PKC2 on recipient? | Round-trip target |
|--------|---------|-----------------------------|-------------------|
| `.text.zip` / `.textlog.zip` | Data interchange. Peer re-imports as a fresh entry. | ✅ | `importTextBundle` / `importTextlogBundle` |
| `.pkc2-*.html`               | Distribution / reading / light editing. Opens in any browser. | ❌ | none — it IS PKC2 |

The ZIP path is documented in
`docs/development/selected-entry-export-and-reimport.md`. This
document covers the HTML clone path.

## Pipeline

```
selectedLid
  ↓
buildSubsetContainer(container, selectedLid)     ← pure, features layer
  ↓
retitledSubset (meta.title ← selected entry title)
  ↓
exportContainerAsHtml(retitledSubset, { mode:'full', mutability:'editable' })
  ↓
<slug>-<YYYYMMDD>.html  (downloaded)
```

No new HTML runtime. No new serializer. The existing
`exportContainerAsHtml` pipeline in
`src/adapter/platform/exporter.ts` is reused verbatim — only the
container it embeds is smaller.

## Reachability

`buildSubsetContainer(container, rootLid)` closes over:

1. **Root entry** — always included.
2. **Entry refs** — every `entry:<lid>` found in a TEXT body or
   TEXTLOG row text pulls the target entry in, recursively. Covers:
   - bare `entry:<lid>`
   - link form `[label](entry:<lid>)`
   - transclusion `![alt](entry:<lid>)`
   - fragment variants (`#log/…`, `#day/…`, `#log/a..b`,
     `#log/id/slug`, legacy `#id`) — fragment collapses to the target
     LID; the whole entry is pulled in (fragment-only slicing would
     risk broken renders).
3. **Asset refs** — every `asset:<key>` found in a TEXT body or
   TEXTLOG row text contributes the key. Attachment entries whose
   `asset_key` owns a contributed key are pulled in too so MIME /
   display-name metadata survives.
4. **Structural ancestors** — every included entry's structural
   parent chain is pulled in (folder or otherwise, up to
   `MAX_ANCESTOR_DEPTH = 32`) so breadcrumbs, SELECT_ENTRY
   auto-expand, and tree navigation still resolve on the recipient
   side.

Cycle-safe (`visited` set + iteration cap). Returns `null` when
`rootLid` does not resolve — callers treat that as inert.

## Filtering

Applied after reachability closes:

- `relations`: an edge survives iff **both** `from` and `to` are in
  the subset. Dangling edges are dropped.
- `assets`: only keys reachable from included entries survive.
  Missing-in-source keys are recorded in `missingAssetKeys` but never
  cause the export to fail — the recipient sees the same broken-ref
  signal the sender saw.
- `revisions`: **dropped**. Revisions carry historical bodies of
  potentially-filtered-out entries; preserving them would leak
  content. Callers who need revision history should export the full
  container via `Export` (not `Selected as HTML`).

## File naming

Before calling `exportContainerAsHtml`, the subset's
`container.meta.title` is overridden with the selected entry's title.
This single override drives:

- the `<title>` tag of the emitted HTML
- the slug in the filename produced by `generateExportFilename` →
  `pkc2-<entry-slug>-<YYYYMMDD>.html`

No custom filename helper is added — the existing slugifier and date
formatter in `exporter.ts` are reused.

## UI

Data menu (inline export/import panel):

- `📤 Selected`             — ZIP export of the selected entry (text / textlog only)
- `📤 Selected as HTML`     — HTML clone export of the selected entry **subset** (any archetype)

The HTML button is:

- **disabled** when nothing is selected (the label still reads
  `📤 Selected as HTML` so discoverability stays flat)
- **enabled** otherwise — unlike the ZIP button, HTML can carry any
  archetype, so there is no archetype-level gate. Even a folder
  selection is valid: the subset closure keeps every descendant
  that's reachable via the folder's structural relations.

The action handler self-guards against stale DOM references: a
synthetic click with no selection shows a toast and returns without
triggering a download.

## Missing-asset handling

If `buildSubsetContainer` reports `missingAssetKeys.size > 0`, a
native `confirm()` prompts before generating the HTML. Proceeding
yields a valid HTML with the broken refs preserved verbatim. Live
state is never mutated.

## Round-trip contract

The emitted HTML is a normal PKC2 clone — opening it loads the
embedded subset container exactly like any other clone. Inside the
HTML the recipient can:

- read / navigate every included entry
- edit / save (into their own IndexedDB, since
  `mutability: 'editable'`)
- export from the clone as a new full or light HTML
- re-import a `.text.zip` / `.textlog.zip` shared separately

The clone has no awareness that its container was a subset — it
simply sees a valid smaller container.

## Out of scope

- Multi-select HTML export (N arbitrary entries)
- `mutability: 'readonly'` variant of the subset export (could be
  added trivially; not wired to UI)
- Light-mode (asset-stripped) subset export
- Selective revisions preservation
- Diff / merge back into the source container after edits
- Transitive relation walking (categorical / semantic / temporal).
  Only entry refs embedded in bodies close the entry set; foreign
  relations are dropped when an endpoint falls outside the subset.
  A future policy could treat strong `semantic` relations as
  reachability edges — intentionally deferred.

## Tests

- `tests/features/entry-ref/extract-entry-refs.test.ts` — 7 tests
  pinning the `entry:<lid>` scanner (bare / link / transclusion /
  fragment / dedup / asset-ref non-confusion).
- `tests/features/container/build-subset.test.ts` — 15 tests covering
  root-only minimum, asset collection + attachment pull-in, missing
  refs, transclusion form, fragment forms, cycle safety, TEXTLOG row
  scanning, structural ancestors, relation filtering, end-to-end
  invariants.
- `tests/adapter/action-binder-selected-entry-html-export.test.ts` —
  5 tests covering UI gating (3) and click-to-download wiring (2).
- `tests/adapter/renderer-export-grouping.test.ts` — 19 tests
  pinning the Share / Archive / Import grouping contract, icon
  assignment (📤 vs 📦), and the title-text distinction between
  "配布用 HTML / PKC2 不要" and "再インポート用 ZIP".
- Existing coverage this feature rides on: `tests/adapter/exporter.test.ts`
  (70+ cases on the unchanged clone pipeline).

## Data menu grouping

The Data menu is laid out as three visually separated groups so
the two distinct export workflows read as different affordances
rather than variants of one action:

```
┌─ Share — standalone HTML, openable without PKC2 ───────┐
│  Export │ Light │ 📤 Selected as HTML                   │
└─────────────────────────────────────────────────────────┘
                         │ (visible separator)
┌─ Archive — ZIP, re-importable into PKC2 ───────────────┐
│  ZIP │ [TEXTLOGs] │ [TEXTs] │ [Mixed] │                 │
│  📦 Selected (TEXT/TEXTLOG)                             │
└─────────────────────────────────────────────────────────┘
                         │ (visible separator)
┌─ Import ───────────────────────────────────────────────┐
│  Import │ 📥 Textlog │ 📥 Text │ 📥 Entry │ 📥 Batch    │
└─────────────────────────────────────────────────────────┘
```

Icon convention:
- 📤 **Share** — produces HTML the recipient can open **without
  PKC2**. No recipient setup, no round-trip.
- 📦 **Package** — produces a ZIP bundle intended to be
  **re-imported** into another PKC2. Carries the full data model,
  round-trips.
- 📥 **Import** — ingests external bundles.

The two "Selected" buttons in particular must not be confused:

| Button | Icon | Produces | Recipient needs PKC2? |
|---|---|---|---|
| `📤 Selected as HTML` | share | Subset `.html` (stand-alone) | ❌ |
| `📦 Selected (TEXT/TEXTLOG)` | package | `.text.zip` / `.textlog.zip` | ✅ |

Both exports use selection (`state.selectedLid`), but:
- `📤 Selected as HTML` is enabled for **any** archetype (subset
  container builder is archetype-agnostic).
- `📦 Selected (…)` is enabled only for **text / textlog** because
  only those archetypes have round-trippable ZIP bundle formats.

Disabled-state titles explicitly tell the user why the button is
inert and which selection would enable it.

### Why grouping and not one dropdown

The Data menu already uses a `<details>` to collapse everything
behind a single `Data…` summary. Collapsing the exports further
into a nested popup would add one more click for the most common
actions (`Export`, `Import`) without reducing visual noise
meaningfully. Spatial grouping + icon differentiation conveys the
workflow difference at a glance while keeping every affordance
one click away. See `tests/adapter/renderer-export-grouping.test.ts`
for the pinned grouping contract.
