# PR #256 — 領域 10-1 Split View block 対応ハイライト + caret indicator

**Status**: implemented
**Date**: 2026-05-05
**Roadmap**: 領域 10-1(Split View 同期スクロール、保留解除)
**Lineage**: PR #206 paused → reform-2026-05 → PR #255 (PR 1 foundation) → PR #256 (PR 2 + hotfix-1〜7 + follow-up x4)
**Closes / supersedes**: `pr-206-paused.md`

User direction(2026-05-04 chat):
> 以前に実装を保留した Split View の同期スクロール…(略)機能改修フェーズで再開

User judgement(2026-05-05 reform 経由 + 11 round の hotfix series 後):
> ふう、かろうじて及第点です。PR 監査と最適化を行いマージに備えてください

## 1. 動機

PR #206(2026-04 v17 まで)で行レベル sync を block-level anchor で試みたが paused。reform-2026-05 doctrine 確立後、再開:

- **行レベル一致は markdown 仕様上の N:M 関係**で原理的に不能(table cell wrap、heading 高さ違い、連続空行、段落 wrap)
- 業界事例調査(出典 30+、1 次資料):VS Code 内蔵 / Joplin / iA Writer / Markdown-Edit すべて block-level + 内挿で割り切り、N:M を解いた事例ゼロ
- **「block 対応ハイライト + caret auto-scroll」**にスコープ縮退、IR 経由の行レベル sync は領域 10-3 に分離

## 2. 実装(着地時点)

### Production code

| File | 役割 |
|---|---|
| `src/adapter/ui/source-preview-sync.ts` | 同期 orchestration:opt-in toggle + comfort-band tracking + suppression flags + debug overlay + caret auto-scroll(両方向)+ table row → wrapper highlight delegate |
| `src/adapter/ui/caret-indicator.ts`(NEW)| PKC2 全体の textarea で動く global caret-row indicator。document focusin/scroll/selectionchange listener、`position: fixed` overlay。Tier 0 flag 4 個で runtime 調整 |
| `src/adapter/ui/action-binder.ts` | 4 listener + ⇄ toggle action case + chrome leak gate(media-viewer / table-sort / filter handler を edit-mode preview で skip) |
| `src/adapter/ui/detail-presenter.ts` | active-line overlay element + ⇄ toggle button(resize handle absolute) |
| `src/features/markdown/markdown-render.ts` | `sourceLineAnchors: true` opt-in + `tagSourceLines` walker + `makeSourceLineAttrs` / `collectSourceLineAttrs` export + tr_open anchor + CSV fence / table wrapper への source-line attr 伝搬 |
| `src/styles/base.css` | active-block highlight(`:not(table):not(tr)` で table 崩壊回避)+ L<n> badge 右外配置 + edit-mode chrome 抑制 + cursor:text 統一 |
| `src/main.ts` | boot 時 `installCaretIndicator()` 1 回登録 |

### Public exports / contracts

- `renderMarkdown(text, { sourceLineAnchors: true })` — opt-in、view-mode 既存挙動に影響なし
- `makeSourceLineAttrs(start, end)`, `collectSourceLineAttrs(token)` — IR 経路への future-proofing(領域 10-3 で再利用)
- `caret_indicator.{enabled, tint_pct, border_alpha_pct, border_width_px}` — Tier 0 flag、URL `?pkc-flag=...` で runtime 調整

### URL flags / debug

- `?pkc-debug=split-sync` → 画面右上に live state panel(caret line / preview line / scroll values / suppression flags)
- `?pkc-flag=caret_indicator.tint_pct=40` 等で indicator 視覚調整

## 3. 設計判断と撤回

| 試み | 状態 | 理由 |
|---|---|---|
| 行レベル 1:1 sync(block-internal proportional) | 撤回(hotfix-5) | N:M 問題で block 高 ≠ source 行数、table wrap で破綻 |
| `safeScrollPane` comfort-zone(50% 中央) | 撤回(hotfix-6) | yank-scroll 過剰、minimum-amount に置換 |
| `ensureRectVisible`(in-view → no-op) | 撤回(follow-up-3) | block 内 caret 移動で「一度しかジャンプしない」体感 → comfort-band 追従(20%-55%)に置換 |
| `scroll-behavior: smooth` CSS | 撤回(follow-up-4) | Playwright `scrollIntoView` と race して click 座標崩れ |
| editor active-line badge を caret 行番号 | 撤回(hotfix-7) | preview badge と番号ズレで「同期していない」見え → block start に統一 |
| split-editor 専用 caret indicator | 撤回(follow-up-2) | PKC2 全体の textarea で動く global 機構に格上げ |

## 4. 検証(reform-2026-05 §6 visual-state-parity)

### Spec 構成(全 52 件 sync 関連 smoke + 18 件 unit)

| spec | 件数 | 主旨 |
|---|---|---|
| `source-preview-sync-parity.spec.ts` | 10 | render pattern 別 visual-state-parity |
| `source-preview-sync-realcontent-multiangle.spec.ts` | 7 | 4 caret + 5 row click + 上下端往復 |
| `source-preview-sync-realcontent-diagnostic.spec.ts` | 3 | 15 caret 位置 probe + table row click + CSV mid |
| `source-preview-sync-jitter-diagnostic.spec.ts` | 6 | 小数 deltaY + 16ms burst + caret out-of-view + 30 step loop |
| `source-preview-sync-real-wheel-diagnostic.spec.ts` | 4 | `page.mouse.wheel` real OS event |
| `source-preview-sync-editor-overlay.spec.ts` | 6 | overlay parity + chrome hide + scroll 追従 + flag 早食い regression |
| `source-preview-sync-ensure-visible.spec.ts` | 5 | minimum-scroll 双方向 + chrome leak guard |
| `source-preview-sync-wheel-then-reselect.spec.ts` | 2 | user wheel → caret 再選択で band 復帰 |
| `source-preview-sync-visual-check.spec.ts` | 9 | eyes-on artefact harness(ローカルのみ screenshot 生成) |
| `markdown-render-source-anchors.test.ts` | 18 | renderer anchor 生成 / helpers / fence-table-tr |

### 5-gate verification(archive 適格性)

1. ✅ PR #256 main に merge 済(commit `72bdfd9`)
2. ✅ 実装 anchor 全て現 src/ に存在
3. ✅ 主張する挙動を網羅する test が tests/ に存在
4. ✅ Visual feature の parity test(`page.mouse.click(x,y)` + `elementFromPoint` + real wheel)複数
5. ✅ 実 DOM 状態 / 実 OS event を観測(stub なし)

## 5. PR #206 paused 理由への直接 counter

| paused 理由(2026-05-01 user 判断) | PR #256 での対処 |
|---|---|
| 「描画と生成を同じものとして検証」 | 各 spec で state mutation(DOM 属性)+ consumer behavior(scrollTop / elementFromPoint / overlay rect)の AND 条件 assert、reform-2026-05 §6 doctrine 準拠 |
| user 側 debug 報告導線が無い | `?pkc-debug=split-sync` URL flag canonical 経路実装、画面右上 live state panel |
| Playwright `locator.click` が OS event を経ない | 全 click を `page.mouse.click(x, y)` で発火、`elementFromPoint` で実 painted pixel 確認、`page.mouse.wheel` で real OS wheel diagnostic 4 件 |

## 6. 7 round の hotfix series で得た教訓

reform-2026-05 doctrine の延長として、本 PR を経て暗黙ルール化:

1. **「test pass = ship」幻惑への耐性** — Playwright green は「動作確認」ではない、screenshot を 1 枚ずつ目視するまで判断しない
2. **長大 + overflow する fixture が必須** — 短い markdown では scroll / overflow 系の機能は再現しない、user 提供の実コンテンツ規模で確認
3. **personal content は test fixture から完全排除** — generic synthetic に置換、`_fixtures/` に集約、grep 0 件確認
4. **screenshot の GitHub upload を物理的に防ぐ二重防御** — workflow から `Upload failure artifacts` step 削除 + spec layer の `attachShot` helper(`PKC_VISUAL=1 && !CI` で gate)
5. **「サボらず本 PR で全部片付ける」** — user 直接 demand を doctrine として記録

## 7. Out of scope(deferred、`USER_REQUEST_LEDGER.md` §3.6 に記録)

- entry-window split editor の同期(別 document context、cross-window IPC 必要)
- 行レベル sync の再評価(領域 10-3 IR 着地後に Phase 4 として)

## 8. 累計サイズ

| 項目 | 値 |
|---|---|
| commits | 16 |
| insertions / deletions | 5,685 / 39 |
| changed files | 31 |
| bundle.css | 119.50 → 121.74 KB(+2.24 KB) |
| bundle.js | +少 |
| budget | 120 → 122 → 124 KB(2 段 bump) |
| smoke spec | +52 sync 関連、計 93/93 green |
| unit spec | +18、計 6301/6301 green |

## 9. 関連

- **superseded**: [`pr-206-paused.md`](./pr-206-paused.md)(同じ archive 内、historical record として保存)
- **次 wave 候補**: [`../../intermediate-representation-audit.md`](../../intermediate-representation-audit.md)(領域 10-3、本 PR で audit draft 着地)
- **doctrine**: `visual-state-parity-testing.md` §6, `debug-via-url-flag-protocol.md`, Phase 8 順序性
- **CHANGELOG**: `docs/release/CHANGELOG_v2.2.0.md` の領域 10-1 関連 9 項目(PR 1 + PR 2 + hotfix-1〜7 + follow-up x4)
