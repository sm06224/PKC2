/**
 * AST → Word(.docx)direct generator(PR-V13 ベース + PR-V19 user audit 反映)。
 *
 * これまで PKC2 は markdown → Pandoc JSON を出力し、user が pandoc CLI で
 * .docx に変換する 2-step flow だった。PR-V13 で docx package 直接生成 1-click
 * download を実装したが、user audit(2026-05-14)で 12 項目の品質問題を指摘
 * されたため本 PR-V19 で全面 rewrite。
 *
 * ## v19 で対応した user audit 項目
 *
 * 1. レイアウト崩れ → 全面修正(styles + spacing + margin)
 * 2. 勝手なフォント色変更 → 色指定排除、本文 default(自動 = 黒)
 * 3. デフォルトフォントを HTML(base.css `--font-sans: BIZ UDGothic`)に合わせる
 * 4. 画像が添付されない → container.assets から base64 image を ImageRun で埋込
 * 5. Heading numbering:H1=第N章 / H2=x.x. / H3=x.x.x. / H4=(1)(2) /
 *    H5=アイウエオ / H6=abc
 * 6. 日本語タイトルが ファイル名で `_` 化 → 日本語維持、Windows 禁止文字のみ排除
 * 7. Heading ぶら下げ離れすぎ → spacing before/after を縮小
 * 8. PKC 内リンク → 上付き括弧連番(1)(2) + appendix endnote list、外部 link
 *    はそのまま `ExternalHyperlink` で再現
 * 9. 表ヘッダーを薄い shading(`<w:shd w:fill="EEEEEE">`)
 * 10. ページ区切り(`AstBreak.breakKind === 'page'`)を Word PageBreak で反映
 * 11. H1 を自動で次ページへ(`pageBreakBefore: true`、ただし最初の H1 は除外)
 * 12. 水平線(`AstBreak.breakKind === 'rule'`)を `<w:pBdr>` border-bottom で再現
 *
 * ## 設計
 *
 * - features 層 pure 関数。`Document` / `Paragraph` 等 docx の class は
 *   features 層で import 可(node API ではない、Blob 化可能)
 * - 第 2 引数 `opts` で `container` / `entry` / `entryIndex` を受け取り、
 *   image asset 解決 + internal link 解決 + 文書 title を bind
 * - 単一 .docx Blob を返す。multi-file zip 出力(PKC 内リンク先 entry 添付)は
 *   次 PR でフォローアップ(現状は appendix 一覧で代用)
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
  PageBreak,
  ImageRun,
  ExternalHyperlink,
  ShadingType,
  WidthType,
  type IParagraphOptions,
  type IRunOptions,
} from 'docx';

import type {
  AstBlock,
  AstDocument,
  AstInline,
  AstLink,
} from '@core/ast/index';

import type { Container } from '@core/model/container';
import type { Entry } from '@core/model/record';
import { detectCsvLang, parseCsv, isHeaderDisabled } from '@features/markdown/csv-table';

/** PKC2 HTML が使う default font(`base.css --font-sans` 1st choice)。 */
const DEFAULT_FONT = 'BIZ UDGothic';

/** Heading 1〜6 の Word HeadingLevel mapping。 */
const HEADING_LEVELS: Record<number, typeof HeadingLevel[keyof typeof HeadingLevel]> = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6,
};

/** 半角全角カタカナ(H5 numbering 用、ア-ン 47 字)。 */
const KATAKANA = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン';

/** H6 numbering 用(a-z 26 字)。 */
function lowerLatin(n: number): string {
  if (n <= 0) return '?';
  if (n <= 26) return String.fromCharCode(96 + n);
  // a-z 超 → aa, bb...(spreadsheet 風は別途)
  return String.fromCharCode(96 + ((n - 1) % 26) + 1).repeat(Math.ceil(n / 26));
}

/** カタカナ index. */
function katakana(n: number): string {
  if (n <= 0 || n > KATAKANA.length) return '?';
  return KATAKANA[n - 1] ?? '?';
}

// ── Inline style ─────────────────────────────────────────

interface InlineStyle {
  bold?: boolean;
  italics?: boolean;
  strike?: boolean;
  /** Inline code = monospace font + 灰色 shading(default 色は touch しない)。 */
  code?: boolean;
  /** Mark = 黄色 highlight。 */
  highlight?: 'yellow' | 'green' | 'cyan' | 'magenta';
  /** Superscript(リンク連番表示用)。 */
  superScript?: boolean;
}

function applyStyle(base: IRunOptions, style: InlineStyle): IRunOptions {
  // IRunOptions の field は readonly なので spread で組み直す
  return {
    ...base,
    ...(style.bold ? { bold: true } : {}),
    ...(style.italics ? { italics: true } : {}),
    ...(style.strike ? { strike: true } : {}),
    ...(style.highlight ? { highlight: style.highlight } : {}),
    ...(style.superScript ? { superScript: true } : {}),
    // 色は指定しない(default = 自動 = 黒)
    ...(style.code ? { font: 'Consolas' } : {}),
  };
}

// ── Conversion context ────────────────────────────────────

interface ExportContext {
  /** Heading counter[level-1] = 現在番号。下位 level は親が増えると 0 reset。 */
  headingCounters: number[];
  /** 最初の H1 を見たか(2 件目以降の H1 だけ page break before)。 */
  seenFirstH1: boolean;
  /** Internal link (entry: / pkc://) 一覧(appendix 出力用)。 */
  internalLinks: Array<{ num: number; label: string; href: string; targetTitle?: string }>;
  /** container 内 entries(internal link の title 解決用)。 */
  entriesByLid: Map<string, Entry>;
  /** container.assets(image embed 用)。 */
  assets: Record<string, string>;
}

function newContext(opts: AstToDocxOptions): ExportContext {
  const entriesByLid = new Map<string, Entry>();
  for (const e of opts.container?.entries ?? []) entriesByLid.set(e.lid, e);
  return {
    headingCounters: [0, 0, 0, 0, 0, 0],
    seenFirstH1: false,
    internalLinks: [],
    entriesByLid,
    assets: opts.container?.assets ?? {},
  };
}

/** Heading 番号 prefix を計算 + state 更新。 */
function nextHeadingPrefix(ctx: ExportContext, level: number): string {
  if (level < 1 || level > 6) return '';
  // 自分より下の level は reset
  for (let i = level; i < 6; i++) ctx.headingCounters[i] = 0;
  // 自 level を +1
  ctx.headingCounters[level - 1] = (ctx.headingCounters[level - 1] ?? 0) + 1;
  const c = ctx.headingCounters;
  switch (level) {
    case 1: return `第${c[0]}章 `;
    case 2: return `${c[0]}.${c[1]} `;
    case 3: return `${c[0]}.${c[1]}.${c[2]} `;
    case 4: return `(${c[3]}) `;
    case 5: return `${katakana(c[4]!)} `;
    case 6: return `${lowerLatin(c[5]!)}. `;
    default: return '';
  }
}

// ── Inline → docx Run ─────────────────────────────────────

function isInternalLink(href: string): boolean {
  return (
    href.startsWith('entry:')
    || href.startsWith('pkc://')
    || href.startsWith('#log/')
    || href.startsWith('#day/')
    || href.startsWith('#')
  );
}

function extractEntryLidFromHref(href: string): string | null {
  if (href.startsWith('entry:')) {
    const rest = href.slice('entry:'.length);
    const hashIdx = rest.indexOf('#');
    return hashIdx === -1 ? rest : rest.slice(0, hashIdx);
  }
  if (href.startsWith('pkc://')) {
    const m = /^pkc:\/\/[^\/]+\/entry\/([^/?#]+)/.exec(href);
    if (m) return m[1] ?? null;
  }
  return null;
}

function imageRunForAssetSrc(src: string, ctx: ExportContext): ImageRun | null {
  let key: string | null = null;
  let mime: string | null = null;
  if (src.startsWith('asset:')) {
    key = src.slice('asset:'.length);
  } else if (src.startsWith('data:image/')) {
    const m = /^data:(image\/[^;]+);base64,(.+)$/.exec(src);
    if (m) {
      mime = m[1] ?? null;
      const base64 = m[2] ?? '';
      try {
        const buf = Buffer.from(base64, 'base64');
        return buildImageRun(buf, mime ?? 'image/png');
      } catch { return null; }
    }
  }
  if (!key) return null;
  const base64 = ctx.assets[key];
  if (!base64) return null;
  // mime を asset を所有する attachment entry から探す
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
  if (!mime) mime = 'image/png';
  try {
    const buf = Buffer.from(base64, 'base64');
    return buildImageRun(buf, mime);
  } catch { return null; }
}

function buildImageRun(data: Buffer, mime: string): ImageRun | null {
  const t = mimeToType(mime);
  const base = { data, transformation: { width: 480, height: 360 } };
  if (t === 'svg') {
    // SVG は docx の SvgMediaOptions で fallback PNG が required。
    // PKC2 では SVG 内 raster fallback を生成しないため、現状 svg は skip。
    return null;
  }
  return new ImageRun({ ...base, type: t });
}

function mimeToType(mime: string): 'png' | 'jpg' | 'gif' | 'bmp' | 'svg' {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/jpeg' || mime === 'image/jpg') return 'jpg';
  if (mime === 'image/gif') return 'gif';
  if (mime === 'image/bmp') return 'bmp';
  if (mime === 'image/svg+xml') return 'svg';
  return 'png';
}

type RunOrLink = TextRun | ExternalHyperlink | ImageRun;

function inlinesToRuns(
  inlines: readonly AstInline[],
  ctx: ExportContext,
  baseStyle: InlineStyle = {},
): RunOrLink[] {
  const out: RunOrLink[] = [];
  for (const node of inlines) out.push(...inlineToRuns(node, ctx, baseStyle));
  return out;
}

function inlineToRuns(
  node: AstInline,
  ctx: ExportContext,
  base: InlineStyle = {},
): RunOrLink[] {
  switch (node.kind) {
    case 'text':
      return [new TextRun(applyStyle({ text: node.value }, base))];
    case 'strong':
      return inlinesToRuns(node.children, ctx, { ...base, bold: true });
    case 'emphasis':
      return inlinesToRuns(node.children, ctx, { ...base, italics: true });
    case 'strike':
      return inlinesToRuns(node.children, ctx, { ...base, strike: true });
    case 'inline-code': {
      return [new TextRun(applyStyle({ text: node.value }, { ...base, code: true }))];
    }
    case 'mark':
      return inlinesToRuns(node.children, ctx, { ...base, highlight: 'yellow' });
    case 'em-dot':
      return inlinesToRuns(node.children, ctx, { ...base, italics: true });
    case 'sup':
      return inlinesToRuns(node.children, ctx, { ...base, superScript: true });
    case 'sub':
      return [new TextRun(applyStyle({ text: inlinesFlatText(node.children) }, { ...base, subScript: true } as InlineStyle & { subScript?: boolean }))];
    case 'ruby':
      return [new TextRun(applyStyle({ text: `${node.base}(${node.rt})` }, base))];
    case 'link': {
      return linkToRuns(node, ctx, base);
    }
    case 'image': {
      const img = imageRunForAssetSrc(node.src, ctx);
      if (img) return [img];
      // 解決失敗:alt の text fallback
      return [new TextRun(applyStyle({ text: node.alt || '[image]' }, base))];
    }
    case 'card':
    case 'embed':
      return inlinesToRuns(node.children, ctx, base);
    case 'auto-ref':
      return [new TextRun(applyStyle({ text: `@${node.id}` }, base))];
    case 'var':
      return [new TextRun(applyStyle({ text: `{{${node.path}}}` }, base))];
    case 'math-inline':
      return [new TextRun(applyStyle({ text: node.src }, base))];
    case 'comment-inline':
      return [];
    case 'footnote-ref':
      return [new TextRun(applyStyle({ text: `[^${node.id}]` }, { ...base, superScript: true }))];
    case 'opaque-inline':
      return [new TextRun(applyStyle({ text: node.original }, base))];
    case 'citation':
      return [new TextRun(applyStyle({ text: `@${node.id}` }, { ...base, italics: true }))];
    case 'span':
      return inlinesToRuns(node.children, ctx, base);
    default: {
      const _exhaustive: never = node;
      void _exhaustive;
      return [];
    }
  }
}

function linkToRuns(link: AstLink, ctx: ExportContext, base: InlineStyle): RunOrLink[] {
  if (isInternalLink(link.href)) {
    // PKC 内リンク → 通し番号 + label。本文中に「label⁽ᴺ⁾」を表示。
    const num = ctx.internalLinks.length + 1;
    const labelText = inlinesFlatText(link.children);
    let targetTitle: string | undefined;
    const lid = extractEntryLidFromHref(link.href);
    if (lid) {
      const entry = ctx.entriesByLid.get(lid);
      if (entry) targetTitle = entry.title || entry.lid;
    }
    ctx.internalLinks.push({ num, label: labelText, href: link.href, targetTitle });
    return [
      new TextRun(applyStyle({ text: labelText }, base)),
      new TextRun(applyStyle({ text: `(${num})` }, { ...base, superScript: true })),
    ];
  }
  // 外部 hyperlink:ExternalHyperlink で再現
  const childRuns = inlinesToRuns(link.children, ctx, { ...base, italics: false });
  // ExternalHyperlink は TextRun を expect。他の RunOrLink は捨て、TextRun のみ収集
  const textRuns = childRuns.filter((r): r is TextRun => r instanceof TextRun);
  if (textRuns.length === 0) {
    textRuns.push(new TextRun(applyStyle({ text: link.href }, base)));
  }
  return [new ExternalHyperlink({ link: link.href, children: textRuns })];
}

/**
 * PR-V19:GFM task list の検出。bullet list 内の paragraph 本文 head が
 * `[ ]` / `[x]` / `[X]` で始まれば task list item と認識(markdown-it に
 * plugin が無いため AST 上では bullet として現れる、それを補正)。
 */
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

// ── Block → docx Paragraph / Table ────────────────────────

function blockToDocxElements(block: AstBlock, ctx: ExportContext): Array<Paragraph | Table> {
  switch (block.kind) {
    case 'heading': {
      const level = HEADING_LEVELS[block.level] ?? HeadingLevel.HEADING_6;
      const prefix = nextHeadingPrefix(ctx, block.level);
      const children: RunOrLink[] = [
        new TextRun({ text: prefix, bold: true }),
        ...inlinesToRuns(block.children, ctx, { bold: true }),
      ];
      // H1 は最初を除いて page break before
      const isFirstH1 = block.level === 1 && !ctx.seenFirstH1;
      if (block.level === 1) ctx.seenFirstH1 = true;
      const opts: IParagraphOptions = {
        heading: level,
        children: children.filter((c): c is TextRun => c instanceof TextRun),
        spacing: { before: 240, after: 120 }, // 縮小したぶら下げ
      };
      if (block.level === 1 && !isFirstH1) {
        return [new Paragraph({ ...opts, pageBreakBefore: true })];
      }
      return [new Paragraph(opts)];
    }
    case 'paragraph': {
      const runs = inlinesToRuns(block.children, ctx);
      let alignment: (typeof AlignmentType)[keyof typeof AlignmentType] | undefined;
      if (block.align === 'center') alignment = AlignmentType.CENTER;
      else if (block.align === 'right') alignment = AlignmentType.RIGHT;
      else if (block.align === 'left') alignment = AlignmentType.LEFT;
      const opts: IParagraphOptions = alignment
        ? { children: runs, alignment }
        : { children: runs };
      return [new Paragraph(opts)];
    }
    case 'quote': {
      const out: Paragraph[] = [];
      for (const child of block.children) {
        if (child.kind === 'paragraph') {
          out.push(new Paragraph({
            children: inlinesToRuns(child.children, ctx),
            indent: { left: 720 },
            style: 'Quote',
          }));
          continue;
        }
        const nested = blockToDocxElements(child, ctx);
        for (const el of nested) if (el instanceof Paragraph) out.push(el);
      }
      return out;
    }
    case 'list': {
      const items: Paragraph[] = [];
      for (const item of block.items) {
        for (const child of item.children) {
          if (child.kind === 'paragraph') {
            // PR-V19:GFM task list の検出。markdown-it は plugin 無しだと
            // task 自動認識しないので、本文 head text の `[ ]` / `[x]` を見て
            // 動的に置換。
            const taskState = detectTaskState(child.children);
            const inlinesInput = taskState
              ? stripTaskPrefix(child.children)
              : child.children;
            const inlines = inlinesToRuns(inlinesInput, ctx);
            let opts: IParagraphOptions;
            if (taskState) {
              const prefix = taskState === 'done' ? '☑ ' : '☐ ';
              opts = {
                children: [new TextRun({ text: prefix }), ...inlines.filter((r): r is TextRun => r instanceof TextRun)],
                indent: { left: 360 },
              };
            } else if (block.listKind === 'ordered') {
              opts = { children: inlines, numbering: { reference: 'pkc-ordered', level: 0 } };
            } else if (block.listKind === 'task') {
              // AST 直接の task(rare、parser plugin 経路)
              const prefix = item.state === 'done' ? '☑ ' : '☐ ';
              opts = {
                children: [new TextRun({ text: prefix }), ...inlines.filter((r): r is TextRun => r instanceof TextRun)],
                bullet: { level: 0 },
              };
            } else {
              opts = { children: inlines, bullet: { level: 0 } };
            }
            items.push(new Paragraph(opts));
            continue;
          }
          const nested = blockToDocxElements(child, ctx);
          for (const el of nested) if (el instanceof Paragraph) items.push(el);
        }
      }
      return items;
    }
    case 'table': {
      const rows = block.rows.map(
        (r) =>
          new TableRow({
            tableHeader: r.isHeader, // ヘッダー行 marker
            children: r.cells.map(
              (c) =>
                new TableCell({
                  children: [new Paragraph({
                    children: inlinesToRuns(c.children, ctx).filter((x): x is TextRun => x instanceof TextRun),
                  })],
                  // PR-V19 user audit 9:ヘッダー薄 shading(`EEEEEE`)
                  shading: r.isHeader
                    ? { type: ShadingType.CLEAR, color: 'auto', fill: 'EEEEEE' }
                    : undefined,
                }),
            ),
          }),
      );
      return [new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } })];
    }
    case 'code-block': {
      // PR-V19 user audit「コードブロックの csv とかがレンダリングされてない」:
      // `lang=csv|tsv|psv` の fenced code block は parseCsv で 2D array に
      // 展開 → Word Table として render(`pkc-md-rendered-csv` の docx 版)。
      const lang = block.lang ?? '';
      const csvLang = detectCsvLang(lang);
      if (csvLang) {
        const delimiter = csvLang === 'csv' ? ',' : csvLang === 'tsv' ? '\t' : '|';
        const cells = parseCsv(block.code, delimiter);
        if (cells && cells.length > 0) {
          const noHeader = isHeaderDisabled(lang);
          const rows = cells.map((row, rIdx) =>
            new TableRow({
              tableHeader: rIdx === 0 && !noHeader,
              children: row.map(
                (cellText) =>
                  new TableCell({
                    children: [new Paragraph({
                      children: [new TextRun({ text: cellText })],
                    })],
                    shading: rIdx === 0 && !noHeader
                      ? { type: ShadingType.CLEAR, color: 'auto', fill: 'EEEEEE' }
                      : undefined,
                  }),
              ),
            }),
          );
          return [new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } })];
        }
      }
      // 通常 code block:等幅 + 左 border + 薄 shading
      const lines = block.code.split('\n');
      return lines.map(
        (line) =>
          new Paragraph({
            children: [new TextRun({ text: line, font: 'Consolas' })],
            shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F5F5F5' },
            border: {
              left: { style: BorderStyle.SINGLE, color: '888888', size: 6, space: 4 },
            },
          }),
      );
    }
    case 'code-render':
      return [new Paragraph({
        children: [new TextRun({ text: block.source, font: 'Consolas' })],
      })];
    case 'break': {
      if (block.breakKind === 'page') {
        // PR-V19 user audit 10:ページ区切り → PageBreak run
        return [new Paragraph({ children: [new PageBreak()] })];
      }
      // PR-V19 user audit 12:rule = 水平線 → border-bottom 罫線
      return [new Paragraph({
        children: [],
        border: {
          bottom: { style: BorderStyle.SINGLE, color: '666666', size: 6, space: 4 },
        },
        spacing: { before: 60, after: 60 },
      })];
    }
    case 'figure':
    case 'section':
    case 'if-block':
      return block.children.flatMap((c) => blockToDocxElements(c, ctx));
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
          children: inlinesToRuns(item.term, ctx, { bold: true }),
        }));
        for (const desc of item.description) {
          if (desc.kind === 'paragraph') {
            out.push(new Paragraph({
              children: inlinesToRuns(desc.children, ctx),
              indent: { left: 720 },
            }));
            continue;
          }
          const nested = blockToDocxElements(desc, ctx);
          for (const el of nested) if (el instanceof Paragraph) out.push(el);
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

// ── Public API ────────────────────────────────────────────

export interface AstToDocxOptions {
  /** Image asset 解決 + internal link target title 解決用。 */
  container?: Container;
  /** Document の出典 entry(title / lid)。internal link 解決の起点。 */
  entry?: Entry;
}

/**
 * AstDocument を Word .docx Blob に変換。
 *
 * caller(adapter)は `URL.createObjectURL` + `<a download>` で download wire。
 * `opts.container` を渡すと image asset + internal link target title が解決され、
 * 渡さない場合は alt text / `@id` fallback。
 */
export async function astToDocxBlob(
  ast: AstDocument,
  opts: AstToDocxOptions = {},
): Promise<Blob> {
  const ctx = newContext(opts);
  const children: Array<Paragraph | Table> = ast.children.flatMap((b) =>
    blockToDocxElements(b, ctx),
  );

  // PR-V19 user audit 8:PKC 内リンク appendix(本文末尾)
  if (ctx.internalLinks.length > 0) {
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: 'リンク先一覧', bold: true })],
      pageBreakBefore: true,
    }));
    for (const link of ctx.internalLinks) {
      const lineText =
        `(${link.num}) ${link.label}` +
        (link.targetTitle ? ` → ${link.targetTitle}` : '') +
        ` [${link.href}]`;
      children.push(new Paragraph({
        children: [new TextRun({ text: lineText })],
        indent: { left: 360 },
      }));
    }
  }

  const doc = new Document({
    // PR-V19 user audit 3:default font を HTML(BIZ UDGothic)に合わせる
    styles: {
      default: {
        document: {
          run: {
            font: DEFAULT_FONT,
            size: 22, // 11pt
          },
        },
        heading1: {
          run: { font: DEFAULT_FONT, size: 32, bold: true }, // 16pt
          paragraph: { spacing: { before: 240, after: 120 } },
        },
        heading2: {
          run: { font: DEFAULT_FONT, size: 28, bold: true }, // 14pt
          paragraph: { spacing: { before: 200, after: 100 } },
        },
        heading3: {
          run: { font: DEFAULT_FONT, size: 26, bold: true }, // 13pt
          paragraph: { spacing: { before: 160, after: 80 } },
        },
        heading4: {
          run: { font: DEFAULT_FONT, size: 24, bold: true }, // 12pt
          paragraph: { spacing: { before: 120, after: 60 } },
        },
        heading5: {
          run: { font: DEFAULT_FONT, size: 22, bold: true },
          paragraph: { spacing: { before: 100, after: 60 } },
        },
        heading6: {
          run: { font: DEFAULT_FONT, size: 22, bold: true },
          paragraph: { spacing: { before: 80, after: 60 } },
        },
      },
    },
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
