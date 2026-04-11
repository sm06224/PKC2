# Development Docs — Issue Index

Last updated: 2026-04-11.

## Status Legend

| Status | Meaning |
|--------|---------|
| CLOSED | Implementation complete, tests pass, doc accurate. Historical. |
| CLOSED (omnibus) | Multi-issue doc; all sub-issues complete. |
| COMPLETED | Recently finished. Implementation verified, not yet historical. |
| CANDIDATE | Under consideration for next implementation. |

## CLOSED (42 docs)

All 42 historical docs passed strict close audit (2026-04-11).

| # | File | Topic | Notes |
|---|------|-------|-------|
| 1 | `action-surface-consolidation.md` | Sidebar/header action refactor | |
| 2 | `asset-autocomplete-foundation.md` | `/asset` autocomplete | |
| 3 | `asset-picker-foundation.md` | Asset picker modal | |
| 4 | `asset-reference-resolution.md` | `asset:key` → data URL resolution | |
| 5 | `attachment-preview-strategy.md` | Attachment preview phases 1-3 | |
| 6 | `batch-import-result-feedback.md` | Import result notification | |
| 7 | `batch-import-target-folder-selection.md` | Import target folder selection | |
| 8 | `batch-import-transaction-hardening.md` | Atomic batch import via SYS_APPLY_BATCH_IMPORT | |
| 9 | `container-wide-batch-import.md` | Multi-entry batch import pipeline | Supersession notes added |
| 10 | `critical-input-attachment-recovery.md` | Input loss prevention | |
| 11 | `dnd-cleanup-robustness.md` | DnD state cleanup safety nets | Test coverage section added |
| 12 | `edit-preview-asset-resolution.md` | Edit preview + asset resolution (omnibus) | 9 sub-issues; TOC added |
| 13 | `entry-level-deep-preview.md` | Entry deep preview | |
| 14 | `entry-window-archetype-display.md` | Archetype display in entry window | |
| 15 | `entry-window-preview-phase4.md` | Entry window preview phase 4 | |
| 16 | `folder-scoped-export.md` | Folder-scoped export | |
| 17 | `folder-scoped-import.md` | Folder-scoped import | Supersession notes added |
| 18 | `folder-structure-restore.md` | Folder hierarchy restoration on import | |
| 19 | `import-preview-ui.md` | Import preview UI | |
| 20 | `input-assistance-foundation.md` | Input assistance (calc, auto-list) | |
| 21 | `light-mode-badge-ui.md` | Light mode badge styling | |
| 22 | `markdown-phase2.md` | Markdown rendering phase 2 | |
| 23 | `mixed-container-export.md` | Mixed archetype export | |
| 24 | `multi-select-design.md` | Multi-select design spec | Design doc only; impl is CANDIDATE |
| 25 | `non-image-asset-handling.md` | Non-image asset chip foundation | |
| 26 | `pane-resize-selector-migration.md` | Pane resize selector migration | |
| 27 | `release-builder-commit-stamp.md` | Commit hash in release build | |
| 28 | `selective-import.md` | Selective import (checkbox UI) | |
| 29 | `split-editor-preview-asset-resolution.md` | Split editor asset resolution | |
| 30 | `text-container-wide-export.md` | TEXT container-wide export | |
| 31 | `text-markdown-zip-export.md` | TEXT markdown ZIP export | |
| 32 | `text-textlog-editing-ux-consolidation.md` | TEXT/TEXTLOG editing UX consolidation | |
| 33 | `textlog-container-wide-export.md` | TEXTLOG container-wide export | |
| 34 | `textlog-csv-zip-export.md` | TEXTLOG CSV/ZIP export | |
| 35 | `textlog-double-click-edit-review.md` | TEXTLOG double-click edit | |
| 36 | `textlog-foundation.md` | TEXTLOG archetype foundation | |
| 37 | `textlog-polish.md` | TEXTLOG UX polish | Hint text fix applied |
| 38 | `textlog-text-attachment-ux-polish.md` | TEXT/TEXTLOG attachment UX polish | |
| 39 | `todo-cross-view-move-strategy.md` | Todo cross-view DnD strategy | |
| 40 | `todo-layering-fix.md` | Todo layer violation fix | |
| 41 | `todo-view-consistency.md` | Todo view consistency (detail/calendar/kanban) | |
| 42 | `ux-regression-recovery.md` | UX regression recovery | |

## COMPLETED

| # | File | Topic | Completed | Summary |
|---|------|-------|-----------|---------|
| 43 | `markdown-interactive-task-lists.md` | Interactive task list checkbox toggle | 2026-04-11 | TEXT/TEXTLOG の rendered markdown 内 `- [ ]`/`- [x]` を click で toggle。pure helper + QUICK_UPDATE_ENTRY。テスト 38 件。 |
| 44 | `non-image-inline-preview.md` | Non-image inline preview (PDF/audio/video) | 2026-04-11 | TEXT/TEXTLOG body 内の非画像 asset chip を inline preview に展開。`populateInlineAssetPreviews()` + 既存 blob lifecycle 再利用。CSP fallback 対応。テスト 16 件。 |

## CANDIDATE — Next Feature Top 1

### 暫定 1 位: Calendar/Kanban multi-select

複数エントリを Ctrl/Shift+click で選択し、一括 status/date 変更する。

| 観点 | 評価 |
|------|------|
| ユーザ価値 | 高 — 一括操作は全ユーザに恩恵 |
| 実装コスト | 大 (3-4 週間) |
| リスク | 高 — DnD/click handler 競合、state machine に `multiSelectedLids` 追加 |
| 既存基盤 | `multi-select-design.md` 設計済み (CLOSED as design doc) |
| 今すぐ着手する妥当性 | **中** — 設計は完了しているが、規模が大きく段階分割が必要 |

### 脱落候補と理由

| 候補 | 脱落理由 |
|------|---------|
| TEXTLOG drag-to-reorder | oldest-first storage 不変条件と構造的に衝突。着手前に設計変更議論が必要。コスト/リスクが見合わない |
| Sandbox Phase 5 (container default policy) | ユーザ価値が限定的。規模は小さいが優先度が低い |

## Close Audit Summary

- **First audit**: 2026-04-11 (broad scan)
- **Strict re-audit**: 2026-04-11 (per-item evidence with code/test/doc check)
- **CLOSE_NEEDS_REVIEW fixes**: 5 docs patched (container-wide-batch-import, folder-scoped-import, dnd-cleanup-robustness, textlog-polish, edit-preview-asset-resolution)
- **Final result**: 42/42 CLOSED
