# PKC Markdown 完全 spec v4 — 人間向け

**Audience**: 人間(開発者 / 設計者 / 末端 user / レビュアー)。**PKC Markdown とは何で、何が書けて、どう挙動するか** を 1 つの doc で把握する単一 entry point。AI 規約 v3 (`markdown-dialect-for-ai-authors-v3.md`) の人間 counterpart。
**位置付け**: spec 階層の最上位 reference。manual(`docs/manual/12_マークダウン拡張記法.md`)はここから派生 / 抜粋する。設計議論(`docs/development/notation-redesign-2026-05/` 12 章)はここに集約 / 再編される。
**Status**: 📝 draft(2026-05-25 起草、§10 未決事項 user 判断 + §6 future 実装着地 → canonical promote)
**Version**: v4(supersedes、設計議論 12 章 + AI 規約書 v3 + block format spec を統合した次世代 single-source reference)
**起草経緯**: user direction 2026-05-25「マニュアルの前に人間向けにスペックを全部押さえた文書を書いて」── 既存 spec が AI 向け v3 / 設計議論 12 章 / 個別 spec / manual ch12 §12.9 等に散在し、人間が「全体像」 を 1 つの doc で得られない。本書はその空白を埋める。

---

## 目次

- [0. これは何 / 読み方](#0-これは何--読み方)
- [1. 設計原則(6 つ)](#1-設計原則6-つ)
- [2. 用語と凡例](#2-用語と凡例)
- [3. 全記法対応表(scope 分割、97 項目)](#3-全記法対応表scope-分割97-項目)
- [4. 文字装飾(インライン)各項目の詳細振る舞い](#4-文字装飾インライン各項目の詳細振る舞い)
- [5. リンク / 埋め込み / カード 詳細](#5-リンク--埋め込み--カード-詳細§32 2--§38-future-ref)
- [6. 段落 / 構造 / リスト / 表 詳細](#6-段落--構造--リスト--表-詳細§331--§332--§336)
- [7. コードブロック / 描画 / 図 / 数式 詳細](#7-コードブロック--描画--図--数式-詳細§333--§334)
- [8. 装飾系 / コメント / TOC / footnote 詳細](#8-装飾系--コメント--toc--footnote-詳細§335--§336--§323-footnote-参照経路)
- [9. frontmatter / 文書 globals 詳細](#9-frontmatter--文書-globals-詳細§34-全-10-項目)
- [10. 寛容 alias(Postel's Law、§3.6 全 7 項目)](#10-寛容-aliaspostels-law§36-全-7-項目)
- [10b. CommonMark / GFM base 詳細](#10b-commonmark--gfm-base-詳細§35-全-4-項目)
- [11. インライン ↔ ブロック対応関係](#11-インライン--ブロック対応関係)
- [12. future 提案:ブロック装飾箱(block format wrapper)](#12-future-提案ブロック装飾箱block-format-wrapper)
- [13. canonicalize 写像(simple ↔ formal)](#13-canonicalize-写像simple--formal)
- [14. 内部表現 / AST / IR / 公開 API](#14-内部表現--ast--ir--公開-api)
- [15. やってはいけないこと(deny list)](#15-やってはいけないことdeny-list)
- [16. 未決事項(本書 promote 前 user 判断)](#16-未決事項本書-promote-前-user-判断)
- [17. 関連 doc / 着地後段取り](#17-関連-doc--着地後段取り)

---

## 0. これは何 / 読み方

### 0.1 PKC Markdown とは

PKC2 内の entry body で使える markdown 方言。**CommonMark + GFM**(table / strikethrough / task list) + **linkify + typographer** を base に、PKC 独自拡張(色付き / 装飾箱 / 圏点 / ふりがな / 図表自動採番 / 段組組版 / 変数展開 / 寛容 alias 等)を載せた spec。

### 0.2 本書の位置付け

| 用途 | doc |
|------|-----|
| **本書(人間向け完全 spec v4)** | この doc。**全機能を 1 経路で把握** したい人(開発者 / 設計者 / 末端 user / レビュアー)向け |
| AI 向け厳密 spec v3 | `markdown-dialect-for-ai-authors-v3.md`(LLM emit 用 self-contained reference)|
| manual ch12 | `docs/manual/12_マークダウン拡張記法.md`(末端 user 向け、本書から派生 + dog-fooding)|
| 設計議論 12 章 | `docs/development/notation-redesign-2026-05/`(各記法の選定理由 / 業界事例 / OQ、本書に統合)|
| 個別 spec | `pkc-block-format-attr-syntax-v1-minimum-scope.md`(future 装飾箱)/ `ast-commutative-ir.md`(IR)/ `public-ast-api-for-ai.md`(AST API)|

### 0.3 「全部押さえた」 の意味

本書 v4 は以下を集約:
- 既存 87 項目の simple / formal / 内部表現 / 振る舞い / edge case
- 寛容 alias 7 項目(PKC2005-2011)
- deny list / warning 5 項目
- 廃止 / 移行 5 項目
- インライン ↔ ブロックの対応関係(設計思想)
- future 提案 1 件(ブロック装飾箱、catalog 空白を埋める)
- canonicalize 写像 / 内部表現 / 公開 API の要点
- 未決事項 6 件(本書 promote 前 user 判断)

### 0.4 読み方

- **「ざっと網羅」** → §3 全記法早見表(87 項目を 1 table view)
- **「個別機能の詳細」** → §4-§10 各カテゴリ詳細
- **「設計思想」** → §1 設計原則
- **「インライン と ブロックの関係」** → §11
- **「これから入る予定」** → §12 future 提案
- **「やってはいけない」** → §15 deny list
- **「設計選択 / 命名理由」** → §16 未決事項

---

## 1. 設計原則(6 つ)

### 1.1 simple-first

**人間が日常 typing する simple 形が一級市民**、formal 形は AI / 機械が emit する serializer。

```markdown
simple:  **bold**          ← 人間 typing、default
formal:  :strong:[bold]    ← AI emit / 厳密 round-trip
```

両者は同一 AST(`Strong { children }`)に正規化、render 結果は完全一致。

**帰結**: 頻度高い機能は必ず simple 形を持つ。頻度低い formal-only 機能は許容(catalog #36 `:sup:[]` 等)。

### 1.2 可換性(simple ↔ formal ↔ IR 同一 AST)

| 形 | 例 |
|----|---|
| simple | `==重要==` |
| formal | `:mark:[重要]` |
| IR(AST node) | `Mark { children: [Text("重要")] }` |

3 形は同一 AST に正規化、相互変換可能(commutative)。canonicalize で「どの形に寄せるか」 は設定可能(default は formal 寄せ、§13)。

### 1.3 Postel's Law(寛容に accept、厳密に send)

**読むときは寛容に**:typo / 揺れ / hallucination を全部正しく解釈。

```markdown
||本文        ← 正、center
|<本文        ← typo 寛容、center
<|本文        ← typo 寛容、center(physical left は別 spec で formal-only)
>|本文        ← typo 寛容、end
|>本文        ← 正、end
```

```markdown
:::note       ← AI hallucination、:::section{role=note} と解釈
:::warning    ← 同上
:::callout{type=tip}  ← 同上
:::admonition{type=warning title=注意}  ← 同上
```

**書くときは厳密に**:emit / export は canonical 形のみ。寛容受理した形は `console.info` で canonical hint(PKC2005-2011)+ DOM `data-pkc-canonical` 属性で「正しい形」 を出力。

### 1.4 diff-friendly canonical

canonical 形は token / attrs / whitespace が厳密に固定:
- attrs 順序 ABC sort
- class 名 ABC sort
- key=value の引用符 統一
- block 前後 blank line 強制挿入

→ re-canonicalize で diff=0(idempotent)、PR review で「意味の変更」 を「形式の揺れ」 と区別可能。

### 1.5 入力階層(prefix > inline > indent > wrapping)

新機能の syntax 選定は **入力負荷の小さい順** に検討:

| 階層 | 例 | 入力負荷 |
|------|---|------|
| 1. prefix / suffix | `# h1` / `> quote` / `- list` | 行頭 1 文字、最小 |
| 2. wrapping inline | `**bold**` / `==hl==` / `:text:attrs:` | 行内、低 |
| 3. indent block | `    code`(4 space)/ `__indent`(行頭 `__`) | 中 |
| 4. wrapping block | `:::name{attrs}\n...\n:::` | 3 行構造、高 |

**頻度低の機能は階層 4 のみ許容**、頻度高の機能は階層 1-2 で表現する。

### 1.6 dog-fooding(manual 自身が PKC Markdown を full に使う)

manual ch12(`12_マークダウン拡張記法.md`)は **manual 自身が PKC Markdown を全機能 dog-fooding** で書かれる(§12.9 が代表例)。render 結果が動作確認証跡として機能する。本書 v4 が canonical promote されたら、manual も同流儀で v4 機能を embed。

---

## 2. 用語と凡例

### 2.1 status マーカー

| 印 | 意味 |
|----|------|
| ✅ | canonical(既実装、本書時点 stable) |
| 🔄 | 仕様変更中(過渡期、寛容 parse で旧形も accept) |
| 📝 | 未着地 future 提案(本書 §12 等)|
| ❌ | 廃止(parser は引き続き受理、warning 表示) |

### 2.2 頻度マーカー

| 頻度 | 目安 |
|------|---|
| very freq | 1 entry に複数回 |
| freq | 数 entry に 1 回 |
| occasional | 月次 |
| rare | 年次 / 特定文書のみ |

### 2.3 simple / formal / 寛容 alias の 3 階層

| 階層 | 形 | 用途 |
|------|---|------|
| simple | `**bold**` 等 | 人間 typing、default |
| formal | `:::name{attrs}` block / `:role:[content]{attrs}` inline | AI / 機械 emit、round-trip canonical |
| 寛容 alias | `:::note` `:lead:[...]` 等 | AI hallucinate 形を受理 + canonical hint |

### 2.4 「内部表現」 / 「AST」 / 「IR」 の区別

- **内部表現** / **AST**(Abstract Syntax Tree): PKC2 が markdown を parse して得る tree 構造。本書では「内部表現」 で統一(jargon 回避)
- **IR**(Intermediate Representation): 内部表現の永続 / export 用形式。同概念、内部利用語
- **node**: AST の 1 要素(`Heading { level, children }` 等)

詳細は §14。

### 2.5 「surface」(5 経路の描画)

PKC2 は同じ markdown を 5 つの surface で描画する:

1. **center pane**(detail-presenter): 通常の entry 詳細表示
2. **Viewer popup**(rendered-viewer): 独立 window での render(画像 popup / `?pkc-debug` 等)
3. **Split View preview**(detail-presenter edit mode): 編集中の preview
4. **entry-window**(別 window で entry 開く): popup 内の本文表示
5. monitor surface: 範囲外(metric 表示専用)

新機能追加時は **5 surface 全部で動作確認** が必須(CLAUDE.md §9 規約)。

---

## 3. 全記法対応表(scope 分割、97 項目)

### 3.0 凡例 ── scope 列

各記法は **scope**(効果範囲)で分類:

| scope | 意味 | DOM 出力例 |
|-------|------|----------|
| **I**(Inline) | 行内、部分的に効く装飾 | `<span>` / `<a>` / `<strong>` / `<em>` / `<code>` / `<mark>` 等 |
| **B**(Block) | 行 / 段落単位、行頭 marker や `:::name{...}` 3 行構造 | `<div>` / `<p>` / `<h1-6>` / `<ul>` / `<ol>` / `<blockquote>` / `<figure>` / `<table>` 等 |
| **F**(Frontmatter) | YAML、文書全体に効く | doc 属性 |
| **C**(CommonMark/GFM base) | 本書拡張ではない、commonmark / GFM の base 仕様 | (base 準拠) |

判別基準は **parser 経路 + DOM 出力**(`<span>` 系 = I、`<div>` 系 = B)。

### 3.1 全体 summary

| scope | 件数 | 範囲 |
|-------|-----|------|
| I Inline(canonical + transitional)| 28 | §3.2 |
| B Block(canonical + transitional + future #60)| 32 | §3.3 |
| F Frontmatter | 10 | §3.4 |
| C CommonMark/GFM base | 4 | §3.5 |
| 寛容 alias(I/B 混在)| 7 | §3.6 |
| 廃止 / deny(I/B/F 混在)| 11 | §3.7 |
| 未着地 future inline(#93-#97、#60 は §3.3.7)| 5 | §3.8 |
| **合計(unique #)** | **97** | (#1-#97 通し番号)|

### 3.2 Inline 記法(I scope、28 項目)

#### 3.2.1 文字装飾(#1-#11)

| # | 機能 | simple | formal | 頻度 | status |
|---|------|--------|--------|------|--------|
| 1 | 太字 | `**T**` | `:strong:[T]` | very freq | ✅ |
| 2 | 斜体 | `*T*` | `:emphasis:[T]` | very freq | ✅ |
| 3 | 取り消し | `~~T~~`(GFM) | `:strike:[T]` | freq | ✅ |
| 4 | inline code | `` `T` `` | `:code:[T]` | very freq | ✅ |
| 5 | マーカー(黄色) | `==T==` | `:mark:[T]` | freq | ✅ |
| 6 | マーカー(色) | `==[red]T==` | `:mark:[T]{color=red}` | occasional | ✅ |
| 7 | 圏点 / 傍点 | `^^T^^` | `:emdot:[T]{style=dot\|circle}` | occasional | ✅ |
| 8 | ルビ | `[[ruby:base\|読み]]`(現)/ `[base\|読み]`(将来) | `:ruby:[base]{rt="読み"}` | occasional | 🔄 |
| 9 | 色 / 背景 / サイズ簡易 | `:T:red,bg-yellow,1.2em:` | `:span:[T]{color=red bg=yellow size=1.2em}` | occasional | ✅ |
| 10 | 上付き | — | `:sup:[T]` | rare | ✅ formal-only |
| 11 | 下付き | — | `:sub:[T]` | rare | ✅ formal-only |

#### 3.2.2 リンク / 埋め込み / カード(#12-#20)

| # | 機能 | simple | formal | 頻度 | status |
|---|------|--------|--------|------|--------|
| 12 | 外部 link | `[L](url)` | `:link:[L]{href="url"}` | very freq | ✅ |
| 13 | entry link | `[L](entry:LID)` | `:link:[L]{ref="entry:LID"}` | freq | ✅ |
| 14 | entry card | `@[L](entry:LID)` | `:card:[L]{ref="entry:LID"}` | freq | ✅ |
| 15 | entry embed seamless | `![L](entry:LID)` | `:embed:[L]{ref="entry:LID"}` | freq | 🔄 |
| 16 | 画像(URL) | `![alt](https://…)` | `:image:{src="url" alt="alt"}` | freq | ✅ |
| 17 | 画像(asset) | `![alt](asset:KEY)` | `:image:{src="asset:KEY" alt="alt"}` | freq | ✅ |
| 18 | asset link(非画像) | `[L](asset:KEY)` | `:asset-link:[L]{key="KEY"}` | occasional | ✅ |
| 19 | 他 container permalink | `[L](pkc://c/e)` | `:link:[L]{href="pkc://…" kind="permalink"}` | rare | ✅ |
| 20 | 自動採番 ref | `[@fig1]` `[@tab1]` `[@eq1]` | `:autoref:{id="fig1"}` | occasional | ✅ |

#### 3.2.3 inline 数式 / コメント / footnote 参照(#21-#26)

| # | 機能 | simple | formal | 頻度 | status |
|---|------|--------|--------|------|--------|
| 21 | inline 数式 | `$x^2$` | `:math:{src="x^2"}` | occasional | ✅ |
| 22 | inline コメント | `%%T%%` | `:comment:[T]{hidden=true}` | occasional | ✅ |
| 23 | footnote 参照 | `[^id]` | `:fn-ref:{id="id"}` | occasional | ✅ |
| 24 | inline footnote | `本文^[補足]` | `:fn:[補足]` | occasional | ✅ |
| 25 | comment-as-footnote(無 id) | `%%[fn] T %%` | `:comment:[T]{visibility=footnote}` | occasional | ✅ |
| 26 | comment-as-footnote(+id) | `%%[fn=src1] T %%` | `:comment:[T]{visibility=footnote id="src1"}` | occasional | ✅ |

#### 3.2.4 変数 / その他 inline(#27-#28)

| # | 機能 | simple | formal | 頻度 | status |
|---|------|--------|--------|------|--------|
| 27 | 変数展開 | `{{vars.x}}` | `:var:[vars.x]` | freq(vars 使用時) | ✅ |
| 28 | inline span + attrs | — | `:span:[T]{class=… #id key=v}` | rare | ✅ formal-only |

### 3.3 Block 記法(B scope、32 項目)

#### 3.3.1 見出し / 段落 / 字下げ / align(#29-#34)

| # | 機能 | simple | formal | 頻度 | status |
|---|------|--------|--------|------|--------|
| 29 | heading h1-h6 | `# T` 〜 `###### T` | `:::heading{level=N} T :::` | very freq | ✅ |
| 30 | heading + attrs(Pandoc trailing) | `# T {#id .cls k=v}` | `:::heading{level=N #id .cls k=v} T :::` | freq | ✅ |
| 31 | paragraph(default) | (自動) | `:::paragraph T :::` | very freq | ✅ |
| 32 | paragraph + indent | `__T` / `＿T` | `:::paragraph{indent=N} T :::` | freq | ✅ |
| 33 | paragraph + align logical | `\|\|T`(center)/ `\|>T`(end、typo 寛容 3 形) | `:::paragraph{align=center\|end\|start} T :::` | occasional | 🔄 |
| 34 | paragraph + align physical | — | `:::paragraph{align=left\|right\|top\|bottom} T :::` | rare | ✅ formal-only |

#### 3.3.2 リスト / quote / 表(#35-#41)

| # | 機能 | simple | formal | 頻度 | status |
|---|------|--------|--------|------|--------|
| 35 | bullet list | `- T`(`*` `+` 同義) | `:::list{kind=bullet} :::` | very freq | ✅ |
| 36 | ordered list | `1. T` | `:::list{kind=ordered start=N} :::` | very freq | ✅ |
| 37 | task list(GFM) | `- [ ] T` / `- [x] T` | `:::list{kind=task} :::` | freq | ✅ |
| 38 | blockquote | `> T` | `:::quote T :::` | freq | ✅ |
| 39 | quote + author | — | `:::quote{author="X" year=Y} T :::` | rare | ✅ formal-only |
| 40 | 表(GFM) | `\| h \| h \|\n\|---\|---\|...` | `:::table{align=["L","R"]} :::` | freq | ✅ |
| 41 | **CSV/TSV/PSV 表 fence** | ` ```csv\nh1,h2\nv1,v2\n``` `(lang=csv/tsv/psv) | (table 自動変換) | occasional | ✅ |

#### 3.3.3 コード block(#42-#45)

| # | 機能 | simple | formal | 頻度 | status |
|---|------|--------|--------|------|--------|
| 42 | code(plain) | ` ```code``` ` | `:::code :::` | freq | ✅ |
| 43 | code(lang 指定 + syntax highlight) | ` ```ts code``` ` | `:::code{lang="ts"} :::` | freq | ✅ |
| 44 | rendered code(`tree` / `mermaid` / `json{view}` / `dbschema` / `binary` / `query` 等) | ` ```tree``` ` 等 | `:::code-render{lang="tree"} :::` | freq(用途次第) | ✅ |
| 45 | HTML sandbox fence | ` ```html-render <svg>…</svg>``` ` | `:::code{lang="html-render"} :::` | rare | ✅ |

#### 3.3.4 図 / 表 block / 数式 / 自動採番(#46-#50)

| # | 機能 | simple | formal | 頻度 | status |
|---|------|--------|--------|------|--------|
| 46 | figure block | `:::figure{#fig1}\n![](src)\n^^^ caption\n:::` | 同左 | occasional | ✅ |
| 47 | table block | `:::table{#tab1}\n…\n:::` | 同左 | occasional | ✅ |
| 48 | equation block | `$$\frac{a}{b}$$` 行単独 | `:::equation :::` または `:::math :::` | occasional | ✅ |
| 49 | caption(`:::figure` 内) | `^^^ caption` 行 | `:caption:[T]` | occasional | ✅ |
| 50 | block math(equation 同義) | `$$T$$` 行単独 | `:::math $$T$$ :::` | occasional | ✅ |

#### 3.3.5 装飾系 directive / コールアウト / コメント / セクション wrapper(#51-#54a)

| # | 機能 | simple | formal | 頻度 | status |
|---|------|--------|--------|------|--------|
| 51 | `:::section` **semantic callout(8 role)** | — | `:::section{role=summary\|info\|note\|tip\|caution\|important\|warning\|danger} :::` | freq | ✅ |
| 51a | `:::section` **任意 role 文字列**(generic wrapper、CSS class 自動)| — | `:::section{role=ANY} :::` → `<section class="pkc-section-callout pkc-section-ANY" data-pkc-role="ANY">` | occasional | ✅ |
| 51b | `:::section` **role 省略 default**(generic `<section>` wrapper)| — | `:::section :::` → `<section data-pkc-role="section">`(role default = `'section'`) | occasional | ✅ |
| 51c | `:::section` **attrs 付き**(id / class / 任意 key)| — | `:::section{role=X #id .cls layout=cover key=v} :::` → attrs 全保持、`layout=` は layout hint として分離 | occasional | ✅ |
| 52 | conditional block | — | `:::if{format=html\|markdown\|docx\|pptx\|pdf} :::` | rare | ✅ formal-only |
| 53 | block comment | `%%%\n…\n%%%` | `:::comment :::` | occasional | ✅ |
| 54 | **TOC block**(目次自動生成) | — | `:::toc{depth=N}` | occasional | ✅ formal-only(2026-05-12 PR-2V 着地) |

#### 3.3.6 区切り / 空行 / footnote 定義(#55-#59)

| # | 機能 | simple | formal | 頻度 | status |
|---|------|--------|--------|------|--------|
| 55 | hr(horizontal rule) | `---` 行単独 | `:::break{kind=rule}` | occasional | ✅ |
| 56 | page break | `+++` 行単独 | `:::break{kind=page}` | occasional | ✅ |
| 57 | page break + role | `+++ {role=cover}` | `:::break{kind=page role=cover}` | occasional | ✅ |
| 58 | 空行マーカー | `_` 行単独(1)/ `_<N>`(N=1-50) | `:::blank{count=N}` | occasional | ✅ |
| 59 | footnote 定義(行頭) | `[^id]: 定義` | — | occasional | ✅ |

#### 3.3.7 未着地 block future(#60、§12 参照)

| # | 機能 | simple | formal | 頻度 | status |
|---|------|--------|--------|------|--------|
| 60 | **block format wrapper(任意 class くくり)** | `:::.cls.cls\nbody\n:::` / `:::red,bg-yellow,1.2em\nbody\n:::` | `:::format{.cls #id key=v}\nbody\n:::` | occasional | 📝 §12 |

### 3.4 Frontmatter / 文書 globals(F scope、10 項目)

| # | key | 値 | default | 頻度 | status |
|---|-----|---|---------|------|--------|
| 61 | `notation` | profile 名(`pkc-markdown-1.0` / `pkc-markdown-1.0-ai-safe` / `commonmark` 等) | `pkc-markdown-1.0` | rare | ✅ |
| 62 | `writing` | `horizontal` / `vertical` | `horizontal` | rare | ✅ |
| 63 | `direction` | `ltr` / `rtl` | `ltr` | rare | ✅ |
| 64 | `align` | `left` / `right` / `center` / `top` / `bottom`(writing 依存) | (writing 依存) | rare | ✅ |
| 65 | `layout`(段組組版、9 種)| `a4-1col` / `a4-2col` / `a4-3col` / `b5-*` / `letter-*` / `legal-*` | — | occasional | ✅ |
| 66 | `vars` | `{nested map}` または `vars.x: value` | — | freq(vars 使用時) | ✅ |
| 67 | `notation_overrides` | `{ruby: false}` 等個別機能 off | — | rare | ✅ |
| 68 | **`heading-number`**(見出しアウトライン採番)| `true` / `on` / `<N>`(L1 開始番号) | `false` | occasional | ✅ |
| 69 | **`list-number`**(順序リスト採番モード)| `uniform` / `sequential` | `sequential` | rare | ✅ |
| 70 | **`kind`** | string(meta 情報) | — | rare | ✅ |

### 3.5 CommonMark / GFM base(C scope、本書独自拡張ではない 4 項目)

| # | 機能 | 動作 | 頻度 | status |
|---|------|------|------|--------|
| 71 | **Linkify**(URL 自動 link 化) | `https://...` を自動 `<a>` 化 | very freq | ✅ base(commonmark + markdown-it linkify) |
| 72 | **Typographer**(smart quote / em-dash) | `--` → `—`、`...` → `…`、`"X"` → `“X”` 等 | freq | ✅ base(markdown-it typographer) |
| 73 | **GFM strikethrough** | #3 `~~T~~` の base | freq | ✅ base(GFM) |
| 74 | **GFM table** | #40 の base | freq | ✅ base(GFM) |

(GFM footnote `[^id]` も base、#23-#24 / #59 で既掲)

### 3.6 寛容 alias(Postel's Law、PR-2L PKC2005-2011 の 7 項目)

AI hallucinate 形を実 render path に格上げ、`console.info` + DOM `data-pkc-canonical` で 3 つ組 hint(detected / interpretedAs / canonical)。

| # | scope | AI が書く形 | 寛容 parse 後 | code | canonical |
|---|-------|----------|------------|------|------|
| 75 | I | `:lead:[content]` | `<span class="pkc-lead">` | PKC2005 | 段落 + `==content==` 等 |
| 76 | I | `:spacing:{size=N}` | blank line marker | PKC2006 | `_<N>` |
| 77 | I | `:align:{position=X}` | 次段落 align 適用 | PKC2007 | 行頭 `\|\|` `\|>` `<\|` |
| 78 | I | `:quote:{attribution=…}` | `<small class="pkc-attribution">` | PKC2008 | `:::quote{author="…"}` |
| 79 | B | `:::note` / `:::warning` / `:::tip` / `:::info` / `:::caution` / `:::important` / `:::danger` / `:::summary` | `:::section{role=NAME}` alias | PKC2009 | `:::section{role=…}` |
| 80 | B | `:::callout{type=X}` | `:::section{role=X}` alias | PKC2010 | 同上 |
| 81 | B | `:::admonition{type=X title=Y}` | `:::section{role=X}` + `## Y` | PKC2011 | 同上 |

### 3.7 廃止 / deny(11 項目)

| # | scope | 旧 / 危険形 | 状態 | 推奨 |
|---|-------|----------|------|------|
| 82 | I | `[[em:..]]` | ❌ deprecated | `^^..^^`(#7) |
| 83 | I | `[[ruby:base\|読]]` | 🔄 deprecated(現は accept、将来 deny)| `[base\|読]`(#8) |
| 84 | B | `<\|T` 物理左寄せ | 🔄 reform で end に正規化 | 物理左は formal `:::paragraph{align=left}`(#34) |
| 85 | I | `^x^` 上付き(simple) | ❌ 廃止予定 | `:sup:[x]`(#10) or `$x^2$` |
| 86 | I | `~x~` 下付き(simple) | ❌ 廃止予定 | `:sub:[x]`(#11) or `$a_n$` |
| 87 | I/B | inline HTML(`<div>` `<style>` 等本文に)| ❌ `html: false` で escape | 複雑 layout は `` ```html-render `` fence(#45) |
| 88 | I | `:span:[…]{style="…"}` | ❌ XSS allowlist 外、silent skip | `:span:[…]{class=warn}` |
| 89 | B | 行頭 `>>>` `===` 等独自記号 | ❌ commonmark 標準衝突 | 本書記載構文のみ |
| 90 | I | `:role:[…]` で未知 role(`:foo:[X]` 等)| ❌ implementation 不一致、fall-through | allowlist 内のみ(§4.15) |
| 91 | F | frontmatter > 16KB | ❌ size cap、parse 中止 + warning | コンパクトに |
| 92 | B | `:::frontmatter` / `:::body` directive | ❌ 未実装 + PKC1010 warning | Phase 3 PR-2W で正式実装予定 |

### 3.8 未着地 future 提案(5 項目)

| # | scope | 機能 | simple | formal | 着地条件 |
|---|-------|------|--------|--------|---------|
| 60 | B | block format wrapper(任意 class) | `:::.cls\nbody\n:::` 等 | `:::format{.cls #id} body :::` | §12 詳細、§16 Q1-Q6 user 判断 + 実装 PR landing |
| 93 | I | block ref(同 doc 内 anchor) | `[#block-id]` | `:block-ref:{id="…"}` | spec のみ、Phase 後段 |
| 94 | I | term ref(用語参照) | `[?term]` | `:term-ref:{name="term"}` | spec のみ、Phase 後段 |
| 95 | I | macro expansion | — | `:macro:[name](args)` | spec のみ、Phase 後段 |
| 96 | I | inline 簡易属性 default em-dot | `:T::` | `:emdot:[T]` | catalog #35 spec のみ |
| 97 | I | entry embed quote chrome | `![L](entry:LID){quote}` | `:embed:[L]{mode="quote"}` | spec のみ |

### 3.9 統計(#1-#97 通し番号、status / scope 別 cross-tab)

| status | 件数 | 内訳 |
|--------|-----|------|
| ✅ canonical(実装済 stable)| 74 | I:25 + B:30 + F:10 + C:4 + 寛容 7 / 廃止 transitional 0(廃止系は 🔄 / ❌ 側) |
| 🔄 過渡期(寛容 accept + warning)| 4 | #8 `[[ruby:..]]` / #33 `<\|`(align logical typo)/ #15 entry embed default 切替 / #83 [[ruby]] 同義 |
| 📝 未着地 future(本書 promote + PR landing 待ち)| 6 | #60 block format wrapper / #93 block ref / #94 term ref / #95 macro / #96 inline em-dot default / #97 embed quote |
| ❌ 廃止 / deny | 11 | §3.7 #82-#92(`[[em:]]` / `<\|` 物理 / `^x^` / `~x~` / inline HTML / `style=` / frontmatter cap / 独自記号 / 未知 role / `:::frontmatter` / [[ruby 旧形)|

**scope 別 cross-tab**(unique # は §3.2-§3.4 のいずれかに 1 度だけ登録、寛容 / 廃止 / future は scope 補足):

| scope | canonical | 寛容 alias | 廃止 / deny | future | 計 |
|-------|----------|----------|-----------|--------|---|
| Inline(I) | 25(#1-#28 から #25 #26 除く)| 4(#75-#78) | 6(#82, #83, #85, #86, #87 I 部分, #88, #90)| 5(#93-#97)| **40** |
| Block(B) | 30(#29-#59) | 3(#79-#81) | 4(#84, #87 B 部分, #89, #92)| 1(#60)| **38** |
| Frontmatter(F)| 10(#61-#70)| 0 | 1(#91 size cap)| 0 | **11** |
| base(C)| 4(#71-#74)| — | — | — | **4** |
| **合計** | **69** | **7** | **11** | **6** | **93** ※注 |

※注: 合計が 93 になるのは #87(inline HTML)が I + B 両 scope で deny(本表は I+B にそれぞれ計上、unique # は 1)。実数は #1-#97 = 97 unique。

---

## 4. 文字装飾(インライン)各項目の詳細振る舞い

> インライン = 行の中で部分的に効く装飾。本章は §3.2.1 文字装飾(#1-#11)+ §3.2.3 inline 数式 / コメント / footnote 参照(#21-#26)+ §3.2.4 変数 / その他(#27-#28)を deep-dive する。
>
> **§4.1-§4.16 の見出しに付く `#N` は §3 の通し番号と対応**(§3 で scope 分割した後の番号)。

### 4.1 太字(§3.2.1 #1)

| 軸 | 値 |
|----|---|
| simple | `**text**` |
| formal | `:strong:[text]` |
| 出力 | `<strong>text</strong>` |
| 内部表現 | `Strong { children }` |
| 注意 | `__text__` も commonmark 標準で太字、ただし PKC2 では `__` は行頭で indent 用(#34)なので競合回避のため本文中での `__bold__` は推奨しない |

### 4.2 斜体(§3.2.1 #2)

```markdown
*斜体*           ← simple
:emphasis:[斜体] ← formal
```

`_text_` も commonmark 標準で斜体、行中なら衝突なし。

### 4.3 取り消し線(§3.2.1 #3)

```markdown
~~消去線~~       ← simple(GFM)
:strike:[消去線] ← formal
```

### 4.4 inline code(§3.2.1 #4)

```markdown
`code`           ← simple
:code:[code]     ← formal
```

backtick 内の `:role:[…]` 等 PKC 拡張は **発火しない**(inline code は literal)。

### 4.5 マーカー(黄色)(§3.2.1 #5)

```markdown
==重要==         ← simple、<mark>重要</mark>、default 黄色
:mark:[重要]     ← formal
```

CSS:`mark { background: yellow; }`(custom theme で変更可)。

### 4.6 マーカー(色指定)(§3.2.1 #6)

```markdown
==[red]赤マーカー==              ← simple、色指定
:mark:[赤マーカー]{color=red}    ← formal
```

色 vocabulary: `red` / `blue` / `green` / `yellow` / `cyan` / `magenta` / `orange` / `purple` / `pink` / `gray` 等(`base.css` 定義の named color)。

### 4.7 圏点 / 傍点(§3.2.1 #7)

```markdown
^^大事^^           ← simple、各文字上に点
:emdot:[大事]      ← formal、style=dot(default)
:emdot:[重要]{style=circle}  ← 圏点(白丸)
```

内部 nested markdown 効く(`^^**bold**^^` 等、PR-2P)。

### 4.8 ルビ(ふりがな)(§3.2.1 #8)

```markdown
[難読|なんどく]                ← simple(将来 default、現状は migration 段階)
[[ruby:難読|なんどく]]         ← 旧 simple(deprecated、引き続き受理 + warning)
:ruby:[難読]{rt="なんどく"}    ← formal
```

### 4.9 色 / 背景 / サイズ(inline 簡易属性、L-6)(§3.2.1 #9)

```markdown
:重要:red:                       ← 赤文字
:重要:bg-yellow:                 ← 黄色背景
:重要:1.2em:                     ← 1.2em
:重要:red,bg-yellow,1.2em:       ← 複合
:重要:bold,red:                  ← 太字 + 赤
:span:[重要]{color=red bg=yellow size=1.2em}  ← formal
```

**vocabulary**:
- 色: `red` / `blue` / `green` 等 named / `#hex` / `rgb(r,g,b)`
- 背景: `bg-COLOR`(同 vocabulary に `bg-` prefix)
- サイズ: `lg` / `xl` / `2xl` / `1.2em` / `120%` 等
- weight: `bold` / `bolder` / `lighter`
- style: `italic`
- align: 無し(inline で align は意味なし、block #35-#36 参照)

### 4.10 上付き / 下付き(§3.2.1 #10-#11)

```markdown
x:sup:[2]    ← x²、formal-only
a:sub:[n]    ← aₙ、formal-only
```

simple なし。math mode `$x^2$` `$a_n$` で代替可。

### 4.11 inline 数式(§3.2.3 #21)

```markdown
$x^2 + y^2 = z^2$    ← KaTeX 構文
:math:{src="x^2+y^2=z^2"}  ← formal
```

block 数式は #69、`$$…$$` 行単独。

### 4.12 inline コメント(§3.2.3 #22)

```markdown
本文 %%メモ%% つづき     ← 「メモ」 は render されない
:comment:[メモ]{hidden=true}  ← formal
```

著者向けのメモ。export(docx/pptx)時も出力されない(`:::if{format=...}` で format 別表示制御は #56)。

### 4.13 footnote(参照 + inline)(§3.2.3 #23-#24)

```markdown
本文[^src1]            ← 参照、本文末尾の定義へ
[^src1]: 定義内容       ← 定義(行頭、#68)

本文^[直アタッチ補足]   ← inline footnote、その場で定義
```

### 4.14 変数展開(§3.2.4 #27)

frontmatter で:
```yaml
vars:
  product: PKC2
  version: "2.3"
```

本文で:
```markdown
{{vars.product}} {{vars.version}}    ← 「PKC2 2.3」
```

### 4.15 inline span + attrs(§3.2.4 #28)

```markdown
:span:[文字列]{class=warn #id-1 data-key=value}    ← formal-only
```

simple なし(`:text:attrs:` で大半 vocabulary cover、それ以外の任意 attrs は formal)。`style=…` は禁止(XSS、#81)。

### 4.16 inline 簡易属性 default em-dot(未着地、§3.8 #96)

```markdown
:重要::    ← attrs 省略 = em-dot 適用
:emdot:[重要]  ← 等価
```

📝 未着地、`:T::` の attrs 省略形を em-dot default 解釈にする提案(catalog #35)。

---

## 5. リンク / 埋め込み / カード 詳細(§3.2.2 + §3.8 future ref)

### 5.1 リンク / 埋め込みの選び方(§3.2.2 #12-#19)

| 用途 | 書き方 | 表示 |
|------|------|------|
| 外部サイト | `[label](https://…)` | 青下線リンク |
| 同 container 内 entry へ link | `[label](entry:LID)` | 内部リンク(クリックで該当 entry 開く) |
| entry をカード表示(title + 抜粋 + thumb) | `@[label](entry:LID)` | カード box |
| entry を本文丸ごと埋め込み | `![label](entry:LID)` | 他 entry の全文展開(seamless) |
| 埋め込み but 引用 chrome 付 | `![label](entry:LID){quote}` | 📝 未着地 |
| 画像(URL) | `![alt](https://…png)` | 画像 |
| 画像(asset) | `![alt](asset:KEY)` | container 内 asset 画像 |
| 非画像 asset(PDF / zip 等) | `[label](asset:KEY)` | ダウンロード link |
| 別 container | `[label](pkc://container/entry)` | permalink |

### 5.2 block ref / term ref(未着地、§3.8 #93-#94)

```markdown
[#section-1]    ← 同 doc 内 block へ anchor link、📝 未着地
[?用語]         ← 用語集参照、📝 未着地
```

### 5.3 自動採番参照(§3.2.2 #20)

```markdown
:::figure{#fig1}\n![](url)\n^^^ タイトル\n:::    ← figure block(#51)
本文中で図 [@fig1] を参照    ← 自動採番、出力「図 1」

:::table{#tab1}…:::        ← 表 block、[@tab1] で参照
$$E=mc^2$$    ← 数式に id 付ければ [@eq1] で参照
```

`autoref` formal は `:autoref:{id="fig1"}`。番号は文書内出現順で自動採番。

---

## 6. 段落 / 構造 / リスト / 表 詳細(§3.3.1 + §3.3.2 + §3.3.6)

### 6.1 見出し(§3.3.1 #29-#30)

```markdown
# h1                          ← simple
## h2 {#chapter-1 .important}  ← simple + attrs(Pandoc 互換 trailing)
:::heading{level=2 id="chapter-1" classes=["important"]} h2 :::  ← formal
```

階段:h1 16pt / h2 14pt / h3 12pt / h4-h6 10.5pt(default theme)。

### 6.2 段落 / indent / align(§3.3.1 #31-#34)

```markdown
普通の段落(改行 2 つで分離)。

__先頭 1 字下げ                ← 半角 `__` 2 文字
＿全角字下げ                   ← 全角 `＿` 1 文字

||中央寄せの段落               ← `||` 行頭
|>右(end)寄せ                  ← `|>` 行頭
<|右(end)寄せ                  ← typo 寛容、`<|` `|<` `>|` も全部 end

:::paragraph{indent=2 align=center} 本文 :::  ← formal
:::paragraph{align=left} 物理左寄せ :::       ← physical、formal-only
```

**logical align** vs **physical align**:
- logical(`start` / `end` / `center`)= 縦書き / RTL 文脈で意味を保つ。simple `||` `|>` `<|` 等
- physical(`left` / `right` / `top` / `bottom`)= 強制的に物理方向、formal-only

### 6.3 リスト(§3.3.2 #35-#37)

```markdown
- bullet
- list

1. ordered
2. list

- [ ] todo
- [x] done       ← GFM task list、PKC2 では todo archetype と連動
```

formal: `:::list{kind=bullet|ordered|task} :::`。

### 6.4 quote(§3.3.2 #38-#39)

```markdown
> 通常引用     ← commonmark

:::quote{author="夏目漱石" year=1906}
吾輩は猫である。
:::            ← author 付き、PKC R-D
```

複数 entry を 1 quote で囲める(`:::quote{author} ![](entry:A) ![](entry:B) :::`)。

### 6.5 table(GFM + align、§3.3.2 #40)+ CSV/TSV/PSV fence(§3.3.2 #41)

GFM 標準 table:

```markdown
| col1 | col2 | col3 |
|------|:----:|-----:|
| L    |  C   |    R |
| left | cent | right|
```

`:----:` で center、`----:` で right、`:----` で left。formal: `:::table{align=["L","C","R"]} :::`。

**CSV/TSV/PSV fence**(`renderCsvFence` 経路):

````markdown
```csv
名前,年齢,職業
山田,30,エンジニア
鈴木,25,デザイナー
```

```tsv
col1<TAB>col2<TAB>col3
A<TAB>B<TAB>C
```

```psv
col1|col2|col3
A|B|C
```
````

- `csv` / `tsv` / `psv` lang を fence info に指定すると自動的に GFM table へ変換 → HTML `<table>` で render
- 1 行目 = header(自動)
- セル内 inline markdown 効く(typo / 強調 等)
- 巨大 CSV を貼り付けるだけで table 化、手動 `|---|` 区切りより簡潔

### 6.6 hr / page break / 空行(§3.3.6 #55-#58)

```markdown
---            ← hr、horizontal rule

+++            ← page break、改ページ marker
+++ {role=cover}  ← cover page marker

_              ← 1 空行 marker
_5             ← 5 空行 marker(N=1-50)
```

### 6.7 改行と段落分け

- **段落間** = 空行 1 行(commonmark 標準)
- **段落内改行** = 行末 2 space + 改行 OR backslash + 改行
- **明示的縦余白** = `_<N>` marker(#46)

---

## 7. コードブロック / 描画 / 図 / 数式 詳細(§3.3.3 + §3.3.4)

### 7.1 コードブロック(§3.3.3 #42-#45)

```markdown
```
plain code
```
```

````markdown
```ts
function f(): void {}
```
````

**rendered 言語**(`code-render`):
- `tree`: ASCII tree → SVG / canvas 描画
- `mermaid`: graph / sequence / state diagram
- `dbschema`: ER diagram
- `binary`: hex dump
- `json{view}`: JSON tree view
- `query`: SQL query 結果模擬表示
- `html-render`: iframe sandbox で HTML / SVG 描画

詳細は別 spec(`docs/development/notation-redesign-2026-05/06-code-block-ecosystem.md`)。

### 7.2 figure / table block / equation / caption(§3.3.4 #46-#49)

```markdown
:::figure{#fig1}
![代替テキスト](asset:image-key)
^^^ 図のキャプション
:::

:::table{#tab1}
| col1 | col2 |
|------|------|
| A    | B    |
^^^ 表のキャプション
:::

$$
E = mc^2
$$
```

- `^^^ caption`(simple)/ `:caption:[caption]`(formal)
- `[@fig1]` `[@tab1]` `[@eq1]` で本文中参照、自動採番
- caption は内部 nested markdown 効く

### 7.3 block math(§3.3.4 #50)

```markdown
$$
\frac{a}{b} = c
$$
```

KaTeX で render。inline math は `$…$`(#12)、block は `$$…$$` 行単独。

---

## 8. 装飾系 / コメント / TOC / footnote 詳細(§3.3.5 + §3.3.6 + §3.2.3 footnote 参照経路)

### 8.1 `:::section{}` ─ semantic callout / 任意 role / generic wrapper(§3.3.5 #51-#51c)

`:::section{...}` は PKC2 で **最も多用される block-level directive** の 1 つ。以下 3 つの使い方が併存:

#### 8.1.1 8 role semantic callout(#51、頻度 freq)

固定 8 role(summary / info / note / tip / caution / important / warning / danger)は **callout sentinel 処理** で専用 CSS が当たる(色 / アイコン):

```markdown
:::section{role=note}
これは note(青色 i アイコン)。
:::

:::section{role=warning}
これは warning(オレンジ ⚠ アイコン)。
:::

:::section{role=tip}
💡 ヒント。
:::
```

**8 role table**:

| role | 用途 | アイコン / 色 |
|------|------|-----------|
| summary | 要約 | 📋 灰色 |
| info | 情報 | ℹ️ 青 |
| note | メモ | 📝 青灰 |
| tip | tips | 💡 緑 |
| caution | 注意 | ⚠️ 黄 |
| important | 重要 | ❗ オレンジ |
| warning | 警告 | ⚠️ オレンジ濃 |
| danger | 危険 | 🚨 赤 |

寛容 alias:`:::note` `:::warning` 等は自動的に `:::section{role=NAME}` に rewrite(§3.6 #79-#81)。

#### 8.1.2 任意 role 文字列(#51a、頻度 occasional)

8 role 外の任意 role 文字列も accept。専用 CSS は当たらないが、`<section class="pkc-section-callout pkc-section-<role>" data-pkc-role="<role>">` で **CSS class 自動命名**:

```markdown
:::section{role=intro}
イントロダクション(custom CSS `.pkc-section-intro` で装飾可能)。
:::

:::section{role=appendix}
付録(`.pkc-section-appendix` で style 当て可能)。
:::

:::section{role=chapter1}
カスタム role、theme CSS で扱う。
:::
```

実装上、role 値は **validation なし**(`decompose-pkc.ts:696` で kvs.role を string として取得、fallback `'section'`)。8 role 外は寛容 parse + CSS class 命名で対応、user 側 CSS で装飾を当てる。

#### 8.1.3 role 省略 default(#51b、頻度 occasional)

`:::section` だけで使うと role default = `'section'`、generic `<section>` wrapper:

```markdown
:::section
複数段落をまとめて 1 つの `<section>` でくくりたいとき。
HTML5 semantic markup として意味のある grouping。

第 2 段落も同 section 内。
:::
```

出力:`<section class="pkc-section-callout pkc-section-section" data-pkc-role="section">…</section>`。

#### 8.1.4 attrs 付き(id / class / layout hint / 任意 key)(#51c、頻度 occasional)

`:::section{...}` の `{...}` には role 以外の attrs も書ける:

```markdown
:::section{role=note #my-anchor .extra-class}
id="my-anchor" + 追加 class="extra-class" 付き note。
:::

:::section{role=cover columns=2 float=right}
layout hint 付き(columns/float は `AstSection.layout` に分離)。
:::

:::section{role=note data-section-num=1 custom-key=value}
任意 key は `attrs.kvs` に保持、HTML 出力時に data-* 属性として attach 候補。
:::
```

**`extractLayoutHint` で `AstSection.layout` field に分離される key**(`decompose-pkc.ts:648-683`):

| key(alias 含む)| 値の制約 | `AstLayoutHint` field |
|------|---------|--------|
| `columns` / `layout-columns` | integer ≥ 1 | `columns` |
| `float` / `layout-float` | `left` / `right` / `none` | `float` |
| `page-break-role` / `layout-page-break-role` | string | `pageBreakRole` |
| `region` / `layout-region` | string | `region` |
| `text-align` / `layout-text-align` | `left` / `right` / `center` / `justify` | `textAlign` |
| `slide-layout` | string | `slideLayout` |

**上記 6 種以外の key**(例:`data-section-num` / `custom-key` / `layout=cover` 等)は `extractLayoutHint` に拾われず、`AstSection.attrs.kvs` に generic attr として残る(レビュー注:`layout=X` 単独 key は generic 扱い、`columns=N` などが本来の layout hint key)。

### 8.2 conditional block(§3.3.5 #52)

```markdown
:::if{format=html}
HTML 出力時のみ表示
:::

:::if{format=docx}
Word export 時のみ表示
:::
```

format vocabulary: `html` / `markdown` / `docx` / `pptx` / `pdf`。

### 8.3 block comment(§3.3.5 #53)

```markdown
%%%
複数行の
コメント
(render されない)
%%%

:::comment
formal 形、同じ動作
:::
```

### 8.3.1 TOC block(§3.3.5 #54、2026-05-12 PR-2V 着地)

```markdown
:::toc{depth=2}
:::

:::toc{depth=3}
:::
```

- `depth=N` で表示する見出し階層を指定(N=1 で h1 のみ / N=2 で h1+h2 / N=6 で全部)
- 文書内の見出し(`#`-`######`)を **自動検出して目次 HTML を生成**(`<nav class="pkc-toc-formal">`)
- click で該当 section へ scroll
- multi-instance OK(複数の `:::toc{}` を 1 文書内に置ける)
- depth 省略時 default は 3
- 見出しが無い文書だと空 `<nav>` を出力(将来 hint 表示候補)

### 8.4 block format wrapper(§3.3.7 #60、未着地、§12 参照)

**📝 未着地、§12 で詳細提案**。複数段落を任意 class でくくる装飾箱。

### 8.5 footnote(参照経路 §3.2.3 #25-#26、定義経路 §3.3.6 #59)

```markdown
本文 [^src1] を参照。

[^src1]: ここに脚注の定義を書く。

別解:
本文 %%[fn=src1] ここに脚注の中身 %%

inline 直アタッチ:
本文 ^[ここに直接書く脚注] を見る。
```

`[^id]` は本文中の参照、`[^id]: 定義`(行頭)で末尾に定義。`%%[fn=id] 内容 %%` は comment-as-footnote(#66-#67)。

---

## 9. frontmatter / 文書 globals 詳細(§3.4 全 10 項目)

YAML frontmatter で文書全体の設定:

```yaml
---
title: ドキュメントタイトル
author: 山田太郎
kind: report                     # meta 情報(任意 string、#70)
notation: pkc-markdown-1.0       # profile 名(#61、default)
writing: vertical                # horizontal | vertical(#62)
direction: rtl                   # ltr | rtl(#63)
align: top                       # vertical 時: top|bottom|center(#64)
layout: a4-2col                  # 段組組版 9 種(#65)
heading-number: true             # 見出しアウトライン採番 on(#68)
list-number: uniform             # 順序リスト採番モード(#69)
vars:
  product: PKC2                  # 変数定義(#66)
  version: "2.3"
notation_overrides:
  ruby: false                    # 個別機能 off(#67)
---
```

### 9.1 layout(段組組版、9 種)(§3.4 #65)

| 用紙 \ 段数 | 1col | 2col | 3col |
|------------|------|------|------|
| A4 | `a4` | `a4-2col` | `a4-3col` |
| B5 | `b5` | `b5-2col` | `b5-3col` |
| Letter | `letter` | `letter-2col` | `letter-3col` |
| Legal | `legal` | `legal-2col` | `legal-3col` |

screen でカード表示、`@media print` で paper 出力(docx / pptx export も追従)。

### 9.2 vars(変数展開)(§3.4 #66)

frontmatter で定義 → 本文中 `{{vars.path.to.value}}` で展開。

```yaml
vars:
  product:
    name: PKC2
    version: "2.3"
```

```markdown
{{vars.product.name}} {{vars.product.version}}    ← 「PKC2 2.3」
```

### 9.3 heading-number(見出しアウトライン採番)(§3.4 #68)

frontmatter に `heading-number` を設定すると h1-h6 に自動採番が付く:

```yaml
heading-number: true   # 有効化、L1 開始番号 = 1
heading-number: on     # 同上
heading-number: 3      # 有効化、L1 開始番号 = 3
heading-number: false  # 無効(default)
```

出力例(`heading-number: true` の場合):

```
# 章タイトル        → 1. 章タイトル
## 節タイトル       → 1.1. 節タイトル
## 別の節          → 1.2. 別の節
# 第2章            → 2. 第2章
```

実装:`extractHeadingNumberConfig`(`src/features/markdown/document-globals.ts`)。CSS counter で表示制御、export 経路でも保持。

### 9.4 list-number(順序リスト採番モード)(§3.4 #69)

順序リスト(`1.` `2.` ...)の採番方法を指定:

```yaml
list-number: sequential   # default、書いた番号順に連番(1. 2. 3.)
list-number: uniform      # 全 `1.` を書いても render 時に 1. 2. 3. に自動連番
```

`uniform` モード:diff friendly に「全部 1.」 で書ける(rebase 等で順序変更時に手動採番修正が不要)。`sequential` モード:user が書いた数字通りに表示。

### 9.5 kind(meta string)(§3.4 #70)

任意 string で文書 type を示す:

```yaml
kind: report      # / article / memo / spec / etc.
```

`kind` は parser / renderer は使わず、外部 tool(検索 / template 適用 / export 経路)で参照する meta hook。

### 9.6 size cap

frontmatter は SOFT 16KB / HARD 1MB。超えると parse 中止 + warning。

---

## 10. 寛容 alias(Postel's Law、§3.6 全 7 項目)

AI が hallucinate しがちな形を実 render path に格上げ、`console.info` + DOM `data-pkc-canonical` で 3 つ組 hint(detected / interpretedAs / canonical)。

| # | scope | AI が書く形 | 寛容 parse 後 | code | canonical(推奨形)|
|---|-------|----------|------------|------|------|
| 75 | I | `:lead:[content]` | `<span class="pkc-lead">` | PKC2005 | 段落 + `==content==` 等 |
| 76 | I | `:spacing:{size=N}` | blank line marker | PKC2006 | `_<N>` |
| 77 | I | `:align:{position=X}` | 次段落 align 適用 | PKC2007 | 行頭 `\|\|` `\|>` `<\|` |
| 78 | I | `:quote:{attribution=…}` | `<small class="pkc-attribution">` | PKC2008 | `:::quote{author="…"}` |
| 79 | B | `:::note` `:::warning` `:::tip` `:::info` `:::caution` `:::important` `:::danger` `:::summary` | `:::section{role=NAME}` alias | PKC2009 | `:::section{role=…}` |
| 80 | B | `:::callout{type=X}` | `:::section{role=X}` alias | PKC2010 | 同上 |
| 81 | B | `:::admonition{type=X title=Y}` | `:::section{role=X}` + `## Y` | PKC2011 | 同上 |

AI repair tool は console / DOM 経由で canonical 形を学習可能(`docs/spec/markdown-dialect-for-ai-authors-v3.md` §2.3 参照)。

---

## 10b. CommonMark / GFM base 詳細(§3.5 全 4 項目)

本書独自拡張ではない、commonmark + GFM の base 仕様が実装に組み込まれているもの。

### 10b.1 Linkify(§3.5 #71)

`https://...` / `http://...` などの URL を **書くだけで `<a>` 化**:

```markdown
詳細は https://example.com を参照。
                ↓
詳細は <a href="https://example.com">https://example.com</a> を参照。
```

明示 link 構文 `[label](url)` も併存(#12)。markdown-it `linkify: true` config 由来。

### 10b.2 Typographer(§3.5 #72)

入力中の ASCII 記号を **自動的に typographic な文字に変換**(markdown-it `typographer: true` 由来):

| 入力 | 出力 |
|------|------|
| `--` | `–`(en-dash) |
| `---` | `—`(em-dash) |
| `...` | `…`(ellipsis) |
| `"text"` | `“text”`(smart double quote) |
| `'text'` | `‘text’`(smart single quote) |
| `+-` | `±` |
| `(c)` `(r)` `(tm)` | `©` `®` `™` |

無効化したい場合は frontmatter `notation_overrides: { typographer: false }`(個別機能 off、#67)。

### 10b.3 GFM strikethrough(§3.5 #73)

GitHub Flavored Markdown 標準の `~~text~~` → `<del>text</del>` 取り消し線(#3)。

### 10b.4 GFM table(§3.5 #74)

GFM 標準 pipe-table(#40 + #41 CSV fence)。

---

## 11. インライン ↔ ブロック対応関係

### 11.1 設計思想

**同じ vocabulary を inline / block で対称に提供する**。color / 背景 / サイズ / マーカー等の装飾 vocabulary は、inline で書ける形と block で書ける形が **同一 vocabulary** で書ける。

これにより:
- 学習コスト最小(inline 知れば block も書ける)
- 短文 → 長文の格上げが自然(改行入れたいだけなら inline → block へ rewrap)
- AI / canonicalize が一意経路で処理可能

### 11.2 装飾系の対応表(§3.2.1 文字装飾 inline ↔ §3.3.7 #60 block format wrapper future)

| やりたいこと | inline(§3.2) | block(§3.3 / §3.8 future)| 同一 vocabulary? |
|-----------|--------|--------|---------|
| 太字 | `**text**`(#1) | (なし、`**` は inline 限定) | inline 限定 |
| 黄色マーカー | `==text==`(#5) | `:::bg-yellow\n本文\n:::`(#60) | はい、`==` ⟷ `:::bg-yellow` |
| 任意背景色 | `:text:bg-red:`(#9) | `:::bg-red\n本文\n:::`(#60) | はい、完全対称 |
| 色 | `:text:red:`(#9) | `:::red\n本文\n:::`(#60) | はい、完全対称 |
| サイズ | `:text:1.2em:`(#9) | `:::1.2em\n本文\n:::`(#60) | はい、完全対称 |
| 色 + 背景 + サイズ | `:text:red,bg-white,1.2em:`(#9) | `:::red,bg-white,1.2em\n本文\n:::`(#60) | はい、完全対称 |
| 任意 CSS class | (inline は `:span:[text]{class=cls}` formal のみ、#28)| `:::.highlight.important\n本文\n:::`(#60 simple)| block-only simple 提供 |
| 圏点 | `^^text^^`(#7) | (なし) | inline 限定 |
| ルビ | `[base\|読み]`(#8) | (なし) | inline 限定 |
| 上付き / 下付き | `:sup:[T]` `:sub:[T]`(#10-#11) | (なし) | inline 限定、用途稀 |

### 11.3 構造系の対応(既対応)

| やりたいこと | inline(§3.2) | block(§3.3) | 同等? |
|-----------|--------|--------|---------|
| 引用 | (なし、`> text` 行単位のみ) | `> text`(#38)/ `:::quote :::`(#39)| block 限定 |
| コメント(隠し) | `%%text%%`(#22)| `%%%\n…\n%%%` / `:::comment :::`(#53)| はい、隠し動作は同じ |
| 数式 | `$x^2$`(#21) | `$$\frac{a}{b}$$` 行単独(#48 / #50) | はい、$ 数で分岐 |
| footnote | 参照 `[^id]`(#23)/ 直アタッチ `^[T]`(#24)| 定義 `[^id]: T`(行頭、#59)| はい、参照と定義 |
| variable | `{{vars.x}}`(#27)| 同左(inline 経路のみ) | inline で発火 |

### 11.4 意図的非対称(設計判断)

| 機能 | inline(§3.2) | block(§3.3) | 理由 |
|------|--------|-------|------|
| 見出し | (なし) | `# h1` 〜 `###### h6`(#29)| inline で見出しは意味上不要 |
| 段落 | (default) | (default) | implicit、明示は formal `:::paragraph` のみ |
| 箇条書き | (なし) | `- item` / `1. item`(#35-#37)| inline で意味上不要 |
| 表 | (なし) | GFM table(#40)/ CSV fence(#41)| inline で意味上不要 |
| 装飾箱(任意 class) | (なし) | `:::.cls`(#60 future、§12)| block-only、複段落くくり用途 |
| TOC | (なし) | `:::toc{depth=N}`(#54)| block 限定、目次自動生成 |

---

## 12. future 提案:ブロック装飾箱(block format wrapper)

> **2026-05-25 起草**。catalog #58 空白を埋める提案。本書 §16 未決 Q1-Q6 user 判断 + 実装 PR landing で promote。

### 12.1 動機

現在の装飾系ブロック(#55-#57)を見ると:
- `:::section{role=note}` 8 role callout は semantic 限定(固定 CSS)
- `:::paragraph{align=center indent=2}` は 単段落限定
- `:::figure{#fig1}` は図 + caption 必須
- inline `:text:bold,red:` (#9) は block 適用不可

**「複数段落を任意 class でくくる装飾箱」 が無い**。これを HTML 直書き `<div class="...">` でやるのは markdown らしさが失われる。

### 12.2 3 つの書き方(用途で選ぶ)

#### 形 A: vocabulary 形(Tier 0、最頻用)

```markdown
:::red,bg-white,1.2em
これは赤文字 / 白背景 / 1.2em の段落。

第 2 段落も同じ装飾が効く。

- リストも
- OK
:::
```

- inline #9 `:text:red,bg-white,1.2em:` と **完全に同じ vocabulary**
- 出力 `<div style="color:red; background:white; font-size:1.2em">…</div>`
- CSS rule 事前定義不要、vocabulary → inline style 直結
- 一番手軽、頻度高い用途向け

#### 形 B: class chain 形(Tier 1、user CSS 連携)

```markdown
:::.highlight.important
内容
:::
```

- packed(空白なし、point 連結、最短形)
- 事前 CSS rule 定義必要(`.highlight { ... }` `.important { ... }`)
- 出力 `<div class="pkc-format-block highlight important">…</div>`
- theme 整合 / 再利用 / styleguide 適合に向く

#### 形 C: formal 形(Tier 2、AI emit / 厳密)

```markdown
:::format{.highlight .important #note-1 indent=2 align=center custom=value}
内容
:::
```

- 全 attrs 表現可能(`.cls` + `#id` + `key=value` + `flag`)
- canonical AI emit form(`:::name{attrs}` formal 統一原則継承)
- 出力(canonical attrs 順):

```html
<div class="pkc-format-block highlight important"
     id="note-1"
     data-pkc-format-block
     data-pkc-indent="2"
     data-pkc-align="center"
     data-pkc-custom="value">
  <p>内容</p>
</div>
```

### 12.3 寛容パース 6 variation(class 形)

全て同じ AST に正規化:

```markdown
:::.highlight.important              ← packed(最短)
::: .highlight .important            ← space 区切り
::: {.highlight .important}          ← Pandoc fenced div 互換
::: highlight                        ← 単 class(`.` 省略可)
:::.highlight#myid                   ← class + id packed
::: .highlight #myid                 ← space + id
```

vocabulary 形も同様:
```markdown
:::red,bg-white,1.2em                ← CSV packed
::: red bg-white 1.2em               ← space 区切り
::: {red bg-white 1.2em}             ← brace 内
```

### 12.4 改行 3 行構造(1 行 compact 不採用)

```
:::<attrs>     ← 開き(1 行目)
<内容>         ← 中身(2 行目以降、複数段落 / list / 入れ子 block OK)
:::            ← 閉じ(最後の行)
```

- 1 行 compact 形は **採用しない** ── 短文 1 行は既存 inline `:text:attrs:` で済む
- CommonMark fence convention 踏襲(` ``` ` と同 pattern)
- 既存 PKC2 `:::section` `:::figure` 等と統一

### 12.5 `==highlight==` の block 対応

| 軸 | inline | block(future)|
|----|--------|---------|
| 経路 | `==text==`(#5) | `:::bg-yellow\n本文\n:::`(形 A vocabulary)|
| 色 | yellow 固定(`==[red]text==` で拡張、#6)| **任意背景色**(`:::bg-yellow` / `:::bg-red` / 等)|
| 専用 syntax | あり(`==` 記号)| なし、**vocabulary 経路で吸収** |
| 理由 | inline は単 token、shortcut 価値あり | block の `===` は h1(setext)と衝突危険、`:::` 統一原則維持 |

**`:::mark` semantic 専用 syntax は将来 opt-in**(検索強調 / accessibility 用途で要望が出てから)。

### 12.6 既存記法との関係

| 既存 | 維持 / 変更 | 理由 |
|------|---------|------|
| `:::section{role=…}`(#55) | **維持**(semantic 専用) | role 値で固定 CSS が当たる、装飾箱とは目的別 |
| `:::paragraph{align=… indent=…}`(#36) | **維持**(単段落限定) | 単段落 syntax の precedent、複段落は装飾箱 |
| `:::figure{#fig1}`(#51) | **維持**(図 + caption 必須) | caption + 自動採番が目的、装飾箱とは別 |
| inline `:text:red,bg-yellow,1.2em:`(#9) | **維持**(block 対応物が #58 で追加) | vocabulary は 1 経路統一 |

### 12.7 内部表現(`AstFormatBlock`)

```ts
export interface AstFormatBlock extends AstNodeBase {
  kind: 'format-block';
  /** class 名(`.cls` form、ABC sorted canonical)。 */
  classes: readonly string[];
  /** vocabulary 値(`red` `bg-yellow` `1.2em` 等)→ style mapping。 */
  styles?: Readonly<Record<string, string>>;
  /** id(`#id` form)。 */
  blockId?: string;
  /** 数値 indent(1-10、`data-pkc-indent`)。 */
  indent?: number;
  /** align(`left|center|right|justify`)。 */
  align?: 'left' | 'center' | 'right' | 'justify';
  /** その他 attrs(key ABC 順、`data-pkc-<key>` 出力)。 */
  kvs?: Readonly<Record<string, string | boolean>>;
  /** 内部 block 列(再帰 nest 可)。 */
  children: readonly AstBlock[];
}
```

### 12.8 round-trip(4 経路 byte-equivalent)

| 経路 | 入力 → 出力 | 検証 |
|------|-----------|------|
| MD → HTML | `:::red\nA\n:::` → `<div style="color:red"><p>A</p></div>` | render-html.ts case 追加 |
| HTML → MD | 上記 HTML → MD 原形 | parse-html.ts `data-pkc-format-block` 認識 |
| MD → IR → MD stable | MD → AST → MD 完全一致 | canonical attrs 順、idempotent |
| IR → HTML → IR stable | AST → HTML → AST deep equal | parse-html.ts AST 復元精度 |

byte-equivalent 比較(tag 比較ではなく、reform-2026-05 wave 10 §6 規律)。

### 12.9 5 surface CSS parity(必須 mirror)

`base.css` 追加 → Viewer popup inline `<style>` mirror 必須:

```css
.pkc-format-block { /* container 自身は装飾なし、class / style で装飾 */ }
.pkc-format-block[data-pkc-indent="1"] { padding-left: 1em; }
/* ... 10 まで */
.pkc-format-block[data-pkc-align="center"] { text-align: center; }
.pkc-format-block[data-pkc-align="right"]  { text-align: right; }
.pkc-format-block[data-pkc-align="left"]   { text-align: left; }
.pkc-format-block[data-pkc-align="justify"] { text-align: justify; }
```

詳細実装 spec:`docs/spec/pkc-block-format-attr-syntax-v1-minimum-scope.md`。

---

## 13. canonicalize 写像(simple ↔ formal)

### 13.1 default 方向: simple → formal 寄せ

```markdown
# 入力(混在)
**bold** と ==hl== と :::section{role=note}\n注意\n:::

# canonicalize 後(formal 寄せ、diff friendly)
:strong:[bold] と :mark:[hl] と :::section{role=note}\n注意\n:::
```

### 13.2 簡易対応表

| simple | formal | 写像可逆 |
|--------|--------|---------|
| `**T**` | `:strong:[T]` | はい |
| `*T*` | `:emphasis:[T]` | はい |
| `~~T~~` | `:strike:[T]` | はい |
| `` `T` `` | `:code:[T]` | はい |
| `==T==` | `:mark:[T]` | はい |
| `==[red]T==` | `:mark:[T]{color=red}` | はい |
| `^^T^^` | `:emdot:[T]{style=dot}` | はい |
| `[base\|読]` | `:ruby:[base]{rt="読"}` | はい |
| `:text:bold,red:` | `:span:[text]{bold=true color=red}` | はい(vocabulary → attrs)|
| `[label](url)` | `:link:[label]{href="url"}` | はい |
| `@[L](entry:LID)` | `:card:[L]{ref="entry:LID"}` | はい |
| `![L](entry:LID)` | `:embed:[L]{ref="entry:LID"}` | はい |
| `[@fig1]` | `:autoref:{id="fig1"}` | はい |
| `# h1` | `:::heading{level=1} h1 :::` | はい |
| `__indent` | `:::paragraph{indent=1} text :::` | はい(indent 数を `__` 連続数で expand)|
| `||center` | `:::paragraph{align=center} text :::` | はい |
| `> quote` | `:::quote text :::` | はい |
| `- list` | `:::list{kind=bullet} :::` | はい |
| `+++` | `:::break{kind=page}` | はい |
| `---` | `:::break{kind=rule}` | はい |
| `_` 1 行 | `:::blank{count=1}` | はい |
| `%%T%%` | `:comment:[T]{hidden=true}` | はい |
| `%%%\nT\n%%%` | `:::comment T :::` | はい |
| `$x^2$` | `:math:{src="x^2"}` | はい |
| `$$T$$` 行単独 | `:::math $$T$$ :::` | はい |
| `[^id]` | `:fn-ref:{id="id"}` | はい |
| `^[T]` | `:fn:[T]` | はい |
| `{{vars.x}}` | `:var:[vars.x]` | はい |
| `:::.cls`(future)| `:::format{.cls}` | はい(`§12`)|
| `:::red,bg-yellow`(future)| `:::format{red bg-yellow}` | はい(`§12`)|

### 13.3 反対方向(formal → simple)

canonicalize 設定で `direction: simple-first` にすれば formal → simple 寄せも可能(idempotent)。default は formal 寄せ(diff friendly、AI emit と整合)。

詳細 spec:`docs/development/notation-redesign-2026-05/11-canonicalization-spec.md`。

---

## 14. 内部表現 / AST / IR / 公開 API

### 14.1 AST node 一覧(主要)

| node | kind | 主属性 |
|------|------|-------|
| Document | `document` | children, frontmatter |
| Heading | `heading` | level, children, attrs |
| Paragraph | `paragraph` | indent?, align?, children |
| List | `list` | kind, items, start? |
| ListItem | `list-item` | state?(task), children |
| Quote | `quote` | author?, year?, children |
| Table | `table` | align[], rows |
| CodeBlock | `code-block` | lang?, source |
| CodeRender | `code-render` | lang, attrs, source |
| Break | `break` | kind(page\|rule), role? |
| Blank | `blank` | count |
| Section | `section` | role(8 種), children |
| Directive(if/comment/figure/table-block) | `directive` | name, attrs, children |
| FormatBlock(future) | `format-block` | classes, styles, blockId, indent, align, kvs, children |
| Strong / Emphasis / Strike / InlineCode | (各 kind) | children |
| Mark | `mark` | color?, children |
| EmDot | `emdot` | style, children |
| Ruby | `ruby` | base, rt |
| Sup / Sub | `sup` / `sub` | children |
| Span | `span` | attrs, children |
| Link / Card / Embed | `link` / `card` / `embed` | label, href / ref, mode? |
| Image | `image` | src, alt, attrs |
| AutoRef | `autoref` | id |
| Math | `math` | display, src |
| Comment | `comment` | kind, hidden, visibility, id? |
| FnRef / Fn | `fn-ref` / `fn` | id |
| Var | `var` | path |
| Text | `text` | value |

### 14.2 公開 API(`window.PKC.ast`)

PR-2GG で着地、6 関数:

```ts
window.PKC.ast.parseMarkdown(text: string): AstDocument
window.PKC.ast.renderHtml(ast: AstDocument): string
window.PKC.ast.canonicalize(ast: AstDocument, opts?): AstDocument
window.PKC.ast.toPandocJson(ast: AstDocument): PandocJson
window.PKC.ast.parseHtml(html: string): AstDocument        // round-trip 逆経路
window.PKC.ast.renderMarkdown(ast: AstDocument): string    // canonicalize MD emit
```

詳細:`docs/spec/public-ast-api-for-ai.md`。

### 14.3 可換 IR spec

`docs/spec/ast-commutative-ir.md`。AST が IR として:
- markdown ↔ HTML ↔ JSON pandoc ↔ docx ↔ pptx ↔ pdf 経路の hub
- canonicalize で形を寄せる
- diff-friendly

---

## 15. やってはいけないこと(deny list、§3.7 詳細)

| ❌ NG | scope | 何が起きる | 推奨 |
|-------|-------|---------|------|
| `<div>` `<style>` 等 inline HTML 本文に(#87) | I/B | `html: false`、escape されて literal 表示 | `` ```html-render `` fence(#45) |
| `[[em:..]]` 新規生成(#82) | I | 動くけど deprecated warning | `^^..^^`(#7) |
| `<\|text` を物理左寄せとして(#84) | B | logical end に解釈される | 物理左は formal `:::paragraph{align=left}`(#34) |
| `:role:[…]` で知らない role 名(#90) | I | render されない、文字列化 | allowlist 内のみ(`:strong:` `:emphasis:` `:code:` `:strike:` `:mark:` `:emdot:` `:ruby:` `:caption:` `:autoref:` `:sup:` `:sub:` `:span:` `:fn:` `:fn-ref:` `:var:` `:math:` `:comment:` `:link:` `:card:` `:embed:` `:image:` `:asset-link:`) |
| `:span:[…]{style="…"}`(#88) | I | XSS allowlist 外、silent skip | `:span:[…]{class=warn}` で CSS class |
| frontmatter 16KB 超(#91) | F | size cap で parse 中止 + warning | コンパクトに |
| 行頭 `>>>` `===` 等独自記号(#89) | B | commonmark 標準衝突 | 本書記載構文のみ |
| `:::frontmatter` / `:::body` directive(#92) | B | 未実装 + PKC1010 warning | Phase 3 PR-2W で正式実装予定 |
| `[[ruby:..]]` 新規生成(#83) | I | 🔄 deprecated、現は accept | `[base\|読]`(#8) |
| `^x^` / `~x~` 上下付き simple(#85-#86) | I | ❌ 廃止予定 | `:sup:[x]`(#10)/ `:sub:[x]`(#11)/ math `$x^2$` |
| **§12 future syntax 着地前に emit**(#60) | B | **render されない** | 本書 promote + 実装 PR landing 待ち |

(`:::toc{depth=N}` は **2026-05-12 PR-2V で実装着地済**、#54 として block 記法に移行。deny list から削除)

---

## 16. 未決事項(本書 promote 前 user 判断)

§12 future 提案を実装に進める前に、以下 6 点 user 判断:

| # | 質問 | 候補 | Claude 推奨(理由)|
|---|------|------|------|
| Q1 | formal directive 名(#58)| `format` / `block` / `wrap` / `box` / `div` | **`format`**(「書式適用」 が単語から読み取れる、layout 機能 `group` と非衝突、`block` は markdown 世界で意味曖昧) |
| Q2 | class chain 形 最短形 | `:::.cls.cls`(3 colon)/ `::.cls.cls`(2 colon)/ `:.cls.cls:`(1 colon、inline 完全 symmetric)| **`:::.cls.cls`**(既存 `:::section` 等と統一、`::` は inline 予約感、`:` は inline `:role:` 予約) |
| Q3 | vocabulary 形(`:::red,bg-yellow`)の Tier 位置付け | (a) Tier 0 priority /(b) class 形と並列 /(c) formal `{...}` のみ | **(a) Tier 0 priority**(inline `:text:vocab:` と完全対称、頻度高、CSS class 事前定義不要、user「インライン記法に近い」 emphasis) |
| Q4 | `==highlight==` の block 対応 | (a) vocabulary `:::bg-yellow` で吸収 /(b) `:::mark` semantic 追加 /(c) block `==` 専用 syntax | **(a) vocabulary 吸収**(setext h1 衝突回避、`:::` 統一原則維持、任意色拡張可能、semantic `:::mark` は将来 opt-in) |
| Q5 | 1 行 compact 形 | (a) 採用しない、改行 3 行 fix /(b) `:::bg-yellow|text|:::` 等 1 行も accept | **(a) 採用しない**(短文 1 行は inline `:text:bg-yellow:` で済む、新 syntax コスト > 利得、attrs / content 境界 ambiguous) |
| Q6 | canonicalize default | (a) simple → formal 寄せ /(b) formal → simple 寄せ /(c) 入力保持 | **(a) simple → formal 寄せ**(diff friendly、IR canonical 一意、AI emit と整合) |

**判断後の流れ**:Q1-Q6 確定 → 本書 v4 を draft → candidate に格上げ → §12 実装 PR(`pkc-block-format-attr-syntax-v1-minimum-scope.md` 経路で `AstFormatBlock` + parser 拡張 + 5 surface CSS + 13 test case + Playwright parity)landing → v4 canonical promote。

---

## 17. 関連 doc / 着地後段取り

### 17.1 関連 doc

| 用途 | doc |
|------|-----|
| AI 向け厳密 spec v3(現 canonical)| [`markdown-dialect-for-ai-authors-v3.md`](./markdown-dialect-for-ai-authors-v3.md) |
| AI 向け v2 / v1(supersede 済) | [v2](./markdown-dialect-for-ai-authors-v2.md) / [v1](./markdown-dialect-for-ai-authors-v1.md) |
| 末端 user manual(本書 promote 後 派生) | [`../manual/12_マークダウン拡張記法.md`](../manual/12_マークダウン拡張記法.md) |
| 設計議論 12 章 | [`../development/notation-redesign-2026-05/`](../development/notation-redesign-2026-05/) |
| §12 future 実装 spec | [`./pkc-block-format-attr-syntax-v1-minimum-scope.md`](./pkc-block-format-attr-syntax-v1-minimum-scope.md) |
| 公開 AST API | [`./public-ast-api-for-ai.md`](./public-ast-api-for-ai.md) |
| 可換 IR | [`./ast-commutative-ir.md`](./ast-commutative-ir.md) |
| canonicalize 写像 | [`../development/notation-redesign-2026-05/11-canonicalization-spec.md`](../development/notation-redesign-2026-05/11-canonicalization-spec.md) |
| 寛容 parse doctrine | [`../development/parser-recovery-spec.md`](../development/parser-recovery-spec.md) |
| 5 surface CSS 規約 | [`../development/markdown-render-scope.md`](../development/markdown-render-scope.md) |
| リリース履歴 | [`../release/CHANGELOG_v2.3.0.md`](../release/CHANGELOG_v2.3.0.md) |
| feature roadmap | [`../development/feature-requests-2026-04-28-roadmap.md`](../development/feature-requests-2026-04-28-roadmap.md) §10-2 |

### 17.2 着地後段取り(v4 → 確定 → manual 派生)

1. **§16 Q1-Q6 user 判断** → 本書 §12 / §16 を確定値に書換 → title から「draft」 marker 削除
2. **実装 PR 着地**(`pkc-block-format-attr-syntax-v1-minimum-scope.md` 経路で `AstFormatBlock` + parser 拡張 + 5 surface CSS + 13 test case + Playwright parity)
3. **本書 v4 を canonical promote** + AI 規約 v3 archive 候補 marker
4. **manual ch12 §12.11 派生**:本書 §3 早見表 + §4-§10 詳細を末端 user 視点で再編、dog-fooding 流儀(§12.9 と同じ)で manual 自身を v4 機能 full に使う
5. **AI 規約 v4 起草**:`markdown-dialect-for-ai-authors-v4.md` を本書 v4 と同 spec で起草、LLM emit 用 self-contained reference に再編、v3 archive
6. **CHANGELOG**:`CHANGELOG_v2.4.0.md` 起草(本書 + 装飾箱実装の minor bump)、`docs/release/CHANGELOG_v2.3.0.md` を範に作成
7. **INDEX 同期**:本書 v4 を Active spec に登録(orphan 防止)、v3 を archive 候補に、catalog #58 を ✅ 化

### 17.3 doc lifecycle 自己 binding(本書 commit 時)

- 本 doc を `docs/development/INDEX.md` Active spec に同 commit で登録
- `docs/spec/markdown-dialect-for-ai-authors-v3.md` 冒頭に「⚠️ 人間向け完全 spec v4 draft あり、本書 promote 時に Successor v4 確定」 marker 追加
- `docs/development/notation-redesign-2026-05/01-notation-catalog.md` §1.2.5 item #26 を「block format wrapper(v4 §12 参照)」 に更新
- `docs/manual/12_マークダウン拡張記法.md` §12.10 関連 doc 表 に本書 v4 entry 追加
- `docs/release/CHANGELOG_v2.3.0.md` に「人間向け完全 spec v4 起草」 1 行追記

---

**本書 v4 が catch all single-source human spec として機能する**ことを意図。AI 規約 v3 が AI 向け self-contained reference であるのと対をなす。manual はこの spec から派生する位置付け。
