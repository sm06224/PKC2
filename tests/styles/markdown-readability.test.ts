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
  it('.pkc-md-rendered has explicit line-height: 1.4 (body-aligned)', () => {
    // Match the .pkc-md-rendered base rule (first occurrence — the
    // element rule, not descendant rules like `.pkc-md-rendered h1`).
    // Tightened from 1.45 → 1.4 so markdown prose reads at the same
    // density as the surrounding app chrome (body is 1.4).
    const rule = baseCss.match(/\.pkc-md-rendered\s*\{[^}]*\}/)?.[0] ?? '';
    expect(rule).toMatch(/line-height:\s*1\.4(?!\d)/);
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
