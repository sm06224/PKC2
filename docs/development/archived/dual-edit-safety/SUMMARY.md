# Archived — Dual-Edit Safety v1(FI-01)

**Status**: archive(参照のみ、v1 shipped)
**Audit date**: 2026-05-02、reform-2026-05 で確定した 5-gate verification 適用済み
**Source**: 旧 `docs/development/dual-edit-safety-*.md`(計 4 ファイル)

PKC2 の dual-edit-safety v1(FI-01)— **同 entry を別 window で同時編集したときの最終 commit 検証**機構の段階実装記録。Pure / State / UI の 3 slice + final audit。実装は `src/core/operations/dual-edit-safety.ts` + `src/adapter/state/app-state.ts` reducer + `src/adapter/ui/dual-edit-conflict-overlay.ts`。

canonical contract: [`../../../spec/dual-edit-safety-v1-behavior-contract.md`](../../../spec/dual-edit-safety-v1-behavior-contract.md) + [`../../../spec/dual-edit-safety-v1-minimum-scope.md`](../../../spec/dual-edit-safety-v1-minimum-scope.md) は live tree 維持(behavior contract は実装と並ぶ truth source)。

## 一覧(計 4 件)

| File | Topic | Implemented |
|---|---|---|
| [`dual-edit-safety-pure-slice.md`](./dual-edit-safety-pure-slice.md) | Pure slice — `checkSaveConflict()` helper、純関数のみ | 2026-04-17 |
| [`dual-edit-safety-state-slice.md`](./dual-edit-safety-state-slice.md) | State slice — reducer 統合、`editingBase` 追加 | 2026-04-17 |
| [`dual-edit-safety-ui-slice.md`](./dual-edit-safety-ui-slice.md) | UI slice — conflict overlay、Resolution dispatch | 2026-04-17 |
| [`dual-edit-safety-v1-audit.md`](./dual-edit-safety-v1-audit.md) | v1 final audit — 全 slice 結合確認 | 2026-04-17 |

## 関連

- 上位 archive 規約: [`../SUMMARY.md`](../SUMMARY.md)
- canonical contract(live): `docs/spec/dual-edit-safety-v1-behavior-contract.md`
- canonical truth source: [`../../INDEX.md`](../../INDEX.md) §COMPLETED
