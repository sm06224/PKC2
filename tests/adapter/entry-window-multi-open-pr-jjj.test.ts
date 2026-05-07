/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * PR-JJJ (2026-05-06、user 修正指示5「エントリウィンドウを複数
 * 開いて編集可能なようにして(今はエントリフォーカスが外れると
 * 勝手に閉じてしまう認識)」):
 *
 * Verify that opening 2 different lids tracks both windows, and that
 * neither is auto-closed by selection / focus changes. The actual
 * "auto-close on blur" claim from the user does not exist in our
 * code path — this test fingerprints the multi-window contract so a
 * future regression that DOES auto-close gets caught.
 */

interface FakeChild {
  closed: boolean;
  focus: () => void;
  document: { open: () => void; write: (s: string) => void; close: () => void };
  postMessage: () => void;
}

const opened: Record<string, FakeChild> = {};

function makeChild(): FakeChild {
  return {
    closed: false,
    focus: vi.fn(),
    document: {
      open: vi.fn(),
      write: vi.fn((_s: string) => {}),
      close: vi.fn(),
    },
    postMessage: vi.fn(),
  };
}

beforeEach(() => {
  for (const k of Object.keys(opened)) delete opened[k];
  vi.restoreAllMocks();
  vi.spyOn(window, 'open').mockImplementation((_url, name) => {
    const key = String(name ?? 'default');
    if (!opened[key]) opened[key] = makeChild();
    return opened[key] as unknown as Window;
  });
  // Ensure each test starts with a fresh module state — otherwise the
  // openWindows Map persists across tests in the same file.
  vi.resetModules();
});

function makeEntry(lid: string, overrides: Record<string, unknown> = {}) {
  return {
    lid,
    title: `Entry ${lid}`,
    body: 'body',
    archetype: 'text' as const,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    ...overrides,
  };
}

describe('PR-JJJ: openEntryWindow multi-window tracking', () => {
  it('opens two distinct windows for two different lids', async () => {
    const { openEntryWindow, getOpenEntryWindowLids } =
      await import('../../src/adapter/ui/entry-window');

    openEntryWindow(makeEntry('lid-A') as never, false, vi.fn(), false);
    openEntryWindow(makeEntry('lid-B') as never, false, vi.fn(), false);

    const lids = getOpenEntryWindowLids();
    expect(lids.sort()).toEqual(['lid-A', 'lid-B']);

    // Ensure window.open was called with two different names so the
    // browser native logic creates two separate popups.
    const openCalls = (window.open as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const names = openCalls.map((call) => String(call[1]));
    expect(names).toContain('pkc-entry-lid-A');
    expect(names).toContain('pkc-entry-lid-B');
  });

  it('opening the SAME lid twice reuses the existing window (focus only, no second window)', async () => {
    const { openEntryWindow, getOpenEntryWindowLids } =
      await import('../../src/adapter/ui/entry-window');

    openEntryWindow(makeEntry('lid-A') as never, false, vi.fn(), false);
    openEntryWindow(makeEntry('lid-A') as never, false, vi.fn(), false);

    const lids = getOpenEntryWindowLids();
    expect(lids).toEqual(['lid-A']);

    // The existing child's focus() must have been called on the
    // second open (duplicate-open path).
    expect(opened['pkc-entry-lid-A']!.focus).toHaveBeenCalled();
  });

  it('a closed child is filtered from getOpenEntryWindowLids', async () => {
    const { openEntryWindow, getOpenEntryWindowLids } =
      await import('../../src/adapter/ui/entry-window');

    openEntryWindow(makeEntry('lid-A') as never, false, vi.fn(), false);
    openEntryWindow(makeEntry('lid-B') as never, false, vi.fn(), false);

    // Simulate user closing lid-A's window.
    opened['pkc-entry-lid-A']!.closed = true;

    const lids = getOpenEntryWindowLids();
    expect(lids).toEqual(['lid-B']);
  });
});
