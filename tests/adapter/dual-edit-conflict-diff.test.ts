/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  __resetRegistry,
  __resetUrlCache,
  setContainerFlagSource,
} from '@adapter/flags';
import {
  syncDualEditConflictOverlay,
  closeDualEditConflictOverlay,
} from '@adapter/ui/dual-edit-conflict-overlay';
import type { AppState } from '@adapter/state/app-state';

/**
 * γ-A5-5:dual-edit 競合 overlay の 2-pane diff view
 * (multi-window-vscode-extension-spec §5)。
 *
 * `shell.conflict_diff_view` flag ON で overlay に「現 container body /
 * 自分の draft」の行 diff が出ること、flag OFF で従来どおり 3 択ボタンの
 * みであること、3 択ボタンは flag に関係なく不変であることを検証する。
 */

const T0 = '2026-05-22T00:00:00Z';
const T2 = '2026-05-22T02:00:00Z';

function makeState(currentBody: string, draftBody: string): AppState {
  return {
    container: {
      meta: {
        container_id: 'c',
        title: 'T',
        created_at: T0,
        updated_at: T0,
        schema_version: 1,
      },
      entries: [
        {
          lid: 'e1',
          title: 'T',
          body: currentBody,
          archetype: 'text',
          created_at: T0,
          updated_at: T2,
        },
      ],
      relations: [],
      revisions: [],
      assets: {},
    },
    dualEditConflict: {
      lid: 'e1',
      base: { lid: 'e1', updated_at: T0, content_hash: 'h', archetype: 'text' },
      draft: { title: 'T', body: draftBody },
      kind: 'concurrent-edit',
      currentUpdatedAt: T2,
      currentContentHash: 'h2',
      currentArchetype: 'text',
    },
  } as unknown as AppState;
}

let root: HTMLElement;

beforeEach(() => {
  __resetRegistry();
  __resetUrlCache();
  root = document.createElement('div');
  document.body.appendChild(root);
});

afterEach(() => {
  closeDualEditConflictOverlay();
  root.remove();
});

describe('γ-A5-5 dual-edit-conflict diff view', () => {
  it('flag OFF:overlay は出るが diff pane は無い', () => {
    syncDualEditConflictOverlay(makeState('a\nb', 'a\nB'), root);
    expect(
      root.querySelector('[data-pkc-region="dual-edit-conflict"]'),
    ).not.toBeNull();
    expect(
      root.querySelector('[data-pkc-region="dual-edit-conflict-diff"]'),
    ).toBeNull();
  });

  it('flag ON:overlay に 2-pane diff pane が出る', () => {
    setContainerFlagSource({ 'shell.conflict_diff_view': true });
    syncDualEditConflictOverlay(makeState('a\nb', 'a\nB'), root);
    expect(
      root.querySelector('[data-pkc-region="dual-edit-conflict-diff"]'),
    ).not.toBeNull();
  });

  it('diff pane に del / add セルが行 diff どおり描画される', () => {
    setContainerFlagSource({ 'shell.conflict_diff_view': true });
    syncDualEditConflictOverlay(makeState('keep\nold', 'keep\nnew'), root);
    const pane = root.querySelector(
      '[data-pkc-region="dual-edit-conflict-diff"]',
    )!;
    expect(pane.querySelector('[data-op="del"]')?.textContent).toBe('old');
    expect(pane.querySelector('[data-op="add"]')?.textContent).toBe('new');
  });

  it('左 = 現 container body(del)、右 = 自分の draft(add)', () => {
    setContainerFlagSource({ 'shell.conflict_diff_view': true });
    syncDualEditConflictOverlay(makeState('CURRENT', 'DRAFT'), root);
    const cells = [
      ...root.querySelectorAll('.pkc-conflict-diff-cell'),
    ];
    expect(
      cells.some(
        (c) => c.textContent === 'CURRENT' && c.getAttribute('data-op') === 'del',
      ),
    ).toBe(true);
    expect(
      cells.some(
        (c) => c.textContent === 'DRAFT' && c.getAttribute('data-op') === 'add',
      ),
    ).toBe(true);
  });

  it('同一 body でも diff pane は出る(del / add セルなし)', () => {
    setContainerFlagSource({ 'shell.conflict_diff_view': true });
    syncDualEditConflictOverlay(makeState('same\ntext', 'same\ntext'), root);
    const pane = root.querySelector(
      '[data-pkc-region="dual-edit-conflict-diff"]',
    )!;
    expect(pane).not.toBeNull();
    expect(pane.querySelector('[data-op="del"]')).toBeNull();
    expect(pane.querySelector('[data-op="add"]')).toBeNull();
  });

  it('3 択ボタン(branch / discard / copy)は flag ON でも不変', () => {
    setContainerFlagSource({ 'shell.conflict_diff_view': true });
    syncDualEditConflictOverlay(makeState('x', 'y'), root);
    expect(
      root.querySelector('[data-pkc-action="resolve-dual-edit-save-as-branch"]'),
    ).not.toBeNull();
    expect(
      root.querySelector('[data-pkc-action="resolve-dual-edit-discard"]'),
    ).not.toBeNull();
    expect(
      root.querySelector('[data-pkc-action="resolve-dual-edit-copy-clipboard"]'),
    ).not.toBeNull();
  });
});
