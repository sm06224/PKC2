/**
 * Theme scale — runtime UI multiplier (Phase 3a, 2026-05-04).
 *
 * Couples a single Tier 0 defineFlag (`theme.scale`) to the root
 * `font-size`, so every `rem`-based token in the design system
 * scales together when the user (or device-class probe in Phase 3b)
 * adjusts the multiplier. No rebuild needed — `?pkc-flag=theme.scale=1.5`
 * or an inspector edit re-renders with the new multiplier on the
 * next render.
 *
 * Spec: docs/development/css-architecture-audit-2026-05.md §5.2
 *       (defineFlag → CSS var pipeline) + §6 Phase 3a.
 *
 * Pipeline:
 *   1. defineFlag declares the flag with default 1.0 and 0.5-2.0 range
 *   2. `applyThemeScale()` writes the resolved value to
 *      `document.documentElement.style.--theme-scale`
 *   3. `:root { font-size: calc(16px * var(--theme-scale, 1)) }` in
 *      base.css cascades to every rem-based value (so all
 *      `--space-*` and `--fs-*` tokens scale automatically without
 *      per-token calc wrappers).
 *
 * The `var(--theme-scale, 1)` fallback in CSS keeps the resting
 * state correct even before JS init runs (covers SSR, partial
 * hydration, and the one-frame window before `applyThemeScale` is
 * called for the first time).
 */
import { defineFlag } from '../flags';

/**
 * Live getter — global UI scale multiplier. Values < 1 shrink the
 * UI (denser, more content per viewport), values > 1 enlarge.
 *
 * Used by `applyThemeScale()` to push the resolved value into the
 * `--theme-scale` CSS variable on `<html>`. Range is bounded so
 * accidental inspector edits cannot push the UI to unreadable
 * extremes.
 */
export const themeScale = defineFlag<number>('theme.scale', 1.0, {
  range: [0.5, 2.0],
  category: 'ui',
  description:
    'Global UI scale multiplier (rem-based). 1.0 = default; lower shrinks the entire UI, higher enlarges. Affects all spacing / font-size tokens proportionally via root font-size cascade.',
  tier: 0,
});

/**
 * Sync the resolved `theme.scale` flag value to the `--theme-scale`
 * CSS variable on `<html>`. Idempotent — safe to call from every
 * render. No-op when running outside a browser (server / test
 * environment without `document.documentElement`).
 *
 * Called from `applySystemSettings` in `renderer.ts` so it runs on
 * every render path that updates root attributes.
 */
export function applyThemeScale(): void {
  if (typeof document === 'undefined' || !document.documentElement) return;
  document.documentElement.style.setProperty(
    '--theme-scale',
    String(themeScale()),
  );
}
