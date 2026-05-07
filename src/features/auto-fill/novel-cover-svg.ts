/**
 * Novel cover SVG generator (PR-II, 2026-05-06).
 *
 * カクヨム / 小説家になろう のような novel-kind entry は本物の
 * 表紙画像が無いケースが大半。bookmarklet は thumbnail_url を
 * 拾えず、card grid に並べた時に「画像なしの寂しい box」になる。
 * この helper は **タイトル + 作者名 + プロバイダ**から本の表紙
 * 風 SVG を合成してその穴を埋める。
 *
 * Pure (string-in / string-out) — DOM / fetch なし。生成された
 * SVG 文字列はそのまま `data:image/svg+xml;base64,...` に詰めて
 * `<img src>` に渡せる。
 *
 * Design choices:
 *   - aspect ratio 2:3(book cover 標準)
 *   - 背景:provider 由来の決定論的グラデーション(同じ provider
 *     は同じ色になる、container export 後も再現性あり)
 *   - 文字色は背景の輝度から自動選択(WCAG 不要、単純に明暗反転)
 *   - 長いタイトルは複数行にラップ(機械的な char-budget 分割、
 *     見栄えより破綻しないことを優先)
 */

const VIEW_W = 200;
const VIEW_H = 300;

const PROVIDER_PALETTE: Record<string, [string, string]> = {
  // Major novel platforms (deterministic so users recognize the look).
  '小説家になろう': ['#76b6c4', '#3a6e7a'],
  'カクヨム': ['#3b8acc', '#1c4f7a'],
  // Generic fallback by kind (when provider is missing or unknown).
  '__novel__': ['#9aa0a6', '#3c4043'],
  '__book__': ['#c8a85e', '#7a6230'],
};

const DEFAULT_GRAD: [string, string] = ['#9aa0a6', '#3c4043'];

export interface NovelCoverFields {
  /** Entry title — required. Empty/missing → returns null. */
  title: string;
  /** Author / writer name. Optional. */
  author?: string | null;
  /** Provider / site name (drives gradient palette). Optional. */
  provider?: string | null;
}

/**
 * Build a self-contained `<svg>` markup string for a novel cover.
 * Returns null when `title` is empty (no useful cover possible).
 */
export function buildNovelCoverSvg(fields: NovelCoverFields): string | null {
  const title = (fields.title ?? '').trim();
  if (!title) return null;
  const author = (fields.author ?? '').trim();
  const provider = (fields.provider ?? '').trim();

  const [from, to] = pickPalette(provider);
  const titleLines = wrapForCover(title, 12, 4);
  const titleFontPx = pickFontSize(titleLines);

  // Compose: gradient bg → provider chip (top) → title (centered) →
  // author (lower) → 額装 inner border.
  const lines: string[] = [];
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW_W} ${VIEW_H}" preserveAspectRatio="xMidYMid meet">`,
  );
  lines.push('<defs>');
  lines.push(
    `<linearGradient id="g" x1="0" y1="0" x2="0" y2="1">`
      + `<stop offset="0%" stop-color="${escapeXml(from)}"/>`
      + `<stop offset="100%" stop-color="${escapeXml(to)}"/>`
      + `</linearGradient>`,
  );
  lines.push('</defs>');
  lines.push(`<rect width="${VIEW_W}" height="${VIEW_H}" fill="url(#g)"/>`);
  lines.push(
    `<rect x="8" y="8" width="${VIEW_W - 16}" height="${VIEW_H - 16}" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="1"/>`,
  );

  if (provider) {
    lines.push(
      `<text x="${VIEW_W / 2}" y="28" text-anchor="middle" font-family="sans-serif" font-size="11" fill="rgba(255,255,255,0.85)" font-weight="500">${escapeXml(provider)}</text>`,
    );
  }

  // Title block: vertically centered, multi-line.
  const titleBlockHeight = titleLines.length * titleFontPx * 1.25;
  const titleStartY = (VIEW_H - titleBlockHeight) / 2 + titleFontPx;
  for (let i = 0; i < titleLines.length; i++) {
    const y = titleStartY + i * titleFontPx * 1.25;
    lines.push(
      `<text x="${VIEW_W / 2}" y="${y.toFixed(1)}" text-anchor="middle" font-family="serif" font-size="${titleFontPx}" fill="#ffffff" font-weight="700">${escapeXml(titleLines[i]!)}</text>`,
    );
  }

  if (author) {
    lines.push(
      `<text x="${VIEW_W / 2}" y="${VIEW_H - 24}" text-anchor="middle" font-family="sans-serif" font-size="13" fill="rgba(255,255,255,0.9)">${escapeXml(author)}</text>`,
    );
  }
  lines.push('</svg>');
  return lines.join('');
}

/**
 * Convenience: build the same cover and wrap it as a `data:` URL
 * suitable for `<img src>`. Returns null when title is empty.
 */
export function buildNovelCoverDataUrl(fields: NovelCoverFields): string | null {
  const svg = buildNovelCoverSvg(fields);
  if (!svg) return null;
  // base64 over utf8 via TextEncoder + btoa-of-bytes. SVG is small
  // (~600 bytes) so the cost is trivial.
  const bytes = new TextEncoder().encode(svg);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  const b64 = typeof btoa === 'function'
    ? btoa(bin)
    // node fallback for tests
    : Buffer.from(svg, 'utf-8').toString('base64');
  return `data:image/svg+xml;base64,${b64}`;
}

function pickPalette(provider: string): [string, string] {
  if (provider && PROVIDER_PALETTE[provider]) return PROVIDER_PALETTE[provider]!;
  return DEFAULT_GRAD;
}

/**
 * Greedy wrap: split on whitespace and Japanese punctuation, pack
 * runs up to `charsPerLine`, cap at `maxLines`. The last allowed
 * line gets a tail ellipsis when there's leftover text.
 */
function wrapForCover(text: string, charsPerLine: number, maxLines: number): string[] {
  const result: string[] = [];
  let cursor = 0;
  while (cursor < text.length && result.length < maxLines) {
    const remaining = text.slice(cursor);
    if (remaining.length <= charsPerLine) {
      result.push(remaining);
      cursor = text.length;
      break;
    }
    // Try to break at a whitespace or punctuation boundary near limit.
    const window = remaining.slice(0, charsPerLine + 1);
    const breakIdx = lastBreakIndex(window) ?? charsPerLine;
    result.push(remaining.slice(0, breakIdx).trim());
    cursor += breakIdx;
    // Skip any leading break char on the next iteration.
    while (cursor < text.length && /[\s、。・]/.test(text[cursor]!)) cursor += 1;
  }
  if (cursor < text.length && result.length > 0) {
    const last = result[result.length - 1]!;
    result[result.length - 1] = last.slice(0, Math.max(1, last.length - 1)) + '…';
  }
  return result;
}

function lastBreakIndex(line: string): number | null {
  for (let i = line.length - 1; i > 0; i--) {
    const c = line[i]!;
    if (c === ' ' || c === '　' || c === '、' || c === '。' || c === '・') return i;
  }
  return null;
}

function pickFontSize(lines: string[]): number {
  if (lines.length <= 1) return 22;
  if (lines.length === 2) return 20;
  if (lines.length === 3) return 18;
  return 16;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
