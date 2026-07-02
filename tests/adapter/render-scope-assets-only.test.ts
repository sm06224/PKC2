/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, __resetEntryRowMemoForTest } from '@adapter/ui/renderer';
import { computeRenderScope, isAssetsOnlyContainerDelta } from '@adapter/ui/render-scope';
import { createInitialState, reduce } from '@adapter/state/app-state';
import type { AppState } from '@adapter/state/app-state';
import type { Container } from '@core/model/container';

/**
 * #868 段階3 integration contract for the `'assets-only'` render scope.
 *
 * Under lazy asset loading, boot/selection paints first and the working-set
 * then loads asset bytes from IDB and dispatches SET_WORKING_SET_ASSETS —
 * tens–hundreds of ms AFTER the first paint. Before this scope existed the
 * dispatch classified as 'full' and the whole shell (O(N) sidebar included)
 * was wiped and rebuilt, which the user saw as「開いた直後/保存後に
 * レンダリングが遅れる」(2026-07 report).
 *
 * Pinned invariants:
 *   - the resulting DOM equals a full render of the SAME state — the
 *     design's primary safety guarantee (no stale pane anywhere).
 *   - the sidebar element keeps identity (NOT rebuilt) — the win.
 *   - the center pane is replaced and now resolves the asset bytes
 *     (missing-asset marker → real <img data: URI>) — visual pop-in parity.
 *   - the center scroll position survives the swap.
 *   - editing phase / co-varying deltas stay 'full' (conservative doctrine).
 */

const T = '2026-07-01T00:00:00.000Z';
// 1x1 PNG。中身は問わない(resolver は base64 をそのまま data: URI 化する)。
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function fixture(): Container {
  return {
    meta: { container_id: 'cid', title: 't', created_at: T, updated_at: T, schema_version: 1 },
    entries: [
      {
        lid: 'doc1',
        title: 'Doc with image',
        archetype: 'text',
        body: 'intro\n\n![pic](asset:k1)\n\noutro',
        created_at: T,
        updated_at: T,
      },
      {
        lid: 'att1',
        title: 'pic.png',
        archetype: 'attachment',
        body: JSON.stringify({ name: 'pic.png', mime: 'image/png', asset_key: 'k1' }),
        created_at: T,
        updated_at: T,
      },
    ],
    relations: [],
    revisions: [],
    // Lazy/shallow boot: bytes NOT resident yet (the bug condition).
    assets: {},
  };
}

function readyState(container: Container): AppState {
  const initial = createInitialState();
  return reduce(initial, { type: 'SYS_INIT_COMPLETE', container }).state;
}

function select(state: AppState, lid: string): AppState {
  return reduce(state, { type: 'SELECT_ENTRY', lid }).state;
}

function publishAssets(state: AppState, assets: Record<string, string>): AppState {
  return reduce(state, { type: 'SET_WORKING_SET_ASSETS', assets }).state;
}

/** Attribute-order-insensitive structural serialization (mirror of the
 *  selection-scope parity test). */
function normalize(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const attrs = [...el.attributes]
    .map((a) => `${a.name}=${JSON.stringify(a.value)}`)
    .sort()
    .join(' ');
  const kids = [...el.childNodes]
    .map((n) =>
      n.nodeType === 1
        ? normalize(n as Element)
        : n.nodeType === 3
          ? JSON.stringify(n.textContent)
          : '',
    )
    .join('');
  return `<${tag} ${attrs}>${kids}</${tag}>`;
}

let root: HTMLElement;

beforeEach(() => {
  __resetEntryRowMemoForTest();
  root = document.createElement('div');
  root.id = 'pkc-root';
  document.body.appendChild(root);
  return () => {
    root.remove();
    __resetEntryRowMemoForTest();
  };
});

describe('render scope=assets-only — detection', () => {
  it('classifies SET_WORKING_SET_ASSETS as "assets-only" in ready phase', () => {
    const sel = select(readyState(fixture()), 'doc1');
    const next = publishAssets(sel, { k1: PNG_B64 });
    expect(isAssetsOnlyContainerDelta(sel, next)).toBe(true);
    expect(computeRenderScope(next, sel)).toBe('assets-only');
  });

  it('falls back to "full" during editing phase (center hosts the live editor)', () => {
    const sel = select(readyState(fixture()), 'doc1');
    const editing = reduce(sel, { type: 'BEGIN_EDIT', lid: 'doc1' }).state;
    expect(editing.phase).toBe('editing');
    const next = publishAssets(editing, { k1: PNG_B64 });
    expect(computeRenderScope(next, editing)).toBe('full');
  });

  it('falls back to "full" when entries change alongside assets', () => {
    const sel = select(readyState(fixture()), 'doc1');
    const next = publishAssets(sel, { k1: PNG_B64 });
    // Hand-craft a co-varying delta: assets AND entries identity changed.
    const coVarying: AppState = {
      ...next,
      container: { ...next.container!, entries: [...next.container!.entries] },
    };
    expect(isAssetsOnlyContainerDelta(sel, coVarying)).toBe(false);
    expect(computeRenderScope(coVarying, sel)).toBe('full');
  });

  it('falls back to "full" when selection changes alongside assets', () => {
    const sel = select(readyState(fixture()), 'doc1');
    const next = { ...publishAssets(sel, { k1: PNG_B64 }), selectedLid: 'att1' };
    expect(computeRenderScope(next, sel)).toBe('full');
  });
});

describe('render scope=assets-only — full-render parity', () => {
  it('produces DOM equal to a full render of the same state', () => {
    const sel = select(readyState(fixture()), 'doc1');
    const next = publishAssets(sel, { k1: PNG_B64 });

    const refRoot = document.createElement('div');
    refRoot.id = root.id;
    document.body.appendChild(refRoot);
    __resetEntryRowMemoForTest();
    render(next, refRoot); // prev=null ⇒ scope='full'

    __resetEntryRowMemoForTest();
    render(sel, root);
    expect(computeRenderScope(next, sel)).toBe('assets-only');
    render(next, root, sel);

    expect(normalize(root)).toBe(normalize(refRoot));
    refRoot.remove();
  });
});

describe('render scope=assets-only — DOM identity & pop-in', () => {
  it('keeps the sidebar node, replaces the center, resolves the image', () => {
    const sel = select(readyState(fixture()), 'doc1');
    render(sel, root);

    // First paint: bytes not resident → missing-asset marker, no data: img.
    const centerBefore = root.querySelector('[data-pkc-region="center"]')!;
    expect(centerBefore.textContent).toContain('missing asset');
    expect(root.querySelector('img[src^="data:image/png"]')).toBeNull();

    const sidebarBefore = root.querySelector('[data-pkc-region="sidebar"]');

    const next = publishAssets(sel, { k1: PNG_B64 });
    render(next, root, sel);

    // Sidebar node identity preserved (NOT rebuilt); center replaced.
    expect(root.querySelector('[data-pkc-region="sidebar"]')).toBe(sidebarBefore);
    expect(root.querySelector('[data-pkc-region="center"]')).not.toBe(centerBefore);

    // Pop-in parity: the image now renders from the resident bytes.
    const img = root.querySelector<HTMLImageElement>('img[src^="data:image/png"]');
    expect(img).not.toBeNull();
    expect(img!.src).toContain(PNG_B64);
    expect(root.querySelector('[data-pkc-region="center"]')!.textContent)
      .not.toContain('missing asset');
  });

  it('preserves the center scroll position across the swap', () => {
    const sel = select(readyState(fixture()), 'doc1');
    render(sel, root);
    const scroller = root.querySelector<HTMLElement>('.pkc-center-content')!;
    scroller.scrollTop = 123;

    const next = publishAssets(sel, { k1: PNG_B64 });
    render(next, root, sel);

    expect(root.querySelector<HTMLElement>('.pkc-center-content')!.scrollTop).toBe(123);
  });
});
