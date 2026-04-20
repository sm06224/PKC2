# Orphan Detection UI v1

**Status**: implementation — 2026-04-20.
**Scope**: サイドバーで **relations-based orphan**（`container.relations[]` の `from` / `to` どちらにも含まれていない entry）を控えめに可視化。気づき用のシグナルのみ、操作は付けない。link-index / markdown-reference は**含めない**。

## 1. Explicit design answers

### Q1. 対応 entry 種別
**サイドバーに表示される user entry のみ**が判定対象。`getUserEntries()` 経由で system entry (`system-about` / `system-settings`) は既に sidebar から除外されているので、marker もそれら system にはつかない。

- `text` / `textlog` / `todo` / `form` / `attachment` / `folder` / `generic` / `opaque` すべて判定対象
- folder も特別扱いしない（下記 Q2 参照）

### Q2. folder の扱い
**特別扱いしない**。folder も relations-based orphan 判定に乗る:
- 子を持つ folder は "structural" relation が outbound として存在する → **非 orphan**
- 中身が空で親にも属していない folder は orphan 扱い → marker が出る（意味的にも "detached" なので正しい）

この判定は相対的に保守的（"自分が何らかの relation に参加しているか" だけを見る）で、folder 固有ルール（e.g. 子 entry 数）を持ち込まないのが分かりやすい。

### Q3. readonly / manual context
**同じ indicator を表示**。orphan marker は navigational / informational であって mutational ではない。readonly・lightSource・manual sort 下でも判定基準は不変、視覚も同じ。

### Q4. 視覚シグナル
**subtle な "○" marker (hollow circle)** を行末に小さく配置。
- 文字: `○` (U+25CB WHITE CIRCLE)
- 色: `var(--c-muted)` + 低 opacity（`0.6`）
- sibling: revision badge / backlink badge と同じ系列だが優先度は最も低い（右端近く）
- tooltip: `title="No relations yet"`
- 選択中行では既存 revision-badge 同様に `rgba(255,255,255,0.7)` へ切替

opacity で全体を dim する案は "disabled" と誤読される恐れがあり不採用。marker 追加のみにとどめる。

### Q5. 用語 — "orphan" は provisional か
**provisional**。以下の意味で限定的に使う:
- "No relations yet" = `container.relations[]` に参加していない
- link-index / markdown 参照による結びつきは**判定外**（link-index には出る peer がいても marker は出る）
- "orphan" 単独使用は避け、spec / コメント・commit では **"relations-based orphan"** と前置して誤解を防ぐ

将来 "orphan" の意味を拡張する場合（link-index も合算、あるいは folder 構造中心など）、別用語に改名する余地あり。

### Q6. click 挙動
**v1 は無し**。marker は表示のみ。行全体の `data-pkc-action="select-entry"` はそのまま有効なので、「orphan 行をクリック」は通常通り entry を選択する（特殊動作は追加しない）。

## 2. UX / 動作仕様

### 判定ロジック
```
connectedLids = Set(r.from for r in relations) ∪ Set(r.to for r in relations)
isOrphan(entry) = entry.lid ∉ connectedLids
```

pure helper として `src/features/relation/selector.ts` に追加:

```ts
export function buildConnectedLidSet(
  relations: readonly Relation[],
): Set<string>
```

一回構築して sidebar の全行で O(1) lookup。**complexity O(R + N)**（backlink count と同形）。

### DOM
orphan 行のみ:
```html
<li class="pkc-entry-item"
    data-pkc-action="select-entry"
    data-pkc-lid="<lid>"
    data-pkc-orphan="true">
  <span class="pkc-entry-title">...</span>
  <!-- 既存 badges（task / revision / backlink）は count がある時だけ -->
  <span class="pkc-orphan-marker"
        title="No relations yet"
        aria-hidden="true">○</span>
</li>
```

- `data-pkc-orphan="true"` を `<li>` 自体に付与（CSS フック / テスト selector 用）
- marker は `<span>`（インタラクションなし、`aria-hidden` で screen reader 読み上げを抑制、`title` のみ hover tooltip）

### 位置
行末、move button (↑/↓) より前。count 系 badge より後ろ。

## 3. 実装構成

| 層 | ファイル | 変更 |
|----|---------|------|
| features | `src/features/relation/selector.ts` | `buildConnectedLidSet` 追加 |
| adapter/ui | `src/adapter/ui/renderer.ts` | `renderSidebar` で set を 1 回 build + `renderEntryItem` / `renderTreeNode` へ threading + orphan marker render |
| styles | `src/styles/base.css` | `.pkc-orphan-marker` 追加 |
| tests | `tests/features/relation/selector.test.ts` | `buildConnectedLidSet` テスト |
| tests | `tests/adapter/renderer.test.ts` | marker の出現 / 非出現 / selected 切替 |
| docs | 本文書 | spec |

**既存データスキーマ / reducer / action すべて不変**。adapter と features への追加のみ。

## 4. 件数 / 性能
- `buildConnectedLidSet`: 1 pass over `relations`, O(R)
- per-row lookup: `set.has(lid)`, O(1)
- 合計 sidebar render: O(R + N)、backlink count badge と同スケール

## 5. Terminology（厳密）

| 用語 | 意味 | 位置づけ |
|------|------|----------|
| **relations-based orphan** | `container.relations[]` に参加しない entry | **本 PR の判定対象**、暫定 |
| **link-index orphan**（理論上） | markdown 参照での結びつきも持たない entry | **本 PR は検出しない** |
| **"No relations yet"** | marker の tooltip / spec 文言 | 機械的でない自然語、関係ゼロを明示 |
| `.pkc-orphan-marker` / `data-pkc-orphan="true"` | CSS + DOM hook | 暫定名、将来 rename 余地 |
| link-index / markdown-reference backlinks | **本 PR は触らない** | 用語分離を維持 |

"orphan" の語は本 PR 内で **必ず "relations-based"** を前置する。将来 link-index 側も orphan 判定に含める場合は別用語（"fully orphan" / "unreferenced" など）で区別する前提。

## 6. 非スコープ（v2+ 候補）

- **orphan 一覧パネル** / フィルタ UI（「orphan だけ表示」「orphan だけ一括削除」等）
- **link-index を含む合算 orphan 判定**
- **folder 固有の判定**（空フォルダ除外等）
- **orphan marker クリックで "関連を作成" ダイアログを開く**
- **graph visualization との統合**（意図的に defer、backlink-badge-jump-v1 §6 参照）

## 7. Rollback / 互換性

- DOM 追加のみ（`data-pkc-orphan` 属性 + `<span class="pkc-orphan-marker">`）、既存 selector と非衝突
- 既存テストは影響を受けない（orphan が出る条件に該当する既存テストは mockContainer に relations なしのもののみ、追加の assertion が必要なら個別対応）
- `git revert` で完全復元可能

## 8. 関連文書

- `docs/development/backlinks-panel-v1.md` — "relations-based backlinks" 用語確立
- `docs/development/sidebar-backlink-badge-v1.md` — 同シリーズ（O(R + N) index pattern）
- `docs/development/backlink-badge-jump-v1.md` §6 — graph deferral policy（本 PR でも継承）
- `src/features/relation/selector.ts` — `buildInboundCountMap` と並ぶ pure helper
