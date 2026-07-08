/**
 * アクセシビリティ推奨エンジンの unit test。
 */
import { describe, it, expect } from 'vitest';
import { computeA11yRecommendations } from '@features/theme/a11y-recommendations';

// PKC2 dark 実値(柔らかい緑・純白/純黒ではない)。
const DARK: Record<string, string> = {
  'c-bg': '#0d0f0a', 'c-surface': '#111510', 'c-hover': '#162010',
  'c-fg': '#c8d8b0', 'c-muted': '#5a6e4a', 'c-toc-secondary': '#9ab37e',
  'c-accent': '#33ff66', 'c-danger': '#ff4444', 'c-warn': '#ffaa22',
  'c-info': '#3b82f6', 'c-success': '#33ff66',
};
// 純白 × 純黒(ハレーション想定)。
const PURE: Record<string, string> = { ...DARK, 'c-bg': '#000000', 'c-fg': '#ffffff' };

const reader = (m: Record<string, string>) => (t: string): string | undefined => m[t];

describe('computeA11yRecommendations', () => {
  it('純黒地×純白文字 → 乱視ハレーション warn を掲示', () => {
    const recs = computeA11yRecommendations({ read: reader(PURE), targetRatio: 4.5, balanceEnabled: false });
    const halation = recs.find((r) => r.id === 'halation');
    expect(halation).toBeDefined();
    expect(halation!.severity).toBe('warn');
  });

  it('PKC2 dark(柔らか緑 on 近黒)→ ハレーション warn は出ない', () => {
    const recs = computeA11yRecommendations({ read: reader(DARK), targetRatio: 4.5, balanceEnabled: false });
    expect(recs.find((r) => r.id === 'halation')).toBeUndefined();
  });

  it('WCAG 未達あり + balance OFF → 有効化提案(flag 付き、件数一致)', () => {
    const recs = computeA11yRecommendations({ read: reader(DARK), targetRatio: 4.5, balanceEnabled: false });
    const suggest = recs.find((r) => r.id === 'balance-off');
    expect(suggest).toBeDefined();
    expect(suggest!.severity).toBe('suggest');
    expect(suggest!.flag).toBe('theme.wcag_balance_app');
    // dark は muted 等が未達なので件数 ≥ 1
    expect(suggest!.title).toMatch(/未達の前景トークンが \d+ 件/);
  });

  it('balance ON → info 通知、提案は出さない', () => {
    const recs = computeA11yRecommendations({ read: reader(DARK), targetRatio: 4.5, balanceEnabled: true });
    expect(recs.find((r) => r.id === 'balance-on')?.severity).toBe('info');
    expect(recs.find((r) => r.id === 'balance-off')).toBeUndefined();
  });
});
