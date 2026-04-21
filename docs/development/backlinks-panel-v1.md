# Backlinks Panel v1 — spec + dev note

**Status**: implementation — 2026-04-19.
**Scope**: Detail view の meta pane にある既存 "Relations" セクションを、**"Outgoing relations" / "Backlinks"** の対で見せ直す。常時表示 + empty state 追加。

## 1. 前提: PKC2 には backlink 概念が 2 種類ある

| 系統 | データソース | 現 UI 位置 | v1 で触るか |
|------|-------------|-----------|-----------|
| **relations ベース** | `container.relations[]`（構造化、5 kind） | meta pane "Relations" セクション (`renderer.ts:3077-3095`) | **対象**（本 PR） |
| **markdown entry-link ベース** | `buildLinkIndex(container)`（body から `entry:lid` 抽出） | meta pane "Link-Index" セクション (`renderer.ts:3164-3198`) | **非変更**（独立のまま） |

両者は意味が異なるため統合しない:
- relations は semantic / categorical / structural / temporal / provenance の **意味論を持った** 構造参照
- link-index は本文内 markdown link の **機械抽出** 結果（kind なし）

"Unified backlinks" は将来候補 (v2+)。v1 は **relations ベースの可視性改善のみ**。

## 2. v1 で変えること / 変えないこと

### 変える
- 既存 Relations セクションの group ラベル
  - `Outbound` → **`Outgoing relations`**
  - `Inbound` → **`Backlinks`**
- 両 group の `data-pkc-relation-direction` 値も対応更新
  - `outbound` → `outgoing`
  - `inbound` → `backlinks`
- **Relations セクションを常時表示**（relations が 0 件でもレンダー）
- 0 件時の group 内に compact empty state を表示
  - `Outgoing relations (0)` + `"No outgoing relations."`
  - `Backlinks (0)` + `"No backlinks."`
- relation kind badge は維持（relations ベース backlink の強みは意味論）

### 変えない
- `container.relations[]` データスキーマ
- `getRelationsForEntry` / `resolveRelations`（`features/relation/selector.ts`）
- navigate 導線（`data-pkc-action="select-entry"` + `data-pkc-lid`）
- Link-Index セクション（"Outgoing links" / "Backlinks" / "Broken links"）
- relation 作成フォーム（`renderRelationCreateForm`）

## 3. DOM 仕様 (v1)

```
<div class="pkc-relations" data-pkc-region="relations">
  <div class="pkc-relation-group" data-pkc-relation-direction="outgoing">
    <div class="pkc-relation-heading">Outgoing relations (N)</div>
    <!-- N === 0 -->
    <div class="pkc-relation-empty">No outgoing relations.</div>
    <!-- N > 0 -->
    <ul class="pkc-relation-list">
      <li class="pkc-relation-item" data-pkc-relation-id="...">
        <span class="pkc-relation-peer" data-pkc-action="select-entry" data-pkc-lid="...">Peer Title</span>
        <span class="pkc-relation-kind">semantic</span>
      </li>
    </ul>
  </div>
  <div class="pkc-relation-group" data-pkc-relation-direction="backlinks">
    ...（empty または list。Outgoing と同形）
  </div>
</div>
```

## 4. "Backlinks" の定義（v1）

- 選択中 entry を `to` に持つ `Relation` を inbound とみなし、**peer (from 側の Entry) の一覧を "Backlinks" として表示**する。
- kind の種別で絞り込みは行わない（5 kind すべて対象）。kind badge で区別は可能。
- `from` / `to` に対応する Entry が削除済み等で解決できない relation は `resolveRelations` の現動作に従い **peer 未解決のため表示対象外**（v1 はこの挙動を引き継ぐ）。

## 5. 実装範囲（ファイル単位）

| ファイル | 変更 |
|---------|------|
| `src/adapter/ui/renderer.ts` | Relations セクションを常時表示化 + `renderRelationGroup` が empty state と direction key を受ける |
| `tests/adapter/renderer.test.ts` | 既存 relation tests の direction key / label 更新 + empty state テスト追加 |
| `tests/adapter/mutation-shell.test.ts` | コメント "Outbound" → "Outgoing relations"（文字列参照なし、コメントのみ） |
| `docs/development/backlinks-panel-v1.md` | 本 spec doc |

実装コード量は renderer 側 ~15 行差、テスト ~20 行差程度の見込み。**core / features 層は無変更**（既存 selector ヘルパで十分）。

## 6. テスト観点

| 観点 | 期待 |
|------|------|
| inbound relation があると `data-pkc-relation-direction="backlinks"` group 内に list が出る | ✅ |
| outbound relation があると `data-pkc-relation-direction="outgoing"` group 内に list が出る | ✅ |
| relations 0 件でも `[data-pkc-region="relations"]` が存在し、両 group の empty state が見える | ✅ |
| `data-pkc-action="select-entry"` と `data-pkc-lid` は維持されている | ✅ |
| relation kind badge (`.pkc-relation-kind`) は維持されている | ✅ |
| link-index セクション（`[data-pkc-region="link-index"]`）は本変更の影響を受けない | ✅ |

## 7. 5 層影響 / 互換性

- **5 層**: 影響なし（renderer.ts + test のみ、core/features 不変）
- **データ互換**: `container.relations[]` スキーマ不変、既存エクスポートデータはそのまま読める
- **runtime**: relation 作成フォームは維持、キーボード挙動・既存 action dispatch 不変

## 8. 非スコープ (v2+ 候補)

> **📌 As of 2026-04-21（historical overlay）**: 下記の当時 v2+ 候補のうち **5 件が LANDED** 済み。現在 active candidate ではなくなった項目は各行に status を上書き。
>
> - relation kind によるフィルタ UI — **DEFERRED**（relation-kind-edit UI は着地済、kind 別 *filter* は未実装）
> - orphan 一括検出 — **ADDRESSED**（`orphan-detection-ui-v1.md` + `unified-orphan-detection-v3-contract.md` + `connectedness-s3-v1.md` / `s4-v1.md`。S5 filter 部分のみ Defer）
> - relations + link-index 合流 Unified Backlinks — **ADDRESSED**（`unified-backlinks-v1.md` References umbrella として landed。ただし意味論的な合算は意図的に不採用）
> - relation クリックでの hover preview — **DEFERRED**
> - 選択 entry への backlink 件数 sidebar badge — **LANDED** (`sidebar-backlink-badge-v1.md` + `backlink-badge-jump-v1.md`)
> - relation の削除 UI — **LANDED** (`relation-delete-ui-v1.md`)

- relation kind によるフィルタ UI
- orphan (backlink 0 件 + outgoing 0 件) 一括検出
- relations + link-index を合流した Unified Backlinks
- relation クリックでの hover preview
- 選択 entry への backlink 件数をサイドバー list に badge 表示
- relation の削除 UI（現状は作成のみ）

## 9. ロールバック

本 PR は renderer.ts の UI 文字列 / direction キー / 常時表示化 + test 更新のみ。`git revert` で復元可能。データモデル・外部 API 影響ゼロ。
