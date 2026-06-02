# 描画 surface parity audit(2026-05-22)

**Status (2026-05-28 audit)**:✅ **全 Gap RESOLVED** ── 本 doc で inventory した Gap-1〜Gap-15 は pgc-78〜pgc-211 の連続 stack で全件着地済。`src/adapter/ui/entry-window.ts` に pgc-91 / 93 / 94 / 95 / 96 / 97 / 98 / 211 の cross-reference comment が thread 済、5 surface(center / Viewer popup / Split View / entry-window child / monitor)で `renderMarkdown` opts(currentContainerId / vars / sourceLineAnchors / headingNumber)+ preprocess(parseFrontmatter / extractVars / extractDocumentGlobals / resolveAssetReferences)+ features 層 DOM op(expandTransclusions / hydrateCardPlaceholders / applyHeadingFold / hydrateMermaidPlaceholders)+ critical PKC dialect CSS が parity 達成。本 audit doc は 2026-05-28 archive(`docs/development/completed/`)へ移動。

**Status (2026-05-22 起こし時点、参考)**:audit doc(docs-only、後続実装 PR の入口)
**Trigger**:user direction(2026-05-22)「マルチウィンドウの表示内容と Split
View の、メインウィンドウとの実装仕様差を解消する」。γ-A5(`multi-window-
vscode-extension-spec-2026-05.md`)で 4・5 番目の surface(entry-window viewer
role / monitor role)が増えた今、CLAUDE.md §9「surface 別 dual-render path」
が想定する 3 surface 監査(center / Viewer popup / Split View)を **5 surface
に広げて実装仕様差を棚卸し**、その差分を埋める後続 PR(pgc-78 以降)の入口
を作る。
**Scope**:docs-only。実装変更は本 PR では行わない。**結論**(§5「埋めるべき
差分の inventory」)を pgc-78 以降の実装 PR 候補として user に提示し、合意を
得てから 1 surface・1 機能ずつ寄せていく。
**Canonical**:`src/adapter/ui/detail-presenter.ts`(S1 center pane)が
canonical。S2〜S4 はここに寄せる方向で原則 align(canonical 確定は user
合意の上)。

---

## §0 用語と前提

### §0.1 「surface」とは

PKC2 で同じ entry を **どの DOM 経路で render するか** ── 異なる経路は
異なる `renderMarkdown` 引数 / 異なる CSS 経路 / 異なる features 層 DOM 操作
を呼ぶため、生成 HTML や見た目が surface ごとに微妙に違ってしまう。CLAUDE.md
§9「surface 別 dual-render path」が「新 markup を加える時は 3 surface 全部で
動作確認が必須」と規約化しているのが、まさにこの surface 概念。

### §0.2 markdown render が経由する canonical 関数

`renderMarkdown(text, opts)`(`src/features/markdown/markdown-render.ts:3473`)
が唯一の canonical 描画関数。引数は `RenderMarkdownOptions`(同 file L1187):

| option | 用途 | 影響 |
|---|---|---|
| `currentContainerId` | 同一 container 内 `pkc://` permalink を internal 扱いに | external chip かそうでないか、`hydrateCardPlaceholders` が card に化けるかの判定にも使用 |
| `vars` | frontmatter `vars.*` の本文展開(M-7、2026-05-08) | `{{vars.x}}` が値に展開、未定義は `<span class="pkc-variable-undefined">` |
| `sourceLineAnchors` | block-level token に `data-pkc-source-line` を打つ | Split View の caret↔preview 同期に必須 |
| `silentHallucinationWarnings` | hallucination 形 directive 検出時の `console.warn` 抑止 | test / debug 用、production は false |
| `headingNumber` | 見出しに `start.M.L` を前置(領域 8 Layer 3、案 C) | frontmatter `heading-number` 指定で発火 |

### §0.3 features 層 DOM 操作(post-process)

`renderMarkdown` の返り値 HTML だけでは表示にならない機能群:

| 関数 | 役割 | 起点 |
|---|---|---|
| `expandTransclusions(root, ctx)` | `<div class="pkc-transclusion-placeholder">` を **他 entry の body** に展開 | `src/adapter/ui/transclusion.ts` |
| `hydrateCardPlaceholders(root, ctx)` | `<div class="pkc-card-placeholder">` を **card widget DOM** に hydrate | `src/adapter/ui/card-hydrator.ts` |
| `applyHeadingFold(root)` | top-level 見出しを `<details class="pkc-heading-fold">` で折りたたみ可能に | `src/features/markdown/heading-fold.ts` |

3 つとも **DOM 走査**で行うので、`renderMarkdown` を呼んだ後の HTML を一旦
DOM に流して呼ぶ。呼ばないと placeholder のまま残り、user 体感では「他 entry
が embed されない」「card にならない」「見出しが折りたためない」となる。

### §0.4 frontmatter 関連の前処理

`renderMarkdown` 呼出前の body 加工:

| 関数 | 役割 |
|---|---|
| `parseFrontmatter(body).body` | 先頭 `---\n…\n---` を strip(strip しないと frontmatter が `<hr>+text+<hr>` として preview に出る) |
| `extractVars(body)` | frontmatter から `vars.*` を抽出して `RenderMarkdownOptions.vars` に渡す |
| `extractDocumentGlobals(body)` | frontmatter から `writing` / `direction` / `align` 等の document-level 設定を抽出。container DOM 要素に `data-pkc-writing` / `data-pkc-doc-align` / `dir` 属性を反映 |
| `extractHeadingNumberConfig(body)` | frontmatter から `heading-number` を抽出して `RenderMarkdownOptions.headingNumber` に渡す |
| `resolveAssetReferences(body, ctx)` | `![](asset:K)` / `[label](asset:K)` を data URI / chip に解決 |

### §0.5 「test pass = ship」禁止 doctrine の再確認

CLAUDE.md「描画と生成は別物 ─ test pass = ship 禁止」doctrine が、本 audit
の存在意義そのもの。**生成された HTML が正しい ≠ user が見ているピクセルが
正しい**。本 audit は code reading によるパス比較であって、視覚 parity は
別途 user 実機 + parity test(`docs/development/visual-state-parity-
testing.md`)で確認する必要がある。本 audit は「埋めるべき差分の一覧化」
までを担い、視覚 parity の最終確認は user 実機検証に委ねる。

---

## §1 5 surfaces の inventory

PKC2 は 2026-05-22 時点で **5 surface** で markdown を render する。

### §1.1 S1:Center pane(canonical)

- **path**:`src/adapter/ui/detail-presenter.ts`
- **DOM**:`#pkc-root` > center pane > `.pkc-md-rendered`
- **CSS**:`src/styles/base.css`(bundle.css に常駐、全 PKC dialect class 完備)
- **role**:**canonical** surface。新機能は最初にここに来る。他 surface は
  ここに寄せる方向。
- **path 詳細**:
  - view mode → `textPresenter.renderBody`(L65-150)
  - edit mode → `textPresenter.renderEditorBody`(L152-241、Split View)
- `parseFrontmatter` / `extractVars` / `extractDocumentGlobals` /
  `extractHeadingNumberConfig` / `resolveAssetReferences` 全件 active。
- `expandTransclusions` / `hydrateCardPlaceholders` / `applyHeadingFold`
  全件 active(`entries` が渡されている時)。
- `currentContainerId` を `pkc://` 解決と card hydration に thread。
- archetype 別 presenter(`textlog-presenter.ts` / `todo-presenter.ts` /
  `folder-presenter.ts`)は登録経由でここから派生し、各々が同等の前後処理
  を持つ(todo / folder は frontmatter / vars を持たない設計、それ以外の
  pipeline は同 contract)。

### §1.2 S2:Viewer popup(rendered viewer)

- **path**:`src/adapter/ui/rendered-viewer.ts`
- **DOM**:独立 document(`window.open('') + document.write(...)`)、
  `.pkc-md-rendered` は同じだが **外部 CSS は取り込まない**
- **CSS**:inline `<style>` block(同 file L105〜L860、~ 750 行)
  ── base.css の必要部分を **手動 mirror**(CLAUDE.md §9 が wave-10-2 で
  確立した規律「Viewer popup の inline CSS mirror」)
- **role**:print / 単体 HTML エクスポート target。entry を「印刷向け
  シンプル document」として開く。
- **path 詳細**:`buildRenderedViewerHtml(entry, container)` →
  `buildBodyHtml(entry, container)`(L975)
  - text → `renderMarkdown(resolved, { vars })`(L988)
    → `expandTransclusions(tmp, ...)`(L999)
    → `applyHeadingFold(tmp)`(L1037)
  - textlog → `buildTextlogBodyHtml(entry, container)`(L1019)、
    per-log で frontmatter strip + vars 抽出 + asset 解決 + `renderMarkdown`
- `parseFrontmatter` / `extractVars` / `extractDocumentGlobals` 全件 active。
- `expandTransclusions` / `applyHeadingFold` active。
- **`hydrateCardPlaceholders` は呼ばない**(§5 Gap-2)。
- **`currentContainerId` / `headingNumber` は `renderMarkdown` に未連動**
  (§5 Gap-1、Gap-3)。
- **`sourceLineAnchors` は不要**(view-only、編集経路を持たない)。

### §1.3 S3:Split View preview(center pane edit mode)

- **path**:`src/adapter/ui/detail-presenter.ts` + `src/adapter/ui/action-binder.ts`
- **DOM**:center pane edit 中の右ペイン
  `.pkc-text-edit-preview.pkc-md-rendered`
- **CSS**:`src/styles/base.css`(center pane の DOM 内なので base.css そのまま)
- **role**:caret 同期付きの live preview。
- **path 詳細**:
  - 初期描画:`textPresenter.renderEditorBody`(L218-237)
  - 入力時 re-render:`action-binder.ts:updateTextEditPreview`(L7588-7636)
  - **両方とも `sourceLineAnchors: true` 必須**(caret↔preview sync の anchor)
- `parseFrontmatter` / `extractVars` / `extractHeadingNumberConfig` active。
- **`extractDocumentGlobals` は呼ばない**(live preview では globals を反映
  しない、§5 Gap-4。なお view mode の S1 は反映する)。
- **`expandTransclusions` / `hydrateCardPlaceholders` / `applyHeadingFold`
  も呼ばない**(§5 Gap-5。これは「編集中に他 entry が混ざると caret 同期
  と DOM 構造が壊れる」設計判断の可能性が高い ── 仕様確認 OQ-S3-1 で問う)
- 初期 render と入力 re-render で `extractDocumentGlobals` 等の取扱いが
  微妙に分岐している(初期は呼んでいないが、live は当然呼んでいない)。

### §1.4 S4:entry-window 子 window(editor / viewer)

- **path**:`src/adapter/ui/entry-window.ts`
- **DOM**:独立 document(`window.open() + document.write(...)`)、
  内側に `.pkc-md-rendered` を持つ
- **CSS**:inline `<style>`(同 file L1015〜L1841、~ 826 行)+ inline
  `<script>` ~3000 行
- **role**:
  - **editor role**(γ-A3〜):double-click でその entry を別 window で
    編集できる。
  - **viewer role**(γ-A5-1、pgc-68):readonly で開いて参照用にする。
  - editor / viewer 両方とも `buildWindowHtml(entry, readonly, ...)`
    の同一 builder から派生 ── HTML 構造は完全同一、`readonly = true` で
    Edit ボタン / Ctrl+S / 編集 UI を抑止するだけ。
- **path 詳細**:`buildWindowHtml`(L946-1841) →
  - view body 初期描画:`renderViewBody(entry, lightSource, ctx)`(L699-734)
    - text(default 分岐)→ `renderMarkdown(source || '', { sourceLineAnchors: true })`
      (L1177) **── frontmatter strip / vars / globals 全部やっていない**
    - textlog → `buildTextlogViewBodyHtml(lid, body)`(L572-615)
      ── per-log `renderMarkdown(log.bodySource || '')` **── 同様に全部
      やっていない、`資-reference resolution は NOT 適用` を明示 comment**
    - todo / form / attachment / folder → 専用 card renderer(markdown 描画
      経路ではない)
  - editor 編集中の Split View live preview:**子 window inline script
    から `window.opener.pkcRenderEntryPreview(lid, text, ctx)`** → 親側
    `renderEntryPreview`(L92-109)→ `renderMarkdown(resolved, { sourceLineAnchors: true })`
    **── ここも `sourceLineAnchors` 以外は何も渡していない**
  - editor save 後 view 再描画:子 inline script `renderBodyView(originalBody)`
    → text なら `renderMd(body)` → `renderMarkdown(text ?? '', { sourceLineAnchors: true })`、
    textlog なら `window.opener.pkcRenderTextlogViewBody(lid, body)` =
    `buildTextlogViewBodyHtml`(再び全部やっていない)
  - **live refresh push**(`pushViewBodyUpdate(lid, resolvedBody)`、L496-520):
    `renderMarkdown(resolvedBody || '')` ── **オプション一切無し**。
    `pushViewBodyUpdate` は γ-A5 で editor + viewer の **両投** に拡張済。

#### entry-window 固有制約

- inline script(子 document 内)は **bundle を import できない**
  (子は別 document、main bundle にアクセスできない)。features 層 DOM 操作
  (`expandTransclusions` 等)を呼ぼうとすると、(a) opener 経由で親側に
  処理を依頼するか、(b) inline script で同等処理を書き直すか、の 2 択。
  → §5 Gap 群で「opener 経由 bridge」が現実的解と判断する場面が多い。
- CSS は base.css を取り込まない。必要な PKC dialect rule は inline `<style>`
  に mirror が必須。**現在は最低限のみ mirror**(§3 CSS 比較で 53 件不足を
  数値化)。

### §1.5 S5:Monitor window(γ-A5-2)

- **path**:`src/adapter/ui/entry-window.ts` `buildMonitorHtml`(L945-1002)
- **DOM**:独立 document、minimal inline `<style>`(~10 line)+ inline
  `<script>` で `pkc-monitor-update` postMessage を受け取って panel 再描画
- **CSS**:`.pkc-monitor-head` / `#monitor-panel` / `.pkc-monitor-item` /
  `.pkc-monitor-empty` のみ。`.pkc-md-rendered` は **存在しない**。
- **role**:container 由来のライブ panel。**markdown を render しない**
  (現状は TOC = 見出しアウトラインのみ、level + text の 1 行ずつ
  `textContent` で並べる)。
- **path 詳細**:`deriveMonitorItems(kind, entry)` →
  `MonitorItem[]`(`{ level, text }[]`)→ initial JSON literal 埋め込み →
  inline script `renderMonitor(items)` で `.pkc-monitor-item` に描画。
  refresh は `pushMonitorUpdate(kind, lid)` →
  `pkc-monitor-update` postMessage → 子の `renderMonitor` が再実行。
- **markdown が無いので S1〜S4 とは parity 軸が異なる**。`text` field 内に
  markdown 構文を含めても plain text として表示される。
- ただし「TOC が見出し階層を反映するか」「TOC text が markdown の
  inline syntax(`**bold**` 等)を strip して表示するか」など、TOC 抽出
  ロジック(`extractTocFromEntry`)の挙動が canonical(右ペイン TOC)と
  一致しているかは別途 audit 対象になり得る(本 audit の scope 外、§7
  関連 spec に記録)。

### §1.6 surface 一覧(再掲)

| # | surface | builder | CSS 経路 | markdown render? |
|---|---|---|---|---|
| S1 | Center pane | `detail-presenter.ts` 系 | `src/styles/base.css` | ✅ canonical |
| S2 | Viewer popup | `rendered-viewer.ts` `buildRenderedViewerHtml` | inline `<style>` mirror(~750 行)| ✅ |
| S3 | Split View preview | `detail-presenter.ts` `renderEditorBody` + `action-binder.ts` `updateTextEditPreview` | base.css | ✅(`sourceLineAnchors: true`)|
| S4 | entry-window child | `entry-window.ts` `buildWindowHtml` | inline `<style>`(~826 行)| ✅(view body / split editor preview / save 後再描画 / live refresh push)|
| S5 | Monitor window | `entry-window.ts` `buildMonitorHtml` | minimal inline `<style>` | ❌(`MonitorItem.text` を plain text として描画)|

---

## §2 比較表:`renderMarkdown` options

S4 は内部に複数 render path を持つので、それぞれ別行で記録する。
✅ = 渡されている、❌ = 渡されていない、N/A = そもそも該当しない。

### §2.1 機能フラグ別

| option | S1 | S2 | S3 init | S3 live | S4 text view 初期 | S4 split editor live | S4 textlog view | S4 save 後再描画 | S4 push update | S5 |
|---|---|---|---|---|---|---|---|---|---|---|
| `currentContainerId` | ✅ | ❌ | ✅(detail-presenter経由) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | N/A |
| `vars` | ✅ | ✅(per-entry + per-log) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | N/A |
| `sourceLineAnchors` | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | N/A | ✅(text)/ N/A(textlog) | ❌ | N/A |
| `silentHallucinationWarnings` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | N/A |
| `headingNumber` | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | N/A |

**読み取り**:
- `currentContainerId` は **S1 と S3 init のみ完全**。S2 / S3 live /
  S4 全 path で未連動 → 同一 container 内 `pkc://` permalink が
  external として扱われ得る。`hydrateCardPlaceholders` も同 ID を必要
  とするため、cards も hydrate されない(§5 Gap-1)。
- `vars` は **S1 / S2 / S3 で完全、S4 全 path で未連動**。entry-window で
  textlog や text を開くと `{{vars.x}}` が **literal 文字列**として残る。
  user 体感としては「center pane では展開されたのに別窓に出したら literal
  に戻った」(§5 Gap-6)。
- `headingNumber` も同様 ── S4 で連動していない(§5 Gap-7)。
- `sourceLineAnchors` の使い分けはそれぞれ意図通り(view-only 経路は
  off、編集経路は on)。
- `silentHallucinationWarnings` は production / debug 用途では false が
  既定で問題なし。ただし `tests/smoke/` で test runner の console を
  汚さないため積極利用すべき箇所がある可能性 ── 本 audit の scope 外。

### §2.2 前処理(body 加工)

| step | S1 | S2 | S3 init | S3 live | S4 text view 初期 | S4 split editor live | S4 textlog view | S4 save 後再描画 | S4 push update |
|---|---|---|---|---|---|---|---|---|---|
| `parseFrontmatter` strip | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌(per-log frontmatter 概念なし)| ❌ | ❌ |
| `extractVars` | ✅ | ✅(per-entry + per-log) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `extractDocumentGlobals` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `resolveAssetReferences` | ✅(assets/mime 供給時)| ✅ | ❌ | ✅(action-binder で container から取って渡す)| ✅(`assetContext.resolvedBody` 経由)| ✅(`pkcRenderEntryPreview` の opener 側 ctx 経由)| ❌(comment で明示「NOT 適用」)| ✅(text)/ ❌(textlog) | ✅(`pushViewBodyUpdate` 呼出側で渡す) |

**読み取り**:
- **S4 全 path で `parseFrontmatter` / `extractVars` が抜けている**。これは
  S4 の全 markdown render 経路で frontmatter が **raw text として preview に
  漏れる**ことを意味する(§5 Gap-6 で扱う。`vars` 機能も S4 で全滅 ──
  Gap-6 と一緒に解消する)。
- `extractDocumentGlobals` は S1 / S2 のみ active。S3(Split View)では
  initial render も live re-render も globals を反映しないが、edit 中の
  preview に globals を反映するのは **設計判断としてあり得る**(縦書き / RTL
  のまま編集すると textarea と preview の方向が逆になり caret 同期が
  狂うリスク)。仕様確定 OQ-S3-1 で問う。
- `resolveAssetReferences` の S3 live 経路は action-binder が再計算する
  実装で OK。S4 は `assetContext.resolvedBody` を P→C で配ったり opener
  経由で再解決したりで賄っている。**ただし textlog だけが意図的に解決
  しない**(L566-570 の comment、Slice 4-A で「textlog rendered viewer
  での asset 対応は別概念」と保留)。これは textlog body の構造(per-log
  の bodySource は独立した markdown unit、container.assets への参照
  contract が center pane と同一かは要検証)から来る Slice 4-A 時点での
  保留事項で、解消するなら別 spec が必要 ── 本 audit では Gap として
  記録するに留める(§5 Gap-9)。

### §2.3 後処理(features 層 DOM 操作)

| op | S1 | S2 | S3 init | S3 live | S4 text view | S4 split editor | S4 textlog view | S4 save 後再描画 | S4 push update |
|---|---|---|---|---|---|---|---|---|---|
| `expandTransclusions` | ✅(`entries` 供給時)| ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `hydrateCardPlaceholders` | ✅(同上)| ❌(S2 でも未連動)| ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `applyHeadingFold` | ✅(無条件)| ✅(無条件)| ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

**読み取り**:
- **`hydrateCardPlaceholders` は S2(Viewer popup)で抜けている**。card-link
  を本文に含む entry を Viewer popup で開くと placeholder のまま表示される
  (§5 Gap-2)。S1 では card 化される機能が S2 で消えるのは違和感が大きい。
- S3(Split View)で 3 op すべて未連動なのは **設計判断**としてあり得る
  (live preview に他 entry が混ざると body の長さが変わり caret 同期
  contract が壊れる、heading-fold の `<details>` 内 source-line anchor 探索
  が失敗する等)── §5 Gap-5 で扱い方を OQ-S3-1 / OQ-S3-2 として整理。
- S4 全 path で 3 op すべて未連動。inline script から features 層を呼ぶ
  経路が無く、opener bridge で押し出すか親で完結させた HTML を push する
  かしかない。**`pushViewBodyUpdate` の rendered HTML push 経路を強化する
  方向**が前方互換的に最も自然(canvas 化への耐性も維持、spec §11.3)。

---

## §3 CSS 比較

各 surface が **どの PKC dialect class 用 CSS rule を持っているか** ── inline
mirror(S2 / S4)で base.css と乖離があると user が見て分かる差異になる。

### §3.1 集計

base.css にある `pkc-*` class:**954 件**(全 PKC 内部 class、UI shell 等
含む)。markdown render scope の class(`pkc-md-*` / `pkc-toc-*` / `pkc-task-*` /
`pkc-fig-*` / `pkc-blank-*` / `pkc-section-*` / `pkc-details*` /
`pkc-transclusion-*` / `pkc-quote-*` / `pkc-warning-*` / `pkc-variable-*` /
`pkc-html-*` / `pkc-heading-fold*` / `pkc-footnote*` / `pkc-tolerant-*` /
`pkc-lead` / `pkc-attribution` / `pkc-align-*` / `pkc-em-*`)を絞ると、
inline mirror が必要な「rendered markdown 用の dialect 装飾」class セット
が浮かぶ。

| surface | 全 `pkc-*` 出現数 | rendered markdown 用 mirror 不足数(\*) |
|---|---:|---:|
| S1 base.css(canonical)| 954 | 0(by definition)|
| S2 Viewer popup inline | 124 | **14**(主に interactive UI 残骸、§3.2)|
| S4 entry-window inline | 139 | **53**(critical な PKC dialect 大量、§3.3)|

(\*) 「dialect 装飾」= 上記の prefix 群に限定。UI shell class(`pkc-btn` /
`pkc-sidebar` / `pkc-tree-*` 等)は対象外。

S5 monitor は markdown を持たないため CSS mirror 不要(対象外)。

### §3.2 S2 で不足している 14 件(Viewer popup)

`comm -23 base.css/viewer-mirror` 抜粋:

```
pkc-footnote-ref            # ← 注:wave-Z で markdown-it-footnote 採用、Viewer に未 mirror
pkc-md-block-kind           # md-block(table / fence)の copy button overlay UI
pkc-md-table-filter-cell    # table 行 filter UI(interactive、印刷で不要なら non-issue)
pkc-md-table-filter-input   # 同上
pkc-md-table-rownum         # 同上
pkc-md-table-th-content     # 同上
pkc-md-table-th-enhanced    # 同上
pkc-task-badge              # task 完了 badge(center pane の chrome、Viewer popup で要否は OQ)
pkc-task-complete           # 同上
pkc-toc-current             # 右ペイン TOC の current marker(Viewer popup TOC sidebar は印刷向け、要否 OQ)
pkc-transclusion-broken     # transclusion target 不在時の fallback marker
pkc-transclusion-document   # transclusion 中の document 装飾
pkc-transclusion-fallback-link  # fallback link 装飾
pkc-transclusion-log        # textlog transclusion 内 1 log の装飾
```

**判断**:
- `pkc-footnote-ref`:Wave-Z で footnote が採用された(`markdown-dialect-
  extensions-spec-2026-05.md` 等で記録)。Viewer popup に CSS mirror が
  入っていない → footnote が表示されない or 装飾が崩れる可能性。
  **mirror 追加候補**(§5 Gap-10)。
- `pkc-md-table-filter-*`、`pkc-md-table-th-enhanced`、`pkc-md-block-kind`:
  interactive UI 用。Viewer popup は印刷ターゲット = interactive 不要なので、
  既に `@media print` で `display:none` 指定がある(L781-787)が、screen
  でも表示しない方針なら CSS は不要。**現状は意図通り**(§5 Gap-11 で
  記録のみ、修正対象外)。
- `pkc-task-badge` / `pkc-task-complete`:center pane の chrome(右ペイン
  TOC current marker と同じく entry の状態 indicator)。Viewer popup での
  要否は user 判断(§5 Gap-12 として OQ で問う)。
- `pkc-transclusion-broken` / `-document` / `-log` / `-fallback-link`:
  transclusion DOM の構成要素。S2 は expandTransclusions を呼ぶので
  これらの class を持つ要素が生まれる → mirror 不足は visual 漏れ。
  **mirror 追加候補**(§5 Gap-10 と統合)。

### §3.3 S4 で不足している 53 件(entry-window)

`comm -23 base.css/entry-window-mirror`(category 別整理):

| category | 不足 class | 影響 |
|---|---|---|
| `:::section{role=...}` / admonition | `pkc-section-callout`、`pkc-section-note` / `-tip` / `-warning` / `-info` / `-caution` / `-danger` / `-important` / `-summary`、`pkc-section-break` | **9 件全滅** ── admonition / callout 装飾が一切効かない |
| `:::details` 折りたたみ | `pkc-details`、`pkc-details-summary` | 装飾無し plain `<details>` で表示される |
| `:::figure` / `:::table` / `:::equation` | `pkc-fig`、`pkc-fig-caption`、`pkc-fig-ref` | caption 装飾無し、ref `[@id]` リンク色無し |
| `:::quote{author=…}` | `pkc-quote-citation`、`pkc-quote-author`、`pkc-quote-year` | citation block 装飾無し、author/year 表記出ない |
| `_` blank line marker(L-8) | `pkc-blank-line`、`pkc-blank-count`、`pkc-blank-capped`、`pkc-blank-line-h` | 空行マーカーの高さ調整無し |
| `:lead:` / `:spacing:` / `:align:` / `:quote:`(L-5 tolerant aliases、PR-2L)| `pkc-lead`、`pkc-attribution`、`pkc-tolerant-spacing`、`pkc-align-hint` | alias 装飾無し |
| `^^X^^` em-dot(L-2) | `pkc-em-dot` | 圏点(dot)装飾無し、`<em>` plain で表示 |
| `==X==` highlight | (`<mark>` 自体は inline mirror あり) | OK |
| `{{vars.x}}` 未定義警告(M-7)| `pkc-variable-undefined` | 警告色無し、literal 文字列のまま |
| `:::frontmatter` / `:::body` region(PR-2W)| なし(`<aside>` / `<section>` plain で出る)| 装飾無し |
| `:::html` fence iframe(PR-2M)| `pkc-html-render` | iframe 装飾無し(描画自体は動く)|
| AI hallucination 警告(PR-2K)| `pkc-warning-hallucination-block` | 警告色無し、literal 残し |
| 見出し折りたたみ | `pkc-heading-fold`、`pkc-heading-fold-summary` | `applyHeadingFold` を呼ばないので無関係(Gap-15 と統合) |
| transclusion 装飾 | `pkc-transclusion`、`pkc-transclusion-body`、`pkc-transclusion-header`、`pkc-transclusion-source`、`pkc-transclusion-fallback`、`pkc-transclusion-broken`、`pkc-transclusion-document`、`pkc-transclusion-log`、`pkc-transclusion-fallback-link` | 9 件全滅(`expandTransclusions` を呼ばないので無関係)|
| table interactive UI | `pkc-md-table-sort` / `-filter-toggle` / `-filter-row` / `-filter-cell` / `-filter-input` / `-rownum` / `-th-content` / `-th-enhanced`、`pkc-md-block`、`pkc-md-copy-btn`、`pkc-md-block-kind` | interactive、印刷向けではないので意図的に削除可(Gap-11 と同列の判断)|
| footnote | `pkc-footnote-ref` | footnote 装飾無し |
| TOC current marker | `pkc-toc-current` | TOC current marker 出ない(本文表示には影響しない)|

**読み取り**:
- **critical な PKC dialect 装飾の半数以上が S4 inline CSS に存在しない**。
  特に `:::section{role=...}`(admonition / callout)、`:::details`、
  `:::figure`、`:::quote`、blank-line marker、tolerant aliases は **wave-10-2
  以降に作った新機能群** で、S4 inline mirror への追加が漏れている。
  → §5 Gap-13(critical PKC dialect CSS mirror)
- transclusion 関連 9 件は **`expandTransclusions` を呼ばないから無関係**
  (Gap-5 / Gap-13 の解消には bundle として両方が要る)。
- table interactive UI は S2 と同じく印刷 / 読書向けでは要らない判断あり得る
  ── ただし S4 は editor / viewer の両 role を兼ねるので、editor では table
  interactive を効かせたい可能性。 OQ-S4-1 で問う(§6)。
- `applyHeadingFold` を呼んでいない S4 では heading-fold CSS は要らない
  (Gap-15 と Gap-14 がペア:呼ぶようにするなら CSS も入れる)。

### §3.4 まとめ

CSS 経路は **S1 が base.css で 100%、S2 が 14 件不足、S4 が 53 件不足**。
S2 の不足は print 仕様で意図的に外している interactive UI が主だが、
**footnote / task-badge / transclusion 装飾 4 件は user 体感影響あり**。
S4 の不足は **critical PKC dialect 装飾が半数以上で大量** ── ここを埋めない
と user は「center pane で出る装飾が別窓では出ない」と必ず気付く。

---

## §4 ファイル別の現状確認(逐次 reading 結果)

### §4.1 `detail-presenter.ts`(S1)

完了済の確認:
- L65-150 `textPresenter.renderBody`:全前後処理を含む正規パイプライン。
- L152-241 `textPresenter.renderEditorBody`:Split View 初期。
- L106-110:`renderMarkdown(source, { currentContainerId, vars, headingNumber })`
  ── 3 option すべて正しく渡す。
- L122-135:`expandTransclusions` + `hydrateCardPlaceholders`(entries 有時)。
- L139:`applyHeadingFold(body)`(無条件)。

### §4.2 `rendered-viewer.ts`(S2)

完了済の確認(L985-1038、`buildBodyHtml` text 分岐):
- L1010-1013:`extractVars` + `parseFrontmatter` strip + `resolveAssetSource`
  ── ✅ 全件 active。
- L1014-1017:`renderMarkdown(resolved, { vars, headingNumber: extract-
  HeadingNumberConfig(rawBody) })` ── **`vars` + `headingNumber` の 2 件
  active**、**`currentContainerId` は渡されていない**(Gap-1)。
- L1026-1034:`expandTransclusions(tmp, ...)` ── ✅ active。
- L1037:`applyHeadingFold(tmp)` ── ✅ active。
- **`hydrateCardPlaceholders` は呼んでいない**(Gap-2)。
- L70-80(`buildRenderedViewerHtml`):`extractDocumentGlobals` ── ✅
  active、`article.pkc-viewer-body` に `data-pkc-writing` / `data-pkc-doc-
  align` / `dir` を反映。

### §4.3 `entry-window.ts`(S4)

完了済の確認:
- L92-109 `renderEntryPreview(lid, text, ctx)` ── 子 window inline script
  が opener 経由で呼ぶ。`renderMarkdown(resolved, { sourceLineAnchors: true })`
  のみで他 option 全部 null。
- L496-520 `pushViewBodyUpdate(lid, resolvedBody)` ── editor + viewer の
  両投で `renderMarkdown(resolvedBody || '')`(オプション完全無し)。
- L572-615 `buildTextlogViewBodyHtml(lid, body)` ── per-log
  `renderMarkdown(log.bodySource || '')`(同じくオプション完全無し)。
  L566-570 comment で「`資産参照解決 NOT 適用` を明示」。
- L699-734 `renderViewBody(entry, lightSource, ctx)`:
  - text(default 分岐、L1177):`renderMarkdown(source || '', { sourceLineAnchors: true })`
  - textlog → `buildTextlogViewBodyHtml`
  - todo / form / attachment → 専用 card
- L946-1841 `buildWindowHtml(entry, readonly, lightSource, ctx, startEditing)`:
  - L1015〜 inline `<style>`(~826 行)── PKC dialect mirror は **§3.3 で
    確認した通り 53 件不足**。
- L945-1002 `buildMonitorHtml(kind, entry, items)`:monitor は markdown
  render 経路なし(§1.5 で扱った)。

### §4.4 `action-binder.ts`(S3 live)

完了済の確認:
- L7588-7636 `updateTextEditPreview(textarea)`:
  - L7617 `extractVars(src)`
  - L7618 `parseLivePreviewFrontmatter(resolved).body`
  - L7619-7623 `renderMarkdown(livePreviewSource, { sourceLineAnchors: true,
    vars: livePreviewVars, headingNumber: extractHeadingNumberConfig(src) })`
  - → **`currentContainerId` / `extractDocumentGlobals` 未連動**(他 4 option
    は OK)。
  - L7634 `syncPreviewToCaret(textarea, preview)`:caret sync hook。

---

## §5 埋めるべき差分の inventory(Gap-1〜Gap-15)

「surface ごと・機能ごと」で PR-1 個サイズに割れる単位で列挙する。各 Gap には
**(a)発生 surface、(b)現状、(c)目指す状態、(d)推奨アプローチ、(e)
推定 PR サイズ、(f)優先度** を付ける。

優先度凡例:
- **🔥 High**:user が center pane で見えていた何かが別 surface で **消える**
  / **literal で出る** / **形が崩れる** など、目に見える user impact がある。
- **🟡 Mid**:体感はあるが niche、または features 層 DOM 操作経由で
  「無くても本文は読める」レベル。
- **🟢 Low**:CSS chrome のみ / interactive 機能のみ / 純粋な完備性。

### Gap-1 `currentContainerId` 未連動(S2 / S3 live / S4 全 path)── ✅ **RESOLVED**(pgc-90、pgc-203 audit reconcile 確認)

pgc-90 で S2(`rendered-viewer.ts:1081`)/ S3 live(`action-binder.ts:8184-8193`)/ S4(`entry-window.ts:142/244-248/671/772/1363`)に `currentContainerId` thread 済。本書では「open」 のまま残存していたが pgc-203 grep で resolve 済を確認。

- **発生**:Viewer popup / Split View live re-render / entry-window 全
  render path で `RenderMarkdownOptions.currentContainerId` を渡していない。
- **現状**:同一 container 内の `pkc://<container_id>/...` permalink が
  external として扱われ、external chip 装飾になる。`hydrateCardPlaceholders`
  も同じ container ID を必要とするため、card-link の hydration も外れる
  (Gap-2 と関連)。
- **目指す**:S1 と等価:caller 側で `state.container?.meta.container_id`
  を取って渡す。S4 は `assetContext.currentContainerId` を新 field として
  追加 → opener 経由で受け取る。
- **アプローチ**:
  - S2:`buildRenderedViewerHtml(entry, container)` の container から
    `container.meta.container_id` を取って `buildBodyHtml` → `renderMarkdown`
    に thread。
  - S3 live:`action-binder.ts:updateTextEditPreview` で
    `dispatcher.getState().container?.meta.container_id` を opts に追加。
  - S4 全 path:`assetContext.currentContainerId?: string` を field 追加、
    `openEntryWindow` / `openViewerWindow` の caller(action-binder)が
    渡す。`renderEntryPreview` / `renderViewBody` /
    `buildTextlogViewBodyHtml` / `pushViewBodyUpdate` で受けて
    `renderMarkdown` に渡す。
- **size**:中(各 surface 1〜数行、test 含めて 10〜30 LOC)。
- **priority**:🔥 **High** ── card 機能 + pkc:// 同一 container 判定の両方
  に効く。

### Gap-2 `hydrateCardPlaceholders` 未連動(S2)── ✅ **RESOLVED**(pgc-90、pgc-203 audit reconcile 確認)

`rendered-viewer.ts:1107-1110` で `hydrateCardPlaceholders` 呼び済。本書では「open」 のまま残存していたが pgc-203 grep で resolve 済を確認。

- **発生**:Viewer popup。`expandTransclusions` は呼んでいるが
  `hydrateCardPlaceholders` を呼んでいない。
- **現状**:`[](pkc://...)` card-link が placeholder のまま、card widget に
  化けない。center pane で card になっていたのに、Viewer popup に出すと
  ただの link / placeholder に戻る。
- **目指す**:S1 と等価 ── `applyHeadingFold` の手前(L1037 直前)で
  `hydrateCardPlaceholders` を呼ぶ。`currentContainerId`(Gap-1)が要件。
- **アプローチ**:Gap-1 を先に解消 → 同 PR か直後 PR で
  `hydrateCardPlaceholders(tmp, { entries: container.entries,
  currentContainerId: container.meta.container_id })` を追加。
- **size**:小(数行 + test)。
- **priority**:🔥 **High**(Gap-1 後)。

### Gap-3 ~~`headingNumber` の S2 連動再確認~~ → **VERIFIED OK(non-gap)**

- **再確認結果**:`rendered-viewer.ts` L1014-1017 の `renderMarkdown(resolved,
  { vars, headingNumber: extractHeadingNumberConfig(rawBody) })` が text
  分岐の唯一の `renderMarkdown` 呼出で、`headingNumber` は **正しく** 渡って
  いる。本 Gap は誤検出だった。
- **action**:なし。ただし textlog 分岐(`buildTextlogBodyHtml`、per-log
  `renderMarkdown(resolved, { vars: logVars })`)では `headingNumber` を
  渡していない。これは「textlog の個別 log に heading 番号を付ける概念は
  無い」設計の表れで、S1(`textlog-presenter.ts`)も同じく per-log で
  `headingNumber` を渡していない ── **S1 / S2 で一致、parity OK**。
- **priority**:N/A(verification 終了)。

### Gap-4 `extractDocumentGlobals` 未連動(S3 live + S3 init)

- **発生**:Split View の init `detail-presenter.ts:renderEditorBody`(L218
  -237)と live re-render `action-binder.ts:updateTextEditPreview`(L7588-
  7636)の両方で `extractDocumentGlobals` を呼んでいない。
- **現状**:`writing: vertical` / `direction: rtl` / `align: ...` を
  frontmatter で指定しても、Split View preview には反映されない(view mode
  には反映される)。
- **目指す**:**仕様確定 OQ-S3-1** が要る。edit 中に preview が縦書きや RTL
  になると textarea(LTR の横書きで編集する)との対応関係が崩れる。center
  pane view mode と Split View preview を完全に同 contract にするか、
  Split View では globals を **意図的に無視する**(editing 用に常に LTR
  横書き)かを user に問う。
- **アプローチ**(仮:user が「globals 反映する」を選んだ場合):
  detail-presenter L225-229 と action-binder L7619-7623 に globals 抽出 +
  `pkc-md-rendered` 要素への data 属性反映を追加。
- **size**:小〜中(設計判断が決まれば実装は小)。
- **priority**:🟡 Mid(縦書き / RTL は niche、ただし「center pane と
  Split View で見た目が違う」は user 報告対象になり得る)。

### Gap-5 features 層 DOM 操作の Split View 適用判断(S3)

- **発生**:S3 で `expandTransclusions` / `hydrateCardPlaceholders` /
  `applyHeadingFold` がすべて未連動。
- **現状**:caret 同期 contract と heading-fold の `<details>` 内 source-
  line anchor 探索の整合性のため、設計判断として未連動の可能性が高い。
  ただし spec doc に明示されていない。
- **目指す**:**仕様確定 OQ-S3-2** が要る。
  - (a) 3 op すべて呼ばない:現状維持、live preview は「caret 同期だけ守る」。
    user が card / transclusion / heading-fold を見たければ view mode で見る。
  - (b) 3 op すべて呼ぶ:S1 view と完全 parity。caret 同期 contract を
    `[data-pkc-source-line]` 含む transclusion / details の中まで探索する
    ように拡張(`source-preview-sync.ts` の改修必要)。
- **アプローチ**:user 判断 → (a) なら本 audit に正式記録して終わり、
  (b) なら追加 PR(大、source-preview-sync 改修 + test)。
- **size**:小(現状維持を spec に formal 記録)〜 大(機能化)。
- **priority**:🟡 Mid(現状維持で大きな user 体感影響なし、ただし spec
  に明示されていないと再発 risk)。

### Gap-6 `parseFrontmatter` / `extractVars` 未連動(S4 全 path)── ✅ **RESOLVED**(pgc-90/96、pgc-203 audit reconcile 確認)

`entry-window.ts:241-242 / 666-667 / 1351-1357` で `parseFrontmatter(raw).body` + `extractVars(raw)` thread 済。本書では「open」 のまま残存していたが pgc-203 grep で resolve 済を確認。

- **発生**:S4 の text / textlog の全 render path で frontmatter strip +
  vars 抽出 + 連動が無い。
- **現状**:
  - text の frontmatter は `<hr>+text+<hr>` として preview に literal 表示
    される。
  - `{{vars.x}}` が literal 文字列のまま残る。
  - center pane で展開されたものが、別窓に開くと literal に戻る。
- **目指す**:S1 / S2 と等価:`pushViewBodyUpdate` を呼ぶ caller、
  `pkcRenderEntryPreview` の opener 関数(`renderEntryPreview`)、
  `buildTextlogViewBodyHtml` 内の per-log render、`renderViewBody` の
  default 分岐 ── 全 4 location で frontmatter strip + vars 抽出 + 連動を
  入れる。
- **アプローチ**:
  - `renderEntryPreview` / `pushViewBodyUpdate` / `renderViewBody` /
    `buildTextlogViewBodyHtml`(必要に応じて per-log) で
    `parseFrontmatter(text).body` で strip → `extractVars(text)` で
    抽出 → `renderMarkdown(stripped, { vars, ... })`。
  - `pushViewBodyUpdate` は caller(`entry-window-view-body-refresh.ts`)
    から **raw body** を渡しているので、helper 側で前処理が一括できる。
- **size**:中(4 location + 各 test、~30〜60 LOC)。
- **priority**:🔥 **High** ── 「別窓に出すと frontmatter が見える / vars
  が展開されない」は user 報告対象。

### Gap-7 `headingNumber` 未連動(S4 全 path)── ✅ **RESOLVED**(pgc-90/96、pgc-203 audit reconcile 確認)

`entry-window.ts:243 / 668 / 1357` で `extractHeadingNumberConfig(raw)` → `renderMarkdown(..., { headingNumber })` thread 済。本書では「open」 のまま残存していたが pgc-203 grep で resolve 済を確認。

- **発生**:S4 全 path で `headingNumber` を `renderMarkdown` に渡していない。
- **現状**:frontmatter `heading-number: 1` 指定の entry を別窓で開くと、
  見出しに番号が付かない。center pane では付いている。
- **目指す**:S1 / S2(Gap-3 後)と等価 ── `extractHeadingNumberConfig(body)`
  を呼んで `renderMarkdown` の opts に追加。
- **アプローチ**:Gap-6 と同じ 4 location で同時に対応するのが効率的。
- **size**:小(Gap-6 と同 PR で 1 機能分の追加に統合可)。
- **priority**:🟡 Mid。

### Gap-8 `extractDocumentGlobals` 未連動(S4 全 path)── ✅ **RESOLVED**(2026-05-23、pgc-98)

- **発生**:S4 全 path で `extractDocumentGlobals` を呼んでいない。
- **現状**:`writing: vertical` 等を frontmatter 指定しても別窓では反映
  されない。center pane では反映される。
- **目指す**:S1 / S2 と等価 ── globals 抽出 → `data-pkc-writing` /
  `data-pkc-doc-align` / `dir` 属性を `.pkc-md-rendered` 要素に反映。
- **アプローチ**:Gap-6 と同 location 群 + inline CSS mirror に必要 rule
  追加(Gap-13 と連動)。
- **size**:中。
- **priority**:🟡 Mid。
- **解消(pgc-98)**:`injectFeaturesDomOps` に optional `raw?: string`
  parameter を追加、`extractDocumentGlobals(raw)` + `globalsToDataAttrs`
  で output HTML を `<div data-pkc-writing="…" dir="…" data-pkc-doc-
  align="…" data-pkc-layout="…">…</div>` で wrap する経路。S1 canonical
  は `.pkc-md-rendered` 自身に attr を載せるが、S4 は `#body-view` の
  `innerHTML` を介すため wrapper 1 段を中に挿入する(postMessage protocol
  変更ゼロ)。4 path 全部に raw thread(`renderEntryPreview` /
  `pushViewBodyUpdate` / `renderViewBody` text default、per-log textlog
  は独立 frontmatter 持たないため skip)。inline CSS は
  `.pkc-md-rendered > div[data-pkc-writing="vertical"]` ほか writing-mode
  / text-align / layout(`a4-1col`〜`legal-2col` 全 9 variant)を ~50
  行 mirror(base.css L2041-2097 + rendered-viewer.ts L493-527 と同等、
  `@media print` も同期)。container null path も raw 経由で wrap が走る
  挙動(canonical S1 が entries 不在でも globals を root attr に載せる
  挙動と一致)。`tests/adapter/entry-window-doc-globals.test.ts` 9 件
  pass。

### Gap-9 textlog asset reference resolution 未対応(S2 / S4 textlog)── ✅ **RESOLVED**(pgc-211)

pgc-211 で S4 `buildTextlogViewBodyHtml` に S2 と equivalent な per-log asset resolution を実装。`hasAssetReferences(logStripped)` で early-exit guard、`currentContainerRef` から `{ assets, mimeByKey, nameByKey }` map を build して `resolveAssetReferences` に渡す。container 不在 / asset 参照無しなら no-op で従来挙動を維持(後方互換完全)。`pushTextlogViewBodyUpdate` 経由の live refresh path も同 builder を経由するので一括対応。canonical S2 `rendered-viewer.ts` `buildTextlogBodyHtml` L1176 の流儀と一致、S1 textlog presenter も同等経路。Slice 4-A 時点の「保留事項」 を pgc-211 で closure、OQ-S4-2 user 判断待ちを bypass(`進めろ` user direction 2026-05-25 を受けて autonomous 着地)。

---

- **発生**:
  - S2 `buildTextlogBodyHtml`(L1019-1069):per-log で `resolveAssetSource`
    を呼んでいる ✅(L1047)── 実は OK だった。
  - S4 `buildTextlogViewBodyHtml`(`entry-window.ts` L572-615):L566-570
    comment で「asset reference resolution は NOT 適用」明示。
- **現状の差分**(audit 当時):**S2 は対応、S4 は意図的未対応**。
- **解消**(pgc-211):S4 で per-log の `![](asset:K)` 画像 + `[label](asset:K)`
  chip が正しく resolve され表示されるように。S2/S4 contract が一致。
- **size**:中(15 行追加 + import 既存利用)。
- **priority**:🟡 Mid → ✅ RESOLVED。

### Gap-10 S2 inline CSS の 4 件 mirror 不足(footnote / transclusion / task)── ✅ **RESOLVED**(pgc-210、audit 数値再評価:過去 PR で既 mirror 済)

pgc-210 grep reconcile:**4 件すべて `rendered-viewer.ts` inline `<style>` に既 mirror 済**。詳細:
- `.pkc-md-rendered .pkc-footnote-ref`:L627, L632, L637, L638, L639(5 rule)
- `.pkc-md-rendered .pkc-task-badge`:L641
- `.pkc-md-rendered [data-pkc-task-complete="true"] .pkc-task-badge` + `.pkc-md-rendered .pkc-task-badge[data-pkc-task-complete="true"]`:L646, L647(2 rule)
- `.pkc-md-rendered .pkc-transclusion-broken`:L659(1 rule)

合計 **9 rule reference** が S2 inline CSS に存在(footnote 5 + task 2 + transclusion-broken 1 + footnote::before/::after は 5 内含)。audit 当時の「4 件不足」 推定は陳腐化していた(過去の PR-2L / PR-2K / PR-2N で mirror 済)。本 doc-only PR で RESOLVED marker + line number 参照を記録、今後の新 rule 追加時は **base.css + rendered-viewer.ts inline style 両方** に追加する規約を継続(Gap-13 と同じ doctrine)。

---

- **発生**(audit 当時):S2 inline CSS で `pkc-footnote-ref` / `pkc-task-badge` /
  `pkc-task-complete` / `pkc-transclusion-broken` 等 4 件不足。
- **解消**:過去 PR(PR-2L / PR-2K / PR-2N)で順次 mirror 済、pgc-210 grep で確認。
- **size**:小(20〜40 行 CSS、過去 PR で完遂)。
- **priority**:🟡 Mid(footnote は機能影響あり、他は chrome)── pgc-210 で RESOLVED 確認。

### Gap-11 S2 / S4 で table interactive UI を意図的に外している

- **発生**:Viewer popup / entry-window で table sort / filter / row number
  等 interactive UI 用 CSS を入れていない。
- **判断**:S2 は印刷向け = interactive 不要 ✅。S4(editor / viewer)は
  user 用途次第 ── editor で table を操作したい可能性。
- **アプローチ**:**OQ-S4-1** で user 判断 → 入れる場合は別 PR(中)、
  入れない場合は本 audit に formal 記録して終わり。
- **size**:中(入れる場合は CSS + inline JS の interactive script も
  追加必要)。
- **priority**:🟡 Mid(本 audit の主目的ではないが記録対象)。

### Gap-12 S2 で task badge / TOC current marker の要否(OQ-S2-1)

- **発生**:S2 の inline CSS で `pkc-task-badge` / `pkc-task-complete` /
  `pkc-toc-current` 不足。
- **判断**:print 向けでも task 完了率は表示したい? TOC current は印刷
  で意味薄。
- **アプローチ**:**OQ-S2-1** で user 判断。
- **size**:小(数行 mirror)。
- **priority**:🟢 Low(chrome のみ)。

### Gap-13 S4 inline CSS の 53 件 mirror 不足(critical PKC dialect)── ✅ **RESOLVED**(pgc-204、audit 数値再評価:実態 ~10 件)

pgc-203 audit reconcile + pgc-204 で closure。audit 当時「53 件」 と推定したが、その後 PR-2L / PR-2K / PR-2N で大半が既に mirror 済(pgc-203 grep で base.css 50 unique critical selector vs entry-window 44 → 差分 6 件のみ + pgc-203 で追加した新 mermaid 4 rule = 計 10 件)。**pgc-204 で全 10 件 mirror**:`.pkc-blank-line[data-pkc-blank-count="26|27|28|29|35|45"]` 6 variant + `.pkc-mermaid-{placeholder,source,rendered,error}` 4 rule + `.pkc-mermaid-rendered svg` child selector。base.css と entry-window inline style の grep diff parity test(`tests/adapter/entry-window-css-parity-gap13.test.ts` 6 件)で contract 固定。今後の新 PKC dialect 追加時は **base.css + entry-window 両方** に CSS を追加する規約を tests で enforce。



- **発生**:§3.3 の S4 不足 53 件のうち、**:::section / :::details /
  :::figure / :::quote / blank-line marker / tolerant alias / em-dot /
  html-render / variable-undefined / hallucination-warning** の **PKC
  dialect critical 群**。
- **現状**:S4 で開いた entry が PKC dialect を含むと、装飾が一切効かず
  「ただの paragraph / 半端な structure」として表示される。
- **目指す**:base.css の該当 rule をすべて S4 inline `<style>` に mirror。
- **アプローチ**:1 PR で category 別に整理して一気に追加(`rendered-
  viewer.ts` がやっているのと同じ流儀 ── PR-2L / PR-2K / PR-2N 各々の
  追加で S2 にやった mirror を、S4 にも同等に投入する)。`base.css` の
  該当 section と `rendered-viewer.ts` の同 section を **2 surface 並列で
  diff れる構造**にすることで、今後の新 dialect 追加時に「3 surface 全部
  に CSS mirror が要る」が見渡せる。
- **size**:大(80〜200 行 CSS + test、特に visual parity test を 1 件
  以上添付)。
- **priority**:🔥 **High** ── critical な PKC dialect 群が全部効かない
  のは user 体感が悪い。S4 が editor / viewer 兼用なので影響が大きい。

### Gap-14 S4 で `applyHeadingFold` 未連動 ── ✅ **RESOLVED**(pgc-97、pgc-203 audit reconcile 確認)

`entry-window.ts:149` で `applyHeadingFold(tmp)` 呼び済。本書では「open」 のまま残存していたが pgc-203 grep で resolve 済を確認。

- **発生**:S4 全 path で `applyHeadingFold` を呼ばない。
- **現状**:見出し折りたたみが S4 では機能しない。center pane で折りた
  ためた entry を別窓で開くと、見出しが折りたためない。
- **目指す**:S1 / S2 と等価 ── `renderMarkdown` の返り値を一旦 DOM に
  流して `applyHeadingFold` を呼ぶ。S4 builder 側で完結する(opener
  bridge 不要、`renderMarkdown` 返り値の HTML 文字列を `<template>`
  経由で DOM 化 → `applyHeadingFold` → `innerHTML` 取り直し、で push
  可能)。CSS mirror も同時に(Gap-13 と統合)。
- **アプローチ**:`pushViewBodyUpdate` / `renderViewBody` / `buildText-
  logViewBodyHtml` 各々で適用。`renderEntryPreview` の live preview は
  Gap-5 と同じ判断(call も off 推奨)。
- **size**:中。
- **priority**:🟡 Mid。

### Gap-15 S4 で `expandTransclusions` / `hydrateCardPlaceholders` 未連動 ── ✅ **RESOLVED**(pgc-96、pgc-203 audit reconcile 確認)

`entry-window.ts:135-145` で `expandTransclusions(tmp, {...})` + `hydrateCardPlaceholders(tmp, {...})` 呼び済。本書では「open」 のまま残存していたが pgc-203 grep で resolve 済を確認。

- **発生**:S4 全 path で 2 op 未連動。
- **現状**:`![](entry:LID)` transclusion / card-link が placeholder の
  まま、別窓で開いても展開されない。center pane で展開されたものが、
  別窓で開くと placeholder に戻る。
- **目指す**:S1 / S2 と等価。ただし inline script から features 層を
  呼ぶ経路は無く、**親側で expandTransclusions / hydrateCardPlaceholders
  まで処理した HTML 文字列を子に push する**設計が canvas 前方互換
  (spec §11.3)。
- **アプローチ**:
  - parent 側で `expandTransclusions` + `hydrateCardPlaceholders` を
    かけた完成 HTML を `pushViewBodyUpdate` で push する経路に集約。
  - 初期描画(`buildWindowHtml` で `document.write`)も同様 ── parent
    側で `renderMarkdown` → DOM 化 → 2 op → `innerHTML` の chain を回し
    て **完成 HTML 文字列** を `renderedBody` に埋め込む。
  - inline script 側は何もしない(完成済 HTML を `#body-view.innerHTML`
    に挿すだけ、すでに `pushViewBodyUpdate` 経路がやっている)。
- **size**:大(Gap-13 の CSS mirror と pair で進める)。
- **priority**:🔥 **High** ── transclusion / card-link は wave-Z で
  重要視されている機能、別窓で消えるのは user 体感悪い。

### §5.X Gap summary table

| Gap | surface | category | priority | size | 推奨先行・後続関係 |
|---|---|---|---|---|---|
| Gap-1 | S2 / S3 live / S4 | renderMarkdown opts | 🔥 | 中 | 前提 |
| Gap-2 | S2 | features 層 DOM op | 🔥 | 小 | Gap-1 後 |
| ~~Gap-3~~ | ~~S2~~ | ~~renderMarkdown opts~~ | ~~N/A~~ | ~~N/A~~ | **VERIFIED OK(non-gap)** |
| Gap-4 | S3 init + live | renderMarkdown opts | 🟡 | 小〜中 | OQ-S3-1 |
| Gap-5 | S3 | features 層 DOM op | 🟡 | 小〜大 | OQ-S3-2 |
| Gap-6 | S4 全 path | preprocess | 🔥 | 中 | 独立 |
| Gap-7 | S4 全 path | renderMarkdown opts | 🟡 | 小 | Gap-6 と同 PR 可 |
| ~~Gap-8~~ | ~~S4 全 path~~ | ~~preprocess + CSS~~ | ~~🟡~~ | ~~中~~ | ✅ **RESOLVED pgc-98**(2026-05-23、wave-β 完了) |
| Gap-9 | S4 textlog | asset resolution | 🟡 | 中 | OQ-S4-2 |
| Gap-10 | S2 | CSS mirror | 🟡 | 小 | 独立 |
| Gap-11 | S2 / S4 | interactive CSS | 🟡 | 中 | OQ-S4-1 |
| Gap-12 | S2 | chrome CSS | 🟢 | 小 | OQ-S2-1 |
| Gap-13 | S4 | CSS mirror(critical PKC dialect)| 🔥 | 大 | 独立(Gap-15 と pair)|
| Gap-14 | S4 全 path | features 層 DOM op | 🟡 | 中 | Gap-13 後 |
| Gap-15 | S4 全 path | features 層 DOM op | 🔥 | 大 | Gap-13 と pair |

---

## §6 後続実装計画(pgc-78〜)

優先度 + 依存関係 + size を踏まえた **推奨 PR 順**:

| PR(候補)| Gap | scope | size | base 候補 |
|---|---|---|---|---|
| **pgc-78** | — | **本環境 Playwright 復旧**(`tests/{smoke,bench}/playwright.config.ts` に `PKC_PRE_INSTALLED_CHROMIUM` env-aware override 追加)。CI 無影響、Tier-A 29 spec green。後続 PR で visual parity test 添付を default に格上げ可能 | 小 | pgc-77 |
| **pgc-79** | Gap-1 + Gap-2 | S2 + S3 live + S4 全 path に `currentContainerId` thread + S2 に `hydrateCardPlaceholders` | 中 | pgc-78 |
| **pgc-80** | Gap-6 + Gap-7 | S4 全 path に frontmatter strip + extractVars + headingNumber 連動 | 中 | pgc-79 |
| **pgc-81** | Gap-10 + Gap-12 | S2 inline CSS の chrome 4 件 + task / TOC current mirror | 小 | pgc-80 |
| **pgc-82** | Gap-13(category 1)| S4 inline CSS に :::section / :::details / :::figure / :::quote mirror | 中 | pgc-81 |
| **pgc-83** | Gap-13(category 2)| S4 inline CSS に blank-line / tolerant alias / em-dot / html-render / variable / hallucination mirror | 中 | pgc-82 |
| **pgc-84** | Gap-15 | S4 全 path で expandTransclusions + hydrateCardPlaceholders を parent 側完成 HTML 経路に統合 | 大 | pgc-83 |
| **pgc-85** | Gap-14 | S4 全 path で applyHeadingFold を parent 側完成 HTML 経路に統合 | 中 | pgc-84 |
| **pgc-86** | Gap-8 | S4 全 path に extractDocumentGlobals 連動 + inline CSS mirror | 中 | pgc-85 |
| **(保留)** | Gap-4 + Gap-5 | S3 の globals / 3 op の挙動を OQ-S3-1 / OQ-S3-2 で確定 → 必要なら追加 PR | 小〜大 | OQ 解決後 |
| **(保留)** | Gap-9 | S4 textlog asset resolution を OQ-S4-2 で確定 → 必要なら追加 PR | 中 | OQ 解決後 |
| **(保留)** | Gap-11 | S4 table interactive を OQ-S4-1 で確定 → 必要なら追加 PR | 中 | OQ 解決後 |

**全体規模**:9 PR(pgc-78 tooling + Gap 8 件)× 中サイズ平均 = wave-10-2
程度の大きさ。Gap-13 / Gap-15 は CSS / DOM op 両方を pair で扱うので
最大ピーク。

**進め方**:
1. 本 pgc-77 を user に提示 → audit + Gap 一覧 + 後続計画の合意を得る。
2. **pgc-78(Playwright 復旧)を先に着地**(2026-05-23、user 報告対応)。
   これで本環境でも parity test が回せるようになり、後続 Gap 解消 PR で
   **visual parity test 1 件以上を default 添付** にできる。
3. **OQ 群**(OQ-S2-1 / OQ-S3-1 / OQ-S3-2 / OQ-S4-1 / OQ-S4-2)を
   user に問う。回答が得られた Gap から PR を切り出す。
4. pgc-79〜pgc-86 を順次 stack。各 PR は前 PR 頂点を base にして派生。
4. 各 PR で **unit test(必須)+ visual parity test(視覚機能なら 1 件
   以上、CLAUDE.md §10 規律)** を添付。
5. 各 PR で **CHANGELOG_v2.3.0.md に 1 行追記**(CLAUDE.md 規律)+
   **doc-archival-discipline §6.1 に従い該当 spec / roadmap の status を
   進める**。
6. 本 audit doc(pgc-77)は **進行中 spec として LIVE 配置**。全 Gap 解消後
   に completed/ へ archive。

---

## §7 Open Questions(user 判断待ち)

- **OQ-S2-1**:S2(Viewer popup)に `pkc-task-badge` / `pkc-toc-current` の
  CSS mirror は必要?
- **OQ-S3-1**:S3(Split View preview)で `extractDocumentGlobals` を反映
  すべき? 縦書き / RTL の textarea 編集体験との兼ね合いは?
- **OQ-S3-2**:S3 で `expandTransclusions` / `hydrateCardPlaceholders` /
  `applyHeadingFold` の 3 op を呼ぶべき? caret 同期 contract との
  trade-off は?
- **OQ-S4-1**:S4(entry-window editor)で table sort / filter / copy-md
  等の interactive UI を有効にすべき? editor 用 / viewer 用で差を付けるべき?
- **OQ-S4-2**:S4 textlog の per-log で asset reference resolution を
  対応する? Slice 4-A 時点の保留事項を解消するか?

---

## §8 既知制約(構造的で解消方針なし)

- **S2 / S4 の inline CSS mirror が必要なのは構造的**:`window.open() +
  document.write()` で開く独立 document は親 document の外部 CSS を取り
  込めないため、必要 rule を inline `<style>` に mirror する以外の手段が
  ない。これは canvas 化 / wasm 化(Phase δ)でも変わらず、CLAUDE.md §9 が
  formal 化した「3 surface verify を default checklist」が引き続き必要。
- **S4 inline script から features 層を呼べないのは構造的**:`document.
  write` で開いた子 document は main bundle を import できない。子に
  features 層 op を持たせるには (a) opener 経由 bridge、(b) inline script
  に同等処理を duplicate のいずれか。本 audit の Gap-14 / Gap-15 は (a)
  + parent 側で完成 HTML を作って push する経路に集約する解(canvas 前方
  互換、spec §11.3 と同方向)を推す。
- **S5 monitor は markdown を render しない**:`MonitorItem.text` を plain
  text として `.pkc-monitor-item` に並べる構造。markdown を render したい
  なら別 spec で「monitor が markdown を扱う profile」を起こす必要がある
  (本 audit の scope 外)。

---

## §9 関連 doc / 参照

### 上位 doctrine

- `CLAUDE.md` §9「surface 別 dual-render path」 ── wave-10-2 で formal 化
  された 3 surface 規律。本 audit は 5 surface に拡張。
- `CLAUDE.md` §10「preprocessor pipeline で LineMap thread」 ── 本 audit
  の Gap-6(S4 frontmatter strip)を実装する際の thread rule 規約。
- `CLAUDE.md` §11「fenced code block 内では preprocessor 全件 skip」 ──
  同様。

### 上位 spec / 隣接 spec

- `docs/development/markdown-render-scope.md` ── どの archetype / field が
  markdown を render するかの canonical contract。本 audit の前提 doc。
- `docs/development/multi-window-vscode-extension-spec-2026-05.md` §3 ──
  S4 viewer role / S5 monitor role の spec。γ-A5-1〜A5-6 着地済、A5-7
  視覚 parity 保留(本 audit がその visual parity 検証の前段に当たる)。
- `docs/development/markdown-dialect-extensions-spec-2026-05.md` ── PKC
  dialect 群(L-1〜L-9 / M-7 / R-A〜R-C / PR-2A〜2W 等)の canonical 仕様。
  Gap-13 の CSS mirror 対象群はここから派生。
- `docs/development/visual-state-parity-testing.md` ── 各 Gap 解消 PR に
  添付すべき visual parity test の methodology。
- `docs/development/debug-via-url-flag-protocol.md` ── user 報告時の
  「動かない」を再現する `?pkc-debug=<feature>` URL flag 規約。本 audit の
  Gap 解消後、user 報告で「特定 surface で X が出ない」と来た場合の
  `?pkc-debug=render-surface-parity` 等の overlay を将来追加する余地あり
  (本 PR の scope 外)。

### 関連 hotfix 履歴

- `docs/development/completed/bug-section-blockquote-lazy-continuation-2026-
  05-18.md` ── 同 wave 内の 3 surface 不整合 hotfix の 1 件。共有 utility
  化(`colon-block-normalize.ts`)で center / Viewer / Split View 同時解決
  したのが好例。本 audit の Gap 解消も「共有 utility / 共通 preprocess」
  方向に寄せる(wrapper helper を 1 つ、各 surface が呼ぶだけにする)。
- `docs/release/CHANGELOG_v2.3.0.md` の wave-10-2 関連エントリ ── 5 件の
  3-surface 不整合 hotfix の教訓(Viewer CSS / Viewer transclusion /
  Split View sentinel glyph 漏れ / Split View 行ズレ / fenced code marker
  誤発火)。

---

## §10 進捗 / history

| date | event |
|---|---|
| 2026-05-22 | 本 audit 起こし。5 surface 定義 + `renderMarkdown` opts / preprocess / features 層 DOM op / CSS mirror の 4 軸で比較 → Gap-1〜Gap-15 と後続 PR 計画 pgc-78〜pgc-86 を提示。OQ-S2-1 / OQ-S3-1 / OQ-S3-2 / OQ-S4-1 / OQ-S4-2 を user 判断待ちとして記録 |
| 2026-05-23 | **後続 PR 計画を更新**(user 報告対応):PR #455(2026-05-17)の `@playwright/test` 1.56.1 → 1.60.0 bump で本環境(Claude Code on the Web)の pre-installed v1194 chromium と version 不一致 + `cdn.playwright.dev` 等 Playwright CDN が network allowlist で 403 のため、smoke が起動できなかった。**pgc-78 で env-aware executablePath 上書き** を追加し、本環境で v1194 を直接使う経路を回復(CI 無影響、Tier-A 29 spec 実機 green 確認)。これに伴い後続 Gap 解消 PR を pgc-78 → pgc-79〜86 にシフト、各 PR で **visual parity test 添付** を default にできるようになった ── multi-window spec §9 A5-7 も同じ理由で「保留」→「着手可能」に格上げ |
| 2026-05-23 | **wave-β 完了(全 15 Gap 解消)**。pgc-78〜98 の 11 PR で Gap-1〜Gap-15(non-gap の Gap-3、OQ 保留の Gap-4 / 5 / 9 / 11 / 12 除く 11 件)を一掃。**最終着地 pgc-98 = Gap-8(S4 entry-window で `extractDocumentGlobals` 連動 + `<div data-pkc-writing="…" dir="…" data-pkc-doc-align="…" data-pkc-layout="…">…</div>` wrapper 経路 + inline CSS mirror)**。S1 canonical は `.pkc-md-rendered` 自身に attr を載せるが、S4 は `#body-view` `innerHTML` を介すため wrapper 1 段挿入(postMessage protocol 変更ゼロ)。全 440 file / 8928 unit test pass、typecheck + build green。wave-β 着地完了 → wave-γ(shell redesign 25 PR)に移行可能 |
