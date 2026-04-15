# Development Docs — Issue Index

Last updated: 2026-04-14.

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
| 55 | `calendar-kanban-keyboard-navigation.md` | Kanban keyboard Phase 1 (Arrow navigation) | 2026-04-11 | Kanban view で Arrow Up/Down (列内) + Left/Right (列間) navigation。viewMode 分岐で sidebar 不変。テスト 24 件。 |
| 56 | `calendar-kanban-keyboard-navigation.md` | Calendar keyboard Phase 1 (Arrow navigation) | 2026-04-11 | Calendar view で Arrow Left/Right (日移動) + Up/Down (週移動)。空セル/空週スキップ。月境界 no-op。テスト 24 件。 |
| 57 | `calendar-kanban-keyboard-navigation.md` | Kanban keyboard Phase 2 (Space status toggle) | 2026-04-11 | Kanban view で Space → todo status toggle。QUICK_UPDATE_ENTRY 再利用。multi-select 非対応。テスト 15 件。 |
| 58 | `entry-window-interactive-task-toggle.md` | Entry window interactive task toggle | 2026-04-11 | entry window 内 task checkbox を click → 親 `QUICK_UPDATE_ENTRY` → `pushViewBodyUpdate` で反映。TEXTLOG は per-log-entry 描画 + `data-pkc-log-id` で識別。readonly CSS guard。protocol 追加: `pkc-entry-task-toggle`。テスト 16 件。 |
| 59 | `task-completion-badge.md` | Task completion badge (sidebar + detail pane) | 2026-04-11 | TEXT/TEXTLOG の task list 進捗を sidebar + detail pane に `done/total` badge 表示。`countTaskProgress()` pure helper。TEXTLOG は全 log entry 合算。task 0 件は非表示。全完了は success 色。テスト 26 件。 |
| 60 | `kanban-keyboard-phase3-ctrl-arrow.md` | Kanban keyboard Phase 3 (Ctrl+Arrow status move) | 2026-04-11 | Kanban view で Ctrl+Arrow Left/Right により todo status を列方向に変更。KANBAN_COLUMNS 参照。QUICK_UPDATE_ENTRY 再利用。single selection のみ。テスト 18 件。 |
| 61 | `entry-window-task-completion-badge.md` | Entry window task completion badge | 2026-04-12 | entry window view title row に `done/total` badge 追加。child 側で `#body-view` DOM から `.pkc-task-checkbox` をカウントして導出。protocol 変更なし。parent 側変更なし。4 経路で同期（init/push/save/flush）。テスト 16 件。 |
| 62 | `entry-window-structured-editor-parity.md` | Entry window structured editor parity | 2026-04-12 | TEXTLOG/todo/form の entry window 編集を raw JSON → presenter ベース構造化エディタに修正。`syncDomPropertiesToHtml()` で outerHTML シリアライズ前の DOM property→HTML 同期契約を確立。TEXTLOG save 後 per-log-entry 再描画修正。テスト 19+11 件。 |
| 63 | `ui-readability-and-editor-sizing-hardening.md` | UI readability & editor sizing hardening (Slices A + B + C) | 2026-04-12 | Slice B: PDF / HTML sandbox preview に `position: relative; z-index: 10000` で CRT scanline overlay を除外。Slice C: center pane textarea `rows = max(15, lineCount+3)` + entry window 非構造化 textarea を `data-pkc-viewport-sized` + `data-pkc-wide` で viewport 追従。Slice A: `:root` に `--font-body` / `--radius-sm` / `--c-text` / `--c-text-dim` を定義、`.pkc-md-rendered` line-height 1.45、`pre` 1.35。テスト 10+4+6+11 = 31 件。 |
| 64 | `orphan-asset-auto-gc.md` | Orphan asset auto-GC on container-replacement paths (Tier 2-1) | 2026-04-14 | `removeOrphanAssets` を `SYS_IMPORT_COMPLETE` (reduceReady / reduceError) + `CONFIRM_IMPORT` の 3 経路に wiring。0 件時は identity 維持で既存 integration test を壊さない。非対象経路（DELETE_ENTRY/COMMIT_EDIT/QUICK_UPDATE_ENTRY/BULK_DELETE）は revision restore との整合のため手動掃除に据え置き。テスト 8 件追加。 |
| 65 | `bulk-restore-ui.md` | Bulk restore UI for BULK_* revisions (Tier 2-2) | 2026-04-14 | `data-pkc-action="restore-bulk"` + `data-pkc-bulk-id` ボタンを meta pane の History と trash panel に追加。action-binder が `getRevisionsByBulkId` で解決 → confirm → N 件の `RESTORE_ENTRY` dispatch（partial-success semantic）。新 reducer action 追加なし。テスト 14 件追加。 |
| 66 | `../spec/merge-import-conflict-resolution.md` | Merge import conflict resolution — design spec (Tier 2-3, docs-only) | 2026-04-14 | 複数 container の merge import に関する設計仕様を `docs/spec/` に追加。衝突軸 5 種（entry/asset/relation/revision/metadata）を整理、3 案（A: Overlay / B: Policy-driven / C: Staging）を比較して **Option A** を MVP 採用。`features/import/merge-planner.ts` の pure helper と `CONFIRM_MERGE_IMPORT` 1 action 追加で完結。実装・テスト変更なし。data-model.md §11.7.4 / §14.6 / §15.5 に相互リンク追加。 |
| 67 | `merge-import-implementation.md` | Merge import Overlay MVP impl (Tier 3-1) | 2026-04-14 | `features/import/merge-planner.ts`（pure）+ `CONFIRM_MERGE_IMPORT` / `SET_IMPORT_MODE` reducer cases + `CONTAINER_MERGED` event + preview UI の mode radio + 5 行 merge サマリ + orphan auto-GC の merge 経路拡張。`AppState.importMode?: 'replace'\|'merge'` を optional で追加（既存 AppState リテラル fixture の regression 回避）。I-Merge1 / I-Merge2 を厳守。テスト 29 件追加（planner 13、reducer+integration+UI 16）。`data-model.md §14.6` に I-IO1b を追加。 |
| 68 | `release-automation-and-smoke-baseline.md` | Tier 3-2 — release automation + bundle size budget + Playwright smoke baseline | 2026-04-14 | `.github/workflows/release.yml`（`v*` tag push で GitHub Release 自動作成、`dist/pkc2.html` + `PKC2-Extensions/pkc2-manual.html` を artifact 添付、prerelease 判定あり）。`build/check-bundle-size.cjs` + ci.yml に hard-fail budget（bundle.js 615 KB / bundle.css 90 KB、現状 79.8% / 78.5%）。`tests/smoke/app-launch.spec.ts` 1 本（boot → Text create → editing phase）を `.github/workflows/smoke.yml` で push-to-main / PR-to-main 時に実行。自前 static server `scripts/smoke-serve.cjs` で `http-server` の readiness race を回避。production code は 1 行も触らない。 |
| 69 | `lint-baseline-realignment.md` | Tier 3-3 — lint baseline realignment + CI blocking 化 | 2026-04-14 | `.eslintrc.cjs` を CLAUDE.md §Architecture に整合。adapter→features 禁止ルール撤去（83 errors 解消）。features→adapter / runtime→(anything) 禁止ルール追加で forward drift を pin。`no-unused-vars` に `varsIgnorePattern: '^_'` で 6 errors 解消。9 件の test 内 `any` warning を `eslint-disable-next-line` + reason で止血。`ci.yml` の lint step から `continue-on-error: true` を削除 → blocking に昇格。`merge-planner.ts` の `while (true)` → `for (;;)` に変換（意味同一）。production code logic 変更 0、既存 3607 tests + smoke 1 件全 pass。HANDOVER §6.8 を "解消済み" に更新。 |
| 70 | `markdown-extensions/markdown-code-block-highlighting.md` | B-2 — fenced code block syntax highlight (retroactive 反映) | 2026-04-13 (実装) / 2026-04-14 (status 整合) | commit `92921ec` で実装済み。pure features tokenizer（sticky-regex walker、~3 KB gzipped）+ 9 言語（ts/js/json/html/css/bash/yaml/diff/sql/powershell）+ 主要 alias。markdown-it `highlight:` hook 経由で TEXT / TEXTLOG / preview / entry-window / export HTML の全 5 経路に伝播。`--c-tok-*` カラー変数で dark/light theme override。テスト 18 件（features 層）。本セッション（2026-04-14）で B-2 が「待機」のままだった ledger / dev doc / INDEX を整合させ、A-2 × B-2 統合テスト 1 件を `tests/adapter/entry-window-syntax-highlight.test.ts` に追加（split editor preview が highlight を乗せることを pin）。 |
| 71 | `markdown-extensions/markdown-csv-table-extension.md` | B-1 — CSV / TSV fenced block → `<table>` (USER_REQUEST_LEDGER S-16) | 2026-04-14 | `features/markdown/csv-table.ts` に RFC 4180 subset parser（quote / 内部 delimiter / 内部 newline / doubled-quote / CRLF / 空入力フォールバック）+ rectangular HTML renderer + `renderCsvFence`。`markdown-render.ts` の `md.renderer.rules.fence` を上書きして CSV lang 検出時のみ短絡、それ以外は default fence renderer に委譲（B-2 syntax highlight 経路を温存）。`csv` / `tsv` / `psv` + `noheader` flag 対応。XSS 安全（cell 内 HTML escape）。`.pkc-md-rendered table` の既存 CSS を再利用、追加クラス `pkc-md-rendered-csv` で CSV 由来 table を識別。テスト 24（pure parser）+ 8（markdown-it integration、pipe-table 非 regression / B-2 fallback / XSS escape / quoted+newline+escape / empty fallback）。S-15 search-mark とは text 節レベルで自然合成。 |
| 72 | `markdown-extensions/markdown-quote-input-assist.md` | B-3 Slice α — `> X` 行で Enter → `\n> ` 自動継続（USER_REQUEST_LEDGER S-17、PARTIALLY COMPLETED） | 2026-04-14 | `features/markdown/quote-assist.ts` に pure helper `computeQuoteAssistOnEnter(value, caretPos)`、`action-binder.ts` の handleKeydown 内 Enter 分岐で wire（inline-calc 直後 / Ctrl+Enter 直前）。`isSlashEligible` で markdown 対象 textarea に限定、`execCommand('insertText')` で undo stack 保護 + fallback 経路。fall-through: mid-line Enter / 空 `> ` 行 / 非引用行 / Shift・Ctrl・Alt / IME composition / non-collapsed selection。テスト 12（pure）+ 9（handler integration）。残り Slice β（empty `> ` で exit）/ γ（選択範囲 prefix toggle shortcut）/ entry-window 同期は CONDITIONAL のまま。 |
| 73 | `search-ux-partial-reach.md` | A-4 FULL — 検索 UX 実用完成（USER_REQUEST_LEDGER S-18） | 2026-04-14 | supervisor 判断で Slice 刻みをやめ 1 テーマで完成。`features/search/sub-location-search.ts`（TEXT 見出し単位 / TEXTLOG log 単位 / 他 archetype 無視、fenced skip、dedup、maxPerEntry cap）+ 新 user action `NAVIGATE_TO_LOCATION { lid, subId, ticket }` + `AppState.pendingNav` + `adapter/ui/location-nav.ts` の `createLocationNavTracker`（ticket gate + scroll + `.pkc-location-highlight` 1.6s flash）+ main.ts onState 末尾で `tracker.consume`。renderer sidebar flat-mode で `.pkc-entry-subloc` 行 emit、action-binder に `navigate-to-location` case + 単調増加 ticket カウンタ。S-15 `<mark>` と合成、B-2 / A-2 / S-17 と非衝突。テスト +46（pure 21 / nav helper 15 / e2e 10）。 |
| 74 | `pane-state-persistence.md` | H-7 — pane collapse/expand を localStorage で永続化（USER_REQUEST_LEDGER S-19、自主運転モード第1号） | 2026-04-14 | `adapter/platform/pane-prefs.ts`（storage key `pkc2.panePrefs`、in-memory cache、invalid JSON / no-storage fallback）+ `adapter/ui/pane-apply.ts`（DOM apply 共有ヘルパ）+ renderer が shell 組み立て時に `loadPanePrefs()` を読んで `data-pkc-collapsed` を即セット（flash なし）+ `togglePane` が `setPaneCollapsed` + `applyOnePaneCollapsedToDOM` 経由でクリック・shortcut・tray どの経路でも保存。reducer / AppState / user-action への touch 0、HANDOVER §6.2 を「解消済み」に更新。テスト +27（storage 12 / apply 6 / e2e 9、既存 pane-toggle-shortcut test は beforeEach に cache+localStorage clear を追加）。 |
| 75 | `textlog-csv-zip-export.md` | H-4 — textlog CSV `flags` 列追加で forward-compat round-trip（USER_REQUEST_LEDGER S-20、自主運転モード第2号） | 2026-04-14 | `features/textlog/textlog-csv.ts` に `flags` 列を末尾追加 + `KNOWN_TEXTLOG_FLAGS` allow-list + `parseFlagsField` helper。serializer は `important` と `flags` を両方出力（backward-compat）、parser は header に `flags` 列がある場合それを正本にし、無ければ `important` に fallback。unknown token は silent drop（forward-compat）、dedup + 大小文字・空白許容。`TextlogFlag` 拡張時も modern × modern round-trip は lossless に。data model / reducer / UI への touch 0。spec `body-formats.md §3.6.1` を「lossy → modern × modern lossless、legacy 互換維持」に更新。dev doc column contract の row 8 追加。テスト +12（serializer 3 / precedence 4 / backward compat 2 / tolerant parse 3）。HANDOVER §5.7 を「解消済み」に更新。 |

## Stabilization Phase — 2026-04-12

`project-priority-refresh.md` の棚卸し結果、直近のユーザ指摘は全て閉じ、残り候補は
いずれも「今やる妥当性が薄い」状態。**新規実装よりもユーザからの新たな痛み待ちが妥当**
と判定。以下の CANDIDATE 群は参照目的で保持する（優先度の昇格は新規報告後に行う）。

## CANDIDATE — Next Feature

### Keyboard Navigation — Completion Snapshot

**Sidebar** (Phase 1–6): 完成

| Phase | Key | Action | Status |
|-------|-----|--------|--------|
| 1 | Arrow Up/Down | sidebar navigation | COMPLETED |
| 2 | Enter | begin edit | COMPLETED |
| 3 | Arrow Left/Right | collapse/expand | COMPLETED |
| 4 | Arrow Left (collapsed folder) | move to parent | COMPLETED |
| 5 | Arrow Right (expanded folder) | select first child | COMPLETED |
| 6 | Arrow Left (non-folder) | move to parent | COMPLETED |

**Kanban** (Phase 1 + 2 + 3): 完成

| Key | Action | Status |
|-----|--------|--------|
| Arrow Up/Down | 列内移動 | COMPLETED |
| Arrow Left/Right | 列間移動 (index clamp) | COMPLETED |
| Space | status toggle (open ↔ done) | COMPLETED |
| Ctrl+Arrow Left/Right | status move (directional) | COMPLETED |

**Calendar** (Phase 1): 完成

| Key | Action | Status |
|-----|--------|--------|
| Arrow Left/Right | 日移動 (空セルスキップ) | COMPLETED |
| Arrow Up/Down | 週移動 (±7 days, 空週スキップ) | COMPLETED |

**Summary**:
- Sidebar tree keyboard navigation は Phase 1–6 で完成
- Kanban keyboard Phase 1 (navigation) + Phase 2 (Space toggle) + Phase 3 (Ctrl+Arrow status move) 完了
- Calendar keyboard Phase 1 (navigation) 完了 — 日移動 + 週移動、月内限定
- 全 3 view で navigation 完成 + Kanban は action 操作も完成
- テスト合計 172 件（Sidebar 91 + Kanban 57 + Calendar 24）

### Keyboard Navigation — Not Implemented

- Calendar Phase 2 (month wrap, empty cell cursor)
- Shift+Arrow range selection

### Next Candidates

| | Calendar Phase 2 (month wrap) | Shift+Arrow range selection |
|---|---|---|
| ユーザ価値 | 低 — Phase 1 で主要操作は完了 | 中 — keyboard multi-select |
| コスト | 中 — re-render + 新 state 候補 | 高 — multiSelectedLids 統合 |
| リスク | 中 — scope 膨張 (wrap 範囲) | 高 — Phase 2-D 未解決 |
| 妥当性 | △ — 必要性が薄い | △ — 前提が未整備 |

設計: `calendar-kanban-keyboard-navigation.md` §9

### 保留候補

| 候補 | 保留理由 |
|------|---------|
| Phase 2-D: SELECT_RANGE 表示順対応 | Ctrl+click で代替可能。設計負債だが実害小 |
| Sidebar multi-DnD | structural relation の cycle detection 複雑化。BULK_MOVE で代替可能 |
| TEXTLOG drag-to-reorder | oldest-first storage 不変条件と衝突。設計変更議論が先 |
| Calendar Phase 2 (month wrap) | 必要性が薄い。Phase 1 で主要操作は完了 |
| Shift+Arrow range selection | Phase 2-D 未解決。前提が未整備 |

## Idea Inventory — 2026-04-12

`project-priority-refresh.md` 後に収集したアイデアを粒度ごとに分解・正規化。
実装は行わず、各 idea を 1 ファイル = 1 テーマで spec 化した。
カテゴリ間の参照は各 doc 末尾「将来拡張の余地」に記載。

### Category A — Immediate UX Improvements (`docs/development/`)

| # | File | Topic | Status |
|---|------|-------|--------|
| A-1 | `textlog-readability-hardening.md` | TEXTLOG 境界/日付/秒表示 | **COMPLETED 2026-04-12** |
| A-2 | `text-split-edit-in-entry-window.md` | entry window TEXT split edit | STANDBY |
| A-3 | `table-of-contents-right-pane.md` | 右ペイン TOC | **COMPLETED 2026-04-12** |
| A-4 | `search-ux-partial-reach.md` | 検索 sub-location ヒット | **NEXT IF PAIN REMAINS** |

**Stabilization re-entry (2026-04-12)**: A-1 + A-3 で「読める / 俯瞰できる」
まで到達。A-4 は自然な次候補だが必須ではない。ユーザが A-1 / A-3 を実際に
触って「まだ探しにくい」という痛みが残った場合のみ着手する。そうでなければ
停止し、新たな痛み待ちに戻る。

### Category B — Markdown / Rendering Extensions (`docs/development/markdown-extensions/`)

| # | File | Topic |
|---|------|-------|
| B-1 | `markdown-csv-table-extension.md` | CSV fenced block → table |
| B-2 | `markdown-code-block-highlighting.md` | code block syntax highlight |
| B-3 | `markdown-quote-input-assist.md` | 引用入力補助 |

### Category C — Data Model Extensions (`docs/development/data-model/`)

| # | File | Topic |
|---|------|-------|
| C-1 | `revision-branch-restore.md` | revision 復元 |
| C-2 | `entry-ordering-model.md` | entry 手動 ordering |
| C-3 | `link-index-entry.md` | link index entry |
| C-4 | `spreadsheet-entry-archetype.md` | spreadsheet archetype |
| C-5 | `complex-entry-archetype.md` | complex (composite) archetype |
| C-6 | `document-set-archetype.md` | document-set archetype |
| C-7 | `office-preview-strategy.md` | office file preview |

### Category D — Long-Term Vision (`docs/vision/`)

| # | File | Topic |
|---|------|-------|
| D-1 | `pkc-message-externalization.md` | entry message 送受信 |
| D-2 | `pkc-multi-window-architecture.md` | multi-window 協調 |
| D-3 | `webrtc-p2p-collaboration.md` | WebRTC P2P |
| D-4 | `pkc-application-scope-vision.md` | application scope 定義 |

## Close Audit Summary

- **First audit**: 2026-04-11 (broad scan)
- **Strict re-audit**: 2026-04-11 (per-item evidence with code/test/doc check)
- **CLOSE_NEEDS_REVIEW fixes**: 5 docs patched (container-wide-batch-import, folder-scoped-import, dnd-cleanup-robustness, textlog-polish, edit-preview-asset-resolution)
- **Final result**: 42/42 CLOSED
