/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach } from 'vitest';
import { createDispatcher } from '@adapter/state/dispatcher';
import { bindActions } from '@adapter/ui/action-binder';
import { render } from '@adapter/ui/renderer';
import type { Container } from '@core/model/container';

/**
 * 2026-04-27 user direction:
 *   「どこにもリンクしていない、埋め込まれていない、リンク貼付も
 *    されていないアセットをフィルタする機能をつけて。一括消す対象
 *    をそうやって選びたい」
 *
 * Surfaces the cleanup workflow as a sidebar toggle. When active,
 * the entry list is restricted to attachment entries that nothing
 * else points at — so the user can multi-select + bulk-delete in
 * one pass.
 */

const T = '2026-04-27T00:00:00.000Z';

function attachmentBody(assetKey: string, name = `${assetKey}.png`, mime = 'image/png'): string {
  return JSON.stringify({ name, mime, size: 4, asset_key: assetKey });
}

function fixture(): Container {
  return {
    meta: { container_id: 'cid', title: 'Test', created_at: T, updated_at: T, schema_version: 1 },
    entries: [
      { lid: 't1', title: 'Note', archetype: 'text', body: '[link](entry:att-used) and ![](asset:ast-pasted)', created_at: T, updated_at: T },
      { lid: 'att-used', title: 'used.png', archetype: 'attachment', body: attachmentBody('ast-used'), created_at: T, updated_at: T },
      { lid: 'att-pasted', title: 'pasted.png', archetype: 'attachment', body: attachmentBody('ast-pasted'), created_at: T, updated_at: T },
      { lid: 'att-orphan-a', title: 'unused-a.png', archetype: 'attachment', body: attachmentBody('ast-a'), created_at: T, updated_at: T },
      { lid: 'att-orphan-b', title: 'unused-b.png', archetype: 'attachment', body: attachmentBody('ast-b'), created_at: T, updated_at: T },
    ],
    relations: [],
    revisions: [],
    assets: { 'ast-used': '', 'ast-pasted': '', 'ast-a': '', 'ast-b': '' },
  };
}

let root: HTMLElement;
let cleanup: (() => void) | undefined;

beforeEach(() => {
  root = document.createElement('div');
  root.id = 'pkc-root';
  document.body.appendChild(root);
  return () => {
    cleanup?.();
    cleanup = undefined;
    root.remove();
  };
});

function setup() {
  const dispatcher = createDispatcher();
  dispatcher.onState((state) => render(state, root));
  dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: fixture() });
  render(dispatcher.getState(), root);
  cleanup = bindActions(root, dispatcher);
  return dispatcher;
}

function visibleLids(): string[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>('.pkc-entry-list [data-pkc-lid]'),
  ).map((el) => el.getAttribute('data-pkc-lid')!);
}

describe('unreferenced-attachments filter UI', () => {
  it('toggle is rendered when the container has at least one attachment', () => {
    setup();
    const region = root.querySelector('[data-pkc-region="unreferenced-attachments-toggle"]');
    expect(region).not.toBeNull();
    const checkbox = region!.querySelector<HTMLInputElement>(
      'input[data-pkc-action="toggle-unreferenced-attachments"]',
    );
    expect(checkbox).not.toBeNull();
    expect(checkbox!.checked).toBe(false);
  });

  it('flipping the toggle restricts the list to entries with no entry: AND no asset: reference', () => {
    const dispatcher = setup();
    dispatcher.dispatch({ type: 'TOGGLE_UNREFERENCED_ATTACHMENTS_FILTER' });
    render(dispatcher.getState(), root);

    const lids = visibleLids();
    // Both unused attachments are surfaced.
    expect(lids).toContain('att-orphan-a');
    expect(lids).toContain('att-orphan-b');
    // The text note, the entry-linked attachment, and the asset-
    // embedded attachment are NOT surfaced.
    expect(lids).not.toContain('t1');
    expect(lids).not.toContain('att-used');
    expect(lids).not.toContain('att-pasted');
  });

  it('toggle label shows the live unreferenced count when active', () => {
    const dispatcher = setup();
    dispatcher.dispatch({ type: 'TOGGLE_UNREFERENCED_ATTACHMENTS_FILTER' });
    render(dispatcher.getState(), root);
    const region = root.querySelector('[data-pkc-region="unreferenced-attachments-toggle"]');
    expect(region!.textContent).toContain('(2)');
  });

  it('toggle is hidden on text-only containers (no attachments → no affordance)', () => {
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));
    const textOnly: Container = {
      meta: { container_id: 'cid', title: 'Text only', created_at: T, updated_at: T, schema_version: 1 },
      entries: [
        { lid: 't1', title: 'Note', archetype: 'text', body: 'hi', created_at: T, updated_at: T },
      ],
      relations: [],
      revisions: [],
      assets: {},
    };
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: textOnly });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);
    expect(root.querySelector('[data-pkc-region="unreferenced-attachments-toggle"]')).toBeNull();
  });

  it('clicking the checkbox dispatches TOGGLE_UNREFERENCED_ATTACHMENTS_FILTER', () => {
    const dispatcher = setup();
    const checkbox = root.querySelector<HTMLInputElement>(
      'input[data-pkc-action="toggle-unreferenced-attachments"]',
    );
    expect(checkbox).not.toBeNull();
    checkbox!.click();
    expect(dispatcher.getState().unreferencedAttachmentsOnly).toBe(true);
  });
});
