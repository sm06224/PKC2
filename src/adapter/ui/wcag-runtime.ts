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

const wcagAutoShift = defineFlag<boolean>('theme.wcag_auto_shift', true, {
  category: 'theme',
  description: 'WCAG AA(4.5:1)未達の背景 × 前景組合せを同系色 shift で自動補正(deterministic)。OFF で AI / user 指定の色を尊重',
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
