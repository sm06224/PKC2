/**
 * @vitest-environment happy-dom
 *
 * Integration test for the Copy permalink UI wiring. Closes the
 * Link system UX loop — a same-container PKC can now both COPY
 * a permalink from its entry / asset and PASTE one back into an
 * editor where it demotes to an internal reference.
 *
 * See:
 *   - src/adapter/ui/action-binder.ts (copy-entry-permalink /
 *     copy-asset-permalink handlers)
 *   - src/adapter/ui/renderer.ts (meta pane "🔗 Copy link" button)
 *   - src/adapter/ui/attachment-presenter.ts (attachment card
 *     "🔗 Copy link" button)
 *   - docs/spec/pkc-link-unification-v0.md §4 / §7
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher } from '@adapter/state/dispatcher';
import { render } from '@adapter/ui/renderer';
import { registerPresenter } from '@adapter/ui/detail-presenter';
import { attachmentPresenter } from '@adapter/ui/attachment-presenter';
import type { Container } from '@core/model/container';

// Presenter registration is a bootstrap-time side effect (main.ts);
// tests must mirror it so `renderView` can dispatch to attachment.
registerPresenter('attachment', attachmentPresenter);

const T = '2026-04-24T00:00:00Z';
const SELF = 'c-self';

const baseContainer: Container = {
  meta: {
    container_id: SELF,
    title: 'Test',
    created_at: T,
    updated_at: T,
    schema_version: 1,
  },
  entries: [
    {
      lid: 'e1',
      title: 'A text entry',
      body: 'original body',
      archetype: 'text',
      created_at: T,
      updated_at: T,
    },
    {
      lid: 'att1',
      title: 'photo.png',
      body: JSON.stringify({
        name: 'photo.png',
        mime: 'image/png',
        size: 1024,
        asset_key: 'ast-001',
      }),
      archetype: 'attachment',
      created_at: T,
      updated_at: T,
    },
    {
      lid: 'att-legacy',
      title: 'old.png',
      body: JSON.stringify({
        name: 'old.png',
        mime: 'image/png',
        size: 500,
        data: 'base64-inline-legacy', // no asset_key → no permalink button
      }),
      archetype: 'attachment',
      created_at: T,
      updated_at: T,
    },
  ],
  relations: [],
  revisions: [],
  assets: {
    'ast-001': 'data:image/png;base64,aGVsbG8=',
  },
};

let root: HTMLElement;
let cleanup: () => void;
let writes: string[];
let restoreClipboard: () => void;

function installClipboard(): () => void {
  const nav = globalThis.navigator as unknown as { clipboard?: unknown };
  const prev = nav.clipboard;
  Object.defineProperty(nav, 'clipboard', {
    configurable: true,
    writable: true,
    value: {
      writeText: (text: string) => {
        writes.push(text);
        return Promise.resolve();
      },
    },
  });
  return () => {
    Object.defineProperty(nav, 'clipboard', {
      configurable: true,
      writable: true,
      value: prev,
    });
  };
}

beforeEach(() => {
  root = document.createElement('div');
  root.id = 'pkc-root';
  document.body.appendChild(root);
  writes = [];
  restoreClipboard = installClipboard();
});

afterEach(() => {
  cleanup?.();
  root.remove();
  restoreClipboard?.();
});

function setupAndSelect(
  lid: string,
  container: Container = baseContainer,
): void {
  const dispatcher = createDispatcher();
  dispatcher.onState((state) => render(state, root));
  dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });
  render(dispatcher.getState(), root);
  cleanup = bindActions(root, dispatcher);

  dispatcher.dispatch({ type: 'SELECT_ENTRY', lid });
  render(dispatcher.getState(), root);
}

describe('Copy permalink — entry meta pane', () => {
  it('renders a "Copy link" button in the entry meta header', () => {
    setupAndSelect('e1');
    const btn = root.querySelector<HTMLButtonElement>(
      '[data-pkc-action="copy-entry-permalink"][data-pkc-lid="e1"]',
    );
    expect(btn).not.toBeNull();
    expect(btn!.textContent).toContain('Copy link');
  });

  it('copies pkc://<cid>/entry/<lid> on click', async () => {
    setupAndSelect('e1');
    const btn = root.querySelector<HTMLButtonElement>(
      '[data-pkc-action="copy-entry-permalink"][data-pkc-lid="e1"]',
    );
    expect(btn).not.toBeNull();
    btn!.click();
    // Promise chain — give the microtask queue a tick so the
    // clipboard write resolves.
    await Promise.resolve();
    expect(writes).toEqual([`pkc://${SELF}/entry/e1`]);
  });

  it('does NOT copy when the container has no container_id (safe fail)', async () => {
    const badContainer: Container = {
      ...baseContainer,
      meta: { ...baseContainer.meta, container_id: '' },
    };
    setupAndSelect('e1', badContainer);

    const btn = root.querySelector<HTMLButtonElement>(
      '[data-pkc-action="copy-entry-permalink"][data-pkc-lid="e1"]',
    );
    expect(btn).not.toBeNull();
    btn!.click();
    await Promise.resolve();
    expect(writes).toEqual([]);
  });
});

describe('Copy permalink — attachment action row', () => {
  it('renders a "Copy link" button alongside Download when asset_key is present', () => {
    setupAndSelect('att1');
    const btn = root.querySelector<HTMLButtonElement>(
      '[data-pkc-action="copy-asset-permalink"][data-pkc-lid="att1"]',
    );
    expect(btn).not.toBeNull();
    expect(btn!.textContent).toContain('Copy link');
  });

  it('does NOT render the asset permalink button for legacy inline attachments', () => {
    setupAndSelect('att-legacy');
    const btn = root.querySelector<HTMLButtonElement>(
      '[data-pkc-action="copy-asset-permalink"][data-pkc-lid="att-legacy"]',
    );
    expect(btn).toBeNull();
  });

  it('copies pkc://<cid>/asset/<key> on click', async () => {
    setupAndSelect('att1');
    const btn = root.querySelector<HTMLButtonElement>(
      '[data-pkc-action="copy-asset-permalink"][data-pkc-lid="att1"]',
    );
    expect(btn).not.toBeNull();
    btn!.click();
    await Promise.resolve();
    expect(writes).toEqual([`pkc://${SELF}/asset/ast-001`]);
  });

  it('entry meta "Copy link" on an attachment entry still emits the entry permalink (not asset)', async () => {
    // Both buttons exist for an attachment — the meta-pane one
    // shares the entry-level action and should produce an
    // `entry/<lid>` URL, not `asset/<key>`. Documents the intended
    // separation so a future refactor doesn't silently merge them.
    setupAndSelect('att1');
    const entryBtn = root.querySelector<HTMLButtonElement>(
      '[data-pkc-action="copy-entry-permalink"][data-pkc-lid="att1"]',
    );
    expect(entryBtn).not.toBeNull();
    entryBtn!.click();
    await Promise.resolve();
    expect(writes).toEqual([`pkc://${SELF}/entry/att1`]);
  });
});

describe('Copy permalink — canonical form matches paste-side contract', () => {
  it('copied permalink is exactly the canonical form the paste wiring demotes', async () => {
    // The paste side (action-binder-link-paste.test.ts) already
    // proves `pkc://<self>/entry/<lid>` demotes to `[](entry:<lid>)`.
    // Here we pin that the COPY side emits that same canonical
    // string verbatim, so the UX loop closes without any transform
    // in between.
    setupAndSelect('e1');
    const btn = root.querySelector<HTMLButtonElement>(
      '[data-pkc-action="copy-entry-permalink"][data-pkc-lid="e1"]',
    );
    btn!.click();
    await Promise.resolve();
    expect(writes[0]).toBe(`pkc://${SELF}/entry/e1`);
  });
});
