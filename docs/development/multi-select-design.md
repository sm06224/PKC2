# Multi-Select Design

## Principle

- **`selectedLid`** = 詳細表示の anchor（single selection）。センターペインに表示されるエントリを決定する。
- **`multiSelectedLids`** = 操作対象集合（multi selection）。一括削除・移動の対象。

この2つは独立した概念であり、`selectedLid` は常に1つ（または null）、`multiSelectedLids` は0個以上。

## 操作仕様

| 操作 | アクション | 動作 |
|------|-----------|------|
| 通常クリック | `SELECT_ENTRY` | `selectedLid` を更新、`multiSelectedLids` をクリア |
| Ctrl+click (Mac: Cmd+click) | `TOGGLE_MULTI_SELECT` | クリック先を `multiSelectedLids` にトグル追加/削除。初回は現在の `selectedLid` も自動的に含める。`selectedLid` はクリック先に移動。 |
| Shift+click | `SELECT_RANGE` | `selectedLid`（anchor）からクリック先まで、`container.entries` 配列上の連続範囲を `multiSelectedLids` に設定。`selectedLid` はクリック先に移動。 |

## 一括操作

| アクション | 動作 |
|-----------|------|
| `BULK_DELETE` | `getAllSelected(state)` の全エントリを順に snapshot → remove。`selectedLid` = null、`multiSelectedLids` = [] に戻す。 |
| `BULK_MOVE_TO_FOLDER` | 既存の structural 親リレーション削除 → 新規 structural リレーション作成。`multiSelectedLids` をクリア。 |
| `BULK_MOVE_TO_ROOT` | 既存の structural 親リレーション削除のみ。`multiSelectedLids` をクリア。 |
| `CLEAR_MULTI_SELECT` | `multiSelectedLids` = [] にリセット。`selectedLid` は変更しない。 |

## `getAllSelected()` ヘルパー

```typescript
export function getAllSelected(state: AppState): string[] {
  const set = new Set(state.multiSelectedLids);
  if (state.selectedLid) set.add(state.selectedLid);
  return Array.from(set);
}
```

`selectedLid` と `multiSelectedLids` の和集合を返す。

## UI 表現

- `data-pkc-selected="true"` — primary selection（従来通り、accent 背景）
- `data-pkc-multi-selected="true"` — multi selection（半透明 accent + border）
- 選択バー（`[data-pkc-region="multi-action-bar"]`）— `multiSelectedLids.length > 0` かつ非readonly時に表示

## 既知の制限（将来改善候補）

- Shift+click の範囲は `container.entries` 配列のインデックスベース。フィルタ適用時やツリー表示時、表示順と配列順がずれる可能性がある。
- Calendar / Kanban ビューでは multi-select 未対応（サイドバーリストのみ）。
- ソート変更時に `multiSelectedLids` はクリアされない（明示的に Clear が必要）。
