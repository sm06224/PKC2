/**
 * @vitest-environment happy-dom
 *
 * pgc-100 wave-γ #2(MASTER.md §6.1 phase 2):header の `Data…` inline
 * export/import panel を Shell Menu の section に集約。
 *
 * Tier 0 flag `shell.data_in_shell_menu_enabled`:
 *   OFF(default):header inline に従来どおり `Data…` <details>
 *   ON:header から外し、Shell Menu に「Data」section として埋め込む
 *
 * 機能差ゼロ ── 同じ `renderExportImportInline(state)` を call するだけ
 * (button data-pkc-action は不変)。
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

describe('pgc-100 header Data… → Shell Menu 集約', () => {
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
    dispatcher.dispatch({ type: 'TOGGLE_MENU' });
    render(dispatcher.getState(), root);
    return dispatcher;
  }

  function headerDataDetails(): HTMLElement | null {
    return root.querySelector(
      '[data-pkc-region="header"] [data-pkc-region="export-import-panel"]',
    );
  }
  function shellMenuDataSection(): HTMLElement | null {
    return root.querySelector('[data-pkc-region="shell-menu-data"]');
  }
  function shellMenuDataDetails(): HTMLElement | null {
    return root.querySelector(
      '[data-pkc-region="shell-menu-data"] [data-pkc-region="export-import-panel"]',
    );
  }

  it('flag OFF:header に Data… inline、Shell Menu に Data section 無し', () => {
    setFlag(false);
    boot();
    expect(headerDataDetails()).not.toBeNull();
    expect(shellMenuDataSection()).toBeNull();
  });

  it('flag ON:header から Data… 消え、Shell Menu に Data section + Data… <details>', () => {
    setFlag(true);
    boot();
    expect(headerDataDetails()).toBeNull();
    expect(shellMenuDataSection()).not.toBeNull();
    expect(shellMenuDataDetails()).not.toBeNull();
  });

  it('flag ON:Shell Menu 内 Data section に「Export」 button が含まれる(機能差ゼロ)', () => {
    setFlag(true);
    boot();
    const section = shellMenuDataSection();
    expect(section).not.toBeNull();
    const exportBtn = section!.querySelector(
      'button[data-pkc-action="begin-export"][data-pkc-export-mode="full"]',
    );
    expect(exportBtn).not.toBeNull();
  });

  it('flag ON:Shell Menu 内 Data section の label が "Data"', () => {
    setFlag(true);
    boot();
    const section = shellMenuDataSection();
    const label = section!.querySelector('.pkc-shell-menu-label');
    expect(label?.textContent).toBe('Data');
  });
});
