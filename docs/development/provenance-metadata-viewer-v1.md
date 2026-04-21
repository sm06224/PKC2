# Provenance Metadata Viewer v1 — Implementation

**Status**: implementation — 2026-04-20.
**Scope**: `pkc-relations` sub-panel の **provenance 行にだけ** read-only な metadata 閲覧アフォーダンスを追加する。provenance relation は引き続き**編集不可**（kind 変更 / 削除 / 作成 すべて拒否）の契約を維持し、本 PR は「編集しない」方針のまま "metadata を読む" 機能だけを足す。
**Baseline**: `docs/development/relation-kind-edit-v1.md`（provenance 二重ガード）、`docs/spec/provenance-relation-profile.md`（metadata v1 profile）、`docs/development/references-summary-row-v2.md` §11「後続 PR 候補 #2」に記載された task を消化。

---

## 1. 設計原則

v1 に含めるもの:
- 対象は **`Relation.kind === 'provenance'` の行のみ**。他 kind の行は一切変更しない
- 表示は **purely read-only**。値の編集 / 作成 / 削除の UI を持たない
- 折り畳み default（collapsed）、小さな `ⓘ` 1 文字で affordance を最小化
- readonly / manual / light-source どのコンテキストでも表示を許す（**viewing は edit ではない**）

v1 に含めないもの:
- metadata の値編集
- provenance 以外の kind への metadata 表示（kind-agnostic な "generic relation details UI" 化はしない）
- link-index / markdown-reference sub-panel への拡張
- metadata 行からのナビゲーション（クリックで source entry に jump 等）

## 2. UI affordance の選定

| 案 | 採用可否 | 理由 |
|----|---------|-----|
| **native `<details>` / `<summary>`** | ✅ 採用 | 追加 JS state 不要 / `Esc` / tab / `Enter` の a11y を browser が担保 / outside-click 管理不要 / 既存 delete / kind コントロールと視覚的に干渉しない |
| popover (click + outside-click) | 不採用 | 追加 state / focus management が必要 / v1 の "最小拡張" 原則に反する |
| tooltip（`title` or hover） | 不採用 | touch デバイスで見えない / 読み上げソフトでの到達性が弱い / 複数キーの table 表示に不向き |
| always-on inline（折り畳みなし） | 不採用 | provenance 行の情報密度が急増、一覧性が落ちる |

採用した `<details>` 方式は、action-binder への追加配線が **ゼロ** で済むのが大きい。既存の `handleClick` / `handleChange` を汚染せず、純粋に renderer 内で完結する。

## 3. DOM 構成

### 3.1 集約 DOM（provenance 行、editable context）
```html
<li class="pkc-relation-item" data-pkc-relation-id="rp-1">
  <span class="pkc-relation-peer" data-pkc-action="select-entry" data-pkc-lid="e2">...</span>
  <span class="pkc-relation-kind">provenance</span>   <!-- read-only badge（不変）-->

  <details class="pkc-provenance-metadata" data-pkc-region="provenance-metadata">
    <summary class="pkc-provenance-metadata-summary"
             title="Show provenance metadata (read-only)"
             aria-label="Show provenance metadata (read-only)">ⓘ</summary>
    <dl class="pkc-provenance-metadata-list">
      <dt class="pkc-provenance-metadata-key" data-pkc-metadata-key="conversion_kind">conversion_kind</dt>
      <dd class="pkc-provenance-metadata-value" data-pkc-metadata-value="conversion_kind">text-to-textlog</dd>
      <dt class="pkc-provenance-metadata-key" data-pkc-metadata-key="converted_at">converted_at</dt>
      <dd class="pkc-provenance-metadata-value" data-pkc-metadata-value="converted_at">2026-04-16T12:34:56Z</dd>
      <dt class="pkc-provenance-metadata-key" data-pkc-metadata-key="source_content_hash">source_content_hash</dt>
      <dd class="pkc-provenance-metadata-value" data-pkc-metadata-value="source_content_hash">abcd1234ef567890</dd>
    </dl>
  </details>

  <!-- delete button: provenance 行では元々出ない（canEdit gate のため pre-existing、本 PR で不変）-->
</li>
```

### 3.2 非 provenance 行への影響
**一切ない**。元の select / badge / delete UI のまま。`<details>` の挿入は `if (r.relation.kind === 'provenance')` 直下でのみ実行される。

### 3.3 data-pkc-* attribute 体系
- `data-pkc-region="provenance-metadata"` — viewer 外枠
- `data-pkc-metadata-key="<key>"` — dt 側
- `data-pkc-metadata-value="<key>"` — dd 側

既存 selector（`data-pkc-relation-id` / `data-pkc-relation-direction` / `data-pkc-action`）は全て維持。

## 4. 表示する metadata 範囲

### 4.1 対象
`Relation.metadata?` の **string 値のみ**。non-string / null / 空文字列は表示しない（defensive、profile §2.2 では "すべての値は string" が契約）。

### 4.2 ソート順
1. `conversion_kind` （profile §2.2.1 required）
2. `converted_at` （profile §2.2.1 required）
3. `source_content_hash` （profile §2.2.2 recommended）
4. 以降は **alphabetical**（context-specific keys: `split_mode` / `segment_count` / `selected_log_count` / `source_updated_at` / `source_revision_id` / `source_container_cid` 等、および将来 additive に追加されるもの）

この 3 優先 + 残り alphabetical は、profile §4 の required/recommended 階層をそのまま UI に反映した結果。

### 4.3 rendering
- key → `<dt>`、value → `<dd>` の `<dl>` 並列構造（semantic HTML）
- value は **as-is 文字列**。日付整形や hash の省略表示は v1 では行わない（canonical spec の値そのものを見せる）
- value に `word-break: break-all` を適用（16-char hex / long ISO が狭幅で折り返せるように）
- key は muted + 等幅でない、value は mono（`var(--mono-font, monospace)`）— hash / ISO timestamp が読みやすい

### 4.4 特殊ケース
- `metadata === undefined` → viewer を描画しない
- `metadata === {}` → viewer を描画しない（string 値 0 個）
- `metadata.x === ''` などの空文字列 → その key だけスキップ、他 key があれば viewer は描画
- `metadata.x === 123` など non-string → defensive に skip（profile 契約違反だが UI はクラッシュしない）

## 5. read-only 保持の根拠

本 PR は **relation-kind-edit v1 の二重ガードを維持** する:
- reducer `UPDATE_RELATION_KIND` の gate:
  - `existing.kind === 'provenance'` → blocked
  - `action.kind === 'provenance'` → blocked
- UI 側:
  - provenance 行では `pkc-relation-kind-select` を描画しない（badge のみ）
  - 本 PR で追加する viewer は **入力要素を含まない**（`<details>` / `<summary>` / `<dl>` / `<dt>` / `<dd>` のみ、`<input>` / `<select>` / `<textarea>` / `<button>` は 0）
- 削除 UI:
  - provenance 行の削除 ボタンは `canEdit` gate によって provenance かつ canEdit でも現在表示されている（kind に依らず delete 可能）。**本 PR ではこの既存挙動を一切変更しない**。metadata viewer は削除 UI とは独立した affordance
- action / reducer レイヤ:
  - 新規 action は**追加しない**
  - 新規 event も**追加しない**
  - persistence への影響なし

結論として **provenance metadata は read しか提供していない**。relation-kind-edit-v1.md §2.3 の provenance 保全契約は破られていない。

## 6. 既存挙動の維持

- `pkc-relation-peer` / navigation（`select-entry`）— 不変
- kind 編集 UI（`pkc-relation-kind-select`）— provenance 行では元々出ない、本 PR 後も出ない
- kind badge（`<span class="pkc-relation-kind">provenance</span>`）— 不変
- delete UI（`pkc-relation-delete`）— provenance / 非 provenance とも元の `canEdit` gate のまま
- References umbrella / summary row / link-index sub-panel — 無関係で完全不変
- `data-pkc-region="relations"` / `data-pkc-relation-*` attribute — 全て維持
- sidebar badge scroll target — 不変

## 7. 用語整理

- **"provenance metadata viewing"** — 本 PR の正式名。`"provenance editing"` / `"provenance details"` / `"relation details"` とは呼ばない
- **"read-only"** — viewer のすべての場所で必ず前置する（summary の `title` / `aria-label`、spec 内記述、コメント）
- UI ラベルの表記:
  - summary の可視テキストは `ⓘ`（U+24D8、Circled Latin Small Letter I）。accessible name は `aria-label` 経由の "Show provenance metadata (read-only)"
  - key の表示はすべて **snake_case の profile 規定名をそのまま**（翻訳しない、alias しない）
- provisional な語彙は現状なし。key 一覧は `provenance-relation-profile.md §2.2.1〜§2.2.3` をそのまま権威とする

## 8. テスト

| ファイル | 追加 |
|---|---|
| `tests/adapter/renderer.test.ts` | +7 tests |

カバー項目:
1. provenance 行 + metadata ありで viewer が描画される（collapsed default, aria-label, `data-pkc-region`）
2. key の表示順が canonical（required 2 → recommended 1 → others alphabetical）
3. 各 key に対応する value が正しく `<dd>` に載る
4. metadata なし / `{}` の provenance 行では viewer が描画されない
5. 非 provenance 行で metadata があっても viewer が描画されない（kind 限定）
6. readonly context でも viewer は描画される（viewing は safe）+ edit affordance は引き続き非描画
7. non-string / null / empty string の metadata 値は defensive にスキップされ、有効な key だけが描画される

既存 test 影響: `"renders read-only badge (not <select>) for provenance relations..."`（relation-kind-edit-v1.md 由来）は本 PR でも依然 pass（provenance の select 非描画を確認するテストで、viewer の存在は影響しない）。

## 9. 非スコープ（v2+）

- metadata 値のクリック動作（例: `source_content_hash` → source entry への jump）
- metadata 値の整形（ISO → local date、hash 省略表記、container cid → 人間可読名）
- metadata の 検索 / フィルタ連動
- provenance 以外の kind における metadata 表示（**方針上採用しない**。`structural` 等 4 kinds は metadata を持つ契約でない）
- metadata の diff 表示（2 つの provenance relation を比較）
- metadata の export / copy
- "source revision id から revision viewer を開く" のような depth-2 ナビゲーション

## 10. 関連文書

- `docs/spec/provenance-relation-profile.md` — metadata v1 profile（本 PR が表示仕様の根拠にする canonical spec）
- `docs/spec/text-textlog-provenance.md` — TEXT ↔ TEXTLOG 変換の provenance payload
- `docs/spec/dual-edit-safety-v1-behavior-contract.md` — dual-edit conflict 由来の provenance（`conversion_kind: 'concurrent-edit'`）
- `docs/spec/textlog-text-conversion-policy.md` — `textlog-to-text` provenance
- `docs/development/relation-kind-edit-v1.md` — provenance 二重ガード（本 PR が維持する契約）
- `docs/development/unified-backlinks-v1.md` — References umbrella（本 viewer が属する sub-panel の上位）
- `docs/development/references-summary-row-v2.md` §11 — 本 PR を後続候補 #2 として起票した親文書
- `src/adapter/ui/renderer.ts` — `renderProvenanceMetadataViewer` 実装本体
- `src/styles/base.css` — viewer スタイル

## 11. 実装量

| ファイル | 変更 |
|---|---|
| `src/adapter/ui/renderer.ts` | `renderProvenanceMetadataViewer` 新規 (+67 行) + `renderRelationGroup` 型を `Relation` に拡張 (+1 行 / -1 行) + 挿入ポイント (+9 行) |
| `src/styles/base.css` | `.pkc-provenance-metadata*` 5 規則 (+50 行) |
| `tests/adapter/renderer.test.ts` | +7 tests |
| `docs/development/provenance-metadata-viewer-v1.md` | 新規 spec（11 セクション） |
| `dist/bundle.{js,css}` / `dist/pkc2.html` / `PKC2-Extensions/pkc2-manual.html` | rebuild |

## 12. 後続 PR 候補

> **📌 As of 2026-04-21（historical overlay）**: 4 件とも **LANDED**。本 viewer も current active candidate ではなく、**provenance wave は viewer v1 → pretty-print v1.x → copy-export v1 で段階的に完成**した。
>
> 1. Unified orphan detection (v3+) — **LANDED** (`unified-orphan-detection-v3-contract.md` + `connectedness-s3-v1.md` + `connectedness-s4-v1.md`。S5 filter のみ Defer)
> 2. References summary clickable (v3) — **LANDED** (`references-summary-clickable-v3.md`)
> 3. provenance metadata pretty-print — **LANDED** (`provenance-metadata-pretty-print-v1.md`)
> 4. provenance metadata copy / export — **LANDED** (`provenance-metadata-copy-export-v1.md`)

1. **Unified orphan detection draft (v3+)** — relations + markdown 合算 orphan 判定の別 draft
2. **References summary clickable (v3)** — summary row にクリック動作（sub-panel への scrollIntoView）
3. **provenance metadata pretty-print (optional)** — ISO → local datetime、hash 省略表示、container cid → title lookup などの値整形（viewing 契約は維持）
4. **provenance metadata copy / export (optional)** — 1 clipboard copy ボタンなど、ただし viewing から外れないよう最小化
