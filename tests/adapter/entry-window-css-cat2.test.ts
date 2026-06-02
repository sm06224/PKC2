/**
 * @vitest-environment happy-dom
 *
 * S4 entry-window critical PKC dialect CSS mirror Phase 2 test
 * (pgc-94、audit pgc-77 Gap-13 cat-2)。
 */

import { describe, it, expect, beforeAll } from 'vitest';

let html = '';

describe('S4 inline CSS mirror Phase 2: blank-line / em-dot / hallucination / tolerant', () => {
  beforeAll(async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const file = path.resolve(__dirname, '../../src/adapter/ui/entry-window.ts');
    html = await fs.readFile(file, 'utf8');
  });

  it('contains blank-line marker rule + variants', () => {
    expect(html).toContain('.pkc-blank-line');
    expect(html).toContain('--pkc-blank-line-h');
    expect(html).toContain('data-pkc-blank-count="2"');
    expect(html).toContain('data-pkc-blank-count="50"');
  });

  it('contains blank-line cap warning pseudo', () => {
    expect(html).toContain('data-pkc-blank-capped');
    expect(html).toContain('上限 cap');
  });

  it('contains em-dot + ruby + mark inline modifiers', () => {
    expect(html).toContain('em.pkc-em-dot');
    expect(html).toContain('text-emphasis: dot');
    expect(html).toContain('.pkc-md-rendered ruby rt');
    expect(html).toContain('.pkc-md-rendered mark');
  });

  it('contains variable-undefined warning rule', () => {
    expect(html).toContain('.pkc-variable-undefined');
    expect(html).toContain('color: #b91c1c');
  });

  it('contains hallucination warning block rule', () => {
    expect(html).toContain('.pkc-warning-hallucination-block');
    expect(html).toContain('background-color: #fef3c7');
  });

  it('contains tolerant alias 4 rules (lead / attribution / spacing / align-hint)', () => {
    expect(html).toContain('.pkc-lead');
    expect(html).toContain('.pkc-attribution');
    expect(html).toContain('.pkc-tolerant-spacing');
    expect(html).toContain('.pkc-align-hint');
  });

  it('contains debug-hallucination opt-in reveal', () => {
    expect(html).toContain('data-pkc-debug-hallucination');
  });

  it('contains html-render fence iframe rule', () => {
    expect(html).toContain('.pkc-html-render');
  });

  it('contains align prefix rules (L-5)', () => {
    expect(html).toContain('data-pkc-align="center"');
    expect(html).toContain('data-pkc-align="right"');
  });

  it('contains indent prefix (L-9)', () => {
    expect(html).toContain('data-pkc-indent="1"');
  });
});
