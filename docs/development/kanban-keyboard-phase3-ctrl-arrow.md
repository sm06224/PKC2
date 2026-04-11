# Kanban Keyboard Phase 3 — Ctrl+Arrow Status Move

Status: CANDIDATE
Created: 2026-04-11

---

## 1. Summary

Kanban view で Ctrl+Arrow Left / Ctrl+Arrow Right により、
選択中の todo entry の status を列方向に変更する。

Ctrl+Left = 左列 status へ移動（done → open）。
Ctrl+Right = 右列 status へ移動（open → done）。
既存 `QUICK_UPDATE_ENTRY` を再利用。reducer 変更なし。

---

## 2. 現状棚卸し

### Kanban keyboard Phase 1 — Arrow navigation

| Key | 動作 | 実装場所 |
|-----|------|---------|
| Arrow Up/Down | 同一列内カード移動 | `action-binder.ts` 1113-1162 |
| Arrow Left/Right | 列間移動（selection のみ。status 不変） | `action-binder.ts` 1251-1288 |

Guard: `!mod && !e.shiftKey && !e.altKey`（modifier key なし）

### Kanban keyboard Phase 2 — Space toggle

| Key | 動作 | 実装場所 |
|-----|------|---------|
| Space | open ↔ done toggle | `action-binder.ts` 1351-1379 |

`parseTodoBody` → `serializeTodoBody({ ...todo, status: toggled })` → `QUICK_UPDATE_ENTRY`

### Kanban DnD status change

| Path | 動作 | Action |
|------|------|--------|
| Single drag to column | status 変更 | `QUICK_UPDATE_ENTRY` |
| Multi-drag to column | 一括 status 変更 | `BULK_SET_STATUS` |

`handleKanbanDrop` (1646-1689): drop target の `data-pkc-kanban-drop-target` 属性から
target status を取得し、body を再シリアライズして dispatch。

### Status set と列構成

```typescript
KANBAN_COLUMNS = [
  { status: 'open', label: 'Todo' },  // index 0 = 左列
  { status: 'done', label: 'Done' },  // index 1 = 右列
];
```

Status は 2 値: `'open' | 'done'`。
列は左から右へ open → done。

### QUICK_UPDATE_ENTRY

```typescript
{ type: 'QUICK_UPDATE_ENTRY'; lid: string; body: string }
```

body 全体を上書き。ready phase でのみ許可。revision snapshot を自動生成。
reducer 変更不要。

---

## 3. 最小スコープ

### やること

- `viewMode === 'kanban'` で Ctrl+Arrow Left / Ctrl+Arrow Right を処理
- 選択中 todo の status を隣接列の status に変更
- 既存 `QUICK_UPDATE_ENTRY` を再利用
- selectedLid は維持（entry が列を跨いで移動しても selection を追従）

### やらないこと

| 項目 | 理由 |
|------|------|
| multi-select 対応 | `BULK_SET_STATUS` と統合が必要。Phase 4 候補 |
| Ctrl+Arrow Up/Down | 垂直方向の status 変更概念が存在しない |
| Calendar への拡張 | Calendar に status 概念がない |
| DnD 統合 | keyboard と DnD は独立パス。統合不要 |
| reducer 新設 | `QUICK_UPDATE_ENTRY` で十分 |
| Space との再統合 | Space は toggle、Ctrl+Arrow は directional。役割が異なる |
| Shift+Ctrl 複合操作 | scope 外 |

---

## 4. Ctrl+Arrow の意味論

### Ctrl+Arrow Right

```
現在 open 列 → status を 'done' に変更 → entry は done 列に移動
現在 done 列 → no-op（最右列）
```

### Ctrl+Arrow Left

```
現在 done 列 → status を 'open' に変更 → entry は open 列に移動
現在 open 列 → no-op（最左列）
```

### 一般化（列が 2 つ以上に拡張された場合）

```
Ctrl+Right: currentColIdx + 1 の status へ移動。最右列なら no-op。
Ctrl+Left:  currentColIdx - 1 の status へ移動。最左列なら no-op。
```

ただし現在 `KANBAN_COLUMNS` は 2 列固定（open / done）のため、
実質 Space toggle と同じ動作になる。
directional semantics を持つ点が Space との差異。

### selectedLid の維持

status 変更後、entry は異なる列に再描画される。
しかし `selectedLid` は lid ベースのため、render 後も
新しい列内で同じ entry が selected 状態で描画される。

`SELECT_ENTRY` を追加 dispatch する必要はない。
`QUICK_UPDATE_ENTRY` → state 変更 → render → selectedLid が
新しい列内の entry を指す。

### non-todo / no selection / readonly

| 条件 | 動作 |
|------|------|
| selectedLid が null | no-op（handler 冒頭で guard） |
| 選択中 entry が todo 以外 | no-op（archetype guard） |
| readonly mode | no-op（`state.readonly` guard） |
| archived todo | kanban に表示されないため到達しない |

---

## 5. Action Mapping

### 再利用: `QUICK_UPDATE_ENTRY`

```typescript
// Ctrl+Arrow Right (open → done) の場合:
const entry = state.container.entries.find(e => e.lid === state.selectedLid);
if (!entry || entry.archetype !== 'todo') return;
const todo = parseTodoBody(entry.body);

// 列位置から target status を決定
const currentIdx = KANBAN_COLUMNS.findIndex(c => c.status === todo.status);
const targetIdx = e.key === 'ArrowRight' ? currentIdx + 1 : currentIdx - 1;
if (targetIdx < 0 || targetIdx >= KANBAN_COLUMNS.length) return; // edge no-op

const targetStatus = KANBAN_COLUMNS[targetIdx].status;
if (todo.status === targetStatus) return; // same status no-op

const updated = serializeTodoBody({ ...todo, status: targetStatus });
dispatcher.dispatch({ type: 'QUICK_UPDATE_ENTRY', lid: state.selectedLid, body: updated });
```

### なぜ `QUICK_UPDATE_ENTRY` か

- Space toggle と同じ action → 一貫性
- DnD single-drop と同じ action → 一貫性
- reducer 変更不要
- `TOGGLE_TODO_STATUS` は存在しない（Space は直接 body を書き換えている）

### なぜ `BULK_SET_STATUS` ではないか

- `BULK_SET_STATUS` は `multiSelectedLids` 全体に作用する
- Ctrl+Arrow は single selection のみ対象
- multi-select 対応は Phase 4 候補

### なぜ新規 action は不要か

- status 変更は body の書き換えであり、`QUICK_UPDATE_ENTRY` の守備範囲内
- directional move の概念は UI 層で完結し、reducer に露出する必要がない

---

## 6. ガード条件

```typescript
if (
  (e.key === 'ArrowLeft' || e.key === 'ArrowRight')
  && mod                          // Ctrl/Cmd 必須
  && !e.shiftKey && !e.altKey     // Shift/Alt 不可
  && state.phase !== 'editing'
  && state.selectedLid
  && state.viewMode === 'kanban'
  && state.container
  && !state.readonly
) {
  // form control guard
  const target = e.target as HTMLElement | null;
  if (
    target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || (target instanceof HTMLInputElement && target.type !== 'button' && target.type !== 'submit')
    || target?.isContentEditable
  ) {
    return;
  }
  // ... status move logic
}
```

### 条件一覧

| 条件 | 目的 |
|------|------|
| `mod` (Ctrl/Cmd) | plain Arrow は Phase 1 navigation が処理する |
| `!e.shiftKey` | Shift 併用は将来の range selection に予約 |
| `!e.altKey` | Alt 併用は不要 |
| `state.phase !== 'editing'` | 編集中は無効 |
| `state.selectedLid` | 選択なしなら no-op |
| `state.viewMode === 'kanban'` | kanban 限定 |
| `state.container` | container 必須 |
| `!state.readonly` | readonly では状態変更不可 |
| form control guard | input/textarea/select focus 中は無効 |

### multiSelectedLids がある場合

- **Phase 3 では無視**。`state.selectedLid`（単一 anchor）のみ対象
- multiSelectedLids があっても selectedLid の entry だけ移動する
- multi-select + Ctrl+Arrow は Phase 4 候補

### overlay / dialog / menu

- 既存の context menu / overlay は `e.target` guard で暗黙的に除外される
- context menu 表示中は DOM focus が menu 内にあるため handler に到達しない

---

## 7. 配置位置

### handler 挿入場所

既存の Arrow Left/Right handler（1194-1288）は `!mod` を guard としているため、
Ctrl+Arrow はその handler に到達しない。

**新しい handler block を、既存 Arrow Left/Right handler の直前に配置する。**

理由:
- Ctrl+Arrow は plain Arrow より specific
- specific なキー組み合わせを先に評価する
- return で fallthrough を防ぐ

あるいは、既存 Arrow Left/Right handler 内の kanban 分岐より前に
`mod` チェック付き早期 return を挿入する方法もあるが、
既存 handler の `!mod` guard が先にフィルタするため、
**独立 block として先に配置するのが最も安全**。

---

## 8. Space toggle との整合

| 機能 | Space | Ctrl+Arrow |
|------|-------|------------|
| 意味論 | toggle (open ↔ done) | directional (left/right) |
| 結果（2 列時） | 同一 | 同一 |
| 結果（N 列時） | 2 値 toggle のまま | 隣接列 status |
| multi-select | 非対応（Phase 3 scope 外） | 非対応（Phase 3 scope 外） |
| 発見性 | 低（keyboard shortcut） | 中（Ctrl+Arrow は一般的な OS 慣例） |

**競合はない。** 2 列の場合は結果が同じだが、
Space は「現在の反転」、Ctrl+Arrow は「指定方向への移動」として
意味論が異なる。将来列が増えた場合に差が出る。

---

## 9. DnD との整合

| 機能 | DnD | Ctrl+Arrow |
|------|-----|------------|
| 単一移動 | drag → drop on column | Ctrl+Left/Right |
| 一括移動 | multi-drag → drop | 非対応（Phase 4） |
| Action | `QUICK_UPDATE_ENTRY` | `QUICK_UPDATE_ENTRY` |
| selection after move | `SELECT_ENTRY` dispatch | selectedLid 維持（自動） |

**DnD は explicit visual interaction、Ctrl+Arrow は keyboard shortcut。**
同じ `QUICK_UPDATE_ENTRY` を使うため結果は同一。

DnD は drop 後に `SELECT_ENTRY` を dispatch するが、
Ctrl+Arrow では `QUICK_UPDATE_ENTRY` の state 変更で
render が走り、selectedLid が新しい列で resolve されるため不要。

---

## 10. テスト計画

### Status move

| # | Test | Expect |
|---|------|--------|
| 1 | Ctrl+Right on open entry → status becomes done | body updated, entry moves to done column |
| 2 | Ctrl+Left on done entry → status becomes open | body updated, entry moves to open column |
| 3 | Ctrl+Right on done entry → no-op | body unchanged (rightmost column) |
| 4 | Ctrl+Left on open entry → no-op | body unchanged (leftmost column) |
| 5 | selectedLid maintained after move | same lid still selected |

### Guard

| # | Test | Expect |
|---|------|--------|
| 6 | readonly → no-op | body unchanged |
| 7 | non-kanban viewMode → no-op | no dispatch |
| 8 | editing phase → no-op | no dispatch |
| 9 | non-todo entry → no-op | no dispatch |
| 10 | no selection → no-op | no dispatch |
| 11 | textarea focused → no-op | no dispatch |

### Regression

| # | Test | Expect |
|---|------|--------|
| 12 | plain Arrow Left/Right still navigates columns | Phase 1 不変 |
| 13 | plain Arrow Up/Down still navigates within column | Phase 1 不変 |
| 14 | Space still toggles status | Phase 2 不変 |
| 15 | Escape still clears selection | 不変 |
| 16 | Ctrl+Arrow in sidebar view → no-op | sidebar navigation 不変 |

---

## 11. 実装変更箇所（見積もり）

| File | Change | Lines |
|------|--------|-------|
| `adapter/ui/action-binder.ts` | Ctrl+Arrow Left/Right handler 追加 | ~25 |
| テスト | `tests/adapter/action-binder.test.ts` | ~80 |

### 変更なし

| File | 理由 |
|------|------|
| reducer | `QUICK_UPDATE_ENTRY` 再利用 |
| `kanban-data.ts` | `KANBAN_COLUMNS` 参照のみ |
| `todo-body.ts` | `parseTodoBody` / `serializeTodoBody` 再利用 |
| renderer | render は state 変更で自動発火 |
| CSS | 視覚変更なし |

### import 追加

- `action-binder.ts` に `KANBAN_COLUMNS` を追加 import（列 status を参照するため）

---

## 12. Non-goals

| 項目 | 理由 |
|------|------|
| multi-select Ctrl+Arrow | `BULK_SET_STATUS` 統合が必要。Phase 4 |
| Ctrl+Arrow Up/Down | 垂直方向に status 概念がない |
| Calendar Ctrl+Arrow | Calendar に status 概念がない |
| animate / transition | 列間移動のアニメーションは UX 拡張。別 issue |
| undo | `QUICK_UPDATE_ENTRY` は revision を自動生成。undo は別 issue |
