/**
 * @vitest-environment happy-dom
 *
 * pgc-206 (user 報告 2026-05-24「ファイラ、マルチウィンドウ以前は
 * もっと使い勝手良かったのに」):
 *
 * 旧 multi-window 統一導線では folder archetype を区別せず
 * `openEntryWindow` で popup 化していた。folder の popup は本体が空
 * (子は relation で繋がる)で OS Finder / Explorer 流のユーザー期待と
 * 乖離。本 PR で `handleDblClickAction` の冒頭に folder special-case を
 * 追加:
 *   - viewMode='filer' 時: SELECT_ENTRY のみ(filer 側 click handler の
 *     stayInFiler=true 経路に乗り、自動的に新 scope へ navigate)
 *   - その他 viewMode: SELECT_ENTRY + SET_VIEW_MODE='filer'(folder の
 *     中身を Filer で見せる、OS 流の自然な挙動)
 *   - popup は開かない
 */

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher } from '@adapter/state/dispatcher';
import type { Container } from '@core/model/container';
import type { Entry } from '@core/model/record';

const ROOT = resolve(__dirname, '..', '..');
const actionBinderSrc = readFileSync(
  resolve(ROOT, 'src/adapter/ui/action-binder.ts'),
  'utf8',
);

const TS = '2026-01-01T00:00:00Z';

function makeFolder(lid: string, title = 'Folder'): Entry {
  return {
    lid,
    title,
    body: '',
    archetype: 'folder',
    created_at: TS,
    updated_at: TS,
  };
}

function makeContainer(entries: Entry[]): Container {
  return {
    meta: { container_id: 't', title: 'T', created_at: TS, updated_at: TS, schema_version: 1 },
    entries,
    relations: [],
    revisions: [],
    assets: {},
  };
}

describe('pgc-206 handleDblClickAction folder navigate(popup 開かない)', () => {
  it('case 1: source — handleDblClickAction の冒頭近くに `entry.archetype === folder` early-return branch が存在', () => {
    // structural guard:後続 PR でこの分岐を消した場合に test で検知
    // 非貪欲 2000 char span(コメント含む)
    expect(actionBinderSrc).toMatch(
      /function\s+handleDblClickAction[\s\S]{0,2000}?entry\.archetype\s*===\s*'folder'/,
    );
  });

  it('case 2: source — folder branch が `openEntryWindow` を call せず early return する', () => {
    // folder branch の出現位置 < openEntryWindow 呼出位置 内に return; がある
    const folderBranchIdx = actionBinderSrc.indexOf(
      "if (entry.archetype === 'folder')",
    );
    expect(folderBranchIdx).toBeGreaterThan(-1);
    const openEntryWindowIdx = actionBinderSrc.indexOf(
      'openEntryWindow(',
      folderBranchIdx,
    );
    expect(openEntryWindowIdx).toBeGreaterThan(folderBranchIdx);
    const folderBlock = actionBinderSrc.slice(folderBranchIdx, openEntryWindowIdx);
    expect(folderBlock).toMatch(/return;/);
  });

  it('case 3: source — folder branch で SET_VIEW_MODE filer を viewMode!==filer のときのみ dispatch', () => {
    const folderBranchIdx = actionBinderSrc.indexOf(
      "if (entry.archetype === 'folder')",
    );
    expect(folderBranchIdx).toBeGreaterThan(-1);
    const block = actionBinderSrc.slice(folderBranchIdx, folderBranchIdx + 400);
    expect(block).toMatch(/state\.viewMode\s*!==\s*'filer'/);
    expect(block).toMatch(/SET_VIEW_MODE[\s\S]{0,80}?'filer'/);
  });

  it('case 4: behavior — viewMode=filer の folder dblclick は SELECT_ENTRY のみ(SET_VIEW_MODE 不発火)', () => {
    const folder = makeFolder('f1', 'Sub Folder');
    const container = makeContainer([folder]);
    const dispatcher = createDispatcher();
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });
    dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'filer' });

    // spy after initial setup
    const dispatched: string[] = [];
    const origDispatch = dispatcher.dispatch.bind(dispatcher);
    const spy = vi.fn((a: Parameters<typeof origDispatch>[0]) => {
      dispatched.push(a.type);
      return origDispatch(a);
    });
    (dispatcher as unknown as { dispatch: typeof spy }).dispatch = spy;

    const root = document.createElement('div');
    document.body.appendChild(root);
    bindActions(root, dispatcher);

    const btn = document.createElement('button');
    btn.setAttribute('data-pkc-action', 'select-entry');
    btn.setAttribute('data-pkc-lid', 'f1');
    root.appendChild(btn);
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 2 }));

    // SELECT_ENTRY 発火、SET_VIEW_MODE は viewMode 既に 'filer' なので発火しない
    expect(dispatched).toContain('SELECT_ENTRY');
    expect(dispatched.filter((t) => t === 'SET_VIEW_MODE')).toHaveLength(0);
  });

  it('case 5: behavior — viewMode!==filer の folder dblclick は SELECT_ENTRY + SET_VIEW_MODE filer', () => {
    const folder = makeFolder('f2', 'My Folder');
    const container = makeContainer([folder]);
    const dispatcher = createDispatcher();
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });
    // viewMode は default 'detail'

    const dispatched: { type: string; mode?: string }[] = [];
    const origDispatch = dispatcher.dispatch.bind(dispatcher);
    const spy = vi.fn((a: Parameters<typeof origDispatch>[0]) => {
      const entry: { type: string; mode?: string } = { type: a.type };
      if ('mode' in a && typeof (a as { mode?: unknown }).mode === 'string') {
        entry.mode = (a as { mode: string }).mode;
      }
      dispatched.push(entry);
      return origDispatch(a);
    });
    (dispatcher as unknown as { dispatch: typeof spy }).dispatch = spy;

    const root = document.createElement('div');
    document.body.appendChild(root);
    bindActions(root, dispatcher);

    const btn = document.createElement('button');
    btn.setAttribute('data-pkc-action', 'select-entry');
    btn.setAttribute('data-pkc-lid', 'f2');
    root.appendChild(btn);
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 2 }));

    const types = dispatched.map((d) => d.type);
    expect(types).toContain('SELECT_ENTRY');
    const filerSetMode = dispatched.find(
      (d) => d.type === 'SET_VIEW_MODE' && d.mode === 'filer',
    );
    expect(filerSetMode).toBeDefined();
  });

  it('case 6: source — folder branch は folder archetype のみで text/textlog/todo/attachment を含まない(folder fix scope 限定)', () => {
    const folderBranchIdx = actionBinderSrc.indexOf(
      "if (entry.archetype === 'folder')",
    );
    expect(folderBranchIdx).toBeGreaterThan(-1);
    // folder branch + return; までの 400 char window
    const block = actionBinderSrc.slice(folderBranchIdx, folderBranchIdx + 400);
    expect(block).not.toMatch(/'text'|'textlog'|'todo'|'attachment'/);
  });
});
