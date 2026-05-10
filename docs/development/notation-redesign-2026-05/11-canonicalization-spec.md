# 11. Canonicalization spec(simple → formal 1:1 写像)

**Phase 2 PR-2I で新規起草**(2026-05-10)、ChatGPT 提案 #1 受容に伴う。

## 11.1 motivation

reform-2026-05 で simple 形 + formal 形の 2 階層を導入したが、両者の **canonical formal representation**(正規化された formal 形)が完全には固定されていなかった。これが Phase 2 以降に発生しうる diff 不安定 / merge 競合 / AI repair 困難 / round-trip 崩壊 を未然に防ぐため、本章で simple → formal の 1:1 写像を厳密化する。

設計原則(`00-overview-and-principles.md` §0.2):
- **simple-first**(人間 typing 用)
- **formal は機械 emit / serializer 用**(AI / IR-driven)
- **両者は同じ IR ノードに正規化される**(可換性)
- **diff friendliness**(原則 5)

本章は「**正規化された canonical formal**」を定義し、`canonicalize(simple) → formal` 関数の挙動を厳密化する。

## 11.2 写像表(simple → canonical formal)

### 11.2.1 inline 修飾

| simple | canonical formal | IR Node | Phase | 備考 |
|--------|-----------------|---------|-------|------|
| `**text**` | `:strong:[text]` | `Strong{children}` | Phase 2 PR-2B ✅ | bold |
| `*text*` | `:emphasis:[text]` | `Emphasis{children}` | Phase 2 PR-2B ✅ | italic |
| `~~text~~` | `:strike:[text]` | `Strike{children}` | Phase 2 PR-2B ✅ | GFM strikethrough |
| `` `text` `` | `:code:[text]` | `InlineCode{value}` | Phase 2 PR-2B ✅ | inline code、content plain |
| `==text==` | `:mark:[text]` | `Mark{children, attrs}` | Phase 1 wave-10-2 ✅ | highlight |
| `==[red]text==` | `:mark:[text]{color=red}` | `Mark{color}` | Phase 1 wave-10-2 ✅ | 色付き highlight |
| `^^text^^` | `:emdot:[text]{style=dot}` | `EmDot{children, style}` | Phase 1 hotfix ✅ | 圏点(2026-05-09 反映) |
| `[[em:text]]` | `:emdot:[text]` | `EmDot` | deprecated | 旧形(parser は受理、warning) |
| `[base\|読み]` | `:ruby:[base]{rt="読み"}` | `Ruby{base, rt}` | future | Phase 3 で `[[ruby:...]]` から短縮 |
| `[[ruby:base\|読み]]` | `:ruby:[base]{rt="読み"}` | `Ruby` | deprecated | 旧形 |
| `:text:bold,red:` | `:span:[text]{class="…" style="…"}` | `Span{children, attrs}` | Phase 1 wave-10-2 ✅ | L-6 simple-inline は formal `<span>` へ |
| (formal-only) | `:sup:[text]` | `Sup{children}` | Phase 1 PR-E ✅ | math `$x^2$` で大半カバー |
| (formal-only) | `:sub:[text]` | `Sub{children}` | Phase 1 PR-E ✅ | math `$a_n$` で大半カバー |
| `[label](url)` | `:link:[label]{href="url"}` | `Link{label, href, kind}` | Phase 1 wave-10-2 ✅ | external URL |
| `[label](entry:LID)` | `:link:[label]{ref="entry:LID"}` | `Link{kind="entry"}` | Phase 1 wave-10-2 ✅ | entry link |
| `@[label](entry:LID)` | `:card:[label]{ref="entry:LID"}` | `Card{label, ref}` | Phase 1 wave-10-2 ✅ | entry card |
| `![label](entry:LID)` | `:embed:[label]{ref="entry:LID" mode="seamless"}` | `Embed{mode}` | Phase 1 wave-10-2 ✅ | entry embed seamless |
| `![label](entry:LID){quote}` | `:embed:[label]{ref="entry:LID" mode="quote"}` | `Embed{mode="quote"}` | Phase 3 候補 | quote embed |
| `[@id]` | `:autoref:{id="id"}` | `AutoRef{id}` | Phase 2 PR-2D ✅ | figure/table/equation ref |
| `{{vars.x}}` | `:var:[vars.x]` | `Var{path}` | Phase 1 wave-10-2 ✅ | variable expansion |
| `%%text%%` | `:comment:[text]{hidden=true}` | `Comment{kind=inline, hidden=true}` | Phase 1 wave-10-2 ✅ | inline 隠し comment |
| `$x^2$` | `:math:{src="x^2"}` | `Math{display=false, src}` | future | KaTeX bundle 未着手 |

### 11.2.2 block 構造

| simple | canonical formal | IR Node | Phase | 備考 |
|--------|-----------------|---------|-------|------|
| `# T` `## T` `### T` | `:::heading{level=1\|2\|3} T :::` | `Heading{level, attrs, children}` | future | 通常 heading の formal、現状 simple のみ |
| (default、無印) | `:::paragraph 本文 :::` | `Paragraph{attrs, children}` | future | default paragraph、現状 simple のみ |
| `\|\| 本文`(行頭) | `:::paragraph{align=center} 本文 :::` | `Paragraph{align}` | Phase 2 PR-2E ✅ | center logical |
| `\|> 本文`(typo 4 形) | `:::paragraph{align=end} 本文 :::` | `Paragraph{align="end"}` | Phase 1 PR-C ✅ | end logical(LTR で右、RTL で左) |
| (formal-only) | `:::paragraph{align=left\|right\|top\|bottom}` | `Paragraph{align="left"...}` | Phase 2 PR-2E ✅ | 物理 align |
| `> 引用` | `:::quote 引用 :::` | `Quote{attrs, children}` | future | commonmark blockquote の formal |
| (formal-only) | `:::quote{author="…" year=…} content :::` | `Directive{name="quote", attrs, children}` | Phase 1 PR-D ✅ | 著者付き quote citation |
| `\| h1 \| h2 \|` 表 | `:::table{align=…} … :::` | `Table{align[], rows}` | future | GFM table の formal |
| `---`(行単独) | `:::break{kind=rule}` | `Break{kind=rule}` | Phase 2 PR-2H ✅ | horizontal rule |
| `+++`(行単独) | `:::break{kind=page}` | `Break{kind=page}` | Phase 2 PR-2H ✅ | section break |
| `+++ {role=cover}` | `:::break{kind=page role=cover}` | `Break{kind=page, role}` | Phase 2 PR-2H ✅ | role 付き |
| `:::figure{#id}\n…\n^^^ caption\n:::` | 同 + `:caption:[caption]` | `Directive{name="figure", attrs, children}` | Phase 1 wave-10-2 ✅ | figure block(formal は caption marker 切替) |
| (formal-only) | `:::if{format=html\|markdown\|docx} content :::` | `Directive{name="if", attrs, children}` | Phase 1 PR-F ✅ | conditional block |
| (formal-only) | `:::section{role=…} content :::` | `Directive{name="section", attrs, children}` | Phase 2 PR-2F ✅ | semantic / callout |
| `%%%\n…\n%%%` | `:::comment{…} content :::` | `Comment{kind=block, hidden=true}` | Phase 2 PR-2G ✅ | block comment |
| `_` `_<N>` | `:::blank{count=N}` | `Blank{count}` | future | blank-line marker の formal |

### 11.2.3 frontmatter globals

| simple | canonical formal | IR Node | Phase |
|--------|-----------------|---------|-------|
| (frontmatter のみ) | `writing: horizontal\|vertical` | `Document{writing}` | Phase 2 PR-2A ✅ |
| (frontmatter のみ) | `direction: ltr\|rtl` | `Document{direction}` | Phase 2 PR-2A ✅ |
| (frontmatter のみ) | `align: left\|right\|center\|top\|bottom` | `Document{align}` | Phase 2 PR-2A ✅ |
| (frontmatter のみ) | `notation: pkc-markdown-1.0\|gfm\|…` | `Document{notation}` | Phase 1 PR-B ✅ |
| (frontmatter のみ) | `vars.<key>: value` | `Vars{values}` | Phase 1 wave-10-2 ✅ |

## 11.3 canonicalization rules

### 11.3.1 attrs 順序

formal `{...}` 内 attrs は **alphabetical key 順序** で正規化:

```
:::quote{year=2020 author="Smith"}    ← 入力(任意順序)
:::quote{author="Smith" year=2020}    ← canonical(alphabetical)
```

例外:
- `#id` `.class` は最初(`#id .class1 .class2 key=v` 順)
- `class` 内のクラス名は **stable order 維持**(`class="warn highlight"` ↔ `"highlight warn"` で diff)

### 11.3.2 quote 形

ASCII double-quote `"` を canonical(smart quote / single quote は normalize):

```
:::quote{author=“Smith”}      ← smart quote 入力
:::quote{author="Smith"}      ← canonical
```

### 11.3.3 whitespace

- block directive 開きの後の trailing whitespace は **削除**
- attrs 内の余分な whitespace は **alphabetical sort 後 1 space で区切り**
- inline role の `[content]` 内は **保存**(意味的 content)

### 11.3.4 line break

- `breaks: true`(`\n` → `<br>`)契約は維持
- block 境界の前後 blank line は normalize(常に 1 個)

## 11.4 round-trip 保証

```
canonicalize(canonicalize(x)) === canonicalize(x)
```

**idempotent** であることを test contract として保証:
- Phase 2 PR-2I で Canonicalize 関数を実装した時、test fixture の各 entry に対し idempotent を assert
- 不変条件は IR 上での同一性 + serialize → deserialize での lossless 復元

## 11.5 lossless round-trip の定義(ChatGPT 提案 #3 受容)

PKC2 は **semantic round-trip** を保証、syntax round-trip は保証外:

- ✅ `^^text^^` → `:emdot:[text]{style=dot}` で意味は保存(IR 上同一)
- ❌ `^^text^^` → `:emdot:[text]` → `^^text^^` の syntax 復元は保証外(canonical formal は `:emdot:` 形)

これにより:
- AI 編集時の意味伝達は安定
- syntax preservation コストを回避
- Pandoc 等の format 変換と整合(他 format も意味単位で変換)

## 11.6 implementation 状態

| step | status | PR |
|------|--------|------|
| 写像表(本文書)| ✅ Phase 2 PR-2I |  |
| Canonicalize 関数 | ⏳ future Phase | Canonicalize は IR persist と同期、reform Phase 3+ で実装 |
| idempotent test | ⏳ future Phase | 同上 |
| Pandoc filter export | ⏳ future Phase | reform Phase 9 |

## 11.7 関連章

- `00-overview-and-principles.md` §0.2 設計原則 5 (diff friendliness)
- `08-ir-mapping.md` IR AST type + format 別射影 matrix
- `01-notation-catalog.md` 全 50+ 記法一覧表
