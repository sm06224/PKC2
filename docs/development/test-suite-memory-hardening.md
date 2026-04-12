# Test Suite Memory Hardening

Note on how PKC2's action-binder test suite is structured across
multiple files to stay under the 4 GB test-sandbox memory ceiling.

## Problem

`tests/adapter/action-binder.test.ts` originally contained ~410
tests across 42 `describe` blocks in a single ~7 984-line file.
Under happy-dom + vitest, each render allocates a new DOM tree
plus the supporting dispatcher/event plumbing. The tests run
sequentially in one worker process, so allocation accumulates
across the describes until the process heap brushes against the
sandbox's 4 GB ceiling.

Symptom observed before the split:

```
FATAL ERROR: NewSpace::EnsureCurrentCapacity
Allocation failed - JavaScript heap out of memory
```

Adding even one new test — or appending a single DOM node per
render — was enough to tip the suite over the ceiling. This
blocked:

- Adding open/close integration coverage for new UI surfaces
  (e.g. the Storage Profile dialog).
- Expanding the existing describes with one more assertion.

## Solution: describe-level file split

The suite was split by `describe` boundaries into six files. No
`describe` contents were changed — only their physical location.

| File                                                     | Describes | Tests | Notes                                          |
|----------------------------------------------------------|-----------|-------|------------------------------------------------|
| `action-binder.test.ts`                                  | 9         | 36    | Core: dispatch, CLEAR, clipboard, attachments, Date/Time, orphan-asset cleanup |
| `action-binder-content.test.ts`                          | 8         | 49    | Inline calc, TEXTLOG dblclick, Ref context menu, HTML/MD/rich copy, rendered viewer, CSV/ZIP export, missing-asset warning |
| `action-binder-sandbox-tasks.test.ts`                    | 4         | 35    | Interactive task list, inline-asset previews, container sandbox policy |
| `action-binder-multi-select.test.ts`                     | 8         | 85    | Ctrl/Shift click, bulk status, bulk date, kanban/calendar/cross-view multi-DnD, Escape clearing, drag-ghost UX |
| `action-binder-keyboard.test.ts`                         | 11        | 172   | Arrow Up/Down, Enter, Left/Right phases, Kanban Phase 1-3, Calendar Phase 1, listener isolation |
| `action-binder-navigation.test.ts`                       | 3         | 21    | TOC jump, navigate-entry-ref, **Storage Profile open/close** |
| `action-binder-range-highlight.test.ts` (pre-existing)   | 1         | 15    | TEXTLOG range highlight on navigate-entry-ref  |

Each file carries its own `registerPresenter` side-effect,
`mockContainer` fixture, `createDispatcher` wrapper, and
`beforeEach` root lifecycle. The pattern matches the pre-existing
`action-binder-range-highlight.test.ts` precedent — inline
duplication rather than a shared harness module — because:

1. The header is purely mechanical (~90 lines, all verbatim).
2. Each file has different import needs (`parseTodoBody` only in
   keyboard; `parseTextlogBody` only in core + content +
   sandbox-tasks; `vi` not used at all in keyboard; `afterEach`
   only in navigation). A shared harness would either re-export
   everything (defeating TS's unused-import check) or require
   callers to import from multiple sources (net complexity win
   is negligible).
3. `let root: HTMLElement` and `let cleanup: () => void` are
   module-level `let`-bindings that drive the `beforeEach`
   lifecycle. Lifting them into a shared module would force every
   test to reference `harness.root` instead of `root`, changing
   thousands of lines of well-tested call-sites.

Per-file imports are trimmed to exactly what that file uses — no
unused-import TS errors, no `void`-suppression noise.

## Invariant

Per Vitest's default isolation, each test file runs in a
**separate** worker process (`pool: 'forks'`, `isolate: true`).
Splitting the describes into six files therefore distributes the
accumulated heap across six processes instead of one. Each
process starts fresh with a clean V8 heap, so no individual file
comes close to the 4 GB sandbox ceiling.

| Metric                        | Before split | After split  |
|-------------------------------|--------------|--------------|
| Largest action-binder file    | ~7 984 lines | ~2 615 lines |
| Describes in largest file     | 42           | 11           |
| Tests in largest file         | ~410         | 172          |
| Full suite: total tests       | 3 033        | 3 036 *      |
| Full suite: OOM?              | at ceiling   | comfortable  |

\* the post-split suite gained three Storage Profile open/close
integration tests that were previously deferred because the
monolithic file had no memory headroom.

## Guardrails for future growth

- **Prefer adding new `describe`s to the smallest file in the
  matching theme group** (keyboard → `keyboard.test.ts`, etc.).
- **When a file's test count passes ~200**, consider splitting
  again along the next natural `describe` seam before the sandbox
  ceiling is hit.
- **Never stuff the DOM-mount cost onto every render.** Overlays,
  dialogs, and other heavy DOM surfaces should be mounted
  on-demand by their opener handlers (see
  `buildStorageProfileOverlay` in
  [storage-profile-ui.md](./storage-profile-ui.md)).
- **Keep the shared header verbatim across files.** If a helper
  genuinely needs to be unified (e.g. the `_trackedUnsubs`
  stale-listener tracker), extract it to a shared module *only*
  after it's been stable in duplicated form for multiple PRs.
