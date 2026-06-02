/**
 * @vitest-environment happy-dom
 *
 * S4 entry-window critical PKC dialect CSS mirror Phase 3 test
 * (pgc-95、audit pgc-77 Gap-13 cat-3)。
 */

import { describe, it, expect, beforeAll } from 'vitest';

let html = '';

describe('S4 inline CSS mirror Phase 3: transclusion / heading-fold / chrome', () => {
  beforeAll(async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const file = path.resolve(__dirname, '../../src/adapter/ui/entry-window.ts');
    html = await fs.readFile(file, 'utf8');
  });

  it('contains transclusion base + header + source rules', () => {
    expect(html).toContain('.pkc-transclusion');
    expect(html).toContain('.pkc-transclusion-header');
    expect(html).toContain('.pkc-transclusion-source');
  });

  it('contains transclusion body + fallback + broken + document + log', () => {
    expect(html).toContain('.pkc-transclusion-body');
    expect(html).toContain('.pkc-transclusion-fallback');
    expect(html).toContain('.pkc-transclusion-broken');
    expect(html).toContain('.pkc-transclusion-document');
    expect(html).toContain('.pkc-transclusion-fallback-link');
    expect(html).toContain('.pkc-transclusion-log');
  });

  it('contains embed-blocked', () => {
    expect(html).toContain('.pkc-embed-blocked');
  });

  it('contains todo-embed-meta rules', () => {
    expect(html).toContain('.pkc-todo-embed-meta');
    expect(html).toContain('.pkc-todo-embed-status');
    expect(html).toContain('data-pkc-todo-status="done"');
  });

  it('contains heading-fold + heading-fold-summary', () => {
    expect(html).toContain('.pkc-heading-fold');
    expect(html).toContain('.pkc-heading-fold-summary');
  });

  it('contains footnote-ref CSS', () => {
    expect(html).toContain('.pkc-footnote-ref');
    expect(html).toContain('vertical-align: super');
  });

  it('contains citation CSS', () => {
    expect(html).toContain('.pkc-citation');
    expect(html).toContain('font-style: italic');
  });
});
