/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  __resetRegistry,
  __resetUrlCache,
  setContainerFlagSource,
} from '@adapter/flags';
import { openEntryWindow, openMonitorWindow } from '@adapter/ui/entry-window';
import { readWindowLayout } from '@adapter/platform/window-layout-store';
import type { Entry } from '@core/model/record';

/**
 * γ-A5-3:window layout 永続化(multi-window-vscode-extension-spec §4)。
 *
 * 子 window HTML に geometry 報告 script が flag に応じて埋め込まれること、
 * `pkc-window-geometry` message が `window-layout-store` へ反映されること、
 * `shell.window_layout_persist` flag OFF で完全 no-op になることを検証する。
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
    body: '# 見出し\n本文',
    archetype: 'text',
    created_at: T,
    updated_at: T,
  };
}

function makeChild(): ChildStub {
  const child: ChildStub = {
    closed: false,
    focus: vi.fn(),
    document: { open: vi.fn(), write: vi.fn(), close: vi.fn() },
    postMessage: vi.fn(),
  };
  children.push(child);
  return child;
}

function spyWindowOpen(): { opened: ChildStub[] } {
  const opened: ChildStub[] = [];
  vi.spyOn(window, 'open').mockImplementation(((() => {
    const c = makeChild();
    opened.push(c);
    return c as unknown as Window;
  }) as typeof window.open));
  return { opened };
}

function writtenHtml(child: ChildStub): string {
  return child.document.write.mock.calls[0]![0] as string;
}

function enablePersist(): void {
  setContainerFlagSource({
    'shell.window_roles': true,
    'shell.window_layout_persist': true,
  });
}

function geometryMessage(
  source: ChildStub,
  data: Record<string, unknown>,
): void {
  window.dispatchEvent(
    new MessageEvent('message', {
      data: { type: 'pkc-window-geometry', ...data },
      source: source as unknown as Window,
    }),
  );
}

beforeEach(() => {
  __resetRegistry();
  __resetUrlCache();
  localStorage.clear();
  counter++;
});

afterEach(() => {
  for (const c of children) c.closed = true;
  children.length = 0;
  vi.restoreAllMocks();
});

describe('γ-A5-3 window layout persist', () => {
  it('flag ON:editor window HTML に geometry 報告 script が入る', () => {
    enablePersist();
    const spy = spyWindowOpen();
    openEntryWindow(makeEntry(`p-on-${counter}`), false, vi.fn());
    expect(writtenHtml(spy.opened[0]!)).toContain('pkc-window-geometry');
  });

  it('flag OFF:editor window HTML に geometry 報告 script が入らない', () => {
    const spy = spyWindowOpen();
    openEntryWindow(makeEntry(`p-off-${counter}`), false, vi.fn());
    expect(writtenHtml(spy.opened[0]!)).not.toContain('pkc-window-geometry');
  });

  it('flag ON:monitor window HTML にも geometry 報告 script が入る', () => {
    enablePersist();
    const spy = spyWindowOpen();
    openMonitorWindow('toc', makeEntry(`p-mon-${counter}`));
    expect(writtenHtml(spy.opened[0]!)).toContain('pkc-window-geometry');
  });

  it('pkc-window-geometry message → layout store へ保存される', () => {
    enablePersist();
    const spy = spyWindowOpen();
    const e = makeEntry(`p-msg-${counter}`);
    openEntryWindow(e, false, vi.fn());
    geometryMessage(spy.opened[0]!, {
      role: 'editor',
      lid: e.lid,
      geometry: { screenX: 5, screenY: 6, outerWidth: 700, outerHeight: 500 },
    });
    const layout = readWindowLayout();
    expect(layout).toHaveLength(1);
    expect(layout[0]!.lid).toBe(e.lid);
    expect(layout[0]!.role).toBe('editor');
    expect(layout[0]!.geometry.outerWidth).toBe(700);
  });

  it('flag OFF:pkc-window-geometry message を受けても保存しない', () => {
    const spy = spyWindowOpen();
    const e = makeEntry(`p-msgoff-${counter}`);
    openEntryWindow(e, false, vi.fn());
    geometryMessage(spy.opened[0]!, {
      role: 'editor',
      lid: e.lid,
      geometry: { screenX: 1, screenY: 1, outerWidth: 1, outerHeight: 1 },
    });
    expect(readWindowLayout()).toHaveLength(0);
  });

  it('monitor の geometry message は monitorKind 付きで保存される', () => {
    enablePersist();
    const spy = spyWindowOpen();
    const e = makeEntry(`p-monmsg-${counter}`);
    openMonitorWindow('toc', e);
    geometryMessage(spy.opened[0]!, {
      role: 'monitor',
      lid: e.lid,
      monitorKind: 'toc',
      geometry: { screenX: 0, screenY: 0, outerWidth: 320, outerHeight: 560 },
    });
    const layout = readWindowLayout();
    expect(layout).toHaveLength(1);
    expect(layout[0]!.monitorKind).toBe('toc');
  });
});
