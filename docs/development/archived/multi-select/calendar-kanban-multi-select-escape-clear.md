# Calendar/Kanban Multi-Select Phase 2-E: Escape で CLEAR_MULTI_SELECT

Status: COMPLETED
Created: 2026-04-11
Parent: `calendar-kanban-multi-select-phasing.md`

---

## A. Scope

### 今回やること

- `multiSelectedLids` が非空のとき、Escape キーで `CLEAR_MULTI_SELECT` を dispatch する
- Detail / Calendar / Kanban いずれのビューでも一貫して動作する
- `selectedLid` は **変更しない**（`CLEAR_MULTI_SELECT` reducer の既存動作: `selectedLid` 維持）
- readonly モードでも multi-select 解除を許可する（選択解除は参照操作であり、データ変更ではない）

### 今回やらないこと

- dialog / overlay の close 制御の再設計
- editing 中の Escape の再定義
- TEXTAREA / INPUT / SELECT / contenteditable のネイティブ Escape 意味変更
- `SELECT_RANGE` の表示順修正 (Phase 2-D)
- `selectedLid` の Escape 解除（既存の `DESELECT_ENTRY` が担当）
- Escape 長押し・反復挙動

---

## B. 発火条件

### 既存 Escape カスケード (action-binder.ts handleKeydown)

```
Escape pressed:
  1. isAssetPickerOpen()         → closeAssetPicker()        return
  2. isAssetAutocompleteOpen()   → closeAssetAutocomplete()  return
  3. isSlashMenuOpen()           → closeSlashMenu()          return
  4. shortcut help overlay open  → close                     return
  5. shell menu open             → close                     return
  6. importPreview               → CANCEL_IMPORT             (no return)
  7. phase === 'editing'         → CANCEL_EDIT               (else)
  8. selectedLid                 → DESELECT_ENTRY            (else)
  return
```

### 新規挿入位置

ステップ 6-8 の `else if` チェーン内、`DESELECT_ENTRY` の **直前** に挿入:

```
  6. importPreview               → CANCEL_IMPORT
  7. phase === 'editing'         → CANCEL_EDIT
  8. multiSelectedLids.length>0  → CLEAR_MULTI_SELECT        ← NEW
  9. selectedLid                 → DESELECT_ENTRY
```

### ガード条件

| 条件 | 通過するか | 理由 |
|------|-----------|------|
| phase === 'ready' | YES | ステップ 7 で editing は先にキャッチ |
| phase === 'editing' | NO | ステップ 7 で CANCEL_EDIT |
| overlay/menu open | NO | ステップ 1-5 で先にキャッチ |
| importPreview | NO | ステップ 6 で先にキャッチ |
| input/textarea/select にフォーカス | **不要** | ブラウザの Escape は input/textarea に対して特別な動作をしない（Esc は submit/blur しない）。`handleKeydown` は現行でも input focus 中に Escape を処理しており、新規ステップも既存パターンと一貫 |
| contenteditable にフォーカス | **不要** | PKC2 に contenteditable 要素はない |
| readonly mode | YES | 選択解除はデータ変更ではない |
| multiSelectedLids が空 | SKIP | ステップ 9 (DESELECT_ENTRY) にフォールスルー |

### input/textarea focus ガードが不要な根拠

既存の Escape カスケード（ステップ 6-8）は input/textarea focus を一切ガードしていない。これは意図的設計:

- `CANCEL_EDIT` (ステップ 7): editing phase で textarea にフォーカスがあっても発火する（編集キャンセルの正しい挙動）
- `DESELECT_ENTRY` (ステップ 8): ready phase で input (検索バー等) にフォーカスがあっても発火する
- Escape キーはブラウザの input/textarea に対して「入力確定」や「値クリア」等の副作用を持たない

`CLEAR_MULTI_SELECT` も同一パターンに従い、input/textarea focus ガードは追加しない。既存カスケードの一貫性を保つ。

---

## C. 効果

| 項目 | 変化 |
|------|------|
| `multiSelectedLids` | `[]` に (既存 reducer) |
| `selectedLid` | **変更なし** (既存 reducer: `{ ...state, multiSelectedLids: [] }`) |
| multi-action bar | 消える (`multiSelectedLids.length === 0` で非表示) |
| `data-pkc-multi-selected` 属性 | 消える (renderer が `multiSelectedLids.includes()` で付与) |
| 選択ハイライト (selectedLid) | 維持される |

### 操作フロー例

```
Ctrl+click で 3 件選択  →  multiSelectedLids=[a,b,c], selectedLid=c
                          action bar 表示、3 件ハイライト
Escape 1 回目          →  multiSelectedLids=[], selectedLid=c
                          action bar 消える、c のみハイライト
Escape 2 回目          →  DESELECT_ENTRY: selectedLid=null
                          全ハイライト消える
```

---

## D. 非対象

- `selectedLid` の Escape 解除: 既存 `DESELECT_ENTRY` (ステップ 9) が担当。Phase 2-E は multi-select 解除のみ
- undo: CLEAR_MULTI_SELECT に undo 機構はない
- Escape 長押し・反復: ブラウザの keydown repeat で連続発火するが、1 回目で `multiSelectedLids` が空になり、2 回目は `DESELECT_ENTRY` にフォールスルーする。これは自然な挙動
- アニメーション: 解除時のフェードアウト等は不要

---

## E. 実装スコープ

| # | ファイル | 変更内容 | 行数 |
|---|---------|---------|------|
| 1 | `action-binder.ts` | Escape カスケードに `CLEAR_MULTI_SELECT` 分岐追加 | +3 |
| 2 | テスト追加 | `action-binder.test.ts` | +60-80 |

**reducer 変更: なし** (`CLEAR_MULTI_SELECT` は実装済み)
**action type 変更: なし** (`CLEAR_MULTI_SELECT` は定義済み)
**renderer 変更: なし** (`multiSelectedLids` 変化で自動的に再描画)
