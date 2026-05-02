# Archived — Dead Path Cleanup audits

**Status**: archive(参照のみ、Resolution 全件 applied)
**Audit date**: 2026-05-02、reform-2026-05 で確定した 5-gate verification 適用済み
**Source**: 旧 `docs/development/dead-path-cleanup-inventory-*.md` + `dead-path-decision-*.md` + `dead-code-inventory-*.md`(計 8 ファイル)

PKC2 の dead-code / dead-path 棚卸しは **2026-04-19 から 5 round + 補助 audit + 2 件の単発 decision** に分けて実施された。各 finding の Resolution は対応 PR(#36 / #41 / #44-47 / #65 など)で applied 済み。本 archive は historical record として保持し、新規追加時の重複防止参照として機能する。

## 一覧(計 8 件)

### Inventory rounds(5 round の主軸)

| Round | File | Topic |
|---|---|---|
| 01 | [`dead-path-cleanup-inventory-01.md`](./dead-path-cleanup-inventory-01.md) | adapter/ui 3 本(`isPreviewableMedia` 削除 + cosmetic 残置) |
| 02 | [`dead-path-cleanup-inventory-02-adapter-ui.md`](./dead-path-cleanup-inventory-02-adapter-ui.md) | adapter/ui 続編 |
| 03 | [`dead-path-cleanup-inventory-03-features.md`](./dead-path-cleanup-inventory-03-features.md) | features/ 配下 |
| 04 | [`dead-path-cleanup-inventory-04-platform-markdown-textlog-container.md`](./dead-path-cleanup-inventory-04-platform-markdown-textlog-container.md) | platform / markdown / textlog / container 横断 |
| 05 | [`dead-path-cleanup-inventory-05-round5.md`](./dead-path-cleanup-inventory-05-round5.md) | action-binder + transport + todo / calendar / kanban + search + image-optimize |

### Compendium audit(wave 終端)

| File | Topic |
|---|---|
| [`dead-code-inventory-after-relations-wave.md`](./dead-code-inventory-after-relations-wave.md) | Relations / Reference / Provenance wave 完了後の zero-use export / orphan file / dead CSS / stale marker 棚卸し(2026-04-21) |

### Single-issue decisions

| File | Topic |
|---|---|
| [`dead-path-decision-features-barrel.md`](./dead-path-decision-features-barrel.md) | `src/features/index.ts` barrel 削除判断 → PR #44 で実施 |
| [`dead-path-decision-isUlid-updateLogEntry.md`](./dead-path-decision-isUlid-updateLogEntry.md) | `isUlid` / `updateLogEntry` の retain / remove 判断 |

## 補助情報

各 finding は分類 A(smoking gun = 削除確定)/ B(cosmetic / refactor)/ C(backward-compat 維持)/ D(live、touched なし)で評価され、A は実 PR で削除、B/C/D は retain 理由を明示して残置。**「再 audit が同じ finding を再発見しないため」** の historical record として本 archive を維持。

## 関連

- 上位 archive 規約: [`../SUMMARY.md`](../SUMMARY.md)
- canonical truth source: [`../../INDEX.md`](../../INDEX.md) §COMPLETED §「Dead-code / dead-path maintenance wave」
- 並行 archive: [`../audits-2026-04/SUMMARY.md`](../audits-2026-04/SUMMARY.md)(他 2026-04 期 audit)
