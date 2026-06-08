/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { __resetRegistry, __resetUrlCache } from '@adapter/flags';
import { openEntryWindow } from '@adapter/ui/entry-window';
import type { Entry } from '@core/model/record';

/**
 * pgc-141 wave-δ #15(user bug report 2026-05-24):
 * 「マルチウィンドウ時にヘッダフッタが見えないのもそうだし」
 *
 * entry-window に slim sticky header(`<header class="pkc-window-header">`)
 * を追加。flag ON 時のみ。scroll で隠れない、archetype icon + entry title
 * + container 由来 lid を 1 行で表示。
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

function makeEntry(archetype: Entry['archetype'] = 'text'): Entry {
  entryCounter++;
  return {
    lid: `chrome-test-${entryCounter}`,
    title: 'My test entry',
    body: archetype === 'textlog' ? JSON.stringify({ entries: [] }) : '# heading\n\nbody',
    archetype,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

function setFlag(value: boolean): void {
  // 完全に新規 URL を構築(過去 test の pkc-flag が残らないように
  // すべての param を捨てる)。
  const baseUrl = window.location.href.split('?')[0]!;
  const newUrl = value
    ? `${baseUrl}?pkc-flag=shell.entry_window_chrome_enabled%3D1`
    : baseUrl;
  window.history.replaceState({}, '', newUrl);
  __resetUrlCache();
}

describe('pgc-141 entry-window slim sticky header(マルチウィンドウ chrome)', () => {
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

  it('flag OFF + text entry:header element 出ない + body tag に chrome attr 無し', () => {
    setFlag(false);
    openEntryWindow(makeEntry('text'), false, () => 'done');
    // 実 element としての header / region attr は出ない
    expect(capturedHtml).not.toContain('data-pkc-region="window-header"');
    expect(capturedHtml).not.toContain('id="window-header-title"');
    // body tag 自体に data-pkc-chrome="true" は無い(CSS selector の
    // 文字列とは別 ── body tag を `<body data-pkc-chrome=` で grep)
    expect(capturedHtml).not.toContain('<body data-pkc-chrome="true">');
  });

  it('flag ON + text entry:slim sticky header + body data-pkc-chrome attr', () => {
    setFlag(true);
    openEntryWindow(makeEntry('text'), false, () => 'done');
    // body tag に attr 立つ(CSS selector ではなく実 attr)
    expect(capturedHtml).toContain('<body data-pkc-chrome="true">');
    expect(capturedHtml).toContain('data-pkc-region="window-header"');
    expect(capturedHtml).toContain('id="window-header-title"');
    // header 内に title が含まれる
    expect(capturedHtml).toContain('My test entry');
    // archetype icon(text = 📝)
    expect(capturedHtml).toContain('📝');
  });

  it('flag ON + textlog:archetype icon が textlog 用(📋)', () => {
    setFlag(true);
    openEntryWindow(makeEntry('textlog'), false, () => 'done');
    expect(capturedHtml).toContain('class="pkc-window-header-archetype">📋');
  });

  it('flag ON + container lid が header に表示', () => {
    setFlag(true);
    const entry = makeEntry('text');
    openEntryWindow(entry, false, () => 'done');
    expect(capturedHtml).toContain(`class="pkc-window-header-container" title="Container">${entry.lid}`);
  });

  it('flag ON + CSS:header が body[data-pkc-chrome] にスコープされる(scope check)', () => {
    setFlag(true);
    openEntryWindow(makeEntry('text'), false, () => 'done');
    // CSS rule が body[data-pkc-chrome="true"] にスコープされている
    expect(capturedHtml).toContain('body[data-pkc-chrome="true"] .pkc-window-header');
  });

  it('flag ON + position: sticky で scroll に追従しない(CSS rule 確認)', () => {
    setFlag(true);
    openEntryWindow(makeEntry('text'), false, () => 'done');
    // sticky positioning rule が CSS に含まれる
    expect(capturedHtml).toMatch(/\.pkc-window-header[\s\S]*?position:\s*sticky/);
  });
});
