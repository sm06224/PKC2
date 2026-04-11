# Calendar/Kanban Multi-Select Phase 2-B: Bulk Date Change — Design

Status: COMPLETED
Created: 2026-04-11
Parent: `calendar-kanban-multi-select-phasing.md`

---

## §1 現状棚卸し

### 1.1 Todo の date フィールド

| 項目 | 値 |
|------|------|
| 型 | `string \| undefined` (YYYY-MM-DD) |
| 格納場所 | `entry.body` JSON 内 `{ date?: string }` |
| parse | `parseTodoBody()` → `date` が空文字/absent → `undefined` |
| serialize | `serializeTodoBody()` → `date` が falsy なら JSON に含めない |
| format | `formatTodoDate()` → locale-aware 表示 |

### 1.2 date 未設定の意味

- `date === undefined`: 期限なし。Calendar view には **表示されない**。
- `groupTodosByDate()` (`calendar-data.ts:24`): `if (!todo.date) continue;` — 日付なし todo はスキップ。
- Kanban view: date があれば card に表示、なければ非表示。date の有無で列の所属は変わらない。

### 1.3 Calendar view の date 利用

- `groupTodosByDate()` で date → `Record<string, CalendarTodo[]>` にグルーピング。
- 各日付セルに `data-pkc-date="YYYY-MM-DD"` + `data-pkc-calendar-drop-target` 属性。
- DnD drop: `data-pkc-date` を読み、`serializeTodoBody({ ...todo, date: targetDate })` → `QUICK_UPDATE_ENTRY`。
- **date のない todo は Calendar に出現しない**。日付を設定すると Calendar に出現する。

### 1.4 既存 single-entry date 編集導線

| 導線 | 場所 | 方法 |
|------|------|------|
| Edit mode | `todo-presenter.ts:83-89` | `<input type="date" data-pkc-field="todo-date">` |
| Calendar DnD | `action-binder.ts:1348-1359` | drop target の `data-pkc-date` を読んで QUICK_UPDATE_ENTRY |
| Entry window | `entry-window.ts:652` | 読み取り専用表示（edit mode で date input） |

Edit mode では `<input type="date">` が空値（`""`) を許容 → `collectBody()` で `date` が空文字なら undefined として serialize される。つまり **edit mode では date を「解除」できる**。

### 1.5 既存 bulk 操作との整合

| 項目 | BULK_SET_STATUS (Phase 2-A) | BULK_SET_DATE (設計中) |
|------|---------------------------|----------------------|
| 値のドメイン | `'open' \| 'done'` (2 値、空なし) | `string \| undefined` (日付 or 解除) |
| no-op 判定 | `todo.status === action.status` | `todo.date === action.date` |
| 空値 | なし | **あり** (date 解除) |
| UI | `<select>` 2 択 | `<input type="date">` + clear |
| multiSelectedLids クリア | する | する（一貫性） |

---

## §2 Bulk Date Change の意味論

### 2.1 操作定義

| 操作 | action payload | 適用 |
|------|---------------|------|
| 一括日付設定 | `{ type: 'BULK_SET_DATE', date: '2026-04-15' }` | 全対象 todo の `date` を指定値に上書き |
| 一括日付解除 | `{ type: 'BULK_SET_DATE', date: null }` | 全対象 todo の `date` を `undefined` に |

### 2.2 action type 定義

```typescript
| { type: 'BULK_SET_DATE'; date: string | null }
```

- `date: string` → YYYY-MM-DD 形式の日付を設定
- `date: null` → 日付を解除（`undefined` に）

### 2.3 適用ルール

| ルール | 定義 |
|--------|------|
| 対象 | `getAllSelected(state)` のうち `archetype === 'todo'` のみ |
| non-todo | スキップ（エラーにしない） |
| readonly | 不可 |
| no-op | `todo.date === action.date` (設定) または `!todo.date && action.date === null` (解除) の場合はスキップ |
| archived | date 変更は archived フラグに影響しない。archived todo も対象 |
| 日付フォーマット | `<input type="date">` のネイティブ出力 (YYYY-MM-DD) をそのまま使う。format validation は不要（ブラウザが保証） |

### 2.4 multiSelectedLids の扱い

**クリアする**。BULK_DELETE / BULK_MOVE / BULK_SET_STATUS と同一方針。

### 2.5 意味論の注意点

- **date 設定**: 既に date がある todo も上書きする。「日付あり → 別の日付」は自然な操作。
- **date 解除**: `date: null` で明示的に解除。「Calendar から消える」効果がある。
  - ユーザが date 解除を意図せず行うリスクがある → UI で明確に分離する（§3 参照）。
- **混在**: date あり/なしの todo が混在していても、全対象に同一操作を適用。

---

## §3 UI 導線案

### 3.1 候補比較

| 案 | 方法 | 利点 | 欠点 |
|----|------|------|------|
| A | `<input type="date">` + `[Clear date]` ボタン | 設定と解除を明確に分離、誤操作防止 | bar が長くなる |
| B | `<input type="date">` のみ（空値で clear） | 最小 UI | 「空にしたら消える」が直感的でない。ブラウザによっては空値送信が不安定 |
| C | compact menu (popover) | 見た目すっきり | 新規 UI コンポーネント追加、複雑 |

### 3.2 推奨案: A（date input + clear ボタン）

**理由**:

1. **最小で安全**: `<input type="date">` はブラウザネイティブ、追加 JS 不要。clear ボタンは `<button>` 1 つ。
2. **誤操作防止**: date 解除（Calendar から消える操作）を explicit な別アクションにする。`<input type="date">` の change だけでは解除が起きない。
3. **BULK_SET_STATUS と視覚的に一貫**: bar 内に `<select>` (status) と `<input type="date">` + `<button>` (date) が並ぶ。

### 3.3 具体的な UI 構造

```
[3 selected] [Delete] [Move to...▼] [Status...▼] [📅 ____-__-__] [✕ date] [Clear]
```

- `<input type="date">`: `data-pkc-action="bulk-set-date"`
  - change イベントで `BULK_SET_DATE { date: value }` を dispatch
- `<button>`: `data-pkc-action="bulk-clear-date"`
  - click イベントで `BULK_SET_DATE { date: null }` を dispatch
  - label: `✕` or `Clear date` (compact)

### 3.4 条件付き表示

BULK_SET_STATUS と同一: `multiSelectedLids` 内に `archetype === 'todo'` が 1 件以上ある場合のみ表示。

---

## §4 Calendar との整合

### 4.1 date 設定後の Calendar 表示

- date 未設定 → `2026-04-15` に設定: Calendar の 4/15 セルに todo が出現する。
- date `2026-04-10` → `2026-04-15` に変更: 4/10 から消え、4/15 に移動する。
- **表示月外の日付**: 設定後 Calendar が当月を表示中なら、当月外の日付は見えない。Calendar のナビゲーションで確認可能。これは既存の single-entry DnD と同一挙動。

### 4.2 date 解除後の Calendar 表示

- date `2026-04-10` → 解除: Calendar から消える。
- Kanban には引き続き表示（date 非依存）。
- Sidebar にも引き続き表示。
- **解除は「Calendar から見えなくなる」操作** → UI で明確に分離する理由。

### 4.3 将来の multi-DnD (Phase 2-C) との矛盾

- Phase 2-C で Calendar セルへの multi-DnD を実装する場合、drop handler は `BULK_SET_DATE { date: targetDate }` を dispatch すればよい。
- Phase 2-B の `BULK_SET_DATE` action は multi-DnD の基盤になる。**矛盾しない**。
- むしろ Phase 2-B で action/reducer を先に作っておくことで、Phase 2-C は DnD handler の修正だけで済む。

### 4.4 Calendar の月表示と bulk date の関係

- Calendar は `state.calendarYear` / `state.calendarMonth` で表示月を決定。
- `BULK_SET_DATE` は表示月を変更しない。設定した日付が当月外なら、Calendar 上は変化なし（sidebar やナビゲーションで確認）。
- これは既存 DnD の挙動と一致。

---

## §5 リスク / 衝突分析

### 5.1 BULK_SET_STATUS パターンの再利用可否

**再利用可能**。以下の差分のみ:

| 差分 | BULK_SET_STATUS | BULK_SET_DATE |
|------|----------------|---------------|
| 値 | `action.status` | `action.date` |
| serialize | `{ ...todo, status }` | `{ ...todo, date: action.date ?? undefined }` |
| no-op 判定 | `todo.status === action.status` | `todo.date === action.date` or `(!todo.date && !action.date)` |

reducer のコード構造はほぼ同一。

### 5.2 reducer 肥大化リスク

- BULK_SET_STATUS (17 行) + BULK_SET_DATE (推定 18 行) = +35 行。
- 全 reducer ファイルに対して軽微。
- 2 つの bulk 操作が同一パターンを踏襲しているため、認知負荷は低い。
- **ただし Phase 2-C (multi-DnD) でさらに追加するなら、bulk helper の抽出を検討すべき**。

### 5.3 Shift+click 表示順問題と bulk date の関係

- Shift+click で storage-order 範囲選択 → bulk date change の組み合わせ。
- Calendar 上で非連続な日付のエントリが選択される可能性あり。
- **bulk date は「選択されているものに操作する」なので、選択方法の問題は別レイヤー**。
- 判定: Phase 2-D (表示順修正) に影響しない。

### 5.4 Calendar cell click と action bar の競合

- Calendar セルのクリック: 現在は内部の todo item (`data-pkc-action="select-entry"`) のクリックのみ。セル自体のクリックは何もしない。
- multi-action bar: サイドバー内。Calendar とは別領域。
- **競合なし**。

### 5.5 date format / timezone 問題

- `<input type="date">` の出力は YYYY-MM-DD（UTC ではなくローカル日付）。
- 既存の todo-body / calendar-data は全て YYYY-MM-DD 文字列を前提。
- timezone 変換なし（ローカル日付をそのまま保存）。
- **既存挙動と完全一致。問題なし**。

### 5.6 ブラウザ互換性

- `<input type="date">`: 主要ブラウザで十分サポート。Firefox/Chrome/Safari/Edge 全て OK。
- date picker UI はブラウザネイティブ。PKC2 は single-HTML app で最新ブラウザ前提。
- **問題なし**。

---

## §6 推奨 Slice

### 選択肢

| Slice | 内容 | 規模 | リスク |
|-------|------|------|--------|
| B-A | action bar からの一括 date 設定のみ（解除なし） | 最小 | 低 |
| B-B | date 設定 + 解除 | 中 | 低（clear ボタン追加） |
| B-C | Calendar view からの導線を含む（multi-DnD） | 大 | 中 |

### 推奨: B-B（date 設定 + 解除）

**理由**:

1. **date 設定のみでは不完全**: date 設定だけできて解除できない状態は UX 上不自然。一度設定したら single-entry 編集でしか外せない、は不便。
2. **追加コストが小さい**: clear ボタンは `<button>` 1 つ + action-binder handler 1 行。B-A と B-B の差はボタン追加のみ。
3. **B-C は別パラダイム**: multi-DnD は DnD handler の大幅改修が必要で、Phase 2-C に分離済み。B-B は action bar のみで完結。

**B-A を後回しにする理由**: 設定だけの中途半端な状態を避ける。
**B-C を後回しにする理由**: multi-DnD は Phase 2-C に分離済み。B-B の `BULK_SET_DATE` action が Phase 2-C の基盤になる。

### 実装時の具体的スコープ (B-B)

| # | 作業 | ファイル |
|---|------|---------|
| 1 | `BULK_SET_DATE` action type 追加 | `user-action.ts` |
| 2 | reducer case 追加 | `app-state.ts` |
| 3 | multi-action bar に `<input type="date">` + clear button 追加 | `renderer.ts` |
| 4 | `bulk-set-date` change handler + `bulk-clear-date` click handler 追加 | `action-binder.ts` |
| 5 | テスト: reducer (設定/解除/no-op/non-todo/readonly/archived) | `action-binder.test.ts` |
| 6 | テスト: renderer (表示条件/Calendar view 整合) | `renderer.test.ts` |

---

## §7 Phase 境界の再確認

```
Phase 2-A: Bulk Status Change     ← COMPLETED
Phase 2-B: Bulk Date Change       ← THIS (設計完了、実装待ち)
Phase 2-C: Multi-DnD              ← CANDIDATE (BULK_SET_DATE を基盤に)
Phase 2-D: SELECT_RANGE 表示順    ← CANDIDATE
```

Phase 2-B の `BULK_SET_DATE` action は Phase 2-C の前提条件。先に action/reducer を作っておくことで、Phase 2-C は DnD handler 側の修正のみで済む。
