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
/**
 * PR-W8(Wave X P2、AI review feedback):従来 yellow `#FFFF00` ベタ塗りは
 * スライド / 印刷で **威圧的** と AI review 指摘。`#FFF3A0`(soft yellow)に
 * tone-down、印刷 / 紙面でも目に優しい彩度に。docx は named token から
 * `shading.fill` の hex 経路に切替。
 */
export const MARK_HIGHLIGHT_HEX = 'FFF3A0';

/**
 * 表のヘッダー行 shading(docx / pptx で共通)。
 *
 * PR-W8(Wave X P2):従来 `EEEEEE` → `F4F4F5` に統一(`INLINE_CODE_SHADING_HEX`
 * と同色)、AI review「ヘッダー行背景 `#F4F4F5`」指示に追従。
 */
export const TABLE_HEADER_SHADING_HEX = 'F4F4F5';

/** Code block の背景 shading(灰色、より薄)。docx 専用(pptx は背景 fill 未実装)。 */
export const CODE_BLOCK_SHADING_HEX = 'F5F5F5';

/** Code block の左 border 色(docx)。 */
export const CODE_BLOCK_LEFT_BORDER_HEX = '888888';

/** Horizontal rule(`AstBreak(rule)`)の border-bottom 罫線色。docx 専用。 */
export const HORIZONTAL_RULE_BORDER_HEX = '666666';

/**
 * 表の罫線色。
 *
 * PR-W8(Wave X P2、AI review feedback):従来 `888888` → `CCCCCC` の
 * hairline 0.5pt grey に変更。AI review「罫線 hairline 0.5pt grey」指示。
 */
export const TABLE_BORDER_HEX = 'CCCCCC';

/**
 * PR-W8(Wave X P2):**theme accent color**。H2/H3 の左 border / footer
 * 横線などで使う 1 色のアクセント。`#2F6FED`(青系)= modern productivity
 * tool で広く使われる accent。User が将来 theme 変更する時は本 constant を
 * 差し替えるだけで全 surface に伝播。
 */
export const ACCENT_COLOR_HEX = '2F6FED';

/**
 * PR-W8(Wave X P2):**task list glyph 色**。AI review が「未完 grey ☐、
 * 完 緑 ☑」と指示。
 */
export const TASK_OPEN_GLYPH_COLOR_HEX = '888888';
export const TASK_DONE_GLYPH_COLOR_HEX = '22C55E';

/**
 * PR-W8(Wave X P2):**table cell padding**。AI review「cell padding 8pt」
 * 指示。docx の twip 単位:160 twip = 8pt。
 */
/**
 * PR-W17(user「表の余白もひどい」):cell padding 160 twip(8pt)→ 60 twip
 * (3pt = 約 1mm)に詰める。Word default に比べてかなり tight だが、Web
 * style の dense table layout に倣う。
 */
export const TABLE_CELL_PADDING_TWIP = 60;

/**
 * PR-W8(Wave X P2):**heading accent left border**。H2/H3 の左に 3pt
 * width(docx 単位 24 = 3pt)の accent line。AI review「H2/H3 に左 border
 * 3pt のアクセントライン」指示。
 */
export const HEADING_ACCENT_BORDER_SIZE = 24; // 3pt

// ── Font tokens ───────────────────────────────────────────

/**
 * PR-W7(Wave X P1、AI review feedback):欧文 / 和文を **bilingual font
 * stack** で分離。Word/PPTX 両方で「欧文は Inter、和文は Noto Sans CJK JP」
 * を渡し、受信環境に install が無い場合は LibreOffice / Word が fallback
 * 解決する。AI review 推奨の和文 Noto Sans JP / 欧文 Inter / コード
 * JetBrains Mono / コード和文 Source Han Code JP を踏襲。
 */

/** 欧文 default body font。 */
export const FONT_LATIN = 'Inter';

/** 和文 default body font(CJK)。 */
export const FONT_EASTASIA = 'Noto Sans CJK JP';

/** 欧文 monospace。 */
export const MONOSPACE_FONT_LATIN = 'JetBrains Mono';

/** 和文 monospace(CJK)。 */
export const MONOSPACE_FONT_EASTASIA = 'Source Han Code JP';

/** 数式(math-inline / math-block)用 font。docx / pptx 共通。 */
export const MATH_FONT = 'Cambria Math';

// ── Spacing tokens(line-height / inline code shading)─────

/**
 * PR-W12 確定(2026-05-16):本文 line-height **1.0**(twip 240)= 真の
 * 0pt 寄り(行送り = font size、leading は font 内蔵に委ねる)。
 *
 * user 指示「行間はもっと詰めて」を最大限に反映。docx 単位 240 twip = 1.0、
 * `lineRule: 'auto'` で font size に応じて auto 計算、文字 overlap は font
 * 内蔵 leading で回避される(Noto Sans CJK JP は ascender / descender が
 * 自然に間隔を作る)。
 *
 * user 指示「実際の web は line-height が 0pt に近い方、読みやすさは行間
 * でなく文章の構成で担保」を受けて方針確定:
 *
 * - **line-height 1.15** = font size と行送りがほぼ同じ、文字が overlap
 *   せず読める最小値の dense range
 * - **段落間 spacing 0** を全 paragraph で明示(case 'paragraph' で
 *   `spacing: { before: 0, after: 0 }`)
 * - 読みやすさは heading hierarchy / section break / paragraph chunking で
 *   担保 ← 行間で稼がない
 *
 * 試行錯誤の履歴(user feedback driven):
 * - PR-W7:1.5(360)← 当初「web 標準」と認識
 * - PR-W11 試行 1:1.4(336)→ user 「行間が日本語的ではない」
 * - PR-W11 試行 2:1.25(300)→ user 「行間広いって」
 * - PR-W11 試行 3:1.5(360)+ spacing 0 → user 「Web は 0pt 寄り」
 * - PR-W11 確定:**1.15(276)+ spacing 0** ← 真の dense web layout
 *
 * docx 単位 = 240 twip = 1.0。`lineRule: 'auto'` で font size に応じて auto 計算。
 */
export const BODY_LINE_HEIGHT_TWIP = 220;

/**
 * PR-W7(Wave X P1、AI review feedback):inline code 背景。`#F4F4F5` は
 * GitHub / Notion / Obsidian で慣習的に使われる中性灰。`CODE_BLOCK_SHADING_HEX`
 * (= `F5F5F5`)とは別管理(inline と block で意味が異なる + 将来別 token に
 * 分岐する余地を残す)。
 */
export const INLINE_CODE_SHADING_HEX = 'F4F4F5';

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

/**
 * PR-W9(Wave X P3):pptx running footer(slide number / Chapter N)の
 * subtle grey。`#888888` で本文と区別、目立たない位置情報。
 */
export const PPTX_FOOTER_GREY_HEX = '888888';
