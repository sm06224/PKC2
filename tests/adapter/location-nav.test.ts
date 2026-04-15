/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  findLocationTarget,
  highlightLocationTarget,
  createLocationNavTracker,
  LOCATION_HIGHLIGHT_DURATION_MS,
} from '@adapter/ui/location-nav';

/**
 * USER_REQUEST_LEDGER S-18 (A-4 FULL, 2026-04-14) — DOM-level tests
 * for the post-render sub-location navigation helper. Reducer and
 * renderer sides are pinned elsewhere. These tests own the three
 * invariants the effect must satisfy:
 *
 *   1. subId → correct DOM selector (heading / log / entry)
 *   2. highlightLocationTarget adds AND eventually removes the
 *      `.pkc-location-highlight` class
 *   3. the tracker is idempotent: same ticket fires once, ticket
 *      advance re-fires, stale ticket is a noop
 */

let root: HTMLElement;

beforeEach(() => {
  root = document.createElement('div');
  document.body.appendChild(root);
  root.innerHTML = `
    <h1 id="intro">Intro</h1>
    <p>body</p>
    <div class="pkc-textlog-log" data-pkc-log-id="log-abc">
      <p>log entry content</p>
    </div>
    <div data-pkc-lid="e1" data-pkc-mode="view"><p>the entry view</p></div>
  `;
});

afterEach(() => {
  document.body.removeChild(root);
  vi.useRealTimers();
});

describe('findLocationTarget', () => {
  it('resolves heading:<slug> to the element with matching id', () => {
    const el = findLocationTarget(root, 'heading:intro');
    expect(el).toBeTruthy();
    expect(el!.tagName).toBe('H1');
  });

  it('resolves log:<logId> to the element with matching data-pkc-log-id', () => {
    const el = findLocationTarget(root, 'log:log-abc');
    expect(el).toBeTruthy();
    expect(el!.getAttribute('data-pkc-log-id')).toBe('log-abc');
  });

  it('resolves entry:<lid> to the view container', () => {
    const el = findLocationTarget(root, 'entry:e1');
    expect(el).toBeTruthy();
    expect(el!.getAttribute('data-pkc-lid')).toBe('e1');
  });

  it('returns null for an unknown scheme', () => {
    expect(findLocationTarget(root, 'unknown:foo')).toBeNull();
  });

  it('returns null for a missing colon', () => {
    expect(findLocationTarget(root, 'nocolon')).toBeNull();
  });

  it('returns null when the target does not exist in the current DOM', () => {
    expect(findLocationTarget(root, 'heading:nope')).toBeNull();
    expect(findLocationTarget(root, 'log:missing')).toBeNull();
    expect(findLocationTarget(root, 'entry:gone')).toBeNull();
  });

  it('escapes tricky sub-id values via CSS.escape', () => {
    const el = document.createElement('div');
    el.id = 'has.dots';
    root.appendChild(el);
    const found = findLocationTarget(root, 'heading:has.dots');
    expect(found).toBe(el);
  });
});

describe('highlightLocationTarget', () => {
  it('adds the highlight class, then removes it after the timeout', () => {
    vi.useFakeTimers();
    const target = root.querySelector<HTMLElement>('#intro')!;
    highlightLocationTarget(target);
    expect(target.classList.contains('pkc-location-highlight')).toBe(true);
    vi.advanceTimersByTime(LOCATION_HIGHLIGHT_DURATION_MS + 1);
    expect(target.classList.contains('pkc-location-highlight')).toBe(false);
  });

  it('calls scrollIntoView (with or without smooth options)', () => {
    const target = root.querySelector<HTMLElement>('#intro')!;
    const spy = vi.fn();
    target.scrollIntoView = spy;
    highlightLocationTarget(target);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('does not throw if scrollIntoView is missing', () => {
    const target = root.querySelector<HTMLElement>('#intro')!;
    // Simulate an engine that lacks scrollIntoView entirely.
    (target as unknown as { scrollIntoView: unknown }).scrollIntoView = undefined;
    expect(() => highlightLocationTarget(target)).not.toThrow();
    expect(target.classList.contains('pkc-location-highlight')).toBe(true);
  });
});

describe('createLocationNavTracker', () => {
  it('fires the effect when a new ticket arrives', () => {
    const tracker = createLocationNavTracker();
    const ran = tracker.consume(root, { subId: 'heading:intro', ticket: 1 });
    expect(ran).toBe(true);
    const target = root.querySelector<HTMLElement>('#intro')!;
    expect(target.classList.contains('pkc-location-highlight')).toBe(true);
  });

  it('does not fire for a repeated ticket (idempotent across re-renders)', () => {
    const tracker = createLocationNavTracker();
    const pending = { subId: 'heading:intro', ticket: 7 };
    const first = tracker.consume(root, pending);
    // Clear the class so we can observe a second application if it happens.
    const target = root.querySelector<HTMLElement>('#intro')!;
    target.classList.remove('pkc-location-highlight');
    const second = tracker.consume(root, pending);
    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(target.classList.contains('pkc-location-highlight')).toBe(false);
  });

  it('fires again when ticket advances, even to the same subId', () => {
    const tracker = createLocationNavTracker();
    const target = root.querySelector<HTMLElement>('#intro')!;
    tracker.consume(root, { subId: 'heading:intro', ticket: 1 });
    target.classList.remove('pkc-location-highlight');
    const again = tracker.consume(root, { subId: 'heading:intro', ticket: 2 });
    expect(again).toBe(true);
    expect(target.classList.contains('pkc-location-highlight')).toBe(true);
  });

  it('returns false (no-op) when pending is null or undefined', () => {
    const tracker = createLocationNavTracker();
    expect(tracker.consume(root, null)).toBe(false);
    expect(tracker.consume(root, undefined)).toBe(false);
  });

  it('returns false when target is missing but still marks ticket seen', () => {
    const tracker = createLocationNavTracker();
    // First call: target doesn't exist → no effect, but tracker
    // still advances its lastTicket. Second call with same ticket
    // stays a noop.
    const r1 = tracker.consume(root, { subId: 'heading:nope', ticket: 5 });
    const r2 = tracker.consume(root, { subId: 'heading:nope', ticket: 5 });
    expect(r1).toBe(false);
    expect(r2).toBe(false);
  });
});
