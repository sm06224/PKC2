# Wave 10-9 Stabilization — 締めサマリ(2026-05-07)

**Status**: 🏁 Wave 完了(残バグは既知扱いで持越し、user 判断で merge 実行)
**Branch**: `claude/2026-05-10-9-filer-row-align-delta7`(stack の HEAD、122 commits / 100 PR)
**Top PR**: [#363](https://github.com/sm06224/PKC2/pull/363)
**Period**: 2026-05-06 〜 2026-05-07(2 日 wave、修正指示 1〜10 + 10-9 連続 hotfix)

---

## 1. Wave の意図

領域 10-6(filer / graph / inventory wave)着地後の **連続 hotfix wave**。user 側の実機テストで挙げられた **修正指示 1〜10**(filer 行ズレ / 計算式 / 多重選択 / popup sync / graph 過密 / Galaxy / Venn / ZIP import 等)+ wave 中に user が追加した報告(rubber band / Ctrl+click / 楕円 / 右クリック menu 等)を **stack 形式で 1 PR / 1 改修** に分割して全件着地。

---

## 2. Stack 構造

```
main
├── 260 → 261 → 262 → … → 275       (Phase 1〜5、filer wave、16 PR)
├── 276                              (wave-docs-manual、単発)
└── 277 → 278 → … → 344 ┬─ 345 → 346 (mobile-fixes 側枝、2 PR)
                          └─ 347 → 348 → … → 363 (review fixes 継続)
```

- **Bottom**: PR #260(filer-phase-1-pr-1、base=main)
- **Top**: PR #363(filer-row-align-delta7、Δ7〜Δ34 全部)
- **総 PR 数**: 100 件
- **総 commit 数**: 122

### 側枝(non-linear 部)

PR **#345 + #346**(mobile-fixes-yyy / mobile-fixes-zzz)は base=#344 の側枝。merge 順は #344 着地後に #345 → #346 → main の小チェーン、その後 main 復帰した状態で #347 以降を進める。

---

## 3. 着地済み Δ シリーズ(本 wave 主体、PR #363 内に集約)

| ID | 主題 | Status |
|----|------|--------|
| Δ1 | graph canvas aspect ratio(uniform scale + letterbox) | ✅ |
| Δ2 | filer column drag-to-resize(localStorage 永続) | ✅ |
| Δ3 | filer multi-select + bulk operations(checkbox + Shift range) | ✅ |
| Δ4 | graph node 過密 + サイズ抹本見直し(PKC1 依存撃退) | ✅ |
| Δ5 | bulk tag / color-tag / relation 一括付与(他要素不変保証) | ✅ |
| Δ6 | theme/WCAG + color-tag relations + time-proximity 重複改善 + Git 更新点 | ✅ |
| Δ7 | filer 行ズレ撃退(pixel-fixed line-height 21px / height 33px、delta 0px) | ✅ |
| Δ8 | inline-calc 計算式評価 indent / list marker 対応(14 ケース matrix) | ✅ |
| Δ9 | TOGGLE_MULTI_SELECT が selectedLid を移動する bug + Venn/Region toggle 不反応 + node 重なり改善 | ✅ |
| Δ10 | time-proximity 同 X bucket 重なり 38→4 pairs(2D grid) | ✅ |
| Δ11 | Detail→Filer 戻り動線 + popup caret indicator + 時系列重なり改善 | ✅ |
| Δ12〜Δ16 | 連続修正:popup caret / 時系列再設計 / Flags tier1 / sidebar 震動 / multi-select anchor 切替 | ✅ |
| Δ17〜Δ19 | folder=junction / 選択モード時の row click / 作成ボタン画面ロック | ✅ |
| Δ20〜Δ22 | region UX 用途明示 / Venn 真の集合 hull / Galaxy 3D perspective | ✅ |
| Δ23〜Δ24 | ZIP import OOM 撃退(streaming) + folder=junction 視覚化(完全除外撤回) | ✅ |
| Δ25〜Δ26 | Filer 一括操作 UI を Filer 側に + 深 folder path 工夫 + Galaxy 銀河強化(starfield + halo) | ✅ |
| Δ27 | ZIP import:SHA dedup 撤回(hang 元凶)+ progress toast + base64 chunked | ✅ |
| Δ28 | 時系列 archetype 一直線並び撲滅(hash jitter で自然散布) | ✅ |
| Δ29 | Galaxy/Venn caption 即時更新(FLAGS_CHANGED microtask 再 render) | ✅ |
| Δ30 | graph view 上部に multi-action-bar(Filer まで戻らず bulk 可) | ✅ |
| Δ31 | region 選択を矩形→楕円(描画 + hit test 両方、64-segment path) | ✅ |
| Δ32 | graph node Ctrl/Meta/Shift+click multi-select toggle | ✅ |
| Δ33 | node drag → 1-hop / 2-hop neighbor が rubber band で追従 | ✅ |
| Δ34 | 左クリック=graph 操作、右クリック=context menu(🔍 Open + 既存 Edit/Delete/Move) | ✅ |

---

## 4. 既知の残バグ(merge 後に持越し、user 認識済み)

user 判断「いくつかのバグ挙動はあるが wave 締め」で許容。次 wave で扱う候補:

- ⚠️ **bundle.css サイズ**:現状 146 KB(base.css 拡張 wave で増)、CHANGELOG 記載 budget 98 KB を超過。次 wave で **領域 9 Phase 1d / 重複削減 Phase 2c** で吸収予定。
- ⚠️ **rubber band drag**:1-hop / 2-hop neighbor のみ追従(BFS depth 2)。N-hop では止まる。physics サイマンレーション化は別 wave。
- ⚠️ **drag 後の position 永続**:drag で動かした位置は次 re-render(state 変化)で消える。ピン留めが要るなら別 wave で `pinnedPositions` Map を Container schema に追加する案。
- ⚠️ **既存 lint 警告 2 件**:`action-binder.ts:242` U+3000(irregular whitespace、archived layer)+ `parse-capture-json.ts:16` import restriction。既存問題、本 wave 起源ではない。**CI hotfix で解消済**(2026-05-07):U+3000 はコメント中の文字を表記から削除、import 制限は type-only の eslint-disable-next-line で許容。
- ⚠️ **textlog staged_render hydration race**(`flags-runtime-effect-parity.spec.ts:142` で skip 済):`?pkc-flag=textlog.staged_render.initial_count=3` を URL で渡しても 0 件しか hydrate されない(期待 3 件)。Δ29 の FLAGS_CHANGED → microtask 再 render 修正と timing race の疑い。次 wave で deep-dive 予定。

---

## 5. ドキュメント整備状況

| Doc | 更新済 |
|-----|--------|
| `docs/release/CHANGELOG_v2.2.0.md` | Δ1〜Δ4 のみ記載、Δ5〜Δ34 追記が wave 締めで必要(本 doc と同 PR で着地予定) |
| `docs/development/feature-requests-2026-04-28-roadmap.md` | 領域 10-6 wave クローズ済、領域 10-9 連続 hotfix wave のクローズ追記が必要 |
| `docs/planning/USER_REQUEST_LEDGER.md` | 修正指示 1〜10 を ledger §3.6 に tick off |
| `docs/development/wave-10-9-stabilization-summary.md` | **本書 NEW** |
| `docs/development/completed/codespaces-merge-playbook-wave-10-9.md` | **NEW**(merge コマンド playbook) |

---

## 6. Merge 戦略選択肢

詳細は [`codespaces-merge-playbook-wave-10-9.md`](./completed/codespaces-merge-playbook-wave-10-9.md) 参照。

### Option A — 単発 squash(推奨、~10 分)

PR **#363** を直接 squash-merge → main。残 99 PR は GitHub が自動的に「closed without merge / no diff」状態に近づく(必要なら bulk script で close)。**個別 PR 履歴は失われる** が、各 PR の description / review thread は GitHub 上に残る。

### Option B — 順次 bottom-up squash(~30〜60 分)

PR #260 → #261 → … → #363 の順に sequential squash。GitHub が次の PR の base を自動 retarget。**個別 PR 履歴を main の git log に保存**。

### Option C — Phase chain 分割(~20 分)

main 起点 4 系統(Phase 1-5 / wave-docs / review-fixes / mobile)を別々に merge。中間で integration check が入れられる。

---

## 7. 次 wave 候補(roadmap §領域 10 残)

- **10-1**: Split View block-対応ハイライト(着地済、IR 経路は 10-3 待ち)
- **10-2**: markdown 方言拡張 wave(領域 6 と統合)
- **10-3**: 内部中間表現(IR)導入 — audit doc 起こし済、Q1〜Q7 user 合意待ち
- **10-4**: スプレッドシートエントリ(独立)
- **10-5**: PKC-Message + extension 連携(10-3 安定後)
- **10-7**: アプリランチャー(10-4 / 10-6 揃ったら)
- **10-8**: Sandbox iframe ワークスペースコントローラ

---

## 8. Wave 統計

- **着地 commit 数**: 122
- **着地 PR 数**: 100(#260〜#363、欠番 #352)
- **影響行数**: 概算 +8000 / -3000(主に renderer.ts / graph-canvas.ts / action-binder.ts / base.css)
- **新 module**: `caret-indicator.ts` / `theme-scale.ts` / `frontmatter.ts` / `tree.ts` / `url-host.ts` / `filetype.ts` / `graph-canvas.ts` 等 ~10 件
- **新 spec doc**: `filer-view-and-folder-display-profile-audit-2026-05.md` / `intermediate-representation-audit.md` / `css-architecture-audit-2026-05.md` / `wave-10-6-ux-evaluation-2026-05.md` 等
- **bundle.js**: ~785 KB(start) → ~947 KB(end、+162 KB)
- **bundle.css**: ~120 KB → ~146 KB(+26 KB、要 budget 再評価)
- **tests**: 6259 → 6564(+305)、smoke spec 41 → ~100 件、すべて green

---

## 関連 doc

- [`codespaces-merge-playbook-wave-10-9.md`](./completed/codespaces-merge-playbook-wave-10-9.md) — Codespaces 用 merge コマンド集
- [`feature-requests-2026-04-28-roadmap.md`](./feature-requests-2026-04-28-roadmap.md) — 領域 1〜10 全 roadmap
- [`pr-review-checklist.md`](./pr-review-checklist.md) — 8 項目自己監査
- [`doc-archival-discipline.md`](./doc-archival-discipline.md) — RESOLVED doc archive 規約
- [`../release/CHANGELOG_v2.2.0.md`](../release/CHANGELOG_v2.2.0.md) — release notes
