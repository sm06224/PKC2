# TEXTLOG 複数画像パフォーマンス v1 — Minimum Scope

Status: DRAFT rev.2 2026-04-19
Pipeline position: minimum scope
Parent: `docs/planning/file-issues/03_perf-textlog-image-lazy-rendering.md`
Spike result note: `docs/development/fi-03-spike-native-lazy-result.md`

---

## 改訂履歴

| rev | 日付 | 要点 |
|-----|------|------|
| rev.1 | 2026-04-19 | 初版。`loading="lazy"` + `decoding="async"` を v1 本命として提示 |
| rev.2 | 2026-04-19 | 実測スパイク結果により native lazy / async decoding を棄却。v1 本命を staged render / staged asset resolve / placeholder に切替 |

> **rev.1 → rev.2 の転換根拠**: `docs/development/fi-03-spike-native-lazy-result.md` 参照。
> 要約: `loading="lazy"` は data URI に対して render time を 2 倍に悪化させる（50 枚で +94ms）。`decoding="async"` 単独は改善がノイズレベル（805ms → 785ms、2.5%）。両者とも v1 の user pain 解決には不十分であるだけでなく、lazy は害になることが実測で確定した。

---

## 0. 位置づけ

FI-03 は「複数画像を含む TEXTLOG の表示/編集が重い」問題。ユーザーが TEXTLOG にスクリーンショットを 10〜50 枚単位で貼り付ける運用は PKC2 の設計意図に含まれるが、現状では画像数に比例して DOM 構築・base64 decode・layout 全てが同期的に走り、無言で数秒〜十数秒フリーズする。

本 minimum scope は「何をなぜ最小修正するか」を定義する。**docs-only**。実装しない。

## 1. 問題の再定義

### 1-1. 現在の画像レンダリングパイプライン

TEXTLOG read view で画像を含むログ行を描画する流れ：

```
renderBody(entry, assets)
  └─ for each log in doc.sections[*].logs
       └─ renderLogArticle(lid, log, assets, ...)
            └─ resolveAssetReferences(source, { assets })
            │    └─ ASSET_IMAGE_RE → data:${mime};base64,${data}
            │       （base64 文字列を markdown 内に inline 展開）
            └─ renderMarkdown(resolved)
            │    └─ markdown-it が <img src="data:...;base64,..."> を emit
            └─ DOM に appendChild
```

**全ログ行を同期的に処理**する。画像 1 枚あたり：
1. `container.assets[key]`（数百 KB〜数 MB の base64 文字列）を markdown 文字列に inline 連結
2. `renderMarkdown()` が巨大文字列を parse → `<img src="data:...">` を含む HTML を生成
3. `innerHTML` で DOM に挿入 → ブラウザが base64 を decode → layout + paint

### 1-2. ボトルネックの所在

| フェーズ | 重さの原因 | 線形度 |
|---------|-----------|--------|
| **文字列構築** | N 枚分の base64 文字列を markdown source に inline 連結。1 枚 300 KB（screenshot 平均）× 50 枚 = 15 MB の文字列操作 | O(N × avg_size) |
| **markdown parse** | markdown-it が 15 MB の巨大入力を tokenize。画像トークン以外の tokens もすべてスキャンされる | O(total_chars) |
| **DOM 挿入** | `innerHTML` で `<img src="data:...">` を一括挿入。ブラウザが同期的に base64 → bitmap decode を始める | O(N) |
| **layout / paint** | 全 `<img>` が即座に layout 参加。viewport 外の画像もサイズ確定のために decode される | O(N) |

**実用上最も痛いのは「前段パイプライン（base64 inline 展開 → markdown parse → 一括 DOM 挿入）が全画像を同期的に処理する」こと**。文字列構築・parse・DOM 投入のいずれも画像数 × 画像サイズに線形で積み上がり、main thread を長時間ブロックする。

> **rev.2 で確定した重要知見**: `<img>` 属性による後段 lazy（`loading="lazy"` / `decoding="async"`）は、前段パイプラインが完了するまで **そもそも発動しない**。つまり「ユーザが既にフリーズを体感した後」でしか効かないため、前段コストを減らさない限り user pain は解決しない。詳細は `docs/development/fi-03-spike-native-lazy-result.md`。

### 1-3. edit surface の重さ

`renderEditorBody()` は **画像を解決しない**（textarea の `.value` にログ本文の markdown 原文を入れるだけ）。従って edit mode 自体は画像数に対して軽い。

ただし **read → edit → read の切替** が重い：
- edit 開始: re-render で `renderEditorBody()` を呼ぶ → 軽い
- edit 完了: re-render で `renderBody()` を呼ぶ → 全画像を再度同期展開 → **重い**

### 1-4. 「無言で遅い」が問題であること

現状、ユーザーへの feedback は一切ない：
- skeleton / placeholder / spinner なし
- 進捗表示なし
- ブラウザの loading indicator は `file://` では出ない
- 結果として「フリーズしたのか、待てば良いのか」の判断材料がゼロ

## 2. 対象 surface

| Surface | 対象 | 重さの性質 |
|---------|------|-----------|
| **TEXTLOG read view**（`renderBody` → `renderLogArticle`） | **対象** | 全 log article を同期的に全画像展開。主たる bottleneck |
| **TEXTLOG edit view**（`renderEditorBody`） | **対象（間接）** | edit 自体は軽いが、edit→read 切替で再 render が走る |
| **initial render（エントリ選択時）** | **対象** | 選択切替時に全ログ行 + 全画像を一括構築。最も重い瞬間 |
| **前段パイプライン**（`resolveAssetReferences` + `renderMarkdown` + DOM 挿入） | **対象（v1 本命）** | 画像数 N × 画像サイズ S に線形。staged 化の第一対象 |
| viewport 外ログ行の画像解決 | **対象（v1 本命）** | 初期表示時に可視範囲外の画像を解決する必要はない。staged asset resolve の直接適用箇所 |
| TEXT 本文の asset 表示 | 非対象 | TEXTLOG ほどの多画像ケースがない |
| attachment presenter | 非対象 | 単一画像なので性能問題なし |
| export HTML / print | 非対象（v1 scope 外） | print 時は全画像展開でよい（静的出力） |
| `<img>` 属性による後段 lazy（`loading="lazy"` / `decoding="async"`） | **非対象（rev.2 で棄却）** | data URI に対して効かない / 悪化することが実測で確定。詳細は spike result note |

## 3. v1 scope

### 3-0. なぜ前段を減らすのか（方針の軸）

rev.1 では「後段 lazy（`<img>` 属性）で viewport 外画像の decode を遅延すれば救える」と想定していた。spike 結果はこれを否定した：

- **`loading="lazy"` は data URI に対して発動しない / 悪化する**（render time 2 倍）
- **`decoding="async"` 単独は改善ノイズレベル**（805ms → 785ms）
- **後段 lazy はそもそも前段パイプラインが完了するまで走らない**

つまり、ユーザがフリーズを体感する時間（= 前段パイプラインの同期実行時間）は、後段で何をしても減らない。従って v1 は「後段 lazy」から「**前段を遅延 / 分割 / 回避する**」方向に転換する。

前段コストは `O(N × S)`（画像数 × 画像サイズ）で積み上がるため、削減の手段は：

1. **そもそも前段を走らせる画像数 N を初期表示時に減らす**（staged render）
2. **そもそも前段を走らせる画像を可視範囲に絞る**（staged asset resolve）
3. **前段未完了の区間でユーザに状態を示す**（placeholder）

この 3 点が v1 本命である。

### 3-1. 含めるもの

| 施策 | 内容 | 根拠 |
|------|------|------|
| **段階的レンダリング**（staged render） | `renderBody` で全 log article を一度に render しない。初期表示は先頭 / 近傍のみ（例: 直近 day-section ＋ その前後）。残り article は後段で順次 append | 前段コスト（parse + DOM 挿入）を N 件 → 初期 k 件に圧縮。k は behavior contract で確定 |
| **段階的 asset 解決**（staged asset resolve） | `resolveAssetReferences()` を初期 render で全件一括に走らせない。初期 render 対象の article のみ解決し、後段 article は「解決前の markdown 原文 + placeholder」のみ保持して入場タイミングで解決する | base64 inline 連結コスト（O(N × S)）を初期表示から外す。v1 本命の効きどころ |
| **placeholder / skeleton** | 未解決 / 未 render の article / 画像位置に最小限の視覚的手がかりを置く。画像存在を見失わせず、スクロール予測を可能にする | I-TIP5（画像存在を見失わせない）の担保。CSS のみで実現可能 |

### 3-2. 含めないもの

| 施策 | 除外理由 |
|------|---------|
| **`loading="lazy"`** | 実測棄却。data URI で悪化する。`docs/development/fi-03-spike-native-lazy-result.md` §3 |
| **`decoding="async"` 単独採用** | 実測棄却。改善ノイズレベル。本命の staged 処理が入った後で補助的に再評価する余地はあるが、v1 では採用しない |
| 画像圧縮 / 再エンコード | データ側に手を入れるのは本 scope 外 |
| Asset base64 → Blob URL 変換 | 文字列長削減には効く可能性があるが、一括 blob 化は前段コストが残るため本命にしない。staged 処理と組み合わせる案として v1.x 候補に残す |
| IntersectionObserver 単独使用 | それ単独では parse / base64 inline コストを減らせない。ただし staged render / staged asset resolve の **トリガ機構** として採用することは認める（実装手段の選択肢） |
| virtualization（ログ行の仮想スクロール） | DOM 構造を根本変更する大改修。staged render で十分な場合は不要 |
| Web Worker による off-thread 処理 | markdown parse / base64 decode を worker に逃がす案。設計変更が大きく v1.x 以降 |
| 画像の LQIP（低品質プレビュー → 高品質差替） | 実装コスト大。base64 の二重格納が必要 |
| scroll 位置復元の保証 | v1 では staged render の仕様で担保する。問題化した場合は audit で対応 |

## 4. 非対象

| 項目 | 除外理由 |
|------|---------|
| **画像圧縮** | 保存データを変える。PKC2 の「入力したデータはそのまま保存される」原則に反する |
| **画像変換**（形式変換、リサイズ） | 同上 |
| **サーバー最適化** | PKC2 は single-HTML / offline-first。サーバーは存在しない |
| **全 archetype 横断最適化** | TEXT / TODO / form 等は画像密度が低く、TEXTLOG 限定で十分 |
| **virtualization（仮想スクロール）大改修** | ログ行の DOM をリアルタイム生成/破棄する仕組み。anchor link / scroll 位置 / print / 既存テスト全てに影響する。v1 の minimal 改善としてはオーバーキル |
| **Blob URL 化（`URL.createObjectURL`）** | base64 → Blob 変換は効果大だが、lifetime 管理（`revokeObjectURL`）の複雑さ、re-render ごとの URL 再生成、print / export 時の data URL フォールバック必要性など影響範囲が大きい。v1.x 以降の候補（staged 処理と組み合わせ） |
| **Web Worker による off-thread 処理** | markdown parse や base64 decode を worker に逃がす。効果はあるが worker 導入は設計変更大。v1.x 以降 |
| **`<img>` 属性による後段 lazy**（`loading="lazy"` / `decoding="async"`） | spike 実測で効果なし / 悪化を確認済み。`docs/development/fi-03-spike-native-lazy-result.md` |

## 5. 不変条件

| # | 不変条件 | 破壊したら違反 |
|---|---------|---------------|
| **I-TIP1** | 画像消失禁止。staged render / staged asset resolve で defer した画像が最終的に表示されないことがあってはならない | viewport に入った / 該当 article が hydrate されたのに画像が load されない、または `src` が消えたら違反 |
| **I-TIP2** | 保存データ（`container.entries[n].body` / `container.assets`）を変更しない | body 文字列や base64 データへの書き込み・圧縮・変換を行ったら違反 |
| **I-TIP3** | attachment semantics 不変。`asset:key` 参照 → `data:` URI 解決の既存経路を壊さない | `resolveAssetReferences` の **最終出力** が変わったら違反（呼び出し**タイミング**の遅延は許容） |
| **I-TIP4** | light source / full export / selected-only export を壊さない | export された HTML で画像が欠落したら違反。export 経路は staged 化しない（全展開のまま） |
| **I-TIP5** | ユーザーが画像の存在を見失わない。staged / defer 中でも「ここに画像がある」ことが視覚的に分かること | placeholder 無しで空白のままスクロールが必要になったら違反 |
| **I-TIP6** | TEXTLOG 以外の archetype の表示に影響しない | TEXT / TODO / form 等の image 表示が変化したら違反 |
| **I-TIP7** | FI-08 v1 / FI-08.x の paste pipeline に触らない | paste 経路の変更は本 scope 外 |
| **I-TIP8** | 既存テスト全通過 | 1 件でも regression したら違反 |
| **I-TIP9** | staged 処理の最終状態は一括処理と同一。全 article が hydrate / 解決完了した時点で DOM は従来と同一構造を持つ | hydrate 完了後に DOM が異なる（article 順序、image 数、相対位置など）なら違反 |
| **I-TIP10** | print / export 時は staged 処理を bypass し、全画像を解決する | print した PDF で placeholder が残っていたら違反 |

## 6. 計測観点

minimum scope の段階で「何を測るか」を定義する。behavior contract で閾値を確定する。

### 6-1. 計測すべき指標

| 指標 | 測定方法 | 意味 |
|------|---------|------|
| **初期 render 時間** | `performance.now()` で `renderBody()` 開始〜初期 k 件 article の DOM 挿入完了 | エントリ選択から画面が操作可能になるまでの時間（v1 本命指標） |
| **First Contentful Paint までの時間** | 初期 article のテキスト（画像以外）が表示されるまでの時間 | 画像が遅くても「ログ行は即座に読める」ことの確認 |
| **Viewport 内画像の表示完了時間** | 初期 article の画像が decode 完了するまでの時間 | 「上に見えてる画像はすぐ出る」ことの確認 |
| **hydrate レイテンシ** | 後段 article が hydrate trigger（scroll / rAF / IO）から解決 + 描画完了するまでの時間 | staged 処理が「見えるより前に解決完了しているか」の確認 |
| **main thread long task 合計時間** | `PerformanceObserver({ type: 'longtask' })` | 初期表示時の main thread ブロック総時間（前段コスト削減の直接指標） |
| **edit→read 切替時間** | edit mode 完了 → read re-render の初期 k 件完了まで | 保存後に再び画像が見えるまでの時間 |
| **スクロール時の体感** | scroll event 中に jank（32ms 超の frame drop）があるかどうか | staged hydrate trigger が scroll を阻害しないかの確認 |
| **メモリ使用量** | `performance.memory`（Chrome のみ）または DevTools Memory tab | 初期表示時に DOM に保持している base64 量が減っているかの確認 |

### 6-2. 計測シナリオ

| シナリオ | 画像数 | 想定 base64 総量 |
|---------|-------|-----------------|
| 軽量（baseline） | 0 枚 | 0 KB |
| 中規模 | 10 枚 | ~3 MB |
| 重量級 | 50 枚 | ~15 MB |
| 混在 | 20 枚 + テキストログ 100 行 | ~6 MB + テキスト |

### 6-3. 計測の実施タイミング

1. **behavior contract 前（baseline）**: 現状の修正前指標を取得
2. **implementation 後**: 修正後指標を取得し baseline と比較
3. **audit**: regression がないことを確認

## 7. 例

### 7-1. 画像 10 枚の TEXTLOG（中規模）

```
TEXTLOG: 作業メモ
├─ 2026-04-19
│   ├─ 14:00 "設定画面のバグ確認" + screenshot ×1 (300KB)
│   ├─ 14:05 "再現手順" （テキストのみ）
│   ├─ 14:10 "エラー画面" + screenshot ×1 (350KB)
│   └─ 14:15 "修正後" + screenshot ×1 (280KB)
├─ 2026-04-18
│   ├─ ... + screenshot ×3
│   └─ ... + screenshot ×2
└─ 2026-04-17
    └─ ... + screenshot ×2
```

**修正前**: 全 10 枚の base64（~3 MB）を同期展開 → ~800ms〜1.5s フリーズ（推定）
**修正後（v1 target, rev.2）**: 初期 render は直近 day-section のみ → 前段で展開する画像は 1〜3 枚程度。残り article は placeholder で姿を見せ、scroll / rAF trigger で順次 hydrate。テキストは初期 article 分のみ即座、残りは hydrate とともに表示。

### 7-2. 画像 50 枚の TEXTLOG（重量級）

1 ヶ月分のスクリーンショットログ。50 枚 × 300 KB = ~15 MB。

**修正前**: 全 50 枚同期 → 5〜15s フリーズ（推定、ハード依存）
**修正後（v1 target, rev.2）**: 初期 render は直近 day-section ＋ 近傍のみ（~5〜10 枚程度）。残り 40 枚超の article は hydrate 待ち placeholder で表示。scroll に応じて段階的に前段解決 + 描画。初期フリーズは前段処理対象が小さいため大幅短縮。体感は「直近ログはすぐ出る。過去ログは placeholder → スクロールすると順に実体化」。

### 7-3. テキスト 100 行 + 画像 20 枚（混在）

テキスト主体で、時折スクリーンショットが混じるユースケース。

**修正前**: 100 行のログ行構築自体は高速だが、途中に混じる 20 枚の base64 展開で全体が遅延
**修正後（rev.2）**: 初期 article の範囲に含まれるテキスト行と画像は即時。範囲外は placeholder で配置されスクロール時に hydrate。「初期表示に入る範囲だけ前段展開する」ため、画像枚数が増えても初期レイテンシは article 数で決まる。

### 7-4. edit mode で複数画像を持つ TEXTLOG

50 枚画像の TEXTLOG を edit → save → read に戻す。

**修正前**: save 後の re-render で全 50 枚が再度同期展開 → 同じフリーズ
**修正後（rev.2）**: save 後の re-render でも staged render / staged asset resolve が有効。初期 article のみ前段展開し、残りは placeholder。edit → save → read 復帰のレイテンシは初期表示レイテンシと同等まで短縮。

## 8. 次段の接続

### 8-1. behavior contract で確定すべきこと

| 項目 | minimum scope での扱い | behavior contract で確定 |
|------|---------------------|------------------------|
| 初期 render の単位 | 「log article」（= `<article>` 単位 / day-section 単位）の方向性のみ | 具体的な単位（article ごと / day-section ごと / N 件ごと）を確定 |
| 初期 render 件数 k | 「先頭 / 近傍のみ」 | 具体的な k（例: 直近 day-section のみ / 2 day-section / top N article）を確定 |
| hydrate trigger | 候補: scroll / IntersectionObserver / rAF / requestIdleCallback | どれを採用するか、優先度順序を確定 |
| hydrate の粒度 | article 単位 | article 内画像を部分 hydrate するか、article 一括か確定 |
| placeholder の DOM / CSS | 「未 hydrate / 未解決の可視化」方向性 | `data-pkc-*` selector、DOM 構造、CSS を固定 |
| edit→read 再 render 時の挙動 | staged も含めて同じ方針 | scroll 位置維持 / 再 hydrate 順序を確定 |
| print / export 時の bypass 条件 | staged を bypass する | `@media print` / export 経路での具体的な強制解決手順を確定 |
| baseline 計測の閾値 | 計測すべき指標は定義済み | 「改善」の定量的基準（例: 50 枚で初期 render 500ms 以下）を設定 |

### 8-2. supervisor 判断事項（D-series, rev.2）

| ID | 判断内容 | 選択肢 |
|----|---------|-------|
| **D-TIP1** | 初期 render 範囲の基本単位 | log article / day-section / 固定件数 N |
| **D-TIP2** | 初期 render 件数 k の決定方法 | 固定値 / viewport 推定 / 設定可能値 |
| **D-TIP3** | hydrate trigger の優先採用 | IntersectionObserver / scroll event / rAF / requestIdleCallback |
| **D-TIP4** | placeholder の視覚スタイル | 灰色ボックス（固定高）/ aspect-ratio box / skeleton lines / 最小（`min-height` のみ） |
| **D-TIP5** | 後段 article の markdown 原文をメモリに保持する方式 | 全件保持（軽い）/ 遅延読み込み（重い） |
| **D-TIP6** | edit→read 切替時も staged にするか | する / 全展開に戻す |
| **D-TIP7** | baseline 計測の実施方法 | 手動 DevTools 計測 / Playwright 自動ベンチ / 体感のみ |

> **rev.1 の D-TIP1..D-TIP4 は廃止**（native lazy / async 採用前提だったため）。rev.2 では上記 D-TIP1..D-TIP7 に置換。

### 8-3. 推奨順（rev.2）

1. **D-TIP1 = log article 単位**。TEXTLOG の自然な分割境界は article であり、renderLogArticle の単位と一致する。day-section 単位は粒度が大きすぎて、1 日に大量画像がある場合に効かない
2. **D-TIP2 = 固定値（まず）**。viewport 推定は複雑さの割に behavior 安定性が下がる。behavior contract で `INITIAL_RENDER_ARTICLE_COUNT` のような定数を定義し、audit で調整する
3. **D-TIP3 = IntersectionObserver（まず）**。`loading="lazy"` と違って data URI に依存せず動作する、standard な viewport 判定手段。scroll event 直接 hook より効率的
4. **D-TIP4 = aspect-ratio box（もしくは min-height 固定）**。scroll 位置飛びを防ぎつつ spinner のような ノイズを出さない
5. **D-TIP5 = 全件保持**。body 文字列自体はメモリ上に既にある（`container.entries[n].body`）。遅延読み込みは過剰設計
6. **D-TIP6 = staged を維持**。edit→read 復帰時も user pain は同じなので staged の恩恵を受けるべき
7. **D-TIP7 = Playwright 自動ベンチ**。本 spike で Playwright + Chromium が動作することが確認済み。手動計測より再現性が高く、regression 検知にも使える

### 8-4. v1 で**やらない**ことの確認（rev.2 で再掲）

- `loading="lazy"` を付けない
- `decoding="async"` を付けない
- Blob URL 化しない
- Web Worker 化しない
- virtualization しない
- 画像を圧縮しない / 変換しない

---

## References

- Parent file issue: `docs/planning/file-issues/03_perf-textlog-image-lazy-rendering.md`
- **Spike result note（rev.2 の根拠）**: `docs/development/fi-03-spike-native-lazy-result.md`
- `src/adapter/ui/textlog-presenter.ts` — `renderBody` / `renderLogArticle`（staged render の対象）
- `src/features/markdown/asset-resolver.ts` — `resolveAssetReferences`（staged asset resolve の対象）
- `src/features/markdown/markdown-render.ts` — `renderMarkdown` / image rule
- `src/adapter/ui/renderer.ts` — 全体 render loop
