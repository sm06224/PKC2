# PKC2 Markdown 方言拡張 + IR 連動 spec(2026-05-07、wave-10-2 起点 draft)

**Audience**: 人間(設計議論 / 実装者 / レビュアー)。background / trade-off / 業界事例 / 設計議論を含む。
**AI authoring 向け規約書**: `../spec/markdown-dialect-for-ai-authors-v1.md` ── 本書から「設計議論」を取り除き、LLM 書き手が PKC2 entry を生成する際の構文規約だけを self-contained に提示。AI が markdown を生成する場面では本書ではなく **AI 規約書 v1 を直接参照** すること。

**Status**: draft(user review 中、syntax 確定前)
**Wave**: 10-2(markdown 方言拡張)
**Vision link**: `pkc2-vision-modern-emacs-2026-05.md` §4 — 「org-mode-class モダン版」獲得の中核 wave
**IR link**: `intermediate-representation-audit.md` §1〜5 — 本 spec の入力形式と AST shape の設計入口

---

## 0. 序

### 0.1 動機

PKC2 を **emacs / org-mode のモダン非プログラマ向け実装 + AI 一級市民 + 単一 HTML 自己完結** に押し上げる(`pkc2-vision-modern-emacs-2026-05.md`)。その達成手段として:

1. **markdown を Word / PPT / PDF 級の組版・印刷物に届く表現力** に拡張する
2. 拡張は **simple / robust / render+diff 適性** を死守する
3. 拡張は **PKC2 IR**(10-3、計画中)を経由して各 format に lossless 〜 lossy で射影する
4. autocomplete / hover / lint 等の **編集 UX** が IR 連動で機能する

### 0.2 スコープ(本 spec)

- markdown 拡張記法 20+ 系統の syntax + semantics 定義
- IR との対応(AST shape の暫定形)
- 各 format(HTML / Word / PPT / PDF / LaTeX / ePub / org / Pandoc MD / JSON)への射影マトリクス
- 編集 UX(autocomplete / hover / slash snippet / lint)
- Phase 分割(Light → Medium → Heavy で実装 wave へ)
- 表記衝突 候補の open question(user 議論待ち)

### 0.3 Out of scope(別 spec)

- IR 自体の AST shape 確定(`intermediate-representation-audit.md`、別 wave)
- Word / PPT export engine 自体(別 wave、PKC-extension 経由想定)
- spreadsheet archetype 本体(10-4、別 wave)
- PKC-Message v2 + extension 機構(10-5、別 wave)

### 0.4 用語

- **PKC2-MD**:本 spec で定義する markdown 方言
- **IR**:PKC2 内部中間表現(JSON/AST、10-3 で確定予定)
- **canonical form**:IR 上の正規形(同じ意味の記法は IR に正規化される)
- **directive**:`:::name{attrs}` block / `:name{attrs}` inline の拡張機構
- **role**:section / page / slide の意味的役割(template_kind ごとに定義)

---

## 1. 設計原則

### 1.1 簡便 / 堅牢 / render+diff 適性

| 原則 | 意味 | 具体策 |
|------|------|--------|
| **簡便** | 入力 cost 最小、暗記不要 | 1-3 char autocomplete trigger、略記 alias |
| **堅牢** | parse 曖昧性なし、衝突最小 | 既存 markdown 文法と意図的に分離、衝突は frontmatter で override 可 |
| **render** | format 間で意味が保たれる | 各拡張に「意味」と「format 別表現」の table を持つ |
| **diff** | 行単位変更で最小ノイズ | block-level は own-line、長 attrs は YAML 多行化、inline は最小限 |

### 1.2 IR 経由の format 横断

```
PKC2-MD source
   ↓ parse
PKC2 IR(canonical AST + format-specific hints)
   ├→ 一般 Markdown(CommonMark / GFM / Pandoc)
   ├→ プレビュー HTML
   ├→ HTML → PDF
   ├→ Word(.docx) → PDF
   ├→ PPT(.pptx) → PDF
   ├→ LaTeX → PDF
   ├→ ePub
   ├→ ODT / ODP
   ├→ AsciiDoc / DocBook
   ├→ Org-mode(.org)
   ├→ JSON / YAML(IR serialized form、AI extension が消費)
   ├→ TiddlyWiki tiddler
   └→ Anki .apkg(TEXTLOG → flashcard、AI 学習補助)
```

可逆性は format によって異なる:
- HTML / Word / PPT:**lossless 目標**(Word/PPT は限定的、layout 細部は妥協)
- PDF:**lossy**(印刷物として fix、source への戻りなし)
- 一般 Markdown / Org:**lossy compatible**(拡張は標準記法に degrade)

### 1.3 1-3 char autocomplete trigger

**簡便性の根拠**は editor の autocomplete に依存。trigger pattern は spec で固定:

| Trigger | 候補 source | 候補数想定 |
|---------|-----------|----------|
| `[` | block-ref / entry / term / link / image など複合 menu の親 | 4-6 種 |
| `[^` | block ref(同 doc 内 implicit + explicit ラベル) | doc 規模依存 |
| `[t:` | term ref(canonical 一覧) | 10-100 |
| `[e:` | entry ref(relation ranked + 全 entry) | 10-1000 |
| `[i:` | image / figure ref(同 doc 図版番号) | doc 内 |
| `[#` | section anchor(heading path 候補) | doc 内 |
| `[@` | auto-numbered ref(@fig-X / @tab-Y / @eq-Z) | doc 内 |
| `:::` | block directive(name 候補) | spec 固定 list |
| `+++` | section break(role 候補) | spec 固定 list |
| `==` | highlight(色 alias 候補) | spec 固定 list |
| `[[` | inline 装飾(ruby / em / note) | spec 固定 list |
| `:` (line-start) | inline shorthand `:text:attrs:` | spec 固定 list |
| `{{` | variable / macro 参照 | frontmatter / macros 定義 |

editor は trigger 検出 → IR or spec 固定 list から候補生成 → popup。実装は別 wave(K. autocomplete engine、Heavy)。

### 1.4 修飾の行継続規則

長い attribute / 多 modifier は markdown の可読性を下げる。**3 種類の継続規則** を許容:

#### S-1. Heading の attrs 多行化(Pandoc 風拡張)

```markdown
## はじめに {
  #intro
  .important
  data-toc-depth=1
  data-numbering=skip
}

short 形は単一行も維持:

## はじめに {#intro}
```

#### S-2. Block directive の YAML attrs

```markdown
:::section
align: justify
margins: { top: 30mm, bottom: 30mm }
header_role: chapter
---
本文 ...
:::
```

`---` で attrs 終了、本文開始を明示(frontmatter と同 delimiter で統一)。short 形 `:::section{align=justify}` は維持。

#### S-3. Inline 修飾の改行継続(限定)

inline 修飾子 直後の改行は wrap 内とみなす:

```markdown
これは
==[red]とても長い強調テキスト
複数行にまたがる==
の例。
```

→ IR は `<mark>` 相当のノードに改行込み内容を保持、render 時に format 毎に処理。

---

## 2. 構造拡張(Document-level)

### 2.1 Frontmatter(既存、規約強化)

```yaml
---
title: "PKC2 Markdown 方言拡張 spec"
author: "PKC2 team"
date: 2026-05-07
template_kind: report   # | book | report | slide | article | letter
anchor_style: numeric   # | slug | hybrid (default: numeric)
page:
  size: A4              # | Letter | A3 | A5 | { width: 210mm, height: 297mm }
  orient: portrait
  margins:
    default: { top: 25mm, right: 20mm, bottom: 25mm, left: 30mm }
header:
  default: "{{doc.title}} — {{section.h2}}"
footer:
  default: "— {{page.current}} / {{page.total}} —"
vars:
  project: "ALPHA-7"
macros:
  signature: |
    {{vars.client}} 御中
glossary_inherit_from:
  - entry:glossary-pkc-core
syntax_overrides:
  page_break: "==="     # default "+++"(escape hatch)
export:
  inline_referenced: false
publish_to_container_index: true
---
```

詳細は §9 参照。

### 2.2 Backmatter(NEW、user 案)

末尾 `---` 後の YAML:

```markdown
---
title: "..."
---

本文 ...

---
# backmatter — diff-friendly、format 毎に消費されるか hidden
bibliography:
  - { id: smith2020, title: "...", author: "Smith", year: 2020 }
slide_notes:
  cover: "オープニングは温かく"
revision_log:
  - { date: 2026-05-07, by: "claude", note: "初版" }
shadow_references:        # 部分 export 時に自動付与(L 参照)
  - { lid: B, title: "Bの題名", url: "pkc2://container-X/B" }
ai_metadata:
  generation_model: "claude-opus-4-7"
---
```

- diff:YAML の各 entry が独立行、変更が局所化
- render:HTML/Word では bibliography だけ末尾出力、PPT では slide_notes が speaker notes に流れる
- robust:CommonMark `---` を流用、parser 拡張は frontmatter と同機構の sym

### 2.3 Section break(`+++`)

```markdown
通常本文 ...

+++             ← page/slide break(default role=auto)

別の段落 ...

+++ {role=section}   ← セクション区切り(template_kind=slide なら新セクションスライド)

## 章 2          ← 自然な section break(heading での暗黙区切り)
```

#### Role 候補(spec 固定 list、autocomplete で popup)

| role | 意味 | format 別の挙動 |
|------|------|---------------|
| `auto` | template_kind から推論 | book → page、slide → slide、report → page |
| `cover` | 表紙 / カバースライド | page 0、margins=cover、no header/footer |
| `toc` | 目次ページ | roman 番号、TOC auto-fill |
| `body` | 本文 | margins=default、header/footer=default |
| `section` | セクション区切り | book → page break、slide → section slide |
| `landscape` | 横向き | margins=landscape、orient=landscape |
| `appendix` | 付録 | 番号 prefix 変更(A-1, A-2) |
| `bibliography` | 参考文献 | backmatter から自動充填 |
| `index` | 索引 | term registry から自動充填 |

**入力代替記号**:`+++` は推奨、frontmatter で `syntax_overrides.page_break` で `===` / `///` / `;;;` 等に変更可。`@@@` は却下(2-handed typing 困難)。

### 2.4 Page layout(orient / margins / header / footer / variables)

#### O-1. Orientation 切替

```markdown
+++ {orient=landscape}
横長コンテンツ ...
+++ {orient=portrait}
```

ブロックスコープ:

```markdown
:::landscape
| 列 1 | 列 2 | ... | 列 12 |
:::
```

#### O-2. Margins

frontmatter `page.margins` で role 別 default、`+++ {role=...}` で section 適用。

#### O-3. Header / Footer + 変数

frontmatter `header` / `footer` の role 別テンプレート、render 時に変数置換。

#### O-4. 標準変数(spec 固定)

```
{{doc.title}}        — frontmatter title
{{doc.author}}       — frontmatter author
{{doc.date}}         — frontmatter date or export date
{{page.current}}     — 現在ページ番号(arabic)
{{page.roman}}       — 同(roman)
{{page.total}}       — 総ページ数
{{section.h1}}       — 直前 H1 テキスト
{{section.h2}}       — 直前 H2 テキスト
{{section.path}}     — 1.2.3 階層 path
{{slide.current}}    — 現在スライド番号(PPT)
{{slide.total}}      — 総スライド数
{{export.format}}    — 出力 format 名
{{export.timestamp}} — 出力時刻
```

任意拡張:frontmatter `vars: { x: y }` で `{{x}}` 参照。

#### O-5. ページ番号制御

```yaml
page_numbering:
  cover: false            # 表紙はカウントしない
  toc: roman              # 目次は i, ii, iii
  body: arabic_restart    # 本文 1 から再開
  appendix: "A-{n}"       # A-1, A-2, ... 形式
```

#### O-6. bleed / safe area(印刷物専用)

```yaml
print:
  bleed: 3mm
  safe_area_padding: 5mm
```

### 2.5 Conditional content(`:::if`)

```markdown
:::if{format=docx}
Word でだけ表示する詳細表 ...
:::

:::ifnot{format=html}
HTML preview では出さない printer-only な凡例 ...
:::
```

条件:`format` / `template_kind` / `audience` / 任意 frontmatter var。IR には条件付きノードとして保持、render 時に format 評価で含める/含めない。

---

## 3. 構造拡張(Block-level)

### 3.1 Block label / 暗黙ラベル

#### 暗黙 ID 規則(implicit)

| 種類 | 暗黙 ID 生成法 |
|------|---------------|
| heading | **heading path numbering**(`1-2-3`) |
| `[term: …]` | `term-` + slugified term(`term-pkc2`) |
| 段落 | content hash(`h7d3a1`、最初 6 char) |
| code fence | `lang-順序`(`js-1`) |
| 明示 `[#id]:` | user 指定 |

**heading path scheme**:`anchor_style: numeric`(default、`1-2-3`)/ `slug`(`gaiyou-haikei`)/ `hybrid`(`1-2-3-haikei`)。

#### Explicit label(escape hatch)

```markdown
[#thesis-1]: ## 主張 1

PKC2 は org-mode のモダン版である。
```

または heading attribute 形式:

```markdown
## 主張 1 {#thesis-1}
```

### 3.2 Block ref(自己 doc + cross-entry)

```markdown
[^thesis-1]                — 同 doc 内 ref
![](#thesis-1)             — 同 doc 内 transclusion
[entry:lid]                — 別 entry へ link(全文 navigate)
[entry:lid#thesis-1]       — 別 entry の特定 block へ
[entry:lid#thesis-1]{embed=true} — 別 entry block を transclude
[t:PKC2]                   — 用語 ref(short 形)
[term-pkc2]                — 同(IR canonical 形)
[i:fig-flow]               — figure ref(short 形)
[@fig-flow]                — auto-number ref(「図 1」展開)
```

### 3.3 用語定義 + glossary + index + lint(I)

```markdown
[term: PKC2]
: Portable Knowledge Container, Generation 2
: 別表記:PKC、PKC v2、PKC2.0
: index:    primary    # 索引で太字
: lint:     warn       # 別表記検出で警告

[term: org-mode]
: emacs の outline + property 機構
: 別表記:Org-mode、orgmode、org モード
: index:    secondary
: lint:     suggest
```

#### 自動生成 directive

```markdown
+++ {role=glossary}    — 用語集ページ
+++ {role=index}       — 索引ページ
+++ {role=toc}         — 目次ページ

または block 形式:

:::toc{depth=3}
:::glossary
:::index
```

#### 機能展開(1 markup → 6 機能)

```
[term: ...] markup
   ↓ IR(term registry: canonical + aliases + index_priority + lint_level)
   ├── Glossary(format 毎):book/report 巻末、HTML 専用 page
   ├── Index(format 毎):book/report 巻末、Word index、PDF index
   ├── Lint:本文 編集中に表記揺らぎ警告
   ├── Tooltip(HTML):hover で定義 popup
   ├── Speaker notes(PPT):用語が初出するスライドの notes に定義流入
   └── Container Index:cross-entry 用語追跡(新 archetype `glossary` の候補)
```

### 3.4 Comments(`%%` / `%%%`)

```markdown
%% inline comment、export では完全削除 %%

通常本文 ...

%%% block comment(複数行可)
TODO: ここに表を入れる
担当:user
%%%
```

IR には保持(差分・履歴目的)、全 format で hidden、optional に Word の「コメント機能」へマッピング。

### 3.5 Auto-numbered references(図 / 表 / 式)

```markdown
:::figure{#fig-flow}
![](asset:flowchart.png)
^^^ 全体フロー
:::

本文 → 図 [@fig-flow] を参照。

:::table{#tab-perf}
| ... |
^^^ 性能比較
:::

→ 表 [@tab-perf] 参照。

:::equation{#eq-energy}
E = mc^2
^^^ アインシュタインの式
:::

→ 式 [@eq-energy]
```

- `[@id]` は format 毎に「図 N」「表 N」「式 N」に展開(template_kind 依存)
- caption は `^^^` 行(directive 末尾、視認性高)
- 番号は doc 全体の出現順で自動採番
- 拡張:`[@id+title]` で「図 N: 全体フロー」と title 付き

### 3.6 Variables / macros(W)

**Status(2026-05-08)**: **Phase 2 第 1 弾として `{{vars.x}}` 着地**。frontmatter `vars:` block(YAML object)or `vars.<key>:`(flat dot)から render 時に展開、未定義は `<span class="pkc-variable-undefined">` で visible warning。`{{macros.x}}` の block 展開は **Phase 2 で defer**(spec §11 既決定)。詳細仕様 / when-to-use は AI 規約書 v1 §2.12 / Manual 章 12 §12.6 を参照。OQ-6(展開 timing)は本実装で render 時に確定。

**Status(2026-05-08 follow-up)**: M-7 第 1 弾着地後の user 報告「embed した TEXTLOG エントリで frontmatter が露出する(プレビュー表示もされていない)」を hotfix。embed 経路(`transclusion.ts` の `renderEmbeddedLog` / `renderEntryEmbed`)、Viewer popup TEXT path(`rendered-viewer.ts` の `buildBodyHtml`)、平文 fallback(`detail-presenter.ts` / `textlog-presenter.ts` の non-markdown 経路)で `parseFrontmatter(...).body` が抜けていた 5 経路を contract 化。embed 経路では vars 展開も同時に有効化。視覚 parity smoke 1 件追加(`wave-10-2-phase2-m7-embed-frontmatter-parity.spec.ts`)。これで center / Split View / Viewer / embed / 平文 fallback の **6 surface すべて**で frontmatter strip + vars 展開が一致。

**Status(2026-05-08 YAML natural extension)**: user 議論「YAML 標準が user 期待」を踏まえ、自然な YAML 記法を通せるよう parser を再構築。**新対応**:nested mapping(深度 ≤ 4)/ block scalar `|`(literal)+ `>`(folded)/ quoted-aware comment(`"a # b"` の `#` は comment 扱いしない bug 修正)。**防御層**:16 KB / 100 keys / depth 4 / array 500 / value 4 KB の soft cap + 禁止 key(`__proto__` / `constructor` / `prototype`)+ 可視 warning banner(`pkc-frontmatter-warning`、silent fail 廃止)。**out of scope**:anchors / aliases / merge keys / type tags / chomping(`|-` `|+`)/ indent indicator(`|2`)— natural な記法には不要、要望ベースで後追い。snippet `/pkcfm*` 7 件(`/pkcfm` / `/pkcvars` / `/pkcfmbook` / `/pkcfmpaper` / `/pkcfmvideo` / `/pkcfmpage` / `/pkcfmnote`)を登録、コメント付きテンプレで穴埋め入力可能。

**Status(2026-05-08 Split View hotfix)**: 同 wave で user 実機テスト「Split View の表示がおかしい」報告から 2 件の bug 修正。(a) Split View edit mode preview で `![](entry:LID)` embed が preview に展開されていなかった(`detail-presenter.ts:renderEditorBody` 初回 render と `action-binder.ts:updateTextEditPreview` debounced の両経路で `expandTransclusions` 呼び出し抜け)。(b) frontmatter strip による line index ずれで、textarea 原文行と preview `data-pkc-source-line` が乖離、source-preview-sync が誤った block を highlight。**Fix**:`renderMarkdown` に `sourceLineOffset?: number` option を追加(internal lineMap 初期化を `[offset, offset+1, ...]` に変更、preprocessor lineMap thread と直交)、Split View preview の 2 経路で frontmatter strip 行数を計算 → `sourceLineOffset` で渡す + `expandTransclusions` を unconditional 呼出。視覚 parity smoke 1 件追加(`wave-10-2-phase2-m7-split-view-embed-frontmatter-parity.spec.ts`)で `data-pkc-source-line` が原文 line と一致 + transclusion section が preview に存在することを確認。


frontmatter:

```yaml
vars:
  project: "ALPHA-7"
  version: "v2.3.0"
  client: "Acme Corp"
macros:
  signature: |
    {{vars.client}} 御中
    プロジェクト {{vars.project}} {{vars.version}}
```

本文:

```markdown
本プロジェクト {{vars.project}} について ...

{{macros.signature}}
```

- `{{vars.x}}` は frontmatter 値展開
- `{{macros.x}}` は multi-line block 展開
- macro recursion は depth limit 5 で防御(spec 固定)
- container 共有:`glossary_inherit_from` 同等の `macros_inherit_from` を将来許容

### 3.7 Track changes / suggest(X、レビュー用)

```markdown
通常テキスト ::ins[挿入提案] ::del[削除提案] :: の混在。

%%% review by:claude on:2026-05-07
ここの数字、出典が古いので確認してほしい。
%%%
```

- `::ins[…]` / `::del[…]`(double-colon、`:::` block と区別)
- IR に「change tracking」layer として保存、Word の「変更の履歴」機能に直訳
- HTML preview は color コード(green/red)、PPT は無視 or comment 化

### 3.8 簡易ブロック記法(NEW、user 案 Y/Z)

```markdown
::: ||, bold, red
ここのブロックに書かれたものはセンター寄せ かつ 太字 かつ 文字色赤 になる
:::
```

- `:::` の直後に **directive 名なし** で attrs を書くと、暗黙的に `style` directive として解釈
- attrs:
  - **アライン記号**:`||` = center、`|>` = right、`<|` = left
  - **キーワード**:`bold` / `italic` / `underline` / `strikethrough` / `code` / `xs` / `sm` / `md` / `lg` / `xl`
  - **色**:`red` / `aliceblue` / `#ff0000` / `rgb(255,0,0)` 等の CSS color name または rgb 表記
  - **背景色**:`bg-` プレフィックス(`bg-black` / `bg-#000`)
- 順不同
- 複数 attrs はカンマ区切り

正規 form と等価:

```markdown
:::style{align=center, bold, color=red}
内容
:::
```

short / canonical 両方を許容、IR は canonical に正規化。

### 3.9 行頭アライン記法(NEW、user 案 Y)

行頭プレフィックスで段落単位のアライン:

```markdown
|| この段落はセンター寄せ
|> この段落は右寄せ
<| この段落は左寄せ(default なので明示は rare)
```

#### 適用範囲

- prefix のある **行から空行までの段落全体** に適用
- 継続行の prefix 省略可(初出行の prefix が paragraph に伝播)
- heading / list / table 等の構造要素には適用不可(段落のみ)

#### 例

```markdown
通常段落です。

|| センターの段落です。
|| 継続行も明示推奨ですが、省略しても継続適用されます。

|> 右寄せの段落、
   継続行は prefix 省略可。

通常段落に戻る。
```

#### IR 表現

paragraph node に `align` attribute を付与:

```ts
{ type: 'paragraph', align: 'center', children: [...] }
```

### 3.10 空行マーカー(`_` / `_<N>`、NEW、user 案 2026-05-07)

CommonMark は連続する空行を 1 つの paragraph 区切りに collapse するため、本文中に「ここに余白を 2 行ぶん入れたい」を素朴に表現できない。明示マーカーで vertical spacing を制御する。

#### 構文

```markdown
本文

_

本文(1 空行ぶん下)
```

```markdown
本文

_3

本文(3 空行ぶん下)
```

- `_` 単独行 → **1 空行ぶん**(default)
- `_<N>` 単独行(`<N>` は正の整数)→ **N 空行ぶん**
- 行内の他の文字と混ざる場合(`_word` / `word_`)は通常 emphasis token として markdown-it に流す

#### parse 規則

- `^_(\d*)\s*$` にマッチする行のみ blank marker と認識
- それ以外の `_` は通常 markdown(emphasis / 識別子)として処理
- 行頭インデントがある `   _` はマーカーとして扱わない(段落継続 / コード扱い)
- 数値 `<N>` は **1〜20** の範囲 clip(誤入力で 9999 行余白を作る事故を防ぐ、設計上限は実用域 + 余裕)

#### IR / HTML 表現

```ts
{ type: 'blank-line-spacer', count: 3 }
```

HTML へは `<div class="pkc-blank-line" data-pkc-blank-count="N" aria-hidden="true">` を出力。CSS で `--pkc-blank-line-h` × N の高さを取る。

#### Format mapping

| Format | 出力 |
|--------|------|
| HTML   | `<div class="pkc-blank-line" data-pkc-blank-count="N">`(高さ N 行ぶん) |
| Word   | N 個の `<w:p>` empty paragraph |
| PPT    | placeholder の vertical offset を line-height × N 加算 |
| PDF    | HTML 出力をそのまま print(同じ高さで blank space) |
| Markdown export(canonical) | そのまま `_<N>` を残す(idempotent round-trip) |

#### 例

```markdown
# 第 1 章

_2

導入 paragraph。

# 第 2 章
```

→ chapter 間に「自然な段落区切り(空行)」+「2 行ぶんの追加余白」が入る。

### 3.11 段落先頭 1 字下げ(`__` / `＿`、NEW、user 案 2026-05-08)

日本語文書の段落字下げ慣習(段落の最初の 1 文字を 1 字ぶん右に押す)を表現する markup。

#### 構文

```markdown
__段落本文(先頭 1 文字下がる)。
__ 半角スペース挟みも OK。
＿全角アンダースコア(U+FF3F)も等価。
```

- 行頭 `__`(半角 `_` × 2)or `＿`(全角 U+FF3F)→ 続く paragraph に 1 字下げ
- 行頭スペース系文字(半角 SP / TAB / 全角 SP)は無視(行頭系シンプル記法統一方針、2026-05-08)
- 後続の content に空白 0〜1 文字許容、それ以降が paragraph 本文

#### parse 規則(衝突回避)

- `___text` 等 `_` が 3 連続以上 → markdown horizontal rule / strong emphasis として通常処理
- 行末が `__` で閉じる場合(`__bold__`)は markdown bold の単独行と解釈、indent 化しない
- align prefix(L-5)と併用可:`|| __センター字下げ`(中央寄せ + 字下げ)

#### IR / HTML 表現

paragraph に `data-pkc-indent="1"` 属性を付与。CSS で `text-indent: 1em`(1 文字幅 = 現 font-size 1 文字)を適用。

```ts
{ type: 'paragraph', indent: 1, children: [...] }
```

#### Format mapping

| Format | 出力 |
|--------|------|
| HTML   | `<p data-pkc-indent="1">` + `text-indent: 1em` |
| Word   | `<w:p>` の `<w:pPr><w:ind w:firstLine="200"/>`(200 = 1 全角文字幅) |
| PPT    | placeholder の text frame に first-line indent |
| PDF    | HTML 出力をそのまま print(text-indent そのまま) |
| Markdown export(canonical) | そのまま `__` を残す(idempotent round-trip) |

---

## 4. 構造拡張(Inline-level)

### 4.1 Inline 修飾(G)

| 構文 | 意味 | HTML | Word | PPT |
|------|------|------|------|------|
| `==text==` | highlight | `<mark>` | 蛍光ペン | 強調 |
| `==[red]text==` | 色付き hl | `<mark style=...>` | カラー蛍光 | カラー強調 |
| `[[ruby:漢字\|かんじ]]` | ふりがな | `<ruby>` | フリガナ | フリガナ |
| `[[em:重要]]` | 圏点 | `<em class=dot>` | 圏点 | 圏点 |
| `[[note:^1]]` | 脚注参照 | superscript | 脚注 | (PPT は backmatter speaker notes へ) |

### 4.2 Blockquote 図形化(D)

```markdown
> 通常 quote(blockquote、HTML border-left、Word "引用" style、PPT 角丸 box)

>> 強調 quote(callout、HTML 装飾、Word 強調 box、PPT highlighted shape)

>>> 注意 quote(warning、HTML alert、Word warning shape、PPT 注意 box)
```

backmatter で意味割り当てを再定義可:

```yaml
quote_styles:
  '>':   default
  '>>':  callout
  '>>>': warning
```

明示 syntax(衝突回避):

```markdown
> {role=callout}
内容 ...
```

### 4.3 簡易インライン記法(NEW、user 案 Z)

```markdown
:**太字かつ赤字かつ背景色黒になる**:red, bg-black:
:太字かつ赤字かつ背景色黒になる:red, bold, bg-black:
```

#### 構文

```
:<内容>:<attrs カンマ区切り>:
```

- 内容には markdown inline 記法(`**bold**` / `*italic*` / `==hl==` 等)を許容
- attrs は §3.8 の attrs と同 vocabulary(bold / italic / 色 / bg- / size etc.)
- 内容で書ける効果(`**bold**`)を attrs(`bold`)で代替 可、両方併用も OK
- 順不同

#### parse 規則(衝突回避)

- `:` が trigger だが、attrs 部分は `[a-zA-Z0-9-,#()\s]+` のみ許容
- attrs から外れる文字(数値だけ・日本語・スペース連続など)があれば inline shorthand と認識せず、通常テキストとして parse(`12:30:00` のような時刻記法を誤認しない)

#### IR 表現

```ts
{
  type: 'inline-mark',
  attrs: { bold: true, color: 'red', backgroundColor: '#000' },
  children: [{ type: 'text', value: '内容' }],
}
```

### 4.4 修飾の行継続(S-3 既出)

inline 修飾子 直後の改行は wrap 内に保持:

```markdown
==[red]とても長い強調テキスト
複数行にまたがる==
```

### 4.5 表記法の vocabulary 統一

§3.8 簡易ブロック / §3.9 行頭アライン / §4.3 簡易インライン で **共通の attrs vocabulary** を使う:

| カテゴリ | 値 | 例 |
|---------|----|----|
| **アライン** | `\|\|` / `\|>` / `<\|` / `align=center/right/left/justify` | `\|\|, bold` |
| **強調** | `bold` / `italic` / `underline` / `strikethrough` / `code` | `bold, italic` |
| **色** | CSS color name / `#hex` / `rgb(...)` | `red, #ff8800` |
| **背景色** | `bg-<color>` / `background=...` | `bg-black, bg-#222` |
| **サイズ** | `xs` / `sm` / `md` / `lg` / `xl` / `2xl` / `3xl` / `<N>%` / `<N>em` | `lg, bold`、`120%`、`1.5em` |
| **font-family** | `serif` / `sans` / `mono` / `font=Noto Sans JP` | `mono` |

統一 vocabulary により autocomplete も簡単(spec 固定 list、~30 item)。

---

## 5. CSV / Spreadsheet

### 5.1 CSV cell 書式(E)

```markdown
```csv
~ string, ~ number{decimals=2, sep=','}, ~ percent{decimals=1}, ~ date{fmt=YYYY-MM-DD}
名前, 売上, 達成率, 締切
山田, 1234567.89, 95.5, 2026-05-07
鈴木, 567890.12, 82.3, 2026-05-15
```
```

- 1 行目に `~` 型注釈 row(本文 row には影響しない、diff 安全)
- HTML render で number 列は右揃え、percent は `%` 付加、date は `<time>`
- Word/PPT export で表のセル format に直訳
- 不明型は string fallback

### 5.2 Spreadsheet entry の embed(F)

```markdown
![計算表](entry:budget-2026)              # 静的 snapshot embed
![計算表](entry:budget-2026){live=true}   # 編集と連動、PKC2 内で再評価
![計算表](entry:budget-2026){export=values-only}  # Word/PPT は値のみ展開
```

- HTML preview:`<iframe>` か inline render、live=true なら state hook
- Word export:値のみ展開した table(static snapshot)
- PPT export:値のみ table 付き slide
- IR は `entry:lid` reference を保持、render 時に各 format で展開

将来:**新 archetype `spreadsheet`**(10-4 wave)が着地後に live 連動を実装。

---

## 6. Editor UX

### 6.1 Autocomplete(1-3 char trigger)

§1.3 の trigger 表参照。実装は **Heavy**(K wave)、IR registry を読む engine が必要。

### 6.2 Hover preview

editor で `[^id]` / `[entry:lid]` / `[t:term]` 上にカーソル hover で popup:

- 同 doc 内 ref:該当 block の冒頭 80 文字
- cross-entry ref:対象 entry の title + body 冒頭 + archetype icon
- term ref:用語の定義(canonical 形 + 別表記)
- 表記揺らぎ警告:tooltip に「→ canonical: PKC2」と修正候補

### 6.3 Slash snippet command(`/pkcXXXX`、user 案)

既存 `/tmpXX` テンプレ挿入と同パターンで、本 spec 拡張記法の挿入支援:

| Command | 挿入内容 |
|---------|---------|
| `/pkccenter` | 行頭 `\|\| ` |
| `/pkcright` | 行頭 `\|> ` |
| `/pkcleft` | 行頭 `<\| ` |
| `/pkcblock` | `:::style{align=center, bold}\n\n:::`(中央配置 block 雛形) |
| `/pkcinline` | `:`(cursor 位置)`:bold, red:` |
| `/pkcterm` | `[term: ]\n: \n: 別表記:` 雛形 |
| `/pkcfigure` | `:::figure{#fig-}\n![](asset:)\n^^^ caption\n:::` |
| `/pkctable` | CSV header + 型注釈 row 雛形 |
| `/pkcpage` | `+++ {role=section}` |
| `/pkccover` | `+++ {role=cover}` 雛形 |
| `/pkctoc` | `:::toc{depth=3}` |
| `/pkcgloss` | `:::glossary` |
| `/pkcindex` | `:::index` |
| `/pkcheader` | frontmatter `header:` 雛形 |
| `/pkcvars` | frontmatter `vars:` 雛形 |
| `/pkcif` | `:::if{format=}\n\n:::` |
| `/pkcref` | `[^]` cursor 内 |
| `/pkcentry` | `[entry:]` cursor 内 |
| `/pkcfn` | `[[note:^]]` 脚注雛形 |

20+ command 候補、Tier 0 flag で個別 enable / disable 可能。実装は別 PR(slash menu の拡張)。

### 6.4 表記揺らぎ lint

term registry を全 entry でスキャン → 別表記が canonical で書かれていない箇所を warning。設定 `lint: warn / suggest / none` per term。

実装は **Medium**(I wave)、IR walker で完結。

---

## 7. Format mapping

各記法 → 各 format の対応マトリクス:`✓ lossless`、`△ lossy compatible`、`× 非対応(無視 or text fallback)`。

| 拡張 | HTML | Word | PPT | PDF | LaTeX | ePub | Org | MD |
|------|------|------|-----|-----|-------|------|-----|-----|
| Backmatter(2.2) | △ | △ | △ | △ | △ | △ | △ | △ |
| Section break(2.3) | ✓ | ✓ | ✓ | ✓ | ✓ | △ | △ | × |
| Page layout(2.4) | △(@page) | ✓ | ✓ | ✓ | ✓ | × | × | × |
| Conditional(2.5) | ✓ | ✓ | ✓ | ✓ | ✓ | △ | △ | △ |
| Block label(3.1) | ✓ | ✓ | △ | △ | ✓ | ✓ | ✓ | △ |
| Block ref(3.2) | ✓ | ✓ | △ | ✓ | ✓ | ✓ | ✓ | △ |
| Term + glossary(3.3) | ✓ | ✓ | △ | ✓ | ✓ | ✓ | ✓ | △ |
| Comments(3.4) | × | ✓(コメント) | × | × | ✓ | × | ✓ | △ |
| Auto-numbered(3.5) | ✓ | ✓ | △ | ✓ | ✓ | ✓ | ✓ | △ |
| Variables(3.6) | ✓ | ✓ | ✓ | ✓ | ✓ | △ | △ | △ |
| Track changes(3.7) | △ | ✓(変更履歴) | × | × | × | × | × | × |
| 簡易 block(3.8) | ✓ | ✓ | ✓ | ✓ | ✓ | △ | △ | △ |
| 行頭 align(3.9) | ✓ | ✓ | ✓ | ✓ | ✓ | △ | △ | △ |
| Inline 修飾(4.1) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | △ |
| Blockquote 図形(4.2) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | △ |
| 簡易 inline(4.3) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | △ | △ |
| CSV cell 書式(5.1) | ✓ | ✓ | △ | ✓ | △ | ✓ | △ | △ |
| Spreadsheet embed(5.2) | ✓(live) | △(static) | △(static) | △ | × | × | × | × |

---

## 8. IR 構造(暫定)

10-3 IR audit が確定する前の **暫定 AST shape**:

```ts
type PKC2Document = {
  frontmatter: Frontmatter;
  body: BlockNode[];
  backmatter?: Backmatter;
};

type BlockNode =
  | { type: 'heading'; level: 1-6; id: string; attrs?: Attrs; children: InlineNode[] }
  | { type: 'paragraph'; id?: string; align?: 'left'|'center'|'right'|'justify'; children: InlineNode[] }
  | { type: 'list'; ordered: boolean; items: ListItem[] }
  | { type: 'blockquote'; level: 1-3; role?: string; children: BlockNode[] }
  | { type: 'code-fence'; lang: string; cellSchema?: CellSchema; content: string }
  | { type: 'table'; align: AlignSpec[]; rows: TableRow[] }
  | { type: 'directive'; name: string; attrs: Attrs; children: BlockNode[] }
  | { type: 'section-break'; role: string; attrs?: Attrs }
  | { type: 'comment'; content: string }
  | { type: 'term-def'; term: string; aliases: string[]; index: 'primary'|'secondary'|'none'; lint: 'warn'|'suggest'|'none'; definition: BlockNode[] }
  | { type: 'figure-ref'; refId: string; numbered: boolean }
  // ... 他

type InlineNode =
  | { type: 'text'; value: string }
  | { type: 'inline-mark'; attrs: Attrs; children: InlineNode[] }
  | { type: 'highlight'; color?: string; children: InlineNode[] }
  | { type: 'ruby'; base: string; reading: string }
  | { type: 'emphasis-dot'; children: InlineNode[] }
  | { type: 'note-ref'; targetId: string }
  | { type: 'block-ref'; targetId: string; embed?: boolean }
  | { type: 'entry-ref'; lid: string; blockId?: string; embed?: boolean }
  | { type: 'term-ref'; termId: string }
  | { type: 'auto-num-ref'; refId: string }
  | { type: 'variable'; path: string }    // {{vars.x}}
  | { type: 'macro'; path: string }       // {{macros.x}}
  | { type: 'track-change'; kind: 'ins'|'del'; reviewer?: string; children: InlineNode[] }
  // ... 他

type Attrs = {
  align?: 'left'|'center'|'right'|'justify';
  bold?: boolean; italic?: boolean; underline?: boolean; strikethrough?: boolean; code?: boolean;
  color?: string; backgroundColor?: string;
  size?: 'xs'|'sm'|'md'|'lg'|'xl' | string;
  fontFamily?: string;
  // ad-hoc data-* attrs
  [key: `data-${string}`]: string;
};
```

正式 spec は 10-3 IR audit に統合、本 spec の AST は **markdown 拡張入力に対する shape 例** の位置付け。

---

## 9. Frontmatter spec(完全版)

```yaml
---
# 必須
title: string

# 推奨
author: string | string[]
date: YYYY-MM-DD                       # 省略時は entry の created_at
template_kind: book | report | slide | article | letter   # default: article

# 文書レベル設定
anchor_style: numeric | slug | hybrid   # default: numeric
syntax_overrides:
  page_break: string                    # default "+++"
  block_anchor: string                  # default "[#"
  inline:
    highlight: string                   # default "=="
    ruby: string                        # default "[[ruby:"

# ページ設定
page:
  size: A4 | Letter | A3 | A5 | { width: string, height: string }
  orient: portrait | landscape
  margins:
    default: { top, right, bottom, left }
    cover:   { top, right, bottom, left }
    landscape: { top, right, bottom, left }
    appendix: { top, right, bottom, left }
print:
  bleed: string                          # 例: 3mm
  safe_area_padding: string

page_numbering:
  cover: false | true
  toc: arabic | roman | "{n}"
  body: arabic | arabic_restart | roman | "{n}"
  appendix: arabic | "A-{n}"

# Header / Footer
header:
  default: string                        # 変数置換可
  cover: string
  toc: string
  appendix: string
footer:
  default: string
  cover: string
  toc: string
  appendix: string

# 変数 / マクロ
vars:
  <key>: <any>
macros:
  <key>: <multi-line string>

# 用語 / glossary
glossary_inherit_from:
  - entry:<lid>
publish_to_container_index: boolean

# Export 設定
export:
  inline_referenced: boolean              # 部分 export で referenced を inline 展開
  inline_max_depth: number
  format_overrides:
    docx: { ... }                         # format 別の細部 override
    pptx: { ... }
    pdf: { ... }
---
```

---

## 10. 段階導入(Phase 分割、**2026-05-07 update:defer 反映**)

**2026-05-07 user 判断**:具体ユースケース未確定の syntax / embed 系は defer(§11 参照)。Phase 1 / 2 は **明確な use case がある記法のみ** で構成、Phase 3 は IR 確定 / archetype 拡張等の前提待ち。

### Phase 1 — Light(PR ~30-150 LOC、syntax 衝突小、use case 明確)

| 順 | ID | 内容 | use case 例 |
|----|-----|------|------------|
| L-1 | C | Section break(`+++ {role=cover/section/...}` 基本 role のみ、attrs syntax fix) | book / report / slide でページ区切り |
| L-2 | G | Inline 修飾(`==` highlight / `[[ruby:` / `[[em:` 圏点) | 強調 / ふりがな / 圏点 |
| L-3 | D(部分) | Blockquote 通常 quote 強化(`>` のみ。`>>` `>>>` は defer) | 標準的な引用 |
| L-4 | U | Comments(`%%` inline / `%%%` block) | TODO メモ、reviewer notes |
| L-5 | Y | 行頭 align prefix(`\|\|` / `\|>` / `<\|`、段落全体適用) | 中央 / 右寄せ |
| L-6 | Z(inline) | 簡易 inline(`:text:attrs:`、完全順不同 vocabulary) | 短い色付け / 強調 |
| L-7 | V(基本) | 図 / 表 caption + 自動採番(`:::figure` + `[@id]`) | レポート / 学術 |

→ 7 PR、~1 週間目安。

### Phase 2 — Medium(PR ~150-500 LOC、parser + render 拡張、use case 明確)

| 順 | ID | 内容 | use case 例 |
|----|-----|------|------------|
| M-1 | A | Backmatter parse + IR 取込 | bibliography / slide_notes |
| M-2 | B | Heading level → semantic role mapping(template_kind) | book/report/slide で章節項対応 |
| M-3 | E | CSV cell 書式(型注釈 row) | Word/PPT export で表のセル書式に直訳 |
| M-4 | J | 暗黙ラベル(heading path / term slug) | 自動アンカー、navigate URL fragment |
| M-5 | O-1/2 | Orientation / margins per section | 印刷物 / 横長表 |
| M-6 | T | Conditional content(`:::if{format=...}`) | 1 source 多 audience |
| M-7 | W(基本) | Variables `{{vars.x}}`(frontmatter 値展開、render 時) | プロジェクト名 / 日付の DRY |
| M-8 | Z(block) | 簡易 block(`::: <attrs>`、完全順不同) | 短い装飾 block |
| M-9 | S(基本) | 修飾の行継続(`:::block` の YAML attrs multi-line) | 長 attrs を読みやすく |
| M-10 | I(部分) | 用語定義 + glossary + lint(index は defer) | 用語管理 / 表記揺らぎ警告 |
| M-11 | slash | `/pkcXXXX` snippet 中核 20 種(`/pkccenter` 等) | 入力支援 |

→ 11 PR、~2-3 週間目安。

### Phase 3 — Heavy(PR ~500+ LOC、別 wave 連携 / 前提あり)

| 順 | ID | 内容 | 前提 |
|----|-----|------|------|
| H-1 | I(全部入り) | 用語 index 自動生成 + container index 拡張 | 用途実例蓄積後 |
| H-2 | M | hover preview(editor UX) | autocomplete engine が先 |
| H-3 | O-3/4 | Header/footer + 標準変数システム | print export 実装が先 |
| H-4 | O-5 | ページ番号 制御(roman / restart / format) | 同上 |
| H-5 | X | Track changes(`::ins` / `::del`) | 共同編集機能の要望が出てから |
| H-6 | K | autocomplete engine(IR 連動) | 10-3 IR 確定後 |
| H-7 | format export engine | HTML / Word / PPT / PDF 射影 | 10-3 IR + 10-5 PKC-extension 連携 |

→ 7 PR、~4-6 週間目安。

### 段階導入の理由

- **Phase 1** は user の手応え重視(視覚的 win + Quick Win wave のリズム継承)+ syntax 衝突懸念が低い項目のみ
- **Phase 2** で IR 連動の基盤が完成(M-2 / M-4 / M-7 が IR 必要)
- **Phase 3** は IR 確定 / 別 wave 連携が前提、10-3 IR Q&A wave と並走
- Heavy 系は spec sub-doc を別途起こす(本 spec が overflow しないよう分離)

### Defer 一覧(§11 参照)

Phase 1〜3 から外した項目:

- §3.2 自己 doc / cross-entry の **embed**(`![](#id)` / `[entry:lid#id]{embed=true}`)→ 既存 link で代替
- §3.6 Macros(`{{macros.x}}` block 展開)→ Variables 基本のみ着地、macro は具体要望待ち
- §3.7 Track changes(`::ins`/`::del`) — 共同編集要望待ち、Phase 3 候補のまま
- §5.2 Spreadsheet entry embed(live=true / values-only)→ 10-4 archetype 着地後
- §3.5 部分 export 名前解決(4 layer / shadow_references)→ embed defer に伴い不要
- §4.2 Blockquote の `>>` `>>>` 段階意味付け → 標準 `>` のみ Phase 1、段階は具体要望待ち
- §1.4 S-1 Heading attrs 多行化 / S-3 inline 改行継続 → 単一行で当面足りる、要望待ち

---

## 11. 表記検討事項(open questions、**deferred** until 具体ユースケース 出現)

**2026-05-07 user 判断**:syntax 詳細を議論しても具体ユースケースが浮かばない領域は **先送り**。本書では reference として残すが、**Phase 1 / 2 の実装範囲には含めない**。実際の使用場面で「ここの記法が無いと困る」という pain が出てから再 open する。

> User direction(2026-05-07):
> > 表記検討している分に関しては先送りにしないか？ユースケースが浮かばない。
> > 埋め込みに関しては既存の機能もあるので一旦は保留でいい気がする。

### 11.1 Deferred items + 再 open trigger

実装前に user 合意が必要な syntax / semantic 決定事項(現時点では使用ケース未確定、defer):

### OQ-1. `+++` の attrs 表記方法

候補:
- (a) `+++ {role=cover, orient=landscape}` — `{}` 必須
- (b) `+++ role=cover, orient=landscape` — `{}` 不要(短い)
- (c) `+++ cover landscape` — flat keyword(role/attr の区別が曖昧)

私推奨:**(a)**(`:::` directive と統一感、parse 単純)。

### OQ-2. 簡易 block / 簡易 inline の attrs 解釈

`::: ||, bold, red` の解釈で **位置依存性** をどうするか:

- (i) **完全順不同**(現案、user 提案):attrs 全部 keyword、attribute=value 形式不要
- (ii) **順序依存 hybrid**:1 番目はアライン、2 番目以降は keyword/attribute=value 自由

私推奨:**(i)**(simple、 user 提案通り)。ただし `bg-` プレフィックス必須(背景色とテキスト色の混乱回避)。

### OQ-3. 行頭アライン `||` / `|>` / `<|` の適用範囲

- (a) 当該 1 行のみ
- (b) 段落全体(空行 / 構造区切りまで)
- (c) 直後の最初の structural block(段落 / list / table)

私推奨:**(b) 段落全体**(diff 安定、user 入力 cost 最小)。

### OQ-4. Inline 修飾の trigger と既存 `:` 衝突

`:text:attrs:` は時刻記法(`12:30:00`)等と衝突しうる。

- (i) attrs を spec 固定 vocabulary に限定し、未知文字を含む場合は通常テキスト
- (ii) `:` の前後にスペースを必須にする(`: text :attrs :` 形)
- (iii) 別の trigger(`<:` `:>` 等)に変更

私推奨:**(i)**(parser 規則で衝突回避、user 入力は自然形)。

### OQ-5. Blockquote 図形化の `>` 段階

`>` を nested quote と意味段階の **両方** に使うのは曖昧。

- (i) 行頭の連続 `>` 数 = role 段階(default / callout / warning)、nested quote 廃止
- (ii) `>` + `{role=callout}` で明示、無印は default(nested 維持)
- (iii) backmatter で `quote_styles` 上書き可能、default は (i)、明示が (ii)

私推奨:**(iii)**(default は user 直感、power user は明示)。

### OQ-6. Variables `{{x}}` の展開 timing

- (a) parse 時(IR に既に展開済値が入る、再評価不可)
- (b) render 時(IR は variable reference を保持、各 format render で評価)

私推奨:**(b)**(format 毎に値が変わる(`{{export.format}}` 等)を扱える)。

### OQ-7. Special token の優先順位

`::` `:::` `+++` `%%` `%%%` `||` `|>` `<|` の **5 種類の特殊 token** で parse 競合があるか?

- `::` (track change) と `:::` (block directive) — 区別:後続の文字が `i`/`d`/`s` のみが track change、それ以外は directive
- `+++` (section break) と GFM table delimiter — table 内部では無効化
- `%%` (inline comment) と `%%%` (block comment) — 行頭判定で区別
- `||` (alignment) と GFM table cell — table 行内では無効化

私推奨:**parse rule で context 依存に解決**(table 内 / 行頭 / 行中で振る舞い変える)。実装で吸収可能。

### OQ-8. shadow_references の serialization

部分 export 時に referenced entry の metadata をどこに置くか:

- (a) export frontmatter に注入(他 frontmatter と衝突しない別キー)
- (b) export backmatter に注入(本 spec の §2.2 に統合)
- (c) 本文末尾に section として展開(visible)

私推奨:**(b)**(backmatter は format 中立な metadata 置き場として一貫)。

### OQ-9. Macro 展開の cycle / depth limit

```yaml
macros:
  a: "{{macros.b}}"
  b: "{{macros.a}}"   # 循環参照
```

- (i) parse 時に depth limit 5 で打ち切り、warning
- (ii) cycle detection で fail(error)
- (iii) 単純 textual replace で再帰なし(non-Turing-complete)

私推奨:**(i)**(柔軟 + 安全、tooling 簡単)。

### 11.2 埋め込み(transclude / embed)関連 — **deferred、既存機能で代替**

**2026-05-07 user 判断**:既存の `[entry:lid]` link / `![asset:key]` asset embed / container 内 entry 参照で当面足りる。新 syntax の embed は具体ユースケース待ち。

- §3.2 自己 doc transclusion `![](#id)`(同 doc 内ブロックの全文展開)— defer
- §3.2 cross-entry block embed `[entry:lid#thesis-1]{embed=true}` — defer
- §3.6 Variables / macros の `{{macros.x}}` block 展開 — **基本変数 `{{vars.x}}` のみ Phase 2 維持、macro は defer**
- §5.2 Spreadsheet entry embed(`![](entry:budget-2026){live=true}`)— defer(10-4 wave 後に再評価)
- §11 OQ-8 shadow_references serialization — defer(§3.2 cross-entry embed の defer に伴い不要)

**再 open trigger**:
- (a) 「同 doc 内で同じ block を 2 箇所以上に出したい」要望が出る → §3.2 self-transclude を再評価
- (b) Word / PPT export で「他 entry の内容を本文中に展開したい」要望が出る → cross-entry embed を再評価
- (c) 10-4 spreadsheet archetype 着地後、live 数値の文中埋め込み要望 → §5.2 を再評価
- (d) macro 文字列繰り返しの DRY 化要望 → §3.6 macro 部分を再評価

### 11.3 Deferred な OQ 一覧(参考保持)

OQ-1 〜 OQ-9 の中で具体ユースケース未確定なもの:

| OQ | 状態 |
|----|------|
| OQ-1 `+++` attrs 表記 | Phase 1 では `{role=cover}` 形のみ着地、他は defer(具体ユースケース待ち) |
| OQ-2 簡易 block / inline attrs 順序 | **Phase 1 で確定**(user 提案通り完全順不同) |
| OQ-3 行頭 align 適用範囲 | **Phase 1 で確定**(段落全体、user 推奨通り) |
| OQ-4 Inline `:` 衝突回避 | **Phase 1 で確定**(spec 固定 vocabulary)|
| OQ-5 Blockquote `>` 段階 | defer(`>` のみ Phase 1、`>>` `>>>` は具体ユースケース待ち) |
| OQ-6 Variables 展開 timing | **Phase 2 で確定**(render 時) |
| OQ-7 Special token 優先順位 | **Phase 1 / 2 で個別 token 着地時に parse rule 確定**(まとめての議論不要) |
| OQ-8 shadow_references serialization | defer(11.2 embed defer に伴い不要) |
| OQ-9 Macro cycle detection | defer(macro 自体が defer なので不要) |

**Phase 1 / 2 で着地する 4 件(OQ-2/3/4/6)以外は全部 defer**。

---

## 12. 関連 doc

- [`pkc2-vision-modern-emacs-2026-05.md`](./pkc2-vision-modern-emacs-2026-05.md) — vision、本 spec の上位
- [`intermediate-representation-audit.md`](./intermediate-representation-audit.md) — IR audit、本 spec の AST 入力
- [`feature-requests-2026-04-28-roadmap.md`](./feature-requests-2026-04-28-roadmap.md) — 領域 10-2 / 10-3 / 10-5 / 10-6 連携
- [`markdown-render-scope.md`](./markdown-render-scope.md) — 既存 markdown render の scope contract、本 spec が拡張する起点
- [`fragment-reference-ir-spec-2026-05.md`](./fragment-reference-ir-spec-2026-05.md) — fragment reference IR、本 spec の `[entry:lid#id]` syntax 連携
