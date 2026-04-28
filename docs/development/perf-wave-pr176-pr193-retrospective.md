# Perf wave PR #176-#193 — retrospective

**Period**: 2026-04-26 〜 2026-04-28(3 日)
**PRs**: 18(#176-#193)
**Status**: 完走

User direction trail:
- 「ALL!! GO AHEAD!!!!」(初回承認)
- 「マージ完了 続行して」(各 PR 後の継続承認)
- 「もっさり」「メモリ不足にならないように」「OPFS 透過」「workerかも」
  「root配置はNG」「画像最適化のダイアログは出してよい」(計画修正)

## 1. 全体像

`render:sidebar` が search-keystroke の支配コストとして表面化したのを
起点に、container size scaling(c-100 〜 c-5000)に対する応答性と、
multi-file attach のメモリ / UX / ASSETS 整理を網羅的に攻めた。

## 2. 累積成果(c-1000 / c-5000 search-keystroke)

| 計測 | PR #178 起点 | PR #193 後 | 改善 |
|---|---|---|---|
| c-1000 search dispatch p50 | 159.8 ms | ~50-65 ms | **−65 %** |
| c-5000 search dispatch p50 | (180 s timeout) | **~408 ms 実用化** | — |
| filter-pipeline c-5000 p50 | 100 ms | 4.6 ms | **−95 %** |
| sublocation-scan c-5000 p50 | (PR #182 露出 119 ms) | 130 ms | (構造改善) |
| boot:loadFromStore c-1000 | 51.7 ms | 35 ms | **−32 %** |

## 3. multi-file attach

| シナリオ | PR #181 起点 | PR #188 後 |
|---|---|---|
| 30 × 5 MB drop main thread 占有 | フリーズ | **~0.5 s (−98 %)** |
| 多ファイル添付 peak heap | ~250 MB | **~7 MB (−97 %)** |
| dispatch 回数 | 60 (CREATE+COMMIT × 30) | **1 (BATCH_PASTE_ATTACHMENTS)** |
| selection / editing 移動 | 30 | **0** |
| iPhone entry view 強制 push | 30 回 | **0 回** |
| ASSETS 自動配置 | folder context のみ | **常時(root 含む)** |
| Progress UI | なし | 右下 badge |

## 4. PR ごとの一行サマリ

| PR | 内容 | 主要効果 |
|---|---|---|
| **#176** | profile harness + bench infra | perf 計測基盤 |
| **#177** | render scope 'settings-only' | cold-boot RESTORE_SETTINGS 短絡 |
| **#178** | render scope 'sidebar-only' | sidebar-only 短絡で c-5000 検索操作可能化 |
| **#179** | row + index memoization | flat-mode `<li>` を Entry ref で WeakMap memo |
| **#180** | StorageAdapter + parallel asset reassembly | OPFS-ready interface、IDB load −32 % |
| **#181** | multi-file attach memory | readAsDataURL + idle yield、peak heap 250→7 MB |
| **#182** | findSubLocationHits early-exit + sub-instrumentation | 残り内訳分解、c-1000 dispatch −17 % |
| **#183** | content-visibility:auto | c-5000 search 180s timeout → 452 ms 実用化 |
| **#184** | asset dedupe cache + attach worker + progress badge | 30 file CPU 14 s → 0.9 s |
| **#185** | background attach (PASTE_ATTACHMENT) | selection / editing / phase 維持、iPhone entry view 開かず |
| **#186** | root-level ASSETS/TODOS auto-create | incidentals が常に整理される仕様修正 |
| **#187** | image-optimize OffscreenCanvas worker | canvas 仕事を main thread から外す |
| **#188** | BATCH_PASTE_ATTACHMENTS | 30 dispatch → 1 dispatch + 1 render |
| **#189** | filter-pipeline memo | container ref keyed cache、c-5000 100 → 4.4 ms |
| **#190** | sublocation prefix-incremental cache | no-match WeakSet で次キーストローク短絡 |
| **#191** | sublocation prebuilt analysis cache | TextAnalysis を WeakMap で memo |
| **#192** | relation-derived memo (backlink/connected) | filter-cache に統合 |
| **#193** | TextAnalysis lineMeta precomputation | per-line 正規表現を build 時に集約 |

## 5. アーキテクチャ追加成果

- **`StorageAdapter` 抽象**(PR #180)— OPFS 移行の土台
- **`render-scope.ts`**(PR #177-#178)— scope 検出層
- **`filter-cache.ts`**(PR #189-#192)— container ref keyed memo の統一基盤
- **`attach-worker-client.ts` / `optimize-worker-client.ts`**(PR #184/#187)
  — inline Blob worker パターン(単一 HTML 制約下)
- **`attach-progress.ts`**(PR #184)— 非ブロック progress badge
- **`prepareAttachmentPayload` + `BATCH_PASTE_ATTACHMENTS`**(PR #188)—
  attach の dispatch / 描画コスト分離

## 6. テスト累積

| 計測 | wave 開始時 | PR #193 後 |
|---|---|---|
| unit tests | 5878 | **5966 (+88)** |
| smoke tests | 11 | 11 |
| 新 test ファイル | — | 11 ファイル新設 |

新規テストファイル:
- storage-adapter.test.ts(10)
- row-memo.test.ts(6)
- render-scope-integration.test.ts(5)
- file-to-base64.test.ts(5)
- asset-dedupe-cache.test.ts(9)
- attach-progress.test.ts(7)
- background-attach-pr185.test.ts(3)
- background-attach-assets-placement.test.ts(3)
- auto-placement-root-bucket-pr186.test.ts(7)
- batch-paste-attachments-pr188.test.ts(7)
- filter-cache-pr189.test.ts(11)
- sub-location-prefix-cache-pr190.test.ts(10)
- sub-location-prebuilt-cache-pr191.test.ts(6)
- optimize-worker-client.test.ts(3)

## 7. bundle / budget

| 計測 | wave 開始 | PR #193 後 |
|---|---|---|
| bundle.js | 729.39 KB | ~837 KB(+~107 KB)|
| bundle.css | 103.96 KB | 104.43 KB(content-visibility 追加分)|

bundle.js 増分の内訳:
- StorageAdapter 三層(PR #180): ~11 KB
- attach-worker-client + progress + dedupe cache(PR #184): ~5 KB
- BATCH reducer + helper(PR #188): ~4 KB
- filter-cache + 拡張(PR #189-#192): ~3 KB
- sub-location 各種 cache(PR #190-#193): ~2 KB
- image-optimize worker(PR #187): ~2 KB
- 残りは inline worker source 文字列化のオーバーヘッド + テスト helper

CLAUDE.md の bundle.js budget 1536 KB に対して headroom 700 KB+。

## 8. 残された leverage(PR #194 以降の候補)

| 候補 | サイズ | 期待効果 | 注意点 |
|---|---|---|---|
| list virtualization | 大 | c-5000 dispatch 408→~50 ms | scroll handling、variable row height、a11y |
| sidebar header memo | 小 | ~10-30 ms / render | 検索 UI 状態の依存解析 |
| dispatcher render coalescing | 中 | rapid-fire dispatch 1 render | 既存テストの sync state 仮定との整合 |
| OPFS adapter 実装 | 中 | (機能拡充)| StorageAdapter 既に ready |

## 9. 振り返り — 設計判断のメモ

**良かった点**:
- profile harness(PR #176)を最初に入れたことで、毎 PR で測定 → 反復
  改善の閉ループが回った
- WeakMap by Entry ref / by Container ref のキャッシュパターンを早期に
  確立(PR #179)、その後の memo 系 PR がコピペで済んだ
- inline Blob worker(PR #184)の確立により、後続の image-optimize
  worker(PR #187)が 1 日で書けた
- bench だけでなく仕様 doc + tests を毎 PR 作る慣習で、user feedback
  loop に応えやすかった

**改善余地**:
- bench machine の load noise が大きく、c-5000 数字は ±20 % 揺れた。
  CI 外の専用環境 / 統計的処理(複数 run の median)が要 PR-194+ 候補
- 仕様変更(PR #186)を perf PR と混ぜるとレビューが重くなった。
  spec 変更は単独 PR が望ましい
- iPhone-specific 検証は実機テストが取れず、bench は desktop chromium
  のみ。touch 経路の bench scenario は今後の課題

## 10. ユーザー方針メモ

- 「もっさり」感は wall-clock 占有で表現される(memory peak だけ低くしても
  足りない)— PR #181 → #184 → #188 の三段攻めが必要だった
- 「邪魔しない」要請(PR #185)は dispatch shape の変更まで踏み込んだ
- 「OPFS 透過」(PR #180)は **interface だけ整えて impl は後回し** で
  ユーザー意図を満たした(実装が来た時点で差し替え可能)
- 仕様の "正しさ" が perf より優先(PR #186 が示した:速度より配置先が
  間違っていることが本質)
