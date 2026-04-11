# Stale Listener Prevention: Test Infrastructure Fix

Status: COMPLETED
Completed: 2026-04-11
Created: 2026-04-11

---

## A. Problem

### Symptom

Keyboard navigation Phase 1 tests intermittently saw stale entries
(e.g. `tl1` instead of `n2`) rendered into the current test's `root`.
The container lid validation added in the Arrow handler masked the
symptom, but the root cause remained.

### Root Cause

In `action-binder.test.ts` and `mutation-shell.test.ts`, each test
creates a new `Dispatcher` and subscribes a render listener:

```typescript
dispatcher.onState((state) => render(state, root));
```

Two issues compound:

1. **Module-level `root` captured by reference** — the lambda closes
   over the shared `let root` variable, not a local copy. When
   `beforeEach` reassigns `root` for the next test, the stale
   listener's closure sees the *new* root.

2. **Unsubscribe function discarded** — `dispatcher.onState()` returns
   an unsubscribe `() => void`, but every call site discards it.
   The `beforeEach` teardown calls `bindActions`'s cleanup (removes DOM
   event listeners) and `root.remove()`, but never unsubscribes the
   dispatcher's state/event listeners.

If a stale dispatcher fires (e.g. via a document-level keydown handler
that survived cleanup in happy-dom), its onState listener renders stale
state into the *current* test's root — DOM contamination.

### Production Impact

None. Production (`main.ts`) has a single mount lifecycle: the
dispatcher and its subscriptions live for the page lifetime. No
unsubscribe is needed and the pattern is correct by design.

---

## B. Fix

### Approach: Auto-tracking Dispatcher Wrapper

Shadow the `createDispatcher` import with a test-local wrapper that
intercepts `onState`/`onEvent` calls and auto-pushes the returned
unsubscribe functions into a module-level tracking array.

```typescript
import { createDispatcher as _createRawDispatcher } from '@adapter/state/dispatcher';

const _trackedUnsubs: (() => void)[] = [];

function createDispatcher() {
  const d = _createRawDispatcher();
  return {
    ...d,
    onState(listener: Parameters<typeof d.onState>[0]) {
      const unsub = d.onState(listener);
      _trackedUnsubs.push(unsub);
      return unsub;
    },
    onEvent(listener: Parameters<typeof d.onEvent>[0]) {
      const unsub = d.onEvent(listener);
      _trackedUnsubs.push(unsub);
      return unsub;
    },
  };
}
```

The `beforeEach` teardown drains the array:

```typescript
return () => {
  cleanup?.();
  for (const fn of _trackedUnsubs) fn();
  _trackedUnsubs.length = 0;
  root.remove();
};
```

### Why This Approach

| | Option A: Auto-tracking wrapper | Option B: Manual unsubscribe | Option C: Capture root by value |
|---|---|---|---|
| Diff size | ~25 lines | ~140 lines (69 sites) | ~108 lines (54 sites) |
| Call sites changed | 0 | 69 | 54 |
| Root cause fixed | Yes | Yes | No (leak remains) |
| Risk | None | Merge conflicts | Partial fix |

Option A was chosen: zero call-site changes, complete coverage,
minimal diff, no risk.

---

## C. Affected Files

| File | Change |
|------|--------|
| `tests/adapter/action-binder.test.ts` | Import rename + wrapper + teardown update + 2 isolation tests |
| `tests/adapter/mutation-shell.test.ts` | Import rename + wrapper + teardown update |

Production code: **no changes**.

---

## D. Tests Added

| Test | Verifies |
|------|----------|
| `stale dispatcher does not render into subsequent test root` | After unsubscribe, dispatcherA's CREATE_ENTRY does not contaminate root |
| `_trackedUnsubs accumulates and drains correctly` | Wrapper auto-tracks subscriptions; drain removes listeners |

---

## E. Inventory: Subscription Lifecycle

### Production (`src/`)

| File | Subscriptions | Captured | Cleanup | Notes |
|------|--------------|----------|---------|-------|
| `main.ts` | 3 onState, 1 onEvent | Not captured | None needed | Page-lifetime subscriptions |
| `entry-window-live-refresh.ts` | 1 onState | Captured | Returns unsub | Used by tests |
| `entry-window-view-body-refresh.ts` | 1 onState | Captured | Returns unsub | Used by tests |
| `persistence.ts` | 1 onEvent | Captured as `unsubEvent` | Called in `dispose()` | Proper lifecycle |
| `event-log.ts` | 1 onEvent | Captured as `unsub` | Wrapped in cleanup | Proper lifecycle |

### Tests (`tests/`)

| File | onState | onEvent | Previously captured | Now tracked |
|------|---------|---------|---------------------|-------------|
| `action-binder.test.ts` | 54 | 15 | 0 | All (via wrapper) |
| `mutation-shell.test.ts` | 1 | 1 | 0 | All (via wrapper) |
| `importer.test.ts` | 0 | 1 | 0 | N/A (no root/render) |
| `dispatcher.test.ts` | 3 | 2 | 1 (unsub test) | N/A (no root/render) |

---

## F. Defensive Layers

Two independent defenses now exist:

1. **Listener unsubscribe** (this fix) — prevents stale listeners from
   firing at all.
2. **Container lid validation** (keyboard-navigation-phase1) — filters
   sidebar DOM entries against `state.container.entries` lids, rejecting
   any that don't belong to the current container.

Both are retained. Layer 1 is the root-cause fix; layer 2 is
defense-in-depth.

---

## G. Subscription Lifecycle Contract

`dispatcher.onState()` と `onEvent()` は unsubscribe 関数を返す。
以下のルールに従うこと。

| ケース | unsubscribe の扱い | 例 |
|--------|-------------------|-----|
| **ページ寿命と一致する購読** | 破棄してよい（例外的許容） | `main.ts` の renderer / export handler / bridge |
| **コンポーネント寿命の購読** | **必ず capture し、teardown で呼ぶ** | `persistence.ts` の `dispose()`、`entry-window-*` の返却値 |
| **テスト内の購読** | **必ず解除する**（auto-tracking wrapper で自動化済み） | `action-binder.test.ts` |

### 将来の拡張に対する指針

- runtime に mount/unmount サイクルが導入された場合、
  そのモジュールは `onState`/`onEvent` の返り値を capture し、
  unmount 時に呼ぶ責任を負う。
- `bindActions` は現在 dispatcher 購読を管理しない。
  将来 `bindActions` 内部で `onState` を使う場合は、
  cleanup 関数に unsubscribe を含めること。
- この契約は `Dispatcher` interface の JSDoc と
  `CLAUDE.md` Key Conventions に記載済み。
