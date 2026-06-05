/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  readWindowLayout,
  upsertWindowLayout,
  removeWindowLayout,
  clearWindowLayout,
  type WindowLayoutEntry,
} from '@adapter/platform/window-layout-store';

/**
 * γ-A5-3:window layout 永続化ストア(multi-window-vscode-extension-spec §4)。
 * `localStorage['pkc2.windowLayout']` への read / upsert / remove / clear と、
 * 不正データの除外を検証する。
 */

const LS_KEY = 'pkc2.windowLayout';

function geo(x = 10, y = 20, w = 720, h = 600) {
  return { screenX: x, screenY: y, outerWidth: w, outerHeight: h };
}

function entry(
  role: 'editor' | 'viewer' | 'monitor',
  lid: string,
  monitorKind?: string,
): WindowLayoutEntry {
  return { role, lid, monitorKind, geometry: geo() };
}

beforeEach(() => {
  localStorage.clear();
});

describe('window-layout-store', () => {
  it('未保存なら readWindowLayout は []', () => {
    expect(readWindowLayout()).toEqual([]);
  });

  it('upsert → read で復元できる', () => {
    upsertWindowLayout(entry('editor', 'L1'));
    const layout = readWindowLayout();
    expect(layout).toHaveLength(1);
    expect(layout[0]!.lid).toBe('L1');
    expect(layout[0]!.geometry.outerWidth).toBe(720);
  });

  it('同 (role,lid,monitorKind) の upsert は置換する', () => {
    upsertWindowLayout({ role: 'viewer', lid: 'L2', geometry: geo(0, 0, 100, 100) });
    upsertWindowLayout({ role: 'viewer', lid: 'L2', geometry: geo(0, 0, 999, 888) });
    const layout = readWindowLayout();
    expect(layout).toHaveLength(1);
    expect(layout[0]!.geometry.outerWidth).toBe(999);
  });

  it('role 違いは別 entry として共存する', () => {
    upsertWindowLayout(entry('editor', 'L3'));
    upsertWindowLayout(entry('viewer', 'L3'));
    expect(readWindowLayout()).toHaveLength(2);
  });

  it('monitorKind 違いは別 entry として共存する', () => {
    upsertWindowLayout(entry('monitor', 'L4', 'toc'));
    upsertWindowLayout(entry('monitor', 'L4', 'recent'));
    expect(readWindowLayout()).toHaveLength(2);
  });

  it('remove で該当 entry のみ消える', () => {
    upsertWindowLayout(entry('editor', 'L5'));
    upsertWindowLayout(entry('viewer', 'L5'));
    removeWindowLayout('editor', 'L5');
    const layout = readWindowLayout();
    expect(layout).toHaveLength(1);
    expect(layout[0]!.role).toBe('viewer');
  });

  it('remove は monitorKind まで一致して消す', () => {
    upsertWindowLayout(entry('monitor', 'L6', 'toc'));
    upsertWindowLayout(entry('monitor', 'L6', 'recent'));
    removeWindowLayout('monitor', 'L6', 'toc');
    const layout = readWindowLayout();
    expect(layout).toHaveLength(1);
    expect(layout[0]!.monitorKind).toBe('recent');
  });

  it('clear で全消去する', () => {
    upsertWindowLayout(entry('editor', 'L7'));
    clearWindowLayout();
    expect(readWindowLayout()).toEqual([]);
  });

  it('不正 JSON は [] にフォールバックする', () => {
    localStorage.setItem(LS_KEY, '{not json');
    expect(readWindowLayout()).toEqual([]);
  });

  it('配列でない JSON は [] にフォールバックする', () => {
    localStorage.setItem(LS_KEY, '{"role":"editor"}');
    expect(readWindowLayout()).toEqual([]);
  });

  it('不正な entry は read 時に除外される', () => {
    localStorage.setItem(
      LS_KEY,
      JSON.stringify([
        entry('editor', 'good'),
        { role: 'bogus', lid: 'x', geometry: geo() },
        { role: 'editor', lid: 'no-geo' },
      ]),
    );
    const layout = readWindowLayout();
    expect(layout).toHaveLength(1);
    expect(layout[0]!.lid).toBe('good');
  });

  it('geometry 欠損の entry を upsert しても保存されない', () => {
    upsertWindowLayout({ role: 'editor', lid: 'L8' } as unknown as WindowLayoutEntry);
    expect(readWindowLayout()).toEqual([]);
  });
});
