# Sidebar Backlink Count Badge v1

**Status**: implementation — 2026-04-20.
**Scope**: サイドバーの各 entry 行に、その entry を指す **relations-based inbound relation** の件数を小さく表示する。既存の revision-badge と同型の軽量バッジ。0 件の時は表示しない。

## 1. Terminology（厳密）

本 PR のバッジは **"relations-based backlink count"** を表示するもので、**link-index / markdown-reference backlinks ではない**。PR #53 で確立した用語を維持する。

| 用語 | 意味 | 本 PR での扱い |
|------|------|---------------|
| **relations-based backlinks** | `container.relations[]` で当該 entry を `to` に持つ peer 一覧 | **本 PR の集計対象** |
| **link-index / markdown-reference backlinks** | markdown 本文から抽出した `entry:<lid>` 参照 | **本 PR は触らない** |
| **backlink count badge** | 本 PR の UI 要素の機能名 | **暫定**。将来 unified backlinks に進む場合は改名候補 |
| **"incoming relation"** | 視覚的ラベル / tooltip で用いる自然語 | 曖昧回避のため "backlink" 単独表記は UI で避ける |

doc / コメント / 将来のコード内では **必ず "relations-based"** を前置して曖昧さを防ぐ。ユーザー向け tooltip は `"N incoming relation(s)"` の形で「relations にひもづく」ことを暗示する表記を採用。

## 2. UX 仕様

### 位置
各 sidebar 行 (`<li class="pkc-entry-item">`) の既存要素の後、`pkc-revision-badge` と並ぶ右寄せ位置:

```
[📝 Title    [x]  Archived  N/M  r3  ←2  ↑ ↓]
                                      ^^^^
                                      new
```

- todo status badge / archived badge / task progress / revision badge がある場合はそれらの後ろ
- manual sort の move button（↑/↓）よりは前

### 表示ルール
- **count === 0** → バッジ自体を render しない（DOM に何も追加しない）
- **count > 0** → `<span class="pkc-backlink-badge" data-pkc-backlink-count="N" title="N incoming relation(s)">←N</span>`
- 表記: `←N` (unicode 左向き矢印 + 数字). 矢印は "from other entries へ → 今の entry" の意を直感的に示す
- tooltip: `"N incoming relation(s)"` で "relations" ワードを含め曖昧回避

### 視覚スタイル
既存 `pkc-revision-badge` と同じトーン:
- `font-size: 0.6rem;`
- `color: var(--c-muted);`
- 選択中行 (`[data-pkc-selected="true"]` の子孫) では `rgba(255,255,255,0.7)` に切替
- `white-space: nowrap;`

### インタラクション
**v1 はクリック挙動なし**。バッジは純粋な表示要素。将来的に "backlinks ジャンプ" を付ける余地はあるが、v1 ではスコープ外。

## 3. 件数計算方式

### pure helper（新規）
`src/features/relation/selector.ts` に追加:

```ts
/**
 * Build a `Map<targetLid, inboundCount>` index in one pass over the
 * relations array. Used by the renderer to display per-entry
 * "relations-based backlink count" badges without repeated O(n) scans.
 *
 * Complexity: O(R) where R = relations.length.
 *
 * Notes:
 * - Counts ALL inbound relations regardless of kind (semantic,
 *   structural, categorical, temporal, provenance). Kind filtering is
 *   not a v1 requirement.
 * - A relation with `to === from` (self-loop) is counted once on that
 *   entry (theoretically possible but not produced by current flows).
 * - Dangling relations (to an entry that no longer exists) still
 *   appear in the map; callers looking up by existing lids are
 *   unaffected.
 */
export function buildInboundCountMap(
  relations: readonly Relation[],
): Map<string, number>;
```

### 呼び出し箇所
`renderer.ts:renderSidebar()` で **1 render あたり 1 回** 計算:

```ts
const backlinkCounts = buildInboundCountMap(state.container?.relations ?? []);
```

生成された `Map` を `renderEntryItem` に optional 3rd arg として注入し、各行は `backlinkCounts.get(entry.lid) ?? 0` で O(1) lookup。

### 複雑度
- build: O(R)
- render per row: O(1)
- 旧来の naive 実装 (`getRelationsForEntry` を各行で呼ぶ) なら O(N×R) だが、本 PR は前段の 1 回 build で O(N+R) に抑える

### Map 生成コストの位置
`renderSidebar` 内、entries 配列の作成と同じタイミング (tree / filter 切替の前) で計算。ツリーモード / フィルタモード両方に同じ map を流用する。

## 4. 実装構成

| 層 | ファイル | 変更 |
|----|---------|------|
| features | `src/features/relation/selector.ts` | `buildInboundCountMap` 追加 |
| adapter/ui | `src/adapter/ui/renderer.ts` | `renderSidebar` で map を 1 回 build + `renderEntryItem` / `renderTreeNode` に threading + badge 要素 render |
| styles | `src/styles/base.css` | `.pkc-backlink-badge` スタイル（revision-badge と同系） |
| tests | `tests/features/relation/selector.test.ts` | `buildInboundCountMap` のテスト追加 |
| tests | `tests/adapter/renderer.test.ts` | sidebar row に badge が出る / 出ないケースの確認 |
| docs | `docs/development/sidebar-backlink-badge-v1.md` | 本 spec |

## 5. テスト観点

### pure helper
- `buildInboundCountMap([])` → 空 Map
- 1 relation → `to` の lid が 1 で入る
- 複数 relation が同一 `to` → 件数が合算される
- 異なる kind 混在 → 全て合算（kind 区別なし）
- self-loop (`from === to`) → 1 件として数える
- 存在しない lid への relation（dangling）も Map に入る（無害）
- 返却 Map が mutable でも OK（caller は読み取り専用使用）

### renderer
- relations が空のコンテナ → 全ての sidebar 行でバッジ未表示
- relations に `{from: e1, to: e2}` がある → `e2` 行にバッジ表示、`e1` 行には非表示
- バッジの textContent が `←{N}` 形式
- バッジの `data-pkc-backlink-count` attribute が数値
- バッジの `title` attribute が "N incoming relation(s)"
- tree モード / filter モード両方で同じように表示される

## 6. 非スコープ（v2+ 候補）

> **📌 As of 2026-04-21（historical overlay）**: 当時の v2+ 候補のうち **クリック ジャンプは LANDED**。他は現状 active candidate ではない。
>
> - バッジクリック → relations section scroll — **LANDED** (`backlink-badge-jump-v1.md`)
> - kind 別の色分け — **DEFERRED**
> - link-index 件数との合算表示 — **採用しない**（`unified-backlinks-v1.md` §5-6 / `unified-backlinks-v0-draft.md §2` で意味論的合算は禁止、References umbrella で視覚的分離のみ実現）
> - バッジ on/off 設定 — **DEFERRED**

- バッジクリックで backlinks panel へフォーカス / ジャンプ
- kind 別の色分け (semantic / categorical 等)
- link-index backlinks の件数との合算表示（"unified backlinks" の一部）
- 設定でバッジのオン/オフ切替

## 7. 互換性 / Rollback

- 既存 DOM / data attribute を変更しない（追加のみ）
- データスキーマ無変更
- 新規 CSS クラス / span が加わるだけ、既存 selector / 既存 test には影響しない
- `git revert` で v1.5 状態に戻せる

## 8. 関連文書

- `docs/development/backlinks-panel-v1.md` — "relations-based backlinks" の用語確立元
- `docs/development/archived/entry-autocomplete/entry-autocomplete-v1.md` 〜 `entry-autocomplete-v1.5-modifier-enter.md` — authoring loop 側
- `src/features/relation/selector.ts` — 既存 `getRelationsForEntry` / `resolveRelations` と整合
