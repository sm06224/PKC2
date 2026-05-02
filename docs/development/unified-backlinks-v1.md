# Unified Backlinks v1 — Implementation (References umbrella, Option E)

**Status**: implementation — 2026-04-20.
**Scope**: Meta pane に **"References" という umbrella section** を 1 つ導入し、既存の relations sub-panel と link-index sub-panel を内部に縦積みする。用語上の曖昧さ（2 箇所にある `"Backlinks (N)"` 見出し）は umbrella で視覚的に分離されるが、**意味論的な統合（件数合算 / 統一削除 UI / kind 合算）は一切行わない**。
**Baseline**: `docs/development/unified-backlinks-v0-draft.md` §4.5 Option E / §6.2 v1 実装計画に準拠。

---

## 1. 実装方針 — Option E minimum-viable

v0 draft が v1 に要求した最小セット:
- `<section class="pkc-references" data-pkc-region="references">` 外枠を追加
- 見出し `"References"` を 1 つだけ
- 内部は既存 `pkc-relations` + `pkc-link-index` をそのまま（DOM 非破壊）
- サマリ行は **v1 では入れない**
- CSS 追加のみ、既存 region attribute は完全維持

本 PR でこの 5 条件すべてを満たしている。

## 2. DOM / heading 構成

```html
<section class="pkc-references" data-pkc-region="references">
  <div class="pkc-references-heading">References</div>

  <!-- Sub-panel 1: first-class relations（既存 region id 保持） -->
  <div class="pkc-relations" data-pkc-region="relations">
    <div data-pkc-relation-direction="outgoing"> ... Outgoing relations (N) ... </div>
    <div data-pkc-relation-direction="backlinks"> ... Backlinks (N) ... </div>
  </div>

  <!-- Sub-panel 2: markdown reference（既存 region id 保持） -->
  <div class="pkc-link-index" data-pkc-region="link-index">
    <div data-pkc-region="link-index-outgoing"> Outgoing links (N) </div>
    <div data-pkc-region="link-index-backlinks"> Backlinks (N) </div>
    <div data-pkc-region="link-index-broken"> Broken links (N) </div>
  </div>
</section>
```

- **外枠**: `<section>` tag + class `pkc-references` + `data-pkc-region="references"`
- **Heading**: `<div class="pkc-references-heading">References</div>`（1 つだけ、英語 "References"）
- **Sub-panel 1**: 既存 `pkc-relations` を **一切加工せず**そのまま配置（内部の `Outgoing relations (N)` / `Backlinks (N)` 見出し・delete UI・kind badge は不変）
- **Sub-panel 2**: 既存 `pkc-link-index` を同じく無改変で配置（`Outgoing links` / `Backlinks` / `Broken links` 3 分割も不変）

## 3. Render 順序の変化

| 位置 | v1 以前 | v1 |
|------|---------|-----|
| revisions picker | ✔ | ✔（不変）|
| Relations section | 単独 | **References umbrella 内 sub-panel 1** |
| Relation-create form | relations の直後 | **References umbrella の外、直後**（creation は viewing と分離）|
| Sandbox control（attachment / HTML・SVG 時のみ）| relations と link-index の間 | **References umbrella の後**（archetype-specific, 分離維持）|
| Link-index sections | meta pane 最後 | **References umbrella 内 sub-panel 2** |

link-index が sandbox section より前に出る点だけが実質的な並び替え。元の `data-pkc-region` は **すべて保持** されているので既存の selector は動く。

## 4. 維持した既存挙動

- **Relations 挙動**:
  - `Outgoing relations (N)` / `Backlinks (N)` 見出しと件数表示 — 不変
  - `pkc-relation-peer` / `pkc-relation-kind` / `pkc-relation-delete` — 不変
  - `CREATE_RELATION` / `DELETE_RELATION` フロー — 不変
  - `data-pkc-region="relations"` attribute — 維持（sidebar badge scroll target, `action-binder.ts:672` の `scrollIntoView` 対象）
- **Link-index 挙動**:
  - `Outgoing links` / `Backlinks` / `Broken links` の 3 分割 — 不変
  - `data-pkc-region="link-index"` / `link-index-outgoing` / `link-index-backlinks` / `link-index-broken` — すべて維持
  - markdown reference の作成・削除操作ポリシ（body 編集で反映） — 不変
- **Relation create form**: DOM 位置は References umbrella の**外**（直後）。既存の `[data-pkc-region="relation-create"]` selector は変更なし
- **Sandbox control**: 並び順のみ umbrella の後ろへ移動。`[data-pkc-region="sandbox-control"]` 等の selector は不変

## 5. 用語整理

v0 draft §2 で固定した terminology を v1 実装でも踏襲:

- **"References"**: umbrella 語。新規導入。UI 文言として 1 箇所（heading）のみ使用
- **"Backlinks (N)"**: 2 箇所あるが umbrella で視覚的に分離済。単独語としての曖昧さは許容（spec 上は "relations-based" / "link-index" を常に前置するルールを継続）
- **`pkc-backlink-*` CSS class**: sidebar badge / orphan marker のみで使用、**relations-based 専用**（link-index には付けない、v0 §2.4 準拠）
- **"relations-based backlinks"** / **"link-index backlinks"** / **"markdown-reference backlinks"**: doc / commit message / コメント内での前置修飾は今後も必須

## 6. 非スコープ（v2+）

v0 draft §6.3 / §7 の defer policy を継承:
- **サマリ行** `"Relations: N  |  Markdown refs: M  |  Broken: K"` — v2 候補
- **Tab 切替 UI** — v2+ でも不採用（用語リスクのため）
- **件数合算で "N backlinks" 単独表示** — 採用しない
- **削除 UI の統合**（markdown reference への削除ボタン追加等）— 採用しない
- **orphan 判定の統合**（relations + markdown 合算）— 別 draft を要する（v3+）
- **graph visualization** — 継続的に defer

## 7. 実装量

| ファイル | 変更 |
|----------|------|
| `src/adapter/ui/renderer.ts` | relations section 構築コードの直後に References umbrella を build、`buildLinkIndex` 呼び出しと `renderLinkIndexSections` 描画を umbrella 内部に移動。合計約 +18 行 / -5 行 |
| `src/styles/base.css` | `.pkc-references` / `.pkc-references-heading` / `.pkc-references .pkc-relations` の 3 規則、計 +22 行 |
| `tests/adapter/renderer.test.ts` | +4 test: umbrella が 1 つ存在する / 中に両 sub-panel がある / 未選択時は出ない / 両 "Backlinks" 見出しが併存する |
| `dist/bundle.{js,css}` / `dist/pkc2.html` / `PKC2-Extensions/pkc2-manual.html` | build artifact 更新 |

## 8. 後続 PR 候補

> **📌 As of 2026-04-21（historical overlay）**: 3 件とも **LANDED**。
>
> 1. Relation kind 編集 UI — **LANDED** (`relation-kind-edit-v1.md`)
> 2. References summary row (v2) — **LANDED** (`references-summary-row-v2.md` + clickable 化は `references-summary-clickable-v3.md`)
> 3. Unified orphan detection (v3+) — **LANDED** (`unified-orphan-detection-v3-contract.md` + `connectedness-s3-v1.md` + `connectedness-s4-v1.md`。S5 optional filter のみ Defer)

v0 draft §6.5 の順序方針を踏襲:
1. **Relation kind 編集 UI**: 既存 relation の kind を後から変更する UI。References umbrella 下の `pkc-relations` sub-panel の行レベルで実装想定
2. **References summary row (v2)**: umbrella heading 直下に `"Relations: N  |  Markdown refs: M  |  Broken: K"` を追加
3. **Unified orphan detection**（v3+）: markdown reference を含む合算 orphan 判定の別 draft

## 9. 関連文書

- `docs/development/unified-backlinks-v0-draft.md` — v0 draft（本 PR の直接の根拠）
- `docs/development/backlinks-panel-v1.md` — relations-based backlinks の確立
- `docs/development/sidebar-backlink-badge-v1.md` — sidebar count badge（relations-based）
- `docs/development/backlink-badge-jump-v1.md` — badge click → scroll-to-region、graph defer
- `docs/development/orphan-detection-ui-v1.md` — relations-based orphan
- `docs/development/archived/v1-audits/link-index-v1-audit.md` — link-index sections（markdown-reference）
- `src/adapter/ui/renderer.ts` — References umbrella 実装本体
- `src/styles/base.css` — umbrella CSS
