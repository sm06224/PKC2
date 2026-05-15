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
} from '@core/ast/index';
import type { Container } from '@core/model/container';
import type { Entry } from '@core/model/record';
import { detectCsvLang, parseCsv, isHeaderDisabled } from '@features/markdown/csv-table';

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
  text: string;
  bold?: boolean;
  italic?: boolean;
  fontFace?: string;
  bullet?: boolean;
  indent?: number;
  /** PR-V19:Task list の状態('open' = `☐`、'done' = `☑`)。 */
  taskState?: 'open' | 'done';
  /** PR-V19:Code block from CSV/TSV/PSV → 2D table データ。これがあれば
   *  slide.addTable で render する(他 line と独立、bullet 等は無視)。 */
  tableRows?: string[][];
  /** Table の 1 行目を header 扱いするか(`noheader` 無しなら true)。 */
  tableHeader?: boolean;
  /** PR-V22:画像 base64 data + mime(slide.addImage で render)。 */
  imageData?: string;
  imageMime?: string;
}

/** PR-V22:image src(asset: / pkc:// / data:)を container.assets から解決。 */
function resolveImageSrc(
  src: string,
  ctx: { assets: Record<string, string>; entriesByLid: Map<string, Entry> },
): { data: string; mime: string } | null {
  let key: string | null = null;
  let mime: string | null = null;
  if (src.startsWith('asset:')) {
    key = src.slice('asset:'.length);
  } else if (src.startsWith('pkc://')) {
    const m = /^pkc:\/\/[^/]+\/asset\/([^/?#]+)/.exec(src);
    if (m) key = m[1] ?? null;
  } else if (src.startsWith('data:image/')) {
    const m = /^data:(image\/[^;]+);base64,(.+)$/.exec(src);
    if (m) return { data: m[2] ?? '', mime: m[1] ?? 'image/png' };
  }
  if (!key) return null;
  const data = ctx.assets[key];
  if (!data) return null;
  for (const e of ctx.entriesByLid.values()) {
    if (e.archetype === 'attachment') {
      try {
        const body = JSON.parse(e.body) as { asset_key?: string; mime?: string };
        if (body.asset_key === key && typeof body.mime === 'string') {
          mime = body.mime;
          break;
        }
      } catch { /* ignore */ }
    }
  }
  return { data, mime: mime ?? 'image/png' };
}

/** PR-V19:GFM task list 検出。docx と同 ロジック。 */
function detectTaskState(inlines: readonly AstInline[]): 'open' | 'done' | null {
  if (inlines.length === 0) return null;
  const first = inlines[0];
  if (!first || first.kind !== 'text') return null;
  const m = /^\[([ xX])\]\s/.exec(first.value);
  if (!m) return null;
  return m[1] === ' ' ? 'open' : 'done';
}

function stripTaskPrefix(inlines: readonly AstInline[]): AstInline[] {
  if (inlines.length === 0) return [...inlines];
  const first = inlines[0];
  if (!first || first.kind !== 'text') return [...inlines];
  const stripped = first.value.replace(/^\[[ xX]\]\s/, '');
  return [
    { kind: 'text', value: stripped } as AstInline,
    ...inlines.slice(1),
  ];
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
      case 'comment-inline':
        out.push(inlinesToPlainText(n.children));
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

/** PR-V22:inline 配列内の image を SlideLine.imageData として抽出。 */
function extractImageLines(
  inlines: readonly AstInline[],
  ctx: { assets: Record<string, string>; entriesByLid: Map<string, Entry> } | null,
): SlideLine[] {
  if (!ctx) return [];
  const out: SlideLine[] = [];
  const walk = (nodes: readonly AstInline[]): void => {
    for (const n of nodes) {
      if (n.kind === 'image') {
        const r = resolveImageSrc(n.src, ctx);
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
  indent = 0,
  imgCtx: { assets: Record<string, string>; entriesByLid: Map<string, Entry> } | null = null,
): SlideLine[] {
  switch (block.kind) {
    case 'heading':
      return [{ text: inlinesToPlainText(block.children), bold: true, indent }];
    case 'paragraph': {
      // PR-V22:paragraph 内 image を抽出 → 別 SlideLine として並列出力
      const out: SlideLine[] = [];
      const text = inlinesToPlainText(block.children);
      if (text.trim() !== '') {
        out.push({ text, indent });
      }
      out.push(...extractImageLines(block.children, imgCtx));
      return out;
    }
    case 'quote': {
      const inner = block.children.flatMap((b) => blockToSlideLines(b, indent + 1, imgCtx));
      return inner.map((l) => ({ ...l, italic: true }));
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
          const lines = blockToSlideLines(effectiveChild, indent + 1, imgCtx);
          for (const line of lines) {
            if (taskState) {
              const prefix = taskState === 'done' ? '☑ ' : '☐ ';
              out.push({ ...line, text: prefix + line.text, taskState });
            } else if (block.listKind === 'task') {
              const prefix = item.state === 'done' ? '☑ ' : '☐ ';
              out.push({ ...line, text: prefix + line.text, taskState: item.state ?? 'open' });
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
      return block.children.flatMap((b) => blockToSlideLines(b, indent, imgCtx));
    case 'comment-block':
      return [];
    case 'blank':
      return [{ text: '', indent }];
    case 'math-block':
      return [{ text: block.src, fontFace: 'Cambria Math', indent }];
    case 'definition-list': {
      const out: SlideLine[] = [];
      for (const item of block.items) {
        out.push({ text: inlinesToPlainText(item.term), bold: true, indent });
        for (const desc of item.description) {
          out.push(...blockToSlideLines(desc, indent + 1, imgCtx));
        }
      }
      return out;
    }
    case 'table': {
      const rows = block.rows.map((r) =>
        r.cells.map((c) => inlinesToPlainText(c.children)).join(' | '),
      );
      return rows.map((row) => ({ text: '| ' + row + ' |', fontFace: 'Consolas', indent }));
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
  imgCtx: { assets: Record<string, string>; entriesByLid: Map<string, Entry> } | null,
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
    slide.lines.push(...blockToSlideLines(block, 0, imgCtx));
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
  // PR-V22:image embed 用 ctx を構築
  const entriesByLid = new Map<string, Entry>();
  for (const e of opts.container?.entries ?? []) entriesByLid.set(e.lid, e);
  const imgCtx = {
    assets: opts.container?.assets ?? {},
    entriesByLid,
  };
  const slides = splitIntoSlides(ast, fallbackTitle, imgCtx);
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
        const nonEmpty = draft.lines.filter((l) => l.text !== '');
        if (nonEmpty.length > 0) {
          const textObjects = nonEmpty.map((line, idx) => ({
            text: line.bullet ? '• ' + line.text : line.text,
            options: {
              fontSize: 16,
              bold: line.bold,
              italic: line.italic,
              fontFace: line.fontFace,
              indentLevel: line.indent ?? 0,
              breakLine: idx < nonEmpty.length - 1,
            },
          }));
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
      // PR-V19:tableRows を持つ line は slide.addTable で別途 render
      const tableLines = draft.lines.filter((l) => l.tableRows);
      const imageLines = draft.lines.filter((l) => l.imageData);
      const textLines = draft.lines.filter((l) => !l.tableRows && !l.imageData && l.text !== '');
      const tableTop = draft.title ? 1.3 : 0.5;
      if (textLines.length > 0) {
        const textObjects = textLines.map((line, idx) => ({
          text: line.bullet ? '• ' + line.text : line.text,
          options: {
            fontSize: 18,
            bold: line.bold,
            italic: line.italic,
            fontFace: line.fontFace,
            indentLevel: line.indent ?? 0,
            breakLine: idx < textLines.length - 1,
          },
        }));
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

  const blob = (await pres.write({ outputType: 'blob' })) as unknown as Blob;
  return blob;
}
