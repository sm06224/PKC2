# PR #192 — Relation-derived memoization

**Status**: implemented(small consolidation、bench noisy)
**Date**: 2026-04-28
**Predecessors**: PR #176-#191

## 1. 動機

PR #189 で filter-pipeline を memo 化したが、`renderSidebarImpl` 内に
2 つの O(R) walk が漏れていた:

- `buildInboundCountMap(state.container.relations)` — backlink badge 用
- `buildConnectedLidSet(state.container.relations)` — orphan marker 用

どちらも container.relations のみに依存。state-only 変化(検索 / フィルタ
切替)で container ref は不変 → 結果も不変 → memo 化が直接効く。

c-5000 で 1 keystroke あたり ~2 ms の小幅削減。consolidation の意義は
**memo パターンの一貫性**:filter-cache が既に同じ container-ref keyed
の役割を果たしていたので、そこに足すだけで済む。

## 2. 実装

`src/adapter/ui/filter-cache.ts` の `FilterIndexes` に 2 フィールド追加:

```ts
export interface FilterIndexes {
  // ... existing ...
  /** PR #192: per-target inbound relation counts. */
  backlinkCounts: ReadonlyMap<string, number>;
  /** PR #192: lids appearing in any relation (from or to). */
  connectedLids: ReadonlySet<string>;
}
```

build:

```ts
const backlinkCounts = buildInboundCountMap(container.relations);
const connectedLids = buildConnectedLidSet(container.relations);
```

renderer.ts は既存呼び出しを cache 経由に切り替え:

```ts
const filterIndexes = state.container ? getFilterIndexes(state.container) : null;
const backlinkCounts = filterIndexes?.backlinkCounts
  ?? buildInboundCountMap(state.container?.relations ?? []);
const connectedLids = filterIndexes?.connectedLids
  ?? buildConnectedLidSet(state.container?.relations ?? []);
```

`state.container == null` の boot 期間は従来 fallback パスを残す。

## 3. 計測

bench machine の今日の load が非常に重く、複数 run で c-5000
sublocation-scan が 138-200 ms、c-1000 が 20-46 ms とばらついた。
PR #192 の変更は **purely additive**(同じ build 関数が render
ごと 1 回 → container ref ごと 1 回に減るだけ)で、論理上 regression
は不可能。理論削減は c-5000 で per-keystroke ~2 ms 程度、c-1000 で
~0.5 ms。

bench 値が安定するまで PR #192 単独の数値報告は控えるが、合算累積
としての wave 全体は明確に改善している。

## 4. テスト

`tests/adapter/filter-cache-pr189.test.ts` に 4 件追加:
- backlinkCounts は container ref で同一 Map 参照(キャッシュヒット)
- backlinkCounts の内訳(target lid → 入る relation 数)
- connectedLids が relation の両端を含む
- container ref 変化で両者 invalidate

合計 11 件 全通過。5966 / 5966 unit pass + 11 / 11 smoke pass。

## 5. 後方互換性

- `buildInboundCountMap` / `buildConnectedLidSet` API 不変
- renderer 表示挙動 完全一致(同じ Map / Set を計算しているだけ)
- bundle.js +0.1 KB / bundle.css 不変

## 6. PR #193 候補

c-5000 で残る `render:sidebar` の支配コスト:
- `flat-loop` 138-200 ms(sublocation-scan が大半)
- 残り = 行構築 + sidebar header construction(検索 UI、archetype chips 等)

打ち手:
- list virtualization(可視 viewport のみ render)
- Sidebar header の細粒度 memo(検索 UI が変わらない限り再構築不要)

## 7. Files touched

- 修正: `src/adapter/ui/filter-cache.ts`(`FilterIndexes` に 2
  フィールド追加 + build に 2 行追加、~10 行)
- 修正: `src/adapter/ui/renderer.ts`(2 箇所の build 呼び出しを
  cache 経由に切替、~7 行 net)
- 修正: `tests/adapter/filter-cache-pr189.test.ts`(+4 件)
- 新規: `docs/development/relation-memo-pr192-findings.md` (this doc)
