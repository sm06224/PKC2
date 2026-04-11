# Keyboard Navigation Phase 2: Enter Key

Status: COMPLETED
Completed: 2026-04-11
Created: 2026-04-11

---

## A. Scope

### Today

- Enter key opens the selected entry for editing (`BEGIN_EDIT`)
- Reuses existing `BEGIN_EDIT` action — no new reducer actions
- Same guard pattern as Arrow Up/Down (form control + modifier check)

### Not Today

- Entry window open via Enter
- Double-click replacement
- Shift+Enter / Ctrl+Enter variants
- Reducer changes
- Renderer changes

---

## B. Guard Conditions

| Condition | Enter fires? | Reason |
|-----------|-------------|--------|
| `phase === 'ready'`, selectedLid exists | YES | Normal operation |
| `phase === 'editing'` | NO | Already editing |
| `selectedLid === null` | NO | Nothing to edit |
| input / textarea / select focused | NO | Browser default (form submit, newline) |
| contenteditable focused | NO | Browser default |
| Ctrl / Meta + Enter | NO | Reserved for future |
| Shift + Enter | NO | Reserved for future |
| Alt + Enter | NO | Reserved for future |
| readonly mode | NO | `BEGIN_EDIT` blocked by reducer |

---

## C. Implementation

### Changes

| File | Change | Lines |
|------|--------|-------|
| `action-binder.ts` | Enter handler in `handleKeydown`, after Arrow block | +17 |
| `action-binder.test.ts` | 12 tests | +120 |

### Keydown Cascade (updated)

```
handleKeydown:
  1. overlay / menu / autocomplete / import early return
  2. Escape cascade (import → edit → multi-select → deselect)
  3. Arrow Up / Down (sidebar navigation)
  4. Enter (begin edit)          ← NEW
  5. Ctrl+N (new entry)
```

### Handler Code

```typescript
if (
  e.key === 'Enter'
  && !mod && !e.shiftKey && !e.altKey
  && state.phase !== 'editing'
  && state.selectedLid
) {
  // form control guard (same as Arrow)
  const target = e.target as HTMLElement | null;
  if (
    target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || (target instanceof HTMLInputElement && ...)
    || target?.isContentEditable
  ) { return; }

  e.preventDefault();
  dispatcher.dispatch({ type: 'BEGIN_EDIT', lid: state.selectedLid });
  return;
}
```

---

## D. Tests

| # | Test | Category |
|---|------|----------|
| 1 | Enter opens edit mode for selected entry | Core |
| 2 | Enter does nothing when no selection | Core |
| 3 | Enter blocked during editing phase | Guard |
| 4 | Enter blocked when textarea is focused | Guard |
| 5 | Enter blocked when input is focused | Guard |
| 6 | Enter blocked when select is focused | Guard |
| 7 | Enter blocked with Ctrl modifier | Guard |
| 8 | Enter blocked with Shift modifier | Guard |
| 9 | Enter blocked with Alt modifier | Guard |
| 10 | Escape then Enter round-trip | Regression |
| 11 | Arrow then Enter selects and edits | Regression |
| 12 | Enter blocked in readonly mode | Regression |
