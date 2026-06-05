/**
 * Wordcount noise stripper(pgc-151 wave-δ #20、handoff §3.5 ベース改善)。
 *
 * pure features 層。editor footer の wordcount を「prose のみ」 で計算
 * する用途に向け、code block / inline code / image alt / footnote ref /
 * HTML tag 等の noise を body から除去する。
 *
 * 計算結果は consumer(editor-footer-wordcount adapter)が
 * char / word / line / read-time 算出に直接渡せる string を返す。
 * flag `text.wordcount_exclude_noise_enabled` ON 時のみ呼ばれる
 * 想定(default OFF で従来挙動 = body 全体を count)。
 */

/** Sentinel character used internally during stripping (newline-safe placeholder). */
const NOISE_SENTINEL = ' ';

export interface StripOptions {
  /** Strip fenced code blocks(``` / ~~~)including the fences themselves. Default true. */
  fencedCode?: boolean;
  /** Strip inline code (`X`)— keep surrounding text. Default true. */
  inlineCode?: boolean;
  /** Strip `![alt](src)` image markup entirely (alt is rarely prose). Default true. */
  imageMarkup?: boolean;
  /** Strip `[^id]` footnote ref tokens. Default true. */
  footnoteRefs?: boolean;
  /** Strip `<tag>...</tag>` HTML markup wrapper (text content kept). Default true. */
  htmlTags?: boolean;
}

const DEFAULT_OPTIONS: Required<StripOptions> = {
  fencedCode: true,
  inlineCode: true,
  imageMarkup: true,
  footnoteRefs: true,
  htmlTags: true,
};

/**
 * Remove non-prose tokens from `body` while preserving line count
 * (fenced code blocks collapse to empty lines so callers using
 * `body.split('\n').length` see the same number of lines as the
 * source — line count is a structural property, not a prose metric).
 */
export function stripNoiseForWordcount(
  body: string,
  options: StripOptions = {},
): string {
  if (typeof body !== 'string' || body === '') return body;
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let out = body;

  if (opts.fencedCode) {
    out = collapseFencedCode(out);
  }
  if (opts.inlineCode) {
    out = out.replace(/`([^`\n]+)`/g, NOISE_SENTINEL);
  }
  if (opts.imageMarkup) {
    out = out.replace(/!\[[^\]\n]*\]\([^)\n]*\)/g, NOISE_SENTINEL);
  }
  if (opts.footnoteRefs) {
    out = out.replace(/\[\^[A-Za-z0-9_-]+\]/g, NOISE_SENTINEL);
  }
  if (opts.htmlTags) {
    out = out.replace(/<\/?[A-Za-z][^>\n]*>/g, NOISE_SENTINEL);
  }

  return out;
}

/**
 * Replace each line inside a fenced code block(``` or ~~~)with an
 * empty string. Fence boundary lines are also emptied. Preserves line
 * count(blank lines stay as `''` so `split('\n').length` unchanged).
 */
function collapseFencedCode(body: string): string {
  const lines = body.split('\n');
  const out: string[] = [];
  let inFence = false;
  let fenceMarker = '';
  for (const line of lines) {
    if (inFence) {
      if (line.trim().startsWith(fenceMarker)) {
        inFence = false;
        fenceMarker = '';
        out.push('');
      } else {
        out.push('');
      }
      continue;
    }
    const m = line.match(/^(\s*)(```|~~~)/);
    if (m && m[2] !== undefined) {
      inFence = true;
      fenceMarker = m[2];
      out.push('');
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}
