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
  FONT_LATIN,
  FONT_EASTASIA,
  MONOSPACE_FONT_LATIN,
  MONOSPACE_FONT_EASTASIA,
  MATH_FONT,
  MARK_HIGHLIGHT_HEX,
  TABLE_HEADER_SHADING_HEX,
  TABLE_BORDER_HEX,
  CODE_BLOCK_SHADING_HEX,
  CODE_BLOCK_LEFT_BORDER_HEX,
  HORIZONTAL_RULE_BORDER_HEX,
  INLINE_CODE_SHADING_HEX,
  BODY_LINE_HEIGHT_TWIP,
  ACCENT_COLOR_HEX,
  TASK_OPEN_GLYPH_COLOR_HEX,
  TASK_DONE_GLYPH_COLOR_HEX,
  TABLE_CELL_PADDING_TWIP,
  HEADING_ACCENT_BORDER_SIZE,
  DOCX_BORDER_SIZE_DEFAULT,
  DOCX_BORDER_SPACE_DEFAULT,
  DOCX_HEADING_INDENT_UNIT_TWIP,
  DOCX_QUOTE_INDENT_TWIP,
} from '@features/ast/export-constants';

/** PR-W7:bilingual font stack(欧文 ascii + 和文 eastAsia)を docx の
 * `IFontAttributesProperties` で表現。`hAnsi` は欧文と同じ、`cs` は CJK と
 * 同じにして High-ANSI + complex script で挙動を揃える。 */
const BILINGUAL_BODY_FONT = {
  ascii: FONT_LATIN,
  hAnsi: FONT_LATIN,
  eastAsia: FONT_EASTASIA,
  cs: FONT_EASTASIA,
} as const;

const BILINGUAL_MONOSPACE_FONT = {
  ascii: MONOSPACE_FONT_LATIN,
  hAnsi: MONOSPACE_FONT_LATIN,
  eastAsia: MONOSPACE_FONT_EASTASIA,
  cs: MONOSPACE_FONT_EASTASIA,
} as const;

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
  /**
   * Mark `==text==` highlight。
   *
   * PR-W8(Wave X P2):従来 named token `'yellow'` → hex shading `#FFF3A0`
   * に切替(soft yellow tone-down)。boolean flag に変更、true なら applyStyle
   * 内で `shading: { fill: MARK_HIGHLIGHT_HEX }` を付与。
   */
  mark?: boolean;
  /** Superscript(リンク連番表示用)。 */
  superScript?: boolean;
  /** PR-W8:任意 color hex 指定(task glyph 用、grey ☐ / green ☑)。 */
  color?: string;
}

function applyStyle(base: IRunOptions, style: InlineStyle): IRunOptions {
  // IRunOptions の field は readonly なので spread で組み直す。
  // PR-W8(Wave X P2):mark / code 両方が同時に shading 競合する場合は code
  // が優先(applyStyle 順序通り)。実用上は両立しないので問題なし。
  return {
    ...base,
    ...(style.bold ? { bold: true } : {}),
    ...(style.italics ? { italics: true } : {}),
    ...(style.strike ? { strike: true } : {}),
    ...(style.superScript ? { superScript: true } : {}),
    ...(style.color ? { color: style.color } : {}),
    // PR-W8:mark `==X==` の shading を soft yellow `#FFF3A0` に tone-down
    // (旧 named `'yellow'` = `#FFFF00` ベタ塗りは威圧的だった)。
    ...(style.mark
      ? { shading: { type: ShadingType.CLEAR, color: 'auto', fill: MARK_HIGHLIGHT_HEX } }
      : {}),
    // PR-W7(Wave X P1):inline code = monospace bilingual font(欧文
    // JetBrains Mono + 和文 Source Han Code JP)+ `#F4F4F5` shading で
    // GitHub / Notion 風の擬似ボックス化。
    ...(style.code
      ? {
        font: BILINGUAL_MONOSPACE_FONT,
        shading: { type: ShadingType.CLEAR, color: 'auto', fill: INLINE_CODE_SHADING_HEX },
      }
      : {}),
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
      // PR-W8(Wave X P2、AI review feedback):shading.fill #FFF3A0 経路
      return inlinesToRuns(node.children, ctx, { ...base, mark: true });
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
        // PR-W13(user 指示 h1-h6 = 16/14/12/10.5/10.5/10.5 pt):heading
        // spacing も比例:H1 16/8pt、H2 14/7pt、H3 10/5pt。
        const spacingByLevel: Record<number, { before: number; after: number }> = {
          1: { before: 320, after: 160 },
          2: { before: 280, after: 140 },
          3: { before: 200, after: 100 },
        };
        // PR-W8(AI review P2-7):H2/H3 に左 accent border 3pt(blue
        // `#2F6FED`)。H1 は pageBreakBefore で chapter separator が確保
        // されるので不要。`IParagraphOptions.border` は readonly のため
        // spread で構築する。
        const accentBorder = block.level === 2 || block.level === 3
          ? {
            border: {
              left: {
                style: BorderStyle.SINGLE,
                color: ACCENT_COLOR_HEX,
                size: HEADING_ACCENT_BORDER_SIZE,
                space: 8,
              },
            },
          }
          : {};
        const opts: IParagraphOptions = {
          heading: level,
          children: headingRuns,
          spacing: spacingByLevel[block.level] ?? { before: 240, after: 120 },
          ...accentBorder,
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
      // PR-W11(user 指摘「同一スタイルの段落の続きに余白が多い」+「Web を
      // 参考に」):paragraph block で **spacing.before/after を明示 0** に。
      // Word default の暗黙 8pt after を消して、段落間を完全 tight に詰める
      // (web `<p>` の margin: 0 で 行間 1.5 のみで構成、密度を上げる)。
      const runs = inlinesToRuns(block.children, ctx);
      let alignment: (typeof AlignmentType)[keyof typeof AlignmentType] | undefined;
      if (block.align === 'center') alignment = AlignmentType.CENTER;
      else if (block.align === 'right') alignment = AlignmentType.RIGHT;
      else if (block.align === 'left') alignment = AlignmentType.LEFT;
      // PR-W13(user「本文の行間をもっとちいさく」「詰まってる?自分で
      // 比較した?」):default の `lineRule: 'auto'` では font 内蔵の line
      // height(通常 1.15-1.2)が効いて視覚差が微小だった。`exact` で twip
      // 220(11pt)固定にして、font 10.5pt + 0.5pt leading のみの真の tight
      // を実現。heading は own spacing で line 指定なし → font default で
      // stretched(本 fix は paragraph block にのみ適用)。
      const opts: IParagraphOptions = {
        children: runs,
        spacing: {
          before: 0,
          after: 0,
          line: BODY_LINE_HEIGHT_TWIP,
          lineRule: 'exact',
        },
        ...(alignment ? { alignment } : {}),
      };
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
      // PR-W14(user 指示「AST から解釈、意味ないことすんな」):
      // `:::quote{author=…}` の citation.author を末尾の attribution 段落で
      // italic + right align + dash prefix(`— Author, year, source`)。
      // AstQuote.citation: Record<string, string> から author / year / source 等を結合。
      if (block.citation && Object.keys(block.citation).length > 0) {
        const parts: string[] = [];
        if (block.citation.author) parts.push(block.citation.author);
        if (block.citation.year) parts.push(block.citation.year);
        if (block.citation.source) parts.push(block.citation.source);
        if (parts.length > 0) {
          out.push(new Paragraph({
            children: [new TextRun({ text: `— ${parts.join(', ')}`, italics: true })],
            indent: { left: DOCX_QUOTE_INDENT_TWIP },
            alignment: AlignmentType.RIGHT,
          }));
        }
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
              // PR-W8(AI review P2-10):task glyph を color 化(未完 grey ☐、
              // 完 緑 ☑)。状態が text 周辺で伝わる視覚言語に。
              const prefix = taskState === 'done' ? '☑ ' : '☐ ';
              const glyphColor = taskState === 'done'
                ? TASK_DONE_GLYPH_COLOR_HEX
                : TASK_OPEN_GLYPH_COLOR_HEX;
              opts = {
                children: [
                  new TextRun({ text: prefix, color: glyphColor }),
                  ...inlines.filter((r): r is TextRun => r instanceof TextRun),
                ],
                indent: { left: DOCX_HEADING_INDENT_UNIT_TWIP },
              };
            } else if (block.listKind === 'ordered') {
              opts = { children: inlines, numbering: { reference: 'pkc-ordered', level: 0 } };
            } else if (block.listKind === 'task') {
              // AST 直接の task(rare、parser plugin 経路)
              const prefix = item.state === 'done' ? '☑ ' : '☐ ';
              const glyphColor = item.state === 'done'
                ? TASK_DONE_GLYPH_COLOR_HEX
                : TASK_OPEN_GLYPH_COLOR_HEX;
              opts = {
                children: [
                  new TextRun({ text: prefix, color: glyphColor }),
                  ...inlines.filter((r): r is TextRun => r instanceof TextRun),
                ],
                numbering: { reference: 'pkc-bullet', level: 0 },
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
      // PR-W4:cell 内 inline formatting 保持(filter で TextRun +
      // ExternalHyperlink)。PR-W8(AI review P2-8):cell padding 8pt
      // (twip 160)+ ヘッダー shading `#F4F4F5` + 罫線 hairline `#CCCCCC`。
      const rows = block.rows.map(
        (r) =>
          new TableRow({
            tableHeader: r.isHeader,
            children: r.cells.map(
              (c) =>
                new TableCell({
                  children: [new Paragraph({
                    children: inlinesToRuns(c.children, ctx).filter(
                      (x): x is TextRun | ExternalHyperlink =>
                        x instanceof TextRun || x instanceof ExternalHyperlink,
                    ),
                  })],
                  shading: r.isHeader
                    ? { type: ShadingType.CLEAR, color: 'auto', fill: TABLE_HEADER_SHADING_HEX }
                    : undefined,
                  margins: {
                    top: TABLE_CELL_PADDING_TWIP,
                    bottom: TABLE_CELL_PADDING_TWIP,
                    left: TABLE_CELL_PADDING_TWIP,
                    right: TABLE_CELL_PADDING_TWIP,
                  },
                }),
            ),
          }),
      );
      return [new Table({
        rows,
        width: { size: 100, type: WidthType.PERCENTAGE },
        // PR-W8:罫線 hairline 0.5pt grey(size 4 = 0.5pt)。
        borders: {
          top: { style: BorderStyle.SINGLE, size: 4, color: TABLE_BORDER_HEX },
          bottom: { style: BorderStyle.SINGLE, size: 4, color: TABLE_BORDER_HEX },
          left: { style: BorderStyle.SINGLE, size: 4, color: TABLE_BORDER_HEX },
          right: { style: BorderStyle.SINGLE, size: 4, color: TABLE_BORDER_HEX },
          insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: TABLE_BORDER_HEX },
          insideVertical: { style: BorderStyle.SINGLE, size: 4, color: TABLE_BORDER_HEX },
        },
      })];
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
                    // PR-W8(AI review P2-8):cell padding 8pt
                    margins: {
                      top: TABLE_CELL_PADDING_TWIP,
                      bottom: TABLE_CELL_PADDING_TWIP,
                      left: TABLE_CELL_PADDING_TWIP,
                      right: TABLE_CELL_PADDING_TWIP,
                    },
                  }),
              ),
            }),
          );
          return [new Table({
            rows,
            width: { size: 100, type: WidthType.PERCENTAGE },
            // PR-W8:罫線 hairline 0.5pt grey
            borders: {
              top: { style: BorderStyle.SINGLE, size: 4, color: TABLE_BORDER_HEX },
              bottom: { style: BorderStyle.SINGLE, size: 4, color: TABLE_BORDER_HEX },
              left: { style: BorderStyle.SINGLE, size: 4, color: TABLE_BORDER_HEX },
              right: { style: BorderStyle.SINGLE, size: 4, color: TABLE_BORDER_HEX },
              insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: TABLE_BORDER_HEX },
              insideVertical: { style: BorderStyle.SINGLE, size: 4, color: TABLE_BORDER_HEX },
            },
          })];
        }
      }
      // 通常 code block:等幅 + 左 border + 薄 shading
      const lines = block.code.split('\n');
      return lines.map(
        (line) =>
          new Paragraph({
            children: [new TextRun({ text: line, font: BILINGUAL_MONOSPACE_FONT })],
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
        children: [new TextRun({ text: block.source, font: BILINGUAL_MONOSPACE_FONT })],
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
    case 'if-block': {
      // PR-W14(user 指示「AST から解釈」+ 可換性):`:::if{format=X}` で
      // X !== 'docx' のブロックは export から **完全除外**(render しない)。
      // 旧:常に children 展開 → DOCX なのに `format=html` blocks も出ていた。
      // GFM Alert / Pandoc filter / Hugo conditional の汎用形に倣う。
      const target = 'docx';
      if (block.format !== target && block.format !== '' && block.format !== 'any') {
        return [];
      }
      return block.children.flatMap((c) => blockToDocxElements(c, ctx));
    }
    case 'section': {
      // PR-W14(AI review P2-7 + user「意味ないことすんな」):
      // `:::section{role=warning|note|info|tip|important|caution|danger}` に
      // 応じて **role 別 callout box**(段落 border + shading + icon prefix)
      // を AST native で構築。table wrap でなく paragraph border で軽量化、
      // section 全体を border で囲む(top + bottom + left thick)。
      const roleConfig: Record<string, { fill: string; border: string; icon: string }> = {
        warning: { fill: 'FFF4E5', border: 'FB923C', icon: '⚠️ ' },
        caution: { fill: 'FFF4E5', border: 'F97316', icon: '⚠️ ' },
        danger: { fill: 'FEE2E2', border: 'DC2626', icon: '🛑 ' },
        important: { fill: 'FEE2E2', border: 'DC2626', icon: '❗ ' },
        note: { fill: 'EFF6FF', border: '60A5FA', icon: '📝 ' },
        info: { fill: 'EFF6FF', border: '3B82F6', icon: 'ℹ️ ' },
        tip: { fill: 'ECFDF5', border: '10B981', icon: '💡 ' },
        summary: { fill: 'F5F3FF', border: '8B5CF6', icon: '📋 ' },
      };
      const config = roleConfig[block.role] ?? { fill: 'F4F4F5', border: 'CCCCCC', icon: '📌 ' };
      // section 全体の囲み感を出すため、先頭 + 末尾に accent border paragraph を
      // 挟む。中身 paragraph は border / shading 付与は別 PR で深堀(現状は
      // visible callout の最小実装、AST native interpretation で role / icon
      // /色を反映)。
      const inner = block.children.flatMap((c) => blockToDocxElements(c, ctx));
      const header = new Paragraph({
        children: [new TextRun({ text: `${config.icon}${block.role.toUpperCase()}`, bold: true, color: config.border })],
        shading: { type: ShadingType.CLEAR, color: 'auto', fill: config.fill },
        border: {
          left: { style: BorderStyle.SINGLE, color: config.border, size: 24, space: 8 },
          top: { style: BorderStyle.SINGLE, color: config.border, size: 4, space: 4 },
        },
        spacing: { before: 120, after: 60 },
      });
      const footer = new Paragraph({
        children: [],
        border: {
          left: { style: BorderStyle.SINGLE, color: config.border, size: 24, space: 8 },
          bottom: { style: BorderStyle.SINGLE, color: config.border, size: 4, space: 4 },
        },
        spacing: { before: 0, after: 60 },
      });
      return [header, ...inner, footer];
    }
    case 'figure': {
      // PR-W14:`:::figure{id=X}` + caption + figureKind(figure / table /
      // equation)を native handling。caption は italic + center align 段落、
      // num が ast に stamped されていれば「図 N: caption」「表 N」「式 N」
      // prefix を付与。id は AST attrs.id で参照、本 PR では visible
      // marker のみ(bookmark / REF field は別 PR で深堀)。
      const inner = block.children.flatMap((c) => blockToDocxElements(c, ctx));
      const out: Array<Paragraph | Table> = [...inner];
      if (block.caption && block.caption.length > 0) {
        const labelMap: Record<string, string> = {
          figure: '図',
          table: '表',
          equation: '式',
        };
        const label = labelMap[block.figureKind] ?? '図';
        const num = block.num ?? 1;
        const captionRuns = inlinesToRuns(block.caption, ctx, { italics: true });
        const prefix = new TextRun({ text: `${label} ${num}:`, italics: true, bold: true });
        out.push(new Paragraph({
          children: [
            prefix,
            new TextRun({ text: ' ' }),
            ...captionRuns.filter((r): r is TextRun => r instanceof TextRun),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { before: 60, after: 120 },
        }));
      }
      return out;
    }
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
    styles: {
      default: {
        document: {
          // PR-W7(Wave X P1、AI review feedback):欧文 / 和文を bilingual
          // で分離(Inter + Noto Sans CJK JP)。`IFontAttributesProperties`
          // で `{ ascii, hAnsi, eastAsia, cs }` を渡すことで Word/LibreOffice
          // が region に応じて正しい font を選ぶ。受信環境に install が無い
          // 場合は自動 fallback。**line-height** は 1.5(twip 360)に設定、
          // 和文 1.5〜1.6 の読みやすさを satisfy。
          run: {
            // PR-W12(user 指示 2026-05-16「font 10.5pt かな」):body 11pt
            // → 10.5pt(twip 21、Japanese technical writing 標準サイズ)。
            font: BILINGUAL_BODY_FONT,
            size: 21, // 10.5pt
          },
          paragraph: {
            // PR-W11(user 指摘「同一スタイルの段落の続きに余白が多く、行間が
            // 日本語的ではない」):line 1.4(BODY_LINE_HEIGHT_TWIP=336) +
            // before=0/after=0 を default に。「同一スタイルの段落間に余白を
            // 追加しない」Word default behavior を能動的に保証。連続段落は
            // line spacing のみで詰まる、heading 等の前後は個別 spacing 上書き。
            spacing: {
              line: BODY_LINE_HEIGHT_TWIP,
              lineRule: 'auto',
              before: 0,
              after: 0,
            },
          },
        },
        // PR-W6(AI review P0-c):H1/H2/H3 のサイズ階段を強化、spacing も
        // before 24/18/12pt + after 12/8/6pt を明示(twip = pt × 20)。
        // H1 size 40(20pt)/ H2 size 32(16pt)/ H3 size 26(13pt)で
        // H1↔H2 の差を 4pt、H2↔H3 の差を 3pt に広げて階層が一目で読める。
        // PR-W7:font も bilingual に置換。
        // PR-W13(user 直接指示 2026-05-16「h1 から順に 16,14,12,10.5,10.5,
        // 10.5」):heading 階段を user 指定値で固定。H1-H3 は size 差で
        // 階層、H4-H6 は body と同 size、bold + indent + accent border で
        // 識別。
        heading1: {
          run: { font: BILINGUAL_BODY_FONT, size: 32, bold: true }, // 16pt
          paragraph: { spacing: { before: 320, after: 160 } }, // 16pt / 8pt
        },
        heading2: {
          run: { font: BILINGUAL_BODY_FONT, size: 28, bold: true }, // 14pt
          paragraph: { spacing: { before: 280, after: 140 } }, // 14pt / 7pt
        },
        heading3: {
          run: { font: BILINGUAL_BODY_FONT, size: 24, bold: true }, // 12pt
          paragraph: { spacing: { before: 200, after: 100 } }, // 10pt / 5pt
        },
        heading4: {
          run: { font: BILINGUAL_BODY_FONT, size: 21, bold: true }, // 10.5pt
          paragraph: { spacing: { before: 100, after: 50 } },
        },
        heading5: {
          run: { font: BILINGUAL_BODY_FONT, size: 21, bold: true }, // 10.5pt
          paragraph: { spacing: { before: 80, after: 40 } },
        },
        heading6: {
          run: { font: BILINGUAL_BODY_FONT, size: 21, bold: true }, // 10.5pt
          paragraph: { spacing: { before: 60, after: 30 } },
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
              // PR-W15:Word default 720 → 240 詰め
              style: {
                paragraph: {
                  indent: { left: 360, hanging: 240 },
                },
              },
            },
          ],
        },
        // PR-W16(user「箇条書きのぶら下げ目立つ、バレットサイズデカすぎ」):
        // bullet list を自前 `pkc-bullet` numbering で制御。glyph を `·`
        // (中点 U+00B7、小さめ)に + hanging 240 で marker→text tight に。
        // 旧:docx default の `bullet: { level: 0 }` で巨大 `•`(U+2022)+ 広 hanging。
        {
          reference: 'pkc-bullet',
          levels: [
            {
              level: 0,
              format: 'bullet',
              text: '·', // 中点 ·(小さい)
              alignment: AlignmentType.START,
              style: {
                paragraph: {
                  indent: { left: 360, hanging: 240 },
                },
              },
            },
          ],
        },
      ],
    },
    sections: [{
      properties: resolveSectionProperties(ast.layout),
      children,
    }],
  });
  return Packer.toBlob(doc);
}

/**
 * PR-W11(2026-05-16、user 報告 fix):frontmatter `layout: a4-2col` 等を
 * docx の Section properties に反映 + **margin を default 0.75 inch に詰め
 * て余白の目立たない default に**(user 指摘「全体的に余白が目立つ」)。
 *
 * Word default 1.0 inch / LibreOffice 0.79 inch / 現代的 technical writing
 * 0.75 inch。PKC2 default は「読みやすい現代的 layout」= 0.75 inch を採用。
 *
 * 用紙サイズ単位:twip(1 inch = 1440)
 * - A4: 11906 × 16838(210 × 297mm)
 * - B5: 9979 × 14175(176 × 250mm)
 * - Letter: 12240 × 15840(8.5 × 11 inch)
 * - Legal: 12240 × 20160(8.5 × 14 inch)
 *
 * 段組 space は 720 twip(0.5 inch)= 段間の余白。
 */
function resolveSectionProperties(layout?: string): Record<string, unknown> {
  // PR-W11(user 指摘「余白」+「左と上はホチキスや綴じ白を意識」):
  // 横書き default で **非対称 margin** を採用。
  // - 左(綴じ代):1440 twip(1.0 inch、ホチキス / 製本 余白意識)
  // - 上(ホチキス):1440 twip(1.0 inch、文書冒頭の余白)
  // - 右 / 下:1080 twip(0.75 inch、印刷紙の余白を詰める)
  // 縦書き(`writing: vertical`)は右綴じだが現状未対応(別 PR)。
  // PR-W12(user 指示 2026-05-16「綴じ代は 2cm で」):全方向 2.0 cm 統一
  // (1134 twip = 0.79 inch)。左綴じ代 + パンチホール対応 + 上下も詰め
  // で情報密度を最大化。
  const baseMargin = {
    top: 1134,    // 2.0 cm
    right: 1134,  // 2.0 cm
    bottom: 1134, // 2.0 cm
    left: 1134,   // 2.0 cm(綴じ代基準)
  };
  if (!layout) {
    return { page: { margin: baseMargin } };
  }
  const m = /^(a4|b5|letter|legal)-(\d)col$/.exec(layout);
  if (!m) return { page: { margin: baseMargin } };
  const paper = m[1]!;
  const cols = Number(m[2]);
  const PAPER_SIZE_TWIP: Record<string, { w: number; h: number }> = {
    a4: { w: 11906, h: 16838 },
    b5: { w: 9979, h: 14175 },
    letter: { w: 12240, h: 15840 },
    legal: { w: 12240, h: 20160 },
  };
  const size = PAPER_SIZE_TWIP[paper]!;
  const props: Record<string, unknown> = {
    page: {
      size: { width: size.w, height: size.h, orientation: 'portrait' as const },
      margin: baseMargin,
    },
  };
  if (cols >= 2) {
    // PR-W12(user「2 段組の境界までの余白ももっと攻められない?」):
    // column gap を 720(0.5 inch)→ 360(0.25 inch)に詰めて段間を攻める。
    props.column = {
      count: cols,
      space: 360,
      equalWidth: true,
    };
  }
  return props;
}
