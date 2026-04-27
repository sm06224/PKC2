# Unreferenced-attachment cleanup filter (PR #174, 2026-04-27)

**Status**: implemented (PR #174)
**Date**: 2026-04-27
**User direction**:
> 「どこにもリンクしていない、埋め込まれていない、リンク貼付もされていないアセットをフィルタする機能をつけて 一括消す対象をそうやって選びたい いらないものを効率よく削除する機能が必要」

## 1. 背景

Container 内に attachment archetype の entry が増えていくにつれ、
**もう参照されていない upload 残骸** が積み重なる:

- 一度 [link](entry:att-X) として貼ったが、後で本文を書き直して
  link を消した → entry は残る
- 画像を `![](asset:K)` で embed したが、文章ごと削除した →
  attachment entry は残る (asset bytes も `removeOrphanAssets`
  で掃除されるまで残る)

このとき「ユーザーが手動で消したい」flow を support するため、
**未参照 attachment だけ** を sidebar に surface する lens
toggle を追加。

## 2. "Unreferenced" の定義

Attachment entry `A` が **unreferenced** ⇔ 次の両方を満たす:

1. **どの他の entry の body にも `entry:<A.lid>` 参照がない**
   - text body の markdown link / image
   - textlog の各 log entry の `text` field
2. **どの他の entry の body にも `asset:<A.body.asset_key>` 参照
   がない** (A に asset_key がある場合)
   - 同じ markdown source 範囲

**自己参照は除外**: A の body は `{ asset_key: K }` を持っており
形式上 `K` を参照しているが、これは A 自身の所有なので
「他から参照されている」とは数えない。

`tests/features/asset/asset-scan.test.ts` の "an attachment's OWN
body does not count as a self-reference" でこの semantics を pin。

## 3. Helper: `collectUnreferencedAttachmentLids`

`features/asset/asset-scan.ts`:

```ts
export function collectUnreferencedAttachmentLids(container: Container): Set<string> {
  const refLids = new Set<string>();
  const refAssetKeys = new Set<string>();
  for (const entry of container.entries) {
    if (entry.archetype === 'text') {
      for (const lid of extractEntryReferences(entry.body)) refLids.add(lid);
      for (const k of extractAssetReferences(entry.body)) refAssetKeys.add(k);
    } else if (entry.archetype === 'textlog') {
      const parsed = parseTextlogBody(entry.body);
      for (const log of parsed.entries) {
        if (typeof log.text === 'string') {
          for (const lid of extractEntryReferences(log.text)) refLids.add(lid);
          for (const k of extractAssetReferences(log.text)) refAssetKeys.add(k);
        }
      }
    }
    // attachment / todo / form / folder / generic / opaque は
    // 他の attachment を「使っている」reference を持たないので skip。
  }
  const result = new Set<string>();
  for (const entry of container.entries) {
    if (entry.archetype !== 'attachment') continue;
    if (refLids.has(entry.lid)) continue;
    let assetKey = '';
    try {
      const parsed = JSON.parse(entry.body) as { asset_key?: unknown };
      if (typeof parsed.asset_key === 'string') assetKey = parsed.asset_key;
    } catch { /* malformed */ }
    if (assetKey && refAssetKeys.has(assetKey)) continue;
    result.add(entry.lid);
  }
  return result;
}
```

純関数 / features-layer / no DOM / no dispatcher。

## 4. Filter UI (`unreferencedAttachmentsOnly`)

| state field | UserAction | default |
|---|---|---|
| `unreferencedAttachmentsOnly?: boolean` | `TOGGLE_UNREFERENCED_ATTACHMENTS_FILTER` | `false` |

Toggle UI:
- `data-pkc-region="unreferenced-attachments-toggle"`
- `data-pkc-action="toggle-unreferenced-attachments"`
- Container に attachment archetype の entry が **1 件以上ある時
  のみ** 表示 (text-only container では完全に hidden)
- ON のときラベルに live count `(N)` を追加表示
- `<details data-pkc-region="advanced-filters">` の中に居る (default
  折り畳み)

Renderer pipeline での挙動:
```ts
if (state.unreferencedAttachmentsOnly && state.container) {
  const unreferenced = collectUnreferencedAttachmentLids(state.container);
  filtered = filtered.filter((e) => unreferenced.has(e.lid));
}
```

- `treeHideBuckets` を **override**: クリーンアップ対象の多くが
  ASSETS バケット配下にあるため、bucket-hide が効いていると
  surface できない。
- `hasActiveFilter` 計算にも含めて、ON のときは flat mode に
  切り替わる (tree でクリーンアップ候補が散らばるより、フラット
  リストで multi-select したほうが速い)。

## 5. クリーンアップ workflow

1. ⚙ Filters disclosure を開く
2. "Show only unused attachments" を ON
3. live count `(N)` で削除候補数を確認
4. Ctrl+click / Shift+click で multi-select
5. Bulk delete (`BULK_DELETE` UserAction)
6. (推奨) Empty Trash → 関連 asset bytes も同 reduction で sweep
   (`PURGE_TRASH` 経路、`./orphan-asset-auto-gc.md` §2.1 参照)

## 6. Tests

- `tests/features/asset/asset-scan.test.ts` (+9) —
  `collectUnreferencedAttachmentLids` pure helper の網羅 (entry:
  link / asset: embed / textlog log entry / legacy inline body /
  self-reference exclusion / multi-attachment 混合 / text-only)。
- `tests/adapter/unreferenced-attachments-filter.test.ts` (+5) —
  toggle 表示条件 / list restriction / count badge / text-only で
  hidden / dispatch wiring。

## 7. 限界 / 将来

- **Revision body はスキャンしない**: revision snapshot に古い
  `entry:` / `asset:` 参照が残っていても、現状の helper は active
  body のみを見る。`PURGE_TRASH` で revision が消えれば残骸は
  unreferenced になる、という時系列依存はある (これは spec
  通り、revision is non-reference の方針)。
- **Cross-container reference は考慮しない**: 別の container 内
  から `pkc:...&entry=<A.lid>` 形式で参照されていても、本 container
  内には `entry:` token がないので unreferenced と判定される。
  Cross-container ref は別軸の問題。

## 8. 関連

- 軸の位置づけ: `../spec/search-filter-semantics-v1.md` §9
- Disclosure UI 全体: `./tree-hide-buckets-and-advanced-filters-v1.md`
- Empty-trash + asset cleanup: `./orphan-asset-auto-gc.md`
- 既存の orphan-asset 検出 (asset bytes 側): `collectOrphanAssetKeys`
  (`features/asset/asset-scan.ts`) — 本機能は **entry 側** の
  unreferenced を見るので分けて考える。
