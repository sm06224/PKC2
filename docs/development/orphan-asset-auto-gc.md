# Orphan Asset Auto-GC

**Status**: implemented (Tier 2-1)
**Date**: 2026-04-14
**Scope**: reducer auto-invocation of `removeOrphanAssets` on
container-replacement paths.

## 1. 背景

v0.1.0 の時点で orphan asset 検出・削除は **foundation** だけが
存在していた:

- `collectReferencedAssetKeys(container)` / `collectOrphanAssetKeys(container)` — 純関数 scan
- `removeOrphanAssets(container)` — 純関数削除（0 件なら identity 維持）
- `PURGE_ORPHAN_ASSETS` reducer + shell-menu ボタン — 手動掃除のみ

つまり "当たる場所は揃っているが、いつ当てるか" のポリシーが未
決定のまま手動ボタンだけがあった状態。

`asset-scan.ts` の header コメントが明記していたとおり、どの
reducer path で auto-GC を回すかは **policy 判断** として別 Issue
に預けられていた。

Tier 2-1 (2026-04-14) はその policy 判断のうち、**唯一確実に
安全な 1 経路** である「コンテナ全置換 (import) 時」に auto-GC
を入れる。

## 2. ポリシー: どこで auto-GC するか

### 2.1 採用する経路（3 箇所）

すべて「コンテナが丸ごと置き換わる」系:

| Reducer | 位置 | 発火タイミング |
|--------|-----|--------------|
| `reduceReady` | `SYS_IMPORT_COMPLETE` | import 完了（preview なしの直接パス） |
| `reduceReady` | `CONFIRM_IMPORT` | import preview → 確定 |
| `reduceError` | `SYS_IMPORT_COMPLETE` | error 状態から import で復帰 |

これらの path で行うこと:

```ts
const purged = removeOrphanAssets(imported);
// ... container: purged で next state を作る
if (purged !== imported) {
  events.push({ type: 'ORPHAN_ASSETS_PURGED', count });
}
```

- `removeOrphanAssets` は orphan 0 件なら **同じ reference を
  返す** 契約。`purged === imported` の identity 比較で
  「何も掃除されなかった」を判別する。
- 0 件の場合は既存の container reference がそのまま下流に流れる
  — これは既存の integration test (`CONFIRM_IMPORT` の
  `expect(state.container).toBe(importContainer)` 等) を壊さない
  ための重要な設計。
- 0 件の場合は `ORPHAN_ASSETS_PURGED` イベントを出さない。既存
  の手動 purge と同様に「掃除したときだけ」emit する。

### 2.2 あえて採用しない経路

| Reducer | 理由 |
|---------|-----|
| `DELETE_ENTRY` | 削除したエントリが revision snapshot に残る。将来 `RESTORE_ENTRY` で body が復活したとき、purge された asset だけ戻ってこない → broken image。 |
| `BULK_DELETE` | 同上。複数削除の一括版。 |
| `COMMIT_EDIT` | 編集で `![](asset:K)` を削除しても、**同じ編集の revision に古い body が残る**。`RESTORE_ENTRY` から蘇らせた瞬間に asset が無い状態になる。 |
| `QUICK_UPDATE_ENTRY` | 同上。インライン更新版。 |
| `RESTORE_ENTRY` | そもそも asset ref を増やす方向。orphan を作らない。 |
| `PURGE_TRASH` | goal は Trash 消去であって asset 掃除ではない。`PURGE_ORPHAN_ASSETS` を別途叩く運用で一貫させる。 |
| `SYS_APPLY_BATCH_IMPORT` | 追加取り込み（container 全置換ではない）。既存の asset を削除できない保守的設計を維持。 |
| 背景タイマー / debounce | 不透明。行動予測困難。 |

「選択肢 A: 全 path で auto-GC」を取らなかった核心理由は
**revision の non-reference 契約** (`asset-scan.ts` L37-40) と
`RESTORE_ENTRY` の整合だけ。もし将来 revision を reference-counted
にするなら、これらの制限は緩められる。

## 3. なぜ import だけが安全か

Import 経路が特別なのは次の 3 点:

1. **既存の container と revisions が丸ごと捨てられる** —
   purge した asset を持っていた側の revision は this state に
   存在しない。`RESTORE_ENTRY` で蘇る経路が物理的にない。
2. **ユーザーが明示的に container 全置換を選んでいる** — 高意図
   破壊操作。途中経過の undo 期待値は import 自体で壊れる
   （既存の前提）。
3. **典型ユースケース**: 他ツールが出した .pkc2.zip や legacy
   export は、本来必要のない asset を含んでいることがある。
   import 時点で整理することで、Storage Profile / export のノイズ
   を減らせる。

## 4. テスト

`tests/core/app-state.test.ts` の `Tier 2-1` ブロック（8 件）:

**positive（auto-purge が効く）**:

1. `SYS_IMPORT_COMPLETE auto-purges orphan assets from the imported container`
2. `SYS_IMPORT_COMPLETE is identity-preserving when the imported container has no orphans`
3. `CONFIRM_IMPORT auto-purges orphan assets from the preview container`
4. `CONFIRM_IMPORT is identity-preserving when the preview container has no orphans`
5. `SYS_IMPORT_COMPLETE from error phase also auto-purges orphan assets`

**regression pins（auto-purge が効かない経路の保護）**:

6. `COMMIT_EDIT does NOT auto-purge orphan assets (foundation-only)`
7. `QUICK_UPDATE_ENTRY does NOT auto-purge orphan assets (foundation-only)`
8. `BULK_DELETE does NOT auto-purge orphan assets (foundation-only)`

既存の `DELETE_ENTRY does NOT auto-purge orphan assets (foundation-only)`
(line 2000) はそのまま保持。「DELETE 系は手動掃除」の契約を壊さない。

## 5. Backward compatibility

- `PURGE_ORPHAN_ASSETS` 手動ボタンの挙動は **変更なし**。shell-menu
  の "🧹 Clean N orphan asset(s)" は従来どおり表示・動作する。
- 既存 container 構造、export 形式、import 形式は変更なし。
- 既存の integration test (`CONFIRM_IMPORT` の identity assertion
  等) は `removeOrphanAssets` の identity 契約により動作継続。
- Storage Profile の orphan 報告は変更なし。import 後は 0 件
  から始まるが、edit で新規 orphan が生じれば従来どおり増える。

## 6. 実装コスト

- production: `src/adapter/state/app-state.ts` に 3 箇所修正（各
  ~10 行）。`src/features/asset/asset-scan.ts` のコメント更新
- tests: 8 件追加（~180 行）
- docs: 本文書 1 枚
- bundle size 増加: 430 B（JS）

## 7. 残る policy 判断（将来）

次段で必要になったら検討する:

- **Revision reference-counting の導入**: revision snapshot の
  body をスキャンして asset ref をカウントする。これができれば
  DELETE_ENTRY / COMMIT_EDIT 経路の auto-GC も安全になる。
  ただし revision の body は string で parse コストが効く可能性
  があるので慎重に測る。
- **Export-time compaction**: export path で `removeOrphanAssets`
  を挟む。受け手の container を最初からクリーンにできる。
  現在は exporter を触らない選択をしたが、これは容易に足せる。
- **背景タイマーによる定期掃除**: 非透過な副作用になるので現
  時点では非推奨。

## 8. 参考コード位置

- `src/features/asset/asset-scan.ts` (foundation, header comment
  更新)
- `src/adapter/state/app-state.ts`
  - L469 付近 — `reduceReady` / `SYS_IMPORT_COMPLETE`
  - L587 付近 — `reduceReady` / `CONFIRM_IMPORT`
  - L1260 付近 — `reduceError` / `SYS_IMPORT_COMPLETE`
  - L870 付近 — `PURGE_ORPHAN_ASSETS` comment 更新
- `tests/core/app-state.test.ts` — Tier 2-1 ブロック

## 9. 変更履歴

| 日付 | 変更 |
|-----|-----|
| 2026-04-14 | 初版（Tier 2-1 実装と同時） |
