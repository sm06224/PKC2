/**
 * @vitest-environment happy-dom
 *
 * command id 参照整合性 ── **dead command を構造的に禁止する**。
 *
 * 背景(視覚監査 2026-07-25、docs/development/visual-audit-2026-07-25.md §2 A2):
 * 右クリックメニューの「📊 グラフビュー」と `Alt+5` が `view.graph` を参照して
 * いたが、その command はどこにも register されていなかった。`executeCommand`
 * は未登録 id を **silent no-op(false 返却)** で握りつぶすため、user から見ると
 * 「メニューに項目が見えるのに押しても何も起きない」状態だった。graph view 自体は
 * 既に廃止済で、参照側だけが残骸として残っていた。
 *
 * unit も parity も「押した結果」を見ていなかったので誰も気づかず、実機の視覚監査
 * で初めて発覚した。同じ事故を二度起こさないための pin がこの test。
 *
 * 検査は **全部 runtime**(source の regex 解析ではない):
 *   - 参照側 A = `getKeyBindings()` の commandId
 *   - 参照側 B = `renderRegionContextMenu(region)` が生成した `[data-pkc-cmd-id]`
 *   - 登録側   = `getCommandMetas()` の id
 * 参照側 ⊄ 登録側 なら fail。新しい menu 項目 / keybinding を足したときに
 * command の register を忘れると、ここで落ちる。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getCommandMetas, resetCommandRegistry } from '@adapter/ui/command-palette';
import { registerBuiltinCommands } from '@adapter/ui/command-palette-builtins';
import {
  getKeyBindings,
  registerBuiltinKeymaps,
  resetKeymapRegistry,
} from '@adapter/ui/keymap-binder';
import { renderRegionContextMenu, type ContextMenuRegion } from '@adapter/ui/context-menu-region';
import { createDispatcher } from '@adapter/state/dispatcher';
import { __resetRegistry, __resetUrlCache } from '@adapter/flags';

const REGIONS: ContextMenuRegion[] = ['center', 'sidebar', 'meta', 'header', 'unknown'];

describe('command id 参照整合性(dead command 禁止)', () => {
  let registered: Set<string>;

  beforeEach(() => {
    __resetRegistry();
    __resetUrlCache();
    resetCommandRegistry();
    resetKeymapRegistry();
    document.body.innerHTML = '';

    registerBuiltinCommands(createDispatcher());
    registerBuiltinKeymaps();
    registered = new Set(getCommandMetas().map((m) => m.id));
  });

  afterEach(() => {
    resetCommandRegistry();
    resetKeymapRegistry();
  });

  it('builtin command が 1 つ以上 register されている(前提の健全性)', () => {
    expect(registered.size).toBeGreaterThan(10);
  });

  it('全 keybinding の commandId が register 済(Alt+5 = view.graph 型の事故を禁止)', () => {
    const dead = getKeyBindings()
      .filter((b) => !registered.has(b.commandId))
      .map((b) => b.commandId);
    expect(
      dead,
      `未登録の commandId を参照する keybinding があります: ${dead.join(', ')}。` +
        'command を register するか、keybinding 側を削除すること(押しても無反応になる)',
    ).toEqual([]);
  });

  it('全 region の context menu 項目の commandId が register 済', () => {
    const dead: string[] = [];
    for (const region of REGIONS) {
      const menu = renderRegionContextMenu(region, 0, 0);
      for (const el of Array.from(menu.querySelectorAll('[data-pkc-cmd-id]'))) {
        const id = el.getAttribute('data-pkc-cmd-id') ?? '';
        if (id && !registered.has(id)) dead.push(`${region}:${id}`);
      }
    }
    expect(
      dead,
      `未登録の commandId を参照する context menu 項目があります: ${dead.join(', ')}。` +
        'メニューに見えているのに押しても何も起きない状態になります',
    ).toEqual([]);
  });

  it('viewMode 系 command は AppState の viewMode 値と 1:1(余分な view.* を作らない)', () => {
    // AppState.viewMode = 'detail' | 'calendar' | 'kanban' | 'filer' | 'launcher'
    const expected = ['view.detail', 'view.calendar', 'view.kanban', 'view.filer', 'view.launcher'];
    const actual = [...registered].filter((id) => id.startsWith('view.') && id !== 'view.clear-filters');
    expect(actual.sort()).toEqual([...expected].sort());
  });
});
