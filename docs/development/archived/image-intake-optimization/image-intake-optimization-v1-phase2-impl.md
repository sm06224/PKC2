# Image Intake Optimization v1 — Phase 2 Implementation Note

Status: COMPLETE 2026-04-19
Audited contract: `docs/spec/image-intake-optimization-v1-behavior-contract.md` rev.1.1
Phase 1 audit: `docs/development/image-intake-optimization-v1-paste-audit.md`

---

## 1. Scope

Phase 2 extends the optimization pipeline that Phase 1 wired into the
**paste** surface to the remaining two intake surfaces named in the
contract (D-IIO3):

- **drop** — sidebar / detail-pane drop zone (`processFileAttachmentWithDedupe`)
- **drop (editor)** — drop onto a `[data-pkc-mode="edit"]` editor in editing
  phase (`processEditingFileDrop`). Same surface class as the sidebar drop.
- **attach** — file attach button / inline standalone-paste fallback
  (`processFileAttachment`)

Out of Phase 2:

- import path (D-IIO3 says import is excluded entirely)
- settings UI for managing remembered preferences (Phase 3+ candidate)
- threshold tuning / manual sync

---

## 2. Decision flow

The same 8 steps from contract §2-1 now apply uniformly across all three
surfaces. The pipeline orchestrator was renamed to make this explicit:

| Phase 1 | Phase 2 |
|---------|---------|
| `prepareOptimizedPaste(file, base64, options)` | `prepareOptimizedIntake(file, base64, surface, options)` |

`surface: IntakeSurface` is now a required parameter. The three call sites
pass `'paste'`, `'drop'`, and `'attach'` respectively. There is **no
default** — each call site states which surface it is, so cross-surface
preference leakage cannot happen by omission (compile-time enforcement of
contract §4-1-1 C2).

---

## 3. Touchpoints

| File | Phase 2 change |
|------|----------------|
| `src/adapter/ui/image-optimize/paste-optimization.ts` | Renamed entry point to `prepareOptimizedIntake`; added `surface` param; added `buildAttachmentBodyMeta` / `buildAttachmentAssets` helpers shared by COMMIT_EDIT-based dispatchers |
| `src/adapter/ui/action-binder.ts` | Updated paste call site (surface='paste'); inserted pipeline into `processEditingFileDrop` (surface='drop'), `processFileAttachmentWithDedupe` (surface='drop'), `processFileAttachment` (surface='attach') |
| `tests/adapter/image-optimize/paste-optimization.test.ts` | Added 13 new tests covering drop/attach surfaces, surface independence (3 cases), and the new body/assets helpers |
| `dist/bundle.{js,css}`, `dist/pkc2.html` | Rebuilt |

No core-layer changes. No reducer changes (the existing PASTE_ATTACHMENT
reducer added in Phase 1 already supports `optimizationMeta` /
`originalAssetData`; the COMMIT_EDIT reducer needs no changes because the
caller now constructs `bodyMeta` and `assets` via the shared helpers).

---

## 4. Surface-class separation (contract §4-1-1 C2 / D-IIO5)

Three independent localStorage keys, surfaced from the existing
`preferenceStorageKey()` helper in `src/features/image-optimize/preference.ts`:

```
pkc2.imageOptimize.preference.paste
pkc2.imageOptimize.preference.drop
pkc2.imageOptimize.preference.attach
```

Verified by three dedicated tests (`describe('… surface independence
(D-IIO5)')`):

- paste(decline) does NOT silence drop confirm
- drop(optimize) does NOT auto-apply on attach
- attach(optimize) does NOT silence paste confirm

---

## 5. FI-04 / FI-05 interaction

### FI-04 dedupe (drop)

`processFileAttachmentWithDedupe` runs the dedupe check on the
**post-optimization** base64 (`payload.assetData`). Rationale:

- Two drops of the same source PNG produce the same optimized WebP bytes
  (Canvas + WebP encoder is deterministic for identical input). So a
  user dropping the same image twice still gets the existing
  "duplicate" toast.
- Dedupe matches what is actually stored in `container.assets`. If we
  deduped on the original, a second drop of the same source could
  spuriously match a previously-stored *non-optimized* asset that
  happens to share bytes after compression — but more importantly, an
  *optimized* asset would never match itself across a re-drop. Post-
  optimization dedupe is the natural and consistent choice.
- `I-FI04-1` (informational; never blocks attachment) is preserved
  unchanged. The dedupe toast is informational only; the attachment
  proceeds regardless.

The 11 existing FI-04 tests
(`tests/adapter/fi04-multi-add-dedupe-persistent-dnd.test.ts`) all pass.

### FI-05 editor inline drop / attach

`processEditingFileDrop` (FI-05 inline drop during editing) now goes
through the pipeline with surface='drop'. It still uses
`PASTE_ATTACHMENT` with `contextLid` and updates the textarea via
`buildAssetRef` — but the ref now uses `payload.mime` (which becomes
`image/webp` after optimization), so the inline `![…](asset:key)`
reference accurately reflects the stored bytes.

The 9 existing attach-while-editing tests all pass.

---

## 6. Provenance / dual save consistency

PASTE_ATTACHMENT (paste, editor-drop) and COMMIT_EDIT (sidebar drop,
attach button) produce **byte-identical** body shapes and asset maps
because both paths now derive them from the same payload via the shared
helpers:

- `buildAttachmentBodyMeta(name, assetKey, payload)` produces the JSON
  body. When `optimizationMeta` is present, it adds the `optimized`
  field with the same field names the PASTE_ATTACHMENT reducer uses
  (`original_mime`, `original_size`, `method`, `quality`, `resized`,
  `original_dimensions`, `optimized_dimensions`, optional
  `original_asset_key`).
- `buildAttachmentAssets(assetKey, payload)` returns
  `{ [key]: optimized }` or `{ [key]: optimized, [key+'__original']: original }`
  when keep-original was opted in.

Two dedicated tests (`describe('buildAttachmentBodyMeta')` and
`describe('buildAttachmentAssets')`) lock the wire format.

---

## 7. Invariant verification

| invariant | Phase 2 verification |
|-----------|---------------------|
| I-BC1 (existing data unchanged) | reducer paths untouched; new tests verify pass-through |
| I-BC2 (lossy only after consent) | drop/attach surfaces show confirm UI when no remembered preference |
| I-BC3 (pass-through fully unaltered) | non-image / sub-threshold tests use the same `passThrough` helper |
| I-BC4 (provenance transparency) | `buildAttachmentBodyMeta` test asserts the `optimized` field structure |
| I-BC5 (original keep is opt-in) | confirm UI's keepOriginal default OFF (unchanged from Phase 1) |
| I-BC6 (export/import unchanged) | `serializePkcData` / `importFromHtml` operate on `container.assets` generically; `__original` keys flow through |
| I-BC7 (asset:key references the optimized asset) | `buildAssetRef` in editor drop now uses `payload.mime` |
| I-BC8 (no regression) | 4506 / 4506 tests pass (was 4493) |
| I-BC9 (Canvas failure fallback) | each surface call site has a try/catch around `prepareOptimizedIntake` returning a passthrough payload |
| I-BC10 (FI-03 untouched) | no diff in markdown-render.ts / textlog-presenter.ts |
| I-BC11 (sub-threshold no-lossy) | shared `prepareOptimizedIntake` uses the same threshold check |
| I-BC12 (preference is opt-in) | remember-choice default OFF; `setPreference` only when `choice.remember === true` |

Plus the new D-IIO5 surface-independence invariant (paste/drop/attach
preferences do not cross-influence) — three dedicated tests.

---

## 8. Verification log

```
npm run typecheck   → clean
npm run lint        → clean
npm test            → 4506/4506 pass (177 files)
npm run build:bundle → dist/bundle.js 600.20 kB
npm run build:release → dist/pkc2.html 652.2 KB
```

---

## 9. Outstanding (future phases)

- N1 (Phase 1 audit note): localStorage preference is not portable across
  containers. Still applies; consider `container.meta` integration in a
  future phase.
- Settings UI for managing / clearing remembered preferences (clear-by-
  surface vs clear-all). Currently users must clear browser site data.
- Final full audit (cross-surface integration scenarios with real DnD /
  paste / attach gestures) — out of Phase 2 per task scope.
