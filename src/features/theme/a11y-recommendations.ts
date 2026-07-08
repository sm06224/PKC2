/**
 * アクセシビリティ推奨掲示エンジン(2026-07-08、user 要望)。
 *
 * 現テーマのトークンと WCAG balance flag の状態から、ユーザーへ提示する推奨を
 * 算出する pure function。UI(flags-inspector)がこれを読んで掲示する。
 *
 * 対象:
 *  - 乱視向けハレーション注意(純黒地 × 純白文字は高輝度がにじむ)
 *  - テーマに WCAG 未達ペアがあり balance OFF のとき、opt-in balance の提案
 */

import { parseColor, relativeLuminance } from './wcag-contrast';
import { computeBalancedTokens, type TokenReader } from './theme-balancer';

export type A11ySeverity = 'info' | 'suggest' | 'warn';

export interface A11yRecommendation {
  id: string;
  severity: A11ySeverity;
  title: string;
  detail: string;
  /** 関連 flag(あれば inspector 側で該当行へ誘導できる)。 */
  flag?: string;
}

export interface A11yContext {
  /** トークン名(`--` 抜き)→ CSS 値。 */
  read: TokenReader;
  /** WCAG 目標比。 */
  targetRatio: number;
  /** theme.wcag_balance_app の現在値。 */
  balanceEnabled: boolean;
}

/** 純白に近い(高輝度)前景の下限。 */
const HALATION_FG_LUM = 0.85;
/** 純黒に近い(低輝度)背景の上限。 */
const HALATION_BG_LUM = 0.06;

export function computeA11yRecommendations(ctx: A11yContext): A11yRecommendation[] {
  const { read, targetRatio, balanceEnabled } = ctx;
  const recs: A11yRecommendation[] = [];

  // 1) 乱視向けハレーション:純白に近い前景 × 純黒に近い背景。
  const fg = parseColor(read('c-fg') ?? '');
  const bg = parseColor(read('c-bg') ?? '');
  if (fg && bg) {
    const fgL = relativeLuminance(fg);
    const bgL = relativeLuminance(bg);
    if (fgL > HALATION_FG_LUM && bgL < HALATION_BG_LUM) {
      recs.push({
        id: 'halation',
        severity: 'warn',
        title: '乱視の方へ:純黒地 × 純白文字はハレーションを起こしやすい',
        detail:
          '高輝度の白文字は暗背景でにじんで(ハレーション)見えることがあります。' +
          '文字色を少し落とした柔らかい配色、または light テーマの利用を検討してください。',
      });
    }
  }

  // 2) WCAG 未達ペア + balance OFF → opt-in balance を提案 / ON → 有効通知。
  if (!balanceEnabled) {
    const shifts = computeBalancedTokens(read, targetRatio);
    const n = Object.keys(shifts).length;
    if (n > 0) {
      recs.push({
        id: 'balance-off',
        severity: 'suggest',
        title: `テーマに WCAG ${targetRatio}:1 未達の前景トークンが ${n} 件`,
        detail:
          'theme.wcag_balance_app を ON にすると、色相を保ったまま自動で目標コントラストへ' +
          '補正します(既定 OFF:テーマ色をそのまま尊重)。',
        flag: 'theme.wcag_balance_app',
      });
    }
  } else {
    recs.push({
      id: 'balance-on',
      severity: 'info',
      title: 'テーマ WCAG balance が有効です',
      detail: '前景トークンは目標コントラストへ自動補正されています。',
      flag: 'theme.wcag_balance_app',
    });
  }

  return recs;
}
