# Keyboard Navigation Phase 4: Arrow Left → Parent Folder

Status: COMPLETED
Completed: 2026-04-11
Created: 2026-04-11

---

## A. Scope

### Today

- Arrow Left on **expanded** folder → collapse (Phase 3 behavior, unchanged)
- Arrow Left on **collapsed** folder → select parent folder via `SELECT_ENTRY`
- Arrow Left on collapsed **root** folder (no parent) → no-op
- Sidebar limited; existing selection / collapse state preserved

### Not Today

- Arrow Right で子の先頭へ移動
- Calendar / Kanban keyboard navigation
- tree grid 的な完全 keyboard UX
- Shift+Arrow range select
- multi-select keyboard 拡張
- non-folder entry に対する parent 移動

> **Note (2026-04-11)**:
> 「Arrow Right で子の先頭へ移動」は Phase 5 で実装済み (`keyboard-navigation-phase5-child.md`)。

---

## B. Source of Truth

### Parent resolution

`state.container.relations` 内の structural relation で親子関係を解決する。

Convention: `{ from: parentLid, to: childLid, kind: 'structural' }`

既存 helper を再利用:

```typescript
// features/relation/tree.ts
getStructuralParent(relations, entries, lid) → Entry | null
```

このヘルパーは `relations` を走査し、`r.kind === 'structural' && r.to === lid` の
`r.from` に対応する entry を返す。parent が存在しなければ `null`。

### Why state-based, not DOM-based

DOM から parent を解決する方法（`closest('[data-pkc-folder]')` 等）は:
- collapsed 時に child が DOM から消えるため使えない
- tree の構造的 parent と視覚的 parent が一致しない可能性がある

`getStructuralParent()` は relation ベースなので、DOM 状態に依存しない。

---

## C. Action Definitions

| State | Arrow Left | Arrow Right |
|-------|-----------|-------------|
| Expanded folder | collapse (Phase 3) | no-op (Phase 3) |
| Collapsed folder, has parent | **SELECT_ENTRY → parent** | expand (Phase 3) |
| Collapsed folder, root (no parent) | no-op | expand (Phase 3) |
| Non-folder selected | no-op | no-op |
| No selection | no-op | no-op |

### 優先順位

Arrow Left の処理順:
1. folder でなければ → return (no-op)
2. expanded なら → collapse
3. collapsed なら → parent を探す → あれば SELECT_ENTRY → なければ no-op

「まず collapse、次に parent」の順序が重要。

---

## D. Guard Conditions

Phase 3 と同一:

| Condition | Fires? | Reason |
|-----------|--------|--------|
| `phase === 'editing'` | NO | editing guard |
| input / textarea / select focused | NO | Browser default |
| Ctrl / Meta + Arrow | NO | Browser default |
| Shift / Alt + Arrow | NO | Reserved |
| readonly mode | YES | SELECT_ENTRY + collapse は runtime UI state のみ |

---

## E. Implementation

### Changes

| File | Change | Lines |
|------|--------|-------|
| `action-binder.ts` | import + Arrow Left else-if branch | ~5 |
| `action-binder.test.ts` | Phase 4 tests | ~130 |

### Keydown Cascade (unchanged)

```
handleKeydown:
  1. overlay / menu / autocomplete / import early return
  2. Escape cascade
  3. Arrow Up / Down (sidebar navigation)
  4. Arrow Left / Right (tree collapse/expand + parent move)
  5. Enter (begin edit)
  6. Ctrl+N (new entry)
```

Position 4 の内部で Arrow Left の else-if に parent move を追加。
