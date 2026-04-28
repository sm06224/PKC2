/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher } from '@adapter/state/dispatcher';
import { render } from '@adapter/ui/renderer';
import type { AppState } from '@adapter/state/app-state';
import type { Container } from '@core/model/container';

/**
 * PR #185 — background attach contract.
 *
 * User direction:
 *   「読み込みの都度、追加されたアセットをセンターペインに表示する
 *    せいで、せっかくノンブロッキングにした意味がない」
 *   「添付した直後にエントリメニューが開きっぱなし」
 *   「添付はバックグラウンドで、ユーザーは編集を続けられるのが望ましい」
 *
 * Pre-PR-185 the drop pipeline did `CREATE_ENTRY` → `COMMIT_EDIT`,
 * which moved `selectedLid` + `editingLid` + `phase` to the new
 * attachment for every file. On iPhone shells the entry menu opened
 * automatically and stayed there; on desktop the center pane re-
 * rendered to the new attachment. For burst drops of N files this
 * fired 2N transitions and the user lost their context.
 *
 * PASTE_ATTACHMENT (used by paste path historically) creates the
 * entry + body + asset atomically and does NOT touch
 * selectedLid / editingLid / phase / viewMode. PR #185 routes drop
 * through PASTE_ATTACHMENT to keep the user's place.
 *
 * Tests pin:
 *   1. selectedLid is unchanged after a drop on the sidebar drop zone
 *   2. editingLid is unchanged
 *   3. phase is unchanged ('ready' stays 'ready')
 *   4. viewMode is unchanged
 *   5. The attachment IS created (sidebar grows by one)
 *   6. The asset IS stored on the container
 */

const T = '2026-04-28T00:00:00Z';

let root: HTMLElement;
let cleanup: (() => void) | null = null;

function baseContainer(): Container {
  return {
    meta: { container_id: 'c1', title: 'T', created_at: T, updated_at: T, schema_version: 1 },
    entries: [
      { lid: 'doc-1', title: 'Existing doc', archetype: 'text', body: 'hi', created_at: T, updated_at: T },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };
}

function setup(initialSelected: string | null = 'doc-1'): ReturnType<typeof createDispatcher> {
  const dispatcher = createDispatcher();
  dispatcher.onState((state) => render(state, root));
  dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: baseContainer() });
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
  // happy-dom's DataTransfer doesn't always wire FileList through
  // items.add; mirror the shape the action-binder reads (matches the
  // helper used in fi04-multi-add-dedupe-persistent-dnd.test.ts).
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

describe('PR #185 — background attach (silent flow)', () => {
  async function dropAndWait(files: File[]): Promise<void> {
    const zone = root.querySelector<HTMLElement>('[data-pkc-region="sidebar-file-drop-zone"]');
    expect(zone).not.toBeNull();
    simulateDrop(zone!, files);
    // Wait for the async attach pipeline (fileToBase64 + dispatch).
    // Sequential N-file drops fan out via processNext recursion; vi.waitFor
    // covers up to 3000 ms which is plenty for a 3-file synthetic drop.
  }

  it('single drop creates the attachment AND preserves selection / editing / phase / viewMode', async () => {
    const dispatcher = setup('doc-1');
    const before: AppState = dispatcher.getState();
    expect(before.selectedLid).toBe('doc-1');
    expect(before.editingLid).toBeNull();
    expect(before.phase).toBe('ready');

    const file = new File(['hello'], 'image.png', { type: 'image/png' });
    await dropAndWait([file]);

    await vi.waitFor(() => {
      const entries = dispatcher.getState().container?.entries ?? [];
      expect(entries.some((e) => e.archetype === 'attachment' && e.title === 'image.png')).toBe(true);
    }, { timeout: 3000 });

    const after = dispatcher.getState();
    // Pre-PR-185 these all flipped to the new attachment's lid (or to
    // 'editing'). The whole point of PR #185 is that they stay put.
    expect(after.selectedLid).toBe('doc-1');
    expect(after.editingLid).toBeNull();
    expect(after.phase).toBe('ready');
    expect(after.viewMode).toBe('detail');
    expect(Object.keys(after.container?.assets ?? {}).length).toBeGreaterThanOrEqual(1);
  });

  it('multi-file drop preserves selectedLid / editingLid / phase across all files', async () => {
    const dispatcher = setup('doc-1');
    const fileA = new File(['A'], 'a.png', { type: 'image/png' });
    const fileB = new File(['B'], 'b.png', { type: 'image/png' });
    const fileC = new File(['C'], 'c.png', { type: 'image/png' });
    await dropAndWait([fileA, fileB, fileC]);

    await vi.waitFor(() => {
      const titles = (dispatcher.getState().container?.entries ?? [])
        .filter((e) => e.archetype === 'attachment')
        .map((e) => e.title);
      expect(titles).toEqual(expect.arrayContaining(['a.png', 'b.png', 'c.png']));
    }, { timeout: 5000 });

    const after = dispatcher.getState();
    expect(after.selectedLid).toBe('doc-1');
    expect(after.editingLid).toBeNull();
    expect(after.phase).toBe('ready');
  });

  it('drop with no prior selection (selectedLid=null) still creates the attachment at root', async () => {
    const dispatcher = setup(null);
    expect(dispatcher.getState().selectedLid).toBeNull();

    const file = new File(['x'], 'rootfile.png', { type: 'image/png' });
    await dropAndWait([file]);

    await vi.waitFor(() => {
      const entries = dispatcher.getState().container?.entries ?? [];
      expect(entries.some((e) => e.archetype === 'attachment' && e.title === 'rootfile.png')).toBe(true);
    }, { timeout: 3000 });

    expect(dispatcher.getState().selectedLid).toBeNull();
    expect(dispatcher.getState().editingLid).toBeNull();
  });
});
