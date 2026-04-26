/**
 * @vitest-environment happy-dom
 *
 * Card widget hydrator — Slice 5.0 minimal chrome.
 *
 * Spec: docs/spec/card-embed-presentation-v0.md §5
 *       docs/development/card-widget-ui-v0-audit.md
 *
 * Verifies that `hydrateCardPlaceholders()`:
 *   - Replaces the `@card` placeholder text with archetype badge +
 *     entry title for ok / same-container targets.
 *   - Renders the missing / cross-container / malformed states with
 *     the documented chrome and a11y attributes.
 *   - Preserves the Slice 2/3.5/4 contract (`.pkc-card-placeholder`,
 *     `data-pkc-action="navigate-card-ref"`, `data-pkc-card-*`,
 *     `role="link"`, `tabindex` semantics) so click + keyboard
 *     wiring keeps working untouched.
 *   - Is idempotent: a second pass over the same DOM updates the
 *     widget when the entry has changed without leaving stale chrome.
 *   - Asset-target placeholders that bypass the parser (hand-crafted
 *     DOM) get the malformed chrome — defence-in-depth for the
 *     parser-level reject in Slice 3.5.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { hydrateCardPlaceholders } from '@adapter/ui/card-hydrator';
import type { Entry } from '@core/model/record';

let root: HTMLElement;

beforeEach(() => {
  root = document.createElement('div');
});

function makePlaceholder(target: string, variant = 'default'): HTMLElement {
  const span = document.createElement('span');
  span.className = 'pkc-card-placeholder';
  span.setAttribute('data-pkc-action', 'navigate-card-ref');
  span.setAttribute('data-pkc-card-target', target);
  span.setAttribute('data-pkc-card-variant', variant);
  span.setAttribute('data-pkc-card-raw', `@[card](${target})`);
  span.setAttribute('role', 'link');
  span.setAttribute('tabindex', '0');
  span.textContent = '@card';
  root.appendChild(span);
  return span;
}

const TODAY = '2026-04-25T00:00:00Z';
function entry(lid: string, title: string, archetype: Entry['archetype'] = 'text', body = ''): Entry {
  return {
    lid, title, body, archetype,
    created_at: TODAY, updated_at: TODAY,
  };
}

describe('hydrateCardPlaceholders — ok state', () => {
  it('inserts archetype badge + entry title for same-container entry', () => {
    const ph = makePlaceholder('entry:e1');
    hydrateCardPlaceholders(root, {
      entries: [entry('e1', 'Hello world')],
      currentContainerId: 'cid-1',
    });
    expect(ph.getAttribute('data-pkc-card-status')).toBe('ok');
    const badge = ph.querySelector('.pkc-card-widget-badge')?.textContent;
    const title = ph.querySelector('.pkc-card-widget-title')?.textContent;
    expect(badge).toContain('Text');
    expect(title).toBe('Hello world');
  });

  it('uses Untitled when entry title is empty', () => {
    const ph = makePlaceholder('entry:e1');
    hydrateCardPlaceholders(root, {
      entries: [entry('e1', '   ')],
      currentContainerId: 'cid-1',
    });
    expect(ph.querySelector('.pkc-card-widget-title')?.textContent).toBe('Untitled');
  });

  it('shows the right archetype for textlog / todo / folder / attachment', () => {
    const cases: Array<[Entry['archetype'], string]> = [
      ['textlog', 'Log'],
      ['todo', 'Todo'],
      ['folder', 'Folder'],
      ['attachment', 'File'],
    ];
    for (const [archetype, label] of cases) {
      const fresh = document.createElement('div');
      const span = document.createElement('span');
      span.className = 'pkc-card-placeholder';
      span.setAttribute('data-pkc-card-target', `entry:e-${archetype}`);
      fresh.appendChild(span);
      hydrateCardPlaceholders(fresh, {
        entries: [entry(`e-${archetype}`, `${archetype} entry`, archetype)],
        currentContainerId: 'cid-1',
      });
      expect(span.querySelector('.pkc-card-widget-badge')?.textContent).toContain(label);
    }
  });

  it('demotes pkc://<self>/entry/<lid> to entry: lookup', () => {
    const ph = makePlaceholder('pkc://cid-1/entry/e1', 'wide');
    hydrateCardPlaceholders(root, {
      entries: [entry('e1', 'Self container')],
      currentContainerId: 'cid-1',
    });
    expect(ph.getAttribute('data-pkc-card-status')).toBe('ok');
    expect(ph.querySelector('.pkc-card-widget-title')?.textContent).toBe('Self container');
  });

  it('preserves Slice 2/3.5/4 attributes verbatim for ok state', () => {
    const ph = makePlaceholder('entry:e1');
    hydrateCardPlaceholders(root, {
      entries: [entry('e1', 'Hello')],
      currentContainerId: 'cid-1',
    });
    expect(ph.classList.contains('pkc-card-placeholder')).toBe(true);
    expect(ph.classList.contains('pkc-card-widget')).toBe(true);
    expect(ph.getAttribute('data-pkc-action')).toBe('navigate-card-ref');
    expect(ph.getAttribute('data-pkc-card-target')).toBe('entry:e1');
    expect(ph.getAttribute('data-pkc-card-variant')).toBe('default');
    expect(ph.getAttribute('data-pkc-card-raw')).toBe('@[card](entry:e1)');
    expect(ph.getAttribute('role')).toBe('link');
    expect(ph.getAttribute('tabindex')).toBe('0');
    // ok state must NOT carry aria-disabled.
    expect(ph.getAttribute('aria-disabled')).toBeNull();
  });

  it('sets aria-label that names archetype + title for screen readers', () => {
    const ph = makePlaceholder('entry:e1');
    hydrateCardPlaceholders(root, {
      entries: [entry('e1', 'My note')],
      currentContainerId: 'cid-1',
    });
    expect(ph.getAttribute('aria-label')).toContain('My note');
    expect(ph.getAttribute('aria-label')).toContain('Text');
  });
});

describe('hydrateCardPlaceholders — missing state', () => {
  it('renders Entry not found chrome for unknown lid', () => {
    const ph = makePlaceholder('entry:ghost');
    hydrateCardPlaceholders(root, {
      entries: [entry('e1', 'Real')],
      currentContainerId: 'cid-1',
    });
    expect(ph.getAttribute('data-pkc-card-status')).toBe('missing');
    expect(ph.querySelector('.pkc-card-widget-title')?.textContent).toContain('Entry not found');
    expect(ph.querySelector('.pkc-card-widget-title')?.textContent).toContain('ghost');
  });

  it('flips missing card to a11y-disabled + tabindex -1', () => {
    const ph = makePlaceholder('entry:ghost');
    hydrateCardPlaceholders(root, {
      entries: [],
      currentContainerId: 'cid-1',
    });
    expect(ph.getAttribute('aria-disabled')).toBe('true');
    expect(ph.getAttribute('tabindex')).toBe('-1');
  });
});

describe('hydrateCardPlaceholders — cross-container state', () => {
  it('renders cross-container skeleton for pkc://<other>/entry/<lid>', () => {
    const ph = makePlaceholder('pkc://other-cid/entry/e9');
    hydrateCardPlaceholders(root, {
      entries: [],
      currentContainerId: 'cid-1',
    });
    expect(ph.getAttribute('data-pkc-card-status')).toBe('cross-container');
    expect(ph.querySelector('.pkc-card-widget-badge')?.textContent).toContain('Cross-container');
    expect(ph.querySelector('.pkc-card-widget-title')?.textContent).toContain('other-cid');
  });

  it('makes cross-container card inert for keyboard / a11y', () => {
    const ph = makePlaceholder('pkc://other-cid/entry/e9');
    hydrateCardPlaceholders(root, {
      entries: [],
      currentContainerId: 'cid-1',
    });
    expect(ph.getAttribute('aria-disabled')).toBe('true');
    expect(ph.getAttribute('tabindex')).toBe('-1');
    expect(ph.getAttribute('aria-label')).toContain('other-cid');
  });
});

describe('hydrateCardPlaceholders — malformed state', () => {
  it('renders Malformed card chrome for an empty target', () => {
    const ph = makePlaceholder('');
    hydrateCardPlaceholders(root, {
      entries: [],
      currentContainerId: 'cid-1',
    });
    expect(ph.getAttribute('data-pkc-card-status')).toBe('malformed');
    expect(ph.querySelector('.pkc-card-widget-title')?.textContent).toBe('Malformed card');
    expect(ph.getAttribute('aria-disabled')).toBe('true');
  });

  it('treats a hand-crafted asset target as malformed (defence-in-depth)', () => {
    const ph = makePlaceholder('asset:a1');
    hydrateCardPlaceholders(root, {
      entries: [entry('a1', 'should not match')],
      currentContainerId: 'cid-1',
    });
    expect(ph.getAttribute('data-pkc-card-status')).toBe('malformed');
  });

  it('treats a hand-crafted pkc://<cid>/asset/<key> as malformed', () => {
    const ph = makePlaceholder('pkc://cid-1/asset/a1');
    hydrateCardPlaceholders(root, {
      entries: [],
      currentContainerId: 'cid-1',
    });
    expect(ph.getAttribute('data-pkc-card-status')).toBe('malformed');
  });

  it('treats a malformed pkc:// URL as malformed', () => {
    const ph = makePlaceholder('pkc://nope');
    hydrateCardPlaceholders(root, {
      entries: [],
      currentContainerId: 'cid-1',
    });
    expect(ph.getAttribute('data-pkc-card-status')).toBe('malformed');
  });
});

describe('hydrateCardPlaceholders — re-hydration', () => {
  it('updates widget chrome on a second pass when the entry was renamed', () => {
    const ph = makePlaceholder('entry:e1');
    hydrateCardPlaceholders(root, {
      entries: [entry('e1', 'First title')],
      currentContainerId: 'cid-1',
    });
    expect(ph.querySelector('.pkc-card-widget-title')?.textContent).toBe('First title');
    // Second pass with renamed entry — chrome must reflect the new title
    // and there must be only one title node (no stale doubling).
    hydrateCardPlaceholders(root, {
      entries: [entry('e1', 'Second title')],
      currentContainerId: 'cid-1',
    });
    const titles = ph.querySelectorAll('.pkc-card-widget-title');
    expect(titles).toHaveLength(1);
    expect(titles[0]!.textContent).toBe('Second title');
  });

  it('flips state from ok to missing when the entry disappears', () => {
    const ph = makePlaceholder('entry:e1');
    hydrateCardPlaceholders(root, {
      entries: [entry('e1', 'Was here')],
      currentContainerId: 'cid-1',
    });
    expect(ph.getAttribute('data-pkc-card-status')).toBe('ok');
    hydrateCardPlaceholders(root, {
      entries: [],
      currentContainerId: 'cid-1',
    });
    expect(ph.getAttribute('data-pkc-card-status')).toBe('missing');
    expect(ph.getAttribute('aria-disabled')).toBe('true');
  });

  it('clears aria-disabled when an entry comes back', () => {
    const ph = makePlaceholder('entry:e1');
    hydrateCardPlaceholders(root, {
      entries: [],
      currentContainerId: 'cid-1',
    });
    expect(ph.getAttribute('aria-disabled')).toBe('true');
    hydrateCardPlaceholders(root, {
      entries: [entry('e1', 'Recovered')],
      currentContainerId: 'cid-1',
    });
    expect(ph.getAttribute('aria-disabled')).toBeNull();
  });
});

describe('hydrateCardPlaceholders — no-op cases', () => {
  it('is a no-op when there are no placeholders', () => {
    const html = '<p>plain text</p>';
    root.innerHTML = html;
    hydrateCardPlaceholders(root, { entries: [], currentContainerId: 'cid-1' });
    expect(root.innerHTML).toBe(html);
  });

  it('walks multiple placeholders independently', () => {
    makePlaceholder('entry:e1');
    makePlaceholder('entry:ghost');
    makePlaceholder('pkc://other-cid/entry/e2');
    hydrateCardPlaceholders(root, {
      entries: [entry('e1', 'OK target')],
      currentContainerId: 'cid-1',
    });
    const phs = root.querySelectorAll<HTMLElement>('.pkc-card-placeholder');
    expect(phs[0]!.getAttribute('data-pkc-card-status')).toBe('ok');
    expect(phs[1]!.getAttribute('data-pkc-card-status')).toBe('missing');
    expect(phs[2]!.getAttribute('data-pkc-card-status')).toBe('cross-container');
  });
});

describe('hydrateCardPlaceholders — Slice 5.1 excerpt', () => {
  it('renders an excerpt under the title for TEXT entries with body', () => {
    const ph = makePlaceholder('entry:e1');
    hydrateCardPlaceholders(root, {
      entries: [entry('e1', 'Hello', 'text', 'this is the body content')],
      currentContainerId: 'cid-1',
    });
    const excerpt = ph.querySelector('.pkc-card-widget-excerpt');
    expect(excerpt).not.toBeNull();
    expect(excerpt!.textContent).toBe('this is the body content');
  });

  it('omits the excerpt slot entirely when the body is empty', () => {
    const ph = makePlaceholder('entry:e1');
    hydrateCardPlaceholders(root, {
      entries: [entry('e1', 'Hello', 'text', '')],
      currentContainerId: 'cid-1',
    });
    expect(ph.querySelector('.pkc-card-widget-excerpt')).toBeNull();
  });

  it('omits the excerpt slot for archetypes without prose preview (attachment)', () => {
    const ph = makePlaceholder('entry:a1');
    hydrateCardPlaceholders(root, {
      entries: [entry('a1', 'photo.png', 'attachment', '{"key":"k","name":"photo.png","mime":"image/png"}')],
      currentContainerId: 'cid-1',
    });
    expect(ph.querySelector('.pkc-card-widget-excerpt')).toBeNull();
    // Title still renders untouched.
    expect(ph.querySelector('.pkc-card-widget-title')?.textContent).toBe('photo.png');
  });

  it('uses the named log for textlog #log/<id> targets', () => {
    const ph = makePlaceholder('entry:t1#log/b');
    const body = JSON.stringify({
      entries: [
        { id: 'a', text: 'first', createdAt: '2026-04-25T09:00:00Z', flags: [] },
        { id: 'b', text: 'second', createdAt: '2026-04-25T10:00:00Z', flags: [] },
      ],
    });
    hydrateCardPlaceholders(root, {
      entries: [entry('t1', 'My log', 'textlog', body)],
      currentContainerId: 'cid-1',
    });
    expect(ph.querySelector('.pkc-card-widget-excerpt')?.textContent).toBe('second');
  });

  it('uses the most recent log for textlog entry: target', () => {
    const ph = makePlaceholder('entry:t1');
    const body = JSON.stringify({
      entries: [
        { id: 'a', text: 'first', createdAt: '2026-04-25T09:00:00Z', flags: [] },
        { id: 'b', text: 'latest', createdAt: '2026-04-25T11:00:00Z', flags: [] },
      ],
    });
    hydrateCardPlaceholders(root, {
      entries: [entry('t1', 'My log', 'textlog', body)],
      currentContainerId: 'cid-1',
    });
    expect(ph.querySelector('.pkc-card-widget-excerpt')?.textContent).toBe('latest');
  });

  it('flattens markdown in the excerpt (headings, links)', () => {
    const ph = makePlaceholder('entry:e1');
    hydrateCardPlaceholders(root, {
      entries: [
        entry(
          'e1',
          'T',
          'text',
          '# Heading\n\nsee [the doc](entry:e2) for more',
        ),
      ],
      currentContainerId: 'cid-1',
    });
    expect(ph.querySelector('.pkc-card-widget-excerpt')?.textContent).toBe(
      'Heading see the doc for more',
    );
  });

  it('extends aria-label to include the excerpt for screen readers', () => {
    const ph = makePlaceholder('entry:e1');
    hydrateCardPlaceholders(root, {
      entries: [entry('e1', 'Title', 'text', 'sample body')],
      currentContainerId: 'cid-1',
    });
    expect(ph.getAttribute('aria-label')).toContain('sample body');
    expect(ph.getAttribute('aria-label')).toContain('Title');
  });

  it('does not alter aria-label suffix when no excerpt is available', () => {
    const ph = makePlaceholder('entry:e1');
    hydrateCardPlaceholders(root, {
      entries: [entry('e1', 'Title', 'text', '')],
      currentContainerId: 'cid-1',
    });
    // Slice 5.0-shape aria-label (without trailing excerpt) is preserved.
    expect(ph.getAttribute('aria-label')).toBe('Card · Text · Title');
  });

  it('uses textContent (not innerHTML) so script content cannot escape', () => {
    const ph = makePlaceholder('entry:e1');
    hydrateCardPlaceholders(root, {
      entries: [
        entry('e1', 'T', 'text', 'before <script>alert(1)</script> after'),
      ],
      currentContainerId: 'cid-1',
    });
    const excerpt = ph.querySelector('.pkc-card-widget-excerpt')!;
    // The excerpt element exists but contains zero `<script>` children
    // (the builder strips the tag + content; even if the text were
    // preserved it would land inside textContent which the browser
    // never re-parses as HTML).
    expect(excerpt.querySelector('script')).toBeNull();
    expect(excerpt.textContent).not.toContain('<script>');
    expect(excerpt.textContent).toBe('before after');
  });

  it('replaces the excerpt on re-hydration when the body changes', () => {
    const ph = makePlaceholder('entry:e1');
    hydrateCardPlaceholders(root, {
      entries: [entry('e1', 'T', 'text', 'first body')],
      currentContainerId: 'cid-1',
    });
    expect(ph.querySelector('.pkc-card-widget-excerpt')?.textContent).toBe('first body');
    hydrateCardPlaceholders(root, {
      entries: [entry('e1', 'T', 'text', 'second body')],
      currentContainerId: 'cid-1',
    });
    const slots = ph.querySelectorAll('.pkc-card-widget-excerpt');
    expect(slots).toHaveLength(1);
    expect(slots[0]!.textContent).toBe('second body');
  });
});
