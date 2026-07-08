/** @vitest-environment happy-dom */
/**
 * theme.wcag_balance_app(opt-in アプリテーマ balance)の runtime テスト。
 * flag OFF で完全 no-op(既定挙動不変)、ON で失敗トークンだけ inline override
 * が焼かれ目標比へ到達すること、cache backed であることを end-to-end で確認。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { applyThemeBalanceNow, _clearThemeBalanceCacheForTests } from '@adapter/ui/wcag-runtime';
import { setContainerFlagSource } from '@adapter/flags';
import { parseColor, getContrastRatio, _clearShiftCacheForTests } from '@features/theme/wcag-contrast';

// base.css の dark 実値を stylesheet で与える(inline override 除去で base へ fallback)。
const DARK_CSS = `#pkc-root{
  --c-bg:#0d0f0a; --c-surface:#111510; --c-hover:#162010;
  --c-fg:#c8d8b0; --c-muted:#5a6e4a; --c-toc-secondary:#9ab37e;
  --c-accent:#33ff66; --c-danger:#ff4444; --c-warn:#ffaa22;
  --c-info:#3b82f6; --c-success:#33ff66;
}`;

function makeRoot(): HTMLElement {
  document.head.innerHTML = `<style>${DARK_CSS}</style>`;
  const root = document.createElement('div');
  root.id = 'pkc-root';
  root.setAttribute('data-pkc-theme', 'dark');
  document.body.appendChild(root);
  return root;
}

function ratioVs(colorStr: string, bgStr: string): number {
  return getContrastRatio(parseColor(colorStr)!, parseColor(bgStr)!);
}

beforeEach(() => {
  _clearThemeBalanceCacheForTests();
  _clearShiftCacheForTests();
  document.body.innerHTML = '';
  document.head.innerHTML = '';
  setContainerFlagSource({});
});
afterEach(() => { setContainerFlagSource({}); });

describe('theme.wcag_balance_app runtime', () => {
  it('flag OFF(既定)→ 完全 no-op(override も marker も無し)', () => {
    const root = makeRoot();
    applyThemeBalanceNow(root);
    expect(root.style.getPropertyValue('--c-muted')).toBe('');
    expect(root.hasAttribute('data-pkc-wcag-balanced')).toBe(false);
  });

  it('flag ON → 失敗トークン(muted)に override、達成済(fg)は不変', () => {
    setContainerFlagSource({ 'theme.wcag_balance_app': true, 'theme.wcag_target_ratio': 4.5 });
    const root = makeRoot();
    applyThemeBalanceNow(root);

    expect(root.getAttribute('data-pkc-wcag-balanced')).toBe('dark');
    // muted は inline override が焼かれ、最悪背景(hover)に対しても 4.5 以上
    const muted = root.style.getPropertyValue('--c-muted').trim();
    expect(muted).not.toBe('');
    expect(ratioVs(muted, '#162010')).toBeGreaterThanOrEqual(4.49);
    // body fg は達成済 → inline override は無い
    expect(root.style.getPropertyValue('--c-fg')).toBe('');
  });

  it('ON→OFF で override を撤去(CSS 既定へ復帰)', () => {
    setContainerFlagSource({ 'theme.wcag_balance_app': true, 'theme.wcag_target_ratio': 4.5 });
    const root = makeRoot();
    applyThemeBalanceNow(root);
    expect(root.style.getPropertyValue('--c-muted')).not.toBe('');

    setContainerFlagSource({ 'theme.wcag_balance_app': false });
    applyThemeBalanceNow(root);
    expect(root.style.getPropertyValue('--c-muted')).toBe('');
    expect(root.hasAttribute('data-pkc-wcag-balanced')).toBe(false);
  });

  it('cache backed:2 回目も同じ override(再計算しても決定的)', () => {
    setContainerFlagSource({ 'theme.wcag_balance_app': true, 'theme.wcag_target_ratio': 4.5 });
    const root = makeRoot();
    applyThemeBalanceNow(root);
    const first = root.style.getPropertyValue('--c-muted').trim();
    applyThemeBalanceNow(root);
    const second = root.style.getPropertyValue('--c-muted').trim();
    expect(second).toBe(first);
  });
});
