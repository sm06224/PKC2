# 差分保存ベンチマーク(#912 フォロー、2026-07-17)

`persistence.differential_save`(改善バッチ④、PR #912、既定 OFF)の実測フォロー。
**「既定 ON にすべきか」の判断材料**として、inline 形式(現行既定の `save()`)と
split 形式(差分保存の `saveDiff()`)の保存・load コストを規模別に測った。

## 方法

- `tests/bench/differential-save.bench.ts`(Playwright、実 Chromium の実 IndexedDB)
- `storage-backend.bench.ts` Part A と同じ方針:idb-adapter / idb-store と**同じ
  record 形状・同じ tx 構成**を primitive として直接測る(単一 readwrite tx、
  prefix scan は `IDBKeyRange.bound` の getAllKeys+getAll 並行、split marker
  `__pkc_split__` 込みの core record)
- 規模 {100, 1000, 5000} entries(body ~800 chars)+ revisions = entries/10
- 編集保存は 5 連続の median × 3 iteration の median(warmup 1)。大量書込み直後は
  LevelDB compaction が漏れ込むため 150ms settle を挟む(初回計測では 5000 規模の
  splitEditSave が 13.7ms に見えた — 汚染例として記録)
- 実行: `PKC_PRE_INSTALLED_CHROMIUM=... npx playwright test --config=tests/bench/playwright.config.ts differential-save`
- 結果 JSON: `bench-results/differential-save.json`

## 結果(median ms、2026-07-17 実測)

| entries | inline 編集保存 | **split 編集保存** | split 初回全件 | inline load | split load |
|---:|---:|---:|---:|---:|---:|
| 100 | 0.7 | **0.6** | 7.2 | 0.5 | 2.3 |
| 1000 | 3.3 | **0.8** | 74.3 | 1.7 | 15.6 |
| 5000 | 13.5 | **1.4** | 1183.5 | 7.7 | 81.1 |

## 読み方

- **編集保存(毎回発生、便益の本体)**: split は規模にほぼ依存せず ~1ms 前後。
  inline は O(n) で伸び、5000 entries で **13.5ms → 1.4ms(約 10 倍)**。
  1000 entries でも 4 倍。100 entries では両者とも <1ms で差は体感不能
- **split 初回全件書込み(ON 直後の 1 回だけ)**: 5000 entries で 1.2s。
  一度きりの migration コストで、以降は差分のみ
- **load(boot 毎)**: split は per-record scan + 再組立で inline より遅い
  (5000 entries で +73ms)。絶対値は boot 全体(数百 ms〜)の中では小さいが、
  差分保存の便益と boot コストのトレードオフはここにある

## 既定 ON 判断の材料

**perf 面は既定 ON を支持する**:

- 編集のたびに払う保存コストが規模非依存になる(大規模 container ほど効く)
- 代償は boot +数十 ms と ON 直後の一回きり 1.2s(5000 規模)のみ
- OFF へ戻す経路も安全(inline へ書き戻して split record を掃除する双方向設計)

**ブロッカーは perf ではなく旧ビルド互換**(flag 説明にも明記済み):

- split 形式で保存された storage を「差分保存を知らない旧ビルド」で開くと
  entries が空に見える(データは残っており新ビルドで復元可)
- 既定 ON にすると、ユーザーが旧ビルドの HTML を開き直しただけでこの状態に入る。
  invariant「Backward compatibility — never break existing data contracts」に触れる

**推奨**: perf 目的での即時既定 ON はまだしない。現行の opt-in を維持し、

1. 大規模 container(1000+ entries)のユーザーには flag ON を案内(マニュアル済)
2. 旧ビルド併用の実態が消える(= 配布済み旧 HTML からの storage 直開きが
   起きない)と user が判断した時点で既定 ON へ

の二段構えとする。最終判断は user。

## 関連

- PR #912(差分保存の実装、flag opt-in)
- `storage-backend-benchmark-2026-07.md`(#904、backend 別ベンチ)
- `src/adapter/platform/idb-store.ts`(`saveDiff` / split 形式の正本)
- `src/adapter/platform/persistence.ts`(flag 分岐と diffBase 管理)
