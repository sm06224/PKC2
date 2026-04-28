/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher } from '@adapter/state/dispatcher';
import { render } from '@adapter/ui/renderer';
import type { Container } from '@core/model/container';

/**
 * PR #185 — verify ASSETS auto-placement still works after the
 * CREATE_ENTRY+COMMIT_EDIT → PASTE_ATTACHMENT switch.
 *
 * Scenarios:
 *   1. selection inside a folder → drop → attachment lands in
 *      `<folder>/ASSETS/`
 *   2. selection on a folder itself → drop → attachment lands in
 *      `<folder>/ASSETS/`
 *   3. no selection → drop → attachment lands at root (no auto-folder)
 */

const T = '2026-04-28T00:00:00Z';

function makeContainer(): Container {
  return {
    meta: { container_id: 'c1', title: 'T', created_at: T, updated_at: T, schema_version: 1 },
    entries: [
      { lid: 'fld-1', title: 'Folder', archetype: 'folder', body: '', created_at: T, updated_at: T },
      { lid: 'note-1', title: 'My note', archetype: 'text', body: 'hi', created_at: T, updated_at: T },
    ],
    relations: [
      { id: 'r1', from: 'fld-1', to: 'note-1', kind: 'structural', created_at: T, updated_at: T },
    ],
    revisions: [],
    assets: {},
  };
}

let root: HTMLElement;
let cleanup: (() => void) | null = null;

function setup(initialSelected: string | null): ReturnType<typeof createDispatcher> {
  const dispatcher = createDispatcher();
  dispatcher.onState((state) => render(state, root));
  dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
  if (initialSelected) {
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: initialSelected });
  }
  render(dispatcher.getState(), root);
  cleanup = bindActions(root, dispatcher);
  return dispatcher;
}

beforeEach(() => {
  root = document.createElement('div');
  root.id = 'pkc-root';
  document.body.appendChild(root);
});

afterEach(() => {
  cleanup?.();
  cleanup = null;
  root.remove();
});

function simulateDrop(target: HTMLElement, files: File[]): void {
  const dt = {
    files: files as unknown as FileList,
    types: ['Files'],
    dropEffect: 'none',
    get length() { return files.length; },
  };
  const evt = new Event('drop', { bubbles: true }) as unknown as DragEvent;
  Object.defineProperty(evt, 'dataTransfer', { value: dt });
  target.dispatchEvent(evt);
}

function getStructuralParent(container: Container, lid: string): { lid: string; title: string; archetype: string } | null {
  for (const r of container.relations) {
    if (r.kind === 'structural' && r.to === lid) {
      const parent = container.entries.find((e) => e.lid === r.from);
      if (parent) return { lid: parent.lid, title: parent.title, archetype: parent.archetype };
    }
  }
  return null;
}

describe('PR #185 — ASSETS auto-placement preservation', () => {
  it('selection inside folder → drop lands in <folder>/ASSETS/', async () => {
    const dispatcher = setup('note-1'); // note inside fld-1
    const file = new File(['x'], 'pic.png', { type: 'image/png' });

    const zone = root.querySelector<HTMLElement>('[data-pkc-region="sidebar-file-drop-zone"]')!;
    expect(zone).not.toBeNull();
    simulateDrop(zone, [file]);

    const { vi: viNS } = await import('vitest');
    await viNS.waitFor(() => {
      const c = dispatcher.getState().container!;
      const att = c.entries.find((e) => e.archetype === 'attachment');
      expect(att).toBeDefined();
    }, { timeout: 3000 });

    const c = dispatcher.getState().container!;
    const att = c.entries.find((e) => e.archetype === 'attachment')!;
    const parent = getStructuralParent(c, att.lid);
    expect(parent).not.toBeNull();
    expect(parent!.title).toBe('ASSETS'); // landed inside ASSETS subfolder
    expect(parent!.archetype).toBe('folder');

    // ASSETS subfolder itself is a child of fld-1
    const assetsParent = getStructuralParent(c, parent!.lid);
    expect(assetsParent).not.toBeNull();
    expect(assetsParent!.lid).toBe('fld-1');
  });

  it('selection on folder itself → drop lands in <folder>/ASSETS/', async () => {
    const dispatcher = setup('fld-1');
    const file = new File(['x'], 'pic.png', { type: 'image/png' });

    const zone = root.querySelector<HTMLElement>('[data-pkc-region="sidebar-file-drop-zone"]')!;
    simulateDrop(zone, [file]);

    const { vi: viNS } = await import('vitest');
    await viNS.waitFor(() => {
      const c = dispatcher.getState().container!;
      expect(c.entries.some((e) => e.archetype === 'attachment')).toBe(true);
    }, { timeout: 3000 });

    const c = dispatcher.getState().container!;
    const att = c.entries.find((e) => e.archetype === 'attachment')!;
    const parent = getStructuralParent(c, att.lid)!;
    expect(parent.title).toBe('ASSETS');
    const assetsParent = getStructuralParent(c, parent.lid)!;
    expect(assetsParent.lid).toBe('fld-1');
  });

  it('no selection → drop lands at root (no ASSETS auto-folder)', async () => {
    const dispatcher = setup(null);
    const file = new File(['x'], 'pic.png', { type: 'image/png' });

    const zone = root.querySelector<HTMLElement>('[data-pkc-region="sidebar-file-drop-zone"]')!;
    simulateDrop(zone, [file]);

    const { vi: viNS } = await import('vitest');
    await viNS.waitFor(() => {
      const c = dispatcher.getState().container!;
      expect(c.entries.some((e) => e.archetype === 'attachment')).toBe(true);
    }, { timeout: 3000 });

    const c = dispatcher.getState().container!;
    const att = c.entries.find((e) => e.archetype === 'attachment')!;
    const parent = getStructuralParent(c, att.lid);
    expect(parent).toBeNull(); // root placement, no structural parent
  });
});
