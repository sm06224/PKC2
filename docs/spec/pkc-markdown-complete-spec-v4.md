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
- [3. 全記法対応表(87 項目早見表)](#3-全記法対応表87-項目早見表)
- [4. 文字装飾(インライン)18 項目詳細](#4-文字装飾インライン18-項目詳細)
- [5. リンク / 埋め込み / カード 9 項目詳細](#5-リンク--埋め込み--カード-9-項目詳細)
- [6. 段落 / 構造 / リスト / 表 15 項目詳細](#6-段落--構造--リスト--表-15-項目詳細)
- [7. コードブロック / 描画 / 図 / 数式 9 項目詳細](#7-コードブロック--描画--図--数式-9-項目詳細)
- [8. 装飾系 / コメント / footnote 11 項目詳細](#8-装飾系--コメント--footnote-11-項目詳細)
- [9. frontmatter / 文書 globals 7 項目詳細](#9-frontmatter--文書-globals-7-項目詳細)
- [10. 寛容 alias(Postel's Law)7 項目](#10-寛容-aliaspostels-law7-項目)
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

## 3. 全記法対応表(87 項目早見表)

> 全 PKC Markdown 拡張機能を 1 つの表に集約。詳細は §4-§10。

| # | カテゴリ | 機能 | simple | formal | 頻度 | status |
|---|---------|------|--------|--------|------|--------|
| 1 | 文字装飾 | 太字 | `**T**` | `:strong:[T]` | very freq | ✅ |
| 2 | 文字装飾 | 斜体 | `*T*` | `:emphasis:[T]` | very freq | ✅ |
| 3 | 文字装飾 | 取り消し | `~~T~~` | `:strike:[T]` | freq | ✅ |
| 4 | 文字装飾 | inline code | `` `T` `` | `:code:[T]` | very freq | ✅ |
| 5 | 文字装飾 | マーカー(黄色) | `==T==` | `:mark:[T]` | freq | ✅ |
| 6 | 文字装飾 | マーカー(色) | `==[red]T==` | `:mark:[T]{color=red}` | occasional | ✅ |
| 7 | 文字装飾 | 圏点 / 傍点 | `^^T^^` | `:emdot:[T]{style=dot\|circle}` | occasional | ✅ |
| 8 | 文字装飾 | ルビ | `[base\|読み]`(将来)/ `[[ruby:..]]`(旧) | `:ruby:[base]{rt="読み"}` | occasional | 🔄 |
| 9 | 文字装飾 | 色 / 背景 / サイズ | `:text:red,bg-yellow,1.2em:` | `:span:[text]{color=red bg=yellow size=1.2em}` | occasional | ✅ |
| 10 | 文字装飾 | 上付き | — | `:sup:[T]` | rare | ✅ |
| 11 | 文字装飾 | 下付き | — | `:sub:[T]` | rare | ✅ |
| 12 | 文字装飾 | inline 数式 | `$x^2$` | `:math:{src="x^2"}` | occasional | ✅ |
| 13 | 文字装飾 | inline コメント | `%%T%%` | `:comment:[T]{hidden=true}` | occasional | ✅ |
| 14 | 文字装飾 | footnote 参照 | `[^id]` | `:fn-ref:{id="id"}` | occasional | ✅ |
| 15 | 文字装飾 | inline footnote | `本文^[補足]` | `:fn:[補足]` | occasional | ✅ |
| 16 | 文字装飾 | 変数展開 | `{{vars.x}}` | `:var:[vars.x]` | freq(vars 使用時) | ✅ |
| 17 | 文字装飾 | inline span + attrs | — | `:span:[T]{class=… #id key=v}` | rare | ✅ |
| 18 | 文字装飾 | inline 簡易属性 default em-dot | `:T::` | `:emdot:[T]` | rare | 📝 |
| 19 | リンク | 外部 link | `[L](url)` | `:link:[L]{href="url"}` | very freq | ✅ |
| 20 | リンク | entry link | `[L](entry:LID)` | `:link:[L]{ref="entry:LID"}` | freq | ✅ |
| 21 | リンク | entry card | `@[L](entry:LID)` | `:card:[L]{ref="entry:LID"}` | freq | ✅ |
| 22 | リンク | entry embed seamless | `![L](entry:LID)` | `:embed:[L]{ref="entry:LID"}` | freq | 🔄 |
| 23 | リンク | entry embed quote | `![L](entry:LID){quote}` | `:embed:[L]{ref="entry:LID" mode="quote"}` | occasional | 📝 |
| 24 | リンク | 画像(URL) | `![alt](https://…)` | `:image:{src="url" alt="alt"}` | freq | ✅ |
| 25 | リンク | 画像(asset) | `![alt](asset:KEY)` | `:image:{src="asset:KEY" alt="alt"}` | freq | ✅ |
| 26 | リンク | asset link(非画像) | `[L](asset:KEY)` | `:asset-link:[L]{key="KEY"}` | occasional | ✅ |
| 27 | リンク | 他 container permalink | `[L](pkc://c/e)` | `:link:[L]{href="pkc://…" kind="permalink"}` | rare | ✅ |
| 28 | リンク | block ref(同 doc anchor) | `[#id]` | `:block-ref:{id="…"}` | occasional | 📝 |
| 29 | リンク | term ref(用語) | `[?term]` | `:term-ref:{name="term"}` | occasional | 📝 |
| 30 | リンク | 自動採番 ref | `[@fig1]` `[@tab1]` `[@eq1]` | `:autoref:{id="fig1"}` | occasional | ✅ |
| 31 | 段落 | heading h1-h6 | `# T` 〜 `###### T` | `:::heading{level=N} T :::` | very freq | ✅ |
| 32 | 段落 | heading + attrs | `# T {#id .cls k=v}` | 同上 + attrs | freq | ✅ |
| 33 | 段落 | paragraph(default) | (自動) | `:::paragraph T :::` | very freq | ✅ |
| 34 | 段落 | paragraph + indent | `__T` / `＿T` | `:::paragraph{indent=N} T :::` | freq | ✅ |
| 35 | 段落 | paragraph + align logical | `\|\|T`(center)/ `\|>T`(end、+typo 3 形) | `:::paragraph{align=center\|end\|start} T :::` | occasional | 🔄 |
| 36 | 段落 | paragraph + align physical | — | `:::paragraph{align=left\|right\|top\|bottom} T :::` | rare | ✅ formal-only |
| 37 | 構造 | bullet list | `- T`(`*` `+` 同義) | `:::list{kind=bullet} :::` | very freq | ✅ |
| 38 | 構造 | ordered list | `1. T` | `:::list{kind=ordered start=N} :::` | very freq | ✅ |
| 39 | 構造 | task list | `- [ ] T` / `- [x] T` | `:::list{kind=task} :::` | freq | ✅ |
| 40 | 構造 | blockquote | `> T` | `:::quote T :::` | freq | ✅ |
| 41 | 構造 | quote + author | — | `:::quote{author="X" year=Y} T :::` | rare | ✅ |
| 42 | 構造 | table(GFM) | `\| h \| h \|\n\|---\|---\|...` | `:::table{align=["L","R"]} :::` | freq | ✅ |
| 43 | 構造 | hr / horizontal rule | `---` 行単独 | `:::break{kind=rule}` | occasional | ✅ |
| 44 | 構造 | page break | `+++` 行単独 | `:::break{kind=page}` | occasional | ✅ |
| 45 | 構造 | page break + role | `+++ {role=cover}` | `:::break{kind=page role=cover}` | occasional | ✅ |
| 46 | 構造 | 空行マーカー | `_` 行単独(1)/ `_<N>`(N=1-50) | `:::blank{count=N}` | occasional | ✅ |
| 47 | コード | code(plain) | ` ```code``` ` | `:::code :::` | freq | ✅ |
| 48 | コード | code(lang 指定) | ` ```ts code``` ` | `:::code{lang="ts"} :::` | freq | ✅ |
| 49 | コード | rendered code(tree/mermaid/json{view}/dbschema/binary/query/…) | ` ```tree ``` ` 等 | `:::code-render{lang="tree"} :::` | freq(用途次第) | ✅ |
| 50 | コード | HTML sandbox fence | ` ```html-render <svg>…</svg>``` ` | `:::code{lang="html-render"} :::` | rare | ✅ |
| 51 | 図表式 | figure block | `:::figure{#fig1}\n![](src)\n^^^ caption\n:::` | 同左 | occasional | ✅ |
| 52 | 図表式 | table block | `:::table{#tab1}\n…\n:::` | 同左 | occasional | ✅ |
| 53 | 図表式 | equation block | `$$\frac{a}{b}$$` 行単独 | `:::equation :::` | occasional | ✅ |
| 54 | 図表式 | caption formal | `:::figure` 内 `:caption:[T]` | 同左 | occasional | ✅ |
| 55 | 装飾系 | semantic callout(8 role) | — | `:::section{role=note\|tip\|warning\|caution\|important\|info\|danger\|summary} :::` | occasional | ✅ |
| 56 | 装飾系 | conditional block | — | `:::if{format=html\|markdown\|docx} :::` | rare | ✅ |
| 57 | 装飾系 | block comment | `%%%\n…\n%%%` | `:::comment :::` | occasional | ✅ |
| 58 | 装飾系 | **block format wrapper(任意 class くくり)** | **未着地、§12 提案中** | **同上** | **occasional** | **📝** |
| 59 | frontmatter | notation profile | `notation: pkc-markdown-1.0` | 同左 | rare | ✅ |
| 60 | frontmatter | writing direction | `writing: vertical\|horizontal` | 同左 | rare | ✅ |
| 61 | frontmatter | direction(LTR/RTL) | `direction: rtl\|ltr` | 同左 | rare | ✅ |
| 62 | frontmatter | document align | `align: left\|right\|center\|top\|bottom` | 同左 | rare | ✅ |
| 63 | frontmatter | layout(段組組版、9 種) | `layout: a4-2col` 等 | 同左 | occasional | ✅ |
| 64 | frontmatter | vars 定義 | `vars: { x: 値 }` | 同左 | freq(vars 使用時) | ✅ |
| 65 | frontmatter | notation_overrides | `notation_overrides: { ruby: false }` | 同左 | rare | ✅ |
| 66 | footnote | comment-as-footnote | `%%[fn] T %%` | `:comment:[T]{visibility=footnote}` | occasional | ✅ |
| 67 | footnote | comment-as-footnote + id | `%%[fn=src1] T %%` | `:comment:[T]{visibility=footnote id="src1"}` | occasional | ✅ |
| 68 | footnote | footnote 定義(行頭) | `[^id]: 定義` | — | occasional | ✅ |
| 69 | math | block math | `$$…$$` 行単独 | `:::math $$…$$ :::` | occasional | ✅ |
| 70 | macros | macro expansion | — | `:macro:[name](args)` | rare | 📝 |
| 71 | 寛容 | `:lead:[T]` | PKC2005 | canonical: 段落 + `==T==` 等 | (AI 由来) | ✅ tolerant |
| 72 | 寛容 | `:spacing:{size=N}` | PKC2006 | canonical: `_<N>` | (AI 由来) | ✅ tolerant |
| 73 | 寛容 | `:align:{position=X}` | PKC2007 | canonical: 行頭 `\|\|` `\|>` `<\|` | (AI 由来) | ✅ tolerant |
| 74 | 寛容 | `:quote:{attribution=…}` | PKC2008 | canonical: `:::quote{author="…"}` | (AI 由来) | ✅ tolerant |
| 75 | 寛容 | `:::note` `:::warning` etc 8 種 | PKC2009 | canonical: `:::section{role=NAME}` | (AI 由来) | ✅ tolerant |
| 76 | 寛容 | `:::callout{type=X}` | PKC2010 | canonical: `:::section{role=X}` | (AI 由来) | ✅ tolerant |
| 77 | 寛容 | `:::admonition{type=X title=Y}` | PKC2011 | canonical: `:::section{role=X}` + `## Y` | (AI 由来) | ✅ tolerant |
| 78 | deny | `:::toc{depth=N}` | ❌ 未実装 + PKC1010 warning | (Phase 3 PR-2V で正式実装予定) | — | ❌ |
| 79 | deny | `:::frontmatter` `:::body` | ❌ 未実装 + PKC1010 warning | (Phase 3 PR-2W で正式実装予定) | — | ❌ |
| 80 | deny | inline HTML(`<div>` 等本文) | ❌ `html: false` で escape | 推奨: `` ```html-render `` fence | — | ❌ |
| 81 | deny | `:span:[…]{style="…"}` | ❌ XSS allowlist 外、silent skip | 推奨: `:span:[…]{class=warn}` | — | ❌ |
| 82 | deny | 行頭 `>>>` `===` 等独自記号 | ❌ commonmark 標準衝突 | 推奨: 本書記載構文のみ | — | ❌ |
| 83 | 廃止 | `[[em:..]]` | ❌ deprecated | 移行先: `^^..^^`(#7) | — | ❌ |
| 84 | 廃止 | `[[ruby:base\|読]]` | 🔄 deprecated | 移行先: `[base\|読]`(#8、将来) | — | 🔄 |
| 85 | 廃止 | `<\|T` 物理左寄せ | 🔄 reform で end に正規化 | 物理左は formal `:::paragraph{align=left}`(#36) | — | 🔄 |
| 86 | 廃止 | `^x^` 上付き | ❌ 廃止予定 | 移行先: `:sup:[x]` または `$x^2$` | — | ❌ |
| 87 | 廃止 | `~x~` 下付き | ❌ 廃止予定 | 移行先: `:sub:[x]` または `$a_n$` | — | ❌ |

**統計**:全 87 項目 / ✅ 既実装 64 / 🔄 過渡期 5 / 📝 未着地 5 / ❌ 廃止 / deny 13。simple 形あり 60 / formal-only 27。

---

## 4. 文字装飾(インライン)18 項目詳細

> インライン = 行の中で部分的に効く装飾。

### 4.1 #1 太字

| 軸 | 値 |
|----|---|
| simple | `**text**` |
| formal | `:strong:[text]` |
| 出力 | `<strong>text</strong>` |
| 内部表現 | `Strong { children }` |
| 注意 | `__text__` も commonmark 標準で太字、ただし PKC2 では `__` は行頭で indent 用(#34)なので競合回避のため本文中での `__bold__` は推奨しない |

### 4.2 #2 斜体

```markdown
*斜体*           ← simple
:emphasis:[斜体] ← formal
```

`_text_` も commonmark 標準で斜体、行中なら衝突なし。

### 4.3 #3 取り消し線

```markdown
~~消去線~~       ← simple(GFM)
:strike:[消去線] ← formal
```

### 4.4 #4 inline code

```markdown
`code`           ← simple
:code:[code]     ← formal
```

backtick 内の `:role:[…]` 等 PKC 拡張は **発火しない**(inline code は literal)。

### 4.5 #5 マーカー(黄色)

```markdown
==重要==         ← simple、<mark>重要</mark>、default 黄色
:mark:[重要]     ← formal
```

CSS:`mark { background: yellow; }`(custom theme で変更可)。

### 4.6 #6 マーカー(色指定)

```markdown
==[red]赤マーカー==              ← simple、色指定
:mark:[赤マーカー]{color=red}    ← formal
```

色 vocabulary: `red` / `blue` / `green` / `yellow` / `cyan` / `magenta` / `orange` / `purple` / `pink` / `gray` 等(`base.css` 定義の named color)。

### 4.7 #7 圏点 / 傍点

```markdown
^^大事^^           ← simple、各文字上に点
:emdot:[大事]      ← formal、style=dot(default)
:emdot:[重要]{style=circle}  ← 圏点(白丸)
```

内部 nested markdown 効く(`^^**bold**^^` 等、PR-2P)。

### 4.8 #8 ルビ(ふりがな)

```markdown
[難読|なんどく]                ← simple(将来 default、現状は migration 段階)
[[ruby:難読|なんどく]]         ← 旧 simple(deprecated、引き続き受理 + warning)
:ruby:[難読]{rt="なんどく"}    ← formal
```

### 4.9 #9 色 / 背景 / サイズ(inline 簡易属性、L-6)

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

### 4.10 #10-#11 上付き / 下付き

```markdown
x:sup:[2]    ← x²、formal-only
a:sub:[n]    ← aₙ、formal-only
```

simple なし。math mode `$x^2$` `$a_n$` で代替可。

### 4.11 #12 inline 数式

```markdown
$x^2 + y^2 = z^2$    ← KaTeX 構文
:math:{src="x^2+y^2=z^2"}  ← formal
```

block 数式は #69、`$$…$$` 行単独。

### 4.12 #13 inline コメント

```markdown
本文 %%メモ%% つづき     ← 「メモ」 は render されない
:comment:[メモ]{hidden=true}  ← formal
```

著者向けのメモ。export(docx/pptx)時も出力されない(`:::if{format=...}` で format 別表示制御は #56)。

### 4.13 #14-#15 footnote(参照 + inline)

```markdown
本文[^src1]            ← 参照、本文末尾の定義へ
[^src1]: 定義内容       ← 定義(行頭、#68)

本文^[直アタッチ補足]   ← inline footnote、その場で定義
```

### 4.14 #16 変数展開

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

### 4.15 #17 inline span + attrs

```markdown
:span:[文字列]{class=warn #id-1 data-key=value}    ← formal-only
```

simple なし(`:text:attrs:` で大半 vocabulary cover、それ以外の任意 attrs は formal)。`style=…` は禁止(XSS、#81)。

### 4.16 #18 inline 簡易属性 default em-dot(未着地)

```markdown
:重要::    ← attrs 省略 = em-dot 適用
:emdot:[重要]  ← 等価
```

📝 未着地、`:T::` の attrs 省略形を em-dot default 解釈にする提案(catalog #35)。

---

## 5. リンク / 埋め込み / カード 9 項目詳細

### 5.1 #19-#27 リンク / 埋め込みの選び方

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

### 5.2 #28-#29 block ref / term ref(未着地)

```markdown
[#section-1]    ← 同 doc 内 block へ anchor link、📝 未着地
[?用語]         ← 用語集参照、📝 未着地
```

### 5.3 #30 自動採番参照

```markdown
:::figure{#fig1}\n![](url)\n^^^ タイトル\n:::    ← figure block(#51)
本文中で図 [@fig1] を参照    ← 自動採番、出力「図 1」

:::table{#tab1}…:::        ← 表 block、[@tab1] で参照
$$E=mc^2$$    ← 数式に id 付ければ [@eq1] で参照
```

`autoref` formal は `:autoref:{id="fig1"}`。番号は文書内出現順で自動採番。

---

## 6. 段落 / 構造 / リスト / 表 15 項目詳細

### 6.1 #31-#32 見出し

```markdown
# h1                          ← simple
## h2 {#chapter-1 .important}  ← simple + attrs(Pandoc 互換 trailing)
:::heading{level=2 id="chapter-1" classes=["important"]} h2 :::  ← formal
```

階段:h1 16pt / h2 14pt / h3 12pt / h4-h6 10.5pt(default theme)。

### 6.2 #33-#36 段落 / indent / align

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

### 6.3 #37-#39 リスト

```markdown
- bullet
- list

1. ordered
2. list

- [ ] todo
- [x] done       ← GFM task list、PKC2 では todo archetype と連動
```

formal: `:::list{kind=bullet|ordered|task} :::`。

### 6.4 #40-#41 quote

```markdown
> 通常引用     ← commonmark

:::quote{author="夏目漱石" year=1906}
吾輩は猫である。
:::            ← author 付き、PKC R-D
```

複数 entry を 1 quote で囲める(`:::quote{author} ![](entry:A) ![](entry:B) :::`)。

### 6.5 #42 table(GFM + align)

```markdown
| col1 | col2 | col3 |
|------|:----:|-----:|
| L    |  C   |    R |
| left | cent | right|
```

`:----:` で center、`----:` で right、`:----` で left。formal: `:::table{align=["L","C","R"]} :::`。

### 6.6 #43-#46 hr / page break / 空行

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

## 7. コードブロック / 描画 / 図 / 数式 9 項目詳細

### 7.1 #47-#50 コードブロック

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

### 7.2 #51-#54 figure / table / equation

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

### 7.3 #69 block math

```markdown
$$
\frac{a}{b} = c
$$
```

KaTeX で render。inline math は `$…$`(#12)、block は `$$…$$` 行単独。

---

## 8. 装飾系 / コメント / footnote 11 項目詳細

### 8.1 #55 semantic callout(8 role)

```markdown
:::section{role=note}
これは note(青色 i アイコン)。
:::

:::section{role=warning}
これは warning(オレンジ ⚠ アイコン)。
:::
```

**8 role**:
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

寛容 alias:`:::note` `:::warning` 等は自動的に `:::section{role=NAME}` に rewrite(#75-#77)。

### 8.2 #56 conditional block

```markdown
:::if{format=html}
HTML 出力時のみ表示
:::

:::if{format=docx}
Word export 時のみ表示
:::
```

format vocabulary: `html` / `markdown` / `docx` / `pptx` / `pdf`。

### 8.3 #57 block comment

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

### 8.4 #58 block format wrapper

**📝 未着地、§12 で詳細提案**。複数段落を任意 class でくくる装飾箱。

### 8.5 #66-#68 footnote

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

## 9. frontmatter / 文書 globals 7 項目詳細

YAML frontmatter で文書全体の設定:

```yaml
---
title: ドキュメントタイトル
author: 山田太郎
notation: pkc-markdown-1.0      # default
writing: vertical                # horizontal | vertical
direction: rtl                   # ltr | rtl
align: top                       # vertical 時: top|bottom|center
layout: a4-2col                  # 段組組版
vars:
  product: PKC2
  version: "2.3"
notation_overrides:
  ruby: false                    # ruby 機能 off
---
```

### 9.1 #63 layout(段組組版、9 種)

| 用紙 \ 段数 | 1col | 2col | 3col |
|------------|------|------|------|
| A4 | `a4` | `a4-2col` | `a4-3col` |
| B5 | `b5` | `b5-2col` | `b5-3col` |
| Letter | `letter` | `letter-2col` | `letter-3col` |
| Legal | `legal` | `legal-2col` | `legal-3col` |

screen でカード表示、`@media print` で paper 出力(docx / pptx export も追従)。

### 9.2 #64 vars(変数展開)

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

### 9.3 size cap

frontmatter は SOFT 16KB / HARD 1MB。超えると parse 中止 + warning。

---

## 10. 寛容 alias(Postel's Law)7 項目

AI が hallucinate しがちな形を実 render path に格上げ、`console.info` + DOM `data-pkc-canonical` で 3 つ組 hint(detected / interpretedAs / canonical)。

| # | AI が書く形 | 寛容 parse 後 | code | canonical(推奨形)|
|---|----------|------------|------|------|
| 71 | `:lead:[content]` | `<span class="pkc-lead">` | PKC2005 | 段落 + `==content==` 等 |
| 72 | `:spacing:{size=N}` | blank line marker | PKC2006 | `_<N>` |
| 73 | `:align:{position=X}` | 次段落 align 適用 | PKC2007 | 行頭 `\|\|` `\|>` `<\|` |
| 74 | `:quote:{attribution=…}` | `<small class="pkc-attribution">` | PKC2008 | `:::quote{author="…"}` |
| 75 | `:::note` `:::warning` `:::tip` `:::info` `:::caution` `:::important` `:::danger` `:::summary` | `:::section{role=NAME}` alias | PKC2009 | `:::section{role=…}` |
| 76 | `:::callout{type=X}` | `:::section{role=X}` alias | PKC2010 | 同上 |
| 77 | `:::admonition{type=X title=Y}` | `:::section{role=X}` + `## Y` | PKC2011 | 同上 |

AI repair tool は console / DOM 経由で canonical 形を学習可能(`docs/spec/markdown-dialect-for-ai-authors-v3.md` §2.3 参照)。

---

## 11. インライン ↔ ブロック対応関係

### 11.1 設計思想

**同じ vocabulary を inline / block で対称に提供する**。color / 背景 / サイズ / マーカー等の装飾 vocabulary は、inline で書ける形と block で書ける形が **同一 vocabulary** で書ける。

これにより:
- 学習コスト最小(inline 知れば block も書ける)
- 短文 → 長文の格上げが自然(改行入れたいだけなら inline → block へ rewrap)
- AI / canonicalize が一意経路で処理可能

### 11.2 装飾系の対応表(#7、#9 等 inline ↔ #58 block format wrapper future)

| やりたいこと | inline | block(future、§12)| 同一 vocabulary? |
|-----------|--------|--------|---------|
| 太字 | `**text**`(#1) | (なし、`**`は inline 限定) | inline 限定 |
| 黄色マーカー | `==text==`(#5) | `:::bg-yellow\n本文\n:::` | はい、`==` ⟷ `:::bg-yellow` |
| 任意背景色 | `:text:bg-red:`(#9) | `:::bg-red\n本文\n:::` | はい、完全対称 |
| 色 | `:text:red:`(#9) | `:::red\n本文\n:::` | はい、完全対称 |
| サイズ | `:text:1.2em:`(#9) | `:::1.2em\n本文\n:::` | はい、完全対称 |
| 色 + 背景 + サイズ | `:text:red,bg-white,1.2em:`(#9) | `:::red,bg-white,1.2em\n本文\n:::` | はい、完全対称 |
| 任意 CSS class | (inline は `:span:[text]{class=cls}` formal のみ #17) | `:::.highlight.important\n本文\n:::`(simple)| block-only simple 提供 |
| 圏点 | `^^text^^`(#7) | (なし) | inline 限定 |
| ルビ | `[base\|読み]`(#8) | (なし) | inline 限定 |
| 上付き / 下付き | `:sup:[T]` `:sub:[T]`(#10-#11) | (なし) | inline 限定、用途稀 |

### 11.3 構造系の対応(既対応)

| やりたいこと | inline | block | 同等? |
|-----------|--------|--------|---------|
| 引用 | (なし、`> text` 行単位のみ) | `> text` / `:::quote :::` | block 限定 |
| コメント(隠し) | `%%text%%`(#13)| `%%%\n…\n%%%` / `:::comment :::`(#57)| はい、隠し動作は同じ |
| 数式 | `$x^2$`(#12) | `$$\frac{a}{b}$$` 行単独(#69) | はい、$ 数で分岐 |
| footnote | 参照 `[^id]`(#14)/ 直アタッチ `^[T]`(#15) | 定義 `[^id]: T`(行頭、#68) | はい、参照と定義 |
| variable | `{{vars.x}}`(#16)| 同左(inline 経路のみ)| inline で発火 |

### 11.4 意図的非対称(設計判断)

| 機能 | inline | block | 理由 |
|------|--------|-------|------|
| 見出し | (なし) | `# h1` 〜 `###### h6`(#31) | inline で見出しは意味上不要 |
| 段落 | (default) | (default) | implicit、明示は formal `:::paragraph` のみ |
| 箇条書き | (なし) | `- item` / `1. item`(#37-#39)| inline で意味上不要 |
| 表 | (なし) | GFM table(#42) | inline で意味上不要 |
| 装飾箱(任意 class)| (なし) | `:::.cls`(future、§12)| block-only、複段落くくり用途 |

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

## 15. やってはいけないこと(deny list)

| ❌ NG | 何が起きる | 推奨 |
|-------|---------|------|
| `<div>` `<style>` 等 inline HTML 本文に | `html: false`、escape されて literal 表示 | `` ```html-render `` fence(#50) |
| `[[em:..]]` 新規生成 | 動くけど deprecated warning | `^^..^^`(#7) |
| `<\|text` を物理左寄せとして | logical end に解釈される | 物理左は formal `:::paragraph{align=left}`(#36) |
| `:role:[…]` で知らない role 名 | render されない、文字列化 | allowlist 内のみ(`:strong:` `:emphasis:` `:code:` `:strike:` `:caption:` `:autoref:` `:sup:` `:sub:` `:span:`) |
| `:span:[…]{style="…"}` | XSS allowlist 外、silent skip | `:span:[…]{class=warn}` で CSS class |
| frontmatter 16KB 超 | size cap で parse 中止 + warning | コンパクトに |
| 行頭 `>>>` `===` 等独自記号 | commonmark 標準衝突 | 本書記載構文のみ |
| `:::toc{depth=N}` `:::frontmatter` `:::body` | 未実装 + PKC1010 warning | Phase 3 着地待ち(PR-2V/2W) |
| **§12 future syntax 着地前に emit** | **render されない** | **本書 promote + 実装 PR landing 待ち** |

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
