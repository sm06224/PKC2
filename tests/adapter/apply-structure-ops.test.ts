/**
 * @vitest-environment happy-dom
 *
 * #905 — APPLY_STRUCTURE_OPS reducer の end-to-end test。
 * dispatch → container の relations / entries が実際に変わる(consumer 観測点)
 * ことと、防御的 skip(循環 / 不在 / readonly)を確認する。
 */
import { describe, it, expect } from 'vitest';
import { createDispatcher } from '@adapter/state/dispatcher';
import type { Container } from '@core/model/container';
import type { DomainEvent } from '@core/action/domain-event';

const T = '2026-07-12T00:00:00Z';

function makeContainer(): Container {
  return {
    meta: { container_id: 'c-905', title: 't', created_at: T, updated_at: T, schema_version: 1 },
    entries: [
      { lid: 'f1', title: 'Projects', body: '', archetype: 'folder', created_at: T, updated_at: T },
      { lid: 'f2', title: 'Sub', body: '', archetype: 'folder', created_at: T, updated_at: T },
      { lid: 'e1', title: 'Note A', body: 'x', archetype: 'text', created_at: T, updated_at: T },
      { lid: 'e2', title: 'Loose', body: 'y', archetype: 'text', created_at: T, updated_at: T },
    ],
    relations: [
      { id: 'r1', from: 'f1', to: 'f2', kind: 'structural', created_at: T, updated_at: T },
      { id: 'r2', from: 'f2', to: 'e1', kind: 'structural', created_at: T, updated_at: T },
    ],
    revisions: [],
    assets: {},
  };
}

function boot() {
  const dispatcher = createDispatcher();
  const events: DomainEvent[] = [];
  dispatcher.onEvent((e) => events.push(e));
  dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
  return { dispatcher, events };
}

function structuralParentOf(c: Container, lid: string): string | null {
  const r = c.relations.find((x) => x.kind === 'structural' && x.to === lid);
  return r ? r.from : null;
}

describe('APPLY_STRUCTURE_OPS reducer(#905)', () => {
  it('mv / rename / mkdir を一括適用し STRUCTURE_OPS_APPLIED を発火', () => {
    const { dispatcher, events } = boot();
    dispatcher.dispatch({
      type: 'APPLY_STRUCTURE_OPS',
      ops: [
        { op: 'mv', lid: 'e2', parent: 'f2' },        // root → Sub
        { op: 'mv', lid: 'e1', parent: null },        // Sub → root
        { op: 'rename', lid: 'e2', title: 'Renamed' },
        { op: 'mkdir', title: 'Archive', parent: 'f1' },
      ],
    });
    const c = dispatcher.getState().container!;
    expect(structuralParentOf(c, 'e2')).toBe('f2');
    expect(structuralParentOf(c, 'e1')).toBeNull();
    expect(c.entries.find((e) => e.lid === 'e2')!.title).toBe('Renamed');
    const archive = c.entries.find((e) => e.title === 'Archive');
    expect(archive?.archetype).toBe('folder');
    expect(structuralParentOf(c, archive!.lid)).toBe('f1');
    const done = events.find((e) => e.type === 'STRUCTURE_OPS_APPLIED');
    expect(done).toEqual({ type: 'STRUCTURE_OPS_APPLIED', applied: 4 });
  });

  it('防御的 skip:循環 mv / 不在 lid / 非 folder 親は適用されない', () => {
    const { dispatcher, events } = boot();
    dispatcher.dispatch({
      type: 'APPLY_STRUCTURE_OPS',
      ops: [
        { op: 'mv', lid: 'f1', parent: 'f2' },     // f2 は f1 の子孫 → 循環 skip
        { op: 'mv', lid: 'nope', parent: 'f1' },   // 不在 skip
        { op: 'mv', lid: 'e2', parent: 'e1' },     // 非 folder 親 skip
        { op: 'mv', lid: 'e2', parent: 'f1' },     // これだけ適用
      ],
    });
    const c = dispatcher.getState().container!;
    expect(structuralParentOf(c, 'f1')).toBeNull();      // 循環は不成立のまま
    expect(structuralParentOf(c, 'e2')).toBe('f1');
    const done = events.find((e) => e.type === 'STRUCTURE_OPS_APPLIED');
    expect(done).toEqual({ type: 'STRUCTURE_OPS_APPLIED', applied: 1 });
  });

  it('v2 alias:mkdir as @x で作った新規フォルダへ後続 mv / 入れ子 mkdir できる', () => {
    const { dispatcher, events } = boot();
    dispatcher.dispatch({
      type: 'APPLY_STRUCTURE_OPS',
      ops: [
        { op: 'mkdir', title: 'Archive', parent: null, alias: '@arc' },
        { op: 'mkdir', title: '2025', parent: '@arc', alias: '@y25' }, // 入れ子 alias
        { op: 'mv', lid: 'e2', parent: '@y25' },
      ],
    });
    const c = dispatcher.getState().container!;
    const arc = c.entries.find((e) => e.title === 'Archive')!;
    const y25 = c.entries.find((e) => e.title === '2025')!;
    expect(arc.archetype).toBe('folder');
    expect(structuralParentOf(c, y25.lid)).toBe(arc.lid);
    expect(structuralParentOf(c, 'e2')).toBe(y25.lid);
    const done = events.find((e) => e.type === 'STRUCTURE_OPS_APPLIED');
    expect(done).toEqual({ type: 'STRUCTURE_OPS_APPLIED', applied: 3 });
  });

  it('v2 alias:未宣言 alias を親にした op は防御的に skip', () => {
    const { dispatcher, events } = boot();
    dispatcher.dispatch({
      type: 'APPLY_STRUCTURE_OPS',
      ops: [
        { op: 'mv', lid: 'e2', parent: '@nope' },              // 未宣言 → skip
        { op: 'mkdir', title: 'X', parent: '@nope' },          // 未宣言 → skip
        { op: 'mv', lid: 'e2', parent: 'f1' },                 // これだけ適用
      ],
    });
    const c = dispatcher.getState().container!;
    expect(c.entries.find((e) => e.title === 'X')).toBeUndefined();
    expect(structuralParentOf(c, 'e2')).toBe('f1');
    const done = events.find((e) => e.type === 'STRUCTURE_OPS_APPLIED');
    expect(done).toEqual({ type: 'STRUCTURE_OPS_APPLIED', applied: 1 });
  });

  it('v2 alias:逐次適用で生じる動的循環も reducer が skip(自分の配下の新規フォルダへの mv)', () => {
    const { dispatcher } = boot();
    dispatcher.dispatch({
      type: 'APPLY_STRUCTURE_OPS',
      ops: [
        { op: 'mkdir', title: 'Trap', parent: 'f2', alias: '@trap' }, // f1 > f2 > Trap
        { op: 'mv', lid: 'f1', parent: '@trap' },                     // f1 → 自分の子孫 = 循環 skip
      ],
    });
    const c = dispatcher.getState().container!;
    expect(structuralParentOf(c, 'f1')).toBeNull();
    const trap = c.entries.find((e) => e.title === 'Trap')!;
    expect(structuralParentOf(c, trap.lid)).toBe('f2');
  });

  it('readonly では blocked(container 不変)', () => {
    const dispatcher = createDispatcher();
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer(), readonly: true });
    const before = dispatcher.getState().container;
    dispatcher.dispatch({ type: 'APPLY_STRUCTURE_OPS', ops: [{ op: 'mv', lid: 'e2', parent: 'f1' }] });
    expect(dispatcher.getState().container).toBe(before);
  });
});
