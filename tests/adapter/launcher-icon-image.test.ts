/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDispatcher } from '@adapter/state/dispatcher';
import { bindActions } from '@adapter/ui/action-binder';
import { render } from '@adapter/ui/renderer';
import {
  parseAttachmentBody,
  serializeAttachmentBody,
  attachmentPresenter,
} from '@adapter/ui/attachment-presenter';
import { registerPresenter } from '@adapter/ui/detail-presenter';
import type { Container } from '@core/model/container';

// main.ts も registerPresenter('attachment', attachmentPresenter) を呼ぶが、
// tests は main を import しないので明示登録(主アプリで registered な状態を再現)
registerPresenter('attachment', attachmentPresenter);

/**
 * PR-V5(2026-05-14、PR #432 stack v2.3.x):App Launcher icon image 対応。
 *
 * これまで App Launcher の tile は AttachmentBody.app_icon(emoji 1 字)のみ
 * 表示できた。本 PR で `app_icon_asset_key` を追加し、同 container 内の
 * image attachment(`mime: image/*` + `asset_key` 保持)を icon として
 * render できるようにする。emoji fallback も継続。
 *
 * Pinned contract:
 *   - parse / serialize で `app_icon_asset_key` を round-trip
 *   - launcher tile が `<img>` を出す(asset_key + asset bytes 揃った時)
 *   - asset が container から消えた場合 → emoji fallback
 *   - `app_icon_asset_key` 未設定 → emoji(または default 🌐)
 */

// 1x1 transparent PNG
const PNG_1x1_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

function makeContainer(): Container {
  return {
    meta: {
      container_id: 'launcher-icon-test',
      title: 'Test',
      created_at: '2026-05-14T00:00:00Z',
      updated_at: '2026-05-14T00:00:00Z',
      schema_version: 1,
    },
    entries: [
      // App-registered HTML attachment with image icon
      {
        lid: 'html-app',
        title: 'My HTML App',
        body: JSON.stringify({
          name: 'app.html',
          mime: 'text/html',
          asset_key: 'ast-html-1',
          size: 100,
          registered_as_app: true,
          app_icon: '🚀',
          app_icon_asset_key: 'ast-img-1',
        }),
        archetype: 'attachment',
        created_at: '2026-05-14T00:00:00Z',
        updated_at: '2026-05-14T00:00:00Z',
      },
      // Image attachment that the HTML app references for its icon
      {
        lid: 'img-attachment',
        title: 'App Icon Image',
        body: JSON.stringify({
          name: 'icon.png',
          mime: 'image/png',
          asset_key: 'ast-img-1',
          size: 70,
        }),
        archetype: 'attachment',
        created_at: '2026-05-14T00:00:00Z',
        updated_at: '2026-05-14T00:00:00Z',
      },
    ],
    relations: [],
    revisions: [],
    assets: {
      'ast-html-1': btoa('<html></html>'),
      'ast-img-1': PNG_1x1_B64,
    },
  };
}

let root: HTMLElement;
let cleanup: (() => void) | null = null;

beforeEach(() => {
  root = document.createElement('div');
  root.id = 'pkc-root';
  document.body.appendChild(root);
});

afterEach(() => {
  if (cleanup) {
    cleanup();
    cleanup = null;
  }
  document.body.removeChild(root);
});

describe('PR-V5 — AttachmentBody.app_icon_asset_key round-trip', () => {
  it('parses app_icon_asset_key from JSON body', () => {
    const body = JSON.stringify({
      name: 'a.html',
      mime: 'text/html',
      app_icon_asset_key: 'ast-foo',
    });
    expect(parseAttachmentBody(body).app_icon_asset_key).toBe('ast-foo');
  });

  it('serializes app_icon_asset_key when non-empty', () => {
    const body = serializeAttachmentBody({
      name: 'a.html',
      mime: 'text/html',
      app_icon_asset_key: 'ast-foo',
    });
    expect(JSON.parse(body).app_icon_asset_key).toBe('ast-foo');
  });

  it('omits app_icon_asset_key when undefined / empty', () => {
    const body = serializeAttachmentBody({ name: 'a.html', mime: 'text/html' });
    expect(JSON.parse(body).app_icon_asset_key).toBeUndefined();
  });

  it('round-trip: parse(serialize(x)) preserves app_icon_asset_key alongside emoji', () => {
    const orig = parseAttachmentBody(JSON.stringify({
      name: 'a.html',
      mime: 'text/html',
      app_icon: '🚀',
      app_icon_asset_key: 'ast-foo',
    }));
    const roundTrip = parseAttachmentBody(serializeAttachmentBody(orig));
    expect(roundTrip.app_icon).toBe('🚀');
    expect(roundTrip.app_icon_asset_key).toBe('ast-foo');
  });
});

describe('PR-V5 — launcher tile renders <img> when app_icon_asset_key resolves', () => {
  it('tile contains <img> for HTML attachment with valid asset_key', () => {
    const dispatcher = createDispatcher();
    dispatcher.onState((s) => render(s, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    cleanup = bindActions(root, dispatcher);
    dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'launcher' });
    render(dispatcher.getState(), root);
    const img = root.querySelector<HTMLImageElement>('.pkc-launcher-tile-icon-image');
    expect(img).not.toBeNull();
    expect(img!.src).toMatch(/^data:image\/png;base64,/);
  });

  it('tile falls back to emoji when asset_key references missing asset', () => {
    const container = makeContainer();
    // Remove the image asset bytes — asset_key stays in body
    delete container.assets['ast-img-1'];
    const dispatcher = createDispatcher();
    dispatcher.onState((s) => render(s, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });
    cleanup = bindActions(root, dispatcher);
    dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'launcher' });
    render(dispatcher.getState(), root);
    const img = root.querySelector<HTMLImageElement>('.pkc-launcher-tile-icon-image');
    expect(img).toBeNull();
    const iconEl = root.querySelector('.pkc-launcher-tile-icon');
    expect(iconEl?.textContent).toBe('🚀');
  });

  it('tile uses emoji when app_icon_asset_key not set', () => {
    const container = makeContainer();
    // Remove asset_key from the HTML attachment
    const htmlEntry = container.entries[0]!;
    const att = parseAttachmentBody(htmlEntry.body);
    delete att.app_icon_asset_key;
    htmlEntry.body = serializeAttachmentBody(att);
    const dispatcher = createDispatcher();
    dispatcher.onState((s) => render(s, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });
    cleanup = bindActions(root, dispatcher);
    dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'launcher' });
    render(dispatcher.getState(), root);
    const img = root.querySelector<HTMLImageElement>('.pkc-launcher-tile-icon-image');
    expect(img).toBeNull();
    const iconEl = root.querySelector('.pkc-launcher-tile-icon');
    expect(iconEl?.textContent).toBe('🚀');
  });

  it('tile uses default 🌐 when no emoji + no asset_key', () => {
    const container = makeContainer();
    const htmlEntry = container.entries[0]!;
    const att = parseAttachmentBody(htmlEntry.body);
    delete att.app_icon;
    delete att.app_icon_asset_key;
    htmlEntry.body = serializeAttachmentBody(att);
    const dispatcher = createDispatcher();
    dispatcher.onState((s) => render(s, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });
    cleanup = bindActions(root, dispatcher);
    dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'launcher' });
    render(dispatcher.getState(), root);
    const iconEl = root.querySelector('.pkc-launcher-tile-icon');
    expect(iconEl?.textContent).toBe('🌐');
  });
});

describe('PR-V5 — attachment editor select hydration', () => {
  function bootEditorFor(lid: string): void {
    const dispatcher = createDispatcher();
    dispatcher.onState((s) => render(s, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    cleanup = bindActions(root, dispatcher);
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid });
    render(dispatcher.getState(), root);
  }

  it('HTML attachment view shows a select populated with image attachments', () => {
    bootEditorFor('html-app');
    const sel = root.querySelector<HTMLSelectElement>('.pkc-attachment-app-icon-asset-select');
    expect(sel).not.toBeNull();
    const optionValues = Array.from(sel!.options).map((o) => o.value);
    // First option is "" (none / emoji), then image attachments
    expect(optionValues[0]).toBe('');
    expect(optionValues).toContain('ast-img-1');
    // Currently selected = the registered asset_key
    const selected = Array.from(sel!.options).find((o) => o.selected);
    expect(selected?.value).toBe('ast-img-1');
  });

  it('select removes the data-pkc-needs-image-options marker after hydration', () => {
    bootEditorFor('html-app');
    const sel = root.querySelector<HTMLSelectElement>('.pkc-attachment-app-icon-asset-select');
    expect(sel?.hasAttribute('data-pkc-needs-image-options')).toBe(false);
  });

  it('changing the select dispatches QUICK_UPDATE_ENTRY with new asset_key', () => {
    const dispatcher = createDispatcher();
    dispatcher.onState((s) => render(s, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    cleanup = bindActions(root, dispatcher);
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'html-app' });
    render(dispatcher.getState(), root);
    const sel = root.querySelector<HTMLSelectElement>('.pkc-attachment-app-icon-asset-select');
    expect(sel).not.toBeNull();
    // Switch to "none" (empty value) — should clear the asset_key
    sel!.value = '';
    sel!.dispatchEvent(new Event('change', { bubbles: true }));
    const updatedEntry = dispatcher
      .getState()
      .container?.entries.find((e) => e.lid === 'html-app');
    expect(updatedEntry).toBeDefined();
    const att = parseAttachmentBody(updatedEntry!.body);
    expect(att.app_icon_asset_key).toBeUndefined();
    // Emoji preserved
    expect(att.app_icon).toBe('🚀');
  });
});
