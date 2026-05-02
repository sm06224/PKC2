# FI-03 Spike — Native Lazy / Async Decoding 実測棄却ノート

Status: CLOSED 2026-04-19
Parent minimum scope: `docs/spec/textlog-image-perf-v1-minimum-scope.md`
Parent file issue: `docs/planning/file-issues/03_perf-textlog-image-lazy-rendering.md`

---

## 0. 位置づけ

FI-03 minimum scope（initial draft）は「`loading="lazy"` + `decoding="async"` を `<img>` に付与する」を v1 第一候補として挙げていた。behavior contract に進む前に、この前提が実際に効くかを実測で検証した結果、**`loading="lazy"` は data URI に対して明確に悪化**、`decoding="async"` は**ほぼ無効**であることが判明した。

本ノートはその実測結果と、結果に基づく設計方針の転換を記録する。**docs-only**。

> この文書の目的は「効きそう」で設計が進むのを止め、**次の設計が正しい根に刺さる**ようにすることである。

## 1. 実験条件

### 1-1. ツールと環境

- Playwright + headless Chromium（Chromium 本体で実測。happy-dom ではない）
- Node.js 経由でブラウザを起動し、各シナリオ 5 回実行して中央値を集計
- viewport: 1280 × 800
- ベンチマークスクリプト（一時成果物、測定後削除済み）: `scripts/bench-fi03-spike.mjs`

### 1-2. 画像ペイロード

- ~200 KB の **BMP data URI**（`data:image/bmp;base64,...`）
- 幅 × 高さを調整して実サイズが ~200 KB になるように生成
- gradient パターンで塗り（純色ではないため実際の decode 負荷が発生）

### 1-3. 計測ページ構造

```html
<!DOCTYPE html>
<html><body>
  <h1>...</h1>
  <img src="data:image/bmp;base64,..." alt="img-0" [attrs]>
  <img src="data:image/bmp;base64,..." alt="img-1" [attrs]>
  ... (N 枚)
  <div id="sentinel">END</div>
</body></html>
```

`[attrs]` に `loading="lazy"` / `decoding="async"` / 両方 / なし の 4 パターンを切替。

### 1-4. 検証シナリオ

| 軸 | 値 |
|----|-----|
| 画像数 | 0 / 10 / 50 枚 |
| 属性構成 | NONE / LAZY_ONLY / ASYNC_ONLY / BOTH |
| 繰り返し | 各 5 回、中央値採用 |
| 合計 | 3 × 4 × 5 = 60 run |

### 1-5. 計測指標

| 指標 | 測定方法 |
|------|---------|
| **renderTime** | `performance.now()` 開始 → 全 `<img>` の `.decode()` Promise resolve → `offsetHeight` 参照 → `rAF × 2` まで |
| **longTaskCount / longTaskTotalMs** | `PerformanceObserver({ type: 'longtask' })` で 50ms 超のタスクを収集 |
| **scrollMaxFrame / scrollAvgFrame** | 全域を段階的に `window.scrollTo()` しながら `requestAnimationFrame` 間隔を記録 |
| **jankFrames** | frame 間隔が 32ms（= 2 × 16.67ms）を超えた数 |

## 2. 計測結果

### 2-1. renderTime（中央値）

| 画像数 | NONE | LAZY_ONLY | ASYNC_ONLY | BOTH |
|-------|-----:|---------:|----------:|----:|
| 0 | 23.1ms | 19.1ms | 18.8ms | 18.4ms |
| 10 | 35.5ms | **73.0ms** | 36.3ms | **73.0ms** |
| 50 | 84.8ms | **178.9ms** | 86.4ms | **179.0ms** |

### 2-2. longTask 合計（中央値、件数）

| 画像数 | NONE | LAZY_ONLY | ASYNC_ONLY | BOTH |
|-------|-----|----------|-----------|------|
| 0 | 0ms (0) | 0ms (0) | 0ms (0) | 0ms (0) |
| 10 | 135ms (1) | 128ms (1) | 133ms (1) | 130ms (1) |
| 50 | 805ms (1) | 859ms (2) | 785ms (1) | 875ms (2) |

### 2-3. scroll（中央値）

全シナリオ・全構成で `scrollMax ≈ 16.8ms` / `scrollAvg ≈ 16.7ms` / `jankFrames = 0`。**有意差なし**。

### 2-4. ベースラインとの差分（50 枚シナリオ）

| 構成 | render 差 | longTask 差 |
|------|---------:|-----------:|
| LAZY_ONLY | **+94.1ms** | +54ms |
| ASYNC_ONLY | +1.6ms | -20ms |
| BOTH | **+94.2ms** | +70ms |

## 3. `loading="lazy"` 棄却理由

### 3-1. 実測で明確な悪化

- 10 枚: **+37.5ms（render time が 2.05 倍）**
- 50 枚: **+94.1ms（render time が 2.11 倍）**
- longTask 数: 1 → 2 に分裂し、**合計時間も増加**

ノイズレベルでも、`decoding="async"` 併用による相殺でもない。`loading="lazy"` 単独で既に悪化している。

### 3-2. 技術的原因

`loading="lazy"` は **network fetch 遅延**の仕組み（Intersection Observer 相当の viewport 判定 + 遅延ロードパス）である。

- data URI は**既にメモリ上にある**ため network 遅延による節約は発生しない
- それでもブラウザは各 `<img>` に対して lazy loading の判定ロジックを走らせる
- 結果として「節約はゼロ、オーバーヘッドだけが加算される」状態になる

つまり、**対象ドメインが network lazy であって、PKC2 の問題は viewport lazy でも network lazy でもない**。後段 lazy 化の枠組みを data URI に被せても効かないどころか害になる。

### 3-3. ユーザ仮説の実証

minimum scope 段階で supervisor より提示された仮説：

> `loading="lazy"` は network request を遅延する機構。data URI は既にメモリにある。→ lazy が効かない可能性がある。

**実測はこれを正確に追認し、さらに強める結果**となった（効かないだけでなく悪化）。

## 4. `decoding="async"` 非採用理由

### 4-1. 実測で改善が極小

- 10 枚: render +0.8ms（ノイズ）、longTask -2ms（ノイズ）
- 50 枚: render +1.6ms（ノイズ）、longTask -20ms（805ms の 2.5%）

「改善方向ではあるが閾値に満たない」のではなく、**実質的にノイズと区別できない**。

### 4-2. 単独採用の価値が小さい

- FI-03 の user pain は「50 枚で数秒〜十数秒フリーズ」であり、805ms → 785ms では user 体感は変わらない
- 単独で behavior contract を立てるには根拠が弱すぎる
- **コードが増える / テストが増える / 副作用の考慮が増える** に見合わない

### 4-3. 将来の補助としての扱い

将来、**本命の staged render / staged asset resolve が実装され、DOM に入った画像を非同期 decode する余地**が生まれた段階で、補助的に再評価する余地はある。v1 では本命から外す。

## 5. 次方針（設計の軸転換）

### 5-1. 今回の spike で得た確定的知見

> **ボトルネックは `<img>` 属性（後段 lazy）ではなく、前段パイプラインにある。**
>
> 1. `resolveAssetReferences()` が全画像の base64 を markdown 文字列に inline 連結
> 2. `renderMarkdown()` が巨大文字列を同期的に parse
> 3. `innerHTML` で DOM に一括挿入
>
> これが完了するまで main thread はブロックされ、その後に **initiate される** 画像 decode の遅延を `loading="lazy"` で調整しても、**既にユーザはフリーズを体感している**。

### 5-2. なぜ前段を減らす必要があるか

- **後段 lazy が data URI に効かない**（3-2 / 3-3）ことが実測で確定
- **前段コストは画像数 N と画像サイズ S に対して O(N × S)** で線形に積み上がる
- 50 枚 × 300KB = 15MB の文字列構築 + parse + DOM 挿入は、**後段で何をしようと前段で時間を食う**
- 従って、v1 が取るべき方向は「後段を最適化する」ではなく「前段を **遅延する** / **分割する** / **回避する**」である

### 5-3. v1 本命候補（minimum scope rev.2 で確定予定）

| 施策 | 狙い |
|------|------|
| **段階的レンダリング**（staged render） | 全 log article を一度に重い形で render しない。初期表示は先頭/近傍のみ。残りは後段で順次 append |
| **段階的 asset 解決**（staged asset resolve） | `resolveAssetReferences()` を全件一括で走らせない。可視範囲 / 近傍に入る article だけ解決 |
| **placeholder / skeleton** | 画像存在を見失わせない。「読み込み待ち」を視覚的に示す |

### 5-4. 候補として残すが本命にしないもの

| 施策 | 理由 |
|------|------|
| **Blob URL 化**（`URL.createObjectURL`） | 文字列長削減には効く可能性。ただし全画像 blob 化を一括で行うと前段コスト（変換 + URL 管理）が残るため、本命は段階的処理。v1.x 以降で staged render と組み合わせる選択肢として残す |
| **IntersectionObserver** | 単独では parse / base64 inline コストを減らせない。staged hydrate の **trigger** としては有効。v1 の staged render 実装手段の一つとして採用され得る |
| **Web Worker による off-thread 処理** | markdown parse を worker に逃がす案。設計変更が大きく v1.x 以降 |

### 5-5. 完全棄却するもの

| 施策 | 棄却理由 |
|------|---------|
| **`loading="lazy"`** | 本 spike で実測棄却（3 章） |
| **`decoding="async"` 単独採用** | 本 spike で実測棄却（4 章） |

## 6. 反映先

本 spike 結果を以下に反映する：

1. **`docs/spec/textlog-image-perf-v1-minimum-scope.md` rev.2**
   - v1 scope から native lazy / async decoding を削除
   - staged render / staged asset resolve / placeholder を新規採用
   - 「なぜ前段を減らす必要があるか」を明記
   - D-TIP 判断項目を再編

2. **behavior contract はまだ進めない**
   - 設計方針が大きく転換したため、minimum scope rev.2 確定後に再設計

## 7. 教訓（文書化）

- **「効きそう」で behavior contract に進まない。「効く」ことを実測で確認してから進む**
- **後段 optimization は前段 cost を救えない。順序が重要**
- **仕様は実測に従う。実測は設計を殺してよい**
- **value of a failed spike**: 本 spike は「何が効かないか」を確定し、次の設計が誤った方向に向かうのを防いだ。失敗ではなく設計前進である

---

## References

- Parent minimum scope: `docs/spec/textlog-image-perf-v1-minimum-scope.md`
- Parent file issue: `docs/planning/file-issues/03_perf-textlog-image-lazy-rendering.md`
- 実測対象コード: `src/features/markdown/markdown-render.ts`（image rule、実測後 revert 済み）
- ボトルネック該当コード:
  - `src/adapter/ui/textlog-presenter.ts` — `renderBody` / `renderLogArticle`
  - `src/features/markdown/asset-resolver.ts` — `resolveAssetReferences`
  - `src/features/markdown/markdown-render.ts` — `renderMarkdown`
