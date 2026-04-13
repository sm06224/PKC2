/**
 * TEXTLOG viewer — day heading / separator / finishing polish.
 *
 * Pins the CSS contract for:
 *   - day heading legibility (0.95rem, weight 600, --c-fg color,
 *     mono family, letter-spacing)
 *   - chapter-break margin between day sections
 *   - dashed inter-log separator (softer than the solid day underline
 *     so the visual hierarchy reads solid > dashed = day > log)
 *   - document gap 1.25rem (matches rendered-viewer)
 *   - entry-window parity (same values in the popped window)
 *   - rendered-viewer print regression (break-inside: avoid on day
 *     and log so a day/log does not split across pages)
 *
 * These tests are static text-contract assertions — they read the
 * source CSS / TS files and check for literal declarations. Layout
 * correctness itself (what happens in a real browser) is not tested
 * here; that is a visual concern.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const baseCss = readFileSync(
  resolve(__dirname, '../../src/styles/base.css'),
  'utf-8',
);
const entryWindow = readFileSync(
  resolve(__dirname, '../../src/adapter/ui/entry-window.ts'),
  'utf-8',
);
const renderedViewer = readFileSync(
  resolve(__dirname, '../../src/adapter/ui/rendered-viewer.ts'),
  'utf-8',
);

describe('TEXTLOG viewer — day heading legibility (base.css)', () => {
  it('.pkc-textlog-day-title uses 0.95rem font-size', () => {
    const rule = baseCss.match(/\.pkc-textlog-day-title\s*\{[^}]*\}/)?.[0] ?? '';
    expect(rule).toMatch(/font-size:\s*0\.95rem/);
  });

  it('.pkc-textlog-day-title uses --c-fg (promoted from --c-muted)', () => {
    const rule = baseCss.match(/\.pkc-textlog-day-title\s*\{[^}]*\}/)?.[0] ?? '';
    expect(rule).toMatch(/color:\s*var\(--c-fg\)/);
    // Make sure the old muted color is not silently reintroduced.
    expect(rule).not.toMatch(/color:\s*var\(--c-muted\)/);
  });

  it('.pkc-textlog-day-title keeps weight 600 and mono family', () => {
    const rule = baseCss.match(/\.pkc-textlog-day-title\s*\{[^}]*\}/)?.[0] ?? '';
    expect(rule).toMatch(/font-weight:\s*600/);
    expect(rule).toMatch(/font-family:\s*var\(--font-mono\)/);
    expect(rule).toMatch(/letter-spacing:\s*0\.02em/);
  });
});

describe('TEXTLOG viewer — chapter break between days (base.css)', () => {
  it('.pkc-textlog-day + .pkc-textlog-day has margin-top for chapter break', () => {
    expect(baseCss).toMatch(
      /\.pkc-textlog-day\s*\+\s*\.pkc-textlog-day\s*\{[^}]*margin-top:\s*0\.5rem/,
    );
  });

  it('.pkc-textlog-document gap is 1.25rem (matches rendered-viewer)', () => {
    const rule = baseCss.match(/\.pkc-textlog-document\s*\{[^}]*\}/)?.[0] ?? '';
    expect(rule).toMatch(/gap:\s*1\.25rem/);
  });

  it('.pkc-textlog-day inner gap is 0.5rem (header→first log breathing room)', () => {
    // Target the element rule (not combinator rule) by pinning the
    // display: flex declaration we know only the element rule has.
    const rule = baseCss.match(/\.pkc-textlog-day\s*\{[^}]*display:\s*flex[^}]*\}/)?.[0] ?? '';
    expect(rule).toMatch(/gap:\s*0\.5rem/);
  });
});

describe('TEXTLOG viewer — inter-log separator hierarchy (base.css)', () => {
  it('inter-log separator is DASHED (softer than solid day underline)', () => {
    expect(baseCss).toMatch(
      /\.pkc-textlog-log\s*\+\s*\.pkc-textlog-log\s*\{[^}]*border-top:\s*1px\s+dashed\s+var\(--c-border\)/,
    );
  });

  it('day-header bottom border remains SOLID (day > log visual rank)', () => {
    const rule = baseCss.match(/\.pkc-textlog-day-header\s*\{[^}]*\}/)?.[0] ?? '';
    expect(rule).toMatch(/border-bottom:\s*1px\s+solid\s+var\(--c-border\)/);
  });
});

describe('TEXTLOG viewer — regression guards (base.css)', () => {
  // The polish must not disturb surrounding rules established in
  // earlier slices (TEXTLOG density, log left-border accent,
  // important-flag styling, range highlight).

  it('.pkc-textlog-log left accent border still present', () => {
    const rule = baseCss.match(/\.pkc-textlog-log\s*\{[^}]*\}/)?.[0] ?? '';
    expect(rule).toMatch(/border-left:\s*3px\s+solid\s+var\(--c-border\)/);
  });

  it('TEXTLOG-scoped markdown density override still present', () => {
    expect(baseCss).toMatch(
      /\.pkc-textlog-text\.pkc-md-rendered\s*\{[^}]*line-height:\s*1\.35(?!\d)/,
    );
    expect(baseCss).toMatch(
      /\.pkc-textlog-text\.pkc-md-rendered\s*\{[^}]*white-space:\s*normal/,
    );
  });

  it('important-flag rules still target .pkc-textlog-log', () => {
    expect(baseCss).toMatch(
      /\.pkc-textlog-log\[data-pkc-log-important="true"\]\s*\{[^}]*border-left-color:\s*#f5a623/,
    );
  });

  it('range-active highlight rules still present', () => {
    expect(baseCss).toMatch(
      /\.pkc-textlog-log\[data-pkc-range-active="true"\]/,
    );
  });
});

describe('TEXTLOG viewer — entry-window parity', () => {
  it('entry-window uses the same day-title size/color/weight', () => {
    const rule = entryWindow.match(/\.pkc-textlog-day-title\s*\{[^}]*\}/)?.[0] ?? '';
    expect(rule).toMatch(/font-size:\s*0\.95rem/);
    expect(rule).toMatch(/font-weight:\s*600/);
    expect(rule).toMatch(/color:\s*var\(--c-fg\)/);
    expect(rule).toMatch(/font-family:\s*var\(--font-mono\)/);
  });

  it('entry-window has the chapter-break rule', () => {
    expect(entryWindow).toMatch(
      /\.pkc-textlog-day\s*\+\s*\.pkc-textlog-day\s*\{[^}]*margin-top:\s*0\.5rem/,
    );
  });

  it('entry-window uses the dashed inter-log separator', () => {
    expect(entryWindow).toMatch(
      /\.pkc-textlog-log\s*\+\s*\.pkc-textlog-log\s*\{[^}]*border-top:\s*1px\s+dashed\s+var\(--c-border\)/,
    );
  });

  it('entry-window document gap is 1.25rem', () => {
    expect(entryWindow).toMatch(
      /\.pkc-textlog-document\s*\{[^}]*gap:\s*1\.25rem/,
    );
  });
});

describe('TEXTLOG viewer — rendered-viewer finishing', () => {
  // The rendered-viewer carries a distinct card treatment (beige
  // header, bordered card) because the exported HTML is meant to
  // read well without the app's theme variables. The polish here
  // is limited to aligning the day-title weight so it reads as a
  // heading in every surface.

  it('rendered-viewer day-title is weight 600 (heading parity)', () => {
    const rule = renderedViewer.match(/\.pkc-textlog-day-title\s*\{[\s\S]*?\}/)?.[0] ?? '';
    expect(rule).toMatch(/font-weight:\s*600/);
  });

  it('rendered-viewer print rule keeps break-inside: avoid on day and log', () => {
    // Critical for print / PDF export: a single day (and a single
    // log within it) should not split across a page boundary.
    expect(renderedViewer).toMatch(/\.pkc-textlog-day\s*\{\s*break-inside:\s*avoid/);
    expect(renderedViewer).toMatch(/\.pkc-textlog-log\s*\{\s*break-inside:\s*avoid/);
  });

  it('rendered-viewer card treatment preserved (day border + beige header)', () => {
    // Regression: the card look distinguishes the exported doc from
    // the live viewer on purpose; do not let it drift.
    expect(renderedViewer).toMatch(/\.pkc-textlog-day\s*\{[\s\S]*?border:\s*1px\s+solid/);
    expect(renderedViewer).toMatch(
      /\.pkc-textlog-day-header\s*\{[\s\S]*?background:\s*#f6f1e4/,
    );
  });
});
