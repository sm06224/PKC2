/**
 * WCAG コントラスト DOM resolver の runtime wiring(reform-2026-05 Phase 3 PR-2T)。
 *
 * - Tier 0 flag 2 件を定義:`theme.wcag_auto_shift` / `theme.wcag_target_ratio`
 * - boot 時に initial apply、dispatcher state notify で re-apply、theme change でも re-apply
 * - 純粋 DOM walk なので render path には介入しない(独立 layer)
 */

import { defineFlag } from '../flags';
import {
  applyWcagResolverToDom,
  revertWcagShiftsInDom,
} from '../../features/theme/wcag-dom-resolver';
import {
  computeBalancedTokens,
  THEME_BALANCE_TARGETS,
} from '../../features/theme/theme-balancer';

const wcagAutoShift = defineFlag<boolean>('theme.wcag_auto_shift', true, {
  category: 'theme',
  description: 'WCAG AA(4.5:1)未達の背景 × 前景組合せを同系色 shift で自動補正(deterministic)。OFF で AI / user 指定の色を尊重',
});

const wcagBalanceApp = defineFlag<boolean>('theme.wcag_balance_app', false, {
  category: 'theme',
  description: 'アプリテーマ(--c-* トークン)自体も WCAG 目標へ同系色 balance(opt-in・既定 OFF)。ON はテーマ色をそのまま受け入れない宣言。テーマ単位に事前計算しキャッシュ、表示の都度は再計算しない',
});

const wcagTargetRatio = defineFlag<number>('theme.wcag_target_ratio', 4.5, {
  category: 'theme',
  description: 'WCAG コントラスト目標(4.5 = AA、7 = AAA)',
  range: [3, 21],
});

/** 2026-07-04(mermaid WCAG):他 module(mermaid-renderer)から同じ
 *  flag を参照するための accessor。flag 定義は本 module に一元化。 */
export function isWcagAutoShiftEnabled(): boolean {
  return wcagAutoShift();
}
export function getWcagTargetRatio(): number {
  return wcagTargetRatio();
}

/** 現在の root element scope で WCAG resolver を実行(or revert)。 */
export function applyWcagResolverNow(root?: HTMLElement): { scanned: number; shifted: number; reverted: number } {
  const target = root ?? document.querySelector<HTMLElement>('#pkc-root') ?? document.body;
  const enabled = wcagAutoShift();
  if (!enabled) {
    const reverted = revertWcagShiftsInDom(target);
    return { scanned: 0, shifted: 0, reverted };
  }
  // re-apply は revert してから再走(target ratio 変更時の対応)
  revertWcagShiftsInDom(target);
  const ratio = wcagTargetRatio();
  const result = applyWcagResolverToDom(target, { targetRatio: ratio });
  return { ...result, reverted: 0 };
}

let installed = false;

/**
 * boot 時に install。Flag change / theme change で re-apply するため
 * 必要な listener を attach。
 *
 * `dispatcher.onState` / `onEvent` は本 module から触れず、main.ts が renderer
 * 後で `applyWcagResolverNow()` を直接 call する形(疎結合)。
 *
 * 本関数は idempotent(複数回 call OK、最初の install のみ effect)。
 */
export function installWcagResolverRuntime(): () => void {
  if (installed) return () => {};
  installed = true;
  // theme change(prefers-color-scheme)で re-apply
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const onThemeChange = (): void => { applyWcagResolverNow(); };
  if (typeof mq.addEventListener === 'function') {
    mq.addEventListener('change', onThemeChange);
  } else {
    // Safari < 14
    (mq as unknown as { addListener: (fn: () => void) => void }).addListener(onThemeChange);
  }
  return () => {
    if (typeof mq.removeEventListener === 'function') {
      mq.removeEventListener('change', onThemeChange);
    } else {
      (mq as unknown as { removeListener: (fn: () => void) => void }).removeListener(onThemeChange);
    }
    installed = false;
  };
}

// ── アプリテーマトークンの WCAG balance(opt-in、theme.wcag_balance_app)──
//
// テーマは静的(dark / light の 2 種)なので、テーマ単位に balanced 値を **一度だけ**
// 計算してキャッシュする。適用は CSS 変数の setProperty のみ(コントラスト計算は
// 走らない)= 表示の都度は再計算しない、という user 要望への対応。

export function isWcagBalanceAppEnabled(): boolean {
  return wcagBalanceApp();
}

type ThemeKey = 'dark' | 'light';

/** #pkc-root の data-pkc-theme(明示) > prefers-color-scheme(auto)でテーマ確定。 */
function resolveAppTheme(root: HTMLElement): ThemeKey {
  const attr = root.getAttribute('data-pkc-theme');
  if (attr === 'dark') return 'dark';
  if (attr === 'light') return 'light';
  const win = root.ownerDocument?.defaultView;
  if (win?.matchMedia && win.matchMedia('(prefers-color-scheme: light)').matches) return 'light';
  return 'dark';
}

/** テーマ単位の balanced override cache(事前計算 = 都度計算しない)。 */
const balanceCache = new Map<ThemeKey, Record<string, string>>();

/** test / theme 定義変更時の cache 破棄。 */
export function _clearThemeBalanceCacheForTests(): void {
  balanceCache.clear();
}

function removeBalanceOverrides(root: HTMLElement): void {
  for (const { fg } of THEME_BALANCE_TARGETS) {
    root.style.removeProperty(`--${fg}`);
  }
  root.removeAttribute('data-pkc-wcag-balanced');
}

/**
 * flag ON なら現テーマのトークンを WCAG balance して #pkc-root に inline override
 * として焼く。flag OFF なら override を除去(= CSS 既定へ復帰)。
 *
 * cache HIT のときは getComputedStyle も computeBalancedTokens も走らせず、
 * setProperty のみ。cache MISS(そのテーマ初回)のときだけ base 値を読んで計算。
 */
export function applyThemeBalanceNow(root?: HTMLElement): void {
  const target = root ?? document.querySelector<HTMLElement>('#pkc-root') ?? document.body;
  if (!target) return;
  if (!wcagBalanceApp()) {
    removeBalanceOverrides(target);
    return;
  }
  const theme = resolveAppTheme(target);
  let overrides = balanceCache.get(theme);
  if (!overrides) {
    // base(CSS 既定)値を読むため、まず自前 override を除去してから getComputedStyle。
    removeBalanceOverrides(target);
    const win = target.ownerDocument?.defaultView;
    if (!win) return;
    const cs = win.getComputedStyle(target);
    const read = (token: string): string | undefined =>
      cs.getPropertyValue(`--${token}`).trim() || undefined;
    overrides = computeBalancedTokens(read, wcagTargetRatio());
    balanceCache.set(theme, overrides);
  }
  for (const [token, value] of Object.entries(overrides)) {
    target.style.setProperty(`--${token}`, value);
  }
  target.setAttribute('data-pkc-wcag-balanced', theme);
}

let balanceInstalled = false;

/**
 * theme.wcag_balance_app 用の runtime install。テーマ変化
 * (prefers-color-scheme / #pkc-root@data-pkc-theme)で re-apply。
 * flag toggle 時の再適用は main.ts が state notify 経路で applyThemeBalanceNow を
 * 呼ぶ(cache backed なので都度計算にはならない)。idempotent。
 */
export function installThemeBalanceRuntime(): () => void {
  if (balanceInstalled) return () => {};
  balanceInstalled = true;
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const onChange = (): void => { applyThemeBalanceNow(); };
  if (typeof mq.addEventListener === 'function') {
    mq.addEventListener('change', onChange);
  } else {
    (mq as unknown as { addListener: (fn: () => void) => void }).addListener(onChange);
  }
  // 明示テーマ(data-pkc-theme)切替も拾う。
  const root = document.querySelector<HTMLElement>('#pkc-root');
  let observer: MutationObserver | null = null;
  if (root && typeof MutationObserver === 'function') {
    observer = new MutationObserver(() => { applyThemeBalanceNow(root); });
    observer.observe(root, { attributes: true, attributeFilter: ['data-pkc-theme'] });
  }
  return () => {
    if (typeof mq.removeEventListener === 'function') {
      mq.removeEventListener('change', onChange);
    } else {
      (mq as unknown as { removeListener: (fn: () => void) => void }).removeListener(onChange);
    }
    observer?.disconnect();
    balanceInstalled = false;
  };
}
