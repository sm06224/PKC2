# Boot Initialization Order

**Status**: active — 2026-04-19 introduction.
**Scope**: end-to-end boot sequence of `src/main.ts`, runtime wiring assumptions, operation-order invariants, guidance for safe refactoring.

This document complements the per-concern docs below; it does not replace them:

- `boot-container-source-priority.md` — why pkc-data vs IDB order matters
- `boot-container-source-policy-revision.md` — `viewOnlySource` and chooser UX
- `boot-container-source-policy-audit.md` — post-revision audit
- `idb-availability.md` — probe failure + runtime save failure banner semantics

Where those docs already own a contract, this doc only points to the line number.

---

## 1. Why operation order matters in PKC2

PKC2 is a single-HTML, local-first app. Boot weaves together:

- a Redux-style dispatcher (pure reducer → state + domain events)
- passive listeners (persistence, entry-window live refresh, message bridge)
- async side effects (IDB load / probe / storage estimate / pkc-data read)
- presenter / renderer readiness
- boot-source selection (pkc-data vs IDB vs empty) including a chooser modal
- embedded-iframe detection

A small reorder can silently break any of:

- "first render happens before data loads" — reducer may hit `phase === 'initializing'` guards wrongly
- "persistence subscribes before SYS_INIT_COMPLETE" — the `CONTAINER_LOADED` event otherwise bypasses debounce scheduling
- "bridge mounts after phase===ready" — bridge would attempt to handle messages with a null container
- "presenters register before initial render" — archetype bodies render as fallback text
- "viewOnlySource flag is set at dispatch time, not checked at save time" — see `persistence.ts` debounce note

For these reasons, reordering boot code without understanding the chain is the single most common source of regressions in PKC2.

---

## 2. Canonical boot sequence (src/main.ts)

Numbers follow the inline comments in `src/main.ts`.

| # | Step | File:line | Notes |
|---|------|-----------|-------|
| 0 | `registerPresenter('todo' / 'form' / 'attachment' / 'folder' / 'textlog', ...)` | main.ts:82-87 | Must precede initial render. `detail-presenter` registry is singleton. |
| 1 | `createDispatcher()` | main.ts:90 | Pure. No side effects. |
| 2 | `dispatcher.onState((state) => render(...))` | main.ts:102 | Installs re-render subscription. `locationNavTracker` is created outside this closure so `lastTicket` survives. |
| 2b | `wireEntryWindowLiveRefresh(dispatcher)` | main.ts:201 | Preview-ctx push on assets/entries change. |
| 2c | `wireEntryWindowViewBodyRefresh(dispatcher)` | main.ts:217 | View-body push on entry mutations. |
| 3 | `bindActions(root, dispatcher)` | main.ts:220 | Event delegation on root. Data-pkc-action attributes → UserAction. |
| 4 | `mountEventLog(document.body, dispatcher)` | main.ts:223 | Dev aid. Non-blocking. |
| 5 | Initial `render(state, root)` | main.ts:226 | Shows `phase: 'initializing'` UI. |
| 6 | `createIDBStore()` + `mountPersistence(dispatcher, {store, onError})` | main.ts:236-254 | Dispatcher subscriber. Debounces 300 ms. `onError` surfaces `showIdbSaveFailureBanner`. |
| 6a | `probeIDBAvailability().then(...)` | main.ts:261-268 | Async, non-blocking. Banner on failure. |
| 6b | `estimateStorage().then(...)` | main.ts:277-295 | Async, non-blocking. Sticky toast + Export escape. |
| 7 | `dispatcher.onState(...)` for `phase === 'exporting'` | main.ts:298 | Async export runner. |
| 7b | Workspace reset wiring | main.ts:313 | `RESET_WORKSPACE` → IDB clear + reload. |
| 8 | Import handlers (HTML / ZIP / textlog / text / batch / entry-package) | main.ts:316-340 | File input wiring. |
| 8b | ZIP export handler | main.ts:341-343 | Async export (no phase transition). |
| 9 | `createHandlerRegistry()` + lazy `mountMessageBridge` on phase === 'ready' | main.ts:350-356 | Bridge mounts once, on first `ready` tick. |
| 9b | `onEvent`: send `record:reject` on offer dismissal | main.ts:392 | Only when bridge is mounted. |
| 10 | `detectEmbedContext()` | main.ts:404 | Pure read of cross-origin iframe status. |
| 11 | `await readPkcData()` / `await loadFromStore(store)` / `chooseBootSource()` / dispatch `SYS_INIT_COMPLETE` | main.ts:427-503 | Boot-source decision tree. Embedded context bypasses chooser. |

`restoreSettingsFromContainer(dispatcher, container)` runs immediately after each `SYS_INIT_COMPLETE` dispatch so FI-Settings values are applied before the first post-boot render.

Failure branch: any `catch` inside §11 dispatches `SYS_INIT_ERROR`.

---

## 3. "Must happen before / after" invariants

### 3.1 Before-first-render (steps 0, 2 before step 5)

- Presenters **must** register before §5 initial render. Otherwise detail bodies render via the generic fallback for the single tick before `SYS_INIT_COMPLETE`. Minor cosmetic, but also breaks tests that sample the DOM at that tick.
- `dispatcher.onState` must subscribe before §5. The initial render uses the current state as a passive read; later state changes require the subscription.

### 3.2 Before-data-load (steps 6 before step 11)

- `mountPersistence` **must** precede the `SYS_INIT_COMPLETE` dispatch. Otherwise the `CONTAINER_LOADED` event fires with no listener and the first post-boot mutation (RESTORE_SETTINGS) is not persisted.
- `probeIDBAvailability` is fire-and-forget; it does **not** gate boot. Promise rejection would produce a banner, not halt.

### 3.3 Source policy (§11)

- `readPkcData()` must complete before `chooseBootSource`. Synchronous within §11, but note the `await`.
- Embedded context **bypasses** the chooser modal (see `main.ts:433-440`). Reordering this check (e.g. running the modal, then checking embed) would break cross-origin iframes.
- `viewOnlySource` / `lightSource` flags are set at dispatch time and read at save time by `persistence.ts:120-129`. Reducer must not strip them until an explicit Import.

### 3.4 Bridge mount (§9)

- `mountMessageBridge` is lazy: the `onState` subscriber watches for `phase === 'ready' && container` and mounts once. This relies on §11's `SYS_INIT_COMPLETE` producing the first `ready` state. If §11 moved earlier, bridge could mount with a null container.

### 3.5 Entry-window wiring (§2b / §2c)

- Both wire-refresh helpers subscribe to the dispatcher. They must run **before** `SYS_INIT_COMPLETE` so the first container mutation already has live-refresh consumers. (Moving them after §11 causes the initial entry-window state to miss asset resolution.)

---

## 4. Operation-order risk catalog

| Risk | Symptom | Mitigation |
|------|---------|------------|
| Persistence subscribes after §11 | First post-boot edit is not saved | Keep §6 above §11 |
| Bridge mounts before container | `mountMessageBridge` gets a null container | Use phase-gated lazy mount at §9 |
| Presenter registration after render | Attachment / todo / form bodies render as generic text until next tick | Keep §0 above §5 |
| Chooser modal on embedded iframe | Cross-origin embed hangs on modal UX | `if (embedCtx.embedded) finalizeChooserChoice(...'pkc-data')` (main.ts:433-440) |
| Reading `dispatcher.getState()` inside a schedule closure | Stale snapshot saved | `persistence.ts` reads state at flush, not at schedule. Do not closure-capture. |
| `probeIDBAvailability` awaited before §11 | Boot stalls when IDB hangs | Keep probe `.then()` non-blocking |
| Reducer strips `viewOnlySource` prematurely | Embedded pkc-data silently contaminates IDB | Clear flag only on explicit Import events |
| Running settings-restore before §11's dispatch | Settings applied to an absent container | `restoreSettingsFromContainer` is called after each `SYS_INIT_COMPLETE` dispatch, inside each switch arm |

---

## 5. Relation to dead path cleanup

Before removing any symbol that appears "unused", check whether it is:

1. **Active subscriber / listener** — registered once at boot, triggered by state/events. Symbol appears in `main.ts` imports but may not be called textually elsewhere. *Example*: `mountPersistence`, `wireEntryWindowLiveRefresh`.
2. **Lazy mount** — mounted conditionally inside an `onState` callback. *Example*: `mountMessageBridge`.
3. **Boot-source helper** — pure function that never runs in "normal" flow but is required for an edge case. *Example*: `finalizeChooserChoice` (only when both pkc-data and IDB exist and user is not in embedded context).
4. **Debug / audit helper** — explicitly documented as non-production. *Example*: `isUlid` (log-id.ts:89-94 docstring).
5. **Spec-declared API** — exported for a public contract, even if no current caller. *Example*: `getMarkdownInstance` (`ux-regression-recovery.md:128`).
6. **Genuinely dead** — zero call sites + no spec + no audit intent + architectural mismatch. *Example*: `isPreviewableMedia` (PR #36), `updateLogEntry` (PR #41).

Only category 6 qualifies for deletion. Categories 1-3 are **order-sensitive**: they appear once in `main.ts` and would break boot or live refresh if removed. Categories 4-5 are **contract-sensitive**: removal requires spec revision.

Before deleting, always run:

```
Grep "\\b<symbol>\\b" (src / tests / docs)
git log --all -S "<symbol>(" -- src/
```

Zero hits outside the defining file + zero spec mention + zero docstring intent = candidate. Anything else → hold.

---

## 6. Guidance for future contributors / AI agents

### 6.1 Refactoring boot code

1. Read `src/main.ts:75-504` in full before editing. The inline numbered comments are the contract; the step numbers are referenced by audits and by this doc.
2. Preserve the 11-step numbering. Insert new steps with sub-letters (e.g. `6c`) rather than renumbering.
3. Do not move `mountPersistence` out of §6. The ordering relative to §11 is the single critical invariant.
4. Keep `probe` and `estimate` calls fire-and-forget (`.then(...)`). Do not `await` them.
5. Do not dispatch from inside a `dispatcher.onState` callback unless the target action is guarded (see FI-01 patterns).

### 6.2 Adding a new boot-time listener

- Subscribe to `dispatcher.onState` / `onEvent` after presenter registration (§0) but **before** §11's `SYS_INIT_COMPLETE` dispatch. Between §6 and §11 is the safe window.
- If the listener needs a live container, either gate on `state.container` presence or lazy-mount via phase check (pattern: §9 bridge).
- Store the returned unsubscribe function if the listener has a lifetime shorter than the page. Page-lifetime subscribers in `main.ts` may discard it.

### 6.3 Adding a new source-selection branch

- Extend `chooseBootSource` in `pkc-data-source.ts` (pure). Do not extend the decision tree in `main.ts` — the pure helper is tested in isolation.
- Each new branch must decide: `readonly`, `lightSource`, `viewOnlySource`, `systemEntriesFromPkcData`. Read `persistence.ts:120-129` to confirm flag semantics.

### 6.4 Deleting a boot-time import

- Stop. Grep the symbol name. Trace every `main.ts` usage to the step it belongs to. If the import participates in steps 0, 2, 2b, 2c, 3, 6, 9 (subscribers / lazy mounts), removal breaks boot silently.
- Cross-check with `chooseBootSource` branches and `persistence.ts` flag semantics.
- Run `npm test` AND boot the app in a browser. Unit tests do not cover the `main.ts` boot sequence (it is driven by `document.getElementById(SLOT.ROOT)` at module eval time).

---

## 7. Related references

- `src/main.ts:75-504` — the canonical 11-step `boot()`
- `src/adapter/platform/persistence.ts:21-56, 99-129` — debounce safety note + save triggers + viewOnlySource / lightSource gate
- `src/adapter/platform/pkc-data-source.ts` — `readPkcData` / `chooseBootSource` / `finalizeChooserChoice`
- `src/adapter/platform/idb-store.ts` — `createIDBStore`, `probeIDBAvailability`
- `src/adapter/transport/message-bridge.ts` — `mountMessageBridge` (lazy-mounted at §9)
- `docs/development/boot-container-source-priority.md` — S-24 order flip
- `docs/development/boot-container-source-policy-revision.md` — viewOnlySource + chooser policy
- `docs/development/boot-container-source-policy-audit.md` — post-revision audit
- `docs/development/idb-availability.md` — probe + runtime save failure banners
- `docs/development/dead-path-cleanup-inventory-04-platform-markdown-textlog-container.md` — inventory including the 10-step summary that motivated this doc
- `docs/development/dead-path-decision-isUlid-updateLogEntry.md` — worked example of the dead-path-vs-order-sensitive distinction (category 4 retain vs category 6 delete)
