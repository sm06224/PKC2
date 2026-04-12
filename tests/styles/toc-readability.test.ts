/**
 * TOC light-mode readability — static CSS assertions.
 *
 * The right-pane TEXTLOG / TEXT TOC has three node kinds (day / log /
 * heading).  Earlier light-mode fix retargeted day/log to the
 * `--c-toc-secondary` token but left headings at the generic
 * `.pkc-toc-link` fallback (`--c-text, inherit`) and left the
 * "Contents" label at `--c-muted` (~4.37:1 against the warm beige
 * sidebar).  The tests below lock in:
 *
 *   1. heading rows use the strongest body-text token explicitly
 *   2. day / log rows use `--c-toc-secondary`
 *   3. the "Contents" label uses `--c-toc-secondary` (not `--c-muted`)
 *   4. the light-mode value of `--c-toc-secondary` is the
 *      WCAG-AAA-passing `#3d3830` ink
 *   5. dark-mode token definitions remain untouched (no regression)
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

  it('light media query defines --c-toc-secondary: #3d3830', () => {
    // Locks in the ~9:1 contrast value against the #f0ebe0 beige bg.
    expect(baseCss).toMatch(
      /@media\s*\(prefers-color-scheme:\s*light\)\s*\{\s*:root\s*\{[\s\S]*?--c-toc-secondary:\s*#3d3830/,
    );
  });

  it('manual light theme (#pkc-root[data-pkc-theme="light"]) defines --c-toc-secondary: #3d3830', () => {
    expect(baseCss).toMatch(
      /#pkc-root\[data-pkc-theme="light"\]\s*\{[\s\S]*?--c-toc-secondary:\s*#3d3830/,
    );
  });

  it('dark-mode token still references --c-muted (no regression)', () => {
    // Manual dark theme must keep its existing definition — we are
    // only fixing light mode here per the user report.
    expect(baseCss).toMatch(
      /#pkc-root\[data-pkc-theme="dark"\]\s*\{[\s\S]*?--c-toc-secondary:\s*var\(--c-muted\)/,
    );
  });
});
