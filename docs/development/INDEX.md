# Development Docs — Issue Index

Status as of 2026-04-11. All 42 docs are **CLOSED** (implementation complete, tests passing, doc accurate).

## Legend

| Status | Meaning |
|--------|---------|
| CLOSED | Implementation complete, tests cover in-scope items, doc reflects current state |
| CLOSED (omnibus) | Multi-issue doc; all sub-issues implemented but tracked as single unit |

## Index

| # | File | Topic | Status | Notes |
|---|------|-------|--------|-------|
| 1 | `action-surface-consolidation.md` | Sidebar/header action refactor | CLOSED | |
| 2 | `asset-autocomplete-foundation.md` | `/asset` autocomplete | CLOSED | |
| 3 | `asset-picker-foundation.md` | Asset picker modal | CLOSED | |
| 4 | `asset-reference-resolution.md` | `asset:key` → data URL resolution | CLOSED | |
| 5 | `attachment-preview-strategy.md` | Attachment preview phases 1-3 | CLOSED | |
| 6 | `batch-import-result-feedback.md` | Import result notification | CLOSED | |
| 7 | `batch-import-target-folder-selection.md` | Import target folder selection | CLOSED | |
| 8 | `batch-import-transaction-hardening.md` | Atomic batch import via SYS_APPLY_BATCH_IMPORT | CLOSED | |
| 9 | `container-wide-batch-import.md` | Multi-entry batch import pipeline | CLOSED | Supersession notes added |
| 10 | `critical-input-attachment-recovery.md` | Input loss prevention | CLOSED | |
| 11 | `dnd-cleanup-robustness.md` | DnD state cleanup safety nets | CLOSED | Test coverage section added |
| 12 | `edit-preview-asset-resolution.md` | Edit preview + asset resolution (omnibus) | CLOSED (omnibus) | 9 sub-issues in 1 doc; TOC/scope notice added |
| 13 | `entry-level-deep-preview.md` | Entry deep preview | CLOSED | |
| 14 | `entry-window-archetype-display.md` | Archetype display in entry window | CLOSED | |
| 15 | `entry-window-preview-phase4.md` | Entry window preview phase 4 | CLOSED | |
| 16 | `folder-scoped-export.md` | Folder-scoped export | CLOSED | |
| 17 | `folder-scoped-import.md` | Folder-scoped import | CLOSED | Supersession notes added |
| 18 | `folder-structure-restore.md` | Folder hierarchy restoration on import | CLOSED | |
| 19 | `import-preview-ui.md` | Import preview UI | CLOSED | |
| 20 | `input-assistance-foundation.md` | Input assistance (calc, auto-list) | CLOSED | |
| 21 | `light-mode-badge-ui.md` | Light mode badge styling | CLOSED | |
| 22 | `markdown-phase2.md` | Markdown rendering phase 2 | CLOSED | |
| 23 | `mixed-container-export.md` | Mixed archetype export | CLOSED | |
| 24 | `multi-select-design.md` | Multi-select design spec | CLOSED | Design doc; implementation deferred by design |
| 25 | `non-image-asset-handling.md` | Non-image asset chip foundation | CLOSED | |
| 26 | `pane-resize-selector-migration.md` | Pane resize selector migration | CLOSED | |
| 27 | `release-builder-commit-stamp.md` | Commit hash in release build | CLOSED | |
| 28 | `selective-import.md` | Selective import (checkbox UI) | CLOSED | |
| 29 | `split-editor-preview-asset-resolution.md` | Split editor asset resolution | CLOSED | |
| 30 | `text-container-wide-export.md` | TEXT container-wide export | CLOSED | |
| 31 | `text-markdown-zip-export.md` | TEXT markdown ZIP export | CLOSED | |
| 32 | `text-textlog-editing-ux-consolidation.md` | TEXT/TEXTLOG editing UX consolidation | CLOSED | |
| 33 | `textlog-container-wide-export.md` | TEXTLOG container-wide export | CLOSED | |
| 34 | `textlog-csv-zip-export.md` | TEXTLOG CSV/ZIP export | CLOSED | |
| 35 | `textlog-double-click-edit-review.md` | TEXTLOG double-click edit | CLOSED | |
| 36 | `textlog-foundation.md` | TEXTLOG archetype foundation | CLOSED | |
| 37 | `textlog-polish.md` | TEXTLOG UX polish | CLOSED | Hint text fix applied |
| 38 | `textlog-text-attachment-ux-polish.md` | TEXT/TEXTLOG attachment UX polish | CLOSED | |
| 39 | `todo-cross-view-move-strategy.md` | Todo cross-view DnD strategy | CLOSED | |
| 40 | `todo-layering-fix.md` | Todo layer violation fix | CLOSED | |
| 41 | `todo-view-consistency.md` | Todo view consistency (detail/calendar/kanban) | CLOSED | |
| 42 | `ux-regression-recovery.md` | UX regression recovery | CLOSED | |

## Close Audit Summary

- **First audit**: 2026-04-11 (broad scan)
- **Strict re-audit**: 2026-04-11 (per-item evidence with code/test/doc check)
- **CLOSE_NEEDS_REVIEW fixes**: 5 docs patched (container-wide-batch-import, folder-scoped-import, dnd-cleanup-robustness, textlog-polish, edit-preview-asset-resolution)
- **Final result**: 42/42 CLOSED

## Next Feature Candidates (未着手)

Comparison matrix and recommendation are in the close strategy report (session record).
Top candidate: **Interactive task lists** (Markdown チェックボックスの inline toggle).
