/** @vitest-environment happy-dom */
/**
 * 2026-07-13 — entry-window の view ペイン(#body-view)mermaid hydration 回帰。
 * textlog #900 と同型の穴:#body-view は 4 経路(初期焼き込み / save 後 /
 * flush / parent push)で innerHTML を置換するのに hydrate を呼んでいなかった。
 * child template に pkcHydrateViewBody の定義と 4 箇所の呼び出しが emit される
 * ことを assert する(template-string 検証、view-body-rerender test と同流儀)。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { openEntryWindow } from '@adapter/ui/entry-window';

let testCounter = 0;
const createdChildren: Array<{ closed: boolean }> = [];

function setupChildWindow(): { closed: boolean; __capturedHtml: string } {
  const child = {
    closed: false,
    focus: vi.fn(),
    postMessage: vi.fn(),
    document: {
      open: vi.fn(),
      write: vi.fn(),
      close: vi.fn(),
    },
    __capturedHtml: '',
  };
  child.document.write.mockImplementation((html: string) => { child.__capturedHtml = html; });
  vi.spyOn(window, 'open').mockReturnValue(child as unknown as Window);
  createdChildren.push(child);
  return child;
}

beforeEach(() => { vi.restoreAllMocks(); });
afterEach(() => {
  for (const c of createdChildren) c.closed = true;
  createdChildren.length = 0;
});

function openAndCapture(): string {
  const child = setupChildWindow();
  testCounter++;
  openEntryWindow(
    {
      lid: `vmh-${testCounter}`,
      title: 'Mermaid view',
      body: '```mermaid\nflowchart TD\n  A --> B\n```\n',
      archetype: 'text',
      created_at: '2026-07-13T00:00:00Z',
      updated_at: '2026-07-13T00:00:00Z',
    } as never,
    false,
    vi.fn(),
    false,
    undefined,
  );
  return child.__capturedHtml;
}

describe('entry-window view-body mermaid hydration(2026-07-13 regression)', () => {
  it('child template に pkcHydrateViewBody が定義され、opener の mermaid + WCAG を呼ぶ', () => {
    const html = openAndCapture();
    const defIdx = html.indexOf('function pkcHydrateViewBody');
    expect(defIdx).toBeGreaterThan(-1);
    const body = html.slice(defIdx, defIdx + 700);
    expect(body).toContain('pkcHydratePreviewMermaid');
    expect(body).toContain('pkcApplyWcagShift');
    expect(body).toContain("getElementById('body-view')");
  });

  it('4 経路(init / save / flush / parent push)すべてで呼ばれる', () => {
    const html = openAndCapture();
    // 定義 1 + 呼び出し 4 = 5 回出現
    const occurrences = html.split('pkcHydrateViewBody').length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(5);
    // 初期化:initial task badge の直後
    const initIdx = html.indexOf('/* Derive initial task badge');
    expect(initIdx).toBeGreaterThan(-1);
    expect(html.slice(initIdx, initIdx + 300)).toContain('pkcHydrateViewBody();');
    // parent push listener 分岐内
    const pushIdx = html.indexOf("e.data.type === 'pkc-entry-update-view-body'");
    expect(pushIdx).toBeGreaterThan(-1);
    const nextHandler = html.indexOf('pkc-entry-update-title', pushIdx);
    expect(html.slice(pushIdx, nextHandler)).toContain('pkcHydrateViewBody();');
  });

  it('初期焼き込み本文には mermaid placeholder が含まれる(hydrate 対象が実在)', () => {
    const html = openAndCapture();
    expect(html).toContain('pkc-mermaid-placeholder');
  });
});
