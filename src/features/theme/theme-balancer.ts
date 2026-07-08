/**
 * アプリテーマトークンの WCAG auto-balance(2026-07-08、opt-in)。
 *
 * ユーザー留意点(user, 2026-07-08):「WCAG オートバランシングはテーマ色を
 * そのまま受け入れない宣言でもある」。したがって本機構は **opt-in(flag 既定
 * OFF)**。ON のときだけ、app の `--c-*` 前景トークンを、それが実際に載る背景の
 * うち **最悪コントラストの側** に対して 4.5:1 まで同系色 shift(色相・彩度は保つ)。
 *
 * pure function。テーマは静的(dark / light の 2 種、トークン集合は固定)なので
 * 呼び出し側でテーマ単位に memo でき、表示の都度は再計算しない設計。
 *
 * v1 scope:前景 on 背景の text トークンのみ。`*-fg`(色バッジ上の白/黒文字)は
 * fg が極値(#fff / #000)で片側探索が効かず、バッジ色側の再設計が要るため v1 は
 * 対象外(将来 opt-in)。
 */

import {
  parseColor,
  rgbToString,
  getContrastRatio,
  shiftFgToContrast,
  type RGB,
} from './wcag-contrast';

/** 前景トークン → それが載りうる背景トークン群(最悪側で判定)。 */
export interface BalanceTarget {
  /** shift 対象の前景トークン名(`--` を除いた CSS 変数名)。 */
  fg: string;
  /** 前景が描かれる背景トークン名の候補(最も contrast の低い側で目標判定)。 */
  bgs: string[];
}

export const THEME_BALANCE_TARGETS: BalanceTarget[] = [
  { fg: 'c-fg', bgs: ['c-bg', 'c-surface', 'c-hover'] },
  { fg: 'c-muted', bgs: ['c-bg', 'c-surface', 'c-hover'] },
  { fg: 'c-toc-secondary', bgs: ['c-bg', 'c-surface'] },
  { fg: 'c-accent', bgs: ['c-bg', 'c-surface', 'c-hover'] },
  { fg: 'c-danger', bgs: ['c-bg', 'c-surface'] },
  { fg: 'c-warn', bgs: ['c-bg', 'c-surface'] },
  { fg: 'c-info', bgs: ['c-bg', 'c-surface'] },
  { fg: 'c-success', bgs: ['c-bg', 'c-surface'] },
];

/** balancer の入力:トークン名 → 現 CSS 値(色文字列)。解決不能は undefined。 */
export type TokenReader = (token: string) => string | undefined;

/**
 * 現テーマのトークン値を読み、目標未達の前景トークンだけ shift 済み値を返す。
 * 戻り値は `{ 'c-muted': 'rgb(...)' }` の override map(達成済みトークンは含まない)。
 *
 * @param read       トークン名 → CSS 値
 * @param targetRatio 目標コントラスト(既定 4.5 = AA)
 */
export function computeBalancedTokens(
  read: TokenReader,
  targetRatio = 4.5,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const { fg, bgs } of THEME_BALANCE_TARGETS) {
    const fgc = parseColor(read(fg) ?? '');
    if (!fgc) continue;
    // 最悪(最小 ratio)の背景を選ぶ。
    let worstBg: RGB | null = null;
    let worstRatio = Infinity;
    for (const bgName of bgs) {
      const bgc = parseColor(read(bgName) ?? '');
      if (!bgc) continue;
      const r = getContrastRatio(fgc, bgc);
      if (r < worstRatio) {
        worstRatio = r;
        worstBg = bgc;
      }
    }
    if (!worstBg || worstRatio >= targetRatio) continue;
    const shifted = shiftFgToContrast(fgc, worstBg, targetRatio);
    if (shifted.applied) out[fg] = rgbToString(shifted.fg);
  }
  return out;
}
