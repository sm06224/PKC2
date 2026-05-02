# PR #188 — `BATCH_PASTE_ATTACHMENTS`: single render fold for multi-file drop

**Status**: implemented
**Date**: 2026-04-28
**Predecessors**: PR #176-#187

User direction: "go ahead!"(after PR #187 merge)

## 1. 動機

PR #185 で per-file の `CREATE_ENTRY + COMMIT_EDIT`(2 dispatch、selection
変動)を `PASTE_ATTACHMENT`(1 dispatch、silent)に切り替えた。30 ファイル
drop の dispatch 回数は 60 → 30 に半減したが、**まだ 30 dispatch =
30 render**。`render:scope=full`(container ref 変化で full render 確定)
が 30 回続くため、c-1000 で ~30 × 50 ms = 1.5 秒、c-5000 で ~30 × 350 ms
= 10 秒の主スレッド占有が累積する。

PR #188 は **N 個の attachment を 1 reduction で適用する
`BATCH_PASTE_ATTACHMENTS` action** を導入し、30 dispatch を 1 dispatch
+ 1 render に圧縮する。

## 2. 計測インパクト(理論値)

| シナリオ | PRE PR #188 | PR #188 |
|---|---|---|
| 30 ファイル drop で発火する render 回数 | **30** | **1** |
| c-1000 sidebar render 累積(30 files) | ~1.5 s | ~50 ms |
| c-5000 sidebar render 累積(30 files) | ~10 s | ~350 ms |
| `dispatcher.notify-state` 累積 | 30 通知 × N subscribers | 1 通知 × N subscribers |
| バッチ中の sidebar 進捗(行が一個ずつ pop in) | あり | 無し(進捗 badge で代替)|

PR #181 (yield) + #184 (worker) + #187 (offscreen canvas) + #188 (batch)
合算で、30 × 5MB JPEG drop の main thread 純占有:

| Wave | 累積 main 占有 |
|---|---|
| pre-PR-181 | ~30 s |
| PR #181-#186 | ~10 s |
| PR #187 | ~3 s |
| **PR #188** | **~0.5 s** |

## 3. 実装

### action 追加

`src/core/action/user-action.ts`:

```ts
| {
    type: 'BATCH_PASTE_ATTACHMENTS';
    items: Array<{
      name: string; mime: string; size: number;
      assetKey: string; assetData: string; contextLid: string | null;
      originalAssetData?: string;
      optimizationMeta?: { ... };
    }>;
  }
```

各 item は単一の `PASTE_ATTACHMENT` 払い出しと同形。

### reducer 追加

`src/adapter/state/app-state.ts`:

per-item ロジックを `applyAttachmentItem(container, events, item, ts)`
helper に factor。これを `PASTE_ATTACHMENT` と
`BATCH_PASTE_ATTACHMENTS` の両 case で使う。helper は:

- placement folder 解決(PR #186 root-fallback 含む)
- 添付 entry 作成 + body + asset
- 構造関係 link
- events 配列に push
- 新 container を return

`BATCH_PASTE_ATTACHMENTS` reducer:

```ts
let container = state.container;
for (const item of action.items) {
  container = applyAttachmentItem(container, events, item, ts);
}
return { state: { ...state, container }, events };
```

ループ内で container は **逐次更新** — つまり 2 番目以降の item は
1 番目の item で auto-create した root-level ASSETS folder を再利用
する。30 ファイル drop で ASSETS folder が 1 つだけ作成され、30 添付
全部がそこに入る。

### action-binder 改修

`processFileAttachmentWithDedupe`(per-file dispatch)を削除、新 helper
`prepareAttachmentPayload(file, contextFolder, dispatcher): Promise<AttachmentItem | null>`
に置換。preparation のみ(worker 読み + optimize + dedupe toast)、
**dispatch しない**。

drop zone outer loop と file-picker outer loop を改修:

```ts
const items: AttachmentItem[] = [];
for (let i = 0; i < totalFiles; i++) {
  const item = await prepareAttachmentPayload(files[i]!, contextFolder, dispatcher);
  if (item) items.push(item);
  showAttachProgress(i + 1, totalFiles);
  if (i + 1 < totalFiles) await yieldToEventLoop();
}
if (items.length > 0) {
  dispatcher.dispatch({ type: 'BATCH_PASTE_ATTACHMENTS', items });
}
```

per-file の yield + progress badge は維持(preparation 段階で UI
レスポンシブ)。dispatch は最後に 1 回。

### 単一ファイルパス

`processFileAttachment`(paste fallback)は単一ファイルなので
`PASTE_ATTACHMENT` を 1 回 dispatch するパスを維持。batch で包む
意味がない。

## 4. 後方互換性

- `PASTE_ATTACHMENT` の挙動 不変(同 helper 経由でも同じ結果)
- 既存 reducer / action / event の shape 不変
- batch 内 dedupe は **container ベース**(in-batch 重複は toast 出ず)
  — 情報目的の toast なので動作上は問題ない
- bundle.js +0.3 KB(新 reducer case + action 型)
- bundle.css 不変

## 5. テスト

新規:
- `tests/core/batch-paste-attachments-pr188.test.ts`(7 件)
  - N items → N attachments
  - 同一バッチの items は同じ root-level ASSETS を再利用
  - 同一 contextLid の items は同じ nested ASSETS を再利用
  - 空バッチは no-op(identity-equal state, 0 events)
  - readonly 時 blocked
  - selectedLid / editingLid / phase / viewMode 不変
  - assets merge(`__original` 含む)

既存無修正で全通過:
- `tests/core/app-state.test.ts` PASTE_ATTACHMENT 系(refactored
  helper でも同じ結果)
- `tests/adapter/fi04-multi-add-dedupe-persistent-dnd.test.ts`
- `tests/adapter/action-binder-attach-while-editing.test.ts`
- `tests/adapter/background-attach-pr185.test.ts`(silent attach)
- `tests/adapter/background-attach-assets-placement.test.ts`(ASSETS routing)
- `tests/core/auto-placement-root-bucket-pr186.test.ts`(root fallback)

合計 5939 / 5939 unit pass + 11 / 11 smoke pass。

## 6. PR #189 候補

- **filter-pipeline メモ化** — c-5000 search-keystroke 残り 100 ms /
  keystroke の treeHide / searchHide bucket 集合 cache
- **virtualization 検証** — c-10000 などより大規模での content-visibility
  の限界探り

## 7. Files touched

- 修正: `src/core/action/user-action.ts`(`BATCH_PASTE_ATTACHMENTS`
  action 追加、~25 行)
- 修正: `src/adapter/state/app-state.ts`(`applyAttachmentItem` helper
  抽出 + `BATCH_PASTE_ATTACHMENTS` reducer case、PASTE_ATTACHMENT 既存
  case を helper 呼び出しに簡略化、~140 行 net)
- 修正: `src/adapter/ui/action-binder.ts`(`processFileAttachmentWithDedupe`
  → `prepareAttachmentPayload` 置換、drop zone と file-picker の outer
  loop を batch dispatch に切り替え、~80 行 net)
- 新規: `tests/core/batch-paste-attachments-pr188.test.ts`(7 件)
- 新規: `docs/development/batch-attach-pr188-findings.md` (this doc)
