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
| 24 | `multi-select-design.md` | Multi-select design spec | Design doc; impl completed (#46) |
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
| 45 | `attachment-sandbox-phase5.md` | Container default sandbox policy | 2026-04-11 | `ContainerMeta.sandbox_policy` (strict/relaxed)。per-entry override 優先の fallback chain。meta pane に select UI。テスト 11 件。 |
| 46 | `calendar-kanban-multi-select-phasing.md` | Calendar/Kanban multi-select (Phase 1 + 2-A/B/C/E + ghost) | 2026-04-11 | Phase 1: visual feedback。Phase 2-A: BULK_SET_STATUS。Phase 2-B: BULK_SET_DATE (set + clear)。Phase 2-C: multi-DnD (Kanban/Calendar/cross-view)。Phase 2-E: Escape clear。Drag ghost: N件バッジ。テスト 76 件追加。残: 2-D (表示順)。 |
| 47 | `multi-dnd-drag-ghost-ux.md` | Multi-DnD drag ghost (N件バッジ) | 2026-04-11 | multi-drag 時に setDragImage で件数バッジ表示。Kanban/Calendar 共通。テスト 9 件。 |
| 48 | `keyboard-navigation-phase1.md` | Keyboard navigation Phase 1 (Arrow Up/Down) | 2026-04-11 | Sidebar で Arrow Up/Down によるエントリ移動。SELECT_ENTRY 再利用。container lid 検証で stale DOM 防御。テスト 15 件。 |
| 49 | `stale-listener-prevention.md` | Stale listener prevention (test infra) | 2026-04-11 | テスト間の dispatcher onState/onEvent リスナー漏れを auto-tracking wrapper で解消。本番コード変更なし。テスト 2 件追加。 |
| 50 | `keyboard-navigation-phase2-enter.md` | Keyboard navigation Phase 2 (Enter) | 2026-04-11 | Enter で選択中エントリの編集開始。既存 BEGIN_EDIT 再利用。reducer/renderer 変更なし。テスト 12 件。 |
| 51 | `keyboard-navigation-phase3-tree.md` | Keyboard navigation Phase 3 (Arrow Left/Right) | 2026-04-11 | Arrow Left/Right で folder の折りたたみ/展開。TOGGLE_FOLDER_COLLAPSE 再利用。sidebar 限定。テスト 18 件。 |
| 52 | `keyboard-navigation-phase4-parent.md` | Keyboard navigation Phase 4 (Arrow Left → parent) | 2026-04-11 | collapsed folder で Arrow Left → 親フォルダ選択。getStructuralParent 再利用。テスト 15 件。 |
| 53 | `keyboard-navigation-phase5-child.md` | Keyboard navigation Phase 5 (Arrow Right → child) | 2026-04-11 | expanded folder で Arrow Right → 最初の子を選択。getFirstStructuralChild 新規追加。テスト 16 件。 |
| 54 | `keyboard-navigation-phase6-nonfolder-parent.md` | Keyboard navigation Phase 6 (non-folder Left → parent) | 2026-04-11 | non-folder entry で Arrow Left → 親フォルダ選択。archetype guard 緩和のみ。テスト 15 件。 |

## CANDIDATE — Next Feature

### Keyboard Navigation — Completion Snapshot

| Phase | Key | Action | Status |
|-------|-----|--------|--------|
| 1 | Arrow Up/Down | sidebar navigation | COMPLETED |
| 2 | Enter | begin edit | COMPLETED |
| 3 | Arrow Left/Right | collapse/expand | COMPLETED |
| 4 | Arrow Left (collapsed folder) | move to parent | COMPLETED |
| 5 | Arrow Right (expanded folder) | select first child | COMPLETED |
| 6 | Arrow Left (non-folder) | move to parent | COMPLETED |

**Summary**:
- Sidebar tree keyboard navigation は **Phase 1–6 で完成**
- Left/Right symmetric: folder も non-folder も Arrow Left で親に戻れる
- Navigation + Edit の基本操作はすべて keyboard で完結可能
- sidebar 限定で積み上げ、reducer / renderer 変更なし
- テスト合計 91 件

### Keyboard Navigation — Not Implemented

- Calendar/Kanban keyboard navigation → **設計ドキュメント作成済み** (`calendar-kanban-keyboard-navigation.md`)
- Shift+Arrow range selection

### Next Candidates

| | Calendar/Kanban keyboard Phase 1 |
|---|---|
| ユーザ価値 | 高 — マウスなしで view 内操作 |
| コスト | 中 — 方式 C (viewMode 分岐) で adapter 内完結 |
| リスク | 中 — Kanban 先行で scope 制御可能 |
| 妥当性 | **◎** — 設計ドキュメント完了、実装可能 |

設計方針: 方式 C (viewMode 分岐)、reducer 変更なし、Kanban → Calendar の順で実装。
詳細: `calendar-kanban-keyboard-navigation.md`

### 保留候補

| 候補 | 保留理由 |
|------|---------|
| Phase 2-D: SELECT_RANGE 表示順対応 | Ctrl+click で代替可能。設計負債だが実害小 |
| Sidebar multi-DnD | structural relation の cycle detection 複雑化。BULK_MOVE で代替可能 |
| TEXTLOG drag-to-reorder | oldest-first storage 不変条件と衝突。設計変更議論が先 |

## Close Audit Summary

- **First audit**: 2026-04-11 (broad scan)
- **Strict re-audit**: 2026-04-11 (per-item evidence with code/test/doc check)
- **CLOSE_NEEDS_REVIEW fixes**: 5 docs patched (container-wide-batch-import, folder-scoped-import, dnd-cleanup-robustness, textlog-polish, edit-preview-asset-resolution)
- **Final result**: 42/42 CLOSED
