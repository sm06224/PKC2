/**
 * PR #196 — markdown copy button overlay contract.
 *
 * `markdown-render.ts` wraps every fenced code block and table in a
 * `<div class="pkc-md-block">` with a `<button class="pkc-md-copy-btn"
 * data-pkc-action="copy-md-block">`. action-binder reads the inner
 * `<pre>` / `<table>` on click and dispatches a multi-MIME clipboard
 * write.
 *
 * Tests pin:
 *   1. fenced code block is wrapped, button has correct attributes
 *   2. table is wrapped, button has correct attributes
 *   3. inline code (`` `code` ``) does NOT get wrapped (no overlay)
 *   4. paragraph text alone does not get wrapped
 *   5. multiple blocks each get their own button
 */

import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '@features/markdown/markdown-render';

describe('markdown copy button overlay (PR #196)', () => {
  it('wraps a fenced code block with .pkc-md-block + copy button', () => {
    // Use a fence with no language hint so syntax highlighting doesn't
    // wrap the body in token spans — keeps the assertion focused on
    // the wrapper / button structure.
    const html = renderMarkdown('```\nhello-source\n```');
    expect(html).toContain('class="pkc-md-block"');
    expect(html).toContain('data-pkc-md-block-kind="code"');
    expect(html).toContain('data-pkc-action="copy-md-block"');
    expect(html).toContain('data-pkc-copy-kind="code"');
    expect(html).toContain('class="pkc-md-copy-btn"');
    // The original <pre><code> is still inside.
    expect(html).toContain('<pre>');
    expect(html).toContain('hello-source');
  });

  it('wraps a table with .pkc-md-block + copy button', () => {
    const html = renderMarkdown('| a | b |\n|---|---|\n| 1 | 2 |');
    expect(html).toContain('class="pkc-md-block"');
    expect(html).toContain('data-pkc-md-block-kind="table"');
    expect(html).toContain('data-pkc-copy-kind="table"');
    expect(html).toContain('<table>');
    expect(html).toContain('</table>');
    // The .pkc-md-block wraps the entire <table>…</table>.
    const blockOpen = html.indexOf('class="pkc-md-block"');
    const tableOpen = html.indexOf('<table>');
    const tableClose = html.indexOf('</table>');
    const blockClose = html.indexOf('</div>', tableClose);
    expect(blockOpen).toBeLessThan(tableOpen);
    expect(tableClose).toBeLessThan(blockClose);
  });

  it('does NOT wrap inline code', () => {
    const html = renderMarkdown('Some `inline` text.');
    expect(html).not.toContain('pkc-md-block');
    expect(html).toContain('<code>inline</code>');
  });

  it('does NOT wrap plain paragraphs', () => {
    const html = renderMarkdown('Just a sentence.');
    expect(html).not.toContain('pkc-md-block');
  });

  it('emits one wrapper per block when multiple blocks coexist', () => {
    const md = '```\ncode1\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```\ncode2\n```';
    const html = renderMarkdown(md);
    const wrapperCount = (html.match(/class="pkc-md-block"/g) ?? []).length;
    expect(wrapperCount).toBe(3); // 2 code blocks + 1 table
    const buttonCount = (html.match(/class="pkc-md-copy-btn"/g) ?? []).length;
    expect(buttonCount).toBe(3);
  });
});
