/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  __resetRegistry,
  __resetUrlCache,
  setContainerFlagSource,
} from '@adapter/flags';
import { restoreWindowLayout } from '@adapter/ui/entry-window';
import {
  showWindowLayoutRestorePrompt,
  closeWindowLayoutRestorePrompt,
  wireWindowLayoutRestore,
} from '@adapter/ui/window-layout-restore-prompt';
import {
  upsertWindowLayout,
  readWindowLayout,
} from '@adapter/platform/window-layout-store';
import { createDispatcher } from '@adapter/state/dispatcher';
import type { Entry } from '@core/model/record';
import type { Container } from '@core/model/container';

/**
 * γ-A5-4:window layout 復元(multi-window-vscode-extension-spec §4.3)。
 *
 * `restoreWindowLayout` が viewer / monitor を再オープンし editor を skip
 * すること、復元プロンプト overlay の「復元」/「復元しない」、`shell.
 * window_layout_persist` flag gate を検証する。
 */

const T = '2026-05-22T00:00:00Z';
let counter = 0;
const children: { closed: boolean }[] = [];

function geo() {
  return { screenX: 0, screenY: 0, outerWidth: 720, outerHeight: 600 };
}

function makeEntry(lid: string): Entry {
  return {
    lid,
    title: `E ${lid}`,
    body: '# h',
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

function spyWindowOpen(): { names: string[] } {
  const names: string[] = [];
  vi.spyOn(window, 'open').mockImplementation(((_u?: unknown, n?: unknown) => {
    names.push(String(n));
    const c = {
      closed: false,
      focus: vi.fn(),
      document: { open: vi.fn(), write: vi.fn(), close: vi.fn() },
      postMessage: vi.fn(),
    };
    children.push(c);
    return c as unknown as Window;
  }) as typeof window.open);
  return { names };
}

function enableFlags(): void {
  setContainerFlagSource({
    'shell.window_roles': true,
    'shell.window_layout_persist': true,
  });
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
  closeWindowLayoutRestorePrompt();
  vi.restoreAllMocks();
});

describe('γ-A5-4 restoreWindowLayout', () => {
  it('viewer / monitor を再オープンし editor は skip、pending 0', () => {
    enableFlags();
    const spy = spyWindowOpen();
    const v = makeEntry(`r-v-${counter}`);
    const m = makeEntry(`r-m-${counter}`);
    const e = makeEntry(`r-e-${counter}`);
    upsertWindowLayout({ role: 'viewer', lid: v.lid, geometry: geo() });
    upsertWindowLayout({ role: 'monitor', lid: m.lid, monitorKind: 'toc', geometry: geo() });
    upsertWindowLayout({ role: 'editor', lid: e.lid, geometry: geo() });
    const pending = restoreWindowLayout([v, m, e]);
    expect(pending).toBe(0);
    expect(spy.names).toContain(`pkc-viewer-${v.lid}`);
    expect(spy.names).toContain(`pkc-monitor-toc-${m.lid}`);
    expect(spy.names).not.toContain(`pkc-entry-${e.lid}`);
  });

  it('container に無い lid の layout 項目は skip(pending に数えない)', () => {
    enableFlags();
    spyWindowOpen();
    upsertWindowLayout({ role: 'viewer', lid: `r-gone-${counter}`, geometry: geo() });
    expect(restoreWindowLayout([])).toBe(0);
  });

  it('空 layout → pending 0、window.open は呼ばれない', () => {
    enableFlags();
    const spy = spyWindowOpen();
    expect(restoreWindowLayout([makeEntry(`r-x-${counter}`)])).toBe(0);
    expect(spy.names).toHaveLength(0);
  });
});

describe('γ-A5-4 showWindowLayoutRestorePrompt', () => {
  it('restorable layout があれば overlay をマウントする', () => {
    const host = document.createElement('div');
    upsertWindowLayout({ role: 'viewer', lid: `p-v-${counter}`, geometry: geo() });
    showWindowLayoutRestorePrompt(host, []);
    expect(
      host.querySelector('[data-pkc-region="window-layout-restore-prompt"]'),
    ).not.toBeNull();
  });

  it('viewer / monitor が無ければ overlay を出さない(editor のみ)', () => {
    const host = document.createElement('div');
    upsertWindowLayout({ role: 'editor', lid: `p-e-${counter}`, geometry: geo() });
    showWindowLayoutRestorePrompt(host, []);
    expect(
      host.querySelector('[data-pkc-region="window-layout-restore-prompt"]'),
    ).toBeNull();
  });

  it('「復元」click で restoreWindowLayout が走り overlay が閉じる', () => {
    enableFlags();
    const spy = spyWindowOpen();
    const host = document.createElement('div');
    const v = makeEntry(`p-restore-${counter}`);
    upsertWindowLayout({ role: 'viewer', lid: v.lid, geometry: geo() });
    showWindowLayoutRestorePrompt(host, [v]);
    host
      .querySelector<HTMLButtonElement>(
        '[data-pkc-action="window-layout-restore-confirm"]',
      )!
      .click();
    expect(spy.names).toContain(`pkc-viewer-${v.lid}`);
    expect(
      host.querySelector('[data-pkc-region="window-layout-restore-prompt"]'),
    ).toBeNull();
  });

  it('「復元しない」click で layout が消え overlay が閉じる', () => {
    const host = document.createElement('div');
    upsertWindowLayout({ role: 'viewer', lid: `p-dismiss-${counter}`, geometry: geo() });
    showWindowLayoutRestorePrompt(host, []);
    host
      .querySelector<HTMLButtonElement>(
        '[data-pkc-action="window-layout-restore-dismiss"]',
      )!
      .click();
    expect(readWindowLayout()).toHaveLength(0);
    expect(
      host.querySelector('[data-pkc-region="window-layout-restore-prompt"]'),
    ).toBeNull();
  });
});

describe('γ-A5-4 wireWindowLayoutRestore', () => {
  it('flag OFF → ready になっても prompt を出さない', () => {
    const host = document.createElement('div');
    const dispatcher = createDispatcher();
    wireWindowLayoutRestore(dispatcher, host);
    upsertWindowLayout({ role: 'viewer', lid: `w-off-${counter}`, geometry: geo() });
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer([]) });
    expect(
      host.querySelector('[data-pkc-region="window-layout-restore-prompt"]'),
    ).toBeNull();
  });

  it('flag ON + ready + layout 有り → prompt を出す', () => {
    enableFlags();
    const host = document.createElement('div');
    const dispatcher = createDispatcher();
    wireWindowLayoutRestore(dispatcher, host);
    upsertWindowLayout({ role: 'viewer', lid: `w-on-${counter}`, geometry: geo() });
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer([]) });
    expect(
      host.querySelector('[data-pkc-region="window-layout-restore-prompt"]'),
    ).not.toBeNull();
  });
});
