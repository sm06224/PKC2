# Completed dev docs — index

実装が完了し、参照のみが目的の dev doc を集約。新しい設計を始めるときに「これは既に実装済みかどうか」を確認する一次窓口。

最新の方針 / Active candidate / Idea Inventory は [`../INDEX.md`](../INDEX.md) を参照。**Truth source は `INDEX.md` 側**(本 SUMMARY は navigation 索引、status は INDEX.md §CLOSED が canonical)。

## 適用範囲

本ディレクトリは **C-2(2026-04-25)着地時点で `INDEX.md` §CLOSED に列挙されていた 42 doc** を収容。§COMPLETED に並ぶ多数の doc は当面 `../` 直下に残置(連続 wave で cross-link が更新され続けているため、untouched 期間が立ってから C-3+ で個別判定)。

`docs/development/` の orphan doc(INDEX に乗っていない 67 件)は本ディレクトリには **入れていない**。C-3+ wave で個別判定。

## 一覧(landing は近い順、最新 = 上)

§CLOSED 42 doc の close audit は 2026-04-11 に実施(`INDEX.md §Close Audit Summary`)。本一覧は **alphabetical** 順、各 doc の topic は `INDEX.md §CLOSED` の row と同じ。

| # | File | Topic |
|---|------|-------|
| 1 | [`action-surface-consolidation.md`](./action-surface-consolidation.md) | Sidebar/header action refactor |
| 2 | [`asset-autocomplete-foundation.md`](./asset-autocomplete-foundation.md) | `/asset` autocomplete |
| 3 | [`asset-picker-foundation.md`](./asset-picker-foundation.md) | Asset picker modal |
| 4 | [`asset-reference-resolution.md`](./asset-reference-resolution.md) | `asset:key` → data URL resolution |
| 5 | [`attachment-preview-strategy.md`](./attachment-preview-strategy.md) | Attachment preview phases 1-3 |
| 6 | [`batch-import-result-feedback.md`](./batch-import-result-feedback.md) | Import result notification |
| 7 | [`batch-import-target-folder-selection.md`](./batch-import-target-folder-selection.md) | Import target folder selection |
| 8 | [`batch-import-transaction-hardening.md`](./batch-import-transaction-hardening.md) | Atomic batch import via SYS_APPLY_BATCH_IMPORT |
| 9 | [`container-wide-batch-import.md`](./container-wide-batch-import.md) | Multi-entry batch import pipeline |
| 10 | [`critical-input-attachment-recovery.md`](./critical-input-attachment-recovery.md) | Input loss prevention |
| 11 | [`dnd-cleanup-robustness.md`](./dnd-cleanup-robustness.md) | DnD state cleanup safety nets |
| 12 | [`edit-preview-asset-resolution.md`](./edit-preview-asset-resolution.md) | Edit preview + asset resolution (omnibus) |
| 13 | [`entry-level-deep-preview.md`](./entry-level-deep-preview.md) | Entry deep preview |
| 14 | [`entry-window-archetype-display.md`](./entry-window-archetype-display.md) | Archetype display in entry window |
| 15 | [`entry-window-preview-phase4.md`](./entry-window-preview-phase4.md) | Entry window preview phase 4 |
| 16 | [`folder-scoped-export.md`](./folder-scoped-export.md) | Folder-scoped export |
| 17 | [`folder-scoped-import.md`](./folder-scoped-import.md) | Folder-scoped import |
| 18 | [`folder-structure-restore.md`](./folder-structure-restore.md) | Folder hierarchy restoration on import |
| 19 | [`import-preview-ui.md`](./import-preview-ui.md) | Import preview UI |
| 20 | [`input-assistance-foundation.md`](./input-assistance-foundation.md) | Input assistance (calc, auto-list) |
| 21 | [`light-mode-badge-ui.md`](./light-mode-badge-ui.md) | Light mode badge styling |
| 22 | [`markdown-phase2.md`](./markdown-phase2.md) | Markdown rendering phase 2 |
| 23 | [`mixed-container-export.md`](./mixed-container-export.md) | Mixed archetype export |
| 24 | [`multi-select-design.md`](./multi-select-design.md) | Multi-select design spec |
| 25 | [`non-image-asset-handling.md`](./non-image-asset-handling.md) | Non-image asset chip foundation |
| 26 | [`pane-resize-selector-migration.md`](./pane-resize-selector-migration.md) | Pane resize selector migration |
| 27 | [`release-builder-commit-stamp.md`](./release-builder-commit-stamp.md) | Commit hash in release build |
| 28 | [`selective-import.md`](./selective-import.md) | Selective import (checkbox UI) |
| 29 | [`split-editor-preview-asset-resolution.md`](./split-editor-preview-asset-resolution.md) | Split editor asset resolution |
| 30 | [`text-container-wide-export.md`](./text-container-wide-export.md) | TEXT container-wide export |
| 31 | [`text-markdown-zip-export.md`](./text-markdown-zip-export.md) | TEXT markdown ZIP export |
| 32 | [`text-textlog-editing-ux-consolidation.md`](./text-textlog-editing-ux-consolidation.md) | TEXT/TEXTLOG editing UX consolidation |
| 33 | [`textlog-container-wide-export.md`](./textlog-container-wide-export.md) | TEXTLOG container-wide export |
| 34 | [`textlog-csv-zip-export.md`](./textlog-csv-zip-export.md) | TEXTLOG CSV+ZIP export |
| 35 | [`textlog-double-click-edit-review.md`](./textlog-double-click-edit-review.md) | TEXTLOG double-click edit review |
| 36 | [`textlog-foundation.md`](./textlog-foundation.md) | TEXTLOG foundation |
| 37 | [`textlog-polish.md`](./textlog-polish.md) | TEXTLOG polish |
| 38 | [`textlog-text-attachment-ux-polish.md`](./textlog-text-attachment-ux-polish.md) | TEXTLOG / text / attachment UX polish |
| 39 | [`todo-cross-view-move-strategy.md`](./todo-cross-view-move-strategy.md) | Todo cross-view move strategy |
| 40 | [`todo-layering-fix.md`](./todo-layering-fix.md) | Todo layering fix |
| 41 | [`todo-view-consistency.md`](./todo-view-consistency.md) | Todo view consistency (Detail/Calendar/Kanban) |
| 42 | [`ux-regression-recovery.md`](./ux-regression-recovery.md) | UX regression recovery |

## カテゴリ索引(secondary navigation)

doc を機能領域でグルーピングした手書き索引。**自動生成しない**(件数が少ないので保守可能、検索性のみ目的)。

### Asset / attachment
- [`asset-autocomplete-foundation.md`](./asset-autocomplete-foundation.md) — `/asset` autocomplete
- [`asset-picker-foundation.md`](./asset-picker-foundation.md) — Asset picker modal
- [`asset-reference-resolution.md`](./asset-reference-resolution.md) — `asset:key` → data URL
- [`attachment-preview-strategy.md`](./attachment-preview-strategy.md) — Attachment preview phases 1-3
- [`critical-input-attachment-recovery.md`](./critical-input-attachment-recovery.md) — Input loss prevention
- [`non-image-asset-handling.md`](./non-image-asset-handling.md) — Non-image asset chip foundation

### Import / Export / batch / folder
- [`batch-import-result-feedback.md`](./batch-import-result-feedback.md) — Import result notification
- [`batch-import-target-folder-selection.md`](./batch-import-target-folder-selection.md) — Import target folder selection
- [`batch-import-transaction-hardening.md`](./batch-import-transaction-hardening.md) — Atomic batch import
- [`container-wide-batch-import.md`](./container-wide-batch-import.md) — Multi-entry batch import
- [`folder-scoped-export.md`](./folder-scoped-export.md) — Folder-scoped export
- [`folder-scoped-import.md`](./folder-scoped-import.md) — Folder-scoped import
- [`folder-structure-restore.md`](./folder-structure-restore.md) — Folder hierarchy restoration
- [`import-preview-ui.md`](./import-preview-ui.md) — Import preview UI
- [`mixed-container-export.md`](./mixed-container-export.md) — Mixed archetype export
- [`selective-import.md`](./selective-import.md) — Selective import
- [`text-container-wide-export.md`](./text-container-wide-export.md) — TEXT container-wide export
- [`text-markdown-zip-export.md`](./text-markdown-zip-export.md) — TEXT markdown ZIP export
- [`textlog-container-wide-export.md`](./textlog-container-wide-export.md) — TEXTLOG container-wide export
- [`textlog-csv-zip-export.md`](./textlog-csv-zip-export.md) — TEXTLOG CSV+ZIP export

### Editing UX(TEXT / TEXTLOG / Todo)
- [`edit-preview-asset-resolution.md`](./edit-preview-asset-resolution.md) — Edit preview + asset resolution (omnibus)
- [`input-assistance-foundation.md`](./input-assistance-foundation.md) — Input assistance (calc, auto-list)
- [`split-editor-preview-asset-resolution.md`](./split-editor-preview-asset-resolution.md) — Split editor asset resolution
- [`text-textlog-editing-ux-consolidation.md`](./text-textlog-editing-ux-consolidation.md) — TEXT/TEXTLOG editing UX
- [`textlog-double-click-edit-review.md`](./textlog-double-click-edit-review.md) — TEXTLOG double-click edit
- [`textlog-foundation.md`](./textlog-foundation.md) — TEXTLOG foundation
- [`textlog-polish.md`](./textlog-polish.md) — TEXTLOG polish
- [`textlog-text-attachment-ux-polish.md`](./textlog-text-attachment-ux-polish.md) — TEXTLOG / text / attachment UX polish
- [`todo-cross-view-move-strategy.md`](./todo-cross-view-move-strategy.md) — Todo cross-view move
- [`todo-layering-fix.md`](./todo-layering-fix.md) — Todo layering fix
- [`todo-view-consistency.md`](./todo-view-consistency.md) — Todo view consistency

### Entry / preview / window
- [`entry-level-deep-preview.md`](./entry-level-deep-preview.md) — Entry deep preview
- [`entry-window-archetype-display.md`](./entry-window-archetype-display.md) — Archetype display in entry window
- [`entry-window-preview-phase4.md`](./entry-window-preview-phase4.md) — Entry window preview phase 4
- [`multi-select-design.md`](./multi-select-design.md) — Multi-select design spec

### Markdown / rendering
- [`markdown-phase2.md`](./markdown-phase2.md) — Markdown rendering phase 2

### UI surface / chrome
- [`action-surface-consolidation.md`](./action-surface-consolidation.md) — Sidebar/header action refactor
- [`dnd-cleanup-robustness.md`](./dnd-cleanup-robustness.md) — DnD state cleanup safety nets
- [`light-mode-badge-ui.md`](./light-mode-badge-ui.md) — Light mode badge styling
- [`pane-resize-selector-migration.md`](./pane-resize-selector-migration.md) — Pane resize selector migration

### Build / release tooling
- [`release-builder-commit-stamp.md`](./release-builder-commit-stamp.md) — Commit hash in release build

### Regression / recovery
- [`ux-regression-recovery.md`](./ux-regression-recovery.md) — UX regression recovery

## 移動の経緯

C-1 audit(2026-04-25、`../dev-docs-cleanup-audit-2026-04-25.md`、PR #151)で 4-step 計画を確定:

1. `mkdir docs/development/completed/`
2. INDEX §CLOSED 42 doc を `git mv` 平坦移動
3. cross-link を機械的に書き換え(`docs/development/<file>.md` → `docs/development/completed/<file>.md`)
4. 本 SUMMARY を新規作成

C-2 PR(本 commit 群)で実施。3 commit split で git rename detection を保全:

- commit 1/3: `git mv` のみ(42 件、すべて 100% similarity rename)
- commit 2/3: cross-link 書換(35 file、+105 / -105)
- commit 3/3: 本 SUMMARY を新規追加

§COMPLETED は **本 PR では移動しない**。連続 wave で cross-link が更新され続けているため、本 audit 着地時点で「30 日 untouched」を満たす doc がゼロだった。wave 活動が落ち着いて untouched 期間が積み上がってから C-3+ で個別判定。

orphan 67 件は INDEX に乗っていない doc 群、本 SUMMARY にも含めない。C-3+ で「INDEX に追加 / archive 行き / 削除」を 1 doc ずつ判定。

## References

- [`../INDEX.md`](../INDEX.md) — canonical truth source(§Status Legend / §CLOSED / §COMPLETED / §CANDIDATE / §Idea Inventory / §Close Audit Summary)
- [`../dev-docs-cleanup-audit-2026-04-25.md`](../dev-docs-cleanup-audit-2026-04-25.md) — C-1 audit doc(分類規則 + 移動先設計 + SUMMARY 構造)
- [`../pr-review-checklist.md`](../pr-review-checklist.md) — 8 項目自己監査ルール(C-2 PR にも適用)
