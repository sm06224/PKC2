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

describe('Task list polish — hanging indent + completed styling', () => {
  // These tests pin the CSS-only task list polish pass:
  //  - li.pkc-task-item gets position: relative + padding-left so the
  //    checkbox can be absolute-positioned; this gives multi-line
  //    wrapped task text a hanging indent (wrap continues at the
  //    first glyph, not under the checkbox).
  //  - Completed state is derived from :has(:checked) rather than a
  //    JS-applied class, so markdown-it output stays unchanged.
  //  - Both the tight variant (<li><input>text</li>) and the loose
  //    variant (<li><p><input>text</p></li>) are covered.

  it('li.pkc-task-item is position: relative with hanging-indent padding', () => {
    const rule = baseCss.match(/\.pkc-md-rendered\s+li\.pkc-task-item\s*\{[^}]*\}/)?.[0] ?? '';
    expect(rule).toMatch(/position:\s*relative/);
    expect(rule).toMatch(/padding-left:\s*1\.5em/);
    expect(rule).toMatch(/margin-left:\s*-1\.2em/);
  });

  it('checkbox is absolutely positioned for both tight and loose variants', () => {
    // Tight: <li><input>text</li>
    expect(baseCss).toMatch(
      /\.pkc-md-rendered\s+li\.pkc-task-item\s*>\s*\.pkc-task-checkbox/,
    );
    // Loose: <li><p><input>text</p></li>
    expect(baseCss).toMatch(
      /\.pkc-md-rendered\s+li\.pkc-task-item\s*>\s*p:first-child\s*>\s*\.pkc-task-checkbox:first-child/,
    );
    // And the combined rule declares absolute positioning.
    const combined = baseCss.match(
      /\.pkc-md-rendered\s+li\.pkc-task-item\s*>\s*\.pkc-task-checkbox[^{]*\{[^}]*\}/,
    )?.[0] ?? '';
    expect(combined).toMatch(/position:\s*absolute/);
  });

  it('checkbox keeps pointer cursor and accent-color in base.css', () => {
    const rule = baseCss.match(/\.pkc-md-rendered\s+\.pkc-task-checkbox\s*\{[^}]*\}/)?.[0] ?? '';
    expect(rule).toMatch(/cursor:\s*pointer/);
    expect(rule).toMatch(/accent-color:\s*var\(--c-accent\)/);
  });

  it('completed state rule uses :has(:checked) with line-through + muted color (tight variant)', () => {
    expect(baseCss).toMatch(
      /li\.pkc-task-item:has\(>\s*\.pkc-task-checkbox:checked\)\s*\{[^}]*text-decoration:\s*line-through/,
    );
    expect(baseCss).toMatch(
      /li\.pkc-task-item:has\(>\s*\.pkc-task-checkbox:checked\)\s*\{[^}]*color:\s*var\(--c-muted\)/,
    );
  });

  it('completed state rule covers the loose <p>-wrapped variant', () => {
    expect(baseCss).toMatch(
      /li\.pkc-task-item:has\(>\s*p:first-child\s*>\s*\.pkc-task-checkbox:checked\)\s*>\s*p:first-child\s*\{[^}]*text-decoration:\s*line-through/,
    );
  });

  it('nested child lists inside a completed task reset color + decoration', () => {
    // Prevents parents completing from visually striking all subtasks.
    expect(baseCss).toMatch(
      /\.pkc-md-rendered\s+li\.pkc-task-item\s+ul[\s\S]*\.pkc-md-rendered\s+li\.pkc-task-item\s+ol\s*\{[^}]*text-decoration:\s*none/,
    );
  });

  it('edit preview still disables checkbox interaction (regression guard)', () => {
    const rule = baseCss.match(/\.pkc-text-edit-preview\s+\.pkc-task-checkbox\s*\{[^}]*\}/)?.[0] ?? '';
    expect(rule).toMatch(/pointer-events:\s*none/);
    expect(rule).toMatch(/cursor:\s*default/);
  });
});

describe('Task list polish — TEXT regression guards', () => {
  // TEXT-side markdown density must NOT drift from the Slice A
  // baseline just because task list polish landed. The polish is
  // scoped to .pkc-task-item — plain paragraphs and non-task list
  // items keep their margins.

  it('.pkc-md-rendered p margin stays 0.35em 0', () => {
    expect(baseCss).toMatch(/\.pkc-md-rendered\s+p\s*\{\s*margin:\s*0\.35em 0/);
  });

  it('.pkc-md-rendered li margin stays 0.15em 0 (non-task)', () => {
    expect(baseCss).toMatch(/\.pkc-md-rendered\s+li\s*\{\s*margin:\s*0\.15em 0/);
  });

  it('TEXT prose line-height stays 1.35 (task polish does not ratchet it)', () => {
    const rule = baseCss.match(/\.pkc-md-rendered\s*\{[^}]*\}/)?.[0] ?? '';
    expect(rule).toMatch(/line-height:\s*1\.35(?!\d)/);
  });
});

describe('Task list polish — TEXTLOG inherits via compound scope', () => {
  // .pkc-textlog-text is a sibling class that sits alongside
  // .pkc-md-rendered on the log body element. Because all task
  // rules are anchored on .pkc-md-rendered (not scoped by
  // .pkc-textlog-text), TEXTLOG task lists inherit the polish for
  // free — no duplicated TEXTLOG-specific task rules needed. These
  // tests pin that contract.
  const renderedViewerSrc = readFileSync(
    resolve(__dirname, '../../src/adapter/ui/rendered-viewer.ts'),
    'utf-8',
  );

  it('TEXTLOG body element carries both classes so task rules apply', () => {
    // Double-check the rendered-viewer emits the compound class;
    // this is the surface where TEXTLOG hanging indent matters most.
    expect(renderedViewerSrc).toMatch(/pkc-textlog-text\s+pkc-md-rendered/);
  });

  it('no TEXTLOG-scoped override re-declares task list margin/padding', () => {
    // If a regression ever scopes task styles under .pkc-textlog-text,
    // TEXT and TEXTLOG could drift. Guard against that by asserting
    // the CSS contains no such scoped rule today.
    expect(baseCss).not.toMatch(/\.pkc-textlog-text\s+li\.pkc-task-item/);
  });
});

describe('Task list polish — entry-window / rendered-viewer parity', () => {
  const entryWindow = readFileSync(
    resolve(__dirname, '../../src/adapter/ui/entry-window.ts'),
    'utf-8',
  );
  const renderedViewer = readFileSync(
    resolve(__dirname, '../../src/adapter/ui/rendered-viewer.ts'),
    'utf-8',
  );

  it('entry-window.ts inlines hanging-indent rule on li.pkc-task-item', () => {
    expect(entryWindow).toMatch(
      /\.pkc-md-rendered\s+li\.pkc-task-item\s*\{[^}]*position:\s*relative/,
    );
    expect(entryWindow).toMatch(
      /\.pkc-md-rendered\s+li\.pkc-task-item\s*\{[^}]*padding-left:\s*1\.5em/,
    );
  });

  it('entry-window.ts inlines the :has(:checked) completed rule', () => {
    expect(entryWindow).toMatch(
      /li\.pkc-task-item:has\(>\s*\.pkc-task-checkbox:checked\)[\s\S]{0,120}text-decoration:\s*line-through/,
    );
  });

  it('entry-window.ts covers the loose <p>-wrapped variant', () => {
    expect(entryWindow).toMatch(
      /li\.pkc-task-item:has\(>\s*p:first-child\s*>\s*\.pkc-task-checkbox:checked\)\s*>\s*p:first-child/,
    );
  });

  it('rendered-viewer.ts inlines the same hanging-indent rule', () => {
    expect(renderedViewer).toMatch(
      /\.pkc-md-rendered\s+li\.pkc-task-item\s*\{[\s\S]*?position:\s*relative/,
    );
    expect(renderedViewer).toMatch(
      /\.pkc-md-rendered\s+li\.pkc-task-item\s*\{[\s\S]*?padding-left:\s*1\.5em/,
    );
  });

  it('rendered-viewer.ts uses hardcoded colors for the completed state (no theme vars)', () => {
    // Standalone exported HTML carries no --c-muted, so hex must
    // appear inline. Any drift away from hex would break dark/light
    // in the exported file.
    expect(renderedViewer).toMatch(
      /li\.pkc-task-item:has\(>\s*\.pkc-task-checkbox:checked\)\s*\{[\s\S]*?color:\s*#777/,
    );
    expect(renderedViewer).toMatch(
      /li\.pkc-task-item:has\(>\s*\.pkc-task-checkbox:checked\)\s*\{[\s\S]*?text-decoration:\s*line-through/,
    );
  });

  it('rendered-viewer.ts disables checkbox interaction (exports are read-only)', () => {
    expect(renderedViewer).toMatch(
      /\.pkc-md-rendered\s+\.pkc-task-checkbox\s*\{[^}]*pointer-events:\s*none/,
    );
  });
});
