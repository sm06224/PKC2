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

  it('entry-ref click opts into ancestor reveal (PR-ε₁)', () => {
    // External jump from body markdown link → target may live under
    // a collapsed folder; `revealInSidebar: true` must be threaded so
    // the reducer expands ancestors.
    const { dispatcher } = setupNav('src');
    const dispatchSpy = vi.spyOn(dispatcher, 'dispatch');
    findAnchor('go-entry').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    const selectCalls = dispatchSpy.mock.calls
      .map((c) => c[0] as { type: string })
      .filter((a) => a.type === 'SELECT_ENTRY');
    expect(selectCalls).toHaveLength(1);
    expect((selectCalls[0] as { revealInSidebar?: boolean }).revealInSidebar).toBe(true);
    dispatchSpy.mockRestore();
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

  // PR-α regression: previously `show-storage-profile` appended the
  // overlay outside the renderer and then dispatched CLOSE_MENU,
  // whose re-render did `root.innerHTML = ''` and wiped the overlay
  // on the same tick (cluster A).
  it('overlay survives CLOSE_MENU re-render after show-storage-profile', () => {
    const { dispatcher } = setupWithMenuOpen();
    // Open the shell menu first so the subsequent CLOSE_MENU actually
    // flips state (and therefore triggers the re-render that used to
    // wipe the ad-hoc overlay).
    dispatcher.dispatch({ type: 'TOGGLE_MENU' });
    expect(dispatcher.getState().menuOpen).toBe(true);

    root
      .querySelector<HTMLElement>('[data-pkc-action="show-storage-profile"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));

    // After `show-storage-profile`: menu is closed AND the overlay is
    // still mounted — the bug was that the overlay disappeared here.
    expect(dispatcher.getState().menuOpen).toBe(false);
    expect(dispatcher.getState().storageProfileOpen).toBe(true);
    expect(root.querySelector('[data-pkc-region="storage-profile"]')).not.toBeNull();
  });

  it('unrelated state change does not wipe the storage profile overlay', () => {
    const { dispatcher } = setupWithMenuOpen();
    root
      .querySelector<HTMLElement>('[data-pkc-action="show-storage-profile"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(root.querySelector('[data-pkc-region="storage-profile"]')).not.toBeNull();

    // Any unrelated dispatch triggers a full re-render. In the old
    // ad-hoc model the overlay was wiped by `root.innerHTML = ''`;
    // the state-driven model keeps it mounted.
    dispatcher.dispatch({ type: 'TOGGLE_RECENT_PANE' });

    expect(dispatcher.getState().storageProfileOpen).toBe(true);
    expect(root.querySelector('[data-pkc-region="storage-profile"]')).not.toBeNull();
  });

  it('Export CSV click creates a Blob URL and triggers a download anchor', () => {
    // A container with at least one byte-contributing row so the
    // Export CSV button is actually mounted in the overlay.
    const csvContainer: Container = {
      meta: {
        container_id: 'csv-test', title: 'CSV Test',
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', schema_version: 1,
      },
      entries: [
        {
          lid: 'att-1',
          title: 'Attachment One',
          // AAAA → 3 decoded bytes, enough to make profile.rows non-empty.
          body: JSON.stringify({ name: 'a.bin', mime: 'application/octet-stream', asset_key: 'k-1' }),
          archetype: 'attachment',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      relations: [],
      revisions: [],
      assets: { 'k-1': 'AAAA' },
    };

    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: csvContainer });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);

    // Spy on the Blob URL lifecycle so we can confirm the download
    // path executed end-to-end without actually persisting a file.
    const createSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-csv-url');
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    // Silence the anchor click — happy-dom dispatches it as a real
    // event but without a navigation target there is nothing to do.
    const anchorClickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    // Open the dialog, then click Export CSV.
    root
      .querySelector<HTMLElement>('[data-pkc-action="show-storage-profile"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const exportBtn = root.querySelector<HTMLElement>(
      '[data-pkc-action="export-storage-profile-csv"]',
    );
    expect(exportBtn).not.toBeNull();
    exportBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    // The handler built a Blob and handed it to URL.createObjectURL;
    // the anchor was created with the right filename and click() ran.
    expect(createSpy).toHaveBeenCalledTimes(1);
    const blob = createSpy.mock.calls[0]![0] as Blob;
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toContain('text/csv');
    expect(anchorClickSpy).toHaveBeenCalledTimes(1);
    const anchor = anchorClickSpy.mock.instances[0] as unknown as HTMLAnchorElement;
    expect(anchor.download.startsWith('pkc-storage-profile-')).toBe(true);
    expect(anchor.download.endsWith('.csv')).toBe(true);
    expect(anchor.href).toBe('blob:mock-csv-url');

    createSpy.mockRestore();
    revokeSpy.mockRestore();
    anchorClickSpy.mockRestore();
  });

  it('Export CSV is a no-op when profile has no byte-contributing rows', () => {
    // With only the default mockContainer (no assets), profile.rows is
    // empty so the button should not be mounted.  Confirm that the
    // button is absent and a manually dispatched action is inert.
    setupWithMenuOpen();
    root
      .querySelector<HTMLElement>('[data-pkc-action="show-storage-profile"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const exportBtn = root.querySelector<HTMLElement>(
      '[data-pkc-action="export-storage-profile-csv"]',
    );
    expect(exportBtn).toBeNull();

    // Even if something synthesises a click on a rogue action element,
    // the handler short-circuits on `profile.rows.length === 0`.
    const createSpy = vi.spyOn(URL, 'createObjectURL');
    const rogue = document.createElement('button');
    rogue.setAttribute('data-pkc-action', 'export-storage-profile-csv');
    root.appendChild(rogue);
    rogue.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(createSpy).not.toHaveBeenCalled();
    createSpy.mockRestore();
  });

  // ── Row → direct-jump to entry ──
  //
  // Storage Profile surfaces the heaviest entries. The row itself is a
  // <button> that dispatches `select-from-storage-profile`, which reuses
  // SELECT_ENTRY and then removes the overlay — so the user lands on
  // the entry they just saw in the capacity list.

  function setupJumpContainer() {
    // Container with one byte-carrying attachment so profile.rows is
    // non-empty and the row button is actually rendered.
    const c: Container = {
      meta: {
        container_id: 'jump-test', title: 'Jump Test',
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', schema_version: 1,
      },
      entries: [
        {
          lid: 'hot-1',
          title: 'Heavy Entry',
          body: JSON.stringify({ name: 'big.bin', mime: 'application/octet-stream', asset_key: 'k-hot' }),
          archetype: 'attachment',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      relations: [],
      revisions: [],
      assets: { 'k-hot': 'AAAA' },
    };
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: c });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);
    return dispatcher;
  }

  it('clicking a profile row dispatches SELECT_ENTRY and removes the overlay', () => {
    const dispatcher = setupJumpContainer();
    root
      .querySelector<HTMLElement>('[data-pkc-action="show-storage-profile"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const rowBtn = root.querySelector<HTMLButtonElement>(
      'button[data-pkc-action="select-from-storage-profile"][data-pkc-lid="hot-1"]',
    );
    expect(rowBtn).not.toBeNull();

    rowBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    // SELECT_ENTRY was applied …
    expect(dispatcher.getState().selectedLid).toBe('hot-1');
    // … and the overlay is gone, so the user sees the detail view.
    expect(
      root.querySelector('[data-pkc-region="storage-profile"]'),
    ).toBeNull();
  });

  it('storage-profile jump opts into ancestor reveal (PR-ε₁)', () => {
    // External jump from the overlay → target may sit under a
    // collapsed folder; `revealInSidebar: true` must be threaded
    // through so the reducer expands ancestors.
    const dispatcher = setupJumpContainer();
    root
      .querySelector<HTMLElement>('[data-pkc-action="show-storage-profile"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const dispatchSpy = vi.spyOn(dispatcher, 'dispatch');
    root
      .querySelector<HTMLButtonElement>(
        'button[data-pkc-action="select-from-storage-profile"][data-pkc-lid="hot-1"]',
      )!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const selectCalls = dispatchSpy.mock.calls
      .map((c) => c[0] as { type: string })
      .filter((a) => a.type === 'SELECT_ENTRY');
    expect(selectCalls).toHaveLength(1);
    expect((selectCalls[0] as { revealInSidebar?: boolean }).revealInSidebar).toBe(true);
    dispatchSpy.mockRestore();
  });

  it('jump click to an unknown lid is a no-op — overlay stays open, selection unchanged', () => {
    const dispatcher = setupJumpContainer();
    root
      .querySelector<HTMLElement>('[data-pkc-action="show-storage-profile"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const prevLid = dispatcher.getState().selectedLid;

    // Inject a rogue button referencing a lid that does NOT exist —
    // simulates a stale profile row or a malformed DOM injection.
    const rogue = document.createElement('button');
    rogue.setAttribute('data-pkc-action', 'select-from-storage-profile');
    rogue.setAttribute('data-pkc-lid', 'does-not-exist');
    const overlay = root.querySelector<HTMLElement>(
      '[data-pkc-region="storage-profile"]',
    )!;
    overlay.appendChild(rogue);

    rogue.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    // Selection must not move to a non-existent lid …
    expect(dispatcher.getState().selectedLid).toBe(prevLid);
    // … and the overlay must still be on screen so the user can recover.
    expect(
      root.querySelector('[data-pkc-region="storage-profile"]'),
    ).not.toBeNull();
  });

  it('jump does NOT regress close or Export CSV — all three actions coexist', () => {
    // Guards against a refactor where one action-binder case swallows
    // the event from another (e.g. if the jump handler forgot to match
    // `data-pkc-lid` precisely and intercepted the close / export
    // clicks). Exercise every action path once in succession.
    const dispatcher = setupJumpContainer();
    root
      .querySelector<HTMLElement>('[data-pkc-action="show-storage-profile"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));

    // Export CSV button is present and functional (spy download).
    const createSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    root
      .querySelector<HTMLElement>('[data-pkc-action="export-storage-profile-csv"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(createSpy).toHaveBeenCalledTimes(1);
    createSpy.mockRestore();
    revokeSpy.mockRestore();
    clickSpy.mockRestore();

    // Close still works after a row is present alongside the export btn.
    root
      .querySelector<HTMLElement>('[data-pkc-action="close-storage-profile"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(
      root.querySelector('[data-pkc-region="storage-profile"]'),
    ).toBeNull();
    // Close alone must NOT select anything.
    expect(dispatcher.getState().selectedLid).not.toBe('hot-1');
  });
});

// ─────────────────────────────────────────────────────────────────
// References summary clickable (v3) — clicking a summary button
// scrollIntoView-s the matching sub-panel region. Navigation only;
// no SELECT_ENTRY, no filter, no semantic merge. See
// docs/development/references-summary-clickable-v3.md.
// ─────────────────────────────────────────────────────────────────
describe('ActionBinder — jump-to-references-section (v3)', () => {
  const refContainer: Container = {
    meta: {
      container_id: 'ref-jump', title: 'Ref Jump',
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', schema_version: 1,
    },
    entries: [
      {
        lid: 'a', title: 'A',
        body: 'link to [b](entry:b) and a broken [g](entry:ghost)',
        archetype: 'text',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      {
        lid: 'b', title: 'B', body: '', archetype: 'text',
        created_at: '2026-01-01T00:00:01Z',
        updated_at: '2026-01-01T00:00:01Z',
      },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };

  // Sync rAF so scrollIntoView is observable inside the click handler.
  beforeEach(() => {
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 0 as unknown as number;
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function setupRef(selectedLid: string) {
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: refContainer });
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: selectedLid });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);
    return { dispatcher };
  }

  it('clicking Relations summary button scrolls the relations sub-panel into view', () => {
    setupRef('a');
    const region = root.querySelector<HTMLElement>('[data-pkc-region="relations"]');
    expect(region).not.toBeNull();
    const spy = vi.fn();
    region!.scrollIntoView = spy;

    const btn = root.querySelector<HTMLButtonElement>(
      '[data-pkc-action="jump-to-references-section"][data-pkc-summary-target="relations"]',
    );
    expect(btn).not.toBeNull();
    btn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(spy).toHaveBeenCalledTimes(1);
    const firstCall = spy.mock.calls[0] as [ScrollIntoViewOptions];
    expect(firstCall[0].behavior).toBe('smooth');
    expect(firstCall[0].block).toBe('start');
  });

  it('clicking Markdown refs summary button scrolls the link-index sub-panel into view', () => {
    setupRef('a');
    const region = root.querySelector<HTMLElement>('[data-pkc-region="link-index"]');
    expect(region).not.toBeNull();
    const spy = vi.fn();
    region!.scrollIntoView = spy;

    const btn = root.querySelector<HTMLButtonElement>(
      '[data-pkc-action="jump-to-references-section"][data-pkc-summary-target="link-index"]',
    );
    btn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('clicking Broken summary button scrolls the broken-links subsection into view specifically', () => {
    setupRef('a');
    const region = root.querySelector<HTMLElement>('[data-pkc-region="link-index-broken"]');
    expect(region).not.toBeNull();
    const spy = vi.fn();
    region!.scrollIntoView = spy;

    const btn = root.querySelector<HTMLButtonElement>(
      '[data-pkc-action="jump-to-references-section"][data-pkc-summary-target="link-index-broken"]',
    );
    btn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('clicking a summary button does NOT dispatch SELECT_ENTRY (navigation is pane-local)', () => {
    const { dispatcher } = setupRef('a');
    const before = dispatcher.getState().selectedLid;

    const btn = root.querySelector<HTMLButtonElement>(
      '[data-pkc-action="jump-to-references-section"][data-pkc-summary-target="relations"]',
    );
    btn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(dispatcher.getState().selectedLid).toBe(before);
  });

  it('keyboard activation via Enter click event triggers the same scroll (native <button> semantics)', () => {
    // <button> elements translate Enter into a synthetic click, which we
    // simulate directly here to stay within happy-dom's event model.
    setupRef('a');
    const region = root.querySelector<HTMLElement>('[data-pkc-region="relations"]');
    const spy = vi.fn();
    region!.scrollIntoView = spy;

    const btn = root.querySelector<HTMLButtonElement>(
      '[data-pkc-action="jump-to-references-section"][data-pkc-summary-target="relations"]',
    );
    btn!.click(); // same path Enter/Space triggers on <button>
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

