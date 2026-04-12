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

## Failure modes NOT yet surfaced

- `save()` failure during a live session (quota exhausted mid-write)
  is currently logged to `console.warn` only. A future slice may
  dispatch `SYS_ERROR` for this so the UI reflects the state, but
  doing so requires threading an `onError` callback through
  `mountPersistence` into the UI layer.
- The banner covers **boot-time** detection only.

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
- `src/adapter/platform/idb-warning-banner.ts` — `showIdbWarningBanner()`
- `src/adapter/platform/persistence.ts` — `mountPersistence`,
  `loadFromStore` (save / load error paths still use `console.warn`)
- `src/main.ts` § 6a — probe wired at boot
- `src/styles/base.css` — `.pkc-idb-warning*` rules
- `tests/adapter/idb-availability.test.ts` — probe + banner unit tests
