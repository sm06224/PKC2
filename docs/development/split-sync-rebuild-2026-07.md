# Split-editor Source ↔ Preview 同期 — 2026-07 rebuild(scroll 写像方式)

**Status**: 🟢 LIVE(2026-07-03 着地)
**Supersedes**: PR #256 世代の「block 対応ハイライト + comfort band」設計
(`archived/pr-findings/split-view-sync-pr256-findings.md`)。pure helper 層
(anchor 規約 / caret↔line 変換)は継続使用。
**User 依頼**: 「レンダリング結果と元のマークダウンを紐づけて、編集画面で
同期表示させる機能。今もあるけど、まともに動かない。作り直して」(2026-07-03)

## 1. 旧世代の構造的欠陥(なぜ hotfix で直らなかったか)

| 欠陥 | 帰結 |
|---|---|
| 位置推定が「ブロック高 ÷ ソース行数」の**比例割り** | 折り返し行・画像・mermaid・幅依存高の要素で即ズレ(診断 spec:「あっという間に表示ずれている」) |
| **comfort band** [20%,55%] ヒューリスティック | 「一度しかジャンプしない」「wheel 後の再選択で戻らない」— 11 hotfix の温床 |
| **80ms タイマー**による programmatic scroll 抑止 | wheel storm との race(「逆方向 scroll が一度だけ効かない」)。コード自身が「Playwright で再現できない」と自白 |
| preview scroll → editor は **no-op** | 「同期表示」なのに片方向 caret 追従のみ |

行レベル 1:1 同期が N:M 関係により原理不能という PR #256 の結論は正しい。
だが必要なのは 1:1 ではなく**連続・単調な対応**である(VS Code / Typora と
同じ結論)。

## 2. 新設計 — anchor-pair piecewise-linear 写像

```
preview: [data-pkc-source-line] 各 block の実測 content-Y ┐
                                                          ├→ (editorY, previewY) 単調ペア列
editor:  同じソース行の textarea 内実測 Y(mirror-div)  ┘        + 両端 {0,0} {max,max}
```

- **editor 側実測**(`editor-line-metrics.ts`): caret-position.ts と同じ
  style 複製 mirror に本文を流し、アンカー行頭の zero-width marker を
  1 layout pass で全計測。**soft-wrap を正確に反映**(比例割り廃止の核)。
- **写像**(`split-sync-map.ts`、純関数): ペア列を単調化し、scrollTop
  空間(端点 = maxScroll)と content 空間(端点 = scrollHeight)の 2 表を
  構築。双方向 piecewise-linear 補間。アンカー点上の誤差 ≈ 0。
- **連続双方向追従**(`source-preview-sync.ts` orchestration):
  - editor scroll → `mapEditorToPreview(scrollTop)` を rAF で preview へ
  - preview scroll → 逆写像で editor へ(**新機能**)
  - caret 移動 → caret content-Y を写像し、**editor の caret と同じ
    viewport 高さ**に preview の対応位置を整列(band 廃止・決定的)
- **echo filter + owner**: 追従側へ programmatic set した値を記録し、
  跳ね返り scroll event は「値の一致(±1px)」で無視。それ以外の scroll
  は user 入力 → その pane が owner。**タイマー無し**で race 根絶。
- **写像キャッシュ**: key = 本文 / 両 pane の clientWidth・clientHeight・
  scrollHeight。mermaid・画像の**後伸びは scrollHeight 変化として自動
  検出** → 再構築。連続入力中は直近表を使い trailing rebuild(120ms)。
  preview 再 render 時は `invalidateSplitSyncMap()` を明示呼出。

## 3. 維持したもの / 捨てたもの

| 維持 | 撤去 |
|---|---|
| anchor 規約(`markdown-render-scope.md`、`tagSourceLines` + LineMap) | `ensureRectInBand`(comfort band) |
| pure helpers(caretSourceLine / findPreviewElementForLine 等、unit 24 件) | `caretRowRectInBlock` / `blockMeasureRect`(比例割り) |
| block ハイライト・L\<n\> badge・editor overlay | `markProgrammaticScroll` / `consumeScrollSuppression`(80ms timer) |
| ⇄ toggle(opt-in、localStorage key 同一) | — |
| `?pkc-debug=split-sync` panel(owner / pairs / expected を追加表示) | — |
| preview click → caret jump + editor 側 min-scroll | — |

caret 側の `markProgrammaticCaretMove`(selectionchange 抑止)は継続 —
scroll と違い値エコー判定が使えないため。

## 4. 検証(visual-state-parity-testing 準拠)

- unit: `tests/adapter/split-sync-map.test.ts`(単調性 / 両端一致 / 逆写像
  round-trip / 汚れ入力除去、12 件)+ 既存 pure helper 24 件
- smoke(実 Chromium・real `page.mouse.wheel`):
  `split-sync-scroll-map-parity.spec.ts`
  - W1 editor wheel → preview 連続単調追従 + **逆方向 1 発目が即効**
  - W2 preview wheel → editor 追従(旧 no-op)
  - W3 アンカー精度 ≤ 24px(heading 行 = 上端整列)
  - W4 **幅 resize 後も精度維持**(旧・最頻故障モードの regression 弁)
- 旧 contract の spec 更新: `source-preview-sync-ensure-visible.spec.ts`
  E1/E2(min-scroll → 決定性 + 追従)、`source-preview-sync-wheel-then-
  reselect.spec.ts` R1/R2(band 復帰 → 可視 + caret 整列)。
- 既知除外: `source-preview-sync-realcontent-multiangle.spec.ts` #2 は
  リモート開発環境(browser rev 1194)で main でも fail する環境固有
  ケース(CI Tier-A 対象外)。

## 5. entry-window popup への移植(2026-07-03 完了)

popup は document.write + inline `<script>` で ES import 不能のため、
写像機構(mirror 実測 / 単調ペア / 補間 / echo filter / owner / rAF 追従)
を **inline ES5 で同 file 内に移植**(`entry-window.ts` の split sync 節)。
`pkcEnsureRectInBand`(band)は撤去し、caret は整列方式へ。検証は
`tests/smoke/entry-window-split-sync-parity.spec.ts`(P1 editor wheel
連続追従+逆方向即効 / P2 preview wheel → editor 追従(popup 初機能)/
P3 caret 移動で対応 block 可視)。

## 6. 残課題

- 行内(inline)粒度の対応は引き続き IR(領域 10-3、frozen #776)前提。
- center pane と popup の写像実装は意図的に二重(popup の自己完結
  doctrine)。写像ロジックに手を入れる時は両方を更新すること。
