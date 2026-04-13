/**
 * @vitest-environment happy-dom
 *
 * Selected-entry HTML clone export — action-binder + renderer wiring.
 *
 * Covers the Data-menu `[data-pkc-action="export-selected-entry-html"]`
 * button and its delegation to `exportContainerAsHtml` with a subset
 * container produced by `buildSubsetContainer`. See:
 *   - docs/development/selected-entry-html-clone-export.md
 *   - src/adapter/ui/action-binder.ts (case 'export-selected-entry-html')
 *   - src/adapter/ui/renderer.ts (`📤 Selected as HTML` button)
 *
 * Subset closure correctness is pinned separately in
 * `tests/features/container/build-subset.test.ts`; this file verifies
 * UI gating and that the export pipeline receives the correct root.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher as _createRawDispatcher } from '@adapter/state/dispatcher';
import { render } from '@adapter/ui/renderer';
import { registerPresenter } from '@adapter/ui/detail-presenter';
import { textlogPresenter } from '@adapter/ui/textlog-presenter';
import type { Container } from '@core/model/container';

registerPresenter('textlog', textlogPresenter);

// Populate the runtime slots `buildExportHtml` reads from, so the
// export pipeline can actually assemble a document during the test.
function mountShellSlots() {
  for (const id of ['pkc-core', 'pkc-styles', 'pkc-theme', 'pkc-meta']) {
    if (!document.getElementById(id)) {
      const el = document.createElement('script');
      el.id = id;
      el.textContent = id === 'pkc-meta' ? '{"capabilities":[]}' : '/* stub */';
      document.head.appendChild(el);
    }
  }
  document.documentElement.setAttribute('data-pkc-app', 'pkc2');
  document.documentElement.setAttribute('data-pkc-version', '0.0.0-test');
  document.documentElement.setAttribute('data-pkc-schema', '1');
  document.documentElement.setAttribute('data-pkc-timestamp', '2026-04-13T00:00:00Z');
  document.documentElement.setAttribute('data-pkc-kind', 'dev');
}

const baseContainer: Container = {
  meta: {
    container_id: 'share-html-test',
    title: 'Share HTML Test',
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-01T00:00:00Z',
    schema_version: 1,
  },
  entries: [
    {
      lid: 'parent',
      title: 'ParentFolder',
      body: '',
      archetype: 'folder',
      created_at: '2026-04-01T00:00:00Z',
      updated_at: '2026-04-01T00:00:00Z',
    },
    {
      lid: 'a',
      title: 'Root Entry',
      body: 'Hello [B](entry:b) world',
      archetype: 'text',
      created_at: '2026-04-01T00:00:00Z',
      updated_at: '2026-04-01T00:00:00Z',
    },
    {
      lid: 'b',
      title: 'Linked Entry',
      body: 'body b',
      archetype: 'text',
      created_at: '2026-04-01T00:00:00Z',
      updated_at: '2026-04-01T00:00:00Z',
    },
    {
      lid: 'unrelated',
      title: 'Unrelated',
      body: 'unused',
      archetype: 'text',
      created_at: '2026-04-01T00:00:00Z',
      updated_at: '2026-04-01T00:00:00Z',
    },
  ],
  relations: [
    { id: 'r1', from: 'parent', to: 'a', kind: 'structural', created_at: '2026-04-01T00:00:00Z', updated_at: '2026-04-01T00:00:00Z' },
  ],
  revisions: [],
  assets: {},
};

let root: HTMLElement;
let cleanup: (() => void) | null = null;
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
  mountShellSlots();
  root = document.createElement('div');
  root.id = 'pkc-root';
  document.body.appendChild(root);
  return () => {
    cleanup?.();
    cleanup = null;
    for (const fn of _trackedUnsubs) fn();
    _trackedUnsubs.length = 0;
    root.remove();
  };
});

function setup(selectedLid: string | null) {
  const dispatcher = createDispatcher();
  dispatcher.onState((state) => render(state, root));
  dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: baseContainer });
  if (selectedLid) dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: selectedLid });
  render(dispatcher.getState(), root);
  cleanup = bindActions(root, dispatcher);
  return { dispatcher };
}

function openDataMenu() {
  const d = root.querySelector<HTMLDetailsElement>('.pkc-eip-details');
  if (d) d.open = true;
}

function htmlBtn(): HTMLButtonElement | null {
  return root.querySelector<HTMLButtonElement>(
    '[data-pkc-action="export-selected-entry-html"]',
  );
}

describe('Selected-entry HTML clone export — UI gating', () => {
  it('button is rendered but disabled when no selection exists', () => {
    setup(null);
    openDataMenu();
    const b = htmlBtn();
    expect(b).not.toBeNull();
    expect(b!.disabled).toBe(true);
    expect(b!.textContent).toBe('📤 Selected as HTML');
  });

  it('button is enabled for any archetype that can be selected', () => {
    setup('a');
    openDataMenu();
    const b = htmlBtn();
    expect(b).not.toBeNull();
    expect(b!.disabled).toBe(false);
    expect(b!.textContent).toBe('📤 Selected as HTML');
  });

  it('button is also enabled when a folder is selected (HTML can carry any archetype)', () => {
    setup('parent');
    openDataMenu();
    const b = htmlBtn();
    expect(b).not.toBeNull();
    expect(b!.disabled).toBe(false);
  });
});

describe('Selected-entry HTML clone export — download wiring', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('clicking the button triggers an HTML blob download', async () => {
    setup('a');
    openDataMenu();

    const createSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const anchorClickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    htmlBtn()!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    // The export is async; flush microtasks and any setTimeout(0) cleanup.
    await new Promise((r) => setTimeout(r, 50));

    expect(createSpy).toHaveBeenCalledTimes(1);
    const blob = createSpy.mock.calls[0]![0] as Blob;
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toContain('text/html');
    expect(anchorClickSpy).toHaveBeenCalledTimes(1);
    const anchor = anchorClickSpy.mock.instances[0] as unknown as HTMLAnchorElement;
    expect(anchor.download.endsWith('.html')).toBe(true);
    // The filename slug should reflect the selected entry's title,
    // not the source container's title. Accepts the slugifier's
    // lower-cased dash-joined form.
    expect(anchor.download.toLowerCase()).toContain('root');
    expect(revokeSpy).toBeDefined();
  });

  it('clicking with no selection is inert (no blob download)', async () => {
    setup(null);
    openDataMenu();
    const createSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    const anchorClickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    const b = htmlBtn()!;
    b.disabled = false; // bypass renderer gate to prove handler self-guards
    b.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 20));

    expect(createSpy).not.toHaveBeenCalled();
    expect(anchorClickSpy).not.toHaveBeenCalled();
  });
});
