/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  __resetRegistry,
  __resetUrlCache,
  setContainerFlagSource,
} from '@adapter/flags';
import {
  openEntryWindow,
  openMonitorWindow,
  getOpenMonitorTargets,
  pushMonitorUpdate,
} from '@adapter/ui/entry-window';
import { wireEntryWindowMonitorRefresh } from '@adapter/ui/entry-window-monitor-refresh';
import { createDispatcher } from '@adapter/state/dispatcher';
import type { Entry } from '@core/model/record';
import type { Container } from '@core/model/container';

/**
 * γ-A5-2:monitor role(multi-window-vscode-extension-spec §3.3)。
 *
 * `openMonitorWindow` が `toc` monitor(本文見出しアウトラインのライブ
 * panel)を `monitorWindows` Map で管理すること、`pushMonitorUpdate` が
 * 派生データ(`MonitorItem[]`)を push すること、`wireEntryWindowMonitorRefresh`
 * が container 変更で monitor を再描画させること、`shell.window_roles`
 * flag OFF で完全 no-op になることを検証する。
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

function makeEntry(lid: string, body = '# 見出しA\n## 見出しB'): Entry {
  return {
    lid,
    title: `Entry ${lid}`,
    body,
    archetype: 'text',
    created_at: T,
    updated_at: T,
  };
}

function makeContainer(entries: Entry[]): Container {
  return {
    meta: {
      container_id: `c-${counter}`,
      title: 'T',
      created_at: T,
      updated_at: T,
      schema_version: 1,
    },
    entries,
    relations: [],
    revisions: [],
    assets: {},
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

function spyWindowOpen(): { names: string[]; opened: ChildStub[] } {
  const names: string[] = [];
  const opened: ChildStub[] = [];
  vi.spyOn(window, 'open').mockImplementation(((_url?: unknown, name?: unknown) => {
    names.push(String(name));
    const c = makeChild();
    opened.push(c);
    return c as unknown as Window;
  }) as typeof window.open);
  return { names, opened };
}

function enableFlag(): void {
  setContainerFlagSource({ 'shell.window_roles': true });
}

function writtenHtml(child: ChildStub): string {
  return child.document.write.mock.calls[0]![0] as string;
}

beforeEach(() => {
  __resetRegistry();
  __resetUrlCache();
  counter++;
});

afterEach(() => {
  for (const c of children) c.closed = true;
  children.length = 0;
  vi.restoreAllMocks();
});

describe('γ-A5-2 monitor role — openMonitorWindow', () => {
  it('flag OFF → no-op(window.open を呼ばない)', () => {
    const spy = spyWindowOpen();
    openMonitorWindow('toc', makeEntry(`m-off-${counter}`));
    expect(spy.opened).toHaveLength(0);
  });

  it('flag ON → monitor window を開く(name = pkc-monitor-toc-<lid>)', () => {
    enableFlag();
    const spy = spyWindowOpen();
    const lid = `m-on-${counter}`;
    openMonitorWindow('toc', makeEntry(lid));
    expect(spy.opened).toHaveLength(1);
    expect(spy.names[0]).toBe(`pkc-monitor-toc-${lid}`);
  });

  it('monitor HTML に初期 TOC データが埋め込まれる', () => {
    enableFlag();
    const spy = spyWindowOpen();
    openMonitorWindow('toc', makeEntry(`m-init-${counter}`));
    const html = writtenHtml(spy.opened[0]!);
    expect(html).toContain('見出しA');
    expect(html).toContain('見出しB');
  });

  it('monitor HTML は pkc-monitor-update listener を持つ', () => {
    enableFlag();
    const spy = spyWindowOpen();
    openMonitorWindow('toc', makeEntry(`m-listen-${counter}`));
    expect(writtenHtml(spy.opened[0]!)).toContain('pkc-monitor-update');
  });

  it('同 kind+lid の再 open は新規を作らず既存を focus する', () => {
    enableFlag();
    const spy = spyWindowOpen();
    const e = makeEntry(`m-dup-${counter}`);
    openMonitorWindow('toc', e);
    openMonitorWindow('toc', e);
    expect(spy.opened).toHaveLength(1);
    expect(spy.opened[0]!.focus).toHaveBeenCalled();
  });

  it('getOpenMonitorTargets に {kind, lid} が現れる', () => {
    enableFlag();
    spyWindowOpen();
    const lid = `m-tgt-${counter}`;
    openMonitorWindow('toc', makeEntry(lid));
    expect(getOpenMonitorTargets()).toContainEqual({ kind: 'toc', lid });
  });
});

describe('γ-A5-2 monitor role — push & trigger', () => {
  it('pushMonitorUpdate が pkc-monitor-update を派生データ付きで post する', () => {
    enableFlag();
    const spy = spyWindowOpen();
    const lid = `m-push-${counter}`;
    openMonitorWindow('toc', makeEntry(lid));
    expect(pushMonitorUpdate('toc', lid, makeEntry(lid, '# X\n# Y'))).toBe(true);
    const msg = spy.opened[0]!.postMessage.mock.calls[0]![0] as {
      type: string;
      kind: string;
      items: { level: number; text: string }[];
    };
    expect(msg.type).toBe('pkc-monitor-update');
    expect(msg.kind).toBe('toc');
    expect(msg.items.map((i) => i.text)).toEqual(['X', 'Y']);
  });

  it('monitor が開いていなければ pushMonitorUpdate は false', () => {
    spyWindowOpen();
    expect(pushMonitorUpdate('toc', `m-none-${counter}`, makeEntry('x'))).toBe(false);
  });

  it('pkc-open-monitor message → editor の handleMessage が monitor を開く', () => {
    enableFlag();
    const spy = spyWindowOpen();
    const e = makeEntry(`m-msg-${counter}`);
    openEntryWindow(e, false, vi.fn()); // opened[0] = editor
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'pkc-open-monitor', kind: 'toc' },
        source: spy.opened[0] as unknown as Window,
      }),
    );
    expect(spy.opened).toHaveLength(2);
    expect(spy.names[1]).toBe(`pkc-monitor-toc-${e.lid}`);
  });

  it('flag ON の editor window HTML は TOC 別窓ボタンを含む', () => {
    enableFlag();
    const spy = spyWindowOpen();
    openEntryWindow(makeEntry(`m-btn-on-${counter}`), false, vi.fn());
    expect(writtenHtml(spy.opened[0]!)).toContain('id="btn-toc-monitor"');
  });

  it('flag OFF の editor window HTML は TOC 別窓ボタンを含まない', () => {
    const spy = spyWindowOpen();
    openEntryWindow(makeEntry(`m-btn-off-${counter}`), false, vi.fn());
    expect(writtenHtml(spy.opened[0]!)).not.toContain('id="btn-toc-monitor"');
  });
});

describe('γ-A5-2 monitor role — refresh 配線', () => {
  it('container 変更で開いている monitor へ pkc-monitor-update が push される', () => {
    enableFlag();
    const spy = spyWindowOpen();
    const dispatcher = createDispatcher();
    const lid = `m-wire-${counter}`;
    dispatcher.dispatch({
      type: 'SYS_INIT_COMPLETE',
      container: makeContainer([makeEntry(lid, '# 旧見出し')]),
    });
    wireEntryWindowMonitorRefresh(dispatcher);
    openMonitorWindow('toc', dispatcher.getState().container!.entries[0]!);

    dispatcher.dispatch({
      type: 'QUICK_UPDATE_ENTRY',
      lid,
      body: '# 新見出しX\n## 新見出しY',
    });

    const calls = spy.opened[0]!.postMessage.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const last = calls[calls.length - 1]![0] as {
      type: string;
      items: { text: string }[];
    };
    expect(last.type).toBe('pkc-monitor-update');
    expect(last.items.map((i) => i.text)).toContain('新見出しX');
  });
});
