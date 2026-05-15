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

/** PR-V24:slide 内で 1 paragraph を構成する run(文字単位の formatting)。 */
interface PptxRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  underline?: boolean;
  fontFace?: string;
  /** Mark = yellow background。 */
  highlight?: string;
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
   * Slide 形態:
   * - `'section'` = H1 + (option) H2 を扉スライドに表示
   * - `'content'` = H3 title + body
   */
  kind: 'section' | 'content';
  /** 主 title(section の場合 H1 / content の場合 H3、空文字 OK)。 */
  title: string;
  /** Subtitle(section の場合のみ:H2 がペアで来た場合)。 */
  subtitle?: string;
  /** Slide 内の本文行(順序保持)。 */
  lines: SlideLine[];
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
      return [{ ...base, text: n.value, fontFace: 'Consolas' }];
    case 'strong':
      return inlinesToRuns(n.children, ctx, { ...base, bold: true });
    case 'emphasis':
      return inlinesToRuns(n.children, ctx, { ...base, italic: true });
    case 'strike':
      return inlinesToRuns(n.children, ctx, { ...base, strike: true });
    case 'mark':
      // PR-V24:==mark== → yellow highlight
      return inlinesToRuns(n.children, ctx, { ...base, highlight: 'FFFF00' });
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
              const prefix = taskState === 'done' ? '☑ ' : '☐ ';
              out.push({
                ...line,
                text: prefix + line.text,
                runs: line.runs ? [{ text: prefix }, ...line.runs] : undefined,
                taskState,
              });
            } else if (block.listKind === 'task') {
              const prefix = item.state === 'done' ? '☑ ' : '☐ ';
              out.push({
                ...line,
                text: prefix + line.text,
                runs: line.runs ? [{ text: prefix }, ...line.runs] : undefined,
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
        fontFace: 'Consolas',
        indent,
      }));
    }
    case 'code-render':
      return [{ text: block.source, fontFace: 'Consolas', indent }];
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
      return [{ text: block.src, fontFace: 'Cambria Math', indent }];
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

/** PR-V24:AstTable を slide.addTable 形式に変換。 */
function tableBlockToLine(block: AstTable, ctx: PptxExportContext): SlideLine {
  void ctx;
  const rows = block.rows.map((r) =>
    r.cells.map((c) => inlinesToPlainText(c.children)),
  );
  return { text: '', tableRows: rows, tableHeader: true };
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
  const ensureCurrent = (): SlideDraft => {
    if (!current) {
      current = { kind: 'content', title: fallbackTitle, lines: [] };
      slides.push(current);
    }
    return current;
  };
  for (const block of ast.children) {
    // H1 → 新 section 扉
    if (block.kind === 'heading' && block.level === 1) {
      current = {
        kind: 'section',
        title: inlinesToPlainText(block.children),
        lines: [],
      };
      slides.push(current);
      continue;
    }
    // H2 → 直前 section 扉の subtitle(扉 slide + 直後 H2 のペアが要件)
    if (block.kind === 'heading' && block.level === 2) {
      if (current && current.kind === 'section' && current.subtitle === undefined) {
        current.subtitle = inlinesToPlainText(block.children);
        continue;
      }
      // H1 直後でない H2 は通常スライド title として扱う(fallback)
      current = {
        kind: 'content',
        title: inlinesToPlainText(block.children),
        lines: [],
      };
      slides.push(current);
      continue;
    }
    // H3 → 通常スライド
    if (block.kind === 'heading' && block.level === 3) {
      current = {
        kind: 'content',
        title: inlinesToPlainText(block.children),
        lines: [],
      };
      slides.push(current);
      continue;
    }
    // AstBreak(page / rule) → スライド区切り
    if (block.kind === 'break' && (block.breakKind === 'page' || block.breakKind === 'rule')) {
      // 現スライドを close、次のコンテンツから新スライド(title 未定 = content kind)
      current = {
        kind: 'content',
        title: '', // 続く H3 で上書きされる、無いなら空 title slide
        lines: [],
      };
      slides.push(current);
      continue;
    }
    // それ以外:本文 lines に追加
    const slide = ensureCurrent();
    slide.lines.push(...blockToSlideLines(block, 0, ctx));
  }
  if (slides.length === 0) {
    slides.push({ kind: 'content', title: fallbackTitle, lines: [] });
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

  for (const draft of slides) {
    const slide = pres.addSlide();
    if (draft.kind === 'section') {
      // 扉スライド:title 中央(大文字 + bold)+ subtitle(中央下)
      slide.addText(draft.title, {
        x: 0.5,
        y: 2.5,
        w: 12.0,
        h: 1.5,
        fontSize: 48,
        bold: true,
        align: 'center',
        valign: 'middle',
      });
      if (draft.subtitle) {
        slide.addText(draft.subtitle, {
          x: 0.5,
          y: 4.2,
          w: 12.0,
          h: 1.0,
          fontSize: 28,
          italic: true,
          align: 'center',
          valign: 'top',
        });
      }
      // 扉スライドにも本文があれば下部に表示(spec 外だが、loss を防ぐ)
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
      // 通常スライド:上部 title + 下部 body
      if (draft.title) {
        slide.addText(draft.title, {
          x: 0.5,
          y: 0.3,
          w: 12.0,
          h: 0.8,
          fontSize: 32,
          bold: true,
        });
      }
      // tableRows / imageData / 通常 text の 3 種を 1 pass で振り分け。
      const tableLines: SlideLine[] = [];
      const imageLines: SlideLine[] = [];
      const textLines: SlideLine[] = [];
      for (const l of draft.lines) {
        if (l.tableRows) tableLines.push(l);
        else if (l.imageData) imageLines.push(l);
        else if (l.text !== '' || (l.runs && l.runs.length > 0)) textLines.push(l);
      }
      const tableTop = draft.title ? 1.3 : 0.5;
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
        if (!tl.tableRows) continue;
        const rows = tl.tableRows.map((row, rIdx) =>
          row.map((cell) => ({
            text: cell,
            options: {
              bold: rIdx === 0 && tl.tableHeader,
              fill: rIdx === 0 && tl.tableHeader ? { color: 'EEEEEE' } : undefined,
              fontSize: 14,
            },
          })),
        );
        slide.addTable(rows, {
          x: 0.5,
          y: curY,
          w: 12.0,
          colW: tl.tableRows[0]?.map(() => 12.0 / (tl.tableRows![0]!.length)),
          border: { type: 'solid', pt: 0.5, color: '888888' },
        });
        curY += Math.min(0.4 * tl.tableRows.length + 0.2, 4.0);
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
