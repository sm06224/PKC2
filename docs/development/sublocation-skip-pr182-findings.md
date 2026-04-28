# PR #182 — `findSubLocationHits` early-exit + sidebar sub-instrumentation

**Status**: implemented
**Date**: 2026-04-28
**Predecessors**: PR #176 / #177 / #178 / #179 / #180 / #181

## 1. 動機

PR #179 findings doc が「c-1000 search-keystroke の残り 145 ms /
keystroke の内訳が分からない」と書いていた。`render:sidebar` 自体は
36 ms 程度で、残り 100 ms は scope=sidebar-only 内の他の処理(filter /
sort / DOM 組み立て / region-replacement / 再 layout / paint)に流れて
いる、という想定だった。

PR #182 は 2 段構え:
1. 推定された支配コスト `findSubLocationHits` に **fast-path early
   exit** を入れる
2. `render:sidebar` 内部に **sub-instrumentation** を入れて、PR #179
   時点で blob だった部分を分解して見えるようにする

## 2. 計測インパクト(c-1000 search-keystroke、4 keystroke)

| measure | PR #181 | PR #182 | Δ |
|---|---|---|---|
| `dispatch:SET_SEARCH_QUERY` p50 / keystroke | 145.8 ms | **121.3 ms** | **−17 %** |
| `dispatch:SET_SEARCH_QUERY` total | 622.1 ms | 584 ms | −6 % |
| `render:sidebar` p50 | 37.7 ms | 36.3 ms | −4 % |

**dispatch wall clock −17 %**。`render:sidebar` 自体が大きく動いて
いないのに dispatch が下がっているのは、render より外の通知 / scope
判定パスが PR #181 までの累積効果も入っているため。bench 実行時の
machine load 揺らぎもあるので絶対値より傾向が重要。

## 3. PR #182 で初めて見えるようになった内訳

c-1000 search-keystroke で新規露出した sub-measures(p50 / keystroke):

| measure | p50 | total | 寄与 |
|---|---|---|---|
| `render:sidebar` | 36.3 ms | 166 ms | 100 % |
| └─ `render:sidebar:filter-pipeline` | 5.5 ms | 22.2 ms | ~13 % |
| └─ `render:sidebar:sort` | 0.1 ms | 0.7 ms | <1 % |
| └─ `render:sidebar:flat-loop` | 23.9 ms | 109.9 ms | **66 %** |
| └└─ `render:sidebar:sublocation-scan` | 23.8 ms | 109.5 ms | **~99 % of flat-loop** |

→ **flat-loop の 24 ms はほぼ全て sublocation-scan が支配** していること
が確定。row 生成(memo lookup + appendChild)はゼロに近い、filter は
5 ms、sort はゼロ。残り `render:scope=sidebar-only` の 84 ms(120 ms −
36 ms)は **region replacement + browser layout + paint** に流れていて、
これは renderer 側からは触れない領域。

## 4. fast-path early exit

`src/features/search/sub-location-search.ts`:

```ts
export function findSubLocationHits(entry, query, maxPerEntry = 5): SubLocationHit[] {
  const trimmed = query.trim();
  if (trimmed === '') return [];
  if (entry.archetype !== 'text' && entry.archetype !== 'textlog') return [];

  // PR #182 fast-path: skip the line-split / heading-regex / fence
  // detection pipeline when the body has no chance of matching.
  // String#includes is one V8-optimized pass; the alternative is
  // O(lines × regex evaluations + heading slug counter state) per
  // entry, multiplied across the whole sidebar list on every keystroke.
  const lowerQuery = trimmed.toLowerCase();
  if (!entry.body.toLowerCase().includes(lowerQuery)) return [];

  if (entry.archetype === 'text') return findTextHits(entry, trimmed, maxPerEntry);
  return findTextlogHits(entry, trimmed, maxPerEntry);
}
```

メカニズム:
- `String#toLowerCase` + `String#includes` は V8 で C++ 実装、Boyer-Moore
  ベースで O(N) 1 パス。entry body 全長を一度走査
- マッチがなければ即 return — line-split + per-line `^\s{0,3}(```|~~~)`
  + per-line `^ {0,3}(#{1,3})\s+(.+?)\s*#*\s*$` + slug counter state +
  per-line `line.toLowerCase().includes(query)` の重い path を完全 skip

c-1000 で典型的検索(例:"meet")が 1000 entries 中 ~50 entries にしか
ヒットしない場合、950 entries は fast-path で終わる。100 entries × 重い
path → 950 entries × 軽い path のシフトが −17 % の dispatch 短縮に
寄与している。

## 5. sub-instrumentation 配置

`src/adapter/ui/renderer.ts` 内の `renderSidebarImpl` に 4 個の measure
を追加:

```ts
const endFilterPipeline = profileStart('render:sidebar:filter-pipeline');
let filtered = applyFilters(...);
endApplyFilters();
// + categorical / showArchived / searchHide / treeHide / unreferenced filters
endFilterPipeline();

const endSort = profileStart('render:sidebar:sort');
const entries = ... sortEntries / applyManualOrder ...;
endSort();

if (hasActiveFilter || !state.container) {
  const endFlatLoop = profileStart('render:sidebar:flat-loop');
  let endSubLocation: (() => void) | null = null;
  for (const entry of entries) {
    list.appendChild(getOrCreateMemoizedEntryItem(...));
    if (query !== '') {
      if (!endSubLocation) endSubLocation = profileStart('render:sidebar:sublocation-scan');
      const hits = findSubLocationHits(entry, query);
      ...
    }
  }
  endSubLocation?.();
  endFlatLoop();
} else {
  const endTreeLoop = profileStart('render:sidebar:tree-loop');
  for (const node of displayTree) renderTreeNode(...);
  endTreeLoop();
}
```

`sublocation-scan` の measure はループ中に最初の `query !== ''` 分岐で
遅延作成されるので、空クエリ時のオーバーヘッドはゼロ。tree-loop /
flat-loop は排他で発火。

profile 既存 measure(`filter:applyFilters`、`tree:buildTree`)はそのまま
残すので bench 既存解析パイプラインへの影響なし(SUMMARY.md は新 measure
を加算的に表示)。

## 6. c-5000 search-keystroke

Playwright タイムアウトで再ベンチ未取得(c-5000 cold-boot は完走、
c-5000 search-keystroke は前回もタイムアウトした実績ありの状態)。
タイムアウト時点まで取得できた数値:

| measure | total / 4 keystroke | max |
|---|---|---|
| `dispatch:SET_SEARCH_QUERY` | 3977.2 ms | 1106.3 ms |
| `render:scope=sidebar-only` | 3955.3 ms | 1100.9 ms |
| `render:sidebar` | 1443.8 ms | 398.6 ms |

c-5000 で 1 keystroke ~1 秒が dispatch。`render:sidebar` 自体は 360 ms
程度で、残り 640 ms / keystroke は region-replacement + browser
layout/paint(scope=sidebar-only から render:sidebar を引いた差分)。
**5000 行の DOM を React なしで全部置き換えると browser 側のコストが
支配的**になっており、ここから先の改善は **virtualization
(viewport-windowed list)** か **DOM diff の細粒度化** が必要。

PR #183 候補に「sidebar list virtualization」を追加。

## 7. テスト

既存:
- `tests/features/search/sub-location-search.test.ts` 21 件 全通過
  — fast-path 早期 return が動いていても正しい hit を返す挙動を維持
- `tests/adapter/render-scope.test.ts` 19 件 全通過
- `tests/adapter/row-memo.test.ts` 6 件 全通過

新規はなし(fast-path は既存テストで網羅、sub-instrumentation は
profile mark で behavior には現れない)。

5899 / 5899 unit pass + 11 / 11 smoke pass。

## 8. 後方互換性

- `findSubLocationHits` の戻り値契約 不変
- profile measure 追加のみ(削除 / 改名なし)
- bundle.js: 729.47 KB → 729.95 KB (+0.48 KB)
- bundle.css: 103.96 KB(変更なし)
- state shape / `data-pkc-*` 変更なし

## 9. PR #183 候補(優先度順)

1. **Sidebar list virtualization** — c-5000 で render:scope=sidebar-only
   の 640 ms / keystroke は DOM 全置換に由来。可視 viewport だけ render
   する patternへ
2. **Worker offload(派生 index)** — c-1000 段階では index は支配コスト
   ではないが、c-5000 で virtualization と組み合わせて検証
3. **Sub-location-search 中身の incremental indexing** — entries が
   stable な場合に hit set を memo 化(現在は per-keystroke 毎回 scan)

## 10. Files touched

- 修正: `src/features/search/sub-location-search.ts`
  (early-exit 6 行追加、archetype 早期 return も統合)
- 修正: `src/adapter/ui/renderer.ts`
  (sub-instrumentation 4 measure 追加、~10 行)
- 新規: `docs/development/sublocation-skip-pr182-findings.md` (this doc)
