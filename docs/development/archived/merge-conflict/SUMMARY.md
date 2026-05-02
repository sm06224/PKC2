# Archived — Merge Conflict UI v1

**Status**: archive(参照のみ、v1 shipped)
**Audit date**: 2026-05-02、reform-2026-05 で確定した 5-gate verification 適用済み
**Source**: 旧 `docs/development/merge-conflict-*.md`(計 4 ファイル)

PKC2 の merge-import-conflict resolution UI(C2 conflict)の Pure / State / UI slice 段階実装 + ui-contract consolidation の retirement note。実装は `src/adapter/ui/dual-edit-conflict-overlay.ts` 等の関連 module。

canonical spec: [`../../../spec/merge-import-conflict-ui-minimum-scope.md`](../../../spec/merge-import-conflict-ui-minimum-scope.md) + [`../../../spec/merge-import-conflict-resolution.md`](../../../spec/merge-import-conflict-resolution.md) は live tree 維持。

## 一覧(計 4 件)

| File | Topic | Implemented |
|---|---|---|
| [`merge-conflict-pure-slice.md`](./merge-conflict-pure-slice.md) | Pure slice 実装メモ(2026-04-17) | 2026-04-17 |
| [`merge-conflict-state-slice.md`](./merge-conflict-state-slice.md) | State slice 実装メモ | 2026-04-17 |
| [`merge-conflict-ui-v1-audit.md`](./merge-conflict-ui-v1-audit.md) | UI v1 final audit | 2026-04-17 |
| [`merge-conflict-ui-contract-consolidation-retire-note.md`](./merge-conflict-ui-contract-consolidation-retire-note.md) | ui-contract consolidation の retirement note(canonical を spec/ に集約) | 2026-04-18 |

## 関連

- 上位 archive 規約: [`../SUMMARY.md`](../SUMMARY.md)
- canonical spec(live): `docs/spec/merge-import-conflict-resolution.md` / `docs/spec/merge-import-conflict-ui-minimum-scope.md`
- canonical truth source: [`../../INDEX.md`](../../INDEX.md) §COMPLETED
