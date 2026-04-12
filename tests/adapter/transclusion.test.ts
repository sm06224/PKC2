/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { expandTransclusions } from '@adapter/ui/transclusion';
import { renderMarkdown } from '@features/markdown/markdown-render';
import type { Entry } from '@core/model/record';

// ── P1 Slice 5-B: entry transclusion expander ──
//
// Tests are structured in four groups:
//   1. renderer → placeholder (markdown-it produces the inert div)
//   2. parser / happy-path integration (entry / log / range / day)
//   3. fallback (missing, invalid, self-embed, nested depth)
//   4. regressions (TEXT embed, navigate-entry-ref, tasklist)

// Helper: wrap `renderMarkdown` output in a container element the
// expander can walk. `expandTransclusions` operates on an existing
// `HTMLElement`; tests always start from a freshly-rendered subtree.
function makeBodyEl(markdown: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = renderMarkdown(markdown);
  return el;
}

// Container of a few representative entries used across tests.
function makeEntries(): Entry[] {
  return [
    {
      lid: 'host',
      archetype: 'text',
      title: 'Host',
      body: '',
      created_at: '',
      updated_at: '',
    },
    {
      lid: 'other-text',
      archetype: 'text',
      title: 'Target text',
      body: '# Hello\n\nparagraph text',
      created_at: '',
      updated_at: '',
    },
    {
      lid: 'textlog-1',
      archetype: 'textlog',
      title: 'Work log',
      body: JSON.stringify({
        entries: [
          { id: 'log-a', text: '# Morning\n\nstandup notes', createdAt: '2026-04-09T10:00:00Z', flags: [] },
          { id: 'log-b', text: '## Afternoon\n\nPR review', createdAt: '2026-04-09T14:00:00Z', flags: [] },
          { id: 'log-c', text: 'follow-up', createdAt: '2026-04-10T09:00:00Z', flags: [] },
        ],
      }),
      created_at: '',
      updated_at: '',
    },
    {
      lid: 'empty-textlog',
      archetype: 'textlog',
      title: 'Empty',
      body: JSON.stringify({ entries: [] }),
      created_at: '',
      updated_at: '',
    },
  ];
}

// ─────────────────────────────────────────────────────
// 1. renderer → placeholder
// ─────────────────────────────────────────────────────

describe('markdown-render: entry: images emit transclusion placeholder', () => {
  it('emits <div class="pkc-transclusion-placeholder"> for ![](entry:...)', () => {
    const html = renderMarkdown('![x](entry:lid-1)');
    expect(html).toContain('class="pkc-transclusion-placeholder"');
    expect(html).toContain('data-pkc-embed-ref="entry:lid-1"');
  });

  it('preserves alt text on data-pkc-embed-alt', () => {
    const html = renderMarkdown('![my label](entry:lid-1#log/abc)');
    expect(html).toContain('data-pkc-embed-alt="my label"');
    expect(html).toContain('data-pkc-embed-ref="entry:lid-1#log/abc"');
  });

  it('does NOT emit <img src="entry:..."> (would 404 in the browser)', () => {
    const html = renderMarkdown('![x](entry:lid-1)');
    expect(html).not.toContain('<img src="entry:');
  });

  it('leaves regular image src untouched', () => {
    const html = renderMarkdown('![x](https://example.com/img.png)');
    expect(html).toContain('<img src="https://example.com/img.png"');
    expect(html).not.toContain('pkc-transclusion-placeholder');
  });

  it('escapes HTML special chars in ref and alt', () => {
    // Markdown-it strips angle brackets from image alt because they're
    // parsed as inline HTML, so we exercise just the ampersand case
    // which round-trips through the token.
    const html = renderMarkdown('![a & b](entry:lid)');
    expect(html).toContain('data-pkc-embed-alt="a &amp; b"');
  });
});

// ─────────────────────────────────────────────────────
// 2. happy-path expansion
// ─────────────────────────────────────────────────────

describe('expandTransclusions — happy path', () => {
  let root: HTMLElement;
  let entries: Entry[];

  beforeEach(() => {
    entries = makeEntries();
  });

  it('entry: whole text entry → renders the target body as markdown', () => {
    root = makeBodyEl('![](entry:other-text)');
    expandTransclusions(root, { entries, hostLid: 'host' });
    const section = root.querySelector('section.pkc-transclusion');
    expect(section).not.toBeNull();
    expect(section!.getAttribute('data-pkc-embed-source')).toBe('entry:other-text');
    expect(section!.getAttribute('data-pkc-embed-kind')).toBe('entry');
    // Source backlink present with action attr.
    const backlink = section!.querySelector('a.pkc-transclusion-source');
    expect(backlink).not.toBeNull();
    expect(backlink!.getAttribute('data-pkc-action')).toBe('navigate-entry-ref');
    expect(backlink!.getAttribute('data-pkc-entry-ref')).toBe('entry:other-text');
    // Embedded body rendered, heading text present.
    expect(section!.querySelector('.pkc-transclusion-body')!.textContent).toContain('Hello');
  });

  it('entry: whole TEXTLOG → renders day-grouped embed without ids', () => {
    root = makeBodyEl('![](entry:textlog-1)');
    expandTransclusions(root, { entries, hostLid: 'host' });
    const section = root.querySelector('section.pkc-transclusion')!;
    expect(section.getAttribute('data-pkc-embed-kind')).toBe('entry');
    // All three logs should appear.
    const logs = section.querySelectorAll('article.pkc-transclusion-log');
    expect(logs.length).toBe(3);
    // No log has an `id` attribute (embedded subtree strips IDs to avoid collisions).
    for (const log of Array.from(logs)) {
      expect(log.hasAttribute('id')).toBe(false);
      // But the source log id is kept as a non-functional data attr.
      expect(log.getAttribute('data-pkc-embedded-log-id')).toMatch(/log-[abc]/);
      // Embedded flag is stamped so the task-checkbox / flag handlers
      // in action-binder can short-circuit.
      expect(log.getAttribute('data-pkc-embedded')).toBe('true');
    }
    // Day sections also omit ids.
    const days = section.querySelectorAll('section.pkc-transclusion-day');
    for (const day of Array.from(days)) {
      expect(day.hasAttribute('id')).toBe(false);
    }
  });

  it('log: single log fragment → renders exactly that article', () => {
    root = makeBodyEl('![](entry:textlog-1#log/log-b)');
    expandTransclusions(root, { entries, hostLid: 'host' });
    const section = root.querySelector('section.pkc-transclusion')!;
    expect(section.getAttribute('data-pkc-embed-kind')).toBe('log');
    const logs = section.querySelectorAll('article.pkc-transclusion-log');
    expect(logs.length).toBe(1);
    expect(logs[0]!.getAttribute('data-pkc-embedded-log-id')).toBe('log-b');
    // Body content rendered.
    expect(logs[0]!.textContent).toContain('PR review');
  });

  it('day: day fragment → renders all logs on that date, sibling day skipped', () => {
    // Two logs on 2026-04-09 (log-a, log-b), one on 2026-04-10 (log-c).
    root = makeBodyEl('![](entry:textlog-1#day/2026-04-09)');
    expandTransclusions(root, { entries, hostLid: 'host' });
    const section = root.querySelector('section.pkc-transclusion')!;
    expect(section.getAttribute('data-pkc-embed-kind')).toBe('day');
    const logs = section.querySelectorAll('article.pkc-transclusion-log');
    const ids = Array.from(logs).map((l) => l.getAttribute('data-pkc-embedded-log-id'));
    expect(ids).toEqual(expect.arrayContaining(['log-a', 'log-b']));
    expect(ids).not.toContain('log-c');
  });

  it('range: log/a..b → renders an inclusive slice', () => {
    // Range covers log-a and log-b (same day).
    root = makeBodyEl('![](entry:textlog-1#log/log-a..log-b)');
    expandTransclusions(root, { entries, hostLid: 'host' });
    const section = root.querySelector('section.pkc-transclusion')!;
    expect(section.getAttribute('data-pkc-embed-kind')).toBe('range');
    const logs = section.querySelectorAll('article.pkc-transclusion-log');
    const ids = Array.from(logs).map((l) => l.getAttribute('data-pkc-embedded-log-id'));
    expect(ids).toEqual(['log-a', 'log-b']);
  });

  it('range: endpoint order is normalized (b..a == a..b)', () => {
    root = makeBodyEl('![](entry:textlog-1#log/log-b..log-a)');
    expandTransclusions(root, { entries, hostLid: 'host' });
    const ids = Array.from(
      root.querySelectorAll('article.pkc-transclusion-log'),
    ).map((l) => l.getAttribute('data-pkc-embedded-log-id'));
    expect(ids).toEqual(['log-a', 'log-b']);
  });

  it('range: transclusion-document is marked data-pkc-range-embed="true" (Slice 5-C)', () => {
    // Slice 5-C: range embeds share the visual vocabulary of the live
    // viewer range highlight. The marker lives on the wrapping
    // `.pkc-transclusion-document` so a single CSS descendant rule
    // can style every embedded log in the span.
    root = makeBodyEl('![](entry:textlog-1#log/log-a..log-b)');
    expandTransclusions(root, { entries, hostLid: 'host' });
    const docEl = root.querySelector('.pkc-transclusion-document');
    expect(docEl).not.toBeNull();
    expect(docEl!.getAttribute('data-pkc-range-embed')).toBe('true');
  });

  it('range-embed marker is NOT set on single-log / day / heading embeds', () => {
    // Only ranges need the "this is a span" affordance — other kinds
    // are scalar targets and should stay unmarked.
    root = makeBodyEl('![](entry:textlog-1#log/log-a)');
    expandTransclusions(root, { entries, hostLid: 'host' });
    const docEl = root.querySelector('.pkc-transclusion-document');
    expect(docEl).not.toBeNull();
    expect(docEl!.getAttribute('data-pkc-range-embed')).toBeNull();
  });

  it('removes empty <p> left behind by the auto-closed paragraph', () => {
    root = makeBodyEl('![](entry:other-text)');
    expandTransclusions(root, { entries, hostLid: 'host' });
    // Parser auto-closes the <p> when it hits our <div> placeholder,
    // leaving a <p></p>. The expander must clean this up. We can't use
    // the CSS `:empty` selector in happy-dom because it matches
    // paragraphs with text content too — so walk <p> children
    // explicitly and check for zero child nodes.
    const emptyPs = Array.from(root.querySelectorAll('p')).filter(
      (p) => p.childNodes.length === 0,
    );
    expect(emptyPs.length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────
// 3. fallback
// ─────────────────────────────────────────────────────

describe('expandTransclusions — fallback', () => {
  let entries: Entry[];

  beforeEach(() => {
    entries = makeEntries();
  });

  it('invalid grammar → broken placeholder with data-pkc-ref-broken', () => {
    // `entry:not$valid` fails TOKEN_RE so parseEntryRef → invalid.
    const root = document.createElement('div');
    root.innerHTML =
      '<div class="pkc-transclusion-placeholder" data-pkc-embed-ref="entry:not$valid" data-pkc-embed-alt=""></div>';
    expandTransclusions(root, { entries, hostLid: 'host' });
    const broken = root.querySelector('.pkc-transclusion-broken');
    expect(broken).not.toBeNull();
    expect(broken!.getAttribute('data-pkc-ref-broken')).toBe('true');
    expect(broken!.getAttribute('data-pkc-embed-ref')).toBe('entry:not$valid');
  });

  it('missing entry → broken placeholder', () => {
    const root = makeBodyEl('![](entry:ghost)');
    expandTransclusions(root, { entries, hostLid: 'host' });
    const broken = root.querySelector('.pkc-transclusion-broken');
    expect(broken).not.toBeNull();
    expect(broken!.getAttribute('data-pkc-embed-ref')).toBe('entry:ghost');
  });

  it('missing log in otherwise-valid textlog → fallback message inside embed', () => {
    const root = makeBodyEl('![](entry:textlog-1#log/log-missing)');
    expandTransclusions(root, { entries, hostLid: 'host' });
    // Section is still built (entry exists) but body shows a fallback message.
    const section = root.querySelector('section.pkc-transclusion');
    expect(section).not.toBeNull();
    expect(section!.querySelector('.pkc-transclusion-fallback')).not.toBeNull();
  });

  it('missing day in textlog → fallback message', () => {
    const root = makeBodyEl('![](entry:textlog-1#day/1999-01-01)');
    expandTransclusions(root, { entries, hostLid: 'host' });
    const section = root.querySelector('section.pkc-transclusion');
    expect(section).not.toBeNull();
    expect(section!.querySelector('.pkc-transclusion-fallback')).not.toBeNull();
  });

  it('empty textlog (entry kind) → fallback message, no day sections', () => {
    const root = makeBodyEl('![](entry:empty-textlog)');
    expandTransclusions(root, { entries, hostLid: 'host' });
    const section = root.querySelector('section.pkc-transclusion');
    expect(section).not.toBeNull();
    expect(section!.querySelector('.pkc-transclusion-fallback')).not.toBeNull();
    expect(section!.querySelector('article.pkc-transclusion-log')).toBeNull();
  });

  it('self-embed → degrades to navigate link (no infinite recursion)', () => {
    // hostLid matches the embed target → self-embed.
    const root = makeBodyEl('![](entry:host)');
    expandTransclusions(root, { entries, hostLid: 'host' });
    // No section embedded; link fallback instead.
    expect(root.querySelector('section.pkc-transclusion')).toBeNull();
    const link = root.querySelector('a.pkc-transclusion-fallback-link');
    expect(link).not.toBeNull();
    expect(link!.getAttribute('data-pkc-action')).toBe('navigate-entry-ref');
    expect(link!.getAttribute('data-pkc-entry-ref')).toBe('entry:host');
  });

  it('heading-form ref → link fallback (headings are not embed targets)', () => {
    const root = makeBodyEl('![](entry:textlog-1#log/log-a/morning)');
    expandTransclusions(root, { entries, hostLid: 'host' });
    expect(root.querySelector('section.pkc-transclusion')).toBeNull();
    const link = root.querySelector('a.pkc-transclusion-fallback-link');
    expect(link).not.toBeNull();
  });

  it('nested embed (depth > 1) → inner ref degrades to link', () => {
    // Spec: only one level of embed is allowed. An `entry:` image
    // that appears inside a body that is already being embedded must
    // degrade to a plain navigate link instead of recursively
    // expanding into another section.
    const withNested: Entry[] = [
      ...entries,
      {
        lid: 'outer',
        archetype: 'text',
        title: 'Outer',
        body: '# Outer\n\n![](entry:inner)',
        created_at: '',
        updated_at: '',
      },
      {
        lid: 'inner',
        archetype: 'text',
        title: 'Inner',
        body: 'inner prose',
        created_at: '',
        updated_at: '',
      },
    ];
    const root = makeBodyEl('![](entry:outer)');
    expandTransclusions(root, { entries: withNested, hostLid: 'host' });
    // The outer expansion must produce a section (depth 1 — allowed).
    const outer = root.querySelector('section.pkc-transclusion[data-pkc-embed-source="entry:outer"]');
    expect(outer).not.toBeNull();
    // Inside outer, `![](entry:inner)` is a second-level embed → link fallback,
    // NOT another section.
    expect(
      outer!.querySelector('section.pkc-transclusion[data-pkc-embed-source="entry:inner"]'),
    ).toBeNull();
    expect(outer!.querySelector('a.pkc-transclusion-fallback-link')).not.toBeNull();
  });

  it('cycle (A → B → A) is cut by the depth guard', () => {
    // A embeds B; B embeds A. With depth ≤ 1 the second-level embed
    // of B inside A's body degrades to a link so we never recurse.
    const cyclic: Entry[] = [
      ...entries,
      {
        lid: 'A',
        archetype: 'text',
        title: 'A',
        body: '# A\n\n![](entry:B)',
        created_at: '',
        updated_at: '',
      },
      {
        lid: 'B',
        archetype: 'text',
        title: 'B',
        body: '# B\n\n![](entry:A)',
        created_at: '',
        updated_at: '',
      },
    ];
    const root = makeBodyEl('![](entry:A)');
    expandTransclusions(root, { entries: cyclic, hostLid: 'host' });
    const a = root.querySelector('section[data-pkc-embed-source="entry:A"]');
    expect(a).not.toBeNull();
    // Inside A, `![](entry:B)` is a second-level embed → degrades to a link
    // rather than recursing (and potentially embedding A again).
    expect(a!.querySelector('section[data-pkc-embed-source="entry:B"]')).toBeNull();
    expect(a!.querySelector('a.pkc-transclusion-fallback-link')).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────
// 4. regressions
// ─────────────────────────────────────────────────────

describe('expandTransclusions — regressions', () => {
  let entries: Entry[];

  beforeEach(() => {
    entries = makeEntries();
  });

  it('non-entry image (e.g., data:image/png) is untouched', () => {
    const root = makeBodyEl('![x](data:image/png;base64,iVBORw0KGgo=)');
    expandTransclusions(root, { entries, hostLid: 'host' });
    // The img tag is still there; no placeholder; no section.
    expect(root.querySelector('img')).not.toBeNull();
    expect(root.querySelector('section.pkc-transclusion')).toBeNull();
  });

  it('regular entry: link (Slice 5-A) is untouched — only image form transcludes', () => {
    const root = makeBodyEl('[go](entry:other-text)');
    expandTransclusions(root, { entries, hostLid: 'host' });
    // The anchor still has its navigate-entry-ref attributes.
    const a = root.querySelector('a[href="entry:other-text"]');
    expect(a).not.toBeNull();
    expect(a!.getAttribute('data-pkc-action')).toBe('navigate-entry-ref');
    // No transclusion section was created.
    expect(root.querySelector('section.pkc-transclusion')).toBeNull();
  });

  it('task checkboxes in embedded subtree are disabled and marked data-pkc-embedded', () => {
    // Put a task-list item inside a TEXT entry, then embed that entry.
    const withTasks: Entry[] = [
      ...entries,
      {
        lid: 'with-tasks',
        archetype: 'text',
        title: 'Tasks',
        body: '- [ ] first\n- [x] second',
        created_at: '',
        updated_at: '',
      },
    ];
    const root = makeBodyEl('![](entry:with-tasks)');
    expandTransclusions(root, { entries: withTasks, hostLid: 'host' });
    const embedded = root.querySelectorAll('input.pkc-task-checkbox');
    expect(embedded.length).toBe(2);
    for (const cb of Array.from(embedded)) {
      expect(cb.hasAttribute('disabled')).toBe(true);
      expect(cb.getAttribute('data-pkc-embedded')).toBe('true');
    }
  });

  it('headings inside an embedded TEXT body lose their id attribute', () => {
    const root = makeBodyEl('![](entry:other-text)');
    expandTransclusions(root, { entries, hostLid: 'host' });
    // `# Hello` would normally get `id="hello"`; inside the embed that id is stripped.
    const h1 = root.querySelector('section.pkc-transclusion h1');
    expect(h1).not.toBeNull();
    expect(h1!.hasAttribute('id')).toBe(false);
  });

  it('expander is a no-op when there are no placeholders', () => {
    const root = makeBodyEl('# plain\n\ntext only');
    const before = root.innerHTML;
    expandTransclusions(root, { entries, hostLid: 'host' });
    expect(root.innerHTML).toBe(before);
  });

  it('calling expandTransclusions twice is idempotent (placeholders consumed)', () => {
    const root = makeBodyEl('![](entry:other-text)');
    expandTransclusions(root, { entries, hostLid: 'host' });
    const afterFirst = root.innerHTML;
    expandTransclusions(root, { entries, hostLid: 'host' });
    expect(root.innerHTML).toBe(afterFirst);
  });

  it('source backlink label includes entry title and fragment tail', () => {
    const root = makeBodyEl('![](entry:textlog-1#log/log-b)');
    expandTransclusions(root, { entries, hostLid: 'host' });
    const backlink = root.querySelector('a.pkc-transclusion-source');
    expect(backlink!.textContent).toContain('Work log');
    expect(backlink!.textContent).toContain('log/log-b');
  });
});
