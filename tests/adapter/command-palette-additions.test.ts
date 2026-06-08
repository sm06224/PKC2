/**
 * @vitest-environment happy-dom
 *
 * pgc-188 wave-α' #11(v3 統合 master G8 visual theme + G1 entry UX):
 * Command Palette additions ── `theme.cycle`(light→dark→auto rotate)+
 * `view.clear-filters`(reset all active filters)+ `entry.duplicate`
 * (CREATE_ENTRY with archetype + body + "Copy of X" title)。
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
import type { Container } from '@core/model/container';
import type { Entry } from '@core/model/record';

const TS = '2026-05-24T00:00:00Z';

function mkEntry(opts: Partial<Entry> & { lid: string }): Entry {
  return {
    lid: opts.lid,
    title: opts.title ?? 'Test',
    body: opts.body ?? 'body',
    archetype: opts.archetype ?? 'text',
    created_at: TS,
    updated_at: TS,
    ...(opts.tags ? { tags: opts.tags } : {}),
  };
}

function mkContainer(entries: Entry[]): Container {
  return {
    meta: { container_id: 'c1', title: 'C', created_at: TS, updated_at: TS, schema_version: 1 },
    entries,
    relations: [],
    revisions: [],
    assets: {},
  };
}

describe('pgc-188 Command Palette additions', () => {
  beforeEach(() => {
    __resetRegistry();
    __resetUrlCache();
    resetCommandRegistry();
  });

  afterEach(() => {
    resetCommandRegistry();
  });

  function boot(): ReturnType<typeof createDispatcher> {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: mkContainer([
      mkEntry({ lid: 'e1', title: 'Original', body: 'original body', archetype: 'text', tags: ['rust'] }),
    ]) });
    registerBuiltinCommands(d);
    return d;
  }

  it('case 1: theme.cycle / view.clear-filters / entry.duplicate 3 command が登録される', () => {
    boot();
    const metas = getCommandMetas();
    expect(metas.find((m) => m.id === 'theme.cycle')).not.toBeUndefined();
    expect(metas.find((m) => m.id === 'view.clear-filters')).not.toBeUndefined();
    expect(metas.find((m) => m.id === 'entry.duplicate')).not.toBeUndefined();
  });

  it('case 2: theme.cycle:undefined → light(initial auto)、light → dark, dark → auto, auto → light', () => {
    const d = boot();
    // 初期は settings 未設定 → currentSettings 経路で default = 'auto'
    executeCommand('theme.cycle');
    // auto → light(1 回目 cycle)
    expect(d.getState().settings?.theme.mode).toBe('light');
    executeCommand('theme.cycle');
    expect(d.getState().settings?.theme.mode).toBe('dark');
    executeCommand('theme.cycle');
    expect(d.getState().settings?.theme.mode).toBe('auto');
    executeCommand('theme.cycle');
    expect(d.getState().settings?.theme.mode).toBe('light');
  });

  it('case 3: view.clear-filters で tagFilter が空になる', () => {
    const d = boot();
    // tagFilter に rust を入れる
    d.dispatch({ type: 'TOGGLE_TAG_FILTER', tag: 'rust' });
    expect(d.getState().tagFilter?.has('rust')).toBe(true);
    executeCommand('view.clear-filters');
    expect(d.getState().tagFilter?.size ?? 0).toBe(0);
  });

  it('case 4: entry.duplicate で 新 entry が作られ、title が "Copy of <orig>"', () => {
    const d = boot();
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    expect(d.getState().container?.entries.length).toBe(1);
    executeCommand('entry.duplicate');
    const entries = d.getState().container?.entries ?? [];
    expect(entries.length).toBe(2);
    const copy = entries.find((e) => e.title === 'Copy of Original');
    expect(copy).not.toBeUndefined();
    expect(copy?.archetype).toBe('text');
    expect(copy?.body).toBe('original body');
  });

  it('case 5: entry.duplicate で selectedLid が無いと no-op', () => {
    const d = boot();
    // SELECT_ENTRY しない
    expect(d.getState().container?.entries.length).toBe(1);
    executeCommand('entry.duplicate');
    expect(d.getState().container?.entries.length).toBe(1); // 増えない
  });

  it('case 6: entry.duplicate で空 title は "Copy of (untitled)"', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: mkContainer([
      mkEntry({ lid: 'e1', title: '', body: 'b', archetype: 'text' }),
    ]) });
    registerBuiltinCommands(d);
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    executeCommand('entry.duplicate');
    const entries = d.getState().container?.entries ?? [];
    expect(entries.length).toBe(2);
    const copy = entries.find((e) => e.title === 'Copy of (untitled)');
    expect(copy).not.toBeUndefined();
  });

  it('case 7: entry.duplicate は archetype を継承(todo / textlog / form 等)', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: mkContainer([
      mkEntry({ lid: 'e1', title: 'Todo task', body: '{"status":"open","description":"foo"}', archetype: 'todo' }),
    ]) });
    registerBuiltinCommands(d);
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    executeCommand('entry.duplicate');
    const entries = d.getState().container?.entries ?? [];
    const copy = entries.find((e) => e.title === 'Copy of Todo task');
    expect(copy?.archetype).toBe('todo');
    expect(copy?.body).toBe('{"status":"open","description":"foo"}');
  });

  it('case 8: theme.cycle / view.clear-filters の category 確認', () => {
    boot();
    const metas = getCommandMetas();
    const cycle = metas.find((m) => m.id === 'theme.cycle');
    const clear = metas.find((m) => m.id === 'view.clear-filters');
    const dup = metas.find((m) => m.id === 'entry.duplicate');
    expect(cycle?.category).toBe('Theme');
    expect(clear?.category).toBe('View');
    expect(dup?.category).toBe('Entry');
  });
});
