/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createInitialState } from '@adapter/state/app-state';
import type { AppState } from '@adapter/state/app-state';
import { render } from '@adapter/ui/renderer';
import type { Container } from '@core/model/container';
import type { Entry } from '@core/model/record';

/**
 * S-15 / A-4 Slice α renderer integration (USER_REQUEST_LEDGER,
 * 2026-04-14). Pins that:
 *
 *   - When `state.searchQuery !== ''` and an entry is selected, the
 *     center pane view body wraps matching text in
 *     `<mark class="pkc-search-mark">`.
 *   - When `state.searchQuery === ''`, no marks appear.
 *   - Marks are scoped to the entry view (the sidebar and other
 *     surfaces are NOT walked — keeps the change surgical).
 *   - Code blocks (`<pre>`) inside the body are NOT touched (B-2
 *     syntax-highlight markup is preserved).
 *   - The TEXT split-editor preview pane (A-2) also picks up the
 *     mark because its initial render goes through `renderViewBody`
 *     → markdown-it → the same DOM that the highlighter walks.
 *     Documented but not asserted here (covered by the editor's
 *     own test surface).
 */

function makeContainer(): Container {
  return {
    meta: {
      container_id: 's15-cid',
      title: 'S-15 fixture',
      created_at: '2026-04-01T00:00:00.000Z',
      updated_at: '2026-04-01T00:00:00.000Z',
      schema_version: 1,
    },
    entries: [
      {
        lid: 'e-text',
        title: 'Notes about foo and bar',
        body:
          '# Foo heading\n\nFirst paragraph mentions foo.\n\n'
          + 'Second paragraph also has foo and BAR.\n\n'
          + '```ts\nconst foo = 1;\n```\n',
        archetype: 'text',
        created_at: '2026-04-01T00:00:00.000Z',
        updated_at: '2026-04-01T00:00:00.000Z',
      } as Entry,
    ],
    relations: [],
    revisions: [],
    assets: {},
  };
}

function readyState(searchQuery: string): AppState {
  return {
    ...createInitialState(),
    phase: 'ready',
    container: makeContainer(),
    selectedLid: 'e-text',
    searchQuery,
  };
}

let root: HTMLElement;

beforeEach(() => {
  root = document.createElement('div');
  root.id = 'pkc-root';
  document.body.appendChild(root);
});

afterEach(() => {
  document.body.removeChild(root);
});

describe('A-4 Slice α — renderer wires highlight into entry view', () => {
  it('does NOT inject any <mark> when search query is empty', () => {
    render(readyState(''), root);
    expect(root.querySelectorAll('mark.pkc-search-mark').length).toBe(0);
  });

  it('wraps matching text in the entry view body when search query is active', () => {
    render(readyState('foo'), root);
    const view = root.querySelector('[data-pkc-mode="view"]') as HTMLElement | null;
    expect(view).toBeTruthy();
    const marks = view!.querySelectorAll('mark.pkc-search-mark');
    // 4 prose occurrences: title "foo" (2), heading "Foo", paragraph
    // mentions × 2. Code block "foo" (5th) is intentionally skipped.
    // Title is in the title row above the body — counted because
    // renderView walks the whole view subtree.
    expect(marks.length).toBeGreaterThanOrEqual(3);
    // None of them are inside <pre>.
    const preMarks = view!.querySelectorAll('pre mark.pkc-search-mark');
    expect(preMarks.length).toBe(0);
    // The code block content remains intact (foo present as text).
    const pre = view!.querySelector('pre');
    expect(pre).toBeTruthy();
    expect(pre!.textContent).toContain('foo');
  });

  it('matches case-insensitively (BAR matches "bar" query)', () => {
    render(readyState('bar'), root);
    const view = root.querySelector('[data-pkc-mode="view"]') as HTMLElement | null;
    expect(view).toBeTruthy();
    const marks = view!.querySelectorAll('mark.pkc-search-mark');
    expect(marks.length).toBeGreaterThanOrEqual(2); // title "bar", body "BAR"
    // At least one mark has the original casing 'BAR' from the body.
    const texts = Array.from(marks).map((m) => m.textContent);
    expect(texts).toContain('BAR');
    expect(texts).toContain('bar');
  });

  it('does not bleed marks into the sidebar (only the view subtree is walked)', () => {
    render(readyState('foo'), root);
    const sidebar = root.querySelector('[data-pkc-region="sidebar"]');
    expect(sidebar).toBeTruthy();
    const sidebarMarks = sidebar!.querySelectorAll('mark.pkc-search-mark');
    expect(sidebarMarks.length).toBe(0);
  });
});
