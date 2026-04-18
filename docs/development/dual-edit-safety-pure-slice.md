# FI-01 Dual-Edit Safety v1 — Pure Slice

Status: COMPLETED 2026-04-17
Contract: `docs/spec/dual-edit-safety-v1-behavior-contract.md`
Predecessor: `docs/spec/dual-edit-safety-v1-minimum-scope.md`
Scope: pure helpers only. No reducer / AppState / UI wiring.

---

## Delivered

### `src/core/operations/dual-edit-safety.ts`

4 pure helpers, 1 public type pair:

| Export | Signature | Contract ref |
|--------|-----------|--------------|
| `EditBaseSnapshot` | `{ lid, archetype, updated_at, content_hash? }` | §2.1 |
| `SaveConflictCheck` | `safe` \| `entry-missing` \| `archetype-changed` \| `version-mismatch` | §3.3 |
| `captureEditBase(container, lid)` | → `EditBaseSnapshot \| null` | §3.1 |
| `checkSaveConflict(base, container)` | → `SaveConflictCheck` | §3.3 / §2.2 table |
| `isSaveSafe(base, container)` | → `boolean` | §3.2 |
| `branchFromDualEditConflict(container, base, draft, newLid, relationId, now)` | → `Container` | §3.4 / §5.4 / §6 |

All helpers are side-effect free. `newLid` / `relationId` / `now` are injected (I-Dual10). `captureEditBase` and `checkSaveConflict` read only `container.entries` and the latest revision via `getLatestRevision`.

### `tests/core/dual-edit-safety.test.ts`

20 tests grouped in 3 describe blocks:

- `captureEditBase` (4): returns shape, populates `content_hash` from latest revision when present, omits `content_hash` for pre-H-6 revisions, returns `null` for missing lid
- `checkSaveConflict` / `isSaveSafe` (7): safe path, `updated_at` mismatch (primary), `content_hash` mismatch (auxiliary, when both sides carry a hash), pre-H-6 fallback (missing hash defers to `updated_at`), `entry-missing`, `archetype-changed`, `isSaveSafe` matches `kind === 'safe'`
- `branchFromDualEditConflict` (9): draft entry creation, source entry untouched, canonical provenance direction, metadata (`conversion_kind = 'concurrent-edit'`, `converted_at`, `source_updated_at`, `source_content_hash` present/absent, `source_revision_id` absent per I-Dual8), works when source entry was deleted (entry-missing case still records the user's intent), lid / relation id collision guards, determinism

---

## Intentionally not done (deferred to later slices)

- `AppState.dualEditConflict` field and reducer (state slice)
- `COMMIT_ENTRY_EDIT` gate using `checkSaveConflict` (state slice)
- `RESOLVE_DUAL_EDIT_CONFLICT` reducer case (state slice)
- Reject overlay DOM / `action-binder` wiring (UI slice)
- advisory banner detection mechanism (optional, deferred per supervisor fixed decision 6)
- manual sync (step 7)

---

## Quality gates

- `npx vitest run tests/core/dual-edit-safety.test.ts` — 20/20 passed
- `npm run typecheck` — clean
- `npm test` — 4124/4124 passed (baseline 4104 + 20 for this slice)
- No production code outside `src/core/operations/dual-edit-safety.ts` was touched

---

## Provenance metadata summary

For every branch produced by this slice the provenance Relation carries:

```ts
{
  id: relationId,
  from: base.lid,     // source (canonical direction, §6.2)
  to: newLid,         // derived
  kind: 'provenance',
  created_at: now,
  updated_at: now,
  metadata: {
    conversion_kind: 'concurrent-edit',   // required, §6.1
    converted_at: now,                     // required, profile §2.2.1
    source_updated_at: base.updated_at,    // optional (new profile key, §6.4)
    source_content_hash: base.content_hash // recommended when present
  }
}
```

`source_revision_id` is intentionally NOT populated — concurrent-edit has no source revision (I-Dual8).
