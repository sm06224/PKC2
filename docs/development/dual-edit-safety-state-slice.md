# FI-01 Dual-Edit Safety v1 — State / Save Slice

Status: COMPLETED 2026-04-17
Contract: `docs/spec/dual-edit-safety-v1-behavior-contract.md`
Predecessor: `docs/development/dual-edit-safety-pure-slice.md`
Scope: reducer wiring + AppState extensions + action / event additions. No UI, no clipboard.

---

## Delivered

### New AppState fields (both optional, default `null`)

- `editingBase?: EditBaseSnapshot | null` — captured at `BEGIN_EDIT`, consumed by `COMMIT_EDIT`'s version guard.
- `dualEditConflict?: DualEditConflictState | null` — populated when a save is rejected by the guard; the UI slice will surface the overlay from it.

### New exported type

- `DualEditConflictState` (`src/adapter/state/app-state.ts`) — carries `lid` / `base` / `draft` / `kind` / optional `currentUpdatedAt` / `currentContentHash` / `currentArchetype` / `copyRequestTicket`.

### Action extensions (`src/core/action/user-action.ts`)

- `COMMIT_EDIT` gains optional `base?: EditBaseSnapshot` — explicit override for `state.editingBase` (used by call sites that want to force a guard run).
- `RESOLVE_DUAL_EDIT_CONFLICT { lid, resolution: 'save-as-branch' | 'discard-my-edits' | 'copy-to-clipboard' }` — new action.

### Event additions (`src/core/action/domain-event.ts`)

- `DUAL_EDIT_SAVE_REJECTED { lid, kind, baseUpdatedAt, currentUpdatedAt? }`
- `ENTRY_BRANCHED_FROM_DUAL_EDIT { sourceLid, newLid, resolvedAt }`
- `DUAL_EDIT_DISCARDED { lid }`

### Reducer changes

| Case | Change |
|------|--------|
| `BEGIN_EDIT` (ready) | `editingBase = captureEditBase(container, lid)`, `dualEditConflict = null` |
| `COMMIT_EDIT` (editing) | If a base is available (action.base ?? state.editingBase), run `checkSaveConflict`. Safe → existing save path (also clears editingBase / dualEditConflict). Not-safe → stay in editing, populate `dualEditConflict`, emit `DUAL_EDIT_SAVE_REJECTED` |
| `CANCEL_EDIT` (editing) | Housekeeping: clear editingBase / dualEditConflict |
| `RESOLVE_DUAL_EDIT_CONFLICT` (editing) | Gate: `dualEditConflict != null`, `dualEditConflict.lid === action.lid`. Branches on `resolution` per §5 |

For `save-as-branch` the reducer calls `branchFromDualEditConflict(container, base, draft, generateLid(), generateLid(), now())`, merges any draft assets, transitions to `ready`, selects the new branch lid, and emits `ENTRY_BRANCHED_FROM_DUAL_EDIT`.

For `copy-to-clipboard` the reducer bumps `dualEditConflict.copyRequestTicket` monotonically; everything else stays (overlay remains open). No domain event is emitted.

---

## Backward-compatibility stance

- `editingBase` / `dualEditConflict` are optional. Existing fixtures that fabricate `AppState` literals remain valid.
- When `COMMIT_EDIT` fires without a base (neither `action.base` nor `state.editingBase`), the guard is skipped — legacy permissive path. Pre-FI-01 tests pass unchanged.
- `RESTORE_ENTRY` / `BRANCH_RESTORE_REVISION` / `QUICK_UPDATE_ENTRY` flows are untouched (contract §1.3 non-target list).

---

## Quality gates

- `npx vitest run tests/core/dual-edit-safety-state.test.ts` — 17/17 pass
- `npm run typecheck` — clean
- `npm test` — 4141/4141 pass (baseline 4124 + 17)
- No UI / renderer / action-binder / manual changes

---

## Intentionally not done (deferred)

- Reject overlay DOM + `action-binder` dispatch — **UI slice**.
- Clipboard `navigator.clipboard.writeText(draft.body)` side effect — UI slice observes `dualEditConflict.copyRequestTicket` advance.
- Advisory banner detection (BroadcastChannel / storage event) — optional per contract; not implemented.
- manual sync — final step.
- audit — after UI slice.
