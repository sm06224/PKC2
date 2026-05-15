# v2.3.x stack 着地手順 + branch cleanup(PR #433、2026-05-15)

**Context**:`claude/v23-stack-2026-05-14` branch の 32 commit / PR-V1..V24 一括着地手順と、merge 後の stale branch cleanup を本 doc に集約。先行する `branch-cleanup-execution-2026-05-14.md`(C2 deliverable、PR-V16)の後続 wave。

## 状況

- Branch: `claude/v23-stack-2026-05-14` / Aggregate PR: **#433**
- Base: `main` (sha `04e8c67d`, v2.3.0 タグ)
- Head: `b04fa9e`(2026-05-15)
- Commit 数:32(PR-V1..V24 + hotfix + simplify hardening)
- PR-V18 以降の追加範囲(PR #433 初版 body には未反映):

| # | Block | Topic |
|---|-------|-------|
| PR-V18 | U3/U4 | 出力時致命 bug fix(Buffer base64 / 画像 ref 解決 / pageBreakBefore)+ CI smoke timeout bump + branch tree parity smoke |
| PR-V19 | U3/U4 | docx/pptx 全面 rewrite(user audit 14 項目 — 既定 font / 表ヘッダー shading / 水平線罫線 / CSV → table / GFM task list checkbox / pageBreakBefore / 画像実機 embed / 内部リンク 上付き + appendix / PKC 拡張 4 種書式化 / 変数展開 / 日本語ファイル名維持) |
| PR-V20 | U3/U4 hotfix | filename 日本語維持 + pkc:// image asset 解決 + PDF auto-print + TEXTLOG deep-link smoke |
| PR-V21 | U3/U4 hotfix | H4-H6 を箇条書き化(360/720/1080 twip indent)+ 変数展開 + TEXTLOG body JSON 露出 fix |
| PR-V22 | U3 致命 hotfix | docx 画像埋め込み実機動作(`Buffer.from` → `atob` + Uint8Array)+ H1 なし時の見出し numbering(0.0.X → 1.1.X、暗黙の親 = 1) |
| **PR-V23** | **検証** | **視覚 docx 検証 pipeline**(LibreOffice headless → PDF → pdftoppm @150dpi PNG → Claude 画像 Read + `vtest_struct.py` 構造検査)+ pptx 対応拡張 |
| **PR-V24** | **U4** | **pptx に AST run-level formatting 導入**(vtest で発見した audit 5 件解消:vars 展開 / hidden drop / mark highlight / em-dot italic / link hyperlink / pipe-table 実 table 化 + appendix slide) |
| PR-V24-hardening | refactor | simplify レビュー指摘 fix(linkToRuns label nested formatting 保持 / triple filter → single pass / Object.keys+delete → 条件付き代入 / pptx internal-link 判定を docx parity に / Python residue helper 統合) |

## 着地手順

### 1. CI green を確認

```bash
gh pr checks 433  # またはMCP github 経由
```

CI 構成(PKC2 標準 3 checks):
- typecheck + test + build × 2 (Node 20 / 22)
- Playwright smoke

### 2. PR body 更新

PR #433 の body は PR-V17 時点で停止しているため、PR-V18..V24 を追記して merge 判断材料を最新化。本 doc(`v23-stack-close-and-branch-cleanup-2026-05-15.md`)を `## Stack 拡張(PR-V18..V24)` section として PR body 末尾に append、または full rewrite。

更新項目:
- PR-V18..V24 を「Stack 内訳」表に追加
- 「数値」section を v2.3.0 baseline → 現在に bump(vitest 7711 / 7711、bundle.js 1849 KB、CSS 163 KB)
- 「Test plan」に「視覚 verification(vtest pipeline、scripts/vtest.sh で実機 render 確認)」を追加

### 3. self-audit 8 項目

`docs/development/pr-review-checklist.md` の 8 項目を本 stack で確認:

| # | 項目 | Status |
|---|------|--------|
| 1 | Scope drift | ✅ 全 commit が宣言 block(U / A / C)+ audit hotfix + 視覚 verification 内 |
| 2 | CI 3 checks の conclusion | ⏳ push 直後、CI 待ち |
| 3 | Review comments / unresolved threads | ✅ 0 件(本 stack は self-review 完結)|
| 4 | mergeable_state | ⏳ CI green 後 |
| 5 | Test plan checklist | ✅ source-based 確認(typecheck / 7711 unit / 359 AST / build / vtest 視覚 verification 4 + 4 PNG / 構造検査 0 residue)|
| 6 | 互換性 / contract grep | ✅ schema 1 不変、`AstDocument.astVersion` 不変、`data-pkc-*` 不変、新 file は `scripts/vtest*` + `docs/development/visual-docx-*.md` のみ |
| 7 | Bundle / budget | ✅ CSS 163 KB(cap 512、headroom 349 KB)/ JS 1849 KB(cap 4608、headroom 2759 KB、PR-V13 から +29 KB は V24 run-level formatting 増分)|
| 8 | Merge 判断の報告 | ⏳ CI green 後 user 判断 |

§2.9 doc archival、§2.10 CHANGELOG、§2.11 順序性テストの追加項目:

- §2.9 docs:`INDEX.md` に `visual-docx-verification-pipeline.md` 登録済 ✅
- §2.10 CHANGELOG:`CHANGELOG_v2.3.0.md` の v2.3.x stack 内訳に PR-V18..V23 を追記済 ✅(PR-V24 / V24-hardening の追記は本 doc の追記 commit で対応)
- §2.11 順序性テスト:本 stack は新 dynamic 機構を含まない(既存 vtest pipeline / pptx run-level formatting は出力レイヤー、boot → action → consumer 鎖は対象外)→ 該当なし

### 4. Merge(user 判断、Claude は実行しない)

CI green + self-audit 通過後、user が GitHub UI で **Squash and merge** を実行。Squash merge により main に 1 commit で集約、PR-V1..V24 + hardening の全変更が `feat(v23-stack): ...` 単一 commit として記録される。

## Merge 後の branch cleanup

### 削除候補(本 wave 由来 + 過去 stale)

本 stack(PR #433)merge 後、以下 14 件が削除候補:

| Branch | 由来 | 状態 |
|--------|------|------|
| **`claude/v23-stack-2026-05-14`** | **本 stack** | merge 後 squash で main に統合 |
| `claude/phase3-2aa-ir-migration` | PR #419 | C2 audit で既に candidate(PR #432 経由)|
| `claude/phase3-2cc-flags-keyboard` | PR #423 | 同上 |
| `claude/phase3-2ff-app-launcher` | PR #426 | 同上 |
| `claude/phase3-2hh-doc-archival` | PR #428 | 同上 |
| `claude/phase3-2s-theme-switching` | PR #413 | 同上 |
| `claude/phase3-2u-bold-in-if-investigation` | PR #415 | 同上 |
| `claude/phase3-2w-frontmatter-body-formal` | PR #417 | 同上 |
| `claude/phase3-2x-hotfix-inline-code-mask` | PR #430 | 同上 |
| `claude/phase3-2y-ast-parse` | PR #419 | 同上 |
| `claude/phase2-bold-in-if-investigation` | wave-phase2 | 同上(superseded)|
| `claude/m7-followup-split-view-fix` | wave-m7 followup | 同上 |
| `claude/m7-followup-yaml-natural-extension` | wave-m7 followup | 同上 |
| `claude/pkc2-caret-preview-sync-pr206` | PR #206 paused | 同上(archived spec)|

(本 doc は C2 audit の 13 件に **`claude/v23-stack-2026-05-14`** を加えた 14 件として運用)

### 保持 branch

- `main`(default、protected)

### 実行手順 A:GitHub Web UI

1. Repository → **Branches** タブ
2. 上記 14 件を 1 つずつ "Delete" button で削除
3. 各 branch の commit は PR squash merge 経由で main に存在するため、削除しても履歴は失われない

### 実行手順 B:`gh` CLI(authenticated)

```bash
for b in v23-stack-2026-05-14 \
         phase3-2aa-ir-migration phase3-2cc-flags-keyboard phase3-2ff-app-launcher \
         phase3-2hh-doc-archival phase3-2s-theme-switching \
         phase3-2u-bold-in-if-investigation phase3-2w-frontmatter-body-formal \
         phase3-2x-hotfix-inline-code-mask phase3-2y-ast-parse \
         phase2-bold-in-if-investigation m7-followup-split-view-fix \
         m7-followup-yaml-natural-extension pkc2-caret-preview-sync-pr206; do
  gh api -X DELETE "repos/sm06224/PKC2/git/refs/heads/claude/$b"
done
```

### 実行手順 C:`scripts/close-stack-prs-v2.sh`(authenticated 環境)

```bash
# PR #433 squash merge 後で実行(--stale-days 0 で全 closed 由来 claude/* を削除候補)
bash scripts/close-stack-prs-v2.sh --aggregate 433 --prune-stale-branches --stale-days 0 --apply
```

### 制約(本 session 直接実行不可)

- 本 session の git 環境は **ローカル proxy 経由で remote 接続**、`git push origin --delete <branch>` は `fatal: the remote end hung up unexpectedly` で reject される
- MCP github tool に branch 削除 API 相当が無い(`mcp__github__list_branches` で確認可だが `delete_branch` は未提供)
- **結論**:cleanup 実行は **user 環境(local terminal / GitHub Web UI / authenticated gh CLI)で必要**

## 次 wave 着手前 checklist(user 側 follow-up)

PR #433 merge + branch cleanup 完了後、reform-2026-05 Phase 6 doc lifecycle 自己 binding(`CLAUDE.md` 規律)に従い:

1. **Roadmap 同期**(必須):
   - `docs/development/feature-requests-2026-04-28-roadmap.md` の U3/U4/U7/A3/U1/U6 等の領域を「✅ v2.3.x stack で着地」に更新
   - `docs/planning/USER_REQUEST_LEDGER.md` §3.6 の deferred 項目 trigger を再評価
2. **Doc archive**:
   - PR-V1..V24 の完了 spec は既に archive 済 or `docs/development/visual-docx-verification-pipeline.md` のような LIVE 規約として継続
3. **CHANGELOG bump 判断**:
   - 本 stack は v2.3.0 後の継続(patch level、breaking なし)→ 次の minor / major bump 時に `CHANGELOG_v2.4.0.md` を新規起こし
4. **pptx 残課題(別 PR scope)**:
   - simplify reuse agent 指摘:`inlinesToRuns` / `linkToRuns` / `resolveImageSrc` / `detectTaskState` を docx/pptx 共通 helper に extract(~200 line 削減見込み、4 件)
   - magic string(`FFFF00` / `EEEEEE` / `Consolas` 等)の constants 化
   - AstTable cell 内 formatting の plain text drop fix(現状 bold / italic を cell text 内で flatten)
   - pptx title placeholder 使用(現状 `slide.addText` で text box、Microsoft Outline View で title 認識されない)
5. **vtest pipeline 拡張**(可選):
   - `compare -metric AE` ImageMagick diff regression(差分閾値超 page のみ Claude にレビュー = token 節約 + 回帰検出)
   - CI 統合(現状 local only)

https://claude.ai/code/session_019f6gJmFz2pLU7Q455n2f4N
