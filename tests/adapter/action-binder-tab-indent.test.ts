/**
 * @vitest-environment happy-dom
 *
 * PR-UUU (2026-05-07、修正指示7 #7) parity test:
 *   flag `editor.tab_indent_spaces` → Tab keydown → textarea value
 *   反映までの順序性(reform-2026-05 Phase 8)。
 *
 * 観測点:
 *   - flag = 2 + 行頭 Tab → 2 spaces
 *   - flag = 4 + 行頭 Tab → 4 spaces
 *   - flag = 0 + 行頭 Tab → \t(off)
 *   - flag = 2 + 行中 Tab → \t(行頭限定の defense)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher } from '@adapter/state/dispatcher';
import { setFlagSource } from '@core/flags';
import type { Container } from '@core/model/container';

const baseContainer: Container = {
  meta: {
    container_id: 'tab-indent-test',
    title: 'Tab Indent Test',
    created_at: '2026-05-07T00:00:00Z',
    updated_at: '2026-05-07T00:00:00Z',
    schema_version: 1,
  },
  entries: [],
  relations: [],
  revisions: [],
  assets: {},
};

let root: HTMLElement;
let cleanup: (() => void) | null = null;
let testFlagValue: number | undefined;

beforeEach(() => {
  root = document.createElement('div');
  root.id = 'pkc-root';
  document.body.appendChild(root);
  // Install a test flag source ahead of any other sources.
  testFlagValue = undefined;
  setFlagSource('parity-test', (key) =>
    key === 'editor.tab_indent_spaces' ? testFlagValue : undefined,
  );
});

afterEach(() => {
  cleanup?.();
  cleanup = null;
  root.remove();
  // Drop the test source so subsequent unrelated tests are unaffected.
  setFlagSource('parity-test', () => undefined);
});

function setup(): void {
  const dispatcher = createDispatcher();
  dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: baseContainer });
  cleanup = bindActions(root, dispatcher);
}

function makeTextarea(initialValue: string, caretPos: number): HTMLTextAreaElement {
  const ta = document.createElement('textarea');
  ta.value = initialValue;
  // `data-pkc-field="plain"` is not in the markdown set so editor-key-helpers
  // doesn't consume the Tab key — the action-binder fall-through fires.
  ta.setAttribute('data-pkc-field', 'plain');
  root.appendChild(ta);
  ta.focus();
  ta.selectionStart = ta.selectionEnd = caretPos;
  return ta;
}

function fireTab(ta: HTMLTextAreaElement): void {
  const ev = new KeyboardEvent('keydown', {
    key: 'Tab',
    bubbles: true,
    cancelable: true,
  });
  ta.dispatchEvent(ev);
}

describe('PR-UUU Tab indent parity', () => {
  it('flag default 2: Tab at line start → 2 spaces', () => {
    setup();
    // Default value (no test override) is 2.
    const ta = makeTextarea('', 0);
    fireTab(ta);
    expect(ta.value).toBe('  ');
    expect(ta.selectionStart).toBe(2);
  });

  it('flag = 4: Tab at line start → 4 spaces', () => {
    testFlagValue = 4;
    setup();
    const ta = makeTextarea('', 0);
    fireTab(ta);
    expect(ta.value).toBe('    ');
  });

  it('flag = 0 (off): Tab at line start → \\t (legacy)', () => {
    testFlagValue = 0;
    setup();
    const ta = makeTextarea('', 0);
    fireTab(ta);
    expect(ta.value).toBe('\t');
  });

  it('flag = 2: Tab MID-line → \\t (line head only defense)', () => {
    testFlagValue = 2;
    setup();
    const ta = makeTextarea('hello', 5);
    fireTab(ta);
    expect(ta.value).toBe('hello\t');
  });

  it('flag = 2: Tab right after newline → 2 spaces (line head)', () => {
    testFlagValue = 2;
    setup();
    const ta = makeTextarea('hello\n', 6);
    fireTab(ta);
    expect(ta.value).toBe('hello\n  ');
  });
});
