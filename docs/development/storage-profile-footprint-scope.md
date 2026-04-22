# Storage Profile — Footprint Scope (docs-first clarification)

## 1. Purpose / Status

This doc **fixes the scope** of the current Storage Profile surface
and separates two concepts that users have been conflating:

1. What the dialog **shows today** — an *asset-only profile*.
2. What users **expected to see** — a *full container footprint*
   that includes TEXT / TEXTLOG / TODO / FOLDER bodies, relations,
   and revisions on top of assets.

Nothing in this PR changes code. It is a docs-first clarification so
later implementation PRs start from an explicit boundary instead of
a shared assumption. A user-reported "Storage Profile shows 0 B"
symptom turned out to be operator error, but the underlying mismatch
— "asset size is visible, text body size is not" — is real and
deserves its own backlog entry.

Related docs (kept authoritative for their own slices):

- `storage-profile-ui.md` — current UI / overlay / CSV export contract.
- `asset-scan.md` — orphan-asset detection (same features layer,
  different question).
- `storage-estimate.md` — preflight IDB quota / free-space estimate
  (different: OS-level quota, not our per-entry weighting).

---

## 2. Current Storage Profile (what today's numbers mean)

**Implementation**: `src/features/asset/storage-profile.ts` →
`buildStorageProfile(container): StorageProfile`.

**Subject of aggregation**: `container.assets` only.

**Unit**: bytes estimated from base64 length via
`estimateBase64Size(base64Str)`, which derives the *decoded* byte
size (`~3/4` of the base64 string length, padding-corrected). The
numbers are estimates — the module does **not** probe IndexedDB or
read file-system sizes.

**Attribution (one owner per asset)**:

1. Attachment archetype whose body JSON `asset_key` matches an asset
   key — that entry owns those bytes.
2. Fallback: the first TEXT / TEXTLOG entry whose markdown body
   references the asset key via `![..](asset:K)` /
   `[..](asset:K)`.
3. Anything else owns nothing. Assets with no owner are counted as
   `orphanBytes` / `orphanCount`.

**Rollup**:

- Non-folder entry: `subtreeBytes === selfBytes`.
- Folder entry: `selfBytes` (usually 0 for plain folders) plus the
  sum of every structural descendant's `selfBytes`, via
  `collectDescendantLids`.

**Surfaces**:

- Shell-menu "Data Maintenance" launcher → state-driven overlay
  (`state.storageProfileOpen`, PR-α / #101).
- Overlay summary: `assetCount`, `totalBytes`, `largestAsset`,
  `largestAssetOwnerTitle`, `largestEntry`.
- CSV export (`export-storage-profile-csv`) — same rows, same
  numbers.

**So the dialog's headline "Total" is the sum of decoded asset
bytes, not a container-wide footprint.** TEXT / TEXTLOG / TODO /
FOLDER bodies contribute nothing to `totalBytes`; a text-heavy
container with no assets reads as 0 B here, and that reading is
*technically correct* for what the module was built to measure.

---

## 3. Asset-only profile vs. full container footprint

Two separate questions the user might reasonably be asking when they
open the dialog:

| Question | Concept | Today |
|---|---|---|
| "Which **assets** are biggest, and who owns them?" | Asset-only profile | ✅ implemented |
| "How heavy is **my container as a whole** — text and all?" | Full container footprint | ❌ unimplemented |

The two are distinct **by definition**, not just by implementation:

- Asset-only profile targets the IDB bytes that blow up fastest
  (attachments, pasted images). It ignores bodies because the
  marginal body byte is usually cheap.
- Full container footprint has to reason about **what unit** it is
  reporting — the persisted JSON size? the in-memory container? the
  .pkc2.html export size? These diverge by orders of magnitude
  because of asset compression, IDB structured-clone overhead, and
  HTML minification.

The two numbers must not be silently summed or swapped. Any future
"Total" label that implies full-container scope needs to pick one
unit and label it.

---

## 4. Why this is not the same number

Even if we added body-byte accounting today, the resulting "total"
would not line up with any single intuitive size:

- **In-memory string length** of `entry.body` (UTF-16 code units ×
  2) is cheapest to compute, but is not what the user ever sees on
  disk.
- **Persisted IDB byte count** depends on structured-clone
  serialization plus the v2 split where `container.assets` is stored
  in a separate store (`adapter/platform/idb-store.ts:14-15`). We
  cannot derive it from the in-memory container without re-cloning.
- **Export file size** differs again because `exportContainerAsHtml`
  applies `compressAssets` (gzip+base64, per
  `adapter/platform/compression.ts`). "Full mode" export
  artificially shrinks assets relative to IDB.
- **Revisions** (historical body snapshots) are retained on disk but
  are not rendered anywhere in the profile today; including them
  changes the denominator again.
- **Relation / meta** overhead is small but non-zero and has its own
  storage shape.

So a future full-footprint feature must first pin which of these
units it is reporting — and, if it wants to report more than one,
label them separately in the UI.

---

## 5. Candidate implementation slices (future work)

Keeping slices small and additive so the asset-only profile never
regresses:

### Slice A — UI label clarification (cheapest)

- Rename the current overlay's "Total" / "Size" labels to
  explicitly say "Assets" or "Asset bytes".
- Add a one-line hint: "Text bodies and relations are not counted
  here."
- No aggregator change; no new numbers.
- Unblocks users from reading the current dialog as a
  whole-container measure.

### Slice B — Logical footprint column (additive, no unit mixing)

- Extend `buildStorageProfile` output with `bodyBytes` per row,
  computed as a UTF-8 byte count of the entry's `body` string.
- Roll up for folders just like `selfBytes`.
- Surface a second overlay column labelled "Body bytes" alongside
  "Asset bytes". Do **not** sum them into a new grand total.
- Update CSV export to include the additional columns.

### Slice C — Relations / revisions accounting (if still wanted)

- Add `relationBytes` (JSON-length estimate of relation records
  attributable to each entry — inbound + outbound) and
  `revisionBytes` (sum of snapshot bodies per entry).
- Revisions accounting has to respect the per-entry attribution
  chain and skip the "entry deleted but revision lingers" edge
  case.
- Orthogonal to Slice B's unit — same UTF-8 byte count basis.

### Slice D — "Persisted" vs "Export" size labels

- Two dedicated read-only summary numbers in the overlay header:
  1. Persisted size: approximated from IDB entry shapes (needs
     `navigator.storage.estimate()` + some structured-clone
     heuristic) — or deferred if not reliable.
  2. Export size: call through the existing compressed-export
     pipeline in dry-run and report the blob size.
- These are never summed into a single "Total"; they answer
  different questions.

### Slice E — Docs & manual update

- Once Slice A or B lands, update
  `docs/manual/05_日常操作.md` and any screenshots that describe
  the Storage Profile dialog.
- Until then, the new labelling lives entirely in code, not in the
  manual.

The recommended *first* slice is A (pure label clarification) — it
closes the user-facing mismatch without any aggregation code change
and costs almost nothing to revert.

---

## 6. Code reference points

For the next implementer:

- **Aggregator (features layer, pure)**:
  - `src/features/asset/storage-profile.ts`
    - `buildStorageProfile(container)` — entry point.
    - `estimateBase64Size(base64)` — the one place that defines the
      current "bytes" meaning. Future slices that count
      non-base64-encoded data should introduce a parallel helper
      (e.g. `estimateUtf8Size(str)`) instead of reusing this one.
    - `collectDescendantLids` reused for folder rollups.
- **Overlay / UI (adapter)**:
  - `src/adapter/ui/renderer.ts`
    - `buildStorageProfileOverlay(container)` and its summary /
      rows sub-renderers — label edits happen here for Slice A.
    - Mounted state-driven on `state.storageProfileOpen` (see
      `storage-profile-ui.md`).
  - `src/adapter/ui/action-binder.ts`
    - `case 'show-storage-profile'` / `'close-storage-profile'`
      / `'export-storage-profile-csv'` — no changes expected for
      Slice A.
- **Persistence boundary (why in-memory ≠ on-disk)**:
  - `src/adapter/platform/idb-store.ts:14-15` — comment explaining
    that `container.assets` is stored separately from the rest of
    the container on save, re-attached on load. Any "persisted
    size" calculation must respect this split.
  - `src/adapter/platform/pkc-data-source.ts` — `decompressAssets`
    re-inflation on boot.
- **Export compression (why export-size ≠ IDB-size)**:
  - `src/adapter/platform/compression.ts` — `compressAssets` /
    `decompressAssets` (gzip+base64).
  - `src/adapter/platform/exporter.ts` — "full mode"
    `compressAssets` call (line 83) + `asset_encoding` meta.
- **Related backlog**:
  - `storage-estimate.md` — OS-level quota probe; different layer.
  - `asset-scan.md` — orphan asset detection; different question,
    but shares `container.assets` as input.

---

## 7. Non-goals (explicit)

- No code changes in this PR. Aggregator output, overlay markup,
  and CSV shape all stay byte-identical.
- No commitment to a single "full footprint" number. The UI's
  future presentation may carry two or more labelled figures.
- No merge of export-size / persisted-size / in-memory-size into a
  single cell. Users asking different questions need different
  numbers.
- No regression in the asset-only profile. Future slices must be
  additive in both API and UI layout.
- No revision-cleanup UI. Revisions accounting (Slice C) is
  informational only.
- No IDB probe in Slice A or B. `navigator.storage.estimate()` is a
  Slice D concern, guarded behind availability.

---

## 8. Next-step options

Smallest follow-up PRs, in increasing cost:

1. **UI label clarification (Slice A)** — rename "Total" to
   "Asset bytes" + one-sentence "Text bodies are not counted" hint
   in the overlay. Zero aggregator change. Recommended.
2. **Body bytes column (Slice B)** — additive
   `estimateUtf8Size(body)` rollup and a second column. Keeps
   asset-only numbers exactly where they are today.

Either slice, landed small, unblocks users from mis-reading the
dialog; subsequent slices (C / D / E) can follow once this doc's
delineation has been used in the field for a while.

---

**Status: docs-only scope clarification. No implementation PRs
filed yet. Kept in `docs/development/` next to the existing
`storage-profile-ui.md` so future slices land with both references
side by side.**
