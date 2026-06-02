# PKC2 Markdown 方言:AI 書き手向け規約書 v4

**Audience**: AI(LLM)が PKC2 entry の `body` を生成する際の規約書。LLM が機械的に処理しやすい形に再編、AI-emit canonical 形を明示。
**Reader**: 機械処理 LLM。可読性は保つが、構造化と非曖昧化を優先。
**Companion(human-oriented)**: `pkc-markdown-complete-spec-v4.md`(人間向け完全 spec)+ `docs/manual/12_マークダウン拡張記法.md` §12.11(末端 user 用)
**Status**: 🟢 **candidate**(2026-05-25 user Q1-Q8 OK 取得済、stack PR 13 着地で canonical promote 予定)
**Version**: v4(supersedes v3、2026-05-25 起草、block format wrapper #60 + Q7 separator + Q8 value-only 寛容化反映)
**Supersedes**: `markdown-dialect-for-ai-authors-v3.md`(2026-05-12 〜 2026-05-25 canonical、v4 promote で archive 候補)

---

## 0. 使い方(AI が読むときの行動規約)

1. **このファイル単体で完結する**。他 spec を参照しなくても本書通りに書けば PKC2 が正しく render する。
2. **commonmark + GFM**(table / strikethrough / task list) + **linkify + typographer** が base。本書はその上の PKC 独自拡張(simple 形 + formal 形 + 寛容 parse alias)を定義。
3. **記法には 3 階層 + 1 寛容**:
   - **simple 形**(人間 typing、`§1.1`)── default、AI も基本これを使う
   - **formal 形**(機械 emit、`§1.2`)── `:::name{attrs}` block / `:role:[content]{attrs}` inline、round-trip 安全
   - **寛容 alias**(PR-2L、Postel's Law、`§1.3`)── AI hallucinate を実 render path で accept + console hint
   - **block 装飾箱 3 形**(v4 §12 新規、`§1.4`)── Tier 0 vocabulary / Tier 1 class chain / Tier 2 formal
4. **inline HTML は禁止**(`html: false`、XSS 防止)。複雑 layout / SVG は `` ```html-render `` fence(iframe sandbox)。
5. **未記載構文は使わない**。`§5` deny list 参照。
6. **frontmatter は省略可**。AI が profile 切替 / 変数定義 / layout 指定する時だけ書く(`§2`)。
7. **v4 で AI が知るべき変更点**:
   - `:::format{...}` block 装飾箱(catalog #60、`§3` 詳細)── 複段落を任意 class / id / inline style でくくる formal canonical
   - Q7 separator policy 統一 ── inline `:T:bold,red:` + block `:::bold,red` の **両方が comma / 空白 / 混在 全部 accept**
   - Q8 value-only 寛容パース ── `:::section{intro}` / `:::if{html}` / `:::toc{2}` / `:::quote{"X"}` で `key=` 省略可能(4 directive 限定)

---

## 1. 仕様マップ(全 markup 一覧)

### 1.1 simple 形(人間 / AI 共通の日常 markup、v3 から継続 + v4 追加)

| ID | 機能 | simple 構文 | 用途 |
|----|-----|--------|------|
| commonmark | 見出し / 強調 / link / list / table / fence | 標準 markdown | 通常 |
| L-1 | Section break | `+++` または `+++ {role=ROLE}` | 改ページ / 章区切り |
| L-2-a | Highlight | `==text==` | 黄色マーカー |
| L-2-a' | Highlight 色付き | `==[red]text==` | 色指定 |
| L-2-b | Ruby(ふりがな) | `[[ruby:漢字\|かんじ]]` または将来 `[base\|読み]` | 振り仮名 |
| L-2-c | Em-dot(圏点) | `^^重要^^` | 各文字上に点 |
| L-3 | Blockquote 通常 | `> text` | 引用(commonmark 準拠) |
| L-4-a | Comment(inline) | `%% hidden %%` | 完全削除されるメモ |
| L-4-b | Comment(block) | `%%%\n...\n%%%` | 複数行コメント |
| **R-C** | Align prefix | 行頭 `\|\|`(center)/ `\|>` `<\|` `\|<` `>\|`(end、typo 寛容) | 段落の中央 / end 寄せ |
| L-6 | Simple inline | `:text:attrs:` | inline 装飾(色 / 太字 / size 等)|
| L-7-a | Figure block | `:::figure{#id}\n...\n^^^ caption\n:::` | 図 + 自動採番 |
| L-7-b | Figure ref | `[@id]` | 図 / 表 / 式の本文中参照 |
| L-8 | Blank-line marker | 行頭 `_` または `_<N>` | 縦余白の明示 |
| L-9 | Paragraph indent | 行頭 `__` / `＿` | 段落先頭 1 字下げ |
| M-7 | Variables | `{{vars.x}}` | 文書内変数展開 |
| **V4-T0** | **Block vocab(NEW)** | `:::red,bg-yellow,1.2em\nbody\n:::` | block 装飾箱、inline `:T:vocab:` の対称物 |
| **V4-T1** | **Block class(NEW)** | `:::.cls.cls\nbody\n:::`(6 variation 寛容パース) | block 装飾箱、user CSS class 適用 |

### 1.2 formal 形(reform-2026-05 + v4 拡張)

| ID | 機能 | formal 構文 | 用途 |
|----|-----|---------|------|
| **R-D** | Quote citation block | `:::quote{author="…" year=…} content :::` | 著者付き引用 |
| **R-E-1** | Superscript inline | `:sup:[2]` | 上付き |
| **R-E-2** | Subscript inline | `:sub:[n]` | 下付き |
| **R-E-3** | Span inline + attrs | `:span:[text]{class=… #id key=v}` | 一般 inline span |
| **R-F** | Conditional block | `:::if{format=html\|markdown\|docx} content :::` | format 別本文 |
| **R-2A** | Document globals | frontmatter `writing` / `direction` / `align` / `layout`(9 種)| 縦書き / RTL / 段組組版 |
| **R-2B-1〜4** | Strong / Emphasis / Code / Strike formal | `:strong:[text]` / `:emphasis:[text]` / `:code:[text]` / `:strike:[text]` | AI emit 用 |
| **R-2C** | Caption formal | `:::figure` 内 `:caption:[text]{attrs}` | `^^^ caption` 等価 |
| **R-2D** | Auto-ref self-closing | `:autoref:{id="fig1"}` | `[@fig1]` 等価 |
| **R-2E** | Paragraph align(物理)| `:::paragraph{align=left\|right\|center\|top\|bottom}` | 物理 align、formal-only |
| **R-2F** | Section semantic / callout | `:::section{role=summary\|warning\|note\|tip\|caution\|important\|info\|danger}` | 8 role callout |
| **R-2G** | Comment formal | `:::comment\n…\n:::` | `%%%` block comment 等価 |
| **R-2H** | Break formal | `:::break{kind=page\|rule role=…}` | `+++` / `---` 等価 |
| **R-2M** | HTML sandbox fence | `` ```html-render``` | 複雑 layout / SVG iframe |
| **R-2V** | TOC block | `:::toc{depth=N}` | 目次自動生成(2026-05-12 着地) |
| **V4-T2** | **Block format wrapper(NEW)** | `:::format{.cls .cls #id indent=N align=X key=v}\nbody\n:::` | **AI emit canonical**、block 装飾箱の formal 形 |

**設計原則**:reform 後は **simple 形を first**(人間が見たまま入力)、**formal 形は AI / 機械が emit する serializer**(round-trip 安全)。v4 で block 装飾箱(V4-T2)が AI emit 用 canonical として追加。

### 1.3 寛容 alias(Postel's Law、PR-2L PKC2005-2011)

AI が hallucinate しがちな形を実 render path に格上げ、`console.info` で 3 つ組 hint。

| AI が書く形 | scope | 寛容 parse 後 | code | canonical |
|----------------|--------|--------------|-------|------|
| `:lead:[content]` | I | `<span class="pkc-lead">` | PKC2005 | 段落 + `==content==` |
| `:spacing:{size=N}` | I | blank line | PKC2006 | `_<N>` |
| `:align:{position=X}` | I | 次段落 align 適用 | PKC2007 | 行頭 `\|\|` `\|>` `<\|` |
| `:quote:{attribution=…}` | I | `<small class="pkc-attribution">` | PKC2008 | `:::quote{author="…"}` |
| `:::note` 等 8 種 | B | `:::section{role=NAME}` alias | PKC2009 | `:::section{role=…}` |
| `:::callout{type=X}` | B | `:::section{role=X}` | PKC2010 | 同上 |
| `:::admonition{type=X title=Y}` | B | `:::section{role=X}` + `## Y` | PKC2011 | 同上 |

### 1.4 v4 block 装飾箱(`:::format{...}`、catalog #60)

**3 形式の選択基準**(全形式が同 AST `AstFormatBlock` に正規化、HTML 出力 `<div class="pkc-format-block ...">`):

#### Tier 0 vocabulary(`:::red,bg-yellow,1.2em`、Q3 priority)

```markdown
:::red,bg-yellow,1.2em
複段落を赤文字 / 黄色背景 / 1.2em で。

第 2 段落も同装飾。
:::
```

→ `<div class="pkc-format-block" data-pkc-format-block style="background-color: yellow; color: red; font-size: 1.2em">…</div>`

inline `:text:red,bg-yellow,1.2em:`(catalog #9)と **完全対称な vocabulary**、CSS class 事前定義不要。

#### Tier 1 class chain(`:::.cls.cls`、寛容 6 variation)

```markdown
:::.highlight.important              # packed(最短)
::: .highlight .important            # space 区切り
::: {.highlight .important}          # Pandoc fenced div 互換
::: highlight                        # 単 class(`.` 省略可)
:::.highlight#myid                   # class + id packed
::: .highlight #myid                 # class + id space-separated
```

全て同 AST、出力 `<div class="pkc-format-block highlight important" ...>`。事前 CSS rule 定義が必要(user-side CSS で装飾を当てる)。

#### Tier 2 formal(`:::format{.cls #id key=v}`、AI emit canonical)

```markdown
:::format{.highlight .important #note-1 indent=2 align=center custom=value}
内容
:::
```

**AI emit はこの形を使うのが推奨**(Q1 で `format` directive 名確定、Q6 simple → formal canonicalize で全形式が本形に寄せられる、round-trip 安全)。

#### v4 separator policy 統一(Q7)

inline + block 両方を **comma / 空白 / 混在 全部 accept**:

```markdown
:text:bold,red:           # comma packed
:text:bold, red:          # comma + space
:text:bold red:           # space-only(v4 寛容化)
:::bold,red\nbody\n:::    # block も同 policy
:::bold red\nbody\n:::    # space-only OK
```

#### `==highlight==` の block 対応(Q4 vocabulary 経路で吸収)

| inline | block |
|--------|-------|
| `==text==`(黄固定) | `:::bg-yellow\nbody\n:::` |
| `==[red]text==` | `:::bg-red\nbody\n:::` |

block 専用 `==` syntax は採用しない(setext h1 衝突回避、`:::` 統一原則)、vocabulary 経路で吸収。

### 1.5 v4 Q8 value-only 寛容パース(4 directive 限定)

block directive `{value-only}` 形で `key=` 省略 + value 直書きを accept:

```markdown
:::section{intro}        # → role=intro(任意 role 文字列)
:::section{appendix}     # → role=appendix
:::if{html}              # → format=html
:::if{markdown}          # → format=markdown
:::toc{2}                # → depth=2
:::quote{"夏目漱石"}     # → author="夏目漱石"(double-quoted)
```

**4 directive 限定**:section / if / toc / quote のみ。break / list / heading / code / blank / paragraph は既存 simple 形(`+++` / `- T` / `## T` / ` ```ts ``` ` / `_3` / `__T`)で覆われ済のため対象外。

---

## 2. frontmatter(optional)

```yaml
---
notation: pkc-markdown-1.0
title: ドキュメントタイトル
author: 山田太郎
kind: report                  # v4 NEW、meta 情報
writing: vertical             # horizontal | vertical
direction: rtl                # ltr | rtl
align: top                    # writing 依存
layout: a4-2col               # 9 種(a4/b5/letter/legal × 1/2/3col)
heading-number: true          # v4 NEW、見出し自動採番
list-number: uniform          # v4 NEW、順序リスト採番モード
vars:
  product: PKC2
  version: "2.3"
notation_overrides:
  ruby: false
---
```

詳細は人間向け完全 spec `pkc-markdown-complete-spec-v4.md` §9 を参照。

---

## 3. v4 block 装飾箱の AI emit 推奨パターン

### 3.1 「迷ったらこれ」(canonical Q6 formal 寄せ)

| user 要求 | AI が書くべき markdown |
|----------|---------------------|
| 強調 box(任意 class) | `:::format{.highlight}\nbody\n:::` |
| 重要 callout(8 role) | `:::section{role=warning}\n注意\n:::`(Q8 で `:::section{warning}` も accept) |
| 色 + 背景 + サイズ box | `:::format{color="red" background-color="yellow" font-size="1.2em"}\nbody\n:::`(Tier 0 vocab を formal で書く時)|
| 複段落 + class + id | `:::format{.box #note-1}\nbody1\n\nbody2\n:::` |
| 入れ子 box | `:::format{.outer}\n:::format{.inner}\nnested\n:::\n:::`(現状未対応、stack PR の次 wave) |

### 3.2 fixture 生成 prompt template

LLM(ChatGPT / Claude / Gemini)に渡す prompt:

```
PKC2 markdown 方言(`docs/spec/markdown-dialect-for-ai-authors-v4.md` §3 推奨パターン参照)で、
[X] な fixture を [N 文字 / N 行]書いてください。

必須要素:
- frontmatter で vars + layout + heading-number + list-number 指定
- `:::section{role=…}` または `:::section{intro}`(Q8)で章構造
- `:::figure{#…}` + `:caption:[…]` で図表
- `:::format{.cls #id}` で複段落 box くくり(v4 NEW)
- inline 装飾(`**bold**` / `==hl==` / `:T:vocab:`)を混在
- 必要なら `` ```html-render `` で複雑 layout

避けるもの(deny list):
- inline HTML(`<div>` 等)
- `:::frontmatter` / `:::body`(未実装 deny list)
- 非対応 formal 形(`:lead:` 等は寛容 parse されるが推奨は普通段落)
```

### 3.3 v4 寛容 alias を AI が自己 correct する loop

DOM 経路 / console.info で hint 取得、canonical 形を学習:

```ts
// DOM 経路:render 後の document を走査
document.querySelectorAll('[data-pkc-canonical]').forEach((el) => {
  const code = el.getAttribute('data-pkc-warn-code');
  const detected = el.getAttribute('data-pkc-warn-name');
  const canonical = el.getAttribute('data-pkc-canonical');
  console.log({ code, detected, canonical });
});

// console.info 経路:Playwright / Puppeteer 経由
page.on('console', (msg) => {
  if (msg.type() === 'info' && /\[PKC2(00[5-9]|01[01])\]/.test(msg.text())) {
    // tolerant alias accepted、AI repair instruction
  }
});
```

---

## 4. AST 公開 API(`window.PKC.ast`)

PR-2GG で着地、6 関数:

```ts
window.PKC.ast.parseMarkdown(text: string): AstDocument
window.PKC.ast.renderHtml(ast: AstDocument): string
window.PKC.ast.canonicalize(ast: AstDocument, opts?): AstDocument
window.PKC.ast.toPandocJson(ast: AstDocument): PandocJson
window.PKC.ast.parseHtml(html: string): AstDocument
window.PKC.ast.renderMarkdown(ast: AstDocument): string
```

v4 で `AstFormatBlock` AST node 追加、全 round-trip 経路が format-block を扱える(stack PR 3-11 完了)。

---

## 5. やってはいけないこと(deny list)

| ❌ NG | 理由 | 推奨 |
|-------|------|------|
| `<div>` `<style>` 等 inline HTML(本文) | `html: false`、escape | 複雑 layout は `` ```html-render `` fence |
| `[[em:..]]` 新規生成 | deprecated | `^^..^^` |
| `<\|text` を物理左寄せとして | reform で end 正規化 | 物理左は formal `:::paragraph{align=left}` |
| `:role:[…]` で未知 role | render されない | allowlist 内のみ(§1.2) |
| `:span:[…]{style="…"}` | XSS allowlist 外、silent skip | `:span:[…]{class=warn}` |
| frontmatter 巨大 nested(>16KB)| size cap 超過 | コンパクトに |
| `:::toc` `:::frontmatter` `:::body` | 一部未実装 | `:::toc` は ✅ 着地済、`:::frontmatter` / `:::body` は Phase 3 待ち |
| **block 装飾箱を着地前に emit**(v4 §12) | render されない | v4 promote 後の本書記載構文のみ |
| `==block==`(setext h1 衝突) | block `==` 形は未対応 | block 黄背景は `:::bg-yellow\nbody\n:::`(Q4 vocab 吸収) |

---

## 6. 関連 doc

| 用途 | doc |
|------|-----|
| **本書 v3**(2026-05-12 〜 v4 promote、現 canonical、本 v4 candidate)| [`markdown-dialect-for-ai-authors-v3.md`](./markdown-dialect-for-ai-authors-v3.md) |
| **人間向け完全 spec v4** | [`pkc-markdown-complete-spec-v4.md`](./pkc-markdown-complete-spec-v4.md) |
| Manual(human-oriented、第 12 章)| [`../manual/12_マークダウン拡張記法.md`](../manual/12_マークダウン拡張記法.md) |
| 設計議論 12 章 doc set | [`../development/notation-redesign-2026-05/`](../development/notation-redesign-2026-05/) |
| **block format wrapper 実装 spec** | [`./pkc-block-format-attr-syntax-v1-minimum-scope.md`](./pkc-block-format-attr-syntax-v1-minimum-scope.md) |
| AST 公開 API | [`./public-ast-api-for-ai.md`](./public-ast-api-for-ai.md) |
| 可換 IR spec | [`./ast-commutative-ir.md`](./ast-commutative-ir.md) |
| canonicalize 写像 | [`../development/notation-redesign-2026-05/11-canonicalization-spec.md`](../development/notation-redesign-2026-05/11-canonicalization-spec.md) |
| 寛容 parse doctrine | [`../development/parser-recovery-spec.md`](../development/parser-recovery-spec.md) |
| リリース履歴 | [`../release/CHANGELOG_v2.3.0.md`](../release/CHANGELOG_v2.3.0.md) |

---

## 7. v3 からの主な変更点(2026-05-25 差分)

1. **`:::format{...}` block 装飾箱(catalog #60、Tier 0/1/2 三形)** を §1.1 + §1.4 に追加(AI emit canonical は Tier 2 formal)
2. **Q7 separator policy 統一** ── inline + block 両方を comma / 空白 / 混在 全 accept
3. **Q8 value-only 寛容パース**(4 directive)── `:::section{intro}` / `:::if{html}` / `:::toc{2}` / `:::quote{"X"}`
4. **`:::section` 任意 role の CSS class 自動命名** ── 8 known role 外でも `pkc-section-<role>` が自動付与
5. frontmatter `heading-number` / `list-number` / `kind` 3 key 追加
6. §3.1 AI emit 推奨パターンを v4 形に更新
7. §3.2 prompt template に v4 NEW 項目追記
8. §5 deny list に「block 装飾箱を着地前に emit するな」「`==block==` は採用しない」 追加
