# PKC2 — User Request Ledger

**Status**: living ledger（常時更新）
**Date**: 2026-04-14（Tier 3-3 / bugfix commit `5276fa4` 時点）
**Purpose**: これまでの **ユーザーが明示した要望** を棚卸しし、**完了 / 部分完了 / 未完** の 3 値で仕分ける正本台帳。以後のセッションは本台帳を起点に未完を拾い、無ければ「最も user value が高い残余 polish」を 1 件選ぶ運用。

---

## 0. サマリ

| 状態 | 件数 |
|-----|-----|
| 完了 | **24** |
| 部分完了 | 0 |
| 未完 | 0 |

**結論**: ユーザー明示要望の未完はゼロ。よって本セッションは「残余 polish 1 件」モードで進む。選定結果: **context menu の Escape 閉じ**（§4 参照）。

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

---

## 3. 「痛み待ち」扱いで停止中の候補（今回の未完ではない）

これらは **ユーザーが明示して待機中ではなく**、こちら側が「将来痛みが出たら再開」と記録した
項目。台帳上の "未完" ではなく "standby"。本セッションの対象外。

| 候補 | 扱い | 根拠 | 再開条件 |
|-----|-----|-----|---------|
| A-4 search sub-location reach | NEXT IF PAIN REMAINS | `search-ux-partial-reach.md` | ユーザーが「まだ探しにくい」と報告した場合 |
| A-2 text split edit in entry window | STANDBY | `text-split-edit-in-entry-window.md` | entry window の TEXT 編集 UX を広げたい要求が来た場合 |
| B-1〜3 markdown 拡張（CSV table, syntax highlight, quote 補助）| Idea inventory | `docs/development/markdown-extensions/*.md` | 具体要求 |
| C-1〜7 data model 拡張（revision branch, ordering, link index, spreadsheet, complex, document-set, office preview）| Idea inventory | `docs/development/data-model/*.md` | 具体要求 + spec 化先行 |
| D-1〜4 長期ビジョン（message externalization, multi-window, P2P, application scope）| Vision | `docs/vision/*` | v1.x 計画時 |
| merge import §9 future extensions（policy UI / staging / revision 持込 / diff export 等）| Spec 明記 | `docs/spec/merge-import-conflict-resolution.md §9` | Tier 3-1 MVP の実害 or 要求 |
| Calendar Phase 2 (month wrap) / Shift+Arrow range | 保留候補 | `INDEX.md` CANDIDATE 節 | 必要性が顕在化 |
| Phase 2-D SELECT_RANGE 表示順 / Sidebar multi-DnD / TEXTLOG drag-reorder | 保留候補 | `INDEX.md` 保留候補表 | 設計負債の顕在化 |

---

## 4. 本セッションで選ぶ 1 件

未完・部分完了がゼロなので、§0 のルールに従い **user value が最も高い残余 polish を 1 件**選ぶ。

### 選定: **Context menu を Escape で閉じられるようにする**

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
  （★★★）

---

## 6. 変更履歴

| 日付 | 変更 |
|-----|-----|
| 2026-04-14 | 初版。Tier 3-3 + bugfix 5276fa4 時点までを棚卸し。未完ゼロを確認、polish 1 件選定（context menu Escape 閉じ） |
