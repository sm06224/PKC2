# Breadcrumb / Path Trail v1

**Status**: spec + additive hardening — 2026-04-21.
**Scope**: detail view 上部に表示されている既存 breadcrumb を v1 として仕様化する。併せて **root-level 表示** と **depth truncation indicator** を追加し、**multi-parent 時のふるまい** を明文化する。
**Baseline**: `next-feature-prioritization-after-relations-wave.md` の P2（"where am I?" pane）。

---

## 1. 現状整理

breadcrumb は既に `src/adapter/ui/renderer.ts` の detail view 描画時に実装済みで、
`src/features/relation/tree.ts` の pure helper `getBreadcrumb()` が path を計算する。

- `getBreadcrumb(relations, entries, lid, maxDepth = 4)` は対象 entry の structural parent を
  最大 4 階層まで遡り、**root → immediate parent** の順に `Entry[]` を返す。self は含まない。
- 該当 entry が root 階層なら `[]` を返し、従来 breadcrumb は **非表示** になっていた。
- multi-parent（複数 structural relation が `to === lid` にヒット）の場合、現状は
  `relations.find(r => r.kind === 'structural' && r.to === lid)` で **最初にヒットした 1 本を採用** する。
- 表示は `.pkc-breadcrumb-item` (clickable `data-pkc-action="select-entry"`) + `.pkc-breadcrumb-sep` (`" › "`)
  + `.pkc-breadcrumb-current` (非クリッカブルな現在 entry 名) で構成。

v1 ではこのふるまいを変更せず、**仕様として固定** した上で、足りない挙動（root-level 表示 / 深さ打ち切り指示）
を **加算的に** 追加する。reducer / state / container には手を入れない。

## 2. Scope of path

- **structural relation のみ** を辿る。semantic / categorical / temporal relation は path に寄与しない。
  理由: breadcrumb は "収納場所" を示す UI であり、意味的参照は別ビュー（backlinks pane など）の責務。
- **最大深さ: 4**（`getBreadcrumb` の `maxDepth` デフォルト）。これは `buildTree` と同じ定数で、
  運用上発生しないはずの深すぎる階層で breadcrumb が無限に膨張するのを防ぐ安全弁。
- path は **root → immediate parent** 順に並ぶ。現在 entry 自身は path に含めず、
  末尾の `.pkc-breadcrumb-current` で別途表示する（click 不可）。

## 3. DOM shape

```
<div class="pkc-breadcrumb" data-pkc-region="breadcrumb">
  <!-- root-level marker（path 空の場合、v1 で追加） -->
  <span class="pkc-breadcrumb-root">Root</span>

  <!-- truncated marker（chain が maxDepth を超えた場合、v1 で追加） -->
  <span class="pkc-breadcrumb-truncated" title="…（省略された祖先あり）">…</span>
  <span class="pkc-breadcrumb-sep"> › </span>

  <!-- ancestor entries（root → immediate parent） -->
  <span class="pkc-breadcrumb-item"
        data-pkc-action="select-entry"
        data-pkc-lid="...">My Folder</span>
  <span class="pkc-breadcrumb-sep"> › </span>

  <!-- current entry（click 不可） -->
  <span class="pkc-breadcrumb-current">Note in Folder</span>
</div>
```

- container が存在する限り、detail view では breadcrumb div **を常に描画** する（v1 変更点）。
  従来は `breadcrumb.length > 0` のときだけ描画していたが、root-level marker 追加で常時描画に変わる。
- selector は **`data-pkc-region="breadcrumb"` スコープ** で scope する。`.pkc-breadcrumb-item` は
  他 region と衝突しない独自クラスだが、region scope を明示することで keyboard / ARIA / test 上の
  取り違えを防ぐ。

## 4. Placement

- detail view 内、`titleRow`（タイトル + archetype label + task badge）の**直後**、
  archetype-dispatched body の**直前**。
- renderer.ts で `view.appendChild(titleRow)` → `view.appendChild(bc)` → `view.appendChild(body)` の順。
- viewMode が detail 以外（calendar / kanban）では **表示しない**（detail view の renderer 内でのみ append）。

将来、calendar / kanban / graph view にも breadcrumb を流用する選択肢は残すが、v1 の scope 外。

## 5. Click behavior

- `.pkc-breadcrumb-item` は `data-pkc-action="select-entry"` + `data-pkc-lid=<ancestor.lid>` を持ち、
  tree の entry item と同じ `select-entry` action にルーティングされる。
  → `SELECT_ENTRY`、必要なら `SET_VIEW_MODE: detail` へ遷移。recent pane のように action 名を
  分離しない: breadcrumb は selection 起点として tree と同格に扱われる。
- `.pkc-breadcrumb-current`・`.pkc-breadcrumb-root`・`.pkc-breadcrumb-truncated` は
  **クリック不可**（`data-pkc-action` を持たない）。
- ctrl/meta/shift click は効かせない（tree と同様、breadcrumb から multi-select / range-select を
  開始しない方が安全）。

## 6. Root-level entry の表示

**v1 の追加点**。root 階層の entry（structural parent を持たない entry）を選択した時、
従来は breadcrumb が非表示だったため "この entry が root にある" という情報が **欠落** していた。

v1 では以下を追加:

- container があれば breadcrumb div を **常に** render する。
- `breadcrumb.length === 0` の時、`<span class="pkc-breadcrumb-root">Root</span>` を先頭に追加する。
- そのあと通常の sep を挟まず、直接 `.pkc-breadcrumb-current` を表示する（"Root › My Note"）。

背景:
- Recent Entries Pane v1 で "最近触った root entry" に簡単に飛べるようになった結果、
  "自分が今 root を見ているのか folder の中なのか" を一目で判別したいユースケースが増えた。
- root marker はローカライズ対象。現状はハードコード `"Root"`、将来 i18n レイヤが入ったら置換。

## 7. Depth truncation indicator

**v1 の追加点**。`getBreadcrumb` は `maxDepth = 4` で打ち切るので、深さ 5 以上の階層に属する entry
では **実際の root まで遡れていない** まま breadcrumb が描画される。従来はこれを silent に
省略していたため、ユーザには "root にいない" のか "もっと先まで祖先があるのか" の区別が付かなかった。

v1 では以下を追加:

- breadcrumb の先頭 ancestor（`breadcrumb[0]`）に対して **さらに structural parent が存在する**
  なら、先頭に `<span class="pkc-breadcrumb-truncated" title="…（省略された祖先あり）">…</span>`
  を挿入し、続けて sep を挟んで通常の ancestor 列を並べる。
- 判定は renderer 側の 1 行 `getStructuralParent(container.relations, container.entries, breadcrumb[0].lid) !== null`
  で行う。`getBreadcrumb` helper の signature は変えない（pure helper の契約を維持）。
- `…` は **クリック不可**。v1 では "省略祖先があります" の **告知 only** で、
  expand / 展開 UI は提供しない（UX 設計が別途必要なため）。

背景:
- 実運用上 4 階層を超える structural 階層は稀だが、import 由来のデータや人工的な深い folder 構造で
  発生しうる。silently hide より "省略していますよ" を可視化した方が安全。

## 8. Multi-parent handling

PKC2 の structural relation は **技術的には多対多** を許容する（relation を複数本張れば entry は
複数の folder に同時に属せる）。ただし v1 UI では **単一親を前提** とした breadcrumb を描画する。

**v1 の決定事項**:

- `getStructuralParent(relations, entries, lid)` は `relations` 配列を先頭から走査し、
  最初にヒットした `r.kind === 'structural' && r.to === lid` の `r.from` を返す。
  つまり **relations の格納順で最初に登場した structural parent が勝つ**。
- この挙動は v1 で **仕様として固定** する。signature 変更や breadcrumb 側での fan-out（Parent1 / Parent2 …）
  は v1 の scope 外。
- multi-parent による曖昧さを明示する UI（例: "n parents" badge）は v1 では提供しない。
  実データで multi-parent が頻出するなら v2 で再検討する。
- silent swallow にしないため、本仕様書でこの動作を明文化し、テストで
  "最初に見つかった structural parent を採用" を pin する。

実装上の注意:

- relation の格納順序は container JSON の array 順 + reducer による push/splice 順に依存する。
  reducer では structural relation の追加は常に push なので "最初に追加された親が最初に見える"
  という運用上の決定性は保たれる。
- multi-parent のケースを強制的に検出したい場合の hook として、
  `isDescendant` / `getAvailableFolders` など既存 helper が利用できる。breadcrumb 自身は depth 4 の
  単純遡行なので追加の循環検出は不要（`getBreadcrumb` の for ループが自己決定的に終わる）。

## 9. Readonly / manual sort compatibility

- `readonly: true` 時も breadcrumb は表示する。breadcrumb 自身は **navigation 専用** で mutation を起こさない
  ため、readonly モードと矛盾しない。
- manual sort (`sortKey: 'manual'`) 下でも breadcrumb は同じように描画する。`entry_order` は同階層内の並び
  替えのみを制御し、structural 親子関係（breadcrumb の元データ）には影響しない。
- import preview 中（`state.importPreview != null`）でも breadcrumb は表示する。preview 中は tree 側が
  プレビュー container を参照するが、detail view は **従来 container** を描画し続けるため breadcrumb の
  data source は普段通り。

## 10. Non-scope（v1 で扱わない）

以下は意図的に v1 から外した。導入判断は別チケットで行う。

- header (`titleRow`) 側への breadcrumb 移設、UI 位置の再設計
- calendar / kanban / graph view での breadcrumb 表示
- multi-parent を明示する UI（"n parents" badge、parent switcher、全親展開）
- semantic / categorical / temporal relation による path 計算（structural 以外）
- `…` truncation を展開する interactive UI（popover / tooltip に "省略祖先" を列挙）
- breadcrumb 固有の keyboard navigation（Tab / Enter でパンくず移動）
- i18n（root marker の "Root" 文字列はハードコード）

## 11. Related docs

- `recent-entries-pane-v1.md` — v1 の隣に位置する P1 pane。breadcrumb と併せて "位置把握" UX の
  軸を成す。
- `next-feature-prioritization-after-relations-wave.md` — 本仕様の発端（P2）。
- `folder-ux-hardening.md`（`Folder UX Hardening` describe ブロックが renderer.test.ts にある）—
  folder 選択時の `[data-pkc-region="create-context"]` 表示など、breadcrumb と混同しがちな UI の
  既存仕様。
- `connectedness-s3-v1.md` — multi-parent 取り扱いが将来拡張される場合の設計参照点。
