# IndexedDB Availability and Silent-Failure Handling

**Status:** active — added during the April 2026 audit.  
**Scope:** covers what PKC2 does when IndexedDB is unavailable or fails
silently, what the user sees, and what operators should expect when
running PKC2 from different URLs.

## Summary

PKC2 persists all session state (container, assets) into the browser's
IndexedDB. A boot-time probe (`probeIDBAvailability` in
`src/adapter/platform/idb-store.ts`) attempts an open → write → read
round-trip on a disposable `pkc2-probe` database. If that round-trip
fails, PKC2 surfaces a non-blocking warning banner at the top of the
viewport (`[data-pkc-region="idb-warning"]`) and continues to run in a
session-only mode backed by the initial pkc-data snapshot.

## When IndexedDB works

| Runtime                              | IDB works?      | Notes |
|--------------------------------------|-----------------|-------|
| `http://localhost` / `http://127.0.0.1` | ✅             | Recommended for development + daily use |
| `https://…` (hosted)                  | ✅             | Standard production path |
| `file://` — Chrome / Edge (desktop)   | ✅ (usually)   | Subject to `--allow-file-access-from-files` and per-file origin isolation |
| `file://` — Firefox (desktop)         | ⚠️ depends     | Modern Firefox grants file:// IDB, but each file path is a distinct origin, so the store does not survive a file move |
| `file://` — Safari                    | ❌ disabled    | Safari blocks IDB on file:// — banner will fire |
| Private / incognito browsing          | ⚠️ depends     | Chrome allows it; Firefox wipes on session end; Safari blocks |

## When the banner fires

- `indexedDB` is undefined in the runtime (non-browser embeddings).
- `indexedDB.open()` throws synchronously (policy / security).
- `open()` emits `onerror` (e.g. `QuotaExceededError`, corrupted DB).
- `onblocked` fires (another tab is holding an incompatible version).
- The probe transaction fails mid-round-trip (disk-full, DB
  corrupted, etc.).

## What the banner says

> **IndexedDB is unavailable** — changes made in this session will NOT
> persist across reloads *(reason: …)*. Open PKC2 over
> `http://localhost` or disable private-browsing to restore
> persistence.

Dismissible (session-only); will reappear on the next reload if the
condition persists.

## What still works without IDB

- Loading the initial container from the embedded `pkc-data` element
- Editing entries (in-memory)
- Exporting to a new single-HTML file (`dist/pkc2.html`) via the
  export / download path — this is the **intended escape hatch** when
  persistence is degraded: save the file manually, keep that copy.

## What does NOT work without IDB

- Automatic save on edit (the debounced `mountPersistence` save path)
- Reload survival — any unexported changes are lost on reload
- Asset re-hydration across sessions (assets are stored per-container
  in the assets store)

## Runtime save failure (mid-session)

The boot-time banner covers *startup* unavailability. Saves can still
fail **after** a successful boot — typically when the origin hits its
IndexedDB quota mid-edit, when a transaction aborts (`AbortError`),
or when a put() is rejected for any other reason. These used to be
`console.warn`-only; they are now also surfaced as a distinct
non-blocking banner.

- **Region:** `data-pkc-region="idb-save-warning"` (separate from the
  boot-time `idb-warning` region so both can be visible at once if a
  session starts degraded and later also encounters a save failure).
- **Headline:** "Save to IndexedDB failed"
- **Detail:** " — recent edits may not have been persisted *(reason:
  ClassifiedError)*. Export or copy your container to avoid losing
  changes."
- **Wording is hedged** ("*may* not have been persisted") because the
  error-to-recoverability mapping is browser-specific — a
  `QuotaExceededError` truly dropped the write, but a transient
  `AbortError` may have been retried successfully by the debounce
  timer.
- **Coalescing:** repeated failures do NOT stack. The same banner node
  is reused and its reason text is updated to the latest classified
  kind.
- **Dismissal:** session-only, just like the boot banner. A new
  failure *after* dismissal creates a fresh banner — the user is
  explicitly opting back in to warnings.
- **No auto-retraction on success.** If the next save succeeds, the
  banner stays until dismissed. Silently retracting it would hide the
  fact that an earlier write may have already been lost.

### Error classification

`classifySaveError(err)` in `idb-warning-banner.ts` maps the error
into a short reason string shown in parentheses:

| Condition                    | Reason string                               |
|------------------------------|---------------------------------------------|
| `err.name === 'QuotaExceededError'` | `QuotaExceededError: browser storage full` |
| `err.name === 'AbortError'`  | `AbortError: transaction aborted` (or the provided message) |
| Generic `Error`              | `<name>: <message>` (truncated to 140 chars) |
| Non-Error throw              | `String(err)` (truncated to 140 chars)     |

### Wiring

`mountPersistence` accepts `onError: (err) => void`. `main.ts` §6
passes a callback that calls
`showIdbSaveFailureBanner({ reason: classifySaveError(err) })`. No
action is dispatched, no state is mutated — persistence remains a
passive listener.

### What is still NOT surfaced

- **Per-asset `saveAsset` failures** are logged but not yet banner-
  surfaced. The container-level `save` path is the dominant signal,
  and an asset-level failure will usually be followed by a container
  save failure on the next mutation, which does banner. Granular
  per-asset surfacing is out of scope for this slice.

## Operator guidance

1. **Prefer a local HTTP server.** Python's `python3 -m http.server 8080`
   or any static-file server serves `dist/pkc2.html` over
   `http://localhost` — guaranteed persistence.
2. **If you must use `file://`**: prefer Chrome / Edge, keep the HTML
   file path stable (moving it changes the origin), and use the
   Export button before closing the tab to lock in a fresh snapshot.
3. **If you see the banner**: export your container before making
   further edits — the banner does NOT stop edits from happening, it
   just warns that they won't survive a reload.

## Related code

- `src/adapter/platform/idb-store.ts` — `probeIDBAvailability()`
- `src/adapter/platform/idb-warning-banner.ts` — `showIdbWarningBanner()`,
  `showIdbSaveFailureBanner()`, `classifySaveError()`
- `src/adapter/platform/persistence.ts` — `mountPersistence` (accepts
  `onError`), `loadFromStore` (load error path still uses
  `console.warn`)
- `src/main.ts` § 6 — `onError` wired to save-failure banner
- `src/main.ts` § 6a — boot probe wired
- `src/styles/base.css` — `.pkc-idb-warning*` rules
  (plus `.pkc-idb-save-warning` offset for stacking)
- `tests/adapter/idb-availability.test.ts` — probe + boot banner tests
- `tests/adapter/idb-save-failure.test.ts` — save-failure banner +
  onError integration tests
