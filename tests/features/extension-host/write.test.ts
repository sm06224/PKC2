/**
 * T2 write op 検証(#806 一括実装 6/6、G2)。
 * well-formed + 参照存在を検証、1 件でも NG なら全体拒否。
 */
import { describe, it, expect } from 'vitest';
import { validateWriteOps } from '@features/extension-host/write';
import type { Container } from '@core/model/container';

const T = '2026-06-12T00:00:00Z';
const container: Container = {
  meta: { container_id: 'w', title: 'W', created_at: T, updated_at: T, schema_version: 1 },
  entries: [
    { lid: 'e1', title: 'A', body: 'a', archetype: 'text', created_at: T, updated_at: T },
    { lid: 'e2', title: 'B', body: 'b', archetype: 'text', created_at: T, updated_at: T },
    { lid: 'f1', title: 'F', body: '', archetype: 'folder', created_at: T, updated_at: T },
    { lid: 't1', title: 'Todo', body: '{"status":"open","description":"d"}', archetype: 'todo', created_at: T, updated_at: T },
  ],
  relations: [],
  revisions: [],
  assets: {},
};

describe('validateWriteOps', () => {
  it('update-body / move / relate を正規化', () => {
    const r = validateWriteOps(container, [
      { op: 'update-body', lid: 'e1', body: 'new' },
      { op: 'move', lid: 'e2', folderLid: 'f1' },
      { op: 'relate', from: 'e1', to: 'e2' },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.ops).toHaveLength(3);
  });

  it('空配列 / 非配列は拒否', () => {
    expect(validateWriteOps(container, []).ok).toBe(false);
    expect(validateWriteOps(container, 'x').ok).toBe(false);
  });

  it('未知 lid を参照する op は拒否', () => {
    expect(validateWriteOps(container, [{ op: 'update-body', lid: 'nope', body: 'x' }]).ok).toBe(false);
  });

  it('move 先が folder でないと拒否', () => {
    expect(validateWriteOps(container, [{ op: 'move', lid: 'e1', folderLid: 'e2' }]).ok).toBe(false);
  });

  it('relate の両端は存在し異なること', () => {
    expect(validateWriteOps(container, [{ op: 'relate', from: 'e1', to: 'e1' }]).ok).toBe(false);
    expect(validateWriteOps(container, [{ op: 'relate', from: 'e1', to: 'nope' }]).ok).toBe(false);
  });

  it('未知 op / 型不正は拒否', () => {
    expect(validateWriteOps(container, [{ op: 'delete', lid: 'e1' }]).ok).toBe(false);
    expect(validateWriteOps(container, [{ op: 'update-body', lid: 'e1', body: 5 }]).ok).toBe(false);
  });

  it('set-todo-status を正規化(#830 R2)', () => {
    const r = validateWriteOps(container, [{ op: 'set-todo-status', lid: 't1', status: 'done' }]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.ops).toEqual([{ op: 'set-todo-status', lid: 't1', status: 'done' }]);
  });

  it('set-todo-status は todo でない / 未知 status / 未知 lid を拒否(#830 R2)', () => {
    expect(validateWriteOps(container, [{ op: 'set-todo-status', lid: 'e1', status: 'done' }]).ok).toBe(false); // text
    expect(validateWriteOps(container, [{ op: 'set-todo-status', lid: 't1', status: 'archived' }]).ok).toBe(false);
    expect(validateWriteOps(container, [{ op: 'set-todo-status', lid: 'nope', status: 'open' }]).ok).toBe(false);
  });

  it('rename を正規化、空 title / 未知 lid / 型不正は拒否(#830 R3)', () => {
    const r = validateWriteOps(container, [{ op: 'rename', lid: 'e1', title: 'New Name' }]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.ops).toEqual([{ op: 'rename', lid: 'e1', title: 'New Name' }]);
    expect(validateWriteOps(container, [{ op: 'rename', lid: 'e1', title: '   ' }]).ok).toBe(false); // 空(trim 後)
    expect(validateWriteOps(container, [{ op: 'rename', lid: 'nope', title: 'x' }]).ok).toBe(false);
    expect(validateWriteOps(container, [{ op: 'rename', lid: 'e1', title: 5 }]).ok).toBe(false);
  });

  it('unfile を正規化、未知 lid は拒否(#830 R7)', () => {
    const r = validateWriteOps(container, [{ op: 'unfile', lid: 'e1' }]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.ops).toEqual([{ op: 'unfile', lid: 'e1' }]);
    expect(validateWriteOps(container, [{ op: 'unfile', lid: 'nope' }]).ok).toBe(false);
  });

  it('1 件でも NG なら全体拒否(部分適用しない)', () => {
    const r = validateWriteOps(container, [
      { op: 'update-body', lid: 'e1', body: 'ok' },
      { op: 'move', lid: 'e2', folderLid: 'e1' }, // NG: e1 は folder でない
    ]);
    expect(r.ok).toBe(false);
  });
});
