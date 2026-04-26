# Selected-entry export + re-import

A "small shareable unit" affordance. Answers the user-facing question
**"can I take just this entry, hand it to someone, and have them get
it back as a real entry on their side?"**

## What exists

- `📤 Selected (TEXT)` / `📤 Selected (TEXTLOG)` — top-level Data menu
  button that exports the currently selected entry as a single
  round-trippable ZIP package.
- `📥 Entry` — top-level Data menu button that accepts either a
  `.text.zip` or `.textlog.zip` and routes it to the matching
  dedicated importer.

Both are pure UX wiring on top of the **pre-existing**
`.text.zip` / `.textlog.zip` bundle formats — no new format, no
reducer changes, no data-model changes.

## Supported archetypes

| Archetype  | Export path              | Import path                | Round-trip |
|------------|--------------------------|----------------------------|------------|
| `text`     | `buildTextBundle`        | `importTextBundle`         | ✅          |
| `textlog`  | `buildTextlogBundle`     | `importTextlogBundle`      | ✅          |
| `folder`   | use `export-folder` instead (nests children in `.folder-export.zip`) | — | —          |
| `attachment`/`todo`/`form`/`generic`/`opaque` | intentionally out of scope for now | — | —          |

Rationale for the text/textlog-only scope:

- Both have a well-defined, documented bundle format already in the
  codebase (`docs/development/completed/text-markdown-zip-export.md`,
  `docs/development/textlog-bundle.md`).
- Both have complete, tested importers (see `tests/adapter/
  text-bundle.test.ts` — 51 tests; `tests/adapter/textlog-bundle.test.ts`).
- Attachment / todo / form entries have no round-trippable single-file
  format at rest; designing one here would be scope creep.

## File naming

```
<slugified-title>-<yyyymmdd>.text.zip
<slugified-title>-<yyyymmdd>.textlog.zip
```

Slug reuses `slugify()` from `zip-package.ts` (40-char clamp, CJK
safe, `untitled` fallback).

## Round-trip contract

1. Export a TEXT or TEXTLOG entry via the Data menu → get a `.zip`.
2. Hand it to a peer, or back to yourself on a different device.
3. Peer clicks `📥 Entry` and selects the file.
4. A **new entry is added** to the peer's container:
   - `title`, `body` / log rows, and `archetype` restored verbatim
   - referenced assets restored via `CREATE_ENTRY` + `COMMIT_EDIT`
     pairs (additive, N + 1 dispatch pattern)
   - `lid` is freshly minted — no collision possible with the peer's
     existing entries
   - `created_at` / `updated_at` reset to import time (the peer's
     clock is the source of truth for the new entry)
5. Asset references inside the body are rewritten to the peer's
   newly-minted asset keys. Missing-in-source references are
   preserved verbatim so the signal survives the round-trip.

## Missing-asset handling

- **Export side**: if the body references `asset:K` and the source
  container lacks either the asset binary or the attachment metadata,
  a native `confirm()` warns the user before the download. The ZIP
  still produces a valid `manifest.json` with `missing_asset_keys`
  listing the gaps. Live state is never mutated.
- **Import side**: missing-source references remain as-is in the
  imported body — the peer sees them as broken refs (same signal the
  sender saw), never as silently-dropped content.
- Both sides are identical to the behavior of the existing per-entry
  `📦 Export` action; this is deliberate so users only learn one
  mental model.

## UI gating

- Button is rendered regardless of selection (so the label is always
  discoverable), but disabled unless `selectedLid` points at a text
  or textlog entry.
- Label varies:
  - `📤 Selected`             — disabled placeholder
  - `📤 Selected (TEXT)`      — active, routes to `.text.zip`
  - `📤 Selected (TEXTLOG)`   — active, routes to `.textlog.zip`
- Action-binder also self-guards (no selection → toast; wrong
  archetype → toast) so a rogue click on a stale DOM reference stays
  inert.

## Router

The `📥 Entry` button delegates to
`src/adapter/platform/entry-package-router.ts:pickEntryPackageTarget`
which matches on filename (right-to-left, case-insensitive):

- `*.textlog.zip` → `import-textlog-input`
- `*.text.zip`    → `import-text-input`
- anything else   → `null` (caller logs a human warning)

Container-level bundles (`.pkc2.zip`, `.texts.zip`, `.mixed.zip`,
`.folder-export.zip`) are intentionally rejected — `📥 Import` /
`📥 Batch` already cover those and routing them here would silently
blow away the target container.

## Out of scope (explicitly NOT done)

- Multi-select export (batch of N arbitrary entries)
- Subtree / folder-as-single-package export
- External asset references / deduplication across packages
- Permission / signing / provenance metadata
- Merge-import into existing entries (always additive, new lid)
- Diff import / conflict resolution
- `attachment` / `todo` / `form` / `generic` / `opaque` archetypes
- Auto-organize the imported entry under a specific folder (imported
  entry lands at the container root; user re-homes manually)

## Tests

- `tests/adapter/action-binder-selected-entry-export.test.ts` — 14 tests
  covering UI gating (4), archetype routing to the correct bundle
  format (4), round-trip through the importer (2), and filename-based
  import routing (4).
- Existing coverage that this feature rides on:
  - `tests/adapter/text-bundle.test.ts` — 51 tests on the TEXT bundle
    (round-trip, compact mode, missing-asset handling, malformed
    rejection).
  - `tests/adapter/textlog-bundle.test.ts` — textlog bundle tests.
