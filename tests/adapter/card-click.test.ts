/**
 * @vitest-environment happy-dom
 *
 * Card placeholder click & keyboard wiring — Slice 4.
 *
 * Spec: docs/spec/card-embed-presentation-v0.md §13 (Slice-4 entry).
 *
 * Slice 4 wires the existing `pkc-card-placeholder` (emitted by the
 * markdown renderer in Slice 2/3.5) so a click navigates to the
 * referenced entry through the SAME code path as the body-level
 * `entry:` link (`navigate-entry-ref`). Tests cover:
 *
 *   1. entry: target  → SELECT_ENTRY, no scroll
 *   2. entry: + log fragment → SELECT_ENTRY + scrollIntoView the log
 *   3. pkc://<self>/entry/<lid> → demoted to entry:<lid>, navigates
 *   4. pkc://<self>/entry/<lid>#log/... → demoted, navigates + scrolls
 *   5. pkc://<other>/entry/<lid> → silent no-op (cross-container)
 *   6. asset target (defence-in-depth — parser already rejects, but
 *      hand-crafted DOM might still reach the click handler) → no-op
 *   7. malformed pkc:// → no-op
 *   8. preventDefault on every click (the placeholder is a span, but
 *      we still call preventDefault for parity with the entry-ref
 *      handler)
 *   9. Enter / Space when focused → equivalent to a click
 *  10. broken-ref does NOT stamp `data-pkc-ref-broken` on the card
 *      placeholder (Slice-4 contract: card brokenness is a render-time
 *      concern handled by the renderer's broken marker, not flipped
 *      retroactively at click time)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher as _createRawDispatcher } from '@adapter/state/dispatcher';
import { render } from '@adapter/ui/renderer';
import { registerPresenter } from '@adapter/ui/detail-presenter';
import { textlogPresenter } from '@adapter/ui/textlog-presenter';
import type { Container } from '@core/model/container';

registerPresenter('textlog', textlogPresenter);

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

let root: HTMLElement;
let cleanup: (() => void) | null = null;

beforeEach(() => {
  root = document.createElement('div');
  root.id = 'pkc-root';
  document.body.appendChild(root);
  // Synchronous rAF so we can observe scrollIntoView inside the click
  // handler. Restored after each test by vi.restoreAllMocks().
  vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
    cb(0);
    return 0 as unknown as number;
  });
  return () => {
    cleanup?.();
    cleanup = null;
    for (const fn of _trackedUnsubs) fn();
    _trackedUnsubs.length = 0;
    root.remove();
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Container with two entries: `src` carries card placeholders in its
// body, `dst` is a textlog so we can verify the log-fragment scroll
// hits the right `#log-<id>` article.
function makeContainer(containerId: string, srcBody: string): Container {
  return {
    meta: {
      container_id: containerId,
      title: 'Card Click Test',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      schema_version: 1,
    },
    entries: [
      {
        lid: 'src',
        title: 'Source',
        body: srcBody,
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
}

function setupBoot(container: Container) {
  const dispatcher = createDispatcher();
  dispatcher.onState((state) => render(state, root));
  dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });
  dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'src' });
  render(dispatcher.getState(), root);
  cleanup = bindActions(root, dispatcher);
  return dispatcher;
}

function findCard(target: string): HTMLElement {
  // The placeholder may sit anywhere in the rendered body — query by
  // the data attribute the renderer stamps from the parsed target.
  const el = root.querySelector<HTMLElement>(
    `.pkc-card-placeholder[data-pkc-card-target="${target}"]`,
  );
  if (!el) throw new Error(`card placeholder for target "${target}" not found`);
  return el;
}

describe('Card placeholder — click navigation (Slice 4)', () => {
  it('entry: target dispatches SELECT_ENTRY for the target lid', () => {
    const dispatcher = setupBoot(makeContainer('cid-self', '@[card](entry:dst)'));
    const card = findCard('entry:dst');
    card.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(dispatcher.getState().selectedLid).toBe('dst');
  });

  it('preventDefault is called on the click event', () => {
    setupBoot(makeContainer('cid-self', '@[card](entry:dst)'));
    const card = findCard('entry:dst');
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    card.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });

  it('entry: target click opts into ancestor reveal (PR-ε₁ parity)', () => {
    const dispatcher = setupBoot(makeContainer('cid-self', '@[card](entry:dst)'));
    const dispatchSpy = vi.spyOn(dispatcher, 'dispatch');
    findCard('entry:dst').dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );
    const selectCalls = dispatchSpy.mock.calls
      .map((c) => c[0] as { type: string })
      .filter((a) => a.type === 'SELECT_ENTRY');
    expect(selectCalls).toHaveLength(1);
    expect((selectCalls[0] as { revealInSidebar?: boolean }).revealInSidebar).toBe(true);
    dispatchSpy.mockRestore();
  });

  it('entry: + log fragment selects the entry and scrolls to the log article', () => {
    const dispatcher = setupBoot(
      makeContainer('cid-self', '@[card](entry:dst#log/log-a)'),
    );
    const card = findCard('entry:dst#log/log-a');
    const spy = vi.fn();
    const origProto = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = spy;
    try {
      card.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    } finally {
      HTMLElement.prototype.scrollIntoView = origProto;
    }
    expect(dispatcher.getState().selectedLid).toBe('dst');
    expect(spy).toHaveBeenCalled();
    const targetArticle = root.querySelector<HTMLElement>('#log-log-a');
    expect(targetArticle).not.toBeNull();
  });

  it('pkc://<self>/entry/<lid> demotes to entry:<lid> and navigates', () => {
    const dispatcher = setupBoot(
      makeContainer('cid-self', '@[card:wide](pkc://cid-self/entry/dst)'),
    );
    const card = findCard('pkc://cid-self/entry/dst');
    card.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(dispatcher.getState().selectedLid).toBe('dst');
  });

  it('pkc://<self>/entry/<lid>#log/... demotes and scrolls to the log', () => {
    const dispatcher = setupBoot(
      makeContainer(
        'cid-self',
        '@[card:wide](pkc://cid-self/entry/dst#log/log-b)',
      ),
    );
    const card = findCard('pkc://cid-self/entry/dst#log/log-b');
    const spy = vi.fn();
    const origProto = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = spy;
    try {
      card.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    } finally {
      HTMLElement.prototype.scrollIntoView = origProto;
    }
    expect(dispatcher.getState().selectedLid).toBe('dst');
    expect(spy).toHaveBeenCalled();
    expect(root.querySelector<HTMLElement>('#log-log-b')).not.toBeNull();
  });
});

describe('Card placeholder — silent no-ops (Slice 4)', () => {
  it('cross-container pkc://<other>/entry/<lid> does not change selection', () => {
    const dispatcher = setupBoot(
      makeContainer('cid-self', '@[card:wide](pkc://cid-other/entry/dst)'),
    );
    const before = dispatcher.getState().selectedLid;
    const card = findCard('pkc://cid-other/entry/dst');
    card.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    // No navigation. Selection stays on `src` (the container that
    // owns the placeholder).
    expect(dispatcher.getState().selectedLid).toBe(before);
    expect(dispatcher.getState().selectedLid).toBe('src');
  });

  it('cross-container click is still preventDefaulted (no native fallback)', () => {
    setupBoot(
      makeContainer('cid-self', '@[card:wide](pkc://cid-other/entry/dst)'),
    );
    const card = findCard('pkc://cid-other/entry/dst');
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    card.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });

  it('asset-target placeholder injected by hand is a no-op (parser-rejected, defence-in-depth)', () => {
    // The Slice-3.5 parser already rejects asset: targets at the
    // markdown layer, so a real container body cannot produce one.
    // We simulate a hand-crafted DOM (or a future spec relaxation
    // that slipped past the parser) by injecting the placeholder
    // directly into the rendered body and asserting the click does
    // not navigate.
    const dispatcher = setupBoot(makeContainer('cid-self', 'plain body'));
    const before = dispatcher.getState().selectedLid;
    const card = document.createElement('span');
    card.className = 'pkc-card-placeholder';
    card.setAttribute('data-pkc-action', 'navigate-card-ref');
    card.setAttribute('data-pkc-card-target', 'asset:a1');
    card.setAttribute('data-pkc-card-variant', 'default');
    card.setAttribute('role', 'link');
    card.setAttribute('tabindex', '0');
    card.textContent = '@card';
    root.appendChild(card);
    card.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(dispatcher.getState().selectedLid).toBe(before);
  });

  it('pkc://<cid>/asset/<key> hand-crafted target is a no-op', () => {
    const dispatcher = setupBoot(makeContainer('cid-self', 'plain body'));
    const before = dispatcher.getState().selectedLid;
    const card = document.createElement('span');
    card.className = 'pkc-card-placeholder';
    card.setAttribute('data-pkc-action', 'navigate-card-ref');
    card.setAttribute('data-pkc-card-target', 'pkc://cid-self/asset/a1');
    card.setAttribute('role', 'link');
    card.setAttribute('tabindex', '0');
    card.textContent = '@card';
    root.appendChild(card);
    card.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(dispatcher.getState().selectedLid).toBe(before);
  });

  it('malformed pkc:// hand-crafted target is a no-op', () => {
    const dispatcher = setupBoot(makeContainer('cid-self', 'plain body'));
    const before = dispatcher.getState().selectedLid;
    const card = document.createElement('span');
    card.className = 'pkc-card-placeholder';
    card.setAttribute('data-pkc-action', 'navigate-card-ref');
    card.setAttribute('data-pkc-card-target', 'pkc://nope');
    card.setAttribute('role', 'link');
    card.setAttribute('tabindex', '0');
    card.textContent = '@card';
    root.appendChild(card);
    card.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(dispatcher.getState().selectedLid).toBe(before);
  });

  it('unknown lid does NOT stamp data-pkc-ref-broken on the card placeholder', () => {
    // Slice-4 contract: card brokenness is a render-time concern; the
    // click handler must not flip a visible "broken" marker because
    // the placeholder may already have one (or an explicit "fresh")
    // state from the renderer. The entry-ref handler stamps
    // `data-pkc-ref-broken="true"` for unknown lids; the card
    // handler suppresses that stamp by passing `stampBroken: false`.
    const dispatcher = setupBoot(makeContainer('cid-self', '@[card](entry:ghost)'));
    const before = dispatcher.getState().selectedLid;
    const card = findCard('entry:ghost');
    card.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(dispatcher.getState().selectedLid).toBe(before);
    expect(card.getAttribute('data-pkc-ref-broken')).toBeNull();
  });
});

describe('Card placeholder — keyboard activation (Slice 4)', () => {
  function dispatchKey(target: HTMLElement, key: string): KeyboardEvent {
    const ev = new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(ev, 'target', { value: target, configurable: true });
    document.dispatchEvent(ev);
    return ev;
  }

  it('Enter while focused on card placeholder navigates like a click', () => {
    const dispatcher = setupBoot(makeContainer('cid-self', '@[card](entry:dst)'));
    const card = findCard('entry:dst');
    const ev = dispatchKey(card, 'Enter');
    expect(ev.defaultPrevented).toBe(true);
    expect(dispatcher.getState().selectedLid).toBe('dst');
  });

  it('Space while focused on card placeholder navigates like a click', () => {
    const dispatcher = setupBoot(makeContainer('cid-self', '@[card](entry:dst)'));
    const card = findCard('entry:dst');
    const ev = dispatchKey(card, ' ');
    expect(ev.defaultPrevented).toBe(true);
    expect(dispatcher.getState().selectedLid).toBe('dst');
  });

  it('Enter on a card with cross-container target stays a no-op', () => {
    const dispatcher = setupBoot(
      makeContainer('cid-self', '@[card:wide](pkc://cid-other/entry/dst)'),
    );
    const before = dispatcher.getState().selectedLid;
    const card = findCard('pkc://cid-other/entry/dst');
    const ev = dispatchKey(card, 'Enter');
    // We still preventDefault because we hand-rolled the activation
    // (and consumed the Enter), so the global "Enter to begin edit"
    // shortcut must not fire either.
    expect(ev.defaultPrevented).toBe(true);
    expect(dispatcher.getState().selectedLid).toBe(before);
  });

  it('Enter with a modifier key is ignored (lets global shortcuts run)', () => {
    const dispatcher = setupBoot(makeContainer('cid-self', '@[card](entry:dst)'));
    const card = findCard('entry:dst');
    const ev = new KeyboardEvent('keydown', {
      key: 'Enter',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(ev, 'target', { value: card, configurable: true });
    document.dispatchEvent(ev);
    // Card handler did not fire — no navigation; the modifier path is
    // reserved for any future shortcut and explicitly NOT consumed.
    expect(dispatcher.getState().selectedLid).toBe('src');
  });
});

describe('Card placeholder — markup contract (Slice 4)', () => {
  it('renderer emits role="link" and tabindex="0" so the placeholder is keyboard reachable', () => {
    setupBoot(makeContainer('cid-self', '@[card](entry:dst)'));
    const card = findCard('entry:dst');
    expect(card.getAttribute('role')).toBe('link');
    expect(card.getAttribute('tabindex')).toBe('0');
  });

  it('renderer stamps data-pkc-action="navigate-card-ref"', () => {
    setupBoot(makeContainer('cid-self', '@[card](entry:dst)'));
    const card = findCard('entry:dst');
    expect(card.getAttribute('data-pkc-action')).toBe('navigate-card-ref');
  });
});
