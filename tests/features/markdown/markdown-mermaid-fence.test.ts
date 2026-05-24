/**
 * pgc-203 wave-α' polish #24(built-in mermaid):markdown-render.ts の
 * fence detection が ` ```mermaid ` を `.pkc-mermaid-placeholder` として
 * emit するか。pure features 層 unit test、mermaid.js library は不要。
 */

import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '@features/markdown/markdown-render';

describe('pgc-203 markdown ```mermaid fence → placeholder', () => {
  it('case 1: ```mermaid fence は pkc-mermaid-placeholder div として emit', () => {
    const md = '```mermaid\nflowchart TD\n  A --> B\n```\n';
    const html = renderMarkdown(md);
    expect(html).toContain('pkc-mermaid-placeholder');
    expect(html).toContain('data-pkc-mermaid-src=');
    expect(html).toContain('flowchart TD');
  });

  it('case 2: source は data-pkc-mermaid-src attribute に保持(copy / export 経路)', () => {
    const md = '```mermaid\nsequenceDiagram\n  A->>B: msg\n```\n';
    const html = renderMarkdown(md);
    // HTML entity escape されているはず
    expect(html).toMatch(/data-pkc-mermaid-src="[^"]*sequenceDiagram[^"]*"/);
  });

  it('case 3: data-pkc-md-block-kind="mermaid" attribute が立つ(copy menu 連動)', () => {
    const md = '```mermaid\ngraph LR\n  X --> Y\n```\n';
    const html = renderMarkdown(md);
    expect(html).toContain('data-pkc-md-block-kind="mermaid"');
  });

  it('case 4: pre + code.language-mermaid で fence source も表示(flag OFF fallback / accessibility)', () => {
    const md = '```mermaid\npie\n  "A": 50\n```\n';
    const html = renderMarkdown(md);
    expect(html).toContain('pkc-mermaid-source');
    expect(html).toContain('language-mermaid');
  });

  it('case 5: ```mermaid 以外の lang は影響なし(```js / ```ts / ```html / 等)', () => {
    const langs = ['js', 'ts', 'python', 'css', ''];
    for (const lang of langs) {
      const md = `\`\`\`${lang}\nconst x = 1;\n\`\`\`\n`;
      const html = renderMarkdown(md);
      expect(html).not.toContain('pkc-mermaid-placeholder');
    }
  });

  it('case 6: ```mermaid suffix(lang option 等)も認識', () => {
    const md = '```mermaid theme=dark\nflowchart TD\n  A --> B\n```\n';
    const html = renderMarkdown(md);
    expect(html).toContain('pkc-mermaid-placeholder');
  });

  it('case 7: ```mermaidx(prefix match のみ)は match しない', () => {
    const md = '```mermaidx\nfoo\n```\n';
    const html = renderMarkdown(md);
    expect(html).not.toContain('pkc-mermaid-placeholder');
  });

  it('case 8: HTML 特殊文字を含む source は properly escape', () => {
    const md = '```mermaid\nflowchart TD\n  A["<script>"] --> B\n```\n';
    const html = renderMarkdown(md);
    expect(html).toContain('pkc-mermaid-placeholder');
    // raw <script> が src attribute に出ないこと
    expect(html).not.toContain('"<script>"');
    // escaped 形式が存在
    expect(html).toMatch(/&lt;script&gt;|&amp;lt;script/);
  });
});
