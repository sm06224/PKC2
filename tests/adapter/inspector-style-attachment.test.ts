/**
 * @vitest-environment happy-dom
 *
 * pgc-130 wave-δ #6(MASTER.md §7 attachment):Inspector Style tab の
 * **attachment 専用 metrics**(name / MIME / size / asset_key / sandbox /
 * App Launcher 登録状態)。
 *
 * Inspector Style tab archetype-specific 拡張の 3 段目(textlog → todo →
 * attachment)。残り form / folder。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { __resetRegistry, __resetUrlCache } from '@adapter/flags';
import { render } from '@adapter/ui/renderer';
import { createDispatcher } from '@adapter/state/dispatcher';
import {
  resetMetaPaneInspectorState,
  setMetaPaneInspectorActiveTab,
} from '@adapter/ui/meta-pane-inspector';
import type { Container } from '@core/model/container';

const TS = '2026-01-01T00:00:00Z';

interface AttBodyShape {
  name?: string;
  mime?: string;
  size?: number;
  asset_key?: string;
  data?: string;
  sandbox_allow?: string[];
  registered_as_app?: boolean;
}

function makeAttContainer(body: AttBodyShape): Container {
  return {
    meta: { container_id: 't', title: 'T', created_at: TS, updated_at: TS, schema_version: 1 },
    entries: [
      { lid: 'a1', title: 'Attachment', body: JSON.stringify(body), archetype: 'attachment', created_at: TS, updated_at: TS },
    ],
    relations: [], revisions: [], assets: {},
  };
}

function setFlag(value: boolean): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('pkc-flag');
  if (value) {
    url.searchParams.set('pkc-flag', 'shell.meta_pane_inspector_enabled=1');
  }
  window.history.replaceState({}, '', url.toString());
  __resetUrlCache();
}

describe('pgc-130 Inspector Style tab — attachment 専用 metrics', () => {
  let root: HTMLElement;

  beforeEach(() => {
    __resetRegistry();
    __resetUrlCache();
    resetMetaPaneInspectorState();
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  afterEach(() => {
    setFlag(false);
    resetMetaPaneInspectorState();
  });

  function boot(c: Container): ReturnType<typeof createDispatcher> {
    const dispatcher = createDispatcher();
    dispatcher.onState((s) => render(s, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: c });
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'a1' });
    render(dispatcher.getState(), root);
    return dispatcher;
  }

  function activateStyle(d: ReturnType<typeof createDispatcher>): void {
    setMetaPaneInspectorActiveTab('style');
    d.dispatch({ type: 'SYS_SYNC_CHILD_WINDOWS', lids: [] });
  }

  function styleSection(): HTMLElement | null {
    return root.querySelector('[data-pkc-region="inspector-style-metrics"]');
  }

  it('flag ON + 基本 attachment(name + mime + size):全行表示', () => {
    setFlag(true);
    // gitleaks false-positive 回避:test 用の asset key を明示的 prefix
    // (`test-asset-`) で始める ── generic-api-key 検出 pattern を避ける。
    const d = boot(makeAttContainer({
      name: 'photo.jpg', mime: 'image/jpeg', size: 2_500_000, asset_key: 'test-asset-photo-key',
    }));
    activateStyle(d);
    const text = styleSection()?.textContent ?? '';
    expect(text).toContain('Filename');
    expect(text).toContain('photo.jpg');
    expect(text).toContain('MIME type');
    expect(text).toContain('image/jpeg');
    expect(text).toContain('File size');
    expect(text).toContain('2.38 MB'); // 2_500_000 / (1024*1024) ≈ 2.38
    expect(text).toContain('Asset key');
    expect(text).toContain('test-asset-'); // truncated to 12 chars + …
  });

  it('flag ON + small file → byte 表示', () => {
    setFlag(true);
    const d = boot(makeAttContainer({
      name: 'tiny.txt', mime: 'text/plain', size: 512,
    }));
    activateStyle(d);
    expect(styleSection()?.textContent).toContain('512 B');
  });

  it('flag ON + KB-range file → KB 表示', () => {
    setFlag(true);
    const d = boot(makeAttContainer({
      name: 'doc.txt', mime: 'text/plain', size: 51200, // 50 KB
    }));
    activateStyle(d);
    expect(styleSection()?.textContent).toContain('50.0 KB');
  });

  it('flag ON + GB-range file → GB 表示', () => {
    setFlag(true);
    const d = boot(makeAttContainer({
      name: 'huge.bin', mime: 'application/octet-stream', size: 2 * 1024 * 1024 * 1024, // 2 GB
    }));
    activateStyle(d);
    expect(styleSection()?.textContent).toContain('2.00 GB');
  });

  it('flag ON + legacy inline data(asset_key 無 + data あり)→ "legacy (inline base64)"', () => {
    setFlag(true);
    const d = boot(makeAttContainer({
      name: 'old.txt', mime: 'text/plain', size: 100, data: 'aGVsbG8=',
    }));
    activateStyle(d);
    const text = styleSection()?.textContent ?? '';
    expect(text).toContain('Storage');
    expect(text).toContain('legacy');
  });

  it('flag ON + HTML attachment with sandbox_allow → all permissions joined', () => {
    setFlag(true);
    const d = boot(makeAttContainer({
      name: 'app.html', mime: 'text/html',
      sandbox_allow: ['allow-scripts', 'allow-forms'],
    }));
    activateStyle(d);
    const text = styleSection()?.textContent ?? '';
    expect(text).toContain('Sandbox allow');
    expect(text).toContain('allow-scripts');
    expect(text).toContain('allow-forms');
  });

  it('flag ON + sandbox_allow 無 → row 出ない', () => {
    setFlag(true);
    const d = boot(makeAttContainer({
      name: 'doc.pdf', mime: 'application/pdf', size: 1000,
    }));
    activateStyle(d);
    const text = styleSection()?.textContent ?? '';
    expect(text).not.toContain('Sandbox allow');
  });

  it('flag ON + registered_as_app:true → "🚀 registered"', () => {
    setFlag(true);
    const d = boot(makeAttContainer({
      name: 'app.html', mime: 'text/html', registered_as_app: true,
    }));
    activateStyle(d);
    const text = styleSection()?.textContent ?? '';
    expect(text).toContain('App Launcher');
    expect(text).toContain('🚀 registered');
  });

  it('flag ON + registered_as_app:false → "App Launcher" row 出ない', () => {
    setFlag(true);
    const d = boot(makeAttContainer({
      name: 'doc.pdf', mime: 'application/pdf', registered_as_app: false,
    }));
    activateStyle(d);
    expect(styleSection()?.textContent).not.toContain('App Launcher');
  });

  it('flag ON + name 無 attachment → "(unnamed)"', () => {
    setFlag(true);
    const d = boot(makeAttContainer({ mime: 'application/octet-stream', size: 100 }));
    activateStyle(d);
    expect(styleSection()?.textContent).toContain('(unnamed)');
  });

  it('flag ON + text archetype → attachment metrics 出ない(scope check)', () => {
    setFlag(true);
    const c: Container = {
      meta: { container_id: 't', title: 'T', created_at: TS, updated_at: TS, schema_version: 1 },
      entries: [
        { lid: 'a1', title: 'X', body: '# heading', archetype: 'text', created_at: TS, updated_at: TS },
      ],
      relations: [], revisions: [], assets: {},
    };
    const d = boot(c);
    activateStyle(d);
    const text = styleSection()?.textContent ?? '';
    expect(text).not.toContain('Filename');
    expect(text).not.toContain('MIME type');
  });
});
