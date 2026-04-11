# Calendar/Kanban Multi-Select — Phase 2-C: Multi-DnD Design

Status: COMPLETED (C-1/C-2/C-3 全完了)
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

**前提の変更**: C-1/C-2 の実装では設計 S4.5 の共通 `isMultiDrag` ではなく、view 別の `isKanbanMultiDrag` / `isCalendarMultiDrag` を採用した。そのため C-3 は「コード変更なし、テストのみ」ではなく、flag 統合を含む小規模なコード変更が必要。

**scope**: flag 統合 + cross-view multi-DnD テスト追加。詳細は本ドキュメント S8 を参照。

**変更量**: action-binder.ts に ~10 行の rename/修正。テスト ~6 件。

---

## S8 Phase 2-C3: Cross-view Multi-DnD 設計

### 8.1 現状棚卸し

#### flag の set/clear マップ

| flag | set | clear (drop) | clear (dragEnd) | clear (clearAllDragState) |
|------|-----|-------------|-----------------|--------------------------|
| `isKanbanMultiDrag` | `handleKanbanDragStart` (L1247) | `handleKanbanDrop` (L1312) | `handleKanbanDragEnd` (L1325) | **未対応** |
| `isCalendarMultiDrag` | `handleCalendarDragStart` (L1342) | `handleCalendarDrop` (L1407) | `handleCalendarDragEnd` (L1421) | **未対応** |

#### cross-view で multi-drag にならない原因

**Kanban → Calendar**:
1. `handleKanbanDragStart` → `kanbanDraggedLid = lid`, `isKanbanMultiDrag = true`
2. ビューが Calendar に切り替わる（drag-over-tab 経由）
3. `handleCalendarDrop` → `lid = calendarDraggedLid ?? kanbanDraggedLid` → `kanbanDraggedLid` を取得
4. 条件: `isCalendarMultiDrag && calendarDraggedLid` → **両方 false/null** → single-drag path

**Calendar → Kanban**: 同構造。`isKanbanMultiDrag && kanbanDraggedLid` が false/null。

#### clearAllDragState の漏れ

`clearAllDragState()` (L1428-1441) は `draggedLid`, `kanbanDraggedLid`, `calendarDraggedLid` をクリアするが、`isKanbanMultiDrag` / `isCalendarMultiDrag` を**クリアしない**。安全側（multi-drag flag が残っても lid が null なので分岐条件に入らない）だが、設計上は漏れ。

### 8.2 Flag 設計案比較

#### 案 A: 共通 `isMultiDrag` に統合

`isKanbanMultiDrag` と `isCalendarMultiDrag` を単一の `isMultiDrag` に統合。

**変更**:
- 変数宣言: 2 箇所削除、1 箇所追加
- `handleKanbanDragStart`: `isKanbanMultiDrag = ...` → `isMultiDrag = ...`
- `handleCalendarDragStart`: `isCalendarMultiDrag = ...` → `isMultiDrag = ...`
- `handleKanbanDrop`: `isKanbanMultiDrag && kanbanDraggedLid` → `isMultiDrag`
- `handleCalendarDrop`: `isCalendarMultiDrag && calendarDraggedLid` → `isMultiDrag`
- 全 clear 箇所: rename
- `clearAllDragState`: `isMultiDrag = false` 追加

| 評価軸 | 評価 |
|--------|------|
| diff の小ささ | ◎ rename のみ、ロジック変更は drop 条件の guard 削除だけ |
| stale state リスク | ◎ clear 箇所が減る（2→1）。clearAllDragState にも追加しやすい |
| cleanup の明快さ | ◎ flag が 1 本なので全 cleanup 経路で見落としにくい |
| single-drag への影響 | ◎ `isMultiDrag = false` のとき既存 single-drag path。変更なし |

#### 案 B: 現行 2 flag のまま drop 側で OR 判定

**変更**:
- `handleKanbanDrop`: `(isKanbanMultiDrag || isCalendarMultiDrag)` に変更
- `handleCalendarDrop`: 同上
- 全 drop/dragEnd: 両 flag をクリア
- `clearAllDragState`: 両 flag をクリア

| 評価軸 | 評価 |
|--------|------|
| diff の小ささ | ○ 条件式の変更 + clear の追加 |
| stale state リスク | △ 2 flag のうち片方だけ立つケースがあるため、clear 漏れのリスクが残る |
| cleanup の明快さ | △ OR 条件が「なぜ 2 つあるのか」を後から読む人に説明が必要 |
| single-drag への影響 | ◎ 変更なし |

#### 案 C: drag payload オブジェクト

`{ lid: string, isMulti: boolean }` を `kanbanDragPayload` / `calendarDragPayload` として管理。

| 評価軸 | 評価 |
|--------|------|
| diff の小ささ | × 大規模リファクタ。既存 lid 参照を全て payload.lid に変更 |
| stale state リスク | ○ オブジェクト一括管理で良い |
| cleanup の明快さ | ○ null 代入 1 回で全 state クリア |
| single-drag への影響 | △ 全ハンドラの lid 参照が変わる |

### 8.3 Cross-view Drop Semantics

| drag 元 | drop 先 | multi-drag | action |
|---------|---------|-----------|--------|
| Kanban | Calendar | `isMultiDrag = true` | `BULK_SET_DATE` |
| Kanban | Calendar | `isMultiDrag = false` | `QUICK_UPDATE_ENTRY` (date) |
| Calendar | Kanban | `isMultiDrag = true` | `BULK_SET_STATUS` |
| Calendar | Kanban | `isMultiDrag = false` | `QUICK_UPDATE_ENTRY` (status) |
| Kanban | Kanban | `isMultiDrag = true` | `BULK_SET_STATUS` (C-1 既存) |
| Calendar | Calendar | `isMultiDrag = true` | `BULK_SET_DATE` (C-2 既存) |

**key rule**: **drop 先が action を決定する**。drag 元は関係ない。multi/single の判定は dragStart 時に確定し、drop 先を問わず引き継がれる。

**dragged lid が selection 集合外の場合**: `isMultiDrag = false` (dragStart で判定済み)。既存 single-drag path。

**drop 後の state**:
- `multiSelectedLids`: `[]` (BULK action が clear / SELECT_ENTRY が clear)
- `selectedLid`: dragged lid (SELECT_ENTRY で設定)

**invalid drop (drop 先属性なし)**: 既存 guard (`if (!targetStatus) return`, `if (!targetDate) return`) で no-op。multi-drag flag は `handleXxxDragEnd` でクリア。

### 8.4 Cleanup Semantics

| イベント | `isMultiDrag` | `kanbanDraggedLid` | `calendarDraggedLid` |
|---------|-------------|-------------------|---------------------|
| drop 成功 (Kanban) | `false` | `null` | `null` |
| drop 成功 (Calendar) | `false` | `null` | `null` |
| dragEnd (Kanban) | `false` | `null` | (変更なし) |
| dragEnd (Calendar) | `false` | (変更なし) | `null` |
| clearAllDragState (safety net) | `false` | `null` | `null` |

**cross-view 途中中断**: dragStart → ビュー切り替え → drop せずに dragEnd。`handleKanbanDragEnd` または `handleCalendarDragEnd` が発火し、flag をクリア。ただし **dragEnd は drag 元のビューで発火する** ため、正しく cleanup される。

### 8.5 推奨最小設計

**案 A（共通 `isMultiDrag` に統合）を採用**。

理由:
1. **diff が最小**: 変数 rename + drop 条件の guard 削除。ロジック追加なし
2. **概念が 1:1**: 「今の drag が multi-drag かどうか」は単一の bool で表現すべき。2 flag は C-1/C-2 の分離実装による一時的な状態であり、本来不要
3. **clearAllDragState の修正が自然**: 1 flag を追加するだけ
4. **案 B は設計負債**: OR 条件は「なぜ 2 つ flag があるのか」への回答を先送りするだけ
5. **案 C は過剰**: payload オブジェクト化は diff が大きすぎる

**不採用理由**:
- 案 B: cleanup の見落としリスクが倍。読みにくい。rename で済む問題を OR で解決するのは不適切
- 案 C: リファクタ規模が C-3 の scope を超える

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
