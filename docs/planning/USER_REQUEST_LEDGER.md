# PKC2 — User Request Ledger

**Status**: living ledger（常時更新）
**Date**: 2026-04-14（Tier 3-3 / bugfix commit `5276fa4` 時点）
**Purpose**: これまでの **ユーザーが明示した要望** を棚卸しし、**完了 / 部分完了 / 未完** の 3 値で仕分ける正本台帳。以後のセッションは本台帳を起点に未完を拾い、無ければ「最も user value が高い残余 polish」を 1 件選ぶ運用。

---

## 0. サマリ

| 状態 | 件数 |
|-----|-----|
| **ユーザー明示要望 — 完了** | **27** |
| **ユーザー明示要望 — 部分完了** | 0 |
| **ユーザー明示要望 — 未完（着手中）** | 0 |
| 待機中候補（idea / vision / HANDOVER decline、§3） | 26（重複込 30） |

**結論**: supervisor が台帳 §3 から **B-2（syntax highlight）** を昇格提案した
が、走査の結果 B-2 は **既に実装済み**（commit `92921ec` / 2026-04-13）と判明。
台帳の §3.2 が stale だった（CANDIDATE 表記が残っていた）。本セッションは
**ledger 整合修正 + dev doc / INDEX の状態同期 + A-2 × B-2 統合テスト 1 本追加**
を行う。新規実装ではなく **棚卸し誤差の解消**。前回（A-2）昇格分も完了済
（commit `7d717de`、§1 S-13）。

§3 待機: 27 → 26（B-2 が完了に移動）。
完了: 25 → 26（B-2 を §2 に retroactive で追加）。

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
| S-14 | **バグ報告: search 入力で 1 文字ごとにフォーカスが外れる / IME（日本語入力）が事実上使えない** | 「ついでに既存検索窓のバグを報告します / 1文字入れるたびにフォーカスが外れてしまい、日本語入力はメモ帳などで文章を作ってから、コピペする必要があります」 | 本セッション完了（commit `<本コミット>`） | `src/main.ts` の focus 復元拡張 + `src/adapter/ui/action-binder.ts` の IME composition guard + 回帰テスト 2 件（`tests/adapter/search-input-focus.test.ts`） | — |

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
| A-4 | `search-ux-partial-reach.md` | CONDITIONAL — NEXT IF PAIN REMAINS | 検索が body 内 sub-location を指せない問題 | ユーザーが「まだ探しにくい」と報告 |

### 3.2 Category B — Markdown / Rendering Extensions（`docs/development/markdown-extensions/`）

| ID | File | Status | 要約 | 昇格条件 |
|----|------|--------|-----|---------|
| B-1 | `markdown-csv-table-extension.md` | CANDIDATE | fenced CSV block を自動で `<table>` にレンダリング | 表データを CSV で貼る運用が顕在化 |
| B-2 | `markdown-code-block-highlighting.md` | **完了済み（commit `92921ec` / 2026-04-13、§2 P-13 参照）** | code block の syntax highlight（独自 tokenizer、9 言語、~3 KB gzipped。highlight.js / Prism は採らず portable single-HTML 制約に整合） | — |
| B-3 | `markdown-quote-input-assist.md` | CANDIDATE | 引用入力補助（Ctrl+Shift+Q, 選択範囲 blockquote 化） | 文章引用を頻用する要望 |

### 3.3 Category C — Data Model Extensions（`docs/development/data-model/`）

| ID | File | Status | 要約 | 昇格条件 |
|----|------|--------|-----|---------|
| C-1 | `revision-branch-restore.md` | CANDIDATE | revision から分岐復元 / branch tree（`prev_rid` additive field） | "古い版に戻ったあと分岐したい" 要求 |
| C-2 | `entry-ordering-model.md` | CANDIDATE | entry の手動 ordering（`display_order` additive） | sidebar での user-defined 並び替え要求 |
| C-3 | `link-index-entry.md` | CANDIDATE | リンク集 entry（backlinks / forward refs の集約ビュー） | "どこから参照されているか知りたい" 要求 |
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
| H-3 | **schema_version migration path** 設計 | §7.3 / spec §15.3 | — | schema_version bump が必要な破壊的変更要求 |
| H-4 | **textlog-bundle CSV 列拡張**（lossy 解消） | §5.7 / §7.3 / F3 | — | 新しい flag 追加要求 |
| H-5 | **複数 cid / multi-workspace 同時表示** | §6.7 / §18.4.5 | C-P1 との合流可能性 | 複数 container 並立 UI 要求 |
| H-6 | **Revision への `prev_rid` / `content_hash` 追加** | §5.8 / spec §15.5 | C-1 | revision 分岐復元の具体要求 |
| H-7 | **pane state（左右ペイン表示）の永続化** | §6.2 | — | ブラウザリロードで設定が戻る不満 |
| H-8 | **TEXT → TEXTLOG 変換の非可逆部分** | §6.3 | — | 往復で情報が失われる不満 |
| H-9 | **P2P / WebRTC 同期**（= D-3） | §5.3 / §7.4 / §18.4.4 | D-3 | v1.x テーマ |
| H-10 | **Merge import §9 将来拡張**（policy UI / staging / revision 持込 / diff export / merge undo 等） | merge-import-conflict-resolution.md §9 | — | Merge MVP 実運用での具体 pain |

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
| A (immediate UX) | 4 | 2（A-1 / A-3）+ 1（A-2 = §1 S-13 へ昇格） = 3 | 1（A-4 のみ） |
| B (markdown ext) | 3 | **1（B-2 = §2 P-13 に retroactive 移動）** | 2（B-1 / B-3） |
| C (data model ext) | 7 + 1 P1 = 8 | 0 | 8 |
| D (long-term vision) | 4 | 0 | 4 |
| H (HANDOVER 明記) | 10 | 0 | 10（一部は C/D と重複） |
| INDEX CANDIDATE | 5 | 0 | 5 |
| **合計 待機** | | | **30 件**（重複含む、実ユニーク 26） |

**重要**: §3 の 28 件は **ユーザー明示要望ではない**（= 台帳「未完」にはカウ
ントしない）。こちら側の idea / policy 決定として「要求が顕在化するまで
待機」する集合。`docs/planning/00_index.md` と HANDOVER_FINAL を起点に
辿れる形で網羅。

---

## 4. 本セッションで選ぶ 1 件

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
