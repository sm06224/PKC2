# Archived — TEXTLOG Replace Current Log(S-28 / S-29)

**Status**: archive(参照のみ、v1 + v1.x shipped)
**Audit date**: 2026-05-02、reform-2026-05 で確定した 5-gate verification 適用済み
**Source**: 旧 `docs/development/textlog-replace-current-log*.md`(計 3 ファイル)

PKC2 の TEXTLOG **「現在の log を置換」**機能(S-28 main + S-29 selection only extension)の段階実装記録。実装は `src/adapter/ui/textlog-log-replace-dialog.ts` + `src/adapter/ui/textlog-presenter.ts` + reducer。

canonical contract: [`../../../spec/textlog-replace-v1-behavior-contract.md`](../../../spec/textlog-replace-v1-behavior-contract.md) + [`../../../spec/textlog-replace-feasibility-and-minimum-scope.md`](../../../spec/textlog-replace-feasibility-and-minimum-scope.md) は live tree 維持。

## 一覧(計 3 件)

| File | Topic | Implemented |
|---|---|---|
| [`textlog-replace-current-log.md`](./textlog-replace-current-log.md) | 実装メモ(S-28 main + S-29 selection only) | 2026-04-16 |
| [`textlog-replace-current-log-audit.md`](./textlog-replace-current-log-audit.md) | Implementation audit | 2026-04-16 |
| [`textlog-replace-current-log-selection-audit.md`](./textlog-replace-current-log-selection-audit.md) | S-29 Selection-only extension audit | 2026-04-16 |

## 関連

- 上位 archive 規約: [`../SUMMARY.md`](../SUMMARY.md)
- canonical contract(live): `docs/spec/textlog-replace-v1-behavior-contract.md`
- canonical truth source: [`../../INDEX.md`](../../INDEX.md) §COMPLETED
