# TEXTLOG flag sweep — wave 1 vs wave 2 regression check

**Date**: 2026-05-04
**Question**: PR-γ wave 2(残 13 件 const → defineFlag 化)が hot path に regression を入れていないか?
**Bench**: `tests/bench/textlog-staged-render-flag-sweep.bench.ts`(216 measured iterations / 18 cells)
**Method**: 同一 host(Intel Xeon @ 2.10GHz / 4 cores / 15.7 GiB / linux 6.18.5 / chromium 141.0.7390.37)で 2 連走、median 差分を確認。

## なぜ本 bench が wave 2 の regression check に使えるか

Bench は textlog を click → 初回 hydrated article までの latency を測る。wave 2 で migrate した 13 flag のうち、本 bench は **`textlog.placeholder.min_height_px`** を placeholder 配置毎(1000 logs cell で 1000 回)に touch する。
従って:

- main(wave 1 完了) では `PLACEHOLDER_MIN_HEIGHT` 定数アクセス
- 本 branch(wave 2) では `placeholderMinHeightPx()` getter call(`Map.get` + range 検査)

の差が hot path 上に乗っているはず。代理として wave 2 全体の overhead を観測できる。

## 結果(median, ms)

| logs | N | wave 1 | wave 2 | Δ ms | Δ % |
|---:|---:|---:|---:|---:|---:|
| 50 | 1 | 92.6 | 80.7 | −11.9 | −12.9% |
| 50 | 4 | 76.7 | 82.3 | +5.6 | +7.3% |
| 50 | 8 | 85.9 | 82.4 | −3.5 | −4.1% |
| 50 | 16 | 78.9 | 81.4 | +2.5 | +3.2% |
| 50 | 32 | 87.8 | 81.5 | −6.3 | −7.2% |
| 50 | 64 | 92.2 | 79.9 | −12.3 | −13.3% |
| 200 | 1 | 119.5 | 123.2 | +3.7 | +3.1% |
| 200 | 4 | 124.2 | 116.2 | −8.0 | −6.4% |
| 200 | 8 | 117.4 | 117.3 | −0.1 | −0.1% |
| 200 | 16 | 119.4 | 124.1 | +4.7 | +3.9% |
| 200 | 32 | 127.7 | 131.0 | +3.3 | +2.6% |
| 200 | 64 | 124.3 | 123.9 | −0.4 | −0.3% |
| 1000 | 1 | 323.2 | 336.7 | +13.5 | +4.2% |
| 1000 | 4 | 320.6 | 310.4 | −10.2 | −3.2% |
| 1000 | 8 | 304.2 | 312.4 | +8.2 | +2.7% |
| 1000 | 16 | 312.6 | 316.0 | +3.4 | +1.1% |
| 1000 | 32 | 316.8 | 312.9 | −3.9 | −1.2% |
| 1000 | 64 | 318.2 | 330.0 | +11.8 | +3.7% |

## 判定: regression 検出されず

- **18 cell 中 9 cell が wave 2 で速い、9 cell が遅い** — 対称分布、systematic bias なし
- **最大変動 ±13% は IQR 幅内**(各 cell の p75 − p25 がしばしば 10〜30 ms ある)。単発 12-sample bench の解像度では検出不能
- **logCount=1000 cell の median 差は ±4% 以下**(最大の hot path にあたるが overhead 観測されず)
- **systematic な遅延が出ていれば、placeholder 配置回数に比例する「logCount が大きいほど Δ% が大きい」傾向**が出るはずだが見られない

→ `defineFlag` getter call(`Map.get` + range 検査、推定 数十 ns 以下)は、本 bench の解像度(ms 単位、12-sample median)より十分小さい。13 const → defineFlag 化は **観測可能な性能影響なし** で着地できた。

## 注

- 本 comparison は **同一 host での 2 連走**比較。CI runner / 別 device での絶対値は異なる(各 host で baseline 取り直しが必要)
- 本 bench は wave 2 の 13 flag のうち `textlog.placeholder.min_height_px` 1 件のみ覆う。残 12 flag の hot path 観測は別 bench(card excerpt / tag normalize / attachment guardrails)で別 PR にて(必要なら)
- `bench-results/textlog-staged-render-flag-sweep.md` は auto-generated で次の bench 実行で上書きされる。本 doc は固定された snapshot
