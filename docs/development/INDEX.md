# Development Docs — Issue Index

Last updated: 2026-04-24（PKC Link Unification v0 foundation spec を追加: Color UI の前に参照基盤を確定）.

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
| 76 | `../spec/schema-migration-policy.md` | H-3 — schema_version migration path 設計正本化（USER_REQUEST_LEDGER S-21、自主運転モード第3号、docs-only） | 2026-04-15 | `data-model.md §15.3` の「未設計」を解消。新規 canonical spec を `docs/spec/` に追加。判断基準（additive vs breaking flow）、lazy / eager 適用（JSON 内部は lazy / IDB store 境界は eager）、11 の migration hook 経路（IDB load / `onupgradeneeded` / HTML Full / Light import / ZIP import / bundle import / merge-planner / exporter / transport profile / fixture helper）、canonical entry point `src/core/migrations/migrate-container.ts`（将来配置）、test 戦略 4 系列（unit / chain / round-trip / reject）、v2 到達時の実装順序 9 step を固定。production code touch 0、`SCHEMA_VERSION` 依然 `1`。`data-model.md §15.3 / §17` / `body-formats.md §14.2` / `merge-import-conflict-resolution.md §8.6` / `HANDOVER_FINAL.md §7.3 / §17` に cross-link 追加。テスト追加なし。 |
| 77 | `data-model/revision-branch-restore.md` | H-6 — Revision.prev_rid / content_hash の optional 追加（USER_REQUEST_LEDGER S-22、自主運転モード第4号、記録面のみ） | 2026-04-15 | `Revision` に 2 additive optional field を追加（`prev_rid?` = 同 entry_lid の直前 revision id / `content_hash?` = snapshot の FNV-1a-64 16-char lowercase hex digest）。`src/core/operations/hash.ts` を新規追加し pure BigInt 実装（UTF-8 正規化、astral-plane surrogate pair 対応）、`snapshotEntry` が両 field を populate（旧 rev は absent 維持、lazy 補填なし）。`parseRevisionSnapshot` / `restoreEntry` / `restoreDeletedEntry` は両 field を**読まない**（non-intrusive）ため restore 契約は完全維持。reducer / UI / user-action / schema_version touch 0。spec `data-model.md §6.1 / §6.2 / §6.2.1 / §15.2 / §15.5` 更新、`schema-migration-policy.md §6` lazy 既存例追加、`HANDOVER_FINAL.md §5.8` に 2026-04-15 追記。テスト +22（hash 7 / content_hash 4 / prev_rid 5 / backward compat 3 / round-trip 1 / restore integration 2）、既存 3781 tests 全 pass。C-1 revision-branch-restore 実装時の記録面の下地。 |
| 78 | `../spec/text-textlog-provenance.md` | H-8 — TEXT ↔ TEXTLOG 変換の非可逆境界と来歴設計（USER_REQUEST_LEDGER S-23、自主運転モード第5号、docs-only） | 2026-04-16 | `HANDOVER_FINAL.md §6.3` の「非可逆部分の未解消課題」を canonical spec として固定。TEXT→TEXTLOG / TEXTLOG→TEXT 非可逆境界を表形式で全項目網羅、許容損失の理由付け、`RelationKind = 'provenance'`（additive）の設計根拠・後方互換性、`Relation.metadata?: Record<string,string>`（additive）追加仕様、provenance ペイロード定義（`conversion_kind / split_mode / source_content_hash / converted_at / segment_count / selected_log_count`）、実装スライス A–D（A=本ドキュメント / B=RelationKind 追加 / C=metadata? 追加 / D=変換関数拡張）の順序と依存、テスト戦略スニペット、スキーマ互換性（全変更が v1 範囲内・SCHEMA_VERSION 更新不要）を記述。`data-model.md §5` RelationKind / Relation schema 更新（`provenance` 行追加 / `metadata?` フィールド行追加）、`textlog-text-conversion.md` 末尾に cross-link、`HANDOVER_FINAL.md §6.3` に解消マーカー追記。production code touch 0。テスト追加なし（Slice B–D 実装時に追加予定）。 |

### COMPLETED — Relations / References / Backlinks wave（2026-04-19〜20）

| # | File | Topic | Completed | Summary |
|---|------|-------|-----------|---------|
| 79 | `backlinks-panel-v1.md` | Backlinks Panel v1 — relations 別 sub-panel | 2026-04-19 | meta pane に relations 由来の backlinks を kind 別に表示する panel を v1 で追加。追加 reducer なし（pure derivation）、renderer のみ。以後 References umbrella / sidebar badge / badge-jump / relation delete UI / relation kind edit の起点 |
| 80 | `sidebar-backlink-badge-v1.md` | Sidebar backlink count badge | 2026-04-20 | sidebar の entry 行に relations 由来の inbound 件数 badge を表示。件数 0 は非表示。pure count helper + renderer のみ、action 追加なし |
| 81 | `backlink-badge-jump-v1.md` | Sidebar backlink badge → click jump | 2026-04-20 | badge クリックで meta pane の References / relations セクションへ scroll + flash。既存 `SELECT_ENTRY` 再利用、`data-pkc-action` delegation で実現 |
| 82 | `relation-delete-ui-v1.md` | Relation delete UI | 2026-04-20 | relation 行 × ボタンで 1 本ずつ削除。confirm + `DELETE_RELATION` 追加。undo は非対象、provenance 二重ガードは kind 編集側で |
| 83 | `relation-kind-edit-v1.md` | Relation kind inline edit | 2026-04-20 | relation 行の kind select で inline edit。`provenance` 行の保護は二重ガード（edit 禁止 + 削除 confirm 強化） |
| 84 | `unified-backlinks-v0-draft.md` | Unified Backlinks v0 — design draft | 2026-04-20 | 5 案比較と Option E（References umbrella）採用理由の docs-only draft。v1 で consumed |
| 85 | `unified-backlinks-v1.md` | Unified Backlinks v1 — References umbrella (Option E) | 2026-04-20 | relations / body refs / provenance を References として統一表示する umbrella。summary row v2 / clickable v3 の基盤 |
| 86 | `references-summary-row-v2.md` | References summary row v2 | 2026-04-20 | References header に件数サマリ行を追加（canonical count 契約）。clickable v3 がそのまま継承 |
| 87 | `references-summary-clickable-v3.md` | References summary clickable v3 | 2026-04-20 | サマリ行を clickable にして該当 section へ scroll + flash。sub-location-search の `NAVIGATE_TO_LOCATION` と非衝突 |

### COMPLETED — Provenance metadata wave（2026-04-20）

| # | File | Topic | Completed | Summary |
|---|------|-------|-----------|---------|
| 88 | `provenance-metadata-viewer-v1.md` | Provenance metadata viewer v1 | 2026-04-20 | `provenance` relation の `metadata` を meta pane の References 内で参照可能に。raw display + key 一覧 |
| 89 | `provenance-metadata-pretty-print-v1.md` | Provenance metadata pretty-print v1.x | 2026-04-20 | key scoped formatter（`converted_at` / `source_content_hash` / `segment_count` 等）で human-readable 表示。raw 切替可 |
| 90 | `provenance-metadata-copy-export-v1.md` | Provenance metadata copy / export v1 | 2026-04-20 | raw canonical JSON の copy（clipboard）+ export（`.json` download）。per-field copy / multi-relation bulk は scope 外で明示 |

### COMPLETED — Unified Orphan Detection v3 / Connectedness wave（2026-04-20）

| # | File | Topic | Completed | Summary |
|---|------|-------|-----------|---------|
| 91 | `unified-orphan-detection-v3-draft.md` | Unified Orphan Detection v3+ — design draft | 2026-04-20 | "fully unconnected" の定義候補の比較 + S1..S5 rollout 設計（docs-only）。contract に consumed |
| 92 | `unified-orphan-detection-v3-contract.md` | Unified Orphan Detection v3 — behavior contract | 2026-04-20 | "any relation inbound/outbound + body ref 到達性" を fully unconnected 判定に。S3 / S4 実装の契約、S5 filter は Defer（§7.4） |
| 93 | `connectedness-s3-v1.md` | Connectedness S3 — `buildConnectednessSets` | 2026-04-20 | pure helper。relation + body ref を横断的に連結成分として算出（S4 以降の基盤）。`isMarkdownEvaluatedArchetype` は後に inline 化（`dead-code-inventory-after-relations-wave.md §3.1` 参照） |
| 94 | `connectedness-s4-v1.md` | Connectedness S4 — sidebar fully-unconnected marker | 2026-04-20 | sidebar で fully-unconnected entry を marker 表示。S3 sets を消費、reducer 変更なし |
| 95 | `orphan-detection-ui-v1.md` | Orphan detection UI v1 | 2026-04-20 | relations ベースの orphan 表示 UI v1（v3 の fully-unconnected marker とは別軸、両立） |

### COMPLETED — Dead-code / dead-path maintenance wave（2026-04-19〜21）

| # | File | Topic | Completed | Summary |
|---|------|-------|-----------|---------|
| 96 | `dead-path-cleanup-inventory-01.md` | Dead-path cleanup round 1 | 2026-04-19 | 未使用 export / pseudo-API / spec-only シンボルの audit（core 寄り）。Resolution 表が正本 |
| 97 | `dead-path-cleanup-inventory-02-adapter-ui.md` | Dead-path cleanup round 2（adapter/ui） | 2026-04-19 | adapter/ui 層の audit。A-class 不在、follow-up は intentional defer |
| 98 | `dead-path-cleanup-inventory-03-features.md` | Dead-path cleanup round 3（features） | 2026-04-19 | features 層 audit。`isValidEntryRef` は仕様宣言のため保持、round 4 に継承 |
| 99 | `dead-path-cleanup-inventory-04-platform-markdown-textlog-container.md` | Dead-path cleanup round 4 | 2026-04-19 | platform / markdown / textlog / container 層 audit。PR #40（slugify 重複解消）/ PR #41（`updateLogEntry` 削除）を実施 |
| 100 | `dead-path-cleanup-inventory-05-round5.md` | Dead-path cleanup round 5 | 2026-04-19 | round 5 audit。PR #44（features barrel 削除）/ PR #46（calendar month helper）/ PR #47（record:reject 整合）を実施 |
| 101 | `dead-path-decision-features-barrel.md` | Decision — features barrel 削除 | 2026-04-19 | barrel 削除と `entryMatchesQuery` 保持を分離した決定ログ。PR #44 で執行済み |
| 102 | `dead-path-decision-isUlid-updateLogEntry.md` | Decision — isUlid / updateLogEntry | 2026-04-19 | `isUlid` 保持 / `updateLogEntry` 削除の決定ログ。PR #41 で `updateLogEntry` 削除済み、`isUlid` は C（spec 宣言）として保持 |
| 103 | `dead-code-inventory-after-relations-wave.md` | Dead-code inventory after relations wave | 2026-04-21 | relations wave 後の未使用 export 監査。Category A 2 件は同 PR 内で解消（`isMarkdownEvaluatedArchetype` inline 化 + 1 件削除）。Category B/C/D 空 |

### COMPLETED — P1–P5 wave（2026-04-21）

| # | File | Topic | Completed | Summary |
|---|------|-------|-----------|---------|
| 104 | `recent-entries-pane-v1.md` | P1 — Recent Entries Pane v1 | 2026-04-21 | `created_at` desc の派生ビューを sidebar 上段に開閉可能な `<details>` として追加。container 変更 / reducer 変更 / 新 action いずれも無し。S4 orphan marker と対の UX |
| 105 | `breadcrumb-path-trail-v1.md` | P2 — Breadcrumb / Path Trail v1 | 2026-04-21 | 既存 breadcrumb 実装を spec 化し、軽微 hardening を追加。segment click で `SELECT_ENTRY`、sidebar scroll 不要な迷子補修 |
| 106 | `entry-rename-freshness-audit.md` | P3 — Entry Rename Freshness Audit | 2026-04-21 | rename 直後の表示 freshness 監査（docs-only）。stale surface は 1 件（entry-window title）のみ。follow-up は #107 で実装 |
| 107 | `entry-window-title-live-refresh-v1.md` | P3 follow-up — Entry-window title live refresh v1 | 2026-04-21 | entry-window の title を親 entry の rename に追従。既存 `QUICK_UPDATE_ENTRY` 経路再利用、archetype label など v1 非対象は §6 で明示 |
| 108 | `saved-searches-v1.md` | P4 — Saved Searches v1 | 2026-04-21 | filter / query / sort 組み合わせを named slot に保存 / 復元。localStorage 永続化、container 契約は非変更。rename / pin / date-range 等は §9 で v1+ 明示 |
| 109 | `extension-capture-v0-draft.md` | P5 — Extension Capture v0 draft | 2026-04-21 | 外部 extension → PKC2 capture の設計 draft（docs-only）。`record:offer` 再利用 Option B を推奨、次 PR は `docs/spec/record-offer-capture-profile.md` 策定。実装はまだ |
| 110 | `next-feature-prioritization-after-relations-wave.md` | Next-feature prioritization memo | 2026-04-21 | P1–P5 軸の棚卸し docs-only memo。P1–P4 + P3 follow-up は本 wave で shipped、P5 のみ draft 段階 |

### COMPLETED — Hook subscription / Transport record wave（2026-04-19〜20）

| # | File | Topic | Completed | Summary |
|---|------|-------|-----------|---------|
| 111 | `transport-record-accept-reject-consistency-review.md` | Transport `record:accept` / `record:reject` consistency review | 2026-04-19 | 送受非対称の整合性レビュー。PR #45 / #47 で解消 |
| 112 | `transport-record-reject-decision.md` | Transport `record:reject` — sender-only decision | 2026-04-19 | sender-only 方針を固定。関連 `capability.ts` / tests に反映 |
| 113 | `pkc-message-hook-subscription-review.md` | Hook subscription — design review | 2026-04-20 | docs-only、論点整理。Defer 決定に supersede |
| 114 | `pkc-message-hook-subscription-poc.md` | Hook subscription — PoC design | 2026-04-20 | docs-only、PoC 設計。Defer 期間中は凍結保存 |
| 115 | `pkc-message-hook-subscription-acceptance.md` | Hook subscription — acceptance contract | 2026-04-20 | docs-only、acceptance 仕様。Defer 下で据え置き |
| 116 | `pkc-message-hook-subscription-decision.md` | Hook subscription — Go/No-Go decision（**canonical entry point**） | 2026-04-20 | **結論: Defer**。実装前に simpler proof path（polling 等）を通す方針。以後、hook subscription の canonical reference はこの doc |

### COMPLETED — UI continuity wave（2026-04-22）

ユーザ報告 7 件を起点にした docs-first investigation × 最小 PR × 複数本 の連鎖。`HANDOVER_FINAL.md §23` で closure record。

| # | File / PR | Topic | Completed | Summary |
|---|---|---|---|---|
| 117 | PR #99 | Cluster B: scroll-preservation helper | 2026-04-22 | `preserveCenterPaneScroll(mutate)` を `bindActions` local に 1 本追加、`toggle-todo-status` / `toggle-sandbox-attr` / `toggle-log-flag` を統合。TEXTLOG checkbox / HTML 許可 checkbox の上戻りを解消 |
| 118 | PR #100 | Cluster C: recent pane collapse state | 2026-04-22 | `AppState.recentPaneCollapsed?: boolean` + `TOGGLE_RECENT_PANE` action + renderer state 駆動化。Recent pane を畳んでも次 render で復活する現象を解消 |
| 119 | PR #101 | Cluster A: state-driven storage profile overlay | 2026-04-22 | `AppState.storageProfileOpen?: boolean` + `OPEN/CLOSE_STORAGE_PROFILE` actions + renderer 所有化。`root.innerHTML = ''` による即消滅を解消。メニュー全体の event wiring 主因も同 PR で除去 |
| 120 | PR #102 | Cluster E (low-risk optimization): shared `LinkIndex` per render | 2026-04-22 | `buildConnectednessSets(container, linkIndex?)` に optional 引数追加、renderShell で 1 回計算して sidebar / meta で共有。compute 半減、bundle +0.05 kB |
| 121 | PR #103 | Cluster C' first wave: opt-in reveal policy | 2026-04-22 | `SELECT_ENTRY` / `NAVIGATE_TO_LOCATION` に `revealInSidebar?: boolean` を additive 追加、reducer を opt-in gate、reveal 必須 2 経路（storage-profile / entry-ref）のみ明示 opt-in |
| 122 | PR #104 | Cluster C' follow-up: reveal policy lockdown | 2026-04-22 | 残り 6 経路（recent pane / calendar kb nav / kanban kb nav / calendar drop / kanban drop / relative folder nav）の reveal 不要を決定理由コメント + 回帰テストで固定。実コード不変、bundle size 変化なし |
| 123 | PR #105 | Cluster D first slice: child window shortcut bridge | 2026-04-22 | child window inline script に keydown listener を追加、Ctrl+S → 既存 `pkc-entry-save` path、Escape → `cancelEdit()` / `window.close()`。parent 側は完全に不変 |
| 124 | `storage-profile-footprint-scope.md` | Storage Profile — asset-only vs full container footprint の scope 固定（docs-only） | 2026-04-22 | 現状 Storage Profile が `container.assets` のみを集計する asset-only profile であることと、ユーザが期待していた "text body / relations / revisions を含む full container footprint" が未実装かつ別概念であることを正本化。Slice A(UI label clarification) / B(body bytes column) / C(relations & revisions) / D(persisted vs export size) / E(manual & doc update) の additive 実装候補を整理、`storage-profile-ui.md` 側にも冒頭 scope note を cross-link 追加。実コード変更なし |
| 125 | `child-window-shortcut-parity-status.md` | Child window shortcut parity — 残件監査の正本化（docs-lite） | 2026-04-22 | PR-ζ₁(#105, Ctrl/Cmd+S + Escape) / PR-ζ₂(date/time 6 shortcut) の後、残る main-shell shortcut を **parity / intentional non-parity / backlog** の 3 bucket に棚卸し。`mod+?` / pane toggle / `mod+N` / `mod+Enter` / arrow / Enter / `/` / asset picker 系は child の UI 不在により意図的 non-parity、`mod+Z/Y` は親子共通 backlog。audit の結果 tiny omission は無し、コード変更なし |
| 126 | `../spec/tag-color-tag-relation-separation.md` | W1: Tag / Color tag / Relation 概念分離（docs-first） | 2026-04-23 | 次 feature wave(tag / search / UI)前に概念境界を正本化。Tag = 自由文字列の軽量属性、Color tag = 固定 palette の視覚フォーカス属性、Relation = entry 間の型付きリンクを明確に分離。categorical relation は残し新 Tag と併存、structural relation は木構造専用で本ドラフト不変。判断フレーム(4 問) / UI 命名(タグ/カラー/関連/配置/由来) / 5 軸検索(全文/archetype/Tag/Color/Relation) / additive migration 方針(schema bump なし、既存 categorical を即時変換しない) / next slice A-F を整理。実コード変更なし |
| 127 | `ui-vocabulary-tag-color-relation.md` | W1 Slice A: UI vocabulary 固定（docs-only） | 2026-04-23 | #126 の続編。実際に UI で使う日本語 / 英語 label を 10 語の表として固定(タグ / カラー / 関連 / 分類・意味・時系列・由来 / 配置 / 被参照 / 参照)。Tag chip と Color 色バーと Relation list を視覚的に別レイヤに保つ規約、avoid / banned wording 一覧(categorical を "タグ" と呼ばない / structural を "関連" 単独で書かない 等)、5 軸 filter バーの見せ方、検索構文の prefix 予約(`tag:` / `color:` / `rel:` / `type:`、実装は Slice C で)を整理。実コード変更なし、manual 同期は Tag UI 実装着地後 Slice D で対応 |
| 128 | `../spec/tag-data-model-v1-minimum-scope.md` | W1 Slice B: Tag data model additive minimum-scope draft（docs-only） | 2026-04-23 | #126 / #127 の続編。`entry.tags?: string[]` を additive 追加する最小 schema を固定: 欠落=空配列同義、insertion-order 保持、重複・空文字・改行は reject、R1-R8 normalization ルール(trim / max 64 char / max 32 件 / 制御文字 reject / 大文字小文字区別 / NFC は minimum scope 外)、schema_version bump なしの additive migration、既存 categorical relation と併存。`state.tagFilter` (現 categorical peer lid 単一) を `state.categoricalPeerFilter` に rename する計画を 7.1-7.6 で提示、saved-search の persisted key `tag_filter` は旧 key 読み込み互換を 1-2 release 保持。実コード変更なし、rename は別 slice、Slice C/D/E/F を next-step 整理 |
| 129 | Rename slice | `state.tagFilter` → `state.categoricalPeerFilter` 機械的一括 rename | 2026-04-23 | Slice B §7 計画の実施。in-memory は `categoricalPeerFilter` / `SET_CATEGORICAL_PEER_FILTER { peerLid }` / `SavedSearchSourceFields.categoricalPeerFilter` に刷新。persisted JSON は `categorical_peer_filter` を write、legacy `tag_filter` は read-only fallback で 1-2 release 維持。DOM action-name(`filter-by-tag` / `clear-tag-filter`)は renderer 契約維持のため意図的に不変。5027/5027 tests pass(+2 backward-compat)、bundle rebuild。grep audit 済、live reference 残存なし |
| 130 | `../spec/search-filter-semantics-v1.md` | W1 Slice C: Search / filter semantics draft（docs-only） | 2026-04-23 | Rename slice 後の正本として 5 軸(FullText / Archetype / Tag / Color / CategoricalPeer)の semantics を固定。軸間 AND、Tag は軸内 AND-by-default、Color は軸内 OR、Archetype は軸内 OR、FullText / CategoricalPeer は単一値。prefix 構文 `tag:` / `color:` / `type:` / `rel:` を予約(parser は別 slice G)、quote / OR(`\|`) / negation は部分予約のみ。Saved Search additive: `tag_filter_v2?: string[]`(legacy `tag_filter` との名前衝突回避)+ `color_filter?: ColorTagId[] \| null`。flat fallback 契約は変更せず、filter / selection / reveal の責務分離を明示(PR-ε₁/ε₂ 整合)。次 slice D(Tag filter data-path)→ E(Saved Search schema)→ F(Tag chip UI)→ G(parser)推奨 |
| 131 | `src/adapter/ui/render-continuity.ts` (NEW) | A-1/A-2: 再描画起因バグ根本対策 — scroll / focus continuity | 2026-04-23 | `captureRenderContinuity(root)` + `restoreRenderContinuity(root, snapshot)` を新設。sidebar / center-content / meta 各 region の scrollTop + `data-pkc-field` / `data-pkc-log-id` / `data-pkc-lid` による focus 位置を snapshot → restore。renderer.ts から呼ぶだけで再描画後のスクロール飛び・フォーカス消失を防止 |
| 132 | `src/adapter/platform/folder-prefs.ts` (NEW) | A-4: collapsedFolders localStorage 永続化 | 2026-04-23 | `loadCollapsedFolders(containerId)` / `saveCollapsedFolders(containerId, lids)` を新設。localStorage key `pkc2.folderPrefs`、値は `{ [container_id]: string[] }`。container 切り替え時にページリロードなしで各 container の折り畳み状態を復元 |
| 133 | `src/styles/base.css` (MODIFIED) | D-1: Tag chip CSS 最小整備 | 2026-04-23 | Tag chip 表示 / 入力 / フィルタ系クラス群を追加(~150 行)。同時に未参照 3 クラス(`.pkc-attachment-field` / `.pkc-detached-preview-img` / `.pkc-guardrail-info`)を削除、重複 D-1 ルールを統合して CSS サイズ最適化。CSS budget を 90 KB → 94 KB に更新(`build/check-bundle-size.cjs`) |
| 134 | `src/features/search/filter.ts` (MODIFIED) | W1 Slice D: Tag filter 軸 AND-by-default 実装 | 2026-04-23 | `filterByTags(entries, filter)` 追加(AND-by-default、空 Set = 軸無効、missing/empty tags は非マッチ、case-sensitive `===`)。`applyFilters` を 4th param `tagFilter?` に拡張してバックコンパット維持。17 テスト追加 |
| 135 | `src/features/search/query-parser.ts` (NEW) | `tag:` parser 最小 slice | 2026-04-23 | `parseSearchQuery(raw)` → `{ fullText: string, tags: ReadonlySet<string> }` 新設。lowercase `tag:` prefix のみ認識、値は case-sensitive 保持、bare `tag:` はドロップ、`TAG:` 等は FullText 扱い(§5.6)。`applyFilters` / `entryMatchesQuery` / `renderer.ts highlightMatchesIn` が内部で使用。`state.searchQuery` は raw のまま — reducer は strip しない。17 テスト(query-parser.test.ts) + filter.test.ts 12 テスト追加 |
| 136 | `docs/spec/search-filter-semantics-v1.md` (UPDATED) | W1 Tag wave クローズ docs-only sync | 2026-04-23 | §1.1 as-of 追加、§3 Tag 行を ✅ 実装済みに更新、§3.1 Tag 詳細更新、§5.1 を 実装済み/予約 split に再構成、§5.7 を parser 実装済み記述に更新、§9 を着地済み/残作業 split に書き換え、Status 行を W1 wave クローズとして更新 |
| 137 | `../spec/color-tag-data-model-v1-minimum-scope.md` (NEW) | Color tag data model minimum-scope spec（docs-only） | 2026-04-24 | W1 Tag wave クローズ直後の隣接概念整理。`entry.color_tag?: ColorTagId \| null` を additive 追加する最小 schema を固定: 1 entry に 1 color、固定 palette、ID のみ保存(色値は保存しない / theme 変更に追従)、ID は lowercase ASCII fixed、未知 ID は read で `null` にフォールバックしつつ round-trip で保持、schema_version bump なし。filter 軸は OR semantics、`color:` prefix は既に `search-filter-semantics-v1.md` §5.1 で予約、Saved Search `color_filter?: ColorTagId[] \| null` は additive。Tag / categorical relation と自動変換しない契約。palette 具体 ID は次 slice で fix、それまで Slice 2-4(Saved Search / UI / parser)は着手不可。実コード変更なし |
| 138 | `../spec/pkc-link-unification-v0.md` (NEW) | PKC Link Unification v0 foundation spec（docs-only） | 2026-04-24 | Color UI の前に置く参照基盤正本化。target と presentation を厳密に分離: **target** は `entry:<lid>` / `asset:<key>` / **permalink** `pkc://<container_id>/entry/<lid>[#frag]`、**presentation** は link `[label](entry:...)` / embed `![alt](entry:...)` / card `@[card](entry:...)` の 3 形を記法で区別。paste 変換は permalink → internal への **降格は同一 container のみ**、cross-container は permalink 維持。`@[card]` 採用の根拠(§10.1): target/presentation 混同回避 / 既存 markdown fallback / extract scanner 単一化 / variant 拡張余地。missing target は body から消さず placeholder 描画、循環 embed は 1 段展開、export は subset scanner 経由で依存閉包。`schema_version` bump なし、既存 `entry:` / `asset:` grammar(`entry-ref.ts`)は不変。Slice 1-5(permalink parser → paste → cross-container render → card render → share UI)を next-step として整理、実コード変更なし |

## Post-Stabilization Wave — 2026-04-19〜21

下の **Stabilization Phase — 2026-04-12** は当時の判断の履歴として残すが、
2026-04-19 以降の relations / references / provenance / orphan / P1–P5 /
hook subscription / transport wave が連続で landing したため、その節の
「新規実装よりもユーザからの新たな痛み待ちが妥当」という判断は現況を
反映していない。現況のサマリは:

- Relations / References / Backlinks 層: 9 docs shipped（#79–#87）
- Provenance metadata 層: 3 docs shipped（#88–#90）
- Unified Orphan Detection v3 / Connectedness 層: 5 docs shipped（#91–#95）、**S5 filter は Defer**（contract §7.4）
- Dead-code / dead-path maintenance: 8 docs shipped（#96–#103）
- P1–P5 wave: **P1 / P2 / P3 / P3 follow-up / P4 shipped**、**P5 は docs-only draft（implementation pending）**（#104–#110）
- Transport record: 2 docs shipped（#111–#112）
- Hook subscription: 4 docs shipped（#113–#116）、**結論は Defer**

次 wave の実装候補は `next-feature-prioritization-after-relations-wave.md`
および本 `CANDIDATE` 節 §P5 / §Hook subscription / §S5 を参照。

## Stabilization Phase — 2026-04-12

`project-priority-refresh.md` の棚卸し結果、直近のユーザ指摘は全て閉じ、残り候補は
いずれも「今やる妥当性が薄い」状態。**新規実装よりもユーザからの新たな痛み待ちが妥当**
と判定。以下の CANDIDATE 群は参照目的で保持する（優先度の昇格は新規報告後に行う）。

## CANDIDATE — Next Feature

### Relations / References / Provenance / Orphan / P1–P5 wave — 完了

本 CANDIDATE 節はかつて keyboard navigation の Phase 集約を主軸に書かれていたが、
2026-04-19〜21 の wave で軸は変わった。現況の候補は **P5 extension capture receiver side** が本命、
その他は **Defer**。詳細は `next-feature-prioritization-after-relations-wave.md`。

### Active candidate — P5 Extension Capture（receiver side）

| 項目 | 内容 |
|---|---|
| Status | **draft / pending implementation** |
| Draft | `extension-capture-v0-draft.md`（2026-04-21、docs-only、`record:offer` 再利用 Option B 推奨） |
| 次 PR 候補 | `docs/spec/record-offer-capture-profile.md` を docs-only で策定（payload spec 固定） |
| その後 | receiver 側実装（transport 拡張 / reducer capture action / provenance attach / origin allowlist / size cap / tests） |
| size | medium |
| arch risk | medium（transport 契約拡張 + 外部由来 sanitization） |

### Deferred — S5 Orphan Filter

| 項目 | 内容 |
|---|---|
| Status | **Defer**（canonical: `unified-orphan-detection-v3-contract.md §7.4`） |
| 根拠 | S4 sidebar marker で "気づき" は成立。filter は実需の積み上げ待ち |
| 昇格条件 | "orphan 一覧だけを取り出したい" 実需が明示されたとき |

### Deferred — Hook Subscription 実装

| 項目 | 内容 |
|---|---|
| Status | **Defer**（canonical: `pkc-message-hook-subscription-decision.md`） |
| 根拠 | review / PoC / acceptance / decision の 4 doc で論点は固定。実装前に simpler proof path（polling 等）を通す方針 |
| 昇格条件 | polling ベースの実用価値が検証され、かつ hook の追加投資に釣り合う pain が具体化したとき |

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
| A-2 | `text-split-edit-in-entry-window.md` | entry window TEXT split edit | **COMPLETED 2026-04-14（S-13）** |
| A-3 | `table-of-contents-right-pane.md` | 右ペイン TOC | **COMPLETED 2026-04-12** |
| A-4 | `search-ux-partial-reach.md` | 検索 sub-location ヒット | **COMPLETED 2026-04-14（S-15 + S-18、FULLY PROMOTED）** |

**Stabilization re-entry (2026-04-12)**: A-1 + A-3 で「読める / 俯瞰できる」
まで到達。**A-2 / A-4 は 2026-04-14 に USER_REQUEST_LEDGER §1 で正式昇格・完了済み**。
Category A は全 4 件が完了に移行。

### Category B — Markdown / Rendering Extensions (`docs/development/markdown-extensions/`)

| # | File | Topic | Status |
|---|------|-------|--------|
| B-1 | `markdown-csv-table-extension.md` | CSV fenced block → table | **COMPLETED 2026-04-14（S-16）** |
| B-2 | `markdown-code-block-highlighting.md` | code block syntax highlight | **COMPLETED 2026-04-13（P-13 retrofit）** |
| B-3 | `markdown-quote-input-assist.md` | 引用入力補助 | **PARTIALLY COMPLETED — Slice α（continuation）2026-04-14（S-17）**。empty exit / bulk prefix / entry-window 同期は CONDITIONAL |

### Category C — Data Model Extensions (`docs/development/data-model/`)

| # | File | Topic | Status |
|---|------|-------|--------|
| C-1 | `revision-branch-restore.md` | revision 復元 | CANDIDATE（記録面は S-22 / H-6 で先置き済み） |
| C-2 | `entry-ordering-model.md` | entry 手動 ordering | **COMPLETED 2026-04-17（S-32）** |
| C-3 | `link-index-entry.md` | link index entry | **COMPLETED 2026-04-17（S-33）** |
| C-4 | `spreadsheet-entry-archetype.md` | spreadsheet archetype | CANDIDATE |
| C-5 | `complex-entry-archetype.md` | complex (composite) archetype | CANDIDATE |
| C-6 | `document-set-archetype.md` | document-set archetype | CANDIDATE |
| C-7 | `office-preview-strategy.md` | office file preview | CANDIDATE |

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
- **Initial result**: 42/42 CLOSED（2026-04-11 時点）
- **追補（2026-04-21）**: その後 #43–#116 が COMPLETED として順次追加され、本ファイル上で **42 CLOSED + 74 COMPLETED（relations / references / provenance / orphan / P1–P5 / hook / transport / dead-path maintenance を含む）** に拡大。close 再監査は次 PR で整理予定
