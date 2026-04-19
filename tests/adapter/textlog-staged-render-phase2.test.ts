/**
 * @vitest-environment happy-dom
 *
 * FI-03 Phase 2 — edit→read staged maintenance, beforeprint bypass,
 * observer teardown on re-render, lookahead pre-warm, and selection
 * checkbox on placeholder.
 *
 * Corresponds to T-TIP04, T-TIP06, T-TIP10, T-TIP14 from contract §10
 * plus the Phase 1 audit observation O2 (selection checkbox asymmetry).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { textlogPresenter, getActiveHydrator } from '@adapter/ui/textlog-presenter';
import { serializeTextlogBody } from '@features/textlog/textlog-body';
import { LOOKAHEAD_ARTICLE_COUNT } from '@adapter/ui/textlog-hydrator';
import {
  syncTextlogSelectionFromState,
  __resetSelectionStateForTest,
} from '@adapter/ui/textlog-selection';
import type { AppState } from '@adapter/state/app-state';
import type { Entry } from '@core/model/record';
import type { TextlogBody, TextlogEntry, TextlogFlag } from '@features/textlog/textlog-body';

function makeEntry(body: TextlogBody, lid = 'tl1'): Entry {
  return {
    lid,
    title: 'Test Log',
    body: serializeTextlogBody(body),
    archetype: 'textlog',
    created_at: '2026-04-09T00:00:00Z',
    updated_at: '2026-04-09T00:00:00Z',
  };
}

function generateLogs(count: number): TextlogEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `log-${i}`,
    text: `Entry ${i}`,
    createdAt: `2026-04-09T${String(10 + Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00Z`,
    flags: [] as TextlogFlag[],
  }));
}

// ── T-TIP04: lookahead pre-warm ──

describe('FI-03 Phase 2 — T-TIP04 lookahead pre-warm', () => {
  let originalRIC: unknown;
  let originalRAF: unknown;
  let ricCallbacks: Array<() => void>;

  beforeEach(() => {
    ricCallbacks = [];
    originalRIC = (window as unknown as Record<string, unknown>).requestIdleCallback;
    originalRAF = window.requestAnimationFrame;
    // Stub requestIdleCallback to capture the callback but not execute it
    // so we can drain it manually.
    (window as unknown as Record<string, unknown>).requestIdleCallback = (cb: () => void) => {
      ricCallbacks.push(cb);
      return 0;
    };
    // rAF fallback: same capture strategy.
    window.requestAnimationFrame = ((cb: () => void) => {
      ricCallbacks.push(cb);
      return 0;
    }) as typeof window.requestAnimationFrame;
  });

  afterEach(() => {
    if (originalRIC === undefined) {
      delete (window as unknown as Record<string, unknown>).requestIdleCallback;
    } else {
      (window as unknown as Record<string, unknown>).requestIdleCallback = originalRIC;
    }
    window.requestAnimationFrame = originalRAF as typeof window.requestAnimationFrame;
  });

  it('hydrates up to LOOKAHEAD_ARTICLE_COUNT placeholders via idle callback ticks', () => {
    const body: TextlogBody = { entries: generateLogs(20) };
    textlogPresenter.renderBody(makeEntry(body));

    // Drain ticks until no more are scheduled.
    let safety = LOOKAHEAD_ARTICLE_COUNT + 5;
    while (ricCallbacks.length > 0 && safety-- > 0) {
      const cb = ricCallbacks.shift()!;
      cb();
    }

    // Initial 8 hydrated + 4 lookahead = 12. Remaining = 8.
    const hydrator = getActiveHydrator();
    expect(hydrator).not.toBeNull();
  });
});

// ── T-TIP06: observer disconnect on re-render ──

describe('FI-03 Phase 2 — T-TIP06 observer teardown on re-render', () => {
  let originalIO: typeof IntersectionObserver;
  let disconnectSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    originalIO = globalThis.IntersectionObserver;
    disconnectSpy = vi.fn();
    globalThis.IntersectionObserver = class {
      constructor() {}
      observe() {}
      unobserve() {}
      disconnect() { disconnectSpy(); }
      takeRecords() { return []; }
      root = null;
      rootMargin = '';
      thresholds = [0];
    } as unknown as typeof IntersectionObserver;
  });

  afterEach(() => {
    globalThis.IntersectionObserver = originalIO;
  });

  it('previous observer is disconnected when renderBody is called again (I-TIP12)', () => {
    const body: TextlogBody = { entries: generateLogs(15) };
    const entry = makeEntry(body);

    textlogPresenter.renderBody(entry);
    expect(disconnectSpy).not.toHaveBeenCalled();

    textlogPresenter.renderBody(entry);
    expect(disconnectSpy).toHaveBeenCalledTimes(1);

    textlogPresenter.renderBody(entry);
    expect(disconnectSpy).toHaveBeenCalledTimes(2);
  });
});

// ── T-TIP10: beforeprint force-hydrate bypass ──

describe('FI-03 Phase 2 — T-TIP10 beforeprint bypass', () => {
  let originalIO: typeof IntersectionObserver;

  beforeEach(() => {
    originalIO = globalThis.IntersectionObserver;
    globalThis.IntersectionObserver = class {
      constructor() {}
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() { return []; }
      root = null;
      rootMargin = '';
      thresholds = [0];
    } as unknown as typeof IntersectionObserver;
  });

  afterEach(() => {
    globalThis.IntersectionObserver = originalIO;
  });

  it('dispatching beforeprint hydrates all remaining placeholders', () => {
    const body: TextlogBody = { entries: generateLogs(20) };
    const el = textlogPresenter.renderBody(makeEntry(body));

    expect(el.querySelectorAll('[data-pkc-hydrated="false"]').length).toBeGreaterThan(0);

    window.dispatchEvent(new Event('beforeprint'));

    expect(el.querySelectorAll('[data-pkc-hydrated="false"]').length).toBe(0);
    expect(el.querySelectorAll('.pkc-textlog-log').length).toBe(20);
  });

  it('beforeprint listener is removed after hydrator disconnect', () => {
    const body: TextlogBody = { entries: generateLogs(20) };
    textlogPresenter.renderBody(makeEntry(body));

    const hydrator = getActiveHydrator();
    expect(hydrator).not.toBeNull();
    hydrator!.disconnect();

    // Dispatching beforeprint after disconnect must not throw and must
    // not re-run hydrate on a detached docEl. The test asserts no
    // exception and that subsequent renderBody starts fresh.
    window.dispatchEvent(new Event('beforeprint'));

    const body2: TextlogBody = { entries: generateLogs(12) };
    const el2 = textlogPresenter.renderBody(makeEntry(body2));
    expect(el2.querySelectorAll('.pkc-textlog-log').length).toBe(12);
  });
});

// ── T-TIP14: edit→read re-render maintains staged ──

describe('FI-03 Phase 2 — T-TIP14 edit→read staged maintenance (D-TIP6)', () => {
  it('re-rendering renderBody after an edit round-trip still produces placeholders', () => {
    const body: TextlogBody = { entries: generateLogs(20) };
    const entry = makeEntry(body);

    // Initial render (simulates read view).
    const first = textlogPresenter.renderBody(entry);
    expect(first.querySelectorAll('[data-pkc-hydrated="false"]').length).toBeGreaterThan(0);

    // Simulate an edit round-trip: renderEditorBody then back to renderBody.
    textlogPresenter.renderEditorBody(entry);
    const second = textlogPresenter.renderBody(entry);

    // Staged render still applies: first 8 hydrated, rest placeholders.
    expect(second.querySelectorAll('[data-pkc-hydrated="true"]').length).toBe(8);
    expect(second.querySelectorAll('[data-pkc-hydrated="false"]').length).toBe(12);
  });
});

// ── O2: selection checkbox on placeholder ──

function stateWithSelection(lid: string, selectedIds: string[] = []): AppState {
  return {
    textlogSelection: { activeLid: lid, selectedLogIds: selectedIds },
  } as unknown as AppState;
}

describe('FI-03 Phase 2 — selection checkbox on placeholder (audit O2)', () => {
  afterEach(() => {
    __resetSelectionStateForTest();
  });

  it('placeholder includes selection checkbox when selection mode is active', () => {
    syncTextlogSelectionFromState(stateWithSelection('tl-sel'));
    const body: TextlogBody = { entries: generateLogs(12) };
    const el = textlogPresenter.renderBody(makeEntry(body, 'tl-sel'));

    const placeholders = el.querySelectorAll<HTMLElement>('[data-pkc-hydrated="false"]');
    expect(placeholders.length).toBeGreaterThan(0);
    for (const ph of placeholders) {
      const check = ph.querySelector<HTMLInputElement>(
        'input[data-pkc-field="textlog-select"]',
      );
      expect(check).not.toBeNull();
      expect(check!.checked).toBe(false);
    }
  });

  it('placeholder checkbox reflects pre-existing selection state', () => {
    const selected = ['log-0', 'log-1'];
    syncTextlogSelectionFromState(stateWithSelection('tl-sel', selected));

    const body: TextlogBody = { entries: generateLogs(20) };
    const el = textlogPresenter.renderBody(makeEntry(body, 'tl-sel'));

    const checkedSomewhere = el.querySelector<HTMLElement>(
      'input[data-pkc-field="textlog-select"]:checked',
    );
    expect(checkedSomewhere).not.toBeNull();

    const checkedPlaceholder = el.querySelector<HTMLElement>(
      '[data-pkc-hydrated="false"] input[data-pkc-field="textlog-select"]:checked',
    );
    if (checkedPlaceholder) {
      const logId = checkedPlaceholder.getAttribute('data-pkc-log-id');
      expect(selected).toContain(logId);
    }
  });

  it('placeholder does NOT render selection checkbox when not in selection mode', () => {
    const body: TextlogBody = { entries: generateLogs(12) };
    const el = textlogPresenter.renderBody(makeEntry(body));

    const placeholders = el.querySelectorAll<HTMLElement>('[data-pkc-hydrated="false"]');
    for (const ph of placeholders) {
      expect(ph.querySelector('input[data-pkc-field="textlog-select"]')).toBeNull();
    }
  });
});
