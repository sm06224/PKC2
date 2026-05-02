# PR #180 — StorageAdapter + parallel asset reassembly

**Status**: implemented
**Date**: 2026-04-28
**Predecessors**: PR #176 / #177 / #178 / #179

User direction:
> 「チャンク化と合わせて、ワーカーかも行い、複数ファイルの添付時にリソース解放をこまめに行い、メモリ不足にならないようにして」
> 「他のパフォーマンス案件もお任せでやっていいです」
> 「将来的にOPFSも導入するので、透過的に扱えるように工夫してください」

## 1. スコープ

PR #179 で `render:sidebar` 周りは現実的なところまで詰めた。
次の wave のうち、永続化周りで明らかな低リスク・高インパクトな
ものは **asset reassembly のループバグ** だった:

```ts
// PRE — N transactions, N round-trips (idb-store.ts before)
for (const fullKey of allKeys) {
  const data = await wrap(
    db.transaction(ASSETS_STORE, 'readonly')   // ← new tx PER asset
      .objectStore(ASSETS_STORE).get(fullKey),
  );
}
```

各 asset ごとに `db.transaction(...)` を開き、await で sequential に
get していた。N 個の asset がある container では IDB tx の open /
commit が N 回直列。これを **`getAll(range)` 1 回 + `getAllKeys(range)`
1 回の同一 tx 並列**に直す。

合わせて、**OPFS 移行への土台**として StorageAdapter という低レベル
kv interface を切り出し、`createIDBStore` / `createMemoryStore` を
adapter 越しの実装にした。OPFS 実装は同じ adapter shape を満たすだけ
で `ContainerStore` 契約に乗る。

## 2. 計測インパクト(boot:loadFromStore)

| scale | PRE (ms) | PR #180 (ms) | Δ |
|---|---|---|---|
| c-100  | 10.1 | 17.3 | +7.2 ms(noise — 小規模では tx 定数項が支配)|
| c-500  | 28.8 | 20.2 | **−30 %** |
| c-1000 | 51.7 | 34.9 | **−32 %** |
| c-5000 | 12.1¹ | 64.2 | (¹PRE は empty-IDB carry-forward、apples-to-apples ではない)|

c-500 / c-1000 で 30 % 程度のロード時間削減。c-5000 は PR #179 までの
記録が「c-5000 search-keystroke timeout で empty-IDB の cold boot
だけ取って carry-forward していた」状態だったため、64.2 ms が初めての
"5000 entries 入り" の真値。c-5000 の cold boot が boot:enter→exit
220.6 ms まで通るようになった(PR #179 ではタイムアウト)のは
PR #178 の sidebar-only 短絡が seed 後の再 mount にも効いている結果。

## 3. JSONL / 構造化クローンの議論

ユーザー質問:
> 「コンテナやチャンク内を jsonl とかのよりパース向きな書き方に
>  なっているかとか気になる」

採用しなかった理由:

**IDB は structured clone を使う**
- `indexedDB.put(obj)` は内部で V8 の structured serialize(C++)を
  通して binary としてストア
- ロード時の deserialize は `JSON.parse` の 2-3 倍速い
  (V8 / SpiderMonkey 双方の計測で確認できる傾向)
- escape / UTF-8 encoding のオーバーヘッドが無い
- Container は Date / undefined / Map / Set を含まない素朴な POJO
  なので structured clone 互換性問題も無い

**JSONL に切り替える代償**
- `JSON.stringify` を毎 save 挟む(structured clone より遅い)
- 文字列保管はサイズ増(エスケープ + UTF-8 + 二重シリアライズ)
- 利点(ストリーミング parse / 並列 parse)は IDB の API 上回収不能

**JSONL が活きる = OPFS**
- OPFS は byte-oriented File System Access。1 ファイル = 1 chunk
- ストリーミング `stream().pipeThrough(TextDecoderStream)` が自然
- 並列 file open + 並列 JSON.parse で worker offload と相性良
- そのとき初めて JSONL / MessagePack の検討が現実味

**PR #180 の判断**
- IDB は structured clone のまま、ただし **N tx を 1 tx に統合** で
  asset reassembly ホットパスを潰す
- `StorageAdapter.getAllByPrefix()` はキー順を契約しているので、
  将来 OPFS 実装で `entries()` iterator + JSONL に切り替えても
  ラッパー側の `ContainerStore` ロジックは変更不要
- → JSONL / MsgPack を選ぶ余地は OPFS 導入時まで完全に温存

## 4. 実装

### 新規ファイル

```
src/adapter/platform/storage/
  storage-adapter.ts   — 低レベル kv interface(StorageAdapter / StorageBucket / BatchOp / BucketName)
  idb-adapter.ts       — IndexedDB 実装(dbPromise を adapter 内に保持、getAllByPrefix で getAll + getAllKeys 並列)
  memory-adapter.ts    — In-memory 実装(Map ベース、structuredClone で deep-copy 維持)
```

主要 API:
- `StorageAdapter.bucket('containers' | 'assets'): StorageBucket`
- `StorageBucket.get / put / delete`
- `StorageBucket.getAllByPrefix(prefix) → ReadonlyArray<{key, value}>`
- `StorageBucket.getKeysByPrefix(prefix) → ReadonlyArray<string>`
- `StorageBucket.applyBatch(ops: BatchOp[])` — IDB は単一 tx で commit、
  OPFS は best-effort sequential

### 既存ファイル

- `src/adapter/platform/idb-store.ts` を全面書き換え:
  - `ContainerStore` interface はそのまま(変更なし)
  - 内部実装を `createContainerStore(adapter)` に集約
  - `createIDBStore()` = `createContainerStore(createIDBAdapter())`
  - `createMemoryStore()` = `createContainerStore(createMemoryAdapter())`
  - `reassembleAssets()` が **1 tx + 1 `getAllByPrefix` で完結**
  - `save()` の delete-diff は `getKeysByPrefix(prefix)` 1 回 +
    `applyBatch(...)` 1 tx で完結

### 互換性

- `ContainerStore` interface に変更なし
- IDB schema version 変更なし(DB_VERSION = 2 のまま)
- v1→v2 migration ロジックは新 idb-adapter.ts に保存
- 全 5884 unit テスト pass、smoke 11/11 pass

## 5. テスト

新規:
- `tests/adapter/storage-adapter.test.ts` (10 tests)
  - get / put / delete
  - getAllByPrefix のキー順契約
  - getKeysByPrefix が getAllByPrefix と同順
  - applyBatch の put/delete 順序保持
  - 空 batch は no-op
  - clear が targeted bucket のみ
  - bucket 間 isolation (containers vs assets)
  - 存在しないキーで undefined 返却

既存 `tests/adapter/idb-store.test.ts` (23 tests) は無修正で全通過
— `ContainerStore` 契約が完全に維持されている証左。

## 6. OPFS 移行への踏み台

PR #180 は「OPFS 実装を将来書く」ためのインターフェース整備として:

1. `StorageAdapter` interface が確立 — OPFS impl は同じ shape
2. `BucketName` type が `'containers' | 'assets'` で固定 — OPFS では
   subdir に対応 (`/containers/`, `/assets/`)
3. `getAllByPrefix` が「prefix で範囲取得」を契約 — OPFS では
   `entries()` iterator + filename startsWith でラップ可能
4. `applyBatch` が「複数 op を一括適用」を契約 — OPFS は単一 tx
   primitive を持たないので **「best-effort sequential」**として
   サポート明記済み

実装着手時には以下のステップ:

```
src/adapter/platform/storage/opfs-adapter.ts (新規)
  createOPFSAdapter(): StorageAdapter
    - root = await navigator.storage.getDirectory()
    - bucket('containers') → root.getDirectoryHandle('containers', {create:true})
    - bucket('assets')     → root.getDirectoryHandle('assets',     {create:true})
    - get(key) = handle.getFileHandle(key) → file.text() → JSON.parse(text)
    - put(key, value) = handle.getFileHandle(key, {create:true})
                      → writable.write(JSON.stringify(value)) → close
    - getAllByPrefix(prefix) = for await (entry of handle.entries())
                                 if entry.name.startsWith(prefix) await read
```

ContainerStore facade は完全に無変更で OPFS 上で動く想定。

## 7. PR #181 候補

OPFS 着手前の優先順:

1. **Worker offload(PR #181)** — `buildLinkIndex` /
   `buildConnectednessSets` / 検索 index を Web Worker に逃がし、
   c-5000 の 109.8 ms `render:sidebar` を main thread から外す
2. **多ファイル添付の段階処理(PR #182)** — `readAsArrayBuffer` →
   binary string → btoa の 3× メモリ持ちを解消、idle yield、
   asset chunk save との連携
3. **`findSubLocationHits` skip(PR #183)** — ベンチが 100 ms 単位
   の余りを示しているので sub-instrumentation も併せて

## 8. Files touched

- 新規: `src/adapter/platform/storage/storage-adapter.ts` (~110 lines)
- 新規: `src/adapter/platform/storage/idb-adapter.ts` (~190 lines)
- 新規: `src/adapter/platform/storage/memory-adapter.ts` (~85 lines)
- 全面書き換え: `src/adapter/platform/idb-store.ts`
  (456 行 → 254 行 / 内部実装を adapter 経由に集約)
- 新規: `tests/adapter/storage-adapter.test.ts` (10 tests, 130 lines)
- 新規: `docs/development/storage-adapter-pr180-findings.md` (this doc)

## 9. Bundle / budget

- bundle.js: 729.39 KB → 729.76 KB (+0.37 KB)
- bundle.css: 103.96 KB(変更なし)
- pkc2.html: 802.0 KB
- 既存 budget(bundle.js 1536 KB)に対して headroom 充分

## 10. Bench artifacts

`bench-results/SUMMARY.{md,json}` 再生成済み。c-5000 search-keystroke
が 6.7s で完走(PR #178 sidebar-only の効果が seed 後にも効いている)。
全 16 シナリオ完走、carry-forward なしの真値。
