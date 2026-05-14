/**
 * AST → PowerPoint(.pptx)direct generator(PR-V13、2026-05-14、U4)。
 *
 * これまで PKC2 は markdown → Pandoc JSON → user 側 pandoc CLI で .pptx に
 * 変換していた。本実装で **pptxgenjs を直接使い** AstDocument を 1-click で
 * .pptx Blob に変換できるようにする。
 *
 * Slide 分割規則(Phase 1):
 *   - **h1 → 新しい slide の Title**(slide 開始)
 *   - **h2 → slide 内の section header**(同 slide に追記)
 *   - **h3+ → slide 内の sub header**(同 slide に追記)
 *   - heading 無しの文書は entry title を Title にした単一 slide
 *
 * 各 slide の本文 placement:
 *   - paragraph / list / code-block / blockquote を縦に並べる
 *   - table は textbox に変換(pptxgenjs の table API より単純)
 *   - figure / section / if-block は中身を flatten
 *
 * 非対象(Phase 2 以降):
 *   - 画像埋め込み
 *   - footnote
 *   - math
 *   - インライン強調(strong / em)の TextRun レベル style fidelity
 */

import PptxGenJS from 'pptxgenjs';

import type {
  AstBlock,
  AstDocument,
  AstInline,
} from '@core/ast/index';

/** Slide 単位の中間 representation。 */
interface SlideDraft {
  title: string;
  /** Slide 内のテキスト行(順序保持)。 */
  lines: SlideLine[];
}

interface SlideLine {
  text: string;
  bold?: boolean;
  italic?: boolean;
  fontFace?: string;
  bullet?: boolean;
  indent?: number;
}

function inlinesToPlainText(inlines: readonly AstInline[]): string {
  const out: string[] = [];
  for (const n of inlines) {
    switch (n.kind) {
      case 'text':
        out.push(n.value);
        break;
      case 'inline-code':
        out.push(n.value);
        break;
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
      case 'ruby':
        out.push(`${n.base}(${n.rt})`);
        break;
      case 'image':
        out.push(`[${n.alt || 'image'}]`);
        break;
      case 'auto-ref':
      case 'citation':
        out.push(`@${n.id}`);
        break;
      case 'var':
        out.push(`{{${n.path}}}`);
        break;
      case 'math-inline':
        out.push(n.src);
        break;
      case 'footnote-ref':
        out.push(`[^${n.id}]`);
        break;
      case 'opaque-inline':
        out.push(n.original);
        break;
    }
  }
  return out.join('');
}

function blockToSlideLines(block: AstBlock, indent = 0): SlideLine[] {
  switch (block.kind) {
    case 'heading':
      return [{ text: inlinesToPlainText(block.children), bold: true, indent }];
    case 'paragraph':
      return [{ text: inlinesToPlainText(block.children), indent }];
    case 'quote': {
      const inner = block.children.flatMap((b) => blockToSlideLines(b, indent + 1));
      return inner.map((l) => ({ ...l, italic: true }));
    }
    case 'list': {
      const out: SlideLine[] = [];
      for (const item of block.items) {
        for (const child of item.children) {
          const lines = blockToSlideLines(child, indent + 1);
          for (const line of lines) {
            out.push({ ...line, bullet: true });
          }
        }
      }
      return out;
    }
    case 'code-block':
      return block.code.split('\n').map((line) => ({
        text: line,
        fontFace: 'Consolas',
        indent,
      }));
    case 'code-render':
      return [{ text: block.source, fontFace: 'Consolas', indent }];
    case 'break':
      return [{ text: '───────────────', indent }];
    case 'figure':
    case 'section':
    case 'if-block':
      return block.children.flatMap((b) => blockToSlideLines(b, indent));
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
          out.push(...blockToSlideLines(desc, indent + 1));
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
 * AstDocument を slide draft 配列に分割。
 *
 * 規則:
 *   - h1 が見つかったら新 slide(title = h1 のテキスト)
 *   - 最初の h1 より前の内容は untitled 先頭 slide
 *   - h1 が 1 つも無ければ entry 全体で 1 slide(title=fallback)
 */
function splitIntoSlides(ast: AstDocument, fallbackTitle: string): SlideDraft[] {
  const slides: SlideDraft[] = [];
  let current: SlideDraft | null = null;
  for (const block of ast.children) {
    if (block.kind === 'heading' && block.level === 1) {
      current = { title: inlinesToPlainText(block.children), lines: [] };
      slides.push(current);
      continue;
    }
    if (!current) {
      current = { title: fallbackTitle, lines: [] };
      slides.push(current);
    }
    current.lines.push(...blockToSlideLines(block));
  }
  if (slides.length === 0) {
    slides.push({ title: fallbackTitle, lines: [] });
  }
  return slides;
}

/**
 * AstDocument を pptx Blob に変換。
 *
 * @param ast AstDocument
 * @param opts.title file 既定 title(slide 0 / fallback 用)
 * @returns Blob(application/vnd.openxmlformats-officedocument.presentationml.presentation)
 */
export async function astToPptxBlob(
  ast: AstDocument,
  opts: { title?: string } = {},
): Promise<Blob> {
  const fallbackTitle = opts.title ?? 'PKC2 Export';
  const slides = splitIntoSlides(ast, fallbackTitle);
  const pres = new PptxGenJS();
  pres.layout = 'LAYOUT_WIDE';
  pres.title = fallbackTitle;

  for (const draft of slides) {
    const slide = pres.addSlide();
    slide.addText(draft.title, {
      x: 0.5,
      y: 0.3,
      w: 12.0,
      h: 0.8,
      fontSize: 32,
      bold: true,
      color: '363636',
    });
    if (draft.lines.length > 0) {
      const textObjects = draft.lines
        .filter((l) => l.text !== '')
        .map((line) => ({
          text: line.bullet ? '• ' + line.text : line.text,
          options: {
            fontSize: 18,
            bold: line.bold,
            italic: line.italic,
            fontFace: line.fontFace,
            // indent はインデント文字数 + 直接 indent option
            indentLevel: line.indent ?? 0,
          },
        }));
      slide.addText(textObjects, {
        x: 0.5,
        y: 1.3,
        w: 12.0,
        h: 6.0,
        valign: 'top',
      });
    }
  }

  // pptxgenjs returns Blob via writeFile / write(...): use write('blob')
  const blob = (await pres.write({ outputType: 'blob' })) as unknown as Blob;
  return blob;
}
