/**
 * Rich-paste(Word / ONLYOFFICE / Gmail / Slack 等)向けの HTML 変換。
 *
 * Rich-paste 先の rendering engine は **inline `style="..."` 属性のみ読む**ことが
 * 多く、`<link>` / external CSS / class-based style / `data-pkc-*` 等の custom
 * attribute は無視する(Word / ONLYOFFICE で 2026-05-08 user 確認、ほとんどの
 * 書式が落ちる症状の root cause)。
 *
 * 本変換は PKC2 の renderMarkdown が emit する HTML を、PKC 独自の class / data
 * 属性を **inline style に複製** した形に書き換える。data 属性自体は **残す**
 * (round-trip / 再 import のため)。
 *
 * 対象:
 *   - L-5 align prefix:`<p data-pkc-align="X">` → 同 + `style="text-align: X"`
 *   - L-9 indent:`<p data-pkc-indent="1">` → 同 + `style="text-indent: 1em"`
 *     L-5 + L-9 併用は style に両方入れる
 *   - L-2 highlight:`<mark>` → `<mark style="background-color: #fff59d">`
 *   - L-2 em-dot:`<em class="pkc-em-dot">` → `<em style="font-style: normal;
 *     -webkit-text-emphasis: filled dot; text-emphasis: filled dot;">`
 *   - L-1 section break:`<hr class="pkc-section-break">` → `<hr style="...">`
 *   - L-8 blank-line:`<div class="pkc-blank-line" data-pkc-blank-count="N">`
 *     → portable な `<p>&nbsp;</p>` の N 個並びに変換(Word の paragraph break
 *     と等価で、空行 1 つぶんの vertical space)
 *   - L-7 figure caption:`<figcaption class="pkc-fig-caption">` →
 *     `<figcaption style="text-align: center; font-size: 0.9em; color: #6b7280">`
 *   - 既存 `style="..."`(L-6 simple-inline)は inline 既出のため触らない
 *
 * 変換しないもの:
 *   - `<ruby>` / `<rt>` — 標準 HTML、Word 等は ruby tag を理解する
 *   - `<table>` / `<th>` / `<td>` — 標準 HTML
 *   - `<strong>` / `<em>`(em-dot 以外)/ `<a>` / `<code>` 等 — 標準
 */

const ALIGN_RE = /<p\b([^>]*?)\sdata-pkc-align="(center|right|left)"([^>]*)>/g;
const INDENT_RE = /<p\b([^>]*?)\sdata-pkc-indent="1"([^>]*)>/g;
const ALIGN_INDENT_RE =
  /<p\b([^>]*?)\sdata-pkc-align="(center|right|left)"([^>]*?)\sdata-pkc-indent="1"([^>]*)>/g;
const MARK_RE = /<mark(?!\s)/g;  // bare `<mark>` 限定(既に attr 付きはそのまま)
const EM_DOT_RE = /<em class="pkc-em-dot">/g;
const SECTION_BREAK_RE = /<hr class="pkc-section-break"([^>]*?)>/g;
const BLANK_LINE_RE =
  /<div class="pkc-blank-line"[^>]*data-pkc-blank-count="(\d+)"[^>]*><\/div>/g;
const FIG_CAPTION_RE = /<figcaption class="pkc-fig-caption"([^>]*?)>/g;

const STYLE_FOR_BLANK = '<p style="margin: 0;">&nbsp;</p>';

/**
 * Inline-style 化した HTML を返す。元の data-pkc-* / class 属性は round-trip
 * 用に残置(再 import 時に PKC 拡張として再認識可能)。
 */
export function htmlForRichCopy(html: string): string {
  let out = html;

  // L-5 + L-9 併用(順序は align → indent の順で markup 化されるので対応)
  out = out.replace(
    ALIGN_INDENT_RE,
    (_match, before, align, mid, after) =>
      `<p${before} data-pkc-align="${align as string}"${mid} data-pkc-indent="1"${after} style="text-align: ${align as string}; text-indent: 1em;">`,
  );

  // L-5 align のみ
  out = out.replace(
    ALIGN_RE,
    (_match, before, align, after) =>
      `<p${before} data-pkc-align="${align as string}"${after} style="text-align: ${align as string};">`,
  );

  // L-9 indent のみ
  out = out.replace(
    INDENT_RE,
    (_match, before, after) =>
      `<p${before} data-pkc-indent="1"${after} style="text-indent: 1em;">`,
  );

  // L-2 highlight: <mark> に inline bg 追加(ONLYOFFICE / Word で背景色を確実に維持)
  out = out.replace(MARK_RE, '<mark style="background-color: #fff59d;"');

  // L-2 em-dot: text-emphasis を inline で。app が text-emphasis 未対応の場合
  // でも<em>として太字斜体相当が出るので minimum graceful fallback。
  out = out.replace(
    EM_DOT_RE,
    '<em class="pkc-em-dot" style="font-style: normal; -webkit-text-emphasis: filled dot; text-emphasis: filled dot;">',
  );

  // L-1 section break: 単なる横線で互換性保持
  out = out.replace(
    SECTION_BREAK_RE,
    (_match, attrs) =>
      `<hr class="pkc-section-break"${attrs as string} style="border: none; border-top: 1px solid #d1d5db; margin: 1.5em 0;">`,
  );

  // L-8 blank-line: rich-paste 先で <div height: Nem> は無視されることが多い。
  // <p>&nbsp;</p> を N 個並べると Word / ONLYOFFICE の段落単位 paragraph
  // separator として認識されて確実に余白が出る。
  out = out.replace(
    BLANK_LINE_RE,
    (_match, count) => STYLE_FOR_BLANK.repeat(Math.max(1, parseInt(count as string, 10))),
  );

  // L-7 figure caption
  out = out.replace(
    FIG_CAPTION_RE,
    (_match, attrs) =>
      `<figcaption class="pkc-fig-caption"${attrs as string} style="text-align: center; font-size: 0.9em; color: #6b7280; margin-top: 0.4em;">`,
  );

  return out;
}
