# Lazy asset working-set 計画(メモリ削減 #7)

> Status: **段階1(土台)着地済 / 中核は段階2以降**。前任が「メモリロード」を
> 指摘されつつ対応しきれなかった箇所(user, 2026-06-24)。本書は**地雷**(特に
> `save()` の diff-delete = データ損失)を明示し、安全な段階実装を定義する。

## 1. 問題(Playwright で実測、`tests/bench/memory-footprint.bench.ts`)

CDP `Performance.getMetrics`(forced GC 後)で JS heap を段階差分計測:

```
baseline (空):                       9.0MB
+200 entries(asset 無):             ~9MB
+47.7MB の distinct base64 assets:   55.8MB(Δ 46.8MB)
→ asset の RAM 常駐 ≈ 0.98 byte / base64 char(V8 は ASCII を 1バイト文字列で保持)
→ 400MB の asset 全常駐 ⇒ JS heap ≈ 約 393MB
```

**確定:1GB の主因は「起動時に全 asset(400MB級 base64)を `container.assets` へ常駐」**。
`reassembleAssets`(`idb-store.ts`)が `getAllByPrefix` で全件を一括展開し、観ていない
asset まで JS heap に居座る。ストレージ(IDB 上の 400MB)とは別の、**RAM 表現の問題**。

> 補足:base64 は V8 で約 1:1(2倍ではない)。data-uri の DOM 二重持ち・デコード後
> 画像 bitmap は別枠(後者は #867 の `loading=lazy decoding=async` が対象)。

## 2. 方針

**バイト(base64)だけ working-set 化(遅延ロード + 解放)。key / size / hash の
metadata は常駐。** 表示中の entry(+ transclusion 閉包)が参照する asset だけ RAM に
載せ、他は IDB に置いたまま。400MB 常駐 → 表示中の数 MB。

## 3. `container.assets` アクセス全点(2026-06-24 調査)と sync/async 区分

### sync 描画経路(描画前に working-set を **preload 必須**)
- `resolveAssetReferences`(`features/markdown/asset-resolver.ts`、`ctx.assets[key]`)
  ← detail/todo/textlog/folder presenter, transclusion, rendered-viewer, entry-window 経由
- `pickImageAssetForEntry`(`renderer.ts`、frontmatter thumbnail / attachment)
- presenter `renderBody(entry, container.assets, …)`(`renderer.ts`)
- `attachment-presenter.resolveImageDataUrl`
- `expandTransclusions` / `hydrateCardPlaceholders`
- `hydrateAppIconAssetOptions` / `asset-picker`(存在 filter)

### 地雷(全件前提が焼き付いている — **lazy 化前に手当て必須**)
- **`idb-store.save()` の diff-delete**(L122–136):IDB の既存 key から
  `container.assets` に無い key を**削除**。部分 assets で保存すると**他 asset を
  IDB から消す=データ損失**。→ **save を additive-only 化**(削除は明示 purge 経路へ)。
- `asset-dedupe.findDuplicateAssetKey`(貼付 hot path):全 assets を hash 走査。
  → 常駐 **hash 索引**(key→hash、bytes 不要)で代替、または degrade(重複検出漏れ=
  ストレージ無駄で、データ損失ではない)。
- `guardrails` / `storage-profile`(サイズ/件数):全 assets を sum。
  → 常駐 **size/count metadata**(`listAssetKeys` + size)で代替。
- `collectOrphanAssetKeys` / orphan GC:全 key 必要。→ IDB から `listAssetKeys` で取得。

### async 許容(必要時に全件ロードでよい)
- export(`exporter.compressAssets`)/ import(`decompressAssets` / merge-planner)/
  build-subset / zip・bundle export。いずれも user 起点の非同期経路。

## 4. 既存の土台(再利用できる primitive)

- `ContainerStore.loadAsset(cid, key)` / `listAssetKeys(cid)` / `saveAsset` / `deleteAsset`
  ── **per-asset CRUD は既にある**(`idb-store.ts`)。選択ロードの基盤は揃っている。
- `getEntryAssetDependencies(container, rootLid)`(本計画の段階1で追加、`features/asset/
  asset-scan.ts`)── 単一 entry + transclusion 閉包の asset key 集合。preload 対象算出。
- `collectReferencedAssetKeys` ── 全件参照(orphan / 整合に使用)。

## 5. 段階(各段で `tests/bench/memory-footprint.bench.ts` で効果検証)

- **段階1(着地済・behavior 不変・additive)**:`getEntryAssetDependencies` 追加
  + 共通 `addEntryOwnAssetRefs` 抽出 + 計測 bench。配線はまだしない=リスク 0。
- **段階2(中核・最重要・要厚テスト)**:`save()` を **additive-only** 化(diff-delete
  撤去、削除は purge 経路へ)。round-trip / idb-store / persistence テストで**データ
  損失が無いこと**を厳重に検証。これ単体では RAM 不変だが、lazy の**前提**。
- **段階3**:boot で全 asset を reassemble せず、`selectedLid` の working-set だけ
  preload。`SELECT_ENTRY`(と navigation)で `getEntryAssetDependencies` → `loadAsset`
  → working-set を `container.assets` に充填、不要分を LRU 解放。frontmatter thumbnail
  の参照(現 `extractAssetReferences` の gap)も対応。
- **段階4**:dedup の hash 索引 / guardrails の size metadata 常駐化。export/orphan の
  全件ロードを on-demand に。
- **段階5**:bench で 400MB workspace の JS heap が「全常駐 ≈400MB → 表示中数MB」に
  落ちることを確認。視覚 parity(画像が壊れない)を smoke で確認。

## 6. 不変条件 / 後方互換

- ストレージ(IDB)フォーマット・export/import 契約は不変。`Container.assets` の型
  (`Record<string,string>`)も維持(中身が「全件」から「working-set」に変わるだけ)。
- データ損失を一切出さない(段階2の save additive 化が要)。
- 画像が静かに壊れない(段階3の preload 完全性 + 視覚 parity test)。

## 参照
- 実測 bench:`tests/bench/memory-footprint.bench.ts`
- down-payment:#867(画像 `loading=lazy decoding=async`)
- 土台:`src/features/asset/asset-scan.ts`(`getEntryAssetDependencies`)
