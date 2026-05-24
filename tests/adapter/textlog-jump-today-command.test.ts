/**
 * @vitest-environment happy-dom
 *
 * pgc-190 wave-α' #13(handoff §3.4 wave-δ phase 2 textlog):command
 * palette に `textlog.jump-today` を追加。現 entry が textlog で今日の
 * day section が DOM に存在すれば scrollIntoView、無ければ latest day に
 * fallback。今日 + latest 両方 無ければ silent no-op。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { __resetRegistry, __resetUrlCache } from '@adapter/flags';
import {
  resetCommandRegistry,
  executeCommand,
  getCommandMetas,
} from '@adapter/ui/command-palette';
import { registerBuiltinCommands } from '@adapter/ui/command-palette-builtins';
import { createDispatcher } from '@adapter/state/dispatcher';

describe('pgc-190 textlog.jump-today command', () => {
  beforeEach(() => {
    __resetRegistry();
    __resetUrlCache();
    resetCommandRegistry();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  function boot(): ReturnType<typeof createDispatcher> {
    const d = createDispatcher();
    registerBuiltinCommands(d);
    return d;
  }

  function todayId(): string {
    const now = new Date();
    return `day-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  it('case 1: command が登録される(category=View)', () => {
    boot();
    const meta = getCommandMetas().find((m) => m.id === 'textlog.jump-today');
    expect(meta).not.toBeUndefined();
    expect(meta?.category).toBe('View');
  });

  it('case 2: 今日の day section が DOM にあれば scrollIntoView({behavior:smooth})', () => {
    boot();
    const center = document.createElement('div');
    center.setAttribute('data-pkc-region', 'center');
    const section = document.createElement('section');
    section.className = 'pkc-textlog-day';
    section.id = todayId();
    center.appendChild(section);
    document.body.appendChild(center);
    let scrollCalled = false;
    let scrollOpts: ScrollIntoViewOptions | undefined;
    section.scrollIntoView = (opts) => {
      scrollCalled = true;
      scrollOpts = typeof opts === 'object' ? opts : undefined;
    };
    executeCommand('textlog.jump-today');
    expect(scrollCalled).toBe(true);
    expect(scrollOpts?.behavior).toBe('smooth');
  });

  it('case 3: 今日 section 無ければ latest(最初の `.pkc-textlog-day`)に fallback', () => {
    boot();
    const center = document.createElement('div');
    center.setAttribute('data-pkc-region', 'center');
    const oldest = document.createElement('section');
    oldest.className = 'pkc-textlog-day';
    oldest.id = 'day-2026-04-10';
    const middle = document.createElement('section');
    middle.className = 'pkc-textlog-day';
    middle.id = 'day-2026-04-15';
    // textlog は desc order なので「最新」 が DOM の最初
    center.appendChild(middle);
    center.appendChild(oldest);
    document.body.appendChild(center);
    let scrollEl: HTMLElement | null = null;
    middle.scrollIntoView = () => { scrollEl = middle; };
    oldest.scrollIntoView = () => { scrollEl = oldest; };
    executeCommand('textlog.jump-today');
    // 最初の section = middle に jump
    expect(scrollEl).toBe(middle);
  });

  it('case 4: textlog day section が 0 件なら silent no-op(throw しない)', () => {
    boot();
    const center = document.createElement('div');
    center.setAttribute('data-pkc-region', 'center');
    document.body.appendChild(center);
    // throw しないことを verify
    expect(() => executeCommand('textlog.jump-today')).not.toThrow();
  });

  it('case 5: center pane が無くても document 全体から検索', () => {
    boot();
    // center pane 無し
    const section = document.createElement('section');
    section.className = 'pkc-textlog-day';
    section.id = todayId();
    document.body.appendChild(section);
    let scrollCalled = false;
    section.scrollIntoView = () => { scrollCalled = true; };
    executeCommand('textlog.jump-today');
    expect(scrollCalled).toBe(true);
  });

  it('case 6: 今日 section が無く、後日 day もあれば latest を jump(完全 fallback chain)', () => {
    boot();
    const section = document.createElement('section');
    section.className = 'pkc-textlog-day';
    section.id = 'day-2099-12-31'; // 未来の日付(今日とは一致しない)
    document.body.appendChild(section);
    let scrollCalled = false;
    section.scrollIntoView = () => { scrollCalled = true; };
    executeCommand('textlog.jump-today');
    expect(scrollCalled).toBe(true); // fallback path で発火
  });
});
