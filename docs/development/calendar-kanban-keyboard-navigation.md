# Calendar / Kanban Keyboard Navigation — Design Document

Status: CANDIDATE
Created: 2026-04-11

---

## 1. Summary

### なぜ必要か

sidebar keyboard navigation (Phase 1–6) の完成により、sidebar 内の操作は
Arrow keys + Enter で完結する。しかし Calendar / Kanban ビューは mouse-only で、
keyboard では entry 選択すらできない。

### 何を解決するか

Calendar / Kanban ビューでのキーボードによる：
- entry 間のナビゲーション（Arrow keys）
- entry の選択・編集開始（Enter）

sidebar と Calendar/Kanban は **別のナビゲーション空間** であり、
同じ Arrow key に対して **異なる移動ルール** が必要。

---

## 2. Current State

### 現在 keyboard でできないこと

| View | できないこと |
|------|------------|
| Calendar | Arrow で日付セル間を移動できない |
| Calendar | 同じ日付セル内の複数 entry を選択できない |
| Kanban | Arrow で列間・列内を移動できない |
| 両方 | keyboard で entry を選択して Enter で編集開始はできる（sidebar 経由のみ） |

### Sidebar との差

| 項目 | Sidebar | Calendar | Kanban |
|------|---------|----------|--------|
| 構造 | 1D list (tree) | 2D grid (7×5-6) | 2列 × N行 |
| Arrow Up/Down | 前後移動 | 週移動（行移動） | 列内移動 |
| Arrow Left/Right | tree 操作 | 日移動（列移動） | 列間移動 |
| 選択単位 | entry | entry（日付セル内） | entry（card） |
| DOM selector | `[data-pkc-region="sidebar"]` | `[data-pkc-region="calendar-view"]` | `[data-pkc-region="kanban-view"]` |

---

## 3. Navigation Model

### 核心的な問い: フォーカスは sidebar か center pane か？

現在の Arrow Up/Down は **常に sidebar を操作する**。
Calendar/Kanban keyboard を追加する場合、2 つの方式がある：

#### 方式 A: 暗黙 view dispatch

`viewMode` に応じて Arrow の意味を自動切り替え。
- `viewMode === 'detail'` → sidebar navigation（現行通り）
- `viewMode === 'calendar'` → calendar grid navigation
- `viewMode === 'kanban'` → kanban navigation

**利点**: 追加 state 不要。シンプル。
**欠点**: sidebar が常時表示なのに Arrow で操作不能になる。
sidebar と center pane を行き来する手段がない。

#### 方式 B: focus region + Tab/Escape 切り替え

新概念 `focusRegion: 'sidebar' | 'center'` を導入。
- `focusRegion === 'sidebar'` → Arrow は sidebar（現行通り）
- `focusRegion === 'center'` → Arrow は viewMode に応じた center pane navigation

**切り替え手段**:
- Tab で sidebar ↔ center を切り替え
- Enter で center pane の entry を編集開始
- Escape で center → sidebar にフォーカスを戻す

**利点**: sidebar と center pane を明示的に使い分けられる。
**欠点**: state 拡張が必要。UX の学習コストが増える。

#### 方式 C: view mode 限定 + sidebar は常時

detail mode では sidebar navigation のみ（現行通り）。
calendar/kanban mode では:
- Arrow は **center pane を操作**
- sidebar navigation は一時的に無効化

**利点**: 方式 A のシンプルさを保ちつつ、detail mode は不変。
**欠点**: calendar/kanban で sidebar 操作不能。
ただし calendar/kanban では sidebar の entry をクリックで選択可能。

#### 推奨: 方式 C

理由:
1. calendar/kanban 表示中は center pane が主操作対象。sidebar は補助。
2. state 拡張が最小（`focusRegion` 不要）。
3. detail mode の既存挙動を完全に保護できる。
4. 実装コストが最小。

方式 B は将来の拡張として検討可能だが、今の段階では過剰。

---

### Calendar Navigation

**Grid 構造**: 7 列 × 5-6 行（月により可変）。各セルは日付。

| Key | Action | 詳細 |
|-----|--------|------|
| Arrow Left | 前日 | 同一セル内の entry → 前日の最後の entry |
| Arrow Right | 翌日 | 同一セル内の entry → 翌日の最初の entry |
| Arrow Up | 前週（同曜日） | 7 日前の同位置 entry |
| Arrow Down | 翌週（同曜日） | 7 日後の同位置 entry |
| Enter | 編集開始 | 既存 BEGIN_EDIT |

#### 月またぎ

- Arrow で前月/翌月の日付に到達した場合:
  - **Phase 1 では no-op** — 月表示範囲内でのみ移動
  - 将来: `CALENDAR_NAVIGATE` で自動月移動 → Phase 2 以降で検討

#### 空セルの扱い

- entry がない日付セルに到達した場合:
  - **スキップして次の entry がある日付セルへ移動**
  - 全方向に entry がない場合: no-op

#### 同一日付セル内の複数 entry

- 1 つの日付セルに複数 todo がある場合:
  - Phase 1 では **セル内の最初の entry を選択**
  - セル内での上下移動は Phase 2 以降で検討

---

### Kanban Navigation

**構造**: 2 列（open / done）× N 行。各列は status。

| Key | Action | 詳細 |
|-----|--------|------|
| Arrow Up | 列内で上の card | 先頭なら no-op |
| Arrow Down | 列内で下の card | 末尾なら no-op |
| Arrow Left | 左の列の同位置 card | 最左列なら no-op |
| Arrow Right | 右の列の同位置 card | 最右列なら no-op |
| Enter | 編集開始 | 既存 BEGIN_EDIT |

#### 列境界の扱い

- 列間移動時の「同位置」:
  - 移動先列の同じ index の card。index が範囲外なら末尾の card。
  - 移動先列が空なら no-op。

#### KANBAN_COLUMNS 順

列順は `KANBAN_COLUMNS` 定義順: `['open', 'done']`。
Arrow Left → open 方向、Arrow Right → done 方向。

---

## 4. Focus / Selection Model

### selectedLid のみで足りるか？

**結論: selectedLid のみで足りる。**

理由:
- Calendar / Kanban の entry は `data-pkc-lid` + `data-pkc-selected` で
  既に選択状態を表示している。
- `SELECT_ENTRY` で `selectedLid` を更新すれば、renderer が
  正しい view で highlight する。
- sidebar と center pane で同じ entry が同時に highlight される
  （現在の click 選択と同じ挙動）。

### cursor 概念は必要か？

**Phase 1 では不要。**

Calendar で空セルに「カーソル」を置く UX は Phase 1 のスコープ外。
entry がある場所だけを移動する限り、`selectedLid` で十分。

将来 Calendar で空日付にカーソルを置いて新規 todo 作成を
サポートする場合、`calendarCursor: string | null` (date key) が
必要になる可能性がある。これは Phase 3 以降の検討事項。

### state 拡張の要否

方式 C を採用する場合、**新規 state は不要**。
`viewMode` の値で Arrow handler 内の分岐を決定できる。

---

## 5. Multi-select Interaction

### Shift+Arrow を扱うか？

**Phase 1 ではスコープ外。**

理由:
- sidebar の Shift+Arrow range selection 自体が未実装（Phase 2-D 設計議論が先）
- Calendar/Kanban の multi-select は Ctrl+click で既に動作する
- Arrow navigation の基盤を先に固めてから multi-select を検討すべき

### 将来的な設計方針

- Kanban: Shift+Up/Down で同一列内の range select
- Calendar: Shift+Arrow で隣接日の entry を range に追加
- いずれも `multiSelectedLids` を拡張するだけで reducer 変更は不要の見込み

---

## 6. DnD Interaction

### Keyboard で status/date 変更するか？

**Phase 1 では navigation のみ。status/date 変更は Phase 2 以降。**

理由:
- DnD による status/date 変更は既存の mouse 操作で動作する
- keyboard での status 変更は Kanban で `TOGGLE_TODO_STATUS` を
  shortcut key (e.g., Space) に割り当てる方が自然
- keyboard での date 変更は Calendar で Arrow + modifier で日付移動
  するモデルが考えられるが、設計が複雑

### 将来的な設計方針

| 操作 | View | 手段案 |
|------|------|--------|
| status toggle | Kanban | Space key |
| date move | Calendar | Ctrl+Arrow (DnD 相当) |
| column move | Kanban | Ctrl+Left/Right (DnD 相当) |

これらは Phase 2 で modifier key による操作として設計する。

---

## 7. Architecture Impact

### Reducer への影響

**方式 C の場合: reducer 変更なし。**

- `SELECT_ENTRY` は既存
- `BEGIN_EDIT` は既存
- view mode は既存の `viewMode` で判定
- 新しい action は不要

### Adapter で閉じるか

**はい、adapter/ui/action-binder.ts 内で完結。**

実装イメージ:
```
handleKeydown:
  ...
  3. Arrow Up/Down:
     if (viewMode === 'calendar') → calendar navigation
     if (viewMode === 'kanban')   → kanban navigation
     else → sidebar navigation (現行)
  4. Arrow Left/Right:
     if (viewMode === 'calendar') → calendar day navigation
     if (viewMode === 'kanban')   → kanban column navigation
     else → tree collapse/expand/parent (現行)
  ...
```

Arrow handler の冒頭で `viewMode` を分岐するだけ。
既存の sidebar handler は `viewMode === 'detail'`（および default）で
完全に不変。

### 新 state の必要性

**Phase 1 では不要。** `viewMode` + `selectedLid` で足りる。

将来の Phase で以下が検討対象:
- `focusRegion` (方式 B 採用時)
- `calendarCursor` (空セルカーソル)
- `kanbanFocusColumn` (列フォーカス)

---

## 8. Risks

### UX 混乱

| リスク | 影響 | 緩和策 |
|--------|------|--------|
| Calendar/Kanban で Arrow が sidebar を操作しなくなる | 中 | view 切り替え時に sidebar click は引き続き有効 |
| Calendar と Kanban で Arrow の意味が異なる | 低 | 各 view の構造に自然に対応しているため |
| detail mode に戻したとき sidebar navigation が復帰しない | 低 | 方式 C では detail mode = 現行動作なので問題なし |

### State 複雑化

| リスク | 影響 | 緩和策 |
|--------|------|--------|
| viewMode 分岐が handler を複雑にする | 中 | view ごとに helper 関数を分離 |
| 将来の focusRegion 導入で state が膨張 | 低 | Phase 1 では導入しない |

### View ごとの差異

| リスク | 影響 | 緩和策 |
|--------|------|--------|
| Calendar の grid navigation で DOM 依存が発生 | 中 | getMonthGrid() + groupTodosByDate() で state ベース解決 |
| Kanban の列順が KANBAN_COLUMNS に依存 | 低 | 定数なので安定 |
| Calendar の月またぎ対応がスコープ膨張を招く | 中 | Phase 1 では月内限定 |

---

## 9. Phasing Plan

### Phase 1: Navigation Only (推奨初手)

**スコープ**:
- Kanban: Arrow Up/Down (列内移動) + Arrow Left/Right (列間移動)
- Calendar: Arrow Up/Down (週移動) + Arrow Left/Right (日移動)
- Enter: 既存 BEGIN_EDIT 再利用
- viewMode 分岐で handler を切り替え
- reducer 変更なし

**理由**: Kanban は 2 列 × N 行で構造が単純。Calendar より先に着手が安全。

**推奨実装順**:
1. Kanban Arrow Up/Down (列内)
2. Kanban Arrow Left/Right (列間)
3. Calendar Arrow Left/Right (日移動)
4. Calendar Arrow Up/Down (週移動)

### Phase 2: Editing + Action Integration

- Space で status toggle (Kanban)
- Ctrl+Arrow で date/status 移動 (Calendar/Kanban DnD 相当)
- Enter で BEGIN_EDIT (Phase 1 で対応済みのはず)

### Phase 3: Multi-select + Advanced

- Shift+Arrow range selection
- Calendar 月またぎ navigation
- 空セルカーソル + 新規 todo 作成
- focusRegion 導入検討

---

## 10. Non-goals

以下は本設計の対象外:

| 項目 | 理由 |
|------|------|
| Sidebar keyboard の変更 | Phase 1–6 で完成済み。触らない |
| Reducer / AppState の拡張 | Phase 1 では不要 |
| Renderer の構造変更 | 既存 DOM 構造 + data-pkc-* 属性で十分 |
| Calendar 月またぎ自動遷移 | Phase 1 では月内限定 |
| Kanban 列追加 / カスタム列 | KANBAN_COLUMNS は固定 |
| 空セルカーソル | entry がある場所のみ移動 |
| Shift+Arrow multi-select | Phase 3 以降 |
| WAI-ARIA grid/listbox 完全対応 | 将来検討 |
| focusRegion state 導入 | 方式 B は将来検討。Phase 1 は方式 C |

---

## Appendix A: Kanban Phase 1 — Implementation-Ready Spec

Status: READY FOR IMPLEMENTATION

### A-1. 動作定義（曖昧さなし）

#### Arrow Up（列内上移動）

1. `viewMode !== 'kanban'` → sidebar handler にフォールスルー（現行不変）
2. `selectedLid` が kanban 上に可視でない場合 → open 列の先頭 card を選択
3. 現在の card が列の先頭 → no-op
4. それ以外 → 同一列の 1 つ上の card を選択

#### Arrow Down（列内下移動）

1. `viewMode !== 'kanban'` → sidebar handler にフォールスルー
2. `selectedLid` が kanban 上に可視でない場合 → open 列の先頭 card を選択
3. 現在の card が列の末尾 → no-op
4. それ以外 → 同一列の 1 つ下の card を選択

#### Arrow Left（左列移動）

1. `viewMode !== 'kanban'` → tree handler にフォールスルー（現行不変）
2. `selectedLid` なし or kanban に可視でない → no-op
3. 現在の card が最左列（open） → no-op
4. 移動先列が空 → no-op
5. 移動先列の card 数 > 現在 index → 同 index の card を選択
6. 移動先列の card 数 ≤ 現在 index → 末尾の card を選択

#### Arrow Right（右列移動）

Arrow Left の鏡像。open → done 方向。

#### Enter

既存 BEGIN_EDIT をそのまま利用。viewMode による特別処理なし。
（Enter handler は viewMode 分岐の外にあるため、変更不要。）

#### selectedLid が kanban に可視でない場合

以下のケースを統合:
- `selectedLid === null`
- `selectedLid` が todo でない（text, folder 等）
- `selectedLid` が archived todo（kanban から除外済み）

これらは全て **「kanban 上に可視でない」** として扱い、
Arrow Up/Down で open 列の先頭 card を選択する。
Arrow Left/Right では no-op。

### A-2. Source of Truth

**DOM ベース**（sidebar Arrow Up/Down と同一方式）。

理由:
1. sidebar handler は `sidebar.querySelectorAll('[data-pkc-action="select-entry"][data-pkc-lid]')` で
   可視 entry 順を DOM から取得している。Kanban も同じパターンを踏襲する。
2. renderer が `groupTodosByStatus()` の結果順に card を生成するため、
   DOM 順 = state 由来の順序が保証される。
3. 将来 sort/filter が追加されても DOM が正を反映する。

**具体的な DOM クエリ**:

```typescript
// 列ごとの card lid リスト取得
const kanban = root.querySelector('[data-pkc-region="kanban-view"]');
const columns = kanban.querySelectorAll('[data-pkc-kanban-drop-target]');
// columns[0] = open, columns[1] = done (KANBAN_COLUMNS 順)

// 列内の card lid 配列
const cards = column.querySelectorAll<HTMLElement>('[data-pkc-lid]');
const lids = Array.from(cards).map(el => el.getAttribute('data-pkc-lid')!);
```

**Stale DOM ガード**:
sidebar handler と同様に `containerLids` Set で検証する。

```typescript
const containerLids = new Set(state.container.entries.map(e => e.lid));
const lids = /* DOM query */.filter(lid => containerLids.has(lid));
```

### A-3. Focus / Selection Model

- **selectedLid のみ使用**。新 state 不要。
- **cursor / focusRegion は Phase 1 では導入しない。**
- `SELECT_ENTRY` dispatch で selectedLid を更新。
  sidebar と kanban で同じ entry が同時に highlight される（現行の click と同じ）。

### A-4. Guard Conditions

| Condition | Fires? | Reason |
|-----------|--------|--------|
| `viewMode !== 'kanban'` | NO | sidebar/tree handler にフォールスルー |
| `phase === 'editing'` | NO | 既存 editing guard |
| input / textarea / select focused | NO | form control guard |
| contenteditable focused | NO | 同上 |
| Ctrl / Meta + Arrow | NO | 修飾キー guard |
| Shift / Alt + Arrow | NO | Reserved |
| overlay / menu / picker open | NO | 既存 early return |
| readonly mode | YES | navigation は runtime UI state のみ |
| container が null | NO | container guard |

### A-5. Keydown Cascade（変更後）

```
handleKeydown:
  1. overlay / menu / autocomplete / import early return
  2. Escape cascade
  3. Arrow Up / Down:
     if (viewMode === 'kanban') → kanban column navigation  ← NEW
     else → sidebar navigation (現行不変)
  4. Arrow Left / Right:
     if (viewMode === 'kanban') → kanban cross-column navigation  ← NEW
     else → tree collapse/expand/parent/child (現行不変)
  5. Enter (begin edit) — viewMode 分岐なし、現行不変
  6. Ctrl+N (new entry) — 現行不変
```

viewMode 分岐は **各 Arrow handler の最初** に置く。
`viewMode === 'kanban'` のとき kanban 処理を行い return。
それ以外は既存 handler がそのまま動く。

### A-6. 実装変更箇所

| File | Change | Lines |
|------|--------|-------|
| `action-binder.ts` | Arrow Up/Down handler に kanban 分岐追加 | ~30 |
| `action-binder.ts` | Arrow Left/Right handler に kanban 分岐追加 | ~30 |
| `action-binder.test.ts` | Kanban keyboard テスト | ~200 |
| `INDEX.md` | Kanban Phase 1 status 追加 | ~5 |

**Reducer 変更: なし。** `SELECT_ENTRY` 既存。
**Renderer 変更: なし。** DOM 構造は既に十分。
**features 変更: なし。** `groupTodosByStatus` / `KANBAN_COLUMNS` 既存。

### A-7. テスト計画

#### Integration — Arrow Up/Down（列内移動）

| # | Test | Expect |
|---|------|--------|
| 1 | open 列先頭 card 選択中に Arrow Down | 2 番目の card 選択 |
| 2 | open 列末尾 card 選択中に Arrow Down | no-op（末尾） |
| 3 | open 列 2 番目の card 選択中に Arrow Up | 先頭 card 選択 |
| 4 | open 列先頭 card 選択中に Arrow Up | no-op（先頭） |
| 5 | done 列内で Up/Down | 列内移動（open と同様） |
| 6 | selectedLid が kanban に可視でない → Arrow Down | open 列先頭を選択 |

#### Integration — Arrow Left/Right（列間移動）

| # | Test | Expect |
|---|------|--------|
| 7 | done 列の card 選択中に Arrow Left | open 列の同 index card 選択 |
| 8 | open 列の card 選択中に Arrow Right | done 列の同 index card 選択 |
| 9 | open 列の card 選択中に Arrow Left | no-op（最左列） |
| 10 | done 列の card 選択中に Arrow Right | no-op（最右列） |
| 11 | done[2] 選択 → Arrow Left、open 列が 1 件のみ | open 列末尾（= 先頭）を選択 |
| 12 | Arrow Left/Right、移動先列が空 | no-op |

#### Guard

| # | Test | Expect |
|---|------|--------|
| 13 | viewMode !== 'kanban' で Arrow → sidebar handler が動く | sidebar 移動 |
| 14 | editing 中は発火しない | no dispatch |
| 15 | textarea focus 中は発火しない | no dispatch |
| 16 | Ctrl modifier 中は発火しない | no dispatch |
| 17 | readonly でも navigation は動く | 正常動作 |

#### Regression

| # | Test | Expect |
|---|------|--------|
| 18 | detail mode で sidebar Arrow Up/Down は不変 | 現行動作 |
| 19 | detail mode で Arrow Left/Right tree 操作は不変 | 現行動作 |
| 20 | Enter は viewMode によらず BEGIN_EDIT | 現行動作 |
| 21 | Escape cascade は不変 | 現行動作 |
| 22 | click 選択は kanban mode でも動作 | 現行動作 |
| 23 | multi-select Ctrl+click は壊れない | 現行動作 |

### A-8. 明確な非対象（Phase 1）

| 項目 | 理由 |
|------|------|
| Space で status toggle | Phase 2（DnD interaction） |
| Ctrl+Arrow で列間 status 移動 | Phase 2（DnD interaction） |
| Shift+Arrow range selection | Phase 3（multi-select） |
| Calendar keyboard navigation | 別 Phase（Kanban 完了後） |
| viewMode を跨ぐ keyboard navigation | 方式 C では viewMode 切替は mouse/shortcut |
| kanban 内での新規 entry 作成 | 既存 Ctrl+N で代替可能 |
| multi-select keyboard 拡張 | Phase 3 |

---

## Appendix B: DOM Structure Reference

### Calendar

```
[data-pkc-region="calendar-view"]
  .pkc-calendar-nav
    [data-pkc-action="calendar-prev"]
    [data-pkc-action="calendar-next"]
  .pkc-calendar-grid
    .pkc-calendar-cell[data-pkc-date="2026-04-11"]
      .pkc-calendar-todo-item[data-pkc-lid="xxx"][data-pkc-action="select-entry"]
```

### Kanban

```
[data-pkc-region="kanban-view"]
  .pkc-kanban-board
    .pkc-kanban-column[data-pkc-kanban-status="open"]
      .pkc-kanban-list[data-pkc-kanban-drop-target="open"]
        .pkc-kanban-card[data-pkc-lid="xxx"][data-pkc-action="select-entry"]
    .pkc-kanban-column[data-pkc-kanban-status="done"]
      .pkc-kanban-list[data-pkc-kanban-drop-target="done"]
        .pkc-kanban-card[data-pkc-lid="xxx"][data-pkc-action="select-entry"]
```
