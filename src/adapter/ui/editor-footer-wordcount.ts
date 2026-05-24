// Editor footer wordcount(MASTER.md §7 text、pgc-125 wave-δ #1)。
//
// `shell.editor_footer_wordcount_enabled` flag ON 時に renderer から call。
// text / textlog 編集中の editor 末尾に compact metrics row を append:
//
//   📊  N chars · M words · L lines
//
// Inspector Style tab(pgc-118)が meta pane で読み取り専用 metrics を見せる
// のに対し、本 footer は **editor 内で完結する目線移動最小の動線** ──
// Notion / Bear / Typora 流の wordcount footer。
//
// 注:本 PR は static render のみ(textarea 入力に追従しない)。live update
// は後続 PR で textarea input event を hook して実装。

import type { Entry } from '../../core/model/record';
import { stripNoiseForWordcount } from '../../features/wordcount/wordcount-strip';
import { textWordcountExcludeNoiseEnabled } from './shell-flags';

/**
 * 標準的な読書速度(英語 ~200 wpm、日本語 ~600 char/min)。pgc-127 wave-δ
 * #3:wordcount footer に read time 推定を追加(reading-time 互換)。
 * 日本語(CJK)文字数 vs 英語 word count の双方を考慮した hybrid 計算で、
 * `max(英語 wpm 換算、CJK 文字 cpm 換算)` を読み時間とする(より大きい方が
 * 「実際の読み時間」に近い、混在 doc も妥当)。
 */
const WORDS_PER_MINUTE = 200;
const CJK_CHARS_PER_MINUTE = 600;

export function estimateReadTimeMinutes(body: string): number {
  if (!body) return 0;
  const wordCount = body.trim() === '' ? 0 : body.trim().split(/\s+/).length;
  // CJK 文字数(Unicode の代表的 CJK Unified Ideographs / Hiragana / Katakana 範囲)
  const cjkCount = (body.match(/[぀-ゟ゠-ヿ一-鿿]/g) ?? []).length;
  const wordMinutes = wordCount / WORDS_PER_MINUTE;
  const cjkMinutes = cjkCount / CJK_CHARS_PER_MINUTE;
  return Math.max(wordMinutes, cjkMinutes);
}

/** 読み時間を user-facing な短い文字列に整形:"~1 min" / "~3 min" / "<1 min"。 */
export function formatReadTime(minutes: number): string {
  if (minutes <= 0) return '<1 min';
  if (minutes < 1) return '<1 min';
  return `~${Math.round(minutes)} min read`;
}

export function buildEditorFooterWordcount(entry: Entry): HTMLElement {
  const footer = document.createElement('div');
  footer.className = 'pkc-editor-footer-wordcount';
  footer.setAttribute('data-pkc-region', 'editor-footer-wordcount');
  footer.setAttribute('aria-label', 'Editor metrics');

  const icon = document.createElement('span');
  icon.className = 'pkc-editor-footer-icon';
  icon.textContent = '📊';
  footer.appendChild(icon);

  const rawBody = entry.body ?? '';
  // pgc-151 wave-δ #20:flag ON で fenced code / inline code / image /
  // footnote / HTML を strip した prose のみを count 対象に。line count
  // は stripNoiseForWordcount が空行 placeholder を残すので body 分割
  // 数は不変、char / word / read-time だけ prose 純度に振れる。
  const excludeNoise = textWordcountExcludeNoiseEnabled();
  const proseBody = excludeNoise ? stripNoiseForWordcount(rawBody) : rawBody;
  const charCount = proseBody.length;
  const lineCount = rawBody === '' ? 0 : rawBody.split('\n').length;
  const wordCount = proseBody.trim() === '' ? 0 : proseBody.trim().split(/\s+/).length;
  const readMinutes = estimateReadTimeMinutes(proseBody);

  const metrics = document.createElement('span');
  metrics.className = 'pkc-editor-footer-metrics';
  metrics.setAttribute('data-pkc-char-count', String(charCount));
  metrics.setAttribute('data-pkc-word-count', String(wordCount));
  metrics.setAttribute('data-pkc-line-count', String(lineCount));
  metrics.setAttribute('data-pkc-read-minutes', readMinutes.toFixed(2));
  if (excludeNoise) metrics.setAttribute('data-pkc-noise-excluded', 'true');
  const noiseMark = excludeNoise ? '✂ prose only · ' : '';
  metrics.textContent = `${noiseMark}${charCount} chars · ${wordCount} words · ${lineCount} lines · ${formatReadTime(readMinutes)}`;
  footer.appendChild(metrics);

  return footer;
}
