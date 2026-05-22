/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  __resetRegistry,
  __resetUrlCache,
  setContainerFlagSource,
} from '@adapter/flags';
import {
  openEntryWindow,
  openViewerWindow,
  getOpenViewerWindowLids,
  getOpenEntryWindowLids,
  pushViewBodyUpdate,
} from '@adapter/ui/entry-window';
import type { Entry } from '@core/model/record';

/**
 * γ-A5-1:viewer role(multi-window-vscode-extension-spec §3)。
 *
 * `openViewerWindow` が readonly な別 window を `viewerWindows` Map で管理
 * し、editor window と同 lid で共存できること、`pushViewBodyUpdate` が
 * editor / viewer 両投すること(spec §3.4 保存時反映)、`shell.window_roles`
 * flag OFF で完全 no-op になることを検証する。
 *
 * module-scope の `openWindows` / `viewerWindows` Map はテスト跨ぎで残る
 * ため、(a) lid を per-test で一意化し、(b) afterEach で全 child stub を
 * `closed = true` にして lid getter から除外する。
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

/** window.open を呼ぶたび新しい child stub を返すよう spy する。 */
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

describe('γ-A5-1 viewer role — openViewerWindow', () => {
  it('flag OFF → no-op(window.open を呼ばない)', () => {
    const spy = spyWindowOpen();
    openViewerWindow(makeEntry(`v-off-${counter}`));
    expect(spy.opened).toHaveLength(0);
  });

  it('flag ON → viewer window を開く(name = pkc-viewer-<lid>)', () => {
    enableFlag();
    const spy = spyWindowOpen();
    const lid = `v-on-${counter}`;
    openViewerWindow(makeEntry(lid));
    expect(spy.opened).toHaveLength(1);
    expect(spy.names[0]).toBe(`pkc-viewer-${lid}`);
  });

  it('viewer の HTML は readonly(Edit ボタン btn-edit を含まない)', () => {
    enableFlag();
    const spy = spyWindowOpen();
    openViewerWindow(makeEntry(`v-ro-${counter}`));
    expect(writtenHtml(spy.opened[0]!)).not.toContain('id="btn-edit"');
  });

  it('flag ON → getOpenViewerWindowLids に lid が現れる', () => {
    enableFlag();
    spyWindowOpen();
    const lid = `v-lids-${counter}`;
    openViewerWindow(makeEntry(lid));
    expect(getOpenViewerWindowLids()).toContain(lid);
  });

  it('同 lid の再 open は新規 window を作らず既存を focus する', () => {
    enableFlag();
    const spy = spyWindowOpen();
    const e = makeEntry(`v-dup-${counter}`);
    openViewerWindow(e);
    openViewerWindow(e);
    expect(spy.opened).toHaveLength(1);
    expect(spy.opened[0]!.focus).toHaveBeenCalled();
  });

  it('editor window と viewer window は同 lid で共存できる', () => {
    enableFlag();
    const spy = spyWindowOpen();
    const e = makeEntry(`v-coexist-${counter}`);
    openEntryWindow(e, false, vi.fn());
    openViewerWindow(e);
    expect(spy.opened).toHaveLength(2);
    expect(getOpenEntryWindowLids()).toContain(e.lid);
    expect(getOpenViewerWindowLids()).toContain(e.lid);
  });

  it('flag ON の editor window HTML は別窓プレビューボタンを含む', () => {
    enableFlag();
    const spy = spyWindowOpen();
    openEntryWindow(makeEntry(`v-btn-on-${counter}`), false, vi.fn());
    expect(writtenHtml(spy.opened[0]!)).toContain('id="btn-viewer"');
  });

  it('flag OFF の editor window HTML は別窓プレビューボタンを含まない', () => {
    const spy = spyWindowOpen();
    openEntryWindow(makeEntry(`v-btn-off-${counter}`), false, vi.fn());
    expect(writtenHtml(spy.opened[0]!)).not.toContain('id="btn-viewer"');
  });

  it('pkc-open-viewer message → editor の handleMessage が viewer を開く', () => {
    enableFlag();
    const spy = spyWindowOpen();
    const e = makeEntry(`v-msg-${counter}`);
    openEntryWindow(e, false, vi.fn()); // opened[0] = editor、handleMessage 登録
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'pkc-open-viewer' },
        source: spy.opened[0] as unknown as Window,
      }),
    );
    expect(spy.opened).toHaveLength(2);
    expect(spy.names[1]).toBe(`pkc-viewer-${e.lid}`);
  });
});

describe('γ-A5-1 viewer role — pushViewBodyUpdate 両投(spec §3.4)', () => {
  it('viewer window へ view-body 更新を push する', () => {
    enableFlag();
    const spy = spyWindowOpen();
    const lid = `v-push-${counter}`;
    openViewerWindow(makeEntry(lid));
    expect(pushViewBodyUpdate(lid, '更新後の本文')).toBe(true);
    const msg = spy.opened[0]!.postMessage.mock.calls[0]![0] as {
      type: string;
      viewBody: string;
    };
    expect(msg.type).toBe('pkc-entry-update-view-body');
    expect(msg.viewBody).toContain('更新後の本文');
  });

  it('editor + viewer 両方が開いていれば双方へ push する', () => {
    enableFlag();
    const spy = spyWindowOpen();
    const e = makeEntry(`v-both-${counter}`);
    openEntryWindow(e, false, vi.fn()); // opened[0] = editor
    openViewerWindow(e); // opened[1] = viewer
    pushViewBodyUpdate(e.lid, '本文更新');
    expect(spy.opened[0]!.postMessage).toHaveBeenCalled();
    expect(spy.opened[1]!.postMessage).toHaveBeenCalled();
  });

  it('開いている window が無ければ false を返す', () => {
    spyWindowOpen();
    expect(pushViewBodyUpdate(`v-none-${counter}`, 'x')).toBe(false);
  });

  it('viewer のみ開いていても push は成功する(editor 不在)', () => {
    enableFlag();
    const spy = spyWindowOpen();
    const lid = `v-only-${counter}`;
    openViewerWindow(makeEntry(lid));
    expect(pushViewBodyUpdate(lid, 'のみ')).toBe(true);
    expect(spy.opened[0]!.postMessage).toHaveBeenCalled();
  });
});
