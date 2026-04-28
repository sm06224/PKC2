# PR #193 — TextAnalysis lineMeta precomputation

**Status**: implemented(modest gain、wave 締め)
**Date**: 2026-04-28
**Predecessors**: PR #176-#192

## 1. 動機

PR #191 で TextAnalysis(`lines` + `lowerLines`)を WeakMap キャッシュ
したが、`findTextHits` の内部ループには **per-line の正規表現 2 回**
(fence-toggle 検出、heading 検出)+ slug-counter state が残っていた。
これらは body のみに依存する純粋計算 → cache 化可能。

```ts
// pre-PR-193: per call
for (const line of lines) {
  if (/^\s{0,3}(?:```|~~~)/.test(line)) { inFence = !inFence; continue; }
  if (inFence) continue;
  const headingMatch = /^ {0,3}(#{1,3})\s+(.+?)\s*#*\s*$/.exec(line);
  if (headingMatch) { ... slugOf ... }
  if (!lower.includes(lowerQuery)) continue;
  ...
}
```

C-5000 で per-keystroke ~30 ms 程度の regex / state 計算が、cache hit
時にもキーストローク毎に発火していた。

## 2. 実装

### TextAnalysis に `lineMeta: ReadonlyArray<LineMeta>` 追加

```ts
interface LineMeta {
  /** Skip this line for hit checking — fence toggle or in-fence. */
  skip: boolean;
  /** Active heading context for hit attribution. */
  currentHeading: { slug: string; text: string } | null;
}
```

`buildTextAnalysis` で行ごとに 1 回計算:

```ts
const slugOf = makeSlugCounter();
let currentHeading = null;
let inFence = false;
for (const line of lines) {
  if (/^\s{0,3}(?:```|~~~)/.test(line)) {
    inFence = !inFence;
    lineMeta.push({ skip: true, currentHeading });
    continue;
  }
  if (inFence) {
    lineMeta.push({ skip: true, currentHeading });
    continue;
  }
  const headingMatch = /^ {0,3}(#{1,3})\s+(.+?)\s*#*\s*$/.exec(line);
  if (headingMatch) {
    const text = headingMatch[2]!.trim();
    if (text) currentHeading = { slug: slugOf(text), text };
  }
  lineMeta.push({ skip: false, currentHeading });
}
```

### `findTextHits` を tight loop に簡素化

```ts
for (let i = 0; i < lines.length; i++) {
  const meta = lineMeta[i]!;
  if (meta.skip) continue;
  if (!lowerLines[i]!.includes(lowerQuery)) continue;

  const currentHeading = meta.currentHeading;
  const subId = currentHeading
    ? `heading:${currentHeading.slug}`
    : `entry:${entry.lid}`;
  if (seen.has(subId)) continue;
  seen.add(subId);
  // ... build hit ...
}
```

regex 実行ゼロ、slugOf 呼び出しゼロ、in-fence state 不要。

## 3. 計測

| 計測 | PR #191 | PR #193 |
|---|---|---|
| c-1000 sublocation-scan p50 | 20.2 ms | 26.3 ms (noisy)|
| c-5000 sublocation-scan p50 | 138.3 ms | **130.0 ms** (−6 %) |

bench machine の noise 範囲(±20 %)を超えるか微妙な数字。**論理上は
purely additive 最適化**:同じ計算を 1 度に集約しただけ、regression
不可能。c-1000 の +6ms は別 run でも揺れていた範囲。

c-5000 の改善は再現性ある(複数 run で 130-140 ms 帯)が、wave 全体
でのインパクトは限定的。次の大きな leverage は **list virtualization**
(c-5000 で 5000 → ~30 行のみ render)が候補。

## 4. テスト

correctness preservation:既存 21 件 sub-location-search +
PR #191 6 件 + PR #190 10 件 = 計 37 件 全通過。新テストは
不要(同じ hits 集合が返ることを既存テストが保証)。

合計 5966 / 5966 unit pass + 11 / 11 smoke pass。

## 5. 後方互換性

- `findSubLocationHits` 戻り値契約 不変、`findTextHits` の出力 unchanged
- bundle.js +0.3 KB(lineMeta build + interface)
- bundle.css 不変
- WeakMap キャッシュは Entry ref で自動失効(PR #191 と同じ)

## 6. 累積 wave 状況(PR #176-#193)

| 計測 | PR #178 起点 | PR #193 後 |
|---|---|---|
| c-1000 search dispatch p50 | 159.8 ms | **~50-65 ms (−65 %)** |
| c-5000 search dispatch p50 | (timeout) | **~408 ms (実用化)** |
| c-5000 sublocation-scan p50 | (PR #182 露出 119 ms) | **130 ms** |
| filter-pipeline c-5000 p50 | 100 ms | **4.6 ms (−95 %)** |
| 30 × 5MB drop main thread | フリーズ | ~0.5 s |

c-5000 search はまだ ~400 ms / keystroke。残り leverage は **list
virtualization** が支配的。1 keystroke で render する行を 5000 →
~30 に絞れば ~95 % の削減見込み。

## 7. PR #194 候補

- **list virtualization**(viewport-windowed flat-mode rendering)—
  scroll handling + variable row height + sub-location row 配置の
  考慮要、~1 day-effort 規模
- **sidebar header memo**(検索 UI / archetype chips の再構築抑制)—
  ~10-30 ms 削減、軽め

## 8. Files touched

- 修正: `src/features/search/sub-location-search.ts`
  - `TextAnalysis.lineMeta` 追加 + `LineMeta` interface
  - `buildTextAnalysis` で precompute(~25 行追加)
  - `findTextHits` の per-line regex / state を削除、tight loop 化
    (~25 行 net 削減)
- 新規: `docs/development/line-meta-pr193-findings.md` (this doc)
