# Keyboard Navigation Phase 5: Arrow Right → First Child

Status: COMPLETED
Completed: 2026-04-11
Created: 2026-04-11

---

## A. Scope

### Today

- Arrow Right on **collapsed** folder → expand (Phase 3 behavior, unchanged)
- Arrow Right on **expanded** folder → select first structural child via `SELECT_ENTRY`
- Arrow Right on expanded folder with **no children** → no-op
- Sidebar limited; existing collapse state preserved

### Not Today

- non-folder の Arrow Right / Arrow Left
- Calendar / Kanban keyboard navigation
- Shift+Arrow range select
- multi-select keyboard 拡張

---

## B. Source of Truth

### Child resolution

`state.container.relations` 内の structural relation で親子関係を解決する。

Convention: `{ from: parentLid, to: childLid, kind: 'structural' }`

新規 helper:

```typescript
// features/relation/tree.ts
getFirstStructuralChild(relations, entries, parentLid) → Entry | null
```

`getStructuralParent()` の対称ヘルパー。relations を走査し、
`r.kind === 'structural' && r.from === parentLid` の最初の `r.to` に対応する
entry を返す。子が存在しなければ `null`。

### Why a new helper

`buildTree()` は全エントリの tree を構築するため、単一 folder の最初の子を
取得するには重すぎる。`getStructuralParent()` と対称な軽量ヘルパーが適切。

---

## C. Action Definitions

| State | Arrow Left | Arrow Right |
|-------|-----------|-------------|
| Expanded folder | collapse (Phase 3) | **SELECT_ENTRY → first child** |
| Expanded folder, no children | collapse (Phase 3) | no-op |
| Collapsed folder, has parent | SELECT_ENTRY → parent (Phase 4) | expand (Phase 3) |
| Collapsed folder, root | no-op | expand (Phase 3) |
| Non-folder selected | no-op | no-op |
| No selection | no-op | no-op |

### 優先順位

Arrow Right の処理順:
1. folder でなければ → return (no-op)
2. collapsed なら → expand (Phase 3)
3. expanded なら → 最初の子を探す → あれば SELECT_ENTRY → なければ no-op

Phase 3 の expand と Phase 5 の child select は isCollapsed で排他的。

---

## D. Guard Conditions

Phase 3/4 と同一:

| Condition | Fires? | Reason |
|-----------|--------|--------|
| `phase === 'editing'` | NO | editing guard |
| input / textarea / select focused | NO | Browser default |
| Ctrl / Meta + Arrow | NO | Browser default |
| Shift / Alt + Arrow | NO | Reserved |
| readonly mode | YES | SELECT_ENTRY は runtime UI state のみ |

---

## E. Implementation

### Changes

| File | Change | Lines |
|------|--------|-------|
| `features/relation/tree.ts` | `getFirstStructuralChild()` helper | ~10 |
| `action-binder.ts` | import + Arrow Right else-if branch | ~7 |
| `action-binder.test.ts` | Phase 5 tests | ~150 |
| `INDEX.md` | Phase 5 status update | ~5 |

### Keydown Cascade (unchanged)

```
handleKeydown:
  1. overlay / menu / autocomplete / import early return
  2. Escape cascade
  3. Arrow Up / Down (sidebar navigation)
  4. Arrow Left / Right (tree collapse/expand + parent move + child select)
  5. Enter (begin edit)
  6. Ctrl+N (new entry)
```

Position 4 の内部で Arrow Right の else-if に child select を追加。

---

## F. Tests

### Integration tests

| # | Test | Expect |
|---|------|--------|
| 1 | Arrow Right on expanded folder with children | selectedLid = first child lid |
| 2 | Arrow Right on expanded folder with no children | selectedLid unchanged (no-op) |
| 3 | Arrow Right on collapsed folder (Phase 3 regression) | folder expands, selectedLid unchanged |
| 4 | Arrow Left on expanded folder (Phase 3 regression) | folder collapses |
| 5 | Arrow Left on collapsed folder → parent (Phase 4 regression) | selectedLid = parent lid |

### Guard tests

| # | Test | Expect |
|---|------|--------|
| 6 | Arrow Right during editing phase | no dispatch |
| 7 | Arrow Right while textarea focused | no dispatch |
| 8 | Arrow Right with Ctrl modifier | no dispatch |
| 9 | Arrow Right on non-folder entry | no dispatch |

### Regression tests

| # | Test | Expect |
|---|------|--------|
| 10 | Arrow Up/Down still works after Phase 5 | navigation unchanged |
| 11 | Enter still dispatches BEGIN_EDIT | edit flow unchanged |
| 12 | Escape still clears selection | escape flow unchanged |
