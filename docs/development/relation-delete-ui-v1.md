# Relation Delete UI v1

**Status**: implementation — 2026-04-20.
**Scope**: Backlinks Panel / Relations セクションの各 relation 行に **削除ボタン** を追加し、クリックで軽量 confirm → `DELETE_RELATION` dispatch を発火する。**relations-based relation のみ対象**。link-index / markdown-reference backlinks は触らない。

## 1. Explicit design decisions

### Q1. 削除コントロールの位置
各 `<li class="pkc-relation-item">` 内、**kind badge の直後**。
- peer link (`data-pkc-action="select-entry"`) とは**別要素**。クリック領域が分離され navigation と削除が混ざらない
- kind badge の後ろなので、行の意味（何を・どの kind で参照しているか）が先に読める

### Q2. ボタンの表記とスタイル
- **表記**: `×` (U+00D7 multiplication sign)。既存 tag-remove ボタンと同一
- **class**: `.pkc-relation-delete`（新規）。スタイルは `.pkc-tag-remove` と同系（muted、hover で浮かび上がる）
- **属性**: `data-pkc-action="delete-relation"`, `data-pkc-relation-id="<relationId>"`, `title="Delete relation"`
- **キーボード**: 通常の `<button>` なので Tab focus + Enter で起動可能

### Q3. 確認導線
**native `confirm()`** で "Delete this relation?" の 1 問。既存 delete パターン (`action-binder.ts:386`) と同様。

- **採用理由**: PKC2 に custom modal 確認システムは無く、全削除系で native confirm を既に使用。本 PR で独自実装を入れない
- **undo は v1 では実装しない**: relation の再作成は既存 create form で可能。履歴 tracking は設計が重く別 PR
- confirm 文言: `"Delete this relation?"` — 英語、既存文言スタイルに合わせる

### Q4. inbound / outbound の扱い
**両方とも削除可能**、同一挙動。
- inbound 行の `×` → その inbound relation を削除（他 entry が "from" の relation）
- outbound 行の `×` → その outbound relation を削除
- UI 文言は **「relation を削除」で統一**。「backlink を削除」とは呼ばない（relations-based の厳密化）

### Q5. readonly / viewOnly contexts
**readonly / viewOnlySource では削除ボタン自体を描画しない**。

- ゲート: `canEdit = state.phase === 'ready' && !state.readonly`（既存パターン）
- `canEdit === false` の時はボタン要素を DOM に出さない
- 万一 DOM を手動で叩いて dispatch しても、**reducer 側で `state.readonly` ブロック済** なので安全（二重防御）

### Q6. kind 別の protection
**v1 では全 kind 削除可能**（semantic / categorical / structural / temporal / provenance）。
- structural relation はフォルダメンバーシップ等で意味重要だが、削除を禁止する画面上の約束は現状存在しない
- 将来「folder structural relation の削除は folder-move action 経由」等のルール化余地はあるが、v1 スコープ外として全 kind を同一扱い

## 2. DOM 仕様

削除ボタン有効時（`canEdit === true`）の relation 行:

```html
<li class="pkc-relation-item" data-pkc-relation-id="r123">
  <span class="pkc-relation-peer" data-pkc-action="select-entry" data-pkc-lid="abc">Peer Title</span>
  <span class="pkc-relation-kind">semantic</span>
  <button class="pkc-relation-delete"
          data-pkc-action="delete-relation"
          data-pkc-relation-id="r123"
          title="Delete relation"
          aria-label="Delete relation">×</button>
</li>
```

readonly 時は `<button>` だけが消える。他要素（navigation link / kind badge）は不変。

## 3. 実装範囲

| 層 | ファイル | 変更 |
|----|---------|------|
| core | `src/core/action/user-action.ts` | 既存の `DELETE_RELATION` 再利用、変更なし |
| adapter/state | `src/adapter/state/app-state.ts` | 既存 reducer 再利用、変更なし |
| adapter/ui | `src/adapter/ui/renderer.ts` | `renderRelationGroup` に `canEdit` 引数追加、削除ボタン render |
| adapter/ui | `src/adapter/ui/action-binder.ts` | `handleClick` に `case 'delete-relation'` 追加（confirm → dispatch） |
| styles | `src/styles/base.css` | `.pkc-relation-delete` 追加（.pkc-tag-remove と同系） |
| tests | `tests/adapter/renderer.test.ts` | 削除ボタンが canEdit に応じて現れる/消える |
| tests | `tests/adapter/mutation-shell.test.ts` | クリック → 確認 → 削除の統合テスト |
| docs | 本文書 | spec |

**既存 `DELETE_RELATION` action / reducer は完全再利用**。core / features は無変更。

## 4. action-binder 仕様

新規 case（`handleClick` switch 内、`'remove-tag'` の直後）:

```ts
case 'delete-relation': {
  const relId = target.getAttribute('data-pkc-relation-id');
  if (!relId) break;
  if (!confirm('Delete this relation?')) break;
  dispatcher.dispatch({ type: 'DELETE_RELATION', id: relId });
  break;
}
```

- `confirm()` キャンセルで no-op
- relation id 不在（壊れた DOM）で no-op
- dispatch 後の再 render は既存 state listener が拾う

## 5. Terminology

**本 PR は relations-based relation の削除**。UI 文言 / tooltip / confirm dialog 全てで「relation」の語を使用し、**"backlink" 単独使用を避ける**（PR #53 / sidebar badge v1 と同じ方針）。

| 要素 | 文言 |
|------|------|
| ボタン tooltip / aria-label | `"Delete relation"` |
| confirm dialog | `"Delete this relation?"` |
| spec / doc / コメント | "relations-based relation" |
| link-index / markdown-reference backlinks | **本 PR は触らない** |

## 6. テスト観点

### renderer
- `canEdit === true` + relation 存在 → 各行に `.pkc-relation-delete` ボタン出現、`data-pkc-action="delete-relation"`, `data-pkc-relation-id` が正しい
- `canEdit === false` (readonly) → ボタン未描画
- relation 0 件 → empty state 維持、ボタンは当然ない
- inbound / outbound 両 group で同じ構造

### integration (mutation-shell)
- 編集可能コンテナ + relation 1 件
- `delete-relation` ボタンクリック（`window.confirm` モック → true）
- relation が container から除去されている（`dispatcher.getState().container.relations.length === 0`）
- `confirm` キャンセル（false）→ relation は残る

### 既存テスト
- 既存 Backlinks Panel / Relations セクションのテストは**ボタン追加前提で回帰しない**（`canEdit=true` 時に新要素が増えるだけ）

## 7. 非スコープ

- **undo / 履歴**: v1 不要。create form で再構築可能。deep integration は別 PR
- **kind protection**: structural 等の自動保護なし
- **bulk delete**: 複数 relation の一括削除 UI
- **drag-drop による relation 並び替え / 削除**
- **link-index / markdown-reference backlinks**: 本 PR は触らない
- **confirm dialog のカスタム UI 化**: 全削除系共通の custom modal は別 PR で検討

## 8. Rollback / 互換性

- 既存データスキーマ / reducer / action 不変
- 既存 DOM 属性追加のみ（`×` button）
- `canEdit === false` 時は元の DOM と完全同一
- `git revert` で前状態に戻せる

## 9. 関連文書

- `docs/development/backlinks-panel-v1.md` — relations-based backlinks の確立
- `docs/development/sidebar-backlink-badge-v1.md` — 同 terminology 方針
- `src/core/action/user-action.ts:78` — 既存 DELETE_RELATION
- `src/adapter/state/app-state.ts:914-923` — 既存 reducer + readonly gate
- `src/adapter/ui/renderer.ts:2887-2894` — 先行 tag-remove UI パターン
