/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createDispatcher } from '@adapter/state/dispatcher';
import { bindActions } from '@adapter/ui/action-binder';
import { render } from '@adapter/ui/renderer';
import type { AppState } from '@adapter/state/app-state';
import type { Container } from '@core/model/container';

/**
 * S-14 (USER_REQUEST_LEDGER, 2026-04-14) — search input must keep
 * focus across the re-render that every keystroke triggers, and
 * IME composition (Japanese / Chinese / Korean input) must survive.
 *
 * Pre-fix behaviour:
 *   - Each keystroke fires `input` → SET_SEARCH_QUERY → re-render →
 *     `root.innerHTML = ''` → search input element destroyed →
 *     focus lost. For IME this also aborted composition, so
 *     Japanese input was effectively impossible from the search box
 *     (user had to type elsewhere and paste).
 *
 * Post-fix:
 *   - main.ts onState captures `data-pkc-field` + caret on the
 *     active element BEFORE render, restores both AFTER render
 *     (was previously gated to phase === 'editing'; now generalised).
 *   - action-binder suppresses SET_SEARCH_QUERY while
 *     `compositionstart` … `compositionend` is in flight, then
 *     emits one final dispatch on `compositionend`.
 *
 * These tests inline the same onState logic that main.ts wires so
 * the bootstrap code does not have to be extracted into a helper
 * just for testability.
 */

function makeContainer(): Container {
  return {
    meta: {
      container_id: 's14-cid',
      title: 'S-14 fixture',
      created_at: '2026-04-01T00:00:00.000Z',
      updated_at: '2026-04-01T00:00:00.000Z',
      schema_version: 1,
    },
    entries: [
      {
        lid: 'e1',
        title: 'Entry One',
        body: 'body one',
        archetype: 'text',
        created_at: '2026-04-01T00:00:00.000Z',
        updated_at: '2026-04-01T00:00:00.000Z',
      },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };
}

let root: HTMLElement;
let cleanup: (() => void) | null = null;
let unsub: (() => void) | null = null;

/**
 * Mirror main.ts onState focus-capture/restore so the test exercises
 * the same code path real users hit. Kept narrow — only the slice
 * relevant to S-14, no scroll restoration / blob cleanup / etc.
 */
function wireFocusRestoringRender(
  dispatcher: ReturnType<typeof createDispatcher>,
): () => void {
  const handler = (state: AppState): void => {
    const activeEl = document.activeElement;
    const focusField =
      activeEl instanceof HTMLElement
        ? activeEl.getAttribute('data-pkc-field')
        : null;
    let caretStart: number | null = null;
    let caretEnd: number | null = null;
    if (
      activeEl instanceof HTMLInputElement
      || activeEl instanceof HTMLTextAreaElement
    ) {
      caretStart = activeEl.selectionStart;
      caretEnd = activeEl.selectionEnd;
    }

    render(state, root);

    if (focusField) {
      const target = root.querySelector<HTMLElement>(
        `[data-pkc-field="${focusField}"]`,
      );
      if (target) {
        target.focus();
        if (
          caretStart !== null
          && (target instanceof HTMLInputElement
            || target instanceof HTMLTextAreaElement)
        ) {
          try {
            target.setSelectionRange(caretStart, caretEnd ?? caretStart);
          } catch {
            /* ignore */
          }
        }
      }
    }
  };
  return dispatcher.onState(handler);
}

beforeEach(() => {
  root = document.createElement('div');
  root.id = 'pkc-root';
  document.body.appendChild(root);
});

afterEach(() => {
  if (unsub) {
    unsub();
    unsub = null;
  }
  if (cleanup) {
    cleanup();
    cleanup = null;
  }
  document.body.removeChild(root);
});

describe('S-14 — search input keeps focus across re-render', () => {
  it('keeps the search input focused (and caret at end) after SET_SEARCH_QUERY', () => {
    const dispatcher = createDispatcher();
    unsub = wireFocusRestoringRender(dispatcher);
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    cleanup = bindActions(root, dispatcher);
    render(dispatcher.getState(), root);

    const input = root.querySelector<HTMLInputElement>(
      '[data-pkc-field="search"]',
    );
    expect(input).toBeTruthy();
    input!.focus();
    input!.value = 'a';
    input!.setSelectionRange(1, 1);
    expect(document.activeElement).toBe(input);

    // Simulate the user typing — fire the same input event the
    // handler listens for. happy-dom won't auto-fire it.
    input!.dispatchEvent(new Event('input', { bubbles: true }));

    // After the dispatch + re-render, the focused element should
    // still be the search input (a fresh DOM node, but matched by
    // the data-pkc-field selector and re-focused).
    const inputAfter = root.querySelector<HTMLInputElement>(
      '[data-pkc-field="search"]',
    );
    expect(inputAfter).toBeTruthy();
    expect(document.activeElement).toBe(inputAfter);
    // The new element holds the queried value (state -> render).
    expect(inputAfter!.value).toBe('a');
    // Caret position preserved at offset 1 (end of "a").
    expect(inputAfter!.selectionStart).toBe(1);
    expect(inputAfter!.selectionEnd).toBe(1);
  });
});

describe('S-14 — IME composition guard suppresses dispatch during composition', () => {
  it('does not dispatch SET_SEARCH_QUERY on input events between compositionstart and compositionend, then dispatches once on compositionend', () => {
    const dispatcher = createDispatcher();
    unsub = wireFocusRestoringRender(dispatcher);
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    cleanup = bindActions(root, dispatcher);
    render(dispatcher.getState(), root);

    const input = root.querySelector<HTMLInputElement>(
      '[data-pkc-field="search"]',
    );
    expect(input).toBeTruthy();
    input!.focus();

    // Capture dispatch calls AFTER the boot dispatches above.
    const dispatchSpy = vi.spyOn(dispatcher, 'dispatch');

    // Begin IME composition. The user is now in the middle of
    // typing Japanese — every input event represents the
    // intermediate composed string, NOT a final value.
    input!.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));

    // While composing, mid-composition input events must be
    // ignored (would otherwise destroy the input element and
    // kill the composition).
    input!.value = 'a';
    input!.dispatchEvent(new Event('input', { bubbles: true }));
    input!.value = 'ab';
    input!.dispatchEvent(new Event('input', { bubbles: true }));
    input!.value = 'abc';
    input!.dispatchEvent(new Event('input', { bubbles: true }));

    const callsDuringComposition = dispatchSpy.mock.calls.filter(
      (c) => (c[0] as { type: string }).type === 'SET_SEARCH_QUERY',
    );
    expect(callsDuringComposition.length).toBe(0);

    // Composition ends with the committed value 'あいう' (we
    // simulate by setting the final value before firing
    // compositionend). The handler should fire ONE dispatch with
    // the final value.
    input!.value = 'あいう';
    input!.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));

    const callsAfterComposition = dispatchSpy.mock.calls.filter(
      (c) => (c[0] as { type: string }).type === 'SET_SEARCH_QUERY',
    );
    expect(callsAfterComposition.length).toBe(1);
    expect(callsAfterComposition[0]![0]).toEqual({
      type: 'SET_SEARCH_QUERY',
      query: 'あいう',
    });

    // Sanity: subsequent non-IME input events DO dispatch again
    // (the composition flag is reset in compositionend). Re-query
    // the input — the SET_SEARCH_QUERY dispatch above triggered a
    // re-render that detached the old element.
    const inputAfterIme = root.querySelector<HTMLInputElement>(
      '[data-pkc-field="search"]',
    );
    expect(inputAfterIme).toBeTruthy();
    inputAfterIme!.value = 'あいうe';
    inputAfterIme!.dispatchEvent(new Event('input', { bubbles: true }));
    const totalQueryDispatches = dispatchSpy.mock.calls.filter(
      (c) => (c[0] as { type: string }).type === 'SET_SEARCH_QUERY',
    ).length;
    expect(totalQueryDispatches).toBe(2);
  });
});
