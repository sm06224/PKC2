# References Summary Clickable v3

**Status**: implementation — 2026-04-20.
**Scope**: References summary row (`references-summary-row-v2.md`) の 3 項目をクリック／キーボード活性化で対応する sub-panel 領域まで scrollIntoView させる **navigation only** 機能。件数定義・合算ルール・semantic merge の境界は**一切変更しない**。
**Baseline**: `references-summary-row-v2.md`（v2 summary row / purely informational の基盤）、`backlink-badge-jump-v1.md §6`（graph deferral policy）、`unified-backlinks-v0-draft.md §2`（用語分離契約）。

---

## 1. 実装方針

v2 の summary row は当初 `<span>` の informational 表示のみ。v3 で以下を加える:

- 各 item を `<button type="button">` に昇格（keyboard 活性化を native 化）
- `data-pkc-action="jump-to-references-section"` + `data-pkc-summary-target="..."` を付与
- click / Enter / Space で `scrollIntoView({behavior:'smooth', block:'start'})`
- **件数 / 意味論 / 合算ルールは一切変えない**
- `SELECT_ENTRY` を dispatch しない（summary は現選択 entry についての情報、navigation は pane-local）

## 2. DOM 構成（v3）

```html
<div class="pkc-references-summary"
     data-pkc-region="references-summary"
     aria-label="References summary: 3 relations, 2 markdown references, 1 broken">
  <button type="button" class="pkc-references-summary-item"
          data-pkc-summary-key="relations"
          data-pkc-action="jump-to-references-section"
          data-pkc-summary-target="relations"
          title="Jump to relations section (3)"
          aria-label="Jump to relations section, 3 items">
    Relations: 3
  </button>
  <span class="pkc-references-summary-sep" aria-hidden="true">·</span>
  <button type="button" class="pkc-references-summary-item"
          data-pkc-summary-key="markdown-refs"
          data-pkc-action="jump-to-references-section"
          data-pkc-summary-target="link-index"
          title="Jump to markdown refs section (2)"
          aria-label="Jump to markdown refs section, 2 items">
    Markdown refs: 2
  </button>
  <span class="pkc-references-summary-sep" aria-hidden="true">·</span>
  <button type="button" class="pkc-references-summary-item"
          data-pkc-summary-key="broken"
          data-pkc-action="jump-to-references-section"
          data-pkc-summary-target="link-index-broken"
          data-pkc-broken="true"
          title="Jump to broken section (1)"
          aria-label="Jump to broken section, 1 item">
    Broken: 1
  </button>
</div>
```

既存 attribute:
- `data-pkc-region="references-summary"` — 変更なし
- `data-pkc-summary-key="..."` — 変更なし（v2 と互換、既存 6 tests がそのまま pass）
- `data-pkc-broken="true"` — 変更なし

新規 attribute:
- `data-pkc-action="jump-to-references-section"`
- `data-pkc-summary-target="relations" | "link-index" | "link-index-broken"`
- `type="button"` / `title` / `aria-label`

## 3. click 仕様

### 3.1 action-binder 分岐

```ts
case 'jump-to-references-section': {
  const targetKey = target.getAttribute('data-pkc-summary-target');
  if (!targetKey) break;
  const ALLOWED = new Set(['relations', 'link-index', 'link-index-broken']);
  if (!ALLOWED.has(targetKey)) break;
  requestAnimationFrame(() => {
    const region = root.querySelector(`[data-pkc-region="${targetKey}"]`);
    region?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  break;
}
```

### 3.2 動作詳細
- `requestAnimationFrame` でスクロールを 1 frame 遅延 → render pass が落ち着いてからスクロール
- **target は allow-list**（3 値 closed set）。未知の `data-pkc-summary-target` 値は黙殺（stray attribute による DOM 走査防止）
- 現 entry は**変更しない**（既に選択状態、`SELECT_ENTRY` 不要 / dispatch しない）
- `viewMode` も変更しない（summary row は detail view でしか render されないため）
- `open-backlinks` / `toc-jump` / `navigate-entry-ref` と同じ rAF + scrollIntoView パターン

### 3.3 keyboard 対応
`<button>` の native 挙動に委譲:
- `Tab` で focus 到達
- `Enter` / `Space` で click 発火
- `focus-visible` で accent outline（CSS で実装）

追加 keyboard handler は**書かない**。native semantics が十分。

## 4. ジャンプ先定義

| summary item | `data-pkc-summary-target` | ジャンプ先 `data-pkc-region` | ジャンプ先実体 |
|---|---|---|---|
| `Relations: N` | `relations` | `[data-pkc-region="relations"]` | relations-based sub-panel（`pkc-relations` wrap）|
| `Markdown refs: M` | `link-index` | `[data-pkc-region="link-index"]` | link-index sub-panel（`pkc-link-index` wrap、Outgoing/Backlinks/Broken の 3 subsection を内包）|
| `Broken: K` | `link-index-broken` | `[data-pkc-region="link-index-broken"]` | link-index の broken subsection のみ |

**Broken は subsection 単位でピンポイント** — 他 2 項目は sub-panel 全体。`backlink-badge-jump-v1.md` の sidebar badge jump が `relations` 領域を target とする既存 pattern と整合。

### 4.1 件数 0 時の挙動
件数 0 でも button は **disabled にしない**。sub-panel は empty state（`"No outgoing relations."` / `"No backlinks."` / `"No broken links."`）で常に描画されるため、jump する価値は残る（位置の確認、他 item との視覚対比等）。ユーザが意図的にクリックした場合に "無視される" のは逆に意地悪。click → scroll → empty state を見せる、が最も素直。

### 4.2 DOM 不在時の guard
何らかの理由で target region が render されない場合（例えば section 構造が将来変わった場合）の safety:
- `root.querySelector(...)` が `null` を返せば何もしない
- `scrollIntoView` が method として存在しない（古い happy-dom 等）場合は呼ばない

`open-backlinks` / `toc-jump` と同じ defensive pattern。

## 5. 用語整理

v2 と同じ用語契約を維持:

- `"Relations"` / `"Markdown refs"` / `"Broken"` の 3 label をそのまま UI に出す（`"Backlinks"` 単独は禁止）
- tooltip / aria-label は `"Jump to <label lowercased> section (N)"` / `"Jump to <label lowercased> section, N items"` 形式
- 禁止語彙: `orphan` / `unified` / `disconnected` / `isolated` — click 機能には関係ないが summary / tooltip テキストに混入しないことを test で機械検証可能

## 6. readonly / manual context

**click 機能は readonly でも有効**。navigation は write 権限を要さない（`orphan-detection-ui-v1.md` / `provenance-metadata-viewer-v1.md` と同じ原則）。readonly でも summary row は表示され、button は enabled / clickable / keyboard 活性化可能。test で明示検証。

## 7. 既存挙動の維持

- **件数計算**: `references-summary-row-v2.md §3` の算出式を一切変更しない
- **用語禁止規則**: `unified-backlinks-v0-draft.md §2` の Backlinks 前置規則を維持
- **v2 existing tests**: 6 件すべて継続 pass（`data-pkc-summary-key` / `data-pkc-broken` / count text が button でも同じ shape で取れる）
- **pane 全体の layout / spacing**: CSS で button の native chrome（border / background / padding / margin）を明示リセット、見た目は v2 と同等
- **sub-panel の構造**: link-index 3 subsection / relations sub-panel いずれも未変更
- **`jump-to-references-section` は単独分岐**: 既存 `open-backlinks` / `toc-jump` / `navigate-entry-ref` への干渉なし

## 8. 実装量

| ファイル | 変更 |
|---|---|
| `src/adapter/ui/renderer.ts` | `renderReferencesSummary` — `<span>` → `<button>` 変更 + 新 attribute + allow-list。+26 行 / -3 行 |
| `src/adapter/ui/action-binder.ts` | `case 'jump-to-references-section'` 追加（handleClick 内）。+27 行 |
| `src/styles/base.css` | `.pkc-references-summary-item` button reset + hover + focus-visible。+21 行 |
| `tests/adapter/renderer.test.ts` | +4 tests（`<button>` / target / 0 count / aria wording / readonly）|
| `tests/adapter/action-binder-navigation.test.ts` | +5 tests（Relations / Markdown refs / Broken / no SELECT_ENTRY / keyboard click）|
| `docs/development/references-summary-clickable-v3.md` | 新規 spec（本書）|
| `dist/{bundle.js,bundle.css,pkc2.html}` / `PKC2-Extensions/pkc2-manual.html` | rebuild |

## 9. Validation

| 項目 | 結果 |
|---|---|
| `npm run typecheck` | OK |
| `npm run lint` | OK |
| `npm test` | 4772 / 4772 pass（+9 from S4 baseline 4763）|
| `npm run build:bundle` | OK（bundle.css 86.53 kB / bundle.js 618.95 kB、S4 から +0.35 kB / +0.82 kB）|
| `npm run build:release` | OK（dist/pkc2.html 675.6 KB）|
| `npm run build:manual` | OK（PKC2-Extensions/pkc2-manual.html 1709.1 KB）|

## 10. 非スコープ（v3+）

- **filter 連動**: click で "Broken だけ表示" 等のフィルタは**採らない**（`references-summary-row-v2.md` §8 / `unified-orphan-detection-v3-contract.md` §4.8 の graph-wording 禁止を継承、summary クリック = navigation only）
- **件数 0 時の button 非活性化**: 上記 §4.1 の通り、empty-state view へのジャンプ価値を保つ
- **click → 他 entry への navigation**: summary は現選択 entry の情報のみを扱う、他 entry 展開は別機能
- **合算カテゴリへの遷移**: "References" umbrella heading 自体へのクリック動線は採らない（umbrella は外枠、情報 pane としての役割のみ）
- **History / back-forward stack**: browser history には積まない（pane-local UI 操作、URL 変化なし）

## 11. 関連文書

- `docs/development/references-summary-row-v2.md` — summary row v2 canonical（本 v3 が拡張する）
- `docs/development/unified-backlinks-v1.md` — References umbrella（上位 pane）
- `docs/development/unified-backlinks-v0-draft.md §2` — 用語分離契約（本 v3 の命名遵守根拠）
- `docs/development/backlink-badge-jump-v1.md` — sidebar badge jump（同パターンの先行事例、rAF + scrollIntoView）
- `src/adapter/ui/renderer.ts` — `renderReferencesSummary`
- `src/adapter/ui/action-binder.ts` — `jump-to-references-section` 分岐
- `src/styles/base.css` — summary item button style
- `tests/adapter/renderer.test.ts` — DOM 構造テスト
- `tests/adapter/action-binder-navigation.test.ts` — click / keyboard 挙動テスト

## 12. 後続 PR 候補

> **📌 As of 2026-04-21（historical overlay）**: 3 件中 **2 件 LANDED / 1 件 Defer 継続**。
>
> 1. provenance metadata pretty-print — **LANDED** (`provenance-metadata-pretty-print-v1.md`)
> 2. provenance metadata copy / export — **LANDED** (`provenance-metadata-copy-export-v1.md`)
> 3. S5 optional orphan filter — **DEFERRED 継続**（`unified-orphan-detection-v3-contract.md §7.4` / `connectedness-s4-v1.md §11` / `next-feature-prioritization-after-relations-wave.md §5` と整合、S4 marker で「気づき」成立済みのため実需待ち）

1. **provenance metadata pretty-print**: ISO → local datetime / hash 省略表示（`provenance-metadata-viewer-v1.md` §12 の後続候補）
2. **provenance metadata copy / export**: 1 clipboard copy ボタン、optional
3. **S5 — optional orphan filter** (`unified-orphan-detection-v3-contract.md` §7.4): 引き続き defer 推奨、S4 marker で「気づき」が成立しているため必要性が出るまで待つ

References pane は v1 umbrella → v2 summary → v3 clickable で navigation / viewing 方向の完成度が上がった。次は provenance 周りの値整形に進むのが自然。
