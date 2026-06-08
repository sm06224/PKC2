/**
 * @vitest-environment happy-dom
 *
 * pgc-139 wave-δ #13(user bug report 2026-05-24):
 * 「上部メニューや操作系が実質 4 段程度占有しているのも少し重い」
 *
 * shellHeaderCompactEnabled() ON 時に shell root に
 * `data-pkc-compact-header="true"` を立て、CSS で header / breadcrumb /
 * view-mode bar / tab strip の縦 padding と font-size を圧縮 ── 横幅 /
 * 機能は不変、縦のみ density up。
 *
 * 視覚動作確認は smoke / 実機(本 unit test は attr 立ち up を verify)。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { __resetRegistry, __resetUrlCache } from '@adapter/flags';
import { render } from '@adapter/ui/renderer';
import { createDispatcher } from '@adapter/state/dispatcher';
import type { Container } from '@core/model/container';

const TS = '2026-01-01T00:00:00Z';

function makeContainer(): Container {
  return {
    meta: { container_id: 't', title: 'T', created_at: TS, updated_at: TS, schema_version: 1 },
    entries: [
      { lid: 'e1', title: 'Entry', body: 'x', archetype: 'text', created_at: TS, updated_at: TS },
    ],
    relations: [], revisions: [], assets: {},
  };
}

function setFlag(value: boolean): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('pkc-flag');
  if (value) {
    url.searchParams.set('pkc-flag', 'shell.header_compact_enabled=1');
  }
  window.history.replaceState({}, '', url.toString());
  __resetUrlCache();
}

describe('pgc-139 header compact mode(上部 4 段占有削減)', () => {
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
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    render(dispatcher.getState(), root);
    return dispatcher;
  }

  function shell(): HTMLElement | null {
    return root.querySelector('.pkc-shell');
  }

  it('flag OFF:shell に data-pkc-compact-header 無し(従来 spacious)', () => {
    setFlag(false);
    boot();
    expect(shell()?.getAttribute('data-pkc-compact-header')).toBeNull();
  });

  it('flag ON:shell に data-pkc-compact-header="true"', () => {
    setFlag(true);
    boot();
    expect(shell()?.getAttribute('data-pkc-compact-header')).toBe('true');
  });

  it('flag ON:shell root の attr が CSS rule の trigger になる(selector confirm)', () => {
    setFlag(true);
    boot();
    // shell root に data-pkc-compact-header 付与済 + header 子要素が中にある
    const header = shell()?.querySelector('header.pkc-header');
    expect(header).not.toBeNull();
    // CSS selector `[data-pkc-compact-header="true"] .pkc-header` が matching する
    // 構造になっていることを verify
    const matches = shell()?.matches('[data-pkc-compact-header="true"]');
    expect(matches).toBe(true);
  });

  it('flag ON でも header の機能要素(title など)は描画される(横幅 / 機能不変)', () => {
    setFlag(true);
    boot();
    const title = shell()?.querySelector('.pkc-header-title');
    expect(title?.textContent).toBe('T');
  });

  it('flag ON + flag OFF の re-toggle で attr が追従', () => {
    setFlag(true);
    const d = boot();
    expect(shell()?.getAttribute('data-pkc-compact-header')).toBe('true');
    setFlag(false);
    d.dispatch({ type: 'SYS_SYNC_CHILD_WINDOWS', lids: [] });
    expect(shell()?.getAttribute('data-pkc-compact-header')).toBeNull();
  });
});
