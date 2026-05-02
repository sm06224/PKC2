# Archived — Keyboard Navigation phase[1-6]

**Status**: archive(参照のみ、全 phase shipped)
**Audit date**: 2026-05-02、reform-2026-05 で確定した 5-gate verification 適用済み
**Source**: 旧 `docs/development/keyboard-navigation-phase[1-6]*.md`

PKC2 の keyboard navigation feature は **2026-04-11 以降の 6 phase に分けて段階的に実装**された。各 phase は `Status: COMPLETED` で着地済み、`tests/adapter/action-binder-keyboard.test.ts` および関連 test で網羅されている(Phase 1A の 5-gate verification で `INDEX.md §COMPLETED §48-53` を確認済み)。

新規設計時の「これは既に実装済か」確認は本 SUMMARY を一次窓口に。各 phase の詳細は archive 内ファイル参照。

## 一覧(phase 順、計 6 件)

| Phase | File | Topic | Implemented |
|---|---|---|---|
| 1 | [`keyboard-navigation-phase1.md`](./keyboard-navigation-phase1.md) | Sidebar Arrow Up / Down(可視エントリの前後移動) | 2026-04-11 |
| 2 | [`keyboard-navigation-phase2-enter.md`](./keyboard-navigation-phase2-enter.md) | Enter — readonly 互換でのエントリ activate | 2026-04-11 |
| 3 | [`keyboard-navigation-phase3-tree.md`](./keyboard-navigation-phase3-tree.md) | Arrow Left / Right — folder 折りたたみ展開 | 2026-04-12 |
| 4 | [`keyboard-navigation-phase4-parent.md`](./keyboard-navigation-phase4-parent.md) | Parent jump(folder 間遷移) | 2026-04-13 |
| 5 | [`keyboard-navigation-phase5-child.md`](./keyboard-navigation-phase5-child.md) | Child jump(エントリ → 子 folder の遷移) | 2026-04-14 |
| 6 | [`keyboard-navigation-phase6-nonfolder-parent.md`](./keyboard-navigation-phase6-nonfolder-parent.md) | Non-folder parent jump(arbitrary entry の親 folder 推論) | 2026-04-14 |

加えて補助的に landing 済の関連 doc:
- `kanban-keyboard-phase3-ctrl-arrow.md`(Ctrl+Arrow による kanban クロス列移動、live tree に残置 — 別カテゴリ機能)

## 関連

- 上位 archive 規約: [`../SUMMARY.md`](../SUMMARY.md)
- canonical truth source: [`../../INDEX.md`](../../INDEX.md) §COMPLETED §48-53
- 並行 archive: [`../pr-findings/SUMMARY.md`](../pr-findings/SUMMARY.md)(perf wave PR # 別)、[`../audits-2026-04/SUMMARY.md`](../audits-2026-04/SUMMARY.md)、[`../../completed/SUMMARY.md`](../../completed/SUMMARY.md)
