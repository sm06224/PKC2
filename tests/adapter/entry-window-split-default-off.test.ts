/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { __resetRegistry, __resetUrlCache } from '@adapter/flags';
import { openEntryWindow } from '@adapter/ui/entry-window';
import type { Entry } from '@core/model/record';

/**
 * pgc-140 wave-δ #14(user bug report 2026-05-24):
 * 「マルチウィンドウ時の Split View は不要とは言えないがデフォではない」
 *
 * entry-window で text entry を開いた時、`useSplitEditor = entry.archetype
 * === 'text'` で **常時 Split** だった ── flag ON で split を default OFF
 * にし、従来 Source / Preview tab bar に切替。
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
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  vi.spyOn(window, 'open').mockReturnValue(childWindow as unknown as Window);
}

function makeTextEntry(): Entry {
  entryCounter++;
  return {
    lid: `split-default-test-${entryCounter}`,
    title: 'split test',
    body: '# heading\n\nbody',
    archetype: 'text' as const,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

function setFlag(value: boolean): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('pkc-flag');
  if (value) {
    url.searchParams.set('pkc-flag', 'shell.entry_window_split_default_off_enabled=1');
  }
  window.history.replaceState({}, '', url.toString());
  __resetUrlCache();
}

describe('pgc-140 entry-window split default off(マルチウィンドウ split デフォ off)', () => {
  beforeEach(() => {
    __resetRegistry();
    __resetUrlCache();
    capturedHtml = '';
    setupWindowOpenMock();
  });

  afterEach(() => {
    setFlag(false);
    vi.restoreAllMocks();
  });

  it('flag OFF + text entry:従来 split editor を使う(useSplitEditor=true)', () => {
    setFlag(false);
    const entry = makeTextEntry();
    openEntryWindow(entry, false, () => 'done');
    // useSplitEditor=true は split editor の <div> を出す
    expect(capturedHtml).toContain('class="pkc-text-split-editor"');
    expect(capturedHtml).toContain('var useSplitEditor = true');
    // tab bar は出さない(split editor 使用時は不要)
    expect(capturedHtml).not.toContain('id="tab-source"');
  });

  it('flag ON + text entry:split editor 使わず tab bar(Source/Preview)を出す', () => {
    setFlag(true);
    const entry = makeTextEntry();
    openEntryWindow(entry, false, () => 'done');
    expect(capturedHtml).not.toContain('class="pkc-text-split-editor"');
    expect(capturedHtml).toContain('var useSplitEditor = false');
    // tab bar が出る(従来の Source / Preview 切替)
    expect(capturedHtml).toContain('id="tab-source"');
    expect(capturedHtml).toContain('id="tab-preview"');
  });

  it('flag OFF/ON 関係なく非 text(textlog 等)では split editor 使わない', () => {
    setFlag(false);
    entryCounter++;
    const entry: Entry = {
      lid: `logtest-${entryCounter}`, title: 'log', body: JSON.stringify({ entries: [] }),
      archetype: 'textlog', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    };
    openEntryWindow(entry, false, () => 'done');
    expect(capturedHtml).not.toContain('class="pkc-text-split-editor"');
  });
});
