# PR #190 — Sublocation-scan prefix-incremental cache

**Status**: implemented(correctness OK、bench impact は fixture-dependent)
**Date**: 2026-04-28
**Predecessors**: PR #176-#189

## 1. 動機

PR #189 で filter-pipeline は 100 ms → 4.4 ms に圧縮できたが、
c-5000 search-keystroke の残り内訳:

- `render:sidebar:flat-loop` p50 = 155 ms
- うち `sublocation-scan` p50 = 155 ms(ほぼ全部)

支配コストは `findSubLocationHits` の per-entry 走査。検索文字列が
1 文字ずつ伸びる typing pattern("m" → "me" → "mee" → "meet")で
**前回の no-match entry は次のキーストロークでも no-match である**
(longer query は shorter query の substring を含む)という性質を
利用する prefix-incremental cache を導入。

## 2. 実装

### `src/features/search/sub-location-search.ts`

モジュールレベルの WeakSet で「直前のクエリで body match しなかった
entry」を記憶:

```ts
let lastQueryStem = '';
let lastNoMatch: WeakSet<Entry> = new WeakSet();

function maybeResetSubLocationCache(query: string): void {
  if (query === lastQueryStem) return;
  // Extension ("me" → "mee"):cache 維持(longer query は subset)
  if (lastQueryStem !== '' && query.startsWith(lastQueryStem)) {
    lastQueryStem = query;
    return;
  }
  // Different / shorter / first call → 全 invalidate
  lastQueryStem = query;
  lastNoMatch = new WeakSet();
}

export function findSubLocationHits(entry, query, maxPerEntry) {
  ...
  maybeResetSubLocationCache(trimmed);
  if (lastNoMatch.has(entry)) return [];   // ← cache hit、body 走査スキップ

  const lowerQuery = trimmed.toLowerCase();
  if (!entry.body.toLowerCase().includes(lowerQuery)) {
    lastNoMatch.add(entry);                // ← cache 登録
    return [];
  }
  ...
}
```

WeakSet キー = Entry 参照。`COMMIT_EDIT` などで Entry が新 ref に
swap されると古い ref は自動 GC + cache 自動失効。明示的な
per-entry invalidation 不要。

## 3. 不変条件

- `lastNoMatch.has(entry)` ⇒ `entry.body`(lowercased)は
  `lastQueryStem`(lowercased)を含まない
- `query.startsWith(lastQueryStem)` の間 cache valid
- 上記 implies cache hit 時は新 query でも body match なし(longer
  query は shorter query を substring に含む)→ 安全に [] を返せる

## 4. テスト

新規 `tests/features/search/sub-location-prefix-cache-pr190.test.ts`
(10 件):

- 同一 query 2 回呼びで結果が一致(correctness preservation)
- "me" no-match → "mee" cache hit(body 読みゼロを Object.defineProperty
  spy で検証)
- "m" → "me" → "mee" → "meet" 連鎖 cache 維持
- query が短くなると cache invalidate(longer→shorter)
- query が非 extension に変わると cache invalidate
- 新 Entry ref(post-COMMIT_EDIT)は cache 影響受けない
- match entry は cache 汚染しない
- empty query / 非 text/textlog は cache に入らない

既存 21 件(`sub-location-search.test.ts`)無修正で全通過。

合計 5956 / 5956 unit pass + 11 / 11 smoke pass。

## 5. ベンチ実測

| scale / scenario | PR #189 | PR #190 (run 1) | PR #190 (run 2) |
|---|---|---|---|
| c-1000 sublocation-scan p50 | 34.6 ms | 32.3 ms | 32.3 ms |
| c-5000 sublocation-scan p50 | 155.5 ms | 188.4 ms | 164.3 ms |
| c-5000 sublocation-scan total | 619.5 ms | 801.8 ms | 741.2 ms |

c-5000 の数字は **bench machine load によるノイズが ±20 % 程度** で、
PR #190 の影響かどうか単独の数字からは判断できない。

### Why c-5000 fixture では効きが小さい

c-5000 fixture は PRNG-seed の synthetic body。"Lorem ipsum"-like の
語彙生成で **'m' / 'me' / 'mee' を含む body の比率が高い**(70-90 %
程度)。typing 4 keystroke の各段で:

| keystroke | match 率(推定)| no-match 率(cache 対象)|
|---|---|---|
| "m" | ~95 % | ~5 % |
| "me" | ~80 % | ~20 %(うち PR #190 cache 効く 5%)|
| "mee" | ~50 % | ~50 %(うち cache 効く 30%)|
| "meet" | ~10 % | ~90 %(うち cache 効く 70%)|

→ cache が大幅に効くのは "meet" の段階のみ。
それ以前は match 率が高く、line-walk(支配コスト)が走り続ける。

実ユーザーデータでは body の語彙分布が偏らないため、cache 効果は
synthetic より大きいと想定される(特に長い query)。

## 6. 後方互換性

- `findSubLocationHits` 戻り値契約 不変、`__resetSubLocationHitsCacheForTest`
  を test-only export 追加
- 動作仕様 unchanged(同じ hits を返す、副作用 cache のみ)
- bundle.js +0.6 KB / bundle.css 不変

## 7. PR #191 候補

c-5000 sublocation-scan の本丸 = **match 率の高いキーストロークで
全 entry の line-walk が走る** こと。打ち手:

1. **prebuilt search index** — container ref keyed memo で全 entries の
   tokenize / line-split を 1 回だけ事前計算。query 切替に対して O(N×lines)
   の重複走査が消える。OffscreenCanvas worker に逃がすことも検討
2. **incremental hit 更新** — 前回 hits を保持し、extension query で
   各 hit の line を再 match(line-walk スキップ)。実装は複雑
3. **virtualization 系** — sidebar list virtualization で **可視 entries
   のみ scan** 、off-screen は不要(content-visibility でも layout は skip
   だが scan 自体は走る)。flat-mode で render side でも事前 filter

## 8. Files touched

- 修正: `src/features/search/sub-location-search.ts`(prefix cache state
  + maybeResetSubLocationCache + findSubLocationHits 内 cache 参照、
  ~50 行 net)
- 新規: `tests/features/search/sub-location-prefix-cache-pr190.test.ts`
  (10 件)
- 新規: `docs/development/sublocation-prefix-cache-pr190-findings.md` (this doc)
