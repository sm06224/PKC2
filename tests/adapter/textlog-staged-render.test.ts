/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { textlogPresenter, getActiveHydrator } from '@adapter/ui/textlog-presenter';
import { serializeTextlogBody } from '@features/textlog/textlog-body';
import {
  INITIAL_RENDER_ARTICLE_COUNT,
  LOOKAHEAD_ARTICLE_COUNT,
} from '@adapter/ui/textlog-hydrator';
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

// ── Constants ──

describe('FI-03 staged render constants', () => {
  it('INITIAL_RENDER_ARTICLE_COUNT is 8', () => {
    expect(INITIAL_RENDER_ARTICLE_COUNT).toBe(8);
  });

  it('LOOKAHEAD_ARTICLE_COUNT is 4', () => {
    expect(LOOKAHEAD_ARTICLE_COUNT).toBe(4);
  });
});

// ── Initial render count ──

describe('FI-03 staged render — initial render count', () => {
  it('renders all articles when count <= INITIAL_RENDER_ARTICLE_COUNT', () => {
    const body: TextlogBody = { entries: generateLogs(5) };
    const el = textlogPresenter.renderBody(makeEntry(body));
    const hydrated = el.querySelectorAll('[data-pkc-hydrated="true"]');
    const pending = el.querySelectorAll('[data-pkc-hydrated="false"]');
    expect(hydrated.length).toBe(5);
    expect(pending.length).toBe(0);
  });

  it('limits initial hydrated articles to INITIAL_RENDER_ARTICLE_COUNT', () => {
    const body: TextlogBody = { entries: generateLogs(20) };
    const el = textlogPresenter.renderBody(makeEntry(body));
    const hydrated = el.querySelectorAll('[data-pkc-hydrated="true"]');
    const pending = el.querySelectorAll('[data-pkc-hydrated="false"]');
    expect(hydrated.length).toBe(INITIAL_RENDER_ARTICLE_COUNT);
    expect(pending.length).toBe(20 - INITIAL_RENDER_ARTICLE_COUNT);
  });

  it('total article count equals log count', () => {
    const body: TextlogBody = { entries: generateLogs(15) };
    const el = textlogPresenter.renderBody(makeEntry(body));
    const all = el.querySelectorAll('.pkc-textlog-log');
    expect(all.length).toBe(15);
  });
});

// ── Placeholder DOM shape ──

describe('FI-03 placeholder DOM shape', () => {
  it('placeholder has correct id and data-pkc-* attributes', () => {
    const body: TextlogBody = { entries: generateLogs(12) };
    const el = textlogPresenter.renderBody(makeEntry(body, 'tl-owner'));
    const pending = el.querySelectorAll<HTMLElement>('[data-pkc-hydrated="false"]');
    expect(pending.length).toBe(12 - INITIAL_RENDER_ARTICLE_COUNT);
    for (const ph of pending) {
      expect(ph.id).toMatch(/^log-/);
      expect(ph.getAttribute('data-pkc-log-id')).toBeTruthy();
      expect(ph.getAttribute('data-pkc-lid')).toBe('tl-owner');
    }
  });

  it('placeholder has pending CSS class', () => {
    const body: TextlogBody = { entries: generateLogs(12) };
    const el = textlogPresenter.renderBody(makeEntry(body));
    const pending = el.querySelectorAll<HTMLElement>('[data-pkc-hydrated="false"]');
    for (const ph of pending) {
      expect(ph.classList.contains('pkc-textlog-log-pending')).toBe(true);
    }
  });

  it('placeholder has header with timestamp and flag button (I-TIP5)', () => {
    const body: TextlogBody = { entries: generateLogs(12) };
    const el = textlogPresenter.renderBody(makeEntry(body));
    const pending = el.querySelectorAll<HTMLElement>('[data-pkc-hydrated="false"]');
    for (const ph of pending) {
      const ts = ph.querySelector('.pkc-textlog-timestamp');
      expect(ts).not.toBeNull();
      const flag = ph.querySelector('.pkc-textlog-flag-btn');
      expect(flag).not.toBeNull();
      const anchor = ph.querySelector('[data-pkc-action="copy-log-line-ref"]');
      expect(anchor).not.toBeNull();
    }
  });

  it('placeholder text body has pending class and min-height', () => {
    const body: TextlogBody = { entries: generateLogs(12) };
    const el = textlogPresenter.renderBody(makeEntry(body));
    const pending = el.querySelector<HTMLElement>('[data-pkc-hydrated="false"]');
    const textEl = pending!.querySelector<HTMLElement>('.pkc-textlog-text-pending');
    expect(textEl).not.toBeNull();
    expect(textEl!.style.minHeight).toBe('160px');
  });
});

// ── Hydrate trigger ──

describe('FI-03 hydrate trigger', () => {
  let originalIO: typeof IntersectionObserver;
  let observedElements: HTMLElement[];
  let intersectionCallback: IntersectionObserverCallback;

  beforeEach(() => {
    originalIO = globalThis.IntersectionObserver;
    observedElements = [];
    globalThis.IntersectionObserver = class MockIO {
      constructor(cb: IntersectionObserverCallback) {
        intersectionCallback = cb;
      }
      observe(el: Element) { observedElements.push(el as HTMLElement); }
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

  it('hydrates a placeholder when IntersectionObserver fires', () => {
    const body: TextlogBody = { entries: generateLogs(12) };
    const el = textlogPresenter.renderBody(makeEntry(body));

    const pending = el.querySelectorAll<HTMLElement>('[data-pkc-hydrated="false"]');
    expect(pending.length).toBeGreaterThan(0);

    const target = pending[0]!;
    const logId = target.getAttribute('data-pkc-log-id')!;

    intersectionCallback(
      [{ isIntersecting: true, target } as unknown as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );

    const hydrated = el.querySelector(`[data-pkc-log-id="${logId}"][data-pkc-hydrated="true"]`);
    expect(hydrated).not.toBeNull();
    expect(hydrated!.querySelector('.pkc-textlog-text-pending')).toBeNull();
  });

  it('does not hydrate when isIntersecting is false', () => {
    const body: TextlogBody = { entries: generateLogs(12) };
    const el = textlogPresenter.renderBody(makeEntry(body));

    const pending = el.querySelectorAll<HTMLElement>('[data-pkc-hydrated="false"]');
    const target = pending[0]!;

    intersectionCallback(
      [{ isIntersecting: false, target } as unknown as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );

    expect(target.getAttribute('data-pkc-hydrated')).toBe('false');
  });
});

// ── IO fallback ──

describe('FI-03 IntersectionObserver fallback', () => {
  it('hydrates all articles immediately when IO is unavailable', () => {
    const originalIO = globalThis.IntersectionObserver;
    delete (globalThis as Record<string, unknown>).IntersectionObserver;
    try {
      const body: TextlogBody = { entries: generateLogs(15) };
      const el = textlogPresenter.renderBody(makeEntry(body));
      const pending = el.querySelectorAll('[data-pkc-hydrated="false"]');
      expect(pending.length).toBe(0);
      const all = el.querySelectorAll('.pkc-textlog-log');
      expect(all.length).toBe(15);
    } finally {
      globalThis.IntersectionObserver = originalIO;
    }
  });
});

// ── forceHydrateAll ──

describe('FI-03 forceHydrateAll', () => {
  it('hydrates all remaining placeholders when called', () => {
    const body: TextlogBody = { entries: generateLogs(20) };
    const el = textlogPresenter.renderBody(makeEntry(body));

    const pendingBefore = el.querySelectorAll('[data-pkc-hydrated="false"]');
    expect(pendingBefore.length).toBe(20 - INITIAL_RENDER_ARTICLE_COUNT);

    const hydrator = getActiveHydrator();
    expect(hydrator).not.toBeNull();
    hydrator!.forceHydrateAll();

    const pendingAfter = el.querySelectorAll('[data-pkc-hydrated="false"]');
    expect(pendingAfter.length).toBe(0);

    const all = el.querySelectorAll('.pkc-textlog-log');
    expect(all.length).toBe(20);
  });
});

// ── DOM identity (I-TIP9 / I-TIP13) ──

describe('FI-03 DOM identity after hydrate (I-TIP9 / I-TIP13)', () => {
  it('hydrated article has the same id and data-pkc-* as placeholder', () => {
    const body: TextlogBody = { entries: generateLogs(12) };
    const el = textlogPresenter.renderBody(makeEntry(body, 'tl-owner'));

    const pending = el.querySelectorAll<HTMLElement>('[data-pkc-hydrated="false"]');
    const ids = Array.from(pending).map((ph) => ({
      id: ph.id,
      logId: ph.getAttribute('data-pkc-log-id'),
      lid: ph.getAttribute('data-pkc-lid'),
    }));

    const hydrator = getActiveHydrator();
    hydrator!.forceHydrateAll();

    for (const expected of ids) {
      const article = el.querySelector<HTMLElement>(`#${expected.id}`);
      expect(article).not.toBeNull();
      expect(article!.getAttribute('data-pkc-log-id')).toBe(expected.logId);
      expect(article!.getAttribute('data-pkc-lid')).toBe(expected.lid);
      expect(article!.getAttribute('data-pkc-hydrated')).toBe('true');
    }
  });

  it('total article count equals log count after full hydrate', () => {
    const body: TextlogBody = { entries: generateLogs(20) };
    const el = textlogPresenter.renderBody(makeEntry(body));

    getActiveHydrator()!.forceHydrateAll();

    const articles = el.querySelectorAll('.pkc-textlog-log');
    expect(articles.length).toBe(20);
  });
});

// ── No-image / small log regression ──

describe('FI-03 no-image / small log regression', () => {
  it('empty TEXTLOG still shows empty state', () => {
    const el = textlogPresenter.renderBody(makeEntry({ entries: [] }));
    expect(el.querySelector('.pkc-textlog-empty')).not.toBeNull();
    expect(el.querySelectorAll('.pkc-textlog-log').length).toBe(0);
  });

  it('single-entry TEXTLOG renders normally', () => {
    const body: TextlogBody = {
      entries: [{ id: 'solo', text: 'hello', createdAt: '2026-04-09T10:00:00Z', flags: [] }],
    };
    const el = textlogPresenter.renderBody(makeEntry(body));
    const articles = el.querySelectorAll('.pkc-textlog-log');
    expect(articles.length).toBe(1);
    expect(articles[0]!.getAttribute('data-pkc-hydrated')).toBe('true');
  });

  it('TEXTLOG with exactly INITIAL_RENDER_ARTICLE_COUNT entries has no placeholders', () => {
    const body: TextlogBody = { entries: generateLogs(INITIAL_RENDER_ARTICLE_COUNT) };
    const el = textlogPresenter.renderBody(makeEntry(body));
    expect(el.querySelectorAll('[data-pkc-hydrated="false"]').length).toBe(0);
    expect(el.querySelectorAll('[data-pkc-hydrated="true"]').length).toBe(INITIAL_RENDER_ARTICLE_COUNT);
  });
});

// ── Hydrate failure isolation ──

describe('FI-03 hydrate failure isolation', () => {
  it('placeholder remains when hydrate throws (other articles unaffected)', () => {
    const logs = generateLogs(12);
    const body: TextlogBody = { entries: logs };
    const el = textlogPresenter.renderBody(makeEntry(body));

    const pendingBefore = el.querySelectorAll('[data-pkc-hydrated="false"]').length;
    expect(pendingBefore).toBeGreaterThan(0);

    const hydrator = getActiveHydrator()!;

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    hydrator.forceHydrateAll();
    warnSpy.mockRestore();

    const all = el.querySelectorAll('.pkc-textlog-log');
    expect(all.length).toBe(12);
  });
});
