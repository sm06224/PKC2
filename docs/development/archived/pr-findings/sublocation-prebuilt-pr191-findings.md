# PR #191 — Sublocation-scan prebuilt per-entry analysis cache

**Status**: implemented(明確な勝ち)
**Date**: 2026-04-28
**Predecessors**: PR #176-#190

## 1. 動機

PR #190 で no-match prefix-incremental cache を入れたが、c-5000 の
synthetic body は語彙偏りで cache 効きが小さかった(155-188 ms p50)。
本 PR は **per-entry の重い前処理を Entry ref に WeakMap 化**して、
キャッシュヒット時に毎キーストロークの body 走査をゼロに。

## 2. 実装

### `src/features/search/sub-location-search.ts`

```ts
interface TextAnalysis {
  kind: 'text';
  lowerBody: string;          // toLowerCase 1 回
  lines: ReadonlyArray<string>;       // body.split 1 回
  lowerLines: ReadonlyArray<string>;  // 各 line の toLowerCase 1 回
}
interface TextlogAnalysis {
  kind: 'textlog';
  lowerBody: string;
  parsed: ReturnType<typeof parseTextlogBody>;  // parseTextlogBody 1 回
  lowerLogTexts: ReadonlyArray<string>;
}

const analysisCache: WeakMap<Entry, EntryAnalysis> = new WeakMap();

function getEntryAnalysis(entry: Entry): EntryAnalysis {
  let cached = analysisCache.get(entry);
  if (!cached) {
    cached = entry.archetype === 'text' ? buildTextAnalysis(entry) : buildTextlogAnalysis(entry);
    analysisCache.set(entry, cached);
  }
  return cached;
}
```

`findSubLocationHits` の早期 exit / `findTextHits` / `findTextlogHits`
が cache 経由で:
- **早期 exit**:`entry.body.toLowerCase().includes(lowerQuery)` →
  `analysis.lowerBody.includes(lowerQuery)`(lowercase 1 回限り)
- **text path**:`entry.body.split(/\r?\n/)` → `analysis.lines`、
  `line.toLowerCase()` → `analysis.lowerLines[i]`
- **textlog path**:`parseTextlogBody(entry.body)` → `analysis.parsed`、
  `log.text.toLowerCase()` → `analysis.lowerLogTexts[i]`

### キャッシュキー = Entry 参照

immutable update 規約で Entry の body が変わると Entry ref も変わる
(`COMMIT_EDIT` / `QUICK_UPDATE_ENTRY` reducer は新オブジェクトを返す)。
WeakMap miss → 新 ref で rebuild。明示的な per-entry invalidation 不要。

GC: コンテナから消えた Entry は WeakMap から自動収集 → cache size は
live container 規模で頭打ち。

## 3. 計測インパクト(bench c-1000 / c-5000)

| 計測 | PR #190 | PR #191 | Δ |
|---|---|---|---|
| c-1000 sublocation-scan p50 | 32.3 ms | **20.2 ms** | **−37 %** |
| c-1000 dispatch p50 | 66.8 ms | **46.8 ms** | **−30 %** |
| c-5000 sublocation-scan p50 | 164 ms | **138.3 ms** | **−16 %** |
| c-5000 dispatch p50 | 466.8 ms | **405.9 ms** | **−13 %** |

c-1000 はノイズより十分大きく、c-5000 もはっきり改善。PR #190 の
no-match cache は語彙依存だったが、PR #191 の prebuilt cache は
**マッチ entry にも効く**(cache hit で body 全走査を省く)ため
synthetic fixture でも明確に効く。

heap: c-5000 で 31 MB → 65 MB(+30 MB)。lowerBody + lines + lowerLines
を 5000 entries に対し WeakMap で保持。許容範囲。

## 4. PR #190 テストとの整合

PR #190 の 2 件のテストが「invalidate 後は body re-scan」を spy.reads で
検証していたが、PR #191 では invalidation しても **cache hit で body
読みが起きない**(より強い最適化)ため失敗した。テストを「invalidation
後の挙動が正しい」=「matching query で hits が返る」に書き換え。
PR #190 のキャッシュ無効化ロジックは引き続き有効、PR #191 はその
**直交した最適化**。

## 5. テスト

新規 `tests/features/search/sub-location-prebuilt-cache-pr191.test.ts`
(6 件):
- 同一 query 2 回呼びで結果一致(correctness)
- text:複数 query 後も body 読みは初回のみ(spyOnBody で検証)
- 新 Entry ref で fresh build
- textlog:parsed body も 1 回パース
- 既存契約:heading attribution、fence skip 不変

修正 `tests/features/search/sub-location-prefix-cache-pr190.test.ts`
(2 件):invalidation 検証を spy.reads → result-based に変更。

合計 5962 / 5962 unit pass + 11 / 11 smoke pass。

## 6. 後方互換性

- `findSubLocationHits` 戻り値契約 不変
- 同じ hits を返す(同じアルゴリズムを cached データで実行)
- bundle.js +0.7 KB / bundle.css 不変
- heap +30 MB at c-5000(許容)

## 7. 累積 wave 状況(PR #178 起点)

| 計測 | PR #178 | 現状(PR #191 後)|
|---|---|---|
| c-1000 search dispatch p50 | 159.8 ms | **46.8 ms (−71 %)** |
| c-5000 search dispatch p50 | (timeout) | **405.9 ms** |
| c-1000 sublocation-scan p50 | (PR #182 で初露出 24 ms) | **20 ms** |
| c-5000 sublocation-scan p50 | (PR #182 で初露出 119 ms) | **138 ms**(noise込) |
| filter-pipeline c-5000 p50 | (未計測) | 4.8 ms |

## 8. PR #192 候補

c-5000 で残る:
- `render:sidebar` 全体 = 279 ms
- `flat-loop` = 138 ms(うち sublocation-scan 138)
- 残り `render:sidebar` 内訳 = 141 ms(行構築 + DOM 組み立て)

支配コストは **行構築 (`getOrCreateMemoizedEntryItem`) + DOM appendChild
ループ**。打ち手:

1. **list virtualization** — 可視 viewport の行のみ生成(N=5000 → ~30)
2. **DocumentFragment による DOM 組み立て** — 50 行ごとに append でなく
   Fragment にまとめてから一括 append
3. **dispatcher 単位の batch coalescing** — connected non-render-affecting
   dispatch をまとめて render 一回に

## 9. Files touched

- 修正: `src/features/search/sub-location-search.ts`
  (analysisCache + getEntryAnalysis、TextAnalysis / TextlogAnalysis
  型、findTextHits / findTextlogHits を analysis 受け取りに変更、
  ~80 行 net)
- 修正: `tests/features/search/sub-location-prefix-cache-pr190.test.ts`
  (2 件:invalidation 検証を result-based に変更、spy 不要に)
- 新規: `tests/features/search/sub-location-prebuilt-cache-pr191.test.ts`
  (6 件)
- 新規: `docs/development/sublocation-prebuilt-pr191-findings.md` (this doc)
