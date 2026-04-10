# TEXTLOG CSV + Assets ZIP Export

This note pins the interchange format for exporting a single TEXTLOG
entry as a portable bundle that can be opened outside PKC2 without the
`pkc2.html` runtime. **Format is frozen first, UI ships second** — the
implementing code in `src/features/textlog/textlog-csv.ts` and
`src/adapter/platform/textlog-bundle.ts` are the source of truth for the
mechanical details, but the shape described here is the binding contract.

## 0. Why a new format

We already have `pkc2-package.zip` via `zip-package.ts`. That format is
optimised for **lossless round-trip of a whole Container**. It keeps
relations, revisions, meta, and every asset regardless of who references
it. That's the right answer when someone wants to back up or move a
container.

What it is *not* good at:

- sharing a single log with a non-PKC2 user
- opening in Excel / Numbers / Google Sheets / LibreOffice
- quickly skimming without loading a PKC2 runtime
- trimming down to "just this log and its attachments"

So this is a **different use case, different bundle**, living alongside
the existing pkc2-package. No existing format, API, or file changes; the
new code is purely additive.

## 1. Bundle layout

```
textlog-<slug>-<yyyymmdd>.textlog.zip
├── manifest.json
├── textlog.csv
└── assets/
    ├── <asset-key>.<ext>
    └── …
```

- **`manifest.json`** — metadata-only, no body text. Lets a consumer
  validate shape, count assets, and locate missing references without
  parsing the CSV.
- **`textlog.csv`** — the log rows, one per log entry, in append order.
- **`assets/`** — one file per referenced asset, named
  `<asset-key><ext>` (collision-free by construction, since asset keys
  are unique inside a container).

Only these three top-level names are produced. Consumers MAY encounter
future additions under `assets/` or new top-level files in a future
version; they MUST NOT assume the list is closed.

### ZIP mechanics

- **Stored mode only** (ZIP method 0, no compression). Reuses the
  existing `zip-package.ts` writer — no new ZIP parser, no new CRC-32.
  Helpers previously private to `zip-package.ts` are now exported:
  `createZipBlob`, `textToBytes`, `base64ToBytes`, `triggerZipDownload`.
  Nothing else in `zip-package.ts` changes.
- **Filename**: `textlog-<slug>-<yyyymmdd>.textlog.zip`, where `<slug>`
  is a sanitized version of the entry title (same `slugify` rule the
  pkc2-package uses). Callers can override via `options.filename`.

## 2. `manifest.json`

```json
{
  "format": "pkc2-textlog-bundle",
  "version": 1,
  "exported_at": "2026-04-10T12:00:00.000Z",
  "source_cid": "cnt-abc-001",
  "source_lid": "e7q",
  "source_title": "Daily Log",
  "entry_count": 42,
  "asset_count": 3,
  "missing_asset_count": 1,
  "missing_asset_keys": ["ast-deleted-3c"],
  "assets": {
    "ast-abc-001": { "name": "screen.png", "mime": "image/png" },
    "ast-abc-002": { "name": "budget.xlsx", "mime": "application/vnd.ms-excel" },
    "ast-abc-003": { "name": "recording.mp3", "mime": "audio/mpeg" }
  }
}
```

### Field contract

| Field | Type | Meaning |
|---|---|---|
| `format` | `"pkc2-textlog-bundle"` | Discriminator. Future textlog-format variants get a new token. |
| `version` | `1` | Integer schema version. Bumped on breaking changes. |
| `exported_at` | ISO 8601 string | When the bundle was written. |
| `source_cid` | string | Source container id at export time. |
| `source_lid` | string | Source entry lid (the textlog entry). |
| `source_title` | string | Entry title at export time, verbatim. |
| `entry_count` | integer | Number of log rows in `textlog.csv` (excluding header). |
| `asset_count` | integer | Number of files under `assets/`. |
| `missing_asset_count` | integer | How many referenced keys had no data. |
| `missing_asset_keys` | string[] | Deduplicated list of referenced-but-missing keys. |
| `assets` | object | `asset_key` → `{ name, mime }` for every file under `assets/`. Lets a consumer recover the original filename without re-reading the textlog. |
| `compacted` | boolean | `true` if the export was produced in *compact mode*: broken asset references in `text_markdown` / `asset_keys` were stripped from the output. `false` for plain exports. See §13. Additive field; consumers from §1 MUST ignore it if unknown. |

Unknown fields MUST be ignored by consumers. New fields added in
`version: 1` are additive and do not bump the version.

## 3. `textlog.csv` — column contract

| # | column | example | notes |
|---|---|---|---|
| 1 | `log_id` | `log-1744185600000-1` | Stable id from the textlog body. |
| 2 | `timestamp_iso` | `2026-04-09T10:00:00.000Z` | Original ISO 8601. |
| 3 | `timestamp_display` | `2026/04/09 Thu 10:00` | Same format as the on-screen row label (`formatLogTimestamp`). |
| 4 | `important` | `true` / `false` | Lowercase boolean. |
| 5 | `text_markdown` | `Meeting with **Alice**` | Original body verbatim. |
| 6 | `text_plain` | `Meeting with Alice` | Derived: strips the common markdown metacharacters, flattens whitespace, replaces `![alt](asset:k)` with `alt`, replaces `[label](asset:k)` with `label`. Human-readable fallback, not a full markdown-to-text renderer. |
| 7 | `asset_keys` | `ast-abc-001;ast-abc-002` | `;` separated, deduplicated, in first-occurrence order. Empty string if the row has no asset refs. |

### Encoding & quoting

- **UTF-8**, no BOM.
- **CRLF** line terminators (`\r\n`) between records — strict RFC 4180.
  Consumers that insist on LF can trivially post-process, and all
  modern spreadsheet tools accept CRLF.
- **Every field is quoted** with `"..."`.
- Internal `"` is doubled to `""`.
- Embedded newlines (`\n` / `\r\n`) inside the `text_markdown` / `text_plain`
  fields are preserved verbatim inside the quotes. This is RFC-4180-
  legal and preserves multi-line markdown bodies.
- Column order is fixed. The header row is always present.

### Ordering

Log rows are emitted in **append order** — exactly the order stored in
`body.entries`. The serializer never re-sorts by `timestamp_iso`, so a
backdated row that was appended last stays at the bottom. This matches
the textlog-foundation invariant that append order wins.

## 4. Asset file naming rule

Every file under `assets/` is named `<asset_key><extension>`.

- **Asset key** comes straight from the attachment entry's `asset_key`
  (the `ast-{ts}-{rand}` form). These are safe filename characters
  (`[A-Za-z0-9_-]`) and unique within a container, so collisions inside
  the bundle are impossible by construction.
- **Extension** is chosen in this priority order:
  1. The extension from the attachment's original `name` if it has one
     (e.g. `budget.xlsx` → `.xlsx`). Preserves the original suffix for
     tools that key off it.
  2. A MIME-derived extension from a fixed allowlist (`image/png` →
     `.png`, `application/pdf` → `.pdf`, etc.).
  3. `.bin` as a final fallback so we never produce an extension-less
     name that some OSes treat as "unknown type".
- The original filename is not part of the on-disk name. Consumers that
  need the original filename must read `manifest.json > assets[key].name`.

Why not "original filename" on disk? Because two textlog rows can
reference two different attachments both named `screenshot.png`. The
asset-key-based scheme keeps the layout flat and collision-free without
a de-duplication pass.

## 5. Multiple assets per row

A single log row may reference multiple assets — e.g.
`![chart](asset:ast-001) and [budget](asset:ast-002)`. In that case:

- `asset_keys` contains `ast-001;ast-002` (in first-occurrence order,
  deduplicated — the same key twice in one row appears only once in
  the column).
- Both `assets/ast-001.<ext>` and `assets/ast-002.<ext>` are written
  (assuming neither is missing).

If two different rows reference the same asset, the asset is still
written to `assets/` exactly once.

## 6. Missing asset reference policy

When a log row references `asset:ast-X` but `ast-X` is not present in
`container.assets`:

- The key **is** listed in the row's `asset_keys` column. The CSV
  faithfully records what the user wrote — this preserves data and lets
  a consumer detect broken references.
- The key is **not** written to `assets/`.
- The key is added to `manifest.json > missing_asset_keys` (deduped
  across all rows) and counted in `missing_asset_count`.

Rationale: silently dropping the key from the CSV would lose user
intent. Writing a zero-byte `assets/<key>` would confuse consumers into
thinking the asset existed. A manifest-level report is the honest middle
ground.

Unreferenced orphan assets in the container are **never** included in
the bundle, since the bundle is explicitly "this log plus its attachments".
Orphan cleanup lives in a separate feature.

## 7. What is in scope / out of scope

### In scope
- TEXTLOG entries only. Other archetypes have no `Export CSV+ZIP` button.
- Read-only export (the button is visible even in `readonly` mode —
  exporting doesn't mutate state).
- Append-order serialization.
- Only referenced assets — never the whole container's asset pool.
- A plain CSV that opens cleanly in Excel / Numbers / Google Sheets /
  LibreOffice.

### Out of scope (intentionally)
- **Bundle-based re-import.** This is one-way export today. The
  `format` / `version` fields leave the door open, but no importer is
  written.
- **Form / todo / generic / text CSV.** Different shapes, different
  spec — a separate issue.
- **Excel-flavoured writer** (`.xlsx`). Raw CSV is the portable common
  denominator; spreadsheet consumers can save-as from there.
- **Deflate-compressed ZIP.** Stored mode keeps the writer tiny and
  matches `zip-package.ts`.
- **Asset deduplication across textlog entries from different
  containers.** Each bundle is standalone.
- **Orphan asset sweep.** Out of scope — the bundle only ships assets
  referenced by the subject textlog, but does not mutate anything.
- **Relation / revision export.** The bundle is a log snapshot, not a
  container snapshot.

## 8. Layering

```
features/textlog/textlog-csv.ts         ← pure
  - serializeTextlogAsCsv(body)
  - collectTextlogAssetKeys(body)
  - stripMarkdownForCsvPlain(text)

adapter/platform/textlog-bundle.ts      ← browser APIs (Blob, <a>, download)
  - buildTextlogBundle(entry, container)  → { blob, manifest, stats }
  - exportTextlogAsBundle(entry, container, options?) → Promise<ExportResult>
  - buildBundleFilename(entry)

adapter/platform/zip-package.ts         ← existing, gains named re-exports
  - createZipBlob, textToBytes, base64ToBytes, triggerZipDownload

adapter/ui/action-binder.ts             ← new case 'export-textlog-csv-zip'
adapter/ui/renderer.ts                  ← new 📦 button, textlog only
```

The `features/` layer carries no browser APIs — it only works on the
already-parsed `TextlogBody`. All Blob / download logic lives in
`adapter/platform/`. The `adapter/ui/` layer is the thinnest possible
wrapper: look up the entry, call `exportTextlogAsBundle`, done.

## 9. UI surface

A single new button in the TEXT/TEXTLOG action bar, **only shown when
`entry.archetype === 'textlog'`**:

| Button | Action | Shown in |
|---|---|---|
| 📦 Export CSV+ZIP | `export-textlog-csv-zip` | readonly + editable, textlog only |

Placed after `📖 Open Viewer` so the three copy / view / export verbs
read left-to-right as "copy source → copy rich → open rendered → bundle
on disk". A TEXT entry (non-textlog) deliberately does not get this
button — the output format and semantics are different enough that
merging them would dilute both.

## 10. Non-textlog archetype guard

The action handler verifies `ent.archetype === 'textlog'` before
building the bundle and bails out otherwise. The button itself is not
rendered for non-textlog archetypes, so this guard is belt-and-braces
against future wiring mistakes.

## 11. Backward compatibility

- No existing source file is renamed, deleted, or had public API
  changed.
- `zip-package.ts` gains **named re-exports** of a few previously
  private helpers. Old imports keep working; new consumers can reuse
  the writer.
- No existing test behaviour changes.
- The new ZIP uses a distinct `format` token in its manifest, so a
  consumer looking for `pkc2-package` will correctly ignore it.

## 12. Missing-asset export warning (Issue G)

Before the download is triggered, `buildTextlogBundle` is called first
and its `manifest.missing_asset_keys` is inspected. Two paths:

- **No missing keys** → silent fast path. The bundle downloads
  immediately, exactly as it did before Issue G. No confirm, no
  modal, no friction.
- **At least one missing key** → a `window.confirm()` dialog is shown
  with the missing count and a clear description of what is and isn't
  in the bundle. The user can **continue** (the download proceeds
  with the same blob, unchanged) or **cancel** (no download, no state
  change, no `URL.createObjectURL`).

### Why a browser-native confirm, not a custom modal

Consistent with `delete-entry` and `purge-trash` in
`src/adapter/ui/action-binder.ts`, which already use `confirm()` for
destructive / irreversible intent. A custom modal would need its own
focus management, keyboard dismissal, and accessibility story — none
of which adds value for a warning that appears only when the user is
already aware they're exporting.

### Message template (literal)

```
このテキストログには、参照先が見つからないアセットが N 件あります。
このまま ZIP を出力しますか？

- CSV の asset_keys カラムには欠損キーが残ります
- assets/ フォルダには欠損キーは含まれません
- manifest.json の missing_asset_keys に記録されます
```

The message is intentionally long enough to describe the consequence
in one glance. "N" is interpolated with `manifest.missing_asset_count`.

### Guarantees

- The warning is computed from `manifest.missing_asset_keys` — the
  same data that ends up in the ZIP. There is no second source of
  truth, so the count shown to the user is always exact.
- Cancelling the confirm guarantees **zero** side effects: no Blob
  URL is created, no anchor is clicked, no state mutation, no
  downstream `URL.revokeObjectURL`.
- The ZIP blob that is downloaded after a confirm is *byte-identical*
  to the one that would have been built without the warning. The
  warning is purely a UI gate; it never alters the output.

## 13. Compact mode (Issue G)

Compact mode is an **opt-in, output-only** rewrite. It never touches
live container state and never modifies any entry. When the user
exports in compact mode, the resulting CSV is "cleaned" by removing
references to assets that would have been flagged as missing anyway.

### Surface

A checkbox in the action bar, next to the `📦 Export CSV+ZIP`
button, **visible only for textlog entries** (same visibility rule
as the button itself):

| Control | DOM hook | Default | Behaviour |
|---|---|---|---|
| Compact export checkbox | `data-pkc-control="textlog-export-compact"` | unchecked | When checked at click time, the bundle is built with `compact: true`. |

The compact checkbox is scoped per-entry by `data-pkc-lid`. It is
visible in readonly mode for the same reason the button is: compact
mode is an output transform, never a state mutation.

### Semantics

With `compact: true`, the bundle builder walks each log row and
produces a **new** `TextlogBody` (the old one is never mutated) in
which:

1. `![alt](asset:<missing-key>)` is replaced with the literal `alt`
   text (same flattening rule as `stripMarkdownForCsvPlain`).
2. `[label](asset:<missing-key>)` is replaced with the literal `label`
   text.
3. References whose key IS present in `container.assets` are left
   untouched — compact mode only removes *broken* references, not
   valid ones.

The compacted body is then handed to the same `serializeTextlogAsCsv`
function as always. Because the missing references are gone from the
source text, they also disappear from the `asset_keys` column on
those rows — no special-case code in the serializer is needed.

### Manifest reporting under compact

Even in compact mode, `manifest.missing_asset_keys` continues to
report which keys **were** referenced but missing at export time. The
difference is that the `text_markdown` column no longer contains any
reference to them. This preserves an audit trail: "these broken
references existed and were stripped" is still discoverable from
`manifest.json`.

`manifest.compacted` is:
- `true` when the user checked the box and the export was rewritten;
- `false` for plain exports (the default).

### Live state invariance

This is the most important invariant of compact mode:

> **Compact mode never mutates the live container, the live entry,
> `container.assets`, or any other in-memory state.**

The implementation enforces this by:
- Making the compaction a **pure function** in
  `features/textlog/textlog-csv.ts` that returns a new `TextlogBody`.
- Never calling `dispatcher.dispatch` from the compact path.
- Never writing to `entry.body` or any object in `state.container`.

Tests assert this by comparing a structural snapshot of the container
before and after a compact export.

### Why not just ship compact as the default

Because "compact" is a **lossy** operation from the perspective of
CSV consumers who WANT to know a reference existed. The plain export
is the honest, truth-preserving default. Compact is a convenience
for users who have already accepted the warning and just want a
clean spreadsheet.

## 14. Future scope (not this issue)

- **Importing a textlog bundle** back into a PKC2 container, with asset
  keys remapped to avoid collision. Would need a matching reader in
  `adapter/platform/textlog-bundle.ts`. This is the **next candidate
  issue** after Issue G (missing-asset warning + compact mode): with
  the warning + compact surfaces in place, the round-trip shape of the
  bundle is now tight enough to reason about.
- **TEXT entry bundle** with a similar spec (`.md` + `assets/` +
  `manifest.json`). Same shape, different CSV-vs-markdown split.
- **Batch export** — one bundle per selected textlog, or a master ZIP
  containing several bundle subdirectories.
- **Richer column set**: `asset_count` per row, `word_count`, etc.
  Deferred until a concrete consumer asks for it.
- **Excel-native** `.xlsx` output via a tiny sheet writer, if CSV
  turns out to be too lossy for specific workflows.
