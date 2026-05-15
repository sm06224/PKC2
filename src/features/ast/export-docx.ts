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
import {
  isInternalLink,
  extractEntryLidFromHref,
  detectTaskState,
  stripTaskPrefix,
  base64ToUint8Array,
  resolveImageData,
} from '@features/ast/export-runs-common';
import {
  DEFAULT_FONT,
  MONOSPACE_FONT,
  MATH_FONT,
  MARK_HIGHLIGHT_NAMED,
  TABLE_HEADER_SHADING_HEX,
  CODE_BLOCK_SHADING_HEX,
  CODE_BLOCK_LEFT_BORDER_HEX,
  HORIZONTAL_RULE_BORDER_HEX,
  DOCX_BORDER_SIZE_DEFAULT,
  DOCX_BORDER_SPACE_DEFAULT,
  DOCX_HEADING_INDENT_UNIT_TWIP,
  DOCX_QUOTE_INDENT_TWIP,
} from '@features/ast/export-constants';

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
    ...(style.code ? { font: MONOSPACE_FONT } : {}),
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
  /** PR-V21:AstDocument.vars(変数展開用、`{{vars.x}}` → 値解決)。 */
  vars: Record<string, string>;
}

function newContext(ast: AstDocument, opts: AstToDocxOptions): ExportContext {
  const entriesByLid = new Map<string, Entry>();
  for (const e of opts.container?.entries ?? []) entriesByLid.set(e.lid, e);
  return {
    headingCounters: [0, 0, 0, 0, 0, 0],
    seenFirstH1: false,
    internalLinks: [],
    entriesByLid,
    assets: opts.container?.assets ?? {},
    vars: ast.vars ?? {},
  };
}

/**
 * Heading text 内に既に numbering prefix が手書きされているか判定。
 *
 * PR-W6(2026-05-15、AI review P0-a):auto-numbering と manual title が
 * 両方生きていると「第1章 第一章 …」のような二重表記が出る。markdown 側で
 * `# 第一章 …` / `## 1.1 …` / `### 1.2.3 …` のような prefix が既にある場合
 * は auto-numbering を skip して text そのまま使う。counter 自体は引き続き
 * bump(後続 sub-heading 番号の連続性を保つため)。
 *
 * 検出 pattern:
 * - L1:`第N章 ` / `第〇章 ` / `Chapter N. ` / `N章 `
 * - L2:`N.N ` / `N章N節 ` / `Section N.N ` / `N. ` の冒頭
 * - L3:`N.N.N ` / `N項 `
 * - L4:`(N) ` / `（N） `(全角)
 * - L5:カタカナ 1 字 + 空白 / `第N項 `
 * - L6:`a. ` `b. ` 等(a-z + ピリオド + 空白)
 */
function hasExistingHeadingPrefix(text: string, level: number): boolean {
  const trimmed = text.trimStart();
  switch (level) {
    case 1:
      return /^(第[一二三四五六七八九十百千0-90-9]+章|Chapter\s+\d+[.\s])/.test(trimmed);
    case 2:
      return /^\d+\.\d+\s/.test(trimmed);
    case 3:
      return /^\d+\.\d+\.\d+\s/.test(trimmed);
    case 4:
      return /^[((][0-90-9]+[))]\s/.test(trimmed);
    case 5:
      return /^[アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン]\s/.test(trimmed);
    case 6:
      return /^[a-zA-Z]\.\s/.test(trimmed);
    default:
      return false;
  }
}

/**
 * Heading counter を bump(prefix 文字列は formatHeadingPrefix で別途生成)。
 *
 * PR-W6 で `nextHeadingPrefix` から counter 操作部分を分離。markdown 側で
 * 既に prefix が手書きされている場合でも counter は bump する必要がある
 * (後続 sub-heading の連番を維持するため)。
 *
 * PR-V22 hotfix:H1 なしで H3 が来た場合 `0.0.1` という醜い prefix が出ていた。
 * 親 counter が 0 のままなら **暗黙の章スタートとして 1 に bump**、結果
 * `1.1.1` で開始。後で本物の H1 が来たら `第2章` から続く。
 */
function bumpHeadingCounter(ctx: ExportContext, level: number): void {
  if (level < 1 || level > 6) return;
  // 自分より下の counter は reset(子は親更新で fresh)
  for (let i = level; i < 6; i++) ctx.headingCounters[i] = 0;
  // 親 counter が 0 のままなら 1 に bump(暗黙の親 heading)
  for (let i = 0; i < level - 1; i++) {
    if ((ctx.headingCounters[i] ?? 0) === 0) {
      ctx.headingCounters[i] = 1;
    }
  }
  // 自分を +1
  ctx.headingCounters[level - 1] = (ctx.headingCounters[level - 1] ?? 0) + 1;
}

/** Counter 現在値から prefix 文字列を生成(side-effect なし)。 */
function formatHeadingPrefix(ctx: ExportContext, level: number): string {
  if (level < 1 || level > 6) return '';
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

function imageRunForAssetSrc(src: string, ctx: ExportContext): ImageRun | null {
  const resolved = resolveImageData(src, ctx);
  if (!resolved) return null;
  try {
    const arr = base64ToUint8Array(resolved.data);
    return buildImageRun(arr, resolved.mime);
  } catch { return null; }
}

function buildImageRun(data: Uint8Array, mime: string): ImageRun | null {
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
      return inlinesToRuns(node.children, ctx, { ...base, highlight: MARK_HIGHLIGHT_NAMED });
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
    case 'var': {
      // PR-V21(2026-05-14、user audit「変数も展開されていない」):
      // `ast.vars` から path を解決。`vars.X` 形式は `X` を key として
      // ctx.vars[X] を引く。未定義なら literal `{{...}}` で fallback。
      const path = node.path;
      const key = path.startsWith('vars.') ? path.slice('vars.'.length) : path;
      const value = ctx.vars[key];
      if (typeof value === 'string') {
        return [new TextRun(applyStyle({ text: value }, base))];
      }
      return [new TextRun(applyStyle({ text: `{{${path}}}` }, base))];
    }
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
      // PR-W6(AI review P0-a 章番号二重表記対応):heading text 内に既に
      // numbering prefix が手書きされている場合(`# 第一章 …` 等)は
      // auto-prefix を skip。counter は引き続き bump(後続 sub-heading の連番)。
      const flat = inlinesFlatText(block.children);
      bumpHeadingCounter(ctx, block.level);
      const prefix = hasExistingHeadingPrefix(flat, block.level)
        ? ''
        : formatHeadingPrefix(ctx, block.level);
      const headingRuns: TextRun[] = prefix === ''
        ? inlinesToRuns(block.children, ctx, { bold: true }).filter((r): r is TextRun => r instanceof TextRun)
        : [
          new TextRun({ text: prefix, bold: true }),
          ...inlinesToRuns(block.children, ctx, { bold: true }).filter((r): r is TextRun => r instanceof TextRun),
        ];
      // PR-V21 user audit「H4 以降は数字 hierarchy ではなく箇条書きとして
      // (1) / アイウ / abc」:H4-H6 は heading style を使わず、bullet list 風
      // 段落として render(prefix + bold + 段落 indent)。H1-H3 は heading
      // style のまま。
      if (block.level <= 3) {
        const level = HEADING_LEVELS[block.level] ?? HeadingLevel.HEADING_3;
        const isFirstH1 = block.level === 1 && !ctx.seenFirstH1;
        if (block.level === 1) ctx.seenFirstH1 = true;
        // PR-W6(AI review P0-c 見出し spacing 明示):H1 前 24pt / 後 12pt、
        // H2 前 18pt / 後 8pt、H3 前 12pt / 後 6pt(twip = pt × 20)。
        // 旧 240/120, 200/100, 160/80 から段階を強化。
        const spacingByLevel: Record<number, { before: number; after: number }> = {
          1: { before: 480, after: 240 }, // 24pt / 12pt
          2: { before: 360, after: 160 }, // 18pt / 8pt
          3: { before: 240, after: 120 }, // 12pt / 6pt
        };
        const opts: IParagraphOptions = {
          heading: level,
          children: headingRuns,
          spacing: spacingByLevel[block.level] ?? { before: 240, after: 120 },
        };
        if (block.level === 1 && !isFirstH1) {
          return [new Paragraph({ ...opts, pageBreakBefore: true })];
        }
        return [new Paragraph(opts)];
      }
      // H4 / H5 / H6 → 箇条書き形式(段落 indent + prefix + bold)。
      // H4=360 twip(0.25 inch)/ H5=720 / H6=1080 で階層 indent。
      const indentLeft = DOCX_HEADING_INDENT_UNIT_TWIP * (block.level - 3);
      return [new Paragraph({
        children: headingRuns,
        indent: { left: indentLeft },
        spacing: { before: 120, after: 60 },
      })];
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
            indent: { left: DOCX_QUOTE_INDENT_TWIP },
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
                indent: { left: DOCX_HEADING_INDENT_UNIT_TWIP },
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
      // PR-W4 fix(2026-05-15、simplify reuse agent 指摘):cell 内 inline
      // formatting(bold / italic / code / strike / mark / em-dot / sup /
      // sub / link)を保持。Paragraph.children は ParagraphChild union
      // で TextRun + ExternalHyperlink を直接受け取れる。ImageRun は
      // ParagraphChild ではないため filter で TextRun + ExternalHyperlink
      // のみ残す(画像は cell 内に出さない)。
      const rows = block.rows.map(
        (r) =>
          new TableRow({
            tableHeader: r.isHeader, // ヘッダー行 marker
            children: r.cells.map(
              (c) =>
                new TableCell({
                  children: [new Paragraph({
                    children: inlinesToRuns(c.children, ctx).filter(
                      (x): x is TextRun | ExternalHyperlink =>
                        x instanceof TextRun || x instanceof ExternalHyperlink,
                    ),
                  })],
                  // PR-V19 user audit 9:ヘッダー薄 shading(`EEEEEE`)
                  shading: r.isHeader
                    ? { type: ShadingType.CLEAR, color: 'auto', fill: TABLE_HEADER_SHADING_HEX }
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
                      ? { type: ShadingType.CLEAR, color: 'auto', fill: TABLE_HEADER_SHADING_HEX }
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
            children: [new TextRun({ text: line, font: MONOSPACE_FONT })],
            shading: { type: ShadingType.CLEAR, color: 'auto', fill: CODE_BLOCK_SHADING_HEX },
            border: {
              left: {
                style: BorderStyle.SINGLE,
                color: CODE_BLOCK_LEFT_BORDER_HEX,
                size: DOCX_BORDER_SIZE_DEFAULT,
                space: DOCX_BORDER_SPACE_DEFAULT,
              },
            },
          }),
      );
    }
    case 'code-render':
      return [new Paragraph({
        children: [new TextRun({ text: block.source, font: MONOSPACE_FONT })],
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
          bottom: {
            style: BorderStyle.SINGLE,
            color: HORIZONTAL_RULE_BORDER_HEX,
            size: DOCX_BORDER_SIZE_DEFAULT,
            space: DOCX_BORDER_SPACE_DEFAULT,
          },
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
      return [new Paragraph({ children: [new TextRun({ text: block.src, font: MATH_FONT })] })];
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
              indent: { left: DOCX_QUOTE_INDENT_TWIP },
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
  const ctx = newContext(ast, opts);
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
        indent: { left: DOCX_HEADING_INDENT_UNIT_TWIP },
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
        // PR-W6(AI review P0-c):H1/H2/H3 のサイズ階段を強化、spacing も
        // before 24/18/12pt + after 12/8/6pt を明示(twip = pt × 20)。
        // H1 size 40(20pt)/ H2 size 32(16pt)/ H3 size 26(13pt)で
        // H1↔H2 の差を 4pt → 4pt、H2↔H3 の差を 1pt → 3pt に広げて階層が
        // 一目で読めるようにする。
        heading1: {
          run: { font: DEFAULT_FONT, size: 40, bold: true }, // 20pt
          paragraph: { spacing: { before: 480, after: 240 } }, // 24pt / 12pt
        },
        heading2: {
          run: { font: DEFAULT_FONT, size: 32, bold: true }, // 16pt
          paragraph: { spacing: { before: 360, after: 160 } }, // 18pt / 8pt
        },
        heading3: {
          run: { font: DEFAULT_FONT, size: 26, bold: true }, // 13pt
          paragraph: { spacing: { before: 240, after: 120 } }, // 12pt / 6pt
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
