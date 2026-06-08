/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { openEntryWindow, notifyConflict } from '@adapter/ui/entry-window';
import type { Entry } from '@core/model/record';
import type { DiffRow } from '@features/diff/line-diff';

/**
 * γ-A5-5 §5.3:子 entry-window の競合 diff。
 *
 * `notifyConflict(lid, message, diff)` が `pkc-entry-conflict` message に
 * diff データを載せること、子 window HTML が diff 描画の足場(`conflict-diff`
 * 要素 / `renderConflictDiff` / `.pkc-conflict-diff` CSS)を持つことを検証。
 */

const T = '2026-05-22T00:00:00Z';
let counter = 0;

interface ChildStub {
  closed: boolean;
  focus: ReturnType<typeof vi.fn>;
  document: {
    open: ReturnType<typeof vi.fn>;
    write: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  };
  postMessage: ReturnType<typeof vi.fn>;
}

const children: ChildStub[] = [];

function makeEntry(lid: string): Entry {
  return {
    lid,
    title: `Entry ${lid}`,
    body: 'a\nb\nc',
    archetype: 'text',
    created_at: T,
    updated_at: T,
  };
}

function spyWindowOpen(): ChildStub[] {
  const opened: ChildStub[] = [];
  vi.spyOn(window, 'open').mockImplementation(((() => {
    const c: ChildStub = {
      closed: false,
      focus: vi.fn(),
      document: { open: vi.fn(), write: vi.fn(), close: vi.fn() },
      postMessage: vi.fn(),
    };
    children.push(c);
    opened.push(c);
    return c as unknown as Window;
  }) as typeof window.open));
  return opened;
}

const sampleDiff: DiffRow[] = [
  { op: 'same', left: 'a', right: 'a' },
  { op: 'del', left: 'old', right: null },
  { op: 'add', left: null, right: 'new' },
];

beforeEach(() => {
  counter++;
});

afterEach(() => {
  for (const c of children) c.closed = true;
  children.length = 0;
  vi.restoreAllMocks();
});

describe('γ-A5-5 §5.3 子 window 競合 diff — notifyConflict', () => {
  it('diff 付き notifyConflict が pkc-entry-conflict に diff を載せる', () => {
    const opened = spyWindowOpen();
    const e = makeEntry(`cd-${counter}`);
    openEntryWindow(e, false, vi.fn());
    notifyConflict(e.lid, '競合しました', sampleDiff);
    const msg = opened[0]!.postMessage.mock.calls
      .map((c) => c[0] as { type: string; message: string; diff: unknown })
      .find((m) => m.type === 'pkc-entry-conflict')!;
    expect(msg.message).toBe('競合しました');
    expect(msg.diff).toEqual(sampleDiff);
  });

  it('diff 無し notifyConflict は diff: null を載せる', () => {
    const opened = spyWindowOpen();
    const e = makeEntry(`cd-nodiff-${counter}`);
    openEntryWindow(e, false, vi.fn());
    notifyConflict(e.lid, 'msg');
    const msg = opened[0]!.postMessage.mock.calls
      .map((c) => c[0] as { type: string; diff: unknown })
      .find((m) => m.type === 'pkc-entry-conflict')!;
    expect(msg.diff).toBeNull();
  });

  it('開いていない lid への notifyConflict は no-op(throw しない)', () => {
    spyWindowOpen();
    expect(() => notifyConflict(`cd-none-${counter}`, 'msg', sampleDiff)).not.toThrow();
  });
});

describe('γ-A5-5 §5.3 子 window HTML の diff 足場', () => {
  it('entry-window HTML に conflict-diff 要素がある', () => {
    const opened = spyWindowOpen();
    openEntryWindow(makeEntry(`cd-html-${counter}`), false, vi.fn());
    const html = opened[0]!.document.write.mock.calls[0]![0] as string;
    expect(html).toContain('id="conflict-diff"');
  });

  it('entry-window HTML に renderConflictDiff 関数がある', () => {
    const opened = spyWindowOpen();
    openEntryWindow(makeEntry(`cd-fn-${counter}`), false, vi.fn());
    const html = opened[0]!.document.write.mock.calls[0]![0] as string;
    expect(html).toContain('function renderConflictDiff');
  });

  it('entry-window HTML に .pkc-conflict-diff CSS がある', () => {
    const opened = spyWindowOpen();
    openEntryWindow(makeEntry(`cd-css-${counter}`), false, vi.fn());
    const html = opened[0]!.document.write.mock.calls[0]![0] as string;
    expect(html).toContain('.pkc-conflict-diff-cell');
  });
});
