/** @vitest-environment happy-dom */
/**
 * 2026-07-24 gap fix:S4 entry-window に html-render fence iframe の
 * auto-resize listener が無かった(CSS mirror のみ)。srcdoc 内 script は
 * `window.parent`(= view window 自身)へ postMessage するが、既存の
 * message listener は `e.source !== window.opener` で弾くため iframe は
 * height 0 のまま。rendered-viewer.ts(S2)と同 protocol の専用 listener
 * が child template に emit されることを assert する(template-string 検証、
 * view-mermaid-hydration test と同流儀)。
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
      lid: `hrr-${testCounter}`,
      title: 'HTML render view',
      body: '```html-render\n<p>hello</p>\n```\n',
      archetype: 'text',
      created_at: '2026-07-24T00:00:00Z',
      updated_at: '2026-07-24T00:00:00Z',
    } as never,
    false,
    vi.fn(),
    false,
    undefined,
  );
  return child.__capturedHtml;
}

describe('entry-window html-render auto-resize listener(2026-07-24 gap fix)', () => {
  it('child template に pkc-html-render-resize protocol の listener が emit される', () => {
    const html = openAndCapture();
    expect(html).toContain("d.type !== 'pkc-html-render-resize'");
    // 高さ clamp(0..5000)と id 逆引き selector(S2 と同 protocol)
    expect(html).toContain('Math.max(0, Math.min(5000, d.height))');
    expect(html).toContain('iframe[data-pkc-html-render-id=');
  });

  it('html-render fence 本体(sandbox iframe)も view pane に emit される', () => {
    const html = openAndCapture();
    expect(html).toContain('pkc-html-render');
    expect(html).toContain('sandbox="allow-scripts"');
  });
});
