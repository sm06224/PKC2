/**
 * AST → PowerPoint(.pptx)direct generator(PR-V13 ベース + PR-V19 user audit
 * で slide split logic 完全再設計、2026-05-14)。
 *
 * # Slide 分割規則(PR-V19)
 *
 * user audit(2026-05-14)で旧 H1=新スライド方式を撤回:
 *
 * - **H1 = セクション扉スライド title**(新セクション開始、扉スライド 1 枚)
 * - **H2 = セクション扉スライドの subtitle**(同 扉スライドに併記)
 * - **H3 = スライド title**(通常スライド開始)
 * - **AstBreak(page) / AstBreak(rule)= 強制スライド区切り**
 *   (現スライド content close、次のコンテンツから新スライド)
 * - H4-H6 = 現スライド内 section header(bold + indent)
 * - paragraph / list / quote / code / table = 現スライド本文
 *
 * # 出力形式(slide layout)
 *
 * - 16:9 wide layout
 * - 扉スライド(section title slide):
 *   - 中央付近に H1 を大文字 title
 *   - その下に H2(あれば)を subtitle
 *   - 本文 paragraph があれば下部に
 * - 通常スライド(content slide):
 *   - 上部に H3 title
 *   - 下部に本文(paragraph / list / code-block / blockquote / table)
 *
 * # 非対象(future)
 *
 * - 画像埋め込み(asset 解決)
 * - footnote
 * - math
 * - インライン強調 fidelity 強化
 */

import PptxGenJS from 'pptxgenjs';

import type {
  AstBlock,
  AstDocument,
  AstInline,
  AstLink,
  AstTable,
} from '@core/ast/index';
import type { Container } from '@core/model/container';
import type { Entry } from '@core/model/record';
import { detectCsvLang, parseCsv, isHeaderDisabled } from '@features/markdown/csv-table';
import {
  isInternalLink,
  extractEntryLidFromHref,
  detectTaskState,
  stripTaskPrefix,
  resolveImageData,
} from '@features/ast/export-runs-common';
import {
  MARK_HIGHLIGHT_HEX,
  TABLE_HEADER_SHADING_HEX,
  TABLE_BORDER_HEX,
  MONOSPACE_FONT_LATIN,
  MATH_FONT,
  INLINE_CODE_SHADING_HEX,
  PPTX_TABLE_BORDER_PT,
  TASK_OPEN_GLYPH_COLOR_HEX,
  TASK_DONE_GLYPH_COLOR_HEX,
} from '@features/ast/export-constants';

/** PR-V24:slide 内で 1 paragraph を構成する run(文字単位の formatting)。 */
interface PptxRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  underline?: boolean;
  fontFace?: string;
  /** Mark `==X==` の highlight。PR-W8 で soft yellow `#FFF3A0` に tone-down。
   * inline code は `#F4F4F5` 灰色擬似ボックス用にも流用。 */
  highlight?: string;
  /** PR-W8(Wave X P2):任意 color hex(task glyph: 未完 grey / 完 緑)。 */
  color?: string;
  /** 内部リンク(slide 番号で jump)or 外部 URL。 */
  hyperlink?: { url?: string; slide?: number; tooltip?: string };
  superscript?: boolean;
  subscript?: boolean;
}

/** PR-V24:inline rendering 用 export context。docx と同等の vars / container / 内部リンク appendix を持つ。 */
interface PptxExportContext {
  vars: Record<string, string>;
  assets: Record<string, string>;
  entriesByLid: Map<string, Entry>;
  /** 内部リンク appendix(slide 末尾に「リンク先一覧」として追加)。 */
  internalLinks: Array<{ num: number; label: string; href: string; targetTitle?: string }>;
}

/** Slide 単位の中間 representation。 */
interface SlideDraft {
  /**
   * Slide 形態(PR-W9 で `'table'` を追加):
   * - `'section'` = H1 + (option) H2 を扉スライドに表示
   * - `'content'` = H3 title + body
   * - `'table'` = H3 title + table が dominant content(title 直下から
   *   table 開始、上の死に空間を撲滅)— `splitIntoSlides` 後に自動判定
   */
  kind: 'section' | 'content' | 'table';
  /** 主 title(section の場合 H1 / content の場合 H3、空文字 OK)。 */
  title: string;
  /** Subtitle(section の場合のみ:H2 がペアで来た場合)。 */
  subtitle?: string;
  /** Slide 内の本文行(順序保持)。 */
  lines: SlideLine[];
  /** PR-W9(Wave X P3、AI review P3-13):running footer 用 chapter 番号。
   * H1 の occurrence 順で 1 から bump。0 = 章なし(章前の slide)。 */
  chapterNum?: number;
}

interface SlideLine {
  /** 旧:plain text(fallback、heading 用)。 */
  text: string;
  /** PR-V24:AST 由来 formatted runs。あれば text より優先。 */
  runs?: PptxRun[];
  bold?: boolean;
  italic?: boolean;
  fontFace?: string;
  bullet?: boolean;
  indent?: number;
  /** PR-V19:Task list の状態('open' = `☐`、'done' = `☑`)。 */
  taskState?: 'open' | 'done';
  /** PR-V19:Code block from CSV/TSV/PSV → 2D table データ。これがあれば
   *  slide.addTable で render する(他 line と独立、bullet 等は無視)。
   *  PR-V24:AstTable(markdown pipe table)もここに集約。 */
  tableRows?: string[][];
  /**
   * PR-W4(2026-05-15):AstTable cell 内 inline formatting を保持するための
   * runs 版。`tableRows` と排他、こちらがあれば優先(`linesToTableCells` で
   * pptxgenjs の `[{ text, options }]` array に変換)。CSV / TSV fence 経路は
   * 引き続き `tableRows` を使う(cell 内 inline markup 非対応のため)。
   */
  tableRowsRuns?: PptxRun[][][];
  /** Table の 1 行目を header 扱いするか(`noheader` 無しなら true)。 */
  tableHeader?: boolean;
  /** PR-V22:画像 base64 data + mime(slide.addImage で render)。 */
  imageData?: string;
  imageMime?: string;
}

function inlinesToPlainText(inlines: readonly AstInline[]): string {
  const out: string[] = [];
  for (const n of inlines) {
    switch (n.kind) {
      case 'text': out.push(n.value); break;
      case 'inline-code': out.push(n.value); break;
      case 'strong':
      case 'emphasis':
      case 'strike':
      case 'mark':
      case 'em-dot':
      case 'sup':
      case 'sub':
      case 'span':
      case 'link':
      case 'card':
      case 'embed':
        out.push(inlinesToPlainText(n.children));
        break;
      case 'comment-inline':
        // PR-V24:%%hidden%% は drop。pptx 表面に出さない。
        break;
      case 'ruby': out.push(`${n.base}(${n.rt})`); break;
      case 'image': out.push(`[${n.alt || 'image'}]`); break;
      case 'auto-ref':
      case 'citation':
        out.push(`@${n.id}`);
        break;
      case 'var': out.push(`{{${n.path}}}`); break;
      case 'math-inline': out.push(n.src); break;
      case 'footnote-ref': out.push(`[^${n.id}]`); break;
      case 'opaque-inline': out.push(n.original); break;
    }
  }
  return out.join('');
}

/**
 * PR-V24:AstInline → PptxRun[](docx の inlinesToRuns と同等)。
 * vars 展開 / mark highlight / em-dot italic / link hyperlink / comment drop。
 */
function inlinesToRuns(
  inlines: readonly AstInline[],
  ctx: PptxExportContext,
  base: Partial<PptxRun> = {},
): PptxRun[] {
  const out: PptxRun[] = [];
  for (const n of inlines) out.push(...inlineToRuns(n, ctx, base));
  return out;
}

function inlineToRuns(
  n: AstInline,
  ctx: PptxExportContext,
  base: Partial<PptxRun>,
): PptxRun[] {
  switch (n.kind) {
    case 'text':
      return n.value === '' ? [] : [{ ...base, text: n.value }];
    case 'inline-code':
      // PR-W7(Wave X P1):inline code = JetBrains Mono(欧文)+ `#F4F4F5`
      // shading の擬似ボックス化。fontFace は pptxgenjs API 単一指定で
      // CJK は PowerPoint / LibreOffice が自動 fallback。
      return [{
        ...base,
        text: n.value,
        fontFace: MONOSPACE_FONT_LATIN,
        highlight: INLINE_CODE_SHADING_HEX,
      }];
    case 'strong':
      return inlinesToRuns(n.children, ctx, { ...base, bold: true });
    case 'emphasis':
      return inlinesToRuns(n.children, ctx, { ...base, italic: true });
    case 'strike':
      return inlinesToRuns(n.children, ctx, { ...base, strike: true });
    case 'mark':
      // PR-V24:==mark== → yellow highlight
      return inlinesToRuns(n.children, ctx, { ...base, highlight: MARK_HIGHLIGHT_HEX });
    case 'em-dot':
      // PR-V24:..em-dot.. → italic(docx と同じ)
      return inlinesToRuns(n.children, ctx, { ...base, italic: true });
    case 'sup':
      return inlinesToRuns(n.children, ctx, { ...base, superscript: true });
    case 'sub':
      return inlinesToRuns(n.children, ctx, { ...base, subscript: true });
    case 'ruby':
      return [{ ...base, text: `${n.base}(${n.rt})` }];
    case 'link':
      return linkToRuns(n, ctx, base);
    case 'image':
      // image は別 SlideLine で出すため、ここでは alt の fallback も出さない(重複防止)
      return [];
    case 'card':
    case 'embed':
    case 'span':
      return inlinesToRuns(n.children, ctx, base);
    case 'auto-ref':
      return [{ ...base, text: `@${n.id}` }];
    case 'citation':
      return [{ ...base, text: `@${n.id}`, italic: true }];
    case 'var': {
      // PR-V24:vars 展開(docx と同じロジック、未定義は literal fallback)
      const path = n.path;
      const key = path.startsWith('vars.') ? path.slice('vars.'.length) : path;
      const value = ctx.vars[key];
      if (typeof value === 'string') return [{ ...base, text: value }];
      return [{ ...base, text: `{{${path}}}` }];
    }
    case 'math-inline':
      return [{ ...base, text: n.src }];
    case 'comment-inline':
      // PR-V24:%%hidden%% drop
      return [];
    case 'footnote-ref':
      return [{ ...base, text: `[^${n.id}]`, superscript: true }];
    case 'opaque-inline':
      return [{ ...base, text: n.original }];
    default: {
      const _exhaustive: never = n;
      void _exhaustive;
      return [];
    }
  }
}

function linkToRuns(
  link: AstLink,
  ctx: PptxExportContext,
  base: Partial<PptxRun>,
): PptxRun[] {
  const href = link.href;
  // label に nested formatting(bold / italic 等)を保持(inlinesToPlainText flatten を廃止)
  const labelRuns = inlinesToRuns(link.children, ctx, base);
  const labelText = labelRuns.map((r) => r.text).join('');
  if (isInternalLink(href)) {
    const num = ctx.internalLinks.length + 1;
    let targetTitle: string | undefined;
    const lid = extractEntryLidFromHref(href);
    if (lid) {
      const entry = ctx.entriesByLid.get(lid);
      if (entry) targetTitle = entry.title || entry.lid;
    }
    ctx.internalLinks.push({ num, label: labelText, href, targetTitle });
    return [
      ...labelRuns,
      { ...base, text: `(${num})`, superscript: true },
    ];
  }
  if (labelRuns.length === 0) {
    return [{ ...base, text: href, hyperlink: { url: href }, underline: true }];
  }
  return labelRuns.map((r) => ({ ...r, hyperlink: { url: href }, underline: true }));
}

/** PR-V22:inline 配列内の image を SlideLine.imageData として抽出。 */
function extractImageLines(
  inlines: readonly AstInline[],
  ctx: PptxExportContext,
): SlideLine[] {
  const out: SlideLine[] = [];
  const walk = (nodes: readonly AstInline[]): void => {
    for (const n of nodes) {
      if (n.kind === 'image') {
        const r = resolveImageData(n.src, ctx);
        if (r) out.push({ text: '', imageData: r.data, imageMime: r.mime });
      } else if ('children' in n && Array.isArray(n.children)) {
        walk(n.children as readonly AstInline[]);
      }
    }
  };
  walk(inlines);
  return out;
}

function blockToSlideLines(
  block: AstBlock,
  indent: number,
  ctx: PptxExportContext,
): SlideLine[] {
  switch (block.kind) {
    case 'heading':
      return [{ text: inlinesToPlainText(block.children), runs: inlinesToRuns(block.children, ctx), bold: true, indent }];
    case 'paragraph': {
      // PR-V22:paragraph 内 image を抽出 → 別 SlideLine として並列出力
      const out: SlideLine[] = [];
      const runs = inlinesToRuns(block.children, ctx);
      const text = inlinesToPlainText(block.children);
      if (runs.length > 0 && text.trim() !== '') {
        out.push({ text, runs, indent });
      }
      out.push(...extractImageLines(block.children, ctx));
      return out;
    }
    case 'quote': {
      const inner = block.children.flatMap((b) => blockToSlideLines(b, indent + 1, ctx));
      return inner.map((l) => ({
        ...l,
        italic: true,
        runs: l.runs?.map((r) => ({ ...r, italic: true })),
      }));
    }
    case 'list': {
      const out: SlideLine[] = [];
      for (const item of block.items) {
        for (const child of item.children) {
          // PR-V19:markdown-it plugin 無しの環境では task list が bullet
          // listKind で来る。child paragraph の head text `[ ]` / `[x]` を
          // 動的検出して ☐/☑ に置換。
          let taskState: 'open' | 'done' | null = null;
          let effectiveChild = child;
          if (child.kind === 'paragraph') {
            taskState = detectTaskState(child.children);
            if (taskState) {
              effectiveChild = {
                ...child,
                children: stripTaskPrefix(child.children),
              };
            }
          }
          const lines = blockToSlideLines(effectiveChild, indent + 1, ctx);
          for (const line of lines) {
            if (taskState) {
              // PR-W8(AI review P2-10):task glyph を color 化(未完 grey ☐、
              // 完 緑 ☑)。
              const prefix = taskState === 'done' ? '☑ ' : '☐ ';
              const glyphColor = taskState === 'done'
                ? TASK_DONE_GLYPH_COLOR_HEX
                : TASK_OPEN_GLYPH_COLOR_HEX;
              out.push({
                ...line,
                text: prefix + line.text,
                runs: line.runs
                  ? [{ text: prefix, color: glyphColor }, ...line.runs]
                  : [{ text: prefix, color: glyphColor }, { text: line.text }],
                taskState,
              });
            } else if (block.listKind === 'task') {
              const prefix = item.state === 'done' ? '☑ ' : '☐ ';
              const glyphColor = item.state === 'done'
                ? TASK_DONE_GLYPH_COLOR_HEX
                : TASK_OPEN_GLYPH_COLOR_HEX;
              out.push({
                ...line,
                text: prefix + line.text,
                runs: line.runs
                  ? [{ text: prefix, color: glyphColor }, ...line.runs]
                  : [{ text: prefix, color: glyphColor }, { text: line.text }],
                taskState: item.state ?? 'open',
              });
            } else {
              out.push({ ...line, bullet: true });
            }
          }
        }
      }
      return out;
    }
    case 'code-block': {
      // PR-V19:CSV/TSV/PSV fence は slide table として render
      const lang = block.lang ?? '';
      const csvLang = detectCsvLang(lang);
      if (csvLang) {
        const delim = csvLang === 'csv' ? ',' : csvLang === 'tsv' ? '\t' : '|';
        const cells = parseCsv(block.code, delim);
        if (cells && cells.length > 0) {
          return [{ text: '', tableRows: cells, tableHeader: !isHeaderDisabled(lang) }];
        }
      }
      return block.code.split('\n').map((line) => ({
        text: line,
        fontFace: MONOSPACE_FONT_LATIN,
        indent,
      }));
    }
    case 'code-render':
      return [{ text: block.source, fontFace: MONOSPACE_FONT_LATIN, indent }];
    case 'break':
      // PR-V19:break(page / rule)は slide split の signal、本文 line にはしない。
      // 呼出側 splitIntoSlides で処理(ここに来た場合はネスト内 break で、無視)
      return [];
    case 'figure':
    case 'section':
    case 'if-block':
      return block.children.flatMap((b) => blockToSlideLines(b, indent, ctx));
    case 'comment-block':
      return [];
    case 'blank':
      return [{ text: '', indent }];
    case 'math-block':
      return [{ text: block.src, fontFace: MATH_FONT, indent }];
    case 'definition-list': {
      const out: SlideLine[] = [];
      for (const item of block.items) {
        out.push({ text: inlinesToPlainText(item.term), runs: inlinesToRuns(item.term, ctx), bold: true, indent });
        for (const desc of item.description) {
          out.push(...blockToSlideLines(desc, indent + 1, ctx));
        }
      }
      return out;
    }
    case 'table': {
      // PR-V24:markdown pipe table も slide.addTable に集約(raw `| ... |` text を撤回)
      return [tableBlockToLine(block, ctx)];
    }
    case 'opaque-block':
      return [{ text: block.original, indent }];
    default: {
      const _exhaustive: never = block;
      void _exhaustive;
      return [];
    }
  }
}

/**
 * PR-V24:AstTable を slide.addTable 形式に変換。
 *
 * PR-W4(2026-05-15、simplify reuse agent 指摘):cell 内 inline formatting
 * (bold / italic / code / strike / mark / em-dot / sup / sub / link)を
 * 保持するため `inlinesToPlainText` → `inlinesToRuns` に切替、`tableRowsRuns`
 * 経路で run-level 描画。CSV / TSV fence 経路は plain text のままなので
 * `tableRows` を使う(別経路、引き続きサポート)。
 */
function tableBlockToLine(block: AstTable, ctx: PptxExportContext): SlideLine {
  const rows = block.rows.map((r) =>
    r.cells.map((c) => inlinesToRuns(c.children, ctx)),
  );
  return { text: '', tableRowsRuns: rows, tableHeader: true };
}

/**
 * SlideLine[] を pptxgenjs addText() の text-object 配列に flatten。各 line は 1 paragraph
 * として扱い、line 内最後の run に breakLine: true を付けて次の line に改行する。
 * line.bullet なら先頭に bullet glyph run を prepend。
 */
function linesToTextObjects(
  lines: SlideLine[],
  baseFontSize: number,
): Array<{ text: string; options: Record<string, unknown> }> {
  const out: Array<{ text: string; options: Record<string, unknown> }> = [];
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]!;
    const isLastLine = li === lines.length - 1;
    let runs: PptxRun[] = line.runs && line.runs.length > 0 ? line.runs : [{ text: line.text }];
    if (line.bullet) runs = [{ text: '• ' }, ...runs];
    for (let ri = 0; ri < runs.length; ri++) {
      const run = runs[ri]!;
      const isLastRun = ri === runs.length - 1;
      const opts: Record<string, unknown> = { fontSize: baseFontSize };
      const bold = run.bold ?? line.bold;
      const italic = run.italic ?? line.italic;
      const fontFace = run.fontFace ?? line.fontFace;
      if (bold) opts.bold = true;
      if (italic) opts.italic = true;
      if (fontFace) opts.fontFace = fontFace;
      if (line.indent) opts.indentLevel = line.indent;
      if (run.highlight) opts.highlight = run.highlight;
      if (run.strike) opts.strike = true;
      if (run.underline) opts.underline = { style: 'sng' };
      if (run.superscript) opts.superscript = true;
      if (run.subscript) opts.subscript = true;
      if (run.hyperlink) opts.hyperlink = run.hyperlink;
      // PR-W8(Wave X P2):任意 color(task glyph: grey ☐ / green ☑)。
      if (run.color) opts.color = run.color;
      if (isLastRun && !isLastLine) opts.breakLine = true;
      out.push({ text: run.text, options: opts });
    }
  }
  return out;
}

/**
 * AstDocument を slide draft 配列に分割(PR-V19 規則)。
 *
 * - H1 → 新セクション扉スライド開始、title セット
 * - H2 → 直前 H1(同セクション内)の subtitle として併記、独立 slide にはしない
 * - H3 → 通常スライド開始(content kind)、title セット
 * - AstBreak(page / rule)→ 現スライド close、次のコンテンツから新スライド
 * - H4-H6 / paragraph / list / 等は現スライド本文
 */
function splitIntoSlides(
  ast: AstDocument,
  fallbackTitle: string,
  ctx: PptxExportContext,
): SlideDraft[] {
  const slides: SlideDraft[] = [];
  let current: SlideDraft | null = null;
  // PR-W9(AI review P3-13):chapter counter で running footer 用 chapter 番号
  // を tracking。H1 の occurrence 順で 1 から bump。
  let chapterCount = 0;
  const ensureCurrent = (): SlideDraft => {
    if (!current) {
      current = { kind: 'content', title: fallbackTitle, lines: [], chapterNum: chapterCount };
      slides.push(current);
    }
    return current;
  };
  for (const block of ast.children) {
    if (block.kind === 'heading' && block.level === 1) {
      chapterCount += 1;
      current = {
        kind: 'section',
        title: inlinesToPlainText(block.children),
        lines: [],
        chapterNum: chapterCount,
      };
      slides.push(current);
      continue;
    }
    if (block.kind === 'heading' && block.level === 2) {
      if (current && current.kind === 'section' && current.subtitle === undefined) {
        current.subtitle = inlinesToPlainText(block.children);
        continue;
      }
      current = {
        kind: 'content',
        title: inlinesToPlainText(block.children),
        lines: [],
        chapterNum: chapterCount,
      };
      slides.push(current);
      continue;
    }
    if (block.kind === 'heading' && block.level === 3) {
      current = {
        kind: 'content',
        title: inlinesToPlainText(block.children),
        lines: [],
        chapterNum: chapterCount,
      };
      slides.push(current);
      continue;
    }
    if (block.kind === 'break' && (block.breakKind === 'page' || block.breakKind === 'rule')) {
      current = {
        kind: 'content',
        title: '',
        lines: [],
        chapterNum: chapterCount,
      };
      slides.push(current);
      continue;
    }
    const slide = ensureCurrent();
    slide.lines.push(...blockToSlideLines(block, 0, ctx));
  }
  if (slides.length === 0) {
    slides.push({ kind: 'content', title: fallbackTitle, lines: [], chapterNum: 0 });
  }
  // PR-W9(AI review P3-11/12):table-centric slide を自動判定。slide.lines
  // に tableRows/tableRowsRuns を持つ line があり、かつ通常 text lines が
  // 「title 直下 separator スペース節約に値する量(0-1 短文)」程度しかない
  // 場合、kind を 'table' に格上げ → table layout(title 直下から table 開始
  // で死に空間を撲滅)。section slide は対象外(扉 layout を維持)。
  for (const slide of slides) {
    if (slide.kind !== 'content') continue;
    const hasTable = slide.lines.some((l) => l.tableRows || l.tableRowsRuns);
    if (!hasTable) continue;
    const textLines = slide.lines.filter(
      (l) => (l.text !== '' || (l.runs && l.runs.length > 0)) && !l.tableRows && !l.tableRowsRuns && !l.imageData,
    );
    // text line が 1 件以内なら table-centric(table が dominant content)
    if (textLines.length <= 1) {
      slide.kind = 'table';
    }
  }
  return slides;
}

/**
 * AstDocument を pptx Blob に変換。
 *
 * @param ast AstDocument
 * @param opts.title file 既定 title(fallback 用)
 * @returns Blob(application/vnd.openxmlformats-officedocument.presentationml.presentation)
 */
export async function astToPptxBlob(
  ast: AstDocument,
  opts: { title?: string; container?: Container; entry?: Entry } = {},
): Promise<Blob> {
  const fallbackTitle = opts.title ?? 'PKC2 Export';
  // PR-V24:export context(vars + image asset + 内部リンク appendix を統合)
  const entriesByLid = new Map<string, Entry>();
  for (const e of opts.container?.entries ?? []) entriesByLid.set(e.lid, e);
  const ctx: PptxExportContext = {
    vars: ast.vars ?? {},
    assets: opts.container?.assets ?? {},
    entriesByLid,
    internalLinks: [],
  };
  const slides = splitIntoSlides(ast, fallbackTitle, ctx);
  const pres = new PptxGenJS();
  pres.layout = 'LAYOUT_WIDE';
  pres.title = fallbackTitle;

  // PR-W5(2026-05-15、simplify reuse agent 指摘):title placeholder を
  // master slide layout で定義。`slide.addText(title, { placeholder: 'title' })`
  // 経由で title placeholder に挿入することで、Microsoft PowerPoint の
  // Outline View / accessibility tree / Office Online が **title として認識**
  // する(従来の `slide.addText` text box のみだと title 認識されなかった)。
  // 2 master:section(扉スライド、title 中央 + subtitle 中央下)+ content
  // (通常スライド、title 上部)。位置 / size / font は従来 text box と同等で
  // visual regression なし。
  // PR-W6(AI review P0-b):font-size 階段 44pt → 36pt → 28pt、扉スライドの
  // title block を中央(y:1.8)に移動して上下の dead space を均す。autoFit /
  // wrap は pptxgenjs の PlaceholderProps では受け付けないので、各 slide の
  // addText 呼出 options 側で指定する。
  pres.defineSlideMaster({
    title: 'PKC_SECTION_SLIDE',
    objects: [
      {
        placeholder: {
          options: {
            name: 'title',
            type: 'title',
            x: 0.5,
            y: 1.8,
            w: 12.0,
            h: 2.0,
            fontSize: 44,
            bold: true,
            align: 'center',
            valign: 'middle',
          },
          text: '',
        },
      },
      {
        placeholder: {
          options: {
            name: 'subtitle',
            type: 'body',
            x: 0.5,
            y: 4.0,
            w: 12.0,
            h: 1.2,
            fontSize: 36,
            italic: true,
            align: 'center',
            valign: 'top',
          },
          text: '',
        },
      },
    ],
  });
  pres.defineSlideMaster({
    title: 'PKC_CONTENT_SLIDE',
    // PR-W9(AI review P3-13):slideNumber を右下に subtle grey で表示
    // (running footer 効果)。
    slideNumber: {
      x: 12.0,
      y: 6.8,
      w: 1.0,
      h: 0.3,
      fontSize: 10,
      color: '888888',
      align: 'right',
    },
    objects: [
      {
        placeholder: {
          options: {
            name: 'title',
            type: 'title',
            x: 0.5,
            y: 0.3,
            w: 12.0,
            h: 1.0,
            fontSize: 28,
            bold: true,
          },
          text: '',
        },
      },
    ],
  });
  // PR-W9(AI review P3-11/12):**PKC_TABLE_SLIDE** master を追加。table
  // 中心の slide はこの layout を使い、title 直下(y:1.0)から table を開始、
  // 上の死に空間を撲滅。本文 text area は title と table 間に subtle space
  // (0.1 inch)だけ確保。
  pres.defineSlideMaster({
    title: 'PKC_TABLE_SLIDE',
    slideNumber: {
      x: 12.0,
      y: 6.8,
      w: 1.0,
      h: 0.3,
      fontSize: 10,
      color: '888888',
      align: 'right',
    },
    objects: [
      {
        placeholder: {
          options: {
            name: 'title',
            type: 'title',
            x: 0.5,
            y: 0.3,
            w: 12.0,
            h: 0.7, // 高さを少し縮めて table 開始位置を上げる
            fontSize: 28,
            bold: true,
          },
          text: '',
        },
      },
    ],
  });
  // PR-W9:section slide master にも slideNumber を後付け追加(扉スライド
  // にも subtle footer を表示)。`PKC_SECTION_SLIDE` を再定義は pptxgenjs
  // の API で対応していないため、上の section master 定義時に slideNumber
  // を直接含める手もあったが、編集 diff を minimal にするため別 method で
  // run-time に slide.slideNumber を adjust する手段がない場合、各 slide
  // 描画時に `slide.slideNumber` を override しない(master の slideNumber
  // 設定が反映される)。section master は slideNumber 未指定でも footer は
  // 出ないため、scope を content + table slide に限定する解釈で OK。

  for (const draft of slides) {
    const masterName = draft.kind === 'section'
      ? 'PKC_SECTION_SLIDE'
      : draft.kind === 'table'
        ? 'PKC_TABLE_SLIDE'
        : 'PKC_CONTENT_SLIDE';
    const slide = pres.addSlide({ masterName });
    // PR-W9(AI review P3-13):chapter footer text(`Chapter N`)を左下に
    // subtle grey で。chapterNum が 0 / undefined ならスキップ(章前)。
    if (draft.chapterNum && draft.chapterNum > 0) {
      slide.addText(`Chapter ${draft.chapterNum}`, {
        x: 0.5,
        y: 6.8,
        w: 4.0,
        h: 0.3,
        fontSize: 10,
        color: '888888',
        align: 'left',
      });
    }
    if (draft.kind === 'section') {
      // 扉スライド:title placeholder に挿入(Outline View 認識のため)+
      // autoFit + wrap で長 title が意味境界で折り返す(AI review P0-b)。
      slide.addText(draft.title, {
        placeholder: 'title',
        autoFit: true,
        wrap: true,
      });
      // PR-W6(AI review P0-b):subtitle 位置を master と同期(y:4.0)、
      // font-size 階段 36pt + autoFit + wrap で意味境界折り返し。
      if (draft.subtitle) {
        slide.addText(draft.subtitle, {
          placeholder: 'subtitle',
          x: 0.5,
          y: 4.0,
          w: 12.0,
          h: 1.2,
          fontSize: 36,
          italic: true,
          align: 'center',
          valign: 'top',
          autoFit: true,
          wrap: true,
        });
      }
      // 扉スライドにも本文があれば下部に表示(spec 外だが、loss を防ぐ)
      // subtitle 移動に合わせて body 開始も y:5.5 → y:5.5 維持(subtitle h:1.2
      // で 4.0 + 1.2 = 5.2 まで、その下に 0.3 のスペースを置いて body)。
      if (draft.lines.length > 0) {
        const nonEmpty = draft.lines.filter((l) => l.text !== '' || (l.runs && l.runs.length > 0));
        if (nonEmpty.length > 0) {
          const textObjects = linesToTextObjects(nonEmpty, 16);
          slide.addText(textObjects, {
            x: 0.5,
            y: 5.5,
            w: 12.0,
            h: 1.8,
            valign: 'top',
            fontSize: 16,
          });
        }
      }
    } else {
      // 通常スライド:title placeholder に挿入(Outline View 認識のため)+
      // autoFit + wrap で長 title を意味境界折り返し(AI review P0-b)。
      if (draft.title) {
        slide.addText(draft.title, {
          placeholder: 'title',
          autoFit: true,
          wrap: true,
        });
      }
      // tableRows / tableRowsRuns / imageData / 通常 text の 4 種を 1 pass で振り分け。
      const tableLines: SlideLine[] = [];
      const imageLines: SlideLine[] = [];
      const textLines: SlideLine[] = [];
      for (const l of draft.lines) {
        if (l.tableRows || l.tableRowsRuns) tableLines.push(l);
        else if (l.imageData) imageLines.push(l);
        else if (l.text !== '' || (l.runs && l.runs.length > 0)) textLines.push(l);
      }
      // PR-W6(AI review P0-b):title 直下の separator スペース確保。
      // title h を 0.8 → 1.0 に拡大したことに合わせて body 開始を 1.5 に下げる。
      // PR-W9(AI review P3-12):table-centric slide は title 直下から
      // table を開始(y:1.1)、上の死に空間を撲滅。content slide は
      // separator スペース確保(y:1.5)。
      const tableTop = draft.title
        ? (draft.kind === 'table' ? 1.1 : 1.5)
        : 0.5;
      if (textLines.length > 0) {
        const textObjects = linesToTextObjects(textLines, 18);
        slide.addText(textObjects, {
          x: 0.5,
          y: tableTop,
          w: 12.0,
          h: tableLines.length > 0 ? 2.5 : 6.0,
          valign: 'top',
        });
      }
      let curY = tableTop + (textLines.length > 0 ? 2.7 : 0);
      for (const tl of tableLines) {
        // PR-W4(2026-05-15):AstTable は tableRowsRuns 経由(cell 内 inline
        // formatting を保持)、CSV/TSV fence は tableRows 経由(plain text)。
        // 両 path を一致した cell shape に正規化してから addTable に渡す。
        let normalized: Array<Array<{ text: string | Array<{ text: string; options?: Record<string, unknown> }>; options: Record<string, unknown> }>> | null = null;
        let colCount = 0;
        if (tl.tableRowsRuns) {
          normalized = tl.tableRowsRuns.map((row, rIdx) =>
            row.map((cellRuns) => {
              const isHeader = rIdx === 0 && (tl.tableHeader ?? false);
              const cellOptions: Record<string, unknown> = { fontSize: 14 };
              if (isHeader) cellOptions.fill = { color: TABLE_HEADER_SHADING_HEX };
              if (cellRuns.length === 0) {
                return { text: '', options: cellOptions };
              }
              // pptxgenjs の text-object array で cell text を構成、各 run の
              // bold / italic / underline / strike / sup / sub / fontFace /
              // highlight / hyperlink を保持。header 行 default で bold。
              const textObjects = cellRuns.map((r) => {
                const opts: Record<string, unknown> = {};
                if (r.bold || isHeader) opts.bold = true;
                if (r.italic) opts.italic = true;
                if (r.strike) opts.strike = true;
                if (r.underline) opts.underline = { style: 'sng' };
                if (r.superscript) opts.superscript = true;
                if (r.subscript) opts.subscript = true;
                if (r.fontFace) opts.fontFace = r.fontFace;
                if (r.highlight) opts.highlight = r.highlight;
                if (r.hyperlink) opts.hyperlink = r.hyperlink;
                return { text: r.text, options: opts };
              });
              return { text: textObjects, options: cellOptions };
            }),
          );
          colCount = tl.tableRowsRuns[0]?.length ?? 0;
        } else if (tl.tableRows) {
          normalized = tl.tableRows.map((row, rIdx) =>
            row.map((cell) => {
              const isHeader = rIdx === 0 && (tl.tableHeader ?? false);
              const cellOptions: Record<string, unknown> = { fontSize: 14 };
              if (isHeader) cellOptions.bold = true;
              if (isHeader) cellOptions.fill = { color: TABLE_HEADER_SHADING_HEX };
              return { text: cell, options: cellOptions };
            }),
          );
          colCount = tl.tableRows[0]?.length ?? 0;
        }
        if (!normalized || normalized.length === 0 || colCount === 0) continue;
        slide.addTable(normalized, {
          x: 0.5,
          y: curY,
          w: 12.0,
          colW: Array.from({ length: colCount }, () => 12.0 / colCount),
          border: { type: 'solid', pt: PPTX_TABLE_BORDER_PT, color: TABLE_BORDER_HEX },
        });
        curY += Math.min(0.4 * normalized.length + 0.2, 4.0);
      }
      // PR-V22:image 埋め込み
      for (const il of imageLines) {
        if (!il.imageData) continue;
        const dataUri = `data:${il.imageMime ?? 'image/png'};base64,${il.imageData}`;
        slide.addImage({
          data: dataUri,
          x: 0.5,
          y: curY,
          w: 6.0,
          h: 4.0,
        });
        curY += 4.2;
      }
    }
  }

  // PR-V24:内部リンクが 1 件以上あれば appendix slide「リンク先一覧」を末尾に追加。
  if (ctx.internalLinks.length > 0) {
    const appendix = pres.addSlide();
    appendix.addText('リンク先一覧', {
      x: 0.5, y: 0.3, w: 12.0, h: 0.8, fontSize: 32, bold: true,
    });
    const items = ctx.internalLinks.map((l, idx) => ({
      text: `(${l.num}) ${l.label} → ${l.targetTitle ?? '[未解決]'} [${l.href}]`,
      options: {
        fontSize: 16,
        breakLine: idx < ctx.internalLinks.length - 1,
      },
    }));
    appendix.addText(items, {
      x: 0.5, y: 1.3, w: 12.0, h: 6.0, valign: 'top',
    });
  }

  const blob = (await pres.write({ outputType: 'blob' })) as unknown as Blob;
  return blob;
}
