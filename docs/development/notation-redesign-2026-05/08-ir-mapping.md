# 08. IR Mapping(AST 形 + format 別射影)

## 8.1 motivation

PKC2 IR(Intermediate Representation)は **format 横断 export の起点 + 編集 UX(autocomplete / hover / lint)の正規 source**。

本記法整理は IR への lossless 変換が成立することを設計条件とする。各 markup(simple / formal どちらの形でも)が同じ canonical IR ノードに正規化、IR から各 format(HTML / Word / PPT / PDF / LaTeX / Org / Pandoc / Anki / etc.)へ射影される。

IR 自体の確定は別 wave(`docs/development/intermediate-representation-audit.md`、10-3)で進む予定。本章は IR の暫定形を提示、本記法整理との整合を示す。

## 8.2 IR AST type 定義(暫定)

### 8.2.1 root と inline / block 分離

```typescript
type IRDocument = {
  kind: 'document';
  meta: Frontmatter;             // frontmatter parsed result
  children: IRBlock[];
};

type IRBlock =
  | IRHeading
  | IRParagraph
  | IRList
  | IRListItem
  | IRQuote
  | IRCodeBlock
  | IRCodeRender               // Renderer Registry 経由(tree / dbschema / json{view} / 等)
  | IRTable
  | IRTableRow
  | IRTableCell
  | IRDirective                // generic `:::name{attrs}` block(figure / if / quote group / 等)
  | IRBreak
  | IRBlank
  | IRMath                     // block math `$$...$$`
  | IRComment                  // block hidden / footnote
  | IRFnDef;                   // Pandoc-style `[^id]: text` definition

type IRInline =
  | IRText
  | IRStrong | IREmphasis | IRStrike | IRMark | IREmDot | IRSpan
  | IRInlineCode
  | IRRuby
  | IRLink | IRCard | IREmbed | IRImage
  | IRAutoRef | IRFnRef | IRFn
  | IRBlockRef | IRTermRef
  | IRVar | IRMacro
  | IRMath                     // inline math `$x$`(同型、display flag で区別)
  | IRComment                  // inline hidden / footnote
  | IRSup | IRSub;             // formal-only(simple なし)

interface AttrsBase {
  id?: string;                 // slug-safe(`[A-Za-z_][\w-]*`)
  classes?: string[];          // 各々 slug-safe
  kvs?: Record<string, string | number | boolean>;  // flat、その他属性
}
```

### 8.2.2 主要 block ノード

```typescript
interface IRHeading {
  kind: 'heading';
  level: 1 | 2 | 3 | 4 | 5 | 6;
  attrs: AttrsBase;
  children: IRInline[];
}

interface IRParagraph {
  kind: 'paragraph';
  attrs: AttrsBase & {
    align?: 'start' | 'end' | 'center' | 'left' | 'right' | 'top' | 'bottom';
    indent?: number;          // 0 / 1 / 2 …
  };
  children: IRInline[];
}

interface IRList {
  kind: 'list';
  listKind: 'bullet' | 'ordered' | 'task';
  attrs: AttrsBase & { start?: number /* ordered 用 */ };
  items: IRListItem[];
}

interface IRListItem {
  kind: 'list-item';
  state?: 'open' | 'done' | null;   // task list 用
  children: IRBlock[];               // ネストした block(段落 / 入れ子 list 等)
}

interface IRQuote {
  kind: 'quote';
  attrs: AttrsBase;
  children: IRBlock[];
}

interface IRCodeBlock {
  kind: 'code-block';
  lang: string | null;
  attrs: AttrsBase;
  code: string;
}

interface IRCodeRender {
  kind: 'code-render';
  rendererName: string;             // 'tree' / 'dbschema' / 'json' / 'query' / etc.
  attrs: AttrsBase & Record<string, string | number | boolean>;
  source: string;
}

interface IRTable {
  kind: 'table';
  align: ('L' | 'R' | 'C' | null)[];
  rows: IRTableRow[];
}

interface IRTableRow {
  kind: 'table-row';
  isHeader: boolean;
  cells: IRTableCell[];
}

interface IRTableCell {
  kind: 'table-cell';
  children: IRInline[];
}

interface IRDirective {
  kind: 'directive';
  name: string;                     // 'figure' / 'if' / 'quote' / 'math' / 'comment' / etc.
  attrs: AttrsBase & Record<string, string | number | boolean>;
  children: IRBlock[];
}

interface IRBreak {
  kind: 'break';
  breakKind: 'rule' | 'page';
  attrs: AttrsBase & { role?: string };
}

interface IRBlank {
  kind: 'blank';
  count: number;                    // 1, 2, 3, ...
}

interface IRMath {
  kind: 'math';
  display: boolean;                 // false = inline、true = block
  src: string;                      // KaTeX source
}

interface IRComment {
  kind: 'comment';
  commentKind: 'inline' | 'block';
  visibility: 'hidden' | 'footnote';
  id?: string;                      // labeled の時
  children: IRInline[] | IRBlock[]; // inline / block で型変わる
}

interface IRFnDef {
  kind: 'fn-def';                   // Pandoc-style definition([^id]: text)
  id: string;
  children: IRBlock[];
}
```

### 8.2.3 主要 inline ノード

```typescript
interface IRText {
  kind: 'text';
  value: string;
}

interface IRStrong { kind: 'strong'; children: IRInline[] }
interface IREmphasis { kind: 'emphasis'; children: IRInline[] }
interface IRStrike { kind: 'strike'; children: IRInline[] }
interface IRMark { kind: 'mark'; attrs: AttrsBase & { color?: string }; children: IRInline[] }
interface IREmDot {
  kind: 'emdot';
  attrs: AttrsBase & { style?: 'dot' | 'circle' };  // 傍点 / 圏点
  children: IRInline[];
}
interface IRSpan { kind: 'span'; attrs: AttrsBase & { bold?, italic?, color?, size?, … }; children: IRInline[] }

interface IRInlineCode {
  kind: 'inline-code';
  value: string;
}

interface IRRuby {
  kind: 'ruby';
  base: string;
  rt: string;
}

interface IRLink {
  kind: 'link';
  linkKind: 'external' | 'entry' | 'asset' | 'permalink';
  href: string;                     // または ref
  children: IRInline[];             // label
  attrs: AttrsBase;
}

interface IRCard {
  kind: 'card';
  ref: string;                      // 'entry:LID'
  children: IRInline[];             // label
  attrs: AttrsBase;
}

interface IREmbed {
  kind: 'embed';
  ref: string;                      // 'entry:LID' / 'asset:KEY'
  mode: 'seamless' | 'quote';
  children: IRInline[];             // label
  attrs: AttrsBase;
}

interface IRImage {
  kind: 'image';
  src: string;                      // 'asset:KEY' / 'https://...'
  alt: string;
  attrs: AttrsBase;
}

interface IRAutoRef { kind: 'autoref'; id: string }    // [@fig1]
interface IRFnRef { kind: 'fn-ref'; id: string }        // [^src1]
interface IRFn {
  kind: 'fn';
  id?: string;                      // anonymous なら省略
  children: IRBlock[];               // footnote 本文
}
interface IRBlockRef { kind: 'block-ref'; id: string }   // [#h1.intro]
interface IRTermRef { kind: 'term-ref'; name: string }   // [?term]

interface IRVar {
  kind: 'var';
  path: string;                     // 'vars.x' / 'macros.x'
}

interface IRMacro {
  kind: 'macro';
  name: string;
  args: Record<string, string>;
}

interface IRSup { kind: 'sup'; children: IRInline[] }   // formal-only
interface IRSub { kind: 'sub'; children: IRInline[] }   // formal-only
```

## 8.3 simple → IR 写像

### 8.3.1 例

```
markdown source                                     IR
─────────────────────────────                       ─────────────────────────────
# はじめに {#intro}                          →      Heading{level:1, attrs:{id:"intro"}, children:[Text{"はじめに"}]}
本文に **重要** な情報。                       →      Paragraph{children:[Text{"本文に "}, Strong{children:[Text{"重要"}]}, Text{" な情報。"}]}
> 引用文。                                    →      Quote{children:[Paragraph{children:[Text{"引用文。"}]}]}
- item 1\n- item 2                            →      List{listKind:"bullet", items:[ListItem{children:[Paragraph{...}]}, ...]}
$x^2$                                          →      Math{display:false, src:"x^2"}
$$\int_a^b f(x)\,dx$$                          →      Math{display:true, src:"\\int_a^b f(x)\\,dx"}
[label](entry:LID)                             →      Link{linkKind:"entry", href:"entry:LID", children:[Text{"label"}]}
@[label](entry:LID)                            →      Card{ref:"entry:LID", children:[Text{"label"}]}
![label](entry:LID)                            →      Embed{ref:"entry:LID", mode:"seamless", children:[Text{"label"}]}
![label](entry:LID){quote}                     →      Embed{ref:"entry:LID", mode:"quote", attrs:{}, children:[Text{"label"}]}
{{vars.project}}                               →      Var{path:"vars.project"}
^^傍点^^                                       →      EmDot{attrs:{style:"dot"}, children:[Text{"傍点"}]}
[base|読み]                                    →      Ruby{base:"base", rt:"読み"}
%%hidden%%                                     →      Comment{commentKind:"inline", visibility:"hidden", children:[Text{"hidden"}]}
%%[fn=src1] 脚注 %%                            →      Comment{commentKind:"inline", visibility:"footnote", id:"src1", children:[Text{"脚注"}]}
本文 [^src1] reference                          →      Paragraph{children:[Text{"本文 "}, FnRef{id:"src1"}, Text{" reference"}]}
^[inline footnote]                             →      Fn{children:[Block{children:[Text{"inline footnote"}]}]}
[^src1]: 脚注本体                               →      FnDef{id:"src1", children:[Paragraph{children:[Text{"脚注本体"}]}]}
\|\|center text                                →      Paragraph{attrs:{align:"center"}, children:[Text{"center text"}]}
\|>end text                                    →      Paragraph{attrs:{align:"end"}, children:[Text{"end text"}]}
__indented                                     →      Paragraph{attrs:{indent:1}, children:[Text{"indented"}]}
+++ {role=cover}                               →      Break{breakKind:"page", attrs:{role:"cover"}}
_3                                             →      Blank{count:3}
```

### 8.3.2 formal → IR 写像

formal は full-attribute 形なので IR への 1:1 mapping が直接:

```
:::heading{level=2 id="intro"} ... :::            →    Heading{level:2, attrs:{id:"intro"}, ...}
:strong:[text]                                     →    Strong{children:[Text{"text"}]}
:embed:[label]{ref="entry:LID" mode="quote"}       →    Embed{ref:"entry:LID", mode:"quote", children:[...]}
:::quote{author="Smith" year=2020}\n![](entry:A)\n!:::
                                                   →    Directive{name:"quote", attrs:{author:"Smith",year:2020}, children:[Embed{...}]}
:::if{format=html} content :::                     →    Directive{name:"if", attrs:{format:"html"}, children:[...]}
```

### 8.3.3 可換性(commutativity)の保証

simple 形と formal 形は **同じ IR ノードに正規化** される。これにより:

- AI が formal で emit した entry は人間が simple で書き直しても等価
- 逆も然り(人間 simple 書き → AI が formal で edit → 人間が読む時は元 simple として表示)

可換性は IR test で verify:`source(simple) → IR == source(formal) → IR`(同じ IR が出ること)+ `IR → simple` `IR → formal` の serialize が逆方向で成立。

## 8.4 IR → format 別射影

### 8.4.1 射影 matrix(主要 IR ノード × format)

| IR node | HTML | Word(.docx) | LaTeX | Org-mode | Pandoc MD | Anki |
|---------|------|------------|-------|----------|----------|------|
| Heading | `<h1>...<h6>` | `Heading 1...6` style | `\section` 系 | `* ... ******` | `# ... ######` | front of card |
| Paragraph | `<p>` | `Normal` | `(text)` | `(text)` | `(text)` | back of card |
| List bullet | `<ul><li>` | bullet style | `itemize` | `- item` | `- item` | (skip) |
| List ordered | `<ol><li>` | numbered | `enumerate` | `1. item` | `1. item` | (skip) |
| List task | `<ul class=task><li>` | (style approximation) | `todonotes` package | `- [ ]` | `- [ ]` | (skip) |
| Quote | `<blockquote>` | `Quote` style | `quote` env | `#+BEGIN_QUOTE` | `> text` | (skip) |
| CodeBlock | `<pre><code class=lang-X>` | code style | `verbatim` / `lstlisting` | `#+BEGIN_SRC X` | ```` ```X ```` | code field |
| Table | `<table>` | table | `tabular` env | `\| col \|...` | GFM table | (skip) |
| Math inline | KaTeX HTML | OOML(equation field) | `$x$` | `\\(x\\)` | `$x$` | LaTeX |
| Math block | KaTeX block HTML | OOML | `$$x$$` | `\\[x\\]` | `$$x$$` | LaTeX |
| Embed seamless | inline 展開(host doc に取込) | inline 結合 | `\input` | `#+INCLUDE` | inline 展開(`include`) | n/a |
| Embed quote | `<blockquote>` + chrome | `Quote` style | `\begin{quote}` | `#+BEGIN_QUOTE` | `> ... [@source]` | n/a |
| Card | `<div class=pkc-card>` | text + image | `\fbox` | `[[link]]` | inline link | (skip) |
| Link | `<a href>` | hyperlink | `\href` | `[[link][label]]` | `[label](url)` | n/a |
| Image | `<img>` | embedded image | `\includegraphics` | `[[file:path][...]]` | `![alt](src)` | image field |
| Ruby | `<ruby>` | `RB` / `RT` controls | `\ruby{}{}` (CTeX) | `@@ruby:base\|rt@@` | (n/a、escape) | (front) |
| Strong | `<strong>` | bold | `\textbf{}` | `*text*` | `**text**` | bold |
| Emphasis | `<em>` | italic | `\emph{}` | `/text/` | `*text*` | italic |
| Mark | `<mark>` | highlight | `\hl{}` | `~text~`(?) | (Pandoc 拡張)| (skip) |
| EmDot | `<em class=emdot>` + CSS `text-emphasis` | (style approximation) | `\bouten`(jbouten package) | `+text+`(?)| (Pandoc 拡張) | (skip) |
| Var | render-time expand | render-time | render-time | macro | `${vars.x}`(? format による) | (skip) |
| AutoRef | `<a href=#fig1>図1</a>` | cross-reference | `\ref{fig1}` | `[[fig1]]` | `[@fig1]` | n/a |
| FnRef + FnDef | `<sup>`+ section | footnote field | `\footnote{}` | `[fn:1]` | `[^1]` + def | n/a |
| Comment hidden | (no render) | (no render) | (no render) | (no render) | `<!-- -->` | (skip) |
| Comment footnote | (= FnDef as footnote) | footnote | `\footnote{}` | `[fn:1]` | `[^1]` | (skip) |
| Break page | `<hr class=page-break>` + page-break-after CSS | hard page break | `\newpage` | `\\newpage`(extension) | (extension) | n/a |
| Blank | `<div class=blank>` × N | empty paragraphs × N | `\vspace{N\baselineskip}` | (text) | (text) | n/a |
| Directive(if) | conditional render | conditional | `\if...\fi`(custom)| custom | (Pandoc filter) | n/a |
| Directive(figure) | `<figure>` + caption | figure with caption | `figure` env | `#+CAPTION:` | (Pandoc fenced div) | image + caption |
| CodeRender(tree / dbschema / etc.) | renderer 専用 DOM | text approximation | text approximation | text approximation | code-fence + custom lang | (skip) |

各射影は format-specific export module で実装、IR から該当 format AST に変換する純関数。

### 8.4.2 lossy / lossless

- HTML / プレビュー:**lossless 目標**(全 IR ノードを表現可能)
- Word(.docx)/ PPT(.pptx):**limited**(layout 細部 / KaTeX 等は妥協)
- PDF:**lossy**(印刷物 fix、source への戻りなし)
- LaTeX:**lossless 近い**(KaTeX → LaTeX 直接)
- Org-mode:**lossless で互換**(拡張記法は標準 org に degrade)
- Pandoc MD:**lossy compatible**(PKC2 拡張は標準 markdown に degrade)
- Anki:**lossy**(card-suitable subset のみ、TEXTLOG → flashcard 用途)

詳細は `docs/development/intermediate-representation-audit.md` §5 と並走確定。

## 8.5 IR validator(reform で導入)

IR を生成 / 受信した後、必ず validator を通す:

### 8.5.1 不変条件

1. **node kind 閉集合**:上記 type 以外の `kind` を持つ node は禁止
2. **attrs schema**:`id` は slug-safe、`classes` array of slug-safe、`kvs` flat string/number/boolean
3. **inline / block 区別**:inline 種は inline 子 のみ、block 種は block 子(or inline mixed where allowed)
4. **lossless serialize**:`source → IR → source'` で `source ≡ source'`(simple ↔ formal 変換時を除く informational equivalence)
5. **circular reference 禁止**:`Embed` の `embedChain` 検出と同様、ID 経由の循環を walk で検出
6. **node 数 cap**:全 doc IR の node 数 ≤ 100,000
7. **string field 長 cap**:任意 string field byte 数 ≤ 16 KB(frontmatter cap と独立)
8. **nest depth cap**:全 IR の最大ネスト深度 ≤ 16

### 8.5.2 validator 失敗時の挙動

- parse 経路で validator 失敗 → 該当 entry を `<pre>{raw source}</pre>` で fallback display + 可視 warning
- IR を save する経路ではブロック保存(無効 IR を container に書き込まない)
- import 経路では reject + 警告

## 8.6 simple ↔ formal serialize

IR から simple / formal 両方への serialize は逆方向の射影。実装側で:

```typescript
function serializeToSimple(ir: IRDocument): string { ... }
function serializeToFormal(ir: IRDocument): string { ... }
function parseSource(source: string): IRDocument { ... }    // simple / formal 自動判定 受理
```

可逆性(round-trip):

```
parseSource(serializeToSimple(ir))  ≡  ir
parseSource(serializeToFormal(ir))  ≡  ir
```

両 serialize の差は表面記法のみ、IR は同一。

### 8.6.1 default serialization 戦略

`serialize(ir)` は default で **simple 優先**(short form 出力)、ただし表現できない attribute / 機能は formal で fallback:

- `Heading{level:1, attrs:{}, children:["X"]}` → `# X`(simple)
- `Heading{level:1, attrs:{id:"id"}, children:["X"]}` → `# X {#id}`(simple + attribute suffix)
- `Heading{level:1, attrs:{id:"id", kvs:{role:"summary"}}, children:["X"]}` → `# X {#id role=summary}`(simple + attrs)
- `Directive{name:"if", attrs:{format:"html"}, children:[...]}` → `:::if{format=html} ... :::`(formal、simple なし)

## 8.7 編集 UX 連動

IR は autocomplete / hover / lint の正規 source としても機能:

- **autocomplete**:`[` trigger → IR から知る既存 ref / id / term の list を popup
- **hover**:`[#h1.intro]` 上 hover → IR から該当 heading を引いてプレビュー
- **lint**:IR validator で id 重複 / 未定義参照 / cap 超過 を検出 → editor 上に inline warning

詳細は `docs/development/markdown-dialect-extensions-spec-2026-05.md` §1.3(autocomplete trigger 表)を継承。

## 8.8 設計まとめ

### 確定

- IR AST の暫定 type 定義(§8.2)
- simple / formal → 同一 IR 正規化(可換)
- format 別射影 matrix(§8.4.1)、HTML / Word / LaTeX / Org / Pandoc / Anki
- IR validator + 不変条件 + 失敗時 fallback
- IR は編集 UX(autocomplete / hover / lint)の正規 source

### 議論待ち

- IR type の細部(`Attrs` の `kvs` 値型、`Span` attrs 列挙、`Math` の `src` parse 不要 / 必要 等)
- format 別射影の具体実装(各 format ごとに別 module、優先 format から)
- 編集 UX の autocomplete trigger の確定(`[` 後の候補 list の動的生成)

## 8.9 レビュー観点

1. **AST 形の妥当性**:現状の type 定義で表現力が十分か?後で困るパターンはないか?
2. **可換性の保証**:simple ↔ formal 両方向 serialize / parse が round-trip 成立するか、test できるか?
3. **format 別射影 matrix**:各 format で「lossless 目標」の妥当性、lossy だとしても何をどこまで保つか
4. **不変条件 / cap**:現状の cap で実用上の不便がないか?cap 超過時の fallback 戦略は user-friendly か?
5. **編集 UX 連動**:IR から autocomplete を生成する mechanism、IR が変わるたびに re-index するコスト
6. **10-3 wave との接続**:本 IR draft が `intermediate-representation-audit.md` の方向性と整合しているか
