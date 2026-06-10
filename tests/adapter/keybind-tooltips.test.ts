/**
 * @vitest-environment happy-dom
 *
 * pgc-124 wave-γ #23(MASTER.md §6.2 / §6.3 follow-up):Activity Bar +
 * Inspector tab の tooltip に keybind を併記。VSCode 流の
 * 「button hover → tooltip に shortcut」UX を tier-1 動線として実装。
 *
 * pgc-121(Activity Bar、`Alt+Shift+1〜6`)+ pgc-123(Inspector、
 * `Ctrl+K P/R/H/Y/I`)で keymap binding は完了済、本 PR は **既存 button
 * の title attribute を keybind 文字列付きに更新**。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { __resetRegistry, __resetUrlCache } from '@adapter/flags';
import { render } from '@adapter/ui/renderer';
import { createDispatcher } from '@adapter/state/dispatcher';
import { resetActivityBarState } from '@adapter/ui/activity-bar';
import type { Container } from '@core/model/container';

const TS = '2026-01-01T00:00:00Z';

function makeContainer(): Container {
  return {
    meta: { container_id: 't', title: 'T', created_at: TS, updated_at: TS, schema_version: 1 },
    entries: [
      { lid: 'e1', title: 'Entry', body: 'body', archetype: 'text', created_at: TS, updated_at: TS },
    ],
    relations: [], revisions: [], assets: {},
  };
}

function setFlags(values: { activityBar?: boolean }): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('pkc-flag');
  const flags: string[] = [];
  if (values.activityBar) flags.push('shell.activity_bar_enabled=1');
  for (const f of flags) url.searchParams.append('pkc-flag', f);
  window.history.replaceState({}, '', url.toString());
  __resetUrlCache();
}

describe('pgc-124 Activity Bar + Inspector tab の tooltip に keybind 併記', () => {
  let root: HTMLElement;

  beforeEach(() => {
    __resetRegistry();
    __resetUrlCache();
    resetActivityBarState();
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  afterEach(() => {
    setFlags({});
    resetActivityBarState();
  });

  function boot(): ReturnType<typeof createDispatcher> {
    const dispatcher = createDispatcher();
    dispatcher.onState((s) => render(s, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    render(dispatcher.getState(), root);
    return dispatcher;
  }

  it('Activity Bar:Explorer tab の title に "Alt+Shift+1" を含む', () => {
    setFlags({ activityBar: true });
    boot();
    const explorer = root.querySelector<HTMLElement>('[data-pkc-activity-tab="explorer"]');
    expect(explorer?.getAttribute('title')).toContain('Alt+Shift+1');
    expect(explorer?.getAttribute('title')).toContain('Explorer');
  });

  it('Activity Bar:6 tab 全部に Alt+Shift+N の keybind 記載', () => {
    setFlags({ activityBar: true });
    boot();
    const expected: { id: string; key: string }[] = [
      { id: 'explorer',  key: 'Alt+Shift+1' },
      { id: 'search',    key: 'Alt+Shift+2' },
      { id: 'outline',   key: 'Alt+Shift+3' },
      { id: 'relations', key: 'Alt+Shift+4' },
      { id: 'recent',    key: 'Alt+Shift+5' },
      { id: 'pinned',    key: 'Alt+Shift+6' },
    ];
    for (const exp of expected) {
      const btn = root.querySelector<HTMLElement>(`[data-pkc-activity-tab="${exp.id}"]`);
      expect(btn?.getAttribute('title')).toContain(exp.key);
    }
  });

  it('Activity Bar:VSCode 流の Ctrl+Shift+E は title に出ない(過去の hardcoded を更新済)', () => {
    setFlags({ activityBar: true });
    boot();
    const explorer = root.querySelector<HTMLElement>('[data-pkc-activity-tab="explorer"]');
    expect(explorer?.getAttribute('title')).not.toContain('Ctrl+Shift+E');
  });
});
