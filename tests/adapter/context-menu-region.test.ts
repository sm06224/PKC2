/**
 * @vitest-environment happy-dom
 *
 * Region-aware context menu test(pgc-83、MASTER.md §4.7)。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  renderRegionContextMenu,
  detectContextMenuRegion,
} from '../../src/adapter/ui/context-menu-region';
import {
  registerCommand,
  resetCommandRegistry,
} from '../../src/adapter/ui/command-palette';

beforeEach(() => {
  resetCommandRegistry();
  document.body.innerHTML = '';
});

describe('detectContextMenuRegion', () => {
  it('returns unknown when target is null', () => {
    expect(detectContextMenuRegion(null)).toBe('unknown');
  });
  it('returns unknown when no data-pkc-region ancestor', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    expect(detectContextMenuRegion(el)).toBe('unknown');
  });
  it('center region', () => {
    const el = document.createElement('div');
    el.setAttribute('data-pkc-region', 'center');
    const child = document.createElement('span');
    el.appendChild(child);
    document.body.appendChild(el);
    expect(detectContextMenuRegion(child)).toBe('center');
  });
  it('sidebar region', () => {
    const el = document.createElement('div');
    el.setAttribute('data-pkc-region', 'sidebar');
    document.body.appendChild(el);
    expect(detectContextMenuRegion(el)).toBe('sidebar');
  });
  it('header region(topbar 同義)', () => {
    const el = document.createElement('div');
    el.setAttribute('data-pkc-region', 'topbar');
    document.body.appendChild(el);
    expect(detectContextMenuRegion(el)).toBe('header');
  });
  it('meta region', () => {
    const el = document.createElement('div');
    el.setAttribute('data-pkc-region', 'meta-pane');
    document.body.appendChild(el);
    expect(detectContextMenuRegion(el)).toBe('meta');
  });
  it('view-related region treated as center', () => {
    const el = document.createElement('div');
    el.setAttribute('data-pkc-region', 'detail-view');
    document.body.appendChild(el);
    expect(detectContextMenuRegion(el)).toBe('center');
  });
});

describe('renderRegionContextMenu', () => {
  it('center region has create-text + view-mode items', () => {
    const menu = renderRegionContextMenu('center', 10, 20);
    document.body.appendChild(menu);
    const ids = [...menu.querySelectorAll('[data-pkc-cmd-id]')]
      .map((b) => b.getAttribute('data-pkc-cmd-id'));
    expect(ids).toContain('entry.create.text');
    expect(ids).toContain('view.filer');
    expect(ids).toContain('view.calendar');
    // `view.graph` は削除済(視覚監査 2026-07-25)── command が register
    // されておらず、押しても silent no-op になる dead 項目だった。
    expect(ids).not.toContain('view.graph');
  });
  it('sidebar region has create archetypes', () => {
    const menu = renderRegionContextMenu('sidebar', 0, 0);
    const ids = [...menu.querySelectorAll('[data-pkc-cmd-id]')]
      .map((b) => b.getAttribute('data-pkc-cmd-id'));
    expect(ids).toContain('entry.create.text');
    expect(ids).toContain('entry.create.textlog');
    expect(ids).toContain('entry.create.todo');
    expect(ids).toContain('entry.create.folder');
  });
  it('header region has shell + about', () => {
    const menu = renderRegionContextMenu('header', 0, 0);
    const ids = [...menu.querySelectorAll('[data-pkc-cmd-id]')]
      .map((b) => b.getAttribute('data-pkc-cmd-id'));
    expect(ids).toContain('shell.open-menu');
    expect(ids).toContain('app.about');
    expect(ids).toContain('shell.toggle-sidebar');
  });
  it('clicking item executes command and removes menu', () => {
    // ⚠ **menu に実在する commandId を使うこと**。以前この test は
    //    `view.graph` を test 側で register して click していたため、
    //    「product では未登録 = 押しても無反応」という事実を隠していた
    //    (視覚監査 2026-07-25 で発覚)。参照整合性そのものは
    //    tests/adapter/command-id-integrity.test.ts が守る。
    let called = 0;
    registerCommand(
      { id: 'view.filer', titleJa: 'ファイラー', titleEn: 'Filer', category: 'View' },
      () => { called++; },
    );
    const menu = renderRegionContextMenu('center', 0, 0);
    document.body.appendChild(menu);
    const btn = menu.querySelector<HTMLElement>('[data-pkc-cmd-id="view.filer"]');
    expect(btn, 'view.filer 項目が menu に無い').not.toBeNull();
    btn?.click();
    expect(called).toBe(1);
    expect(document.body.contains(menu)).toBe(false);
  });
  it('positioning uses x / y', () => {
    const menu = renderRegionContextMenu('center', 123, 456);
    expect(menu.style.left).toBe('123px');
    expect(menu.style.top).toBe('456px');
  });
  it('separators are inserted', () => {
    const menu = renderRegionContextMenu('center', 0, 0);
    const seps = menu.querySelectorAll('.pkc-context-menu-separator');
    expect(seps.length).toBeGreaterThan(0);
  });
  it('attribute data-pkc-context-region is set', () => {
    const menu = renderRegionContextMenu('sidebar', 0, 0);
    expect(menu.getAttribute('data-pkc-context-region')).toBe('sidebar');
  });
});
