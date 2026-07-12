# Storage backend benchmark — OPFS / FSA / IDB(2026-07)

> user 要望(2026-07-12、#904):「OPFS、FSA、IDB それぞれのモードをテストして
> 大量のエントリに対してベンチマークをして欲しい。そしてユースケースを分けて欲しい。」

計測 spec: `tests/bench/storage-backend.bench.ts`
実行: `PKC_PRE_INSTALLED_CHROMIUM=... npx playwright test --config=tests/bench/playwright.config.ts storage-backend`
生データ: `bench-results/storage-backend.json`(実行時生成)

## 0. 前提 — 3 backend の実装構造

| backend | 実装 | 保存単位 | encode |
|---|---|---|---|
| **IDB** | `idb-adapter.ts` | object store record | **structured clone**(JSON 文字列化なし) |
| **OPFS** | `opfs-adapter.ts` → **`fs-directory-adapter.ts`(共有)** | per-record の file | **JSON 文字列** + `createWritable` |
| **FSA** | `fsa-adapter.ts` → **同上(共有)** | 同上 | 同上 |

重要:**OPFS と FSA は adapter 実装を完全共有**しており、違いは root handle の
出所(OPFS = `navigator.storage.getDirectory()`、FSA = user が選んだ実フォルダ)
のみ。したがってコード経路の性能は同一で、実 FSA の絶対値は**対象ディスク・
ファイルシステム・ウイルススキャナ等に依存**する。本ベンチの FSA 行は OPFS root
上の DirectoryHandle で代替した **コード経路 parity の確認値**(headless では
`showDirectoryPicker` の user gesture が成立しないため)。

## 1. 実測結果(2026-07-12、Chromium 1194 / Claude Code リモート環境)

### 1a. Primitive — container 保存/読込(adapter と同 encode、median of 3)

| backend | entries | put (ms) | get (ms) | 1 entry 編集→再保存 (ms) |
|---|---:|---:|---:|---:|
| IDB | 100 | 1.1 | 2.9 | 0.8 |
| IDB | 1000 | 3.3 | 2.1 | 3.6 |
| IDB | **5000** | **16.4** | **13.1** | **17.3** |
| OPFS | 100 | 3.2 | 2.2 | 3.6 |
| OPFS | 1000 | 11.8 | 6.9 | 11.2 |
| OPFS | **5000** | **59.3** | **27.9** | **61.6** |
| FSA* | 1000 | 13.6 | 7.8 | 13.5 |

*FSA = OPFS handle 代替(§0)。opfs 行と ≈ 一致 → 共有実装の parity を確認。

### 1b. Primitive — assets 100 × 100KB(per-key、median)

| backend | bulk put ×100 (ms) | bulk get ×100 (ms) |
|---|---:|---:|
| IDB | **71.9** | **62.0** |
| OPFS | 374.6 | 233.1 |
| FSA* | 380.5 | 210.1 |

### 1c. アプリ実測 — c-5000 の boot(実 adapter 経路、3 runs)

| backend | boot (ms) |
|---|---|
| IDB | 558 / 974 / 580 |
| OPFS | 570 / 586 / 553 |

## 2. 読み取り

1. **container 級の書込は IDB が 2〜4 倍速い**(5000 entries: 16ms vs 59ms)。
   structured clone がシリアライズを V8 内部で済ませるのに対し、OPFS/FSA は
   JSON.stringify(~4.5MB 文字列化)+ file open/write/close の固定費を払う。
2. **小さい record の多数書込(assets)は差が最大**(×100 で 72ms vs 375ms、約 5 倍)。
   per-file の `getFileHandle + createWritable + close` 固定費が支配的。
   asset-heavy なコンテナでは IDB が明確に有利。
3. **一方、体感(boot)では差が出ない**。c-5000 でも boot ~0.6s で backend 差は
   誤差レベル — boot の大半は bundle parse + render で、storage read(1 file /
   1 record)は数十 ms に過ぎない。**モード選択は速度ではなく運用要件で決めてよい**。
4. 編集ごとの再保存(60ms @5000 OPFS)も UI をブロックしない水準
   (保存は非同期)。5000 entries を超えて线性に伸びる点だけ留意。

## 3. ユースケース別の使い分け指針

| ユースケース | 推奨 | 理由 |
|---|---|---|
| ブラウザ常用・とにかく手離れ良く(既定) | **IDB** | 全操作で最速。設定不要の既定。quota はブラウザ管理 |
| **asset(画像/添付)が多い**ワークスペース | **IDB** | 小 record 多数書込が ~5 倍速い(§1b) |
| 大容量・エビクション耐性・ブラウザプロファイルと分離したい | **OPFS** | origin 専用の私有 FS。IDB より eviction 事情が単純で、巨大 container でも file 単位。速度差は体感に出ない(§1c) |
| **実フォルダに置きたい**:他ツールと共有 / Dropbox 等で同期 / ファイルとしてバックアップ | **FSA** | 実ファイルとして見える唯一のモード。速度は対象ディスク依存(コード経路は OPFS と同一)。permission 再確認の UX コストあり |
| 一時検証・テスト | memory | 永続化なし(test 用 adapter) |

**総括**:速度だけなら IDB。OPFS/FSA は「データの置き場所・可搬性・寿命の管理」
という運用要件を買うための選択で、その対価(container 級で 2〜4 倍、asset で
~5 倍の書込コスト)は絶対値としては数十〜数百 ms に収まり体感を損ねない。
**asset-heavy だけは IDB を推奨**。

## 4. 再計測の仕方 / 拡張余地

- 再計測: §冒頭のコマンド。数値はマシン・環境依存なので、比較は同一実行内の相対で読む。
- 拡張余地(必要が立てば):c-10000 超のスケーリング / 実 FSA(headed で実フォルダ)/
  OPFS `createSyncAccessHandle`(worker 前提の高速化、adapter 側の将来最適化)/
  差分保存(現行は container 丸ごと 1 record が保存単位)。
