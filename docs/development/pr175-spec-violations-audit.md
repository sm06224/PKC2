# PR #175 — spec-violation + reorg audit (2026-04-27)

**Status**: audit (要 user 判断)
**Date**: 2026-04-27
**User direction**:
> 「ついでに仕様違反や再整理が必要なものが見つかった場合は私に修正を提案して」

PR #175 (docs-only sweep) を進める過程で見つかった **仕様違反 /
矛盾 / 再整理候補** を、user 判断を仰ぐべき項目として一覧化。
本 PR では **既存 doc / spec の追補と新規 doc 作成のみ** を行い、
ここに挙げた fix 候補は別 PR で個別に判断・適用する想定。

## 1. 完了済み修正 (本 PR で fold-in)

| 項目 | 旧文書 | 矛盾 | 本 PR の対応 |
|---|---|---|---|
| (1-A) `PURGE_TRASH` の auto-GC 採否 | `orphan-asset-auto-gc.md` §2.2 | 「`PURGE_TRASH` は asset 掃除しない」と明記、しかし PR #174 で `removeOrphanAssets` を同 reduction で呼ぶよう変更 | §2.1 表に第 4 経路として追加、§2.2 から `PURGE_TRASH` 行を削除 |
| (1-B) Search filter 軸の本数 | `search-filter-semantics-v1.md` §4 | 5 軸 (FullText/Type/Tag/Color/Categorical) と固定、しかし PR #174 で 3 つの list-shape lens (treeHide / searchHide / unrefOnly) を追加 | §9 を追補 (lens は別レイヤと明記、5 軸モデル自体は touched なし) |
| (1-C) Auto-folder placement の File 経路 | `archived/singletons/auto-folder-placement-for-generated-entries.md` | DnD / `📎 File` button が `parentFolder` route を使わない旧設計のまま | "File-attachment intake (PR #174 補追)" 章を追加 |

## 2. 要 user 判断 — 修正候補 (本 PR では未着手)

### 2-A) `data-pkc-mobile-page` と `data-pkc-has-selection` の併存

**現状**: PR #173 で `data-pkc-mobile-page` (3 値: list/detail/edit)
を導入。PR #172 から継承された `data-pkc-has-selection` (2 値:
true/false) も保持されている。

- iPhone push/pop CSS (`base.css` `pointer:coarse + max-width:640px`)
  は `data-pkc-mobile-page` を key にする
- iPad / 旧 PR #172 由来の master-detail CSS は `data-pkc-has-
  selection` を key にする
- 両方の attribute が同じ tag に共存する状態

**問題**: 「iPhone と iPad で routing key が違う」という非対称性
が undocumented。新規 contributor に「どちらを使うべきか」が
分からない。

**修正提案**:
- (a) 専用 doc `responsive-tier-routing-keys.md` を新規作成して
  「iPhone tier は mobile-page、tablet tier は has-selection、
  両方を root に並置する設計理由」を明記する
- (b) 中期的には `has-selection` を `mobile-page` に統合し
  (`detail`/`edit` ≡ true、`list` ≡ false)、tablet CSS も
  `mobile-page` を見るように rewrite する。本案は CSS が広範
  に touched されるので別 PR
- (c) 何もしない (現状の併存を accept)

**推奨**: (a) だけまず。後で (b) を別 wave で。

### 2-B) Saved-search に新トグル round-trip しない方針の明示

**現状**: `searchHideBuckets` / `treeHideBuckets` /
`unreferencedAttachmentsOnly` / `advancedFiltersOpen` は saved
search に round-trip しない (runtime-only)。これは spec doc
(`search-filter-semantics-v1.md` §9) で言及はしたが、
`saved-searches-v1.md` 側にも書くべきか。

**修正提案**:
- (a) `saved-searches-v1.md` の round-trip 表に「optional state
  field の round-trip 方針」を追記 — 「showArchived は round-trip
  する、本 PR で追加された 4 トグルは round-trip しない」と明記
- (b) いまは spec docs §9 への cross-ref のみ

**推奨**: (a)。saved-search を見たユーザーが「これも保存される
のか?」と疑問に思うはず。

### 2-C) `data-pkc-region="advanced-filters"` の `<details>` UI pattern

**現状**: `<details>` element を `data-pkc-region` で marker し、
summary に `data-pkc-action` を貼って AppState と同期する pattern
は **本 PR が初出**。Renderer / action-binder の責務分離には適合
しているが、native `<details>` の open toggle と
`TOGGLE_ADVANCED_FILTERS` dispatch が二重発火する (どちらも同じ
state を flip するので結果は idempotent)。

**問題**: 同じ pattern を将来 `<details>` に複数使うときに
copy-paste の elementary mistake (`open` 属性の付け忘れ etc) が
起きやすい。

**修正提案**:
- (a) ヘルパ `renderAppStateBoundDetails(stateOpen, action,
  summary, children)` を切り出して再利用しやすくする
- (b) `<details>` UI pattern doc を切って convention を明文化
- (c) いまは ad-hoc のままにする (使用箇所 1 つだけ)

**推奨**: (c)。使用箇所が増えるまで保留。

### 2-D) 古い PR #172 由来の test を deprecation 経路で削除した

**現状**: 本 PR (#174 のマージ準備中) で
`tests/smoke/responsive-master-detail.spec.ts` を削除した
(PR #173 の `iphone-push-pop.spec.ts` で superseded)。削除は
merge commit 内で行ったので diff には現れる。

**問題**: 削除した test が pin していた behavior contract の
うち、iPad portrait `data-pkc-has-selection` 系の master-detail
flow は現在 docs にしか記述されていない (test がない)。

**修正提案**:
- (a) iPad portrait 用の smoke test を別 PR で再作成、
  `data-pkc-has-selection` ベースで
- (b) `data-pkc-has-selection` 自体を deprecate する (上記 2-A
  (b) と同時に)
- (c) いまは何もしない (manual QA に依存)

**推奨**: (a) を別 PR で。iPad は実機 QA も将来必要。

### 2-E) `INDEX.md` の "Last updated" が累積する monolith

**現状**: `INDEX.md` の冒頭 "Last updated" 行が wave 単位で 1
段落づつ追加されていく形。本 PR で 7 段落に到達し、scroll が必要
な巨大 paragraph になっている。

**問題**:
- 検索性が悪い (`PR #173` で grep しても 2 段落 hit する)
- 読みにくい (1 段落 1500 字超え)
- 「最新は何か」が一目で分からない

**修正提案**:
- (a) 各 PR の summary を別ファイル `pr-summary-NNN.md` に切り出し
  て、INDEX.md は単に link 一覧 + tag-line のみに simplify
- (b) "Last updated (previous):" の段落を別 archive doc に折り
  畳む (`development/archived-last-updated-summaries.md` 等)
- (c) いまの monolithic 形式を継続

**推奨**: (a)。中期的には INDEX.md を本当に index としての役割
に戻す。本 PR では (c) のまま。

### 2-F) `responsive-master-detail.spec.ts` 削除の deprecation note

**現状**: 削除した smoke test 自体には「なぜ消えたか」の note
がない (削除なので)。

**修正提案**:
- (a) `tests/smoke/README.md` に「PR #174 で削除した test の log」
  を追記
- (b) `archived/pr-findings/iphone-push-pop-pr173-changelog.md` の Backwards-compatibility
  節に「削除した test と理由」を追記
- (c) commit message のみで足りるとする (現状)

**推奨**: (b)。changelog 側にあれば bisect で十分到達できる。

### 2-G) Old "Cleanup unused attachments" UI button (古い言及)

**現状**: `docs/development/completed/edit-preview-asset-resolution.md`
が「Clean up unused attachments」UI button への言及を含むが、現
時点で該当 button は存在しない。本 PR で追加した
`unreferenced-attachments-cleanup-v1.md` の workflow とは別の話。

**修正提案**:
- (a) 古い doc から該当言及を削除 or note 追記 (「PR #174 で
  workflow が刷新された、本 doc は historical reference」)
- (b) 触らない (completed doc は historical archive)

**推奨**: (a) の note 追記。grep で混乱しないために。

## 3. 完全に整理が必要な領域 (将来の wave 対象)

### 3-A) `data-pkc-action` vocabulary の網羅 doc

100 件以上の `data-pkc-action` 値が存在するが、一覧 doc がない。
新規 contributor が「既存に何があるか」を知るには grep するしか
ない。

**提案**: `docs/development/data-pkc-action-registry.md` を作る。
PR #176 候補。Auto-generate も視野 (script で grep + categorize)。

### 3-B) `state.viewMode` / `state.calendarYear` 等の runtime-only
state field の整理

PR #174 で追加した 4 optional field を含め、AppState に
runtime-only field がかなり積み重なってきた。`saved-searches`
round-trip 候補かどうかの判定基準を spec 化したい。

**提案**: `docs/spec/runtime-vs-persisted-state-policy.md` を作る。
PR #176+ 候補。

### 3-C) `data-pkc-region` の category convention

現在 `data-pkc-region="..."` は
- pane (sidebar / meta / center)
- toolbar (header)
- popover (color picker / shell menu)
- toggle (show-archived-toggle / tree-hide-buckets-toggle)
- list (recent-entries / restore-candidates)

など多様な目的に混在使用。命名 convention を統一すれば selector
の意図が明確化する。

**提案**: `docs/development/data-pkc-region-conventions.md`。
PR #176+ 候補。

## 4. まとめ

- **本 PR (#175) で完了**: 1-A / 1-B / 1-C の docs / spec 追補 +
  4 新規 feature spec + 1 changelog 分離 + INDEX 整理
- **要 user 判断 (本 PR では未着手)**: 2-A 〜 2-G の 7 件
- **将来 wave 候補**: 3-A 〜 3-C の 3 件

User 確認をいただきたい順番(優先度高い順):
1. 2-A (mobile-page と has-selection の併存) — routing 設計の
   一貫性
2. 2-B (saved-search round-trip 方針) — UX surprise を避ける
3. 2-G (古い doc の言及訂正) — 軽い、誤誘導防止
4. 残り (2-C 〜 2-F、3-A 〜 3-C) — 手の空いたとき
