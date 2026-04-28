# PR #189 — Filter-pipeline memoization

**Status**: implemented
**Date**: 2026-04-28
**Predecessors**: PR #176-#188

## 1. 動機

PR #182 sub-instrumentation で c-5000 search-keystroke の
`render:sidebar:filter-pipeline` が 100.6 ms / keystroke と判明。内訳:

- `searchHide` 経路の per-entry `getStructuralParent` 走査(O(N×R))
- `treeHide` 経路の bucket-folder 検出 + `collectDescendantLids`
  (O(N+R))
- `unreferencedAttachments` 経路の `collectUnreferencedAttachmentLids`
  (有効時のみ)

これらは全て **純粋関数 of `container.entries` + `container.relations`**。
state-only 変化(検索文字列 / archetype フィルタ)では container ref
は不変 → 結果も不変 → memo 化が直接効く。

## 2. 計測インパクト(`render:sidebar:filter-pipeline` p50)

| scale | PR #182 | PR #189 | Δ |
|---|---|---|---|
| c-100 | 0.1 ms | 0.0 ms | ~ |
| c-500 | 0.5 ms | 0.2 ms | −60 % |
| c-1000 | 5.5 ms | **1.0 ms** | **−82 %** |
| c-5000 | 100.6 ms | **4.4 ms** | **−95 %** |

filter-pipeline がほぼゼロ化。次のボトルネック(`sublocation-scan`、
c-5000 で 155 ms / keystroke)が支配的 → PR #190 候補。

## 3. 実装

### 新規 `src/adapter/ui/filter-cache.ts`

```ts
let cachedContainer: Container | null = null;
let cachedIndexes: FilterIndexes | null = null;

export function getFilterIndexes(container: Container): FilterIndexes {
  if (cachedContainer === container && cachedIndexes) return cachedIndexes;
  cachedIndexes = buildIndexes(container);
  cachedContainer = container;
  return cachedIndexes;
}
```

戻り値 `FilterIndexes`:
- `hiddenBucketLids: ReadonlySet<string>` — bucket folder + descendants
  (treeHide 用)
- `bucketChildLids: ReadonlySet<string>` — 構造的に bucket folder の
  直接の子(searchHide 用)
- `unreferencedAttachmentLids: ReadonlySet<string>` — 参照されていない
  attachment(クリーンアップ lens 用)

### bucketChildLids の build(O(N×R) → O(N+R))

旧実装は per-entry に `getStructuralParent` を呼んでいた。各呼び出しが
relations 全走査 → O(N×R)。新実装は relations を 1 度だけ走査し、
bucket folder が `from` の relation の `to` lid を集める → O(N+R)。

```ts
const bucketChildLids = new Set<string>();
const entryByLid = new Map(container.entries.map((e) => [e.lid, e]));
for (const rel of container.relations) {
  if (rel.kind !== 'structural') continue;
  const parent = entryByLid.get(rel.from);
  if (!parent || parent.archetype !== 'folder') continue;
  if (bucketTitles.has(parent.title)) bucketChildLids.add(rel.to);
}
```

### renderer.ts 改修

3 箇所の per-render 計算を `getFilterIndexes(state.container)` 呼び出し
に置換:

```ts
// searchHide
const { bucketChildLids } = getFilterIndexes(state.container);
filtered = filtered.filter((e) => !bucketChildLids.has(e.lid));

// treeHide
const { hiddenBucketLids } = getFilterIndexes(state.container);
filtered = filtered.filter((e) => !hiddenBucketLids.has(e.lid));

// unreferenced attachments lens
const { unreferencedAttachmentLids } = getFilterIndexes(state.container);
filtered = filtered.filter((e) => unreferencedAttachmentLids.has(e.lid));
```

container ref が同一なら 3 つとも cache hit、build は 1 度のみ。

## 4. キャッシュ無効化

container ref 変化のみが invalidation トリガー。immutable update の
慣習で container.entries / container.relations が変わると container 自体
の ref も変わるので、entries / relations 系の任意の変化は確実に新ビルド
を起こす。

container_id 切替や workspace reset でも container ref 変化により
自動的に invalidate される。明示的な reset は test-only export に提供:

```ts
export function __resetFilterIndexCacheForTest(): void { ... }
```

## 5. テスト

新規:
- `tests/adapter/filter-cache-pr189.test.ts`(7 件)
  - 同一 container ref でキャッシュヒット(Set ref 一致)
  - container ref 変化で invalidate
  - hiddenBucketLids 内訳(bucket + descendants、外部 entry 除外)
  - bucketChildLids 内訳(direct children のみ、bucket 自体除外)
  - unreferencedAttachmentLids が collect helper と整合
  - bucket 無し container での空 Set
  - TODOS bucket も認識

既存無修正で全通過(5946 / 5946 unit pass + 11 / 11 smoke pass)。

## 6. 後方互換性

- `getStructuralParent` / `collectDescendantLids` / `collectUnreferencedAttachmentLids`
  の API 不変
- renderer の表示挙動 完全一致(同じ Set を計算しているだけ)
- bundle.js +1.0 KB(filter-cache module + cache state)
- bundle.css 不変

## 7. PR #190 候補

c-5000 search-keystroke の残り内訳:
- `render:sidebar:flat-loop` p50 = 155.5 ms(うち sublocation-scan 155.4 ms)
- `render:sidebar` 全体 p50 = 300.8 ms(flat-loop + 残り 145 ms)
- region replacement + browser layout/paint = 137 ms

支配コストは **sublocation-scan の line-by-line 走査**。打ち手:
- prefix-incremental(前回 query が prefix のとき前回 hit を絞り込み)
- 全 entries の prebuilt search index(container ref keyed memo)
- worker offload(content-visibility は viewport DOM のみ layout なので
  flat-loop 自体は run しないと結果が出ない、という形で worker に逃げる)

## 8. Files touched

- 新規: `src/adapter/ui/filter-cache.ts`(~110 行)
- 修正: `src/adapter/ui/renderer.ts`(import 追加 + 3 箇所の per-render
  計算を cache 呼び出しに置換、~25 行 net)
- 新規: `tests/adapter/filter-cache-pr189.test.ts`(7 件)
- 新規: `docs/development/filter-cache-pr189-findings.md` (this doc)
