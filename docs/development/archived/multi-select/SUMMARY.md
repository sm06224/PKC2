# Archived — Calendar / Kanban Multi-Select(Phase 1 + 2-A/B/C/E)

**Status**: archive(参照のみ、Phase 1 + 2-A/B/C/E shipped、2-D は live `INDEX.md` の CANDIDATE)
**Audit date**: 2026-05-02、reform-2026-05 で確定した 5-gate verification 適用済み
**Source**: 旧 `docs/development/calendar-kanban-multi-select-*.md`(計 5 ファイル)

PKC2 の multi-select feature は元々 sidebar-only 設計だった(`completed/multi-select-design.md`)が、Calendar / Kanban view への展開を **Phase 1 / 2-{A,B,C,D,E}** に分割。Phase 1 + 2-A/B/C/E はすべて 2026-04-11 で着地。Phase 2-D は CANDIDATE として live `INDEX.md` で追跡(本 SUMMARY scope 外)。

各 phase は対応する `tests/adapter/action-binder-multi-select*` で検証済み。

## 一覧(計 5 件)

| File | Topic |
|---|---|
| [`calendar-kanban-multi-select-phasing.md`](./calendar-kanban-multi-select-phasing.md) | Phase 分割設計のメタ doc(scope 確定) |
| [`calendar-kanban-multi-select-bulk-status.md`](./calendar-kanban-multi-select-bulk-status.md) | Phase 2-A:`BULK_SET_STATUS`(open / done 一括変更) |
| [`calendar-kanban-multi-select-bulk-date.md`](./calendar-kanban-multi-select-bulk-date.md) | Phase 2-B:`BULK_SET_DATE`(date 一括設定) |
| [`calendar-kanban-multi-select-escape-clear.md`](./calendar-kanban-multi-select-escape-clear.md) | Phase 2-C:Escape による selection clear |
| [`calendar-kanban-multi-select-multi-dnd.md`](./calendar-kanban-multi-select-multi-dnd.md) | Phase 2-E:multi-dnd(複数 entry 同時 drag) |

Phase 2-D(BULK_DELETE 派生など)は live `INDEX.md` で追跡。実装着手時に新 doc 作成で良い。

## 関連

- 上位 archive 規約: [`../SUMMARY.md`](../SUMMARY.md)
- canonical truth source: [`../../INDEX.md`](../../INDEX.md) §COMPLETED + §CANDIDATE
- 並行 archive: [`../../completed/multi-select-design.md`](../../completed/multi-select-design.md)(sidebar 設計の正本、2026-04-25 audit で close 済)
