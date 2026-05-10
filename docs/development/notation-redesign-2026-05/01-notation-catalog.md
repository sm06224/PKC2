# 01. 記法カタログ(全 50+ 記法 一覧)

## 1.1 読み方

各表は以下のスキーマ:

| 列 | 意味 |
|----|------|
| **#** | カタログ通し番号(本 doc set 全体で一意) |
| **機能名** | 記法が表現する semantic |
| **simple** | 人間が日常 typing する短い形(階層 1-2)。`—` = simple 形なし(formal のみ)|
| **formal** | AI / 機械が emit する厳密形。`:::name{attrs}` block / `:role:[content]{attrs}` inline |
| **IR ノード** | 内部 AST での type kind(§08 で詳細) |
| **頻度** | very freq / freq / occasional / rare(本記法整理が想定する PKC2 user の使用頻度) |
| **status** | ✅ 既実装 / 📝 本 doc で proposal / 🔄 仕様変更 / ❌ 廃止候補 |

## 1.2 構造記法(block-level)

### 1.2.1 見出し / 段落

| # | 機能名 | simple | formal | IR ノード | 頻度 | status |
|---|--------|--------|--------|---------|------|--------|
| 1 | heading h1〜h6 | `# T` `## T` `### T` `#### T` `##### T` `###### T` | `:::heading{level=1} T :::` | `Heading{level, attrs, children}` | very freq | ✅ |
| 2 | heading + attrs | `# T {#id .cls key=v}`(Pandoc 互換 trailing) | `:::heading{level=1 id="id" classes=["cls"] key="v"} T :::` | 同上 | freq | ✅ |
| 3 | paragraph | (default、無印) | `:::paragraph 本文 :::` | `Paragraph{attrs, children}` | very freq | ✅ |
| 4 | paragraph + indent(字下げ)| `__本文`(行頭、または全角 `＿`) | `:::paragraph{indent=1} 本文 :::` | `Paragraph{indent, attrs, children}` | freq | ✅ |
| 5 | paragraph + align logical | `\|\|本文`(center)/ `\|>本文`(end、+typo 3 形)| `:::paragraph{align=start\|end\|center} 本文 :::` | `Paragraph{align, …}` | occasional | 🔄 simple は logical 2 種に縮小 |
| 6 | paragraph + align physical | — | `:::paragraph{align=left\|right\|top\|bottom} 本文 :::` | 同上 | rare | 📝 formal-only(physical 強制) |

### 1.2.2 list / quote / table

| # | 機能名 | simple | formal | IR ノード | 頻度 | status |
|---|--------|--------|--------|---------|------|--------|
| 7 | bullet list | `- item`(または `*` `+`)| `:::list{kind=bullet} - item :::` | `List{kind=bullet, items}` | very freq | ✅ |
| 8 | numbered list | `1. item` | `:::list{kind=ordered start=1} 1. item :::` | `List{kind=ordered, items}` | very freq | ✅ |
| 9 | task list(GFM) | `- [ ] todo` / `- [x] done` | `:::list{kind=task} - [ ] todo :::` | `List{kind=task, items[].state}` | freq | ✅ |
| 10 | blockquote | `> 引用` | `:::quote 引用 :::` | `Quote{attrs, children}` | freq | ✅ |
| 11 | quote citation 群 | — | `:::quote{author="Smith" year=2020} ![](entry:A) ![](entry:B) :::`(scope 拡張)| `Directive{name="quote", attrs, children}` | rare | 📝 NEW |
| 12 | table(GFM) | `\| h1 \| h2 \|\n\|---\|---\|\n\| c \| c \|` | `:::table{align=["L","R"]} … :::` | `Table{align[], rows}` | freq | ✅ |
| 13 | hr(horizontal rule) | `---`(行単独) | `:::break{kind=rule}` | `Break{kind=rule}` | occasional | ✅ |
| 14 | section break / page break | `+++`(行単独) | `:::break{kind=page}` | `Break{kind=page, attrs}` | occasional | ✅ wave-10-2 L-1 |
| 15 | section break role 付き | `+++ {role=cover}` | `:::break{kind=page role=cover}` | `Break{kind=page, role}` | occasional | ✅ wave-10-2 L-1 |

### 1.2.3 code block

| # | 機能名 | simple | formal | IR ノード | 頻度 | status |
|---|--------|--------|--------|---------|------|--------|
| 16 | code block(plain) | `` ```\ncode\n``` `` | `:::code code :::` | `CodeBlock{lang=null, code}` | freq | ✅ |
| 17 | code block(syntax highlight)| `` ```ts\ncode\n``` `` | `:::code{lang="ts"} code :::` | `CodeBlock{lang, code}` | freq | ✅ |
| 18 | code block(rendered)| `` ```tree ``` `` `` ```dbschema ``` `` `` ```binary ``` `` `` ```json{view} ``` `` `` ```query ``` `` etc.(§06 詳細)| `:::code-render{lang="tree"} … :::` | `CodeRender{lang, attrs, source}` | freq(用途次第) | 📝 NEW(§06 ecosystem) |

### 1.2.4 figure / equation / table 自動採番

| # | 機能名 | simple | formal | IR ノード | 頻度 | status |
|---|--------|--------|--------|---------|------|--------|
| 19 | figure block(画像 + caption) | `:::figure{id="fig1"}\n![](src)\n*caption*\n:::` | 同左 | `Directive{name="figure", attrs, children}` | occasional | ✅ wave-10-2 L-7 |
| 20 | table block(caption 付)| `:::table{id="tab1"}\n…\n:::` | 同左 | `Directive{name="table", attrs, children}` | occasional | ✅ wave-10-2 L-7 |
| 21 | equation block(KaTeX 統合)| `$$\frac{a}{b}$$`(行単独 = block)| `:::equation $$\frac{a}{b}$$ :::` | `Math{display=true, src}` | occasional | 📝 NEW(§05 math) |
| 22 | auto-numbered ref | `[@fig1]` `[@tab1]` `[@eq1]` | `:autoref:{id="fig1"}` | `AutoRef{id}` | occasional | ✅ wave-10-2 L-7 |

### 1.2.5 conditional / 装飾系 directive

| # | 機能名 | simple | formal | IR ノード | 頻度 | status |
|---|--------|--------|--------|---------|------|--------|
| 23 | conditional block | — | `:::if{format=html} content :::` | `Directive{name="if", attrs, children}` | rare | ✅ spec のみ、未実装 |
| 24 | comment block(隠し) | `%%%\nblock comment\n%%%` | `:::comment{block=true} content :::` | `Comment{kind=block, hidden=true}` | occasional | ✅ wave-10-2 L-4 |
| 25 | blank line marker(空行)| `_`(行単独 = 1 空行)/ `_3`(3 空行)| `:::blank{count=1}` / `:::blank{count=3}` | `Blank{count}` | occasional | ✅ wave-10-2 L-8 |

## 1.3 inline 修飾

### 1.3.1 基本テキスト装飾

| # | 機能名 | simple | formal | IR ノード | 頻度 | status |
|---|--------|--------|--------|---------|------|--------|
| 26 | bold | `**text**` | `:strong:[text]` | `Strong{children}` | very freq | ✅ |
| 27 | italic | `*text*` | `:emphasis:[text]` | `Emphasis{children}` | very freq | ✅ |
| 28 | strikethrough(GFM)| `~~text~~` | `:strike:[text]` | `Strike{children}` | freq | ✅ |
| 29 | inline code | `` `code` `` | `:code:[code]` | `InlineCode{value}` | very freq | ✅ |
| 30 | highlight(マーカー) | `==text==` | `:mark:[text]` | `Mark{children, attrs}` | freq | ✅ wave-10-2 L-2 |
| 31 | highlight + 色 | `==[red]text==` | `:mark:[text]{color=red}` | `Mark{children, attrs}` | occasional | ✅ wave-10-2 L-2 |
| 32 | em-dot 傍点 / 圏点 | `^^text^^` | `:emdot:[text]{style=dot\|circle}` | `EmDot{children, style}` | occasional | 📝 NEW、`[[em:..]]` を置換、傍点 / 圏点を統合 |

### 1.3.2 ruby / 簡易属性 / 上付き下付き

| # | 機能名 | simple | formal | IR ノード | 頻度 | status |
|---|--------|--------|--------|---------|------|--------|
| 33 | ruby(漢字 + ふりがな) | `[base\|読み]` | `:ruby:[base]{rt="読み"}` | `Ruby{base, rt}` | occasional | 🔄 NEW、`[[ruby:..]]` から短縮 |
| 34 | inline 簡易属性 | `:text:bold,red:` `:text:lg:` `:text:120%:` | `:span:[text]{bold=true color=red size=lg}` | `Span{children, attrs}` | occasional | ✅ wave-10-2 L-6 |
| 35 | inline 簡易属性 + em-dot default | `:text::`(attrs 省略 = em-dot)| `:emdot:[text]` | `EmDot{children}` | rare | 📝 NEW、L-6 default として |
| 36 | superscript(上付き)| —(simple なし、math mode で代替) | `:sup:[text]` | `Sup{children}` | rare | 📝 NEW formal-only、math `$x^2$` で大半カバー |
| 37 | subscript(下付き)| —(同上)| `:sub:[text]` | `Sub{children}` | rare | 📝 NEW formal-only |

### 1.3.3 link / card / embed(詳細は §03)

| # | 機能名 | simple | formal | IR ノード | 頻度 | status |
|---|--------|--------|--------|---------|------|--------|
| 38 | external link | `[label](url)` | `:link:[label]{href="url"}` | `Link{label, href, kind="external"}` | very freq | ✅ |
| 39 | entry link | `[label](entry:LID)` | `:link:[label]{ref="entry:LID"}` | `Link{kind="entry", ref}` | freq | ✅ |
| 40 | entry card | `@[label](entry:LID)` | `:card:[label]{ref="entry:LID"}` | `Card{label, ref}` | freq | ✅ |
| 41 | entry embed seamless(NEW default) | `![label](entry:LID)` | `:embed:[label]{ref="entry:LID"}` | `Embed{label, ref, mode="seamless"}` | freq | 🔄 default 動作を seamless に変更 |
| 42 | entry embed quote | `![label](entry:LID){quote}` | `:embed:[label]{ref="entry:LID" mode="quote"}` | `Embed{mode="quote", attrs}` | occasional | 📝 NEW |
| 43 | image url | `![alt](https://...)` | `:image:{src="url" alt="alt"}` | `Image{src, alt, attrs}` | freq | ✅ |
| 44 | image asset | `![alt](asset:KEY)` | `:image:{src="asset:KEY" alt="alt"}` | `Image{src, alt}` | freq | ✅ |
| 45 | non-image asset link | `[label](asset:KEY)` | `:asset-link:[label]{key="KEY"}` | `Link{kind="asset", key}` | occasional | ✅ |
| 46 | permalink(他 container) | `[label](pkc://container/entry)` | `:link:[label]{href="pkc://..." kind="permalink"}` | `Link{kind="permalink", uri}` | rare | ✅ |
| 47 | block ref(同 doc 内 anchor) | `[#block-id]` | `:block-ref:{id="..."}` | `BlockRef{id}` | occasional | 📝 spec のみ、Phase 後段 |
| 48 | term ref(用語参照) | `[?term]` | `:term-ref:{name="term"}` | `TermRef{name}` | occasional | 📝 spec のみ、Phase 後段 |

### 1.3.4 variables / macros

| # | 機能名 | simple | formal | IR ノード | 頻度 | status |
|---|--------|--------|--------|---------|------|--------|
| 49 | variable expansion | `{{vars.x}}` | `:var:[vars.x]` | `Var{path}` | freq(vars 使う doc で) | ✅ wave-10-2 M-7 |
| 50 | macro expansion | — | `:macro:[name](args)` | `Macro{name, args}` | rare | 📝 spec のみ、Phase 後段 |

### 1.3.5 数式(math、§05 詳細)

| # | 機能名 | simple | formal | IR ノード | 頻度 | status |
|---|--------|--------|--------|---------|------|--------|
| 51 | inline math | `$x^2 + y^2 = z^2$`(KaTeX 構文)| `:math:{src="x^2+y^2=z^2"}` | `Math{display=false, src}` | occasional | 📝 NEW、KaTeX bundle |
| 52 | block math | `$$\frac{a}{b}$$`(行単独 / `$$` で囲み)| `:::math $$\frac{a}{b}$$ :::` | `Math{display=true, src}` | occasional | 📝 NEW |

### 1.3.6 comment / footnote(§04 詳細)

| # | 機能名 | simple | formal | IR ノード | 頻度 | status |
|---|--------|--------|--------|---------|------|--------|
| 53 | inline comment(隠し) | `%%text%%` | `:comment:[text]{hidden=true}` | `Comment{kind=inline, hidden=true}` | occasional | ✅ wave-10-2 L-4 |
| 54 | comment as footnote | `%%[fn] text %%` | `:comment:[text]{visibility=footnote}` | `Comment{visibility=footnote}` | occasional | 📝 NEW |
| 55 | comment + label | `%%[fn=src1] text %%` | `:comment:[text]{visibility=footnote id="src1"}` | `Comment{visibility=footnote, id}` | occasional | 📝 NEW |
| 56 | footnote reference | `[^src1]` | `:fn-ref:{id="src1"}` | `FnRef{id}` | occasional | 📝 NEW、Pandoc 互換 |
| 57 | inline footnote(直アタッチ) | `本文^[補足text]` | `:fn:[補足text]` | `Fn{children, anonymous=true}` | occasional | 📝 NEW、Pandoc 互換 |

## 1.4 廃止記法 / 整理対象

### 1.4.1 廃止 / 移行

| 記法 | 状態 | 移行先 |
|------|------|--------|
| `[[ruby:base\|読み]]` | ❌ 廃止 | `[base\|読み]` (#33) |
| `[[em:傍点]]` | ❌ 廃止 | `^^傍点^^` (#32) |
| `<\|text` align prefix(simple)| ❌ 廃止 | default flow は frontmatter で declare、明示的左寄せ強制は formal `:::paragraph{align=left}` |

### 1.4.2 typo 寛容化

| 既存 | 動作 |
|------|------|
| `\|>` `<\|` `\|<` `>\|` | 全 4 形が同じ "logical end" として正規化(典型 typo パターン受理)|
| `\|\|` | center、対称形なので typo 少なく追加なし |

### 1.4.3 互換性方針

- **既存 entry の body を持つ user 向けに自動 migration 案を §09 で提示**
- 廃止記法は spec 上 deprecated として残す(parser は引き続き受理 + warning 表示)、完全削除は十分な期間後

## 1.5 統計

| 軸 | 数 |
|----|----|
| 全記法(catalog 通し番号) | 57 |
| 既実装(✅) | 32 |
| 本 doc で提案(📝) | 21 |
| 仕様変更(🔄) | 4 |
| simple 形あり | 47 |
| simple 形なし(formal-only)| 10 |

## 1.6 設計理由のサマリ

| 設計判断 | 該当 # | 理由 |
|---------|------|------|
| simple 形は階層 1-2 に集中 | 1, 7-9, 14, 26-30 等 | 高頻度 = 入力負荷最小に |
| `^^em-dot^^` 採用 | 32 | caret = 上方マーク、傍点 / 圏点を視覚一致で統合 |
| ruby `[base\|読み]` 短縮 | 33 | link `[](url)` と `(` で grammar 区別、簡潔化 |
| superscript / subscript simple なし | 36, 37 | rare、math `$x^2$` で大半カバー、`^^em-dot^^` 確保 |
| embed default seamless | 41 | 文書結合用途が主、quotation chrome は明示時のみ |
| comment + footnote 統合 | 53-57 | 同 family(著者起源 / 主文補足)、可視性属性で differentiate |
| logical align(simple)| 5 | RTL / 縦書き対応、frontmatter で declare |
| `__` indent 維持 | 4 | 視覚優先、`**` bold convention で `__` は実質空き |
| `+++` page break 維持 | 14, 15 | 行単独 marker、L-1 既実装 |
| `:::name{attrs}` formal 統一 | 6, 11, 19-25 etc. | block-level 拡張は MyST directive と同型、IR mapping 一意 |

## 1.7 catalog 完成度

レビュアーへ:**この catalog で漏れている記法 / 機能があれば追加提案ください**。特に以下の領域は議論余地あり:

- **書籍・出版系**(脚注上の補注、傍注、章番号 prefix)
- **学術・引用系**(`[@cite]` Pandoc citation、bibliography、図 / 表 / 式番号の cross-reference)
- **編集系**(`::ins` `::del` track changes、suggestion mode、collaborative comment)
- **国際化系**(date / time format placeholders、locale-aware number 表記)
- **モバイル特化系**(slash command 入力支援、tap-friendly UX、IME 連携)
- **アクセシビリティ系**(`role=` ARIA、skip link、reading order hint)
