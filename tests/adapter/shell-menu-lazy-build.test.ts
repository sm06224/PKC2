/**
 * @vitest-environment happy-dom
 *
 * pgc-207 (user 報告 2026-05-24「100エントリ程度で凄まじく動作が重い」):
 *
 * SELECT_ENTRY @ 100 entries は bench 上 52ms(60FPS 16.7ms 予算の 3 倍超過)。
 * 内訳:render:phase=ready 47.5ms 内で render:meta 5.4 + render:sidebar 2.4 +
 * render:center 2.2 = 10ms のみ measured、残 37.5ms が unmeasured。
 *
 * `renderShellMenu` は ~850 行の builder で Theme / Scanline / Accent /
 * Settings / Data section / Maintenance / Quick Help / Tools / Debug 等
 * ~200+ DOM node を生成する重量級。従来は `menuOpen=false` でも全 DOM を
 * build して `display:none` で隠す wasted work をしていた。本 PR で
 * `menuOpen=false` 時は overlay placeholder のみ返す early return に最適化。
 *
 * 本 test は:
 * 1. `menuOpen=false` 時、shell-menu overlay 存在 + 空(card / menu items
 *    無し、display:none)
 * 2. `menuOpen=true` 時、shell-menu overlay 内に Theme / Scanline / Accent /
 *    Data 等の section が build される(従来通り)
 * 3. menuOpen を toggle すると DOM が build/teardown される(後方互換確認)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { __resetRegistry, __resetUrlCache } from '@adapter/flags';

// vitest は project root から起動するので process.cwd() 基準で読む。
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

describe('pgc-207 shell menu lazy build(menuOpen=false 時に DOM 生成を skip)', () => {
  let root: HTMLElement;

  beforeEach(() => {
    __resetRegistry();
    __resetUrlCache();
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  function boot(): ReturnType<typeof createDispatcher> {
    const dispatcher = createDispatcher();
    dispatcher.onState((s) => render(s, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: emptyContainer() });
    return dispatcher;
  }

  it('case 1: menuOpen=false(default)で shell-menu overlay は存在するが空 + display:none', () => {
    boot();
    const overlay = root.querySelector('[data-pkc-region="shell-menu"]');
    expect(overlay).not.toBeNull();
    // display:none で hidden
    expect((overlay as HTMLElement).style.display).toBe('none');
    // 内部に menu card / menu item は build されない(early return)
    expect(overlay!.querySelector('.pkc-shell-menu-card')).toBeNull();
    expect(overlay!.querySelector('.pkc-shell-menu-heading')).toBeNull();
    expect(overlay!.querySelector('.pkc-shell-menu-section')).toBeNull();
  });

  it('case 2: menuOpen=true で shell-menu overlay 内に section が build される(従来挙動維持)', () => {
    const dispatcher = boot();
    dispatcher.dispatch({ type: 'TOGGLE_MENU' });
    const overlay = root.querySelector('[data-pkc-region="shell-menu"]');
    expect(overlay).not.toBeNull();
    expect((overlay as HTMLElement).style.display).toBe('');
    // 内部に menu card + sections build 済
    expect(overlay!.querySelector('.pkc-shell-menu-card')).not.toBeNull();
    expect(overlay!.querySelector('.pkc-shell-menu-heading')?.textContent).toBe('Menu');
    // 主要 section が存在
    const sections = overlay!.querySelectorAll('.pkc-shell-menu-section');
    expect(sections.length).toBeGreaterThanOrEqual(3); // Theme / Scanline / Accent 最低
  });

  it('case 3: menuOpen toggle で DOM が build/teardown される(後方互換)', () => {
    const dispatcher = boot();
    // 初期 closed
    let overlay = root.querySelector('[data-pkc-region="shell-menu"]');
    expect(overlay!.querySelector('.pkc-shell-menu-card')).toBeNull();
    // open
    dispatcher.dispatch({ type: 'TOGGLE_MENU' });
    overlay = root.querySelector('[data-pkc-region="shell-menu"]');
    expect(overlay!.querySelector('.pkc-shell-menu-card')).not.toBeNull();
    // close
    dispatcher.dispatch({ type: 'TOGGLE_MENU' });
    overlay = root.querySelector('[data-pkc-region="shell-menu"]');
    expect(overlay!.querySelector('.pkc-shell-menu-card')).toBeNull();
    expect((overlay as HTMLElement).style.display).toBe('none');
  });

  it('case 4: menuOpen=false で他の data-pkc-region(shell-menu-data 等)も build されない', () => {
    // shell.data_in_shell_menu_enabled が ON でも、menu 自体が closed なら
    // 内部 region も build されない(early return)
    const url = new URL(window.location.href);
    url.searchParams.set('pkc-flag', 'shell.data_in_shell_menu_enabled=1');
    window.history.replaceState({}, '', url.toString());
    __resetUrlCache();

    boot();
    // shell-menu-data section は menu closed のため build されない
    const dataSection = root.querySelector('[data-pkc-region="shell-menu-data"]');
    expect(dataSection).toBeNull();

    // cleanup
    url.searchParams.delete('pkc-flag');
    window.history.replaceState({}, '', url.toString());
  });

  it('case 5: structural — renderShellMenu 内部に `if (!state.menuOpen)` early return が存在', () => {
    // 後続 PR でこの早期 return を消した場合に test で検知
    const src = readFileSync(
      resolve(process.cwd(), 'src/adapter/ui/renderer.ts'),
      'utf8',
    );
    const renderShellMenuIdx = src.indexOf('function renderShellMenu(');
    expect(renderShellMenuIdx).toBeGreaterThan(-1);
    // 関数開始から最初の 1000 char 以内に `if (!state.menuOpen)` + `return overlay`
    const head = src.slice(renderShellMenuIdx, renderShellMenuIdx + 1500);
    expect(head).toMatch(/if\s*\(\s*!state\.menuOpen\s*\)/);
    expect(head).toMatch(/return\s+overlay/);
  });
});
