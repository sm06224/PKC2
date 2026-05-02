# Entry-ref Autocomplete v1.3 — Recent-first ordering

**Status**: implementation — 2026-04-20.
**Scope**: autocomplete 候補の並び順を **直近選択した entry が上位に来る** ように変える。filter 結果集合を壊さず、canonical form / trigger / insert は不変。合わせて **todo-description フィールドの parity を明示テスト** で固定する。

## 1. Explicit design answers

### Q1. 「選択履歴」とみなす範囲
**autocomplete で確定した選択のみ**。
- `(entry:` / `[[` どちらのトリガ経由でも記録
- 通常の `SELECT_ENTRY`（サイドバー / backlink クリック / navigate）は**含めない**

理由: autocomplete は "書く" 文脈の履歴。navigation の "読む" 履歴とは異なる優先順位を持つべき。

### Q2. 保存場所 / 永続化
- **app-state runtime-only slice**（`collapsedFolders` / `multiSelectedLids` と同じクラス）
- container にも IndexedDB にも永続化**しない**
- タブを閉じれば消える。再 open 時は空から始まる

理由: author の "その場の記憶" であって container の属性ではない。移植・共有・エクスポートに影響させないのが正しい。

### Q3. text / textlog / todo 間の共有
- **全トリガ共通の単一 `recentEntryRefLids` 配列**
- text body で confirm した lid は、直後に textlog で autocomplete を開いたときにも recent 扱いになる

理由: 候補集合（user entries）は同じなので、履歴も分ける理由がない。分けると誤動作源になる。

### Q4. エントリ削除時の挙動
- `recentEntryRefLids` の内容は **clean up しない**（そのまま残る）
- 削除された entry は candidate set に含まれないため、recent 昇格ロジックでは no-op になる
- 結果として invisible な履歴汚染が発生するが、ユーザー体感には影響しない

理由: 削除毎に clean up するとコストと複雑さが増す割に体感利得がない。filter 後に reorder するだけなので、存在しない lid は勝手に無視される。

### Q5. 件数上限
**20 件**。理由: ユーザー体感として十分、memory オーバーヘッドゼロ、テスト容易。

### Q6. 同一 lid の再選択
**先頭に昇格**（LRU）。順序は recency 順で安定。

## 2. アーキテクチャ

### データフロー

```
user picks candidate in popup
    ↓
entry-ref-autocomplete.ts: insertCandidate() — insert text
    ↓ (callback)
action-binder.ts: dispatcher.dispatch(RECORD_ENTRY_REF_SELECTION)
    ↓
app-state.ts reduceEditing: prepend lid, dedupe, cap 20
    ↓ (next popup open)
action-binder.ts: reorderByRecentFirst(candidates, state.recentEntryRefLids)
    ↓
entry-ref-autocomplete.ts: display reordered list
```

### 変更するファイル

| 層 | ファイル | 変更 |
|----|---------|------|
| core | `src/core/action/user-action.ts` | 新 UserAction `RECORD_ENTRY_REF_SELECTION` 追加 |
| adapter/state | `src/adapter/state/app-state.ts` | `recentEntryRefLids: string[]` 追加、`reduceEditing` に case 追加、init state 更新 |
| features | `src/features/entry-ref/entry-ref-autocomplete.ts` | 新 pure helper `reorderByRecentFirst` 追加（`filterEntryCandidates` は不変） |
| adapter/ui | `src/adapter/ui/entry-ref-autocomplete.ts` | insert callback 登録機能（asset-picker と同パターン） |
| adapter/ui | `src/adapter/ui/action-binder.ts` | callback 登録/解除 + candidate 生成時に reorder |
| tests | `tests/features/entry-ref/entry-ref-autocomplete.test.ts` | reorderByRecentFirst テスト追加 |
| tests | `tests/core/app-state-record-entry-ref-selection.test.ts` | 新規: reducer テスト |
| tests | `tests/adapter/entry-ref-autocomplete.test.ts` | insert callback firing テスト追加 |
| tests | `tests/adapter/entry-ref-autocomplete-textlog.test.ts` | todo-description 小 parity テスト追加（rename または extend） |
| docs | `docs/development/entry-autocomplete-v1.3-recent-first.md` | 本文書 |

### `reorderByRecentFirst` 仕様

```ts
function reorderByRecentFirst(
  entries: readonly Entry[],
  recentLids: readonly string[],
): Entry[]
```

- **入力**: 既にフィルタ済の candidate 配列、recency 順（先頭が最新）の lid 配列
- **出力**: 新配列。recent 順に見つかった entry を先頭に、残りは元の順序で後続
- **不変**: 集合は変わらない（入出力の長さと要素は同じ）
- **dedup 不要**: 前段の filter で既に dedupe 済の前提

擬似コード:
```ts
const seen = new Set<string>();
const recent: Entry[] = [];
for (const lid of recentLids) {
  const hit = entries.find((e) => e.lid === lid);
  if (hit && !seen.has(lid)) {
    recent.push(hit);
    seen.add(lid);
  }
}
const rest = entries.filter((e) => !seen.has(e.lid));
return [...recent, ...rest];
```

### Reducer 仕様

```ts
case 'RECORD_ENTRY_REF_SELECTION': {
  const lid = action.lid;
  const prev = state.recentEntryRefLids;
  const deduped = prev.filter((x) => x !== lid);
  const next = [lid, ...deduped].slice(0, 20);
  return { state: { ...state, recentEntryRefLids: next }, events: [] };
}
```

- 先頭に lid を置く
- 既存から同一 lid を除く（dedup）
- 20 件でカット

### Callback パターン

`registerAssetPickerCallback` と同形:

```ts
// entry-ref-autocomplete.ts
let insertCallback: ((lid: string) => void) | null = null;
export function registerEntryRefInsertCallback(cb: ((lid: string) => void) | null): void {
  insertCallback = cb;
}
// insertCandidate 内:
insertCallback?.(cand.lid);
```

`action-binder.ts` で登録 / 解除:
```ts
registerEntryRefInsertCallback((lid) => {
  dispatcher.dispatch({ type: 'RECORD_ENTRY_REF_SELECTION', lid });
});
// teardown:
registerEntryRefInsertCallback(null);
```

## 3. Reducer の配置判断

RECORD_ENTRY_REF_SELECTION は **editing phase でのみ dispatch される**（autocomplete は編集中にしか発火しない）ため、`reduceEditing` に 1 case 追加すれば十分。`reduceReady` などで blocked されても実質 no-op で、warning が出る程度。

v1.2 の dangling-popup cleanup も editing→非editing で popup を閉じているので、popup が ready phase で残って追加発火する余地はない。

## 4. 非スコープ（将来候補）

- fuzzy ranking / scoring（v2+）
- persist across sessions（localStorage 等）
- recent を container の属性として保存
- fragment 補完
- popup Ctrl+Enter 吸収
- archetype 別の recent list

## 5. 用語整理

| 用語 | 意味 | 位置づけ |
|------|------|----------|
| `recentEntryRefLids` | autocomplete で直近選択された lid の LRU 配列 | AppState field、**暫定**（rename 可能） |
| `reorderByRecentFirst` | candidate を recent 順に昇格させる pure helper | 機能名、**暫定** |
| recent-first ordering | UX 挙動の名前 | 運用語、本 PR で定着 |

既存用語との衝突なし:
- "entry-ref" / "internal entry link" は既定 (v1)
- "relations-based backlinks" / "link-index backlinks" は PR #53 で定着
- "field parity" は v1.2 で導入

## 6. 互換性 / Rollback

- **互換性**: candidate 順序が変わるだけで、候補集合 / 挿入結果 / canonical form はすべて不変
- **データ互換性**: 追加される AppState slice は runtime-only、export / import 非対応
- **revert**: `git revert` で v1.2 に戻せる。recent-first 機能は消えるが他に影響なし

## 7. テスト観点

### pure helper
- 空の recentLids → 入力順そのまま
- recent 1 件 (first item) → 先頭が変わらない、残り変わらない
- recent が candidate に含まれない lid → 無視される
- recent に重複 lid → 最初の発生のみ（pure helper 内の dedup も確認）
- 空 candidate → 空返却

### reducer
- 空 state から 1 件 dispatch → [lid]
- 既存 20 件 + 新 lid → 先頭昇格 + 末尾 drop
- 既存にある lid を再 dispatch → 先頭昇格 + 元位置から削除
- phase=ready で dispatch → blocked (warning only, state 不変)

### adapter
- insert callback が呼ばれる（entry-url / bracket 両方）
- callback が null のときは no-op

### integration (mutation-shell)
- text 編集中に popup → candidate A 選択 → 再 popup → A が先頭
- text で A 選択 → textlog へ切り替え編集 → textlog の popup で A が先頭（共有確認）

### todo-description parity
- ゲートには入っている `todo-description` textarea で popup が開くこと
- 挿入後 textarea.value が期待通り

## 8. Risk 評価

- **redispatch loop の懸念**: insert callback → dispatch → reducer → state listener → popup close... この連鎖で再度 insert が走る可能性はない（callback は `insertCandidate` 内でしか呼ばれず、popup はすぐ閉じる）
- **performance**: reorder は O(n) で 20 件ループ。候補数が 1000 でも問題なし
- **ordering edge**: candidates が空のとき `openEntryRefAutocomplete` は no-op。reorder 段階で空配列が渡っても pure helper は空返却で安全
