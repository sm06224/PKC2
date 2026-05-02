# Merge Conflict UI v1 — Post-Implementation Audit

Created: 2026-04-17
Scope: pure slice + state slice + UI slice の統合監査
Related:
- docs/spec/merge-conflict-ui-v1-behavior-contract.md (contract)
- docs/development/merge-conflict-pure-slice.md
- docs/development/merge-conflict-state-slice.md

## 1. 監査観点

Contract §3（invariance）/ §5（resolution）/ §7（state）/ §8（UI）/ §9（gate）と実装 3 slice の end-to-end 整合性を検証。

## 2. 監査結果サマリ

| 観点 | 結果 |
|------|------|
| Conflict detection（C1/C2/C2-multi/C3 / deterministic / multi-host representative / contentHash） | **OK** |
| Invariance（host 不変 / keep==skip / provenance direction / append-only） | **OK** |
| State lifecycle（preview / no-conflict / resolution / bulk / cancel / confirm / re-preview / mode-switch） | **OK（2 件の defect を修正後）** |
| UI / gate（confirm disable / C1 default / C2-multi keep-current disabled / bulk scope） | **OK（1 件の defect を修正後）** |
| End-to-end merge semantics（imported filtering / applyMergePlan fallback / host mutation） | **OK** |

## 3. 発見した問題

### DEFECT-1: 統合 wiring 欠如（重大）

**症状**: `detectEntryConflicts` と `SET_MERGE_CONFLICTS` の呼び出し元が src/ 全体に存在せず、UI slice で実装した conflict row UI が実用では **永久に表示されない**（dead code 状態）。

**根本原因**: UI slice は renderer に conflict section を追加したが、user が "Merge" ラジオをクリックした時に conflict 検出して SET_MERGE_CONFLICTS を dispatch する経路を実装していなかった。

**最小修正**: `src/adapter/ui/action-binder.ts` の `set-import-mode` case を拡張。
- mode === 'merge' 時に `dispatcher.getState()` で host / imported を取得
- schema 一致を確認（I-MergeUI8 維持）
- `detectEntryConflicts(host, imp)` を呼び、conflict が 1 件以上あれば `SET_MERGE_CONFLICTS` を dispatch
- schema 不一致 or conflict 0 件の場合は dispatch しない

**追加テスト 3 件**（tests/adapter/merge-import.test.ts）:
1. mode=merge 切替 → conflict 検出 → state に反映 → UI section mount
2. schema mismatch → SET_MERGE_CONFLICTS 発火しない（I-MergeUI8）
3. conflict 0 件 → SET_MERGE_CONFLICTS 発火しない

### DEFECT-2: BULK keep-current で multi-host 既存値消去

**症状**: `BULK_SET_CONFLICT_RESOLUTION { resolution: 'keep-current' }` を dispatch すると、title-only-multi の既存 resolution が undefined に戻る（空オブジェクトから再構築していたため）。

**影響**: ユーザーが multi-host conflict に `duplicate-as-branch` を選択した後に「Accept all host」を押すと、multi-host 行が未解決状態に戻り confirm gate が再び block される。UX 逆行。

**Contract §8.4 解釈**: 「C2-multi は skip（I-MergeUI7 維持）」の "skip" は「bulk 処理から除外するが既存値は保持」が自然な解釈。I-MergeUI7 は「keep-current を入れない」ことだけを要求しており、既存値を消す意図は読み取れない。

**最小修正**: `src/adapter/state/app-state.ts` の `BULK_SET_CONFLICT_RESOLUTION` case で既存 resolutions を spread してから上書き（`{ ...state.mergeConflictResolutions }` 起点）。

**テスト更新**: tests/adapter/merge-conflict-state.test.ts の該当テストを「multi-host の既存 duplicate-as-branch 選択が bulk keep-current 後も保持される」シナリオに更新。

## 4. 作成/変更ファイル一覧

| ファイル | 区分 | 変更内容 |
|---------|------|---------|
| `src/adapter/ui/action-binder.ts` | 修正 | DEFECT-1: set-import-mode で conflict 検出 + dispatch 経路追加 |
| `src/adapter/state/app-state.ts` | 修正 | DEFECT-2: BULK で既存 resolutions を spread 起点に |
| `tests/adapter/merge-import.test.ts` | 修正 | +3 テスト（wiring / schema-gate / no-conflict） |
| `tests/adapter/merge-conflict-state.test.ts` | 修正 | BULK multi-host テストを既存値保持シナリオに更新 |
| `docs/development/merge-conflict-ui-v1-audit.md` | 新規 | 本監査ドキュメント |

## 5. Contract / 実装との整合点（確認済み）

### Invariance（I-MergeUI1〜10）

| invariant | 確認方法 | 結果 |
|-----------|---------|------|
| I-MergeUI1 host absolute preservation | applyMergePlan は host entries を spread 保持、provenance relation は append のみ | ✓ |
| I-MergeUI2 keep==skip container 副作用同一 | 両 case とも `newLidRemap.delete` / 区別は suppressed_by_* 配列のみ | ✓ |
| I-MergeUI3 C1 default / C2 explicit | SET_MERGE_CONFLICTS で C1 に keep-current 自動設定、allConflictsResolved で全件確認 | ✓ |
| I-MergeUI4 provenance direction fixed | from=newLid (derived), to=host_lid (source) で固定 | ✓ |
| I-MergeUI5 state reset | CANCEL / CONFIRM / re-preview / mode→replace 全 case で undefined 化 | ✓ |
| I-MergeUI6 bulk は 2 種のみ | action-binder は 'keep-current' / 'duplicate-as-branch' のみ accept（'skip' 値は validator を通るが UI に bulk skip button なし） | ✓ |
| I-MergeUI7 multi-host keep-current disabled | radio に disabled attr、reducer で multi-host を skip、修正後は既存値保持 | ✓ |
| I-MergeUI8 schema mismatch で mount しない | action-binder で schema_version 一致確認後のみ SET_MERGE_CONFLICTS dispatch | ✓ |
| I-MergeUI9 readonly/historical で mount しない | 既存 gate で import 自体が不可（追加対応不要） | ✓ |
| I-MergeUI10 detectEntryConflicts pure / O(H+I) | DOM/AppState/dispatcher 非依存、test #13 で determinism 検証 | ✓ |

### Gate 条件（Contract §9.1 完全判定表）

| C1 resolved | C2 explicit | C2-multi explicit | Confirm enabled | 実装 |
|-------------|-------------|------------------|-----------------|------|
| yes | yes | yes | YES | `allConflictsResolved` が全件 truthy → disabled 付与しない ✓ |
| yes | no | — | NO | 未解決 C2 あり → disabled ✓ |
| yes | yes | no | NO | 未解決 C2-multi あり → disabled ✓ |
| no | — | — | NO | C1 default 未設定は SET_MERGE_CONFLICTS 時に自動で設定されるため実用では発生せず。発生した場合 disabled ✓ |

### End-to-end merge semantics

- CONFIRM_MERGE_IMPORT で `applyConflictResolutions` 適用後、`imported.entries.filter(e => plan.lidRemap.has(e.lid))` で除外 entry を filter
- filtered imported を `applyMergePlan` に渡すため、`?? entry.lid` fallback 問題は発生しない
- provenance relations は `merged.relations` の末尾に append（host relations は spread 保持）
- CONTAINER_MERGED event に `suppressed_by_keep_current[]` / `suppressed_by_skip[]` を記録

## 6. 品質チェック結果

| チェック | 結果 |
|---------|------|
| lint | 合格 |
| typecheck | 合格 |
| 全テスト | 3984 passed（regression なし） |
| merge 関連テスト | 66 passed |

## 7. 結論

pure / state / UI の 3 slice は contract に対して妥当。発見した 2 defect は最小修正で解消した。H-10 v1 の end-to-end は動作可能な状態。

## 8. 次 slice への引継ぎ事項

- UI 視覚確認（色 token 適用 / レイアウト微調整）は manual sync 以降の課題
- conflict UI が実際にブラウザで表示されること、および body preview の改行表示など視覚面は未確認（自動テストの範囲外）
- `data-pkc-field="conflict-resolution"` は radiogroup コンテナに付与したが、contract §8.1 の「resolution radio group」は radio 個別にも付与するか要検討（v1.x の optional 改善）
