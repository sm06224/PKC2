# References Summary Row v2

**Status**: implementation — 2026-04-20.
**Scope**: Unified Backlinks v1 で導入した `References` umbrella の heading 直下に **lightweight な summary row** を 1 行だけ追加する。3 値の数字（`Relations` / `Markdown refs` / `Broken`）を purely informational に出す。**件数を合算しない**・**クリック挙動を持たせない**・**既存 sub-panel に一切変更を加えない**、の 3 点が v2 の境界条件。
**Baseline**: `docs/development/unified-backlinks-v1.md` §6 で defer していた "summary row v2 候補" をそのまま実装する。

---

## 1. 実装方針

v1 draft / umbrella 完成後に defer していた要件セット:
- umbrella heading の直下に `Relations: N  ·  Markdown refs: M  ·  Broken: K` 形式の 1 行を追加
- sub-panel の件数表示とは独立（count は再計算、UI 側にも relations sub-panel / link-index sub-panel はそのまま残る）
- 値は 0 でも行を出す（umbrella の構造を固定して視覚的ノイズを減らす）
- クリック / フィルタ動作は v2 では持たせない
- 既存 `data-pkc-region` 体系（`references` / `relations` / `link-index` / `link-index-*`）は完全維持

## 2. DOM 構成

```html
<section class="pkc-references" data-pkc-region="references">
  <div class="pkc-references-heading">References</div>

  <!-- v2 summary row — NEW -->
  <div class="pkc-references-summary"
       data-pkc-region="references-summary"
       aria-label="References summary: ...">
    <span class="pkc-references-summary-item" data-pkc-summary-key="relations">Relations: 3</span>
    <span class="pkc-references-summary-sep" aria-hidden="true">·</span>
    <span class="pkc-references-summary-item" data-pkc-summary-key="markdown-refs">Markdown refs: 2</span>
    <span class="pkc-references-summary-sep" aria-hidden="true">·</span>
    <span class="pkc-references-summary-item" data-pkc-summary-key="broken" data-pkc-broken="true">Broken: 1</span>
  </div>

  <div class="pkc-relations" data-pkc-region="relations"> ... </div>
  <div class="pkc-link-index" data-pkc-region="link-index"> ... </div>
</section>
```

- 外枠: heading と sub-panel の間に `<div class="pkc-references-summary" data-pkc-region="references-summary">`
- 各 item は `<span>` に `data-pkc-summary-key` で識別（`relations` / `markdown-refs` / `broken`）
- 区切りは視覚的な `·`（`pkc-references-summary-sep`、`aria-hidden="true"` で読み上げ対象外）
- Broken が **0 でないときのみ** `data-pkc-broken="true"` を付与 → CSS で色変化（`--c-danger`）
- `aria-label` に 3 値を 1 文で含め、summary 1 行全体が 1 つの意味単位として読み上げられる

## 3. 各 count の定義

### 3.1 `Relations: N`
relations-based 側。container.relations の中から **selected entry に結びつく relation**（`from === entry.lid` OR `to === entry.lid`）を対象とし、`outgoing + inbound` の和。`getRelationsForEntry` / `resolveRelations` の結果をそのまま利用し、sub-panel に出ているのと同じ母集団を使う（**再カウントの食い違いが起きない**）。

- `outbound.length + inbound.length`
- self-loop（`from === to === entry.lid`）は relation が 1 つあれば 1 として数える（resolveRelations が outbound / inbound で重複生成しない限り）

### 3.2 `Markdown refs: M`
link-index 側。`buildLinkIndex(container)` の結果から以下を合算:
- `outgoingBySource.get(entry.lid) ?? []` → entry 本文中の `entry:<lid>` 参照（resolved / broken 両方を含む）
- `backlinksByTarget.get(entry.lid) ?? []` → 他 entry から当該 entry への解決済み参照（resolved のみ含まれる / broken は定義上存在しない）

つまり `M = outgoing + backlinks`。Broken は outgoing の部分集合なので **M には含まれる**（重複カウントはしない）。

### 3.3 `Broken: K`
link-index の outgoing のうち `!resolved` のもの:
- `outgoingBySource.get(entry.lid).filter(r => !r.resolved).length`
- これは M の内訳の一部（subset）であり、M とは独立した数値ではない

### 3.4 カウント定義の contract
- **relations-based と markdown-reference の件数を足さない**。用途も実体も異なる
- どの数字も "backlinks" 単独語では呼ばない。"Relations" / "Markdown refs" / "Broken" の 3 語を固定
- 全 0 でも行は出す（umbrella の構造を固定する意図）

## 4. 視覚設計

- 高さ 1 行 / 横並び flex / gap 0.35rem
- `font-size: 0.7rem` / `color: var(--c-muted)` でノイズを抑える
- Broken は count > 0 のときだけ `--c-danger` 色（悪目立ちせず、存在する時だけ自然に注意喚起）
- separator `·` は `--c-border` 色でさらに控えめ
- wrap を許容（`flex-wrap: wrap`）— 狭いペインで縦積みされても崩れない

## 5. UI / UX 判断の根拠

| 設問 | 決定 | 理由 |
|------|------|------|
| 0 件でも表示？ | **する** | umbrella の構造を固定、"ここに数字が出る" という期待値を毎回保証する方が認知負荷が低い |
| クリックで jump / filter？ | **しない** | v2 は purely informational。sidebar backlink badge jump（`backlink-badge-jump-v1.md`）と責務が重複しうる / 動作対象（relations vs link-index）の曖昧さが再燃するリスク |
| 用語の曖昧さ対策は？ | `"Backlinks"` を使わない | relations-based / markdown-reference のどちらでも `"Backlinks"` という単独語が出ないようにする（v0 draft §2 用語契約） |
| ハイライト色は？ | Broken のみ count > 0 時に赤 | 0 件時に赤を出さないのは "存在しない問題" を可視化しないため |
| 全 3 値を 1 行？ | 1 行 / wrap 許可 | 縦積みだと summary ではなく mini-section 化してしまう |

## 6. 用語整理

- **"References"**: umbrella 語（不変）
- **"Relations"**: relations-based count label（sub-panel の `Outgoing relations` / `Backlinks` と同母集団だが、summary では総和を 1 数字に）
- **"Markdown refs"**: link-index count label。`"Markdown references"` の省略形、UI テキストとしてはこちらを採用（行幅節約）
- **"Broken"**: link-index broken count。"Broken links" ではなく "Broken" 単独（"links" を省略しても Broken であれば意味が通る / `data-pkc-broken` の attribute 名とも整合）
- **禁止**: `"Backlinks"` 単独語（sub-panel 内の heading は既存で 2 か所残っているが summary row には出さない）

## 7. 既存挙動の維持

- `pkc-relations` sub-panel（`Outgoing relations (N)` / `Backlinks (N)` / delete UI / kind edit UI / relation-create form）— 一切変更なし
- `pkc-link-index` sub-panel（`Outgoing links (N)` / `Backlinks (N)` / `Broken links (N)` / 行レベル navigation）— 一切変更なし
- `data-pkc-region="relations"` / `"link-index"` / `"link-index-outgoing"` / `"link-index-backlinks"` / `"link-index-broken"` — すべて維持
- sidebar badge jump のスクロール対象も従来どおり `data-pkc-region="relations"`
- render 順: `heading` → **`references-summary` (NEW)** → `relations` → `link-index`

## 8. 非スコープ（v3+）

- summary item のクリック jump（sub-panel への scrollIntoView）
- summary 値のフィルタ連動（例: `Broken > 0` で link-index-broken をハイライト表示）
- relations 側の "broken" 類似概念（from / to が存在しない relation の detection）→ 別 draft（v0 draft §7 "Unified orphan detection" 領域）
- provenance relation の扱いを summary で区別（今は 4 user kinds と同様 1 relation として合算）

## 9. 実装量

| ファイル | 変更 |
|----------|------|
| `src/adapter/ui/renderer.ts` | `renderReferencesSummary` 新規（+34 行）+ umbrella 組み立て箇所に summary 行の挿入（+11 行） |
| `src/styles/base.css` | `.pkc-references-summary` / item / sep / broken 4 規則（+20 行） |
| `tests/adapter/renderer.test.ts` | +6 tests（行出現 / 位置 / relations count / markdown count / broken marker / 未選択時不在） |
| `dist/bundle.{js,css}` / `dist/pkc2.html` / `PKC2-Extensions/pkc2-manual.html` | rebuild |

## 10. テストスコープ

1. **全 3 値を伴う summary 行の存在**（0 値でも出る）
2. **DOM 位置**: heading の直後、sub-panel より前
3. **Relations count = outgoing + inbound**（relations-based）
4. **Markdown refs / Broken count**（link-index 由来、broken は outgoing の subset）
5. **Broken marker 属性**: count > 0 のときだけ `data-pkc-broken="true"`
6. **未選択時には row 自体が出ない**（umbrella が出ないのと同条件）

## 11. 後続 PR 候補

> **📌 As of 2026-04-21（historical overlay）**: 4 件中 **3 件 LANDED / 1 件 Defer**。
>
> - Non-Responsibility Boundary の acceptance 昇格 — **DEFERRED**（canonical = `pkc-message-hook-subscription-decision.md`、現決定は Defer）
> - provenance relation の metadata 閲覧 UI — **LANDED** (`provenance-metadata-viewer-v1.md` + `provenance-metadata-pretty-print-v1.md` + `provenance-metadata-copy-export-v1.md`)
> - Unified orphan detection (v3+) — **LANDED** (`unified-orphan-detection-v3-contract.md` + `connectedness-s3-v1.md` + `connectedness-s4-v1.md`。S5 filter のみ Defer)
> - References summary clickable (v3) — **LANDED** (`references-summary-clickable-v3.md`)

- **Non-Responsibility Boundary の acceptance 昇格** — PKC-Message Hook 系列
- **provenance relation の metadata 閲覧 UI** — provenance 行の badge は読み取り専用のまま、`conversion_kind` 等の表示
- **Unified orphan detection draft (v3+)** — relations + markdown 合算 orphan 判定
- **References summary clickable (v3)** — 本 row にクリック動作を載せる、ただし用語・責務境界の再検討が必要

## 12. 関連文書

- `docs/development/unified-backlinks-v1.md` — References umbrella の直接の親文書（本 PR が §6 の v2 候補を消化）
- `docs/development/unified-backlinks-v0-draft.md` — 用語契約 §2 / v2 defer policy §6.3 / §7
- `docs/development/backlinks-panel-v1.md` — relations-based backlinks sub-panel
- `docs/development/archived/v1-audits/link-index-v1-audit.md` — link-index sub-panel
- `docs/development/relation-kind-edit-v1.md` — kind 編集（本 PR と同時期の前 PR）
- `docs/spec/link-index-v1-behavior-contract.md` — link-index 挙動 canonical spec
- `src/features/link-index/link-index.ts` — `buildLinkIndex` 実装（本 PR が count 源として利用）
- `src/adapter/ui/renderer.ts` — `renderReferencesSummary` 本体
- `src/styles/base.css` — summary row スタイル
