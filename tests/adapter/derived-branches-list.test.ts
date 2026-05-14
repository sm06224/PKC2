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
        from: 'branch-1',
        to: 'source',
        kind: 'provenance',
        metadata: {
          branch_source: 'revision',
          source_revision_id: 'rev-abc123def456',
          branched_at: '2026-05-14T00:30:00Z',
        },
      },
      // branch-2 also derived from source, using v1.x conversion_kind syntax
      {
        from: 'branch-2',
        to: 'source',
        kind: 'provenance',
        metadata: {
          conversion_kind: 'revision-branch',
          source_revision_id: 'rev-xyz789',
          converted_at: '2026-05-14T00:45:00Z',
        },
      },
      // non-revision provenance — should be ignored
      {
        from: 'unrelated',
        to: 'source',
        kind: 'provenance',
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
