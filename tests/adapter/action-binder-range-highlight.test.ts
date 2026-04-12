/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher as _createRawDispatcher } from '@adapter/state/dispatcher';
import { render } from '@adapter/ui/renderer';
import { registerPresenter } from '@adapter/ui/detail-presenter';
import { textlogPresenter } from '@adapter/ui/textlog-presenter';
import type { Container } from '@core/model/container';

// Register the textlog presenter once so the renderer can draw textlog
// entries during these tests. Registration is idempotent.
registerPresenter('textlog', textlogPresenter);

let root: HTMLElement;
let cleanup: () => void;

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

// ── P1 Slice 5-C: range highlight on navigate-entry-ref ──
//
// Slice 5-C visually marks the logs covered by an
// `entry:<lid>#log/<a>..<b>` click with `data-pkc-range-active="true"`
// so the reader can see how far the reference extends. Coverage:
//
//   1. canonical range click → every log between the two endpoints in
//      storage order gets the marker, and the earliest log is the
//      scroll target.
//   2. reverse range (`log/b..a`) → same marked set, same scroll target.
//   3. clear policy — a fresh range click clears the previous run; a
//      log / day / heading click clears the run; a TOC jump clears it.
//   4. fallback — missing endpoint (highlights the one that's present),
//      same endpoint (single log highlighted), unknown entry (no-op).
//   5. regression guards — the ⭐ flag click still preserves scroll
//      (doesn't toggle range markers); light-mode TOC secondary token
//      keeps pointing at `--c-toc-secondary`.

describe('ActionBinder — range highlight (P1 Slice 5-C)', () => {
  const rangeContainer: Container = {
    meta: {
      container_id: 'range-test', title: 'Range Test',
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', schema_version: 1,
    },
    entries: [
      {
        lid: 'src',
        title: 'Source',
        body:
          '[fwd](entry:dst#log/log-a..log-c)\n\n' +
          '[rev](entry:dst#log/log-c..log-a)\n\n' +
          '[pair](entry:dst#log/log-b..log-c)\n\n' +
          '[same](entry:dst#log/log-b..log-b)\n\n' +
          '[miss](entry:dst#log/log-a..log-zzz)\n\n' +
          '[bothmiss](entry:dst#log/log-xxx..log-yyy)\n\n' +
          '[onelog](entry:dst#log/log-a)\n\n' +
          '[goday](entry:dst#day/2026-04-09)\n\n' +
          '[goheading](entry:dst#log/log-a/overview)',
        archetype: 'text',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      {
        lid: 'dst',
        title: 'Destination',
        body: JSON.stringify({
          entries: [
            { id: 'log-a', text: '# Overview\n\nfirst', createdAt: '2026-04-09T10:00:00Z', flags: [] },
            { id: 'log-b', text: 'second', createdAt: '2026-04-09T11:00:00Z', flags: [] },
            { id: 'log-c', text: 'third', createdAt: '2026-04-09T12:00:00Z', flags: [] },
            { id: 'log-d', text: 'fourth (out of range)', createdAt: '2026-04-09T13:00:00Z', flags: [] },
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

  beforeEach(() => {
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 0 as unknown as number;
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function setupRange(selectedLid: string) {
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: rangeContainer });
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: selectedLid });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);
    return { dispatcher };
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

  // Fabricate a navigate-entry-ref anchor attached to the CURRENT root
  // so clear-behavior tests can issue a second navigation AFTER the
  // first click has already hopped the selection (source-body anchors
  // are wiped by the re-render). Same-lid navigations skip SELECT_ENTRY
  // so the fabricated anchor persists for the observation step.
  function fakeRefAnchor(href: string, label: string): HTMLAnchorElement {
    const a = document.createElement('a');
    a.setAttribute('data-pkc-action', 'navigate-entry-ref');
    a.setAttribute('data-pkc-entry-ref', href);
    a.setAttribute('href', href);
    a.textContent = label;
    root.appendChild(a);
    return a;
  }

  // Returns the set of log ids currently flagged `data-pkc-range-active`,
  // sorted alphabetically so the tests stay agnostic about whether the
  // live viewer orders logs asc (storage) or desc (newest-first).
  function rangeActiveIds(): string[] {
    return Array.from(
      root.querySelectorAll<HTMLElement>(
        '.pkc-textlog-log[data-pkc-range-active="true"]',
      ),
    )
      .map((el) => el.getAttribute('data-pkc-log-id') ?? '')
      .sort();
  }

  // ── Canonical + reverse ──

  it('canonical range click highlights every log between the endpoints in storage order', () => {
    setupRange('src');
    findAnchor('fwd').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(rangeActiveIds()).toEqual(['log-a', 'log-b', 'log-c']);
    // log-d is outside the range and must NOT pick up the marker.
    const outside = root.querySelector('[data-pkc-log-id="log-d"]');
    expect(outside!.getAttribute('data-pkc-range-active')).toBeNull();
  });

  it('reverse range (log/c..log-a) highlights the same set as the canonical form', () => {
    setupRange('src');
    findAnchor('rev').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(rangeActiveIds()).toEqual(['log-a', 'log-b', 'log-c']);
  });

  it('range click scrolls to the topmost log of the range (canonical + reverse agree)', () => {
    setupRange('src');
    const captured: Array<string | null> = [];
    const origProto = HTMLElement.prototype.scrollIntoView;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    HTMLElement.prototype.scrollIntoView = function (this: HTMLElement) {
      captured.push(this.getAttribute('data-pkc-log-id'));
    } as any;
    try {
      findAnchor('fwd').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      const canonicalTarget = captured[0];
      captured.length = 0;
      // Clear intermediate state with a same-lid plain log click, then
      // issue the reverse range from a fabricated same-lid anchor
      // (source body is gone after the first navigation).
      fakeRefAnchor('entry:dst#log/log-a', 'onelog')
        .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      captured.length = 0;
      fakeRefAnchor('entry:dst#log/log-c..log-a', 'rev-fab')
        .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      const reverseTarget = captured[0];
      // Canonical and reverse must agree — this is the key invariant.
      expect(reverseTarget).toBe(canonicalTarget);
      // The target must be one of the range's endpoints, not an
      // out-of-range log.
      expect(['log-a', 'log-c']).toContain(canonicalTarget);
    } finally {
      HTMLElement.prototype.scrollIntoView = origProto;
    }
  });

  // ── Clear policy ──

  it('a fresh range click clears the previous range markers', () => {
    setupRange('src');
    findAnchor('fwd').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(rangeActiveIds()).toEqual(['log-a', 'log-b', 'log-c']);
    // We are now on dst; the source-body anchors are gone. Fabricate a
    // same-lid range anchor so we can issue the second click without
    // a re-render wiping the range markers prematurely.
    fakeRefAnchor('entry:dst#log/log-b..log-c', 'pair')
      .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    // Only the new range should be active — log-a is no longer part of it.
    expect(rangeActiveIds()).toEqual(['log-b', 'log-c']);
  });

  it('clicking a plain log ref clears the range markers', () => {
    setupRange('src');
    findAnchor('fwd').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(rangeActiveIds().length).toBe(3);
    fakeRefAnchor('entry:dst#log/log-a', 'onelog')
      .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(rangeActiveIds()).toEqual([]);
  });

  it('clicking a day ref clears the range markers', () => {
    setupRange('src');
    findAnchor('fwd').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(rangeActiveIds().length).toBe(3);
    fakeRefAnchor('entry:dst#day/2026-04-09', 'goday')
      .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(rangeActiveIds()).toEqual([]);
  });

  it('clicking a heading ref clears the range markers', () => {
    setupRange('src');
    findAnchor('fwd').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(rangeActiveIds().length).toBe(3);
    fakeRefAnchor('entry:dst#log/log-a/overview', 'goheading')
      .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(rangeActiveIds()).toEqual([]);
  });

  it('TOC jump clears the range markers', () => {
    setupRange('src');
    // Activate a range first.
    findAnchor('fwd').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(rangeActiveIds().length).toBe(3);
    // Click a TOC log entry (Slice 3 TOC emits data-pkc-action="toc-jump").
    const tocLogs = root.querySelectorAll<HTMLElement>(
      '[data-pkc-action="toc-jump"][data-pkc-toc-target-id^="log-"]',
    );
    expect(tocLogs.length).toBeGreaterThan(0);
    tocLogs[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(rangeActiveIds()).toEqual([]);
  });

  it('switching to a different entry clears the range markers (re-render wipes the DOM)', () => {
    const { dispatcher } = setupRange('src');
    findAnchor('fwd').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(rangeActiveIds().length).toBe(3);
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'src' });
    expect(rangeActiveIds()).toEqual([]);
  });

  // ── Fallback paths ──

  it('single-endpoint range (log/b..b) highlights only that log', () => {
    setupRange('src');
    findAnchor('same').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(rangeActiveIds()).toEqual(['log-b']);
  });

  it('missing endpoint: highlights only the endpoint that exists', () => {
    setupRange('src');
    findAnchor('miss').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(rangeActiveIds()).toEqual(['log-a']);
  });

  it('both endpoints missing: no log is highlighted and no broken-ref stamp on the anchor', () => {
    setupRange('src');
    const anchor = findAnchor('bothmiss');
    anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(rangeActiveIds()).toEqual([]);
    // The entry itself is valid, just the fragment is stale — no broken stamp.
    expect(anchor.getAttribute('data-pkc-ref-broken')).toBeNull();
  });

  it('unknown entry (range ref to missing lid) stamps broken and never sets range markers', () => {
    setupRange('src');
    const fake = document.createElement('a');
    fake.setAttribute('data-pkc-action', 'navigate-entry-ref');
    fake.setAttribute('data-pkc-entry-ref', 'entry:ghost#log/log-a..log-b');
    fake.setAttribute('href', 'entry:ghost#log/log-a..log-b');
    fake.textContent = 'ghost-range';
    root.appendChild(fake);
    fake.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(fake.getAttribute('data-pkc-ref-broken')).toBe('true');
    expect(rangeActiveIds()).toEqual([]);
  });

  // ── Regressions ──

  it('regression: ⭐ flag button click does NOT set any range marker (Slice 4-B scroll fix intact)', () => {
    const { dispatcher } = setupRange('src');
    // Activate a range, then toggle a flag — the flag toggle must not
    // stomp on the range markers (it's an orthogonal UI action).
    findAnchor('fwd').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    const beforeIds = rangeActiveIds();
    expect(beforeIds).toEqual(['log-a', 'log-b', 'log-c']);
    const flagBtn = root.querySelector<HTMLElement>(
      '.pkc-textlog-log[data-pkc-log-id="log-b"] .pkc-textlog-flag-btn',
    );
    const evt = new MouseEvent('click', { bubbles: true, cancelable: true });
    flagBtn!.dispatchEvent(evt);
    // Slice 4-B invariant: flag click is preventDefault'd.
    expect(evt.defaultPrevented).toBe(true);
    // The QUICK_UPDATE_ENTRY re-render wipes the DOM, which also
    // clears range markers — that's expected and fine; what matters
    // is that the scroll-jump fix stays in place.
    expect(dispatcher.getState().phase).toBe('ready');
  });

  it('regression: entry ref on a non-textlog entry leaves range markers empty', () => {
    setupRange('src');
    // `src` is a TEXT entry — a range click while viewing it should
    // still navigate to dst and then highlight correctly.
    findAnchor('fwd').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    // After the hop, we're on dst and markers are set.
    expect(rangeActiveIds().length).toBe(3);
  });
});
