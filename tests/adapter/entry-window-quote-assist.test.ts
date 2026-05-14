/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * B-3 Slice γ(2026-05-14, PR-V3 wave):quote-assist parity in the
 * entry-window child document.
 *
 * The child window cannot import features/markdown/quote-assist because
 * it runs as a standalone document with no module graph, so the same
 * contract is **hand-mirrored** as inline JS inside entry-window.ts.
 * This test pins:
 *
 *   1. The child-side helper functions are present in the generated HTML
 *      (computeQuoteAssistEnterChild / computeQuoteToggleChild /
 *      applyQuoteToggleChild / replaceRangeChild).
 *   2. The keydown handler dispatches on Enter (continue + exit) and on
 *      Mod+Shift+. (bulk toggle).
 *   3. The mirror's behaviour matches the parent helper for representative
 *      inputs — we eval the child-side helper out of the captured HTML and
 *      compare its output to the imported parent helper, ensuring no
 *      contract drift.
 */

let capturedHtml = '';
let entryCounter = 0;

function setupWindowOpenMock(): void {
  const childDoc = {
    open: vi.fn(),
    write: vi.fn((html: string) => { capturedHtml = html; }),
    close: vi.fn(),
  };
  const childWindow = {
    closed: false,
    focus: vi.fn(),
    document: childDoc,
    postMessage: vi.fn(),
  };
  vi.spyOn(window, 'open').mockReturnValue(childWindow as unknown as Window);
}

function makeTextEntry(body: string) {
  entryCounter++;
  return {
    lid: `ew-qa-${entryCounter}`,
    title: 'quote test',
    body,
    archetype: 'text' as const,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
  };
}

async function openAndCapture(body: string): Promise<string> {
  capturedHtml = '';
  setupWindowOpenMock();
  const { openEntryWindow } = await import('../../src/adapter/ui/entry-window');
  openEntryWindow(makeTextEntry(body) as never, false, vi.fn());
  return capturedHtml;
}

/**
 * eval した child-side helper を返す。inline JS の関数定義 1 件を `Function`
 * constructor 経路で safely 取り出すため、HTML から `function NAME ... }` を
 * regex で抜き、`Function(...)` で wrap して closure を作る。
 */
function extractChildFunction<T>(html: string, name: string): T {
  // 関数定義の終了 `}` を最外側で取るため、{ } balance を手で carry。
  const startIdx = html.indexOf(`function ${name}(`);
  if (startIdx < 0) throw new Error(`function ${name} not found in child HTML`);
  let depth = 0;
  let i = html.indexOf('{', startIdx);
  for (; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  const body = html.slice(startIdx, i + 1);
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const factory = new Function(`${body}\nreturn ${name};`);
  return factory() as T;
}

describe('B-3 Slice γ — entry-window child-side quote-assist mirror', () => {
  beforeEach(() => {
    capturedHtml = '';
    vi.restoreAllMocks();
  });

  it('child HTML contains all 4 helper functions + Enter / Mod+Shift+. handlers', async () => {
    const html = await openAndCapture('# demo');
    expect(html).toContain('function computeQuoteAssistEnterChild(');
    expect(html).toContain('function computeQuoteToggleChild(');
    expect(html).toContain('function applyQuoteToggleChild(');
    expect(html).toContain('function replaceRangeChild(');
    // keydown branch for bulk toggle
    expect(html).toContain("(e.key === '.' || e.key === '>')");
    // keydown branch for Enter
    expect(html).toContain("e.key === 'Enter'");
  });

  it('child computeQuoteAssistEnterChild — continue on non-empty quote line', async () => {
    const html = await openAndCapture('# demo');
    const fn = extractChildFunction<(v: string, c: number) => unknown>(
      html,
      'computeQuoteAssistEnterChild',
    );
    expect(fn('> hello', 7)).toEqual({ type: 'continue', insert: '\n> ' });
  });

  it('child computeQuoteAssistEnterChild — exit on empty `> ` line', async () => {
    const html = await openAndCapture('# demo');
    const fn = extractChildFunction<(v: string, c: number) => unknown>(
      html,
      'computeQuoteAssistEnterChild',
    );
    expect(fn('prefix\n> ', 9)).toEqual({
      type: 'exit',
      rangeStart: 7,
      rangeEnd: 9,
      replacement: '\n',
    });
  });

  it('child computeQuoteAssistEnterChild — null on plain line', async () => {
    const html = await openAndCapture('# demo');
    const fn = extractChildFunction<(v: string, c: number) => unknown>(
      html,
      'computeQuoteAssistEnterChild',
    );
    expect(fn('plain', 5)).toBeNull();
  });

  it('child computeQuoteToggleChild — adds `> ` to plain lines', async () => {
    const html = await openAndCapture('# demo');
    const fn = extractChildFunction<(v: string, s: number, e: number) => unknown>(
      html,
      'computeQuoteToggleChild',
    );
    expect(fn('first\nsecond', 0, 12)).toMatchObject({
      value: '> first\n> second',
      selStart: 0,
      selEnd: '> first\n> second'.length,
    });
  });

  it('child computeQuoteToggleChild — strips `> ` from quote lines', async () => {
    const html = await openAndCapture('# demo');
    const fn = extractChildFunction<(v: string, s: number, e: number) => unknown>(
      html,
      'computeQuoteToggleChild',
    );
    expect(fn('> first\n> second', 0, '> first\n> second'.length)).toMatchObject({
      value: 'first\nsecond',
    });
  });

  it('parent / child helpers produce byte-identical output for fixture matrix', async () => {
    const html = await openAndCapture('# demo');
    const childEnter = extractChildFunction<(v: string, c: number) => unknown>(
      html,
      'computeQuoteAssistEnterChild',
    );
    const childToggle = extractChildFunction<(v: string, s: number, e: number) => unknown>(
      html,
      'computeQuoteToggleChild',
    );
    const parent = await import('@features/markdown/quote-assist');
    const enterFixtures: Array<[string, number]> = [
      ['> hello', 7],
      ['> ', 2],
      ['>', 1],
      ['>hello', 6],
      ['> first\n> second', 16],
      ['plain', 5],
      ['> a\nplain', 9],
    ];
    for (const [v, c] of enterFixtures) {
      expect(childEnter(v, c)).toEqual(parent.computeQuoteAssistOnEnter(v, c));
    }
    const toggleFixtures: Array<[string, number, number]> = [
      ['hello', 0, 5],
      ['> hello', 0, 7],
      ['first\nsecond', 0, 12],
      ['> first\n> second', 0, 16],
      ['plain', 3, 3],
      ['', 0, 0],
    ];
    for (const [v, s, e] of toggleFixtures) {
      expect(childToggle(v, s, e)).toEqual(parent.computeQuoteToggleOnSelection(v, s, e));
    }
  });
});
