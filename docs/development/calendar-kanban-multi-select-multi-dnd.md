# Calendar/Kanban Multi-Select — Phase 2-C: Multi-DnD Design

Status: CANDIDATE (design only)
Created: 2026-04-11

---

## S1 目的

multi-select 状態で DnD drop を行った際、選択中の全 todo エントリに対して一括操作を適用する。Phase 2-A/2-B で実装済みの `BULK_SET_STATUS` / `BULK_SET_DATE` reducer を DnD drop handler から再利用する。

---

## S2 現状 DnD インベントリ

### 2.1 Three Isolated DnD Systems

| DnD | drag 変数 | drag 属性 | drop 属性 | drop 結果 | scope |
|-----|----------|-----------|-----------|-----------|-------|
| Sidebar | `draggedLid` | `data-pkc-draggable` | `data-pkc-drop-target` | `DELETE_RELATION` + `CREATE_RELATION` | structural 関係変更 |
| Kanban | `kanbanDraggedLid` | `data-pkc-kanban-draggable` | `data-pkc-kanban-drop-target` | `QUICK_UPDATE_ENTRY` (status) | todo status 変更 |
| Calendar | `calendarDraggedLid` | `data-pkc-calendar-draggable` | `data-pkc-calendar-drop-target` | `QUICK_UPDATE_ENTRY` (date) | todo date 変更 |

### 2.2 Cross-View DnD (既存)

| drag 元 | drop 先 | 処理 |
|---------|---------|------|
| Kanban → Calendar | `handleCalendarDrop` | `calendarDraggedLid ?? kanbanDraggedLid` → date 変更 |
| Calendar → Kanban | `handleKanbanDrop` | `kanbanDraggedLid ?? calendarDraggedLid` → status 変更 |

### 2.3 Drop Handler 共通パターン (action-binder.ts)

```
handleKanbanDrop (L1267-1300):
  lid = kanbanDraggedLid ?? calendarDraggedLid
  targetStatus = dropTarget.getAttribute('data-pkc-kanban-drop-target')
  if (todo.status !== targetStatus)
    dispatch(QUICK_UPDATE_ENTRY { lid, body: serialize({...todo, status}) })
  dispatch(SELECT_ENTRY { lid })        // ← multiSelectedLids をクリア
  kanbanDraggedLid = calendarDraggedLid = null

handleCalendarDrop (L1347-1379):
  lid = calendarDraggedLid ?? kanbanDraggedLid
  targetDate = dropTarget.getAttribute('data-pkc-date')
  if (todo.date !== targetDate)
    dispatch(QUICK_UPDATE_ENTRY { lid, body: serialize({...todo, date}) })
  dispatch(SELECT_ENTRY { lid })        // ← multiSelectedLids をクリア
  calendarDraggedLid = kanbanDraggedLid = null
```

### 2.4 Key Observation

- `SELECT_ENTRY` は `multiSelectedLids: []` にクリアする (app-state.ts:220)
- drag 変数は単一 `string | null` — 複数 lid の追跡機構がない
- drag visual (`data-pkc-dragging`) は drag 元の単一要素にのみ適用

---

## S3 Multi-DnD セマンティクス

### 3.1 判定ルール: multi-drag vs single-drag

```
dragStart 時:
  if (dragged lid ∈ multiSelectedLids ∪ {selectedLid})
    → multi-drag: 操作対象 = getAllSelected(state)
  else
    → single-drag: 操作対象 = [dragged lid] (現行動作)
```

**根拠**: ユーザが明示的に選択した集合の一部をドラッグした場合のみ multi-drag。選択外のアイテムをドラッグした場合は、新たな単一操作として扱い、既存の multi-select は解除。

### 3.2 Drop Action Mapping

| drop 先 | single-drag (現行) | multi-drag (新規) |
|---------|-------------------|------------------|
| Kanban column | `QUICK_UPDATE_ENTRY` (1 件) | `BULK_SET_STATUS` (N 件) |
| Calendar cell | `QUICK_UPDATE_ENTRY` (1 件) | `BULK_SET_DATE` (N 件) |

### 3.3 Drop 後の状態

| 項目 | single-drag | multi-drag |
|------|------------|-----------|
| `multiSelectedLids` | `[]` (SELECT_ENTRY で clear) | `[]` (BULK_SET_* が clear) |
| `selectedLid` | dragged lid (SELECT_ENTRY) | dragged lid (SELECT_ENTRY) |

**判定**: 両方とも drop 後に multi-select はクリアされる。BULK_SET_* reducer は既に `multiSelectedLids: []` を返す。drop 後の SELECT_ENTRY は multi-drag でも維持し、ドラッグしたアイテムを anchor として選択する。

### 3.4 Sidebar DnD: 対象外

Sidebar DnD (structural relations) は multi-DnD 対象外とする。

**理由**:
- structural relation は 1:1 (parent → child)。複数エントリの一括移動は「同一 parent への子追加」だが、cycle detection が複雑化する
- Sidebar には既に `BULK_MOVE_TO_FOLDER` / `BULK_MOVE_TO_ROOT` がある (multi-action bar 経由)
- multi-DnD は Kanban/Calendar の「属性値変更」に限定するのが自然

---

## S4 実装設計

### 4.1 変更対象

| ファイル | 変更内容 |
|---------|---------|
| `action-binder.ts` | `handleKanbanDragStart`, `handleKanbanDrop` に multi-drag 分岐追加 |
| `action-binder.ts` | `handleCalendarDragStart`, `handleCalendarDrop` に multi-drag 分岐追加 |

**reducer 変更: なし**。`BULK_SET_STATUS` / `BULK_SET_DATE` は実装済み。

**renderer 変更: なし**。`data-pkc-multi-selected` 属性は Phase 1 で実装済み。

### 4.2 dragStart 変更案

```typescript
// handleKanbanDragStart — 現行
kanbanDraggedLid = lid;

// handleKanbanDragStart — multi-drag 対応
kanbanDraggedLid = lid;
const state = dispatcher.getState();
const selected = getAllSelected(state);
isMultiDrag = selected.length > 1 && selected.includes(lid);
```

`isMultiDrag` は module-level flag (bool)。drag 変数 (`kanbanDraggedLid` / `calendarDraggedLid`) は引き続き単一 lid を保持する（drag ghost 表示・drop 先の特定に使用）。

### 4.3 handleKanbanDrop 変更案

```typescript
function handleKanbanDrop(e: DragEvent): void {
  // ... (既存の guard) ...
  const targetStatus = dropTarget.getAttribute('data-pkc-kanban-drop-target');
  if (!targetStatus) return;

  if (isMultiDrag) {
    // Multi-drag: BULK_SET_STATUS で全選択エントリの status を変更
    dispatcher.dispatch({
      type: 'BULK_SET_STATUS',
      status: targetStatus as 'open' | 'done',
    });
  } else {
    // Single-drag: 現行動作
    const entry = state.container.entries.find((e) => e.lid === lid);
    if (!entry) return;
    const todo = parseTodoBody(entry.body);
    if (todo.status !== targetStatus) {
      const updated = serializeTodoBody({ ...todo, status: targetStatus as 'open' | 'done' });
      dispatcher.dispatch({ type: 'QUICK_UPDATE_ENTRY', lid, body: updated });
    }
  }

  // Select the dragged entry (anchor)
  dispatcher.dispatch({ type: 'SELECT_ENTRY', lid });

  // Clean up
  kanbanDraggedLid = null;
  calendarDraggedLid = null;
  isMultiDrag = false;
  // ...
}
```

### 4.4 handleCalendarDrop 変更案 (同構造)

```typescript
if (isMultiDrag) {
  dispatcher.dispatch({
    type: 'BULK_SET_DATE',
    date: targetDate,       // string (YYYY-MM-DD)
  });
} else {
  // 現行の QUICK_UPDATE_ENTRY 処理
}
```

### 4.5 isMultiDrag flag の管理

| イベント | 設定 |
|---------|------|
| `handleKanbanDragStart` | `isMultiDrag = selected.includes(lid) && selected.length > 1` |
| `handleCalendarDragStart` | 同上 |
| `handleKanbanDrop` | `isMultiDrag = false` (使用後リセット) |
| `handleCalendarDrop` | `isMultiDrag = false` (使用後リセット) |
| `handleKanbanDragEnd` | `isMultiDrag = false` (ドロップなしキャンセル時) |
| `handleCalendarDragEnd` | `isMultiDrag = false` (ドロップなしキャンセル時) |

**注意**: `isMultiDrag` は Kanban / Calendar の両 DnD システムで共有。cross-view DnD (Kanban → Calendar) では dragStart で設定した `isMultiDrag` が cross-view の drop handler でも参照される。これは意図通りの動作（同一 drag 操作の継続）。

---

## S5 Conflict Analysis

### 5.1 BULK_SET_STATUS の getAllSelected() と SELECT_ENTRY の順序

**問題**: `BULK_SET_STATUS` reducer は `getAllSelected(state)` で対象を取得し、最後に `multiSelectedLids: []` にクリアする。直後の `SELECT_ENTRY` dispatch 時、reducer は `multiSelectedLids` が既にクリア済みの state を受け取る。

**分析**: これは問題ない。`BULK_SET_STATUS` が全エントリの status を変更し multi-select をクリア。次の `SELECT_ENTRY` は dragged lid を `selectedLid` に設定するだけ。順序は正しい。

### 5.2 Cross-view multi-drag のアクション一致

| drag 元 | drop 先 | multi-drag action |
|---------|---------|-------------------|
| Kanban | Kanban | `BULK_SET_STATUS` |
| Calendar | Calendar | `BULK_SET_DATE` |
| Kanban | Calendar | `BULK_SET_DATE` |
| Calendar | Kanban | `BULK_SET_STATUS` |

**分析**: drop 先が action を決定する。drag 元は関係ない。cross-view multi-drag でも drop 先のハンドラが適切な BULK action を dispatch するため、整合性がある。

### 5.3 non-todo エントリが multi-select に含まれる場合

**分析**: `BULK_SET_STATUS` / `BULK_SET_DATE` reducer は `entry.archetype !== 'todo'` をスキップする (既存実装)。non-todo エントリは無視される。問題なし。

### 5.4 drag ghost の表示

**現状**: drag 開始時に `data-pkc-dragging="true"` が単一要素にのみ設定される。multi-drag でも drag ghost はブラウザデフォルト（ドラッグした要素のスナップショット）。

**Phase 2-C での対応**: drag ghost のカスタマイズは行わない。「N 件選択中」の表示は multi-action bar で既に確認可能。drag ghost は単一要素のまま。

**将来検討**: `setDragImage()` で「+N」バッジ付き custom ghost を設定する拡張は Phase 2-C 後のオプション。

### 5.5 readonly / editing phase ガード

**分析**: drop handler は既に `state.phase !== 'ready' || state.readonly` をガードしている。`BULK_SET_STATUS` / `BULK_SET_DATE` reducer も `state.readonly` をガードする。二重ガードで安全。

### 5.6 dragStart 時点と drop 時点の state 乖離

**問題**: dragStart で `isMultiDrag` を判定するが、drag 中にユーザが他の操作を行い `multiSelectedLids` が変化する可能性。

**分析**: drag 中に click 等で state が変わるシナリオは非現実的（drag 中はブラウザが click を抑制する）。万が一変わった場合、`BULK_SET_STATUS` / `BULK_SET_DATE` は drop 時点の `getAllSelected(state)` を使うため、drop 時点の実際の選択状態に基づいて動作する。安全。

ただし、edge case: dragStart 時に `isMultiDrag = true` だが、drop 時に state が変わり `multiSelectedLids = []` かつ `selectedLid` のみの場合 → `BULK_SET_STATUS` は `getAllSelected()` = `[selectedLid]` に対して動作。結果的に単一エントリの status 変更になるが、`QUICK_UPDATE_ENTRY` とは異なり revision snapshot も作成される。実害なし。

---

## S6 Recommended Slice

### Slice C-1: Kanban multi-DnD (最小)

**scope**:
- `handleKanbanDragStart`: `isMultiDrag` flag 設定
- `handleKanbanDrop`: `isMultiDrag` 分岐 → `BULK_SET_STATUS` dispatch
- `handleKanbanDragEnd`: `isMultiDrag` reset
- テスト: multi-select 状態で Kanban column に drop → 全選択エントリの status 変更

**変更量**: action-binder.ts に ~15 行追加。テスト ~8 件。

### Slice C-2: Calendar multi-DnD

**scope**:
- `handleCalendarDragStart`: `isMultiDrag` flag 設定
- `handleCalendarDrop`: `isMultiDrag` 分岐 → `BULK_SET_DATE` dispatch
- `handleCalendarDragEnd`: `isMultiDrag` reset
- テスト: multi-select 状態で Calendar cell に drop → 全選択エントリの date 変更

**変更量**: action-binder.ts に ~15 行追加。テスト ~8 件。

### Slice C-3: Cross-view multi-DnD

**scope**: C-1 + C-2 実装後、cross-view (Kanban→Calendar, Calendar→Kanban) の multi-drag テスト追加。`isMultiDrag` が cross-view で正しく引き継がれることの検証。

**変更量**: コード変更なし（C-1 + C-2 の設計で cross-view は自動対応）。テスト ~4 件。

### 推奨実装順序

```
C-1 (Kanban multi-DnD) → C-2 (Calendar multi-DnD) → C-3 (Cross-view テスト)
```

**理由**:
- C-1 が最小スコープ（status は 2 値、テストが単純）
- C-2 は C-1 と同構造のため、C-1 の実績を基にそのまま適用
- C-3 はコード変更なし、テストのみ。`isMultiDrag` の cross-view 引き継ぎは設計上自動対応するが、テストで保証

---

## S7 Phase 2-C 完了条件

| # | 条件 | 検証方法 |
|---|------|---------|
| D1 | Kanban: multi-select 中のカードを drag → 別 column に drop → 全選択エントリの status 変更 | action-binder test |
| D2 | Calendar: multi-select 中のアイテムを drag → 別 date cell に drop → 全選択エントリの date 変更 | action-binder test |
| D3 | Cross-view: Kanban multi-drag → Calendar drop → 全選択エントリの date 変更 | action-binder test |
| D4 | Cross-view: Calendar multi-drag → Kanban drop → 全選択エントリの status 変更 | action-binder test |
| D5 | 非選択アイテムを drag → 単一エントリのみ変更（現行動作維持） | action-binder test |
| D6 | multi-drag 後に multiSelectedLids がクリアされる | action-binder test |
| D7 | readonly モードでは drop が無視される | 既存テスト |
| D8 | drag キャンセル (dragEnd without drop) で isMultiDrag がリセットされる | action-binder test |
| D9 | 全既存テスト pass | `npm test` |
| D10 | `npm run build:bundle` 成功 | CI |
