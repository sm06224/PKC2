# ZIP Export Contract

Status: COMPLETED (2026-04-12)
Created: 2026-04-12
Category: P0 regressions / export fidelity

## 1. Scope

PKC2 が書き出す全 ZIP artifact (`pkc2-package`, text-bundle,
textlog-bundle, folder-export, mixed-bundle, nested inner ZIP) の

- entry metadata (timestamp)
- compression method

の契約をまとめる。writer / parser の単一実装
(`src/adapter/platform/zip-package.ts`) に集約されているので、
ここに書いた契約は全 artifact に同時に効く。

## 2. Timestamp 契約

### 2-1. エンコーディング

- MS-DOS date/time format を使う (ZIP APPNOTE 4.4.6 準拠)
  - time = `(hour << 11) | (minute << 5) | (second / 2)` — **2 秒精度**
  - date = `((year - 1980) << 9) | (month << 5) | day`
- **local time** で書く（APPNOTE は UTC を要求しない、多くの ZIP ツールと
  整合）
- 有効範囲は `[1980-01-01 00:00:00, 2107-12-31 23:59:58]`
  - 範囲外は最近境界に clamp される（`1970` → `1980`, `2200` → `2107`）
- local header / central directory の両方に同じ値を書く

### 2-2. 値の決定

各 `ZipEntry` は optional な `mtime: Date` を持つ。

- **`mtime` が指定されている**: その値を DOS timestamp に変換して書く
- **`mtime` が未指定**: `createZipBytes` 呼び出し時点の現在時刻を一度だけ
  キャプチャして全 defaulting entry に適用する
  - → 同一 archive 内の default entry は全て同じ timestamp
  - → 1980-01-01 の sentinel は**出さない**（P0-2 で修正した regression）

### 2-3. 呼び出し側の推奨

| artifact | entry mtime に使う値 |
|---|---|
| pkc2-package | `manifest.exported_at` （一括） |
| text-bundle / textlog-bundle | entry の `updated_at`（未設定なら default） |
| folder-export | entry の `updated_at`（未設定なら default） |
| その他 | 指定しなくて良い（default = 現在時刻） |

現時点で mtime を明示しているのは `exportContainerAsZip` /
`buildPackageZip` のみ。他の bundle 出力は default（現在時刻）に依存しており、
「1980 年」regression は既に解消されている。明示化が必要になったら
entry timestamp を渡す。

### 2-4. 丸め

- 秒は 2 秒切り捨て（DOS 仕様）。`2026-04-12 14:37:21` は
  `2026-04-12 14:37:20` として書かれる。
- テストは `toBeGreaterThanOrEqual(before - 2000)` のように 2 秒の余裕を
  取って比較する。

### 2-5. 後方互換

- `mtime` 未設定の既存 callee は挙動が「1980-01-01 → 現在時刻」に変わる。
  これは改善であって破壊ではない（timestamp の値を契約としている consumer
  は PKC2 内部にはいない）。
- 既存の PKC2 artifact（1980-01-01 stamp）を import する場合は
  `fromDosDateTime(0, 0)` が 1980-01-01 00:00:00 を返すため、parser は
  素直に受理する。

## 3. Compression 契約

### 3-1. 明示的な決定

**全 entry で ZIP method 0 (stored / 無圧縮) を使う。意図的。**

理由:

- 単一 HTML artifact 内部に deflate 実装を持ち込みたくない
  - 外部 npm への依存を増やすか、自前で inflate/deflate を実装するかに
    なる。どちらも `zip-package.ts` の現在のサイズ（`createZipBytes` +
    `parseZip` 合計で ~200 行）から大幅に膨らむ。
- container.json / manifest.json は相対的に小さい
- **主な容量は asset binary**（画像、PDF、既に圧縮されたアーカイブ）。
  これらは deflate で再圧縮してもほぼ縮まない（むしろオーバーヘッドで
  微増することもある）。
- 既に gzip 圧縮 path は `compression.ts` で **Portable HTML artifact** に
  対して適用済み。ZIP artifact は「生データを取り出すための interchange
  format」であって「最小ファイルサイズを競う format」ではない。

### 3-2. 現状確認のガード

`tests/adapter/zip-package.test.ts` に以下を追加してある:

- 全 local file header の method フィールドが 0 であることをスキャンで確認
- 「ZIP が圧縮されていない」のは **store の結果** であって「deflate が
  失敗している」結果ではないことを契約として固定

### 3-3. 将来 deflate にする条件

以下が全て成り立った時のみ再検討:

- container JSON が意味のあるサイズ (≥数 MB) に成長する shape
- `CompressionStream('deflate-raw')` が PKC2 の support matrix で安定
- deflate を入れる対価（writer が async になる、parser が 2 method 対応
  する）が払える設計変更とセットになる

これらが揃わないうちは **store のまま** にする。

## 4. Out of scope

- archive layout の再設計（`manifest.json` / `container.json` /
  `assets/*.bin` を変えない）
- `PackageManifest` の version bump（timestamp 修正は互換）
- bundle format（text-bundle, textlog-bundle, folder-export,
  mixed-bundle）の semantics 変更
- TEXTLOG viewer / linkability redesign（→ P1）

## 5. 関連ファイル

- `src/adapter/platform/zip-package.ts` — writer / parser / DOS helpers
- `tests/adapter/zip-package.test.ts` — round-trip + compression audit
- `src/adapter/platform/compression.ts` — gzip helpers（Portable HTML
  artifact 用、本 doc とは別 path）
