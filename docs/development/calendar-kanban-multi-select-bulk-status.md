# Calendar/Kanban Multi-Select Phase 2-A: Bulk Status Change

Status: COMPLETED
Created: 2026-04-11
Parent: `calendar-kanban-multi-select-phasing.md`

---

## §1 スコープ

### 今回やること

- `multiSelectedLids` に含まれる **todo エントリ**に対して status を一括変更する
- 既存の multi-action bar に最小限の bulk status UI を追加する
- Kanban / Calendar / Detail どのビューでも一貫して使える
- 既存の `QUICK_UPDATE_ENTRY` を内部で再利用する

### 今回やらないこと

- bulk date change
- multi-DnD（ドラッグで複数エントリを移動）
- Shift+click 表示順最適化
- bulk action bar のセンターペイン配置
- undo / history

---

## §2 Source of Truth

- 各 todo の status は `entry.body` 内の JSON `{ status: 'open' | 'done' }` に格納される
- bulk status change は対象エントリそれぞれに `QUICK_UPDATE_ENTRY` を dispatch する
- 中間的な bulk 専用 state は作らない
- 各 entry に revision snapshot が作成される（既存の QUICK_UPDATE_ENTRY 動作）

---

## §3 操作導線

### UI 配置

既存の multi-action bar（サイドバー内）に **status select** を追加する。

```
[3 selected] [Delete] [Move to...▼] [Status...▼] [Clear]
```

- `<select>` 要素: `data-pkc-action="bulk-set-status"`
- option: `Status...` (placeholder, disabled), `Open`, `Done`
- `multiSelectedLids` に todo が 1 件以上含まれる場合のみ表示

### 条件付き表示

multi-action bar 自体は `multiSelectedLids.length > 0 && !readonly` で表示される（既存）。
bulk status select は追加条件として `multiSelectedLids` 内に **todo archetype が 1 件以上** ある場合のみ render する。

---

## §4 適用ルール

| ルール | 定義 |
|--------|------|
| 対象 | `getAllSelected(state)` のうち `archetype === 'todo'` のエントリのみ |
| non-todo | スキップ（エラーにしない） |
| readonly | 不可（multi-action bar 自体が非表示） |
| status 不変 | 既に同じ status のエントリは no-op（QUICK_UPDATE_ENTRY を呼ばない） |
| archived | status 変更は archived フラグに影響しない。archived todo も status 変更可能 |

---

## §5 操作順序

1. ユーザが複数エントリを Ctrl+click で選択
2. multi-action bar の `Status...` select から `Open` or `Done` を選択
3. 選択内の todo エントリに対して status を一括反映
4. **`multiSelectedLids` はクリアする**（既存 BULK_DELETE / BULK_MOVE と同一方針）
5. UI が再描画される

### クリアの根拠

BULK_DELETE と BULK_MOVE_TO_FOLDER はいずれも `multiSelectedLids: []` にクリアする。
bulk status change も同一パターンに従い一貫性を保つ。

---

## §6 実装方針

### reducer

新しい action `BULK_SET_STATUS` を追加する。

```typescript
| { type: 'BULK_SET_STATUS'; status: 'open' | 'done' }
```

reducer 内で `getAllSelected(state)` を走査し、todo エントリのみ対象に:
1. `parseTodoBody(entry.body)` で現在の status を取得
2. status が異なる場合のみ `snapshotEntry` + `updateEntry` を適用
3. 完了後 `multiSelectedLids: []` にクリア

### action-binder

`handleChange` 内に `bulk-set-status` ハンドラを追加。
`<select>` の `change` イベントで status 値を取得し dispatch。

### renderer

multi-action bar 内に `<select>` を追加。Delete ボタンと Clear ボタンの間に配置。

---

## §7 Phase 境界

- これは Phase 2-A であり、Phase 2 全体ではない
- Phase 2 残項目: bulk date change (2-B)、multi-DnD (2-C)、SELECT_RANGE 表示順修正 (2-D)
- multi-DnD（Kanban 列への複数ドロップ）は Phase 2-C で別途設計する
