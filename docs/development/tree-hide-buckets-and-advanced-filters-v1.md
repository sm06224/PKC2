# Tree-hide-buckets + Advanced-filters disclosure (PR #174, 2026-04-27)

**Status**: implemented (PR #174)
**Date**: 2026-04-27
**User direction**:
> 「ASSETSとTODOSをデフォで隠すのは…トグル自体を折りたたんで隠したうえで、フォルダすらもハイドする感じです」

## 1. 背景

PR #173 で「ASSETS / TODOS バケットフォルダを `collapsedFolders`
に追加して default 折り畳み」までは入れたが、これは **見えるけど
中身は閉じている** だった。User からの follow-up:

- 「フォルダすらもハイドする感じです」 — 折り畳みではなく非表示
- 「トグル自体を折りたたんで隠したうえで」 — toggle UI 自体も
  default で隠す (sidebar の縦領域を圧迫しない)

つまり「typical browse view では bucket フォルダの存在自体を
意識せずに済む」状態を default にしてほしい、という要請。

## 2. State / actions

| state field | UserAction | default | shape |
|---|---|---|---|
| `treeHideBuckets?: boolean` | `TOGGLE_TREE_HIDE_BUCKETS` | `true` | optional, default-handle at use sites |
| `advancedFiltersOpen?: boolean` | `TOGGLE_ADVANCED_FILTERS` | `false` | optional, default-handle at use sites |

両方とも **runtime-only**, persist しない。saved search にも入れ
ない (per-session の lens なので)。Optional shape は inline test
literals が touched 不要であるための互換配慮。

## 3. Filter semantics

`treeHideBuckets === true` && `unreferencedAttachmentsOnly !==
true` のとき、entries list rendering pipeline で:

```ts
const bucketTitles = new Set(Object.values(ARCHETYPE_SUBFOLDER_NAMES));
const hiddenLids = new Set<string>();
for (const e of container.entries) {
  if (e.archetype === 'folder' && bucketTitles.has(e.title)) {
    hiddenLids.add(e.lid);
    for (const d of collectDescendantLids(container.relations, e.lid)) {
      hiddenLids.add(d);
    }
  }
}
filtered = filtered.filter((e) => !hiddenLids.has(e.lid));
```

- **Bypassed** by the unreferenced-attachments lens: クリーンアップ
  flow は ASSETS 配下を surface する必要があるため。
- **Tree mode + Flat mode 両方** に効く (filterIsActive を見ない)。
  Search-result の中に bucket entry を出さないのは
  `searchHideBuckets` が search-active 時のみ filter-active branch
  で行う後段 lens (orthogonal axis、`docs/spec/search-filter-
  semantics-v1.md` §9 参照)。
- **Auto-bucket folder の判定** は `ARCHETYPE_SUBFOLDER_NAMES`
  (`features/relation/auto-placement.ts`) — 現状 `ASSETS` /
  `TODOS` の 2 つだけ。新しい auto-bucket archetype が増えれば
  それも自動的に hide 対象。

## 4. Advanced-filters disclosure UI

旧 sidebar 直下 3 トグル (show archived / search-hide-buckets /
unreferenced-attachments) と新 toggle (tree-hide-buckets) を 1 つ
の `<details data-pkc-region="advanced-filters">` に集約:

```html
<details data-pkc-region="advanced-filters">
  <summary data-pkc-action="toggle-advanced-filters">⚙ Filters</summary>
  <label data-pkc-region="show-archived-toggle">…</label>
  <label data-pkc-region="tree-hide-buckets-toggle">…</label>
  <label data-pkc-region="search-hide-buckets-toggle">…</label>
  <label data-pkc-region="unreferenced-attachments-toggle">…</label>
</details>
```

- Default 折り畳み (`open` 属性なし)。
- `state.advancedFiltersOpen` が true のとき `open` 属性付与 →
  full-shell rebuild 後も `<details>` が開いたままになる。
- 各 toggle 自身の `data-pkc-region` は維持しているので既存
  selector / a11y ヘルパは不変。
- Summary の `data-pkc-action="toggle-advanced-filters"` で
  `TOGGLE_ADVANCED_FILTERS` dispatch (`<details>` の native open
  toggle と二重発火するが、どちらも同じ state を flip するだけ
  なのでべき等)。

## 5. 個別 toggle の意味論

| toggle | inverted? | 意味 |
|---|---|---|
| Show archived | direct | check で archived todo を表示 |
| Show ASSETS / TODOS folders | inverted | check で `treeHideBuckets=false` (= folder を見せる) |
| Show ASSETS / TODOS in search results | inverted | check で `searchHideBuckets=false` (search-active 時のみ surface) |
| Show only unused attachments | direct | check でクリーンアップ lens ON |

inverted UX の理由: state field 名が「hide が default」なので、
checkbox の文言は「Show…」で揃え、checked = 表示する。

## 6. Tests

- `tests/adapter/tree-hide-buckets.test.ts` (+6) — default hide /
  reveal / unref-lens override / disclosure structure / summary-
  click dispatch / open-state persistence.
- `tests/adapter/search-hide-buckets.test.ts` (+2 update, +6 total)
  — tree-hide-default model に合わせて 2 件更新、4 件追加。
- `tests/core/app-state.test.ts` — TOGGLE_TREE_HIDE_BUCKETS /
  TOGGLE_ADVANCED_FILTERS の reducer test を統合。

## 7. Backward compatibility

- 全 state field optional + default-handle at use sites。既存の
  inline state literals (renderer.test.ts 等) は touched 不要。
- `data-pkc-action` 追加のみ (`toggle-tree-hide-buckets`,
  `toggle-advanced-filters`)。既存値不変。
- `data-pkc-region` 追加のみ (`advanced-filters`, `tree-hide-
  buckets-toggle`)。既存値不変。
- 既存 toggle (show archived) は新しい `<details>` の中に移動
  したが、`data-pkc-region="show-archived-toggle"` selector は
  維持。1 件だけ既存テスト (`renderer.test.ts` の "pane is placed
  between sort controls and archive toggle") を「placed between
  sort controls and the advanced-filters disclosure」へ更新。

## 8. 関連

- 軸の位置づけ: `../spec/search-filter-semantics-v1.md` §9
- Auto-placement (bucket folder 自動生成): 同じ
  `ARCHETYPE_SUBFOLDER_NAMES` を共有
- Unused-attachment lens: `./unreferenced-attachments-cleanup-v1.md`
- Empty-trash + asset cleanup: `./orphan-asset-auto-gc.md` §2.1
  (PR #174 で追加された PURGE_TRASH 経路)
