# PR #183 — `content-visibility: auto` for sidebar entry rows

**Status**: implemented
**Date**: 2026-04-28
**Predecessors**: PR #176 / #177 / #178 / #179 / #180 / #181 / #182

## 1. 動機

PR #182 の sub-instrumentation で c-5000 search-keystroke の内訳が
分解できた:`render:scope=sidebar-only` の 640 ms / keystroke のうち、
**`render:sidebar` 自体は 360 ms、残り 280 ms は region-replacement
+ browser layout/paint** に流れていた。renderer 側の JavaScript
最適化では触れない領域。

選択肢:
- **A. Full JS virtualization**(viewport-windowed list、~95 %win
  期待)— だが drag/drop / a11y / scroll restore / multi-select の
  互換性破壊リスクが大きく、行数 ~1500 行追加見込み
- **B. CSS `content-visibility: auto`**(off-screen 行の layout/paint
  をブラウザ側でスキップ、~50-80 % win 期待)— 5 行で済み、JS 変更
  ゼロ、purely additive(非対応ブラウザは従来挙動)

→ B を選択。bench で効果不足なら A に進む方針。結果として B だけで
**c-5000 search-keystroke が 180s timeout → 452 ms / keystroke 完走**
まで到達したため A は不要と判断。

## 2. 計測インパクト(PR #183 vs PR #182)

### c-5000 search-keystroke

| measure | PR #182 | PR #183 | Δ |
|---|---|---|---|
| `dispatch:SET_SEARCH_QUERY` p50 | (timeout)¹ | **452.5 ms** | (新規完走)|
| `dispatch:SET_SEARCH_QUERY` total / 4 keystroke | 3977 ms² | **1900 ms** | **−52 %** |
| `render:scope=sidebar-only` p50 | (timeout) | 450 ms | — |
| `render:sidebar` p50 | (timeout) | 348 ms | — |
| `render:sidebar:flat-loop` p50 | (timeout) | 119 ms | — |
| Playwright 完走 | NO (180s timeout) | **YES (4.4s)** | — |

¹ Playwright timeout のため p50 取得不可
² timeout 直前までの暫定値、4 keystroke 中で計測されたぶん

### c-5000 cold-boot

| measure | PR #182 | PR #183 | Δ |
|---|---|---|---|
| boot enter→exit | 220.6 ms | **178.9 ms** | **−19 %** |
| `render:sidebar` | 109.8 ms | **91 ms** | **−17 %** |
| `dispatch:SYS_INIT_COMPLETE` | 151.1 ms | **126.8 ms** | **−16 %** |

### c-5000 select-entry

| measure | PR #182 | PR #183 | Δ |
|---|---|---|---|
| `dispatch:SELECT_ENTRY` | 684.6 ms | **507.8 ms** | **−26 %** |
| `render:sidebar:tree-loop` | (新規) | 60.2 ms | — |
| `render:sidebar` | 80.5 ms | 84.5 ms | (+5%、ノイズ範囲)|

### c-1000 search-keystroke

| measure | PR #182 | PR #183 | Δ |
|---|---|---|---|
| `dispatch:SET_SEARCH_QUERY` p50 | 121.3 ms | **53.9 ms** | **−56 %** |
| `render:scope=sidebar-only` p50 | 120.3 ms | **53.1 ms** | **−56 %** |
| `render:sidebar` p50 | 36.3 ms | 37.5 ms | (ほぼ同じ)|
| `render:sidebar:flat-loop` p50 | 23.9 ms | 24.8 ms | (ほぼ同じ)|
| (region replacement + layout/paint = scope − sidebar) | **84 ms** | **15.6 ms** | **−81 %** |

## 3. 仕組み

### `content-visibility: auto`

```css
.pkc-entry-item {
  ...
  content-visibility: auto;
  contain-intrinsic-size: auto 32px;
}

.pkc-entry-subloc {
  ...
  content-visibility: auto;
  contain-intrinsic-size: auto 24px;
}
```

ブラウザ動作:
- **off-screen の `<li>` は subtree の layout / paint をスキップ**
  IntersectionObserver-相当の機構で viewport 進入を検出、進入時に初めて
  full layout / paint
- `contain-intrinsic-size: auto 32px` で初回未計測時の placeholder
  サイズを 32 px と宣言。`auto` は計測後に実サイズを cache、scrollbar
  ジャンプを防ぐ
- click イベント / data-pkc-action delegation は subtree 関係なく
  伝搬する(content-visibility は visibility:hidden ではなく、layout
  だけ skip するセマンティクス)

### 大規模行で何が変わるか

c-5000 で sidebar が 5000 行になる場合:
- **PRE**:全 5000 `<li>` が style / layout / paint。region-replace
  毎に 5000 layout
- **POST**:viewport 内の ~30 `<li>` のみ layout / paint。残り 4970
  は subtree-skipped

c-1000 / c-500 / c-100 でも視認上は同じ効果(フレーム内の <li> 数で
linear、行数依存はほぼ消える)。

### 互換性

Chrome 85+, Edge 85+, Safari 18+。Firefox は未対応(2026-04 現在)
だが property を ignore するだけなので **fallback は従来挙動と完全一致**。
PKC2 は smoke で chromium を使うため、CI レベルで保証される。

## 4. 取り組まなかった次の層

c-5000 search-keystroke はまだ 452 ms / keystroke。内訳:
- `render:sidebar:flat-loop` = 119 ms(うち sublocation-scan 119 ms)
- `render:sidebar:filter-pipeline` = 101 ms
- DOM assemble(残差)= ~129 ms
- region replacement + layout/paint = 102 ms

次の打ち手候補:
1. **filter-pipeline 内の treeHide / searchHide フィルタ**:c-5000 で
   100 ms に達している(PR #182 では 25 ms / c-1000)。`collectDescendantLids`
   は relations のフルスキャン。memo 化候補
2. **flat-loop の sublocation-scan**:fast-path で 95 % skip しても残り
   5 % で 119 ms。matching entry の line-split + heading-regex 自体が
   重い → matching entry に対する **incremental indexing**(前回 query
   と prefix 一致なら前回結果を絞り込む)
3. **Worker offload** — 上記 2 つを丸ごと worker に逃がす

PR #184 候補に置く。

## 5. テスト

- 5899 / 5899 unit pass(変更なし、CSS 追加のみ)
- 11 / 11 smoke pass(視覚レイアウトに content-visibility が干渉
  していないことを確認)
- bench 16 シナリオ完走(c-5000 search-keystroke が初めて完走)

## 6. 後方互換性

- 視覚的レイアウト 不変(content-visibility:auto は paint タイミングだけ
  影響、size は contain-intrinsic-size で確保)
- a11y:screen reader / keyboard navigation は subtree の DOM
  構造を従来通り辿れる(content-visibility:hidden ではない)
- drag/drop:HTML5 DnD は viewport 外の要素にも対応、影響なし
- multi-select:`data-pkc-multi-selected` 属性ベース、layout 関係なし
- scroll restoration:`contain-intrinsic-size: auto` が height を保持、
  scrollTop 維持される(PR #178 の sidebar scrollTop preservation も継続)
- bundle.css: 103.96 KB → 104.43 KB (+0.47 KB)
- bundle.js: 729.95 KB(変更なし)

## 7. Files touched

- 修正: `src/styles/base.css`(`.pkc-entry-item` と `.pkc-entry-subloc`
  に content-visibility + contain-intrinsic-size 追加、~14 行)
- 新規: `docs/development/sidebar-content-visibility-pr183-findings.md` (this doc)

## 8. PR #184 候補

bench で残り得る ~452 ms / keystroke (c-5000) のさらなる打ち手:

1. **filter pipeline メモ化** — treeHide bucket 集合 / searchHide
   bucket 集合を container 不変なら cache
2. **Sublocation incremental search** — prefix 一致時に前回 hit を
   絞り込み(re-scan しない)
3. **Worker offload** — derived index + 重い filter を worker 移管

PR #181 で実装した attach 経路の memory レポートとの統合 bench も
PR #184 で検討。
