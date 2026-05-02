# PR #174 — 2026-04-27 follow-up wave changelog

Branch: `claude/pkc2-2026-04-27-followup` → `claude/feat-iphone-push-pop` (stacked) → `main`
Started: 2026-04-27 (post PR #173 close-out)
Status: open

This document tracks the cumulative changes that landed under PR #174,
covering the touch / cleanup / focus-mode follow-ups the user reported
in rapid succession after PR #173 was opened. Each section ends with
the commit SHA so a future bisect lands on the right change.

PR #173 (iPhone push/pop wave) は `archived/pr-findings/iphone-push-pop-pr173-changelog.md`
で closes-out 済み。本 doc はその後の「2026-04-27 wave」のみを扱う。

## 1. Touch input / popup affordances

| commit | summary |
|---|---|
| `b615fa5` (cherry-pick of `77a8a2b`) | hard-disable shell-menu eyedropper close on `pointer:coarse` (mousedown pairing では touch で取りこぼしが続いていたため、touch では overlay-click-close を完全に殺す) + iPad ダブルタップ entry-window に ✕ Close button (PWA / standalone-mode で OS の close affordance がない時用) |

**eyedropper 修正の subtle ポイント**: 当初は overlay の mousedown +
click 両方が overlay の場合のみ close するペアリング (PR #173 内
`7b8f032`) を入れていたが、iOS Safari は OS-level color picker の
dismissal 中に overlay 上で **synthetic mousedown** を発火するため、
mousedown フラグが truthy のまま click も到達して menu が消えてしまう。
Touch device では overlay-click-close 自体を無効化し、X button /
Escape (soft keyboard return) で閉じる路に揃えた。

## 2. Atomic ASSETS routing + searchHideBuckets default

| commit | summary |
|---|---|
| `dfdb43d` (cherry-pick of `a8a28e3`) | `processFileAttachmentWithDedupe` を refactor: `parentFolder` + `ensureSubfolder` を CREATE_ENTRY に直接渡す atomic placement に。DnD sidebar / center drop zone + 上部 `📎 File` button の 3 surface 全てが ASSETS バケットを自動生成。+ optional `searchHideBuckets` (default true) state field + `TOGGLE_SEARCH_HIDE_BUCKETS` action — 検索結果から ASSETS / TODOS 直下のエントリを既定で除外、フィルタ active 時に「Show ASSETS / TODOS contents」トグルで戻せる |

詳細: `./archived/singletons/auto-folder-placement-for-generated-entries.md` の
"File-attachment intake (PR #174 補追)" 章。

## 3. Focus mode 復活 + Copy link 移設

| commit | summary |
|---|---|
| `1cd7f63` (cherry-pick of `97ddcaf`) | Ctrl+Alt+\\ focus mode 復活 (Slice 6 single-pane handler が `altKey` を見ずに先食いしていた回帰) + ヘッダーに `▣` button (touch + マウス両対応) + センターペイン archetype badge を Copy link に置換 (右下 bar-info と内容重複していた) + More… 内 Copy link mirror 削除 (title-row が常時可視なので不要) — meta-pane の Copy link は据え置き |

詳細: `./archived/singletons/focus-mode-v1.md`。

## 4. Docs (cumulative changelog for PR #173)

| commit | summary |
|---|---|
| `dcc28c7` (cherry-pick of `7e1de4c`) | PR #173 changelog に §5.5 を追記する形で 2026-04-27 wave を記録した「中間 docs」コミット — 後段で本 PR を切り出す決定により、本 docs は本 PR (#174) に同梱される結果になった |

## 5. Sidebar click no auto-scroll

| commit | summary |
|---|---|
| `0a472bf` (cherry-pick of `03bdf0a`) | sidebar click 時の auto-scroll 抑制 — action-binder 側で sidebar 内 click 由来の `SELECT_ENTRY` 時に `data-pkc-last-scrolled-lid` を pre-write し、renderer の `scrollSelectedSidebarNodeIntoView` を short-circuit。breadcrumb / recent / calendar / kanban / search-result からの jump は従来通り auto-scroll が効く |

詳細: `./archived/singletons/sidebar-click-no-autoscroll-v1.md`。

## 6. Empty-trash + unused-attachment cleanup

| commit | summary |
|---|---|
| `1cf43cc` (cherry-pick of `6200dee`) | `PURGE_TRASH` reducer が `removeOrphanAssets` を同 reduction で呼ぶように変更、`ORPHAN_ASSETS_PURGED { count }` イベントを `TRASH_PURGED` と並べて発行 — soft-deleted attachment の bytes は trash 復元路が消えた瞬間に永久に取り出せなくなるため + sidebar に「Show only unused attachments」フィルタ追加 (`collectUnreferencedAttachmentLids` pure helper / `unreferencedAttachmentsOnly` state / `TOGGLE_UNREFERENCED_ATTACHMENTS_FILTER` action) |

詳細: `./orphan-asset-auto-gc.md` §2.1 (PR #174 で 4 経路目に追加) +
`./unreferenced-attachments-cleanup-v1.md`。

## 7. Tree-hide-buckets + advanced-filters disclosure

| commit | summary |
|---|---|
| `6538070` (cherry-pick of `b663213`) | `treeHideBuckets` (default true) + `TOGGLE_TREE_HIDE_BUCKETS` action — ASSETS / TODOS バケットフォルダ自体 + 配下を tree から非表示 (folder すらも hide) + `advancedFiltersOpen` (default false) + `TOGGLE_ADVANCED_FILTERS` — 4 つの list-shape トグルを `<details data-pkc-region="advanced-filters">` の中に集約、default 折り畳み |

詳細: `./tree-hide-buckets-and-advanced-filters-v1.md` +
`../spec/search-filter-semantics-v1.md` §9。

## 8. Conflict resolution + dist rebuild

| commit | summary |
|---|---|
| `1cff690` | PR #173 branch を `d08df9a` に reset + main マージ + dist rebuild (PR #173 の最終コミット — 本 PR は base にする) |
| `6b751a8` | 本 PR の dist rebuild (cherry-pick 後の合成 dist) |

## 9. Bundle budget & test counts

| boundary | size at PR #173 close | size at PR #174 close | budget | utilisation |
|---|---|---|---|---|
| `dist/bundle.js` | 718.48 KB | 724.04 KB | 1536 KB | 47.1 % |
| `dist/bundle.css` | 103.34 KB | 103.96 KB | 112 KB | 92.8 % |

5854 / 5854 unit + 11 / 11 smoke pass at HEAD (`6b751a8`).

## 10. Backwards-compatibility

- `data-pkc-action` vocabulary は **additive**:
  `toggle-focus-mode`, `toggle-tree-hide-buckets`,
  `toggle-search-hide-buckets`, `toggle-unreferenced-attachments`,
  `toggle-advanced-filters`, `copy-entry-permalink` (title row mirror)
  はすべて新規。既存値不変。
- 全 state field optional with default-handle at use sites
  (`searchHideBuckets`, `unreferencedAttachmentsOnly`,
  `treeHideBuckets`, `advancedFiltersOpen`)。
  既存の inline state literals (renderer.test.ts 等) は touched 不要。
- Saved searches 不変 (新トグルは round-trip しない、runtime-only)。
- `processFileAttachmentWithDedupe` の改修は internal — 入出力契約
  (FileList → 1 attachment entry per file) は不変、placement の
  原子性だけが変わった。
- `PURGE_TRASH` event は **後方互換**: 既存の `TRASH_PURGED` は
  従来通り発火、`ORPHAN_ASSETS_PURGED` は **追加** (orphan が
  実際に sweep されたときのみ)。subscriber が前者のみを listen
  していても影響なし。
- 既存のテスト fixture / inline state literal は touched 不要。
  ただし `tests/adapter/search-hide-buckets.test.ts` の 2 件は
  default-true 化に合わせて update。

## 11. Spec / 仕様違反 audit (PR #175 で fold-in)

PR #175 (docs-only sweep) で見つかった spec / docs 上の整合性
問題:

1. `orphan-asset-auto-gc.md` 旧版が「`PURGE_TRASH` は asset 掃除
   しない」と明記していた条 — 本 PR で挙動を変えたため、PR #175
   の同 doc 更新で §2.1/§2.2 を矛盾なくする (PR #175 で完了)。
2. `search-filter-semantics-v1.md` 旧版に bucket-hide / unreferenced
   軸の記述なし — PR #175 で §9 追補 (完了)。
3. `tree-hide-buckets-and-advanced-filters-v1.md` /
   `unreferenced-attachments-cleanup-v1.md` /
   `archived/singletons/focus-mode-v1.md` /
   `archived/singletons/sidebar-click-no-autoscroll-v1.md` — 新規作成 (PR #175 で完了)。

詳細は PR #175 / `docs/development/pr175-spec-violations-audit.md`
を参照。
