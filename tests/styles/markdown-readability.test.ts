/**
 * Slice A: Markdown Readability Hardening — static CSS assertions.
 *
 * See docs/development/ui-readability-and-editor-sizing-hardening.md §3-A.
 *
 * These tests verify the presence of the CSS variables and line-height
 * declarations that Slice A adds to base.css. They do not attempt to
 * measure computed style (which would require a full render pipeline);
 * instead they assert the textual contract, which is what downstream
 * consumers depend on.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const baseCss = readFileSync(
  resolve(__dirname, '../../src/styles/base.css'),
  'utf-8',
);

describe('Slice A: Markdown readability — CSS variables', () => {
  it(':root defines --font-body', () => {
    expect(baseCss).toMatch(/--font-body:\s*var\(--font-sans\)/);
  });

  it(':root defines --radius-sm', () => {
    expect(baseCss).toMatch(/--radius-sm:\s*1px/);
  });

  it(':root defines --c-text (alias for --c-fg)', () => {
    expect(baseCss).toMatch(/--c-text:\s*var\(--c-fg\)/);
  });

  it(':root defines --c-text-dim (alias for --c-muted)', () => {
    expect(baseCss).toMatch(/--c-text-dim:\s*var\(--c-muted\)/);
  });
});

describe('Markdown readability — line-height (screen-first density pass)', () => {
  it('.pkc-md-rendered has explicit line-height: 1.35 (tightened prose)', () => {
    // Match the .pkc-md-rendered base rule (first occurrence — the
    // element rule, not descendant rules like `.pkc-md-rendered h1`).
    // Progressively tightened 1.45 → 1.4 → 1.35: markdown paragraphs
    // accumulate margins on every block-level child, which reads
    // looser than plain body prose at the same line-height. Pulling
    // the baseline down by another 0.05 brings markdown density in
    // line with surrounding chrome.
    const rule = baseCss.match(/\.pkc-md-rendered\s*\{[^}]*\}/)?.[0] ?? '';
    expect(rule).toMatch(/line-height:\s*1\.35(?!\d)/);
  });

  it('.pkc-md-rendered pre has line-height: 1.3 (dense code block)', () => {
    // Tightened from 1.35 → 1.3 to keep code blocks visibly denser
    // than prose even after the prose line-height drop.
    const preRule = baseCss.match(/\.pkc-md-rendered\s+pre\s*\{[^}]*\}/)?.[0] ?? '';
    expect(preRule).toMatch(/line-height:\s*1\.3(?!\d)/);
  });
});

describe('Slice A: regression guards', () => {
  it('.pkc-md-rendered font-family still uses --font-body (no regression)', () => {
    const rule = baseCss.match(/\.pkc-md-rendered\s*\{[^}]*\}/)?.[0] ?? '';
    expect(rule).toContain('var(--font-body)');
  });

  it('.pkc-md-rendered blockquote still uses --c-text-dim', () => {
    const rule = baseCss.match(/\.pkc-md-rendered\s+blockquote\s*\{[^}]*\}/)?.[0] ?? '';
    expect(rule).toContain('var(--c-text-dim)');
  });

  it('task checkbox vertical-align and margin unchanged', () => {
    const rule = baseCss.match(/\.pkc-md-rendered\s+\.pkc-task-checkbox\s*\{[^}]*\}/)?.[0] ?? '';
    expect(rule).toMatch(/vertical-align:\s*-0\.08em/);
    expect(rule).toMatch(/margin-right:\s*0\.35em/);
  });

  it('paragraph margin unchanged (prevents over-tight spacing)', () => {
    expect(baseCss).toMatch(/\.pkc-md-rendered\s+p\s*\{\s*margin:\s*0\.35em 0/);
  });

  it('list item margin unchanged', () => {
    expect(baseCss).toMatch(/\.pkc-md-rendered\s+li\s*\{\s*margin:\s*0\.15em 0/);
  });
});

describe('TEXTLOG-scoped markdown density override', () => {
  // These tests pin TEXTLOG-only tightening (Task G): log bodies
  // render inside a tight per-log grid, so prose margins/line-height
  // are pulled in a notch ONLY when scoped by `.pkc-textlog-text`.
  // TEXT entries (above tests) stay at the current defaults.

  it('.pkc-textlog-text.pkc-md-rendered matches TEXT prose line-height (1.35)', () => {
    // TEXTLOG used to be pulled below TEXT (1.3 vs 1.35), but that
    // masked the real density bug: .pkc-textlog-text set
    // `white-space: pre-wrap`, which preserved markdown-it's
    // inter-block `\n` characters as literal blank lines. Once the
    // compound selector forces `white-space: normal`, TEXT and
    // TEXTLOG read at the same density, so line-height pins to
    // 1.35 to match TEXT exactly.
    expect(baseCss).toMatch(
      /\.pkc-textlog-text\.pkc-md-rendered\s*\{[^}]*line-height:\s*1\.35(?!\d)/,
    );
  });

  it('.pkc-textlog-text.pkc-md-rendered forces white-space: normal', () => {
    // Without this override, markdown-it output like `</p>\n<p>…`
    // would render blank lines because .pkc-textlog-text (declared
    // later than .pkc-md-rendered) sets `white-space: pre-wrap`.
    expect(baseCss).toMatch(
      /\.pkc-textlog-text\.pkc-md-rendered\s*\{[^}]*white-space:\s*normal/,
    );
  });

  it('first/last child margin reset is present (no stray margin-top on log bodies)', () => {
    expect(baseCss).toMatch(
      /\.pkc-textlog-text\.pkc-md-rendered\s*>\s*:first-child\s*\{\s*margin-top:\s*0/,
    );
    expect(baseCss).toMatch(
      /\.pkc-textlog-text\.pkc-md-rendered\s*>\s*:last-child\s*\{\s*margin-bottom:\s*0/,
    );
  });

  it('TEXTLOG paragraphs use margin 0.2em 0 (tighter than global 0.35em)', () => {
    expect(baseCss).toMatch(
      /\.pkc-textlog-text\s+p\s*\{\s*margin:\s*0\.2em 0/,
    );
  });

  it('TEXTLOG lists use margin 0.2em 0 and padding-left 1.3em (pulled in)', () => {
    expect(baseCss).toMatch(
      /\.pkc-textlog-text\s+ol\s*\{\s*margin:\s*0\.2em 0;\s*padding-left:\s*1\.3em/,
    );
  });

  it('TEXTLOG list items margin 0.05em 0 (denser than 0.15em)', () => {
    expect(baseCss).toMatch(
      /\.pkc-textlog-text\s+li\s*\{\s*margin:\s*0\.05em 0/,
    );
  });

  it('TEXTLOG blockquote / pre margin 0.25em 0', () => {
    expect(baseCss).toMatch(
      /\.pkc-textlog-text\s+blockquote\s*\{\s*margin:\s*0\.25em 0/,
    );
    expect(baseCss).toMatch(
      /\.pkc-textlog-text\s+pre\s*\{\s*margin:\s*0\.25em 0/,
    );
  });

  it('TEXT-side margin rules remain untouched (only line-height ratcheted)', () => {
    // Global paragraph margin stays at 0.35em (TEXT density — margins
    // give prose breathing room; line-height was tightened instead).
    expect(baseCss).toMatch(/\.pkc-md-rendered\s+p\s*\{\s*margin:\s*0\.35em 0/);
    // Global li margin stays at 0.15em.
    expect(baseCss).toMatch(/\.pkc-md-rendered\s+li\s*\{\s*margin:\s*0\.15em 0/);
  });
});

describe('TEXTLOG density parity across entry-window and rendered-viewer', () => {
  // Parity guards: the popped entry window and the exported
  // standalone HTML must carry the same TEXTLOG density rules so
  // a log reads at identical tightness in every surface.
  const entryWindow = readFileSync(
    resolve(__dirname, '../../src/adapter/ui/entry-window.ts'),
    'utf-8',
  );
  const renderedViewer = readFileSync(
    resolve(__dirname, '../../src/adapter/ui/rendered-viewer.ts'),
    'utf-8',
  );

  it('entry-window.ts inlines .pkc-textlog-text.pkc-md-rendered line-height: 1.35 + white-space: normal', () => {
    expect(entryWindow).toMatch(
      /\.pkc-textlog-text\.pkc-md-rendered\s*\{[^}]*line-height:\s*1\.35(?!\d)/,
    );
    expect(entryWindow).toMatch(
      /\.pkc-textlog-text\.pkc-md-rendered\s*\{[^}]*white-space:\s*normal/,
    );
  });

  it('entry-window.ts tightens log paragraph/list margins', () => {
    expect(entryWindow).toMatch(/\.pkc-textlog-text\s+p\s*\{\s*margin:\s*0\.2em 0/);
    expect(entryWindow).toMatch(
      /\.pkc-textlog-text\s+li\s*\{\s*margin:\s*0\.05em 0/,
    );
  });

  it('rendered-viewer.ts inlines the same TEXTLOG-scoped line-height + white-space', () => {
    expect(renderedViewer).toMatch(
      /\.pkc-textlog-text\.pkc-md-rendered\s*\{[^}]*line-height:\s*1\.35(?!\d)/,
    );
    expect(renderedViewer).toMatch(
      /\.pkc-textlog-text\.pkc-md-rendered\s*\{[^}]*white-space:\s*normal/,
    );
  });

  it('rendered-viewer.ts tightens log paragraph and list item margins', () => {
    expect(renderedViewer).toMatch(
      /\.pkc-textlog-text\s+p\s*\{\s*margin:\s*0\.2em 0/,
    );
    expect(renderedViewer).toMatch(
      /\.pkc-textlog-text\s+li\s*\{\s*margin:\s*0\.05em 0/,
    );
  });
});
