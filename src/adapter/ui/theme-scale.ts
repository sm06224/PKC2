/**
 * Theme scale — runtime UI multiplier (Phase 3a + 3b, 2026-05-04).
 *
 * Couples a single Tier 0 defineFlag (`theme.scale`) to the root
 * `font-size`, so every `rem`-based token in the design system
 * scales together when the user (or device-class probe) adjusts
 * the multiplier. No rebuild needed — `?pkc-flag=theme.scale=1.5`
 * or an inspector edit re-renders with the new multiplier on the
 * next render.
 *
 * Spec: docs/development/css-architecture-audit-2026-05.md §5.2
 *       (defineFlag → CSS var pipeline) + §6 Phase 3a / 3b.
 *
 * Cascade (Phase 3b):
 *
 *   1. `--theme-scale-default` is set in base.css `:root` and
 *      overridden inside `@media (pointer: coarse) and ...` blocks
 *      so device-class defaults apply automatically (mobile 0.9,
 *      tablet 0.95, desktop 1.0).
 *   2. `--theme-scale` is set HERE by `applyThemeScale()` ONLY when
 *      the flag is non-default (source = URL / Container). For the
 *      default value (1.0) we `removeProperty('--theme-scale')` so
 *      the device-class default reaches the calc() chain.
 *   3. `:root { font-size: calc(16px * var(--theme-scale,
 *      var(--theme-scale-default, 1))) }` consumes the chain.
 *
 * Key invariant: explicit user input WINS over device default. The
 * Phase 3b parity test guards both directions (default removed →
 * device default applies; explicit edit → user value applies).
 */
import { defineFlag, getRegisteredFlags } from '../flags';

/**
 * Live getter — global UI scale multiplier. Values < 1 shrink the
 * UI (denser, more content per viewport), values > 1 enlarge.
 */
export const themeScale = defineFlag<number>('theme.scale', 1.0, {
  range: [0.5, 2.0],
  category: 'ui',
  description:
    'Global UI scale multiplier (rem-based). 1.0 = default; lower shrinks the entire UI, higher enlarges. Affects all spacing / font-size tokens proportionally via root font-size cascade. Device-class default applies when this flag is at default 1.0 (Phase 3b).',
  tier: 0,
});

/**
 * Sync the resolved `theme.scale` flag value to the `--theme-scale`
 * CSS variable on `<html>`, OR remove the property entirely when
 * the flag is at its default 1.0 (so the CSS device-class default
 * `--theme-scale-default` takes effect via the calc fallback chain).
 *
 * Idempotent — safe to call from every render. No-op when running
 * outside a browser (server / test environment without
 * `document.documentElement`).
 *
 * Decision rule (Phase 3b):
 *   - flag source is `default` (1.0, no URL / Container override)
 *     → remove `--theme-scale` so device default applies
 *   - flag source is `url` or `container` (explicit user input)
 *     → set `--theme-scale` to the resolved value
 *
 * Even when the user *explicitly* sets the flag to the same numeric
 * value 1.0 from container/URL, the override path still wins —
 * because their explicit choice should override the device default
 * (e.g. an iPhone user who wants desktop-size UI sets theme.scale=1.0
 * via inspector to opt out of the mobile 0.9 default).
 */
export function applyThemeScale(): void {
  if (typeof document === 'undefined' || !document.documentElement) return;
  // Look up the registered flag descriptor by key so we can branch
  // on `source` (default / url / container). Linear scan is fine —
  // 21 Tier 0 flags as of Phase 3a.
  const descriptor = getRegisteredFlags().find((f) => f.key === 'theme.scale');
  const root = document.documentElement;
  if (!descriptor || descriptor.source === 'default') {
    // Defer to --theme-scale-default (set by media query).
    root.style.removeProperty('--theme-scale');
    return;
  }
  root.style.setProperty('--theme-scale', String(descriptor.currentValue));
}

