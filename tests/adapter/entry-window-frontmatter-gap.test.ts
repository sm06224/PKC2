/**
 * @vitest-environment happy-dom
 *
 * S4 entry-window の frontmatter / vars / headingNumber 解消 test
 * (pgc-91、audit pgc-77 Gap-6 + Gap-7)。
 *
 * 経路:
 * - renderEntryPreview ── 子 popup の split editor preview
 * - pushViewBodyUpdate ── parent push 経由の view body
 * - buildTextlogViewBodyHtml ── textlog 用 per-log render
 * - renderViewBody default(text) ── initial view body
 *
 * 観察方法:`pkcRenderEntryPreview`(opener bridge)を直接 call して
 * 返ってくる HTML を verify。pushViewBodyUpdate と renderViewBody は
 * smoke で観察(本 unit では HTML pattern を直接 assert)。
 */

import { describe, it, expect, beforeEach } from 'vitest';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('S4: renderEntryPreview strips frontmatter + expands vars + heading number', () => {
  // entry-window モジュールは `(window).pkcRenderEntryPreview` を expose する
  // ので、import 副作用で window に登録される。
  it('frontmatter is not rendered as literal text', async () => {
    // dynamic import で副作用発火
    await import('../../src/adapter/ui/entry-window');
    const fn = (window as unknown as { pkcRenderEntryPreview?: (lid: string, text: string) => string }).pkcRenderEntryPreview;
    expect(fn).toBeDefined();
    const html = fn!('lid-x', '---\nvars.x: HELLO\n---\n\n# Hi {{vars.x}}');
    // Gap-6:frontmatter 行(`vars.x: HELLO` を含む `---` ブロック)が
    // raw text として出現しない
    expect(html).not.toContain('vars.x: HELLO');
    // Gap-7(vars 展開):{{vars.x}} が HELLO に展開されている
    expect(html).toContain('HELLO');
    expect(html).not.toContain('{{vars.x}}');
  });

  it('heading-number from frontmatter is applied', async () => {
    await import('../../src/adapter/ui/entry-window');
    const fn = (window as unknown as { pkcRenderEntryPreview?: (lid: string, text: string) => string }).pkcRenderEntryPreview;
    expect(fn).toBeDefined();
    const html = fn!('lid-y', '---\nheading-number: 5\n---\n\n# First\n## Sub');
    // heading 番号(5. / 5.1)が出る
    expect(html).toMatch(/5\.\s+First|5\. First/);
  });

  it('no frontmatter: still works normally', async () => {
    await import('../../src/adapter/ui/entry-window');
    const fn = (window as unknown as { pkcRenderEntryPreview?: (lid: string, text: string) => string }).pkcRenderEntryPreview;
    const html = fn!('lid-z', '# Simple\n\nbody');
    expect(html).toContain('Simple');
    expect(html).toContain('body');
  });
});
