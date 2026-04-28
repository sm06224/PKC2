/**
 * @vitest-environment happy-dom
 *
 * FI-04: 添付基盤 — multi-add / dedupe / 常設 DnD tests.
 *
 * Pure:
 *   P-1 hash + size both match → duplicate = true
 *   P-2 hash match, size mismatch → false
 *   P-3 hash mismatch, size match → false
 *   P-4 empty container.assets → false
 *   P-5 fnv1a64Hex throws (via bad container) → false (soft-fail)
 *
 * Integration (action-binder + renderer):
 *   I-1 ready phase, 2 files dropped → 2 attachment entries, order matches FileList
 *   I-2 duplicate file dropped → info toast shown, attachment created
 *   I-3 first file read fails → second file still attached
 *   I-4 persistent drop zone rendered in sidebar
 *   I-5 editing phase: persistent sidebar drop zone is inactive (pointer-events none)
 *   I-6 FI-05 regression: editing DnD still inserts link into body textarea
 *
 * See docs/spec/attachment-foundation-fi04-v1-behavior-contract.md
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { checkAssetDuplicate } from '@adapter/ui/asset-dedupe';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher } from '@adapter/state/dispatcher';
import { render } from '@adapter/ui/renderer';
import type { Container } from '@core/model/container';

// ── Shared boilerplate ──────────────────────────────────────────────────────

const T = '2026-04-18T00:00:00Z';

function baseContainer(): Container {
  return {
    meta: { container_id: 'c1', title: 'Test', created_at: T, updated_at: T, schema_version: 1 },
    entries: [],
    relations: [],
    revisions: [],
    assets: {},
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
    // Remove any toast elements left by tests
    document.body.querySelectorAll('[data-pkc-region="toast-stack"]').forEach((el) => el.remove());
  };
});

function setupReady(): ReturnType<typeof createDispatcher> {
  const dispatcher = createDispatcher();
  dispatcher.onState((state) => render(state, root));
  dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: baseContainer() });
  render(dispatcher.getState(), root);
  cleanup = bindActions(root, dispatcher);
  return dispatcher;
}

function simulateDrop(target: HTMLElement, files: File[]): void {
  const dt = {
    files: files as unknown as FileList,
    types: ['Files'],
    dropEffect: 'none',
    get length() { return files.length; },
  };
  const evt = new Event('drop', { bubbles: true }) as unknown as DragEvent;
  Object.defineProperty(evt, 'dataTransfer', { value: dt });
  Object.defineProperty(evt, 'preventDefault', { value: vi.fn() });
  Object.defineProperty(evt, 'stopPropagation', { value: vi.fn() });
  target.dispatchEvent(evt);
}

// ── P: Pure checkAssetDuplicate ─────────────────────────────────────────────

describe('checkAssetDuplicate (pure)', () => {
  function makeContainerWithAsset(base64: string, size: number): Container {
    const key = 'att-test-key';
    return {
      meta: { container_id: 'c1', title: 'T', created_at: T, updated_at: T, schema_version: 1 },
      entries: [{
        lid: 'e1',
        title: 'file.txt',
        archetype: 'attachment',
        body: JSON.stringify({ name: 'file.txt', mime: 'text/plain', size, asset_key: key }),
        created_at: T,
        updated_at: T,
      }],
      relations: [],
      revisions: [],
      assets: { [key]: base64 },
    };
  }

  it('P-1: hash + size both match → true', () => {
    const data = btoa('hello world');
    const container = makeContainerWithAsset(data, 11);
    expect(checkAssetDuplicate(data, 11, container)).toBe(true);
  });

  it('P-2: hash matches, size differs → false', () => {
    const data = btoa('hello world');
    const container = makeContainerWithAsset(data, 11);
    expect(checkAssetDuplicate(data, 999, container)).toBe(false);
  });

  it('P-3: size matches, hash differs → false', () => {
    const existing = btoa('hello world');
    const container = makeContainerWithAsset(existing, 11);
    const different = btoa('HELLO WORLD');
    expect(checkAssetDuplicate(different, 11, container)).toBe(false);
  });

  it('P-4: empty container.assets → false', () => {
    const container = baseContainer();
    expect(checkAssetDuplicate(btoa('data'), 4, container)).toBe(false);
  });

  it('P-5: null container → false', () => {
    expect(checkAssetDuplicate(btoa('data'), 4, null)).toBe(false);
  });
});

// ── I: Integration ──────────────────────────────────────────────────────────

describe('FI-04 multi-add (integration)', () => {
  it('I-1: 2 files dropped → 2 attachment entries created in FileList order', async () => {
    const dispatcher = setupReady();

    const fileA = new File(['aaaa'], 'alpha.txt', { type: 'text/plain' });
    const fileB = new File(['bbbb'], 'beta.txt', { type: 'text/plain' });

    const dropZone = root.querySelector<HTMLElement>('[data-pkc-region="file-drop-zone"]');
    expect(dropZone).not.toBeNull();

    simulateDrop(dropZone!, [fileA, fileB]);

    await vi.waitFor(() => {
      const entries = dispatcher.getState().container?.entries ?? [];
      const attachments = entries.filter((e) => e.archetype === 'attachment');
      expect(attachments.length).toBe(2);
    }, { timeout: 3000 });

    const entries = dispatcher.getState().container!.entries.filter((e) => e.archetype === 'attachment');
    expect(entries[0]!.title).toBe('alpha.txt');
    expect(entries[1]!.title).toBe('beta.txt');
  });
});

describe('FI-04 dedupe notification (integration)', () => {
  it('I-2: dropping identical file twice → info toast on second drop, both attached', async () => {
    const dispatcher = setupReady();

    const fileA = new File(['same content'], 'doc.txt', { type: 'text/plain' });
    const fileB = new File(['same content'], 'doc.txt', { type: 'text/plain' });

    // Re-query after each re-render to avoid stale DOM references
    simulateDrop(root.querySelector<HTMLElement>('[data-pkc-region="file-drop-zone"]')!, [fileA]);

    // Wait for first attachment and re-render
    await vi.waitFor(() => {
      const entries = dispatcher.getState().container?.entries ?? [];
      expect(entries.filter((e) => e.archetype === 'attachment').length).toBe(1);
    }, { timeout: 3000 });

    // Re-render to get fresh DOM, then drop second identical file
    render(dispatcher.getState(), root);
    simulateDrop(root.querySelector<HTMLElement>('[data-pkc-region="file-drop-zone"]')!, [fileB]);

    await vi.waitFor(() => {
      const entries = dispatcher.getState().container?.entries ?? [];
      expect(entries.filter((e) => e.archetype === 'attachment').length).toBe(2);
    }, { timeout: 3000 });

    // Toast should have been shown for the duplicate
    const toast = document.body.querySelector('[data-pkc-region="toast"]');
    expect(toast).not.toBeNull();
    expect(toast!.textContent).toContain('doc.txt');
  });
});

describe('FI-04 error resilience (integration)', () => {
  it('I-3: first of 2 files fails to read → second file is still attached', async () => {
    const dispatcher = setupReady();

    // Stub FileReader so the first read triggers onerror.
    // PR #181 switched the attach pipeline from readAsArrayBuffer to
    // readAsDataURL so the base64 conversion happens in C++. We mock
    // both methods because either could be called depending on
    // which intake path the file takes.
    let callCount = 0;
    vi.stubGlobal('FileReader', class MockFileReader {
      result: ArrayBuffer | string | null = null;
      error: { message: string } | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsArrayBuffer(_file: File): void {
        callCount++;
        if (callCount === 1) {
          this.error = { message: 'read error' };
          setTimeout(() => this.onerror?.(), 0);
        } else {
          const buf = new Uint8Array([98, 98, 98, 98]).buffer; // 'bbbb'
          this.result = buf;
          setTimeout(() => this.onload?.(), 0);
        }
      }
      readAsDataURL(_file: File): void {
        callCount++;
        if (callCount === 1) {
          this.error = { message: 'read error' };
          setTimeout(() => this.onerror?.(), 0);
        } else {
          // 'bbbb' base64-encoded → 'YmJiYg=='
          this.result = 'data:text/plain;base64,YmJiYg==';
          setTimeout(() => this.onload?.(), 0);
        }
      }
    });

    const fileA = new File(['aaaa'], 'fail.txt', { type: 'text/plain' });
    const fileB = new File(['bbbb'], 'ok.txt', { type: 'text/plain' });

    const dropZone = root.querySelector<HTMLElement>('[data-pkc-region="file-drop-zone"]');
    simulateDrop(dropZone!, [fileA, fileB]);

    await vi.waitFor(() => {
      const entries = dispatcher.getState().container?.entries ?? [];
      expect(entries.filter((e) => e.archetype === 'attachment').length).toBeGreaterThanOrEqual(1);
    }, { timeout: 3000 });

    const attachments = dispatcher.getState().container!.entries.filter((e) => e.archetype === 'attachment');
    expect(attachments.some((e) => e.title === 'ok.txt')).toBe(true);

    vi.unstubAllGlobals();
  });
});

describe('FI-04 persistent DnD zone (renderer)', () => {
  it('I-4: persistent drop zone is rendered in sidebar in ready phase', () => {
    setupReady();
    const zone = root.querySelector<HTMLElement>('[data-pkc-persistent-drop-zone="true"]');
    expect(zone).not.toBeNull();
    expect(zone!.getAttribute('data-pkc-region')).toBe('sidebar-file-drop-zone');
  });

  it('I-5: persistent drop zone is inactive in editing phase', () => {
    const dispatcher = setupReady();

    // Create a text entry and begin editing
    dispatcher.dispatch({ type: 'CREATE_ENTRY', archetype: 'text', title: 'Doc' });
    render(dispatcher.getState(), root);
    expect(dispatcher.getState().editingLid).toBeTruthy();
    render(dispatcher.getState(), root);

    const zone = root.querySelector<HTMLElement>('[data-pkc-persistent-drop-zone="true"]');
    expect(zone).not.toBeNull();
    expect(zone!.getAttribute('data-pkc-inactive')).toBe('true');
  });
});

describe('FI-04 auto-placement (ASSETS subfolder)', () => {
  function buildContainerWithFolderAndEntry(): Container {
    return {
      meta: { container_id: 'c1', title: 'Test', created_at: T, updated_at: T, schema_version: 1 },
      entries: [
        { lid: 'fld', title: 'Folder', archetype: 'folder', body: '', created_at: T, updated_at: T },
        { lid: 'note', title: 'Note', archetype: 'text', body: 'hi', created_at: T, updated_at: T },
      ],
      relations: [
        { id: 'r1', from: 'fld', to: 'note', kind: 'structural', created_at: T, updated_at: T },
      ],
      revisions: [],
      assets: {},
    };
  }

  function setupWithFolder(): ReturnType<typeof createDispatcher> {
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: buildContainerWithFolderAndEntry() });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);
    return dispatcher;
  }

  function structuralParentOf(container: Container, lid: string): string | null {
    for (const r of container.relations) {
      if (r.kind === 'structural' && r.to === lid) return r.from;
    }
    return null;
  }

  it('sidebar drop with selection inside a folder → file lands in <folder>/ASSETS', async () => {
    const dispatcher = setupWithFolder();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'note' });
    render(dispatcher.getState(), root);

    const zone = root.querySelector<HTMLElement>('[data-pkc-region="sidebar-file-drop-zone"]');
    expect(zone).not.toBeNull();

    const file = new File(['payload'], 'image.png', { type: 'image/png' });
    simulateDrop(zone!, [file]);

    await vi.waitFor(() => {
      const att = dispatcher.getState().container!.entries.find((e) => e.archetype === 'attachment');
      expect(att).toBeTruthy();
    }, { timeout: 3000 });

    const container = dispatcher.getState().container!;
    const att = container.entries.find((e) => e.archetype === 'attachment')!;
    const parentLid = structuralParentOf(container, att.lid);
    expect(parentLid).not.toBeNull();
    const parent = container.entries.find((e) => e.lid === parentLid);
    expect(parent?.archetype).toBe('folder');
    expect(parent?.title).toBe('ASSETS');
    // ASSETS itself is parented under the original folder
    expect(structuralParentOf(container, parentLid!)).toBe('fld');
  });

  it('sidebar drop with no selection → file lands at root (no auto-placement, no ASSETS)', async () => {
    const dispatcher = setupReady();
    const zone = root.querySelector<HTMLElement>('[data-pkc-region="sidebar-file-drop-zone"]');
    expect(zone).not.toBeNull();

    const file = new File(['payload'], 'orphan.txt', { type: 'text/plain' });
    simulateDrop(zone!, [file]);

    await vi.waitFor(() => {
      const att = dispatcher.getState().container!.entries.find((e) => e.archetype === 'attachment');
      expect(att).toBeTruthy();
    }, { timeout: 3000 });

    const container = dispatcher.getState().container!;
    const att = container.entries.find((e) => e.archetype === 'attachment')!;
    expect(structuralParentOf(container, att.lid)).toBeNull();
    // No ASSETS folder created at root level.
    expect(container.entries.find((e) => e.archetype === 'folder' && e.title === 'ASSETS')).toBeUndefined();
  });

  it('center-pane drop with explicit context-folder → file lands in <ctx>/ASSETS', async () => {
    const dispatcher = setupWithFolder();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'fld' });
    render(dispatcher.getState(), root);

    // The center-pane large drop zone resolves contextFolder via the
    // selected folder.
    const zone = root.querySelector<HTMLElement>('[data-pkc-region="file-drop-zone"]');
    expect(zone).not.toBeNull();
    expect(zone!.getAttribute('data-pkc-context-folder')).toBe('fld');

    const file = new File(['payload'], 'doc.pdf', { type: 'application/pdf' });
    simulateDrop(zone!, [file]);

    await vi.waitFor(() => {
      const att = dispatcher.getState().container!.entries.find((e) => e.archetype === 'attachment');
      expect(att).toBeTruthy();
    }, { timeout: 3000 });

    const container = dispatcher.getState().container!;
    const att = container.entries.find((e) => e.archetype === 'attachment')!;
    const parentLid = structuralParentOf(container, att.lid)!;
    const parent = container.entries.find((e) => e.lid === parentLid)!;
    expect(parent.archetype).toBe('folder');
    expect(parent.title).toBe('ASSETS');
    expect(structuralParentOf(container, parentLid)).toBe('fld');
  });

  it('duplicate file content still gets routed into ASSETS (dedupe is informational only)', async () => {
    const dispatcher = setupWithFolder();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'note' });
    render(dispatcher.getState(), root);

    const fileA = new File(['identical-bytes'], 'first.txt', { type: 'text/plain' });
    simulateDrop(
      root.querySelector<HTMLElement>('[data-pkc-region="sidebar-file-drop-zone"]')!,
      [fileA],
    );

    await vi.waitFor(() => {
      expect(
        dispatcher.getState().container!.entries.filter((e) => e.archetype === 'attachment').length,
      ).toBe(1);
    }, { timeout: 3000 });

    render(dispatcher.getState(), root);
    const fileB = new File(['identical-bytes'], 'second.txt', { type: 'text/plain' });
    simulateDrop(
      root.querySelector<HTMLElement>('[data-pkc-region="sidebar-file-drop-zone"]')!,
      [fileB],
    );

    await vi.waitFor(() => {
      expect(
        dispatcher.getState().container!.entries.filter((e) => e.archetype === 'attachment').length,
      ).toBe(2);
    }, { timeout: 3000 });

    const container = dispatcher.getState().container!;
    const attachments = container.entries.filter((e) => e.archetype === 'attachment');
    // Both files end up under the same `fld/ASSETS` folder (ASSETS reused
    // on the second drop, not duplicated).
    const parents = attachments.map((a) => structuralParentOf(container, a.lid));
    expect(new Set(parents).size).toBe(1);
    const assetsLid = parents[0]!;
    const assets = container.entries.find((e) => e.lid === assetsLid)!;
    expect(assets.title).toBe('ASSETS');
    // Exactly one ASSETS folder under `fld`.
    const assetsFolders = container.entries.filter(
      (e) => e.archetype === 'folder' && e.title === 'ASSETS',
    );
    expect(assetsFolders.length).toBe(1);
  });
});

describe('FI-05 regression (FI-04 must not break editing DnD)', () => {
  it('I-6: editing-phase DnD still inserts link into body textarea', async () => {
    const dispatcher = setupReady();

    dispatcher.dispatch({ type: 'CREATE_ENTRY', archetype: 'text', title: 'Doc' });
    render(dispatcher.getState(), root);

    const textarea = root.querySelector<HTMLTextAreaElement>('[data-pkc-field="body"]');
    expect(textarea).not.toBeNull();
    textarea!.focus();
    Object.defineProperty(document, 'activeElement', { value: textarea, configurable: true });

    const file = new File(['img'], 'photo.png', { type: 'image/png' });
    const editor = root.querySelector('[data-pkc-mode="edit"]') ?? root;
    simulateDrop(editor as HTMLElement, [file]);

    await vi.waitFor(() => {
      const ta = root.querySelector<HTMLTextAreaElement>('[data-pkc-field="body"]');
      expect(ta?.value).toContain('![photo.png](asset:');
    }, { timeout: 3000 });

    // Confirm this went through the editing path (no NEW attachment entry created in ready phase)
    expect(dispatcher.getState().phase).not.toBe('ready');
  });
});
