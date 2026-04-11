# Keyboard Navigation Phase 6: Non-folder Arrow Left → Parent

Status: COMPLETED
Completed: 2026-04-11
Created: 2026-04-11

---

## A. Scope

### Today

- non-folder entry 選択中に Arrow Left → structural parent folder を選択
- parent が存在しない root-level entry → no-op
- sidebar 限定
- folder の既存 Arrow Left 挙動（collapse / parent move）は変更しない

### Not Today

- non-folder の Arrow Right に特別な挙動を追加
- Calendar / Kanban keyboard navigation
- tree grid 的な完全 keyboard UX
- multi-select keyboard 拡張
- Shift+Arrow range selection

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

Phase 4 と同一のヘルパー。DOM 依存なし。

---

## C. Action Definitions

| State | Arrow Left | Arrow Right |
|-------|-----------|-------------|
| **Non-folder, has parent** | **SELECT_ENTRY → parent** | no-op |
| **Non-folder, no parent (root)** | no-op | no-op |
| Expanded folder | collapse (Phase 3) | select first child (Phase 5) |
| Collapsed folder, has parent | select parent (Phase 4) | expand (Phase 3) |
| Collapsed folder, root | no-op | expand (Phase 3) |
| No selection | no-op | no-op |

### 優先順位

Arrow Left/Right handler 内の処理順:

1. entry が見つからなければ → return
2. **non-folder なら → Arrow Left で parent 移動 / Arrow Right は no-op → return**
3. folder なら → 既存の collapse/expand/parent/child 処理

non-folder 分岐を folder 分岐の **前** に置く。folder 分岐は完全に不変。

---

## D. Guard Conditions

Phase 3/4/5 と同一:

| Condition | Fires? | Reason |
|-----------|--------|--------|
| `phase === 'editing'` | NO | editing guard |
| input / textarea / select focused | NO | Browser default |
| Ctrl / Meta + Arrow | NO | Browser default |
| Shift / Alt + Arrow | NO | Reserved |
| readonly mode | YES | SELECT_ENTRY は runtime UI state のみ |
| overlay / menu / picker open | NO | 既存 early return |

---

## E. Implementation

### Changes

| File | Change | Lines |
|------|--------|-------|
| `action-binder.ts` | archetype guard 分割 + non-folder Arrow Left 分岐 | ~8 |
| `action-binder.test.ts` | Phase 6 tests | ~150 |
| `INDEX.md` | Phase 6 status update | ~5 |

### Code Change

Before:
```typescript
const entry = state.container.entries.find((en) => en.lid === state.selectedLid);
if (!entry || entry.archetype !== 'folder') return;
```

After:
```typescript
const entry = state.container.entries.find((en) => en.lid === state.selectedLid);
if (!entry) return;

// Non-folder: Arrow Left moves to parent, Arrow Right is no-op
if (entry.archetype !== 'folder') {
  if (e.key === 'ArrowLeft') {
    const parent = getStructuralParent(...);
    if (parent) {
      e.preventDefault();
      dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: parent.lid });
    }
  }
  return;
}

// Folder handling (unchanged)
```

### Keydown Cascade (unchanged)

```
handleKeydown:
  1. overlay / menu / autocomplete / import early return
  2. Escape cascade
  3. Arrow Up / Down (sidebar navigation)
  4. Arrow Left / Right (tree + non-folder parent)
  5. Enter (begin edit)
  6. Ctrl+N (new entry)
```

---

## F. Tests

### Integration

| # | Test | Expect |
|---|------|--------|
| 1 | non-folder child: Arrow Left → parent folder selected | selectedLid = parent lid |
| 2 | non-folder root-level: Arrow Left → no-op | selectedLid unchanged |
| 3 | non-folder: Arrow Right → no-op | selectedLid unchanged |
| 4 | folder expanded: Arrow Left → collapse (Phase 3) | collapsedFolders includes lid |
| 5 | folder collapsed: Arrow Left → parent (Phase 4) | selectedLid = parent lid |

### Guard

| # | Test | Expect |
|---|------|--------|
| 6 | blocked during editing | no dispatch |
| 7 | blocked when textarea focused | no dispatch |
| 8 | blocked with Ctrl modifier | no dispatch |

### Regression

| # | Test | Expect |
|---|------|--------|
| 9 | folder Arrow Right child select (Phase 5) | unchanged |
| 10 | Arrow Up/Down | unchanged |
| 11 | Enter begin edit | unchanged |
| 12 | Escape clears selection | unchanged |
