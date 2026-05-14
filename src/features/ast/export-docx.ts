/**
 * AST → Word(.docx)direct generator(PR-V13、2026-05-14、U3)。
 *
 * これまで PKC2 は markdown → Pandoc JSON を出力し、user が pandoc CLI で
 * .docx に変換する 2-step flow だった。本実装で **docx package を直接使い**、
 * AstDocument を 1-click で .docx Blob に変換できるようにする。
 *
 * scope(Phase 1):
 *   - heading 1〜6 → Word の Heading level
 *   - paragraph → 通常段落 + 強調(strong / em / strike / code / mark)
 *   - list(bullet / ordered / task)→ Word の bullet / numbered list
 *   - blockquote → Word の Quote style
 *   - code-block → 等幅 paragraph(monospace 風)
 *   - hr → page-break alt(横線)
 *   - table → Word table
 *
 * 非対象(Phase 2 以降):
 *   - 画像埋め込み(asset 解決 + buffer 取得)
 *   - footnote(definition は drop)
 *   - figure / section / if-block(中身展開のみ)
 *   - math(plain text fallback)
 *
 * 設計判断:
 *   - features 層(`@features/ast`)から呼ばれる pure 関数。`Document` /
 *     `Paragraph` 等 docx の class は features 層で import 可(node API でない、
 *     pure JS で blob 化可能)
 *   - `Packer.toBlob` で Blob を返す。caller(adapter)が download wire
 */

import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  AlignmentType,
  BorderStyle,
  Packer,
  type IParagraphOptions,
  type IRunOptions,
} from 'docx';

import type {
  AstBlock,
  AstDocument,
  AstInline,
} from '@core/ast/index';

const HEADING_LEVELS: Record<number, typeof HeadingLevel[keyof typeof HeadingLevel]> = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6,
};

interface InlineStyle {
  bold?: boolean;
  italics?: boolean;
  strike?: boolean;
  /** Inline code は等幅 + 薄背景。docx の TextRun の font + highlight で表現。 */
  code?: boolean;
  /** Mark は黄色 highlight。 */
  highlight?: 'yellow' | 'green' | 'cyan' | 'magenta';
}

function inlineToRuns(node: AstInline, base: InlineStyle = {}): TextRun[] {
  switch (node.kind) {
    case 'text':
      return [new TextRun(applyStyle({ text: node.value }, base))];
    case 'strong':
      return node.children.flatMap((c) => inlineToRuns(c, { ...base, bold: true }));
    case 'emphasis':
      return node.children.flatMap((c) => inlineToRuns(c, { ...base, italics: true }));
    case 'strike':
      return node.children.flatMap((c) => inlineToRuns(c, { ...base, strike: true }));
    case 'inline-code':
      return [new TextRun(applyStyle({ text: node.value, font: 'Consolas' }, { ...base, code: true }))];
    case 'mark':
      return node.children.flatMap((c) => inlineToRuns(c, { ...base, highlight: 'yellow' }));
    case 'em-dot':
      // Word に em-dot 相当が無いので emphasis で代用
      return node.children.flatMap((c) => inlineToRuns(c, { ...base, italics: true }));
    case 'sup': {
      const flat = inlinesFlatText(node.children);
      return [new TextRun(applyStyle({ text: flat, superScript: true }, base))];
    }
    case 'sub': {
      const flat = inlinesFlatText(node.children);
      return [new TextRun(applyStyle({ text: flat, subScript: true }, base))];
    }
    case 'ruby':
      // Ruby → "base(rt)" plain text fallback
      return [new TextRun(applyStyle({ text: `${node.base}(${node.rt})` }, base))];
    case 'link':
      // Word の hyperlink は別途 Hyperlink class が必要だが、簡略化のため text のみ
      return node.children.flatMap((c) => inlineToRuns(c, { ...base, italics: true }));
    case 'image':
      // Phase 2 で実装。今は alt text を出力
      return [new TextRun(applyStyle({ text: `[image: ${node.alt}]` }, base))];
    case 'card':
    case 'embed':
      return node.children.flatMap((c) => inlineToRuns(c, base));
    case 'auto-ref':
      return [new TextRun(applyStyle({ text: `@${node.id}` }, base))];
    case 'var':
      return [new TextRun(applyStyle({ text: `{{${node.path}}}` }, base))];
    case 'math-inline':
      return [new TextRun(applyStyle({ text: node.src, font: 'Cambria Math' }, base))];
    case 'comment-inline':
      return [];
    case 'footnote-ref':
      return [new TextRun(applyStyle({ text: `[^${node.id}]`, superScript: true }, base))];
    case 'opaque-inline':
      return [new TextRun(applyStyle({ text: node.original }, base))];
    case 'citation':
      return [new TextRun(applyStyle({ text: `@${node.id}`, italics: true }, base))];
    case 'span':
      return node.children.flatMap((c) => inlineToRuns(c, base));
    default: {
      const _exhaustive: never = node;
      void _exhaustive;
      return [];
    }
  }
}

function applyStyle(base: IRunOptions, style: InlineStyle): IRunOptions {
  return {
    ...base,
    bold: style.bold,
    italics: style.italics,
    strike: style.strike,
    highlight: style.highlight,
    ...(style.code ? { font: 'Consolas' } : {}),
  };
}

/** Inline 配列を flat text に再帰 reduce(sup/sub の text 抽出用)。 */
function inlinesFlatText(inlines: readonly AstInline[]): string {
  const out: string[] = [];
  for (const n of inlines) {
    if (n.kind === 'text') out.push(n.value);
    else if (n.kind === 'inline-code') out.push(n.value);
    else if ('children' in n && Array.isArray(n.children)) {
      out.push(inlinesFlatText(n.children as readonly AstInline[]));
    } else if (n.kind === 'ruby') out.push(n.base + n.rt);
    else if (n.kind === 'image') out.push(n.alt);
    else if (n.kind === 'auto-ref') out.push('@' + n.id);
    else if (n.kind === 'citation') out.push('@' + n.id);
  }
  return out.join('');
}

function blockToDocxElements(block: AstBlock): Array<Paragraph | Table> {
  switch (block.kind) {
    case 'heading': {
      const level = HEADING_LEVELS[block.level] ?? HeadingLevel.HEADING_6;
      return [
        new Paragraph({
          heading: level,
          children: block.children.flatMap((c) => inlineToRuns(c)),
        }),
      ];
    }
    case 'paragraph': {
      const children = block.children.flatMap((c) => inlineToRuns(c));
      let alignment: (typeof AlignmentType)[keyof typeof AlignmentType] | undefined;
      if (block.align === 'center') alignment = AlignmentType.CENTER;
      else if (block.align === 'right') alignment = AlignmentType.RIGHT;
      else if (block.align === 'left') alignment = AlignmentType.LEFT;
      const opts: IParagraphOptions = alignment ? { children, alignment } : { children };
      return [new Paragraph(opts)];
    }
    case 'quote': {
      const inner = block.children.flatMap(blockToDocxElements);
      // Word の quote style:左 indent + italic
      return inner.map((el) => {
        if (el instanceof Paragraph) {
          // 既存 Paragraph に indent 付け直すのは docx API 制約で再構築が必要だが、
          // 簡略化のため style 名を Quote に変更(template に Quote style がある前提)
          return new Paragraph({
            children: (el as unknown as { options?: { children?: TextRun[] } }).options?.children ?? [],
            indent: { left: 720 }, // 0.5 inch
            style: 'Quote',
          });
        }
        return el;
      });
    }
    case 'list': {
      const items: Paragraph[] = [];
      for (const item of block.items) {
        for (const child of item.children) {
          const childEls = blockToDocxElements(child);
          for (const el of childEls) {
            if (el instanceof Paragraph) {
              items.push(new Paragraph({
                children: (el as unknown as { options?: { children?: TextRun[] } }).options?.children ?? [],
                bullet: block.listKind === 'bullet' ? { level: 0 } : undefined,
                numbering: block.listKind === 'ordered' ? { reference: 'pkc-ordered', level: 0 } : undefined,
              }));
            }
          }
        }
      }
      return items;
    }
    case 'table': {
      const rows = block.rows.map(
        (r) =>
          new TableRow({
            children: r.cells.map(
              (c) =>
                new TableCell({
                  children: [new Paragraph({ children: c.children.flatMap((i) => inlineToRuns(i)) })],
                }),
            ),
          }),
      );
      return [new Table({ rows })];
    }
    case 'code-block': {
      const lines = block.code.split('\n');
      return lines.map(
        (line) =>
          new Paragraph({
            children: [new TextRun({ text: line, font: 'Consolas' })],
            border: {
              left: { style: BorderStyle.SINGLE, color: '888888', size: 6, space: 4 },
            },
          }),
      );
    }
    case 'code-render':
      return [new Paragraph({ children: [new TextRun({ text: block.source, font: 'Consolas' })] })];
    case 'break':
      return [new Paragraph({ children: [new TextRun('───────────────')] })];
    case 'figure':
    case 'section':
    case 'if-block':
      return block.children.flatMap(blockToDocxElements);
    case 'comment-block':
      return [];
    case 'blank':
      return [new Paragraph('')];
    case 'math-block':
      return [new Paragraph({ children: [new TextRun({ text: block.src, font: 'Cambria Math' })] })];
    case 'definition-list': {
      const out: Paragraph[] = [];
      for (const item of block.items) {
        out.push(new Paragraph({
          children: item.term.flatMap((c) => inlineToRuns(c, { bold: true })),
        }));
        for (const desc of item.description) {
          const descEls = blockToDocxElements(desc);
          for (const el of descEls) {
            if (el instanceof Paragraph) {
              out.push(new Paragraph({
                children: (el as unknown as { options?: { children?: TextRun[] } }).options?.children ?? [],
                indent: { left: 720 },
              }));
            }
          }
        }
      }
      return out;
    }
    case 'opaque-block':
      return [new Paragraph({ children: [new TextRun({ text: block.original })] })];
    default: {
      const _exhaustive: never = block;
      void _exhaustive;
      return [];
    }
  }
}

/**
 * AstDocument を Word .docx Blob に変換。
 * caller が `Blob` を file download(`URL.createObjectURL` + `<a download>`)する。
 */
export async function astToDocxBlob(ast: AstDocument): Promise<Blob> {
  const children: Array<Paragraph | Table> = ast.children.flatMap(blockToDocxElements);
  const doc = new Document({
    numbering: {
      config: [
        {
          reference: 'pkc-ordered',
          levels: [
            {
              level: 0,
              format: 'decimal',
              text: '%1.',
              alignment: AlignmentType.START,
            },
          ],
        },
      ],
    },
    sections: [{ children }],
  });
  return Packer.toBlob(doc);
}
