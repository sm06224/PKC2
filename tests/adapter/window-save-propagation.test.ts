/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { createDispatcher } from '@adapter/state/dispatcher';
import type { Container } from '@core/model/container';
import type { DomainEvent } from '@core/action/domain-event';

/**
 * γ-A5 bugfix(user 報告「別窓で実行した Save がメインに伝搬しない」)。
 *
 * 子 entry-window の Save は `onSave` → `BEGIN_EDIT` + `COMMIT_EDIT` を
 * 経由するが、その entry は `childWindowLids` に載っているため `BEGIN_EDIT`
 * の二重編集防止ガードに弾かれ、後続 `COMMIT_EDIT` が editing phase に
 * 入れず save が失われていた。`BEGIN_EDIT.windowSave` でガードを免除する。
 */

const T = '2026-05-22T00:00:00Z';

function makeContainer(): Container {
  return {
    meta: {
      container_id: 'c',
      title: 'T',
      created_at: T,
      updated_at: T,
      schema_version: 1,
    },
    entries: [
      {
        lid: 'L1',
        title: 'Orig',
        body: 'orig body',
        archetype: 'text',
        created_at: T,
        updated_at: T,
      },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };
}

describe('γ-A5 子 window save 伝搬(windowSave bugfix)', () => {
  it('childWindowLids にある entry の BEGIN_EDIT(windowSave なし)は blocked', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    d.dispatch({ type: 'SYS_SYNC_CHILD_WINDOWS', lids: ['L1'] });
    d.dispatch({ type: 'BEGIN_EDIT', lid: 'L1' });
    expect(d.getState().phase).toBe('ready');
    expect(d.getState().editingLid).toBeNull();
  });

  it('windowSave:true なら childWindowLids ガードを免除し editing に入る', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    d.dispatch({ type: 'SYS_SYNC_CHILD_WINDOWS', lids: ['L1'] });
    d.dispatch({ type: 'BEGIN_EDIT', lid: 'L1', windowSave: true });
    expect(d.getState().phase).toBe('editing');
    expect(d.getState().editingLid).toBe('L1');
  });

  it('子 window save(BEGIN windowSave + COMMIT)が container へ伝搬する', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    d.dispatch({ type: 'SYS_SYNC_CHILD_WINDOWS', lids: ['L1'] });
    d.dispatch({ type: 'BEGIN_EDIT', lid: 'L1', windowSave: true });
    d.dispatch({ type: 'COMMIT_EDIT', lid: 'L1', title: 'New Title', body: 'new body' });
    const entry = d.getState().container!.entries.find((e) => e.lid === 'L1')!;
    expect(entry.title).toBe('New Title');
    expect(entry.body).toBe('new body');
    expect(d.getState().phase).toBe('ready');
  });

  it('windowSave begin は viewMode / selectedLid を変えない(main の表示を奪わない)', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    d.dispatch({ type: 'SET_VIEW_MODE', mode: 'filer' });
    d.dispatch({ type: 'SYS_SYNC_CHILD_WINDOWS', lids: ['L1'] });
    const beforeView = d.getState().viewMode;
    const beforeSel = d.getState().selectedLid;
    d.dispatch({ type: 'BEGIN_EDIT', lid: 'L1', windowSave: true });
    d.dispatch({ type: 'COMMIT_EDIT', lid: 'L1', title: 'X', body: 'Y' });
    expect(d.getState().viewMode).toBe(beforeView);
    expect(d.getState().selectedLid).toBe(beforeSel);
  });

  it('windowSave begin は EDIT_BEGUN を発行しない(main の編集 UI を開かない)', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    d.dispatch({ type: 'SYS_SYNC_CHILD_WINDOWS', lids: ['L1'] });
    const events: DomainEvent[] = [];
    d.onEvent((e) => events.push(e));
    d.dispatch({ type: 'BEGIN_EDIT', lid: 'L1', windowSave: true });
    expect(events.some((e) => e.type === 'EDIT_BEGUN')).toBe(false);
  });

  it('windowSave は childWindowLids に無い entry でも正常に動く', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    d.dispatch({ type: 'BEGIN_EDIT', lid: 'L1', windowSave: true });
    d.dispatch({ type: 'COMMIT_EDIT', lid: 'L1', title: 'Z', body: 'z body' });
    expect(d.getState().container!.entries[0]!.title).toBe('Z');
  });

  it('通常の BEGIN_EDIT は viewMode を detail にする(従来挙動の回帰ガード)', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    d.dispatch({ type: 'SET_VIEW_MODE', mode: 'filer' });
    d.dispatch({ type: 'BEGIN_EDIT', lid: 'L1' });
    expect(d.getState().phase).toBe('editing');
    expect(d.getState().viewMode).toBe('detail');
  });
});
