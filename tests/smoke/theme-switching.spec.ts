/**
 * Theme switching + Color tag bar smoke — Plan 1-B (2026-04-26).
 *
 * Pin the dark/light theme cascade into `--pkc-color-tag-*` tokens
 * and the sidebar entry color bar binding, in real Chromium.
 * happy-dom cannot evaluate `getComputedStyle().getPropertyValue('--*')`
 * with media-query / attribute-selector cascades, which is why this
 * lives in smoke and not vitest.
 *
 * Covered:
 *   1. Default cascade (under emulated `prefers-color-scheme: dark`)
 *      — `:root` supplies dark hex values, the "red" hue is identical
 *      across themes (verified as a control).
 *   2. Light cascade — switching to explicit light theme via the
 *      Settings shell menu produces the darken-after-light hex
 *      (`#c2410c` for orange, per Color Slice 5.0 contract that
 *      meets WCAG 1.4.11 3:1 floor).
 *   3. Sidebar binding — applying an `orange` color via the picker
 *      surfaces a `data-pkc-color-tag="orange"` entry in the sidebar
 *      with the `.pkc-entry-color-bar` class, and the band's
 *      `border-left-color` is the live theme token (i.e. picker
 *      → sidebar wiring is real, not just attribute paint).
 *
 * NOT covered:
 *   - All 8 hues / per-hue contrast ratios (vitest pins them in
 *     `tests/features/color/color-tag-contrast.test.ts`).
 *   - Explicit "force dark when system is light" — Color Slice 5.0
 *     intentionally has no `[data-pkc-theme="dark"]` rule for
 *     `--pkc-color-tag-*` (only `:root` default + @media light
 *     + `[data-pkc-theme="light"]` explicit), so the dark button
 *     is a no-op for these tokens when system prefers light. The
 *     test pins this design via `colorScheme: 'dark'` emulation.
 *   - System theme (auto / OS-driven) — covered by emulation here
 *     plus the existing `tests/features/color/color-tag-contrast.test.ts`.
 *
 * Audit: docs/development/visual-smoke-expansion-audit-2026-04-26.md §5.B
 */
import { test, expect } from '@playwright/test';

// Color Slice 5.0 contract values — these MUST match
// `src/styles/base.css` `:root` and `[data-pkc-theme="light"]`.
const TOKEN_DARK_ORANGE = 'rgb(249, 115, 22)'; // #f97316
const TOKEN_LIGHT_ORANGE = 'rgb(194, 65, 12)'; // #c2410c
const TOKEN_RED_BOTH = 'rgb(239, 68, 68)';     // #ef4444 (red is theme-agnostic)

async function readToken(page: import('@playwright/test').Page, name: string): Promise<string> {
  return page.evaluate((tokenName) => {
    const root = document.querySelector<HTMLElement>('#pkc-root');
    if (!root) return '';
    const raw = getComputedStyle(root).getPropertyValue(tokenName).trim();
    // Force the hex literal to resolve to Chromium's normalised
    // `rgb(r, g, b)` form by routing through a probe element.
    const probe = document.createElement('span');
    probe.style.color = raw || 'transparent';
    document.body.appendChild(probe);
    const resolved = getComputedStyle(probe).color;
    probe.remove();
    return resolved;
  }, name);
}

// Pin `prefers-color-scheme` so the `:root` default block (no media
// override) supplies the dark token values. Without this, the agent
// might run with `prefers-color-scheme: light` (Chromium default in
// some headless configs) and the @media light block would shadow
// `:root` regardless of the user's manual theme choice.
test.use({ colorScheme: 'dark' });

test('theme switch cascades --pkc-color-tag tokens and sidebar bar updates', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
  });

  await page.goto('/pkc2.html', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 15_000 });

  // (1) Default cascade. With `prefers-color-scheme: dark` emulated
  // and no `data-pkc-theme` attribute set, `:root` supplies dark hex.
  expect(await readToken(page, '--pkc-color-tag-orange')).toBe(TOKEN_DARK_ORANGE);
  expect(await readToken(page, '--pkc-color-tag-red')).toBe(TOKEN_RED_BOTH);

  // Open shell menu so theme buttons mount in DOM. The shell menu is
  // a hover-window-style menu (opens standalone, not anchored to its
  // trigger button), so per the 2026-04-26 user clarification the
  // press-drag-release UX is intentionally NOT applied here — a
  // plain `.click()` toggles the menu open just like before.
  await page.locator('[data-pkc-action="toggle-shell-menu"]').first().click();
  const lightBtn = page.locator('button[data-pkc-action="set-theme"][data-pkc-theme-mode="light"]');
  await expect(lightBtn).toBeVisible();

  // (2) Switch to explicit light. `[data-pkc-theme="light"]` overrides
  // 4 hues; `red` stays the same (its base hex already meets 3:1).
  await lightBtn.click();
  await expect(shell).toHaveAttribute('data-pkc-theme', 'light', { timeout: 5_000 });
  expect(await readToken(page, '--pkc-color-tag-orange')).toBe(TOKEN_LIGHT_ORANGE);
  expect(await readToken(page, '--pkc-color-tag-red')).toBe(TOKEN_RED_BOTH);

  // Close shell menu (Escape) so it does not overlap subsequent clicks.
  await page.keyboard.press('Escape');

  // (3) Sidebar binding — create an entry, apply orange color, and
  // confirm the sidebar entry's color band uses the live (light) token.
  await page.locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing', { timeout: 5_000 });
  const saveBtn = page.locator('[data-pkc-action="commit-edit"]').first();
  const lid = await saveBtn.getAttribute('data-pkc-lid');
  expect(lid, 'commit-edit must expose the new entry lid').toBeTruthy();
  await page.locator('[data-pkc-field="title"]').first().fill('Theme switch fixture');
  await saveBtn.click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 5_000 });

  // Open color picker (trigger lives in detail title row), pick orange
  // via press-drag-release. The picker now uses macOS-style menu UX
  // (mousedown opens, drag → mouseup commits, release elsewhere
  // cancels — see action-binder `handleColorPickerMouseDown`), so a
  // plain `.click()` would open and immediately close the popover
  // without selecting a swatch. Drive the gesture explicitly via the
  // mouse API: press on the trigger, wait for the popover to render,
  // move onto the orange swatch, release.
  const pickerTrigger = page.locator('[data-pkc-action="open-color-picker"]').first();
  await expect(pickerTrigger).toBeVisible();
  const pickerBox = await pickerTrigger.boundingBox();
  if (!pickerBox) throw new Error('Color picker trigger has no bounding box');
  await page.mouse.move(
    pickerBox.x + pickerBox.width / 2,
    pickerBox.y + pickerBox.height / 2,
  );
  await page.mouse.down();
  const orangeSwatch = page.locator(
    'button[data-pkc-action="apply-color-tag"][data-pkc-color="orange"]',
  ).first();
  await expect(orangeSwatch).toBeVisible({ timeout: 5_000 });
  const orangeBox = await orangeSwatch.boundingBox();
  if (!orangeBox) throw new Error('Orange swatch has no bounding box');
  await page.mouse.move(
    orangeBox.x + orangeBox.width / 2,
    orangeBox.y + orangeBox.height / 2,
  );
  await page.mouse.up();

  // Sidebar reflects the chosen color via class + attribute. Scope to
  // `li.pkc-entry-item` so we do not match the Recent-items panel
  // (`li.pkc-recent-item`), which intentionally does NOT carry the
  // color band — that styling is reserved for the main entry list.
  const sidebarItem = page.locator(
    `[data-pkc-region="sidebar"] li.pkc-entry-item[data-pkc-lid="${lid}"]`,
  );
  await expect(sidebarItem).toHaveAttribute('data-pkc-color-tag', 'orange', { timeout: 5_000 });
  await expect(sidebarItem).toHaveClass(/pkc-entry-color-bar/);
  await expect(sidebarItem).toHaveClass(/pkc-color-orange/);

  // The band's left border resolves to the LIGHT-theme orange token —
  // i.e. picker class binding + theme cascade both fire end-to-end.
  const borderColor = await sidebarItem.evaluate((el) => getComputedStyle(el).borderLeftColor);
  expect(borderColor).toBe(TOKEN_LIGHT_ORANGE);

  expect(errors, errors.join('\n')).toEqual([]);
});

