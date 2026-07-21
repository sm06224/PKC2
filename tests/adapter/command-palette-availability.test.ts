/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerCommand,
  executeCommand,
  getCommandAvailability,
  openCommandPalette,
  resetCommandRegistry,
  resetCommandPaletteOverlay,
} from '@adapter/ui/command-palette';
import { registerBuiltinCommands } from '@adapter/ui/command-palette-builtins';
import { createDispatcher } from '@adapter/state/dispatcher';
import { setContainerFlagSource } from '@adapter/flags';
import type { Container } from '@core/model/container';

/**
 * #951(user 報告「コマンドパレットの機能がほとんど機能しなかった」)—
 * availability 機構のテスト。
 *
 * 全 ~60 command 中 ~38 個が既定状態(flags OFF / 非編集 / 未選択)で
 * console.warn だけの silent no-op だった。契約を「黙って何もしない」→
 * 「なぜ使えないか・どうすれば使えるかを返す」に変更:
 *   - executeCommand: 使えない command は理由 toast + false(handler 不実行)
 *   - palette 一覧: 使えない command はグレー + 理由表示、使える command が先
 *   - 条件が満たされれば(flag ON / 編集中)従来どおり実行される
 */

const T = '2026-07-22T00:00:00Z';

function makeContainer(): Container {
  return {
    meta: { container_id: 'c-951', title: 't', created_at: T, updated_at: T, schema_version: 1 },
    entries: [
      { lid: 'e1', title: 'One', body: 'x', archetype: 'text', created_at: T, updated_at: T },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };
}

function toastText(): string {
  return document.querySelector('[data-pkc-region="toast"]')?.textContent ?? '';
}

beforeEach(() => {
  setContainerFlagSource({});
  resetCommandRegistry();
  resetCommandPaletteOverlay();
  document.body.innerHTML = '';
  return () => {
    setContainerFlagSource({});
    resetCommandRegistry();
    resetCommandPaletteOverlay();
    document.body.innerHTML = '';
  };
});

describe('availability の基本契約', () => {
  it('使えない command は handler を実行せず、理由 toast + false', () => {
    let ran = 0;
    registerCommand(
      { id: 'x.gated', titleJa: 'ゲート', titleEn: 'Gated', category: 'View' },
      () => { ran++; },
      () => '機能 X が OFF です',
    );
    expect(getCommandAvailability('x.gated')).toBe('機能 X が OFF です');
    expect(executeCommand('x.gated')).toBe(false);
    expect(ran).toBe(0);
    expect(toastText()).toContain('機能 X が OFF です');
  });

  it('availability が null なら従来どおり実行される', () => {
    let ran = 0;
    registerCommand(
      { id: 'x.open', titleJa: '開', titleEn: 'Open', category: 'View' },
      () => { ran++; },
      () => null,
    );
    expect(executeCommand('x.open')).toBe(true);
    expect(ran).toBe(1);
  });
});

describe('palette 一覧の表示(グレー + 理由 + 並び順)', () => {
  it('使えない command は data-pkc-cmd-disabled + 理由表示、使える command が先頭', () => {
    registerCommand(
      { id: 'z.blocked', titleJa: 'あブロック', titleEn: 'Blocked', category: 'View' },
      () => undefined,
      () => 'タブ機能が OFF です',
    );
    registerCommand(
      { id: 'a.ok', titleJa: 'い実行可', titleEn: 'Runnable', category: 'View' },
      () => undefined,
    );
    const cleanup = openCommandPalette(document.body);
    const items = [...document.querySelectorAll<HTMLElement>('[data-pkc-cmd-id]')];
    expect(items.length).toBe(2);
    // 使える command が先(登録順・rank 順に関係なく可用性で partition)
    expect(items[0]!.getAttribute('data-pkc-cmd-id')).toBe('a.ok');
    expect(items[0]!.getAttribute('data-pkc-cmd-disabled')).toBeNull();
    expect(items[1]!.getAttribute('data-pkc-cmd-id')).toBe('z.blocked');
    expect(items[1]!.getAttribute('data-pkc-cmd-disabled')).toBe('true');
    expect(items[1]!.querySelector('.pkc-command-palette-item-reason')!.textContent)
      .toContain('タブ機能が OFF');
    cleanup();
  });

  it('使えない command を click すると toast 案内(実行はされない)', () => {
    let ran = 0;
    registerCommand(
      { id: 'z.blocked', titleJa: 'ブロック', titleEn: 'Blocked', category: 'View' },
      () => { ran++; },
      () => '編集モード中のみ使えます',
    );
    openCommandPalette(document.body);
    (document.querySelector('[data-pkc-cmd-id="z.blocked"]') as HTMLElement).click();
    expect(ran).toBe(0);
    expect(toastText()).toContain('編集モード中のみ');
  });
});

describe('builtin commands の既定状態での可用性(#951 の実態)', () => {
  function boot() {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    registerBuiltinCommands(d);
    return d;
  }

  it('tabs OFF: tab 系 command は「⚙ Settings の Tabs」への導線つき理由を返す', () => {
    boot();
    for (const id of ['tab.next', 'tab.close-active', 'view-tab.open.calendar', 'tab.toggle-pin-active']) {
      const reason = getCommandAvailability(id);
      expect(reason, id).toContain('Tabs');
    }
  });

  it('tabs ON: tab 系 command は使える(availability null)', () => {
    setContainerFlagSource({ 'shell.tabs_enabled': true });
    boot();
    expect(getCommandAvailability('tab.next')).toBeNull();
    expect(getCommandAvailability('view-tab.open.calendar')).toBeNull();
  });

  it('非編集中: editor 系 command は編集開始への導線つき理由を返す', () => {
    boot();
    expect(getCommandAvailability('editor.format.bold')).toContain('編集モード');
    expect(getCommandAvailability('editor.insert.code-block')).toContain('編集モード');
  });

  it('編集中(body textarea あり): editor 系 command は使える', () => {
    boot();
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    document.body.appendChild(ta);
    expect(getCommandAvailability('editor.format.bold')).toBeNull();
  });

  it('未選択: entry.duplicate は選択を促す理由を返し、選択後は使える', () => {
    const d = boot();
    expect(getCommandAvailability('entry.duplicate')).toContain('選択');
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    expect(getCommandAvailability('entry.duplicate')).toBeNull();
  });

  it('view.* / theme.* / entry.create.* は無条件で使える(availability なし)', () => {
    boot();
    for (const id of ['view.calendar', 'theme.dark', 'entry.create.text', 'app.shortcuts']) {
      expect(getCommandAvailability(id), id).toBeNull();
    }
  });
});
