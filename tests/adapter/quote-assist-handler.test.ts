/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDispatcher } from '@adapter/state/dispatcher';
import { bindActions } from '@adapter/ui/action-binder';
import { render } from '@adapter/ui/renderer';
import type { Container } from '@core/model/container';

/**
 * USER_REQUEST_LEDGER S-17 (2026-04-14, B-3 Slice α) — action-binder
 * integration. Pure helper coverage lives in
 * tests/features/markdown/quote-assist.test.ts.
 *
 * Pinned contract:
 *   - Plain Enter at end of `> X` line in a slash-eligible textarea
 *     inserts `\n> ` (preventDefault'd, value updated, caret moved).
 *   - Plain Enter outside a quote (or modified Enter / IME / etc.)
 *     does NOT preventDefault — native textarea behaviour runs.
 *   - Selection-range (non-collapsed) Enter is a noop for the
 *     assist (let native Enter overwrite the selection).
 *   - Empty `> ` line is a noop (Slice β handles exit).
 */

function makeContainer(): Container {
  return {
    meta: {
      container_id: 's17-cid',
      title: 'S-17',
      created_at: '2026-04-01T00:00:00.000Z',
      updated_at: '2026-04-01T00:00:00.000Z',
      schema_version: 1,
    },
    entries: [
      {
        lid: 'e1',
        title: 'Quote test',
        body: 'starting body',
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

beforeEach(() => {
  root = document.createElement('div');
  root.id = 'pkc-root';
  document.body.appendChild(root);
});

afterEach(() => {
  if (cleanup) {
    cleanup();
    cleanup = null;
  }
  document.body.removeChild(root);
});

/**
 * Boot the app into edit mode for a TEXT entry, fish out the body
 * textarea, set its value + caret, dispatch a synthetic Enter
 * keydown on the document. Returns the textarea + the original
 * keydown event so the test can inspect both.
 */
function bootEditAndPressEnter(opts: {
  bodyValue: string;
  caretPos: number;
  selectionEnd?: number;
  modifiers?: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean };
  composing?: boolean;
}) {
  const dispatcher = createDispatcher();
  dispatcher.onState((s) => render(s, root));
  dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
  cleanup = bindActions(root, dispatcher);
  dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
  dispatcher.dispatch({ type: 'BEGIN_EDIT', lid: 'e1' });
  render(dispatcher.getState(), root);
  const ta = root.querySelector<HTMLTextAreaElement>('[data-pkc-field="body"]');
  if (!ta) throw new Error('body textarea not found after BEGIN_EDIT');
  ta.value = opts.bodyValue;
  ta.focus();
  const end = opts.selectionEnd ?? opts.caretPos;
  ta.setSelectionRange(opts.caretPos, end);

  const evt = new KeyboardEvent('keydown', {
    key: 'Enter',
    bubbles: true,
    cancelable: true,
    shiftKey: opts.modifiers?.shiftKey ?? false,
    ctrlKey: opts.modifiers?.ctrlKey ?? false,
    metaKey: opts.modifiers?.metaKey ?? false,
    altKey: opts.modifiers?.altKey ?? false,
  });
  // happy-dom honours `isComposing` only if explicitly set on the event.
  if (opts.composing) {
    Object.defineProperty(evt, 'isComposing', { value: true });
  }
  ta.dispatchEvent(evt);
  return { ta, evt };
}

describe('B-3 Slice α — quote continuation in body textarea', () => {
  it('plain Enter at end of `> X` inserts `\\n> ` and preventDefault', () => {
    const { ta, evt } = bootEditAndPressEnter({
      bodyValue: '> hello',
      caretPos: '> hello'.length,
    });
    expect(evt.defaultPrevented).toBe(true);
    expect(ta.value).toBe('> hello\n> ');
    expect(ta.selectionStart).toBe('> hello\n> '.length);
    expect(ta.selectionEnd).toBe('> hello\n> '.length);
  });

  it('plain Enter on second `> X` line continues again', () => {
    const body = '> first\n> second';
    const { ta, evt } = bootEditAndPressEnter({
      bodyValue: body,
      caretPos: body.length,
    });
    expect(evt.defaultPrevented).toBe(true);
    expect(ta.value).toBe('> first\n> second\n> ');
  });

  it('plain Enter outside any quote does NOT preventDefault', () => {
    const { ta, evt } = bootEditAndPressEnter({
      bodyValue: 'just prose',
      caretPos: 'just prose'.length,
    });
    expect(evt.defaultPrevented).toBe(false);
    // value unchanged (we didn't preventDefault, but happy-dom also
    // doesn't insert a \n on Enter — the contract is "we didn't
    // touch it", so just check no `> ` got injected).
    expect(ta.value).toBe('just prose');
  });

  it('Shift+Enter does NOT trigger continuation (modified Enter is reserved)', () => {
    const { ta, evt } = bootEditAndPressEnter({
      bodyValue: '> hello',
      caretPos: '> hello'.length,
      modifiers: { shiftKey: true },
    });
    expect(evt.defaultPrevented).toBe(false);
    expect(ta.value).toBe('> hello');
  });

  it('Ctrl+Enter does NOT trigger continuation (TEXTLOG-append owns it)', () => {
    const { ta, evt } = bootEditAndPressEnter({
      bodyValue: '> hello',
      caretPos: '> hello'.length,
      modifiers: { ctrlKey: true },
    });
    expect(evt.defaultPrevented).toBe(false);
    expect(ta.value).toBe('> hello');
  });

  it('IME composition Enter does NOT trigger continuation (commits IME instead)', () => {
    const { ta, evt } = bootEditAndPressEnter({
      bodyValue: '> hello',
      caretPos: '> hello'.length,
      composing: true,
    });
    expect(evt.defaultPrevented).toBe(false);
    expect(ta.value).toBe('> hello');
  });

  it('Non-collapsed selection Enter is a noop (let native overwrite the selection)', () => {
    const { ta, evt } = bootEditAndPressEnter({
      bodyValue: '> hello world',
      caretPos: 2, // start of "hello"
      selectionEnd: '> hello'.length,
    });
    expect(evt.defaultPrevented).toBe(false);
    expect(ta.value).toBe('> hello world');
  });

  it('Empty `> ` line is a noop (Slice β handles exit)', () => {
    const { ta, evt } = bootEditAndPressEnter({
      bodyValue: '> ',
      caretPos: '> '.length,
    });
    expect(evt.defaultPrevented).toBe(false);
    expect(ta.value).toBe('> ');
  });

  it('Mid-line Enter inside a `> X` is a noop (let native split the line)', () => {
    const { ta, evt } = bootEditAndPressEnter({
      bodyValue: '> hello world',
      caretPos: '> hello'.length, // before " world"
    });
    expect(evt.defaultPrevented).toBe(false);
    expect(ta.value).toBe('> hello world');
  });
});
