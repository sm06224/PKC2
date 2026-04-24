/**
 * @vitest-environment happy-dom
 *
 * ActionBinder — navigate-asset-ref (Phase 1 step 4, audit G3).
 *
 * Body 内に残った same-container Portable Reference
 * `[label](pkc://<self>/asset/<key>)` をクリックしたとき、
 * `body.asset_key === <key>` を持つ attachment entry へ遷移させる。
 * markdown-render 側が `data-pkc-action="navigate-asset-ref"` +
 * `data-pkc-asset-key="<key>"` を付与し、本テストが action-binder
 * 経由の click 挙動を pin する。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher } from '@adapter/state/dispatcher';
import { render } from '@adapter/ui/renderer';
import { registerPresenter } from '@adapter/ui/detail-presenter';
import { attachmentPresenter } from '@adapter/ui/attachment-presenter';
import { textlogPresenter } from '@adapter/ui/textlog-presenter';
import type { Container } from '@core/model/container';

registerPresenter('attachment', attachmentPresenter);
registerPresenter('textlog', textlogPresenter);

const T = '2026-04-24T00:00:00Z';
const SELF = 'c-self';

function makeContainer(): Container {
  return {
    meta: {
      container_id: SELF,
      title: 'Test',
      created_at: T,
      updated_at: T,
      schema_version: 1,
    },
    entries: [
      {
        // Source text entry — body contains a same-container portable
        // asset reference. markdown-render should tag it with the
        // navigate-asset-ref routing attrs on render.
        lid: 'src',
        title: 'Source',
        body: `[photo](pkc://${SELF}/asset/ast-001)`,
        archetype: 'text',
        created_at: T,
        updated_at: T,
      },
      {
        lid: 'att1',
        title: 'photo entry',
        body: JSON.stringify({
          name: 'photo.png',
          mime: 'image/png',
          size: 10,
          asset_key: 'ast-001',
        }),
        archetype: 'attachment',
        created_at: T,
        updated_at: T,
      },
      {
        // Malformed attachment body — tests that the owner lookup
        // skips entries whose body is not valid JSON without throwing.
        lid: 'att-bad',
        title: 'broken',
        body: '{not json',
        archetype: 'attachment',
        created_at: T,
        updated_at: T,
      },
    ],
    relations: [],
    revisions: [],
    assets: { 'ast-001': 'data:image/png;base64,aGVsbG8=' },
  };
}

let root: HTMLElement;
let cleanup: () => void;

beforeEach(() => {
  root = document.createElement('div');
  root.id = 'pkc-root';
  document.body.appendChild(root);
});

afterEach(() => {
  cleanup?.();
  root.remove();
});

function mountAndSelect(lid: string, container: Container = makeContainer()): {
  dispatcher: ReturnType<typeof createDispatcher>;
} {
  const dispatcher = createDispatcher();
  dispatcher.onState((state) => render(state, root));
  dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });
  render(dispatcher.getState(), root);
  cleanup = bindActions(root, dispatcher);
  dispatcher.dispatch({ type: 'SELECT_ENTRY', lid });
  return { dispatcher };
}

describe('ActionBinder — navigate-asset-ref', () => {
  it('click on same-container portable asset link selects the owning attachment entry', () => {
    const { dispatcher } = mountAndSelect('src');

    const anchor = root.querySelector<HTMLAnchorElement>(
      '[data-pkc-action="navigate-asset-ref"][data-pkc-asset-key="ast-001"]',
    );
    expect(anchor).not.toBeNull();

    anchor!.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );

    const state = dispatcher.getState();
    expect(state.selectedLid).toBe('att1');
  });

  it('click calls preventDefault so the raw `pkc://` href never triggers a browser navigation', () => {
    const { dispatcher } = mountAndSelect('src');
    expect(dispatcher.getState().selectedLid).toBe('src');

    const anchor = root.querySelector<HTMLAnchorElement>(
      '[data-pkc-action="navigate-asset-ref"]',
    );
    const evt = new MouseEvent('click', { bubbles: true, cancelable: true });
    anchor!.dispatchEvent(evt);

    expect(evt.defaultPrevented).toBe(true);
  });

  it('click targets `navigate-asset-ref` — not `navigate-entry-ref` — so entry handler does not steal the event', () => {
    // Regression guard: make sure the asset path has its own
    // routing attribute and does not piggy-back on the entry
    // action. If the entry handler caught the click, `data-pkc-entry-ref`
    // would be needed on the anchor (and `parseEntryRef('asset:ast-001')`
    // would mark the link broken), which is the wrong UX.
    const { dispatcher } = mountAndSelect('src');

    const anchor = root.querySelector<HTMLAnchorElement>(
      '[data-pkc-action="navigate-asset-ref"]',
    );
    expect(anchor!.getAttribute('data-pkc-action')).toBe('navigate-asset-ref');
    expect(anchor!.hasAttribute('data-pkc-entry-ref')).toBe(false);

    anchor!.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );
    // Landed on the correct owner entry (not marked broken).
    expect(dispatcher.getState().selectedLid).toBe('att1');
    expect(anchor!.getAttribute('data-pkc-ref-broken')).toBeNull();
  });

  it('click on an asset whose owner is missing is a safe no-op (no state change)', () => {
    // Remove the owner attachment; the ref itself still renders, but
    // the click cannot locate an owner. State must not change.
    const container = makeContainer();
    container.entries = container.entries.filter((e) => e.lid !== 'att1');
    const { dispatcher } = mountAndSelect('src', container);
    expect(dispatcher.getState().selectedLid).toBe('src');

    const anchor = root.querySelector<HTMLAnchorElement>(
      '[data-pkc-action="navigate-asset-ref"]',
    );
    // The anchor still renders (renderer has no container state —
    // only the ref shape). We assert it's there so we know the test
    // fixture actually exercises the click path.
    expect(anchor).not.toBeNull();
    anchor!.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );

    // selectedLid unchanged — no SELECT_ENTRY dispatched.
    expect(dispatcher.getState().selectedLid).toBe('src');
  });

  it('malformed attachment body is skipped during owner lookup (does not throw)', () => {
    // `att-bad` has a non-JSON body. `att1` (valid) must still be
    // found and selected; the bad entry is silently ignored.
    const { dispatcher } = mountAndSelect('src');

    const anchor = root.querySelector<HTMLAnchorElement>(
      '[data-pkc-action="navigate-asset-ref"]',
    );
    anchor!.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );

    expect(dispatcher.getState().selectedLid).toBe('att1');
  });
});
