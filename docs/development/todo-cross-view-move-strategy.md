# Todo Cross-View Move Strategy

Issue #65 — DnD の cross-view 展開に向けた設計固定と境界整理。

## 1. Background

#60–#64 で Todo の3ビューが成立し、各ビュー内の DnD が機能している。

| Issue | View     | DnD で変えるもの | 更新経路             |
|-------|----------|-----------------|---------------------|
| #63   | Kanban   | `todo.status`   | `QUICK_UPDATE_ENTRY` |
| #64   | Calendar | `todo.date`     | `QUICK_UPDATE_ENTRY` |

Detail view は単票編集であり、DnD の対象ではない。

次段で cross-view DnD（例: Kanban card → Calendar cell）を検討するにあたり、
まず現行の DnD 系統を棚卸しし、設計方針を固定する。

## 2. Current DnD Systems

### 2.1 Sidebar Tree DnD

ツリー構造内の entry を folder 間で移動する。

| 項目            | 値                                       |
|----------------|------------------------------------------|
| Drag source    | `[data-pkc-draggable]` on tree item      |
| Drop target    | `[data-pkc-drop-target]` on folder / root |
| State variable | `draggedLid`                              |
| Handler prefix | `handleDrag*`                             |
| Update action  | `DELETE_RELATION` + `CREATE_RELATION`     |
| Scope          | Structural relation (parent-child)        |

更新対象: `container.relations`（structural kind）。
entry の body は変えない。

### 2.2 Kanban DnD

Kanban column 間で card を移動し、`todo.status` を変える。

| 項目            | 値                                            |
|----------------|-----------------------------------------------|
| Drag source    | `[data-pkc-kanban-draggable]` on card         |
| Drop target    | `[data-pkc-kanban-drop-target]` on column list |
| State variable | `kanbanDraggedLid`                             |
| Handler prefix | `handleKanbanDrag*`                            |
| Update action  | `QUICK_UPDATE_ENTRY`                           |
| Scope          | `todo.status` field in entry body              |

Same-status drop は no-op。
Drop 後に `SELECT_ENTRY` で選択同期。

### 2.3 Calendar DnD

Calendar の日セル間で todo item を移動し、`todo.date` を変える。

| 項目            | 値                                            |
|----------------|-----------------------------------------------|
| Drag source    | `[data-pkc-calendar-draggable]` on todo item  |
| Drop target    | `[data-pkc-calendar-drop-target]` on day cell  |
| State variable | `calendarDraggedLid`                           |
| Handler prefix | `handleCalendarDrag*`                          |
| Update action  | `QUICK_UPDATE_ENTRY`                           |
| Scope          | `todo.date` field in entry body                |

Same-date drop は no-op。
Drop 後に `SELECT_ENTRY` で選択同期。

### 2.4 File Drop (sidebar)

外部ファイルを sidebar にドロップして attachment entry を作る。
entry DnD とは独立のシステム（`e.dataTransfer.types.includes('Files')` で判別）。
本ドキュメントのスコープ外。

## 3. Drop Target Responsibility

各 drop target は **単一の責務** を持つ。

| Drop target              | 決めるもの      | 変えるフィールド         |
|-------------------------|----------------|------------------------|
| Sidebar folder / root    | 所属 (parent)  | `relations` (structural) |
| Kanban column list       | Status         | `todo.status`           |
| Calendar day cell        | Date           | `todo.date`             |

これは意図的な分離であり、ひとつの drop target が複数フィールドを変えることはない。

## 4. Drag Payload Strategy

### 4.1 Current Payload

現在の drag payload は **lid のみ** である。

```
dataTransfer.setData('text/plain', lid)
```

各 handler は自分用の `*DraggedLid` state で drag 中の lid を保持し、
drop target の attribute から target value（status / date / folder lid）を読み取る。

### 4.2 Cross-View で追加が必要な情報

将来 cross-view DnD を実装する場合、drop handler は
「この drag はどの view から来たのか」を知る必要がある。

候補:

| 情報           | 現在 | Cross-view で必要か | 方法候補                              |
|---------------|------|--------------------|-----------------------------------------|
| `lid`         | ✅   | ✅                 | `dataTransfer` + state variable         |
| Source view   | ❌   | ⚠️ maybe          | `dataTransfer` MIME type or state       |
| Drag kind     | ❌   | ❌ not yet         | 必要になるまで追加しない                   |

**現時点の方針**: lid のみで十分。

理由:
- Drop target の attribute がすでに「何をするか」を規定している
- Source view を知らなくても、drop target が自分の責務を果たせる
- Kanban column に drop されたら status を変える。Calendar cell に drop されたら date を変える。
  source が Kanban か Calendar かは関係ない

Source view 情報が必要になるのは、「同一 drop target が source によって挙動を変える」
ケースだが、現設計ではそのケースは存在しない。

### 4.3 今は持たないもの

- Entry archetype (todo 以外を drag する場合に必要になるが、現在は todo only)
- Multi-select payload (複数 lid)
- Serialized body snapshot

これらは必要が生じたときに追加する。

## 5. State Separation Policy

### 5.1 現状

```typescript
let draggedLid: string | null = null;          // sidebar
let kanbanDraggedLid: string | null = null;     // kanban
let calendarDraggedLid: string | null = null;   // calendar
```

3つの独立した state variable が存在する。

### 5.2 なぜ今は統合しないか

1. **スコープが異なる**: sidebar は relation 操作、kanban/calendar は body 更新。同じ変数に押し込むと、handler 内で分岐が必要になり複雑化する。

2. **Handler の分離が前提**: 各 handler は `closest('[data-pkc-*-draggable]')` で自分用の drag source のみを検出する。他系統の drag が進行中でも干渉しない。

3. **Premature abstraction のリスク**: 統合するには抽象型（`DragContext { lid, source, kind }` 等）が必要になる。現時点では3系統しかなく、各系統の handler は10行程度で完結している。抽象化のコストが利益を上回る。

4. **テスト容易性**: 分離されている方が、各系統を独立にテストしやすい。

### 5.3 統合してよい条件

以下の **すべて** が満たされた場合に統合を検討する:

- Cross-view DnD が本実装され、ひとつの drag が複数の drop target 種に落ちうる
- 統合しないと、同じ lid を複数の state variable にセットする必要が出る
- Handler の分岐量が、現在の分離コストを上回る

それまでは **分離を維持** する。

## 6. Cross-View Move: Candidate Use Cases

### 6.1 Kanban → Calendar

**ユースケース**: Kanban の open card を Calendar の日セルにドロップして date を付与。

- 更新対象: `todo.date` (Calendar cell が決める)
- `todo.status` は変えない（drop target が Kanban column ではないため）
- 日付なし Todo に date を付与する唯一の DnD 手段になりうる

**難易度**: 低。Kanban card に `data-pkc-lid` があり、Calendar cell に `data-pkc-date` がある。
Drop handler が lid から entry を取得し、date を更新するだけ。

### 6.2 Calendar → Kanban

**ユースケース**: Calendar の todo item を Kanban column にドロップして status を変更。

- 更新対象: `todo.status` (Kanban column が決める)
- `todo.date` は変えない

**難易度**: 低。同上のロジックで対称。

### 6.3 Status と date の同時更新

**ユースケース**: ある todo の status と date を同時に変えたい。

**方針**: DnD では単一フィールドの更新に留める。
同時更新は Detail view の編集か、2回の DnD で行う。

理由:
- Drop target はひとつしかないため、どの drop target に落としたかで更新対象が決まる
- ひとつの gesture で2フィールドを変えると、undo/redo の粒度が崩れる
- ユーザーの意図が曖昧になる

### 6.4 Same-view move との違い

| 項目           | Same-view                | Cross-view               |
|---------------|--------------------------|--------------------------|
| Drag source   | View 内の item           | 別 view の item           |
| 更新フィールド | View の軸 (status/date)  | Drop target view の軸     |
| State 管理    | 単一系統                  | Source 系統 or 統合        |
| UI feedback   | Source view 内で完結      | 両 view の再描画が必要     |

## 7. Out of Scope

以下は本 Issue および当面の cross-view 実装で対象外とする。

| 項目                         | 理由                                         |
|-----------------------------|----------------------------------------------|
| Month-crossing auto-nav     | Calendar nav と DnD の連携が必要。独立 Issue で扱う |
| Touch / pointer events      | HTML5 DnD と別 API。独立 Issue で扱う            |
| Multi-item DnD              | 複数選択の仕組みが未整備                         |
| Cross-view 同時多属性更新     | §6.3 の通り。DnD は単一フィールド更新に限定          |
| 汎用 DragManager 導入        | Premature abstraction。§5.3 の条件を満たすまで不要  |
| Sidebar DnD の統合改修        | Structural relation 操作は body 更新と異質          |
| Date removal via DnD        | 「日付なし」への drop target が存在しない            |
| Kanban column reorder        | Columns are fixed (open / done)                 |

## 8. Recommended Implementation Order

### Phase 1: Kanban → Calendar (Issue #66 — 実装済み)

Kanban card を Calendar day cell に drop して `todo.date` を付与する。

**実現方式: drag-over-tab view switch**

Kanban と Calendar は排他的にセンターペインに表示されるため、
drag 中に非 active な view mode タブにホバーすると 600ms 後にビュー切替が発生する。

```
Kanban card を drag 開始
  → Calendar タブにホバー (600ms)
    → SET_VIEW_MODE 'calendar' 発火 → Calendar 再描画
      → Calendar day cell に drop
        → kanbanDraggedLid から lid 解決
          → parseTodoBody → date 更新 → QUICK_UPDATE_ENTRY
            → SELECT_ENTRY
```

**実装詳細**:
- View mode button に `data-pkc-view-switch` 属性を追加 (非 active のみ)
- `handleViewSwitchDragEnter`: 600ms timer で `SET_VIEW_MODE` dispatch
- `handleCalendarDragOver/Drop`: `kanbanDraggedLid` non-null でも受入れ
- Drop 後に `kanbanDraggedLid = null` でクリーンアップ
- Status は変更しない (Calendar cell の責務は date のみ)

### Phase 2: Reverse Direction

Calendar item → Kanban column への drop で `todo.status` を変える。
Phase 1 の対称実装。

### Phase 3: UX Refinement

- Drag 中のカーソル位置に応じた view scroll
- Drop preview (ghost hint)
- Month-crossing support
- Empty state ヒント改善

### Phase 4: Beyond Todo

- 他 archetype の DnD（将来検討。現時点で設計不要）

## 9. User-Facing Current State

### 現在できること

1. **Kanban**: Todo card を open/done column 間で drag して status を変更
2. **Calendar**: Todo item を別日セルに drag して date を変更
3. **Kanban → Calendar**: Kanban card を drag → Calendar タブにホバー → day cell に drop して date を付与
4. **Sidebar**: Entry をフォルダ間で drag して所属を変更
5. **Detail**: 単票画面で任意フィールドを手動編集

### 現在できないこと

1. Calendar item → Kanban column への drag (status 変更)
2. 月をまたぐ drag
3. Touch / mobile での drag

### ユーザー利用手順: Kanban → Calendar

1. Kanban view で Todo card を drag 開始する
2. 上部の「Calendar」タブにカーソルを持っていく（ホバー）
3. 600ms 後に Calendar view に自動切替
4. 目的の日セルに card を drop する
5. `todo.date` がその日に設定される
6. Detail view で body を確認すると date フィールドが更新されている
7. Kanban view に戻ると日付表示が反映されている
8. Status は変わらない（open のまま / done のまま）
5. Kanban 上では status は変わらない（open のまま）
6. selectedLid が当該 Todo に更新される
