/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher as _createRawDispatcher } from '@adapter/state/dispatcher';
import { render } from '@adapter/ui/renderer';
import type { Container } from '@core/model/container';
import type { DomainEvent } from '@core/action/domain-event';

/**
 * C-1 revision-branch-restore v1 — UI picker slice tests.
 *
 * Contract: `docs/spec/revision-branch-restore-v1-behavior-contract.md`
 *   - §7   UI contract (selectors / rows / columns)
 *   - §7.3 keeps the existing "Revert" button
 *   - §1.3 BRANCH_RESTORE_REVISION dispatch shape
 *   - §6.1 readonly / editing / import gates
 */

function makeContainer(revisions: Container['revisions']): Container {
  return {
    meta: {
      container_id: 'test-id',
      title: 'Test',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      schema_version: 1,
    },
    entries: [
      {
        lid: 'e1',
        title: 'Entry One',
        body: 'Body one',
        archetype: 'text',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ],
    relations: [],
    revisions,
    assets: {},
  };
}

function revision(
  id: string,
  createdAt: string,
  opts: { contentHash?: string; title?: string; body?: string } = {},
): Container['revisions'][number] {
  return {
    id,
    entry_lid: 'e1',
    snapshot: JSON.stringify({
      lid: 'e1',
      title: opts.title ?? 'Old',
      body: opts.body ?? 'old body',
      archetype: 'text',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: createdAt,
    }),
    created_at: createdAt,
    ...(opts.contentHash !== undefined ? { content_hash: opts.contentHash } : {}),
  };
}

let root: HTMLElement;
let cleanup: (() => void) | undefined;
const _trackedUnsubs: (() => void)[] = [];

function createDispatcher() {
  const d = _createRawDispatcher();
  return {
    ...d,
    onState(listener: Parameters<typeof d.onState>[0]) {
      const unsub = d.onState(listener);
      _trackedUnsubs.push(unsub);
      return unsub;
    },
    onEvent(listener: Parameters<typeof d.onEvent>[0]) {
      const unsub = d.onEvent(listener);
      _trackedUnsubs.push(unsub);
      return unsub;
    },
  };
}

beforeEach(() => {
  root = document.createElement('div');
  root.id = 'pkc-root';
  document.body.appendChild(root);
  return () => {
    cleanup?.();
    cleanup = undefined;
    for (const fn of _trackedUnsubs) fn();
    _trackedUnsubs.length = 0;
    root.remove();
  };
});

function setup(container: Container) {
  const dispatcher = createDispatcher();
  const events: DomainEvent[] = [];
  dispatcher.onEvent((e) => events.push(e));
  dispatcher.onState((state) => render(state, root));

  dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });
  dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
  render(dispatcher.getState(), root);
  cleanup = bindActions(root, dispatcher);

  return { dispatcher, events };
}

describe('C-1 revision-branch-restore v1 — UI picker slice', () => {
  it('1. renders the picker region with a summary when the selected entry has revisions', () => {
    setup(makeContainer([revision('rev-1', '2026-04-10T09:00:00Z')]));
    const picker = root.querySelector('[data-pkc-region="revision-history"]');
    expect(picker).not.toBeNull();
    expect(picker!.tagName.toLowerCase()).toBe('details');
    expect(picker!.textContent).toContain('Revision history (1)');
  });

  it('2. renders one row per revision, newest first, with data-pkc-revision-index', () => {
    const container = makeContainer([
      revision('rev-old', '2026-04-10T09:00:00Z', { contentHash: 'abcdef01ff' }),
      revision('rev-mid', '2026-04-14T18:20:00Z', { contentHash: 'fedcba98' }),
      revision('rev-new', '2026-04-15T10:30:00Z'), // no content_hash
    ]);
    setup(container);
    const rows = root.querySelectorAll(
      '[data-pkc-region="revision-history"] [data-pkc-revision-index]',
    );
    expect(rows).toHaveLength(3);
    expect(rows[0]!.getAttribute('data-pkc-revision-id')).toBe('rev-new');
    expect(rows[1]!.getAttribute('data-pkc-revision-id')).toBe('rev-mid');
    expect(rows[2]!.getAttribute('data-pkc-revision-id')).toBe('rev-old');
    expect(rows[0]!.getAttribute('data-pkc-revision-index')).toBe('1');
    expect(rows[2]!.getAttribute('data-pkc-revision-index')).toBe('3');
    // content_hash slice / em-dash fallback
    expect(rows[0]!.textContent).toContain('—');
    expect(rows[1]!.textContent).toContain('fedcba98');
    expect(rows[2]!.textContent).toContain('abcdef01'); // 8 chars
  });

  it('3. each row carries Restore + Branch buttons with the row revision id', () => {
    setup(makeContainer([revision('rev-1', '2026-04-10T09:00:00Z')]));
    const row = root.querySelector(
      '[data-pkc-region="revision-history"] [data-pkc-revision-index="1"]',
    )!;
    const restoreBtn = row.querySelector('[data-pkc-action="restore-entry"]');
    const branchBtn = row.querySelector('[data-pkc-action="branch-restore-revision"]');
    expect(restoreBtn).not.toBeNull();
    expect(branchBtn).not.toBeNull();
    expect(restoreBtn!.getAttribute('data-pkc-lid')).toBe('e1');
    expect(restoreBtn!.getAttribute('data-pkc-revision-id')).toBe('rev-1');
    expect(branchBtn!.getAttribute('data-pkc-lid')).toBe('e1');
    expect(branchBtn!.getAttribute('data-pkc-revision-id')).toBe('rev-1');
    expect(branchBtn!.textContent).toContain('Restore as branch');
  });

  it('4. clicking a picker Restore button dispatches RESTORE_ENTRY with that revision id', () => {
    const container = makeContainer([
      revision('rev-old', '2026-04-10T09:00:00Z', {
        title: 'Old Title',
        body: 'old body text',
      }),
      revision('rev-new', '2026-04-15T10:30:00Z', {
        title: 'Newer',
        body: 'newer body',
      }),
    ]);
    const { dispatcher, events } = setup(container);
    // newest first → rev-new at index 1, rev-old at index 2
    const row = root.querySelector(
      '[data-pkc-region="revision-history"] [data-pkc-revision-index="2"]',
    )!;
    const restoreBtn = row.querySelector<HTMLElement>(
      '[data-pkc-action="restore-entry"]',
    )!;
    restoreBtn.click();

    const restored = events.find((e) => e.type === 'ENTRY_RESTORED');
    expect(restored).toBeDefined();
    expect(restored).toEqual({
      type: 'ENTRY_RESTORED',
      lid: 'e1',
      revision_id: 'rev-old',
    });
    // Body was rewound to the `rev-old` snapshot
    const entry = dispatcher.getState().container!.entries.find((e) => e.lid === 'e1')!;
    expect(entry.title).toBe('Old Title');
    expect(entry.body).toBe('old body text');
  });

  it('5. clicking Branch dispatches BRANCH_RESTORE_REVISION and emits ENTRY_BRANCHED_FROM_REVISION', () => {
    const { dispatcher, events } = setup(makeContainer([
      revision('rev-1', '2026-04-10T09:00:00Z', { title: 'Snap', body: 'snap body' }),
    ]));
    const branchBtn = root.querySelector<HTMLElement>(
      '[data-pkc-action="branch-restore-revision"]',
    )!;
    branchBtn.click();

    const branched = events.find((e) => e.type === 'ENTRY_BRANCHED_FROM_REVISION');
    expect(branched).toBeDefined();
    if (branched && branched.type === 'ENTRY_BRANCHED_FROM_REVISION') {
      expect(branched.sourceLid).toBe('e1');
      expect(branched.revision_id).toBe('rev-1');
      const entry = dispatcher
        .getState()
        .container!.entries.find((e) => e.lid === branched.newLid);
      expect(entry).toBeDefined();
      expect(entry!.title).toBe('Snap');
      expect(entry!.body).toBe('snap body');
      expect(dispatcher.getState().selectedLid).toBe(branched.newLid);
    }
  });

  it('6. existing latest-only "Revert" button regression — still present in revision-info', () => {
    setup(makeContainer([revision('rev-1', '2026-04-10T09:00:00Z')]));
    const revInfo = root.querySelector('[data-pkc-region="revision-info"]');
    expect(revInfo).not.toBeNull();
    const revertBtn = revInfo!.querySelector('[data-pkc-action="restore-entry"]');
    expect(revertBtn).not.toBeNull();
    expect(revertBtn!.textContent).toContain('Revert');
    expect(revertBtn!.getAttribute('data-pkc-revision-id')).toBe('rev-1');
  });

  it('7. picker is NOT mounted when the selected entry has 0 revisions', () => {
    setup(makeContainer([]));
    expect(root.querySelector('[data-pkc-region="revision-history"]')).toBeNull();
    // And revision-info is absent too (existing behavior)
    expect(root.querySelector('[data-pkc-region="revision-info"]')).toBeNull();
  });

  it('8. readonly state suppresses Restore + Branch buttons (UI side of the gate)', () => {
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({
      type: 'SYS_INIT_COMPLETE',
      container: makeContainer([revision('rev-1', '2026-04-10T09:00:00Z')]),
      readonly: true,
    });
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);

    const picker = root.querySelector('[data-pkc-region="revision-history"]');
    expect(picker).not.toBeNull(); // picker itself still visible (list-only)
    expect(picker!.querySelector('[data-pkc-action="restore-entry"]')).toBeNull();
    expect(picker!.querySelector('[data-pkc-action="branch-restore-revision"]')).toBeNull();
  });

  it('9. clicking Branch is a no-op when the reducer would block (editing phase)', () => {
    const { dispatcher, events } = setup(makeContainer([
      revision('rev-1', '2026-04-10T09:00:00Z'),
    ]));
    // Enter editing phase; the branch button still exists in the DOM
    // (phase transition happens before renderer removes it), but the
    // reducer is the ultimate gate — BRANCH_RESTORE_REVISION in the
    // editing phase is blocked and the container reference must not
    // change.
    dispatcher.dispatch({ type: 'BEGIN_EDIT', lid: 'e1' });
    const containerBefore = dispatcher.getState().container;
    dispatcher.dispatch({
      type: 'BRANCH_RESTORE_REVISION', entryLid: 'e1', revisionId: 'rev-1',
    });
    expect(dispatcher.getState().container).toBe(containerBefore);
    expect(events.some((e) => e.type === 'ENTRY_BRANCHED_FROM_REVISION')).toBe(false);
  });

  it('10. dispatching with no data-pkc-revision-id is a silent no-op', () => {
    const { dispatcher, events } = setup(makeContainer([
      revision('rev-1', '2026-04-10T09:00:00Z'),
    ]));
    const picker = root.querySelector('[data-pkc-region="revision-history"]')!;
    // Hand-craft a stray clickable node with the same action but missing
    // the revision id — mirrors defensive guard in the binder.
    const stray = document.createElement('button');
    stray.setAttribute('data-pkc-action', 'branch-restore-revision');
    stray.setAttribute('data-pkc-lid', 'e1');
    picker.appendChild(stray);
    stray.click();

    expect(events.some((e) => e.type === 'ENTRY_BRANCHED_FROM_REVISION')).toBe(false);
    // Sanity: dispatcher state container unchanged
    expect(dispatcher.getState().container!.entries).toHaveLength(1);
  });
});
