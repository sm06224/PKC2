/**
 * docx / pptx export 経路で使う magic string / 数値の集約 constants。
 *
 * PR #433 simplify reuse agent 指摘(2026-05-15):docx / pptx 両方で同じ
 * 16 進カラー / font 名 / 罫線 size がそれぞれの file 内に hardcode されており、
 * theme / branding 切替の足場が無い + 値が drift する誘因が残る。
 *
 * 本 file に集約することで:
 * 1. user が「ハイライト色を黄→緑に変えたい」「コードフォントを Cascadia に
 *    したい」と要求した時 1 箇所変更で済む
 * 2. 値の意図が name で語られる(`'FFFF00'` より `MARK_HIGHLIGHT_HEX` が
 *    意味伝達上強い)
 * 3. CHANGELOG / About entry で「色 token 変更可能」と明示できる
 *
 * 各 constant は **HEX 大文字 6 桁(`#` なし)** を採用。docx の
 * `ShadingType.fill` と pptx の `color` / `fill` API がそれぞれ `'FFFF00'`
 * 形式を期待するため、両 format で同じ値が writable。
 */

// ── Color tokens(HEX 6 桁、`#` なし)──────────────────────

/**
 * Mark hightlight 用 yellow。`==mark==` 構文の地色。
 *
 * docx は `IRunOptions.highlight: 'yellow' | ...` の named token を使うが、
 * pptx は free-form HEX を期待するため、両者で値が一致しない。
 * pptx 側で `MARK_HIGHLIGHT_HEX`、docx 側で `MARK_HIGHLIGHT_NAMED` を export。
 */
export const MARK_HIGHLIGHT_HEX = 'FFFF00';

/** docx の named highlight(`'yellow'`)。`MARK_HIGHLIGHT_HEX` の docx 対応値。 */
export const MARK_HIGHLIGHT_NAMED = 'yellow' as const;

/** 表のヘッダー行 shading(灰色、薄)。docx / pptx で共通。 */
export const TABLE_HEADER_SHADING_HEX = 'EEEEEE';

/** Code block の背景 shading(灰色、より薄)。docx 専用(pptx は背景 fill 未実装)。 */
export const CODE_BLOCK_SHADING_HEX = 'F5F5F5';

/** Code block の左 border 色(docx)/ 表の罫線色(pptx)。 */
export const CODE_BLOCK_LEFT_BORDER_HEX = '888888';

/** Horizontal rule(`AstBreak(rule)`)の border-bottom 罫線色。docx 専用。 */
export const HORIZONTAL_RULE_BORDER_HEX = '666666';

/** 表の罫線色(pptx の `slide.addTable` border)。`CODE_BLOCK_LEFT_BORDER_HEX` と一致するが意味は異なる。 */
export const TABLE_BORDER_HEX = '888888';

// ── Font tokens ───────────────────────────────────────────

/**
 * PKC2 HTML が使う default font。`base.css --font-sans` の 1st choice。
 *
 * docx の `Document.styles.default.document.run.font` で全文書 default として
 * 適用。HTML / Web 表示と Word 出力でフォント統一感を出すため。
 */
export const DEFAULT_FONT = 'BIZ UDGothic';

/** Inline code / code block の monospace font。docx / pptx 共通。 */
export const MONOSPACE_FONT = 'Consolas';

/** 数式(math-inline / math-block)用 font。docx / pptx 共通。 */
export const MATH_FONT = 'Cambria Math';

// ── Numeric tokens(現状 docx 側のみ。pptx は inch ベースで分離)────────

/** docx の borderSize default(eighth of a point = 1/8 pt、6 = 0.75 pt)。 */
export const DOCX_BORDER_SIZE_DEFAULT = 6;

/** docx の border space default(twentieth of a point = 1/20 pt、4 = 0.2 pt)。 */
export const DOCX_BORDER_SPACE_DEFAULT = 4;

/** docx の H4-H6 階層 indent 単位(twip、360 = 0.25 inch)。 */
export const DOCX_HEADING_INDENT_UNIT_TWIP = 360;

/** docx の quote / list 標準 indent(twip、720 = 0.5 inch)。 */
export const DOCX_QUOTE_INDENT_TWIP = 720;

/** pptx の slide 横幅(LAYOUT_WIDE = 13.333 inch、本文 area は 12 inch)。 */
export const PPTX_BODY_WIDTH_INCH = 12.0;

/** pptx の table border thickness(pt)。 */
export const PPTX_TABLE_BORDER_PT = 0.5;
