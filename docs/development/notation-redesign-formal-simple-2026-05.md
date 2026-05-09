# PKC2 記法整理:formal / simple 二層化 + 先行事例比較(2026-05-09 design draft)

**Status**: draft(user review、syntax 確定前、実装着手前)
**Audience**: User(意思決定)+ Claude(実装)+ 他 AI(将来 onboard)
**Scope**: PKC2 全記法の整理。formal(厳密 / 機械生成向け)+ simple(簡潔 / 人間 / AI 向け)の 2 tier。
**Constraints**:
1. **HTML pass-through なし**(injection 攻撃面の作り込み回避)
2. **Parser buffer 攻撃防御**(全記法に length / depth / iteration cap)
3. **PKC 哲学:simplicity 維持**(必要なら破壊的変更を厭わない)
4. **IR 互換**(10-3 wave 計画形と両立、syntax → IR の lossless 変換が前提)

---

## 0. 序

### 0.1 動機

PKC2 は wave-10-2 で markdown 方言を 20+ 記法に拡張したが、user 議論 2026-05-09 で「全体記法を見直したい」と提起。背景:

1. **AI 第一級市民**:LLM(生成 / 編集)に PKC2 entry を書かせる時、**厳密で曖昧性のない記法**が必要(機械が安心して emit できる)
2. **人間第一級市民**:user が Memory / 思考 logging を行う時、**短く打ちやすい記法**が必要(simple)
3. **両立の必要性**:同じ意味を 2 通りの記法で書ける(canonical form は IR 上で 1 つ)
4. **IR 経由の format 変換**:Word / PPT / PDF / LaTeX / org / etc. に lossless で射影するには記法 → IR の写像が一意である必要(`intermediate-representation-audit.md`、計画中)
5. **security**:HTML pass-through を完全 off に。inline `<script>` / `onerror=` 等の周知の injection を構造的に阻止
6. **DoS 防御**:大量入力(深い nest / 長い fence / 多 token / 巨大配列)で parser が落ちないよう全記法に cap

PKC 哲学(simplicity)に従い、必要なら破壊的変更を厭わない。

### 0.2 用語

- **formal 記法**:厳密な構文、属性 / metadata を明示、AI が emit する時に第一選択
- **simple 記法**:短い記号、user が手打ちする時に第一選択(formal の syntactic sugar)
- **canonical form**:IR 上の正規形(formal / simple のどちらで書いても同じ IR ノードに正規化)
- **IR**:PKC2 内部中間表現(JSON / AST、10-3 で確定予定)

---

## 1. 先行事例調査

### 1.1 主要 markup system 8 種

PKC2 の比較相手:CommonMark / GFM / Pandoc Markdown / MyST(Sphinx)/ AsciiDoc / reStructuredText(RST)/ Org-mode / Obsidian。

| System | formal/simple 分離 | HTML pass-through | IR 適性 | security stance | 主な use case |
|--------|------------------|-----------------|--------|-----------------|------------|
| **CommonMark** | なし(単一 tier) | あり(default 許可) | 弱(仕様は HTML 出力中心) | 危険(`html: true`) | blog / readme |
| **GFM** | なし | あり | 中(table / task list 等が IR 化しやすい) | sanitize 推奨 | GitHub 文書 |
| **Pandoc MD** | **あり**(`{.class #id}` attrs) | optional(`--no-raw-html`) | 強(Pandoc 内 AST が canonical IR) | optional | 学術 / 出版 |
| **MyST** | **強い**(`:::directive{attrs}` + `:role:{}`) | なし(default off) | 強(docutils AST) | 安全(default no HTML) | Sphinx / 技術文書 |
| **AsciiDoc** | **強い**(block macro / inline macro) | なし(default off) | 強(asciidoctor AST) | 安全 | 技術文書 / 出版 |
| **RST** | **強い**(directive `.. name::`) | なし(default off) | 強(docutils AST) | 安全 | Python ecosystem |
| **Org-mode** | **強い**(properties + drawer) | なし(escape 必要) | 強(org tree が source) | 安全 | Emacs / 個人知識管理 |
| **Obsidian** | 部分(wikilink simple、code block 内 frontmatter formal) | あり(`<script>` も pass) | 弱(plugin 依存) | 危険(default raw HTML) | 個人知識管理(PKM) |

### 1.2 観察される設計 pattern

#### Pattern A:directive + role(MyST / RST)

```
:::directive_name{attr1=v1 attr2=v2}
content
:::
```

```
:role_name:`content`{attr=v}
```

- Block / inline で 2 形(block = `:::name`、inline = `:role:`)
- 属性は `{...}` で渡す
- ネスト可能、parse 規則統一
- IR は `{ kind: 'directive', name, attrs, children }` の形

#### Pattern B:inline macro / block macro(AsciiDoc)

```
[NOTE]
====
content
====

inline:macro_name[content,attr=v]
```

- Block macro:bracket delimiter + 名前 prefix
- Inline macro:`name:[content]` 構造

#### Pattern C:attribute syntax(Pandoc)

```
# Heading {.cls #id key=v}
[link](url){.cls target=_blank}
::: {.note}
content
:::
```

- 既存 markdown に **属性を後置** する記法
- div block(`:::`)で任意の class を付与
- IR 上は AST node に `attrs: { id, classes, kvs }` を持たせる

#### Pattern D:wikilink + transclusion(Obsidian / Roam)

```
[[entry-name]]            ← link
![[entry-name]]           ← embed
[[entry-name#section]]    ← deep link
[[entry-name|alias]]      ← link with alias
```

- 短い、人間に親しみやすい
- IR 化に難点(slug / alias / fragment が混在)
- HTML 直接埋め込みも許容(危険)

#### Pattern E:org-mode property drawer

```
* Heading
  :PROPERTIES:
  :KEY1: value1
  :KEY2: value2
  :END:

  Body content.
```

- block-scoped metadata が source 内部に存在
- IR に直接対応

---

## 2. 比較 matrix:formal / simple 対応の妥当性

### 2.1 設計軸 5 つ

PKC2 が満たすべき軸:

| 軸 | 重み | 理由 |
|----|------|------|
| **formal/simple 二層化の容易さ** | ★★★ | user 要請 |
| **IR 写像の一意性** | ★★★ | 10-3 wave の前提 |
| **HTML 直接埋込の阻止可能性** | ★★★ | security 第一 |
| **入力 cost(simple 側)** | ★★ | PKC 哲学(simplicity) |
| **学習 cost(formal 側)** | ★★ | AI が emit する分には負担小、人間が読む分には学習可能 |

### 2.2 先行事例の妥当性評価

| System | 二層化 | IR 写像 | HTML 阻止 | 入力 cost | 学習 cost | 採用候補? |
|--------|--------|---------|-----------|----------|----------|---------|
| CommonMark | ✗ | △ | ✗(default on) | ◎ | ◎ | base layer のみ |
| GFM | ✗ | ◯ | ✗(sanitize 必要) | ◎ | ◎ | base layer + table / task list |
| **Pandoc MD** | **◎** | **◎** | ◯(option) | ◯ | ◯ | **属性記法を採用** |
| **MyST** | **◎** | **◎** | **◎**(default off) | ◯ | △ | **directive / role を採用** |
| AsciiDoc | ◎ | ◎ | ◎ | △(冗長) | △ | 設計参考 |
| RST | ◎ | ◎ | ◎ | △ | × | 学習 cost 高、採用せず |
| Org-mode | ◎ | ◎ | ◎ | △ | △ | property drawer 設計参考 |
| Obsidian | △ | △ | ✗ | ◎ | ◎ | wikilink を simple tier 候補に |

**結論**:**Pandoc MD の属性記法 + MyST の directive / role + Obsidian の simple wikilink** を組み合わせた hybrid 系が PKC2 設計と最も整合。先行事例があり妥当性は十分(独自記法ではない、AI / 人間共に学習資料あり)。

---

## 3. PKC2 設計案:formal / simple 二層

### 3.1 設計原則

1. **IR が正規 source**:`source(formal | simple)` → `parse` → `IR` → `serialize` で formal / simple 双方向変換可能
2. **HTML 入力一切禁止**:`<` `>` は literal 文字としてのみ、tag として解釈しない
3. **全記法に hard cap**:長さ / depth / iteration を spec で固定値、超過は parse 中止 + 可視 warning
4. **simple は formal の sugar**:simple で書けるものは必ず formal でも書ける(逆は成立しない:formal 専用機能あり)
5. **PKC philosophy**:迷ったら simple 寄せ。formal は AI / 高度 user 向け

### 3.2 全 PKC2 記法の formal / simple 対応表

#### 3.2.1 構造記法(block-level)

| # | 機能 | simple(人間 / AI 短縮)| formal(機械 / AI 厳密)| IR ノード | 既存実装 |
|---|------|----------------------|----------------------|---------|---------|
| 1 | heading | `# Title` | `:::heading{level=1} Title :::` | `Heading{level, text, attrs}` | ✅ CommonMark |
| 2 | heading + attrs | `# Title {#id .cls}` | `:::heading{level=1 id="x" classes=["c"]} Title :::` | 同上 | ✅ Pandoc-style |
| 3 | paragraph | `本文。` | `:::paragraph 本文。:::` | `Paragraph{children}` | ✅ |
| 4 | blockquote | `> 引用` | `:::quote 引用 :::` | `Quote{children}` | ✅ |
| 5 | bullet list | `- item` | `:::list{kind=bullet}\n- item\n:::` | `List{kind, items}` | ✅ |
| 6 | numbered list | `1. item` | `:::list{kind=ordered}\n1. item\n:::` | 同上 | ✅ |
| 7 | task list | `- [ ] todo` / `- [x] done` | `:::list{kind=task}\n- [ ]\n:::` | `List{kind=task, items[].state}` | ✅ GFM |
| 8 | code fence | `` ```lang\ncode\n``` `` | `:::code{lang="ts"} code :::` | `CodeBlock{lang, code}` | ✅ |
| 9 | table | GFM `| h | h |` | `:::table{align=["L","R"]} … :::` | `Table{rows, align}` | ✅ |
| 10 | hr / page break | `+++` (page) / `---` (hr) | `:::break{kind=page}` / `:::break{kind=rule}` | `Break{kind}` | ✅ +++(L-1) |
| 11 | section break role | `+++ {role=cover}` | `:::break{kind=page role=cover}` | 同上 | ✅ |
| 12 | figure / table / equation | `:::figure{id=fig1}` | 同左(formal=simple) | `Directive{name="figure", attrs, children}` | ✅ L-7 |
| 13 | comment | `%%inline%%` / `%%%block%%%` | `:::comment inline:::` / `:::comment{block=true}` | `Comment{kind, text}` | ✅ L-4 |
| 14 | conditional | `:::if{format=html}` | 同左 | `Directive{name="if", attrs, children}` | spec のみ |
| 15 | blank line marker | `_` / `_3` | `:::blank{count=1}` / `:::blank{count=3}` | `Blank{count}` | ✅ L-8 |
| 16 | indent prefix | `__本文。` | `:::paragraph{indent=1} 本文。:::` | `Paragraph{indent}` | ✅ L-9 |
| 17 | align prefix | `|>右寄せ` / `<|左寄せ` / `||中央` | `:::paragraph{align=right} 右寄せ :::` | `Paragraph{align}` | ✅ L-5 |

#### 3.2.2 inline 修飾

| # | 機能 | simple | formal | IR ノード | 既存実装 |
|---|------|--------|--------|---------|---------|
| 18 | bold | `**text**` | `:strong:[text]` | `Strong{children}` | ✅ |
| 19 | italic | `*text*` | `:emphasis:[text]` | `Emphasis{children}` | ✅ |
| 20 | strikethrough | `~~text~~` | `:strike:[text]` | `Strike{children}` | ✅ GFM |
| 21 | inline code | `` `code` `` | `:code:[code]` | `InlineCode{text}` | ✅ |
| 22 | highlight | `==text==` | `:mark:[text]` / `:mark:[text]{color=red}` | `Mark{children, attrs}` | ✅ L-2 |
| 23 | ruby | `[[ruby:base|読み]]` | `:ruby:[base]{rt="読み"}` | `Ruby{base, rt}` | ✅ L-2 |
| 24 | em-dot 傍点 | `[[em:傍点]]` | `:emdot:[傍点]` | `EmDot{children}` | ✅ L-2 |
| 25 | simple inline attrs | `:text:bold,red:` | `:span:[text]{bold=true color=red}` | `Span{children, attrs}` | ✅ L-6 |
| 26 | size-嗜好 | `:text:lg:` / `:text:120%:` | `:span:[text]{size="lg"}` / `{size="120%"}` | 同上 | ✅ L-6 |
| 27 | variable | `{{vars.x}}` | `:var:[vars.x]` | `Var{path}` | ✅ M-7 |

#### 3.2.3 link / embed / card(本 wave 焦点)

| # | 機能 | simple | formal | IR ノード | 既存 / 新 |
|---|------|--------|--------|---------|----------|
| 28 | external link | `[label](https://...)` | `:link:[label]{href="..."}` | `Link{label, href, kind="external"}` | ✅ |
| 29 | entry link | `[label](entry:LID)` | `:link:[label]{ref="entry:LID"}` | `Link{label, ref, kind="entry"}` | ✅ |
| 30 | entry card(プレビュー) | `@[label](entry:LID)` | `:card:[label]{ref="entry:LID"}` | `Card{label, ref}` | ✅ |
| 31 | entry embed seamless(NEW default) | `![label](entry:LID)` | `:embed:[label]{ref="entry:LID"}` | `Embed{label, ref, mode="seamless"}` | 📝 新 |
| 32 | entry embed quote(NEW) | `![label](entry:LID){quote}` | `:embed:[label]{ref="entry:LID" mode="quote"}` | `Embed{mode="quote"}` | 📝 新 |
| 33 | quote group(複数引用) | `:::quote{author="Smith" year=2020}\n![](entry:A)\n![](entry:B)\n:::` | 同左 | `Directive{name="quote", attrs, children}` | 📝 新 |
| 34 | image asset | `![alt](asset:KEY)` | `:image:{src="asset:KEY" alt="alt"}` | `Image{src, alt}` | ✅ |
| 35 | image inline url | `![alt](https://...)` | `:image:{src="..." alt="alt"}` | 同上 | ✅ |
| 36 | non-image asset link | `[label](asset:KEY)` | `:asset-link:[label]{key="KEY"}` | `Link{kind="asset", key, label}` | ✅ |
| 37 | permalink | `[label](pkc://container/entry)` | `:link:[label]{href="pkc://..." kind="permalink"}` | `Link{kind="permalink", uri}` | ✅ |
| 38 | block ref | `[#block-id]` / `[#h1.intro]` | `:block-ref:{id="..."}` | `BlockRef{id}` | spec のみ |
| 39 | auto-numbered ref | `[@fig1]` | `:autoref:{id="fig1"}` | `AutoRef{id}` | ✅ L-7 |
| 40 | term def + ref | `[?term]` | `:term-ref:{name="term"}` | `TermRef{name}` | spec のみ |

#### 3.2.4 metadata(document-level)

| # | 機能 | simple | formal | IR ノード | 既存実装 |
|---|------|--------|--------|---------|---------|
| 41 | frontmatter | YAML(`---` fence) | TOML(`+++` fence)or YAML(同) | `Frontmatter{meta, format}` | ✅ YAML |
| 42 | backmatter | 末尾 `---` 後 YAML | 同左 | `Backmatter{meta}` | spec のみ |
| 43 | property drawer(org 風) | inline `:KEY: value` 列 | 同左 | `Properties{kvs}` | 未実装 |

### 3.3 簡潔判定:simple がない / formal がない 記法

- **simple のみ**:存在せず(全機能が formal で表現可能)
- **formal のみ**:`:::comment{block=true id="..."}` 等の **属性 + nest 必要なケース**(simple は単純 case 用、複雑 case は formal を強制)

### 3.4 取り除き候補(simplicity の名のもとに)

PKC2 の現状記法から **削除 / 整理** を検討するもの(破壊的変更を厭わない方針):

| # | 現状 | 問題 | 提案 |
|---|------|------|------|
| A | `[[ruby:base|読み]]` | `[[…]]` が wikilink 風で混乱(PKC2 は wikilink 採用しない) | `:ruby:[base]{rt="読み"}` を formal、simple は `[base|読み]` 等に再検討(or 廃止) |
| B | `[[em:傍点]]` | 同上 | `:emdot:[傍点]` 単一に |
| C | `||` `|>` `<|` 行頭 align | 行頭 `|>` が GFM table と紛らわしい(blockquote `>` とも) | `:::paragraph{align=right}` formal のみ + simple は `>>` 等再考 |
| D | `__段落字下げ` | underscore start が markdown bold start と紛らわしい | `:::paragraph{indent=1}` formal のみに集約 |
| E | inline `:text:attrs:` (L-6) | カスタム記法、学習 cost 高 | 維持(formal sugar として価値あり)、ただし spec 強化 |
| F | `+++` page break | `+++` は TOML 風で衝突可能 | TOML frontmatter は採用しない方針(YAML のみ)、`+++` は page break 専用維持 |
| G | `%%comment%%` / `%%%block%%%` | `%%` は他 markdown 拡張(Obsidian)とほぼ衝突なし | 維持 |

---

## 4. security stance:HTML pass-through 完全 off

### 4.1 設計判断:HTML 一切受け付けない

**現状**:markdown-it は `html: false` で初期化(✅ 既に safe)
**提案**:この方針を **spec 上で明文化**、以下を厳禁とする:

- 生 HTML tag(`<div>`, `<script>`, `<img onerror=...>`)
- HTML attribute(`onclick=`, `style="..."` 直書き)
- HTML entity 一部(`&lt;` 等の表記は許容、`&copy;` 等の named entity は markdown level の text として保持)

**effect**:
- `<` `>` は literal 文字、tag 化なし
- `<script>` を書いても markdown は `&lt;script&gt;` に escape
- markdown-it 設定 `html: false` を build asserter で固定(deviation 防止)

### 4.2 buffer 攻撃防御:全記法に cap

| 記法 | cap | 超過時挙動 |
|------|-----|----------|
| frontmatter | size 16 KB / keys 100 / depth 4 / array 500 / value 4 KB | 可視 warning + 該当部 skip(✅ 実装済) |
| heading | level 1〜6、行頭から最初の `#` のみ | 7 個以上 `#` は plain text |
| inline modifier nest | depth ≤ 8 | 8 超は plain text fallback |
| code fence | length ≤ 64 KB / 行数 ≤ 1000 | 超は truncate + 警告 |
| table | rows ≤ 1000 / cols ≤ 50 | 超は truncate + 警告 |
| list | items ≤ 1000 / depth ≤ 8 | 超は truncate + 警告 |
| transclusion(embed)| depth ≤ 1(self / cycle はそもそも block)| ✅ 実装済 |
| variables | per-render 展開回数 ≤ 1000 | 1000 超は literal 残置 + 警告(無限 recursion 防御)|
| total markdown body | size ≤ 10 MB | 超は parse 中止 |

各 cap は `defineFlag` 経由で runtime 調整可能、default は spec 固定値。

### 4.3 IR validator

IR レベルで以下を validate(serialize 前 / parse 後):

- node 数 ≤ 100,000
- 任意の string field 長 ≤ 16 KB(frontmatter 個別 cap と独立、IR 全体)
- nest depth ≤ 16
- circular reference 禁止(walk で検出)

---

## 5. IR 互換性

### 5.1 IR の AST 形(暫定、`intermediate-representation-audit.md` §1〜5 参照)

```typescript
type IRNode =
  | { kind: 'document', meta: Meta, children: IRNode[] }
  | { kind: 'heading', level: 1 | 2 | 3 | 4 | 5 | 6, attrs: Attrs, children: IRNode[] }
  | { kind: 'paragraph', attrs: Attrs, children: IRNode[] }
  | { kind: 'list', listKind: 'bullet' | 'ordered' | 'task', attrs: Attrs, items: IRNode[] }
  | { kind: 'list-item', state?: 'open' | 'done', children: IRNode[] }
  | { kind: 'quote', attrs: Attrs, children: IRNode[] }
  | { kind: 'code-block', lang: string, attrs: Attrs, code: string }
  | { kind: 'table', align: ('L'|'R'|'C'|null)[], rows: IRNode[][] }
  | { kind: 'directive', name: string, attrs: Attrs, children: IRNode[] }
  | { kind: 'break', breakKind: 'rule' | 'page', attrs: Attrs }
  // inline
  | { kind: 'text', value: string }
  | { kind: 'strong' | 'emphasis' | 'strike' | 'mark' | 'emdot' | 'span', attrs: Attrs, children: IRNode[] }
  | { kind: 'inline-code', value: string }
  | { kind: 'ruby', base: string, rt: string }
  | { kind: 'link', label: IRNode[], href: string, linkKind: 'external' | 'entry' | 'asset' | 'permalink' }
  | { kind: 'embed', label: IRNode[], ref: string, mode: 'seamless' | 'quote' }
  | { kind: 'card', label: IRNode[], ref: string }
  | { kind: 'image', src: string, alt: string, attrs: Attrs }
  | { kind: 'var', path: string }
  | { kind: 'autoref', id: string }
  | { kind: 'comment', commentKind: 'inline' | 'block', text: string };

type Attrs = { id?: string; classes?: string[]; kvs?: Record<string, string> };
type Meta = Record<string, MetaValue>;
type MetaValue = string | number | boolean | null | MetaValue[] | { [k: string]: MetaValue };
```

### 5.2 formal / simple → IR への正規化

```
simple `# Title {#id}` → parse → Heading{level: 1, attrs: {id: "id"}, children: [Text{"Title"}]}
formal `:::heading{level=1 id="id"} Title :::` → parse → 同じ IR
```

両者から同じ canonical IR が出る。逆に IR → serialize は **simple 優先**(short form 出力)、ただし表現できない attribute / 機能は formal で fallback。

### 5.3 IR-level 不変条件

1. **node kind の閉集合**:上記 type 以外の `kind` を持つ node は禁止(parse error)
2. **attrs schema**:`id` slug-safe / `classes` array of slug-safe / `kvs` flat
3. **lossless serialize**:`source → IR → source'` で `source ≡ source'`(simple ↔ formal 変換時を除き、informational equivalence)

### 5.4 format 別射影(IR から)

| IR node | HTML | Word(.docx) | LaTeX | Org-mode | Pandoc MD | Anki |
|---------|------|------------|-------|----------|----------|------|
| heading | `<h1>...<h6>` | `Heading 1...6` style | `\section` 系 | `* ... ******` | `# ... ######` | front of card |
| paragraph | `<p>` | `Normal` | `(text)` | `(text)` | `(text)` | back of card |
| embed seamless | inline 展開 | inline 結合 | `\input` | `#+INCLUDE` | inline 展開 | n/a |
| embed quote | `<blockquote>` + chrome | `Quote` style | `\begin{quote}` | `#+BEGIN_QUOTE` | `> ... [@source]` | n/a |
| card | `<div class="pkc-card">` | text + image | `\fbox` | `[[link]]` | inline link | n/a |
| ruby | `<ruby>` | RB / RT controls | `\ruby{}{}` | `@@ruby:base|rt@@` | n/a(escape) | front |
| variable | render-time expand | render-time | render-time | macro | `${vars.x}` | n/a |

embed の `mode="seamless"` vs `"quote"` の差は format ごとに仕様化(HTML では `<blockquote>` chrome、LaTeX では `\begin{quote}`、etc.)。

---

## 6. 移行計画(破壊的変更含む)

### 6.1 Phase 1:formal 記法導入(non-breaking)

- `:::name{attrs}` block directive を 1 つの統一記法として実装(現状 `:::figure` `:::if` だけだが拡大)
- `:role:[content]{attrs}` inline role を新設
- 既存 simple 記法は不変、formal を追加で受理
- IR への parse path を統一

**期間**:2-3 週間、5-8 PR

### 6.2 Phase 2:simple 記法整理(部分的破壊的)

- 整理候補(§3.4)を deprecated 化、replacement 提示
  - `[[ruby:|]]` → 廃止候補、`:ruby:` formal のみ + 別 simple 提案 user に確認
  - `||` `|>` `<|` align prefix → `:::paragraph{align=...}` に集約候補
  - `__` indent → 同上
- HTML pass-through 完全 off の build asserter
- 全記法に cap 設定

**期間**:2-3 週間、3-5 PR

### 6.3 Phase 3:IR confluence(10-3 wave 連携)

- IR AST を確定(`intermediate-representation-audit.md` §1〜5 と連動)
- parse(simple → IR、formal → IR)/ serialize(IR → simple、IR → formal)を実装
- 全記法の IR validator(node kind / attrs / cap)
- format 別 export 経路(HTML / Word / LaTeX / Org)を IR 起点に統一

**期間**:3-4 週間、10-15 PR、10-3 wave と並走

### 6.4 Phase 4:embed / link 仕上げ

- §3.2.3 の embed seamless / quote 切替を実装(本 doc 起点)
- card との棲み分け固定化
- `:::quote{author=... year=...}` block directive 着地

**期間**:1-2 週間、3-5 PR(本 issue 直接 follow-up)

---

## 7. open question(user 議論待ち)

| OQ | 質問 | 影響 |
|----|------|------|
| OQ-1 | `[[ruby:|]]` の simple 記法をどうするか?(`[base|読み]` か単純廃止か) | L-2 互換性 |
| OQ-2 | `||` `|>` `<|` align prefix を廃止して formal のみにする? | L-5 互換性 |
| OQ-3 | `__` indent prefix も廃止して formal のみ? | L-9 互換性 |
| OQ-4 | embed quote 記法は `{quote}` 属性 + `:::quote` directive 両対応で OK? | 本 issue |
| OQ-5 | inline `:role:[content]{attrs}` formal 記法を導入する? | Phase 1 |
| OQ-6 | property drawer(`:KEY: value`)を導入するか? | org-mode 風 metadata |
| OQ-7 | TOML frontmatter `+++` を採用するか?(YAML のみ維持を推奨) | metadata format |
| OQ-8 | block ref `[#id]` / term ref `[?term]` を Phase 1 で実装? | 計画 |
| OQ-9 | inline cap(modifier nest depth、variables 展開回数)の default 値? | security |

---

## 8. 結論と presentation summary

### 8.1 判断材料の要約

1. **先行事例の妥当性**:Pandoc MD + MyST + Obsidian の hybrid は学術 / 文書系で実績あり、PKC2 が独自路線を歩むわけでない(§1, §2)
2. **二層化の実装可能性**:formal `:::name{attrs}` directive + `:role:[content]{attrs}` inline で全記法を統一表現可能、IR への lossless 変換が成立(§3, §5)
3. **security**:HTML 完全 off + 全記法 cap で injection / DoS 両面を防御(§4)
4. **IR 互換**:Phase 3 で 10-3 wave と confluence、AST 形は §5.1 で固定可能
5. **migration**:Phase 1(non-breaking)→ Phase 2(部分破壊)→ Phase 3(IR 統合)→ Phase 4(embed/link 仕上げ)の 4 段階で 10〜20 週間

### 8.2 user 判断ポイント

- **A**: §3.4 の取り除き候補(`[[ruby:|]]` / `||` `|>` `<|` / `__`)を実際に廃止 / 簡素化するか?
- **B**: §3.3 の formal `:role:[content]{attrs}` inline 記法を導入するか?(Phase 1 着手の前提)
- **C**: §6 の Phase 1〜4 の wave 計画を採用するか?(別 wave 計画書に展開要)
- **D**: §7 OQ の各項目の方向性

---

## 9. 参考資料

- CommonMark 0.30 spec
- GFM spec(GitHub)
- Pandoc MD User's Guide
- MyST Specification(executablebooks)
- AsciiDoc Language(asciidoctor)
- reStructuredText Specification(docutils)
- Org-mode Manual(Emacs)
- Obsidian Help(wikilink / embed)
- 内部:`docs/development/markdown-dialect-extensions-spec-2026-05.md`(wave-10-2 拡張仕様)
- 内部:`docs/development/intermediate-representation-audit.md`(IR audit、計画中)
- 内部:`docs/spec/markdown-dialect-for-ai-authors-v1.md`(AI 書き手向け規約書)
