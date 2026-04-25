/**
 * TOC light-mode readability — static CSS assertions.
 *
 * The right-pane TEXTLOG / TEXT TOC has three node kinds (day / log /
 * heading).  Earlier light-mode fix retargeted day/log to the
 * `--c-toc-secondary` token but the user still reported the rows read
 * as faint at the 0.72rem mono size.  This iteration:
 *
 *   1. heading rows use the strongest body-text token explicitly
 *   2. day / log rows use `--c-toc-secondary`
 *   3. the "Contents" label uses `--c-toc-secondary` (not `--c-muted`)
 *   4. the light-mode value of `--c-toc-secondary` is darkened to
 *      `#26221b` (~13:1 contrast against the #f0ebe0 beige) so
 *      hierarchy is carried by weight/size, not by color faintness
 *   5. both light-theme scopes explicitly declare `--c-text: #1a1a14`
 *      (belt-and-braces against lazy `var(--c-fg)` substitution)
 *   6. theme-scoped hard overrides pin concrete hex on the TOC link
 *      elements so any custom-property chain break cannot make the
 *      TOC fall back to a faint color
 *   7. dark-mode token definitions remain untouched (no regression)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const baseCss = readFileSync(
  resolve(__dirname, '../../src/styles/base.css'),
  'utf-8',
);

describe('TOC light-mode readability', () => {
  it('heading kind has an explicit --c-text color rule', () => {
    // Heading rows must have a dedicated selector so they don't silently
    // fall through to any less-specific default — this was the primary
    // gap the earlier fix missed.
    expect(baseCss).toMatch(
      /\.pkc-toc-item\[data-pkc-toc-kind="heading"\]\s*>\s*\.pkc-toc-link\s*\{[^}]*color:\s*var\(--c-text\)/,
    );
  });

  it('day kind uses --c-toc-secondary', () => {
    expect(baseCss).toMatch(
      /\.pkc-toc-item\[data-pkc-toc-kind="day"\]\s*>\s*\.pkc-toc-link\s*\{[^}]*color:\s*var\(--c-toc-secondary\)/,
    );
  });

  it('log kind uses --c-toc-secondary', () => {
    expect(baseCss).toMatch(
      /\.pkc-toc-item\[data-pkc-toc-kind="log"\]\s*>\s*\.pkc-toc-link\s*\{[^}]*color:\s*var\(--c-toc-secondary\)/,
    );
  });

  it('.pkc-toc-label uses --c-toc-secondary (not --c-muted)', () => {
    // The label sits directly above the log/day rows so it should
    // follow the same contrast promise rather than a softer token.
    const labelBlock = baseCss.match(/\.pkc-toc-label\s*\{[^}]*\}/);
    expect(labelBlock).not.toBeNull();
    expect(labelBlock![0]).toMatch(/color:\s*var\(--c-toc-secondary\)/);
    expect(labelBlock![0]).not.toMatch(/color:\s*var\(--c-muted\)/);
  });

  it('light media query defines --c-toc-secondary: #26221b (darker ink)', () => {
    // Locks in the ~13:1 contrast value against the #f0ebe0 beige bg.
    // The earlier #3d3830 value reads as washed-out at 0.72rem mono —
    // hierarchy is now carried by weight/size only.
    expect(baseCss).toMatch(
      /@media\s*\(prefers-color-scheme:\s*light\)\s*\{\s*:root\s*\{[\s\S]*?--c-toc-secondary:\s*#26221b/,
    );
  });

  it('manual light theme (#pkc-root[data-pkc-theme="light"]) defines --c-toc-secondary: #26221b', () => {
    expect(baseCss).toMatch(
      /#pkc-root\[data-pkc-theme="light"\]\s*\{[\s\S]*?--c-toc-secondary:\s*#26221b/,
    );
  });

  it('light media query explicitly binds --c-text: #1a1a14 (no lazy var chain)', () => {
    // Belt-and-braces: the earlier fix relied on
    // `--c-text: var(--c-fg)` resolving lazily at computed-value time,
    // which could silently break if a future refactor wrapped the TOC
    // in a container that redefined `--c-fg`.  Pin the concrete hex.
    expect(baseCss).toMatch(
      /@media\s*\(prefers-color-scheme:\s*light\)\s*\{\s*:root\s*\{[\s\S]*?--c-text:\s*#1a1a14/,
    );
  });

  it('manual light theme explicitly binds --c-text: #1a1a14', () => {
    expect(baseCss).toMatch(
      /#pkc-root\[data-pkc-theme="light"\]\s*\{[\s\S]*?--c-text:\s*#1a1a14/,
    );
  });

  it('light media query pins day/log TOC link color via hard-override hex', () => {
    // Hard override neutralises any cascade edge case
    // (`all: unset`, specificity quirks) that could leak a faint
    // inherited color into the TOC.
    expect(baseCss).toMatch(
      /@media\s*\(prefers-color-scheme:\s*light\)\s*\{[\s\S]*?\.pkc-toc-item\[data-pkc-toc-kind="log"\]\s*>\s*\.pkc-toc-link[\s\S]*?color:\s*#26221b/,
    );
  });

  it('manual light theme pins day/log TOC link color via hard-override hex', () => {
    expect(baseCss).toMatch(
      /#pkc-root\[data-pkc-theme="light"\]\s*\.pkc-toc-item\[data-pkc-toc-kind="log"\]\s*>\s*\.pkc-toc-link[\s\S]*?\{\s*color:\s*#26221b/,
    );
  });

  it('manual light theme pins heading TOC link color to body-text hex', () => {
    expect(baseCss).toMatch(
      /#pkc-root\[data-pkc-theme="light"\]\s*\.pkc-toc-item\[data-pkc-toc-kind="heading"\]\s*>\s*\.pkc-toc-link[\s\S]*?color:\s*#1a1a14/,
    );
  });

  it(':root (dark default) defines --c-toc-secondary: #9ab37e (AA pass)', () => {
    // Previously aliased to `var(--c-muted)` (#5a6e4a) which only
    // reaches ~3.3:1 against the #0d0f0a terminal bg — fails WCAG AA
    // for normal text.  Pinned to a brighter PIP-Boy green (~8.2:1)
    // so day/log/label rows are legible while still being visibly
    // "quieter" than --c-fg (#c8d8b0).
    //
    // CSS-budget maintenance (2026-04-25): the dark-theme defaults
    // are now declared via a comma-merged selector
    // `:root, #pkc-root[data-pkc-theme="dark"] { … }`, so the regex
    // must accept any selector list that starts with `:root` and
    // ends at the next `{` before reaching for the body. We still
    // pin the canonical `#9ab37e` against any `:root`-rooted block
    // that holds `--c-toc-secondary`.
    const rootBlock = baseCss.match(/:root[^{]*\{[\s\S]*?\n\}/);
    expect(rootBlock).not.toBeNull();
    expect(rootBlock![0]).toMatch(/--c-toc-secondary:\s*#9ab37e/);
  });

  it('manual dark theme (#pkc-root[data-pkc-theme="dark"]) defines --c-toc-secondary: #9ab37e', () => {
    expect(baseCss).toMatch(
      /#pkc-root\[data-pkc-theme="dark"\]\s*\{[\s\S]*?--c-toc-secondary:\s*#9ab37e/,
    );
  });

  it('dark-mode TOC secondary is no longer aliased to var(--c-muted)', () => {
    // Regression guard — an accidental revert to `var(--c-muted)`
    // would silently drop day/log rows back below WCAG AA.
    const darkBlock = baseCss.match(
      /#pkc-root\[data-pkc-theme="dark"\]\s*\{[\s\S]*?\n\}/,
    );
    expect(darkBlock).not.toBeNull();
    expect(darkBlock![0]).not.toMatch(
      /--c-toc-secondary:\s*var\(--c-muted\)/,
    );
  });
});
