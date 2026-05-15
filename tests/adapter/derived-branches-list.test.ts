/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDispatcher } from '@adapter/state/dispatcher';
import { bindActions } from '@adapter/ui/action-binder';
import { render } from '@adapter/ui/renderer';
import type { Container } from '@core/model/container';

/**
 * PR-V6(2026-05-14、PR #432 stack v2.3.x、C-1 v1.x §9.2 additive):
 * Derived branches list — 元 entry の meta pane で、その entry から派生した
 * branch entries を provenance を逆引きして表示する v1.x 追加機能。
 *
 * v1 ではすでに Branch / Restore picker は完成しており(spec §7)、ここでは
 * 派生 branch を元 entry 側からも辿れる UI(逆方向 navigation)を加える。
 *
 * Pinned contract:
 *   - 元 entry の meta pane に `data-pkc-region="derived-branches"` が出る
 *     (派生 branch が 1 件以上ある場合のみ)
 *   - 各行に branch entry の title が link として表示、click で SELECT_ENTRY
 *   - `metadata.branched_at` の timestamp と `metadata.source_revision_id` の
 *     短縮表示も出す(両方 optional)
 *   - 派生 branch が 0 件の entry には section 自体出ない
 *   - `branch_source` または `conversion_kind` が `'revision'` / `'revision-branch'`
 *     のいずれかでマッチ(spec §4.1 で両 key 並走)
 */

function makeContainer(): Container {
  return {
    meta: {
      container_id: 'derived-branches-test',
      title: 'Test',
      created_at: '2026-05-14T00:00:00Z',
      updated_at: '2026-05-14T00:00:00Z',
      schema_version: 1,
    },
    entries: [
      {
        lid: 'source',
        title: 'Source Entry',
        body: 'source body',
        archetype: 'text',
        created_at: '2026-05-14T00:00:00Z',
        updated_at: '2026-05-14T01:00:00Z',
      },
      {
        lid: 'branch-1',
        title: 'Source Entry (branch)',
        body: 'branch body 1',
        archetype: 'text',
        created_at: '2026-05-14T00:30:00Z',
        updated_at: '2026-05-14T00:30:00Z',
      },
      {
        lid: 'branch-2',
        title: 'Another branch',
        body: 'branch body 2',
        archetype: 'text',
        created_at: '2026-05-14T00:45:00Z',
        updated_at: '2026-05-14T00:45:00Z',
      },
      {
        lid: 'unrelated',
        title: 'Unrelated Entry',
        body: 'no branches here',
        archetype: 'text',
        created_at: '2026-05-14T00:00:00Z',
        updated_at: '2026-05-14T00:00:00Z',
      },
    ],
    relations: [
      // branch-1 derived from source via revision branch
      {
        id: 'rel-1',
        from: 'branch-1',
        to: 'source',
        kind: 'provenance',
        created_at: '2026-05-14T00:30:00Z',
        updated_at: '2026-05-14T00:30:00Z',
        metadata: {
          branch_source: 'revision',
          source_revision_id: 'rev-abc123def456',
          branched_at: '2026-05-14T00:30:00Z',
        },
      },
      // branch-2 also derived from source, using v1.x conversion_kind syntax
      {
        id: 'rel-2',
        from: 'branch-2',
        to: 'source',
        kind: 'provenance',
        created_at: '2026-05-14T00:45:00Z',
        updated_at: '2026-05-14T00:45:00Z',
        metadata: {
          conversion_kind: 'revision-branch',
          source_revision_id: 'rev-xyz789',
          converted_at: '2026-05-14T00:45:00Z',
        },
      },
      // non-revision provenance — should be ignored
      {
        id: 'rel-3',
        from: 'unrelated',
        to: 'source',
        kind: 'provenance',
        created_at: '2026-05-14T00:00:00Z',
        updated_at: '2026-05-14T00:00:00Z',
        metadata: { branch_source: 'import' },
      },
    ],
    revisions: [],
    assets: {},
  };
}

let root: HTMLElement;
let cleanup: (() => void) | null = null;

beforeEach(() => {
  root = document.createElement('div');
  root.id = 'pkc-root';
  document.body.appendChild(root);
});

afterEach(() => {
  if (cleanup) {
    cleanup();
    cleanup = null;
  }
  document.body.removeChild(root);
});

function bootAndSelect(lid: string): ReturnType<typeof createDispatcher> {
  const dispatcher = createDispatcher();
  dispatcher.onState((s) => render(s, root));
  dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
  cleanup = bindActions(root, dispatcher);
  dispatcher.dispatch({ type: 'SELECT_ENTRY', lid });
  render(dispatcher.getState(), root);
  return dispatcher;
}

describe('PR-V6 — Derived branches list', () => {
  it('renders a derived-branches section on the source entry meta pane', () => {
    bootAndSelect('source');
    const section = root.querySelector('[data-pkc-region="derived-branches"]');
    expect(section).not.toBeNull();
  });

  it('lists both branch entries (revision + revision-branch metadata keys accepted)', () => {
    bootAndSelect('source');
    const rows = root.querySelectorAll<HTMLElement>(
      '[data-pkc-region="derived-branches"] .pkc-derived-branch-row',
    );
    expect(rows.length).toBe(2);
    const lids = Array.from(rows).map((r) => r.getAttribute('data-pkc-branch-lid'));
    expect(lids).toContain('branch-1');
    expect(lids).toContain('branch-2');
  });

  it('excludes provenance rows with non-revision branch_source', () => {
    bootAndSelect('source');
    const rows = root.querySelectorAll<HTMLElement>(
      '[data-pkc-region="derived-branches"] .pkc-derived-branch-row',
    );
    const lids = Array.from(rows).map((r) => r.getAttribute('data-pkc-branch-lid'));
    expect(lids).not.toContain('unrelated');
  });

  it('each row carries a select-entry link to the branch lid', () => {
    bootAndSelect('source');
    const link = root.querySelector<HTMLButtonElement>(
      '.pkc-derived-branch-row[data-pkc-branch-lid="branch-1"] .pkc-derived-branch-link',
    );
    expect(link).not.toBeNull();
    expect(link!.getAttribute('data-pkc-action')).toBe('select-entry');
    expect(link!.getAttribute('data-pkc-lid')).toBe('branch-1');
    expect(link!.textContent).toBe('Source Entry (branch)');
  });

  it('displays source_revision_id (truncated) and branched_at timestamp', () => {
    bootAndSelect('source');
    const row = root.querySelector<HTMLElement>(
      '.pkc-derived-branch-row[data-pkc-branch-lid="branch-1"]',
    );
    expect(row).not.toBeNull();
    const revLabel = row!.querySelector('.pkc-derived-branch-source-rev');
    expect(revLabel?.textContent).toBe('@ rev-abc1');
    const tsLabel = row!.querySelector('.pkc-derived-branch-ts');
    expect(tsLabel).not.toBeNull();
  });

  it('clicking the link dispatches SELECT_ENTRY to the branch', () => {
    const dispatcher = bootAndSelect('source');
    const link = root.querySelector<HTMLButtonElement>(
      '.pkc-derived-branch-row[data-pkc-branch-lid="branch-1"] .pkc-derived-branch-link',
    );
    link!.click();
    expect(dispatcher.getState().selectedLid).toBe('branch-1');
  });

  it('does NOT render the section on an entry with no derived branches', () => {
    bootAndSelect('unrelated');
    const section = root.querySelector('[data-pkc-region="derived-branches"]');
    expect(section).toBeNull();
  });

  it('does NOT render the section on the branch entry itself', () => {
    // branch-1 is the derived entry, not the source — its provenance is
    // outbound (from=branch-1), so it should not list itself
    bootAndSelect('branch-1');
    const section = root.querySelector('[data-pkc-region="derived-branches"]');
    expect(section).toBeNull();
  });
});

// PR-V14(2026-05-14、U7):多階層 branch tree 視覚化
describe('PR-V14 — Derived branches multi-level tree', () => {
  function makeMultilevelContainer(): Container {
    const now = '2026-05-14T00:00:00Z';
    return {
      meta: {
        container_id: 'multilevel-tree',
        title: 'Multilevel',
        created_at: now,
        updated_at: now,
        schema_version: 1,
      },
      entries: [
        { lid: 'root', title: 'Root', archetype: 'text', body: '', created_at: now, updated_at: now },
        { lid: 'b1', title: 'B1', archetype: 'text', body: '', created_at: now, updated_at: now },
        { lid: 'b2', title: 'B2', archetype: 'text', body: '', created_at: now, updated_at: now },
        { lid: 'b1a', title: 'B1.a (grandchild)', archetype: 'text', body: '', created_at: now, updated_at: now },
        { lid: 'b1b', title: 'B1.b (grandchild)', archetype: 'text', body: '', created_at: now, updated_at: now },
      ],
      relations: [
        // b1 from root
        { id: 'r1', from: 'b1', to: 'root', kind: 'provenance', created_at: now, updated_at: now,
          metadata: { branch_source: 'revision', source_revision_id: 'rev-1', branched_at: now } },
        // b2 from root
        { id: 'r2', from: 'b2', to: 'root', kind: 'provenance', created_at: now, updated_at: now,
          metadata: { branch_source: 'revision', source_revision_id: 'rev-2', branched_at: now } },
        // b1a from b1
        { id: 'r3', from: 'b1a', to: 'b1', kind: 'provenance', created_at: now, updated_at: now,
          metadata: { branch_source: 'revision', source_revision_id: 'rev-3', branched_at: now } },
        // b1b from b1
        { id: 'r4', from: 'b1b', to: 'b1', kind: 'provenance', created_at: now, updated_at: now,
          metadata: { branch_source: 'revision', source_revision_id: 'rev-4', branched_at: now } },
      ],
      revisions: [],
      assets: {},
    };
  }

  function bootMulti(lid: string): ReturnType<typeof createDispatcher> {
    const dispatcher = createDispatcher();
    dispatcher.onState((s) => render(s, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeMultilevelContainer() });
    cleanup = bindActions(root, dispatcher);
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid });
    render(dispatcher.getState(), root);
    return dispatcher;
  }

  it('root entry tree:b1 と b2 が depth 0、b1 の下に b1a と b1b が nested', () => {
    bootMulti('root');
    const rows = root.querySelectorAll<HTMLElement>(
      '[data-pkc-region="derived-branches"] .pkc-derived-branch-row',
    );
    expect(rows.length).toBe(4); // b1, b1a, b1b, b2 = 4 nodes
    // b1, b2 at depth 0
    const d0lids = Array.from(rows)
      .filter((r) => r.getAttribute('data-pkc-branch-depth') === '0')
      .map((r) => r.getAttribute('data-pkc-branch-lid'));
    expect(d0lids).toContain('b1');
    expect(d0lids).toContain('b2');
    // b1a, b1b at depth 1
    const d1lids = Array.from(rows)
      .filter((r) => r.getAttribute('data-pkc-branch-depth') === '1')
      .map((r) => r.getAttribute('data-pkc-branch-lid'));
    expect(d1lids).toContain('b1a');
    expect(d1lids).toContain('b1b');
  });

  it('header text に total node 数を表示(直系 + 全孫)', () => {
    bootMulti('root');
    const summary = root.querySelector('.pkc-derived-branches-summary');
    expect(summary?.textContent).toBe('Derived branches (4)');
  });

  it('b1.a / b1.b は children wrapper の中に置かれて indent される', () => {
    bootMulti('root');
    const childWrapper = root.querySelector('[data-pkc-branch-parent-lid="b1"]');
    expect(childWrapper).not.toBeNull();
    const childLids = Array.from(
      childWrapper!.querySelectorAll<HTMLElement>('.pkc-derived-branch-row'),
    ).map((r) => r.getAttribute('data-pkc-branch-lid'));
    expect(childLids).toEqual(expect.arrayContaining(['b1a', 'b1b']));
  });

  it('depth >= 1 の row は tree guide marker(└──)を持つ', () => {
    bootMulti('root');
    const childRow = root.querySelector(
      '.pkc-derived-branch-row[data-pkc-branch-lid="b1a"]',
    );
    const guide = childRow?.querySelector('.pkc-derived-branch-guide');
    expect(guide).not.toBeNull();
    expect(guide?.textContent).toContain('└──');
  });

  it('b1 を選択すると b1 から派生した b1a / b1b の 2 件 tree が出る', () => {
    bootMulti('b1');
    const summary = root.querySelector('.pkc-derived-branches-summary');
    expect(summary?.textContent).toBe('Derived branches (2)');
    const rows = root.querySelectorAll<HTMLElement>(
      '[data-pkc-region="derived-branches"] .pkc-derived-branch-row',
    );
    expect(rows.length).toBe(2);
  });

  it('cycle 防御:循環 provenance(a→b→a)で無限 loop しない', () => {
    const cycle: Container = {
      meta: { container_id: 'cycle', title: 'Cycle', created_at: '2026-05-14T00:00:00Z', updated_at: '2026-05-14T00:00:00Z', schema_version: 1 },
      entries: [
        { lid: 'a', title: 'A', archetype: 'text', body: '', created_at: '2026-05-14T00:00:00Z', updated_at: '2026-05-14T00:00:00Z' },
        { lid: 'b', title: 'B', archetype: 'text', body: '', created_at: '2026-05-14T00:00:00Z', updated_at: '2026-05-14T00:00:00Z' },
      ],
      relations: [
        { id: 'c1', from: 'b', to: 'a', kind: 'provenance', created_at: '2026-05-14T00:00:00Z', updated_at: '2026-05-14T00:00:00Z',
          metadata: { branch_source: 'revision', source_revision_id: 'r1' } },
        { id: 'c2', from: 'a', to: 'b', kind: 'provenance', created_at: '2026-05-14T00:00:00Z', updated_at: '2026-05-14T00:00:00Z',
          metadata: { branch_source: 'revision', source_revision_id: 'r2' } },
      ],
      revisions: [],
      assets: {},
    };
    const dispatcher = createDispatcher();
    dispatcher.onState((s) => render(s, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: cycle });
    cleanup = bindActions(root, dispatcher);
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'a' });
    render(dispatcher.getState(), root);
    // 無限 loop しない:b が 1 件出るだけで OK
    const rows = root.querySelectorAll<HTMLElement>(
      '[data-pkc-region="derived-branches"] .pkc-derived-branch-row',
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.length).toBeLessThan(20); // 暴走しないことだけ確認
  });
});
