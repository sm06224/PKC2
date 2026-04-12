/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { bindActions, cleanupBlobUrls, populateInlineAssetPreviews, resolveContainerSandboxDefault } from '@adapter/ui/action-binder';
import { createDispatcher as _createRawDispatcher } from '@adapter/state/dispatcher';
import { render } from '@adapter/ui/renderer';
import { registerPresenter } from '@adapter/ui/detail-presenter';
import { attachmentPresenter } from '@adapter/ui/attachment-presenter';
import { textlogPresenter } from '@adapter/ui/textlog-presenter';
import { parseTextlogBody, serializeTextlogBody } from '@features/textlog/textlog-body';
import type { Container } from '@core/model/container';
import type { DomainEvent } from '@core/action/domain-event';

// Register the textlog presenter once so the renderer can draw textlog entries
// during these tests. Registration is idempotent.
registerPresenter('textlog', textlogPresenter);
registerPresenter('attachment', attachmentPresenter);

const mockContainer: Container = {
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
  revisions: [],
  assets: {},
};

let root: HTMLElement;
let cleanup: () => void;

// --- Stale-listener prevention infrastructure ---
// Every dispatcher.onState / onEvent subscription is auto-tracked here.
// The beforeEach teardown calls all accumulated unsubscribe functions,
// ensuring no stale listener can render into a subsequent test's root.
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
    for (const fn of _trackedUnsubs) fn();
    _trackedUnsubs.length = 0;
    root.remove();
  };
});

// NOTE: `setup()` helper is not used in this file — each describe bootstraps
// its own dispatcher + render fixture inline. The shared `root` / `cleanup` /
// `_trackedUnsubs` scaffolding above remains useful.


describe('Interactive task list — checkbox toggle', () => {
  function setupTextWithTasks() {
    const dispatcher = createDispatcher();
    const events: DomainEvent[] = [];
    dispatcher.onEvent((e) => events.push(e));
    dispatcher.onState((state) => render(state, root));

    const container: Container = {
      ...mockContainer,
      entries: [
        {
          lid: 'txt1',
          title: 'Tasks',
          body: '- [ ] Buy milk\n- [x] Write code\n- [ ] Deploy',
          archetype: 'text',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
    };

    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'txt1' });

    return { dispatcher, events };
  }

  function setupTextlogWithTasks() {
    const dispatcher = createDispatcher();
    const events: DomainEvent[] = [];
    dispatcher.onEvent((e) => events.push(e));
    dispatcher.onState((state) => render(state, root));

    const container: Container = {
      ...mockContainer,
      entries: [
        {
          lid: 'tl1',
          title: 'Log',
          body: serializeTextlogBody({
            entries: [
              { id: 'log1', text: '- [ ] Todo A\n- [x] Todo B', createdAt: '2026-01-01T00:00:00Z', flags: [] },
            ],
          }),
          archetype: 'textlog',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
    };

    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'tl1' });

    return { dispatcher, events };
  }

  it('TEXT: clicking a checkbox toggles the task in the body', () => {
    const { dispatcher } = setupTextWithTasks();

    // First checkbox should be unchecked (index 0)
    const checkbox = root.querySelector<HTMLInputElement>('input[data-pkc-task-index="0"]');
    expect(checkbox).not.toBeNull();

    checkbox!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const entry = dispatcher.getState().container!.entries[0]!;
    expect(entry.body).toContain('- [x] Buy milk');
    // Other tasks unchanged
    expect(entry.body).toContain('- [x] Write code');
    expect(entry.body).toContain('- [ ] Deploy');
  });

  it('TEXT: clicking a checked checkbox unchecks it', () => {
    const { dispatcher } = setupTextWithTasks();

    // Second checkbox (index 1) is checked
    const checkbox = root.querySelector<HTMLInputElement>('input[data-pkc-task-index="1"]');
    expect(checkbox).not.toBeNull();

    checkbox!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const entry = dispatcher.getState().container!.entries[0]!;
    expect(entry.body).toContain('- [ ] Write code');
  });

  it('TEXT: readonly prevents checkbox toggle', () => {
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));

    const container: Container = {
      ...mockContainer,
      entries: [
        {
          lid: 'txt1',
          title: 'Tasks',
          body: '- [ ] Buy milk',
          archetype: 'text',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
    };
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container, readonly: true });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'txt1' });

    const checkbox = root.querySelector<HTMLInputElement>('input[data-pkc-task-index="0"]');
    expect(checkbox).not.toBeNull();

    checkbox!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    // Body should be unchanged
    const entry = dispatcher.getState().container!.entries[0]!;
    expect(entry.body).toBe('- [ ] Buy milk');
  });

  it('TEXT: editing phase prevents checkbox toggle', () => {
    const { dispatcher } = setupTextWithTasks();

    // Enter editing
    dispatcher.dispatch({ type: 'BEGIN_EDIT', lid: 'txt1' });
    render(dispatcher.getState(), root);

    // Edit preview may contain checkboxes but they should be ignored
    const checkbox = root.querySelector<HTMLInputElement>('input[data-pkc-task-index="0"]');
    if (checkbox) {
      checkbox.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }

    // Body should remain unchanged
    const entry = dispatcher.getState().container!.entries[0]!;
    expect(entry.body).toBe('- [ ] Buy milk\n- [x] Write code\n- [ ] Deploy');
  });

  it('TEXTLOG: clicking a checkbox toggles the task in the log entry', () => {
    const { dispatcher } = setupTextlogWithTasks();

    const checkbox = root.querySelector<HTMLInputElement>('input[data-pkc-task-index="0"]');
    expect(checkbox).not.toBeNull();

    checkbox!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const entry = dispatcher.getState().container!.entries[0]!;
    const log = parseTextlogBody(entry.body);
    expect(log.entries[0]!.text).toContain('- [x] Todo A');
    // Other task unchanged
    expect(log.entries[0]!.text).toContain('- [x] Todo B');
  });

  it('TEXTLOG: unchecking works', () => {
    const { dispatcher } = setupTextlogWithTasks();

    // Second task (index 1) is checked
    const checkbox = root.querySelector<HTMLInputElement>('input[data-pkc-task-index="1"]');
    expect(checkbox).not.toBeNull();

    checkbox!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const entry = dispatcher.getState().container!.entries[0]!;
    const log = parseTextlogBody(entry.body);
    expect(log.entries[0]!.text).toContain('- [ ] Todo B');
  });

  it('does not fire on entries without task lists', () => {
    const dispatcher = createDispatcher();
    const events: DomainEvent[] = [];
    dispatcher.onEvent((e) => events.push(e));
    dispatcher.onState((state) => render(state, root));

    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: mockContainer });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });

    // No checkboxes should exist
    const checkbox = root.querySelector<HTMLInputElement>('input[data-pkc-task-index]');
    expect(checkbox).toBeNull();
  });

  it('rendered checkboxes have data-pkc-task-index attribute', () => {
    setupTextWithTasks();

    const checkboxes = root.querySelectorAll<HTMLInputElement>('input[data-pkc-task-index]');
    expect(checkboxes).toHaveLength(3);
    expect(checkboxes[0]!.getAttribute('data-pkc-task-index')).toBe('0');
    expect(checkboxes[1]!.getAttribute('data-pkc-task-index')).toBe('1');
    expect(checkboxes[2]!.getAttribute('data-pkc-task-index')).toBe('2');
  });
});

// ── Inline asset preview (non-image) ──

describe('populateInlineAssetPreviews', () => {
  // Helper: create a minimal attachment entry body JSON
  function attBody(name: string, mime: string, assetKey: string): string {
    return JSON.stringify({ name, mime, size: 1024, asset_key: assetKey });
  }

  // Helper: set up a dispatcher with attachment entries + assets and
  // a DOM root containing chip links inside a .pkc-md-rendered container.
  function setupInlinePreview(chips: { key: string; label: string }[], attachments: { key: string; mime: string; name: string }[]) {
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));

    const entries = attachments.map((att, i) => ({
      lid: `att-${i}`,
      title: att.name,
      body: attBody(att.name, att.mime, att.key),
      archetype: 'attachment' as const,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }));

    // Add a text entry whose rendered body will contain the chip links
    entries.push({
      lid: 'txt1',
      title: 'Test Text',
      body: 'plain text',
      archetype: 'text' as any,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    });

    const assets: Record<string, string> = {};
    for (const att of attachments) {
      // Minimal valid base64 (a few bytes)
      assets[att.key] = btoa('testdata');
    }

    const container: Container = {
      ...mockContainer,
      entries,
      assets,
    };

    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });
    render(dispatcher.getState(), root);

    // Manually create a .pkc-md-rendered container with chip links
    // (simulating what the renderer + asset resolver would produce)
    const mdContainer = document.createElement('div');
    mdContainer.className = 'pkc-md-rendered';
    for (const chip of chips) {
      const a = document.createElement('a');
      a.href = `#asset-${chip.key}`;
      a.textContent = chip.label;
      mdContainer.appendChild(a);
    }
    root.appendChild(mdContainer);

    return { dispatcher };
  }

  it('creates PDF preview with <object> element', () => {
    const { dispatcher } = setupInlinePreview(
      [{ key: 'k1', label: '📄 test.pdf' }],
      [{ key: 'k1', mime: 'application/pdf', name: 'test.pdf' }],
    );

    populateInlineAssetPreviews(root, dispatcher);

    const obj = root.querySelector('object.pkc-inline-pdf-preview');
    expect(obj).not.toBeNull();
    expect(obj!.getAttribute('type')).toBe('application/pdf');
    expect(obj!.getAttribute('data-pkc-blob-url')).toBeTruthy();
    // PDF fallback text
    expect(obj!.querySelector('p')?.textContent).toBe('PDF preview not available in this browser.');
  });

  it('does NOT hide chip for PDF (fallback unreliable)', () => {
    const { dispatcher } = setupInlinePreview(
      [{ key: 'k1', label: '📄 test.pdf' }],
      [{ key: 'k1', mime: 'application/pdf', name: 'test.pdf' }],
    );

    populateInlineAssetPreviews(root, dispatcher);

    const chip = root.querySelector<HTMLAnchorElement>('a[href="#asset-k1"]');
    expect(chip).not.toBeNull();
    // Chip should remain visible (style.display should NOT be 'none')
    expect(chip!.style.display).not.toBe('none');
  });

  it('creates audio preview with <audio> element', () => {
    const { dispatcher } = setupInlinePreview(
      [{ key: 'k2', label: '🎵 song.mp3' }],
      [{ key: 'k2', mime: 'audio/mpeg', name: 'song.mp3' }],
    );

    populateInlineAssetPreviews(root, dispatcher);

    const audio = root.querySelector('audio.pkc-inline-audio-preview');
    expect(audio).not.toBeNull();
    expect(audio!.getAttribute('controls')).not.toBeNull();
    expect(audio!.getAttribute('preload')).toBe('none');
    expect(audio!.getAttribute('data-pkc-blob-url')).toBeTruthy();
    expect(audio!.querySelector('source')).not.toBeNull();
  });

  it('hides chip for audio preview', () => {
    const { dispatcher } = setupInlinePreview(
      [{ key: 'k2', label: '🎵 song.mp3' }],
      [{ key: 'k2', mime: 'audio/mpeg', name: 'song.mp3' }],
    );

    populateInlineAssetPreviews(root, dispatcher);

    const chip = root.querySelector<HTMLAnchorElement>('a[href="#asset-k2"]');
    expect(chip!.style.display).toBe('none');
  });

  it('creates video preview with <video> element', () => {
    const { dispatcher } = setupInlinePreview(
      [{ key: 'k3', label: '🎬 clip.mp4' }],
      [{ key: 'k3', mime: 'video/mp4', name: 'clip.mp4' }],
    );

    populateInlineAssetPreviews(root, dispatcher);

    const video = root.querySelector('video.pkc-inline-video-preview');
    expect(video).not.toBeNull();
    expect(video!.getAttribute('controls')).not.toBeNull();
    expect(video!.getAttribute('preload')).toBe('none');
    expect(video!.getAttribute('data-pkc-blob-url')).toBeTruthy();
    expect(video!.querySelector('source')).not.toBeNull();
  });

  it('hides chip for video preview', () => {
    const { dispatcher } = setupInlinePreview(
      [{ key: 'k3', label: '🎬 clip.mp4' }],
      [{ key: 'k3', mime: 'video/mp4', name: 'clip.mp4' }],
    );

    populateInlineAssetPreviews(root, dispatcher);

    const chip = root.querySelector<HTMLAnchorElement>('a[href="#asset-k3"]');
    expect(chip!.style.display).toBe('none');
  });

  it('skips non-previewable MIME (archive)', () => {
    const { dispatcher } = setupInlinePreview(
      [{ key: 'k4', label: '🗜 data.zip' }],
      [{ key: 'k4', mime: 'application/zip', name: 'data.zip' }],
    );

    populateInlineAssetPreviews(root, dispatcher);

    // No preview element should be created
    expect(root.querySelector('[data-pkc-inline-preview]')).toBeNull();
    // Chip should remain visible
    const chip = root.querySelector<HTMLAnchorElement>('a[href="#asset-k4"]');
    expect(chip!.style.display).not.toBe('none');
  });

  it('skips chip when asset key has no matching attachment', () => {
    const { dispatcher } = setupInlinePreview(
      [{ key: 'no-such-key', label: '📎 missing' }],
      [], // no attachments
    );

    populateInlineAssetPreviews(root, dispatcher);

    expect(root.querySelector('[data-pkc-inline-preview]')).toBeNull();
  });

  it('skips chip when asset data is missing from container.assets', () => {
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));

    const container: Container = {
      ...mockContainer,
      entries: [
        {
          lid: 'att1',
          title: 'test.pdf',
          body: attBody('test.pdf', 'application/pdf', 'k-no-data'),
          archetype: 'attachment',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      assets: {}, // no data for k-no-data
    };

    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });
    render(dispatcher.getState(), root);

    const mdContainer = document.createElement('div');
    mdContainer.className = 'pkc-md-rendered';
    const a = document.createElement('a');
    a.href = '#asset-k-no-data';
    a.textContent = '📄 test.pdf';
    mdContainer.appendChild(a);
    root.appendChild(mdContainer);

    populateInlineAssetPreviews(root, dispatcher);

    expect(root.querySelector('[data-pkc-inline-preview]')).toBeNull();
  });

  it('wraps preview in div with data-pkc-inline-preview attribute', () => {
    const { dispatcher } = setupInlinePreview(
      [{ key: 'k5', label: '🎬 vid.webm' }],
      [{ key: 'k5', mime: 'video/webm', name: 'vid.webm' }],
    );

    populateInlineAssetPreviews(root, dispatcher);

    const wrapper = root.querySelector('[data-pkc-inline-preview]');
    expect(wrapper).not.toBeNull();
    expect(wrapper!.getAttribute('data-pkc-inline-preview')).toBe('video');
    expect(wrapper!.classList.contains('pkc-inline-preview')).toBe(true);
  });

  it('does not process chips inside edit-preview panes', () => {
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));

    const container: Container = {
      ...mockContainer,
      entries: [
        {
          lid: 'att1',
          title: 'test.mp4',
          body: attBody('test.mp4', 'video/mp4', 'k-edit'),
          archetype: 'attachment',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      assets: { 'k-edit': btoa('data') },
    };

    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });
    render(dispatcher.getState(), root);

    // Create a container with both pkc-md-rendered AND pkc-text-edit-preview
    const editPreview = document.createElement('div');
    editPreview.className = 'pkc-text-edit-preview pkc-md-rendered';
    const a = document.createElement('a');
    a.href = '#asset-k-edit';
    a.textContent = '🎬 test.mp4';
    editPreview.appendChild(a);
    root.appendChild(editPreview);

    populateInlineAssetPreviews(root, dispatcher);

    expect(root.querySelector('[data-pkc-inline-preview]')).toBeNull();
  });

  it('handles multiple chips of different types', () => {
    const { dispatcher } = setupInlinePreview(
      [
        { key: 'kp', label: '📄 doc.pdf' },
        { key: 'ka', label: '🎵 track.wav' },
        { key: 'kv', label: '🎬 movie.mp4' },
      ],
      [
        { key: 'kp', mime: 'application/pdf', name: 'doc.pdf' },
        { key: 'ka', mime: 'audio/wav', name: 'track.wav' },
        { key: 'kv', mime: 'video/mp4', name: 'movie.mp4' },
      ],
    );

    populateInlineAssetPreviews(root, dispatcher);

    const previews = root.querySelectorAll('[data-pkc-inline-preview]');
    expect(previews).toHaveLength(3);
    expect(previews[0]!.getAttribute('data-pkc-inline-preview')).toBe('pdf');
    expect(previews[1]!.getAttribute('data-pkc-inline-preview')).toBe('audio');
    expect(previews[2]!.getAttribute('data-pkc-inline-preview')).toBe('video');
  });

  it('cleanupBlobUrls revokes inline preview blob URLs', () => {
    const { dispatcher } = setupInlinePreview(
      [{ key: 'kc', label: '🎬 clip.mp4' }],
      [{ key: 'kc', mime: 'video/mp4', name: 'clip.mp4' }],
    );

    populateInlineAssetPreviews(root, dispatcher);

    const blobEl = root.querySelector<HTMLElement>('[data-pkc-blob-url]');
    expect(blobEl).not.toBeNull();
    const blobUrl = blobEl!.getAttribute('data-pkc-blob-url')!;

    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');
    cleanupBlobUrls(root);
    expect(revokeSpy).toHaveBeenCalledWith(blobUrl);
    revokeSpy.mockRestore();
  });

  it('does not double-populate if called twice', () => {
    const { dispatcher } = setupInlinePreview(
      [{ key: 'kd', label: '🎵 song.ogg' }],
      [{ key: 'kd', mime: 'audio/ogg', name: 'song.ogg' }],
    );

    populateInlineAssetPreviews(root, dispatcher);
    populateInlineAssetPreviews(root, dispatcher);

    const previews = root.querySelectorAll('[data-pkc-inline-preview]');
    expect(previews).toHaveLength(1);
  });

  it('sets correct source type on audio element', () => {
    const { dispatcher } = setupInlinePreview(
      [{ key: 'ks', label: '🎵 sound.wav' }],
      [{ key: 'ks', mime: 'audio/wav', name: 'sound.wav' }],
    );

    populateInlineAssetPreviews(root, dispatcher);

    const source = root.querySelector('audio.pkc-inline-audio-preview source');
    expect(source).not.toBeNull();
    expect(source!.getAttribute('type')).toBe('audio/wav');
  });

  it('sets correct source type on video element', () => {
    const { dispatcher } = setupInlinePreview(
      [{ key: 'kv2', label: '🎬 movie.webm' }],
      [{ key: 'kv2', mime: 'video/webm', name: 'movie.webm' }],
    );

    populateInlineAssetPreviews(root, dispatcher);

    const source = root.querySelector('video.pkc-inline-video-preview source');
    expect(source).not.toBeNull();
    expect(source!.getAttribute('type')).toBe('video/webm');
  });
});

// ── Container default sandbox policy ──

describe('resolveContainerSandboxDefault', () => {
  it('returns empty array for undefined (strict default)', () => {
    expect(resolveContainerSandboxDefault(undefined)).toEqual([]);
  });

  it('returns empty array for "strict"', () => {
    expect(resolveContainerSandboxDefault('strict')).toEqual([]);
  });

  it('returns allow-scripts + allow-forms for "relaxed"', () => {
    expect(resolveContainerSandboxDefault('relaxed')).toEqual(['allow-scripts', 'allow-forms']);
  });

  it('returns empty array for unknown/invalid values', () => {
    expect(resolveContainerSandboxDefault('invalid')).toEqual([]);
    expect(resolveContainerSandboxDefault('')).toEqual([]);
  });
});

describe('Container sandbox policy — reducer + UI', () => {
  it('SET_SANDBOX_POLICY updates container.meta.sandbox_policy', () => {
    const dispatcher = createDispatcher();
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: mockContainer });
    expect(dispatcher.getState().container?.meta.sandbox_policy).toBeUndefined();

    dispatcher.dispatch({ type: 'SET_SANDBOX_POLICY', policy: 'relaxed' });
    expect(dispatcher.getState().container?.meta.sandbox_policy).toBe('relaxed');
  });

  it('SET_SANDBOX_POLICY can switch back to strict', () => {
    const dispatcher = createDispatcher();
    const container: Container = {
      ...mockContainer,
      meta: { ...mockContainer.meta, sandbox_policy: 'relaxed' },
    };
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });
    expect(dispatcher.getState().container?.meta.sandbox_policy).toBe('relaxed');

    dispatcher.dispatch({ type: 'SET_SANDBOX_POLICY', policy: 'strict' });
    expect(dispatcher.getState().container?.meta.sandbox_policy).toBe('strict');
  });

  it('SET_SANDBOX_POLICY is blocked in readonly mode', () => {
    const dispatcher = createDispatcher();
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: mockContainer, readonly: true });

    dispatcher.dispatch({ type: 'SET_SANDBOX_POLICY', policy: 'relaxed' });
    // Should remain unchanged
    expect(dispatcher.getState().container?.meta.sandbox_policy).toBeUndefined();
  });

  it('SET_SANDBOX_POLICY updates container.meta.updated_at', () => {
    const dispatcher = createDispatcher();
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: mockContainer });
    const before = dispatcher.getState().container!.meta.updated_at;

    dispatcher.dispatch({ type: 'SET_SANDBOX_POLICY', policy: 'relaxed' });
    const after = dispatcher.getState().container!.meta.updated_at;
    expect(after).not.toBe(before);
  });

  it('sandbox policy select renders in meta pane for HTML attachment', () => {
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));

    const container: Container = {
      ...mockContainer,
      entries: [
        {
          lid: 'html1',
          title: 'Page',
          body: JSON.stringify({ name: 'page.html', mime: 'text/html', asset_key: 'k1' }),
          archetype: 'attachment',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      assets: { k1: btoa('<html></html>') },
    };

    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });
    render(dispatcher.getState(), root);
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'html1' });

    const select = root.querySelector<HTMLSelectElement>('[data-pkc-action="set-sandbox-policy"]');
    expect(select).not.toBeNull();
    expect(select!.value).toBe('strict');
  });

  it('sandbox policy select reflects current container policy', () => {
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));

    const container: Container = {
      ...mockContainer,
      meta: { ...mockContainer.meta, sandbox_policy: 'relaxed' },
      entries: [
        {
          lid: 'html1',
          title: 'Page',
          body: JSON.stringify({ name: 'page.html', mime: 'text/html', asset_key: 'k1' }),
          archetype: 'attachment',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      assets: { k1: btoa('<html></html>') },
    };

    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });
    render(dispatcher.getState(), root);
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'html1' });

    const select = root.querySelector<HTMLSelectElement>('[data-pkc-action="set-sandbox-policy"]');
    expect(select).not.toBeNull();
    expect(select!.value).toBe('relaxed');
  });

  it('backward compat: container without sandbox_policy works normally', () => {
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));

    // Container has no sandbox_policy field at all
    const container: Container = {
      ...mockContainer,
      entries: [
        {
          lid: 'html1',
          title: 'Page',
          body: JSON.stringify({ name: 'page.html', mime: 'text/html', asset_key: 'k1' }),
          archetype: 'attachment',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      assets: { k1: btoa('<html></html>') },
    };

    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });
    render(dispatcher.getState(), root);
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'html1' });

    // Select defaults to strict
    const select = root.querySelector<HTMLSelectElement>('[data-pkc-action="set-sandbox-policy"]');
    expect(select).not.toBeNull();
    expect(select!.value).toBe('strict');
  });
});

// ── Calendar/Kanban Multi-Select Phase 1: Click Routing ──
