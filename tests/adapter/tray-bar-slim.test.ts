/**
 * @vitest-environment happy-dom
 *
 * pgc-138 wave-δ #12(user bug report 2026-05-24):
 * 「不必要な隠し項目の耳が見えていたりで視覚ノイズが大きい」
 *
 * tray bar(sidebar / meta collapsed 時の縦 strip)の chrome を削減 ──
 * shellTrayBarSlimEnabled() ON で:
 *   - text("SIDEBAR" / "META")を空に
 *   - `data-pkc-slim="true"` attr 立て
 *   - CSS で 20px → 6px に細く、hover で accent border + 12px expand
 *
 * `title` attr + `data-pkc-action` は維持 ── click 動線完全に保つ。
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
    url.searchParams.set('pkc-flag', 'shell.tray_bar_slim_enabled=1');
  }
  window.history.replaceState({}, '', url.toString());
  __resetUrlCache();
}

describe('pgc-138 tray bar slim chrome(視覚ノイズ削減)', () => {
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
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    render(dispatcher.getState(), root);
    return dispatcher;
  }

  function leftTray(): HTMLElement | null {
    return root.querySelector('[data-pkc-region="tray-left"]');
  }
  function rightTray(): HTMLElement | null {
    return root.querySelector('[data-pkc-region="tray-right"]');
  }

  it('flag OFF:tray text "SIDEBAR" + slim attr 無し(従来)', () => {
    setFlag(false);
    boot();
    expect(leftTray()?.textContent).toBe('SIDEBAR');
    expect(leftTray()?.getAttribute('data-pkc-slim')).toBeNull();
  });

  it('flag OFF:right tray text "META" + slim attr 無し', () => {
    setFlag(false);
    boot();
    expect(rightTray()?.textContent).toBe('META');
    expect(rightTray()?.getAttribute('data-pkc-slim')).toBeNull();
  });

  it('flag ON:left tray text 空 + data-pkc-slim="true"', () => {
    setFlag(true);
    boot();
    expect(leftTray()?.textContent).toBe('');
    expect(leftTray()?.getAttribute('data-pkc-slim')).toBe('true');
  });

  it('flag ON:right tray text 空 + data-pkc-slim="true"', () => {
    setFlag(true);
    boot();
    expect(rightTray()?.textContent).toBe('');
    expect(rightTray()?.getAttribute('data-pkc-slim')).toBe('true');
  });

  it('flag ON:title attribute は維持(tooltip で click 動線維持)', () => {
    setFlag(true);
    boot();
    expect(leftTray()?.getAttribute('title')).toBe('Click to expand sidebar');
    expect(rightTray()?.getAttribute('title')).toBe('Click to expand meta pane');
  });

  it('flag ON:data-pkc-action は維持(click 動線維持)', () => {
    setFlag(true);
    boot();
    expect(leftTray()?.getAttribute('data-pkc-action')).toBe('toggle-sidebar');
    expect(rightTray()?.getAttribute('data-pkc-action')).toBe('toggle-meta');
  });
});
