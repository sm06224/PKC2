/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, __resetEntryRowMemoForTest, __resetIndexMemoForTest } from '@adapter/ui/renderer';
import { __resetFilterIndexCacheForTest } from '@adapter/ui/filter-cache';
import { __resetSubLocationHitsCacheForTest } from '@features/search/sub-location-search';
import { createInitialState, reduce } from '@adapter/state/app-state';
import { setContainerFlagSource } from '@adapter/flags';
import type { AppState } from '@adapter/state/app-state';
import type { Container } from '@core/model/container';
import type { Entry } from '@core/model/record';
import type { Relation } from '@core/model/relation';

/**
 * #938 R9 — tree 行 memo + 検索 sub-location 展開の可視件数限定。
 *
 * (a) tree 行 memo: filter 無しの full render は tree mode で全行を
 *     毎回 rebuild していた(c-5000 で 60-67ms)。flat 行の PR #179
 *     memo と同 doctrine で、entry ref + 装飾パラメータ(depth /
 *     collapsed / childCount / moveButtons)キーの memo を追加。
 *   - 同一 container の再 render → 行 node の identity 維持
 *   - collapse toggle → 当該 folder 行だけ rebuild、他行は reuse
 *   - container 更新(entry 編集)→ 全 invalidate
 *   - 選択 highlight は post-pass で memo hit 行にも反映
 *
 * (b) subloc cap: `search.subloc_scan_max_rows`(既定 60)で
 *     sub-location 展開を sidebar 先頭 N 行に限定。cap 以降の entry は
 *     行自体は表示され、展開だけ省略される。
 */

const T = '2026-07-01T00:00:00.000Z';

function entry(lid: string, title: string, archetype: Entry['archetype'], body = 'x'): Entry {
  return { lid, title, archetype, body, created_at: T, updated_at: T };
}

function rel(id: string, from: string, to: string): Relation {
  return { id, kind: 'structural', from, to, created_at: T, updated_at: T };
}

/** folder(2 children)+ root text ×2 の小さな tree。 */
function treeFixture(): Container {
  return {
    meta: { container_id: 'tree', title: 't', created_at: T, updated_at: T, schema_version: 1 },
    entries: [
      entry('f1', 'Folder', 'folder'),
      entry('c1', 'Child 1', 'text'),
      entry('c2', 'Child 2', 'text'),
      entry('r1', 'Root 1', 'text'),
      entry('r2', 'Root 2', 'text'),
    ],
    relations: [rel('rl1', 'f1', 'c1'), rel('rl2', 'f1', 'c2')],
    revisions: [],
    assets: {},
  };
}

function readyState(container: Container): AppState {
  return reduce(createInitialState(), { type: 'SYS_INIT_COMPLETE', container }).state;
}

function rowOf(root: HTMLElement, lid: string): HTMLElement | null {
  return root.querySelector<HTMLElement>(
    `[data-pkc-region="entry-list"] li.pkc-entry-item[data-pkc-lid="${lid}"]`,
  );
}

let root: HTMLElement;

beforeEach(() => {
  // pgc-37: sidebar.mode 既定が filer のため、tree 構造を検証する本 suite
  // は tree mode に固定する。
  setContainerFlagSource({ 'sidebar.mode': 'tree' });
  __resetEntryRowMemoForTest();
  __resetIndexMemoForTest();
  __resetFilterIndexCacheForTest();
  __resetSubLocationHitsCacheForTest();
  root = document.createElement('div');
  root.id = 'pkc-root';
  document.body.appendChild(root);
  return () => {
    root.remove();
    setContainerFlagSource({});
    __resetEntryRowMemoForTest();
    __resetIndexMemoForTest();
    __resetFilterIndexCacheForTest();
    __resetSubLocationHitsCacheForTest();
  };
});

describe('tree 行 memo(#938 R9)', () => {
  it('同一 container の再 render で行 node の identity が維持される', () => {
    const state = readyState(treeFixture());
    render(state, root, null);
    const before = ['f1', 'c1', 'r1'].map((lid) => rowOf(root, lid));
    expect(before.every(Boolean)).toBe(true);

    render(state, root, null); // full render 再実行(prev=null = 全 rebuild 経路)
    for (let i = 0; i < before.length; i++) {
      expect(rowOf(root, ['f1', 'c1', 'r1'][i]!)).toBe(before[i]);
    }
  });

  it('collapse toggle → folder 行だけ rebuild、兄弟行は reuse', () => {
    const s1 = readyState(treeFixture());
    render(s1, root, null);
    const folderBefore = rowOf(root, 'f1');
    const rootRowBefore = rowOf(root, 'r1');
    expect(folderBefore!.querySelector('.pkc-folder-toggle')!.textContent).toBe('▼');

    const s2 = reduce(s1, { type: 'TOGGLE_FOLDER_COLLAPSE', lid: 'f1' }).state;
    render(s2, root, null);
    const folderAfter = rowOf(root, 'f1');
    // folder 行は collapsed param が変わったので rebuild(別 node)
    expect(folderAfter).not.toBe(folderBefore);
    expect(folderAfter!.getAttribute('data-pkc-folder-collapsed')).toBe('true');
    expect(folderAfter!.querySelector('.pkc-folder-toggle')!.textContent).toBe('▶');
    // collapsed folder の子は描画されない
    expect(rowOf(root, 'c1')).toBeNull();
    // 兄弟の root 行は memo reuse(同 node)
    expect(rowOf(root, 'r1')).toBe(rootRowBefore);
  });

  it('container 更新(entry 編集)で全行 invalidate される', () => {
    const s1 = readyState(treeFixture());
    render(s1, root, null);
    const before = rowOf(root, 'r1');

    const c2: Container = {
      ...s1.container!,
      entries: s1.container!.entries.map((e) =>
        e.lid === 'r2' ? { ...e, title: 'Root 2 edited' } : e,
      ),
    };
    const s2 = readyState(c2);
    render(s2, root, null);
    expect(rowOf(root, 'r1')).not.toBe(before);
    expect(rowOf(root, 'r2')!.textContent).toContain('Root 2 edited');
  });

  it('別ウィンドウ marker(γ-A3)は memo 越しに付与・除去される', () => {
    const s1 = readyState(treeFixture());
    render(s1, root, null);
    const s2 = reduce(s1, { type: 'SYS_SYNC_CHILD_WINDOWS', lids: ['r1'] }).state;
    render(s2, root, null);
    expect(rowOf(root, 'r1')!.getAttribute('data-pkc-in-window')).toBe('true');
    // window close → marker と title が確実に剥がれる(memo 化以前は
    // 「毎 render 全行 rebuild」に依存していた挙動の明示化)
    const s3 = reduce(s2, { type: 'SYS_SYNC_CHILD_WINDOWS', lids: [] }).state;
    render(s3, root, null);
    const row = rowOf(root, 'r1')!;
    expect(row.getAttribute('data-pkc-in-window')).toBeNull();
    expect(row.getAttribute('title')).toBeNull();
  });

  it('選択変更は memo hit 行にも post-pass で反映される', () => {
    const s1 = readyState(treeFixture());
    render(s1, root, null);
    const s2 = reduce(s1, { type: 'SELECT_ENTRY', lid: 'r1' }).state;
    render(s2, root, null);
    expect(rowOf(root, 'r1')!.getAttribute('data-pkc-selected')).toBe('true');
    const s3 = reduce(s2, { type: 'SELECT_ENTRY', lid: 'r2' }).state;
    render(s3, root, null);
    expect(rowOf(root, 'r1')!.getAttribute('data-pkc-selected')).toBeNull();
    expect(rowOf(root, 'r2')!.getAttribute('data-pkc-selected')).toBe('true');
  });
});

describe('sub-location 展開の可視件数限定(#938 R9)', () => {
  function searchFixture(n: number): Container {
    const entries: Entry[] = [];
    for (let i = 0; i < n; i++) {
      entries.push(
        entry(`t${i}`, `Doc ${i}`, 'text', `# Heading ${i}\n\nneedle text here`),
      );
    }
    return {
      meta: { container_id: 'subloc', title: 't', created_at: T, updated_at: T, schema_version: 1 },
      entries,
      relations: [],
      revisions: [],
      assets: {},
    };
  }

  it('cap 以内: 全 entry に subloc 行が展開される', () => {
    const s = reduce(readyState(searchFixture(3)), { type: 'SET_SEARCH_QUERY', query: 'needle' }).state;
    render(s, root, null);
    expect(root.querySelectorAll('.pkc-entry-subloc').length).toBe(3);
  });

  it('cap 超過: 先頭 N 行のみ展開、以降は entry 行だけ表示', () => {
    setContainerFlagSource({ 'sidebar.mode': 'tree', 'search.subloc_scan_max_rows': 2 });
    const s = reduce(readyState(searchFixture(5)), { type: 'SET_SEARCH_QUERY', query: 'needle' }).state;
    render(s, root, null);
    // subloc 展開は先頭 2 entry のみ
    const sublocs = [...root.querySelectorAll<HTMLElement>('.pkc-entry-subloc')];
    expect(sublocs.length).toBe(2);
    expect(sublocs.map((el) => el.getAttribute('data-pkc-lid'))).toEqual(['t0', 't1']);
    // entry 行自体は 5 件すべて表示されている
    expect(
      root.querySelectorAll('[data-pkc-region="entry-list"] li.pkc-entry-item').length,
    ).toBe(5);
  });
});
