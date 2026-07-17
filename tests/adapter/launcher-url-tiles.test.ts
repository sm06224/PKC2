/** @vitest-environment happy-dom */
/**
 * #926 — launcher 導線見直し + URL タイル(flag opt-in)の統合 test。
 *   1. PKC-Extension 添付が launcher に自動で並ぶ(🧩、kind attr)
 *   2. flag OFF(既定)では「+ URL タイル」ボタンが出ない
 *   3. flag ON: ボタン → prompt(URL / 名前)→ 擬似リダイレクト HTML が
 *      attachment 化され、registered_as_app + launcher_url + 🔗 で tile 化
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createDispatcher } from '@adapter/state/dispatcher';
import { bindActions } from '@adapter/ui/action-binder';
import { render } from '@adapter/ui/renderer';
import { parseAttachmentBody, attachmentPresenter } from '@adapter/ui/attachment-presenter';
import { registerPresenter } from '@adapter/ui/detail-presenter';
import { setContainerFlagSource } from '@adapter/flags';
import type { Container } from '@core/model/container';

registerPresenter('attachment', attachmentPresenter);

const T = '2026-07-17T00:00:00Z';

function makeContainer(): Container {
  return {
    meta: { container_id: 'c-926', title: 't', created_at: T, updated_at: T, schema_version: 1 },
    entries: [
      {
        lid: 'app1', title: 'My App', archetype: 'attachment',
        body: JSON.stringify({ name: 'app.html', mime: 'text/html', asset_key: 'ka', size: 10, registered_as_app: true }),
        created_at: T, updated_at: T,
      },
      {
        // PKC-Extension(registered_as_app なし)— #926 で launcher に自動で並ぶ
        lid: 'ext1', title: 'Graph Ext', archetype: 'attachment',
        body: JSON.stringify({ name: 'graph.html', mime: 'text/html', asset_key: 'kx', size: 10, pkc_extension: true }),
        created_at: T, updated_at: T,
      },
    ],
    relations: [],
    revisions: [],
    assets: { ka: btoa('<html>app</html>'), kx: btoa('<html>ext</html>') },
  };
}

let root: HTMLElement;
let cleanup: (() => void) | null = null;

beforeEach(() => {
  root = document.createElement('div');
  document.body.appendChild(root);
});
afterEach(() => {
  cleanup?.();
  root.remove();
  setContainerFlagSource({});
  vi.restoreAllMocks();
});

function setup() {
  const dispatcher = createDispatcher();
  dispatcher.onState((s) => render(s, root));
  dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
  render(dispatcher.getState(), root);
  cleanup = bindActions(root, dispatcher);
  dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'launcher' });
  return dispatcher;
}

describe('launcher 導線見直し(#926)', () => {
  it('PKC-Extension 添付が 🧩 タイルとして自動で並ぶ(registered_as_app 不要)', () => {
    setup();
    const extTile = root.querySelector<HTMLElement>(
      '.pkc-launcher-tile[data-pkc-lid="ext1"]',
    )!;
    expect(extTile).not.toBeNull();
    expect(extTile.getAttribute('data-pkc-launcher-kind')).toBe('extension');
    expect(extTile.textContent).toContain('🧩');
    expect(extTile.getAttribute('title')).toContain('PKC-Extension として起動');
    // 従来アプリも従来どおり
    const appTile = root.querySelector<HTMLElement>('.pkc-launcher-tile[data-pkc-lid="app1"]')!;
    expect(appTile.getAttribute('data-pkc-launcher-kind')).toBe('app');
  });

  it('flag OFF(既定)では「+ URL タイル」ボタンは出ない', () => {
    setup();
    expect(root.querySelector('[data-pkc-action="launcher-add-url"]')).toBeNull();
  });
});

describe('URL タイル追加(flag ON、#926)', () => {
  beforeEach(() => {
    setContainerFlagSource({ 'shell.launcher_url_tiles': true });
  });

  it('ボタン → prompt → 擬似リダイレクト添付が mint され 🔗 タイルになる', () => {
    const d = setup();
    const btn = root.querySelector<HTMLButtonElement>('[data-pkc-action="launcher-add-url"]')!;
    expect(btn).not.toBeNull();

    vi.spyOn(window, 'prompt')
      .mockReturnValueOnce('https://example.com/portal')
      .mockReturnValueOnce('社内ポータル');
    btn.click();

    const c = d.getState().container!;
    const minted = c.entries.find((e) => {
      if (e.archetype !== 'attachment') return false;
      return parseAttachmentBody(e.body).launcher_url === 'https://example.com/portal';
    })!;
    expect(minted).toBeTruthy();
    expect(minted.title).toBe('社内ポータル');
    const att = parseAttachmentBody(minted.body);
    expect(att.registered_as_app).toBe(true);
    expect(att.app_icon).toBe('🔗');
    expect(att.mime).toBe('text/html');
    // asset の中身 = 擬似リダイレクトページ(no-referrer + replace)
    const html = decodeURIComponent(escape(atob(c.assets[att.asset_key!]!)));
    expect(html).toContain('location.replace("https://example.com/portal")');
    expect(html).toContain('no-referrer');

    // 再 render で 🔗 タイルが並ぶ
    render(d.getState(), root);
    const tile = root.querySelector<HTMLElement>(
      `.pkc-launcher-tile[data-pkc-lid="${minted.lid}"]`,
    )!;
    expect(tile.getAttribute('data-pkc-launcher-kind')).toBe('url');
    expect(tile.textContent).toContain('🔗');
    expect(tile.textContent).toContain('社内ポータル');
  });

  it('不正 URL は拒否(mint されない)', () => {
    const d = setup();
    vi.spyOn(window, 'prompt').mockReturnValueOnce('javascript:alert(1)');
    root.querySelector<HTMLButtonElement>('[data-pkc-action="launcher-add-url"]')!.click();
    const c = d.getState().container!;
    expect(c.entries.filter((e) => e.archetype === 'attachment')).toHaveLength(2); // 既存 2 件のみ
  });

  it('prompt キャンセルは no-op', () => {
    const d = setup();
    vi.spyOn(window, 'prompt').mockReturnValueOnce(null);
    root.querySelector<HTMLButtonElement>('[data-pkc-action="launcher-add-url"]')!.click();
    expect(d.getState().container!.entries).toHaveLength(2);
  });
});
