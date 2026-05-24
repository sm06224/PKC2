/**
 * @vitest-environment happy-dom
 *
 * pgc-135 hotfix(user bug report 2026-05-23):
 * 「shell Flags を全て ON にして動作確認中に、従来の上部メニューが
 *  なくなったため、export 系操作の動線が消えてしまっている」
 *
 * Root cause:pgc-100(shell.data_in_shell_menu_enabled)で Data… を
 * Shell Menu の section に移したため、Shell Menu を開く前の状態では
 * export 動線が header から見えなくなった。
 *
 * Fix:flag ON 時でも小さな `📤 Export…` fallback button を header に
 * 1 個残す。click で Shell Menu を開く(Data section があるので user
 * は即座に到達できる)── pgc-100 の集約方針は維持しつつ discoverability
 * を担保。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { __resetRegistry, __resetUrlCache } from '@adapter/flags';
import { render } from '@adapter/ui/renderer';
import { createDispatcher } from '@adapter/state/dispatcher';
import type { Container } from '@core/model/container';

const TS = '2026-01-01T00:00:00Z';

function emptyContainer(): Container {
  return {
    meta: { container_id: 't', title: 'T', created_at: TS, updated_at: TS, schema_version: 1 },
    entries: [],
    relations: [],
    revisions: [],
    assets: {},
  };
}

function setFlag(value: boolean): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('pkc-flag');
  if (value) {
    url.searchParams.set('pkc-flag', 'shell.data_in_shell_menu_enabled=1');
  }
  window.history.replaceState({}, '', url.toString());
  __resetUrlCache();
}

describe('pgc-135 header export fallback button(hotfix)', () => {
  let root: HTMLElement;

  beforeEach(() => {
    __resetRegistry();
    __resetUrlCache();
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  afterEach(() => {
    setFlag(false);
  });

  function boot(): ReturnType<typeof createDispatcher> {
    const dispatcher = createDispatcher();
    dispatcher.onState((s) => render(s, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: emptyContainer() });
    render(dispatcher.getState(), root);
    return dispatcher;
  }

  function exportFallback(): HTMLElement | null {
    return root.querySelector('.pkc-header-export-fallback');
  }
  function inlineExportInHeader(): HTMLElement | null {
    // shell menu 内の Data section にも同 region attr の inline export が
    // 出るので、header 直下のみを対象にする。
    return root.querySelector('header > [data-pkc-region="export-import-panel"]');
  }

  it('flag OFF:従来 Data… inline が出る、fallback button は出ない', () => {
    setFlag(false);
    boot();
    expect(inlineExportInHeader()).not.toBeNull();
    expect(exportFallback()).toBeNull();
  });

  it('flag ON(hotfix):header inline Data… 消える + 📤 Export… fallback が 1 個残る', () => {
    setFlag(true);
    boot();
    expect(inlineExportInHeader()).toBeNull();
    const btn = exportFallback();
    expect(btn).not.toBeNull();
    expect(btn?.textContent).toContain('📤 Export');
  });

  it('flag ON + fallback button の data-pkc-action は "toggle-shell-menu"(Shell Menu 開く)', () => {
    setFlag(true);
    boot();
    expect(exportFallback()?.getAttribute('data-pkc-action')).toBe('toggle-shell-menu');
  });

  it('flag ON + fallback button に説明的な title(Shell Menu の Data section 案内)', () => {
    setFlag(true);
    boot();
    const title = exportFallback()?.getAttribute('title') ?? '';
    expect(title).toContain('Shell Menu');
    expect(title).toContain('Data');
  });

  it('flag ON + aria-label は keyboard / SR user 向けの説明', () => {
    setFlag(true);
    boot();
    const aria = exportFallback()?.getAttribute('aria-label') ?? '';
    expect(aria).toContain('Export');
  });
});
