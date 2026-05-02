# PKC2 — User Request Ledger

**Status**: living ledger（常時更新）
**Date**: 2026-04-22（UI continuity wave closure を反映）
**Previous**: 2026-04-21（relations / references / provenance / orphan wave + P1–P5 wave + hook subscription Defer + transport record）
**Purpose**: これまでの **ユーザーが明示した要望** を棚卸しし、**完了 / 部分完了 / 未完** の 3 値で仕分ける正本台帳。以後のセッションは本台帳を起点に未完を拾い、無ければ「最も user value が高い残余 polish」を 1 件選ぶ運用。

---

## 0. サマリ

| 状態 | 件数 |
|-----|-----|
| **ユーザー明示要望 — 完了** | **75**（2026-04-21 時点 68 + 2026-04-22 UI continuity wave +7、うち #2 は主因除去の partial として完了扱い）|
| **ユーザー明示要望 — 部分完了** | **1**（S-51 P5 Extension Capture — v0 docs-only draft 完了、receiver 実装は pending）|
| **ユーザー明示要望 — 未完（着手中）** | 0 |
| 待機中候補（idea / vision / HANDOVER decline、§3） | **14**（重複込 18、H-3 / H-4 / H-6 / H-7 / H-8 / H-10 完了、A-4 / B-3 部分完了統合済、C-2 / C-3 完了移行済）※ §3 自体は 4/19 以降の wave で新規追加なし |

**結論（2026-04-14 時点の記録）**: supervisor が台帳 §3 から **B-2（syntax highlight）** を昇格提案した
が、走査の結果 B-2 は **既に実装済み**（commit `92921ec` / 2026-04-13）と判明。
台帳の §3.2 が stale だった（CANDIDATE 表記が残っていた）。本セッションは
**ledger 整合修正 + dev doc / INDEX の状態同期 + A-2 × B-2 統合テスト 1 本追加**
を行う。新規実装ではなく **棚卸し誤差の解消**。前回（A-2）昇格分も完了済
（commit `7d717de`、§1 S-13）。

§3 待機: 27 → 26（B-2 が完了に移動）。
完了: 25 → 26（B-2 を §2 に retroactive で追加）。

**2026-04-21 追補**: 2026-04-17 以降、relations / references / provenance / orphan wave と
P1–P5 wave、hook subscription Defer、transport record decision が連続で landing。
S-34〜S-56（§1 末尾）として retrospective 追記（docs-only 部分を含む）。
§1 内の多くは wave 単位で連続 landing したため、commit hash は個別に列挙せず
**実装 doc path を根拠列に置く**（`../development/*.md`）。

### 台帳の走査レイヤ（網羅確認済み）

| ソース | 走査方法 | 取り込み先 |
|--------|---------|-----------|
| 本セッション supervisor prompts | 会話履歴全数（12 prompts） | §1 |
| pre-session 会話 → HANDOVER_FINAL / CHANGELOG / dev INDEX | cross-reference | §2 |
| `docs/development/*.md` | `Status:` grep + 目視分類 | §3.1 / §3.2 / §3.3 / §3.5 |
| `docs/development/data-model/*.md` | 全 7 ファイル読了 | §3.3 (C-1〜C-7) |
| `docs/development/markdown-extensions/*.md` | 全 3 ファイル読了 | §3.2 (B-1〜B-3) |
| `docs/development/INDEX.md` CANDIDATE / 保留節 | §101-164 | §3.6 |
| `docs/vision/*.md` | 全 4 ファイル | §3.4 (D-1〜D-4) |
| `docs/spec/merge-import-conflict-resolution.md §9` | 直接参照 | §3.5 H-10 |
| `docs/planning/HANDOVER_FINAL.md §5 / §6 / §7 / §18` | 全節走査 | §3.5 (H-1〜H-10) |
| `docs/requirements/00_最初の要件.md` | 既に Gen2 の前提要件として実装済み | §2 に吸収 |

---

## 1. 本セッション内の明示要望（12 件、すべて完了）

| # | 要望 | 出典（最近セッション） | 状態 | 根拠（commit / file） | 次アクション |
|---|------|------------------|------|---------------------|-------------|
| S-1 | Tier 1-1: GitHub Actions CI の導入 | supervisor prompt | 完了 | `ed3c85c` / `.github/workflows/ci.yml` | — |
| S-2 | Tier 1-2: manual 6 枚の screenshot を実機キャプチャに差替 | supervisor prompt | 完了 | `dacb510` / `docs/manual/images/*.png` | — |
| S-3 | Tier 2-1: orphan asset auto-GC on import 経路 | supervisor prompt | 完了 | `ee3b90d` / `docs/development/orphan-asset-auto-gc.md` | — |
| S-4 | Tier 2-2: bulk restore UI for `BULK_*` revisions | supervisor prompt | 完了 | `ce7c559` / `docs/development/bulk-restore-ui.md` | — |
| S-5 | Tier 2-3: merge import conflict resolution 設計 spec | supervisor prompt | 完了 | `bb9fe52` / `docs/spec/merge-import-conflict-resolution.md` | — |
| S-6 | Tier 2 完了の正式固定（HANDOVER §18） | supervisor prompt | 完了 | `2f941a0` / `HANDOVER_FINAL.md §18.1–18.7` | — |
| S-7 | Tier 3 優先順位決定 | supervisor prompt | 完了 | `615877d` / `TIER3_PRIORITIZATION.md` | — |
| S-8 | Tier 3-1: merge import Overlay MVP 実装 | supervisor prompt | 完了 | `00e7f68` / `docs/development/merge-import-implementation.md` | — |
| S-9 | Tier 3-2: release automation + bundle size budget + Playwright smoke | supervisor prompt | 完了 | `99ec113` / `docs/development/release-automation-and-smoke-baseline.md` | — |
| S-10 | Tier 3-3 再評価 → C-4 採用 | supervisor prompt | 完了 | `560215b` / `TIER3_3_REEVALUATION.md` |  — |
| S-11 | Tier 3-3 実装: lint baseline 解消 | supervisor prompt | 完了 | `175d327` / `221797c` / `eab47e5` / `b0c6fe1` / `docs/development/lint-baseline-realignment.md` | — |
| S-12 | バグ修正: センターペイン sandbox が menus を覆う / context menu が描画領域外 | 「ついでにバグを直して」 | 完了 | `5276fa4` / `tests/adapter/context-menu-clamp.test.ts` | — |
| S-13 | **A-2 昇格: text split edit in entry window**（entry window の TEXT 編集を center pane と同じ split view に） | supervisor prompt「§3 から 1 件を正式昇格」 | 本セッション着手（未完→完了移行） | 本 commit + `tests/adapter/entry-window-split-edit.test.ts` | — |
| S-14 | **バグ報告: search 入力で 1 文字ごとにフォーカスが外れる / IME（日本語入力）が事実上使えない** | 「ついでに既存検索窓のバグを報告します / 1文字入れるたびにフォーカスが外れてしまい、日本語入力はメモ帳などで文章を作ってから、コピペする必要があります」 | 完了 | commit `5529207` / `tests/adapter/search-input-focus.test.ts` | — |
| S-15 | **A-4 部分昇格: search 結果から到達した entry の body 内で検索語をハイライト表示**（A-4 spec の Slice α — 視覚 `<mark>` のみ。indexer / sub-location action / scroll-to は意図的に保留） | supervisor prompt「A-4 promotion judgment 再開、昇格が妥当なら最小差分で 1 件だけ実装」 | 完了 | 本コミット + `src/features/search/highlight-matches.ts` + `tests/features/search/highlight-matches.test.ts` + `tests/adapter/search-mark-renderer.test.ts` | — |
| S-16 | **B-1 昇格: CSV / TSV fenced block を `<table>` としてレンダリング**（`docs/development/markdown-extensions/markdown-csv-table-extension.md` §4 minimum scope に整合。spreadsheet からのコピペがそのまま読みやすい表になる）| supervisor prompt「B-1 を §3 から正式昇格、最小差分で実装」 | 完了 | 本コミット + `src/features/markdown/csv-table.ts` + `tests/features/markdown/csv-table.test.ts` + 既存 `tests/features/markdown/markdown-render.test.ts` に integration 追加 | — |
| S-17 | **B-3 部分昇格: blockquote 行で Enter → 次行に `> ` を自動継続**（B-3 spec §4 のうち continuation のみ。空 `>` 行で Enter → 抜ける挙動 と 選択範囲 prefix toggle shortcut は意図的に保留） | supervisor prompt「B-3 を §3 から正式昇格、最小差分で実装」 | 完了 | 本コミット + `src/features/markdown/quote-assist.ts` + `tests/features/markdown/quote-assist.test.ts` + `tests/adapter/quote-assist-handler.test.ts` | — |
| S-18 | **A-4 フル昇格: 検索 UX を実用完成**（sub-location 結果表示 + クリックで entry 選択 + 該当位置へ scroll + 一時ハイライト。TEXT は見出し単位、TEXTLOG は log 単位。小刻み Slice ではなく「検索 = 見つけて到達できる」完成ラインまで 1 テーマ） | supervisor prompt「A-4 を部分補修ではなく、検索 UX の実用完成まで一気に持っていく」 | 完了 | 本コミット + `src/features/search/sub-location-search.ts` + `src/adapter/ui/location-nav.ts` + `NAVIGATE_TO_LOCATION` action + `AppState.pendingNav` + renderer のサイドバー sub-item + main.ts の post-render effect + テスト計 約 30 件 | — |
| S-19 | **H-7 pane state persistence**: sidebar / meta pane の collapsed/expanded 状態を localStorage に保存、再起動 / 再描画後も復元（自主運転モード第1号、supervisor 選定）| supervisor prompt「自主運転モードに切替 / 次テーマは pane state persistence」 | 完了 | 本コミット + `src/adapter/platform/pane-prefs.ts` + `src/adapter/ui/pane-apply.ts` + renderer の初期 collapsed 属性注入 + togglePane の persistence 連携 + tests | — |
| S-20 | **H-4 textlog CSV 拡張**: 新 `flags` 列を CSV に追加し、future TextlogFlag 拡張での round-trip 損失をゼロに。新 writer は `important` と `flags` を両方出力、新 reader は `flags` 列優先 + 無ければ `important` へ fallback。backward-compatible（既存 CSV / 旧 reader / 旧 writer すべて動作継続）。spec §3.6.1 を「lossy for pre-H-4 only」に更新（自主運転モード第2号）| supervisor prompt「次テーマは H-4 textlog CSV 拡張」 | 完了 | 本コミット + `src/features/textlog/textlog-csv.ts` 拡張 + tests + spec update | — |
| S-21 | **H-3 schema migration path 設計（docs-only）**: `data-model.md §15.3` の「未設計」を解消。新規 spec `docs/spec/schema-migration-policy.md` を策定し、schema_version 昇格の判断基準（additive vs breaking flow）・lazy/eager 適用判定・11 の migration hook 経路（IDB load / onupgradeneeded / HTML import / ZIP import / bundle import / merge-planner / exporter / transport profile / fixture）・canonical entry point `src/core/migrations/migrate-container.ts`（将来配置）・test 戦略 4 系列（unit / chain / round-trip / reject）・v2 到達時の実装順序 9 step を固定。`data-model.md §15.3 / §17`、`body-formats.md §14.2`、`merge-import-conflict-resolution.md §8.6`、`HANDOVER_FINAL.md §7.3 / §17` に cross-link 追加（schema_version migration path 行は「解消済み」に更新）。production code 変更 0。（自主運転モード第3号）| supervisor prompt「次テーマは H-3: schema migration path 設計 / docs-only」 | 完了 | 本コミット + `docs/spec/schema-migration-policy.md` 新規 + 4 spec cross-link | — |
| S-22 | **H-6 Revision.prev_rid / content_hash の optional 追加**: `Revision` に 2 つの additive optional field（`prev_rid?` = 同 entry_lid の直前 revision の id、`content_hash?` = snapshot の FNV-1a-64 16-char lowercase hex digest）を追加。`snapshotEntry` が両 field を populate（旧 rev は absent 維持、lazy 補填も行わない）、pure hash helper を `src/core/operations/hash.ts` に新規（BigInt で 64-bit 演算、UTF-8 正規化、astral-plane 対応）。reducer / UI / schema_version / user-action 一切 touch せず、C-1 revision-branch-restore の足場として**記録面のみ**強化。`parseRevisionSnapshot` / `restoreEntry` / `restoreDeletedEntry` は両 field を読まない（non-intrusive）。spec `data-model.md §6.1 / §6.2 / §6.2.1 / §15.2 / §15.5` 更新、`schema-migration-policy.md §6` 既存例追加、`HANDOVER_FINAL.md §5.8` 2026-04-15 追記。（自主運転モード第4号）| supervisor prompt「次は H-6: Revision.prev_rid / content_hash の optional 追加」 | 完了 | 本コミット + `src/core/model/container.ts` + `src/core/operations/hash.ts` 新規 + `src/core/operations/container-ops.ts` + `tests/core/revision-prev-rid-content-hash.test.ts`（22 tests） | — |
| S-29 | **textlog-replace v1.x — log 内 Selection only 拡張**（current log only の安全境界を維持しつつ、log textarea の selection を ON で対象範囲に） | supervisor prompt「textlog-replace v1.x — current log 内 Selection only」| 完了 | 本コミット + `src/adapter/ui/textlog-log-replace-dialog.ts` に Selection-only checkbox + open-time selection capture + range-shift-on-apply 追加（TEXT 側 S-27 と同一モデル）+ `tests/adapter/textlog-log-replace-dialog.test.ts`（+10 件、計 23 件）+ `docs/development/textlog-replace-current-log.md` の Scope / Selection only 節 / Test summary 更新 + `docs/spec/textlog-replace-v1-behavior-contract.md §4.2 / §4.3` に delivered 注記。共有 pure helper（`countMatchesInRange` / `replaceAllInRange`）は S-27 で既追加のため新規追加なし。production code touch は dialog 1 ファイルのみ。bundle +0.94 KB JS（gzip −0.12 KB）。tests 3910 → 3920 |
| S-30 | **Boot source policy revision（embedded pkc-data は view-only / IDB 拡張は明示 Import のみ）**: S-24 の「pkc-data 優先表示」を強化し、「受信者の既存 IDB workspace が Export HTML 起動時に上書きされない」構造的保証を入れる。新規 `AppState.viewOnlySource: boolean` + `SYS_INIT_COMPLETE.viewOnlySource` payload + `persistence.doSave()` の早期 return + 7 つの明示 Import reducer 経路で clear + boot source chooser overlay（pkc-data / IDB 両立時のみ）。pure helpers `chooseBootSource` / `finalizeChooserChoice` + `viewOnlySource` 遷移テスト一式 + post-implementation invariance audit（欠陥 0）+ manual 07 / 09 への最小同期 | supervisor prompt「次は boot source policy を revision で強化 → 監査 → manual 反映」 | 完了 | `d6c2d7b` fix(boot) + `b9bdf07` docs(audit+manual) + `src/adapter/platform/pkc-data-source.ts` + `src/adapter/platform/persistence.ts` viewOnly ガード + `src/adapter/state/app-state.ts` viewOnlySource 経路 + `src/adapter/ui/boot-source-chooser.ts` overlay + `src/main.ts §11` boot flow + `tests/adapter/pkc-data-source.test.ts` / `persistence.test.ts` / `boot-source-chooser.test.ts` + `docs/development/archived/boot-container-source/boot-container-source-policy-revision.md`（実装 spec）+ `docs/development/archived/boot-container-source/boot-container-source-policy-audit.md`（audit、欠陥 0）+ manual 07 / 09 の chooser / view-only 記述 | — |
| S-32 | **C-2 entry-ordering v1 — manual ordering（サイドバー手動並び替え） pipeline 完了**: minimum scope → behavior contract → pure/state slice → UI slice → audit → manual sync。`entry_order: string[]`（Container.meta への additive optional）+ `MOVE_ENTRY` user action + `applyManualOrder` pure helper + renderer で Manual セレクタ + ↑/↓ ボタン。audit で F-1（ルート/フォルダ混在時の位置計算）/ F-2（削除済み LID の order 残留）2 件を最小修正。manual 05 / 09 に Manual Order 節を同期。tests ±57 件（baseline 3953→3984 → 最終 4010）、全 passed | supervisor prompt「C-2 entry-ordering v1 を docs-first pipeline で閉じる」 | 完了 | `7cb52e5` min-scope + `b652fdc` contract + `8e3290d` pure/state + `78e3a36` UI + `53f32bd` audit + `a06a3b4` manual |
| S-33 | **C-3 link-index v1 — entry 間参照インデックス pipeline 完了**: minimum scope → behavior contract → pure helper slice → UI slice → audit → manual sync。runtime-only（AppState / schema 変更なし）。`entry:` scheme のみ対象、scannable archetype = text/textlog/folder/todo。`buildLinkIndex(container)` を render 時に呼び、meta pane に Outgoing / Backlinks / Broken の 3 セクションを追加。audit で欠陥 0（scope narrowing 2 件・pseudo-code 差分 3 件を記録）。manual 05 / 09 に「リンクインデックス」節 + トラブルシューティング 4 件 + 用語 2 件（Backlink / Broken link）を同期。tests 4059→4068 +9、全 passed | supervisor prompt「C-3 link-index v1 を docs-first pipeline で閉じる」 | 完了 | `183b7c8` min-scope + `3649ef0` contract + `835685f` pure + `bbcae24` UI + `ef036a0` audit + `0498176` manual |
| S-31 | **H-10 merge-conflict-ui v1 — behavior contract → pure slice → state slice → UI slice → audit → manual 同期**: merge mode preview 内の entry 単位 conflict UI を docs-first パイプラインで 1 本閉じる。contract は単一ファイル統合済み（`docs/spec/merge-conflict-ui-v1-behavior-contract.md`）、supervisor 確定事項 2 点を固定（multi-host 代表 = `updatedAt` 最新 + tie-break array index 昇順 / `contentHash` 入力 = `body + archetype`）。pure slice で `detectEntryConflicts` / `applyConflictResolutions` / `normalizeTitle` / `bodyPreview` を features 層に純関数として追加、state slice で `AppState.mergeConflicts` / `mergeConflictResolutions` + 3 user actions + `CONTAINER_MERGED` event 拡張 + CONFIRM_MERGE_IMPORT の imported filter + provenance relation append、UI slice で `renderMergeConflictSection` + C1/C2/C2-multi badge + bulk shortcut + disable gate。audit で DEFECT-1（統合 wiring 欠如、action-binder set-import-mode で `detectEntryConflicts` を dispatch する経路追加）と DEFECT-2（BULK keep-current で multi-host 既存値消去、`{ ...state.mergeConflictResolutions }` 起点で spread）を最小修正。manual 07 に「Merge mode と conflict 解決 UI」節、09 にトラブルシューティング 3 件 + 用語集 3 件（Entry Conflict / Merge mode / Provenance Relation）追加。tests +70 前後（pure 23 / state 13 / UI 11 / integration 3 / audit 更新）、全 3984 passed | supervisor prompt「H-10 を spec → 3 slice → audit → manual の順で閉じる。slice ごとに scope 厳守」 | 完了 | `9e26606` contract + `bbf8003` pure + `1b3dc40` state + `bc5cd72` UI + `6d5f8dd` audit fixes + `9570cc2` manual 同期 + `docs/spec/merge-conflict-ui-v1-behavior-contract.md`（統合済み） + `src/features/import/conflict-detect.ts` + `src/core/model/merge-conflict.ts` + `src/adapter/state/app-state.ts`（3 reducer case + CONFIRM_MERGE_IMPORT 拡張）+ `src/adapter/ui/renderer.ts`（conflict section）+ `src/adapter/ui/action-binder.ts`（3 handler + set-import-mode wiring）+ 4 テストファイル + `docs/development/merge-conflict-pure-slice.md` / `merge-conflict-state-slice.md` / `merge-conflict-ui-v1-audit.md` + manual 07 / 09 同期 | — |
| S-28 | **textlog-replace v1 実装（current log only）** | supervisor prompt「textlog-replace v1 / current log only の production 実装」| 完了 | 本コミット + 新規 `src/adapter/ui/textlog-log-replace-dialog.ts`（別 dialog モジュール、TEXT dialog 非破壊）+ `src/adapter/ui/textlog-presenter.ts` に 🔎 trigger 追加（各 log edit row）+ `src/adapter/ui/action-binder.ts` に `open-log-replace-dialog` handler + 共有 pure helper は `src/features/text/text-replace.ts` 既存を再利用（新規追加なし）+ `tests/adapter/textlog-log-replace-dialog.test.ts`（13 件）+ `docs/development/textlog-replace-current-log.md` | — |
| S-27 | **Find & Replace に "Selection only" オプション追加**（S-26 の自然拡張、current TEXT body 限定を維持） | supervisor prompt「次は Find & Replace の選択範囲のみ対応」| 完了 | 本コミット + `src/features/text/text-replace.ts` に `countMatchesInRange` / `replaceAllInRange` additive 追加 + `src/adapter/ui/text-replace-dialog.ts` に Selection-only checkbox + open-time selection capture + range-shift-on-apply ロジック追加 + `tests/features/text/text-replace.test.ts`（+11 件、計 31）+ `tests/adapter/text-replace-dialog.test.ts`（+9 件、計 24）+ `docs/development/text-replace-current-entry.md` / `docs/manual/05_日常操作.md` 更新 | — |
| S-26 | **current TEXT entry body 限定の find/replace ダイアログ**（最小 UI / preview hit count / regex opt-in / case-sensitive opt-in） | supervisor prompt「次テーマは current text entry 限定のテキスト置換機能」| 完了 | 本コミット + 新規 `src/features/text/text-replace.ts`（pure helpers: buildFindRegex / countMatches / replaceAll）+ `src/adapter/ui/text-replace-dialog.ts`（348 行、overlay singleton）+ `src/adapter/ui/action-binder.ts` `open-replace-dialog` handler + `src/adapter/ui/renderer.ts` 編集モード action bar に 🔎 Replace ボタン追加（text archetype 限定）+ `src/styles/base.css` に overlay/card/row/error CSS 追加 + `tests/features/text/text-replace.test.ts`（20 件）+ `tests/adapter/text-replace-dialog.test.ts`（15 件）+ `docs/development/text-replace-current-entry.md` | — |
| S-25 | **text/html paste 時の anchor → Markdown リンク正規化**（TEXT body 限定） | supervisor prompt「text/html 貼付時のリンク→Markdown 化」（追加要望 2 件のうち先に処理する方）| 完了 | 本コミット + 新規 `src/adapter/ui/html-paste-to-markdown.ts`（pure helper）+ `src/adapter/ui/action-binder.ts` handlePaste に `maybeHandleHtmlLinkPaste` 分岐追加 + `tests/adapter/html-paste-to-markdown.test.ts`（20 件）+ `tests/adapter/action-binder-html-paste.test.ts`（5 件）+ `docs/development/html-paste-link-markdown.md` | — |
| S-24 | **バグ修正: エクスポート HTML を開くと IDB 側の Container が優先表示される** | 「ついでに、エクスポートしたHTML開くとidb側のコンテナを優先して表示しちゃうの修正してほしい / エクスポートしたやつが見にくいのよ」 | 完了 | 本コミット + 新規 `src/adapter/platform/pkc-data-source.ts`（`readPkcData` 抽出 + `chooseBootSource` pure helper）+ `src/main.ts §11` で pkc-data 優先へ入れ替え + `tests/adapter/pkc-data-source.test.ts`（14 件）+ `docs/development/archived/boot-container-source/boot-container-source-priority.md` | — |
| S-23 | **H-8 TEXT ↔ TEXTLOG 変換の非可逆境界と来歴設計（docs-only）**: `HANDOVER_FINAL.md §6.3` の「非可逆部分の未解消課題」を canonical spec として固定。新規 `docs/spec/text-textlog-provenance.md`（353 行）を策定し、(1) TEXT→TEXTLOG / TEXTLOG→TEXT それぞれの非可逆境界を表形式で網羅、(2) 許容損失の理由付け、(3) `RelationKind = 'provenance'`（additive）の設計根拠、(4) `Relation.metadata?: Record<string,string>`（additive）の追加仕様、(5) provenance ペイロード定義（`conversion_kind / split_mode / source_content_hash / converted_at / segment_count / selected_log_count`）、(6) 実装スライス A–D の順序と依存関係、(7) テスト戦略スニペット、(8) スキーマ互換性（すべて v1 範囲・SCHEMA_VERSION 変更不要）を記述。`data-model.md §5` RelationKind / Relation schema 更新（`provenance` 追加、`metadata?` フィールド追加）、`textlog-text-conversion.md` 関連ドキュメントにクロスリンク追加、`HANDOVER_FINAL.md §6.3` に解消マーカー追記。production code 変更 0。（自主運転モード第5号）| supervisor prompt「次は H-8 provenance 設計 docs-only で進めます」 | 完了 | 本コミット + `docs/spec/text-textlog-provenance.md` 新規 + `data-model.md §5` 更新 + 3 cross-link | — |

### 1.1 Relations / References / Provenance / Orphan wave + P1–P5 wave + hook Defer + transport（2026-04-18〜21、retrospective 追記）

2026-04-17 以降に連続で landing した wave を retrospective に一括追記する。
commit hash は個別に列挙せず **実装 doc path を根拠列に置く**。
詳細は §6 変更履歴の 2026-04-19〜21 行、および `../development/INDEX.md §COMPLETED` #79–#116 を参照。

| # | 要望 | 出典（最近セッション） | 状態 | 根拠（doc path） | 次アクション |
|---|------|------------------|------|---------------------|-------------|
| S-34 | **Backlinks Panel v1**: meta pane に relations 由来の backlinks を kind 別に sub-panel 表示（pure derivation、reducer 追加なし） | supervisor prompt「Backlinks Panel v1」 | 完了 | `../development/backlinks-panel-v1.md` | — |
| S-35 | **Transport record consistency review + reject decision**: `record:accept` / `record:reject` 非対称性レビュー + sender-only 方針決定。PR #45 / #47 で解消済み | supervisor prompt「transport の record 周りの整合性を見てほしい」 | 完了 | `../development/transport-record-accept-reject-consistency-review.md` + `../development/transport-record-reject-decision.md` | — |
| S-36 | **Dead-path cleanup wave（round 1–5 + 2 decision doc）**: 未使用 export / pseudo-API / spec-only シンボルの整理。PR #40（slugify 重複）/ #41（`updateLogEntry` 削除、`isUlid` 保持）/ #44（features barrel 削除、`entryMatchesQuery` 保持）/ #46（calendar month helper）/ #47（record:reject 整合）を実施 | supervisor prompt「dead-path cleanup を体系化して」 | 完了 | `../development/dead-path-cleanup-inventory-0{1..5}.md` + `../development/dead-path-decision-{features-barrel,isUlid-updateLogEntry}.md` | — |
| S-37 | **Sidebar backlink count badge + click jump**: sidebar の entry 行に inbound 件数 badge を表示、クリックで meta pane の References / relations セクションへ scroll + flash | supervisor prompt「sidebar backlink badge と jump 動線」 | 完了 | `../development/sidebar-backlink-badge-v1.md` + `../development/backlink-badge-jump-v1.md` | — |
| S-38 | **Relation delete UI + Relation kind edit UI**: relation 行 × ボタンで 1 本削除（`DELETE_RELATION`、undo 非対象）、および kind inline edit（`provenance` 行の二重ガード = 編集禁止 + 削除 confirm 強化） | supervisor prompt「relation 削除 / kind 編集 UI」 | 完了 | `../development/relation-delete-ui-v1.md` + `../development/relation-kind-edit-v1.md` | — |
| S-39 | **Unified Backlinks v0 draft + v1 implementation（References umbrella, Option E）**: relations / body refs / provenance を References として統一表示。5 案比較の v0 draft → Option E 採用・v1 実装。summary row v2 / clickable v3 の基盤 | supervisor prompt「Unified Backlinks を 1 箇所に統合」 | 完了 | `../development/unified-backlinks-v0-draft.md`（docs-only、consumed）+ `../development/unified-backlinks-v1.md` | — |
| S-40 | **References summary row v2 + clickable v3**: References header に件数サマリ行を追加（canonical count 契約）、clickable で該当 section へ scroll + flash。sub-location-search の `NAVIGATE_TO_LOCATION` と非衝突 | supervisor prompt「References summary を clickable に」 | 完了 | `../development/references-summary-row-v2.md` + `../development/references-summary-clickable-v3.md` | — |
| S-41 | **Provenance metadata viewer + pretty-print + copy/export**: `provenance` relation の `metadata` を (a) raw display（viewer v1）、(b) key scoped formatter で整形（pretty-print v1.x、raw 切替可）、(c) raw canonical JSON の copy + export（`.json` download）。per-field copy / multi-relation bulk は scope 外 | supervisor prompt「provenance metadata の閲覧 / copy / export」 | 完了 | `../development/provenance-metadata-viewer-v1.md` + `../development/provenance-metadata-pretty-print-v1.md` + `../development/provenance-metadata-copy-export-v1.md` | — |
| S-42 | **Unified Orphan Detection v3（S1 draft → S2 contract → S3 `buildConnectednessSets` → S4 sidebar marker）完了 / S5 filter は Defer**: "any relation inbound/outbound + body ref 到達性" を fully unconnected 判定に。relations ベース orphan UI v1 も並列維持 | supervisor prompt「orphan 判定を relation + body ref 統合で」 | 完了（S5 のみ Defer） | `../development/unified-orphan-detection-v3-draft.md`（docs-only）+ `../development/unified-orphan-detection-v3-contract.md`（docs-only、§7.4 で S5 Defer 明示）+ `../development/connectedness-s3-v1.md` + `../development/connectedness-s4-v1.md` + `../development/orphan-detection-ui-v1.md` | — |
| S-43 | **Hook subscription 設計セット完了（Defer 決定）**: 外部 host からの PKC-Message hook subscription について 4 doc を docs-only で整備。**canonical = decision doc、結論: Defer**。実装前に simpler proof path（polling 等）を通す方針 | supervisor prompt「hook subscription を設計レビュー → 判断」 | 完了（Go/No-Go = Defer） | `../development/pkc-message-hook-subscription-decision.md`（canonical）+ `-review.md` + `-poc.md` + `-acceptance.md`（すべて docs-only） | — |
| S-44 | **Dead-code inventory after relations wave**: relations wave 後の未使用 export 監査 + 同 PR 内で Category A 2 件（`isMarkdownEvaluatedArchetype` inline 化 + 1 件削除）を解消。Category B / C / D は空 | supervisor prompt「relations wave 後の未使用 export 監査」 | 完了 | `../development/dead-code-inventory-after-relations-wave.md`（audit + cleanup） | — |
| S-45 | **Next-feature prioritization memo（docs-only）**: P1–P5 軸の棚卸し。P1 recent entries pane を最有力として提示、P2–P5 の位置付けを整理 | supervisor prompt「relations wave が一段落、次の軸を棚卸し」 | 完了 | `../development/next-feature-prioritization-after-relations-wave.md` | — |
| S-46 | **P1 Recent Entries Pane v1**: `created_at` desc の派生ビューを sidebar 上段に開閉可能な `<details>` として追加。container 変更 / reducer 変更 / 新 action いずれも無し。S4 orphan marker と対の UX | supervisor prompt「P1 recent-entries pane を 1 PR で」 | 完了 | `../development/recent-entries-pane-v1.md` | — |
| S-47 | **P2 Breadcrumb / Path Trail v1**: 既存 breadcrumb 実装を spec 化し、軽微 hardening を追加。segment click で `SELECT_ENTRY`、sidebar scroll 不要な「迷子」補修 | supervisor prompt「P2 breadcrumb 動線と spec 固定」 | 完了 | `../development/breadcrumb-path-trail-v1.md`（spec + additive hardening） | — |
| S-48 | **P3 Entry Rename Freshness Audit（docs-only）**: rename 直後の表示 freshness を監査。stale surface は 1 件（entry-window title）のみと判明。follow-up は S-49 | supervisor prompt「rename freshness を audit」 | 完了 | `../development/entry-rename-freshness-audit.md` | — |
| S-49 | **P3 follow-up — Entry-window title live refresh v1**: entry-window の title を親 entry の rename に追従。既存 `QUICK_UPDATE_ENTRY` 経路を再利用、archetype label など v1 非対象は §6 で明示 | supervisor prompt「audit の 1 件を follow-up で」 | 完了 | `../development/entry-window-title-live-refresh-v1.md` | — |
| S-50 | **P4 Saved Searches v1**: filter / query / sort 組み合わせを named slot に保存 / 復元。localStorage 永続化、container 契約は非変更。rename / pin / date-range 等は §9 で v1+ 明示 | supervisor prompt「P4 saved searches を v1 で」 | 完了 | `../development/saved-searches-v1.md` | — |
| S-51 | **P5 Extension Capture v0 draft（docs-only、部分完了）**: 外部 extension → PKC2 capture の設計 draft。`record:offer` 再利用 Option B 推奨、次 PR は `docs/spec/record-offer-capture-profile.md` 策定、以降で receiver 側実装 | supervisor prompt「P5 extension capture を draft」 | **部分完了**（v0 draft 完了、receiver 実装は pending） | `../development/extension-capture-v0-draft.md`（`Status: design draft — No implementation in this PR.`） | **次 PR: `docs/spec/record-offer-capture-profile.md` を docs-only で策定、その後 receiver 実装** |

### 1.2 UI continuity wave closure（2026-04-22、ユーザ報告 7 件起点の連鎖修正）

ユーザが直接報告した UI 不具合 7 件を起点に、docs-first investigation → 最小 PR × 複数本 で一括解消した wave。
全 PR の詳細は `HANDOVER_FINAL.md §23` と `../development/INDEX.md §COMPLETED` #117–#123 参照。

| # | 要望 / 症状 | 状態 | 対応 PR |
|---|---|---|---|
| S-52 | TEXTLOG チェックリストで画面が上に戻る | 完了 | PR #99（scroll-preservation helper、cluster B）|
| S-53 | HTML 許可 checkbox で画面が上に戻る | 完了 | PR #99（同上、同一 helper で解消）|
| S-54 | Recent pane を畳んでもすぐ開く | 完了 | PR #100（`recentPaneCollapsed` runtime state + `TOGGLE_RECENT_PANE` action、cluster C）|
| S-55 | ストレージプロファイルが見られない | 完了 | PR #101（`storageProfileOpen` state + overlay を renderer 所有化、cluster A）|
| S-56 | メニュー全体のイベント導線が壊れている疑い | **largely addressed** — 主因除去済み（= storage profile overlay の renderer-ownership 違反）、全面 event-wiring 監査は defer | PR #101（主因除去、cluster A 同梱）|
| S-57 | フォルダが勝手に全開する | 完了 | PR #103（`revealInSidebar?: boolean` opt-in、cluster C' first wave）+ PR #104（全 6 経路の lockdown、cluster C' follow-up）|
| S-58 | ダブルクリックの編集ウィンドウでショートカットが使えない | 完了（first slice: Ctrl+S / Escape）| PR #105（child window keyboard bridge、cluster D）|

**低リスク最適化（同時期、別トラック）**: PR #102 — `buildLinkIndex` 1-render-1-call 統一（render compute 半減、bundle は +0.05 kB）

**本 wave の production code 変更サマリ**:
- `AppState` additive field 2 件: `recentPaneCollapsed?: boolean` / `storageProfileOpen?: boolean`（いずれも runtime-only、persistence 非対象）
- `UserAction` additive 4 件: `TOGGLE_RECENT_PANE` / `OPEN_STORAGE_PROFILE` / `CLOSE_STORAGE_PROFILE` / `SELECT_ENTRY.revealInSidebar?` / `NAVIGATE_TO_LOCATION.revealInSidebar?`
- 共通 helper: `preserveCenterPaneScroll(mutate)`（action-binder 内 local）
- core / features / runtime / builder は不変、すべて adapter 層の variant 拡張と renderer/action-binder の最小改修で閉じた

**残件**:
- Menu 全体の全面 event-wiring 監査（S-56）: defer（主因は除去済み）
- Child window shortcut slice 2+（Ctrl+; / Ctrl+Enter 等）: defer（実需待ち）
- Folder auto-expand の calendar / kanban / view 切替経路への追加 opt-in: 現状 lockdown 済、実需待ち

---

## 2. pre-session の明示要望（12 件、すべて完了 — HANDOVER / CHANGELOG / development INDEX が根拠）

| # | 要望 | 出典 | 状態 | 根拠 |
|---|------|-----|-----|-----|
| P-1 | TEXT / TEXTLOG の表示幅 polish | HANDOVER §6 / #63 | 完了 | `ui-readability-and-editor-sizing-hardening.md` Slice C（textarea viewport-sized） |
| P-2 | Markdown line-height / 密度 | #63 Slice A + `textlog-markdown-density.md` | 完了 | `textlog-readability-hardening.md` (A-1) + Slice A |
| P-3 | selected-only HTML export | `selected-entry-html-clone-export.md` + `selected-entry-export-and-reimport.md` | 完了 | 両 dev doc が CLOSED |
| P-4 | ZIP / HTML export の役割分離 | `zip-export-contract.md` / `data-model.md §12` | 完了 | spec §12（HTML vs ZIP 契約境界） |
| P-5 | TEXTLOG ↔ TEXT 相互変換 | P1 Slice 4 + 5 / `textlog-text-conversion.md` | 完了 | CHANGELOG Added §「TEXTLOG ↔ TEXT 相互変換」 |
| P-6 | TODO / attachment の自動整理（auto-placement） | `auto-folder-placement-for-generated-entries.md` (#26) | 完了 | CLOSED dev doc |
| P-7 | Ctrl+\ / Ctrl+Shift+\ / Ctrl+? shortcut | P1 Slice 6 | 完了 | CHANGELOG Added §「pane 再トグル shortcut」 |
| P-8 | TODO / FOLDER description の markdown 化 | P1 Slice 3 | 完了 | CHANGELOG Added §「TODO / FOLDER description の markdown 化」 |
| P-9 | entry embed / preview / cycle guard | P1 Slice 2 / `embedded-preview-and-cycle-guard.md` | 完了 | CHANGELOG Added §「embed 拡張 / cycle guard」 |
| P-10 | TEXTLOG viewer polish | `textlog-polish.md` (#37) / `textlog-viewer-and-linkability-redesign.md` | 完了 | CLOSED dev doc |
| P-11 | Data メニューの Share / Archive / Import 分離 | manual screenshot 05 | 完了 | Tier 1-2 screenshot が Data panel 3 グループを確認 |
| P-12 | Batch import / folder-scoped import / select-only import | `container-wide-batch-import.md` / `folder-scoped-import.md` / `selective-import.md` | 完了 | CLOSED dev docs（複数） |
| P-13 | **B-2: code block syntax highlight**（fenced block の言語別色付け、TEXT / TEXTLOG / preview / entry-window 全経路）| `markdown-code-block-highlighting.md` | 完了 | commit `92921ec`（2026-04-13）/ `src/features/markdown/code-highlight.ts` / `tests/features/markdown/code-highlight.test.ts`（18 件）/ `base.css` `.pkc-tok-*` + `--c-tok-*` / `entry-window.ts` 1012 行付近の inline CSS forwarding |

---

## 3. 「痛み待ち」扱いで停止中の候補（ユーザー明示ではない ≒ 未完扱いではない）

これらは **ユーザーが明示して待機しているわけではなく**、こちら側が idea /
spec / policy として記録して「将来具体的な pain / 要求が出たら再開」と
した項目。台帳上の **未完** ではなく **standby / conditional / vision**。
完全列挙。

### 3.1 Category A — Immediate UX Improvements（`docs/development/`）

| ID | File | Status | 要約 | 昇格条件 |
|----|------|--------|-----|---------|
| A-1 | `textlog-readability-hardening.md` | COMPLETED 2026-04-12 | TEXTLOG 境界 / 日付 / 秒表示 | — |
| A-2 | `text-split-edit-in-entry-window.md` | **PROMOTED → §1 S-13（2026-04-14）** | entry window の TEXT 編集を center pane と同じ split view に | （昇格済み。supervisor が "Tier 3-3 まで終わった今、再び操作 UX を前に進めるのが自然" と判断、主軸非破壊 + 最小差分 + 操作文脈整合の 3 軸で選定） |
| A-3 | `table-of-contents-right-pane.md` | COMPLETED 2026-04-12 | 右ペインの TOC | — |
| A-4 | `search-ux-partial-reach.md` | **FULLY PROMOTED — 完了（§1 S-15 + S-18、2026-04-14）** | 検索 UX 完成: Slice α（S-15 `<mark>`）+ Slice β/γ（S-18 sub-location 結果 + scroll-to + 一時 highlight + 新 action `NAVIGATE_TO_LOCATION`）。TEXT は見出し単位 / TEXTLOG は log 単位に到達可能 | — |

### 3.2 Category B — Markdown / Rendering Extensions（`docs/development/markdown-extensions/`）

| ID | File | Status | 要約 | 昇格条件 |
|----|------|--------|-----|---------|
| B-1 | `markdown-csv-table-extension.md` | **完了済み（§1 S-16、2026-04-14）** | fenced CSV / TSV / PSV block を `<table>` にレンダリング。`csv noheader` 等の info string で header on/off 制御。XSS 安全（cell 内 HTML escape）。markdown-it `fence` rule 上書きで B-2 syntax highlight 経路と非衝突 | — |
| B-2 | `markdown-code-block-highlighting.md` | **完了済み（commit `92921ec` / 2026-04-13、§2 P-13 参照）** | code block の syntax highlight（独自 tokenizer、9 言語、~3 KB gzipped。highlight.js / Prism は採らず portable single-HTML 制約に整合） | — |
| B-3 | `markdown-quote-input-assist.md` | **PARTIALLY PROMOTED — Slice α（continuation）完了（§1 S-17、2026-04-14）/ 残り（empty exit / bulk prefix toggle / entry-window 同期）は CONDITIONAL** | 引用入力補助。`> X` 行で Enter → `\n> ` 自動継続のみ実装 | 「empty quote line で Enter → 抜けてほしい」「複数行を一括 quote 化したい」「entry-window でも効いてほしい」と追加報告 |

### 3.3 Category C — Data Model Extensions（`docs/development/data-model/`）

| ID | File | Status | 要約 | 昇格条件 |
|----|------|--------|-----|---------|
| C-1 | `revision-branch-restore.md` | CANDIDATE | revision から分岐復元 / branch tree（`prev_rid` additive field） | "古い版に戻ったあと分岐したい" 要求 |
| C-2 | `entry-ordering-model.md` | **完了済み（§1 S-32、2026-04-17）** | entry の手動 ordering（`entry_order: string[]` additive optional + `MOVE_ENTRY` action + `applyManualOrder` + Manual UI + audit F-1/F-2 修正 + manual 同期） | — |
| C-3 | `link-index-entry.md` | **完了済み（§1 S-33、2026-04-17）** | entry 間参照インデックス（runtime-only / entry: scheme のみ / Outgoing + Backlinks + Broken 3 section in meta pane / audit 欠陥 0 + manual 同期） | — |
| C-4 | `spreadsheet-entry-archetype.md` | CANDIDATE | spreadsheet archetype（CSV / XLSX 埋め込み編集） | 表計算を container で扱う要求 |
| C-5 | `complex-entry-archetype.md` | CANDIDATE | composite entry archetype（複数 archetype の combine） | 複合オブジェクト要求 |
| C-6 | `document-set-archetype.md` | CANDIDATE | document-set archetype（章立て文書） | 長文作成要求 |
| C-7 | `office-preview-strategy.md` | CANDIDATE | office ファイル（.docx / .xlsx / .pptx）preview 戦略 | Office 系 attachment 運用 |
| C-P1 | `textlog-viewer-and-linkability-redesign.md` | CANDIDATE（P1 structural redesign） | TEXTLOG を `entry:<lid>#log/<id>` 等で addressable な時系列文書に再定義。viewer / TOC / export / transclusion を `buildTextlogDoc` に一元化 | TEXTLOG で時系列ナビ / 参照が深刻な痛みに |

### 3.4 Category D — Long-Term Vision（`docs/vision/`）

| ID | File | Status | 要約 | 昇格条件 |
|----|------|--------|-----|---------|
| D-1 | `pkc-message-externalization.md` | vision | entry 間 / container 間 message 送受信プロトコル | 複数ユーザー協調の具体要求 |
| D-2 | `pkc-multi-window-architecture.md` | vision | multi-window 協調（別窓を full container にする） | multi-window 運用の具体要求 |
| D-3 | `webrtc-p2p-collaboration.md` | vision | WebRTC を使った P2P 同期 / マルチユーザー | 協調運用 + 不変条件拡張の意思決定 |
| D-4 | `pkc-application-scope-vision.md` | vision | application scope の境界再定義 | v1.x 計画時 |

### 3.5 HANDOVER_FINAL §5 / §7 / §6 に明記された "意図的未実装 / 既知の限界"

§5（意図的にやっていないこと）/ §7（次にやるべきこと）/ §6（既知の制約）から
横断的に抜粋。いずれも **こちら側が明示的に decline / defer した** 項目で、
ユーザーから改めて明示要望が来るまで未完ではない。

| ID | 項目 | HANDOVER 参照 | 重複する §3 候補 | 昇格条件 |
|----|------|--------------|-----------------|---------|
| H-1 | **i18n 基盤**（日英文言統一） | §7.1 / §18.4.2 | — | 多言語ユーザーからの要望 |
| H-2 | **DOM 局所 diff renderer** | §5.6 / §7.3 / §18.4.3 | — | entry 1000+ でスケーリング痛み |
| H-3 | **schema_version migration path** 設計 | §7.3 / spec §15.3 | — | **完了（§1 S-21、2026-04-15）**: `docs/spec/schema-migration-policy.md` を策定（docs-only、production code touch 0）。判断基準・hook 位置・lazy/eager・test 戦略雛形・v2 実装順序まで固定 |
| H-4 | **textlog-bundle CSV 列拡張**（lossy 解消） | §5.7 / §7.3 / F3 | — | **完了（§1 S-20、2026-04-14）**: `flags` 列を追加し future TextlogFlag 拡張でも round-trip lossless に。旧 `important` 列は backward-compat のため継続維持 |
| H-5 | **複数 cid / multi-workspace 同時表示** | §6.7 / §18.4.5 | C-P1 との合流可能性 | 複数 container 並立 UI 要求 |
| H-6 | **Revision への `prev_rid` / `content_hash` 追加** | §5.8 / spec §15.5 | C-1 | **完了（§1 S-22、2026-04-15）**: 両 optional field を `snapshotEntry` で populate（旧 rev は absent のまま）、pure FNV-1a-64 hash helper `src/core/operations/hash.ts` 追加、reducer / UI / schema_version 変更 0。C-1 revision-branch-restore の足場として記録面のみ強化 |
| H-7 | **pane state（左右ペイン表示）の永続化** | §6.2 | — | **完了（§1 S-19、2026-04-14）**: `localStorage['pkc2.panePrefs']` に `{ sidebar: boolean, meta: boolean }` を保存、ブート時に復元 + 再描画ごとに再適用 |
| H-8 | **TEXT → TEXTLOG 変換の非可逆部分** | §6.3 | — | **完了（§1 S-23、2026-04-16）**: 非可逆境界と来歴設計を `docs/spec/text-textlog-provenance.md` に canonical spec として固定。`RelationKind = 'provenance'` / `Relation.metadata?` 設計、実装スライス A–D 定義。docs-only、production code touch 0 |
| H-9 | **P2P / WebRTC 同期**（= D-3） | §5.3 / §7.4 / §18.4.4 | D-3 | v1.x テーマ |
| H-10 | **Merge import conflict UI v1**（entry 単位の C1/C2/C2-multi 分類 + 3 操作 + bulk + provenance） | merge-import-conflict-resolution.md §9 | — | **完了（§1 S-31、2026-04-17）**: behavior contract（13 章分割）+ pure / state / UI 3 slice + post-impl audit（DEFECT-1 / DEFECT-2 最小修正）+ manual 同期。policy UI / staging / revision 持込 / diff export / merge undo 等の「§9 将来拡張」は本 v1 の非対象で据え置き（v1.x / v2 テーマ） |

### 3.6 `docs/development/INDEX.md` CANDIDATE 節の保留候補

| 項目 | 保留理由 |
|------|---------|
| Calendar Phase 2（month wrap, empty cell cursor） | 必要性が薄い。Phase 1 で主要操作は完了 |
| Shift+Arrow range selection | Phase 2-D 未解決、前提が未整備 |
| Phase 2-D: SELECT_RANGE 表示順対応 | Ctrl+click で代替可能、設計負債だが実害小 |
| Sidebar multi-DnD | structural relation の cycle detection 複雑化、BULK_MOVE で代替 |
| TEXTLOG drag-to-reorder | oldest-first storage 不変条件と衝突、設計変更議論が先 |

### 3.7 §3 全体の合計

| カテゴリ | 件数 | うち COMPLETED | うち待機 |
|---------|------|---------------|---------|
| A (immediate UX) | 4 | 2（A-1 / A-3）+ 1（A-2 = §1 S-13）+ 1（A-4 = §1 S-15 + S-18 フル完成）= 4 | 0 待機 |
| B (markdown ext) | 3 | **2 + 1 部分（B-1 = §1 S-16、B-2 = §2 P-13、B-3 Slice α = §1 S-17）** | 0 完全待機 + B-3 Slice β/γ が CONDITIONAL のまま |
| C (data model ext) | 7 + 1 P1 = 8 | 2（C-2 = §1 S-32、C-3 = §1 S-33） | 6 |
| D (long-term vision) | 4 | 0 | 4 |
| H (HANDOVER 明記) | 10 | 0 | 10（一部は C/D と重複） |
| INDEX CANDIDATE | 5 | 0 | 5 |
| **合計 待機** | | | **28 件**（重複含む、実ユニーク 24 — C-2 / C-3 完了移行後） |

**重要**: §3 の 28 件は **ユーザー明示要望ではない**（= 台帳「未完」にはカウ
ントしない）。こちら側の idea / policy 決定として「要求が顕在化するまで
待機」する集合。`docs/planning/00_index.md` と HANDOVER_FINAL を起点に
辿れる形で網羅。

---

## 4. 本セッションで選ぶ 1 件

> **2026-04-21 更新（wave 完了後の棚卸し）**: relations / references / provenance / orphan wave
> + P1–P5 wave + hook subscription Defer + transport record decision が連続で landing
> した直後の状態。**P5 Extension Capture の receiver side（S-51 の「次アクション」）が
> 現時点で唯一の active implementation candidate**。本命: まず `docs/spec/record-offer-capture-profile.md` を
> docs-only で策定、その後 receiver 側実装。他の §3 候補は引き続き実需待ち。
> 以下の §4 の過去セッション記述は履歴として残す。

> **2026-04-14 更新（A-2 昇格セッション）**: supervisor が台帳運用に沿って
> §3 から A-2 を正式昇格。「Tier 3-3 まで終わった今、再び操作 UX を前に
> 進めるのが自然。archetype 拡張や長期構想と違って portable knowledge
> container の主軸を崩さない」の判断。実装は entry-window.ts の TEXT
> archetype 編集モードを center pane と同じ split view に。以下の §4 の
> 記述は一つ前の polish 選定（Escape 閉じ）のもの。履歴として残す。

### 過去の選定（polish モード時）: **Context menu を Escape で閉じられるようにする**

### 選定理由（5 行以内）

1. **直近のユーザー明示要望の surface と同じ場所**（右クリック context menu）を
   触る追加作業で、同じ UI 面に対する "完成度の底上げ" になる。
2. 現状 Escape は ShellMenu / ShortcutHelp / StorageProfile / TextlogPreview
   等ほぼ全ての overlay に効くが、**context menu だけ漏れている** — universal
   な UX 期待（Esc でメニュー閉じ）を裏切る唯一の箇所。
3. **最小差分**: Escape handler に 1 branch 追加（`dismissContextMenu()`
   呼び出し）+ 小テスト 1-2 本。
4. **新テーマ増やさない** — 既存の Escape dismissal ロジックを 1 surface 分
   だけ延長するだけ。spec / reducer / data model には触らない。
5. 他候補は "痛み待ち" か medium-scope refactor（A-2）で、**今回の最小差分
   原則とは相性が悪い**。

### 選ばない候補と理由（一行ずつ）

- **A-2 text split edit in entry window** — entry-window.ts 2214 行に触る
  medium scope + 未確定事項 4 つ、最小差分に反する
- **A-4 search sub-location reach** — explicit "NEXT IF PAIN REMAINS" gate
- **clampMenuToViewport を slash menu / asset picker / asset autocomplete
  にも適用** — supervisor が「横展開しすぎ禁止」と明示
- **detached panel z-index 整流** — ユーザー未報告の preemptive fix、
  「ついで実装」寄り
- **CSS variables での z-index tier 抽象化** — internal hygiene、supervisor
  が明示的に禁止
- **B / C / D 系統** — すべて具体要求が来ていない idea inventory

---

## 5. 運用ルール

- 台帳上「完了」に分類するには必ず **commit hash / test file / dev doc** を
  根拠列に挙げる。曖昧なら「部分完了」に落とす
- 「未完」は **ユーザーが明示した** かつ **実装 / 検証が終わっていない** 項目に
  限定する。こちら側の idea / standby / "痛み待ち" は §3 に置く
- 完了した項目の commit がすべて origin に push 済みであることを常に確認する
- 本台帳は新要望が入るたびに追記。`docs/planning/00_index.md` 第 0 群に位置付け
  （★★★★）
- **走査漏れ防止**: §0 の「台帳の走査レイヤ」表に列挙したすべてのソースを
  毎回全走査する。新規 `.md` / 新節が加わった場合も同表に追記する
- §3 項目が「ユーザーが明示した」状態になった時点で、§1 / §2 のいずれかに
  **昇格**させる（= 状態を "未完" にして最優先着手）

---

## 6. 変更履歴

| 日付 | 変更 |
|-----|-----|
| 2026-04-14 | 初版。Tier 3-3 + bugfix 5276fa4 時点までを棚卸し。未完ゼロを確認、polish 1 件選定（context menu Escape 閉じ） |
| 2026-04-14 | §3 を全数化。`docs/development/**` / `docs/development/data-model/**` / `docs/development/markdown-extensions/**` / `docs/vision/**` / merge-import spec §9 / HANDOVER §5/§6/§7 を網羅走査し、A-1〜A-4 / B-1〜B-3 / C-1〜C-7 + C-P1 / D-1〜D-4 / H-1〜H-10 / INDEX 保留候補 5 件を列挙。§0 に走査レイヤ表、§5 に走査漏れ防止ルールを追加。未完件数は変わらず（0 件） |
| 2026-04-14 | **A-2 昇格**: supervisor 判断で §3.1 A-2（text split edit in entry window）を §1 S-13 に昇格。待機 28 → 27、完了 24 → 25（本コミット扱い）。実装は entry-window.ts の TEXT archetype 編集モードを center pane と同じ split view に置き換え、tab bar を TEXT だけ非表示化。他 archetype の挙動は無変更 |
| 2026-04-14 | **B-2 reconciliation**: supervisor が §3.2 B-2（syntax highlight）の昇格を提案したが、走査の結果 commit `92921ec` (2026-04-13) で既に実装済みと判明。台帳の §3.2 が stale だった。対応: §3.2 B-2 を「完了済み」に更新、§2 に P-13 として retroactive 追加、§3.7 サマリ更新（待機 27 → 26、完了 25 → 26）。dev doc `markdown-code-block-highlighting.md` Status を CANDIDATE → COMPLETED 2026-04-13 に flip、development INDEX に B-2 を追加。あわせて A-2 × B-2 統合テスト 1 本追加（split editor preview がコードを syntax highlight する pin） |
| 2026-04-14 | **S-14: search 入力フォーカス喪失 / IME 不可** をユーザー報告で受領。A-4 promotion 判断より優先（明示 user pain は最上位）。原因: `main.ts` の onState で focus 復元が `phase === 'editing'` 限定 + IME composition 中も SET_SEARCH_QUERY が走り input element ごと再生成されるため。修正: focus + caret 復元を全 phase で `data-pkc-field` ある場合に拡張、action-binder に IME `compositionstart`/`compositionend` ガードを追加して composition 中は dispatch を抑止、composition 終了時に最終値を 1 回 dispatch。テスト 2 件追加 |
| 2026-04-14 | **S-15 / A-4 Slice α 昇格**: A-4 promotion judgment を再開。A-4 spec の §4 minimum scope（indexer + sub-location action + result row + scroll + temp highlight）は依然 medium scope なので、その中の **Slice α — visual `<mark>` のみ** を最小差分で正式昇格して実装。残り Slice β / γ（scroll-to / sub-location indexer）は CONDITIONAL のまま。実装は features 層の pure DOM transform `highlightMatchesIn(root, query)` + renderer の `renderView` が `state.searchQuery` を受け取って body に適用 + CSS `.pkc-search-mark`。`<pre>` 内（B-2 syntax highlight）は意図的に skip して B-2 の token markup を温存 |
| 2026-04-14 | **S-16 / B-1 昇格**: CSV / TSV / PSV fenced block を `<table>` 化。`features/markdown/csv-table.ts` に RFC 4180 subset parser + rectangular HTML renderer + `renderCsvFence`、`markdown-render.ts` の `md.renderer.rules.fence` を上書きして CSV lang 検出時のみ短絡（B-2 syntax highlight 経路は default fence 経由で温存）。XSS 安全。`csv noheader` 等の info string flag で header 制御。`.pkc-md-rendered table` 既存 CSS を再利用、CSV 由来は `pkc-md-rendered-csv` 追加クラスで識別。テスト 24（pure parser）+ 8（markdown-it integration、pipe-table 非 regression / B-2 fallback / XSS 安全 / quoted+newline+escape の各 case）|
| 2026-04-14 | **S-17 / B-3 Slice α 昇格**: blockquote 行で Enter → `\n> ` 自動継続。`features/markdown/quote-assist.ts` の pure helper `computeQuoteAssistOnEnter(value, caretPos)` + `action-binder.ts` の `handleKeydown` 内 Enter 分岐（inline-calc の直後 / Ctrl+Enter の直前）。`isSlashEligible` で markdown 対象 textarea に限定、IME composition / Shift・Ctrl・Alt / non-collapsed selection / mid-line / empty `> ` は全て fall-through。`execCommand('insertText')` で undo stack 保護、fallback で手動 + input event。テスト 12（pure）+ 9（handler integration: 継続 × 2 / 非引用 / Shift / Ctrl / IME / non-collapsed / 空 / mid-line）。残り Slice β（exit）/ γ（bulk prefix toggle）/ entry-window 同期は CONDITIONAL のまま |
| 2026-04-14 | **S-18 / A-4 FULL 昇格**: supervisor 判断で Slice 刻みを辞め 1 テーマで完成。検索 → 見つけて到達できる実用 UX 完成。`features/search/sub-location-search.ts` に pure indexer（TEXT 見出し単位、TEXTLOG log 単位、他 archetype 無視、fenced skip、dedup、maxPerEntry cap）+ 新 user action `NAVIGATE_TO_LOCATION { lid, subId, ticket }` + `AppState.pendingNav?: { subId; ticket } | null` + `adapter/ui/location-nav.ts` の `createLocationNavTracker`（ticket gate + scroll + `.pkc-location-highlight` 1.6s flash）+ main.ts onState 末尾で `consume` 呼び出し。renderer sidebar flat-mode で `.pkc-entry-subloc` rows emit、action-binder に `navigate-to-location` click case + 単調増加 ticket カウンタ。§3.1 A-4 を PARTIALLY PROMOTED → FULLY PROMOTED に昇格。完了 30 → 31、待機 23 → 22。テスト +46（pure 21 / nav helper 15 / e2e 10）。§3.7 の A カテゴリは 4 / 4 完了（Slice β/γ の残置なし）|
| 2026-04-14 | **S-19 / H-7 pane state persistence 昇格**: 自主運転モード第1号。`adapter/platform/pane-prefs.ts`（`localStorage['pkc2.panePrefs']` の load/set、invalid JSON / no-storage fallback、in-memory cache）+ `adapter/ui/pane-apply.ts`（`applyPaneCollapsedToDOM` 共有ヘルパ）+ renderer が sidebar/meta/tray 生成時に `data-pkc-collapsed` を prefs から即 pre-set（flash なし）+ `togglePane` が setPaneCollapsed 経由で persist → applyPaneCollapsedToDOM。reducer / AppState / user-action への touch 0。テスト +N。完了 31 → 32、待機 22 → 21。§3.5 H-7 を「完了」に更新。HANDOVER §6.2 を「解消済み」に更新 |
| 2026-04-15 | **S-21 / H-3 schema migration path 設計（docs-only）昇格**: 自主運転モード第3号。`docs/spec/schema-migration-policy.md` を新規策定。判断基準（additive / breaking flow）、lazy/eager 適用（JSON 内部は lazy / IDB store 境界は eager）、11 の migration hook 経路、canonical entry point `src/core/migrations/migrate-container.ts`（将来配置）、test 戦略 4 系列（unit / chain / round-trip / reject）、v2 到達時の実装順序 9 step。`data-model.md §15.3 / §17` / `body-formats.md §14.2` / `merge-import-conflict-resolution.md §8.6` / `HANDOVER_FINAL.md §7.3 / §17` に cross-link。production code touch 0、SCHEMA_VERSION 依然 1。完了 33 → 34、§3.5 H-3 を「完了」に更新、HANDOVER §7.3 schema_version 行を「解消済み」に更新 |
| 2026-04-15 | **S-22 / H-6 Revision.prev_rid / content_hash の optional 追加**: 自主運転モード第4号。`Revision` に 2 additive optional field を追加、`snapshotEntry` で populate（旧 rev は absent 維持、lazy 補填なし）、pure hash helper `src/core/operations/hash.ts` 新規（BigInt FNV-1a-64、UTF-8 正規化、astral-plane pair 対応、16-char lowercase hex）。parse / restore / reducer / UI / schema_version / user-action 一切 touch 0。spec `data-model.md §6.1 / §6.2 / §6.2.1 / §15.2 / §15.5` 更新、`schema-migration-policy.md §6` 既存例追加、`HANDOVER_FINAL.md §5.8` 2026-04-15 追記。tests +22（hash determinism 7 / content_hash 4 / prev_rid 5 / backward compat 3 / round-trip 1 / restore integration 2）。完了 34 → 35、§3.5 H-6 を「完了」に更新、待機 19 → 18。C-1 revision-branch-restore 実装時の「記録面の下地」を先置き |
| 2026-04-16 | **S-23 / H-8 TEXT ↔ TEXTLOG 変換の非可逆境界と来歴設計（docs-only）**: 自主運転モード第5号。新規 `docs/spec/text-textlog-provenance.md`（353 行）を策定。(1) TEXT→TEXTLOG / TEXTLOG→TEXT 非可逆境界を表形式で全項目網羅、(2) 許容損失の理由付け、(3) `RelationKind = 'provenance'` additive 追加の設計根拠・後方互換性、(4) `Relation.metadata?: Record<string,string>` additive 追加仕様、(5) provenance ペイロード定義、(6) 実装スライス A–D の順序と依存関係、(7) テスト戦略スニペット、(8) スキーマ互換性（全変更が v1 範囲内・SCHEMA_VERSION 更新不要）。`data-model.md §5` RelationKind / Relation schema 更新（`provenance` 行追加、`metadata?` フィールド行追加）、`textlog-text-conversion.md` 末尾に cross-link、`HANDOVER_FINAL.md §6.3` に解消マーカー追記。production code touch 0。完了 35 → 36、§3.5 H-8 を「完了」に更新、待機 18 → 17 |
| 2026-04-16 | **Post-v0.1.0 Editor UX Pack（S-24〜S-28 + 補助 spec 群）**: editor UX を一段前進させる一連のテーマを連続完了。(a) **S-24** boot source priority 修正（IDB 優先 → pkc-data 優先に入れ替え、Export HTML の可視性回復）/ 完了 36→37 (b) **S-25** HTML paste の anchor → Markdown link 正規化（TEXT body 限定）/ 完了 37→38 (c) **S-26** current TEXT entry Find & Replace 最小ダイアログ + **S-27** Selection only 拡張 / 完了 38→40 (d) **S-28** textlog-replace v1（current log only）実装 + post-impl invariance audit / 完了 40→41。並行 docs-only 成果: `find-replace-behavior-contract.md` (TEXT v1.1) / `textlog-replace-feasibility-and-minimum-scope.md` / `textlog-replace-v1-behavior-contract.md` / `textlog-text-conversion-policy.md` / `provenance-relation-profile.md` を `docs/spec/` に追加、dev doc 4 本（`html-paste-link-markdown.md` / `text-replace-current-entry.md` / `textlog-replace-current-log.md` / `textlog-replace-current-log-audit.md`）を `docs/development/` に追加、manual 同期 2 回（TEXT 側 + textlog 側）。production code touch は 4 surface（boot / paste / TEXT dialog / textlog dialog）に限定。bundle 全体 +10 KB 前後（gzip +2.4 KB 前後）、tests +130 件前後。pure helper は `src/features/text/text-replace.ts` に閉じ、TEXT / textlog で共有可能。詳細は本表 §1 S-24〜S-28 行および `HANDOVER_FINAL.md §19` を参照 |
| 2026-04-17 | **S-30 / Boot source policy revision**: S-24 の「pkc-data 優先」を structural に強化。Export HTML 起動時に IDB を上書きしない保証を `viewOnlySource` state + `doSave()` 早期 return + 明示 Import 7 経路 clear + boot chooser overlay で固定。post-impl audit で欠陥 0、manual 07 / 09 に chooser / view-only 記述を最小同期。完了 41 → 42、§3.5 の H-4 / H-7 / H-6 / H-3 / H-8 に加えて boot 契約を v1 安定領域に編入 |
| 2026-04-17 | **S-32 / C-2 entry-ordering v1 昇格・完了**: minimum scope → contract → pure/state → UI → audit（F-1/F-2 修正）→ manual sync の全 pipeline 完了。`entry_order: string[]` additive optional + `MOVE_ENTRY` action + `applyManualOrder` pure helper + Manual セレクタ + ↑/↓ ボタン。完了 44 → 45、§3.3 C-2 を「完了済み」に更新、待機 16 → 15 |
| 2026-04-17 | **S-33 / C-3 link-index v1 昇格・完了**: minimum scope → contract → pure helper → UI → audit（欠陥 0）→ manual sync の全 pipeline 完了。runtime-only / entry: scheme のみ / Outgoing + Backlinks + Broken 3 section in meta pane / AppState・schema 変更なし。完了 45 → 46、§3.3 C-3 を「完了済み」に更新、待機 15 → 14 |
| 2026-04-17 | **直近完了群の棚卸し（C-2 / C-3 反映）**: LEDGER §0 / §1 / §3.3 / §3.7 / §6 と HANDOVER §21 + 00_index §5 を同期 |
| 2026-04-21 | **Relations / References / Provenance / Orphan wave + P1–P5 wave + hook Defer + transport record wave の retrospective 一括追記**: §1.1 として S-34〜S-51（18 行）を追加、§0 サマリを「完了 46 → 68」「部分完了 0 → 1（S-51 = P5 v0 draft のみ完了、receiver 実装は pending）」に更新。commit hash は個別に列挙せず `../development/*.md` の doc path を根拠列に置く。00_index.md 第5群末尾に「2026-04-18〜21 wave」小節を追加、`../development/INDEX.md` に COMPLETED #79–#116 + Post-Stabilization Wave 節 + CANDIDATE 節の書き換え + Idea Inventory A/B/C status marker 更新を反映。docs-only、production code 変更 0。archive banner 追加 / HANDOVER_FINAL.md addendum / stale 個別 doc 本文修正は本 PR では保留（次 PR 候補） |
| 2026-04-17 | **S-31 / H-10 merge-conflict-ui v1 完了（全スライス）**: behavior contract（単一ファイル統合済み `docs/spec/merge-conflict-ui-v1-behavior-contract.md`、supervisor 確定事項 2 点固定）→ pure slice（`detectEntryConflicts` 等）→ state slice（3 user actions + CONTAINER_MERGED 拡張 + imported filter + provenance append）→ UI slice（conflict section + C1/C2/C2-multi badge + bulk + gate）→ post-impl audit（DEFECT-1 統合 wiring 欠如 + DEFECT-2 bulk multi-host 消去の 2 件を最小修正）→ manual 07 / 09 同期。tests +70 前後、全 3984 passed。完了 42 → 44、§3.5 H-10 を「完了」に更新、待機 17 → 16。§9 将来拡張（policy UI / staging / revision 持込 / diff export / merge undo）は非対象のまま v1.x / v2 テーマとして据え置き |
| 2026-04-19 | **S-34 / Backlinks Panel v1 完了**: meta pane に relations 由来の backlinks を kind 別に表示する sub-panel を v1 で追加。追加 reducer なし（pure derivation）、renderer のみ。S-35〜S-42（sidebar badge / badge-jump / relation delete / relation kind edit / References umbrella / summary row / clickable）の起点。実装 doc: `../development/backlinks-panel-v1.md` |
| 2026-04-19 | **S-35 / Transport record consistency review + reject decision 完了**: `record:accept` / `record:reject` の送受非対称の整合性レビュー（`../development/transport-record-accept-reject-consistency-review.md`、PR #45 / #47 で解消）と `record:reject` sender-only 方針の決定（`../development/transport-record-reject-decision.md`、active decision）。関連 `capability.ts` / tests に反映。§3.5 に新規 row は立てず、capability 層 polishとして §1 に追記 |
| 2026-04-19 | **S-36 / Dead-path cleanup wave round 1–5 完了**: 5 段階 audit + 2 decision doc で未使用 export / pseudo-API / spec-only シンボルの整理。PR #40（slugify 重複解消）/ PR #41（`updateLogEntry` 削除、`isUlid` は保持）/ PR #44（features barrel 削除、`entryMatchesQuery` は保持）/ PR #46（calendar month helper）/ PR #47（record:reject 整合）を実施。実装 doc: `../development/dead-path-cleanup-inventory-0{1..5}.md` + `../development/dead-path-decision-{features-barrel,isUlid-updateLogEntry}.md` |
| 2026-04-20 | **S-37 / Sidebar backlink count badge + click jump 完了**: sidebar の entry 行に relations 由来の inbound 件数 badge を表示（件数 0 は非表示）、badge クリックで meta pane の References / relations セクションへ scroll + flash。pure count helper + renderer、action 追加は delegation 側のみ。実装 doc: `../development/sidebar-backlink-badge-v1.md` + `../development/backlink-badge-jump-v1.md` |
| 2026-04-20 | **S-38 / Relation delete + relation kind edit UI 完了**: relation 行から直接 1 本を削除する UI（`DELETE_RELATION` 追加、undo は非対象）、および relation kind の inline 編集 UI（`provenance` 行の保護 = 編集禁止 + 削除 confirm 強化の二重ガード）。実装 doc: `../development/relation-delete-ui-v1.md` + `../development/relation-kind-edit-v1.md` |
| 2026-04-20 | **S-39 / Unified Backlinks v1（References umbrella, Option E）完了**: relations / body refs / provenance を References として統一表示する umbrella。5 案比較の v0 draft（`../development/unified-backlinks-v0-draft.md`、docs-only、v1 に consumed）→ v1 実装（`../development/unified-backlinks-v1.md`、Option E）。summary row v2 / clickable v3 の基盤 |
| 2026-04-20 | **S-40 / References summary row v2 + clickable v3 完了**: References header に件数サマリ行を追加（canonical count 契約、v2）、サマリ行を clickable にして該当 section へ scroll + flash（v3、sub-location-search の `NAVIGATE_TO_LOCATION` と非衝突）。実装 doc: `../development/references-summary-row-v2.md` + `../development/references-summary-clickable-v3.md` |
| 2026-04-20 | **S-41 / Provenance metadata viewer + pretty-print + copy/export 完了**: `provenance` relation の `metadata` を meta pane の References 内で (a) raw display + key 一覧（viewer v1）、(b) key scoped formatter で human-readable 整形（pretty-print v1.x、raw 切替可）、(c) raw canonical JSON の copy（clipboard）+ export（`.json` download）。per-field copy / multi-relation bulk は scope 外で明示。実装 doc: `../development/provenance-metadata-viewer-v1.md` + `../development/provenance-metadata-pretty-print-v1.md` + `../development/provenance-metadata-copy-export-v1.md` |
| 2026-04-20 | **S-42 / Unified Orphan Detection v3（S1 draft → S2 contract → S3 pure → S4 sidebar marker）完了 / S5 filter は Defer**: "any relation inbound/outbound + body ref 到達性" を fully unconnected 判定とする v3。S1 draft（`../development/unified-orphan-detection-v3-draft.md`、docs-only）→ S2 contract（`../development/unified-orphan-detection-v3-contract.md`、docs-only、§7.4 で S5 filter を Defer と明示）→ S3 `buildConnectednessSets` pure helper（`../development/connectedness-s3-v1.md`）→ S4 sidebar marker（`../development/connectedness-s4-v1.md`）。S5 "orphan 一覧の filter" は実需待ちで Defer 継続。従前の relations ベース orphan UI v1（`../development/orphan-detection-ui-v1.md`）も並列維持 |
| 2026-04-20 | **S-43 / Hook subscription 設計セット完了（Defer 決定）**: 外部 host からの PKC-Message hook subscription について 4 doc を docs-only で整備。(a) design review（`../development/pkc-message-hook-subscription-review.md`）(b) PoC design（`../development/pkc-message-hook-subscription-poc.md`）(c) acceptance contract draft（`../development/pkc-message-hook-subscription-acceptance.md`）(d) **canonical decision doc（`../development/pkc-message-hook-subscription-decision.md`）— 結論: Defer**。実装前に simpler proof path（polling 等）を通す方針。以後、hook subscription の canonical reference は decision doc |
| 2026-04-21 | **S-44 / Dead-code inventory after relations wave 完了**: relations wave 後の未使用 export 監査 + 同 PR 内で Category A 2 件（`isMarkdownEvaluatedArchetype` inline 化 + 1 件削除）を解消。Category B / C / D は空。実装 doc: `../development/dead-code-inventory-after-relations-wave.md`（audit + cleanup） |
| 2026-04-21 | **S-45 / Next-feature prioritization memo 完了**: P1–P5 軸の棚卸し docs-only memo。`../development/next-feature-prioritization-after-relations-wave.md`。P1 recent entries pane を最有力として提示、P2–P5 の位置付けを整理 |
| 2026-04-21 | **S-46 / P1 Recent Entries Pane v1 完了**: `created_at` desc の派生ビューを sidebar 上段に開閉可能な `<details>` として追加。container 変更 / reducer 変更 / 新 action いずれも無し（derived-only）。S4 orphan marker と対の UX。実装 doc: `../development/recent-entries-pane-v1.md` |
| 2026-04-21 | **S-47 / P2 Breadcrumb / Path Trail v1 完了**: 既存 breadcrumb 実装を spec 化し、軽微 hardening を追加。segment click で `SELECT_ENTRY`、sidebar scroll 不要な「迷子」補修。実装 doc: `../development/breadcrumb-path-trail-v1.md`（spec + additive hardening） |
| 2026-04-21 | **S-48 / P3 Entry Rename Freshness Audit 完了（docs-only）**: rename 直後の表示 freshness を監査。stale surface は 1 件（entry-window title）のみと判明。実装 doc: `../development/entry-rename-freshness-audit.md`。follow-up は S-49 で |
| 2026-04-21 | **S-49 / P3 follow-up — Entry-window title live refresh v1 完了**: entry-window の title を親 entry の rename に追従。既存 `QUICK_UPDATE_ENTRY` 経路を再利用、archetype label など v1 非対象は §6 で明示。実装 doc: `../development/entry-window-title-live-refresh-v1.md` |
| 2026-04-21 | **S-50 / P4 Saved Searches v1 完了**: filter / query / sort 組み合わせを named slot に保存 / 復元。localStorage 永続化、container 契約は非変更。rename / pin / date-range 等は §9 で v1+ 明示。実装 doc: `../development/saved-searches-v1.md` |
| 2026-04-21 | **S-51（部分完了）/ P5 Extension Capture v0 draft 完了**: 外部 extension → PKC2 capture の設計 draft（docs-only）。`record:offer` 再利用 Option B を推奨、次 PR は `docs/spec/record-offer-capture-profile.md` 策定、以降で receiver 側実装。**本行は部分完了**（v0 draft 完了、receiver 実装は pending）。実装 doc: `../development/extension-capture-v0-draft.md`（`Status: design draft — No implementation in this PR.`）|
| 2026-04-22 | **UI continuity wave closure — ユーザ報告 7 件起点の連鎖修正（S-52〜S-58）が一巡**。docs-first investigation × 最小 PR 複数本 で解決。§1.2 として retrospective 一括追記。`HANDOVER_FINAL.md §23` / `../development/INDEX.md §COMPLETED` #117–#123 / `../planning/00_index.md` 第5群 末尾 と同期 |
