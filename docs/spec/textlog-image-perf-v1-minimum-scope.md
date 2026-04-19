# TEXTLOG 複数画像パフォーマンス v1 — Minimum Scope

Status: DRAFT 2026-04-19
Pipeline position: minimum scope
Parent: `docs/planning/file-issues/03_perf-textlog-image-lazy-rendering.md`

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

**実用上最も痛いのは「全画像の base64 が同期的に DOM に投入される」こと**。文字列構築も重いが、DOM 投入後の decode + layout が体感フリーズの主要因。

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
| **TEXTLOG read view**（`renderBody` → `renderLogArticle`） | **対象** | 全画像同期展開。主たる bottleneck |
| **TEXTLOG edit view**（`renderEditorBody`） | **対象（間接）** | edit 自体は軽いが、edit→read 切替で再 render が走る |
| **画像サムネイル / 埋め込み表示**（`<img src="data:...">` の描画） | **対象** | 画像 decode が同期的に走る。lazy 化の直接適用箇所 |
| **initial render（エントリ選択時）** | **対象** | 選択切替時に全ログ行 + 全画像を一括構築。最も重い瞬間 |
| **scroll 中の viewport 外画像** | **対象** | 現状 viewport 外でも decode が走る。lazy 化で defer する主対象 |
| TEXT 本文の asset 表示 | 非対象 | TEXTLOG ほどの多画像ケースがない |
| attachment presenter | 非対象 | 単一画像なので性能問題なし |
| export HTML / print | 非対象（v1 scope 外） | print 時の lazy 未解決は v1 で許容 |

## 3. v1 scope

### 3-1. 含めるもの

| 施策 | 内容 | 根拠 |
|------|------|------|
| **native lazy load（`loading="lazy"`）** | `<img>` に `loading="lazy"` 属性を付与。ブラウザが viewport 近傍の画像のみ decode する | 実装 1 箇所。markdown-it の image rule に属性追加。file:// でも動作（Chrome / Firefox / Safari 全対応） |
| **`decoding="async"`** | `<img>` に `decoding="async"` 属性を付与。decode を main thread からずらす | 同上。loading="lazy" と組み合わせで最大効果 |
| **初期 render 数制限（viewport 外ログ行の defer）** | `renderBody` で一定件数超のログ行の画像解決を後回しにする | 画像数ではなくログ行数で粗く制御。viewport 推定が不要で実装が単純 |
| **placeholder / loading state** | 画像の lazy load 完了前に表示する最小限の視覚的手がかり | CSS のみで実現可能（`<img>` 読み込み前 background に灰色ボックス）。JS 不要の手法を優先 |

### 3-2. 含めないもの

| 施策 | 除外理由 |
|------|---------|
| 画像圧縮 / 再エンコード | データ側に手を入れるのは本 scope 外 |
| Asset base64 → Blob URL 変換 | storage model の変更。影響範囲が広すぎる |
| 他 archetype の lazy 化 | TEXTLOG ほどの多画像ケースがない |
| virtualization（ログ行の仮想スクロール） | DOM 構造を根本変更する大改修 |
| IntersectionObserver による手動 lazy | native `loading="lazy"` で十分な場合は不要 |
| 画像の LQIP（低品質プレビュー → 高品質差替） | 実装コスト大。base64 の二重格納が必要 |
| scroll 位置復元の保証 | v1 では native lazy に委ねる。問題化した場合は audit で対応 |

## 4. 非対象

| 項目 | 除外理由 |
|------|---------|
| **画像圧縮** | 保存データを変える。PKC2 の「入力したデータはそのまま保存される」原則に反する |
| **画像変換**（形式変換、リサイズ） | 同上 |
| **サーバー最適化** | PKC2 は single-HTML / offline-first。サーバーは存在しない |
| **全 archetype 横断最適化** | TEXT / TODO / form 等は画像密度が低く、TEXTLOG 限定で十分 |
| **virtualization（仮想スクロール）大改修** | ログ行の DOM をリアルタイム生成/破棄する仕組み。anchor link / scroll 位置 / print / 既存テスト全てに影響する。v1 の minimal 改善としてはオーバーキル |
| **Blob URL 化（`URL.createObjectURL`）** | base64 → Blob 変換は効果大だが、lifetime 管理（`revokeObjectURL`）の複雑さ、re-render ごとの URL 再生成、print / export 時の data URL フォールバック必要性など影響範囲が大きい。v1.x 以降の候補 |
| **Web Worker による off-thread 処理** | markdown parse や base64 decode を worker に逃がす。効果はあるが worker 導入は設計変更大。v1.x 以降 |

## 5. 不変条件

| # | 不変条件 | 破壊したら違反 |
|---|---------|---------------|
| **I-TIP1** | 画像消失禁止。lazy load / defer した画像が最終的に表示されないことがあってはならない | viewport に入った画像が load されない、または `src` が消えたら違反 |
| **I-TIP2** | 保存データ（`container.entries[n].body` / `container.assets`）を変更しない | body 文字列や base64 データへの書き込み・圧縮・変換を行ったら違反 |
| **I-TIP3** | attachment semantics 不変。`asset:key` 参照 → `data:` URI 解決の既存経路を壊さない | `resolveAssetReferences` の出力が変わったら違反 |
| **I-TIP4** | light source / full export / selected-only export を壊さない | export された HTML で画像が欠落したら違反 |
| **I-TIP5** | ユーザーが画像の存在を見失わない。lazy / defer 中でも「ここに画像がある」ことが視覚的に分かること | placeholder 無しで空白のままスクロールが必要になったら違反 |
| **I-TIP6** | TEXTLOG 以外の archetype の表示に影響しない | TEXT / TODO / form 等の image 表示が変化したら違反（ただし `loading="lazy"` は全 `<img>` に適用されても副作用が無いため許容） |
| **I-TIP7** | FI-08 v1 / FI-08.x の paste pipeline に触らない | paste 経路の変更は本 scope 外 |
| **I-TIP8** | 既存テスト全通過 | 1 件でも regression したら違反 |

## 6. 計測観点

minimum scope の段階で「何を測るか」を定義する。behavior contract で閾値を確定する。

### 6-1. 計測すべき指標

| 指標 | 測定方法 | 意味 |
|------|---------|------|
| **初期 render 時間** | `performance.now()` で `renderBody()` 開始〜DOM appendChild 完了 | エントリ選択から画面が操作可能になるまでの時間 |
| **First Contentful Paint までの時間** | ログ行テキスト（画像以外）が表示されるまでの時間 | 画像が遅くても「ログ行は即座に読める」ことの確認 |
| **Viewport 内画像の表示完了時間** | 最初に見える画像が decode 完了するまでの時間 | 「上に見えてる画像はすぐ出る」ことの確認 |
| **edit→read 切替時間** | edit mode 完了 → read re-render 完了まで | 保存後に再び画像が見えるまでの時間 |
| **スクロール時の体感** | scroll event 中に jank（16ms 超の frame drop）があるかどうか | lazy load が viewport 外 decode を本当に遅延しているかの確認 |
| **メモリ使用量** | `performance.memory`（Chrome のみ）または DevTools Memory tab | base64 data URI の DOM 内保持量が lazy 前後で変わるか |

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
**修正後（v1 target）**: viewport 内の 2〜3 枚のみ即時 decode。残り 7〜8 枚は scroll in 時に lazy load。テキストは即座に表示。placeholder でサイズ確保。

### 7-2. 画像 50 枚の TEXTLOG（重量級）

1 ヶ月分のスクリーンショットログ。50 枚 × 300 KB = ~15 MB。

**修正前**: 全 50 枚同期 → 5〜15s フリーズ（推定、ハード依存）
**修正後（v1 target）**: viewport 内の 2〜3 枚のみ即時。残りは lazy。テキストログ行はログ行数に依存するが、画像 decode の遅延なしに表示。体感は「テキストが即座に出て、画像は順次表示」。

### 7-3. テキスト 100 行 + 画像 20 枚（混在）

テキスト主体で、時折スクリーンショットが混じるユースケース。

**修正前**: 100 行のログ行構築自体は高速だが、途中に混じる 20 枚の base64 展開で全体が遅延
**修正後**: テキスト行は即座に表示。画像行は viewport 内のもののみ即時、残りは lazy。「テキストを読み始めたらスクロールに応じて画像が出てくる」体験。

### 7-4. edit mode で複数画像を持つ TEXTLOG

50 枚画像の TEXTLOG を edit → save → read に戻す。

**修正前**: save 後の re-render で全 50 枚が再度同期展開 → 同じフリーズ
**修正後**: save 後の re-render でも lazy が有効。初期 render 数制限でログ行の画像解決を段階的に行う。体感は「テキストはすぐ出て、画像は順次表示」。

## 8. 次段の接続

### 8-1. behavior contract で確定すべきこと

| 項目 | minimum scope での扱い | behavior contract で確定 |
|------|---------------------|------------------------|
| `loading="lazy"` の適用範囲 | TEXTLOG の `<img>` 全てに適用する方針 | 他 archetype（TEXT 等）にも適用するか判断。I-TIP6 の許容範囲を確定 |
| 初期 render 数制限の閾値 | 「一定件数」は未確定 | 具体的な N 件（例: viewport + 前後 2 day-section）を確定 |
| placeholder の見た目 | 「灰色ボックス or spinner」の方向性のみ | 具体的な CSS / DOM 構造を固定。data-pkc-* selector を定義 |
| `decoding="async"` の副作用 | 副作用は理論上ない | 実測で scroll jank / layout shift が増えないことを確認 |
| print / export 時の lazy 解除 | v1 scope 外 | 問題が出た場合の対応策を明記（`@media print` で `loading` 属性上書き等） |
| baseline 計測の閾値 | 計測すべき指標は定義済み | 「改善」の定量的基準（例: 50 枚で初期 render 2s 以下）を設定 |

### 8-2. supervisor 判断事項（D-series）

| ID | 判断内容 | 選択肢 |
|----|---------|-------|
| **D-TIP1** | `loading="lazy"` を全 archetype の `<img>` に適用するか、TEXTLOG 限定か | 全体 / TEXTLOG 限定 |
| **D-TIP2** | 初期 render 数制限を入れるか、native lazy のみで十分か | 両方 / native lazy のみ |
| **D-TIP3** | placeholder の視覚スタイル | 灰色ボックス（寸法固定）/ aspect-ratio box / spinner / なし |
| **D-TIP4** | baseline 計測の実施方法 | 手動 DevTools 計測 / 自動ベンチマーク script / 体感のみ |

### 8-3. 推奨順

1. **D-TIP1 = 全体**。`loading="lazy"` + `decoding="async"` は副作用がほぼゼロで、全 `<img>` に付けて問題ない。markdown-it の image rule 1 箇所で完結する
2. **D-TIP2 = native lazy のみ（まず）**。初期 render 数制限は native lazy が不十分だった場合のフォールバック。計測結果を見てから判断するのが安全
3. **D-TIP3 = 灰色ボックス**。spinner は視覚的に煩い。CSS `background-color` + 固定 `min-height` が最も簡素
4. **D-TIP4 = 手動 DevTools 計測**。自動ベンチマークは infra 投資が大きい。behavior contract で閾値を定義し、手動計測を audit の一部として行う

---

## References

- Parent file issue: `docs/planning/file-issues/03_perf-textlog-image-lazy-rendering.md`
- `src/adapter/ui/textlog-presenter.ts` — `renderBody` / `renderLogArticle`
- `src/features/markdown/asset-resolver.ts` — `resolveAssetReferences`（base64 data URI inline 展開）
- `src/features/markdown/markdown-render.ts` — `renderMarkdown` / image rule
- `src/adapter/ui/renderer.ts` — 全体 render loop
