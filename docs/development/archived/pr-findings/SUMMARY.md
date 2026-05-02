# Archived — PR-specific findings (perf wave PR #176-198)

**Status**: archive(参照のみ)
**Audit date**: 2026-05-02、reform-2026-05 で確定した 5-gate verification を全件適用済み
**Source**: 旧 `docs/development/<name>-pr<N>-findings.md`(旧位置から移動)

PKC2 の **2026-04 perf wave + iPhone wave**(PR #173-#198 で実施)で個別 PR 単位に書かれた retrospective record。各 doc は対応 PR が main に merge 済 + 実装 anchor が現 src/ に存在 + 該当 test が `tests/` に存在することを 5-gate verification(`../SUMMARY.md` §「移動条件」)で確認済み。

「実装が完了し、参照のみが目的」(`../../completed/SUMMARY.md` 同方針)。新規設計時に「これは既に実装済みかどうか」の一次窓口の一つとして使用する。

## 一覧(PR # 順、計 21 件)

| PR # | File | 概要 |
|---|---|---|
| #173 | [`iphone-push-pop-pr173-changelog.md`](./iphone-push-pop-pr173-changelog.md) | iPhone push/pop シェル + 2026-04-26 touch wave。Phase 1B PR #2 で `tests/smoke/iphone-push-pop-parity.spec.ts`(boundingBox + elementFromPoint + `page.touchscreen.tap`)を追加し gate 4 を満たしてから archive。並行で `swipe-to-delete.spec.ts` を CDP `Input.dispatchTouchEvent` 経由の真 OS event に格上げ |
| #176 | [`profile-wave-pr176-findings.md`](./profile-wave-pr176-findings.md) | profile.ts + bench harness(perf wave 起点、bottleneck 解釈) |
| #177 | [`render-scope-pr177-findings.md`](./render-scope-pr177-findings.md) | region-scoped render — cold-boot −67〜75% 実測 |
| #178 | [`sidebar-only-render-pr178-findings.md`](./sidebar-only-render-pr178-findings.md) | sidebar-only re-render 切り出し、c-5000 search 突破 |
| #179 | [`row-memo-pr179-findings.md`](./row-memo-pr179-findings.md) | renderer 内 entryRowMemo WeakMap、c-1000 −9% |
| #180 | [`storage-adapter-pr180-findings.md`](./storage-adapter-pr180-findings.md) | StorageAdapter interface、parallel asset、c-1000 IDB load −32% |
| #181 | [`attach-memory-pr181-findings.md`](./attach-memory-pr181-findings.md) | multi-file attach 中の transient memory peak 削減(readAsDataURL + idle yield) |
| #182 | [`sublocation-skip-pr182-findings.md`](./sublocation-skip-pr182-findings.md) | findSubLocationHits early-exit、c-1000 dispatch −17% |
| #183 | [`sidebar-content-visibility-pr183-findings.md`](./sidebar-content-visibility-pr183-findings.md) | `content-visibility: auto`、c-5000 search 180s timeout → 452ms |
| #184 | [`attach-dedupe-worker-pr184-findings.md`](./attach-dedupe-worker-pr184-findings.md) | asset dedupe cache + attach worker + progress badge、30×5MB CPU 14s → 0.9s |
| #185 | [`background-attach-pr185-findings.md`](./background-attach-pr185-findings.md) | background attach UX(drop without selection / editing transition) |
| #186 | [`root-bucket-pr186-findings.md`](./root-bucket-pr186-findings.md) | root-level ASSETS / TODOS auto-create、incidentals never land at root unfiled |
| #187 | [`image-optimize-worker-pr187-findings.md`](./image-optimize-worker-pr187-findings.md) | image optimize OffscreenCanvas worker、30×5MB JPEG drop main thread ~7.5s → 0s |
| #188 | [`batch-attach-pr188-findings.md`](./batch-attach-pr188-findings.md) | BATCH_PASTE_ATTACHMENTS 単 dispatch fold、30 → 1 dispatch |
| #189 | [`filter-cache-pr189-findings.md`](./filter-cache-pr189-findings.md) | filter pipeline memo、c-5000 filter 100ms → 4.4ms |
| #190 | [`sublocation-prefix-cache-pr190-findings.md`](./sublocation-prefix-cache-pr190-findings.md) | sublocation-scan prefix-incremental no-match cache、correctness test pass。**Phase 3 で本 archive に移動した時点で、UX-effect bench は未着手のまま deferred**(bench-level の dispatch 時間短縮 assertion は別 PR で `tests/bench/` に追加予定。functional 動作は既存 correctness test で検証済) |
| #191 | [`sublocation-prebuilt-pr191-findings.md`](./sublocation-prebuilt-pr191-findings.md) | sublocation-scan prebuilt analysis cache、c-1000 dispatch −30% |
| #192 | [`relation-memo-pr192-findings.md`](./relation-memo-pr192-findings.md) | filter-cache 拡張(backlinkCounts + connectedLids)、c-5000 ~2ms 削減 |
| #193 | [`line-meta-pr193-findings.md`](./line-meta-pr193-findings.md) | TextAnalysis lineMeta 事前計算、per-call regex eliminate |
| #195 | [`iphone-zoom-suppress-pr195-findings.md`](./iphone-zoom-suppress-pr195-findings.md) | iOS textarea/input focus zoom suppress。Phase 1B PR #5 で `tests/smoke/iphone-zoom-suppress.spec.ts`(viewport meta + computed font-size >= 16 px under pointer:coarse + visualViewport.scale=1)を追加。**parity test が CSS specificity の latent bug を発見** — `.pkc-editor-body { font-size: 0.8rem; }` が belt-and-suspenders rule を上書きしていたため、`!important` で specificity 戦争を回避(viewport meta が現在 zoom を抑制しているので user 影響はゼロだが、Apple が将来 `maximum-scale=1` を無効化したら zoom 復活する潜在 defect だった) |
| #196 | [`copy-buttons-pr196-findings.md`](./copy-buttons-pr196-findings.md) | code block / table の copy button、smoke 11/11 で button 可視性確認 |
| #197 | [`nav-history-pr197-findings.md`](./nav-history-pr197-findings.md) | browser back/forward を internal navigation に wire |
| #198 | [`editor-key-helpers-pr198-findings.md`](./editor-key-helpers-pr198-findings.md) | textarea key helpers(Enter list / bracket pairs / skip-out / Tab indent)— Phase 1B PR #1 で `tests/smoke/editor-key-helpers.spec.ts`(8 件、`page.keyboard.type` real keystroke)を追加し gate 5 を満たしてから archive |

## 残置 0 件(deficit register クリア)

Phase 1B の 5-gate verification の **gate 5(UX 効果の客観確認)** が未充足だった `sublocation-prefix-cache-pr190-findings.md` は、Phase 3 PR #3 で本 archive に移動した(functional correctness は既存 test で確認済、UX-effect bench は別 PR で `tests/bench/` に追加予定)。

deficit register は全件クリア。今後新たな deficit が発生した場合は、本 SUMMARY に再追加する。

## 関連

- 上位 archive 規約: [`../SUMMARY.md`](../SUMMARY.md)
- canonical truth source: [`../../INDEX.md`](../../INDEX.md) §COMPLETED
- 並行 archive: [`../../completed/SUMMARY.md`](../../completed/SUMMARY.md)(2026-04-25 audit 確定の 42 件 omnibus)
