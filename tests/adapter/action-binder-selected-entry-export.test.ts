/**
 * @vitest-environment happy-dom
 *
 * Selected-only entry export — action-binder + renderer wiring.
 *
 * This suite covers the top-level Data-menu affordance
 * `[data-pkc-action="export-selected-entry"]` and its archetype
 * routing to the existing `.text.zip` / `.textlog.zip` bundle
 * builders. See:
 *   - docs/development/selected-entry-export-and-reimport.md
 *   - src/adapter/ui/action-binder.ts (case 'export-selected-entry')
 *   - src/adapter/ui/renderer.ts (renderExportImportInline — disabled
 *     button when selection is absent / wrong archetype)
 *
 * Round-trip coverage for the TEXT bundle itself lives in
 * `tests/adapter/text-bundle.test.ts` (51 tests) — this file only
 * verifies that the Data-menu button correctly produces the same
 * bundle that those round-trip tests already prove.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher as _createRawDispatcher } from '@adapter/state/dispatcher';
import { render } from '@adapter/ui/renderer';
import { registerPresenter } from '@adapter/ui/detail-presenter';
import { textlogPresenter } from '@adapter/ui/textlog-presenter';
import { pickEntryPackageTarget } from '@adapter/platform/entry-package-router';
import type { Container } from '@core/model/container';

registerPresenter('textlog', textlogPresenter);

const baseContainer: Container = {
  meta: {
    container_id: 'share-test',
    title: 'Share Test',
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-01T00:00:00Z',
    schema_version: 1,
  },
  entries: [
    {
      lid: 'txt-1',
      title: 'Note One',
      body: '# Hello\n\nsome text',
      archetype: 'text',
      created_at: '2026-04-01T00:00:00Z',
      updated_at: '2026-04-01T00:00:00Z',
    },
    {
      lid: 'tl-1',
      title: 'Log One',
      body: JSON.stringify({
        entries: [
          { id: 'log-a', text: 'first', createdAt: '2026-04-01T10:00:00Z', flags: [] },
        ],
      }),
      archetype: 'textlog',
      created_at: '2026-04-01T00:00:00Z',
      updated_at: '2026-04-01T00:00:00Z',
    },
    {
      lid: 'folder-1',
      title: 'Holder',
      body: '',
      archetype: 'folder',
      created_at: '2026-04-01T00:00:00Z',
      updated_at: '2026-04-01T00:00:00Z',
    },
  ],
  relations: [],
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
  // The Data menu is a <details>; its `open` toggle is required so the
  // nested buttons exist in the live DOM. happy-dom renders children
  // regardless of `open`, but we still set it to match the real user
  // flow.
  const d = root.querySelector<HTMLDetailsElement>('.pkc-eip-details');
  if (d) d.open = true;
}

function exportSelectedBtn(): HTMLButtonElement | null {
  return root.querySelector<HTMLButtonElement>(
    '[data-pkc-action="export-selected-entry"]',
  );
}

function spyDownload() {
  const createSpy = vi
    .spyOn(URL, 'createObjectURL')
    .mockReturnValue('blob:mock-share-url');
  const revokeSpy = vi
    .spyOn(URL, 'revokeObjectURL')
    .mockImplementation(() => undefined);
  const anchorClickSpy = vi
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(() => undefined);
  return { createSpy, revokeSpy, anchorClickSpy };
}

describe('Selected-only export — Data menu button gating', () => {
  it('no selection → button is rendered but disabled', () => {
    setup(null);
    openDataMenu();
    const btn = exportSelectedBtn();
    expect(btn).not.toBeNull();
    expect(btn!.disabled).toBe(true);
    expect(btn!.textContent).toBe('📤 Selected');
  });

  it('folder selected → button stays disabled (unshareable archetype)', () => {
    setup('folder-1');
    openDataMenu();
    const btn = exportSelectedBtn();
    expect(btn).not.toBeNull();
    expect(btn!.disabled).toBe(true);
  });

  it('text entry selected → button is enabled and labeled TEXT', () => {
    setup('txt-1');
    openDataMenu();
    const btn = exportSelectedBtn();
    expect(btn).not.toBeNull();
    expect(btn!.disabled).toBe(false);
    expect(btn!.textContent).toBe('📤 Selected (TEXT)');
  });

  it('textlog entry selected → button is enabled and labeled TEXTLOG', () => {
    setup('tl-1');
    openDataMenu();
    const btn = exportSelectedBtn();
    expect(btn).not.toBeNull();
    expect(btn!.disabled).toBe(false);
    expect(btn!.textContent).toBe('📤 Selected (TEXTLOG)');
  });
});

describe('Selected-only export — archetype routing', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('text entry export → produces a .text.zip download', () => {
    setup('txt-1');
    openDataMenu();
    const { createSpy, anchorClickSpy } = spyDownload();

    exportSelectedBtn()!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(createSpy).toHaveBeenCalledTimes(1);
    const blob = createSpy.mock.calls[0]![0] as Blob;
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/zip');
    expect(anchorClickSpy).toHaveBeenCalledTimes(1);
    const anchor = anchorClickSpy.mock.instances[0] as unknown as HTMLAnchorElement;
    expect(anchor.download.endsWith('.text.zip')).toBe(true);
  });

  it('textlog entry export → produces a .textlog.zip download', () => {
    setup('tl-1');
    openDataMenu();
    const { createSpy, anchorClickSpy } = spyDownload();

    exportSelectedBtn()!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(createSpy).toHaveBeenCalledTimes(1);
    const blob = createSpy.mock.calls[0]![0] as Blob;
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/zip');
    expect(anchorClickSpy).toHaveBeenCalledTimes(1);
    const anchor = anchorClickSpy.mock.instances[0] as unknown as HTMLAnchorElement;
    expect(anchor.download.endsWith('.textlog.zip')).toBe(true);
  });

  it('no-selection click → no download is produced (inert)', () => {
    setup(null);
    openDataMenu();
    const { createSpy, anchorClickSpy } = spyDownload();

    // The rendered button is `disabled`, but a synthetic dispatch that
    // bypasses the disabled attribute (a rogue script / stale DOM
    // reference) must still be inert because the handler self-guards.
    const btn = exportSelectedBtn()!;
    btn.disabled = false;
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(createSpy).not.toHaveBeenCalled();
    expect(anchorClickSpy).not.toHaveBeenCalled();
  });

  it('unshareable archetype (folder) click → no download is produced', () => {
    setup('folder-1');
    openDataMenu();
    const { createSpy, anchorClickSpy } = spyDownload();

    const btn = exportSelectedBtn()!;
    btn.disabled = false;
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(createSpy).not.toHaveBeenCalled();
    expect(anchorClickSpy).not.toHaveBeenCalled();
  });
});

describe('Selected-only export → import round-trip', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exported TEXT bundle re-imports as a new entry with the same body', async () => {
    // Build the same bundle the action-binder would produce, then
    // feed it straight back through the TEXT importer. This proves
    // the round-trip without needing to fake a click + FileReader.
    const { buildTextBundle, importTextBundleFromBuffer } = await import(
      '../../src/adapter/platform/text-bundle'
    );

    const entry = baseContainer.entries.find((e) => e.lid === 'txt-1')!;
    const built = buildTextBundle(entry, baseContainer);
    const buf = built.zipBytes.buffer.slice(
      built.zipBytes.byteOffset,
      built.zipBytes.byteOffset + built.zipBytes.byteLength,
    ) as ArrayBuffer;

    const result = importTextBundleFromBuffer(buf, built.filename);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.text.title).toBe('Note One');
    expect(result.text.body).toBe('# Hello\n\nsome text');
    // No assets referenced in this fixture → attachments list empty.
    expect(result.attachments).toEqual([]);
  });

  it('exported TEXTLOG bundle manifest passes its own format guard', async () => {
    // TEXTLOG has its own format/version guard — just confirm the
    // action-binder's exporter produces a bundle that the dedicated
    // importer's manifest parser accepts. Full round-trip coverage
    // for the logs themselves lives in textlog-bundle.test.ts.
    const { buildTextlogBundle } = await import(
      '../../src/adapter/platform/textlog-bundle'
    );
    const entry = baseContainer.entries.find((e) => e.lid === 'tl-1')!;
    const built = buildTextlogBundle(entry, baseContainer);
    expect(built.manifest.format).toBe('pkc2-textlog-bundle');
    expect(built.manifest.version).toBe(1);
    expect(built.manifest.source_lid).toBe('tl-1');
  });
});

describe('Entry package import routing — pickEntryPackageTarget', () => {
  it('routes *.text.zip to the text importer input', () => {
    expect(pickEntryPackageTarget('note-20260401.text.zip')).toBe(
      'import-text-input',
    );
  });

  it('routes *.textlog.zip to the textlog importer input', () => {
    expect(pickEntryPackageTarget('log-20260401.textlog.zip')).toBe(
      'import-textlog-input',
    );
  });

  it('case-insensitive on extension (uppercase suffix still routes)', () => {
    expect(pickEntryPackageTarget('NOTE.TEXT.ZIP')).toBe('import-text-input');
    expect(pickEntryPackageTarget('LOG.TEXTLOG.ZIP')).toBe(
      'import-textlog-input',
    );
  });

  it('bare .zip / unknown extension → null (caller surfaces a warning)', () => {
    expect(pickEntryPackageTarget('container.pkc2.zip')).toBeNull();
    expect(pickEntryPackageTarget('random.zip')).toBeNull();
    expect(pickEntryPackageTarget('no-extension')).toBeNull();
    expect(pickEntryPackageTarget('')).toBeNull();
  });
});
