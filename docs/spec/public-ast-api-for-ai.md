# PKC2 公開 AST API(for AI / external integrations)

**Status**: 着地(2026-05-12、reform-2026-05 Phase 3 PR-2GG)
**API version**: 1.3.0(2026-05-14、v2.3.x stack PR-V7 で `parseHtml` 追加)
**Entry point**: `window.PKC.ast`

---

## 概要

PKC2 v2.2.0 は reform-2026-05 Phase 3 Block C で **markdown ↔ AstDocument ↔ HTML / Pandoc JSON** の可換経路を実装した(`docs/development/completed/ir-migration-plan-2026-05.md`)。

PR-2GG で **window.PKC.ast** namespace から AST 経路を **外部公開**:

- DevTools console で対話的に AST を取得
- 他の AI / 拡張 / 自動化ツールが PKC2 内の markdown を読み解く
- Pandoc Native JSON 経由で Word / PPT / PDF / LaTeX / ePub に export

---

## 6 関数 API

### `window.PKC.ast.parseMarkdown(text, opts?) → AstDocument`

markdown text を `AstDocument` に parse。frontmatter は自動抽出。

```js
const ast = window.PKC.ast.parseMarkdown(`---
title: Sample
vars:
  x: hello
---

# Heading

**bold** _em_ ~~strike~~ \`code\``);

console.log(ast.kind);          // 'document'
console.log(ast.children.length); // 2
console.log(ast.children[0].kind);  // 'heading'
console.log(ast.children[0].level); // 1
```

opts(任意):
- `vars?: Record<string, string>` — frontmatter vars override
- `md?: MarkdownIt` — markdown-it instance を差し替え(plugin 付き等)

### `window.PKC.ast.renderHtml(ast, opts?) → string`

AstDocument を HTML 文字列に render。

```js
const html = window.PKC.ast.renderHtml(ast);
// → '<h1>Heading</h1>\n<p><strong>bold</strong> <em>em</em> <s>strike</s> <code>code</code></p>'
```

opts:
- `sourceLineAnchors?: boolean` — `data-pkc-source-line` attr 転記
- `rootTag?: 'article' | 'body' | 'main'` — top-level wrap + globals 転記

### `window.PKC.ast.canonicalize(ast) → AstDocument`

AstDocument を正規化(idempotent contract:`canonicalize(canonicalize(x)) === canonicalize(x)`)。

```js
const canon = window.PKC.ast.canonicalize(ast);
// link href の hash fragment lower-case 化、空 text node 除去、連続 text merge、空 list-item 除去
```

### `window.PKC.ast.toPandocJson(ast) → object`

AstDocument を Pandoc Native JSON に変換。

```js
const pandoc = window.PKC.ast.toPandocJson(ast);
console.log(JSON.stringify(pandoc, null, 2));
// {
//   "pandoc-api-version": [1, 23, 1],
//   "meta": { "title": { "t": "MetaString", "c": "Sample" }, ... },
//   "blocks": [
//     { "t": "Header", "c": [1, ["", [], []], [{"t": "Str", "c": "Heading"}]] },
//     { "t": "Para", "c": [...] }
//   ]
// }
```

この JSON を `pandoc --from json --to docx` 等に流せば Word / PPT / PDF / LaTeX / ePub に変換可能。

### `window.PKC.ast.markdownToPandoc(text, opts?) → object`

1 step convenience:markdown text → Pandoc JSON。

```js
const pandoc = window.PKC.ast.markdownToPandoc('# Hello\n\nworld');
```

### `window.PKC.ast.version`

API version 文字列(将来の breaking change 検出用)。

```js
console.log(window.PKC.ast.version); // '1.3.0'
```

### `window.PKC.ast.parseHtml(html) → AstDocument`(v1.3.0、PR-V7)

HTML 文字列を AstDocument に **reverse parse**。commonmark + GFM core + PKC HTML output(`<section data-pkc-role>` / `<cite class="pkc-citation">` / `<a class="pkc-auto-ref">` / `<span class="pkc-em-dot">` / `<span class="pkc-variable">` / `<sup class="pkc-footnote-ref">` / `<div class="pkc-if-block">` 等)を AST に戻す。

未知 tag(`<kbd>` / `<aside>` / 任意の inline / block)は **`AstOpaqueInline` / `AstOpaqueBlock`(`sourceFormat: 'html'`)** として lossless preserve(原文を `original` field に保持)。

```js
const ast = window.PKC.ast.parseHtml('<h1>Title</h1><p>hello <strong>world</strong></p>');
// ast.children = [
//   { kind: 'heading', level: 1, children: [{ kind: 'text', value: 'Title' }] },
//   { kind: 'paragraph', children: [
//     { kind: 'text', value: 'hello ' },
//     { kind: 'strong', children: [{ kind: 'text', value: 'world' }] },
//   ]},
// ]
```

**可換性 contract**:`parseHtml(renderHtml(ast))` は `ast` と `semanticHash` 等価(PKC2 が出した HTML について成立)。外部 HTML も opaque 経路で lossless、2 回目以降の round-trip は idempotent。

---

## AstDocument 型

完全 type 定義:`src/core/ast/index.ts`。要約:

```ts
interface AstDocument {
  kind: 'document';
  writing?: 'horizontal' | 'vertical';
  direction?: 'ltr' | 'rtl';
  align?: 'left' | 'right' | 'center' | 'top' | 'bottom';
  notation?: string;
  vars?: Record<string, string>;
  children: readonly AstBlock[];
  warnings?: readonly PkcWarning[];
}

type AstBlock =
  | AstHeading | AstParagraph | AstQuote | AstList | AstTable
  | AstCodeBlock | AstCodeRender | AstBreak | AstFigure | AstSection
  | AstIfBlock | AstCommentBlock | AstBlank | AstMathBlock;

type AstInline =
  | AstText | AstStrong | AstEmphasis | AstStrike | AstInlineCode
  | AstMark | AstEmDot | AstRuby | AstSup | AstSub | AstSpan
  | AstLink | AstCard | AstEmbed | AstImage | AstAutoRef | AstVar
  | AstMathInline | AstCommentInline;
```

各 node は `attrs?: AstAttrs`(Pandoc-style `{ id?, classes, kvs }`)と `pos?: AstPosition`(`{ line, column?, endLine?, endColumn? }`)を持つ。

---

## 使い方の例(他 AI 向け)

### 例 1:外部 LLM が PKC2 entry の markdown を解析

```js
// User clicks an entry → markdown text を取得 → AST 化 → 構造解析
const entryBody = currentEntry.body;
const ast = window.PKC.ast.parseMarkdown(entryBody);

// 全 heading の集約
const headings = ast.children.filter(c => c.kind === 'heading');
console.log(`${headings.length} headings:`,
  headings.map(h => `H${h.level}: ${h.children[0]?.value ?? ''}`));
```

### 例 2:Word/PPT export 経路

```js
const ast = window.PKC.ast.parseMarkdown(entry.body);
const pandoc = window.PKC.ast.toPandocJson(ast);

// Pandoc JSON を file/postMessage で外部 Pandoc に渡す
const blob = new Blob([JSON.stringify(pandoc)], { type: 'application/json' });
// → pandoc --from json --to docx output.docx < pandoc.json
```

### 例 3:idempotent 正規化で diff 安定化

```js
const a = window.PKC.ast.parseMarkdown(textVersionA);
const b = window.PKC.ast.parseMarkdown(textVersionB);
const ca = window.PKC.ast.canonicalize(a);
const cb = window.PKC.ast.canonicalize(b);
// canonical form 同士の diff は **構文揺れ** を吸収した上での差分
```

---

## scope 制約(Phase 1)

- IR は **commonmark + GFM core** を完全 cover
- PKC 固有 inline / block(`em-dot` / `mark` / `:::section` / `:::figure` / `:::quote` / `pkc-card` 等)は **段階的に追加中**(follow-up PR-2Y2 等)
- 現時点で未対応 token は `AstSpan` で wrap して text 保持(lossy fallback)

完全 IR migration は future wave で `renderMarkdown` 本体を IR 経由 hot path に切り替えた時点で達成(現在は scaffolding 段階、Tier 0 flag `markdown.use_ir` で opt-in)。

---

## 関連 doc

- `docs/development/completed/ir-migration-plan-2026-05.md` — IR migration 設計
- `src/core/ast/index.ts` — AST type 定義(canonical)
- `src/features/ast/parse.ts` — parse 実装
- `src/features/ast/render-html.ts` — HTML render 実装
- `src/features/ast/canonicalize.ts` — canonicalize 実装
- `src/features/ast/export-pandoc.ts` — Pandoc JSON 変換実装
- `docs/spec/markdown-dialect-for-ai-authors-v3.md` — AI 向け規約書(candidate)
