/**
 * `parseHtmlToAst(html)` — HTML → AstDocument reverse parser
 * (PR-V7、2026-05-14、v2.3.x stack)。
 *
 * `docs/spec/ast-commutative-ir.md` の双方向 mapping を完成させる第 1 歩。
 * これまで PKC2 は **AST → HTML**(`renderAstToHtml`)を持つだけで、HTML →
 * AST の reverse path は無く、外部 HTML(scraped content / pasted から /
 * 他 tool output)を AST IR に取り込む経路が無かった。
 *
 * 本実装は **commonmark + GFM core + PKC HTML output** をそのまま AST に
 * 戻すことを目的とする。raw HTML(unknown tags / inline style / external CSS)
 * は `AstOpaqueInline` / `AstOpaqueBlock`(`sourceFormat: 'html'`)に lossless
 * preserve する(ChatGPT review 2026-05-13 推奨の opaque 経路)。
 *
 * ## サポート対象
 *
 * ### Block 要素
 *
 * | HTML | AST node |
 * |------|----------|
 * | `<p>` | AstParagraph |
 * | `<h1>` … `<h6>` | AstHeading(level) |
 * | `<blockquote>` | AstQuote |
 * | `<ul>` / `<ol>` | AstList(unordered / ordered) |
 * | `<li>` | AstListItem(`<li><input type="checkbox" checked>` → task)|
 * | `<table>` / `<thead>` / `<tbody>` / `<tr>` / `<th>` / `<td>` | AstTable |
 * | `<pre><code class="language-X">` | AstCodeBlock(lang=X) |
 * | `<hr>` | AstBreak(rule)|
 * | `<figure>` | AstFigure |
 * | `<section data-pkc-role="R">` | AstSection(role=R) |
 * | `<div class="pkc-if-block" data-pkc-if-format="X">` | AstIfBlock |
 * | `<dl>` | AstDefinitionList |
 *
 * ### Inline 要素
 *
 * | HTML | AST node |
 * |------|----------|
 * | text | AstText |
 * | `<strong>` / `<b>` | AstStrong |
 * | `<em>` / `<i>` | AstEmphasis |
 * | `<s>` / `<del>` | AstStrike |
 * | `<code>` | AstInlineCode |
 * | `<mark>` | AstMark |
 * | `<sup>` / `<sub>` | AstSup / AstSub |
 * | `<ruby><rt>` | AstRuby |
 * | `<a href>` | AstLink(linkKind detected) |
 * | `<a class="pkc-auto-ref" data-pkc-ref-id>` | AstAutoRef |
 * | `<cite class="pkc-citation" data-pkc-cite-id>` | AstCitation |
 * | `<img src alt>` | AstImage |
 * | `<span class="pkc-em-dot">` | AstEmDot |
 * | `<span class="X">` | AstSpan(attrs.classes) |
 * | `<span class="pkc-variable" data-pkc-var-path>` | AstVar |
 *
 * その他の inline tag(`<font>` / `<u>` / 任意の `<style>`-only)は
 * **AstOpaqueInline(sourceFormat='html')** として lossless preserve。
 * その他の block tag(任意の `<div>` 未識別構造 / `<aside>` 等)は
 * **AstOpaqueBlock** として preserve。
 *
 * ## 可換性 contract
 *
 * - `parseHtmlToAst(renderAstToHtml(ast)) === ast`(semantic 等価、
 *   `semanticHash` で 数値証明)が **PKC2 が出した HTML** に対して成立。
 * - 外部 HTML(opaque を含む)は **lossless**(opaque 経路で原文保持)、
 *   2 回目以降の round-trip は idempotent。
 */

import type {
  AstAttrs,
  AstAutoRef,
  AstBlock,
  AstCitation,
  AstCodeBlock,
  AstDefinitionItem,
  AstDefinitionList,
  AstDocument,
  AstEmDot,
  AstEmphasis,
  AstFigure,
  AstHeading,
  AstFormatBlock,
  AstIfBlock,
  AstImage,
  AstInline,
  AstInlineCode,
  AstLink,
  AstList,
  AstListItem,
  AstMark,
  AstOpaqueBlock,
  AstOpaqueInline,
  AstParagraph,
  AstQuote,
  AstRuby,
  AstSection,
  AstSpan,
  AstStrike,
  AstStrong,
  AstSub,
  AstSup,
  AstTable,
  AstTableCell,
  AstTableRow,
  AstText,
  AstVar,
} from '@core/ast/index';

/**
 * HTML 文字列を AstDocument に変換。
 *
 * @param html HTML 文字列(`<html>` wrap の有無は問わない、`DOMParser` が body
 *             に正規化する)
 * @returns AstDocument(`astVersion: '2.0'`、`children` は block 配列)
 */
export function parseHtmlToAst(html: string): AstDocument {
  if (typeof DOMParser === 'undefined') {
    return { kind: 'document', astVersion: '2.0', children: [] };
  }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const body = doc.body;
  const children = parseBlockChildren(Array.from(body.childNodes));
  return { kind: 'document', astVersion: '2.0', children };
}

// ── Block 解析 ───────────────────────────────────────────

const BLOCK_TAGS = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'ul', 'ol', 'pre', 'hr',
  'figure', 'section', 'div', 'dl', 'table',
]);

function parseBlockChildren(nodes: ChildNode[]): AstBlock[] {
  const out: AstBlock[] = [];
  let inlineBuf: ChildNode[] = [];
  const flushInline = (): void => {
    if (inlineBuf.length === 0) return;
    // 空 whitespace のみ blob は drop
    const hasContent = inlineBuf.some((n) =>
      n.nodeType === 3
        ? (n.textContent ?? '').trim() !== ''
        : true,
    );
    if (hasContent) {
      out.push({
        kind: 'paragraph',
        children: parseInlineChildren(inlineBuf),
      } as AstParagraph);
    }
    inlineBuf = [];
  };
  for (const node of nodes) {
    if (node.nodeType === 1) {
      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();
      if (BLOCK_TAGS.has(tag)) {
        flushInline();
        const block = parseBlockElement(el);
        if (block) out.push(block);
        continue;
      }
    }
    inlineBuf.push(node);
  }
  flushInline();
  return out;
}

function parseBlockElement(el: HTMLElement): AstBlock | null {
  const tag = el.tagName.toLowerCase();
  switch (tag) {
    case 'p':
      return {
        kind: 'paragraph',
        children: parseInlineChildren(Array.from(el.childNodes)),
      } as AstParagraph;
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6': {
      const level = Number.parseInt(tag.slice(1), 10) as 1 | 2 | 3 | 4 | 5 | 6;
      return {
        kind: 'heading',
        level,
        children: parseInlineChildren(Array.from(el.childNodes)),
      } as AstHeading;
    }
    case 'blockquote': {
      const children = parseBlockChildren(Array.from(el.childNodes));
      return { kind: 'quote', children } as AstQuote;
    }
    case 'ul':
    case 'ol': {
      let listKind: 'bullet' | 'ordered' | 'task' = tag === 'ol' ? 'ordered' : 'bullet';
      const items: AstListItem[] = [];
      for (const li of Array.from(el.children)) {
        if (li.tagName.toLowerCase() !== 'li') continue;
        const liEl = li as HTMLElement;
        // GFM task list: <li><input type="checkbox" disabled> text</li>
        const cb = liEl.querySelector<HTMLInputElement>('input[type="checkbox"]');
        if (cb) {
          const state: 'open' | 'done' = cb.checked ? 'done' : 'open';
          // Strip the checkbox before extracting inlines
          const nodes = Array.from(liEl.childNodes).filter((n) => n !== cb);
          const childBlocks = parseBlockChildrenOrInlineFallback(nodes);
          items.push({ kind: 'list-item', state, children: childBlocks });
          continue;
        }
        items.push({
          kind: 'list-item',
          children: parseBlockChildrenOrInlineFallback(Array.from(liEl.childNodes)),
        });
      }
      // task list 検出:item state が 1 件でも attach されてれば 'task'
      if (listKind === 'bullet' && items.some((it) => it.state !== undefined)) {
        listKind = 'task';
      }
      const list: AstList = { kind: 'list', listKind, items };
      if (listKind === 'ordered') {
        const startAttr = el.getAttribute('start');
        if (startAttr) {
          const n = Number.parseInt(startAttr, 10);
          if (Number.isFinite(n)) list.start = n;
        }
      }
      return list;
    }
    case 'pre': {
      // <pre><code class="language-X">…</code></pre>
      const code = el.querySelector('code');
      const langCls = code?.getAttribute('class') ?? '';
      const langMatch = /language-([\w-]+)/.exec(langCls);
      const lang = langMatch?.[1];
      const text = code?.textContent ?? el.textContent ?? '';
      const node: AstCodeBlock = { kind: 'code-block', code: text, lang: lang ?? null };
      return node;
    }
    case 'hr':
      return { kind: 'break', breakKind: 'rule' };
    case 'figure': {
      const children: AstBlock[] = [];
      let caption: AstInline[] | undefined;
      for (const child of Array.from(el.children)) {
        if (child.tagName.toLowerCase() === 'figcaption') {
          caption = parseInlineChildren(Array.from(child.childNodes));
          continue;
        }
        const cb = parseBlockElement(child as HTMLElement);
        if (cb) children.push(cb);
      }
      const node: AstFigure = { kind: 'figure', figureKind: 'figure', children };
      if (caption) node.caption = caption;
      const attrs = collectDataAttrs(el);
      if (attrs) node.attrs = attrs;
      return node;
    }
    case 'section': {
      const role = el.getAttribute('data-pkc-role') ?? 'section';
      const children = parseBlockChildren(Array.from(el.childNodes));
      const node: AstSection = { kind: 'section', role, children };
      const attrs = collectDataAttrs(el, new Set(['data-pkc-role']));
      if (attrs) node.attrs = attrs;
      return node;
    }
    case 'div': {
      // pkc-if-block
      if (el.classList.contains('pkc-if-block')) {
        const format = el.getAttribute('data-pkc-if-format') ?? 'html';
        const children = parseBlockChildren(Array.from(el.childNodes));
        return { kind: 'if-block', format, children } as AstIfBlock;
      }
      // v4 §12 stack PR 9:pkc-format-block を AstFormatBlock に逆 parse
      if (el.classList.contains('pkc-format-block')) {
        // classes(pkc-format-block を除く ABC sorted)
        const classes = Array.from(el.classList)
          .filter((c) => c !== 'pkc-format-block')
          .sort((a, b) => a.localeCompare(b));
        // id
        const blockId = el.id || undefined;
        // data-pkc-indent
        const indentRaw = el.getAttribute('data-pkc-indent');
        const indent = indentRaw ? parseInt(indentRaw, 10) : undefined;
        // data-pkc-align
        const alignRaw = el.getAttribute('data-pkc-align');
        const align: 'left' | 'center' | 'right' | 'justify' | undefined =
          alignRaw === 'left' || alignRaw === 'center' || alignRaw === 'right' || alignRaw === 'justify'
            ? alignRaw
            : undefined;
        // style 属性 → styles(各 CSS prop:value を抽出)
        const styleAttr = el.getAttribute('style');
        let styles: Record<string, string> | undefined;
        if (styleAttr) {
          styles = {};
          for (const decl of styleAttr.split(';')) {
            const colon = decl.indexOf(':');
            if (colon < 0) continue;
            const k = decl.slice(0, colon).trim();
            const v = decl.slice(colon + 1).trim();
            if (k && v) styles[k] = v;
          }
          if (Object.keys(styles).length === 0) styles = undefined;
        }
        // 残り data-pkc-* attrs(format-block / indent / align 除外)を kvs に
        const kvs: Record<string, string | boolean> = {};
        for (const a of Array.from(el.attributes)) {
          if (!a.name.startsWith('data-pkc-')) continue;
          const key = a.name.slice('data-pkc-'.length);
          if (key === 'format-block' || key === 'indent' || key === 'align') continue;
          // boolean attr(値なし)= true、それ以外は string
          kvs[key] = a.value === '' ? true : a.value;
        }
        const children = parseBlockChildren(Array.from(el.childNodes));
        const node: AstFormatBlock = {
          kind: 'format-block',
          classes,
          children,
        };
        if (styles) node.styles = styles;
        if (blockId) node.blockId = blockId;
        if (indent !== undefined && Number.isFinite(indent)) node.indent = indent;
        if (align) node.align = align;
        if (Object.keys(kvs).length > 0) node.kvs = kvs;
        return node;
      }
      // Generic div → opaque-block(lossless preserve)
      return {
        kind: 'opaque-block',
        sourceFormat: 'html',
        original: el.outerHTML,
      } as AstOpaqueBlock;
    }
    case 'dl': {
      const items: AstDefinitionItem[] = [];
      let curTerm: AstInline[] | null = null;
      for (const child of Array.from(el.children)) {
        const ctag = child.tagName.toLowerCase();
        if (ctag === 'dt') {
          curTerm = parseInlineChildren(Array.from(child.childNodes));
        } else if (ctag === 'dd') {
          const desc = parseBlockChildrenOrInlineFallback(Array.from(child.childNodes));
          items.push({
            kind: 'definition-item',
            term: curTerm ?? [],
            description: desc,
          } as AstDefinitionItem);
          curTerm = null;
        }
      }
      return { kind: 'definition-list', items } as AstDefinitionList;
    }
    case 'table':
      return parseTable(el);
    default:
      // 未知 block tag → opaque
      return {
        kind: 'opaque-block',
        sourceFormat: 'html',
        original: el.outerHTML,
      } as AstOpaqueBlock;
  }
}

function parseBlockChildrenOrInlineFallback(nodes: ChildNode[]): AstBlock[] {
  const hasBlockChild = nodes.some(
    (n) =>
      n.nodeType === 1
      && BLOCK_TAGS.has((n as HTMLElement).tagName.toLowerCase()),
  );
  if (hasBlockChild) return parseBlockChildren(nodes);
  const inlines = parseInlineChildren(nodes);
  if (inlines.length === 0) return [];
  return [{ kind: 'paragraph', children: inlines } as AstParagraph];
}

function parseTable(el: HTMLElement): AstTable {
  const rows: AstTableRow[] = [];
  // pgc-243:GFM table column alignment は `<th style="text-align:X">` で
  // legacy markdown-it が emit する。最初に見つかる完全 row の cell style を
  // header 行と同じ位置で抽出して、AstTable.align(双方向可換)に転記。
  let columnAlign: Array<'left' | 'right' | 'center' | null> | null = null;
  const extractAlign = (cellEl: HTMLElement): 'left' | 'right' | 'center' | null => {
    const style = cellEl.getAttribute('style') ?? '';
    const m = /text-align:\s*(left|right|center)/.exec(style);
    return (m?.[1] ?? null) as 'left' | 'right' | 'center' | null;
  };
  // happy-dom DOMParser だと HTMLTableElement の `tHead` / `tBodies` プロパティが
  // 期待通り設置されないことがあるので、`querySelector(:scope > thead)` 経路で
  // 明示的に取り出す(child element 限定で nested <table> を踏まない)。
  const directChild = (tag: string): HTMLElement | null =>
    Array.from(el.children).find((c) => c.tagName.toLowerCase() === tag) as HTMLElement | null;
  const directChildren = (tag: string): HTMLElement[] =>
    Array.from(el.children).filter((c) => c.tagName.toLowerCase() === tag) as HTMLElement[];
  const collectRowsFrom = (parent: HTMLElement, isHeader: boolean): void => {
    for (const tr of Array.from(parent.children)) {
      if (tr.tagName.toLowerCase() !== 'tr') continue;
      const cells: AstTableCell[] = [];
      const rowAlign: Array<'left' | 'right' | 'center' | null> = [];
      for (const cellEl of Array.from(tr.children)) {
        cells.push({
          kind: 'table-cell',
          children: parseInlineChildren(Array.from(cellEl.childNodes)),
        } as AstTableCell);
        rowAlign.push(extractAlign(cellEl as HTMLElement));
      }
      rows.push({ kind: 'table-row', isHeader, cells } as AstTableRow);
      // pgc-243:最初に column 数が一致する row(typically header)の alignment を採用
      if (!columnAlign && rowAlign.length > 0) columnAlign = rowAlign;
    }
  };
  const thead = directChild('thead');
  if (thead) collectRowsFrom(thead, true);
  for (const tbody of directChildren('tbody')) collectRowsFrom(tbody, false);
  // <table> with bare <tr>(no thead/tbody)
  if (rows.length === 0) {
    let firstRow = true;
    for (const tr of Array.from(el.children)) {
      if (tr.tagName.toLowerCase() !== 'tr') continue;
      const cells: AstTableCell[] = [];
      const rowAlign: Array<'left' | 'right' | 'center' | null> = [];
      let allTh = true;
      for (const cellEl of Array.from(tr.children)) {
        if (cellEl.tagName.toLowerCase() !== 'th') allTh = false;
        cells.push({
          kind: 'table-cell',
          children: parseInlineChildren(Array.from(cellEl.childNodes)),
        } as AstTableCell);
        rowAlign.push(extractAlign(cellEl as HTMLElement));
      }
      rows.push({ kind: 'table-row', isHeader: firstRow && allTh, cells } as AstTableRow);
      if (!columnAlign && rowAlign.length > 0) columnAlign = rowAlign;
      firstRow = false;
    }
  }
  const node: AstTable = { kind: 'table', rows };
  // pgc-243:全列 null(alignment 未指定)なら省略、明示 1 件でもあれば保持。
  if (columnAlign && columnAlign.some((a) => a !== null)) {
    node.align = columnAlign;
  }
  return node;
}

// ── Inline 解析 ──────────────────────────────────────────

function parseInlineChildren(nodes: ChildNode[]): AstInline[] {
  const out: AstInline[] = [];
  for (const node of nodes) {
    if (node.nodeType === 3) {
      // Text
      const value = node.textContent ?? '';
      if (value.length > 0) out.push({ kind: 'text', value } as AstText);
      continue;
    }
    if (node.nodeType !== 1) continue;
    const inline = parseInlineElement(node as HTMLElement);
    if (inline) out.push(inline);
  }
  return mergeAdjacentText(out);
}

function parseInlineElement(el: HTMLElement): AstInline | null {
  const tag = el.tagName.toLowerCase();
  switch (tag) {
    case 'strong':
    case 'b':
      return {
        kind: 'strong',
        children: parseInlineChildren(Array.from(el.childNodes)),
      } as AstStrong;
    case 'em':
    case 'i':
      return {
        kind: 'emphasis',
        children: parseInlineChildren(Array.from(el.childNodes)),
      } as AstEmphasis;
    case 's':
    case 'del':
      return {
        kind: 'strike',
        children: parseInlineChildren(Array.from(el.childNodes)),
      } as AstStrike;
    case 'code': {
      const value = el.textContent ?? '';
      return { kind: 'inline-code', value } as AstInlineCode;
    }
    case 'mark': {
      const colorMatch = /pkc-mark-([\w-]+)/.exec(el.getAttribute('class') ?? '');
      const node: AstMark = {
        kind: 'mark',
        children: parseInlineChildren(Array.from(el.childNodes)),
      };
      if (colorMatch) node.color = colorMatch[1];
      return node;
    }
    case 'sup': {
      // pkc-footnote-ref special-case: `<sup class="pkc-footnote-ref"><a id>`
      if (el.classList.contains('pkc-footnote-ref')) {
        const a = el.querySelector('a');
        const id = a?.getAttribute('id')?.replace(/^fnref-/, '') ?? a?.textContent ?? '';
        return { kind: 'footnote-ref', id } as AstInline;
      }
      return {
        kind: 'sup',
        children: parseInlineChildren(Array.from(el.childNodes)),
      } as AstSup;
    }
    case 'sub':
      return {
        kind: 'sub',
        children: parseInlineChildren(Array.from(el.childNodes)),
      } as AstSub;
    case 'ruby': {
      // <ruby>base<rt>rt</rt></ruby>
      let base = '';
      let rt = '';
      for (const c of Array.from(el.childNodes)) {
        if (c.nodeType === 3) base += c.textContent ?? '';
        else if (c.nodeType === 1) {
          const ce = c as HTMLElement;
          if (ce.tagName.toLowerCase() === 'rt') rt += ce.textContent ?? '';
          else base += ce.textContent ?? '';
        }
      }
      return { kind: 'ruby', base, rt } as AstRuby;
    }
    case 'a': {
      const href = el.getAttribute('href') ?? '';
      const cls = el.getAttribute('class') ?? '';
      // pkc-auto-ref:`<a class="pkc-auto-ref" href="#X" data-pkc-ref-id="X">`
      if (cls.split(/\s+/).includes('pkc-auto-ref')) {
        const id = el.getAttribute('data-pkc-ref-id') ?? href.replace(/^#/, '');
        return { kind: 'auto-ref', id } as AstAutoRef;
      }
      const linkKindMatch = /pkc-link-([\w-]+)/.exec(cls);
      const linkKind = (linkKindMatch?.[1] ?? 'external') as AstLink['linkKind'];
      const node: AstLink = {
        kind: 'link',
        href,
        linkKind,
        children: parseInlineChildren(Array.from(el.childNodes)),
      };
      // pgc-243:HTML `<a title>` を AST に保持(双方向可換)。
      const title = el.getAttribute('title');
      if (title) node.title = title;
      return node;
    }
    case 'img': {
      const node: AstImage = {
        kind: 'image',
        src: el.getAttribute('src') ?? '',
        alt: el.getAttribute('alt') ?? '',
      };
      // pgc-243:HTML `<img title>` を AST に保持(双方向可換)。
      const title = el.getAttribute('title');
      if (title) node.title = title;
      return node;
    }
    case 'cite': {
      // pkc-citation `<cite class="pkc-citation" data-pkc-cite-id="X">`
      const id = el.getAttribute('data-pkc-cite-id');
      if (id) {
        const node: AstCitation = { kind: 'citation', id };
        const modeMatch = /pkc-citation-(normal|parenthetical|narrative)/.exec(el.getAttribute('class') ?? '');
        if (modeMatch) node.mode = modeMatch[1] as AstCitation['mode'];
        return node;
      }
      // 通常 <cite> は opaque preserve
      return {
        kind: 'opaque-inline',
        sourceFormat: 'html',
        original: el.outerHTML,
      } as AstOpaqueInline;
    }
    case 'span': {
      const cls = el.getAttribute('class') ?? '';
      const classes = cls.split(/\s+/).filter((c) => c.length > 0);
      // pkc-em-dot:`<span class="pkc-em-dot">…</span>` 含む
      if (classes.includes('pkc-em-dot')) {
        return {
          kind: 'em-dot',
          children: parseInlineChildren(Array.from(el.childNodes)),
        } as AstEmDot;
      }
      // pkc-variable:`<span class="pkc-variable" data-pkc-var-path>`
      if (classes.includes('pkc-variable')) {
        const path = el.getAttribute('data-pkc-var-path') ?? '';
        return { kind: 'var', path } as AstVar;
      }
      const attrs: AstAttrs = { classes, kvs: {} };
      return {
        kind: 'span',
        children: parseInlineChildren(Array.from(el.childNodes)),
        attrs,
      } as AstSpan;
    }
    case 'br':
      // soft break → text '\n' で代用(markdown-it と互換)
      return { kind: 'text', value: '\n' } as AstText;
    default:
      // 未知 inline tag → opaque
      return {
        kind: 'opaque-inline',
        sourceFormat: 'html',
        original: el.outerHTML,
      } as AstOpaqueInline;
  }
}

function mergeAdjacentText(inlines: readonly AstInline[]): AstInline[] {
  const out: AstInline[] = [];
  for (const n of inlines) {
    const last = out[out.length - 1];
    if (last && last.kind === 'text' && n.kind === 'text') {
      out[out.length - 1] = { kind: 'text', value: last.value + n.value };
    } else if (n.kind === 'text' && n.value === '') {
      // drop
    } else {
      out.push(n);
    }
  }
  return out;
}

/**
 * `data-X="Y"` を `attrs.kvs[X] = Y` に collect。`skipKeys` で除外できる(role を
 * 別 field に持つ場合など)。`id` / `class` は別 path で扱うので含めない。
 */
function collectDataAttrs(el: HTMLElement, skipKeys?: Set<string>): AstAttrs | undefined {
  const classes: string[] = [];
  const clsAttr = el.getAttribute('class');
  if (clsAttr) {
    for (const c of clsAttr.split(/\s+/)) if (c.length > 0) classes.push(c);
  }
  const id = el.getAttribute('id') ?? undefined;
  const kvs: Record<string, string | boolean> = {};
  for (const a of Array.from(el.attributes)) {
    if (a.name === 'class' || a.name === 'id') continue;
    if (skipKeys?.has(a.name)) continue;
    if (a.name.startsWith('data-')) {
      kvs[a.name.slice('data-'.length)] = a.value;
    }
  }
  if (!id && classes.length === 0 && Object.keys(kvs).length === 0) return undefined;
  return { id, classes, kvs };
}
