/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher as _createRawDispatcher } from '@adapter/state/dispatcher';
import { render } from '@adapter/ui/renderer';
import { registerPresenter } from '@adapter/ui/detail-presenter';
import { attachmentPresenter } from '@adapter/ui/attachment-presenter';
import { textlogPresenter } from '@adapter/ui/textlog-presenter';
import type { Container } from '@core/model/container';
import type { DomainEvent } from '@core/action/domain-event';

// Register the textlog presenter once so the renderer can draw textlog entries
// during these tests. Registration is idempotent.
registerPresenter('textlog', textlogPresenter);
registerPresenter('attachment', attachmentPresenter);

// Default fixture used by the Storage Profile open/close describe below.
// TOC jump and navigate-entry-ref describes each build their own fixture
// container (`tocContainer`, etc.).
const mockContainer: Container = {
  meta: {
    container_id: 'test-id',
    title: 'Test',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    schema_version: 1,
  },
  entries: [
    {
      lid: 'e1',
      title: 'Entry One',
      body: 'Body one',
      archetype: 'text',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ],
  relations: [],
  revisions: [],
  assets: {},
};

let root: HTMLElement;
let cleanup: () => void;

// --- Stale-listener prevention infrastructure ---
// Every dispatcher.onState / onEvent subscription is auto-tracked here.
// The beforeEach teardown calls all accumulated unsubscribe functions,
// ensuring no stale listener can render into a subsequent test's root.
const _trackedUnsubs: (() => void)[] = [];

function createDispatcher() {
  const d = _createRawDispatcher();
  return {
    ...d,
    onState(listener: Parameters<typeof d.onState>[0]) {
      const unsub = d.onState(listener);
      _trackedUnsubs.push(unsub);
      return unsub;
    },
    onEvent(listener: Parameters<typeof d.onEvent>[0]) {
      const unsub = d.onEvent(listener);
      _trackedUnsubs.push(unsub);
      return unsub;
    },
  };
}

beforeEach(() => {
  root = document.createElement('div');
  root.id = 'pkc-root';
  document.body.appendChild(root);
  return () => {
    cleanup?.();
    for (const fn of _trackedUnsubs) fn();
    _trackedUnsubs.length = 0;
    root.remove();
  };
});

// NOTE: `setup()` helper is not used in this file — each TOC / navigate-entry-ref
// describe bootstraps its own dispatcher + render fixture inline with a
// custom Container (`tocContainer`, etc.). The shared `root` / `cleanup` /
// `_trackedUnsubs` scaffolding above remains useful.

// ── TOC jump (A-3) ────────────────────────────

describe('ActionBinder — TOC jump', () => {
  const tocContainer: Container = {
    meta: {
      container_id: 'toc-test', title: 'TOC Test',
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', schema_version: 1,
    },
    entries: [
      {
        lid: 'tx-1',
        title: 'With TOC',
        body: '# Introduction\n\n## Details\n\ntext here',
        archetype: 'text',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      {
        lid: 'tl-1',
        title: 'Log',
        body: JSON.stringify({
          entries: [
            { id: 'log-a', text: '# Overview', createdAt: '2026-04-09T10:00:00Z', flags: [] },
            { id: 'log-b', text: '# Overview', createdAt: '2026-04-09T11:00:00Z', flags: [] },
          ],
        }),
        archetype: 'textlog',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };

  function setupToc(selectedLid: string) {
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: tocContainer });
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: selectedLid });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);
    return { dispatcher };
  }

  it('TEXT: click on TOC item calls scrollIntoView on the heading with matching id', () => {
    setupToc('tx-1');

    const heading = root.querySelector('#introduction') as HTMLElement | null;
    expect(heading).not.toBeNull();
    const spy = vi.fn();
    heading!.scrollIntoView = spy;

    const tocBtn = root.querySelector<HTMLElement>(
      '[data-pkc-action="toc-jump"][data-pkc-toc-slug="introduction"]',
    );
    expect(tocBtn).not.toBeNull();
    tocBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('TEXTLOG: click scopes the lookup to the owning log row so duplicate slugs do not collide', () => {
    setupToc('tl-1');

    // Both log rows contain an <h1 id="overview">. The TOC click must
    // hit the id inside the log row that matches data-pkc-log-id.
    const rowA = root.querySelector<HTMLElement>('[data-pkc-log-id="log-a"]');
    const rowB = root.querySelector<HTMLElement>('[data-pkc-log-id="log-b"]');
    expect(rowA).not.toBeNull();
    expect(rowB).not.toBeNull();

    const headingA = rowA!.querySelector('#overview') as HTMLElement | null;
    const headingB = rowB!.querySelector('#overview') as HTMLElement | null;
    expect(headingA).not.toBeNull();
    expect(headingB).not.toBeNull();

    const spyA = vi.fn();
    const spyB = vi.fn();
    headingA!.scrollIntoView = spyA;
    headingB!.scrollIntoView = spyB;

    // Click the heading TOC item tagged with log-b → should call spyB only.
    // Scope to the heading-kind row so the log-kind row (which also carries
    // data-pkc-log-id="log-b") does not match first — the log row would
    // jump to the article via targetId and bypass the slug scope logic
    // we're testing here.
    const tocBtn = root.querySelector<HTMLElement>(
      '[data-pkc-toc-kind="heading"] [data-pkc-action="toc-jump"][data-pkc-log-id="log-b"]',
    );
    expect(tocBtn).not.toBeNull();
    tocBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(spyA).not.toHaveBeenCalled();
    expect(spyB).toHaveBeenCalledTimes(1);
  });

  it('no-op when the target id does not exist', () => {
    setupToc('tx-1');

    // Fabricate a stray TOC button pointing to a non-existent slug.
    const fake = document.createElement('button');
    fake.setAttribute('data-pkc-action', 'toc-jump');
    fake.setAttribute('data-pkc-toc-slug', 'no-such-slug');
    root.appendChild(fake);

    // Should not throw.
    expect(() => fake.dispatchEvent(new MouseEvent('click', { bubbles: true }))).not.toThrow();
  });

  it('TEXTLOG day node click scrolls to the matching day section via targetId', () => {
    setupToc('tl-1');

    const daySection = root.querySelector<HTMLElement>('.pkc-textlog-day');
    expect(daySection).not.toBeNull();
    const targetId = daySection!.id;
    expect(targetId).toMatch(/^day-/);
    const spy = vi.fn();
    daySection!.scrollIntoView = spy;

    const tocBtn = root.querySelector<HTMLElement>(
      `[data-pkc-action="toc-jump"][data-pkc-toc-target-id="${targetId}"]`,
    );
    expect(tocBtn).not.toBeNull();
    tocBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('TEXTLOG log node click scrolls to the matching log article via targetId', () => {
    setupToc('tl-1');

    const article = root.querySelector<HTMLElement>('#log-log-a');
    expect(article).not.toBeNull();
    const spy = vi.fn();
    article!.scrollIntoView = spy;

    const tocBtn = root.querySelector<HTMLElement>(
      '[data-pkc-action="toc-jump"][data-pkc-toc-target-id="log-log-a"]',
    );
    expect(tocBtn).not.toBeNull();
    tocBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(spy).toHaveBeenCalledTimes(1);
  });
});

// ── P1 Slice 5-A: navigate-entry-ref (in-app `entry:` link navigation) ──
//
// These tests validate the click handler added in `action-binder.ts`
// for anchors stamped with `data-pkc-action="navigate-entry-ref"` by
// the markdown renderer. Three concerns are covered:
//
//   1. parser integration — entry / log / range / day / legacy / heading
//      kinds route to the right scroll target and (when the lid differs
//      from the selected one) dispatch SELECT_ENTRY.
//   2. broken-ref marking — invalid href syntax and unknown-lid both
//      stamp `data-pkc-ref-broken="true"` and do NOT navigate.
//   3. regressions — TOC jump, task checkbox, normal https links, and
//      the rendered viewer DOM are untouched by the new handler.
//
// The renderer's scroll hop is wrapped in requestAnimationFrame so we
// install a synchronous fake that invokes the callback immediately.
// The default implementation (both in node's happy-dom and in production)
// is already async, so this fake is what lets us observe scrollIntoView
// within the synchronous click handler.

describe('ActionBinder — navigate-entry-ref (P1 Slice 5-A)', () => {
  const navContainer: Container = {
    meta: {
      container_id: 'nav-test', title: 'Nav Test',
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', schema_version: 1,
    },
    entries: [
      {
        lid: 'src',
        title: 'Source',
        body:
          '[go-entry](entry:dst)\n\n' +
          '[go-log](entry:dst#log/log-a)\n\n' +
          '[go-range](entry:dst#log/log-a..log-b)\n\n' +
          '[go-day](entry:dst#day/2026-04-09)\n\n' +
          '[go-legacy](entry:dst#log-a)\n\n' +
          '[go-heading](entry:dst#log/log-a/overview)\n\n' +
          '[broken](entry:not$valid)\n\n' +
          '[missing](entry:ghost)',
        archetype: 'text',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      {
        lid: 'dst',
        title: 'Destination',
        body: JSON.stringify({
          entries: [
            { id: 'log-a', text: '# Overview\n\nmorning', createdAt: '2026-04-09T10:00:00Z', flags: [] },
            { id: 'log-b', text: '## afternoon', createdAt: '2026-04-09T14:00:00Z', flags: [] },
          ],
        }),
        archetype: 'textlog',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };

  // Make requestAnimationFrame synchronous so we can observe
  // scrollIntoView inside the click handler. Restored after each
  // test so the spy does not leak into neighbouring describes.
  beforeEach(() => {
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 0 as unknown as number;
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function setupNav(selectedLid: string) {
    const dispatcher = createDispatcher();
    const events: DomainEvent[] = [];
    dispatcher.onEvent((e) => events.push(e));
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: navContainer });
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: selectedLid });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);
    return { dispatcher, events };
  }

  function findAnchor(label: string): HTMLAnchorElement {
    const anchors = root.querySelectorAll<HTMLAnchorElement>(
      'a[data-pkc-action="navigate-entry-ref"]',
    );
    for (const a of Array.from(anchors)) {
      if (a.textContent?.trim() === label) return a;
    }
    throw new Error(`anchor with text "${label}" not found`);
  }

  it('renderer stamps navigate-entry-ref on entry: anchors in the viewer', () => {
    setupNav('src');
    const anchors = root.querySelectorAll(
      'a[data-pkc-action="navigate-entry-ref"][data-pkc-entry-ref^="entry:"]',
    );
    // All 8 body links start with `entry:`, so validateLink (which
    // accepts any `entry:...` prefix) passes them through. The
    // downstream parseEntryRef call at click time is what rejects
    // grammatically invalid inputs like `entry:not$valid` — the
    // renderer itself stays permissive.
    expect(anchors.length).toBe(8);
  });

  // Entry kind → SELECT_ENTRY, no scroll.
  it('entry kind: dispatches SELECT_ENTRY for the target lid', () => {
    const { dispatcher } = setupNav('src');
    const anchor = findAnchor('go-entry');
    anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(dispatcher.getState().selectedLid).toBe('dst');
  });

  it('entry kind: preventDefault so the browser does not try to navigate entry:', () => {
    setupNav('src');
    const anchor = findAnchor('go-entry');
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    anchor.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });

  // Log kind → SELECT_ENTRY + scroll to #log-<logId>.
  it('log kind: scrolls to the matching log article after selection', () => {
    const { dispatcher } = setupNav('src');
    const anchor = findAnchor('go-log');
    // Spy must be installed AFTER the dispatch-triggered re-render,
    // so we stub it on first invocation by patching the prototype.
    const spy = vi.fn();
    const origProto = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = spy;
    try {
      anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    } finally {
      HTMLElement.prototype.scrollIntoView = origProto;
    }
    expect(dispatcher.getState().selectedLid).toBe('dst');
    expect(spy).toHaveBeenCalled();
    // The target must be the log article with id "log-log-a".
    const targetArticle = root.querySelector<HTMLElement>('#log-log-a');
    expect(targetArticle).not.toBeNull();
  });

  // Day kind → scroll to #day-<yyyy-mm-dd>.
  it('day kind: scrolls to the matching day section', () => {
    const { dispatcher } = setupNav('src');
    const spy = vi.fn();
    const origProto = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = spy;
    try {
      findAnchor('go-day').dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true }),
      );
    } finally {
      HTMLElement.prototype.scrollIntoView = origProto;
    }
    expect(dispatcher.getState().selectedLid).toBe('dst');
    expect(spy).toHaveBeenCalled();
    const daySection = root.querySelector<HTMLElement>('[id^="day-"]');
    expect(daySection).not.toBeNull();
  });

  // Range kind → SELECT_ENTRY + scroll to #log-<fromId>.
  it('range kind: selects the entry and scrolls to the first log of the range', () => {
    const { dispatcher } = setupNav('src');
    const spy = vi.fn();
    const origProto = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = spy;
    try {
      findAnchor('go-range').dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true }),
      );
    } finally {
      HTMLElement.prototype.scrollIntoView = origProto;
    }
    expect(dispatcher.getState().selectedLid).toBe('dst');
    expect(spy).toHaveBeenCalled();
  });

  // Legacy kind (`entry:dst#log-a`) → #log-log-a.
  it('legacy kind: treats the bare fragment as a log id target', () => {
    const { dispatcher } = setupNav('src');
    const spy = vi.fn();
    const origProto = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = spy;
    try {
      findAnchor('go-legacy').dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true }),
      );
    } finally {
      HTMLElement.prototype.scrollIntoView = origProto;
    }
    expect(dispatcher.getState().selectedLid).toBe('dst');
    expect(spy).toHaveBeenCalled();
  });

  // Heading kind → scroll slug scoped to owning log row.
  it('heading kind: scopes the slug lookup to the owning log article', () => {
    const { dispatcher } = setupNav('src');
    const spy = vi.fn();
    const origProto = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = spy;
    try {
      findAnchor('go-heading').dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true }),
      );
    } finally {
      HTMLElement.prototype.scrollIntoView = origProto;
    }
    expect(dispatcher.getState().selectedLid).toBe('dst');
    expect(spy).toHaveBeenCalled();
    // The log-a article should contain an <h1 id="overview">.
    const logA = root.querySelector<HTMLElement>('[data-pkc-log-id="log-a"]');
    expect(logA).not.toBeNull();
    expect(logA!.querySelector('#overview')).not.toBeNull();
  });

  // Invalid kind → broken marker, no navigation.
  it('invalid entry: grammar produces a broken-ref marker and does not navigate', () => {
    const { dispatcher } = setupNav('src');
    // The renderer's validateLink rejects `entry:not$valid` because the
    // lid character set is strict. But a malformed entry: link might still
    // arrive through hand-written HTML or a stale paste. Fabricate a stray
    // anchor with the interception attribute so the click path is exercised.
    const fake = document.createElement('a');
    fake.setAttribute('data-pkc-action', 'navigate-entry-ref');
    fake.setAttribute('data-pkc-entry-ref', 'entry:not$valid');
    fake.setAttribute('href', 'entry:not$valid');
    fake.textContent = 'fake';
    root.appendChild(fake);
    const prevLid = dispatcher.getState().selectedLid;
    fake.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(fake.getAttribute('data-pkc-ref-broken')).toBe('true');
    expect(dispatcher.getState().selectedLid).toBe(prevLid);
  });

  // Unknown lid → broken marker, no navigation.
  it('unknown lid: marks the anchor broken and does not dispatch SELECT_ENTRY', () => {
    const { dispatcher } = setupNav('src');
    const anchor = findAnchor('missing');
    const prevLid = dispatcher.getState().selectedLid;
    anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(anchor.getAttribute('data-pkc-ref-broken')).toBe('true');
    expect(dispatcher.getState().selectedLid).toBe(prevLid);
  });

  it('broken marker is cleared when a once-broken ref resolves on a later click', () => {
    const { dispatcher } = setupNav('src');
    // Fabricate an anchor pointing to an existing entry but pre-mark it broken.
    const fake = document.createElement('a');
    fake.setAttribute('data-pkc-action', 'navigate-entry-ref');
    fake.setAttribute('data-pkc-entry-ref', 'entry:dst');
    fake.setAttribute('href', 'entry:dst');
    fake.setAttribute('data-pkc-ref-broken', 'true');
    fake.textContent = 'stale';
    root.appendChild(fake);
    fake.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(fake.hasAttribute('data-pkc-ref-broken')).toBe(false);
    expect(dispatcher.getState().selectedLid).toBe('dst');
  });

  it('same-lid navigation does NOT re-dispatch SELECT_ENTRY', () => {
    // Start already on dst; a click to entry:dst should be a no-op dispatch.
    const { dispatcher, events } = setupNav('dst');
    // The navContainer body of dst is a textlog, so we need a source anchor.
    // Fabricate one.
    const fake = document.createElement('a');
    fake.setAttribute('data-pkc-action', 'navigate-entry-ref');
    fake.setAttribute('data-pkc-entry-ref', 'entry:dst');
    fake.setAttribute('href', 'entry:dst');
    fake.textContent = 'self';
    root.appendChild(fake);
    const evBefore = events.filter((e) => e.type === 'ENTRY_SELECTED').length;
    fake.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    const evAfter = events.filter((e) => e.type === 'ENTRY_SELECTED').length;
    expect(evAfter).toBe(evBefore);
    expect(dispatcher.getState().selectedLid).toBe('dst');
  });

  // ── Regression: unrelated paths unchanged ──

  it('regression: normal https links still get target=_blank and are NOT intercepted', () => {
    const container: Container = {
      ...navContainer,
      entries: [
        {
          lid: 'only',
          title: 'Only',
          body: '[ext](https://example.com)',
          archetype: 'text',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
    };
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'only' });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);

    const httpsLink = root.querySelector<HTMLAnchorElement>(
      'a[href="https://example.com"]',
    );
    expect(httpsLink).not.toBeNull();
    expect(httpsLink!.getAttribute('target')).toBe('_blank');
    expect(httpsLink!.getAttribute('rel')).toContain('noopener');
    expect(httpsLink!.hasAttribute('data-pkc-action')).toBe(false);
  });

});

// ──────────────────────────────────────────────────────────────
// Storage Profile dialog — open/close integration
// ──────────────────────────────────────────────────────────────
//
// The dialog is mounted on demand by the `show-storage-profile`
// handler and removed on close. These tests pin the open/close
// lifecycle end-to-end through action-binder. Data-shape coverage
// for the aggregator lives in `tests/features/asset/storage-profile.test.ts`;
// the overlay builder is covered in `tests/adapter/renderer.test.ts`.
//
// (This test block was previously deferred because the old single
// `action-binder.test.ts` had saturated the 4 GB sandbox memory
// ceiling. After the file was split by describe-block boundaries,
// there is enough headroom to land the integration coverage here.)

describe('ActionBinder — Storage Profile dialog', () => {
  function setupWithMenuOpen() {
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: mockContainer });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);
    return { dispatcher };
  }

  it('clicking show-storage-profile mounts the overlay on the root', () => {
    setupWithMenuOpen();

    // Overlay must not exist before the user clicks the launch button.
    expect(root.querySelector('[data-pkc-region="storage-profile"]')).toBeNull();

    const launchBtn = root.querySelector<HTMLElement>(
      '[data-pkc-action="show-storage-profile"]',
    );
    expect(launchBtn).not.toBeNull();
    launchBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const overlay = root.querySelector<HTMLElement>(
      '[data-pkc-region="storage-profile"]',
    );
    expect(overlay).not.toBeNull();
    // Overlay carries its own close button so the user can dismiss it.
    expect(
      overlay!.querySelector('[data-pkc-action="close-storage-profile"]'),
    ).not.toBeNull();
  });

  it('clicking close-storage-profile removes the overlay from the root', () => {
    setupWithMenuOpen();

    root
      .querySelector<HTMLElement>('[data-pkc-action="show-storage-profile"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(
      root.querySelector('[data-pkc-region="storage-profile"]'),
    ).not.toBeNull();

    root
      .querySelector<HTMLElement>('[data-pkc-action="close-storage-profile"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(root.querySelector('[data-pkc-region="storage-profile"]')).toBeNull();
  });

  it('reopening after close rebuilds a fresh overlay (no stale node)', () => {
    setupWithMenuOpen();
    const launch = () =>
      root
        .querySelector<HTMLElement>('[data-pkc-action="show-storage-profile"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const close = () =>
      root
        .querySelector<HTMLElement>('[data-pkc-action="close-storage-profile"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));

    launch();
    close();
    launch();

    // Exactly one overlay mounted after reopen — the previous instance
    // must have been removed by close (no duplicate accumulation).
    const overlays = root.querySelectorAll('[data-pkc-region="storage-profile"]');
    expect(overlays.length).toBe(1);
  });
});

