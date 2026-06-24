/**
 * 本文(text body)を h1–h3 見出しで「節(section)」に分割する pure helper。
 * 章フォーカス編集(差し挟み)の土台:節の行範囲を算出し、その範囲だけを
 * 取り出し / 差し替えることで、全文を editor に載せずに 1 節だけ編集できる。
 *
 * Features 層 — browser API なし。
 *
 * 見出し検出は TOC(`extractHeadingsFromMarkdown`)と同じ規則に揃える:
 *   - ATX 見出し `#`〜`###`(h1–h3)のみが節の起点
 *   - fenced code block(``` / ~~~)内の `#` は無視
 *   - 先頭の YAML frontmatter(`---` … `---`)は走査対象外
 * 節の範囲は「その見出し行 〜 次の同レベル以上の見出し行の直前」(見出し
 * レベルで nest、h4+ や本文は所属節の content 扱い)。範囲は **raw body の
 * 行 index** で表現するので、`replaceSectionText` は原文の行をそのまま splice する。
 *
 * 既知の制限(MVP):`:::if{format=…}` mismatch block 内の見出しは TOC では
 * 隠れるが本 helper では検出される(行ベース・前処理省略)。一般的な見出し
 * 構成では TOC と一致する。
 */
import { makeSlugCounter } from './markdown-toc';

export interface BodySection {
  /** 0-based、h1–h3 見出しの文書順 index(UI affordance はこの index で節を指す)。 */
  index: number;
  /** 見出しレベル(1–3)。 */
  level: 1 | 2 | 3;
  /** 見出しテキスト(trim 済)。 */
  text: string;
  /** renderer と同じ slug(衝突は `-1` suffix)。 */
  slug: string;
  /** 節の開始行(見出し行、0-based、raw body)。 */
  startLine: number;
  /** 節の終了行(排他、次の同レベル以上の見出し行 or 行数)。 */
  endLine: number;
}

/** ATX 見出し h1–h3。`extractHeadingsFromMarkdown` と同一の規則。 */
const HEADING_RE = /^ {0,3}(#{1,3})\s+(.+?)\s*#*\s*$/;
/** fenced code block の開始/終了行。 */
const FENCE_RE = /^\s{0,3}(?:```|~~~)/;

/** 先頭 frontmatter の終端(closing `---` の次の行 index)。無ければ 0。 */
function frontmatterEndLine(lines: string[]): number {
  if (lines.length === 0 || lines[0]!.trim() !== '---') return 0;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]!.trim() === '---') return i + 1;
  }
  return 0; // 閉じ `---` 無し → frontmatter とみなさない
}

/** body を h1–h3 節に分割する。見出しが無ければ空配列。 */
export function extractBodySections(body: string): BodySection[] {
  if (!body) return [];
  const lines = body.split(/\r?\n/);
  const start = frontmatterEndLine(lines);
  const slugOf = makeSlugCounter();
  const heads: Array<{ level: 1 | 2 | 3; text: string; slug: string; startLine: number }> = [];
  let inFence = false;
  for (let i = start; i < lines.length; i++) {
    const line = lines[i]!;
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = HEADING_RE.exec(line);
    if (!m) continue;
    const text = m[2]!.trim();
    if (!text) continue;
    const level = m[1]!.length as 1 | 2 | 3;
    heads.push({ level, text, slug: slugOf(text), startLine: i });
  }
  return heads.map((h, idx) => {
    let endLine = lines.length;
    for (let j = idx + 1; j < heads.length; j++) {
      if (heads[j]!.level <= h.level) {
        endLine = heads[j]!.startLine;
        break;
      }
    }
    return { index: idx, level: h.level, text: h.text, slug: h.slug, startLine: h.startLine, endLine };
  });
}

/** 指定節の原文テキスト(見出し行 〜 endLine 直前)を返す。 */
export function getSectionText(body: string, section: BodySection): string {
  const lines = body.split(/\r?\n/);
  return lines.slice(section.startLine, section.endLine).join('\n');
}

/**
 * 指定節を `newSectionText` で差し替えた body を返す(該当行範囲のみ splice、
 * 他の節・preamble・frontmatter は不変)。`section` は差し替え時点の body を
 * `extractBodySections` し直したものを渡すこと(stale index 回避)。
 */
export function replaceSectionText(
  body: string,
  section: BodySection,
  newSectionText: string,
): string {
  const lines = body.split(/\r?\n/);
  const before = lines.slice(0, section.startLine);
  const after = lines.slice(section.endLine);
  const mid = newSectionText.split(/\r?\n/);
  return [...before, ...mid, ...after].join('\n');
}
